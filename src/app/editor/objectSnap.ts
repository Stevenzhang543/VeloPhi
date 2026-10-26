/**
 * Object snapping (manual 26.51, D47). Editing is continuous; a dragged body is pulled into exact contact with
 * another body only when it comes close to it: face on face, vertex on face, circle tangent to a face or to
 * another circle. The pull engages within ENGAGE_PX screen pixels and lets go only after the pointer has moved
 * RELEASE_PX past the contact (hysteresis), which gives the "magnetic" feel. A second, non-parallel contact
 * (a block on the ground and against a wall) is added when it is within reach too. Points (handles, creation
 * corners, anchors) snap to object features and surfaces; rotations snap to 0°, 90° and the slope of a nearby
 * surface. Nothing here snaps to a grid (see snap.ts, optional).
 */
import type { BodyDef, Scene } from '../../core/scene/types'
import { connectorAnchors } from '../../core/scene/types'
import type { Pt } from './geometry'
import { closestOnSegment, outlineWorld, signedArea, worldVerts } from './geometry'

/** Screen distance at which a contact snap engages (px). */
export const ENGAGE_PX = 6
/** Screen distance past the contact at which an engaged snap lets go (px). */
export const RELEASE_PX = 14
/** Angle window of rotation snapping (rad): engage, release. */
export const ANGLE_ENGAGE = (1.5 * Math.PI) / 180
export const ANGLE_RELEASE = (3.5 * Math.PI) / 180

/** World outline of a body: a circle, or a counter-clockwise simple polygon (convex or concave, 26.52). */
export type Outline = { kind: 'circle'; c: Pt; r: number } | { kind: 'poly'; v: Pt[] }

/** World outline of a body definition. */
export function outlineOf(def: BodyDef): Outline {
  if (def.shape.type === 'circle') return { kind: 'circle', c: { x: def.position.x, y: def.position.y }, r: def.shape.radius }
  let v = worldVerts(def)
  if (signedArea(v) < 0) v = v.slice().reverse()
  return { kind: 'poly', v }
}

/**
 * World outlines of a body: one for a circle or a polygon, one per part for a compound (26.52, D35). Each part
 * snaps on its own; snaps of different parts are told apart by their keys.
 */
export function outlinesOf(def: BodyDef): Outline[] {
  if (def.shape.type !== 'compound') return [outlineOf(def)]
  return outlineWorld(def).map(p => (p.kind === 'circle' ? { kind: 'circle' as const, c: p.c, r: p.r } : { kind: 'poly' as const, v: signedArea(p.pts) < 0 ? p.pts.slice().reverse() : p.pts }))
}

/** The outline moved by d. */
export function shifted(o: Outline, d: Pt): Outline {
  return o.kind === 'circle' ? { kind: 'circle', c: { x: o.c.x + d.x, y: o.c.y + d.y }, r: o.r } : { kind: 'poly', v: o.v.map(p => ({ x: p.x + d.x, y: p.y + d.y })) }
}

