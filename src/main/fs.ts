import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { resolve, relative, sep, join, posix } from 'path'
import { z } from 'zod'

// Project-relative paths only. Main resolves against the project root and
// rejects anything that escapes it. Renderer never sees absolute paths.

const HIDDEN_DIRS = new Set(['.git', 'node_modules', '.next', 'out', 'dist', '.cache', '.turbo'])
const HIDDEN_FILES = new Set(['.DS_Store'])
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB — refuse to load anything bigger into Monaco

const RelPathSchema = z
  .string()
  .max(2048)
  .refine((p) => !p.startsWith('/') && !p.includes('\0'), 'invalid path')

const ListParamsSchema = z.object({ path: RelPathSchema.optional() })
const ReadParamsSchema = z.object({ path: RelPathSchema })
const WriteParamsSchema = z.object({ path: RelPathSchema, content: z.string() })
const FindParamsSchema = z.object({
  query: z.string().max(200).optional().default(''),
  limit: z.number().int().positive().max(100).optional().default(40)
})

export interface DirEntry {
  name: string
  path: string // posix-style, project-relative ("" for root)
  type: 'file' | 'dir'
}

function safeResolve(root: string, rel: string): string | null {
  const norm = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  const abs = resolve(root, norm)
  const fromRoot = relative(root, abs)
  if (fromRoot.startsWith('..' + sep) || fromRoot === '..' || resolve(abs) !== abs) return null
  return abs
}

async function listDir(root: string, relPath: string): Promise<DirEntry[]> {
  const abs = safeResolve(root, relPath)
  if (!abs) throw new Error('path escapes project root')
  const dirents = await fs.readdir(abs, { withFileTypes: true })
  const entries: DirEntry[] = []
  for (const d of dirents) {
    if (d.isDirectory() && HIDDEN_DIRS.has(d.name)) continue
    if (d.isFile() && HIDDEN_FILES.has(d.name)) continue
    if (!d.isDirectory() && !d.isFile()) continue
    const childRel = relPath ? posix.join(relPath, d.name) : d.name
    entries.push({ name: d.name, path: childRel, type: d.isDirectory() ? 'dir' : 'file' })
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return entries
}

async function readFile(root: string, relPath: string): Promise<string> {
  const abs = safeResolve(root, relPath)
  if (!abs) throw new Error('path escapes project root')
  const stat = await fs.stat(abs)
  if (!stat.isFile()) throw new Error('not a file')
  if (stat.size > MAX_FILE_BYTES) throw new Error(`file too large (${stat.size} bytes)`)
  return await fs.readFile(abs, 'utf8')
}

// Indexed file list, cached per-root for 4s so a quick stream of @-mention
// keystrokes doesn't re-walk the whole tree on every char. The cap (10k files)
// keeps a runaway monorepo from blowing main-process memory.
interface FileIndex {
  builtAt: number
  files: string[] // posix-relative
}
const fileIndex = new Map<string, FileIndex>()
const INDEX_TTL_MS = 4_000
const INDEX_FILE_CAP = 10_000

async function buildFileIndex(root: string): Promise<string[]> {
  const out: string[] = []
  const queue: string[] = ['']
  while (queue.length > 0 && out.length < INDEX_FILE_CAP) {
    const relDir = queue.shift() as string
    const abs = safeResolve(root, relDir)
    if (!abs) continue
    let dirents: import('fs').Dirent[]
    try {
      dirents = await fs.readdir(abs, { withFileTypes: true })
    } catch {
      continue
    }
    for (const d of dirents) {
      if (d.isDirectory()) {
        if (HIDDEN_DIRS.has(d.name)) continue
        if (d.name.startsWith('.') && d.name !== '.github' && d.name !== '.claude') continue
        queue.push(relDir ? posix.join(relDir, d.name) : d.name)
      } else if (d.isFile()) {
        if (HIDDEN_FILES.has(d.name)) continue
        out.push(relDir ? posix.join(relDir, d.name) : d.name)
        if (out.length >= INDEX_FILE_CAP) break
      }
    }
  }
  return out
}

async function findFiles(root: string, query: string, limit: number): Promise<string[]> {
  const cached = fileIndex.get(root)
  const fresh =
    cached && Date.now() - cached.builtAt < INDEX_TTL_MS ? cached.files : await buildFileIndex(root)
  if (!cached || Date.now() - cached.builtAt >= INDEX_TTL_MS) {
    fileIndex.set(root, { builtAt: Date.now(), files: fresh })
  }
  const q = query.trim().toLowerCase()
  if (!q) {
    // No query — return up to `limit` files sorted by path so the dropdown is
    // populated immediately on @ open.
    return fresh
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .slice(0, limit)
  }
  // Score: basename-prefix > basename-substring > path-substring. Lower score
  // is better; we tie-break with path length so shorter wins, then lexically.
  const scored: Array<{ score: number; path: string }> = []
  for (const p of fresh) {
    const lower = p.toLowerCase()
    const base = lower.slice(lower.lastIndexOf('/') + 1)
    let score: number
    if (base.startsWith(q)) score = 0
    else if (base.includes(q)) score = 1
    else if (lower.includes(q)) score = 2
    else continue
    scored.push({ score, path: p })
  }
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    if (a.path.length !== b.path.length) return a.path.length - b.path.length
    return a.path.localeCompare(b.path)
  })
  return scored.slice(0, limit).map((s) => s.path)
}

async function writeFile(root: string, relPath: string, content: string): Promise<void> {
  const abs = safeResolve(root, relPath)
  if (!abs) throw new Error('path escapes project root')
  // Ensure parent dir exists for new files.
  await fs.mkdir(join(abs, '..'), { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
}

export function registerFsIpc(getRoot: () => string): void {
  ipcMain.handle('fs:listDir', async (_event, raw: unknown) => {
    const parsed = ListParamsSchema.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'invalid params' }
    try {
      const entries = await listDir(getRoot(), parsed.data.path ?? '')
      return { ok: true as const, entries }
    } catch (error) {
      return { ok: false as const, error: (error as Error).message }
    }
  })

  ipcMain.handle('fs:readFile', async (_event, raw: unknown) => {
    const parsed = ReadParamsSchema.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'invalid params' }
    try {
      const content = await readFile(getRoot(), parsed.data.path)
      return { ok: true as const, content }
    } catch (error) {
      return { ok: false as const, error: (error as Error).message }
    }
  })

  ipcMain.handle('fs:findFiles', async (_event, raw: unknown) => {
    const parsed = FindParamsSchema.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'invalid params' }
    try {
      const files = await findFiles(getRoot(), parsed.data.query, parsed.data.limit)
      return { ok: true as const, files }
    } catch (error) {
      return { ok: false as const, error: (error as Error).message }
    }
  })

  ipcMain.handle('fs:writeFile', async (_event, raw: unknown) => {
    const parsed = WriteParamsSchema.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'invalid params' }
    try {
      await writeFile(getRoot(), parsed.data.path, parsed.data.content)
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, error: (error as Error).message }
    }
  })
}
