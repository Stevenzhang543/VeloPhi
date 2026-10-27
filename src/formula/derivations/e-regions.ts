/**
 * Derivations of the 26.55 situations (manual 26.55, D90–D92): a conductor rod on rails in a magnetic field
 * ("rail"), a body in a liquid ("float"), a charge moving in a circle inside a bounded magnetic region ("zone-b")
 * and a charge accelerated by a bounded electric region ("zone-e"). Variables are those of the Rust recognizers
 * (formula/situations2655.rs): B, L, R, m, F, v₀, t, v, s for the rail; ρ (rho, the liquid), ρ_b (rhoB, the body),
 * g, m, d, A, S, w for the liquid; q, m, t, B, v for the magnetic region; q, m, t, E, Eₓ, E_y, gₓ, g_y, v₀, sₓ, s_y,
 * d for the electric region.
 */
import type { Derivation, SharedSteps } from './types'
import { B, CAUSE_NUM, st, tri } from './a-common'

/** Shared steps: the emf, current and force of the rod. */
export const REGION_SHARED: SharedSteps[] = [
  {
    id: 'rail.chain',
    title: tri('导体棒中的电动势、电流与安培力', 'Emf, current and force of the rod', 'EMK, Strom und Kraft im Stab'),
    steps: [
      st('\\varepsilon = BLv',
        tri('导体棒以速度 v 垂直切割磁感线，棒中的感应电动势等于 B、L、v 的乘积。',
          'The rod cuts the field lines at right angles with speed v; the induced emf is the product of B, L and v.',
          'Der Stab schneidet die Feldlinien senkrecht mit der Geschwindigkeit v; die induzierte EMK ist das Produkt aus B, L und v.'),
        tri('导体切割磁感线的电动势 ε = BLv', 'Motional emf ε = BLv', 'Bewegungsinduktion ε = B·L·v'), ['eps', 'B*L*v'], { eps: 'V' }),
      st('I = \\dfrac{\\varepsilon}{R} = \\dfrac{BLv}{R}',
        tri('导体棒、导轨和电阻组成闭合回路，回路的总电阻为 R。',
          'The rod, the rails and the resistor form a closed circuit of total resistance R.',
          'Stab, Schienen und Widerstand bilden einen geschlossenen Kreis mit dem Gesamtwiderstand R.'),
        tri('闭合电路欧姆定律', "Ohm's law for the closed circuit", 'Ohmsches Gesetz für den geschlossenen Stromkreis'), ['I', 'B*L*v/R'], { I: 'A' }),
      st('F_A = BIL = \\dfrac{B^2L^2v}{R}',
        tri('通电的导体棒在磁场中受安培力，方向阻碍它的运动（楞次定律）。',
          'The current-carrying rod feels the Ampère force in the field, opposing its motion (Lenz’s law).',
          'Auf den stromdurchflossenen Stab wirkt im Feld die Kraft F = B·I·L, die seine Bewegung hemmt (Lenzsche Regel).'),
        tri('安培力 F = BIL；楞次定律', 'Ampère force F = BIL; Lenz’s law', 'Kraft auf einen stromdurchflossenen Leiter F = B·I·L; Lenzsche Regel'), ['FA', 'B^2*L^2*v/R'], { FA: 'N' })
    ]
  }
]

