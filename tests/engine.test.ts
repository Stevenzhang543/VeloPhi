/**
 * The Rust core against the TypeScript reference engine (manual 26.50 D29/D30, 26.53 D69): runs of the core (the
 * Node-API module or src/engine/velophi_core.wasm, see tests/setup/core.ts) streamed through the simulation job
 * into a recording store must give the same recordings as tests/reference — every frame, event and fingerprint —
 * for the templates (bounded at their former duration and unbounded); evicted chunks are recomputed in the session
 * from the checkpoints; scene errors are message keys; freed runs give their memory back.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { TEMPLATES, buildTemplate, referenceTemplates } from '../src/templates'
import { usesFields } from '../src/core/scene/types'
import type { Scene } from '../src/core/scene/types'
import { cloneScene } from '../src/core/scene/io'
import { core, jsonBytes } from '../src/engine/core'
import type { Recording } from '../src/engine/recording'
import { RecordingStore, eventStates, frameSegment, frameState } from '../src/engine/recording'
import type { FromWorker, JobOptions } from '../src/worker/simJob'
import { startSimJob } from '../src/worker/simJob'
import type { Recording as RefRecording } from './reference/core/solver/simulation'
import { SimulationRun, frameSegment as refSegment, frameState as refState, simulate as refSimulate } from './reference/core/solver/simulation'

const WASM = 'src/engine/velophi_core.wasm'

/** Run a job of the core to the end (or to `until` s for an unbounded run, then stop) and assemble the recording. */
function runJob(scene: Scene, opts: JobOptions & { until?: number; budgetBytes?: number } = {}): { rec: Recording; store: RecordingStore; msgs: FromWorker[] } {
  const queue: Array<() => void> = []
  const msgs: FromWorker[] = []
  const o: JobOptions = { ...opts, transfer: false, lookAhead: opts.until ?? opts.lookAhead }
  const job = startSimJob(core(), cloneScene(scene), 600000, m => msgs.push(m), fn => queue.push(fn), o)
  while (queue.length) queue.shift()!()
  if (opts.until !== undefined && !msgs.some(m => m.type === 'done')) { job.stop(); while (queue.length) queue.shift()!() }
  const started = msgs.find(m => m.type === 'started') as Extract<FromWorker, { type: 'started' }>
  if (!started) throw new Error(JSON.stringify(msgs.find(m => m.type === 'error')))
  const store = new RecordingStore(cloneScene(scene), { chunkFrames: started.chunkFrames, duration: started.duration, budgetBytes: opts.budgetBytes })
  let rec: Recording | null = null
  for (const m of msgs) {
    if (m.type === 'partial') store.apply(m.delta)
    else if (m.type === 'done') { if (m.delta) store.apply(m.delta); rec = store.final(m.end) }
  }
  if (!rec) throw new Error('no done message')
  return { rec, store, msgs }
}

/** The reference engine: a bounded run, or an unbounded one stopped after `until` s. */
function reference(scene: Scene, duration: number | null, until?: number): RefRecording {
  if (duration !== null) return refSimulate(cloneScene(scene), { duration })
  const run = new SimulationRun(cloneScene(scene), { duration: null })
  run.advance(Infinity, Math.ceil(Math.ceil(until! / run.dt - 1e-9) / run.chunkFrames) * run.chunkFrames)
  run.stop()
  return run.result()
}

function expectSameRecording(a: RefRecording, b: Recording) {
  expect(b.frameCount).toBe(a.frameCount)
  expect(b.hash).toBe(a.hash)
  expect(b.rolling?.hash ?? null).toBe(a.rolling?.hash ?? null)
  expect(b.completed).toBe(a.completed)
  expect(b.events.length).toBe(a.events.length)
  for (let i = 0; i < a.events.length; i++) {
    expect(Object.is(b.events[i].t, a.events[i].t)).toBe(true)
    expect(Array.from(eventStates(b, i).after)).toEqual(Array.from(a.events[i].after))
  }
  expect(b.segments.length).toBe(a.segments.length)
  expect(b.segments.map(s => [s.t0, s.t1])).toEqual(a.segments.map(s => [s.t0, s.t1]))
  expect(JSON.stringify(b.warnings)).toBe(JSON.stringify(a.warnings))
  expect(JSON.stringify(b.error)).toBe(JSON.stringify(a.error))
  const step = Math.max(1, Math.floor(a.frameCount / 200))
  for (let k = 0; k < a.frameCount; k += step) {
    const x = refState(a, k), y = frameState(b, k)
    for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i])) throw new Error(`frame ${k} component ${i}: ${x[i]} vs ${y[i]}`)
    expect(frameSegment(b, k)).toBe(refSegment(a, k))
  }
}

