/**
 * Physics of 26.51 (decisions D50, D51): drag, gravitation, welds, sliders, motors, gears, dampers and cubic
 * springs, against closed-form solutions, with the energy ledger balanced throughout.
 */
import { describe, expect, it } from 'vitest'
import { addBody, addConnector, addGround, anchor, emptyScene } from '../src/core/scene/build'
import type { DamperDef, GearDef, HingeDef, MotorDef, Scene, SliderDef, SpringDef, WeldDef } from '../src/core/scene/types'
import type { Recording } from '../src/core/solver/simulation'
import { frameLedger, frameState, simulate } from '../src/core/solver/simulation'
import { parseScene, serializeScene } from '../src/core/scene/io'

/** Largest drift of the ledger balance relative to the largest energy term. */
function ledgerDrift(rec: Recording): number {
  const L0 = frameLedger(rec, 0)
  let worst = 0, scale = 1e-12
  for (let k = 0; k < rec.frameCount; k++) {
    const L = frameLedger(rec, k)
    worst = Math.max(worst, Math.abs(L.balance - L0.balance))
    scale = Math.max(scale, Math.abs(L.kinetic), Math.abs(L.gravity), Math.abs(L.spring), Math.abs(L.frictionHeat), Math.abs(L.appliedWork), Math.abs(L.beltWork), Math.abs(L.damping))
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

describe('drag (D50)', () => {
  it('linear drag: v(t) = v_t(1 − e^{−bt/m}) for a fall from rest, ledger balanced', () => {
    const s = base('drag', 3)
    const m = 0.5, b = 0.8
    addBody(s, { id: 'ball', name: '球', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: 0, y: 0 }, mass: m, drag: { linear: b, quadratic: 0 } })
    const rec = simulate(s)
    const n = rec.system.n
    const vt = m * 9.8 / b
    let worst = 0
    for (let k = 0; k < rec.frameCount; k += 60) {
      const t = k * rec.dt
      const vy = frameState(rec, k)[3 * n + 1]
      worst = Math.max(worst, Math.abs(vy - -vt * (1 - Math.exp(-b * t / m))) / vt)
    }
    expect(worst).toBeLessThan(1e-8)
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
    expect(frameLedger(rec, rec.frameCount - 1).damping).toBeGreaterThan(1)
  })

  it('quadratic drag approaches the terminal speed √(mg/c)', () => {
    const s = base('drag2', 8)
    const m = 0.2, c = 0.05
    addBody(s, { id: 'ball', name: '球', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: 0, y: 0 }, mass: m, drag: { linear: 0, quadratic: c } })
    const rec = simulate(s)
    const n = rec.system.n
    const vy = frameState(rec, rec.frameCount - 1)[3 * n + 1]
    const vt = Math.sqrt(m * 9.8 / c)
    // v(t) = v_t tanh(g t / v_t)
    expect(rel(-vy, vt * Math.tanh(9.8 * 8 / vt))).toBeLessThan(1e-8)
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })

  it('round-trips through the scene file', () => {
    const s = base('d', 1)
    addBody(s, { id: 'b', name: 'b', shape: { type: 'circle', radius: 0.1 }, position: { x: 0, y: 1 }, mass: 1, drag: { linear: 0.1, quadratic: 0.2 } })
    const back = parseScene(serializeScene(s)).scene
    expect(back.bodies[0].drag).toEqual({ linear: 0.1, quadratic: 0.2 })
  })
})

