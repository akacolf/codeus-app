import { useEffect, useState } from 'react'
import { AlertCircle, Check, Download, RefreshCw, X } from 'lucide-react'
import { ConfirmDialog } from './ConfirmDialog'
import { isDirty, useWorkspaceStore } from '@renderer/stores/workspaceStore'

type UpdaterState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'not-available' }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string }

export function UpdateBanner(): React.JSX.Element | null {
  const [state, setState] = useState<UpdaterState>({ kind: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState(false)

  useEffect(() => {
    void window.api.updater.getState().then(setState)
    return window.api.updater.onState((s) => {
      setState(s)
      if (
        s.kind === 'ready' ||
        s.kind === 'downloading' ||
        s.kind === 'error' ||
        s.kind === 'not-available' ||
        s.kind === 'checking'
      ) {
        setDismissed(false)
      }
    })
  }, [])

  // Auto-dismiss the "up to date" confirmation so it doesn't linger after a
  // user-initiated check. Anything actionable (ready, downloading, error) stays.
  useEffect(() => {
    if (state.kind !== 'not-available') return
    const t = window.setTimeout(() => setDismissed(true), 4000)
    return () => window.clearTimeout(t)
  }, [state])

  const startRestart = (): void => {
    const open = useWorkspaceStore.getState().open
    if (open.some(isDirty)) {
      setConfirmRestart(true)
      return
    }
    void window.api.updater.quitAndInstall()
  }

  if (dismissed) return null

  if (state.kind === 'checking') {
    return (
      <Shell>
        <RefreshCw className="size-3.5 animate-spin opacity-70" />
        <span>Checking for updates…</span>
      </Shell>
    )
  }

  if (state.kind === 'not-available') {
    return (
      <Shell>
        <Check className="size-3.5 opacity-70" />
        <span>You’re up to date</span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-1 rounded-md p-0.5 opacity-60 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="size-3" />
        </button>
      </Shell>
    )
  }

  if (state.kind === 'downloading') {
    return (
      <Shell>
        <Download className="size-3.5 opacity-70" />
        <span>Downloading update… {state.percent}%</span>
      </Shell>
    )
  }

  if (state.kind === 'ready') {
    return (
      <>
        <Shell>
          <span className="truncate">Update {state.version} ready</span>
          <button
            type="button"
            onClick={startRestart}
            className="ml-2 flex items-center gap-1 rounded-md bg-foreground/10 px-2 py-0.5 text-xs font-medium hover:bg-foreground/15"
          >
            <RefreshCw className="size-3" />
            Restart
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="ml-1 rounded-md p-0.5 opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="size-3" />
          </button>
        </Shell>
        <ConfirmDialog
          open={confirmRestart}
          onOpenChange={setConfirmRestart}
          title="Restart with unsaved files?"
          description="You have unsaved changes in the editor. Restarting now will discard them."
          confirmLabel="Restart anyway"
          destructive
          onConfirm={() => void window.api.updater.quitAndInstall()}
        />
      </>
    )
  }

  if (state.kind === 'error') {
    return (
      <Shell>
        <AlertCircle className="size-3.5 opacity-70" />
        <span className="truncate">Update check failed</span>
        <button
          type="button"
          onClick={() => void window.api.updater.check()}
          className="ml-2 flex items-center gap-1 rounded-md bg-foreground/10 px-2 py-0.5 text-xs font-medium hover:bg-foreground/15"
        >
          <RefreshCw className="size-3" />
          Try again
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-1 rounded-md p-0.5 opacity-60 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="size-3" />
        </button>
      </Shell>
    )
  }

  return null
}

function Shell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-card/95 px-3 py-1.5 text-xs text-foreground/90 shadow-lg backdrop-blur">
      {children}
    </div>
  )
}
