import { app, shell, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerChatIpc } from './chat'
import { killAllPtys, registerTerminalIpc } from './terminal'

function projectCwd(): string {
  return process.env['QC_PROJECT_CWD'] || process.cwd()
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
      const candidates = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm']
      const term =
        candidates.find((c) => {
          try {
            return spawn('which', [c]).pid !== undefined
          } catch {
            return false
          }
        }) ?? 'xterm'
      spawn(term, [], { cwd, detached: true, stdio: 'ignore' }).unref()
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

async function revealInFolder(): Promise<{ ok: boolean }> {
  shell.openPath(projectCwd())
  return { ok: true }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 14 } : undefined,
    backgroundColor: '#000000',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

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
  electronApp.setAppUserModelId('club.quantum.qccodium')

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
  registerChatIpc()
  registerTerminalIpc(projectCwd)

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
