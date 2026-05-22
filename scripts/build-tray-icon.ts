// Generates the macOS menu-bar / Windows-tray icon set from the canonical mark
// in resources/logo.svg. Three artifacts land in resources/:
//
//   trayIconTemplate.png      16×16   — macOS template (black-on-transparent;
//                                       Electron flips to white in dark menu bars
//                                       when setTemplateImage(true) is set)
//   trayIconTemplate@2x.png   32×32   — retina template
//   trayIcon.png              32×32   — white-on-transparent for Win/Linux trays,
//                                       which typically render on dark chrome and
//                                       don't honor the template convention
//
// Run: bun run scripts/build-tray-icon.ts

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// Pull just the `</>` glyph group out of resources/logo.svg. The original lives
// inside a translate(161, 204) wrapper on a 768×768 canvas.
const logoSvg = readFileSync(resolve(repoRoot, 'resources/logo.svg'), 'utf8')
const markMatch = logoSvg.match(
  /<g transform="matrix\(1, 0, 0, 1, 161, 204\)">[\s\S]*?<\/g>\s*<\/svg>/
)
if (!markMatch) throw new Error('Could not locate mark group in logo.svg')
const markGroup = markMatch[0].replace(/<\/svg>$/, '')

// The mark sits in roughly an x∈[3, 412], y∈[39, 261] band inside the 768
// canvas (after the (161, 204) translate). Crop tight around that so the glyph
// fills the tray icon — 16px is not very many pixels to spare.
function buildSvg(fill: 'black' | 'white'): string {
  // Recolor the lifted group by replacing the explicit `fill="#ffffff"` in the
  // mark with the requested fill. This keeps the glyph geometry identical and
  // avoids re-embedding the path data.
  const recolored = markGroup.replace(
    /fill="#ffffff"/g,
    `fill="${fill === 'black' ? '#000000' : '#ffffff'}"`
  )
  // Visual bounding box in the original 768 canvas: the (161, 204) translate
  // plus the internal mark extents [~3, ~39] → [~417, ~270]. Cropping to that
  // (with a 12px breathing inset) lets the glyph occupy ~70% of the tray slot,
  // matching what other dev-tool menu bar icons look like at a glance.
  const cropX = 161 + 3 - 12
  const cropY = 204 + 39 - 12
  const cropW = 417 - 3 + 24
  const cropH = 270 - 39 + 24
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cropX} ${cropY} ${cropW} ${cropH}">
  ${recolored}
</svg>`
}

function rasterize(svg: string, size: number): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  return resvg.render().asPng()
}

const blackSvg = buildSvg('black')
const whiteSvg = buildSvg('white')

const outputs: Array<{ rel: string; bytes: Buffer }> = [
  { rel: 'resources/trayIconTemplate.png', bytes: rasterize(blackSvg, 16) },
  { rel: 'resources/trayIconTemplate@2x.png', bytes: rasterize(blackSvg, 32) },
  { rel: 'resources/trayIcon.png', bytes: rasterize(whiteSvg, 32) }
]

for (const { rel, bytes } of outputs) {
  const out = resolve(repoRoot, rel)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, bytes)
  console.log(`wrote ${rel} (${bytes.byteLength.toLocaleString()} bytes)`)
}
