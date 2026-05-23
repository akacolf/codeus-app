import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Code,
  Info,
  Keyboard,
  LogOut,
  PanelLeft,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  SquarePen,
  Terminal
} from 'lucide-react'
import { useTranslations } from 'use-intl'
import { cn } from '@renderer/lib/utils'
import { useAuthStore } from '@renderer/stores/authStore'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Kbd } from '@renderer/components/ui/kbd'
import { shortcutById } from '@renderer/lib/shortcuts'
import { BalancePill } from './BalancePill'
import { Logo } from './Logo'

interface ToolbarProps {
  sidebarOpen: boolean
  trafficLightInset?: boolean
  onToggleSidebar: () => void
  onBack?: () => void
  onForward?: () => void
  onCompose?: () => void
  onOpenEditor?: () => void
  editorActive?: boolean
  onOpenTerminal?: () => void
  onOpenSettings?: () => void
  onOpenShortcuts?: () => void
  onOpenAbout?: () => void
}

export function Toolbar({
  sidebarOpen,
  trafficLightInset = true,
  onToggleSidebar,
  onBack,
  onForward,
  onCompose,
  onOpenEditor,
  editorActive,
  onOpenTerminal,
  onOpenSettings,
  onOpenShortcuts,
  onOpenAbout
}: ToolbarProps): React.JSX.Element {
  const t = useTranslations('toolbar')
  const authState = useAuthStore((s) => s.state)
  const signOut = useAuthStore((s) => s.signOut)
  const signedIn = authState.kind === 'signed-in'
  const email = signedIn ? authState.email : null
  const ToggleIcon = sidebarOpen ? PanelLeftOpen : PanelLeft
  return (
    <div
      className={cn(
        'flex h-10 shrink-0 items-center gap-1 pr-3',
        trafficLightInset ? 'pl-[84px]' : 'pl-3'
      )}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <ChromeButton label="Toggle sidebar" active={sidebarOpen} onClick={onToggleSidebar}>
        <ToggleIcon />
      </ChromeButton>
      <ChromeButton label="Back" onClick={onBack} disabled={!onBack}>
        <ArrowLeft />
      </ChromeButton>
      <ChromeButton label="Forward" onClick={onForward} disabled={!onForward}>
        <ArrowRight />
      </ChromeButton>
      <ChromeButton label="New chat" onClick={onCompose} disabled={!onCompose}>
        <SquarePen />
      </ChromeButton>

      <div className="flex-1" />

      <ChromeButton
        label="Open editor"
        active={editorActive}
        onClick={onOpenEditor}
        disabled={!onOpenEditor}
      >
        <Code />
      </ChromeButton>

      <ChromeButton label="Open terminal" onClick={onOpenTerminal} disabled={!onOpenTerminal}>
        <Terminal />
      </ChromeButton>

      <BalancePill />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="QC Codeus menu"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground data-[state=open]:bg-foreground/8 data-[state=open]:text-foreground"
          >
            <Logo aria-hidden className="size-6" />
            <ChevronDown className="size-3.5 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="w-64">
          {email ? (
            <>
              <DropdownMenuLabel className="text-muted-foreground">Signed in as</DropdownMenuLabel>
              <DropdownMenuLabel className="-mt-1.5 truncate font-normal text-foreground">
                {email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          ) : (
            <DropdownMenuLabel className="text-muted-foreground">QC Codeus</DropdownMenuLabel>
          )}

          <DropdownMenuItem onSelect={() => onOpenShortcuts?.()} disabled={!onOpenShortcuts}>
            <Keyboard />
            <span>Keyboard shortcuts</span>
            <ShortcutHint id="show-shortcuts" />
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onOpenSettings?.()} disabled={!onOpenSettings}>
            <Settings />
            <span>{t('settings')}</span>
            <ShortcutHint id="open-settings" />
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => void window.api.updater.check()}>
            <RefreshCw />
            <span>Check for updates</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onOpenAbout?.()} disabled={!onOpenAbout}>
            <Info />
            <span>About QC Codeus</span>
          </DropdownMenuItem>

          {signedIn ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void signOut()}>
                <LogOut />
                <span>Sign out</span>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ShortcutHint({ id }: { id: string }): React.JSX.Element | null {
  const s = shortcutById(id)
  if (!s) return null
  return (
    <DropdownMenuShortcut className="flex items-center gap-0.5">
      {s.keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </DropdownMenuShortcut>
  )
}

interface ChromeButtonProps {
  label: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
}

function ChromeButton({
  label,
  active,
  disabled,
  onClick,
  children
}: ChromeButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
        'hover:bg-foreground/8 hover:text-foreground',
        'disabled:pointer-events-none disabled:opacity-30',
        active && 'bg-foreground/8 text-foreground',
        '[&_svg]:size-[15px]'
      )}
    >
      {children}
    </button>
  )
}

export { ChromeButton }
