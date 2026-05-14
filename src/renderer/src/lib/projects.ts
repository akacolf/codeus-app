import type { Chat } from './chat'

export const UNGROUPED = '__ungrouped__'

export interface ProjectGroup {
  cwd: string
  label: string
  chats: Chat[]
}

export function folderLabel(cwd?: string): string {
  if (!cwd) return 'Chats'
  const normalized = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const last = normalized.split('/').pop()
  return last && last.length > 0 ? last : normalized
}

export function groupChatsByProject(chats: Chat[]): ProjectGroup[] {
  const order: string[] = []
  const buckets = new Map<string, Chat[]>()
  for (const c of chats) {
    const key = c.projectCwd ?? UNGROUPED
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(c)
  }
  return order.map((key) => ({
    cwd: key,
    label: key === UNGROUPED ? 'Chats' : folderLabel(key),
    chats: buckets.get(key)!
  }))
}
