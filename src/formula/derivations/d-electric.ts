/**
 * Derivations of the 26.54 situations (manual 26.54, D78): a charged body in a uniform electric field ("charge-e"),
 * in a uniform magnetic field ("charge-b"), in both fields (the velocity selector "selector", and "charge-eb"), and
 * two charges interacting by the Coulomb force ("coulomb"). Variables are those of the Rust recognizers
 * (formula/situations2654.rs): q, m, t, E, Eₓ, E_y, gₓ, g_y, v₀ₓ, v₀_y, v₀, sₓ, s_y, L for the electric field;
 * q, m, t, B, v for the magnetic field; k, q₁, q₂, m, r, r₀, v₀, E₀ for the Coulomb force.
 */
import type { Derivation, SharedSteps } from './types'
import { B, CAUSE_NUM, st, tri } from './a-common'

/** Shared steps (none). */
export const ELECTRIC_SHARED: SharedSteps[] = []

const field = tri('电场力 F = qE，正电荷受力沿电场方向', 'Electric force F = qE, along the field on a positive charge', 'Elektrische Kraft F = q·E, bei positiver Ladung in Feldrichtung')
const lorentz = tri('洛伦兹力 F = qvB（速度垂直于磁场），方向垂直于速度', 'Lorentz force F = qvB (velocity perpendicular to the field), perpendicular to the velocity', 'Lorentzkraft F = q·v·B (Geschwindigkeit senkrecht zum Feld), senkrecht zur Geschwindigkeit')
const workEnergy = tri('动能定理：合力做的功等于动能的增加', 'Work–energy theorem: the work of the net force equals the gain in kinetic energy', 'Arbeitssatz: Die Arbeit der resultierenden Kraft ist gleich dem Zuwachs an kinetischer Energie')
const centripetal = tri('向心力 F = mv²/r', 'Centripetal force F = mv²/r', 'Zentripetalkraft F = m·v²/r')
const coulomb = tri('库仑定律', "Coulomb's law", 'Coulombsches Gesetz')
const energyCons = tri('能量守恒（只有库仑力做功）', 'Conservation of energy (only the Coulomb force does work)', 'Energieerhaltung (nur die Coulombkraft verrichtet Arbeit)')

