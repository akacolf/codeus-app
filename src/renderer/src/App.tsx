import { useCallback, useEffect, useState } from 'react'
import { Home } from './components/Home'
import { SearchChatsDialog } from './components/SearchChatsDialog'
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
import { useSettings } from './lib/settings'
import { matchShortcut } from './lib/shortcuts'
import { useChatStore } from './stores/chatStore'

function revealInFolder(): void {
  void window.api.revealInFolder()
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

function App(): React.JSX.Element {
  const [booting, setBooting] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [chrome, setChrome] = useState<{ fullscreen: boolean; maximized: boolean }>({
    fullscreen: false,
    maximized: false
  })
  const [projectCwd, setProjectCwd] = useState<string | undefined>(undefined)
  const { settings } = useSettings()

  const chats = useChatStore((s) => s.chats)
  const view = useChatStore((s) => s.history[s.index])
  const canBack = useChatStore((s) => s.index > 0)
  const canForward = useChatStore((s) => s.index < s.history.length - 1)
  const back = useChatStore((s) => s.back)
  const forward = useChatStore((s) => s.forward)
  const newChat = useChatStore((s) => s.newChat)
  const selectChat = useChatStore((s) => s.selectChat)
  const sendMessageAction = useChatStore((s) => s.sendMessage)
  const stopStreaming = useChatStore((s) => s.stopStreaming)

  const activeChat = view.type === 'chat' ? (chats.find((c) => c.id === view.chatId) ?? null) : null

  const sendMessage = useCallback(
    (text: string) => sendMessageAction(text, { model: settings.model, projectCwd }),
    [sendMessageAction, settings.model, projectCwd]
  )

  useEffect(() => {
    void window.api.projectCwd().then(setProjectCwd)
    const unsub = window.api.onChromeState((s) => setChrome(s))
    return unsub
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
      } else if (matchShortcut(e, { key: 'k', mod: true })) {
        e.preventDefault()
        setSearchOpen((v) => !v)
      } else if (!inField && matchShortcut(e, { key: 'n', mod: true })) {
        e.preventDefault()
        newChat()
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [newChat])

  const trafficLightInset = IS_MAC && !chrome.fullscreen

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <Toolbar
        sidebarOpen={sidebarOpen}
        trafficLightInset={trafficLightInset}
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
        trafficLightInset={trafficLightInset}
        onSelectChat={(id) => {
          selectChat(id)
          setSidebarOpen(false)
        }}
        onNewChat={() => {
          newChat()
          setSidebarOpen(false)
        }}
        onOpenSearch={() => setSearchOpen(true)}
        onBack={canBack ? back : undefined}
        onForward={canForward ? forward : undefined}
      />

      <SearchChatsDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        chats={chats}
        activeChatId={activeChat?.id ?? null}
        onSelectChat={(id) => selectChat(id)}
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
