import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'

// macOS auto-update via Squirrel.Mac requires the app bundle to carry a valid
// Developer ID signature — it refuses to swap an unsigned/ad-hoc build, which
// is all we can ship without a paid Apple Developer account. So on macOS we
// don't self-install: we still *detect* new versions and surface them, but the
// "install" action opens the download page for a manual re-download. On
// Windows (NSIS) and Linux (AppImage) unsigned auto-update works, so those
// keep the full silent download + quitAndInstall flow.
const MAC_MANUAL_UPDATE = process.platform === 'darwin'
const DOWNLOAD_PAGE = 'https://quantumclub.sh/codeus'

export const updaterCanSelfInstall = !MAC_MANUAL_UPDATE

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
    userInitiated = true
    broadcast({ kind: 'checking' })
    if (!app.isPackaged) {
      setTimeout(() => {
        if (userInitiated) broadcast({ kind: 'not-available' })
        userInitiated = false
      }, 700)
      return { ok: true }
    }
    try {
      await autoUpdater.checkForUpdates()
      return { ok: true }
    } catch (err) {
      userInitiated = false
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle('updater:quitAndInstall', () => {
    // On macOS we can't self-install (see MAC_MANUAL_UPDATE) — open the
    // download page so the user can grab the new build manually.
    if (MAC_MANUAL_UPDATE) {
      void shell.openExternal(DOWNLOAD_PAGE)
      return { ok: true }
    }
    if (!app.isPackaged) return { ok: false, error: 'updates disabled in dev' }
    autoUpdater.quitAndInstall()
    return { ok: true }
  })
  ipcMain.handle('updater:canSelfInstall', () => updaterCanSelfInstall)

  // Dev runs have no installer to update — skip the autoUpdater wiring but
  // leave the IPC surface intact above.
  if (!app.isPackaged) return

  // macOS: detect only, never auto-download a payload we can't install.
  autoUpdater.autoDownload = !MAC_MANUAL_UPDATE
  autoUpdater.autoInstallOnAppQuit = !MAC_MANUAL_UPDATE

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
