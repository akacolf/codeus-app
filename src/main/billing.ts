import { ipcMain } from 'electron'
import { z } from 'zod'
import { getSessionToken, onAuthRejected } from './auth'
import { getAccountId } from './identity'

// Wire contract with the quantum-club-website proxy. The proxy implementation
// lives in src/app/api/codeus/v1/{balance,topup}/route.ts over there.

const QC_PROXY_BASE_URL = process.env.QC_PROXY_BASE_URL || 'https://api.quantumclub.sh/v1'

const BalanceResponseSchema = z.object({
  balanceMicros: z.number().int().nonnegative(),
  freeCreditMicros: z.number().int().nonnegative(),
  walletAddress: z.string().nullable().optional(),
  activePlan: z
    .object({
      planId: z.string(),
      status: z.enum(['active', 'expired', 'cancelled']),
      currentPeriodStart: z.string(),
      currentPeriodEnd: z.string(),
      monthlyCreditMicros: z.number().int().nonnegative()
    })
    .nullable()
    .optional()
})

const PaymentChainSchema = z.enum(['base', 'solana'])
export type PaymentChain = z.infer<typeof PaymentChainSchema>

const TopupQuoteResponseSchema = z.object({
  // x402 v2 payment requirement returned by /topup/quote, then settled after
  // the on-chain USDC transfer verifies. `network` is a CAIP-2 id — Base
  // (eip155:8453) or Solana (solana:5eykt4…), keyed by `chain`.
  amountMicros: z.number().int().positive(),
  recipient: z.string(),
  network: z.string(),
  asset: z.literal('USDC'),
  chain: PaymentChainSchema,
  // Browser link the renderer opens externally. The proxy decides the format.
  paymentUrl: z.string().url(),
  expiresAt: z.string()
})

export type BalanceResult =
  | {
      ok: true
      balanceMicros: number
      freeCreditMicros: number
      walletAddress: string | null
      activePlan: {
        planId: string
        status: 'active' | 'expired' | 'cancelled'
        currentPeriodStart: string
        currentPeriodEnd: string
        monthlyCreditMicros: number
      } | null
    }
  | { ok: false; error: string }

export type TopupQuoteResult =
  | {
      ok: true
      amountMicros: number
      recipient: string
      network: string
      asset: 'USDC'
      chain: PaymentChain
      paymentUrl: string
      expiresAt: string
    }
  | { ok: false; error: string }

function authedHeaders(extra?: Record<string, string>): Record<string, string> | null {
  const token = getSessionToken()
  if (!token) return null
  return {
    Authorization: `Bearer ${token}`,
    'X-QC-Account': getAccountId(),
    ...(extra ?? {})
  }
}

async function fetchBalance(): Promise<BalanceResult> {
  const headers = authedHeaders()
  if (!headers) return { ok: false, error: 'signed out' }
  try {
    const res = await fetch(`${QC_PROXY_BASE_URL}/balance`, { headers })
    if (res.status === 401) {
      onAuthRejected()
      return { ok: false, error: 'signed out' }
    }
    if (!res.ok) return { ok: false, error: `proxy ${res.status}` }
    const parsed = BalanceResponseSchema.safeParse(await res.json())
    if (!parsed.success) return { ok: false, error: 'invalid balance response' }
    return {
      ok: true,
      balanceMicros: parsed.data.balanceMicros,
      freeCreditMicros: parsed.data.freeCreditMicros,
      walletAddress: parsed.data.walletAddress ?? null,
      activePlan: parsed.data.activePlan ?? null
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

const TopupRequestSchema = z.object({
  amountMicros: z.number().int().positive().max(1_000_000_000), // hard ceiling of $1k per top-up — sanity, not policy
  chain: PaymentChainSchema.default('base')
})

async function requestTopup(amountMicros: number, chain: PaymentChain): Promise<TopupQuoteResult> {
  const headers = authedHeaders({ 'content-type': 'application/json' })
  if (!headers) return { ok: false, error: 'signed out' }
  try {
    const res = await fetch(`${QC_PROXY_BASE_URL}/topup/quote`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ amountMicros, chain })
    })
    if (res.status === 401) {
      onAuthRejected()
      return { ok: false, error: 'signed out' }
    }
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
    return requestTopup(parsed.data.amountMicros, parsed.data.chain)
  })
}
