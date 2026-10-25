/**
 * Derivations of the vertical-circle formulas for a ball on a rope (situation "vcircle-rope": rope length L,
 * speed v₀ at the lowest point, position angle φ measured from the lowest point in the direction of motion).
 * Manual 26.50, D28.
 */
import type { Derivation, SharedSteps } from './types'
import { B, step, tri } from './b-common'

/** Shared step lists: forces on the ball, conservation of energy, the slack condition. */
export const SHARED_VCIRCLE_ROPE: SharedSteps[] = [
  {
    id: 'vcircle-rope.forces',
    title: tri('小球的受力分析', 'Forces on the ball', 'Kräfte auf die Kugel'),
    steps: [
      step('F_T - mg\\cos\\varphi = \\dfrac{mv^2}{L}',
        tri('小球受重力 mg 和绳的拉力 F_T（沿绳指向圆心 O）。φ 为小球的位置角，从最低点起沿运动方向量起（最低点 φ = 0，最高点 φ = π）。沿半径方向（指向圆心为正），重力的分力为 −mg cosφ，与拉力的合力提供向心力。',
          'The ball is acted on by its weight mg and the rope tension F_T, directed along the rope towards the centre O. φ is the position angle of the ball, measured from the lowest point in the direction of motion (φ = 0 at the bottom, φ = π at the top). Along the radius (towards the centre positive) the component of the weight is −mg cos φ; together with the tension it provides the centripetal force.',
          'Auf die Kugel wirken die Gewichtskraft mg und die Seilkraft F_T längs des Seils zum Mittelpunkt O. φ ist der Lagewinkel der Kugel, vom tiefsten Punkt aus in Bewegungsrichtung gemessen (unten φ = 0, oben φ = π). In radialer Richtung (zum Mittelpunkt positiv) hat die Gewichtskraft die Komponente −mg cos φ; zusammen mit der Seilkraft liefert sie die Zentripetalkraft.'),
        B.newton2Radial, 'F_T - m*g*cos(phi) = m*v^2/L', { F_T: 'N', phi: 'rad', v: 'm/s' }),
      step('F_T \\ge 0',
        tri('绳只能拉、不能推：小球沿圆周运动要求 F_T ≥ 0。F_T 减小到零时绳开始松弛，小球离开圆周做抛体运动。',
          'A rope can only pull, never push: motion on the circle requires F_T ≥ 0. When F_T drops to zero the rope goes slack and the ball leaves the circle as a projectile.',
          'Ein Seil kann nur ziehen, nicht drücken: Die Bewegung auf dem Kreis erfordert F_T ≥ 0. Sinkt F_T auf null, wird das Seil schlaff; die Kugel verlässt den Kreis und führt eine Wurfbewegung aus.'),
        tri('绳的特点：只能提供拉力', 'Property of a rope: it can only pull', 'Eigenschaft eines Seils: Es kann nur ziehen'))
    ]
  },
  {
    id: 'vcircle-rope.energy',
    title: tri('机械能守恒', 'Conservation of mechanical energy', 'Energieerhaltung'),
    steps: [
      step('h = L(1 - \\cos\\varphi)',
        tri('绳的拉力始终与速度垂直，不做功；只有重力做功，小球的机械能守恒。以最低点为重力势能的零点，位置角为 φ 时小球的高度为 h。',
          'The rope tension is always perpendicular to the velocity and does no work; only gravity does work, so the mechanical energy of the ball is conserved. With the lowest point as the zero of potential energy, the ball is at height h at position angle φ.',
          'Die Seilkraft steht stets senkrecht zur Geschwindigkeit und verrichtet keine Arbeit; nur die Gewichtskraft verrichtet Arbeit, die mechanische Energie der Kugel bleibt erhalten. Mit dem tiefsten Punkt als Nullniveau der Lageenergie liegt die Kugel beim Lagewinkel φ in der Höhe h.'),
        B.geometry, 'h = L*(1 - cos(phi))', { h: 'm', phi: 'rad' }),
      step('\\tfrac12 mv^2 + mgL(1 - \\cos\\varphi) = \\tfrac12 mv_0^2',
        tri('v₀ 为小球在最低点的速率（由本段的机械能推算）。最低点与位置角 φ 处的机械能相等。',
          'v₀ is the speed of the ball at the lowest point (obtained from the mechanical energy of the phase). The mechanical energy at the lowest point equals that at position angle φ.',
          'v₀ ist die Geschwindigkeit der Kugel im tiefsten Punkt (aus der mechanischen Energie des Abschnitts). Die mechanische Energie im tiefsten Punkt ist gleich der beim Lagewinkel φ.'),
        B.energy, 'm*v^2/2 + m*g*L*(1 - cos(phi)) = m*v0^2/2', { v: 'm/s', phi: 'rad' }),
      step('v^2 = v_0^2 - 2gL(1 - \\cos\\varphi)',
        tri('整理得位置角为 φ 处的速率。',
          'Rearranged: the speed at position angle φ.',
          'Umgeformt: die Geschwindigkeit beim Lagewinkel φ.'),
        B.rearrange, 'v^2 = v0^2 - 2*g*L*(1 - cos(phi))', { v: 'm/s', phi: 'rad' })
    ]
  },
  {
    id: 'vcircle-rope.slack',
    title: tri('绳恰好松弛的条件', 'Condition for the rope to go slack', 'Bedingung für das Schlaffwerden des Seils'),
    steps: [
      step('-mg\\cos\\varphi_s = \\dfrac{mv_s^2}{L}',
        tri('设绳在位置角 φ_s 处松弛，此时 F_T = 0，只有重力沿半径方向的分力提供向心力；v_s 为此时小球的速率。',
          'Let the rope go slack at position angle φ_s: there F_T = 0 and only the radial component of the weight provides the centripetal force; v_s is the speed of the ball at that moment.',
          'Das Seil werde beim Lagewinkel φ_s schlaff: Dort ist F_T = 0, und nur die Radialkomponente der Gewichtskraft liefert die Zentripetalkraft; v_s ist die Geschwindigkeit der Kugel in diesem Moment.'),
        tri('牛顿第二定律（法向，F_T = 0）', "Newton's second law (radial direction, F_T = 0)", 'Zweites Newtonsches Gesetz (radial, F_T = 0)'),
        '-m*g*cos(phiS) = m*vs^2/L', { vs: 'm/s' }),
      step('v_s^2 = -gL\\cos\\varphi_s',
        tri('整理。由 v_s² > 0 知 cosφ_s < 0：绳只可能在上半圆松弛。',
          'Rearranged. Since v_s² > 0, cos φ_s < 0: the rope can only go slack in the upper half of the circle.',
          'Umgeformt. Wegen v_s² > 0 ist cos φ_s < 0: Das Seil kann nur in der oberen Kreishälfte schlaff werden.'),
        B.rearrange, 'vs^2 = -g*L*cos(phiS)', { vs: 'm/s' })
    ]
  }
]

