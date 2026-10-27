/**
 * Simulation hosts (26.53, D68): where a run is computed. The desktop application runs the Rust core natively in
 * its own threads (src-tauri, commands `engine_*`) and streams the delta containers to the page over a Tauri channel
 * as raw bytes; the web version runs the WebAssembly core in a Web Worker; without workers (tests, pages opened from
 * file://) the job runs on this thread in slices. All three speak the protocol of worker/simJob.ts and give
 * bit-identical recordings (the same Rust source); the interface thread's session never decodes a delta.
 *
 * Evicted chunks are recomputed by `rebuild` (native command, or the rebuild worker) and installed into the session.
 */
import type { Scene } from '../core/scene/types'
import { cloneScene } from '../core/scene/io'
import { isDesktop } from '../platform/files'
import { core } from './core'
import type { FromWorker, ToWorker } from '../worker/simJob'
import { DEFAULT_LOOK_AHEAD, startSimJob } from '../worker/simJob'
import type { FromRebuild, ToRebuild } from '../worker/rebuild.worker'
import type { RemoteRebuild } from './recording'

/** Parameters of a run. */
export interface RunRequest { scene: Scene; budgetMs: number; duration?: number | null; lookAhead?: number; playhead?: number; rate?: number }

/** A run in progress: control messages, and cancellation. */
export interface RunControl {
  send(msg: Exclude<ToWorker, { type: 'start' }>): void
  cancel(): void
}

/** Where runs are computed. */
export interface SimHost {
  readonly kind: 'native' | 'worker' | 'main'
  /** Start a run; messages arrive through `onMessage` in order. Errors of the host itself arrive as 'error'. */
  start(req: RunRequest, onMessage: (m: FromWorker) => void): RunControl
  /** Recompute an evicted chunk elsewhere (raw rebuild container). */
  rebuild: RemoteRebuild | null
}

// ---- Main thread ----

/** Runs on this thread in slices of about 12 ms (tests, no workers). */
export const mainThreadHost: SimHost = {
  kind: 'main',
  start(req, onMessage) {
    let cancelled = false
    const job = startSimJob(core(), cloneScene(req.scene), req.budgetMs, m => { if (!cancelled) onMessage(m) }, fn => { setTimeout(() => { if (!cancelled) fn() }, 0) }, {
      sliceMs: 12, duration: req.duration, lookAhead: req.lookAhead ?? DEFAULT_LOOK_AHEAD, playhead: req.playhead, rate: req.rate, transfer: false
    })
    return {
      send(msg) {
        if (msg.type === 'playhead') job.setPlayhead(msg.t, msg.rate)
        else if (msg.type === 'computeTo') job.computeTo(msg.t)
        else if (msg.type === 'lookAhead') job.setLookAhead(msg.seconds)
        else if (msg.type === 'stop') job.stop()
        else if (msg.type === 'cancel') { cancelled = true; job.cancel() }
      },
      cancel() { cancelled = true; job.cancel() }
    }
  },
  rebuild: null
}

// ---- Web Worker ----

let rebuildWorker: Worker | null | undefined
let nextRebuild = 1
const waiting = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>()

