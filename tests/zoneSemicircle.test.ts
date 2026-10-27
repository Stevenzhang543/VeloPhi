/**
 * Formulas of the half circle in a bounded magnetic field (zb.t, zb.d; 26.55, D90): they hold only when the half
 * circle fits in the region. In the cyclotron the radius grows with every gap crossing until the particle leaves a
 * dee through its far side; from then on the formulas are not applicable instead of deviating (found while making the
 * 26.55 promo: the cyclotron template showed two deviating cards after 13 s).
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import { simulate } from '../src/engine/recording'
import { recognize } from '../src/formula/recognize'
import { cardsAt } from '../src/formula/match'

function verdicts(id: string, ids: string[]) {
  const scene = buildTemplate(id)
  const dur = scene.settings.legacyDuration
  const rec = simulate(scene, { duration: dur })
  const sits = recognize(rec)
  const out: Array<{ t: number; id: string; verdict: string }> = []
  for (let k = 1; k <= 120; k++) {
    const t = (dur * k) / 120
    for (const c of cardsAt(rec, t, { digits: 6 }, sits)) if (ids.includes(c.formula.id)) out.push({ t, id: c.formula.id, verdict: c.verdict })
  }
  return out
}

describe('half circle in a bounded magnetic field', () => {
  it('never deviates in the cyclotron, and does not apply once the circle leaves through the far side', () => {
    const v = verdicts('cyclotron-dees', ['zb.t', 'zb.d'])
    expect(v.filter(x => x.verdict === 'deviate')).toEqual([])
    expect(v.some(x => x.verdict === 'match')).toBe(true)
    expect(v.some(x => x.verdict === 'not-applicable')).toBe(true)
  })

  it('still holds in the mass spectrometer', () => {
    const v = verdicts('mass-spectrometer', ['zb.t', 'zb.d'])
    expect(v.length).toBeGreaterThan(0)
    expect(v.filter(x => x.verdict !== 'match')).toEqual([])
  })
})
