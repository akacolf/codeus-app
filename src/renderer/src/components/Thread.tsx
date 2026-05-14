import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Square } from 'lucide-react'
import type { Chat, Message } from '@renderer/lib/chat'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { Composer } from './Composer'

interface ThreadProps {
  chat: Chat
  onSubmit: (text: string) => void
  onStop: () => void
}

export function Thread({ chat, onSubmit, onStop }: ThreadProps): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null)
  const streaming = chat.streamingMessageId !== undefined

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chat.id, chat.messages.length])

  return (
    <div className="flex h-full w-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 py-8">
          {chat.messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              isStreaming={m.id === chat.streamingMessageId}
            />
          ))}
          {chat.error && (
            <div className="self-start rounded-2xl bg-white/8 px-4 py-2.5 text-sm text-foreground/85">
              <span className="text-muted-foreground">Couldn’t reply: </span>
              {chat.error}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div className="w-full shrink-0 px-6 pb-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          {streaming && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={onStop}
                className="gap-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Square className="size-3 fill-current" />
                Stop generating
              </Button>
            </div>
          )}
          <Composer onSubmit={onSubmit} autoFocus />
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  isStreaming
}: {
  message: Message
  isStreaming: boolean
}): React.JSX.Element {
  if (message.role === 'user') {
    return (
      <div className="max-w-[80%] self-end rounded-2xl bg-input px-4 py-2.5 text-sm whitespace-pre-wrap">
        {message.text}
      </div>
    )
  }

  return (
    <div className="group flex max-w-[85%] flex-col gap-2 self-start">
      <div className="text-sm leading-relaxed text-foreground/90">
        <RenderedMarkdown text={message.text} />
        {isStreaming && (
          <span
            aria-hidden
            className="ml-1 inline-block size-2 translate-y-[-1px] animate-pulse rounded-full bg-foreground/70 align-middle"
          />
        )}
      </div>
      {!isStreaming && message.text.length > 0 && <CopyButton text={message.text} />}
    </div>
  )
}

function CopyButton({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
      className="inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      aria-label="Copy message"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// Tiny markdown subset: fenced code blocks + paragraphs + line breaks.
// Full markdown (lists, headings, inline emphasis, links) can swap in later.
function RenderedMarkdown({ text }: { text: string }): React.JSX.Element {
  const parts = splitFenced(text)
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'code' ? (
          <CodeBlock key={i} code={p.code} lang={p.lang} />
        ) : (
          <p
            key={i}
            className={cn('whitespace-pre-wrap', i > 0 && 'mt-3')}
          >
            {p.text}
          </p>
        )
      )}
    </>
  )
}

interface CodePart {
  kind: 'code'
  code: string
  lang: string
}
interface TextPart {
  kind: 'text'
  text: string
}
type Part = CodePart | TextPart

function splitFenced(text: string): Part[] {
  const parts: Part[] = []
  const regex = /```([^\n`]*)\n([\s\S]*?)(?:```|$)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) {
      const slice = text.slice(last, m.index)
      if (slice.trim().length > 0) parts.push({ kind: 'text', text: slice.replace(/^\n+|\n+$/g, '') })
    }
    parts.push({ kind: 'code', lang: m[1].trim(), code: m[2].replace(/\n$/, '') })
    last = regex.lastIndex
  }
  if (last < text.length) {
    const slice = text.slice(last)
    if (slice.trim().length > 0) parts.push({ kind: 'text', text: slice.replace(/^\n+|\n+$/g, '') })
  }
  if (parts.length === 0) parts.push({ kind: 'text', text })
  return parts
}

function CodeBlock({ code, lang }: { code: string; lang: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <div className="my-3 overflow-hidden rounded-xl bg-white/5">
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>{lang || 'code'}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            })
          }}
          className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-white/8 hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 pt-1 pb-3 font-mono text-[12.5px] leading-relaxed text-foreground/95">
        <code>{code}</code>
      </pre>
    </div>
  )
}
