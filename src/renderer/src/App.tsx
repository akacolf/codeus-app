import { useCallback, useEffect, useState } from 'react'
import { GitPanel } from './components/GitPanel'
import { Home } from './components/Home'
import { SearchChatsDialog } from './components/SearchChatsDialog'
import { SettingsPage } from './components/SettingsDialog'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { Sidebar } from './components/Sidebar'
import { Splash } from './components/Splash'
import { TerminalPanel } from './components/TerminalPanel'
import { Thread } from './components/Thread'
import { Toolbar } from './components/Toolbar'
import { UpdateBanner } from './components/UpdateBanner'
import { Workspace } from './components/Workspace'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from './components/ui/dialog'
import { useSettings } from './lib/settings'
import { matchShortcut } from './lib/shortcuts'
import { useThemeEffect } from './lib/theme'
import { useChatStore } from './stores/chatStore'
import { isDirty, useWorkspaceStore } from './stores/workspaceStore'

function revealInFolder(): void {
  void window.api.revealInFolder()
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

function App(): React.JSX.Element {
  const [booting, setBooting] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [gitOpen, setGitOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [gitInfo, setGitInfo] = useState<{ branch: string | null; dirtyCount: number } | null>(null)
  const [chrome, setChrome] = useState<{ fullscreen: boolean; maximized: boolean }>({
    fullscreen: false,
    maximized: false
  })
  const [projectCwd, setProjectCwd] = useState<string | undefined>(undefined)
  // Hoisted draft survives Home ↔ Thread transitions.
  const [draft, setDraft] = useState('')
  const { settings } = useSettings()
  useThemeEffect()

  const chats = useChatStore((s) => s.chats)
  const view = useChatStore((s) => s.history[s.index])
  const canBack = useChatStore((s) => s.index > 0)
  const canForward = useChatStore((s) => s.index < s.history.length - 1)
  const back = useChatStore((s) => s.back)
  const forward = useChatStore((s) => s.forward)
  const newChat = useChatStore((s) => s.newChat)
  const openEditor = useChatStore((s) => s.openEditor)
  const closeEditor = useChatStore((s) => s.closeEditor)
  const openSettings = useChatStore((s) => s.openSettings)
  const closeSettings = useChatStore((s) => s.closeSettings)
  const selectChat = useChatStore((s) => s.selectChat)
  const sendMessageAction = useChatStore((s) => s.sendMessage)

  const activeChat = view.type === 'chat' ? (chats.find((c) => c.id === view.chatId) ?? null) : null
  const isEditor = view.type === 'editor'
  const isSettings = view.type === 'settings'

  const sendMessage = useCallback(
    (text: string) => sendMessageAction(text, { model: settings.model, projectCwd }),
    [sendMessageAction, settings.model, projectCwd]
  )

  const settingsSnapshot = { model: settings.model, projectCwd }

  useEffect(() => {
    void window.api.projectCwd().then(setProjectCwd)
    const unsub = window.api.onChromeState((s) => setChrome(s))
    const unsubProject = window.api.project.onChanged(({ cwd }) => setProjectCwd(cwd))
    return (): void => {
      unsub()
      unsubProject()
    }
  }, [])

  // Poll git status: on project change, on focus, and every 8s while the window
  // is active. Cheap (one spawned `git` invocation per pulse).
  useEffect(() => {
    let cancelled = false
    const tick = async (): Promise<void> => {
      const s = await window.api.git.status()
      if (cancelled) return
      if (s.isRepo) setGitInfo({ branch: s.branch, dirtyCount: s.files.length })
      else setGitInfo({ branch: null, dirtyCount: 0 })
    }
    void tick()
    const interval = window.setInterval(() => void tick(), 8000)
    const onFocus = (): void => void tick()
    window.addEventListener('focus', onFocus)
    return (): void => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [projectCwd, gitOpen])

  // Warn before unload when any editor tab has unsaved changes. Electron honors
  // `event.returnValue = ''` and surfaces the native confirm dialog.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      const open = useWorkspaceStore.getState().open
      if (open.some(isDirty)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return (): void => window.removeEventListener('beforeunload', onBeforeUnload)
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
        openSettings()
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
  }, [newChat, openSettings])

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
        onOpenEditor={isEditor ? closeEditor : openEditor}
        editorActive={isEditor}
        onOpenTerminal={() => setTerminalOpen((v) => !v)}
        onOpenSettings={isSettings ? closeSettings : openSettings}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
      />
      <main className="min-h-0 flex-1">
        {isSettings ? (
          <SettingsPage />
        ) : isEditor ? (
          <Workspace />
        ) : activeChat ? (
          <Thread
            chat={activeChat}
            draft={draft}
            onDraftChange={setDraft}
            onSubmit={sendMessage}
            settings={settingsSnapshot}
          />
        ) : (
          <Home
            draft={draft}
            onDraftChange={setDraft}
            onSubmit={sendMessage}
            onOpenTerminal={() => setTerminalOpen(true)}
            onReveal={revealInFolder}
            onOpenConnectTool={() => setConnectOpen(true)}
            onOpenGit={() => setGitOpen(true)}
            branch={gitInfo?.branch ?? null}
            dirtyCount={gitInfo?.dirtyCount ?? 0}
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

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>About QC Codeus</DialogTitle>
            <DialogDescription>Quantum Club’s research-preview agentic IDE.</DialogDescription>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-foreground/85">
            Built by Quantum Club. This is a research preview — agent execution, IPC streaming, and
            the editor pane are still landing.
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect a tool</DialogTitle>
            <DialogDescription>
              Tool integrations are on the roadmap — first-class connectors aren’t live yet.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2 text-sm text-foreground/85">
            <li className="rounded-lg bg-foreground/5 px-3 py-2">
              Linear — pull issues, file tickets from a thread
            </li>
            <li className="rounded-lg bg-foreground/5 px-3 py-2">
              GitHub — open PRs, comment, run checks
            </li>
            <li className="rounded-lg bg-foreground/5 px-3 py-2">
              Vercel — deploy, inspect logs, read env
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Want one of these sooner?{' '}
            <a
              href="https://github.com/atomicfield/qc-codeus/issues"
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2"
            >
              Open an issue
            </a>
            .
          </p>
        </DialogContent>
      </Dialog>

      <GitPanel open={gitOpen} onOpenChange={setGitOpen} />

      <UpdateBanner />

      {booting && <Splash onDone={() => setBooting(false)} />}
    </div>
  )
}

export default App
