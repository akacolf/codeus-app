import {
  Braces,
  File,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderGit2,
  FolderOpen,
  Settings
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'

interface FileIconProps {
  path: string
  className?: string
  monochrome?: boolean
}

export function FileIcon({ path, className, monochrome }: FileIconProps): React.JSX.Element {
  return <IconGlyph kind={monochrome ? 'file' : iconKindForFile(path)} className={className} />
}

interface FolderIconProps {
  name: string
  expanded?: boolean
  className?: string
}

export function FolderIcon({ name, expanded, className }: FolderIconProps): React.JSX.Element {
  return <IconGlyph kind={folderIconKindForName(name, !!expanded)} className={className} />
}

type IconKind =
  | 'braces'
  | 'code'
  | 'file'
  | 'folder'
  | 'folder-git'
  | 'folder-open'
  | 'json'
  | 'settings'
  | 'text'

function iconClassName(className?: string): string {
  return cn('size-3.5 shrink-0 text-muted-foreground', className)
}

function IconGlyph({ kind, className }: { kind: IconKind; className?: string }): React.JSX.Element {
  if (kind === 'braces') return <Braces className={iconClassName(className)} aria-hidden />
  if (kind === 'code') return <FileCode2 className={iconClassName(className)} aria-hidden />
  if (kind === 'folder') return <Folder className={iconClassName(className)} aria-hidden />
  if (kind === 'folder-git') return <FolderGit2 className={iconClassName(className)} aria-hidden />
  if (kind === 'folder-open') return <FolderOpen className={iconClassName(className)} aria-hidden />
  if (kind === 'json') return <FileJson className={iconClassName(className)} aria-hidden />
  if (kind === 'settings') return <Settings className={iconClassName(className)} aria-hidden />
  if (kind === 'text') return <FileText className={iconClassName(className)} aria-hidden />
  return <File className={iconClassName(className)} aria-hidden />
}

function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return idx === -1 ? path : path.slice(idx + 1)
}

function extension(path: string): string {
  const base = basename(path)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

function iconKindForFile(path: string): IconKind {
  const base = basename(path).toLowerCase()
  const ext = extension(path)
  if (base.startsWith('.env') || base.includes('config')) return 'settings'
  if (['json', 'jsonc', 'json5'].includes(ext)) return 'json'
  if (['md', 'mdx', 'txt'].includes(ext)) return 'text'
  if (['css', 'scss', 'html', 'xml', 'svg'].includes(ext)) return 'braces'
  if (
    ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'sh', 'zsh', 'sql'].includes(ext)
  ) {
    return 'code'
  }
  return 'file'
}

function folderIconKindForName(name: string, expanded: boolean): IconKind {
  const normalized = name.toLowerCase()
  if (normalized === '.git' || normalized === '.github') return 'folder-git'
  return expanded ? 'folder-open' : 'folder'
}
