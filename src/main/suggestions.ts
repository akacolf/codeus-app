import { ipcMain } from 'electron'
import { generateText } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { z } from 'zod'
import { getAccountId } from './identity'
import { getSessionToken } from './auth'
import { getActiveProjectCwd } from './project'

const QC_PROXY_BASE_URL = process.env.QC_PROXY_BASE_URL || 'https://api.quantumclub.sh/v1'

// Cheap + fast — suggestions are low-stakes and should not burn the good models.
const SUGGEST_MODEL = 'anthropic/claude-haiku-4.5'

const MAX_LABEL_LEN = 76
const MAX_SUGGESTIONS = 4
const MAX_CACHE_ENTRIES = 50

const ContextSchema = z.object({
  // HEAD commit SHA — when present, suggestions are cached against it so we
  // don't re-call the model on every home-screen mount for the same commit.
  headSha: z.string().optional(),
  branch: z.string().nullable().default(null),
  dirtyCount: z.number().int().nonnegative().default(0),
  commits: z
    .array(z.object({ subject: z.string(), relativeDate: z.string().optional() }))
    .max(12)
    .default([]),
  files: z.array(z.string()).max(160).default([]),
  // The user's recent intents — drawn from their recent chat titles / prompts.
  recentIntents: z.array(z.string()).max(12).default([])
})

type SuggestContext = z.infer<typeof ContextSchema>

export type SuggestResult = { ok: true; suggestions: string[] } | { ok: false; error: string }

// In-memory cache keyed by HEAD SHA. Survives for the app session; a new commit
// produces a new key and a fresh generation.
const cache = new Map<string, string[]>()

function cacheGet(sha: string): string[] | undefined {
  const hit = cache.get(sha)
  if (!hit) return undefined
  // Refresh recency (LRU): re-insert so frequently-seen SHAs survive eviction.
  cache.delete(sha)
  cache.set(sha, hit)
  return hit
}

function cacheSet(sha: string, suggestions: string[]): void {
  cache.set(sha, suggestions)
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

function clampLabel(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > MAX_LABEL_LEN ? `${t.slice(0, MAX_LABEL_LEN - 1).trimEnd()}…` : t
}

function buildPrompt(ctx: SuggestContext): string {
  const lines: string[] = []
  lines.push(`Branch: ${ctx.branch ?? '(none / not a git repo)'}`)
  lines.push(`Uncommitted changes: ${ctx.dirtyCount} file(s)`)
  if (ctx.commits.length > 0) {
    lines.push('Recent commits (newest first):')
    for (const c of ctx.commits.slice(0, 8)) {
      lines.push(`- ${c.subject}${c.relativeDate ? ` (${c.relativeDate})` : ''}`)
    }
  }
  if (ctx.files.length > 0) {
    lines.push('Notable files in the project root and src tree:')
    lines.push(ctx.files.slice(0, 80).join(', '))
  }
  if (ctx.recentIntents.length > 0) {
    lines.push('What the user has recently been asking the agent to do (their intents):')
    for (const intent of ctx.recentIntents.slice(0, 8)) {
      lines.push(`- ${intent}`)
    }
  }
  return lines.join('\n')
}

// Pull the first JSON array out of the model's reply, tolerating code fences or
// stray prose around it.
function parseSuggestions(raw: string): string[] {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  const slice = start !== -1 && end > start ? trimmed.slice(start, end + 1) : trimmed
  let parsed: unknown
  try {
    parsed = JSON.parse(slice)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of parsed) {
    if (typeof item !== 'string') continue
    const label = clampLabel(item)
    if (!label || seen.has(label)) continue
    seen.add(label)
    out.push(label)
    if (out.length >= MAX_SUGGESTIONS) break
  }
  return out
}

async function suggestHome(rawCtx: unknown): Promise<SuggestResult> {
  const parsed = ContextSchema.safeParse(rawCtx ?? {})
  if (!parsed.success) return { ok: false, error: 'invalid context' }

  // Key on branch + SHA: switching branches must surface fresh suggestions even
  // when both branches point at the same commit. For a non-git or empty folder
  // (no SHA) fall back to the project path so we still cache per session rather
  // than re-calling the model on every home mount.
  const { headSha, branch } = parsed.data
  const cacheKey = headSha ? `${branch ?? ''}@${headSha}` : `cwd:${getActiveProjectCwd()}`
  const cached = cacheGet(cacheKey)
  if (cached) return { ok: true, suggestions: cached }

  const sessionToken = getSessionToken()
  if (!sessionToken) return { ok: false, error: 'signed out' }

  const authFetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set('X-QC-Account', getAccountId())
    return fetch(input, { ...init, headers })
  }

  try {
    const provider = createOpenAICompatible({
      name: 'qc',
      baseURL: QC_PROXY_BASE_URL,
      apiKey: sessionToken,
      fetch: authFetch
    })

    const system = [
      'You generate starter prompts for the home screen of an agentic coding IDE.',
      'Given a snapshot of the user’s repository and what they have recently been working on,',
      `propose exactly ${MAX_SUGGESTIONS} prompts the user could send to the coding agent next.`,
      'Rules:',
      '- Each prompt is a concrete, imperative instruction TO the agent (e.g. "Review the auth refactor for regressions"), not a question to the user.',
      '- Ground them in the actual repo state and the user’s recent intents. Reference real commit topics, files, or in-flight work when possible.',
      '- Keep each under 12 words. No trailing punctuation. No numbering.',
      '- Make them distinct from each other and genuinely useful as a next step.',
      'Respond with ONLY a JSON array of strings. No prose, no code fences.'
    ].join('\n')

    const { text } = await generateText({
      model: provider(SUGGEST_MODEL),
      system,
      prompt: buildPrompt(parsed.data),
      temperature: 0.7,
      maxOutputTokens: 300
    })

    const suggestions = parseSuggestions(text)
    if (suggestions.length === 0) return { ok: false, error: 'no suggestions' }
    cacheSet(cacheKey, suggestions)
    return { ok: true, suggestions }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'suggestion failed' }
  }
}

export function registerSuggestionsIpc(): void {
  ipcMain.handle('suggest:home', (_e, ctx: unknown) => suggestHome(ctx))
}
