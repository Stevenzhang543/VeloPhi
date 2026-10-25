/**
 * The Rust core as WebAssembly (manual 26.50, D29/D30): src/engine/verity_core.wasm, run through the worker job
 * of wasmJob.ts, must give the same recordings as the TypeScript engine — every frame, event and fingerprint —
 * for the templates (bounded at their former duration and unbounded), and its chunk rebuilds must be accepted by
 * the TypeScript side.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { TEMPLATES, buildTemplate } from '../src/templates'
import type { Scene } from '../src/core/scene/types'
import type { Recording } from '../src/core/solver/simulation'
import { frameSegment, frameState } from '../src/core/solver/simulation'
import { StreamRecording } from '../src/core/solver/stream'
import type { FromWorker, JobOptions } from '../src/worker/simJob'
import { startSimJob } from '../src/worker/simJob'
import { startWasmJob } from '../src/worker/wasmJob'
import type { WasmEngine } from '../src/engine/wasm'
import { WasmEngineError, instantiateEngine } from '../src/engine/wasm'

const WASM = 'src/engine/verity_core.wasm'
let engine: WasmEngine

beforeAll(async () => {
  engine = await instantiateEngine(readFileSync(WASM))
})

/** Run a job to the end (or to `until` s for an unbounded run, then stop) and assemble the recording. */
function runJob(kind: 'ts' | 'wasm', scene: Scene, opts: JobOptions & { until?: number } = {}): { rec: Recording; msgs: FromWorker[] } {
  const queue: Array<() => void> = []
  const msgs: FromWorker[] = []
  const post = (m: FromWorker) => msgs.push(m)
  const schedule = (fn: () => void) => queue.push(fn)
  const o: JobOptions = { ...opts, transfer: false, lookAhead: opts.until ?? opts.lookAhead }
  const job = kind === 'ts' ? startSimJob(structuredClone(scene), 600000, post, schedule, o) : startWasmJob(engine, structuredClone(scene), 600000, post, schedule, o)
  while (queue.length) queue.shift()!()
  if (opts.until !== undefined && !msgs.some(m => m.type === 'done')) { job.stop(); while (queue.length) queue.shift()!() }
  const started = msgs.find(m => m.type === 'started') as Extract<FromWorker, { type: 'started' }>
  if (!started) throw new Error(JSON.stringify(msgs.find(m => m.type === 'error')))
  const asm = new StreamRecording({ scene, chunkFrames: started.chunkFrames, duration: started.duration })
  let rec: Recording | null = null
  for (const m of msgs) {
    if (m.type === 'partial') asm.apply(m.delta)
    else if (m.type === 'done') { asm.apply(m.delta); rec = asm.final(m.end) }
  }
  if (!rec) throw new Error('no done message')
  return { rec, msgs }
}

function expectSameRecording(a: Recording, b: Recording) {
  expect(b.frameCount).toBe(a.frameCount)
  expect(b.hash).toBe(a.hash)
  expect(b.rolling?.hash ?? null).toBe(a.rolling?.hash ?? null)
  expect(b.events.length).toBe(a.events.length)
  for (let i = 0; i < a.events.length; i++) {
    expect(Object.is(b.events[i].t, a.events[i].t)).toBe(true)
    expect(Array.from(b.events[i].after)).toEqual(Array.from(a.events[i].after))
  }
  expect(b.segments.map(s => s.label)).toEqual(a.segments.map(s => s.label))
  expect(JSON.stringify(b.warnings)).toBe(JSON.stringify(a.warnings))
  expect(JSON.stringify(b.error)).toBe(JSON.stringify(a.error))
  const step = Math.max(1, Math.floor(a.frameCount / 200))
  for (let k = 0; k < a.frameCount; k += step) {
    const x = frameState(a, k), y = frameState(b, k)
    for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i])) throw new Error(`frame ${k} component ${i}: ${x[i]} vs ${y[i]}`)
    expect(frameSegment(b, k)).toBe(frameSegment(a, k))
  }
}

