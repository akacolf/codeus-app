import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { randomBytes } from 'crypto'
import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { isAbsolute, join, normalize, sep } from 'path'
import { ipcMain } from 'electron'
import { getActiveProjectCwd } from './project'

const PROTOCOL_VERSION = '2025-06-18'
const SERVER_NAME = 'codeus-app'
const SERVER_VERSION = '0.1.0'

interface SelectionState {
  path: string
  startLine: number
  startCol: number
  endLine: number
  endCol: number
  text: string
}

interface OpenTab {
  path: string
  dirty: boolean
}

interface IdeState {
  activeFile: string | null
  openTabs: OpenTab[]
  selection: SelectionState | null
}

const ideState: IdeState = {
  activeFile: null,
  openTabs: [],
  selection: null
}

interface RpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: unknown
}

type RpcResponse =
  | { jsonrpc: '2.0'; id: string | number | null; result: unknown }
  | {
      jsonrpc: '2.0'
      id: string | number | null
      error: { code: number; message: string; data?: unknown }
    }

interface ResourceDescriptor {
  uri: string
  name: string
  description: string
  mimeType: string
  read(): Promise<{ text: string }>
}

function languageForPath(path: string): string {
  const ext = path.toLowerCase().split('.').pop() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    css: 'css',
    html: 'html',
    htm: 'html',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    rs: 'rust',
    go: 'go',
    py: 'python'
  }
  return map[ext] ?? 'plaintext'
}

function safeJoin(root: string, rel: string): string | null {
  if (isAbsolute(rel)) return null
  const joined = normalize(join(root, rel))
  const rootWithSep = root.endsWith(sep) ? root : root + sep
  if (joined !== root && !joined.startsWith(rootWithSep)) return null
  return joined
}

async function readActiveFile(): Promise<{
  path: string | null
  contents: string | null
  language: string | null
  error?: string
}> {
  const path = ideState.activeFile
  if (!path) return { path: null, contents: null, language: null }
  const root = getActiveProjectCwd()
  const abs = safeJoin(root, path)
  if (!abs) return { path, contents: null, language: null, error: 'path-outside-project' }
  try {
    const buf = await readFile(abs)
    if (buf.length > 1_000_000) {
      return {
        path,
        contents: null,
        language: languageForPath(path),
        error: 'file-too-large'
      }
    }
    return { path, contents: buf.toString('utf8'), language: languageForPath(path) }
  } catch (e) {
    return { path, contents: null, language: languageForPath(path), error: (e as Error).message }
  }
}

function listResources(): ResourceDescriptor[] {
  return [
    {
      uri: 'codeusapp://project/root',
      name: 'Project root',
      description: 'Absolute path of the project currently open in Codeus.',
      mimeType: 'text/plain',
      read: async () => ({ text: getActiveProjectCwd() })
    },
    {
      uri: 'codeusapp://project/active-file',
      name: 'Active editor file',
      description:
        'The file currently focused in the Codeus editor, including its on-disk contents.',
      mimeType: 'application/json',
      read: async () => ({ text: JSON.stringify(await readActiveFile(), null, 2) })
    },
    {
      uri: 'codeusapp://project/open-tabs',
      name: 'Open editor tabs',
      description: 'List of files currently open in the editor tab strip, with dirty state.',
      mimeType: 'application/json',
      read: async () => ({ text: JSON.stringify(ideState.openTabs, null, 2) })
    },
    {
      uri: 'codeusapp://project/selection',
      name: 'Current selection',
      description:
        'The text selection in the active editor (path, start/end line+column, selected text). Null when nothing is selected.',
      mimeType: 'application/json',
      read: async () => ({ text: JSON.stringify(ideState.selection, null, 2) })
    },
    {
      uri: 'codeusapp://project/terminal-cwd',
      name: 'Terminal working directory',
      description:
        'Working directory used by new terminal tabs. Currently mirrors the project root.',
      mimeType: 'text/plain',
      read: async () => ({ text: getActiveProjectCwd() })
    }
  ]
}

