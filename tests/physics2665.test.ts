/**
 * 26.65 (D299–D301): regression tests of the physics audit (docs/research/2665/physics-audit.md). Each case states the
 * audit's reproduction and checks the formula card or readout against a closed form computed here, not by the engine.
 * Tolerances: exact cards must be 'match' (the core's own 1e-6 relative limit); the closed forms are compared with
 * |sim − ref| ≤ 1e-9·max(1, |ref|) unless a case says otherwise.
 */
import { describe, expect, it } from 'vitest'
import { TEMPLATES, buildTemplate } from '../src/templates'
import { simulate } from '../src/engine/recording'
import type { Recording } from '../src/engine/recording'
import { recognize } from '../src/formula/recognize'
import type { Situation } from '../src/formula/recognize'
import { cardsAt, evaluateCard } from '../src/formula/match'
import { valuesAt, valuesAtFrame } from '../src/engine/observe'

const close = (a: number | null | undefined, b: number, rel = 1e-9) => a !== null && a !== undefined && Math.abs(a - b) <= rel * Math.max(1, Math.abs(b))
function card(rec: Recording, sit: Situation, id: string, t: number) {
  const c = evaluateCard(rec, sit, id, t)
  if (!c) throw new Error(`no card ${id}`)
  return c
}

describe('P1: board and block on a smooth floor (μ₂ = 0)', () => {
  it('the board moves: a₂ = μ₁mg/M, t = v₀/(a₁ + a₂), v = mv₀/(m + M), Δs and Q', () => {
    const M = 2, m = 1, v0 = 4, mu1 = 0.4, g = 9.8
    const rec = simulate(buildTemplate('board-block', { M, m, v0, mu1, mu2: 0, g }), { duration: 2.5 })
    const sit = recognize(rec).find(s => s.type === 'board-block')!
    expect(sit).toBeTruthy()
    const a1 = mu1 * g, a2 = mu1 * m * g / M, t1 = v0 / (a1 + a2)
    const vc = m * v0 / (m + M), ds = v0 * v0 / (2 * (a1 + a2)), Q = 0.5 * m * M * v0 * v0 / (m + M)
    const t = (sit.t0 + sit.t1) / 2
    const want: Record<string, number> = { 'bb.a2': a2, 'bb.t': t1, 'bb.vc': vc, 'bb.ds': ds, 'bb.Q': Q }
    for (const [id, ref] of Object.entries(want)) {
      const c = card(rec, sit, id, t)
      expect(c.verdict, `${id}: theory ${c.theory}, sim ${c.sim}`).toBe('match')
      expect(close(c.theory, ref), `${id} theory ${c.theory} vs ${ref}`).toBe(true)
    }
    expect(card(rec, sit, 'bb.a2.rest', t).verdict).toBe('not-applicable')
  })

  it('M8: once both bodies rest on the rough floor, “moving together” is no longer listed', () => {
    const rec = simulate(buildTemplate('board-block'), { duration: 2.5 })
    const together = recognize(rec).filter(s => s.type === 'board-together')
    expect(together.length).toBeGreaterThan(0)
    // Default parameters: common velocity at 1.3605 s, both at rest at about 2.36 s (end of the record 2.5 s)
    for (const s of together) {
      const vb = valuesAt(rec, (s.t0 + s.t1) / 2, ['board.vx'])[0]
      expect(Math.abs(vb), `${s.title} ${s.t0}–${s.t1}`).toBeGreaterThan(1e-6)
    }
  })
})

describe('P3: a hoop (full arc) rolls', () => {
  it('hoop-disc: the hoop is recognised as rolling, a = g sinθ/(1 + I/(mr²)) with I = m(rᵢ² + rₒ²)/2', () => {
    const th = 30 * Math.PI / 180, g = 9.8, r = 0.15, w = 0.012
    const rec = simulate(buildTemplate('hoop-disc', { theta: 30, mu: 0.5, g }), { duration: 1.5 })
    const sits = recognize(rec)
    expect(sits.some(s => s.type === 'incline' && s.bodies.includes('hoop'))).toBe(false)
    const roll = sits.find(s => s.type === 'rolling' && s.bodies.includes('hoop'))!
    expect(roll).toBeTruthy()
    const ri = r - w, I = (ri * ri + r * r) / 2 // per unit mass
    const aRef = g * Math.sin(th) / (1 + I / (r * r))
    const c = card(rec, roll, 'rl.a', (roll.t0 + roll.t1) / 2)
    expect(c.verdict, `theory ${c.theory} sim ${c.sim}`).toBe('match')
    expect(close(c.theory, aRef, 1e-6), `${c.theory} vs ${aRef}`).toBe(true)
    // No red card on the hoop in the default run
    for (const s of sits.filter(s => s.bodies.includes('hoop') && s.t1 > s.t0)) {
      for (const k of cardsAt(rec, (s.t0 + s.t1) / 2).filter(k => k.situation.key === s.key)) expect(k.verdict, `${s.title}: ${k.formula.id}`).not.toBe('deviate')
    }
  })
})

