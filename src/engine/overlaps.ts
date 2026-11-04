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
import { bound, len, piecesOf, separate, sub } from './pieces'
import type { Piece, Sep, V } from './pieces'

export interface OverlapPair { a: string; b: string; depth: number }
export interface OverlapMove { id: string; x: number; y: number; angle: number; dx: number; dy: number }
export interface OverlapReport { pairs: OverlapPair[]; moved: OverlapMove[]; remaining: OverlapPair[] }

/** Smallest overlap that counts (m): touching bodies and rounding stay quiet. */
export const OVERLAP_MIN = 1e-4

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
