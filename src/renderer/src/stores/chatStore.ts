import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Chat, CommandApproval, Message, MessagePart, View } from '../lib/chat'
import { deriveTitle, genId, loadChats, saveChats } from '../lib/chat'
import type { InferenceSpeed, ModelId, WorkMode } from '../lib/settings'
import { recordChars, recordRequest } from '../lib/usage'
import { useBillingStore } from './billingStore'

export interface ChatSettingsSnapshot {
  model: ModelId
  workMode: WorkMode
  inferenceSpeed: InferenceSpeed
  projectCwd?: string
}

export interface QueuedMessage {
  chatId: string
  text: string
  settings: ChatSettingsSnapshot
}

interface ChatStore {
  chats: Chat[]
  history: View[]
  index: number
  // Pending follow-up messages keyed by chatId, used when followUpBehavior === 'queue'.
  queued: Record<string, QueuedMessage[]>

  navigate: (next: View) => void
  back: () => void
  forward: () => void
  newChat: () => void
  openEditor: () => void
  closeEditor: () => void
  openSettings: () => void
  closeSettings: () => void
  selectChat: (id: string) => void
  renameChat: (id: string, title: string) => void
  deleteChat: (id: string) => void
  clearAllChats: () => void

  sendMessage: (text: string, settings: ChatSettingsSnapshot) => void
  queueMessage: (text: string, settings: ChatSettingsSnapshot) => void
  cancelQueued: (chatId: string, index: number) => void
  editUserMessage: (
    chatId: string,
    messageId: string,
    text: string,
    settings: ChatSettingsSnapshot
  ) => void
  regenerate: (chatId: string, assistantMessageId: string, settings: ChatSettingsSnapshot) => void
  retryAfterError: (chatId: string, settings: ChatSettingsSnapshot) => void
  stopStreaming: (chatId?: string) => void
  respondToCommandApproval: (
    chatId: string,
    approvalId: string,
    decision: { approved: boolean; remember?: boolean; instruction?: string }
  ) => void
}

// One cancel handle per chat — concurrent streams in the same chat are not allowed;
// a new send cancels the previous in-flight stream for that chat.
const cancelByChatId = new Map<string, () => void>()

function findPrior(history: View[], index: number, predicate: (v: View) => boolean): View {
  for (let i = index - 1; i >= 0; i--) {
    if (predicate(history[i])) return history[i]
  }
  return { type: 'home' }
}

