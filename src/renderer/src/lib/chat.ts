export type Role = 'user' | 'assistant'

export type ToolStatus = 'running' | 'done' | 'error'

export interface ToolPart {
  kind: 'tool'
  toolCallId: string
  name: string
  status: ToolStatus
  args?: unknown
  result?: unknown
  error?: string
  startedAt: number
  durationMs?: number
}

export interface TextPart {
  kind: 'text'
  text: string
}

export type MessagePart = TextPart | ToolPart

export interface Message {
  id: string
  role: Role
  text: string
  /** Ordered parts for assistant messages — text segments interleaved with tool calls. */
  parts?: MessagePart[]
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

export type View =
  | { type: 'home' }
  | { type: 'chat'; chatId: string }
  | { type: 'editor' }
  | { type: 'settings' }

export function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function deriveTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > 40 ? t.slice(0, 40) + '…' : t
}

const STORAGE_KEY = 'qc-codeus.chats.v1'
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
