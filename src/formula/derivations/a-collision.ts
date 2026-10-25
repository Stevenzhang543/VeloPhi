/**
 * Derivations of the situation "collision": two free bodies collide centrally (manual 26.50, D28). Body 1
 * and 2 are numbered by scene order; u₁, u₂ (before) and v₁′, v₂′ (after) are velocity components along
 * the line of centres, positive from body 1 towards body 2; v₁ₜ is the tangential component of body 1.
 */
import type { Derivation, SharedSteps } from './types'
import { B, st, tri } from './a-common'

/** Shared steps of the collision situation. */
export const COLLISION_SHARED: SharedSteps[] = [
  {
    id: 'collision.momentum',
    title: tri('系统动量守恒', 'Conservation of the total momentum', 'Erhaltung des Gesamtimpulses'),
    steps: [
      st('\\vec F_{12} = -\\vec F_{21}',
        tri('碰撞时两物体间的相互作用力（弹力，以及可能有的摩擦力）是一对作用力与反作用力，任何时刻都等大反向。',
          'During the collision the forces between the bodies (the contact push and any friction) form an action–reaction pair: at every instant they are equal and opposite.',
          'Während des Stoßes bilden die Kräfte zwischen den Körpern (Druckkraft und gegebenenfalls Reibung) ein Wechselwirkungspaar: Sie sind in jedem Augenblick gleich groß und entgegengesetzt.'),
        B.n3, ['F12', 'F21'], { F12: 'N', F21: 'N' }),
      st("m_1\\vec v_1\\,' - m_1\\vec v_1 = -(m_2\\vec v_2\\,' - m_2\\vec v_2)",
        tri('两物体受到的冲量等大反向；碰撞时间极短，其他力（如重力）的冲量可以忽略。由动量定理，两物体的动量变化等大反向。',
          'The impulses on the two bodies are equal and opposite; the collision is so short that impulses of other forces (e.g. gravity) are negligible. By the impulse–momentum theorem the momentum changes are equal and opposite.',
          'Die Kraftstöße auf beide Körper sind gleich groß und entgegengesetzt; der Stoß ist so kurz, dass Kraftstöße anderer Kräfte (z. B. der Gewichtskraft) vernachlässigbar sind. Nach dem Impulssatz sind die Impulsänderungen gleich groß und entgegengesetzt.'),
        B.impulse, ['m1*v1p - m1*v1', '-(m2*v2p - m2*v2)'], { v1: 'm/s', v2: 'm/s', v1p: 'm/s', v2p: 'm/s' }),
      st("m_1\\vec v_1\\,' + m_2\\vec v_2\\,' = m_1\\vec v_1 + m_2\\vec v_2",
        tri('移项：碰后系统的总动量等于碰前的总动量。',
          'Rearranged: the total momentum after the collision equals the total momentum before.',
          'Umgestellt: Der Gesamtimpuls nach dem Stoß ist gleich dem Gesamtimpuls vor dem Stoß.'),
        B.momentum, ['m1*v1p + m2*v2p', 'm1*v1 + m2*v2'], { v1: 'm/s', v2: 'm/s', v1p: 'm/s', v2p: 'm/s' })
    ]
  },
  {
    id: 'collision.normal',
    title: tri('沿连心线：动量守恒与恢复系数', 'Along the line of centres: momentum and restitution', 'Längs der Stoßnormalen: Impulserhaltung und Stoßzahl'),
    steps: [
      st("m_1u_1 + m_2u_2 = m_1v_1' + m_2v_2'",
        tri('取从物体 1 指向物体 2 的连心线方向为正，u 表示碰前、v′ 表示碰后沿连心线的速度分量。碰撞时间极短，内力远大于外力，系统动量守恒，它沿连心线的分量也守恒。',
          'Take the line of centres, from body 1 towards body 2, as positive; u are the components before and v′ after the collision. The collision is short and the internal forces dominate, so the total momentum, and in particular its component along the line of centres, is conserved.',
          'Die Stoßnormale (Verbindungslinie der Mittelpunkte) zeigt positiv von Körper 1 zu Körper 2; u sind die Komponenten vor, v′ nach dem Stoß. Der Stoß ist kurz und die inneren Kräfte überwiegen, also bleibt der Gesamtimpuls und damit auch seine Komponente längs der Stoßnormalen erhalten.'),
        B.momentum, ['m1*u1 + m2*u2', 'm1*v1p + m2*v2p'], { v1p: 'm/s', v2p: 'm/s' }),
      st("v_2' - v_1' = e(u_1 - u_2)",
        tri('碰后两物体的分离速度等于碰前的接近速度乘恢复系数 e（e = 1 弹性碰撞，0 < e < 1 非弹性碰撞，e = 0 完全非弹性碰撞）。',
          'The speed of separation after the collision equals e times the speed of approach before it (e = 1 elastic, 0 < e < 1 inelastic, e = 0 perfectly inelastic).',
          'Die Trennungsgeschwindigkeit nach dem Stoß ist e-mal die Annäherungsgeschwindigkeit davor (e = 1 elastisch, 0 < e < 1 teilelastisch, e = 0 vollkommen unelastisch).'),
        B.restitution, ['v2p - v1p', 'e*(u1 - u2)'], { v1p: 'm/s', v2p: 'm/s' })
    ]
  }
]

