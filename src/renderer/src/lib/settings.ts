import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'

export const PERMISSIONS = [
  { id: 'default', label: 'Default' },
  { id: 'auto-review', label: 'Auto-review' },
  { id: 'full-access', label: 'Full access' }
] as const

export type PermissionId = (typeof PERMISSIONS)[number]['id']

export const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' }
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const LANGUAGES = [
  { id: 'system', label: 'System language', locale: null },
  { id: 'en', label: 'English', locale: 'en-US' },
  { id: 'tr', label: 'Türkçe', locale: 'tr-TR' },
  { id: 'es', label: 'Español', locale: 'es-ES' },
  { id: 'fr', label: 'Français', locale: 'fr-FR' },
  { id: 'de', label: 'Deutsch', locale: 'de-DE' },
  { id: 'it', label: 'Italiano', locale: 'it-IT' },
  { id: 'pt', label: 'Português', locale: 'pt-BR' },
  { id: 'ru', label: 'Русский', locale: 'ru-RU' },
  { id: 'ja', label: '日本語', locale: 'ja-JP' },
  { id: 'ko', label: '한국어', locale: 'ko-KR' },
  { id: 'zh', label: '中文', locale: 'zh-CN' },
  { id: 'ar', label: 'العربية', locale: 'ar-SA' },
  { id: 'hi', label: 'हिन्दी', locale: 'hi-IN' }
] as const

export type LanguageId = (typeof LANGUAGES)[number]['id']

export const WORK_MODES = [
  { id: 'coding', label: 'For coding', hint: 'More technical responses and control.' },
  { id: 'everyday', label: 'For everyday work', hint: 'Same power, less technical detail.' }
] as const

export type WorkMode = (typeof WORK_MODES)[number]['id']

export const COMPOSER_SUBMIT_MODES = [
  { id: 'enter', label: 'Enter', hint: 'Shift+Enter inserts a new line.' },
  { id: 'mod-enter', label: '⌘/Ctrl+Enter', hint: 'Enter inserts a new line.' }
] as const

export type ComposerSubmitMode = (typeof COMPOSER_SUBMIT_MODES)[number]['id']

export const UI_SCALES = [
  { id: 'small', label: 'Small', fontSize: 15 },
  { id: 'default', label: 'Default', fontSize: 16 },
  { id: 'large', label: 'Large', fontSize: 17 }
] as const

export type UiScaleId = (typeof UI_SCALES)[number]['id']

export const CODE_FONT_SIZES = [
  { id: 12, label: '12' },
  { id: 13, label: '13' },
  { id: 14, label: '14' },
  { id: 15, label: '15' }
] as const

export type CodeFontSize = (typeof CODE_FONT_SIZES)[number]['id']

export const DEFAULT_OPEN_DESTINATIONS = [
  { id: 'editor', label: 'Editor' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'finder', label: 'Finder' }
] as const

export type DefaultOpenDestination = (typeof DEFAULT_OPEN_DESTINATIONS)[number]['id']

export const COMPLETION_NOTIFICATION_MODES = [
  { id: 'unfocused', label: 'Only when unfocused' },
  { id: 'always', label: 'Always' },
  { id: 'never', label: 'Never' }
] as const

export type CompletionNotificationMode = (typeof COMPLETION_NOTIFICATION_MODES)[number]['id']

export const INFERENCE_SPEEDS = [
  { id: 'standard', label: 'Standard' },
  { id: 'fast', label: 'Fast' },
  { id: 'deliberate', label: 'Deliberate' }
] as const

export type InferenceSpeed = (typeof INFERENCE_SPEEDS)[number]['id']

export const FOLLOW_UP_BEHAVIORS = [
  { id: 'queue', label: 'Queue' },
  { id: 'steer', label: 'Steer' }
] as const

export type FollowUpBehavior = (typeof FOLLOW_UP_BEHAVIORS)[number]['id']

export const CODE_REVIEW_MODES = [
  { id: 'inline', label: 'Inline' },
  { id: 'detached', label: 'Detached' }
] as const

export type CodeReviewMode = (typeof CODE_REVIEW_MODES)[number]['id']

export const CHAT_DENSITIES = [
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'compact', label: 'Compact' },
  { id: 'spacious', label: 'Spacious' }
] as const

export type ChatDensity = (typeof CHAT_DENSITIES)[number]['id']

export const COMPOSER_SIZES = [
  { id: 'compact', label: 'Compact' },
  { id: 'default', label: 'Default' },
  { id: 'large', label: 'Large' }
] as const

