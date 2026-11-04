/**
 * World geometry of body shapes for the editor's snapping and the overlap check (26.60, D202; split out of
 * overlaps.ts). A body is a set of convex pieces — convex polygons, the triangles of a concave polygon, the parts of a
 * compound shape, circles — and exact arc bands (annular sectors), read from the core's shape outline. Two pieces have
 * a signed gap: the distance between them when apart, minus the depth of their overlap when they overlap, with the
 * unit direction that moves the second piece away from the first and a point on the first where they meet.
 */
import type { BodyDef } from '../core/scene/types'
import { calc } from './core'
import type { ArcPiece, ShapePiece } from './model'

export type V = { x: number; y: number }
/** Annular sector: radii `ri` < `ro` about `c`, from angle `a0` (rad, world) over `sw`. */
export type Arc = { k: 'arc'; c: V; ri: number; ro: number; a0: number; sw: number }
export type Piece = { k: 'poly'; p: V[] } | { k: 'circle'; c: V; r: number } | Arc
/** An overlap: push the second shape by `n · depth` (unit n) to separate. */
export type Sep = { depth: number; n: V }
/** Signed gap of a second piece from a first: distance (negative: overlap depth), escape direction, meeting point. */
export interface Gap { d: number; n: V; at: V }

export const dot = (a: V, b: V) => a.x * b.x + a.y * b.y
export const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y })
export const len = (a: V) => Math.hypot(a.x, a.y)
const unit = (a: V, fallback: V = { x: 0, y: 1 }): V => { const l = len(a); return l > 1e-15 ? { x: a.x / l, y: a.y / l } : fallback }
const neg = (a: V): V => ({ x: -a.x, y: -a.y })

// ---- pieces in world coordinates ----

function cross(o: V, a: V, b: V) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x) }

function convex(p: V[]): boolean {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const c = cross(p[i], p[(i + 1) % p.length], p[(i + 2) % p.length])
    if (Math.abs(c) < 1e-15) continue
    if (s === 0) s = Math.sign(c)
    else if (Math.sign(c) !== s) return false
  }
  return true
}

/** Ear-clipping triangulation of a simple polygon (counter-clockwise or not). */
function triangles(pts: V[]): V[][] {
  let p = pts.slice()
  let area = 0
  for (let i = 0; i < p.length; i++) area += p[i].x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * p[i].y
  if (area < 0) p = p.reverse()
  const out: V[][] = []
  let guard = 0
  while (p.length > 3 && guard++ < 1000) {
    let cut = false
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length]
      if (cross(a, b, c) <= 1e-15) continue
      if (p.some(q => q !== a && q !== b && q !== c && cross(a, b, q) >= 0 && cross(b, c, q) >= 0 && cross(c, a, q) >= 0)) continue
      out.push([a, b, c])
      p.splice(i, 1)
      cut = true
      break
    }
    if (!cut) break
  }
  if (p.length === 3) out.push(p)
  return out
}

/** Local outline of a shape from the core, cached by its definition (editing asks for it on every pointer move). */
const outlineCache = new Map<string, Array<ShapePiece | ArcPiece>>()
function localOutline(b: BodyDef): Array<ShapePiece | ArcPiece> {
  const dynamic = b.kind !== 'static'
  const key = `${dynamic ? 1 : 0}${JSON.stringify(b.shape)}`
  let o = outlineCache.get(key)
  if (!o) {
    o = calc<{ outline: Array<ShapePiece | ArcPiece> }>({ op: 'shapeOutline', shape: b.shape, dynamic }).outline
    if (outlineCache.size > 400) outlineCache.clear()
    outlineCache.set(key, o)
  }
  return o
}

/** A body's frame: local point to world. */
function toWorld(b: BodyDef): (v: V) => V {
  const c = Math.cos(b.angle), s = Math.sin(b.angle)
  return v => ({ x: b.position.x + c * v.x - s * v.y, y: b.position.y + s * v.x + c * v.y })
}

