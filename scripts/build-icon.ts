// Generates build/icon.png and resources/icon.png as a 1024×1024 macOS Big Sur
// squircle (Apple continuous-corner shape) so the Dock icon matches native
// shape next to VS Code / Codex / etc. The mark from resources/logo.svg is
// rasterized on top, inset inside the 824×824 art area.
//
// Run: bun run scripts/build-icon.ts

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSvgPath } from 'figma-squircle'
import { Resvg } from '@resvg/resvg-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// macOS Big Sur spec: 1024×1024 canvas, 824×824 art area inset by 100 px.
// Corner radius 185 (~22.37%) and smoothing 0.6 match Apple's continuous-corner.
// 1024 canvas with a 50 px inset → 924 art so it visually matches neighbours
// like VS Code / Codex in the Dock. Apple's strict 824 template looks small
// next to third-party icons because most of them push closer to the edge.
const CANVAS = 1024
const INSET = 50
const ART = CANVAS - INSET * 2
const RADIUS = 207
const SMOOTHING = 0.6

const squirclePath = getSvgPath({
  cornerRadius: RADIUS,
  cornerSmoothing: SMOOTHING,
  width: ART,
  height: ART,
  preserveSmoothing: true
})

// Pull the `</>` mark out of the canonical logo. The original is a 768×768
// canvas with the mark group at translate(161, 204) over a 445×354 clip.
// We re-emit it centered inside the 824×824 art area.
const logoSvg = readFileSync(resolve(repoRoot, 'resources/logo.svg'), 'utf8')
const markMatch = logoSvg.match(
  /<g transform="matrix\(1, 0, 0, 1, 161, 204\)">[\s\S]*?<\/g>\s*<\/svg>/
)
if (!markMatch) throw new Error('Could not locate mark group in logo.svg')
const markGroup = markMatch[0].replace(/<\/svg>$/, '')

// Original mark sits in a 768-canvas. Scale to the 824-art-area and re-center.
const scale = ART / 768
const markTranslate = INSET // already (100,100) — group internals carry the (161,204) offset

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <g transform="translate(${INSET}, ${INSET})">
    <path d="${squirclePath}" fill="#000000"/>
  </g>
  <g transform="translate(${markTranslate}, ${markTranslate}) scale(${scale})">
    ${markGroup}
  </g>
</svg>`

const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: CANVAS } })
const png = resvg.render().asPng()

const targets = ['build/icon.png', 'resources/icon.png']
for (const rel of targets) {
  const out = resolve(repoRoot, rel)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, png)
  console.log(`wrote ${rel} (${png.byteLength.toLocaleString()} bytes)`)
}
