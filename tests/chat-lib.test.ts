import { describe, expect, it } from 'bun:test'
import { deriveTitle, genId } from '../src/renderer/src/lib/chat'

describe('deriveTitle', () => {
  it('returns the trimmed prompt when it fits', () => {
    expect(deriveTitle('  hello world  ')).toBe('hello world')
  })

  it('collapses internal whitespace to single spaces', () => {
    expect(deriveTitle('add tray\n\nicon  to    QC')).toBe('add tray icon to QC')
  })

  it('truncates with an ellipsis when over 40 chars', () => {
    const long = 'a'.repeat(80)
    const out = deriveTitle(long)
    expect(out.length).toBe(41) // 40 chars + the ellipsis glyph
    expect(out.endsWith('…')).toBe(true)
  })

  it('leaves 40-char input untouched', () => {
    const exact = 'a'.repeat(40)
    expect(deriveTitle(exact)).toBe(exact)
  })
})

describe('genId', () => {
  it('produces an 8-char base36 id', () => {
    const id = genId()
    expect(id).toMatch(/^[0-9a-z]{1,8}$/)
  })

  it('does not collide across a small batch', () => {
    const ids = new Set(Array.from({ length: 200 }, () => genId()))
    expect(ids.size).toBe(200)
  })
})
