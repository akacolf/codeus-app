import { ipcMain, type WebContents } from 'electron'
import { spawn, type IPty } from 'node-pty'
import { homedir } from 'node:os'

interface OpenParams {
  ptyId: string
  cwd?: string
  cols?: number
  rows?: number
}

const ptys = new Map<string, IPty>()

function defaultShell(): { cmd: string; args: string[] } {
  if (process.platform === 'win32') return { cmd: 'powershell.exe', args: [] }
  const shell = process.env.SHELL || '/bin/zsh'
  return { cmd: shell, args: ['-l'] }
}

function send(wc: WebContents, channel: string, payload: unknown): void {
  if (!wc.isDestroyed()) wc.send(channel, payload)
}

export function registerTerminalIpc(getProjectCwd: () => string): void {
  ipcMain.handle('terminal:open', (event, params: OpenParams) => {
    const { ptyId, cwd, cols = 80, rows = 24 } = params
    if (ptys.has(ptyId)) return { ok: true }

    const { cmd, args } = defaultShell()
    const pty = spawn(cmd, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cwd || getProjectCwd() || homedir(),
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<
        string,
        string
      >
    })

    ptys.set(ptyId, pty)

    pty.onData((data) => send(event.sender, 'terminal:data', { ptyId, data }))
    pty.onExit(({ exitCode }) => {
      ptys.delete(ptyId)
      send(event.sender, 'terminal:exit', { ptyId, exitCode })
    })

    return { ok: true }
  })

  ipcMain.on(
    'terminal:write',
    (_event, { ptyId, data }: { ptyId: string; data: string }) => {
      ptys.get(ptyId)?.write(data)
    }
  )

  ipcMain.on(
    'terminal:resize',
    (_event, { ptyId, cols, rows }: { ptyId: string; cols: number; rows: number }) => {
      try {
        ptys.get(ptyId)?.resize(Math.max(1, cols), Math.max(1, rows))
      } catch {
        /* pty may have exited mid-resize */
      }
    }
  )

  ipcMain.on('terminal:close', (_event, { ptyId }: { ptyId: string }) => {
    const pty = ptys.get(ptyId)
    if (pty) {
      ptys.delete(ptyId)
      try {
        pty.kill()
      } catch {
        /* already gone */
      }
    }
  })
}

export function killAllPtys(): void {
  for (const pty of ptys.values()) {
    try {
      pty.kill()
    } catch {
      /* ignore */
    }
  }
  ptys.clear()
}
