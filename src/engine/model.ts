/**
 * The compiled model as the interface sees it (26.53, D65): a descriptor made by the Rust core (`modelInfo`), with
 * the indices linked into objects so drawing and editing code can follow `rope.a.body`, `model.byId` and
 * `body.def` as before. Pure data: every number in it was computed in Rust; nothing here evaluates kinematics or
 * dynamics.
 */
import type { Message } from '../i18n/message'
import type { BodyDef, Material, Scene, SceneSettings } from '../core/scene/types'
import type { Vec2 } from '../core/math/vec'

/** Compiled circle (m). */
export interface CircleShape { kind: 'circle'; radius: number }
/** Compiled convex polygon: counter-clockwise vertices, outward edge normals and edge lengths. */
export interface PolygonShape { kind: 'polygon'; verts: Vec2[]; normals: Vec2[]; lengths: number[] }
/** A convex piece (or a part outline) of a complex shape. */
export type ShapePiece =
  | { kind: 'circle'; center: Vec2; radius: number }
  | { kind: 'polygon'; verts: Vec2[]; normals: Vec2[] }
/** An arc piece as the core describes it (26.59 fix 3, D193): annular sector about `center` from `start` over `sweep`. */
export interface ArcPiece { kind: 'arc'; center: Vec2; rIn: number; rOut: number; start: number; sweep: number }
/**
 * Concave polygon, compound shape or arc: its convex pieces and the outlines of its parts (drawing). Arc outlines are
 * handed to the drawing code as polygon loops (expandArcs); `arcs` keeps them exact.
 */
export interface ComplexShape { kind: 'complex'; pieces: Array<ShapePiece | ArcPiece>; outline: ShapePiece[]; arcs?: ArcPiece[] }
export type ShapeModel = CircleShape | PolygonShape | ComplexShape

/** A body of the compiled model. */
export interface BodyModel {
  /** Index in `Model.bodies`. */
  global: number
  /** Index among dynamic bodies (state slot), −1 for static bodies. */
  index: number
  id: string
  name: string
  /** The scene's definition of the body (colour, role …). */
  def: BodyDef
  dynamic: boolean
  shape: ShapeModel
  mass: number
  inertia: number
  invMass: number
  invInertia: number
  material: Material
  beltSpeed: number
  bound: number
  staticPos: Vec2
  staticAngle: number
  dragLin: number
  dragQuad: number
  attract: number
  gravPos: Vec2
  /** Electric charge (C; 26.54); absent: neutral. */
  charge?: number
}

export interface AnchorModel { body: BodyModel | null; local: Vec2 }
export interface PulleyModel { id: string; name: string; position: Vec2; radius: number; body: BodyModel | null }
export interface RopeModel { id: string; name: string; a: AnchorModel; b: AnchorModel; pulleys: Array<{ pulley: PulleyModel; wrap: 1 | -1 }>; length: number; movable: boolean; /** 26.63 (D231): tension limit (N); null: never breaks. */ maxTension: number | null }
export interface RodModel { id: string; name: string; a: AnchorModel; b: AnchorModel; length: number }
/** `pushOnly` (26.60 r2, D208): not fastened to b — it only pushes, and b leaves its free end at the rest length. */
export interface SpringModel { id: string; name: string; a: AnchorModel; b: AnchorModel; stiffness: number; restLength: number; damping: number; cubic: number; damper: boolean; pushOnly: boolean }
export interface WeldModel { id: string; name: string; a: AnchorModel; b: AnchorModel; angle0: number }
export interface SliderModel { id: string; name: string; a: AnchorModel; b: AnchorModel; axis: Vec2; free: boolean; angle0: number; limited: boolean; lo: number; hi: number; e: number }
export interface MotorModel { id: string; name: string; a: AnchorModel; b: AnchorModel; mode: 'speed' | 'torque'; speed: number; torque: number; maxTorque: number; limited: boolean }
export interface CentralModel { id: string; name: string; a: AnchorModel; k: number; n: number; targets: BodyModel[] }
export interface GearModel { id: string; name: string; a: BodyModel | null; b: BodyModel | null; ratio: number; offset0: number }
export interface HingeModel { id: string; name: string; a: AnchorModel; b: AnchorModel }
/** Applied force: `force` is the constant value; `expr` marks a variable force (its value comes with each frame). */
export interface ForceModel { id: string; name: string; a: AnchorModel; force: Vec2; expr: boolean }

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
  welds: WeldModel[]
  sliders: SliderModel[]
  motors: MotorModel[]
  gears: GearModel[]
  centrals: CentralModel[]
  hasLimits: boolean
  hasSlip: boolean
  G: number
  attractors: BodyModel[]
  n: number
  noCollide: Set<string>
  hasExpr: boolean
  forceScale: number
  accelScale: number
  warnings: Message[]
  /**
   * Charges in fields (26.54, D78): the uniform fields, the Coulomb constant (0: off) and the charged bodies;
   * null when no charged body feels a field or another charge.
   */
  electric: { E: Vec2; B: number; k: number; charged: BodyModel[] } | null
}

