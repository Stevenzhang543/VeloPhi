/**
 * Compiled model: the scene turned into what the solver needs (mass properties, local geometry, resolved
 * connectors, pair materials). Pure function of the scene; the scene is not modified.
 */
import type { BodyDef, Material, Scene, SceneSettings, ShapeDef } from '../scene/types'
import type { Vec2 } from '../math/vec'
import { cross, dot, length, sub } from '../math/vec'
import { cos, sin } from '../math/dmath'
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
/** Compiled shape of a body. */
export type ShapeModel = CircleShape | PolygonShape

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
/** Compiled spring; `restLength` (m) is NaN until buildSystem resolves it from the initial state. */
export interface SpringModel { id: string; name: string; a: AnchorModel; b: AnchorModel; stiffness: number; restLength: number; damping: number }
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
  /** Number of dynamic bodies. */
  n: number
  /** Body pairs that never collide (joined by a hinge). */
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
  warnings: string[]
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

function compileShape(shape: ShapeDef, dynamic: boolean, warnings: string[], name: string): ShapeModel {
  if (shape.type === 'circle') return { kind: 'circle', radius: shape.radius }
  let verts = shape.type === 'box' ? boxPolygon(shape.width, shape.height) : shape.points.map(p => ({ x: p.x, y: p.y }))
  if (polygonArea(verts) < 0) verts = verts.slice().reverse()
  if (dynamic && shape.type === 'polygon') {
    const c = polygonCentroid(verts)
    if (Math.abs(c.x) > 1e-12 || Math.abs(c.y) > 1e-12) {
      warnings.push(`${name}: polygon points are taken relative to its centre of mass`)
      verts = verts.map(p => sub(p, c))
    }
  }
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
  for (const v of shape.verts) r = Math.max(r, length(v))
  return r
}

/** Compile a scene into the solver model. */
export function compileModel(scene: Scene): Model {
  const warnings: string[] = []
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
      staticC: cos(def.angle), staticS: sin(def.angle)
    }
    if (def.material.muS < def.material.muK) warnings.push(`${def.name}: μs < μk`)
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
  const noCollide = new Set<string>()
  for (const c of scene.connectors) {
    if (c.type === 'rope') {
      const list = c.pulleys.map(p => ({ pulley: pulleyById.get(p.pulley)!, wrap: p.wrap === 'ccw' ? 1 as const : -1 as const })).filter(p => p.pulley)
      ropes.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b), pulleys: list, length: c.length ?? Number.NaN, movable: list.some(p => p.pulley.body !== null) })
    } else if (c.type === 'rod') rods.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b), length: c.length ?? Number.NaN })
    else if (c.type === 'spring') springs.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b), stiffness: c.stiffness, restLength: c.restLength ?? Number.NaN, damping: c.damping })
    else if (c.type === 'hinge') {
      hinges.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b) })
      if (c.a.body && c.b.body) noCollide.add(pairKey(c.a.body, c.b.body))
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
  forceScale = Math.max(forceScale, 1e-6)
  const accelScale = Math.max(g, 1)
  return {
    scene, settings: scene.settings, bodies, dynamic, byId, pulleys, ropes, rods, springs, hinges, forces,
    n: dynamic.length, noCollide, switches, switchForce, hasExpr: forces.some(f => f.expr !== null), forceScale, accelScale, warnings
  }
}

/** Effective friction and restitution of a pair: the pair override, else the smaller of the two bodies' values. */
export function pairMaterial(scene: Scene, a: BodyModel, b: BodyModel): Material {
  for (const p of scene.contactPairs) {
    if ((p.a === a.id && p.b === b.id) || (p.a === b.id && p.b === a.id)) return { muS: p.muS, muK: p.muK, restitution: p.restitution }
  }
  return {
    muS: Math.min(a.material.muS, b.material.muS),
    muK: Math.min(a.material.muK, b.material.muK),
    restitution: Math.min(a.material.restitution, b.material.restitution)
  }
}
