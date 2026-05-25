import type React from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

function Toaster(props: ToasterProps): React.JSX.Element {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      richColors={false}
      // Sonner injects `border: 1px solid var(--normal-border)` with higher
      // specificity than the global `border-color: transparent` base layer, so
      // null out its border var to honor the no-border-lines product rule.
      style={{ '--normal-border': 'transparent' } as React.CSSProperties}
      toastOptions={{
        classNames: {
          toast:
            'group toast rounded-[22px] !border-0 !border-transparent !bg-secondary px-5 py-4 !text-secondary-foreground shadow-2xl [font-family:var(--qc-font-family)]',
          title: 'text-sm font-medium',
          description: 'text-xs text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground rounded-full px-3 py-1.5 text-xs',
          cancelButton: 'bg-secondary text-secondary-foreground rounded-full px-3 py-1.5 text-xs',
          closeButton: 'rounded-full bg-popover text-muted-foreground hover:text-foreground'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
