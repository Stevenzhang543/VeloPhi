/**
 * Derivations of the spring-pair formulas (situation "spring-pair": two blocks m₁, m₂ joined by an undamped
 * spring of constant k on a smooth surface; v₁, v₂ and the deformation x₀ at the start of the phase, axis
 * from block 1 to block 2). Manual 26.50, D28.
 */
import type { Derivation, SharedSteps } from './types'
import { B, step, tri } from './b-common'

/** Shared step lists: forces on the two blocks, momentum and energy of the system. */
export const SHARED_SPRING_PAIR: SharedSteps[] = [
  {
    id: 'spring-pair.forces',
    title: tri('两物块的受力分析', 'Forces on the two blocks', 'Kräfte auf die beiden Körper'),
    steps: [
      step('F_1 = kx,\\quad F_2 = -kx',
        tri('取由物块 1 指向物块 2 的方向为正，x 为弹簧的形变量（伸长为正、压缩为负）。弹簧对两物块的弹力大小相等、方向相反：伸长时把两物块拉近，压缩时把两物块推开。',
          'Take the direction from block 1 to block 2 as positive; x is the deformation of the spring (extension positive, compression negative). The spring acts on the two blocks with forces of equal magnitude and opposite direction: stretched, it pulls them together; compressed, it pushes them apart.',
          'Positive Richtung von Körper 1 zu Körper 2; x ist die Verformung der Feder (Dehnung positiv, Stauchung negativ). Die Feder wirkt auf beide Körper mit gleich großen, entgegengesetzten Kräften: Gedehnt zieht sie sie zusammen, gestaucht drückt sie sie auseinander.'),
        tri('胡克定律；牛顿第三定律', "Hooke's law; Newton's third law", 'Hookesches Gesetz; drittes Newtonsches Gesetz'),
        'F1 = k*x', { F1: 'N', x: 'm' }),
      step('m_1a_1 = kx,\\quad m_2a_2 = -kx',
        tri('水平面光滑（或不受重力），竖直方向受力平衡，沿弹簧方向每个物块只受弹力。分别隔离两物块列方程。',
          'The surface is smooth (or there is no gravity) and the vertical forces balance, so along the spring each block is acted on only by the spring force. Write the equation for each block separately.',
          'Die Unterlage ist reibungsfrei (oder es wirkt keine Schwerkraft), die senkrechten Kräfte heben sich auf; längs der Feder wirkt auf jeden Körper nur die Federkraft. Die Gleichung für jeden Körper einzeln aufstellen.'),
        tri('牛顿第二定律（分别隔离两物块）', "Newton's second law (each block isolated)", 'Zweites Newtonsches Gesetz (jeder Körper einzeln betrachtet)'),
        'm1*a1 = k*x', { a1: 'm/s²', x: 'm' })
    ]
  },
  {
    id: 'spring-pair.momentum',
    title: tri('系统动量守恒', 'Conservation of momentum of the system', 'Impulserhaltung des Systems'),
    steps: [
      step('m_1a_1 = -m_2a_2',
        tri('两式相加：弹力是系统的内力，系统所受合外力为零，总动量的变化率 m₁a₁ + m₂a₂ 为零。',
          'Adding the two equations: the spring forces are internal forces, the resultant external force on the system is zero, so the rate of change of the total momentum, m₁a₁ + m₂a₂, is zero.',
          'Addition beider Gleichungen: Die Federkräfte sind innere Kräfte, die resultierende äußere Kraft ist null, also ist die Änderungsrate des Gesamtimpulses m₁a₁ + m₂a₂ gleich null.'),
        tri('牛顿第三定律（内力成对抵消）', "Newton's third law (internal forces cancel in pairs)", 'Drittes Newtonsches Gesetz (innere Kräfte heben sich paarweise auf)'),
        'm1*a1 = -m2*a2', { a1: 'm/s²', a2: 'm/s²' }),
      step("m_1v_1' + m_2v_2' = m_1v_1 + m_2v_2",
        tri('因此沿弹簧方向系统的总动量保持不变。v₁、v₂ 为本段开始时两物块的速度，v₁′、v₂′ 为此后任一时刻的速度。',
          'Hence the total momentum of the system along the spring stays constant. v₁, v₂ are the velocities of the blocks at the start of the phase, v₁′, v₂′ those at any later time.',
          'Daher bleibt der Gesamtimpuls des Systems längs der Feder konstant. v₁, v₂ sind die Geschwindigkeiten der Körper zu Beginn des Abschnitts, v₁′, v₂′ die zu einem beliebigen späteren Zeitpunkt.'),
        B.momentum, 'm1*v1p + m2*v2p = m1*v1 + m2*v2', { v1p: 'm/s', v2p: 'm/s' })
    ]
  },
  {
    id: 'spring-pair.energy',
    title: tri('系统机械能守恒', 'Conservation of mechanical energy of the system', 'Energieerhaltung des Systems'),
    steps: [
      step("\\tfrac12 m_1v_1'^2 + \\tfrac12 m_2v_2'^2 + \\tfrac12 kx^2 = \\tfrac12 m_1v_1^2 + \\tfrac12 m_2v_2^2 + \\tfrac12 kx_0^2",
        tri('水平面光滑、弹簧无阻尼，只有弹力做功，两物块的动能与弹簧弹性势能之和保持不变；x₀ 为本段开始时弹簧的形变量。',
          'The surface is smooth and the spring undamped; only the spring force does work, so the sum of the kinetic energies of the blocks and the elastic potential energy of the spring stays constant; x₀ is the deformation at the start of the phase.',
          'Unterlage reibungsfrei, Feder ungedämpft: Nur die Federkraft verrichtet Arbeit, die Summe aus den kinetischen Energien der Körper und der Spannenergie der Feder bleibt konstant; x₀ ist die Verformung zu Beginn des Abschnitts.'),
        B.energy, 'm1*v1p^2/2 + m2*v2p^2/2 + k*x^2/2 = m1*v1^2/2 + m2*v2^2/2 + k*x0^2/2', { v1p: 'm/s', v2p: 'm/s', x: 'm' })
    ]
  }
]

