/**
 * The 26.49 models (docs/DEV_MANUAL_26_49.md §4): each template is simulated and checked against
 * hand-written textbook values and through the formula layer with the 26.48 thresholds (exact formulas
 * rel ≤ 1e-6, ledger ≤ 1e-8, event times ≤ 1e-9 s); formulas must not be offered where their assumptions
 * fail.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate, setTemplateGravity, templateGravity, TEMPLATES } from '../src/templates'
import type { Recording } from '../src/core/solver/simulation'
import { frameLedger, frameSolution, frameState, simulate } from '../src/core/solver/simulation'
import { recognize } from '../src/formula/situations'
import type { FormulaCard } from '../src/formula/match'
import { evaluateCard } from '../src/formula/match'
import { FORMULAS } from '../src/formula/library'
import { emptyScene } from '../src/core/scene/build'

const G = 9.8

function allCards(rec: Recording): FormulaCard[] {
  const cards: FormulaCard[] = []
  for (const s of recognize(rec)) {
    const sample = s.sample(s.tEvent ?? (s.t0 + s.t1) / 2)
    for (const f of FORMULAS.filter(f => f.situation === s.type)) cards.push(evaluateCard(f, s, sample, { digits: 8 }))
  }
  return cards
}

function expectCards(rec: Recording, mustMatch: string[], notApplicable: string[] = []) {
  const cards = allCards(rec)
  for (const c of cards) expect(c.verdict, `${c.key}: ${c.reason}`).not.toBe('deviate')
  for (const id of mustMatch) {
    const c = cards.find(c => c.formula.id === id && c.verdict === 'match')
    expect(c, `formula ${id} should match; got ${cards.filter(x => x.formula.id === id).map(x => x.verdict + ' ' + x.reason).join(' | ')}`).toBeTruthy()
  }
  for (const id of notApplicable) {
    const list = cards.filter(c => c.formula.id === id)
    expect(list.every(c => c.verdict === 'not-applicable' || c.verdict === 'no-measure'), `${id} should not apply: ${list.map(c => c.verdict).join()}`).toBe(true)
  }
  return cards
}

function ledgerDrift(rec: Recording): number {
  const L0 = frameLedger(rec, 0)
  let worst = 0, scale = 1
  for (let k = 0; k < rec.frameCount; k++) {
    const L = frameLedger(rec, k)
    worst = Math.max(worst, Math.abs(L.balance - L0.balance))
    scale = Math.max(scale, Math.abs(L.kinetic), Math.abs(L.gravity), Math.abs(L.spring))
  }
  return worst / scale
}

const events = (rec: Recording, type: string) => rec.events.filter(e => e.changes.some(c => c.type === type))

describe('vertical circle on a rope', () => {
  it('v₀ < √(5gL): the rope goes slack where and when theory says', () => {
    const L = 0.5, v0 = 4.5
    const rec = simulate(buildTemplate('vertical-circle-rope'))
    expect(rec.error).toBeNull()
    const slack = events(rec, 'slack')
    expect(slack.length).toBeGreaterThan(0)
    // Time from the bottom: t = ∫ L dφ / v(φ), v² = v₀² − 2gL(1 − cos φ) (Simpson, independent of the
    // formula layer)
    const phiS = Math.acos((2 * G * L - v0 * v0) / (3 * G * L))
    const N = 20000, hq = phiS / N
    let sum = 0
    for (let i = 0; i <= N; i++) {
      const f = L / Math.sqrt(v0 * v0 - 2 * G * L * (1 - Math.cos(i * hq)))
      sum += f * (i === 0 || i === N ? 1 : i % 2 ? 4 : 2)
    }
    expect(Math.abs(slack[0].t - sum * hq / 3)).toBeLessThan(1e-9)
    // No spurious event before the slack
    expect(rec.events[0].changes.some(c => c.type === 'slack')).toBe(true)
    const y = slack[0].after[1]
    expect(Math.abs(y - 1.2 - (v0 * v0 - 2 * G * L) / (3 * G))).toBeLessThan(1e-9)
    expectCards(rec, ['vc.r.T0', 'vc.r.slackv', 'vc.r.phiS', 'vc.r.hS', 'vc.r.vS', 'vc.r.tS', 'en.ledger'], ['vc.r.vtop', 'vc.r.Ttop'])
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })
  it('v₀ > √(5gL): full circles; speed and tension at the top', () => {
    const rec = simulate(buildTemplate('vertical-circle-rope', { v0: 5.2 }))
    expect(events(rec, 'slack').length).toBe(0)
    const cards = expectCards(rec, ['vc.r.T0', 'vc.r.vtop', 'vc.r.Ttop'], ['vc.r.tS', 'vc.r.phiS', 'vc.r.slackv'])
    expect(cards.find(c => c.formula.id === 'vc.r.Ttop')!.sim!).toBeGreaterThan(0)
    expect(cards.find(c => c.formula.id === 'vc.r.crit')!.theory).toBeCloseTo(Math.sqrt(5 * G * 0.5), 12)
  })
  it('a pendulum below the horizontal stays a pendulum (no vertical-circle formulas)', () => {
    const rec = simulate(buildTemplate('vertical-circle-rope', { v0: 2 }))
    const types = recognize(rec).map(s => s.type)
    expect(types).toContain('pendulum')
    expect(types).not.toContain('vcircle-rope')
  })
})

describe('vertical circle on a rod', () => {
  it('push at the top when v_top < √(gL), pull when larger, zero in between', () => {
    const push = expectCards(simulate(buildTemplate('vertical-circle-rod')), ['vc.d.F0', 'vc.d.vtop', 'vc.d.Ftop', 'vc.d.zero', 'en.ledger'])
    expect(push.find(c => c.formula.id === 'vc.d.Ftop')!.sim!).toBeLessThan(0)
    const pull = expectCards(simulate(buildTemplate('vertical-circle-rod', { v0: 5.5 })), ['vc.d.Ftop'], ['vc.d.zero'])
    expect(pull.find(c => c.formula.id === 'vc.d.Ftop')!.sim!).toBeGreaterThan(0)
    // Critical: v_top = √(gL) ⇔ v₀ = √(5gL): the rod force at the top vanishes
    const crit = allCards(simulate(buildTemplate('vertical-circle-rod', { v0: Math.sqrt(5 * G * 0.5) })))
    const top = crit.find(c => c.formula.id === 'vc.d.Ftop')!
    expect(Math.abs(top.sim!)).toBeLessThan(1e-8)
    expect(Math.abs(crit.find(c => c.formula.id === 'vc.d.vtop')!.sim! - Math.sqrt(G * 0.5))).toBeLessThan(1e-9)
  })
})

describe('movable pulley with two fixed pulleys', () => {
  it('a₁ = 2a₂, a₂ = (2m₁ − m₂)g/(4m₁ + m₂), T = 3m₁m₂g/(4m₁ + m₂), energy conserved', () => {
    const rec = simulate(buildTemplate('movable-pulley'))
    expect(rec.error).toBeNull()
    expectCards(rec, ['mp.rel', 'mp.a1', 'mp.a2', 'mp.T', 'mp.T1', 'mp.T2', 'en.ledger'])
    const sol = frameSolution(rec, 100)
    expect(Math.abs(sol.ropeTension[0] - 3 * 1 * 1.5 * G / 5.5)).toBeLessThan(1e-9)
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })
  it('the movable load is not mistaken for a projectile', () => {
    expect(recognize(simulate(buildTemplate('movable-pulley'))).map(s => s.type)).not.toContain('projectile')
  })
})

describe('movable wedge on a smooth floor', () => {
  it('horizontal momentum is conserved; wedge acceleration and normal force as derived', () => {
    const M = 3, m = 1, th = 30 * Math.PI / 180
    const rec = simulate(buildTemplate('movable-wedge'))
    expect(rec.error).toBeNull()
    expectCards(rec, ['wd.A', 'wd.arel', 'wd.N', 'wd.px', 'en.ledger'])
    const n = rec.system.n
    const iW = rec.system.model.byId.get('wedge')!.index, iB = rec.system.model.byId.get('block')!.index
    for (let k = 0; k < rec.frameCount; k += 50) {
      const X = frameState(rec, k)
      expect(Math.abs(M * X[3 * n + 3 * iW] + m * X[3 * n + 3 * iB])).toBeLessThan(1e-12)
    }
    const A = m * G * Math.sin(th) * Math.cos(th) / (M + m * Math.sin(th) ** 2)
    expect(Math.abs(Math.abs(frameSolution(rec, 10).acc[3 * iW]) - A) / A).toBeLessThan(1e-9)
  })
  it('a rough floor: the wedge formulas are not offered', () => {
    const s = buildTemplate('movable-wedge')
    s.contactPairs.push({ a: 'wedge', b: 'ground', muS: 0.5, muK: 0.4, restitution: 0 })
    const types = recognize(simulate(s)).map(x => x.type)
    expect(types).not.toContain('wedge')
  })
})

describe('two blocks joined by a spring', () => {
  it('common velocity at maximum compression, momentum, maximum elastic energy', () => {
    const m1 = 1, m2 = 2, v0 = 2
    const rec = simulate(buildTemplate('spring-blocks'))
    const cards = expectCards(rec, ['sb.p', 'sb.vc', 'sb.Ep', 'sb.x', 'sb.T', 'en.ledger'])
    expect(Math.abs(cards.find(c => c.formula.id === 'sb.vc')!.sim! - m1 * v0 / (m1 + m2))).toBeLessThan(1e-9)
    expect(Math.abs(cards.find(c => c.formula.id === 'sb.Ep')!.sim! - 0.5 * (m1 * m2 / (m1 + m2)) * v0 * v0) / 1.3333).toBeLessThan(1e-9)
  })
  it('a spring that starts stretched: the rest-length formula is not offered', () => {
    const s = buildTemplate('spring-blocks')
    s.bodies[2].position.x += 0.1
    expectCards(simulate(s), ['sb.p', 'sb.vc', 'sb.Ep'], ['sb.x'])
  })
})

describe('rolling with slipping (uniform cylinder, 2D)', () => {
  it('slips for t = v₀/(3μg), then rolls at 2v₀/3; heat = mv₀²/6', () => {
    const v0 = 3, mu = 0.2, m = 1
    const rec = simulate(buildTemplate('rolling-slip'))
    const stick = events(rec, 'stick')
    expect(Math.abs(stick[0].t - v0 / (3 * mu * G))).toBeLessThan(1e-9)
    const n = rec.system.n
    expect(Math.abs(stick[0].after[3 * n] - 2 * v0 / 3)).toBeLessThan(1e-9)
    const cards = expectCards(rec, ['rs.a', 'rs.beta', 'rs.t', 'rs.v', 'rs.cyl.t', 'rs.cyl.v', 'rs.Q', 'rl.a.slip', 'rl.vw', 'en.ledger'])
    expect(Math.abs(cards.find(c => c.formula.id === 'rs.Q')!.sim! - m * v0 * v0 / 6)).toBeLessThan(1e-9)
  })
  it('backspin or a non-uniform body: only the general formulas apply', () => {
    const s = buildTemplate('rolling-slip')
    s.bodies[1].angularVelocity = 10
    expectCards(simulate(s), ['rs.t', 'rs.v', 'rs.Q'], ['rs.cyl.t', 'rs.cyl.v'])
    const ring = buildTemplate('rolling-slip')
    ring.bodies[1].inertia = 1 * 0.15 * 0.15 // Thin ring I = mr²: t = v₀/(2μg)
    const rec = simulate(ring)
    expect(Math.abs(events(rec, 'stick')[0].t - 3 / (2 * 0.2 * G))).toBeLessThan(1e-9)
    expectCards(rec, ['rs.t', 'rs.v'], ['rs.cyl.t'])
  })
})

describe('variable force F₀ sin ωt', () => {
  it('velocity, position, impulse and work agree with the integrals', () => {
    const rec = simulate(buildTemplate('variable-force'))
    expectCards(rec, ['vf.J', 'vf.v', 'vf.x', 'vf.W', 'vf.sin.v', 'vf.sin.x', 'en.ledger'])
    expect(ledgerDrift(rec)).toBeLessThan(1e-8)
  })
  it('piecewise and state-dependent forces', () => {
    const s = buildTemplate('variable-force')
    const f = s.connectors.find(c => c.type === 'force')!
    if (f.type === 'force') f.expr = { x: 'if(t < 1.5, 4*t, 2)', y: '0' }
    expectCards(simulate(s), ['vf.J', 'vf.v', 'vf.x', 'vf.W'], ['vf.sin.v', 'vf.sin.x'])
    if (f.type === 'force') f.expr = { x: '3 - 0.5*vx', y: '0' }
    expectCards(simulate(s), [], ['vf.v', 'vf.x', 'vf.J'])
  })
})

describe('default gravity', () => {
  it('one setting drives every template and new scenes', () => {
    const before = templateGravity()
    try {
      setTemplateGravity(9.81)
      expect(emptyScene().settings.gravity).toEqual({ x: 0, y: -9.81 })
      for (const t of TEMPLATES) {
        const g = buildTemplate(t.id).settings.gravity
        const gp = t.params.find(p => p.key === 'g')
        // Top-view templates (collisions) have no gravity at all; every other one uses the default
        if (g.x === 0 && g.y === 0) { expect(gp, t.id).toBeUndefined(); continue }
        expect(gp, `${t.id} has a g parameter`).toBeTruthy()
        expect(gp!.value).toBe(9.81)
        expect(g).toEqual({ x: 0, y: -9.81 })
      }
    } finally {
      setTemplateGravity(before)
    }
  })
})
