/**
 * Derivations of the pendulum formulas (situation "pendulum": bob of mass m on a string of length L, amplitude
 * θ₀ from the vertical). Manual 26.50, D28.
 */
import type { Derivation, SharedSteps } from './types'
import { B, step, tri } from './b-common'

/** Shared step lists of the pendulum: forces on the bob, conservation of mechanical energy. */
export const SHARED_PENDULUM: SharedSteps[] = [
  {
    id: 'pendulum.forces',
    title: tri('摆球的受力分析', 'Forces on the bob', 'Kräfte auf den Pendelkörper'),
    steps: [
      step('s = L\\theta',
        tri('摆球受重力 mg 和摆线的拉力 F_T（沿摆线指向悬点）。摆球沿半径为 L 的圆弧运动，最低点为平衡位置；θ 为摆线偏离竖直方向的角度（弧度制），s 为摆球离开平衡位置的弧长。',
          'The bob is acted on by its weight mg and the tension F_T of the string, directed along the string towards the pivot. The bob moves on a circular arc of radius L whose lowest point is the equilibrium position; θ is the angle of the string from the vertical (in radians) and s the arc length from the equilibrium position.',
          'Auf den Pendelkörper wirken die Gewichtskraft mg und die Fadenkraft F_T längs des Fadens zum Aufhängepunkt. Der Körper bewegt sich auf einem Kreisbogen mit Radius L, dessen tiefster Punkt die Gleichgewichtslage ist; θ ist der Auslenkwinkel des Fadens gegen die Senkrechte (im Bogenmaß), s die Bogenlänge ab der Gleichgewichtslage.'),
        tri('弧长与圆心角的关系', 'Arc length and central angle', 'Bogenlänge und Mittelpunktswinkel'),
        's = L*theta', { s: 'm', theta: 'rad' }),
      step('ma_t = -mg\\sin\\theta',
        tri('沿切线方向：拉力与速度垂直，没有切向分量；重力的切向分力大小为 mg sinθ，总指向平衡位置，它就是单摆的回复力。',
          'Along the tangent: the tension is perpendicular to the velocity and has no tangential component; the tangential component of the weight, of magnitude mg sin θ, always points towards the equilibrium position — it is the restoring force of the pendulum.',
          'In tangentialer Richtung: Die Fadenkraft steht senkrecht zur Geschwindigkeit und hat keine Tangentialkomponente; die Tangentialkomponente der Gewichtskraft vom Betrag mg sin θ zeigt stets zur Gleichgewichtslage – sie ist die Rückstellkraft des Pendels.'),
        B.newton2Tangential, 'm*a_t = -m*g*sin(theta)', { a_t: 'm/s²', theta: 'rad' }),
      step('\\ddot\\theta = -\\dfrac{g}{L}\\sin\\theta',
        tri('切向加速度 a_t = d²s/dt² = Lθ̈，代入上式并除以 mL。',
          'The tangential acceleration is a_t = d²s/dt² = Lθ̈; substitute it and divide by mL.',
          'Die Tangentialbeschleunigung ist a_t = d²s/dt² = Lθ̈; einsetzen und durch mL teilen.'),
        B.previous, 'ddtheta = -g/L*sin(theta)', { ddtheta: 'rad/s²', theta: 'rad' }),
      step('F_T - mg\\cos\\theta = \\dfrac{mv^2}{L}',
        tri('沿摆线方向（法向，指向悬点为正）：拉力与重力的法向分力 mg cosθ 的合力提供向心力，v 为摆球的速率。',
          'Along the string (radial direction, towards the pivot positive): the tension minus the radial component mg cos θ of the weight provides the centripetal force; v is the speed of the bob.',
          'Längs des Fadens (radial, zum Aufhängepunkt positiv): Fadenkraft minus Radialkomponente mg cos θ der Gewichtskraft ergibt die Zentripetalkraft; v ist die Geschwindigkeit des Körpers.'),
        B.newton2Radial, 'F_T - m*g*cos(theta) = m*v^2/L', { F_T: 'N', v: 'm/s', theta: 'rad' })
    ]
  },
  {
    id: 'pendulum.energy',
    title: tri('机械能守恒', 'Conservation of mechanical energy', 'Energieerhaltung'),
    steps: [
      step('h = L(1 - \\cos\\theta)',
        tri('拉力始终与速度垂直，不做功；只有重力做功，摆球的机械能守恒。以最低点为重力势能的零点，偏角为 θ 时摆球的高度为 h。',
          'The tension is always perpendicular to the velocity and does no work; only gravity does work, so the mechanical energy of the bob is conserved. Taking the lowest point as the zero of gravitational potential energy, the bob is at height h when the angle is θ.',
          'Die Fadenkraft steht stets senkrecht zur Geschwindigkeit und verrichtet keine Arbeit; nur die Gewichtskraft verrichtet Arbeit, die mechanische Energie des Pendelkörpers bleibt erhalten. Mit dem tiefsten Punkt als Nullniveau der Lageenergie liegt der Körper beim Winkel θ in der Höhe h.'),
        B.geometry, 'h = L*(1 - cos(theta))', { h: 'm', theta: 'rad' }),
      step('\\tfrac12 mv^2 + mgL(1 - \\cos\\theta) = mgL(1 - \\cos\\theta_0)',
        tri('在最大摆角 θ₀ 处速度为零。最大摆角处与偏角为 θ 处的机械能相等。',
          'At the maximum angle θ₀ the speed is zero. The mechanical energy there equals that at angle θ.',
          'Beim maximalen Auslenkwinkel θ₀ ist die Geschwindigkeit null. Die mechanische Energie dort ist gleich der beim Winkel θ.'),
        B.energy, 'm*v^2/2 + m*g*L*(1 - cos(theta)) = m*g*L*(1 - cos(theta0))', { v: 'm/s', theta: 'rad' }),
      step('\\tfrac12 mv^2 = mgL(\\cos\\theta - \\cos\\theta_0)',
        tri('整理得偏角为 θ 时摆球的动能。',
          'Rearranged: the kinetic energy of the bob at angle θ.',
          'Umgeformt: die kinetische Energie des Pendelkörpers beim Winkel θ.'),
        B.rearrange, 'm*v^2/2 = m*g*L*(cos(theta) - cos(theta0))', { v: 'm/s', theta: 'rad' })
    ]
  }
]

