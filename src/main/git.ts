import { ipcMain } from 'electron'
import { spawn, spawnSync } from 'child_process'
import { dirname, isAbsolute, resolve } from 'path'
import { z } from 'zod'

export interface GitFileChange {
  path: string
  // Two-letter porcelain status: index + worktree.
  index: string
  worktree: string
  staged: boolean
  untracked: boolean
}

export interface GitStatus {
  isRepo: true
  branch: string | null // null = detached HEAD
  upstream: string | null
  ahead: number
  behind: number
  files: GitFileChange[]
  hasRemote: boolean
}

export type GitStatusResult = GitStatus | { isRepo: false }

export interface GitWorktree {
  path: string
  branch: string | null
  head: string | null
  detached: boolean
  bare: boolean
  current: boolean
}

type Result<T = void> = { ok: true; data: T } | { ok: false; error: string }

const BranchNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._/-]+$/, 'invalid branch name')
  .refine((name) => !name.startsWith('-'), 'branch cannot start with -')
  .refine((name) => !name.includes('..'), 'branch cannot contain ..')
  .refine((name) => !name.endsWith('/'), 'branch cannot end with /')

const CreateWorktreeSchema = z.object({
  path: z.string().trim().min(1).max(2048),
  branch: BranchNameSchema,
  startPoint: z.string().trim().min(1).max(128).optional()
})

function run(cwd: string, args: string[], timeoutMs = 8000): Result<string> {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  })
  if (r.error) return { ok: false, error: r.error.message }
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || '').trim() || `git ${args[0]} failed`
    return { ok: false, error: msg }
  }
  return { ok: true, data: (r.stdout || '').trim() }
}

function runStreaming(
  cwd: string,
  args: string[],
  timeoutMs = 30000
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      stderr += '\ngit command timed out'
    }, timeoutMs)
    child.stdout.on('data', (b: Buffer) => (stdout += b.toString('utf8')))
    child.stderr.on('data', (b: Buffer) => (stderr += b.toString('utf8')))
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, stdout, stderr })
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ ok: false, stdout, stderr: stderr || 'spawn failed' })
    })
  })
}

function isRepo(cwd: string): boolean {
  const r = run(cwd, ['rev-parse', '--is-inside-work-tree'])
  return r.ok && r.data === 'true'
}

function repoRoot(cwd: string): string | null {
  const r = run(cwd, ['rev-parse', '--show-toplevel'])
  return r.ok ? r.data : null
}

function displayBranch(ref?: string): string | null {
  if (!ref) return null
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref
}

function resolveWorktreePath(cwd: string, rawPath: string): string {
  if (isAbsolute(rawPath)) return resolve(rawPath)
  const root = repoRoot(cwd) ?? cwd
  return resolve(dirname(root), rawPath)
}

function parseWorktrees(raw: string, currentRoot: string | null): GitWorktree[] {
  const blocks = raw
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  return blocks.flatMap((block) => {
    const entry: Omit<GitWorktree, 'current'> = {
      path: '',
      branch: null,
      head: null,
      detached: false,
      bare: false
    }

    for (const line of block.split('\n')) {
      const [key, ...rest] = line.split(' ')
      const value = rest.join(' ')
      if (key === 'worktree') entry.path = value
      else if (key === 'HEAD') entry.head = value
      else if (key === 'branch') entry.branch = displayBranch(value)
      else if (key === 'detached') entry.detached = true
      else if (key === 'bare') entry.bare = true
    }

    if (!entry.path) return []
    return [
      {
        ...entry,
        current: currentRoot !== null && resolve(entry.path) === resolve(currentRoot)
      }
    ]
  })
}

