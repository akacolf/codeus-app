import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface ChatStartParams {
  requestId: string
  model: string
  workMode?: 'coding' | 'everyday'
  inferenceSpeed?: 'standard' | 'fast' | 'deliberate'
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
}

export type ChatToolEvent =
  | {
      kind: 'start'
      requestId: string
      toolCallId: string
      name: string
      args: unknown
      startedAt: number
    }
  | {
      kind: 'end'
      requestId: string
      toolCallId: string
      status: 'done' | 'error'
      result?: unknown
      error?: string
      durationMs: number
    }
  | {
      kind: 'progress'
      requestId: string
      toolCallId: string
      stream: 'stdout' | 'stderr'
      chunk: string
      truncated?: boolean
    }

export interface ChatCommandApprovalEvent {
  requestId: string
  approvalId: string
  command: string
  args: string[]
  cwd: string
}

export type UndoWriteResult = { ok: true } | { ok: false; error: string }

export interface X402Envelope {
  x402Version?: 2
  error?: string
  accepts?: Array<{
    scheme?: 'exact' | string
    resource?: string
    network?: 'eip155:8453' | string
    asset?: string
    amount?: string
    payTo?: string
    price?: string
    maxTimeoutSeconds?: number
    description?: string
    mimeType?: string
  }>
  asset?: string
  price?: string
  amountMicros?: number
  paymentUrl?: string
}

export interface ChatHandlers {
  onChunk: (delta: string) => void
  onTool: (event: ChatToolEvent) => void
  onCommandApproval?: (event: ChatCommandApprovalEvent) => void
  onDone: () => void
  onError: (message: string) => void
  onPaymentRequired?: (envelope: X402Envelope) => void
}

