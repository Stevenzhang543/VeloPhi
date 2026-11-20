/**
 * Placement geometry of the sketch compiler (26.64, D280): the places of a sketch ("on the incline, 0.5 m from its top",
 * "at the table's right end", "inside the arc, 60° left of its lowest point") as exact coordinates. A support offers a
 * run — a straight stretch with its outward normal, or a circle — and a body is put on it by its foot, so that the two
 * touch exactly: the same formulas as `onIncline` of core/scene/build.ts, for any direction. Also the pulley at a
 * surface's end (tangent to the rope that runs along the surface, the hanging body clear of the edge), the wrap
 * directions of a rope path, and the order in which things can be placed (a cycle is reported, never broken by a guess).
 *
 * Pure: no scene, no engine. Trigonometry is the deterministic one of core/math/dmath.ts, as in the templates.
 */
import type { Vec2 } from '../../core/math/vec'
import { atan2, cos, hypot, sin } from '../../core/math/dmath'

export type V = Vec2
export const DEG = Math.PI / 180

export const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y })
export const mul = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s })
export const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y
export const cross = (a: V, b: V): number => a.x * b.y - a.y * b.x
export const len = (a: V): number => hypot(a.x, a.y)
export const unit = (a: V): V => { const l = len(a); return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 } }
/** Rotate by `angle` (rad, counter-clockwise). */
export const rot = (a: V, angle: number): V => { const c = cos(angle), s = sin(angle); return { x: c * a.x - s * a.y, y: s * a.x + c * a.y } }
/** The direction at a polar angle. */
export const polar = (angle: number): V => ({ x: cos(angle), y: sin(angle) })

/** A straight stretch of a support, from `a` to `b`; `n`: unit normal pointing away from the support. */
export interface LineRun { kind: 'line'; owner: string; a: V; b: V; n: V }
/** A circular stretch: centre, radius of the surface, the side bodies are on, and its span (rad, counter-clockwise). */
export interface ArcRun { kind: 'arc'; owner: string; c: V; r: number; side: 'inside' | 'outside'; start: number; sweep: number }
export type Run = LineRun | ArcRun

export const runLength = (r: LineRun): number => len(sub(r.b, r.a))
export const runDir = (r: LineRun): V => unit(sub(r.b, r.a))
export const runPoint = (r: LineRun, s: number): V => add(r.a, mul(runDir(r), s))
/** Whether the run is level (its ends at the same height, to rounding). */
export const isLevel = (r: LineRun): boolean => Math.abs(r.b.y - r.a.y) <= 1e-12 * Math.max(1, runLength(r))

/**
 * The angle of a body lying on the run: along it, turned so that the body's own "right" points to world +x (so
 * `A.right` is the face on the right whatever the slope).
 */
export function lyingAngle(r: LineRun): number {
  const d = runDir(r)
  return d.x >= 0 ? atan2(d.y, d.x) : atan2(-d.y, -d.x)
}

/** Why a place could not be worked out (the compiler turns it into a diagnostic). */
export class PlaceError extends Error { constructor(public code: string, public expected: string, public got: string, public hint = '', public allow?: string[]) { super(got) } }

/**
 * The distance from `a` along a run of a place: 'left' / 'right' / 'top' / 'bottom' are the ends on that side (the body
 * flush with the end, `half` being half its extent along the run), 'middle' the middle, 'fromLeft' … the body's centre
 * at distance `d` from that end, 'atHeight' the point of a slope `d` above its lower end.
 */
export function placeAlong(r: LineRun, at: string, half: number, d: number | undefined): number {
  const L = runLength(r)
  const level = isLevel(r)
  // the end a word names: 0 = a, 1 = b
  const endOf = (word: 'left' | 'right' | 'top' | 'bottom'): 0 | 1 => {
    if (word === 'left' || word === 'right') {
      if (Math.abs(r.b.x - r.a.x) <= 1e-12 * Math.max(1, L)) throw new PlaceError('L1.place', 'top or bottom on a vertical run', word, '')
      return (r.a.x < r.b.x) === (word === 'left') ? 0 : 1
    }
    if (level) throw new PlaceError('L1.place', 'left, right, middle, fromLeft or fromRight on a level surface', word, 'top and bottom are the ends of a slope')
    return (r.a.y > r.b.y) === (word === 'top') ? 0 : 1
  }
  const from = (end: 0 | 1, dist: number) => (end === 0 ? dist : L - dist)
  switch (at) {
    case '': case 'middle': return L / 2
    // flush with the end; a point mass a little inside it (on the very corner it would rest on nothing)
    case 'left': case 'right': case 'top': case 'bottom': return from(endOf(at), Math.min(Math.max(half, Math.min(1e-3, L / 1000)), L / 2))
    case 'fromLeft': case 'fromRight': case 'fromTop': case 'fromBottom': {
      if (d === undefined) throw new PlaceError('L1.missing', `a "distance" value for at "${at}"`, 'none', 'add the distance to the values, or use left / middle / right / top / bottom')
      const word = at.slice(4).toLowerCase() as 'left' | 'right' | 'top' | 'bottom'
      if (d > L + 1e-9) throw new PlaceError('L2.offSupport', `a place on the support (it is ${num(L)} m long)`, `${num(d)} m from its ${word} end`, 'check the distance and the size of the support')
      return from(endOf(word), d)
    }
    case 'atHeight': {
      if (d === undefined) throw new PlaceError('L1.missing', 'a "heightAbove" value for at "atHeight"', 'none', 'add the height to the values')
      if (level) throw new PlaceError('L1.place', 'a slope for at "atHeight"', 'a level surface', 'use fromLeft / fromRight on a level surface')
      const rise = Math.abs(r.b.y - r.a.y)
      if (d > rise + 1e-9) throw new PlaceError('L2.offSupport', `a height up to ${num(rise)} m (the height of the slope)`, `${num(d)} m`, 'check the height and the size of the slope')
      return from(endOf('bottom'), (d / rise) * L)
    }
  }
  throw new PlaceError('L1.place', 'left, middle, right, top, bottom, fromLeft, fromRight, fromTop, fromBottom, atHeight, leftOf, rightOf or connector for a body on a surface', at, '')
}

