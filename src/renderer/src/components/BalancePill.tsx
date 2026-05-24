import { useEffect } from 'react'
import { Wallet } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { formatBalance, useBillingStore } from '@renderer/stores/billingStore'

export function BalancePill(): React.JSX.Element {
  const balanceMicros = useBillingStore((s) => s.balanceMicros)
  const freeCreditMicros = useBillingStore((s) => s.freeCreditMicros)
  const loading = useBillingStore((s) => s.loading)
  const activePlan = useBillingStore((s) => s.activePlan)
  const refresh = useBillingStore((s) => s.refresh)
  const openTopup = useBillingStore((s) => s.openTopup)

  useEffect(() => {
    void refresh()
    // Re-poll when the window regains focus — covers the case where the user
    // completed a top-up in their wallet and switched back. 30s background tick
    // is the steady-state cadence.
    const onFocus = (): void => void refresh()
    window.addEventListener('focus', onFocus)
    const interval = window.setInterval(() => void refresh(), 30000)
    return (): void => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(interval)
    }
  }, [refresh])

  const total =
    balanceMicros === null && freeCreditMicros === null
      ? null
      : (balanceMicros ?? 0) + (freeCreditMicros ?? 0)

  return (
    <button
      type="button"
      onClick={() => openTopup()}
      aria-label="Balance — click to top up"
      title={activePlan ? `Balance · ${activePlan.planId}` : 'Balance'}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors',
        'hover:bg-foreground/8 hover:text-foreground',
        loading && 'opacity-70'
      )}
    >
      <Wallet className="size-[14px]" />
      {activePlan ? <span className="hidden uppercase sm:inline">{activePlan.planId}</span> : null}
      <span className="tabular-nums">{formatBalance(total)}</span>
    </button>
  )
}
