import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useAuthStore, ensureAuthSubscription } from '../stores/authStore'
import { Button } from './ui/button'
import { Logo } from './Logo'
import { cn } from '@renderer/lib/utils'

// Full-bleed overlay that sits above the app shell until auth state is
// `signed-in`. Two main visual modes:
//
//   welcome      → signed-out / error / unknown — Sign in & Create account CTAs.
//   awaiting     → starting / awaiting-browser  — the "Continue in browser /
//                  Cancel sign-in" screen the user sketched.
//
// Custom protocol deeplinks short-circuit polling; on a fresh install the
// app polls until the website confirms the approval.

function formatCode(code: string): string {
  const upper = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (upper.length !== 8) return upper
  return `${upper.slice(0, 4)}-${upper.slice(4)}`
}

interface SignInGateProps {
  children: React.ReactNode
}

export function SignInGate({ children }: SignInGateProps): React.JSX.Element {
  const state = useAuthStore((s) => s.state)
  const hydrated = useAuthStore((s) => s.hydrated)
  const signIn = useAuthStore((s) => s.signIn)
  const cancel = useAuthStore((s) => s.cancel)
  const lastErrorRef = useRef<string | null>(null)

  useEffect(() => {
    return ensureAuthSubscription()
  }, [])

  const isSignedIn = state.kind === 'signed-in'
  const isAwaiting = state.kind === 'starting' || state.kind === 'awaiting-browser'

  const userCode = state.kind === 'awaiting-browser' ? formatCode(state.userCode) : null
  const linkUrl = state.kind === 'awaiting-browser' ? state.linkUrl : null

  useEffect(() => {
    if (state.kind !== 'error') {
      lastErrorRef.current = null
      return
    }
    if (lastErrorRef.current === state.message) return
    lastErrorRef.current = state.message
    toast.error('Sign-in failed', { description: state.message })
  }, [state])

  // Pre-hydrate: render a minimal background so we don't flash the Home
  // screen at unauthenticated users on cold boot.
  const showGate = !hydrated || !isSignedIn

  const reopenLink = useMemo(
    () => (): void => {
      if (linkUrl) {
        // Reuse the existing electron shell.openExternal through the chrome
        // window-open handler: a regular anchor click works because preload
        // already routes external URLs that way.
        const a = document.createElement('a')
        a.href = linkUrl
        a.target = '_blank'
        a.rel = 'noreferrer noopener'
        a.click()
      }
    },
    [linkUrl]
  )

  return (
    <>
      <div
        aria-hidden={!showGate}
        className={cn(
          'absolute inset-0 z-40 transition-opacity duration-200',
          showGate ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <div
          className="flex h-full w-full items-center justify-center bg-background text-foreground"
          // Only claim the drag region while the gate is actually visible.
          // `-webkit-app-region: drag` is an OS-level region that Electron keeps
          // active even when the element is `opacity-0 pointer-events-none` —
          // hiding via CSS does not remove it (only dropping the value does).
          // Left unconditional, this full-window z-40 overlay would keep eating
          // clicks app-wide after sign-in (terminal buttons, etc.).
          style={showGate ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : undefined}
        >
          {isAwaiting ? (
            <AwaitingBrowser
              code={userCode}
              onReopen={linkUrl ? reopenLink : undefined}
              onCancel={() => void cancel()}
            />
          ) : (
            <Welcome onSignIn={() => void signIn()} />
          )}
        </div>
      </div>
      {/* The app shell stays mounted so its state survives sign-in. The gate
          overlay simply covers it visually until auth resolves. */}
      {children}
    </>
  )
}

function Welcome({ onSignIn }: { onSignIn: () => void }): React.JSX.Element {
  return (
    <div
      className="flex w-full max-w-md flex-col items-center gap-8 px-6 text-center"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <Logo className="size-20" aria-hidden="true" />
      <div className="space-y-2">
        <h1 className="text-2xl font-medium tracking-tight">Welcome to Codeus</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with your Quantum Club account to start shipping.
        </p>
      </div>
      <div className="flex w-full flex-col gap-3">
        <Button size="lg" className="h-12 w-full rounded-full text-base" onClick={onSignIn}>
          Sign in
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="h-12 w-full rounded-full text-base"
          onClick={onSignIn}
        >
          Create an account
        </Button>
      </div>
    </div>
  )
}

function AwaitingBrowser({
  code,
  onReopen,
  onCancel
}: {
  code: string | null
  onReopen?: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <div
      className="flex w-full max-w-md flex-col items-center gap-8 px-6 text-center"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <Logo className="size-24" aria-hidden="true" />
      <div className="space-y-2">
        <h1 className="text-xl font-medium tracking-tight">
          Continue signing in with your browser
        </h1>
        {code ? (
          <p className="text-xs text-muted-foreground">
            Confirmation code:{' '}
            <span className="font-mono tracking-[0.2em] text-foreground/85">{code}</span>
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="h-12 w-full rounded-full bg-foreground/8 text-base text-foreground transition hover:bg-foreground/12"
      >
        Cancel sign-in
      </button>
      {onReopen ? (
        <button
          type="button"
          onClick={onReopen}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Browser didn&apos;t open? Click to reopen
        </button>
      ) : null}
    </div>
  )
}
