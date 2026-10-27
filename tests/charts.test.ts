/**
 * Long-chart level of detail (decision D32; the core's lod.rs through render/chartLod.ts): the min/max envelope of every column equals a brute
 * force over the column's frames at all three levels, also when chunks have been evicted (summaries, recompute on
 * request), and a complete view does no further work.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import type { Recording } from '../src/engine/recording'
import { frameState } from '../src/engine/recording'
import type { Scene } from '../src/core/scene/types'
import { listQuantities, quantitySeries } from '../src/engine/observe'
import type { Envelope, LodLevel } from '../src/render/chartLod'
import { chartEnvelope, chooseLevel, envelopePlot, lodCounters } from '../src/render/chartLod'
import { streamRun } from './helpers/stream'

/** An unbounded run streamed into a recording store up to `frames` frames, then stopped (as the host does). */
function stream(scene: Scene, frames: number, chunkSeconds: number, budgetBytes = Infinity): Recording {
  return streamRun(scene, { duration: null, frames, chunkSeconds, budgetBytes }).rec
}

/** State component of a quantity read straight from the state (core), or −1. */
const stateComponent = (rec: Recording, id: string) => rec.session.call<{ component: number }>({ op: 'stateComponent', id }).component
/** Memory counters of a recording's session. */
const memory = (rec: Recording) => rec.session.call<{ memory: { chunks: number; residentChunks: number; rebuilds: number } }>({ op: 'info' }).memory
const evictChunk = (rec: Recording, c: number) => rec.session.call({ op: 'evict', chunk: c })

/** Brute force over the frames of each column of an envelope. */
function brute(ref: Recording, env: Envelope, id: string) {
  const C = env.colFirst.length
  const out = { min: new Float64Array(C), max: new Float64Array(C), first: new Float64Array(C), last: new Float64Array(C) }
  for (let j = 0; j < C; j++) {
    let lo = Infinity, hi = -Infinity
    const vals = quantitySeries(ref, [id], env.colFirst[j], env.colLast[j]).values[0]
    for (const v of vals) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v }
    out.min[j] = lo; out.max[j] = hi; out.first[j] = vals[0]; out.last[j] = vals[vals.length - 1]
  }
  return out
}

/** Call until nothing is pending (recomputing evicted chunks one per call). */
function complete(rec: Recording, ids: string[], k0: number, k1: number, columns: number, level?: LodLevel): Envelope {
  for (let i = 0; i < 2000; i++) {
    const env = chartEnvelope(rec, { ids, k0, k1, columns, budget: 1500, rebuild: true, level })
    if (!env.pending) return env
  }
  throw new Error('envelope never completed')
}

function expectExact(ref: Recording, env: Envelope, ids: string[]) {
  // Columns tile the window without gaps or overlaps
  for (let j = 1; j < env.colFirst.length; j++) expect(env.colFirst[j]).toBe(env.colLast[j - 1] + 1)
  for (const id of ids) {
    const s = env.stats.get(id)!
    const b = brute(ref, env, id)
    expect(Array.from(s.state).every(x => x === 0)).toBe(true)
    expect(Array.from(s.min)).toEqual(Array.from(b.min))
    expect(Array.from(s.max)).toEqual(Array.from(b.max))
    expect(Array.from(s.first)).toEqual(Array.from(b.first))
    expect(Array.from(s.last)).toEqual(Array.from(b.last))
  }
}

