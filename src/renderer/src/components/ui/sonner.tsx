import type React from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

function Toaster(props: ToasterProps): React.JSX.Element {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      richColors={false}
      toastOptions={{
        classNames: {
          toast: 'group toast bg-popover text-popover-foreground shadow-2xl rounded-lg px-4 py-3',
          title: 'text-sm font-medium',
          description: 'text-xs text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground rounded-full px-3 py-1.5 text-xs',
          cancelButton: 'bg-secondary text-secondary-foreground rounded-full px-3 py-1.5 text-xs',
          closeButton: 'bg-popover text-muted-foreground hover:text-foreground'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
