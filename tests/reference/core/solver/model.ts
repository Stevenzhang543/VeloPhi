/**
 * Compiled model: the scene turned into what the solver needs (mass properties, local geometry, resolved
 * connectors, pair materials). Pure function of the scene; the scene is not modified.
 */
import type { Message } from '../../../../src/i18n/message'
import { msg } from '../../../../src/i18n/message'
import type { BodyDef, CompoundShapeDef, Material, Scene, SceneSettings, ShapeDef, ShapePart } from '../../../../src/core/scene/types'
import type { Vec2 } from '../../../../src/core/math/vec'
import { cross, dot, length, sub } from '../../../../src/core/math/vec'
import { cos, log, pow, sin } from '../../../../src/core/math/dmath'
import type { CompiledExpr, SwitchDef } from './forceExpr'
import { ENV_SIZE, compileForceExpr } from './forceExpr'

/** Compiled circle (m). */
export interface CircleShape { kind: 'circle'; radius: number }
/** Compiled convex polygon with edge normals and lengths (m). */
export interface PolygonShape {
  kind: 'polygon'
  /** Counter-clockwise vertices in body coordinates. */
  verts: Vec2[]
  /** Outward unit normal of edge i (verts[i] → verts[i+1]). */
  normals: Vec2[]
  /** Length of edge i (m). */
  lengths: number[]
}
/**
 * A point feature of a complex shape (26.52, D35): a circle part's centre (radius > 0, no cone) or a convex (or flat)
 * vertex of a polygon part (radius 0, with the outward normals of the faces before and after it).
 */
export interface ShapePoint { local: Vec2; radius: number; cone: { n1: Vec2; n2: Vec2 } | null; piece: number }
/** A face of a complex shape: an edge of a polygon part with its outward normal and length, and its convex piece. */
export interface ShapeFace { e0: Vec2; e1: Vec2; normal: Vec2; len: number; piece: number }
/** A convex piece of a complex shape (a circle part, or a convex polygon of a part's decomposition). */
export type ShapePiece =
  | { kind: 'circle'; center: Vec2; radius: number }
  | { kind: 'polygon'; verts: Vec2[]; normals: Vec2[] }
/**
 * Compiled concave polygon or compound shape (26.52, D35): the point and face features of all its parts (reflex
 * vertices left out: they can never be the first point to touch), each tied to the convex piece it lies on, and the
 * convex pieces themselves (circle parts, and the decomposition of each polygon part). Probes watch every point of
 * the other body against every piece, so a body can touch a concave one at several places at once.
 */
export interface ComplexShape { kind: 'complex'; points: ShapePoint[]; faces: ShapeFace[]; pieces: ShapePiece[]; outline: ShapePiece[] }

/** Compiled shape of a body: circles and convex polygons as up to 26.51, complex shapes since 26.52. */
export type ShapeModel = CircleShape | PolygonShape | ComplexShape

/** A body compiled for the solver. */
export interface BodyModel {
  /** Index in `Model.bodies`. */
  global: number
  /** Index among dynamic bodies (state slot), −1 for static bodies. */
  index: number
  id: string
  name: string
  def: BodyDef
  dynamic: boolean
  shape: ShapeModel
  /** Mass (kg); 0 for static bodies. */
  mass: number
  /** Moment of inertia about the centre of mass (kg·m²). */
  inertia: number
  /** 1 / mass; 0 for static bodies. */
  invMass: number
  /** 1 / inertia; 0 for static bodies and bodies that only translate. */
  invInertia: number
  material: Material
  /** Conveyor belt speed (m/s); 0 for dynamic bodies. */
  beltSpeed: number
  /** Radius of a circle around the body origin containing the shape (broad phase). */
  bound: number
  /** Pose of a static body (and the cosine and sine of its angle). */
  staticPos: Vec2
  staticAngle: number
  staticC: number
  staticS: number
  /** Drag coefficients (26.51): linear b (N·s/m) and quadratic c (N·s²/m²); 0 without drag. */
  dragLin: number
  dragQuad: number
  /** Gravitating mass (kg; 26.51): the body's mass when gravitation is on (static bodies too), else 0. */
  attract: number
  /** Centre of attraction of a static body (world, m): its area centroid. Dynamic bodies use their centre of mass. */
  gravPos: Vec2
}

/** Anchor resolved to its body model (null: the world). */
export interface AnchorModel { body: BodyModel | null; local: Vec2 }

/**
 * Pulley. `body` null: the axle is fixed at `position` (world). Otherwise the pulley is movable: `position`
 * is the axle in the coordinates of the dynamic body carrying it. (A pulley on a static body is resolved to
 * a fixed one at compile time.)
 */
export interface PulleyModel { id: string; name: string; position: Vec2; radius: number; body: BodyModel | null }

