/**
 * Every quantity a template watches is one the quantity list knows (so panels show its Chinese label, not the
 * raw id), and pair ids are found in either body order.
 */
import { describe, expect, it } from 'vitest'
import { TEMPLATES, buildTemplate } from '../../src/templates'
import { compileModel } from '../../src/core/solver/model'
import { buildSystem } from '../../src/core/solver/dynamics'
import { canonicalQuantityId, listQuantities } from '../../src/core/observe/quantities'

describe('watched quantity ids', () => {
  it('pair ids are canonical in either order', () => {
    expect(canonicalQuantityId('pair.block|belt.slide')).toBe('pair.belt|block.slide')
    expect(canonicalQuantityId('pair.belt|block.heat')).toBe('pair.belt|block.heat')
    expect(canonicalQuantityId('contact.block|belt.f')).toBe('contact.block|belt.f')
    expect(canonicalQuantityId('block.vx')).toBe('block.vx')
  })

  for (const t of TEMPLATES) {
    it(`template ${t.id}: every watched id has a label`, () => {
      const scene = buildTemplate(t.id)
      const listed = new Map(listQuantities(buildSystem(compileModel(scene))).map(q => [q.id, q]))
      for (const id of scene.watch) {
        const q = listed.get(canonicalQuantityId(id))
        expect(q, `${t.id}: ${id}`).toBeDefined()
        expect(q!.label).not.toBe(id)
      }
    })
  }
})
