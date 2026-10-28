/**
 * Closed loop 3 — heat, quantum and nuclear (26.56, blueprint §8 loop 3; models T10 Q05 Q08 N01 N02): the labs of the
 * Rust core against the model registry and against checks written out here — the work of a gas process as a
 * quadrature of its p–V curve, a cycle that closes, the eigenvalues of the finite-difference well converging at
 * second order to the closed form, the free Gaussian packet converging under grid refinement to Q08 and the time
 * step converging at second order, the absorbed probability reported apart from the discretization error, and the
 * Monte Carlo decay: a fixed seed reproduces, many seeds reproduce the binomial mean and variance.
 */
import { describe, expect, it } from 'vitest'
import { decay, decayChain, gasCycle, gasProcess, quantumRun, quantumSetup } from '../src/engine/labs'
import { constantSet, evalModel } from '../src/engine/models'
import { gridStudy, stepStudy } from '../src/teaching/convergence'

const err = (q: number, ref: number, scale = 0) => Math.abs(q - ref) / Math.max(Math.abs(ref), scale)
const out = (model: string, inputs: Record<string, number>, id: string, set = 'CODATA2022') => {
  const o = evalModel(model, inputs, { constantsSet: set }).outputs.find(x => x.id === id && x.value !== null)
  if (!o || o.value === null) throw new Error(`${model}.${id}`)
  return o.value
}
/** Composite Simpson over sample pairs (x, y) with an even number of intervals (uniform in x). */
function simpson(curve: number[]): number {
  const xs = curve.filter((_, k) => k % 2 === 0), ys = curve.filter((_, k) => k % 2 === 1)
  const n = xs.length - 1
  if (n % 2) throw new Error('odd')
  const h = (xs[n] - xs[0]) / n
  let s = ys[0] + ys[n]
  for (let k = 1; k < n; k++) s += (k % 2 ? 4 : 2) * ys[k]
  return (s * h) / 3
}

describe('loop 3: gasProcess vs T10 (four branches, quadrature of p dV)', () => {
  const n = 1, T1 = 300, V1 = 0.01, V2 = 0.02, gamma = 1.4
  const p1 = out('T08', { n, Tg: T1, V: V1 }, 'p')
  const cases: Array<[number, 'isothermal' | 'isobaric' | 'isochoric' | 'adiabatic', number]> = [[1, 'isothermal', V2], [2, 'isobaric', V2], [3, 'isochoric', 400], [4, 'adiabatic', V2]]
  for (const [proc, kind, target] of cases) {
    it(`${kind}: W, Q, ΔU and the end temperature`, () => {
      const r = gasProcess({ n, gamma, p: p1, V: V1, kind, target, samples: 2001 })
      const ins = { n, T1, V1, V2, T2: 400, gamma, proc }
      expect(err(r.W, out('T10', ins, 'W'), 1)).toBeLessThan(1e-10)
      expect(err(r.dU, out('T10', ins, 'dU'), 1)).toBeLessThan(1e-10)
      expect(err(r.Q, out('T10', ins, 'Q'), 1)).toBeLessThan(1e-10)
      expect(err(r.to.T, out('T10', ins, 'Tend'))).toBeLessThan(1e-10)
      // first law and the work as the area under the curve (uniformly sampled in V for these processes)
      expect(err(r.Q, r.dU + r.W, 1)).toBeLessThan(1e-10)
      if (kind !== 'isochoric') expect(err(simpson(r.curve), r.W)).toBeLessThan(1e-8)
    })
  }
  it('cycle closes: the Carnot cycle returns to its start, W = Qin − Qout and η = 1 − Tc/Th', () => {
    const c = gasCycle({ kind: 'carnot', n: 1, gamma: 1.4, Th: 600, Tc: 300, V1: 1e-3, V2: 3e-3 })
    const a = c.processes[0].from, z = c.processes[c.processes.length - 1].to
    expect(err(z.p, a.p) + err(z.V, a.V) + err(z.T, a.T)).toBeLessThan(1e-12)
    expect(err(c.W, c.Qin - c.Qout)).toBeLessThan(1e-12)
    expect(err(c.efficiency, 1 - 300 / 600)).toBeLessThan(1e-12)
    for (let k = 1; k < c.processes.length; k++) expect(err(c.processes[k].from.V, c.processes[k - 1].to.V)).toBeLessThan(1e-12)
  })
})

describe('loop 3: quantumSetup well levels vs Q05 with grid convergence (order 2)', () => {
  it('the finite-difference levels of a 1 nm well converge to Q05 at second order', () => {
    // Q05 in J; the lab works in ħ²/(m·nm²): the ratio cancels the constants (same set for both)
    const set = constantSet('CODATA2018')
    const k = (id: string) => set.constants.find(c => c.id === id)!.value
    const me = k('m_e'), hbar = k('hbar')
    const E0 = (hbar * hbar) / (me * 1e-18)
    const ref = [1, 2, 3].map(nn => out('Q05', { m: me, Lw: 1e-9, n: nn }, 'En', 'CODATA2018') / E0)
    const errs: number[] = []
    for (const n of [127, 255, 511, 1023]) {
      const s = quantumSetup({ potential: { kind: 'box', c: 0, w: 1 }, n, states: 3 })
      errs.push(Math.max(...ref.map((r, i) => err(s.energies[i], r))))
    }
    for (let i = 1; i < errs.length; i++) {
      const order = Math.log2(errs[i - 1] / errs[i])
      expect(order).toBeGreaterThan(1.9)
      expect(order).toBeLessThan(2.1)
    }
    expect(errs[errs.length - 1]).toBeLessThan(2e-5)
  })
})

