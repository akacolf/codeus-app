import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Pencil, RefreshCw, RotateCw, ThumbsDown, ThumbsUp } from 'lucide-react'
import type { Chat, Message } from '@renderer/lib/chat'
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
  const endRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const streaming = chat.streamingMessageId !== undefined

  const stopStreaming = useChatStore((s) => s.stopStreaming)
  const regenerate = useChatStore((s) => s.regenerate)
  const editUserMessage = useChatStore((s) => s.editUserMessage)
  const retryAfterError = useChatStore((s) => s.retryAfterError)

  // Track whether the user is scrolled to the bottom — only auto-scroll when so.
  const onScroll = (): void => {
    const el = scrollerRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setAtBottom(distance <= AT_BOTTOM_TOLERANCE)
  }

  // Reset to bottom when switching chats.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAtBottom(true)
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
    })
  }, [chat.id])

  // While streaming or new messages arrive, only follow if user is at bottom.
  useEffect(() => {
    if (atBottom) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [chat.messages.length, atBottom])

  const handleRegenerate = (assistantId: string): void => regenerate(chat.id, assistantId, settings)
  const handleEdit = (messageId: string, text: string): void =>
    editUserMessage(chat.id, messageId, text, settings)
  const handleRetry = (): void => retryAfterError(chat.id, settings)

  return (
    <div className="flex h-full w-full flex-col">
      <div ref={scrollerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 py-8">
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

  return (
    <div className="group flex max-w-[85%] flex-col gap-1.5 self-start">
      <div className="text-sm leading-relaxed text-foreground/90">
        <Markdown text={message.text} />
        {isStreaming && (
          <span
            aria-hidden
            className="ml-1 inline-block size-2 translate-y-[-1px] animate-pulse rounded-full bg-foreground/70 align-middle"
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
