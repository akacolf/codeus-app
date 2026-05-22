import { app, type BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Subset of renderer settings the main process needs *before* the renderer
// boots (startMinimized) or independently of it (closeToTray, launchAtLogin —
// those react to OS-level events, not React effects). Mirrored to disk so the
// next launch has the right behavior without waiting for a renderer push.
export interface SystemSettings {
  launchAtLogin: boolean
  startMinimized: boolean
  closeToTray: boolean
}

const DEFAULTS: SystemSettings = {
  launchAtLogin: false,
  startMinimized: false,
  closeToTray: false
}

let state: SystemSettings = { ...DEFAULTS }

function statePath(): string {
  return join(app.getPath('userData'), 'system-settings.json')
}

function load(): SystemSettings {
  try {
    const raw = readFileSync(statePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<SystemSettings>
    return {
      launchAtLogin: Boolean(parsed.launchAtLogin),
      startMinimized: Boolean(parsed.startMinimized),
      closeToTray: Boolean(parsed.closeToTray)
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(): void {
  try {
    writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch {
    // best-effort
  }
}

function applyLoginItem(): void {
  // No-op on Linux — Electron doesn't implement loginItemSettings there. On
  // macOS and Windows, this is the canonical "Open at Login" hook.
  if (process.platform === 'linux') return
  try {
    app.setLoginItemSettings({
      openAtLogin: state.launchAtLogin,
      openAsHidden: state.startMinimized
    })
  } catch {
    // macOS rejects this in dev (unsigned binaries can't register login items).
    // Signed packaged builds succeed — swallow so dev console stays clean.
  }
}

export function loadSystemSettings(): SystemSettings {
  state = load()
  applyLoginItem()
  return state
}

export function getSystemSettings(): SystemSettings {
  return state
}

export function setSystemSettings(patch: Partial<SystemSettings>): SystemSettings {
  state = { ...state, ...patch }
  save()
  applyLoginItem()
  return state
}

// Returns the cleanup function to detach the listener.
export function wireCloseToTray(window: BrowserWindow, isQuitting: () => boolean): () => void {
  const handler = (event: Electron.Event): void => {
    if (isQuitting()) return
    if (!state.closeToTray) return
    event.preventDefault()
    window.hide()
  }
  window.on('close', handler)
  return (): void => {
    window.off('close', handler)
  }
}