/** A possible contact: moving the dragged outline by `delta` brings it into contact with another body. */
export interface ContactSnap {
  /** Identifies the pair of features, so an engaged snap can be recognised on the next pointer move. */
  key: string
  /** Translation that closes the gap (m). */
  delta: Pt
  /** Signed gap before the correction (m; negative: overlapping). */
  gap: number
  /** Unit direction of the correction's line (contact normal). */
  n: Pt
  /** Contact point after the correction and the target surface (for guides). */
  at: Pt
  surface: { a: Pt; b: Pt } | { c: Pt; r: number }
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y
const len = (a: Pt) => Math.hypot(a.x, a.y)

function edges(v: Pt[]): Array<{ a: Pt; b: Pt; n: Pt; i: number }> {
  const out: Array<{ a: Pt; b: Pt; n: Pt; i: number }> = []
  for (let i = 0; i < v.length; i++) {
    const a = v[i], b = v[(i + 1) % v.length], e = sub(b, a), l = len(e)
    if (l < 1e-12) continue
    out.push({ a, b, n: { x: e.y / l, y: -e.x / l }, i })
  }
  return out
}

/** Fraction of the way along segment ab of the projection of p (unclamped). */
function along(p: Pt, a: Pt, b: Pt): number {
  const e = sub(b, a), ee = dot(e, e)
  return ee > 0 ? dot(sub(p, a), e) / ee : 0
}

/** Closest boundary point of a simple polygon to p, and whether p is inside (crossing count: concave too). */
function closestOnPoly(v: Pt[], p: Pt): { q: Pt; d: number; inside: boolean } {
  let best = { q: v[0], d: Infinity }
  let inside = false
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const a = v[i], b = v[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  for (const e of edges(v)) {
    const c = closestOnSegment(p, e.a, e.b)
    if (c.d < best.d) best = { q: c.q, d: c.d }
  }
  return { ...best, inside }
}

/** All contact snaps between the moving outline m and a fixed outline f (body id `fid`) within `reach` (m). */
export function contactSnaps(m: Outline, f: Outline, fid: string, reach: number): ContactSnap[] {
  const out: ContactSnap[] = []
  const margin = 1e-9
  if (m.kind === 'poly' && f.kind === 'poly') {
    // Vertices of m onto faces of f
    m.v.forEach((p, vi) => {
      for (const e of edges(f.v)) {
        const u = along(p, e.a, e.b)
        if (u < -margin || u > 1 + margin) continue
        const gap = dot(sub(p, e.a), e.n)
        if (Math.abs(gap) > reach) continue
        const delta = { x: -gap * e.n.x, y: -gap * e.n.y }
        out.push({ key: `${fid}:mv${vi}:fe${e.i}`, delta, gap, n: e.n, at: { x: p.x + delta.x, y: p.y + delta.y }, surface: { a: e.a, b: e.b } })
      }
    })
    // Vertices of f onto faces of m
    f.v.forEach((w, wi) => {
      for (const e of edges(m.v)) {
        const u = along(w, e.a, e.b)
        if (u < -margin || u > 1 + margin) continue
        const gap = dot(sub(w, e.a), e.n)
        if (Math.abs(gap) > reach) continue
        const delta = { x: gap * e.n.x, y: gap * e.n.y }
        out.push({ key: `${fid}:fv${wi}:me${e.i}`, delta, gap, n: { x: -e.n.x, y: -e.n.y }, at: w, surface: { a: { x: e.a.x + delta.x, y: e.a.y + delta.y }, b: { x: e.b.x + delta.x, y: e.b.y + delta.y } } })
      }
    })
    return out
  }
  if (m.kind === 'circle' && f.kind === 'poly') {
    const c = closestOnPoly(f.v, m.c)
    if (c.d < 1e-12) return out
    const dir = c.inside ? { x: (c.q.x - m.c.x) / c.d, y: (c.q.y - m.c.y) / c.d } : { x: (m.c.x - c.q.x) / c.d, y: (m.c.y - c.q.y) / c.d }
    const gap = (c.inside ? -c.d : c.d) - m.r
    if (Math.abs(gap) > reach) return out
    const delta = { x: -gap * dir.x, y: -gap * dir.y }
    const e = edges(f.v).find(x => closestOnSegment(m.c, x.a, x.b).d <= c.d + 1e-12)
    out.push({ key: `${fid}:circle-poly`, delta, gap, n: dir, at: c.q, surface: e ? { a: e.a, b: e.b } : { c: c.q, r: 0 } })
    return out
  }
  if (m.kind === 'poly' && f.kind === 'circle') {
    const c = closestOnPoly(m.v, f.c)
    if (c.d < 1e-12) return out
    // Direction from the polygon towards the circle centre
    const dir = c.inside ? { x: (c.q.x - f.c.x) / c.d, y: (c.q.y - f.c.y) / c.d } : { x: (f.c.x - c.q.x) / c.d, y: (f.c.y - c.q.y) / c.d }
    const gap = (c.inside ? -c.d : c.d) - f.r
    if (Math.abs(gap) > reach) return out
    const delta = { x: gap * dir.x, y: gap * dir.y }
    out.push({ key: `${fid}:poly-circle`, delta, gap, n: { x: -dir.x, y: -dir.y }, at: { x: c.q.x + delta.x, y: c.q.y + delta.y }, surface: { c: f.c, r: f.r } })
    return out
  }
  if (m.kind === 'circle' && f.kind === 'circle') {
    const d = sub(m.c, f.c), l = len(d)
    if (l < 1e-12) return out
    const dir = { x: d.x / l, y: d.y / l }
    const gap = l - m.r - f.r
    if (Math.abs(gap) > reach) return out
    const delta = { x: -gap * dir.x, y: -gap * dir.y }
    out.push({ key: `${fid}:circle-circle`, delta, gap, n: dir, at: { x: f.c.x + dir.x * f.r, y: f.c.y + dir.y * f.r }, surface: { c: f.c, r: f.r } })
  }
  return out
}

/** Smallest extent of an outline (m): the diameter of a circle, the smaller side of a polygon's bounding box. */
function outlineSize(o: Outline): number {
  if (o.kind === 'circle') return 2 * o.r
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of o.v) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y) }
  return Math.min(x1 - x0, y1 - y0)
}

