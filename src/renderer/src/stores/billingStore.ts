import { create } from 'zustand'
import type { X402Envelope } from '../../../preload/index'

// USDC has 6 decimals on Base, but for ergonomics we settle on "micros" where
// 1_000_000 micros = $1. The proxy uses the same unit.
const MICROS_PER_DOLLAR = 1_000_000

export function microsToDollars(micros: number): number {
  return micros / MICROS_PER_DOLLAR
}

export function formatBalance(micros: number | null): string {
  if (micros === null) return '—'
  return `$${microsToDollars(micros).toFixed(2)}`
}

interface BillingStore {
  // null until first fetch resolves; remains null if the proxy doesn't yet
  // expose /balance (early days). Renders as em-dash in the toolbar pill.
  balanceMicros: number | null
  freeCreditMicros: number | null
  walletAddress: string | null
  activePlan: {
    planId: string
    status: 'active' | 'expired' | 'cancelled'
    currentPeriodStart: string
    currentPeriodEnd: string
    monthlyCreditMicros: number
  } | null
  loading: boolean
  lastError: string | null

  // Top-up dialog state. `envelope` is set when the chat stream surfaces a
  // 402 from the proxy — we auto-open the dialog with the proxy-suggested
  // amount preselected.
  topupOpen: boolean
  pendingEnvelope: X402Envelope | null

  refresh: () => Promise<void>
  openTopup: (envelope?: X402Envelope) => void
  closeTopup: () => void
}

export const useBillingStore = create<BillingStore>((set, get) => ({
  balanceMicros: null,
  freeCreditMicros: null,
  walletAddress: null,
  activePlan: null,
  loading: false,
  lastError: null,
  topupOpen: false,
  pendingEnvelope: null,

  refresh: async () => {
    if (get().loading) return
    set({ loading: true })
    const res = await window.api.billing.getBalance()
    if (res.ok) {
      set({
        balanceMicros: res.balanceMicros,
        freeCreditMicros: res.freeCreditMicros,
        walletAddress: res.walletAddress,
        activePlan: res.activePlan,
        loading: false,
        lastError: null
      })
    } else {
      // Proxy doesn't have /balance yet → keep balance null (UI shows em-dash)
      // and remember the error so the topup dialog can explain itself.
      set({ loading: false, lastError: res.error })
    }
  },

  openTopup: (envelope) => set({ topupOpen: true, pendingEnvelope: envelope ?? null }),
  closeTopup: () => set({ topupOpen: false, pendingEnvelope: null })
}))