async function handleRpc(req: RpcRequest): Promise<RpcResponse | null> {
  const id = req.id ?? null
  const reply = (result: unknown): RpcResponse => ({ jsonrpc: '2.0', id, result })
  const fail = (code: number, message: string): RpcResponse => ({
    jsonrpc: '2.0',
    id,
    error: { code, message }
  })

  switch (req.method) {
    case 'initialize':
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { resources: { listChanged: false }, tools: {}, prompts: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
      })

    case 'notifications/initialized':
    case 'notifications/cancelled':
    case 'notifications/progress':
      return null

    case 'ping':
      return reply({})

    case 'tools/list':
      return reply({ tools: [] })

    case 'prompts/list':
      return reply({ prompts: [] })

    case 'resources/templates/list':
      return reply({ resourceTemplates: [] })

    case 'resources/list':
      return reply({
        resources: listResources().map((r) => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: r.mimeType
        }))
      })

    case 'resources/read': {
      const params = (req.params ?? {}) as { uri?: string }
      const target = listResources().find((r) => r.uri === params.uri)
      if (!target) return fail(-32602, `Unknown resource: ${params.uri}`)
      const { text } = await target.read()
      return reply({
        contents: [{ uri: target.uri, mimeType: target.mimeType, text }]
      })
    }

    default:
      return fail(-32601, `Method not found: ${req.method}`)
  }
}

function isLocalhostOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  try {
    const u = new URL(origin)
    return u.hostname === '127.0.0.1' || u.hostname === '::1' || u.hostname === 'localhost'
  } catch {
    return false
  }
}

interface McpServerHandle {
  port: number
  token: string
  url: string
  lockPath: string | null
  close: () => Promise<void>
}

let active: McpServerHandle | null = null

// Claude Code's IDE auto-discovery scans `~/.claude/ide/<port>.lock` files on
// startup. Writing one here lets `claude` running in our in-app terminal pick
// up Codeus as the active IDE without a manual `claude mcp add`.
// Schema is based on the format Claude Code's VS Code/JetBrains extensions
// emit — if Anthropic changes it upstream, this will need updating.
async function writeLockFile(port: number, token: string): Promise<string | null> {
  try {
    const dir = join(homedir(), '.claude', 'ide')
    await mkdir(dir, { recursive: true })
    const lockPath = join(dir, `${port}.lock`)
    const payload = {
      pid: process.pid,
      workspaceFolders: [getActiveProjectCwd()],
      ideName: 'Codeus',
      transport: 'http',
      url: `http://127.0.0.1:${port}/mcp`,
      authToken: token,
      runningInWindows: process.platform === 'win32'
    }
    await writeFile(lockPath, JSON.stringify(payload, null, 2), 'utf8')
    return lockPath
  } catch (e) {
    console.error('[mcp] failed to write lock file:', e)
    return null
  }
}

async function removeLockFile(lockPath: string | null): Promise<void> {
  if (!lockPath) return
  try {
    await unlink(lockPath)
  } catch {
    // best-effort
  }
}

// Rewrite the lock file whenever the active project changes so Claude Code
// sees up-to-date workspace folders.
export async function refreshMcpLockFile(): Promise<void> {
  if (!active) return
  const path = await writeLockFile(active.port, active.token)
  active.lockPath = path
}

async function readBody(req: IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 1_000_000) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,authorization,mcp-session-id'
  })
  res.end(text)
}

function authorized(req: IncomingMessage, token: string): boolean {
  const auth = req.headers['authorization']
  if (typeof auth === 'string' && auth.toLowerCase() === `bearer ${token.toLowerCase()}`) {
    return true
  }
  // Fallback: token in query string for ergonomic copy-paste into `claude mcp add`.
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    return url.searchParams.get('token') === token
  } catch {
    return false
  }
}

