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
import { Composer } from './Composer'

const SUGGESTIONS: Array<{ icon: React.ComponentType<{ className?: string }>; label: string }> = [
  { icon: MessageCircle, label: 'Tour the repo and surface what to ship first' },
  { icon: MessageCircle, label: 'Draft today’s standup from yesterday’s commits' },
  { icon: GitBranch, label: 'Review my recent commits for risks and follow-ups' },
  { icon: LayoutGrid, label: 'Connect a tool — Linear, GitHub, Vercel' }
]

const GREETING_COUNT = 3

function renderGreeting(idx: number): React.ReactNode {
  if (idx === 1) return 'Build something great.'
  if (idx === 2) return 'Atoms have structurally built the larger whole.'
  return (
    <>
      What are we building, <span className="text-muted-foreground">Colf</span>?
    </>
  )
}

interface HomeProps {
  onSubmit: (text: string) => void
  onOpenTerminal?: () => void
  onReveal?: () => void
}

function basename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return idx === -1 ? trimmed : trimmed.slice(idx + 1)
}

function tildeify(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~')
}

export function Home({ onSubmit, onOpenTerminal, onReveal }: HomeProps): React.JSX.Element {
  const [greetingIdx] = useState(() => Math.floor(Math.random() * GREETING_COUNT))
  const [projectPath, setProjectPath] = useState<string | null>(null)

  useEffect(() => {
    void window.api.projectCwd().then(setProjectPath)
  }, [])

  const projectName = projectPath ? basename(projectPath) : '…'
  const projectDisplay = projectPath ? tildeify(projectPath) : ''

  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <div className="flex w-full max-w-2xl flex-col items-center">
        <h1 className="mb-10 text-center text-3xl font-normal tracking-tight">
          {renderGreeting(greetingIdx)}
        </h1>

        <Composer onSubmit={onSubmit} />

        <div className="mt-3 flex w-full items-center gap-1 px-2 text-xs text-muted-foreground">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ChipButton>
                <FolderOpen className="size-3.5" />
                {projectName}
                <ChevronDown className="size-3 opacity-60" />
              </ChipButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-muted-foreground">Project root</DropdownMenuLabel>
              <DropdownMenuItem disabled>
                <FolderOpen />
                <span className="truncate">{projectDisplay}</span>
              </DropdownMenuItem>
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ChipButton>
                <Laptop className="size-3.5" />
                Work locally
                <ChevronDown className="size-3 opacity-60" />
              </ChipButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-muted-foreground">
                Execution context
              </DropdownMenuLabel>
              <DropdownMenuItem disabled>
                <Laptop />
                <span>Work locally</span>
                <span className="ml-auto text-[10px] text-muted-foreground">current</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Cloud />
                <span>Cloud sandbox</span>
                <span className="ml-auto text-[10px] text-muted-foreground">soon</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5">
            <GitBranch className="size-3.5" />
            main
          </span>
        </div>

        <ul className="mt-8 flex w-full flex-col">
          {SUGGESTIONS.map(({ icon: Icon, label }, i) => (
            <Fragment key={label}>
              {i > 0 && <li role="presentation" className="h-px bg-white/8" />}
              <li>
                <button
                  type="button"
                  onClick={() => onSubmit(label)}
                  className="flex w-full items-center gap-3 py-3.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Icon className="size-4 shrink-0 opacity-70" />
                  <span>{label}</span>
                </button>
              </li>
            </Fragment>
          ))}
        </ul>
      </div>
    </div>
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