/** Convex pieces of a body in world coordinates. */
export function piecesOf(b: BodyDef): Piece[] {
  const w = toWorld(b)
  const out: Piece[] = []
  for (const p of localOutline(b)) {
    if (p.kind === 'circle') out.push({ k: 'circle', c: w(p.center), r: p.radius })
    else if (p.kind === 'arc') out.push({ k: 'arc', c: w(p.center), ri: p.rIn, ro: p.rOut, a0: p.start + b.angle, sw: p.sweep })
    else {
      const pts = p.verts.map(w)
      if (convex(pts)) out.push({ k: 'poly', p: pts })
      else for (const t of triangles(pts)) out.push({ k: 'poly', p: t })
    }
  }
  return out
}

/** Boundary of a body in world coordinates: polygon loops (not triangulated), circles and arc bands. */
export interface Boundary { loops: V[][]; circles: Array<{ c: V; r: number }>; arcs: Arc[] }
export function boundaryOf(b: BodyDef): Boundary {
  const w = toWorld(b)
  const out: Boundary = { loops: [], circles: [], arcs: [] }
  for (const p of localOutline(b)) {
    if (p.kind === 'circle') out.circles.push({ c: w(p.center), r: p.radius })
    else if (p.kind === 'arc') out.arcs.push({ k: 'arc', c: w(p.center), ri: p.rIn, ro: p.rOut, a0: p.start + b.angle, sw: p.sweep })
    else out.loops.push(p.verts.map(w))
  }
  return out
}

/** The pieces moved by d. */
export function shiftPieces(ps: Piece[], d: V): Piece[] {
  return ps.map(p => p.k === 'poly' ? { k: 'poly', p: p.p.map(v => ({ x: v.x + d.x, y: v.y + d.y })) } : { ...p, c: { x: p.c.x + d.x, y: p.c.y + d.y } })
}

/** Whether an arc band covers the full turn. */
const fullTurn = (a: Arc) => a.sw >= 2 * Math.PI - 1e-9

/** The four corners of an arc band (none for a full ring): inner and outer at the start, inner and outer at the end. */
export function arcCorners(a: Arc): V[] {
  if (fullTurn(a)) return []
  const u0 = { x: Math.cos(a.a0), y: Math.sin(a.a0) }, u1 = { x: Math.cos(a.a0 + a.sw), y: Math.sin(a.a0 + a.sw) }
  const at = (u: V, r: number) => ({ x: a.c.x + u.x * r, y: a.c.y + u.y * r })
  return [at(u0, a.ri), at(u0, a.ro), at(u1, a.ri), at(u1, a.ro)]
}

/** Whether the direction of `p` from the arc's centre lies within its angular span. */
export function inSpan(a: Arc, p: V): boolean {
  if (fullTurn(a)) return true
  let rel = (Math.atan2(p.y - a.c.y, p.x - a.c.x) - a.a0) % (2 * Math.PI)
  if (rel < 0) rel += 2 * Math.PI
  return rel <= a.sw + 1e-12
}

/** Points on the boundary of an arc (inner and outer circle and end faces), at most a few millimetres apart. */
export function arcPoints(a: Arc): V[] {
  const step = Math.max(Math.PI / 1800, Math.min(Math.PI / 90, 0.004 / a.ro))
  const n = Math.min(6000, Math.max(1, Math.ceil(a.sw / step)))
  const out: V[] = []
  for (let k = 0; k <= n; k++) {
    const t = a.a0 + (a.sw * k) / n, u = { x: Math.cos(t), y: Math.sin(t) }
    out.push({ x: a.c.x + a.ri * u.x, y: a.c.y + a.ri * u.y }, { x: a.c.x + a.ro * u.x, y: a.c.y + a.ro * u.y })
    if (k === 0 || k === n) for (let m = 1; m < 8; m++) { const r = a.ri + ((a.ro - a.ri) * m) / 8; out.push({ x: a.c.x + r * u.x, y: a.c.y + r * u.y }) }
  }
  return out
}

