import { Fragment, forwardRef, useEffect, useState } from 'react'
import {
  ChevronDown,
  Cloud,
  FolderOpen,
  GitBranch,
  Laptop,
  LayoutGrid,
  MessageCircle,
  Terminal
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { useSettings, type RuntimeMode } from '@renderer/lib/settings'
import { cn } from '@renderer/lib/utils'
import { Composer } from './Composer'

interface Suggestion {
  icon: React.ComponentType<{ className?: string }>
  label: string
  // If set, clicking the suggestion runs this side effect instead of filling
  // the composer draft.
  action?: 'open-connect-tool'
}

const SUGGESTIONS: Suggestion[] = [
  { icon: MessageCircle, label: 'Tour the repo and surface what to ship first' },
  { icon: MessageCircle, label: 'Draft today’s standup from yesterday’s commits' },
  { icon: GitBranch, label: 'Review my recent commits for risks and follow-ups' },
  {
    icon: LayoutGrid,
    label: 'Connect a tool — Linear, GitHub, Vercel',
    action: 'open-connect-tool'
  }
]

const GREETING_COUNT = 3

function renderGreeting(idx: number, name: string): React.ReactNode {
  if (idx === 1) return 'Build something great.'
  if (idx === 2) return 'Atoms have structurally built the larger whole.'
  if (!name) return 'What are we building?'
  return (
    <>
      What are we building, <span className="text-muted-foreground">{name}</span>?
    </>
  )
}

interface HomeProps {
  draft: string
  onDraftChange: (value: string) => void
  onSubmit: (text: string) => void
  onOpenTerminal?: () => void
  onReveal?: () => void
  onOpenConnectTool?: () => void
  onOpenGit?: () => void
  branch: string | null
  dirtyCount: number
}

function basename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return idx === -1 ? trimmed : trimmed.slice(idx + 1)
}

function tildeify(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~')
}

