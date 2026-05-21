import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Upload
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { cn } from '@renderer/lib/utils'
import type { GitStatus, GitFileChange } from '../../../preload/index'

interface GitPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Busy = null | 'refresh' | 'checkout' | 'create' | 'commit' | 'push' | 'pull'

export function GitPanel({ open, onOpenChange }: GitPanelProps): React.JSX.Element {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [branchList, setBranchList] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const flashToast = (msg: string): void => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2500)
  }

  const refresh = useCallback(async (): Promise<void> => {
    setBusy('refresh')
    setError(null)
    const [s, b] = await Promise.all([window.api.git.status(), window.api.git.branches()])
    setStatus(s)
    if (b.ok) setBranchList(b.data.all)
    else setBranchList([])
    setBusy(null)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void refresh()
  }, [open, refresh])

  useEffect(() => {
    if (!open) return
    return window.api.project.onChanged(() => {
      void refresh()
    })
  }, [open, refresh])

  const dirty = useMemo(() => (status?.isRepo ? status.files : []), [status])
  const stagedCount = dirty.filter((f) => f.staged).length
  const unstagedCount = dirty.length - stagedCount

  const canCommit =
    status?.isRepo === true && dirty.length > 0 && message.trim().length > 0 && busy === null
  const canPush = status?.isRepo === true && status.hasRemote && busy === null

  const handleCheckout = async (name: string): Promise<void> => {
    if (!status?.isRepo || status.branch === name) return
    setBusy('checkout')
    setError(null)
    const r = await window.api.git.checkout(name)
    if (!r.ok) setError(r.error)
    else flashToast(`Switched to ${name}`)
    await refresh()
  }

  const handleCreateBranch = async (): Promise<void> => {
    const name = newBranch.trim()
    if (!name) return
    setBusy('create')
    setError(null)
    const r = await window.api.git.createBranch(name)
    if (!r.ok) setError(r.error)
    else {
      flashToast(`Created and switched to ${name}`)
      setNewBranch('')
      setCreatingBranch(false)
    }
    await refresh()
  }

  const handleCommit = async (thenPush = false): Promise<void> => {
    if (!canCommit) return
    setBusy('commit')
    setError(null)
    const r = await window.api.git.commit(message.trim(), true)
    if (!r.ok) {
      setError(r.error)
      setBusy(null)
      return
    }
    flashToast('Committed')
    setMessage('')
    if (thenPush) {
      setBusy('push')
      const upstream = status?.isRepo ? status.upstream : null
      const p = await window.api.git.push({ setUpstream: !upstream })
      if (!p.ok) setError(p.error)
      else flashToast('Pushed')
    }
    await refresh()
  }

  const handlePush = async (): Promise<void> => {
    if (!canPush || !status?.isRepo) return
    setBusy('push')
    setError(null)
    const r = await window.api.git.push({ setUpstream: !status.upstream })
    if (!r.ok) setError(r.error)
    else flashToast(status.upstream ? 'Pushed' : 'Pushed and set upstream')
    await refresh()
  }

  const handlePull = async (): Promise<void> => {
    setBusy('pull')
    setError(null)
    const r = await window.api.git.pull()
    if (!r.ok) setError(r.error)
    else flashToast('Pulled')
    await refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="size-4" />
            Source control
          </DialogTitle>
          <DialogDescription>
            Commit, push, switch branches, and create new ones — all in the active project.
          </DialogDescription>
        </DialogHeader>

        {status === null && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading…
          </div>
        )}

        {status && status.isRepo === false && (
          <div className="flex flex-col gap-2 py-3 text-sm text-foreground/85">
            <div className="flex items-center gap-2">
              <CircleAlert className="size-4 opacity-70" />
              This folder isn’t a git repository.
            </div>
            <p className="text-xs text-muted-foreground">
              Open a different project, or initialize a repo from the terminal (
              <code className="rounded bg-foreground/10 px-1 py-0.5">git init</code>) and refresh.
            </p>
            <div>
              <Button variant="ghost" size="sm" onClick={() => void refresh()} className="gap-1.5">
                <RefreshCw className="size-3.5" />
                Refresh
              </Button>
            </div>
          </div>
        )}

        {status?.isRepo === true && (
          <div className="flex flex-col gap-4">
            {/* Branch row */}
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full bg-foreground/8 px-3 py-1.5 text-xs hover:bg-foreground/12 disabled:opacity-50"
                  >
                    <GitBranch className="size-3.5" />
                    <span className="truncate">{status.branch ?? '(detached)'}</span>
                    <ChevronDown className="size-3 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
                  <DropdownMenuLabel className="text-muted-foreground">
                    Switch branch
                  </DropdownMenuLabel>
                  {branchList.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No branches</div>
                  )}
                  {branchList.map((b) => (
                    <DropdownMenuItem key={b} onSelect={() => void handleCheckout(b)}>
                      <GitBranch />
                      <span className="truncate">{b}</span>
                      {status.branch === b && <Check className="ml-auto size-3.5" />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setCreatingBranch(true)}>
                    <Plus />
                    <span>New branch…</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {status.upstream && (
                <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{status.upstream}</span>
                  {status.ahead > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <ArrowUp className="size-3" />
                      {status.ahead}
                    </span>
                  )}
                  {status.behind > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <ArrowDown className="size-3" />
                      {status.behind}
                    </span>
                  )}
                </span>
              )}

              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy !== null}
                  onClick={() => void refresh()}
                  className="gap-1.5"
                  title="Refresh"
                >
                  <RefreshCw className={cn('size-3', busy === 'refresh' && 'animate-spin')} />
                  Refresh
                </Button>
                {status.hasRemote && (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy !== null}
                    onClick={() => void handlePull()}
                    className="gap-1.5"
                    title="Pull (fast-forward only)"
                  >
                    <ArrowDown className="size-3" />
                    Pull
                  </Button>
                )}
              </div>
            </div>

            {creatingBranch && (
              <div className="flex items-center gap-2">
                <Input
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreateBranch()
                    if (e.key === 'Escape') {
                      setCreatingBranch(false)
                      setNewBranch('')
                    }
                  }}
                  placeholder="new-branch-name"
                  autoFocus
                  className="h-8 text-xs"
                />
                <Button
                  size="xs"
                  onClick={() => void handleCreateBranch()}
                  disabled={!newBranch.trim() || busy !== null}
                >
                  Create
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setCreatingBranch(false)
                    setNewBranch('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Changes */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Changes ({dirty.length})
                  {stagedCount > 0 && unstagedCount > 0 && (
                    <span className="ml-1.5">
                      · {stagedCount} staged, {unstagedCount} unstaged
                    </span>
                  )}
                </span>
                {dirty.length > 0 && (
                  <span className="text-[10px]">Commit stages everything (add -A)</span>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg bg-foreground/5 px-2 py-1.5">
                {dirty.length === 0 ? (
                  <div className="px-1 py-1 text-xs text-muted-foreground">Working tree clean</div>
                ) : (
                  <ul className="flex flex-col">
                    {dirty.map((f) => (
                      <FileRow key={f.path} change={f} />
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Commit */}
            <div className="flex flex-col gap-2">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={Math.min(6, Math.max(2, message.split('\n').length))}
                placeholder="Commit message"
                className="w-full resize-none rounded-lg bg-input px-3 py-2 text-sm leading-relaxed outline-none"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canCommit}
                  onClick={() => void handleCommit(false)}
                  className="gap-1.5"
                >
                  <Check className="size-3.5" />
                  Commit
                </Button>
                <Button
                  size="sm"
                  disabled={!canCommit || !status.hasRemote}
                  onClick={() => void handleCommit(true)}
                  className="gap-1.5"
                >
                  <Upload className="size-3.5" />
                  Commit & push
                </Button>
                <div className="ml-auto">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canPush || status.ahead === 0}
                    onClick={() => void handlePush()}
                    className="gap-1.5"
                    title={
                      !status.hasRemote
                        ? 'No remote configured'
                        : status.upstream
                          ? `Push to ${status.upstream}`
                          : 'Push and set upstream to origin'
                    }
                  >
                    <Upload className="size-3.5" />
                    Push {status.ahead > 0 ? `(${status.ahead})` : ''}
                  </Button>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-foreground/8 px-3 py-2 text-xs text-foreground/90">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 opacity-70" />
                <pre className="whitespace-pre-wrap font-sans">{error}</pre>
              </div>
            )}
            {toast && (
              <div className="rounded-lg bg-foreground/12 px-3 py-2 text-xs text-foreground/90">
                {toast}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function FileRow({ change }: { change: GitFileChange }): React.JSX.Element {
  const code = change.untracked ? '?' : change.staged ? change.index : change.worktree
  const label = labelFor(code)
  return (
    <li className="flex items-center gap-2 rounded px-1 py-0.5 text-xs">
      <span
        className={cn(
          'inline-flex w-4 shrink-0 justify-center font-mono',
          code === 'M' && 'text-foreground/80',
          code === 'A' && 'text-foreground',
          code === 'D' && 'text-foreground/60',
          code === '?' && 'text-muted-foreground'
        )}
        title={label}
      >
        {code}
      </span>
      <span className="truncate font-mono text-foreground/85">{change.path}</span>
    </li>
  )
}

function labelFor(code: string): string {
  switch (code) {
    case 'M':
      return 'modified'
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'U':
      return 'unmerged'
    case '?':
      return 'untracked'
    default:
      return code
  }
}
