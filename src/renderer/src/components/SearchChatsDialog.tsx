import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import type { Chat } from '@renderer/lib/chat'
import { cn } from '@renderer/lib/utils'
import { folderLabel } from '@renderer/lib/projects'

interface SearchChatsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chats: Chat[]
  activeChatId: string | null
  onSelectChat: (id: string) => void
}

export function SearchChatsDialog({
  open,
  onOpenChange,
  chats,
  activeChatId,
  onSelectChat
}: SearchChatsDialogProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleOpenChange = (next: boolean): void => {
    if (!next) setQuery('')
    onOpenChange(next)
  }

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 30)
      return (): void => window.clearTimeout(id)
    }
    return undefined
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return chats
    return chats.filter((c) => c.title.toLowerCase().includes(q))
  }, [chats, query])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Search chats</DialogTitle>
          <DialogDescription>Filter and open any past chat.</DialogDescription>
        </DialogHeader>

        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats"
              className="h-10 w-full rounded-lg bg-white/5 pr-9 pl-9 text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-white/8 hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-baseline justify-between px-5 pt-3 pb-1 text-[11px] text-muted-foreground">
          <span>{query ? 'Results' : 'Recent chats'}</span>
          <span>{filtered.length}</span>
        </div>

        <ul className="max-h-[60vh] min-h-[12rem] overflow-y-auto px-2 pb-3">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground/70">
              {query ? 'No matches' : 'No chats yet'}
            </li>
          ) : (
            filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectChat(c.id)
                    handleOpenChange(false)
                  }}
                  aria-current={c.id === activeChatId}
                  className={cn(
                    'flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-white/8',
                    c.id === activeChatId && 'bg-white/8'
                  )}
                >
                  <span className="truncate text-sm text-foreground/90">
                    {c.title || 'New chat'}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {folderLabel(c.projectCwd)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
