import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { EditorPane } from './EditorPane'
import { FileTree } from './FileTree'
import { isDirty, useWorkspaceStore } from '@renderer/stores/workspaceStore'

export function Workspace(): React.JSX.Element {
  const open = useWorkspaceStore((s) => s.open)
  const activePath = useWorkspaceStore((s) => s.activePath)
  const openFile = useWorkspaceStore((s) => s.openFile)
  const closeFile = useWorkspaceStore((s) => s.closeFile)
  const setActive = useWorkspaceStore((s) => s.setActive)
  const saveActive = useWorkspaceStore((s) => s.saveActive)

  // Global Cmd+S in the workspace view also saves (Monaco's command is scoped
  // to the editor surface — this catches the case where focus is on a tab).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveActive()
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [saveActive])

  const activeFile = open.find((f) => f.path === activePath) ?? null

  return (
    <div className="flex h-full min-h-0 w-full">
      <FileTree activePath={activePath} onOpen={(p) => void openFile(p)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TabBar open={open} activePath={activePath} onSelect={setActive} onClose={closeFile} />
        <div className="min-h-0 flex-1">
          {activeFile ? <EditorPane file={activeFile} /> : <EmptyState />}
        </div>
      </div>
    </div>
  )
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

interface TabBarProps {
  open: ReturnType<typeof useWorkspaceStore.getState>['open']
  activePath: string | null
  onSelect: (path: string) => void
  onClose: (path: string) => void
}

function TabBar({ open, activePath, onSelect, onClose }: TabBarProps): React.JSX.Element {
  if (open.length === 0) return <div className="h-9 shrink-0" />
  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto px-1.5">
      {open.map((f) => {
        const active = f.path === activePath
        const dirty = isDirty(f)
        return (
          <div
            key={f.path}
            className={cn(
              'group inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-xs transition-colors',
              active
                ? 'bg-foreground/8 text-foreground'
                : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(f.path)}
              className="inline-flex items-center gap-1.5"
            >
              <span className="font-mono">{basename(f.path)}</span>
              {dirty && <span aria-hidden className="size-1.5 rounded-full bg-foreground/70" />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onClose(f.path)
              }}
              aria-label={`Close ${f.path}`}
              className="inline-flex size-4 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-foreground/12 hover:text-foreground"
            >
              <X className="size-2.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <p className="text-sm">Open a file from the tree to get started.</p>
      <p className="text-xs">⌘S to save · Click a folder to expand</p>
    </div>
  )
}
