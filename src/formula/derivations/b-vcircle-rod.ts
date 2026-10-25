/**
 * Derivations of the vertical-circle formulas for a ball on a light rod (situation "vcircle-rod": rod length L,
 * speed v₀ at the lowest point, rod force F positive when it pulls). Manual 26.50, D28.
 */
import type { Derivation, SharedSteps } from './types'
import { B, step, tri } from './b-common'

/** Shared step lists: forces on the ball (rod pulls or pushes), conservation of energy. */
export const SHARED_VCIRCLE_ROD: SharedSteps[] = [
  {
    id: 'vcircle-rod.forces',
    title: tri('小球的受力分析', 'Forces on the ball', 'Kräfte auf die Kugel'),
    steps: [
      step('F - mg\\cos\\varphi = \\dfrac{mv^2}{L}',
        tri('小球受重力 mg 和杆的作用力 F。轻杆两端铰接，力沿杆方向：指向圆心为拉力（F > 0），背离圆心为推力（F < 0）。φ 为位置角，从最低点起沿运动方向量起。沿半径方向，合力提供向心力。',
          'The ball is acted on by its weight mg and the rod force F. A light rod hinged at both ends exerts its force along the rod: towards the centre it pulls (F > 0), away from the centre it pushes (F < 0). φ is the position angle, measured from the lowest point in the direction of motion. Along the radius the resultant provides the centripetal force.',
          'Auf die Kugel wirken die Gewichtskraft mg und die Stabkraft F. Ein leichter, an beiden Enden gelenkig gelagerter Stab überträgt seine Kraft längs des Stabs: zum Mittelpunkt hin zieht er (F > 0), vom Mittelpunkt weg drückt er (F < 0). φ ist der Lagewinkel, vom tiefsten Punkt aus in Bewegungsrichtung gemessen. In radialer Richtung ist die resultierende Kraft die Zentripetalkraft.'),
        B.newton2Radial, 'F - m*g*cos(phi) = m*v^2/L', { F: 'N', phi: 'rad', v: 'm/s' }),
      step('v_{\\text{top}} \\ge 0',
        tri('杆既能拉也能推，F 可正可负，小球总能沿圆周运动。小球恰能到达最高点的临界条件是 v_top = 0（速度大于零就能越过最高点）。这与绳不同：绳只能拉，临界条件是最高点 v_top = √(gL)。',
          'A rod can pull or push, so F may have either sign and the ball always stays on the circle. The critical condition for just reaching the top is v_top = 0 (with any positive speed the ball passes over it). This differs from a rope, which can only pull: there the critical condition is v_top = √(gL) at the top.',
          'Ein Stab kann ziehen und drücken; F kann beide Vorzeichen haben, und die Kugel bleibt stets auf dem Kreis. Die Grenzbedingung dafür, dass die Kugel den höchsten Punkt gerade erreicht, ist v_top = 0 (mit jeder positiven Geschwindigkeit läuft sie darüber hinweg). Anders beim Seil, das nur ziehen kann: Dort lautet die Grenzbedingung v_top = √(gL) im höchsten Punkt.'),
        tri('杆的特点：能拉也能推', 'Property of a rod: it can pull and push', 'Eigenschaft eines Stabs: Er kann ziehen und drücken'))
    ]
  },
  {
    id: 'vcircle-rod.energy',
    title: tri('机械能守恒', 'Conservation of mechanical energy', 'Energieerhaltung'),
    steps: [
      step('h = L(1 - \\cos\\varphi)',
        tri('杆的作用力沿杆、与速度垂直，不做功；只有重力做功，小球的机械能守恒。以最低点为重力势能的零点，位置角为 φ 时小球的高度为 h。',
          'The rod force acts along the rod, perpendicular to the velocity, and does no work; only gravity does work, so the mechanical energy of the ball is conserved. With the lowest point as the zero of potential energy, the ball is at height h at position angle φ.',
          'Die Stabkraft wirkt längs des Stabs, senkrecht zur Geschwindigkeit, und verrichtet keine Arbeit; nur die Gewichtskraft verrichtet Arbeit, die mechanische Energie der Kugel bleibt erhalten. Mit dem tiefsten Punkt als Nullniveau liegt die Kugel beim Lagewinkel φ in der Höhe h.'),
        B.geometry, 'h = L*(1 - cos(phi))', { h: 'm', phi: 'rad' }),
      step('\\tfrac12 mv^2 + mgL(1 - \\cos\\varphi) = \\tfrac12 mv_0^2',
        tri('v₀ 为小球在最低点的速率（由本段的机械能推算）。最低点与位置角 φ 处的机械能相等。',
          'v₀ is the speed of the ball at the lowest point (obtained from the mechanical energy of the phase). The mechanical energy at the lowest point equals that at position angle φ.',
          'v₀ ist die Geschwindigkeit der Kugel im tiefsten Punkt (aus der mechanischen Energie des Abschnitts). Die mechanische Energie im tiefsten Punkt ist gleich der beim Lagewinkel φ.'),
        B.energy, 'm*v^2/2 + m*g*L*(1 - cos(phi)) = m*v0^2/2', { v: 'm/s', phi: 'rad' })
    ]
  }
]

