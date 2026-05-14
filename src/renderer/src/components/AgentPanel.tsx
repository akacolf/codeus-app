import { useState, useRef, useEffect } from 'react'

type Role = 'user' | 'agent' | 'system'

interface Message {
  id: string
  role: Role
  content: string
  ts: number
}

const INITIAL: Message[] = [
  {
    id: 'sys-0',
    role: 'system',
    content: 'QC Codium agent ready. No model wired up yet — this panel echoes for now.',
    ts: Date.now()
  }
]

export function AgentPanel(): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>(INITIAL)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const send = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setBusy(true)
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text, ts: Date.now() }
    setMessages((m) => [...m, userMsg])

    // Stub: no real model yet. Echo back after a brief delay.
    await new Promise((r) => setTimeout(r, 400))
    const reply: Message = {
      id: crypto.randomUUID(),
      role: 'agent',
      content: `(stub) I received: "${text}". Hook a model up in src/main and bridge via preload to make this real.`,
      ts: Date.now()
    }
    setMessages((m) => [...m, reply])
    setBusy(false)
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="flex h-full flex-col border-l border-[var(--color-border)] bg-[var(--color-panel)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-3 text-xs">
        <span className="font-medium text-[var(--color-fg)]">Agent</span>
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          stub
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li key={m.id} className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                {m.role}
              </span>
              <div
                className={
                  'rounded-md border px-3 py-2 text-sm leading-relaxed ' +
                  (m.role === 'user'
                    ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-fg)]'
                    : m.role === 'agent'
                      ? 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg)]'
                      : 'border-dashed border-[var(--color-border)] bg-transparent text-[var(--color-muted)]')
                }
              >
                {m.content}
              </div>
            </li>
          ))}
          {busy && (
            <li className="text-xs text-[var(--color-muted)] italic">agent is thinking…</li>
          )}
        </ul>
      </div>

      <div className="shrink-0 border-t border-[var(--color-border)] p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask the agent…  (Enter to send, Shift+Enter for newline)"
          rows={3}
          className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <div className="mt-1 flex items-center justify-end">
          <button
            onClick={() => void send()}
            disabled={busy || !draft.trim()}
            className="rounded-md border border-[var(--color-accent)]/60 bg-[var(--color-accent)]/15 px-3 py-1 text-xs font-medium text-[var(--color-fg)] hover:bg-[var(--color-accent)]/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
