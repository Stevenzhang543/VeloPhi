/**
 * Examples of the learning handbook (manual 26.51, D46): for every library formula, a template (with parameter
 * overrides when the defaults do not show it) and a time at which the formula's card applies and agrees with the
 * simulation. Written to src/handbook/examples.json, which the handbook page reads; tests/handbook.test.ts checks
 * that every formula has an example and that each example still shows its formula.
 *
 *   node scripts/handbook-examples.mjs           rebuild src/handbook/examples.json
 *   node scripts/handbook-examples.mjs --check   exit 1 if the file is out of date
 */
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const work = join(repo, 'node_modules', '.cache', 'handbook')
mkdirSync(work, { recursive: true })
const bundle = join(work, 'hb.mjs')
await build({
  stdin: {
    contents: [
      "export { TEMPLATES, buildTemplate } from './src/templates/index.ts'",
      "export { simulate } from './src/core/solver/simulation.ts'",
      "export { recognize } from './src/formula/situations.ts'",
      "export { cardsAt } from './src/formula/match.ts'",
      "export { FORMULAS } from './src/formula/library.ts'",
      "export { HANDBOOK_VARIANTS, PREFERRED_TEMPLATE } from './src/handbook/variants.ts'"
    ].join('\n'),
    resolveDir: repo, loader: 'ts'
  },
  bundle: true, format: 'esm', platform: 'node', target: 'node20', outfile: bundle, logLevel: 'error'
})
const V = await import(pathToFileURL(bundle).href + `?t=${Date.now()}`)

const RANK = { match: 0, 'approx-ok': 1, approx: 2, 'no-measure': 3 }
/** Best example per formula: the preferred template first, then default parameters, the better verdict, the earlier time. */
const best = new Map()
for (const [id, params] of [...V.TEMPLATES.map(t => [t.id, {}]), ...V.HANDBOOK_VARIANTS]) {
  const variant = Object.keys(params).length > 0 ? 1 : 0
  const rec = V.simulate(V.buildTemplate(id, params))
  for (const s of V.recognize(rec)) {
    const times = s.tEvent !== undefined ? [s.tEvent] : [s.t0 + 0.5 * (s.t1 - s.t0), s.t0 + 0.25 * (s.t1 - s.t0), s.t0 + 0.75 * (s.t1 - s.t0)]
    for (const t of times) {
      for (const c of V.cardsAt([s], t)) {
        const r = RANK[c.verdict]
        if (r === undefined) continue
        const pref = V.PREFERRED_TEMPLATE[c.formula.id] ?? V.PREFERRED_TEMPLATE[c.formula.situation]
        const key = [pref === id ? 0 : 1, variant, r, t]
        const old = best.get(c.formula.id)
        const better = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i] - (i === 3 ? 1e-12 : 0)) return true; if (a[i] > b[i] + (i === 3 ? 1e-12 : 0)) return false } return false }
        if (!old || better(key, old.key)) {
          best.set(c.formula.id, { key, template: id, params, t })
        }
      }
    }
  }
}
const out = {}
const missing = []
for (const f of V.FORMULAS) {
  const b = best.get(f.id)
  if (!b) { missing.push(f.id); continue }
  out[f.id] = Object.keys(b.params).length ? { template: b.template, params: b.params, t: b.t } : { template: b.template, t: b.t }
}
const text = JSON.stringify(out, null, 1) + '\n'
const file = join(repo, 'src', 'handbook', 'examples.json')
if (process.argv.includes('--check')) {
  const old = readFileSync(file, 'utf8')
  if (old !== text) { console.error('src/handbook/examples.json is out of date: run node scripts/handbook-examples.mjs'); process.exit(1) }
  console.log('examples up to date')
} else {
  writeFileSync(file, text)
  console.log(`wrote ${Object.keys(out).length} examples to src/handbook/examples.json`)
}
if (missing.length) { console.error(`formulas without an example: ${missing.join(', ')}`); process.exit(1) }