describe('Rust/WASM engine', () => {
  it('is the build recorded next to it', () => {
    const want = readFileSync(`${WASM}.sha256`, 'utf8').trim()
    expect(createHash('sha256').update(readFileSync(WASM)).digest('hex')).toBe(want)
  })

  for (const t of TEMPLATES) {
    it(`template ${t.id}: bounded run identical to TypeScript`, () => {
      const scene = buildTemplate(t.id)
      const duration = scene.settings.legacyDuration ?? 3
      const a = runJob('ts', scene, { duration }).rec
      const b = runJob('wasm', scene, { duration }).rec
      expect(a.completed).toBe(b.completed)
      expectSameRecording(a, b)
    })
  }

  for (const id of ['pendulum', 'board-block', 'spring', 'vertical-circle-rope', 'variable-force']) {
    it(`template ${id}: unbounded 30 s identical to TypeScript`, () => {
      const scene = buildTemplate(id)
      const a = runJob('ts', scene, { duration: null, until: 30 }).rec
      const b = runJob('wasm', scene, { duration: null, until: 30 }).rec
      expect(a.unbounded && b.unbounded).toBe(true)
      expectSameRecording(a, b)
    })
  }

  it('streams chunks that the TypeScript side verifies and recomputes after eviction', () => {
    const scene = buildTemplate('pendulum')
    const { msgs } = runJob('wasm', scene, { duration: null, until: 12 })
    const started = msgs.find(m => m.type === 'started') as Extract<FromWorker, { type: 'started' }>
    // A tiny memory budget: closed chunks are evicted and rebuilt here from the Rust checkpoints
    const asm = new StreamRecording({ scene, chunkFrames: started.chunkFrames, duration: started.duration, budgetBytes: 1 })
    const ref = runJob('ts', scene, { duration: null, until: 12 }).rec
    for (const m of msgs) if (m.type === 'partial' || m.type === 'done') asm.apply(m.delta)
    const snap = asm.snapshot()
    for (const k of [1, 450, 1200, 3001, snap.frameCount - 2]) expect(Array.from(frameState(snap, k))).toEqual(Array.from(frameState(ref, k)))
    expect(asm.memory().rebuilds).toBeGreaterThan(0)
  })

  it('rebuilds a chunk from its checkpoint like the original run', () => {
    const scene = buildTemplate('board-block')
    const { msgs } = runJob('wasm', scene, { duration: null, until: 5 })
    const deltas = msgs.flatMap(m => (m.type === 'partial' || m.type === 'done' ? [m.delta] : []))
    const cp = deltas.flatMap(d => d.checkpoints ?? []).find(c => c.chunk === 2)!
    const run = engine.create(scene, null)
    const info = run.info()
    const out = run.rebuildChunk(cp.data, 3 * info.chunkFrames) as { chunk: { states: Float64Array; first: number; count: number } }
    run.free()
    const ref = runJob('ts', scene, { duration: null, until: 5 }).rec
    // 26.51: the run ends at approximate rest inside chunk 2; a rebuild restarts the rest counter at the checkpoint and
    // may run on past that end, so only the frames the original run recorded are compared
    for (let j = 0; j < Math.min(out.chunk.count, ref.frameCount - out.chunk.first); j += 37) {
      expect(Array.from(out.chunk.states.subarray(j * info.size, (j + 1) * info.size))).toEqual(Array.from(frameState(ref, out.chunk.first + j)))
    }
  })

  it('reports scene errors as message keys', () => {
    const scene = buildTemplate('incline')
    scene.bodies[scene.bodies.length - 1].mass = -1
    let err: unknown = null
    try { engine.create(scene, 1) } catch (e) { err = e }
    expect(err).toBeInstanceOf(WasmEngineError)
    expect((err as WasmEngineError).msg.key).toMatch(/^scene\./)
  })

  it('frees its runs (memory stays bounded)', () => {
    const scene = buildTemplate('collision-1d')
    runJob('wasm', scene, { duration: 1 })
    const before = engine.memoryBytes
    for (let i = 0; i < 50; i++) runJob('wasm', scene, { duration: 1 })
    expect(engine.memoryBytes - before).toBeLessThanOrEqual(4 * 65536)
  })
})
