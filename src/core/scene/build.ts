/** Helpers to build scenes in code (templates, tests). All values SI; the default gravity is set here. */
import type { Anchor, BodyDef, BodyKind, BodyRole, ConnectorDef, Material, PulleyDef, Scene, ShapeDef } from './types'
import { ENGINE_VERSION, SCENE_FORMAT, SCENE_VERSION } from './types'
import type { Vec2 } from '../math/vec'
import { cos, sin } from '../math/dmath'

/** Frictionless, perfectly inelastic material (μs = μk = e = 0). */
export const DEFAULT_MATERIAL: Material = { muS: 0, muK: 0, restitution: 0 }

/** Magnitude of the default gravity (m/s²) for new scenes and template parameters. */
let defaultG = 9.8

/** Set the default gravity magnitude used by `emptyScene` and the templates (the app's default-gravity setting). */
export function setDefaultGravity(g: number) {
  if (!(Number.isFinite(g) && g >= 0)) throw new Error('重力加速度应为非负数')
  defaultG = g
}

/** The default gravity magnitude (m/s²). */
export function defaultGravity(): number { return defaultG }

/** A new scene with the default settings and nothing in it. */
export function emptyScene(name = '未命名场景'): Scene {
  return {
    format: SCENE_FORMAT, version: SCENE_VERSION, dimension: 2, engine: ENGINE_VERSION,
    name, description: '',
    settings: { gravity: { x: 0, y: -defaultG }, outputStep: 1 / 600, integrator: 'dopri5', relTol: 1e-10, absTol: 1e-12, duration: 5, energyZeroY: 0 },
    bodies: [], pulleys: [], connectors: [], contactPairs: [],
    view: { center: { x: 0, y: 1 }, pixelsPerMeter: 80 },
    watch: [],
    annotations: []
  }
}

const COLORS: Record<BodyRole, string> = {
  block: '#3b82f6', ball: '#ef4444', board: '#a16207', rod: '#7c3aed', wheel: '#0d9488',
  ground: '#64748b', incline: '#64748b', wall: '#64748b', conveyor: '#475569', generic: '#2563eb'
}

/** Options of `addBody`; omitted fields get the defaults of a new body. */
export interface BodyOptions {
  id?: string
  name: string
  kind?: BodyKind
  role?: BodyRole
  shape: ShapeDef
  position: Vec2
  angle?: number
  velocity?: Vec2
  angularVelocity?: number
  mass?: number
  inertia?: number | null
  fixedRotation?: boolean
  material?: Partial<Material>
  beltSpeed?: number
  color?: string
}

let counter = 0
/** Reset the internal id counter (tests); ids come from the scene's used ids, so this does not change them. */
export function resetIds() { counter = 0 }

/** The first free id `${prefix}${k}`, trying k from the number of used ids + 1 upwards. */
export function nextId(scene: Scene, prefix: string): string {
  const used = new Set<string>([...scene.bodies.map(b => b.id), ...scene.connectors.map(c => c.id), ...scene.pulleys.map(p => p.id)])
  let k = used.size + 1
  while (used.has(`${prefix}${k}`)) k++
  counter++
  return `${prefix}${k}`
}

/** Add a body; omitted options default to a rigid 1 kg body coloured by its role. */
export function addBody(scene: Scene, o: BodyOptions): BodyDef {
  const kind = o.kind ?? 'rigid'
  const role = o.role ?? (kind === 'static' ? 'ground' : 'block')
  const body: BodyDef = {
    id: o.id ?? nextId(scene, kind === 'static' ? 's' : 'b'),
    name: o.name, kind, role, shape: o.shape,
    position: { ...o.position }, angle: o.angle ?? 0,
    velocity: { ...(o.velocity ?? { x: 0, y: 0 }) }, angularVelocity: o.angularVelocity ?? 0,
    mass: kind === 'static' ? 0 : (o.mass ?? 1), inertia: o.inertia ?? null,
    fixedRotation: o.fixedRotation ?? false,
    material: { ...DEFAULT_MATERIAL, ...(o.material ?? {}) },
    beltSpeed: o.beltSpeed ?? 0,
    color: o.color ?? COLORS[role]
  }
  scene.bodies.push(body)
  return body
}

/** Flat ground: a static box whose top surface is at y = top. */
export function addGround(scene: Scene, o: { name?: string; top?: number; left?: number; right?: number; thickness?: number; material?: Partial<Material>; id?: string; beltSpeed?: number; role?: BodyRole }): BodyDef {
  const left = o.left ?? -10, right = o.right ?? 10, top = o.top ?? 0, th = o.thickness ?? 0.4
  return addBody(scene, {
    id: o.id, name: o.name ?? '地面', kind: 'static', role: o.role ?? 'ground',
    shape: { type: 'box', width: right - left, height: th },
    position: { x: (left + right) / 2, y: top - th / 2 }, material: o.material, beltSpeed: o.beltSpeed
  })
}

/**
 * Incline: a static right triangle with the slope rising to the left. The slope makes angle θ with the
 * horizontal; base from x0 to x0 + base at height y0.
 */
export function addIncline(scene: Scene, o: { name?: string; angle: number; base: number; x0?: number; y0?: number; material?: Partial<Material>; id?: string; beltSpeed?: number; role?: BodyRole }): BodyDef {
  const x0 = o.x0 ?? 0, y0 = o.y0 ?? 0
  const h = o.base * sin(o.angle) / cos(o.angle)
  // Vertices CCW: bottom-left, bottom-right, top-left (slope from top-left down to bottom-right)
  const pts = [{ x: x0, y: y0 }, { x: x0 + o.base, y: y0 }, { x: x0, y: y0 + h }]
  return addBody(scene, { id: o.id, name: o.name ?? '斜面', kind: 'static', role: o.role ?? 'incline', shape: { type: 'polygon', points: pts }, position: { x: 0, y: 0 }, material: o.material, beltSpeed: o.beltSpeed })
}

/** Position of a box of size w×h resting on the slope of addIncline at distance s (along the slope, from the top). */
export function onIncline(angle: number, base: number, s: number, w: number, hgt: number, x0 = 0, y0 = 0): { position: Vec2; angle: number } {
  const H = base * sin(angle) / cos(angle)
  const c = cos(angle), sn = sin(angle)
  // Slope direction (downhill) d = (c, −sn), outward normal (sn, c)
  const px = x0 + c * s, py = y0 + H - sn * s
  return { position: { x: px + c * (w / 2) + sn * (hgt / 2), y: py - sn * (w / 2) + c * (hgt / 2) }, angle: -angle }
}

/** Anchor on a body (local coordinates, m) or, for a null body, in the world. */
export function anchor(body: BodyDef | null, local: Vec2 = { x: 0, y: 0 }): Anchor { return { body: body ? body.id : null, local: { ...local } } }

/** Add a connector, generating an id when none is given. */
export function addConnector<T extends ConnectorDef>(scene: Scene, c: Omit<T, 'id'> & { id?: string }): T {
  const full = { ...c, id: c.id ?? nextId(scene, c.type === 'force' ? 'f' : 'c') } as T
  scene.connectors.push(full)
  return full
}

/** Add a pulley. With `body` it is a movable pulley and `position` is the axle in that body's coordinates. */
export function addPulley(scene: Scene, o: { name?: string; position: Vec2; radius: number; id?: string; body?: string | null }): PulleyDef {
  const p: PulleyDef = { id: o.id ?? nextId(scene, 'p'), name: o.name ?? '滑轮', position: { ...o.position }, radius: o.radius }
  if (o.body) p.body = o.body
  scene.pulleys.push(p)
  return p
}