describe('loop 3: quantumRun packet vs Q08 (σ(t), ⟨x⟩(t), norm) with grid and step convergence', () => {
  it('the free packet converges spectrally to Q08 and keeps its norm', () => {
    const g = gridStudy()
    const last = g.rows[g.rows.length - 1]
    expect(last.errX).toBeLessThan(1e-12)
    expect(last.errS).toBeLessThan(1e-12)
    for (const r of g.rows) expect(r.errNorm).toBeLessThan(1e-12)
    // a coarse grid is visibly wrong: the study does show convergence
    expect(g.rows[0].errS).toBeGreaterThan(1e-3)
  })
  it('the split-operator time step converges at second order (self-convergence)', () => {
    const rows = stepStudy()
    const orders = rows.map(r => r.order).filter((x): x is number => x !== null)
    expect(orders.length).toBeGreaterThanOrEqual(2)
    for (const p of orders) expect(Math.abs(p - 2)).toBeLessThan(0.05)
  })
  it('quantum packet centre moves at the group velocity (W14: ω = k²/2, v_g = k0)', () => {
    const r = quantumRun({ potential: { kind: 'free' }, x0: -40, x1: 40, n: 512, packet: { x0: -5, sigma: 1, k0: 2 }, t0: 0, duration: 3, frames: 3, absorb: 0 })
    const vg = out('W14', { a: 0.5, k0: 2 }, 'vg')
    for (const e of r.expect) expect(err(e.x, -5 + vg * e.t, 1)).toBeLessThan(1e-10)
  })
  it('absorber loss is reported apart from discretization error', () => {
    // a packet running into the absorbing layer: what leaves the window is counted, the rest keeps the norm
    const r = quantumRun({ potential: { kind: 'free' }, x0: -20, x1: 20, n: 512, packet: { x0: 5, sigma: 1, k0: 4 }, t0: 0, duration: 6, frames: 3, absorb: 0.15 })
    const last = r.expect[r.expect.length - 1]
    expect(r.absorbed).toBeGreaterThan(0.5)
    expect(Math.abs(last.norm + r.absorbed - 1)).toBeLessThan(1e-9)
  })
})

describe('loop 3: decay Monte Carlo: fixed seed regression and many-seed distribution (mean, variance, χ²)', () => {
  const N0 = 1600, Th = 4, dt = 0.1, steps = 120
  it('the same seed gives the same history; another seed another one', () => {
    const a = decay({ n0: N0, halfLife: Th, dt, steps, seed: 7 })
    const b = decay({ n0: N0, halfLife: Th, dt, steps, seed: 7 })
    const c = decay({ n0: N0, halfLife: Th, dt, steps, seed: 8 })
    expect(Array.from(a.counts)).toEqual(Array.from(b.counts))
    expect(Array.from(a.counts)).not.toEqual(Array.from(c.counts))
  })
  it('over many seeds the count left after 12 s has the binomial mean and variance of N01', () => {
    const runs = 400
    const left: number[] = []
    for (let s = 1; s <= runs; s++) left.push(decay({ n0: N0, halfLife: Th, dt, steps, seed: s }).counts[steps])
    const mean = left.reduce((a, b) => a + b, 0) / runs
    const v = left.reduce((a, b) => a + (b - mean) ** 2, 0) / (runs - 1)
    const N = out('N01', { N0, Th, t: steps * dt }, 'N'), sd = out('N01', { N0, Th, t: steps * dt }, 'sd')
    // the mean within 4 standard errors; the variance by a χ² bound for 399 degrees of freedom (±25 %)
    expect(Math.abs(mean - N)).toBeLessThan((4 * sd) / Math.sqrt(runs))
    expect(v / (sd * sd)).toBeGreaterThan(0.75)
    expect(v / (sd * sd)).toBeLessThan(1.25)
  })
  it('decay seeds and statistical band: the expectation of the run equals N01 at every step', () => {
    const r = decay({ n0: N0, halfLife: Th, dt, steps, seed: 1 })
    for (const k of [0, 40, 80, 120]) expect(err(r.theory[k], out('N01', { N0, Th, t: k * dt }, 'N'))).toBeLessThan(1e-12)
  })
})

describe('loop 3: decayChain vs N02 (equal and nearly equal constants, total conserved)', () => {
  const N10 = 100
  for (const [name, T2] of [['equal', 1], ['nearly equal', 1 / (1 + 1e-6)], ['distinct', 0.25]] as Array<[string, number]>) {
    it(`${name} half-lives`, () => {
      const r = decayChain({ halfLives: [1, T2, 0], n0: [N10, 0, 0], tEnd: 5, samples: 51, t: 1 })
      const ins = { N10, l1: Math.LN2, l2: Math.LN2 / T2, t: 1 }
      expect(err(r.at![0], out('N02', ins, 'N1'))).toBeLessThan(1e-12)
      expect(err(r.at![1], out('N02', ins, 'N2'))).toBeLessThan(1e-9)
      expect(err(r.at![2], out('N02', ins, 'N3'))).toBeLessThan(1e-9)
      const n = r.t.length
      // nearly equal constants go through 1/(λ2 − λ1) ≈ 10⁶/λ: the total then holds to about 1e−10 relative, not to rounding
      for (let k = 0; k < n; k++) expect(Math.abs(r.N[k] + r.N[n + k] + r.N[2 * n + k] - N10) / N10).toBeLessThan(name === 'nearly equal' ? 1e-9 : 1e-13)
    })
  }
})
