/**
 * Modes as plain data. A mode points at the contact pairs and features of a compiled system; encoded, the pair is
 * its index in `system.pairs` and every feature its index in that pair's feature list, so a thread (or a
 * checkpoint) that compiles the same scene decodes it to its own, identical objects.
 */
import type { Mode, System, UnitMode } from './dynamics'

/** UnitMode with the pair and features as indices; `friction` indexes ['none', 'stick', 'slide']. */
export interface EncodedUnit { pair: number; ref: number; points: number[]; open: number[]; friction: 0 | 1 | 2; s: number }
/** Mode as plain data. */
export interface EncodedMode { units: EncodedUnit[]; taut: boolean[]; sw?: number[] }

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
    return {
      pair: pi, ref: featureIndex(sys, pi, u.ref), points: u.points.map(p => featureIndex(sys, pi, p)), open: u.open.map(p => featureIndex(sys, pi, p)),
      friction: FRICTION.indexOf(u.friction) as 0 | 1 | 2, s: u.s
    }
  })
  return mode.sw ? { units, taut: mode.taut.slice(), sw: mode.sw.slice() } : { units, taut: mode.taut.slice() }
}

/** Mode from plain data, pointing at this system's feature objects. */
export function decodeMode(sys: System, m: EncodedMode): Mode {
  const units: UnitMode[] = m.units.map(u => {
    const pair = sys.pairs[u.pair]
    return { pair, ref: pair.features[u.ref], points: u.points.map(i => pair.features[i]), open: u.open.map(i => pair.features[i]), friction: FRICTION[u.friction], s: u.s }
  })
  return m.sw ? { units, taut: m.taut.slice(), sw: m.sw.slice() } : { units, taut: m.taut.slice() }
}
