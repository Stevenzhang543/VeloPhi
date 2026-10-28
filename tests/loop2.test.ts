/**
 * Closed loop 2 — circuits and induction (26.56, blueprint §8 loop 2; models E09 E10 E13 E15 E17 B10 B11): the circuit
 * lab of the Rust core (modified nodal analysis `circuitSolve`, the stiff integrator `circuitRun`) and the rail
 * induction of the rigid-body core, against the model registry and against checks written out here: Kirchhoff's
 * current law at every node from the returned currents, a separate nodal solution of a bridge, the energy ledger of a
 * charging capacitor, the energy and phase of an LC circuit over ten periods, and the power balance on the rails.
 */
import { describe, expect, it } from 'vitest'
import { circuitRun, circuitSolve } from '../src/engine/labs'
import type { CircuitElement, CircuitSolution } from '../src/engine/labs'
import { evalModel } from '../src/engine/models'
import { buildTemplate } from '../src/templates'
import { simulate } from '../src/engine/recording'
import type { Recording } from '../src/engine/recording'
import { quantitySeries } from '../src/engine/observe'

const err = (q: number, ref: number, scale = 0) => Math.abs(q - ref) / Math.max(Math.abs(ref), scale)
const out = (model: string, inputs: Record<string, number>, id: string) => {
  const o = evalModel(model, inputs).outputs.find(x => x.id === id && x.value !== null)
  if (!o || o.value === null) throw new Error(`${model}.${id}`)
  return o.value
}
const el = (id: string, kind: CircuitElement['kind'], a: string, b: string, more: Partial<CircuitElement> = {}): CircuitElement => ({ id, kind, a, b, ...more })

/** Kirchhoff's current law from the element currents (I from a to b), largest residual relative to the largest current. */
function kclResidual(els: CircuitElement[], s: CircuitSolution): number {
  const sum: Record<string, number> = {}
  let big = 0
  for (const e of els) {
    const I = s.elements[e.id]?.I ?? 0
    big = Math.max(big, Math.abs(I))
    sum[e.a] = (sum[e.a] ?? 0) - I
    sum[e.b] = (sum[e.b] ?? 0) + I
  }
  return Math.max(...Object.values(sum).map(Math.abs)) / Math.max(big, 1e-300)
}

describe('loop 2: circuitSolve vs E09 with independent KCL residual', () => {
  const U = 9, R1 = 6, R2 = 3
  it('series: one current, the voltages divide as the resistances', () => {
    const els = [el('E', 'battery', 'p', 'n', { E: U }), el('R1', 'resistor', 'p', 'm', { R: R1 }), el('R2', 'resistor', 'm', 'n', { R: R2 })]
    const s = circuitSolve(els)
    expect(s.ok).toBe(true)
    expect(err(s.elements.R1.I!, out('E09', { R1, R2, U }, 'Is'))).toBeLessThan(1e-12)
    expect(err(s.elements.R1.U!, out('E09', { R1, R2, U }, 'U1'))).toBeLessThan(1e-12)
    expect(kclResidual(els, s)).toBeLessThan(1e-12)
  })
  it('parallel: the branch currents add up', () => {
    const els = [el('E', 'battery', 'p', 'n', { E: U }), el('R1', 'resistor', 'p', 'n', { R: R1 }), el('R2', 'resistor', 'p', 'n', { R: R2 })]
    const s = circuitSolve(els)
    expect(err(Math.abs(s.elements.E.I!), out('E09', { R1, R2, U }, 'Ip'))).toBeLessThan(1e-12)
    expect(err(s.elements.R2.I!, out('E09', { R1, R2, U }, 'I2'))).toBeLessThan(1e-12)
    expect(kclResidual(els, s)).toBeLessThan(1e-12)
  })
})

