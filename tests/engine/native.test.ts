/**
 * Native desktop engine (26.53, D68): the jobs of engine/velophi-native — the code behind the Tauri commands
 * `engine_run_start / engine_run_control / engine_rebuild / engine_info` — driven through the page's native host
 * (src/engine/host.ts `nativeHost`) give the same recordings as the WebAssembly job on this thread; unbounded runs
 * pause at the look-ahead, follow the playhead and stop on request; chunk rebuilds equal the WebAssembly rebuild.
 * The Tauri API is replaced by the same functions of the Node-API test module (messages polled instead of a
 * channel). Skipped when the tests run on the WebAssembly core (Windows release build: the app's self-check covers
 * the native engine there).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { buildTemplate, TEMPLATES } from '../../src/templates'
import type { Scene } from '../../src/core/scene/types'
import { cloneScene } from '../../src/core/scene/io'
import { core, jsonBytes } from '../../src/engine/core'
import type { ChannelLike, NativeApi } from '../../src/engine/host'
import { decodeNativeMessage, f64Hex, mainThreadHost, nativeHost, setHost } from '../../src/engine/host'
import type { Recording } from '../../src/engine/recording'
import { frameState } from '../../src/engine/recording'
import { startSimulation } from '../../src/app/simClient'

type Native = {
  nativeInfo(): string; nativeStart(req: Uint8Array): number; nativePoll(id: number): Uint8Array | null; nativeControl(id: number, c: Uint8Array): number
  nativeRelease(id: number): void; nativeRebuild(req: Uint8Array): Uint8Array | null; nativeRunning(): number
}
const N = (globalThis as Record<string, unknown>).__velophiNative as Native | undefined

/** The Tauri functions over the Node-API module: channel messages are polled every millisecond. */
function fakeTauri(): NativeApi {
  class Channel implements ChannelLike { onmessage: (m: unknown) => void = () => {} }
  const invoke = async <T,>(cmd: string, args: Record<string, unknown> = {}): Promise<T> => {
    switch (cmd) {
      case 'engine_info': return JSON.parse(N!.nativeInfo()) as T
      case 'engine_run_start': {
        const id = N!.nativeStart(jsonBytes(args.request))
        const ch = args.channel as Channel
        const timer = setInterval(() => {
          for (let m = N!.nativePoll(id); m; m = N!.nativePoll(id)) {
            const buf = m.buffer.slice(m.byteOffset, m.byteOffset + m.byteLength)
            ch.onmessage(buf)
            const head = decodeNativeMessage(buf)
            if (head.type === 'done' || head.type === 'error') { clearInterval(timer); N!.nativeRelease(id); return }
          }
        }, 1)
        return id as T
      }
      case 'engine_run_control': return N!.nativeControl(Number(args.id), jsonBytes(args.msg)) as T
      case 'engine_rebuild': {
        const r = N!.nativeRebuild(jsonBytes(args.request))
        if (!r) throw new Error('rebuild failed')
        return r.buffer.slice(r.byteOffset, r.byteOffset + r.byteLength) as T
      }
    }
    throw new Error(`unknown command ${cmd}`)
  }
  return { invoke: invoke as NativeApi['invoke'], Channel }
}

async function run(scene: Scene, host: 'native' | 'wasm'): Promise<Recording> {
  setHost(host === 'native' ? nativeHost(fakeTauri()) : mainThreadHost)
  const rec = await startSimulation(scene, { budgetMs: 600000, useWorker: true, progressive: false }).done
  return rec!
}

afterEach(() => setHost(null))

