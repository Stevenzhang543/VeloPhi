/**
 * Streaming runs (decision D26, docs/dev/STREAMING.md): chunks rebuilt from their checkpoints are bit-identical
 * to the original run (frames, events, the next checkpoint), whatever is evicted and in which order; fingerprints
 * do not depend on eviction; a bounded run keeps the 26.49 recording; stop conditions, permanent rest and the
 * memory budget behave as documented.
 */
import { describe, expect, it } from 'vitest'
import { TEMPLATES, buildTemplate } from '../src/templates'
import type { Recording } from './reference/core/solver/simulation'
import { SimulationRun, frameImpactLoss, frameSegment, frameState, rebuildChunk, recordingStates, simulate } from './reference/core/solver/simulation'
import { StreamRecording } from './reference/core/solver/stream'
import { DeltaWriter } from './reference/core/solver/transport'
import { decodeCheckpoint, encodeCheckpoint } from './reference/core/solver/checkpoint'
import { Sha256 } from './reference/core/record/sha256'
import { cloneScene, parseScene, serializeScene, validateScene } from '../src/core/scene/io'
import { addBody, addConnector, addGround, anchor, emptyScene } from '../src/core/scene/build'
import type { ForceDef, Scene, SpringDef } from '../src/core/scene/types'
import { SCENE_VERSION } from '../src/core/scene/types'

/** 26.49 fingerprint of the board-block template at its 2.5 s duration (tests/golden.test.ts). */
const BOARD_BLOCK_HASH = 'bb1283491e1cb3e5cbd463c2d839f0cdee83def25231b27c43a11edd10c9d2d5'

/** A ball bouncing on a floor (e = 0.8): impacts pile up until the run falls back to time stepping. */
function bounce(): Scene {
  const s = emptyScene('bounce')
  s.settings.gravity = { x: 0, y: -9.8 }
  addGround(s, { top: 0, material: { restitution: 1 } })
  addBody(s, { name: 'ball', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: 0, y: 1 }, mass: 0.2, material: { restitution: 0.8 } })
  s.settings.legacyDuration = 12
  return s
}

/** Variable force with jumps, a rough floor and a bouncing rough disc: switches, frictional impacts, slips. */
function mixed(): Scene {
  const s = emptyScene('mixed')
  s.settings.gravity = { x: 0, y: -9.8 }
  addGround(s, { id: 'ground', top: 0, left: -5, right: 20, material: { muS: 0.4, muK: 0.3, restitution: 1 } })
  const b = addBody(s, { id: 'box', name: '物块', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 0.1 }, mass: 1, material: { muS: 0.4, muK: 0.3 } })
  addConnector<ForceDef>(s, { id: 'F', name: 'F', type: 'force', a: anchor(b), force: { x: 0, y: 0 }, expr: { x: 'if(t < 0.4, 6, -1) + 2*step(t - 0.9)', y: '0' } })
  addBody(s, { id: 'disc', name: '圆盘', shape: { type: 'circle', radius: 0.08 }, position: { x: 2, y: 0.6 }, velocity: { x: 1, y: 0 }, angularVelocity: 12, mass: 0.5, material: { muS: 0.5, muK: 0.4, restitution: 0.6 } })
  s.settings.legacyDuration = 1.6
  return s
}

/** Two blocks joined by a spring on a rough floor (they slide, stick and slip). */
function spring2(): Scene {
  const s = emptyScene('spring2')
  s.settings.gravity = { x: 0, y: -9.8 }
  addGround(s, { top: 0, material: { muS: 0.3, muK: 0.2 } })
  const a = addBody(s, { name: 'a', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 0.1 }, mass: 1, velocity: { x: -1, y: 0 }, material: { muS: 0.3, muK: 0.2 } })
  const b = addBody(s, { name: 'b', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0.7, y: 0.1 }, mass: 2, velocity: { x: 1, y: 0 }, material: { muS: 0.3, muK: 0.2 } })
  addConnector<SpringDef>(s, { name: 'k', type: 'spring', a: anchor(a, { x: 0.1, y: 0 }), b: anchor(b, { x: -0.1, y: 0 }), stiffness: 40, restLength: null, damping: 0 })
  s.settings.legacyDuration = 4
  return s
}

