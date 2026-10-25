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
  }
]
