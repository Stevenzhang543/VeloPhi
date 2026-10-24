/** Plain 2D vectors (meters, m/s, N …). Small immutable objects; the solver works on a handful of bodies. */
import { cos, sin } from './dmath'

/** A 2D vector; also used for points. */
export interface Vec2 { x: number; y: number }

/** Construct a vector. */
export const vec = (x: number, y: number): Vec2 => ({ x, y })
/** The zero vector (frozen). */
export const ZERO: Readonly<Vec2> = Object.freeze({ x: 0, y: 0 })
/** Sum a + b. */
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
/** Difference a − b. */
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
/** Product a·s. */
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })
/** Sum a + b·s. */
export const addScaled = (a: Vec2, b: Vec2, s: number): Vec2 => ({ x: a.x + b.x * s, y: a.y + b.y * s })
/** Dot product a·b. */
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
/** The z-component of the cross product a × b. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
/** Rotate by +90°: perp(r) = (−r_y, r_x); ω × r = ω·perp(r). */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x })
/** Opposite vector −a. */
export const neg = (a: Vec2): Vec2 => ({ x: -a.x, y: -a.y })
/** Euclidean length |a|. */
export const length = (a: Vec2): number => Math.sqrt(a.x * a.x + a.y * a.y)
/** Squared length |a|². */
export const lengthSq = (a: Vec2): number => a.x * a.x + a.y * a.y
/** Unit vector along a; the zero vector stays zero. */
export const normalize = (a: Vec2): Vec2 => { const l = length(a); return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 } }

/** Rotation by an angle θ, stored as c = cos θ and s = sin θ. */
export interface Rot { c: number; s: number }
/** Rotation for an angle (rad), with deterministic sine and cosine. */
export const rotation = (angle: number): Rot => ({ c: cos(angle), s: sin(angle) })
/** Rotate v by r. */
export const rotate = (r: Rot, v: Vec2): Vec2 => ({ x: r.c * v.x - r.s * v.y, y: r.s * v.x + r.c * v.y })
/** Rotate v by the inverse of r. */
export const unrotate = (r: Rot, v: Vec2): Vec2 => ({ x: r.c * v.x + r.s * v.y, y: -r.s * v.x + r.c * v.y })
