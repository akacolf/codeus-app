import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Home } from './components/Home'
import { Sidebar } from './components/Sidebar'
import { SignInGate } from './components/SignInGate'
import { Splash } from './components/Splash'
import { Thread } from './components/Thread'
import { Toolbar } from './components/Toolbar'
import { ConfirmDialog } from './components/ConfirmDialog'
import { UpdateBanner } from './components/UpdateBanner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from './components/ui/dialog'
import { Toaster } from './components/ui/sonner'
import { useSettings } from './lib/settings'
import { matchShortcut } from './lib/shortcuts'
import { useThemeEffect } from './lib/theme'
import { useChatStore } from './stores/chatStore'
import { isDirty, useWorkspaceStore } from './stores/workspaceStore'
import type { Chat } from './lib/chat'
import { getUsage, subscribeUsage, type UsageSnapshot } from './lib/usage'
import { useBillingStore } from './stores/billingStore'

const GitPanel = lazy(() =>
  import('./components/GitPanel').then((module) => ({ default: module.GitPanel }))
)
const SearchChatsDialog = lazy(() =>
  import('./components/SearchChatsDialog').then((module) => ({
    default: module.SearchChatsDialog
  }))
)
const SettingsPage = lazy(() =>
  import('./components/SettingsDialog').then((module) => ({ default: module.SettingsPage }))
)
const ShortcutsDialog = lazy(() =>
  import('./components/ShortcutsDialog').then((module) => ({
    default: module.ShortcutsDialog
  }))
)
const TerminalPanel = lazy(() =>
  import('./components/TerminalPanel').then((module) => ({ default: module.TerminalPanel }))
)
const TopupDialog = lazy(() =>
  import('./components/TopupDialog').then((module) => ({ default: module.TopupDialog }))
)
const Workspace = lazy(() =>
  import('./components/Workspace').then((module) => ({ default: module.Workspace }))
)

function revealInFolder(): void {
  void window.api.revealInFolder()
}

