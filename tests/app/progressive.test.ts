/**
 * Progressive runs in the app store (simulation client mocked): partial recordings are shown and playable while
 * the run continues, the frame shown is kept, situations are recognised only at the end, a new edit cancels the
 * run in flight and late partials of a cancelled run are ignored.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Recording } from '../../src/core/solver/simulation'
import type { Scene } from '../../src/core/scene/types'

interface FakeRun {
  cancelled: boolean
  full: Recording
  resolve: (r: Recording | null) => void
  partial: (r: Recording) => void
  progress: (t: number, total: number) => void
}
const runs: FakeRun[] = []

vi.mock('../../src/app/simClient', async () => {
  const { simulate } = await import('../../src/core/solver/simulation')
  return {
    startSimulation(scene: Scene, _opts: unknown, cb: { onPartial?: (r: Recording) => void; onProgress?: (t: number, T: number) => void }) {
      let resolve!: (r: Recording | null) => void
      const done = new Promise<Recording | null>(r => { resolve = r })
      const run: FakeRun = { cancelled: false, full: simulate(scene, {}), resolve, partial: r => cb.onPartial?.(r), progress: (t, T) => cb.onProgress?.(t, T) }
      runs.push(run)
      return { cancel() { run.cancelled = true; resolve(null) }, done }
    }
  }
})

/** The first `frames` frames of a recording, as a partial delivery. */
function prefix(rec: Recording, frames: number): Recording {
  return { ...rec, frameCount: frames, states: rec.states.slice(0, frames * rec.size), frameSegment: rec.frameSegment.slice(0, frames), impactLoss: rec.impactLoss.slice(0, frames), completed: false }
}

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

    r1.partial(prefix(r1.full, 100))
    expect(state.recording?.frameCount).toBe(100)
    expect(state.stale).toBe(false)
    expect(state.frame).toBe(0)
    expect(state.situations.length).toBe(0)
    const runId = state.runId

    seekFrame(80)
    r1.partial(prefix(r1.full, 300))
    expect(state.frame).toBe(80)
    expect(state.runId).toBe(runId)

    // Playback may start while the rest is computed
    play()
    expect(state.playing).toBe(true)

    r1.resolve(r1.full)
    await p1
    expect(state.computing).toBe(false)
    expect(state.recording?.frameCount).toBe(r1.full.frameCount)
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
    r2.partial(prefix(r2.full, 50))
    expect(state.recording?.frameCount).toBe(r1.full.frameCount)
  })
})
