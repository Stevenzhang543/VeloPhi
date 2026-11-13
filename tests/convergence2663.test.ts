/**
 * 26.63 (D237): the convergence study of a scene — observed orders of the fixed-step methods against the exact
 * solver, on a large-angle pendulum (smooth motion) and on a ball that bounces within the interval.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import { convergenceStudy, studyCsv, studySteps } from '../src/analysis/convergence'

describe('convergence study (26.63)', () => {
  const pendulum = () => buildTemplate('vertical-circle-rod', { L: 0.5, v0: 3, m: 0.2 })

  it('steps halve and divide T exactly', () => {
    const st = studySteps(1, 0.02, 4)
    expect(st.length).toBe(4)
    expect(st[0]).toBeCloseTo(0.02, 12)
    for (let k = 1; k < st.length; k++) expect(st[k - 1] / st[k]).toBeCloseTo(2, 12)
    expect(Number.isInteger(Math.round(1 / st[3]))).toBe(true)
  })

  it('explicit Euler is first order', () => {
    const s = convergenceStudy(buildTemplate('spring', {}), { method: 'euler', quantity: 'block.x', t: 1, h0: 0.0125, levels: 5 })
    expect(s.rows.length).toBe(5)
    expect(s.order).not.toBeNull()
    expect(s.order!).toBeGreaterThan(0.9)
    expect(s.order!).toBeLessThan(1.15)
    // errors fall monotonically
    for (let k = 1; k < s.rows.length; k++) expect(s.rows[k].error).toBeLessThan(s.rows[k - 1].error)
  })

  it('classical RK4 and the Gauss method are fourth order on smooth motion', () => {
    for (const method of ['rk4', 'gauss4'] as const) {
      const s = convergenceStudy(pendulum(), { method, quantity: 'ball.x', t: 1, h0: 0.05, levels: 5 })
      // the asymptotic order: at the finest steps, and no longer changing
      expect(s.order, method).not.toBeNull()
      expect(s.settled, method).toBe(true)
      expect(s.order!, method).toBeGreaterThan(3.7)
      expect(s.order!, method).toBeLessThan(4.3)
      expect(s.formal).toBe(4)
    }
  })

  it('the Gauss method keeps the energy drift far below Euler at the same step', () => {
    const e = convergenceStudy(pendulum(), { method: 'euler', quantity: 'ball.x', t: 0.5, h0: 0.005, levels: 2 })
    const g = convergenceStudy(pendulum(), { method: 'gauss4', quantity: 'ball.x', t: 0.5, h0: 0.005, levels: 2 })
    expect(e.rows[0].drift).not.toBeNull()
    expect(g.rows[0].drift!).toBeLessThan(e.rows[0].drift! * 1e-4)
  })

  it('the time-stepping solvers converge at first order (rope pendulum)', () => {
    const scene = buildTemplate('pendulum', { L: 1, theta0: 40, m: 0.5 })
    for (const method of ['moreau', 'softstep'] as const) {
      const s = convergenceStudy(scene, { method, quantity: 'bob.x', t: 0.5, h0: 1 / 120, levels: 4 })
      expect(s.rows.at(-1)!.error, method).toBeLessThan(s.rows[0].error)
      expect(s.order, method).not.toBeNull()
      expect(s.order!, method).toBeGreaterThan(0.6)
      expect(s.order!, method).toBeLessThan(2.4)
    }
  })

  it('the manifest and the CSV repeat the study', () => {
    const s = convergenceStudy(pendulum(), { method: 'rk4', quantity: 'ball.x', t: 0.5, h0: 0.02, levels: 3 })
    expect(s.manifest.format).toBe('velophi-convergence')
    expect((s.manifest.steps as number[]).length).toBe(3)
    const csv = studyCsv(s)
    expect(csv.split('\n').filter(l => l && !l.startsWith('#')).length).toBe(1 + 3)
    expect(csv).toContain('h,steps,value,error,order,self_order,energy_drift,events')
  })
})
