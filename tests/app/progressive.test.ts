/**
 * Progressive runs in the app store (simulation client mocked): partial recordings are shown and playable while
 * the run continues, the frame shown is kept, situations are recognised incrementally while the run grows and over
 * the whole recording at the end, a new edit cancels the run in flight and late partials of a cancelled run are
 * ignored.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Recording } from '../../src/engine/recording'
import type { Scene } from '../../src/core/scene/types'
import { recognize } from '../../src/formula/recognize'

interface FakeRun {
  cancelled: boolean
  /** Deliver the recording up to `frames` frames as a partial. */
  partial: (frames: number) => void
  /** Compute the rest and resolve with the final recording. */
  finish: () => Recording
  progress: (t: number, total: number) => void
}
const runs: FakeRun[] = []

vi.mock('../../src/app/simClient', async () => {
  const { core, jsonBytes } = await import('../../src/engine/core')
  const { RecordingStore } = await import('../../src/engine/recording')
  const { cloneScene } = await import('../../src/core/scene/io')
  const { reviveMessage } = await import('../../src/i18n/message')
  return {
    startSimulation(scene: Scene, _opts: unknown, cb: { onPartial?: (r: Recording) => void; onProgress?: (t: number, T: number) => void }) {
      let resolve!: (r: Recording | null) => void
      const done = new Promise<Recording | null>(r => { resolve = r })
      // The core run, driven frame by frame (as the simulation job does), into a recording store
      const b = core()
      const h = b.runCreate(jsonBytes({ scene: cloneScene(scene), duration: scene.settings.duration ?? scene.settings.legacyDuration }))
      const info = JSON.parse(new TextDecoder().decode(b.runInfo(h)!)) as { chunkFrames: number; duration: number | null }
      const store = new RecordingStore(cloneScene(scene), { chunkFrames: info.chunkFrames, duration: info.duration })
      const drain = () => { for (let d = b.runTakeDelta(h); d; d = b.runTakeDelta(h)) store.apply(d) }
      const run: FakeRun = {
        cancelled: false,
        partial: frames => {
          b.runSetUntil(h, frames - 1)
          while (b.runAdvance(h, 100000) === 0) { /* until paused */ }
          b.runRequestTail(h)
          drain()
          cb.onPartial?.(store.snapshot())
        },
        finish: () => {
          b.runSetUntil(h, Infinity)
          while (b.runAdvance(h, 100000) === 0) { /* to the end */ }
          b.runRequestTail(h)
          drain()
          const e = JSON.parse(new TextDecoder().decode(b.runEnd(h)!))
          b.runFree(h)
          const rec = store.final({ ...e, error: e.error ? reviveMessage(e.error) : null })
          resolve(rec)
          return rec
        },
        progress: (t, T) => cb.onProgress?.(t, T)
      }
      runs.push(run)
      return { cancel() { run.cancelled = true; resolve(null) }, stop() {}, setPlayhead() {}, computeTo() {}, setLookAhead() {}, stream: () => store, done }
    }
  }
})

describe('progressive simulation in the store', () => {
  it('shows partials, keeps the frame, recognises at the end, cancels on edit', async () => {
    const g = globalThis as unknown as { requestAnimationFrame?: (f: (t: number) => void) => unknown; cancelAnimationFrame?: (id: unknown) => void }
    g.requestAnimationFrame ??= f => setTimeout(() => f(performance.now()), 16)
    g.cancelAnimationFrame ??= id => clearTimeout(id as ReturnType<typeof setTimeout>)
    const { state, runSimulation, edit, play, seekFrame } = await import('../../src/app/store')
    state.autoRun = false

    const p1 = runSimulation()
    expect(state.computing).toBe(true)
    const r1 = runs[0]
    r1.progress(0.3, 1.2)
    expect(state.progress).toBeCloseTo(0.25)

    r1.partial(100)
    expect(state.recording?.frameCount).toBe(100)
    expect(state.stale).toBe(false)
    expect(state.frame).toBe(0)
    const runId = state.runId

    seekFrame(80)
    r1.partial(300)
    expect(state.frame).toBe(80)
    expect(state.runId).toBe(runId)

    // Playback may start while the rest is computed
    play()
    expect(state.playing).toBe(true)

    const full = r1.finish()
    await p1
    expect(state.computing).toBe(false)
    expect(state.recording?.frameCount).toBe(full.frameCount)
    expect(state.situations.map(x => x.key)).toEqual(recognize(full).map(x => x.key))
    expect(state.situations.length).toBeGreaterThan(0)
    expect(state.runId).toBe(runId)
    state.playing = false

    // An edit cancels the run in flight; its late partials are ignored
    const p2 = runSimulation()
    const r2 = runs[1]
    edit(s => { s.settings.duration = 1.0 })
    expect(r2.cancelled).toBe(true)
    expect(state.computing).toBe(false)
    expect(state.stale).toBe(true)
    await p2
    r2.partial(50)
    expect(state.recording?.frameCount).toBe(full.frameCount)
  })
})