describe('P5: quarter arc — the ball leaves at the end of the track, not in the upper half', () => {
  it('arc-slide: the “leaves in the upper half” cards are not applicable; N = 3mg at the bottom still matches', () => {
    const rec = simulate(buildTemplate('arc-slide', { R: 0.8 }), { duration: 3 })
    const sit = recognize(rec).find(s => s.type === 'arc-inside')!
    const t = (sit.t0 + sit.t1) / 2
    for (const id of ['arc.in.hS', 'arc.in.vS']) expect(card(rec, sit, id, t).verdict, id).toBe('not-applicable')
    expect(card(rec, sit, 'arc.in.Nb', t).verdict).toBe('match')
  })
  it('vertical loop left above the centre still matches (h = (v₀² − 2gρ)/(3g))', () => {
    const rec = simulate(buildTemplate('vertical-loop', { R: 0.5, v0: 4 }), { duration: 3 })
    const sit = recognize(rec).find(s => s.type === 'arc-inside')!
    expect(card(rec, sit, 'arc.in.hS', (sit.t0 + sit.t1) / 2).verdict).toBe('match')
  })
})

describe('P2: accelerations of the many-body solver', () => {
  it('bodies resting on the floor read a = 0, not g (Δv/Δt over the last frame)', () => {
    for (const [id, body] of [['pyramid', 'box0_0'], ['dominoes', 'd23']] as const) {
      const rec = simulate(buildTemplate(id), { duration: 1 })
      const k = rec.frameCount - 1
      const [v, a, ay] = valuesAtFrame(rec, k, [`${body}.v`, `${body}.a`, `${body}.ay`])
      expect(v, id).toBeLessThan(1e-3)
      expect(a, `${id} a`).toBeLessThan(0.05)
      expect(Math.abs(ay), `${id} ay`).toBeLessThan(0.05)
    }
  })
  it('a free-falling ball of ball-pour reads a = g before it reaches anything', () => {
    const g = 9.8
    const rec = simulate(buildTemplate('ball-pour'), { duration: 0.1 })
    // Between frames the state is interpolated linearly: a is the velocity change of that frame interval
    const [ay] = valuesAtFrame(rec, 3, ['ball0.ay'])
    expect(Math.abs(ay + g), `ay ${ay}`).toBeLessThan(1e-9 * g)
  })
})

describe('P6: energy-ledger card of a many-body run', () => {
  it('pyramid at t = 0.3 s: the card does not claim a check — the ledger closes by construction', () => {
    const rec = simulate(buildTemplate('pyramid'), { duration: 1 })
    const c = cardsAt(rec, 0.3).find(k => k.formula.id === 'en.ledger')!
    expect(c).toBeTruthy()
    expect(c.verdict).toBe('no-measure')
    expect(c.reason.length).toBeGreaterThan(0)
    // The readout of the ledger at the same instant still closes (it is the same number the card no longer compares)
    const [bal] = valuesAt(rec, 0.3, ['ledger.balance'])
    const [bal0] = valuesAtFrame(rec, 0, ['ledger.balance'])
    expect(Math.abs(bal - bal0)).toBeLessThan(1e-6 * Math.abs(bal0))
  })
})

