import { app, shell, BrowserWindow, ipcMain, nativeImage, powerSaveBlocker, screen } from 'electron'
import { spawn, spawnSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { userInfo } from 'os'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { handleAuthCallbackUrl, initAuth, registerAuthIpc, syncAuthStateToWindow } from './auth'
import { registerBillingIpc } from './billing'
import { registerChatIpc } from './chat'
import { registerFsIpc } from './fs'
import { registerGitIpc } from './git'
import { refreshMcpLockFile, registerMcpIpc, startMcpServer, stopMcpServer } from './mcp'
import { getActiveProjectCwd, onActiveProjectCwdChanged, registerProjectIpc } from './project'
import { registerSandboxIpc, stopAllSandboxes } from './sandbox'
import { getSystemSettings, loadSystemSettings, setSystemSettings, wireCloseToTray } from './system'
import { killAllPtys, registerTerminalIpc } from './terminal'
import { createTray, destroyTray, setTrayEnabled } from './tray'
import { registerUpdater } from './updater'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized?: boolean
  fullscreen?: boolean
}

const DEFAULT_WINDOW_STATE: WindowState = { width: 1400, height: 900 }

function windowStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): WindowState {
  try {
    const raw = readFileSync(windowStatePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<WindowState>
    let width = Math.max(900, Number(parsed.width) || DEFAULT_WINDOW_STATE.width)
    let height = Math.max(600, Number(parsed.height) || DEFAULT_WINDOW_STATE.height)
    const state: WindowState = { width, height }
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      // Find the display whose work area contains the saved top-left. If none
      // do (monitor was unplugged, resolution changed, etc.), drop the saved
      // position entirely so Electron centers a fresh window.
      const display = screen.getAllDisplays().find((d) => {
        const { x, y, width: w, height: h } = d.workArea
        return parsed.x! >= x && parsed.y! >= y && parsed.x! < x + w && parsed.y! < y + h
      })
      if (display) {
        const { x: dx, y: dy, width: dw, height: dh } = display.workArea
        // Clamp the *whole* window inside the display work area — checking only
        // the top-left used to let saved bounds bleed past the right/bottom
        // edges (e.g. after a monitor swap), so a sliver of chrome ended up
        // offscreen on launch.
        width = Math.min(width, dw)
        height = Math.min(height, dh)
        state.width = width
        state.height = height
        state.x = Math.min(Math.max(parsed.x!, dx), dx + dw - width)
        state.y = Math.min(Math.max(parsed.y!, dy), dy + dh - height)
      }
    }
    if (parsed.maximized) state.maximized = true
    if (parsed.fullscreen) state.fullscreen = true
    return state
  } catch {
    return { ...DEFAULT_WINDOW_STATE }
  }
}

function saveWindowState(state: WindowState): void {
  try {
    writeFileSync(windowStatePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch {
    // best-effort; ignore disk failures
  }
}

function projectCwd(): string {
  return getActiveProjectCwd()
}

async function openTerminal(): Promise<{ ok: boolean; error?: string }> {
  const cwd = projectCwd()
  try {
    if (process.platform === 'darwin') {
      spawn('open', ['-a', 'Terminal', cwd], { detached: true, stdio: 'ignore' }).unref()
    } else if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '', 'cmd.exe'], {
        cwd,
        detached: true,
        stdio: 'ignore',
        shell: true
      }).unref()
    } else {
      // `spawnSync('which', ...)` always returns a child; `status === 0` means the
      // binary is on PATH. The previous check used `.pid !== undefined`, which is
      // truthy as long as spawn succeeded — it never actually verified install.
      const candidates = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm']
      const term =
        candidates.find((c) => {
          const r = spawnSync('which', [c], { stdio: 'ignore' })
          return r.status === 0
        }) ?? 'xterm'
      spawn(term, [], { cwd, detached: true, stdio: 'ignore' }).unref()
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

function osUserName(): string {
  try {
    const info = userInfo()
    if (info.username) {
      // Title-case the OS login name as a friendly default.
      const u = info.username
      return u.charAt(0).toUpperCase() + u.slice(1)
    }
  } catch {
    /* ignore */
  }
  return ''
}

function gitBranch(): string | null {
  try {
    const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectCwd(),
      encoding: 'utf8'
    })
    if (r.status !== 0) return null
    const out = (r.stdout || '').trim()
    return out && out !== 'HEAD' ? out : null
  } catch {
    return null
  }
}

