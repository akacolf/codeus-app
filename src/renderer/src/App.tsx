import { useCallback, useEffect, useRef, useState } from 'react'
import { Home } from './components/Home'
import { SettingsDialog } from './components/SettingsDialog'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { Sidebar } from './components/Sidebar'
import { Splash } from './components/Splash'
import { TerminalPanel } from './components/TerminalPanel'
import { Thread } from './components/Thread'
import { Toolbar } from './components/Toolbar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from './components/ui/dialog'
import type { Chat, Message, View } from './lib/chat'
import { deriveTitle, genId, loadChats, saveChats } from './lib/chat'
import { useSettings } from './lib/settings'
import { matchShortcut } from './lib/shortcuts'

function revealInFolder(): void {
  void window.api.revealInFolder()
}

function App(): React.JSX.Element {
  const [booting, setBooting] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [chats, setChats] = useState<Chat[]>(() => loadChats())
  const [history, setHistory] = useState<View[]>([{ type: 'home' }])
  const [index, setIndex] = useState(0)
  const cancelRef = useRef<Map<string, () => void>>(new Map())
  const { settings } = useSettings()

  const view = history[index]
  const activeChat = view.type === 'chat' ? (chats.find((c) => c.id === view.chatId) ?? null) : null
  const canBack = index > 0
  const canForward = index < history.length - 1

  useEffect(() => {
    saveChats(chats)
  }, [chats])

  const navigate = useCallback(
    (next: View) => {
      setHistory((h) => [...h.slice(0, index + 1), next])
      setIndex(index + 1)
    },
    [index]
  )

  const back = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  const forward = useCallback(() => {
    setIndex((i) => Math.min(history.length - 1, i + 1))
  }, [history.length])

  const newChat = useCallback(() => {
    if (view.type === 'home') return
    navigate({ type: 'home' })
  }, [view, navigate])

  const selectChat = useCallback(
    (id: string) => {
      if (view.type === 'chat' && view.chatId === id) return
      navigate({ type: 'chat', chatId: id })
    },
    [view, navigate]
  )

  const startAssistantStream = useCallback(
    (chatId: string, history: Message[]) => {
      const assistantId = genId()
      const requestId = genId()

      setChats((cs) =>
        cs.map((c) =>
          c.id === chatId
            ? {
                ...c,
                error: undefined,
                streamingMessageId: assistantId,
                messages: [
                  ...c.messages,
                  { id: assistantId, role: 'assistant', text: '', createdAt: Date.now() }
                ]
              }
            : c
        )
      )

      const appendDelta = (delta: string): void => {
        setChats((cs) =>
          cs.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantId ? { ...m, text: m.text + delta } : m
                  )
                }
              : c
          )
        )
      }

      const finish = (errorMessage?: string): void => {
        cancelRef.current.delete(requestId)
        setChats((cs) =>
          cs.map((c) => {
            if (c.id !== chatId) return c
            const next: Chat = { ...c, streamingMessageId: undefined }
            if (errorMessage) {
              next.error = errorMessage
              next.messages = c.messages.filter(
                (m) => !(m.id === assistantId && m.text.length === 0)
              )
            }
            return next
          })
        )
      }

      const cancel = window.api.chat.start(
        {
          requestId,
          apiKey: settings.apiKey,
          model: settings.model,
          messages: history.map((m) => ({ role: m.role, content: m.text }))
        },
        {
          onChunk: appendDelta,
          onDone: () => finish(),
          onError: (m) => finish(m)
        }
      )
      cancelRef.current.set(requestId, cancel)
    },
    [settings.apiKey, settings.model]
  )

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const now = Date.now()
      const userMsg: Message = { id: genId(), role: 'user', text: trimmed, createdAt: now }

      if (view.type === 'home') {
        const chat: Chat = {
          id: genId(),
          title: deriveTitle(trimmed),
          messages: [userMsg],
          createdAt: now
        }
        setChats((cs) => [chat, ...cs])
        navigate({ type: 'chat', chatId: chat.id })
        startAssistantStream(chat.id, [userMsg])
      } else {
        const chatId = view.chatId
        const existing = chats.find((c) => c.id === chatId)
        const nextHistory = [...(existing?.messages ?? []), userMsg]
        setChats((cs) =>
          cs.map((c) => (c.id === chatId ? { ...c, messages: nextHistory, error: undefined } : c))
        )
        startAssistantStream(chatId, nextHistory)
      }
    },
    [view, navigate, chats, startAssistantStream]
  )

  const stopStreaming = useCallback(() => {
    cancelRef.current.forEach((cancel) => cancel())
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const inField =
        e.target instanceof HTMLElement &&
        (e.target.tagName === 'INPUT' ||
          e.target.tagName === 'TEXTAREA' ||
          e.target.isContentEditable)

      if (matchShortcut(e, { key: ',', mod: true })) {
        e.preventDefault()
        setSettingsOpen(true)
      } else if (matchShortcut(e, { key: '/', mod: true })) {
        e.preventDefault()
        setShortcutsOpen(true)
      } else if (matchShortcut(e, { key: 'b', mod: true })) {
        e.preventDefault()
        setSidebarOpen((v) => !v)
      } else if (matchShortcut(e, { key: 't', mod: true })) {
        e.preventDefault()
        setTerminalOpen((v) => !v)
      } else if (matchShortcut(e, { key: 'o', mod: true, shift: true })) {
        e.preventDefault()
        revealInFolder()
      } else if (!inField && matchShortcut(e, { key: 'n', mod: true })) {
        e.preventDefault()
        newChat()
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [newChat])

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <Toolbar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onBack={canBack ? back : undefined}
        onForward={canForward ? forward : undefined}
        onCompose={view.type === 'home' ? undefined : newChat}
        onOpenTerminal={() => setTerminalOpen((v) => !v)}
        onRevealInFolder={revealInFolder}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
      />
      <main className="min-h-0 flex-1">
        {activeChat ? (
          <Thread chat={activeChat} onSubmit={sendMessage} onStop={stopStreaming} />
        ) : (
          <Home
            onSubmit={sendMessage}
            onOpenTerminal={() => setTerminalOpen(true)}
            onReveal={revealInFolder}
          />
        )}
        <TerminalPanel open={terminalOpen} onClose={() => setTerminalOpen(false)} />
      </main>

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        chats={chats}
        activeChatId={activeChat?.id ?? null}
        onSelectChat={(id) => {
          selectChat(id)
          setSidebarOpen(false)
        }}
        onNewChat={() => {
          newChat()
          setSidebarOpen(false)
        }}
        onOpenSettings={() => {
          setSettingsOpen(true)
          setSidebarOpen(false)
        }}
        onOpenShortcuts={() => {
          setShortcutsOpen(true)
          setSidebarOpen(false)
        }}
        onOpenAbout={() => {
          setAboutOpen(true)
          setSidebarOpen(false)
        }}
        onBack={canBack ? back : undefined}
        onForward={canForward ? forward : undefined}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>About QC Codium</DialogTitle>
            <DialogDescription>Quantum Club’s research-preview agentic IDE.</DialogDescription>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-foreground/85">
            Built by Quantum Club. This is a research preview — agent execution, IPC streaming, and
            the editor pane are still landing.
          </p>
        </DialogContent>
      </Dialog>

      {booting && <Splash onDone={() => setBooting(false)} />}
    </div>
  )
}

export default App