describe('P7: a card sampled at the instant of the event that ends its phase takes the state before the event', () => {
  it('charge-deflection, L = 0.1: at the screen hit (t = 0.19 s) vₓ = v₀ = 3 m/s and W = ΔEk still match', () => {
    const rec = simulate(buildTemplate('charge-deflection', { L: 0.1 }))
    const sit = recognize(rec).find(s => s.type === 'charge-e')!
    expect(sit.t1).toBeCloseTo(0.19, 9)
    const vx = card(rec, sit, 'ce.vx', sit.t1)
    expect(vx.verdict, `theory ${vx.theory} sim ${vx.sim}`).toBe('match')
    expect(close(vx.sim, 3)).toBe(true)
    expect(card(rec, sit, 'ce.W', sit.t1).verdict).toBe('match')
    // The panel at the playhead on that frame
    for (const c of cardsAt(rec, 0.19).filter(k => k.situation.key === sit.key)) expect(c.verdict, c.formula.id).not.toBe('deviate')
  })
  it('pendulum-collision, L = 3: the lowest-point crossing coincides with the impact; v = √(2gL(1 − cosθ₀)) matches', () => {
    const rec = simulate(buildTemplate('pendulum-collision', { L: 3 }))
    const sit = recognize(rec).find(s => s.type === 'pendulum')!
    const c = card(rec, sit, 'pe.v', (sit.t0 + sit.t1) / 2)
    expect(c.verdict, `theory ${c.theory} sim ${c.sim}`).toBe('match')
    expect(card(rec, sit, 'pe.F', (sit.t0 + sit.t1) / 2).verdict).toBe('match')
  })
})

describe('P4, P10, P11: situations whose formulas do not apply are not recognised', () => {
  it('P4 groove-momentum: a ball in a curved groove is no movable wedge', () => {
    const rec = simulate(buildTemplate('groove-momentum'), { duration: 2 })
    expect(recognize(rec).filter(s => s.type === 'wedge').map(s => s.title)).toEqual([])
  })
  it('P4 movable-wedge keeps its wedge cards (A = mg sinθ cosθ/(M + m sin²θ))', () => {
    const th = 30 * Math.PI / 180, M = 2, m = 1, g = 9.8
    const rec = simulate(buildTemplate('movable-wedge', { theta: 30, M, m, g }), { duration: 0.6 })
    const sit = recognize(rec).find(s => s.type === 'wedge')!
    const c = card(rec, sit, 'wd.A', (sit.t0 + sit.t1) / 2)
    expect(c.verdict).toBe('match')
    expect(close(c.theory, m * g * Math.sin(th) * Math.cos(th) / (M + m * Math.sin(th) ** 2))).toBe(true)
  })
  it('P10 projectile-slope, v₀ = 0.1: resting on the top corner of the slope is not “sliding down the incline”', () => {
    const rec = simulate(buildTemplate('projectile-slope', { v0: 0.1 }), { duration: 2 })
    for (const s of recognize(rec).filter(s => s.type === 'incline' && s.t1 > s.t0)) {
      for (const k of cardsAt(rec, (s.t0 + s.t1) / 2).filter(k => k.situation.key === s.key)) expect(k.verdict, `${s.title} ${k.formula.id}`).not.toBe('deviate')
    }
  })
  it('P11 table-pulley, m₁ = 0.01: no phase of zero length', () => {
    const rec = simulate(buildTemplate('table-pulley', { m1: 0.01 }), { duration: 1 })
    const zero = recognize(rec).filter(s => s.tEvent === undefined && s.t1 - s.t0 < 1e-9)
    expect(zero.map(s => `${s.type} ${s.t0}`)).toEqual([])
  })
})

describe('P9: spring-joined blocks that collide before the spring is fully compressed', () => {
  it('spring-blocks, k = 0.01: E_p,max and x_max are not compared (no common velocity in the phase)', () => {
    const rec = simulate(buildTemplate('spring-blocks', { k: 0.01 }), { duration: 2 })
    const sit = recognize(rec).find(s => s.type === 'spring-pair')!
    for (const id of ['sb.Ep', 'sb.x', 'sb.vc']) {
      const c = card(rec, sit, id, (sit.t0 + sit.t1) / 2)
      expect(c.verdict, `${id}: theory ${c.theory} sim ${c.sim}`).not.toBe('deviate')
    }
  })
  it('default spring-blocks still match E_p,max = m₁m₂v₀²/(2(m₁ + m₂))', () => {
    const rec = simulate(buildTemplate('spring-blocks'), { duration: 2 })
    const sit = recognize(rec).find(s => s.type === 'spring-pair')!
    expect(card(rec, sit, 'sb.Ep', (sit.t0 + sit.t1) / 2).verdict).toBe('match')
  })
})

