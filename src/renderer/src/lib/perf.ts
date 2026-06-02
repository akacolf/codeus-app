type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
    cancelIdleCallback?: (handle: number) => void
  }

export function mark(name: string): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return
  try {
    performance.mark(name)
  } catch {
    /* ignore unavailable marks */
  }
}

export function measure(name: string, startMark: string, endMark: string): void {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return
  try {
    performance.measure(name, startMark, endMark)
  } catch {
    /* ignore missing marks */
  }
}

export function loadWithPerf<T>(name: string, loader: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null
  return () => {
    if (!promise) {
      const start = `chunk:${name}:request`
      const end = `chunk:${name}:loaded`
      mark(start)
      promise = loader().then((module) => {
        mark(end)
        measure(`chunk:${name}`, start, end)
        return module
      })
    }
    return promise
  }
}

export function scheduleIdleWork(work: () => void, timeout = 2500): () => void {
  if (typeof window === 'undefined') return () => {}
  const idleWindow = window as IdleWindow
  if (typeof idleWindow.requestIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(work, { timeout })
    return () => idleWindow.cancelIdleCallback?.(handle)
  }
  const handle = window.setTimeout(work, Math.min(timeout, 1200))
  return () => window.clearTimeout(handle)
}
