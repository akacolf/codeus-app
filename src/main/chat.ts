import { ipcMain, type WebContents } from 'electron'
import { stepCountIs, streamText, tool, type ModelMessage } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { posix, relative, resolve, sep } from 'path'
import { z } from 'zod'
import { getAccountId } from './identity'
import { getSessionToken, onAuthRejected } from './auth'
import { getActiveProjectCwd } from './project'

// x402 v2 payment requirements the proxy returns on 402. We don't validate
// them strictly here; the renderer just needs enough to prompt for a top-up.
interface X402Envelope {
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
  amountMicros?: number
  paymentUrl?: string
}

const StartParamsSchema = z.object({
  requestId: z.string().min(1),
  model: z.string().min(1),
  workMode: z.enum(['coding', 'everyday']).optional(),
  inferenceSpeed: z.enum(['standard', 'fast', 'deliberate']).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string()
      })
    )
    .min(1)
})

const CancelParamsSchema = z.object({ requestId: z.string().min(1) })
const UndoWriteParamsSchema = z.object({ token: z.string().min(1) })

type StartParams = z.infer<typeof StartParamsSchema>

// Vercel AI Gateway model IDs (provider/model format). Adjust if a model is
// renamed upstream — see https://vercel.com/ai-gateway/models for the current list.
// Lineup is biased toward cheap-but-capable models for the research preview.
const MODEL_MAP: Record<string, string> = {
  'sonnet-4.6': 'anthropic/claude-sonnet-4.6',
  'haiku-4.5': 'anthropic/claude-haiku-4.5',
  'gemini-3-flash': 'google/gemini-3-flash',
  'gpt-5-mini': 'openai/gpt-5-mini'
}

const QC_PROXY_BASE_URL = process.env.QC_PROXY_BASE_URL || 'https://api.quantumclub.sh/v1'

// Tool-loop budget. Real refactors routinely chain: list dir → read several
// files → write_file → typecheck → fix errors → write_file → typecheck. A
// cap of 10 truncates the model mid-fix; 25 covers typical multi-step work
// while still bounding runaway loops. AI Gateway pricing still constrains
// cost via per-token billing.
const MAX_TOOL_STEPS = 25
const MAX_FILE_BYTES = 1_000_000 // 1MB cap for tool reads
const MAX_COMMAND_OUTPUT_BYTES = 60_000
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000
const MAX_COMMAND_TIMEOUT_MS = 300_000
const HIDDEN_DIRS = new Set(['.git', 'node_modules', '.next', 'out', 'dist', '.cache', '.turbo'])

const inFlight = new Map<string, AbortController>()
const pendingCommandApprovals = new Map<
  string,
  { requestId: string; finish: (decision: CommandApprovalDecision) => void }
>()
const writeUndoSnapshots = new Map<
  string,
  { root: string; path: string; existed: boolean; content: string | null }
>()

// "Approve all commands" is scoped to a single stream, not the whole app
// session. Previously this was a top-level boolean — a user approving "yes
// for this session" in one chat silently auto-approved every subsequent
// run_command in every other chat, which is a real safety footgun. Now the
// flag is owned per-stream and reset when runStream starts.
type ApprovalScope = { approveAll: boolean }
const approvalScopeByRequest = new Map<string, ApprovalScope>()

interface CommandApprovalDecision {
  approved: boolean
  remember?: boolean
  instruction?: string
}

function send(wc: WebContents, channel: string, payload: unknown): void {
  if (!wc.isDestroyed()) wc.send(channel, payload)
}

function readPaymentRequired(res: Response): X402Envelope | null {
  const encoded = res.headers.get('PAYMENT-REQUIRED')
  if (!encoded) return null
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as X402Envelope
  } catch {
    return null
  }
}

export interface ChatUsageLimit {
  window: '5h' | 'week'
  limitMicros: number
  usedMicros: number
  resetAt: number
}