export const useChatStore = create<ChatStore>()(
  subscribeWithSelector((set, get) => ({
    chats: loadChats(),
    history: [{ type: 'home' }],
    index: 0,
    queued: {},

    navigate: (next) => {
      const { history, index } = get()
      set({ history: [...history.slice(0, index + 1), next], index: index + 1 })
    },

    back: () => set((s) => ({ index: Math.max(0, s.index - 1) })),

    forward: () => set((s) => ({ index: Math.min(s.history.length - 1, s.index + 1) })),

    newChat: () => {
      const { history, index } = get()
      if (history[index].type === 'home') return
      set({
        history: [...history.slice(0, index + 1), { type: 'home' }],
        index: index + 1
      })
    },

    openEditor: () => {
      const { history, index } = get()
      if (history[index].type === 'editor') return
      set({
        history: [...history.slice(0, index + 1), { type: 'editor' }],
        index: index + 1
      })
    },

    // Closing an overlay view (editor / settings) pops history back to the
    // most recent non-overlay view, or home if none exists. We push a new
    // entry rather than calling back(), so forward navigation still works.
    closeEditor: () => {
      const { history, index } = get()
      if (history[index].type !== 'editor') return
      const prior = findPrior(history, index, (v) => v.type !== 'editor')
      set({
        history: [...history.slice(0, index + 1), prior],
        index: index + 1
      })
    },

    openSettings: () => {
      const { history, index } = get()
      if (history[index].type === 'settings') return
      set({
        history: [...history.slice(0, index + 1), { type: 'settings' }],
        index: index + 1
      })
    },

    closeSettings: () => {
      const { history, index } = get()
      if (history[index].type !== 'settings') return
      const prior = findPrior(history, index, (v) => v.type !== 'settings')
      set({
        history: [...history.slice(0, index + 1), prior],
        index: index + 1
      })
    },

    selectChat: (id) => {
      const { history, index } = get()
      const view = history[index]
      if (view.type === 'chat' && view.chatId === id) return
      set({
        history: [...history.slice(0, index + 1), { type: 'chat', chatId: id }],
        index: index + 1
      })
    },

    renameChat: (id, title) => {
      const trimmed = title.trim()
      if (!trimmed) return
      set((s) => ({
        chats: s.chats.map((c) => (c.id === id ? { ...c, title: trimmed } : c))
      }))
    },

    clearAllChats: () => {
      for (const id of cancelByChatId.keys()) cancelChatStream(id)
      set({
        chats: [],
        history: [{ type: 'home' }],
        index: 0,
        queued: {}
      })
    },

    deleteChat: (id) => {
      cancelChatStream(id)
      set((s) => {
        const chats = s.chats.filter((c) => c.id !== id)
        const history = s.history.filter((v) => !(v.type === 'chat' && v.chatId === id))
        const trimmedHistory = history.length === 0 ? [{ type: 'home' as const }] : history
        const index = Math.min(s.index, trimmedHistory.length - 1)
        // Drop any pending queue entries for this chat.
        const queued = { ...s.queued }
        delete queued[id]
        return { chats, history: trimmedHistory, index, queued }
      })
    },

    respondToCommandApproval: (chatId, approvalId, decision) => {
      window.api.chat.respondToCommandApproval({ approvalId, ...decision })
      // "Yes, don't ask again" approves every queued command for this stream
      // in the main process, so drop the whole queue here instead of just the
      // card that was answered. Otherwise we surface them one at a time.
      const clearAll = decision.approved === true && decision.remember === true
      set((s) => ({
        chats: s.chats.map((c) =>
          c.id === chatId
            ? {
                ...c,
                commandApprovals: clearAll
                  ? undefined
                  : (c.commandApprovals ?? []).filter((a) => a.approvalId !== approvalId)
              }
            : c
        )
      }))
    },

    sendMessage: (text, settings) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const now = Date.now()
      const userMsg: Message = {
        id: genId(),
        role: 'user',
        text: trimmed,
        createdAt: now
      }

      const { history, index, chats } = get()
      const view = history[index]

      let chatId: string
      let nextHistory: Message[]

      if (view.type === 'chat') {
        chatId = view.chatId
        // If the current chat is mid-stream, cancel it before starting a new turn.
        cancelChatStream(chatId)
        const existing = chats.find((c) => c.id === chatId)
        // Drop any in-progress assistant placeholder from the cancelled stream.
        const prior = (existing?.messages ?? []).filter(
          (m) => m.id !== existing?.streamingMessageId
        )
        nextHistory = [...prior, userMsg]
        set({
          chats: chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: nextHistory,
                  error: undefined,
                  streamingMessageId: undefined,
                  commandApprovals: undefined
                }
              : c
          )
        })
      } else {
        // home or editor — start a fresh chat and navigate to it.
        const chat: Chat = {
          id: genId(),
          title: deriveTitle(trimmed),
          messages: [userMsg],
          createdAt: now,
          projectCwd: settings.projectCwd
        }
        chatId = chat.id
        nextHistory = [userMsg]
        set({
          chats: [chat, ...chats],
          history: [...history.slice(0, index + 1), { type: 'chat', chatId: chat.id }],
          index: index + 1
        })
      }

      startAssistantStream(chatId, nextHistory, settings)
    },

    editUserMessage: (chatId, messageId, text, settings) => {
      const trimmed = text.trim()
      if (!trimmed) return
      cancelChatStream(chatId)
      const { chats } = get()
      const chat = chats.find((c) => c.id === chatId)
      if (!chat) return
      const idx = chat.messages.findIndex((m) => m.id === messageId)
      if (idx < 0 || chat.messages[idx].role !== 'user') return

      const truncated: Message[] = [
        ...chat.messages.slice(0, idx),
        { ...chat.messages[idx], text: trimmed }
      ]
      set({
        chats: chats.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: truncated,
                error: undefined,
                streamingMessageId: undefined,
                commandApprovals: undefined
              }
            : c
        )
      })
      startAssistantStream(chatId, truncated, settings)
    },

    regenerate: (chatId, assistantMessageId, settings) => {
      cancelChatStream(chatId)
      const { chats } = get()
      const chat = chats.find((c) => c.id === chatId)
      if (!chat) return
      const idx = chat.messages.findIndex((m) => m.id === assistantMessageId)
      if (idx < 0 || chat.messages[idx].role !== 'assistant') return
      const truncated = chat.messages.slice(0, idx)
      set({
        chats: chats.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: truncated,
                error: undefined,
                streamingMessageId: undefined,
                commandApprovals: undefined
              }
            : c
        )
      })
      startAssistantStream(chatId, truncated, settings)
    },

    retryAfterError: (chatId, settings) => {
      cancelChatStream(chatId)
      const { chats } = get()
      const chat = chats.find((c) => c.id === chatId)
      if (!chat || !chat.error) return
      set({
        chats: chats.map((c) =>
          c.id === chatId ? { ...c, error: undefined, commandApprovals: undefined } : c
        )
      })
      startAssistantStream(chatId, chat.messages, settings)
    },

    stopStreaming: (chatId) => {
      if (chatId) {
        cancelChatStream(chatId)
        return
      }
      // Fallback: cancel current view's chat only — never all chats.
      const { history, index } = get()
      const view = history[index]
      if (view.type === 'chat') cancelChatStream(view.chatId)
    },

    queueMessage: (text, settings) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const { history, index } = get()
      const view = history[index]
      // Queueing only makes sense inside an active chat — fall back to send.
      if (view.type !== 'chat') {
        get().sendMessage(trimmed, settings)
        return
      }
      const chatId = view.chatId
      const entry: QueuedMessage = { chatId, text: trimmed, settings }
      set((s) => ({
        queued: { ...s.queued, [chatId]: [...(s.queued[chatId] ?? []), entry] }
      }))
    },

    cancelQueued: (chatId, idx) => {
      set((s) => {
        const list = s.queued[chatId]
        if (!list || idx < 0 || idx >= list.length) return s
        const next = [...list.slice(0, idx), ...list.slice(idx + 1)]
        const queued = { ...s.queued }
        if (next.length === 0) delete queued[chatId]
        else queued[chatId] = next
        return { queued }
      })
    }
  }))
)

