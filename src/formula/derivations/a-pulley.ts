/**
 * Derivations of the situation "pulley": block 1 (m₁) slides on a horizontal table and is pulled over a
 * fixed pulley by block 2 (m₂) hanging on a light rope (manual 26.50, D28). μ is the kinetic friction
 * coefficient of the table (0 when smooth); a is the acceleration of block 2 downwards.
 */
import type { Derivation, SharedSteps } from './types'
import { B, st, tri } from './a-common'

/** Shared steps of the table-pulley situation. */
export const PULLEY_SHARED: SharedSteps[] = [
  {
    id: 'pulley.setup',
    title: tri('约束条件与桌上物块的摩擦力', 'Constraints; friction on the table block', 'Bedingungen; Reibung am Klotz auf dem Tisch'),
    steps: [
      st('T_1 = T_2 = T',
        tri('轻绳跨过光滑的轻质定滑轮，绳对两物块的拉力大小相等。',
          'The light rope runs over a frictionless massless pulley, so it pulls on both blocks with the same tension.',
          'Das masselose Seil läuft über eine reibungsfreie masselose Rolle; es zieht an beiden Klötzen mit derselben Seilkraft.'),
        B.lightRope, ['T1', 'T2'], { T1: 'N', T2: 'N' }),
      st('a_1 = a_2 = a',
        tri('绳不可伸长：物块 1 在桌面上移动的距离等于物块 2 下降的距离，两者加速度大小相等。取物块 1 向滑轮、物块 2 向下为正方向。',
          'The rope does not stretch: block 1 moves along the table as far as block 2 falls, so their accelerations are equal in magnitude. Take block 1 towards the pulley and block 2 downwards as positive.',
          'Das Seil ist undehnbar: Klotz 1 bewegt sich auf dem Tisch so weit, wie Klotz 2 sinkt; ihre Beschleunigungen sind betragsgleich. Positiv sind Klotz 1 zur Rolle hin und Klotz 2 nach unten.'),
        B.inextensible, ['a1', 'a2'], { a1: 'm/s²', a2: 'm/s²' }),
      st('N = m_1g',
        tri('物块 1 在竖直方向受力平衡：桌面的支持力等于它的重力。',
          'Block 1 is in equilibrium vertically: the normal force of the table equals its weight.',
          'Klotz 1 ist senkrecht im Gleichgewicht: Die Normalkraft des Tisches ist gleich seiner Gewichtskraft.'),
        B.n2Vertical, ['N', 'm1*g'], { N: 'N' }),
      st('f = \\mu N = \\mu m_1g',
        tri('物块 1 在桌面上滑动，滑动摩擦力与运动方向相反（桌面光滑时 μ = 0）。',
          'Block 1 slides on the table; kinetic friction opposes its motion (μ = 0 on a smooth table).',
          'Klotz 1 gleitet auf dem Tisch; die Gleitreibungskraft ist der Bewegung entgegengerichtet (μ = 0 bei glattem Tisch).'),
        B.kinetic, ['f', 'mu*m1*g'], { f: 'N' })
    ]
  }
]