/** A pile of boxes computed by Moreau–Jean time stepping from the start. */
function pile(): Scene {
  const s = emptyScene('pile')
  s.settings.gravity = { x: 0, y: -9.8 }
  const mat = { muS: 0.5, muK: 0.4, restitution: 0.3 }
  addGround(s, { top: 0, left: -4, right: 4, material: mat })
  for (let i = 0; i < 3; i++) addBody(s, { name: `底${i}`, shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: -0.22 + 0.22 * i, y: 0.1 }, mass: 1, material: mat })
  for (let i = 0; i < 2; i++) addBody(s, { name: `块${i}`, shape: { type: 'box', width: 0.14, height: 0.1 }, position: { x: -0.1 + 0.21 * i, y: 0.6 + 0.1 * i }, angle: 0.3 * i, mass: 0.5, material: mat })
  s.settings.legacyDuration = 0.6
  s.settings.integrator = 'moreau'
  return s
}

const special: Array<[string, () => Scene]> = [['bounce (event storm → fallback)', bounce], ['mixed (switches, rough impacts)', mixed], ['spring2 (stick/slip)', spring2], ['pile (Moreau–Jean)', pile]]

/** Same bits (−0 ≠ +0). */
function sameBits(a: Float64Array, b: Float64Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false
  return true
}

/** Run a scene to the end with a given duration, keeping every chunk. */
function runAll(scene: Scene, duration: number | null, chunkSeconds = 1): SimulationRun {
  const run = new SimulationRun(scene, { duration, chunkSeconds })
  run.advance(Infinity)
  return run
}

/** Rebuild every closed chunk of a finished run from its checkpoint and compare frames, events and checkpoints. */
function checkRebuilds(scene: Scene, run: SimulationRun, duration: number | null, chunkSeconds = 1) {
  const F = run.chunkFrames
  for (const c of run.closed) {
    const cp = run.checkpoints[c.chunk]
    if (!cp) continue
    const next = run.checkpoints[c.chunk + 1]
    const end = next ? c.first + F : c.first + c.frames - 1
    const r = rebuildChunk(scene, run.system, cp, { duration, chunkSeconds }, end)
    const orig = run.frames.chunks[c.chunk]!
    expect(r.chunk.count).toBeGreaterThanOrEqual(c.frames)
    expect(sameBits(r.chunk.states.subarray(0, c.frames * run.size), orig.states.subarray(0, c.frames * run.size))).toBe(true)
    expect(Array.from(r.chunk.segment.subarray(0, c.frames))).toEqual(Array.from(orig.segment.subarray(0, c.frames)))
    expect(sameBits(r.chunk.impactLoss.subarray(0, c.frames), orig.impactLoss.subarray(0, c.frames))).toBe(true)
    expect(r.again && sameBits(r.again, cp)).toBe(true)
    if (next) expect(r.next && sameBits(r.next, next)).toBe(true)
    for (const e of r.events) {
      if (e.index >= c.eventsTo) break
      const o = run.events[e.index]
      expect([e.t, e.segment, e.triggers, e.changes]).toEqual([o.t, o.segment, o.triggers, o.changes])
      expect(sameBits(e.after, o.after)).toBe(true)
    }
  }
}

describe('checkpoints', () => {
  it('encode and decode losslessly', () => {
    const run = runAll(buildTemplate('board-block'), 2.5)
    for (const cp of run.checkpoints) {
      if (!cp) continue
      expect(sameBits(encodeCheckpoint(decodeCheckpoint(cp)), cp)).toBe(true)
    }
  })
})

describe('chunk rebuild is bit-identical', () => {
  for (const [name, make] of special) {
    it(`${name}: bounded and unbounded`, () => {
      const scene = make()
      const T = scene.settings.legacyDuration
      const run = runAll(scene, T, 0.3)
      expect(run.result().hash).toBe(simulate(make()).hash)
      checkRebuilds(scene, run, T, 0.3)
      // Unbounded: stopped by the user at the same length
      const u = new SimulationRun(make(), { duration: null, chunkSeconds: 0.3 })
      u.advance(Infinity, Math.round(T / u.dt))
      u.stop()
      // 26.51: the blocks stick with the spring held by static friction; that is approximate rest
      expect(['user', 'rest', 'restApprox']).toContain(u.stopReason)
      checkRebuilds(scene, u, null, 0.3)
    })
  }
  for (const t of TEMPLATES) {
    it(`${t.id} (bounded, legacy duration)`, () => {
      const scene = buildTemplate(t.id)
      const run = runAll(scene, scene.settings.legacyDuration, 0.25)
      expect(run.result().hash).toBe(simulate(buildTemplate(t.id)).hash)
      checkRebuilds(scene, run, scene.settings.legacyDuration, 0.25)
    })
  }
})

