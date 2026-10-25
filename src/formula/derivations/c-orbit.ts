/**
 * Derivations of the 26.51 situations "circle" (uniform circular motion of a ball on a string, seen from above)
 * and "orbit" (a body moving under the gravitation of one fixed body) (manual 26.51, D44, D50). In the orbit,
 * r is the distance to the centre, r₀ and v₀ the start values, a the semi-major axis and L the angular momentum
 * about the centre, both from the start values.
 */
import type { Derivation, SharedSteps } from './types'
import { B, st, tri } from './a-common'

/** Shared steps of the circle and orbit situations (none). */
export const ORBIT_SHARED: SharedSteps[] = []

/** Derivations of the circular-motion and orbit formulas. */
export const ORBIT_DERIVATIONS: Derivation[] = [
  // ---- Uniform circular motion ----
  {
    formula: 'uc.w',
    title: tri('角速度与线速度', 'Angular and linear speed', 'Winkelgeschwindigkeit und Bahngeschwindigkeit'),
    steps: [
      st('v = \\dfrac{\\Delta s}{\\Delta t} = \\dfrac{r\\,\\Delta\\theta}{\\Delta t} = r\\omega',
        tri('在很短的时间 Δt 内，小球沿圆周走过弧长 Δs = rΔθ（Δθ 用弧度）；角速度 ω = Δθ/Δt 是半径转动的快慢。',
          'In a short time Δt the ball moves along the arc Δs = rΔθ (Δθ in radians); the angular speed ω = Δθ/Δt says how fast the radius turns.',
          'In kurzer Zeit Δt legt die Kugel den Bogen Δs = r·Δθ zurück (Δθ im Bogenmaß); die Winkelgeschwindigkeit ω = Δθ/Δt gibt an, wie schnell sich der Radius dreht.'),
        tri('弧长与圆心角的关系 s = rθ', 'Arc length and angle, s = rθ', 'Bogenlänge und Winkel, s = r·θ'), ['v', 'r*omega'], { omega: 'rad/s' }),
      st('\\omega = \\dfrac{v}{r}',
        tri('解出角速度。',
          'Solve for the angular speed.',
          'Nach der Winkelgeschwindigkeit auflösen.'),
        B.solve, ['omega', 'v/r'], { omega: 'rad/s' })
    ]
  },
  {
    formula: 'uc.T',
    title: tri('周期', 'Period', 'Umlaufdauer'),
    steps: [
      st('vT = 2\\pi r',
        tri('速率不变：转一周通过的路程是圆的周长。',
          'The speed is constant: in one turn the ball covers the circumference.',
          'Der Betrag der Geschwindigkeit ist konstant: In einer Umdrehung legt die Kugel den Umfang zurück.'),
        tri('匀速圆周运动：速率不变', 'Uniform circular motion: constant speed', 'Gleichförmige Kreisbewegung: konstanter Geschwindigkeitsbetrag'), ['v*T', '2*pi*r'], { T: 's' }),
      st('T = \\dfrac{2\\pi r}{v}',
        tri('解出周期；也可写成 T = 2π/ω。',
          'Solve for the period; equivalently T = 2π/ω.',
          'Nach der Umlaufdauer auflösen; gleichwertig T = 2π/ω.'),
        B.solve, ['T', '2*pi*r/v'], { T: 's' })
    ]
  },
  {
    formula: 'uc.a',
    title: tri('向心加速度', 'Centripetal acceleration', 'Zentripetalbeschleunigung'),
    steps: [
      st('|\\Delta\\vec v| \\approx v\\,\\Delta\\theta',
        tri('速度大小不变，方向随半径转过 Δθ；速度矢量的变化量指向圆心，大小约为 vΔθ。',
          'The speed stays the same while the direction turns with the radius through Δθ; the change of the velocity vector points to the centre and has size about vΔθ.',
          'Der Betrag bleibt gleich, die Richtung dreht sich mit dem Radius um Δθ; die Änderung des Geschwindigkeitsvektors zeigt zum Mittelpunkt und hat etwa den Betrag v·Δθ.'),
        tri('速度矢量的变化', 'Change of the velocity vector', 'Änderung des Geschwindigkeitsvektors'), ['dv', 'v*dtheta'], { dv: 'm/s', dtheta: '' }),
      st('a = \\dfrac{|\\Delta\\vec v|}{\\Delta t} = v\\omega = \\dfrac{v^2}{r}',
        tri('除以 Δt，用 ω = v/r。加速度始终指向圆心，叫向心加速度。',
          'Divide by Δt and use ω = v/r. The acceleration always points to the centre: the centripetal acceleration.',
          'Durch Δt teilen und ω = v/r verwenden. Die Beschleunigung zeigt stets zum Mittelpunkt: die Zentripetalbeschleunigung.'),
        B.accDef, ['a', 'v^2/r'], { a: 'm/s²' })
    ]
  },
  {
    formula: 'uc.F',
    title: tri('向心力', 'Centripetal force', 'Zentripetalkraft'),
    steps: [
      st('a = \\dfrac{v^2}{r}',
        tri('向心加速度（前面的结论）。',
          'The centripetal acceleration (earlier result).',
          'Die Zentripetalbeschleunigung (früheres Ergebnis).'),
        B.earlier, ['a', 'v^2/r'], { a: 'm/s²' }),
      st('F = ma = \\dfrac{mv^2}{r}',
        tri('使小球做圆周运动的合力指向圆心，这里就是绳的拉力（俯视图中重力与桌面支持力平衡）。',
          'The net force that keeps the ball on its circle points to the centre; here it is the pull of the string (seen from above, the weight and the push of the table balance).',
          'Die resultierende Kraft, die die Kugel auf der Kreisbahn hält, zeigt zum Mittelpunkt; hier ist es die Fadenkraft (von oben gesehen heben sich Gewichtskraft und Tischkraft auf).'),
        B.n2, ['F', 'm*v^2/r'], { F: 'N' })
    ]
  },
  // ---- Orbits ----
  {
    formula: 'or.F',
    title: tri('万有引力定律', "Newton's law of gravitation", 'Newtonsches Gravitationsgesetz'),
    note: tri('r 取仿真中此刻的距离', 'r is the distance at this moment in the simulation', 'r ist der momentane Abstand in der Simulation'),
    steps: [
      st('F = \\dfrac{GMm}{r^2}',
        tri('任何两个物体都相互吸引，引力与两者质量的乘积成正比，与距离的平方成反比，方向沿两者的连线。均匀球体可看成质量集中在球心。',
          'Any two bodies attract each other with a force proportional to the product of their masses and inversely proportional to the square of their distance, along the line joining them. A uniform sphere acts as if its mass were at its centre.',
          'Zwei Körper ziehen sich mit einer Kraft an, die proportional zum Produkt der Massen und umgekehrt proportional zum Quadrat des Abstands ist und längs der Verbindungslinie wirkt. Eine homogene Kugel wirkt, als läge ihre Masse im Mittelpunkt.'),
        tri('万有引力定律', "Newton's law of gravitation", 'Newtonsches Gravitationsgesetz'), ['F', 'G*M*m/r^2'], { F: 'N' })
    ]
  },
  {
    formula: 'or.v',
    title: tri('圆轨道的环绕速度', 'Speed on a circular orbit', 'Geschwindigkeit auf einer Kreisbahn'),
    steps: [
      st('\\dfrac{GMm}{r^2} = \\dfrac{mv^2}{r}',
        tri('圆轨道（r = r₀）上万有引力提供向心力。',
          'On a circular orbit (r = r₀) gravitation provides the centripetal force.',
          'Auf einer Kreisbahn (r = r₀) liefert die Gravitation die Zentripetalkraft.'),
        tri('万有引力提供向心力', 'Gravitation provides the centripetal force', 'Die Gravitation liefert die Zentripetalkraft'), ['G*M*m/r0^2', 'm*v^2/r0'], { v: 'm/s' }),
      st('v = \\sqrt{\\dfrac{GM}{r}}',
        tri('约去 m 解出速度：与环绕天体的质量无关，轨道越高速度越小。',
          'Cancel m and solve for the speed: it does not depend on the orbiting mass, and the higher the orbit the slower.',
          'm kürzen und nach v auflösen: unabhängig von der umlaufenden Masse; je höher die Bahn, desto langsamer.'),
        B.solve, ['v', 'sqrt(G*M/r0)'], { v: 'm/s' })
    ]
  },
  {
    formula: 'or.T',
    title: tri('开普勒第三定律（周期）', "Kepler's third law (period)", 'Drittes Keplersches Gesetz (Umlaufdauer)'),
    note: tri('圆轨道 a = r', 'On a circular orbit a = r', 'Auf einer Kreisbahn ist a = r'),
    steps: [
      st('\\dfrac{GMm}{a^2} = m\\left(\\dfrac{2\\pi}{T}\\right)^2 a',
        tri('先看半径为 a 的圆轨道：万有引力提供向心力，角速度 ω = 2π/T。',
          'Start with a circular orbit of radius a: gravitation provides the centripetal force, with angular speed ω = 2π/T.',
          'Zuerst eine Kreisbahn mit Radius a: Die Gravitation liefert die Zentripetalkraft, die Winkelgeschwindigkeit ist ω = 2π/T.'),
        tri('万有引力提供向心力', 'Gravitation provides the centripetal force', 'Die Gravitation liefert die Zentripetalkraft'), ['G*M*m/a^2', 'm*(2*pi/T)^2*a'], { T: 's' }),
      st('\\dfrac{a^3}{T^2} = \\dfrac{GM}{4\\pi^2}',
        tri('整理得开普勒第三定律：绕同一中心天体运动的物体，a³/T² 相同。开普勒从观测发现它对椭圆轨道也成立，这时 a 是半长轴。',
          "Rearranged: Kepler's third law — for bodies orbiting the same centre, a³/T² is the same. Kepler found from observations that it also holds for ellipses, with a the semi-major axis.",
          'Umgestellt: das dritte Keplersche Gesetz — für Körper um dasselbe Zentralgestirn ist a³/T² gleich. Kepler fand aus Beobachtungen, dass es auch für Ellipsen gilt, mit a als großer Halbachse.'),
        tri('开普勒第三定律', "Kepler's third law", 'Drittes Keplersches Gesetz'), ['a^3/T^2', 'G*M/(4*pi^2)'], { T: 's' }),
      st('T = 2\\pi\\sqrt{\\dfrac{a^3}{GM}}',
        tri('解出周期。半长轴由初始条件经轨道机械能求出：E = ½mv₀² − GMm/r₀ = −GMm/(2a)。',
          'Solve for the period. The semi-major axis follows from the start values through the orbital energy: E = ½mv₀² − GMm/r₀ = −GMm/(2a).',
          'Nach der Umlaufdauer auflösen. Die große Halbachse folgt aus den Anfangswerten über die Bahnenergie: E = ½·m·v₀² − G·M·m/r₀ = −G·M·m/(2a).'),
        B.solve, ['T', '2*pi*sqrt(a^3/(G*M))'], { T: 's' })
    ]
  },
  {
    formula: 'or.A',
    title: tri('开普勒第二定律（掠面速度不变）', "Kepler's second law (equal areas in equal times)", 'Zweites Keplersches Gesetz (Flächensatz)'),
    note: tri('角动量守恒', 'Conservation of angular momentum', 'Drehimpulserhaltung'),
    steps: [
      st('\\Delta A \\approx \\tfrac{1}{2}r\\,v_\\perp\\Delta t',
        tri('很短的时间 Δt 内，物体与中心的连线扫过的面积近似为三角形：底边 r，高 v⊥Δt（v⊥ 是垂直于连线的速度分量）。',
          'In a short time Δt the line from the centre sweeps out roughly a triangle: base r, height v⊥Δt (v⊥ is the velocity component perpendicular to that line).',
          'In kurzer Zeit Δt überstreicht die Verbindungslinie zum Zentrum ungefähr ein Dreieck: Grundseite r, Höhe v⊥·Δt (v⊥ ist die Geschwindigkeitskomponente senkrecht zur Linie).'),
        tri('三角形面积', 'Area of a triangle', 'Dreiecksfläche'), ['dA', 'r*vp*dt/2'], { dA: 'm²', vp: 'm/s', dt: 's' }),
      st('L = mr\\,v_\\perp',
        tri('对中心的角动量。',
          'The angular momentum about the centre.',
          'Der Drehimpuls bezüglich des Zentrums.'),
        tri('角动量的定义', 'Definition of angular momentum', 'Definition des Drehimpulses'), ['L', 'm*r*vp'], { vp: 'm/s' }),
      st('\\dfrac{\\mathrm{d}A}{\\mathrm{d}t} = \\dfrac{L}{2m}',
        tri('引力始终指向中心，对中心的力矩为零，角动量守恒；所以连线在相等时间内扫过相等的面积（近点快、远点慢）。',
          'Gravitation always points to the centre and has no moment about it, so the angular momentum is conserved: the line sweeps out equal areas in equal times (fast near the centre, slow far away).',
          'Die Gravitation zeigt stets zum Zentrum und hat bezüglich des Zentrums kein Drehmoment; der Drehimpuls bleibt erhalten, die Linie überstreicht in gleichen Zeiten gleiche Flächen (nahe schnell, fern langsam).'),
        tri('角动量守恒（有心力）', 'Conservation of angular momentum (central force)', 'Drehimpulserhaltung (Zentralkraft)'), ['dAdt', 'L/(2*m)'], { dAdt: 'm²/s' })
    ]
  },
  {
    formula: 'or.vis',
    title: tri('活力公式', 'Vis-viva equation', 'Vis-viva-Gleichung'),
    note: tri('r 取仿真中此刻的距离', 'r is the distance at this moment in the simulation', 'r ist der momentane Abstand in der Simulation'),
    steps: [
      st('E = \\tfrac{1}{2}mv^2 - \\dfrac{GMm}{r}',
        tri('只有引力做功，机械能守恒；引力势能 −GMm/r 以无穷远为零点。',
          'Only gravitation does work, so the mechanical energy is conserved; the potential energy −GMm/r is zero at infinity.',
          'Nur die Gravitation verrichtet Arbeit, die mechanische Energie bleibt erhalten; die potentielle Energie −G·M·m/r ist im Unendlichen null.'),
        tri('机械能守恒（只有引力做功）', 'Conservation of energy (only gravitation does work)', 'Energieerhaltung (nur die Gravitation verrichtet Arbeit)'), ['E', 'm*v^2/2 - G*M*m/r'], { E: 'J', v: 'm/s' }),
      st('E = -\\dfrac{GMm}{2a}',
        tri('椭圆轨道的机械能只由半长轴决定（见“轨道机械能”）。',
          'The energy of an elliptical orbit depends only on the semi-major axis (see “Orbital energy”).',
          'Die Energie einer Ellipsenbahn hängt nur von der großen Halbachse ab (siehe „Bahnenergie“).'),
        B.earlier, ['E', '-G*M*m/(2*a)'], { E: 'J' }),
      st('v^2 = GM\\left(\\dfrac{2}{r} - \\dfrac{1}{a}\\right)',
        tri('两式联立，约去 m。',
          'Equate the two and cancel m.',
          'Beide gleichsetzen und m kürzen.'),
        B.combine, ['v^2', 'G*M*(2/r - 1/a)'], { v: 'm/s' }),
      st('v = \\sqrt{GM\\left(\\dfrac{2}{r} - \\dfrac{1}{a}\\right)}',
        tri('取正根：离中心越近速度越大。',
          'Take the positive root: the closer to the centre, the faster.',
          'Positive Wurzel: Je näher am Zentrum, desto schneller.'),
        B.solve, ['v', 'sqrt(G*M*(2/r - 1/a))'], { v: 'm/s' })
    ]
  },
  {
    formula: 'or.E',
    title: tri('轨道机械能', 'Orbital energy', 'Bahnenergie'),
    steps: [
      st('E = \\tfrac{1}{2}mv^2 - \\dfrac{GMm}{r}',
        tri('机械能是动能与引力势能之和（势能以无穷远为零点），运动中保持不变。',
          'The mechanical energy is kinetic plus gravitational potential energy (zero at infinity) and stays constant.',
          'Die mechanische Energie ist kinetische plus potentielle Energie (null im Unendlichen) und bleibt konstant.'),
        tri('动能与引力势能之和', 'Kinetic plus gravitational potential energy', 'Kinetische plus potentielle Energie der Gravitation'), ['E', 'm*v^2/2 - G*M*m/r'], { E: 'J', v: 'm/s' }),
      st('mv^2 = \\dfrac{GMm}{r}',
        tri('圆轨道（r = a）上万有引力提供向心力：GMm/r² = mv²/r。',
          'On a circular orbit (r = a) gravitation provides the centripetal force: GMm/r² = mv²/r.',
          'Auf einer Kreisbahn (r = a) liefert die Gravitation die Zentripetalkraft: G·M·m/r² = m·v²/r.'),
        tri('万有引力提供向心力', 'Gravitation provides the centripetal force', 'Die Gravitation liefert die Zentripetalkraft'), ['m*v^2', 'G*M*m/r'], { v: 'm/s' }),
      st('E = -\\dfrac{GMm}{2a}',
        tri('代入得 E = −GMm/(2r)：动能是势能绝对值的一半。对椭圆轨道，在近点和远点分别用能量守恒与角动量守恒，可得同样的结果，r 换成半长轴 a。E < 0 表示物体被束缚。',
          'Inserting gives E = −GMm/(2r): the kinetic energy is half the size of the potential energy. For an ellipse, energy and angular momentum conservation at the nearest and farthest points give the same with r replaced by the semi-major axis a. E < 0 means the body is bound.',
          'Einsetzen ergibt E = −G·M·m/(2r): Die kinetische Energie ist halb so groß wie der Betrag der potentiellen. Für eine Ellipse liefern Energie- und Drehimpulserhaltung im nächsten und fernsten Punkt dasselbe, mit r ersetzt durch die große Halbachse a. E < 0 heißt: Der Körper ist gebunden.'),
        B.prev, ['E', '-G*M*m/(2*a)'], { E: 'J' })
    ]
  },
  {
    formula: 'or.ecc',
    title: tri('轨道偏心率', 'Eccentricity of the orbit', 'Exzentrizität der Bahn'),
    note: tri('仿真值由近点、远点距离求得 e = (r_max − r_min)/(r_max + r_min)', 'The simulated value comes from the nearest and farthest distances: e = (r_max − r_min)/(r_max + r_min)', 'Der Simulationswert folgt aus dem kleinsten und größten Abstand: e = (r_max − r_min)/(r_max + r_min)'),
    steps: [
      st('E = -\\dfrac{GMm}{2a}',
        tri('轨道机械能（前面的结论）。',
          'The orbital energy (earlier result).',
          'Die Bahnenergie (früheres Ergebnis).'),
        B.earlier, ['E', '-G*M*m/(2*a)'], { E: 'J' }),
      st('r_{\\min} = a(1 - e)',
        tri('椭圆的几何性质：近点到焦点（中心天体）的距离 a(1 − e)，远点 a(1 + e)。',
          'Geometry of the ellipse: the nearest point is a(1 − e) from the focus (the central body), the farthest a(1 + e).',
          'Geometrie der Ellipse: Der nächste Punkt liegt a(1 − e) vom Brennpunkt (dem Zentralkörper) entfernt, der fernste a(1 + e).'),
        tri('椭圆的几何性质', 'Geometry of the ellipse', 'Geometrie der Ellipse'), ['rmin', 'a*(1 - ecc)'], { rmin: 'm', ecc: '' }),
      st('L = mr_{\\min}v_{\\max}',
        tri('在近点速度垂直于连线。',
          'At the nearest point the velocity is perpendicular to the line from the centre.',
          'Im nächsten Punkt steht die Geschwindigkeit senkrecht zur Verbindungslinie.'),
        tri('角动量的定义', 'Definition of angular momentum', 'Definition des Drehimpulses'), ['L', 'm*rmin*vmax'], { rmin: 'm', vmax: 'm/s' }),
      st('E = \\tfrac{1}{2}mv_{\\max}^2 - \\dfrac{GMm}{r_{\\min}}',
        tri('近点的机械能。',
          'The energy at the nearest point.',
          'Die Energie im nächsten Punkt.'),
        tri('机械能守恒', 'Conservation of energy', 'Energieerhaltung'), ['E', 'm*vmax^2/2 - G*M*m/rmin'], { E: 'J', vmax: 'm/s', rmin: 'm' }),
      st('e = \\sqrt{1 + \\dfrac{2EL^2}{G^2M^2m^3}}',
        tri('三式联立，消去 r_min 与 v_max，解出偏心率。',
          'Combine the three equations, eliminate r_min and v_max and solve for the eccentricity.',
          'Die drei Gleichungen kombinieren, r_min und v_max eliminieren und nach der Exzentrizität auflösen.'),
        B.combine, ['ecc', 'sqrt(1 + 2*E*L^2/(G^2*M^2*m^3))'], { ecc: '', E: 'J' }),
      st('e = \\sqrt{1 - \\dfrac{L^2}{GMm^2a}}',
        tri('代入 E = −GMm/(2a)。e = 0 是圆，0 < e < 1 是椭圆。',
          'Insert E = −GMm/(2a). e = 0 is a circle, 0 < e < 1 an ellipse.',
          'E = −G·M·m/(2a) einsetzen. e = 0 ist ein Kreis, 0 < e < 1 eine Ellipse.'),
        B.prev, ['ecc', 'sqrt(1 - L^2/(G*M*m^2*a))'], { ecc: '' })
    ]
  }
]
