/**
 * 26.52 area under a curve (D64): the integral of a recorded quantity over a time span by composite Simpson on the
 * recorded frames (Simpson's 3/8 rule closes an odd number of intervals), split into its positive and negative parts,
 * and compared with the change of the quantity whose rate it is (v → x, a → v, ω → θ, β → ω). 26.53: computed in the
 * core (teaching.rs `area`).
 *
 * Pure module: the chart panel and the tests use it.
 */
import type { Recording } from '../engine/recording'
import { areaOf } from '../engine/views'

/** Quantity key → the key of its integral over time (same body). */
export const INTEGRAL_OF: Record<string, string> = { vx: 'x', vy: 'y', ax: 'vx', ay: 'vy', omega: 'angle', alpha: 'omega' }

/** SI unit of ∫q dt for a quantity in `unit`. */
export function integralUnit(unit: string): string {
  const known: Record<string, string> = { 'm/s': 'm', 'm/s²': 'm/s', 'rad/s': 'rad', 'rad/s²': 'rad/s', W: 'J', 'J/s': 'J' }
  if (known[unit]) return known[unit]
  if (unit === 'N') return 'N·s'
  return unit ? `${unit}·s` : 's'
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

/** ∫ id dt over [t0, t1] (computed in the core, teaching.rs); null when the span has fewer than two frames or more than AREA_MAX_FRAMES. */
export function areaUnder(rec: Recording, id: string, t0: number, t1: number): AreaResult | null {
  return areaOf(rec, id, t0, t1)
}
