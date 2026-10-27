/**
 * Pure geometry for the editor (no Vue): body outlines from scene definitions, convex hulls, polygon
 * validity, re-centring of dynamic polygons and the bookkeeping that keeps attached anchors on the same
 * material point when a body's local frame changes.
 */
import type { BodyDef, PulleyDef, Scene } from '../../core/scene/types'
import { connectorAnchors } from '../../core/scene/types'
import { compoundMass, polygonIsSimple, shapeOutline } from '../../engine/calc'

/** A point (m). */
export interface Pt { x: number; y: number }

/** Shortest edge a polygon may have (m). */
export const MIN_EDGE = 1e-3
/** Smallest area a polygon may have (m²). */
export const MIN_AREA = 1e-6
/** Smallest size of a box side, circle radius or pulley radius (m). */
export const MIN_SIZE = 5e-3

/** Remove floating noise from sums and differences of snapped coordinates (0.6000000000000001 → 0.6). */
export function clean(v: number): number { return Number(v.toPrecision(12)) }

/**
 * A coordinate written by the shape operations (26.53, D74): the nearest multiple of 10⁻⁹ (m, or rad for angles), so
 * combining and cutting leave no rounding residue such as 2×10⁻¹² m; −0 becomes 0.
 */
export function q9(v: number): number {
  const r = Math.round(v * 1e9) / 1e9
  return r === 0 ? 0 : r
}

/** Cross product (a − o) × (b − o): positive when o → a → b turns left. */
export function cross3(o: Pt, a: Pt, b: Pt): number { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x) }

/** Signed area (positive when counter-clockwise). */
export function signedArea(pts: Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - p.y * q.x }
  return a / 2
}

/** Area centroid of a simple polygon (vertex mean when the area vanishes). */
export function centroid(pts: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], c = p.x * q.y - p.y * q.x
    a += c; cx += (p.x + q.x) * c; cy += (p.y + q.y) * c
  }
  if (Math.abs(a) < 1e-15) {
    let x = 0, y = 0
    for (const p of pts) { x += p.x; y += p.y }
    return { x: x / Math.max(1, pts.length), y: y / Math.max(1, pts.length) }
  }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}

/** Convex hull, counter-clockwise, without collinear points (Andrew's monotone chain). */
export function convexHull(input: Pt[]): Pt[] {
  const pts = input.map(p => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y)
  const uniq: Pt[] = []
  for (const p of pts) if (!uniq.length || Math.hypot(p.x - uniq[uniq.length - 1].x, p.y - uniq[uniq.length - 1].y) > 1e-9) uniq.push(p)
  if (uniq.length < 3) return uniq
  const lower: Pt[] = [], upper: Pt[] = []
  for (const p of uniq) {
    while (lower.length >= 2 && cross3(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-12) lower.pop()
    lower.push(p)
  }
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i]
    while (upper.length >= 2 && cross3(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-12) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

/**
 * Convex (collinear vertices allowed), counter-clockwise and not degenerate: every edge at least MIN_EDGE,
 * area at least MIN_AREA, and the boundary turns left (or goes straight) at every vertex.
 */
export function isValidConvex(pts: Pt[]): boolean {
  const n = pts.length
  if (n < 3) return false
  const area = signedArea(pts)
  if (!(area >= MIN_AREA)) return false
  let scale = 0
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n]
    const e = Math.hypot(q.x - p.x, q.y - p.y)
    if (e < MIN_EDGE) return false
    scale = Math.max(scale, e)
  }
  let turn = 0
  for (let i = 0; i < n; i++) {
    const c = cross3(pts[(i + n - 1) % n], pts[i], pts[(i + 1) % n])
    if (c < -1e-9 * scale * scale) return false
    turn += Math.atan2(c, (pts[i].x - pts[(i + n - 1) % n].x) * (pts[(i + 1) % n].x - pts[i].x) + (pts[i].y - pts[(i + n - 1) % n].y) * (pts[(i + 1) % n].y - pts[i].y))
  }
  // A convex polygon turns exactly once around (excludes self-overlapping "stars")
  return Math.abs(turn - 2 * Math.PI) < 1e-6
}