function rebuildWorkerOrNull(): Worker | null {
  if (rebuildWorker !== undefined) return rebuildWorker
  if (typeof Worker === 'undefined') return (rebuildWorker = null)
  try {
    rebuildWorker = new Worker(new URL('../worker/rebuild.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return (rebuildWorker = null)
  }
  rebuildWorker.onmessage = (e: MessageEvent<FromRebuild>) => {
    const m = e.data
    const w = waiting.get(m.id)
    if (!w) return
    waiting.delete(m.id)
    if (m.type === 'rebuilt') w.resolve(m.bytes)
    else w.reject(new Error(m.message))
  }
  rebuildWorker.onerror = ev => {
    ev.preventDefault()
    rebuildWorker?.terminate()
    rebuildWorker = null
    for (const w of waiting.values()) w.reject(new Error('rebuild worker failed'))
    waiting.clear()
  }
  return rebuildWorker
}

/** Recompute a chunk in the rebuild worker. */
const workerRebuild: RemoteRebuild = req => {
  const w = rebuildWorkerOrNull()
  if (!w) return Promise.reject(new Error('no rebuild worker'))
  const id = nextRebuild++
  return new Promise<Uint8Array>((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    const cp = req.checkpoint.slice()
    const msg: ToRebuild = { type: 'rebuild', id, scene: cloneScene(req.scene), duration: req.duration, chunkFrames: req.chunkFrames, checkpoint: cp, endFrame: req.endFrame }
    try { w.postMessage(msg, [cp.buffer]) } catch (e) { waiting.delete(id); reject(e as Error) }
  })
}

/** Runs in a Web Worker on the WebAssembly core; falls back to this thread when the worker cannot start. */
export const workerHost: SimHost = {
  kind: 'worker',
  start(req, onMessage) {
    let worker: Worker
    try {
      worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      return mainThreadHost.start(req, onMessage)
    }
    let heard = false
    let fallback: RunControl | null = null
    worker.onmessage = (e: MessageEvent<FromWorker>) => { heard = true; onMessage(e.data) }
    worker.onerror = (ev: ErrorEvent) => {
      ev.preventDefault()
      worker.terminate()
      // The worker script could not be loaded (file://, CSP): compute here instead
      if (!heard) fallback = mainThreadHost.start(req, onMessage)
      else onMessage({ type: 'error', message: ev.message || 'worker error' })
    }
    worker.postMessage({ type: 'start', scene: cloneScene(req.scene), budgetMs: req.budgetMs, duration: req.duration, lookAhead: req.lookAhead, playhead: req.playhead, rate: req.rate } satisfies ToWorker)
    return {
      send(msg) {
        if (fallback) { fallback.send(msg); return }
        try { worker.postMessage(msg) } catch { /* Already gone */ }
      },
      cancel() {
        if (fallback) { fallback.cancel(); return }
        try { worker.postMessage({ type: 'cancel' } satisfies ToWorker) } catch { /* Already gone */ }
        worker.terminate()
      }
    }
  },
  rebuild: workerRebuild
}

// ---- Native desktop engine ----

export type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
export interface ChannelLike { onmessage: (m: unknown) => void }

let tauriApi: Promise<{ invoke: Invoke; Channel: new () => ChannelLike } | null> | null = null
function tauri() {
  tauriApi ??= isDesktop ? import('@tauri-apps/api/core').then(m => ({ invoke: m.invoke as Invoke, Channel: m.Channel as unknown as new () => ChannelLike })).catch(() => null) : Promise.resolve(null)
  return tauriApi
}

const dec = new TextDecoder()

/** Scene JSON with −0 written "-0" (the IPC's JSON would turn it into 0; the Rust scene parser reads it back). */
const sceneText = (s: Scene) => JSON.stringify(s, (_k, x) => (Object.is(x, -0) ? '-0' : x))

/** Little-endian doubles as hex (the checkpoint crosses the JSON of the IPC bit for bit: −0, NaN, ±∞). */
export function f64Hex(a: Float64Array): string {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  let s = ''
  for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16)
  return s
}

/** A native message: u32 length (little endian) of a JSON header, the header, then the delta bytes if any. */
export function decodeNativeMessage(buf: ArrayBuffer | Uint8Array): FromWorker {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const n = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)
  const head = JSON.parse(dec.decode(b.subarray(4, 4 + n))) as Record<string, unknown> & { type: FromWorker['type'] }
  const rest = b.length > 4 + n ? b.slice(4 + n) : null
  switch (head.type) {
    case 'partial': return { type: 'partial', delta: rest!, paused: !!head.paused, computeMs: Number(head.computeMs) }
    case 'done': return { type: 'done', delta: rest, end: head.end as never, computeMs: Number(head.computeMs) }
    case 'started': return { type: 'started', K: head.K === null ? Infinity : Number(head.K), size: Number(head.size), chunkFrames: Number(head.chunkFrames), duration: head.duration as number | null, dt: Number(head.dt) }
    default: return head as unknown as FromWorker
  }
}

