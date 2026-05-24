import { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { formatBalance, useBillingStore } from '@renderer/stores/billingStore'

const PRESETS_MICROS = [5_000_000, 10_000_000, 25_000_000, 50_000_000] // $5 / $10 / $25 / $50
const MAX_TOPUP_MICROS = 1_000_000_000
const TopupAmountSchema = z.number().int().positive().max(MAX_TOPUP_MICROS)

type PaymentChain = 'base' | 'solana'

const CHAINS: { id: PaymentChain; label: string }[] = [
  { id: 'base', label: 'Base' },
  { id: 'solana', label: 'Solana' }
]

interface QuoteState {
  paymentUrl: string
  amountMicros: number
  expiresAt: string
}

function parseAmountMicros(value: string): number | null {
  const normalized = value.trim().replace(/[$,\s]/g, '')
  if (!/^\d+(?:\.\d{0,6})?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  const micros = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'))
  const parsed = TopupAmountSchema.safeParse(micros)
  return parsed.success ? parsed.data : null
}

function formatAmountInput(micros: number): string {
  const whole = Math.floor(micros / 1_000_000)
  const fraction = (micros % 1_000_000).toString().padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : `${whole}`
}

function BaseIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="#00f"
        d="M3 4.706c0-.585 0-.877.11-1.101c.106-.215.28-.39.496-.495C3.83 3 4.122 3 4.706 3h14.588c.585 0 .876 0 1.101.11c.215.105.389.28.494.495c.111.225.111.517.111 1.101v14.588c0 .585 0 .876-.11 1.101c-.106.215-.28.389-.495.494c-.225.111-.517.111-1.101.111H4.706c-.585 0-.876 0-1.101-.11a1.08 1.08 0 0 1-.494-.495C3 20.17 3 19.878 3 19.294z"
      />
    </svg>
  )
}

function SolanaIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden className={className}>
      <g fill="none">
        <path
          fill="url(#qc-solana-top)"
          d="M18.413 7.902a.62.62 0 0 1-.411.163H3.58c-.512 0-.77-.585-.416-.928l2.369-2.284a.6.6 0 0 1 .41-.169H20.42c.517 0 .77.59.41.935z"
        />
        <path
          fill="url(#qc-solana-bottom)"
          d="M18.413 19.158a.62.62 0 0 1-.411.158H3.58c-.512 0-.77-.58-.416-.923l2.369-2.29a.6.6 0 0 1 .41-.163H20.42c.517 0 .77.586.41.928z"
        />
        <path
          fill="url(#qc-solana-middle)"
          d="M18.413 10.473a.62.62 0 0 0-.411-.158H3.58c-.512 0-.77.58-.416.923l2.369 2.29c.111.103.257.16.41.163H20.42c.517 0 .77-.586.41-.928z"
        />
        <defs>
          <linearGradient
            id="qc-solana-top"
            x1="3.001"
            x2="21.459"
            y1="55.041"
            y2="54.871"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#599db0" />
            <stop offset="1" stopColor="#47f8c3" />
          </linearGradient>
          <linearGradient
            id="qc-solana-bottom"
            x1="3.001"
            x2="21.341"
            y1="9.168"
            y2="9.027"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#c44fe2" />
            <stop offset="1" stopColor="#73b0d0" />
          </linearGradient>
          <linearGradient
            id="qc-solana-middle"
            x1="4.036"
            x2="20.303"
            y1="12.003"
            y2="12.003"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#778cbf" />
            <stop offset="1" stopColor="#5dcdc9" />
          </linearGradient>
        </defs>
      </g>
    </svg>
  )
}

