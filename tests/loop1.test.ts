/**
 * Closed loop 1 — mechanics (26.56, blueprint §8 loop 1; models G01 G06 M03 M07 M08 F02): the rigid-body simulation of
 * the Rust core against the model registry (also the Rust core, a different code path: closed forms evaluated by the
 * formula language) and against closed forms written out here. Every comparison uses the scaled error of the
 * blueprint with unrounded SI values.
 *
 * - free fall: the impact event time and the speeds on both sides of it; event location converges with the
 *   tolerance of the integrator and does not depend on the recording interval;
 * - incline: the three branches (slide down, slide up, stick) and the re-stick after sliding up;
 * - static threshold: both sides of μs·N, the switch to kinetic friction;
 * - floating block: the equilibrium of the simulation against the F02 prediction (float or sink), the thickness
 *   perpendicular to the page scales volume and force, and a unit thickness is a different body.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import { simulate } from '../src/engine/recording'
import type { Recording } from '../src/engine/recording'
import { quantitySeries } from '../src/engine/observe'
import { evalModel } from '../src/engine/models'
import type { Scene } from '../src/core/scene/types'

const err = (q: number, ref: number, scale = 0) => Math.abs(q - ref) / Math.max(Math.abs(ref), scale)
const out = (model: string, inputs: Record<string, number>, id: string) => {
  const r = evalModel(model, inputs)
  const o = r.outputs.find(x => x.id === id && (x.state === 'applicable' || x.state === 'approximate'))
  if (!o || o.value === null) throw new Error(`${model}.${id} not applicable`)
  return o.value
}
const cond = (model: string, inputs: Record<string, number>) => Object.fromEntries(evalModel(model, inputs).conditions.map(c => [c.id, c.state]))
/** Value of quantity `id` at the last recorded frame (or at frame `k`). */
function at(rec: Recording, id: string, k = rec.frameCount - 1): number {
  return quantitySeries(rec, [id], k, k, 1).values[0][0]
}
function series(rec: Recording, id: string): { t: Float64Array; v: Float64Array } {
  const s = quantitySeries(rec, [id], 0, rec.frameCount - 1, 1)
  return { t: s.t, v: s.values[0] }
}

describe('loop 1: free fall event time and both sides', () => {
  const g = 9.8, h = 5
  it('the impact time and the speed before it agree with M03 and the closed form; after it with e', () => {
    const rec = simulate(buildTemplate('free-fall', { h, g }))
    const ev = rec.events[0] as unknown as { t: number; changes: Array<{ vnBefore: number; vnAfter: number }> }
    const tRef = Math.sqrt(2 * h / g)
    expect(err(ev.t, tRef)).toBeLessThan(1e-9)
    expect(err(ev.t, out('M03', { h, g, e: 0 }, 't'))).toBeLessThan(1e-9)
    expect(err(-ev.changes[0].vnBefore, out('M03', { h, g, e: 0 }, 'vBefore'))).toBeLessThan(1e-9)
    expect(Math.abs(ev.changes[0].vnAfter)).toBeLessThan(1e-12)
    expect(out('M03', { h, g, e: 0 }, 'vAfter')).toBe(0)
  })
  it('with e = 0.8 the speed after the event is e times the speed before (both sides of one event)', () => {
    const scene = buildTemplate('free-fall', { h, g })
    for (const b of scene.bodies) b.material.restitution = 0.8
    const rec = simulate(scene)
    const ev = rec.events[0] as unknown as { t: number; changes: Array<{ vnBefore: number; vnAfter: number }> }
    expect(err(ev.changes[0].vnAfter, out('M03', { h, g, e: 0.8 }, 'vAfter'))).toBeLessThan(1e-9)
    expect(err(-ev.changes[0].vnBefore, out('M03', { h, g, e: 0.8 }, 'vBefore'))).toBeLessThan(1e-9)
  })
  it('step convergence: the event time converges with the tolerance and is independent of the recording interval', () => {
    const tRef = Math.sqrt(2 * h / g)
    const times: number[] = []
    for (const tol of [1e-6, 1e-8, 1e-10]) {
      const s = buildTemplate('free-fall', { h, g })
      s.settings.relTol = tol
      s.settings.absTol = tol * 1e-3
      times.push((simulate(s).events[0] as unknown as { t: number }).t)
    }
    for (const t of times) expect(err(t, tRef)).toBeLessThan(1e-6)
    expect(err(times[2], tRef)).toBeLessThanOrEqual(err(times[0], tRef) + 1e-15)
    const coarse = buildTemplate('free-fall', { h, g })
    coarse.settings.outputStep = 0.01
    expect(err((simulate(coarse).events[0] as unknown as { t: number }).t, tRef)).toBeLessThan(1e-9)
  })
})

