/** Collects the numbers quoted in the release notes (written to .cache/report-26.48.json). */
import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { TEMPLATES, buildTemplate } from '../src/templates'
import { frameLedger, simulate } from '../src/core/solver/simulation'
import { recognize } from '../src/formula/situations'
import { evaluateCard } from '../src/formula/match'
import { FORMULAS } from '../src/formula/library'

it('report', () => {
  const rows: unknown[] = []
  for (const t of TEMPLATES) {
    const rec = simulate(buildTemplate(t.id))
    const L0 = frameLedger(rec, 0)
    let drift = 0, scale = 1
    for (let k = 0; k < rec.frameCount; k++) { const L = frameLedger(rec, k); drift = Math.max(drift, Math.abs(L.balance - L0.balance)); scale = Math.max(scale, Math.abs(L.kinetic), Math.abs(L.gravity), Math.abs(L.spring)) }
    const verdicts: Record<string, number> = {}
    let maxRel = 0, approx = ''
    for (const s of recognize(rec)) {
      const sample = s.sample(s.tEvent ?? (s.t0 + s.t1) / 2)
      for (const f of FORMULAS.filter(f => f.situation === s.type)) {
        const c = evaluateCard(f, s, sample, { digits: 8 })
        verdicts[c.verdict] = (verdicts[c.verdict] ?? 0) + 1
        if (c.verdict === 'match' && c.relError !== null && Math.abs(c.theory ?? 0) > 1e-9) maxRel = Math.max(maxRel, c.relError)
        if (f.kind === 'approx') approx = `${f.id} rel ${c.relError?.toExponential(2)} (${c.verdict})`
      }
    }
    rows.push({ id: t.id, name: t.name, frames: rec.frameCount, steps: rec.stats.steps, rejected: rec.stats.rejected, events: rec.stats.events, wallMs: rec.stats.wallMs, ledgerDrift: drift / scale, maxRelMatched: maxRel, verdicts, approx, hash: rec.hash })
  }
  mkdirSync('.cache', { recursive: true })
  writeFileSync('.cache/report-26.48.json', JSON.stringify(rows, null, 2))
})
