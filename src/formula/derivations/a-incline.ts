/**
 * Derivations of the situation "incline": a block on a fixed incline or an inclined belt (manual 26.50,
 * D28). Axes: x down the incline (positive), y perpendicular to it. v₀, v, s, a are components down the
 * incline; u is the belt surface velocity down the incline (0 for a fixed incline).
 */
import type { Derivation, SharedSteps } from './types'
import { B, CAUSE_NUM, st, tri } from './a-common'

/** Shared steps of the incline situation. */
export const INCLINE_SHARED: SharedSteps[] = [
  {
    id: 'incline.forces',
    title: tri('受力分析与重力的分解', 'Forces and resolution of the weight', 'Kräfte und Zerlegung der Gewichtskraft'),
    steps: [
      st('m\\vec g + \\vec N + \\vec f = m\\vec a',
        tri('以物块为研究对象：它受重力 mg、斜面的支持力 N（垂直斜面）和摩擦力 f（沿斜面，方向由相对滑动方向决定；光滑时 f = 0）。',
          'Take the block as the body under study: it is acted on by its weight mg, the normal force N of the incline (perpendicular to the surface) and the friction force f (along the surface, its direction set by the relative sliding; f = 0 on a smooth surface).',
          'Wir betrachten den Klotz: Auf ihn wirken die Gewichtskraft mg, die Normalkraft N der schiefen Ebene (senkrecht zur Oberfläche) und die Reibungskraft f (parallel zur Oberfläche, ihre Richtung hängt von der Relativbewegung ab; bei reibungsfreier Ebene ist f = 0).'),
        B.freeBody, ['m*g + N + f', 'm*a'], { N: 'N', f: 'N' }),
      st('F_{\\parallel} = mg\\sin\\theta',
        tri('取沿斜面向下为 x 轴正方向、垂直斜面为 y 轴，把重力正交分解：沿斜面向下的分力为 mg sinθ。',
          'Take the x axis down the incline and the y axis perpendicular to it, and resolve the weight: its component down the incline is mg sin θ.',
          'Wir legen die x-Achse hangabwärts und die y-Achse senkrecht zur Ebene und zerlegen die Gewichtskraft: Die Hangabtriebskraft beträgt mg·sin θ.'),
        B.resolve, ['Fpar', 'm*g*sin(theta)'], { Fpar: 'N' }),
      st('F_{\\perp} = mg\\cos\\theta',
        tri('重力垂直斜面向下的分力（把物块压向斜面的分力）为 mg cosθ。',
          'The component of the weight perpendicular to the incline (pressing the block onto it) is mg cos θ.',
          'Die Komponente senkrecht zur Ebene (die Normalkomponente der Gewichtskraft, die den Klotz andrückt) beträgt mg·cos θ.'),
        B.resolve, ['Fperp', 'm*g*cos(theta)'], { Fperp: 'N' })
    ]
  },
  {
    id: 'incline.normal',
    title: tri('垂直斜面方向', 'Perpendicular to the incline', 'Senkrecht zur schiefen Ebene'),
    steps: [
      st('N - mg\\cos\\theta = 0',
        tri('物块始终贴着斜面运动，垂直斜面方向的加速度为零，所以该方向上的合力为零。',
          'The block stays on the surface, so its acceleration perpendicular to the incline is zero, and so is the net force in that direction.',
          'Der Klotz bleibt auf der Ebene; senkrecht zu ihr ist seine Beschleunigung null und damit auch die resultierende Kraft in dieser Richtung.'),
        B.n2Normal, ['N - m*g*cos(theta)', '0'], { N: 'N' })
    ]
  }
]

