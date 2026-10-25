/**
 * Worker transport (decision D13): decode(encode(rec)) reproduces the recording bit for bit (hash, frame
 * states, mode solutions, events); a progressive run posted in slices assembles into the same recording
 * and every partial is a prefix of it; the client's main-thread fallback gives the same hash as simulate().
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import type { Recording } from '../src/core/solver/simulation'
import { SimulationRun, frameImpactLoss, frameSegment, frameSolution, frameState, recordingHash, recordingStates, simulate } from '../src/core/solver/simulation'
import { decodeRecording, encodeRecording } from '../src/core/solver/transport'
import { StreamRecording } from '../src/core/solver/stream'
import { startSimJob } from '../src/worker/simJob'
import type { FromWorker } from '../src/worker/simJob'
import { startSimulation } from '../src/app/simClient'
import { cloneScene } from '../src/core/scene/io'
import { addBody, addConnector, addGround, anchor, emptyScene } from '../src/core/scene/build'
import type { ForceDef, Scene } from '../src/core/scene/types'
import { finiteDuration } from '../src/core/scene/types'

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

function expectSame(a: Recording, b: Recording) {
  expect(b.hash).toBe(a.hash)
  const sa = recordingStates(a), sb = recordingStates(b)
  expect(recordingHash(sb, b.events)).toBe(a.hash)
  expect(b.frameCount).toBe(a.frameCount)
  expect(Buffer.from(sb.buffer).equals(Buffer.from(sa.buffer))).toBe(true)
  for (let k = 0; k < a.frameCount; k++) {
    if (frameSegment(b, k) !== frameSegment(a, k)) expect(frameSegment(b, k)).toBe(frameSegment(a, k))
    if (!Object.is(frameImpactLoss(b, k), frameImpactLoss(a, k))) expect(frameImpactLoss(b, k)).toBe(frameImpactLoss(a, k))
  }
  expect(b.segments.map(s => [s.t0, s.t1, s.label, s.impactLoss])).toEqual(a.segments.map(s => [s.t0, s.t1, s.label, s.impactLoss]))
  expect(b.events.map(e => [e.t, e.triggers, e.changes, e.segment])).toEqual(a.events.map(e => [e.t, e.triggers, e.changes, e.segment]))
  expect(b.events.map(e => e.impact?.points.map(p => [p.pair?.key, p.feature?.key, p.impulse, p.tangentImpulse]))).toEqual(a.events.map(e => e.impact?.points.map(p => [p.pair?.key, p.feature?.key, p.impulse, p.tangentImpulse])))
  expect([b.completed, b.error, b.warnings]).toEqual([a.completed, a.error, a.warnings])
  for (let k = 0; k < a.frameCount; k += Math.max(1, Math.floor(a.frameCount / 37))) {
    const sa = frameSolution(a, k), sb = frameSolution(b, k)
    expect(Array.from(sb.acc)).toEqual(Array.from(sa.acc))
    expect(Array.from(sb.lambda)).toEqual(Array.from(sa.lambda))
    expect(sb.ropeTension).toEqual(sa.ropeTension)
  }
}

describe('decode(encode(recording))', () => {
  for (const [name, make] of cases) {
    it(name, () => {
      const rec = simulate(make())
      const posted = structuredClone(encodeRecording(rec))
      const back = decodeRecording(make(), posted)
      expectSame(rec, back)
    })
  }
  it('a tampered recording is refused', () => {
    const rec = simulate(buildTemplate('incline'))
    const enc = encodeRecording(rec)
    enc.delta.states[100] += 1e-9
    expect(() => decodeRecording(buildTemplate('incline'), enc)).toThrow(/fingerprint/)
  })
})

describe('progressive worker job', () => {
  for (const [name, make] of cases) {
    it(`${name}: slices assemble into the same recording, partials are prefixes`, () => {
      const scene = cloneScene(make())
      scene.settings.duration = finiteDuration(scene.settings)
      const ref = simulate(cloneScene(scene))
      const queue: Array<() => void> = []
      const msgs: FromWorker[] = []
      startSimJob(structuredClone(scene), 60000, m => msgs.push(structuredClone(m)), fn => queue.push(fn), 2)
      while (queue.length) queue.shift()!()
      expect(msgs[0].type).toBe('started')
      const started = msgs[0] as Extract<FromWorker, { type: 'started' }>
      expect(started.duration).toBe(scene.settings.duration)
      const asm = new StreamRecording({ scene, chunkFrames: started.chunkFrames, duration: started.duration })
      let partials = 0, lastFrames = 0
      for (const m of msgs.slice(1)) {
        if (m.type === 'error') throw new Error(m.message)
        if (m.type === 'started' || m.type === 'engine') continue
        asm.apply(m.delta)
        if (m.type === 'partial') {
          const p = asm.snapshot()
          partials++
          expect(p.completed).toBe(false)
          expect(p.hash).toBe('')
          expect(p.frameCount).toBeGreaterThanOrEqual(lastFrames)
          lastFrames = p.frameCount
          const k = p.frameCount - 1
          expect(Array.from(frameState(p, k))).toEqual(Array.from(frameState(ref, k)))
          expect(p.events.length).toBeLessThanOrEqual(ref.events.length)
          if (p.events.length) expect(p.events[p.events.length - 1].t).toBe(ref.events[p.events.length - 1].t)
          const sp = frameSolution(p, k), sr = frameSolution(ref, k)
          expect(Array.from(sp.acc)).toEqual(Array.from(sr.acc))
        } else {
          expectSame(ref, asm.final(m.end))
        }
      }
      expect(partials).toBeGreaterThan(0)
      expect(msgs[msgs.length - 1].type).toBe('done')
    })
  }
  it('incremental runs on this thread match simulate() whatever the slicing', () => {
    const scene = mixedScene()
    const ref = simulate(cloneScene(scene))
    const run = new SimulationRun(cloneScene(scene))
    let slices = 0
    while (!run.advance(Date.now() - 1)) slices++
    expect(slices).toBeGreaterThan(100)
    expect(run.result().hash).toBe(ref.hash)
  })
  it('a scene error is posted as an error message', () => {
    const s = mixedScene()
    const f = s.connectors.find(c => c.type === 'force')
    if (f?.type === 'force') f.expr = { x: 'x + vx', y: '0' }
    const msgs: FromWorker[] = []
    startSimJob(s, 1000, m => msgs.push(m), fn => fn())
    expect(msgs).toEqual([{ type: 'error', message: expect.stringContaining('量纲') }])
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
    await expect(startSimulation(s, { budgetMs: 1000, useWorker: false, progressive: false }).done).rejects.toThrow(/无量纲/)
  })
})