/** Derivations of the nine vc.r.* formulas. */
export const DERIVATIONS_VCIRCLE_ROPE: Derivation[] = [
  {
    formula: 'vc.r.T0',
    title: tri('最低点绳的拉力', 'Rope tension at the lowest point', 'Seilkraft im tiefsten Punkt'),
    causes: [tri('数值积分误差（可减小时间步长或容差）', 'Numerical integration error (reduce the time step or the tolerance)', 'Numerischer Integrationsfehler (Zeitschritt oder Toleranz verkleinern)')],
    uses: ['vcircle-rope.forces'],
    steps: [
      step('F_T - mg = \\dfrac{mv_0^2}{L}',
        tri('在最低点 φ = 0、v = v₀：拉力竖直向上，重力竖直向下，二者的合力提供向心力。',
          'At the lowest point φ = 0 and v = v₀: the tension points vertically up, the weight down, and their resultant provides the centripetal force.',
          'Im tiefsten Punkt ist φ = 0 und v = v₀: Die Seilkraft zeigt senkrecht nach oben, die Gewichtskraft nach unten; ihre Resultierende ist die Zentripetalkraft.'),
        B.newton2Radial, 'F_T - m*g = m*v0^2/L', { F_T: 'N' }),
      step('F_T = mg + \\dfrac{mv_0^2}{L}',
        tri('移项得拉力，它总大于小球的重力。',
          'Rearranged: the tension, which always exceeds the weight of the ball.',
          'Umgeformt: die Seilkraft; sie ist stets größer als die Gewichtskraft der Kugel.'),
        B.rearrange, 'F_T = m*g + m*v0^2/L', { F_T: 'N' })
    ]
  },
  {
    formula: 'vc.r.vtop',
    title: tri('最高点速率（机械能守恒）', 'Speed at the top (conservation of mechanical energy)', 'Geschwindigkeit im höchsten Punkt (Energieerhaltung)'),
    uses: ['vcircle-rope.energy'],
    steps: [
      step('\\tfrac12 mv_{\\text{top}}^2 + mg\\cdot 2L = \\tfrac12 mv_0^2',
        tri('最高点 φ = π，比最低点高 2L。前提是绳始终张紧、小球沿圆周到达最高点（v₀ ≥ √(5gL)，见“恰能通过最高点的最低点速度”）。',
          'At the top φ = π, 2L above the lowest point. This assumes the rope stays taut and the ball reaches the top on the circle (v₀ ≥ √(5gL), see “Speed at the lowest point for just passing the top”).',
          'Im höchsten Punkt ist φ = π, 2L über dem tiefsten Punkt. Vorausgesetzt ist, dass das Seil gespannt bleibt und die Kugel den höchsten Punkt auf der Kreisbahn erreicht (v₀ ≥ √(5gL), siehe „Geschwindigkeit im tiefsten Punkt, mit der die Kugel den höchsten Punkt gerade durchläuft“).'),
        B.energy, 'm*vtop^2/2 + m*g*2*L = m*v0^2/2', { vtop: 'm/s' }),
      step('v_{\\text{top}} = \\sqrt{v_0^2 - 4gL}',
        tri('解出最高点的速率。', 'Solve for the speed at the top.', 'Nach der Geschwindigkeit im höchsten Punkt auflösen.'),
        B.rearrange, 'vtop = sqrt(v0^2 - 4*g*L)', { vtop: 'm/s' })
    ]
  },
  {
    formula: 'vc.r.Ttop',
    title: tri('最高点绳的拉力', 'Rope tension at the top', 'Seilkraft im höchsten Punkt'),
    note: tri('最高点速率等于临界速度 √(gL) 时拉力为零',
      'The tension is zero when the speed at the top equals the critical speed √(gL)',
      'Die Seilkraft ist null, wenn die Geschwindigkeit im höchsten Punkt gleich der kritischen Geschwindigkeit √(gL) ist'),
    uses: ['vcircle-rope.forces', 'vcircle-rope.energy'],
    steps: [
      step('F_T + mg = \\dfrac{mv_{\\text{top}}^2}{L}',
        tri('在最高点 φ = π：拉力和重力都竖直向下、指向圆心，二者之和提供向心力。',
          'At the top φ = π: tension and weight both point vertically down, towards the centre; their sum provides the centripetal force.',
          'Im höchsten Punkt (φ = π) zeigen Seilkraft und Gewichtskraft beide senkrecht nach unten zum Mittelpunkt; ihre Summe ist die Zentripetalkraft.'),
        B.newton2Radial, 'F_T + m*g = m*vtop^2/L', { F_T: 'N', vtop: 'm/s' }),
      step('v_{\\text{top}}^2 = v_0^2 - 4gL',
        tri('由机械能守恒（最高点比最低点高 2L）。',
          'From conservation of energy (the top is 2L above the lowest point).',
          'Aus der Energieerhaltung (der höchste Punkt liegt 2L über dem tiefsten).'),
        B.energy, 'vtop^2 = v0^2 - 4*g*L', { vtop: 'm/s' }),
      step('F_T = \\dfrac{mv_{\\text{top}}^2}{L} - mg = \\dfrac{m(v_0^2 - 5gL)}{L}',
        tri('移项，并代入 v_top²。v₀² = 5gL（即 v_top = √(gL)）时 F_T = 0。',
          'Rearrange and insert v_top². For v₀² = 5gL (that is, v_top = √(gL)) F_T = 0.',
          'Umstellen und v_top² einsetzen. Für v₀² = 5gL (also v_top = √(gL)) ist F_T = 0.'),
        B.previous, 'F_T = m*(v0^2 - 5*g*L)/L', { F_T: 'N' })
    ]
  },
  {
    formula: 'vc.r.crit',
    title: tri('恰能通过最高点的最低点速度', 'Speed at the lowest point for just passing the top', 'Geschwindigkeit im tiefsten Punkt, mit der die Kugel den höchsten Punkt gerade durchläuft'),
    note: tri('最高点的临界条件：只有重力提供向心力，mg = mv²/L，即 v = √(gL)',
      'Critical condition at the top: gravity alone provides the centripetal force, mg = mv²/L, i.e. v = √(gL)',
      'Grenzbedingung im höchsten Punkt: Die Gewichtskraft allein liefert die Zentripetalkraft, mg = mv²/L, also v = √(gL)'),
    uses: ['vcircle-rope.forces', 'vcircle-rope.energy'],
    steps: [
      step('F_T = \\dfrac{mv_{\\text{top}}^2}{L} - mg \\ge 0',
        tri('小球沿圆周通过最高点时绳必须张紧：最高点的拉力不能为负。',
          'To pass the top on the circle the rope must stay taut: the tension at the top cannot be negative.',
          'Um den höchsten Punkt auf der Kreisbahn zu durchlaufen, muss das Seil gespannt bleiben: Die Seilkraft oben darf nicht negativ sein.'),
        tri('最高点的法向方程；绳的拉力 F_T ≥ 0', 'Radial equation at the top; rope tension F_T ≥ 0', 'Radialgleichung im höchsten Punkt; Seilkraft F_T ≥ 0'),
        'F_T = m*vtop^2/L - m*g', { F_T: 'N', vtop: 'm/s' }),
      step('mg = \\dfrac{mv_{\\text{top}}^2}{L}',
        tri('临界情况 F_T = 0：只有重力提供向心力。',
          'Critical case F_T = 0: gravity alone provides the centripetal force.',
          'Grenzfall F_T = 0: Die Gewichtskraft allein liefert die Zentripetalkraft.'),
        B.newton2Radial, 'm*g = m*vtop^2/L', { vtop: 'm/s' }),
      step('v_{\\text{top}} = \\sqrt{gL}',
        tri('这是最高点的临界速度；若 v_top < √(gL)，绳在到达最高点之前就已松弛。',
          'This is the critical speed at the top; for v_top < √(gL) the rope would go slack before the ball reaches the top.',
          'Das ist die kritische Geschwindigkeit im höchsten Punkt; für v_top < √(gL) würde das Seil schon vorher schlaff werden.'),
        B.rearrange, 'vtop = sqrt(g*L)', { vtop: 'm/s' }),
      step('\\tfrac12 mv_0^2 = \\tfrac12 mv_{\\text{top}}^2 + mg\\cdot 2L',
        tri('从最低点到最高点机械能守恒。',
          'Conservation of mechanical energy from the lowest point to the top.',
          'Energieerhaltung vom tiefsten zum höchsten Punkt.'),
        B.energy, 'm*v0^2/2 = m*vtop^2/2 + m*g*2*L', { vtop: 'm/s' }),
      step('v_0 = \\sqrt{5gL}\\quad(v_{\\text{top}} = \\sqrt{gL})',
        tri('代入 v_top² = gL：v₀² = gL + 4gL = 5gL。最低点速度 v₀ ≥ √(5gL) 时小球能做完整的圆周运动。',
          'Insert v_top² = gL: v₀² = gL + 4gL = 5gL. With v₀ ≥ √(5gL) at the lowest point the ball completes the circle.',
          'v_top² = gL einsetzen: v₀² = gL + 4gL = 5gL. Mit v₀ ≥ √(5gL) im tiefsten Punkt durchläuft die Kugel den vollen Kreis.'),
        B.previous, 'v0 = sqrt(5*g*L)')
    ]
  },
  {
    formula: 'vc.r.slackv',
    title: tri('绳恰好松弛的条件', 'Condition for the rope to go slack', 'Bedingung für das Schlaffwerden des Seils'),
    note: tri('φ_s 取仿真中绳松弛处的位置角（自最低点量起）',
      'φ_s is the position angle at which the rope goes slack in the simulation (measured from the lowest point)',
      'φ_s ist der Lagewinkel, bei dem das Seil in der Simulation schlaff wird (vom tiefsten Punkt aus gemessen)'),
    uses: ['vcircle-rope.forces'],
    steps: [
      step('-mg\\cos\\varphi_s = \\dfrac{mv^2}{L}',
        tri('绳恰好松弛时 F_T = 0，代入法向方程：只有重力沿半径方向的分力 −mg cosφ_s 提供向心力。',
          'When the rope just goes slack F_T = 0; in the radial equation only the radial component −mg cos φ_s of the weight provides the centripetal force.',
          'Wird das Seil gerade schlaff, ist F_T = 0; in der Radialgleichung liefert nur die Radialkomponente −mg cos φ_s der Gewichtskraft die Zentripetalkraft.'),
        tri('牛顿第二定律（法向，F_T = 0）', "Newton's second law (radial direction, F_T = 0)", 'Zweites Newtonsches Gesetz (radial, F_T = 0)'),
        '-m*g*cos(phiS) = m*v^2/L', { v: 'm/s' }),
      step('v^2 = -gL\\cos\\varphi_s\\quad(\\varphi_s = \\pi:\\ v = \\sqrt{gL})',
        tri('整理。松弛只可能发生在上半圆（cosφ_s < 0）；若恰在最高点（φ_s = π）松弛，得到最高点的临界速度 √(gL)。',
          'Rearranged. Slack can only occur in the upper half of the circle (cos φ_s < 0); if it happens exactly at the top (φ_s = π) this is the critical speed √(gL).',
          'Umgeformt. Schlaff werden kann das Seil nur in der oberen Kreishälfte (cos φ_s < 0); geschieht es genau im höchsten Punkt (φ_s = π), ergibt sich die kritische Geschwindigkeit √(gL).'),
        B.rearrange, 'v^2 = -g*L*cos(phiS)', { v: 'm/s' })
    ]
  },
  {
    formula: 'vc.r.phiS',
    title: tri('绳松弛处的位置角', 'Position angle at which the rope goes slack', 'Lagewinkel, bei dem das Seil schlaff wird'),
    note: tri('位置角自最低点沿运动方向量起',
      'The position angle is measured from the lowest point in the direction of motion',
      'Der Lagewinkel wird vom tiefsten Punkt aus in Bewegungsrichtung gemessen'),
    uses: ['vcircle-rope.forces', 'vcircle-rope.energy', 'vcircle-rope.slack'],
    steps: [
      step('v_s^2 = v_0^2 - 2gL(1 - \\cos\\varphi_s)',
        tri('松弛之前绳一直张紧，小球沿圆周运动，机械能守恒式在 φ = φ_s 处成立。',
          'Up to the slack point the rope is taut and the ball moves on the circle, so the energy equation holds at φ = φ_s.',
          'Bis zum Schlaffwerden ist das Seil gespannt und die Kugel bewegt sich auf dem Kreis; die Energiegleichung gilt also bei φ = φ_s.'),
        B.energy, 'vs^2 = v0^2 - 2*g*L*(1 - cos(phiS))', { vs: 'm/s' }),
      step('-gL\\cos\\varphi_s = v_0^2 - 2gL + 2gL\\cos\\varphi_s',
        tri('与松弛条件 v_s² = −gL cosφ_s 联立，消去 v_s²。',
          'Combine with the slack condition v_s² = −gL cos φ_s to eliminate v_s².',
          'Mit der Bedingung v_s² = −gL cos φ_s kombinieren und v_s² eliminieren.'),
        tri('联立求解', 'Solving the equations simultaneously', 'Lösen des Gleichungssystems'),
        '-g*L*cos(phiS) = v0^2 - 2*g*L + 2*g*L*cos(phiS)'),
      step('\\cos\\varphi_s = \\dfrac{2gL - v_0^2}{3gL}',
        tri('解出 cosφ_s。当 2gL < v₀² < 5gL 时 −1 < cosφ_s < 0，φ_s 在 90° 与 180° 之间：小球越过水平直径之后、到达最高点之前，绳松弛。',
          'Solve for cos φ_s. For 2gL < v₀² < 5gL, −1 < cos φ_s < 0 and φ_s lies between 90° and 180°: the rope goes slack after the ball has passed the horizontal diameter but before it reaches the top.',
          'Nach cos φ_s auflösen. Für 2gL < v₀² < 5gL ist −1 < cos φ_s < 0, φ_s liegt zwischen 90° und 180°: Das Seil wird schlaff, nachdem die Kugel den waagerechten Durchmesser passiert hat, aber bevor sie den höchsten Punkt erreicht.'),
        B.rearrange, 'cos(phiS) = (2*g*L - v0^2)/(3*g*L)')
    ]
  },
  {
    formula: 'vc.r.hS',
    title: tri('松弛点高出圆心的高度', 'Height of the slack point above the centre', 'Höhe des Punkts, an dem das Seil schlaff wird, über dem Mittelpunkt'),
    uses: ['vcircle-rope.forces', 'vcircle-rope.energy', 'vcircle-rope.slack'],
    steps: [
      step('h = -L\\cos\\varphi_s',
        tri('松弛点在圆心上方的高度（φ_s 在上半圆，cosφ_s < 0）。',
          'Height of the slack point above the centre (φ_s lies in the upper half, cos φ_s < 0).',
          'Höhe des Punkts über dem Mittelpunkt (φ_s liegt in der oberen Hälfte, cos φ_s < 0).'),
        B.geometry, 'h = -L*cos(phiS)', { h: 'm' }),
      step('v_s^2 = gh',
        tri('代入松弛条件 v_s² = −gL cosφ_s。',
          'Insert into the slack condition v_s² = −gL cos φ_s.',
          'In die Bedingung v_s² = −gL cos φ_s einsetzen.'),
        B.previous, 'vs^2 = g*h', { vs: 'm/s', h: 'm' }),
      step('\\tfrac12 mv_s^2 + mg(L + h) = \\tfrac12 mv_0^2',
        tri('松弛点比最低点高 L + h，从最低点到松弛点机械能守恒。',
          'The slack point is L + h above the lowest point; mechanical energy is conserved from the lowest point to the slack point.',
          'Der Punkt liegt L + h über dem tiefsten Punkt; vom tiefsten Punkt bis dorthin bleibt die mechanische Energie erhalten.'),
        B.energy, 'm*vs^2/2 + m*g*(L + h) = m*v0^2/2', { vs: 'm/s', h: 'm' }),
      step('\\tfrac12 mgh + mg(L + h) = \\tfrac12 mv_0^2',
        tri('代入 v_s² = gh。', 'Insert v_s² = gh.', 'v_s² = gh einsetzen.'),
        B.previous, 'm*g*h/2 + m*g*(L + h) = m*v0^2/2', { h: 'm' }),
      step('h = \\dfrac{v_0^2 - 2gL}{3g}',
        tri('解出 h。v₀² = 5gL 时 h = L（最高点）；v₀² = 2gL 时 h = 0（水平直径处）。',
          'Solve for h. For v₀² = 5gL, h = L (the top); for v₀² = 2gL, h = 0 (the horizontal diameter).',
          'Nach h auflösen. Für v₀² = 5gL ist h = L (höchster Punkt); für v₀² = 2gL ist h = 0 (waagerechter Durchmesser).'),
        B.rearrange, 'h = (v0^2 - 2*g*L)/(3*g)', { h: 'm' })
    ]
  },
  {
    formula: 'vc.r.vS',
    title: tri('绳松弛时小球的速率', 'Speed of the ball when the rope goes slack', 'Geschwindigkeit der Kugel beim Schlaffwerden des Seils'),
    uses: ['vcircle-rope.forces', 'vcircle-rope.energy', 'vcircle-rope.slack'],
    steps: [
      step('\\cos\\varphi_s = \\dfrac{2gL - v_0^2}{3gL}',
        tri('松弛点的位置角（见“绳松弛处的位置角”）。',
          'The position angle of the slack point (see “Position angle at which the rope goes slack”).',
          'Der Lagewinkel des Punkts (siehe „Lagewinkel, bei dem das Seil schlaff wird“).'),
        tri('机械能守恒与松弛条件联立', 'Conservation of energy combined with the slack condition', 'Energieerhaltung zusammen mit der Bedingung für das Schlaffwerden'),
        'cos(phiS) = (2*g*L - v0^2)/(3*g*L)'),
      step('v_s^2 = -gL\\cos\\varphi_s = \\dfrac{v_0^2 - 2gL}{3}',
        tri('代入松弛条件。', 'Insert into the slack condition.', 'In die Bedingung für das Schlaffwerden einsetzen.'),
        B.previous, 'vs^2 = (v0^2 - 2*g*L)/3', { vs: 'm/s' }),
      step('v_s = \\sqrt{\\dfrac{v_0^2 - 2gL}{3}}',
        tri('开平方。v₀² = 5gL 时 v_s = √(gL)，与最高点的临界速度一致。',
          'Take the square root. For v₀² = 5gL, v_s = √(gL), the critical speed at the top.',
          'Wurzel ziehen. Für v₀² = 5gL ist v_s = √(gL), die kritische Geschwindigkeit im höchsten Punkt.'),
        B.rearrange, 'vs = sqrt((v0^2 - 2*g*L)/3)', { vs: 'm/s' })
    ]
  },
  {
    formula: 'vc.r.tS',
    title: tri('绳松弛的时刻（椭圆积分）', 'Time at which the rope goes slack (elliptic integral)', 'Zeitpunkt, zu dem das Seil schlaff wird (elliptisches Integral)'),
    note: tri('F 为第一类不完全椭圆积分；φ₀ 为本段起点的位置角（从最低点出发时为 0），时间自本段开始量起',
      'F is the incomplete elliptic integral of the first kind; φ₀ is the position angle at the start of the phase (0 when starting from the lowest point); time is measured from the start of the phase',
      'F ist das unvollständige elliptische Integral erster Art; φ₀ ist der Lagewinkel zu Beginn des Abschnitts (0 beim Start im tiefsten Punkt); die Zeit wird ab Beginn des Abschnitts gemessen'),
    uses: ['vcircle-rope.energy'],
    steps: [
      step('v^2 = v_0^2 - 4gL\\sin^2\\dfrac{\\varphi}{2}',
        tri('在机械能守恒式中用 1 − cosφ = 2sin²(φ/2)。',
          'Use 1 − cos φ = 2 sin²(φ/2) in the energy equation.',
          'In der Energiegleichung 1 − cos φ = 2 sin²(φ/2) verwenden.'),
        tri('三角恒等式（半角公式）', 'Trigonometric identity (half-angle formula)', 'Trigonometrische Identität (Halbwinkelformel)'),
        'v^2 = v0^2 - 4*g*L*sin(phi/2)^2', { v: 'm/s', phi: 'rad' }),
      step('v = v_0\\sqrt{1 - k^2\\sin^2\\dfrac{\\varphi}{2}},\\quad k = \\dfrac{2\\sqrt{gL}}{v_0}',
        tri('提出 v₀²，记 k = 2√(gL)/v₀。绳会松弛时 k 可以大于 1，但在松弛之前总有 k sin(φ/2) < 1。',
          'Factor out v₀² and set k = 2√(gL)/v₀. When the rope goes slack k may exceed 1, but before that k sin(φ/2) < 1 always holds.',
          'v₀² ausklammern und k = 2√(gL)/v₀ setzen. Wird das Seil schlaff, kann k größer als 1 sein, vorher gilt aber stets k sin(φ/2) < 1.'),
        B.rearrange, 'v = v0*sqrt(1 - (2*sqrt(g*L)/v0)^2*sin(phi/2)^2)', { v: 'm/s', phi: 'rad' }),
      step('\\mathrm{d}t = \\dfrac{L\\,\\mathrm{d}\\varphi}{v} = \\dfrac{L}{v_0}\\cdot\\dfrac{\\mathrm{d}\\varphi}{\\sqrt{1 - k^2\\sin^2(\\varphi/2)}}',
        tri('绳张紧时小球沿半径为 L 的圆周运动，v = L dφ/dt。',
          'While the rope is taut the ball moves on a circle of radius L, v = L dφ/dt.',
          'Solange das Seil gespannt ist, bewegt sich die Kugel auf einem Kreis mit Radius L, v = L dφ/dt.'),
        tri('圆周运动 v = ωr', 'Circular motion, v = ωr', 'Kreisbewegung, v = ωr'),
        'dt = L/v0*dphi/sqrt(1 - k^2*sin(phi/2)^2)', { dt: 's', dphi: 'rad', phi: 'rad', k: '' }),
      step('\\psi = \\dfrac{\\varphi}{2}:\\quad \\mathrm{d}t = \\dfrac{2L}{v_0}\\cdot\\dfrac{\\mathrm{d}\\psi}{\\sqrt{1 - k^2\\sin^2\\psi}}',
        tri('换元 ψ = φ/2，dφ = 2dψ。', 'Substitute ψ = φ/2, dφ = 2 dψ.', 'Substitution ψ = φ/2, dφ = 2 dψ.'),
        B.substitution, 'dt = 2*L/v0*dpsi/sqrt(1 - k^2*sin(psi)^2)', { dt: 's', dpsi: 'rad', psi: 'rad', k: '' }),
      step('t_s = \\dfrac{2L}{v_0}\\left[F\\!\\left(\\tfrac{\\varphi_s}{2}, k\\right) - F\\!\\left(\\tfrac{\\varphi_0}{2}, k\\right)\\right],\\; k = \\dfrac{2\\sqrt{gL}}{v_0}',
        tri('从本段起点 φ₀ 积分到松弛点 φ_s。F(ψ, k) = ∫₀^ψ dψ′/√(1 − k²sin²ψ′) 为第一类不完全椭圆积分；φ_s 由 cosφ_s = (2gL − v₀²)/(3gL) 给出。',
          'Integrate from the start of the phase φ₀ to the slack point φ_s. F(ψ, k) = ∫₀^ψ dψ′/√(1 − k² sin²ψ′) is the incomplete elliptic integral of the first kind; φ_s follows from cos φ_s = (2gL − v₀²)/(3gL).',
          'Integration vom Beginn des Abschnitts φ₀ bis φ_s. F(ψ, k) = ∫₀^ψ dψ′/√(1 − k² sin²ψ′) ist das unvollständige elliptische Integral erster Art; φ_s folgt aus cos φ_s = (2gL − v₀²)/(3gL).'),
        tri('第一类不完全椭圆积分的定义', 'Definition of the incomplete elliptic integral of the first kind', 'Definition des unvollständigen elliptischen Integrals erster Art'),
        'ts = 2*L/v0*(ellipF(phiS/2, 2*sqrt(g*L)/v0) - ellipF(phi0/2, 2*sqrt(g*L)/v0))', { ts: 's' })
    ]
  }
]
