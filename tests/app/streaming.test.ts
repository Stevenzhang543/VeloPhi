/**
 * Unbounded runs end to end (decision D26): the worker job computes ahead of the playhead and pauses, resumes when
 * the playhead moves or a time is requested, and stops on request; the store shows the growing recording,
 * recognises situations incrementally and ends with the whole-run recognition; incremental recognition of a
 * growing recording ends with the situations of a full recognition.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate, TEMPLATES } from '../../src/templates'
import { SimulationRun, frameState } from '../../src/core/solver/simulation'
import { StreamRecording } from '../../src/core/solver/stream'
import { cloneScene } from '../../src/core/scene/io'
import type { FromWorker } from '../../src/worker/simJob'
import { startSimJob } from '../../src/worker/simJob'
import { IncrementalRecognizer } from '../../src/analysis/recognition'
import { recognize } from '../../src/formula/situations'

describe('worker job with look-ahead', () => {
  it('pauses at the look-ahead, resumes with the playhead and computeTo, stops on request', () => {
    const scene = buildTemplate('pendulum')
    const queue: Array<() => void> = []
    const msgs: FromWorker[] = []
    const job = startSimJob(cloneScene(scene), 60000, m => msgs.push(structuredClone(m)), fn => queue.push(fn), { sliceMs: 5, lookAhead: 4 })
    const drain = () => { while (queue.length) queue.shift()!() }
    const started = msgs[0] as Extract<FromWorker, { type: 'started' }>
    expect(started.duration).toBeNull()
    const stream = new StreamRecording({ scene: cloneScene(scene), chunkFrames: started.chunkFrames, duration: null })
    let seen = 1
    const take = () => { for (; seen < msgs.length; seen++) { const m = msgs[seen]; if (m.type === 'partial' || m.type === 'done') stream.apply(m.delta) } }
    const last = () => msgs[msgs.length - 1] as Extract<FromWorker, { type: 'partial' }>
    drain(); take()
    // Look-ahead 4 s (at least 3 s × rate 1) from playhead 0, rounded up to a chunk boundary
    expect(last().paused).toBe(true)
    expect(stream.frameCount - 1).toBe(4 * 600)
    // Every closed chunk came in its own delta with its checkpoint
    expect(stream.memory().checkpoints).toBe(5)
    job.setPlayhead(3.5, 2)
    drain(); take()
    expect(stream.frameCount - 1).toBe(Math.ceil((3.5 + 6) * 600 / 600) * 600)
    job.computeTo(14.2)
    drain(); take()
    expect(stream.frameCount - 1).toBe(15 * 600)
    expect(last().paused).toBe(true)
    job.stop()
    take()
    const end = msgs[msgs.length - 1]
    expect(end.type).toBe('done')
    if (end.type !== 'done') return
    expect(end.end.stopReason).toBe('user')
    const rec = stream.final(end.end)
    expect(rec.completed).toBe(true)
    // The same frames as a run that was never paused
    const ref = new SimulationRun(cloneScene(scene), { duration: null })
    ref.advance(Infinity, 15 * 600)
    ref.stop()
    expect(rec.hash).toBe(ref.result().hash)
    expect(Array.from(frameState(rec, 7777))).toEqual(Array.from(frameState(ref.result(), 7777)))
  })
})

describe('store with an unbounded scene', () => {
  it('computes ahead, shows the growing recording, stops on request', async () => {
    const { state, runSimulation, stopRun, loadScene } = await import('../../src/app/store')
    const { settings } = await import('../../src/app/settings')
    settings.sim.lookAheadSeconds = 3
    settings.sim.worker = false
    state.autoRun = false
    loadScene(buildTemplate('spring'), null)
    const p = runSimulation()
    expect(state.run.unbounded).toBe(true)
    const t0 = Date.now()
    while (!state.run.paused && Date.now() - t0 < 20000) await new Promise(r => setTimeout(r, 20))
    expect(state.run.paused).toBe(true)
    expect(state.computing).toBe(true)
    expect(state.run.tComputed).toBeCloseTo(3, 9)
    expect(state.recording?.frameCount).toBe(3 * 600 + 1)
    expect(state.run.checkpoints).toBe(4)
    expect(state.run.fingerprint?.t).toBeGreaterThan(1.9)
    // The open spring phase is recognised while the run grows
    expect(state.situations.some(s => s.type === 'spring')).toBe(true)
    stopRun()
    await p
    expect(state.computing).toBe(false)
    expect(state.recording?.completed).toBe(true)
    expect(state.recording?.stopReason).toBe('user')
    expect(state.recording?.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(state.situations.map(s => s.key)).toEqual(recognize(state.recording!).map(s => s.key))
  })
})

describe('incremental recognition', () => {
  for (const t of TEMPLATES) {
    it(`${t.id}: the growing recording ends with the situations of a full recognition`, () => {
      const scene = buildTemplate(t.id)
      const run = new SimulationRun(scene, { duration: null, chunkSeconds: 0.25 })
      const inc = new IncrementalRecognizer()
      const end = Math.round(Math.max(3, scene.settings.legacyDuration * 1.5) / run.dt)
      let shown = inc.update(run.partial())
      while (!run.finished && run.k < end) {
        run.advance(Infinity, Math.min(end, run.k + run.chunkFrames))
        shown = inc.update(run.partial())
      }
      run.stop()
      const final = run.result()
      const full = recognize(final).map(s => `${s.key}|${s.t0}|${s.t1}`).sort()
      shown = inc.update(final)
      expect(shown.map(s => `${s.key}|${s.t0}|${s.t1}`).sort()).toEqual(full)
      expect(inc.passes).toBeGreaterThan(2)
    })
  }
})
