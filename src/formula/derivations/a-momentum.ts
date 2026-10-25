/**
 * Derivations of the situation "momentum": the total momentum of a system without external forces (no
 * gravity, no contact with or connection to fixed bodies) over the whole run (manual 26.50, D28).
 */
import type { Derivation, SharedSteps } from './types'
import { B, st, tri } from './a-common'

/** Shared steps of the momentum situation. */
export const MOMENTUM_SHARED: SharedSteps[] = [
  {
    id: 'momentum.system',
    title: tri('系统不受外力', 'No external force on the system', 'Keine äußere Kraft auf das System'),
    steps: [
      st('\\vec F_{ij} = -\\vec F_{ji}',
        tri('系统内物体之间的相互作用力（碰撞力、绳、杆、弹簧的力、物体间的摩擦力等）成对出现，等大反向。',
          'The forces between the bodies of the system (collision forces, forces of ropes, rods and springs, friction between the bodies …) come in pairs that are equal and opposite.',
          'Die Kräfte zwischen den Körpern des Systems (Stoßkräfte, Seil-, Stangen- und Federkräfte, Reibung zwischen den Körpern …) treten paarweise auf, gleich groß und entgegengesetzt.'),
        B.n3, ['Fij', 'Fji'], { Fij: 'N', Fji: 'N' }),
      st('\\dfrac{\\Delta\\vec p}{\\Delta t} = \\sum_i \\vec F_i = \\vec 0',
        tri('对整个系统：总动量的变化率等于各物体所受的力之和。内力成对抵消；本场景没有重力，物体也不与固定物体接触或相连，没有外力。',
          'For the whole system the rate of change of the total momentum equals the sum of the forces on all bodies. Internal forces cancel in pairs; in this scene there is no gravity and no contact with or connection to fixed bodies, so there is no external force.',
          'Für das ganze System ist die zeitliche Änderung des Gesamtimpulses gleich der Summe der Kräfte auf alle Körper. Innere Kräfte heben sich paarweise auf; in dieser Szene gibt es keine Gewichtskraft und keinen Kontakt mit oder keine Verbindung zu festen Körpern, also keine äußere Kraft.'),
        B.impulse, ['dp/dt', 'F'], { dp: 'kg·m/s', dt: 's', F: 'N' }),
      st('\\vec p = \\vec p_0',
        tri('系统的总动量保持初始值不变。',
          'The total momentum of the system keeps its initial value.',
          'Der Gesamtimpuls des Systems behält seinen Anfangswert.'),
        B.momentum, ['p', 'p0'], { p: 'kg·m/s', p0: 'kg·m/s' })
    ]
  }
]

/** Derivations of the momentum formulas. */
export const MOMENTUM_DERIVATIONS: Derivation[] = [
  {
    formula: 'mo.px',
    title: tri('系统动量守恒（x 方向）', 'Conservation of the total momentum (x direction)', 'Erhaltung des Gesamtimpulses (x-Richtung)'),
    uses: ['momentum.system'],
    steps: [
      st('p_x = \\sum_i m_i v_{ix}',
        tri('x 方向的总动量是各物体动量 x 分量之和。',
          'The total x momentum is the sum of the x components of the momenta of all bodies.',
          'Der Gesamtimpuls in x-Richtung ist die Summe der x-Komponenten der Impulse aller Körper.'),
        tri('动量的定义 p = mv', 'Definition of momentum, p = mv', 'Definition des Impulses, p = m·v'), ['px', 'm*vx'], { px: 'kg·m/s', m: 'kg', vx: 'm/s' }),
      st('p_x = p_{x0}',
        tri('取动量守恒式的 x 分量：任何时刻 x 方向的总动量都等于初始值。',
          'Take the x component of the conservation law: at every instant the total x momentum equals its initial value.',
          'x-Komponente des Erhaltungssatzes: Der Gesamtimpuls in x-Richtung ist zu jedem Zeitpunkt gleich seinem Anfangswert.'),
        tri('动量守恒定律（分量式）', 'Conservation of momentum (component form)', 'Impulserhaltungssatz (Komponentenform)'), ['px', 'p0x'], { px: 'kg·m/s' })
    ]
  },
  {
    formula: 'mo.py',
    title: tri('系统动量守恒（y 方向）', 'Conservation of the total momentum (y direction)', 'Erhaltung des Gesamtimpulses (y-Richtung)'),
    uses: ['momentum.system'],
    steps: [
      st('p_y = \\sum_i m_i v_{iy}',
        tri('y 方向的总动量是各物体动量 y 分量之和。',
          'The total y momentum is the sum of the y components of the momenta of all bodies.',
          'Der Gesamtimpuls in y-Richtung ist die Summe der y-Komponenten der Impulse aller Körper.'),
        tri('动量的定义 p = mv', 'Definition of momentum, p = mv', 'Definition des Impulses, p = m·v'), ['py', 'm*vy'], { py: 'kg·m/s', m: 'kg', vy: 'm/s' }),
      st('p_y = p_{y0}',
        tri('取动量守恒式的 y 分量：任何时刻 y 方向的总动量都等于初始值。',
          'Take the y component of the conservation law: at every instant the total y momentum equals its initial value.',
          'y-Komponente des Erhaltungssatzes: Der Gesamtimpuls in y-Richtung ist zu jedem Zeitpunkt gleich seinem Anfangswert.'),
        tri('动量守恒定律（分量式）', 'Conservation of momentum (component form)', 'Impulserhaltungssatz (Komponentenform)'), ['py', 'p0y'], { py: 'kg·m/s' })
    ]
  }
]
