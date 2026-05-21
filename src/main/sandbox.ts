import { ipcMain, safeStorage, type WebContents } from 'electron'
import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { Sandbox } from '@vercel/sandbox'

// Cloud sandbox is exposed in the renderer as a non-interactive command runner:
// each line typed in the xterm is shelled to `sh -c <line>` inside the sandbox
// (the SDK does not currently expose a streaming-stdin / PTY interface, so true
// interactive programs like vim/htop won't work — but ls/cat/git/npm do).

interface OpenParams {
  sandboxId: string
  cwd?: string
}

interface RunParams {
  sandboxId: string
  line: string
}

interface SandboxEntry {
  sandbox: Sandbox
  cwd: string
}

const openSandboxes = new Map<string, SandboxEntry>()

const CredsSchema = z.object({
  token: z.string().min(1).max(2048),
  teamId: z.string().min(1).max(256),
  projectId: z.string().min(1).max(256)
})

type Creds = z.infer<typeof CredsSchema>

function credsPath(): string {
  return join(app.getPath('userData'), 'vercel-sandbox.enc')
}

function loadCreds(): Creds | null {
  try {
    if (!existsSync(credsPath())) return null
    if (!safeStorage.isEncryptionAvailable()) return null
    const enc = readFileSync(credsPath())
    const decoded = safeStorage.decryptString(enc)
    const parsed = CredsSchema.safeParse(JSON.parse(decoded))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function saveCreds(creds: Creds): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain unavailable — cannot store Vercel token securely')
  }
  mkdirSync(app.getPath('userData'), { recursive: true })
  const enc = safeStorage.encryptString(JSON.stringify(creds))
  writeFileSync(credsPath(), enc, { mode: 0o600 })
}

function clearCreds(): void {
  try {
    writeFileSync(credsPath(), '')
  } catch {
    /* ignore */
  }
}

function send(wc: WebContents, channel: string, payload: unknown): void {
  if (!wc.isDestroyed()) wc.send(channel, payload)
}

export function registerSandboxIpc(): void {
  ipcMain.handle('sandbox:creds:get', () => {
    const creds = loadCreds()
    if (!creds) return { ok: false as const, configured: false }
    return {
      ok: true as const,
      configured: true,
      // Never return the raw token to the renderer — just confirmation it exists.
      teamId: creds.teamId,
      projectId: creds.projectId,
      tokenPreview: creds.token.length > 8 ? `…${creds.token.slice(-4)}` : '…'
    }
  })

  ipcMain.handle('sandbox:creds:set', (_e, raw: unknown) => {
    const parsed = CredsSchema.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'invalid credentials' }
    try {
      saveCreds(parsed.data)
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, error: (error as Error).message }
    }
  })

  ipcMain.handle('sandbox:creds:clear', () => {
    clearCreds()
    return { ok: true as const }
  })

  ipcMain.handle('sandbox:open', async (event, raw: unknown) => {
    const parsed = z
      .object({ sandboxId: z.string().min(1).max(128), cwd: z.string().max(2048).optional() })
      .safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'invalid params' }
    const { sandboxId, cwd } = parsed.data as OpenParams
    if (openSandboxes.has(sandboxId)) return { ok: true as const }

    const creds = loadCreds()
    if (!creds)
      return {
        ok: false as const,
        error: 'No Vercel credentials. Add them in Settings → Cloud sandbox.'
      }

    try {
      const sandbox = await Sandbox.create({
        token: creds.token,
        teamId: creds.teamId,
        projectId: creds.projectId,
        runtime: 'node24',
        timeout: 30 * 60 * 1000
      })
      openSandboxes.set(sandboxId, { sandbox, cwd: cwd || '/vercel/sandbox' })
      send(event.sender, 'sandbox:data', {
        sandboxId,
        data: `\x1b[2mvercel sandbox ready — type commands (no interactive TTY)\x1b[0m\r\n`
      })
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, error: (error as Error).message }
    }
  })

  ipcMain.handle('sandbox:run', async (event, raw: unknown) => {
    const parsed = z
      .object({ sandboxId: z.string().min(1).max(128), line: z.string().max(8192) })
      .safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'invalid params' }
    const { sandboxId, line } = parsed.data as RunParams
    const entry = openSandboxes.get(sandboxId)
    if (!entry) return { ok: false as const, error: 'sandbox not open' }

    const trimmed = line.trim()
    if (!trimmed) {
      send(event.sender, 'sandbox:prompt', { sandboxId })
      return { ok: true as const }
    }

    // Allow `cd <dir>` locally so the cwd sticks across commands.
    const cdMatch = trimmed.match(/^cd(?:\s+(.+))?$/)
    if (cdMatch) {
      entry.cwd = cdMatch[1]?.trim() || '/vercel/sandbox'
      send(event.sender, 'sandbox:prompt', { sandboxId })
      return { ok: true as const }
    }

    try {
      const cmd = await entry.sandbox.runCommand({
        cmd: 'sh',
        args: ['-c', `cd ${escapeSh(entry.cwd)} && ${trimmed}`],
        detached: true
      })
      for await (const log of cmd.logs()) {
        send(event.sender, 'sandbox:data', { sandboxId, data: log.data.replace(/\n/g, '\r\n') })
      }
      const finished = await cmd.wait()
      if (finished.exitCode !== 0) {
        send(event.sender, 'sandbox:data', {
          sandboxId,
          data: `\x1b[2m[exit ${finished.exitCode}]\x1b[0m\r\n`
        })
      }
      send(event.sender, 'sandbox:prompt', { sandboxId })
      return { ok: true as const }
    } catch (error) {
      send(event.sender, 'sandbox:data', {
        sandboxId,
        data: `\x1b[31merror: ${(error as Error).message}\x1b[0m\r\n`
      })
      send(event.sender, 'sandbox:prompt', { sandboxId })
      return { ok: false as const, error: (error as Error).message }
    }
  })

  ipcMain.handle('sandbox:close', async (_e, raw: unknown) => {
    const parsed = z.object({ sandboxId: z.string().min(1).max(128) }).safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'invalid params' }
    const entry = openSandboxes.get(parsed.data.sandboxId)
    if (!entry) return { ok: true as const }
    openSandboxes.delete(parsed.data.sandboxId)
    try {
      await entry.sandbox.stop()
    } catch {
      /* best-effort */
    }
    return { ok: true as const }
  })
}

function escapeSh(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export async function stopAllSandboxes(): Promise<void> {
  const all = [...openSandboxes.values()]
  openSandboxes.clear()
  await Promise.allSettled(all.map((e) => e.sandbox.stop()))
}
