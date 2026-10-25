/**
 * Derivations of situation group C, the situations of 26.51 (manual 26.51, D44): uniform motion, a constant
 * force, a lever, uniform circular motion, orbits, air drag, damped oscillation, a torque motor and gears.
 */
import type { Derivation, SharedSteps } from './types'
import { MOTION_DERIVATIONS, MOTION_SHARED } from './c-motion'
import { ORBIT_DERIVATIONS, ORBIT_SHARED } from './c-orbit'
import { FIELDS_DERIVATIONS, FIELDS_SHARED } from './c-fields'
import { ROTATION_DERIVATIONS, ROTATION_SHARED } from './c-rotation'

/** Situation types of group C, in the order of the library. */
export const GROUP_C_SITUATIONS: readonly string[] = ['uniform', 'const-force', 'lever', 'circle', 'orbit', 'drag', 'damped', 'spin', 'gear']

/** All group-C derivations, one per library formula of the group-C situations. */
export const DERIVATIONS_C: Derivation[] = [...MOTION_DERIVATIONS, ...ORBIT_DERIVATIONS, ...FIELDS_DERIVATIONS, ...ROTATION_DERIVATIONS]

/** All group-C shared step lists. */
export const SHARED_C: SharedSteps[] = [...MOTION_SHARED, ...ORBIT_SHARED, ...FIELDS_SHARED, ...ROTATION_SHARED]
