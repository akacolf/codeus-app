import { app, shell, BrowserWindow, ipcMain, nativeImage, screen } from 'electron'
import { spawn, spawnSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { userInfo } from 'os'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerChatIpc } from './chat'
import { registerFsIpc } from './fs'
import { registerGitIpc } from './git'
import { getActiveProjectCwd, registerProjectIpc } from './project'
import { killAllPtys, registerTerminalIpc } from './terminal'
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
    const width = Math.max(900, Number(parsed.width) || DEFAULT_WINDOW_STATE.width)
    const height = Math.max(600, Number(parsed.height) || DEFAULT_WINDOW_STATE.height)
    const state: WindowState = { width, height }
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      // Only honor a saved position if it lies on an attached display.
      const onScreen = screen.getAllDisplays().some((d) => {
        const { x, y, width: w, height: h } = d.workArea
        return parsed.x! >= x && parsed.y! >= y && parsed.x! < x + w && parsed.y! < y + h
      })
      if (onScreen) {
        state.x = parsed.x
        state.y = parsed.y
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

async function revealInFolder(): Promise<{ ok: boolean }> {
  shell.openPath(projectCwd())
  return { ok: true }
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

  mainWindow.on('ready-to-show', () => {
    if (saved.maximized) mainWindow.maximize()
    if (saved.fullscreen) mainWindow.setFullScreen(true)
    mainWindow.show()
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

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  electronApp.setAppUserModelId('club.quantum.qccodeus')

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
  registerProjectIpc()
  registerChatIpc()
  registerFsIpc(projectCwd)
  registerTerminalIpc(projectCwd)
  registerGitIpc(projectCwd)
  registerUpdater()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  killAllPtys()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  killAllPtys()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
