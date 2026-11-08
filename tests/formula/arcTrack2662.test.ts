/**
 * 26.62 (D220): formula cards for a body on a fixed circular track. The core recognises "arc-inside" (vertical loop,
 * quarter arc) and "arc-outside" (hump bridge, dome) and every applicable card agrees with the simulation; formulas
 * whose conditions fail (a full circle when the ball leaves, the top when it never gets there) are not offered.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../../src/templates'
import { simulate } from '../../src/engine/recording'
import { recognize } from '../../src/formula/recognize'
import { evaluateCard } from '../../src/formula/match'
import { FORMULAS } from '../../src/formula/library'

function cards(template: string, values: Record<string, number> = {}, duration = 3) {
  const rec = simulate(buildTemplate(template, values), { duration })
  const sits = recognize(rec).filter(s => s.type === 'arc-inside' || s.type === 'arc-outside')
  const out: Record<string, string> = {}
  for (const s of sits) {
    const t = (s.t0 + s.t1) / 2
    for (const f of FORMULAS.filter(f => f.situation === s.type)) {
      const c = evaluateCard(rec, s, f.id, t)
      // The first phase on the track (a ball that falls back starts another one)
      if (c && out[f.id] === undefined) out[f.id] = c.verdict
    }
  }
  return { types: sits.map(s => s.type), out }
}

describe('circular track formula cards (26.62)', () => {
  it('vertical loop that goes round: bottom force, top speed and top force agree', () => {
    const r = cards('vertical-loop', { R: 0.5, v0: 5 })
    expect(r.types).toContain('arc-inside')
    expect(r.out['arc.in.Nb']).toBe('match')
    expect(r.out['arc.in.vtop']).toBe('match')
    expect(r.out['arc.in.Ntop']).toBe('match')
    expect(r.out['arc.in.hS']).not.toBe('match')
  })

  it('vertical loop that is left above the centre: the leaving height and speed agree', () => {
    const r = cards('vertical-loop', { R: 0.5, v0: 4 })
    expect(r.out['arc.in.Nb']).toBe('match')
    expect(r.out['arc.in.hS']).toBe('match')
    expect(r.out['arc.in.vS']).toBe('match')
    expect(r.out['arc.in.vtop']).not.toBe('match')
  })

  it('quarter arc: N = 3mg at the bottom', () => {
    const r = cards('arc-slide', { R: 0.8 })
    expect(r.types).toContain('arc-inside')
    expect(r.out['arc.in.Nb']).toBe('match')
  })

  it('hump bridge and dome: force at the top, leaving angle, height and speed agree', () => {
    const b = cards('hump-bridge', { R: 5, v0: 3 })
    expect(b.types).toContain('arc-outside')
    expect(b.out['arc.out.Ntop']).toBe('match')
    expect(b.out['arc.out.theta']).toBe('match')
    expect(b.out['arc.out.h']).toBe('match')
    expect(b.out['arc.out.v']).toBe('match')
    const d = cards('dome-slide', { R: 1, v0: 0.5 })
    expect(d.out['arc.out.h']).toBe('match')
    expect(d.out['arc.out.v']).toBe('match')
  })
})
