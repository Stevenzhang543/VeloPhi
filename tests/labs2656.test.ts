/**
 * Labs and the model registry (26.56, D100): the lab operations agree with the model families they serve, and the
 * constants come from a named set — CODATA 2022 for new work, CODATA 2018 (the values of 26.55) for requests and files
 * without a set, so old results do not change.
 */
import { describe, expect, it } from 'vitest'
import { compton, fieldAt, magnetMap, plateCapacitor } from '../src/engine/labs'
import { constantSet, evalModel } from '../src/engine/models'
import { CONSTANT_LABS, LAB_VERSION, exportLab, importLab, labState, labVersionOf } from '../src/app/lab/state'

const err = (q: number, ref: number, scale = 0) => Math.abs(q - ref) / Math.max(Math.abs(ref), scale)
const out = (model: string, inputs: Record<string, number>, id: string, set = 'CODATA2022') => {
  const o = evalModel(model, inputs, { constantsSet: set }).outputs.find(x => x.id === id && x.value !== null)
  if (!o || o.value === null) throw new Error(`${model}.${id}`)
  return o.value
}
const k = (set: string, id: string) => constantSet(set).constants.find(c => c.id === id)!.value

describe('labs2656 fieldAt vs E02', () => {
  it('the field of two point charges at a point, with the Coulomb constant of the set', () => {
    const ke = k('CODATA2022', 'k_e')
    const [q1, q2, d] = [1e-6, -2e-6, 0.1]
    for (const [x, y] of [[0, 0.05], [0.2, -0.03], [-0.05, 0.12]]) {
      const r = fieldAt({ charges: [{ x: -d, y: 0, q: q1, r: 0.01 }, { x: d, y: 0, q: q2, r: 0.01 }], k: ke }, [{ x, y }])
      expect(err(r.E[0].x, out('E02', { q1, q2, d, x, y }, 'Ex'), 1)).toBeLessThan(1e-12)
      expect(err(r.E[0].y, out('E02', { q1, q2, d, x, y }, 'Ey'), 1)).toBeLessThan(1e-12)
    }
  })
})

describe('labs2656 plateCapacitor vs E06', () => {
  it('C, Q and the field of the plate capacitor, with ε₀ of the set (none: CODATA 2018)', () => {
    const [A, d, er, U] = [0.02, 2e-3, 3, 100]
    for (const set of ['CODATA2022', 'CODATA2018']) {
      const r = plateCapacitor({ S: A, d, er, mode: 'battery', U, constantsSet: set })
      expect(err(r.C, out('E06', { A, d, er, U }, 'C', set))).toBeLessThan(1e-14)
    }
    const old = plateCapacitor({ S: A, d, er, mode: 'battery', U })
    expect(old.C).toBe(plateCapacitor({ S: A, d, er, mode: 'battery', U, constantsSet: 'CODATA2018' }).C)
    // isolated: the charge stays, the core computes it from the state before the change
    const iso = plateCapacitor({ S: A, d: 2 * d, er, mode: 'isolated', U, S0: A, d0: d, er0: er, constantsSet: 'CODATA2022' })
    expect(err(iso.Q, iso.Q0)).toBeLessThan(1e-15)
    expect(err(iso.U, 2 * U)).toBeLessThan(1e-12)
  })
})

describe('labs2656 magnetMap constants by set', () => {
  it('B = μ0 I/(2π r) of a long wire with μ0 of the set; without a set the 2018 value of 26.55', () => {
    const wire = { wires: [{ x: 0, y: 0, I: 10, r: 0.002 }] }
    const req = { region: { x0: -0.1, y0: -0.1, x1: 0.1, y1: 0.1 }, grid: 8, lines: 0, arrows: 0, probes: [{ x: 0.05, y: 0 }] }
    const B = (set?: string) => { const p = magnetMap(wire, { ...req, ...(set ? { constantsSet: set } : {}) }).probes[0]; return Math.hypot(p.Bx, p.By) }
    for (const set of ['CODATA2018', 'CODATA2022']) expect(err(B(set), k(set, 'mu0') * 10 / (2 * Math.PI * 0.05))).toBeLessThan(1e-14)
    expect(B()).toBe(B('CODATA2018'))
    expect(B('CODATA2022')).not.toBe(B('CODATA2018'))
  })
})

describe('labs2656 compton constants by set', () => {
  it('Δλ = λ_C(1 − cos θ) with λ_C of the set; without a set the rounded values of 26.55 stay', () => {
    const th = Math.PI / 3
    for (const set of ['CODATA2018', 'CODATA2022']) {
      const r = compton(71.1, th, set)
      expect(err(r.shift * 1e-12, k(set, 'lambda_C') * (1 - Math.cos(th)))).toBeLessThan(1e-12)
      expect(err(r.shift * 1e-12, out('Q02', { lam: 71.1e-12, th }, 'dl', set))).toBeLessThan(1e-9)
    }
    const old = compton(71.1, th)
    expect(old.shift).toBe(compton(71.1, th, 'CODATA2018').shift)
    expect(old.constantsSet).toBe('CODATA2018-rounded')
  })
  it('lab states: new experiments use 2022, states and files without a set keep 2018; a 2022 file is version 3', () => {
    expect(LAB_VERSION).toBe(3)
    for (const id of CONSTANT_LABS) expect(labVersionOf(id, { constantsSet: 'CODATA2022' })).toBe(3)
    expect(labVersionOf('compton', { constantsSet: 'CODATA2018' })).toBe(1)
    const s = labState('compton', () => ({ lambda: 71.1, theta: 90, constantsSet: 'CODATA2022' }))
    expect(s.constantsSet).toBe('CODATA2022')
    const id = importLab(JSON.stringify({ format: 'velophi-lab', version: 1, lab: 'compton', state: { lambda: 50, theta: 30 } }), x => x === 'compton', m => m)
    expect(id).toBe('compton')
    expect(labState('compton', () => ({ lambda: 71.1, theta: 90, constantsSet: 'CODATA2022' })).constantsSet).toBe('CODATA2018')
    expect(JSON.parse(exportLab('compton')).version).toBe(1)
  })
  it('an exported experiment carries the run manifest: backend, physics version, input hash and its constant set', () => {
    const doc = JSON.parse(exportLab('compton'))
    expect(doc.manifest.backend).toBe('nuclear')
    expect(doc.manifest.constantsSet).toBe('CODATA2018')
    expect(doc.manifest.inputSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(doc.manifest.physicsVersion).toBeTruthy()
  })
})
