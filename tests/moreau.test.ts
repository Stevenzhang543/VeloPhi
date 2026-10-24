/**
 * Moreau–Jean fallback (P2, reduced accuracy): chosen explicitly or taken over automatically when events
 * pile up. It must be flagged, reproducible, transportable, free of penetration, never gain energy, and
 * keep the formula layer away from its frames.
 */
import { describe, expect, it } from 'vitest'
import { addBody, addGround, emptyScene } from '../src/core/scene/build'
import type { Scene } from '../src/core/scene/types'
import { exactStateAt, frameState, simulate } from '../src/core/solver/simulation'
import { energy } from '../src/core/solver/dynamics'
import { computePoses, probeValue } from '../src/core/solver/kinematics'
import { decodeRecording, encodeRecording } from '../src/core/solver/transport'
import { recognize } from '../src/formula/situations'
import { parseScene, serializeScene } from '../src/core/scene/io'

/** A wall-less pile: a row of boxes on rough ground, more boxes and discs dropped on top. */
function pile(): Scene {
  const s = emptyScene('pile')
  s.settings.gravity = { x: 0, y: -9.8 }
  const mat = { muS: 0.5, muK: 0.4, restitution: 0.3 }
  addGround(s, { top: 0, left: -4, right: 4, material: mat })
  for (let i = 0; i < 5; i++) addBody(s, { name: `底${i}`, shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: -0.44 + 0.22 * i, y: 0.1 }, mass: 1, material: mat })
  for (let i = 0; i < 4; i++) addBody(s, { name: `中${i}`, shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: -0.33 + 0.22 * i, y: 0.35 + 0.02 * i }, mass: 0.8, material: mat })
  for (let i = 0; i < 3; i++) addBody(s, { name: `块${i}`, shape: { type: 'box', width: 0.14, height: 0.1 }, position: { x: -0.2 + 0.21 * i, y: 0.8 + 0.1 * i }, angle: 0.3 * (i - 1), velocity: { x: 0.3 * (i - 1), y: 0 }, mass: 0.5, material: mat })
  s.settings.duration = 1.5
  s.settings.integrator = 'moreau'
  return s
}

function penetration(rec: ReturnType<typeof simulate>, k: number): number {
  const sys = rec.system
  const poses = computePoses(sys.model, frameState(rec, k))
  let worst = 0
  for (const p of sys.pairs) for (const pr of p.probes) worst = Math.min(worst, probeValue(pr, poses))
  return -worst
}

describe('Moreau–Jean time stepping', () => {
  const rec = simulate(pile())
  it('is flagged as reduced accuracy', () => {
    expect(rec.error).toBeNull()
    expect(rec.reducedFrom).toBe(0)
    expect(rec.warnings.some(w => w.includes('Moreau–Jean') && w.includes('精度降级'))).toBe(true)
    expect(rec.events[0].changes[0].type).toBe('timestep')
    expect(rec.segments.every(s => s.reduced)).toBe(true)
    expect(recognize(rec)).toEqual([])
  })
  it('keeps bodies out of each other and comes to rest without gaining energy', () => {
    let worst = 0
    for (let k = 0; k < rec.frameCount; k += 5) worst = Math.max(worst, penetration(rec, k))
    expect(worst).toBeLessThan(1e-6)
    const sys = rec.system
    const E0 = energy(sys, frameState(rec, 0)).total
    let maxE = -Infinity
    for (let k = 0; k < rec.frameCount; k++) maxE = Math.max(maxE, energy(sys, frameState(rec, k)).total)
    expect(maxE).toBeLessThanOrEqual(E0 + 1e-6 * Math.abs(E0))
    const last = energy(sys, frameState(rec, rec.frameCount - 1))
    expect(last.kinetic).toBeLessThan(1e-3)
    // The ledger books what the impulses removed
    expect(rec.impactLoss[rec.frameCount - 1]).toBeGreaterThan(0)
  })
  it('is reproducible and survives save/load and transport', () => {
    expect(simulate(parseScene(serializeScene(pile())).scene).hash).toBe(rec.hash)
    const back = decodeRecording(pile(), structuredClone(encodeRecording(rec)))
    expect(back.hash).toBe(rec.hash)
    expect(back.reducedFrom).toBe(0)
    expect(back.segments.every(s => s.reduced)).toBe(true)
  })
  it('states between frames are interpolated, not integrated', () => {
    const t = 0.5 + rec.dt / 2
    const k = Math.floor(t / rec.dt)
    const X = exactStateAt(rec, t), A = frameState(rec, k), B = frameState(rec, k + 1)
    expect(X[0]).toBeCloseTo((A[0] + B[0]) / 2, 14)
  })
  it('a ball bounces to about e² of its height', () => {
    const s = emptyScene('ball')
    s.settings.gravity = { x: 0, y: -9.8 }
    addGround(s, { top: 0, material: { restitution: 1 } })
    addBody(s, { name: 'ball', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: 0, y: 1.05 }, mass: 0.2, material: { restitution: 0.5 } })
    s.settings.duration = 1.2
    s.settings.integrator = 'moreau'
    const r = simulate(s)
    let peak = 0, after = false
    for (let k = 1; k < r.frameCount; k++) {
      const y = frameState(r, k)[1], v = frameState(r, k)[3 * r.system.n + 1]
      if (v > 0) after = true
      if (after) peak = Math.max(peak, y - 0.05)
    }
    expect(Math.abs(peak - 0.25) / 0.25).toBeLessThan(0.02)
  })
})

describe('automatic fallback when events pile up', () => {
  function bounce(): Scene {
    const s = emptyScene('bounce')
    s.settings.gravity = { x: 0, y: -9.8 }
    addGround(s, { top: 0, material: { restitution: 1 } })
    addBody(s, { name: 'ball', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: 0, y: 1 }, mass: 0.2, material: { restitution: 0.8 } })
    s.settings.duration = 8
    return s
  }
  it('takes over after the event limit, keeps the exact prefix and finishes the run', () => {
    const exact = simulate(bounce())
    const rec = simulate(bounce(), { fallback: { events: 5, window: 100 } })
    expect(rec.error).toBeNull()
    expect(rec.completed).toBe(true)
    expect(rec.reducedFrom).not.toBeNull()
    const sixth = exact.events[5]
    expect(rec.reducedFrom).toBe(sixth.t)
    // Identical up to the switch
    const kSwitch = Math.floor(sixth.t / rec.dt)
    for (let k = 0; k <= kSwitch; k += 37) expect(Array.from(frameState(rec, k))).toEqual(Array.from(frameState(exact, k)))
    expect(rec.events.find(e => e.changes.some(c => c.type === 'timestep'))!.t).toBe(sixth.t)
    // The ball ends at rest on the ground
    const X = frameState(rec, rec.frameCount - 1)
    expect(Math.abs(X[1] - 0.05)).toBeLessThan(1e-6)
    expect(Math.abs(X[3 * rec.system.n + 1])).toBeLessThan(1e-6)
    // Formulas only before the switch
    for (const s of recognize(rec)) expect(s.t0).toBeLessThanOrEqual(rec.reducedFrom!)
  })
  it('fallback: false keeps the 26.48 behaviour (no switch)', () => {
    expect(simulate(bounce(), { fallback: false }).reducedFrom).toBeUndefined()
  })
})
