/**
 * 26.64 (D240–D242, D255): the five-panel shell's data and rules — the pages and the redirect of the legacy classroom
 * page, the panels' order, names and shortcuts, the start-page setting, the migration of the 26.63 effect settings to
 * the three material tiers, and the automatic step down of the material when playback is over its frame budget.
 *
 * References are closed forms: the percentile is checked against hand-counted ranks, the frame budget against
 * synthetic frame trains of known rate (tolerances: exact, these are integer-millisecond intervals).
 */
import { beforeEach, describe, expect, it } from 'vitest'

// the store's playback uses the browser's frame timer, the settings a storage (node has neither)
const g = globalThis as Record<string, unknown>
g.cancelAnimationFrame ??= () => {}
g.requestAnimationFrame ??= () => 0
const storage = new Map<string, string>()
g.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) } }

const { state, resolvePage } = await import('../../src/app/store')
const { settings, loadSettings, migrateTier, resetSettings } = await import('../../src/app/settings')
const { PANEL_KEYS, SHORTCUTS, pageOfKey } = await import('../../src/app/shortcuts')
const { panels, pageTitle, initialPage } = await import('../../src/app/panels')
const { FrameBudget, FRAME_LIMIT_MS, TIERS, degradeTier, effectiveTier, lowerTier, material, percentile95, restoreTier, solidReason } = await import('../../src/app/material')
const { locale } = await import('../../src/i18n/locale')

describe('pages (26.64, D240)', () => {
  it('the legacy classroom page shows the library\'s classroom section, at once', () => {
    expect(resolvePage('classroom')).toEqual({ page: 'library', section: 'classroom' })
    for (const p of ['home', 'studio', 'lab', 'chem', 'library', 'monitor', 'settings'] as const) expect(resolvePage(p)).toEqual({ page: p })
    state.page = 'studio'
    state.librarySection = 'templates'
    state.page = 'classroom'
    // synchronous: no watcher, no render ever sees the old id
    expect(state.page).toBe('library')
    expect(state.librarySection).toBe('classroom')
    // going to the library by its own id keeps the section the user was in
    state.librarySection = 'problems'
    state.page = 'studio'
    state.page = 'library'
    expect(state.librarySection).toBe('problems')
    state.page = 'chem'
    expect(state.page).toBe('chem')
    state.page = 'studio'
  })

  it('five panels in rail order, each with one name, one line, an icon and a colour of its own', () => {
    const list = panels()
    expect(list.map(p => p.page)).toEqual(['studio', 'lab', 'chem', 'library', 'monitor'])
    expect(list.map(p => p.digit)).toEqual([1, 2, 3, 4, 5])
    expect(new Set(list.map(p => p.tone)).size).toBe(5)
    expect(new Set(list.map(p => p.icon)).size).toBe(5)
    expect(list.map(p => p.label)).toEqual(['运动', '物理实验', '化学实验', '资源库', '监视'])
    // D243: a label is at most 4 Chinese characters, 14 English, 18 German; a tooltip line at most 14 Chinese characters
    for (const p of list) { expect(p.label.length, p.label).toBeLessThanOrEqual(4); expect(p.line.length, p.line).toBeLessThanOrEqual(14) }
    try {
      locale.lang = 'en'
      expect(panels().map(p => p.label)).toEqual(['Motion', 'Physics', 'Chemistry', 'Library', 'Monitor'])
      for (const p of panels()) expect(p.label.length, p.label).toBeLessThanOrEqual(14)
      locale.lang = 'de'
      expect(panels().map(p => p.label)).toEqual(['Bewegung', 'Physik', 'Chemie', 'Bibliothek', 'Monitor'])
      for (const p of panels()) expect(p.label.length, p.label).toBeLessThanOrEqual(18)
    } finally { locale.lang = 'zh' }
    expect(pageTitle('home').tone).toBeNull()
    expect(pageTitle('chem')).toEqual({ label: '化学实验', icon: 'chemLab', tone: 'chem' })
  })
})

describe('shortcuts (26.64, D240)', () => {
  it('Alt+1…5 open the panels in rail order, Alt+0 the home page; nothing else is a page key', () => {
    expect(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].map(pageOfKey)).toEqual(['studio', 'lab', 'chem', 'library', 'monitor'])
    expect(pageOfKey('Digit0')).toBe('home')
    for (const code of ['Digit6', 'Digit9', 'Numpad1', 'Numpad0', 'KeyA', 'Comma', '']) expect(pageOfKey(code), code).toBeNull()
    expect(PANEL_KEYS.map(p => p.page)).toEqual(panels().map(p => p.page))
  })

  it('the shortcut list shows the same keys, and Ctrl+, for the settings', () => {
    const group = SHORTCUTS.find(gr => gr.items.some(i => i.keys.some(k => k.join('+') === 'Alt+1')))!
    expect(group.items.map(i => i.keys[0].join('+'))).toEqual(['Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5', 'Alt+0', expect.stringMatching(/\+,$/)])
    expect(group.items.slice(0, 5).map(i => i.text)).toEqual(panels().map(p => (p.page === 'monitor' ? '监视' : p.label)))
    // no leftover of the six pages of 26.63
    expect(SHORTCUTS.flatMap(gr => gr.items).some(i => i.keys.some(k => k.join('+') === 'Alt+6'))).toBe(false)
  })
})