/** Compiled rope; `wrap` is +1 for counter-clockwise, −1 for clockwise. */
export interface RopeModel {
  id: string; name: string; a: AnchorModel; b: AnchorModel
  pulleys: Array<{ pulley: PulleyModel; wrap: 1 | -1 }>
  /** Rope length (m); NaN until buildSystem resolves it from the initial path. */
  length: number
  /** The rope runs over at least one movable pulley. */
  movable: boolean
}
/** Compiled rod; `length` (m) is NaN until buildSystem resolves it from the initial state. */
export interface RodModel { id: string; name: string; a: AnchorModel; b: AnchorModel; length: number }
/**
 * Compiled spring; `restLength` (m) is NaN until buildSystem resolves it from the initial state. A damper is a spring
 * with stiffness 0 (`damper` set); `cubic` is the k₃ of a nonlinear spring (0: linear).
 */
export interface SpringModel { id: string; name: string; a: AnchorModel; b: AnchorModel; stiffness: number; restLength: number; damping: number; cubic: number; damper: boolean }
/** Compiled weld; `angle0` (rad) is NaN until buildSystem resolves it from the initial state. */
export interface WeldModel { id: string; name: string; a: AnchorModel; b: AnchorModel; angle0: number }
/**
 * Compiled slider; `axis` is the unit direction in a's body frame (world when a has no dynamic body). End stops (26.52,
 * D58): `lo` ≤ s ≤ `hi` for s = axis·(P_b − P_a) (±∞: none), restitution `e`; `limited` when either stop exists.
 */
export interface SliderModel { id: string; name: string; a: AnchorModel; b: AnchorModel; axis: Vec2; free: boolean; angle0: number; limited: boolean; lo: number; hi: number; e: number }
/** Compiled motor (a pin joint with a drive); `maxTorque` (N·m, 26.52) is +∞ when unlimited, `limited` for a speed motor with a finite one. */
export interface MotorModel { id: string; name: string; a: AnchorModel; b: AnchorModel; mode: 'speed' | 'torque'; speed: number; torque: number; maxTorque: number; limited: boolean }
/**
 * Compiled central field (26.52, D60): F = k·rⁿ towards the centre `a` on each target's centre of mass (linear inside
 * the target's bounding radius); `targets` are dynamic bodies, never the body carrying the centre.
 */
export interface CentralModel { id: string; name: string; a: AnchorModel; k: number; n: number; targets: BodyModel[] }
/** Compiled gear: ω_a + ratio·ω_b = 0 (b null: the world); `offset0` = θ_a + ratio·θ_b at the start (NaN until resolved). */
export interface GearModel { id: string; name: string; a: BodyModel | null; b: BodyModel | null; ratio: number; offset0: number }
/** Compiled pin joint. */
export interface HingeModel { id: string; name: string; a: AnchorModel; b: AnchorModel }
/** Compiled applied force. */
export interface ForceModel {
  id: string; name: string; a: AnchorModel
  /** Constant force (N), used when `expr` is null. */
  force: Vec2
  /** Variable force: compiled world components. */
  expr: { x: CompiledExpr; y: CompiledExpr } | null
}

/** The compiled model of a scene. */
export interface Model {
  scene: Scene
  settings: SceneSettings
  bodies: BodyModel[]
  dynamic: BodyModel[]
  byId: Map<string, BodyModel>
  pulleys: PulleyModel[]
  ropes: RopeModel[]
  rods: RodModel[]
  springs: SpringModel[]
  hinges: HingeModel[]
  forces: ForceModel[]
  /** Connectors of 26.51 (D51). */
  welds: WeldModel[]
  sliders: SliderModel[]
  motors: MotorModel[]
  gears: GearModel[]
  /** Central fields (26.52, D60). */
  centrals: CentralModel[]
  /** Some slider has an end stop (the mode then carries `limit`). */
  hasLimits: boolean
  /** Some speed motor has a torque limit (the mode then carries `slip`). */
  hasSlip: boolean
  /** Gravitational constant when gravitation is on (26.51, D50), else 0. */
  G: number
  /** Bodies with a gravitating mass, in scene order. */
  attractors: BodyModel[]
  /** Number of dynamic bodies. */
  n: number
  /** Body pairs that never collide (joined by a hinge, weld, motor, slider or gear). */
  noCollide: Set<string>
  /** Switches of all variable forces (in force order, x before y); the mode holds their branches. */
  switches: SwitchDef[]
  /** Force index of each switch. */
  switchForce: number[]
  /** Some force is an expression (the state then carries the time). */
  hasExpr: boolean
  /** Typical force scale (N) for tolerances. */
  forceScale: number
  /** Typical acceleration scale (m/s²) for tolerances. */
  accelScale: number
  /** Warnings found while compiling. */
  warnings: Message[]
}

