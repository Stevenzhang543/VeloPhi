/**
 * Simulations against the model registry (26.56, coverage matrix): the templates and labs that exercise the model
 * families M05 M06 M10 W04 F01 W08 O09 checked against the registry (Rust formula path) and against closed forms
 * written out here — not against a second run of the same solver. Scaled errors with unrounded SI values.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import { simulate } from '../src/engine/recording'
import type { Recording } from '../src/engine/recording'
import { quantitySeries } from '../src/engine/observe'
import { evalModel } from '../src/engine/models'
import { slitPattern, waveRun } from '../src/engine/labs'

const err = (q: number, ref: number, scale = 0) => Math.abs(q - ref) / Math.max(Math.abs(ref), scale)
const out = (model: string, inputs: Record<string, number>, id: string) => {
  const o = evalModel(model, inputs).outputs.find(x => x.id === id && (x.state === 'applicable' || x.state === 'approximate'))
  if (!o || o.value === null) throw new Error(`${model}.${id} not applicable`)
  return o.value
}
function series(rec: Recording, id: string): { t: Float64Array; v: Float64Array } {
  const s = quantitySeries(rec, [id], 0, rec.frameCount - 1, 1)
  return { t: s.t, v: s.values[0] }
}
const last = (rec: Recording, id: string) => quantitySeries(rec, [id], rec.frameCount - 1, rec.frameCount - 1, 1).values[0][0]
const DEG = Math.PI / 180

describe('sim2656 M05 pursuit', () => {
  it('the gap of the pursuit template follows d + vt − ½at², is largest at t = v/a and closes at the root', () => {
    const [v, a, d, g] = [4, 2, 6, 9.8]
    const rec = simulate(buildTemplate('pursuit', { v, a, d, g }))
    const s = series(rec, 'custom.gap')
    let worst = 0
    for (let k = 0; k < s.t.length; k++) worst = Math.max(worst, err(s.v[k], d + v * s.t[k] - 0.5 * a * s.t[k] ** 2, d))
    expect(worst).toBeLessThan(1e-9)
    const tMeet = (v + Math.sqrt(v * v + 2 * a * d)) / a
    const k = s.v.findIndex(x => x < 0)
    expect(k).toBeGreaterThan(0)
    expect(s.t[k - 1]).toBeLessThanOrEqual(tMeet)
    expect(s.t[k]).toBeGreaterThanOrEqual(tMeet)
    // the uniform branch of M05: B leading by d and slower than A is caught at d/(vA − vB)
    expect(err(out('M05', { vA: 5, d: 12, vB: 2, tMax: 100 }, 'tc'), 12 / 3)).toBeLessThan(1e-12)
  })
})

describe('sim2656 M06 two ropes', () => {
  it('symmetric ropes at 30° to the horizontal: the simulated tensions equal M06 and the force balance', () => {
    const [m, g] = [10, 9.8]
    const rec = simulate(buildTemplate('two-ropes', { alpha: 60, beta: 60, m, g }))
    const T = out('M06', { m, g, alpha: 30 * DEG }, 'T')
    expect(err(T, m * g / (2 * Math.sin(30 * DEG)))).toBeLessThan(1e-14)
    expect(err(last(rec, 'rope1.T'), T)).toBeLessThan(1e-9)
    expect(err(last(rec, 'rope2.T'), T)).toBeLessThan(1e-9)
  })
  it('asymmetric ropes: T₁ = mg sin β / sin(α + β) (Lami), M06 is not offered for them', () => {
    const [m, g, al, be] = [2, 9.8, 30, 60]
    const rec = simulate(buildTemplate('two-ropes', { alpha: al, beta: be, m, g }))
    expect(err(last(rec, 'rope1.T'), m * g * Math.sin(be * DEG) / Math.sin((al + be) * DEG))).toBeLessThan(1e-9)
    expect(err(last(rec, 'rope2.T'), m * g * Math.sin(al * DEG) / Math.sin((al + be) * DEG))).toBeLessThan(1e-9)
  })
})

describe('sim2656 M10 elevator', () => {
  it('after the damped transient the scale reads m(g + a) of M10 with a from Newton for the whole lift', () => {
    const [F, M, m, k, c, g] = [80, 5, 1, 400, 12, 9.8]
    const rec = simulate(buildTemplate('elevator', { F, M, m, k, c, g }))
    const a = (F - (M + m) * g) / (M + m)
    expect(err(last(rec, 'cabin.ay'), a)).toBeLessThan(1e-6)
    expect(err(last(rec, 'scale.F'), out('M10', { m, g, ay: a }, 'N'))).toBeLessThan(1e-6)
  })
})

describe('sim2656 W04 resonance', () => {
  it('the steady amplitude of the driven oscillator equals W04 (transient decayed below 1e−4)', () => {
    const [k, m, c, F0, omega, g] = [50, 0.5, 0.5, 1, 9, 9.8]
    const rec = simulate(buildTemplate('resonance', { k, m, c, F0, omega, g }))
    const s = series(rec, 'block.x')
    const T = 2 * Math.PI / omega, tEnd = s.t[s.t.length - 1]
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i < s.t.length; i++) if (s.t[i] > tEnd - 2 * T) { lo = Math.min(lo, s.v[i]); hi = Math.max(hi, s.v[i]) }
    const A = out('W04', { m, k, b: c, F0, w: omega }, 'Amp')
    expect(err(A, F0 / Math.hypot(k - m * omega * omega, c * omega))).toBeLessThan(1e-14)
    // half the peak-to-peak swing over the last two periods (about 6e−5 off: the transient and the sampling of the peaks)
    expect(err((hi - lo) / 2, A)).toBeLessThan(5e-4)
  })
})

describe('sim2656 F01 liquid pressure', () => {
  it('the gauge pressure at the centre of a sinking ball is ρgh of F01 at every frame', () => {
    const [rho, g] = [1000, 9.8]
    const sc = buildTemplate('sinking-ball', { rhoB: 7800, rho, d: 0.1, g })
    const water = sc.settings.regions![0]
    const surface = water.y + water.h! / 2
    const rec = simulate(sc)
    const p = series(rec, 'ball.pl'), y = series(rec, 'ball.y')
    let worst = 0
    for (let i = 0; i < p.t.length; i++) worst = Math.max(worst, err(p.v[i], out('F01', { rho, g, h: surface - y.v[i], p0: 101325 }, 'pg'), rho * g * 0.01))
    expect(worst).toBeLessThan(1e-12)
  })
})

describe('sim2656 W08 string junction', () => {
  /** Reflected and transmitted peak of a Gaussian pulse at a junction c1 → c2 (equal tension: Z ∝ 1/c). */
  function junction(n: number) {
    const L = 4, c1 = 3, c2 = 1
    const spec = { n, length: L, c1, c2, split: 0.5, left: { type: 'driven' as const, amp: 0.01, pulse: 0.1 }, right: { type: 'absorb' as const } }
    const r = waveRun(spec, { u: new Array(n).fill(0), t0: 0, duration: 1.4, frames: 1 })
    const u = r.u, mid = Math.round(0.5 * (n - 1))
    let refl = 0, trans = 0
    for (let i = 0; i < n; i++) {
      if (i < mid && Math.abs(u[i]) > Math.abs(refl)) refl = u[i]
      if (i > mid && Math.abs(u[i]) > Math.abs(trans)) trans = u[i]
    }
    return { refl, trans, mu: [1 / (c1 * c1), 1 / (c2 * c2)] }
  }
  it('the reflected and transmitted amplitudes converge to W08 (r = (Z1 − Z2)/(Z1 + Z2), t = 2Z1/(Z1 + Z2))', () => {
    const errs: number[] = []
    for (const n of [801, 1601, 3201]) {
      const j = junction(n)
      const ins = { Ts: 1, mu1: j.mu[0], mu2: j.mu[1], Ai: 0.01 }
      errs.push(Math.max(err(j.refl, out('W08', ins, 'Ar'), 0.01), err(j.trans, 0.01 * out('W08', ins, 'tc'), 0.01)))
    }
    // second-order convergence of the leapfrog junction (8.4e−4, 2.1e−4, 5.2e−5)
    for (let i = 1; i < errs.length; i++) expect(Math.log2(errs[i - 1] / errs[i])).toBeGreaterThan(1.8)
    expect(errs[errs.length - 1]).toBeLessThan(1e-4)
  })
})

