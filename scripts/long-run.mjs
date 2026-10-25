/**
 * Long unbounded runs (manual 26.50 §5, "无限时长"): pendulum, spring oscillator and vertical circle (rod) for 30
 * minutes of simulated time, streamed through the worker transport into a StreamRecording as the app does.
 *
 *   - memory of the recording with the default budget (512 MiB) and with a small one (eviction);
 *   - scrub-back: frames and exact states just after t = 10 s, 600 s, 1700 s (inside a chunk) of the evicting
 *     stream, recomputed from checkpoints, equal the uninterrupted run bit for bit, and so do the rolling
 *     fingerprints;
 *   - rebuild speed (one chunk = 1 s of simulated time);
 *   - energy-ledger drift: |balance(t) − balance(0)| relative to the largest energy term, and its growth per 100 s.
 *
 *   node scripts/long-run.mjs [--seconds 1800] [--json <file>]
 *
 * The TypeScript sources are bundled with esbuild (a dependency of Vite) into .cache/long-run.
 */
import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const SECONDS = Number(opt('--seconds', '1800'))

const out = join(repo, '.cache', 'long-run')
mkdirSync(out, { recursive: true })
const entry = join(out, 'entry.ts')
writeFileSync(entry, [
  `export { buildTemplate } from '${join(repo, 'src/templates/index.ts')}'`,
  `export { SimulationRun, frameState, exactStateAt, frameLedger } from '${join(repo, 'src/core/solver/simulation.ts')}'`,
  `export { StreamRecording } from '${join(repo, 'src/core/solver/stream.ts')}'`,
  `export { DeltaWriter } from '${join(repo, 'src/core/solver/transport.ts')}'`
].join('\n'))
const bundle = join(out, 'bundle.mjs')
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error' })
const V = await import(pathToFileURL(bundle).href)

const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
const mb = b => (b / 1048576).toFixed(1)

/** Stream an unbounded run of `frames` frames into a StreamRecording (deltas cloned as by postMessage). */
function stream(scene, frames, budgetBytes) {
  const run = new V.SimulationRun(structuredClone(scene), { duration: null })
  const writer = new V.DeltaWriter(run, true)
  const rec = new V.StreamRecording({ scene: structuredClone(scene), chunkFrames: run.chunkFrames, duration: null, budgetBytes })
  const t0 = performance.now()
  let computeMs = 0
  for (;;) {
    const s = performance.now()
    const done = run.advance(Date.now() + 100, frames)
    computeMs += performance.now() - s
    if (!done && run.k >= frames) run.stop()
    for (const d of writer.next(false)) rec.apply(structuredClone(d))
    if (run.finished) { for (const d of writer.next(true)) rec.apply(structuredClone(d)); break }
  }
  const end = run.result()
  const final = rec.final({ completed: end.completed, error: end.error, hash: end.hash, stopReason: end.stopReason })
  return { rec, final, wallMs: performance.now() - t0, computeMs }
}

const report = { seconds: SECONDS, scenes: {} }
for (const [id, params] of [['pendulum', {}], ['spring', {}], ['vertical-circle-rod', {}]]) {
  const scene = V.buildTemplate(id, params)
  const frames = Math.round(SECONDS * 600)
  // Uninterrupted reference with the default budget
  const a = stream(scene, frames, 512 * 1048576)
  const ma = a.rec.memory()
  // The same run with a small budget: most chunks evicted
  const b = stream(scene, frames, 24 * 1048576)
  const mbm = b.rec.memory()
  const r = { frames: a.final.frameCount, stop: a.final.stopReason, speed: SECONDS / (a.computeMs / 1000), memoryDefault: ma, memorySmall: mbm, fingerprint: a.final.hash, fingerprintSame: a.final.hash === b.final.hash, scrub: {}, ledger: [] }
  // Scrub back on the evicting stream: frames recomputed from checkpoints must equal the reference
  for (const t of [10, 600, 1700].filter(x => x < SECONDS)) {
    // A frame inside a chunk (a chunk start would come from its checkpoint without recomputing anything)
    const k = Math.round((t + 0.37) / a.final.dt)
    // Drop the chunk if it is still in memory, so the frame is recomputed from its checkpoint
    b.rec.evictChunk(Math.floor(k / 600))
    const before = b.rec.memory().rebuilds
    const s = performance.now()
    const X = Array.from(V.frameState(b.final, k))
    const ms = performance.now() - s
    const tt = t + 0.37 + 0.000123
    r.scrub[t] = { frame: same(X, Array.from(V.frameState(a.final, k))), exact: same(Array.from(V.exactStateAt(b.final, tt)), Array.from(V.exactStateAt(a.final, tt))), rebuilt: b.rec.memory().rebuilds - before, ms: Number(ms.toFixed(1)) }
  }
  // Rebuild speed: evict and read 30 chunks spread over the run
  const s = performance.now()
  let n = 0
  for (let c = 5; c < a.final.frameCount / 600 && n < 30; c += Math.floor(SECONDS / 30)) { b.rec.evictChunk(c); V.frameState(b.final, c * 600 + 300); n++ }
  r.rebuildMsPerChunk = Number(((performance.now() - s) / n).toFixed(1))
  // Energy-ledger drift relative to the largest energy term, every 100 s
  const L0 = V.frameLedger(a.final, 0)
  let scale = 0
  for (let k = 0; k < a.final.frameCount; k += 600 * 10) { const L = V.frameLedger(a.final, k); scale = Math.max(scale, Math.abs(L.kinetic), Math.abs(L.gravity), Math.abs(L.spring)) }
  for (let t = 100; t <= SECONDS; t += 100) {
    const L = V.frameLedger(a.final, Math.round(t * 600))
    r.ledger.push({ t, drift: Math.abs(L.balance - L0.balance) / scale })
  }
  const last = r.ledger[r.ledger.length - 1]
  r.driftPer100s = last ? last.drift / (last.t / 100) : 0
  r.maxDriftPer100s = Math.max(0, ...r.ledger.map(x => x.drift / (x.t / 100)))
  report.scenes[id] = r
  console.log(`${id}: ${r.frames} frames, ${r.speed.toFixed(1)}× real time (TS), memory ${mb(ma.memoryBytes)} MiB default / ${mb(mbm.memoryBytes)} MiB with a 24 MiB budget (${mbm.residentChunks}/${mbm.chunks} chunks resident, ${mbm.evictions} evictions)`)
  console.log(`  fingerprint ${r.fingerprint.slice(0, 16)}… same with eviction: ${r.fingerprintSame}; scrub-back ${JSON.stringify(r.scrub)}`)
  console.log(`  rebuild ${r.rebuildMsPerChunk} ms per 1 s chunk; ledger drift ${r.ledger.filter(x => [100, 600, 1700, 1800].includes(x.t)).map(x => `${x.t} s: ${x.drift.toExponential(2)}`).join(', ')}; per 100 s ≤ ${r.maxDriftPer100s.toExponential(2)}`)
}
const json = opt('--json', null)
if (json) writeFileSync(json, JSON.stringify(report, null, 2))