/** A pair of bodies that can touch, with its effective material. */
export interface PairInfo { index: number; key: string; X: BodyModel; Y: BodyModel; material: Material }

/** The model plus the layout of the state vector. */
export interface System {
  model: Model
  n: number
  pairs: PairInfo[]
  pairByKey: Map<string, PairInfo>
  auxBase: number
  /** Index of the time entry, −1 without one. */
  timeSlot: number
  size: number
}

/** Ledger offsets after `auxBase` (dynamics.rs). */
export const AUX_HEAT = 0, AUX_WORK = 1, AUX_DAMP = 2, AUX_BELT = 3, AUX_FIXED = 4

/** Order-independent key of a body pair. */
export function pairKey(a: string, b: string): string { return a < b ? `${a}|${b}` : `${b}|${a}` }

type Raw = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Polygon loops that draw an arc (26.59 fix 3): one closed loop (outer side forwards, inner side back) for an open
 * arc, an outer loop and a reversed inner loop (a hole) for a full ring; at most 2° per segment.
 */
export function arcLoops(p: ArcPiece): Array<{ kind: 'polygon'; verts: Vec2[]; normals: Vec2[] }> {
  const ring = p.sweep >= 2 * Math.PI - 1e-9
  const n = Math.max(2, Math.ceil(p.sweep / (Math.PI / 90)))
  const at = (k: number, r: number) => { const t = p.start + (p.sweep * k) / n; return { x: p.center.x + r * Math.cos(t), y: p.center.y + r * Math.sin(t) } }
  const loop = (verts: Vec2[]) => ({
    kind: 'polygon' as const, verts,
    normals: verts.map((a, i) => { const b = verts[(i + 1) % verts.length], ex = b.x - a.x, ey = b.y - a.y, l = Math.hypot(ex, ey) || 1; return { x: ey / l, y: -ex / l } })
  })
  if (ring) {
    const outer: Vec2[] = [], inner: Vec2[] = []
    for (let k = 0; k < n; k++) { outer.push(at(k, p.rOut)); inner.push(at(n - k, p.rIn)) }
    return [loop(outer), loop(inner)]
  }
  const verts: Vec2[] = []
  for (let k = 0; k <= n; k++) verts.push(at(k, p.rOut))
  for (let k = n; k >= 0; k--) verts.push(at(k, p.rIn))
  return [loop(verts)]
}

/** Outline pieces with every arc turned into its polygon loops (drawing, bounds, hit areas). */
export function expandArcs(pieces: Array<ShapePiece | ArcPiece>): ShapePiece[] {
  const out: ShapePiece[] = []
  for (const p of pieces) { if (p.kind === 'arc') out.push(...arcLoops(p)); else out.push(p) }
  return out
}

