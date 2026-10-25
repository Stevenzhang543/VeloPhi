/**
 * Derivations of the rolling-with-slipping formulas (situation "roll-slip": round body of mass m, radius r,
 * moment of inertia I, put on a rough horizontal surface with velocity v₀ and angular velocity ω₀; right
 * positive, ω anticlockwise positive). Manual 26.50, D28.
 */
import type { Derivation, SharedSteps } from './types'
import { B, step, tri } from './b-common'

/** Shared step list: slip velocity, kinetic friction, translation and rotation equations. */
export const SHARED_ROLL_SLIP: SharedSteps[] = [
  {
    id: 'roll-slip.forces',
    title: tri('打滑阶段的受力分析', 'Forces while slipping', 'Kräfte während des Rutschens'),
    steps: [
      step('u = v + \\omega r',
        tri('取水平向右为正，ω 以逆时针为正（向右纯滚动时 ω < 0）。接触点在圆心正下方 r 处，它相对地面的滑动速度 u 等于质心速度与转动引起的速度之和。',
          'Take right as positive and ω anticlockwise positive (rolling to the right has ω < 0). The contact point lies a distance r below the centre; its sliding velocity u relative to the ground is the velocity of the centre plus the velocity due to the rotation.',
          'Nach rechts positiv, ω gegen den Uhrzeigersinn positiv (Rollen nach rechts hat ω < 0). Der Berührpunkt liegt im Abstand r unter dem Mittelpunkt; seine Gleitgeschwindigkeit u relativ zum Boden ist die Schwerpunktgeschwindigkeit plus die Geschwindigkeit der Drehung.'),
        B.pointVelocity, 'u = v + omega*r', { u: 'm/s', v: 'm/s', omega: 'rad/s' }),
      step('f = -\\mu_k mg\\,\\operatorname{sgn}(u)',
        tri('竖直方向 N = mg。接触点相对地面滑动，摩擦力是滑动摩擦力，大小为 μ_k mg，方向与滑动速度 u 相反。',
          'Vertically N = mg. The contact point slides on the ground, so the friction is kinetic friction of magnitude μ_k mg, opposite to the sliding velocity u.',
          'Senkrecht gilt N = mg. Der Berührpunkt gleitet auf dem Boden; die Reibung ist Gleitreibung vom Betrag μ_k mg, der Gleitgeschwindigkeit u entgegengerichtet.'),
        B.kineticFriction, 'f = -muK*m*g*sign(u)', { f: 'N', u: 'm/s' }),
      step('ma = f',
        tri('水平方向只有摩擦力作用在物体上。', 'Horizontally only the friction force acts on the body.', 'Waagerecht wirkt nur die Reibungskraft auf den Körper.'),
        B.newton2Cm, 'm*a = f', { a: 'm/s²', f: 'N' }),
      step('I\\beta = fr',
        tri('对质心：重力和支持力通过圆心，力矩为零；摩擦力作用在圆心下方 r 处，力矩为 fr（逆时针为正）。',
          'About the centre of mass: weight and normal force pass through the centre and have no torque; friction acts a distance r below the centre, with torque fr (anticlockwise positive).',
          'Bezüglich des Schwerpunkts: Gewichtskraft und Normalkraft gehen durch den Mittelpunkt und haben kein Drehmoment; die Reibungskraft greift im Abstand r darunter an, ihr Drehmoment ist fr (gegen den Uhrzeigersinn positiv).'),
        B.rotationLawCm, 'I*beta = f*r', { beta: 'rad/s²', f: 'N' })
    ]
  }
]

const SIGN_CONSTANT = tri('打滑阶段 u 的方向不变', 'u keeps its direction while slipping', 'u behält beim Rutschen seine Richtung')
const COMBINED = tri('平动方程与转动方程联立', 'Translation and rotation equations combined', 'Translations- und Rotationsgleichung kombiniert')

/** The disc: I = ½mr². */
const discInertia = () => step('I = \\tfrac12 mr^2\\quad\\Rightarrow\\quad \\dfrac{mr^2}{I} = 2',
  tri('匀质圆柱（二维中的圆盘）对中心轴的转动惯量为 ½mr²。',
    'The moment of inertia of a uniform cylinder (a disc in 2D) about its axis is ½mr².',
    'Das Trägheitsmoment eines homogenen Zylinders (in 2D einer Scheibe) bezüglich seiner Achse ist ½mr².'),
  tri('匀质圆柱的转动惯量', 'Moment of inertia of a uniform cylinder', 'Trägheitsmoment eines homogenen Zylinders'),
  'I = m*r^2/2')

