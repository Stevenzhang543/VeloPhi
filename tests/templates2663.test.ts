/**
 * 26.63 (D231, D234): the new templates against their closed forms — the rope that breaks at its tension limit, and the
 * illuminating cases (drop and throw, heavy and light, monkey and hunter, growing pull, two blocks pushed).
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import { simulate } from '../src/engine/recording'
import type { Recording } from '../src/engine/recording'
import { valuesAt, valuesAtEvent } from '../src/engine/observe'

const run = (id: string, v: Record<string, number> = {}, duration?: number): Recording => {
  const rec = simulate(buildTemplate(id, v), duration ? { duration } : {})
  expect(rec.error).toBeFalsy()
  return rec
}
const at = (rec: Recording, t: number, ids: string[]) => Array.from(valuesAt(rec, t, ids))
const side = (rec: Recording, e: Recording['events'][number], s: 'before' | 'after', ids: string[]) => Array.from(valuesAtEvent(rec, rec.events.indexOf(e), s, ids))
const eventsOf = (rec: Recording, type: string) => rec.events.filter(e => e.changes.some(c => c.type === type))

describe('26.63 templates', () => {
  it('rope-break-pendulum: the rope breaks where T = mg(3cos φ − 2cos θ₀) reaches T_max', () => {
    const g = 9.8, m = 0.5, L = 1, th0 = 60 * Math.PI / 180, Tmax = 9, H = 2
    const rec = run('rope-break-pendulum', { g, m, L, theta0: 60, Tmax, H })
    const br = eventsOf(rec, 'break')
    expect(br.length).toBe(1)
    const cos = (Tmax / (m * g) + 2 * Math.cos(th0)) / 3
    const t = br[0].t
    const [x, y, v, T] = side(rec, br[0], 'before', ['bob.x', 'bob.y', 'bob.v', 'rope.T'])
    expect(y).toBeCloseTo(H - L * cos, 6)
    expect(Math.abs(x)).toBeCloseTo(L * Math.sqrt(1 - cos * cos), 6)
    expect(v).toBeCloseTo(Math.sqrt(2 * g * L * (cos - Math.cos(th0))), 6)
    expect(T).toBeCloseTo(Tmax, 5)
    // afterwards no rope force: a projectile (vx constant, T = 0)
    const [vx0, T0] = side(rec, br[0], 'after', ['bob.vx', 'rope.T'])
    expect(T0).toBe(0)
    const [vx1, T1] = at(rec, t + 0.2, ['bob.vx', 'rope.T'])
    expect(vx1).toBeCloseTo(vx0, 9)
    expect(T1).toBe(0)
    rec.session.free()
  })

  it('rope-break-pendulum: a rope that bears the largest tension does not break', () => {
    const rec = run('rope-break-pendulum', { Tmax: 9.81, theta0: 60, m: 0.5, g: 9.8 }, 3)
    expect(eventsOf(rec, 'break').length).toBe(0)
    rec.session.free()
  })

  it('rope-break-circle: breaks at m·v²/r = T_max and leaves along the tangent in a straight line', () => {
    const r = 0.5, m = 0.2, Tmax = 3.6, P = 0.4, v0 = 1
    const rec = run('rope-break-circle', { r, m, Tmax, P, v0 })
    const br = eventsOf(rec, 'break')
    expect(br.length).toBe(1)
    const vb = Math.sqrt(Tmax * r / m)
    const t = br[0].t
    expect(t).toBeCloseTo((vb - v0) * m / P, 6)
    const [x, y, vx, vy] = side(rec, br[0], 'after', ['ball.x', 'ball.y', 'ball.vx', 'ball.vy'])
    expect(Math.hypot(x, y)).toBeCloseTo(r, 7)
    expect(Math.hypot(vx, vy)).toBeCloseTo(vb, 6)
    // the velocity is tangent at the break, and its direction never changes afterwards
    expect(Math.abs(x * vx + y * vy)).toBeLessThan(1e-6)
    const [x2, y2, vx2, vy2] = at(rec, t + 0.15, ['ball.x', 'ball.y', 'ball.vx', 'ball.vy'])
    expect(Math.abs(vx2 * vy - vy2 * vx)).toBeLessThan(1e-7)
    expect(Math.abs((x2 - x) * vy - (y2 - y) * vx)).toBeLessThan(1e-7)
    expect(Math.hypot(x2, y2)).toBeGreaterThan(r + 0.05)
    rec.session.free()
  })

  it('drop-vs-throw: both balls land together at √(2h/g); B has gone v₀t', () => {
    const h = 1.25, g = 9.8, v0 = 3
    const rec = run('drop-vs-throw', { h, g, v0 })
    const hits = rec.events.filter(e => e.changes.some(c => c.type === 'impact' || c.type === 'touch'))
    const t = Math.sqrt(2 * h / g)
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits[0].t).toBeCloseTo(t, 8)
    const [ya, yb, xb] = at(rec, t / 2, ['A.y', 'B.y', 'B.x'])
    expect(ya).toBeCloseTo(yb, 10)
    expect(xb).toBeCloseTo(v0 * t / 2, 9)
    rec.session.free()
  })

  it('fall-two-masses: together without drag; the heavy ball first with drag', () => {
    const h = 2, g = 9.8
    const vac = run('fall-two-masses', { h, g, b: 0 })
    const [y1, y2] = at(vac, 0.5, ['heavy.y', 'light.y'])
    expect(y1).toBeCloseTo(y2, 10)
    expect(y1).toBeCloseTo(h + 0.06 - 0.5 * g * 0.25, 9)
    vac.session.free()
    const b = 0.5, m1 = 2, m2 = 0.2
    const air = run('fall-two-masses', { h, g, b, m1, m2 })
    // v(t) = (mg/b)(1 − e^(−bt/m)); y = y₀ − (mg/b)(t − (m/b)(1 − e^(−bt/m)))
    const yOf = (m: number, t: number) => h + 0.06 - (m * g / b) * (t - (m / b) * (1 - Math.exp(-b * t / m)))
    const [a1, a2] = at(air, 0.5, ['heavy.y', 'light.y'])
    expect(a1).toBeCloseTo(yOf(m1, 0.5), 8)
    expect(a2).toBeCloseTo(yOf(m2, 0.5), 8)
    expect(a1).toBeLessThan(a2)
    air.session.free()
  })

  it('monkey-hunter: the ball meets the falling target at t = √(d² + h²)/v₀ for different speeds', () => {
    for (const v0 of [8, 10, 20]) {
      const d = 4, h = 3, g = 9.8
      const rec = run('monkey-hunter', { d, h, v0, g })
      const hit = rec.events.find(e => e.changes.some(c => (c.type === 'impact' || c.type === 'touch') && c.bodies.includes('bullet') && c.bodies.includes('monkey')))
      expect(hit, `hit at v0 = ${v0}`).toBeTruthy()
      // contact when the centres are r₁ + r₂ apart: the closing speed along the line of sight is v₀
      expect(hit!.t).toBeCloseTo((Math.hypot(d, h) - 0.08) / v0, 6)
      rec.session.free()
    }
  })

  it('ramp-pull: static friction equals the pull until μs·mg, then drops to μk·mg', () => {
    const m = 1, muS = 0.5, muK = 0.4, k = 2, g = 9.8
    const rec = run('ramp-pull', { m, muS, muK, k, g })
    const slip = eventsOf(rec, 'slip')
    expect(slip.length).toBe(1)
    const t1 = muS * m * g / k
    expect(slip[0].t).toBeCloseTo(t1, 7)
    const [f, F, ax] = at(rec, 1, ['contact.block|ground.f', 'pull.F', 'block.ax'])
    expect(F).toBeCloseTo(k * 1, 9)
    expect(f).toBeCloseTo(k * 1, 9)
    expect(ax).toBeCloseTo(0, 9)
    const [f2, ax2] = at(rec, t1 + 0.3, ['contact.block|ground.f', 'block.ax'])
    expect(f2).toBeCloseTo(muK * m * g, 8)
    expect(ax2).toBeCloseTo((k * (t1 + 0.3) - muK * m * g) / m, 7)
    rec.session.free()
  })

  it('two-blocks-push: the contact force is F·m_B/(m_A + m_B)', () => {
    const F = 6, mA = 2, mB = 1
    const rec = run('two-blocks-push', { F, mA, mB })
    const [N, aA, aB] = at(rec, 0.5, ['contact.A|B.N', 'A.ax', 'B.ax'])
    expect(aA).toBeCloseTo(F / (mA + mB), 9)
    expect(aB).toBeCloseTo(F / (mA + mB), 9)
    expect(N).toBeCloseTo(F * mB / (mA + mB), 9)
    rec.session.free()
  })
})
