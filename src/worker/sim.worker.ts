/**
 * Simulation worker (decisions D13, D26, D29): runs the Rust core compiled to WebAssembly off the interface thread
 * and streams the recording back as raw delta containers, one per chunk of frames (simJob.ts). The desktop
 * application runs the same protocol natively instead (src-tauri, engine/host.ts). Created by engine/host.ts with
 * `new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' })`.
 */
import wasmUrl from '../engine/velophi_core.wasm?url'
import type { CoreBackend } from '../engine/core'
import { loadCore } from '../engine/core'
import type { FromWorker, JobOptions, SimJob, ToWorker } from './simJob'
import { startSimJob } from './simJob'

interface WorkerScope {
  postMessage(message: FromWorker, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null
}

const scope = self as unknown as WorkerScope
const post = (m: FromWorker, transfer?: ArrayBuffer[]) => scope.postMessage(m, transfer ?? [])
const schedule = (fn: () => void) => { setTimeout(fn, 0) }
let job: SimJob | null = null
/** Start requests counter: a start that is still waiting for the engine is dropped when a newer one arrives. */
let starts = 0
/** Control messages received while a start waits for the engine, applied when the job begins. */
let pending: { playhead?: { t: number; rate: number }; computeTo?: number; lookAhead?: number; stop?: boolean } = {}

scope.onmessage = async e => {
  const msg = e.data
  switch (msg.type) {
    case 'start': {
      job?.cancel()
      job = null
      const mine = ++starts
      pending = {}
      let core: CoreBackend
      try {
        core = await loadCore(wasmUrl)
      } catch (err) {
        post({ type: 'error', message: (err as Error).message || String(err) })
        return
      }
      if (mine !== starts) return
      const opts: JobOptions = {
        sliceMs: msg.sliceMs ?? 100, duration: msg.duration, lookAhead: pending.lookAhead ?? msg.lookAhead,
        playhead: pending.playhead?.t ?? msg.playhead, rate: pending.playhead?.rate ?? msg.rate
      }
      post({ type: 'engine', engine: 'wasm' })
      job = startSimJob(core, msg.scene, msg.budgetMs, post, schedule, opts)
      if (pending.computeTo !== undefined) job.computeTo(pending.computeTo)
      if (pending.stop) job.stop()
      break
    }
    case 'playhead': if (job) job.setPlayhead(msg.t, msg.rate); else pending.playhead = { t: msg.t, rate: msg.rate }; break
    case 'computeTo': if (job) job.computeTo(msg.t); else pending.computeTo = Math.max(pending.computeTo ?? 0, msg.t); break
    case 'lookAhead': if (job) job.setLookAhead(msg.seconds); else pending.lookAhead = msg.seconds; break
    case 'stop': if (job) job.stop(); else pending.stop = true; break
    case 'cancel':
      starts++
      job?.cancel()
      job = null
      break
  }
}
