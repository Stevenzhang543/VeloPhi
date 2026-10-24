/**
 * Friction in impacts (Stronge's energetic restitution with Coulomb friction for single contacts):
 * spinning disc dropped on rough ground (stick and slip regimes against the closed-form result), a ball
 * with backspin that bounces backwards, the impulse path in isolation, and a randomized check that an
 * impact never increases the kinetic energy. μ = 0 reproduces 26.48 bit-identically (golden.test.ts).
 */
import { describe, expect, it } from 'vitest'
import { addBody, addConnector, addGround, anchor, emptyScene } from '../src/core/scene/build'
import type { HingeDef, Scene } from '../src/core/scene/types'
import { simulate } from '../src/core/solver/simulation'
import { compileModel } from '../src/core/solver/model'
import { buildSystem, initialState, kineticEnergy } from '../src/core/solver/dynamics'
import { resolveImpact, strongeImpact } from '../src/core/solver/impact'
import { computePoses, contactKin } from '../src/core/solver/kinematics'
import { touchingFeatures } from '../src/core/solver/modes'

/** Disc (uniform, I = ½mr²) just above rough ground, moving down at u with (vx, ω); no gravity. */
function discDrop(o: { u: number; vx: number; w: number; mu: number; e: number; r?: number; m?: number }): Scene {
  const s = emptyScene('disc')
  s.settings.gravity = { x: 0, y: 0 }
  const r = o.r ?? 0.1
  addGround(s, { id: 'ground', top: 0, left: -5, right: 5, material: { muS: o.mu, muK: o.mu, restitution: 1 } })
  addBody(s, { id: 'disc', name: '圆盘', shape: { type: 'circle', radius: r }, position: { x: 0, y: r + 0.01 }, velocity: { x: o.vx, y: -o.u }, angularVelocity: o.w, mass: o.m ?? 1, material: { muS: o.mu, muK: o.mu, restitution: o.e } })
  s.settings.duration = 0.05
  return s
}

function impactOf(s: Scene) {
  const rec = simulate(s)
  expect(rec.error).toBeNull()
  const ev = rec.events.find(e => e.changes.some(c => c.type === 'impact'))!
  const n = rec.system.n
  return { rec, ev, vx: ev.after[3 * n], vy: ev.after[3 * n + 1], w: ev.after[3 * n + 2], change: ev.changes.find(c => c.type === 'impact')! }
}

describe('spinning disc dropped on rough ground', () => {
  const r = 0.1, m = 1
  it('sticks: the contact point stops slipping, v⁺ = vx − s/3, ω⁺ = ω − 2s/(3r)', () => {
    const u = 3, vx = 1, w = 4, mu = 0.4, e = 0.5
    const slip = vx + w * r
    expect(mu * (1 + e) * u).toBeGreaterThan(slip / 3)
    const { vx: vxa, vy, w: wa, change, rec } = impactOf(discDrop({ u, vx, w, mu, e }))
    expect(Math.abs(vy - e * u)).toBeLessThan(1e-12)
    expect(Math.abs(vxa - (vx - slip / 3))).toBeLessThan(1e-12)
    expect(Math.abs(wa - (w - 2 * slip / (3 * r)))).toBeLessThan(1e-11)
    expect(Math.abs(vxa + wa * r)).toBeLessThan(1e-12)
    expect(change.tangentImpulse).toBeCloseTo(m * slip / 3, 12) // Along t = (−1, 0)
    expect(rec.events[0].impact!.points[0].friction).toBe('stick')
  })
  it('slips throughout: Δvx = −μ(1 + e)u, Δω = −2μ(1 + e)u/r', () => {
    const u = 3, vx = 0, w = -60, mu = 0.4, e = 0.5
    const slip = vx + w * r
    expect(mu * (1 + e) * u).toBeLessThan(Math.abs(slip) / 3)
    const { vx: vxa, vy, w: wa, rec } = impactOf(discDrop({ u, vx, w, mu, e }))
    const P = mu * (1 + e) * m * u
    expect(Math.abs(vy - e * u)).toBeLessThan(1e-12)
    expect(Math.abs(vxa - (vx - Math.sign(slip) * P / m))).toBeLessThan(1e-12)
    expect(Math.abs(wa - (w - Math.sign(slip) * 2 * P / (m * r)))).toBeLessThan(1e-10)
    expect(rec.events[0].impact!.points[0].friction).toBe('slip')
    // Kinetic energy lost = normal part + friction work
    const imp = rec.events[0].impact!
    expect(imp.loss).toBeGreaterThan(0.5 * m * u * u * (1 - e * e))
  })
  it('ball with backspin bounces backwards', () => {
    const u = 2, vx = 0.5, w = 50, mu = 1, e = 0.6
    const slip = vx + w * r
    const { vx: vxa, w: wa } = impactOf(discDrop({ u, vx, w, mu, e }))
    expect(vxa).toBeLessThan(0)
    expect(Math.abs(vxa - (vx - slip / 3))).toBeLessThan(1e-12)
    expect(Math.abs(vxa + wa * r)).toBeLessThan(1e-12)
  })
  it('μ = 0 leaves the tangential motion unchanged and records no friction', () => {
    const { vx, w, change } = impactOf(discDrop({ u: 3, vx: 1, w: 4, mu: 0, e: 0.5 }))
    expect(vx).toBe(1)
    expect(w).toBe(4)
    expect(change.tangentImpulse).toBeUndefined()
  })
})

