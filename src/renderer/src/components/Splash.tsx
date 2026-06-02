import { useEffect, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { Logo } from './Logo'

interface SplashProps {
  durationMs?: number
  onDone: () => void
}

export function Splash({ durationMs = 1400, onDone }: SplashProps): React.JSX.Element {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const fadeOutAt = durationMs - 350
    const a = setTimeout(() => setLeaving(true), fadeOutAt)
    const b = setTimeout(onDone, durationMs)
    return (): void => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [durationMs, onDone])

  return (
    <div
      className={cn(
        'absolute inset-0 z-50 flex items-center justify-center bg-background',
        leaving ? 'opacity-0' : 'opacity-100'
      )}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <Logo aria-hidden="true" className="size-32" />
    </div>
  )
}
