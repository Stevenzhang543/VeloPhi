/**
 * Delta transport (decisions D13, D66): the deltas of a run replayed into a fresh recording store reproduce it bit
 * for bit (fingerprint, frame states, segments, events, solutions) and a tampered delta is refused; a progressive
 * job run in slices assembles into the same recording as a synchronous simulation and every partial is a prefix of
 * it; the client's main-thread fallback gives the same recording; the Rust recordings carry the fingerprints of the
 * TypeScript reference engine.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import type { Recording, RecordingEnd } from '../src/engine/recording'
import { RecordingStore, eventStates, frameImpactLoss, frameSegment, frameState, simulate } from '../src/engine/recording'
import { frameView } from '../src/engine/views'
import { core } from '../src/engine/core'
import { startSimJob } from '../src/worker/simJob'
import type { FromWorker } from '../src/worker/simJob'
import { startSimulation } from '../src/app/simClient'
import { cloneScene } from '../src/core/scene/io'
import { addBody, addConnector, addGround, anchor, emptyScene } from '../src/core/scene/build'
import type { ForceDef, Scene } from '../src/core/scene/types'
import { finiteDuration } from '../src/core/scene/types'
import type { Message } from '../src/i18n/message'
import { MessageError } from '../src/i18n/message'
import { renderMessage } from '../src/i18n/coreText'
import { simulate as refSimulate } from './reference/core/solver/simulation'
import { streamRun } from './helpers/stream'

/** Variable force with jumps, a rough floor and a bouncing rough disc: switches, frictional impacts, slips. */
function mixedScene(): Scene {
  const s = emptyScene('mixed')
  s.settings.gravity = { x: 0, y: -9.8 }
  addGround(s, { id: 'ground', top: 0, left: -5, right: 20, material: { muS: 0.4, muK: 0.3, restitution: 1 } })
  const b = addBody(s, { id: 'box', name: '物块', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 0.1 }, mass: 1, material: { muS: 0.4, muK: 0.3 } })
  addConnector<ForceDef>(s, { id: 'F', name: 'F', type: 'force', a: anchor(b), force: { x: 0, y: 0 }, expr: { x: 'if(t < 0.4, 6, -1) + 2*step(t - 0.9)', y: '0' } })
  addBody(s, { id: 'disc', name: '圆盘', shape: { type: 'circle', radius: 0.08 }, position: { x: 2, y: 0.6 }, velocity: { x: 1, y: 0 }, angularVelocity: 12, mass: 0.5, material: { muS: 0.5, muK: 0.4, restitution: 0.6 } })
  s.settings.duration = 1.6
  return s
}

const cases: Array<[string, () => Scene]> = [
  ['board-block', () => buildTemplate('board-block')],
  ['collision-2d', () => buildTemplate('collision-2d')],
  ['vertical-circle-rope', () => buildTemplate('vertical-circle-rope')],
  ['movable-pulley', () => buildTemplate('movable-pulley')],
  ['mixed', mixedScene]
]

/** A scene with its duration made finite (the jobs run bounded). */
function bounded(make: () => Scene): Scene {
  const scene = cloneScene(make())
  scene.settings.duration = finiteDuration(scene.settings)
  return scene
}