/** The Tauri functions the native host uses (tests pass an equivalent over the Node-API module). */
export interface NativeApi { invoke: Invoke; Channel: new () => ChannelLike }

/** Runs in native Rust threads of the desktop application. */
export function nativeHost(api: NativeApi): SimHost {
  return {
    kind: 'native',
    start(req, onMessage) {
      const channel = new api.Channel()
      let id: number | null = null
      let cancelled = false
      const queue: Array<Exclude<ToWorker, { type: 'start' }>> = []
      channel.onmessage = m => {
        if (cancelled) return
        try {
          const msg = decodeNativeMessage(m as ArrayBuffer)
          if (msg.type === 'error' && msg.msg) msg.msg = msg.msg && JSON.parse(JSON.stringify(msg.msg))
          onMessage(msg)
        } catch (e) {
          onMessage({ type: 'error', message: (e as Error).message })
        }
      }
      const control = (msg: Exclude<ToWorker, { type: 'start' }>) => {
        if (id === null) { queue.push(msg); return }
        api.invoke('engine_run_control', { id, msg }).catch(() => { /* The run has ended */ })
      }
      api.invoke<number>('engine_run_start', {
        request: { sceneText: sceneText(req.scene), budgetMs: req.budgetMs, duration: req.duration === undefined ? 'scene' : req.duration, lookAhead: req.lookAhead ?? DEFAULT_LOOK_AHEAD, playhead: req.playhead ?? 0, rate: req.rate ?? 1 },
        channel
      }).then(h => {
        id = h
        if (cancelled) { control({ type: 'cancel' }); return }
        for (const m of queue.splice(0)) control(m)
      }).catch(e => onMessage({ type: 'error', message: String(e) }))
      return {
        send: control,
        cancel() { if (!cancelled) { cancelled = true; control({ type: 'cancel' }) } }
      }
    },
    rebuild: req => api.invoke<ArrayBuffer>('engine_rebuild', {
      request: { sceneText: sceneText(req.scene), duration: req.duration, chunkFrames: req.chunkFrames, checkpointHex: f64Hex(req.checkpoint), endFrame: req.endFrame }
    }).then(b => new Uint8Array(b))
  }
}

let chosen: SimHost | null = null
let engineInfo: { core: string; abi: number; threads: number } | null = null

/**
 * Choose the host once: the native engine when the desktop commands answer, else a Web Worker, else this thread.
 * `preferWasm` (settings, diagnostics) keeps the WebAssembly worker on the desktop.
 */
export async function initHost(preferWasm = false): Promise<SimHost> {
  if (chosen) return chosen
  const api = await tauri()
  if (api && !preferWasm) {
    try {
      engineInfo = await api.invoke<{ core: string; abi: number; threads: number }>('engine_info')
      if (engineInfo && engineInfo.abi === 2) return (chosen = nativeHost(api))
    } catch { /* No native engine: WebAssembly */ }
  }
  return (chosen = typeof Worker !== 'undefined' ? workerHost : mainThreadHost)
}

/** The host chosen by initHost (the main thread before it has been called: tests). */
export function simHost(): SimHost { return chosen ?? (typeof Worker !== 'undefined' ? workerHost : mainThreadHost) }

/**
 * Runs that may compute at once (parameter sweeps): the native engine's logical processors less one (at least 1);
 * 1 for the WebAssembly worker and this thread.
 */
export function parallelRuns(): number {
  return chosen?.kind === 'native' && engineInfo ? Math.max(1, engineInfo.threads - 1) : 1
}

/** Version information of the native engine, when it is used. */
export function nativeEngineInfo() { return engineInfo }

/** Use a given host (tests, the self-check). */
export function setHost(h: SimHost | null) { chosen = h }
