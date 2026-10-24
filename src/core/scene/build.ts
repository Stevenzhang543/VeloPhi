/** Helpers to build scenes in code (templates, tests). All values SI. */
import type { Anchor, BodyDef, BodyKind, BodyRole, ConnectorDef, Material, PulleyDef, Scene, ShapeDef } from './types'
import { ENGINE_VERSION, SCENE_FORMAT, SCENE_VERSION } from './types'
import type { Vec2 } from '../math/vec'
import { cos, sin } from '../math/dmath'

export const DEFAULT_MATERIAL: Material = { muS: 0, muK: 0, restitution: 0 }

export function emptyScene(name = '未命名场景'): Scene {
  return {
    format: SCENE_FORMAT, version: SCENE_VERSION, dimension: 2, engine: ENGINE_VERSION,
    name, description: '',
    settings: { gravity: { x: 0, y: -9.8 }, outputStep: 1 / 600, integrator: 'dopri5', relTol: 1e-10, absTol: 1e-12, duration: 5, energyZeroY: 0 },
    bodies: [], pulleys: [], connectors: [], contactPairs: [],
    view: { center: { x: 0, y: 1 }, pixelsPerMeter: 80 },
    watch: []
  }
}

const COLORS: Record<BodyRole, string> = {
  block: '#3b82f6', ball: '#ef4444', board: '#a16207', rod: '#7c3aed', wheel: '#0d9488',
  ground: '#64748b', incline: '#64748b', wall: '#64748b', conveyor: '#475569', generic: '#2563eb'
}

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
export function resetIds() { counter = 0 }

export function nextId(scene: Scene, prefix: string): string {
  const used = new Set<string>([...scene.bodies.map(b => b.id), ...scene.connectors.map(c => c.id), ...scene.pulleys.map(p => p.id)])
  let k = used.size + 1
  while (used.has(`${prefix}${k}`)) k++
  counter++
  return `${prefix}${k}`
}

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
  // vertices CCW: bottom-left, bottom-right, top-left (slope from top-left down to bottom-right)
  const pts = [{ x: x0, y: y0 }, { x: x0 + o.base, y: y0 }, { x: x0, y: y0 + h }]
  return addBody(scene, { id: o.id, name: o.name ?? '斜面', kind: 'static', role: o.role ?? 'incline', shape: { type: 'polygon', points: pts }, position: { x: 0, y: 0 }, material: o.material, beltSpeed: o.beltSpeed })
}

/** Position of a box of size w×h resting on the slope of addIncline at distance s (along the slope, from the top). */
export function onIncline(angle: number, base: number, s: number, w: number, hgt: number, x0 = 0, y0 = 0): { position: Vec2; angle: number } {
  const H = base * sin(angle) / cos(angle)
  const c = cos(angle), sn = sin(angle)
  // slope direction (downhill) d = (c, −s), outward normal nrm = (s, c)
  const px = x0 + c * s, py = y0 + H - sn * s
  return { position: { x: px + c * (w / 2) + sn * (hgt / 2), y: py - sn * (w / 2) + c * (hgt / 2) }, angle: -angle }
}

export function anchor(body: BodyDef | null, local: Vec2 = { x: 0, y: 0 }): Anchor { return { body: body ? body.id : null, local: { ...local } } }

export function addConnector<T extends ConnectorDef>(scene: Scene, c: Omit<T, 'id'> & { id?: string }): T {
  const full = { ...c, id: c.id ?? nextId(scene, c.type === 'force' ? 'f' : 'c') } as T
  scene.connectors.push(full)
  return full
}

export function addPulley(scene: Scene, o: { name?: string; position: Vec2; radius: number; id?: string }): PulleyDef {
  const p: PulleyDef = { id: o.id ?? nextId(scene, 'p'), name: o.name ?? '滑轮', position: { ...o.position }, radius: o.radius }
  scene.pulleys.push(p)
  return p
}