describe('sim2656 O09 grating', () => {
  it('the peaks of the sampled grating intensity lie at L tan θ of O09 with the envelope of O09; a missing order has no peak', () => {
    const lam = 500e-9, nl = 2e5, a = 1e-6, N = 8, L = 1, half = 0.7, n = 8001
    const r = slitPattern({ setup: 'grating', lambda: lam * 1e9, white: false, a, d: 1 / nl, N, L, half, samples: n })
    const x = Array.from(r.x), I = Array.from(r.I)
    const h = x[1] - x[0], i0 = (n - 1) / 2
    // the envelope written out here; dividing it off leaves the interference factor, whose peaks are the orders
    const sinc2 = (u: number) => (u === 0 ? 1 : (Math.sin(u) / u) ** 2)
    const env = x.map(v => sinc2((Math.PI * a * Math.sin(Math.atan(v / L))) / lam))
    const G = I.map((v, k) => v / env[k] / I[i0])
    /** Local maximum of G nearest to x0, refined by a parabola through three samples. */
    const peak = (x0: number) => {
      let k = Math.round((x0 + half) / h)
      while (G[k + 1] > G[k]) k++
      while (G[k - 1] > G[k]) k--
      const [a0, b0, c0] = [G[k - 1], G[k], G[k + 1]]
      const s = (a0 - c0) / (2 * (a0 - 2 * b0 + c0))
      return { x: x[k] + s * h, G: b0 - ((a0 - c0) * s) / 4 }
    }
    for (const m of [1, 2, 3]) {
      const xm = L * Math.tan(out('O09', { nl, lam, m, a }, 'th'))
      const p = peak(xm)
      expect(Math.abs(p.x - xm)).toBeLessThan(0.02 * h)
      expect(Math.abs(p.G - 1)).toBeLessThan(1e-4)
      // at the order the intensity is the envelope of O09
      const k = Math.round((xm + half) / h)
      expect(err(env[k], out('O09', { nl, lam, m, a }, 'env'))).toBeLessThan(2e-2)
    }
    // d/a = 5: order 5 falls on the first zero of the single-slit envelope (I_env = 0), the pattern has no peak there
    expect(out('O09', { nl, lam, m: 5, a }, 'env')).toBeLessThan(1e-30)
    const x5 = L * Math.tan(Math.asin(5 * lam * nl))
    expect(I[Math.round((x5 + half) / h)] / I[i0]).toBeLessThan(1e-4)
    // |mλ/d| > 1: no angle is offered
    expect(evalModel('O09', { nl, lam, m: 11, a }).outputs.find(o => o.id === 'th')!.value).toBeNull()
  })
})