export function axes(p: V[]): V[] {
  return p.map((a, i) => { const b = p[(i + 1) % p.length], e = sub(b, a), l = len(e) || 1; return { x: e.y / l, y: -e.x / l } })
}

export function project(p: V[], n: V): [number, number] {
  let lo = Infinity, hi = -Infinity
  for (const v of p) { const d = dot(v, n); if (d < lo) lo = d; if (d > hi) hi = d }
  return [lo, hi]
}

/** Signed distance of a point to a convex polygon (negative inside) and the outward normal of the nearest face. */
function polyDistance(P: V[], q: V): { d: number; n: V } {
  let best = { d: -Infinity, n: { x: 0, y: 1 } }
  for (const [i, n] of axes(P).entries()) { const d = dot(sub(q, P[i]), n); if (d > best.d) best = { d, n } }
  return best
}

/** Signed distance from a point to an annular sector and the outward direction at the closest point. */
export function sectorDistance(a: Arc, p: V): { d: number; n: V } {
  const v = sub(p, a.c), rho = len(v)
  const ang = Math.atan2(v.y, v.x)
  let rel = (ang - a.a0) % (2 * Math.PI)
  if (rel < 0) rel += 2 * Math.PI
  const radial = rho > 1e-12 ? { x: v.x / rho, y: v.y / rho } : { x: 1, y: 0 }
  const segDist = (t: number) => {
    const u = { x: Math.cos(t), y: Math.sin(t) }
    const s = Math.max(a.ri, Math.min(a.ro, dot(v, u)))
    const q = { x: a.c.x + u.x * s, y: a.c.y + u.y * s }
    const e = sub(p, q), l = len(e)
    return { d: l, n: l > 1e-12 ? { x: e.x / l, y: e.y / l } : radial }
  }
  if (fullTurn(a) || rel <= a.sw) {
    if (rho < a.ri) return { d: a.ri - rho, n: { x: -radial.x, y: -radial.y } }
    if (rho > a.ro) return { d: rho - a.ro, n: radial }
    // Inside the band: the nearest way out
    const opts = [{ d: -(rho - a.ri), n: { x: -radial.x, y: -radial.y } }, { d: -(a.ro - rho), n: radial }]
    if (!fullTurn(a)) {
      const t0 = { x: -Math.sin(a.a0), y: Math.cos(a.a0) }, t1 = { x: Math.sin(a.a0 + a.sw), y: -Math.cos(a.a0 + a.sw) }
      opts.push({ d: -rho * Math.sin(rel), n: { x: -t0.x, y: -t0.y } }, { d: -rho * Math.sin(a.sw - rel), n: { x: -t1.x, y: -t1.y } })
    }
    return opts.reduce((m, o) => (o.d > m.d ? o : m))
  }
  const e0 = segDist(a.a0), e1 = segDist(a.a0 + a.sw)
  return e0.d < e1.d ? e0 : e1
}

/** A circle that bounds a piece. */
export function bound(p: Piece): { c: V; r: number } {
  if (p.k === 'circle') return { c: p.c, r: p.r }
  if (p.k === 'arc') return { c: p.c, r: p.ro }
  const c = { x: p.p.reduce((s, v) => s + v.x, 0) / p.p.length, y: p.p.reduce((s, v) => s + v.y, 0) / p.p.length }
  return { c, r: Math.max(...p.p.map(v => len(sub(v, c)))) }
}

// ---- overlap of two pieces (push the second along n by depth) ----

/**
 * Separating axes: on each axis the two ways to push B out of A (along +n by a1 − b0, along −n by b1 − a0); the
 * smallest wins, an upward push on a tie (bodies sunk into the ground come out on top).
 */