/** Derivations of pe.T.small, pe.T.exact, pe.v and pe.F. */
export const DERIVATIONS_PENDULUM: Derivation[] = [
  {
    formula: 'pe.T.small',
    title: tri('单摆周期（小角度近似）', 'Period of a simple pendulum (small-angle approximation)', 'Schwingungsdauer des Fadenpendels (Kleinwinkelnäherung)'),
    note: tri('仅当 sinθ ≈ θ 时成立', 'Valid only when sin θ ≈ θ', 'Gilt nur, wenn sin θ ≈ θ'),
    causes: [tri('摆角较大时 sinθ ≈ θ 不再成立，周期随振幅增大',
      'At larger angles sin θ ≈ θ no longer holds; the period grows with the amplitude',
      'Bei größeren Winkeln gilt sin θ ≈ θ nicht mehr; die Schwingungsdauer wächst mit der Amplitude')],
    uses: ['pendulum.forces'],
    steps: [
      step('\\sin\\theta \\approx \\theta\\quad\\Rightarrow\\quad \\ddot\\theta \\approx -\\dfrac{g}{L}\\,\\theta',
        tri('小角度近似：θ 很小时（弧度制）sinθ ≈ θ。忽略的是 θ³/6 及更高次的项，相对误差约为 θ²/6。于是回复力与位移成正比、方向相反。',
          'Small-angle approximation: for small θ (in radians) sin θ ≈ θ. The neglected terms start with θ³/6, a relative error of about θ²/6. The restoring force is then proportional and opposite to the displacement.',
          'Kleinwinkelnäherung: Für kleine θ (im Bogenmaß) gilt sin θ ≈ θ. Vernachlässigt werden θ³/6 und höhere Glieder, der relative Fehler beträgt etwa θ²/6. Die Rückstellkraft ist dann proportional zur Auslenkung und ihr entgegengerichtet.'),
        tri('小角度近似 sinθ ≈ θ', 'Small-angle approximation sin θ ≈ θ', 'Kleinwinkelnäherung sin θ ≈ θ'),
        'ddtheta = -g/L*theta', { ddtheta: 'rad/s²', theta: 'rad' }),
      step('\\omega = \\sqrt{\\dfrac{g}{L}}',
        tri('与简谐运动的动力学方程 θ̈ = −ω²θ 比较：单摆近似做简谐运动，θ = θ₀cos(ωt + φ)，角频率为 ω。',
          'Compare with the equation of simple harmonic motion θ̈ = −ω²θ: the pendulum approximately performs simple harmonic motion, θ = θ₀ cos(ωt + φ), with angular frequency ω.',
          'Vergleich mit der Gleichung der harmonischen Schwingung θ̈ = −ω²θ: Das Pendel schwingt näherungsweise harmonisch, θ = θ₀ cos(ωt + φ), mit der Kreisfrequenz ω.'),
        B.shm, 'omega = sqrt(g/L)', { omega: 'rad/s' }),
      step('T \\approx 2\\pi\\sqrt{\\dfrac{L}{g}}',
        tri('周期 T = 2π/ω。在这一近似下周期与振幅、摆球质量都无关（单摆的等时性）。实际周期略大：T ≈ 2π√(L/g)·(1 + θ₀²/16)，θ₀ = 5° 时约大 0.05%。',
          'The period is T = 2π/ω. In this approximation it depends neither on the amplitude nor on the mass of the bob (isochronism). The true period is slightly longer: T ≈ 2π√(L/g)·(1 + θ₀²/16), about 0.05 % longer at θ₀ = 5°.',
          'Die Schwingungsdauer ist T = 2π/ω. In dieser Näherung hängt sie weder von der Amplitude noch von der Masse ab (Isochronie). Die tatsächliche Schwingungsdauer ist etwas größer: T ≈ 2π√(L/g)·(1 + θ₀²/16), bei θ₀ = 5° etwa 0.05 % mehr.'),
        tri('周期与角频率的关系 T = 2π/ω', 'Period and angular frequency, T = 2π/ω', 'Schwingungsdauer und Kreisfrequenz, T = 2π/ω'),
        'T = 2*pi*sqrt(L/g)', { T: 's' })
    ]
  },
  {
    formula: 'pe.T.exact',
    title: tri('单摆周期（任意摆角，精确）', 'Period of a simple pendulum (any amplitude, exact)', 'Schwingungsdauer des Fadenpendels (beliebige Amplitude, exakt)'),
    note: tri('K 为第一类完全椭圆积分', 'K is the complete elliptic integral of the first kind', 'K ist das vollständige elliptische Integral erster Art'),
    uses: ['pendulum.energy'],
    steps: [
      step('\\dot\\theta^2 = \\dfrac{2g}{L}(\\cos\\theta - \\cos\\theta_0)',
        tri('摆球的速率 v = Lθ̇，代入机械能守恒式，得到角速度与偏角的关系。',
          'With the speed v = Lθ̇, energy conservation gives the angular velocity as a function of the angle.',
          'Mit v = Lθ̇ liefert der Energieerhaltungssatz die Winkelgeschwindigkeit in Abhängigkeit vom Winkel.'),
        B.previous, 'dtheta^2 = 2*g/L*(cos(theta) - cos(theta0))', { dtheta: 'rad/s', theta: 'rad' }),
      step('\\dot\\theta^2 = \\dfrac{4g}{L}\\left(k^2 - \\sin^2\\dfrac{\\theta}{2}\\right),\\quad k = \\sin\\dfrac{\\theta_0}{2}',
        tri('用 cosθ = 1 − 2sin²(θ/2) 改写，并记 k = sin(θ₀/2)。',
          'Rewrite with cos θ = 1 − 2 sin²(θ/2) and set k = sin(θ₀/2).',
          'Umschreiben mit cos θ = 1 − 2 sin²(θ/2) und k = sin(θ₀/2) setzen.'),
        tri('三角恒等式（半角公式）', 'Trigonometric identity (half-angle formula)', 'Trigonometrische Identität (Halbwinkelformel)'),
        'dtheta^2 = 4*g/L*(sin(theta0/2)^2 - sin(theta/2)^2)', { dtheta: 'rad/s', theta: 'rad' }),
      step('\\dfrac{T}{4} = \\int_0^{\\theta_0}\\dfrac{\\mathrm{d}\\theta}{\\dot\\theta} = \\dfrac12\\sqrt{\\dfrac{L}{g}}\\int_0^{\\theta_0}\\dfrac{\\mathrm{d}\\theta}{\\sqrt{k^2 - \\sin^2(\\theta/2)}}',
        tri('由运动的对称性，摆球从最低点摆到最大摆角处用时 T/4。由 dt = dθ/θ̇ 对 θ 积分。',
          'By the symmetry of the motion the bob takes T/4 to swing from the lowest point to the maximum angle. Integrate dt = dθ/θ̇ over θ.',
          'Aus Symmetriegründen braucht der Körper vom tiefsten Punkt bis zum Umkehrpunkt T/4. Integration von dt = dθ/θ̇ über θ.'),
        tri('运动的对称性；dt = dθ/θ̇', 'Symmetry of the motion; dt = dθ/θ̇', 'Symmetrie der Bewegung; dt = dθ/θ̇'),
        'T/4 = sqrt(L/g)*Phi/2', { T: 's', Phi: '' }),
      step('\\sin\\dfrac{\\theta}{2} = k\\sin\\psi:\\quad \\dfrac{\\mathrm{d}\\theta}{\\sqrt{k^2 - \\sin^2(\\theta/2)}} = \\dfrac{2\\,\\mathrm{d}\\psi}{\\sqrt{1 - k^2\\sin^2\\psi}}',
        tri('换元 sin(θ/2) = k sinψ：θ 从 0 增大到 θ₀ 时，ψ 从 0 增大到 π/2；cos(θ/2)·dθ/2 = k cosψ dψ，且 √(k² − sin²(θ/2)) = k cosψ，cos(θ/2) = √(1 − k²sin²ψ)。',
          'Substitute sin(θ/2) = k sin ψ: as θ goes from 0 to θ₀, ψ goes from 0 to π/2; cos(θ/2)·dθ/2 = k cos ψ dψ, √(k² − sin²(θ/2)) = k cos ψ and cos(θ/2) = √(1 − k² sin²ψ).',
          'Substitution sin(θ/2) = k sin ψ: Läuft θ von 0 bis θ₀, so läuft ψ von 0 bis π/2; cos(θ/2)·dθ/2 = k cos ψ dψ, √(k² − sin²(θ/2)) = k cos ψ und cos(θ/2) = √(1 − k² sin²ψ).'),
        B.substitution,
        'dth/sqrt(sin(theta0/2)^2 - sin(theta/2)^2) = 2*dpsi/sqrt(1 - sin(theta0/2)^2*sin(psi)^2)', { dth: 'rad', theta: 'rad', dpsi: 'rad', psi: 'rad' }),
      step('\\dfrac{T}{4} = \\sqrt{\\dfrac{L}{g}}\\int_0^{\\pi/2}\\dfrac{\\mathrm{d}\\psi}{\\sqrt{1 - k^2\\sin^2\\psi}} = \\sqrt{\\dfrac{L}{g}}\\;K(k)',
        tri('代入后得到的积分正是第一类完全椭圆积分 K(k)。',
          'After the substitution the integral is exactly the complete elliptic integral of the first kind K(k).',
          'Nach der Substitution ist das Integral genau das vollständige elliptische Integral erster Art K(k).'),
        tri('第一类完全椭圆积分的定义', 'Definition of the complete elliptic integral of the first kind', 'Definition des vollständigen elliptischen Integrals erster Art'),
        'T/4 = sqrt(L/g)*ellipK(sin(theta0/2))', { T: 's' }),
      step('T = 4\\sqrt{\\dfrac{L}{g}}\\;K\\!\\left(\\sin\\dfrac{\\theta_0}{2}\\right)',
        tri('乘以 4 得周期。K 随 k 增大而增大，所以周期随振幅增大；θ₀ → 0 时 K → π/2，回到小角度近似的 2π√(L/g)。',
          'Multiply by 4 to obtain the period. K increases with k, so the period grows with the amplitude; for θ₀ → 0, K → π/2 and the small-angle result 2π√(L/g) is recovered.',
          'Multiplikation mit 4 ergibt die Schwingungsdauer. K wächst mit k, die Schwingungsdauer also mit der Amplitude; für θ₀ → 0 geht K → π/2, und man erhält wieder 2π√(L/g) der Kleinwinkelnäherung.'),
        B.previous, 'T = 4*sqrt(L/g)*ellipK(sin(theta0/2))', { T: 's' })
    ]
  },
  {
    formula: 'pe.v',
    title: tri('最低点速率', 'Speed at the lowest point', 'Geschwindigkeit im tiefsten Punkt'),
    uses: ['pendulum.energy'],
    steps: [
      step('\\tfrac12 mv^2 = mgL(1 - \\cos\\theta_0)',
        tri('在最低点 θ = 0：摆球从最大摆角处摆下，减少的重力势能全部转化为动能。',
          'At the lowest point θ = 0: swinging down from the maximum angle, the bob has turned all the lost gravitational potential energy into kinetic energy.',
          'Im tiefsten Punkt ist θ = 0: Beim Herabschwingen vom Umkehrpunkt ist die abgegebene Lageenergie vollständig in kinetische Energie umgewandelt.'),
        B.energy, 'm*v^2/2 = m*g*L*(1 - cos(theta0))', { v: 'm/s' }),
      step('v = \\sqrt{2gL(1 - \\cos\\theta_0)}',
        tri('解出速率，它与摆球的质量无关。',
          'Solve for the speed; it does not depend on the mass of the bob.',
          'Nach v auflösen; das Ergebnis hängt nicht von der Masse ab.'),
        B.rearrange, 'v = sqrt(2*g*L*(1 - cos(theta0)))', { v: 'm/s' })
    ]
  },
  {
    formula: 'pe.F',
    title: tri('最低点绳的拉力', 'String tension at the lowest point', 'Fadenkraft im tiefsten Punkt'),
    uses: ['pendulum.forces', 'pendulum.energy'],
    steps: [
      step('F_T - mg = \\dfrac{mv^2}{L}',
        tri('在最低点 θ = 0：拉力竖直向上，重力竖直向下，二者的合力提供向心力。',
          'At the lowest point θ = 0 the tension points vertically up and the weight down; their resultant provides the centripetal force.',
          'Im tiefsten Punkt (θ = 0) zeigt die Fadenkraft senkrecht nach oben, die Gewichtskraft nach unten; ihre Resultierende ist die Zentripetalkraft.'),
        B.newton2Radial, 'F_T - m*g = m*v^2/L', { F_T: 'N', v: 'm/s' }),
      step('mv^2 = 2mgL(1 - \\cos\\theta_0)',
        tri('由机械能守恒，摆球在最低点的 mv² = 2mgL(1 − cosθ₀)。',
          'Conservation of energy gives mv² = 2mgL(1 − cos θ₀) at the lowest point.',
          'Aus der Energieerhaltung folgt im tiefsten Punkt mv² = 2mgL(1 − cos θ₀).'),
        B.energy, 'm*v^2 = 2*m*g*L*(1 - cos(theta0))', { v: 'm/s' }),
      step('F_T = mg + 2mg(1 - \\cos\\theta_0)',
        tri('把 mv² 代入法向方程，并除以 L。', 'Insert mv² into the radial equation and divide by L.', 'mv² in die Radialgleichung einsetzen und durch L teilen.'),
        B.previous, 'F_T = m*g + 2*m*g*(1 - cos(theta0))', { F_T: 'N' }),
      step('F_T = mg(3 - 2\\cos\\theta_0)',
        tri('整理。结果与摆长无关；例如 θ₀ = 90° 时拉力为 3mg。',
          'Rearranged. The result does not depend on the length; for θ₀ = 90°, for example, the tension is 3mg.',
          'Umgeformt. Das Ergebnis hängt nicht von der Pendellänge ab; für θ₀ = 90° beträgt die Fadenkraft z. B. 3mg.'),
        B.rearrange, 'F_T = m*g*(3 - 2*cos(theta0))', { F_T: 'N' })
    ]
  }
]
