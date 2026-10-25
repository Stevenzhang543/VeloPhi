/**
 * Derivations of situation group B (manual 26.50, D28). See index.ts for the group split. The content lives
 * in one b-<situation>.ts file per situation; this module only collects it.
 */
import type { Derivation, SharedSteps } from './types'
import { DERIVATIONS_PENDULUM, SHARED_PENDULUM } from './b-pendulum'
import { DERIVATIONS_SPRING, SHARED_SPRING } from './b-spring'
import { DERIVATIONS_SPRING_PAIR, SHARED_SPRING_PAIR } from './b-spring-pair'
import { DERIVATIONS_VCIRCLE_ROPE, SHARED_VCIRCLE_ROPE } from './b-vcircle-rope'
import { DERIVATIONS_VCIRCLE_ROD, SHARED_VCIRCLE_ROD } from './b-vcircle-rod'
import { DERIVATIONS_ROTATION, SHARED_ROTATION } from './b-rotation'
import { DERIVATIONS_ROLLING, SHARED_ROLLING } from './b-rolling'
import { DERIVATIONS_ROLL_SLIP, SHARED_ROLL_SLIP } from './b-roll-slip'
import { DERIVATIONS_HINGED_IMPACT, SHARED_HINGED_IMPACT } from './b-hinged-impact'
import { DERIVATIONS_VAR_FORCE, SHARED_VAR_FORCE } from './b-var-force'

/** Derivations of all group-B formulas (pendulum … var-force). */
export const DERIVATIONS_B: Derivation[] = [
  ...DERIVATIONS_PENDULUM,
  ...DERIVATIONS_SPRING,
  ...DERIVATIONS_SPRING_PAIR,
  ...DERIVATIONS_VCIRCLE_ROPE,
  ...DERIVATIONS_VCIRCLE_ROD,
  ...DERIVATIONS_ROTATION,
  ...DERIVATIONS_ROLLING,
  ...DERIVATIONS_ROLL_SLIP,
  ...DERIVATIONS_HINGED_IMPACT,
  ...DERIVATIONS_VAR_FORCE
]

/** Shared step lists of the group-B situations; ids are prefixed with the situation type. */
export const SHARED_B: SharedSteps[] = [
  ...SHARED_PENDULUM,
  ...SHARED_SPRING,
  ...SHARED_SPRING_PAIR,
  ...SHARED_VCIRCLE_ROPE,
  ...SHARED_VCIRCLE_ROD,
  ...SHARED_ROTATION,
  ...SHARED_ROLLING,
  ...SHARED_ROLL_SLIP,
  ...SHARED_HINGED_IMPACT,
  ...SHARED_VAR_FORCE
]
