/**
 * Scene document: everything the user authors. All values are SI (m, kg, s, N, rad). The document is the
 * only input of the solver; the solver never writes it.
 */
import type { Vec2 } from '../math/vec'

/** Value of the `format` field of every scene file. */
export const SCENE_FORMAT = 'verity-scene'
/** Current scene file format version; older files are migrated on load (see io.ts). */
export const SCENE_VERSION = 3
/** Engine version written into saved scenes. */
export const ENGINE_VERSION = '26.50.0'

/** Shape of a body, in body coordinates (m). */
export type ShapeDef =
  | { type: 'circle'; radius: number }
  | { type: 'box'; width: number; height: number }
  /** Convex polygon, counter-clockwise, in body coordinates (for dynamic bodies relative to the centre of mass). */
  | { type: 'polygon'; points: Vec2[] }

/** Particle (translation only), rigid body, or static (immovable) body. */
export type BodyKind = 'particle' | 'rigid' | 'static'

/** What the object stands for in a textbook problem; only used for names, drawing and suggestions. */
export type BodyRole = 'block' | 'ball' | 'board' | 'rod' | 'wheel' | 'ground' | 'incline' | 'wall' | 'conveyor' | 'generic'

/** Contact material of a body. */
export interface Material {
  /** Static friction coefficient μs. */
  muS: number
  /** Kinetic friction coefficient μk. */
  muK: number
  /** Coefficient of restitution e (0 … 1). */
  restitution: number
}

