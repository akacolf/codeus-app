import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Chat, Message, View } from '../lib/chat'
import { deriveTitle, genId, loadChats, saveChats } from '../lib/chat'
import type { ModelId } from '../lib/settings'

export interface ChatSettingsSnapshot {
  model: ModelId
  projectCwd?: string
}

interface ChatStore {
  chats: Chat[]
  history: View[]
  index: number

  navigate: (next: View) => void
  back: () => void
  forward: () => void
  newChat: () => void
  openEditor: () => void
  selectChat: (id: string) => void
  renameChat: (id: string, title: string) => void
  deleteChat: (id: string) => void

  sendMessage: (text: string, settings: ChatSettingsSnapshot) => void
  editUserMessage: (
    chatId: string,
    messageId: string,
    text: string,
    settings: ChatSettingsSnapshot
  ) => void
  regenerate: (chatId: string, assistantMessageId: string, settings: ChatSettingsSnapshot) => void
  retryAfterError: (chatId: string, settings: ChatSettingsSnapshot) => void
  stopStreaming: (chatId?: string) => void
}

// One cancel handle per chat — concurrent streams in the same chat are not allowed;
// a new send cancels the previous in-flight stream for that chat.
const cancelByChatId = new Map<string, () => void>()

export const useChatStore = create<ChatStore>()(
  subscribeWithSelector((set, get) => ({
    chats: loadChats(),
    history: [{ type: 'home' }],
    index: 0,

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

    deleteChat: (id) => {
      cancelChatStream(id)
      set((s) => {
        const chats = s.chats.filter((c) => c.id !== id)
        const history = s.history.filter((v) => !(v.type === 'chat' && v.chatId === id))
        const trimmedHistory = history.length === 0 ? [{ type: 'home' as const }] : history
        const index = Math.min(s.index, trimmedHistory.length - 1)
        return { chats, history: trimmedHistory, index }
      })
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
              ? { ...c, messages: nextHistory, error: undefined, streamingMessageId: undefined }
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
            ? { ...c, messages: truncated, error: undefined, streamingMessageId: undefined }
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
            ? { ...c, messages: truncated, error: undefined, streamingMessageId: undefined }
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
        chats: chats.map((c) => (c.id === chatId ? { ...c, error: undefined } : c))
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
              { id: assistantId, role: 'assistant', text: '', createdAt: Date.now() }
            ]
          }
        : c
    )
  }))

  const appendDelta = (delta: string): void => {
    useChatStore.setState((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantId ? { ...m, text: m.text + delta } : m
              )
            }
          : c
      )
    }))
  }

  const finish = (errorMessage?: string): void => {
    // Only clear the handle if it's still pointing at this stream — a follow-up
    // send might have already installed a new one.
    if (cancelByChatId.get(chatId) === cancel) cancelByChatId.delete(chatId)
    useChatStore.setState((s) => ({
      chats: s.chats.map((c) => {
        if (c.id !== chatId) return c
        const next: Chat = { ...c, streamingMessageId: undefined }
        if (errorMessage) {
          // Don't surface user-initiated cancellations as errors.
          if (errorMessage !== 'cancelled') next.error = errorMessage
          next.messages = c.messages.filter((m) => !(m.id === assistantId && m.text.length === 0))
        }
        return next
      })
    }))
  }

  const cancel = window.api.chat.start(
    {
      requestId,
      model: settings.model,
      messages: history.map((m) => ({ role: m.role, content: m.text }))
    },
    {
      onChunk: appendDelta,
      onDone: () => finish(),
      onError: (m) => finish(m)
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