// Recency for the tray's recent-chats list: chats have no updatedAt, so fall
// back to the newest message timestamp (or the chat's createdAt if empty).
function lastActivity(chat: Chat): number {
  const last = chat.messages[chat.messages.length - 1]
  return Math.max(chat.createdAt, last?.createdAt ?? 0)
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

function SurfaceFallback(): React.JSX.Element {
  return <div className="h-full w-full bg-background" />
}

function App(): React.JSX.Element {
  const { settings } = useSettings()
  const [booting, setBooting] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(() => settings.openSidebarOnLaunch)
  const [searchOpen, setSearchOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [gitOpen, setGitOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalMounted, setTerminalMounted] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [gitInfo, setGitInfo] = useState<{ branch: string | null; dirtyCount: number } | null>(null)
  const [wasWindowFocused, setWasWindowFocused] = useState(true)
  const lastNotifiedMessageIdRef = useRef<string | null>(null)
  const [chrome, setChrome] = useState<{ fullscreen: boolean; maximized: boolean }>({
    fullscreen: false,
    maximized: false
  })
  const [projectCwd, setProjectCwd] = useState<string | undefined>(undefined)
  // Hoisted draft survives Home ↔ Thread transitions.
  const [draft, setDraft] = useState('')
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
  const queueMessageAction = useChatStore((s) => s.queueMessage)
  const topupOpen = useBillingStore((s) => s.topupOpen)

  const activeChat = view.type === 'chat' ? (chats.find((c) => c.id === view.chatId) ?? null) : null
  const activeChatId = activeChat?.id
  const activeChatTitle = activeChat?.title
  const activeChatStreamingMessageId = activeChat?.streamingMessageId
  const activeChatLastMessage = activeChat?.messages.at(-1)
  const isEditor = view.type === 'editor'
  const isSettings = view.type === 'settings'
  const anyStreaming = chats.some((c) => c.streamingMessageId !== undefined)
  const activeChatStreaming = activeChatStreamingMessageId !== undefined

  const openTerminalPanel = useCallback(() => {
    setTerminalMounted(true)
    setTerminalOpen(true)
  }, [])

  const toggleTerminalPanel = useCallback(() => {
    setTerminalMounted(true)
    setTerminalOpen((v) => !v)
  }, [])

  const sendMessage = useCallback(
    (text: string) => {
      const snapshot = {
        model: settings.model,
        workMode: settings.workMode,
        inferenceSpeed: settings.inferenceSpeed,
        projectCwd: settings.defaultProjectlessChat ? undefined : projectCwd
      }
      // followUpBehavior === 'queue': park the message until the current
      // stream wraps. 'steer' falls through to the cancel-and-restart path
      // already baked into sendMessage.
      if (settings.followUpBehavior === 'queue' && activeChatStreaming) {
        queueMessageAction(text, snapshot)
        return
      }
      sendMessageAction(text, snapshot)
    },
    [
      sendMessageAction,
      queueMessageAction,
      settings.model,
      settings.workMode,
      settings.inferenceSpeed,
      settings.followUpBehavior,
      settings.defaultProjectlessChat,
      projectCwd,
      activeChatStreaming
    ]
  )

  const settingsSnapshot = {
    model: settings.model,
    workMode: settings.workMode,
    inferenceSpeed: settings.inferenceSpeed,
    projectCwd: settings.defaultProjectlessChat ? undefined : projectCwd
  }

  useEffect(() => {
    void window.api.projectCwd().then(setProjectCwd)
    const unsub = window.api.onChromeState((s) => setChrome(s))
    const unsubProject = window.api.project.onChanged(({ cwd }) => setProjectCwd(cwd))
    return (): void => {
      unsub()
      unsubProject()
    }
  }, [])

  useEffect(() => {
    const onFocus = (): void => setWasWindowFocused(true)
    const onBlur = (): void => setWasWindowFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return (): void => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => {
    void window.api.powerSave.setPreventSleep(settings.preventSleepWhileRunning && anyStreaming)
    return (): void => {
      void window.api.powerSave.setPreventSleep(false)
    }
  }, [settings.preventSleepWhileRunning, anyStreaming])

  useEffect(() => {
    void window.api.tray.setEnabled(settings.showTrayIcon)
  }, [settings.showTrayIcon])

  useEffect(() => {
    void window.api.system.set({
      launchAtLogin: settings.launchAtLogin,
      startMinimized: settings.startMinimized,
      closeToTray: settings.closeToTray
    })
  }, [settings.launchAtLogin, settings.startMinimized, settings.closeToTray])

  useEffect(() => {
    const unsub = window.api.tray.onCommand((cmd, payload) => {
      if (cmd === 'new-chat') newChat()
      else if (cmd === 'open-terminal') openTerminalPanel()
      else if (cmd === 'reveal-project') revealInFolder()
      else if (cmd === 'open-chat' && payload) selectChat(payload)
      else if (cmd === 'check-updates') void window.api.updater.check()
      else if (cmd === 'restart') {
        if (useWorkspaceStore.getState().open.some(isDirty)) setConfirmRestart(true)
        else void window.api.app.restart()
      }
    })
    return (): void => unsub()
  }, [newChat, openTerminalPanel, selectChat])

  // Mirror the most-recently-active chats into the tray's "Recent chats"
  // submenu. Chats live in renderer localStorage, so the main process can't
  // read them — we push a lightweight {id,title} list whenever it changes.
  useEffect(() => {
    const recent = [...chats]
      .sort((a, b) => lastActivity(b) - lastActivity(a))
      .slice(0, 8)
      .map((c) => ({ id: c.id, title: c.title }))
    void window.api.tray.setRecentChats(recent)
  }, [chats])

  // Push today's local usage counters into the tray info line.
  useEffect(() => {
    const push = (s: UsageSnapshot): void =>
      void window.api.tray.setUsage(
        `Today: ${s.requests} ${s.requests === 1 ? 'request' : 'requests'}`
      )
    push(getUsage())
    return subscribeUsage(push)
  }, [])

  useEffect(() => {
    if (!activeChatId || !activeChatTitle) return
    if (activeChatStreamingMessageId !== undefined) return
    if (settings.completionNotifications === 'never') return
    if (settings.completionNotifications === 'unfocused' && wasWindowFocused) return
    if (
      !activeChatLastMessage ||
      activeChatLastMessage.role !== 'assistant' ||
      activeChatLastMessage.text.length === 0
    ) {
      return
    }
    if (lastNotifiedMessageIdRef.current === activeChatLastMessage.id) return
    if (!('Notification' in window)) return
    // If the assistant ended on a question, defer to the question-notification
    // setting; otherwise it's a plain completion.
    const endsWithQuestion = /\?\s*$/.test(activeChatLastMessage.text.trimEnd())
    if (endsWithQuestion && !settings.questionNotifications) return
    if (Notification.permission === 'granted') {
      lastNotifiedMessageIdRef.current = activeChatLastMessage.id
      const title = endsWithQuestion ? 'QC Codeus has a question' : 'QC Codeus finished'
      new Notification(title, { body: activeChatTitle })
    } else if (settings.permissionNotifications && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [
    activeChatId,
    activeChatTitle,
    activeChatStreamingMessageId,
    activeChatLastMessage,
    settings.completionNotifications,
    settings.permissionNotifications,
    settings.questionNotifications,
    wasWindowFocused
  ])

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
        toggleTerminalPanel()
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
  }, [newChat, openSettings, toggleTerminalPanel])

  const trafficLightInset = IS_MAC && !chrome.fullscreen

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <SignInGate>
        <Toolbar
          sidebarOpen={sidebarOpen}
          trafficLightInset={trafficLightInset}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onBack={canBack ? back : undefined}
          onForward={canForward ? forward : undefined}
          onCompose={view.type === 'home' ? undefined : newChat}
          onOpenEditor={isEditor ? closeEditor : openEditor}
          editorActive={isEditor}
          onOpenTerminal={toggleTerminalPanel}
          onOpenSettings={isSettings ? closeSettings : openSettings}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          onOpenAbout={() => setAboutOpen(true)}
        />
        <main className="min-h-0 flex-1">
          {isSettings ? (
            <Suspense fallback={<SurfaceFallback />}>
              <SettingsPage />
            </Suspense>
          ) : isEditor ? (
            <Suspense fallback={<SurfaceFallback />}>
              <Workspace />
            </Suspense>
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
              onOpenTerminal={openTerminalPanel}
              onReveal={revealInFolder}
              onOpenGit={() => setGitOpen(true)}
              branch={gitInfo?.branch ?? null}
              dirtyCount={gitInfo?.dirtyCount ?? 0}
              showSuggestions={settings.suggestedPrompts}
            />
          )}
          {terminalMounted && (
            <Suspense fallback={null}>
              <TerminalPanel open={terminalOpen} onClose={() => setTerminalOpen(false)} />
            </Suspense>
          )}
        </main>

        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          chats={chats}
          activeChatId={activeChat?.id ?? null}
          trafficLightInset={trafficLightInset}
          width={settings.sidebarWidth}
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

        {searchOpen && (
          <Suspense fallback={null}>
            <SearchChatsDialog
              open={searchOpen}
              onOpenChange={setSearchOpen}
              chats={chats}
              activeChatId={activeChat?.id ?? null}
              onSelectChat={(id) => selectChat(id)}
            />
          </Suspense>
        )}

        {shortcutsOpen && (
          <Suspense fallback={null}>
            <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
          </Suspense>
        )}

        <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>About QC Codeus</DialogTitle>
              <DialogDescription>Quantum Club’s research-preview agentic IDE.</DialogDescription>
            </DialogHeader>
            <p className="text-sm leading-relaxed text-foreground/85">
              Built by Quantum Club for focused agentic software work.
            </p>
          </DialogContent>
        </Dialog>

        {gitOpen && (
          <Suspense fallback={null}>
            <GitPanel open={gitOpen} onOpenChange={setGitOpen} />
          </Suspense>
        )}

        {topupOpen && (
          <Suspense fallback={null}>
            <TopupDialog />
          </Suspense>
        )}

        <UpdateBanner />

        <ConfirmDialog
          open={confirmRestart}
          onOpenChange={setConfirmRestart}
          title="Restart with unsaved files?"
          description="You have unsaved changes in the editor. Restarting now will discard them."
          confirmLabel="Restart anyway"
          destructive
          onConfirm={() => void window.api.app.restart()}
        />

        <Toaster />

        {booting && <Splash onDone={() => setBooting(false)} />}
      </SignInGate>
    </div>
  )
}

export default App
