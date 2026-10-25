/**
 * Derivations of the 26.51 situations "spin" (a body turned about a fixed axis through its centre of mass by a
 * motor with constant torque M) and "gear" (two discs on fixed axles joined by meshing gears, ω_A + r·ω_B = 0,
 * r = r_B/r_A; the driving wheel A may carry a constant torque M) (manual 26.51, D44, D51).
 */
import type { Derivation, SharedSteps } from './types'
import { B, st, tri } from './a-common'

const bRot = tri('转动定律', 'Rotational form of Newton’s second law', 'Grundgesetz der Drehbewegung')
const bVr = tri('线速度与角速度 v = ωr', 'Linear and angular speed, v = ωr', 'Bahn- und Winkelgeschwindigkeit, v = ω·r')
const bMesh = tri('啮合不打滑', 'The teeth do not slip', 'Die Zähne rutschen nicht')

/** Shared steps of the rotation situations (none). */
export const ROTATION_SHARED: SharedSteps[] = []

/** Derivations of the torque-motor and gear formulas. */
export const ROTATION_DERIVATIONS: Derivation[] = [
  {
    formula: 'spin.beta',
    title: tri('转动定律', 'Rotational form of Newton’s second law', 'Grundgesetz der Drehbewegung'),
    steps: [
      st('M = I\\beta',
        tri('刚体绕固定轴转动时，合外力矩等于转动惯量乘角加速度（与 F = ma 对应）。轴对物体的力和重力都通过转轴，力矩为零，只剩马达的力矩。',
          'For a rigid body turning about a fixed axis, the net torque equals the moment of inertia times the angular acceleration (the counterpart of F = ma). The force of the axle and the weight act through the axis and have no torque; only the motor’s torque is left.',
          'Für einen starren Körper, der sich um eine feste Achse dreht, ist das resultierende Drehmoment gleich Trägheitsmoment mal Winkelbeschleunigung (das Gegenstück zu F = m·a). Achskraft und Gewichtskraft greifen in der Achse an und haben kein Drehmoment; es bleibt nur das des Motors.'),
        bRot, ['M', 'I*beta'], { beta: 'rad/s²' }),
      st('\\beta = \\dfrac{M}{I}',
        tri('解出角加速度：同样的力矩，转动惯量越大，角加速度越小。',
          'Solve for the angular acceleration: for the same torque, the larger the moment of inertia, the smaller the angular acceleration.',
          'Nach der Winkelbeschleunigung auflösen: Bei gleichem Drehmoment ist sie umso kleiner, je größer das Trägheitsmoment.'),
        B.solve, ['beta', 'M/I'], { beta: 'rad/s²' })
    ]
  },
  {
    formula: 'spin.omega',
    title: tri('匀变速转动的角速度', 'Angular velocity under constant angular acceleration', 'Winkelgeschwindigkeit bei konstanter Winkelbeschleunigung'),
    steps: [
      st('\\beta = \\dfrac{M}{I}',
        tri('力矩恒定，角加速度恒定（前面的结论）。',
          'The torque is constant, so is the angular acceleration (earlier result).',
          'Das Drehmoment ist konstant, also auch die Winkelbeschleunigung (früheres Ergebnis).'),
        B.earlier, ['beta', 'M/I'], { beta: 'rad/s²' }),
      st('\\omega = \\omega_0 + \\beta t',
        tri('匀变速转动的角速度公式，与 v = v₀ + at 对应。',
          'Angular velocity under constant angular acceleration, the counterpart of v = v₀ + at.',
          'Winkelgeschwindigkeit bei konstanter Winkelbeschleunigung, das Gegenstück zu v = v₀ + a·t.'),
        tri('匀变速转动的角速度公式', 'Angular velocity–time relation', 'Winkelgeschwindigkeit-Zeit-Gesetz'), ['omega', 'omega0 + beta*t'], { omega: 'rad/s', beta: 'rad/s²' }),
      st('\\omega = \\omega_0 + \\dfrac{M}{I}t',
        tri('代入 β。',
          'Insert β.',
          'β einsetzen.'),
        B.prev, ['omega', 'omega0 + M/I*t'], { omega: 'rad/s' })
    ]
  },
  {
    formula: 'spin.theta',
    title: tri('匀变速转动的角位移', 'Angle turned under constant angular acceleration', 'Drehwinkel bei konstanter Winkelbeschleunigung'),
    steps: [
      st('\\beta = \\dfrac{M}{I}',
        tri('角加速度（前面的结论）。',
          'The angular acceleration (earlier result).',
          'Die Winkelbeschleunigung (früheres Ergebnis).'),
        B.earlier, ['beta', 'M/I'], { beta: 'rad/s²' }),
      st('\\theta = \\omega_0t + \\tfrac{1}{2}\\beta t^2',
        tri('匀变速转动的角位移公式，与 x = v₀t + ½at² 对应。',
          'Angle turned under constant angular acceleration, the counterpart of x = v₀t + ½at².',
          'Drehwinkel bei konstanter Winkelbeschleunigung, das Gegenstück zu x = v₀·t + ½·a·t².'),
        tri('匀变速转动的角位移公式', 'Angle–time relation', 'Winkel-Zeit-Gesetz'), ['theta', 'omega0*t + beta*t^2/2'], { beta: 'rad/s²' }),
      st('\\theta = \\omega_0t + \\dfrac{M}{2I}t^2',
        tri('代入 β。',
          'Insert β.',
          'β einsetzen.'),
        B.prev, ['theta', 'omega0*t + M/(2*I)*t^2'])
    ]
  },
  {
    formula: 'spin.W',
    title: tri('力矩做功等于转动动能的增加', 'Work of a torque equals the gain in rotational kinetic energy', 'Arbeit eines Drehmoments gleich Zuwachs an Rotationsenergie'),
    note: tri('θ 取仿真中转过的角度', 'θ is the angle turned in the simulation', 'θ ist der in der Simulation überstrichene Winkel'),
    steps: [
      st('W = M\\theta',
        tri('恒定力矩做的功等于力矩乘转过的角度（弧度），与 W = Fs 对应。',
          'A constant torque does work equal to torque times the angle turned (in radians), the counterpart of W = Fs.',
          'Ein konstantes Drehmoment verrichtet die Arbeit Drehmoment mal Drehwinkel (im Bogenmaß), das Gegenstück zu W = F·s.'),
        tri('力矩的功', 'Work of a torque', 'Arbeit eines Drehmoments'), ['W', 'M*theta'], { W: 'J' }),
      st('\\tfrac{1}{2}I\\omega^2 - \\tfrac{1}{2}I\\omega_0^2 = W',
        tri('转动动能 ½Iω² 的增加等于外力矩做的功（定轴转动的动能定理）。',
          'The gain in rotational kinetic energy ½Iω² equals the work of the external torque (work–energy theorem for a fixed axis).',
          'Der Zuwachs an Rotationsenergie ½·I·ω² ist gleich der Arbeit des äußeren Drehmoments (Arbeitssatz für eine feste Achse).'),
        tri('转动动能定理', 'Work–energy theorem for rotation', 'Arbeitssatz der Drehbewegung'), ['I*omega^2/2 - I*omega0^2/2', 'W'], { omega: 'rad/s', W: 'J' }),
      st('\\Delta E_k = M\\theta',
        tri('合起来：转动动能的增加等于力矩乘转过的角度。马达做的功计入能量账本的“电机做功”。',
          'Together: the gain in rotational kinetic energy is the torque times the angle turned. The motor’s work appears in the energy ledger as motor work.',
          'Zusammen: Der Zuwachs an Rotationsenergie ist Drehmoment mal Drehwinkel. Die Arbeit des Motors erscheint in der Energiebilanz als Motorarbeit.'),
        B.combine, ['dEk', 'M*theta'], { dEk: 'J' })
    ]
  },
  {
    formula: 'gear.w',
    title: tri('齿轮传动的角速度', 'Angular velocity in a gear train', 'Winkelgeschwindigkeit im Zahnradgetriebe'),
    note: tri('外啮合齿轮转向相反；ω_A 取仿真值', 'Meshing gears turn in opposite senses; ω_A is the simulated value', 'Kämmende Zahnräder drehen gegensinnig; ω_A ist der Simulationswert'),
    steps: [
      st('v_A = v_B',
        tri('两轮在啮合处不打滑，边缘的线速度大小相等。',
          'The wheels do not slip where they mesh, so their rims move at the same speed.',
          'Die Räder rutschen am Eingriff nicht; ihre Ränder bewegen sich gleich schnell.'),
        bMesh, ['vA', 'vB'], { vA: 'm/s', vB: 'm/s' }),
      st('\\omega_Ar_A = -\\omega_Br_B',
        tri('外啮合时两轮转向相反，角速度异号。',
          'Externally meshing wheels turn in opposite senses: the angular velocities have opposite signs.',
          'Außen kämmende Räder drehen gegensinnig: Die Winkelgeschwindigkeiten haben entgegengesetzte Vorzeichen.'),
        bVr, ['omegaA*rA', '-omegaB*rB'], { omegaB: 'rad/s', rB: 'm' }),
      st('\\omega_B = -\\dfrac{\\omega_Ar_A}{r_B} = -\\dfrac{\\omega_A}{r}',
        tri('解出 ω_B，r = r_B/r_A 为传动比：大轮转得慢。',
          'Solve for ω_B, with the gear ratio r = r_B/r_A: the larger wheel turns more slowly.',
          'Nach ω_B auflösen, mit dem Übersetzungsverhältnis r = r_B/r_A: Das größere Rad dreht sich langsamer.'),
        B.solve, ['omegaB', '-omegaA/r'], { omegaB: 'rad/s' })
    ]
  },
  {
    formula: 'gear.v',
    title: tri('啮合点线速度相等', 'Equal rim speeds at the mesh', 'Gleiche Umfangsgeschwindigkeit am Eingriff'),
    steps: [
      st('v_B = |\\omega_B|r_B = v_A',
        tri('两轮在啮合处不打滑，边缘线速度大小相等。',
          'The wheels do not slip where they mesh: the rims move at the same speed.',
          'Die Räder rutschen am Eingriff nicht: Die Ränder bewegen sich gleich schnell.'),
        bMesh, ['vB', 'vA'], { vA: 'm/s', vB: 'm/s' }),
      st('v = |\\omega_A|r_A',
        tri('主动轮边缘的线速度。',
          'The rim speed of the driving wheel.',
          'Die Umfangsgeschwindigkeit des treibenden Rades.'),
        bVr, ['v', 'abs(omegaA)*rA'], { v: 'm/s' })
    ]
  },
  {
    formula: 'gear.beta',
    title: tri('齿轮系的角加速度', 'Angular acceleration of the gear train', 'Winkelbeschleunigung des Getriebes'),
    method: tri('等效转动惯量', 'Effective moment of inertia', 'Wirksames Trägheitsmoment'),
    steps: [
      st('M - M_c = I_A\\beta_A',
        tri('隔离主动轮 A：马达力矩 M 使它加速，从动轮的反作用力矩 M_c 阻碍它。',
          'Isolate the driving wheel A: the motor torque M speeds it up, the reaction torque M_c of the driven wheel holds it back.',
          'Treibendes Rad A freischneiden: Das Motordrehmoment M beschleunigt es, das Gegenmoment M_c des getriebenen Rades bremst es.'),
        tri('转动定律（隔离主动轮）', 'Rotational second law for wheel A', 'Grundgesetz der Drehbewegung für Rad A'), ['M - Mc', 'IA*betaA'], { Mc: 'N·m', betaA: 'rad/s²' }),
      st('\\beta_B = -\\dfrac{\\beta_A}{r}',
        tri('对齿轮约束 ω_A + rω_B = 0 求导。',
          'Differentiate the gear constraint ω_A + rω_B = 0.',
          'Die Getriebebedingung ω_A + r·ω_B = 0 ableiten.'),
        tri('齿轮约束（对时间求导）', 'Gear constraint differentiated in time', 'Getriebebedingung, nach der Zeit abgeleitet'), ['betaB', '-betaA/r'], { betaB: 'rad/s²', betaA: 'rad/s²' }),
      st('rM_c = I_B|\\beta_B|',
        tri('隔离从动轮 B：啮合力相同，力臂之比为 r_B/r_A = r，所以它对 B 的力矩是 A 所受反作用力矩的 r 倍。',
          'Isolate the driven wheel B: the mesh force is the same, the lever arms are in the ratio r_B/r_A = r, so its torque on B is r times the reaction torque on A.',
          'Getriebenes Rad B freischneiden: Die Eingriffskraft ist dieselbe, die Hebelarme stehen im Verhältnis r_B/r_A = r, also ist ihr Drehmoment auf B r-mal das Gegenmoment auf A.'),
        tri('转动定律（隔离从动轮）', 'Rotational second law for wheel B', 'Grundgesetz der Drehbewegung für Rad B'), ['r*Mc', 'IB*betaA/r'], { Mc: 'N·m', betaA: 'rad/s²' }),
      st('M = \\left(I_A + \\dfrac{I_B}{r^2}\\right)\\beta_A',
        tri('消去 M_c：从动轮相当于给主动轮增加了转动惯量 I_B/r²（等效转动惯量）。',
          'Eliminate M_c: the driven wheel acts like an extra moment of inertia I_B/r² on the driving wheel (effective moment of inertia).',
          'M_c eliminieren: Das getriebene Rad wirkt wie ein zusätzliches Trägheitsmoment I_B/r² am treibenden Rad (wirksames Trägheitsmoment).'),
        B.combine, ['M', '(IA + IB/r^2)*betaA'], { betaA: 'rad/s²' }),
      st('\\beta_A = \\dfrac{M}{I_A + I_B/r^2}',
        tri('解出主动轮的角加速度。',
          'Solve for the angular acceleration of the driving wheel.',
          'Nach der Winkelbeschleunigung des treibenden Rades auflösen.'),
        B.solve, ['betaA', 'M/(IA + IB/r^2)'], { betaA: 'rad/s²' })
    ]
  }
]
