/**
 * Display states between recorded frames.
 *
 * Playback runs on continuous time, so slow motion and motion blur need states between the recorded frames.
 * Between two frames with no event in between, positions use cubic Hermite interpolation from the recorded
 * positions and velocities (error O(Δt⁴), far below a pixel); velocities and ledger entries are linear. When an
 * event (impact, slip, liftoff, ...) falls inside the interval, the state is integrated exactly from the last
 * frame or event in the correct mode instead. Values shown as numbers always come from recorded frames or from
 * `exactStateAt`; interpolated states are used for drawing only.
 */
import type { Recording } from '../core/solver/simulation'
import { exactStateAt, frameState } from '../core/solver/simulation'

/** Index of the first event with time > t (events are sorted by time). */
function firstEventAfter(rec: Recording, t: number): number {
  let lo = 0, hi = rec.events.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (rec.events[mid].t > t) hi = mid
    else lo = mid + 1
  }
  return lo
}

/** True when an event lies strictly inside (t0, t1). */
export function eventBetween(rec: Recording, t0: number, t1: number): boolean {
  const i = firstEventAfter(rec, t0)
  return i < rec.events.length && rec.events[i].t < t1
}

/** Drawing state at time t (clamped to the recorded range). Reuses `out` when given. */
export function displayStateAt(rec: Recording, t: number, out?: Float64Array): Float64Array {
  const last = rec.frameCount - 1
  const tMax = last * rec.dt
  const size = rec.size
  const X = out && out.length === size ? out : new Float64Array(size)
  if (!(t > 0)) { X.set(frameState(rec, 0)); return X }
  if (t >= tMax) { X.set(frameState(rec, last)); return X }
  const k = Math.min(last - 1, Math.floor(t / rec.dt))
  const t0 = k * rec.dt
  const t1 = t0 + rec.dt
  const s = (t - t0) / rec.dt
  if (s <= 1e-12) { X.set(frameState(rec, k)); return X }
  if (eventBetween(rec, t0, t1)) { X.set(exactStateAt(rec, t)); return X }
  const A = frameState(rec, k), B = frameState(rec, k + 1)
  const n3 = 3 * rec.system.n
  const h = rec.dt
  const s2 = s * s, s3 = s2 * s
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2
  for (let i = 0; i < n3; i++) X[i] = h00 * A[i] + h10 * h * A[n3 + i] + h01 * B[i] + h11 * h * B[n3 + i]
  for (let i = n3; i < size; i++) X[i] = A[i] + s * (B[i] - A[i])
  return X
}
