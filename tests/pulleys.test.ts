/**
 * Movable pulleys: rope kinematics against numerical differentiation (the carrying body translates and
 * turns), the classic arrangement (rope end fixed, a movable pulley carrying m₂, the free end over fixed
 * pulleys to m₁): a₁ = 2a₂, the tension, energy conservation; and validation.
 */
import { describe, expect, it } from 'vitest'
import { addBody, addConnector, addPulley, anchor, emptyScene } from '../src/core/scene/build'
import type { RopeDef, Scene } from '../src/core/scene/types'
import { compileModel } from '../src/core/solver/model'
import { buildSystem } from '../src/core/solver/dynamics'
import { computePoses, pulleyCenter, ropeKin } from '../src/core/solver/kinematics'
import type { RowJ } from '../src/core/solver/kinematics'
import { frameLedger, frameSolution, frameState, simulate } from '../src/core/solver/simulation'
import { validateScene } from '../src/core/scene/io'

function rowDotArr(j: RowJ, v: number[]): number {
  let s = 0
  const terms = [{ i: j.ai, x: j.ax, y: j.ay, w: j.aw }, { i: j.bi, x: j.bx, y: j.by, w: j.bw }, ...(j.ex ?? [])]
  for (const t of terms) if (t.i >= 0) s += t.x * v[3 * t.i] + t.y * v[3 * t.i + 1] + t.w * v[3 * t.i + 2]
  return s
}

describe('rope over a movable pulley: J and c against numerical differentiation', () => {
  const s = emptyScene('kin')
  addBody(s, { id: 'A', name: 'A', shape: { type: 'box', width: 0.3, height: 0.2 }, position: { x: -0.8, y: 0.2 }, angle: 0.2, mass: 2 })
  addBody(s, { id: 'P', name: 'P', shape: { type: 'box', width: 0.4, height: 0.3 }, position: { x: 0.1, y: -0.6 }, angle: -0.3, mass: 3 })
  addBody(s, { id: 'B', name: 'B', shape: { type: 'circle', radius: 0.1 }, position: { x: 1.2, y: 0.1 }, angle: 0.5, mass: 1 })
  addPulley(s, { id: 'f1', position: { x: -0.4, y: 1.5 }, radius: 0.12 })
  addPulley(s, { id: 'm', position: { x: 0.05, y: 0.25 }, radius: 0.1, body: 'P' })
  addPulley(s, { id: 'm2', position: { x: -0.1, y: 0.2 }, radius: 0.08, body: 'P' })
  addPulley(s, { id: 'f2', position: { x: 0.9, y: 1.4 }, radius: 0.1 })
  s.connectors.push({ id: 'r', name: 'r', type: 'rope', a: anchor(s.bodies[0], { x: 0.1, y: 0.05 }), b: anchor(s.bodies[2], { x: 0.03, y: 0 }), pulleys: [{ pulley: 'f1', wrap: 'cw' }, { pulley: 'm2', wrap: 'ccw' }, { pulley: 'm', wrap: 'ccw' }, { pulley: 'f2', wrap: 'cw' }], length: null })
  const model = compileModel(s)
  const sys = buildSystem(model)
  const n = model.n
  const q0 = [-0.8, 0.2, 0.2, 0.1, -0.6, -0.3, 1.2, 0.1, 0.5]
  const v0 = [0.4, -0.7, 1.3, -0.6, 0.9, -2.1, 0.8, 0.5, 2.7]
  const X = (h: number) => { const x = new Float64Array(sys.size); q0.forEach((a, i) => { x[i] = a + h * v0[i] }); v0.forEach((a, i) => { x[3 * n + i] = a }); return x }
  const poses = (h: number) => computePoses(model, X(h))
  const rope = model.ropes[0]

  it('is a multi-body row: A, P (two wheels merged) and B', () => {
    const k = ropeKin(poses(0), rope)
    expect(rope.movable).toBe(true)
    const bodies = [k.j.ai, k.j.bi, ...(k.j.ex ?? []).map(t => t.i)].filter(i => i >= 0).sort()
    expect(bodies).toEqual([0, 1, 2])
  })

  it('ġ = J·v and g̈ = c (a = 0)', () => {
    const h = 1e-4
    const val = (hh: number) => ropeKin(poses(hh), rope).value
    const k = ropeKin(poses(0), rope)
    const d1 = (val(h) - val(-h)) / (2 * h), d2 = (val(h) - 2 * val(0) + val(-h)) / (h * h)
    const jv = rowDotArr(k.j, v0)
    expect(Math.abs(d1 - jv)).toBeLessThan(1e-7 * Math.max(1, Math.abs(jv)))
    expect(Math.abs(k.vel - jv)).toBeLessThan(1e-12 * Math.max(1, Math.abs(jv)))
    expect(Math.abs(d2 - k.c)).toBeLessThan(2e-5 * Math.max(1, Math.abs(k.c)))
  })

  it('the wheel moves with its body', () => {
    const c = pulleyCenter(poses(0), model.pulleys[1])
    const th = -0.3
    expect(c.x).toBeCloseTo(0.1 + Math.cos(th) * 0.05 - Math.sin(th) * 0.25, 14)
    expect(c.y).toBeCloseTo(-0.6 + Math.sin(th) * 0.05 + Math.cos(th) * 0.25, 14)
  })
})