describe('P12: the energy ledger card when E₀ = 0', () => {
  it('rail-force with B = 0 and rail-coast with L = 5: the ledger card matches (limit scales with the ledger terms)', () => {
    for (const [id, v] of [['rail-force', { B: 0 }], ['rail-coast', { L: 5 }]] as const) {
      const rec = simulate(buildTemplate(id, v))
      const end = (rec.frameCount - 1) * rec.dt
      for (const t of [0.3 * end, 0.9 * end]) {
        const c = cardsAt(rec, t).find(k => k.formula.id === 'en.ledger')!
        expect(c.verdict, `${id} t = ${t}: theory ${c.theory} sim ${c.sim}`).toBe('match')
      }
    }
  })
})

describe('M6: arc-slide — the ball on the smooth floor after leaving the arc has a phase', () => {
  it('a situation covers t = 0.8 s and its cards agree', () => {
    const rec = simulate(buildTemplate('arc-slide'), { duration: 2 })
    const at = recognize(rec).filter(s => s.tEvent === undefined && s.t0 <= 0.8 && s.t1 >= 0.8 && s.bodies.includes('ball') && s.type !== 'energy')
    expect(at.length).toBeGreaterThan(0)
    for (const k of cardsAt(rec, 0.8).filter(k => at.some(s => s.key === k.situation.key))) expect(k.verdict, k.formula.id).not.toBe('deviate')
  })
})

describe('M10: wave optics never panics the core', () => {
  it('a wavelength in m instead of nm is refused with a message; huge screens give a capped list and the count', async () => {
    const { slitPattern } = await import('../src/engine/labs')
    const bad = slitPattern({ setup: 'double', lambda: 6e-7, white: false, a: 0.02e-3, d: 0.25e-3, L: 2, half: 0.03 }) as unknown as { error?: unknown }
    expect(bad.error).toBeTruthy()
    const big = slitPattern({ setup: 'double', lambda: 600, white: false, a: 0.02e-3, d: 1, L: 2, half: 1, samples: 101 }) as unknown as { maxima: unknown[]; maximaTotal: number }
    // 2·⌊(half/√(L² + half²))·d/λ⌋ + 1 = 1 490 711 maxima on the screen; the list keeps |m| ≤ 100
    expect(big.maximaTotal).toBe(1490711)
    expect(big.maxima.length).toBe(201)
  })
})

describe('M1: unbounded template runs end near the scene', () => {
  const FALLING = ['incline', 'conveyor', 'conveyor-incline', 'projectile', 'rolling', 'movable-wedge', 'spring-blocks', 'rolling-slip', 'variable-force', 'uniform-motion', 'pull-force', 'inertia', 'incline-efficiency', 'rail-fall', 'pursuit', 'projectile-slope', 'arc-slide', 'hump-bridge', 'hoop-disc', 'dome-slide', 'rope-break-pendulum', 'drop-vs-throw', 'monkey-hunter', 'ramp-pull', 'two-blocks-push', 'rolling-resistance']
  for (const id of FALLING) {
    it(`${id}: ends by its stop condition or at rest, every body within 30 m of the start (default parameters)`, () => {
      const scene = buildTemplate(id)
      const rec = simulate(scene, { duration: null, until: 60 })
      expect(rec.completed, `${id} still running at 60 s`).toBe(true)
      expect(['stopAt', 'rest', 'restApprox']).toContain(rec.stopReason)
      // The bounded run of legacyDuration is not cut by the stop condition
      if (rec.stopReason === 'stopAt') expect((rec.frameCount - 1) * rec.dt).toBeGreaterThanOrEqual(scene.settings.legacyDuration - 1e-9)
      const ys = valuesAtFrame(rec, rec.frameCount - 1, rec.system.model.dynamic.map(b => `${b.id}.y`))
      const y0 = valuesAtFrame(rec, 0, rec.system.model.dynamic.map(b => `${b.id}.y`))
      ys.forEach((y, i) => expect(Math.abs(y - y0[i]), `${id}: ${rec.system.model.dynamic[i].id}`).toBeLessThan(30))
    })
  }
  it('rolling-resistance with C_rr = 0.001: the ground reaches past the stopping distance v₀²/(2·⅔·C_rr·g)', () => {
    const v = { crr: 0.001 }
    const scene = buildTemplate('rolling-resistance', v)
    const g = scene.settings.gravity.y * -1
    const disc = scene.bodies.find(b => b.id === 'disc')!
    const v0 = disc.velocity.x, d = v0 * v0 / (2 * (2 / 3) * v.crr * g)
    const ground = scene.bodies.find(b => b.id === 'ground')!
    const right = ground.position.x + (ground.shape as { width: number }).width / 2
    expect(right).toBeGreaterThan(d)
  })
})

