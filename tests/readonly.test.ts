/** Principle 1: rendering-side consumers (formulas, observations, exports) never change the recording. */
import { describe, expect, it } from 'vitest'
import { TEMPLATES, buildTemplate } from '../src/templates'
import { exactStateAt, recordingStates, simulate } from '../src/core/solver/simulation'
import { recognize } from '../src/formula/situations'
import { cardsAt } from '../src/formula/match'
import { listQuantities, quantitySeries } from '../src/core/observe/quantities'
import { defaultCsvIds, recordingCsv } from '../src/export/csv'
import { Sha256 } from '../src/core/record/sha256'

const digest = (a: Float64Array) => new Sha256().updateFloat64(a).digestHex()

describe('consumers are read-only', () => {
  for (const t of TEMPLATES) {
    it(t.id, () => {
      const rec = simulate(buildTemplate(t.id))
      const before = digest(recordingStates(rec))
      const events = rec.events.map(e => digest(e.after)).join()
      const sits = recognize(rec)
      for (let k = 0; k <= 10; k++) cardsAt(sits, (k / 10) * (rec.frameCount - 1) * rec.dt)
      quantitySeries(rec, listQuantities(rec.system).map(q => q.id), 0, rec.frameCount - 1, 7)
      recordingCsv(rec, { ids: defaultCsvIds(rec), stride: 5, from: 0, to: rec.frameCount - 1 })
      exactStateAt(rec, 0.123456)
      expect(digest(recordingStates(rec))).toBe(before)
      expect(rec.events.map(e => digest(e.after)).join()).toBe(events)
    })
  }
})
