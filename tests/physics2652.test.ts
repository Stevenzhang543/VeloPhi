/**
 * Physics of 26.52 (decisions D58–D61): slider end stops, torque-limited motors, rolling resistance, central fields and
 * the Gauss–Legendre integrator, against closed-form solutions, with the energy ledger balanced and every chunk
 * rebuilt bit for bit from its checkpoint.
 */
import { describe, expect, it } from 'vitest'
import { addBody, addConnector, addGround, anchor, emptyScene } from '../src/core/scene/build'
import type { CentralDef, HingeDef, MotorDef, Scene, SliderDef } from '../src/core/scene/types'
import type { Recording } from './reference/core/solver/simulation'
import { SimulationRun, frameLedger, frameSolution, frameState, rebuildChunk, simulate } from './reference/core/solver/simulation'
import { parseScene, serializeScene } from '../src/core/scene/io'
import { decodeCheckpoint, encodeCheckpoint } from './reference/core/solver/checkpoint'

/** Largest drift of the ledger balance relative to the largest energy term. */
function ledgerDrift(rec: Recording): number {
  const L0 = frameLedger(rec, 0)
  let worst = 0, scale = 1e-12
  for (let k = 0; k < rec.frameCount; k++) {
    const L = frameLedger(rec, k)
    worst = Math.max(worst, Math.abs(L.balance - L0.balance))
    scale = Math.max(scale, Math.abs(L.kinetic), Math.abs(L.gravity), Math.abs(L.spring), Math.abs(L.field), Math.abs(L.frictionHeat), Math.abs(L.appliedWork), Math.abs(L.beltWork), Math.abs(L.damping), Math.abs(L.impactLoss))
  }
  return worst / scale
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b))

function base(name: string, duration: number): Scene {
  const s = emptyScene(name)
  s.settings.gravity = { x: 0, y: -9.8 }
  s.settings.duration = duration
  return s
}

/** Every chunk of a run rebuilt from its checkpoint gives the same frames (and the checkpoints round-trip). */
function checkRebuild(s: Scene) {
  const run = new SimulationRun(s, { duration: s.settings.duration, chunkSeconds: 0.5 })
  run.advance(Infinity)
  const rec = run.result()
  expect(run.checkpoints.length).toBeGreaterThan(1)
  for (let c = 0; c < run.checkpoints.length; c++) {
    const cp = run.checkpoints[c]!
    expect(Array.from(encodeCheckpoint(decodeCheckpoint(cp)))).toEqual(Array.from(cp))
    const end = Math.min((c + 1) * run.chunkFrames, rec.frameCount - 1)
    const again = rebuildChunk(s, rec.system, cp, { duration: s.settings.duration, chunkSeconds: 0.5 }, end)
    const orig = run.frames.chunks[c]!
    expect(again.chunk.states.subarray(0, orig.count * rec.size)).toEqual(orig.states.subarray(0, orig.count * rec.size))
  }
}

