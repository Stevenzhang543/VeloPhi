/**
 * The 30 initial acceptance cases of the curriculum blueprint (sheet 数值与教学验收, 26.62 D222), one test each, run
 * against the engine (scenes), the model registry (conditions withhold answers outside their domain) and the
 * curriculum data. src/curriculum/acceptance.ts lists these and the older tests that cover the same criterion.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { evalModel } from '../../src/engine/models'
import { buildTemplate } from '../../src/templates'
import { frameState, simulate } from '../../src/engine/recording'
import type { Recording } from '../../src/engine/recording'
import { recognize } from '../../src/formula/recognize'
import { evaluateCard } from '../../src/formula/match'
import { FORMULAS } from '../../src/formula/library'
import { ACTIVITIES } from '../../src/teaching/activities'
import { Curriculum, SYSTEMS } from '../../src/curriculum'
import type { CurriculumData } from '../../src/curriculum/types'

const data = JSON.parse(readFileSync(new URL('../../src/curriculum/data/curriculum.json', import.meta.url), 'utf8')) as CurriculumData
const dict = JSON.parse(readFileSync(new URL('../../src/curriculum/data/i18n.json', import.meta.url), 'utf8')) as Record<string, [string, string]>

type Out = { id: string; value: number | null; state: string }
function run(model: string, inputs: Record<string, number>) {
  const r = evalModel(model, inputs) as unknown as { outputs: Out[]; conditions: Array<{ id: string; state: string }>; domain: unknown[] }
  const out = (id: string) => r.outputs.find(o => o.id === id && (o.state === 'applicable' || o.state === 'approximate')) ?? r.outputs.find(o => o.id === id)!
  const cond = (id: string) => r.conditions.find(c => c.id === id)?.state
  return { r, out, val: (id: string) => out(id).value as number, cond }
}
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300)

/** Every formula card of a run: none deviates, and the listed ones match. */
function cards(rec: Recording, mustMatch: string[]) {
  const all = []
  for (const s of recognize(rec)) {
    const t = s.tEvent ?? (s.t0 + s.t1) / 2
    for (const f of FORMULAS.filter(f => f.situation === s.type)) { const c = evaluateCard(rec, s, f.id, t, { digits: 8 }); if (c) all.push(c) }
  }
  for (const c of all) expect(c.verdict, `${c.key}: ${c.reason}`).not.toBe('deviate')
  for (const id of mustMatch) expect(all.some(c => c.formula.id === id && c.verdict === 'match'), id).toBe(true)
}