/** Derivations of the seven rs.* formulas. */
export const DERIVATIONS_ROLL_SLIP: Derivation[] = [
  {
    formula: 'rs.a',
    title: tri('打滑阶段质心加速度', 'Acceleration of the centre of mass while slipping', 'Schwerpunktbeschleunigung während des Rutschens'),
    note: tri('v₀ + ω₀r 为接触点相对地面的滑动速度（ω 逆时针为正）',
      'v₀ + ω₀r is the sliding velocity of the contact point relative to the ground (ω anticlockwise positive)',
      'v₀ + ω₀r ist die Gleitgeschwindigkeit des Berührpunkts relativ zum Boden (ω gegen den Uhrzeigersinn positiv)'),
    uses: ['roll-slip.forces'],
    steps: [
      step('a = \\dfrac{f}{m} = -\\mu_k g\\,\\operatorname{sgn}(u)',
        tri('由平动方程。', 'From the translation equation.', 'Aus der Translationsgleichung.'),
        B.previous, 'a = -muK*g*sign(u)', { a: 'm/s²', u: 'm/s' }),
      step('a = -\\mu_k g\\,\\operatorname{sgn}(v_0 + \\omega_0 r)',
        tri('打滑阶段 u 的大小均匀减小到零而方向不变（见“打滑持续时间”），所以 sgn(u) = sgn(u₀)，u₀ = v₀ + ω₀r。加速度恒定，质心做匀变速直线运动。',
          'While slipping, |u| decreases uniformly to zero and u keeps its direction (see “Duration of slipping”), so sgn(u) = sgn(u₀) with u₀ = v₀ + ω₀r. The acceleration is constant: the centre moves with uniform acceleration.',
          'Während des Rutschens nimmt |u| gleichmäßig bis null ab, und u behält seine Richtung (siehe „Dauer des Rutschens“); also sgn(u) = sgn(u₀) mit u₀ = v₀ + ω₀r. Die Beschleunigung ist konstant: Der Schwerpunkt bewegt sich gleichmäßig beschleunigt.'),
        SIGN_CONSTANT, 'a = -muK*g*sign(v0 + omega0*r)', { a: 'm/s²' })
    ]
  },
  {
    formula: 'rs.beta',
    title: tri('打滑阶段角加速度', 'Angular acceleration while slipping', 'Winkelbeschleunigung während des Rutschens'),
    uses: ['roll-slip.forces'],
    steps: [
      step('\\beta = \\dfrac{fr}{I} = -\\dfrac{\\mu_k mgr}{I}\\operatorname{sgn}(u)',
        tri('由转动方程。', 'From the rotation equation.', 'Aus der Rotationsgleichung.'),
        B.previous, 'beta = -muK*m*g*r/I*sign(u)', { beta: 'rad/s²', u: 'm/s' }),
      step('\\beta = -\\dfrac{\\mu_k mgr}{I}\\operatorname{sgn}(v_0 + \\omega_0 r)',
        tri('打滑阶段 sgn(u) = sgn(u₀)。摩擦力矩使转动向纯滚动所需的方向变化。',
          'While slipping sgn(u) = sgn(u₀). The friction torque changes the rotation towards that of rolling without slipping.',
          'Während des Rutschens ist sgn(u) = sgn(u₀). Das Reibungsdrehmoment ändert die Drehung in Richtung des reinen Rollens.'),
        SIGN_CONSTANT, 'beta = -muK*m*g*r/I*sign(v0 + omega0*r)', { beta: 'rad/s²' })
    ]
  },
  {
    formula: 'rs.t',
    title: tri('打滑持续时间', 'Duration of slipping', 'Dauer des Rutschens'),
    uses: ['roll-slip.forces'],
    steps: [
      step('\\dfrac{\\mathrm{d}u}{\\mathrm{d}t} = a + \\beta r',
        tri('对 u = v + ωr 求导。', 'Differentiate u = v + ωr.', 'u = v + ωr nach der Zeit ableiten.'),
        B.derivative, 'dudt = a + beta*r', { dudt: 'm/s²', a: 'm/s²', beta: 'rad/s²' }),
      step('\\dfrac{\\mathrm{d}u}{\\mathrm{d}t} = -\\mu_k g\\left(1 + \\dfrac{mr^2}{I}\\right)\\operatorname{sgn}(u)',
        tri('代入 a 与 β：平动和转动都使 |u| 减小，而且减小的快慢恒定。',
          'Insert a and β: translation and rotation both reduce |u|, at a constant rate.',
          'a und β einsetzen: Translation und Rotation verringern beide |u|, und zwar mit konstanter Rate.'),
        B.previous, 'dudt = -muK*g*(1 + m*r^2/I)*sign(u)', { dudt: 'm/s²', u: 'm/s' }),
      step('|u| = |u_0| - \\mu_k g\\left(1 + \\dfrac{mr^2}{I}\\right)t',
        tri('|u| 随时间均匀减小，方向不变，直到 u = 0。此后接触点不再滑动；在水平面上静摩擦力为零，物体做纯滚动。',
          '|u| decreases uniformly with time, without changing direction, until u = 0. From then on the contact point does not slide; on a horizontal surface the static friction is zero and the body rolls without slipping.',
          '|u| nimmt gleichmäßig mit der Zeit ab, ohne die Richtung zu ändern, bis u = 0. Danach gleitet der Berührpunkt nicht mehr; auf waagerechtem Boden ist die Haftreibung null, und der Körper rollt ohne zu gleiten.'),
        tri('匀变速运动的规律（u 的变化率恒定）', 'Uniformly changing motion (constant rate of change of u)', 'Gleichmäßig veränderte Bewegung (konstante Änderungsrate von u)'),
        'abs(u) = abs(u0) - muK*g*(1 + m*r^2/I)*t', { u: 'm/s', u0: 'm/s', t: 's' }),
      step('t_1 = \\dfrac{|v_0 + \\omega_0 r|}{\\mu_k g\\,(1 + mr^2/I)}',
        tri('令 u = 0，并代入 u₀ = v₀ + ω₀r。', 'Set u = 0 and insert u₀ = v₀ + ω₀r.', 'u = 0 setzen und u₀ = v₀ + ω₀r einsetzen.'),
        B.rearrange, 't1 = abs(v0 + omega0*r)/(muK*g*(1 + m*r^2/I))', { t1: 's' })
    ]
  },
  {
    formula: 'rs.v',
    title: tri('开始纯滚动时的速度', 'Velocity when rolling without slipping begins', 'Geschwindigkeit bei Beginn des reinen Rollens'),
    uses: ['roll-slip.forces'],
    steps: [
      step('v_1 = v_0 + at_1',
        tri('打滑阶段质心做匀变速直线运动。', 'While slipping the centre moves with uniform acceleration.', 'Während des Rutschens bewegt sich der Schwerpunkt gleichmäßig beschleunigt.'),
        tri('匀变速直线运动的速度公式 v = v₀ + at', 'Velocity–time relation of uniformly accelerated motion, v = v₀ + at', 'Geschwindigkeit-Zeit-Gesetz der gleichmäßig beschleunigten Bewegung, v = v₀ + a·t'),
        'v1 = v0 + a*t1', { v1: 'm/s', a: 'm/s²', t1: 's' }),
      step('v_1 = v_0 - \\mu_k g\\,\\operatorname{sgn}(u_0)\\cdot\\dfrac{|u_0|}{\\mu_k g\\,(1 + mr^2/I)}',
        tri('代入 a = −μ_k g sgn(u₀) 与打滑持续时间 t₁ = |u₀|/(μ_k g(1 + mr²/I))，其中 u₀ = v₀ + ω₀r。',
          'Insert a = −μ_k g sgn(u₀) and the duration of slipping t₁ = |u₀|/(μ_k g(1 + mr²/I)), where u₀ = v₀ + ω₀r.',
          'a = −μ_k g sgn(u₀) und die Rutschdauer t₁ = |u₀|/(μ_k g(1 + mr²/I)) einsetzen, mit u₀ = v₀ + ω₀r.'),
        COMBINED, 'v1 = v0 - muK*g*sign(u0)*abs(u0)/(muK*g*(1 + m*r^2/I))', { v1: 'm/s', u0: 'm/s' }),
      step('v_1 = v_0 - \\dfrac{v_0 + \\omega_0 r}{1 + mr^2/I}',
        tri('用 sgn(u₀)·|u₀| = u₀ 化简。', 'Simplify with sgn(u₀)·|u₀| = u₀.', 'Mit sgn(u₀)·|u₀| = u₀ vereinfachen.'),
        B.algebra, 'v1 = v0 - (v0 + omega0*r)/(1 + m*r^2/I)', { v1: 'm/s' })
    ]
  },
  {
    formula: 'rs.cyl.t',
    title: tri('匀质圆柱（ω₀ = 0）的打滑时间', 'Slipping time of a uniform cylinder (ω₀ = 0)', 'Rutschdauer eines homogenen Zylinders (ω₀ = 0)'),
    note: tri('二维中的圆形物体是匀质圆柱（圆盘，I = ½mr²）；实心球的 t = 2v₀/(7μg) 是三维结果，这里不适用',
      'A round body in 2D is a uniform cylinder (a disc, I = ½mr²); the solid sphere’s t = 2v₀/(7μg) is a 3D result and does not apply here',
      'Ein runder Körper ist in 2D ein homogener Zylinder (Scheibe, I = ½mr²); das Ergebnis t = 2v₀/(7μg) der Vollkugel ist dreidimensional und gilt hier nicht'),
    uses: ['roll-slip.forces'],
    steps: [
      step('t_1 = \\dfrac{|v_0 + \\omega_0 r|}{\\mu_k g\\,(1 + mr^2/I)}',
        tri('打滑持续时间的一般结果（见“打滑持续时间”）。',
          'The general duration of slipping (see “Duration of slipping”).',
          'Die allgemeine Rutschdauer (siehe „Dauer des Rutschens“).'),
        COMBINED, 't1 = abs(v0 + omega0*r)/(muK*g*(1 + m*r^2/I))', { t1: 's' }),
      discInertia(),
      step('t_1 = \\dfrac{v_0}{\\mu_k g\\,(1 + 2)}',
        tri('放上时不转动（ω₀ = 0）且 v₀ > 0，所以 u₀ = v₀。',
          'The body is put down without rotation (ω₀ = 0) and v₀ > 0, so u₀ = v₀.',
          'Der Körper wird ohne Drehung aufgesetzt (ω₀ = 0) und v₀ > 0, also u₀ = v₀.'),
        B.previous, 't1 = v0/(muK*g*(1 + 2))', { t1: 's' }),
      step('t_1 = \\dfrac{v_0}{3\\mu_k g}',
        tri('整理。（实心球 I = ⅖mr²，得 2v₀/(7μ_k g)，那是三维的结果。）',
          'Rearranged. (A solid sphere, I = ⅖mr², would give 2v₀/(7μ_k g) — a 3D result.)',
          'Umgeformt. (Eine Vollkugel, I = ⅖mr², ergäbe 2v₀/(7μ_k g) – ein dreidimensionales Ergebnis.)'),
        B.rearrange, 't1 = v0/(3*muK*g)', { t1: 's' })
    ]
  },
  {
    formula: 'rs.cyl.v',
    title: tri('匀质圆柱（ω₀ = 0）的纯滚动速度', 'Rolling velocity of a uniform cylinder (ω₀ = 0)', 'Rollgeschwindigkeit eines homogenen Zylinders (ω₀ = 0)'),
    note: tri('实心球的 5v₀/7 是三维结果', 'The solid sphere’s 5v₀/7 is a 3D result', 'Das Ergebnis 5v₀/7 der Vollkugel ist dreidimensional'),
    uses: ['roll-slip.forces'],
    steps: [
      step('v_1 = v_0 - \\dfrac{v_0 + \\omega_0 r}{1 + mr^2/I}',
        tri('开始纯滚动时速度的一般结果（见“开始纯滚动时的速度”）。',
          'The general velocity when rolling begins (see “Velocity when rolling without slipping begins”).',
          'Die allgemeine Geschwindigkeit bei Beginn des reinen Rollens (siehe „Geschwindigkeit bei Beginn des reinen Rollens“).'),
        COMBINED, 'v1 = v0 - (v0 + omega0*r)/(1 + m*r^2/I)', { v1: 'm/s' }),
      discInertia(),
      step('v_1 = v_0 - \\dfrac{v_0}{1 + 2}',
        tri('代入 ω₀ = 0 与 mr²/I = 2。', 'Insert ω₀ = 0 and mr²/I = 2.', 'ω₀ = 0 und mr²/I = 2 einsetzen.'),
        B.previous, 'v1 = v0 - v0/(1 + 2)', { v1: 'm/s' }),
      step('v_1 = \\tfrac{2}{3}v_0',
        tri('整理：速度减小到原来的 2/3。也可以用对地面上任一点的角动量守恒得到：摩擦力通过该点，重力与支持力的力矩相互抵消，mv₀r = mv₁r + ½mr²·(v₁/r)。',
          'Rearranged: the velocity drops to 2/3 of its initial value. The same follows from conservation of angular momentum about any point of the ground: friction passes through that point, the torques of weight and normal force cancel, mv₀r = mv₁r + ½mr²·(v₁/r).',
          'Umgeformt: Die Geschwindigkeit sinkt auf 2/3 des Anfangswerts. Dasselbe folgt aus der Drehimpulserhaltung bezüglich eines beliebigen Punkts des Bodens: Die Reibungskraft geht durch diesen Punkt, die Drehmomente von Gewichts- und Normalkraft heben sich auf, mv₀r = mv₁r + ½mr²·(v₁/r).'),
        B.rearrange, 'v1 = 2*v0/3', { v1: 'm/s' })
    ]
  },
  {
    formula: 'rs.Q',
    title: tri('打滑阶段摩擦生热', 'Heat produced by friction while slipping', 'Reibungswärme während des Rutschens'),
    uses: ['roll-slip.forces'],
    steps: [
      step('\\dfrac{\\mathrm{d}E_k}{\\mathrm{d}t} = fv + (fr)\\,\\omega = fu = -\\mu_k mg\\,|u|',
        tri('摩擦力对平动做功的功率为 fv，摩擦力矩对转动做功的功率为 frω，合起来为 fu：动能减少的快慢等于滑动摩擦力乘以相对滑动的速率，正是摩擦生热的快慢。重力和支持力不做功。',
          'The power of friction on the translation is fv, that of its torque on the rotation frω; together fu. So the kinetic energy decreases at the rate kinetic friction × sliding speed, which is exactly the rate at which heat is produced. Weight and normal force do no work.',
          'Die Leistung der Reibungskraft an der Translation ist fv, die ihres Drehmoments an der Rotation frω; zusammen fu. Die kinetische Energie nimmt also mit der Rate Gleitreibungskraft × Gleitgeschwindigkeit ab – genau der Rate, mit der Wärme entsteht. Gewichtskraft und Normalkraft verrichten keine Arbeit.'),
        tri('功率 P = Fv 与 P = Mω', 'Power P = Fv and P = Mω', 'Leistung P = Fv und P = Mω'),
        'dEk = f*v + f*r*omega', { dEk: 'W', f: 'N', v: 'm/s', omega: 'rad/s' }),
      step('Q = E_{k0} - E_{k1}',
        tri('对整个打滑阶段求和：摩擦生热等于物体动能的减少量。',
          'Summed over the slipping phase: the heat produced equals the loss of kinetic energy of the body.',
          'Über die Rutschphase summiert: Die Reibungswärme ist gleich der Abnahme der kinetischen Energie des Körpers.'),
        tri('能量守恒定律', 'Conservation of energy', 'Energieerhaltungssatz'),
        'Q = Ek0 - Ek1', { Q: 'J', Ek0: 'J', Ek1: 'J' }),
      step('E_{k0} = \\tfrac12 mv_0^2 + \\tfrac12 I\\omega_0^2',
        tri('开始时的动能 = 平动动能 + 转动动能。',
          'Initial kinetic energy = translational + rotational kinetic energy.',
          'Anfängliche kinetische Energie = Translationsenergie + Rotationsenergie.'),
        tri('刚体的动能（平动 + 转动）', 'Kinetic energy of a rigid body (translation + rotation)', 'Kinetische Energie eines starren Körpers (Translation + Rotation)'),
        'Ek0 = m*v0^2/2 + I*omega0^2/2', { Ek0: 'J' }),
      step('E_{k1} = \\tfrac12 mv_1^2 + \\tfrac12 I\\left(\\dfrac{v_1}{r}\\right)^2 = \\tfrac12\\left(m + \\dfrac{I}{r^2}\\right)v_1^2',
        tri('开始纯滚动时 u = 0，角速度的大小为 |v₁|/r。',
          'When rolling begins u = 0, so the angular velocity has magnitude |v₁|/r.',
          'Bei Beginn des reinen Rollens ist u = 0, die Winkelgeschwindigkeit hat also den Betrag |v₁|/r.'),
        B.rolling, 'Ek1 = (m + I/r^2)*v1^2/2', { Ek1: 'J', v1: 'm/s' }),
      step('Q = \\tfrac12 mv_0^2 + \\tfrac12 I\\omega_0^2 - \\tfrac12\\left(m + \\dfrac{I}{r^2}\\right)v_1^2',
        tri('代入，v₁ 取“开始纯滚动时的速度”。（结果也等于 μ_k mg 乘以相对滑动的路程 |u₀|t₁/2。）',
          'Insert; v₁ is the “Velocity when rolling without slipping begins”. (The result also equals μ_k mg times the sliding distance |u₀|t₁/2.)',
          'Einsetzen; v₁ ist die „Geschwindigkeit bei Beginn des reinen Rollens“. (Das Ergebnis ist auch μ_k mg mal der Gleitstrecke |u₀|t₁/2.)'),
        B.previous, 'Q = m*v0^2/2 + I*omega0^2/2 - (m + I/r^2)*v1^2/2', { Q: 'J', v1: 'm/s' })
    ]
  }
]
