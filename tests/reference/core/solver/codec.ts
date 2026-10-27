/**
 * Modes as plain data. A mode points at the contact pairs and features of a compiled system; encoded, the pair is
 * its index in `system.pairs` and every feature its index in that pair's feature list, so a thread (or a
 * checkpoint) that compiles the same scene decodes it to its own, identical objects.
 */
import type { Mode, System, UnitMode } from './dynamics'

/** UnitMode with the pair and features as indices; `friction` indexes ['none', 'stick', 'slide']; `roll` as in UnitMode. */
export interface EncodedUnit { pair: number; ref: number; points: number[]; open: number[]; friction: 0 | 1 | 2; s: number; roll?: number }
/** Mode as plain data. */
export interface EncodedMode { units: EncodedUnit[]; taut: boolean[]; sw?: number[]; limit?: number[]; slip?: number[] }

const FRICTION = ['none', 'stick', 'slide'] as const

/** Index of a contact feature in its pair. */
export function featureIndex(sys: System, pair: number, f: unknown): number {
  const i = sys.pairs[pair].features.indexOf(f as never)
  if (i < 0) throw new Error('transport: contact feature not found in its pair')
  return i
}

/** Mode as plain data (features as indices into their pair). */
export function encodeMode(sys: System, mode: Mode): EncodedMode {
  const units = mode.units.map(u => {
    const pi = u.pair.index
    const out: EncodedUnit = {
      pair: pi, ref: featureIndex(sys, pi, u.ref), points: u.points.map(p => featureIndex(sys, pi, p)), open: u.open.map(p => featureIndex(sys, pi, p)),
      friction: FRICTION.indexOf(u.friction) as 0 | 1 | 2, s: u.s
    }
    if (u.roll !== undefined) out.roll = u.roll
    return out
  })
  const out: EncodedMode = mode.sw ? { units, taut: mode.taut.slice(), sw: mode.sw.slice() } : { units, taut: mode.taut.slice() }
  if (mode.limit) out.limit = mode.limit.slice()
  if (mode.slip) out.slip = mode.slip.slice()
  return out
}

/** Mode from plain data, pointing at this system's feature objects. */
export function decodeMode(sys: System, m: EncodedMode): Mode {
  const units: UnitMode[] = m.units.map(u => {
    const pair = sys.pairs[u.pair]
    const out: UnitMode = { pair, ref: pair.features[u.ref], points: u.points.map(i => pair.features[i]), open: u.open.map(i => pair.features[i]), friction: FRICTION[u.friction], s: u.s }
    if (u.roll !== undefined && u.roll !== null) out.roll = u.roll
    return out
  })
  const out: Mode = m.sw ? { units, taut: m.taut.slice(), sw: m.sw.slice() } : { units, taut: m.taut.slice() }
  if (m.limit) out.limit = m.limit.slice()
  if (m.slip) out.slip = m.slip.slice()
  return out
}
