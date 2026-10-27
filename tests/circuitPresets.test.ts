/**
 * Geometry of the circuit examples (26.55, D89): no two parts drawn on the same grid segment (in the first build of
 * "远距离输电" the lamp lay on the step-down transformer's secondary winding, both drawn on top of each other).
 * Wires may run along other wires' ends, but an element body (anything but a wire) must have its segment to itself.
 */
import { describe, expect, it } from 'vitest'
import { PRESETS, FOUR_TERMINAL } from '../src/app/lab/circuitPresets'
import type { Pt } from '../src/app/lab/circuitPresets'

const seg = (a: Pt, b: Pt) => [a, b].map(p => p.join(',')).sort().join('|')

describe('circuit examples', () => {
  it('every element body has its own segment', () => {
    for (const [id, p] of Object.entries(PRESETS)) {
      const used = new Map<string, string>()
      for (const e of p.build()) {
        const pairs: Array<[Pt, Pt]> = [[e.a as Pt, e.b as Pt]]
        if (FOUR_TERMINAL.has(e.kind) && e.c && e.d) pairs.push([e.c as Pt, e.d as Pt])
        for (const [a, b] of pairs) {
          const k = seg(a, b)
          const prev = used.get(k)
          if (e.kind !== 'wire') expect(prev, `${id}: ${e.kind} on ${k} overlaps ${prev}`).toBeUndefined()
          if (!prev || prev === 'wire') used.set(k, e.kind)
        }
      }
    }
  })

  it('no terminal sits in the middle of a wire (wires connect only at their ends)', () => {
    // in the first build of "家庭电路与漏电保护" the neutral wire ran past the first lamp's terminal, which was left
    // unconnected (the lamp never lit)
    for (const [id, p] of Object.entries(PRESETS)) {
      const els = p.build()
      const ends = new Set(els.flatMap(e => [e.a, e.b, e.c, e.d].filter(Boolean).map(q => (q as Pt).join(','))))
      for (const w of els.filter(e => e.kind === 'wire')) {
        const [a, b] = [w.a as Pt, w.b as Pt]
        for (const k of ends) {
          const [x, y] = k.split(',').map(Number)
          const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
          const dot = (x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1]), len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2
          const inside = cross === 0 && dot > 0 && dot < len2
          expect(inside, `${id}: terminal ${k} inside the wire ${a.join(',')}–${b.join(',')}`).toBe(false)
        }
      }
    }
  })
})
