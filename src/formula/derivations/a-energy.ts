/**
 * Derivation of the situation "energy": the energy ledger of the whole scene (manual 26.50, D28). E_k, E_p
 * and E_s are the kinetic, gravitational and spring energies; Q (friction heat and damping losses),
 * ΔE_coll (kinetic energy lost in collisions; ΔE_碰 on the card) and W (work of applied forces and belt
 * motors) are accumulated from the start, so they are 0 at t = 0.
 */
import type { Derivation, SharedSteps } from './types'
import { B, st, tri } from './a-common'

/** Shared steps of the energy situation (none: a single formula). */
export const ENERGY_SHARED: SharedSteps[] = []

/** Derivation of the energy ledger. */
export const ENERGY_DERIVATIONS: Derivation[] = [
  {
    formula: 'en.ledger',
    title: tri('能量守恒（能量账本）', 'Conservation of energy (energy ledger)', 'Energieerhaltung (Energiebilanz)'),
    note: tri('Q 含摩擦生热与阻尼耗散；W 含外力与传送带电机做的功', 'Q includes frictional heat and damping losses; W includes the work of applied forces and of belt motors', 'Q enthält die Reibungswärme und die Dämpfungsverluste; W enthält die Arbeit äußerer Kräfte und der Förderbandmotoren'),
    steps: [
      st('E_k - E_{k0} = W_G + W_s + W_f + W_{\\mathrm{coll}} + W',
        tri('对系统中所有物体用动能定理：动能的增加量等于所有力（内力也要计入）做功之和——重力 W_G、弹簧弹力 W_s、摩擦力与阻尼力 W_f、碰撞时的相互作用力 W_coll、外力与传送带电机的功 W。',
          'Apply the work–energy theorem to all bodies of the system: the gain in kinetic energy equals the work of all forces, internal ones included — gravity W_G, spring forces W_s, friction and damping W_f, the contact forces during collisions W_coll, applied forces and belt motors W.',
          'Arbeitssatz für alle Körper des Systems: Die Zunahme der kinetischen Energie ist gleich der Arbeit aller Kräfte, auch der inneren — Gewichtskraft W_G, Federkräfte W_s, Reibung und Dämpfung W_f, Kontaktkräfte bei Stößen W_coll, äußere Kräfte und Bandmotoren W.'),
        tri('动能定理（对系统）', 'Work–energy theorem for the system', 'Arbeitssatz für das System (W = ΔE_kin)'), ['Ek - Ek0', 'WG + Ws + Wf + Wc + W'], { Ek: 'J', Ek0: 'J', WG: 'J', Ws: 'J', Wf: 'J', Wc: 'J', W: 'J' }),
      st('W_G = -(E_p - E_{p0})',
        tri('重力做的功等于重力势能的减少量。',
          'The work of gravity equals the decrease of the gravitational potential energy.',
          'Die Arbeit der Gewichtskraft ist gleich der Abnahme der Lageenergie.'),
        tri('重力做功与重力势能变化的关系', 'Work of gravity and change of gravitational potential energy', 'Arbeit der Gewichtskraft und Änderung der Lageenergie'), ['WG', '-(Ep - Ep0)'], { WG: 'J', Ep: 'J', Ep0: 'J' }),
      st('W_s = -(E_s - E_{s0})',
        tri('弹簧弹力做的功等于弹性势能的减少量。',
          'The work of the spring forces equals the decrease of the elastic potential energy.',
          'Die Arbeit der Federkräfte ist gleich der Abnahme der Spannenergie.'),
        tri('弹力做功与弹性势能变化的关系', 'Work of spring forces and change of elastic potential energy', 'Arbeit der Federkräfte und Änderung der Spannenergie'), ['Ws', '-(Es - Es0)'], { Ws: 'J', Es: 'J', Es0: 'J' }),
      st('W_f = -Q',
        tri('一对滑动摩擦力（以及阻尼力）做功的代数和为负，其大小等于转化成的内能 Q。',
          'The total work of each pair of kinetic friction forces (and of damping) is negative; its magnitude is the internal energy Q produced.',
          'Die Gesamtarbeit jedes Paares von Gleitreibungskräften (und der Dämpfung) ist negativ; ihr Betrag ist die erzeugte innere Energie Q.'),
        B.heat, ['Wf', '-Q'], { Wf: 'J', Q: 'J' }),
      st('W_{\\mathrm{coll}} = -\\Delta E_{\\mathrm{coll}}',
        tri('非弹性碰撞中相互作用力做功的代数和为负，其大小等于碰撞损失的动能 ΔE_coll（卡片上记作 ΔE_碰）。',
          'In inelastic collisions the total work of the contact forces is negative; its magnitude is the kinetic energy ΔE_coll lost in the collisions.',
          'Bei unelastischen Stößen ist die Gesamtarbeit der Kontaktkräfte negativ; ihr Betrag ist die beim Stoß verlorene kinetische Energie ΔE_coll.'),
        tri('功能关系（碰撞中的动能损失）', 'Work–energy relation (kinetic energy lost in collisions)', 'Arbeit und Energie (Verlust an kinetischer Energie beim Stoß)'), ['Wc', '-dEc'], { Wc: 'J', dEc: 'J' }),
      st('E_k + E_p + E_s + Q + \\Delta E_{\\mathrm{coll}} - W = E_{k0} + E_{p0} + E_{s0}',
        tri('代入第一式并移项。',
          'Insert into the first equation and rearrange.',
          'In die erste Gleichung einsetzen und umstellen.'),
        B.prev, ['Ek + Ep + Es + Q + dEc - W', 'Ek0 + Ep0 + Es0'], { Ek: 'J', Ep: 'J', Es: 'J', Q: 'J', dEc: 'J', W: 'J', Ek0: 'J', Ep0: 'J', Es0: 'J' }),
      st('E_k + E_p + E_s + Q + \\Delta E_{\\mathrm{coll}} - W = E_0',
        tri('右边是开始时的机械能 E₀（Q、ΔE_coll、W 从零开始累计），所以左边的“账本合计”在整个运动过程中保持不变。',
          'The right-hand side is the initial mechanical energy E₀ (Q, ΔE_coll and W are accumulated from zero), so the ledger total on the left stays constant throughout the motion.',
          'Die rechte Seite ist die mechanische Anfangsenergie E₀ (Q, ΔE_coll und W werden ab null aufsummiert); die Bilanzsumme links bleibt daher während der ganzen Bewegung konstant.'),
        tri('能量守恒定律', 'Conservation of energy', 'Energieerhaltungssatz'), ['Ek + Ep + Es + Q + dEc - W', 'E0'], { Ek: 'J', Ep: 'J', Es: 'J', Q: 'J', dEc: 'J', W: 'J' })
    ]
  }
]
