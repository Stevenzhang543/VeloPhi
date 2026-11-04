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
import { arcCorners, bodyGap, boundaryOf, cornersOf, dot as pdot, inSpan, piecesBounds, piecesOf, pushAlong, separate, shiftPieces } from '../../engine/pieces'
import type { Gap, Piece } from '../../engine/pieces'

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
const dot = pdot
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

/** Engaged snaps of a drag (kept between pointer moves for the hysteresis): bodies in contact and their normals. */
export interface SnapMemory { keys: string[]; normals?: Record<string, Pt> }

/** Result of snapping a body move: the correction to add to the raw displacement, and the contacts made. */
export interface MoveSnap { delta: Pt; contacts: ContactSnap[] }

/** What a move snaps to: `grid` step (m, 0: none), other bodies (`objects`, default on), bodies left out. */
export interface MoveSnapOptions { grid?: number; objects?: boolean; exclude?: ReadonlySet<string> }

/** Size of a body for the catch depth: the smaller side of its bounds. */
function piecesSize(ps: Piece[]): number {
  const b = piecesBounds(ps)
  return Math.max(1e-6, Math.min(b.maxX - b.minX, b.maxY - b.minY))
}

/** Round to the grid without floating noise. */
function gridRound(v: number, step: number): number {
  const r = Math.round(v / step) * step
  const digits = Math.max(0, Math.min(12, Math.ceil(-Math.log10(step)) + 3))
  return Number(r.toFixed(digits))
}

/**
 * Grid snapping of a move (26.60, D202): the feature of the body nearest to a grid line — an edge of its bounds, its
 * origin, a corner, the end of an arc — goes onto that line, separately in x and in y. Snapping the displacement (as
 * before 26.60) kept whatever offset the body had from the grid, so a quarter arc, whose ends are not at its origin,
 * could never be put level with the ground.
 */
function gridShift(ps: Piece[], origin: Pt, step: number): Pt {
  const b = piecesBounds(ps)
  const corners = cornersOf(ps)
  const xs = [b.minX, b.maxX, origin.x, ...corners.map(v => v.x)]
  const ys = [b.minY, b.maxY, origin.y, ...corners.map(v => v.y)]
  const best = (vals: number[]) => {
    let c = Infinity
    for (const v of vals) { if (!Number.isFinite(v)) continue; const r = gridRound(v, step) - v; if (Math.abs(r) < Math.abs(c) - 1e-12) c = r }
    return Number.isFinite(c) ? c : 0
  }
  return { x: best(xs), y: best(ys) }
}

/** A guide along a contact surface through `at` (direction `t`), as long as the dragged body. */
function surfaceGuide(id: string, g: Gap, delta: Pt, half: number, gapBefore: number): ContactSnap {
  const t = { x: -g.n.y, y: g.n.x }
  return { key: id, delta, gap: gapBefore, n: g.n, at: g.at, surface: { a: { x: g.at.x - t.x * half, y: g.at.y - t.y * half }, b: { x: g.at.x + t.x * half, y: g.at.y + t.y * half } } }
}

/**
 * Snap the move of body `movingId` by the raw displacement `shift` (from its current definition) — 26.60, D202. In
 * order: the grid (when on); a first contact with another body — pulled in within ENGAGE_PX, held until RELEASE_PX,
 * an overlap pushed out the shortest way (a held flat contact keeps its direction, so a body pushed into a surface
 * slides along it; a quick move landing up to half the body's size deep is caught); a second contact in another
 * direction, reached by sliding along the first surface; and, with one contact only, a corner of the body lined up
 * with a corner of the body it touches when they are within ENGAGE_PX along the surface (blocks stacked flush, an arc's
 * end level with the ground's top). Distances are exact signed gaps between the shapes' convex pieces and arc bands
 * (pieces.ts), so an arc snaps by its true circles and corners touching corners no longer look like deep overlaps
 * through the wrong face (the sideways jump of 26.59). `ppm`: zoom (px/m). Updates `mem`.
 */
