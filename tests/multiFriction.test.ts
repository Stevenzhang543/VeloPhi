/**
 * Simultaneous frictional impacts at several points (manual 26.51, D37): a block landing flat on rough ground
 * while sliding (two points at once) gives mirror-symmetric results and loses the friction energy, a block
 * dropped into a rough corner, and random multi-point impacts never increase the kinetic energy and never
 * leave a contact approaching.
 */
import { describe, expect, it } from 'vitest'
import { addBody, addGround, emptyScene } from '../src/core/scene/build'
import type { Scene } from '../src/core/scene/types'
import { simulate } from './reference/core/solver/simulation'
import { compileModel } from './reference/core/solver/model'
import { buildSystem, initialState, kineticEnergy } from './reference/core/solver/dynamics'
import { resolveImpact } from './reference/core/solver/impact'
import { computePoses } from './reference/core/solver/kinematics'
import { touchingFeatures } from './reference/core/solver/modes'

/** Static wall whose right face is at x, from `bottom` to `top`. */
function addWall(s: Scene, o: { id: string; x: number; bottom: number; top: number; material: { muS: number; muK: number; restitution: number } }) {
  addBody(s, { id: o.id, name: o.id, kind: 'static', shape: { type: 'box', width: 0.4, height: o.top - o.bottom }, position: { x: o.x - 0.2, y: (o.top + o.bottom) / 2 }, material: o.material })
}

/** Block (w × h) just above rough ground, flat, moving at (vx, −u); no gravity. */
function flatLanding(o: { vx: number; u: number; w?: number; mu: number; e: number; x?: number }): Scene {
  const s = emptyScene('flat')
  s.settings.gravity = { x: 0, y: 0 }
  const w = o.w ?? 0.4, h = 0.2
  addGround(s, { id: 'ground', top: 0, left: -5, right: 5, material: { muS: o.mu, muK: o.mu, restitution: 1 } })
  addBody(s, { id: 'b', name: 'b', shape: { type: 'box', width: w, height: h }, position: { x: o.x ?? 0, y: h / 2 + 0.01 }, velocity: { x: o.vx, y: -o.u }, mass: 2, material: { muS: o.mu, muK: o.mu, restitution: o.e } })
  s.settings.duration = 0.05
  return s
}

function firstImpact(s: Scene) {
  const rec = simulate(s)
  expect(rec.error).toBeNull()
  const ev = rec.events.find(e => e.impact)!
  return { rec, ev, n: rec.system.n }
}

describe('block landing flat on rough ground (two points at once)', () => {
  it('uses friction in the impact and is mirror-symmetric', () => {
    const a = firstImpact(flatLanding({ vx: 3, u: 2, mu: 0.3, e: 0.4 }))
    const b = firstImpact(flatLanding({ vx: -3, u: 2, mu: 0.3, e: 0.4 }))
    expect(a.rec.warnings.some(w => w.key === 'warn.multiImpactFriction')).toBe(false)
    const imp = a.ev.impact!
    expect(imp.points.length).toBe(2)
    expect(imp.points.every(p => p.tangentImpulse !== undefined)).toBe(true)
    const n = a.n
    // Mirror: vx and ω change sign, vy is the same
    expect(Math.abs(a.ev.after[3 * n] + b.ev.after[3 * n])).toBeLessThan(1e-12)
    expect(Math.abs(a.ev.after[3 * n + 1] - b.ev.after[3 * n + 1])).toBeLessThan(1e-12)
    expect(Math.abs(a.ev.after[3 * n + 2] + b.ev.after[3 * n + 2])).toBeLessThan(1e-12)
    // Friction slowed the block and turned it forward (front edge down): it lost more than the normal part
    expect(a.ev.after[3 * n]).toBeLessThan(3)
    expect(imp.loss).toBeGreaterThan(0.5 * 2 * 4 * (1 - 0.16))
    expect(imp.energyAfter).toBeLessThanOrEqual(imp.energyBefore)
  })

  it('with μ = 0 keeps the frictionless impact', () => {
    const { ev, n } = firstImpact(flatLanding({ vx: 3, u: 2, mu: 0, e: 0.4 }))
    expect(ev.after[3 * n]).toBe(3)
    expect(ev.impact!.points.every(p => p.tangentImpulse === undefined)).toBe(true)
  })

  it('sticks when friction is large enough: the contact points stop sliding', () => {
    const { ev, n } = firstImpact(flatLanding({ vx: 0.5, u: 2, mu: 1.5, e: 0 }))
    const vx = ev.after[3 * n], w = ev.after[3 * n + 2]
    // Bottom edge velocity along x: vx + ω·h/2
    expect(Math.abs(vx + w * 0.1)).toBeLessThan(1e-9)
    expect(ev.impact!.points.some(p => p.friction === 'stick')).toBe(true)
  })
})