/** Rope fixed to the ceiling, down around the movable pulley on m₂, up over two fixed pulleys, down to m₁. */
function movablePulleyScene(m1: number, m2: number, g = 9.8): Scene {
  const s = emptyScene('动滑轮')
  s.settings.gravity = { x: 0, y: -g }
  const r = 0.05
  addBody(s, { id: 'm2', name: '物块2', shape: { type: 'box', width: 0.16, height: 0.16 }, position: { x: 0, y: 0.8 }, mass: m2, fixedRotation: true })
  const hang = addBody(s, { id: 'm1', name: '物块1', shape: { type: 'box', width: 0.12, height: 0.12 }, position: { x: 0.6 + r, y: 1.0 }, mass: m1 })
  addPulley(s, { id: 'pm', name: '动滑轮', position: { x: 0, y: 0.14 }, radius: r, body: 'm2' })
  addPulley(s, { id: 'p1', name: '定滑轮1', position: { x: 2 * r, y: 1.8 }, radius: r })
  addPulley(s, { id: 'p2', name: '定滑轮2', position: { x: 0.6, y: 1.8 }, radius: r })
  addConnector<RopeDef>(s, { id: 'rope', name: '轻绳', type: 'rope', a: anchor(null, { x: -r, y: 2.0 }), b: anchor(hang), pulleys: [{ pulley: 'pm', wrap: 'ccw' }, { pulley: 'p1', wrap: 'cw' }, { pulley: 'p2', wrap: 'cw' }], length: null })
  s.settings.duration = 0.8
  return s
}

describe('one movable and two fixed pulleys', () => {
  const m1 = 1, m2 = 1.5, g = 9.8
  const rec = simulate(movablePulleyScene(m1, m2, g))
  const a2 = (2 * m1 - m2) * g / (4 * m1 + m2)
  const T = 3 * m1 * m2 * g / (4 * m1 + m2)

  it('runs without events, the rope stays taut', () => {
    expect(rec.error).toBeNull()
    expect(rec.events.length).toBe(0)
    expect(rec.segments[0].mode.taut).toEqual([true])
  })

  it('a₁ = 2a₂, a₂ = (2m₁ − m₂)g/(4m₁ + m₂), T = 3m₁m₂g/(4m₁ + m₂)', () => {
    const n = rec.system.n
    for (const k of [0, 200, rec.frameCount - 1]) {
      const sol = frameSolution(rec, k)
      const i1 = rec.system.model.byId.get('m1')!.index, i2 = rec.system.model.byId.get('m2')!.index
      const a1 = -sol.acc[3 * i1 + 1], a2sim = sol.acc[3 * i2 + 1]
      expect(Math.abs(a1 - 2 * a2sim) / a1).toBeLessThan(1e-12)
      expect(Math.abs(a2sim - a2) / a2).toBeLessThan(1e-9)
      expect(Math.abs(sol.ropeTension[0] - T) / T).toBeLessThan(1e-9)
      expect(Math.abs(sol.acc[3 * i1])).toBeLessThan(1e-12)
      const X = frameState(rec, k)
      // Velocities keep the same relation
      expect(Math.abs(-X[3 * n + 3 * i1 + 1] - 2 * X[3 * n + 3 * i2 + 1])).toBeLessThan(1e-10)
    }
  })

  it('mechanical energy is conserved (ledger)', () => {
    const L0 = frameLedger(rec, 0)
    let worst = 0, scale = 1
    for (let k = 0; k < rec.frameCount; k++) {
      const L = frameLedger(rec, k)
      worst = Math.max(worst, Math.abs(L.balance - L0.balance))
      scale = Math.max(scale, Math.abs(L.kinetic), Math.abs(L.gravity))
    }
    expect(worst / scale).toBeLessThan(1e-8)
  })

  it('when m₁ < m₂/2 the load goes down, still with a₁ = 2a₂', () => {
    // m₁ < m₂/2: the load goes down instead; still a₁ = 2a₂ in magnitude
    const r2 = simulate(movablePulleyScene(0.5, 1.5, g))
    const sol = frameSolution(r2, 100)
    const i1 = r2.system.model.byId.get('m1')!.index, i2 = r2.system.model.byId.get('m2')!.index
    expect(sol.acc[3 * i2 + 1]).toBeLessThan(0)
    expect(Math.abs(-sol.acc[3 * i1 + 1] - 2 * sol.acc[3 * i2 + 1])).toBeLessThan(1e-12)
  })
})

describe('validation', () => {
  it('a rope end on the body that carries the next wheel is rejected', () => {
    const s = movablePulleyScene(1, 1)
    const rope = s.connectors[0] as RopeDef
    rope.a = anchor(s.bodies[0], { x: 0, y: 0.08 })
    expect(() => validateScene(s)).toThrow(/不能直接绕过同一物体上的动滑轮/)
  })
  it('an unknown carrying body is rejected', () => {
    const s = movablePulleyScene(1, 1)
    s.pulleys[0].body = 'nope'
    expect(() => validateScene(s)).toThrow(/不存在/)
  })
})
