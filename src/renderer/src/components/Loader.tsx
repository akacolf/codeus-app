import { cn } from '@renderer/lib/utils'
import { Logo } from './Logo'

interface LoaderProps {
  size?: number
  className?: string
  label?: string
}

export function Loader({ size = 40, className, label }: LoaderProps): React.JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Loading'}
      className={cn('inline-flex items-center justify-center', className)}
    >
      <Logo aria-hidden="true" style={{ width: size, height: size }} />
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  )
}

export function FullLoader({ label }: { label?: string }): React.JSX.Element {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loader size={64} label={label} />
    </div>
  )
}
