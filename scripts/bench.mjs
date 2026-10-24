/**
 * Solver benchmark: times `simulate` on every template (median of several runs after warm-up) and checks the
 * recording fingerprints.
 *
 *   node scripts/bench.mjs                         this checkout
 *   node scripts/bench.mjs --baseline <dir>        also an older checkout (e.g. the 26.48 sources) for a
 *                                                  before/after table; shared templates must hash the same
 *   options: --runs N (default 7), --json <file> (write the results)
 *
 * The TypeScript sources are bundled with esbuild (a dependency of Vite) into .cache/bench and each checkout
 * runs in its own Node process.
 */
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }

if (args[0] === '--child') {
  // Child process: time one bundle
  const [, bundle, runsText] = args
  const { TEMPLATES, buildTemplate, simulate } = await import(pathToFileURL(bundle).href)
  const runs = Number(runsText)
  const out = {}
  for (const t of TEMPLATES) {
    const scene = buildTemplate(t.id)
    let hash = ''
    for (let i = 0; i < 2; i++) hash = simulate(JSON.parse(JSON.stringify(scene))).hash
    const times = []
    for (let i = 0; i < runs; i++) {
      const s = JSON.parse(JSON.stringify(scene))
      const t0 = performance.now()
      simulate(s)
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    out[t.id] = { ms: times[Math.floor(times.length / 2)], min: times[0], hash }
  }
  process.stdout.write(JSON.stringify(out))
  process.exit(0)
}

async function bundle(root, name) {
  const dir = join(repo, '.cache/bench')
  mkdirSync(dir, { recursive: true })
  const outfile = join(dir, `${name}.mjs`)
  await build({
    stdin: { contents: "export { TEMPLATES, buildTemplate } from './src/templates/index.ts'\nexport { simulate } from './src/core/solver/simulation.ts'\n", resolveDir: root, loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', target: 'node20', outfile, logLevel: 'error'
  })
  return outfile
}

function time(bundleFile, runs) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', bundleFile, String(runs)], { encoding: 'utf8', maxBuffer: 1 << 24 })
  if (r.status !== 0) throw new Error(r.stderr || 'benchmark child failed')
  return JSON.parse(r.stdout)
}

const runs = Number(opt('--runs', '7'))
const baseline = opt('--baseline', null)
const current = time(await bundle(repo, 'current'), runs)
const before = baseline ? time(await bundle(resolve(baseline), 'baseline'), runs) : null

const rows = []
let slower = 0, mismatch = 0
for (const [id, c] of Object.entries(current)) {
  const b = before?.[id]
  const ratio = b ? c.ms / b.ms : null
  if (b && b.hash !== c.hash) mismatch++
  if (ratio !== null && ratio > 1.05) slower++
  rows.push({ id, before: b ? +b.ms.toFixed(1) : null, after: +c.ms.toFixed(1), ratio: ratio === null ? null : +ratio.toFixed(2), sameHash: b ? b.hash === c.hash : null })
}
const pad = (s, n) => String(s ?? '—').padEnd(n)
console.log(pad('template', 22) + pad('before ms', 11) + pad('after ms', 10) + pad('after/before', 14) + 'same hash')
for (const r of rows) console.log(pad(r.id, 22) + pad(r.before, 11) + pad(r.after, 10) + pad(r.ratio, 14) + pad(r.sameHash, 6))
const total = rows.reduce((s, r) => s + r.after, 0), totalBefore = rows.reduce((s, r) => s + (r.before ?? 0), 0)
console.log(`total ${total.toFixed(1)} ms${before ? ` (shared templates before ${totalBefore.toFixed(1)} ms)` : ''}; Node ${process.version}, median of ${runs} runs`)
if (before) console.log(`${slower} template(s) more than 5 % slower, ${mismatch} fingerprint mismatch(es)`)
const json = opt('--json', null)
if (json) writeFileSync(json, JSON.stringify({ node: process.version, runs, rows }, null, 2))
process.exit(mismatch ? 1 : 0)
