/**
 * Derivations of the situation "flat": a block sliding on the ground or on a horizontal belt (manual 26.50,
 * D28). The x axis is horizontal; v₀ is the block's velocity at the start of the phase, u the velocity of
 * the surface (0 for the ground, the belt velocity otherwise). The phase ends when the block moves with
 * the surface.
 */
import type { Derivation, SharedSteps } from './types'
import { B, st, tri } from './a-common'

/** Shared steps of the flat situation. */
export const FLAT_SHARED: SharedSteps[] = [
  {
    id: 'flat.forces',
    title: tri('受力分析（竖直方向）', 'Forces; vertical direction', 'Kräfte; senkrechte Richtung'),
    steps: [
      st('m\\vec g + \\vec N + \\vec f = m\\vec a',
        tri('以物块为研究对象：受重力 mg、支持力 N（竖直向上）和接触面的摩擦力 f（水平，与物块相对接触面的运动方向相反）。',
          'Take the block as the body under study: it is acted on by its weight mg, the normal force N (vertically up) and the friction force f of the surface (horizontal, opposite to the motion of the block relative to the surface).',
          'Wir betrachten den Klotz: Auf ihn wirken die Gewichtskraft mg, die Normalkraft N (senkrecht nach oben) und die Reibungskraft f der Unterlage (waagerecht, entgegen der Bewegung des Klotzes relativ zur Unterlage).'),
        B.freeBody, ['m*g + N + f', 'm*a'], { N: 'N', f: 'N' }),
      st('N - mg = 0',
        tri('物块沿水平面运动，竖直方向加速度为零，竖直方向合力为零。',
          'The block moves along the horizontal surface, so its vertical acceleration and the vertical net force are zero.',
          'Der Klotz bewegt sich auf der waagerechten Unterlage; seine senkrechte Beschleunigung und die senkrechte resultierende Kraft sind null.'),
        B.n2Vertical, ['N - m*g', '0'], { N: 'N' })
    ]
  }
]