/** The common velocity at extreme deformation, used as the first step of sb.Ep and sb.x. */
const commonVelocity = () => step('v = \\dfrac{m_1v_1 + m_2v_2}{m_1 + m_2}',
  tri('形变最大时两物块共速，由动量守恒得共同速度 v（见“弹簧形变最大时两物块共速”）。',
    'At maximum deformation the two blocks share one velocity v, given by conservation of momentum (see “Common velocity of the two blocks at maximum deformation”).',
    'Bei maximaler Verformung haben beide Körper dieselbe Geschwindigkeit v, die aus der Impulserhaltung folgt (siehe „Gemeinsame Geschwindigkeit der beiden Körper bei maximaler Verformung“).'),
  B.momentum, 'v = (m1*v1 + m2*v2)/(m1 + m2)', { v: 'm/s' })

/** Loss of kinetic energy up to the common velocity, in terms of the relative velocity. */
const kineticLoss = () => step('\\tfrac12 m_1v_1^2 + \\tfrac12 m_2v_2^2 - \\dfrac{(m_1v_1 + m_2v_2)^2}{2(m_1 + m_2)} = \\dfrac{m_1m_2(v_1 - v_2)^2}{2(m_1 + m_2)}',
  tri('代入 v 并通分化简：动能的减少量只取决于两物块的相对速度 v₁ − v₂。',
    'Insert v and simplify over a common denominator: the loss of kinetic energy depends only on the relative velocity v₁ − v₂.',
    'v einsetzen und auf den Hauptnenner bringen: Die Abnahme der kinetischen Energie hängt nur von der Relativgeschwindigkeit v₁ − v₂ ab.'),
  B.algebra, 'm1*v1^2/2 + m2*v2^2/2 - (m1*v1 + m2*v2)^2/(2*(m1 + m2)) = m1*m2*(v1 - v2)^2/(2*(m1 + m2))')