describe('the impulse path', () => {
  it('Stronge = Newton for the normal part when W is diagonal', () => {
    const r = strongeImpact(-2, 0.5, 1, 0, 3, 0.7, 0.2, 0.2)!
    expect(r.vn).toBeCloseTo(1.4, 14)
    expect(r.Pn).toBeCloseTo(3.4, 14)
  })
  it('reversal: slip stops and restarts the other way when stick is impossible', () => {
    // |Wnt| > μs·Wtt: the contact cannot stick
    const r = strongeImpact(-1, 0.05, 2, -1.2, 1, 0.5, 0.3, 0.3)!
    expect(r.end).toBe('reverse')
    expect(Math.sign(r.vt)).toBe(-1)
  })
  it('energy of the path never increases (random W)', () => {
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let k = 0; k < 2000; k++) {
      const a = 0.1 + rnd() * 3, c = 0.1 + rnd() * 3
      const b = (rnd() * 2 - 1) * Math.sqrt(a * c) * 0.999
      const vn = -(0.01 + rnd() * 5), vt = (rnd() * 2 - 1) * 5
      const e = rnd(), mu = rnd() * 2
      const res = strongeImpact(vn, vt, a, b, c, e, mu, mu)
      expect(res).not.toBeNull()
      // ΔT = v⁻·P + ½PᵀWP  (W⁻¹ is the effective mass)
      const P = [res!.Pn, res!.Pt]
      const dT = vn * P[0] + vt * P[1] + 0.5 * (a * P[0] * P[0] + 2 * b * P[0] * P[1] + c * P[1] * P[1])
      expect(dT).toBeLessThanOrEqual(1e-12 * (vn * vn + vt * vt) / Math.min(a, c))
      expect(res!.vn).toBeGreaterThanOrEqual(-1e-12)
      expect(Math.abs(res!.Pt)).toBeLessThanOrEqual(mu * res!.Pn * (1 + 1e-12) + 1e-15)
    }
  })
})

describe('randomized impacts never increase the kinetic energy', () => {
  it('boxes, polygons and hinged bodies hitting rough ground', () => {
    let seed = 12345
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    let frictional = 0, total = 0
    for (let trial = 0; trial < 600; trial++) {
      const s = emptyScene('rand')
      s.settings.gravity = { x: 0, y: 0 }
      const mu = rnd() * 1.5, e = rnd()
      addGround(s, { id: 'ground', top: 0, left: -10, right: 10, material: { muS: mu * (1 + rnd() * 0.5), muK: mu, restitution: 1 } })
      const kind = trial % 3
      const angle = (rnd() * 2 - 1) * 1.2
      const w = 0.1 + rnd() * 0.5, h = 0.05 + rnd() * 0.4
      const shape = kind === 1
        ? { type: 'polygon' as const, points: [{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 3 }, { x: w / 3, y: h / 2 }, { x: -w / 2, y: h / 3 }] }
        : { type: 'box' as const, width: w, height: h }
      const b = addBody(s, { id: 'b', name: 'b', shape, position: { x: 0, y: 1 }, angle, mass: 0.2 + rnd() * 3, material: { muS: mu * 1.2, muK: mu, restitution: e } })
      if (kind === 2) addConnector<HingeDef>(s, { name: 'h', type: 'hinge', a: anchor(b, { x: w / 2 * (rnd() - 0.5), y: h / 2 }), b: anchor(null, { x: 0, y: 1 + h / 2 }) })
      const model = compileModel(s)
      const sys = buildSystem(model)
      let X = initialState(sys)
      // Lower the body until its lowest vertex touches the ground (hinge: move the hinge point too)
      const poses = computePoses(model, X)
      let low = Infinity
      const P = poses[1]
      const verts = model.dynamic[0].shape.kind === 'polygon' ? model.dynamic[0].shape.verts : []
      for (const v of verts) low = Math.min(low, P.y + P.s * v.x + P.c * v.y)
      X[1] -= low
      const n = sys.n
      X[3 * n] = (rnd() * 2 - 1) * 4; X[3 * n + 1] = -(0.2 + rnd() * 4); X[3 * n + 2] = (rnd() * 2 - 1) * 20
      if (kind === 2) {
        // The hinge sits where the body's anchor is; velocity v = ω × (c − pivot)
        const la = model.hinges[0].a.local, c = Math.cos(angle), sn = Math.sin(angle)
        const pv = { x: X[0] + c * la.x - sn * la.y, y: X[1] + sn * la.x + c * la.y }
        model.hinges[0].b.local.x = pv.x; model.hinges[0].b.local.y = pv.y
        X[3 * n] = -X[3 * n + 2] * (X[1] - pv.y); X[3 * n + 1] = X[3 * n + 2] * (X[0] - pv.x)
      }
      const touches = touchingFeatures(sys, computePoses(model, X))
      if (!touches.some(t => t.kin.vn < -1e-6)) continue
      const before = kineticEnergy(sys, X)
      const imp = resolveImpact(sys, X)
      if (!imp) continue
      total++
      if (imp.points.some(p => p.tangentImpulse !== undefined)) frictional++
      const after = kineticEnergy(sys, imp.X)
      expect(after, `trial ${trial}`).toBeLessThanOrEqual(before * (1 + 1e-12) + 1e-14)
      X = imp.X
      for (const t of touchingFeatures(sys, computePoses(model, X))) {
        const k = contactKin(t.feature, computePoses(model, X))
        expect(k.vn, `trial ${trial} penetration`).toBeGreaterThanOrEqual(-1e-7)
      }
    }
    expect(total).toBeGreaterThan(300)
    expect(frictional).toBeGreaterThan(200)
  })
})

