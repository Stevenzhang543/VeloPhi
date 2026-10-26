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
import type { AnchorModel, BodyModel, Model, PulleyModel, RopeModel, ShapePiece, SliderModel } from './model'

/**
 * Pose and velocity of a body: position (m), c = cos θ, s = sin θ, velocity (m/s), ω (rad/s), and the angle θ itself
 * as integrated (not wrapped; used by the angle rows of welds, sliders and gears).
 */
export interface Pose { x: number; y: number; c: number; s: number; vx: number; vy: number; w: number; th: number }

/** Poses of all bodies (global index) for state X = [q(3n), v(3n), …]. */
export function computePoses(model: Model, X: Float64Array): Pose[] {
  const n = model.n
  const bodies = model.bodies
  const out: Pose[] = new Array(bodies.length)
  for (let k = 0; k < bodies.length; k++) {
    const b = bodies[k]
    if (b.index < 0) {
      out[k] = { x: b.staticPos.x, y: b.staticPos.y, c: b.staticC, s: b.staticS, vx: 0, vy: 0, w: 0, th: b.staticAngle }
      continue
    }
    const i = b.index
    const th = X[3 * i + 2]
    out[k] = { x: X[3 * i], y: X[3 * i + 1], c: cos(th), s: sin(th), vx: X[3 * n + 3 * i], vy: X[3 * n + 3 * i + 1], w: X[3 * n + 3 * i + 2], th }
  }
  return out
}

/** A term of a Jacobian row on one dynamic body (generalized components x, y, θ). */
export interface RowTerm { i: number; x: number; y: number; w: number }

/**
 * A row of the Jacobian. Contacts, hinges, rods and ropes over fixed pulleys involve at most two bodies
 * (slots a and b, dynamic index or −1); a rope over movable pulleys may involve more, listed in `ex`
 * (each body at most once over a, b and ex).
 */
export interface RowJ { ai: number; ax: number; ay: number; aw: number; bi: number; bx: number; by: number; bw: number; ex?: RowTerm[] }

/** A row with no terms. */
export const emptyRow = (): RowJ => ({ ai: -1, ax: 0, ay: 0, aw: 0, bi: -1, bx: 0, by: 0, bw: 0 })

/** Position, velocity and velocity-product acceleration of a material point of a body. */
export interface PointState {
  /** World position. */
  px: number; py: number
  /** Offset from the body origin (centre of mass). */
  rx: number; ry: number
  /** Velocity of the material point. */
  vx: number; vy: number
  /** Velocity-product part of its acceleration: −ω²r. */
  qx: number; qy: number
}

/** State of the point at body coordinates `local`. */
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

// ---- Contact features ----
/**
 * A point feature: circle centre or polygon vertex (`vertex` −1 for a circle centre) with its radius; `piece`: the convex
 * piece of a complex body it lies on (26.52; absent otherwise).
 */
export interface PointFeature { body: BodyModel; local: Vec2; radius: number; vertex: number; piece?: number }
/** A polygon face from e0 to e1 (body coordinates) with its outward normal and length, and its piece (complex bodies). */
export interface FaceFeature { body: BodyModel; face: number; e0: Vec2; e1: Vec2; normal: Vec2; len: number; piece?: number }
/** A possible contact: point against face ('pf'), or point against point ('pp', with the vertex cone of B). */
export type ContactFeature =
  | { kind: 'pf'; key: string; A: PointFeature; B: FaceFeature }
  | { kind: 'pp'; key: string; A: PointFeature; B: PointFeature; cone: null | { n1: Vec2; n2: Vec2 } }

/** Kinematics of a contact feature: gap (m), frame, contact point, and the normal and tangential rows. */
export interface ContactKin {
  gap: number
  /** Normal from B to A, tangent t = perp(n). */
  nx: number; ny: number; tx: number; ty: number
  /** Contact point (on A's surface). */
  cx: number; cy: number
  /** Relative normal velocity (m/s), positive when separating. */
  vn: number
  /** Relative tangential velocity of A against B (surface speed of a conveyor B included). */
  vt: number
  /** Normal row and its velocity-product term. */
  jn: RowJ; cn: number
  /** Tangential row and its velocity-product term. */
  jt: RowJ; ct: number
  /** Feature validity: position along the face (pf), or the two cone margins (pp at a vertex); ≥ 0 inside. */
  m1: number; m2: number
}

