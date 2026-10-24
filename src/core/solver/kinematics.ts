/**
 * Kinematics of bodies, contact features and connectors at a given state.
 *
 * Every constraint the solver uses is written as a scalar function g(q) of the generalized coordinates
 * (x, y, θ per dynamic body). For each we compute, analytically:
 *   g        the value (gap, length error …),
 *   J        its gradient (one row of the Jacobian; ġ = J·v),
 *   c        the velocity-product term, so that g̈ = J·a + c.
 * Contacts are made of two kinds of body-fixed features: a point (with a radius: circle centre or polygon
 * vertex) against a face, and a point against a point. The friction row uses the relative tangential
 * velocity at the contact point, differentiated the same way. These expressions are checked against
 * numerical differentiation in the tests.
 */
import type { Vec2 } from '../math/vec'
import { atan2 as atan2Det, cos, sin } from '../math/dmath'
import type { AnchorModel, BodyModel, Model, RopeModel } from './model'

export interface Pose { x: number; y: number; c: number; s: number; vx: number; vy: number; w: number }

/** Poses of all bodies (global index) for state X = [q(3n), v(3n), …]. */
export function computePoses(model: Model, X: Float64Array): Pose[] {
  const n = model.n
  return model.bodies.map(b => {
    if (b.index < 0) {
      return { x: b.staticPos.x, y: b.staticPos.y, c: cos(b.staticAngle), s: sin(b.staticAngle), vx: 0, vy: 0, w: 0 }
    }
    const i = b.index
    const th = X[3 * i + 2]
    return { x: X[3 * i], y: X[3 * i + 1], c: cos(th), s: sin(th), vx: X[3 * n + 3 * i], vy: X[3 * n + 3 * i + 1], w: X[3 * n + 3 * i + 2] }
  })
}

/** A row of the Jacobian with at most two bodies (dynamic index or −1). */
export interface RowJ { ai: number; ax: number; ay: number; aw: number; bi: number; bx: number; by: number; bw: number }

export const emptyRow = (): RowJ => ({ ai: -1, ax: 0, ay: 0, aw: 0, bi: -1, bx: 0, by: 0, bw: 0 })

export interface PointState {
  /** World position. */ px: number; py: number
  /** Offset from the body origin (centre of mass). */ rx: number; ry: number
  /** Velocity of the material point. */ vx: number; vy: number
  /** Velocity-product part of its acceleration: −ω²r. */ qx: number; qy: number
}

export function pointState(pose: Pose, local: Vec2): PointState {
  const rx = pose.c * local.x - pose.s * local.y
  const ry = pose.s * local.x + pose.c * local.y
  const w = pose.w
  return { px: pose.x + rx, py: pose.y + ry, rx, ry, vx: pose.vx - w * ry, vy: pose.vy + w * rx, qx: -w * w * rx, qy: -w * w * ry }
}

/** Anchor point: on a body, or fixed in the world (body null: local is the world point). */
export function anchorState(poses: Pose[], anchor: AnchorModel): PointState {
  if (!anchor.body) return { px: anchor.local.x, py: anchor.local.y, rx: 0, ry: 0, vx: 0, vy: 0, qx: 0, qy: 0 }
  return pointState(poses[anchor.body.global], anchor.local)
}

// ---------------------------------------------------------------------------------------------- features
export interface PointFeature { body: BodyModel; local: Vec2; radius: number; /** polygon vertex index, −1 for a circle centre */ vertex: number }
export interface FaceFeature { body: BodyModel; face: number; e0: Vec2; e1: Vec2; normal: Vec2; len: number }
export type ContactFeature =
  | { kind: 'pf'; key: string; A: PointFeature; B: FaceFeature }
  | { kind: 'pp'; key: string; A: PointFeature; B: PointFeature; cone: null | { n1: Vec2; n2: Vec2 } }

export interface ContactKin {
  gap: number
  /** Normal from B to A, tangent t = perp(n). */
  nx: number; ny: number; tx: number; ty: number
  /** Contact point (on A's surface). */
  cx: number; cy: number
  vn: number
  /** Relative tangential velocity of A against B (surface speed of a conveyor B included). */
  vt: number
  jn: RowJ; cn: number
  jt: RowJ; ct: number
  /** Feature validity: position along the face (pf), or the two cone margins (pp at a vertex); ≥ 0 inside. */
  m1: number; m2: number
}