function satBest(list: V[], projA: (n: V) => [number, number], projB: (n: V) => [number, number]): Sep | null {
  let best: Sep | null = null
  for (const n of list) {
    const [a0, a1] = projA(n), [b0, b1] = projB(n)
    const up = a1 - b0, down = b1 - a0
    if (up <= 0 || down <= 0) return null
    for (const c of [{ depth: up, n }, { depth: down, n: { x: -n.x, y: -n.y } }]) {
      if (!best || c.depth < best.depth - 1e-9 || (c.depth <= best.depth + 1e-9 && c.n.y > best.n.y + 1e-9)) best = c
    }
  }
  return best
}

function polyPoly(A: V[], B: V[]): Sep | null {
  return satBest([...axes(A), ...axes(B)], n => project(A, n), n => project(B, n))
}

function polyCircle(A: V[], c: V, r: number): Sep | null {
  let near = A[0]
  for (const v of A) if (len(sub(v, c)) < len(sub(near, c))) near = v
  const toC = sub(c, near), l = len(toC)
  const list = [...axes(A), ...(l > 1e-12 ? [{ x: toC.x / l, y: toC.y / l }] : [])]
  return satBest(list, n => project(A, n), n => { const cc = dot(c, n); return [cc - r, cc + r] })
}

function circleCircle(a: V, ra: number, b: V, rb: number): Sep | null {
  const d = sub(b, a), l = len(d), depth = ra + rb - l
  if (depth <= 0) return null
  return { depth, n: l > 1e-12 ? { x: d.x / l, y: d.y / l } : { x: 0, y: 1 } }
}

/** An arc against a convex polygon: polygon corners inside the band and band points inside the polygon (push the polygon). */
function arcPoly(a: Arc, P: V[]): Sep | null {
  let best: Sep | null = null
  for (const v of P) { const s = sectorDistance(a, v); if (s.d < 0 && (!best || -s.d > best.depth)) best = { depth: -s.d, n: s.n } }
  for (const q of arcPoints(a)) { const s = polyDistance(P, q); if (s.d < 0 && (!best || -s.d > best.depth)) best = { depth: -s.d, n: { x: -s.n.x, y: -s.n.y } } }
  return best
}

function arcCircle(a: Arc, c: V, r: number): Sep | null {
  const s = sectorDistance(a, c)
  const depth = r - s.d
  return depth > 0 ? { depth, n: s.n } : null
}

/** How far the second piece overlaps the first and which way out is shortest (null: no overlap). */
export function separate(A: Piece, B: Piece): Sep | null {
  const flip = (s: Sep | null): Sep | null => (s ? { depth: s.depth, n: { x: -s.n.x, y: -s.n.y } } : null)
  if (A.k === 'poly' && B.k === 'poly') return polyPoly(A.p, B.p)
  if (A.k === 'poly' && B.k === 'circle') return polyCircle(A.p, B.c, B.r)
  if (A.k === 'circle' && B.k === 'poly') return flip(polyCircle(B.p, A.c, A.r))
  if (A.k === 'circle' && B.k === 'circle') return circleCircle(A.c, A.r, B.c, B.r)
  if (A.k === 'arc' && B.k === 'circle') return arcCircle(A, B.c, B.r)
  if (A.k === 'circle' && B.k === 'arc') return flip(arcCircle(B, A.c, A.r))
  if (A.k === 'arc' && B.k === 'poly') return arcPoly(A, B.p)
  if (A.k === 'poly' && B.k === 'arc') return flip(arcPoly(B, A.p))
  // Arc against arc: thin quads of both would be costly; arcs rarely start inside each other
  return null
}

// ---- gap of two pieces (apart or overlapping) ----

/** Closest point of segment ab to p. */
export function closestOnSegment(p: V, a: V, b: V): V {
  const e = sub(b, a), ee = dot(e, e)
  const t = ee > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), e) / ee)) : 0
  return { x: a.x + e.x * t, y: a.y + e.y * t }
}

/** Closest point on the boundary of a polygon loop to p. */
export function closestOnLoop(P: V[], p: V): { q: V; d: number } {
  let best = { q: P[0], d: Infinity }
  for (let i = 0; i < P.length; i++) {
    const q = closestOnSegment(p, P[i], P[(i + 1) % P.length]), d = len(sub(p, q))
    if (d < best.d) best = { q, d }
  }
  return best
}

