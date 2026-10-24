/**
 * Scene document: everything the user authors. All values are SI (m, kg, s, N, rad). The document is the
 * only input of the solver; the solver never writes it.
 */
import type { Vec2 } from '../math/vec'

export const SCENE_FORMAT = 'verity-scene'
export const SCENE_VERSION = 1
export const ENGINE_VERSION = '26.48.0'

export type ShapeDef =
  | { type: 'circle'; radius: number }
  | { type: 'box'; width: number; height: number }
  /** Convex polygon, counter-clockwise, in body coordinates (for dynamic bodies relative to the centre of mass). */
  | { type: 'polygon'; points: Vec2[] }

export type BodyKind = 'particle' | 'rigid' | 'static'

/** What the object stands for in a textbook problem; only used for names, drawing and suggestions. */
export type BodyRole = 'block' | 'ball' | 'board' | 'rod' | 'wheel' | 'ground' | 'incline' | 'wall' | 'conveyor' | 'generic'

export interface Material {
  /** Static friction coefficient μs. */
  muS: number
  /** Kinetic friction coefficient μk. */
  muK: number
  /** Coefficient of restitution e (0 … 1). */
  restitution: number
}

export interface BodyDef {
  id: string
  name: string
  kind: BodyKind
  role: BodyRole
  shape: ShapeDef
  /** Centre of mass for dynamic bodies, body origin for static ones (m). */
  position: Vec2
  /** rad, counter-clockwise. */
  angle: number
  /** m/s */
  velocity: Vec2
  /** rad/s, counter-clockwise. */
  angularVelocity: number
  /** kg (dynamic bodies). */
  mass: number
  /** Moment of inertia about the centre of mass (kg·m²); null: computed for a uniform body. */
  inertia: number | null
  /** The body only translates (particles always). */
  fixedRotation: boolean
  material: Material
  /** Conveyor belt speed (m/s, static bodies): the surface runs clockwise for u > 0, so the top moves right. */
  beltSpeed: number
  color: string
}

export interface PulleyDef {
  id: string
  name: string
  /** Fixed axle position (m). */
  position: Vec2
  /** Wheel radius (m); 0 is an ideal point. */
  radius: number
}

/** A point on a body (local coordinates about its centre of mass / origin) or in the world (body null). */
export interface Anchor { body: string | null; local: Vec2 }

export interface RopeDef {
  id: string; name: string; type: 'rope'
  a: Anchor; b: Anchor
  /** Fixed pulleys the rope runs over, in order from a to b; `cw`: the rope turns clockwise around the wheel. */
  pulleys: Array<{ pulley: string; wrap: 'cw' | 'ccw' }>
  /** Rope length (m); null: the initial path length (taut). */
  length: number | null
}
export interface RodDef { id: string; name: string; type: 'rod'; a: Anchor; b: Anchor; length: number | null }
export interface SpringDef {
  id: string; name: string; type: 'spring'; a: Anchor; b: Anchor
  /** N/m */ stiffness: number
  /** m; null: the initial distance. */ restLength: number | null
  /** N·s/m */ damping: number
}
export interface HingeDef { id: string; name: string; type: 'hinge'; a: Anchor; b: Anchor }
export interface ForceDef {
  id: string; name: string; type: 'force'
  a: Anchor
  /** Constant force in world coordinates (N). */
  force: Vec2
}
export type ConnectorDef = RopeDef | RodDef | SpringDef | HingeDef | ForceDef

export interface ContactPairDef { a: string; b: string; muS: number; muK: number; restitution: number }

export type IntegratorKind = 'dopri5' | 'rk4' | 'euler'

export interface SceneSettings {
  /** m/s² */
  gravity: Vec2
  /** Recording interval Δt (s); also the largest step of the adaptive integrator and the step of the fixed ones. */
  outputStep: number
  integrator: IntegratorKind
  relTol: number
  absTol: number
  /** Simulated time (s). */
  duration: number
  /** Height of zero gravitational potential energy (m). */
  energyZeroY: number
}

export interface SceneView { center: Vec2; pixelsPerMeter: number }

export interface Scene {
  format: typeof SCENE_FORMAT
  version: number
  dimension: 2
  engine: string
  name: string
  description: string
  settings: SceneSettings
  bodies: BodyDef[]
  pulleys: PulleyDef[]
  connectors: ConnectorDef[]
  contactPairs: ContactPairDef[]
  view: SceneView
  /** Quantities in the watch panel (see observe/quantities). */
  watch: string[]
  /** Unknown fields of newer files, kept as they are. */
  extra?: Record<string, unknown>
}
