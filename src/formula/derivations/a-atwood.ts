/**
 * Derivations of the situation "atwood": two blocks (m₁, m₂) hang on a light rope over a fixed pulley
 * (manual 26.50, D28). a is the acceleration of block 2 downwards (= that of block 1 upwards).
 */
import type { Derivation, SharedSteps } from './types'
import { B, st, tri } from './a-common'

/** Shared steps of the Atwood situation. */
export const ATWOOD_SHARED: SharedSteps[] = [
  {
    id: 'atwood.setup',
    title: tri('绳与滑轮的约束', 'Constraints of rope and pulley', 'Bedingungen durch Seil und Rolle'),
    steps: [
      st('T_1 = T_2 = T',
        tri('轻绳跨过光滑的轻质定滑轮，绳对两物块的拉力大小相等。',
          'The light rope runs over a frictionless massless fixed pulley, so it pulls on both blocks with the same tension.',
          'Das masselose Seil läuft über eine reibungsfreie masselose feste Rolle; es zieht an beiden Klötzen mit derselben Seilkraft.'),
        B.lightRope, ['T1', 'T2'], { T1: 'N', T2: 'N' }),
      st('a_1 = a_2 = a',
        tri('绳不可伸长：物块 2 下降多少，物块 1 就上升多少，两者加速度大小相等。取物块 2 向下、物块 1 向上为正方向。',
          'The rope does not stretch: block 1 rises as far as block 2 falls, so their accelerations are equal in magnitude. Take block 2 downwards and block 1 upwards as positive.',
          'Das Seil ist undehnbar: Klotz 1 steigt um so viel, wie Klotz 2 sinkt; ihre Beschleunigungen sind betragsgleich. Positiv sind Klotz 2 nach unten und Klotz 1 nach oben.'),
        B.inextensible, ['a1', 'a2'], { a1: 'm/s²', a2: 'm/s²' })
    ]
  }
]

/** Derivations of the Atwood formulas. */
export const ATWOOD_DERIVATIONS: Derivation[] = [
  {
    formula: 'at.a',
    title: tri('阿特伍德机加速度（整体法）', 'Acceleration of the Atwood machine (whole system)', 'Beschleunigung der Atwoodschen Fallmaschine (Gesamtsystem)'),
    method: tri('整体法', 'Whole-system method', 'Betrachtung des Gesamtsystems'),
    uses: ['atwood.setup'],
    steps: [
      st('(m_1 + m_2)a = m_2g - m_1g',
        tri('把两物块和绳看成一个整体，沿绳的方向列方程：m₂g 使系统沿正方向加速，m₁g 阻碍运动；绳的拉力是内力，互相抵消。',
          'Treat both blocks and the rope as one system and write the law along the rope: m₂g drives the system in the positive direction, m₁g opposes it; the rope tensions are internal and cancel.',
          'Beide Klötze mit dem Seil als ein System betrachten und das Gesetz längs des Seils aufstellen: m₂g treibt das System in positiver Richtung an, m₁g wirkt dagegen; die Seilkräfte sind innere Kräfte und heben sich auf.'),
        tri('牛顿第二定律（整体法，沿绳方向）', "Newton's second law for the whole system, along the rope", 'Zweites Newtonsches Gesetz für das Gesamtsystem, längs des Seils'), ['(m1 + m2)*a', 'm2*g - m1*g'], { a: 'm/s²' }),
      st('a = \\dfrac{(m_2 - m_1)g}{m_1 + m_2}',
        tri('解出 a。m₂ > m₁ 时物块 2 加速下降；两质量相差越小，加速度越小，阿特伍德正是用它把自由落体“放慢”来测量的。',
          'Solve for a. For m₂ > m₁ block 2 accelerates downwards; the closer the masses, the smaller the acceleration — this is how Atwood "slowed down" free fall to measure it.',
          'Auflösen nach a. Für m₂ > m₁ wird Klotz 2 nach unten beschleunigt; je ähnlicher die Massen, desto kleiner die Beschleunigung — so „verlangsamte“ Atwood den freien Fall, um ihn zu messen.'),
        B.solve, ['a', '(m2 - m1)*g/(m1 + m2)'], { a: 'm/s²' })
    ]
  },
  {
    formula: 'at.T',
    title: tri('绳的拉力（隔离法）', 'Rope tension (isolation method)', 'Seilkraft (Freischneiden)'),
    method: tri('隔离法', 'Isolation method', 'Freischneiden'),
    uses: ['atwood.setup'],
    steps: [
      st('m_2g - T = m_2a',
        tri('隔离物块 2（向下为正）：受重力 m₂g 和绳的拉力 T。',
          'Isolate block 2 (downwards positive): its weight m₂g and the tension T act on it.',
          'Klotz 2 freischneiden (nach unten positiv): Auf ihn wirken die Gewichtskraft m₂g und die Seilkraft T.'),
        B.n2, ['m2*g - T', 'm2*a'], { T: 'N', a: 'm/s²' }),
      st('T - m_1g = m_1a',
        tri('隔离物块 1（向上为正）：受绳的拉力 T 和重力 m₁g。',
          'Isolate block 1 (upwards positive): the tension T and its weight m₁g act on it.',
          'Klotz 1 freischneiden (nach oben positiv): Auf ihn wirken die Seilkraft T und die Gewichtskraft m₁g.'),
        B.n2, ['T - m1*g', 'm1*a'], { T: 'N', a: 'm/s²' }),
      st('a = \\dfrac{(m_2 - m_1)g}{m_1 + m_2}',
        tri('两式相加消去 T，得到加速度。',
          'Add both equations to eliminate T; this gives the acceleration.',
          'Beide Gleichungen addieren, um T zu eliminieren; das liefert die Beschleunigung.'),
        B.combine, ['a', '(m2 - m1)*g/(m1 + m2)'], { a: 'm/s²' }),
      st('T = m_1(g + a) = m_1\\left(g + \\dfrac{(m_2 - m_1)g}{m_1 + m_2}\\right)',
        tri('由物块 1 的方程求 T，代入 a。',
          'Solve the equation of block 1 for T and insert a.',
          'Die Gleichung von Klotz 1 nach T auflösen und a einsetzen.'),
        B.prev, ['T', 'm1*(g + (m2 - m1)*g/(m1 + m2))'], { T: 'N' }),
      st('T = \\dfrac{2m_1m_2 g}{m_1 + m_2}',
        tri('通分化简。T 介于 m₁g 与 m₂g 之间：较重的物块并不处于平衡状态。',
          'Simplify. T lies between m₁g and m₂g: the heavier block is not in equilibrium.',
          'Vereinfachen. T liegt zwischen m₁g und m₂g: Der schwerere Klotz ist nicht im Gleichgewicht.'),
        B.algebra, ['T', '2*m1*m2*g/(m1 + m2)'], { T: 'N' })
    ]
  }
]