/** Derivations of the flat formulas. */
export const FLAT_DERIVATIONS: Derivation[] = [
  {
    formula: 'flat.a',
    title: tri('滑动时的加速度大小', 'Magnitude of the acceleration while sliding', 'Betrag der Beschleunigung beim Gleiten'),
    uses: ['flat.forces'],
    steps: [
      st('f = \\mu_k N = \\mu_k mg',
        tri('物块相对接触面滑动，受滑动摩擦力；由竖直方向的方程 N = mg。水平方向只有这一个力。',
          'The block slides relative to the surface and experiences kinetic friction; from the vertical direction N = mg. It is the only horizontal force.',
          'Der Klotz gleitet relativ zur Unterlage und erfährt Gleitreibung; aus der senkrechten Richtung folgt N = mg. Sie ist die einzige waagerechte Kraft.'),
        B.kinetic, ['f', 'muK*m*g'], { f: 'N' }),
      st('\\mu_k mg = ma',
        tri('水平方向列方程（取加速度的大小）。',
          'Apply the law horizontally (magnitudes).',
          'Anwenden in waagerechter Richtung (Beträge).'),
        B.n2Horizontal, ['muK*m*g', 'm*aMag'], { aMag: 'm/s²' }),
      st('a = \\mu_k g',
        tri('两边除以 m。加速度大小与质量无关，方向与物块相对接触面的速度方向相反。',
          'Divide by m. The magnitude does not depend on the mass; the direction is opposite to the velocity of the block relative to the surface.',
          'Division durch m. Der Betrag hängt nicht von der Masse ab; die Richtung ist der Geschwindigkeit des Klotzes relativ zur Unterlage entgegengesetzt.'),
        B.solve, ['aMag', 'muK*g'], { aMag: 'm/s²' })
    ]
  },
  {
    formula: 'flat.N',
    title: tri('支持力', 'Normal force', 'Normalkraft'),
    uses: ['flat.forces'],
    steps: [
      st('N = mg',
        tri('移项：只受重力、支持力和摩擦力时，支持力与重力大小相等（与物块是否滑动无关）。',
          'Rearrange: with only weight, normal force and friction acting, the normal force equals the weight (whether or not the block slides).',
          'Umstellen: Wirken nur Gewichtskraft, Normalkraft und Reibung, ist die Normalkraft gleich der Gewichtskraft (unabhängig davon, ob der Klotz gleitet).'),
        B.rearrange, ['N', 'm*g'], { N: 'N' })
    ]
  },
  {
    formula: 'flat.f',
    title: tri('滑动摩擦力', 'Kinetic friction force', 'Gleitreibungskraft'),
    uses: ['flat.forces'],
    steps: [
      st('f = \\mu_k N',
        tri('物块相对接触面滑动，滑动摩擦力的大小与正压力成正比，正压力等于支持力 N。',
          'The block slides relative to the surface; kinetic friction is proportional to the force pressing the surfaces together, which equals the normal force N.',
          'Der Klotz gleitet relativ zur Unterlage; die Gleitreibungskraft ist proportional zur Anpresskraft, die gleich der Normalkraft N ist.'),
        B.kinetic, ['f', 'muK*N'], { f: 'N', N: 'N' }),
      st('f = \\mu_k mg',
        tri('代入 N = mg。',
          'Insert N = mg.',
          'Einsetzen von N = mg.'),
        B.prev, ['f', 'muK*m*g'], { f: 'N' })
    ]
  },
  {
    formula: 'flat.t',
    title: tri('相对滑动持续时间', 'Duration of the relative sliding', 'Dauer des relativen Gleitens'),
    note: tri('u 为接触面速度（静止地面 u = 0）', 'u is the velocity of the surface (u = 0 on fixed ground)', 'u ist die Geschwindigkeit der Unterlage (u = 0 auf festem Boden)'),
    uses: ['flat.forces'],
    steps: [
      st('a = \\mu_k g',
        tri('加速度大小为 μk g（见滑动时的加速度），方向使物块的速度趋近接触面的速度 u。',
          'The acceleration has magnitude μk g (see the acceleration while sliding) and drives the velocity of the block towards the surface velocity u.',
          'Die Beschleunigung hat den Betrag μk·g (siehe Beschleunigung beim Gleiten) und führt die Geschwindigkeit des Klotzes an die Geschwindigkeit u der Unterlage heran.'),
        B.n2Horizontal, ['aMag', 'muK*g'], { aMag: 'm/s²' }),
      st('|u - v| = |u - v_0| - \\mu_k g\\,t',
        tri('接触面的速度 u 不变（地面静止或传送带匀速），物块与接触面的速度差均匀减小。',
          'The surface velocity u is constant (fixed ground or a belt at constant speed), so the velocity difference between block and surface decreases uniformly.',
          'Die Geschwindigkeit u der Unterlage ist konstant (fester Boden oder gleichförmig laufendes Band); der Geschwindigkeitsunterschied zwischen Klotz und Unterlage nimmt gleichmäßig ab.'),
        B.uniformV, ['abs(u - v)', 'abs(u - v0) - muK*g*t'], { v: 'm/s' }),
      st('|u - v_0| - \\mu_k g\\,t_1 = 0',
        tri('速度差减为零时（物块与传送带共速，在地面上即停下）相对滑动结束。',
          'The relative sliding ends when the difference has dropped to zero (the block moves with the belt, or stops on the ground).',
          'Das relative Gleiten endet, wenn der Unterschied null geworden ist (der Klotz bewegt sich mit dem Band bzw. bleibt auf dem Boden liegen).'),
        B.common, ['abs(u - v0) - muK*g*t1', '0'], { t1: 's' }),
      st('t_1 = \\dfrac{|u - v_0|}{\\mu_k g}',
        tri('解出 t₁。物块轻放在传送带上（v₀ = 0）时 t₁ = u/(μk g)。',
          'Solve for t₁. For a block put gently onto a belt (v₀ = 0), t₁ = u/(μk g).',
          'Auflösen nach t₁. Wird der Klotz ohne Anfangsgeschwindigkeit aufs Band gelegt (v₀ = 0), ist t₁ = u/(μk·g).'),
        B.solve, ['t1', 'abs(u - v0)/(muK*g)'], { t1: 's' })
    ]
  },
  {
    formula: 'flat.x',
    title: tri('滑动阶段物块的位移', 'Displacement of the block while sliding', 'Verschiebung des Klotzes während des Gleitens'),
    uses: ['flat.forces'],
    steps: [
      st('a_x = \\mu_k g\\,\\operatorname{sgn}(u - v_0)',
        tri('沿水平方向取 x 轴：加速度大小 μk g，方向指向使物块速度趋近 u 的一侧。',
          'Take the x axis horizontally: the acceleration has magnitude μk g and points so that the velocity of the block approaches u.',
          'Die x-Achse liegt waagerecht: Die Beschleunigung hat den Betrag μk·g und zeigt so, dass sich die Geschwindigkeit des Klotzes an u annähert.'),
        B.kinetic, ['ax', 'muK*g*sign(u - v0)'], { ax: 'm/s²' }),
      st('u^2 - v_0^2 = 2a_x\\,\\Delta x',
        tri('滑动阶段物块做匀变速直线运动，结束时速度等于接触面的速度 u；Δx 为这段时间内物块的位移（带正负号）。',
          'While sliding the block moves with uniform acceleration and ends with the surface velocity u; Δx is its displacement in this time (with sign).',
          'Während des Gleitens bewegt sich der Klotz gleichmäßig beschleunigt und hat am Ende die Geschwindigkeit u; Δx ist seine Verschiebung in dieser Zeit (vorzeichenbehaftet).'),
        B.uniformVX, ['u^2 - v0^2', '2*ax*dx'], { ax: 'm/s²', dx: 'm' }),
      st('x_1 = |\\Delta x| = \\dfrac{|u^2 - v_0^2|}{2\\mu_k g}',
        tri('解出 Δx，取其大小 x₁（|a_x| = μk g）。在静止地面上 u = 0，x₁ = v₀²/(2μk g)。',
          'Solve for Δx and take its magnitude x₁ (|a_x| = μk g). On fixed ground u = 0 and x₁ = v₀²/(2μk g).',
          'Nach Δx auflösen und den Betrag x₁ bilden (|a_x| = μk·g). Auf festem Boden ist u = 0 und x₁ = v₀²/(2μk·g).'),
        B.solve, ['x1', 'abs(u^2 - v0^2)/(2*muK*g)'], { x1: 'm' })
    ]
  },
  {
    formula: 'flat.ds',
    title: tri('相对滑动距离', 'Relative sliding distance', 'Relativer Gleitweg'),
    uses: ['flat.forces'],
    steps: [
      st('t_1 = \\dfrac{|u - v_0|}{\\mu_k g}',
        tri('相对滑动持续的时间（见相对滑动持续时间）。',
          'Duration of the relative sliding (see that formula).',
          'Dauer des relativen Gleitens (siehe die entsprechende Formel).'),
        B.earlier, ['t1', 'abs(u - v0)/(muK*g)'], { t1: 's' }),
      st('x_1 = \\dfrac{v_0 + u}{2}\\,t_1',
        tri('物块做匀变速直线运动，位移等于平均速度乘时间（末速度为 u）。',
          'The block moves with uniform acceleration; its displacement is the mean velocity times the time (final velocity u).',
          'Der Klotz bewegt sich gleichmäßig beschleunigt; seine Verschiebung ist mittlere Geschwindigkeit mal Zeit (Endgeschwindigkeit u).'),
        B.meanV, ['x1', '(v0 + u)/2*t1'], { x1: 'm', t1: 's' }),
      st('x_2 = u\\,t_1',
        tri('同一时间内接触面（传送带）移动的距离；静止地面 x₂ = 0。',
          'Distance moved by the surface (belt) in the same time; x₂ = 0 for fixed ground.',
          'Weg der Unterlage (des Bandes) in derselben Zeit; auf festem Boden ist x₂ = 0.'),
        B.uniformMotion, ['x2', 'u*t1'], { x2: 'm', t1: 's' }),
      st('\\Delta s = |x_2 - x_1| = \\dfrac{|u - v_0|}{2}\\,t_1',
        tri('相对速度在滑动过程中不改变方向，相对滑动距离等于两者位移之差的大小。',
          'The relative velocity keeps its direction while sliding, so the sliding distance is the magnitude of the difference of the two displacements.',
          'Die Relativgeschwindigkeit behält während des Gleitens ihre Richtung; der relative Gleitweg ist der Betrag der Differenz der beiden Verschiebungen.'),
        B.relDisp, ['ds', 'abs(u - v0)/2*t1'], { ds: 'm', t1: 's' }),
      st('\\Delta s = \\dfrac{(u - v_0)^2}{2\\mu_k g}',
        tri('代入 t₁。',
          'Insert t₁.',
          'Einsetzen von t₁.'),
        B.prev, ['ds', '(u - v0)^2/(2*muK*g)'], { ds: 'm' })
    ]
  },
  {
    formula: 'flat.Q',
    title: tri('摩擦生热', 'Heat produced by friction', 'Reibungswärme'),
    uses: ['flat.forces'],
    steps: [
      st('W_f = f_x x_1 - f_x x_2 = -f\\,\\Delta s',
        tri('一对滑动摩擦力做功：接触面对物块的摩擦力 f_x 做功 f_x x₁，物块对接触面的反作用力 −f_x 做功 −f_x x₂；f_x 与 x₂ − x₁ 同号，二者之和为 −fΔs。',
          'Work of the pair of kinetic friction forces: the force f_x of the surface on the block does work f_x x₁, the reaction −f_x on the surface does −f_x x₂; since f_x has the sign of x₂ − x₁, the sum is −fΔs.',
          'Arbeit des Paares der Gleitreibungskräfte: Die Kraft f_x der Unterlage auf den Klotz verrichtet f_x·x₁, die Gegenkraft −f_x auf die Unterlage verrichtet −f_x·x₂; da f_x das Vorzeichen von x₂ − x₁ hat, ist die Summe −f·Δs.'),
        tri('牛顿第三定律；功的定义', "Newton's third law; definition of work", 'Drittes Newtonsches Gesetz; Definition der Arbeit'), ['Wf', '-f*ds'], { Wf: 'J', f: 'N', ds: 'm' }),
      st('Q = -W_f = f\\,\\Delta s',
        tri('一对滑动摩擦力做功的代数和为负，减少的机械能转化为内能。',
          'The total work of the pair is negative; the mechanical energy lost becomes internal energy.',
          'Die Gesamtarbeit des Paares ist negativ; die verlorene mechanische Energie wird zu innerer Energie.'),
        B.heat, ['Q', 'f*ds'], { Q: 'J', f: 'N', ds: 'm' }),
      st('Q = \\mu_k mg\\,\\Delta s = \\mu_k mg\\cdot\\dfrac{(u - v_0)^2}{2\\mu_k g}',
        tri('代入 f = μk mg 与相对滑动距离 Δs。化简得 Q = ½m(u − v₀)²，与 μk 无关。',
          'Insert f = μk mg and the relative sliding distance Δs. Simplified, Q = ½m(u − v₀)², independent of μk.',
          'Einsetzen von f = μk·mg und des relativen Gleitwegs Δs. Vereinfacht ist Q = ½m(u − v₀)², unabhängig von μk.'),
        B.prev, ['Q', 'muK*m*g*(u - v0)^2/(2*muK*g)'], { Q: 'J' })
    ]
  },
  {
    formula: 'flat.W',
    title: tri('传送带电机多做的功', 'Extra work done by the belt motor', 'Zusätzliche Arbeit des Bandmotors'),
    uses: ['flat.forces'],
    steps: [
      st('F = f = \\mu_k mg',
        tri('传送带匀速运行：物块对传送带的摩擦力（与物块受的摩擦力等大反向）由电机额外的牵引力 F 平衡。',
          'The belt runs at constant speed: the friction force of the block on the belt (equal and opposite to the friction on the block) is balanced by an extra driving force F of the motor.',
          'Das Band läuft gleichförmig: Die Reibungskraft des Klotzes auf das Band (gleich groß und entgegengesetzt zur Reibung auf den Klotz) wird durch eine zusätzliche Antriebskraft F des Motors ausgeglichen.'),
        tri('牛顿第三定律；传送带匀速（合力为零）', "Newton's third law; belt at constant speed (zero net force)", 'Drittes Newtonsches Gesetz; Band gleichförmig (resultierende Kraft null)'), ['F', 'muK*m*g'], { F: 'N' }),
      st('x_2 = u\\,t_1',
        tri('相对滑动期间传送带移动的距离，t₁ = |u − v₀|/(μk g)。',
          'Distance moved by the belt during the relative sliding, with t₁ = |u − v₀|/(μk g).',
          'Weg des Bandes während des relativen Gleitens, mit t₁ = |u − v₀|/(μk·g).'),
        B.uniformMotion, ['x2', 'u*t1'], { x2: 'm', t1: 's' }),
      st('W = F x_2\\,\\mathrm{sgn}(u - v_0) = \\mu_k mg\\,u\\,\\dfrac{u - v_0}{\\mu_k g} = mu(u - v_0)',
        tri('电机因物块而多做的功等于 F 做的功。u 带正负号（x 轴水平向右）；F 与摩擦力对物块的方向相同：u > v₀ 时（例如物块轻放在向右运行的传送带上）F 沿 +x，u < v₀ 时沿 −x，所以 W = μk mg u t₁·sgn(u − v₀) = mu(u − v₀)。能量角度：W = ΔE_k + Q。',
          'The extra work of the motor is the work of F. u carries its sign (x axis horizontal, to the right); F has the direction of the friction on the block: +x when u > v₀ (e.g. a block put at rest onto a belt running to the right), −x when u < v₀, so W = μk mg u t₁·sgn(u − v₀) = mu(u − v₀). In energy terms: W = ΔE_k + Q.',
          'Die zusätzliche Arbeit des Motors ist die Arbeit von F. u ist vorzeichenbehaftet (x-Achse waagerecht nach rechts); F hat die Richtung der Reibungskraft auf den Klotz: +x für u > v₀ (z. B. ein ruhend aufgelegter Klotz auf einem nach rechts laufenden Band), −x für u < v₀; daher gilt W = μk·mg·u·t₁·sgn(u − v₀) = m·u·(u − v₀). Energetisch gilt W = ΔE_kin + Q.'),
        B.workDef, ['W', 'muK*m*g*u*(u - v0)/(muK*g)'], { W: 'J' })
    ]
  }
]
