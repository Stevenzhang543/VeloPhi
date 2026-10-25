/**
 * Derivations of the situation "movable-pulley": a rope fixed at one end runs down around a movable pulley
 * carrying block 2 (m₂), then over fixed pulleys to block 1 (m₁) hanging at its free end (manual 26.50,
 * D28). a₁ is the acceleration of block 1 downwards, a₂ that of block 2 upwards; the pulleys are light.
 */
import type { Derivation, SharedSteps } from './types'
import { B, st, tri } from './a-common'

/** Shared steps of the movable-pulley situation. */
export const MOVABLE_PULLEY_SHARED: SharedSteps[] = [
  {
    id: 'movable-pulley.constraint',
    title: tri('绳长不变：位移关系', 'Constant rope length: displacements', 'Konstante Seillänge: Wege'),
    steps: [
      st('x_1 = 2x_2',
        tri('绳的一端固定。动滑轮（连同物块 2）上升 x₂ 时，动滑轮两侧的两段绳各缩短 x₂；绳长不变，所以绳端的物块 1 下降 x₁ = 2x₂。',
          'One end of the rope is fixed. When the movable pulley (with block 2) rises by x₂, each of the two rope segments beside it shortens by x₂; the rope length is constant, so block 1 at the free end falls by x₁ = 2x₂.',
          'Ein Seilende ist fest. Steigt die lose Rolle (mit Klotz 2) um x₂, wird jedes der beiden Seilstücke neben ihr um x₂ kürzer; die Seillänge ist konstant, also sinkt Klotz 1 am freien Ende um x₁ = 2x₂.'),
        B.inextensible, ['x1', '2*x2'], { x1: 'm', x2: 'm' })
    ]
  },
  {
    id: 'movable-pulley.block1',
    title: tri('隔离物块1', 'Block 1 isolated', 'Klotz 1 freigeschnitten'),
    steps: [
      st('m_1g - T = m_1a_1',
        tri('物块 1 挂在绳端，受重力 m₁g 和绳的拉力 T（向下为正）。',
          'Block 1 hangs at the end of the rope; its weight m₁g and the tension T act on it (downwards positive).',
          'Klotz 1 hängt am Seilende; auf ihn wirken die Gewichtskraft m₁g und die Seilkraft T (nach unten positiv).'),
        B.n2, ['m1*g - T', 'm1*a1'], { T: 'N', a1: 'm/s²' })
    ]
  },
  {
    id: 'movable-pulley.block2',
    title: tri('隔离动滑轮与物块2', 'Movable pulley with block 2 isolated', 'Lose Rolle mit Klotz 2 freigeschnitten'),
    steps: [
      st('2T - m_2g = m_2a_2',
        tri('把动滑轮和物块 2 作为研究对象（滑轮质量不计）：动滑轮两侧的两段绳各以 T 竖直向上拉，重力 m₂g 向下（向上为正）。',
          'Take the movable pulley with block 2 as the body (the pulley is light): the two rope segments beside the pulley each pull up with T, the weight m₂g pulls down (upwards positive).',
          'Lose Rolle mit Klotz 2 als Körper (die Rolle ist masselos): Die beiden Seilstücke neben der Rolle ziehen jeweils mit T nach oben, die Gewichtskraft m₂g nach unten (nach oben positiv).'),
        tri('牛顿第二定律；轻绳上拉力处处相等', "Newton's second law; the tension is the same along the light rope", 'Zweites Newtonsches Gesetz; die Seilkraft ist im masselosen Seil überall gleich'), ['2*T - m2*g', 'm2*a2'], { T: 'N', a2: 'm/s²' })
    ]
  }
]