describe('slider end stops (D58)', () => {
  function railScene(e: number, v0: number) {
    const s = base('rail', 3)
    s.settings.gravity = { x: 0, y: 0 }
    const cart = addBody(s, { id: 'cart', name: '滑块', kind: 'rigid', shape: { type: 'box', width: 0.2, height: 0.1 }, position: { x: 0, y: 0 }, mass: 2, velocity: { x: v0, y: 0 } })
    addConnector<SliderDef>(s, { name: '滑轨', type: 'slider', a: anchor(null, { x: 0, y: 0 }), b: anchor(cart), axis: { x: 1, y: 0 }, limits: { min: -0.5, max: 0.5, restitution: e } })
    return s
  }

  it('bounces off the stops with v′ = −e·v and books the loss', () => {
    const e = 0.6, v0 = 1
    const rec = simulate(railScene(e, v0))
    const hits = rec.events.flatMap(ev => ev.changes.filter(c => c.type === 'limit'))
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(rec.events.find(ev => ev.changes.some(c => c.type === 'limit'))!.t).toBeCloseTo(0.5 / v0, 9)
    expect(rel(hits[0].vnAfter!, -e * hits[0].vnBefore!)).toBeLessThan(1e-9)
    expect(ledgerDrift(rec)).toBeLessThan(1e-9)
    // The cart never leaves [−0.5, 0.5]
    for (let k = 0; k < rec.frameCount; k++) expect(Math.abs(frameState(rec, k)[0])).toBeLessThanOrEqual(0.5 + 1e-9)
  })

  it('a vertical rail: the block falls onto the lower stop and rests on it with F = mg', () => {
    const s = base('drop', 1.5)
    const m = 1.5
    const blk = addBody(s, { id: 'blk', name: '块', shape: { type: 'box', width: 0.1, height: 0.1 }, position: { x: 0, y: 1 }, mass: m })
    addConnector<SliderDef>(s, { name: '竖直滑轨', type: 'slider', a: anchor(null, { x: 0, y: 0 }), b: anchor(blk), axis: { x: 0, y: 1 }, limits: { min: 0.2, max: null, restitution: 0 } })
    const rec = simulate(s)
    const last = rec.frameCount - 1
    expect(frameState(rec, last)[1]).toBeCloseTo(0.2, 9)
    const sol = frameSolution(rec, last)
    expect(rel(sol.limitForce[0], m * 9.8)).toBeLessThan(1e-9)
    expect(rec.segments[rec.segments.length - 1].label).toContain('lim:-')
    checkRebuild(railScene(0.8, 1.3))
  })

  it('round-trips through the scene file', () => {
    const back = parseScene(serializeScene(railScene(0.5, 1))).scene
    const sl = back.connectors.find(c => c.type === 'slider') as SliderDef
    expect(sl.limits).toEqual({ min: -0.5, max: 0.5, restitution: 0.5 })
  })
})

describe('torque-limited motor (D58)', () => {
  function motorScene(maxTorque: number, duration = 3) {
    const s = base('motor', duration)
    s.settings.gravity = { x: 0, y: 0 }
    const disc = addBody(s, { id: 'disc', name: '圆盘', shape: { type: 'circle', radius: 0.5 }, position: { x: 0, y: 0 }, mass: 4 })
    addConnector<MotorDef>(s, { name: '马达', type: 'motor', a: anchor(null, { x: 0, y: 0 }), b: anchor(disc), mode: 'speed', speed: 10, torque: 0, maxTorque })
    return s
  }

  it('spins up with τmax/I, then locks at the set speed', () => {
    const tau = 2, I = 0.5 * 4 * 0.25
    const rec = simulate(motorScene(tau))
    const lock = rec.events.find(ev => ev.changes.some(c => c.type === 'motorLock'))
    expect(lock).toBeTruthy()
    expect(rel(lock!.t, 10 * I / tau)).toBeLessThan(1e-9)
    const n = rec.system.n
    expect(frameState(rec, rec.frameCount - 1)[3 * n + 2]).toBeCloseTo(10, 9)
    expect(ledgerDrift(rec)).toBeLessThan(1e-9)
    checkRebuild(motorScene(tau, 2))
  })

  it('an unlimited motor still jumps to its speed at the start (26.51 behaviour)', () => {
    const s = motorScene(1)
    ;(s.connectors[0] as MotorDef).maxTorque = null
    const rec = simulate(s)
    expect(frameState(rec, 1)[3 * rec.system.n + 2]).toBeCloseTo(10, 9)
  })

  it('slips under a load beyond τmax and locks again when it is removed', () => {
    // A pendulum arm driven at 1 rad/s by a weak motor: going up it slips, coming down it can hold the speed again
    const s = base('arm', 4)
    const arm = addBody(s, { id: 'arm', name: '杆', shape: { type: 'box', width: 1, height: 0.05 }, position: { x: 0.5, y: 0 }, mass: 1 })
    addConnector<MotorDef>(s, { name: '马达', type: 'motor', a: anchor(null, { x: 0, y: 0 }), b: anchor(arm, { x: -0.5, y: 0 }), mode: 'speed', speed: 1, torque: 0, maxTorque: 3 })
    const rec = simulate(s)
    const kinds = rec.events.flatMap(ev => ev.changes.map(c => c.type))
    expect(kinds).toContain('motorSlip')
    expect(kinds).toContain('motorLock')
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })
})

