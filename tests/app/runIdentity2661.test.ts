/**
 * 26.61 R2: the identity of a run across the panels. Messages of run A that arrive after the scene was replaced (or
 * edited) never reach the store: not its partials, not its end, not its progress; the new run's recording carries
 * its own run id; stop → continue keeps the frame and shows the same data as an uninterrupted run; the Copilot's
 * reading tools wait for the run of the scene as it is now and never read an out-of-date recording.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Recording } from '../../src/engine/recording'
import { frameState } from '../../src/engine/recording'
import type { Scene } from '../../src/core/scene/types'
import { buildTemplate } from '../../src/templates'

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


vi.mock('../../src/app/trialLog', () => ({ logEvent() {} }))
const gl = globalThis as unknown as { requestAnimationFrame?: (f: (t: number) => void) => unknown; cancelAnimationFrame?: (id: unknown) => void }
gl.requestAnimationFrame ??= f => setTimeout(() => f(performance.now()), 16)
gl.cancelAnimationFrame ??= id => clearTimeout(id as ReturnType<typeof setTimeout>)

describe('run identity (26.61 R2)', () => {
  it('late messages of run A after the scene was replaced by B are ignored', async () => {
    const { state, runSimulation, loadScene } = await import('../../src/app/store')
    state.autoRun = false
    loadScene(buildTemplate('incline'), 'A')
    const a = runs[runs.length - 1]
    a.partial(120)
    const runA = state.runId
    expect(state.recording?.scene.name).toBe(state.scene.name)
    const nameA = state.scene.name
    // Scene B replaces A before A has finished
    loadScene(buildTemplate('pendulum'), 'B')
    const b = runs[runs.length - 1]
    expect(a.cancelled).toBe(true)
    expect(state.stale).toBe(true)
    // A's late partial, progress and end
    a.partial(400)
    a.progress(1, 1)
    a.finish()
    await Promise.resolve()
    expect(state.recording?.scene.name).toBe(nameA)
    expect(state.stale).toBe(true)
    expect(state.runId).toBe(runA)
    expect(state.progress).toBe(0)
    // B's first partial: its own run id, its own scene
    b.partial(60)
    expect(state.stale).toBe(false)
    expect(state.runId).not.toBe(runA)
    expect(state.recording?.scene.name).toBe(state.scene.name)
    expect(state.recording?.scene.name).not.toBe(nameA)
    const runB = state.runId
    b.finish()
    await new Promise(r => setTimeout(r, 0))
    expect(state.runId).toBe(runB)
    expect(state.computing).toBe(false)
    void runSimulation
  })

  it('an edit during the run: late chunks of the old version are ignored too', async () => {
    const { state, loadScene, edit, runSimulation } = await import('../../src/app/store')
    state.autoRun = false
    loadScene(buildTemplate('incline'), 'A')
    const a = runs[runs.length - 1]
    a.partial(100)
    edit(s => { s.bodies.find(x => x.kind !== 'static')!.mass = 5 })
    expect(state.stale).toBe(true)
    a.partial(300)
    expect(state.stale).toBe(true)
    void runSimulation()
    const c = runs[runs.length - 1]
    c.partial(50)
    expect(state.stale).toBe(false)
    expect(state.recording?.scene.bodies.find(x => x.kind !== 'static')!.mass).toBe(5)
    c.finish()
    await new Promise(r => setTimeout(r, 0))
  })

  it('stop → continue: the frame shown stays, the data equal an uninterrupted run', async () => {
    const { state, loadScene, seekFrame, continueRun } = await import('../../src/app/store')
    state.autoRun = false
    loadScene(buildTemplate('pendulum'), 'P')
    const a = runs[runs.length - 1]
    a.partial(300)
    const full = a.finish()
    await new Promise(r => setTimeout(r, 0))
    seekFrame(200)
    const before = Array.from(frameState(full, 200))
    const runA = state.runId
    // continueRun needs a completed recording stopped by the user: mark it as such (the fake host has no stop)
    ;(state.recording as Recording).stopReason = 'user'
    continueRun()
    const c = runs[runs.length - 1]
    expect(c).not.toBe(a)
    c.partial(600)
    expect(state.frame).toBe(200)
    expect(state.runId).not.toBe(runA)
    expect(Array.from(frameState(state.recording!, 200))).toEqual(before)
    c.finish()
    await new Promise(r => setTimeout(r, 0))
  })

  it('Copilot readings wait for the current run and never read the out-of-date recording', async () => {
    const { state, loadScene } = await import('../../src/app/store')
    const { freshRecording, evidence } = await import('../../src/ai/copilot/tools')
    state.autoRun = false
    loadScene(buildTemplate('incline'), 'A')
    const a = runs[runs.length - 1]
    a.partial(100)
    const recA = await freshRecording(100)
    expect(evidence(recA).run).toBe(state.runId)
    loadScene(buildTemplate('pendulum'), 'B')
    const b = runs[runs.length - 1]
    // Stale and computing: the reading waits …
    const waiting = freshRecording(2000)
    setTimeout(() => b.partial(80), 200)
    const recB = await waiting
    expect(recB.scene.name).toBe(state.scene.name)
    expect(recB).not.toBe(recA)
    // … and gives up with a clear error when the new run does not deliver
    loadScene(buildTemplate('incline'), 'C')
    await expect(freshRecording(300)).rejects.toThrow(/out of date/)
    b.finish(); runs[runs.length - 1].finish()
    await new Promise(r => setTimeout(r, 0))
  })

  it('learning mode: the Copilot cannot read out what the app still hides', async () => {
    const { state, loadScene } = await import('../../src/app/store')
    const { freshRecording } = await import('../../src/ai/copilot/tools')
    const { settings } = await import('../../src/app/settings')
    loadScene(buildTemplate('incline'), 'L')
    runs[runs.length - 1].partial(50)
    settings.ai.learningMode = true
    state.problem = { problem: { id: 'p', title: 'p', chapter: '', stem: '', scene: state.scene, questions: [] }, answers: {}, revealed: false, hints: {}, editing: false } as never
    await expect(freshRecording(100)).rejects.toThrow(/learning mode/)
    ;(state.problem as unknown as { revealed: boolean }).revealed = true
    await expect(freshRecording(100)).resolves.toBeTruthy()
    settings.ai.learningMode = false
    state.problem = null
    runs[runs.length - 1].finish()
    await new Promise(r => setTimeout(r, 0))
  })
})