/** Derivations of sb.p, sb.vc, sb.Ep, sb.x and sb.T. */
export const DERIVATIONS_SPRING_PAIR: Derivation[] = [
  {
    formula: 'sb.p',
    title: tri('动量守恒（沿弹簧方向）', 'Conservation of momentum (along the spring)', 'Impulserhaltung (längs der Feder)'),
    uses: ['spring-pair.forces', 'spring-pair.momentum'],
    steps: [
      step("p = m_1v_1' + m_2v_2' = m_1v_1 + m_2v_2",
        tri('任一时刻沿弹簧方向的总动量 p 都等于本段开始时的总动量，与弹簧的形变无关。',
          'At any time the total momentum p along the spring equals the total momentum at the start of the phase, whatever the deformation of the spring.',
          'Zu jedem Zeitpunkt ist der Gesamtimpuls p längs der Feder gleich dem Gesamtimpuls zu Beginn des Abschnitts, unabhängig von der Verformung der Feder.'),
        B.momentum, 'p = m1*v1 + m2*v2', { p: 'kg·m/s' })
    ]
  },
  {
    formula: 'sb.vc',
    title: tri('弹簧形变最大时两物块共速', 'Common velocity of the two blocks at maximum deformation', 'Gemeinsame Geschwindigkeit der beiden Körper bei maximaler Verformung'),
    uses: ['spring-pair.forces', 'spring-pair.momentum'],
    steps: [
      step("\\dfrac{\\mathrm{d}x}{\\mathrm{d}t} = v_2' - v_1' = 0",
        tri('形变量随两物块的相对运动而变化，dx/dt = v₂′ − v₁′。形变最大（压缩最短或伸长最长）时 dx/dt = 0，即两物块速度相同，记为 v。',
          'The deformation changes with the relative motion of the blocks, dx/dt = v₂′ − v₁′. At maximum deformation (spring shortest or longest) dx/dt = 0: both blocks have the same velocity, called v.',
          'Die Verformung ändert sich mit der Relativbewegung der Körper, dx/dt = v₂′ − v₁′. Bei maximaler Verformung (Feder am kürzesten oder am längsten) ist dx/dt = 0: Beide Körper haben dieselbe Geschwindigkeit v.'),
        tri('极值条件（形变量的变化率为零）', 'Condition for an extremum (the deformation stops changing)', 'Extremwertbedingung (die Verformung ändert sich nicht mehr)'),
        'dxdt = v2p - v1p', { dxdt: 'm/s', v1p: 'm/s', v2p: 'm/s' }),
      step('(m_1 + m_2)\\,v = m_1v_1 + m_2v_2',
        tri('把 v₁′ = v₂′ = v 代入动量守恒式。',
          'Insert v₁′ = v₂′ = v into the conservation of momentum.',
          'v₁′ = v₂′ = v in den Impulserhaltungssatz einsetzen.'),
        B.momentum, '(m1 + m2)*v = m1*v1 + m2*v2', { v: 'm/s' }),
      step('v = \\dfrac{m_1v_1 + m_2v_2}{m_1 + m_2}',
        tri('解出共同速度，它等于系统质心的速度。',
          'Solve for the common velocity; it equals the velocity of the centre of mass of the system.',
          'Nach der gemeinsamen Geschwindigkeit auflösen; sie ist gleich der Schwerpunktgeschwindigkeit des Systems.'),
        B.rearrange, 'v = (m1*v1 + m2*v2)/(m1 + m2)', { v: 'm/s' })
    ]
  },
  {
    formula: 'sb.Ep',
    title: tri('弹性势能的最大值', 'Maximum elastic potential energy', 'Maximale Spannenergie'),
    note: tri('动能减少量等于弹性势能增加量（共速时动能最小）',
      'The loss of kinetic energy equals the gain of elastic potential energy (the kinetic energy is smallest at the common velocity)',
      'Die Abnahme der kinetischen Energie ist gleich der Zunahme der Spannenergie (bei gemeinsamer Geschwindigkeit ist die kinetische Energie am kleinsten)'),
    uses: ['spring-pair.forces', 'spring-pair.momentum', 'spring-pair.energy'],
    steps: [
      commonVelocity(),
      step('E_{p,\\max} = \\tfrac12 m_1v_1^2 + \\tfrac12 m_2v_2^2 + \\tfrac12 kx_0^2 - \\tfrac12(m_1 + m_2)v^2',
        tri('代入机械能守恒式。共速时系统的动能最小，所以弹性势能最大。',
          'Insert into the conservation of mechanical energy. At the common velocity the kinetic energy of the system is smallest, so the elastic potential energy is largest.',
          'In den Energieerhaltungssatz einsetzen. Bei gemeinsamer Geschwindigkeit ist die kinetische Energie des Systems am kleinsten, die Spannenergie also am größten.'),
        B.energy, 'Epmax = m1*v1^2/2 + m2*v2^2/2 + k*x0^2/2 - (m1 + m2)*v^2/2', { Epmax: 'J', v: 'm/s' }),
      kineticLoss(),
      step('E_{p,\\max} = \\tfrac12 kx_0^2 + \\dfrac{m_1m_2(v_1 - v_2)^2}{2(m_1 + m_2)}',
        tri('弹性势能的最大值等于开始时的弹性势能加上动能的减少量。',
          'The maximum elastic potential energy is the initial elastic energy plus the loss of kinetic energy.',
          'Die maximale Spannenergie ist die anfängliche Spannenergie plus die Abnahme der kinetischen Energie.'),
        B.previous, 'Epmax = k*x0^2/2 + m1*m2*(v1 - v2)^2/(2*(m1 + m2))', { Epmax: 'J' })
    ]
  },
  {
    formula: 'sb.x',
    title: tri('最大形变量', 'Maximum deformation', 'Maximale Verformung'),
    uses: ['spring-pair.forces', 'spring-pair.momentum', 'spring-pair.energy'],
    steps: [
      commonVelocity(),
      step('\\tfrac12 kx_{\\max}^2 = \\tfrac12 m_1v_1^2 + \\tfrac12 m_2v_2^2 - \\tfrac12(m_1 + m_2)v^2',
        tri('本段开始时弹簧为原长（x₀ = 0），形变最大时的弹性势能全部来自动能的减少。',
          'The spring starts at its natural length (x₀ = 0), so the elastic energy at maximum deformation comes entirely from the loss of kinetic energy.',
          'Die Feder ist zu Beginn entspannt (x₀ = 0); die Spannenergie bei maximaler Verformung stammt also vollständig aus der Abnahme der kinetischen Energie.'),
        B.energy, 'k*xmax^2/2 = m1*v1^2/2 + m2*v2^2/2 - (m1 + m2)*v^2/2', { xmax: 'm', v: 'm/s' }),
      kineticLoss(),
      step('x_{\\max} = |v_1 - v_2|\\sqrt{\\dfrac{m_1m_2}{k(m_1 + m_2)}}',
        tri('由 ½kx²_max = m₁m₂(v₁ − v₂)²/(2(m₁ + m₂)) 开平方，取正值。',
          'Take the positive square root of ½kx²_max = m₁m₂(v₁ − v₂)²/(2(m₁ + m₂)).',
          'Aus ½kx²_max = m₁m₂(v₁ − v₂)²/(2(m₁ + m₂)) die positive Wurzel ziehen.'),
        B.rearrange, 'xmax = abs(v1 - v2)*sqrt(m1*m2/(k*(m1 + m2)))', { xmax: 'm' })
    ]
  },
  {
    formula: 'sb.T',
    title: tri('相对振动的周期', 'Period of the relative oscillation', 'Periodendauer der Relativschwingung'),
    note: tri('约化质量 μ = m₁m₂/(m₁ + m₂)', 'Reduced mass μ = m₁m₂/(m₁ + m₂)', 'Reduzierte Masse μ = m₁m₂/(m₁ + m₂)'),
    uses: ['spring-pair.forces'],
    steps: [
      step('\\ddot x = a_2 - a_1',
        tri('形变量 x = (x₂ − x₁) − l₀（l₀ 为弹簧原长），对时间求两次导数：形变量的二阶导数等于两物块的加速度之差。',
          'The deformation is x = (x₂ − x₁) − l₀ (l₀ the natural length); differentiating twice, its second derivative is the difference of the accelerations of the blocks.',
          'Die Verformung ist x = (x₂ − x₁) − l₀ (l₀ Länge der entspannten Feder); zweimal nach der Zeit abgeleitet ist ihre zweite Ableitung die Differenz der Beschleunigungen.'),
        tri('形变量的定义', 'Definition of the deformation', 'Definition der Verformung'),
        'ddx = a2 - a1', { ddx: 'm/s²', a1: 'm/s²', a2: 'm/s²' }),
      step('\\ddot x = -k\\left(\\dfrac{1}{m_1} + \\dfrac{1}{m_2}\\right)x',
        tri('代入 a₁ = kx/m₁、a₂ = −kx/m₂。',
          'Insert a₁ = kx/m₁ and a₂ = −kx/m₂.',
          'a₁ = kx/m₁ und a₂ = −kx/m₂ einsetzen.'),
        B.newton2, 'ddx = -k*(1/m1 + 1/m2)*x', { ddx: 'm/s²', x: 'm' }),
      step('\\ddot x = -\\dfrac{k}{\\mu}\\,x,\\quad \\mu = \\dfrac{m_1m_2}{m_1 + m_2}',
        tri('引入约化质量 μ：形变量的变化与质量为 μ、劲度系数为 k 的弹簧振子相同，是简谐运动。',
          'With the reduced mass μ the deformation obeys the same equation as a mass μ on a spring of constant k: simple harmonic motion.',
          'Mit der reduzierten Masse μ gehorcht die Verformung derselben Gleichung wie ein Körper der Masse μ an einer Feder mit Federkonstante k: harmonische Schwingung.'),
        B.shm, 'ddx = -k*(m1 + m2)/(m1*m2)*x', { ddx: 'm/s²', x: 'm' }),
      step('T = 2\\pi\\sqrt{\\dfrac{m_1m_2}{k(m_1 + m_2)}}',
        tri('与弹簧振子的周期 T = 2π√(m/k) 比较，以 μ 代替 m。两物块的相对运动以这个周期往复，质心则做匀速直线运动。',
          'Compare with the period of a spring oscillator T = 2π√(m/k), with μ in place of m. The relative motion of the blocks repeats with this period while the centre of mass moves uniformly.',
          'Vergleich mit der Schwingungsdauer des Federpendels T = 2π√(m/k), μ statt m. Die Relativbewegung der Körper wiederholt sich mit dieser Periode, der Schwerpunkt bewegt sich gleichförmig.'),
        tri('弹簧振子的周期公式', 'Period of a spring oscillator', 'Schwingungsdauer des Federpendels'),
        'T = 2*pi*sqrt(m1*m2/(k*(m1 + m2)))', { T: 's' })
    ]
  }
]