/** Order-independent key of a body pair. */
export function pairKey(a: string, b: string): string { return a < b ? `${a}|${b}` : `${b}|${a}` }

function boxPolygon(width: number, height: number): Vec2[] {
  const w = width / 2, h = height / 2
  return [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }]
}

function polygonArea(points: Vec2[]): number {
  let a = 0
  for (let i = 0; i < points.length; i++) a += cross(points[i], points[(i + 1) % points.length])
  return a / 2
}

/** Area centroid of a polygon; the origin for a degenerate one. */
export function polygonCentroid(points: Vec2[]): Vec2 {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length], c = cross(p, q)
    a += c; cx += (p.x + q.x) * c; cy += (p.y + q.y) * c
  }
  return a === 0 ? { x: 0, y: 0 } : { x: cx / (3 * a), y: cy / (3 * a) }
}

/** Moment of inertia of a uniform shape about its centre of mass (kg·m²). */
export function shapeInertia(shape: ShapeDef, mass: number): number {
  if (shape.type === 'circle') return 0.5 * mass * shape.radius * shape.radius
  if (shape.type === 'box') return mass * (shape.width * shape.width + shape.height * shape.height) / 12
  if (shape.type === 'compound') return compoundMass(shape, mass).inertia
  const c = polygonCentroid(shape.points)
  const pts = shape.points.map(p => sub(p, c))
  let num = 0, den = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], cr = cross(p, q)
    num += cr * (dot(p, p) + dot(p, q) + dot(q, q))
    den += cr
  }
  return den === 0 ? 0 : mass * num / (6 * den)
}

/** Relative tolerance of the convexity test of a polygon corner (cross product of its edges). */
const CONVEX_TOL = 1e-9

/** Whether corner i of a counter-clockwise polygon is convex or flat (not reflex). */
function convexCorner(verts: Vec2[], i: number): boolean {
  const m = verts.length
  const a = verts[(i + m - 1) % m], b = verts[i], c = verts[(i + 1) % m]
  const e1 = sub(b, a), e2 = sub(c, b)
  return cross(e1, e2) >= -CONVEX_TOL * length(e1) * length(e2)
}

/** Whether a counter-clockwise polygon is convex (every corner convex or flat). */
export function polygonIsConvex(verts: Vec2[]): boolean {
  for (let i = 0; i < verts.length; i++) if (!convexCorner(verts, i)) return false
  return true
}

/**
 * Whether a polygon is simple: at least 3 vertices, a non-zero area and no two edges that meet other than at their
 * shared vertex (26.52: concave polygons are allowed, self-intersecting ones are not).
 */
export function polygonIsSimple(points: Vec2[]): boolean {
  const m = points.length
  if (m < 3 || !(Math.abs(polygonArea(points)) > 0)) return false
  const orient = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const onSeg = (a: Vec2, b: Vec2, p: Vec2) => Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y)
  for (let i = 0; i < m; i++) {
    const a = points[i], b = points[(i + 1) % m]
    for (let j = i + 1; j < m; j++) {
      // Adjacent edges share a vertex (and the first and last edge)
      if (j === i + 1 || (i === 0 && j === m - 1)) continue
      const c = points[j], d = points[(j + 1) % m]
      const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b)
      if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return false
      if ((o1 === 0 && onSeg(a, b, c)) || (o2 === 0 && onSeg(a, b, d)) || (o3 === 0 && onSeg(c, d, a)) || (o4 === 0 && onSeg(c, d, b))) return false
    }
  }
  return true
}

/** Counter-clockwise vertices of a polygon or box part, placed in body coordinates. */
function partPolygon(part: ShapePart): Vec2[] {
  const sh = part.shape
  let verts = sh.type === 'box' ? boxPolygon(sh.width, sh.height) : sh.type === 'polygon' ? sh.points.map(p => ({ x: p.x, y: p.y })) : []
  if (polygonArea(verts) < 0) verts = verts.slice().reverse()
  const c = cos(part.angle), sn = sin(part.angle)
  return verts.map(v => ({ x: part.position.x + c * v.x - sn * v.y, y: part.position.y + sn * v.x + c * v.y }))
}

/**
 * Area, area centroid and moment of inertia (about that centroid, for `mass`) of a compound shape of uniform density:
 * each part's own moment plus the parallel-axis term (26.52, D35; overlapping parts count twice).
 */
