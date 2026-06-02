import { useEffect, useState } from 'react'
import { AlertCircle, Check, Download, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { ConfirmDialog } from './ConfirmDialog'
import { isDirty, useWorkspaceStore } from '@renderer/stores/workspaceStore'
import logoBlack from '../../../../resources/logo_black.svg'

type UpdaterState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'not-available' }
  | { kind: 'downloading'; percent: number; transferred?: number; total?: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string }

type PrimaryAction = {
  label: string
  onClick: () => void
  disabled?: boolean
}

const percentForState = (state: UpdaterState, installing: boolean): number | null => {
  if (installing) return 16
  if (state.kind === 'checking') return 26
  if (state.kind === 'available') return 100
  if (state.kind === 'not-available') return 100
  if (state.kind === 'downloading') return Math.max(2, Math.min(100, state.percent))
  if (state.kind === 'ready') return 100
  if (state.kind === 'error') return null
  return null
}

const formatBytes = (value?: number): string | null => {
  if (!Number.isFinite(value)) return null
  const mb = (value as number) / 1_000_000
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`
}

export function UpdateBanner(): React.JSX.Element | null {
  const [state, setState] = useState<UpdaterState>({ kind: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [installing, setInstalling] = useState(false)
  // false on macOS (unsigned builds can't self-install) - there we offer a
  // "Download" link to the website instead of an in-place restart.
  const [canSelfInstall, setCanSelfInstall] = useState(true)

  useEffect(() => {
    void window.api.updater.canSelfInstall().then(setCanSelfInstall)
    void window.api.updater.getState().then(setState)
    return window.api.updater.onState((s) => {
      setState(s)
      if (s.kind !== 'idle') setDismissed(false)
      if (s.kind !== 'ready') setInstalling(false)
    })
  }, [])

  useEffect(() => {
    if (state.kind !== 'not-available') return
    const t = window.setTimeout(() => setDismissed(true), 4000)
    return () => window.clearTimeout(t)
  }, [state])

  const dismiss = (): void => {
    if (state.kind === 'downloading') void window.api.updater.cancel()
    setDismissed(true)
  }

  const startRestart = (): void => {
    const open = useWorkspaceStore.getState().open
    if (open.some(isDirty)) {
      setConfirmRestart(true)
      return
    }
    setInstalling(true)
    void window.api.updater.quitAndInstall()
  }

  const retry = (): void => {
    setDismissed(false)
    void window.api.updater.check()
  }

  if (state.kind === 'idle' && !installing) return null

  const open = !dismissed
  const primaryAction = primaryActionForState({
    state,
    installing,
    canSelfInstall,
    dismiss,
    retry,
    startRestart
  })
  const percent = percentForState(state, installing)
  const title = installing ? 'Extracting update...' : titleForState(state, canSelfInstall)
  const detail = detailForState(state, canSelfInstall)
  const icon = iconForState(state, installing)
  const transferred = state.kind === 'downloading' ? formatBytes(state.transferred) : null
  const total = state.kind === 'downloading' ? formatBytes(state.total) : null
  const progressLabel = transferred && total ? `${transferred} of ${total}` : null

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) dismiss()
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="w-[min(92vw,720px)] gap-0 overflow-hidden rounded-[22px] bg-card p-0 shadow-2xl sm:max-w-none"
        >
          <div className="flex h-[52px] items-center justify-center bg-foreground/8 px-6">
            <DialogTitle className="text-xl font-semibold tracking-normal text-foreground/62">
              Updating QC Codeus
            </DialogTitle>
            <DialogDescription className="sr-only">{title}</DialogDescription>
          </div>

          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-6 px-9 py-8 sm:grid-cols-[112px_minmax(0,1fr)]">
            <div className="flex size-[88px] items-center justify-center rounded-[24px] bg-primary shadow-lg sm:size-[112px]">
              <img src={logoBlack} alt="" className="size-14 sm:size-[72px]" />
            </div>

            <div className="min-w-0 pt-2">
              <div className="flex items-center gap-2 text-2xl font-semibold text-foreground/92">
                {icon}
                <span className="truncate">{title}</span>
              </div>

              {percent !== null && (
                <div className="mt-7 h-2.5 w-full overflow-hidden rounded-full bg-foreground/15">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}

              <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-h-8 text-xl font-medium text-foreground/82">
                  {progressLabel ?? detail}
                </div>

                {primaryAction && (
                  <button
                    type="button"
                    onClick={primaryAction.onClick}
                    disabled={primaryAction.disabled}
                    className="h-10 min-w-40 rounded-lg bg-foreground/18 px-6 text-base font-semibold text-foreground/88 transition hover:bg-foreground/24 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {primaryAction.label}
                  </button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmRestart}
        onOpenChange={setConfirmRestart}
        title="Restart with unsaved files?"
        description="You have unsaved changes in the editor. Restarting now will discard them."
        confirmLabel="Restart anyway"
        destructive
        onConfirm={() => {
          setInstalling(true)
          void window.api.updater.quitAndInstall()
        }}
      />
    </>
  )
}

function titleForState(state: UpdaterState, canSelfInstall: boolean): string {
  if (state.kind === 'checking') return 'Checking for updates...'
  if (state.kind === 'available') {
    if (canSelfInstall) return `Preparing update ${state.version}...`
    return `Update ${state.version} available`
  }
  if (state.kind === 'not-available') return 'QC Codeus is up to date'
  if (state.kind === 'downloading') return 'Downloading update...'
  if (state.kind === 'ready') return `Update ${state.version} ready`
  if (state.kind === 'error') return 'Update check failed'
  return 'Updating QC Codeus'
}

function detailForState(state: UpdaterState, canSelfInstall: boolean): string {
  if (state.kind === 'checking') return 'Contacting the update server'
  if (state.kind === 'available') {
    if (canSelfInstall) return 'Starting download'
    return 'Download the latest build to update this Mac'
  }
  if (state.kind === 'not-available') return 'No update is available'
  if (state.kind === 'downloading') return `${state.percent}% complete`
  if (state.kind === 'ready') return 'Restart QC Codeus to finish installing'
  if (state.kind === 'error') return state.message
  return ''
}

function iconForState(state: UpdaterState, installing: boolean): React.ReactNode {
  if (installing || state.kind === 'checking') {
    return <RefreshCw className="size-5 shrink-0 animate-spin text-foreground/55" />
  }
  if (state.kind === 'available' || state.kind === 'downloading') {
    return <Download className="size-5 shrink-0 text-foreground/55" />
  }
  if (state.kind === 'not-available' || state.kind === 'ready') {
    return <Check className="size-5 shrink-0 text-foreground/55" />
  }
  if (state.kind === 'error') {
    return <AlertCircle className="size-5 shrink-0 text-foreground/55" />
  }
  return null
}

function primaryActionForState({
  state,
  installing,
  canSelfInstall,
  dismiss,
  retry,
  startRestart
}: {
  state: UpdaterState
  installing: boolean
  canSelfInstall: boolean
  dismiss: () => void
  retry: () => void
  startRestart: () => void
}): PrimaryAction | null {
  if (installing) return { label: 'Cancel', onClick: dismiss, disabled: true }
  if (state.kind === 'checking') return { label: 'Cancel', onClick: dismiss }
  if (state.kind === 'not-available') return { label: 'Done', onClick: dismiss }
  if (state.kind === 'downloading') return { label: 'Cancel', onClick: dismiss }
  if (state.kind === 'error') return { label: 'Try again', onClick: retry }
  if (state.kind === 'available') {
    if (canSelfInstall) return { label: 'Cancel', onClick: dismiss }
    return { label: 'Download', onClick: () => void window.api.updater.quitAndInstall() }
  }
  if (state.kind === 'ready') return { label: 'Restart', onClick: startRestart }
  return null
}
