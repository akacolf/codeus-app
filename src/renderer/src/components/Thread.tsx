import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  Copy,
  FileText,
  FolderOpen,
  Loader2,
  Pencil,
  PencilLine,
  RefreshCw,
  RotateCw,
  Terminal,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert
} from 'lucide-react'
import type { Chat, Message, ToolPart } from '@renderer/lib/chat'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { useChatStore, type ChatSettingsSnapshot } from '@renderer/stores/chatStore'
import { Composer } from './Composer'
import { Markdown } from './Markdown'

interface ThreadProps {
  chat: Chat
  draft: string
  onDraftChange: (value: string) => void
  onSubmit: (text: string) => void
  settings: ChatSettingsSnapshot
}

const AT_BOTTOM_TOLERANCE = 80 // px

export function Thread({
  chat,
  draft,
  onDraftChange,
  onSubmit,
  settings
}: ThreadProps): React.JSX.Element {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const streaming = chat.streamingMessageId !== undefined

  const stopStreaming = useChatStore((s) => s.stopStreaming)
  const regenerate = useChatStore((s) => s.regenerate)
  const editUserMessage = useChatStore((s) => s.editUserMessage)
  const retryAfterError = useChatStore((s) => s.retryAfterError)

  // Track whether the user is scrolled to the bottom — only auto-scroll when so.
  // The flag lives in a ref so the ResizeObserver callback reads the latest
  // value without re-subscribing on every scroll event.
  const onScroll = (): void => {
    const el = scrollerRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    atBottomRef.current = distance <= AT_BOTTOM_TOLERANCE
  }

  // Reset to bottom when switching chats.
  useEffect(() => {
    atBottomRef.current = true
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
    })
  }, [chat.id])

  // Follow streaming content. ResizeObserver fires whenever the inner content
  // grows (token deltas, new tool chips, etc.); message-count change alone isn't
  // enough because most streaming mutates an existing message in place.
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const observer = new ResizeObserver(() => {
      if (!atBottomRef.current) return
      endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [chat.id])

  const handleRegenerate = (assistantId: string): void => regenerate(chat.id, assistantId, settings)
  const handleEdit = (messageId: string, text: string): void =>
    editUserMessage(chat.id, messageId, text, settings)
  const handleRetry = (): void => retryAfterError(chat.id, settings)

  return (
    <div className="flex h-full w-full flex-col">
      <div ref={scrollerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-6">
        <div ref={contentRef} className="mx-auto flex w-full max-w-2xl flex-col gap-5 py-8">
          {chat.messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              isStreaming={m.id === chat.streamingMessageId}
              onEdit={(text) => handleEdit(m.id, text)}
              onRegenerate={() => handleRegenerate(m.id)}
            />
          ))}
          {chat.error && (
            <div className="flex max-w-[80%] flex-col gap-2 self-start rounded-2xl bg-white/8 px-4 py-3 text-sm text-foreground/85">
              <div>
                <span className="text-muted-foreground">Couldn’t reply: </span>
                {chat.error}
              </div>
              <div>
                <Button variant="ghost" size="xs" onClick={handleRetry} className="gap-1.5">
                  <RotateCw className="size-3" />
                  Retry
                </Button>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div className="w-full shrink-0 px-6 pb-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          <Composer
            draft={draft}
            onDraftChange={onDraftChange}
            onSubmit={onSubmit}
            autoFocus
            streamingStop={streaming ? () => stopStreaming(chat.id) : null}
          />
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  isStreaming,
  onEdit,
  onRegenerate
}: {
  message: Message
  isStreaming: boolean
  onEdit: (text: string) => void
  onRegenerate: () => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.text)

  if (message.role === 'user') {
    if (editing) {
      return (
        <div className="flex max-w-[80%] flex-col items-end gap-1 self-end">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(8, Math.max(2, draft.split('\n').length))}
            autoFocus
            className="w-full min-w-[20rem] resize-none rounded-2xl bg-input px-4 py-2.5 text-sm leading-relaxed outline-none"
          />
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setEditing(false)
                setDraft(message.text)
              }}
            >
              Cancel
            </Button>
            <Button
              size="xs"
              onClick={() => {
                const t = draft.trim()
                if (!t || t === message.text) {
                  setEditing(false)
                  setDraft(message.text)
                  return
                }
                onEdit(t)
                setEditing(false)
              }}
            >
              Save & resubmit
            </Button>
          </div>
        </div>
      )
    }
    return (
      <div className="group flex max-w-[80%] flex-col items-end gap-1 self-end">
        <div className="rounded-2xl bg-input px-4 py-2.5 text-sm whitespace-pre-wrap">
          {message.text}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <CopyAction text={message.text} />
          <ActionButton
            label="Edit message"
            onClick={() => {
              setDraft(message.text)
              setEditing(true)
            }}
          >
            <Pencil className="size-3.5" />
          </ActionButton>
        </div>
      </div>
    )
  }

  const parts =
    message.parts && message.parts.length > 0
      ? message.parts
      : message.text.length > 0
        ? [{ kind: 'text' as const, text: message.text }]
        : []

  return (
    <div className="group flex max-w-[85%] flex-col gap-1.5 self-start">
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground/90">
        {parts.map((p, i) =>
          p.kind === 'text' ? (
            <div key={`t-${i}`}>
              <Markdown text={p.text} />
              {isStreaming && i === parts.length - 1 && (
                <span
                  aria-hidden
                  className="ml-1 inline-block size-2 translate-y-[-1px] animate-pulse rounded-full bg-foreground/70 align-middle"
                />
              )}
            </div>
          ) : (
            <ActionChip key={p.toolCallId} tool={p} />
          )
        )}
        {isStreaming && parts.length === 0 && (
          <span
            aria-hidden
            className="inline-block size-2 animate-pulse rounded-full bg-foreground/70"
          />
        )}
      </div>
      {!isStreaming && message.text.length > 0 && (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <CopyAction text={message.text} />
          <ActionButton label="Regenerate response" onClick={onRegenerate}>
            <RefreshCw className="size-3.5" />
          </ActionButton>
          <FeedbackAction key={`${message.id}-up`} kind="up" />
          <FeedbackAction key={`${message.id}-down`} kind="down" />
        </div>
      )}
    </div>
  )
}