describe('start page (26.64, D240)', () => {
  beforeEach(() => { storage.clear(); resetSettings() })

  it('home by default; the setting goes straight to 运动; a direct start always does', () => {
    expect(settings.ui.startPage).toBe('home')
    expect(initialPage('home', false)).toBe('home')
    expect(initialPage('studio', false)).toBe('studio')
    expect(initialPage('home', true)).toBe('studio')
  })

  it('a stored choice is read back; a value that is no start page falls back to home', () => {
    storage.set('velophi.settings.v2', JSON.stringify({ rev: 2665, ui: { startPage: 'studio' } }))
    loadSettings()
    expect(settings.ui.startPage).toBe('studio')
    resetSettings()
    storage.set('velophi.settings.v2', JSON.stringify({ rev: 2663, ui: { startPage: 'classroom' } }))
    loadSettings()
    expect(settings.ui.startPage).toBe('home')
  })
})

describe('material tiers (26.64, D255)', () => {
  beforeEach(() => { storage.clear(); resetSettings(); restoreTier() })

  it('the 26.63 switches become a tier', () => {
    expect(migrateTier({ quality: 'standard', glass: true, ambient: true })).toBe('tinted')
    expect(migrateTier({ quality: 'high', glass: true, ambient: false })).toBe('clear')
    expect(migrateTier({ quality: 'high', glass: false })).toBe('solid')
    expect(migrateTier({ quality: 'off', glass: true })).toBe('tinted')
    expect(migrateTier({ quality: 'standard', glass: false })).toBe('solid')
    // a tier already stored wins; nonsense never throws
    expect(migrateTier({ tier: 'clear', glass: false })).toBe('clear')
    for (const junk of [undefined, null, 3, 'x', [], { tier: 'frosted' }, { glass: 'yes' }]) expect(migrateTier(junk)).toBe('tinted')
  })

  it('settings stored by 26.63 load: the tier is migrated, the removed switches are gone, everything else is kept', () => {
    const old = { rev: 2660, themeMode: 'dark', digits: 6, effects: { quality: 'high', glass: true, ambient: true, motionBlur: false, shutter: 0.25, particles: true, trails: true, trailSeconds: 2, respectReducedMotion: true, reduceTransparency: 'off' }, ui: { startPage: 'studio', railLabels: false } }
    storage.set('velophi.settings.v2', JSON.stringify(old))
    expect(() => loadSettings()).not.toThrow()
    expect(settings.effects.tier).toBe('clear')
    expect(settings.effects.quality).toBe('high')
    expect(settings.effects.motionBlur).toBe(false)
    expect(settings.effects.shutter).toBe(0.25)
    expect(settings.effects.trailSeconds).toBe(2)
    expect(settings.themeMode).toBe('dark')
    expect(settings.digits).toBe(6)
    expect(settings.ui.railLabels).toBe(false)
    expect('glass' in settings.effects).toBe(false)
    expect('ambient' in settings.effects).toBe(false)
    expect(settings.rev).toBe(2665)

    resetSettings()
    storage.set('velophi.settings.v2', JSON.stringify({ rev: 2663, effects: { quality: 'standard', glass: false, ambient: true } }))
    loadSettings()
    expect(settings.effects.tier).toBe('solid')
  })

  it('a tier stored by 26.64 is kept, an unknown one becomes the default', () => {
    storage.set('velophi.settings.v2', JSON.stringify({ rev: 2664, effects: { tier: 'solid', glass: true, quality: 'high' } }))
    loadSettings()
    expect(settings.effects.tier).toBe('solid')
    resetSettings()
    storage.set('velophi.settings.v2', JSON.stringify({ rev: 2664, effects: { tier: 'frosted' } }))
    loadSettings()
    expect(settings.effects.tier).toBe('tinted')
  })

  it('what is in effect: the choice, made solid by projection, reduced transparency and effects off', () => {
    expect(TIERS).toEqual(['clear', 'tinted', 'solid'])
    expect(effectiveTier()).toBe('tinted')
    settings.effects.tier = 'clear'
    settings.effects.reduceTransparency = 'off'
    expect(effectiveTier()).toBe('clear')
    expect(solidReason()).toBeNull()
    settings.projector = true
    expect(effectiveTier()).toBe('solid'); expect(solidReason()).toBe('projector')
    settings.projector = false
    settings.effects.reduceTransparency = 'on'
    expect(effectiveTier()).toBe('solid'); expect(solidReason()).toBe('transparency')
    settings.effects.reduceTransparency = 'off'
    settings.effects.quality = 'off'
    expect(effectiveTier()).toBe('solid'); expect(solidReason()).toBe('effectsOff')
    settings.effects.quality = 'standard'
    expect(effectiveTier(true)).toBe('solid')
    expect(effectiveTier()).toBe('clear')
  })

  it('the automatic step goes down one tier at a time, says so once per step, and never touches the stored choice', () => {
    settings.effects.tier = 'clear'
    settings.effects.reduceTransparency = 'off'
    expect(lowerTier('clear')).toBe('tinted'); expect(lowerTier('tinted')).toBe('solid'); expect(lowerTier('solid')).toBeNull()
    expect(degradeTier(27.5)).toBe('tinted')
    expect(effectiveTier()).toBe('tinted')
    expect(material.notice).toBe('tinted'); expect(material.p95).toBe(27.5)
    material.notice = null
    expect(degradeTier(31)).toBe('solid')
    expect(effectiveTier()).toBe('solid')
    expect(material.notice).toBe('solid')
    expect(degradeTier(40)).toBeNull()
    expect(settings.effects.tier).toBe('clear')
    restoreTier()
    expect(effectiveTier()).toBe('clear'); expect(material.notice).toBeNull()
  })
})