/** Derivations of the charge and field formulas. */
export const ELECTRIC_DERIVATIONS: Derivation[] = [
  // ---- Charged body in a uniform electric field ----
  {
    formula: 'ce.a',
    title: tri('电场力产生的加速度', 'Acceleration produced by the electric force', 'Beschleunigung durch die elektrische Kraft'),
    note: tri('不计重力', 'Gravity neglected', 'Schwerkraft vernachlässigt'),
    steps: [
      st('F = |q|E',
        tri('带电体在匀强电场中受到恒定的电场力，大小为电荷量与场强的乘积。',
          'In a uniform field the charged body feels a constant electric force: charge times field strength.',
          'Im homogenen Feld wirkt auf den geladenen Körper eine konstante Kraft: Ladung mal Feldstärke.'),
        field, ['F', 'abs(q)*E'], { F: 'N' }),
      st('a = \\dfrac{F}{m} = \\dfrac{|q|E}{m}',
        tri('不计重力时电场力就是合力，由牛顿第二定律得加速度。',
          'With gravity neglected the electric force is the net force; Newton’s second law gives the acceleration.',
          'Ohne Schwerkraft ist die elektrische Kraft die resultierende Kraft; das zweite Newtonsche Gesetz liefert die Beschleunigung.'),
        B.n2, ['a', 'abs(q)*E/m'], { a: 'm/s²' })
    ]
  },
  {
    formula: 'ce.x',
    title: tri('x 方向的位移', 'Displacement along x', 'Verschiebung in x-Richtung'),
    causes: [CAUSE_NUM],
    steps: [
      st('a_x = \\dfrac{qE_x}{m} + g_x',
        tri('x 方向的合力是电场力与重力的 x 分量之和，除以质量得到恒定的加速度。',
          'The net force along x is the x component of the electric force plus that of gravity; divided by the mass it gives a constant acceleration.',
          'Die resultierende Kraft in x-Richtung ist die x-Komponente der elektrischen Kraft plus die der Gewichtskraft; durch die Masse geteilt ergibt sie eine konstante Beschleunigung.'),
        B.n2, ['ax', 'q*Ex/m + gx'], { ax: 'm/s²' }),
      st('\\Delta x = v_{0x}t + \\tfrac{1}{2}\\left(\\dfrac{qE_x}{m} + g_x\\right)t^2',
        tri('x 方向是匀变速直线运动，代入位移公式。',
          'Along x the motion is uniformly accelerated; use the displacement formula.',
          'In x-Richtung ist die Bewegung gleichmäßig beschleunigt; Weg-Zeit-Gesetz einsetzen.'),
        B.uniformX, ['dx', 'vx0*t + (q*Ex/m + gx)*t^2/2'], { dx: 'm' })
    ]
  },
  {
    formula: 'ce.y',
    title: tri('y 方向的位移', 'Displacement along y', 'Verschiebung in y-Richtung'),
    causes: [CAUSE_NUM],
    steps: [
      st('a_y = \\dfrac{qE_y}{m} + g_y',
        tri('y 方向同理：电场力与重力的 y 分量之和产生恒定的加速度。',
          'Likewise along y: the y components of the electric force and of gravity give a constant acceleration.',
          'Ebenso in y-Richtung: Die y-Komponenten von elektrischer Kraft und Gewichtskraft ergeben eine konstante Beschleunigung.'),
        B.n2, ['ay', 'q*Ey/m + gy'], { ay: 'm/s²' }),
      st('\\Delta y = v_{0y}t + \\tfrac{1}{2}\\left(\\dfrac{qE_y}{m} + g_y\\right)t^2',
        tri('代入匀变速直线运动的位移公式。',
          'Use the displacement formula of uniformly accelerated motion.',
          'Weg-Zeit-Gesetz der gleichmäßig beschleunigten Bewegung einsetzen.'),
        B.uniformX, ['dy', 'vy0*t + (q*Ey/m + gy)*t^2/2'], { dy: 'm' })
    ]
  },
  {
    formula: 'ce.vx',
    title: tri('x 方向的速度', 'Velocity along x', 'Geschwindigkeit in x-Richtung'),
    steps: [
      st('a_x = \\dfrac{qE_x}{m} + g_x',
        tri('x 方向的加速度恒定。', 'The acceleration along x is constant.', 'Die Beschleunigung in x-Richtung ist konstant.'),
        B.n2, ['ax', 'q*Ex/m + gx'], { ax: 'm/s²' }),
      st('v_x = v_{0x} + \\left(\\dfrac{qE_x}{m} + g_x\\right)t',
        tri('代入匀变速直线运动的速度公式。', 'Use the velocity formula of uniformly accelerated motion.', 'Geschwindigkeit-Zeit-Gesetz einsetzen.'),
        B.uniformV, ['vx', 'vx0 + (q*Ex/m + gx)*t'], { vx: 'm/s' })
    ]
  },
  {
    formula: 'ce.vy',
    title: tri('y 方向的速度', 'Velocity along y', 'Geschwindigkeit in y-Richtung'),
    steps: [
      st('a_y = \\dfrac{qE_y}{m} + g_y',
        tri('y 方向的加速度恒定。', 'The acceleration along y is constant.', 'Die Beschleunigung in y-Richtung ist konstant.'),
        B.n2, ['ay', 'q*Ey/m + gy'], { ay: 'm/s²' }),
      st('v_y = v_{0y} + \\left(\\dfrac{qE_y}{m} + g_y\\right)t',
        tri('代入匀变速直线运动的速度公式。', 'Use the velocity formula of uniformly accelerated motion.', 'Geschwindigkeit-Zeit-Gesetz einsetzen.'),
        B.uniformV, ['vy', 'vy0 + (q*Ey/m + gy)*t'], { vy: 'm/s' })
    ]
  },
  {
    formula: 'ce.drift',
    title: tri('垂直射入时的侧移量', 'Sideways shift on entering at right angles', 'Seitliche Ablenkung bei senkrechtem Eintritt'),
    method: tri('类平抛：沿初速度匀速，沿电场匀加速', 'Like a projectile: uniform along the initial velocity, uniformly accelerated along the field', 'Wie beim waagerechten Wurf: gleichförmig längs der Anfangsgeschwindigkeit, gleichmäßig beschleunigt längs des Feldes'),
    steps: [
      st('a = \\dfrac{|q|E}{m}',
        tri('沿电场方向只受电场力，加速度恒定；垂直于电场的方向不受力，速度不变。',
          'Along the field only the electric force acts, so the acceleration is constant; across the field there is no force and the velocity stays the same.',
          'Längs des Feldes wirkt nur die elektrische Kraft, die Beschleunigung ist konstant; quer dazu wirkt keine Kraft, die Geschwindigkeit bleibt gleich.'),
        B.n2, ['a', 'abs(q)*E/m'], { a: 'm/s²' }),
      st('y = \\tfrac{1}{2}at^2 = \\dfrac{|q|E}{2m}t^2',
        tri('垂直射入，沿电场方向的初速度为零：侧移量就是初速度为零的匀加速运动的位移。',
          'Entering at right angles, the initial velocity along the field is zero: the shift is the displacement of uniformly accelerated motion from rest.',
          'Bei senkrechtem Eintritt ist die Anfangsgeschwindigkeit längs des Feldes null: Die Ablenkung ist der Weg einer gleichmäßig beschleunigten Bewegung aus der Ruhe.'),
        B.uniformX, ['y', 'abs(q)*E*t^2/(2*m)'], { y: 'm' })
    ]
  },
  {
    formula: 'ce.yL',
    title: tri('侧移量（用沿初速度方向的位移 L 表示）', 'Sideways shift in terms of the distance L along the initial velocity', 'Seitliche Ablenkung, ausgedrückt durch den Weg L längs der Anfangsgeschwindigkeit'),
    note: tri('平行板间 E = U/d，L 为板长时即离开电场时的侧移', 'Between parallel plates E = U/d; with L the plate length this is the shift on leaving the field', 'Zwischen parallelen Platten ist E = U/d; ist L die Plattenlänge, ist dies die Ablenkung beim Verlassen des Feldes'),
    steps: [
      st('t = \\dfrac{L}{v_0}',
        tri('沿初速度方向匀速运动，走过 L 所用的时间。',
          'Along the initial velocity the motion is uniform: the time to cover L.',
          'Längs der Anfangsgeschwindigkeit ist die Bewegung gleichförmig: die Zeit für den Weg L.'),
        tri('匀速直线运动 s = vt', 'Uniform motion, s = vt', 'Gleichförmige Bewegung, s = v·t'), ['tL', 'L/v0'], { tL: 's' }),
      st('y = \\dfrac{1}{2}\\cdot\\dfrac{|q|E}{m}\\left(\\dfrac{L}{v_0}\\right)^2 = \\dfrac{|q|EL^2}{2mv_0^2}',
        tri('代入侧移量 y = ½at²。', 'Substitute into the shift y = ½at².', 'In die Ablenkung y = ½·a·t² einsetzen.'),
        B.prev, ['y', 'abs(q)*E*L^2/(2*m*v0^2)'], { y: 'm' })
    ]
  },
  {
    formula: 'ce.tan',
    title: tri('偏转角的正切', 'Tangent of the deflection angle', 'Tangens des Ablenkwinkels'),
    steps: [
      st('v_\\perp = at = \\dfrac{|q|E}{m}\\cdot\\dfrac{L}{v_0}',
        tri('沿电场方向的分速度由零均匀增大，经过时间 L/v₀。',
          'The velocity component along the field grows uniformly from zero for the time L/v₀.',
          'Die Geschwindigkeitskomponente längs des Feldes wächst während der Zeit L/v₀ gleichmäßig von null an.'),
        B.uniformV, ['vp', 'abs(q)*E*L/(m*v0)'], { vp: 'm/s' }),
      st('\\tan\\theta = \\dfrac{v_\\perp}{v_0} = \\dfrac{|q|EL}{mv_0^2}',
        tri('偏转角是速度与初速度方向的夹角：两个分速度之比。',
          'The deflection angle is the angle between the velocity and the initial direction: the ratio of the two components.',
          'Der Ablenkwinkel ist der Winkel zwischen Geschwindigkeit und Anfangsrichtung: das Verhältnis der beiden Komponenten.'),
        tri('速度的合成与分解', 'Composition of velocities', 'Zerlegung der Geschwindigkeit'), ['tanth', 'abs(q)*E*L/(m*v0^2)'], { tanth: '' })
    ]
  },
  {
    formula: 'ce.W',
    title: tri('动能定理（电场力与重力做功）', 'Work–energy theorem (work of the electric force and gravity)', 'Arbeitssatz (Arbeit der elektrischen Kraft und der Schwerkraft)'),
    note: tri('匀强电场中电场力做功 W = qEd，d 为沿电场方向的位移', 'In a uniform field the electric force does W = qEd, d the displacement along the field', 'Im homogenen Feld verrichtet die elektrische Kraft W = q·E·d, d ist der Weg längs des Feldes'),
    steps: [
      st('W_E = q\\vec E\\cdot\\vec s = q(E_xs_x + E_ys_y)',
        tri('恒力做功等于力与位移的点积。', 'A constant force does work equal to the dot product of force and displacement.', 'Eine konstante Kraft verrichtet die Arbeit Kraft mal Verschiebung (Skalarprodukt).'),
        tri('恒力的功 W = F·s', 'Work of a constant force, W = F·s', 'Arbeit einer konstanten Kraft, W = F·s'), ['WE', 'q*(Ex*sx + Ey*sy)'], { WE: 'J' }),
      st('W_G = m\\vec g\\cdot\\vec s = m(g_xs_x + g_ys_y)',
        tri('重力做功同理。', 'Likewise the work of gravity.', 'Ebenso die Arbeit der Schwerkraft.'),
        tri('恒力的功 W = F·s', 'Work of a constant force, W = F·s', 'Arbeit einer konstanten Kraft, W = F·s'), ['WG', 'm*(gx*sx + gy*sy)'], { WG: 'J' }),
      st('\\Delta E_k = W_E + W_G = q\\vec E\\cdot\\vec s + m\\vec g\\cdot\\vec s',
        tri('只有这两个力做功，它们的功之和等于动能的增加。', 'Only these two forces do work; their total equals the gain in kinetic energy.', 'Nur diese beiden Kräfte verrichten Arbeit; ihre Summe ist der Zuwachs an kinetischer Energie.'),
        workEnergy, ['dEk', 'q*(Ex*sx + Ey*sy) + m*(gx*sx + gy*sy)'], { dEk: 'J' })
    ]
  },
  // ---- Charged body in a uniform magnetic field ----
  {
    formula: 'cb.F',
    title: tri('洛伦兹力', 'Lorentz force', 'Lorentzkraft'),
    note: tri('速度垂直于磁场', 'Velocity perpendicular to the field', 'Geschwindigkeit senkrecht zum Feld'),
    steps: [
      st('F = |q|vB\\sin 90^{\\circ} = |q|vB',
        tri('在纸面内运动的电荷，速度总与垂直纸面的磁场垂直，洛伦兹力取最大值 qvB。',
          'A charge moving in the plane always moves at right angles to a field perpendicular to the plane, so the Lorentz force has its largest value qvB.',
          'Eine Ladung in der Zeichenebene bewegt sich stets senkrecht zum Feld senkrecht zur Ebene; die Lorentzkraft hat ihren größten Wert q·v·B.'),
        lorentz, ['F', 'abs(q)*v*B'], { F: 'N' })
    ]
  },
  {
    formula: 'cb.r',
    title: tri('圆周运动的半径', 'Radius of the circular motion', 'Radius der Kreisbewegung'),
    method: tri('洛伦兹力提供向心力 |q|vB = mv²/r', 'The Lorentz force provides the centripetal force, |q|vB = mv²/r', 'Die Lorentzkraft liefert die Zentripetalkraft, |q|·v·B = m·v²/r'),
    steps: [
      st('|q|vB = \\dfrac{mv^2}{r}',
        tri('洛伦兹力始终垂直于速度，大小不变：粒子做匀速圆周运动，洛伦兹力就是向心力。',
          'The Lorentz force is always perpendicular to the velocity and of constant size: the particle moves uniformly on a circle and the Lorentz force is the centripetal force.',
          'Die Lorentzkraft steht stets senkrecht zur Geschwindigkeit und hat konstanten Betrag: Das Teilchen bewegt sich gleichförmig auf einem Kreis, die Lorentzkraft ist die Zentripetalkraft.'),
        centripetal, ['abs(q)*v*B', 'm*v^2/r'], { r: 'm' }),
      st('r = \\dfrac{mv}{|q|B}',
        tri('解出半径。', 'Solve for the radius.', 'Nach dem Radius auflösen.'),
        B.solve, ['r', 'm*v/(abs(q)*B)'], { r: 'm' })
    ]
  },
  {
    formula: 'cb.T',
    title: tri('圆周运动的周期', 'Period of the circular motion', 'Umlaufdauer der Kreisbewegung'),
    note: tri('周期与速度大小无关', 'The period does not depend on the speed', 'Die Umlaufdauer hängt nicht vom Geschwindigkeitsbetrag ab'),
    steps: [
      st('r = \\dfrac{mv}{|q|B}',
        tri('圆周运动的半径（上一条公式）。', 'The radius of the circle (previous formula).', 'Der Radius des Kreises (vorige Formel).'),
        centripetal, ['r', 'm*v/(abs(q)*B)'], { r: 'm' }),
      st('T = \\dfrac{2\\pi r}{v} = \\dfrac{2\\pi m}{|q|B}',
        tri('转一周的路程是周长，除以速率；v 被约去。', 'One turn covers the circumference; divide by the speed, which cancels.', 'Eine Umdrehung legt den Umfang zurück; durch den Geschwindigkeitsbetrag teilen, der sich herauskürzt.'),
        tri('匀速圆周运动 T = 2πr/v', 'Uniform circular motion, T = 2πr/v', 'Gleichförmige Kreisbewegung, T = 2πr/v'), ['T', '2*pi*m/(abs(q)*B)'], { T: 's' })
    ]
  },
  {
    formula: 'cb.v',
    title: tri('洛伦兹力不做功（速率不变）', 'The Lorentz force does no work (constant speed)', 'Die Lorentzkraft verrichtet keine Arbeit (konstanter Betrag)'),
    causes: [CAUSE_NUM],
    steps: [
      st('P = Fv\\cos 90^{\\circ} = 0',
        tri('洛伦兹力始终与速度垂直，功率为零。', 'The Lorentz force is always perpendicular to the velocity: its power is zero.', 'Die Lorentzkraft steht stets senkrecht zur Geschwindigkeit: Ihre Leistung ist null.'),
        lorentz, ['P', '0'], { P: 'W' }),
      st("\\Delta E_k = 0 \\;\\Rightarrow\\; v' = v",
        tri('没有力做功，动能不变，速率保持初值。', 'No force does work, so the kinetic energy and the speed stay at their initial values.', 'Keine Kraft verrichtet Arbeit; kinetische Energie und Geschwindigkeitsbetrag bleiben gleich.'),
        workEnergy, ['vp', 'v'], { vp: 'm/s' })
    ]
  },
  {
    formula: 'cb.P',
    title: tri('洛伦兹力的功率', 'Power of the Lorentz force', 'Leistung der Lorentzkraft'),
    note: tri('洛伦兹力始终垂直于速度', 'The Lorentz force is always perpendicular to the velocity', 'Die Lorentzkraft steht stets senkrecht zur Geschwindigkeit'),
    steps: [
      st('P = \\vec F\\cdot\\vec v = Fv\\cos 90^{\\circ} = 0',
        tri('功率是力与速度的点积；两者垂直，点积为零。', 'Power is the dot product of force and velocity; they are perpendicular, so it is zero.', 'Die Leistung ist das Skalarprodukt aus Kraft und Geschwindigkeit; beide stehen senkrecht, es ist null.'),
        tri('功率 P = F·v', 'Power, P = F·v', 'Leistung, P = F·v'), ['P', '0'], { P: 'W' })
    ]
  },
  // ---- Both fields ----
  {
    formula: 'sel.v',
    title: tri('速度选择器', 'Velocity selector', 'Geschwindigkeitsfilter'),
    method: tri('电场力与洛伦兹力平衡 qE = qvB', 'The electric force balances the Lorentz force, qE = qvB', 'Elektrische Kraft und Lorentzkraft heben sich auf, q·E = q·v·B'),
    steps: [
      st('|q|E = |q|vB',
        tri('匀速直线通过时合力为零：电场力与洛伦兹力大小相等、方向相反。',
          'Going straight at constant speed the net force is zero: the electric force and the Lorentz force are equal and opposite.',
          'Bei geradliniger gleichförmiger Bewegung ist die resultierende Kraft null: Elektrische Kraft und Lorentzkraft sind gleich groß und entgegengesetzt.'),
        tri('牛顿第一定律（合力为零）', "Newton's first law (zero net force)", 'Erstes Newtonsches Gesetz (resultierende Kraft null)'), ['abs(q)*E', 'abs(q)*v*B'], { v: 'm/s' }),
      st('v = \\dfrac{E}{B}',
        tri('电荷量约去：通过的速度与电荷量、质量都无关。', 'The charge cancels: the speed that passes depends neither on the charge nor on the mass.', 'Die Ladung kürzt sich heraus: Die durchgelassene Geschwindigkeit hängt weder von Ladung noch Masse ab.'),
        B.solve, ['v', 'E/B'], { v: 'm/s' })
    ]
  },
  {
    formula: 'sel.F',
    title: tri('洛伦兹力与电场力平衡', 'Lorentz force balances the electric force', 'Lorentzkraft und elektrische Kraft im Gleichgewicht'),
    steps: [
      st('F_E = |q|E',
        tri('电场力的大小。', 'Size of the electric force.', 'Betrag der elektrischen Kraft.'),
        field, ['FE', 'abs(q)*E'], { FE: 'N' }),
      st('F_B = F_E = |q|E',
        tri('匀速直线运动时两力平衡，洛伦兹力与电场力等大。', 'In uniform straight motion the two forces balance, so the Lorentz force equals the electric force.', 'Bei gleichförmiger geradliniger Bewegung heben sich die Kräfte auf; die Lorentzkraft ist so groß wie die elektrische Kraft.'),
        tri('二力平衡', 'Balance of two forces', 'Gleichgewicht zweier Kräfte'), ['FB', 'abs(q)*E'], { FB: 'N' })
    ]
  },
  {
    formula: 'ceb.W',
    title: tri('动能定理（洛伦兹力不做功）', 'Work–energy theorem (the Lorentz force does no work)', 'Arbeitssatz (die Lorentzkraft verrichtet keine Arbeit)'),
    causes: [CAUSE_NUM],
    steps: [
      st('W_B = 0',
        tri('洛伦兹力始终垂直于速度，不做功。', 'The Lorentz force is always perpendicular to the velocity and does no work.', 'Die Lorentzkraft steht stets senkrecht zur Geschwindigkeit und verrichtet keine Arbeit.'),
        lorentz, ['WB', '0'], { WB: 'J' }),
      st('\\Delta E_k = q\\vec E\\cdot\\vec s + m\\vec g\\cdot\\vec s',
        tri('只有电场力和重力做功（都是恒力，功只与位移有关）。', 'Only the electric force and gravity do work (both constant, so the work depends only on the displacement).', 'Nur elektrische Kraft und Schwerkraft verrichten Arbeit (beide konstant, die Arbeit hängt nur von der Verschiebung ab).'),
        workEnergy, ['dEk', 'q*(Ex*sx + Ey*sy) + m*(gx*sx + gy*sy)'], { dEk: 'J' })
    ]
  },
  {
    formula: 'ceb.P',
    title: tri('洛伦兹力的功率', 'Power of the Lorentz force', 'Leistung der Lorentzkraft'),
    steps: [
      st('P = \\vec F_B\\cdot\\vec v = 0',
        tri('不论粒子怎样运动，洛伦兹力总垂直于速度，功率为零。', 'However the particle moves, the Lorentz force is perpendicular to its velocity, so its power is zero.', 'Wie auch immer sich das Teilchen bewegt, die Lorentzkraft steht senkrecht zur Geschwindigkeit; ihre Leistung ist null.'),
        tri('功率 P = F·v', 'Power, P = F·v', 'Leistung, P = F·v'), ['P', '0'], { P: 'W' })
    ]
  },
  // ---- Coulomb force ----
  {
    formula: 'cl.F',
    title: tri('库仑定律', "Coulomb's law", 'Coulombsches Gesetz'),
    note: tri('r 取仿真中此刻的距离', 'r is the current distance in the simulation', 'r ist der aktuelle Abstand in der Simulation'),
    steps: [
      st('F = k\\dfrac{|q_1q_2|}{r^2}',
        tri('真空中两个点电荷之间的作用力与电荷量的乘积成正比，与距离的平方成反比，沿两者的连线。',
          'The force between two point charges in vacuum is proportional to the product of the charges and inversely proportional to the square of the distance, along the line joining them.',
          'Die Kraft zwischen zwei Punktladungen im Vakuum ist proportional zum Produkt der Ladungen und umgekehrt proportional zum Quadrat des Abstands, längs der Verbindungslinie.'),
        coulomb, ['F', 'k*abs(q1*q2)/r^2'], { F: 'N' })
    ]
  },
  {
    formula: 'cl.E',
    title: tri('能量守恒（动能与电势能）', 'Conservation of energy (kinetic and electric potential energy)', 'Energieerhaltung (kinetische und elektrische potentielle Energie)'),
    causes: [CAUSE_NUM],
    steps: [
      st('E_p = k\\dfrac{q_1q_2}{r}',
        tri('两个点电荷的电势能（以无穷远为零）：同种电荷为正，异种电荷为负。',
          'The electric potential energy of two point charges (zero at infinity): positive for like charges, negative for unlike ones.',
          'Die elektrische potentielle Energie zweier Punktladungen (null im Unendlichen): positiv bei gleichnamigen, negativ bei ungleichnamigen Ladungen.'),
        tri('点电荷的电势能', 'Potential energy of point charges', 'Potentielle Energie von Punktladungen'), ['Ep', 'k*q1*q2/r'], { Ep: 'J' }),
      st('E_k + k\\dfrac{q_1q_2}{r} = E_0',
        tri('库仑力是保守力，只有它做功时动能与电势能之和保持初值。',
          'The Coulomb force is conservative; when it alone does work, kinetic plus potential energy keeps its initial value.',
          'Die Coulombkraft ist konservativ; verrichtet nur sie Arbeit, bleibt die Summe aus kinetischer und potentieller Energie erhalten.'),
        energyCons, ['Esum', 'E0'], { Esum: 'J' })
    ]
  },
  {
    formula: 'cl.rmin',
    title: tri('正对射入时的最近距离', 'Closest approach in a head-on shot', 'Kleinster Abstand bei zentralem Stoß'),
    note: tri('从很远处射入时 r_min ≈ 2kq₁q₂/(mv₀²)', 'Shot from far away, r_min ≈ 2kq₁q₂/(mv₀²)', 'Aus großer Entfernung gilt r_min ≈ 2kq₁q₂/(m·v₀²)'),
    steps: [
      st('\\tfrac{1}{2}mv_0^2 + k\\dfrac{q_1q_2}{r_0} = k\\dfrac{q_1q_2}{r_{\\min}}',
        tri('正对固定电荷射入且相互排斥：粒子减速到零时最近，此时动能全部转化为电势能。',
          'Shot head-on at a fixed charge that repels it, the particle is closest when it stops: all its kinetic energy has become potential energy.',
          'Zentral auf eine feste, abstoßende Ladung geschossen, ist das Teilchen am nächsten, wenn es anhält: Seine ganze kinetische Energie ist potentielle Energie geworden.'),
        energyCons, ['m*v0^2/2 + k*q1*q2/r0', 'k*q1*q2/rmin'], { rmin: 'm' }),
      st('r_{\\min} = \\dfrac{kq_1q_2}{\\tfrac{1}{2}mv_0^2 + kq_1q_2/r_0}',
        tri('解出最近距离。', 'Solve for the closest distance.', 'Nach dem kleinsten Abstand auflösen.'),
        B.solve, ['rmin', 'k*q1*q2/(m*v0^2/2 + k*q1*q2/r0)'], { rmin: 'm' })
    ]
  }
]
