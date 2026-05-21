import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export interface DirEntry {
  name: string
  path: string
  type: 'file' | 'dir'
}

export interface OpenFile {
  path: string // project-relative, posix-style
  // `original` is what's on disk; `value` is the editor buffer.
  original: string
  value: string
  loading: boolean
  error?: string
}

interface WorkspaceStore {
  open: OpenFile[]
  activePath: string | null
  expandedDirs: Set<string> // posix-relative dir paths the file tree has expanded
  // Latest "scroll/cursor here" request from a citation link. Bumps `seq` on
  // every call so EditorPane re-fires the reveal even when path+line repeat.
  pendingReveal: { path: string; line: number; seq: number } | null

  openFile: (path: string) => Promise<void>
  closeFile: (path: string) => void
  setActive: (path: string) => void
  setBuffer: (path: string, value: string) => void
  saveActive: () => Promise<void>
  toggleDir: (path: string) => void
  revealInEditor: (path: string, line: number) => Promise<void>
  clearPendingReveal: (path: string, seq: number) => void
}

function isDirty(f: OpenFile): boolean {
  return f.value !== f.original
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  subscribeWithSelector((set, get) => ({
    open: [],
    activePath: null,
    expandedDirs: new Set<string>(['']),
    pendingReveal: null,

    openFile: async (path) => {
      // Already open — just focus it.
      const existing = get().open.find((f) => f.path === path)
      if (existing) {
        set({ activePath: path })
        return
      }
      // Optimistic loading slot.
      set((s) => ({
        open: [...s.open, { path, original: '', value: '', loading: true }],
        activePath: path
      }))
      const result = await window.api.fs.readFile(path)
      set((s) => ({
        open: s.open.map((f) => {
          if (f.path !== path) return f
          if (!result.ok) return { ...f, loading: false, error: result.error }
          return { path, original: result.content, value: result.content, loading: false }
        })
      }))
    },

    closeFile: (path) => {
      set((s) => {
        const next = s.open.filter((f) => f.path !== path)
        let activePath = s.activePath
        if (activePath === path) {
          if (next.length === 0) {
            activePath = null
          } else {
            const idx = s.open.findIndex((f) => f.path === path)
            const fallback = next[Math.min(idx, next.length - 1)]
            activePath = fallback.path
          }
        }
        return { open: next, activePath }
      })
    },

    setActive: (path) => set({ activePath: path }),

    setBuffer: (path, value) =>
      set((s) => ({
        open: s.open.map((f) => (f.path === path ? { ...f, value } : f))
      })),

    saveActive: async () => {
      const { open, activePath } = get()
      if (!activePath) return
      const file = open.find((f) => f.path === activePath)
      if (!file || file.loading || !isDirty(file)) return
      const result = await window.api.fs.writeFile(file.path, file.value)
      if (result.ok) {
        set((s) => ({
          open: s.open.map((f) => (f.path === file.path ? { ...f, original: file.value } : f))
        }))
      } else {
        set((s) => ({
          open: s.open.map((f) => (f.path === file.path ? { ...f, error: result.error } : f))
        }))
      }
    },

    toggleDir: (path) =>
      set((s) => {
        const next = new Set(s.expandedDirs)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return { expandedDirs: next }
      }),

    revealInEditor: async (path, line) => {
      await get().openFile(path)
      set((s) => ({
        pendingReveal: { path, line, seq: (s.pendingReveal?.seq ?? 0) + 1 }
      }))
    },

    clearPendingReveal: (path, seq) => {
      set((s) => {
        if (!s.pendingReveal) return s
        if (s.pendingReveal.path !== path || s.pendingReveal.seq !== seq) return s
        return { pendingReveal: null }
      })
    }
  }))
)

export { isDirty }
