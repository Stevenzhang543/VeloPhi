#!/usr/bin/env node
/**
 * The quick gate of 26.61 (phase A): the checks to run after every change, under ten minutes on one machine — the
 * typecheck, the focused tests (Copilot undo, run identity, JSON reader, references, lessons, research case, formats,
 * streaming, the Copilot loop), the Rust core tests, and the four interface regressions when a build is present.
 * Each step prints its time; a summary goes to .cache/gate/report.json. The full release gate stays scripts/release.cmd.
 *
 * Usage: node scripts/quick-gate.mjs [--no-ui] [--no-rust]
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repo = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const args = new Set(process.argv.slice(2))
const win = process.platform === 'win32'
const npx = win ? 'npx.cmd' : 'npx'

const FOCUSED = [
  'tests/ai/undo2661.test.ts', 'tests/ai/looseJson2661.test.ts', 'tests/ai/builder2661.test.ts', 'tests/ai/verify2661.test.ts',
  'tests/app/runIdentity2661.test.ts', 'tests/app/repro2661.test.ts', 'tests/reference2661.test.ts', 'tests/events2661.test.ts',
  'tests/teaching/lessons2661.test.ts', 'tests/teaching/problems2661.test.ts', 'tests/research2661.test.ts',
  'tests/formats2655.test.ts', 'tests/app/streaming.test.ts', 'tests/app/progressive.test.ts', 'tests/ai/copilot2659.test.ts', 'tests/ai/sim2659.test.ts', 'tests/ai/aiScene2660.test.ts', 'tests/i18n.test.ts'
]

const steps = [
  { name: 'typecheck', cmd: npx, args: ['vue-tsc', '--noEmit'] },
  { name: 'focused tests', cmd: npx, args: ['vitest', 'run', ...FOCUSED] }
]
if (!args.has('--no-rust')) steps.push({ name: 'rust core', cmd: 'cargo', args: ['test', '--release', '-p', 'velophi-core', '-q'], cwd: join(repo, 'engine') })
if (!args.has('--no-ui') && existsSync(join(repo, 'dist', 'index.html'))) steps.push({ name: 'interface regressions', cmd: process.execPath, args: [join(repo, 'scripts', 'ui-regressions.mjs')] })

const report = { started: new Date().toISOString(), host: `${process.platform} ${process.arch} node ${process.version}`, steps: [] }
let failed = 0
const t0 = Date.now()
for (const s of steps) {
  const t = Date.now()
  const r = spawnSync(s.cmd, s.args, { cwd: s.cwd ?? repo, stdio: 'inherit', shell: win })
  const ok = r.status === 0
  if (!ok) failed++
  const sec = (Date.now() - t) / 1000
  report.steps.push({ name: s.name, ok, seconds: sec })
  console.log(`\n== ${ok ? 'PASS' : 'FAIL'} ${s.name} (${sec.toFixed(1)} s)\n`)
}
report.seconds = (Date.now() - t0) / 1000
mkdirSync(join(repo, '.cache', 'gate'), { recursive: true })
writeFileSync(join(repo, '.cache', 'gate', 'report.json'), JSON.stringify(report, null, 1))
console.log(`quick gate: ${steps.length - failed}/${steps.length} passed in ${report.seconds.toFixed(0)} s (target ≤ 600 s)`)
process.exit(failed ? 1 : 0)