describe('rolling resistance (D59)', () => {
  function rollScene(crr: number, v0: number, duration = 4) {
    const s = base('roll', duration)
    addGround(s, { id: 'g', top: 0, material: { muS: 0.6, muK: 0.5, restitution: 0, rolling: crr } })
    const R = 0.2
    addBody(s, { id: 'disc', name: '圆盘', shape: { type: 'circle', radius: R }, position: { x: 0, y: R }, mass: 1, velocity: { x: v0, y: 0 }, angularVelocity: -v0 / R, material: { muS: 0.6, muK: 0.5, restitution: 0 } })
    return s
  }

  it('a rolling disc decelerates at (2/3)·C_rr·g and stops', () => {
    const crr = 0.05, v0 = 1
    const rec = simulate(rollScene(crr, v0))
    const a = 2 / 3 * crr * 9.8
    const stop = rec.events.find(ev => ev.changes.some(c => c.type === 'rollStop'))
    expect(stop).toBeTruthy()
    expect(rel(stop!.t, v0 / a)).toBeLessThan(1e-8)
    const n = rec.system.n
    expect(Math.abs(frameState(rec, rec.frameCount - 1)[3 * n])).toBeLessThan(1e-9)
    // The kinetic energy went into heat
    const L = frameLedger(rec, rec.frameCount - 1)
    expect(rel(L.frictionHeat, 0.5 * 1 * v0 * v0 * 1.5)).toBeLessThan(1e-8)
    expect(ledgerDrift(rec)).toBeLessThan(1e-9)
    checkRebuild(rollScene(crr, v0, 3.5))
  })

  it('without rolling resistance the disc rolls on forever (26.51 behaviour)', () => {
    const rec = simulate(rollScene(0, 1, 1))
    const n = rec.system.n
    expect(frameState(rec, rec.frameCount - 1)[3 * n]).toBeCloseTo(1, 12)
    expect(rec.segments[0].label).not.toContain('/r')
  })

  it('a disc on a gentle slope (tanθ ≤ C_rr) is held by rolling resistance', () => {
    // On a slope θ with rolling resistance C_rr the disc stays at rest when sinθ·m g R ≤ C_rr·N·R (static couple), i.e. tanθ ≤ C_rr
    const s = base('slope', 1)
    const th = Math.atan(0.01)
    addBody(s, { id: 'g', name: '斜面', kind: 'static', shape: { type: 'box', width: 10, height: 0.4 }, position: { x: 0, y: -0.2 }, angle: th, material: { muS: 0.6, muK: 0.5, restitution: 0, rolling: 0.02 } })
    const R = 0.2
    addBody(s, { id: 'disc', name: '圆盘', shape: { type: 'circle', radius: R }, position: { x: -Math.sin(th) * R, y: Math.cos(th) * R }, mass: 1, material: { muS: 0.6, muK: 0.5, restitution: 0 } })
    const rec = simulate(s)
    const n = rec.system.n
    const X = frameState(rec, rec.frameCount - 1)
    expect(Math.hypot(X[3 * n], X[3 * n + 1])).toBeLessThan(1e-9)
    expect(rec.segments[0].label).toContain('/rest')
  })
})