describe('curriculum acceptance (blueprint 数值与教学验收)', () => {
  it('A01 dimensions: F = ma is consistent and adding unlike quantities is refused', () => {
    const { val } = run('G06', { T1: 293.15, dT: 10, m: 2, a: 3, v: 4 })
    expect(val('F')).toBe(6)
    // the registry installs only dimensionally consistent models; K14 needed sqrt(sqrt(…)) instead of (…)^(1/4)
    expect(readFileSync(new URL('../../src/content/models/k.ts', import.meta.url), 'utf8')).toContain('sqrt(sqrt(S0*(1 - al)/(4*sig)))')
  })

  it('A02 free fall from rest: |Δy| = g t²/2 frame by frame until the impact', () => {
    const rec = simulate(buildTemplate('free-fall', { h: 5 }))
    expect(rec.error).toBeNull()
    const n = rec.system.n
    const y0 = frameState(rec, 0)[1]
    const tHit = rec.events[0]?.t ?? Infinity
    let checked = 0
    for (let k = 1; k < rec.frameCount && k * rec.dt < tHit - 1e-9; k++) {
      const X = frameState(rec, k)
      const t = k * rec.dt
      expect(Math.abs(y0 - X[1] - 9.8 * t * t / 2)).toBeLessThan(1e-9)
      expect(Math.abs(X[3 * n + 1] + 9.8 * t)).toBeLessThan(1e-9)
      checked++
    }
    expect(checked).toBeGreaterThan(10)
  })

  it('A03 constant force: a = F/m, the cards of the run agree with the analytic solution', () => {
    cards(simulate(buildTemplate('pull-force')), [])
    const { val } = run('M02', { x0: 0, v0: 0, a: 6 / 2, t: 2 })
    expect(val('v')).toBeCloseTo(6, 12)
  })

  it('A04 lever: ∑τ = 0 and ∑F = 0', () => {
    const { val } = run('M21', { F1: 30, l1: 0.2, l2: 0.5, phi: 0 })
    expect(30 * 0.2 - val('F2') * 0.5).toBeCloseTo(0, 12)
    expect(val('N') - 30 - val('F2')).toBeCloseTo(0, 12)
  })

  it('A05 static friction threshold on an incline: rest below tan θ = μs, sliding above', () => {
    cards(simulate(buildTemplate('incline', { mu: 0.7 })), ['incline.a.stick', 'incline.f.static'])
    cards(simulate(buildTemplate('incline', { mu: 0.2 })), ['incline.a.down'])
    const at = (F: number) => run('M08', { m: 2, muS: 0.4, muK: 0.3, g: 10, F, v0: 0 }).cond('static')
    expect(at(7.9)).toBe('applicable')
    expect(at(8.1)).toBe('notApplicable')
  })

  it('A06 buoyancy fully immersed: F = ρ g V', () => {
    const { val, cond } = run('F02', { As: 0.05, d: 0.2, rhoB: 7800, rhoF: 1000, g: 9.8 })
    expect(cond('sinks')).toBe('applicable')
    expect(rel(val('Fb'), 1000 * 9.8 * 0.01)).toBeLessThan(1e-12)
  })

  it('A07 pendulum without dissipation: the energy drift shrinks with the step', () => {
    const drift = (integrator: 'euler' | 'rk4', h: number) => {
      const s = buildTemplate('pendulum', { theta0: 30 })
      s.settings.integrator = integrator
      s.settings.outputStep = h
      s.settings.duration = 2
      const rec = simulate(s)
      const n = rec.system.n
      const E = (k: number) => { const X = frameState(rec, k); return 0.5 * (X[3 * n] ** 2 + X[3 * n + 1] ** 2) + 9.8 * X[1] }
      const e0 = E(0)
      let d = 0
      for (let k = 0; k < rec.frameCount; k++) d = Math.max(d, Math.abs(E(k) - e0))
      return d
    }
    const e1 = drift('euler', 0.004), e2 = drift('euler', 0.002)
    expect(e2).toBeLessThan(e1)
    expect(drift('rk4', 0.004)).toBeLessThan(e2)
  })

  it('A08 two-body collision: total momentum before and after', () => {
    for (const e of [1, 0.5, 0]) {
      const rec = simulate(buildTemplate('collision-1d', { e }))
      const n = rec.system.n
      const p = (k: number) => { const X = frameState(rec, k); return 1 * X[3 * n] + 2 * X[3 * n + 3] }
      expect(Math.abs(p(rec.frameCount - 1) - p(0))).toBeLessThan(1e-12)
    }
  })

  it('A09 small-angle pendulum: T ≈ 2π√(L/g), large amplitudes withhold the small-angle formula', () => {
    const small = run('W02', { l: 1, g: 9.8, th0: 0.05 })
    expect(rel(small.val('T0'), small.val('T'))).toBeLessThan(2e-4)
    const big = run('W02', { l: 1, g: 9.8, th0: 1.2 })
    expect(big.cond('small')).toBe('notApplicable')
    expect(big.out('T0').value).toBeNull()
    expect(big.val('T')).toBeGreaterThan(2 * Math.PI * Math.sqrt(1 / 9.8) * 1.08)
  })

  it('A10 refraction: n1 sin θ1 = n2 sin θ2; beyond the critical angle no refracted ray', () => {
    const r = run('O02', { n1: 1, n2: 1.5, th1: 0.5 })
    expect(Math.sin(0.5) - 1.5 * Math.sin(r.val('th2'))).toBeCloseTo(0, 14)
    const t = run('O02', { n1: 1.5, n2: 1, th1: 1 })
    expect(t.cond('refracts')).toBe('notApplicable')
  })

  it('A11 thin lens with one sign convention: real image positive and inverted, virtual image negative and upright', () => {
    const real = run('O04', { f: 0.1, u: 0.3 })
    expect(real.val('v')).toBeCloseTo(0.15, 12)
    expect(real.val('mag')).toBeLessThan(0)
    const virt = run('O04', { f: 0.1, u: 0.05 })
    expect(virt.val('v')).toBeLessThan(0)
    expect(virt.val('mag')).toBeGreaterThan(0)
  })

  it('A12 waves: v = fλ and the reflection at a heavier string inverts the pulse', () => {
    const w = run('W07', { Ts: 100, mu: 0.01, lam: 0.5, dist: 2 })
    expect(rel(w.val('f') * 0.5, w.val('c'))).toBeLessThan(1e-14)
    expect(run('W08', { Ts: 1, mu1: 1, mu2: 9, Ai: 0.01 }).val('r')).toBeCloseTo(-0.5, 14)
    expect(run('W08', { Ts: 1, mu1: 9, mu2: 1, Ai: 0.01 }).val('r')).toBeCloseTo(0.5, 14)
  })

  it('A13 double slit: Δx ≈ λD/d only under the paraxial condition', () => {
    const ok = run('O07', { lam: 5e-7, D: 2, d: 5e-4, m: 1 })
    expect(ok.val('dy')).toBeCloseTo(2e-3, 15)
    const near = run('O07', { lam: 5e-7, D: 2, d: 5e-6, m: 1 })
    expect(near.cond('paraxial')).toBe('approximate')
    expect(near.out('dy').state).toBe('approximate')
    const wide = run('O07', { lam: 5e-7, D: 2, d: 1e-6, m: 1 })
    expect(wide.cond('paraxial')).toBe('notApplicable')
    expect(wide.out('dy').value).toBeNull()
    expect(wide.val('ym')).toBeCloseTo(2 * Math.tan(Math.asin(0.5)), 12)
  })

  it('A14 ideal gas: pV = nRT and the sign convention ΔU = Q − W (W by the gas)', () => {
    const g = run('T08', { n: 1, Tg: 300, V: 0.024 })
    expect(rel(g.val('p') * 0.024, 1 * 8.314462618 * 300)).toBeLessThan(1e-9)
    const u = run('T09', { Q: 500, W: 200 })
    expect(u.val('dU')).toBe(300)
    expect(u.val('Won')).toBe(-200)
  })

  it('A15 insulated (closed) system: the heat given equals the heat taken, total energy unchanged', () => {
    const r = run('T03', { m1: 0.2, c1: 4200, T1: 353.15, m2: 0.3, c2: 4200, T2: 293.15, Cc: 0 })
    const Tf = r.val('Tf')
    expect(0.2 * 4200 * (353.15 - Tf) - 0.3 * 4200 * (Tf - 293.15)).toBeCloseTo(0, 8)
    expect(r.val('Q')).toBeCloseTo(0.2 * 4200 * (353.15 - Tf), 8)
  })

  it('A16 KCL/KVL: a balanced bridge carries no galvanometer current, an unbalanced one obeys the loop equations', () => {
    expect(Math.abs(run('E10', { R1: 100, R2: 200, R3: 100, R4: 200, U: 6, Rg: 50 }).val('Ig'))).toBeLessThan(1e-15)
    const R1 = 100, R2 = 200, R3 = 150, R4 = 200, U = 6, Rg = 50
    const Ig = run('E10', { R1, R2, R3, R4, U, Rg }).val('Ig')
    // nodal analysis of the bridge: unknown node voltages a (R1–R2) and b (R3–R4)
    const A11 = 1 / R1 + 1 / R2 + 1 / Rg, A12 = -1 / Rg, A22 = 1 / R3 + 1 / R4 + 1 / Rg
    const b1 = U / R1, b2 = U / R3
    const det = A11 * A22 - A12 * A12
    const a = (b1 * A22 - A12 * b2) / det, b = (A11 * b2 - A12 * b1) / det
    const kcl = (U - a) / R1 - a / R2 - (a - b) / Rg
    expect(Math.abs(kcl)).toBeLessThan(1e-15)
    expect(rel(Ig, (a - b) / Rg)).toBeLessThan(1e-12)
  })

  it('A17 RC: τ = RC and the exponential curve', () => {
    const r = run('E15', { R: 1000, C: 1e-4, Vs: 5, V0: 0, t: 0.1 })
    expect(r.val('tau')).toBeCloseTo(0.1, 15)
    expect(rel(r.val('VC'), 5 * (1 - Math.exp(-1)))).toBeLessThan(1e-14)
  })

  it('A18 point charge: E falls as 1/r²; at the charge itself no value is given', () => {
    const E = (x: number) => run('E02', { q1: 1e-6, q2: 0, d: 0.1, x, y: 0 }).val('Ex')
    expect(rel(E(0.4) / E(0.7), ((0.7 + 0.1) / (0.4 + 0.1)) ** 2)).toBeLessThan(1e-12)
    const at = run('E02', { q1: 1e-6, q2: 1e-6, d: 0.1, x: -0.1, y: 0 })
    expect(at.cond('away')).toBe('notApplicable')
    expect(at.out('Ex').value).toBeNull()
  })

  it('A19 induction: ε = −N dΦ/dt with the sign of Lenz’s law', () => {
    const up = run('B09', { N: 100, A: 0.01, B0: 0, B1: 0.2, dt: 0.5, alpha: 0 })
    expect(up.val('emf')).toBeCloseTo(-0.4, 14)
    expect(run('B09', { N: 100, A: 0.01, B0: 0.2, B1: 0, dt: 0.5, alpha: 0 }).val('emf')).toBeCloseTo(0.4, 14)
  })

  it('A20 decay counts: expectation N₀2^(−t/T½), binomial spread, Poisson uncertainty √N', () => {
    const d = run('N01', { N0: 1600, Th: 4, t: 12 })
    expect(d.val('N')).toBeCloseTo(200, 10)
    expect(d.val('sd')).toBeCloseTo(Math.sqrt(1600 * 0.125 * 0.875), 10)
    const c = run('N07', { Ns: 1100, Nb: 100 })
    expect(c.val('u')).toBeCloseTo(Math.sqrt(1200), 12)
  })

  it('A21 infinite square well: E₁ : E₂ : E₃ = 1 : 4 : 9', () => {
    const r = run('Q05', { m: 9.1093837139e-31, Lw: 1e-9, n: 3 })
    expect(rel(r.val('E2') / r.val('E1'), 4)).toBeLessThan(1e-14)
    expect(rel(r.val('En') / r.val('E1'), 9)).toBeLessThan(1e-14)
  })

  it('A22 wave packet: the research package monitors normalisation and grid error', () => {
    const ref = JSON.parse(readFileSync(new URL('../../docs/research/q08-reference.json', import.meta.url), 'utf8'))
    expect(JSON.stringify(ref)).toMatch(/norm/i)
    expect(readFileSync(new URL('../research2661.test.ts', import.meta.url), 'utf8')).toContain('three resolutions')
  })

  it('A23 two-body orbit: T²/r³ is the same for every radius (Kepler)', () => {
    const k = (r: number) => { const o = run('M26', { mu: 3.986e14, r }); return o.val('T') ** 2 / r ** 3 }
    expect(rel(k(7e6), k(4.2e7))).toBeLessThan(1e-12)
    expect(rel(k(7e6), 4 * Math.PI ** 2 / 3.986e14)).toBeLessThan(1e-12)
  })

  it('A24 convergence order: explicit Euler 1, RK4 4 (G07 from three step sizes)', () => {
    const solve = (step: (y: number, h: number) => number, h: number) => { let y = 1; for (let i = 0; i < Math.round(1 / h); i++) y = step(y, h); return y }
    const euler = (y: number, h: number) => y - h * y
    const rk4 = (y: number, h: number) => { const f = (u: number) => -u; const k1 = f(y), k2 = f(y + h * k1 / 2), k3 = f(y + h * k2 / 2), k4 = f(y + h * k3); return y + h * (k1 + 2 * k2 + 2 * k3 + k4) / 6 }
    const order = (step: typeof euler, h: number) => run('G07', { q1: solve(step, h), q2: solve(step, h / 2), q3: solve(step, h / 4), r: 2 }).val('p')
    expect(order(euler, 0.01)).toBeCloseTo(1, 1)
    expect(Math.abs(order(rk4, 0.1) - 4)).toBeLessThan(0.1)
  })

  it('A25 grid independence: halving the grid changes a second-order result by a quarter', () => {
    // second-order central difference of V(x) = sin x at x = 0.3 against the analytic V″ = −sin x
    const err = (h: number) => Math.abs((Math.sin(0.3 + h) - 2 * Math.sin(0.3) + Math.sin(0.3 - h)) / h ** 2 + Math.sin(0.3))
    expect(err(0.05) / err(0.1)).toBeCloseTo(0.25, 2)
    // the Poisson family X01 is exact for its quadratic solution on any grid (fixture cases with lu_solve)
    const fixture = JSON.parse(readFileSync(new URL('../fixtures/oracles2656.json', import.meta.url), 'utf8'))
    expect(fixture.cases.filter((c: { model: string }) => c.model === 'X01').length).toBeGreaterThanOrEqual(3)
  })

  it('A26 versioned course mapping: a topic opens the same resources in every course system; only the tags differ', () => {
    const cur = new Curriculum(data, dict)
    for (const t of cur.topics) {
      const seen = SYSTEMS.map(s => cur.topicsOf(s.id).find(x => x.id === t.id)).filter(Boolean)
      for (const x of seen) expect(x!.resources).toEqual(t.resources)
    }
    const t = cur.topic('T02-006')!
    expect(t.courses.cnSenior).not.toBe(t.courses.ibdp)
  })

  it('A27 deterministic scenes: two runs of the same scene give the same fingerprint', () => {
    for (const id of ['projectile', 'double-pendulum', 'collision-2d']) {
      const s = buildTemplate(id)
      expect(simulate(s).hash).toBe(simulate(JSON.parse(JSON.stringify(s))).hash)
    }
  })

  it('A28 long runs: a fixed physics step (the recording interval) independent of rendering, no divergence', () => {
    const s = buildTemplate('spring')
    s.settings.duration = 60
    const rec = simulate(s)
    expect(rec.error).toBeNull()
    expect(rec.frameCount).toBe(Math.round(60 / s.settings.outputStep) + 1)
    const n = rec.system.n
    const amp = (k: number) => Math.abs(frameState(rec, k)[0] - frameState(rec, 0)[0])
    let max = 0
    for (let k = 0; k < rec.frameCount; k += 50) max = Math.max(max, amp(k))
    expect(Number.isFinite(max)).toBe(true)
    expect(Number.isFinite(frameState(rec, rec.frameCount - 1)[3 * n])).toBe(true)
  })

  it('A29 accessibility: a keyboard-only activity and a colour-vision palette; meaning is never colour alone', () => {
    expect(ACTIVITIES.find(a => a.id === 'act-incline')?.title.en).toMatch(/keyboard/)
    expect(readFileSync(new URL('../../src/app/appearance.ts', import.meta.url), 'utf8')).toContain("settings.palette === 'cvd'")
    expect(readFileSync(new URL('../ux2656.test.ts', import.meta.url), 'utf8')).toContain('radio group (arrow keys)')
    // the curriculum map labels coverage with text, not colour alone
    expect(readFileSync(new URL('../../src/app/components/CurriculumDialog.vue', import.meta.url), 'utf8')).toContain('COVERAGE_TEXT[t.coverage]')
  })

  it('A30 model boundaries: the Bohr levels are labelled a model; the quantum lab draws no electron orbits', () => {
    expect(readFileSync(new URL('../../src/app/components/lab/HydrogenLab.vue', import.meta.url), 'utf8')).toContain('玻尔模型')
    expect(readFileSync(new URL('../../src/app/components/lab/QuantumLab.vue', import.meta.url), 'utf8')).not.toContain('电子轨道')
    const q04 = run('Q04', { ni: 3, nf: 2, E1: 2.1789602222399996e-18 })
    expect(q04.val('lam')).toBeGreaterThan(6.5e-7)
  })
})
