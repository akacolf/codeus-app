import { useState, useRef, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'

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
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = viewportRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLElement | null
    el?.scrollTo({ top: el.scrollHeight })
  }, [messages])

  const send = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setBusy(true)
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      ts: Date.now()
    }
    setMessages((m) => [...m, userMsg])

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
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-10 shrink-0 items-center justify-between px-4 text-xs">
        <span className="font-medium">Agent</span>
        <span className="text-[10px] tracking-wider uppercase text-muted-foreground">stub</span>
      </div>

      <div ref={viewportRef} className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <ul className="flex flex-col gap-3 px-4 py-3">
            {messages.map((m) => (
              <li key={m.id} className="flex flex-col gap-1">
                <span className="text-[10px] tracking-wider uppercase text-muted-foreground">
                  {m.role}
                </span>
                <div
                  className={cn(
                    'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    m.role === 'user' && 'bg-primary text-primary-foreground',
                    m.role === 'agent' && 'bg-secondary text-secondary-foreground',
                    m.role === 'system' && 'bg-transparent text-muted-foreground italic'
                  )}
                >
                  {m.content}
                </div>
              </li>
            ))}
            {busy && <li className="text-xs italic text-muted-foreground">agent is thinking…</li>}
          </ul>
        </ScrollArea>
      </div>

      <div className="shrink-0 p-3">
        <div className="flex flex-col gap-2 rounded-3xl bg-input p-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask the agent…  (Enter to send, Shift+Enter for newline)"
            rows={2}
            className="min-h-9 resize-none bg-transparent p-0 text-sm"
          />
          <div className="flex items-center justify-end">
            <Button
              size="icon-sm"
              onClick={() => void send()}
              disabled={busy || !draft.trim()}
              aria-label="Send"
            >
              <ArrowUp />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
