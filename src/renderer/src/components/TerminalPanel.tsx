import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2, Plus, X } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { genId } from '@renderer/lib/chat'
import { cn } from '@renderer/lib/utils'

interface TerminalPanelProps {
  open: boolean
  onClose: () => void
}

const THEME = {
  background: '#000000',
  foreground: '#e6e6e6',
  cursor: '#ffffff',
  cursorAccent: '#000000',
  selectionBackground: 'rgba(255,255,255,0.20)',
  black: '#0a0a0a',
  red: '#e0e0e0',
  green: '#cfcfcf',
  yellow: '#f5f5f5',
  blue: '#bfbfbf',
  magenta: '#dcdcdc',
  cyan: '#cfcfcf',
  white: '#ffffff',
  brightBlack: '#5a5a5a',
  brightRed: '#f0f0f0',
  brightGreen: '#dcdcdc',
  brightYellow: '#ffffff',
  brightBlue: '#cfcfcf',
  brightMagenta: '#ebebeb',
  brightCyan: '#dcdcdc',
  brightWhite: '#ffffff'
} as const

interface Tab {
  id: string
  label: string
}

function defaultShellLabel(): string {
  if (typeof navigator === 'undefined') return 'shell'
  const platform = navigator.platform || ''
  if (/Win/i.test(platform)) return 'pwsh'
  if (/Mac/i.test(platform)) return 'zsh'
  return 'bash'
}

const DEFAULT_HEIGHT = 200
const MIN_HEIGHT = 120
const TOP_RESERVED = 40 // toolbar height — fullscreen fills everything below it
const HEIGHT_KEY = 'qc-codeus.terminal.height.v2'

function readSavedHeight(): number {
  if (typeof window === 'undefined') return DEFAULT_HEIGHT
  const raw = window.localStorage.getItem(HEIGHT_KEY)
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n >= MIN_HEIGHT ? n : DEFAULT_HEIGHT
}

export function TerminalPanel({ open, onClose }: TerminalPanelProps): React.JSX.Element {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [height, setHeight] = useState<number>(readSavedHeight)
  const [maxHeight, setMaxHeight] = useState<number>(
    typeof window === 'undefined' ? 720 : window.innerHeight - TOP_RESERVED
  )
  const [fullscreen, setFullscreen] = useState(false)
  const counterRef = useRef(0)

  // Lazy-create the first tab when the panel opens.
  useEffect(() => {
    if (open && tabs.length === 0) {
      const id = genId()
      counterRef.current = 1
      const label = `${defaultShellLabel()} 1`
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTabs([{ id, label }])
      setActiveId(id)
    }
  }, [open, tabs.length])

  // Track viewport so the drag clamp + fullscreen stay correct on window resize.
  useEffect(() => {
    const onResize = (): void => setMaxHeight(window.innerHeight - TOP_RESERVED)
    window.addEventListener('resize', onResize)
    return (): void => window.removeEventListener('resize', onResize)
  }, [])

  // Persist height (only the non-fullscreen one).
  useEffect(() => {
    try {
      window.localStorage.setItem(HEIGHT_KEY, String(height))
    } catch {
      /* ignore */
    }
  }, [height])

  const addTab = (): void => {
    counterRef.current += 1
    const id = genId()
    const label = `${defaultShellLabel()} ${counterRef.current}`
    setTabs((t) => [...t, { id, label }])
    setActiveId(id)
  }

  const closeTab = (id: string): void => {
    // Compute next state up-front so we never call a state setter from inside
    // another setter (StrictMode warns; future React may break).
    const current = tabs
    const next = current.filter((t) => t.id !== id)
    if (next.length === 0) {
      setTabs(next)
      setActiveId(null)
      queueMicrotask(onClose)
      return
    }
    let nextActive = activeId
    if (id === activeId) {
      const idx = current.findIndex((t) => t.id === id)
      nextActive = next[Math.min(idx, next.length - 1)].id
    }
    setTabs(next)
    if (nextActive !== activeId) setActiveId(nextActive)
  }

  const onResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (fullscreen) return
      e.preventDefault()
      const startY = e.clientY
      const startHeight = height
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)

      const onMove = (ev: PointerEvent): void => {
        const dy = startY - ev.clientY
        const next = Math.max(MIN_HEIGHT, Math.min(maxHeight, startHeight + dy))
        setHeight(next)
      }
      const onUp = (): void => {
        target.releasePointerCapture(e.pointerId)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [fullscreen, height, maxHeight]
  )

  const effectiveHeight = fullscreen ? maxHeight : Math.min(height, maxHeight)

  return (
    <div
      className={cn(
        'absolute right-0 bottom-0 left-0 z-20 flex flex-col bg-black shadow-[0_-12px_24px_rgba(0,0,0,0.55)] transition-transform duration-200 ease-out',
        open ? 'translate-y-0' : 'pointer-events-none translate-y-full'
      )}
      style={{ height: effectiveHeight }}
      aria-hidden={!open}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal"
        onPointerDown={onResizeStart}
        onDoubleClick={() => setHeight(DEFAULT_HEIGHT)}
        className={cn(
          'absolute -top-1 right-0 left-0 z-10 h-2 select-none',
          fullscreen ? 'cursor-default' : 'cursor-row-resize'
        )}
      />
      <div className="flex h-8 shrink-0 items-center gap-0.5 pr-1 pl-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {tabs.map((t) => (
            <TerminalTab
              key={t.id}
              label={t.label}
              active={t.id === activeId}
              onSelect={() => setActiveId(t.id)}
              onClose={() => closeTab(t.id)}
            />
          ))}
          <button
            type="button"
            onClick={addTab}
            aria-label="New terminal tab"
            title="New terminal"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-white/8 hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          aria-label={fullscreen ? 'Exit fullscreen terminal' : 'Fullscreen terminal'}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-white/8 hover:text-foreground"
        >
          {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close terminal panel"
          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-white/8 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1 px-2 pb-2">
        {tabs.map((t) => (
          <TerminalInstance key={t.id} visible={open && t.id === activeId} />
        ))}
      </div>
    </div>
  )
}