describe('loop 2: bridge vs circuitSolve', () => {
  it('an unbalanced bridge: the galvanometer current of E10 (Thévenin), of circuitSolve and of a separate nodal solution', () => {
    const [R1, R2, R3, R4, U, Rg] = [100, 200, 150, 200, 6, 50]
    const els = [el('E', 'battery', 'top', 'bot', { E: U }), el('R1', 'resistor', 'top', 'l', { R: R1 }), el('R2', 'resistor', 'l', 'bot', { R: R2 }),
      el('R3', 'resistor', 'top', 'r', { R: R3 }), el('R4', 'resistor', 'r', 'bot', { R: R4 }), el('G', 'resistor', 'l', 'r', { R: Rg })]
    const s = circuitSolve(els)
    // nodal equations for Vl, Vr with Vtop = U, Vbot = 0 (Cramer's rule)
    const a11 = 1 / R1 + 1 / R2 + 1 / Rg, a12 = -1 / Rg, a21 = -1 / Rg, a22 = 1 / R3 + 1 / R4 + 1 / Rg
    const b1 = U / R1, b2 = U / R3
    const det = a11 * a22 - a12 * a21
    const Vl = (b1 * a22 - a12 * b2) / det, Vr = (a11 * b2 - a21 * b1) / det
    const Ig = (Vl - Vr) / Rg
    expect(err(s.elements.G.I!, Ig)).toBeLessThan(1e-12)
    expect(err(s.elements.G.I!, out('E10', { R1, R2, R3, R4, U, Rg }, 'Ig'))).toBeLessThan(1e-12)
    expect(kclResidual(els, s)).toBeLessThan(1e-12)
    // balanced: no current
    const bal = circuitSolve(els.map(e => (e.id === 'R3' ? { ...e, R: 100 } : e)))
    expect(Math.abs(bal.elements.G.I!)).toBeLessThan(1e-15)
  })
})

describe('loop 2: voltmeter loading vs circuitSolve', () => {
  it('a voltmeter of finite resistance reads what E13 predicts', () => {
    const [Vs, R1, R2, RV] = [10, 1e4, 1e4, 1e5]
    const els = [el('E', 'battery', 'p', 'n', { E: Vs }), el('R1', 'resistor', 'p', 'm', { R: R1 }), el('R2', 'resistor', 'm', 'n', { R: R2 }), el('V', 'voltmeter', 'm', 'n', { r: RV })]
    const s = circuitSolve(els)
    expect(err(s.elements.V.U!, out('E13', { Vs, R1, R2, RV }, 'Vread'))).toBeLessThan(1e-12)
    expect(kclResidual(els, s)).toBeLessThan(1e-12)
  })
})

describe('loop 2: circuitRun RC vs E15 with rtol convergence', () => {
  const [R, C, Vs] = [1000, 1e-4, 5]
  const els = [el('E', 'battery', 'p', 'n', { E: Vs }), el('R', 'resistor', 'p', 'c', { R }), el('C', 'capacitor', 'c', 'n', { C })]
  const k = els.findIndex(e => e.id === 'C')
  const run = (rtol?: number) => circuitRun(els, { t0: 0, duration: 0.5, samples: 50, ...(rtol ? { rtol } : {}) })
  it('the capacitor voltage follows E15 at every sample; tightening the tolerance reduces the error', () => {
    const errs: number[] = []
    for (const rtol of [1e-6, 1e-9, 1e-11]) {
      const r = run(rtol)
      let e = 0
      for (let j = 1; j < r.t.length; j++) e = Math.max(e, err(r.U[j * els.length + k], out('E15', { R, C, Vs, V0: 0, t: r.t[j] }, 'VC'), Vs))
      errs.push(e)
    }
    expect(errs[2]).toBeLessThan(1e-8)
    expect(errs[2]).toBeLessThanOrEqual(errs[0])
  })
  it('energy ledger RC: the source delivers what the resistor dissipates plus what the capacitor stores', () => {
    const r = run()
    const t = r.t[r.t.length - 1]
    const delivered = -r.energy.E, heat = r.energy.R, stored = r.energy.C
    expect(err(delivered, heat + stored)).toBeLessThan(1e-9)
    expect(err(stored, out('E15', { R, C, Vs, V0: 0, t }, 'WC'))).toBeLessThan(1e-8)
    expect(err(heat, out('E15', { R, C, Vs, V0: 0, t }, 'WR'))).toBeLessThan(1e-8)
  })
})

