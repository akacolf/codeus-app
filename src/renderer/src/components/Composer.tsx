import { forwardRef, useRef, useState } from 'react'
import { ArrowUp, Check, ChevronDown, Hand, Mic, Paperclip, Plus } from 'lucide-react'
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

interface ComposerProps {
  onSubmit: (text: string) => void
  placeholder?: string
  autoFocus?: boolean
}

export function Composer({ onSubmit, placeholder, autoFocus }: ComposerProps): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [listening, setListening] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { settings, set } = useSettings()

  const model = modelById(settings.model)
  const permission = permissionById(settings.permission)
  const canSend = draft.trim().length > 0

  const send = (): void => {
    if (!canSend) return
    const tail = attachments.length ? `\n\n[attached: ${attachments.join(', ')}]` : ''
    onSubmit(draft + tail)
    setDraft('')
    setAttachments([])
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? []).map((f) => f.name)
    if (files.length) setAttachments((a) => [...a, ...files])
    e.target.value = ''
  }

  const toggleMic = (): void => {
    setListening((v) => !v)
  }

  return (
    <div className="w-full rounded-3xl bg-input" onClick={() => textareaRef.current?.focus()}>
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={onFiles}
        aria-hidden
        tabIndex={-1}
      />

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3" onClick={(e) => e.stopPropagation()}>
          {attachments.map((name, i) => (
            <button
              key={`${name}-${i}`}
              type="button"
              onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))}
              className="inline-flex max-w-[16rem] items-center gap-1.5 truncate rounded-full bg-white/8 px-2.5 py-1 text-xs text-foreground/85 hover:bg-white/12"
              title="Remove"
            >
              <Paperclip className="size-3" />
              <span className="truncate">{name}</span>
              <span className="text-muted-foreground">×</span>
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        autoFocus={autoFocus}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder ?? 'Ask QC Codium anything.  @ to use plugins or mention files'}
        rows={2}
        className="block w-full resize-none bg-transparent px-5 pt-4 pb-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
      />

      <div
        className="flex items-center justify-between gap-2 px-2 pb-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Attach file"
            onClick={() => fileRef.current?.click()}
          >
            <Plus />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <PillButton>
                <Hand className="size-3.5" />
                <span className="truncate">{permission.label}</span>
                <ChevronDown className="size-3.5 opacity-70" />
              </PillButton>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64">
              <OptionList
                items={PERMISSIONS}
                selectedId={settings.permission}
                onSelect={(id) => set('permission', id as PermissionId)}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <PillButton>
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
                onSelect={(id) => set('model', id as ModelId)}
              />
            </PopoverContent>
          </Popover>

          <Button
            size="icon-sm"
            variant="ghost"
            onClick={toggleMic}
            aria-label={listening ? 'Stop voice input' : 'Start voice input'}
            aria-pressed={listening}
            className={cn(
              'text-muted-foreground hover:text-foreground',
              listening && 'text-foreground'
            )}
          >
            <Mic className={cn(listening && 'animate-pulse')} />
          </Button>
          <Button size="icon-sm" onClick={send} disabled={!canSend} aria-label="Send">
            <ArrowUp />
          </Button>
        </div>
      </div>

      {listening && (
        <div className="px-5 pb-3 text-[11px] text-muted-foreground">
          Listening… voice input is a research stub.
        </div>
      )}
    </div>
  )
}

interface OptionItem {
  id: string
  label: string
  hint?: string
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
        return (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onSelect(it.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-white/8',
                active && 'bg-white/8'
              )}
            >
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