function fill(row: RowJ, A: BodyModel, ax: number, ay: number, aw: number, B: BodyModel, bx: number, by: number, bw: number): RowJ {
  row.ai = A.index; row.ax = ax; row.ay = ay; row.aw = aw
  row.bi = B.index; row.bx = bx; row.by = by; row.bw = bw
  return row
}

export function contactKin(f: ContactFeature, poses: Pose[]): ContactKin {
  const A = f.A.body, PA = poses[A.global]
  const pa = pointState(PA, f.A.local)
  const radA = f.A.radius
  const wA = PA.w
  if (f.kind === 'pf') {
    const B = f.B.body, PB = poses[B.global]
    const p0 = pointState(PB, f.B.e0)
    const nx = PB.c * f.B.normal.x - PB.s * f.B.normal.y
    const ny = PB.s * f.B.normal.x + PB.c * f.B.normal.y
    const tx = -ny, ty = nx
    const wB = PB.w
    const Wx = pa.px - p0.px, Wy = pa.py - p0.py
    const dWx = pa.vx - p0.vx, dWy = pa.vy - p0.vy
    const gap = nx * Wx + ny * Wy - radA
    const tW = tx * Wx + ty * Wy // perp(n)·w
    const vn = wB * tW + nx * dWx + ny * dWy
    // n·perp(r) = n.y·r.x − n.x·r.y
    const nPerpRA = ny * pa.rx - nx * pa.ry
    const nPerpR0 = ny * p0.rx - nx * p0.ry
    const jn = fill(emptyRow(), A, nx, ny, nPerpRA, B, -nx, -ny, tW - nPerpR0)
    const cn = -wB * wB * (nx * Wx + ny * Wy) + 2 * wB * (tx * dWx + ty * dWy) + nx * (pa.qx - p0.qx) + ny * (pa.qy - p0.qy)
    // contact point and tangential kinematics
    const cx = pa.px - radA * nx, cy = pa.py - radA * ny
    const rhoAx = cx - PA.x, rhoAy = cy - PA.y
    const rhoBx = cx - PB.x, rhoBy = cy - PB.y
    const vAx = PA.vx - wA * rhoAy, vAy = PA.vy + wA * rhoAx
    const vBx = PB.vx - wB * rhoBy, vBy = PB.vy + wB * rhoBx
    const Dx = vAx - vBx, Dy = vAy - vBy
    const vt = tx * Dx + ty * Dy + B.beltSpeed
    // t·perp(ρ) = t.y·ρ.x − t.x·ρ.y
    const jt = fill(emptyRow(), A, tx, ty, ty * rhoAx - tx * rhoAy, B, -tx, -ty, -(ty * rhoBx - tx * rhoBy))
    const cdx = pa.vx - radA * wB * tx, cdy = pa.vy - radA * wB * ty
    const rdAx = cdx - PA.vx, rdAy = cdy - PA.vy
    const rdBx = cdx - PB.vx, rdBy = cdy - PB.vy
    // t·(ωA perp(ρ̇A) − ωB perp(ρ̇B))
    const ct = -wB * (nx * Dx + ny * Dy) + wA * (ty * rdAx - tx * rdAy) - wB * (ty * rdBx - tx * rdBy)
    const s = tx * Wx + ty * Wy
    return { gap, nx, ny, tx, ty, cx, cy, vn, vt, jn, cn, jt, ct, m1: s, m2: f.B.len - s }
  }
  // point–point
  const B = f.B.body, PB = poses[B.global]
  const pb = pointState(PB, f.B.local)
  const radB = f.B.radius
  const wB = PB.w
  const dx = pa.px - pb.px, dy = pa.py - pb.py
  const dist = Math.sqrt(dx * dx + dy * dy)
  const nx = dist > 0 ? dx / dist : 0, ny = dist > 0 ? dy / dist : 1
  const tx = -ny, ty = nx
  const gap = dist - radA - radB
  const dvx = pa.vx - pb.vx, dvy = pa.vy - pb.vy
  const vn = nx * dvx + ny * dvy
  const jn = fill(emptyRow(), A, nx, ny, ny * pa.rx - nx * pa.ry, B, -nx, -ny, -(ny * pb.rx - nx * pb.ry))
  const perpSq = dvx * dvx + dvy * dvy - vn * vn
  const cn = nx * (pa.qx - pb.qx) + ny * (pa.qy - pb.qy) + (dist > 0 ? perpSq / dist : 0)
  const cx = pa.px - radA * nx, cy = pa.py - radA * ny
  const rhoAx = cx - PA.x, rhoAy = cy - PA.y
  const rhoBx = cx - PB.x, rhoBy = cy - PB.y
  const vAx = PA.vx - wA * rhoAy, vAy = PA.vy + wA * rhoAx
  const vBx = PB.vx - wB * rhoBy, vBy = PB.vy + wB * rhoBx
  const Dx = vAx - vBx, Dy = vAy - vBy
  const vt = tx * Dx + ty * Dy
  const jt = fill(emptyRow(), A, tx, ty, ty * rhoAx - tx * rhoAy, B, -tx, -ty, -(ty * rhoBx - tx * rhoBy))
  const ndx = dist > 0 ? (dvx - vn * nx) / dist : 0, ndy = dist > 0 ? (dvy - vn * ny) / dist : 0
  const tdx = -ndy, tdy = ndx
  const cdx = pa.vx - radA * ndx, cdy = pa.vy - radA * ndy
  const rdAx = cdx - PA.vx, rdAy = cdy - PA.vy
  const rdBx = cdx - PB.vx, rdBy = cdy - PB.vy
  const ct = tdx * Dx + tdy * Dy + wA * (ty * rdAx - tx * rdAy) - wB * (ty * rdBx - tx * rdBy)
  let m1 = 1, m2 = 1
  if (f.cone) {
    const n1x = PB.c * f.cone.n1.x - PB.s * f.cone.n1.y, n1y = PB.s * f.cone.n1.x + PB.c * f.cone.n1.y
    const n2x = PB.c * f.cone.n2.x - PB.s * f.cone.n2.y, n2y = PB.s * f.cone.n2.x + PB.c * f.cone.n2.y
    m1 = n1x * ny - n1y * nx // cross(n1, n)
    m2 = nx * n2y - ny * n2x // cross(n, n2)
  }
  return { gap, nx, ny, tx, ty, cx, cy, vn, vt, jn, cn, jt, ct, m1, m2 }
}

