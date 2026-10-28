/**
 * Scene document: everything the user authors. All values are SI (m, kg, s, N, rad). The document is the
 * only input of the solver; the solver never writes it.
 */
import type { Vec2 } from '../math/vec'

/** Value of the `format` field of every scene file (26.52: VeloPhi, D53). */
export const SCENE_FORMAT = 'velophi-scene'
/** Format values of older files that are still read (Verity, up to 26.51). */
export const LEGACY_SCENE_FORMATS: readonly string[] = ['verity-scene']
/** Current scene file format version; older files are migrated on load (see io.ts). */
export const SCENE_VERSION = 5
/**
 * Format version of scenes that use charges or electric / magnetic fields (26.54, D78). Other scenes are still
 * written as format 5, so their files (and fingerprints) do not change; 26.53 warns when it opens a format-6 file.
 */
export const SCENE_VERSION_FIELDS = 6
/**
 * Format version of scenes with field regions, liquids or rail loops (26.55, D90–D92). 26.54 reads format 6 without a
 * warning and would drop these settings silently; format 7 makes it warn that the file comes from a newer version.
 */
export const SCENE_VERSION_REGIONS = 7
/** Engine version written into saved scenes. */
export const ENGINE_VERSION = '26.56.0'

/** Shape of a body, in body coordinates (m). */
export type ShapeDef = PartShapeDef | CompoundShapeDef

/** A shape that can also be a part of a compound shape. */
export type PartShapeDef =
  | { type: 'circle'; radius: number }
  | { type: 'box'; width: number; height: number }
  /**
   * Simple polygon (no self-intersection), counter-clockwise, in body coordinates (for dynamic bodies relative to the
   * centre of mass). Convex up to 26.51; since 26.52 (D35) it may be concave.
   */
  | { type: 'polygon'; points: Vec2[] }

/**
 * Compound shape (26.52, D35): parts placed in body coordinates (for dynamic bodies about the centre of mass of the
 * whole, uniform density). Parts of one body never collide with each other.
 */
export interface CompoundShapeDef { type: 'compound'; parts: ShapePart[] }

/** A part of a compound shape: its shape, the position of its own origin (box and circle: centre) and its angle. */
export interface ShapePart { shape: PartShapeDef; position: Vec2; angle: number }

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
  /**
   * Rolling resistance coefficient C_rr (dimensionless, 26.52, D59): a round body rolling on a surface feels the
   * couple C_rr·N·r against its rolling. A contact uses the larger of the two bodies' values. Absent: 0.
   */
  rolling?: number
}

/**
 * Air drag on a body (26.51, D50): F = −(b + c·|v|)·v at the centre of mass, b in N·s/m (linear, Stokes) and c in
 * N·s²/m² (quadratic, Newton). The dissipated power is booked as damping in the energy ledger.
 */