/** Link the descriptor of `modelInfo` into objects; `scene` supplies the body definitions and settings. */
export function linkSystem(info: Raw, scene: Scene): System {
  const defs = new Map(scene.bodies.map(b => [b.id, b]))
  const bodies: BodyModel[] = (info.bodies as Raw[]).map(b => {
    // 26.59 fix 3: arc outlines become polygon loops for drawing; the exact arcs stay in `arcs`
    const shape = b.shape?.kind === 'complex' && (b.shape.outline as Raw[]).some(p => p.kind === 'arc')
      ? { ...b.shape, outline: expandArcs(b.shape.outline), arcs: (b.shape.outline as Raw[]).filter(p => p.kind === 'arc') }
      : b.shape
    return { ...b, shape, def: defs.get(b.id) ?? (b as unknown as BodyDef) } as BodyModel
  })
  const body = (g: number | null | undefined) => (g === null || g === undefined ? null : bodies[g])
  const anchor = (a: Raw): AnchorModel => ({ body: body(a.body), local: a.local })
  const pulleys: PulleyModel[] = (info.pulleys as Raw[]).map(p => ({ id: p.id, name: p.name, position: p.position, radius: p.radius, body: body(p.body) }))
  const two = <T>(list: Raw[], extra: (c: Raw) => T) => list.map(c => ({ id: c.id as string, name: c.name as string, a: anchor(c.a), b: anchor(c.b), ...extra(c) }))
  const model: Model = {
    scene, settings: scene.settings, bodies,
    dynamic: (info.dynamic as number[]).map(g => bodies[g]),
    byId: new Map(bodies.map(b => [b.id, b])),
    pulleys,
    ropes: two(info.ropes, c => ({ pulleys: (c.pulleys as Raw[]).map(p => ({ pulley: pulleys[p.pulley], wrap: (p.wrap < 0 ? -1 : 1) as 1 | -1 })), length: c.length, movable: c.movable, maxTension: typeof c.maxTension === 'number' ? c.maxTension : null })),
    rods: two(info.rods, c => ({ length: c.length })),
    springs: two(info.springs, c => ({ stiffness: c.stiffness, restLength: c.restLength, damping: c.damping, cubic: c.cubic, damper: c.damper, pushOnly: c.pushOnly === true })),
    hinges: two(info.hinges, () => ({})),
    forces: (info.forces as Raw[]).map(f => ({ id: f.id, name: f.name, a: anchor(f.a), force: f.force, expr: !!f.expr })),
    welds: two(info.welds, c => ({ angle0: c.angle0 })),
    sliders: two(info.sliders, c => ({ axis: c.axis, free: c.free, angle0: c.angle0, limited: c.limited, lo: c.lo, hi: c.hi, e: c.e })),
    motors: two(info.motors, c => ({ mode: c.mode, speed: c.speed, torque: c.torque, maxTorque: c.maxTorque, limited: c.limited })),
    gears: (info.gears as Raw[]).map(g => ({ id: g.id, name: g.name, a: body(g.a), b: body(g.b), ratio: g.ratio, offset0: g.offset0 })),
    centrals: (info.centrals as Raw[]).map(c => ({ id: c.id, name: c.name, a: anchor(c.a), k: c.k, n: c.n, targets: (c.targets as number[]).map(g => bodies[g]) })),
    hasLimits: info.hasLimits, hasSlip: info.hasSlip, G: info.G,
    attractors: (info.attractors as number[]).map(g => bodies[g]),
    n: info.n, noCollide: new Set(info.noCollide as string[]), hasExpr: info.hasExpr, forceScale: info.forceScale, accelScale: info.accelScale,
    warnings: info.warnings as Message[],
    electric: info.electric ? { E: info.electric.E, B: info.electric.B, k: info.electric.k, charged: (info.electric.charged as number[]).map(g => bodies[g]) } : null
  }
  const pairs: PairInfo[] = (info.pairs as Raw[]).map(p => ({ index: p.index, key: p.key, X: bodies[p.X], Y: bodies[p.Y], material: p.material }))
  return { model, n: info.n, pairs, pairByKey: new Map(pairs.map(p => [p.key, p])), auxBase: info.auxBase, timeSlot: info.timeSlot, size: info.size }
}