describe.skipIf(!N)('native desktop engine', () => {
  it('reports its version and ABI', () => {
    const i = JSON.parse(N!.nativeInfo())
    expect(i.abi).toBe(2)
    expect(i.threads).toBeGreaterThanOrEqual(1)
  })

  for (const t of TEMPLATES.slice(0, 12)) {
    it(`${t.id}: the same recording as the WebAssembly job`, async () => {
      const scene = buildTemplate(t.id)
      scene.settings.duration = scene.settings.legacyDuration
      const a = await run(cloneScene(scene), 'wasm')
      const b = await run(cloneScene(scene), 'native')
      expect(b.hash).toBe(a.hash)
      expect(b.frameCount).toBe(a.frameCount)
      expect(b.events.length).toBe(a.events.length)
      expect(Array.from(frameState(b, b.frameCount - 1))).toEqual(Array.from(frameState(a, a.frameCount - 1)))
      a.session.free(); b.session.free()
    })
  }

  it('an unbounded run pauses at the look-ahead, follows the playhead and stops', async () => {
    setHost(nativeHost(fakeTauri()))
    const scene = buildTemplate('pendulum')
    const stats: Array<{ paused: boolean; t: number }> = []
    const h = startSimulation(scene, { budgetMs: 600000, useWorker: true, progressive: true, lookAhead: 4 }, { onStats: s => stats.push({ paused: s.paused, t: s.tComputed }) })
    const until = async (f: () => boolean) => { const t0 = Date.now(); while (!f() && Date.now() - t0 < 20000) await new Promise(r => setTimeout(r, 5)) }
    await until(() => stats.some(s => s.paused))
    expect(stats.find(s => s.paused)!.t).toBeCloseTo(4, 9)
    h.setPlayhead(3.5, 2)
    await until(() => stats.some(s => s.paused && s.t > 9))
    expect(stats.filter(s => s.paused).pop()!.t).toBeCloseTo(10, 9)
    h.stop()
    const rec = (await h.done)!
    expect(rec.stopReason).toBe('user')
    expect(rec.frameCount).toBe(10 * 600 + 1)
    // The same frames as the WebAssembly job stopped at the same frame
    const ref = (await (async () => { setHost(mainThreadHost); const s = cloneScene(scene); return startSimulation(s, { budgetMs: 600000, useWorker: true, progressive: false, duration: 10 }).done })())!
    expect(Array.from(frameState(rec, 6000))).toEqual(Array.from(frameState(ref, 6000)))
    await new Promise(r => setTimeout(r, 20))
    expect(N!.nativeRunning()).toBe(0)
  })

  it('cancels a run', async () => {
    setHost(nativeHost(fakeTauri()))
    const scene = buildTemplate('pendulum')
    scene.settings.duration = 3000
    const h = startSimulation(scene, { budgetMs: 600000, useWorker: true, progressive: false })
    await new Promise(r => setTimeout(r, 50))
    h.cancel()
    expect(await h.done).toBeNull()
    const t0 = Date.now()
    while (N!.nativeRunning() > 0 && Date.now() - t0 < 5000) await new Promise(r => setTimeout(r, 5))
    expect(N!.nativeRunning()).toBe(0)
  })

  it('rebuilds a chunk like the WebAssembly run', () => {
    const scene = buildTemplate('board-block')
    scene.settings.duration = 3
    const b = core()
    const h = b.runCreate(jsonBytes({ scene, duration: 3, chunkSeconds: 0.5 }))
    b.runSetUntil(h, Infinity)
    while (b.runAdvance(h, 100000) === 0) { /* to the end */ }
    // A checkpoint: the session of the run has them
    const deltas: Uint8Array[] = []
    b.runRequestTail(h)
    for (let d = b.runTakeDelta(h); d; d = b.runTakeDelta(h)) deltas.push(d)
    const s = b.sessionCreate(jsonBytes({ scene, chunkFrames: 300, duration: 3 }))
    for (const d of deltas) b.sessionApply(s, d)
    b.sessionCall(s, jsonBytes({ op: 'evict', chunk: 2 }))
    const pre = b.sessionCall(s, jsonBytes({ op: 'prefetch', chunk: 2 }))
    expect(pre).not.toBeNull()
    // Read the checkpoint of the prefetch request out of its container
    const n = pre![4] | (pre![5] << 8) | (pre![6] << 16) | (pre![7] << 24)
    const doc = JSON.parse(new TextDecoder().decode(pre!.subarray(8, 8 + n))) as { request: { checkpoint: { $f64: [number, number] }; endFrame: number } }
    const start = Math.ceil((8 + n) / 8) * 8 + doc.request.checkpoint.$f64[0]
    const cp = new Float64Array(pre!.slice(start, start + 8 * doc.request.checkpoint.$f64[1]).buffer)
    const wasm = b.runRebuildChunk(h, cp, doc.request.endFrame)!
    const native = N!.nativeRebuild(jsonBytes({ sceneText: JSON.stringify(scene, (_k, x) => (Object.is(x, -0) ? '-0' : x)), duration: 3, chunkFrames: 300, checkpointHex: f64Hex(cp), endFrame: doc.request.endFrame }))!
    const head = (c: Uint8Array) => { const k = c[4] | (c[5] << 8) | (c[6] << 16) | (c[7] << 24); return new TextDecoder().decode(c.subarray(8, 8 + k)) }
    expect(head(native)).toBe(head(wasm))
    expect(Buffer.from(native).equals(Buffer.from(wasm))).toBe(true)
    expect(b.sessionInstall(s, 2, native)).toBe(true)
    b.sessionFree(s)
    b.runFree(h)
  })
})
