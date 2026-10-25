/**
 * The simulation job on the Rust/WASM engine (manual 26.50, D29): the same protocol, slicing and look-ahead as
 * the TypeScript job (simJob.ts), with the work done by `WasmRun.advance(budgetSteps)`. The engine has no clock,
 * so the job measures wall-clock time between calls and sizes the step budget of a call to ~5 ms.
 */
import type { Scene } from '../core/scene/types'
import type { RecordingDelta } from '../core/solver/transport'
import { deltaTransfer } from '../core/solver/transport'
import type { WasmEngine, WasmRun } from '../engine/wasm'
import { WasmEngineError } from '../engine/wasm'
import type { JobOptions, Post, SimJob } from './simJob'
import { DEFAULT_LOOK_AHEAD } from './simJob'

/** Wall-clock time after which the frames of an unfinished chunk are posted anyway (ms), as in simJob.ts. */
const TAIL_MS = 250
/** Target wall-clock time of one `advance` call (ms). */
const CALL_MS = 5

/** Start a job on the WASM engine (see startSimJob for the parameters). */
export function startWasmJob(engine: WasmEngine, scene: Scene, budgetMs: number, post: Post, schedule: (fn: () => void) => void, opts: JobOptions = {}): SimJob {
  const sliceMs = opts.sliceMs ?? 100
  const transfer = opts.transfer ?? true
  const dead: SimJob = { cancel() {}, stop() {}, setPlayhead() {}, computeTo() {}, setLookAhead() {} }
  let run: WasmRun
  try {
    run = engine.create(scene, opts.duration)
  } catch (e) {
    post(e instanceof WasmEngineError ? { type: 'error', message: e.msg.key, msg: e.msg } : { type: 'error', message: (e as Error).message })
    return dead
  }
  const info = run.info()
  const bounded = info.duration !== null
  post({ type: 'started', K: info.K, size: info.size, chunkFrames: info.chunkFrames, duration: info.duration })
  let playhead = opts.playhead ?? 0, rate = opts.rate ?? 1, wanted = 0, lookAhead = opts.lookAhead ?? DEFAULT_LOOK_AHEAD
  let scheduled = false, cancelled = false, ended = false, finished = false
  let lastPost = Date.now()
  let computeMs = 0
  let steps = 2000

  const untilFrame = () => {
    if (bounded) return Infinity
    const t = Math.max(playhead + Math.max(lookAhead, 3 * rate), wanted)
    const F = info.chunkFrames
    return Math.ceil(Math.ceil(t / info.dt - 1e-9) / F) * F
  }

  const send = (deltas: RecordingDelta[], paused: boolean) => {
    if (!deltas.length) return
    lastPost = Date.now()
    deltas.forEach((d, i) => {
      d.stats = { ...d.stats, wallMs: computeMs }
      const last = i === deltas.length - 1
      if (last && finished) {
        ended = true
        const end = run.end() ?? { completed: false, error: null, hash: '' }
        post({ type: 'done', delta: d, end, computeMs }, transfer ? deltaTransfer(d) : undefined)
        run.free()
      } else post({ type: 'partial', delta: d, paused: paused && last, computeMs }, transfer ? deltaTransfer(d) : undefined)
    })
  }

  const slice = () => {
    scheduled = false
    if (cancelled || ended) return
    const until = untilFrame()
    run.setUntil(until)
    const start = Date.now()
    let status: 'budget' | 'paused' | 'finished' = 'budget'
    while (status === 'budget' && Date.now() - start < sliceMs) {
      const c0 = performance.now()
      status = run.advance(steps)
      const ms = performance.now() - c0
      if (status === 'budget') steps = Math.max(100, Math.min(1 << 22, Math.round(steps * (ms > 0.05 ? CALL_MS / ms : 4))))
      if (bounded && budgetMs && computeMs + (Date.now() - start) > budgetMs && status === 'budget') { run.failBudget(budgetMs); status = 'finished' }
    }
    computeMs += Date.now() - start
    if (cancelled) return
    finished = status === 'finished'
    const paused = status === 'paused'
    send(run.takeDeltas(finished || paused || Date.now() - lastPost >= TAIL_MS), paused)
    if (!finished && !paused) resume()
  }

  const resume = () => {
    if (scheduled || cancelled || ended || finished) return
    if (!bounded && run.frameCount - 1 >= untilFrame()) return
    scheduled = true
    schedule(slice)
  }

  resume()
  return {
    cancel() {
      cancelled = true
      if (!ended) { ended = true; run.free() }
    },
    stop() {
      if (cancelled || ended) return
      run.stop()
      finished = true
      send(run.takeDeltas(true), false)
    },
    setPlayhead(t, r) { playhead = t; rate = Math.max(0, r); resume() },
    computeTo(t) { wanted = Math.max(wanted, t); resume() },
    setLookAhead(seconds) { lookAhead = Math.max(1, seconds); resume() }
  }
}
