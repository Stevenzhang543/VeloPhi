/**
 * Visual effects are stateless: the particles drawn at a time depend only on the recording and that time, not
 * on which times were drawn before (scrubbing backwards and video export show the same particles), and never
 * exceed the per-frame limit.
 */
import { describe, expect, it } from 'vitest'
import { addBody, addGround, emptyScene } from '../../src/core/scene/build'
import { simulate } from '../../src/core/solver/simulation'
import { MAX_PARTICLES, drawParticles, hash2, particleEmitterCount } from '../../src/render/effects'
import { LIGHT } from '../../src/render/renderer'
import type { Camera } from '../../src/render/renderer'

/** A 2D context stand-in that records every call and property write. */
function recorder(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = []
  const target: Record<string, unknown> = {}
  const ctx = new Proxy(target, {
    get: (_, k) => (typeof k === 'string' ? (...args: unknown[]) => { log.push(`${k}(${args.map(a => (typeof a === 'number' ? a.toFixed(9) : String(a))).join(',')})`) } : undefined),
    set: (_, k, v) => { log.push(`${String(k)}=${typeof v === 'number' ? v.toFixed(9) : String(v)}`); return true }
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log }
}

function scene() {
  const s = emptyScene('particles')
  addGround(s, { top: 0, left: -2, right: 8, material: { restitution: 0.7, muS: 0.3, muK: 0.3 } })
  addBody(s, { name: 'ball', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.1 }, position: { x: 0, y: 1 }, velocity: { x: 2, y: 0 }, mass: 1, material: { restitution: 0.7, muS: 0.3, muK: 0.3 } })
  addBody(s, { name: 'block', shape: { type: 'box', width: 0.3, height: 0.2 }, position: { x: 3, y: 0.1 }, velocity: { x: 3, y: 0 }, mass: 1, material: { restitution: 0, muS: 0.3, muK: 0.3 } })
  s.settings.duration = 1.5
  s.settings.outputStep = 1 / 200
  return s
}

describe('particles', () => {
  const rec = simulate(scene())
  const cam: Camera = { cx: 2, cy: 0.5, ppm: 100, width: 800, height: 400 }
  const at = (t: number) => { const r = recorder(); const n = drawParticles(r.ctx, cam, rec, t, LIGHT); return { n, log: r.log.join(';') } }

  it('come from the recording (impacts and sliding contacts)', () => {
    expect(rec.events.some(e => e.changes.some(c => c.type === 'impact'))).toBe(true)
    expect(particleEmitterCount(rec)).toBeGreaterThan(5)
  })

  it('are the same at a time whatever was drawn before', () => {
    const impact = rec.events.find(e => e.changes.some(c => c.type === 'impact'))!.t
    const times = [impact + 0.01, impact + 0.1, 0.3, 0.7, 1.2]
    const forward = times.map(at)
    // Backwards, with other times in between
    const backward = times.slice().reverse().map(t => { at(t + 0.033); at(0.05); return at(t) }).reverse()
    expect(backward.map(x => x.log)).toEqual(forward.map(x => x.log))
    expect(forward.some(x => x.n > 0)).toBe(true)
    for (const x of forward) expect(x.n).toBeLessThanOrEqual(MAX_PARTICLES)
  })

  it('use a deterministic integer hash', () => {
    expect(hash2(3, 7)).toBe(hash2(3, 7))
    expect(hash2(3, 7)).not.toBe(hash2(7, 3))
    expect(hash2(1, 2)).toBeGreaterThanOrEqual(0)
    expect(hash2(1, 2)).toBeLessThan(2 ** 32)
  })
})
