import { useCallback, useEffect, useState } from 'react'

export const PERMISSIONS = [
  { id: 'default', label: 'Default permissions', hint: 'Ask before risky actions' },
  { id: 'read-only', label: 'Read-only', hint: 'Browse without edits' },
  { id: 'auto', label: 'Auto-accept', hint: 'Trust all tool calls' }
] as const

export type PermissionId = (typeof PERMISSIONS)[number]['id']

export const MODELS = [
  { id: 'opus-4.7', label: 'Opus 4.7', hint: 'Strongest reasoning' },
  { id: 'sonnet-4.6', label: 'Sonnet 4.6', hint: 'Balanced everyday' },
  { id: 'haiku-4.5', label: 'Haiku 4.5', hint: 'Fastest, cheapest' }
] as const

export type ModelId = (typeof MODELS)[number]['id']

export type RuntimeMode = 'local' | 'cloud'

interface Settings {
  permission: PermissionId
  model: ModelId
  userName: string
  runtimeMode: RuntimeMode
}

const DEFAULTS: Settings = {
  permission: 'default',
  model: 'opus-4.7',
  userName: '',
  runtimeMode: 'local'
}

const KEY = 'qc-codeus.settings.v1'

function read(): Settings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return DEFAULTS
  }
}

let cache: Settings = read()
const listeners = new Set<(s: Settings) => void>()

function write(next: Settings): void {
  cache = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(next))
}

export function useSettings(): {
  settings: Settings
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
} {
  const [settings, setSettings] = useState<Settings>(cache)

  useEffect(() => {
    listeners.add(setSettings)
    return (): void => {
      listeners.delete(setSettings)
    }
  }, [])

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]): void => {
    write({ ...cache, [key]: value })
  }, [])

  return { settings, set }
}

export function modelById(id: ModelId): (typeof MODELS)[number] {
  return MODELS.find((m) => m.id === id) ?? MODELS[0]
}

export function permissionById(id: PermissionId): (typeof PERMISSIONS)[number] {
  return PERMISSIONS.find((p) => p.id === id) ?? PERMISSIONS[0]
}