function fill(row: RowJ, A: BodyModel, ax: number, ay: number, aw: number, B: BodyModel, bx: number, by: number, bw: number): RowJ {
  row.ai = A.index; row.ax = ax; row.ay = ay; row.aw = aw
  row.bi = B.index; row.bx = bx; row.by = by; row.bw = bw
  return row
}

/** Kinematics of a contact feature at the given poses. */
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
    const tW = tx * Wx + ty * Wy // t·W = perp(n)·W
    const vn = wB * tW + nx * dWx + ny * dWy
    // n·perp(r) = n.y·r.x − n.x·r.y
    const nPerpRA = ny * pa.rx - nx * pa.ry
    const nPerpR0 = ny * p0.rx - nx * p0.ry
    const jn = fill(emptyRow(), A, nx, ny, nPerpRA, B, -nx, -ny, tW - nPerpR0)
    const cn = -wB * wB * (nx * Wx + ny * Wy) + 2 * wB * (tx * dWx + ty * dWy) + nx * (pa.qx - p0.qx) + ny * (pa.qy - p0.qy)
    // Contact point and tangential kinematics
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
  // Point–point
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

/** A point of a body for contact features: index (−1: a circle body's centre), local position, radius, vertex cone, piece. */
interface BodyPoint { vertex: number; local: Vec2; radius: number; cone: { n1: Vec2; n2: Vec2 } | null; piece?: number }

/** The point features of a body: a circle's centre, a convex polygon's vertices, a complex shape's points (26.52). */
function bodyPoints(B: BodyModel): BodyPoint[] {
  const sh = B.shape
  if (sh.kind === 'circle') return [{ vertex: -1, local: { x: 0, y: 0 }, radius: sh.radius, cone: null }]
  if (sh.kind === 'polygon') {
    const m = sh.verts.length
    return sh.verts.map((v, i) => ({ vertex: i, local: v, radius: 0, cone: { n1: sh.normals[(i + m - 1) % m], n2: sh.normals[i] } }))
  }
  return sh.points.map((p, i) => ({ vertex: i, local: p.local, radius: p.radius, cone: p.cone, piece: p.piece }))
}

/** The faces of a body (none for a circle). */
function bodyFaces(B: BodyModel): Array<Omit<FaceFeature, 'body'>> {
  const sh = B.shape
  if (sh.kind === 'circle') return []
  if (sh.kind === 'polygon') return sh.verts.map((v, f) => ({ face: f, e0: v, e1: sh.verts[(f + 1) % sh.verts.length], normal: sh.normals[f], len: sh.lengths[f] }))
  return sh.faces.map((f, i) => ({ face: i, e0: f.e0, e1: f.e1, normal: f.normal, len: f.len, piece: f.piece }))
}

const pointTag = (p: BodyPoint) => (p.vertex < 0 ? 'c' : 'v' + p.vertex)

/**
 * Contact features of a pair with a complex shape (26.52, D35): every point of one body against every face of the
 * other (both ways), and every round point against every point of the other body. Two round points pair once, with A
 * on the side whose probes watch them (a plain circle's, otherwise X).
 */
