/**
 * 26.53 split of the event detail view: the presentation module (src/formula/eventDetail.ts) renders from the numbers
 * the session computes (`eventData`) exactly what the 26.52 view rendered from the recording. The numbers here come
 * from the TypeScript reference (tests/reference/eventData.ts); scripts/calc-parity.mjs checks that the Rust session
 * returns the same numbers bit for bit.
 */
import { describe, expect, it } from 'vitest'
import { TEMPLATES, buildTemplate } from '../../src/templates'
import { simulate } from './core/solver/simulation'
import { buildEventDetail as legacyDetail } from './legacy/eventDetail'
import { buildEventDetail } from '../../src/formula/eventDetail'
import { eventDataRef } from './eventData'
import { defaultChoice } from '../../src/units/units'

describe('event detail: presentation from data equals the 26.52 view', () => {
  for (const t of TEMPLATES) {
    it(t.id, () => {
      const scene = buildTemplate(t.id)
      const rec = simulate(scene, { duration: Math.min(scene.settings.legacyDuration ?? 5, 6) })
      const n = Math.min(rec.events.length, 25)
      for (let i = 0; i < n; i++) {
        for (const lang of ['zh', 'en', 'de'] as const) {
          const opts = { digits: 4, units: defaultChoice() }
          expect(buildEventDetail(eventDataRef(rec, i), i, lang, opts)).toEqual(legacyDetail(rec, i, lang, opts))
        }
      }
      expect(buildEventDetail(eventDataRef(rec, rec.events.length + 3), rec.events.length + 3, 'zh')).toEqual(legacyDetail(rec, rec.events.length + 3, 'zh'))
    })
  }
})