describe('loop 1: incline three branches', () => {
  const g = 9.8, m = 2
  const run = (theta: number, muS: number, muK: number, v0along: number, dur = 1) => {
    const s = buildTemplate('incline', { theta, m, mu: muK, g })
    for (const b of s.bodies) b.material = { ...b.material, muS, muK }
    const th = (theta * Math.PI) / 180
    const block = s.bodies.find(b => b.id === 'block')!
    // down the incline: the direction of gravity's component along it (the incline rises to the left or right)
    const down = downSlope(s, th)
    block.velocity = { x: down.x * v0along, y: down.y * v0along }
    s.settings.duration = dur
    return { rec: simulate(s), down }
  }
  function downSlope(s: Scene, th: number) {
    // a release from rest on a steep frictionless copy shows the direction
    const c = buildTemplate('incline', { theta: (th * 180) / Math.PI, m, mu: 0, g })
    c.settings.duration = 0.2
    const r = simulate(c)
    const vx = at(r, 'block.vx'), vy = at(r, 'block.vy')
    const n = Math.hypot(vx, vy)
    void s
    return { x: vx / n, y: vy / n }
  }
  const along = (rec: Recording, d: { x: number; y: number }, k?: number) => at(rec, 'block.ax', k) * d.x + at(rec, 'block.ay', k) * d.y

  it('slides down from rest (tan θ > μs): a = g(sin θ − μk cos θ), N and f as M07', () => {
    const { rec, down } = run(30, 0.25, 0.2, 0)
    const ins = { m, theta: (30 * Math.PI) / 180, muS: 0.25, muK: 0.2, g, v0: 0 }
    expect(cond('M07', ins).slideDown).toBe('applicable')
    expect(err(along(rec, down), out('M07', ins, 'a'))).toBeLessThan(1e-9)
    expect(err(at(rec, 'contact.block|incline.N'), out('M07', ins, 'N'))).toBeLessThan(1e-9)
    expect(err(at(rec, 'contact.block|incline.f'), out('M07', ins, 'f'))).toBeLessThan(1e-9)
    expect(err(along(rec, down), g * (Math.sin(Math.PI / 6) - 0.2 * Math.cos(Math.PI / 6)))).toBeLessThan(1e-9)
  })
  it('slides up (v0 up the incline): a = g(sin θ + μk cos θ) against the motion until it stops', () => {
    const { rec, down } = run(30, 0.25, 0.2, -1, 0.1)
    const ins = { m, theta: (30 * Math.PI) / 180, muS: 0.25, muK: 0.2, g, v0: -1 }
    expect(cond('M07', ins).slideUp).toBe('applicable')
    expect(err(along(rec, down, 5), out('M07', ins, 'a'))).toBeLessThan(1e-9)
  })
  it('sticks when tan θ ≤ μs, with static friction m g sin θ; after sliding up it stops and re-sticks', () => {
    const { rec } = run(10, 0.3, 0.25, 0, 0.5)
    const ins = { m, theta: (10 * Math.PI) / 180, muS: 0.3, muK: 0.25, g, v0: 0 }
    expect(cond('M07', ins).stick).toBe('applicable')
    expect(Math.hypot(at(rec, 'block.vx'), at(rec, 'block.vy'))).toBeLessThan(1e-9)
    expect(err(at(rec, 'contact.block|incline.f'), out('M07', ins, 'f'))).toBeLessThan(1e-9)
    // thrown up the 10° incline at 1 m/s (stays on the incline): decelerates with g(sin θ + μk cos θ), stops at
    // t* = v0/a, then stays
    const r2 = run(10, 0.3, 0.25, -1, 1.5)
    const a = g * (Math.sin((10 * Math.PI) / 180) + 0.25 * Math.cos((10 * Math.PI) / 180))
    const tStop = 1 / a
    const v = series(r2.rec, 'block.v')
    const k = v.t.findIndex(t => t > tStop + 0.05)
    expect(k).toBeGreaterThan(0)
    for (let j = k; j < v.v.length; j++) expect(v.v[j]).toBeLessThan(1e-9)
    // just before the stop it still moves with the predicted speed
    const j0 = v.t.findIndex(t => t > tStop - 0.1)
    expect(err(v.v[j0], 1 - a * v.t[j0], 1e-3)).toBeLessThan(1e-7)
  })
})

