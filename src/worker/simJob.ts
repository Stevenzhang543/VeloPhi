/**
 * The simulation job (decisions D13, D26, D29; 26.53 D68): runs a scene in the Rust core in slices and posts one delta
 * container per closed chunk of frames, plus the frames computed so far when a chunk takes longer than ~250 ms, and
 * finally the end state. The containers are posted as raw bytes: the interface thread hands them to its session
 * without decoding them. Independent of the worker global so it runs in the simulation worker, on the interface
 * thread (no worker: tests, pages from file://) and in Node; the desktop engine runs the same protocol natively in
 * Rust threads (src-tauri).
 *
 * The core has no clock: the job measures wall-clock time between calls and sizes the step budget of a call to
 * ~5 ms. Look-ahead: an unbounded run computes until t_computed ≥ max(playhead + max(lookAhead, 3 s × rate),
 * computeTo), rounded up to a chunk boundary, then pauses; a bounded run computes to its end.
 */
import type { Scene } from '../core/scene/types'
import type { Message } from '../i18n/message'
import { reviveMessage } from '../i18n/message'
import type { CoreBackend } from '../engine/core'
import { jsonBytes } from '../engine/core'
import type { RecordingEnd } from '../engine/types'

/** Default look-ahead of an unbounded run (s of simulated time). */
export const DEFAULT_LOOK_AHEAD = 20

/** Main thread → job. */
export type ToWorker =
  | { type: 'start'; scene: Scene; budgetMs: number; sliceMs?: number; duration?: number | null; lookAhead?: number; playhead?: number; rate?: number }
  /** Playback position and rate (simulated seconds per wall second). */
  | { type: 'playhead'; t: number; rate: number }
  /** Compute at least up to time t. */
  | { type: 'computeTo'; t: number }
  | { type: 'lookAhead'; seconds: number }
  /** End the run here (user stop of an unbounded run); a 'done' message follows. */
  | { type: 'stop' }
  | { type: 'cancel' }

/**
 * Job → main thread. `K` is the number of output intervals of the full run (frames − 1; +∞ when unbounded),
 * `chunkFrames` the frames per chunk and `duration` the run's effective duration (null: unbounded).
 */
export type FromWorker =
  /** Where the run is computed: the WebAssembly core (worker or this thread) or the native desktop engine. */
  | { type: 'engine'; engine: 'wasm' | 'native'; reason?: string }
  | { type: 'started'; K: number; size: number; chunkFrames: number; duration: number | null; dt: number }
  /** `paused`: the look-ahead is full; `computeMs`: wall-clock time spent computing so far. */
  | { type: 'partial'; delta: Uint8Array; paused: boolean; computeMs: number }
  /** The last delta (null when everything was sent) and the end state. */
  | { type: 'done'; delta: Uint8Array | null; end: RecordingEnd; computeMs: number }
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
  /** Transfer the posted bytes (worker) rather than share them (same thread). */
  transfer?: boolean
}

/** Wall-clock time after which the frames of an unfinished chunk are posted anyway (ms). */
const TAIL_MS = 250
/** Target wall-clock time of one `advance` call (ms). */
const CALL_MS = 5

const dec = new TextDecoder()
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** End state of a finished run as the core reports it. */
function endOf(b: CoreBackend, h: number): RecordingEnd {
  const bytes = b.runEnd(h)
  if (!bytes) return { completed: false, error: null, hash: '' }
  const o = JSON.parse(dec.decode(bytes)) as RecordingEnd & { error: unknown }
  return { ...o, error: o.error ? reviveMessage(o.error) : null }
}

/**
 * Start a job on core `b`. `schedule` continues the work later (setTimeout, so control messages can be received
 * between slices).
 */
export function startSimJob(b: CoreBackend, scene: Scene, budgetMs: number, post: Post, schedule: (fn: () => void) => void, opts: JobOptions = {}): SimJob {
  const sliceMs = opts.sliceMs ?? 100
  const transfer = opts.transfer ?? true
  const dead: SimJob = { cancel() {}, stop() {}, setPlayhead() {}, computeTo() {}, setLookAhead() {} }
  const req: Record<string, unknown> = { scene: JSON.parse(JSON.stringify(scene)) }
  if (opts.duration !== undefined) req.duration = opts.duration
  const h = b.runCreate(jsonBytes(req))
  if (!h) {
    const m = b.lastError()
    post({ type: 'error', message: m.key, msg: m })
    return dead
  }
  const infoBytes = b.runInfo(h)
  const info = JSON.parse(dec.decode(infoBytes!)) as { K: number | null; size: number; chunkFrames: number; duration: number | null; dt: number }
  const bounded = info.duration !== null
  post({ type: 'started', K: info.K ?? Infinity, size: info.size, chunkFrames: info.chunkFrames, duration: info.duration, dt: info.dt })
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

  const take = (tail: boolean): Uint8Array[] => {
    if (tail) b.runRequestTail(h)
    const out: Uint8Array[] = []
    for (;;) {
      const d = b.runTakeDelta(h)
      if (!d) break
      out.push(d)
    }
    return out
  }

  const send = (deltas: Uint8Array[], paused: boolean) => {
    if (finished) {
      ended = true
      const end = endOf(b, h)
      const last = deltas.pop() ?? null
      for (const d of deltas) post({ type: 'partial', delta: d, paused: false, computeMs }, transfer ? [d.buffer as ArrayBuffer] : undefined)
      post({ type: 'done', delta: last, end, computeMs }, transfer && last ? [last.buffer as ArrayBuffer] : undefined)
      b.runFree(h)
      return
    }
    // Nothing new (no closed chunk): the tail is due 250 ms after the last post
    if (!deltas.length) return
    lastPost = Date.now()
    deltas.forEach((d, i) => post({ type: 'partial', delta: d, paused: paused && i === deltas.length - 1, computeMs }, transfer ? [d.buffer as ArrayBuffer] : undefined))
  }

  const slice = () => {
    scheduled = false
    if (cancelled || ended) return
    const until = untilFrame()
    b.runSetUntil(h, until)
    const start = Date.now()
    let status = 0
    try {
      while (status === 0 && Date.now() - start < sliceMs) {
        const c0 = now()
        status = b.runAdvance(h, steps)
        const ms = now() - c0
        if (status === 0) steps = Math.max(100, Math.min(1 << 22, Math.round(steps * (ms > 0.05 ? CALL_MS / ms : 4))))
        if (bounded && budgetMs && computeMs + (Date.now() - start) > budgetMs && status === 0) { b.runFailBudget(h, budgetMs); status = 2 }
      }
    } catch (e) {
      ended = true
      post({ type: 'error', message: (e as Error).message || String(e) })
      return
    }
    computeMs += Date.now() - start
    if (cancelled) return
    finished = status === 2
    const paused = status === 1
    send(take(finished || paused || Date.now() - lastPost >= TAIL_MS), paused)
    if (!finished && !paused) resume()
  }

  const resume = () => {
    if (scheduled || cancelled || ended || finished) return
    if (!bounded && b.runFrameCount(h) - 1 >= untilFrame()) return
    scheduled = true
    schedule(slice)
  }

  resume()
  return {
    cancel() {
      cancelled = true
      if (!ended) { ended = true; b.runFree(h) }
    },
    stop() {
      if (cancelled || ended) return
      b.runStop(h)
      finished = true
      send(take(true), false)
    },
    setPlayhead(t, r) { playhead = t; rate = Math.max(0, r); resume() },
    computeTo(t) { wanted = Math.max(wanted, t); resume() },
    setLookAhead(seconds) { lookAhead = Math.max(1, seconds); resume() }
  }
}
