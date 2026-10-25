/**
 * Derivations of the rolling formulas (situation "rolling": round body of mass m, radius r and moment of
 * inertia I about its centre on an incline of angle θ; down the incline positive). Manual 26.50, D28.
 */
import type { Derivation, SharedSteps } from './types'
import { B, step, tri } from './b-common'

/** Shared step lists: translation and rotation equations, rolling condition. */
export const SHARED_ROLLING: SharedSteps[] = [
  {
    id: 'rolling.forces',
    title: tri('受力分析：平动与转动', 'Forces: translation and rotation', 'Kräfte: Translation und Rotation'),
    steps: [
      step('N = mg\\cos\\theta',
        tri('圆柱受重力 mg、斜面的支持力 N 和接触点处沿斜面向上的摩擦力 f。垂直斜面方向受力平衡。',
          'The cylinder is acted on by its weight mg, the normal force N of the incline and, at the contact point, the friction force f up the incline. Perpendicular to the incline the forces balance.',
          'Auf den Zylinder wirken die Gewichtskraft mg, die Normalkraft N der schiefen Ebene und im Berührpunkt die hangaufwärts gerichtete Reibungskraft f. Senkrecht zur Ebene herrscht Kräftegleichgewicht.'),
        tri('垂直斜面方向受力平衡', 'Equilibrium perpendicular to the incline', 'Kräftegleichgewicht senkrecht zur Ebene'),
        'N = m*g*cos(theta)', { N: 'N' }),
      step('ma = mg\\sin\\theta - f',
        tri('质心沿斜面向下（取为正方向）的运动：重力沿斜面的分力减去沿斜面向上的摩擦力。',
          'Motion of the centre of mass down the incline (the positive direction): the component of the weight along the incline minus the friction force, which points up the incline.',
          'Bewegung des Schwerpunkts hangabwärts (positive Richtung): Hangabtriebskraft minus Reibungskraft, die hangaufwärts zeigt.'),
        tri('牛顿第二定律（质心，沿斜面方向）', "Newton's second law (centre of mass, along the incline)", 'Zweites Newtonsches Gesetz (Schwerpunkt, längs der Ebene)'),
        'm*a = m*g*sin(theta) - f', { a: 'm/s²', f: 'N' }),
      step('I\\beta = fr',
        tri('绕质心的转动：重力和支持力都通过圆心，力矩为零；只有摩擦力的力矩 fr 使圆柱加速转动。',
          'Rotation about the centre of mass: weight and normal force pass through the centre and have no torque; only the torque fr of friction speeds up the rotation.',
          'Rotation um den Schwerpunkt: Gewichtskraft und Normalkraft gehen durch den Mittelpunkt und haben kein Drehmoment; nur das Drehmoment fr der Reibungskraft beschleunigt die Drehung.'),
        B.rotationLawCm, 'I*beta = f*r', { beta: 'rad/s²', f: 'N' })
    ]
  },
  {
    id: 'rolling.constraint',
    title: tri('纯滚动条件', 'Rolling condition', 'Rollbedingung'),
    steps: [
      step('v = \\omega r',
        tri('纯滚动时接触点相对斜面静止：质心速度等于转动引起的线速度。',
          'In rolling without slipping the contact point is at rest relative to the incline: the speed of the centre equals the linear speed due to the rotation.',
          'Beim Rollen ohne Gleiten ruht der Berührpunkt relativ zur Ebene: Die Schwerpunktgeschwindigkeit ist gleich der Bahngeschwindigkeit der Drehung.'),
        B.rolling, 'v = omega*r', { v: 'm/s', omega: 'rad/s' }),
      step('a = \\beta r',
        tri('对时间求导，得到质心加速度与角加速度的关系。',
          'Differentiating with respect to time relates the acceleration of the centre to the angular acceleration.',
          'Ableiten nach der Zeit verknüpft die Schwerpunktbeschleunigung mit der Winkelbeschleunigung.'),
        B.derivative, 'a = beta*r', { a: 'm/s²', beta: 'rad/s²' })
    ]
  }
]

/** Static friction expressed by the acceleration (rotation equation with β = a/r). */
const frictionFromRotation = () => step('f = \\dfrac{I\\beta}{r} = \\dfrac{I}{r^2}\\,a',
  tri('由转动方程并代入 β = a/r，得到摩擦力与加速度的关系。',
    'The rotation equation with β = a/r relates the friction force to the acceleration.',
    'Die Rotationsgleichung mit β = a/r verknüpft die Reibungskraft mit der Beschleunigung.'),
  B.previous, 'f = I/r^2*a', { f: 'N', a: 'm/s²' })