/** Engaged snaps of a drag (kept between pointer moves for the hysteresis). */
export interface SnapMemory { keys: string[] }

/** Result of snapping a body move: the correction to add to the raw displacement, and the contacts made. */
export interface MoveSnap { delta: Pt; contacts: ContactSnap[] }

/**
 * Snap the move of body `movingId`, whose outline at the raw (unsnapped) pointer position is `raw`, against
 * every other body of the scene. `ppm`: zoom (px/m). Updates `mem`.
 */
export function snapBodyMove(scene: Scene, movingId: string, rawIn: Outline | Outline[], ppm: number, mem: SnapMemory, exclude: ReadonlySet<string> = new Set()): MoveSnap {
  const engage = ENGAGE_PX / ppm, release = RELEASE_PX / ppm
  // Every part of the moving body against every part of the others (keys name the parts when there are several)
  const raw = Array.isArray(rawIn) ? rawIn : [rawIn]
  const snapsAgainst = (moving: Outline[], reach: number): ContactSnap[] => {
    const out: ContactSnap[] = []
    for (const b of scene.bodies) {
      if (b.id === movingId || exclude.has(b.id)) continue
      const fixed = outlinesOf(b)
      moving.forEach((m, i) => fixed.forEach((f, j) => {
        const fid = moving.length === 1 && fixed.length === 1 ? b.id : `${b.id}#${i}.${j}`
        out.push(...contactSnaps(m, f, fid, reach))
      }))
    }
    return out
  }
  // 26.52 (D57): pushing into another body keeps the contact — the body slides along the surface instead of
  // sinking in. An engaged contact holds at any depth and lets go only when the pointer moves RELEASE_PX away;
  // a quick move that lands overlapping is caught up to half the size of the dragged body.
  const catchDepth = Math.max(release, 0.5 * Math.max(...raw.map(outlineSize)))
  const all = snapsAgainst(raw, Infinity)
  const pick = (cands: ContactSnap[], held: string[]): ContactSnap | null => {
    // An engaged contact that still applies always wins (no flicker, and a deep push never jumps to another face)
    let best: ContactSnap | null = null
    for (const c of cands) {
      if (!held.includes(c.key) || (c.gap > 0 && c.gap > release)) continue
      if (!best || Math.abs(c.gap) < Math.abs(best.gap)) best = c
    }
    if (best) return best
    for (const c of cands) {
      if (Math.abs(c.gap) > (c.gap < 0 ? catchDepth : engage)) continue
      if (!best || Math.abs(c.gap) < Math.abs(best.gap)) best = c
    }
    return best
  }
  const first = pick(all, mem.keys)
  if (!first) { mem.keys = []; return { delta: { x: 0, y: 0 }, contacts: [] } }
  // A second contact in another direction (both corrections applied; the second only across the first normal)
  const moved = raw.map(o => shifted(o, first.delta))
  const second = snapsAgainst(moved, release).filter(c => Math.abs(c.n.x * first.n.y - c.n.y * first.n.x) >= 0.5)
  const s2 = pick(second, mem.keys)
  const delta = { x: first.delta.x, y: first.delta.y }
  const contacts = [first]
  if (s2) {
    // Keep the first contact: slide along the first surface (tangent t) until the second gap closes. A move v
    // changes every gap by v·n, so the slide is s = −gap₂ / (t·n₂).
    const t = { x: -first.n.y, y: first.n.x }
    const tn = dot(s2.n, t)
    if (Math.abs(tn) > 0.3) {
      const s = -s2.gap / tn
      delta.x += t.x * s; delta.y += t.y * s
      contacts.push(s2)
    }
  }
  mem.keys = contacts.map(c => c.key)
  return { delta, contacts }
}

/** A point snapped to object features (vertices, centres, pulley axles) or surfaces, with what it snapped to. */
export interface PointSnap { p: Pt; kind: 'feature' | 'surface'; surface?: { a: Pt; b: Pt } | { c: Pt; r: number } }

/**
 * Snap a point to the features given (within 9 px) or else to the outline of a body (within ENGAGE_PX).
 * `exclude`: bodies being edited (their own outline is not a target).
 */
