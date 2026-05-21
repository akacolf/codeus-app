import { forwardRef, useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  Check,
  ChevronDown,
  Eye,
  Mic,
  Paperclip,
  Plus,
  Shield,
  Square,
  Zap
} from 'lucide-react'
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
}

const PERMISSION_ICONS: Record<PermissionId, React.ComponentType<{ className?: string }>> = {
  default: Shield,
  'read-only': Eye,
  auto: Zap
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
  streamingStop
}: ComposerProps): React.JSX.Element {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [listening, setListening] = useState(false)
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
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

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // CJK IME composition: Enter on a candidate would otherwise submit.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
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
              className="inline-flex max-w-[16rem] items-center gap-1.5 truncate rounded-full bg-white/8 px-2.5 py-1 text-xs text-foreground/85 hover:bg-white/12"
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
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder ?? 'Ask QC Codeus anything.  @ to use plugins or mention files'}
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
            <PopoverContent align="start" className="w-64">
              <OptionList
                items={PERMISSIONS.map((p) => ({
                  id: p.id,
                  label: p.label,
                  hint: p.hint,
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
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm hover:bg-white/8',
                active && 'bg-white/8'
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

const PillButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function PillButton({ children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        {...props}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground data-[state=open]:bg-white/8 data-[state=open]:text-foreground"
      >
        {children}
      </button>
    )
  }
)