describe('gravitation (D50)', () => {
  it('a circular orbit about a static planet: period 2π√(r³/GM), energy conserved', () => {
    const s = base('orbit', 10)
    s.settings.gravity = { x: 0, y: 0 }
    s.settings.gravitation = { G: 1 }
    const M = 100, r = 4
    addBody(s, { id: 'sun', name: '恒星', kind: 'static', shape: { type: 'circle', radius: 0.5 }, position: { x: 0, y: 0 }, mass: M })
    const v = Math.sqrt(M / r)
    addBody(s, { id: 'p', name: '行星', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: r, y: 0 }, velocity: { x: 0, y: v }, mass: 0.01 })
    const T = 2 * Math.PI * Math.sqrt(r ** 3 / M)
    s.settings.duration = T
    const rec = simulate(s)
    const X = frameState(rec, rec.frameCount - 1)
    const tEnd = (rec.frameCount - 1) * rec.dt
    const ang = 2 * Math.PI * tEnd / T
    expect(Math.hypot(X[0] - r * Math.cos(ang), X[1] - r * Math.sin(ang)) / r).toBeLessThan(1e-7)
    for (let k = 0; k < rec.frameCount; k += 300) { const Y = frameState(rec, k); expect(Math.abs(Math.hypot(Y[0], Y[1]) - r) / r).toBeLessThan(1e-8) }
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
    // Gravitational potential energy −GMm/r is in the ledger
    expect(rel(frameLedger(rec, 0).gravity, -M * 0.01 / r)).toBeLessThan(1e-12)
  })

  it('two moving bodies conserve momentum about their centre of mass', () => {
    const s = base('binary', 3)
    s.settings.gravity = { x: 0, y: 0 }
    s.settings.gravitation = { G: 2 }
    addBody(s, { id: 'a', name: 'A', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: -1, y: 0 }, velocity: { x: 0, y: -0.5 }, mass: 2 })
    addBody(s, { id: 'b', name: 'B', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: 1, y: 0 }, velocity: { x: 0, y: 1 }, mass: 1 })
    const rec = simulate(s)
    const n = rec.system.n
    for (let k = 0; k < rec.frameCount; k += 100) {
      const X = frameState(rec, k)
      expect(Math.abs(2 * X[3 * n] + 1 * X[3 * n + 3])).toBeLessThan(1e-12)
      expect(Math.abs(2 * X[3 * n + 1] + 1 * X[3 * n + 4])).toBeLessThan(1e-12)
    }
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })
})

