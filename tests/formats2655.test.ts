/**
 * File versions of 26.55: scenes with field regions, liquids or rail loops are written as format 7 (so 26.54 warns
 * instead of dropping them silently) and read back without a warning; circuits with the element kinds of 26.55 are
 * written as lab file version 2 (so 26.54 refuses them cleanly), every other experiment as version 1.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import { parseScene, serializeScene } from '../src/core/scene/io'
import { labVersionOf } from '../src/app/lab/state'

describe('26.55 file versions', () => {
  it('scenes with regions or rail loops are format 7 and round-trip without warnings', () => {
    for (const id of ['mass-spectrometer', 'rail-force', 'floating-block']) {
      const text = serializeScene(buildTemplate(id))
      expect(JSON.parse(text).version, id).toBe(7)
      const { scene, warnings } = parseScene(text)
      expect(warnings, id).toEqual([])
      expect(scene.version, id).toBe(7)
      expect(serializeScene(scene), id).toBe(text)
    }
    expect(JSON.parse(serializeScene(buildTemplate('cyclotron'))).version).toBe(6)
    expect(JSON.parse(serializeScene(buildTemplate('projectile'))).version).toBe(5)
  })

  it('a newer format still warns', () => {
    const doc = JSON.parse(serializeScene(buildTemplate('projectile')))
    doc.version = 8
    expect(parseScene(JSON.stringify(doc)).warnings.length).toBe(1)
  })

  it('lab files: version 2 only for circuits with new element kinds', () => {
    const el = (kind: string) => ({ id: 'e1', kind, a: [0, 0], b: [1, 0] })
    expect(labVersionOf('circuit', { elements: [el('battery'), el('resistor'), el('capacitor')] })).toBe(1)
    expect(labVersionOf('circuit', { elements: [el('battery'), el('inductor')] })).toBe(2)
    expect(labVersionOf('circuit', { elements: [el('ac')] })).toBe(2)
    expect(labVersionOf('waves', { elements: [el('ac')] })).toBe(1)
    expect(labVersionOf('circuit', undefined)).toBe(1)
  })
})
