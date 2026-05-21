import { forwardRef, useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  Check,
  ChevronDown,
  Mic,
  Paperclip,
  PencilLine,
  Plus,
  Shield,
  Square,
  Zap
} from 'lucide-react'
import { FileIcon } from './FileIcon'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import {
  MODELS,
  PERMISSIONS,
  modelById,
  permissionById,
  useSettings,
  type ModelId,
  type PermissionId
} from '@renderer/lib/settings'
import { getUsage, subscribeUsage, type UsageSnapshot } from '@renderer/lib/usage'

// Soft daily cap used to draw the ring. Research-preview accounts share a
// pool, so this is a guidance bar, not a hard quota — when the proxy starts
// returning real remaining-credit headers, swap this for the live number.
const DAILY_REQUEST_CAP = 100

// Per-attachment cap. Larger files are clipped on injection so a single drop
// can't blow the request body.
const ATTACHMENT_CHAR_CAP = 16_000

interface Attachment {
  name: string
  content: string // already clipped to ATTACHMENT_CHAR_CAP
  truncated: boolean
}

interface ComposerProps {
  // Controlled draft so it survives view changes (Home ↔ Thread).
  draft: string
  onDraftChange: (value: string) => void
  onSubmit: (text: string) => void
  placeholder?: string
  autoFocus?: boolean
  // When non-null, replace the send button with a Stop button that fires this.
  streamingStop?: (() => void) | null
  // Where the @-mention popover renders. Home has empty space below the
  // textarea, so we drop it under the caret; Thread's composer is pinned to
  // the bottom of the viewport, so it has to open upward.
  mentionPlacement?: 'above' | 'below'
}

