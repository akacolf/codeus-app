import { Fragment, forwardRef, useCallback, useEffect, useState } from 'react'
import {
  Bug,
  ChevronDown,
  Cloud,
  Code2,
  FileText,
  FolderOpen,
  GitBranch,
  Laptop,
  MessageCircle,
  SearchCheck,
  Terminal,
  TestTube2
} from 'lucide-react'
import { useChatStore } from '@renderer/stores/chatStore'
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
}

interface GitCommit {
  hash: string
  subject: string
  author: string
  relativeDate: string
}

// Static fallback — only shown when there's no repo signal and the AI call
// hasn't produced anything (offline, signed out, or empty workspace).
const SUGGESTIONS: Suggestion[] = [
  { icon: MessageCircle, label: 'Tour the repo and surface what to ship first' },
  { icon: GitBranch, label: 'Review my recent commits for risks and follow-ups' },
  { icon: SearchCheck, label: 'Find the riskiest code and explain why' }
]

// Pick an icon that fits what the suggestion is actually about, so AI-generated
// prompts read with the same visual vocabulary as the static ones. Order
// matters — earlier matches win.
const ICON_RULES: { pattern: RegExp; icon: Suggestion['icon'] }[] = [
  { pattern: /\b(test|spec|coverage|vitest|jest)\b/i, icon: TestTube2 },
  { pattern: /\b(bug|fix|crash|error|fail|regression|broken)\b/i, icon: Bug },
  { pattern: /\b(review|audit|risk|inspect|check|verify|lint)\b/i, icon: SearchCheck },
  {
    pattern: /\b(commit|standup|changelog|release|ship|push|branch|rebase|merge)\b/i,
    icon: GitBranch
  },
  { pattern: /\b(doc|docs|readme|comment|summar|explain|instruction|note)\b/i, icon: FileText },
  { pattern: /\b(ci|workflow|pipeline|deploy|build|action)\b/i, icon: Bug },
  {
    pattern: /\b(refactor|implement|add|write|trace|wire|component|function|api|module|code)\b/i,
    icon: Code2
  }
]

function iconForLabel(label: string): Suggestion['icon'] {
  for (const { pattern, icon } of ICON_RULES) {
    if (pattern.test(label)) return icon
  }
  return MessageCircle
}

// Strip a conventional-commit prefix ("feat:", "ci(scope):") and trim length so
// a subject reads cleanly when embedded in a suggestion label.
function cleanSubject(subject: string, max = 56): string {
  let s = subject.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '').trim()
  if (!s) s = subject.trim()
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

function commitSuggestions(commits: GitCommit[], branch: string | null): Suggestion[] {
  if (commits.length === 0) return []
  const latest = cleanSubject(commits[0].subject)
  const out: Suggestion[] = []

  if (latest) {
    out.push({
      icon: GitBranch,
      label: `Pick up where the last commit left off — “${latest}”`
    })
  }
  if (commits.length >= 2) {
    const where = branch ? ` on ${branch}` : ''
    out.push({
      icon: SearchCheck,
      label: `Review the last ${commits.length} commits${where} for risks and follow-ups`
    })
    out.push({
      icon: MessageCircle,
      label: 'Draft a standup update from my recent commits'
    })
  }
  return out
}

function projectSuggestions(files: string[]): Suggestion[] {
  const has = (path: string): boolean => files.includes(path)
  const hasPrefix = (prefix: string): boolean => files.some((path) => path.startsWith(prefix))
  const suggestions: Suggestion[] = []

  if (has('AGENTS.md') || has('CLAUDE.md')) {
    suggestions.push({
      icon: FileText,
      label: 'Read the project instructions and summarize the product constraints'
    })
  }
  if (has('package.json') && (has('electron.vite.config.ts') || hasPrefix('src/main/'))) {
    suggestions.push({
      icon: Code2,
      label: 'Trace the Electron IPC and agent execution flow for release risks'
    })
  }
  if (hasPrefix('src/renderer/')) {
    suggestions.push({
      icon: SearchCheck,
      label: 'Audit the renderer UX for shipping blockers and polish gaps'
    })
  }
  if (hasPrefix('tests/') || has('bun.lock')) {
    suggestions.push({
      icon: TestTube2,
      label: 'Run the project checks and fix the first failing issue'
    })
  }
  if (hasPrefix('.github/workflows/')) {
    suggestions.push({
      icon: Bug,
      label: 'Inspect CI and prepare a clean release-readiness checklist'
    })
  }

  return suggestions
}

