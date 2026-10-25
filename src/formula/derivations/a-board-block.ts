/**
 * Derivations of the situation "board-block": a block (mass m) slides on a board (mass M) that lies on the
 * ground (manual 26.50, D28). The positive direction is the direction in which the block moves relative to
 * the board; v₁, v₂ are the velocities of block and board at the start of the phase (v₁ > v₂), a₂ is the
 * board's acceleration (0 while it rests).
 */
import type { Derivation, SharedSteps } from './types'
import { B, st, tri } from './a-common'

/** Shared steps of the board-block situation. */
export const BOARD_BLOCK_SHARED: SharedSteps[] = [
  {
    id: 'board-block.block',
    title: tri('隔离物块', 'Block isolated', 'Klotz freigeschnitten'),
    steps: [
      st('N_1 = mg',
        tri('以物块为研究对象，取物块相对木板运动的方向为正方向。竖直方向：木板的支持力 N₁ 与重力平衡。',
          'Take the block as the body under study; positive is the direction in which it moves relative to the board. Vertically, the normal force N₁ of the board balances the weight.',
          'Wir betrachten den Klotz; positiv ist die Richtung, in der er sich relativ zum Brett bewegt. Senkrecht hält die Normalkraft N₁ des Brettes der Gewichtskraft das Gleichgewicht.'),
        B.n2Vertical, ['N1', 'm*g'], { N1: 'N' }),
      st('f_1 = \\mu_1 N_1 = \\mu_1 mg',
        tri('物块相对木板向前滑动，受木板向后的滑动摩擦力 f₁。',
          'The block slides forward relative to the board, so the board exerts a backward kinetic friction force f₁ on it.',
          'Der Klotz gleitet relativ zum Brett nach vorn; das Brett übt auf ihn eine nach hinten gerichtete Gleitreibungskraft f₁ aus.'),
        B.kinetic, ['f1', 'mu1*m*g'], { f1: 'N' })
    ]
  },
  {
    id: 'board-block.board',
    title: tri('隔离木板', 'Board isolated', 'Brett freigeschnitten'),
    steps: [
      st("f_1' = f_1 = \\mu_1 mg",
        tri('物块对木板的摩擦力 f₁′ 与 f₁ 等大反向，方向向前。',
          'The friction force f₁′ of the block on the board is equal and opposite to f₁, i.e. it points forward.',
          'Die Reibungskraft f₁′ des Klotzes auf das Brett ist gleich groß wie f₁ und entgegengesetzt, zeigt also nach vorn.'),
        B.n3, ['f1p', 'mu1*m*g'], { f1p: 'N' }),
      st("N_2 = Mg + N_1' = (M + m)g",
        tri('竖直方向：地面的支持力 N₂ 与木板的重力 Mg 及物块对木板的压力 N₁′ = mg 平衡。',
          'Vertically, the normal force N₂ of the ground balances the weight Mg of the board and the push N₁′ = mg of the block on it.',
          'Senkrecht hält die Normalkraft N₂ des Bodens der Gewichtskraft Mg des Brettes und der Andruckkraft N₁′ = mg des Klotzes das Gleichgewicht.'),
        tri('牛顿第三定律；牛顿第二定律（竖直方向，a_y = 0）', "Newton's third law; Newton's second law, vertical (a_y = 0)", 'Drittes Newtonsches Gesetz; zweites Newtonsches Gesetz, senkrecht (a_y = 0)'), ['N2', '(M + m)*g'], { N2: 'N' })
    ]
  },
  {
    id: 'board-block.motion',
    title: tri('两物体的速度', 'Velocities of both bodies', 'Geschwindigkeiten beider Körper'),
    steps: [
      st('v_A = v_1 - \\mu_1 g\\,t',
        tri('物块做匀减速直线运动，加速度大小 a₁ = μ₁g（见物块的加速度）；v₁ 为本阶段开始时物块的速度。',
          'The block decelerates uniformly with a₁ = μ₁g (see the acceleration of the block); v₁ is its velocity at the start of the phase.',
          'Der Klotz wird gleichmäßig verzögert mit a₁ = μ₁g (siehe Beschleunigung des Klotzes); v₁ ist seine Geschwindigkeit zu Beginn des Abschnitts.'),
        B.uniformV, ['vA', 'v1 - mu1*g*t'], { vA: 'm/s', t: 's' }),
      st('v_B = v_2 + a_2 t',
        tri('木板做匀变速直线运动，加速度为 a₂（见木板的加速度；木板静止时 a₂ = 0）；v₂ 为本阶段开始时木板的速度。',
          'The board moves with uniform acceleration a₂ (see the acceleration of the board; a₂ = 0 while it rests); v₂ is its velocity at the start of the phase.',
          'Das Brett bewegt sich gleichmäßig beschleunigt mit a₂ (siehe Beschleunigung des Brettes; a₂ = 0, solange es ruht); v₂ ist seine Geschwindigkeit zu Beginn des Abschnitts.'),
        B.uniformV, ['vB', 'v2 + a2*t'], { vB: 'm/s', t: 's' })
    ]
  }
]

