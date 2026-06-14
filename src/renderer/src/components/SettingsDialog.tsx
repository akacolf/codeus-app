import { useEffect, useState } from 'react'
import {
  AppWindow,
  ArrowLeft,
  Bell,
  Check,
  Cloud,
  Code,
  Copy,
  FileCode,
  Gauge,
  Hash,
  Keyboard,
  Languages,
  MessageSquare,
  Monitor,
  Moon,
  Palette,
  PanelLeft,
  Plug,
  RotateCw,
  Send,
  Settings as SettingsIcon,
  Shield,
  Sun,
  Terminal,
  Trash2,
  Type,
  User,
  X
} from 'lucide-react'
import { useTranslations } from 'use-intl'
import { Loader } from './Loader'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { useAuthStore } from '@renderer/stores/authStore'
import {
  CODE_FONT_SIZES,
  FONT_FAMILIES,
  LANGUAGES,
  THEMES,
  UI_SCALES,
  useSettings,
  type ChatDensity,
  type CodeFontSize,
  type CodeTheme,
  type CompletionNotificationMode,
  type ComposerSize,
  type ComposerSubmitMode,
  type DefaultOpenDestination,
  type EditorLineNumbers,
  type EditorTabSize,
  type FollowUpBehavior,
  type FontFamily,
  type InferenceSpeed,
  type LanguageId,
  type MessageStyle,
  type RuntimeMode,
  type SidebarWidth,
  type TerminalBellMode,
  type TerminalCursorStyle,
  type TerminalScrollback,
  type ThemeId,
  type UiScaleId,
  type WorkMode
} from '@renderer/lib/settings'
import { shortcutsForSubmitMode } from '@renderer/lib/shortcuts'
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

type SectionId =
  | 'account'
  | 'general'
  | 'appearance'
  | 'editor'
  | 'terminal'
  | 'system'
  | 'shortcuts'
  | 'mcp'
  | 'connections'
  | 'privacy'
  | 'usage'

interface NavItem {
  id: SectionId
  labelKey?: string
  label?: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV: NavItem[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'general', labelKey: 'general', icon: SettingsIcon },
  { id: 'appearance', labelKey: 'appearance', icon: Palette },
  { id: 'editor', labelKey: 'editor', icon: FileCode },
  { id: 'terminal', labelKey: 'terminal', icon: Terminal },
  { id: 'system', labelKey: 'system', icon: AppWindow },
  { id: 'shortcuts', labelKey: 'shortcuts', icon: Keyboard },
  { id: 'mcp', labelKey: 'mcp', icon: Terminal },
  { id: 'connections', labelKey: 'connections', icon: Plug },
  { id: 'privacy', labelKey: 'privacy', icon: Shield },
  { id: 'usage', labelKey: 'usage', icon: Gauge }
]

export function SettingsPage(): React.JSX.Element {
  const t = useTranslations('settings')
  const [active, setActive] = useState<SectionId>('account')
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
          {t('backToApp')}
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
                <span className="truncate">{item.label ?? t(`nav.${item.labelKey}`)}</span>
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
    case 'account':
      return <AccountSection />
    case 'general':
      return <GeneralSection />
    case 'appearance':
      return <AppearanceSection />
    case 'editor':
      return <EditorSection />
    case 'terminal':
      return <TerminalSection />
    case 'system':
      return <SystemSection />
    case 'shortcuts':
      return <ShortcutsSection />
    case 'mcp':
      return <McpSection />
    case 'connections':
      return <ConnectionsSection />
    case 'privacy':
      return <PrivacySection />
    case 'usage':
      return <UsageSection />
  }
}