/** All contact features between two bodies (the point side is always A; circles are always points). */
export function pairFeatures(X: BodyModel, Y: BodyModel): ContactFeature[] {
  const out: ContactFeature[] = []
  const sx = X.shape, sy = Y.shape
  const pf = (A: BodyModel, vi: number, local: Vec2, radius: number, B: BodyModel) => {
    if (B.shape.kind !== 'polygon') return
    const verts = B.shape.verts
    for (let f = 0; f < verts.length; f++) {
      out.push({
        kind: 'pf', key: `${A.id}#${vi < 0 ? 'c' : 'v' + vi}>${B.id}#f${f}`,
        A: { body: A, local, radius, vertex: vi },
        B: { body: B, face: f, e0: verts[f], e1: verts[(f + 1) % verts.length], normal: B.shape.normals[f], len: B.shape.lengths[f] }
      })
    }
  }
  const pv = (A: BodyModel, local: Vec2, radius: number, B: BodyModel) => {
    if (B.shape.kind !== 'polygon') return
    const verts = B.shape.verts, m = verts.length
    for (let v = 0; v < m; v++) {
      out.push({
        kind: 'pp', key: `${A.id}#c>${B.id}#v${v}`,
        A: { body: A, local, radius, vertex: -1 }, B: { body: B, local: verts[v], radius: 0, vertex: v },
        cone: { n1: B.shape.normals[(v + m - 1) % m], n2: B.shape.normals[v] }
      })
    }
  }
  if (sx.kind === 'circle' && sy.kind === 'circle') {
    out.push({ kind: 'pp', key: `${X.id}#c>${Y.id}#c`, A: { body: X, local: { x: 0, y: 0 }, radius: sx.radius, vertex: -1 }, B: { body: Y, local: { x: 0, y: 0 }, radius: sy.radius, vertex: -1 }, cone: null })
  } else if (sx.kind === 'circle') {
    pf(X, -1, { x: 0, y: 0 }, sx.radius, Y); pv(X, { x: 0, y: 0 }, sx.radius, Y)
  } else if (sy.kind === 'circle') {
    pf(Y, -1, { x: 0, y: 0 }, sy.radius, X); pv(Y, { x: 0, y: 0 }, sy.radius, X)
  } else {
    sx.verts.forEach((v, i) => pf(X, i, v, 0, Y))
    sy.verts.forEach((v, i) => pf(Y, i, v, 0, X))
  }
  return out
}

