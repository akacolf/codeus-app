import { useEffect, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'

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

  useEffect(() => {
    void window.api.updater.getState().then(setState)
    return window.api.updater.onState((s) => {
      setState(s)
      if (s.kind === 'ready' || s.kind === 'downloading') setDismissed(false)
    })
  }, [])

  if (dismissed) return null

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
      <Shell>
        <span className="truncate">Update {state.version} ready</span>
        <button
          type="button"
          onClick={() => void window.api.updater.quitAndInstall()}
          className="ml-2 flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-xs font-medium hover:bg-white/15"
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
    )
  }

  return null
}

function Shell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-black/85 px-3 py-1.5 text-xs text-white/90 shadow-lg backdrop-blur">
      {children}
    </div>
  )
}
