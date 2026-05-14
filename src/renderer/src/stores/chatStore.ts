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
  selectChat: (id: string) => void
  renameChat: (id: string, title: string) => void
  deleteChat: (id: string) => void

  sendMessage: (text: string, settings: ChatSettingsSnapshot) => void
  stopStreaming: () => void
}

const cancelHandles = new Map<string, () => void>()

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
      const cancel = cancelHandles.get(id)
      if (cancel) {
        cancel()
        cancelHandles.delete(id)
      }
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

      if (view.type === 'home') {
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
      } else {
        chatId = view.chatId
        const existing = chats.find((c) => c.id === chatId)
        nextHistory = [...(existing?.messages ?? []), userMsg]
        set({
          chats: chats.map((c) =>
            c.id === chatId ? { ...c, messages: nextHistory, error: undefined } : c
          )
        })
      }

      startAssistantStream(chatId, nextHistory, settings)
    },

    stopStreaming: () => {
      cancelHandles.forEach((cancel) => cancel())
    }
  }))
)

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
    cancelHandles.delete(requestId)
    useChatStore.setState((s) => ({
      chats: s.chats.map((c) => {
        if (c.id !== chatId) return c
        const next: Chat = { ...c, streamingMessageId: undefined }
        if (errorMessage) {
          next.error = errorMessage
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
  cancelHandles.set(requestId, cancel)
}

useChatStore.subscribe(
  (s) => s.chats,
  (chats) => saveChats(chats)
)
