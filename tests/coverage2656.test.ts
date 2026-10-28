/**
 * The coverage matrix (26.56): every evidence reference of the model registry and of the requirement statuses
 * resolves to a test that exists, and every status agrees with its evidence (scripts/coverage.mjs --check). The
 * generated matrix in docs/coverage is current: regenerating it gives the same models and statuses.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { MODELS } from '../src/content/models'

describe('coverage2656 matrix', () => {
  it('every reference resolves and every status agrees with its evidence', () => {
    const r = spawnSync(process.execPath, ['scripts/coverage.mjs', '--check'], { encoding: 'utf8' })
    expect(r.stderr + r.stdout).toContain('all references resolve')
    expect(r.status).toBe(0)
  })
  it('the generated matrix lists the registry as it is', () => {
    const doc = JSON.parse(readFileSync('docs/coverage/coverage-26.56.json', 'utf8'))
    expect(doc.models.map((m: { id: string }) => m.id)).toEqual(MODELS.map(m => m.id))
    for (const m of MODELS) {
      const row = doc.models.find((x: { id: string }) => x.id === m.id)
      expect([row.status, row.level, row.teaching], m.id).toEqual([m.status, m.level, m.teaching])
    }
  })
})