// ---------------------------------------------------------------------------------------------- connectors
export interface ConstraintKin { value: number; vel: number; j: RowJ; c: number }

function anchorRow(row: RowJ, side: 'a' | 'b', anchor: AnchorModel, gx: number, gy: number, p: PointState) {
  if (!anchor.body || anchor.body.index < 0) return
  // generalized force of a unit force (gx, gy) at the point: (gx, gy, r × g)
  const w = p.rx * gy - p.ry * gx
  if (side === 'a') { row.ai = anchor.body.index; row.ax = gx; row.ay = gy; row.aw = w } else { row.bi = anchor.body.index; row.bx = gx; row.by = gy; row.bw = w }
}

/** Distance between two anchors (rods, and ropes without pulleys): value = |PA − PB|. */
export function distanceKin(poses: Pose[], a: AnchorModel, b: AnchorModel): ConstraintKin & { ux: number; uy: number } {
  const pa = anchorState(poses, a), pb = anchorState(poses, b)
  const dx = pa.px - pb.px, dy = pa.py - pb.py
  const d = Math.sqrt(dx * dx + dy * dy)
  const ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : 0
  const dvx = pa.vx - pb.vx, dvy = pa.vy - pb.vy
  const vel = ux * dvx + uy * dvy
  const row = emptyRow()
  anchorRow(row, 'a', a, ux, uy, pa)
  anchorRow(row, 'b', b, -ux, -uy, pb)
  const perpSq = dvx * dvx + dvy * dvy - vel * vel
  const c = ux * (pa.qx - pb.qx) + uy * (pa.qy - pb.qy) + (d > 0 ? perpSq / d : 0)
  return { value: d, vel, j: row, c, ux, uy }
}

/** Hinge: the two rows (x and y) of PA − PB = 0. */
export function hingeKin(poses: Pose[], a: AnchorModel, b: AnchorModel): [ConstraintKin, ConstraintKin] {
  const pa = anchorState(poses, a), pb = anchorState(poses, b)
  const rx = emptyRow(), ry = emptyRow()
  anchorRow(rx, 'a', a, 1, 0, pa); anchorRow(rx, 'b', b, -1, 0, pb)
  anchorRow(ry, 'a', a, 0, 1, pa); anchorRow(ry, 'b', b, 0, -1, pb)
  return [
    { value: pa.px - pb.px, vel: pa.vx - pb.vx, j: rx, c: pa.qx - pb.qx },
    { value: pa.py - pb.py, vel: pa.vy - pb.vy, j: ry, c: pa.qy - pb.qy }
  ]
}

export interface RopePath {
  /** Total path length (m). */
  length: number
  /** Points of the drawn rope: A, the tangent points on each pulley (in, out), B. */
  points: Vec2[]
  /** Pulley arcs for drawing: centre, radius, start and end angle, direction. */
  arcs: Array<{ x: number; y: number; r: number; from: number; to: number; wrap: 1 | -1 }>
  /** Unit vector of the first free segment (from A towards the first pulley) and of the last (towards B). */
  u1: Vec2; uLast: Vec2
  s1: number; sLast: number
}

/** Tangent line between two signed circles (point when r = 0): departure, arrival and unit direction. */
function tangent(c1: Vec2, rho1: number, c2: Vec2, rho2: number): { p1: Vec2; p2: Vec2; u: Vec2 } {
  const Dx = c2.x - c1.x, Dy = c2.y - c1.y
  const L2 = Dx * Dx + Dy * Dy, L = Math.sqrt(L2)
  const k = (rho1 - rho2) / L
  const q = Math.sqrt(Math.max(0, 1 - k * k))
  // n = k·D/|D| + σ q·perp(D)/|D|; travel direction perp(n) must point along D.
  let nx = (k * Dx + q * -Dy) / L, ny = (k * Dy + q * Dx) / L
  if (-ny * Dx + nx * Dy < 0) { nx = (k * Dx - q * -Dy) / L; ny = (k * Dy - q * Dx) / L }
  const p1 = { x: c1.x + rho1 * nx, y: c1.y + rho1 * ny }
  const p2 = { x: c2.x + rho2 * nx, y: c2.y + rho2 * ny }
  return { p1, p2, u: { x: -ny, y: nx } }
}

