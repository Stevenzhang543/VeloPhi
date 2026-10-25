/**
 * Template parameter variants searched for handbook examples (manual 26.51, D46), in addition to every template
 * with its defaults: cases that the defaults do not show (static friction, slipping, other collision types …).
 */
export const HANDBOOK_VARIANTS: Array<[string, Record<string, number>]> = [
  ['incline', { mu: 0.8 }],
  ['board-block', { mu1: 0.3, mu2: 0.2 }],
  ['collision-1d', { e: 0 }],
  ['collision-1d', { m2: 1 }],
  ['collision-1d', { e: 0.5 }],
  ['rolling', { mu: 0.05 }],
  ['pendulum', { theta0: 60 }],
  ['pull-force', { alpha: 30 }],
  ['orbit', { k: 0.8 }],
  ['drag-fall', { b: 0, c: 0.05 }],
  ['vertical-circle-rope', { v0: 5.5 }],
  ['vertical-circle-rod', { v0: 3 }]
]

/**
 * The template that best shows a situation (or one formula): the handbook takes its example from there when the
 * formula appears in it, otherwise from any template.
 */
export const PREFERRED_TEMPLATE: Record<string, string> = {
  uniform: 'uniform-motion', 'const-force': 'pull-force', lever: 'lever', circle: 'uniform-circle', orbit: 'orbit', drag: 'drag-fall',
  damped: 'damped-spring', spin: 'motor-disc', gear: 'gears', incline: 'incline', flat: 'conveyor', 'board-block': 'board-block',
  'board-together': 'board-block', collision: 'collision-1d', bounce: 'free-fall', projectile: 'projectile', pendulum: 'pendulum',
  spring: 'spring', rotation: 'hinged-rod', rolling: 'rolling', 'hinged-impact': 'ball-rod', atwood: 'atwood', pulley: 'table-pulley',
  'vcircle-rope': 'vertical-circle-rope', 'vcircle-rod': 'vertical-circle-rod', 'movable-pulley': 'movable-pulley', wedge: 'movable-wedge',
  'spring-pair': 'spring-blocks', 'roll-slip': 'rolling-slip', 'var-force': 'variable-force', energy: 'incline', momentum: 'collision-1d',
  'ff.v': 'free-fall', 'ff.h': 'free-fall', 'ff.v2': 'free-fall', 'pr.E': 'free-fall', 'pr.v': 'projectile', 'col.angle': 'collision-2d',
  'col.tangent': 'collision-2d', 'col.py': 'collision-2d'
}