const PERMISSION_ICONS: Record<PermissionId, React.ComponentType<{ className?: string }>> = {
  default: Shield,
  'auto-review': PencilLine,
  'full-access': Zap
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export function Composer({
  draft,
  onDraftChange,
  onSubmit,
  placeholder,
  autoFocus,
  streamingStop,
  mentionPlacement = 'above'
}: ComposerProps): React.JSX.Element {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [listening, setListening] = useState(false)
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [usageOpen, setUsageOpen] = useState(false)
  // @-mention state: only set when the caret sits inside an unterminated `@token`.
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [mentionResults, setMentionResults] = useState<string[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const transcribeBaseRef = useRef('')
  const { settings, set } = useSettings()

  const model = modelById(settings.model)
  const permission = permissionById(settings.permission)
  const PermissionIcon = PERMISSION_ICONS[settings.permission]
  const canSend = draft.trim().length > 0 || attachments.length > 0
  const speechAvailable = getSpeechRecognition() !== null
  const showStop = !!streamingStop

  // Stop voice recognition on unmount / when prop disappears.
  useEffect(() => {
    return (): void => {
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [])

  // Auto-grow the textarea up to ~10 lines, then internal scroll takes over.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = 22 // matches text-sm + leading-relaxed roughly
    const max = lineHeight * 10 + 24
    el.style.height = Math.min(el.scrollHeight, max) + 'px'
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }, [draft])

  // Fetch file matches whenever the active mention query changes. Debounce so
  // a fast typist doesn't fire one IPC per keystroke; cancel via the stale-token
  // pattern so a slow response can't overwrite a newer one.
  useEffect(() => {
    if (!mention) {
      // Synchronous clear is intentional — we want the dropdown gone the moment
      // the caret leaves an @-token, not after the next async fetch resolves.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMentionResults([])
      return
    }
    let cancelled = false
    const token = setTimeout(() => {
      void window.api.fs.findFiles(mention.query, 20).then((r) => {
        if (cancelled) return
        setMentionResults(r.ok ? r.files : [])
        setMentionIndex(0)
      })
    }, 80)
    return (): void => {
      cancelled = true
      clearTimeout(token)
    }
  }, [mention])

  // Sync the mention state with the current caret position. Called on every
  // change or selection move; returns null when no `@token` straddles the caret.
  const syncMention = (text: string, caret: number): void => {
    const m = findMentionAt(text, caret)
    setMention(m)
  }

  const send = (): void => {
    if (!canSend) return
    let body = draft.trim()
    if (attachments.length) {
      const blocks = attachments.map((a) => {
        const header = a.truncated
          ? `Attached file: ${a.name} (truncated to first ${ATTACHMENT_CHAR_CAP} chars)`
          : `Attached file: ${a.name}`
        return `${header}\n\n\`\`\`\n${a.content}\n\`\`\``
      })
      body = body ? `${body}\n\n${blocks.join('\n\n')}` : blocks.join('\n\n')
    }
    onSubmit(body)
    onDraftChange('')
    setAttachments([])
  }

  const acceptMention = (path: string): void => {
    if (!mention) return
    const el = textareaRef.current
    const caret = el?.selectionStart ?? draft.length
    const before = draft.slice(0, mention.start)
    const after = draft.slice(caret)
    const insert = `@${path} `
    const next = before + insert + after
    const nextCaret = before.length + insert.length
    onDraftChange(next)
    setMention(null)
    // Restore caret after React applies the new value.
    requestAnimationFrame(() => {
      const t = textareaRef.current
      if (!t) return
      t.focus()
      t.setSelectionRange(nextCaret, nextCaret)
    })
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // CJK IME composition: Enter on a candidate would otherwise submit.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return

    // Mention dropdown captures arrows / Enter / Tab while it's open with hits.
    if (mention && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => (i + 1) % mentionResults.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => (i - 1 + mentionResults.length) % mentionResults.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        acceptMention(mentionResults[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMention(null)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
      return
    }
    if (e.key === 'Escape') {
      // ESC blurs the textarea so global shortcuts can fire without the
      // composer eating them.
      ;(e.target as HTMLTextAreaElement).blur()
    }
  }

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    const next: Attachment[] = []
    for (const f of files) {
      try {
        const text = await f.text()
        const truncated = text.length > ATTACHMENT_CHAR_CAP
        next.push({
          name: f.name,
          content: truncated ? text.slice(0, ATTACHMENT_CHAR_CAP) : text,
          truncated
        })
      } catch {
        // Binary or unreadable — skip silently rather than poison the request.
      }
    }
    if (next.length) setAttachments((prev) => [...prev, ...next])
  }

  const startListening = (): void => {
    const Ctor = getSpeechRecognition()
    if (!Ctor) return
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = navigator.language || 'en-US'
    transcribeBaseRef.current = draft ? draft + (draft.endsWith(' ') ? '' : ' ') : ''
    rec.onresult = (ev): void => {
      let interim = ''
      let finalChunk = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]
        const t = r[0]?.transcript ?? ''
        if (r.isFinal) finalChunk += t
        else interim += t
      }
      if (finalChunk) {
        transcribeBaseRef.current = transcribeBaseRef.current + finalChunk
      }
      onDraftChange(transcribeBaseRef.current + interim)
    }
    rec.onerror = (): void => {
      stopListening()
    }
    rec.onend = (): void => setListening(false)
    try {
      rec.start()
      recognitionRef.current = rec
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  const stopListening = (): void => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }

  const toggleMic = (): void => {
    if (!speechAvailable) return
    if (listening) stopListening()
    else startListening()
  }

  return (
    <div className="relative w-full">
      {mention && mentionResults.length > 0 && (
        <MentionDropdown
          results={mentionResults}
          activeIndex={mentionIndex}
          onHover={setMentionIndex}
          onSelect={acceptMention}
          placement={mentionPlacement}
        />
      )}
      <div className="w-full rounded-3xl bg-input" onClick={() => textareaRef.current?.focus()}>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => void onFiles(e)}
          aria-hidden
          tabIndex={-1}
        />

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3" onClick={(e) => e.stopPropagation()}>
            {attachments.map((a, i) => (
              <button
                key={`${a.name}-${i}`}
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="inline-flex max-w-[16rem] items-center gap-1.5 truncate rounded-full bg-foreground/8 px-2.5 py-1 text-xs text-foreground/85 hover:bg-foreground/12"
                title={a.truncated ? `${a.name} — truncated` : `${a.name} — remove`}
              >
                <Paperclip className="size-3" />
                <span className="truncate">{a.name}</span>
                <span className="text-muted-foreground">×</span>
              </button>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          autoFocus={autoFocus}
          value={draft}
          onChange={(e) => {
            onDraftChange(e.target.value)
            syncMention(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }}
          onSelect={(e) => {
            const t = e.currentTarget
            syncMention(t.value, t.selectionStart ?? t.value.length)
          }}
          onBlur={() => setMention(null)}
          onKeyDown={onKey}
          placeholder={placeholder ?? 'Ask QC Codeus anything.  @ to mention files'}
          rows={1}
          className="block w-full resize-none bg-transparent px-6 pt-4 pb-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          style={{ minHeight: 56 }}
        />

        <div
          className="flex items-center justify-between gap-2 px-3 pb-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Attach file"
              onClick={(e) => {
                e.stopPropagation()
                fileRef.current?.click()
              }}
            >
              <Plus />
            </Button>

            <Popover open={permissionOpen} onOpenChange={setPermissionOpen}>
              <PopoverTrigger asChild>
                <PillButton onClick={(e) => e.stopPropagation()}>
                  <PermissionIcon className="size-3.5" />
                  <span className="truncate">{permission.label}</span>
                  <ChevronDown className="size-3.5 opacity-70" />
                </PillButton>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-48">
                <OptionList
                  items={PERMISSIONS.map((p) => ({
                    id: p.id,
                    label: p.label,
                    icon: PERMISSION_ICONS[p.id]
                  }))}
                  selectedId={settings.permission}
                  onSelect={(id) => {
                    set('permission', id as PermissionId)
                    setPermissionOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-1">
            <Popover open={usageOpen} onOpenChange={setUsageOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Usage remaining today"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground data-[state=open]:bg-foreground/8 data-[state=open]:text-foreground"
                >
                  <UsageRing />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56">
                <UsageReadout />
              </PopoverContent>
            </Popover>

            <Popover open={modelOpen} onOpenChange={setModelOpen}>
              <PopoverTrigger asChild>
                <PillButton onClick={(e) => e.stopPropagation()}>
                  <span className="truncate">{model.label}</span>
                  <ChevronDown className="size-3.5 opacity-70" />
                </PillButton>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64">
                <OptionList
                  items={MODELS.map((m) => ({
                    id: m.id,
                    label: m.label,
                    hint: m.hint
                  }))}
                  selectedId={settings.model}
                  onSelect={(id) => {
                    set('model', id as ModelId)
                    setModelOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>

            {speechAvailable && (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleMic()
                }}
                aria-label={listening ? 'Stop voice input' : 'Start voice input'}
                aria-pressed={listening}
                className={cn(
                  'text-muted-foreground hover:text-foreground',
                  listening && 'text-foreground'
                )}
              >
                <Mic className={cn(listening && 'animate-pulse')} />
              </Button>
            )}
            {showStop ? (
              <Button
                size="icon-sm"
                variant="default"
                onClick={(e) => {
                  e.stopPropagation()
                  streamingStop?.()
                }}
                aria-label="Stop generating"
              >
                <Square className="fill-current" />
              </Button>
            ) : (
              <Button
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  send()
                }}
                disabled={!canSend}
                aria-label="Send"
              >
                <ArrowUp />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface OptionItem {
  id: string
  label: string
  hint?: string
  icon?: React.ComponentType<{ className?: string }>
}

function OptionList({
  items,
  selectedId,
  onSelect
}: {
  items: ReadonlyArray<OptionItem>
  selectedId: string
  onSelect: (id: string) => void
}): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((it) => {
        const active = it.id === selectedId
        const Icon = it.icon
        return (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onSelect(it.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm hover:bg-foreground/8',
                active && 'bg-foreground/8'
              )}
            >
              {Icon && <Icon className="size-[15px] shrink-0 text-muted-foreground" />}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-foreground">{it.label}</span>
                {it.hint && (
                  <span className="truncate text-[11px] text-muted-foreground">{it.hint}</span>
                )}
              </span>
              {active && <Check className="size-3.5 shrink-0 text-foreground" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function useUsage(): UsageSnapshot {
  const [snap, setSnap] = useState<UsageSnapshot>(() => getUsage())
  useEffect(() => subscribeUsage(setSnap), [])
  return snap
}

function UsageRing(): React.JSX.Element {
  const usage = useUsage()
  const used = Math.min(usage.requests, DAILY_REQUEST_CAP)
  const ratio = used / DAILY_REQUEST_CAP
  const remaining = Math.max(0, DAILY_REQUEST_CAP - usage.requests)
  const r = 5
  const c = 2 * Math.PI * r
  // Trim a hair so the stroke joins are clean at 0% / 100%.
  const dash = Math.max(0, Math.min(c - 0.01, c * ratio))
  return (
    <svg
      viewBox="0 0 14 14"
      className="size-3.5 shrink-0"
      role="img"
      aria-label={`${remaining} of ${DAILY_REQUEST_CAP} requests remaining today`}
    >
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.5"
      />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 7 7)"
      />
    </svg>
  )
}

function UsageReadout(): React.JSX.Element {
  const usage = useUsage()
  const remaining = Math.max(0, DAILY_REQUEST_CAP - usage.requests)
  const pct = Math.min(100, Math.round((usage.requests / DAILY_REQUEST_CAP) * 100))
  return (
    <div className="flex flex-col gap-2 px-1 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-foreground/90">Usage today</span>
        <span className="text-foreground/85">
          {remaining}/{DAILY_REQUEST_CAP} left
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-foreground/8">
        <div className="h-full bg-foreground/70" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Soft cap during research preview. Resets at midnight local time.
      </p>
    </div>
  )
}

// Walk backward from the caret to detect an active `@token`. Returns null
// when the caret isn't inside one — i.e., there's a space (or no `@`) between
// the caret and the most recent `@`, or the `@` isn't at start/after-whitespace.
function findMentionAt(text: string, caret: number): { start: number; query: string } | null {
  let i = caret - 1
  while (i >= 0) {
    const c = text[i]
    if (c === '@') {
      const prev = i === 0 ? '' : text[i - 1]
      if (prev === '' || /\s/.test(prev)) {
        const query = text.slice(i + 1, caret)
        // Bail on whitespace in the query so a stale `@thing` left behind by
        // earlier typing doesn't keep the dropdown alive.
        if (/\s/.test(query)) return null
        return { start: i, query }
      }
      return null
    }
    if (/\s/.test(c)) return null
    i--
  }
  return null
}

function baseName(p: string): string {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.slice(i + 1) : p
}

function MentionDropdown({
  results,
  activeIndex,
  onHover,
  onSelect,
  placement
}: {
  results: string[]
  activeIndex: number
  onHover: (i: number) => void
  onSelect: (path: string) => void
  placement: 'above' | 'below'
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'pointer-events-auto absolute right-0 left-0 z-10 max-h-72 overflow-y-auto rounded-2xl bg-card/95 p-1 shadow-lg backdrop-blur',
        placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
      )}
      onMouseDown={(e) => e.preventDefault()} // keep textarea focus on click
    >
      {results.map((p, i) => {
        const active = i === activeIndex
        return (
          <button
            key={p}
            type="button"
            onMouseEnter={() => onHover(i)}
            onClick={() => onSelect(p)}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
              active
                ? 'bg-foreground/10 text-foreground'
                : 'text-muted-foreground hover:bg-foreground/6'
            )}
          >
            <FileIcon path={p} />
            <span className="truncate font-medium text-foreground/95">{baseName(p)}</span>
            <span className="ml-auto truncate text-[11px] text-muted-foreground/80">{p}</span>
          </button>
        )
      })}
    </div>
  )
}

const PillButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function PillButton({ children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        {...props}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground data-[state=open]:bg-foreground/8 data-[state=open]:text-foreground"
      >
        {children}
      </button>
    )
  }
)
