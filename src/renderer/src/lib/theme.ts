import { useEffect } from 'react'
import { useSettings, type ThemeId } from './settings'

export type ResolvedTheme = 'light' | 'dark'

const MEDIA_QUERY = '(prefers-color-scheme: dark)'

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return window.matchMedia(MEDIA_QUERY).matches
}

export function resolveTheme(id: ThemeId): ResolvedTheme {
  if (id === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return id
}

function apply(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.classList.toggle('light', resolved === 'light')
}

// Wire the renderer-side theme: applies the resolved class on mount and on any
// settings change, and re-resolves when the OS scheme flips while on `system`.
// Side-effect only — no React state, since callers don't need the resolved
// value (they read tokens via CSS) and avoiding setState here keeps the
// no-cascading-renders lint rule happy.
export function useThemeEffect(): void {
  const { settings } = useSettings()

  useEffect(() => {
    apply(resolveTheme(settings.theme))
  }, [settings.theme])

  useEffect(() => {
    if (settings.theme !== 'system') return
    const mq = window.matchMedia(MEDIA_QUERY)
    const onChange = (): void => apply(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return (): void => mq.removeEventListener('change', onChange)
  }, [settings.theme])
}
