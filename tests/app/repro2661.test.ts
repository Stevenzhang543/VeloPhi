/**
 * 26.61 (A): the reproduction package carries only allowlisted fields — no scene extra, annotations or description,
 * no file name or path, no free log text — and identifies the input by a hash; the scene goes in only on request,
 * with names replaced by ids.
 */
import { describe, expect, it, vi } from 'vitest'
import { buildTemplate } from '../../src/templates'

vi.mock('../../src/app/trialLog', () => ({
  logEvent() {},
  trialLogEntries: () => [
    { t: 1, kind: 'sim.run', detail: { ms: 12, completed: true, frames: 600 } },
    { t: 2, kind: 'copilot.tool', detail: { tool: 'read_quantity', ok: true, prompt: 'secret question text' } },
    { t: 3, kind: 'chat.text', detail: { text: 'private chat' } }
  ]
}))

describe('reproduction package (26.61)', () => {
  it('allowlisted fields only; the scene on request, sanitized', async () => {
    const { state, loadScene } = await import('../../src/app/store')
    const { reproPackage, platformClass, shortHash } = await import('../../src/app/repro')
    state.autoRun = false
    const s = buildTemplate('incline')
    s.extra = { ...(s.extra ?? {}), ai: { route: 'x', summary: 'private problem text' } }
    s.description = 'my class notes'
    loadScene(s, 'C:/Users/someone/Desktop/作业.velophi.json', 'C:/Users/someone/Desktop/作业.velophi.json')
    const pkg = reproPackage()
    const text = JSON.stringify(pkg)
    expect(text).not.toContain('someone')
    expect(text).not.toContain('private')
    expect(text).not.toContain('secret')
    expect(text).not.toContain('my class notes')
    expect(pkg.scene.file).toBeUndefined()
    expect(pkg.scene.hash).toMatch(/^[0-9a-f]{8}$/)
    expect(pkg.log.map(e => e.kind)).toEqual(['sim.run', 'copilot.tool'])
    expect(pkg.log[1].detail).toEqual({ tool: 'read_quantity', ok: true })
    const full = reproPackage({ withScene: true })
    const file = full.scene.file as { extra?: unknown; description?: string; bodies: Array<{ id: string; name: string }> }
    expect(file.extra).toBeUndefined()
    expect(file.description).toBeUndefined()
    for (const b of file.bodies) expect(b.name).toBe(b.id)
    expect(JSON.stringify(full)).not.toContain('private')
    expect(platformClass('Mozilla/5.0 (Linux; Android 12; MuMu) AppleWebKit/537.36 Chrome/120.0 Mobile')).toBe('android/chromium-120')
    expect(platformClass('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('windows/edge')
    expect(shortHash('a')).not.toBe(shortHash('b'))
  })
})