export function snapBodyMove(scene: Scene, movingId: string, shift: Pt, ppm: number, mem: SnapMemory, opts: MoveSnapOptions = {}): MoveSnap {
  const def = scene.bodies.find(b => b.id === movingId)
  if (!def) return { delta: { x: 0, y: 0 }, contacts: [] }
  const engage = ENGAGE_PX / ppm, release = RELEASE_PX / ppm
  const base = piecesOf(def)
  const at = (d: Pt) => shiftPieces(base, d)
  const total = { x: shift.x, y: shift.y }
  if (opts.grid && opts.grid > 0) {
    const g = gridShift(at(total), { x: def.position.x + total.x, y: def.position.y + total.y }, opts.grid)
    total.x += g.x; total.y += g.y
  }
  const done = (contacts: ContactSnap[]): MoveSnap => ({ delta: { x: total.x - shift.x, y: total.y - shift.y }, contacts })
  if (opts.objects === false) { mem.keys = []; mem.normals = {}; return done([]) }
  const size = piecesSize(base)
  const catchDepth = Math.max(release, 0.5 * size)
  const others = scene.bodies.filter(b => b.id !== movingId && !opts.exclude?.has(b.id)).map(b => ({ id: b.id, pieces: piecesOf(b) }))
  const gapTo = (o: { pieces: Piece[] }, d: Pt) => bodyGap(o.pieces, at(d), catchDepth + release)
  const held = new Set(mem.keys)
  const normals = mem.normals ?? {}
  const reachOf = (id: string, g: Gap) => (g.d < 0 ? -g.d <= catchDepth || held.has(id) : g.d <= (held.has(id) ? release : engage))

  // First contact: a held one (any depth, until it is RELEASE_PX away), else the deepest overlap or the nearest gap
  let first: { o: (typeof others)[number]; g: Gap } | null = null
  for (const o of others) {
    const g = gapTo(o, total)
    if (!g || !reachOf(o.id, g)) continue
    const h = held.has(o.id), fh = first ? held.has(first.o.id) : false
    if (!first || (h && !fh) || (h === fh && g.d < first.g.d)) first = { o, g }
  }
  if (!first) { mem.keys = []; mem.normals = {}; return done([]) }
  const gap0 = first.g.d
  let n1 = first.g.n
  const hn = normals[first.o.id]
  let pushed = false
  if (first.g.d < 0 && hn && held.has(first.o.id) && dot(hn, n1) > 0.3) {
    // A held flat contact pushed in: out along the held normal (slides along the face, never jumps to another face)
    let t = 0, ok = true
    const mp = at(total)
    for (const f of first.o.pieces) for (const m of mp) {
      if (!separate(f, m)) continue
      const s = pushAlong(f, m, hn)
      if (s === null) { ok = false; break }
      t = Math.max(t, s)
    }
    if (ok) { total.x += hn.x * t; total.y += hn.y * t; n1 = hn; pushed = true }
  }
  if (!pushed) { total.x -= first.g.d * n1.x; total.y -= first.g.d * n1.y }
  const contacts: Array<{ id: string; pieces: Piece[]; second: boolean }> = [{ id: first.o.id, pieces: first.o.pieces, second: false }]

  // Second contact in another direction: slide along the first surface (tangent t) until its gap closes
  const t1 = { x: -n1.y, y: n1.x }
  let second: { o: (typeof others)[number]; g: Gap } | null = null
  for (const o of others) {
    if (o.id === first.o.id) continue
    const g = gapTo(o, total)
    if (!g || !reachOf(o.id, g) || Math.abs(n1.x * g.n.y - n1.y * g.n.x) < 0.5 || Math.abs(dot(t1, g.n)) <= 0.3) continue
    if (!second || g.d < second.g.d) second = { o, g }
  }
  if (second) {
    const s = -second.g.d / dot(t1, second.g.n)
    total.x += t1.x * s; total.y += t1.y * s
    contacts.push({ id: second.o.id, pieces: second.o.pieces, second: true })
  }
  // Curved surfaces: settle both contacts again (a slide along a tangent leaves a circle slightly off it)
  for (let k = 0; k < 3; k++) {
    let worst = 0
    for (const c of contacts) {
      const g = bodyGap(c.pieces, at(total), release)
      if (!g || Math.abs(g.d) < 1e-12) continue
      worst = Math.max(worst, Math.abs(g.d))
      if (!c.second) { total.x -= g.d * g.n.x; total.y -= g.d * g.n.y }
      else { const tn = dot(t1, g.n); if (Math.abs(tn) > 0.3) { total.x -= (g.d / tn) * t1.x; total.y -= (g.d / tn) * t1.y } }
    }
    if (worst < 1e-12) break
  }

  // One contact: line a corner up with a corner of the body touched, along the surface
  const out: ContactSnap[] = []
  const guideLen = Math.max(size, 30 / ppm)
  const g1 = bodyGap(first.o.pieces, at(total), release) ?? first.g
  out.push(surfaceGuide(first.o.id, g1, { x: total.x - shift.x, y: total.y - shift.y }, guideLen, gap0))
  if (!second) {
    const mine = cornersOf(at(total))
    const theirs = cornersOf(first.o.pieces).filter(v => Math.hypot(v.x - g1.at.x, v.y - g1.at.y) <= 2 * size + engage)
    let best: { d: number; a: Pt; b: Pt } | null = null
    for (const m of mine) for (const f of theirs) {
      const d = (f.x - m.x) * t1.x + (f.y - m.y) * t1.y
      if (Math.abs(d) <= engage && (!best || Math.abs(d) < Math.abs(best.d) - 1e-12)) best = { d, a: m, b: f }
    }
    if (best && Math.abs(best.d) > 1e-12) {
      // Only when the contact survives the slide (the faces still overlap)
      const trial = { x: total.x + t1.x * best.d, y: total.y + t1.y * best.d }
      const g = bodyGap(first.o.pieces, at(trial), release)
      if (g && Math.abs(g.d) < 1e-9) {
        total.x = trial.x; total.y = trial.y
        const m = { x: best.a.x + t1.x * best.d, y: best.a.y + t1.y * best.d }
        out.push({ key: `${first.o.id}:align`, delta: { x: total.x - shift.x, y: total.y - shift.y }, gap: 0, n: t1, at: best.b, surface: { a: m, b: best.b } })
      }
    } else if (best) out.push({ key: `${first.o.id}:align`, delta: { x: total.x - shift.x, y: total.y - shift.y }, gap: 0, n: t1, at: best.b, surface: { a: best.a, b: best.b } })
  }
  if (second) {
    const g2 = bodyGap(second.o.pieces, at(total), release) ?? second.g
    out.push(surfaceGuide(second.o.id, g2, { x: total.x - shift.x, y: total.y - shift.y }, guideLen, second.g.d))
  }
  mem.keys = contacts.map(c => c.id)
  mem.normals = { [first.o.id]: n1, ...(second ? { [second.o.id]: second.g.n } : {}) }
  return done(out)
}