export function Home({
  draft,
  onDraftChange,
  onSubmit,
  onOpenTerminal,
  onReveal,
  onOpenConnectTool,
  onOpenGit,
  branch,
  dirtyCount
}: HomeProps): React.JSX.Element {
  const [greetingIdx] = useState(() => Math.floor(Math.random() * GREETING_COUNT))
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [osName, setOsName] = useState<string>('')
  const [recent, setRecent] = useState<string[]>([])
  const { settings } = useSettings()

  const refreshProjectInfo = (): void => {
    void window.api.projectCwd().then(setProjectPath)
    void window.api.project.recent().then(setRecent)
  }

  useEffect(() => {
    refreshProjectInfo()
    void window.api.osUserName().then(setOsName)
    return window.api.project.onChanged(() => refreshProjectInfo())
  }, [])

  const projectName = projectPath ? basename(projectPath) : '…'
  const projectDisplay = projectPath ? tildeify(projectPath) : ''
  const greetingName = settings.userName.trim() || osName

  const handleSuggestion = (s: Suggestion): void => {
    if (s.action === 'open-connect-tool') {
      onOpenConnectTool?.()
      return
    }
    onDraftChange(s.label)
  }

  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <div className="flex w-full max-w-2xl flex-col items-center">
        <h1 className="mb-10 text-center text-3xl font-normal tracking-tight">
          {renderGreeting(greetingIdx, greetingName)}
        </h1>

        <Composer draft={draft} onDraftChange={onDraftChange} onSubmit={onSubmit} autoFocus />

        <div className="mt-3 flex w-full items-center gap-1 px-2 text-xs text-muted-foreground">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ChipButton>
                <FolderOpen className="size-3.5" />
                {projectName}
                <ChevronDown className="size-3 opacity-60" />
              </ChipButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-muted-foreground">Project root</DropdownMenuLabel>
              <DropdownMenuItem disabled>
                <FolderOpen />
                <span className="truncate">{projectDisplay}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void window.api.project.pickFolder()}>
                <FolderOpen />
                <span>Open folder…</span>
              </DropdownMenuItem>
              {recent.filter((p) => p !== projectPath).length > 0 && (
                <>
                  <DropdownMenuLabel className="text-muted-foreground">Recent</DropdownMenuLabel>
                  {recent
                    .filter((p) => p !== projectPath)
                    .slice(0, 6)
                    .map((p) => (
                      <DropdownMenuItem key={p} onSelect={() => void window.api.project.setCwd(p)}>
                        <FolderOpen />
                        <span className="truncate">{tildeify(p)}</span>
                      </DropdownMenuItem>
                    ))}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onReveal?.()} disabled={!onReveal}>
                <FolderOpen />
                <span>Reveal in Finder</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenTerminal?.()} disabled={!onOpenTerminal}>
                <Terminal />
                <span>Open terminal here</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <RuntimeModeChip />

          {branch ? (
            <button
              type="button"
              onClick={() => onOpenGit?.()}
              disabled={!onOpenGit}
              title={`Source control · ${branch}${dirtyCount > 0 ? ` · ${dirtyCount} changed` : ''}`}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 transition-colors hover:bg-white/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <GitBranch className="size-3.5" />
              <span className="max-w-[10rem] truncate">{branch}</span>
              {dirtyCount > 0 && (
                <span className="rounded-full bg-white/12 px-1.5 py-0.5 text-[10px] text-foreground">
                  {dirtyCount}
                </span>
              )}
            </button>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5"
              title="This folder is not a git repository"
            >
              <GitBranch className="size-3.5" />
              <span className="text-muted-foreground/70">no repo</span>
            </span>
          )}
        </div>

        <ul className="mt-8 flex w-full flex-col">
          {SUGGESTIONS.map((s, i) => {
            const Icon = s.icon
            return (
              <Fragment key={s.label}>
                {i > 0 && <li role="presentation" className="h-px bg-white/8" />}
                <li>
                  <button
                    type="button"
                    onClick={() => handleSuggestion(s)}
                    className="flex w-full items-center gap-3 py-3.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Icon className="size-4 shrink-0 opacity-70" />
                    <span>{s.label}</span>
                  </button>
                </li>
              </Fragment>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function RuntimeModeChip(): React.JSX.Element {
  const { settings, set } = useSettings()
  const [hasCreds, setHasCreds] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    void window.api.sandbox.getCreds().then((r) => {
      if (cancelled) return
      setHasCreds(r.ok && r.configured)
      setChecking(false)
    })
    return (): void => {
      cancelled = true
    }
  }, [])

  const choose = (mode: RuntimeMode): void => {
    if (mode === 'cloud' && !hasCreds) return
    set('runtimeMode', mode)
  }

  const isCloud = settings.runtimeMode === 'cloud'

  return (
    <div className="inline-flex items-center rounded-full bg-white/5 p-0.5">
      <RuntimeModeOption
        active={!isCloud}
        onClick={() => choose('local')}
        icon={<Laptop className="size-3.5" />}
        label="Local"
        title="Run commands on this machine via node-pty"
      />
      <RuntimeModeOption
        active={isCloud}
        onClick={() => choose('cloud')}
        disabled={!hasCreds && !checking}
        icon={<Cloud className="size-3.5" />}
        label="Cloud"
        title={
          hasCreds
            ? 'Run commands inside a Vercel Sandbox microVM'
            : 'Add Vercel credentials in Settings to enable cloud sandbox'
        }
      />
    </div>
  )
}

function RuntimeModeOption({
  active,
  onClick,
  disabled,
  icon,
  label,
  title
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  icon: React.ReactNode
  label: string
  title: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors disabled:opacity-40',
        active
          ? 'bg-white text-black'
          : 'text-muted-foreground hover:bg-white/8 hover:text-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  )
}

const ChipButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function ChipButton({ children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        {...props}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground data-[state=open]:bg-white/8 data-[state=open]:text-foreground"
      >
        {children}
      </button>
    )
  }
)
