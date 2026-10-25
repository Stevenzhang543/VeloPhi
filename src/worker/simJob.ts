/**
 * The simulation job of the Web Worker, independent of the worker global so it can be tested in Node (and run
 * on the interface thread when no worker is available). It runs a scene in slices of ~100 ms wall clock and
 * posts one delta per closed chunk of frames (decision D26), plus the frames computed so far when a chunk takes
 * longer than ~250 ms; finally a message with the end state. Only data new since the previous post is sent.
 *
 * Look-ahead: an unbounded run computes until t_computed ≥ max(playhead + max(lookAhead, 3 s × rate), computeTo),
 * rounded up to a chunk boundary, then pauses; 'playhead', 'computeTo' and 'lookAhead' messages move the target
 * and resume it. A bounded run computes to its end without pausing (as in 26.49).
 */
import type { Scene } from '../core/scene/types'
import type { Message } from '../i18n/message'
import { SimulationRun } from '../core/solver/simulation'
import type { RecordingDelta, RecordingEnd } from '../core/solver/transport'
import { DeltaWriter, deltaTransfer } from '../core/solver/transport'

/** Default look-ahead of an unbounded run (s of simulated time). */
export const DEFAULT_LOOK_AHEAD = 20

/** Engine preference: Rust/WASM when it loads (auto), always WASM (falls back only on failure), or TypeScript. */
export type EnginePref = 'auto' | 'wasm' | 'ts'

/** Main thread → worker. */
export type ToWorker =
  | { type: 'start'; scene: Scene; budgetMs: number; sliceMs?: number; duration?: number | null; lookAhead?: number; playhead?: number; rate?: number; engine?: EnginePref }
  /** Playback position and rate (simulated seconds per wall second). */
  | { type: 'playhead'; t: number; rate: number }
  /** Compute at least up to time t. */
  | { type: 'computeTo'; t: number }
  | { type: 'lookAhead'; seconds: number }
  /** End the run here (user stop of an unbounded run); a 'done' message follows. */
  | { type: 'stop' }
  | { type: 'cancel' }

/**
 * Worker → main thread. `K` is the number of output intervals of the full run (frames − 1; +∞ when unbounded),
 * `chunkFrames` the frames per chunk and `duration` the run's effective duration (null: unbounded).
 */
export type FromWorker =
  /** The engine that computes the run (sent before 'started'); `reason`: why WASM is not used. */
  | { type: 'engine'; engine: 'wasm' | 'ts'; reason?: string }
  | { type: 'started'; K: number; size: number; chunkFrames: number; duration: number | null }
  /** `paused`: the look-ahead is full; `computeMs`: wall-clock time spent computing so far. */
  | { type: 'partial'; delta: RecordingDelta; paused: boolean; computeMs: number }
  | { type: 'done'; delta: RecordingDelta; end: RecordingEnd; computeMs: number }
  /** `msg`: the engine's message (key and parameters) when there is one. */
  | { type: 'error'; message: string; msg?: Message }

/** Posts a message to the main thread, transferring the given buffers. */
export type Post = (msg: FromWorker, transfer?: ArrayBuffer[]) => void

/** Handle of a running job. */
export interface SimJob {
  cancel(): void
  /** End the run where it is (posts 'done'). */
  stop(): void
  setPlayhead(t: number, rate: number): void
  computeTo(t: number): void
  setLookAhead(seconds: number): void
}

/** Options of a job. */
export interface JobOptions {
  sliceMs?: number
  /** Override the scene's duration (null: unbounded). */
  duration?: number | null
  lookAhead?: number
  playhead?: number
  rate?: number
  /** Transfer the posted arrays (worker) rather than share them (same thread). */
  transfer?: boolean
}

/** Wall-clock time after which the frames of an unfinished chunk are posted anyway (ms). */
const TAIL_MS = 250

/**
 * Start a job. `schedule` continues the work later (setTimeout in a worker, so control messages can be received
 * between slices).
 */
export function startSimJob(scene: Scene, budgetMs: number, post: Post, schedule: (fn: () => void) => void, opts: JobOptions | number = {}): SimJob {
  const o: JobOptions = typeof opts === 'number' ? { sliceMs: opts } : opts
  const sliceMs = o.sliceMs ?? 100
  const transfer = o.transfer ?? true
  let cancelled = false
  let run: SimulationRun
  try {
    run = new SimulationRun(scene, o.duration !== undefined ? { budgetMs, duration: o.duration } : { budgetMs })
  } catch (e) {
    post({ type: 'error', message: (e as Error).message })
    return { cancel() {}, stop() {}, setPlayhead() {}, computeTo() {}, setLookAhead() {} }
  }
  post({ type: 'started', K: run.K, size: run.size, chunkFrames: run.chunkFrames, duration: run.bounded ? run.T : null })
  // Posted chunks, checkpoints, segments and events are dropped from the run (the receiver holds them)
  const writer = new DeltaWriter(run, true)
  let playhead = o.playhead ?? 0, rate = o.rate ?? 1, wanted = 0, lookAhead = o.lookAhead ?? DEFAULT_LOOK_AHEAD
  let scheduled = false
  let lastPost = Date.now()
  let computeMs = 0
  let ended = false

  /** Frame up to which to compute: the look-ahead target rounded up to a chunk boundary (bounded: no limit). */
  const untilFrame = () => {
    if (run.bounded) return Infinity
    const t = Math.max(playhead + Math.max(lookAhead, 3 * rate), wanted)
    const F = run.chunkFrames
    return Math.ceil(Math.ceil(t / run.dt - 1e-9) / F) * F
  }

  const send = (deltas: RecordingDelta[], paused: boolean) => {
    if (!deltas.length) return
    lastPost = Date.now()
    deltas.forEach((d, i) => {
      const last = i === deltas.length - 1
      if (last && run.finished) {
        ended = true
        const rec = run.result()
        post({ type: 'done', delta: d, end: { completed: rec.completed, error: rec.error, hash: rec.hash, stopReason: rec.stopReason }, computeMs }, transfer ? deltaTransfer(d) : undefined)
      } else post({ type: 'partial', delta: d, paused: paused && last, computeMs }, transfer ? deltaTransfer(d) : undefined)
    })
  }

  const slice = () => {
    scheduled = false
    if (cancelled || ended) return
    const until = untilFrame()
    const t0 = Date.now()
    const done = run.advance(t0 + sliceMs, until)
    computeMs += Date.now() - t0
    if (cancelled) return
    const paused = !done && run.k >= until
    send(writer.next(done || paused || Date.now() - lastPost >= TAIL_MS), paused)
    if (!done && !paused) resume()
  }

  const resume = () => {
    if (scheduled || cancelled || ended || run.finished) return
    if (run.k >= untilFrame()) return
    scheduled = true
    schedule(slice)
  }

  if (run.finished) send(writer.next(true), false)
  else resume()
  return {
    cancel() { cancelled = true },
    stop() {
      if (cancelled || ended) return
      run.stop()
      send(writer.next(true), false)
    },
    setPlayhead(t, r) { playhead = t; rate = Math.max(0, r); resume() },
    computeTo(t) { wanted = Math.max(wanted, t); resume() },
    setLookAhead(seconds) { lookAhead = Math.max(1, seconds); resume() }
  }
}