// Local heuristic fallback used instantly while the AI suggestions load (and if
// they fail). Leads with commit-aware prompts, then file heuristics, then the
// static set if neither has anything.
function buildSuggestions(
  files: string[],
  commits: GitCommit[],
  branch: string | null
): Suggestion[] {
  const merged = [...commitSuggestions(commits, branch), ...projectSuggestions(files)]
  if (merged.length === 0) return SUGGESTIONS

  const seen = new Set<string>()
  const deduped = merged.filter((s) => {
    if (seen.has(s.label)) return false
    seen.add(s.label)
    return true
  })

  return deduped.slice(0, 4)
}

// The user's "intents" — what they have recently asked the agent to do, drawn
// from their most recent chat titles. Read imperatively so the home screen does
// not re-render (or re-request suggestions) on every streaming chat update.
function recentIntents(): string[] {
  return useChatStore
    .getState()
    .chats.filter((c) => c.title.trim() && c.title.trim().toLowerCase() !== 'new chat')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8)
    .map((c) => c.title.trim())
}

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
  onOpenGit?: () => void
  branch: string | null
  dirtyCount: number
  showSuggestions: boolean
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
  onOpenGit,
  branch,
  dirtyCount,
  showSuggestions
}: HomeProps): React.JSX.Element {
  const [greetingIdx] = useState(() => Math.floor(Math.random() * GREETING_COUNT))
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [osName, setOsName] = useState<string>('')
  const [recent, setRecent] = useState<string[]>([])
  const [projectFiles, setProjectFiles] = useState<string[]>([])
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const { settings } = useSettings()

  const refreshProjectInfo = useCallback((): void => {
    void window.api.projectCwd().then(setProjectPath)
    void window.api.project.recent().then(setRecent)
    void window.api.fs.findFiles('', 120).then((res) => {
      setProjectFiles(res.ok ? res.files : [])
    })
    void window.api.git.recentCommits(10).then((res) => {
      setCommits(res.ok ? res.data.commits : [])
    })
  }, [])

  useEffect(() => {
    refreshProjectInfo()
    void window.api.osUserName().then(setOsName)
    return window.api.project.onChanged(() => refreshProjectInfo())
  }, [refreshProjectInfo])

  // Ask the model for prompts tailored to the current repo state + the user's
  // recent intents whenever the snapshot changes. Best-effort: on any failure
  // (offline, signed out, empty) we fall back to the local heuristics below.
  useEffect(() => {
    // When suggestions are disabled the list is hidden anyway, so leave any
    // existing state untouched rather than triggering a synchronous re-render.
    if (!showSuggestions) return
    let cancelled = false
    void window.api.suggest
      .home({
        headSha: commits[0]?.hash,
        branch,
        dirtyCount,
        commits: commits.map((c) => ({ subject: c.subject, relativeDate: c.relativeDate })),
        files: projectFiles,
        recentIntents: recentIntents()
      })
      .then((res) => {
        if (!cancelled) setAiSuggestions(res.ok ? res.suggestions : [])
      })
      .catch(() => {
        if (!cancelled) setAiSuggestions([])
      })
    return (): void => {
      cancelled = true
    }
  }, [showSuggestions, branch, dirtyCount, commits, projectFiles])

  const projectName = projectPath ? basename(projectPath) : '…'
  const projectDisplay = projectPath ? tildeify(projectPath) : ''
  const greetingName = settings.userName.trim() || osName
  const suggestions =
    aiSuggestions.length > 0
      ? aiSuggestions.map((label) => ({ icon: iconForLabel(label), label }))
      : buildSuggestions(projectFiles, commits, branch)

  const handleSuggestion = (s: Suggestion): void => {
    onDraftChange(s.label)
  }

  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <div className="flex w-full max-w-2xl flex-col items-center">
        <h1 className="mb-10 text-center text-3xl font-normal tracking-tight">
          {renderGreeting(greetingIdx, greetingName)}
        </h1>

        <Composer
          draft={draft}
          onDraftChange={onDraftChange}
          onSubmit={onSubmit}
          autoFocus
          mentionPlacement="below"
        />

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
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <GitBranch className="size-3.5" />
              <span className="max-w-[10rem] truncate">{branch}</span>
              {dirtyCount > 0 && (
                <span className="rounded-full bg-foreground/12 px-1.5 py-0.5 text-[10px] text-foreground">
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

        {showSuggestions && (
          <ul className="mt-8 flex w-full flex-col">
            {suggestions.map((s, i) => {
              const Icon = s.icon
              return (
                <Fragment key={s.label}>
                  {i > 0 && <li role="presentation" className="h-px bg-foreground/8" />}
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
        )}
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
    <div className="inline-flex items-center rounded-full bg-foreground/5 p-0.5">
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
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-foreground/8 hover:text-foreground'
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
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground data-[state=open]:bg-foreground/8 data-[state=open]:text-foreground"
      >
        {children}
      </button>
    )
  }
)