describe('M2: movable pulley — no Zeno sequence of bounces', () => {
  it('the unbounded run ends when block 1 lands (like the Atwood machine), on the exact solver', () => {
    const rec = simulate(buildTemplate('movable-pulley'), { duration: null, until: 6 })
    expect(rec.stopReason).toBe('stopAt')
    expect(rec.reducedFrom ?? null).toBeNull()
    expect(rec.events.filter(e => e.changes.some(c => c.type === 'impact')).length).toBe(1)
    // a₁ = 2a₂ until the landing (closed form of the movable pulley)
    const [a1, a2] = valuesAt(rec, 0.5, ['m1.ay', 'm2.ay'])
    expect(Math.abs(a1 + 2 * a2)).toBeLessThan(1e-9)
  })
})

describe('M3–M5: parameter ranges only allow valid scenes', () => {
  const param = (id: string, key: string) => (TEMPLATES.find(t => t.id === id)!.params.find(p => p.key === key)!)
  it('M3: the rope pendulum is released at most from 90° (above that the rope is slack at release)', () => {
    expect(param('pendulum', 'theta0').max).toBe(90)
  })
  it('M4: slope-up μ stays below the tipping limit w/h = 1.5 and runs at its maximum', () => {
    expect(param('slope-up', 'mu').max).toBeLessThan(1.5)
    const rec = simulate(buildTemplate('slope-up', { mu: param('slope-up', 'mu').max! }))
    expect(rec.error ?? null).toBeNull()
  })
  it('M5: the smallest B and q of the mass spectrometer, the smallest load and coupling build valid scenes', () => {
    for (const [id, v] of [['mass-spectrometer', { B: 1e-6 }], ['mass-spectrometer', { q: 1e-6 }], ['loaded-boat', { m: param('loaded-boat', 'm').min! }], ['coupled-oscillators', { kc: param('coupled-oscillators', 'kc').min! }]] as const) {
      const rec = simulate(buildTemplate(id, v), { duration: 0.05 })
      expect(rec.error ?? null, `${id} ${JSON.stringify(v)}`).toBeNull()
    }
  })
  it('M5: on a short slope (L = 1 m) the block starts on the slope, without an initial overlap', () => {
    const rec = simulate(buildTemplate('incline-friction', { base: 1 }), { duration: 0.2 })
    const keys = rec.warnings.map(w => (w as { key: string }).key)
    expect(keys).not.toContain('warn.initialDeepOverlap')
    expect(keys).not.toContain('warn.reducedAccuracy')
  })
})

describe('P8: states between frames are integrated with error control', () => {
  it('cosmic-velocity, R = 0.1 (about 5.7 frames per turn): the circular-orbit radius holds between frames', () => {
    const rec = simulate(buildTemplate('cosmic-velocity', { R: 0.1 }), { duration: 0.1 })
    const [x0, y0] = valuesAtFrame(rec, 0, ['sat.x', 'sat.y'])
    const r0 = Math.hypot(x0, y0)
    let worst = 0
    for (let k = 0; k < 20; k++) {
      const [x, y] = valuesAt(rec, (k + 0.5) * rec.dt, ['sat.x', 'sat.y'])
      worst = Math.max(worst, Math.abs(Math.hypot(x, y) - r0) / r0)
    }
    // Before 26.65 one unchecked step gave 4.4e-5 relative at half a frame; the run's own tolerance is 1e-10 per step
    expect(worst).toBeLessThan(1e-8)
  })
})

describe('P12: cancellation in a theory value', () => {
  it('rail-fall with B = 0: Q = Fs − ½m(v² − v₀²) is a difference of large terms; the card no longer deviates', () => {
    // The audit's case: theory 1.02e-9 J against 0 after 36 s of free fall (Fs ≈ 6.4e3 J)
    const rec = simulate(buildTemplate('rail-fall', { B: 0 }))
    const T = (rec.frameCount - 1) * rec.dt
    const cards = [0.6, 0.95].flatMap(f => cardsAt(rec, f * T).filter(c => c.formula.id === 'rail.Q'))
    expect(cards.length).toBeGreaterThan(0)
    for (const c of cards) expect(c.verdict, `theory ${c.theory} sim ${c.sim}`).not.toBe('deviate')
  })
})
