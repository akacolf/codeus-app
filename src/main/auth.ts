import { BrowserWindow, app, ipcMain, safeStorage, shell, type WebContents } from 'electron'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { getAccountId } from './identity'

// Device-authorization-grant client. Drives the SignInGate in the renderer:
// the renderer asks `auth.start()`, the main process pops the browser via
// `shell.openExternal`, polls the website's /poll endpoint until the user
// approves or cancels, then persists the resulting session JWT inside
// safeStorage. The custom `qc-codeus://` protocol shortcuts polling once
// the OS hands us the deeplink, but polling stays as the durable fallback.

const QC_PROXY_BASE_URL = process.env.QC_PROXY_BASE_URL || 'https://api.quantumclub.sh/v1'

// Renderer-facing state. The same shape is mirrored by the auth store.
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

interface PersistedSession {
  token: string
  userId: string
  email: string
  expiresAt: number
}

const SessionFileSchema = z.object({
  token: z.string().min(1),
  userId: z.string().min(1),
  email: z.string(),
  expiresAt: z.number().int().positive()
})

// We split persistence: the JWT itself rides inside an encrypted blob via
// safeStorage (uses the OS keychain on macOS, Credential Vault on Windows,
// secret-service on Linux); the userId/email/expiresAt sit in a separate
// JSON file because they're not secrets and we want fast startup reads
// without touching keychain prompts.
function sessionEncPath(): string {
  return join(app.getPath('userData'), 'session.enc')
}
function sessionMetaPath(): string {
  return join(app.getPath('userData'), 'session.json')
}

let state: AuthState = { kind: 'unknown' }
let currentSession: PersistedSession | null = null
const subscribers = new Set<WebContents>()

function broadcast(): void {
  for (const wc of subscribers) {
    if (!wc.isDestroyed()) wc.send('auth:state', state)
  }
}

function setState(next: AuthState): void {
  state = next
  broadcast()
}

function loadPersistedSession(): PersistedSession | null {
  try {
    const encPath = sessionEncPath()
    const metaPath = sessionMetaPath()
    if (!existsSync(encPath) || !existsSync(metaPath)) return null
    if (!safeStorage.isEncryptionAvailable()) return null
    const enc = readFileSync(encPath)
    const token = safeStorage.decryptString(enc)
    const metaRaw = readFileSync(metaPath, 'utf8')
    const parsed = SessionFileSchema.safeParse({
      token,
      ...(JSON.parse(metaRaw) as Record<string, unknown>)
    })
    if (!parsed.success) return null
    if (parsed.data.expiresAt < Date.now()) return null
    return parsed.data
  } catch {
    return null
  }
}

function persistSession(session: PersistedSession): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      // No platform encryption — refuse to persist the token in plaintext.
      // The session stays in-memory for this run; on next launch the user
      // signs in again.
      console.warn('[auth] safeStorage unavailable; session held in memory only')
      return
    }
    const enc = safeStorage.encryptString(session.token)
    writeFileSync(sessionEncPath(), enc)
    writeFileSync(
      sessionMetaPath(),
      JSON.stringify(
        {
          userId: session.userId,
          email: session.email,
          expiresAt: session.expiresAt
        },
        null,
        2
      ),
      'utf8'
    )
  } catch (e) {
    console.error('[auth] failed to persist session:', e)
  }
}

function clearPersistedSession(): void {
  try {
    if (existsSync(sessionEncPath())) unlinkSync(sessionEncPath())
  } catch {
    /* ignore */
  }
  try {
    if (existsSync(sessionMetaPath())) unlinkSync(sessionMetaPath())
  } catch {
    /* ignore */
  }
}

// ---------- HTTP helpers -------------------------------------------------

interface InitResponse {
  deviceCode: string
  userCode: string
  linkUrl: string
  pollUrl: string
  expiresAt: number
  interval: number
}

const InitResponseSchema = z.object({
  deviceCode: z.string().min(1),
  userCode: z.string().min(1),
  linkUrl: z.string().url(),
  pollUrl: z.string().url(),
  expiresAt: z.number().int().positive(),
  interval: z.number().positive()
})

