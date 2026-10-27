/**
 * Derivations of situation group E, the 26.55 situations (manual 26.55, D90–D92): a rod on rails in a magnetic
 * field, a body in a liquid, a charge in a bounded magnetic region and in a bounded electric region.
 */
import type { Derivation, SharedSteps } from './types'
import { REGION_DERIVATIONS, REGION_SHARED } from './e-regions'

/** Situation types of group E, in the order of the library. */
export const GROUP_E_SITUATIONS: readonly string[] = ['rail', 'float', 'zone-b', 'zone-e']

/** All group-E derivations, one per library formula of the group-E situations. */
export const DERIVATIONS_E: Derivation[] = [...REGION_DERIVATIONS]

/** All group-E shared step lists. */
export const SHARED_E: SharedSteps[] = [...REGION_SHARED]