function status(cwd: string): GitStatusResult {
  if (!isRepo(cwd)) return { isRepo: false }
  const branchRes = run(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = branchRes.ok && branchRes.data && branchRes.data !== 'HEAD' ? branchRes.data : null

  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  const upstreamRes = run(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  if (upstreamRes.ok) {
    upstream = upstreamRes.data
    const counts = run(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{u}'])
    if (counts.ok) {
      const [a, b] = counts.data.split(/\s+/).map((n) => Number(n) || 0)
      ahead = a
      behind = b
    }
  }

  const porcelain = run(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])
  const files: GitFileChange[] = []
  if (porcelain.ok) {
    for (const line of porcelain.data.split('\n')) {
      if (!line) continue
      const indexCh = line.charAt(0)
      const worktreeCh = line.charAt(1)
      const rest = line.slice(3)
      // Rename lines: "R  old -> new". Use the new path.
      const path = rest.includes(' -> ') ? rest.split(' -> ').pop()! : rest
      files.push({
        path,
        index: indexCh,
        worktree: worktreeCh,
        staged: indexCh !== ' ' && indexCh !== '?',
        untracked: indexCh === '?' && worktreeCh === '?'
      })
    }
  }

  const remotes = run(cwd, ['remote'])
  const hasRemote = remotes.ok && remotes.data.length > 0

  return { isRepo: true, branch, upstream, ahead, behind, files, hasRemote }
}

function branches(cwd: string): Result<{ current: string | null; all: string[] }> {
  if (!isRepo(cwd)) return { ok: false, error: 'not a git repository' }
  const r = run(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'])
  if (!r.ok) return r
  const all = r.data.split('\n').filter(Boolean)
  const cur = run(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const current = cur.ok && cur.data !== 'HEAD' ? cur.data : null
  return { ok: true, data: { current, all } }
}

function worktrees(cwd: string): Result<{ worktrees: GitWorktree[] }> {
  if (!isRepo(cwd)) return { ok: false, error: 'not a git repository' }
  const r = run(cwd, ['worktree', 'list', '--porcelain'])
  if (!r.ok) return r
  return { ok: true, data: { worktrees: parseWorktrees(r.data, repoRoot(cwd)) } }
}

function checkout(cwd: string, name: string): Result {
  if (!isRepo(cwd)) return { ok: false, error: 'not a git repository' }
  const r = run(cwd, ['checkout', name])
  if (!r.ok) return r
  return { ok: true, data: undefined }
}

function createBranch(cwd: string, name: string): Result {
  if (!isRepo(cwd)) return { ok: false, error: 'not a git repository' }
  const parsed = BranchNameSchema.safeParse(name)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid branch name' }
  const r = run(cwd, ['checkout', '-b', parsed.data])
  if (!r.ok) return r
  return { ok: true, data: undefined }
}

function createWorktree(
  cwd: string,
  rawParams: unknown
): Result<{ path: string; branch: string; worktrees: GitWorktree[] }> {
  if (!isRepo(cwd)) return { ok: false, error: 'not a git repository' }
  const parsed = CreateWorktreeSchema.safeParse(rawParams)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid worktree' }
  }

  const targetPath = resolveWorktreePath(cwd, parsed.data.path)
  const startPoint = parsed.data.startPoint ?? 'HEAD'
  const r = run(cwd, ['worktree', 'add', '-b', parsed.data.branch, targetPath, startPoint], 30000)
  if (!r.ok) return r

  const updated = worktrees(cwd)
  return {
    ok: true,
    data: {
      path: targetPath,
      branch: parsed.data.branch,
      worktrees: updated.ok ? updated.data.worktrees : []
    }
  }
}

async function commit(cwd: string, message: string, opts?: { addAll?: boolean }): Promise<Result> {
  if (!isRepo(cwd)) return { ok: false, error: 'not a git repository' }
  if (!message.trim()) return { ok: false, error: 'empty commit message' }
  if (opts?.addAll) {
    const a = run(cwd, ['add', '-A'])
    if (!a.ok) return a
  }
  // Use streaming spawn so the message is passed via -m (no shell quoting risk).
  const r = await runStreaming(cwd, ['commit', '-m', message])
  if (!r.ok) {
    return { ok: false, error: (r.stderr || r.stdout || 'commit failed').trim() }
  }
  return { ok: true, data: undefined }
}

async function push(cwd: string, opts?: { setUpstream?: boolean }): Promise<Result> {
  if (!isRepo(cwd)) return { ok: false, error: 'not a git repository' }
  const remotes = run(cwd, ['remote'])
  if (!remotes.ok || !remotes.data) {
    return { ok: false, error: 'no remote configured' }
  }
  const args = ['push']
  if (opts?.setUpstream) {
    const cur = run(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
    if (!cur.ok || cur.data === 'HEAD') return { ok: false, error: 'detached HEAD' }
    args.push('-u', 'origin', cur.data)
  }
  const r = await runStreaming(cwd, args, 60000)
  if (!r.ok) return { ok: false, error: (r.stderr || r.stdout || 'push failed').trim() }
  return { ok: true, data: undefined }
}

async function pull(cwd: string): Promise<Result> {
  if (!isRepo(cwd)) return { ok: false, error: 'not a git repository' }
  const r = await runStreaming(cwd, ['pull', '--ff-only'], 60000)
  if (!r.ok) return { ok: false, error: (r.stderr || r.stdout || 'pull failed').trim() }
  return { ok: true, data: undefined }
}

export function registerGitIpc(getCwd: () => string): void {
  ipcMain.handle('git:status', () => status(getCwd()))
  ipcMain.handle('git:branches', () => branches(getCwd()))
  ipcMain.handle('git:worktrees', () => worktrees(getCwd()))
  ipcMain.handle('git:checkout', (_e, { name }: { name: string }) => checkout(getCwd(), name))
  ipcMain.handle('git:createBranch', (_e, { name }: { name: string }) =>
    createBranch(getCwd(), name)
  )
  ipcMain.handle('git:createWorktree', (_e, params: unknown) => createWorktree(getCwd(), params))
  ipcMain.handle('git:commit', (_e, p: { message: string; addAll?: boolean }) =>
    commit(getCwd(), p.message, { addAll: p.addAll })
  )
  ipcMain.handle('git:push', (_e, p?: { setUpstream?: boolean }) =>
    push(getCwd(), { setUpstream: p?.setUpstream })
  )
  ipcMain.handle('git:pull', () => pull(getCwd()))
}
