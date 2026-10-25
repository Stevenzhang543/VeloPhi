/**
 * Derivations of the formulas for a ball hitting a hinged body (situation "hinged-impact": ball of mass m with
 * normal velocity v, impact line at distance d from the axis, body with moment of inertia I about the axis,
 * coefficient of restitution e). Manual 26.50, D28.
 */
import type { Derivation, SharedSteps } from './types'
import { B, step, tri } from './b-common'

/** Angular impulse of the external forces about the axis during the impact (hinge force, gravity). */
const externalAngularImpulse = (zh: string, en: string, de: string) => step("L' - L = \\int M_{\\text{ext}}\\,\\mathrm{d}t \\approx 0",
  tri(zh, en, de), B.angularMomentumTheorem, 'Lp - L0 = Mext*dt', { Lp: 'kg·m²/s', Mext: 'N·m', dt: 's' })

/** Shared step lists: angular momentum about the axis, coefficient of restitution. */
export const SHARED_HINGED_IMPACT: SharedSteps[] = [
  {
    id: 'hinged-impact.angular',
    title: tri('碰撞中对转轴的角动量守恒', 'Conservation of angular momentum about the axis during the impact', 'Drehimpulserhaltung bezüglich der Drehachse beim Stoß'),
    steps: [
      externalAngularImpulse(
        '碰撞时间极短。小球与物体间的碰撞力是内力，大小相等、方向相反且在同一直线上，对转轴的力矩之和为零。外力中铰链力很大（所以系统的动量不守恒），但它通过转轴，力矩为零；重力的力矩有限，在极短时间内的冲量矩可以忽略。所以系统对转轴的角动量守恒。',
        'The impact is very short. The contact forces between ball and body are internal: equal, opposite and on the same line, so their torques about the axis cancel. Of the external forces, the hinge force is large (so the momentum of the system is not conserved), but it passes through the axis and has no torque; the torque of gravity is finite and its angular impulse over the very short time is negligible. Hence the angular momentum of the system about the axis is conserved.',
        'Der Stoß dauert sehr kurz. Die Stoßkräfte zwischen Kugel und Körper sind innere Kräfte: gleich groß, entgegengesetzt und auf derselben Wirkungslinie; ihre Drehmomente bezüglich der Achse heben sich auf. Von den äußeren Kräften ist die Gelenkkraft groß (der Impuls des Systems bleibt daher nicht erhalten), sie geht aber durch die Achse und hat kein Drehmoment; das Drehmoment der Gewichtskraft ist endlich, sein Drehstoß in der sehr kurzen Zeit vernachlässigbar. Der Drehimpuls des Systems bezüglich der Achse bleibt also erhalten.'),
      step('L = mvd + I\\omega',
        tri('对转轴的角动量：小球为动量 mv 乘以力臂 d（d 为碰撞法线到转轴的距离，v 为小球沿法线的速度；碰撞光滑时小球沿切向的速度不变，这部分角动量碰撞前后相同，可以不计）；物体为 Iω，I 为物体对转轴的转动惯量。',
          'Angular momentum about the axis: for the ball, its momentum mv times the lever arm d (d is the distance of the impact normal from the axis, v the velocity of the ball along the normal; in a smooth impact the tangential velocity of the ball does not change, so its share of the angular momentum is the same before and after and can be left out); for the body Iω, I being its moment of inertia about the axis.',
          'Drehimpuls bezüglich der Achse: für die Kugel Impuls mv mal Hebelarm d (d ist der Abstand der Stoßnormalen von der Achse, v die Geschwindigkeit der Kugel längs der Normalen; bei reibungsfreiem Stoß ändert sich die Tangentialgeschwindigkeit der Kugel nicht, ihr Anteil am Drehimpuls ist vorher und nachher gleich und kann weggelassen werden); für den Körper Iω mit dem Trägheitsmoment I bezüglich der Achse.'),
        tri('角动量的定义（质点：动量 × 力臂；刚体：Iω）', 'Definition of angular momentum (particle: momentum × lever arm; rigid body: Iω)', 'Definition des Drehimpulses (Massenpunkt: Impuls × Hebelarm; starrer Körper: Iω)'),
        'Lb = m*v*d + Ip*omega', { Lb: 'kg·m²/s', omega: 'rad/s' }),
      step("mvd = mv'd + I\\omega'",
        tri('物体碰前静止。v′ 为碰后小球沿法线的速度，ω′ 为碰后物体的角速度（以小球推动它的转向为正）。',
          'The body is at rest before the impact. v′ is the velocity of the ball along the normal after the impact, ω′ the angular velocity of the body afterwards (positive in the sense in which the ball pushes it).',
          'Der Körper ruht vor dem Stoß. v′ ist die Geschwindigkeit der Kugel längs der Normalen nach dem Stoß, ω′ die Winkelgeschwindigkeit des Körpers danach (positiv in dem Drehsinn, in den die Kugel ihn stößt).'),
        B.angularMomentum, 'm*v*d = m*vp*d + Ip*wp', { vp: 'm/s', wp: 'rad/s' })
    ]
  },
  {
    id: 'hinged-impact.restitution',
    title: tri('恢复系数关系', 'Coefficient of restitution', 'Stoßzahl'),
    steps: [
      step("v_P' = \\omega' d",
        tri('碰后物体上碰撞点的速度：定轴转动中该点的速度等于 ω′ 乘以它到转轴的距离，其沿碰撞法线的分量为 ω′d。',
          'After the impact the contact point on the body moves with ω′ times its distance from the axis; the component of this velocity along the impact normal is ω′d.',
          'Nach dem Stoß bewegt sich der Stoßpunkt des Körpers mit ω′ mal seinem Abstand von der Achse; die Komponente dieser Geschwindigkeit längs der Stoßnormalen ist ω′d.'),
        tri('定轴转动 v = ωr', 'Rotation about a fixed axis, v = ωr', 'Drehung um eine feste Achse, v = ωr'),
        'vP = wp*d', { vP: 'm/s', wp: 'rad/s' }),
      step("\\omega' d - v' = e\\,v",
        tri('沿碰撞法线，碰后两者的分离速度等于碰前接近速度的 e 倍；碰前碰撞点静止，接近速度就是 v。',
          'Along the impact normal the speed of separation after the impact is e times the speed of approach before it; the contact point on the body is at rest before, so the speed of approach is v.',
          'Längs der Stoßnormalen ist die Trennungsgeschwindigkeit nach dem Stoß e-mal die Annäherungsgeschwindigkeit davor; der Stoßpunkt des Körpers ruht vorher, die Annäherungsgeschwindigkeit ist also v.'),
        B.restitution, 'wp*d - vp = e*v', { wp: 'rad/s', vp: 'm/s' })
    ]
  }
]

