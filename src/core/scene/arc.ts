/**
 * Arc tracks (26.59 fix 3, D193): mass properties of the annular sector and the placement rule — a dynamic arc
 * turns about its centre of mass, so its `center` is set so that the centre of mass is the body origin; a static
 * arc keeps its centre at the origin (the body position is the circle's centre). Same formulas as the Rust core
 * (model.rs `arc_mass`).
 */
import type { ArcShapeDef, BodyDef } from './types'
import type { Vec2 } from '../math/vec'

/** Area and the area centroid relative to the circle's centre of an arc. */
export function arcCentroid(s: Pick<ArcShapeDef, 'radius' | 'thickness' | 'start' | 'sweep'>): { area: number; c: Vec2 } {
  const ri = s.radius, ro = s.radius + s.thickness, a = s.sweep / 2
  const area = a * (ro * ro - ri * ri)
  const d = a > 0 && ro > ri ? ((2 / 3) * (ro ** 3 - ri ** 3)) / (ro * ro - ri * ri) * (Math.sin(a) / a) : 0
  const m = s.start + a
  return { area, c: { x: d * Math.cos(m), y: d * Math.sin(m) } }
}

/** The arc with `center` placing its centre of mass at the origin (dynamic bodies). */
export function centeredArc(s: ArcShapeDef): ArcShapeDef {
  const { c } = arcCentroid(s)
  return { ...s, center: { x: -c.x, y: -c.y } }
}

/** World position of the circle's centre of an arc body. */
export function arcCenterWorld(b: Pick<BodyDef, 'position' | 'angle'> & { shape: ArcShapeDef }): Vec2 {
  const c = b.shape.center ?? { x: 0, y: 0 }
  const cs = Math.cos(b.angle), sn = Math.sin(b.angle)
  return { x: b.position.x + cs * c.x - sn * c.y, y: b.position.y + sn * c.x + cs * c.y }
}

/**
 * Re-place an arc body for its kind without moving it in the world: dynamic → origin at the centre of mass, static →
 * origin at the circle's centre.
 */
export function placeArc(b: BodyDef) {
  if (b.shape.type !== 'arc') return
  const w = arcCenterWorld(b as BodyDef & { shape: ArcShapeDef })
  const shape: ArcShapeDef = b.kind === 'static' ? { ...b.shape, center: { x: 0, y: 0 } } : centeredArc(b.shape)
  const c = shape.center ?? { x: 0, y: 0 }
  const cs = Math.cos(b.angle), sn = Math.sin(b.angle)
  b.shape = shape
  b.position = { x: w.x - (cs * c.x - sn * c.y), y: w.y - (sn * c.x + cs * c.y) }
}

/** An arc shape from degrees (presets). */
export function arcDeg(radius: number, thickness: number, startDeg: number, sweepDeg: number): ArcShapeDef {
  return { type: 'arc', radius, thickness, start: (startDeg * Math.PI) / 180, sweep: (sweepDeg * Math.PI) / 180 }
}