/** Derivations of the collision formulas. */
export const COLLISION_DERIVATIONS: Derivation[] = [
  {
    formula: 'col.v1',
    title: tri('碰后物体 1 的速度（沿连心线）', 'Velocity of body 1 after the collision (along the line of centres)', 'Geschwindigkeit von Körper 1 nach dem Stoß (längs der Stoßnormalen)'),
    note: tri('u、v 为沿碰撞法线（连心线）的分量', 'u, v are components along the collision normal (line of centres)', 'u, v sind Komponenten längs der Stoßnormalen (Verbindungslinie der Mittelpunkte)'),
    uses: ['collision.normal'],
    steps: [
      st("v_2' = v_1' + e(u_1 - u_2)",
        tri('由恢复系数的关系式解出 v₂′。',
          'Solve the restitution relation for v₂′.',
          'Die Gleichung der Stoßzahl nach v₂′ auflösen.'),
        B.rearrange, ['v2p', 'v1p + e*(u1 - u2)'], { v1p: 'm/s', v2p: 'm/s' }),
      st("m_1u_1 + m_2u_2 = (m_1 + m_2)v_1' + e\\,m_2(u_1 - u_2)",
        tri('代入动量守恒式。',
          'Insert into the momentum equation.',
          'In die Impulsgleichung einsetzen.'),
        B.prev, ['m1*u1 + m2*u2', '(m1 + m2)*v1p + e*m2*(u1 - u2)'], { v1p: 'm/s' }),
      st("v_1' = \\dfrac{m_1u_1 + m_2u_2 - e\\,m_2(u_1 - u_2)}{m_1 + m_2}",
        tri('解出 v₁′。特例：e = 1 且 m₁ = m₂ 时两物体交换速度；e = 0 时 v₁′ = v₂′，为共同速度。',
          'Solve for v₁′. Special cases: for e = 1 and m₁ = m₂ the bodies exchange their velocities; for e = 0, v₁′ = v₂′ is the common velocity.',
          'Auflösen nach v₁′. Sonderfälle: Für e = 1 und m₁ = m₂ tauschen die Körper ihre Geschwindigkeiten; für e = 0 ist v₁′ = v₂′ die gemeinsame Geschwindigkeit.'),
        B.solve, ['v1p', '(m1*u1 + m2*u2 - e*m2*(u1 - u2))/(m1 + m2)'], { v1p: 'm/s' })
    ]
  },
  {
    formula: 'col.v2',
    title: tri('碰后物体 2 的速度（沿连心线）', 'Velocity of body 2 after the collision (along the line of centres)', 'Geschwindigkeit von Körper 2 nach dem Stoß (längs der Stoßnormalen)'),
    uses: ['collision.normal'],
    steps: [
      st("v_1' = v_2' - e(u_1 - u_2)",
        tri('由恢复系数的关系式解出 v₁′。',
          'Solve the restitution relation for v₁′.',
          'Die Gleichung der Stoßzahl nach v₁′ auflösen.'),
        B.rearrange, ['v1p', 'v2p - e*(u1 - u2)'], { v1p: 'm/s', v2p: 'm/s' }),
      st("m_1u_1 + m_2u_2 = (m_1 + m_2)v_2' - e\\,m_1(u_1 - u_2)",
        tri('代入动量守恒式。',
          'Insert into the momentum equation.',
          'In die Impulsgleichung einsetzen.'),
        B.prev, ['m1*u1 + m2*u2', '(m1 + m2)*v2p - e*m1*(u1 - u2)'], { v2p: 'm/s' }),
      st("v_2' = \\dfrac{m_1u_1 + m_2u_2 + e\\,m_1(u_1 - u_2)}{m_1 + m_2}",
        tri('解出 v₂′。特例：物体 2 碰前静止的弹性碰撞（u₂ = 0，e = 1）中 v₂′ = 2m₁u₁/(m₁ + m₂)。',
          'Solve for v₂′. Special case: elastic collision with body 2 initially at rest (u₂ = 0, e = 1) gives v₂′ = 2m₁u₁/(m₁ + m₂).',
          'Auflösen nach v₂′. Sonderfall: Beim elastischen Stoß mit ruhendem Körper 2 (u₂ = 0, e = 1) ist v₂′ = 2m₁u₁/(m₁ + m₂).'),
        B.solve, ['v2p', '(m1*u1 + m2*u2 + e*m1*(u1 - u2))/(m1 + m2)'], { v2p: 'm/s' })
    ]
  },
  {
    formula: 'col.px',
    title: tri('动量守恒（x 方向）', 'Conservation of momentum (x direction)', 'Impulserhaltung (x-Richtung)'),
    uses: ['collision.momentum'],
    steps: [
      st("m_1v_{1x}' + m_2v_{2x}' = m_1v_{1x} + m_2v_{2x}",
        tri('取动量守恒式的 x 分量。',
          'Take the x component of the conservation law.',
          'x-Komponente des Erhaltungssatzes bilden.'),
        tri('动量守恒定律（分量式）', 'Conservation of momentum (component form)', 'Impulserhaltungssatz (Komponentenform)'), ['m1*v1xp + m2*v2xp', 'm1*v1x + m2*v2x'], { v1x: 'm/s', v2x: 'm/s', v1xp: 'm/s', v2xp: 'm/s' }),
      st("p_x' = m_1v_{1x} + m_2v_{2x}",
        tri('碰后 x 方向的总动量 p_x′ 等于碰前 x 方向的总动量（右边为碰前速度）。',
          'The total x momentum p_x′ after the collision equals the total x momentum before it (velocities before the collision on the right).',
          'Der Gesamtimpuls p_x′ in x-Richtung nach dem Stoß ist gleich dem Gesamtimpuls in x-Richtung vor dem Stoß (rechts die Geschwindigkeiten vor dem Stoß).'),
        tri('动量的定义 p = mv', 'Definition of momentum, p = mv', 'Definition des Impulses, p = m·v'), ['pxp', 'p0x'], { pxp: 'kg·m/s' })
    ]
  },
  {
    formula: 'col.py',
    title: tri('动量守恒（y 方向）', 'Conservation of momentum (y direction)', 'Impulserhaltung (y-Richtung)'),
    uses: ['collision.momentum'],
    steps: [
      st("m_1v_{1y}' + m_2v_{2y}' = m_1v_{1y} + m_2v_{2y}",
        tri('取动量守恒式的 y 分量（斜碰时两物体在 y 方向也有速度分量）。',
          'Take the y component of the conservation law (in an oblique collision the bodies also have y components).',
          'y-Komponente des Erhaltungssatzes bilden (beim schiefen Stoß haben die Körper auch y-Komponenten).'),
        tri('动量守恒定律（分量式）', 'Conservation of momentum (component form)', 'Impulserhaltungssatz (Komponentenform)'), ['m1*v1yp + m2*v2yp', 'm1*v1y + m2*v2y'], { v1y: 'm/s', v2y: 'm/s', v1yp: 'm/s', v2yp: 'm/s' }),
      st("p_y' = m_1v_{1y} + m_2v_{2y}",
        tri('碰后 y 方向的总动量 p_y′ 等于碰前 y 方向的总动量（右边为碰前速度）。',
          'The total y momentum p_y′ after the collision equals the total y momentum before it (velocities before the collision on the right).',
          'Der Gesamtimpuls p_y′ in y-Richtung nach dem Stoß ist gleich dem Gesamtimpuls in y-Richtung vor dem Stoß (rechts die Geschwindigkeiten vor dem Stoß).'),
        tri('动量的定义 p = mv', 'Definition of momentum, p = mv', 'Definition des Impulses, p = m·v'), ['pyp', 'p0y'], { pyp: 'kg·m/s' })
    ]
  },
  {
    formula: 'col.dE',
    title: tri('碰撞损失的动能', 'Kinetic energy lost in the collision', 'Beim Stoß verlorene kinetische Energie'),
    note: tri('有摩擦冲量时动能损失更多', 'With a friction impulse more kinetic energy is lost', 'Mit Reibungskraftstoß geht mehr kinetische Energie verloren'),
    uses: ['collision.normal'],
    steps: [
      st("\\Delta E_k = \\left(\\tfrac12 m_1u_1^2 + \\tfrac12 m_2u_2^2\\right) - \\left(\\tfrac12 m_1{v_1'}^2 + \\tfrac12 m_2{v_2'}^2\\right)",
        tri('光滑物体间没有切向冲量，切向速度和切向动能都不变；动能的损失只来自沿连心线的分量。',
          'There is no tangential impulse between smooth bodies, so the tangential velocities and their kinetic energy do not change; the loss comes only from the components along the line of centres.',
          'Zwischen glatten Körpern gibt es keinen tangentialen Kraftstoß; tangentiale Geschwindigkeiten und ihre kinetische Energie ändern sich nicht. Der Verlust stammt nur aus den Komponenten längs der Stoßnormalen.'),
        tri('动能的定义；切向冲量为零', 'Definition of kinetic energy; zero tangential impulse', 'Definition der kinetischen Energie; kein tangentialer Kraftstoß'),
        ['dEk', 'm1*u1^2/2 + m2*u2^2/2 - (m1*v1p^2/2 + m2*v2p^2/2)'], { dEk: 'J', v1p: 'm/s', v2p: 'm/s' }),
      st("v_C = \\dfrac{m_1u_1 + m_2u_2}{m_1 + m_2} = \\dfrac{m_1v_1' + m_2v_2'}{m_1 + m_2}",
        tri('引入质心速度 v_C（也就是完全非弹性碰撞后的共同速度）；由动量守恒，碰撞前后 v_C 不变。',
          'Introduce the centre-of-mass velocity v_C (the common velocity after a perfectly inelastic collision); by conservation of momentum it is the same before and after.',
          'Wir führen die Schwerpunktgeschwindigkeit v_C ein (die gemeinsame Geschwindigkeit nach einem vollkommen unelastischen Stoß); wegen der Impulserhaltung ist sie vor und nach dem Stoß gleich.'),
        B.momentum, ['vC', '(m1*u1 + m2*u2)/(m1 + m2)'], { vC: 'm/s' }),
      st('\\tfrac12 m_1u_1^2 + \\tfrac12 m_2u_2^2 = \\tfrac12(m_1 + m_2)v_C^2 + \\dfrac{m_1m_2}{2(m_1 + m_2)}(u_1 - u_2)^2',
        tri('把碰前的动能拆成“质心运动的动能”与“相对运动的动能”两部分（展开右边即可验证）。',
          'Split the kinetic energy before the collision into that of the centre-of-mass motion and that of the relative motion (expand the right-hand side to verify).',
          'Die kinetische Energie vor dem Stoß wird in die Energie der Schwerpunktbewegung und die der Relativbewegung zerlegt (Ausmultiplizieren der rechten Seite bestätigt das).'),
        tri('代数恒等式', 'Algebraic identity', 'Algebraische Identität'),
        ['m1*u1^2/2 + m2*u2^2/2', '(m1 + m2)*vC^2/2 + m1*m2*(u1 - u2)^2/(2*(m1 + m2))'], { vC: 'm/s' }),
      st("\\tfrac12 m_1{v_1'}^2 + \\tfrac12 m_2{v_2'}^2 = \\tfrac12(m_1 + m_2)v_C^2 + \\dfrac{m_1m_2}{2(m_1 + m_2)}e^2(u_1 - u_2)^2",
        tri('碰后同样拆分：v_C 不变，相对速度变为 v₂′ − v₁′ = e(u₁ − u₂)。',
          'Split the energy after the collision in the same way: v_C is unchanged, the relative velocity is now v₂′ − v₁′ = e(u₁ − u₂).',
          'Nach dem Stoß ebenso zerlegen: v_C ist unverändert, die Relativgeschwindigkeit ist jetzt v₂′ − v₁′ = e(u₁ − u₂).'),
        B.restitution, ['m1*v1p^2/2 + m2*v2p^2/2', '(m1 + m2)*vC^2/2 + m1*m2*e^2*(u1 - u2)^2/(2*(m1 + m2))'], { vC: 'm/s', v1p: 'm/s', v2p: 'm/s' }),
      st('\\Delta E_k = \\dfrac{m_1m_2(1 - e^2)(u_1 - u_2)^2}{2(m_1 + m_2)}',
        tri('两式相减，质心运动的动能抵消。e = 1 时没有损失；e = 0 时损失最大，相对运动的动能全部损失。',
          'Subtract: the kinetic energy of the centre-of-mass motion cancels. For e = 1 nothing is lost; for e = 0 the loss is largest, all the energy of the relative motion.',
          'Subtrahieren: Die Energie der Schwerpunktbewegung hebt sich weg. Für e = 1 geht nichts verloren; für e = 0 ist der Verlust am größten, die gesamte Energie der Relativbewegung.'),
        B.prev, ['dEk', 'm1*m2*(1 - e^2)*(u1 - u2)^2/(2*(m1 + m2))'], { dEk: 'J' })
    ]
  },
  {
    formula: 'col.tangent',
    title: tri('光滑球切向速度不变', 'Tangential velocity of a smooth ball is unchanged', 'Tangentialgeschwindigkeit einer glatten Kugel bleibt gleich'),
    steps: [
      st('F_t = 0',
        tri('光滑物体间的弹力垂直于接触面，即沿连心线；切线方向没有力。',
          'Between smooth bodies the contact force is perpendicular to the contact surface, i.e. along the line of centres; there is no tangential force.',
          'Zwischen glatten Körpern steht die Kontaktkraft senkrecht auf der Berührfläche, wirkt also längs der Stoßnormalen; tangential wirkt keine Kraft.'),
        tri('光滑接触面的弹力垂直于接触面', 'The contact force of a smooth surface is normal to it', 'Die Kontaktkraft einer glatten Fläche steht senkrecht auf ihr'), ['Ft', '0'], { Ft: 'N' }),
      st("m_1v_{1t}' - m_1v_{1t} = F_t\\,\\Delta t = 0",
        tri('对物体 1 在切线方向用动量定理（碰撞时间极短，其他力的冲量忽略）。',
          'Apply the impulse–momentum theorem to body 1 in the tangential direction (the collision is short, impulses of other forces are negligible).',
          'Impulssatz für Körper 1 in tangentialer Richtung (der Stoß ist kurz, Kraftstöße anderer Kräfte sind vernachlässigbar).'),
        tri('动量定理（切线方向）', 'Impulse–momentum theorem (tangential direction)', 'Impulssatz (tangentiale Richtung)'), ['m1*v1tp - m1*w1', 'Ft*dt'], { v1tp: 'm/s', Ft: 'N', dt: 's' }),
      st("v_{1t}' = v_{1t}",
        tri('切向速度分量在碰撞前后不变。',
          'The tangential velocity component is the same before and after the collision.',
          'Die tangentiale Geschwindigkeitskomponente ist vor und nach dem Stoß gleich.'),
        B.solve, ['v1tp', 'w1'], { v1tp: 'm/s' })
    ]
  },
  {
    formula: 'col.angle',
    title: tri('等质量弹性斜碰：碰后速度互相垂直', 'Equal masses, elastic oblique collision: velocities after the collision are perpendicular', 'Gleiche Massen, elastischer schiefer Stoß: Geschwindigkeiten nach dem Stoß stehen senkrecht aufeinander'),
    uses: ['collision.momentum'],
    steps: [
      st("\\vec v_1 = \\vec v_1\\,' + \\vec v_2\\,'",
        tri('质量相等（m₁ = m₂）、物体 2 碰前静止，动量守恒式两边约去 m。',
          'Equal masses (m₁ = m₂) and body 2 at rest before the collision: cancel m in the momentum equation.',
          'Gleiche Massen (m₁ = m₂), Körper 2 vor dem Stoß in Ruhe: m in der Impulsgleichung kürzen.'),
        B.momentum, ['v1', 'v1p + v2p'], { v1: 'm/s', v1p: 'm/s', v2p: 'm/s' }),
      st("v_1^2 = {v_1'}^2 + {v_2'}^2",
        tri('弹性碰撞（e = 1）且无摩擦，系统动能守恒，约去 ½m。',
          'The collision is elastic (e = 1) and frictionless, so kinetic energy is conserved; cancel ½m.',
          'Der Stoß ist elastisch (e = 1) und reibungsfrei, die kinetische Energie bleibt erhalten; ½m kürzen.'),
        tri('弹性碰撞中动能守恒', 'Kinetic energy is conserved in an elastic collision', 'Beim elastischen Stoß bleibt die kinetische Energie erhalten'), ['v1^2', 'v1p^2 + v2p^2'], { v1: 'm/s', v1p: 'm/s', v2p: 'm/s' }),
      st("v_1^2 = {v_1'}^2 + {v_2'}^2 + 2\\,\\vec v_1\\,'\\cdot\\vec v_2\\,'",
        tri('把第一式两边平方（与自身作数量积）。',
          'Square the first equation (scalar product with itself).',
          'Die erste Gleichung quadrieren (Skalarprodukt mit sich selbst).'),
        tri('矢量的数量积', 'Scalar product of vectors', 'Skalarprodukt von Vektoren'), ['v1^2', 'v1p^2 + v2p^2 + 2*v1p*v2p*cos(phi)'], { v1: 'm/s', v1p: 'm/s', v2p: 'm/s', phi: 'rad' }),
      st("\\vec v_1\\,'\\cdot\\vec v_2\\,' = 0",
        tri('与第二式比较，两速度的数量积为零。',
          'Comparing with the second equation, the scalar product of the two velocities is zero.',
          'Vergleich mit der zweiten Gleichung: Das Skalarprodukt der beiden Geschwindigkeiten ist null.'),
        B.prev, ['v1p*v2p*cos(phi)', '0'], { v1p: 'm/s', v2p: 'm/s', phi: 'rad' }),
      st("\\angle(\\vec v_1\\,', \\vec v_2\\,') = \\dfrac{\\pi}{2}",
        tri('斜碰时碰后两物体都在运动，速度都不为零，所以它们互相垂直（正碰时物体 1 停下，两物体交换速度）。',
          'In an oblique collision both bodies move afterwards, so neither velocity is zero and they are perpendicular (in a head-on collision body 1 stops and the bodies exchange velocities).',
          'Beim schiefen Stoß bewegen sich danach beide Körper, keine Geschwindigkeit ist null, also stehen sie senkrecht aufeinander (beim geraden Stoß bleibt Körper 1 stehen, die Körper tauschen ihre Geschwindigkeiten).'),
        tri('数量积为零 ⇔ 两矢量垂直', 'Zero scalar product ⇔ perpendicular vectors', 'Skalarprodukt null ⇔ Vektoren senkrecht'), ['phi', 'pi/2'], { phi: 'rad' })
    ]
  }
]
