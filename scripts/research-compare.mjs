#!/usr/bin/env node
/**
 * Compare two Research Preview packages (26.61, phase D): the reference and the resolutions of a recomputation
 * against a stored package, |a − b| ≤ atol + rtol·|b| per value (rtol 1e-9, atol 1e-12 — different hosts and
 * builds of the same core agree to rounding). Prints each difference; exit code 1 when one is outside.
 * Usage: node scripts/research-compare.mjs <stored.json> <recomputed.json>
 */
import { readFileSync } from 'node:fs'

const [a, b] = process.argv.slice(2)
if (!a || !b) { console.error('usage: node scripts/research-compare.mjs <stored.json> <recomputed.json>'); process.exit(2) }
const A = JSON.parse(readFileSync(a, 'utf8')), B = JSON.parse(readFileSync(b, 'utf8'))
const RTOL = 1e-9, ATOL = 1e-12
let bad = 0, n = 0
const cmp = (what, x, y) => {
  n++
  const ok = Math.abs(x - y) <= ATOL + RTOL * Math.abs(y)
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'DIFF'} ${what}: ${x} vs ${y} (|Δ| ${Math.abs(x - y).toExponential(2)})`)
}
if (A.id !== B.id) { console.error(`different cases: ${A.id} / ${B.id}`); process.exit(1) }
console.log(`case ${A.id}: stored ${A.engine} (${JSON.stringify(A.env)}) vs recomputed ${B.engine} (${JSON.stringify(B.env)})`)
for (const k of ['x', 'sx']) cmp(`reference.${k}`, A.reference[k], B.reference[k])
for (const r of A.resolutions) {
  const s = B.resolutions.find(q => q.n === r.n)
  if (!s) { bad++; console.log(`DIFF n = ${r.n}: missing`); continue }
  for (const k of ['x', 'sx', 'norm']) cmp(`n=${r.n} ${k}`, r[k], s[k])
}
console.log(`${n - bad}/${n} values agree; verdict stored ${A.verdict.pass}, recomputed ${B.verdict.pass}`)
process.exit(bad || !B.verdict.pass ? 1 : 0)
