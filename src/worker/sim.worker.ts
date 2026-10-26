/**
 * Web Worker entry (decisions D13, D26, D29): runs the solver off the interface thread and streams the recording
 * back as deltas, one per chunk of frames (see simJob.ts and core/solver/transport.ts). The Rust core compiled to
 * WebAssembly does the work when it loads (wasmJob.ts); otherwise, or when the TypeScript engine is chosen in the
 * settings, the TypeScript solver does (simJob.ts). Both give bit-identical recordings. Created by
 * app/simClient.ts with `new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' })`.
 */
import wasmUrl from '../engine/velophi_core.wasm?url'
import type { WasmEngine } from '../engine/wasm'
import { loadEngine } from '../engine/wasm'
import type { FromWorker, JobOptions, SimJob, ToWorker } from './simJob'
import { startSimJob } from './simJob'
import { startWasmJob } from './wasmJob'

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

async function engineFor(pref: 'auto' | 'wasm' | 'ts' | undefined): Promise<{ engine: WasmEngine | null; reason?: string }> {
  if (pref === 'ts') return { engine: null, reason: 'settings' }
  try {
    return { engine: await loadEngine(wasmUrl) }
  } catch (e) {
    return { engine: null, reason: (e as Error).message || String(e) }
  }
}

scope.onmessage = async e => {
  const msg = e.data
  switch (msg.type) {
    case 'start': {
      job?.cancel()
      job = null
      const mine = ++starts
      pending = {}
      const { engine, reason } = await engineFor(msg.engine)
      if (mine !== starts) return
      const opts: JobOptions = {
        sliceMs: msg.sliceMs ?? 100, duration: msg.duration, lookAhead: pending.lookAhead ?? msg.lookAhead,
        playhead: pending.playhead?.t ?? msg.playhead, rate: pending.playhead?.rate ?? msg.rate
      }
      post({ type: 'engine', engine: engine ? 'wasm' : 'ts', reason })
      job = engine ? startWasmJob(engine, msg.scene, msg.budgetMs, post, schedule, opts) : startSimJob(msg.scene, msg.budgetMs, post, schedule, opts)
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
