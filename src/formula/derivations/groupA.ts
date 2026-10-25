/**
 * Derivations of situation group A (manual 26.50, D28). See index.ts for the group split. Each situation
 * has its own content file (a-<situation>.ts); this module only collects them.
 */
import type { Derivation, SharedSteps } from './types'
import { INCLINE_DERIVATIONS, INCLINE_SHARED } from './a-incline'
import { FLAT_DERIVATIONS, FLAT_SHARED } from './a-flat'
import { BOARD_BLOCK_DERIVATIONS, BOARD_BLOCK_SHARED } from './a-board-block'
import { BOARD_TOGETHER_DERIVATIONS, BOARD_TOGETHER_SHARED } from './a-board-together'
import { COLLISION_DERIVATIONS, COLLISION_SHARED } from './a-collision'
import { BOUNCE_DERIVATIONS, BOUNCE_SHARED } from './a-bounce'
import { MOMENTUM_DERIVATIONS, MOMENTUM_SHARED } from './a-momentum'
import { ENERGY_DERIVATIONS, ENERGY_SHARED } from './a-energy'
import { PROJECTILE_DERIVATIONS, PROJECTILE_SHARED } from './a-projectile'
import { WEDGE_DERIVATIONS, WEDGE_SHARED } from './a-wedge'
import { ATWOOD_DERIVATIONS, ATWOOD_SHARED } from './a-atwood'
import { PULLEY_DERIVATIONS, PULLEY_SHARED } from './a-pulley'
import { MOVABLE_PULLEY_DERIVATIONS, MOVABLE_PULLEY_SHARED } from './a-movable-pulley'

/** Situation types of group A, in the order of the library. */
export const GROUP_A_SITUATIONS: readonly string[] = [
  'incline', 'flat', 'board-block', 'board-together', 'collision', 'bounce', 'projectile', 'atwood', 'pulley',
  'movable-pulley', 'wedge', 'energy', 'momentum'
]

/** All group-A derivations, one per library formula of the group-A situations. */
export const DERIVATIONS_A: Derivation[] = [
  ...INCLINE_DERIVATIONS, ...FLAT_DERIVATIONS, ...BOARD_BLOCK_DERIVATIONS, ...BOARD_TOGETHER_DERIVATIONS,
  ...COLLISION_DERIVATIONS, ...BOUNCE_DERIVATIONS, ...PROJECTILE_DERIVATIONS, ...ATWOOD_DERIVATIONS,
  ...PULLEY_DERIVATIONS, ...MOVABLE_PULLEY_DERIVATIONS, ...WEDGE_DERIVATIONS, ...ENERGY_DERIVATIONS,
  ...MOMENTUM_DERIVATIONS
]

/** All group-A shared step lists. */
export const SHARED_A: SharedSteps[] = [
  ...INCLINE_SHARED, ...FLAT_SHARED, ...BOARD_BLOCK_SHARED, ...BOARD_TOGETHER_SHARED, ...COLLISION_SHARED,
  ...BOUNCE_SHARED, ...PROJECTILE_SHARED, ...ATWOOD_SHARED, ...PULLEY_SHARED, ...MOVABLE_PULLEY_SHARED,
  ...WEDGE_SHARED, ...ENERGY_SHARED, ...MOMENTUM_SHARED
]