describe('connectors of 26.51 (D51)', () => {
  it('a weld keeps two bodies together as one rigid body', () => {
    const s = base('weld', 2)
    const a = addBody(s, { id: 'a', name: 'A', shape: { type: 'box', width: 0.4, height: 0.1 }, position: { x: 0, y: 2 }, angularVelocity: 1, mass: 1 })
    const b = addBody(s, { id: 'b', name: 'B', shape: { type: 'box', width: 0.1, height: 0.4 }, position: { x: 0.25, y: 2 }, angle: 0.3, mass: 0.5 })
    addConnector<WeldDef>(s, { name: 'w', type: 'weld', a: anchor(a, { x: 0.2, y: 0 }), b: anchor(b, { x: -0.05 * Math.cos(-0.3) + 0, y: 0 }) })
    const rec = simulate(s)
    const n = rec.system.n
    const X0 = frameState(rec, 0)
    const d0 = X0[5] - X0[2]
    let worst = 0
    for (let k = 0; k < rec.frameCount; k += 50) {
      const X = frameState(rec, k)
      worst = Math.max(worst, Math.abs(X[5] - X[2] - d0))
      // Both turn at the same rate
      expect(Math.abs(X[3 * n + 2] - X[3 * n + 5])).toBeLessThan(1e-9)
    }
    expect(worst).toBeLessThan(1e-9)
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })

  it('a slider on a 30° rail: a = g sin 30° along the rail, nothing across it', () => {
    const s = base('slider', 1.5)
    const th = Math.PI / 6
    const blk = addBody(s, { id: 'blk', name: '滑块', shape: { type: 'box', width: 0.2, height: 0.1 }, position: { x: 0, y: 1 }, angle: -th, mass: 1 })
    addConnector<SliderDef>(s, { name: 'rail', type: 'slider', a: anchor(null, { x: 0, y: 1 }), b: anchor(blk), axis: { x: Math.cos(th), y: -Math.sin(th) } })
    const rec = simulate(s)
    const n = rec.system.n
    const a = 9.8 * Math.sin(th)
    for (let k = 0; k < rec.frameCount; k += 60) {
      const t = k * rec.dt
      const X = frameState(rec, k)
      const along = X[0] * Math.cos(th) - (X[1] - 1) * Math.sin(th)
      const across = X[0] * Math.sin(th) + (X[1] - 1) * Math.cos(th)
      expect(Math.abs(along - a * t * t / 2)).toBeLessThan(1e-9)
      expect(Math.abs(across)).toBeLessThan(1e-9)
      expect(Math.abs(X[2] + th)).toBeLessThan(1e-12)
      expect(Math.abs(X[3 * n + 2])).toBeLessThan(1e-9)
    }
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })

  it('a speed motor turns a wheel at constant ω; its work is in the ledger', () => {
    const s = base('motor', 2)
    addGround(s, { top: 0, left: -5, right: 20, material: { muS: 0.8, muK: 0.6, restitution: 0 } })
    const w = addBody(s, { id: 'w', name: '轮', shape: { type: 'circle', radius: 0.2 }, position: { x: 0, y: 0.2 }, mass: 1, material: { muS: 0.8, muK: 0.6, restitution: 0 } })
    // Air resistance on the frame: rolling at a constant speed, the motor's work goes into damping
    const frame = addBody(s, { id: 'f', name: '车架', shape: { type: 'box', width: 0.6, height: 0.1 }, position: { x: 0, y: 0.2 }, mass: 0.5, fixedRotation: true, drag: { linear: 0.5, quadratic: 0 } })
    addConnector<MotorDef>(s, { name: 'm', type: 'motor', a: anchor(frame), b: anchor(w), mode: 'speed', speed: -3, torque: 0 })
    const rec = simulate(s)
    const n = rec.system.n
    for (let k = 10; k < rec.frameCount; k += 60) {
      const X = frameState(rec, k)
      const ww = X[3 * n + 3 * 0 + 2], wf = X[3 * n + 3 * 1 + 2]
      expect(Math.abs(ww - wf - -3)).toBeLessThan(1e-9)
      // The speed is imposed at the start (an impulsive motor), so the wheel rolls at once: v = −ω r
      expect(Math.abs(X[3 * n] - 0.6)).toBeLessThan(1e-9)
    }
    const L = frameLedger(rec, rec.frameCount - 1)
    expect(L.beltWork).toBeGreaterThan(0.1)
    expect(rel(L.beltWork, L.damping)).toBeLessThan(1e-9)
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })

  it('a torque motor on a free disc: α = τ/I', () => {
    const s = base('torque', 1)
    s.settings.gravity = { x: 0, y: 0 }
    const d = addBody(s, { id: 'd', name: '盘', shape: { type: 'circle', radius: 0.3 }, position: { x: 0, y: 0 }, mass: 2 })
    addConnector<MotorDef>(s, { name: 'm', type: 'motor', a: anchor(null, { x: 0, y: 0 }), b: anchor(d), mode: 'torque', speed: 0, torque: 0.9 })
    const rec = simulate(s)
    const n = rec.system.n
    const I = 0.5 * 2 * 0.09
    const X = frameState(rec, rec.frameCount - 1)
    expect(rel(X[3 * n + 2], 0.9 / I * 1)).toBeLessThan(1e-9)
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })

  it('meshing gears: ω_a + r·ω_b = 0 with one gear driven', () => {
    const s = base('gears', 1)
    s.settings.gravity = { x: 0, y: 0 }
    const A = addBody(s, { id: 'A', name: 'A', shape: { type: 'circle', radius: 0.1 }, position: { x: 0, y: 0 }, mass: 1 })
    const B = addBody(s, { id: 'B', name: 'B', shape: { type: 'circle', radius: 0.2 }, position: { x: 0.31, y: 0 }, mass: 2 })
    addConnector<HingeDef>(s, { name: 'ha', type: 'hinge', a: anchor(A), b: anchor(null, { x: 0, y: 0 }) })
    addConnector<HingeDef>(s, { name: 'hb', type: 'hinge', a: anchor(B), b: anchor(null, { x: 0.31, y: 0 }) })
    addConnector<GearDef>(s, { name: 'g', type: 'gear', a: anchor(A), b: anchor(B), ratio: 2 })
    addConnector<MotorDef>(s, { name: 'm', type: 'motor', a: anchor(null, { x: 0, y: 0 }), b: anchor(A), mode: 'torque', speed: 0, torque: 0.2 })
    const rec = simulate(s)
    const n = rec.system.n
    for (let k = 0; k < rec.frameCount; k += 60) {
      const X = frameState(rec, k)
      expect(Math.abs(X[3 * n + 2] + 2 * X[3 * n + 5])).toBeLessThan(1e-9)
    }
    // Effective inertia at A: I_A + I_B / r²
    const IA = 0.5 * 1 * 0.01, IB = 0.5 * 2 * 0.04
    const X = frameState(rec, rec.frameCount - 1)
    expect(rel(X[3 * n + 2], 0.2 / (IA + IB / 4))).toBeLessThan(1e-9)
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })

  it('a damper: v(t) = v₀ e^{−ct/m}, the energy goes to damping', () => {
    const s = base('damper', 2)
    s.settings.gravity = { x: 0, y: 0 }
    const b = addBody(s, { id: 'b', name: 'b', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: 1, y: 0 }, velocity: { x: 2, y: 0 }, mass: 0.5 })
    addConnector<DamperDef>(s, { name: 'd', type: 'damper', a: anchor(null, { x: 0, y: 0 }), b: anchor(b), damping: 0.7 })
    const rec = simulate(s)
    const n = rec.system.n
    for (let k = 0; k < rec.frameCount; k += 60) {
      const t = k * rec.dt
      expect(Math.abs(frameState(rec, k)[3 * n] - 2 * Math.exp(-0.7 * t / 0.5))).toBeLessThan(1e-9)
    }
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })

  it('a cubic spring keeps ½kx² + ¼k₃x⁴ + ½mv² constant', () => {
    const s = base('cubic', 3)
    s.settings.gravity = { x: 0, y: 0 }
    const b = addBody(s, { id: 'b', name: 'b', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: 1.3, y: 0 }, mass: 0.5 })
    addConnector<SpringDef>(s, { name: 'k', type: 'spring', a: anchor(null, { x: 0, y: 0 }), b: anchor(b), stiffness: 20, restLength: 1, damping: 0, cubic: 400 })
    const rec = simulate(s)
    expect(rel(frameLedger(rec, 0).spring, 0.5 * 20 * 0.09 + 0.25 * 400 * 0.0081)).toBeLessThan(1e-12)
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })

  it('the new connectors round-trip through the scene file', () => {
    const s = base('rt', 1)
    const a = addBody(s, { id: 'a', name: 'a', shape: { type: 'circle', radius: 0.1 }, position: { x: 0, y: 1 }, mass: 1 })
    addConnector<MotorDef>(s, { name: 'm', type: 'motor', a: anchor(null, { x: 0, y: 1 }), b: anchor(a), mode: 'speed', speed: 2, torque: 0 })
    addConnector<SliderDef>(s, { name: 's', type: 'slider', a: anchor(null, { x: 0, y: 0 }), b: anchor(a), axis: { x: 1, y: 0 }, free: true })
    const back = parseScene(serializeScene(s)).scene
    expect(back.connectors).toEqual(s.connectors)
  })
})

