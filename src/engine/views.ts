/**
 * Views of a recording or a scene for the canvas and the teaching tools (26.53, D65): everything drawn at one
 * instant — poses, pulley axles, connector anchors, rope paths, forces with their kind and label, accelerations — and
 * the sampled data of trajectories, strobe images, motion blur, particle emitters and chart envelopes, computed in
 * the Rust core (views.rs, teaching.rs, lod.rs). The interface only maps them to the screen.
 */
import type { Message } from '../i18n/message'
import type { Vec2 } from '../core/math/vec'
import type { Recording } from './recording'
import type { EngineSession } from './session'
import type { ShapeModel } from './model'

/** Pose and velocity of a body; `th` is the angle whose cosine and sine are `c` and `s`. */
export interface Pose { x: number; y: number; c: number; s: number; vx: number; vy: number; w: number; th: number }

/** Category of a force (the free-body diagram orders and names forces by it). */
export type ForceKind = 'gravity' | 'normal' | 'limit' | 'friction' | 'tension' | 'pin' | 'spring' | 'damper' | 'drag' | 'attract' | 'central' | 'applied'
  // 26.54 (D78): electric field force qE, Lorentz force qv×B, Coulomb force
  | 'electric' | 'magnetic' | 'coulomb'
  // 26.55 (D91, D92): buoyancy, Ampère force on a rail-loop rod
  | 'buoyancy' | 'ampere'

/** A force on a body: application point (m), components (N), kind and label (a source text: G, N, f, T, F弹 …). */
export interface ForceVector { x: number; y: number; fx: number; fy: number; kind: ForceKind; label: string }

/** A rope as drawn: points (x, y pairs: A, tangent points in and out at each pulley, B), arcs (x, y, r, from, to, wrap). */
export interface RopeView { points: Float64Array; arcs: Float64Array; length: number; taut: boolean }

/** Everything the canvas draws at one instant. */
export interface FrameView {
  t: number
  /** Recorded frame at or before t (−1: a scene without a recording). */
  frame: number
  segment: number
  /** The state drawn (interpolated for display, exact for exports). */
  X: Float64Array
  /** Poses of all bodies by global index. */
  poses: Pose[]
  /** Pulley axles (x, y pairs by pulley index). */
  pulleys: Float64Array
  /**
   * Anchor points (world, m): springs, rods (ax, ay, bx, by each), sliders (ax, ay, bx, by, axis x, axis y), centrals,
   * welds, motors, hinges (x, y of the first anchor), applied forces (x, y, Fx, Fy with the current value).
   */
  anchors: { springs: Float64Array; rods: Float64Array; sliders: Float64Array; centrals: Float64Array; welds: Float64Array; motors: Float64Array; hinges: Float64Array; forces: Float64Array }
  ropes: RopeView[]
  /** Generalized accelerations (3n), null without a mode solution. */
  acc: Float64Array | null
  /** Forces on the bodies asked for, by global index. */
  forces: Map<number, ForceVector[]>
  /** Why the mode solution failed (forces and accelerations are then missing). */
  solveError: Message | null
}

/** Poses from the packed form (8 numbers per body). */
export function posesOf(p: Float64Array): Pose[] {
  const out: Pose[] = []
  for (let i = 0; i + 7 < p.length; i += 8) out.push({ x: p[i], y: p[i + 1], c: p[i + 2], s: p[i + 3], vx: p[i + 4], vy: p[i + 5], w: p[i + 6], th: p[i + 7] })
  return out
}

type Source = Recording | EngineSession
const sessionOf = (s: Source): EngineSession => ('session' in s ? s.session : s)

interface RawFrame extends Omit<FrameView, 'poses' | 'forces'> { poses: Float64Array; forces: Array<{ body: number; forces: ForceVector[] }> }

/**
 * View at time t: the display state (Hermite between frames, exact across events), or with `exact` the exact state
 * (exports); a scene session gives its initial state. `forces`: 'all', the ids of the bodies whose forces to list,
 * or none.
 */
export function frameView(src: Source, t: number, opts: { exact?: boolean; forces?: 'all' | string[] | null } = {}): FrameView {
  const r = sessionOf(src).call<RawFrame>({ op: 'frameView', t, exact: !!opts.exact, forces: opts.forces ?? null })
  return { ...r, poses: posesOf(r.poses), forces: new Map(r.forces.map(f => [f.body, f.forces])) }
}

/** Poses of all bodies at several instants (exact states, or display states) or at recorded frames. */
export function posesAt(rec: Recording, q: { times?: number[]; frames?: number[]; exact?: boolean }): Pose[][] {
  const r = rec.session.call<{ poses: Float64Array; bodies: number }>({ op: 'poses', times: q.times ?? [], frames: q.frames ?? [], exact: !!q.exact })
  const per = 8 * r.bodies
  const out: Pose[][] = []
  for (let i = 0; i + per <= r.poses.length && per > 0; i += per) out.push(posesOf(r.poses.subarray(i, i + per)))
  return out
}