function complexPairFeatures(X: BodyModel, Y: BodyModel): ContactFeature[] {
  const out: ContactFeature[] = []
  const px = bodyPoints(X), py = bodyPoints(Y), fx = bodyFaces(X), fy = bodyFaces(Y)
  const pf = (A: BodyModel, p: BodyPoint, B: BodyModel, f: Omit<FaceFeature, 'body'>) =>
    out.push({ kind: 'pf', key: `${A.id}#${pointTag(p)}>${B.id}#f${f.face}`, A: { body: A, local: p.local, radius: p.radius, vertex: p.vertex }, B: { body: B, ...f } })
  const pp = (A: BodyModel, p: BodyPoint, B: BodyModel, q: BodyPoint) => {
    const bp: PointFeature = { body: B, local: q.local, radius: q.radius, vertex: q.vertex }
    if (q.piece !== undefined) bp.piece = q.piece
    out.push({ kind: 'pp', key: `${A.id}#${pointTag(p)}>${B.id}#${pointTag(q)}`, A: { body: A, local: p.local, radius: p.radius, vertex: p.vertex }, B: bp, cone: q.radius > 0 ? null : q.cone })
  }
  for (const p of px) for (const f of fy) pf(X, p, Y, f)
  for (const p of py) for (const f of fx) pf(Y, p, X, f)
  const yFirst = Y.shape.kind === 'circle'
  for (const p of px) {
    if (!(p.radius > 0)) continue
    for (const q of py) {
      if (q.radius > 0 && yFirst) pp(Y, q, X, p)
      else pp(X, p, Y, q)
    }
  }
  for (const p of py) {
    if (!(p.radius > 0)) continue
    for (const q of px) if (!(q.radius > 0)) pp(Y, p, X, q)
  }
  return out
}

/** All contact features between two bodies (the point side is always A; circles are always points). */
export function pairFeatures(X: BodyModel, Y: BodyModel): ContactFeature[] {
  if (X.shape.kind === 'complex' || Y.shape.kind === 'complex') return complexPairFeatures(X, Y)
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
  } else if (sx.kind === 'polygon' && sy.kind === 'polygon') {
    sx.verts.forEach((v, i) => pf(X, i, v, 0, Y))
    sy.verts.forEach((v, i) => pf(Y, i, v, 0, X))
  }
  return out
}

// ---- Connectors ----
/** Value, rate, Jacobian row and velocity-product term of a scalar constraint. */
export interface ConstraintKin { value: number; vel: number; j: RowJ; c: number }