export interface DragDef { linear: number; quadratic: number }

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
  /** Air drag (26.51); null or absent: none. */
  drag?: DragDef | null
  /**
   * Electric charge (C; 26.54, D78) at the centre of mass of a dynamic body, or at the centroid of a static one
   * (a fixed point charge). Absent or 0: neutral.
   */
  charge?: number
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
/** Spring with viscous damping between two anchors; F = −k·x − k₃·x³ − c·v along the spring. */
export interface SpringDef {
  id: string; name: string; type: 'spring'; a: Anchor; b: Anchor
  /** Stiffness (N/m). */
  stiffness: number
  /** Cubic stiffness k₃ (N/m³) of a nonlinear spring (26.51); 0 or absent: linear. */
  cubic?: number
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
/** Damper (dashpot, 26.51): F = −c·v along the line of its anchors, no stiffness. */
export interface DamperDef { id: string; name: string; type: 'damper'; a: Anchor; b: Anchor; damping: number }
/** Weld (26.51, D51): the anchors coincide and the relative angle of the two bodies stays as it was. */
export interface WeldDef { id: string; name: string; type: 'weld'; a: Anchor; b: Anchor }
/**
 * Slider (prismatic joint, 26.51): anchor b stays on the line through anchor a along `axis` (a direction in the
 * frame of a's body, world when a has no body). `free`: b's body may turn; otherwise the relative angle is kept.
 */
export interface SliderDef {
  id: string; name: string; type: 'slider'; a: Anchor; b: Anchor; axis: Vec2; free?: boolean
  /**
   * End stops (26.52, D58): b's displacement s = axis·(P_b − P_a) stays within [min, max] (m; null: no stop on that
   * side); hitting a stop is an impact with restitution e. Absent or null: no stops.
   */
  limits?: { min: number | null; max: number | null; restitution: number } | null
}
/**
 * Motor (26.51): a pin joint that also drives b relative to a — at constant relative angular velocity `speed`
 * (rad/s, counter-clockwise) or with constant torque `torque` (N·m on b, the reaction on a).
 */
export interface MotorDef {
  id: string; name: string; type: 'motor'; a: Anchor; b: Anchor; mode: 'speed' | 'torque'; speed: number; torque: number
  /**
   * Torque limit of a speed motor (N·m, 26.52, D58): beyond it the motor slips and drives with ±maxTorque until the
   * relative speed is back at `speed`. Absent or null: unlimited.
   */
  maxTorque?: number | null
}
/**
 * Gear or belt (26.51): ω_a + ratio·ω_b = 0 between the bodies of the two anchors (b without a body: the world,
 * i.e. a brake). Meshing gears have a positive ratio r_b/r_a; a crossed belt the same, an open belt a negative one.
 */
export interface GearDef { id: string; name: string; type: 'gear'; a: Anchor; b: Anchor; ratio: number }
/**
 * Central field (26.52, D60): every target body is pulled towards (k > 0) or pushed from (k < 0) the centre `a` by
 * F = k·rⁿ along the line to its centre of mass (n = 1: elastic, n = −2: inverse square). Inside the target's bounding
 * radius R the force falls off linearly to 0 at the centre. The potential k·rⁿ⁺¹/(n + 1) (k·ln r for n = −1) is part of
 * the mechanical energy. A centre on a dynamic body feels the reactions.
 */
export interface CentralDef {
  id: string; name: string; type: 'central'
  a: Anchor
  /** Strength (N/mⁿ); positive: attraction. */
  k: number
  /** Exponent n. */
  n: number
  /** Bodies acted on (ids); null: every dynamic body except the one carrying the centre. */
  targets: string[] | null
}
/** Any connector between two anchors (a force and a central field have only `a`). */
export type ConnectorDef = RopeDef | RodDef | SpringDef | HingeDef | ForceDef | DamperDef | WeldDef | SliderDef | MotorDef | GearDef | CentralDef

/** A connector with a single anchor (a force or a central field). */
export function singleAnchor(c: ConnectorDef): c is ForceDef | CentralDef { return c.type === 'force' || c.type === 'central' }

/** The anchors of a connector: `a`, and `b` when it has one. */
export function connectorAnchors(c: ConnectorDef): Anchor[] { return singleAnchor(c) ? [c.a] : [c.a, c.b] }

/** Teaching annotations drawn over the scene (world coordinates, m). They never affect the simulation. */
export type AnnotationDef =
  | { id: string; type: 'text'; at: Vec2; text: string; color?: string; size?: number }
  | { id: string; type: 'arrow'; from: Vec2; to: Vec2; text?: string; color?: string }
  | { id: string; type: 'ruler'; from: Vec2; to: Vec2 }
  | { id: string; type: 'angle'; vertex: Vec2; a: Vec2; b: Vec2 }

/**
 * Material override for one pair of bodies; without one, a contact uses the smaller of the two bodies' values (the
 * larger for rolling resistance).
 */
export interface ContactPairDef { a: string; b: string; muS: number; muK: number; restitution: number; rolling?: number }

/**
 * 'dopri5' (default, event-driven with the accuracy of manual §6), 'rk4' and 'euler' (fixed-step teaching
 * integrators, events still located), 'moreau' (Moreau–Jean time stepping: reduced accuracy, for scenes with
 * very many contacts), 'gauss4' (26.52, D61: two-stage Gauss–Legendre, fixed step, symplectic — the energy of a
 * conservative system stays bounded over long runs).
 */
export type IntegratorKind = 'dopri5' | 'rk4' | 'euler' | 'moreau' | 'gauss4'

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
  /**
   * Gravitation between bodies (26.51, D50): F = G·m₁m₂/r² between every pair of bodies with mass (a static body
   * attracts with its `mass` but does not move); null or absent: off.
   */
  gravitation?: { G: number } | null
  /**
   * Time at which this scene starts (s; 26.51, D52): a branch continues its parent from this moment. The
   * recording still counts from 0; the interface shows startTime + t, and variable forces see the absolute time.
   * Absent: 0.
   */
  startTime?: number
  /** Energy ledger at the start (a branch continues its parent's); absent: all zero. */
  startLedger?: StartLedgerDef | null
  /** Uniform electric field E (V/m; 26.54, D78) acting on charged bodies; null or absent: none. */
  electric?: { E: Vec2 } | null
  /** Uniform magnetic field B (T) perpendicular to the plane, positive out of the page (⊙); null or absent: none. */
  magnetic?: { B: number } | null
  /** Coulomb force between charged bodies, F = k·q₁q₂/r² (k in N·m²/C²); null or absent: off. */
  coulomb?: { k: number } | null
  /** Bounded field regions and liquids (26.55, D90, D92); absent: none. */
  regions?: RegionDef[]
  /** Rail loops (26.55, D91); absent: none. */
  railLoops?: RailLoopDef[]
}