/**
 * A simple polygon (26.52, D35: concave allowed), counter-clockwise and not degenerate: every edge at least MIN_EDGE,
 * area at least MIN_AREA, no two edges crossing.
 */
export function isValidSimple(pts: Pt[]): boolean {
  const n = pts.length
  if (n < 3 || !(signedArea(pts) >= MIN_AREA)) return false
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n]
    if (Math.hypot(q.x - p.x, q.y - p.y) < MIN_EDGE) return false
  }
  return polygonIsSimple(pts)
}

/** Rotate a vector by `angle` (rad). */
export function rotate(p: Pt, angle: number): Pt {
  const c = Math.cos(angle), s = Math.sin(angle)
  return { x: c * p.x - s * p.y, y: s * p.x + c * p.y }
}

/** World point of a body-local point. */
export function toWorldPt(def: BodyDef, l: Pt): Pt {
  const r = rotate(l, def.angle)
  return { x: def.position.x + r.x, y: def.position.y + r.y }
}

/** Body-local point of a world point. */
export function toLocalPt(def: BodyDef, w: Pt): Pt {
  return rotate({ x: w.x - def.position.x, y: w.y - def.position.y }, -def.angle)
}

/**
 * Local outline vertices of a box or polygon exactly as the solver compiles them: counter-clockwise, and for
 * dynamic polygons relative to the centre of mass. Empty for circles.
 */
export function localVerts(def: BodyDef): Pt[] {
  if (def.shape.type === 'circle' || def.shape.type === 'compound') return []
  if (def.shape.type === 'box') {
    const w = def.shape.width / 2, h = def.shape.height / 2
    return [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }]
  }
  let v = def.shape.points.map(p => ({ x: p.x, y: p.y }))
  if (signedArea(v) < 0) v = v.reverse()
  if (def.kind !== 'static') {
    const c = centroid(v)
    if (Math.abs(c.x) > 1e-12 || Math.abs(c.y) > 1e-12) v = v.map(p => ({ x: p.x - c.x, y: p.y - c.y }))
  }
  return v
}

/** World outline vertices of a box or polygon (see localVerts). */
export function worldVerts(def: BodyDef): Pt[] { return localVerts(def).map(l => toWorldPt(def, l)) }

/** World centre of a pulley's axle from the scene definitions (movable pulleys are in their body's frame). */
export function pulleyWorld(scene: Scene, p: PulleyDef): Pt {
  const carrier = p.body ? scene.bodies.find(b => b.id === p.body) : null
  return carrier ? toWorldPt(carrier, p.position) : { x: p.position.x, y: p.position.y }
}

/** Centre used for rotating and placing: centre of mass of dynamic bodies, area centroid of static ones. */
export function bodyCenter(def: BodyDef): Pt {
  if (def.kind !== 'static' || def.shape.type === 'circle' || def.shape.type === 'box') return { x: def.position.x, y: def.position.y }
  if (def.shape.type === 'polygon') return toWorldPt(def, centroid(localVerts(def)))
  return toWorldPt(def, compoundMass(def.shape, 1).centroid)
}

/**
 * World outline of a body as the solver places it (26.52): one circle or polygon, or the parts of a concave or
 * compound body.
 */
export function outlineWorld(def: BodyDef): Array<{ kind: 'circle'; c: Pt; r: number } | { kind: 'poly'; pts: Pt[] }> {
  return shapeOutline(def.shape, def.kind !== 'static').map(p => (p.kind === 'circle' ? { kind: 'circle' as const, c: toWorldPt(def, p.center), r: p.radius } : { kind: 'poly' as const, pts: p.verts.map(v => toWorldPt(def, v)) }))
}

