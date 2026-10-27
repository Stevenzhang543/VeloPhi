/**
 * Loads the Rust core for the tests (26.53, D69). `VELOPHI_CORE=wasm` uses the WebAssembly module the application
 * ships (src/engine/velophi_core.wasm, the release build on Windows); `native` the Node-API module built from the same
 * source (scripts/build-napi.mjs; the container, which has no wasm32 toolchain). Default: the Node-API module when it
 * has been built and is not older than the core's sources, else the WebAssembly module.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { CoreBackend } from '../../src/engine/core'
import { ABI_VERSION, instantiateCore, setCore } from '../../src/engine/core'

let root = ''
let nativePath = ''
let wasmPath = ''

function newestSource(dir: string): number {
  let t = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    t = Math.max(t, e.isDirectory() ? newestSource(p) : statSync(p).mtimeMs)
  }
  return t
}

function loadNative(): CoreBackend {
  const m = { exports: {} as Record<string, (...a: unknown[]) => unknown> }
  process.dlopen(m as unknown as NodeJS.Module, nativePath)
  const x = m.exports as any // eslint-disable-line @typescript-eslint/no-explicit-any
  // The native desktop engine's functions (tests/engine/native.test.ts)
  ;(globalThis as Record<string, unknown>).__velophiNative = x
  const msg = () => { const s = x.lastError() as string; try { return JSON.parse(s) } catch { return { key: 'err.internal', params: { message: s } } } }
  const b: CoreBackend = {
    kind: 'native',
    abiVersion: () => x.abiVersion(), sceneVersion: () => x.sceneVersion(), lastError: msg,
    sessionCreate: j => x.sessionCreate(j), sessionSimulate: j => x.sessionSimulate(j), sessionApply: (h, d) => x.sessionApply(h, d) === 1,
    sessionFinish: (h, j) => x.sessionFinish(h, j) === 1, sessionCall: (h, j) => x.sessionCall(h, j), sessionFrameCount: h => x.sessionFrameCount(h),
    sessionState: (h, k, out) => x.sessionState(h, k, out) === 1, sessionCheap: (h, k) => x.sessionCheap(h, k) === 1, sessionSegment: (h, k) => x.sessionSegment(h, k),
    sessionImpactLoss: (h, k) => x.sessionImpactLoss(h, k), sessionInstall: (h, c, bb) => x.sessionInstall(h, c, bb) === 1, sessionFree: h => x.sessionFree(h),
    calcCall: j => x.calcCall(j), runCreate: j => x.runCreate(j), runInfo: h => x.runInfo(h), runSetUntil: (h, f) => x.runSetUntil(h, f), runAdvance: (h, n) => x.runAdvance(h, n),
    runTime: h => x.runTime(h), runFrameCount: h => x.runFrameCount(h), runRequestTail: h => x.runRequestTail(h), runTakeDelta: h => x.runTakeDelta(h), runEnd: h => x.runEnd(h),
    runStop: h => x.runStop(h), runCancel: h => x.runCancel(h), runFailBudget: (h, ms) => x.runFailBudget(h, ms), runRebuildChunk: (h, cp, e) => x.runRebuildChunk(h, cp, e), runFree: h => x.runFree(h)
  }
  if (b.abiVersion() !== ABI_VERSION) throw new Error(`velophi-napi: ABI ${b.abiVersion()}, expected ${ABI_VERSION}`)
  return b
}

/**
 * Load the core for the repository at `repo` (tests; the parity scripts bundle this module) and install it with setCore.
 * Resolves with the backend.
 */
export async function loadTestCore(repo: string): Promise<CoreBackend> {
  root = repo
  nativePath = join(root, 'engine', 'target', 'napi', 'velophi_core.node')
  wasmPath = join(root, 'src', 'engine', 'velophi_core.wasm')
  const b = await load()
  setCore(b)
  return b
}

async function load(): Promise<CoreBackend> {
  const want = process.env.VELOPHI_CORE
  if (want === 'native') return loadNative()
  if (want === 'wasm') return instantiateCore(readFileSync(wasmPath))
  if (existsSync(nativePath) && statSync(nativePath).mtimeMs >= newestSource(join(root, 'engine', 'velophi-core', 'src'))) return loadNative()
  return instantiateCore(readFileSync(wasmPath))
}

// As the vitest setup file: load the core before every test file
if (typeof __dirname === 'string' && process.env.VITEST) await loadTestCore(join(__dirname, '..', '..'))