let preventSleepBlockerId: number | null = null

function setPreventSleep(active: boolean): { ok: true } {
  if (active && preventSleepBlockerId === null) {
    preventSleepBlockerId = powerSaveBlocker.start('prevent-display-sleep')
  } else if (!active && preventSleepBlockerId !== null) {
    powerSaveBlocker.stop(preventSleepBlockerId)
    preventSleepBlockerId = null
  }
  return { ok: true }
}

async function revealInFolder(): Promise<{ ok: boolean }> {
  shell.openPath(projectCwd())
  return { ok: true }
}

function resolveProjectRelative(relPath: string): string | null {
  const root = projectCwd()
  const abs = resolve(root, relPath)
  // Must stay inside the project root — never reveal arbitrary paths.
  if (!abs.startsWith(root)) return null
  return abs
}

async function revealPath(relPath: string): Promise<{ ok: boolean }> {
  const abs = resolveProjectRelative(relPath)
  if (!abs) return { ok: false }
  shell.showItemInFolder(abs)
  return { ok: true }
}

let mainWindowRef: BrowserWindow | null = null
let isQuitting = false

function getMainWindow(): BrowserWindow | null {
  return mainWindowRef && !mainWindowRef.isDestroyed() ? mainWindowRef : null
}

function createWindow(): void {
  const saved = loadWindowState()
  const mainWindow = new BrowserWindow({
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
    minWidth: 1100,
    minHeight: 700,
    center: saved.x === undefined,
    show: false,
    autoHideMenuBar: true,
    // macOS: hiddenInset keeps the traffic lights; Win/Linux: hide the native
    // title bar entirely and use Electron's overlay buttons so we don't render
    // two chrome strips.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay:
      process.platform !== 'darwin'
        ? { color: '#000000', symbolColor: '#cfcfcf', height: 40 }
        : undefined,
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 14 } : undefined,
    backgroundColor: '#000000',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindowRef = mainWindow
  mainWindow.on('closed', () => {
    if (mainWindowRef === mainWindow) mainWindowRef = null
  })
  wireCloseToTray(mainWindow, () => isQuitting)

  mainWindow.on('ready-to-show', () => {
    if (saved.maximized) mainWindow.maximize()
    if (saved.fullscreen) mainWindow.setFullScreen(true)
    // startMinimized: skip the initial show; the user can re-open from the
    // tray. Honors the same setting electron passes as openAsHidden at login.
    if (!getSystemSettings().startMinimized) mainWindow.show()
  })

  let saveTimer: NodeJS.Timeout | null = null
  const persistState = (): void => {
    if (mainWindow.isDestroyed()) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (mainWindow.isDestroyed()) return
      const bounds = mainWindow.getNormalBounds()
      saveWindowState({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        maximized: mainWindow.isMaximized(),
        fullscreen: mainWindow.isFullScreen()
      })
    }, 250)
  }
  mainWindow.on('resize', persistState)
  mainWindow.on('move', persistState)
  mainWindow.on('maximize', persistState)
  mainWindow.on('unmaximize', persistState)
  mainWindow.on('enter-full-screen', persistState)
  mainWindow.on('leave-full-screen', persistState)
  mainWindow.on('close', persistState)

  const emitChromeState = (): void => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send('window:chrome', {
      fullscreen: mainWindow.isFullScreen(),
      maximized: mainWindow.isMaximized()
    })
  }
  mainWindow.on('enter-full-screen', emitChromeState)
  mainWindow.on('leave-full-screen', emitChromeState)
  mainWindow.on('maximize', emitChromeState)
  mainWindow.on('unmaximize', emitChromeState)
  mainWindow.webContents.on('did-finish-load', emitChromeState)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Push the current auth state down once the renderer is ready so the
  // SignInGate has a definitive answer on first paint (no "unknown" flash).
  syncAuthStateToWindow(mainWindow)

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register the custom protocol so OS-handed deeplinks come back to us.
// On Win/Linux, dev mode needs the executable + script paths so the OS knows
// what to invoke; packaged builds use the registered exe automatically.
function registerCustomProtocol(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('qc-codeus', process.execPath, [resolve(process.argv[1])])
    }
  } else {
    app.setAsDefaultProtocolClient('qc-codeus')
  }
}