function AccountSection(): React.JSX.Element {
  const state = useAuthStore((s) => s.state)
  const signOut = useAuthStore((s) => s.signOut)
  const signIn = useAuthStore((s) => s.signIn)
  const [confirming, setConfirming] = useState(false)

  const email = state.kind === 'signed-in' ? state.email : null
  const userId = state.kind === 'signed-in' ? state.userId : null

  const openWebAccount = (): void => {
    const a = document.createElement('a')
    a.href = 'https://quantumclub.sh/account'
    a.target = '_blank'
    a.rel = 'noreferrer noopener'
    a.click()
  }

  return (
    <>
      <PageHeader title="Account" subtitle="Your Quantum Club identity on this device." />
      <Field
        icon={User}
        title="Signed in as"
        hint="The Quantum Club account this Codeus install is linked to."
      >
        {email ? (
          <div className="space-y-1">
            <div className="text-sm text-foreground">{email}</div>
            {userId ? (
              <div className="text-xs text-muted-foreground">User ID · {userId.slice(0, 12)}…</div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">You&apos;re signed out.</p>
            <Button variant="secondary" className="w-fit" onClick={() => void signIn()}>
              Sign in
            </Button>
          </div>
        )}
      </Field>
      {email ? (
        <Field
          icon={Cloud}
          title="Manage on web"
          hint="Open your account on quantumclub.sh — billing history, top-ups, profile."
        >
          <Button variant="secondary" className="w-fit" onClick={openWebAccount}>
            Open account
          </Button>
        </Field>
      ) : null}
      {email ? (
        <Field
          icon={X}
          title="Sign out"
          hint="Revokes this device's session token. You'll need to sign in again to use Codeus."
        >
          {confirming ? (
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                onClick={async () => {
                  setConfirming(false)
                  await signOut()
                }}
              >
                Confirm sign out
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="secondary" className="w-fit" onClick={() => setConfirming(true)}>
              Sign out of this device
            </Button>
          )}
        </Field>
      ) : null}
    </>
  )
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
  const t = useTranslations('settings.general')
  const workModeItems = [
    { id: 'coding', label: t('workModeCoding'), hint: t('workModeCodingHint') },
    { id: 'everyday', label: t('workModeEveryday'), hint: t('workModeEverydayHint') }
  ] as const
  const submitModeItems = [
    { id: 'enter', label: t('submitEnter'), hint: t('submitEnterHint') },
    { id: 'mod-enter', label: t('submitModEnter'), hint: t('submitModEnterHint') }
  ] as const
  const speedItems = [
    { id: 'standard', label: t('speedStandard') },
    { id: 'fast', label: t('speedFast') },
    { id: 'deliberate', label: t('speedDeliberate') }
  ] as const
  const completionItems = [
    { id: 'unfocused', label: t('notifyUnfocused') },
    { id: 'always', label: t('notifyAlways') },
    { id: 'never', label: t('notifyNever') }
  ] as const
  const followUpItems = [
    { id: 'queue', label: t('followUpQueue'), hint: t('followUpQueueHint') },
    { id: 'steer', label: t('followUpSteer'), hint: t('followUpSteerHint') }
  ] as const
  const openDestinationItems = [
    { id: 'editor', label: t('openEditor') },
    { id: 'terminal', label: t('openTerminal') },
    { id: 'finder', label: t('openFinder') }
  ] as const

  return (
    <>
      <PageHeader title={t('title')} />
      <Field icon={Code} title={t('workMode')} hint={t('workModeHint')}>
        <ChoiceGrid
          columns="grid-cols-1 sm:grid-cols-2"
          items={workModeItems}
          selectedId={settings.workMode}
          onSelect={(id) => set('workMode', id as WorkMode)}
        />
      </Field>
      <Field icon={User} title={t('displayName')} hint={t('displayNameHint')}>
        <Input
          value={settings.userName}
          placeholder="Your name"
          onChange={(e) => set('userName', e.target.value)}
          maxLength={40}
          className="max-w-sm"
        />
      </Field>
      <Field icon={Languages} title={t('language')} hint={t('languageHint')}>
        <ChoiceGrid
          columns="grid-cols-2 sm:grid-cols-4"
          items={LANGUAGES.map((l) => ({
            id: l.id,
            label: l.id === 'system' ? t('systemLanguage') : l.label
          }))}
          selectedId={settings.language}
          onSelect={(id) => set('language', id as LanguageId)}
        />
      </Field>
      <Field icon={Send} title={t('sendMessages')} hint={t('sendMessagesHint')}>
        <ChoiceGrid
          columns="grid-cols-1 sm:grid-cols-2"
          items={submitModeItems}
          selectedId={settings.composerSubmitMode}
          onSelect={(id) => set('composerSubmitMode', id as ComposerSubmitMode)}
        />
      </Field>
      <Field icon={Terminal} title={t('defaultRuntime')} hint={t('defaultRuntimeHint')}>
        <ChoiceGrid
          columns="grid-cols-1 sm:grid-cols-2"
          items={[
            { id: 'local', label: t('localRuntime'), hint: t('localRuntimeHint') },
            { id: 'cloud', label: t('cloudRuntime'), hint: t('cloudRuntimeHint') }
          ]}
          selectedId={settings.runtimeMode}
          onSelect={(id) => set('runtimeMode', id as RuntimeMode)}
        />
      </Field>
      <Field icon={PanelLeft} title={t('sidebar')} hint={t('sidebarHint')}>
        <ToggleRow
          label={t('openSidebarOnLaunch')}
          checked={settings.openSidebarOnLaunch}
          onChange={(checked) => set('openSidebarOnLaunch', checked)}
        />
      </Field>
      <Field icon={Monitor} title={t('runtimeBehavior')} hint={t('runtimeBehaviorHint')}>
        <ToggleRow
          label={t('preventSleep')}
          checked={settings.preventSleepWhileRunning}
          onChange={(checked) => set('preventSleepWhileRunning', checked)}
        />
        <ToggleRow
          label={t('showTrayIcon')}
          checked={settings.showTrayIcon}
          onChange={(checked) => set('showTrayIcon', checked)}
        />
        <ToggleRow
          label={t('projectlessChat')}
          checked={settings.defaultProjectlessChat}
          onChange={(checked) => set('defaultProjectlessChat', checked)}
        />
        <ToggleRow
          label={t('suggestedPrompts')}
          checked={settings.suggestedPrompts}
          onChange={(checked) => set('suggestedPrompts', checked)}
        />
      </Field>
      <Field icon={Gauge} title={t('speed')} hint={t('speedHint')}>
        <ChoiceGrid
          columns="grid-cols-3"
          items={speedItems}
          selectedId={settings.inferenceSpeed}
          onSelect={(id) => set('inferenceSpeed', id as InferenceSpeed)}
        />
      </Field>
      <Field icon={Bell} title={t('notifications')} hint={t('notificationsHint')}>
        <ChoiceGrid
          columns="grid-cols-1 sm:grid-cols-3"
          items={completionItems}
          selectedId={settings.completionNotifications}
          onSelect={(id) => set('completionNotifications', id as CompletionNotificationMode)}
        />
        <ToggleRow
          label={t('permissionNotifications')}
          checked={settings.permissionNotifications}
          onChange={(checked) => set('permissionNotifications', checked)}
        />
        <ToggleRow
          label={t('questionNotifications')}
          checked={settings.questionNotifications}
          onChange={(checked) => set('questionNotifications', checked)}
        />
      </Field>
      <Field icon={MessageSquare} title={t('followUp')} hint={t('followUpHint')}>
        <ChoiceGrid
          columns="grid-cols-1 sm:grid-cols-2"
          items={followUpItems}
          selectedId={settings.followUpBehavior}
          onSelect={(id) => set('followUpBehavior', id as FollowUpBehavior)}
        />
      </Field>
      <Field icon={Plug} title={t('openDestination')} hint={t('openDestinationHint')}>
        <ChoiceGrid
          columns="grid-cols-3"
          items={openDestinationItems}
          selectedId={settings.defaultOpenDestination}
          onSelect={(id) => set('defaultOpenDestination', id as DefaultOpenDestination)}
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
  const t = useTranslations('settings.appearance')
  const themeItems = THEMES.map((theme) => ({
    ...theme,
    label: t(`theme${theme.id[0].toUpperCase()}${theme.id.slice(1)}`),
    icon: THEME_ICON[theme.id]
  }))
  const scaleItems = UI_SCALES.map((scale) => ({
    ...scale,
    label: t(`scale${scale.id[0].toUpperCase()}${scale.id.slice(1)}`)
  }))
  const fontItems = FONT_FAMILIES.map((font) => ({
    ...font,
    label: font.id === 'system' ? t('fontSystem') : font.label
  }))
  const densityItems = [
    { id: 'comfortable', label: t('densityComfortable') },
    { id: 'compact', label: t('densityCompact') },
    { id: 'spacious', label: t('densitySpacious') }
  ] as const
  const messageStyleItems = [
    { id: 'bubble', label: t('messageBubble') },
    { id: 'minimal', label: t('messageMinimal') }
  ] as const
  const composerSizeItems = [
    { id: 'compact', label: t('sizeCompact') },
    { id: 'default', label: t('sizeDefault') },
    { id: 'large', label: t('sizeLarge') }
  ] as const
  const sidebarWidthItems = [
    { id: 'narrow', label: t('widthNarrow') },
    { id: 'default', label: t('widthDefault') },
    { id: 'wide', label: t('widthWide') }
  ] as const
  const codeThemeItems = [
    { id: 'github-dark-dimmed', label: t('codeThemeDimmed') },
    { id: 'github-dark', label: t('codeThemeDark') },
    { id: 'github-light', label: t('codeThemeLight') }
  ] as const

  return (
    <>
      <PageHeader title={t('title')} />
      <Field icon={Palette} title={t('theme')} hint={t('themeHint')}>
        <ChoiceGrid
          columns="grid-cols-3"
          items={themeItems}
          selectedId={settings.theme}
          onSelect={(id) => set('theme', id as ThemeId)}
        />
      </Field>
      <Field icon={Type} title={t('interfaceSize')} hint={t('interfaceSizeHint')}>
        <ChoiceGrid
          columns="grid-cols-3"
          items={scaleItems}
          selectedId={settings.uiScale}
          onSelect={(id) => set('uiScale', id as UiScaleId)}
        />
      </Field>
      <Field icon={Type} title={t('fontFamily')} hint={t('fontFamilyHint')}>
        <ChoiceGrid
          columns="grid-cols-2"
          items={fontItems}
          selectedId={settings.fontFamily}
          onSelect={(id) => set('fontFamily', id as FontFamily)}
        />
      </Field>
      <Field icon={MessageSquare} title={t('chatDensity')} hint={t('chatDensityHint')}>
        <ChoiceGrid
          columns="grid-cols-3"
          items={densityItems}
          selectedId={settings.chatDensity}
          onSelect={(id) => set('chatDensity', id as ChatDensity)}
        />
      </Field>
      <Field icon={MessageSquare} title={t('messageStyle')} hint={t('messageStyleHint')}>
        <ChoiceGrid
          columns="grid-cols-2"
          items={messageStyleItems}
          selectedId={settings.messageStyle}
          onSelect={(id) => set('messageStyle', id as MessageStyle)}
        />
      </Field>
      <Field icon={Send} title={t('composerSize')} hint={t('composerSizeHint')}>
        <ChoiceGrid
          columns="grid-cols-3"
          items={composerSizeItems}
          selectedId={settings.composerSize}
          onSelect={(id) => set('composerSize', id as ComposerSize)}
        />
      </Field>
      <Field icon={PanelLeft} title={t('sidebarWidth')} hint={t('sidebarWidthHint')}>
        <ChoiceGrid
          columns="grid-cols-3"
          items={sidebarWidthItems}
          selectedId={settings.sidebarWidth}
          onSelect={(id) => set('sidebarWidth', id as SidebarWidth)}
        />
      </Field>
      <Field icon={Code} title={t('editorFontSize')} hint={t('editorFontSizeHint')}>
        <ChoiceGrid
          columns="grid-cols-4"
          items={CODE_FONT_SIZES.map((s) => ({ id: String(s.id), label: s.label }))}
          selectedId={String(settings.editorFontSize)}
          onSelect={(id) => set('editorFontSize', Number(id) as CodeFontSize)}
        />
      </Field>
      <Field icon={Terminal} title={t('terminalFontSize')} hint={t('terminalFontSizeHint')}>
        <ChoiceGrid
          columns="grid-cols-4"
          items={CODE_FONT_SIZES.map((s) => ({ id: String(s.id), label: s.label }))}
          selectedId={String(settings.terminalFontSize)}
          onSelect={(id) => set('terminalFontSize', Number(id) as CodeFontSize)}
        />
      </Field>
      <Field icon={Code} title={t('codeTheme')} hint={t('codeThemeHint')}>
        <ChoiceGrid
          columns="grid-cols-3"
          items={codeThemeItems}
          selectedId={settings.codeTheme}
          onSelect={(id) => set('codeTheme', id as CodeTheme)}
        />
      </Field>
      <Field icon={Monitor} title={t('motion')} hint={t('motionHint')}>
        <ToggleRow
          label={t('reduceMotion')}
          checked={settings.reducedMotion}
          onChange={(checked) => set('reducedMotion', checked)}
        />
        <ToggleRow
          label={t('pointerCursors')}
          checked={settings.pointerCursors}
          onChange={(checked) => set('pointerCursors', checked)}
        />
      </Field>
    </>
  )
}

function ShortcutsSection(): React.JSX.Element {
  const { settings } = useSettings()
  const shortcuts = shortcutsForSubmitMode(settings.composerSubmitMode)

  return (
    <>
      <PageHeader title="Keyboard shortcuts" subtitle="Cheat sheet for the app." />
      <div className="flex flex-col gap-px rounded-xl bg-foreground/4 p-1">
        {shortcuts.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm"
          >
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

  const command = info ? `claude mcp add --transport http codeus-app "${info.url}"` : ''

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

function EditorSection(): React.JSX.Element {
  const { settings, set } = useSettings()
  const tabSizeItems = [
    { id: '2', label: '2 spaces' },
    { id: '4', label: '4 spaces' },
    { id: '8', label: '8 spaces' }
  ] as const
  const lineNumberItems = [
    { id: 'on', label: 'On' },
    { id: 'off', label: 'Off' },
    { id: 'relative', label: 'Relative' }
  ] as const

  return (
    <>
      <PageHeader title="Editor" subtitle="Tune how the Monaco editor renders code." />
      <Field icon={Hash} title="Tab size" hint="Width of an indent step.">
        <ChoiceGrid
          columns="grid-cols-3"
          items={tabSizeItems}
          selectedId={String(settings.editorTabSize)}
          onSelect={(id) => set('editorTabSize', Number(id) as EditorTabSize)}
        />
      </Field>
      <Field
        icon={FileCode}
        title="Line numbers"
        hint="Off hides the gutter; relative aids motion keys."
      >
        <ChoiceGrid
          columns="grid-cols-3"
          items={lineNumberItems}
          selectedId={settings.editorLineNumbers}
          onSelect={(id) => set('editorLineNumbers', id as EditorLineNumbers)}
        />
      </Field>
      <Field icon={Type} title="Display">
        <ToggleRow
          label="Soft-wrap long lines"
          checked={settings.editorWordWrap}
          onChange={(checked) => set('editorWordWrap', checked)}
        />
        <ToggleRow
          label="Show minimap"
          checked={settings.editorMinimap}
          onChange={(checked) => set('editorMinimap', checked)}
        />
        <ToggleRow
          label="Format on save"
          checked={settings.editorFormatOnSave}
          onChange={(checked) => set('editorFormatOnSave', checked)}
        />
      </Field>
    </>
  )
}

function TerminalSection(): React.JSX.Element {
  const { settings, set } = useSettings()
  const scrollbackItems = [
    { id: '1000', label: '1k lines' },
    { id: '5000', label: '5k lines' },
    { id: '10000', label: '10k lines' },
    { id: '50000', label: '50k lines' }
  ] as const
  const cursorStyleItems = [
    { id: 'block', label: 'Block' },
    { id: 'underline', label: 'Underline' },
    { id: 'bar', label: 'Bar' }
  ] as const
  const bellItems = [
    { id: 'none', label: 'Silent' },
    { id: 'sound', label: 'Sound' }
  ] as const

  return (
    <>
      <PageHeader title="Terminal" subtitle="Tune the in-app terminal panel." />
      <Field icon={Hash} title="Scrollback" hint="Lines of history kept per session.">
        <ChoiceGrid
          columns="grid-cols-2 sm:grid-cols-4"
          items={scrollbackItems}
          selectedId={String(settings.terminalScrollback)}
          onSelect={(id) => set('terminalScrollback', Number(id) as TerminalScrollback)}
        />
      </Field>
      <Field icon={Terminal} title="Cursor">
        <ChoiceGrid
          columns="grid-cols-3"
          items={cursorStyleItems}
          selectedId={settings.terminalCursorStyle}
          onSelect={(id) => set('terminalCursorStyle', id as TerminalCursorStyle)}
        />
        <ToggleRow
          label="Blinking cursor"
          checked={settings.terminalCursorBlink}
          onChange={(checked) => set('terminalCursorBlink', checked)}
        />
      </Field>
      <Field icon={Bell} title="Bell" hint="Plays a chime when a process rings the bell character.">
        <ChoiceGrid
          columns="grid-cols-2"
          items={bellItems}
          selectedId={settings.terminalBell}
          onSelect={(id) => set('terminalBell', id as TerminalBellMode)}
        />
      </Field>
      <Field icon={Copy} title="Clipboard">
        <ToggleRow
          label="Copy on select"
          checked={settings.terminalCopyOnSelect}
          onChange={(checked) => set('terminalCopyOnSelect', checked)}
        />
      </Field>
    </>
  )
}

function SystemSection(): React.JSX.Element {
  const { settings, set } = useSettings()
  return (
    <>
      <PageHeader title="System" subtitle="How Codeus behaves alongside your OS." />
      <Field
        icon={AppWindow}
        title="Startup"
        hint="Pair with the menu bar icon to keep Codeus quietly running."
      >
        <ToggleRow
          label="Launch at login"
          checked={settings.launchAtLogin}
          onChange={(checked) => set('launchAtLogin', checked)}
        />
        <ToggleRow
          label="Start minimized"
          checked={settings.startMinimized}
          onChange={(checked) => set('startMinimized', checked)}
        />
      </Field>
      <Field
        icon={Monitor}
        title="Close behavior"
        hint="When enabled, closing the window hides it to the menu bar instead of quitting."
      >
        <ToggleRow
          label="Close to menu bar"
          checked={settings.closeToTray}
          onChange={(checked) => set('closeToTray', checked)}
        />
      </Field>
    </>
  )
}

function PrivacySection(): React.JSX.Element {
  const clearAllChats = useChatStore((s) => s.clearAllChats)
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <PageHeader title="Privacy & data" subtitle="Codeus keeps your chats on this Mac." />
      <Field icon={Shield} title="Telemetry">
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
          Codeus does not collect telemetry or analytics. Prompts you send are streamed to the
          production proxy, which forwards them to the upstream model — and otherwise stays out of
          your way.
        </p>
      </Field>
      <Field
        icon={MessageSquare}
        title="Chat retention"
        hint="Chats live in this app's local storage until you delete them."
      >
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
          Nothing is synced. Reinstalling the app, switching machines, or clearing application data
          will remove your chat history.
        </p>
      </Field>
      <Field icon={Trash2} title="Danger zone">
        {confirming ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              This permanently removes every chat. There&apos;s no undo.
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  clearAllChats()
                  setConfirming(false)
                }}
                className="gap-1.5"
              >
                <Trash2 className="size-3" />
                Yes, clear everything
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setConfirming(true)}
            className="self-start gap-1.5"
          >
            <Trash2 className="size-3" />
            Clear all chats
          </Button>
        )}
      </Field>
    </>
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

interface ChoiceItem {
  id: string
  label: string
  hint?: string
  icon?: React.ComponentType<{ className?: string }>
}

function ChoiceGrid({
  items,
  selectedId,
  onSelect,
  columns
}: {
  items: readonly ChoiceItem[]
  selectedId: string
  onSelect: (id: string) => void
  columns: string
}): React.JSX.Element {
  return (
    <div className={cn('grid gap-2', columns)}>
      {items.map((item) => {
        const Icon = item.icon
        const isActive = selectedId === item.id
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              'flex min-h-14 flex-col items-start justify-center gap-1 rounded-lg bg-foreground/5 px-3 py-2.5 text-left transition-colors hover:bg-foreground/8',
              isActive && 'bg-foreground/12'
            )}
            aria-pressed={isActive}
          >
            <span className="flex min-w-0 items-center gap-2">
              {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
              <span className="truncate text-sm font-medium">{item.label}</span>
            </span>
            {item.hint && (
              <span className="line-clamp-2 text-xs text-muted-foreground">{item.hint}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full max-w-sm items-center justify-between gap-3 rounded-lg bg-foreground/5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-foreground/8"
      aria-pressed={checked}
    >
      <span>{label}</span>
      <span
        className={cn(
          'relative h-5 w-9 rounded-full bg-foreground/10 transition-colors',
          checked && 'bg-foreground/25'
        )}
        aria-hidden
      >
        <span
          className={cn(
            'absolute top-1/2 left-1 size-3.5 -translate-y-1/2 rounded-full bg-foreground/70 transition-transform',
            checked && 'translate-x-4 bg-foreground'
          )}
        />
      </span>
    </button>
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
