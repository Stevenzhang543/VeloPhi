/**
 * Simulation client: runs scenes off the interface thread (decisions D13, D20, D26; 26.53 D68) and reports growing
 * recordings so playback can start before (or without) the end of the run.
 *
 * The run is computed by the simulation host (engine/host.ts): native Rust threads in the desktop application, the
 * WebAssembly core in a Web Worker on the web, or this thread in slices when neither is available. It streams one
 * delta container per chunk of frames; this thread hands the bytes to a Rust session (engine/recording.ts), which
 * holds the frames under the memory budget and recomputes evicted chunks — off this thread through the host when
 * the interface is about to need them.
 *
 * An unbounded run computes ahead of the playhead (the look-ahead) and pauses; `setPlayhead` and `computeTo`
 * move the target, `stop` ends the run where it is.
 */
import { tl } from '../i18n'
import type { Scene } from '../core/scene/types'
import type { Recording, RollingFingerprint } from '../engine/recording'
import { RecordingStore } from '../engine/recording'
import { cloneScene } from '../core/scene/io'
import type { FromWorker } from '../worker/simJob'
import { MessageError } from '../i18n/message'
import { DEFAULT_LOOK_AHEAD } from '../worker/simJob'
import type { RunControl } from '../engine/host'
import { mainThreadHost, simHost } from '../engine/host'

/** Options of a run. */
export interface SimRunOptions {
  /** Wall-clock budget (ms) of a bounded run; the part computed so far is kept. */
  budgetMs: number
  /** Run in the simulation host (native engine or Web Worker); false: on this thread. */
  useWorker: boolean
  /** Deliver partial recordings while the run continues. */
  progressive: boolean
  /** Override the scene's duration (null: unbounded); default: the scene's. */
  duration?: number | null
  /** Look-ahead of an unbounded run (s of simulated time; default 20). */
  lookAhead?: number
  /** Memory budget of the recording's frames (bytes; default 512 MiB). */
  memoryBytes?: number
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
  /** Chunks recomputed from checkpoints (in the session, or by the host). */
  rebuilds: number
  /** Where the run is computed: native Rust threads (desktop) or the WebAssembly core. */
  engine: 'native' | 'wasm'
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
  stream(): RecordingStore | null
  /** The final recording, or null when cancelled. Rejects on a scene or solver error. */
  done: Promise<Recording | null>
}

/** Interval between partial recordings (ms of wall clock). */
const PARTIAL_INTERVAL_MS = 100

/** Start a run of a scene (see SimHandle). */
export function startSimulation(scene: Scene, opts: SimRunOptions, cb: SimCallbacks = {}): SimHandle {
  // A plain copy: the same data goes to the host and to the session (and Vue proxies cannot be posted)
  const plain = cloneScene(scene)
  let cancelled = false
  let finished = false
  let stream: RecordingStore | null = null
  let lastPartial = 0
  let control: RunControl | null = null
  let playhead = 0, rate = 1
  let engine: 'native' | 'wasm' = 'wasm', engineReason: string | null = null
  const lookAhead = opts.lookAhead ?? DEFAULT_LOOK_AHEAD
  let resolveCancel: () => void = () => {}
  const cancelled$ = new Promise<null>(r => { resolveCancel = () => r(null) })
  const host = opts.useWorker ? simHost() : mainThreadHost

  const stats = (paused: boolean, computeMs: number): RunStats => {
    const m = stream!.memory()
    const tComputed = (stream!.frameCount - 1) * stream!.dt
    return {
      tComputed, speed: computeMs > 0 ? tComputed / (computeMs / 1000) : 0, memoryBytes: m.memoryBytes, chunks: m.chunks, residentChunks: m.residentChunks,
      checkpoints: m.checkpoints, rebuilds: m.rebuilds + m.remoteRebuilds, engine, engineReason, paused, fingerprint: stream!.rollingFingerprint()
    }
  }

  const done = new Promise<Recording | null>((resolve, reject) => {
    /** Handle one message of the run. Returns true when the run is over. */
    const receive = (msg: FromWorker): boolean => {
      if (cancelled || finished) return true
      if (msg.type === 'engine') { engine = msg.engine; engineReason = msg.reason ?? null; return false }
      if (msg.type === 'started') {
        stream = new RecordingStore(plain, { chunkFrames: msg.chunkFrames, duration: msg.duration, budgetBytes: opts.memoryBytes })
        // Evicted chunks the interface is about to need are recomputed by the host (26.51)
        if (host.rebuild) stream.setRemote(host.rebuild)
        return false
      }
      if (msg.type === 'error') throw msg.msg ? new MessageError(msg.msg) : new Error(msg.message)
      if (!stream) throw new Error(tl('计算线程消息顺序错误'))
      if (msg.delta) stream.apply(msg.delta)
      stream.wallMs = msg.computeMs
      cb.onProgress?.(Math.min(stream.t, stream.T), stream.T)
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
    const fail = (e: unknown) => {
      cancelled = true
      control?.cancel()
      reject(e instanceof Error ? e : new Error(String(e)))
    }
    const onMessage = (m: FromWorker) => { try { receive(m) } catch (e) { fail(e) } }
    control = host.start({ scene: plain, budgetMs: opts.budgetMs, duration: opts.duration, lookAhead, playhead, rate }, onMessage)
  })

  return {
    cancel() {
      if (cancelled || finished) return
      cancelled = true
      control?.cancel()
      resolveCancel()
    },
    stop() { if (!cancelled && !finished) control?.send({ type: 'stop' }) },
    setPlayhead(t, r) { playhead = t; rate = r; control?.send({ type: 'playhead', t, rate: r }) },
    computeTo(t) { control?.send({ type: 'computeTo', t }) },
    setLookAhead(seconds) { control?.send({ type: 'lookAhead', seconds }) },
    stream: () => stream,
    done: Promise.race([done, cancelled$])
  }
}
