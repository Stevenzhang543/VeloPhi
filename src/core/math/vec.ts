/** Plain 2D vectors (meters, m/s, N …). Small immutable objects; the solver works on a handful of bodies. */
import { cos, sin } from './dmath'

export interface Vec2 { x: number; y: number }

export const vec = (x: number, y: number): Vec2 => ({ x, y })
export const ZERO: Readonly<Vec2> = Object.freeze({ x: 0, y: 0 })
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })
export const addScaled = (a: Vec2, b: Vec2, s: number): Vec2 => ({ x: a.x + b.x * s, y: a.y + b.y * s })
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
/** z-component of a × b. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
/** Rotate by +90°: perp(r) = (−r_y, r_x); ω × r = ω·perp(r). */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x })
export const neg = (a: Vec2): Vec2 => ({ x: -a.x, y: -a.y })
export const length = (a: Vec2): number => Math.sqrt(a.x * a.x + a.y * a.y)
export const lengthSq = (a: Vec2): number => a.x * a.x + a.y * a.y
export const normalize = (a: Vec2): Vec2 => { const l = length(a); return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 } }

/** Rotation by angle θ, with deterministic sine and cosine. */
export interface Rot { c: number; s: number }
export const rotation = (angle: number): Rot => ({ c: cos(angle), s: sin(angle) })
export const rotate = (r: Rot, v: Vec2): Vec2 => ({ x: r.c * v.x - r.s * v.y, y: r.s * v.x + r.c * v.y })
export const unrotate = (r: Rot, v: Vec2): Vec2 => ({ x: r.c * v.x + r.s * v.y, y: -r.s * v.x + r.c * v.y })
