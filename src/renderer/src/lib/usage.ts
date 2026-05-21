// Local-only usage counters. The proxy doesn't expose per-user usage during
// the research preview, so we report what we can observe from the renderer:
// number of streamed requests and total characters of streamed text. Numbers
// reset to zero on the day boundary (local time).

const KEY = 'qc-codeus.usage.v1'

interface UsageSnapshot {
  day: string // YYYY-MM-DD local
  requests: number
  chars: number
  lifetimeRequests: number
  lifetimeChars: number
}

function today(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const DEFAULT: UsageSnapshot = {
  day: today(),
  requests: 0,
  chars: 0,
  lifetimeRequests: 0,
  lifetimeChars: 0
}

function read(): UsageSnapshot {
  if (typeof window === 'undefined') return { ...DEFAULT }
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT }
    const parsed = { ...DEFAULT, ...(JSON.parse(raw) as Partial<UsageSnapshot>) }
    if (parsed.day !== today()) {
      parsed.day = today()
      parsed.requests = 0
      parsed.chars = 0
    }
    return parsed
  } catch {
    return { ...DEFAULT }
  }
}

function write(snap: UsageSnapshot): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(snap))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(snap))
}

let cache = read()
const listeners = new Set<(s: UsageSnapshot) => void>()

export function getUsage(): UsageSnapshot {
  // Roll day if needed.
  if (cache.day !== today()) {
    cache = { ...cache, day: today(), requests: 0, chars: 0 }
    write(cache)
  }
  return cache
}

export function recordRequest(): void {
  cache = { ...getUsage() }
  cache.requests += 1
  cache.lifetimeRequests += 1
  write(cache)
}

export function recordChars(n: number): void {
  if (n <= 0) return
  cache = { ...getUsage() }
  cache.chars += n
  cache.lifetimeChars += n
  write(cache)
}

export function subscribeUsage(cb: (s: UsageSnapshot) => void): () => void {
  listeners.add(cb)
  return (): void => {
    listeners.delete(cb)
  }
}

export function resetUsage(): void {
  cache = { ...DEFAULT, day: today() }
  write(cache)
}

export type { UsageSnapshot }