export function TopupDialog(): React.JSX.Element {
  const open = useBillingStore((s) => s.topupOpen)
  const closeTopup = useBillingStore((s) => s.closeTopup)
  const refresh = useBillingStore((s) => s.refresh)
  const balanceMicros = useBillingStore((s) => s.balanceMicros)
  const freeCreditMicros = useBillingStore((s) => s.freeCreditMicros)
  const lastError = useBillingStore((s) => s.lastError)
  const pendingEnvelope = useBillingStore((s) => s.pendingEnvelope)

  const [selected, setSelected] = useState<number>(PRESETS_MICROS[1])
  const [amountInput, setAmountInput] = useState(() => formatAmountInput(PRESETS_MICROS[1]))
  const [chain, setChain] = useState<PaymentChain>('base')
  const [requesting, setRequesting] = useState(false)
  const [quote, setQuote] = useState<QuoteState | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Track prior values so we can run "adjust state during render" instead of
  // an effect — see https://react.dev/learn/you-might-not-need-an-effect
  // (Adjusting some state when a prop changes). Lint forbids setState in
  // useEffect for derivations like these.
  const [prevEnvelope, setPrevEnvelope] = useState(pendingEnvelope)
  const [prevOpen, setPrevOpen] = useState(open)

  if (pendingEnvelope !== prevEnvelope) {
    setPrevEnvelope(pendingEnvelope)
    if (pendingEnvelope?.amountMicros) {
      setSelected(pendingEnvelope.amountMicros)
      setAmountInput(formatAmountInput(pendingEnvelope.amountMicros))
    }
  }

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setQuote(null)
      setError(null)
      setRequesting(false)
    }
  }

  const requestQuote = async (): Promise<void> => {
    const amountMicros = parseAmountMicros(amountInput)
    if (!amountMicros) {
      setError('Enter a USDC amount between 0.000001 and 1000.')
      return
    }
    setSelected(amountMicros)
    setRequesting(true)
    setError(null)
    const res = await window.api.billing.requestTopup(amountMicros, chain)
    setRequesting(false)
    if (res.ok) {
      setQuote({
        paymentUrl: res.paymentUrl,
        amountMicros: res.amountMicros,
        expiresAt: res.expiresAt
      })
    } else {
      setError(res.error)
    }
  }

  const openPayment = (): void => {
    if (!quote) return
    window.open(quote.paymentUrl, '_blank', 'noopener,noreferrer')
    // Optimistic refresh — the proxy credits balance once the on-chain payment
    // settles, usually within a few seconds. The pill also re-polls on focus.
    window.setTimeout(() => void refresh(), 8000)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : closeTopup())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Top up balance</DialogTitle>
          <DialogDescription>
            Pay in USDC on {chain === 'solana' ? 'Solana' : 'Base'}. Funds credit to your account as
            soon as the payment settles.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-foreground/5 px-3 py-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Current balance</span>
              <span className="tabular-nums text-foreground">{formatBalance(balanceMicros)}</span>
            </div>
            {freeCreditMicros !== null && freeCreditMicros > 0 && (
              <div className="mt-1 flex justify-between text-muted-foreground">
                <span>Free credit</span>
                <span className="tabular-nums text-foreground">
                  {formatBalance(freeCreditMicros)}
                </span>
              </div>
            )}
          </div>

          {pendingEnvelope && (
            <p className="text-xs text-muted-foreground">
              Your last request hit a balance shortfall. Top up to continue.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {CHAINS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setChain(c.id)
                  setQuote(null)
                  setError(null)
                }}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors',
                  chain === c.id
                    ? 'bg-foreground text-background'
                    : 'bg-foreground/8 text-foreground hover:bg-foreground/15'
                )}
              >
                {c.id === 'base' ? (
                  <BaseIcon className="size-4 shrink-0" />
                ) : (
                  <SolanaIcon className="size-4 shrink-0" />
                )}
                {c.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {PRESETS_MICROS.map((micros) => (
              <button
                key={micros}
                type="button"
                onClick={() => {
                  setSelected(micros)
                  setAmountInput(formatAmountInput(micros))
                  setQuote(null)
                  setError(null)
                }}
                className={cn(
                  'rounded-md py-2 text-sm font-medium transition-colors',
                  selected === micros
                    ? 'bg-foreground text-background'
                    : 'bg-foreground/8 text-foreground hover:bg-foreground/15'
                )}
              >
                ${micros / 1_000_000}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Custom amount</span>
            <div className="relative">
              <Input
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value)
                  setSelected(parseAmountMicros(e.target.value) ?? 0)
                  setQuote(null)
                  setError(null)
                }}
                placeholder="25"
                className="pr-14 tabular-nums"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                USDC
              </span>
            </div>
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {!error && lastError && !quote && (
            <p className="text-xs text-muted-foreground">
              Payments aren&apos;t live yet &mdash; the proxy is reporting <code>{lastError}</code>.
            </p>
          )}

          {quote ? (
            <Button onClick={openPayment} className="gap-2">
              <ExternalLink className="size-4" />
              Pay {formatBalance(quote.amountMicros)} with wallet
            </Button>
          ) : (
            <Button onClick={requestQuote} disabled={requesting} className="gap-2">
              {requesting && <Loader2 className="size-4 animate-spin" />}
              Continue
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