function anchorRow(row: RowJ, side: 'a' | 'b', anchor: AnchorModel, gx: number, gy: number, p: PointState) {
  if (!anchor.body || anchor.body.index < 0) return
  // Generalized force of a unit force (gx, gy) at the point: (gx, gy, r × g)
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

// ---- Connectors of 26.51 (D51) ----

/** Angle θ (rad) and angular velocity ω of a body (the world: 0, 0). */
function angular(poses: Pose[], body: BodyModel | null): { th: number; w: number } {
  if (!body) return { th: 0, w: 0 }
  const p = poses[body.global]
  return { th: p.th, w: p.w }
}

/** Put generalized angle coefficients ka (body a) and kb (body b) into a row. */
function angleRow(a: BodyModel | null, ka: number, b: BodyModel | null, kb: number): RowJ {
  const row = emptyRow()
  if (a && a.index >= 0) { row.ai = a.index; row.aw = ka }
  if (b && b.index >= 0) { row.bi = b.index; row.bw = kb }
  return row
}

/** Relative angle: value = (θ_b − θ_a) − offset, J = (−1 on θ_a, +1 on θ_b), no velocity-product term. */
export function relAngleKin(poses: Pose[], a: BodyModel | null, b: BodyModel | null, offset: number): ConstraintKin {
  const A = angular(poses, a), B = angular(poses, b)
  return { value: B.th - A.th - offset, vel: B.w - A.w, j: angleRow(a, -1, b, 1), c: 0 }
}

/**
 * Relative rolling of a contact (26.52, D59): ω_A − ω_B of the round body A against B, J = (+1 on θ_A, −1 on θ_B); a
 * velocity-level row (value 0, no velocity-product term).
 */
export function rollKin(poses: Pose[], A: BodyModel, B: BodyModel): ConstraintKin {
  const wa = poses[A.global].w, wb = poses[B.global].w
  const row = emptyRow()
  row.ai = A.index; row.aw = A.index >= 0 ? 1 : 0
  row.bi = B.index; row.bw = B.index >= 0 ? -1 : 0
  return { value: 0, vel: wa - wb, j: row, c: 0 }
}

/** Gear or belt: value = θ_a + r·θ_b − offset, J = (1 on θ_a, r on θ_b). */
export function gearKin(poses: Pose[], a: BodyModel | null, b: BodyModel | null, r: number, offset: number): ConstraintKin {
  const A = angular(poses, a), B = angular(poses, b)
  return { value: A.th + r * B.th - offset, vel: A.w + r * B.w, j: angleRow(a, 1, b, r), c: 0 }
}

/** Speed drive of a motor: ω_b − ω_a = speed (velocity level only: value 0, vel = ω_b − ω_a − speed). */
export function driveKin(poses: Pose[], a: BodyModel | null, b: BodyModel | null, speed: number): ConstraintKin {
  const A = angular(poses, a), B = angular(poses, b)
  return { value: 0, vel: B.w - A.w - speed, j: angleRow(a, -1, b, 1), c: 0 }
}

/**
 * Slider: anchor b stays on the line through anchor a along the axis, g = n·(P_b − P_a) with n the axis normal
 * turning with a's body. With d = P_b − P_a, r = P_b − x_a and k×n = (−n_y, n_x):
 *   J_a = (−n, (k×n)·r), J_b = (n, n·(k×r_b)), c = −ω_a²·n·d + 2ω_a·(k×n)·ḋ + n·(q_b − q_a).
 */
export function sliderKin(poses: Pose[], s: SliderModel): ConstraintKin { return sliderLine(poses, s, true) }

/**
 * Displacement of a slider along its axis (26.52, D58): s = u·(P_b − P_a) with the axis u turning with a's body. The
 * same expressions as sliderKin with the normal n replaced by u.
 */
export function sliderAxisKin(poses: Pose[], s: SliderModel): ConstraintKin { return sliderLine(poses, s, false) }

/** g = d·(P_b − P_a) for the slider's normal (normal = true) or axis direction d, turning with a's body. */
function sliderLine(poses: Pose[], s: SliderModel, normal: boolean): ConstraintKin {
  const pa = anchorState(poses, s.a), pb = anchorState(poses, s.b)
  const A = s.a.body && s.a.body.index >= 0 ? poses[s.a.body.global] : null
  const ax = A ? A.c * s.axis.x - A.s * s.axis.y : s.axis.x
  const ay = A ? A.s * s.axis.x + A.c * s.axis.y : s.axis.y
  // Normal n = (−a_y, a_x) (or the axis itself) and k×n = (−n_y, n_x)
  const nx = normal ? -ay : ax, ny = normal ? ax : ay
  const knx = -ny, kny = nx
  const dx = pb.px - pa.px, dy = pb.py - pa.py
  const dvx = pb.vx - pa.vx, dvy = pb.vy - pa.vy
  const wa = A ? A.w : 0
  const row = emptyRow()
  if (A && s.a.body) { row.ai = s.a.body.index; row.ax = -nx; row.ay = -ny; row.aw = knx * (pb.px - A.x) + kny * (pb.py - A.y) }
  if (s.b.body && s.b.body.index >= 0) { row.bi = s.b.body.index; row.bx = nx; row.by = ny; row.bw = nx * -pb.ry + ny * pb.rx }
  const value = nx * dx + ny * dy
  const vel = wa * (knx * dx + kny * dy) + nx * dvx + ny * dvy
  const c = -wa * wa * value + 2 * wa * (knx * dvx + kny * dvy) + nx * (pb.qx - pa.qx) + ny * (pb.qy - pa.qy)
  return { value, vel, j: row, c }
}

/** Kind of an equality constraint row. */
export type EqualityKind = 'hinge' | 'weld' | 'motor' | 'drive' | 'rod' | 'slider' | 'gear'

/**
 * An equality constraint row of a connector: its kind, connector index and sub-row, kinematics, whether it is a
 * position-level (holonomic) constraint, and its velocity target (`vel` already has it subtracted).
 */
export interface EqualityKin { kind: EqualityKind; owner: number; sub: number; kin: ConstraintKin; holonomic: boolean }

/**
 * All equality rows of the connectors, in a fixed order: hinges, welds, motors, rods, sliders, gears (each with its
 * sub-rows). Scenes without the connectors of 26.51 get exactly the rows of 26.50 (hinges, then rods).
 */
export function equalityKins(model: Model, poses: Pose[]): EqualityKin[] {
  const out: EqualityKin[] = []
  model.hinges.forEach((h, k) => {
    const [rx, ry] = hingeKin(poses, h.a, h.b)
    out.push({ kind: 'hinge', owner: k, sub: 0, kin: rx, holonomic: true }, { kind: 'hinge', owner: k, sub: 1, kin: ry, holonomic: true })
  })
  model.welds.forEach((w, k) => {
    const [rx, ry] = hingeKin(poses, w.a, w.b)
    out.push({ kind: 'weld', owner: k, sub: 0, kin: rx, holonomic: true }, { kind: 'weld', owner: k, sub: 1, kin: ry, holonomic: true })
    out.push({ kind: 'weld', owner: k, sub: 2, kin: relAngleKin(poses, w.a.body, w.b.body, w.angle0), holonomic: true })
  })
  model.motors.forEach((m, k) => {
    const [rx, ry] = hingeKin(poses, m.a, m.b)
    out.push({ kind: 'motor', owner: k, sub: 0, kin: rx, holonomic: true }, { kind: 'motor', owner: k, sub: 1, kin: ry, holonomic: true })
    if (m.mode === 'speed') out.push({ kind: 'drive', owner: k, sub: 2, kin: driveKin(poses, m.a.body, m.b.body, m.speed), holonomic: false })
  })
  model.rods.forEach((r, k) => {
    const d = distanceKin(poses, r.a, r.b)
    out.push({ kind: 'rod', owner: k, sub: 0, kin: { value: d.value - r.length, vel: d.vel, j: d.j, c: d.c }, holonomic: true })
  })
  model.sliders.forEach((sl, k) => {
    out.push({ kind: 'slider', owner: k, sub: 0, kin: sliderKin(poses, sl), holonomic: true })
    if (!sl.free) out.push({ kind: 'slider', owner: k, sub: 1, kin: relAngleKin(poses, sl.a.body, sl.b.body, sl.angle0), holonomic: true })
  })
  model.gears.forEach((g, k) => {
    out.push({ kind: 'gear', owner: k, sub: 0, kin: gearKin(poses, g.a, g.b, g.ratio, g.offset0), holonomic: true })
  })
  return out
}

/** Geometry of a rope's path over its pulleys. */
export interface RopePath {
  /** Total path length (m). */
  length: number
  /** Free segments in order from A to B: unit direction (towards B) and length. */
  segs: Array<{ u: Vec2; s: number }>
  /** Points of the drawn rope: A, the tangent points on each pulley (in, out), B. */
  points: Vec2[]
  /** Pulley arcs for drawing: centre, radius, start and end angle, direction. */
  arcs: Array<{ x: number; y: number; r: number; from: number; to: number; wrap: 1 | -1 }>
  /** Unit vector of the first free segment (from A towards the first pulley) and of the last (towards B). */
  u1: Vec2; uLast: Vec2
  /** Lengths of the first and last free segments (m). */
  s1: number; sLast: number
}

/** Tangent line between two signed circles (point when r = 0): departure, arrival and unit direction. */
function tangent(c1: Vec2, rho1: number, c2: Vec2, rho2: number): { p1: Vec2; p2: Vec2; u: Vec2 } {
  const Dx = c2.x - c1.x, Dy = c2.y - c1.y
  const L2 = Dx * Dx + Dy * Dy, L = Math.sqrt(L2)
  const k = (rho1 - rho2) / L
  const q = Math.sqrt(Math.max(0, 1 - k * k))
  // n = k·D/|D| + σ q·perp(D)/|D|; travel direction perp(n) must point along D
  let nx = (k * Dx + q * -Dy) / L, ny = (k * Dy + q * Dx) / L
  if (-ny * Dx + nx * Dy < 0) { nx = (k * Dx - q * -Dy) / L; ny = (k * Dy - q * Dx) / L }
  const p1 = { x: c1.x + rho1 * nx, y: c1.y + rho1 * ny }
  const p2 = { x: c2.x + rho2 * nx, y: c2.y + rho2 * ny }
  return { p1, p2, u: { x: -ny, y: nx } }
}

/** Distance between two points given as (ax − bx, ay − by) parts. */
function dist2(ax: number, bx: number, ay: number, by: number): number { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy) }

