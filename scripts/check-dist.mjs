/**
 * Check of the web build (26.53, D65/D69): the bundles in dist/ must not contain the TypeScript reference engine
 * (tests/reference). The markers are property and method names that survive minification. The WebAssembly module
 * (the Rust core) is not checked: its strings are the core's own.
 *
 *   node scripts/check-dist.mjs [dist]      prints the findings, exit code 1 when there are any
 *
 * Used by tests/architecture.test.ts and scripts/release.cmd.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Names that only the reference engine defines. */
export const REFERENCE_MARKERS = ['rebuildChunk', 'solveMode', 'solutionCache', 'updateFloat64', 'SimulationRun', 'StreamRecording', 'IncrementalRecognizer', 'recordingStates', 'frameSolution']

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(js|mjs|html)$/.test(name)) out.push(p)
  }
  return out
}

/** Findings "file: marker" for the bundles under `dir`. */
export function checkDist(dir) {
  const out = []
  for (const p of walk(dir)) {
    const src = readFileSync(p, 'utf8')
    for (const m of REFERENCE_MARKERS) if (src.includes(m)) out.push(`${relative(dir, p).split('\\').join('/')}: ${m}`)
  }
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const dir = resolve(process.argv[2] ?? join(here, '..', 'dist'))
  const found = checkDist(dir)
  for (const f of found) console.log(f)
  console.log(found.length ? `check-dist: ${found.length} reference markers in ${dir}` : `check-dist: ${dir} contains no reference code`)
  process.exit(found.length ? 1 : 0)
}
