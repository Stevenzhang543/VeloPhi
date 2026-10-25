/**
 * Derivations of the situation "projectile": free flight under gravity, air resistance neglected (manual
 * 26.50, D28). x is horizontal, y vertical and upwards; x₀, y₀, v₀ₓ, v₀y are the position and velocity of
 * the centre at the start of the flight, y₁ the height of the centre at landing; t counts from the start.
 */
import type { Derivation, SharedSteps } from './types'
import { B, st, tri } from './a-common'

/** Shared steps of the projectile situation. */
export const PROJECTILE_SHARED: SharedSteps[] = [
  {
    id: 'projectile.axes',
    title: tri('运动的分解', 'Resolving the motion', 'Zerlegung der Bewegung'),
    steps: [
      st('ma_x = 0',
        tri('抛出后物体只受重力（忽略空气阻力）。取水平方向为 x 轴、竖直向上为 y 轴：水平方向不受力。',
          'After launch the only force is gravity (air resistance neglected). Take x horizontal and y vertically upwards: there is no horizontal force.',
          'Nach dem Abwurf wirkt nur die Gewichtskraft (Luftwiderstand vernachlässigt). x-Achse waagerecht, y-Achse senkrecht nach oben: Waagerecht wirkt keine Kraft.'),
        B.n2Horizontal, ['m*ax', '0'], { m: 'kg', ax: 'm/s²' }),
      st('ma_y = -mg',
        tri('竖直方向只受重力，方向竖直向下。',
          'Vertically the only force is the weight, pointing down.',
          'Senkrecht wirkt nur die Gewichtskraft, nach unten gerichtet.'),
        tri('牛顿第二定律（竖直方向）', "Newton's second law in the vertical direction", 'Zweites Newtonsches Gesetz in senkrechter Richtung'), ['m*ay', '-m*g'], { m: 'kg', ay: 'm/s²' }),
      st('\\vec a = \\vec g',
        tri('加速度恒为 g、竖直向下：水平方向的分运动是匀速直线运动，竖直方向的分运动是加速度为 −g 的匀变速直线运动。',
          'The acceleration is constant, g downwards: the horizontal component of the motion is uniform, the vertical one uniformly accelerated with −g.',
          'Die Beschleunigung ist konstant g nach unten: Die waagerechte Teilbewegung ist gleichförmig, die senkrechte gleichmäßig beschleunigt mit −g.'),
        tri('运动的合成与分解（两个分运动互不影响）', 'Superposition of motions (the components are independent)', 'Überlagerung von Bewegungen (Unabhängigkeitsprinzip)'), ['a', 'g'], { a: 'm/s²' })
    ]
  }
]