/**
 * Nearest boundary point of a polygon loop to p and the unit direction from it to p. Inside an edge the direction is
 * the edge's normal itself (exact for horizontal and vertical edges: a block snapped onto the ground keeps its x).
 */
export function nearestOnLoop(P: V[], p: V): { q: V; d: number; n: V } {
  let best = { q: P[0], d: Infinity, n: { x: 0, y: 1 } }
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], e = sub(b, a), ee = dot(e, e)
    const t = ee > 0 ? dot(sub(p, a), e) / ee : 0
    if (t > 0 && t < 1) {
      const l = Math.sqrt(ee), ne = { x: e.y / l, y: -e.x / l }, s = dot(sub(p, a), ne)
      if (Math.abs(s) < best.d) best = { q: { x: p.x - ne.x * s, y: p.y - ne.y * s }, d: Math.abs(s), n: s >= 0 ? ne : neg(ne) }
    } else {
      const q = t <= 0 ? a : b, d = len(sub(p, q))
      if (d < best.d) best = { q, d, n: unit(sub(p, q)) }
    }
  }
  return best
}

/** Distance between two separate convex polygons: closest points on each. */
function polyPolyApart(A: V[], B: V[]): Gap {
  let best: Gap = { d: Infinity, n: { x: 0, y: 1 }, at: A[0] }
  for (const v of B) { const c = nearestOnLoop(A, v); if (c.d < best.d) best = { d: c.d, n: c.n, at: c.q } }
  for (const v of A) { const c = nearestOnLoop(B, v); if (c.d < best.d) best = { d: c.d, n: neg(c.n), at: v } }
  return best
}

/** An arc band (first) against a separate convex polygon (second): the polygon's escape direction. */
function arcPolyApart(a: Arc, P: V[]): Gap {
  let best: Gap = { d: Infinity, n: { x: 0, y: 1 }, at: a.c }
  // Polygon corners against the band (inner side, outer side, end faces)
  for (const v of P) {
    const s = sectorDistance(a, v)
    // The shapes are apart (no overlap was found): a corner "inside" is a rounding artefact on the boundary
    if (s.d < -1e-9) continue
    if (s.d < best.d) best = { d: Math.max(0, s.d), n: s.n, at: { x: v.x - s.n.x * s.d, y: v.y - s.n.y * s.d } }
  }
  for (let i = 0; i < P.length; i++) {
    const p0 = P[i], p1 = P[(i + 1) % P.length]
    // Polygon edges against the outer (convex) side
    const q = closestOnSegment(a.c, p0, p1), rho = len(sub(q, a.c))
    // (an edge just touching the outer circle counts: rho = ro up to rounding)
    if (rho > a.ro - 1e-9 && inSpan(a, q)) { const n = unit(sub(q, a.c)); if (rho - a.ro < best.d) best = { d: Math.max(0, rho - a.ro), n, at: { x: a.c.x + n.x * a.ro, y: a.c.y + n.y * a.ro } } }
    // Polygon edges against the band's corners
    for (const k of arcCorners(a)) { const e = closestOnSegment(k, p0, p1), d = len(sub(e, k)); if (d < best.d) best = { d, n: unit(sub(e, k)), at: k } }
  }
  return best
}