/** Feed a run to a StreamRecording through the DeltaWriter in small slices, as the worker does (cloned, tails too). */
function streamRun(scene: Scene, duration: number | null, untilFrame: number, budgetBytes = Infinity, chunkSeconds = 1): { run: SimulationRun; stream: StreamRecording; deltas: number } {
  const run = new SimulationRun(cloneScene(scene), { duration, chunkSeconds })
  const writer = new DeltaWriter(run, true)
  const stream = new StreamRecording({ scene: cloneScene(scene), chunkFrames: run.chunkFrames, duration, budgetBytes })
  let deltas = 0, slice = 0
  for (;;) {
    const done = run.advance(Date.now() + 2, untilFrame)
    if (!done && run.k >= untilFrame) run.stop()
    for (const d of writer.next(++slice % 7 === 0)) { stream.apply(structuredClone(d)); deltas++ }
    if (run.finished) break
  }
  const end = run.result()
  stream.final({ completed: end.completed, error: end.error, hash: end.hash, stopReason: end.stopReason })
  return { run, stream, deltas }
}

/** Frame data of two recordings are the same bits on the given frames. */
function expectSameFrames(a: Recording, b: Recording, frames: Iterable<number>) {
  for (const k of frames) {
    expect(sameBits(frameState(a, k), frameState(b, k))).toBe(true)
    expect(frameSegment(a, k)).toBe(frameSegment(b, k))
    expect(Object.is(frameImpactLoss(a, k), frameImpactLoss(b, k))).toBe(true)
  }
}

/** Deterministic pseudo-random sequence (xorshift). */
function rng(seed: number) {
  let x = seed >>> 0 || 1
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32 }
}

describe('stream recording with eviction', () => {
  it('random eviction and access patterns give the frames of the uninterrupted run', () => {
    for (const [name, make, T] of [['pendulum', () => buildTemplate('pendulum', { theta0: 40 }), 40], ['mixed', mixed, 6], ['spring2', spring2, 12]] as Array<[string, () => Scene, number]>) {
      const scene = make()
      const ref = new SimulationRun(cloneScene(scene), { duration: null })
      ref.advance(Infinity, Math.round(T / ref.dt))
      ref.stop()
      const refRec = ref.result()
      // spring2 comes to approximate rest after a few seconds (26.51): a smaller budget still forces evictions
      const { stream } = streamRun(scene, null, Math.round(T / ref.dt), name === 'spring2' ? 200_000 : 600_000)
      const rec = stream.snapshot()
      expect(rec.frameCount, name).toBe(refRec.frameCount)
      expect(rec.hash, name).toBe(refRec.hash)
      const mem = stream.memory()
      expect(mem.residentChunks, name).toBeLessThan(mem.chunks)
      const rand = rng(name.length * 7919)
      const frames: number[] = []
      for (let i = 0; i < 120; i++) {
        frames.push(Math.floor(rand() * rec.frameCount))
        if (rand() < 0.2) stream.evictChunk(Math.floor(rand() * stream.chunkCount))
      }
      expectSameFrames(rec, refRec, frames)
      expect(stream.memory().rebuilds, name).toBeGreaterThan(0)
    }
  })

  it('the rolling fingerprint does not depend on eviction', () => {
    const scene = buildTemplate('spring-blocks')
    const a = streamRun(scene, null, 600 * 20)
    const b = streamRun(scene, null, 600 * 20, 300_000)
    expect(b.stream.memory().evictions).toBeGreaterThan(0)
    expect(b.stream.snapshot().hash).toBe(a.stream.snapshot().hash)
    expect(b.stream.rollingFingerprint()).toEqual(a.stream.rollingFingerprint())
    // Recompute the chain from frames read back (chunks rebuilt from their checkpoints)
    const rec = b.stream.snapshot()
    const all = recordingStates(rec)
    expect(new Sha256().updateFloat64(all).digestHex()).toBe(new Sha256().updateFloat64(recordingStates(a.stream.snapshot())).digestHex())
  })

  it('a bounded run of 2.5 s keeps the 26.49 fingerprint, through the stream too', () => {
    const scene = buildTemplate('board-block')
    scene.settings.duration = 2.5
    expect(simulate(cloneScene(scene)).hash).toBe(BOARD_BLOCK_HASH)
    const { stream } = streamRun(scene, 2.5, Infinity, 100_000)
    expect(stream.snapshot().hash).toBe(BOARD_BLOCK_HASH)
    expect(stream.snapshot().stopReason).toBe('duration')
  })

  it('memory stays within a small budget on a long run', () => {
    const budget = 2_000_000
    const { stream } = streamRun(buildTemplate('pendulum'), null, 600 * 300, budget)
    const m = stream.memory()
    expect(m.chunks).toBe(301)
    expect(m.memoryBytes).toBeLessThanOrEqual(budget)
    expect(m.residentChunks).toBeLessThan(40)
    expect(m.checkpoints).toBe(301)
  })
})

