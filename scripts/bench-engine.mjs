/**
 * Engine benchmark (manual 26.50, §5 "Rust 速度"): the TypeScript solver vs the Rust core as WebAssembly
 * (src/engine/verity_core.wasm) in this Node process — the 14 original templates at their former duration
 * (median of N runs after two warm-up runs) and long unbounded runs (× real time). Also checks that both engines
 * give the same fingerprints.
 *
 *   node scripts/bench-engine.mjs [--runs N] [--long SECONDS]
 */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const RUNS = Number(opt('--runs', '7'))
const LONG = Number(opt('--long', '300'))

const out = join(repo, '.cache', 'bench-engine')
mkdirSync(out, { recursive: true })
const bundle = join(out, 'bench.mjs')
await build({
  stdin: {
    contents: [
      "export { TEMPLATES, buildTemplate } from './src/templates/index.ts'",
      "export { SimulationRun } from './src/core/solver/simulation.ts'",
      "export { instantiateEngine } from './src/engine/wasm.ts'"
    ].join('\n'),
    resolveDir: repo, loader: 'ts'
  },
  bundle: true, format: 'esm', platform: 'node', target: 'node20', outfile: bundle, logLevel: 'error'
})
const V = await import(pathToFileURL(bundle).href)
const engine = await V.instantiateEngine(readFileSync(join(repo, 'src', 'engine', 'verity_core.wasm')))

const ORIGINAL = ['incline', 'board-block', 'conveyor', 'conveyor-incline', 'collision-1d', 'collision-2d', 'projectile', 'pendulum', 'spring', 'hinged-rod', 'rolling', 'ball-rod', 'atwood', 'table-pulley']
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

function runTs(scene, duration, untilFrame = Infinity) {
  const run = new V.SimulationRun(scene, { duration })
  if (!run.advance(Infinity, untilFrame)) run.stop()
  return run.result()
}
function runWasm(scene, duration, untilFrame = Infinity) {
  const run = engine.create(scene, duration)
  run.setUntil(untilFrame)
  let st
  do st = run.advance(1 << 20); while (st === 'budget')
  if (st === 'paused') run.stop()
  run.takeDeltas(true)
  const end = run.end()
  run.free()
  return end
}

console.log(`14 original templates, former duration, median of ${RUNS} runs (ms)`)
console.log('  template              TS        WASM     ×')
let sumTs = 0, sumW = 0, bad = 0
for (const id of ORIGINAL) {
  const scene = V.buildTemplate(id)
  const d = scene.settings.legacyDuration
  const ts = [], w = []
  let hashTs = '', hashW = ''
  for (let i = 0; i < RUNS + 2; i++) {
    let t0 = performance.now(); const r = runTs(scene, d); const a = performance.now() - t0
    t0 = performance.now(); const e = runWasm(scene, d); const b = performance.now() - t0
    if (i >= 2) { ts.push(a); w.push(b) }
    hashTs = r.hash; hashW = e.hash
  }
  if (hashTs !== hashW) { bad++; console.log(`  ${id}: FINGERPRINT DIFFERS ${hashTs} ${hashW}`) }
  const a = median(ts), b = median(w)
  sumTs += a; sumW += b
  console.log(`  ${id.padEnd(20)} ${a.toFixed(1).padStart(8)}  ${b.toFixed(1).padStart(8)}  ${(a / b).toFixed(1).padStart(5)}`)
}
console.log(`  total                ${sumTs.toFixed(1).padStart(8)}  ${sumW.toFixed(1).padStart(8)}  ${(sumTs / sumW).toFixed(1).padStart(5)}`)

console.log(`Long unbounded runs: ${LONG} s of simulated time (× real time)`)
for (const id of ['pendulum', 'board-block', 'spring', 'vertical-circle-rod']) {
  const scene = V.buildTemplate(id)
  const F = Math.round(1 / scene.settings.outputStep)
  const until = Math.ceil(LONG * F)
  let t0 = performance.now(); runTs(scene, null, until); const a = (performance.now() - t0) / 1000
  t0 = performance.now(); runWasm(scene, null, until); const b = (performance.now() - t0) / 1000
  console.log(`  ${id.padEnd(20)} TS ${(LONG / a).toFixed(0).padStart(5)}×   WASM ${(LONG / b).toFixed(0).padStart(5)}×`)
}
if (bad) { console.log(`${bad} fingerprint mismatches`); process.exit(1) }