export function compoundMass(shape: CompoundShapeDef, mass: number): { area: number; centroid: Vec2; inertia: number } {
  const parts = shape.parts.map(p => {
    if (p.shape.type === 'circle') {
      const r = p.shape.radius
      return { area: Math.PI * r * r, c: { x: p.position.x, y: p.position.y }, unit: 0.5 * r * r }
    }
    const verts = partPolygon(p)
    return { area: polygonArea(verts), c: polygonCentroid(verts), unit: shapeInertia({ type: 'polygon', points: verts }, 1) }
  })
  let area = 0, cx = 0, cy = 0
  for (const q of parts) { area += q.area; cx += q.area * q.c.x; cy += q.area * q.c.y }
  const centroid = area > 0 ? { x: cx / area, y: cy / area } : { x: 0, y: 0 }
  let inertia = 0
  for (const q of parts) {
    const dx = q.c.x - centroid.x, dy = q.c.y - centroid.y
    inertia += (area > 0 ? mass * q.area / area : 0) * (q.unit + dx * dx + dy * dy)
  }
  return { area, centroid, inertia }
}

/** Outward unit normals of the edges of a counter-clockwise polygon. */
function edgeNormals(verts: Vec2[]): Vec2[] {
  const m = verts.length
  return verts.map((v, i) => { const e = sub(verts[(i + 1) % m], v), l = length(e); return l > 0 ? { x: e.y / l, y: -e.x / l } : { x: 0, y: 0 } })
}

/**
 * Convex decomposition of a simple counter-clockwise polygon (26.52, D35), as lists of vertex indices: ear clipping
 * (the first ear in the current order each time; a strictly convex corner whose triangle holds no other remaining
 * vertex), then pieces that share an edge are merged, first pair first, while the result stays convex (Hertel–Mehlhorn).
 * Deterministic: the same pieces in both engines.
 */
export function convexPieces(v: Vec2[]): number[][] {
  if (polygonIsConvex(v)) return [v.map((_, i) => i)]
  const cr = (a: number, b: number, c: number) => (v[b].x - v[a].x) * (v[c].y - v[a].y) - (v[b].y - v[a].y) * (v[c].x - v[a].x)
  const idx = v.map((_, i) => i)
  const pieces: number[][] = []
  while (idx.length > 3) {
    const k = idx.length
    let ear = -1
    for (let i = 0; i < k && ear < 0; i++) {
      const a = idx[(i + k - 1) % k], b = idx[i], c = idx[(i + 1) % k]
      if (!(cr(a, b, c) > 0)) continue
      let ok = true
      for (let j = 0; j < k && ok; j++) {
        const q = idx[j]
        if (q === a || q === b || q === c) continue
        if (cr(a, b, q) >= 0 && cr(b, c, q) >= 0 && cr(c, a, q) >= 0) ok = false
      }
      if (ok) ear = i
    }
    // A degenerate remainder (collinear vertices) has no ear: clip its first corner anyway
    if (ear < 0) ear = 0
    pieces.push([idx[(ear + k - 1) % k], idx[ear], idx[(ear + 1) % k]])
    idx.splice(ear, 1)
  }
  pieces.push(idx.slice())
  for (let merged = true; merged;) {
    merged = false
    for (let a = 0; a < pieces.length && !merged; a++) {
      for (let b = a + 1; b < pieces.length && !merged; b++) {
        const m = mergePieces(v, pieces[a], pieces[b])
        if (m) { pieces[a] = m; pieces.splice(b, 1); merged = true }
      }
    }
  }
  return pieces
}

/** Two pieces that share an edge, joined into one when the result is convex; null otherwise. */
function mergePieces(v: Vec2[], P: number[], Q: number[]): number[] | null {
  const np = P.length, nq = Q.length
  for (let s = 0; s < np; s++) {
    const u = P[s], w = P[(s + 1) % np]
    for (let t = 0; t < nq; t++) {
      if (Q[t] !== w || Q[(t + 1) % nq] !== u) continue
      // P from w round to u, then Q strictly between u and w
      const out: number[] = []
      for (let i = 1; i <= np; i++) out.push(P[(s + i) % np])
      for (let i = 2; i < nq; i++) out.push(Q[(t + i) % nq])
      return polygonIsConvex(out.map(i => v[i])) ? out : null
    }
  }
  return null
}

/** Point and face features of a counter-clockwise polygon part with its convex pieces, appended to the shape's lists. */
function addPolygonPart(out: ComplexShape, verts: Vec2[]) {
  const m = verts.length
  const normals = edgeNormals(verts)
  const base = out.pieces.length
  const pieces = convexPieces(verts)
  for (const p of pieces) { const pv = p.map(i => verts[i]); out.pieces.push({ kind: 'polygon', verts: pv, normals: edgeNormals(pv) }) }
  const pieceOfEdge = (i: number) => {
    for (let k = 0; k < pieces.length; k++) {
      const p = pieces[k]
      for (let j = 0; j < p.length; j++) if (p[j] === i && p[(j + 1) % p.length] === (i + 1) % m) return base + k
    }
    return base
  }
  const pieceOfVertex = (i: number) => { for (let k = 0; k < pieces.length; k++) if (pieces[k].includes(i)) return base + k; return base }
  for (let i = 0; i < m; i++) out.faces.push({ e0: verts[i], e1: verts[(i + 1) % m], normal: normals[i], len: length(sub(verts[(i + 1) % m], verts[i])), piece: pieceOfEdge(i) })
  for (let i = 0; i < m; i++) if (convexCorner(verts, i)) out.points.push({ local: verts[i], radius: 0, cone: { n1: normals[(i + m - 1) % m], n2: normals[i] }, piece: pieceOfVertex(i) })
  out.outline.push({ kind: 'polygon', verts, normals })
}