function expectSame(a: Recording, b: Recording) {
  expect(b.hash).toBe(a.hash)
  expect(b.frameCount).toBe(a.frameCount)
  for (let k = 0; k < a.frameCount; k++) {
    const x = frameState(a, k), y = frameState(b, k)
    for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i])) expect([k, i, y[i]]).toEqual([k, i, x[i]])
    if (frameSegment(b, k) !== frameSegment(a, k)) expect(frameSegment(b, k)).toBe(frameSegment(a, k))
    if (!Object.is(frameImpactLoss(b, k), frameImpactLoss(a, k))) expect(frameImpactLoss(b, k)).toBe(frameImpactLoss(a, k))
  }
  expect(b.segments.map(s => [s.t0, s.t1, s.label, s.impactLoss])).toEqual(a.segments.map(s => [s.t0, s.t1, s.label, s.impactLoss]))
  expect(b.events.map(e => [e.t, e.triggers, e.changes, e.segment])).toEqual(a.events.map(e => [e.t, e.triggers, e.changes, e.segment]))
  expect(b.events.map(e => e.impact?.points.map(p => [p.pair, p.rope, p.impulse, p.vnAfter]))).toEqual(a.events.map(e => e.impact?.points.map(p => [p.pair, p.rope, p.impulse, p.vnAfter])))
  for (let i = 0; i < a.events.length; i++) expect(Array.from(eventStates(b, i).after)).toEqual(Array.from(eventStates(a, i).after))
  expect([b.completed, b.error, b.warnings]).toEqual([a.completed, a.error, a.warnings])
  for (let k = 0; k < a.frameCount; k += Math.max(1, Math.floor(a.frameCount / 37))) {
    const va = frameView(a, k * a.dt, { forces: 'all' }), vb = frameView(b, k * b.dt, { forces: 'all' })
    expect(Array.from(vb.acc ?? [])).toEqual(Array.from(va.acc ?? []))
    expect(vb.ropes).toEqual(va.ropes)
    expect([...vb.forces]).toEqual([...va.forces])
  }
}

describe('deltas replayed into a fresh store', () => {
  for (const [name, make] of cases) {
    it(name, () => {
      const scene = bounded(make)
      const ref = simulate(cloneScene(scene))
      const deltas: Uint8Array[] = []
      // Small advance calls: tail deltas of unfinished chunks as well as closed chunks
      const { rec } = streamRun(scene, { steps: 300, onDelta: d => deltas.push(d) })
      expect(deltas.length).toBeGreaterThan(2)
      expectSame(ref, rec)
      const store = new RecordingStore(cloneScene(scene), { chunkFrames: rec.chunkFrames, duration: scene.settings.duration })
      for (const d of deltas) store.apply(structuredClone(d))
      const end: RecordingEnd = { completed: rec.completed, error: rec.error, hash: rec.hash, stopReason: rec.stopReason }
      expectSame(ref, store.final(end))
      // The Rust recording carries the fingerprint of the TypeScript reference engine
      expect(rec.hash).toBe(refSimulate(cloneScene(scene)).hash)
    })
  }
  it('a tampered delta is refused', () => {
    const scene = bounded(() => buildTemplate('incline'))
    const deltas: Uint8Array[] = []
    const { rec } = streamRun(scene, { onDelta: d => deltas.push(d) })
    const store = new RecordingStore(cloneScene(scene), { chunkFrames: rec.chunkFrames, duration: scene.settings.duration })
    const bad = deltas[0].slice()
    // Flip the lowest mantissa bit of one frame state (the container's JSON points into its blob, offsets in bytes)
    const n = bad[4] | (bad[5] << 8) | (bad[6] << 16) | (bad[7] << 24)
    const ref = (JSON.parse(new TextDecoder().decode(bad.subarray(8, 8 + n))) as { states: { $f64: [number, number] } }).states.$f64
    expect(ref[1]).toBeGreaterThan(10)
    bad[Math.ceil((8 + n) / 8) * 8 + ref[0] + 8 * 7] ^= 1
    expect(() => {
      store.apply(bad)
      for (const d of deltas.slice(1)) store.apply(d)
      store.final({ completed: rec.completed, error: rec.error, hash: rec.hash, stopReason: rec.stopReason })
    }).toThrow()
  })
})

