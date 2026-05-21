import { cn } from '@renderer/lib/utils'

function Kbd({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-foreground/8 px-1.5 font-mono text-[10px] font-medium text-foreground/85 select-none',
        className
      )}
    >
      {children}
    </kbd>
  )
}

export { Kbd }
