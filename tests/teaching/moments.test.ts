/** Key moments, readouts, formula cards at moments, still-image helpers, chart ticks. */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../../src/templates'
import { simulate } from '../../src/core/solver/simulation'
import { recognize } from '../../src/formula/situations'
import { cardsForMoment, defaultReadoutIds, keyMoments, momentFileStem, readoutsAt, reducedNotice } from '../../src/export/moments'
import { backgroundPalette, exportCamera } from '../../src/export/still'
import { DARK, LIGHT } from '../../src/render/renderer'
import { dataRange, niceTicks } from '../../src/export/chartImage'
import { presetChoice } from '../../src/units/units'
import { timeLabel, videoFrameCount } from '../../src/export/video'

const rec = simulate(buildTemplate('board-block'))
const sits = recognize(rec)
const stick = rec.events.find(e => e.changes.some(c => c.type === 'stick'))!
// Analytic common-velocity time of the template (M = 2, m = 1, v0 = 4, μ1 = 0.4, μ2 = 0.1, g = 9.8)
const a1 = 0.4 * 9.8, a2 = (0.4 * 1 * 9.8 - 0.1 * 3 * 9.8) / 2, t1 = 4 / (a1 + a2)

describe('key moments', () => {
  it('merges events with stage starts and adds chosen times', () => {
    const ms = keyMoments(rec, { events: true, segments: true, ends: true, user: [0.5, stick.t + 1e-12] })
    expect(ms[0].t).toBe(0)
    expect(ms[ms.length - 1].t).toBeCloseTo((rec.frameCount - 1) * rec.dt, 12)
    const m = ms.find(x => Math.abs(x.t - t1) < 1e-9)!
    expect(m).toBeDefined()
    expect(m.kinds).toContain('event')
    expect(m.kinds).toContain('user')
    expect(m.label).toContain('共速')
    expect(ms.some(x => x.t === 0.5 && x.kinds[0] === 'user')).toBe(true)
    for (let i = 1; i < ms.length; i++) expect(ms[i].t).toBeGreaterThan(ms[i - 1].t)
    expect(momentFileStem(1, m)).toMatch(/^02_t=0\.90/)
    expect(momentFileStem(1, m)).not.toMatch(/[\\/:*?"<>|]/)
  })

  it('reads values in display units', () => {
    const r = readoutsAt(rec, 0, ['block.vx', 'board.vx', 'nope'], presetChoice('lab'), 4)
    expect(r.map(x => x.value)).toEqual(['400 cm/s', '0 cm/s'])
  })

  it('compares the ending stage just before the event', () => {
    const cards = cardsForMoment(sits, stick.t, 8)
    const tc = cards.find(c => c.formula.id === 'bb.t')!
    expect(tc.verdict).toBe('match')
    expect(tc.theory!).toBeCloseTo(t1, 9)
    const a1card = cards.find(c => c.formula.id === 'bb.a1')!
    expect(a1card.verdict).toBe('match')
  })
})

describe('still images and charts', () => {
  it('chooses the palette for the background', () => {
    expect(backgroundPalette(DARK, 'white').bg).toBe('#ffffff')
    expect(backgroundPalette(DARK, 'white').text).toBe(LIGHT.text)
    expect(backgroundPalette(DARK, 'transparent').text).toBe(DARK.text)
    expect(backgroundPalette(DARK, 'transparent').bg).toBe('rgba(0,0,0,0)')
    expect(backgroundPalette(LIGHT, 'theme')).toBe(LIGHT)
  })

  it('keeps the viewport framing at any output size', () => {
    const view = { cx: 1, cy: 2, ppmAtHeight: 100, viewHeight: 600 }
    const a = exportCamera(view, 1280, 720), b = exportCamera(view, 2560, 1440)
    expect(a.cam.ppm).toBeCloseTo(120)
    expect(b.cam).toEqual(a.cam)
    expect(b.scale).toBeCloseTo(2)
    // Visible height in metres equals the viewport's
    expect(a.cam.height / a.cam.ppm).toBeCloseTo(600 / 100)
  })

  it('computes nice ticks and ranges', () => {
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
    expect(niceTicks(-3.2, 7.9, 5)).toEqual([-2.5, 0, 2.5, 5, 7.5])
    expect(dataRange([[1, null, 3], [2, NaN]])).toEqual([1, 3])
    const [lo, hi] = dataRange([[5, 5, 5]])
    expect(lo).toBeLessThan(5)
    expect(hi).toBeGreaterThan(5)
  })

  it('labels video time in the display unit', () => {
    expect(timeLabel(1.25, presetChoice('si'))).toBe('t = 1.250 s')
    expect(videoFrameCount(0, 1, 1, 60)).toBe(61)
    expect(videoFrameCount(0, 1, 0.5, 30)).toBe(61)
  })
})

describe('new change types and display units on cards', () => {
  it('names variable-force switches and keeps them as key moments', () => {
    const s = buildTemplate('variable-force')
    const f = s.connectors.find(c => c.type === 'force')!
    if (f.type === 'force') f.expr = { x: '5*step(t - 1) + 3*abs(t - 2)', y: '0' }
    s.watch = []
    const r = simulate(s)
    const jump = r.events.find(e => e.changes.some(c => c.type === 'switch' && !c.kink))!
    const kink = r.events.find(e => e.changes.some(c => c.type === 'switch' && c.kink))!
    expect(jump.t).toBeCloseTo(1, 9)
    expect(kink.t).toBeCloseTo(2, 9)
    const ms = keyMoments(r, { events: true, segments: false })
    expect(ms.find(m => Math.abs(m.t - 1) < 1e-9)!.label).toBe(`${f.name} 变力切换`)
    expect(ms.find(m => Math.abs(m.t - 2) < 1e-9)!.label).toBe(`${f.name} 变力折点`)
    // Without a watch list the slides read the applied force and its power
    expect(defaultReadoutIds(r)).toEqual(expect.arrayContaining([`${f.id}.F`, `${f.id}.P`]))
    expect(readoutsAt(r, 1.5, [`${f.id}.P`], presetChoice('si'), 4)[0].value).toMatch(/ W$/)
  })

  it('writes the substituted line in display units', () => {
    const cards = cardsForMoment(sits, stick.t, 6, presetChoice('lab'))
    const a1card = cards.find(c => c.formula.id === 'bb.a1')!
    expect(a1card.substituted).toContain('980')
    expect(a1card.substituted).toContain('cm')
    const si = cardsForMoment(sits, stick.t, 6).find(c => c.formula.id === 'bb.a1')!
    expect(si.substituted).not.toContain('cm')
  })

  it('states reduced accuracy only when the fallback was used', () => {
    expect(reducedNotice(rec, presetChoice('si'))).toBeNull()
    expect(reducedNotice({ ...rec, reducedFrom: 0.5 }, presetChoice('si'))).toMatch(/^精度降级：.*0\.5 s/)
    expect(reducedNotice({ ...rec, reducedFrom: 0 }, presetChoice('si'))).toMatch(/全程/)
  })
})
