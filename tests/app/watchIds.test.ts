/**
 * Every quantity a template watches is one the quantity list knows (so panels show its Chinese label, not the
 * raw id), and pair ids are found in either body order.
 */
import { describe, expect, it } from 'vitest'
import { TEMPLATES, buildTemplate } from '../../src/templates'
import { compileModel } from '../reference/core/solver/model'
import { buildSystem } from '../reference/core/solver/dynamics'
import { canonicalQuantityId, listQuantities } from '../reference/core/observe/quantities'
import { usesFields } from '../../src/core/scene/types'
import { simulate } from '../../src/engine/recording'

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
      // Charges and fields (26.54): the listing of the Rust core
      const list = usesFields(scene) ? simulate(scene, { duration: 0.1 }).session.call<{ quantities: Array<{ id: string; label: unknown }> }>({ op: 'quantities' }).quantities : listQuantities(buildSystem(compileModel(scene)))
      const listed = new Map<string, { id: string; label: unknown }>(list.map(q => [q.id, q]))
      for (const id of scene.watch) {
        const q = listed.get(canonicalQuantityId(id))
        expect(q, `${t.id}: ${id}`).toBeDefined()
        expect(q!.label).not.toBe(id)
      }
    })
  }
})
