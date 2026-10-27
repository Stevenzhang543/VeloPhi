/**
 * Registry of formula derivations (manual 26.50, D28). Content files register their derivations and
 * shared step lists here; the detail panel and the exports only use `getDerivation` and `getShared`.
 */
import type { Derivation, SharedSteps } from './types'
import { DERIVATIONS_A, SHARED_A } from './groupA'
import { DERIVATIONS_B, SHARED_B } from './groupB'
import { DERIVATIONS_C, SHARED_C } from './groupC'
import { DERIVATIONS_D, SHARED_D } from './groupD'
import { DERIVATIONS_E, SHARED_E } from './groupE'

/*
 * Group A: incline, flat, board-block, board-together, collision, momentum, energy, bounce, projectile, wedge,
 * atwood, pulley, movable-pulley. Group B: pendulum, spring, spring-pair, vcircle-rope, vcircle-rod, rotation,
 * rolling, roll-slip, hinged-impact, var-force. Group C (26.51): uniform, const-force, lever, circle, orbit, drag,
 * damped, spin, gear. Group D (26.54): charge-e, charge-b, selector, charge-eb, coulomb. Group E (26.55): rail,
 * float, zone-b, zone-e.
 */
const DERIVATIONS: Derivation[] = [...DERIVATIONS_A, ...DERIVATIONS_B, ...DERIVATIONS_C, ...DERIVATIONS_D, ...DERIVATIONS_E]
const SHARED: SharedSteps[] = [...SHARED_A, ...SHARED_B, ...SHARED_C, ...SHARED_D, ...SHARED_E]

const byId = new Map<string, Derivation>()
const sharedById = new Map<string, SharedSteps>()
for (const d of DERIVATIONS) byId.set(d.formula, d)
for (const s of SHARED) sharedById.set(s.id, s)

/** Derivation of a library formula, or null when none is written. */
export function getDerivation(formulaId: string): Derivation | null {
  return byId.get(formulaId) ?? null
}

/** A shared step list by id, or null. */
export function getShared(id: string): SharedSteps | null {
  return sharedById.get(id) ?? null
}

/** All derivations (tests, exports). */
export function allDerivations(): readonly Derivation[] {
  return DERIVATIONS
}

/** All shared step lists (tests). */
export function allShared(): readonly SharedSteps[] {
  return SHARED
}