/** Signed gap of piece M from piece F (null: arcs against arcs, which are not compared). */
export function gap(F: Piece, M: Piece): Gap | null {
  const s = separate(F, M)
  if (s) {
    // Overlap: meeting point near the centre of M on F's side (only used for guides)
    const bm = bound(M).c
    return { d: -s.depth, n: s.n, at: { x: bm.x - s.n.x * s.depth, y: bm.y - s.n.y * s.depth } }
  }
  if (F.k === 'poly' && M.k === 'poly') return polyPolyApart(F.p, M.p)
  if (F.k === 'poly' && M.k === 'circle') { const c = nearestOnLoop(F.p, M.c); return { d: c.d - M.r, n: c.n, at: c.q } }
  if (F.k === 'circle' && M.k === 'poly') { const c = nearestOnLoop(M.p, F.c), n = neg(c.n); return { d: c.d - F.r, n, at: { x: F.c.x + n.x * F.r, y: F.c.y + n.y * F.r } } }
  if (F.k === 'circle' && M.k === 'circle') { const n = unit(sub(M.c, F.c)); return { d: len(sub(M.c, F.c)) - F.r - M.r, n, at: { x: F.c.x + n.x * F.r, y: F.c.y + n.y * F.r } } }
  if (F.k === 'arc' && M.k === 'circle') { const t = sectorDistance(F, M.c); return { d: t.d - M.r, n: t.n, at: { x: M.c.x - t.n.x * t.d, y: M.c.y - t.n.y * t.d } } }
  if (F.k === 'circle' && M.k === 'arc') { const t = sectorDistance(M, F.c); return { d: t.d - F.r, n: neg(t.n), at: { x: F.c.x - t.n.x * F.r, y: F.c.y - t.n.y * F.r } } }
  if (F.k === 'arc' && M.k === 'poly') return arcPolyApart(F, M.p)
  if (F.k === 'poly' && M.k === 'arc') { const g = arcPolyApart(M, F.p); return { d: g.d, n: neg(g.n), at: { x: g.at.x + g.n.x * g.d, y: g.at.y + g.n.y * g.d } } }
  return null
}

/** Signed gap of a body's pieces M from another's F: the deepest overlap, else the nearest distance (within `reach`). */
export function bodyGap(F: Piece[], M: Piece[], reach = Infinity): Gap | null {
  let best: Gap | null = null
  const bm = M.map(bound)
  for (const f of F) {
    const bf = bound(f)
    M.forEach((m, j) => {
      if (len(sub(bf.c, bm[j].c)) - bf.r - bm[j].r > reach) return
      const g = gap(f, m)
      if (g && (!best || g.d < best.d)) best = g
    })
  }
  return best
}

/**
 * How far piece M must move along unit n (≥ 0) to leave piece F's span on that axis — the push that keeps a held
 * contact's direction while the body is pushed into a flat face. Null for arcs (their surfaces curve: use the gap).
 */
export function pushAlong(F: Piece, M: Piece, n: V): number | null {
  const proj = (p: Piece): [number, number] | null => p.k === 'poly' ? project(p.p, n) : p.k === 'circle' ? [dot(p.c, n) - p.r, dot(p.c, n) + p.r] : null
  const f = proj(F), m = proj(M)
  if (!f || !m) return null
  return Math.max(0, f[1] - m[0])
}

/** Corner points of pieces along a direction (for alignment): polygon corners, circle centres, arc corners. */
export function cornersOf(ps: Piece[]): V[] {
  const out: V[] = []
  for (const p of ps) {
    if (p.k === 'poly') out.push(...p.p)
    else if (p.k === 'circle') out.push(p.c)
    else out.push(...arcCorners(p))
  }
  return out
}

/** Axis-aligned bounds of pieces. */
export function piecesBounds(ps: Piece[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const grow = (x: number, y: number) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
  for (const p of ps) {
    if (p.k === 'poly') for (const v of p.p) grow(v.x, v.y)
    else if (p.k === 'circle') { grow(p.c.x - p.r, p.c.y - p.r); grow(p.c.x + p.r, p.c.y + p.r) }
    else {
      for (const v of arcCorners(p)) grow(v.x, v.y)
      // The band's extreme points where its outer circle crosses the axes within the span
      for (const t of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI]) {
        const q = { x: p.c.x + Math.cos(t) * p.ro, y: p.c.y + Math.sin(t) * p.ro }
        if (inSpan(p, q)) grow(q.x, q.y)
      }
    }
  }
  return { minX, minY, maxX, maxY }
}
