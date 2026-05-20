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