describe('long-chart envelope', () => {
  const scene = buildTemplate('pendulum')
  scene.settings.duration = null
  const FRAMES = 6000 // 10 s at Δt = 1/600
  const ref = stream(scene, FRAMES, 0.25)
  const ids = ['bob.x', 'bob.vy', 'bob.v', 'system.e', 'bob.ek']

  it('knows which quantities are plain state components', () => {
    const known = new Set(listQuantities(ref).map(q => q.id))
    for (const id of ids) expect(known.has(id)).toBe(true)
    expect(stateComponent(ref, 'bob.x')).toBeGreaterThanOrEqual(0)
    expect(stateComponent(ref, 'bob.vy')).toBeGreaterThanOrEqual(0)
    expect(stateComponent(ref, 'bob.v')).toBe(-1)
    expect(stateComponent(ref, 'system.e')).toBe(-1)
    expect(chooseLevel(600, 1000, 600)).toBe('frame')
    expect(chooseLevel(60000, 1000, 600)).toBe('block')
    expect(chooseLevel(1e6, 1000, 600)).toBe('chunk')
  })

  for (const [level, columns] of [['frame', 700], ['block', 97], ['chunk', 13]] as Array<[LodLevel, number]>) {
    it(`${level} level equals brute force (whole run and an odd window)`, () => {
      const rec = stream(scene, FRAMES, 0.25)
      expectExact(ref, complete(rec, ids, 0, FRAMES, columns, level), ids)
      expectExact(ref, complete(rec, ids, 1234, 4567, columns, level), ids)
    })
  }

  it('is exact across evicted chunks: summaries without recomputing, the rest recomputed on request', () => {
    const rec = stream(scene, FRAMES, 0.25)
    const chunks = memory(rec).chunks
    for (let c = 0; c < chunks - 1; c += 2) evictChunk(rec, c)
    const evictedBefore = memory(rec).residentChunks
    // State components at the chunk level come from the summaries: complete at once, nothing recomputed
    const env = chartEnvelope(rec, { ids: ['bob.x', 'bob.vy'], k0: 0, k1: FRAMES, columns: 9, level: 'chunk', budget: 15000 })
    expect(env.pending).toBe(false)
    expect(memory(rec).rebuilds).toBe(0)
    expectExact(ref, env, ['bob.x', 'bob.vy'])
    // Derived quantities: evicted chunks are stand-ins until recomputed
    const first = chartEnvelope(rec, { ids: ['bob.v'], k0: 0, k1: FRAMES, columns: 9, level: 'chunk', budget: 15000 })
    expect(first.pending).toBe(true)
    expect(first.evicted.length).toBeGreaterThan(0)
    expect(memory(rec).rebuilds).toBe(0)
    expect(memory(rec).residentChunks).toBe(evictedBefore)
    for (const level of ['chunk', 'block', 'frame'] as LodLevel[]) {
      for (let c = 0; c < chunks - 1; c += 3) evictChunk(rec, c)
      expectExact(ref, complete(rec, ids, 0, FRAMES, level === 'chunk' ? 11 : level === 'block' ? 150 : 2000, level), ids)
    }
    expect(memory(rec).rebuilds).toBeGreaterThan(0)
  })

  it('a complete view does no more work, and a small budget fills in over several calls', () => {
    const rec = stream(scene, FRAMES, 0.25)
    const a = chartEnvelope(rec, { ids: ['bob.ek'], k0: 0, k1: FRAMES, columns: 300, budget: 0 })
    expect(a.pending).toBe(true)
    const b = complete(rec, ['bob.ek'], 0, FRAMES, 300)
    const scans = lodCounters(rec).scans
    const c = chartEnvelope(rec, { ids: ['bob.ek'], k0: 0, k1: FRAMES, columns: 300 })
    expect(c.pending).toBe(false)
    expect(lodCounters(rec).scans).toBe(scans)
    expect(Array.from(c.stats.get('bob.ek')!.max)).toEqual(Array.from(b.stats.get('bob.ek')!.max))
  })

  it('plot points: four per column with the extremes inside, or one per frame', () => {
    const env = complete(ref, ['bob.x'], 0, FRAMES, 120)
    const p = envelopePlot(env)
    expect(p.t.length).toBe(4 * env.colFirst.length)
    for (let i = 1; i < p.t.length; i++) expect(p.t[i]).toBeGreaterThanOrEqual(p.t[i - 1])
    const v = p.values.get('bob.x')!
    const s = env.stats.get('bob.x')!
    for (let j = 0; j < env.colFirst.length; j++) {
      const col = v.slice(4 * j, 4 * j + 4) as number[]
      expect(Math.min(...col)).toBe(s.min[j])
      expect(Math.max(...col)).toBe(s.max[j])
      expect(col[0]).toBe(s.first[j])
      expect(col[3]).toBe(s.last[j])
    }
    const raw = complete(ref, ['bob.x'], 100, 400, 1000)
    const pr = envelopePlot(raw)
    expect(pr.t.length).toBe(301)
    expect(pr.values.get('bob.x')![5]).toBe(frameState(ref, 105)[stateComponent(ref, 'bob.x')])
  })
})