/** Compile a concave polygon (counter-clockwise, already centred) or a compound shape. */
function complexShape(polygon: Vec2[] | null, compound: CompoundShapeDef | null, shift: Vec2): ComplexShape {
  const out: ComplexShape = { kind: 'complex', points: [], faces: [], pieces: [], outline: [] }
  if (polygon) { addPolygonPart(out, polygon); return out }
  for (const part of compound!.parts) {
    if (part.shape.type === 'circle') {
      const center = { x: part.position.x - shift.x, y: part.position.y - shift.y }
      out.points.push({ local: center, radius: part.shape.radius, cone: null, piece: out.pieces.length })
      out.pieces.push({ kind: 'circle', center, radius: part.shape.radius })
      out.outline.push({ kind: 'circle', center, radius: part.shape.radius })
    } else addPolygonPart(out, partPolygon(part).map(v => ({ x: v.x - shift.x, y: v.y - shift.y })))
  }
  return out
}

/**
 * Outline of a shape as the solver places it in body coordinates (dynamic bodies about their centre of mass): a circle,
 * one polygon, or the parts of a concave or compound shape (for drawing and the editor).
 */
export function shapeOutline(shape: ShapeDef, dynamic: boolean): ShapePiece[] {
  const m = compileShape(shape, dynamic, [], '')
  if (m.kind === 'circle') return [{ kind: 'circle', center: { x: 0, y: 0 }, radius: m.radius }]
  if (m.kind === 'polygon') return [{ kind: 'polygon', verts: m.verts, normals: m.normals }]
  return m.outline
}

function compileShape(shape: ShapeDef, dynamic: boolean, warnings: Message[], name: string): ShapeModel {
  if (shape.type === 'circle') return { kind: 'circle', radius: shape.radius }
  if (shape.type === 'compound') {
    // 26.52 (D35): parts about the area centroid of the whole for a dynamic body
    let shift = { x: 0, y: 0 }
    if (dynamic) {
      const c = compoundMass(shape, 1).centroid
      if (Math.abs(c.x) > 1e-12 || Math.abs(c.y) > 1e-12) { warnings.push(msg('warn.compoundCentred', { body: name })); shift = c }
    }
    return complexShape(null, shape, shift)
  }
  let verts = shape.type === 'box' ? boxPolygon(shape.width, shape.height) : shape.points.map(p => ({ x: p.x, y: p.y }))
  if (polygonArea(verts) < 0) verts = verts.slice().reverse()
  if (dynamic && shape.type === 'polygon') {
    const c = polygonCentroid(verts)
    if (Math.abs(c.x) > 1e-12 || Math.abs(c.y) > 1e-12) {
      warnings.push(msg('warn.polygonCentred', { body: name }))
      verts = verts.map(p => sub(p, c))
    }
  }
  // 26.52 (D35): a concave polygon becomes a complex shape
  if (shape.type === 'polygon' && !polygonIsConvex(verts)) return complexShape(verts, null, { x: 0, y: 0 })
  const normals: Vec2[] = [], lengths: number[] = []
  for (let i = 0; i < verts.length; i++) {
    const e = sub(verts[(i + 1) % verts.length], verts[i]), l = length(e)
    lengths.push(l)
    normals.push(l > 0 ? { x: e.y / l, y: -e.x / l } : { x: 0, y: 0 })
  }
  return { kind: 'polygon', verts, normals, lengths }
}

function boundRadius(shape: ShapeModel): number {
  if (shape.kind === 'circle') return shape.radius
  let r = 0
  if (shape.kind === 'complex') {
    for (const p of shape.outline) {
      if (p.kind === 'circle') r = Math.max(r, length(p.center) + p.radius)
      else for (const v of p.verts) r = Math.max(r, length(v))
    }
    return r
  }
  for (const v of shape.verts) r = Math.max(r, length(v))
  return r
}