// Parse the proxy's 429 usage_limit body. Returns null for any other 429 (e.g.
// the IP rate limiter), so those keep flowing through the generic error path.
async function readUsageLimit(res: Response): Promise<ChatUsageLimit | null> {
  try {
    const body = (await res.clone().json()) as {
      error?: {
        type?: string
        window?: unknown
        limit_micros?: unknown
        used_micros?: unknown
        reset_at?: unknown
      }
    }
    const e = body.error
    if (!e || e.type !== 'usage_limit') return null
    if (e.window !== '5h' && e.window !== 'week') return null
    return {
      window: e.window,
      limitMicros: Number(e.limit_micros ?? 0),
      usedMicros: Number(e.used_micros ?? 0),
      resetAt: Number(e.reset_at ?? Date.now())
    }
  } catch {
    return null
  }
}

export type ToolStatus = 'running' | 'done' | 'error'

interface ToolStartPayload {
  requestId: string
  toolCallId: string
  name: string
  args: unknown
  startedAt: number
}

interface ToolEndPayload {
  requestId: string
  toolCallId: string
  status: Exclude<ToolStatus, 'running'>
  result?: unknown
  error?: string
  durationMs: number
}

interface ToolProgressPayload {
  requestId: string
  toolCallId: string
  stream: 'stdout' | 'stderr'
  chunk: string
  truncated?: boolean
}

function sendToolStart(wc: WebContents, p: ToolStartPayload): void {
  send(wc, 'chat:tool', { kind: 'start', ...p })
}

function sendToolEnd(wc: WebContents, p: ToolEndPayload): void {
  send(wc, 'chat:tool', { kind: 'end', ...p })
}

function sendToolProgress(wc: WebContents, p: ToolProgressPayload): void {
  send(wc, 'chat:tool', { kind: 'progress', ...p })
}

let toolSeq = 0
function genToolCallId(prefix: string): string {
  toolSeq = (toolSeq + 1) >>> 0
  return `${prefix}-${Date.now().toString(36)}-${toolSeq.toString(36)}`
}

