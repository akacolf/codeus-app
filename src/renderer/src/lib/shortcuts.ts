export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)

export const MOD = IS_MAC ? '⌘' : 'Ctrl'

export interface Shortcut {
  id: string
  label: string
  keys: string[]
}

export const SHORTCUTS: Shortcut[] = [
  { id: 'new-chat', label: 'New chat', keys: [MOD, 'N'] },
  { id: 'toggle-sidebar', label: 'Toggle sidebar', keys: [MOD, 'B'] },
  { id: 'search-chats', label: 'Search chats', keys: [MOD, 'K'] },
  { id: 'open-terminal', label: 'Open terminal', keys: [MOD, 'T'] },
  { id: 'reveal-in-folder', label: 'Reveal project in Finder', keys: [MOD, 'Shift', 'O'] },
  { id: 'open-settings', label: 'Open settings', keys: [MOD, ','] },
  { id: 'show-shortcuts', label: 'Show keyboard shortcuts', keys: [MOD, '/'] },
  { id: 'send-message', label: 'Send message', keys: ['Enter'] },
  { id: 'new-line', label: 'New line in composer', keys: ['Shift', 'Enter'] },
  { id: 'close-overlay', label: 'Close sidebar or dialog', keys: ['Esc'] }
]

export function shortcutsForSubmitMode(mode: 'enter' | 'mod-enter'): Shortcut[] {
  return SHORTCUTS.map((s) => {
    if (s.id === 'send-message') {
      return mode === 'mod-enter' ? { ...s, keys: [MOD, 'Enter'] } : { ...s, keys: ['Enter'] }
    }
    if (s.id === 'new-line') {
      return mode === 'mod-enter' ? { ...s, keys: ['Enter'] } : { ...s, keys: ['Shift', 'Enter'] }
    }
    return s
  })
}

export function shortcutById(id: string): Shortcut | undefined {
  return SHORTCUTS.find((s) => s.id === id)
}

export function matchShortcut(
  e: KeyboardEvent,
  spec: { key: string; mod?: boolean; shift?: boolean }
): boolean {
  if (spec.mod && !(e.metaKey || e.ctrlKey)) return false
  if (!spec.mod && (e.metaKey || e.ctrlKey)) return false
  if (spec.shift !== undefined && spec.shift !== e.shiftKey) return false
  return e.key.toLowerCase() === spec.key.toLowerCase()
}
