import { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { formatBalance, useBillingStore } from '@renderer/stores/billingStore'

const PRESETS_MICROS = [5_000_000, 10_000_000, 25_000_000, 50_000_000] // $5 / $10 / $25 / $50

interface QuoteState {
  paymentUrl: string
  amountMicros: number
  expiresAt: string
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
    if (pendingEnvelope?.amountMicros) setSelected(pendingEnvelope.amountMicros)
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
    setRequesting(true)
    setError(null)
    const res = await window.api.billing.requestTopup(selected)
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
            Pay in USDC on Base. Funds credit to your account as soon as the payment settles.
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

          <div className="grid grid-cols-4 gap-2">
            {PRESETS_MICROS.map((micros) => (
              <button
                key={micros}
                type="button"
                onClick={() => {
                  setSelected(micros)
                  setQuote(null)
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

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            QC Codeus charges per request based on model usage. Stripe payments are coming after we
            close incorporation &mdash; until then, crypto top-ups via x402 are the way in.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
