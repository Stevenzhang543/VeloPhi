/** Scenes a teacher might build by hand: they must finish, stay consistent and keep the energy ledger. */
import { describe, expect, it } from 'vitest'
import { addBody, addConnector, addGround, addIncline, anchor, emptyScene, onIncline } from '../src/core/scene/build'
import type { Scene, SpringDef } from '../src/core/scene/types'
import { frameLedger, simulate } from '../src/core/solver/simulation'

function ledgerDrift(scene: Scene) {
  const rec = simulate(scene)
  expect(rec.error, rec.error ?? '').toBeNull()
  const L0 = frameLedger(rec, 0)
  let worst = 0, scale = 1
  for (let k = 0; k < rec.frameCount; k += 5) {
    const L = frameLedger(rec, k)
    worst = Math.max(worst, Math.abs(L.balance - L0.balance))
    scale = Math.max(scale, Math.abs(L.kinetic), Math.abs(L.gravity), Math.abs(L.spring))
  }
  return { rec, drift: worst / scale }
}

describe('hand-built scenes', () => {
  it('stack of four boxes stays at rest', () => {
    const s = emptyScene('stack')
    addGround(s, { top: 0, material: { muS: 0.5, muK: 0.4 } })
    for (let i = 0; i < 4; i++) addBody(s, { name: `b${i}`, shape: { type: 'box', width: 0.4, height: 0.2 }, position: { x: 0, y: 0.1 + 0.2 * i }, mass: 1, material: { muS: 0.5, muK: 0.4 } })
    s.settings.duration = 2
    const { rec, drift } = ledgerDrift(s)
    const n = rec.system.n
    const last = rec.states.subarray((rec.frameCount - 1) * rec.size)
    for (let i = 0; i < 4; i++) expect(Math.abs(last[3 * n + 3 * i]) + Math.abs(last[3 * n + 3 * i + 1])).toBeLessThan(1e-9)
    expect(drift).toBeLessThan(1e-8)
  })
  it('bouncing ball (e = 0.8) comes to rest after finitely many bounces', () => {
    const s = emptyScene('bounce')
    addGround(s, { top: 0, material: { restitution: 1 } })
    addBody(s, { name: 'ball', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: 0, y: 1 }, mass: 0.2, material: { restitution: 0.8 } })
    s.settings.duration = 12
    const { rec, drift } = ledgerDrift(s)
    const impacts = rec.events.filter(e => e.changes.some(c => c.type === 'impact')).length
    expect(impacts).toBeGreaterThan(20)
    expect(impacts).toBeLessThan(200)
    expect(drift).toBeLessThan(1e-8)
  })
  it('block slides off a table edge, tips over the corner and falls', () => {
    const s = emptyScene('edge')
    addGround(s, { top: 0, left: -3, right: 3 })
    addBody(s, { name: 'table', kind: 'static', shape: { type: 'box', width: 1, height: 0.8 }, position: { x: -0.5, y: 0.4 }, material: { muS: 0.2, muK: 0.2 } })
    addBody(s, { name: 'block', shape: { type: 'box', width: 0.2, height: 0.1 }, position: { x: -0.5, y: 0.85 }, velocity: { x: 2, y: 0 }, mass: 1, material: { muS: 0.2, muK: 0.2 } })
    s.settings.duration = 1.5
    const { rec, drift } = ledgerDrift(s)
    expect(rec.events.some(e => e.changes.some(c => c.type === 'separate'))).toBe(true)
    expect(rec.events.some(e => e.changes.some(c => c.type === 'impact' && c.bodies.includes('s1')))).toBe(true)
    expect(drift).toBeLessThan(1e-8)
  })
  it('ball rolls down an incline onto the floor', () => {
    const s = emptyScene('roll')
    addIncline(s, { angle: Math.PI / 6, base: 2, material: { muS: 0.6, muK: 0.5 } })
    addGround(s, { top: 0, left: 2, right: 8, material: { muS: 0.6, muK: 0.5 } })
    const pl = onIncline(Math.PI / 6, 2, 0.2, 0.2, 0.2)
    addBody(s, { name: 'disc', shape: { type: 'circle', radius: 0.1 }, position: { x: pl.position.x, y: pl.position.y }, mass: 1, material: { muS: 0.6, muK: 0.5 } })
    s.settings.duration = 2
    const { drift } = ledgerDrift(s)
    expect(drift).toBeLessThan(1e-8)
  })
  it('two blocks joined by a spring on a rough floor', () => {
    const s = emptyScene('spring2')
    addGround(s, { top: 0, material: { muS: 0.3, muK: 0.2 } })
    const a = addBody(s, { name: 'a', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 0.1 }, mass: 1, velocity: { x: -1, y: 0 }, material: { muS: 0.3, muK: 0.2 } })
    const b = addBody(s, { name: 'b', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0.7, y: 0.1 }, mass: 2, velocity: { x: 1, y: 0 }, material: { muS: 0.3, muK: 0.2 } })
    addConnector<SpringDef>(s, { name: 'k', type: 'spring', a: anchor(a, { x: 0.1, y: 0 }), b: anchor(b, { x: -0.1, y: 0 }), stiffness: 40, restLength: null, damping: 0 })
    s.settings.duration = 4
    const { drift } = ledgerDrift(s)
    expect(drift).toBeLessThan(1e-8)
  })
  it('wedge on a frictionless floor with a block sliding down it (momentum x conserved)', () => {
    const s = emptyScene('wedge')
    addGround(s, { top: 0 })
    const th = Math.PI / 6, base = 0.9, h = base * Math.tan(th)
    addBody(s, { name: 'wedge', shape: { type: 'polygon', points: [{ x: -base / 3, y: -h / 3 }, { x: 2 * base / 3, y: -h / 3 }, { x: -base / 3, y: 2 * h / 3 }] }, position: { x: 0, y: h / 3 }, mass: 3, fixedRotation: true })
    // Block on the hypotenuse, 0.2 m from the top
    const c = Math.cos(th), sn = Math.sin(th)
    const top = { x: -base / 3, y: h }
    const p = { x: top.x + c * 0.2, y: top.y - sn * 0.2 }
    addBody(s, { name: 'block', shape: { type: 'box', width: 0.1, height: 0.06 }, position: { x: p.x + c * 0.05 + sn * 0.03, y: p.y - sn * 0.05 + c * 0.03 }, angle: -th, mass: 1, fixedRotation: true })
    s.settings.duration = 0.6
    const { rec, drift } = ledgerDrift(s)
    const n = rec.system.n
    const px = (k: number) => { const X = rec.states.subarray(k * rec.size); return 3 * X[3 * n] + 1 * X[3 * n + 3] }
    expect(Math.abs(px(rec.frameCount - 1) - px(0))).toBeLessThan(1e-10)
    expect(drift).toBeLessThan(1e-8)
  })
})
