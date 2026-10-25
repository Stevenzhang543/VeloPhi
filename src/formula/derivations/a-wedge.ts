/**
 * Derivations of the situation "wedge": a block (m) slides down the smooth slope (angle θ) of a wedge (M)
 * that slides on a smooth horizontal floor; neither turns (manual 26.50, D28). A is the magnitude of the
 * wedge's acceleration, a_rel that of the block relative to the wedge.
 */
import type { Derivation, SharedSteps } from './types'
import { B, st, tri } from './a-common'

/** Shared steps of the wedge situation. */
export const WEDGE_SHARED: SharedSteps[] = [
  {
    id: 'wedge.wedge',
    title: tri('隔离斜面（地面参考系）', 'Wedge isolated (ground frame)', 'Keil freigeschnitten (Bezugssystem Boden)'),
    steps: [
      st('N\\sin\\theta = MA',
        tri('物块对斜面的压力 N′ 与 N 等大反向，垂直于斜面。地面光滑，斜面在水平方向只受 N′ 的水平分力 N sinθ，产生加速度 A（方向背离物块一侧）。',
          'The push N′ of the block on the wedge is equal and opposite to N, perpendicular to the slope. The floor is smooth, so horizontally the wedge feels only the horizontal component N sin θ of N′, which gives it the acceleration A (away from the block).',
          'Die Andruckkraft N′ des Klotzes auf den Keil ist gleich groß wie N und entgegengesetzt, senkrecht zur Schrägfläche. Der Boden ist reibungsfrei; waagerecht wirkt auf den Keil nur die Komponente N·sin θ von N′, die ihm die Beschleunigung A erteilt (vom Klotz weg).'),
        tri('牛顿第三定律；牛顿第二定律（水平方向）', "Newton's third law; Newton's second law, horizontal", 'Drittes Newtonsches Gesetz; zweites Newtonsches Gesetz, waagerecht'), ['N*sin(theta)', 'M*A'], { N: 'N', A: 'm/s²' })
    ]
  },
  {
    id: 'wedge.block',
    title: tri('隔离物块（以斜面为参考系）', 'Block isolated (frame of the wedge)', 'Klotz freigeschnitten (Bezugssystem Keil)'),
    steps: [
      st('F^{*} = mA',
        tri('斜面有加速度 A，以斜面为参考系时，物块除受重力 mg 和支持力 N 外，还受惯性力 F* = mA，方向与 A 相反（水平）。',
          'The wedge accelerates with A. In the frame of the wedge the block feels, besides its weight mg and the normal force N, the inertial force F* = mA, horizontal and opposite to A.',
          'Der Keil wird mit A beschleunigt. Im Bezugssystem des Keils wirkt auf den Klotz außer der Gewichtskraft mg und der Normalkraft N die Trägheitskraft F* = mA, waagerecht und entgegen A.'),
        tri('非惯性参考系中的惯性力 F* = −m·a（参考系的加速度）', 'Inertial force in an accelerated frame, F* = −m·a (acceleration of the frame)', 'Trägheitskraft im beschleunigten Bezugssystem, F* = −m·a (Beschleunigung des Bezugssystems)'), ['Fs', 'm*A'], { Fs: 'N', A: 'm/s²' }),
      st('N + mA\\sin\\theta - mg\\cos\\theta = 0',
        tri('垂直斜面方向：物块不离开斜面，相对斜面在该方向没有加速度。惯性力在这个方向的分量 mA sinθ 背离斜面，所以支持力小于 mg cosθ。',
          'Perpendicular to the slope: the block stays on it, so it has no acceleration relative to the wedge in this direction. The component mA sin θ of the inertial force points away from the slope, so the normal force is less than mg cos θ.',
          'Senkrecht zur Schrägfläche: Der Klotz bleibt auf ihr, hat also relativ zum Keil keine Beschleunigung in dieser Richtung. Die Komponente mA·sin θ der Trägheitskraft zeigt von der Fläche weg; deshalb ist die Normalkraft kleiner als mg·cos θ.'),
        tri('牛顿第二定律（斜面参考系，垂直斜面方向）', "Newton's second law in the wedge frame, perpendicular to the slope", 'Zweites Newtonsches Gesetz im Keilsystem, senkrecht zur Schrägfläche'), ['N + m*A*sin(theta) - m*g*cos(theta)', '0'], { N: 'N', A: 'm/s²' }),
      st('mg\\sin\\theta + mA\\cos\\theta = ma_{\\mathrm{rel}}',
        tri('沿斜面方向（向下为正）：重力的分力和惯性力的分量都沿斜面向下（斜面光滑，没有摩擦力）。',
          'Along the slope (down positive): the components of the weight and of the inertial force both point down the slope (the slope is smooth, there is no friction).',
          'Längs der Schrägfläche (abwärts positiv): Die Komponenten der Gewichtskraft und der Trägheitskraft zeigen beide abwärts (die Fläche ist reibungsfrei).'),
        tri('牛顿第二定律（斜面参考系，沿斜面方向）', "Newton's second law in the wedge frame, along the slope", 'Zweites Newtonsches Gesetz im Keilsystem, längs der Schrägfläche'), ['m*g*sin(theta) + m*A*cos(theta)', 'm*arel'], { A: 'm/s²', arel: 'm/s²' })
    ]
  }
]

