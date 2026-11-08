/**
 * 26.60 r2 (D207): arcs as parts of compound shapes in the editor — combining an arc track with a flat part keeps
 * both where they were (static and moving bodies), the compound's outline holds the arc, and splitting it gives the
 * arc body back in the same place.
 */
import { describe, expect, it } from 'vitest'
import { addBody, emptyScene } from '../../src/core/scene/build'
import type { ArcShapeDef, BodyDef } from '../../src/core/scene/types'
import { usesArcs } from '../../src/core/scene/types'
import { centeredArc, arcCenterWorld } from '../../src/core/scene/arc'
import { combineBodies, explodeCompound } from '../../src/app/editor/shapeOps'
import { placePreset } from '../../src/app/editor/presets'
import { outlineWorld } from '../../src/app/editor/geometry'
import { parseScene, serializeScene } from '../../src/core/scene/io'

const PI = Math.PI
/** Lowest and highest world y of a body's outline. */
function yRange(b: BodyDef): [number, number] {
  let lo = Infinity, hi = -Infinity
  for (const o of outlineWorld(b)) for (const p of o.kind === 'poly' ? o.pts : [{ x: o.c.x, y: o.c.y - o.r }, { x: o.c.x, y: o.c.y + o.r }]) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y) }
  return [lo, hi]
}

describe('arc parts of compound bodies', () => {
  for (const kind of ['static', 'rigid'] as const) {
    it(`combines a ${kind} arc with a flat part and splits it again in place`, () => {
      const s = emptyScene('arc parts')
      const arc: ArcShapeDef = { type: 'arc', radius: 0.5, thickness: 0.1, start: PI, sweep: PI / 2, center: { x: 0, y: 0 } }
      // A moving arc has its origin at its centre of mass
      const shape = kind === 'static' ? arc : centeredArc(arc)
      const c0 = { x: 0, y: 0.6 }
      const g = kind === 'static' ? { x: 0, y: 0 } : { x: -(shape.center!.x), y: -(shape.center!.y) }
      const a = addBody(s, { id: 'a', name: '圆弧', kind, shape, position: { x: c0.x + g.x, y: c0.y + g.y }, mass: kind === 'static' ? 0 : 1 })
      const b = addBody(s, { id: 'b', name: '水平段', kind, shape: { type: 'box', width: 1, height: 0.1 }, position: { x: 0.5, y: 0.05 }, mass: kind === 'static' ? 0 : 1 })
      expect(arcCenterWorld(a as BodyDef & { shape: ArcShapeDef })).toEqual(expect.objectContaining({ x: expect.closeTo(0, 9), y: expect.closeTo(0.6, 9) }))
      const before = [yRange(a), yRange(b)]
      const r = combineBodies(s, ['a', 'b'])
      if ('error' in r) throw new Error(r.error)
      const comp = s.bodies.find(x => x.id === r.id)!
      expect(comp.shape.type === 'compound' && comp.shape.parts.map(p => p.shape.type)).toEqual(['arc', 'box'])
      expect(usesArcs(s)).toBe(true)
      // The outline spans what the two did
      const [lo, hi] = yRange(comp)
      expect(lo).toBeCloseTo(Math.min(before[0][0], before[1][0]), 6)
      expect(hi).toBeCloseTo(Math.max(before[0][1], before[1][1]), 6)
      // Saved and read back unchanged
      expect(parseScene(serializeScene(s)).scene.bodies.find(x => x.id === r.id)!.shape).toEqual(comp.shape)
      // Split: the arc body has its circle's centre where it was
      const first = explodeCompound(s, r.id)
      expect(first).not.toBeNull()
      const arcBody = s.bodies.find(x => x.shape.type === 'arc')!
      const w = arcCenterWorld(arcBody as BodyDef & { shape: ArcShapeDef })
      expect(w.x).toBeCloseTo(0, 6)
      expect(w.y).toBeCloseTo(0.6, 6)
      const box = s.bodies.find(x => x.shape.type === 'box')!
      expect(box.position.x).toBeCloseTo(0.5, 6)
      expect(box.position.y).toBeCloseTo(0.05, 6)
      if (kind === 'rigid') expect(arcBody.mass + box.mass).toBeCloseTo(2, 9)
    })
  }

  it('the arc slide preset stands on the surface, its flat part flush with the bottom of the arc', () => {
    const s = emptyScene('slide')
    const id = placePreset(s, 'add-arc-slide', { x: 1, y: 0 }, null)!
    const b = s.bodies.find(x => x.id === id)!
    expect(b.shape.type).toBe('compound')
    expect(b.fixedRotation).toBe(true)
    const [lo, hi] = yRange(b)
    expect(lo).toBeCloseTo(0, 9)
    expect(hi).toBeCloseTo(0.6, 6)
    // The flat part's top is the arc's lowest inner point (0.1 m above the surface)
    if (b.shape.type !== 'compound') return
    const box = b.shape.parts[1]
    expect(b.position.y + box.position.y + 0.05).toBeCloseTo(0.1, 9)
  })
})