const lorentz = tri('洛伦兹力 F = qvB（速度垂直于磁场），方向垂直于速度', 'Lorentz force F = qvB (velocity perpendicular to the field), perpendicular to the velocity', 'Lorentzkraft F = q·v·B (Geschwindigkeit senkrecht zum Feld), senkrecht zur Geschwindigkeit')
const centripetal = tri('向心力 F = mv²/r', 'Centripetal force F = mv²/r', 'Zentripetalkraft F = m·v²/r')
const archimedes = tri('阿基米德原理：浮力等于排开液体的重力', "Archimedes' principle: the buoyant force equals the weight of the displaced liquid", 'Archimedisches Prinzip: Die Auftriebskraft ist gleich der Gewichtskraft der verdrängten Flüssigkeit')
const balance = tri('二力平衡', 'Balance of two forces', 'Gleichgewicht zweier Kräfte')
const workEnergy = tri('动能定理：合力做的功等于动能的增加', 'Work–energy theorem: the work of the net force equals the gain in kinetic energy', 'Arbeitssatz: Die Arbeit der resultierenden Kraft ist gleich dem Zuwachs an kinetischer Energie')
const stillNotes = tri('物体还在上下振动，没有完全静止', 'The body is still bobbing up and down and not yet at rest', 'Der Körper schwingt noch auf und ab und ist noch nicht in Ruhe')