/** Distance between two points given as (ax − bx, ay − by) parts. */
function dist2(ax: number, bx: number, ay: number, by: number): number { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy) }

function angleOf(cx: number, cy: number, p: Vec2): number {
  return Math.atan2(p.y - cy, p.x - cx) // drawing only
}

export function ropePath(poses: Pose[], rope: RopeModel): RopePath {
  const pa = anchorState(poses, rope.a), pb = anchorState(poses, rope.b)
  const A = { x: pa.px, y: pa.py }, B = { x: pb.px, y: pb.py }
  if (rope.pulleys.length === 0) {
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.sqrt(dx * dx + dy * dy)
    const u = d > 0 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 }
    return { length: d, points: [A, B], arcs: [], u1: u, uLast: u, s1: d, sLast: d }
  }
  const circles = rope.pulleys.map(p => ({ c: p.pulley.position, rho: p.wrap * p.pulley.radius, r: p.pulley.radius, wrap: p.wrap }))
  const points: Vec2[] = [A]
  let length = 0
  const arrivals: Vec2[] = [], departures: Vec2[] = []
  const first = tangent(A, 0, circles[0].c, circles[0].rho)
  length += dist2(first.p2.x, A.x, first.p2.y, A.y)
  const u1 = first.u, s1 = length
  arrivals.push(first.p2)
  points.push(first.p2)
  for (let i = 0; i + 1 < circles.length; i++) {
    const seg = tangent(circles[i].c, circles[i].rho, circles[i + 1].c, circles[i + 1].rho)
    departures.push(seg.p1); arrivals.push(seg.p2)
    points.push(seg.p1, seg.p2)
    length += dist2(seg.p2.x, seg.p1.x, seg.p2.y, seg.p1.y)
  }
  const lastC = circles[circles.length - 1]
  const last = tangent(lastC.c, lastC.rho, B, 0)
  departures.push(last.p1)
  points.push(last.p1, B)
  const sLast = dist2(B.x, last.p1.x, B.y, last.p1.y)
  length += sLast
  const arcs: RopePath['arcs'] = []
  circles.forEach((circle, i) => {
    if (circle.r <= 0) return
    const a0 = angleOf(circle.c.x, circle.c.y, arrivals[i]), a1 = angleOf(circle.c.x, circle.c.y, departures[i])
    // arc swept in the wrap direction, using the exact geometry (dot/cross) for the length
    const ux = arrivals[i].x - circle.c.x, uy = arrivals[i].y - circle.c.y
    const vx = departures[i].x - circle.c.x, vy = departures[i].y - circle.c.y
    const cr = ux * vy - uy * vx, dt = ux * vx + uy * vy
    let sweep = atan2Det(cr, dt) // −π … π, ccw positive
    if (circle.wrap > 0 && sweep < 0) sweep += 2 * Math.PI
    if (circle.wrap < 0 && sweep > 0) sweep -= 2 * Math.PI
    length += circle.r * Math.abs(sweep)
    arcs.push({ x: circle.c.x, y: circle.c.y, r: circle.r, from: a0, to: a1, wrap: circle.wrap })
  })
  return { length, points, arcs, u1, uLast: last.u, s1, sLast }
}


/**
 * Rope as a unilateral constraint g = L − ℓ ≥ 0 (λ ≥ 0 is the tension). Pulleys are fixed, so
 * ℓ̇ = −u1·V_A + uLast·V_B and ℓ̈ = −u1·A_A + uLast·A_B + |V_A⊥|²/s1 + |V_B⊥|²/sLast
 * (the wrap arcs change exactly as the tangent points move along the free segments).
 */