function cancelChatStream(chatId: string): void {
  const cancel = cancelByChatId.get(chatId)
  if (cancel) {
    cancel()
    cancelByChatId.delete(chatId)
  }
}

function startAssistantStream(
  chatId: string,
  history: Message[],
  settings: ChatSettingsSnapshot
): void {
  const assistantId = genId()
  const requestId = genId()

  useChatStore.setState((s) => ({
    chats: s.chats.map((c) =>
      c.id === chatId
        ? {
            ...c,
            error: undefined,
            streamingMessageId: assistantId,
            messages: [
              ...c.messages,
              { id: assistantId, role: 'assistant', text: '', parts: [], createdAt: Date.now() }
            ]
          }
        : c
    )
  }))

  // Map a message's existing parts after applying `update`. Used by all stream
  // mutations so we never accidentally overwrite a parallel update path.
  const mutateMessage = (update: (m: Message) => Message): void => {
    useChatStore.setState((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId
          ? { ...c, messages: c.messages.map((m) => (m.id === assistantId ? update(m) : m)) }
          : c
      )
    }))
  }

  const appendDelta = (delta: string): void => {
    recordChars(delta.length)
    mutateMessage((m) => {
      const parts = m.parts ?? []
      const last = parts[parts.length - 1]
      const nextParts: MessagePart[] =
        last && last.kind === 'text'
          ? [...parts.slice(0, -1), { kind: 'text', text: last.text + delta }]
          : [...parts, { kind: 'text', text: delta }]
      return { ...m, text: m.text + delta, parts: nextParts }
    })
  }

  const onToolStart = (e: {
    toolCallId: string
    name: string
    args: unknown
    startedAt: number
  }): void => {
    mutateMessage((m) => {
      const parts = m.parts ?? []
      // Avoid duplicates if the same start event somehow lands twice.
      if (parts.some((p) => p.kind === 'tool' && p.toolCallId === e.toolCallId)) return m
      return {
        ...m,
        parts: [
          ...parts,
          {
            kind: 'tool',
            toolCallId: e.toolCallId,
            name: e.name,
            status: 'running',
            args: e.args,
            startedAt: e.startedAt
          }
        ]
      }
    })
  }

  const onToolEnd = (e: {
    toolCallId: string
    status: 'done' | 'error'
    result?: unknown
    error?: string
    durationMs: number
  }): void => {
    mutateMessage((m) => {
      const parts = m.parts ?? []
      return {
        ...m,
        parts: parts.map((p) =>
          p.kind === 'tool' && p.toolCallId === e.toolCallId
            ? {
                ...p,
                status: e.status,
                result: e.result,
                error: e.error,
                durationMs: e.durationMs
              }
            : p
        )
      }
    })
  }

  const onCommandApproval = (approval: CommandApproval): void => {
    useChatStore.setState((s) => ({
      chats: s.chats.map((c) => {
        if (c.id !== chatId) return c
        const existing = c.commandApprovals ?? []
        if (existing.some((a) => a.approvalId === approval.approvalId)) return c
        return { ...c, commandApprovals: [...existing, approval] }
      })
    }))
  }

  const finish = (errorMessage?: string): void => {
    // Only clear the handle if it's still pointing at this stream — a follow-up
    // send might have already installed a new one.
    if (cancelByChatId.get(chatId) === cancel) cancelByChatId.delete(chatId)
    // If a queued follow-up is waiting and the stream finished cleanly,
    // pop the next entry and kick off another turn. Errored / cancelled
    // streams discard their queue so the user can reassess.
    if (!errorMessage) {
      const pending = useChatStore.getState().queued[chatId] ?? []
      if (pending.length > 0) {
        const [next, ...rest] = pending
        useChatStore.setState((s) => {
          const queued = { ...s.queued }
          if (rest.length === 0) delete queued[chatId]
          else queued[chatId] = rest
          return { queued }
        })
        // Schedule the next send after the current finish state lands so the
        // streamingMessageId clearout doesn't race the new assistant placeholder.
        queueMicrotask(() => {
          useChatStore.getState().sendMessage(next.text, next.settings)
        })
      }
    } else if (errorMessage !== 'cancelled') {
      // Drop the queue on hard errors — the user should see the failure first.
      useChatStore.setState((s) => {
        if (!s.queued[chatId]) return s
        const queued = { ...s.queued }
        delete queued[chatId]
        return { queued }
      })
    }
    useChatStore.setState((s) => ({
      chats: s.chats.map((c) => {
        if (c.id !== chatId) return c
        // If a newer stream has already taken over this chat, leave its
        // streamingMessageId / commandApprovals untouched — but still
        // close out our own assistant message's running tools so the chip
        // doesn't spin forever.
        const isStillOurStream = c.streamingMessageId === assistantId
        const next: Chat = isStillOurStream
          ? { ...c, streamingMessageId: undefined, commandApprovals: undefined }
          : { ...c }
        // Any tool still 'running' when this stream ends was interrupted —
        // mark it as errored so the UI doesn't keep spinning.
        next.messages = c.messages.map((m) => {
          if (m.id !== assistantId || !m.parts) return m
          if (!m.parts.some((p) => p.kind === 'tool' && p.status === 'running')) return m
          return {
            ...m,
            parts: m.parts.map((p) =>
              p.kind === 'tool' && p.status === 'running'
                ? { ...p, status: 'error', error: errorMessage ?? 'interrupted' }
                : p
            )
          }
        })
        if (errorMessage) {
          // Only surface a chat-level error if we're still the active stream —
          // otherwise the newer turn already cleared `error` and we'd resurrect
          // a stale failure.
          if (errorMessage !== 'cancelled' && isStillOurStream) next.error = errorMessage
          // Drop an empty assistant placeholder that produced neither text nor tool calls.
          next.messages = next.messages.filter(
            (m) =>
              !(
                m.id === assistantId &&
                m.text.length === 0 &&
                (m.parts === undefined || m.parts.length === 0)
              )
          )
        }
        return next
      })
    }))
  }

  const MAX_LIVE_OUTPUT = 60_000

  const onToolProgress = (e: {
    toolCallId: string
    stream: 'stdout' | 'stderr'
    chunk: string
    truncated?: boolean
  }): void => {
    mutateMessage((m) => {
      const parts = m.parts ?? []
      return {
        ...m,
        parts: parts.map((p) => {
          if (p.kind !== 'tool' || p.toolCallId !== e.toolCallId) return p
          const field = e.stream === 'stdout' ? 'stdoutLive' : 'stderrLive'
          const prev = p[field] ?? ''
          // Cap live output to avoid ballooning renderer memory.
          const next = (prev + e.chunk).slice(-MAX_LIVE_OUTPUT)
          return {
            ...p,
            [field]: next,
            truncatedLive:
              p.truncatedLive || e.truncated || prev.length + e.chunk.length > MAX_LIVE_OUTPUT
          }
        })
      }
    })
  }

  recordRequest()
  const cancel = window.api.chat.start(
    {
      requestId,
      model: settings.model,
      workMode: settings.workMode,
      inferenceSpeed: settings.inferenceSpeed,
      messages: history.map((m) => ({ role: m.role, content: m.text }))
    },
    {
      onChunk: appendDelta,
      onTool: (e) => {
        if (e.kind === 'start') {
          onToolStart({
            toolCallId: e.toolCallId,
            name: e.name,
            args: e.args,
            startedAt: e.startedAt
          })
        } else if (e.kind === 'progress') {
          onToolProgress({
            toolCallId: e.toolCallId,
            stream: e.stream,
            chunk: e.chunk,
            truncated: e.truncated
          })
        } else {
          onToolEnd({
            toolCallId: e.toolCallId,
            status: e.status,
            result: e.result,
            error: e.error,
            durationMs: e.durationMs
          })
        }
      },
      onCommandApproval,
      onDone: () => finish(),
      onError: (m) => finish(m),
      onPaymentRequired: (envelope) => {
        // Proxy returned 402: pop the top-up dialog with the suggested amount
        // preselected. The stream still errors out shortly after — that's fine,
        // the user retries once their balance refills.
        useBillingStore.getState().openTopup(envelope)
        void useBillingStore.getState().refresh()
      },
      onUsageLimited: (limit) => {
        // Proxy returned 429: the plan's rolling cap is hit. Explain it instead
        // of popping the top-up dialog — though a top-up does raise the ceiling
        // (topped-up credit bypasses the cap), so we mention it. Refresh so the
        // usage ring reflects the maxed-out window immediately.
        const mins = Math.max(1, Math.round((limit.resetAt - Date.now()) / 60000))
        const when = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
        const scope = limit.window === '5h' ? '5-hour' : 'weekly'
        finish(
          `You've reached your plan's ${scope} usage limit. It resets in about ${when}. ` +
            `Top up to keep going right away — topped-up credit isn't capped.`
        )
        void useBillingStore.getState().refresh()
      }
    }
  )
  cancelByChatId.set(chatId, cancel)
}

// Persist chat list to localStorage, debounced — assistant deltas can land 30+ times
// per second during streaming, so writing on every change is wasteful.
let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastChats: Chat[] | null = null
useChatStore.subscribe(
  (s) => s.chats,
  (chats) => {
    lastChats = chats
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      if (lastChats) saveChats(lastChats)
    }, 400)
  }
)

// Flush on unload so the latest state survives.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (lastChats) saveChats(lastChats)
  })
}