const PollTerminalSchema = z.object({
  status: z.enum(['denied', 'expired'])
})
const PollApprovedSchema = z.object({
  status: z.literal('approved'),
  sessionToken: z.string().min(1),
  userId: z.string().min(1),
  email: z.string(),
  expiresAt: z.number().int().positive()
})

async function initDeviceLink(): Promise<InitResponse> {
  const res = await fetch(`${QC_PROXY_BASE_URL}/device/link/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId: getAccountId() })
  })
  if (!res.ok) {
    throw new Error(`init failed (${res.status})`)
  }
  const json = (await res.json()) as unknown
  const parsed = InitResponseSchema.safeParse(json)
  if (!parsed.success) throw new Error('init response malformed')
  return parsed.data
}

type PollOutcome =
  | { kind: 'pending' }
  | { kind: 'denied' }
  | { kind: 'expired' }
  | { kind: 'approved'; session: PersistedSession }

async function pollOnce(pollUrl: string, deviceCode: string): Promise<PollOutcome> {
  const res = await fetch(pollUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceCode })
  })
  if (res.status === 202) return { kind: 'pending' }
  if (res.status === 410) {
    const json = (await res.json().catch(() => ({}))) as unknown
    const parsed = PollTerminalSchema.safeParse(json)
    if (parsed.success) return { kind: parsed.data.status }
    return { kind: 'expired' }
  }
  if (res.status === 200) {
    const json = (await res.json()) as unknown
    const parsed = PollApprovedSchema.safeParse(json)
    if (!parsed.success) throw new Error('approved response malformed')
    return {
      kind: 'approved',
      session: {
        token: parsed.data.sessionToken,
        userId: parsed.data.userId,
        email: parsed.data.email,
        expiresAt: parsed.data.expiresAt
      }
    }
  }
  throw new Error(`poll failed (${res.status})`)
}

// ---------- Flow controller ---------------------------------------------

interface ActiveFlow {
  deviceCode: string
  userCode: string
  pollUrl: string
  expiresAt: number
  intervalMs: number
  timer: NodeJS.Timeout | null
  cancelled: boolean
}

let active: ActiveFlow | null = null

function stopActiveFlow(): void {
  if (!active) return
  active.cancelled = true
  if (active.timer) clearTimeout(active.timer)
  active = null
}

function schedulePoll(flow: ActiveFlow, delayMs: number): void {
  flow.timer = setTimeout(() => {
    if (flow.cancelled) return
    void runPollTick(flow)
  }, delayMs)
}

async function runPollTick(flow: ActiveFlow): Promise<void> {
  if (flow.cancelled) return
  if (Date.now() > flow.expiresAt) {
    stopActiveFlow()
    setState({ kind: 'error', message: 'Sign-in timed out. Please try again.' })
    return
  }
  try {
    const outcome = await pollOnce(flow.pollUrl, flow.deviceCode)
    if (flow.cancelled) return
    if (outcome.kind === 'pending') {
      schedulePoll(flow, flow.intervalMs)
      return
    }
    if (outcome.kind === 'denied') {
      stopActiveFlow()
      setState({ kind: 'signed-out' })
      return
    }
    if (outcome.kind === 'expired') {
      stopActiveFlow()
      setState({ kind: 'error', message: 'Sign-in code expired. Please try again.' })
      return
    }
    // approved
    stopActiveFlow()
    currentSession = outcome.session
    persistSession(outcome.session)
    setState({
      kind: 'signed-in',
      userId: outcome.session.userId,
      email: outcome.session.email
    })
  } catch (e) {
    if (flow.cancelled) return
    // Network blip — back off and try again until the link expires.
    schedulePoll(flow, Math.min(flow.intervalMs * 2, 10_000))
    console.warn('[auth] poll error, retrying:', (e as Error).message)
  }
}

// ---------- Public API for the rest of main -----------------------------

export function getSessionToken(): string | null {
  return currentSession?.token ?? null
}

export function getAuthState(): AuthState {
  return state
}

// chat.ts calls this when the upstream returns 401 — almost always means the
// session JWT was revoked server-side or the secret rotated. Tear down state
// so the renderer flips to the sign-in gate.
export function onAuthRejected(): void {
  if (currentSession) {
    currentSession = null
    clearPersistedSession()
  }
  stopActiveFlow()
  setState({ kind: 'signed-out' })
}

async function startSignIn(): Promise<void> {
  if (active) {
    // Already mid-flow — just re-broadcast.
    setState(state)
    return
  }
  stopActiveFlow()
  setState({ kind: 'starting' })
  try {
    const init = await initDeviceLink()
    const flow: ActiveFlow = {
      deviceCode: init.deviceCode,
      userCode: init.userCode,
      pollUrl: init.pollUrl,
      expiresAt: init.expiresAt,
      intervalMs: Math.max(1000, Math.floor(init.interval * 1000)),
      timer: null,
      cancelled: false
    }
    active = flow
    setState({
      kind: 'awaiting-browser',
      userCode: init.userCode,
      linkUrl: init.linkUrl,
      expiresAt: init.expiresAt
    })
    await shell.openExternal(init.linkUrl)
    schedulePoll(flow, flow.intervalMs)
  } catch (e) {
    stopActiveFlow()
    setState({ kind: 'error', message: (e as Error).message || 'Could not start sign-in.' })
  }
}

function cancelSignIn(): void {
  if (!active) return
  stopActiveFlow()
  setState({ kind: 'signed-out' })
}

async function signOut(): Promise<void> {
  const token = currentSession?.token
  currentSession = null
  clearPersistedSession()
  stopActiveFlow()
  setState({ kind: 'signed-out' })
  if (!token) return
  try {
    await fetch(`${QC_PROXY_BASE_URL}/auth/signout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    })
  } catch (e) {
    // Best-effort: the server-side revoke can fail without affecting the
    // local sign-out. The token was already nuked from disk above.
    console.warn('[auth] server revoke failed:', (e as Error).message)
  }
}