describe('loop 1: static threshold both sides and re-stick', () => {
  const g = 9.8, m = 2, mu = 0.4
  const pull = (F: number, muK = 0.3) => {
    const s = buildTemplate('pull-force', { F, alpha: 0, m, mu, g })
    for (const b of s.bodies) b.material = { ...b.material, muS: mu, muK }
    s.settings.duration = 0.5
    return simulate(s)
  }
  it('below μs m g the block stays and f = F; above it slides with a = (F − μk m g)/m', () => {
    const fmax = mu * m * g
    const below = pull(fmax * 0.99)
    expect(Math.abs(at(below, 'block.vx'))).toBeLessThan(1e-12)
    expect(err(at(below, 'contact.block|ground.f'), out('M08', { m, muS: mu, muK: 0.3, g, F: fmax * 0.99, v0: 0 }, 'f'))).toBeLessThan(1e-9)
    const above = pull(fmax * 1.01)
    const ins = { m, muS: mu, muK: 0.3, g, F: fmax * 1.01, v0: 0 }
    expect(cond('M08', ins).sliding).toBe('applicable')
    expect(err(at(above, 'block.ax'), out('M08', ins, 'a'))).toBeLessThan(1e-9)
    expect(err(at(above, 'block.ax'), (fmax * 1.01 - 0.3 * m * g) / m)).toBeLessThan(1e-9)
  })
})

describe('loop 1: floating block: thickness modes and the float/sink prediction against the simulation', () => {
  const g = 9.8
  const settle = (ov: Record<string, number>) => {
    const s = buildTemplate('floating-block', { g, ...ov })
    s.settings.duration = 8
    return { s, rec: simulate(s) }
  }
  const box = (s: Scene) => { const b = s.bodies.find(x => x.id === 'block')!; const sh = b.shape as { width: number; height: number }; return sh.width * sh.height }
  it('a block lighter than the liquid floats at rest with Vsub and Fb of F02', () => {
    const { s, rec } = settle({ rhoB: 600, rho: 1000, d: 0.1, c: 10 })
    const As = box(s)
    const ins = { As, d: 0.1, rhoB: 600, rhoF: 1000, g }
    expect(cond('F02', ins).floats).toBe('applicable')
    expect(err(at(rec, 'block.Vsub'), out('F02', ins, 'Vsub'))).toBeLessThan(1e-6)
    expect(err(at(rec, 'block.Fb'), out('F02', ins, 'Fb'))).toBeLessThan(1e-6)
  })
  it('the thickness scales volume and force; a unit thickness is a different body', () => {
    const a = settle({ rhoB: 600, rho: 1000, d: 0.1, c: 10 })
    const b = settle({ rhoB: 600, rho: 1000, d: 0.2, c: 20 })
    expect(err(at(b.rec, 'block.Vsub'), 2 * at(a.rec, 'block.Vsub'))).toBeLessThan(1e-6)
    expect(err(at(b.rec, 'block.Fb'), 2 * at(a.rec, 'block.Fb'))).toBeLessThan(1e-6)
    // the submerged section does not depend on the thickness
    expect(err(at(b.rec, 'block.Asub'), at(a.rec, 'block.Asub'))).toBeLessThan(1e-6)
    expect(err(out('F02', { As: box(a.s), d: 1, rhoB: 600, rhoF: 1000, g }, 'Fb'), 10 * at(a.rec, 'block.Fb'))).toBeLessThan(1e-6)
  })
  it('a block denser than the liquid sinks: F02 predicts it and the floor carries the rest of the weight', () => {
    const { s, rec } = settle({ rhoB: 1500, rho: 1000, d: 0.1, c: 10 })
    const ins = { As: box(s), d: 0.1, rhoB: 1500, rhoF: 1000, g }
    expect(cond('F02', ins).sinks).toBe('applicable')
    expect(err(at(rec, 'contact.block|floor.N'), out('F02', ins, 'Fn'))).toBeLessThan(1e-6)
    expect(err(at(rec, 'block.Fb'), out('F02', ins, 'Fb'))).toBeLessThan(1e-6)
  })
})