/** Derivations of the 26.55 formulas. */
export const REGION_DERIVATIONS: Derivation[] = [
  // ---- Rod on rails ----
  {
    formula: 'rail.emf',
    title: tri('导体棒切割磁感线的电动势', 'Emf of a rod cutting the field lines', 'EMK eines Stabs, der die Feldlinien schneidet'),
    note: tri('v 取仿真中此刻的速度', 'v is the simulated velocity at this instant', 'v ist die simulierte Geschwindigkeit in diesem Augenblick'),
    steps: [
      st('\\Delta\\Phi = BL\\,v\\Delta t',
        tri('在 Δt 内导体棒移动 vΔt，回路的面积增加 LvΔt，磁通量增加 BLvΔt。',
          'In Δt the rod moves vΔt; the area of the circuit grows by LvΔt and the flux by BLvΔt.',
          'In Δt bewegt sich der Stab um v·Δt; die Fläche des Kreises wächst um L·v·Δt und der Fluss um B·L·v·Δt.'),
        tri('磁通量 Φ = BS', 'Magnetic flux Φ = BS', 'Magnetischer Fluss Φ = B·A'), ['dPhi', 'B*L*v*dt'], { dPhi: 'Wb', dt: 's' }),
      st('\\varepsilon = \\dfrac{\\Delta\\Phi}{\\Delta t} = BLv',
        tri('由法拉第电磁感应定律，电动势等于磁通量的变化率。',
          "By Faraday's law of induction, the emf equals the rate of change of the flux.",
          'Nach dem Induktionsgesetz ist die EMK gleich der Änderungsrate des Flusses.'),
        tri('法拉第电磁感应定律', "Faraday's law of induction", 'Faradaysches Induktionsgesetz'), ['eps', 'B*L*v'], { eps: 'V' })
    ]
  },
  {
    formula: 'rail.I',
    title: tri('感应电流', 'Induced current', 'Induzierter Strom'),
    method: tri('闭合电路欧姆定律 I = ε/R', "Ohm's law for the closed circuit, I = ε/R", 'Ohmsches Gesetz für den geschlossenen Kreis, I = ε/R'),
    uses: ['rail.chain'],
    steps: [
      st('I = \\dfrac{BLv}{R}',
        tri('代入电动势 ε = BLv。', 'Substitute the emf ε = BLv.', 'Die EMK ε = B·L·v einsetzen.'),
        B.prev, ['I', 'B*L*v/R'], { I: 'A' })
    ]
  },
  {
    formula: 'rail.F',
    title: tri('安培力', 'Ampère force', 'Kraft auf den Stab'),
    note: tri('方向与导体棒的运动方向相反（楞次定律）', 'It opposes the motion of the rod (Lenz’s law)', 'Sie ist der Bewegung des Stabs entgegengerichtet (Lenzsche Regel)'),
    uses: ['rail.chain'],
    steps: [
      st('F_A = B\\cdot\\dfrac{BLv}{R}\\cdot L = \\dfrac{B^2L^2v}{R}',
        tri('把 I = BLv/R 代入 F = BIL：安培力与速度成正比，相当于一个线性阻力。',
          'Put I = BLv/R into F = BIL: the force is proportional to the speed, like a linear drag.',
          'I = B·L·v/R in F = B·I·L einsetzen: Die Kraft ist proportional zur Geschwindigkeit, wie eine lineare Reibung.'),
        B.prev, ['FA', 'B^2*L^2*abs(v)/R'], { FA: 'N' })
    ]
  },
  {
    formula: 'rail.a',
    title: tri('导体棒的加速度', 'Acceleration of the rod', 'Beschleunigung des Stabs'),
    method: tri('牛顿第二定律：动力减去安培力', "Newton's second law: driving force minus the Ampère force", 'Zweites Newtonsches Gesetz: Antriebskraft minus Kraft auf den Stab'),
    uses: ['rail.chain'],
    steps: [
      st('ma = F - \\dfrac{B^2L^2v}{R}',
        tri('沿导轨方向，导体棒受恒定的动力 F（外力与重力沿导轨的分力）和与速度相反的安培力。',
          'Along the rails the rod feels the constant driving force F (applied force and the component of the weight) and the Ampère force against the velocity.',
          'Längs der Schienen wirken die konstante Antriebskraft F (äußere Kraft und Hangabtrieb) und die Kraft auf den Stab entgegen der Geschwindigkeit.'),
        B.n2, ['m*a', 'F - B^2*L^2*v/R'], { a: 'm/s²' }),
      st('a = \\dfrac{F}{m} - \\dfrac{B^2L^2v}{mR}',
        tri('两边除以 m。速度越大，加速度越小。', 'Divide by m. The faster the rod, the smaller the acceleration.', 'Durch m teilen. Je schneller der Stab, desto kleiner die Beschleunigung.'),
        B.rearrange, ['a', 'F/m - B^2*L^2*v/(m*R)'], { a: 'm/s²' })
    ]
  },
  {
    formula: 'rail.v',
    title: tri('速度随时间的变化', 'Velocity as a function of time', 'Geschwindigkeit als Funktion der Zeit'),
    causes: [CAUSE_NUM],
    uses: ['rail.chain'],
    steps: [
      st('m\\dfrac{dv}{dt} = F - kv,\\quad k = \\dfrac{B^2L^2}{R}',
        tri('牛顿第二定律写成速度的微分方程：安培力相当于系数 k = B²L²/R 的线性阻力。',
          "Newton's second law as a differential equation for the velocity: the Ampère force acts like a linear drag with k = B²L²/R.",
          'Das zweite Newtonsche Gesetz als Differentialgleichung für die Geschwindigkeit: Die Kraft wirkt wie eine lineare Reibung mit k = B²L²/R.'),
        B.n2, ['k', 'B^2*L^2/R'], { k: 'N·s/m' }),
      st('v_T = \\dfrac{F}{k} = \\dfrac{FR}{B^2L^2},\\quad \\tau = \\dfrac{m}{k} = \\dfrac{mR}{B^2L^2}',
        tri('dv/dt = 0 时的速度是收尾速度 v_T；τ 是时间常数。',
          'The velocity with dv/dt = 0 is the terminal velocity v_T; τ is the time constant.',
          'Die Geschwindigkeit mit dv/dt = 0 ist die Endgeschwindigkeit v_T; τ ist die Zeitkonstante.'),
        B.solve, ['vT', 'F*R/(B^2*L^2)'], { vT: 'm/s', tau: 's' }),
      st('v = v_T + (v_0 - v_T)e^{-t/\\tau}',
        tri('分离变量积分（t = 0 时 v = v₀）：速度按指数规律趋近 v_T。',
          'Separate the variables and integrate (v = v₀ at t = 0): the velocity approaches v_T exponentially.',
          'Variablen trennen und integrieren (v = v₀ bei t = 0): Die Geschwindigkeit nähert sich exponentiell v_T.'),
        tri('一阶线性微分方程的解', 'Solution of a first-order linear differential equation', 'Lösung einer linearen Differentialgleichung erster Ordnung'),
        ['vt', 'F*R/(B^2*L^2) + (v0 - F*R/(B^2*L^2))*exp(-B^2*L^2*t/(m*R))'], { vt: 'm/s' })
    ]
  },
  {
    formula: 'rail.vT',
    title: tri('收尾速度', 'Terminal velocity', 'Endgeschwindigkeit'),
    note: tri('竖直导轨上 F = mg：v_T = mgR/(B²L²)', 'On vertical rails F = mg: v_T = mgR/(B²L²)', 'Bei senkrechten Schienen F = m·g: v_T = m·g·R/(B²L²)'),
    causes: [tri('还没有达到收尾速度：速度按 e^(−t/τ) 逼近 v_T', 'Not yet at the terminal velocity: the velocity approaches v_T as e^(−t/τ)', 'Die Endgeschwindigkeit ist noch nicht erreicht: Die Geschwindigkeit nähert sich v_T wie e^(−t/τ)')],
    uses: ['rail.chain'],
    steps: [
      st('F = \\dfrac{B^2L^2v_T}{R}',
        tri('匀速运动时加速度为零，动力与安培力平衡。',
          'In uniform motion the acceleration is zero: the driving force balances the Ampère force.',
          'Bei gleichförmiger Bewegung ist die Beschleunigung null: Antriebskraft und Kraft auf den Stab sind im Gleichgewicht.'),
        balance, ['F', 'B^2*L^2*vT/R'], { vT: 'm/s' }),
      st('v_T = \\dfrac{FR}{B^2L^2}',
        tri('解出 v_T。', 'Solve for v_T.', 'Nach v_T auflösen.'),
        B.solve, ['vT', 'F*R/(B^2*L^2)'], { vT: 'm/s' })
    ]
  },
  {
    formula: 'rail.Q',
    title: tri('能量守恒：焦耳热', 'Energy conservation: Joule heat', 'Energieerhaltung: Joulesche Wärme'),
    causes: [CAUSE_NUM],
    steps: [
      st('Fs = \\left(\\tfrac12mv^2 - \\tfrac12mv_0^2\\right) + Q',
        tri('动力做的功一部分增加导体棒的动能，其余通过安培力做负功变成电能，最后在电阻中全部变成焦耳热。',
          'The work of the driving force partly raises the kinetic energy; the rest becomes electrical energy through the negative work of the Ampère force and ends up as Joule heat in the resistor.',
          'Die Arbeit der Antriebskraft erhöht teils die kinetische Energie; der Rest wird über die negative Arbeit der Kraft auf den Stab zu elektrischer Energie und schließlich zu Joulescher Wärme im Widerstand.'),
        tri('能量守恒定律', 'Conservation of energy', 'Energieerhaltungssatz'), ['F*s', 'm*(v^2 - v0^2)/2 + Q'], { Q: 'J' }),
      st('Q = Fs - \\left(\\tfrac12mv^2 - \\tfrac12mv_0^2\\right)',
        tri('移项求焦耳热。', 'Rearrange for the Joule heat.', 'Nach der Jouleschen Wärme umstellen.'),
        B.rearrange, ['Q', 'F*s - m*(v^2 - v0^2)/2'], { Q: 'J' })
    ]
  },
  // ---- Body in a liquid ----
  {
    formula: 'fl.F',
    title: tri('阿基米德原理', "Archimedes' principle", 'Archimedisches Prinzip'),
    note: tri('二维中 V排 = 浸入面积 A × 厚度 d；浮力由运动求得 m(a + g)', 'In 2D the displaced volume is the submerged area A times the thickness d; the simulated buoyancy is m(a + g) from the motion', 'In 2D ist das verdrängte Volumen die eingetauchte Fläche A mal die Dicke d; der simulierte Auftrieb ist m(a + g) aus der Bewegung'),
    steps: [
      st('V_{sub} = Ad',
        tri('浸入部分的截面积 A 乘物体的厚度 d，就是排开液体的体积。',
          'The submerged cross-section A times the thickness d is the displaced volume.',
          'Die eingetauchte Querschnittsfläche A mal die Dicke d ist das verdrängte Volumen.'),
        tri('体积 = 底面积 × 高', 'Volume = base area × height', 'Volumen = Grundfläche × Höhe'), ['V', 'A*d'], { V: 'm³' }),
      st('F_b = \\rho_f gV_{sub} = \\rho_f gAd',
        tri('液体对物体各面压力的合力竖直向上，等于排开液体的重力。',
          'The pressure forces of the liquid on the body add up to an upward force equal to the weight of the displaced liquid.',
          'Die Druckkräfte der Flüssigkeit auf den Körper ergeben eine nach oben gerichtete Kraft gleich der Gewichtskraft der verdrängten Flüssigkeit.'),
        archimedes, ['Fb', 'rho*g*A*d'], { Fb: 'N' })
    ]
  },
  {
    formula: 'fl.eq',
    title: tri('漂浮条件', 'Condition for floating', 'Schwimmbedingung'),
    causes: [stillNotes],
    steps: [
      st('F_b = mg',
        tri('漂浮静止时只受重力和浮力，二力平衡。', 'At rest while floating only the weight and the buoyant force act, and they balance.', 'Beim ruhenden Schwimmen wirken nur Gewichtskraft und Auftrieb; sie sind im Gleichgewicht.'),
        balance, ['Fb', 'm*g'], { Fb: 'N' })
    ]
  },
  {
    formula: 'fl.ratio',
    title: tri('漂浮时浸入的比例', 'Fraction submerged when floating', 'Eingetauchter Anteil beim Schwimmen'),
    method: tri('ρ液gV排 = ρ物gV', 'ρ_f gV_sub = ρ_b gV', 'ρ_f·g·V_sub = ρ_b·g·V'),
    causes: [stillNotes],
    steps: [
      st('\\rho_f gV_{sub} = mg = \\rho_b gV',
        tri('浮力等于重力；物体的质量写成平均密度乘体积。', 'The buoyant force equals the weight; the mass is the mean density times the volume.', 'Der Auftrieb ist gleich der Gewichtskraft; die Masse ist mittlere Dichte mal Volumen.'),
        balance, ['rho*g*Vs', 'rhoB*g*V'], { Vs: 'm³', V: 'm³' }),
      st('\\dfrac{V_{sub}}{V} = \\dfrac{\\rho_b}{\\rho_f}',
        tri('两边除以 ρ液gV。', 'Divide by ρ_f gV.', 'Durch ρ_f·g·V teilen.'),
        B.rearrange, ['f', 'rhoB/rho'], { f: '' })
    ]
  },
  {
    formula: 'fl.h',
    title: tri('吃水深度', 'Draught', 'Tiefgang'),
    causes: [stillNotes],
    steps: [
      st('\\rho_f g\\,(wh)\\,d = mg',
        tri('竖直放置的长方体浸入部分是宽 w、高 h 的矩形，排开液体的体积 whd。',
          'The submerged part of an upright box is a w-by-h rectangle; the displaced volume is whd.',
          'Der eingetauchte Teil eines aufrechten Quaders ist ein Rechteck w mal h; das verdrängte Volumen ist w·h·d.'),
        archimedes, ['rho*g*w*h*d', 'm*g'], { h: 'm' }),
      st('h = \\dfrac{m}{\\rho_f wd}',
        tri('解出吃水深度 h。', 'Solve for the draught h.', 'Nach dem Tiefgang h auflösen.'),
        B.solve, ['h', 'm/(rho*w*d)'], { h: 'm' })
    ]
  },
  {
    formula: 'fl.a',
    title: tri('浸没时的加速度', 'Acceleration when fully submerged', 'Beschleunigung bei völligem Eintauchen'),
    note: tri('a > 0 上浮，a < 0 下沉', 'a > 0: rising; a < 0: sinking', 'a > 0: Aufsteigen; a < 0: Sinken'),
    steps: [
      st('ma = \\rho_f gV - mg',
        tri('浸没时排开液体的体积等于物体的体积 V，浮力不变；取向上为正。',
          'When fully submerged the displaced volume is the body volume V, so the buoyant force is constant; up is positive.',
          'Bei völligem Eintauchen ist das verdrängte Volumen das Körpervolumen V, der Auftrieb also konstant; aufwärts positiv.'),
        B.n2, ['m*a', 'rho*g*(m/rhoB) - m*g'], { a: 'm/s²' }),
      st('a = g\\left(\\dfrac{\\rho_f}{\\rho_b} - 1\\right)',
        tri('用 m = ρ物V 消去 V 和 m。', 'Eliminate V and m with m = ρ_b V.', 'Mit m = ρ_b·V werden V und m eliminiert.'),
        B.algebra, ['a', 'g*(rho/rhoB - 1)'], { a: 'm/s²' })
    ]
  },
  // ---- Charge in a magnetic region ----
  {
    formula: 'zb.F',
    title: tri('洛伦兹力', 'Lorentz force', 'Lorentzkraft'),
    note: tri('仿真值由运动求得 F = ma', 'The simulated value comes from the motion, F = ma', 'Der simulierte Wert ergibt sich aus der Bewegung, F = m·a'),
    steps: [
      st('F = |q|vB',
        tri('带电粒子垂直于磁场运动，受到的洛伦兹力大小等于 |q|、v、B 的乘积。',
          'A charge moving perpendicular to the field feels a Lorentz force of size |q|vB.',
          'Eine senkrecht zum Feld bewegte Ladung erfährt eine Lorentzkraft vom Betrag |q|·v·B.'),
        lorentz, ['F', 'abs(q)*v*B'], { F: 'N' })
    ]
  },
  {
    formula: 'zb.r',
    title: tri('圆周运动的半径', 'Radius of the circular motion', 'Radius der Kreisbewegung'),
    method: tri('洛伦兹力提供向心力 |q|vB = mv²/r', 'The Lorentz force is the centripetal force, |q|vB = mv²/r', 'Die Lorentzkraft ist die Zentripetalkraft, |q|·v·B = m·v²/r'),
    steps: [
      st('|q|vB = \\dfrac{mv^2}{r}',
        tri('洛伦兹力始终垂直于速度，大小不变，提供匀速圆周运动的向心力。',
          'The Lorentz force is always perpendicular to the velocity and constant in size: it is the centripetal force of a uniform circular motion.',
          'Die Lorentzkraft steht stets senkrecht zur Geschwindigkeit und hat konstanten Betrag: Sie ist die Zentripetalkraft einer gleichförmigen Kreisbewegung.'),
        centripetal, ['abs(q)*v*B', 'm*v^2/r'], { r: 'm' }),
      st('r = \\dfrac{mv}{|q|B}',
        tri('解出半径。', 'Solve for the radius.', 'Nach dem Radius auflösen.'),
        B.solve, ['r', 'm*v/(abs(q)*B)'], { r: 'm' })
    ]
  },
  {
    formula: 'zb.v',
    title: tri('洛伦兹力不做功（速率不变）', 'The Lorentz force does no work (constant speed)', 'Die Lorentzkraft verrichtet keine Arbeit (konstanter Betrag der Geschwindigkeit)'),
    causes: [CAUSE_NUM],
    steps: [
      st("\\tfrac12mv'^2 - \\tfrac12mv^2 = 0",
        tri('洛伦兹力垂直于速度，功率为零，动能不变。', 'The Lorentz force is perpendicular to the velocity, its power is zero and the kinetic energy stays the same.', 'Die Lorentzkraft steht senkrecht zur Geschwindigkeit, ihre Leistung ist null, die kinetische Energie bleibt gleich.'),
        workEnergy, ['m*vp^2/2 - m*v^2/2', '0'], { vp: 'm/s' }),
      st("v' = v",
        tri('速率不变。', 'The speed is unchanged.', 'Der Betrag der Geschwindigkeit bleibt gleich.'),
        B.solve, ['vp', 'v'], { vp: 'm/s' })
    ]
  },
  {
    formula: 'zb.t',
    title: tri('在磁场中运动的时间（半周）', 'Time in the field (half a turn)', 'Zeit im Feld (halber Umlauf)'),
    note: tri('与速度大小无关（回旋加速器的原理）', 'It does not depend on the speed (the principle of the cyclotron)', 'Sie hängt nicht von der Geschwindigkeit ab (Prinzip des Zyklotrons)'),
    steps: [
      st('T = \\dfrac{2\\pi r}{v} = \\dfrac{2\\pi m}{|q|B}',
        tri('转一周的时间是周长除以速率；代入 r = mv/(|q|B)，v 消去。',
          'The period is the circumference over the speed; with r = mv/(|q|B) the speed cancels.',
          'Die Umlaufdauer ist Umfang durch Geschwindigkeit; mit r = m·v/(|q|·B) kürzt sich v.'),
        tri('匀速圆周运动的周期 T = 2πr/v', 'Period of uniform circular motion, T = 2πr/v', 'Umlaufdauer der gleichförmigen Kreisbewegung, T = 2πr/v'), ['T', '2*pi*m/(abs(q)*B)'], { T: 's' }),
      st('t = \\dfrac{T}{2} = \\dfrac{\\pi m}{|q|B}',
        tri('垂直于直边界射入，转过半周后从同一边界射出。', 'Entering at right angles through a straight edge, the charge turns half a circle and leaves through the same edge.', 'Bei senkrechtem Eintritt durch einen geraden Rand läuft die Ladung einen Halbkreis und verlässt das Feld am selben Rand.'),
        tri('几何关系（半周）', 'Geometry (half a turn)', 'Geometrie (halber Umlauf)'), ['tin', 'pi*m/(abs(q)*B)'], { tin: 's' })
    ]
  },
  {
    formula: 'zb.d',
    title: tri('入射点与出射点的距离', 'Distance between the entry and exit points', 'Abstand zwischen Ein- und Austrittspunkt'),
    note: tri('质谱仪：落点到入口的距离', 'Mass spectrometer: the distance from the entrance to the spot', 'Massenspektrometer: Abstand vom Eintritt bis zum Auftreffpunkt'),
    steps: [
      st('d = 2r',
        tri('转过半周，入射点与出射点是同一直径的两端。', 'After half a turn the entry and exit points are the ends of one diameter.', 'Nach einem halben Umlauf sind Ein- und Austrittspunkt die Enden eines Durchmessers.'),
        tri('几何关系（半周）', 'Geometry (half a turn)', 'Geometrie (halber Umlauf)'), ['d2', '2*m*v/(abs(q)*B)'], { d2: 'm' }),
      st('d = \\dfrac{2mv}{|q|B}',
        tri('代入 r = mv/(|q|B)。', 'Substitute r = mv/(|q|B).', 'r = m·v/(|q|·B) einsetzen.'),
        B.prev, ['d2', '2*m*v/(abs(q)*B)'], { d2: 'm' })
    ]
  },
  // ---- Charge in an electric region ----
  {
    formula: 'ze.a',
    title: tri('电场力产生的加速度', 'Acceleration produced by the electric force', 'Beschleunigung durch die elektrische Kraft'),
    note: tri('不计重力', 'Gravity neglected', 'Schwerkraft vernachlässigt'),
    steps: [
      st('F = |q|E',
        tri('在区域内带电粒子受恒定的电场力。', 'Inside the region the charge feels a constant electric force.', 'Im Gebiet wirkt auf die Ladung eine konstante elektrische Kraft.'),
        tri('电场力 F = qE', 'Electric force F = qE', 'Elektrische Kraft F = q·E'), ['F', 'abs(q)*E'], { F: 'N' }),
      st('a = \\dfrac{|q|E}{m}',
        tri('不计重力时电场力就是合力。', 'With gravity neglected the electric force is the net force.', 'Ohne Schwerkraft ist die elektrische Kraft die resultierende Kraft.'),
        B.n2, ['a', 'abs(q)*E/m'], { a: 'm/s²' })
    ]
  },
  {
    formula: 'ze.v',
    title: tri('加速后的速度', 'Speed after the acceleration', 'Geschwindigkeit nach der Beschleunigung'),
    method: tri('动能定理 |q|U = ½mv² − ½mv₀²，U = Ed', 'Work–energy theorem |q|U = ½mv² − ½mv₀², U = Ed', 'Arbeitssatz |q|·U = ½·m·v² − ½·m·v₀², U = E·d'),
    steps: [
      st('W = |q|Ed = |q|U',
        tri('电场力与位移同向，做功等于力乘沿电场方向移动的距离 d，也等于电荷量乘电势差 U = Ed。',
          'The electric force points along the displacement; its work is the force times the distance d moved along the field, which is also the charge times the potential difference U = Ed.',
          'Die elektrische Kraft zeigt in Richtung der Verschiebung; ihre Arbeit ist Kraft mal Strecke d längs des Feldes, also auch Ladung mal Spannung U = E·d.'),
        B.workDef, ['W', 'abs(q)*E*d'], { W: 'J' }),
      st('|q|Ed = \\tfrac12mv^2 - \\tfrac12mv_0^2',
        tri('不计重力，电场力做的功等于动能的增加。', 'With gravity neglected the work of the electric force is the gain in kinetic energy.', 'Ohne Schwerkraft ist die Arbeit der elektrischen Kraft der Zuwachs an kinetischer Energie.'),
        workEnergy, ['abs(q)*E*d', 'm*vv^2/2 - m*v0^2/2'], { vv: 'm/s' }),
      st('v = \\sqrt{v_0^2 + \\dfrac{2|q|Ed}{m}}',
        tri('解出速度；由静止开始时 v = √(2|q|U/m)。', 'Solve for the speed; from rest v = √(2|q|U/m).', 'Nach der Geschwindigkeit auflösen; aus der Ruhe v = √(2|q|U/m).'),
        B.solve, ['vv', 'sqrt(v0^2 + 2*abs(q)*E*d/m)'], { vv: 'm/s' })
    ]
  },
  {
    formula: 'ze.W',
    title: tri('动能定理（电场力与重力做功）', 'Work–energy theorem (work of the electric force and of gravity)', 'Arbeitssatz (Arbeit der elektrischen Kraft und der Schwerkraft)'),
    causes: [CAUSE_NUM],
    steps: [
      st('W_E = q\\vec E\\cdot\\vec s,\\quad W_G = m\\vec g\\cdot\\vec s',
        tri('恒力做功等于力与位移的点积。', 'The work of a constant force is the dot product of the force and the displacement.', 'Die Arbeit einer konstanten Kraft ist das Skalarprodukt aus Kraft und Verschiebung.'),
        B.workDef, ['WE', 'q*(Ex*sx + Ey*sy)'], { WE: 'J' }),
      st('\\Delta E_k = q\\vec E\\cdot\\vec s + m\\vec g\\cdot\\vec s',
        tri('合力做的功等于动能的增加。', 'The work of the net force equals the gain in kinetic energy.', 'Die Arbeit der resultierenden Kraft ist der Zuwachs an kinetischer Energie.'),
        workEnergy, ['dEk', 'q*(Ex*sx + Ey*sy) + m*(gx*sx + gy*sy)'], { dEk: 'J' })
    ]
  }
]
