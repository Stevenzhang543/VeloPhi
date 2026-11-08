/**
 * 26.61 A3: independent physics references. Each case is a closed-form textbook result, computed here (not by the
 * engine), and the engine's value must satisfy |sim − ref| ≤ atol + rtol·|ref| with a tolerance set per quantity and
 * magnitude (near-zero quantities by the absolute part). The table is printed for the release evidence.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import { simulate } from '../src/engine/recording'
import type { Recording } from '../src/engine/recording'
import { recognize } from '../src/formula/recognize'
import { evaluateProblemTarget } from '../src/teaching/problems'
import type { ProblemTarget } from '../src/teaching/problems'
import { addBody, addGround, emptyScene } from '../src/core/scene/build'
import { collisionEvidence, rcEvidence, staticEvidence } from '../src/teaching/lessons/evidence'

const g = 9.8
const rows: string[] = []
function check(name: string, sim: number | null, ref: number, rtol: number, atol: number) {
  const ok = sim !== null && Number.isFinite(sim) && Math.abs(sim - ref) <= atol + rtol * Math.abs(ref)
  rows.push(`${ok ? 'ok  ' : 'FAIL'} ${name}: sim ${sim === null ? '—' : sim.toPrecision(10)}, ref ${ref.toPrecision(10)}, |Δ| ${sim === null ? '—' : Math.abs(sim - ref).toExponential(2)} (atol ${atol}, rtol ${rtol})`)
  expect(ok, rows[rows.length - 1]).toBe(true)
}
function read(rec: Recording, target: ProblemTarget): number | null {
  const v = evaluateProblemTarget(rec, recognize(rec), target).sim
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const eventTime = (rec: Recording, type: string) => rec.events.find(e => e.triggers.includes(type as never) || e.changes.some(c => c.type === type))?.t ?? null

describe('independent references (26.61 A3)', () => {
  it('free fall from 5 m: time and speed at impact', () => {
    const s = emptyScene('fall')
    addGround(s, { id: 'ground', top: 0, left: -1, right: 1 })
    const r = 0.05, h = 5
    addBody(s, { id: 'ball', name: 'ball', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: h + r }, mass: 1, material: { restitution: 0 } })
    s.settings.gravity = { x: 0, y: -g }
    const rec = simulate(s, { duration: 1.5 })
    const t = eventTime(rec, 'impact') ?? eventTime(rec, 'touch')
    check('free fall t_hit = √(2h/g)', t, Math.sqrt(2 * h / g), 1e-9, 1e-10)
    check('free fall v_hit = √(2gh)', read(rec, { kind: 'atEvent', id: 'ball.vy', event: t === eventTime(rec, 'impact') ? 'impact' : 'touch', side: 'before', body: null }), -Math.sqrt(2 * g * h), 1e-9, 1e-10)
  })

  it('projectile at 45°: range and time of flight', () => {
    const rec = simulate(buildTemplate('projectile', { v0: 10, alpha: 45, h: 0, m: 0.1, g }), { duration: 3 })
    const t = eventTime(rec, 'impact') ?? eventTime(rec, 'touch')
    check('projectile T = 2v₀ sin α / g', t, 2 * 10 * Math.sin(Math.PI / 4) / g, 1e-9, 1e-10)
    const x = t === null ? null : read(rec, { kind: 'quantity', id: 'ball.x', t: t - 1e-9 })
    check('projectile R = v₀² sin 2α / g', x, 100 / g, 1e-7, 1e-8)
  })

  it('spring oscillator: v_max = Aω, energy kept', () => {
    const k = 50, m = 0.5, A = 0.1
    const rec = simulate(buildTemplate('spring', { k, m, A, g }), { duration: 3 })
    check('oscillator v_max = A√(k/m)', read(rec, { kind: 'extreme', id: 'block.vx', which: 'max' }), A * Math.sqrt(k / m), 1e-9, 1e-12)
    const e0 = read(rec, { kind: 'quantity', id: 'system.e', t: 0 })!, e1 = read(rec, { kind: 'quantity', id: 'system.e', t: 2.9 })!
    check('oscillator energy drift over 2.9 s', e1, e0, 1e-8, 0)
  })

  it('Atwood machine: v(t) = (m₂ − m₁)g t / (m₁ + m₂)', () => {
    const m1 = 1, m2 = 1.5
    const rec = simulate(buildTemplate('atwood', { m1, m2, g }), { duration: 0.6 })
    check('Atwood v at 0.5 s', read(rec, { kind: 'quantity', id: 'm1.vy', t: 0.5 }), (m2 - m1) * g * 0.5 / (m1 + m2), 1e-7, 1e-9)
  })

  it('pendulum: energy over 20 s at θ₀ = 60° (the ledger claim)', () => {
    const rec = simulate(buildTemplate('pendulum', { L: 1, theta0: 60, m: 0.5, g }), { duration: 20 })
    const e0 = read(rec, { kind: 'quantity', id: 'system.e', t: 0 })!, e1 = read(rec, { kind: 'quantity', id: 'system.e', t: 19.9 })!
    check('pendulum energy drift over 20 s', e1, e0, 1e-8, 0)
  })

  it('smooth quarter arc: v = √(2g(R − r)) and N = 3mg at the bottom', () => {
    const R = 0.8, m = 0.2
    const rec = simulate(buildTemplate('arc-slide', { R, m, g }), { duration: 2 })
    const r = rec.scene.bodies.find(b => b.id === 'ball')!.shape as { radius: number }
    check('arc bottom speed', read(rec, { kind: 'extreme', id: 'ball.v', which: 'max' }), Math.sqrt(2 * g * (R - r.radius)), 1e-9, 1e-12)
    check('arc bottom normal force = 3mg', read(rec, { kind: 'extreme', id: 'contact.ball|track.N', which: 'max' }), 3 * m * g, 1e-9, 1e-12)
  })

  it('vertical loop: speed at the top √(v₀² − 4g(R − r))', () => {
    const R = 0.5, v0 = 5
    const rec = simulate(buildTemplate('vertical-loop', { R, v0, m: 0.1, g }), { duration: 1.2 })
    const r = (rec.scene.bodies.find(b => b.id === 'ball')!.shape as { radius: number }).radius
    check('loop top speed', read(rec, { kind: 'extreme', id: 'ball.v', which: 'min' }), Math.sqrt(v0 * v0 - 4 * g * (R - r)), 1e-9, 1e-12)
  })

  it('hump bridge: N = m(g − v²/ρ) at the top', () => {
    const R = 5, v0 = 3, m = 1
    const rec = simulate(buildTemplate('hump-bridge', { R, v0, m, g }), { duration: 0.2 })
    const r = (rec.scene.bodies.find(b => b.id === 'car')!.shape as { radius: number }).radius
    check('bridge N at the top', read(rec, { kind: 'quantity', id: 'contact.car|bridge.N', t: 1e-6 }), m * (g - v0 * v0 / (R + r)), 1e-9, 1e-12)
  })

  it('a point mass leaves a smooth dome at cos φ = (2 + v₀²/gR)/3', () => {
    const s = emptyScene('dome')
    const R = 1, v0 = 0.3
    addBody(s, { id: 'dome', name: 'dome', kind: 'static', role: 'ground', shape: { type: 'circle', radius: R }, position: { x: 0, y: 0 }, material: { muS: 0, muK: 0, restitution: 0 } })
    addBody(s, { id: 'p', name: 'p', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0 }, position: { x: 0, y: R }, velocity: { x: v0, y: 0 }, mass: 1, material: { muS: 0, muK: 0, restitution: 0 } })
    s.settings.gravity = { x: 0, y: -g }
    const rec = simulate(s, { duration: 1.5 })
    const t = eventTime(rec, 'separate') ?? eventTime(rec, 'leave')
    expect(t, 'a separation event').not.toBeNull()
    check('dome: height of leaving', read(rec, { kind: 'quantity', id: 'p.y', t: t! }), R * (2 + v0 * v0 / (g * R)) / 3, 1e-8, 1e-10)
  })

  it('the classroom references: static threshold, elastic collision, RC', () => {
    check('incline 25° stays (friction = mg sin θ)', Math.abs(staticEvidence(25).friction!), 2 * g * Math.sin(25 * Math.PI / 180), 1e-6, 1e-9)
    check('incline 28° slides (friction = μk mg cos θ)', Math.abs(staticEvidence(28).friction!), 0.4 * 2 * g * Math.cos(28 * Math.PI / 180), 1e-6, 1e-9)
    const c = collisionEvidence(2)
    check('elastic v₁\' = (m₁ − m₂)u₁/(m₁ + m₂)', c.after.vA, -1, 1e-9, 1e-12)
    check('elastic v₂\' = 2m₁u₁/(m₁ + m₂)', c.after.vB, 2, 1e-9, 1e-12)
    check('elastic E_k after = before', c.after.ek, 4.5, 1e-9, 1e-12)
    check('RC V(τ)/Vs = 1 − 1/e', rcEvidence(1000, 1e-4).ratio, 1 - Math.exp(-1), 1e-12, 0)
    console.log(`\n${rows.join('\n')}\n`)
  })
})