/** Centre-of-mass positions of the dynamic bodies at frames from..to (every `stride`-th and the last; evicted frames skipped). */
export function positions(rec: Recording, from: number, to: number, stride: number): { frames: Float64Array; xy: Float64Array; n: number } {
  return rec.session.call({ op: 'positions', from, to, stride, cheapOnly: true })
}

/** Arrow scales (pixels per m/s, per m/s², per N) of a recording, or of a scene (from its initial velocities). */
export function vectorScalesOf(src: Source, recording: boolean): { v: number; a: number; f: number } {
  return sessionOf(src).call({ op: 'vectorScales', recording })
}

/** Particle emitters of block `block` (2 s) of a recording: packed (12 numbers each), and whether the block is final. */
export function emittersOf(rec: Recording, block: number): { emitters: Float64Array; fields: number; final: boolean } {
  return rec.session.call({ op: 'emitters', block })
}

// ---- Teaching ----

/** One force of a free-body diagram (world coordinates, N). */
export interface FbdForceData { kind: ForceKind | 'other'; label: string; sub: string; x: number; y: number; fx: number; fy: number }
/** The forces on one body at one time. */
export interface FbdRaw {
  bodyId: string; name: string; time: number; mass: number; x: number; y: number; c: number; s: number; shape: ShapeModel
  forces: FbdForceData[]; net: Vec2; ma: Vec2; incline: number | null
}
/** Free-body data of body `bodyId` at time t (null for a static or unknown body). */
export function fbdOf(rec: Recording, t: number, bodyId: string): FbdRaw | null {
  return rec.session.call<{ fbd: FbdRaw | null }>({ op: 'fbd', t, body: bodyId }).fbd
}

/** Ticker tape data (teaching/tape.ts). */
export interface TapeRaw {
  bodyId: string; name: string; direction: 'path' | 'x' | 'y'; period: number; every: number; T: number
  dots: Array<{ t: number; s: number }>; lengths: number[]; velocities: Array<{ n: number; t: number; tape: number; sim: number }>
  accel: number | null; used: number; simAccel: number | null
}
export function tapeOf(rec: Recording, o: { bodyId: string; direction: string; period: number; every: number; start: number; intervals?: number }): TapeRaw | null {
  return rec.session.call<{ tape: TapeRaw | null }>({ op: 'tape', body: o.bodyId, direction: o.direction, period: o.period, every: o.every, start: o.start, intervals: o.intervals ?? null }).tape
}

/** Area under the curve of `id` between t0 and t1 (teaching/area.ts). */
export interface AreaRaw { id: string; t0: number; t1: number; area: number; positive: number; negative: number; compareId: string | null; compare: number | null }
export function areaOf(rec: Recording, id: string, t0: number, t1: number): AreaRaw | null {
  return rec.session.call<{ area: AreaRaw | null }>({ op: 'area', id, t0, t1 }).area
}

// ---- Charts ----

/** Raw min/max envelope (render/chartLod.ts). */
export interface EnvelopeRaw {
  level: 'frame' | 'block' | 'chunk'; unit: number; colFirst: Int32Array; colLast: Int32Array
  stats: Record<string, { min: Float64Array; max: Float64Array; first: Float64Array; last: Float64Array; state: Int32Array }>
  pending: boolean; evicted: number[]; dt: number; scans: number; rebuilds: number
}
export function envelopeOf(rec: Recording, req: { ids: string[]; k0: number; k1: number; columns: number; budget: number; rebuild: boolean; level?: string }): EnvelopeRaw {
  return rec.session.call<EnvelopeRaw>({ op: 'envelope', ...req })
}

// ---- Editor ----

/** What lies under a world point: a body, pulley or connector. */
export type Hit = { kind: 'body' | 'pulley' | 'connector'; id: string } | null

export function pickAt(src: Source, x: number, y: number, tol: number, t = 0): Hit {
  return sessionOf(src).call<{ hit: Hit }>({ op: 'pick', x, y, tol, t }).hit
}
export function bodyAtPoint(src: Source, x: number, y: number, tol: number, dynamicOnly = false, t = 0): string | null {
  return sessionOf(src).call<{ body: string | null }>({ op: 'bodyAt', x, y, tol, dynamicOnly, t }).body
}
export function bodiesAtPoint(src: Source, x: number, y: number, t = 0): string[] {
  return sessionOf(src).call<{ bodies: string[] }>({ op: 'bodiesAt', x, y, t }).bodies
}
export function surfaceBelowPoint(src: Source, x: number, y: number, reach = 0.6, t = 0): { foot: Vec2; n: Vec2; angle: number } | null {
  return sessionOf(src).call<{ surface: { foot: Vec2; n: Vec2; angle: number } | null }>({ op: 'surfaceBelow', x, y, reach, t }).surface
}
export function featurePointsOf(src: Source, t = 0): Vec2[] {
  const p = sessionOf(src).call<{ points: Float64Array }>({ op: 'featurePoints', t }).points
  const out: Vec2[] = []
  for (let i = 0; i + 1 < p.length; i += 2) out.push({ x: p[i], y: p[i + 1] })
  return out
}
