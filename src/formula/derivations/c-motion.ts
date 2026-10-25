/**
 * Derivations of the 26.51 situations "uniform", "const-force" and "lever" (manual 26.51, D44): uniform motion
 * (Newton's first law), a block pulled by a constant force F at the angle α above the horizontal on a horizontal
 * surface (work, power, the work–energy and impulse–momentum theorems), and a lever in balance.
 */
import type { Derivation, SharedSteps } from './types'
import { B, CAUSE_NUM, st, tri } from './a-common'

/** Shared steps of the 26.51 motion situations. */
export const MOTION_SHARED: SharedSteps[] = [
  {
    id: 'uniform.forces',
    title: tri('受力分析：合力为零', 'Forces: the net force is zero', 'Kräfte: Die resultierende Kraft ist null'),
    steps: [
      st('\\textstyle\\sum \\vec F = 0',
        tri('物体在光滑水平面上运动：竖直方向重力与支持力平衡，水平方向不受力（没有摩擦）。不受重力也不接触任何物体时同样如此。',
          'The body moves on a smooth horizontal surface: vertically its weight and the normal force balance, horizontally no force acts (no friction). The same holds with no gravity and no contact.',
          'Der Körper bewegt sich auf einer glatten waagerechten Fläche: Senkrecht heben sich Gewichtskraft und Normalkraft auf, waagerecht wirkt keine Kraft (keine Reibung). Ebenso ohne Schwerkraft und ohne Berührung.'),
        tri('受力分析', 'Free-body diagram', 'Kräfteanalyse'), ['Fnet', '0'], { Fnet: 'N' }),
      st('\\vec v = \\text{const}',
        tri('合力为零的物体保持原来的运动状态：静止的保持静止，运动的做匀速直线运动。',
          'A body with zero net force keeps its state of motion: at rest it stays at rest, moving it moves uniformly in a straight line.',
          'Ein Körper ohne resultierende Kraft behält seinen Bewegungszustand: In Ruhe bleibt er in Ruhe, in Bewegung bewegt er sich gleichförmig geradlinig.'),
        tri('牛顿第一定律（惯性定律）', "Newton's first law (law of inertia)", 'Erstes Newtonsches Gesetz (Trägheitsgesetz)'), ['a', '0'], { a: 'm/s²' })
    ]
  },
  {
    id: 'const-force.forces',
    title: tri('受力分析与正交分解', 'Forces and their components', 'Kräfte und ihre Komponenten'),
    steps: [
      st('F_x = F\\cos\\alpha,\\quad F_y = F\\sin\\alpha',
        tri('取沿拉力的水平方向为 x 轴、竖直向上为 y 轴，把拉力分解为水平分力和竖直分力。',
          'Take x horizontally along the pull and y vertically upwards, and resolve the pull into a horizontal and a vertical component.',
          'x waagerecht in Zugrichtung, y senkrecht nach oben; die Zugkraft in eine waagerechte und eine senkrechte Komponente zerlegen.'),
        tri('力的正交分解', 'Resolution of a force into perpendicular components', 'Zerlegung einer Kraft in senkrechte Komponenten'), ['Fx', 'F*cos(alpha)'], { Fx: 'N' }),
      st('N + F\\sin\\alpha = mg',
        tri('物块不离开水平面，竖直方向合力为零：支持力与拉力的竖直分力一起平衡重力。',
          'The block stays on the surface, so the vertical forces balance: the normal force and the vertical component of the pull together balance the weight.',
          'Der Klotz bleibt auf der Fläche, die senkrechten Kräfte heben sich auf: Normalkraft und senkrechte Zugkomponente tragen zusammen die Gewichtskraft.'),
        B.n2Vertical, ['N + F*sin(alpha)', 'm*g'], { N: 'N' }),
      st('f = \\mu N = \\mu(mg - F\\sin\\alpha)',
        tri('滑动摩擦力与支持力成正比，方向与运动方向相反。斜向上拉时支持力变小，摩擦力也变小。',
          'Kinetic friction is proportional to the normal force and opposes the motion. Pulling upwards at an angle reduces the normal force and with it the friction.',
          'Die Gleitreibungskraft ist proportional zur Normalkraft und der Bewegung entgegengerichtet. Schräg nach oben ziehen verkleinert die Normalkraft und damit die Reibung.'),
        B.kinetic, ['f', 'muK*(m*g - F*sin(alpha))'], { f: 'N' })
    ]
  }
]

