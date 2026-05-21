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
// True only while a user-initiated check is in flight. Background polls run
// silently — any error/checking transitions during them are swallowed so the
// banner doesn't fire on app launch when no update feed is reachable.
let userInitiated = false

function broadcast(state: UpdaterState): void {
  currentState = state
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('updater:state', state)
  }
}

export function registerUpdater(): void {
  // Always register the IPC handlers — the renderer calls `updater:getState`
  // on every launch (including `bun run dev`), and a missing handler logs a
  // noisy "No handler registered" error to the main-process console.
  ipcMain.handle('updater:getState', () => currentState)
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return { ok: false, error: 'updates disabled in dev' }
    userInitiated = true
    try {
      await autoUpdater.checkForUpdates()
      return { ok: true }
    } catch (err) {
      userInitiated = false
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle('updater:quitAndInstall', () => {
    if (!app.isPackaged) return { ok: false, error: 'updates disabled in dev' }
    autoUpdater.quitAndInstall()
    return { ok: true }
  })

  // Dev runs have no installer to update — skip the autoUpdater wiring but
  // leave the IPC surface intact above.
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    if (userInitiated) broadcast({ kind: 'checking' })
  })
  autoUpdater.on('update-available', (info: UpdateInfo) =>
    broadcast({ kind: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => {
    if (userInitiated) broadcast({ kind: 'not-available' })
    userInitiated = false
  })
  autoUpdater.on('download-progress', (p: ProgressInfo) =>
    broadcast({ kind: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    broadcast({ kind: 'ready', version: info.version })
    userInitiated = false
  })
  autoUpdater.on('error', (err: Error) => {
    if (userInitiated) {
      broadcast({ kind: 'error', message: err?.message ?? String(err) })
    }
    userInitiated = false
  })

  // Silent background poll: initial check ~10s after launch, then every 6h.
  // `userInitiated` stays false so failures don't surface a banner.
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