describe('central fields (D60)', () => {
  it('elastic centre (n = 1): period 2π√(m/k), energy (with the field potential) conserved', () => {
    const s = base('spring-field', 3)
    s.settings.gravity = { x: 0, y: 0 }
    const m = 0.5, k = 8
    addBody(s, { id: 'p', name: '质点', kind: 'particle', shape: { type: 'circle', radius: 0.01 }, position: { x: 1, y: 0 }, mass: m })
    addConnector<CentralDef>(s, { name: '中心', type: 'central', a: anchor(null, { x: 0, y: 0 }), k, n: 1, targets: null })
    const rec = simulate(s)
    const T = 2 * Math.PI * Math.sqrt(m / k)
    const kk = Math.round(T / rec.dt)
    // x(t) = cos ωt
    const t = kk * rec.dt
    expect(frameState(rec, kk)[0]).toBeCloseTo(Math.cos(Math.sqrt(k / m) * t), 7)
    expect(frameLedger(rec, 0).field).toBeCloseTo(0.5 * k, 12)
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })

  it('inverse square (n = −2): a circular orbit keeps its radius', () => {
    const s = base('kepler', 6)
    s.settings.gravity = { x: 0, y: 0 }
    const k = 20, r = 2, m = 1
    addBody(s, { id: 'p', name: '行星', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: r, y: 0 }, mass: m, velocity: { x: 0, y: Math.sqrt(k / (m * r)) } })
    addConnector<CentralDef>(s, { name: '中心', type: 'central', a: anchor(null, { x: 0, y: 0 }), k, n: -2, targets: ['p'] })
    const rec = simulate(s)
    for (let i = 0; i < rec.frameCount; i += 50) {
      const X = frameState(rec, i)
      expect(Math.hypot(X[0], X[1])).toBeCloseTo(r, 7)
    }
    // Potential −k/r
    expect(frameLedger(rec, 0).field).toBeCloseTo(-k / r, 12)
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })

  it('a centre on a dynamic body: momentum of the pair is conserved', () => {
    const s = base('pair', 2)
    s.settings.gravity = { x: 0, y: 0 }
    const a = addBody(s, { id: 'a', name: 'A', shape: { type: 'circle', radius: 0.1 }, position: { x: 0, y: 0 }, mass: 3 })
    addBody(s, { id: 'b', name: 'B', shape: { type: 'circle', radius: 0.1 }, position: { x: 1, y: 0 }, mass: 1, velocity: { x: 0, y: 1 } })
    addConnector<CentralDef>(s, { name: '中心', type: 'central', a: anchor(a), k: 5, n: 1, targets: ['b'] })
    const rec = simulate(s)
    const n = rec.system.n
    const X = frameState(rec, rec.frameCount - 1)
    expect(3 * X[3 * n] + X[3 * n + 3]).toBeCloseTo(0, 10)
    expect(3 * X[3 * n + 1] + X[3 * n + 4]).toBeCloseTo(1, 10)
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })
})

describe('Gauss–Legendre integrator (D61)', () => {
  it('fourth order, energy of a pendulum bounded over a long run', () => {
    const s = base('pend', 40)
    s.settings.integrator = 'gauss4'
    s.settings.outputStep = 1 / 30
    const bob = addBody(s, { id: 'bob', name: '摆球', shape: { type: 'circle', radius: 0.05 }, position: { x: 1, y: 0 }, mass: 1, kind: 'particle' })
    addConnector<HingeDef>(s, { name: '铰链', type: 'hinge', a: anchor(null, { x: 0, y: 0 }), b: anchor(bob, { x: -1, y: 0 }) })
    const rec = simulate(s)
    const E0 = frameLedger(rec, 0).mechanical
    let worst = 0
    for (let k = 0; k < rec.frameCount; k++) worst = Math.max(worst, Math.abs(frameLedger(rec, k).mechanical - E0))
    expect(worst / 9.8).toBeLessThan(1e-5)
  })

  it('round-trips the integrator setting', () => {
    const s = base('g', 1)
    s.settings.integrator = 'gauss4'
    expect(parseScene(serializeScene(s)).scene.settings.integrator).toBe('gauss4')
  })
})
