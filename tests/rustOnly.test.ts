/**
 * Rust-only physics (manual 26.54, D77; 26.55 regions, rail loops and liquids): the TypeScript reference is frozen at the scope of 26.53 and knows no
 * charges or fields. Scenes that use them must be skipped by every reference comparison — and they must really be
 * different from what the reference computes (so a comparison would be wrong, not just redundant). Scenes without
 * them keep format 5 and the reference's fingerprint.
 */
import { describe, expect, it } from 'vitest'
import { TEMPLATES, buildTemplate, referenceTemplates } from '../src/templates'
import { usesFields, usesRegions } from '../src/core/scene/types'
import { serializeScene } from '../src/core/scene/io'
import { simulate as rustSimulate } from '../src/engine/recording'
import { simulate } from './reference/core/solver/simulation'

const FIELD_TEMPLATES = ['charge-deflection', 'cyclotron', 'velocity-selector', 'two-charges', 'alpha-scattering',
  // 26.55 (D90–D92): bounded regions, rail loops and liquids
  'mass-spectrometer', 'cyclotron-dees', 'bounded-field', 'circular-field', 'oscilloscope', 'field-combo', 'charged-pendulum', 'charged-drop',
  'rail-force', 'rail-coast', 'rail-fall', 'floating-block', 'sinking-ball', 'rising-block', 'weigh-in-water', 'densities', 'loaded-boat', 'ball-into-water']

describe('scenes with charges or fields', () => {
  it('are exactly the field templates, and the reference comparisons skip them', () => {
    const fields = TEMPLATES.filter(t => usesFields(buildTemplate(t.id))).map(t => t.id)
    expect(fields).toEqual(FIELD_TEMPLATES)
    const ref = referenceTemplates().map(t => t.id)
    expect(ref).toEqual(TEMPLATES.map(t => t.id).filter(id => !FIELD_TEMPLATES.includes(id)))
  })

  it('differ from what the reference computes (it ignores the electric and magnetic forces)', () => {
    // The balanced velocity selector (v₀ = E/B) moves exactly as without fields: take an unbalanced one
    for (const id of FIELD_TEMPLATES) {
      const ov: Record<string, number> = id === 'velocity-selector' ? { v0: 3 } : {}
      expect(rustSimulate(buildTemplate(id, ov)).hash, id).not.toBe(simulate(buildTemplate(id, ov)).hash)
    }
  })

  it('are written as format 6 (7 with regions, liquids or rail loops); other scenes stay format 5', () => {
    for (const t of TEMPLATES) {
      const scene = buildTemplate(t.id)
      const version = JSON.parse(serializeScene(scene)).version
      expect(version, t.id).toBe(usesRegions(scene) ? 7 : usesFields(scene) ? 6 : 5)
    }
  })

  it('a neutral body in a scene without fields keeps the reference fingerprint', () => {
    const scene = buildTemplate('projectile')
    scene.bodies.forEach(b => { b.charge = 0 })
    expect(usesFields(scene)).toBe(false)
    expect(rustSimulate(scene).hash).toBe(simulate(buildTemplate('projectile')).hash)
  })
})
