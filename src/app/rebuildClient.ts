/**
 * Client of the rebuild worker (worker/rebuild.worker.ts; manual 26.51, carry-over 1 of 26.50): recomputes evicted
 * chunks of a recording off the interface thread. Given to every StreamRecording of the application
 * (`setRemote`); when no worker can be created (tests, pages from file://), requests are rejected and the
 * recording recomputes chunks on this thread as before.
 */
import type { RemoteChunk, RemoteRequest } from '../core/solver/stream'
import type { FromRebuild, ToRebuild } from '../worker/rebuild.worker'
import { cloneScene } from '../core/scene/io'

let worker: Worker | null | undefined
let nextId = 1
const waiting = new Map<number, { resolve: (c: RemoteChunk) => void; reject: (e: Error) => void }>()

function workerOrNull(): Worker | null {
  if (worker !== undefined) return worker
  if (typeof Worker === 'undefined') return (worker = null)
  try {
    worker = new Worker(new URL('../worker/rebuild.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return (worker = null)
  }
  worker.onmessage = (e: MessageEvent<FromRebuild>) => {
    const m = e.data
    const w = waiting.get(m.id)
    if (!w) return
    waiting.delete(m.id)
    if (m.type === 'rebuilt') w.resolve({ first: m.first, count: m.count, states: m.states, segment: m.segment, impactLoss: m.impactLoss, next: m.next })
    else w.reject(new Error(m.message))
  }
  worker.onerror = ev => {
    ev.preventDefault()
    worker?.terminate()
    worker = null
    for (const w of waiting.values()) w.reject(new Error('rebuild worker failed'))
    waiting.clear()
  }
  return worker
}

/** Recompute a chunk in the rebuild worker. */
export function remoteRebuild(req: RemoteRequest): Promise<RemoteChunk> {
  const w = workerOrNull()
  if (!w) return Promise.reject(new Error('no rebuild worker'))
  const id = nextId++
  return new Promise<RemoteChunk>((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    const msg: ToRebuild = { type: 'rebuild', id, scene: cloneScene(req.scene), duration: req.duration, chunkSeconds: req.chunkSeconds, checkpoint: req.checkpoint, endFrame: req.endFrame }
    try { w.postMessage(msg, [req.checkpoint.buffer]) } catch (e) { waiting.delete(id); reject(e as Error) }
  })
}
