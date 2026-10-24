/**
 * Simulation client: runs `simulate` off the interface thread (decision D13) and reports partial recordings so
 * playback can start before the run finishes.
 *
 * With a Web Worker (src/worker/sim.worker.ts) the solver runs there and streams deltas about ten times a
 * second; this thread recompiles the system from the same scene and assembles the recording
 * (core/solver/transport.ts), so frames, modes and the fingerprint are bit-identical to a run here. When no
 * worker can be created (tests in Node, pages opened from file://, a worker script that fails to load) the
 * same incremental run executes on this thread in slices of about 12 ms, yielding between slices.
 */
import type { Scene } from '../core/scene/types'
import type { Recording } from '../core/solver/simulation'
import { SimulationRun } from '../core/solver/simulation'
import { RecordingAssembler } from '../core/solver/transport'
import { cloneScene } from '../core/scene/io'
import type { FromWorker, ToWorker } from '../worker/simJob'

/** Options of a run. */
export interface SimRunOptions {
  /** Wall-clock budget (ms); the part computed so far is kept. */
  budgetMs: number
  /** Run in a Web Worker when available. */
  useWorker: boolean
  /** Deliver partial recordings while the run continues. */
  progressive: boolean
}

/** Callbacks of a run. */
export interface SimCallbacks {
  /** A consistent prefix of the final recording (`completed` is false). Called repeatedly with growing prefixes. */
  onPartial?: (rec: Recording) => void
  /** Simulated time reached, for progress bars. */
  onProgress?: (t: number, total: number) => void
}

/** A run in progress. */
export interface SimHandle {
  /** Stop the run; `done` then resolves with null. */
  cancel(): void
  /** The final recording, or null when cancelled. Rejects on a scene or solver error. */
  done: Promise<Recording | null>
}

/** Interval between partial recordings (ms of wall clock). */
const PARTIAL_INTERVAL_MS = 100
/** Work per slice when running on this thread (ms). */
const MAIN_SLICE_MS = 12

/** Run `fn` as a new task, after pending input, timers and rendering. */
function makeYield(): { next(fn: () => void): void; close(): void } {
  return { next(fn) { setTimeout(fn, 0) }, close() {} }
}

/** Start a run of a scene (see SimHandle). */
export function startSimulation(scene: Scene, opts: SimRunOptions, cb: SimCallbacks = {}): SimHandle {
  // A plain copy: the same data goes to the worker and to the decoder (and Vue proxies cannot be posted)
  const plain = cloneScene(scene)
  let cancelled = false
  let stop: () => void = () => {}
  const done = new Promise<Recording | null>((resolve, reject) => {
    const runHere = () => {
      const y = makeYield()
      let run: SimulationRun | null = null
      let lastPartial = Date.now()
      const finish = (f: () => void) => { y.close(); f() }
      const slice = () => {
        if (cancelled) { finish(() => resolve(null)); return }
        let ended: boolean
        try {
          if (!run) run = new SimulationRun(plain, { budgetMs: opts.budgetMs })
          ended = run.advance(Date.now() + MAIN_SLICE_MS)
        } catch (e) { finish(() => reject(e)); return }
        cb.onProgress?.(Math.min(run.t, run.T), run.T)
        if (ended) { const rec = run.result(); finish(() => resolve(rec)); return }
        if (opts.progressive && cb.onPartial && Date.now() - lastPartial >= PARTIAL_INTERVAL_MS) {
          lastPartial = Date.now()
          cb.onPartial(run.partial())
        }
        y.next(slice)
      }
      stop = () => { cancelled = true }
      y.next(slice)
    }

    if (!opts.useWorker || typeof Worker === 'undefined') { runHere(); return }
    let worker: Worker
    try {
      worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      runHere()
      return
    }
    let heard = false
    let asm: RecordingAssembler | null = null
    const fail = (e: unknown) => { worker.terminate(); reject(e instanceof Error ? e : new Error(String(e))) }
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      heard = true
      if (cancelled) return
      const msg = e.data
      try {
        if (msg.type === 'started') { asm = new RecordingAssembler(plain, msg.K + 1); return }
        if (msg.type === 'error') { fail(new Error(msg.message)); return }
        if (!asm) throw new Error('计算线程消息顺序错误')
        asm.apply(msg.delta)
        cb.onProgress?.(Math.min(msg.delta.t, msg.delta.T), msg.delta.T)
        if (msg.type === 'partial') {
          if (opts.progressive) cb.onPartial?.(asm.partial())
        } else {
          worker.terminate()
          resolve(asm.final(msg.end))
        }
      } catch (err) { fail(err) }
    }
    worker.onerror = (ev: ErrorEvent) => {
      ev.preventDefault()
      worker.terminate()
      if (cancelled) return
      // The worker script could not be loaded (file://, CSP): compute here instead
      if (!heard) runHere()
      else reject(new Error(ev.message || '计算线程出错'))
    }
    stop = () => {
      cancelled = true
            try { worker.postMessage({ type: 'cancel' } satisfies ToWorker) } catch { /* Already gone */ }
      worker.terminate()
      resolve(null)
    }
    worker.postMessage({ type: 'start', scene: plain, budgetMs: opts.budgetMs } satisfies ToWorker)
  })
  return { cancel() { cancelled = true; stop() }, done }
}
