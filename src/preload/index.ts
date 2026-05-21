import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface ChatStartParams {
  requestId: string
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
}

export interface ChatHandlers {
  onChunk: (delta: string) => void
  onDone: () => void
  onError: (message: string) => void
}

function startChat(params: ChatStartParams, handlers: ChatHandlers): () => void {
  const { requestId } = params

  const chunk = (_e: IpcRendererEvent, p: { requestId: string; delta: string }): void => {
    if (p.requestId === requestId) handlers.onChunk(p.delta)
  }
  const done = (_e: IpcRendererEvent, p: { requestId: string }): void => {
    if (p.requestId === requestId) cleanup(() => handlers.onDone())
  }
  const err = (_e: IpcRendererEvent, p: { requestId: string; message: string }): void => {
    if (p.requestId === requestId) cleanup(() => handlers.onError(p.message))
  }

  const cleanup = (then: () => void): void => {
    ipcRenderer.off('chat:chunk', chunk)
    ipcRenderer.off('chat:done', done)
    ipcRenderer.off('chat:error', err)
    then()
  }

  ipcRenderer.on('chat:chunk', chunk)
  ipcRenderer.on('chat:done', done)
  ipcRenderer.on('chat:error', err)
  ipcRenderer.send('chat:start', params)

  return (): void => {
    ipcRenderer.send('chat:cancel', { requestId })
  }
}

interface TerminalListeners {
  onData: (data: string) => void
  onExit: (exitCode: number) => void
}

function openPty(
  ptyId: string,
  init: { cwd?: string; cols: number; rows: number },
  listeners: TerminalListeners
): {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  close: () => void
} {
  const onData = (_e: IpcRendererEvent, p: { ptyId: string; data: string }): void => {
    if (p.ptyId === ptyId) listeners.onData(p.data)
  }
  const onExit = (_e: IpcRendererEvent, p: { ptyId: string; exitCode: number }): void => {
    if (p.ptyId === ptyId) {
      listeners.onExit(p.exitCode)
      ipcRenderer.off('terminal:data', onData)
      ipcRenderer.off('terminal:exit', onExit)
    }
  }
  ipcRenderer.on('terminal:data', onData)
  ipcRenderer.on('terminal:exit', onExit)
  void ipcRenderer.invoke('terminal:open', { ptyId, ...init })

  return {
    write: (data) => ipcRenderer.send('terminal:write', { ptyId, data }),
    resize: (cols, rows) => ipcRenderer.send('terminal:resize', { ptyId, cols, rows }),
    close: () => {
      ipcRenderer.off('terminal:data', onData)
      ipcRenderer.off('terminal:exit', onExit)
      ipcRenderer.send('terminal:close', { ptyId })
    }
  }
}

export interface DirEntry {
  name: string
  path: string
  type: 'file' | 'dir'
}

export type FsListResult = { ok: true; entries: DirEntry[] } | { ok: false; error: string }
export type FsReadResult = { ok: true; content: string } | { ok: false; error: string }
export type FsWriteResult = { ok: true } | { ok: false; error: string }

const fsBridge = {
  listDir: (path?: string): Promise<FsListResult> => ipcRenderer.invoke('fs:listDir', { path }),
  readFile: (path: string): Promise<FsReadResult> => ipcRenderer.invoke('fs:readFile', { path }),
  writeFile: (path: string, content: string): Promise<FsWriteResult> =>
    ipcRenderer.invoke('fs:writeFile', { path, content })
}

export interface ChromeState {
  fullscreen: boolean
  maximized: boolean
}

function onChromeState(cb: (s: ChromeState) => void): () => void {
  const handler = (_e: IpcRendererEvent, s: ChromeState): void => cb(s)
  ipcRenderer.on('window:chrome', handler)
  return (): void => {
    ipcRenderer.off('window:chrome', handler)
  }
}

export type UpdaterState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'not-available' }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string }

function onUpdaterState(cb: (s: UpdaterState) => void): () => void {
  const handler = (_e: IpcRendererEvent, s: UpdaterState): void => cb(s)
  ipcRenderer.on('updater:state', handler)
  return (): void => {
    ipcRenderer.off('updater:state', handler)
  }
}

const updaterBridge = {
  getState: (): Promise<UpdaterState> => ipcRenderer.invoke('updater:getState'),
  check: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('updater:check'),
  quitAndInstall: (): Promise<{ ok: true }> => ipcRenderer.invoke('updater:quitAndInstall'),
  onState: onUpdaterState
}

const api = {
  openTerminal: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('open-terminal'),
  revealInFolder: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('reveal-in-folder'),
  projectCwd: (): Promise<string> => ipcRenderer.invoke('project-cwd'),
  osUserName: (): Promise<string> => ipcRenderer.invoke('os-username'),
  gitBranch: (): Promise<string | null> => ipcRenderer.invoke('git-branch'),
  onChromeState,
  chat: { start: startChat },
  fs: fsBridge,
  terminal: { open: openPty },
  updater: updaterBridge
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
