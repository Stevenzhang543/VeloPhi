/**
 * The coverage record of 26.57 (scripts/coverage2657.mjs): every evidence reference resolves to a test that exists,
 * every status agrees with its evidence, and the generated record lists the teaching packages as the registry
 * computes them.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { PACKAGES, packageStatus } from '../src/content/packages'

describe('coverage2657 record', () => {
  it('every reference resolves and every status agrees with its evidence', () => {
    const r = spawnSync(process.execPath, ['scripts/coverage2657.mjs', '--check'], { encoding: 'utf8' })
    expect(r.stderr + r.stdout).toContain('all references resolve')
    expect(r.status).toBe(0)
  })
  it('the generated record lists the packages as the registry computes them', () => {
    const doc = JSON.parse(readFileSync('docs/coverage/coverage-26.57.json', 'utf8'))
    expect(doc.packages.map((p: { id: string }) => p.id)).toEqual(PACKAGES.map(p => p.id))
    for (const p of PACKAGES) expect(doc.packages.find((x: { id: string }) => x.id === p.id).complete, p.id).toBe(packageStatus(p).complete)
  })
})
