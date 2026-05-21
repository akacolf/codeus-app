import { File, Folder, FolderOpen } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { fileIconUrl, folderIconUrl } from '@renderer/lib/file-icon'

interface FileIconProps {
  path: string
  className?: string
  monochrome?: boolean
}

export function FileIcon({ path, className, monochrome }: FileIconProps): React.JSX.Element {
  const url = fileIconUrl(path)
  if (monochrome || !url) return <File className={cn('size-3.5', className)} aria-hidden />
  return (
    <img
      src={url}
      alt=""
      aria-hidden
      className={cn('size-3.5 shrink-0 select-none', className)}
      draggable={false}
    />
  )
}

interface FolderIconProps {
  name: string
  expanded?: boolean
  className?: string
}

export function FolderIcon({ name, expanded, className }: FolderIconProps): React.JSX.Element {
  const url = folderIconUrl(name, !!expanded)
  const Fallback = expanded ? FolderOpen : Folder
  if (!url) return <Fallback className={cn('size-3.5', className)} aria-hidden />
  return (
    <img
      src={url}
      alt=""
      aria-hidden
      className={cn('size-3.5 shrink-0 select-none', className)}
      draggable={false}
    />
  )
}
