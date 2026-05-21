import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Cloud, Copy, RotateCw, X } from 'lucide-react'
import { Loader } from './Loader'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { MODELS, PERMISSIONS, useSettings } from '@renderer/lib/settings'
import { getUsage, resetUsage, subscribeUsage, type UsageSnapshot } from '@renderer/lib/usage'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/stores/chatStore'

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function formatChars(n: number): string {
  if (n < 1000) return `${n} chars`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k chars`
  return `${(n / 1_000_000).toFixed(2)}M chars`
}

export function SettingsPage(): React.JSX.Element {
  const { settings, set } = useSettings()
  const [usage, setUsage] = useState<UsageSnapshot>(() => getUsage())
  const closeSettings = useChatStore((s) => s.closeSettings)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsage(getUsage())
    return subscribeUsage(setUsage)
  }, [])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="xs"
            onClick={closeSettings}
            className="gap-1.5"
            aria-label="Close settings"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold leading-none">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Local-only — values persist in this app and never leave your machine.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <Section title="Your name" hint="Used in the home greeting. Defaults to your OS user.">
            <Input
              value={settings.userName}
              placeholder="Display name"
              onChange={(e) => set('userName', e.target.value)}
              maxLength={40}
            />
          </Section>

          <Section title="Default model">
            <ChipRow
              items={MODELS.map((m) => ({ id: m.id, label: m.label }))}
              selectedId={settings.model}
              onSelect={(id) => set('model', id as typeof settings.model)}
            />
          </Section>

          <Section title="Default permissions">
            <ChipRow
              items={PERMISSIONS.map((p) => ({ id: p.id, label: p.label }))}
              selectedId={settings.permission}
              onSelect={(id) => set('permission', id as typeof settings.permission)}
            />
          </Section>

          <CloudSandboxSection />

          <McpSection />

          <Section
            title="Usage"
            hint="Counted locally as the renderer sees streamed tokens. Resets at midnight."
          >
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Requests today" value={formatNumber(usage.requests)} />
              <Stat label="Streamed today" value={formatChars(usage.chars)} />
              <Stat label="Lifetime requests" value={formatNumber(usage.lifetimeRequests)} />
              <Stat label="Lifetime streamed" value={formatChars(usage.lifetimeChars)} />
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <p className="leading-relaxed">
                Model calls route through Quantum Club&rsquo;s proxy to Vercel AI Gateway. During
                the research preview, usage is on us — there is no user-facing billing and no API
                key to configure.
              </p>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => resetUsage()}
                className="shrink-0 gap-1.5"
              >
                <RotateCw className="size-3" />
                Reset
              </Button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

function CloudSandboxSection(): React.JSX.Element {
  const [token, setToken] = useState('')
  const [teamId, setTeamId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [state, setState] = useState<{ configured: boolean; preview?: string }>({
    configured: false
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = (): void => {
    void window.api.sandbox.getCreds().then((r) => {
      if (r.ok && r.configured) {
        setState({ configured: true, preview: `${r.tokenPreview} · team ${r.teamId}` })
        setTeamId(r.teamId)
        setProjectId(r.projectId)
      } else {
        setState({ configured: false })
      }
    })
  }

  useEffect(() => {
    refresh()
  }, [])

  const save = async (): Promise<void> => {
    setError(null)
    setSaving(true)
    const r = await window.api.sandbox.setCreds({
      token: token.trim(),
      teamId: teamId.trim(),
      projectId: projectId.trim()
    })
    setSaving(false)
    if (r.ok) {
      setToken('')
      refresh()
    } else {
      setError(r.error)
    }
  }

  const clear = async (): Promise<void> => {
    await window.api.sandbox.clearCreds()
    setToken('')
    setTeamId('')
    setProjectId('')
    refresh()
  }

  return (
    <Section
      title="Cloud sandbox"
      hint="Runs the in-app terminal inside a Vercel Sandbox microVM. Commands are one-shot (no interactive TTY)."
    >
      {state.configured && (
        <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <Check className="size-3.5" />
            Connected — {state.preview}
          </span>
          <Button variant="ghost" size="xs" onClick={() => void clear()} className="gap-1.5">
            <X className="size-3" />
            Disconnect
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          type="password"
          placeholder="Vercel token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
        <Input
          placeholder="Team ID"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          autoComplete="off"
        />
        <Input
          placeholder="Project ID"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          autoComplete="off"
          className="sm:col-span-2"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Token is encrypted with the OS keychain (safeStorage) and never leaves this machine.
        </p>
        <Button
          size="xs"
          onClick={() => void save()}
          disabled={saving || !token.trim() || !teamId.trim() || !projectId.trim()}
          className="shrink-0 gap-1.5"
        >
          <Cloud className="size-3" />
          {state.configured ? 'Update' : 'Connect'}
        </Button>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </Section>
  )
}

function McpSection(): React.JSX.Element {
  const [info, setInfo] = useState<{ url: string; port: number } | null>(null)
  const [copied, setCopied] = useState<'url' | 'cmd' | null>(null)

  useEffect(() => {
    void window.api.mcp.getInfo().then((i) => {
      if (i) setInfo({ url: i.url, port: i.port })
    })
  }, [])

  const copy = async (text: string, kind: 'url' | 'cmd'): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      /* ignore */
    }
  }

  const command = info ? `claude mcp add --transport http qc-codeus "${info.url}"` : ''

  return (
    <Section
      title="External agents (MCP)"
      hint="Expose this IDE's project root, active file, selection, and open tabs to any MCP-aware agent (Claude Code, Cursor, etc). Bound to 127.0.0.1 with a per-session token; nothing leaves your machine."
    >
      {!info && (
        <div className="flex items-center justify-center rounded-lg bg-white/5 px-3 py-6">
          <Loader size={28} label="Starting server" />
        </div>
      )}
      {info && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs">
            <span className="truncate font-mono text-foreground" title={info.url}>
              {info.url}
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void copy(info.url, 'url')}
              className="shrink-0 gap-1.5"
            >
              {copied === 'url' ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied === 'url' ? 'Copied' : 'Copy URL'}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs">
            <span className="truncate font-mono text-muted-foreground" title={command}>
              {command}
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void copy(command, 'cmd')}
              className="shrink-0 gap-1.5"
            >
              {copied === 'cmd' ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied === 'cmd' ? 'Copied' : 'Copy command'}
            </Button>
          </div>
        </div>
      )}
    </Section>
  )
}

function Section({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="text-sm font-medium">{title}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-white/5 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

function ChipRow({
  items,
  selectedId,
  onSelect
}: {
  items: Array<{ id: string; label: string; hint?: string }>
  selectedId: string
  onSelect: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => {
        const active = it.id === selectedId
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onSelect(it.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground',
              active && 'bg-white text-black hover:bg-white hover:text-black'
            )}
          >
            {it.hint && (
              <span className={cn('text-foreground', active && 'text-black/70')}>{it.hint}</span>
            )}
            <span>{it.label}</span>
          </button>
        )
      })}
    </div>
  )
}
