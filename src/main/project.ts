import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

interface ProjectState {
  cwd: string | null
  recent: string[]
}

const MAX_RECENT = 10

let state: ProjectState = { cwd: null, recent: [] }

function statePath(): string {
  return join(app.getPath('userData'), 'project-state.json')
}

function load(): void {
  try {
    const raw = readFileSync(statePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<ProjectState>
    state = {
      cwd: typeof parsed.cwd === 'string' && existsSync(parsed.cwd) ? parsed.cwd : null,
      recent: Array.isArray(parsed.recent)
        ? parsed.recent
            .filter((p): p is string => typeof p === 'string' && existsSync(p))
            .slice(0, MAX_RECENT)
        : []
    }
  } catch {
    state = { cwd: null, recent: [] }
  }
}

function save(): void {
  try {
    writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch {
    /* best effort */
  }
}

// Listeners notified on cwd change. We expose this hook instead of having
// project.ts reach into mcp.ts directly — mcp.ts depends on getActiveProjectCwd
// from this module, so a static back-edge would form a cycle.
type CwdListener = (cwd: string) => void
const cwdListeners: CwdListener[] = []
export function onActiveProjectCwdChanged(cb: CwdListener): () => void {
  cwdListeners.push(cb)
  return () => {
    const i = cwdListeners.indexOf(cb)
    if (i >= 0) cwdListeners.splice(i, 1)
  }
}

function broadcast(): void {
  const cwd = activeCwd()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('project:changed', { cwd })
  }
  for (const cb of cwdListeners) {
    try {
      cb(cwd)
    } catch (err) {
      console.error('[project] cwd listener threw:', err)
    }
  }
}

function activeCwd(): string {
  if (state.cwd && existsSync(state.cwd)) return state.cwd
  return process.env['QC_PROJECT_CWD'] || process.cwd()
}

function setCwd(next: string): void {
  if (!existsSync(next)) return
  state.cwd = next
  // Move to front of recent list.
  state.recent = [next, ...state.recent.filter((p) => p !== next)].slice(0, MAX_RECENT)
  save()
  broadcast()
}

export function getActiveProjectCwd(): string {
  return activeCwd()
}

export function registerProjectIpc(): void {
  load()

  ipcMain.handle('project:cwd', () => activeCwd())
  ipcMain.handle('project:recent', () => state.recent.slice())

  ipcMain.handle('project:pickFolder', async () => {
    const wins = BrowserWindow.getAllWindows()
    const focused = wins.find((w) => w.isFocused()) ?? wins[0]
    if (!focused) return { ok: false, error: 'no-window' }
    const result = await dialog.showOpenDialog(focused, {
      title: 'Open project folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: activeCwd()
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, canceled: true }
    }
    setCwd(result.filePaths[0])
    return { ok: true, cwd: result.filePaths[0] }
  })

  ipcMain.handle('project:setCwd', (_e, { path }: { path: string }) => {
    if (!path || !existsSync(path)) return { ok: false, error: 'not-found' }
    setCwd(path)
    return { ok: true, cwd: path }
  })

  ipcMain.handle('project:clearRecent', () => {
    state.recent = state.cwd ? [state.cwd] : []
    save()
    return { ok: true }
  })
}