function angleOf(cx: number, cy: number, p: Vec2): number {
  return Math.atan2(p.y - cy, p.x - cx) // Drawing only
}

/** Axle of a pulley: fixed in the world, or a point of the dynamic body carrying it. */
export function pulleyState(poses: Pose[], pulley: PulleyModel): PointState {
  if (!pulley.body) return { px: pulley.position.x, py: pulley.position.y, rx: 0, ry: 0, vx: 0, vy: 0, qx: 0, qy: 0 }
  return pointState(poses[pulley.body.global], pulley.position)
}

/** World position of a pulley's axle (drawing, picking). */
export function pulleyCenter(poses: Pose[], pulley: PulleyModel): Vec2 {
  if (!pulley.body) return pulley.position
  const p = pulleyState(poses, pulley)
  return { x: p.px, y: p.py }
}

/** Path of a rope at the given poses. */
export function ropePath(poses: Pose[], rope: RopeModel): RopePath {
  const pa = anchorState(poses, rope.a), pb = anchorState(poses, rope.b)
  const A = { x: pa.px, y: pa.py }, B = { x: pb.px, y: pb.py }
  if (rope.pulleys.length === 0) {
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.sqrt(dx * dx + dy * dy)
    const u = d > 0 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 }
    return { length: d, segs: [{ u, s: d }], points: [A, B], arcs: [], u1: u, uLast: u, s1: d, sLast: d }
  }
  const circles = rope.pulleys.map(p => ({ c: rope.movable ? pulleyCenter(poses, p.pulley) : p.pulley.position, rho: p.wrap * p.pulley.radius, r: p.pulley.radius, wrap: p.wrap }))
  const points: Vec2[] = [A]
  const segs: RopePath['segs'] = []
  let length = 0
  const arrivals: Vec2[] = [], departures: Vec2[] = []
  const first = tangent(A, 0, circles[0].c, circles[0].rho)
  length += dist2(first.p2.x, A.x, first.p2.y, A.y)
  const u1 = first.u, s1 = length
  segs.push({ u: u1, s: s1 })
  arrivals.push(first.p2)
  points.push(first.p2)
  for (let i = 0; i + 1 < circles.length; i++) {
    const seg = tangent(circles[i].c, circles[i].rho, circles[i + 1].c, circles[i + 1].rho)
    departures.push(seg.p1); arrivals.push(seg.p2)
    points.push(seg.p1, seg.p2)
    const sk = dist2(seg.p2.x, seg.p1.x, seg.p2.y, seg.p1.y)
    segs.push({ u: seg.u, s: sk })
    length += sk
  }
  const lastC = circles[circles.length - 1]
  const last = tangent(lastC.c, lastC.rho, B, 0)
  departures.push(last.p1)
  points.push(last.p1, B)
  const sLast = dist2(B.x, last.p1.x, B.y, last.p1.y)
  segs.push({ u: last.u, s: sLast })
  length += sLast
  const arcs: RopePath['arcs'] = []
  circles.forEach((circle, i) => {
    if (circle.r <= 0) return
    const a0 = angleOf(circle.c.x, circle.c.y, arrivals[i]), a1 = angleOf(circle.c.x, circle.c.y, departures[i])
    // Arc swept in the wrap direction, using the exact geometry (dot/cross) for the length
    const ux = arrivals[i].x - circle.c.x, uy = arrivals[i].y - circle.c.y
    const vx = departures[i].x - circle.c.x, vy = departures[i].y - circle.c.y
    const cr = ux * vy - uy * vx, dt = ux * vx + uy * vy
    let sweep = atan2Det(cr, dt) // −π … π, ccw positive
    if (circle.wrap > 0 && sweep < 0) sweep += 2 * Math.PI
    if (circle.wrap < 0 && sweep > 0) sweep -= 2 * Math.PI
    length += circle.r * Math.abs(sweep)
    arcs.push({ x: circle.c.x, y: circle.c.y, r: circle.r, from: a0, to: a1, wrap: circle.wrap })
  })
  return { length, segs, points, arcs, u1, uLast: last.u, s1, sLast }
}


