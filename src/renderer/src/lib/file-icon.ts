// File-icon resolution backed by material-icon-theme (MIT). The package ships
// ~900 SVG icons plus a manifest mapping extensions and filenames to icon
// names. We let Vite eagerly resolve every SVG to a URL at build time, then
// look up the right URL via the runtime manifest.
//
// Cost: ~1 MB of `new URL(…)` strings in the renderer bundle. Acceptable for
// the IDE polish this buys us; if it ever shows up in a Lighthouse pass we can
// switch to lazy glob with `import: 'default', eager: false`.

import { generateManifest } from 'material-icon-theme'

const ICONS = import.meta.glob('../../../../node_modules/material-icon-theme/icons/*.svg', {
  query: '?url',
  import: 'default',
  eager: true
}) as Record<string, string>

const URL_BY_NAME = new Map<string, string>()
for (const [path, url] of Object.entries(ICONS)) {
  const file = path.split('/').pop() ?? ''
  const name = file.replace(/\.svg$/, '')
  URL_BY_NAME.set(name, url)
}

const manifest = generateManifest()
const DEFAULT_FILE_ICON = manifest.iconDefinitions?.[manifest.file ?? 'file']?.iconPath
const DEFAULT_FOLDER_ICON = manifest.iconDefinitions?.[manifest.folder ?? 'folder']?.iconPath
const DEFAULT_FOLDER_OPEN_ICON =
  manifest.iconDefinitions?.[manifest.folderExpanded ?? 'folder-open']?.iconPath

function nameFromIconPath(p: string | undefined): string | null {
  if (!p) return null
  const file = p.split('/').pop() ?? ''
  return file.replace(/\.svg$/, '')
}

function urlForName(name: string | null): string | null {
  if (!name) return null
  return URL_BY_NAME.get(name) ?? null
}

function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return idx === -1 ? path : path.slice(idx + 1)
}

function lowerExt(path: string): string {
  const base = basename(path)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

// Resolve the icon URL for a file path. Falls back to material-icon-theme's
// generic "file" icon, or null if even that is missing.
export function fileIconUrl(path: string): string | null {
  const base = basename(path).toLowerCase()
  const ext = lowerExt(path)

  const nameByFile = manifest.fileNames?.[base]
  if (nameByFile) {
    const u = urlForName(nameByFile)
    if (u) return u
  }
  const nameByExt = manifest.fileExtensions?.[ext]
  if (nameByExt) {
    const u = urlForName(nameByExt)
    if (u) return u
  }
  return urlForName(nameFromIconPath(DEFAULT_FILE_ICON))
}

// Folder icons: pick the open variant when `expanded` is true; fall back to
// the generic folder if no specific match exists for the folder name.
export function folderIconUrl(name: string, expanded: boolean): string | null {
  const lookup = expanded ? manifest.folderNamesExpanded : manifest.folderNames
  const matched = lookup?.[name.toLowerCase()]
  if (matched) {
    const u = urlForName(matched)
    if (u) return u
  }
  return urlForName(nameFromIconPath(expanded ? DEFAULT_FOLDER_OPEN_ICON : DEFAULT_FOLDER_ICON))
}
