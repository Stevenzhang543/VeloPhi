/**
 * Derivations of the situation "board-together": after reaching the common velocity, block (m) and board
 * (M) move together and slide on the ground (manual 26.50, D28).
 */
import type { Derivation, SharedSteps } from './types'
import { B, st, tri } from './a-common'

/** Shared steps of the board-together situation. */
export const BOARD_TOGETHER_SHARED: SharedSteps[] = [
  {
    id: 'board-together.whole',
    title: tri('整体法', 'Whole system', 'Gesamtsystem'),
    steps: [
      st('N_2 = (M + m)g',
        tri('物块与木板相对静止，把二者看成一个整体：竖直方向地面的支持力与总重力平衡。',
          'Block and board are at rest relative to each other; treat them as one body: vertically, the normal force of the ground balances the total weight.',
          'Klotz und Brett ruhen relativ zueinander; wir betrachten sie als einen Körper: Senkrecht hält die Normalkraft des Bodens der gesamten Gewichtskraft das Gleichgewicht.'),
        B.n2Vertical, ['N2', '(M + m)*g'], { N2: 'N' }),
      st('f_2 = \\mu_2 N_2 = \\mu_2(M + m)g',
        tri('整体相对地面滑动，受地面的滑动摩擦力，方向与运动方向相反；物块与木板间的静摩擦力是内力。',
          'The whole slides on the ground and experiences kinetic friction opposite to its motion; the static friction between block and board is an internal force.',
          'Das Ganze gleitet auf dem Boden und erfährt eine Gleitreibungskraft entgegen der Bewegung; die Haftreibung zwischen Klotz und Brett ist eine innere Kraft.'),
        B.kinetic, ['f2', 'mu2*(M + m)*g'], { f2: 'N' }),
      st('\\mu_2(M + m)g = (M + m)a',
        tri('水平方向整体只受地面的摩擦力（取大小）。',
          'Horizontally the only external force is the friction of the ground (magnitudes).',
          'Waagerecht wirkt als äußere Kraft nur die Reibungskraft des Bodens (Beträge).'),
        B.n2Whole, ['mu2*(M + m)*g', '(M + m)*a'], { a: 'm/s²' })
    ]
  }
]

/** Derivations of the board-together formulas. */
export const BOARD_TOGETHER_DERIVATIONS: Derivation[] = [
  {
    formula: 'bt.a',
    title: tri('共速后整体减速的加速度大小', 'Deceleration of the pair after the common velocity', 'Verzögerung des Gesamtsystems nach Erreichen der gemeinsamen Geschwindigkeit'),
    method: tri('整体法', 'Whole-system method', 'Betrachtung des Gesamtsystems'),
    uses: ['board-together.whole'],
    steps: [
      st('a = \\mu_2 g',
        tri('两边除以 (M + m)：整体做匀减速运动，加速度大小与质量无关。',
          'Divide by (M + m): the pair decelerates uniformly; the magnitude does not depend on the masses.',
          'Division durch (M + m): Das System wird gleichmäßig verzögert; der Betrag hängt nicht von den Massen ab.'),
        B.solve, ['a', 'mu2*g'], { a: 'm/s²' })
    ]
  },
  {
    formula: 'bt.f',
    title: tri('共速后物块受到的静摩擦力', 'Static friction on the block after the common velocity', 'Haftreibungskraft auf den Klotz nach Erreichen der gemeinsamen Geschwindigkeit'),
    method: tri('隔离物块', 'Isolate the block', 'Klotz freischneiden'),
    uses: ['board-together.whole'],
    steps: [
      st('a = \\mu_2 g',
        tri('整体的加速度大小（整体法的结论）。',
          'Deceleration of the pair (result of the whole-system method).',
          'Verzögerung des Systems (Ergebnis der Gesamtbetrachtung).'),
        B.wholeResult, ['a', 'mu2*g'], { a: 'm/s²' }),
      st('f = ma',
        tri('隔离物块：水平方向它只受木板的静摩擦力，这个力使物块与木板以相同的加速度减速。',
          'Isolate the block: horizontally only the static friction of the board acts on it, and it decelerates the block at the same rate as the board.',
          'Klotz freischneiden: Waagerecht wirkt auf ihn nur die Haftreibungskraft des Brettes; sie verzögert ihn genauso stark wie das Brett.'),
        B.n2, ['f', 'm*a'], { f: 'N', a: 'm/s²' }),
      st('m\\mu_2 g \\le \\mu_1 mg',
        tri('静摩擦力不能超过最大静摩擦力 μ₁mg，所以二者能一起运动的条件是 μ₂ ≤ μ₁。',
          'Static friction cannot exceed its maximum μ₁mg, so the two move together only if μ₂ ≤ μ₁.',
          'Die Haftreibungskraft kann μ₁mg nicht überschreiten; beide bewegen sich also nur für μ₂ ≤ μ₁ gemeinsam.'),
        B.maxStatic, ['m*mu2*g', 'mu1*m*g']),
      st('f = m\\mu_2 g',
        tri('代入 a = μ₂g。静摩擦力方向与运动方向相反。',
          'Insert a = μ₂g. The static friction points against the motion.',
          'Einsetzen von a = μ₂g. Die Haftreibungskraft ist der Bewegung entgegengerichtet.'),
        B.prev, ['f', 'm*mu2*g'], { f: 'N' })
    ]
  }
]