/** Derivations of the wedge formulas. */
export const WEDGE_DERIVATIONS: Derivation[] = [
  {
    formula: 'wd.A',
    title: tri('斜面的加速度', 'Acceleration of the wedge', 'Beschleunigung des Keils'),
    method: tri('隔离法（斜面参考系中物块受惯性力）', 'Isolation method (in the frame of the wedge the block feels an inertial force)', 'Freischneiden (im Bezugssystem des Keils wirkt auf den Klotz eine Trägheitskraft)'),
    uses: ['wedge.wedge', 'wedge.block'],
    steps: [
      st('N = \\dfrac{MA}{\\sin\\theta}',
        tri('由斜面的方程解出 N。',
          'Solve the equation of the wedge for N.',
          'Die Gleichung des Keils nach N auflösen.'),
        B.solve, ['N', 'M*A/sin(theta)'], { N: 'N', A: 'm/s²' }),
      st('\\dfrac{MA}{\\sin\\theta} + mA\\sin\\theta = mg\\cos\\theta',
        tri('代入物块垂直斜面方向的方程。',
          'Insert into the equation of the block perpendicular to the slope.',
          'In die Gleichung des Klotzes senkrecht zur Schrägfläche einsetzen.'),
        B.prev, ['M*A/sin(theta) + m*A*sin(theta)', 'm*g*cos(theta)'], { A: 'm/s²' }),
      st('A(M + m\\sin^2\\theta) = mg\\sin\\theta\\cos\\theta',
        tri('两边乘以 sinθ。',
          'Multiply by sin θ.',
          'Mit sin θ multiplizieren.'),
        B.algebra, ['A*(M + m*sin(theta)^2)', 'm*g*sin(theta)*cos(theta)'], { A: 'm/s²' }),
      st('A = \\dfrac{mg\\sin\\theta\\cos\\theta}{M + m\\sin^2\\theta}',
        tri('解出 A。M ≫ m 时 A → 0，回到固定斜面的情形。',
          'Solve for A. For M ≫ m, A → 0: the fixed incline.',
          'Auflösen nach A. Für M ≫ m geht A → 0: die feste schiefe Ebene.'),
        B.solve, ['A', 'm*g*sin(theta)*cos(theta)/(M + m*sin(theta)^2)'], { A: 'm/s²' })
    ]
  },
  {
    formula: 'wd.arel',
    title: tri('物块相对斜面的加速度', 'Acceleration of the block relative to the wedge', 'Beschleunigung des Klotzes relativ zum Keil'),
    uses: ['wedge.wedge', 'wedge.block'],
    steps: [
      st('a_{\\mathrm{rel}} = g\\sin\\theta + A\\cos\\theta',
        tri('由物块沿斜面方向的方程（两边除以 m）。',
          'From the equation of the block along the slope (divide by m).',
          'Aus der Gleichung des Klotzes längs der Schrägfläche (durch m dividieren).'),
        B.solve, ['arel', 'g*sin(theta) + A*cos(theta)'], { arel: 'm/s²', A: 'm/s²' }),
      st('a_{\\mathrm{rel}} = g\\sin\\theta + \\dfrac{mg\\sin\\theta\\cos^2\\theta}{M + m\\sin^2\\theta}',
        tri('代入斜面的加速度 A。',
          'Insert the acceleration A of the wedge.',
          'Die Beschleunigung A des Keils einsetzen.'),
        B.prev, ['arel', 'g*sin(theta) + m*g*sin(theta)*cos(theta)^2/(M + m*sin(theta)^2)'], { arel: 'm/s²' }),
      st('a_{\\mathrm{rel}} = \\dfrac{g\\sin\\theta\\,(M + m\\sin^2\\theta + m\\cos^2\\theta)}{M + m\\sin^2\\theta}',
        tri('通分。',
          'Bring to a common denominator.',
          'Auf den Hauptnenner bringen.'),
        B.algebra, ['arel', 'g*sin(theta)*(M + m*sin(theta)^2 + m*cos(theta)^2)/(M + m*sin(theta)^2)'], { arel: 'm/s²' }),
      st('a_{\\mathrm{rel}} = \\dfrac{(M + m)g\\sin\\theta}{M + m\\sin^2\\theta}',
        tri('利用 sin²θ + cos²θ = 1。它大于固定斜面上的 g sinθ。',
          'Use sin²θ + cos²θ = 1. The result is larger than g sin θ on a fixed incline.',
          'Mit sin²θ + cos²θ = 1. Das Ergebnis ist größer als g·sin θ auf der festen Ebene.'),
        tri('同角三角函数的基本关系', 'Pythagorean identity', 'Trigonometrischer Pythagoras'), ['arel', '(M + m)*g*sin(theta)/(M + m*sin(theta)^2)'], { arel: 'm/s²' })
    ]
  },
  {
    formula: 'wd.N',
    title: tri('斜面对物块的支持力', 'Normal force of the wedge on the block', 'Normalkraft des Keils auf den Klotz'),
    note: tri('小于固定斜面时的 mg cosθ', 'Smaller than mg cos θ on a fixed incline', 'Kleiner als mg·cos θ auf einer festen schiefen Ebene'),
    uses: ['wedge.wedge', 'wedge.block'],
    steps: [
      st('N = \\dfrac{MA}{\\sin\\theta}',
        tri('由斜面的方程解出 N。',
          'Solve the equation of the wedge for N.',
          'Die Gleichung des Keils nach N auflösen.'),
        B.solve, ['N', 'M*A/sin(theta)'], { N: 'N', A: 'm/s²' }),
      st('N = \\dfrac{M}{\\sin\\theta}\\cdot\\dfrac{mg\\sin\\theta\\cos\\theta}{M + m\\sin^2\\theta}',
        tri('代入斜面的加速度 A。',
          'Insert the acceleration A of the wedge.',
          'Die Beschleunigung A des Keils einsetzen.'),
        B.prev, ['N', 'M/sin(theta)*m*g*sin(theta)*cos(theta)/(M + m*sin(theta)^2)'], { N: 'N' }),
      st('N = \\dfrac{Mmg\\cos\\theta}{M + m\\sin^2\\theta}',
        tri('约去 sinθ。因为 M/(M + m sin²θ) < 1，支持力小于固定斜面时的 mg cosθ。',
          'Cancel sin θ. Since M/(M + m sin²θ) < 1, the normal force is smaller than mg cos θ on a fixed incline.',
          'sin θ kürzen. Wegen M/(M + m·sin²θ) < 1 ist die Normalkraft kleiner als mg·cos θ auf der festen Ebene.'),
        B.algebra, ['N', 'M*m*g*cos(theta)/(M + m*sin(theta)^2)'], { N: 'N' })
    ]
  },
  {
    formula: 'wd.px',
    title: tri('水平方向动量守恒', 'Conservation of horizontal momentum', 'Erhaltung des waagerechten Impulses'),
    note: tri('地面光滑，系统水平方向不受外力', 'The floor is smooth: no horizontal external force acts on the system', 'Der Boden ist reibungsfrei: Auf das System wirkt waagerecht keine äußere Kraft'),
    steps: [
      st('F_x = 0',
        tri('以物块和斜面整体为系统：外力是重力和地面的支持力，都在竖直方向（地面光滑，没有摩擦力）；物块与斜面间的弹力是内力。',
          'Take block and wedge together as the system: the external forces are the weights and the normal force of the floor, all vertical (the floor is smooth, no friction); the force between block and wedge is internal.',
          'System aus Klotz und Keil: Die äußeren Kräfte sind die Gewichtskräfte und die Normalkraft des Bodens, alle senkrecht (der Boden ist reibungsfrei); die Kraft zwischen Klotz und Keil ist eine innere Kraft.'),
        tri('受力分析（整体法）', 'Forces on the whole system', 'Kräfte auf das Gesamtsystem'), ['Fx', '0'], { Fx: 'N' }),
      st('\\Delta p_x = F_x\\,\\Delta t = 0',
        tri('在水平方向对系统用动量定理。',
          'Apply the impulse–momentum theorem to the system horizontally.',
          'Impulssatz für das System in waagerechter Richtung.'),
        tri('动量定理（水平方向）', 'Impulse–momentum theorem (horizontal)', 'Impulssatz (waagerecht)'), ['dpx', 'Fx*dt'], { dpx: 'kg·m/s', Fx: 'N', dt: 's' }),
      st('mv_{1x} + Mv_{2x} = p_{x0}',
        tri('水平总动量保持本阶段开始时的值（竖直方向的动量不守恒）。v₁ₓ、v₂ₓ 为物块、斜面的水平速度。',
          'The total horizontal momentum keeps its value from the start of the phase (the vertical momentum is not conserved). v₁ₓ, v₂ₓ are the horizontal velocities of block and wedge.',
          'Der waagerechte Gesamtimpuls behält seinen Wert vom Beginn des Abschnitts (der senkrechte Impuls bleibt nicht erhalten). v₁ₓ, v₂ₓ sind die waagerechten Geschwindigkeiten von Klotz und Keil.'),
        tri('动量守恒定律（水平方向）', 'Conservation of momentum (horizontal)', 'Impulserhaltungssatz (waagerecht)'), ['m*v1x + M*v2x', 'p0x'], { v1x: 'm/s', v2x: 'm/s' })
    ]
  }
]
