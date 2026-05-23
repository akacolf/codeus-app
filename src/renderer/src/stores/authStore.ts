import { create } from 'zustand'
import type { AuthState } from '../../../preload/index'

// Renderer-side mirror of main's auth state machine. Subscribes once on
// first use of the store, so any component that reads `state` from this
// store gets live updates without managing IPC plumbing itself.

interface AuthStore {
  state: AuthState
  hydrated: boolean
  signIn: () => Promise<void>
  cancel: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthStore>(() => ({
  state: { kind: 'unknown' },
  hydrated: false,
  signIn: async () => {
    await window.api.auth.signIn()
  },
  cancel: async () => {
    await window.api.auth.cancel()
  },
  signOut: async () => {
    await window.api.auth.signOut()
  }
}))

// One-time wiring: subscribe to main-process broadcasts. Calling this from a
// top-level effect in App.tsx is sufficient — preload's onAuthState fires an
// auth:subscribe message that hands main a webContents to push updates to.
let wired = false
export function ensureAuthSubscription(): () => void {
  if (wired) return () => {}
  wired = true
  // Kick off an initial status pull so the store is populated even if the
  // main-process broadcast missed the renderer load window.
  void window.api.auth.status().then((state) => {
    useAuthStore.setState({ state, hydrated: true })
  })
  const unsub = window.api.auth.onState((state) => {
    useAuthStore.setState({ state, hydrated: true })
  })
  return (): void => {
    wired = false
    unsub()
  }
}
