/**
 * Simulation client: runs scenes off the interface thread (decisions D13, D20, D26) and reports growing
 * recordings so playback can start before (or without) the end of the run.
 *
 * With a Web Worker (src/worker/sim.worker.ts) the solver runs there and streams one delta per chunk of frames;
 * this thread recompiles the system from the same scene and assembles a StreamRecording
 * (core/solver/stream.ts), so frames, modes and fingerprints are bit-identical to a run here, and frames evicted
 * under the memory budget are recomputed here from their checkpoints. When no worker can be created (tests in
 * Node, pages opened from file://, a worker script that fails to load) the same job runs on this thread in slices
 * of about 12 ms, yielding between slices.
 *
 * An unbounded run computes ahead of the playhead (the look-ahead) and pauses; `setPlayhead` and `computeTo`
 * move the target, `stop` ends the run where it is.
 */
import { tl } from '../i18n'
import type { Scene } from '../core/scene/types'
import type { Recording, RollingFingerprint } from '../core/solver/simulation'
import { StreamRecording } from '../core/solver/stream'
import { cloneScene } from '../core/scene/io'
import type { EnginePref, FromWorker, SimJob, ToWorker } from '../worker/simJob'
import { MessageError } from '../i18n/message'
import { DEFAULT_LOOK_AHEAD, startSimJob } from '../worker/simJob'
import { remoteRebuild } from './rebuildClient'

/** Options of a run. */
export interface SimRunOptions {
  /** Wall-clock budget (ms) of a bounded run; the part computed so far is kept. */
  budgetMs: number
  /** Run in a Web Worker when available. */
  useWorker: boolean
  /** Deliver partial recordings while the run continues. */
  progressive: boolean
  /** Override the scene's duration (null: unbounded); default: the scene's. */
  duration?: number | null
  /** Look-ahead of an unbounded run (s of simulated time; default 20). */
  lookAhead?: number
  /** Memory budget of the recording's frames (bytes; default 512 MiB). */
  memoryBytes?: number
  /** Engine preference of the worker (default auto: Rust/WASM when it loads). */
  engine?: EnginePref
}

/** Statistics of a run in flight, for the solver-information panel. */
export interface RunStats {
  /** Simulated time computed (s). */
  tComputed: number
  /** Simulated seconds per wall-clock second of computing (0 before the first chunk). */
  speed: number
  /** Memory held by the recording (bytes). */
  memoryBytes: number
  chunks: number
  residentChunks: number
  checkpoints: number
  /** Chunks recomputed from checkpoints (on this thread or in the rebuild worker), and the time it took here (ms). */
  rebuilds: number
  rebuildMs: number
  /** Engine that computes the run, and why Rust/WASM is not used (null when it is). */
  engine: 'wasm' | 'ts'
  engineReason: string | null
  /** The look-ahead is full: computing waits for the playhead. */
  paused: boolean
  /** Rolling fingerprint up to the last closed chunk. */
  fingerprint: RollingFingerprint | null
}

/** Callbacks of a run. */
export interface SimCallbacks {
  /** A consistent prefix of the final recording (`completed` is false). Called repeatedly with growing prefixes. */
  onPartial?: (rec: Recording) => void
  /** Simulated time reached, for progress bars (`total` is +∞ for an unbounded run). */
  onProgress?: (t: number, total: number) => void
  /** Run statistics after every delta. */
  onStats?: (s: RunStats) => void
}

/** A run in progress. */
export interface SimHandle {
  /** Abandon the run; `done` then resolves with null. */
  cancel(): void
  /** End the run where it is, keeping everything computed; `done` resolves with the final recording. */
  stop(): void
  /** Playback position and rate (unbounded runs compute ahead of it). */
  setPlayhead(t: number, rate: number): void
  /** Compute at least up to time t. */
  computeTo(t: number): void
  setLookAhead(seconds: number): void
  /** The assembled recording store (null before the run has started). */
  stream(): StreamRecording | null
  /** The final recording, or null when cancelled. Rejects on a scene or solver error. */
  done: Promise<Recording | null>
}

/** Interval between partial recordings (ms of wall clock). */
const PARTIAL_INTERVAL_MS = 100
/** Work per slice when running on this thread (ms). */
const MAIN_SLICE_MS = 12

