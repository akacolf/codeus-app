export type Role = 'user' | 'assistant'

export interface Message {
  id: string
  role: Role
  text: string
  createdAt: number
}

export interface Chat {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  projectCwd?: string
  streamingMessageId?: string
  error?: string
}

export type View = { type: 'home' } | { type: 'chat'; chatId: string }

export function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function deriveTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > 40 ? t.slice(0, 40) + '…' : t
}

const STORAGE_KEY = 'qc-codium.chats.v1'
const MAX_PERSISTED = 50

export function loadChats(): Chat[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Chat[]
    return parsed.map((c) => ({ ...c, streamingMessageId: undefined, error: undefined }))
  } catch {
    return []
  }
}

export function saveChats(chats: Chat[]): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = chats.slice(0, MAX_PERSISTED).map((c) => ({
      ...c,
      streamingMessageId: undefined,
      error: undefined
    }))
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    /* quota or serialization — ignore */
  }
}