/** Accumulates the terms of a row over any number of bodies (each body once, in order of appearance). */
class RowBuilder {
  private terms: RowTerm[] = []
  /** Generalized force of a unit force (gx, gy) at a point of the body with dynamic index i. */
  add(i: number, gx: number, gy: number, p: PointState) {
    if (i < 0) return
    const w = p.rx * gy - p.ry * gx
    for (const t of this.terms) if (t.i === i) { t.x += gx; t.y += gy; t.w += w; return }
    this.terms.push({ i, x: gx, y: gy, w })
  }
  /** The accumulated row: the first two terms in slots a and b, the rest in `ex`. */
  row(): RowJ {
    const r = emptyRow()
    const t = this.terms
    if (t.length > 0) { r.ai = t[0].i; r.ax = t[0].x; r.ay = t[0].y; r.aw = t[0].w }
    if (t.length > 1) { r.bi = t[1].i; r.bx = t[1].x; r.by = t[1].y; r.bw = t[1].w }
    if (t.length > 2) r.ex = t.slice(2)
    return r
  }
}

/**
 * Rope over movable pulleys. With the free segments k (unit direction u_k from endpoint k to k + 1, length
 * s_k; endpoints: anchor A, the pulley axles in order, anchor B) the path length changes as
 *   ℓ̇ = Σ u_k·(V_{k+1} − V_k),   ℓ̈ = Σ [u_k·(A_{k+1} − A_k) + |ΔV_k⊥|²/s_k],
 * the arcs on the wheels changing exactly as the tangent points slide (the same argument as for fixed
 * pulleys). The tension T pulls anchor A along u_0, anchor B along −u_last and each axle along u_out − u_in.
 */