describe('progressive worker job', () => {
  for (const [name, make] of cases) {
    it(`${name}: slices assemble into the same recording, partials are prefixes`, () => {
      const scene = bounded(make)
      const ref = simulate(cloneScene(scene))
      const queue: Array<() => void> = []
      const msgs: FromWorker[] = []
      startSimJob(core(), cloneScene(scene), 60000, m => msgs.push(structuredClone(m)), fn => queue.push(fn), { sliceMs: 2, transfer: false })
      while (queue.length) queue.shift()!()
      expect(msgs[0].type).toBe('started')
      const started = msgs[0] as Extract<FromWorker, { type: 'started' }>
      expect(started.duration).toBe(scene.settings.duration)
      const store = new RecordingStore(cloneScene(scene), { chunkFrames: started.chunkFrames, duration: started.duration })
      let partials = 0, lastFrames = 0
      for (const m of msgs.slice(1)) {
        if (m.type === 'error') throw new Error(m.message)
        if (m.type === 'started' || m.type === 'engine') continue
        if (m.delta) store.apply(m.delta)
        if (m.type === 'partial') {
          const p = store.snapshot()
          partials++
          expect(p.completed).toBe(false)
          expect(p.hash).toBe('')
          expect(p.frameCount).toBeGreaterThanOrEqual(lastFrames)
          lastFrames = p.frameCount
          const k = p.frameCount - 1
          expect(Array.from(frameState(p, k))).toEqual(Array.from(frameState(ref, k)))
          expect(p.events.length).toBeLessThanOrEqual(ref.events.length)
          if (p.events.length) expect(p.events[p.events.length - 1].t).toBe(ref.events[p.events.length - 1].t)
          expect(Array.from(frameView(p, k * p.dt).acc ?? [])).toEqual(Array.from(frameView(ref, k * ref.dt).acc ?? []))
        } else {
          expectSame(ref, store.final(m.end))
        }
      }
      expect(partials).toBeGreaterThan(0)
      expect(msgs[msgs.length - 1].type).toBe('done')
    })
  }
  it('a scene error is posted as an error message', () => {
    const s = mixedScene()
    const f = s.connectors.find(c => c.type === 'force')
    if (f?.type === 'force') f.expr = { x: 'x + vx', y: '0' }
    const msgs: FromWorker[] = []
    startSimJob(core(), s, 1000, m => msgs.push(m), fn => fn())
    expect(msgs).toHaveLength(1)
    expect(msgs[0].type).toBe('error')
    if (msgs[0].type === 'error') {
      expect(msgs[0].msg?.key).toBe('scene.forceExprInvalid')
      expect((msgs[0].msg?.params.reason as Message).key).toMatch(/^expr\./)
    }
  })
})

describe('simulation client (main-thread fallback in Node)', () => {
  it('delivers growing prefixes and the same final recording', async () => {
    const scene = buildTemplate('pendulum', { theta0: 20 })
    scene.settings.duration = 30
    const ref = simulate(cloneScene(scene))
    const partials: Recording[] = []
    const progress: number[] = []
    const h = startSimulation(scene, { budgetMs: 60000, useWorker: true, progressive: true }, { onPartial: r => partials.push(r), onProgress: t => progress.push(t) })
    const rec = await h.done
    expect(rec).not.toBeNull()
    expectSame(ref, rec!)
    expect(progress.length).toBeGreaterThan(3)
    for (const p of partials) {
      expect(p.completed).toBe(false)
      const k = p.frameCount - 1
      expect(Array.from(frameState(p, k))).toEqual(Array.from(frameState(ref, k)))
    }
  })
  it('cancel resolves with null', async () => {
    const scene = buildTemplate('pendulum')
    scene.settings.duration = 60
    const h = startSimulation(scene, { budgetMs: 60000, useWorker: false, progressive: false })
    setTimeout(() => h.cancel(), 30)
    expect(await h.done).toBeNull()
  })
  it('scene errors reject', async () => {
    const s = mixedScene()
    const f = s.connectors.find(c => c.type === 'force')
    if (f?.type === 'force') f.expr = { x: 'sin(t)', y: '0' }
    const err = await startSimulation(s, { budgetMs: 1000, useWorker: false, progressive: false }).done.catch(e => e)
    expect(err).toBeInstanceOf(MessageError)
    expect(renderMessage((err as MessageError).msg, 'zh')).toMatch(/无量纲/)
  })
})