// Custom-protocol deeplink — `qc-codeus://auth/callback?userCode=…&status=…`.
// We don't trust the query for state; it's a hint that the website finished
// confirming so we should poll once immediately rather than wait for the
// next interval. The polling loop is the source of truth.
export function handleAuthCallbackUrl(rawUrl: string): void {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'qc-codeus:') return
    if (!url.pathname.includes('auth/callback') && url.host !== 'auth') return
    if (!active) return
    const incomingCode = url.searchParams
      .get('userCode')
      ?.toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
    if (incomingCode && incomingCode !== active.userCode) return
    if (active.timer) clearTimeout(active.timer)
    const flow = active
    schedulePoll(flow, 50)
  } catch {
    /* ignore malformed deeplinks */
  }
}

// ---------- Bootstrap ---------------------------------------------------

export async function initAuth(): Promise<void> {
  const persisted = loadPersistedSession()
  if (persisted) {
    currentSession = persisted
    setState({ kind: 'signed-in', userId: persisted.userId, email: persisted.email })
    // Optionally verify against /whoami in the background to catch
    // server-side revocations early. Failure flips to signed-out.
    void verifyExistingSession()
  } else {
    setState({ kind: 'signed-out' })
  }
}

async function verifyExistingSession(): Promise<void> {
  const token = currentSession?.token
  if (!token) return
  try {
    const res = await fetch(`${QC_PROXY_BASE_URL}/auth/whoami`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.status === 401) onAuthRejected()
  } catch {
    // Offline at startup is fine; the next chat request will surface 401
    // if the token is bad.
  }
}

export function registerAuthIpc(): void {
  ipcMain.handle('auth:status', () => state)
  ipcMain.handle('auth:start', async () => {
    await startSignIn()
    return state
  })
  ipcMain.handle('auth:cancel', () => {
    cancelSignIn()
    return state
  })
  ipcMain.handle('auth:signout', async () => {
    await signOut()
    return state
  })

  // Forward state updates to any window that subscribes by sending its
  // webContents id once on creation. Simpler than tracking lifecycles —
  // BrowserWindow.getAllWindows() at broadcast time gives us the live set.
  ipcMain.on('auth:subscribe', (event) => {
    subscribers.add(event.sender)
    event.sender.on('destroyed', () => subscribers.delete(event.sender))
    event.sender.send('auth:state', state)
  })
}

// Convenience for index.ts: re-broadcast to a fresh BrowserWindow once its
// renderer finishes loading. Avoids races where the renderer subscribes
// before main has loaded the persisted session.
export function syncAuthStateToWindow(win: BrowserWindow): void {
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed()) win.webContents.send('auth:state', state)
  })
}