function toolLabel(tool: ToolPart): string {
  const args = (tool.args ?? {}) as { path?: string; content?: string }
  const path = args.path ?? ''
  const present = tool.status === 'running'
  switch (tool.name) {
    case 'read_file':
      return present ? `Reading ${path || 'file'}` : `Read ${path || 'file'}`
    case 'write_file':
      return present ? `Writing ${path || 'file'}` : `Wrote ${path || 'file'}`
    case 'list_directory': {
      const where = path ? path : '.'
      if (present) return `Exploring ${where}`
      const result = tool.result as { entries?: unknown[] } | undefined
      const count = Array.isArray(result?.entries) ? result.entries.length : null
      return count !== null
        ? `Explored ${count} file${count === 1 ? '' : 's'}`
        : `Explored ${where}`
    }
    default:
      return present ? `Running ${tool.name}` : tool.name
  }
}

function ToolIcon({ name }: { name: string }): React.JSX.Element {
  const className = 'size-3.5'
  if (name === 'read_file') return <FileText className={className} />
  if (name === 'write_file') return <PencilLine className={className} />
  if (name === 'list_directory') return <FolderOpen className={className} />
  return <Terminal className={className} />
}

function ActionChip({ tool }: { tool: ToolPart }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const isError = tool.status === 'error'
  const isRunning = tool.status === 'running'
  const label = toolLabel(tool)
  const hasDetails =
    tool.args !== undefined || tool.result !== undefined || tool.error !== undefined

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => hasDetails && setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? `Hide ${label} details` : `Show ${label} details`}
        className={cn(
          'group/chip -ml-1 inline-flex w-fit max-w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-[13px] text-muted-foreground transition-colors',
          hasDetails && 'hover:bg-white/8 hover:text-foreground',
          isError && 'text-foreground/70'
        )}
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {isRunning ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : isError ? (
            <TriangleAlert className="size-3.5" />
          ) : (
            <ToolIcon name={tool.name} />
          )}
        </span>
        <span className="truncate">{label}</span>
        {hasDetails && (
          <ChevronRight
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground/60 opacity-0 transition-[opacity,transform] group-hover/chip:opacity-100',
              open && 'rotate-90 opacity-100'
            )}
          />
        )}
      </button>
      {open && hasDetails && <ToolDetails tool={tool} />}
    </div>
  )
}

function ToolDetails({ tool }: { tool: ToolPart }): React.JSX.Element {
  const argsText = tool.args !== undefined ? formatJson(tool.args) : null
  const resultText = tool.result !== undefined ? formatJson(tool.result) : null
  return (
    <div className="ml-5 flex flex-col gap-2 rounded-lg bg-white/4 px-3 py-2 text-xs text-foreground/85">
      {argsText && <DetailBlock title="Arguments" body={argsText} />}
      {tool.error && <DetailBlock title="Error" body={tool.error} />}
      {resultText && <DetailBlock title="Result" body={resultText} />}
      {tool.durationMs !== undefined && (
        <div className="text-[11px] text-muted-foreground">{formatDuration(tool.durationMs)}</div>
      )}
    </div>
  )
}

function DetailBlock({ title, body }: { title: string; body: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{title}</div>
      <pre className="max-h-64 overflow-auto rounded-md bg-black/40 px-2.5 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-foreground/85">
        {body}
      </pre>
    </div>
  )
}

function formatJson(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

function ActionButton({
  label,
  onClick,
  active,
  children
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground',
        active && 'bg-white/8 text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function CopyAction({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <ActionButton
      label={copied ? 'Copied' : 'Copy message'}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </ActionButton>
  )
}

function FeedbackAction({ kind }: { kind: 'up' | 'down' }): React.JSX.Element {
  const [active, setActive] = useState(false)
  const Icon = kind === 'up' ? ThumbsUp : ThumbsDown
  return (
    <ActionButton
      label={kind === 'up' ? 'Good response' : 'Bad response'}
      active={active}
      onClick={() => setActive((v) => !v)}
    >
      <Icon className="size-3.5" />
    </ActionButton>
  )
}