/**
 * A region of the scene (26.55): a rectangle (centre x, y, size w × h) or a circle (radius r). A field region acts
 * on charged bodies whose centre is inside with E (V/m; alternating as E·cos(ωt + φ) when omega ≠ 0) and B (T, out of
 * the page positive); entering and leaving are events (D90). A liquid (rectangles only) has its surface at the top:
 * density (kg/m³), the bodies' thickness perpendicular to the page `depth` (m) and a drag scaled by the submerged
 * fraction (D92).
 */
export interface RegionDef {
  id: string
  name: string
  kind: 'field' | 'liquid'
  shape: 'rect' | 'circle'
  x: number; y: number; w?: number; h?: number; r?: number
  E?: Vec2; B?: number; omega?: number; phase?: number
  density?: number; depth?: number; dragLinear?: number; dragQuadratic?: number
  color?: string
}

/** A rail loop (26.55, D91): `body` slides along rails at `angle` (rad), L apart, closed by R, in a field B (T). */
export interface RailLoopDef { id: string; name: string; body: string; angle: number; L: number; R: number; B: number }

/** Coulomb constant k = 1/(4πε₀) (N·m²/C²). */
export const COULOMB_K = 8.9875517923e9

/** The scene (or one of its branches) uses charges or fields (26.54), regions or rail loops (26.55): it is written as format 6 or 7 (`sceneVersionOf`) and computed by the Rust core only (D77). */
export function usesFields(scene: Scene): boolean {
  const s = scene.settings
  return !!(s.electric || s.magnetic || s.coulomb || s.regions?.length || s.railLoops?.length || scene.bodies.some(b => !!b.charge) || scene.branches?.some(b => usesFields(b.scene)))
}

/** The scene (or one of its branches) has field regions, liquids or rail loops (26.55). */
export function usesRegions(scene: Scene): boolean {
  const s = scene.settings
  return !!(s.regions?.length || s.railLoops?.length || scene.branches?.some(b => usesRegions(b.scene)))
}

/** File format version a scene is written as: 7 with regions or rail loops, 6 with charges or fields, otherwise 5. */
export function sceneVersionOf(scene: Scene): number {
  return usesRegions(scene) ? SCENE_VERSION_REGIONS : usesFields(scene) ? SCENE_VERSION_FIELDS : SCENE_VERSION
}

/** Initial values of the energy ledger (26.51, D52). */
export interface StartLedgerDef {
  frictionHeat: number
  appliedWork: number
  damping: number
  beltWork: number
  impactLoss: number
  /** 26.55 (D90–D92): work of the field regions and of buoyancy, Joule heat of the rail loops, heat of the liquid drag. */
  fieldWork?: number; buoyancyWork?: number; jouleHeat?: number; liquidHeat?: number
  /** Sliding distance and friction heat of each contact pair, by pair key (`a|b`, sorted). */
  pairs?: Record<string, [number, number]>
}

/** The duration of a bounded run of the scene: `duration`, or `legacyDuration` when the scene is unbounded. */
export function finiteDuration(settings: Pick<SceneSettings, 'duration' | 'legacyDuration'>): number {
  return settings.duration ?? settings.legacyDuration
}

/** Initial camera of the scene: view centre (m) and zoom (px/m). */
export interface SceneView { center: Vec2; pixelsPerMeter: number }

/**
 * A branch (26.51, D52): a scene that continues its parent from time `t` with changes. Its scene is complete —
 * the state at t as initial conditions, `settings.startTime = t`, the ledger at t — so it reruns on its own.
 */
export interface BranchDef {
  id: string
  name: string
  /** Parent branch id; null: the main scene. */
  parent: string | null
  /** Time of the branch point (s, absolute). */
  t: number
  scene: Scene
}

/** A custom (expression) quantity of the scene (26.51, D41; compiled by observe/custom). */
export interface CustomQuantityDef {
  /** Identifier, unique in the scene (letters, digits, _); the quantity id is `custom.<id>`. */
  id: string
  /** Display name. */
  name: string
  /** Expression, e.g. `ek(b1) + ep(b1)`. */
  expr: string
}

/** The scene document as saved to a .velophi.json file. */
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
  /** Expression quantities (26.51, D41; see observe/custom), watched as `custom.<id>`. */
  customQuantities?: CustomQuantityDef[]
  /** Branches of this scene (26.51, D52; only on the main scene, in creation order: parents first). */
  branches?: BranchDef[]
  /** Unknown fields of newer files, kept as they are. */
  extra?: Record<string, unknown>
}