describe('loop 2: circuitRun LC period, energy and phase drift', () => {
  it('ten periods: the period of E17, energy constant to 1e−8 and a phase drift below 1e−5 of a period (zero crossings interpolated between samples)', () => {
    const [L, C, V0] = [1, 1e-4, 10]
    const els = [el('C', 'capacitor', 'a', 'b', { C }), el('L', 'inductor', 'a', 'b', { L, r: 0 })]
    const T = out('E17', { L, C, V0, I0: 0 }, 'T')
    const r = circuitRun(els, { t0: 0, duration: 10 * T, samples: 4000, state: { C: [V0, 0, 0, 0] } })
    const n = els.length
    const U = (j: number) => r.U[j * n]
    // upward zero crossings of the capacitor voltage (linear interpolation between samples)
    const ups: number[] = []
    for (let j = 1; j < r.t.length; j++) if (U(j - 1) < 0 && U(j) >= 0) ups.push(r.t[j - 1] + (r.t[j] - r.t[j - 1]) * (-U(j - 1)) / (U(j) - U(j - 1)))
    expect(ups.length).toBeGreaterThanOrEqual(9)
    const period = (ups[ups.length - 1] - ups[0]) / (ups.length - 1)
    expect(err(period, T)).toBeLessThan(1e-6)
    // the first upward crossing of V0 cos(ωt) is at 3T/4; after nine more periods the drift is tiny
    expect(Math.abs(ups[ups.length - 1] - (0.75 + ups.length - 1) * T) / T).toBeLessThan(1e-5)
    const E0 = 0.5 * C * V0 * V0
    let worst = 0
    for (let j = 0; j < r.t.length; j++) worst = Math.max(worst, Math.abs(0.5 * C * r.U[j * n] ** 2 + 0.5 * L * r.I[j * n + 1] ** 2 - E0) / E0)
    expect(worst).toBeLessThan(1e-8)
    expect(err(Math.max(...Array.from({ length: r.t.length }, (_, j) => Math.abs(r.I[j * n + 1]))), out('E17', { L, C, V0, I0: 0 }, 'Imax'))).toBeLessThan(1e-4)
  })
})

describe('loop 2: rail induction', () => {
  const at = (rec: Recording, id: string, k = rec.frameCount - 1) => quantitySeries(rec, [id], k, k, 1).values[0][0]
  it('rail force: simulation vs B11 and energy balance', () => {
    const [F, B, L, R, m] = [2, 1, 0.5, 0.25, 0.5]
    const rec = simulate(buildTemplate('rail-force', { F, B, L, R, m }))
    for (const k of [100, 600, rec.frameCount - 1]) {
      const t = k * rec.dt
      expect(err(at(rec, 'rod.v', k), out('B11', { m, B, L, R, F, t, v0: 0 }, 'v'), 1e-3)).toBeLessThan(1e-8)
      expect(err(at(rec, 'ledger.jouleHeat', k), out('B11', { m, B, L, R, F, t, v0: 0 }, 'Q'), 1e-3)).toBeLessThan(1e-7)
    }
    // work of the pull = kinetic energy + Joule heat
    expect(Math.abs(at(rec, 'ledger.balance')) / at(rec, 'ledger.appliedWork')).toBeLessThan(1e-8)
    // the emf of B10 from the simulated speed equals the loop's emf (a consistency check)
    const v = at(rec, 'rod.v')
    expect(err(at(rec, 'loop.emf'), out('B10', { B, L, v, R }, 'emf'))).toBeLessThan(1e-12)
  })
  it('rail coast: simulation vs B10/B11 and power balance', () => {
    const [v0, B, L, R, m] = [3, 1, 0.5, 0.25, 0.5]
    const rec = simulate(buildTemplate('rail-coast', { v0, B, L, R, m }))
    const k = rec.frameCount - 1, t = k * rec.dt
    expect(err(at(rec, 'rod.v', k), out('B11', { m, B, L, R, F: 0, t, v0 }, 'v'), 1e-3)).toBeLessThan(1e-8)
    expect(err(at(rec, 'rod.v', k), v0 * Math.exp(-(B * B * L * L / R) * t / m), 1e-3)).toBeLessThan(1e-8)
    // the kinetic energy lost is the Joule heat
    expect(err(at(rec, 'ledger.jouleHeat', k), 0.5 * m * (v0 * v0 - at(rec, 'rod.v', k) ** 2))).toBeLessThan(1e-8)
    expect(err(at(rec, 'loop.I', k) ** 2 * R, out('B10', { B, L, v: at(rec, 'rod.v', k), R }, 'P'))).toBeLessThan(1e-10)
  })
})