export async function startMcpServer(): Promise<McpServerHandle> {
  if (active) return active

  const token = randomBytes(24).toString('base64url')

  const server: Server = createServer(async (req, res) => {
    // Origin check — refuse cross-origin requests from non-localhost pages.
    if (!isLocalhostOrigin(req.headers.origin as string | undefined)) {
      res.writeHead(403).end()
      return
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST,GET,OPTIONS',
        'access-control-allow-headers': 'content-type,authorization,mcp-session-id',
        'access-control-max-age': '600'
      })
      res.end()
      return
    }

    if (!authorized(req, token)) {
      sendJson(res, 401, { error: 'unauthorized' })
      return
    }

    const path = (req.url ?? '/').split('?')[0]
    if (path !== '/mcp') {
      sendJson(res, 404, { error: 'not-found' })
      return
    }

    if (req.method === 'GET') {
      // No server-initiated notifications in v0 — keep GET trivially valid for clients
      // that probe the SSE channel.
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'access-control-allow-origin': '*'
      })
      // Send a comment so the connection is established, then close.
      res.write(': codeus-app mcp\n\n')
      res.end()
      return
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }

    let payload: unknown
    try {
      const body = await readBody(req)
      payload = body ? JSON.parse(body) : null
    } catch (e) {
      sendJson(res, 400, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: `Parse error: ${(e as Error).message}` }
      })
      return
    }

    const handleOne = async (msg: unknown): Promise<RpcResponse | null> => {
      if (!msg || typeof msg !== 'object') {
        return {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Invalid request' }
        }
      }
      const rpc = msg as RpcRequest
      if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
        return {
          jsonrpc: '2.0',
          id: rpc.id ?? null,
          error: { code: -32600, message: 'Invalid request' }
        }
      }
      try {
        return await handleRpc(rpc)
      } catch (e) {
        return {
          jsonrpc: '2.0',
          id: rpc.id ?? null,
          error: { code: -32603, message: `Internal error: ${(e as Error).message}` }
        }
      }
    }

    if (Array.isArray(payload)) {
      const results = (await Promise.all(payload.map(handleOne))).filter(
        (r): r is RpcResponse => r !== null
      )
      if (results.length === 0) {
        res.writeHead(202).end()
        return
      }
      sendJson(res, 200, results)
      return
    }

    const result = await handleOne(payload)
    if (result === null) {
      res.writeHead(202).end()
      return
    }
    sendJson(res, 200, result)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Failed to bind MCP server')
  }
  const port = address.port
  const url = `http://127.0.0.1:${port}/mcp?token=${token}`

  const lockPath = await writeLockFile(port, token)

  active = {
    port,
    token,
    url,
    lockPath,
    close: async () => {
      await removeLockFile(active?.lockPath ?? lockPath)
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
    }
  }
  return active
}

export function getMcpInfo(): { url: string; port: number; token: string } | null {
  if (!active) return null
  return { url: active.url, port: active.port, token: active.token }
}

export async function stopMcpServer(): Promise<void> {
  if (!active) return
  const handle = active
  active = null
  await handle.close()
}

const stateSchema = {
  isStringOrNull(v: unknown): v is string | null {
    return v === null || typeof v === 'string'
  },
  isOpenTabs(v: unknown): v is OpenTab[] {
    return (
      Array.isArray(v) &&
      v.every(
        (t) =>
          t &&
          typeof t === 'object' &&
          typeof (t as OpenTab).path === 'string' &&
          typeof (t as OpenTab).dirty === 'boolean'
      )
    )
  },
  isSelection(v: unknown): v is SelectionState | null {
    if (v === null) return true
    if (!v || typeof v !== 'object') return false
    const s = v as SelectionState
    return (
      typeof s.path === 'string' &&
      typeof s.startLine === 'number' &&
      typeof s.startCol === 'number' &&
      typeof s.endLine === 'number' &&
      typeof s.endCol === 'number' &&
      typeof s.text === 'string'
    )
  }
}

export function registerMcpIpc(): void {
  ipcMain.handle('mcp:getInfo', () => getMcpInfo())

  ipcMain.handle('mcp:updateState', (_e, raw: unknown) => {
    if (!raw || typeof raw !== 'object') return { ok: false as const, error: 'bad-payload' }
    const patch = raw as Partial<IdeState>
    if ('activeFile' in patch) {
      if (!stateSchema.isStringOrNull(patch.activeFile))
        return { ok: false as const, error: 'bad-activeFile' }
      ideState.activeFile = patch.activeFile
    }
    if ('openTabs' in patch) {
      if (!stateSchema.isOpenTabs(patch.openTabs))
        return { ok: false as const, error: 'bad-openTabs' }
      ideState.openTabs = patch.openTabs
    }
    if ('selection' in patch) {
      if (!stateSchema.isSelection(patch.selection))
        return { ok: false as const, error: 'bad-selection' }
      ideState.selection = patch.selection
    }
    return { ok: true as const }
  })
}
