/**
 * Stroboscopic picture (manual 26.50, D33): image instants on the fixed grid k·τ before t, at most N of them and
 * none before 0; opacity fading linearly from the newest image; the images are exact recorded states.
 */
import { describe, expect, it } from 'vitest'
import { STROBE_MAX, strobeAlpha, strobeTimes } from '../src/render/strobe'
import { buildTemplate } from '../src/templates'
import { exactStateAt, frameState, simulate } from './reference/core/solver/simulation'

describe('stroboscope', () => {
  const o = { interval: 0.1, count: 10, opacity: 0.6, labels: false }

  it('takes the multiples of τ before t, newest first', () => {
    const ts = strobeTimes(1.25, o)
    expect(ts.length).toBe(10)
    expect(ts[0]).toBeCloseTo(1.2, 12)
    expect(ts[9]).toBeCloseTo(0.3, 12)
    for (let i = 1; i < ts.length; i++) expect(ts[i - 1] - ts[i]).toBeCloseTo(0.1, 12)
  })

  it('does not repeat the current instant and stops at 0', () => {
    expect(strobeTimes(0.3, o).map(x => +x.toFixed(9))).toEqual([0.2, 0.1, 0])
    expect(strobeTimes(0, o)).toEqual([])
  })

  it('follows the playhead when not aligned', () => {
    const ts = strobeTimes(1.25, o, false)
    expect(ts[0]).toBeCloseTo(1.15, 12)
  })

  it('limits the number of images', () => {
    expect(strobeTimes(1000, { ...o, count: 500 }).length).toBe(STROBE_MAX)
  })

  it('fades older images linearly', () => {
    expect(strobeAlpha(1, 10, 0.6)).toBeCloseTo(0.6, 12)
    expect(strobeAlpha(10, 10, 0.6)).toBeCloseTo(0.06, 12)
    expect(strobeAlpha(5, 10, 0.6)).toBeLessThan(strobeAlpha(4, 10, 0.6))
  })

  it('draws exact states (an image on a frame time is that frame)', () => {
    const scene = buildTemplate('projectile')
    const rec = simulate(scene, { duration: 1 })
    const k = Math.round(0.5 / rec.dt)
    expect(Array.from(exactStateAt(rec, k * rec.dt))).toEqual(Array.from(frameState(rec, k)))
  })
})
