/** Principle 1: rendering-side consumers (formulas, observations, exports) never change the recording. */
import { describe, expect, it } from 'vitest'
import { TEMPLATES, buildTemplate } from '../src/templates'
import type { Recording } from '../src/engine/recording'
import { eventStates, exactStateAt, frameState, simulate } from '../src/engine/recording'
import { recognize } from '../src/formula/recognize'
import { cardsAt } from '../src/formula/match'
import { listQuantities, quantitySeries } from '../src/engine/observe'
import { defaultCsvIds, recordingCsv } from '../src/export/csv'
import { Sha256 } from './reference/core/record/sha256'

const digest = (a: Float64Array) => new Sha256().updateFloat64(a).digestHex()
/** Digest of every frame state of a recording. */
const statesDigest = (rec: Recording) => { const h = new Sha256(); for (let k = 0; k < rec.frameCount; k++) h.updateFloat64(frameState(rec, k)); return h.digestHex() }

describe('consumers are read-only', () => {
  for (const t of TEMPLATES) {
    it(t.id, () => {
      const rec = simulate(buildTemplate(t.id))
      const before = statesDigest(rec)
      const events = rec.events.map((_e, i) => digest(eventStates(rec, i).after)).join()
      const sits = recognize(rec)
      for (let k = 0; k <= 10; k++) cardsAt(rec, (k / 10) * (rec.frameCount - 1) * rec.dt, { digits: 6, trace: true }, sits)
      quantitySeries(rec, listQuantities(rec).map(q => q.id), 0, rec.frameCount - 1, 7)
      recordingCsv(rec, { ids: defaultCsvIds(rec), stride: 5, from: 0, to: rec.frameCount - 1 })
      exactStateAt(rec, 0.123456)
      expect(statesDigest(rec)).toBe(before)
      expect(rec.events.map((_e, i) => digest(eventStates(rec, i).after)).join()).toBe(events)
      expect(rec.session.call<{ hash: string }>({ op: 'info' }).hash).toBe(rec.hash)
    })
  }
})