export function ropeKin(poses: Pose[], rope: RopeModel): ConstraintKin & { path: RopePath } {
  if (rope.pulleys.length === 0) {
    // g = L − |PA − PB|: J = −∂|PA − PB|/∂q
    const k = distanceKin(poses, rope.a, rope.b)
    const row = k.j
    const neg: RowJ = { ai: row.ai, ax: -row.ax, ay: -row.ay, aw: -row.aw, bi: row.bi, bx: -row.bx, by: -row.by, bw: -row.bw }
    return { value: rope.length - k.value, vel: -k.vel, j: neg, c: -k.c, path: ropePath(poses, rope) }
  }
  const path = ropePath(poses, rope)
  const pa = anchorState(poses, rope.a), pb = anchorState(poses, rope.b)
  const u1 = path.u1, uL = path.uLast
  const row = emptyRow()
  anchorRow(row, 'a', rope.a, u1.x, u1.y, pa)
  anchorRow(row, 'b', rope.b, -uL.x, -uL.y, pb)
  const vel = u1.x * pa.vx + u1.y * pa.vy - (uL.x * pb.vx + uL.y * pb.vy)
  const vaPar = u1.x * pa.vx + u1.y * pa.vy, vbPar = uL.x * pb.vx + uL.y * pb.vy
  const vaPerpSq = pa.vx * pa.vx + pa.vy * pa.vy - vaPar * vaPar
  const vbPerpSq = pb.vx * pb.vx + pb.vy * pb.vy - vbPar * vbPar
  const c = u1.x * pa.qx + u1.y * pa.qy - (uL.x * pb.qx + uL.y * pb.qy)
    - (path.s1 > 0 ? vaPerpSq / path.s1 : 0) - (path.sLast > 0 ? vbPerpSq / path.sLast : 0)
  return { value: rope.length - path.length, vel, j: row, c, path }
}

// ---------------------------------------------------------------------------------------------- probes
/**
 * A probe watches one point of body A (polygon vertex, or circle centre with its radius) against the whole
 * of body B. Its value is the signed distance from the point to B minus the radius: continuous, and negative
 * exactly when the point (disc) overlaps B. Crossing zero is a new contact; which feature touches is found
 * afterwards. (For convex shapes some vertex, or the circle, must enter the other body first.)
 */
export interface Probe { key: string; A: BodyModel; local: Vec2; radius: number; vertex: number; B: BodyModel }

export function probeKey(A: BodyModel, vertex: number, B: BodyModel): string { return `${A.id}#${vertex}>${B.id}` }

export function featureProbeKey(f: ContactFeature): string {
  return probeKey(f.A.body, f.A.vertex, f.B.body)
}

export function pairProbes(X: BodyModel, Y: BodyModel): Probe[] {
  const out: Probe[] = []
  const add = (A: BodyModel, B: BodyModel) => {
    if (A.shape.kind === 'circle') out.push({ key: probeKey(A, -1, B), A, local: { x: 0, y: 0 }, radius: A.shape.radius, vertex: -1, B })
    else A.shape.verts.forEach((v, i) => out.push({ key: probeKey(A, i, B), A, local: v, radius: 0, vertex: i, B }))
  }
  if (X.shape.kind === 'circle' && Y.shape.kind === 'circle') add(X, Y)
  else if (X.shape.kind === 'circle') add(X, Y)
  else if (Y.shape.kind === 'circle') add(Y, X)
  else { add(X, Y); add(Y, X) }
  return out
}

/** Signed distance from a world point to body B (negative inside). */
export function signedDistance(B: BodyModel, pose: Pose, px: number, py: number): number {
  const dx = px - pose.x, dy = py - pose.y
  const lx = pose.c * dx + pose.s * dy, ly = -pose.s * dx + pose.c * dy
  if (B.shape.kind === 'circle') return Math.sqrt(lx * lx + ly * ly) - B.shape.radius
  const { verts, normals } = B.shape
  let maxGap = -Infinity
  for (let f = 0; f < verts.length; f++) {
    const g = normals[f].x * (lx - verts[f].x) + normals[f].y * (ly - verts[f].y)
    if (g > maxGap) maxGap = g
  }
  if (maxGap <= 0) return maxGap
  let best = Infinity
  for (let f = 0; f < verts.length; f++) {
    const a = verts[f], b = verts[(f + 1) % verts.length]
    const ex = b.x - a.x, ey = b.y - a.y, wx = lx - a.x, wy = ly - a.y
    const ee = ex * ex + ey * ey
    let u = ee > 0 ? (wx * ex + wy * ey) / ee : 0
    if (u < 0) u = 0; else if (u > 1) u = 1
    const qx = wx - u * ex, qy = wy - u * ey
    const d2 = qx * qx + qy * qy
    if (d2 < best) best = d2
  }
  return Math.sqrt(best)
}

export function probeValue(p: Probe, poses: Pose[]): number {
  const pa = poses[p.A.global]
  const px = pa.x + pa.c * p.local.x - pa.s * p.local.y
  const py = pa.y + pa.s * p.local.x + pa.c * p.local.y
  return signedDistance(p.B, poses[p.B.global], px, py) - p.radius
}
