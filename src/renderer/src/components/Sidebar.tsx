import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  FolderTree,
  PanelLeftOpen,
  Plus,
  Search
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import type { Chat } from '@renderer/lib/chat'
import { groupChatsByProject } from '@renderer/lib/projects'
import logoWhite from '../assets/logo-white.svg'
import { ChromeButton } from './Toolbar'

interface SidebarProps {
  open: boolean
  onClose: () => void
  chats: Chat[]
  activeChatId: string | null
  onSelectChat: (id: string) => void
  onNewChat: () => void
  onOpenSearch: () => void
  onBack?: () => void
  onForward?: () => void
  trafficLightInset: boolean
}

export function Sidebar({
  open,
  onClose,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onOpenSearch,
  onBack,
  onForward,
  trafficLightInset
}: SidebarProps): React.JSX.Element {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const groups = useMemo(() => groupChatsByProject(chats), [chats])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggle = (key: string): void => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))

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
          className={cn(
            'flex h-10 shrink-0 items-center gap-1 pr-2',
            trafficLightInset ? 'pl-[84px]' : 'pl-3'
          )}
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
          <NavButton icon={Search} label="Search chats" onClick={onOpenSearch} />
        </nav>

        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 px-5 pb-2 text-xs text-muted-foreground">
            <FolderTree className="size-3.5" />
            <span>Projects</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {groups.length === 0 ? (
              <div className="px-3 py-1.5 text-sm text-muted-foreground/70">No chats yet</div>
            ) : (
              groups.map((g) => {
                const isCollapsed = collapsed[g.cwd] === true
                return (
                  <div key={g.cwd} className="mb-2 last:mb-0">
                    <button
                      type="button"
                      onClick={() => toggle(g.cwd)}
                      className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    >
                      <ChevronRight
                        className={cn('size-3 transition-transform', !isCollapsed && 'rotate-90')}
                      />
                      <span className="truncate">{g.label}</span>
                      <span className="ml-auto text-[10px]">{g.chats.length}</span>
                    </button>
                    {!isCollapsed && (
                      <ul className="mt-0.5 pl-2">
                        {g.chats.map((c) => (
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
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 px-3 py-3">
          <div className="inline-flex size-9 items-center justify-center rounded-full bg-white text-sm font-medium text-black">
            C
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm">akacolf</span>
            <span className="text-xs text-muted-foreground">Free plan</span>
          </div>
        </div>
      </aside>
    </>
  )
}

function NavButton({
  icon: Icon,
  label,
  onClick
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground/90 hover:bg-white/8"
    >
      <Icon className="size-[18px] text-muted-foreground" />
      <span>{label}</span>
    </button>
  )
}
