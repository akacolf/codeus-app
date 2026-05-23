import { ipcMain } from 'electron'
import { z } from 'zod'
import { getAuthHeader } from './identity'

// Wire contract with the quantum-club-website proxy. The proxy implementation
// lives in src/app/api/codeus/v1/{balance,topup}/route.ts over there.

const QC_PROXY_BASE_URL = process.env.QC_PROXY_BASE_URL || 'https://api.quantumclub.sh/v1'

const BalanceResponseSchema = z.object({
  balanceMicros: z.number().int().nonnegative(),
  freeCreditMicros: z.number().int().nonnegative(),
  walletAddress: z.string().nullable().optional()
})

const TopupQuoteResponseSchema = z.object({
  // x402 v2 payment requirement returned by /topup/quote, then settled after
  // the Base USDC transfer verifies.
  amountMicros: z.number().int().positive(),
  recipient: z.string(),
  network: z.literal('eip155:8453'),
  asset: z.literal('USDC'),
  // Browser link the renderer opens externally. The proxy decides the format.
  paymentUrl: z.string().url(),
  expiresAt: z.string()
})

export type BalanceResult =
  | { ok: true; balanceMicros: number; freeCreditMicros: number; walletAddress: string | null }
  | { ok: false; error: string }

export type TopupQuoteResult =
  | {
      ok: true
      amountMicros: number
      recipient: string
      network: 'eip155:8453'
      asset: 'USDC'
      paymentUrl: string
      expiresAt: string
    }
  | { ok: false; error: string }

async function fetchBalance(): Promise<BalanceResult> {
  try {
    const res = await fetch(`${QC_PROXY_BASE_URL}/balance`, {
      headers: { ...getAuthHeader() }
    })
    if (!res.ok) return { ok: false, error: `proxy ${res.status}` }
    const parsed = BalanceResponseSchema.safeParse(await res.json())
    if (!parsed.success) return { ok: false, error: 'invalid balance response' }
    return {
      ok: true,
      balanceMicros: parsed.data.balanceMicros,
      freeCreditMicros: parsed.data.freeCreditMicros,
      walletAddress: parsed.data.walletAddress ?? null
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

const TopupRequestSchema = z.object({
  amountMicros: z.number().int().positive().max(1_000_000_000) // hard ceiling of $1k per top-up — sanity, not policy
})

async function requestTopup(amountMicros: number): Promise<TopupQuoteResult> {
  try {
    const res = await fetch(`${QC_PROXY_BASE_URL}/topup/quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ amountMicros })
    })
    if (!res.ok) return { ok: false, error: `proxy ${res.status}` }
    const parsed = TopupQuoteResponseSchema.safeParse(await res.json())
    if (!parsed.success) return { ok: false, error: 'invalid topup response' }
    return { ok: true, ...parsed.data }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function registerBillingIpc(): void {
  ipcMain.handle('billing:getBalance', () => fetchBalance())
  ipcMain.handle('billing:requestTopup', (_event, raw: unknown) => {
    const parsed = TopupRequestSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'invalid amount' } satisfies TopupQuoteResult
    }
    return requestTopup(parsed.data.amountMicros)
  })
}