function startChat(params: ChatStartParams, handlers: ChatHandlers): () => void {
  const { requestId } = params

  const chunk = (_e: IpcRendererEvent, p: { requestId: string; delta: string }): void => {
    if (p.requestId === requestId) handlers.onChunk(p.delta)
  }
  const toolEvt = (_e: IpcRendererEvent, p: ChatToolEvent): void => {
    if (p.requestId === requestId) handlers.onTool(p)
  }
  const done = (_e: IpcRendererEvent, p: { requestId: string }): void => {
    if (p.requestId === requestId) cleanup(() => handlers.onDone())
  }
  const err = (_e: IpcRendererEvent, p: { requestId: string; message: string }): void => {
    if (p.requestId === requestId) cleanup(() => handlers.onError(p.message))
  }
  const pay = (_e: IpcRendererEvent, p: { requestId: string; envelope: X402Envelope }): void => {
    if (p.requestId === requestId) handlers.onPaymentRequired?.(p.envelope)
  }
  const commandApproval = (_e: IpcRendererEvent, p: ChatCommandApprovalEvent): void => {
    if (p.requestId === requestId) handlers.onCommandApproval?.(p)
  }

  const cleanup = (then: () => void): void => {
    ipcRenderer.off('chat:chunk', chunk)
    ipcRenderer.off('chat:tool', toolEvt)
    ipcRenderer.off('chat:command-approval', commandApproval)
    ipcRenderer.off('chat:done', done)
    ipcRenderer.off('chat:error', err)
    ipcRenderer.off('chat:payment-required', pay)
    then()
  }

  ipcRenderer.on('chat:chunk', chunk)
  ipcRenderer.on('chat:tool', toolEvt)
  ipcRenderer.on('chat:command-approval', commandApproval)
  ipcRenderer.on('chat:done', done)
  ipcRenderer.on('chat:error', err)
  ipcRenderer.on('chat:payment-required', pay)
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
export type FsFindResult = { ok: true; files: string[] } | { ok: false; error: string }

const fsBridge = {
  listDir: (path?: string): Promise<FsListResult> => ipcRenderer.invoke('fs:listDir', { path }),
  readFile: (path: string): Promise<FsReadResult> => ipcRenderer.invoke('fs:readFile', { path }),
  writeFile: (path: string, content: string): Promise<FsWriteResult> =>
    ipcRenderer.invoke('fs:writeFile', { path, content }),
  findFiles: (query: string, limit = 40): Promise<FsFindResult> =>
    ipcRenderer.invoke('fs:findFiles', { query, limit })
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

export type TrayCommand =
  | 'new-chat'
  | 'open-terminal'
  | 'reveal-project'
  | 'open-chat'
  | 'check-updates'
  | 'restart'

function onTrayCommand(cb: (cmd: TrayCommand, payload?: string) => void): () => void {
  const handler = (_e: IpcRendererEvent, cmd: TrayCommand, payload?: string): void =>
    cb(cmd, payload)
  ipcRenderer.on('tray:command', handler)
  return (): void => {
    ipcRenderer.off('tray:command', handler)
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
  // false on macOS (unsigned builds can't self-install via Squirrel) — the
  // renderer routes the install action to the download page instead.
  canSelfInstall: (): Promise<boolean> => ipcRenderer.invoke('updater:canSelfInstall'),
  quitAndInstall: (): Promise<{ ok: true }> => ipcRenderer.invoke('updater:quitAndInstall'),
  onState: onUpdaterState
}

export interface ProjectChangeEvent {
  cwd: string
}

function onProjectChanged(cb: (e: ProjectChangeEvent) => void): () => void {
  const handler = (_e: IpcRendererEvent, p: ProjectChangeEvent): void => cb(p)
  ipcRenderer.on('project:changed', handler)
  return (): void => {
    ipcRenderer.off('project:changed', handler)
  }
}

const projectBridge = {
  cwd: (): Promise<string> => ipcRenderer.invoke('project:cwd'),
  recent: (): Promise<string[]> => ipcRenderer.invoke('project:recent'),
  pickFolder: (): Promise<
    { ok: true; cwd: string } | { ok: false; canceled?: boolean; error?: string }
  > => ipcRenderer.invoke('project:pickFolder'),
  setCwd: (path: string): Promise<{ ok: true; cwd: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('project:setCwd', { path }),
  clearRecent: (): Promise<{ ok: true }> => ipcRenderer.invoke('project:clearRecent'),
  onChanged: onProjectChanged
}

export interface GitFileChange {
  path: string
  index: string
  worktree: string
  staged: boolean
  untracked: boolean
}

export type GitStatus =
  | {
      isRepo: true
      branch: string | null
      upstream: string | null
      ahead: number
      behind: number
      files: GitFileChange[]
      hasRemote: boolean
    }
  | { isRepo: false }

export type GitResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string }

export interface GitWorktree {
  path: string
  branch: string | null
  head: string | null
  detached: boolean
  bare: boolean
  current: boolean
}

export interface GitCommit {
  hash: string
  subject: string
  author: string
  relativeDate: string
}

export type SandboxCredsState =
  | { ok: true; configured: true; teamId: string; projectId: string; tokenPreview: string }
  | { ok: false; configured: false }

interface SandboxListeners {
  onData: (data: string) => void
  onPrompt: () => void
}

function openSandbox(
  sandboxId: string,
  init: { cwd?: string },
  listeners: SandboxListeners
): {
  start: () => Promise<{ ok: true } | { ok: false; error: string }>
  run: (line: string) => Promise<{ ok: true } | { ok: false; error: string }>
  close: () => Promise<void>
} {
  const onData = (_e: IpcRendererEvent, p: { sandboxId: string; data: string }): void => {
    if (p.sandboxId === sandboxId) listeners.onData(p.data)
  }
  const onPrompt = (_e: IpcRendererEvent, p: { sandboxId: string }): void => {
    if (p.sandboxId === sandboxId) listeners.onPrompt()
  }
  ipcRenderer.on('sandbox:data', onData)
  ipcRenderer.on('sandbox:prompt', onPrompt)

  return {
    start: () => ipcRenderer.invoke('sandbox:open', { sandboxId, cwd: init.cwd }),
    run: (line) => ipcRenderer.invoke('sandbox:run', { sandboxId, line }),
    close: async () => {
      ipcRenderer.off('sandbox:data', onData)
      ipcRenderer.off('sandbox:prompt', onPrompt)
      await ipcRenderer.invoke('sandbox:close', { sandboxId })
    }
  }
}

const sandboxBridge = {
  getCreds: (): Promise<SandboxCredsState> => ipcRenderer.invoke('sandbox:creds:get'),
  setCreds: (creds: {
    token: string
    teamId: string
    projectId: string
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('sandbox:creds:set', creds),
  clearCreds: (): Promise<{ ok: true }> => ipcRenderer.invoke('sandbox:creds:clear'),
  open: openSandbox
}

export interface McpInfo {
  url: string
  port: number
  token: string
}

export interface McpOpenTab {
  path: string
  dirty: boolean
}

export interface McpSelection {
  path: string
  startLine: number
  startCol: number
  endLine: number
  endCol: number
  text: string
}

export interface McpStatePatch {
  activeFile?: string | null
  openTabs?: McpOpenTab[]
  selection?: McpSelection | null
}

export type BalanceResult =
  | {
      ok: true
      balanceMicros: number
      freeCreditMicros: number
      walletAddress: string | null
      activePlan: {
        planId: string
        status: 'active' | 'expired' | 'cancelled'
        currentPeriodStart: string
        currentPeriodEnd: string
        monthlyCreditMicros: number
      } | null
    }
  | { ok: false; error: string }

export type PaymentChain = 'base' | 'solana'

export type TopupQuoteResult =
  | {
      ok: true
      amountMicros: number
      recipient: string
      // CAIP-2 network id — Base (eip155:8453) or Solana (solana:5eykt4…).
      network: string
      asset: 'USDC'
      chain: PaymentChain
      paymentUrl: string
      expiresAt: string
    }
  | { ok: false; error: string }

const billingBridge = {
  getBalance: (): Promise<BalanceResult> => ipcRenderer.invoke('billing:getBalance'),
  requestTopup: (amountMicros: number, chain: PaymentChain = 'base'): Promise<TopupQuoteResult> =>
    ipcRenderer.invoke('billing:requestTopup', { amountMicros, chain })
}

export interface SuggestContext {
  branch: string | null
  dirtyCount: number
  commits: { subject: string; relativeDate?: string }[]
  files: string[]
  recentIntents: string[]
}

export type SuggestResult = { ok: true; suggestions: string[] } | { ok: false; error: string }

const suggestBridge = {
  home: (ctx: SuggestContext): Promise<SuggestResult> => ipcRenderer.invoke('suggest:home', ctx)
}

const mcpBridge = {
  getInfo: (): Promise<McpInfo | null> => ipcRenderer.invoke('mcp:getInfo'),
  updateState: (patch: McpStatePatch): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('mcp:updateState', patch)
}

export type AuthState =
  | { kind: 'unknown' }
  | { kind: 'signed-out' }
  | { kind: 'starting' }
  | {
      kind: 'awaiting-browser'
      userCode: string
      linkUrl: string
      expiresAt: number
    }
  | { kind: 'signed-in'; userId: string; email: string }
  | { kind: 'error'; message: string }

function onAuthState(cb: (state: AuthState) => void): () => void {
  const handler = (_e: IpcRendererEvent, state: AuthState): void => cb(state)
  ipcRenderer.on('auth:state', handler)
  ipcRenderer.send('auth:subscribe')
  return (): void => {
    ipcRenderer.off('auth:state', handler)
  }
}

const authBridge = {
  status: (): Promise<AuthState> => ipcRenderer.invoke('auth:status'),
  signIn: (): Promise<AuthState> => ipcRenderer.invoke('auth:start'),
  cancel: (): Promise<AuthState> => ipcRenderer.invoke('auth:cancel'),
  signOut: (): Promise<AuthState> => ipcRenderer.invoke('auth:signout'),
  onState: onAuthState
}

const gitBridge = {
  status: (): Promise<GitStatus> => ipcRenderer.invoke('git:status'),
  branches: (): Promise<GitResult<{ current: string | null; all: string[] }>> =>
    ipcRenderer.invoke('git:branches'),
  worktrees: (): Promise<GitResult<{ worktrees: GitWorktree[] }>> =>
    ipcRenderer.invoke('git:worktrees'),
  recentCommits: (limit = 10): Promise<GitResult<{ commits: GitCommit[] }>> =>
    ipcRenderer.invoke('git:recentCommits', { limit }),
  checkout: (name: string): Promise<GitResult> => ipcRenderer.invoke('git:checkout', { name }),
  createBranch: (name: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:createBranch', { name }),
  createWorktree: (params: {
    path: string
    branch: string
    startPoint?: string
  }): Promise<GitResult<{ path: string; branch: string; worktrees: GitWorktree[] }>> =>
    ipcRenderer.invoke('git:createWorktree', params),
  commit: (message: string, addAll = true): Promise<GitResult> =>
    ipcRenderer.invoke('git:commit', { message, addAll }),
  push: (opts?: { setUpstream?: boolean }): Promise<GitResult> =>
    ipcRenderer.invoke('git:push', opts ?? {}),
  pull: (): Promise<GitResult> => ipcRenderer.invoke('git:pull')
}

const api = {
  openTerminal: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('open-terminal'),
  revealInFolder: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('reveal-in-folder'),
  projectCwd: (): Promise<string> => ipcRenderer.invoke('project-cwd'),
  osUserName: (): Promise<string> => ipcRenderer.invoke('os-username'),
  gitBranch: (): Promise<string | null> => ipcRenderer.invoke('git-branch'),
  powerSave: {
    setPreventSleep: (active: boolean): Promise<{ ok: true }> =>
      ipcRenderer.invoke('power-save:set-prevent-sleep', active)
  },
  shell: {
    revealPath: (relPath: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('shell:reveal-path', relPath)
  },
  onChromeState,
  tray: {
    setEnabled: (enabled: boolean): Promise<{ ok: true }> =>
      ipcRenderer.invoke('tray:set-enabled', enabled),
    setRecentChats: (chats: { id: string; title: string }[]): Promise<{ ok: true }> =>
      ipcRenderer.invoke('tray:set-recent-chats', chats),
    setUsage: (label: string | null): Promise<{ ok: true }> =>
      ipcRenderer.invoke('tray:set-usage', label),
    onCommand: onTrayCommand
  },
  app: {
    restart: (): Promise<{ ok: true }> => ipcRenderer.invoke('app:restart')
  },
  system: {
    get: (): Promise<{ launchAtLogin: boolean; startMinimized: boolean; closeToTray: boolean }> =>
      ipcRenderer.invoke('system:get'),
    set: (patch: {
      launchAtLogin?: boolean
      startMinimized?: boolean
      closeToTray?: boolean
    }): Promise<{ launchAtLogin: boolean; startMinimized: boolean; closeToTray: boolean }> =>
      ipcRenderer.invoke('system:set', patch)
  },
  chat: {
    start: startChat,
    undoWrite: (token: string): Promise<UndoWriteResult> =>
      ipcRenderer.invoke('chat:undo-write', { token }),
    respondToCommandApproval: (decision: {
      approvalId: string
      approved: boolean
      remember?: boolean
      instruction?: string
    }): void => ipcRenderer.send('chat:command-approval:respond', decision)
  },
  fs: fsBridge,
  terminal: { open: openPty },
  updater: updaterBridge,
  project: projectBridge,
  git: gitBridge,
  sandbox: sandboxBridge,
  mcp: mcpBridge,
  suggest: suggestBridge,
  billing: billingBridge,
  auth: authBridge
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
