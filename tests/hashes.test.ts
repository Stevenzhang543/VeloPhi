/**
 * Writes the recording fingerprints of all templates (for the cross-engine check in
 * scripts/check-browser-hashes.cjs).
 */
import { it } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { TEMPLATES, buildTemplate } from '../src/templates'
import { simulate } from '../src/core/solver/simulation'

it('template fingerprints', () => {
  const out: Record<string, string> = {}
  for (const t of TEMPLATES) out[t.name] = simulate(buildTemplate(t.id)).hash
  mkdirSync('.cache', { recursive: true })
  writeFileSync('.cache/node-hashes.json', JSON.stringify(out, null, 2))
})
