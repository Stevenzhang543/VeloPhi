/**
 * Web Worker entry (decision D13): runs the solver off the interface thread and streams the recording
 * back as deltas (see simJob.ts and core/solver/transport.ts). Created by app/simClient.ts with
 * `new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' })`.
 */
import type { FromWorker, SimJob, ToWorker } from './simJob'
import { startSimJob } from './simJob'

interface WorkerScope {
  postMessage(message: FromWorker, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null
}

const scope = self as unknown as WorkerScope
let job: SimJob | null = null

scope.onmessage = e => {
  const msg = e.data
  if (msg.type === 'start') {
    job?.cancel()
    job = startSimJob(msg.scene, msg.budgetMs, (m, transfer) => scope.postMessage(m, transfer ?? []), fn => { setTimeout(fn, 0) }, msg.sliceMs ?? 100)
  } else if (msg.type === 'cancel') {
    job?.cancel()
    job = null
  }
}