/**
 * The centre and angle of a body on a line run at distance `s`: its foot (the point of its outline that sits on the
 * support, in body coordinates) on the run, the body lying along it.
 */
export function onLine(r: LineRun, s: number, foot: V, round: boolean): { position: V; angle: number } {
  const angle = round ? 0 : lyingAngle(r)
  const p = runPoint(r, s)
  if (round) return { position: add(p, mul(r.n, -foot.y)), angle }
  const f = rot(foot, angle)
  return { position: sub(p, f), angle }
}

/** The polar angle (rad) of a place on an arc: its lowest or highest point, its sides, or an angle from the vertical. */
export function arcAngle(at: string, phi: number | undefined): number {
  const need = () => { if (phi === undefined) throw new PlaceError('L1.missing', `an "angle" value (from the vertical) for at "${at}"`, 'none', 'add the angle to the values, or use bottom / top / left / right'); return phi }
  switch (at) {
    case 'bottom': return 270 * DEG
    case 'top': return 90 * DEG
    case 'left': return 180 * DEG
    case 'right': return 0
    case 'leftOfBottom': return 270 * DEG - need()
    case 'rightOfBottom': return 270 * DEG + need()
    case 'leftOfTop': return 90 * DEG + need()
    case 'rightOfTop': return 90 * DEG - need()
  }
  throw new PlaceError('L1.place', 'bottom, top, left, right, leftOfBottom, rightOfBottom, leftOfTop or rightOfTop for a body on an arc', at || '""', '')
}

/** Whether a polar angle lies within an arc's span (to rounding). */
export function inSpan(theta: number, start: number, sweep: number): boolean {
  const two = 2 * Math.PI
  const rel = (((theta - start) % two) + two) % two
  return rel <= sweep + 1e-9 || rel >= two - 1e-9
}

/**
 * A pulley at the end of a surface: its wheel is tangent to the line through the rope's anchor parallel to the surface
 * (`h`: the anchor's distance from the surface along its normal `n`), and stands out along `u` (the surface's direction
 * beyond its end) far enough for a body of half-width `halfHang` to hang clear of the end.
 */
export function pulleyAtEnd(corner: V, u: V, n: V, h: number, r: number, halfHang: number): { centre: V; hangSide: 1 | -1 } {
  const c0 = add(corner, mul(n, h - r))
  const side: 1 | -1 = u.x >= 0 ? 1 : -1
  const clearance = 0.02
  const ux = Math.abs(u.x) > 1e-9 ? Math.abs(u.x) : 1
  const dx = Math.max(0, (halfHang + clearance - r - side * (c0.x - corner.x)) / ux)
  return { centre: add(c0, mul(u, dx)), hangSide: side }
}

/** Wrap direction of each pulley of a rope path (anchor, pulley centres, anchor): the turn of the path there. */
export function wrapsOf(path: V[]): Array<'cw' | 'ccw'> {
  const out: Array<'cw' | 'ccw'> = []
  for (let k = 1; k + 1 < path.length; k++) out.push(cross(sub(path[k], path[k - 1]), sub(path[k + 1], path[k])) < 0 ? 'cw' : 'ccw')
  return out
}

/** One thing to place: what must be placed before it, and how. */
export interface Task { id: string; deps: string[]; run: () => void }

/**
 * Run the tasks in an order in which each comes after what it depends on. Returns the ids that could not be placed:
 * those on a cycle (each waits for another of them) and those that depend on them.
 */
export function solve(tasks: Task[], onError: (task: Task, e: unknown) => void): { done: Set<string>; stuck: Task[]; failed: Set<string> } {
  const done = new Set<string>(), failed = new Set<string>()
  let left = [...tasks]
  for (;;) {
    const ready = left.filter(t => t.deps.every(d => done.has(d)))
    if (!ready.length) break
    for (const t of ready) {
      try { t.run(); done.add(t.id) } catch (e) { failed.add(t.id); onError(t, e) }
    }
    left = left.filter(t => !done.has(t.id) && !failed.has(t.id))
  }
  // what waits for a failed task is not a cycle: it is left out of the "stuck" list
  const blocked = new Set<string>(failed)
  for (let grew = true; grew;) { grew = false; for (const t of left) if (!blocked.has(t.id) && t.deps.some(d => blocked.has(d))) { blocked.add(t.id); grew = true } }
  return { done, stuck: left.filter(t => !blocked.has(t.id)), failed: blocked }
}

export const num = (v: number): string => String(Number(v.toPrecision(6)))
