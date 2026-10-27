/**
 * Derivation pages of the exports (D28): the formulas of the key moments are listed once each, every one has a
 * registered derivation and builds a detail view in all three languages, and key events build event details.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import { simulate } from '../src/engine/recording'
import { recognize } from '../src/formula/recognize'
import { keyMoments } from '../src/export/moments'
import { derivationTargets } from '../src/export/derivationPages'
import { buildFormulaDetail } from '../src/formula/detail'
import { buildEventDetail, eventDataOf } from '../src/formula/eventDetail'
import { getDerivation } from '../src/formula/derivations'
import { defaultChoice } from '../src/units/units'

describe('derivation pages of exports', () => {
  for (const id of ['board-block', 'collision-1d', 'pendulum', 'rolling-slip']) {
    it(`${id}: one page per formula of the key moments, in three languages`, () => {
      const scene = buildTemplate(id)
      const rec = simulate(scene, { duration: scene.settings.legacyDuration })
      const sits = recognize(rec)
      const moments = keyMoments(rec, { events: true, segments: true, ends: true })
      const units = defaultChoice()
      const targets = derivationTargets(rec, sits, moments, 4, units)
      expect(targets.length).toBeGreaterThan(0)
      expect(new Set(targets.map(t => `${t.situation.key}|${t.formulaId}`)).size).toBe(targets.length)
      for (const t of targets) {
        expect(getDerivation(t.formulaId), t.formulaId).not.toBeNull()
        for (const lang of ['zh', 'en', 'de'] as const) {
          const view = buildFormulaDetail(rec, t.situation, t.formulaId, t.t, lang, { digits: 4, units })
          expect(view.sections.length).toBeGreaterThan(1)
        }
      }
      for (const m of moments.filter(m => m.eventIndex !== undefined)) {
        const view = buildEventDetail(eventDataOf(rec, m.eventIndex!), m.eventIndex!, 'de', { digits: 4, units })
        expect(view.sections.length).toBeGreaterThan(0)
      }
    })
  }
})