describe('stop conditions', () => {
  it('stopAt: one second after common velocity', () => {
    const scene = buildTemplate('board-block')
    scene.settings.stopAt = { on: 'stick', after: 1 }
    const run = new SimulationRun(cloneScene(scene), { duration: null })
    run.advance(Infinity)
    const rec = run.result()
    expect(rec.stopReason).toBe('stopAt')
    expect(rec.completed).toBe(true)
    const stick = rec.events.find(e => e.changes.some(c => c.type === 'stick'))!
    expect(stick).toBeTruthy()
    expect(rec.frameCount - 1).toBe(Math.ceil((stick.t + 1) / rec.dt))
    // The frames are those of the bounded run
    const ref = simulate(buildTemplate('board-block'), { duration: 5 })
    expectSameFrames(rec, ref, [0, 100, 777, rec.frameCount - 1])
    // A bounded run stops at the earlier of its duration and the condition
    scene.settings.duration = 0.5
    expect(simulate(cloneScene(scene)).frameCount - 1).toBe(Math.round(0.5 / rec.dt))
  })

  it('permanent rest ends an unbounded run; the bounded run stays constant after it', () => {
    const run = new SimulationRun(bounce(), { duration: null })
    run.advance(Infinity)
    const rec = run.result()
    expect(rec.stopReason).toBe('rest')
    expect(rec.error).toBeNull()
    const kr = rec.frameCount - 1
    const ref = simulate(bounce(), { duration: 8 })
    expectSameFrames(rec, ref, [0, 500, kr])
    const X = frameState(ref, kr)
    for (let k = kr; k < ref.frameCount; k += 37) expect(Array.from(frameState(ref, k))).toEqual(Array.from(X))
    // Nothing that depends on time can rest: a variable force or a running belt keeps the run going
    const belt = new SimulationRun(buildTemplate('conveyor'), { duration: null })
    belt.advance(Infinity, 600 * 5)
    expect(belt.finished).toBe(false)
  })
})

describe('identity cache', () => {
  it('reusing the last right-hand side solution is result-neutral', () => {
    for (const t of TEMPLATES) expect(simulate(buildTemplate(t.id), { solutionCache: false }).hash, t.id).toBe(simulate(buildTemplate(t.id)).hash)
    for (const [name, make] of special) expect(simulate(make(), { solutionCache: false }).hash, name).toBe(simulate(make()).hash)
  })
})