export function snapPointToObjects(scene: Scene, features: Pt[], p: Pt, ppm: number, exclude: ReadonlySet<string> = new Set()): PointSnap | null {
  let best: Pt | null = null, bd = 9 / ppm
  for (const f of features) {
    const d = Math.hypot(f.x - p.x, f.y - p.y)
    if (d <= bd) { bd = d; best = f }
  }
  if (best) return { p: { x: best.x, y: best.y }, kind: 'feature' }
  let out: PointSnap | null = null
  let sd = ENGAGE_PX / ppm
  for (const b of scene.bodies) {
    if (exclude.has(b.id)) continue
    for (const o of outlinesOf(b)) {
      if (o.kind === 'circle') {
        const d = sub(p, o.c), l = len(d)
        if (l < 1e-12) continue
        const g = Math.abs(l - o.r)
        if (g < sd) { sd = g; out = { p: { x: o.c.x + d.x / l * o.r, y: o.c.y + d.y / l * o.r }, kind: 'surface', surface: { c: o.c, r: o.r } } }
      } else {
        for (const e of edges(o.v)) {
          const c = closestOnSegment(p, e.a, e.b)
          if (c.d < sd) { sd = c.d; out = { p: c.q, kind: 'surface', surface: { a: e.a, b: e.b } } }
        }
      }
    }
  }
  return out
}

/** Angles a rotation may snap to: 0, ±90°, 180° and the edge directions of nearby bodies (mod 90°). */
export function snapAngles(scene: Scene, def: BodyDef, reach: number): number[] {
  const out = [0, Math.PI / 2, -Math.PI / 2, Math.PI]
  const c = def.position
  for (const b of scene.bodies) {
    if (b.id === def.id) continue
    for (const o of outlinesOf(b)) {
      if (o.kind !== 'poly') continue
      for (const e of edges(o.v)) {
        if (closestOnSegment(c, e.a, e.b).d > reach) continue
        const a = Math.atan2(e.b.y - e.a.y, e.b.x - e.a.x)
        // A box looks the same after quarter turns: every quarter turn of the edge direction
        for (let k = 0; k < 4; k++) out.push(wrapAngle(a + (k * Math.PI) / 2))
      }
    }
  }
  return out
}

/** Wrap an angle into (−π, π]. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a <= -Math.PI) a += 2 * Math.PI
  return a
}

/** Snap a rotation angle magnetically; `held` is the angle currently engaged (NaN: none). */
export function snapRotation(angle: number, candidates: number[], held: number): { angle: number; snapped: number } {
  let best = Number.NaN, bd = Infinity
  for (const c of candidates) {
    const d = Math.abs(wrapAngle(angle - c))
    const limit = Number.isFinite(held) && Math.abs(wrapAngle(c - held)) < 1e-9 ? ANGLE_RELEASE : ANGLE_ENGAGE
    if (d <= limit && d < bd) { bd = d; best = c }
  }
  if (!Number.isFinite(best)) return { angle, snapped: Number.NaN }
  const a = wrapAngle(best)
  return { angle: Math.abs(a) < 1e-12 ? 0 : a, snapped: best }
}

/**
 * Feature points of the scene definitions: polygon vertices, centres of dynamic bodies and circles, pulley
 * axles and world anchors; bodies in `exclude` (being edited) and what they carry are left out.
 */
export function sceneFeatures(scene: Scene, exclude: ReadonlySet<string> = new Set()): Pt[] {
  const out: Pt[] = []
  for (const b of scene.bodies) {
    if (exclude.has(b.id)) continue
    if (b.kind !== 'static' || b.shape.type === 'circle') out.push({ x: b.position.x, y: b.position.y })
    if (b.shape.type === 'compound') { for (const o of outlinesOf(b)) if (o.kind === 'poly') out.push(...o.v); else out.push(o.c) }
    else if (b.shape.type !== 'circle') out.push(...worldVerts(b))
  }
  for (const p of scene.pulleys) {
    if (p.body && exclude.has(p.body)) continue
    const carrier = p.body ? scene.bodies.find(b => b.id === p.body) : null
    if (carrier) {
      const c = Math.cos(carrier.angle), s = Math.sin(carrier.angle)
      out.push({ x: carrier.position.x + c * p.position.x - s * p.position.y, y: carrier.position.y + s * p.position.x + c * p.position.y })
    } else out.push({ x: p.position.x, y: p.position.y })
  }
  for (const c of scene.connectors) for (const a of connectorAnchors(c)) if (!a.body) out.push({ x: a.local.x, y: a.local.y })
  return out
}