/** Derivations of the board-block formulas. */
export const BOARD_BLOCK_DERIVATIONS: Derivation[] = [
  {
    formula: 'bb.a1',
    title: tri('物块的加速度大小', 'Magnitude of the acceleration of the block', 'Betrag der Beschleunigung des Klotzes'),
    method: tri('隔离物块', 'Isolate the block', 'Klotz freischneiden'),
    uses: ['board-block.block'],
    steps: [
      st('\\mu_1 mg = ma_1',
        tri('水平方向物块只受摩擦力 f₁（取大小）。',
          'Horizontally the only force on the block is the friction f₁ (magnitudes).',
          'Waagerecht wirkt auf den Klotz nur die Reibungskraft f₁ (Beträge).'),
        B.n2Horizontal, ['mu1*m*g', 'm*a1'], { a1: 'm/s²' }),
      st('a_1 = \\mu_1 g',
        tri('两边除以 m。物块做匀减速运动，加速度方向向后，大小与木板的运动情况无关。',
          'Divide by m. The block decelerates uniformly; its acceleration points backwards and does not depend on how the board moves.',
          'Division durch m. Der Klotz wird gleichmäßig verzögert; die Beschleunigung zeigt nach hinten und hängt nicht von der Bewegung des Brettes ab.'),
        B.solve, ['a1', 'mu1*g'], { a1: 'm/s²' })
    ]
  },
  {
    formula: 'bb.a2',
    title: tri('木板的加速度', 'Acceleration of the board', 'Beschleunigung des Brettes'),
    method: tri('隔离木板', 'Isolate the board', 'Brett freischneiden'),
    uses: ['board-block.block', 'board-block.board'],
    steps: [
      st('f_2 = \\mu_2 N_2 = \\mu_2(M + m)g',
        tri('木板相对地面向前滑动，地面对木板的滑动摩擦力 f₂ 向后。',
          'The board slides forward on the ground, so the ground exerts a backward kinetic friction force f₂ on it.',
          'Das Brett gleitet auf dem Boden nach vorn; der Boden übt auf es eine nach hinten gerichtete Gleitreibungskraft f₂ aus.'),
        B.kinetic, ['f2', 'mu2*(M + m)*g'], { f2: 'N' }),
      st('\\mu_1 mg - \\mu_2(M + m)g = Ma_2',
        tri('水平方向（向前为正）：物块的摩擦力 f₁′ 向前，地面的摩擦力 f₂ 向后。',
          'Horizontally (forward positive): the friction f₁′ of the block points forward, the friction f₂ of the ground backward.',
          'Waagerecht (nach vorn positiv): Die Reibungskraft f₁′ des Klotzes zeigt nach vorn, die Reibungskraft f₂ des Bodens nach hinten.'),
        B.n2Horizontal, ['mu1*m*g - mu2*(M + m)*g', 'M*a2']),
      st('a_2 = \\dfrac{\\mu_1 mg - \\mu_2(M+m)g}{M}',
        tri('解出木板的加速度。静止的木板能被带动的条件是 μ₁m > μ₂(M + m)。',
          'Solve for the acceleration of the board. A board at rest is set in motion only if μ₁m > μ₂(M + m).',
          'Auflösen nach der Beschleunigung des Brettes. Ein ruhendes Brett wird nur mitgenommen, wenn μ₁m > μ₂(M + m).'),
        B.solve, ['a2', '(mu1*m*g - mu2*(M + m)*g)/M'])
    ]
  },
  {
    formula: 'bb.a2.rest',
    title: tri('木板保持静止', 'The board stays at rest', 'Das Brett bleibt in Ruhe'),
    uses: ['board-block.block', 'board-block.board'],
    steps: [
      st('f_{2,\\max} = \\mu_2 N_2 = \\mu_2(M + m)g',
        tri('地面对木板的最大静摩擦力（取等于滑动摩擦力）。',
          'Maximum static friction of the ground on the board (taken equal to the kinetic friction).',
          'Maximale Haftreibungskraft des Bodens auf das Brett (gleich der Gleitreibungskraft gesetzt).'),
        B.maxStatic, ['f2max', 'mu2*(M + m)*g'], { f2max: 'N' }),
      st("f_1' = \\mu_1 mg \\le \\mu_2(M + m)g",
        tri('物块对木板向前的摩擦力不超过地面的最大静摩擦力，木板不会滑动；地面的静摩擦力与 f₁′ 平衡。',
          'The forward friction of the block on the board does not exceed the maximum static friction of the ground, so the board does not slide; the static friction of the ground balances f₁′.',
          'Die nach vorn gerichtete Reibungskraft des Klotzes auf das Brett überschreitet die maximale Haftreibungskraft des Bodens nicht; das Brett gleitet nicht, die Haftreibung des Bodens hält f₁′ das Gleichgewicht.'),
        B.maxStatic, ['mu1*m*g', 'mu2*(M + m)*g']),
      st('a_2 = 0\\quad(\\mu_1 m \\le \\mu_2 (M+m))',
        tri('木板所受合力为零，保持静止。',
          'The net force on the board is zero; it stays at rest.',
          'Die resultierende Kraft auf das Brett ist null; es bleibt in Ruhe.'),
        tri('牛顿第二定律（合力为零）', "Newton's second law (zero net force)", 'Zweites Newtonsches Gesetz (resultierende Kraft null)'), ['a2', '0'])
    ]
  },
  {
    formula: 'bb.t',
    title: tri('达到共速的时间', 'Time to reach the common velocity', 'Zeit bis zur gemeinsamen Geschwindigkeit'),
    note: tri('v₁、v₂ 为本阶段开始时物块、木板的速度', 'v₁, v₂ are the velocities of the block and the board at the start of this phase', 'v₁, v₂ sind die Geschwindigkeiten von Klotz und Brett zu Beginn dieses Abschnitts'),
    uses: ['board-block.motion'],
    steps: [
      st('v_1 - a_1 t_1 = v_2 + a_2 t_1',
        tri('两者速度相等时相对滑动停止（共速）。',
          'The relative sliding stops when both velocities are equal (common velocity).',
          'Das relative Gleiten endet, wenn beide Geschwindigkeiten gleich sind (gemeinsame Geschwindigkeit).'),
        B.common, ['v1 - a1*t1', 'v2 + a2*t1'], { a1: 'm/s²', t1: 's' }),
      st('t_1 = \\dfrac{v_1 - v_2}{a_1 + a_2} = \\dfrac{v_1 - v_2}{\\mu_1 g + a_2}',
        tri('解出 t₁，并代入 a₁ = μ₁g。',
          'Solve for t₁ and insert a₁ = μ₁g.',
          'Auflösen nach t₁ und Einsetzen von a₁ = μ₁g.'),
        B.solve, ['t1', '(v1 - v2)/(mu1*g + a2)'], { t1: 's' })
    ]
  },
  {
    formula: 'bb.vc',
    title: tri('共同速度', 'Common velocity', 'Gemeinsame Geschwindigkeit'),
    uses: ['board-block.motion'],
    steps: [
      st('t_1 = \\dfrac{v_1 - v_2}{\\mu_1 g + a_2}',
        tri('达到共速的时间（见达到共速的时间）。',
          'Time to reach the common velocity (see that formula).',
          'Zeit bis zur gemeinsamen Geschwindigkeit (siehe die entsprechende Formel).'),
        B.earlier, ['t1', '(v1 - v2)/(mu1*g + a2)'], { t1: 's' }),
      st('v = v_2 + a_2 t_1 = v_2 + \\dfrac{a_2(v_1 - v_2)}{\\mu_1 g + a_2}',
        tri('把 t₁ 代入木板的速度公式（代入物块的 v = v₁ − μ₁g t₁ 结果相同）。',
          'Insert t₁ into the velocity of the board (the block’s v = v₁ − μ₁g t₁ gives the same result).',
          'Einsetzen von t₁ in die Geschwindigkeit des Brettes (die des Klotzes, v = v₁ − μ₁g·t₁, liefert dasselbe).'),
        B.prev, ['v', 'v2 + a2*(v1 - v2)/(mu1*g + a2)'], { v: 'm/s' })
    ]
  },
  {
    formula: 'bb.ds',
    title: tri('相对滑动距离', 'Relative sliding distance', 'Relativer Gleitweg'),
    uses: ['board-block.motion'],
    steps: [
      st('x_A = \\dfrac{v_1 + v}{2}\\,t_1',
        tri('物块的位移：匀变速运动，平均速度乘时间（v 为共同速度）。',
          'Displacement of the block: uniformly accelerated motion, mean velocity times time (v is the common velocity).',
          'Verschiebung des Klotzes: gleichmäßig beschleunigte Bewegung, mittlere Geschwindigkeit mal Zeit (v ist die gemeinsame Geschwindigkeit).'),
        B.meanV, ['xA', '(v1 + v)/2*t1'], { xA: 'm', v: 'm/s', t1: 's' }),
      st('x_B = \\dfrac{v_2 + v}{2}\\,t_1',
        tri('木板的位移，同理。',
          'Displacement of the board, in the same way.',
          'Verschiebung des Brettes, ebenso.'),
        B.meanV, ['xB', '(v2 + v)/2*t1'], { xB: 'm', v: 'm/s', t1: 's' }),
      st('\\Delta s = x_A - x_B',
        tri('物块始终比木板快，相对滑动距离等于两者位移之差。',
          'The block is faster than the board all the time, so the sliding distance is the difference of the displacements.',
          'Der Klotz ist die ganze Zeit schneller als das Brett; der Gleitweg ist die Differenz der Verschiebungen.'),
        B.relDisp, ['ds', 'xA - xB'], { ds: 'm', xA: 'm', xB: 'm' }),
      st('\\Delta s = \\dfrac{(v_1 - v_2)\\,t_1}{2} = \\dfrac{(v_1 - v_2)^2}{2(\\mu_1 g + a_2)}',
        tri('相减后代入 t₁ = (v₁ − v₂)/(μ₁g + a₂)。',
          'Subtract and insert t₁ = (v₁ − v₂)/(μ₁g + a₂).',
          'Subtrahieren und t₁ = (v₁ − v₂)/(μ₁g + a₂) einsetzen.'),
        B.prev, ['ds', '(v1 - v2)^2/(2*(mu1*g + a2))'], { ds: 'm' })
    ]
  },
  {
    formula: 'bb.Q',
    title: tri('物块与木板间摩擦生热', 'Heat produced by friction between block and board', 'Reibungswärme zwischen Klotz und Brett'),
    uses: ['board-block.block', 'board-block.motion'],
    steps: [
      st('W_f = -f_1 x_A + f_1 x_B = -f_1\\,\\Delta s',
        tri('一对滑动摩擦力做功：f₁ 对物块做负功 −f₁x_A，反作用力 f₁′ 对木板做功 f₁x_B，代数和为 −f₁Δs。',
          'Work of the pair of kinetic friction forces: f₁ does −f₁x_A on the block, the reaction f₁′ does f₁x_B on the board; the sum is −f₁Δs.',
          'Arbeit des Paares der Gleitreibungskräfte: f₁ verrichtet am Klotz −f₁·x_A, die Gegenkraft f₁′ am Brett f₁·x_B; die Summe ist −f₁·Δs.'),
        tri('牛顿第三定律；功的定义', "Newton's third law; definition of work", 'Drittes Newtonsches Gesetz; Definition der Arbeit'), ['Wf', '-f1*ds'], { Wf: 'J', f1: 'N', ds: 'm' }),
      st('Q = -W_f = f_1\\,\\Delta s',
        tri('减少的机械能转化为物块与木板间的内能（木板与地面间的摩擦生热另计，不包括在内）。',
          'The lost mechanical energy becomes internal energy between block and board (heat produced between board and ground is counted separately and not included).',
          'Die verlorene mechanische Energie wird zu innerer Energie zwischen Klotz und Brett (die Reibungswärme zwischen Brett und Boden wird getrennt gezählt und ist nicht enthalten).'),
        B.heat, ['Q', 'f1*ds'], { Q: 'J', f1: 'N', ds: 'm' }),
      st('Q = \\mu_1 mg\\,\\Delta s = \\dfrac{\\mu_1 mg(v_1 - v_2)^2}{2(\\mu_1 g + a_2)}',
        tri('代入 f₁ = μ₁mg 与相对滑动距离 Δs。',
          'Insert f₁ = μ₁mg and the relative sliding distance Δs.',
          'Einsetzen von f₁ = μ₁mg und des relativen Gleitwegs Δs.'),
        B.prev, ['Q', 'mu1*m*g*(v1 - v2)^2/(2*(mu1*g + a2))'], { Q: 'J' })
    ]
  }
]
