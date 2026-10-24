/**
 * The simulation job of the Web Worker, independent of the worker global so it can be tested in Node:
 * runs a scene in slices of ~100 ms wall clock and posts a delta after each slice (about 10 posts per
 * second), then a final message with the end state. Only data new since the previous post is sent.
 */
import type { Scene } from '../core/scene/types'
import { SimulationRun } from '../core/solver/simulation'
import type { RecordingDelta, RecordingEnd } from '../core/solver/transport'
import { DeltaWriter, deltaTransfer } from '../core/solver/transport'

/** Main thread → worker. */
export type ToWorker =
  | { type: 'start'; scene: Scene; budgetMs: number; sliceMs?: number }
  | { type: 'cancel' }

/** Worker → main thread. `K` is the number of output intervals of the full run (frames − 1). */
export type FromWorker =
  | { type: 'started'; K: number; size: number }
  | { type: 'partial'; delta: RecordingDelta }
  | { type: 'done'; delta: RecordingDelta; end: RecordingEnd }
  | { type: 'error'; message: string }

/** Posts a message to the main thread, transferring the given buffers. */
export type Post = (msg: FromWorker, transfer?: ArrayBuffer[]) => void

/** Handle of a running job. */
export interface SimJob { cancel(): void }

/**
 * Start a job. `schedule` continues the work later (setTimeout in a worker, so a cancel message can be
 * received between slices).
 */
export function startSimJob(scene: Scene, budgetMs: number, post: Post, schedule: (fn: () => void) => void, sliceMs = 100): SimJob {
  let cancelled = false
  let run: SimulationRun
  try {
    run = new SimulationRun(scene, { budgetMs })
  } catch (e) {
    post({ type: 'error', message: (e as Error).message })
    return { cancel() {} }
  }
  post({ type: 'started', K: run.K, size: run.size })
  const writer = new DeltaWriter(run)
  const slice = () => {
    if (cancelled) return
    const done = run.advance(Date.now() + sliceMs)
    if (cancelled) return
    const delta = writer.next()
    if (done) {
      const rec = run.result()
      post({ type: 'done', delta, end: { completed: rec.completed, error: rec.error, hash: rec.hash } }, deltaTransfer(delta))
    } else {
      post({ type: 'partial', delta }, deltaTransfer(delta))
      schedule(slice)
    }
  }
  schedule(slice)
  return { cancel() { cancelled = true } }
}