function movableRopeKin(poses: Pose[], rope: RopeModel): ConstraintKin & { path: RopePath } {
  const path = ropePath(poses, rope)
  const ends: Array<{ i: number; p: PointState }> = [{ i: rope.a.body ? rope.a.body.index : -1, p: anchorState(poses, rope.a) }]
  for (const pl of rope.pulleys) ends.push({ i: pl.pulley.body ? pl.pulley.body.index : -1, p: pulleyState(poses, pl.pulley) })
  ends.push({ i: rope.b.body ? rope.b.body.index : -1, p: anchorState(poses, rope.b) })
  const rb = new RowBuilder()
  let lenRate = 0, c = 0
  path.segs.forEach((seg, k) => {
    const e0 = ends[k], e1 = ends[k + 1]
    const ux = seg.u.x, uy = seg.u.y
    // g = L − ℓ: gradient +u at the start, −u at the end of each segment
    rb.add(e0.i, ux, uy, e0.p)
    rb.add(e1.i, -ux, -uy, e1.p)
    const dvx = e1.p.vx - e0.p.vx, dvy = e1.p.vy - e0.p.vy
    const along = ux * dvx + uy * dvy
    lenRate += along
    const perpSq = dvx * dvx + dvy * dvy - along * along
    c += ux * (e1.p.qx - e0.p.qx) + uy * (e1.p.qy - e0.p.qy) + (seg.s > 0 ? perpSq / seg.s : 0)
  })
  return { value: rope.length - path.length, vel: -lenRate, j: rb.row(), c: -c, path }
}

/**
 * Rope as a unilateral constraint g = L − ℓ ≥ 0 (λ ≥ 0 is the tension). With fixed pulleys
 * ℓ̇ = −u1·V_A + uLast·V_B and ℓ̈ = −u1·A_A + uLast·A_B + |V_A⊥|²/s1 + |V_B⊥|²/sLast
 * (the wrap arcs change exactly as the tangent points move along the free segments); movable pulleys add
 * the terms of their axles (movableRopeKin).
 */