export type ComposerSize = (typeof COMPOSER_SIZES)[number]['id']

export const SIDEBAR_WIDTHS = [
  { id: 'narrow', label: 'Narrow', className: 'w-64' },
  { id: 'default', label: 'Default', className: 'w-72' },
  { id: 'wide', label: 'Wide', className: 'w-80' }
] as const

export type SidebarWidth = (typeof SIDEBAR_WIDTHS)[number]['id']

export const FONT_FAMILIES = [
  { id: 'onest', label: 'Onest' },
  { id: 'system', label: 'System' }
] as const

export type FontFamily = (typeof FONT_FAMILIES)[number]['id']

export const CODE_THEMES = [
  { id: 'github-dark-dimmed', label: 'Dimmed' },
  { id: 'github-dark', label: 'Dark' },
  { id: 'github-light', label: 'Light' }
] as const

export type CodeTheme = (typeof CODE_THEMES)[number]['id']

export const MESSAGE_STYLES = [
  { id: 'bubble', label: 'Bubble' },
  { id: 'minimal', label: 'Minimal' }
] as const

export type MessageStyle = (typeof MESSAGE_STYLES)[number]['id']

// Research-preview lineup tuned for cost per quality. Opus was dropped — its
// agentic gains over Sonnet 4.6 don't justify ~5× the spend for everyday IDE
// work. Add Opus back if/when a "premium" tier is worth offering.
export const MODELS = [
  { id: 'sonnet-4.6', label: 'Sonnet 4.6', hint: 'Balanced default' },
  { id: 'haiku-4.5', label: 'Haiku 4.5', hint: 'Fastest, cheapest Claude' },
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash', hint: 'Very cheap, very fast' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', hint: 'OpenAI cheap tier' }
] as const

export type ModelId = (typeof MODELS)[number]['id']

export type RuntimeMode = 'local' | 'cloud'

interface Settings {
  permission: PermissionId
  model: ModelId
  userName: string
  runtimeMode: RuntimeMode
  theme: ThemeId
  language: LanguageId
  workMode: WorkMode
  composerSubmitMode: ComposerSubmitMode
  openSidebarOnLaunch: boolean
  defaultOpenDestination: DefaultOpenDestination
  preventSleepWhileRunning: boolean
  suggestedPrompts: boolean
  defaultProjectlessChat: boolean
  completionNotifications: CompletionNotificationMode
  permissionNotifications: boolean
  questionNotifications: boolean
  inferenceSpeed: InferenceSpeed
  followUpBehavior: FollowUpBehavior
  codeReviewMode: CodeReviewMode
  uiScale: UiScaleId
  editorFontSize: CodeFontSize
  terminalFontSize: CodeFontSize
  reducedMotion: boolean
  chatDensity: ChatDensity
  composerSize: ComposerSize
  sidebarWidth: SidebarWidth
  fontFamily: FontFamily
  codeTheme: CodeTheme
  messageStyle: MessageStyle
  pointerCursors: boolean
}

const DEFAULTS: Settings = {
  permission: 'default',
  model: 'sonnet-4.6',
  userName: '',
  runtimeMode: 'local',
  theme: 'dark',
  language: 'system',
  workMode: 'coding',
  composerSubmitMode: 'enter',
  openSidebarOnLaunch: false,
  defaultOpenDestination: 'editor',
  preventSleepWhileRunning: false,
  suggestedPrompts: true,
  defaultProjectlessChat: false,
  completionNotifications: 'unfocused',
  permissionNotifications: true,
  questionNotifications: true,
  inferenceSpeed: 'standard',
  followUpBehavior: 'queue',
  codeReviewMode: 'inline',
  uiScale: 'default',
  editorFontSize: 13,
  terminalFontSize: 13,
  reducedMotion: false,
  chatDensity: 'comfortable',
  composerSize: 'default',
  sidebarWidth: 'default',
  fontFamily: 'onest',
  codeTheme: 'github-dark-dimmed',
  messageStyle: 'bubble',
  pointerCursors: true
}

const KEY = 'qc-codeus.settings.v1'

