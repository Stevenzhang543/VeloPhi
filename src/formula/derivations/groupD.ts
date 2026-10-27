/**
 * Derivations of situation group D, the electric and magnetic situations of 26.54 (manual 26.54, D78): a
 * charge in a uniform electric field, in a uniform magnetic field, a velocity selector, crossed fields that do
 * not balance, and the Coulomb interaction of two point charges.
 */
import type { Derivation, SharedSteps } from './types'
import { ELECTRIC_DERIVATIONS, ELECTRIC_SHARED } from './d-electric'

/** Situation types of group D, in the order of the library. */
export const GROUP_D_SITUATIONS: readonly string[] = ['charge-e', 'charge-b', 'selector', 'charge-eb', 'coulomb']

/** All group-D derivations, one per library formula of the group-D situations. */
export const DERIVATIONS_D: Derivation[] = [...ELECTRIC_DERIVATIONS]

/** All group-D shared step lists. */
export const SHARED_D: SharedSteps[] = [...ELECTRIC_SHARED]