describe('oblique collision of rough discs', () => {
  it('normal components follow Newton, friction spins the discs, momentum and angular momentum are conserved', async () => {
    const { recognize } = await import('../src/formula/situations')
    const { evaluateCard } = await import('../src/formula/match')
    const { FORMULAS } = await import('../src/formula/library')
    const s = emptyScene('discs')
    s.settings.gravity = { x: 0, y: 0 }
    addBody(s, { id: 'A', name: '圆盘A', shape: { type: 'circle', radius: 0.1 }, position: { x: 0, y: 0 }, velocity: { x: 2, y: 0 }, mass: 1, material: { muS: 0.3, muK: 0.3, restitution: 0.8 } })
    addBody(s, { id: 'B', name: '圆盘B', shape: { type: 'circle', radius: 0.1 }, position: { x: 0.6, y: 0.12 }, mass: 1.5, material: { muS: 0.3, muK: 0.3, restitution: 0.8 } })
    s.settings.duration = 0.5
    const rec = simulate(s)
    const ev = rec.events.find(e => e.impact)!
    const n = rec.system.n
    const p = ev.impact!.points[0]
    expect(p.tangentImpulse).toBeDefined()
    expect(Math.abs(p.tangentImpulse!)).toBeGreaterThan(1e-3)
    const mom = (X: Float64Array) => [1 * X[3 * n] + 1.5 * X[3 * n + 3], 1 * X[3 * n + 1] + 1.5 * X[3 * n + 4]]
    const L = (X: Float64Array) => {
      const I = [0.5 * 1 * 0.01, 0.5 * 1.5 * 0.01], m = [1, 1.5]
      let l = 0
      for (let i = 0; i < 2; i++) l += m[i] * (X[3 * i] * X[3 * n + 3 * i + 1] - X[3 * i + 1] * X[3 * n + 3 * i]) + I[i] * X[3 * n + 3 * i + 2]
      return l
    }
    expect(Math.abs(mom(ev.after)[0] - mom(ev.before)[0])).toBeLessThan(1e-12)
    expect(Math.abs(mom(ev.after)[1] - mom(ev.before)[1])).toBeLessThan(1e-12)
    expect(Math.abs(L(ev.after) - L(ev.before))).toBeLessThan(1e-12)
    expect(Math.abs(ev.after[3 * n + 2])).toBeGreaterThan(0.1)
    const sit = recognize(rec).find(x => x.type === 'collision')!
    const sample = sit.sample(sit.tEvent!)
    const verdict = (id: string) => evaluateCard(FORMULAS.find(f => f.id === id)!, sit, sample, { digits: 8 }).verdict
    expect(verdict('col.v1')).toBe('match')
    expect(verdict('col.v2')).toBe('match')
    expect(verdict('col.px')).toBe('match')
    expect(verdict('col.tangent')).toBe('not-applicable')
    expect(verdict('col.dE')).toBe('not-applicable')
  })
})