/** Area centroid of a compiled complex shape (its parts) in body coordinates (static bodies: their centre of attraction). */
function complexCentroid(shape: ComplexShape): Vec2 {
  let area = 0, cx = 0, cy = 0
  for (const p of shape.outline) {
    const a = p.kind === 'circle' ? Math.PI * p.radius * p.radius : polygonArea(p.verts)
    const c = p.kind === 'circle' ? p.center : polygonCentroid(p.verts)
    area += a; cx += a * c.x; cy += a * c.y
  }
  return area > 0 ? { x: cx / area, y: cy / area } : { x: 0, y: 0 }
}

/** Compile a scene into the solver model. */
export function compileModel(scene: Scene): Model {
  const warnings: Message[] = []
  const bodies: BodyModel[] = []
  const dynamic: BodyModel[] = []
  const byId = new Map<string, BodyModel>()
  for (const def of scene.bodies) {
    const isDynamic = def.kind !== 'static'
    const shape = compileShape(def.shape, isDynamic, warnings, def.name)
    const mass = isDynamic ? Math.max(def.mass, 1e-12) : 0
    const fixed = def.kind === 'particle' || def.fixedRotation
    const inertia = isDynamic ? (def.inertia ?? shapeInertia(def.shape, mass)) : 0
    const model: BodyModel = {
      global: bodies.length, index: isDynamic ? dynamic.length : -1, id: def.id, name: def.name, def,
      dynamic: isDynamic, shape, mass, inertia,
      invMass: isDynamic ? 1 / mass : 0,
      invInertia: isDynamic && !fixed && inertia > 0 ? 1 / inertia : 0,
      material: { ...def.material }, beltSpeed: def.kind === 'static' ? def.beltSpeed : 0,
      bound: boundRadius(shape), staticPos: { x: def.position.x, y: def.position.y }, staticAngle: def.angle,
      staticC: cos(def.angle), staticS: sin(def.angle),
      dragLin: isDynamic && def.drag ? Math.max(0, def.drag.linear) : 0,
      dragQuad: isDynamic && def.drag ? Math.max(0, def.drag.quadratic) : 0,
      attract: scene.settings.gravitation && def.mass > 0 ? def.mass : 0,
      gravPos: { x: def.position.x, y: def.position.y }
    }
    if (!isDynamic && shape.kind !== 'circle') {
      // Centre of attraction of a static polygon (or complex shape): its centroid in the world
      const c = shape.kind === 'polygon' ? polygonCentroid(shape.verts) : complexCentroid(shape)
      model.gravPos = { x: def.position.x + model.staticC * c.x - model.staticS * c.y, y: def.position.y + model.staticS * c.x + model.staticC * c.y }
    }
    if (def.material.muS < def.material.muK) warnings.push(msg('warn.muSBelowMuK', { body: def.name }))
    bodies.push(model)
    if (isDynamic) dynamic.push(model)
    byId.set(def.id, model)
  }
  const anchor = (a: { body: string | null; local: Vec2 }): AnchorModel => ({ body: a.body ? byId.get(a.body) ?? null : null, local: { x: a.local.x, y: a.local.y } })
  const pulleys: PulleyModel[] = scene.pulleys.map(p => {
    const carrier = p.body ? byId.get(p.body) ?? null : null
    if (carrier && !carrier.dynamic) {
      // On a static body: a fixed pulley at the transformed position
      const c = cos(carrier.staticAngle), s = sin(carrier.staticAngle)
      const position = { x: carrier.staticPos.x + c * p.position.x - s * p.position.y, y: carrier.staticPos.y + s * p.position.x + c * p.position.y }
      return { id: p.id, name: p.name, position, radius: Math.max(0, p.radius), body: null }
    }
    return { id: p.id, name: p.name, position: { ...p.position }, radius: Math.max(0, p.radius), body: carrier }
  })
  const pulleyById = new Map(pulleys.map(p => [p.id, p]))
  const switches: SwitchDef[] = [], switchForce: number[] = []
  const ropes: RopeModel[] = [], rods: RodModel[] = [], springs: SpringModel[] = [], hinges: HingeModel[] = [], forces: ForceModel[] = []
  const welds: WeldModel[] = [], sliders: SliderModel[] = [], motors: MotorModel[] = [], gears: GearModel[] = []
  const centrals: CentralModel[] = []
  const noCollide = new Set<string>()
  for (const c of scene.connectors) {
    if (c.type === 'rope') {
      const list = c.pulleys.map(p => ({ pulley: pulleyById.get(p.pulley)!, wrap: p.wrap === 'ccw' ? 1 as const : -1 as const })).filter(p => p.pulley)
      ropes.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b), pulleys: list, length: c.length ?? Number.NaN, movable: list.some(p => p.pulley.body !== null) })
    } else if (c.type === 'rod') rods.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b), length: c.length ?? Number.NaN })
    else if (c.type === 'spring') springs.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b), stiffness: c.stiffness, restLength: c.restLength ?? Number.NaN, damping: c.damping, cubic: c.cubic ?? 0, damper: false })
    else if (c.type === 'damper') springs.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b), stiffness: 0, restLength: Number.NaN, damping: c.damping, cubic: 0, damper: true })
    else if (c.type === 'weld' || c.type === 'motor') {
      if (c.type === 'weld') welds.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b), angle0: Number.NaN })
      else {
        const mode = c.mode === 'torque' ? 'torque' : 'speed'
        const maxTorque = c.maxTorque !== undefined && c.maxTorque !== null && c.maxTorque > 0 ? c.maxTorque : Infinity
        motors.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b), mode, speed: c.speed, torque: c.torque, maxTorque, limited: mode === 'speed' && Number.isFinite(maxTorque) })
      }
      if (c.a.body && c.b.body) noCollide.add(pairKey(c.a.body, c.b.body))
    } else if (c.type === 'slider') {
      const a = anchor(c.a)
      const l = Math.sqrt(c.axis.x * c.axis.x + c.axis.y * c.axis.y)
      let axis = { x: c.axis.x / l, y: c.axis.y / l }
      // On a static body (or the world) the axis is fixed in the world
      if (a.body && !a.body.dynamic) axis = { x: a.body.staticC * axis.x - a.body.staticS * axis.y, y: a.body.staticS * axis.x + a.body.staticC * axis.y }
      const lim = c.limits ?? null
      const lo = lim && lim.min !== null ? lim.min : -Infinity, hi = lim && lim.max !== null ? lim.max : Infinity
      sliders.push({ id: c.id, name: c.name, a, b: anchor(c.b), axis, free: !!c.free, angle0: Number.NaN, limited: lo > -Infinity || hi < Infinity, lo, hi, e: lim ? lim.restitution : 0 })
      if (c.a.body && c.b.body) noCollide.add(pairKey(c.a.body, c.b.body))
    } else if (c.type === 'gear') {
      const a = c.a.body ? byId.get(c.a.body) ?? null : null, b = c.b.body ? byId.get(c.b.body) ?? null : null
      gears.push({ id: c.id, name: c.name, a: a && a.dynamic ? a : null, b: b && b.dynamic ? b : null, ratio: c.ratio, offset0: Number.NaN })
      // Meshing gears overlap at their teeth: the two bodies do not collide
      if (c.a.body && c.b.body) noCollide.add(pairKey(c.a.body, c.b.body))
    }
    else if (c.type === 'hinge') {
      hinges.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b) })
      if (c.a.body && c.b.body) noCollide.add(pairKey(c.a.body, c.b.body))
    } else if (c.type === 'central') {
      const a = anchor(c.a)
      const carrier = a.body
      // A centre on a static body is fixed in the world
      if (carrier && !carrier.dynamic) a.local = { x: carrier.staticPos.x + carrier.staticC * a.local.x - carrier.staticS * a.local.y, y: carrier.staticPos.y + carrier.staticS * a.local.x + carrier.staticC * a.local.y }
      if (carrier && !carrier.dynamic) a.body = null
      const list = c.targets ? c.targets.map(id => byId.get(id)).filter((b): b is BodyModel => !!b) : dynamic
      centrals.push({ id: c.id, name: c.name, a, k: c.k, n: c.n, targets: list.filter(b => b.dynamic && b !== carrier) })
    } else if (c.type === 'force') {
      let expr: ForceModel['expr'] = null
      if (c.expr) {
        const x = compileForceExpr(c.expr.x, switches.length)
        for (const sw of x.switches) { switches.push(sw); switchForce.push(forces.length) }
        const y = compileForceExpr(c.expr.y, switches.length)
        for (const sw of y.switches) { switches.push(sw); switchForce.push(forces.length) }
        expr = { x, y }
      }
      forces.push({ id: c.id, name: c.name, a: anchor(c.a), force: { ...c.force }, expr })
    }
  }
  const g = Math.sqrt(scene.settings.gravity.x * scene.settings.gravity.x + scene.settings.gravity.y * scene.settings.gravity.y)
  let forceScale = 0
  for (const b of dynamic) forceScale += b.mass * Math.max(g, 1)
  for (const f of forces) {
    if (!f.expr) { forceScale += Math.sqrt(f.force.x * f.force.x + f.force.y * f.force.y); continue }
    // A variable force: its size at the start (exact branches)
    const body = f.a.body
    if (!body || !body.dynamic) continue
    const env = new Float64Array(ENV_SIZE)
    const d = body.def
    env[1] = d.position.x; env[2] = d.position.y; env[3] = d.velocity.x; env[4] = d.velocity.y
    env[5] = Math.sqrt(d.velocity.x * d.velocity.x + d.velocity.y * d.velocity.y); env[6] = d.angle; env[7] = body.invInertia > 0 ? d.angularVelocity : 0
    env[8] = body.mass; env[9] = g
    const fx = f.expr.x.fn(env, null), fy = f.expr.y.fn(env, null)
    const size = Math.sqrt(fx * fx + fy * fy)
    if (Number.isFinite(size)) forceScale += size
  }
  for (const s of springs) forceScale += s.stiffness * 0.1
  // 26.51: motors and gravitation add to the force scale (absent in older scenes, so their tolerances are unchanged)
  for (const m of motors) if (m.mode === 'torque') forceScale += Math.abs(m.torque)
  const G = scene.settings.gravitation ? scene.settings.gravitation.G : 0
  const attractors = bodies.filter(b => b.attract > 0)
  for (let i = 0; i < attractors.length; i++) {
    for (let j = i + 1; j < attractors.length; j++) {
      const A = attractors[i], B = attractors[j]
      if (!A.dynamic && !B.dynamic) continue
      const dx = B.gravPos.x - A.gravPos.x, dy = B.gravPos.y - A.gravPos.y
      const d2 = dx * dx + dy * dy
      const R = A.bound + B.bound, d = Math.sqrt(d2)
      if (d2 > 0) forceScale += d >= R ? G * A.attract * B.attract / d2 : G * A.attract * B.attract * d / (R * R * R)
    }
  }
  // 26.52: central fields at the start (absent in older scenes)
  for (const c of centrals) {
    let px = c.a.local.x, py = c.a.local.y
    if (c.a.body) {
      const d = c.a.body.def, cc = cos(d.angle), ss = sin(d.angle)
      px = d.position.x + cc * c.a.local.x - ss * c.a.local.y
      py = d.position.y + ss * c.a.local.x + cc * c.a.local.y
    }
    for (const t of c.targets) {
      const dx = t.def.position.x - px, dy = t.def.position.y - py
      const r = Math.sqrt(dx * dx + dy * dy)
      const f = Math.abs(centralForce(c.k, c.n, r, t.bound))
      if (Number.isFinite(f)) forceScale += f
    }
  }
  forceScale = Math.max(forceScale, 1e-6)
  let accelScale = Math.max(g, 1)
  if (G > 0 || centrals.length > 0) for (const b of dynamic) accelScale = Math.max(accelScale, forceScale * b.invMass)
  return {
    scene, settings: scene.settings, bodies, dynamic, byId, pulleys, ropes, rods, springs, hinges, forces, welds, sliders, motors, gears, centrals,
    hasLimits: sliders.some(s => s.limited), hasSlip: motors.some(m => m.limited), G, attractors,
    n: dynamic.length, noCollide, switches, switchForce, hasExpr: forces.some(f => f.expr !== null), forceScale, accelScale, warnings
  }
}

