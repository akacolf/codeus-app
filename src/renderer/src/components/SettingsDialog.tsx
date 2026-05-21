import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Cloud,
  Copy,
  Gauge,
  Keyboard,
  Monitor,
  Moon,
  Palette,
  Plug,
  RotateCw,
  Settings as SettingsIcon,
  Sun,
  Terminal,
  User,
  X
} from 'lucide-react'
import { Loader } from './Loader'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { THEMES, useSettings, type ThemeId } from '@renderer/lib/settings'
import { SHORTCUTS } from '@renderer/lib/shortcuts'
import { getUsage, resetUsage, subscribeUsage, type UsageSnapshot } from '@renderer/lib/usage'
import { useChatStore } from '@renderer/stores/chatStore'

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function formatChars(n: number): string {
  if (n < 1000) return `${n} chars`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k chars`
  return `${(n / 1_000_000).toFixed(2)}M chars`
}

type SectionId = 'general' | 'appearance' | 'shortcuts' | 'mcp' | 'connections' | 'usage'

interface NavItem {
  id: SectionId
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV: NavItem[] = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard },
  { id: 'mcp', label: 'MCP servers', icon: Terminal },
  { id: 'connections', label: 'Connections', icon: Plug },
  { id: 'usage', label: 'Usage & billing', icon: Gauge }
]

export function SettingsPage(): React.JSX.Element {
  const [active, setActive] = useState<SectionId>('general')
  const closeSettings = useChatStore((s) => s.closeSettings)

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col bg-card/40 px-2 py-4">
        <Button
          variant="ghost"
          size="xs"
          onClick={closeSettings}
          className="mb-3 self-start gap-1.5 px-2 text-muted-foreground"
          aria-label="Back to app"
        >
          <ArrowLeft className="size-3.5" />
          Back to app
        </Button>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const Icon = item.icon
            const isActive = active === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActive(item.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors',
                  isActive
                    ? 'bg-foreground/10 text-foreground'
                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-8 px-8 py-10">
          <SectionRouter id={active} />
        </div>
      </div>
    </div>
  )
}

function SectionRouter({ id }: { id: SectionId }): React.JSX.Element {
  switch (id) {
    case 'general':
      return <GeneralSection />
    case 'appearance':
      return <AppearanceSection />
    case 'shortcuts':
      return <ShortcutsSection />
    case 'mcp':
      return <McpSection />
    case 'connections':
      return <ConnectionsSection />
    case 'usage':
      return <UsageSection />
  }
}

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold leading-none">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

function GeneralSection(): React.JSX.Element {
  const { settings, set } = useSettings()
  return (
    <>
      <PageHeader title="General" />
      <Field icon={User} title="Display name" hint="Shown in the home greeting.">
        <Input
          value={settings.userName}
          placeholder="Your name"
          onChange={(e) => set('userName', e.target.value)}
          maxLength={40}
          className="max-w-sm"
        />
      </Field>
    </>
  )
}

const THEME_ICON: Record<ThemeId, React.ComponentType<{ className?: string }>> = {
  system: Monitor,
  light: Sun,
  dark: Moon
}

function AppearanceSection(): React.JSX.Element {
  const { settings, set } = useSettings()
  return (
    <>
      <PageHeader title="Appearance" />
      <Field icon={Palette} title="Theme" hint="Match your OS or pin a side.">
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => {
            const Icon = THEME_ICON[t.id]
            const isActive = settings.theme === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => set('theme', t.id)}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-lg bg-foreground/5 p-3 text-left transition-colors hover:bg-foreground/8',
                  isActive && 'bg-foreground/10 ring-1 ring-foreground/15'
                )}
                aria-pressed={isActive}
              >
                <Icon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t.label}</span>
              </button>
            )
          })}
        </div>
      </Field>
    </>
  )
}

function ShortcutsSection(): React.JSX.Element {
  return (
    <>
      <PageHeader title="Keyboard shortcuts" subtitle="Cheat sheet for the app." />
      <div className="flex flex-col divide-y divide-foreground/8 rounded-xl bg-foreground/4">
        {SHORTCUTS.map((s) => (
          <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-foreground/90">{s.label}</span>
            <div className="flex items-center gap-1">
              {s.keys.map((k, i) => (
                <kbd
                  key={`${s.id}-${i}`}
                  className="inline-flex min-w-6 items-center justify-center rounded-md bg-foreground/8 px-1.5 py-0.5 text-[11px] font-medium text-foreground/90"
                >
                  {k}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
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
    <>
      <PageHeader
        title="MCP servers"
        subtitle="Let external agents (Claude Code, Cursor, …) see this workspace."
      />
      {!info && (
        <div className="flex items-center justify-center rounded-lg bg-foreground/5 px-3 py-6">
          <Loader size={28} label="Starting server" />
        </div>
      )}
      {info && (
        <Field icon={Terminal} title="Local server" hint="Bound to 127.0.0.1 with a session token.">
          <div className="flex flex-col gap-2">
            <CopyRow
              value={info.url}
              copied={copied === 'url'}
              onCopy={() => void copy(info.url, 'url')}
            />
            <CopyRow
              value={command}
              copied={copied === 'cmd'}
              onCopy={() => void copy(command, 'cmd')}
            />
          </div>
        </Field>
      )}
    </>
  )
}

function CopyRow({
  value,
  copied,
  onCopy
}: {
  value: string
  copied: boolean
  onCopy: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-foreground/5 px-3 py-2 text-xs">
      <span className="truncate font-mono text-foreground/90" title={value}>
        {value}
      </span>
      <Button variant="ghost" size="xs" onClick={onCopy} className="shrink-0 gap-1.5">
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

function ConnectionsSection(): React.JSX.Element {
  return (
    <>
      <PageHeader title="Connections" subtitle="Run commands somewhere other than this machine." />
      <CloudSandboxField />
    </>
  )
}

function CloudSandboxField(): React.JSX.Element {
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
    <Field
      icon={Cloud}
      title="Cloud sandbox"
      hint="Run the in-app terminal inside a Vercel Sandbox microVM."
    >
      {state.configured && (
        <div className="flex items-center justify-between rounded-lg bg-foreground/5 px-3 py-2 text-xs">
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
      <div className="flex items-center justify-end">
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
    </Field>
  )
}

function UsageSection(): React.JSX.Element {
  const [usage, setUsage] = useState<UsageSnapshot>(() => getUsage())
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsage(getUsage())
    return subscribeUsage(setUsage)
  }, [])

  return (
    <>
      <PageHeader title="Usage & billing" subtitle="During the research preview, usage is on us." />
      <Field
        icon={Gauge}
        title="Activity"
        hint="Counted locally as the renderer sees streamed tokens."
      >
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Requests today" value={formatNumber(usage.requests)} />
          <Stat label="Streamed today" value={formatChars(usage.chars)} />
          <Stat label="Lifetime requests" value={formatNumber(usage.lifetimeRequests)} />
          <Stat label="Lifetime streamed" value={formatChars(usage.lifetimeChars)} />
        </div>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => resetUsage()}
            className="shrink-0 gap-1.5"
          >
            <RotateCw className="size-3" />
            Reset counters
          </Button>
        </div>
      </Field>
    </>
  )
}

function Field({
  icon: Icon,
  title,
  hint,
  children
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{title}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </div>
      <div className="flex flex-col gap-2 pl-6">{children}</div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-foreground/5 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}
