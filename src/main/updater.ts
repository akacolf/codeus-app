import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'

export type UpdaterState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'not-available' }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string }

let currentState: UpdaterState = { kind: 'idle' }

function broadcast(state: UpdaterState): void {
  currentState = state
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('updater:state', state)
  }
}

export function registerUpdater(): void {
  // Dev runs don't have an installer to update; skip wiring.
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => broadcast({ kind: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) =>
    broadcast({ kind: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => broadcast({ kind: 'not-available' }))
  autoUpdater.on('download-progress', (p: ProgressInfo) =>
    broadcast({ kind: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info: UpdateInfo) =>
    broadcast({ kind: 'ready', version: info.version })
  )
  autoUpdater.on('error', (err: Error) =>
    broadcast({ kind: 'error', message: err?.message ?? String(err) })
  )

  ipcMain.handle('updater:getState', () => currentState)
  ipcMain.handle('updater:check', async () => {
    try {
      await autoUpdater.checkForUpdates()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle('updater:quitAndInstall', () => {
    autoUpdater.quitAndInstall()
    return { ok: true }
  })

  // Kick off an initial check shortly after launch, then poll every 6h.
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => undefined)
  }, 10_000)
  setInterval(
    () => {
      void autoUpdater.checkForUpdates().catch(() => undefined)
    },
    6 * 60 * 60 * 1000
  )
}