/** Derivations of the uniform-motion, constant-force and lever formulas. */
export const MOTION_DERIVATIONS: Derivation[] = [
  // ---- Uniform motion ----
  {
    formula: 'uni.s',
    title: tri('匀速直线运动的路程', 'Distance in uniform motion', 'Weg bei gleichförmiger Bewegung'),
    causes: [CAUSE_NUM],
    uses: ['uniform.forces'],
    steps: [
      st('s = vt',
        tri('速度大小和方向都不变，通过的路程与时间成正比。',
          'Speed and direction stay the same, so the distance travelled is proportional to the time.',
          'Betrag und Richtung der Geschwindigkeit bleiben gleich; der zurückgelegte Weg ist proportional zur Zeit.'),
        B.uniformMotion, ['s', 'v*t'])
    ]
  },
  {
    formula: 'uni.v',
    title: tri('速度 = 路程 ÷ 时间', 'Speed = distance ÷ time', 'Geschwindigkeit = Weg ÷ Zeit'),
    note: tri('s 取仿真中通过的路程；匀速运动中平均速度等于瞬时速度', 's is the distance travelled in the simulation; in uniform motion the average speed equals the instantaneous speed', 's ist der in der Simulation zurückgelegte Weg; bei gleichförmiger Bewegung ist die Durchschnittsgeschwindigkeit gleich der Momentangeschwindigkeit'),
    uses: ['uniform.forces'],
    steps: [
      st('\\bar v = \\dfrac{s}{t}',
        tri('平均速度（平均速率）等于通过的路程除以所用的时间，表示运动的快慢。',
          'The average speed is the distance travelled divided by the time taken; it measures how fast the body moves.',
          'Die Durchschnittsgeschwindigkeit ist der zurückgelegte Weg geteilt durch die benötigte Zeit; sie gibt an, wie schnell sich der Körper bewegt.'),
        B.velDef, ['vbar', 's/t'], { vbar: 'm/s' }),
      st('v = \\dfrac{s}{t}',
        tri('匀速运动中速度不变，任一时刻的速度都等于整段时间的平均速度。',
          'In uniform motion the speed does not change, so at every moment it equals the average speed over the whole time.',
          'Bei gleichförmiger Bewegung ändert sich die Geschwindigkeit nicht; sie ist zu jedem Zeitpunkt gleich der Durchschnittsgeschwindigkeit.'),
        tri('匀速直线运动', 'Uniform straight-line motion', 'Gleichförmige geradlinige Bewegung'), ['v', 's/t'])
    ]
  },
  {
    formula: 'uni.F',
    title: tri('牛顿第一定律：合力为零', "Newton's first law: zero net force", 'Erstes Newtonsches Gesetz: resultierende Kraft null'),
    uses: ['uniform.forces'],
    steps: [
      st('\\textstyle\\sum F = ma = 0',
        tri('速度不变，加速度为零，所以物体受到的合力为零；反过来，合力为零的物体速度不变。仿真值是质量乘以加速度。',
          'The velocity does not change, so the acceleration and hence the net force are zero; conversely a body with zero net force keeps its velocity. The simulated value is mass times acceleration.',
          'Die Geschwindigkeit ändert sich nicht, Beschleunigung und resultierende Kraft sind null; umgekehrt behält ein Körper ohne resultierende Kraft seine Geschwindigkeit. Der Simulationswert ist Masse mal Beschleunigung.'),
        B.n2, ['Fnet', '0'], { Fnet: 'N' })
    ]
  },
  // ---- Constant force ----
  {
    formula: 'cf.a',
    title: tri('恒力拉动物块的加速度', 'Acceleration of a block pulled by a constant force', 'Beschleunigung eines Klotzes unter konstanter Zugkraft'),
    method: tri('正交分解', 'Resolving forces', 'Kräftezerlegung'),
    causes: [CAUSE_NUM],
    uses: ['const-force.forces'],
    steps: [
      st('F\\cos\\alpha - f = ma',
        tri('水平方向：拉力的水平分力向前，滑动摩擦力向后。',
          'Horizontally: the horizontal component of the pull acts forwards, kinetic friction backwards.',
          'Waagerecht: Die waagerechte Zugkomponente wirkt nach vorn, die Gleitreibung nach hinten.'),
        B.n2Horizontal, ['F*cos(alpha) - f', 'm*a'], { f: 'N', a: 'm/s²' }),
      st('a = \\dfrac{F\\cos\\alpha - \\mu(mg - F\\sin\\alpha)}{m}',
        tri('代入摩擦力并解出 a。α = 0（水平拉）时 a = (F − μmg)/m。',
          'Insert the friction and solve for a. For α = 0 (horizontal pull), a = (F − μmg)/m.',
          'Reibung einsetzen und nach a auflösen. Für α = 0 (waagerecht ziehen) ist a = (F − μmg)/m.'),
        B.solve, ['a', '(F*cos(alpha) - muK*(m*g - F*sin(alpha)))/m'], { a: 'm/s²' })
    ]
  },
  {
    formula: 'cf.N',
    title: tri('斜拉时的支持力', 'Normal force when pulling at an angle', 'Normalkraft beim schrägen Ziehen'),
    uses: ['const-force.forces'],
    steps: [
      st('N = mg - F\\sin\\alpha',
        tri('由竖直方向的平衡解出支持力：向上拉（α > 0）时支持力小于重力，向下推（α < 0）时大于重力。',
          'Solve the vertical balance for the normal force: pulling upwards (α > 0) makes it smaller than the weight, pushing downwards (α < 0) larger.',
          'Das senkrechte Gleichgewicht nach der Normalkraft auflösen: Schräg nach oben ziehen (α > 0) macht sie kleiner als die Gewichtskraft, schräg nach unten drücken (α < 0) größer.'),
        B.solve, ['N', 'm*g - F*sin(alpha)'], { N: 'N' })
    ]
  },
  {
    formula: 'cf.W0',
    title: tri('功 = 力 × 距离', 'Work = force × distance', 'Arbeit = Kraft × Weg'),
    note: tri('s 取仿真中的位移', 's is the displacement in the simulation', 's ist die Verschiebung in der Simulation'),
    steps: [
      st('W = Fs',
        tri('力水平、与运动方向相同时，力做的功等于力的大小乘以物体在力的方向上移动的距离。功的单位是焦耳：1 J = 1 N·m。',
          'When the force is horizontal, along the motion, its work is the size of the force times the distance moved in its direction. Work is measured in joules: 1 J = 1 N·m.',
          'Wirkt die Kraft waagerecht in Bewegungsrichtung, ist ihre Arbeit Kraft mal Weg in Kraftrichtung. Die Einheit ist das Joule: 1 J = 1 N·m.'),
        B.workDef, ['W', 'F*s'], { W: 'J' })
    ]
  },
  {
    formula: 'cf.W',
    title: tri('恒力做功', 'Work done by a constant force', 'Arbeit einer konstanten Kraft'),
    note: tri('s 取仿真中的位移', 's is the displacement in the simulation', 's ist die Verschiebung in der Simulation'),
    steps: [
      st('W = F_xs = Fs\\cos\\alpha',
        tri('只有沿位移方向的分力 F cos α 做功；竖直分力与位移垂直，不做功。',
          'Only the component along the displacement, F cos α, does work; the vertical component is perpendicular to the displacement and does none.',
          'Nur die Komponente längs der Verschiebung, F·cos α, verrichtet Arbeit; die senkrechte Komponente steht senkrecht zur Verschiebung und verrichtet keine.'),
        tri('功的定义 W = Fs cos α', 'Definition of work, W = Fs cos α', 'Definition der Arbeit, W = F·s·cos α'), ['W', 'F*s*cos(alpha)'], { W: 'J' })
    ]
  },
  {
    formula: 'cf.P',
    title: tri('功率 = 力 × 速度', 'Power = force × velocity', 'Leistung = Kraft × Geschwindigkeit'),
    note: tri('v 取仿真中此刻的速度', 'v is the velocity at this moment in the simulation', 'v ist die momentane Geschwindigkeit in der Simulation'),
    steps: [
      st('P = \\dfrac{\\Delta W}{\\Delta t} = F\\cos\\alpha\\,\\dfrac{\\Delta s}{\\Delta t}',
        tri('功率表示做功的快慢，等于功除以所用时间。在很短的时间 Δt 内拉力做功 ΔW = F cos α · Δs。',
          'Power is the rate of doing work: work divided by time. In a short time Δt the pull does the work ΔW = F cos α · Δs.',
          'Leistung ist Arbeit pro Zeit. In einer kurzen Zeit Δt verrichtet die Zugkraft die Arbeit ΔW = F·cos α·Δs.'),
        tri('功率的定义 P = W/t', 'Definition of power, P = W/t', 'Definition der Leistung, P = W/t'), ['P', 'F*cos(alpha)*v'], { P: 'W' }),
      st('P = Fv\\cos\\alpha',
        tri('Δt 很短时 Δs/Δt 就是此刻的速度 v。拉力水平时 P = Fv：汽车功率一定时，速度越大，牵引力越小。',
          'For a short Δt, Δs/Δt is the velocity v at that moment. For a horizontal pull P = Fv: at a given power, the faster a car goes, the smaller its driving force.',
          'Für kurze Δt ist Δs/Δt die momentane Geschwindigkeit v. Bei waagerechtem Zug ist P = F·v: Bei gegebener Leistung ist die Antriebskraft eines Autos umso kleiner, je schneller es fährt.'),
        tri('瞬时速度的定义', 'Definition of instantaneous velocity', 'Definition der Momentangeschwindigkeit'), ['P', 'F*v*cos(alpha)'], { P: 'W' })
    ]
  },
  {
    formula: 'cf.dEk',
    title: tri('动能定理', 'Work–energy theorem', 'Arbeitssatz'),
    note: tri('合力做的功等于动能的增加量；s 取仿真中的位移', 'The work of the net force equals the gain in kinetic energy; s is the displacement in the simulation', 'Die Arbeit der resultierenden Kraft ist gleich dem Zuwachs an kinetischer Energie; s ist die Verschiebung in der Simulation'),
    uses: ['const-force.forces'],
    steps: [
      st('W_{\\text{net}} = (F\\cos\\alpha - f)\\,s',
        tri('重力、支持力和拉力的竖直分力都与位移垂直，不做功；拉力的水平分力做正功，摩擦力做负功。',
          'The weight, the normal force and the vertical component of the pull are perpendicular to the displacement and do no work; the horizontal component of the pull does positive work, friction negative work.',
          'Gewichtskraft, Normalkraft und senkrechte Zugkomponente stehen senkrecht zur Verschiebung und verrichten keine Arbeit; die waagerechte Zugkomponente verrichtet positive, die Reibung negative Arbeit.'),
        B.workDef, ['Wnet', '(F*cos(alpha) - f)*s'], { Wnet: 'J', f: 'N' }),
      st('\\Delta E_k = W_{\\text{net}}',
        tri('合外力对物体做的功等于物体动能的变化。',
          'The work done by the net force equals the change in kinetic energy.',
          'Die Arbeit der resultierenden Kraft ist gleich der Änderung der kinetischen Energie.'),
        tri('动能定理', 'Work–energy theorem', 'Arbeitssatz (Energiesatz der Mechanik)'), ['dEk', 'Wnet'], { dEk: 'J', Wnet: 'J' }),
      st('\\Delta E_k = [F\\cos\\alpha - \\mu(mg - F\\sin\\alpha)]\\,s',
        tri('代入摩擦力。',
          'Insert the friction force.',
          'Reibungskraft einsetzen.'),
        B.prev, ['dEk', '(F*cos(alpha) - muK*(m*g - F*sin(alpha)))*s'], { dEk: 'J' })
    ]
  },
  {
    formula: 'cf.J',
    title: tri('动量定理', 'Impulse–momentum theorem', 'Impulssatz'),
    uses: ['const-force.forces'],
    steps: [
      st('F_{\\text{net}} = F\\cos\\alpha - f',
        tri('水平方向的合力（竖直方向合力为零）。',
          'The net force is horizontal (the vertical forces balance).',
          'Die resultierende Kraft ist waagerecht (die senkrechten Kräfte heben sich auf).'),
        tri('水平方向的合力', 'Net force in the horizontal direction', 'Resultierende Kraft in waagerechter Richtung'), ['Fnet', 'F*cos(alpha) - f'], { Fnet: 'N', f: 'N' }),
      st('\\Delta p = F_{\\text{net}}\\,t',
        tri('合力的冲量等于动量的变化；合力恒定时冲量等于合力乘时间。',
          'The impulse of the net force equals the change in momentum; for a constant net force the impulse is force times time.',
          'Der Kraftstoß der resultierenden Kraft ist gleich der Impulsänderung; bei konstanter Kraft ist er Kraft mal Zeit.'),
        B.impulse, ['dp', 'Fnet*t'], { dp: 'kg·m/s', Fnet: 'N' }),
      st('\\Delta p = [F\\cos\\alpha - \\mu(mg - F\\sin\\alpha)]\\,t',
        tri('代入摩擦力。',
          'Insert the friction force.',
          'Reibungskraft einsetzen.'),
        B.prev, ['dp', '(F*cos(alpha) - muK*(m*g - F*sin(alpha)))*t'], { dp: 'kg·m/s' })
    ]
  },
  // ---- Lever ----
  {
    formula: 'lever.F',
    title: tri('杠杆平衡条件', 'Law of the lever', 'Hebelgesetz'),
    note: tri('F₂ = mg 为重物的重力；杠杆的重心在支点，自重不产生力矩', 'F₂ = mg is the weight of the load; the lever’s centre of mass is at the fulcrum, so its own weight has no moment', 'F₂ = m·g ist die Gewichtskraft der Last; der Schwerpunkt des Hebels liegt im Drehpunkt, sein Eigengewicht hat kein Drehmoment'),
    steps: [
      st('F_2 = mg',
        tri('阻力是重物的重力，通过固定点作用在杠杆上，它的作用线竖直向下。',
          'The load force is the weight of the load, passed on to the lever where it is fixed; its line of action is vertical.',
          'Die Lastkraft ist die Gewichtskraft der Last, die an der Befestigung auf den Hebel wirkt; ihre Wirkungslinie ist senkrecht.'),
        tri('二力平衡（重物静止）', 'Balance of two forces (the load is at rest)', 'Gleichgewicht zweier Kräfte (die Last ruht)'), ['F2', 'm*g'], { F2: 'N' }),
      st('M_G = 0',
        tri('杠杆的重心在支点上，自重的力臂为零，不产生力矩。',
          "The lever's centre of mass is at the fulcrum: its weight has zero lever arm and no moment.",
          'Der Schwerpunkt des Hebels liegt im Drehpunkt: Seine Gewichtskraft hat den Hebelarm null und kein Drehmoment.'),
        tri('力矩 = 力 × 力臂', 'Moment = force × lever arm', 'Drehmoment = Kraft × Hebelarm'), ['MG', '0'], { MG: 'N·m' }),
      st('F_1l_1 = F_2l_2',
        tri('杠杆静止：动力 F₁ 使杠杆转动的效果与阻力 F₂ 的效果相互抵消。力臂是支点到力的作用线的距离。',
          'The lever is at rest: the turning effect of the effort F₁ cancels that of the load F₂. A lever arm is the distance from the fulcrum to the line of action of the force.',
          'Der Hebel ruht: Die Drehwirkung der Kraft F₁ hebt die der Last F₂ auf. Der Hebelarm ist der Abstand vom Drehpunkt zur Wirkungslinie der Kraft.'),
        tri('杠杆平衡条件（力矩平衡）', 'Law of the lever (balance of moments)', 'Hebelgesetz (Gleichgewicht der Drehmomente)'), ['F1*l1', 'F2*l2'], { F1: 'N', F2: 'N' }),
      st('F_1 = \\dfrac{mgl_2}{l_1}',
        tri('解出动力。动力臂越长越省力：l₁ > l₂ 时 F₁ < F₂（省力杠杆），但要多移动距离。',
          'Solve for the effort. The longer the effort arm, the smaller the force: for l₁ > l₂, F₁ < F₂ (a force-saving lever), at the cost of a longer distance moved.',
          'Nach der Kraft auflösen. Je länger der Kraftarm, desto kleiner die Kraft: Für l₁ > l₂ ist F₁ < F₂ (kraftsparender Hebel), dafür ist der Weg länger.'),
        B.solve, ['F1', 'm*g*l2/l1'], { F1: 'N' })
    ]
  },
  {
    formula: 'lever.N',
    title: tri('支点对杠杆的支持力', 'Force of the fulcrum on the lever', 'Kraft des Drehpunkts auf den Hebel'),
    method: tri('整体受力平衡', 'Balance of forces on the whole', 'Kräftegleichgewicht am Ganzen'),
    steps: [
      st('F_1 = \\dfrac{mgl_2}{l_1}',
        tri('绳的拉力由杠杆平衡条件求出（前面的结论）。',
          'The pull of the rope follows from the law of the lever (earlier result).',
          'Die Seilkraft folgt aus dem Hebelgesetz (früheres Ergebnis).'),
        B.earlier, ['F1', 'm*g*l2/l1'], { F1: 'N' }),
      st('N = Mg + mg + F_1',
        tri('把杠杆和重物看成整体：向下的力有两者的重力和绳竖直向下的拉力，向上的只有支点的支持力；整体静止，合力为零。',
          'Treat the lever and the load as one: downwards act both weights and the downward pull of the rope, upwards only the fulcrum; the whole is at rest, so the forces balance.',
          'Hebel und Last als Ganzes: Nach unten wirken beide Gewichtskräfte und der senkrechte Seilzug, nach oben nur der Drehpunkt; das Ganze ruht, die Kräfte heben sich auf.'),
        tri('共点力平衡（整体法）', 'Equilibrium of forces (whole system)', 'Kräftegleichgewicht (Gesamtsystem)'), ['N', 'M*g + m*g + F1'], { N: 'N', F1: 'N' }),
      st('N = Mg + mg + \\dfrac{mgl_2}{l_1}',
        tri('代入 F₁。',
          'Insert F₁.',
          'F₁ einsetzen.'),
        B.prev, ['N', 'M*g + m*g + m*g*l2/l1'], { N: 'N' })
    ]
  }
]