/** Derivations of the projectile formulas. */
export const PROJECTILE_DERIVATIONS: Derivation[] = [
  {
    formula: 'pr.x',
    title: tri('水平位置', 'Horizontal position', 'Waagerechte Position'),
    uses: ['projectile.axes'],
    steps: [
      st('v_x = v_{0x}',
        tri('水平方向加速度为零，水平速度保持初值。',
          'The horizontal acceleration is zero, so the horizontal velocity keeps its initial value.',
          'Die waagerechte Beschleunigung ist null; die waagerechte Geschwindigkeit behält ihren Anfangswert.'),
        tri('匀速直线运动', 'Uniform motion', 'Gleichförmige Bewegung'), ['vx', 'vx0'], { vx: 'm/s' }),
      st('x = x_0 + v_{0x}t',
        tri('水平方向做匀速直线运动，t 从本阶段开始计时。',
          'The horizontal motion is uniform; t is counted from the start of this phase.',
          'Die waagerechte Bewegung ist gleichförmig; t wird ab Beginn dieses Abschnitts gezählt.'),
        B.uniformMotion, ['x', 'x0 + vx0*t'], { x: 'm' })
    ]
  },
  {
    formula: 'pr.y',
    title: tri('竖直位置', 'Vertical position', 'Senkrechte Position'),
    uses: ['projectile.axes'],
    steps: [
      st('y = y_0 + v_{0y}t + \\tfrac12 a_yt^2',
        tri('竖直方向做匀变速直线运动（竖直上抛、下抛或平抛的竖直分运动）。',
          'The vertical motion is uniformly accelerated (as in a vertical throw, or the vertical part of a horizontal throw).',
          'Die senkrechte Bewegung ist gleichmäßig beschleunigt (wie beim senkrechten Wurf bzw. als senkrechte Teilbewegung des waagerechten Wurfs).'),
        B.uniformX, ['y', 'y0 + vy0*t + ay*t^2/2'], { y: 'm', ay: 'm/s²' }),
      st('y = y_0 + v_{0y}t - \\tfrac{1}{2}gt^2',
        tri('代入 a_y = −g（竖直向上为正）。',
          'Insert a_y = −g (upwards positive).',
          'Einsetzen von a_y = −g (nach oben positiv).'),
        B.prev, ['y', 'y0 + vy0*t - g*t^2/2'], { y: 'm' })
    ]
  },
  {
    formula: 'pr.vx',
    title: tri('水平速度不变', 'Horizontal velocity is constant', 'Waagerechte Geschwindigkeit bleibt konstant'),
    uses: ['projectile.axes'],
    steps: [
      st('\\Delta v_x = a_x t = 0',
        tri('水平方向加速度为零，水平速度不变化。',
          'The horizontal acceleration is zero, so the horizontal velocity does not change.',
          'Die waagerechte Beschleunigung ist null; die waagerechte Geschwindigkeit ändert sich nicht.'),
        B.accDef, ['dvx', 'ax*t'], { dvx: 'm/s', ax: 'm/s²' }),
      st('v_x = v_{0x}',
        tri('水平速度始终等于抛出时的水平分速度。',
          'The horizontal velocity always equals the horizontal component of the launch velocity.',
          'Die waagerechte Geschwindigkeit ist stets gleich der waagerechten Komponente der Abwurfgeschwindigkeit.'),
        B.prev, ['vx', 'vx0'], { vx: 'm/s' })
    ]
  },
  {
    formula: 'pr.vy',
    title: tri('竖直速度', 'Vertical velocity', 'Senkrechte Geschwindigkeit'),
    uses: ['projectile.axes'],
    steps: [
      st('v_y = v_{0y} + a_yt',
        tri('竖直方向做匀变速直线运动。',
          'The vertical motion is uniformly accelerated.',
          'Die senkrechte Bewegung ist gleichmäßig beschleunigt.'),
        B.uniformV, ['vy', 'vy0 + ay*t'], { vy: 'm/s', ay: 'm/s²' }),
      st('v_y = v_{0y} - gt',
        tri('代入 a_y = −g（竖直向上为正）。v_y 先减小到零（最高点）再反向增大。',
          'Insert a_y = −g (upwards positive). v_y first decreases to zero (highest point) and then grows in the opposite direction.',
          'Einsetzen von a_y = −g (nach oben positiv). v_y nimmt zunächst bis null ab (höchster Punkt) und wächst dann in Gegenrichtung.'),
        B.prev, ['vy', 'vy0 - g*t'], { vy: 'm/s' })
    ]
  },
  {
    formula: 'pr.T',
    title: tri('飞行时间（落到 y₁ 高度）', 'Time of flight (down to the height y₁)', 'Flugzeit (bis zur Höhe y₁)'),
    uses: ['projectile.axes'],
    steps: [
      st('y = y_0 + v_{0y}t - \\tfrac12 gt^2',
        tri('竖直位置随时间的变化（见竖直位置）。',
          'Vertical position as a function of time (see the vertical position).',
          'Senkrechte Position in Abhängigkeit von der Zeit (siehe senkrechte Position).'),
        B.uniformX, ['y', 'y0 + vy0*t - g*t^2/2'], { y: 'm' }),
      st('y_0 + v_{0y}T - \\tfrac12 gT^2 = y_1',
        tri('落地时刻 T，物体（质心）的高度为 y₁。',
          'At the landing time T the centre of the body is at the height y₁.',
          'Zur Landezeit T befindet sich der Schwerpunkt des Körpers in der Höhe y₁.'),
        tri('落地条件', 'Landing condition', 'Landebedingung'), ['y0 + vy0*T - g*T^2/2', 'y1'], { T: 's' }),
      st('\\tfrac12 gT^2 - v_{0y}T - (y_0 - y_1) = 0',
        tri('整理成关于 T 的一元二次方程。',
          'Rewrite as a quadratic equation in T.',
          'Umformen in eine quadratische Gleichung für T.'),
        B.algebra, ['g*T^2/2 - vy0*T - (y0 - y1)', '0'], { T: 's' }),
      st('T = \\dfrac{v_{0y} + \\sqrt{v_{0y}^2 + 2g(y_0 - y_1)}}{g}',
        tri('用求根公式，取较大的根，即下落时经过 y₁ 的时刻（y₀ ≥ y₁ 时另一个根不为正）。平抛（v₀y = 0）时 T = √(2(y₀ − y₁)/g)。',
          'Use the quadratic formula and take the larger root, the time when the body passes y₁ on the way down (for y₀ ≥ y₁ the other root is not positive). For a horizontal throw (v₀y = 0), T = √(2(y₀ − y₁)/g).',
          'Lösungsformel anwenden und die größere Lösung nehmen, den Zeitpunkt, zu dem der Körper y₁ im Fallen passiert (für y₀ ≥ y₁ ist die andere Lösung nicht positiv). Beim waagerechten Wurf (v₀y = 0) ist T = √(2(y₀ − y₁)/g).'),
        B.quadratic, ['T', '(vy0 + sqrt(vy0^2 + 2*g*(y0 - y1)))/g'], { T: 's' })
    ]
  },
  {
    formula: 'pr.R',
    title: tri('水平射程', 'Horizontal range', 'Wurfweite'),
    uses: ['projectile.axes'],
    steps: [
      st('x - x_0 = v_{0x}t',
        tri('水平方向做匀速直线运动。',
          'The horizontal motion is uniform.',
          'Die waagerechte Bewegung ist gleichförmig.'),
        B.uniformMotion, ['dx', 'vx0*t'], { dx: 'm' }),
      st('T = \\dfrac{v_{0y} + \\sqrt{v_{0y}^2 + 2g(y_0 - y_1)}}{g}',
        tri('飞行时间由竖直分运动决定（见飞行时间）。',
          'The time of flight is set by the vertical motion (see the time of flight).',
          'Die Flugzeit wird durch die senkrechte Teilbewegung bestimmt (siehe Flugzeit).'),
        B.earlier, ['T', '(vy0 + sqrt(vy0^2 + 2*g*(y0 - y1)))/g'], { T: 's' }),
      st('R = v_{0x}T = \\dfrac{v_{0x}\\left(v_{0y} + \\sqrt{v_{0y}^2 + 2g(y_0 - y_1)}\\right)}{g}',
        tri('射程是飞行时间 T 内的水平位移；代入 T。R 带正负号（沿 x 轴正方向为正）。',
          'The range is the horizontal displacement during the time of flight T; insert T. R carries a sign (positive along +x).',
          'Die Wurfweite ist die waagerechte Verschiebung während der Flugzeit T; T einsetzen. R ist vorzeichenbehaftet (positiv in +x-Richtung).'),
        B.prev, ['R', 'vx0*(vy0 + sqrt(vy0^2 + 2*g*(y0 - y1)))/g'], { R: 'm' })
    ]
  },
  {
    formula: 'pr.H',
    title: tri('最高点高度', 'Height of the highest point', 'Höhe des höchsten Punktes'),
    uses: ['projectile.axes'],
    steps: [
      st('v_y = 0',
        tri('到达最高点时竖直分速度为零，只剩水平速度。',
          'At the highest point the vertical velocity is zero; only the horizontal velocity remains.',
          'Im höchsten Punkt ist die senkrechte Geschwindigkeit null; es bleibt nur die waagerechte.'),
        tri('最高点的条件', 'Condition at the highest point', 'Bedingung im höchsten Punkt'), ['vy', '0'], { vy: 'm/s' }),
      st('0 - v_{0y}^2 = -2g(H - y_0)',
        tri('竖直方向用速度—位移关系（a_y = −g），从抛出点到最高点。',
          'Use the velocity–displacement relation vertically (a_y = −g), from the launch point to the highest point.',
          'Senkrecht die zeitfreie Gleichung anwenden (a_y = −g), vom Abwurfpunkt bis zum höchsten Punkt.'),
        B.uniformVX, ['-vy0^2', '-2*g*(H - y0)'], { H: 'm' }),
      st('H = y_0 + \\dfrac{v_{0y}^2}{2g}',
        tri('解出最高点（质心）的高度。',
          'Solve for the height of the highest point (of the centre).',
          'Auflösen nach der Höhe des höchsten Punktes (des Schwerpunkts).'),
        B.solve, ['H', 'y0 + vy0^2/(2*g)'], { H: 'm' })
    ]
  },
  // ---- 26.51: free fall and conservation of mechanical energy (D44) ----
  {
    formula: 'ff.v',
    title: tri('自由落体的速度', 'Speed in free fall', 'Geschwindigkeit beim freien Fall'),
    uses: ['projectile.axes'],
    steps: [
      st('v_0 = 0',
        tri('物体由静止释放：初速度为零，只受重力。这样的运动叫自由落体运动。',
          'The body is released from rest: zero initial velocity, gravity the only force. This motion is called free fall.',
          'Der Körper wird aus der Ruhe losgelassen: Anfangsgeschwindigkeit null, nur die Gewichtskraft wirkt. Diese Bewegung heißt freier Fall.'),
        tri('自由落体的条件', 'Condition of free fall', 'Bedingung des freien Falls'), ['sqrt(vx0^2 + vy0^2)', '0']),
      st('v = gt',
        tri('取竖直向下为正：自由落体是初速度为零、加速度为 g 的匀加速直线运动，由 v = v₀ + at 得 v = gt。',
          'Take downwards as positive: free fall is uniformly accelerated motion from rest with acceleration g, so v = v₀ + at gives v = gt.',
          'Nach unten positiv: Der freie Fall ist eine gleichmäßig beschleunigte Bewegung aus der Ruhe mit der Beschleunigung g; aus v = v₀ + a·t folgt v = g·t.'),
        B.uniformV, ['v', 'g*t'], { v: 'm/s' })
    ]
  },
  {
    formula: 'ff.h',
    title: tri('自由落体的下落高度', 'Height fallen in free fall', 'Fallhöhe beim freien Fall'),
    uses: ['projectile.axes'],
    steps: [
      st('v_0 = 0',
        tri('由静止释放，初速度为零。',
          'Released from rest: the initial velocity is zero.',
          'Aus der Ruhe losgelassen: Die Anfangsgeschwindigkeit ist null.'),
        tri('自由落体的条件', 'Condition of free fall', 'Bedingung des freien Falls'), ['sqrt(vx0^2 + vy0^2)', '0']),
      st('h = \\tfrac{1}{2}gt^2',
        tri('取竖直向下为正，由 x = v₀t + ½at²（v₀ = 0，a = g）得下落的高度。下落高度与时间的平方成正比：1 s、2 s、3 s 内下落高度之比为 1 : 4 : 9。',
          'With downwards positive, x = v₀t + ½at² (v₀ = 0, a = g) gives the height fallen. It grows with the square of the time: in 1 s, 2 s and 3 s the body falls distances in the ratio 1 : 4 : 9.',
          'Nach unten positiv folgt aus x = v₀·t + ½·a·t² (v₀ = 0, a = g) die Fallhöhe. Sie wächst mit dem Quadrat der Zeit: In 1 s, 2 s und 3 s fällt der Körper Strecken im Verhältnis 1 : 4 : 9.'),
        B.uniformX, ['h', 'g*t^2/2'])
    ]
  },
  {
    formula: 'ff.v2',
    title: tri('下落 h 时的速度', 'Speed after falling a height h', 'Geschwindigkeit nach der Fallhöhe h'),
    note: tri('h 取仿真中已下落的高度', 'h is the height fallen so far in the simulation', 'h ist die bisher in der Simulation durchfallene Höhe'),
    uses: ['projectile.axes'],
    steps: [
      st('v_0 = 0',
        tri('由静止释放，初速度为零。',
          'Released from rest: the initial velocity is zero.',
          'Aus der Ruhe losgelassen: Die Anfangsgeschwindigkeit ist null.'),
        tri('自由落体的条件', 'Condition of free fall', 'Bedingung des freien Falls'), ['sqrt(vx0^2 + vy0^2)', '0']),
      st('v^2 = 2gh',
        tri('取竖直向下为正，用速度—位移关系 v² − v₀² = 2ax（a = g，x = h）。也可以用机械能守恒：mgh = ½mv²。',
          'With downwards positive, use the velocity–displacement relation v² − v₀² = 2ax (a = g, x = h). Conservation of energy gives the same: mgh = ½mv².',
          'Nach unten positiv die zeitfreie Gleichung v² − v₀² = 2·a·x verwenden (a = g, x = h). Die Energieerhaltung liefert dasselbe: m·g·h = ½·m·v².'),
        B.uniformVX, ['v^2', '2*g*h'], { v: 'm/s' }),
      st('v = \\sqrt{2gh}',
        tri('取正根得速率。',
          'Take the positive root for the speed.',
          'Für den Betrag der Geschwindigkeit die positive Wurzel nehmen.'),
        B.solve, ['v', 'sqrt(2*g*h)'], { v: 'm/s' })
    ]
  },
  {
    formula: 'pr.E',
    title: tri('机械能守恒', 'Conservation of mechanical energy', 'Erhaltung der mechanischen Energie'),
    note: tri('只有重力做功', 'Only gravity does work', 'Nur die Gewichtskraft verrichtet Arbeit'),
    steps: [
      st('W_G = mg(y_0 - y)',
        tri('重力做的功只与起点和终点的高度差有关，与路径无关；物体下降时重力做正功。',
          'The work done by gravity depends only on the difference in height between start and end, not on the path; it is positive while the body descends.',
          'Die Arbeit der Gewichtskraft hängt nur vom Höhenunterschied zwischen Anfang und Ende ab, nicht vom Weg; sie ist positiv, während der Körper sinkt.'),
        tri('重力做功的特点', 'Work done by gravity', 'Arbeit der Gewichtskraft'), ['WG', 'm*g*(y0 - y)'], { WG: 'J' }),
      st('\\tfrac{1}{2}mv^2 - \\tfrac{1}{2}mv_0^2 = mg(y_0 - y)',
        tri('飞行中只有重力做功，由动能定理，动能的增加等于重力做的功。',
          'In flight only gravity does work; by the work–energy theorem the gain in kinetic energy equals this work.',
          'Im Flug verrichtet nur die Gewichtskraft Arbeit; nach dem Arbeitssatz ist der Zuwachs an kinetischer Energie gleich dieser Arbeit.'),
        tri('动能定理', 'Work–energy theorem', 'Arbeitssatz (Energiesatz der Mechanik)'), ['m*v^2/2 - m*(vx0^2 + vy0^2)/2', 'm*g*(y0 - y)'], { v: 'm/s' }),
      st('E = \\tfrac{1}{2}mv^2 + mgy = \\tfrac{1}{2}mv_0^2 + mgy_0',
        tri('移项：动能与重力势能之和（机械能）保持不变。v₀² = v₀ₓ² + v₀y²。',
          'Rearranged: the sum of kinetic and gravitational potential energy (the mechanical energy) stays constant. v₀² = v₀ₓ² + v₀y².',
          'Umgestellt: Die Summe aus kinetischer und potentieller Energie (die mechanische Energie) bleibt konstant. v₀² = v₀ₓ² + v₀y².'),
        B.rearrange, ['E', 'm*(vx0^2 + vy0^2)/2 + m*g*y0'], { E: 'J' })
    ]
  },
  {
    formula: 'pr.v',
    title: tri('由机械能守恒求速率', 'Speed from conservation of energy', 'Geschwindigkeit aus der Energieerhaltung'),
    note: tri('y 取仿真中此刻的高度', 'y is the height at this moment in the simulation', 'y ist die momentane Höhe in der Simulation'),
    steps: [
      st('\\tfrac{1}{2}mv^2 + mgy = \\tfrac{1}{2}mv_0^2 + mgy_0',
        tri('只有重力做功，机械能守恒：任一时刻的动能与重力势能之和等于抛出时的值。',
          'Only gravity does work, so mechanical energy is conserved: at every moment kinetic plus potential energy equals its value at launch.',
          'Nur die Gewichtskraft verrichtet Arbeit, also bleibt die mechanische Energie erhalten: Zu jedem Zeitpunkt ist kinetische plus potentielle Energie gleich ihrem Wert beim Abwurf.'),
        tri('机械能守恒定律', 'Conservation of mechanical energy', 'Energieerhaltungssatz der Mechanik'), ['m*v^2/2 + m*g*y', 'm*(vx0^2 + vy0^2)/2 + m*g*y0'], { v: 'm/s' }),
      st('v = \\sqrt{v_0^2 + 2g(y_0 - y)}',
        tri('两边约去 m，解出速率；它与质量和抛出方向无关，只取决于初速率和下降的高度。',
          'Cancel m and solve for the speed; it depends neither on the mass nor on the direction of launch, only on the initial speed and the height descended.',
          'm kürzen und nach dem Betrag der Geschwindigkeit auflösen; er hängt weder von der Masse noch von der Abwurfrichtung ab, nur von der Anfangsgeschwindigkeit und der Fallhöhe.'),
        B.solve, ['v', 'sqrt(vx0^2 + vy0^2 + 2*g*(y0 - y))'], { v: 'm/s' })
    ]
  }
]