/** World bounding box of a body definition. */
export function bodyBounds(def: BodyDef): { minX: number; minY: number; maxX: number; maxY: number } {
  if (def.shape.type === 'circle') {
    const r = def.shape.radius
    return { minX: def.position.x - r, minY: def.position.y - r, maxX: def.position.x + r, maxY: def.position.y + r }
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const grow = (x: number, y: number, r = 0) => { minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r); minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r) }
  if (def.shape.type === 'compound') {
    for (const part of outlineWorld(def)) { if (part.kind === 'circle') grow(part.c.x, part.c.y, part.r); else for (const p of part.pts) grow(p.x, p.y) }
    return { minX, minY, maxX, maxY }
  }
  for (const p of worldVerts(def)) grow(p.x, p.y)
  return { minX, minY, maxX, maxY }
}

// ---- Attachments ----

/** Anchors and movable pulleys carried by a body, captured so an edit can remap their local coordinates. */
export interface Attachments { items: Array<{ orig: Pt; set: (p: Pt) => void }> }

/** Capture the anchors and movable pulleys on a body. */
export function captureAttachments(scene: Scene, bodyId: string): Attachments {
  const items: Attachments['items'] = []
  for (const c of scene.connectors) {
    const ends = connectorAnchors(c)
    for (const a of ends) if (a.body === bodyId) items.push({ orig: { ...a.local }, set: p => { a.local.x = p.x; a.local.y = p.y } })
  }
  for (const p of scene.pulleys) if (p.body === bodyId) items.push({ orig: { ...p.position }, set: q => { p.position.x = q.x; p.position.y = q.y } })
  return { items }
}

/** Set every attachment to fn(original local point). */
export function remapAttachments(att: Attachments, fn: (p: Pt) => Pt) {
  for (const it of att.items) it.set(fn(it.orig))
}

/**
 * Write new local vertices (in the frame of `localVerts(orig)`, which is the solver's body frame) to a polygon
 * body built from `orig`. Dynamic bodies are re-centred on their new centre of mass: the points shift by −c,
 * the position by R·c and attached anchors by −c, so nothing moves in the world. Static bodies keep their
 * origin.
 */
export function writePolygon(def: BodyDef, orig: BodyDef, verts: Pt[], att: Attachments | null) {
  if (def.kind === 'static') {
    def.shape = { type: 'polygon', points: verts.map(p => ({ x: p.x, y: p.y })) }
    def.position = { ...orig.position }
    if (att) remapAttachments(att, p => p)
    return
  }
  const c = centroid(verts)
  def.shape = { type: 'polygon', points: verts.map(p => ({ x: p.x - c.x, y: p.y - c.y })) }
  const rc = rotate(c, orig.angle)
  def.position = { x: orig.position.x + rc.x, y: orig.position.y + rc.y }
  if (att) remapAttachments(att, p => ({ x: p.x - c.x, y: p.y - c.y }))
}

/** Translate a body definition (static polygons stored in world coordinates move their points, as `moveObject`). */
export function translateBody(def: BodyDef, dx: number, dy: number) {
  if (def.kind === 'static' && def.shape.type === 'polygon' && def.position.x === 0 && def.position.y === 0) {
    def.shape.points = def.shape.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
  } else def.position = { x: def.position.x + dx, y: def.position.y + dy }
}

/** Box → polygon with the same outline, origin and angle (the local frame stays the same). */
export function boxToPolygon(def: BodyDef): boolean {
  if (def.shape.type !== 'box') return false
  def.shape = { type: 'polygon', points: localVerts(def) }
  return true
}

/** Distance from p to segment ab and the closest point. */
export function closestOnSegment(p: Pt, a: Pt, b: Pt): { d: number; q: Pt; u: number } {
  const ex = b.x - a.x, ey = b.y - a.y, ee = ex * ex + ey * ey
  let u = ee > 0 ? ((p.x - a.x) * ex + (p.y - a.y) * ey) / ee : 0
  u = Math.max(0, Math.min(1, u))
  const q = { x: a.x + u * ex, y: a.y + u * ey }
  return { d: Math.hypot(p.x - q.x, p.y - q.y), q, u }
}