function TerminalTab({
  label,
  active,
  onSelect,
  onClose
}: {
  label: string
  active: boolean
  onSelect: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'group relative inline-flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground',
        active && 'bg-white/8 text-foreground'
      )}
    >
      <button type="button" onClick={onSelect} className="inline-flex items-center gap-1.5 pr-3">
        <span className="font-mono">{label}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label={`Close ${label}`}
        className="absolute top-1/2 right-1 inline-flex size-3.5 -translate-y-1/2 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/12 hover:text-foreground"
      >
        <X className="size-2.5" />
      </button>
    </div>
  )
}

function TerminalInstance({ visible }: { visible: boolean }): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!hostRef.current || termRef.current) return

    const host = hostRef.current
    const term = new Terminal({
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 12.5,
      lineHeight: 1.25,
      cursorBlink: true,
      allowProposedApi: true,
      theme: THEME,
      convertEol: false,
      scrollback: 5000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    try {
      fit.fit()
    } catch {
      /* host might not be visible yet */
    }

    const ptyId = genId()
    const pty = window.api.terminal.open(
      ptyId,
      { cols: term.cols, rows: term.rows },
      {
        onData: (data) => term.write(data),
        onExit: () => {
          term.write('\r\n\x1b[2m[process exited]\x1b[0m\r\n')
        }
      }
    )

    const dataDisposable = term.onData((data) => pty.write(data))
    const resizeDisposable = term.onResize(({ cols, rows }) => pty.resize(cols, rows))

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* ignore */
      }
    })
    ro.observe(host)

    termRef.current = term
    fitRef.current = fit

    return (): void => {
      ro.disconnect()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      pty.close()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  // When this tab becomes visible, refit and focus.
  useEffect(() => {
    if (!visible) return
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* ignore */
      }
      termRef.current?.focus()
    })
  }, [visible])

  return (
    <div
      ref={hostRef}
      className={cn(
        'absolute inset-0 px-2 pb-2',
        visible ? 'visible' : 'invisible pointer-events-none'
      )}
    />
  )
}
