/**
 * The eight acceptance scenes (docs/DEV_MANUAL_26_48.md §7). Each scene is simulated from its template
 * and checked twice: against hand-written textbook values here, and through the formula layer (every
 * applicable exact formula must agree within 1e-6; approximations are graded).
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import type { Recording } from '../src/core/solver/simulation'
import { frameLedger, frameState, simulate } from '../src/core/solver/simulation'
import { recognize } from '../src/formula/situations'
import type { FormulaCard } from '../src/formula/match'
import { evaluateCard } from '../src/formula/match'
import { FORMULAS } from '../src/formula/library'

const G = 9.8
const rad = (d: number) => (d * Math.PI) / 180

function allCards(rec: Recording): FormulaCard[] {
  const cards: FormulaCard[] = []
  for (const s of recognize(rec)) {
    const sample = s.sample(s.tEvent ?? (s.t0 + s.t1) / 2)
    for (const f of FORMULAS.filter(f => f.situation === s.type)) cards.push(evaluateCard(f, s, sample, { digits: 8 }))
  }
  return cards
}

function expectCards(rec: Recording, mustMatch: string[]) {
  const cards = allCards(rec)
  for (const c of cards) {
    expect(c.verdict, `${c.key}: ${c.reason}`).not.toBe('deviate')
  }
  for (const id of mustMatch) {
    const c = cards.find(c => c.formula.id === id && c.verdict === 'match')
    expect(c, `formula ${id} should be matched; got ${cards.filter(x => x.formula.id === id).map(x => x.verdict + ' ' + x.reason).join(' | ')}`).toBeTruthy()
  }
  return cards
}

function eventTimes(rec: Recording, type: string): number[] {
  return rec.events.filter(e => e.changes.some(c => c.type === type)).map(e => e.t)
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300)

describe('1 incline slider', () => {
  it('μ = 0.2 slides with a = g(sinθ − μcosθ)', () => {
    const rec = simulate(buildTemplate('incline', { mu: 0.2 }))
    expect(rec.error).toBeNull()
    expectCards(rec, ['incline.a.down', 'incline.N', 'incline.f.kinetic', 'incline.v', 'incline.s', 'en.ledger'])
  })
  it('μ = 0 slides with a = g sinθ', () => {
    expectCards(simulate(buildTemplate('incline', { mu: 0 })), ['incline.a.down', 'incline.s'])
  })
  it('μ = 0.7 > tanθ stays at rest with f = mg sinθ', () => {
    const rec = simulate(buildTemplate('incline', { mu: 0.7 }))
    const cards = expectCards(rec, ['incline.a.stick', 'incline.f.static'])
    expect(cards.find(c => c.formula.id === 'incline.a.down')!.verdict).toBe('not-applicable')
  })
})

describe('2 board and block', () => {
  it('common speed, relative slide and heat', () => {
    const rec = simulate(buildTemplate('board-block'))
    const m = 1, M = 2, mu1 = 0.4, mu2 = 0.1, v0 = 4
    const a2 = (mu1 * m * G - mu2 * (M + m) * G) / M
    const t1 = v0 / (mu1 * G + a2)
    const stick = eventTimes(rec, 'stick')
    expect(Math.abs(stick[0] - t1)).toBeLessThan(1e-9)
    const vc = a2 * t1
    expect(Math.abs(stick[1] - (t1 + vc / (mu2 * G)))).toBeLessThan(1e-9)
    expectCards(rec, ['bb.a1', 'bb.a2', 'bb.t', 'bb.vc', 'bb.ds', 'bb.Q', 'bt.a', 'bt.f', 'en.ledger'])
  })
  it('board stays when μ1·m ≤ μ2·(M + m)', () => {
    const rec = simulate(buildTemplate('board-block', { mu1: 0.3, mu2: 0.2 }))
    expectCards(rec, ['bb.a1', 'bb.a2.rest', 'bb.t'])
  })
})

describe('3 conveyors', () => {
  it('horizontal belt: time to common speed, heat Q = ½mu², motor work mu²', () => {
    const rec = simulate(buildTemplate('conveyor'))
    expect(Math.abs(eventTimes(rec, 'stick')[0] - 2 / (0.5 * G))).toBeLessThan(1e-9)
    expectCards(rec, ['flat.a', 'flat.t', 'flat.x', 'flat.ds', 'flat.Q', 'flat.W', 'en.ledger'])
  })
  it('inclined belt (37°, μ < tanθ): two accelerations', () => {
    const rec = simulate(buildTemplate('conveyor-incline'))
    const th = rad(37)
    const a1 = G * (Math.sin(th) + 0.5 * Math.cos(th))
    expect(Math.abs(eventTimes(rec, 'reverse')[0] - 2 / a1)).toBeLessThan(1e-9)
    expectCards(rec, ['incline.a.up', 'incline.a.down', 'incline.t.common', 'en.ledger'])
  })
  it('inclined belt with μ ≥ tanθ moves with the belt after common speed', () => {
    const rec = simulate(buildTemplate('conveyor-incline', { mu: 0.9 }))
    expect(eventTimes(rec, 'stick').length).toBe(1)
    expectCards(rec, ['incline.a.up', 'incline.f.static'])
  })
})

describe('4 collisions', () => {
  for (const e of [1, 0.5, 0]) {
    it(`1D, e = ${e}`, () => {
      const rec = simulate(buildTemplate('collision-1d', { e }))
      const m1 = 1, m2 = 2, u = 2
      const X = frameState(rec, rec.frameCount - 1)
      const n = rec.system.n
      expect(Math.abs(X[3 * n] - (m1 * u - e * m2 * u) / (m1 + m2))).toBeLessThan(1e-12)
      expect(Math.abs(X[3 * n + 3] - (1 + e) * m1 * u / (m1 + m2))).toBeLessThan(1e-12)
      expectCards(rec, ['col.v1', 'col.v2', 'col.px', 'col.dE', 'mo.px'])
    })
  }
  it('2D oblique, equal masses, elastic: perpendicular after', () => {
    expectCards(simulate(buildTemplate('collision-2d')), ['col.v1', 'col.v2', 'col.px', 'col.py', 'col.tangent', 'col.angle', 'col.dE'])
  })
  it('2D oblique inelastic', () => {
    expectCards(simulate(buildTemplate('collision-2d', { e: 0.6, m2: 3, b: -0.15 })), ['col.v1', 'col.v2', 'col.px', 'col.py', 'col.tangent', 'col.dE'])
  })
})

describe('5 projectile', () => {
  it('horizontal launch from 1.25 m', () => {
    const rec = simulate(buildTemplate('projectile', { v0: 5, alpha: 0, h: 1.25 }))
    const T = Math.sqrt(2 * 1.25 / G)
    expect(Math.abs(eventTimes(rec, 'impact')[0] - T)).toBeLessThan(1e-9)
    expectCards(rec, ['pr.x', 'pr.y', 'pr.T', 'pr.R'])
  })
  it('oblique launch 10 m/s at 45°', () => {
    const rec = simulate(buildTemplate('projectile'))
    expect(Math.abs(eventTimes(rec, 'impact')[0] - 2 * 10 * Math.sin(rad(45)) / G)).toBeLessThan(1e-9)
    expectCards(rec, ['pr.T', 'pr.R', 'pr.H', 'pr.vy'])
  })
})

describe('6 oscillations', () => {
  it('pendulum 5°: small-angle formula holds approximately, exact period matches', () => {
    const cards = expectCards(simulate(buildTemplate('pendulum', { theta0: 5 })), ['pe.T.exact', 'pe.v', 'pe.F'])
    const small = cards.find(c => c.formula.id === 'pe.T.small')!
    expect(small.verdict).toBe('approx-ok')
    expect(small.relError!).toBeLessThan(1e-3)
  })
  it('pendulum 30°: small-angle approximation flagged invalid', () => {
    const cards = expectCards(simulate(buildTemplate('pendulum', { theta0: 30 })), ['pe.T.exact'])
    expect(cards.find(c => c.formula.id === 'pe.T.small')!.verdict).toBe('approx-invalid')
  })
  it('pendulum 8°: approximation graded “近似”', () => {
    const cards = allCards(simulate(buildTemplate('pendulum', { theta0: 8 })))
    expect(cards.find(c => c.formula.id === 'pe.T.small')!.verdict).toBe('approx')
  })
  it('spring oscillator k = 50 N/m, m = 0.5 kg', () => {
    expectCards(simulate(buildTemplate('spring')), ['sp.T', 'sp.vmax', 'sp.amax', 'en.ledger'])
  })
})

describe('7 rigid rotation', () => {
  it('hinged rod released from horizontal: ω = √(3g/L), F = 2.5mg', () => {
    const cards = expectCards(simulate(buildTemplate('hinged-rod')), ['ro.alpha', 'ro.omega', 'ro.rod', 'ro.F'])
    expect(rel(cards.find(c => c.formula.id === 'ro.F')!.sim!, 2.5 * 1 * G)).toBeLessThan(1e-9)
  })
  it('cylinder rolls without slipping: a = 2/3 g sinθ', () => {
    const cards = expectCards(simulate(buildTemplate('rolling')), ['rl.a', 'rl.f', 'rl.vw'])
    expect(rel(cards.find(c => c.formula.id === 'rl.a')!.sim!, (2 / 3) * G * 0.5)).toBeLessThan(1e-9)
  })
  it('cylinder rolls and slips when μ < tanθ/3', () => {
    expectCards(simulate(buildTemplate('rolling', { mu: 0.1 })), ['rl.a.slip', 'rl.beta.slip'])
  })
  it('ball hits hinged rod: angular momentum about the axis', () => {
    expectCards(simulate(buildTemplate('ball-rod')), ['hi.v', 'hi.w', 'hi.L', 'en.ledger'])
    expectCards(simulate(buildTemplate('ball-rod', { e: 0, d: 0.5 })), ['hi.v', 'hi.w', 'hi.L'])
  })
})

describe('8 connected bodies over a pulley', () => {
  it('whole and isolation methods agree with the simulation', () => {
    const rec = simulate(buildTemplate('table-pulley'))
    const cards = expectCards(rec, ['pu.a', 'pu.T1', 'pu.T2', 'en.ledger'])
    const T1 = cards.find(c => c.formula.id === 'pu.T1')!, T2 = cards.find(c => c.formula.id === 'pu.T2')!
    expect(rel(T1.theory!, T2.theory!)).toBeLessThan(1e-14)
    expect(rel(T1.sim!, (2 * (1.96 + 0.2 * G)))).toBeLessThan(1e-9)
  })
  it('stays at rest when m2 ≤ μs·m1', () => {
    const rec = simulate(buildTemplate('table-pulley', { m2: 0.3 }))
    const X = frameState(rec, rec.frameCount - 1)
    expect(Math.abs(X[3 * rec.system.n])).toBeLessThan(1e-12)
    const cards = allCards(rec)
    expect(cards.find(c => c.formula.id === 'pu.a')!.verdict).toBe('not-applicable')
  })
})

describe('energy ledger closes for every template', () => {
  for (const id of ['incline', 'board-block', 'conveyor', 'conveyor-incline', 'collision-1d', 'collision-2d', 'projectile', 'pendulum', 'spring', 'hinged-rod', 'rolling', 'ball-rod', 'table-pulley']) {
    it(id, () => {
      const rec = simulate(buildTemplate(id))
      const L0 = frameLedger(rec, 0)
      let worst = 0, scale = 1
      for (let k = 0; k < rec.frameCount; k++) {
        const L = frameLedger(rec, k)
        worst = Math.max(worst, Math.abs(L.balance - L0.balance))
        scale = Math.max(scale, Math.abs(L.kinetic), Math.abs(L.gravity), Math.abs(L.spring))
      }
      expect(worst / scale).toBeLessThan(1e-8)
    })
  }
})

describe('8b Atwood machine', () => {
  it('a = (m2 − m1)g/(m1 + m2), T = 2m1m2g/(m1 + m2)', () => {
    expectCards(simulate(buildTemplate('atwood')), ['at.a', 'at.T', 'en.ledger'])
  })
})