/** Derivations of hi.v, hi.w and hi.L. */
export const DERIVATIONS_HINGED_IMPACT: Derivation[] = [
  {
    formula: 'hi.v',
    title: tri('碰后小球速度（沿碰撞法线）', 'Velocity of the ball after the impact (along the impact normal)', 'Geschwindigkeit der Kugel nach dem Stoß (längs der Stoßnormalen)'),
    uses: ['hinged-impact.angular', 'hinged-impact.restitution'],
    steps: [
      step("\\omega' = \\dfrac{v' + ev}{d}",
        tri('由恢复系数关系解出 ω′。', 'Solve the restitution relation for ω′.', 'Die Stoßzahl-Beziehung nach ω′ auflösen.'),
        B.rearrange, 'wp = (vp + e*v)/d', { wp: 'rad/s', vp: 'm/s' }),
      step("mvd^2 = mv'd^2 + I(v' + ev)",
        tri('代入角动量守恒式，两边同乘 d。', 'Insert into the conservation of angular momentum and multiply both sides by d.', 'In die Drehimpulserhaltung einsetzen und beide Seiten mit d multiplizieren.'),
        B.previous, 'm*v*d^2 = m*vp*d^2 + Ip*(vp + e*v)', { vp: 'm/s' }),
      step("v' = \\dfrac{v\\,(md^2 - eI)}{md^2 + I}",
        tri('解出 v′。md² > eI 时小球继续向前运动，md² < eI 时小球被弹回。',
          'Solve for v′. For md² > eI the ball keeps moving forwards; for md² < eI it bounces back.',
          'Nach v′ auflösen. Für md² > eI bewegt sich die Kugel weiter vorwärts, für md² < eI prallt sie zurück.'),
        B.rearrange, 'vp = v*(m*d^2 - e*Ip)/(m*d^2 + Ip)', { vp: 'm/s' })
    ]
  },
  {
    formula: 'hi.w',
    title: tri('碰后物体的角速度', 'Angular velocity of the body after the impact', 'Winkelgeschwindigkeit des Körpers nach dem Stoß'),
    uses: ['hinged-impact.angular', 'hinged-impact.restitution'],
    steps: [
      step("v' = \\omega' d - ev",
        tri('由恢复系数关系解出 v′。', 'Solve the restitution relation for v′.', 'Die Stoßzahl-Beziehung nach v′ auflösen.'),
        B.rearrange, 'vp = wp*d - e*v', { vp: 'm/s', wp: 'rad/s' }),
      step("mvd = m(\\omega' d - ev)\\,d + I\\omega'",
        tri('代入角动量守恒式。', 'Insert into the conservation of angular momentum.', 'In die Drehimpulserhaltung einsetzen.'),
        B.previous, 'm*v*d = m*(wp*d - e*v)*d + Ip*wp', { wp: 'rad/s' }),
      step("\\omega' = \\dfrac{(1 + e)\\,mdv}{md^2 + I}",
        tri('解出 ω′。e = 0（完全非弹性碰撞）时 ω′ = mdv/(md² + I)，小球与碰撞点一起运动。',
          'Solve for ω′. For e = 0 (perfectly inelastic) ω′ = mdv/(md² + I) and the ball moves on together with the contact point.',
          'Nach ω′ auflösen. Für e = 0 (vollkommen unelastisch) ist ω′ = mdv/(md² + I); die Kugel bewegt sich mit dem Stoßpunkt mit.'),
        B.rearrange, 'wp = (1 + e)*m*d*v/(m*d^2 + Ip)', { wp: 'rad/s' })
    ]
  },
  {
    formula: 'hi.L',
    title: tri('对转轴的角动量守恒', 'Conservation of angular momentum about the axis', 'Drehimpulserhaltung bezüglich der Drehachse'),
    steps: [
      step('M_{12} = -M_{21}',
        tri('碰撞力（法向的弹力以及可能有的摩擦力）是小球与物体间的内力，等大、反向、共线，它们对转轴的力矩之和为零。',
          'The impact forces (the normal force and any friction) are internal forces between ball and body: equal, opposite and collinear, so their torques about the axis add up to zero.',
          'Die Stoßkräfte (Normalkraft und gegebenenfalls Reibung) sind innere Kräfte zwischen Kugel und Körper: gleich groß, entgegengesetzt und auf einer Wirkungslinie; ihre Drehmomente bezüglich der Achse heben sich auf.'),
        B.newton3, 'M12 = -M21', { M12: 'N·m', M21: 'N·m' }),
      externalAngularImpulse(
        '外力中，铰链力通过转轴，力矩为零（但它的冲量很大，系统的动量不守恒）；重力矩有限，在极短的碰撞时间内冲量矩可以忽略。',
        'Of the external forces, the hinge force passes through the axis and has no torque (its impulse is large, so the momentum of the system is not conserved); the torque of gravity is finite and its angular impulse over the very short impact is negligible.',
        'Von den äußeren Kräften geht die Gelenkkraft durch die Achse und hat kein Drehmoment (ihr Kraftstoß ist groß, der Impuls des Systems bleibt daher nicht erhalten); das Drehmoment der Gewichtskraft ist endlich, sein Drehstoß während des sehr kurzen Stoßes vernachlässigbar.'),
      step("L' = L",
        tri('碰撞前后小球与物体对转轴的总角动量相等。L 包括小球的角动量（动量乘以它到转轴的力臂）和物体的 Iω。',
          'The total angular momentum of ball and body about the axis is the same before and after the impact. L comprises the angular momentum of the ball (its momentum times its lever arm about the axis) and Iω of the body.',
          'Der Gesamtdrehimpuls von Kugel und Körper bezüglich der Achse ist vor und nach dem Stoß gleich. L umfasst den Drehimpuls der Kugel (Impuls mal Hebelarm bezüglich der Achse) und Iω des Körpers.'),
        B.angularMomentum, 'Lp = L0', { Lp: 'kg·m²/s' })
    ]
  }
]