describe('scene format 3', () => {
  it('format 2 files keep their duration and fingerprint; new scenes and templates are unbounded', () => {
    const scene = buildTemplate('board-block')
    expect(scene.settings.duration).toBeNull()
    expect(scene.settings.legacyDuration).toBe(2.5)
    expect(emptyScene().settings.duration).toBeNull()
    // A 26.49 file: format 2 with a numeric duration and no legacyDuration or stopAt
    const doc = JSON.parse(serializeScene(scene))
    doc.version = 2
    doc.settings.duration = 2.5
    delete doc.settings.legacyDuration
    delete doc.settings.stopAt
    const old = parseScene(JSON.stringify(doc)).scene
    expect(old.version).toBe(SCENE_VERSION)
    expect(old.settings.duration).toBe(2.5)
    expect(old.settings.legacyDuration).toBe(2.5)
    expect(old.settings.stopAt).toBeNull()
    expect(simulate(old).hash).toBe(BOARD_BLOCK_HASH)
    // Format 3 round trip, with a stop condition
    scene.settings.stopAt = { on: 'stick', after: 0.5 }
    const back = parseScene(serializeScene(scene)).scene
    expect(back.settings).toEqual(scene.settings)
    expect(serializeScene(back)).toBe(serializeScene(scene))
  })
  it('validates durations and stop conditions', () => {
    const s = buildTemplate('incline')
    s.settings.duration = 0
    expect(() => validateScene(s)).toThrow(/仿真时长/)
    s.settings.duration = 4000
    expect(() => validateScene(s)).toThrow(/仿真时长/)
    s.settings.duration = null
    s.settings.stopAt = { on: 'stick', after: -1 }
    expect(() => validateScene(s)).toThrow(/停止条件/)
    s.settings.stopAt = { on: 'nonsense' as never, after: 1 }
    expect(() => validateScene(s)).toThrow(/停止条件/)
    s.settings.stopAt = null
    s.settings.legacyDuration = 0
    expect(() => validateScene(s)).toThrow(/有限计算时长/)
  })
})

describe('remote rebuilds (26.51)', () => {
  it('prefetches an evicted chunk off the interface thread and checks it like a local rebuild', async () => {
    const scene = pile()
    const { stream } = streamRun(scene, 3, Infinity)
    const ref = simulate(pile(), { duration: 3 })
    expect(stream.evictChunk(1)).toBe(true)
    let asked = 0
    stream.setRemote(async req => {
      asked++
      const r = rebuildChunk(req.scene, stream.system, req.checkpoint, { duration: req.duration, chunkSeconds: req.chunkSeconds }, req.endFrame)
      return { first: r.chunk.first, count: r.chunk.count, states: r.chunk.states, segment: r.chunk.segment, impactLoss: r.chunk.impactLoss, next: r.next }
    })
    const arrived: number[] = []
    stream.onChunk(c => arrived.push(c))
    expect(stream.prefetch(1)).toBe(true)
    expect(stream.prefetch(1)).toBe(true)
    await new Promise(r => setTimeout(r, 0))
    expect(asked).toBe(1)
    expect(arrived).toEqual([1])
    expect(stream.isResident(1)).toBe(true)
    expect(stream.memory().remoteRebuilds).toBe(1)
    expect(stream.memory().rebuilds).toBe(0)
    const rec = stream.snapshot()
    expectSameFrames(rec, ref, [stream.chunkFrames, stream.chunkFrames + 7, 2 * stream.chunkFrames - 1])
  })

  it('rejects a remote chunk that does not match the digest; the frame is then recomputed here', async () => {
    const { stream } = streamRun(pile(), 3, Infinity)
    const ref = simulate(pile(), { duration: 3 })
    stream.evictChunk(1)
    stream.setRemote(async req => {
      const r = rebuildChunk(req.scene, stream.system, req.checkpoint, { duration: req.duration, chunkSeconds: req.chunkSeconds }, req.endFrame)
      r.chunk.states[5] += 1e-9
      return { first: r.chunk.first, count: r.chunk.count, states: r.chunk.states, segment: r.chunk.segment, impactLoss: r.chunk.impactLoss, next: r.next }
    })
    stream.prefetch(1)
    await new Promise(r => setTimeout(r, 0))
    expect(stream.isResident(1)).toBe(false)
    expect(stream.memory().remoteRebuilds).toBe(0)
    expectSameFrames(stream.snapshot(), ref, [stream.chunkFrames + 3])
    expect(stream.memory().rebuilds).toBe(1)
  })

  it('without a remote rebuilder, prefetch declines', () => {
    const { stream } = streamRun(pile(), 3, Infinity)
    stream.evictChunk(1)
    expect(stream.prefetch(1)).toBe(false)
    expect(stream.prefetch(0)).toBe(true)
  })
})