/** Derivations of the movable-pulley formulas. */
export const MOVABLE_PULLEY_DERIVATIONS: Derivation[] = [
  {
    formula: 'mp.rel',
    title: tri('加速度关系（动滑轮）', 'Relation of the accelerations (movable pulley)', 'Beziehung der Beschleunigungen (lose Rolle)'),
    note: tri('物块1移动的距离是动滑轮移动距离的 2 倍；a₂ 取仿真值', 'Block 1 moves twice as far as the movable pulley; a₂ is the simulated value', 'Klotz 1 legt den doppelten Weg der losen Rolle zurück; a₂ ist der simulierte Wert'),
    uses: ['movable-pulley.constraint'],
    steps: [
      st('v_1 = 2v_2',
        tri('位移关系在任意时刻都成立，同一段时间内的位移之比就是速度之比。',
          'The relation between the displacements holds at every instant, so the velocities are in the same ratio.',
          'Die Beziehung der Wege gilt in jedem Augenblick; die Geschwindigkeiten stehen daher im selben Verhältnis.'),
        B.velDef, ['v1', '2*v2'], { v1: 'm/s', v2: 'm/s' }),
      st('a_1 = 2a_2',
        tri('同理，加速度之比也是 2：物块 1 向下的加速度是物块 2 向上加速度的 2 倍。',
          'In the same way the accelerations are in the ratio 2: block 1 accelerates downwards twice as fast as block 2 upwards.',
          'Ebenso stehen die Beschleunigungen im Verhältnis 2: Klotz 1 wird doppelt so stark nach unten beschleunigt wie Klotz 2 nach oben.'),
        B.accDef, ['a1', '2*a2sim'], { a1: 'm/s²' })
    ]
  },
  {
    formula: 'mp.a2',
    title: tri('动滑轮下物块的加速度（向上为正）', 'Acceleration of the block under the movable pulley (upwards positive)', 'Beschleunigung des Klotzes an der losen Rolle (nach oben positiv)'),
    method: tri('隔离法联立', 'Isolation method, equations solved together', 'Freischneiden und Gleichungssystem lösen'),
    uses: ['movable-pulley.constraint', 'movable-pulley.block1', 'movable-pulley.block2'],
    steps: [
      st('a_1 = 2a_2',
        tri('由位移关系 x₁ = 2x₂ 得加速度关系。',
          'The displacement relation x₁ = 2x₂ gives the relation of the accelerations.',
          'Aus der Wegbeziehung x₁ = 2x₂ folgt die Beziehung der Beschleunigungen.'),
        B.inextensible, ['a1', '2*a2'], { a1: 'm/s²', a2: 'm/s²' }),
      st('T = m_1(g - 2a_2)',
        tri('代入物块 1 的方程。',
          'Insert into the equation of block 1.',
          'In die Gleichung von Klotz 1 einsetzen.'),
        B.prev, ['T', 'm1*(g - 2*a2)'], { T: 'N', a2: 'm/s²' }),
      st('2m_1(g - 2a_2) - m_2g = m_2a_2',
        tri('代入动滑轮与物块 2 的方程。',
          'Insert into the equation of the movable pulley with block 2.',
          'In die Gleichung der losen Rolle mit Klotz 2 einsetzen.'),
        B.prev, ['2*m1*(g - 2*a2) - m2*g', 'm2*a2'], { a2: 'm/s²' }),
      st('(4m_1 + m_2)a_2 = (2m_1 - m_2)g',
        tri('整理。',
          'Collect terms.',
          'Ordnen.'),
        B.algebra, ['(4*m1 + m2)*a2', '(2*m1 - m2)*g'], { a2: 'm/s²' }),
      st('a_2 = \\dfrac{(2m_1 - m_2)g}{4m_1 + m_2}',
        tri('解出 a₂。2m₁ > m₂ 时物块 2 加速上升；2m₁ = m₂ 时系统可以保持平衡。',
          'Solve for a₂. For 2m₁ > m₂ block 2 accelerates upwards; for 2m₁ = m₂ the system can stay in equilibrium.',
          'Auflösen nach a₂. Für 2m₁ > m₂ wird Klotz 2 nach oben beschleunigt; für 2m₁ = m₂ kann das System im Gleichgewicht bleiben.'),
        B.solve, ['a2', '(2*m1 - m2)*g/(4*m1 + m2)'], { a2: 'm/s²' })
    ]
  },
  {
    formula: 'mp.a1',
    title: tri('绳端物块的加速度（向下为正）', 'Acceleration of the block at the rope end (downwards positive)', 'Beschleunigung des Klotzes am Seilende (nach unten positiv)'),
    method: tri('隔离法联立', 'Isolation method, equations solved together', 'Freischneiden und Gleichungssystem lösen'),
    uses: ['movable-pulley.constraint', 'movable-pulley.block1', 'movable-pulley.block2'],
    steps: [
      st('a_2 = \\dfrac{(2m_1 - m_2)g}{4m_1 + m_2}',
        tri('联立三个方程求得的物块 2 的加速度（见动滑轮下物块的加速度）。',
          'Acceleration of block 2 from the three equations solved together (see the acceleration of the block under the movable pulley).',
          'Beschleunigung von Klotz 2 aus den drei Gleichungen (siehe Beschleunigung des Klotzes an der losen Rolle).'),
        B.combine, ['a2', '(2*m1 - m2)*g/(4*m1 + m2)'], { a2: 'm/s²' }),
      st('a_1 = 2a_2 = \\dfrac{2(2m_1 - m_2)g}{4m_1 + m_2}',
        tri('由加速度关系 a₁ = 2a₂。',
          'Use the relation a₁ = 2a₂.',
          'Mit der Beziehung a₁ = 2a₂.'),
        B.inextensible, ['a1', '2*(2*m1 - m2)*g/(4*m1 + m2)'], { a1: 'm/s²' })
    ]
  },
  {
    formula: 'mp.T',
    title: tri('绳的拉力', 'Rope tension', 'Seilkraft'),
    uses: ['movable-pulley.constraint', 'movable-pulley.block1', 'movable-pulley.block2'],
    steps: [
      st('a_1 = \\dfrac{2(2m_1 - m_2)g}{4m_1 + m_2}',
        tri('联立求得的物块 1 的加速度（见绳端物块的加速度）。',
          'Acceleration of block 1 from the equations solved together (see the acceleration of the block at the rope end).',
          'Beschleunigung von Klotz 1 aus dem Gleichungssystem (siehe Beschleunigung des Klotzes am Seilende).'),
        B.combine, ['a1', '2*(2*m1 - m2)*g/(4*m1 + m2)'], { a1: 'm/s²' }),
      st('T = m_1(g - a_1) = m_1\\left(g - \\dfrac{2(2m_1 - m_2)g}{4m_1 + m_2}\\right)',
        tri('由物块 1 的方程求 T，代入 a₁。',
          'Solve the equation of block 1 for T and insert a₁.',
          'Die Gleichung von Klotz 1 nach T auflösen und a₁ einsetzen.'),
        B.prev, ['T', 'm1*(g - 2*(2*m1 - m2)*g/(4*m1 + m2))'], { T: 'N' }),
      st('T = \\dfrac{3m_1m_2g}{4m_1 + m_2}',
        tri('通分化简。可以用动滑轮的方程 2T = m₂(g + a₂) 验算。',
          'Simplify. Check with the equation of the movable pulley, 2T = m₂(g + a₂).',
          'Vereinfachen. Probe mit der Gleichung der losen Rolle, 2T = m₂(g + a₂).'),
        B.algebra, ['T', '3*m1*m2*g/(4*m1 + m2)'], { T: 'N' })
    ]
  },
  {
    formula: 'mp.T1',
    title: tri('张力关系（隔离物块1）', 'Tension relation (block 1 isolated)', 'Seilkraft (Klotz 1 freigeschnitten)'),
    method: tri('隔离法（物块1）', 'Isolation method (block 1)', 'Freischneiden (Klotz 1)'),
    note: tri('a₁ 取仿真值', 'a₁ is the simulated value', 'a₁ ist der simulierte Wert'),
    uses: ['movable-pulley.block1'],
    steps: [
      st('T = m_1(g - a_1)',
        tri('移项。a₁ 取仿真值，可以单独检验物块 1 的受力分析。',
          'Rearrange. With the simulated a₁ this checks the force analysis of block 1 on its own.',
          'Umstellen. Mit dem simulierten a₁ prüft dies die Kräfteanalyse von Klotz 1 für sich.'),
        B.rearrange, ['T', 'm1*(g - a1sim)'], { T: 'N' })
    ]
  },
  {
    formula: 'mp.T2',
    title: tri('张力关系（隔离动滑轮与物块2）', 'Tension relation (movable pulley with block 2 isolated)', 'Seilkraft (lose Rolle mit Klotz 2 freigeschnitten)'),
    method: tri('隔离法（动滑轮与物块2）', 'Isolation method (movable pulley with block 2)', 'Freischneiden (lose Rolle mit Klotz 2)'),
    note: tri('动滑轮两侧两段绳各以 T 向上拉；a₂ 取仿真值', 'The two rope segments beside the movable pulley each pull up with T; a₂ is the simulated value', 'Die beiden Seilstücke neben der losen Rolle ziehen jeweils mit T nach oben; a₂ ist der simulierte Wert'),
    uses: ['movable-pulley.block2'],
    steps: [
      st('2T = m_2(g + a_2)',
        tri('移项。a₂ 取仿真值，可以单独检验动滑轮与物块 2 的受力分析；卡片比较的是 T = m₂(g + a₂)/2。',
          'Rearrange. With the simulated a₂ this checks the force analysis of the movable pulley with block 2 on its own; the card compares T = m₂(g + a₂)/2.',
          'Umstellen. Mit dem simulierten a₂ prüft dies die Kräfteanalyse der losen Rolle mit Klotz 2 für sich; die Karte vergleicht T = m₂(g + a₂)/2.'),
        B.rearrange, ['T', 'm2*(g + a2sim)/2'], { T: 'N' })
    ]
  }
]
