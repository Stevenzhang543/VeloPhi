/**
 * Derivations of the fixed-axis rotation formulas (situation "rotation": body of mass m hinged at a fixed axis,
 * centre of mass at distance d, moment of inertia I about the axis, angle φ of the centre of mass from the
 * downward vertical, anticlockwise positive). Manual 26.50, D28.
 */
import type { Derivation, SharedSteps } from './types'
import { B, step, tri } from './b-common'

/** Shared step lists: moment of inertia and torque, conservation of energy. */
export const SHARED_ROTATION: SharedSteps[] = [
  {
    id: 'rotation.setup',
    title: tri('受力分析与转动惯量', 'Forces and moment of inertia', 'Kräfte und Trägheitsmoment'),
    steps: [
      step('I = I_C + md^2',
        tri('物体受重力 mg（作用在质心）和铰链的作用力（作用在转轴上）。I_C 为物体对质心的转动惯量，d 为质心到转轴的距离，由平行轴定理得物体对转轴的转动惯量 I。',
          'The body is acted on by its weight mg at the centre of mass and by the hinge force at the axis. With I_C the moment of inertia about the centre of mass and d the distance from the centre of mass to the axis, the parallel-axis theorem gives the moment of inertia I about the axis.',
          'Auf den Körper wirken die Gewichtskraft mg im Schwerpunkt und die Gelenkkraft in der Drehachse. Mit dem Trägheitsmoment I_C bezüglich des Schwerpunkts und dem Abstand d des Schwerpunkts von der Achse liefert der Satz von Steiner das Trägheitsmoment I bezüglich der Achse.'),
        B.parallelAxis, 'Ip = IC + m*d^2', { IC: 'kg·m²' }),
      step('M = -mgd\\sin\\varphi',
        tri('φ 为质心偏离竖直向下方向的角度（逆时针为正）。铰链力通过转轴，力矩为零；重力的力臂为 d sinφ，它的力矩总使物体转回最低位置。',
          'φ is the angle of the centre of mass from the downward vertical (anticlockwise positive). The hinge force passes through the axis and has no torque; the lever arm of the weight is d sin φ, and its torque always turns the body back towards the lowest position.',
          'φ ist der Winkel des Schwerpunkts gegen die Senkrechte nach unten (gegen den Uhrzeigersinn positiv). Die Gelenkkraft geht durch die Achse und hat kein Drehmoment; der Hebelarm der Gewichtskraft ist d sin φ, ihr Drehmoment dreht den Körper stets zur tiefsten Lage zurück.'),
        tri('力矩 = 力 × 力臂', 'Torque = force × lever arm', 'Drehmoment = Kraft × Hebelarm'),
        'Mg = -m*g*d*sin(phi)', { Mg: 'N·m' })
    ]
  },
  {
    id: 'rotation.energy',
    title: tri('机械能守恒', 'Conservation of mechanical energy', 'Energieerhaltung'),
    steps: [
      step('E_k = \\tfrac12 I\\omega^2',
        tri('铰链力作用在固定的转轴上，作用点不动，不做功；只有重力做功，机械能守恒。绕固定轴转动的物体的动能为 ½Iω²。',
          'The hinge force acts at the fixed axis, whose point does not move, so it does no work; only gravity does work and mechanical energy is conserved. The kinetic energy of a body rotating about a fixed axis is ½Iω².',
          'Die Gelenkkraft greift an der festen Achse an, deren Punkt sich nicht bewegt; sie verrichtet keine Arbeit. Nur die Gewichtskraft verrichtet Arbeit, die mechanische Energie bleibt erhalten. Die kinetische Energie eines um eine feste Achse rotierenden Körpers ist ½Iω².'),
        tri('转动动能', 'Rotational kinetic energy', 'Rotationsenergie'),
        'Ek = Ip*omega^2/2', { Ek: 'J', omega: 'rad/s' }),
      step('h = d(1 - \\cos\\varphi)',
        tri('重力势能只取决于质心的高度：偏角为 φ 时，质心比最低位置高 h。',
          'The gravitational potential energy depends only on the height of the centre of mass: at angle φ it is h above its lowest position.',
          'Die Lageenergie hängt nur von der Höhe des Schwerpunkts ab: Beim Winkel φ liegt er um h über seiner tiefsten Lage.'),
        B.geometry, 'h = d*(1 - cos(phi))', { h: 'm' }),
      step('\\tfrac12 I\\omega^2 = \\tfrac12 I\\omega_0^2 + mgd(1 - \\cos\\varphi_0)',
        tri('从初始位置 φ₀（角速度 ω₀）转到最低位置 φ = 0，减少的重力势能 mgd(1 − cosφ₀) 转化为转动动能。',
          'Turning from the initial position φ₀ (angular velocity ω₀) to the lowest position φ = 0, the lost gravitational potential energy mgd(1 − cos φ₀) becomes rotational kinetic energy.',
          'Bei der Drehung von der Anfangslage φ₀ (Winkelgeschwindigkeit ω₀) in die tiefste Lage φ = 0 wird die abgegebene Lageenergie mgd(1 − cos φ₀) in Rotationsenergie umgewandelt.'),
        B.energy, 'Ip*omega^2/2 = Ip*omega0^2/2 + m*g*d*(1 - cos(phi0))', { omega: 'rad/s' })
    ]
  }
]

