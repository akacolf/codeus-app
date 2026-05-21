import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useWorkspaceStore, type DirEntry } from '@renderer/stores/workspaceStore'
import { FileIcon, FolderIcon } from './FileIcon'
import { Loader } from './Loader'

interface FileTreeProps {
  activePath: string | null
  onOpen: (path: string) => void
}

export function FileTree({ activePath, onOpen }: FileTreeProps): React.JSX.Element {
  const expandedDirs = useWorkspaceStore((s) => s.expandedDirs)
  const toggleDir = useWorkspaceStore((s) => s.toggleDir)

  return (
    <div className="flex h-full w-60 shrink-0 flex-col bg-card/40">
      <div className="flex h-9 shrink-0 items-center px-3 text-[11px] tracking-wide text-muted-foreground uppercase">
        Files
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 pl-1 pb-2">
        <DirNode
          dirPath=""
          depth={0}
          expanded={expandedDirs.has('')}
          onToggle={toggleDir}
          activePath={activePath}
          onOpen={onOpen}
        />
      </div>
    </div>
  )
}

interface DirNodeProps {
  dirPath: string
  depth: number
  expanded: boolean
  onToggle: (path: string) => void
  activePath: string | null
  onOpen: (path: string) => void
}

function DirNode({
  dirPath,
  depth,
  expanded,
  onToggle,
  activePath,
  onOpen
}: DirNodeProps): React.JSX.Element {
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!expanded) return
    let cancelled = false
    void window.api.fs.listDir(dirPath || undefined).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setEntries(res.entries)
        setError(null)
      } else {
        setError(res.error)
      }
    })
    return (): void => {
      cancelled = true
    }
  }, [dirPath, expanded])

  // Root renders its contents directly, no header row.
  if (dirPath === '') {
    if (!entries && !error)
      return (
        <div className="flex items-center justify-center px-3 py-6">
          <Loader size={28} label="Loading files" />
        </div>
      )
    if (error) return <div className="px-3 py-2 text-xs text-muted-foreground">{error}</div>
    return (
      <ul className="flex flex-col">
        {entries!.map((e) => (
          <EntryRow
            key={e.path}
            entry={e}
            depth={depth}
            activePath={activePath}
            onOpen={onOpen}
            onToggle={onToggle}
          />
        ))}
      </ul>
    )
  }

  return (
    <ul className="flex flex-col">
      {!entries && expanded && !error && (
        <li
          className="px-2 py-1 text-xs text-muted-foreground"
          style={{ paddingLeft: depth * 12 + 24 }}
        >
          Loading…
        </li>
      )}
      {error && (
        <li
          className="px-2 py-1 text-xs text-muted-foreground"
          style={{ paddingLeft: depth * 12 + 24 }}
        >
          {error}
        </li>
      )}
      {entries?.map((e) => (
        <EntryRow
          key={e.path}
          entry={e}
          depth={depth}
          activePath={activePath}
          onOpen={onOpen}
          onToggle={onToggle}
        />
      ))}
    </ul>
  )
}

interface EntryRowProps {
  entry: DirEntry
  depth: number
  activePath: string | null
  onOpen: (path: string) => void
  onToggle: (path: string) => void
}

function EntryRow({
  entry,
  depth,
  activePath,
  onOpen,
  onToggle
}: EntryRowProps): React.JSX.Element {
  const expanded = useWorkspaceStore((s) => s.expandedDirs.has(entry.path))
  const isActive = entry.type === 'file' && activePath === entry.path

  if (entry.type === 'dir') {
    return (
      <li>
        <button
          type="button"
          onClick={() => onToggle(entry.path)}
          className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[13px] text-foreground/85 hover:bg-foreground/8"
          style={{ paddingLeft: depth * 12 + 6 }}
        >
          <ChevronRight
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-90'
            )}
          />
          <FolderIcon name={entry.name} expanded={expanded} />
          <span className="truncate">{entry.name}</span>
        </button>
        {expanded && (
          <DirNode
            dirPath={entry.path}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            activePath={activePath}
            onOpen={onOpen}
          />
        )}
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(entry.path)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[13px] hover:bg-foreground/8',
          isActive ? 'bg-foreground/8 text-foreground' : 'text-foreground/75'
        )}
        style={{ paddingLeft: depth * 12 + 22 }}
      >
        <FileIcon path={entry.name} />
        <span className="truncate">{entry.name}</span>
      </button>
    </li>
  )
}
