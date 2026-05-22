import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Cloud, Laptop, Maximize2, Minimize2, Plus, X } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ImageAddon } from '@xterm/addon-image'
import '@xterm/xterm/css/xterm.css'
import { genId } from '@renderer/lib/chat'
import { cn } from '@renderer/lib/utils'
import {
  useSettings,
  type RuntimeMode,
  type TerminalBellMode,
  type TerminalCursorStyle,
  type TerminalScrollback
} from '@renderer/lib/settings'

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
  mode: RuntimeMode
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
  const { settings } = useSettings()
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [height, setHeight] = useState<number>(readSavedHeight)
  const [maxHeight, setMaxHeight] = useState<number>(
    typeof window === 'undefined' ? 720 : window.innerHeight - TOP_RESERVED
  )
  const [fullscreen, setFullscreen] = useState(false)
  const counterRef = useRef(0)

  const labelFor = (mode: RuntimeMode, n: number): string =>
    mode === 'cloud' ? `cloud ${n}` : `${defaultShellLabel()} ${n}`

  // Lazy-create the first tab when the panel opens.
  useEffect(() => {
    if (open && tabs.length === 0) {
      const id = genId()
      counterRef.current = 1
      const mode = settings.runtimeMode
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTabs([{ id, label: labelFor(mode, 1), mode }])
      setActiveId(id)
    }
    // settings.runtimeMode intentionally not a dependency — switching modes
    // shouldn't reset an open terminal, only affect newly created tabs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const mode = settings.runtimeMode
    setTabs((t) => [...t, { id, label: labelFor(mode, counterRef.current), mode }])
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
        'absolute right-0 bottom-0 left-0 z-20 flex flex-col bg-background shadow-[0_-12px_24px_rgba(0,0,0,0.55)] transition-transform duration-200 ease-out',
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
              mode={t.mode}
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
            className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          aria-label={fullscreen ? 'Exit fullscreen terminal' : 'Fullscreen terminal'}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
        >
          {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close terminal panel"
          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1 px-2 pb-2">
        {tabs.map((t) => (
          <TerminalInstance
            key={t.id}
            visible={open && t.id === activeId}
            mode={t.mode}
            fontSize={settings.terminalFontSize}
            scrollback={settings.terminalScrollback}
            cursorStyle={settings.terminalCursorStyle}
            cursorBlink={settings.terminalCursorBlink}
            bell={settings.terminalBell}
            copyOnSelect={settings.terminalCopyOnSelect}
          />
        ))}
      </div>
    </div>
  )
}

function TerminalTab({
  label,
  mode,
  active,
  onSelect,
  onClose
}: {
  label: string
  mode: RuntimeMode
  active: boolean
  onSelect: () => void
  onClose: () => void
}): React.JSX.Element {
  const Icon = mode === 'cloud' ? Cloud : Laptop
  return (
    <div
      className={cn(
        'group relative inline-flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground',
        active && 'bg-foreground/8 text-foreground'
      )}
    >
      <button type="button" onClick={onSelect} className="inline-flex items-center gap-1.5 pr-3">
        <Icon className="size-3" />
        <span className="font-mono">{label}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label={`Close ${label}`}
        className="absolute top-1/2 right-1 inline-flex size-3.5 -translate-y-1/2 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-foreground/12 hover:text-foreground"
      >
        <X className="size-2.5" />
      </button>
    </div>
  )
}

function TerminalInstance({
  visible,
  mode,
  fontSize,
  scrollback,
  cursorStyle,
  cursorBlink,
  bell,
  copyOnSelect
}: {
  visible: boolean
  mode: RuntimeMode
  fontSize: number
  scrollback: TerminalScrollback
  cursorStyle: TerminalCursorStyle
  cursorBlink: boolean
  bell: TerminalBellMode
  copyOnSelect: boolean
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const inputRef = useRef<(data: string) => void>(() => {})

  useEffect(() => {
    if (!hostRef.current || termRef.current) return

    const host = hostRef.current
    const term = new Terminal({
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 12.5,
      lineHeight: 1.25,
      cursorBlink,
      cursorStyle,
      allowProposedApi: true,
      // Option-as-Meta is what bash/zsh readline expects for word-motion keys
      // (Opt+B, Opt+F, Opt+Backspace, etc). Without this xterm.js eats the
      // Option modifier on macOS and the shell never sees the escape prefix.
      macOptionIsMeta: true,
      theme: THEME,
      convertEol: false,
      scrollback
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    // Sixel + iTerm2 inline images (imgcat / kitty-style protocols). Lets users
    // paste-render PNG/SVG output from CLIs like `chafa --format=sixel` or any
    // tool that emits an iTerm IIP escape. Costs a Web Worker; harmless if no
    // image escape ever arrives.
    term.loadAddon(
      new ImageAddon({
        enableSizeReports: true,
        sixelSupport: true,
        iipSupport: true
      })
    )
    term.open(host)
    try {
      fit.fit()
    } catch {
      /* host might not be visible yet */
    }

    termRef.current = term
    fitRef.current = fit

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* ignore */
      }
    })
    ro.observe(host)

    let cleanup: () => void = () => {
      /* replaced below */
    }

    if (mode === 'local') {
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
      inputRef.current = (data) => pty.write(data)
      // Bridge macOS-native editing shortcuts to readline / Claude-Code-style
      // keybindings. xterm.js forwards Ctrl-* keys raw (Ctrl+A, Ctrl+E, Ctrl+U,
      // Ctrl+K, Ctrl+W, Ctrl+R, Ctrl+L, Ctrl+C, Ctrl+D, …) as their ASCII
      // control bytes, so those already "just work" inside the PTY. What
      // doesn't pass through by default is the Cmd modifier — macOS users
      // expect Cmd+←/→ to jump to line start/end and Cmd+Backspace to clear
      // the line, so we translate them to the equivalent readline bytes.
      // Shift+Enter writes a literal LF (0x0a) instead of CR so users can
      // compose multi-line heredocs / loops without typing `\` at end of line.
      term.attachCustomKeyEventHandler((ev) => {
        if (ev.type !== 'keydown') return true

        if (ev.shiftKey && ev.key === 'Enter') {
          pty.write('\n')
          return false
        }

        // Cmd-based readline equivalents (macOS).
        if (ev.metaKey && !ev.ctrlKey && !ev.altKey) {
          switch (ev.key) {
            case 'ArrowLeft':
              pty.write('\x01') // Ctrl-A: beginning of line
              return false
            case 'ArrowRight':
              pty.write('\x05') // Ctrl-E: end of line
              return false
            case 'Backspace':
              pty.write('\x15') // Ctrl-U: kill to start of line
              return false
            case 'Delete':
              pty.write('\x0b') // Ctrl-K: kill to end of line
              return false
            case 'k':
            case 'K':
              // Cmd+K is "clear" in most macOS terminals; map to Ctrl-L so the
              // shell's clear-screen also fires (most users want both effects).
              pty.write('\x0c')
              return false
          }
        }

        // Alt/Option mapped explicitly for the cases macOptionIsMeta misses
        // (arrows aren't bytes, so the runtime needs a hint).
        if (ev.altKey && !ev.metaKey && !ev.ctrlKey) {
          switch (ev.key) {
            case 'ArrowLeft':
              pty.write('\x1bb') // Meta-b: backward word
              return false
            case 'ArrowRight':
              pty.write('\x1bf') // Meta-f: forward word
              return false
          }
        }

        return true
      })
      cleanup = (): void => {
        dataDisposable.dispose()
        resizeDisposable.dispose()
        pty.close()
      }
    } else {
      cleanup = wireCloudSandbox(term, inputRef)
    }

    return (): void => {
      ro.disconnect()
      cleanup()
      inputRef.current = () => {}
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // scrollback / cursorStyle / cursorBlink are captured at construction; their
    // live-update effect below handles changes without recreating the terminal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

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

  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.fontSize = fontSize
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* ignore */
      }
    })
  }, [fontSize])

  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.scrollback = scrollback
    termRef.current.options.cursorStyle = cursorStyle
    termRef.current.options.cursorBlink = cursorBlink
  }, [scrollback, cursorStyle, cursorBlink])

  // xterm v6 removed the bell sound option — bell is emitted as an event now,
  // and the host plays it. Skip the AudioContext when bell === 'none'.
  useEffect(() => {
    if (bell !== 'sound' || !termRef.current) return
    const disposable = termRef.current.onBell(() => {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return
        const ctx = new Ctor()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 880
        gain.gain.value = 0.08
        osc.start()
        osc.stop(ctx.currentTime + 0.08)
      } catch {
        /* audio may be unavailable; bell is best-effort */
      }
    })
    return (): void => disposable.dispose()
  }, [bell])

  useEffect(() => {
    if (!copyOnSelect || !termRef.current) return
    const disposable = termRef.current.onSelectionChange(() => {
      const sel = termRef.current?.getSelection()
      if (sel && sel.length > 0) {
        void navigator.clipboard.writeText(sel).catch(() => {
          /* clipboard may be blocked in some contexts; non-fatal */
        })
      }
    })
    return (): void => disposable.dispose()
  }, [copyOnSelect])

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    const paths = Array.from(e.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => typeof path === 'string' && path.length > 0)

    if (paths.length === 0) return
    termRef.current?.focus()
    inputRef.current(`${paths.map(shellQuotePath).join(' ')} `)
  }

  return (
    <div
      ref={hostRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        'absolute inset-0 px-2 pb-2',
        visible ? 'visible' : 'invisible pointer-events-none'
      )}
    />
  )
}