describe('frame budget (26.64, D255: 95th percentile over 2 s above 20 ms)', () => {
  it('the 95th percentile is the nearest rank', () => {
    expect(percentile95([])).toBe(0)
    expect(percentile95([7])).toBe(7)
    // 1 … 100: rank ceil(0.95 · 100) = 95
    expect(percentile95(Array.from({ length: 100 }, (_, i) => 100 - i))).toBe(95)
    // 20 values: rank 19
    expect(percentile95(Array.from({ length: 20 }, (_, i) => i + 1))).toBe(19)
  })

  /** Feed frames of the given intervals; the result of each push. */
  const feed = (b: InstanceType<typeof FrameBudget>, intervals: number[]) => intervals.map(dt => b.push(dt))
  const train = (dt: number, ms: number) => Array.from({ length: Math.ceil(ms / dt) }, () => dt)

  it('60 and 50 frames a second are within budget; 30 are not, after one full window', () => {
    expect(FRAME_LIMIT_MS).toBe(20)
    expect(feed(new FrameBudget(), train(1000 / 60, 6000)).every(r => r === null)).toBe(true)
    // a 50 Hz display delivers exactly 20 ms: not "above 20 ms" (1 ms of timer tolerance)
    expect(feed(new FrameBudget(), train(20, 6000)).every(r => r === null)).toBe(true)
    const slow = feed(new FrameBudget(), train(33, 2100))
    const first = slow.findIndex(r => r !== null)
    // the window closes with the frame that completes 2 s: frame 61 of 33 ms (61 · 33 = 2013 ms), not earlier
    expect(first).toBe(60)
    expect(slow[first]).toBe(33)
  })

  it('a few long frames in a window do not count; more than 5 % do', () => {
    // 120 frames of 16 ms with 5 hiccups of 60 ms (4 %): the 95th percentile is still 16 ms
    const few = train(16, 1920); for (const i of [3, 30, 60, 90, 110]) few[i] = 60
    expect(feed(new FrameBudget(), few).every(r => r === null)).toBe(true)
    // every eighth frame 40 ms (12.5 %): over budget, and the percentile reported is 40 ms
    const many = Array.from({ length: 140 }, (_, i) => (i % 8 === 0 ? 40 : 16))
    const out = feed(new FrameBudget(), many).filter(r => r !== null)
    expect(out.length).toBeGreaterThanOrEqual(1)
    expect(out[0]).toBe(40)
  })

  it('a gap (hidden window) starts a new window instead of counting as a frame', () => {
    const b = new FrameBudget()
    expect(feed(b, train(33, 1500)).every(r => r === null)).toBe(true)
    expect(b.push(5000)).toBeNull()
    // the 1.5 s before the gap are forgotten: another 1.5 s of slow frames is not yet a full window
    expect(feed(b, train(33, 1500)).every(r => r === null)).toBe(true)
    expect(feed(b, train(33, 600)).some(r => r === 33)).toBe(true)
  })

  it('a window of very few, very long frames is over budget by its longest frame', () => {
    const out = feed(new FrameBudget(), [400, 400, 400, 400, 400])
    expect(out[4]).toBe(400)
  })
})
