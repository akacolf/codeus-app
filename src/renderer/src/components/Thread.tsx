import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  FileJson,
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
import type { Chat, Message, MessagePart, TextPart, ToolPart } from '@renderer/lib/chat'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { useChatStore, type ChatSettingsSnapshot } from '@renderer/stores/chatStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
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
    <div className="relative flex h-full w-full flex-col">
      <div ref={scrollerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-6">
        {/* Extra bottom padding lets the last message scroll above the floating
            composer so the conversation isn't clipped at the bottom edge. */}
        <div ref={contentRef} className="mx-auto flex w-full max-w-2xl flex-col gap-5 pt-8 pb-44">
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
      {/* Gradient mask: scrolled content fades into the background before
          reaching the composer, so the chat appears to flow behind it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-44 bg-gradient-to-t from-background via-background/95 to-transparent"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-6 pb-6">
        <div className="pointer-events-auto mx-auto flex w-full max-w-2xl flex-col gap-2">
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
        <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="text-[11px] text-muted-foreground">
            {formatMessageTime(message.createdAt)}
          </span>
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

  const refs = extractReferencedFiles(message.parts)
  const split = splitChainAndFinal(parts)

  return (
    <div className="group flex max-w-[85%] flex-col gap-2 self-start">
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground/90">
        {split.chain.length > 0 && <WorkRollup chain={split.chain} isStreaming={isStreaming} />}
        {split.final && (
          <div>
            <Markdown text={split.final.text} />
            {isStreaming && (
              <span
                aria-hidden
                className="ml-1 inline-block size-2 translate-y-[-1px] animate-pulse rounded-full bg-foreground/70 align-middle"
              />
            )}
          </div>
        )}
        {isStreaming && parts.length === 0 && (
          <span
            aria-hidden
            className="inline-block size-2 animate-pulse rounded-full bg-foreground/70"
          />
        )}
      </div>
      {!isStreaming && refs.length > 0 && <FileReferences paths={refs} />}
      {!isStreaming && message.text.length > 0 && (
        <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <CopyAction text={message.text} />
          <ActionButton label="Regenerate response" onClick={onRegenerate}>
            <RefreshCw className="size-3.5" />
          </ActionButton>
          <FeedbackAction key={`${message.id}-up`} kind="up" />
          <FeedbackAction key={`${message.id}-down`} kind="down" />
          <span className="ml-1 text-[11px] text-muted-foreground">
            {formatMessageTime(message.createdAt)}
          </span>
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

// Separate the model's work chain (tool calls + intermediate prose) from the
// final response paragraph. Heuristic: everything up to and including the last
// tool part is "chain"; any trailing text part is the final answer. If there
// are no tool parts, there's no chain — it's just a normal text response.
function splitChainAndFinal(parts: MessagePart[]): {
  chain: MessagePart[]
  final: TextPart | null
} {
  const hasTool = parts.some((p) => p.kind === 'tool')
  if (!hasTool) {
    const merged = parts
      .map((p) => (p.kind === 'text' ? p.text : ''))
      .join('')
      .trim()
    return { chain: [], final: merged.length > 0 ? { kind: 'text', text: merged } : null }
  }
  let lastToolIdx = -1
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].kind === 'tool') lastToolIdx = i
  }
  const chain = parts.slice(0, lastToolIdx + 1)
  const tail = parts.slice(lastToolIdx + 1)
  const trailingText = tail
    .map((p) => (p.kind === 'text' ? p.text : ''))
    .join('')
    .trim()
  return {
    chain,
    final: trailingText.length > 0 ? { kind: 'text', text: trailingText } : null
  }
}

// Sum elapsed time across all tool calls. While a tool is still running we
// extrapolate from its startedAt so the live timer ticks against wall clock,
// not stale durationMs. Falls back to the stream start if no tools have begun.
function computeWorkedMs(chain: MessagePart[], now: number): number {
  let total = 0
  for (const p of chain) {
    if (p.kind !== 'tool') continue
    if (p.status === 'running') total += Math.max(0, now - p.startedAt)
    else if (p.durationMs !== undefined) total += p.durationMs
  }
  return total
}

function WorkRollup({
  chain,
  isStreaming
}: {
  chain: MessagePart[]
  isStreaming: boolean
}): React.JSX.Element {
  // Default open while streaming so the user can watch progress; once the
  // stream completes, collapse so the final response stands alone. `override`
  // lets the user pin the panel open/closed regardless of streaming state.
  const [override, setOverride] = useState<boolean | null>(null)
  const open = override ?? isStreaming
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!isStreaming) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [isStreaming])

  const workedMs = computeWorkedMs(chain, now)
  const label = isStreaming
    ? `Working for ${formatDuration(workedMs)}`
    : `Worked for ${formatDuration(workedMs)}`
  const running = chain.find((p) => p.kind === 'tool' && p.status === 'running') as
    | ToolPart
    | undefined

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        aria-label={open ? 'Hide work chain' : 'Show work chain'}
        className="group/chip -ml-1 inline-flex w-fit max-w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-[13px] text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground"
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {isStreaming ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Terminal className="size-3.5" />
          )}
        </span>
        <span className="truncate">{label}</span>
        {running && isStreaming && !open && (
          <span className="truncate text-muted-foreground/60">· {toolLabel(running)}</span>
        )}
        <ChevronRight
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground/60 transition-transform',
            open && 'rotate-90'
          )}
        />
      </button>
      {open && (
        <div className="ml-5 flex flex-col gap-3 border-l border-white/10 pl-4">
          {chain.map((p, i) =>
            p.kind === 'text' ? (
              <div key={`c-t-${i}`} className="text-[13px] text-foreground/75 italic">
                <Markdown text={p.text} />
              </div>
            ) : (
              <ActionChip key={p.toolCallId} tool={p} />
            )
          )}
        </div>
      )}
    </div>
  )
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

interface DetailRow {
  verb: string
  target: string
  muted?: boolean
}

function buildDetailRows(tool: ToolPart): DetailRow[] {
  const args = (tool.args ?? {}) as { path?: string; content?: string }
  const path = args.path ?? ''
  switch (tool.name) {
    case 'read_file': {
      if (tool.status === 'error') {
        return [{ verb: 'Failed', target: path || 'file', muted: true }]
      }
      const result = tool.result as { content?: string } | undefined
      const lines =
        typeof result?.content === 'string' ? result.content.split('\n').length : undefined
      return [
        { verb: 'Read', target: path || 'file' },
        ...(lines !== undefined ? [{ verb: 'Lines', target: String(lines), muted: true }] : [])
      ]
    }
    case 'write_file': {
      if (tool.status === 'error') {
        return [{ verb: 'Failed', target: path || 'file', muted: true }]
      }
      const result = tool.result as { bytes?: number } | undefined
      const size =
        typeof args.content === 'string' ? args.content.length : (result?.bytes ?? undefined)
      return [
        { verb: 'Wrote', target: path || 'file' },
        ...(size !== undefined
          ? [{ verb: 'Size', target: `${size.toLocaleString()} chars`, muted: true }]
          : [])
      ]
    }
    case 'list_directory': {
      const result = tool.result as
        | { entries?: Array<{ name?: string; type?: 'file' | 'dir' }> }
        | undefined
      const entries = Array.isArray(result?.entries) ? result.entries : []
      if (entries.length === 0) {
        return [{ verb: 'Listed', target: path || '.', muted: true }]
      }
      return entries.map((e) => ({
        verb: e.type === 'dir' ? 'Folder' : 'Read',
        target: e.name || '(unknown)'
      }))
    }
    default:
      return [{ verb: 'Ran', target: tool.name }]
  }
}

function ToolDetails({ tool }: { tool: ToolPart }): React.JSX.Element {
  const rows = buildDetailRows(tool)
  const errorText = tool.error
  return (
    <div className="ml-5 flex flex-col gap-2 text-[13px] text-foreground/85">
      {errorText && (
        <div className="rounded-md bg-white/4 px-2.5 py-1.5 text-foreground/85">
          <span className="text-muted-foreground">Error:</span> {errorText}
        </div>
      )}
      {rows.length > 0 && (
        <div
          className={cn(
            rows.length > 10 ? 'max-h-64 overflow-auto pr-1' : '',
            'flex flex-col gap-0.5'
          )}
        >
          {rows.map((row, i) => (
            <div key={`${row.verb}-${row.target}-${i}`} className="flex items-baseline gap-2">
              <span
                className={cn(
                  'shrink-0 text-muted-foreground',
                  row.muted && 'text-muted-foreground/70'
                )}
              >
                {row.verb}
              </span>
              <span className={cn('truncate', row.muted && 'text-foreground/70')}>
                {row.target}
              </span>
            </div>
          ))}
        </div>
      )}
      {tool.durationMs !== undefined && (
        <div className="text-[11px] text-muted-foreground">{formatDuration(tool.durationMs)}</div>
      )}
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

// Time shown in the message footer. Same-day messages get clock time only;
// older messages include the month/day so the conversation timeline reads.
function formatMessageTime(ts: number): string {
  const d = new Date(ts)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return time
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${date}, ${time}`
}

// Pull file paths touched by this assistant turn out of its tool parts.
// Dedup by path, prefer the latest (write supersedes read).
function extractReferencedFiles(parts: MessagePart[] | undefined): string[] {
  if (!parts) return []
  const seen = new Map<string, number>()
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p.kind !== 'tool') continue
    if (p.status !== 'done') continue
    const args = (p.args ?? {}) as { path?: string }
    if (p.name === 'read_file' || p.name === 'write_file') {
      if (typeof args.path === 'string' && args.path.length > 0) seen.set(args.path, i)
    }
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([path]) => path)
}

function basename(p: string): string {
  const i = p.replace(/\\/g, '/').lastIndexOf('/')
  return i >= 0 ? p.slice(i + 1) : p
}

function extOf(p: string): string {
  const base = basename(p)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

function describeFile(p: string): string {
  const ext = extOf(p)
  if (!ext) return 'File'
  const map: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    json: 'JSON',
    md: 'Markdown',
    css: 'Stylesheet',
    html: 'HTML',
    yml: 'YAML',
    yaml: 'YAML',
    toml: 'TOML',
    py: 'Python',
    go: 'Go',
    rs: 'Rust'
  }
  const kind = map[ext] ?? ext.toUpperCase()
  return `${kind} · ${ext.toUpperCase()}`
}

function FileRefIcon({ path }: { path: string }): React.JSX.Element {
  const ext = extOf(path)
  const className = 'size-4 text-foreground/70'
  if (ext === 'json') return <FileJson className={className} />
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs'].includes(ext))
    return <FileCode2 className={className} />
  return <FileText className={className} />
}

function FileReferences({ paths }: { paths: string[] }): React.JSX.Element {
  return (
    <div className="flex flex-col divide-y divide-white/8 rounded-xl bg-white/4">
      {paths.map((p) => (
        <FileReferenceRow key={p} path={p} />
      ))}
    </div>
  )
}

function FileReferenceRow({ path }: { path: string }): React.JSX.Element {
  const openEditor = useChatStore((s) => s.openEditor)
  const openFile = useWorkspaceStore((s) => s.openFile)
  const [copied, setCopied] = useState(false)

  const handleOpenInEditor = (): void => {
    openEditor()
    void openFile(path)
  }
  const handleCopyPath = (): void => {
    void navigator.clipboard.writeText(path).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }
  const handleReveal = (): void => {
    void window.api.revealInFolder()
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/6">
        <FileRefIcon path={path} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-foreground/95">{basename(path)}</div>
        <div className="truncate text-[11.5px] text-muted-foreground">{describeFile(path)}</div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            className="gap-1 bg-white/6 text-foreground/85 hover:bg-white/12"
          >
            {copied ? 'Copied' : 'Open'}
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          <DropdownMenuItem onSelect={handleOpenInEditor}>Open in editor</DropdownMenuItem>
          <DropdownMenuItem onSelect={handleReveal}>Reveal in folder</DropdownMenuItem>
          <DropdownMenuItem onSelect={handleCopyPath}>Copy path</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
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