/** A point snapped to object features (vertices, centres, pulley axles) or surfaces, with what it snapped to. */
export interface PointSnap { p: Pt; kind: 'feature' | 'surface'; surface?: { a: Pt; b: Pt } | { c: Pt; r: number } }

/**
 * Snap a point to the features given (within 9 px) or else to the boundary of a body (within ENGAGE_PX): polygon
 * edges, circles, and since 26.60 the inner and outer circles and end faces of arcs. `exclude`: bodies being edited.
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
  const circle = (c: Pt, r: number, ok: (q: Pt) => boolean = () => true) => {
    const d = sub(p, c), l = len(d)
    if (l < 1e-12) return
    const q = { x: c.x + d.x / l * r, y: c.y + d.y / l * r }
    const g = Math.abs(l - r)
    if (g < sd && ok(q)) { sd = g; out = { p: q, kind: 'surface', surface: { c, r } } }
  }
  const segment = (a: Pt, b: Pt) => {
    const c = closestOnSegment(p, a, b)
    if (c.d < sd) { sd = c.d; out = { p: c.q, kind: 'surface', surface: { a, b } } }
  }
  for (const b of scene.bodies) {
    if (exclude.has(b.id)) continue
    const bd2 = boundaryOf(b)
    for (const loop of bd2.loops) for (const e of edges(signedArea(loop) < 0 ? loop.slice().reverse() : loop)) segment(e.a, e.b)
    for (const c of bd2.circles) circle(c.c, c.r)
    for (const a of bd2.arcs) {
      circle(a.c, a.ri, q => inSpan(a, q))
      circle(a.c, a.ro, q => inSpan(a, q))
      const k = arcCorners(a)
      if (k.length) { segment(k[0], k[1]); segment(k[2], k[3]) }
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
    else if (b.shape.type === 'arc') {
      // 26.60 (D202): an arc's four corners (its ends) and the centre of its circles
      for (const a of boundaryOf(b).arcs) { out.push(...arcCorners(a)); out.push({ x: a.c.x, y: a.c.y }) }
    } else if (b.shape.type !== 'circle') out.push(...worldVerts(b))
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