/**
 * Effective friction and restitution of a pair: the pair override, else the smaller of the two bodies' values. Rolling
 * resistance (26.52): the override's value, else the larger of the two bodies' values; present only when positive.
 */
export function pairMaterial(scene: Scene, a: BodyModel, b: BodyModel): Material {
  const rolling = Math.max(a.material.rolling ?? 0, b.material.rolling ?? 0)
  for (const p of scene.contactPairs) {
    if ((p.a === a.id && p.b === b.id) || (p.a === b.id && p.b === a.id)) {
      const r = p.rolling ?? rolling
      return r > 0 ? { muS: p.muS, muK: p.muK, restitution: p.restitution, rolling: r } : { muS: p.muS, muK: p.muK, restitution: p.restitution }
    }
  }
  const out: Material = {
    muS: Math.min(a.material.muS, b.material.muS),
    muK: Math.min(a.material.muK, b.material.muK),
    restitution: Math.min(a.material.restitution, b.material.restitution)
  }
  if (rolling > 0) out.rolling = rolling
  return out
}

/**
 * Size of the central force F(r) = k·rⁿ at distance r from the centre (26.52, D60), positive towards the centre; inside
 * the bounding radius R of the target it falls off linearly to 0 (k·Rⁿ·r/R), continuous at R.
 */
export function centralForce(k: number, n: number, r: number, R: number): number {
  if (r >= R) return k * pow(r, n)
  return R > 0 ? k * pow(R, n) * (r / R) : 0
}

/** Potential of the central force (J): k·rⁿ⁺¹/(n + 1), k·ln r for n = −1; quadratic inside R (continuous at R). */
export function centralPotential(k: number, n: number, r: number, R: number): number {
  const outer = (x: number) => (n === -1 ? k * log(x) : k * pow(x, n + 1) / (n + 1))
  if (r >= R) return outer(r)
  if (!(R > 0)) return 0
  return outer(R) + k * pow(R, n - 1) * (r * r - R * R) / 2
}
