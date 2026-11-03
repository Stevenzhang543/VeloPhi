/**
 * Bodies that overlap at the start (26.59 fix 3, D200). Two bodies overlap when their shapes share area deeper than
 * `min` (default 0.1 mm) — found with separating axes on the convex pieces of each shape (circles, convex polygons,
 * triangles of concave polygons, the parts of compound shapes), exactly for a circle against an arc track, and for an
 * arc against a polygon by the polygon's corners in the arc and points of the arc's outline in the polygon. This sees what the solver's vertex probes miss: two equal boxes
 * standing side by side and pushed into each other have no corner inside the other.
 *
 * The push apart moves the moving bodies along the shortest way (the minimum translation, shared by inverse mass;
 * fixed bodies stay), pair by pair, until nothing overlaps; overlaps it cannot remove are reported as `remaining`.
 * Without this check the solver pushes shallow overlaps apart in one jump at t = 0 and cannot handle deep ones — bodies
 * seem to teleport.
 */
import type { BodyDef, Scene } from '../core/scene/types'
import { calc } from './core'
import type { ArcPiece, ShapePiece } from './model'

export interface OverlapPair { a: string; b: string; depth: number }
export interface OverlapMove { id: string; x: number; y: number; angle: number; dx: number; dy: number }
export interface OverlapReport { pairs: OverlapPair[]; moved: OverlapMove[]; remaining: OverlapPair[] }

/** Smallest overlap that counts (m): touching bodies and rounding stay quiet. */
export const OVERLAP_MIN = 1e-4

type V = { x: number; y: number }
type Piece = { k: 'poly'; p: V[] } | { k: 'circle'; c: V; r: number } | { k: 'arc'; c: V; ri: number; ro: number; a0: number; sw: number }
/** A separation: push the second shape by `n · depth` (unit n) to separate. */
type Sep = { depth: number; n: V }

const dot = (a: V, b: V) => a.x * b.x + a.y * b.y
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y })
const len = (a: V) => Math.hypot(a.x, a.y)

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