/** Derivations of the table-pulley formulas. */
export const PULLEY_DERIVATIONS: Derivation[] = [
  {
    formula: 'pu.a',
    title: tri('加速度（整体法）', 'Acceleration (whole system)', 'Beschleunigung (Gesamtsystem)'),
    method: tri('整体法', 'Whole-system method', 'Betrachtung des Gesamtsystems'),
    uses: ['pulley.setup'],
    steps: [
      st('(m_1 + m_2)a = m_2g - \\mu m_1g',
        tri('把两物块和绳看成一个整体，沿绳的方向列方程：物块 2 的重力是动力，物块 1 受的摩擦力是阻力；绳的拉力是内力。',
          'Treat both blocks and the rope as one system along the rope: the weight of block 2 drives it, the friction on block 1 resists; the rope tension is internal.',
          'Beide Klötze mit dem Seil als ein System längs des Seils betrachten: Die Gewichtskraft von Klotz 2 treibt an, die Reibung an Klotz 1 bremst; die Seilkraft ist eine innere Kraft.'),
        tri('牛顿第二定律（整体法，沿绳方向）', "Newton's second law for the whole system, along the rope", 'Zweites Newtonsches Gesetz für das Gesamtsystem, längs des Seils'), ['(m1 + m2)*a', 'm2*g - mu*m1*g'], { a: 'm/s²' }),
      st('a = \\dfrac{m_2 g - \\mu m_1 g}{m_1 + m_2}',
        tri('解出 a。',
          'Solve for a.',
          'Auflösen nach a.'),
        B.solve, ['a', '(m2*g - mu*m1*g)/(m1 + m2)'], { a: 'm/s²' })
    ]
  },
  {
    formula: 'pu.T2',
    title: tri('绳的拉力（隔离悬挂物块）', 'Rope tension (hanging block isolated)', 'Seilkraft (hängender Klotz freigeschnitten)'),
    method: tri('隔离法（物块2）', 'Isolation method (block 2)', 'Freischneiden (Klotz 2)'),
    uses: ['pulley.setup'],
    steps: [
      st('a = \\dfrac{m_2 g - \\mu m_1 g}{m_1 + m_2}',
        tri('整体法求得的加速度（见加速度公式）。',
          'Acceleration found with the whole-system method (see that formula).',
          'Mit der Gesamtbetrachtung gefundene Beschleunigung (siehe dort).'),
        B.earlier, ['a', '(m2*g - mu*m1*g)/(m1 + m2)'], { a: 'm/s²' }),
      st('m_2g - T = m_2a',
        tri('隔离物块 2（向下为正）：受重力 m₂g 和绳的拉力 T。',
          'Isolate block 2 (downwards positive): its weight m₂g and the tension T act on it.',
          'Klotz 2 freischneiden (nach unten positiv): Auf ihn wirken die Gewichtskraft m₂g und die Seilkraft T.'),
        B.n2, ['m2*g - T', 'm2*a'], { T: 'N', a: 'm/s²' }),
      st('T = m_2(g - a) = m_2\\left(g - \\dfrac{m_2g - \\mu m_1g}{m_1 + m_2}\\right)',
        tri('解出 T 并代入 a；化简得 T = (1 + μ)m₁m₂g/(m₁ + m₂)。T < m₂g，因为物块 2 加速下降。',
          'Solve for T and insert a; simplified, T = (1 + μ)m₁m₂g/(m₁ + m₂). T < m₂g because block 2 accelerates downwards.',
          'Nach T auflösen und a einsetzen; vereinfacht T = (1 + μ)m₁m₂g/(m₁ + m₂). T < m₂g, weil Klotz 2 nach unten beschleunigt wird.'),
        B.solve, ['T', 'm2*(g - (m2*g - mu*m1*g)/(m1 + m2))'], { T: 'N' })
    ]
  },
  {
    formula: 'pu.T1',
    title: tri('绳的拉力（隔离桌上物块）', 'Rope tension (table block isolated)', 'Seilkraft (Klotz auf dem Tisch freigeschnitten)'),
    method: tri('隔离法（物块1）', 'Isolation method (block 1)', 'Freischneiden (Klotz 1)'),
    uses: ['pulley.setup'],
    steps: [
      st('a = \\dfrac{m_2 g - \\mu m_1 g}{m_1 + m_2}',
        tri('整体法求得的加速度（见加速度公式）。',
          'Acceleration found with the whole-system method (see that formula).',
          'Mit der Gesamtbetrachtung gefundene Beschleunigung (siehe dort).'),
        B.earlier, ['a', '(m2*g - mu*m1*g)/(m1 + m2)'], { a: 'm/s²' }),
      st('T - \\mu m_1g = m_1a',
        tri('隔离物块 1（向滑轮为正）：水平方向受绳的拉力 T 和摩擦力 μm₁g。',
          'Isolate block 1 (towards the pulley positive): horizontally the tension T and the friction μm₁g act on it.',
          'Klotz 1 freischneiden (zur Rolle hin positiv): Waagerecht wirken die Seilkraft T und die Reibungskraft μm₁g.'),
        B.n2Horizontal, ['T - mu*m1*g', 'm1*a'], { T: 'N', a: 'm/s²' }),
      st('T = m_1(a + \\mu g) = m_1\\left(\\dfrac{m_2g - \\mu m_1g}{m_1 + m_2} + \\mu g\\right)',
        tri('解出 T 并代入 a；结果与隔离物块 2 得到的相同。',
          'Solve for T and insert a; the result is the same as from isolating block 2.',
          'Nach T auflösen und a einsetzen; das Ergebnis stimmt mit dem für Klotz 2 überein.'),
        B.solve, ['T', 'm1*((m2*g - mu*m1*g)/(m1 + m2) + mu*g)'], { T: 'N' })
    ]
  }
]