describe('26.50 carry-overs: reaching a pulley, approximate rest', () => {
  it('a block pulled up to its pulley ends the run there with an event', async () => {
    const { buildTemplate } = await import('../src/templates')
    const { simulate: sim } = await import('../src/core/solver/simulation')
    const { ropePath } = await import('../src/core/solver/kinematics')
    const { computePoses } = await import('../src/core/solver/kinematics')
    const { PULLEY_REACH } = await import('../src/core/solver/events')
    const rec = sim(buildTemplate('atwood', {}), { duration: 10 })
    expect(rec.stopReason).toBe('pulley')
    expect(rec.error).toBeNull()
    const ev = rec.events[rec.events.length - 1]
    expect(ev.triggers).toContain('pulley')
    expect(ev.changes.some(c => c.type === 'pulley' && c.bodies.length === 1)).toBe(true)
    // The end segment is PULLEY_REACH long at the event
    const p = ropePath(computePoses(rec.system.model, ev.after), rec.system.model.ropes[0])
    expect(Math.min(p.s1, p.sLast)).toBeCloseTo(PULLEY_REACH, 9)
    expect(ev.t).toBeGreaterThanOrEqual((rec.frameCount - 1) * rec.dt)
  })

  it('an unbounded run that settles only asymptotically stops at approximate rest', async () => {
    const { buildTemplate } = await import('../src/templates')
    const { SimulationRun, REST_TOL } = await import('../src/core/solver/simulation')
    const s = buildTemplate('damped-spring', {})
    s.settings.duration = null
    const run = new SimulationRun(s, { duration: null })
    run.advance(Date.now() + 60000, Math.round(120 / s.settings.outputStep))
    expect(run.stopReason).toBe('restApprox')
    const rec = run.result()
    const n = rec.system.n
    const X = rec.frames.state(rec.frameCount - 1)
    for (let i = 0; i < n; i++) expect(Math.abs(X[3 * n + 3 * i])).toBeLessThanOrEqual(REST_TOL)
    // A bounded run never stops early
    const b = buildTemplate('damped-spring', {})
    b.settings.duration = 40
    const bounded = new SimulationRun(b, {})
    bounded.advance(Date.now() + 60000)
    expect(bounded.stopReason).toBe('duration')
  }, 120000)
})