const settingsSchema = z.object({
  permission: z.enum(['default', 'auto-review', 'full-access']).catch(DEFAULTS.permission),
  model: z.enum(['sonnet-4.6', 'haiku-4.5', 'gemini-3-flash', 'gpt-5-mini']).catch(DEFAULTS.model),
  userName: z.string().catch(DEFAULTS.userName),
  runtimeMode: z.enum(['local', 'cloud']).catch(DEFAULTS.runtimeMode),
  theme: z.enum(['system', 'light', 'dark']).catch(DEFAULTS.theme),
  language: z
    .enum(['system', 'en', 'tr', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi'])
    .catch(DEFAULTS.language),
  workMode: z.enum(['coding', 'everyday']).catch(DEFAULTS.workMode),
  composerSubmitMode: z.enum(['enter', 'mod-enter']).catch(DEFAULTS.composerSubmitMode),
  openSidebarOnLaunch: z.boolean().catch(DEFAULTS.openSidebarOnLaunch),
  defaultOpenDestination: z
    .enum(['editor', 'terminal', 'finder'])
    .catch(DEFAULTS.defaultOpenDestination),
  preventSleepWhileRunning: z.boolean().catch(DEFAULTS.preventSleepWhileRunning),
  suggestedPrompts: z.boolean().catch(DEFAULTS.suggestedPrompts),
  defaultProjectlessChat: z.boolean().catch(DEFAULTS.defaultProjectlessChat),
  completionNotifications: z
    .enum(['unfocused', 'always', 'never'])
    .catch(DEFAULTS.completionNotifications),
  permissionNotifications: z.boolean().catch(DEFAULTS.permissionNotifications),
  questionNotifications: z.boolean().catch(DEFAULTS.questionNotifications),
  inferenceSpeed: z.enum(['standard', 'fast', 'deliberate']).catch(DEFAULTS.inferenceSpeed),
  followUpBehavior: z.enum(['queue', 'steer']).catch(DEFAULTS.followUpBehavior),
  codeReviewMode: z.enum(['inline', 'detached']).catch(DEFAULTS.codeReviewMode),
  uiScale: z.enum(['small', 'default', 'large']).catch(DEFAULTS.uiScale),
  editorFontSize: z.union([z.literal(12), z.literal(13), z.literal(14), z.literal(15)]).catch(13),
  terminalFontSize: z.union([z.literal(12), z.literal(13), z.literal(14), z.literal(15)]).catch(13),
  reducedMotion: z.boolean().catch(DEFAULTS.reducedMotion),
  chatDensity: z.enum(['comfortable', 'compact', 'spacious']).catch(DEFAULTS.chatDensity),
  composerSize: z.enum(['compact', 'default', 'large']).catch(DEFAULTS.composerSize),
  sidebarWidth: z.enum(['narrow', 'default', 'wide']).catch(DEFAULTS.sidebarWidth),
  fontFamily: z.enum(['onest', 'system']).catch(DEFAULTS.fontFamily),
  codeTheme: z
    .enum(['github-dark-dimmed', 'github-dark', 'github-light'])
    .catch(DEFAULTS.codeTheme),
  messageStyle: z.enum(['bubble', 'minimal']).catch(DEFAULTS.messageStyle),
  pointerCursors: z.boolean().catch(DEFAULTS.pointerCursors)
})

function read(): Settings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    return settingsSchema.parse({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) })
  } catch {
    return DEFAULTS
  }
}

let cache: Settings = read()
const listeners = new Set<(s: Settings) => void>()

function write(next: Settings): void {
  cache = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(next))
}

export function useSettings(): {
  settings: Settings
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
} {
  const [settings, setSettings] = useState<Settings>(cache)

  useEffect(() => {
    listeners.add(setSettings)
    return (): void => {
      listeners.delete(setSettings)
    }
  }, [])

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]): void => {
    write({ ...cache, [key]: value })
  }, [])

  return { settings, set }
}

export function modelById(id: ModelId): (typeof MODELS)[number] {
  return MODELS.find((m) => m.id === id) ?? MODELS[0]
}

export function permissionById(id: PermissionId): (typeof PERMISSIONS)[number] {
  return PERMISSIONS.find((p) => p.id === id) ?? PERMISSIONS[0]
}

export function languageById(id: LanguageId): (typeof LANGUAGES)[number] {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0]
}

export function uiScaleById(id: UiScaleId): (typeof UI_SCALES)[number] {
  return UI_SCALES.find((s) => s.id === id) ?? UI_SCALES[1]
}

export function sidebarWidthById(id: SidebarWidth): (typeof SIDEBAR_WIDTHS)[number] {
  return SIDEBAR_WIDTHS.find((s) => s.id === id) ?? SIDEBAR_WIDTHS[1]
}