/** Derivations of vc.d.F0, vc.d.vtop, vc.d.Ftop and vc.d.zero. */
export const DERIVATIONS_VCIRCLE_ROD: Derivation[] = [
  {
    formula: 'vc.d.F0',
    title: tri('最低点杆的拉力', 'Rod tension at the lowest point', 'Stabkraft (Zug) im tiefsten Punkt'),
    uses: ['vcircle-rod.forces'],
    steps: [
      step('F - mg = \\dfrac{mv_0^2}{L}',
        tri('在最低点 φ = 0、v = v₀：杆的作用力竖直向上，重力竖直向下，二者的合力提供向心力。',
          'At the lowest point φ = 0 and v = v₀: the rod force points vertically up, the weight down, and their resultant provides the centripetal force.',
          'Im tiefsten Punkt ist φ = 0 und v = v₀: Die Stabkraft zeigt senkrecht nach oben, die Gewichtskraft nach unten; ihre Resultierende ist die Zentripetalkraft.'),
        B.newton2Radial, 'F - m*g = m*v0^2/L', { F: 'N' }),
      step('F = mg + \\dfrac{mv_0^2}{L}',
        tri('移项。F > 0：在最低点杆对球总是拉力。',
          'Rearranged. F > 0: at the lowest point the rod always pulls the ball.',
          'Umgeformt. F > 0: Im tiefsten Punkt zieht der Stab stets an der Kugel.'),
        B.rearrange, 'F = m*g + m*v0^2/L', { F: 'N' })
    ]
  },
  {
    formula: 'vc.d.vtop',
    title: tri('最高点速率（机械能守恒）', 'Speed at the top (conservation of mechanical energy)', 'Geschwindigkeit im höchsten Punkt (Energieerhaltung)'),
    uses: ['vcircle-rod.energy'],
    steps: [
      step('\\tfrac12 mv_{\\text{top}}^2 + mg\\cdot 2L = \\tfrac12 mv_0^2',
        tri('最高点 φ = π，比最低点高 2L。',
          'At the top φ = π, 2L above the lowest point.',
          'Im höchsten Punkt ist φ = π, 2L über dem tiefsten Punkt.'),
        B.energy, 'm*vtop^2/2 + m*g*2*L = m*v0^2/2', { vtop: 'm/s' }),
      step('v_{\\text{top}} = \\sqrt{v_0^2 - 4gL}',
        tri('解出最高点的速率。杆能提供推力，临界条件 v_top = 0 对应最低点 v₀ = 2√(gL)：v₀ > 2√(gL) 时小球就能越过最高点；用绳时则需要 v₀ ≥ √(5gL)。',
          'Solve for the speed at the top. Since the rod can push, the critical condition v_top = 0 corresponds to v₀ = 2√(gL) at the lowest point: for v₀ > 2√(gL) the ball passes over the top; with a rope v₀ ≥ √(5gL) would be needed.',
          'Nach der Geschwindigkeit im höchsten Punkt auflösen. Da der Stab drücken kann, entspricht die Grenzbedingung v_top = 0 der Geschwindigkeit v₀ = 2√(gL) im tiefsten Punkt: Für v₀ > 2√(gL) läuft die Kugel über den höchsten Punkt hinweg; mit einem Seil wäre v₀ ≥ √(5gL) nötig.'),
        B.rearrange, 'vtop = sqrt(v0^2 - 4*g*L)', { vtop: 'm/s' })
    ]
  },
  {
    formula: 'vc.d.Ftop',
    title: tri('最高点杆对球的力（拉为正）', 'Rod force on the ball at the top (pull positive)', 'Stabkraft auf die Kugel im höchsten Punkt (Zug positiv)'),
    note: tri('F > 0 为拉力，F < 0 为支持力（推力）；v_top = √(gL) 时 F = 0',
      'F > 0 is a pull (tension), F < 0 a supporting push; F = 0 for v_top = √(gL)',
      'F > 0 ist Zug, F < 0 eine stützende Druckkraft; für v_top = √(gL) ist F = 0'),
    uses: ['vcircle-rod.forces', 'vcircle-rod.energy'],
    steps: [
      step('F + mg = \\dfrac{mv_{\\text{top}}^2}{L}',
        tri('在最高点 φ = π：重力竖直向下、指向圆心；杆的作用力 F 以指向圆心（拉）为正。',
          'At the top φ = π: the weight points vertically down, towards the centre; the rod force F is counted positive towards the centre (pull).',
          'Im höchsten Punkt (φ = π) zeigt die Gewichtskraft senkrecht nach unten zum Mittelpunkt; die Stabkraft F wird zum Mittelpunkt hin (Zug) positiv gezählt.'),
        B.newton2Radial, 'F + m*g = m*vtop^2/L', { F: 'N', vtop: 'm/s' }),
      step('v_{\\text{top}}^2 = v_0^2 - 4gL',
        tri('由机械能守恒（最高点比最低点高 2L）。',
          'From conservation of energy (the top is 2L above the lowest point).',
          'Aus der Energieerhaltung (der höchste Punkt liegt 2L über dem tiefsten).'),
        B.energy, 'vtop^2 = v0^2 - 4*g*L', { vtop: 'm/s' }),
      step('F = \\dfrac{mv_{\\text{top}}^2}{L} - mg = \\dfrac{m(v_0^2 - 5gL)}{L}',
        tri('移项，并代入 v_top²。v_top > √(gL) 时 F > 0，杆拉球；v_top < √(gL) 时 F < 0，杆推（支撑）球；v_top = √(gL) 时 F = 0，只有重力提供向心力。',
          'Rearrange and insert v_top². For v_top > √(gL), F > 0 and the rod pulls the ball; for v_top < √(gL), F < 0 and the rod pushes (supports) it; for v_top = √(gL), F = 0 and gravity alone provides the centripetal force.',
          'Umstellen und v_top² einsetzen. Für v_top > √(gL) ist F > 0, der Stab zieht an der Kugel; für v_top < √(gL) ist F < 0, der Stab drückt (stützt) sie; für v_top = √(gL) ist F = 0, die Gewichtskraft allein liefert die Zentripetalkraft.'),
        B.previous, 'F = m*(v0^2 - 5*g*L)/L', { F: 'N' })
    ]
  },
  {
    formula: 'vc.d.zero',
    title: tri('杆力为零时的速率', 'Speed at which the rod force is zero', 'Geschwindigkeit, bei der die Stabkraft null ist'),
    note: tri('φ 取仿真中杆力为零处的位置角',
      'φ is the position angle at which the rod force vanishes in the simulation',
      'φ ist der Lagewinkel, bei dem die Stabkraft in der Simulation null wird'),
    uses: ['vcircle-rod.forces'],
    steps: [
      step('-mg\\cos\\varphi = \\dfrac{mv^2}{L}',
        tri('杆力由拉力变为推力（或反之）的瞬间 F = 0，代入法向方程：只有重力沿半径方向的分力提供向心力。',
          'At the instant the rod force changes from pull to push (or back), F = 0; in the radial equation only the radial component of the weight provides the centripetal force.',
          'In dem Moment, in dem die Stabkraft von Zug zu Druck wechselt (oder umgekehrt), ist F = 0; in der Radialgleichung liefert nur die Radialkomponente der Gewichtskraft die Zentripetalkraft.'),
        tri('牛顿第二定律（法向，F = 0）', "Newton's second law (radial direction, F = 0)", 'Zweites Newtonsches Gesetz (radial, F = 0)'),
        '-m*g*cos(phiZ) = m*v^2/L', { v: 'm/s' }),
      step('v^2 = -gL\\cos\\varphi\\quad(\\varphi = \\pi:\\ v = \\sqrt{gL})',
        tri('整理。杆力只可能在上半圆（cosφ < 0）为零；在最高点（φ = π）即 v = √(gL)。',
          'Rearranged. The rod force can only vanish in the upper half of the circle (cos φ < 0); at the top (φ = π) this means v = √(gL).',
          'Umgeformt. Die Stabkraft kann nur in der oberen Kreishälfte (cos φ < 0) null werden; im höchsten Punkt (φ = π) bedeutet das v = √(gL).'),
        B.rearrange, 'v^2 = -g*L*cos(phiZ)', { v: 'm/s' })
    ]
  }
]
