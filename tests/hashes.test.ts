/**
 * Writes the recording fingerprints of all templates (for the cross-engine check in
 * scripts/check-browser-hashes.cjs).
 */
import { it } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { TEMPLATES, buildTemplate } from '../src/templates'
import { simulate } from './reference/core/solver/simulation'
import { simulate as rustSimulate } from '../src/engine/recording'
import { usesFields } from '../src/core/scene/types'

it('template fingerprints', () => {
  const out: Record<string, string> = {}
  // Charges and fields (26.54, D77): the reference cannot run them; their fingerprint comes from the Rust core
  for (const t of TEMPLATES) { const sc = buildTemplate(t.id); out[t.name] = usesFields(sc) ? rustSimulate(sc).hash! : simulate(sc).hash }
  mkdirSync('.cache', { recursive: true })
  writeFileSync('.cache/node-hashes.json', JSON.stringify(out, null, 2))
})