function deeplinkFromArgv(argv: string[]): string | null {
  return argv.find((a) => a.startsWith('qc-codeus://')) ?? null
}

// Single-instance: a second launch with a deeplink forwards it into the
// already-running app rather than spawning a duplicate window.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
    const url = deeplinkFromArgv(argv)
    if (url) handleAuthCallbackUrl(url)
  })
  // macOS delivers deeplinks through the dedicated open-url event instead of
  // argv. Cover both paths.
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleAuthCallbackUrl(url)
  })
  registerCustomProtocol()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  electronApp.setAppUserModelId('club.quantum.qccodeus')
  loadSystemSettings()

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(icon))
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('open-terminal', () => openTerminal())
  ipcMain.handle('reveal-in-folder', () => revealInFolder())
  ipcMain.handle('project-cwd', () => projectCwd())
  ipcMain.handle('os-username', () => osUserName())
  ipcMain.handle('git-branch', () => gitBranch())
  ipcMain.handle('power-save:set-prevent-sleep', (_event, active: boolean) =>
    setPreventSleep(Boolean(active))
  )
  ipcMain.handle('shell:reveal-path', (_event, rel: string) =>
    revealPath(typeof rel === 'string' ? rel : '')
  )
  const trayDeps = { getWindow: getMainWindow, getProjectCwd: projectCwd }
  ipcMain.handle('tray:set-enabled', (_event, enabled: boolean) => {
    setTrayEnabled(Boolean(enabled), trayDeps)
    return { ok: true as const }
  })
  ipcMain.handle(
    'system:set',
    (
      _event,
      patch: { launchAtLogin?: boolean; startMinimized?: boolean; closeToTray?: boolean }
    ) => {
      const cleaned: Record<string, boolean> = {}
      if (typeof patch.launchAtLogin === 'boolean') cleaned.launchAtLogin = patch.launchAtLogin
      if (typeof patch.startMinimized === 'boolean') cleaned.startMinimized = patch.startMinimized
      if (typeof patch.closeToTray === 'boolean') cleaned.closeToTray = patch.closeToTray
      return setSystemSettings(cleaned)
    }
  )
  ipcMain.handle('system:get', () => getSystemSettings())
  // Tray defaults to visible — the renderer reconciles to the persisted setting
  // once it mounts (a brief flicker is acceptable vs. a delayed appearance).
  createTray(trayDeps)
  registerProjectIpc()
  registerAuthIpc()
  void initAuth()
  registerChatIpc()
  registerBillingIpc()
  registerFsIpc(projectCwd)
  registerTerminalIpc(projectCwd)
  registerGitIpc(projectCwd)
  registerSandboxIpc()
  registerUpdater()
  registerMcpIpc()
  void startMcpServer().catch((err) => {
    console.error('[mcp] failed to start server:', err)
  })
  // Keep Claude Code's IDE auto-discovery lock file in sync with the active project.
  onActiveProjectCwdChanged(() => {
    void refreshMcpLockFile()
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Handle the case where Windows launched us via a deeplink — the URL is in
  // argv at startup, not delivered as a second-instance event. macOS arrives
  // through open-url which already fires.
  const initialDeeplink = deeplinkFromArgv(process.argv)
  if (initialDeeplink) handleAuthCallbackUrl(initialDeeplink)
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  killAllPtys()
  void stopAllSandboxes()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  killAllPtys()
  void stopAllSandboxes()
  void stopMcpServer()
  destroyTray()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