/** A body as authored: shape, material and initial state. */
export interface BodyDef {
  id: string
  name: string
  kind: BodyKind
  role: BodyRole
  shape: ShapeDef
  /** Centre of mass for dynamic bodies, body origin for static ones (m). */
  position: Vec2
  /** Initial angle (rad), counter-clockwise. */
  angle: number
  /** Initial velocity of the centre of mass (m/s). */
  velocity: Vec2
  /** Initial angular velocity (rad/s), counter-clockwise. */
  angularVelocity: number
  /** Mass (kg); dynamic bodies only. */
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

/** Pulley wheel: fixed in the world or carried by a body (movable pulley). */
export interface PulleyDef {
  id: string
  name: string
  /** Axle position (m): world coordinates for a fixed pulley, body coordinates when `body` is set. */
  position: Vec2
  /** Wheel radius (m); 0 is an ideal point. */
  radius: number
  /**
   * Body carrying the axle (a movable pulley); null or absent: fixed in the world. The wheel is massless; its
   * mass, if any, belongs to the carrying body.
   */
  body?: string | null
}

/** A point on a body (local coordinates about its centre of mass / origin) or in the world (body null). */
export interface Anchor { body: string | null; local: Vec2 }

/** Inextensible rope between two anchors, optionally running over pulleys. */
export interface RopeDef {
  id: string; name: string; type: 'rope'
  a: Anchor; b: Anchor
  /** Fixed pulleys the rope runs over, in order from a to b; `cw`: the rope turns clockwise around the wheel. */
  pulleys: Array<{ pulley: string; wrap: 'cw' | 'ccw' }>
  /** Rope length (m); null: the initial path length (taut). */
  length: number | null
}
/** Rigid rod (distance constraint) between two anchors; `length` (m), null: the initial distance. */
export interface RodDef { id: string; name: string; type: 'rod'; a: Anchor; b: Anchor; length: number | null }
/** Linear spring with viscous damping between two anchors. */
export interface SpringDef {
  id: string; name: string; type: 'spring'; a: Anchor; b: Anchor
  /** Stiffness (N/m). */
  stiffness: number
  /** Rest length (m); null: the initial distance. */
  restLength: number | null
  /** Damping coefficient (N·s/m). */
  damping: number
}
/** Pin joint: the two anchors coincide. */
export interface HingeDef { id: string; name: string; type: 'hinge'; a: Anchor; b: Anchor }
/** Applied force on an anchor point, constant or given by expressions. */
export interface ForceDef {
  id: string; name: string; type: 'force'
  a: Anchor
  /** Constant force in world coordinates (N); used when `expr` is null or absent. */
  force: Vec2
  /**
   * Variable force: world components as expressions of time and the state of the body (SI), for example
   * `10*sin(2*pi*t)`. See `core/solver/forceExpr.ts` for the variables and functions.
   */
  expr?: { x: string; y: string } | null
}
/** Any connector between two anchors (a force has only `a`). */
export type ConnectorDef = RopeDef | RodDef | SpringDef | HingeDef | ForceDef

/** Teaching annotations drawn over the scene (world coordinates, m). They never affect the simulation. */
export type AnnotationDef =
  | { id: string; type: 'text'; at: Vec2; text: string; color?: string; size?: number }
  | { id: string; type: 'arrow'; from: Vec2; to: Vec2; text?: string; color?: string }
  | { id: string; type: 'ruler'; from: Vec2; to: Vec2 }
  | { id: string; type: 'angle'; vertex: Vec2; a: Vec2; b: Vec2 }

/** Material override for one pair of bodies; without one, a contact uses the smaller of the two bodies' values. */
export interface ContactPairDef { a: string; b: string; muS: number; muK: number; restitution: number }

/**
 * 'dopri5' (default, event-driven with the accuracy of manual §6), 'rk4' and 'euler' (fixed-step teaching
 * integrators, events still located), 'moreau' (Moreau–Jean time stepping: reduced accuracy, for scenes with
 * very many contacts).
 */
export type IntegratorKind = 'dopri5' | 'rk4' | 'euler' | 'moreau'

/**
 * Kind of state change after which a run may stop (`SceneSettings.stopAt`): a sliding pair reaches common
 * velocity and sticks, a sticking pair starts to slide, a contact opens (lift-off or sliding off an edge), a new
 * contact without an impact or with one, an impact, a rope goes slack or becomes taut.
 */
export type StopKind = 'stick' | 'slip' | 'separate' | 'touch' | 'impact' | 'slack' | 'taut'

/** All stop kinds, in the order the interface lists them. */
export const STOP_KINDS: readonly StopKind[] = ['stick', 'slip', 'separate', 'touch', 'impact', 'slack', 'taut']

/** Stop `after` seconds after the first event with a change of kind `on` (see core/solver/simulation.ts). */
export interface StopAtDef { on: StopKind; after: number }

/** Longest finite duration and stop delay a scene may ask for (s). */
export const MAX_DURATION = 3600

/** Global simulation settings of a scene. */
export interface SceneSettings {
  /** Gravitational acceleration (m/s²). */
  gravity: Vec2
  /** Recording interval Δt (s); also the largest step of the adaptive integrator and the step of the fixed ones. */
  outputStep: number
  integrator: IntegratorKind
  /** Relative error tolerance of the adaptive integrator. */
  relTol: number
  /** Absolute error tolerance of the adaptive integrator. */
  absTol: number
  /**
   * Simulated time (s); null: unbounded — the run is computed on demand from t = 0 until it is stopped (by the
   * user, `stopAt` or permanent rest). New scenes and templates are unbounded; files of format 1 and 2 keep their
   * number.
   */
  duration: number | null
  /** Optional stop condition: end the run `after` seconds after the first event of a kind; null: none. */
  stopAt?: StopAtDef | null
  /**
   * Finite length (s) used wherever a bounded run is required while `duration` is null: parameter sweeps,
   * predictions, tests and `simulate()`. Templates keep their 26.49 duration here; format 1 and 2 files copy
   * their duration.
   */
  legacyDuration: number
  /** Height of zero gravitational potential energy (m). */
  energyZeroY: number
}

/** The duration of a bounded run of the scene: `duration`, or `legacyDuration` when the scene is unbounded. */
export function finiteDuration(settings: Pick<SceneSettings, 'duration' | 'legacyDuration'>): number {
  return settings.duration ?? settings.legacyDuration
}

/** Initial camera of the scene: view centre (m) and zoom (px/m). */
export interface SceneView { center: Vec2; pixelsPerMeter: number }

/** The scene document as saved to a .verity.json file. */
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
  /** Text, arrows and measurements placed by the teacher. */
  annotations: AnnotationDef[]
  /** Unknown fields of newer files, kept as they are. */
  extra?: Record<string, unknown>
}