describe('block dropped into a rough corner', () => {
  it('hits floor and wall at once without gaining energy', () => {
    const s = emptyScene('corner')
    s.settings.gravity = { x: 0, y: 0 }
    addGround(s, { id: 'ground', top: 0, left: -5, right: 5, material: { muS: 0.5, muK: 0.5, restitution: 1 } })
    addWall(s, { id: 'wall', x: -0.3, bottom: -1, top: 2, material: { muS: 0.5, muK: 0.5, restitution: 1 } })
    const h = 0.2
    addBody(s, { id: 'b', name: 'b', shape: { type: 'box', width: 0.4, height: h }, position: { x: -0.3 + 0.2 + 0.01, y: h / 2 + 0.01 }, velocity: { x: -1, y: -1 }, angularVelocity: 0, mass: 1, material: { muS: 0.5, muK: 0.5, restitution: 0.5 } })
    s.settings.duration = 0.05
    const { rec, ev } = firstImpact(s)
    expect(ev.impact!.energyAfter).toBeLessThanOrEqual(ev.impact!.energyBefore)
    expect(rec.warnings.some(w => w.key === 'warn.multiImpactFriction')).toBe(false)
  })
})

describe('random multi-point impacts', () => {
  it('never increase the kinetic energy and leave no contact approaching (10000 impacts)', () => {
    let seed = 2651
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    let total = 0, frictional = 0, warned = 0
    const byKey = new Map<string, number>()
    for (let trial = 0; total < 10000 && trial < 30000; trial++) {
      const s = emptyScene('rand')
      s.settings.gravity = { x: 0, y: 0 }
      const mu = rnd() * 1.5, e = rnd()
      addGround(s, { id: 'ground', top: 0, left: -10, right: 10, material: { muS: mu * (1 + rnd() * 0.5), muK: mu, restitution: 1 } })
      const corner = trial % 2 === 1
      const w = 0.1 + rnd() * 0.5, h = 0.05 + rnd() * 0.4
      if (corner) addWall(s, { id: 'wall', x: -w / 2, bottom: -1, top: 3, material: { muS: mu, muK: mu * (0.5 + 0.5 * rnd()), restitution: 1 } })
      addBody(s, { id: 'b', name: 'b', shape: { type: 'box', width: w, height: h }, position: { x: 0, y: h / 2 }, mass: 0.2 + rnd() * 3, material: { muS: mu * 1.2, muK: mu, restitution: e } })
      const model = compileModel(s)
      const sys = buildSystem(model)
      const X = initialState(sys)
      const n = sys.n
      X[3 * n] = (rnd() * 2 - 1) * 4; X[3 * n + 1] = -(0.05 + rnd() * 4); X[3 * n + 2] = (rnd() * 2 - 1) * 5
      if (corner && rnd() < 0.7) X[3 * n] = -Math.abs(X[3 * n])
      const touches = touchingFeatures(sys, computePoses(model, X))
      if (touches.filter(t => t.kin.vn < -1e-6).length < 2) continue
      const before = kineticEnergy(sys, X)
      const imp = resolveImpact(sys, X)
      if (!imp) continue
      total++
      if (imp.points.some(p => p.tangentImpulse !== undefined)) frictional++
      if (imp.warning) { warned++; byKey.set(imp.warning.key, (byKey.get(imp.warning.key) ?? 0) + 1) }
      const after = kineticEnergy(sys, imp.X)
      expect(after, `trial ${trial}`).toBeLessThanOrEqual(before * (1 + 1e-12) + 1e-14)
      for (const t of touchingFeatures(sys, computePoses(model, imp.X))) expect(t.kin.vn, `trial ${trial} approach`).toBeGreaterThanOrEqual(-1e-6)
    }
    expect(total).toBe(10000)
    expect(frictional).toBeGreaterThan(5000)
    // Newton, then Poisson with friction cover nearly all; the rest are plastic (warned) or frictionless (warned)
    expect(warned).toBeLessThan(total / 25)
    expect(byKey.get('warn.multiImpactFriction') ?? 0).toBeLessThan(total / 100)
  }, 120000)
})
