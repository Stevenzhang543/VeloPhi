/**
 * The analytic Jacobians and velocity-product terms of kinematics.ts against numerical differentiation:
 *   ġ = J·v           (central difference of g along q + v·h)
 *   g̈ = J·a + c       with a = 0: c = d²g/dt² along q(t) = q₀ + v·t
 *   v̇t = Jt·a + ct    with a = 0: ct = d vt/dt along the same path
 */
import { describe, expect, it } from 'vitest'
import { emptyScene, addBody, addPulley, anchor } from '../src/core/scene/build'
import { compileModel } from './reference/core/solver/model'
import { buildSystem } from './reference/core/solver/dynamics'
import { computePoses, contactKin, distanceKin, hingeKin, pairFeatures, ropeKin } from './reference/core/solver/kinematics'
import type { RowJ } from './reference/core/solver/kinematics'

function rowDot(j: RowJ, v: number[]): number {
  let s = 0
  if (j.ai >= 0) s += j.ax * v[3 * j.ai] + j.ay * v[3 * j.ai + 1] + j.aw * v[3 * j.ai + 2]
  if (j.bi >= 0) s += j.bx * v[3 * j.bi] + j.by * v[3 * j.bi + 1] + j.bw * v[3 * j.bi + 2]
  return s
}

function scene() {
  const s = emptyScene('kin')
  addBody(s, { id: 'P', name: 'P', shape: { type: 'polygon', points: [{ x: -0.3, y: -0.2 }, { x: 0.4, y: -0.25 }, { x: 0.35, y: 0.3 }, { x: -0.25, y: 0.2 }] }, position: { x: 0.1, y: 0.2 }, angle: 0.3, mass: 2 })
  addBody(s, { id: 'Q', name: 'Q', shape: { type: 'box', width: 1.2, height: 0.4 }, position: { x: 0.3, y: -0.4 }, angle: -0.2, mass: 3 })
  addBody(s, { id: 'C', name: 'C', shape: { type: 'circle', radius: 0.25 }, position: { x: -0.6, y: 0.1 }, angle: 0.5, mass: 1 })
  addPulley(s, { id: 'pl', position: { x: 1.5, y: 1.5 }, radius: 0.2 })
  addPulley(s, { id: 'pl2', position: { x: -1.5, y: 1.4 }, radius: 0.15 })
  s.connectors.push({ id: 'r', name: 'r', type: 'rope', a: anchor(s.bodies[0], { x: 0.1, y: 0.1 }), b: anchor(s.bodies[2], { x: 0.05, y: 0 }), pulleys: [{ pulley: 'pl', wrap: 'cw' }, { pulley: 'pl2', wrap: 'ccw' }], length: null })
  s.connectors.push({ id: 'h', name: 'h', type: 'hinge', a: anchor(s.bodies[0], { x: 0.2, y: -0.1 }), b: anchor(s.bodies[1], { x: -0.1, y: 0.3 }) })
  return s
}

const q0 = [0.1, 0.2, 0.3, 0.3, -0.4, -0.2, -0.6, 0.1, 0.5]
const v0 = [0.7, -0.3, 1.9, -0.5, 0.8, -2.3, 1.1, 0.4, 3.1]

describe('kinematics vs numerical differentiation', () => {
  const model = compileModel(scene())
  const sys = buildSystem(model)
  const n = model.n
  const X = (q: number[], v: number[]) => { const x = new Float64Array(sys.size); q.forEach((a, i) => { x[i] = a }); v.forEach((a, i) => { x[3 * n + i] = a }); return x }
  const along = (h: number) => q0.map((a, i) => a + h * v0[i])
  const poses = (h: number) => computePoses(model, X(along(h), v0))
  const h = 1e-4

  function check(name: string, value: (h: number) => number, j: RowJ, c: number, vel?: number) {
    const d1 = (value(h) - value(-h)) / (2 * h)
    const d2 = (value(h) - 2 * value(0) + value(-h)) / (h * h)
    const jv = rowDot(j, v0)
    expect(Math.abs(d1 - jv), `${name} J·v`).toBeLessThan(1e-7 * Math.max(1, Math.abs(jv)))
    if (vel !== undefined) expect(Math.abs(vel - jv), `${name} vel`).toBeLessThan(1e-12 * Math.max(1, Math.abs(jv)))
    expect(Math.abs(d2 - c), `${name} c`).toBeLessThan(2e-5 * Math.max(1, Math.abs(c)))
  }

  it('contact features (point–face, point–point, circles)', () => {
    let count = 0
    for (const [a, b] of [['P', 'Q'], ['C', 'Q'], ['C', 'P']]) {
      const feats = pairFeatures(model.byId.get(a)!, model.byId.get(b)!)
      for (const f of feats) {
        const k = contactKin(f, poses(0))
        check(`${f.key} gap`, hh => contactKin(f, poses(hh)).gap, k.jn, k.cn, k.vn)
        // Tangential velocity: d vt/dt = ct when a = 0
        const dvt = (contactKin(f, poses(h)).vt - contactKin(f, poses(-h)).vt) / (2 * h)
        expect(Math.abs(dvt - k.ct), `${f.key} ct`).toBeLessThan(1e-6 * Math.max(1, Math.abs(k.ct)))
        // vt = Jt·v (+ belt)
        expect(Math.abs(rowDot(k.jt, v0) - k.vt), `${f.key} Jt`).toBeLessThan(1e-12)
        count++
      }
    }
    expect(count).toBeGreaterThan(20)
  })

  it('rope through two pulleys, distance and hinge rows', () => {
    const rope = model.ropes[0]
    const k = ropeKin(poses(0), rope)
    check('rope', hh => ropeKin(poses(hh), rope).value, k.j, k.c, k.vel)
    const d = distanceKin(poses(0), rope.a, rope.b)
    check('distance', hh => distanceKin(poses(hh), rope.a, rope.b).value, d.j, d.c, d.vel)
    const hg = model.hinges[0]
    const [hx, hy] = hingeKin(poses(0), hg.a, hg.b)
    check('hinge x', hh => hingeKin(poses(hh), hg.a, hg.b)[0].value, hx.j, hx.c, hx.vel)
    check('hinge y', hh => hingeKin(poses(hh), hg.a, hg.b)[1].value, hy.j, hy.c, hy.vel)
  })
})