export function ropeKin(poses: Pose[], rope: RopeModel): ConstraintKin & { path: RopePath } {
  if (rope.movable) return movableRopeKin(poses, rope)
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

// ---- Probes ----
/**
 * A probe watches one point of body A (polygon vertex, or circle centre with its radius) against the whole
 * of body B. Its value is the signed distance from the point to B minus the radius: continuous, and negative
 * exactly when the point (disc) overlaps B. Crossing zero is a new contact; which feature touches is found
 * afterwards. (For convex shapes some vertex, or the circle, must enter the other body first.)
 */
export interface Probe { key: string; A: BodyModel; local: Vec2; radius: number; vertex: number; B: BodyModel; piece?: number }

/** Key of the probe of vertex `vertex` of A (−1: the circle centre) against B. */
export function probeKey(A: BodyModel, vertex: number, B: BodyModel): string { return `${A.id}#${vertex}>${B.id}` }

/** Key of the probe that watches the point of a feature (against the piece of B it touches, for a complex B). */
export function featureProbeKey(f: ContactFeature): string {
  const k = probeKey(f.A.body, f.A.vertex, f.B.body)
  return f.B.piece === undefined ? k : `${k}@${f.B.piece}`
}

/**
 * Probes of a body pair with a complex shape (26.52, D35): each point of one body against each convex piece of the
 * other (or against the whole of a convex body). First contact is always at one of these points, and a point touching
 * one piece still watches the others (a ball rolling down into a V-notch meets the second face).
 */
function complexPairProbes(X: BodyModel, Y: BodyModel): Probe[] {
  const out: Probe[] = []
  const add = (A: BodyModel, B: BodyModel) => {
    for (const p of bodyPoints(A)) {
      const key = probeKey(A, p.vertex, B)
      if (B.shape.kind === 'complex') B.shape.pieces.forEach((_, k) => out.push({ key: `${key}@${k}`, A, local: p.local, radius: p.radius, vertex: p.vertex, B, piece: k }))
      else out.push({ key, A, local: p.local, radius: p.radius, vertex: p.vertex, B })
    }
  }
  if (Y.shape.kind === 'circle') add(Y, X)
  else if (X.shape.kind === 'circle') add(X, Y)
  else { add(X, Y); add(Y, X) }
  return out
}

/** Probes of a body pair: a circle against the other body, or each polygon's vertices against the other polygon. */
export function pairProbes(X: BodyModel, Y: BodyModel): Probe[] {
  if (X.shape.kind === 'complex' || Y.shape.kind === 'complex') return complexPairProbes(X, Y)
  const out: Probe[] = []
  const add = (A: BodyModel, B: BodyModel) => {
    if (A.shape.kind === 'circle') out.push({ key: probeKey(A, -1, B), A, local: { x: 0, y: 0 }, radius: A.shape.radius, vertex: -1, B })
    else if (A.shape.kind === 'polygon') A.shape.verts.forEach((v, i) => out.push({ key: probeKey(A, i, B), A, local: v, radius: 0, vertex: i, B }))
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
  if (B.shape.kind === 'complex') {
    // 26.52 (D35): the smallest signed distance over the convex pieces
    let best = Infinity
    for (const p of B.shape.pieces) { const d = pieceDistance(p, lx, ly); if (d < best) best = d }
    return best
  }
  return convexDistance(B.shape.verts, B.shape.normals, lx, ly)
}

/** Signed distance from a local point to a convex piece of a complex shape. */
function pieceDistance(p: ShapePiece, lx: number, ly: number): number {
  if (p.kind === 'circle') { const dx = lx - p.center.x, dy = ly - p.center.y; return Math.sqrt(dx * dx + dy * dy) - p.radius }
  return convexDistance(p.verts, p.normals, lx, ly)
}

/** Signed distance from a local point to a convex polygon (negative inside: minus the distance to the nearest face). */
function convexDistance(verts: Vec2[], normals: Vec2[], lx: number, ly: number): number {
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


/** Value of a probe: signed distance from its point to B (or to its piece) minus its radius (m). */
export function probeValue(p: Probe, poses: Pose[]): number {
  const pa = poses[p.A.global]
  const px = pa.x + pa.c * p.local.x - pa.s * p.local.y
  const py = pa.y + pa.s * p.local.x + pa.c * p.local.y
  if (p.piece !== undefined && p.B.shape.kind === 'complex') {
    const pose = poses[p.B.global]
    const dx = px - pose.x, dy = py - pose.y
    const lx = pose.c * dx + pose.s * dy, ly = -pose.s * dx + pose.c * dy
    return pieceDistance(p.B.shape.pieces[p.piece], lx, ly) - p.radius
  }
  return signedDistance(p.B, poses[p.B.global], px, py) - p.radius
}
