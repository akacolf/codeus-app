import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Code2,
  FolderTree,
  HelpCircle,
  KeyRound,
  MessagesSquare,
  PanelLeftOpen,
  Plus,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import type { Chat } from '@renderer/lib/chat'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import logoWhite from '../assets/logo-white.svg'
import { ChromeButton } from './Toolbar'

interface SidebarProps {
  open: boolean
  onClose: () => void
  chats: Chat[]
  activeChatId: string | null
  onSelectChat: (id: string) => void
  onNewChat: () => void
  onOpenSettings?: () => void
  onOpenShortcuts?: () => void
  onOpenAbout?: () => void
  onBack?: () => void
  onForward?: () => void
}

type DialogId = null | 'projects' | 'code' | 'customize'

const DIALOGS: Record<
  Exclude<DialogId, null>,
  { title: string; description: string; body: string }
> = {
  projects: {
    title: 'Projects',
    description: 'Group chats and files into research projects.',
    body: 'Projects are coming with the next milestone. Each project will bind a working directory, model defaults, and a shared memory to its chats.'
  },
  code: {
    title: 'Code',
    description: 'The editor surface that returns alongside the chat.',
    body: 'The Monaco-backed editor pane will reattach to the right of the chat once the agent loop lands. For now, drop files into the composer to share context.'
  },
  customize: {
    title: 'Customize',
    description: 'Personality, prompts, and palette presets.',
    body: 'A small set of system-prompt presets and an editable instruction block are next on the roadmap. The strict B&W palette is fixed by design.'
  }
}

export function Sidebar({
  open,
  onClose,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onOpenSettings,
  onOpenShortcuts,
  onOpenAbout,
  onBack,
  onForward
}: SidebarProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [dialog, setDialog] = useState<DialogId>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const recentsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return chats
    return chats.filter((c) => c.title.toLowerCase().includes(q))
  }, [chats, query])

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          'absolute inset-0 z-30 bg-black/40 transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />
      <aside
        aria-hidden={!open}
        className={cn(
          'absolute top-0 left-0 z-40 flex h-full w-72 flex-col bg-card transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div
          className="flex h-10 shrink-0 items-center gap-1 pr-2 pl-[84px]"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <ChromeButton label="Close sidebar" active onClick={onClose}>
            <PanelLeftOpen />
          </ChromeButton>
          <ChromeButton label="Back" onClick={onBack} disabled={!onBack}>
            <ArrowLeft />
          </ChromeButton>
          <ChromeButton label="Forward" onClick={onForward} disabled={!onForward}>
            <ArrowRight />
          </ChromeButton>
        </div>

        <div className="flex items-center gap-2 px-5 pt-3 pb-5">
          <img src={logoWhite} alt="" aria-hidden className="size-9" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-lg font-medium tracking-tight">QC Codium</span>
            <span className="text-[11px] text-muted-foreground">Research preview</span>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 px-2">
          <NavButton icon={Plus} label="New chat" onClick={onNewChat} />

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats"
              className="h-9 w-full rounded-lg bg-transparent pr-8 pl-9 text-sm outline-none placeholder:text-muted-foreground hover:bg-white/8 focus:bg-white/8"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('')
                  searchRef.current?.focus()
                }}
                className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-white/8 hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <NavButton
            icon={MessagesSquare}
            label="Chats"
            onClick={() => {
              setQuery('')
              recentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          />
          <NavButton icon={FolderTree} label="Projects" onClick={() => setDialog('projects')} />
          <NavButton icon={Code2} label="Code" onClick={() => setDialog('code')} />
          <NavButton
            icon={SlidersHorizontal}
            label="Customize"
            onClick={() => setDialog('customize')}
          />

          {expanded && (
            <>
              <NavButton
                icon={KeyRound}
                label="Keyboard shortcuts"
                onClick={() => onOpenShortcuts?.()}
                muted={!onOpenShortcuts}
              />
              <NavButton
                icon={SlidersHorizontal}
                label="Settings"
                onClick={() => onOpenSettings?.()}
                muted={!onOpenSettings}
              />
              <NavButton
                icon={HelpCircle}
                label="About QC Codium"
                onClick={() => onOpenAbout?.()}
                muted={!onOpenAbout}
              />
            </>
          )}

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-white/8 hover:text-foreground"
          >
            {expanded ? (
              <ChevronUp className="size-[18px]" />
            ) : (
              <ChevronDown className="size-[18px]" />
            )}
            <span>{expanded ? 'Less' : 'More'}</span>
          </button>
        </nav>

        <div ref={recentsRef} className="mt-4 flex min-h-0 flex-1 flex-col">
          <div className="flex items-baseline justify-between px-5 pb-2 text-xs text-muted-foreground">
            <span>{query ? 'Results' : 'Recents'}</span>
            {query && <span>{filtered.length}</span>}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto px-2">
            {filtered.length === 0 ? (
              <li className="px-3 py-1.5 text-sm text-muted-foreground/70">
                {query ? 'No matches' : 'No chats yet'}
              </li>
            ) : (
              filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelectChat(c.id)}
                    aria-current={c.id === activeChatId}
                    className={cn(
                      'block w-full truncate rounded-lg px-3 py-1.5 text-left text-sm text-foreground/85 hover:bg-white/8',
                      c.id === activeChatId && 'bg-white/8 text-foreground'
                    )}
                  >
                    {c.title || 'New chat'}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <button
          type="button"
          onClick={() => onOpenSettings?.()}
          disabled={!onOpenSettings}
          className="flex shrink-0 items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-white/5 disabled:cursor-default disabled:hover:bg-transparent"
        >
          <div className="inline-flex size-9 items-center justify-center rounded-full bg-white text-sm font-medium text-black">
            C
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm">akacolf</span>
            <span className="text-xs text-muted-foreground">Free plan</span>
          </div>
        </button>
      </aside>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          {dialog && (
            <>
              <DialogHeader>
                <DialogTitle>{DIALOGS[dialog].title}</DialogTitle>
                <DialogDescription>{DIALOGS[dialog].description}</DialogDescription>
              </DialogHeader>
              <p className="text-sm leading-relaxed text-foreground/85">{DIALOGS[dialog].body}</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function NavButton({
  icon: Icon,
  label,
  onClick,
  muted
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
  muted?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={muted}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground/90 hover:bg-white/8',
        muted && 'pointer-events-none opacity-40'
      )}
    >
      <Icon className="size-[18px] text-muted-foreground" />
      <span>{label}</span>
    </button>
  )
}