function genApprovalId(): string {
  return `cmd-approval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function rememberWriteUndo(path: string, before: string | null): string {
  const token = genToolCallId('undo')
  writeUndoSnapshots.set(token, {
    root: getActiveProjectCwd(),
    path,
    existed: before !== null,
    content: before
  })
  while (writeUndoSnapshots.size > 50) {
    const oldest = writeUndoSnapshots.keys().next().value
    if (!oldest) break
    writeUndoSnapshots.delete(oldest)
  }
  return token
}

async function undoWrite(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const snapshot = writeUndoSnapshots.get(token)
  if (!snapshot) return { ok: false, error: 'undo expired' }
  writeUndoSnapshots.delete(token)
  try {
    const abs = resolveInRoot(snapshot.root, snapshot.path)
    if (snapshot.existed) {
      await fs.mkdir(resolve(abs, '..'), { recursive: true })
      await fs.writeFile(abs, snapshot.content ?? '', 'utf8')
    } else {
      await fs.unlink(abs)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// Resolve a project-relative path inside the active workspace, refusing any
// path that escapes the root. Tools must never touch files outside the project.
function resolveInRoot(root: string, rel: string): string {
  const norm = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  const abs = resolve(root, norm)
  const fromRoot = relative(root, abs)
  if (fromRoot.startsWith('..' + sep) || fromRoot === '..') {
    throw new Error(`path escapes project root: ${rel}`)
  }
  return abs
}

function resolveInProject(rel: string): string {
  return resolveInRoot(getActiveProjectCwd(), rel)
}

function displayPath(abs: string): string {
  const root = getActiveProjectCwd()
  const rel = relative(root, abs).replace(/\\/g, '/')
  return rel || '.'
}

function appendCapped(
  current: string,
  chunk: Buffer,
  cap: number
): { text: string; truncated: boolean } {
  if (current.length >= cap) return { text: current, truncated: true }
  const next = current + chunk.toString('utf8')
  if (next.length <= cap) return { text: next, truncated: false }
  return { text: next.slice(0, cap), truncated: true }
}

function textLines(text: string): string[] {
  if (text.length === 0) return []
  const lines = text.split(/\r\n|\n|\r/)
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

interface LineRange {
  startLine: number
  endLine: number
}

interface LineChangeStats {
  additions: number
  removals: number
  addedRanges: LineRange[]
  removedRanges: LineRange[]
}

function pushRange(ranges: LineRange[], line: number): void {
  const normalized = Math.max(1, line)
  const last = ranges[ranges.length - 1]
  if (last && last.endLine + 1 === normalized) {
    last.endLine = normalized
    return
  }
  ranges.push({ startLine: normalized, endLine: normalized })
}

function lineChangeStats(before: string, after: string): LineChangeStats {
  if (before === after) {
    return { additions: 0, removals: 0, addedRanges: [], removedRanges: [] }
  }
  const oldLines = textLines(before)
  const newLines = textLines(after)

  let start = 0
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  ) {
    start += 1
  }

  let oldEnd = oldLines.length - 1
  let newEnd = newLines.length - 1
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd -= 1
    newEnd -= 1
  }

  const oldMid = oldLines.slice(start, oldEnd + 1)
  const newMid = newLines.slice(start, newEnd + 1)
  const cells = oldMid.length * newMid.length
  if (cells > 300_000) {
    return {
      additions: newMid.length,
      removals: oldMid.length,
      addedRanges:
        newMid.length > 0 ? [{ startLine: start + 1, endLine: start + newMid.length }] : [],
      removedRanges:
        oldMid.length > 0 ? [{ startLine: start + 1, endLine: start + oldMid.length }] : []
    }
  }

  const dp: number[][] = Array.from({ length: oldMid.length + 1 }, () =>
    new Array<number>(newMid.length + 1).fill(0)
  )
  for (let oldIdx = 0; oldIdx < oldMid.length; oldIdx++) {
    for (let i = 0; i < newMid.length; i++) {
      dp[oldIdx + 1][i + 1] =
        oldMid[oldIdx] === newMid[i]
          ? dp[oldIdx][i] + 1
          : Math.max(dp[oldIdx][i + 1], dp[oldIdx + 1][i])
    }
  }

  const addedRanges: LineRange[] = []
  const removedRanges: LineRange[] = []
  let oldIdx = oldMid.length
  let newIdx = newMid.length
  while (oldIdx > 0 || newIdx > 0) {
    if (oldIdx > 0 && newIdx > 0 && oldMid[oldIdx - 1] === newMid[newIdx - 1]) {
      oldIdx -= 1
      newIdx -= 1
    } else if (newIdx > 0 && (oldIdx === 0 || dp[oldIdx][newIdx - 1] >= dp[oldIdx - 1][newIdx])) {
      pushRange(addedRanges, start + newIdx)
      newIdx -= 1
    } else if (oldIdx > 0) {
      pushRange(removedRanges, start + Math.max(1, newIdx + 1))
      oldIdx -= 1
    }
  }

  addedRanges.reverse()
  removedRanges.reverse()
  const unchanged = dp[oldMid.length][newMid.length]
  return {
    additions: newMid.length - unchanged,
    removals: oldMid.length - unchanged,
    addedRanges,
    removedRanges
  }
}

type ProgressCallback = (stream: 'stdout' | 'stderr', chunk: string, truncated: boolean) => void

async function toolStartArgs(name: string, args: unknown): Promise<unknown> {
  if (name !== 'write_file') return args
  const writeArgs = args as { path?: unknown; content?: unknown }
  if (typeof writeArgs.path !== 'string' || typeof writeArgs.content !== 'string') return args
  try {
    const abs = resolveInProject(writeArgs.path)
    let before: string | null = null
    try {
      before = await fs.readFile(abs, 'utf8')
    } catch {
      before = null
    }
    const stats =
      before === null
        ? {
            additions: textLines(writeArgs.content).length,
            removals: 0,
            addedRanges:
              textLines(writeArgs.content).length > 0
                ? [{ startLine: 1, endLine: textLines(writeArgs.content).length }]
                : [],
            removedRanges: []
          }
        : lineChangeStats(before, writeArgs.content)
    return {
      path: writeArgs.path,
      bytes: Buffer.byteLength(writeArgs.content, 'utf8'),
      created: before === null,
      ...stats
    }
  } catch {
    return { path: writeArgs.path }
  }
}

function runCommand({
  command,
  args,
  cwd,
  timeoutMs,
  signal,
  onProgress
}: {
  command: string
  args: string[]
  cwd: string
  timeoutMs: number
  signal: AbortSignal
  onProgress?: ProgressCallback
}): Promise<{
  ok: boolean
  command: string
  cwd: string
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  truncated: boolean
  error?: string
}> {
  return new Promise((resolveCommand) => {
    const started = spawn(command, args, {
      cwd,
      shell: false,
      env: {
        ...process.env,
        CI: process.env.CI ?? '1',
        NO_COLOR: process.env.NO_COLOR ?? '1',
        GIT_TERMINAL_PROMPT: '0'
      }
    })
    const rendered = [command, ...args].join(' ')
    let stdout = ''
    let stderr = ''
    let truncated = false
    let timedOut = false
    let settled = false

    const finish = (exitCode: number | null, error?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      const ok = exitCode === 0 && !timedOut && !error
      resolveCommand({
        ok,
        command: rendered,
        cwd: displayPath(cwd),
        exitCode,
        stdout,
        stderr,
        timedOut,
        truncated,
        error:
          error ??
          (timedOut
            ? `command timed out after ${timeoutMs}ms`
            : ok
              ? undefined
              : `command exited with code ${exitCode ?? 'unknown'}`)
      })
    }

    const abort = (): void => {
      started.kill('SIGTERM')
      finish(null, 'command cancelled')
    }

    const timer = setTimeout(() => {
      timedOut = true
      started.kill('SIGTERM')
    }, timeoutMs)

    signal.addEventListener('abort', abort, { once: true })

    started.stdout.on('data', (b: Buffer) => {
      const next = appendCapped(stdout, b, MAX_COMMAND_OUTPUT_BYTES)
      stdout = next.text
      truncated ||= next.truncated
      onProgress?.('stdout', b.toString('utf8'), truncated)
    })
    started.stderr.on('data', (b: Buffer) => {
      const next = appendCapped(stderr, b, MAX_COMMAND_OUTPUT_BYTES)
      stderr = next.text
      truncated ||= next.truncated
      onProgress?.('stderr', b.toString('utf8'), truncated)
    })
    started.on('close', (code) => finish(code))
    started.on('error', (e) => finish(null, e.message))
  })
}

function requestCommandApproval({
  wc,
  requestId,
  command,
  args,
  cwd,
  signal
}: {
  wc: WebContents
  requestId: string
  command: string
  args: string[]
  cwd: string
  signal: AbortSignal
}): Promise<CommandApprovalDecision> {
  const scope = approvalScopeByRequest.get(requestId)
  if (scope?.approveAll) return Promise.resolve({ approved: true })

  return new Promise((resolveDecision) => {
    const approvalId = genApprovalId()
    let settled = false

    const finish = (decision: CommandApprovalDecision): void => {
      if (settled) return
      settled = true
      pendingCommandApprovals.delete(approvalId)
      signal.removeEventListener('abort', abort)
      if (decision.approved && decision.remember && scope) {
        scope.approveAll = true
        // "Don't ask again" applies to the whole stream — auto-approve any
        // sibling commands already queued for this request so the user isn't
        // re-prompted for choices they've effectively already made. Snapshot
        // first since each finish() mutates pendingCommandApprovals.
        const siblings = [...pendingCommandApprovals.values()].filter(
          (e) => e.requestId === requestId
        )
        for (const sibling of siblings) sibling.finish({ approved: true })
      }
      resolveDecision(decision)
    }

    const abort = (): void => finish({ approved: false, instruction: 'cancelled' })

    pendingCommandApprovals.set(approvalId, { requestId, finish })
    signal.addEventListener('abort', abort, { once: true })
    send(wc, 'chat:command-approval', {
      requestId,
      approvalId,
      command,
      args,
      cwd: displayPath(cwd)
    })
  })
}

function systemPrompt({
  workMode,
  inferenceSpeed
}: {
  workMode?: 'coding' | 'everyday'
  inferenceSpeed?: 'standard' | 'fast' | 'deliberate'
}): string {
  const cwd = getActiveProjectCwd()
  // Sharpen the tone: agentic, concise, evidence-first. The citation format
  // matters — Markdown.tsx in the renderer turns `path:line` references into
  // clickable jump-to-line links, so the model gets a free UX win by following
  // the convention.
  return [
    'You are QC Codeus, the agent inside Quantum Club’s research-preview IDE.',
    '',
    `Active project: ${cwd}`,
    'Tools: read_file, write_file, list_directory, run_command — all scoped to the active project.',
    '',
    workMode === 'everyday'
      ? 'Mode: everyday work. Keep explanations approachable and avoid deep implementation detail unless the user asks.'
      : 'Mode: coding. Be precise about files, APIs, command outputs, and implementation tradeoffs.',
    inferenceSpeed === 'fast'
      ? 'Speed preference: fast. Prefer a short, high-confidence answer or narrow edit over exhaustive exploration.'
      : inferenceSpeed === 'deliberate'
        ? 'Speed preference: deliberate. Take extra care to verify code paths and edge cases before answering.'
        : 'Speed preference: standard. Balance speed with verification.',
    '',
    'Operating principles:',
    '- Be intelligent, concise, and direct. Skip filler ("Certainly!", "Of course!"). No throat-clearing.',
    '- Investigate before you answer. For any non-trivial question about the codebase, read or list the relevant files first. Never invent symbols, paths, or APIs you have not verified.',
    '- Cite specifics with project-relative `path/to/file.ext:LINE` — the IDE renders these as clickable jump links. Prefer one precise citation over a vague paragraph.',
    '- When the user writes `@path/to/file.ext` in their message, treat it as a strong hint that the file is central to the request. Read it before answering.',
    '- Use markdown deliberately: short paragraphs, tight bullet lists, code fences only for code, inline backticks for symbols and paths. Headings are rare.',
    '- When editing, send the full updated file via write_file (no diffs, no patches). After edits, summarize in 1–2 sentences and list the touched paths with line citations where useful.',
    '- Use run_command for development workflows that need verification or repository actions: git status/diff/add/commit, bun install/run/typecheck/lint/build/test, package scripts, formatters, generators, and similar project commands.',
    '- run_command executes without a shell. Pass the binary as `command` and arguments as `args` (for example command `git`, args [`status`, `--short`]). It is for finite commands; do not start watch mode, dev servers, or interactive prompts.',
    '- Before changing git state, inspect first (`git status --short`, and `git diff` when relevant). Only commit, push, install dependencies, or run destructive commands when the user has asked for that action or it is plainly necessary to complete their request.',
    '- If a request is ambiguous, ask one focused question. If it is clear, execute it without commentary.',
    '- Respect the user’s time: answer the actual question, then stop. Do not narrate plans you haven’t executed.'
  ].join('\n')
}

async function runStream(wc: WebContents, params: StartParams): Promise<void> {
  const { requestId, model, messages, workMode, inferenceSpeed } = params
  const controller = new AbortController()
  inFlight.set(requestId, controller)
  approvalScopeByRequest.set(requestId, { approveAll: false })

  // Custom fetch wraps every upstream call so we can (a) attach the
  // X-QC-Account hint the proxy uses during the legacy-fallback window for
  // balance migration, (b) catch 402 Payment Required and surface the x402
  // payment requirements to the renderer so it can pop the top-up dialog,
  // and (c) treat 401 as "session revoked" — we flip auth state to
  // signed-out so the renderer drops back to the gate.
  const authFetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set('X-QC-Account', getAccountId())
    const res = await fetch(input, { ...init, headers })
    if (res.status === 401) {
      onAuthRejected()
    }
    if (res.status === 402) {
      try {
        const envelope = readPaymentRequired(res) ?? ((await res.clone().json()) as X402Envelope)
        send(wc, 'chat:payment-required', { requestId, envelope })
      } catch {
        send(wc, 'chat:payment-required', { requestId, envelope: {} satisfies X402Envelope })
      }
    }
    if (res.status === 429) {
      // Rolling-cap rejection from the proxy. Surface the window + reset so the
      // renderer can explain it instead of treating it as a generic failure.
      // A bare 429 with no usage_limit body (e.g. IP rate limit) falls through
      // to the normal error path.
      const limit = await readUsageLimit(res)
      if (limit) send(wc, 'chat:usage-limited', { requestId, limit })
    }
    return res
  }

  try {
    const sessionToken = getSessionToken()
    if (!sessionToken) {
      send(wc, 'chat:error', {
        requestId,
        message: 'You are signed out. Sign in to continue.'
      })
      return
    }
    const provider = createOpenAICompatible({
      name: 'qc',
      baseURL: QC_PROXY_BASE_URL,
      apiKey: sessionToken,
      fetch: authFetch
    })
    const modelId = MODEL_MAP[model] ?? MODEL_MAP['sonnet-4.6']

    // Wraps a tool's execute body so we emit structured start/end events to the
    // renderer. The renderer turns these into action chips in the assistant bubble.
    const traced = <A, R>(
      name: string,
      run: (args: A, opts?: { toolCallId?: string }) => Promise<R>
    ): ((args: A, opts?: { toolCallId?: string }) => Promise<R>) => {
      return async (args, opts) => {
        const toolCallId = opts?.toolCallId ?? genToolCallId(name)
        const startedAt = Date.now()
        sendToolStart(wc, {
          requestId,
          toolCallId,
          name,
          args: await toolStartArgs(name, args),
          startedAt
        })
        try {
          const result = await run(args, { toolCallId })
          // `'error' in result` is true even when result.error is undefined —
          // run_command returns `{ ok: true, error: undefined, ... }` on
          // success, which used to mark every successful command as an error
          // in the UI. Check the actual value instead of the key's presence.
          const errVal =
            typeof result === 'object' && result !== null
              ? (result as { error?: unknown }).error
              : undefined
          const errStr = errVal == null ? undefined : String(errVal)
          sendToolEnd(wc, {
            requestId,
            toolCallId,
            status: errStr ? 'error' : 'done',
            result,
            error: errStr,
            durationMs: Date.now() - startedAt
          })
          return result
        } catch (e) {
          const message = (e as Error)?.message || 'tool error'
          sendToolEnd(wc, {
            requestId,
            toolCallId,
            status: 'error',
            error: message,
            durationMs: Date.now() - startedAt
          })
          throw e
        }
      }
    }

    const result = streamText({
      model: provider(modelId),
      system: systemPrompt({ workMode, inferenceSpeed }),
      messages: messages as ModelMessage[],
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      abortSignal: controller.signal,
      tools: {
        read_file: tool({
          description:
            'Read a UTF-8 text file inside the current project. Paths are project-relative (e.g., "src/main/index.ts"). Returns the file contents or an error.',
          inputSchema: z.object({
            path: z.string().describe('Project-relative path to the file.')
          }),
          execute: traced('read_file', async ({ path }) => {
            try {
              const abs = resolveInProject(path)
              const stat = await fs.stat(abs)
              if (!stat.isFile()) return { error: 'not a file' }
              if (stat.size > MAX_FILE_BYTES) {
                return { error: `file too large (${stat.size} bytes; cap is ${MAX_FILE_BYTES})` }
              }
              const content = await fs.readFile(abs, 'utf8')
              return { content }
            } catch (e) {
              return { error: (e as Error).message }
            }
          })
        }),
        write_file: tool({
          description:
            'Create or overwrite a UTF-8 text file inside the current project. Use only after you know what the file should contain — there is no undo. Paths are project-relative.',
          inputSchema: z.object({
            path: z.string().describe('Project-relative path to write.'),
            content: z.string().describe('Full file contents.')
          }),
          execute: traced('write_file', async ({ path, content }) => {
            try {
              const abs = resolveInProject(path)
              let before: string | null = null
              try {
                before = await fs.readFile(abs, 'utf8')
              } catch {
                before = null
              }
              await fs.mkdir(resolve(abs, '..'), { recursive: true })
              await fs.writeFile(abs, content, 'utf8')
              const stats =
                before === null
                  ? {
                      additions: textLines(content).length,
                      removals: 0,
                      addedRanges:
                        textLines(content).length > 0
                          ? [{ startLine: 1, endLine: textLines(content).length }]
                          : [],
                      removedRanges: []
                    }
                  : lineChangeStats(before, content)
              const undoToken = rememberWriteUndo(path, before)
              return {
                ok: true,
                bytes: Buffer.byteLength(content, 'utf8'),
                created: before === null,
                undoToken,
                ...stats
              }
            } catch (e) {
              return { error: (e as Error).message }
            }
          })
        }),
        list_directory: tool({
          description:
            'List files and subdirectories at a project-relative path (empty string for the project root). Hidden dirs like .git and node_modules are skipped.',
          inputSchema: z.object({
            path: z.string().default('').describe('Project-relative directory path.')
          }),
          execute: traced('list_directory', async ({ path }) => {
            try {
              const abs = resolveInProject(path)
              const dirents = await fs.readdir(abs, { withFileTypes: true })
              const entries = dirents
                .filter((d) => {
                  if (d.isDirectory() && HIDDEN_DIRS.has(d.name)) return false
                  return d.isDirectory() || d.isFile()
                })
                .map((d) => ({
                  name: d.name,
                  path: path ? posix.join(path, d.name) : d.name,
                  type: d.isDirectory() ? 'dir' : 'file'
                }))
                .sort((a, b) => {
                  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
                  return a.name.localeCompare(b.name)
                })
              return { entries }
            } catch (e) {
              return { error: (e as Error).message }
            }
          })
        }),
        run_command: tool({
          description:
            'Run a finite development command in the current project, such as git status/diff/add/commit, bun run typecheck, bun run lint, bun test, formatters, generators, or build scripts. Commands run without a shell, with project-scoped cwd, a timeout, and capped output.',
          inputSchema: z.object({
            command: z
              .string()
              .min(1)
              .describe('Executable to spawn, for example "git", "bun", "node", "make", or "gh".'),
            args: z
              .array(z.string())
              .default([])
              .describe('Arguments passed directly to the executable, without shell quoting.'),
            cwd: z
              .string()
              .default('')
              .describe(
                'Optional project-relative working directory. Empty string means project root.'
              ),
            timeoutMs: z
              .number()
              .int()
              .positive()
              .max(MAX_COMMAND_TIMEOUT_MS)
              .default(DEFAULT_COMMAND_TIMEOUT_MS)
              .describe('Timeout in milliseconds. Maximum is 300000.')
          }),
          execute: traced('run_command', async ({ command, args, cwd, timeoutMs }, opts) => {
            try {
              const workdir = resolveInProject(cwd)
              const stat = await fs.stat(workdir)
              if (!stat.isDirectory()) return { error: 'cwd is not a directory' }
              const approval = await requestCommandApproval({
                wc,
                requestId,
                command,
                args,
                cwd: workdir,
                signal: controller.signal
              })
              if (!approval.approved) {
                const instruction = approval.instruction?.trim()
                return {
                  error: 'command not approved',
                  command: [command, ...args].join(' '),
                  cwd: displayPath(workdir),
                  instruction:
                    instruction && instruction !== 'cancelled'
                      ? instruction
                      : 'The user declined this command.'
                }
              }
              // Debounce IPC progress events to avoid flooding the renderer.
              // Accumulate chunks per-stream and flush every PROGRESS_INTERVAL_MS.
              const PROGRESS_INTERVAL_MS = 100
              const toolCallId = opts?.toolCallId ?? ''
              const pending: { stdout: string; stderr: string; truncated: boolean } = {
                stdout: '',
                stderr: '',
                truncated: false
              }
              const flushProgress = (): void => {
                if (pending.stdout) {
                  sendToolProgress(wc, {
                    requestId,
                    toolCallId,
                    stream: 'stdout',
                    chunk: pending.stdout,
                    truncated: pending.truncated || undefined
                  })
                  pending.stdout = ''
                }
                if (pending.stderr) {
                  sendToolProgress(wc, {
                    requestId,
                    toolCallId,
                    stream: 'stderr',
                    chunk: pending.stderr,
                    truncated: pending.truncated || undefined
                  })
                  pending.stderr = ''
                }
              }
              const progressTimer = setInterval(flushProgress, PROGRESS_INTERVAL_MS)
              const onProgress: ProgressCallback = (stream, chunk, trunc) => {
                pending[stream] += chunk
                pending.truncated ||= trunc
              }
              try {
                return await runCommand({
                  command,
                  args,
                  cwd: workdir,
                  timeoutMs: Math.min(timeoutMs, MAX_COMMAND_TIMEOUT_MS),
                  signal: controller.signal,
                  onProgress
                })
              } finally {
                clearInterval(progressTimer)
                flushProgress() // flush any remaining buffered output
              }
            } catch (e) {
              return { error: (e as Error).message }
            }
          })
        })
      }
    })

    for await (const delta of result.textStream) {
      send(wc, 'chat:chunk', { requestId, delta })
    }
    send(wc, 'chat:done', { requestId })
  } catch (error) {
    const message = controller.signal.aborted
      ? 'cancelled'
      : (error as Error)?.message || 'Unknown error'
    send(wc, 'chat:error', { requestId, message })
  } finally {
    inFlight.delete(requestId)
    approvalScopeByRequest.delete(requestId)
  }
}

export function registerChatIpc(): void {
  ipcMain.on('chat:start', (event, raw: unknown) => {
    const parsed = StartParamsSchema.safeParse(raw)
    if (!parsed.success) {
      const fallbackId =
        typeof raw === 'object' &&
        raw !== null &&
        'requestId' in raw &&
        typeof (raw as { requestId: unknown }).requestId === 'string'
          ? (raw as { requestId: string }).requestId
          : 'unknown'
      send(event.sender, 'chat:error', {
        requestId: fallbackId,
        message: `Invalid chat params: ${parsed.error.issues
          .map((i) => `${i.path.join('.')} ${i.message}`)
          .join('; ')}`
      })
      return
    }
    void runStream(event.sender, parsed.data)
  })

  ipcMain.on('chat:cancel', (_event, raw: unknown) => {
    const parsed = CancelParamsSchema.safeParse(raw)
    if (!parsed.success) return
    inFlight.get(parsed.data.requestId)?.abort()
  })

  ipcMain.handle('chat:undo-write', (_event, raw: unknown) => {
    const parsed = UndoWriteParamsSchema.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'invalid params' }
    return undoWrite(parsed.data.token)
  })

  ipcMain.on('chat:command-approval:respond', (_event, raw: unknown) => {
    const parsed = z
      .object({
        approvalId: z.string().min(1),
        approved: z.boolean(),
        remember: z.boolean().optional(),
        instruction: z.string().optional()
      })
      .safeParse(raw)
    if (!parsed.success) return
    pendingCommandApprovals.get(parsed.data.approvalId)?.finish({
      approved: parsed.data.approved,
      remember: parsed.data.remember,
      instruction: parsed.data.instruction
    })
  })
}