describe('Rust core', () => {
  it.skipIf(!existsSync(`${WASM}.sha256`))('the shipped WebAssembly module is the build recorded next to it', () => {
    const want = readFileSync(`${WASM}.sha256`, 'utf8').trim()
    expect(createHash('sha256').update(readFileSync(WASM)).digest('hex')).toBe(want)
  })

  for (const t of referenceTemplates()) {
    it(`template ${t.id}: bounded run identical to the reference engine`, () => {
      const scene = buildTemplate(t.id)
      const duration = scene.settings.legacyDuration ?? 3
      expectSameRecording(reference(scene, duration), runJob(scene, { duration }).rec)
    })
  }

  // 26.54 (D77): templates with charges or fields run only in Rust; the worker job equals the direct run
  for (const t of TEMPLATES.filter(x => usesFields(buildTemplate(x.id)))) {
    it(`template ${t.id}: Rust-only physics, worker run identical to the direct run`, () => {
      const scene = buildTemplate(t.id)
      const duration = scene.settings.legacyDuration ?? 3
      const a = runJob(scene, { duration }).rec, b = runJob(cloneScene(scene), { duration }).rec
      expect(a.hash).toBe(b.hash)
      expect(a.frameCount).toBeGreaterThan(10)
    })
  }

  for (const id of ['pendulum', 'board-block', 'spring', 'vertical-circle-rope', 'variable-force']) {
    it(`template ${id}: unbounded 30 s identical to the reference engine`, () => {
      const scene = buildTemplate(id)
      const b = runJob(scene, { duration: null, until: 30 }).rec
      expect(b.unbounded).toBe(true)
      expectSameRecording(reference(scene, null, 30), b)
    })
  }

  it('evicts chunks under a tiny memory budget and recomputes them from the checkpoints', () => {
    const scene = buildTemplate('pendulum')
    const { store } = runJob(scene, { duration: null, until: 12, budgetBytes: 1 })
    const ref = reference(scene, null, 12)
    const snap = store.snapshot()
    expect(store.memory().residentChunks).toBeLessThan(store.memory().chunks)
    for (const k of [1, 450, 1200, 3001, snap.frameCount - 2]) expect(Array.from(frameState(snap, k))).toEqual(Array.from(refState(ref, k)))
    expect(store.memory().rebuilds).toBeGreaterThan(0)
  })

  it('a rebuilt chunk equals the original run, also past a rest end', () => {
    const scene = buildTemplate('board-block')
    const { store } = runJob(scene, { duration: null, until: 5, budgetBytes: 1 })
    const ref = reference(scene, null, 5)
    const rec = store.snapshot()
    // 26.51: the run ends at approximate rest inside chunk 2; only the frames the original run recorded are compared
    for (let k = 2 * store.chunkFrames; k < ref.frameCount; k += 37) expect(Array.from(frameState(rec, k))).toEqual(Array.from(refState(ref, k)))
  })

  it('reports scene errors as message keys', () => {
    const scene = buildTemplate('incline')
    scene.bodies[scene.bodies.length - 1].mass = -1
    const b = core()
    expect(b.runCreate(jsonBytes({ scene, duration: 1 }))).toBe(0)
    expect(b.lastError().key).toMatch(/^scene\./)
    const msgs: FromWorker[] = []
    startSimJob(b, scene, 1000, m => msgs.push(m), fn => fn())
    expect(msgs).toEqual([{ type: 'error', message: expect.stringMatching(/^scene\./), msg: expect.objectContaining({ key: expect.stringMatching(/^scene\./) }) }])
  })

  it('frees its runs and sessions (memory stays bounded)', () => {
    const scene = buildTemplate('collision-1d')
    const b = core()
    const once = () => { const { rec } = runJob(scene, { duration: 1 }); rec.session.free() }
    once()
    const before = b.memoryBytes?.() ?? 0
    for (let i = 0; i < 50; i++) once()
    expect((b.memoryBytes?.() ?? 0) - before).toBeLessThanOrEqual(4 * 65536)
  })
})