/** Start a run of a scene (see SimHandle). */
export function startSimulation(scene: Scene, opts: SimRunOptions, cb: SimCallbacks = {}): SimHandle {
  // A plain copy: the same data goes to the worker and to the decoder (and Vue proxies cannot be posted)
  const plain = cloneScene(scene)
  let cancelled = false
  let finished = false
  let stream: StreamRecording | null = null
  let lastPartial = 0
  let control: { send(msg: ToWorker): void } = { send() {} }
  let stopImpl: () => void = () => {}
  let playhead = 0, rate = 1
  let engine: 'wasm' | 'ts' = 'ts', engineReason: string | null = opts.useWorker ? null : 'no-worker'
  const lookAhead = opts.lookAhead ?? DEFAULT_LOOK_AHEAD
  const cancelHooks: Array<() => void> = []
  let resolveCancel: () => void = () => {}
  const cancelled$ = new Promise<null>(r => { resolveCancel = () => r(null) })

  const stats = (paused: boolean, computeMs: number): RunStats => {
    const m = stream!.memory()
    const tComputed = (stream!.frameCount - 1) * stream!.dt
    return {
      tComputed, speed: computeMs > 0 ? tComputed / (computeMs / 1000) : 0, memoryBytes: m.memoryBytes, chunks: m.chunks, residentChunks: m.residentChunks,
      checkpoints: m.checkpoints, rebuilds: m.rebuilds + m.remoteRebuilds, rebuildMs: m.rebuildMs, engine, engineReason, paused, fingerprint: stream!.rollingFingerprint()
    }
  }

  const done = new Promise<Recording | null>((resolve, reject) => {
    /** Handle one message of the job (from the worker or from the job on this thread). */
    const receive = (msg: FromWorker): boolean => {
      if (cancelled || finished) return true
      if (msg.type === 'engine') { engine = msg.engine; engineReason = msg.engine === 'wasm' ? null : msg.reason ?? null; return false }
      if (msg.type === 'started') {
        stream = new StreamRecording({ scene: plain, chunkFrames: msg.chunkFrames, duration: msg.duration, budgetBytes: opts.memoryBytes })
        // Evicted chunks the interface is about to need are recomputed in the rebuild worker (26.51)
        if (opts.useWorker && typeof Worker !== 'undefined') stream.setRemote(remoteRebuild)
        return false
      }
      if (msg.type === 'error') throw msg.msg ? new MessageError(msg.msg) : new Error(msg.message)
      if (!stream) throw new Error(tl('计算线程消息顺序错误'))
      stream.apply(msg.delta)
      cb.onProgress?.(Math.min(msg.delta.t, msg.delta.T), msg.delta.T)
      if (msg.type === 'partial') {
        cb.onStats?.(stats(msg.paused, msg.computeMs))
        const now = Date.now()
        if (opts.progressive && cb.onPartial && (msg.paused || now - lastPartial >= PARTIAL_INTERVAL_MS) && stream.frameCount > 0) {
          lastPartial = now
          cb.onPartial(stream.snapshot())
        }
        return false
      }
      finished = true
      const rec = stream.final(msg.end)
      cb.onStats?.(stats(false, msg.computeMs))
      resolve(rec)
      return true
    }

    const runHere = () => {
      let job: SimJob | null = null
      const fail = (e: unknown) => { cancelled = true; job?.cancel(); reject(e instanceof Error ? e : new Error(String(e))) }
      const post = (m: FromWorker) => { try { receive(m) } catch (e) { fail(e) } }
      job = startSimJob(plain, opts.budgetMs, post, fn => { setTimeout(() => { if (!cancelled) fn() }, 0) }, { sliceMs: MAIN_SLICE_MS, duration: opts.duration, lookAhead, playhead, rate, transfer: false })
      control = {
        send(msg) {
          if (!job) return
          if (msg.type === 'playhead') job.setPlayhead(msg.t, msg.rate)
          else if (msg.type === 'computeTo') job.computeTo(msg.t)
          else if (msg.type === 'lookAhead') job.setLookAhead(msg.seconds)
        }
      }
      stopImpl = () => { job?.stop() }
      cancelHooks.push(() => job?.cancel())
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
    const fail = (e: unknown) => { worker.terminate(); reject(e instanceof Error ? e : new Error(String(e))) }
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      heard = true
      try { if (receive(e.data) && !cancelled) worker.terminate() } catch (err) { fail(err) }
    }
    worker.onerror = (ev: ErrorEvent) => {
      ev.preventDefault()
      worker.terminate()
      if (cancelled) return
      // The worker script could not be loaded (file://, CSP): compute here instead
      if (!heard) { engineReason = 'no-worker'; runHere() }
      else reject(new Error(ev.message || tl('计算线程出错')))
    }
    control = { send(msg) { try { worker.postMessage(msg) } catch { /* Already gone */ } } }
    stopImpl = () => control.send({ type: 'stop' })
    const cancelWorker = () => {
      try { worker.postMessage({ type: 'cancel' } satisfies ToWorker) } catch { /* Already gone */ }
      worker.terminate()
    }
    cancelHooks.push(cancelWorker)
    worker.postMessage({ type: 'start', scene: plain, budgetMs: opts.budgetMs, duration: opts.duration, lookAhead, playhead, rate, engine: opts.engine ?? 'auto' } satisfies ToWorker)
  })

  return {
    cancel() {
      if (cancelled || finished) return
      cancelled = true
      for (const h of cancelHooks) h()
      resolveCancel()
    },
    stop() { if (!cancelled && !finished) stopImpl() },
    setPlayhead(t, r) { playhead = t; rate = r; control.send({ type: 'playhead', t, rate: r }) },
    computeTo(t) { control.send({ type: 'computeTo', t }) },
    setLookAhead(seconds) { control.send({ type: 'lookAhead', seconds }) },
    stream: () => stream,
    done: Promise.race([done, cancelled$])
  }
}
