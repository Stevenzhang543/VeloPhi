/**
 * 26.52 area under a curve (D64): the integral of a recorded quantity over a time span by composite Simpson on the
 * recorded frames (Simpson's 3/8 rule closes an odd number of intervals), split into its positive and negative
 * parts, and compared with the change of the quantity whose rate it is (v → x, a → v, ω → θ, β → ω).
 *
 * Pure module: the chart panel and the tests use it.
 */
import type { Recording } from '../core/solver/simulation'
import { quantitySeries } from '../core/observe/quantities'

/** Quantity key → the key of its integral over time (same body). */
export const INTEGRAL_OF: Record<string, string> = { vx: 'x', vy: 'y', ax: 'vx', ay: 'vy', omega: 'angle', alpha: 'omega' }

/** SI unit of ∫q dt for a quantity in `unit`. */
export function integralUnit(unit: string): string {
  const known: Record<string, string> = { 'm/s': 'm', 'm/s²': 'm/s', 'rad/s': 'rad', 'rad/s²': 'rad/s', W: 'J', 'J/s': 'J' }
  if (known[unit]) return known[unit]
  if (unit === 'N') return 'N·s'
  return unit ? `${unit}·s` : 's'
}

/** ∫ over equally spaced samples (spacing h): Simpson, the last three intervals by 3/8 when their count is odd. */
export function simpson(v: ArrayLike<number>, h: number): number {
  const n = v.length - 1
  if (n <= 0) return 0
  if (n === 1) return h * (v[0] + v[1]) / 2
  const simpsonPart = (a: number, b: number) => {
    let s = v[a] + v[b]
    for (let i = a + 1; i < b; i++) s += (i - a) % 2 === 1 ? 4 * v[i] : 2 * v[i]
    return s * h / 3
  }
  if (n % 2 === 0) return simpsonPart(0, n)
  const m = n - 3
  const tail = 3 * h / 8 * (v[m] + 3 * v[m + 1] + 3 * v[m + 2] + v[m + 3])
  return (m > 0 ? simpsonPart(0, m) : 0) + tail
}

/** Area under the curve of `id` between t0 and t1 (snapped to frames). */
export interface AreaResult {
  id: string
  t0: number
  t1: number
  /** ∫q dt (SI) and its positive and negative parts (area = positive + negative). */
  area: number
  positive: number
  negative: number
  /** The quantity it is the rate of, and its change over the span (null when there is none). */
  compareId: string | null
  compare: number | null
}

/** Most frames one area may integrate. */
export const AREA_MAX_FRAMES = 200_000

/** ∫ id dt over [t0, t1]; null when the span has fewer than two frames or more than AREA_MAX_FRAMES. */
export function areaUnder(rec: Recording, id: string, t0: number, t1: number): AreaResult | null {
  const last = rec.frameCount - 1
  if (t1 < t0) [t0, t1] = [t1, t0]
  const k0 = Math.max(0, Math.min(last, Math.round(t0 / rec.dt)))
  const k1 = Math.max(0, Math.min(last, Math.round(t1 / rec.dt)))
  if (k1 - k0 < 1 || k1 - k0 > AREA_MAX_FRAMES) return null
  const dot = id.lastIndexOf('.')
  const key = dot >= 0 ? id.slice(dot + 1) : ''
  const integ = INTEGRAL_OF[key]
  const compareId = integ ? `${id.slice(0, dot)}.${integ}` : null
  const ids = compareId ? [id, compareId] : [id]
  const s = quantitySeries(rec, ids, k0, k1)
  const v = s.values[0]
  const pos = Float64Array.from(v, x => (x > 0 ? x : 0)), neg = Float64Array.from(v, x => (x < 0 ? x : 0))
  const positive = simpson(pos, rec.dt), negative = simpson(neg, rec.dt)
  let compare: number | null = null
  if (compareId) {
    const c = s.values[1]
    compare = c[c.length - 1] - c[0]
    if (!Number.isFinite(compare)) compare = null
  }
  return { id, t0: k0 * rec.dt, t1: k1 * rec.dt, area: positive + negative, positive, negative, compareId: compare === null ? null : compareId, compare }
}
