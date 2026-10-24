/**
 * Measurements on a recording that need more than one frame: times at which a quantity crosses a value
 * (located to 1e-12 s with exact states between frames), maxima, and state lookups at arbitrary times.
 */
import type { Recording } from '../core/solver/simulation'
import { exactStateAt, frameState } from '../core/solver/simulation'

export type StateFn = (X: Float64Array, t: number) => number

/** State at time t (frames exactly; between frames one integration step in the segment's mode). */
export function stateAt(rec: Recording, t: number): Float64Array {
  return exactStateAt(rec, t)
}

/**
 * Times in [t0, t1] where f crosses zero in the given direction (+1 rising, −1 falling, 0 both). Brackets
 * from frames, refined with the Illinois method on exact states.
 */
export function crossings(rec: Recording, f: StateFn, t0: number, t1: number, direction: 1 | -1 | 0 = 0, max = 64): number[] {
  const out: number[] = []
  const dt = rec.dt
  const k0 = Math.max(0, Math.ceil(t0 / dt - 1e-9)), k1 = Math.min(rec.frameCount - 1, Math.floor(t1 / dt + 1e-9))
  let tPrev = t0
  let fPrev = f(stateAt(rec, t0), t0)
  for (let k = k0; k <= k1 + 1 && out.length < max; k++) {
    const t = k <= k1 ? k * dt : t1
    if (t <= tPrev) continue
    const X = k <= k1 ? frameState(rec, k) : stateAt(rec, t)
    const fv = f(X, t)
    const rising = fPrev < 0 && fv >= 0, falling = fPrev > 0 && fv <= 0
    if ((rising && direction >= 0) || (falling && direction <= 0)) {
      out.push(refine(rec, f, tPrev, t, fPrev, fv))
    }
    tPrev = t; fPrev = fv
  }
  return out
}

function refine(rec: Recording, f: StateFn, a: number, b: number, fa: number, fb: number): number {
  let side = 0
  for (let i = 0; i < 100 && b - a > 1e-13; i++) {
    let m = (a * fb - b * fa) / (fb - fa)
    if (!(m > a && m < b) || i % 6 === 5) m = 0.5 * (a + b)
    const fm = f(stateAt(rec, m), m)
    if (fm === 0) return m
    if ((fm < 0) === (fa < 0)) { a = m; fa = fm; if (side === 1) fb /= 2; side = 1 } else { b = m; fb = fm; if (side === -1) fa /= 2; side = -1 }
  }
  return Math.abs(fa) < Math.abs(fb) ? a : b
}

/** Period from successive same-direction crossings (null when fewer than two). */
export function periodFromCrossings(times: number[]): number | null {
  if (times.length < 2) return null
  return times[1] - times[0]
}