function piecesOf(b: BodyDef): Piece[] {
  const outline = calc<{ outline: Array<ShapePiece | ArcPiece> }>({ op: 'shapeOutline', shape: b.shape, dynamic: b.kind !== 'static' }).outline
  const c = Math.cos(b.angle), s = Math.sin(b.angle)
  const w = (v: V): V => ({ x: b.position.x + c * v.x - s * v.y, y: b.position.y + s * v.x + c * v.y })
  const out: Piece[] = []
  for (const p of outline) {
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

/** Points on the boundary of an arc (inner and outer circle and end faces), at most a few millimetres apart. */
function arcPoints(a: Extract<Piece, { k: 'arc' }>): V[] {
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

/** Signed distance of a point to a convex polygon (negative inside) and the outward normal of the nearest face. */
function polyDistance(P: V[], q: V): { d: number; n: V } {
  let best = { d: -Infinity, n: { x: 0, y: 1 } }
  for (const [i, n] of axes(P).entries()) { const d = dot(sub(q, P[i]), n); if (d > best.d) best = { d, n } }
  return best
}

/** An arc against a convex polygon: polygon corners inside the band and band points inside the polygon (push the polygon). */
function arcPoly(a: Extract<Piece, { k: 'arc' }>, P: V[]): Sep | null {
  let best: Sep | null = null
  for (const v of P) { const s = sectorDistance(a, v); if (s.d < 0 && (!best || -s.d > best.depth)) best = { depth: -s.d, n: s.n } }
  for (const q of arcPoints(a)) { const s = polyDistance(P, q); if (s.d < 0 && (!best || -s.d > best.depth)) best = { depth: -s.d, n: { x: -s.n.x, y: -s.n.y } } }
  return best
}

function bound(p: Piece): { c: V; r: number } {
  if (p.k === 'circle') return { c: p.c, r: p.r }
  if (p.k === 'arc') return { c: p.c, r: p.ro }
  const c = { x: p.p.reduce((s, v) => s + v.x, 0) / p.p.length, y: p.p.reduce((s, v) => s + v.y, 0) / p.p.length }
  return { c, r: Math.max(...p.p.map(v => len(sub(v, c)))) }
}

// ---- separation of two convex pieces (push the second along n by depth) ----

function project(p: V[], n: V): [number, number] {
  let lo = Infinity, hi = -Infinity
  for (const v of p) { const d = dot(v, n); if (d < lo) lo = d; if (d > hi) hi = d }
  return [lo, hi]
}

function axes(p: V[]): V[] {
  return p.map((a, i) => { const b = p[(i + 1) % p.length], e = sub(b, a), l = len(e) || 1; return { x: e.y / l, y: -e.x / l } })
}

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

/** Signed distance from a point to an annular sector and the outward direction at the closest point. */
function sectorDistance(a: Extract<Piece, { k: 'arc' }>, p: V): { d: number; n: V } {
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
  if (a.sw >= 2 * Math.PI - 1e-9 || rel <= a.sw) {
    if (rho < a.ri) return { d: a.ri - rho, n: { x: -radial.x, y: -radial.y } }
    if (rho > a.ro) return { d: rho - a.ro, n: radial }
    // Inside the band: the nearest way out
    const opts = [{ d: -(rho - a.ri), n: { x: -radial.x, y: -radial.y } }, { d: -(a.ro - rho), n: radial }]
    if (a.sw < 2 * Math.PI - 1e-9) {
      const t0 = { x: -Math.sin(a.a0), y: Math.cos(a.a0) }, t1 = { x: Math.sin(a.a0 + a.sw), y: -Math.cos(a.a0 + a.sw) }
      opts.push({ d: -rho * Math.sin(rel), n: { x: -t0.x, y: -t0.y } }, { d: -rho * Math.sin(a.sw - rel), n: { x: -t1.x, y: -t1.y } })
    }
    return opts.reduce((m, o) => (o.d > m.d ? o : m))
  }
  const e0 = segDist(a.a0), e1 = segDist(a.a0 + a.sw)
  return e0.d < e1.d ? e0 : e1
}

function arcCircle(a: Extract<Piece, { k: 'arc' }>, c: V, r: number): Sep | null {
  const s = sectorDistance(a, c)
  const depth = r - s.d
  return depth > 0 ? { depth, n: s.n } : null
}

function separate(A: Piece, B: Piece): Sep | null {
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

// ---- bodies ----

interface Item { body: BodyDef; pieces: Piece[]; bounds: Array<{ c: V; r: number }> }

function itemOf(b: BodyDef): Item {
  const pieces = piecesOf(b)
  return { body: b, pieces, bounds: pieces.map(bound) }
}

/** The deepest separation of two bodies (push the second), or null. */
function bodySep(x: Item, y: Item): Sep | null {
  let best: Sep | null = null
  x.pieces.forEach((pa, i) => y.pieces.forEach((pb, j) => {
    const ba = x.bounds[i], bb = y.bounds[j]
    if (len(sub(ba.c, bb.c)) > ba.r + bb.r) return
    const s = separate(pa, pb)
    if (s && (!best || s.depth > best.depth)) best = s
  }))
  return best
}

/** Pairs that never collide: bodies welded or driven by a motor together (as in the core). */
function noCollide(scene: Scene): Set<string> {
  const out = new Set<string>()
  for (const c of scene.connectors) {
    if ((c.type === 'weld' || c.type === 'motor') && c.a.body && c.b.body) out.add([c.a.body, c.b.body].sort().join('|'))
  }
  return out
}

function overlapsOf(items: Item[], skip: Set<string>, min: number): Array<{ i: number; j: number; s: Sep }> {
  const out: Array<{ i: number; j: number; s: Sep }> = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i].body, b = items[j].body
      if (a.kind === 'static' && b.kind === 'static') continue
      if (skip.has([a.id, b.id].sort().join('|'))) continue
      const s = bodySep(items[i], items[j])
      if (s && s.depth > min) out.push({ i, j, s })
    }
  }
  return out
}

/**
 * The overlaps of a scene at its start and the push apart; null when the check does not apply (the many-body solver,
 * where piles settle by design; branches, which continue a computed state) or the shapes cannot be read.
 */
export function findOverlaps(scene: Scene, min = OVERLAP_MIN): OverlapReport | null {
  if (scene.settings.integrator === 'softstep' || (scene.settings.startTime ?? 0) > 0) return null
  if (!scene.bodies.some(b => b.kind !== 'static')) return null
  let items: Item[]
  try { items = scene.bodies.map(itemOf) } catch { return null }
  const skip = noCollide(scene)
  const first = overlapsOf(items, skip, min)
  const pair = (o: { i: number; j: number; s: Sep }): OverlapPair => ({ a: items[o.i].body.id, b: items[o.j].body.id, depth: o.s.depth })
  if (!first.length) return { pairs: [], moved: [], remaining: [] }
  // Push apart on copies, pair by pair, until nothing overlaps (or 80 rounds)
  const start = new Map(scene.bodies.map(b => [b.id, { ...b.position }]))
  const work = items.map(it => ({ ...it, body: { ...it.body, position: { ...it.body.position } } }))
  const inv = (b: BodyDef) => (b.kind === 'static' ? 0 : 1 / Math.max(1e-9, b.mass))
  let left = first
  for (let round = 0; round < 80 && left.length; round++) {
    for (const o of left) {
      const a = work[o.i], b = work[o.j]
      const s = bodySep(a, b)
      if (!s || s.depth <= min / 10) continue
      const wa = inv(a.body), wb = inv(b.body), w = wa + wb
      if (!(w > 0)) continue
      // A little more than the depth: the bodies end just touching, not still overlapping by rounding
      const d = s.depth + 1e-9
      a.body.position = { x: a.body.position.x - s.n.x * d * (wa / w), y: a.body.position.y - s.n.y * d * (wa / w) }
      b.body.position = { x: b.body.position.x + s.n.x * d * (wb / w), y: b.body.position.y + s.n.y * d * (wb / w) }
      Object.assign(a, itemOf(a.body))
      Object.assign(b, itemOf(b.body))
    }
    left = overlapsOf(work, skip, min)
  }
  const moved: OverlapMove[] = []
  for (const it of work) {
    const p0 = start.get(it.body.id)!
    const dx = it.body.position.x - p0.x, dy = it.body.position.y - p0.y
    if (Math.hypot(dx, dy) > 1e-12) moved.push({ id: it.body.id, x: it.body.position.x, y: it.body.position.y, angle: it.body.angle, dx, dy })
  }
  return { pairs: first.map(pair), moved, remaining: left.map(pair) }
}

/** Move the bodies as the push apart says (the scene is changed in place). */
export function pushApart(scene: Scene, r: OverlapReport) {
  for (const m of r.moved) {
    const b = scene.bodies.find(x => x.id === m.id)
    if (!b || b.kind === 'static') continue
    b.position = { x: m.x, y: m.y }
    b.angle = m.angle
  }
}
