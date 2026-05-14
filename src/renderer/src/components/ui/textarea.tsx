import * as React from 'react'

import { cn } from '@renderer/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>): React.JSX.Element {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-2xl bg-input px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
