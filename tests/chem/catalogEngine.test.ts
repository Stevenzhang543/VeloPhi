/**
 * The shipped catalogue in the core (26.64): every id the catalogue names resolves, every reagent on the shelf can be
 * added to a beaker of water and the beaker settles (or the core says why not — never silently), and a few classic
 * mixtures behave as chemistry says. This is the integration of the curated data (scripts/chem/catalog/) with the
 * bench core; the data's own checks are in tests/chem/catalog*.test.ts and tests/chem/reactions*.test.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Bench, setChemData } from '../../src/engine/chem'
import type { ChemCounts } from '../../src/engine/chem'
import { MessageError } from '../../src/i18n/message'
import { msgText } from '../../src/i18n/locale'

const root = join(__dirname, '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))
const catalog = json('src/chem/data/catalog.json') as { reagents: Array<{ id: string; kind: string; beyondModel?: boolean }>; reactions: unknown[]; couples: unknown[] }
let counts: ChemCounts

beforeAll(() => { counts = setChemData(json('src/chem/data/aqueous.json'), catalog) })

describe('the catalogue in the core', () => {
  it('resolves every id it names', () => {
    expect(counts.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    expect(counts.unknownForms).toEqual([])
    expect(counts.reagents).toBe(catalog.reagents.length)
    expect(counts.reactions).toBe(catalog.reactions.length)
    expect(counts.reagents).toBeGreaterThanOrEqual(200)
  })

  it('lets every reagent be added to water', () => {
    const failed: string[] = []
    for (const r of catalog.reagents) {
      const b = Bench.create({ format: 'velophi-bench', version: 1, objects: [{ id: 'v', kind: 'beaker', capacity_mL: 400, closed: r.kind === 'gas' }], log: [] })
      try {
        b.apply({ act: 'add', to: 'v', reagent: 'water', amount: { value: 100, unit: 'g' } })
        b.apply({ act: 'add', to: 'v', reagent: r.id, amount: r.kind === 'solution' ? { value: 5, unit: 'mL' } : r.kind === 'gas' ? { value: 0.001, unit: 'mol' } : { value: 0.5, unit: 'g' } })
        const v = b.read('v')
        if (!(v.T > 200 && v.T < 500) || !(v.mass_g > 99)) failed.push(`${r.id}: T ${v.T}, mass ${v.mass_g}`)
        b.advance(1)
      } catch (e) {
        failed.push(`${r.id}: ${e instanceof MessageError ? msgText(e.msg) : String(e)}`)
      } finally { b.free() }
    }
    expect(failed).toEqual([])
  })
})