function shellQuotePath(path: string): string {
  if (/Win/i.test(navigator.platform || '')) {
    return /[\s"]/u.test(path) ? `"${path.replace(/"/g, '\\"')}"` : path
  }
  return `'${path.replace(/'/g, "'\\''")}'`
}

// Cloud mode = line-buffered command runner backed by @vercel/sandbox runCommand.
// The SDK doesn't expose a streaming stdin/PTY, so we don't try to emulate one —
// the user types a line, hits Enter, we ship it via IPC, and stream the output
// back. Up arrow recalls history. Anything requiring a real TTY (vim, htop) won't
// work; that's surfaced to the user via the connection banner.
function wireCloudSandbox(
  term: Terminal,
  inputRef: MutableRefObject<(data: string) => void>
): () => void {
  const PROMPT = '\x1b[2m$\x1b[0m '
  const history: string[] = []
  let historyIdx = -1
  let buf = ''
  let started = false
  let disposed = false

  const sandboxId = genId()
  const channel = window.api.sandbox.open(
    sandboxId,
    {},
    {
      onData: (data) => {
        if (!disposed) term.write(data)
      },
      onPrompt: () => {
        if (!disposed) term.write(PROMPT)
      }
    }
  )

  const writePrompt = (): void => term.write(PROMPT)

  void (async () => {
    term.write('\x1b[2mstarting vercel sandbox…\x1b[0m\r\n')
    const r = await channel.start()
    started = true
    if (!r.ok) {
      term.write(`\x1b[31m${r.error}\x1b[0m\r\n`)
      term.write(
        '\x1b[2mAdd a Vercel token + team/project ID in Settings → Cloud sandbox.\x1b[0m\r\n'
      )
      return
    }
    writePrompt()
  })()

  const ingest = (d: string): void => {
    if (!started) return
    for (const ch of d) {
      const code = ch.charCodeAt(0)
      if (ch === '\r') {
        term.write('\r\n')
        const line = buf
        buf = ''
        if (line.trim()) {
          history.push(line)
          historyIdx = history.length
        }
        void channel.run(line)
      } else if (code === 127 || code === 8) {
        // backspace
        if (buf.length > 0) {
          buf = buf.slice(0, -1)
          term.write('\b \b')
        }
      } else if (ch === '\x1b') {
        // skip — handled below for arrow sequences
      } else if (code >= 32 && code !== 127) {
        buf += ch
        term.write(ch)
      }
    }
    // Arrow-key history: very rough, just handles up/down at end of input.
    if (d === '\x1b[A' && history.length > 0) {
      historyIdx = Math.max(0, historyIdx - 1)
      replaceLine(history[historyIdx] ?? '')
    } else if (d === '\x1b[B') {
      historyIdx = Math.min(history.length, historyIdx + 1)
      replaceLine(historyIdx >= history.length ? '' : history[historyIdx])
    }
  }

  inputRef.current = ingest

  const dataDisposable = term.onData(ingest)

  function replaceLine(next: string): void {
    // Clear current input visually
    while (buf.length > 0) {
      term.write('\b \b')
      buf = buf.slice(0, -1)
    }
    buf = next
    term.write(next)
  }

  return (): void => {
    disposed = true
    dataDisposable.dispose()
    void channel.close()
  }
}
