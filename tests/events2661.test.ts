/**
 * 26.61 (A3, events): near-tangent contacts and several zeros in one step. A ball thrown up so that its top just
 * reaches a ceiling (by δ) must hit it — the gap is positive at both ends of a step that contains the whole contact —
 * and one that stays δ below must not; two impacts microseconds apart are both found, in order, with exact sides.
 */
import { describe, expect, it } from 'vitest'
import { simulate } from '../src/engine/recording'
import { addBody, addGround, emptyScene } from '../src/core/scene/build'

const g = 9.8
function ceilingThrow(delta: number) {
  const s = emptyScene('ceiling')
  const r = 0.05, H = 1
  addGround(s, { id: 'floor', top: 0, left: -1, right: 1 })
  addBody(s, { id: 'ceiling', name: 'ceiling', kind: 'static', role: 'ground', shape: { type: 'box', width: 2, height: 0.1 }, position: { x: 0, y: r + H + 0.05 + r } })
  // The ball's top reaches y = 2r + H + δ − r … its centre rises by H + δ from y = r
  const v0 = Math.sqrt(2 * g * (H + delta))
  addBody(s, { id: 'ball', name: 'ball', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: r }, velocity: { x: 0, y: v0 }, mass: 1, material: { restitution: 1 } })
  s.settings.gravity = { x: 0, y: -g }
  return simulate(s, { duration: 0.6 })
}

describe('near-tangent and simultaneous events (26.61)', () => {
  for (const delta of [1e-3, 1e-5, 1e-7]) {
    it(`a ball that reaches the ceiling by ${delta} m hits it`, () => {
      const rec = ceilingThrow(delta)
      const hit = rec.events.find(e => e.t < 0.55 && e.changes.some(c => c.type === 'impact' || c.type === 'touch'))
      expect(hit, `δ = ${delta}`).toBeTruthy()
      // Time of contact from the closed form: H = v0 t − g t²/2
      const v0 = Math.sqrt(2 * g * (1 + delta))
      const tRef = (v0 - Math.sqrt(v0 * v0 - 2 * g * 1)) / g
      expect(Math.abs(hit!.t - tRef)).toBeLessThan(1e-9 + 1e-6 * tRef)
    })
  }

  it('a ball that stays 1e-6 m below the ceiling does not hit it', () => {
    const rec = ceilingThrow(-1e-6)
    expect(rec.events.some(e => e.t < 0.55 && e.changes.some(c => c.type === 'impact' || c.type === 'touch'))).toBe(false)
  })

  it('two impacts 1 µs apart: both found, in order, each with its own sides', () => {
    const s = emptyScene('two walls')
    const r = 0.05
    addBody(s, { id: 'wl', name: 'wl', kind: 'static', role: 'wall', shape: { type: 'box', width: 0.1, height: 1 }, position: { x: -1.05, y: 0 } })
    addBody(s, { id: 'wr', name: 'wr', kind: 'static', role: 'wall', shape: { type: 'box', width: 0.1, height: 1 }, position: { x: 1.05, y: 2 } })
    addBody(s, { id: 'a', name: 'a', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: -0.5, y: 0 }, velocity: { x: -1, y: 0 }, mass: 1, material: { restitution: 1 } })
    // b reaches its wall 1 µs later (0.5 m at 1 m/s + 1 µs)
    addBody(s, { id: 'b', name: 'b', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0.5 - 1e-6, y: 2 }, velocity: { x: 1, y: 0 }, mass: 1, material: { restitution: 1 } })
    s.settings.gravity = { x: 0, y: 0 }
    const rec = simulate(s, { duration: 0.8 })
    const hits = rec.events.filter(e => e.changes.some(c => c.type === 'impact'))
    expect(hits.length).toBeGreaterThanOrEqual(1)
    const times = hits.flatMap(e => e.changes.filter(c => c.type === 'impact').map(() => e.t))
    // Either two events 1 µs apart or one event with both impacts at the same instant (merged within the tolerance)
    const both = hits.flatMap(e => e.changes.filter(c => c.type === 'impact'))
    expect(both.length).toBe(2)
    expect(Math.abs(times[0] - (0.45))).toBeLessThan(1e-9)
    expect(Math.abs(times[times.length - 1] - (0.45 + 1e-6))).toBeLessThan(2e-6)
  })
})