/** Derivations of the incline formulas. */
export const INCLINE_DERIVATIONS: Derivation[] = [
  {
    formula: 'incline.a.down',
    title: tri('沿斜面的加速度（相对斜面向下滑）', 'Acceleration along the incline (sliding down relative to the surface)', 'Beschleunigung längs der schiefen Ebene (relativ zur Oberfläche abwärts gleitend)'),
    note: tri('沿斜面向下为正', 'Positive down the incline', 'Hangabwärts positiv'),
    causes: [CAUSE_NUM],
    uses: ['incline.forces', 'incline.normal'],
    steps: [
      st('f = \\mu_k N = \\mu_k mg\\cos\\theta',
        tri('物块相对接触面向下滑，滑动摩擦力沿斜面向上，大小为 μk N；由垂直斜面方向的方程，N = mg cosθ。',
          'The block slides down relative to the surface, so kinetic friction acts up the incline with magnitude μk N; from the perpendicular direction, N = mg cos θ.',
          'Der Klotz gleitet relativ zur Oberfläche abwärts, also wirkt die Gleitreibungskraft hangaufwärts mit dem Betrag μk·N; aus der Gleichung senkrecht zur Ebene folgt N = mg·cos θ.'),
        B.kinetic, ['f', 'muK*m*g*cos(theta)'], { f: 'N' }),
      st('mg\\sin\\theta - \\mu_k mg\\cos\\theta = ma',
        tri('沿斜面方向（向下为正）列方程：重力的分力沿斜面向下，摩擦力沿斜面向上。',
          'Along the incline (down positive): the component of the weight points down the incline, friction points up.',
          'Längs der Ebene (hangabwärts positiv): Die Hangabtriebskraft zeigt hangabwärts, die Reibungskraft hangaufwärts.'),
        B.n2Along, ['m*g*sin(theta) - muK*m*g*cos(theta)', 'm*a']),
      st('a = g(\\sin\\theta - \\mu_k\\cos\\theta)',
        tri('两边除以 m。a 可正可负：μk < tanθ 时加速下滑，μk > tanθ 时减速下滑；光滑时 μk = 0，a = g sinθ。',
          'Divide by m. The sign of a can be either: for μk < tan θ the block speeds up, for μk > tan θ it slows down; on a smooth surface μk = 0 and a = g sin θ.',
          'Division durch m. a kann beide Vorzeichen haben: Für μk < tan θ wird der Klotz schneller, für μk > tan θ langsamer; ohne Reibung ist μk = 0 und a = g·sin θ.'),
        B.solve, ['a', 'g*(sin(theta) - muK*cos(theta))'])
    ]
  },
  {
    formula: 'incline.a.up',
    title: tri('沿斜面的加速度（相对斜面向上滑）', 'Acceleration along the incline (sliding up relative to the surface)', 'Beschleunigung längs der schiefen Ebene (relativ zur Oberfläche aufwärts gleitend)'),
    note: tri('沿斜面向下为正；摩擦力沿斜面向下', 'Positive down the incline; friction acts down the incline', 'Hangabwärts positiv; die Reibungskraft wirkt hangabwärts'),
    causes: [CAUSE_NUM],
    uses: ['incline.forces', 'incline.normal'],
    steps: [
      st('f = \\mu_k N = \\mu_k mg\\cos\\theta',
        tri('物块相对接触面向上滑（例如沿斜面上冲，或放在向下运行且比它快的传送带上），滑动摩擦力沿斜面向下，大小为 μk mg cosθ。',
          'The block slides up relative to the surface (e.g. it is pushed up the incline, or it lies on a belt running down faster than the block), so kinetic friction acts down the incline with magnitude μk mg cos θ.',
          'Der Klotz gleitet relativ zur Oberfläche aufwärts (z. B. weil er hangaufwärts gestoßen wurde oder auf einem schneller abwärts laufenden Förderband liegt); die Gleitreibungskraft wirkt daher hangabwärts mit dem Betrag μk·mg·cos θ.'),
        B.kinetic, ['f', 'muK*m*g*cos(theta)'], { f: 'N' }),
      st('mg\\sin\\theta + \\mu_k mg\\cos\\theta = ma',
        tri('沿斜面方向（向下为正）列方程：重力的分力和摩擦力都沿斜面向下。',
          'Along the incline (down positive): both the component of the weight and the friction force point down the incline.',
          'Längs der Ebene (hangabwärts positiv): Hangabtriebskraft und Reibungskraft zeigen beide hangabwärts.'),
        B.n2Along, ['m*g*sin(theta) + muK*m*g*cos(theta)', 'm*a']),
      st('a = g(\\sin\\theta + \\mu_k\\cos\\theta)',
        tri('两边除以 m。a > 0 沿斜面向下：上冲的物块做匀减速运动，被传送带带动的物块加速向下。',
          'Divide by m. a > 0 points down the incline: a block moving up decelerates uniformly, a block dragged by the belt speeds up downwards.',
          'Division durch m. a > 0 zeigt hangabwärts: Ein aufwärts gleitender Klotz wird gleichmäßig abgebremst, ein vom Band mitgenommener Klotz wird abwärts beschleunigt.'),
        B.solve, ['a', 'g*(sin(theta) + muK*cos(theta))'])
    ]
  },
  {
    formula: 'incline.a.stick',
    title: tri('与斜面相对静止', 'At rest relative to the incline', 'Relativ zur schiefen Ebene in Ruhe'),
    steps: [
      st('v = u',
        tri('物块与接触面相对静止，它的速度等于接触面的速度 u（固定斜面 u = 0）。',
          'The block does not move relative to the surface, so its velocity equals the surface velocity u (u = 0 for a fixed incline).',
          'Der Klotz ruht relativ zur Oberfläche; seine Geschwindigkeit ist gleich der Geschwindigkeit u der Oberfläche (u = 0 bei fester Ebene).'),
        tri('相对静止的条件', 'Condition of relative rest', 'Bedingung der relativen Ruhe'), ['v', 'u'], { v: 'm/s' }),
      st('a = \\dfrac{\\Delta v}{\\Delta t} = \\dfrac{\\Delta u}{\\Delta t}',
        tri('斜面静止或传送带匀速运行，u 不变。',
          'The incline is fixed or the belt runs at constant speed, so u does not change.',
          'Die Ebene ist fest oder das Band läuft mit konstanter Geschwindigkeit; u ändert sich nicht.'),
        B.accDef, ['a', 'du/dt'], { du: 'm/s', dt: 's' }),
      st('a = 0',
        tri('物块随斜面（传送带）静止或做匀速直线运动，加速度为零，所受合力为零。',
          'The block stays at rest or moves uniformly with the incline (belt): its acceleration and the net force on it are zero.',
          'Der Klotz ruht oder bewegt sich gleichförmig mit der Ebene (dem Band): Beschleunigung und resultierende Kraft sind null.'),
        B.prev, ['a', '0'])
    ]
  },
  {
    formula: 'incline.N',
    title: tri('斜面的支持力', 'Normal force of the incline', 'Normalkraft der schiefen Ebene'),
    causes: [CAUSE_NUM],
    uses: ['incline.forces', 'incline.normal'],
    steps: [
      st('N = mg\\cos\\theta',
        tri('移项得支持力。它只取决于质量和倾角，与物块是否滑动、向哪边滑动无关，也与传送带的运动无关。',
          'Rearranging gives the normal force. It depends only on the mass and the angle, not on whether or which way the block slides, nor on the motion of a belt.',
          'Umstellen liefert die Normalkraft. Sie hängt nur von Masse und Neigungswinkel ab, nicht davon, ob und in welche Richtung der Klotz gleitet, und auch nicht von der Bewegung eines Förderbands.'),
        B.rearrange, ['N', 'm*g*cos(theta)'], { N: 'N' })
    ]
  },
  {
    formula: 'incline.f.kinetic',
    title: tri('滑动摩擦力', 'Kinetic friction force', 'Gleitreibungskraft'),
    uses: ['incline.forces', 'incline.normal'],
    steps: [
      st('f = \\mu_k N',
        tri('物块相对接触面滑动，受滑动摩擦力，其大小与正压力成正比；正压力等于支持力 N。',
          'The block slides relative to the surface, so it experiences kinetic friction proportional to the force pressing the surfaces together, which equals the normal force N.',
          'Der Klotz gleitet relativ zur Oberfläche; die Gleitreibungskraft ist proportional zur Anpresskraft, die gleich der Normalkraft N ist.'),
        B.kinetic, ['f', 'muK*N'], { f: 'N', N: 'N' }),
      st('f = \\mu_k mg\\cos\\theta',
        tri('代入 N = mg cosθ。摩擦力的大小与滑动方向无关，方向与相对滑动方向相反。',
          'Insert N = mg cos θ. The magnitude does not depend on the direction of sliding; the direction is opposite to the relative sliding.',
          'Einsetzen von N = mg·cos θ. Der Betrag hängt nicht von der Gleitrichtung ab; die Richtung ist der Relativbewegung entgegengesetzt.'),
        B.prev, ['f', 'muK*m*g*cos(theta)'], { f: 'N' })
    ]
  },
  {
    formula: 'incline.f.static',
    title: tri('静摩擦力（平衡）', 'Static friction (equilibrium)', 'Haftreibungskraft (Gleichgewicht)'),
    uses: ['incline.forces', 'incline.normal'],
    steps: [
      st('a = 0',
        tri('物块与斜面（或匀速运行的传送带）相对静止，加速度为零。',
          'The block is at rest relative to the incline (or to a belt running at constant speed), so its acceleration is zero.',
          'Der Klotz ruht relativ zur Ebene (oder zu einem gleichförmig laufenden Band); seine Beschleunigung ist null.'),
        tri('与接触面相对静止，接触面静止或匀速', 'At rest relative to a surface that is fixed or moves uniformly', 'Relativ zu einer festen oder gleichförmig bewegten Oberfläche in Ruhe'), ['a', '0']),
      st('mg\\sin\\theta - f = 0',
        tri('沿斜面方向（向下为正）：重力的分力 mg sinθ 必须由沿斜面向上的静摩擦力 f 平衡。',
          'Along the incline (down positive): the component mg sin θ of the weight must be balanced by a static friction force f acting up the incline.',
          'Längs der Ebene (hangabwärts positiv): Die Hangabtriebskraft mg·sin θ muss durch eine hangaufwärts gerichtete Haftreibungskraft f ausgeglichen werden.'),
        tri('牛顿第二定律（沿斜面方向，a = 0）', "Newton's second law along the incline (a = 0)", 'Zweites Newtonsches Gesetz parallel zur Ebene (a = 0)'), ['m*g*sin(theta) - f', '0'], { f: 'N' }),
      st('mg\\sin\\theta \\le \\mu_s mg\\cos\\theta',
        tri('静摩擦力不能超过最大静摩擦力 μs N = μs mg cosθ，所以能保持静止的条件是 μs ≥ tanθ。',
          'Static friction cannot exceed its maximum μs N = μs mg cos θ, so the block can stay at rest only if μs ≥ tan θ.',
          'Die Haftreibungskraft kann höchstens μs·N = μs·mg·cos θ betragen; der Klotz bleibt also nur für μs ≥ tan θ in Ruhe.'),
        B.maxStatic, ['m*g*sin(theta)', 'muS*m*g*cos(theta)']),
      st('f = mg\\sin\\theta',
        tri('静摩擦力的大小等于重力沿斜面的分力，方向沿斜面向上；它由平衡条件决定，与 μs 无关。',
          'The static friction force equals the component of the weight along the incline and points up the incline; it is fixed by equilibrium and does not depend on μs.',
          'Die Haftreibungskraft ist gleich der Hangabtriebskraft und zeigt hangaufwärts; sie folgt aus dem Gleichgewicht und hängt nicht von μs ab.'),
        B.solve, ['f', 'm*g*sin(theta)'], { f: 'N' })
    ]
  },
  {
    formula: 'incline.v',
    title: tri('速度—时间关系', 'Velocity–time relation', 'Geschwindigkeit-Zeit-Gesetz'),
    note: tri('a 取上面的理论值；v 沿斜面向下为正', 'a is the theoretical value above; v is positive down the incline', 'a ist der obige theoretische Wert; v ist hangabwärts positiv'),
    steps: [
      st('\\dfrac{\\Delta v}{\\Delta t} = a',
        tri('本阶段滑动方向不变，物块受的各力大小、方向都不变，加速度 a 恒定，取上面求出的理论值。',
          'In this phase the direction of sliding does not change, so all forces on the block are constant and the acceleration a is constant; it is the theoretical value found above.',
          'In diesem Abschnitt ändert sich die Gleitrichtung nicht; alle Kräfte auf den Klotz sind konstant, also auch die Beschleunigung a. Sie ist der oben berechnete theoretische Wert.'),
        tri('牛顿第二定律：合力恒定，加速度恒定', "Newton's second law: constant net force, constant acceleration", 'Zweites Newtonsches Gesetz: konstante resultierende Kraft, konstante Beschleunigung'), ['dv/dt', 'a'], { dv: 'm/s', dt: 's' }),
      st('v = v_0 + at',
        tri('物块做匀变速直线运动；从本阶段开始计时，t = 0 时 v = v₀。',
          'The block moves with uniform acceleration; time is counted from the start of this phase, where v = v₀.',
          'Der Klotz bewegt sich gleichmäßig beschleunigt; die Zeit wird ab Beginn dieses Abschnitts gezählt, dort ist v = v₀.'),
        B.uniformV, ['v', 'v0 + a*t'], { v: 'm/s' })
    ]
  },
  {
    formula: 'incline.s',
    title: tri('位移—时间关系', 'Displacement–time relation', 'Weg-Zeit-Gesetz'),
    steps: [
      st('v = v_0 + at',
        tri('本阶段加速度恒定，速度随时间均匀变化（见速度—时间关系）。',
          'The acceleration is constant in this phase, so the velocity changes linearly with time (see the velocity–time relation).',
          'In diesem Abschnitt ist die Beschleunigung konstant; die Geschwindigkeit ändert sich linear mit der Zeit (siehe Geschwindigkeit-Zeit-Gesetz).'),
        B.uniformV, ['v', 'v0 + a*t'], { v: 'm/s' }),
      st('s = \\dfrac{v_0 + v}{2}\\,t',
        tri('v–t 图像是直线，位移等于图线与时间轴围成的梯形面积，即平均速度乘时间。',
          'The v–t graph is a straight line; the displacement is the trapezoidal area under it, i.e. the mean velocity times the time.',
          'Das v-t-Diagramm ist eine Gerade; die Verschiebung ist die Trapezfläche darunter, also mittlere Geschwindigkeit mal Zeit.'),
        B.meanV, ['s', '(v0 + v)/2*t'], { s: 'm', v: 'm/s' }),
      st('s = v_0t + \\tfrac{1}{2}at^2',
        tri('代入 v = v₀ + at。s 沿斜面向下为正。',
          'Insert v = v₀ + at. s is positive down the incline.',
          'Einsetzen von v = v₀ + a·t. s ist hangabwärts positiv.'),
        B.prev, ['s', 'v0*t + a*t^2/2'], { s: 'm' })
    ]
  },
  {
    formula: 'incline.t.common',
    title: tri('达到共速所需时间（传送带）', 'Time to reach the belt velocity (belt)', 'Zeit bis zur gemeinsamen Geschwindigkeit (Förderband)'),
    steps: [
      st('v = v_0 + at',
        tri('物块相对传送带滑动期间做匀变速直线运动，a 为本阶段的理论加速度。',
          'While the block slides on the belt it moves with uniform acceleration; a is the theoretical acceleration of this phase.',
          'Solange der Klotz auf dem Band gleitet, bewegt er sich gleichmäßig beschleunigt; a ist die theoretische Beschleunigung dieses Abschnitts.'),
        B.uniformV, ['v', 'v0 + a*t'], { v: 'm/s' }),
      st('v_0 + at_1 = u',
        tri('物块的速度等于带速 u 时相对滑动结束（共速）。',
          'The relative sliding ends when the velocity of the block equals the belt velocity u (common velocity).',
          'Das relative Gleiten endet, wenn die Geschwindigkeit des Klotzes gleich der Bandgeschwindigkeit u ist (gemeinsame Geschwindigkeit).'),
        B.common, ['v0 + a*t1', 'u'], { t1: 's' }),
      st('t_1 = \\dfrac{u - v_0}{a} = \\dfrac{|u - v_0|}{|a|}',
        tri('解出 t₁。本阶段以共速结束，说明加速度使物块与传送带的速度差减小，u − v₀ 与 a 同号，可以写成绝对值之比。',
          'Solve for t₁. The phase ends with common velocity, so the acceleration reduces the velocity difference: u − v₀ and a have the same sign and the ratio can be written with absolute values.',
          'Auflösen nach t₁. Der Abschnitt endet mit gemeinsamer Geschwindigkeit, die Beschleunigung verkleinert also den Geschwindigkeitsunterschied: u − v₀ und a haben dasselbe Vorzeichen, und man kann den Quotienten der Beträge schreiben.'),
        B.solve, ['t1', 'abs(u - v0)/abs(a)'], { t1: 's' })
    ]
  }
]