/** Derivations of ro.alpha, ro.omega, ro.rod and ro.F. */
export const DERIVATIONS_ROTATION: Derivation[] = [
  {
    formula: 'ro.alpha',
    title: tri('角加速度（转动定律）', "Angular acceleration (Newton's second law for rotation)", 'Winkelbeschleunigung (Grundgesetz der Drehbewegung)'),
    note: tri('I = I_C + md²（平行轴定理）；φ 为质心偏离竖直向下的角度',
      'I = I_C + md² (parallel-axis theorem); φ is the angle of the centre of mass from the downward vertical',
      'I = I_C + md² (Satz von Steiner); φ ist der Winkel des Schwerpunkts gegen die Senkrechte nach unten'),
    uses: ['rotation.setup'],
    steps: [
      step('I\\beta = M',
        tri('刚体绕定轴转动：合力矩等于转动惯量与角加速度的乘积。',
          'Rotation of a rigid body about a fixed axis: the resultant torque equals the moment of inertia times the angular acceleration.',
          'Drehung eines starren Körpers um eine feste Achse: Das resultierende Drehmoment ist gleich Trägheitsmoment mal Winkelbeschleunigung.'),
        B.rotationLaw, 'Ip*beta = Mg', { beta: 'rad/s²', Mg: 'N·m' }),
      step('\\beta = -\\dfrac{mgd\\sin\\varphi}{I}',
        tri('代入重力的力矩。负号表示角加速度总使物体转回最低位置；摆角很小时 β ≈ −(mgd/I)φ，物体做简谐运动（复摆）。',
          'Insert the torque of the weight. The minus sign means the angular acceleration always turns the body back towards the lowest position; for small angles β ≈ −(mgd/I)φ and the body oscillates harmonically (physical pendulum).',
          'Das Drehmoment der Gewichtskraft einsetzen. Das Minuszeichen bedeutet, dass die Winkelbeschleunigung den Körper stets zur tiefsten Lage zurückdreht; für kleine Winkel ist β ≈ −(mgd/I)φ, der Körper schwingt harmonisch (physikalisches Pendel).'),
        B.previous, 'beta = -m*g*d*sin(phi)/Ip', { beta: 'rad/s²' })
    ]
  },
  {
    formula: 'ro.omega',
    title: tri('转到最低点的角速度（机械能守恒）', 'Angular velocity at the lowest position (conservation of mechanical energy)', 'Winkelgeschwindigkeit in der tiefsten Lage (Energieerhaltung)'),
    uses: ['rotation.setup', 'rotation.energy'],
    steps: [
      step('\\omega^2 = \\omega_0^2 + \\dfrac{2mgd(1 - \\cos\\varphi_0)}{I}',
        tri('由机械能守恒式解出 ω²。', 'Solve the energy equation for ω².', 'Die Energiegleichung nach ω² auflösen.'),
        B.rearrange, 'omega^2 = omega0^2 + 2*m*g*d*(1 - cos(phi0))/Ip', { omega: 'rad/s' }),
      step('\\omega = \\sqrt{\\omega_0^2 + \\dfrac{2mgd(1 - \\cos\\varphi_0)}{I}}',
        tri('开平方得角速度的大小；I 用平行轴定理 I = I_C + md² 计算。',
          'The square root gives the magnitude of the angular velocity; I follows from the parallel-axis theorem I = I_C + md².',
          'Die Wurzel ergibt den Betrag der Winkelgeschwindigkeit; I folgt aus dem Satz von Steiner I = I_C + md².'),
        B.rearrange, 'omega = sqrt(omega0^2 + 2*m*g*d*(1 - cos(phi0))/Ip)', { omega: 'rad/s' })
    ]
  },
  {
    formula: 'ro.rod',
    title: tri('细杆从水平释放到竖直的角速度', 'Angular velocity of a thin rod released from the horizontal, on reaching the vertical', 'Winkelgeschwindigkeit eines waagerecht losgelassenen dünnen Stabs in der senkrechten Lage'),
    uses: ['rotation.setup', 'rotation.energy'],
    steps: [
      step('d = \\dfrac{L}{2},\\quad I = \\dfrac{mL^2}{12} + m\\left(\\dfrac{L}{2}\\right)^2 = \\dfrac{mL^2}{3}',
        tri('匀质细杆绕一端转动：质心在杆的中点，I_C = mL²/12，由平行轴定理得 I = mL²/3。',
          'A uniform thin rod pivoted at one end: the centre of mass is at the midpoint, I_C = mL²/12, and the parallel-axis theorem gives I = mL²/3.',
          'Homogener dünner Stab, an einem Ende drehbar gelagert: Der Schwerpunkt liegt in der Mitte, I_C = mL²/12; der Satz von Steiner liefert I = mL²/3.'),
        B.parallelAxis, 'Ip = m*L^2/12 + m*(L/2)^2'),
      step('\\tfrac12\\cdot\\dfrac{mL^2}{3}\\,\\omega^2 = mg\\,\\dfrac{L}{2}',
        tri('从水平位置（φ₀ = 90°）由静止（ω₀ = 0）释放，转到竖直位置时质心下降 L/2。',
          'Released from rest (ω₀ = 0) in the horizontal position (φ₀ = 90°); at the vertical the centre of mass has descended by L/2.',
          'Aus der Ruhe (ω₀ = 0) in waagerechter Lage (φ₀ = 90°) losgelassen; in der senkrechten Lage ist der Schwerpunkt um L/2 gesunken.'),
        B.energy, 'm*L^2/3*omega^2/2 = m*g*L/2', { omega: 'rad/s' }),
      step('\\omega = \\sqrt{\\dfrac{3g}{L}}',
        tri('解出 ω，与杆的质量无关。杆端的速率 ωL = √(3gL)，比从同样高度 L 自由下落的速率 √(2gL) 还大。',
          'Solve for ω; it does not depend on the mass of the rod. The free end moves at ωL = √(3gL), faster even than a body falling freely through the same height L, √(2gL).',
          'Nach ω auflösen; das Ergebnis hängt nicht von der Masse des Stabs ab. Das freie Ende bewegt sich mit ωL = √(3gL), sogar schneller als ein Körper nach freiem Fall aus derselben Höhe L, √(2gL).'),
        B.rearrange, 'omega = sqrt(3*g/L)', { omega: 'rad/s' })
    ]
  },
  {
    formula: 'ro.F',
    title: tri('最低点铰链对物体的力', 'Hinge force on the body at the lowest position', 'Gelenkkraft auf den Körper in der tiefsten Lage'),
    uses: ['rotation.setup', 'rotation.energy'],
    steps: [
      step('\\varphi = 0:\\quad \\beta = 0',
        tri('在最低位置重力的力矩为零，角加速度为零，质心没有切向加速度，所以铰链力没有水平分量。',
          'At the lowest position the torque of the weight vanishes, so β = 0: the centre of mass has no tangential acceleration and the hinge force has no horizontal component.',
          'In der tiefsten Lage verschwindet das Drehmoment der Gewichtskraft, also β = 0: Der Schwerpunkt hat keine Tangentialbeschleunigung, die Gelenkkraft keine waagerechte Komponente.'),
        B.rotationLaw),
      step('F - mg = m\\omega^2 d',
        tri('质心以半径 d 做圆周运动，向心加速度 ω²d 竖直向上。对整个物体用牛顿第二定律（质心运动定理）：竖直向上的铰链力 F 与重力的合力提供质心的向心力。',
          "The centre of mass moves on a circle of radius d with centripetal acceleration ω²d, vertically upwards. Newton's second law for the whole body (motion of the centre of mass): the upward hinge force F and the weight together provide the centripetal force.",
          'Der Schwerpunkt bewegt sich auf einem Kreis mit Radius d, die Zentripetalbeschleunigung ω²d zeigt senkrecht nach oben. Zweites Newtonsches Gesetz für den ganzen Körper (Schwerpunktsatz): Die nach oben gerichtete Gelenkkraft F und die Gewichtskraft liefern zusammen die Zentripetalkraft.'),
        tri('牛顿第二定律（质心运动定理）', "Newton's second law for the centre of mass", 'Zweites Newtonsches Gesetz für den Schwerpunkt (Schwerpunktsatz)'),
        'F - m*g = m*omega^2*d', { F: 'N', omega: 'rad/s' }),
      step('\\omega^2 = \\omega_0^2 + \\dfrac{2mgd(1 - \\cos\\varphi_0)}{I}',
        tri('最低位置的角速度由机械能守恒得到（见“转到最低点的角速度（机械能守恒）”）。',
          'The angular velocity at the lowest position follows from conservation of energy (see “Angular velocity at the lowest position (conservation of mechanical energy)”).',
          'Die Winkelgeschwindigkeit in der tiefsten Lage folgt aus der Energieerhaltung (siehe „Winkelgeschwindigkeit in der tiefsten Lage (Energieerhaltung)“).'),
        B.energy, 'omega^2 = omega0^2 + 2*m*g*d*(1 - cos(phi0))/Ip', { omega: 'rad/s' }),
      step('F = mg + m\\omega^2 d',
        tri('移项；代入 ω² 即得用已知量表示的铰链力。它大于重力，多出的部分提供质心的向心力。',
          'Rearranged; inserting ω² expresses the hinge force in known quantities. It exceeds the weight; the excess provides the centripetal force on the centre of mass.',
          'Umgeformt; mit eingesetztem ω² ist die Gelenkkraft durch bekannte Größen ausgedrückt. Sie ist größer als die Gewichtskraft; der Überschuss liefert die Zentripetalkraft auf den Schwerpunkt.'),
        B.rearrange, 'F = m*g + m*omega^2*d', { F: 'N', omega: 'rad/s' })
    ]
  }
]