/** Kinetic friction when the contact point slides down the incline. */
const kineticFriction = () => step('f = \\mu_k N = \\mu_k mg\\cos\\theta',
  tri('接触点相对斜面向下滑动，摩擦力是滑动摩擦力，方向沿斜面向上。',
    'The contact point slides down relative to the incline, so the friction is kinetic friction, directed up the incline.',
    'Der Berührpunkt gleitet relativ zur Ebene hangabwärts; die Reibung ist daher Gleitreibung, hangaufwärts gerichtet.'),
  B.kineticFriction, 'f = muK*m*g*cos(theta)', { f: 'N' })

/** Derivations of rl.a, rl.f, rl.vw, rl.a.slip and rl.beta.slip. */
export const DERIVATIONS_ROLLING: Derivation[] = [
  {
    formula: 'rl.a',
    title: tri('纯滚动的加速度', 'Acceleration in rolling without slipping', 'Beschleunigung beim Rollen ohne Gleiten'),
    uses: ['rolling.forces', 'rolling.constraint'],
    steps: [
      frictionFromRotation(),
      step('ma = mg\\sin\\theta - \\dfrac{I}{r^2}\\,a',
        tri('代入平动方程。', 'Insert into the translation equation.', 'In die Translationsgleichung einsetzen.'),
        B.previous, 'm*a = m*g*sin(theta) - I/r^2*a', { a: 'm/s²' }),
      step('a = \\dfrac{g\\sin\\theta}{1 + I/(mr^2)}',
        tri('解出 a。它比光滑斜面上的 g sinθ 小，因为减少的重力势能有一部分转化为转动动能。匀质圆柱 I = ½mr²，a = ⅔g sinθ。',
          'Solve for a. It is smaller than g sin θ on a smooth incline because part of the potential energy becomes rotational kinetic energy. For a uniform cylinder I = ½mr² and a = ⅔ g sin θ.',
          'Nach a auflösen. Sie ist kleiner als g sin θ auf einer reibungsfreien Ebene, weil ein Teil der Lageenergie zu Rotationsenergie wird. Für einen homogenen Zylinder ist I = ½mr² und a = ⅔ g sin θ.'),
        B.rearrange, 'a = g*sin(theta)/(1 + I/(m*r^2))', { a: 'm/s²' })
    ]
  },
  {
    formula: 'rl.f',
    title: tri('纯滚动所需的静摩擦力', 'Static friction required for rolling without slipping', 'Für reines Rollen nötige Haftreibungskraft'),
    uses: ['rolling.forces', 'rolling.constraint'],
    steps: [
      frictionFromRotation(),
      step('a = \\dfrac{g\\sin\\theta}{1 + I/(mr^2)}',
        tri('纯滚动的加速度（见“纯滚动的加速度”）。',
          'The acceleration in rolling without slipping (see “Acceleration in rolling without slipping”).',
          'Die Beschleunigung beim reinen Rollen (siehe „Beschleunigung beim Rollen ohne Gleiten“).'),
        tri('平动方程与转动方程联立', 'Translation and rotation equations combined', 'Translations- und Rotationsgleichung kombiniert'),
        'a = g*sin(theta)/(1 + I/(m*r^2))', { a: 'm/s²' }),
      step('f = \\dfrac{I}{r^2}\\,a',
        tri('摩擦力沿斜面向上，接触点不滑动，是静摩擦力。代入 a 得 f = mg sinθ/(1 + mr²/I)。纯滚动要求 f ≤ μ_s N，即 μ_s ≥ tanθ/(1 + mr²/I)。',
          'The friction force points up the incline; the contact point does not slide, so it is static friction. With a inserted, f = mg sin θ/(1 + mr²/I). Rolling without slipping requires f ≤ μ_s N, i.e. μ_s ≥ tan θ/(1 + mr²/I).',
          'Die Reibungskraft zeigt hangaufwärts; der Berührpunkt gleitet nicht, es ist Haftreibung. Mit eingesetztem a ist f = mg sin θ/(1 + mr²/I). Reines Rollen erfordert f ≤ μ_s N, also μ_s ≥ tan θ/(1 + mr²/I).'),
        tri('上一步代入；静摩擦力 f ≤ μ_s N', 'Substitution of the previous result; static friction f ≤ μ_s N', 'Einsetzen des vorigen Ergebnisses; Haftreibung f ≤ μ_s N'),
        'f = I/r^2*g*sin(theta)/(1 + I/(m*r^2))', { f: 'N' })
    ]
  },
  {
    formula: 'rl.vw',
    title: tri('纯滚动条件', 'Rolling condition', 'Rollbedingung'),
    note: tri('ω 取仿真值，检验接触点相对速度为零',
      'ω is taken from the simulation; the formula checks that the contact point has zero relative velocity',
      'ω wird der Simulation entnommen; geprüft wird, dass der Berührpunkt keine Relativgeschwindigkeit hat'),
    steps: [
      step('v_P = v - \\omega r',
        tri('接触点 P 的速度等于质心速度与绕质心转动的线速度之和：在最低点，转动引起的速度大小为 ωr，方向与质心速度相反。',
          'The velocity of the contact point P is the velocity of the centre plus the velocity due to rotation about the centre: at the lowest point the rotation contributes ωr, opposite to the motion of the centre.',
          'Die Geschwindigkeit des Berührpunkts P ist die Schwerpunktgeschwindigkeit plus die Geschwindigkeit der Drehung um den Schwerpunkt: Im untersten Punkt liefert die Drehung ωr entgegen der Bewegung des Schwerpunkts.'),
        B.pointVelocity, 'vP = v - omegaSim*r', { vP: 'm/s', v: 'm/s' }),
      step('v = \\omega r',
        tri('纯滚动时接触点相对斜面静止，v_P = 0。',
          'In rolling without slipping the contact point is at rest relative to the incline, v_P = 0.',
          'Beim reinen Rollen ruht der Berührpunkt relativ zur Ebene, v_P = 0.'),
        B.rolling, 'v = omegaSim*r', { v: 'm/s' })
    ]
  },
  {
    formula: 'rl.a.slip',
    title: tri('边滚边滑：质心加速度', 'Rolling with slipping: acceleration of the centre of mass', 'Rollen mit Gleiten: Beschleunigung des Schwerpunkts'),
    uses: ['rolling.forces'],
    steps: [
      kineticFriction(),
      step('ma = mg\\sin\\theta - \\mu_k mg\\cos\\theta',
        tri('代入平动方程。', 'Insert into the translation equation.', 'In die Translationsgleichung einsetzen.'),
        tri('牛顿第二定律（质心，沿斜面方向）', "Newton's second law (centre of mass, along the incline)", 'Zweites Newtonsches Gesetz (Schwerpunkt, längs der Ebene)'),
        'm*a = m*g*sin(theta) - muK*m*g*cos(theta)', { a: 'm/s²' }),
      step('a = g(\\sin\\theta - \\mu_k\\cos\\theta)',
        tri('解出 a：与同一斜面上滑块的加速度相同，转动不影响质心的运动。',
          'Solve for a: the same as for a block sliding on this incline; the rotation does not affect the motion of the centre of mass.',
          'Nach a auflösen: wie für einen gleitenden Klotz auf dieser Ebene; die Drehung beeinflusst die Bewegung des Schwerpunkts nicht.'),
        B.rearrange, 'a = g*(sin(theta) - muK*cos(theta))', { a: 'm/s²' })
    ]
  },
  {
    formula: 'rl.beta.slip',
    title: tri('边滚边滑：角加速度', 'Rolling with slipping: angular acceleration', 'Rollen mit Gleiten: Winkelbeschleunigung'),
    uses: ['rolling.forces'],
    steps: [
      kineticFriction(),
      step('I\\beta = \\mu_k mg\\cos\\theta\\cdot r',
        tri('代入转动方程。', 'Insert into the rotation equation.', 'In die Rotationsgleichung einsetzen.'),
        B.rotationLawCm, 'I*beta = muK*m*g*cos(theta)*r', { beta: 'rad/s²' }),
      step('\\beta = \\dfrac{\\mu_k mgr\\cos\\theta}{I}',
        tri('解出 β，其大小恒定。', 'Solve for β; it is constant.', 'Nach β auflösen; sie ist konstant.'),
        B.rearrange, 'beta = muK*m*g*r*cos(theta)/I', { beta: 'rad/s²' })
    ]
  }
]
