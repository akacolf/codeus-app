import { describe, expect, it } from 'bun:test'
import { getSettings } from '../src/renderer/src/lib/settings'

describe('settings module', () => {
  it('returns defaults when there is no DOM (typeof window === undefined)', () => {
    // Under bun:test there's no DOM, so the module-level cache is initialized
    // from DEFAULTS. This smoke-tests that the bundle is loadable outside the
    // renderer and that defaults stay coherent.
    const s = getSettings()
    expect(s.theme).toBe('dark')
    expect(s.model).toBe('sonnet-4.6')
    expect(s.workMode).toBe('coding')
    expect(s.composerSubmitMode).toBe('enter')
  })

  it('exposes the new editor + terminal + system defaults', () => {
    const s = getSettings()
    expect(s.editorTabSize).toBe(2)
    expect(s.editorLineNumbers).toBe('on')
    expect(s.editorWordWrap).toBe(false)
    expect(s.terminalScrollback).toBe(5000)
    expect(s.terminalCursorStyle).toBe('block')
    expect(s.terminalCursorBlink).toBe(true)
    expect(s.terminalBell).toBe('none')
    expect(s.launchAtLogin).toBe(false)
    expect(s.startMinimized).toBe(false)
    expect(s.closeToTray).toBe(false)
    expect(s.showTrayIcon).toBe(true)
  })
})
