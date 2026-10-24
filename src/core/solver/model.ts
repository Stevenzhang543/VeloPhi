/**
 * Compiled model: the scene turned into what the solver needs (mass properties, local geometry, resolved
 * connectors, pair materials). Pure function of the scene; the scene is not modified.
 */
import type { BodyDef, Material, Scene, SceneSettings, ShapeDef } from '../scene/types'
import type { Vec2 } from '../math/vec'
import { cross, dot, length, sub } from '../math/vec'

export interface CircleShape { kind: 'circle'; radius: number }
export interface PolygonShape {
  kind: 'polygon'
  /** Counter-clockwise vertices in body coordinates. */
  verts: Vec2[]
  /** Outward unit normal of edge i (verts[i] → verts[i+1]). */
  normals: Vec2[]
  lengths: number[]
}
export type ShapeModel = CircleShape | PolygonShape

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
  mass: number
  inertia: number
  invMass: number
  invInertia: number
  material: Material
  beltSpeed: number
  /** Radius of a circle around the body origin containing the shape (broad phase). */
  bound: number
  /** Pose of a static body. */
  staticPos: Vec2
  staticAngle: number
}

export interface AnchorModel { body: BodyModel | null; local: Vec2 }

export interface PulleyModel { id: string; name: string; position: Vec2; radius: number }

export interface RopeModel {
  id: string; name: string; a: AnchorModel; b: AnchorModel
  pulleys: Array<{ pulley: PulleyModel; wrap: 1 | -1 }>
  /** Resolved rope length (m). */
  length: number
}
export interface RodModel { id: string; name: string; a: AnchorModel; b: AnchorModel; length: number }
export interface SpringModel { id: string; name: string; a: AnchorModel; b: AnchorModel; stiffness: number; restLength: number; damping: number }
export interface HingeModel { id: string; name: string; a: AnchorModel; b: AnchorModel }
export interface ForceModel { id: string; name: string; a: AnchorModel; force: Vec2 }

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
  /** Typical force (N) and acceleration (m/s²) scales for tolerances. */
  forceScale: number
  accelScale: number
  warnings: string[]
}

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
      bound: boundRadius(shape), staticPos: { x: def.position.x, y: def.position.y }, staticAngle: def.angle
    }
    if (def.material.muS < def.material.muK) warnings.push(`${def.name}: μs < μk`)
    bodies.push(model)
    if (isDynamic) dynamic.push(model)
    byId.set(def.id, model)
  }
  const anchor = (a: { body: string | null; local: Vec2 }): AnchorModel => ({ body: a.body ? byId.get(a.body) ?? null : null, local: { x: a.local.x, y: a.local.y } })
  const pulleys: PulleyModel[] = scene.pulleys.map(p => ({ id: p.id, name: p.name, position: { ...p.position }, radius: Math.max(0, p.radius) }))
  const pulleyById = new Map(pulleys.map(p => [p.id, p]))
  const ropes: RopeModel[] = [], rods: RodModel[] = [], springs: SpringModel[] = [], hinges: HingeModel[] = [], forces: ForceModel[] = []
  const noCollide = new Set<string>()
  for (const c of scene.connectors) {
    if (c.type === 'rope') {
      ropes.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b), pulleys: c.pulleys.map(p => ({ pulley: pulleyById.get(p.pulley)!, wrap: p.wrap === 'ccw' ? 1 as const : -1 as const })).filter(p => p.pulley), length: c.length ?? Number.NaN })
    } else if (c.type === 'rod') rods.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b), length: c.length ?? Number.NaN })
    else if (c.type === 'spring') springs.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b), stiffness: c.stiffness, restLength: c.restLength ?? Number.NaN, damping: c.damping })
    else if (c.type === 'hinge') {
      hinges.push({ id: c.id, name: c.name, a: anchor(c.a), b: anchor(c.b) })
      if (c.a.body && c.b.body) noCollide.add(pairKey(c.a.body, c.b.body))
    } else if (c.type === 'force') forces.push({ id: c.id, name: c.name, a: anchor(c.a), force: { ...c.force } })
  }
  const g = Math.sqrt(scene.settings.gravity.x * scene.settings.gravity.x + scene.settings.gravity.y * scene.settings.gravity.y)
  let forceScale = 0
  for (const b of dynamic) forceScale += b.mass * Math.max(g, 1)
  for (const f of forces) forceScale += Math.sqrt(f.force.x * f.force.x + f.force.y * f.force.y)
  for (const s of springs) forceScale += s.stiffness * 0.1
  forceScale = Math.max(forceScale, 1e-6)
  const accelScale = Math.max(g, 1)
  return {
    scene, settings: scene.settings, bodies, dynamic, byId, pulleys, ropes, rods, springs, hinges, forces,
    n: dynamic.length, noCollide, forceScale, accelScale, warnings
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
