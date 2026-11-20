/**
 * Pouring on the bench (26.65, D297 item 1): the gesture's arithmetic, kept apart from the canvas so it can be tested.
 *
 * A vessel carried over the mouth of another tilts and pours while it is held there; the time it is held becomes the
 * amount, shown beside the stream as it grows; letting go performs ONE action of the log (`pour`, or `add` from a
 * reagent bottle) with that amount. Nothing chemical is computed here: the amount is the user's input, read from how
 * long the hand is held, as a slider would read it from a position.
 *
 * - `pourRate(held, capacity)`: millilitres a second after `held` seconds over the mouth — nothing while the vessel
 *   tips (0.25 s), then a ramp over 1.2 s to a steady flow that grows with the size of the source (a test tube pours
 *   2 mL/s, a 250 mL beaker 15 mL/s, a 500 mL beaker 25 mL/s), a fifth of it with Shift held (fine control).
 * - `PourMeter`: integrates the rate frame by frame, capped by what the source holds.
 * - `inMouthZone`: the region above a vessel's mouth where a carried vessel pours into it.
 */

/** Seconds the source takes to tip before anything flows. */
export const TIP_S = 0.25
/** Seconds of the ramp from the first drop to the steady flow. */
export const RAMP_S = 1.2
/** The share of the steady flow with fine control (Shift). */
export const FINE = 0.2

/** Steady flow of a source of this capacity, mL/s. */
export function steadyRate(capacity_mL: number): number {
  return Math.max(2, Math.min(25, 0.06 * Math.max(0, capacity_mL)))
}

/** Flow (mL/s) after `held` seconds over the target's mouth. */
export function pourRate(held: number, capacity_mL: number, fine = false): number {
  if (!(held > TIP_S)) return 0
  const ramp = Math.min(1, (held - TIP_S) / RAMP_S)
  return steadyRate(capacity_mL) * ramp * (fine ? FINE : 1)
}

/**
 * The amount of one pour, built up frame by frame while the source is held over one target. Moving to another target
 * starts again from nothing (each target gets its own action).
 */
export class PourMeter {
  /** The target being poured into, or null. */
  to: string | null = null
  /** Seconds held over the target. */
  held = 0
  /** Millilitres (grams for a solid) chosen so far. */
  mL = 0
  /**
   * `available_mL`: what the source can give (a stock bottle: what the target can still take); `steady`: the steady
   * flow instead of the one of the source's size (a solid tipped from a wide bottle: grams a second).
   */
  constructor(readonly capacity_mL: number, public available_mL: number, readonly steady?: number) {}

  /** `dt` seconds passed with the source over `to` (null: over nothing). Returns the amount so far. */
  step(to: string | null, dt: number, fine = false): number {
    if (to !== this.to) { this.to = to; this.held = 0; this.mL = 0 }
    if (!to || !(dt > 0)) return this.mL
    // the rate at the middle of the frame: the integral of the ramp is exact for a linear ramp
    const mid = this.held + dt / 2
    this.held += dt
    this.mL = Math.min(this.available_mL, this.mL + this.rate(mid, fine) * dt)
    return this.mL
  }

  /** The flow after `held` seconds. */
  rate(held: number, fine = false): number {
    const r = pourRate(held, this.capacity_mL, fine)
    return this.steady === undefined ? r : (r / steadyRate(this.capacity_mL)) * this.steady
  }

  /** True when the whole content has been chosen. */
  get all(): boolean { return this.available_mL > 0 && this.mL >= this.available_mL - 1e-9 }
}

/** The amount a pour of `mL` becomes in the log: rounded to 0.1 mL, or everything when it is all. */
export function pourAmount(mL: number, available_mL: number): { value: number; unit: 'mL' } | 'all' | null {
  if (!(mL > 0)) return null
  if (mL >= available_mL - 1e-9) return 'all'
  const v = Math.round(mL * 10) / 10
  return v > 0 ? { value: v, unit: 'mL' } : null
}

/** Grams a second of a solid tipped from a wide bottle, at the steady flow (D297 item 6). */
export const SOLID_RATE = 0.6

/** The amount of an addition from a stock bottle: millilitres or grams to 0.1, nothing below that. */
export function addAmount(v: number, unit: 'mL' | 'g'): { value: number; unit: 'mL' | 'g' } | null {
  const r = Math.round(v * 10) / 10
  return r > 0 ? { value: r, unit } : null
}

/** Drops from a dropper held over a mouth: the first at a third of a second of squeezing, then three a second. */
export const DROP_FIRST = 1 / 3
export const DROPS_PER_S = 3
export function dropsAfter(held: number): number {
  return held < DROP_FIRST ? 0 : 1 + Math.floor((held - DROP_FIRST) * DROPS_PER_S + 1e-9)
}

/** Drops counted while a dropper is held over one target (each target its own count). */
export class DropMeter {
  to: string | null = null
  held = 0
  drops = 0
  step(to: string | null, dt: number): number {
    if (to !== this.to) { this.to = to; this.held = 0; this.drops = 0 }
    if (!to || !(dt > 0)) return this.drops
    this.held += dt
    this.drops = dropsAfter(this.held)
    return this.drops
  }
}

/** The region over a mouth where a carried vessel pours in: `x0 … x1` across, `y0 … y1` up (cm). */
export interface MouthZone { x0: number; x1: number; y0: number; y1: number }

/** The pour zone above a mouth at (x, mouthY) of inner radius `r` (cm). */
export function mouthZone(x: number, mouthY: number, r: number): MouthZone {
  const half = Math.max(1.6, r + 2.2)
  return { x0: x - half, x1: x + half, y0: mouthY - 1.2, y1: mouthY + 11 }
}

export function inMouthZone(z: MouthZone, x: number, y: number): boolean {
  return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1
}
