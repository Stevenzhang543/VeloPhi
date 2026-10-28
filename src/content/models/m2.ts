/**
 * M17–M32: collisions, rotation, rolling, circular motion, gravitation, drag, variable forces, elasticity,
 * Lagrange and Hamilton (blueprint §5.2; doc 02 §2).
 */
import type { ModelSpec } from './types'
import { A, L, T, angle, cond, deg, inp, let_, nonneg, out, pos } from './dsl'

const R2 = { physics: '2026-10-28', language: '2026-10-28' }
const m1 = pos('m1', 'm_1', T('物体 1 的质量', 'Mass of body 1', 'Masse von Körper 1'), 'kg', 'mass', 1)
const m2 = pos('m2', 'm_2', T('物体 2 的质量', 'Mass of body 2', 'Masse von Körper 2'), 'kg', 'mass', 2)
const u1 = inp('u1', 'u_1', T('物体 1 碰前速度', 'Velocity of body 1 before', 'Geschwindigkeit von Körper 1 vorher'), 'm/s', 'velocity', 3)
const u2 = inp('u2', 'u_2', T('物体 2 碰前速度', 'Velocity of body 2 before', 'Geschwindigkeit von Körper 2 vorher'), 'm/s', 'velocity', 0)

export const MODELS_M2: ModelSpec[] = [
  {
    id: 'M17', title: T('一维弹性碰撞', 'Elastic collision in one dimension', 'Elastischer gerader Stoß'),
    stages: ['s'], priority: 'P1', geometry: 'point',
    assumptions: [T('正碰，完全弹性，系统不受外力冲量', 'Head-on, perfectly elastic, no external impulse', 'Gerade, vollkommen elastisch, kein äußerer Kraftstoß')],
    validity: T('两物体相互接近（u1 > u2）', 'The bodies approach each other (u1 > u2)', 'Die Körper nähern sich (u1 > u2)'),
    sources: ['S14'],
    inputs: [m1, m2, u1, u2],
    conditions: [cond('approach', T('两物体相互接近', 'The bodies approach', 'Die Körper nähern sich'), 'u1 > u2')],
    outputs: [
      out('v1', "v_1", T('物体 1 碰后速度', 'Velocity of body 1 after', 'Geschwindigkeit von Körper 1 nachher'), 'm/s', '((m1 - m2)*u1 + 2*m2*u2)/(m1 + m2)', { requires: ['approach'] }),
      out('v2', "v_2", T('物体 2 碰后速度', 'Velocity of body 2 after', 'Geschwindigkeit von Körper 2 nachher'), 'm/s', '((m2 - m1)*u2 + 2*m1*u1)/(m1 + m2)', { requires: ['approach'] }),
      out('p', 'p', T('总动量', 'Total momentum', 'Gesamtimpuls'), 'kg·m/s', 'm1*u1 + m2*u2'),
      out('Ek', 'E_k', T('总动能（碰前 = 碰后）', 'Total kinetic energy (before = after)', 'Gesamte kinetische Energie (vorher = nachher)'), 'J', 'm1*u1^2/2 + m2*u2^2/2')
    ],
    example: { text: T('m1 = 1 kg 以 3 m/s 碰向静止的 m2 = 2 kg，正碰完全弹性。', 'm1 = 1 kg at 3 m/s hits a resting m2 = 2 kg head-on, perfectly elastic.', 'm1 = 1 kg mit 3 m/s stößt gerade und vollkommen elastisch auf ruhende m2 = 2 kg.'), answer: T('v1 = −1 m/s，v2 = 2 m/s；总动能仍为 4.5 J。', 'v1 = −1 m/s, v2 = 2 m/s; the kinetic energy stays 4.5 J.', 'v1 = −1 m/s, v2 = 2 m/s; die kinetische Energie bleibt 4,5 J.') },
    point: T('守恒定律用于同一封闭系统；恢复系数不是额外的能量来源。', 'Conservation laws apply to one closed system; restitution is no extra source of energy.', 'Erhaltungssätze gelten für ein abgeschlossenes System; die Stoßzahl ist keine zusätzliche Energiequelle.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M17', 'test:acceptance 4 collisions'],
    links: { situations: ['collision'], topics: ['momentum'] }, review: R2
  },
  {
    id: 'M18', title: T('完全非弹性碰撞', 'Perfectly inelastic collision', 'Vollkommen unelastischer Stoß'),
    stages: ['s'], priority: 'P1', geometry: 'point',
    assumptions: [T('碰后粘合，系统不受外力冲量', 'The bodies stick together, no external impulse', 'Die Körper haften zusammen, kein äußerer Kraftstoß')],
    validity: T('两物体相互接近', 'The bodies approach each other', 'Die Körper nähern sich'),
    sources: ['S14'],
    inputs: [m1, m2, u1, u2],
    conditions: [cond('approach', T('两物体相互接近', 'The bodies approach', 'Die Körper nähern sich'), 'u1 > u2')],
    outputs: [
      out('v', 'v', T('共同速度', 'Common velocity', 'Gemeinsame Geschwindigkeit'), 'm/s', '(m1*u1 + m2*u2)/(m1 + m2)', { requires: ['approach'] }),
      out('Ek0', 'E_{k0}', T('碰前动能', 'Kinetic energy before', 'Kinetische Energie vorher'), 'J', 'm1*u1^2/2 + m2*u2^2/2'),
      out('Ek1', 'E_{k1}', T('碰后动能', 'Kinetic energy after', 'Kinetische Energie nachher'), 'J', '(m1*u1 + m2*u2)^2/(2*(m1 + m2))', { requires: ['approach'] }),
      out('loss', '\\Delta E', T('转化为内能的动能', 'Kinetic energy turned into internal energy', 'In innere Energie umgewandelte kinetische Energie'), 'J', 'm1*m2*(u1 - u2)^2/(2*(m1 + m2))', { requires: ['approach'] })
    ],
    example: { text: T('1 kg 物体以 3 m/s 撞上静止的 2 kg 物体并粘合。', 'A 1 kg body at 3 m/s hits a resting 2 kg body and sticks.', 'Ein 1-kg-Körper mit 3 m/s trifft einen ruhenden 2-kg-Körper und haftet an.'), answer: T('共同速度 1 m/s；动能由 4.5 J 变为 1.5 J，损失 3 J。', 'Common velocity 1 m/s; kinetic energy goes from 4.5 J to 1.5 J, 3 J lost.', 'Gemeinsame Geschwindigkeit 1 m/s; kinetische Energie von 4,5 J auf 1,5 J, 3 J umgewandelt.') },
    point: T('动量守恒与机械能不守恒可同时成立。', 'Momentum can be conserved while mechanical energy is not.', 'Der Impuls kann erhalten sein, während die mechanische Energie es nicht ist.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M18', 'test:acceptance 4 collisions'],
    links: { situations: ['collision'], topics: ['momentum'] }, review: R2
  },
  {
    id: 'M19', title: T('斜碰与接触冲量', 'Oblique impact and contact impulse', 'Schiefer Stoß und Kontaktkraftstoß'),
    stages: ['u'], priority: 'P2', geometry: 'point',
    assumptions: [T('小球碰静止光滑平墙；法向用恢复系数，切向速度不变', 'A ball hits a fixed smooth wall; restitution along the normal, tangential velocity unchanged', 'Eine Kugel trifft eine feste glatte Wand; Stoßzahl in Normalenrichtung, Tangentialgeschwindigkeit unverändert')],
    validity: T('0 ≤ e ≤ 1；接近墙（vn < 0）；有摩擦的多点碰撞需另一模型', '0 ≤ e ≤ 1; approaching the wall (vn < 0); several frictional contacts need another model', '0 ≤ e ≤ 1; nähert sich der Wand (vn < 0); mehrere reibungsbehaftete Kontakte brauchen ein anderes Modell'),
    sources: ['S14', 'S49', 'S50'],
    inputs: [pos('m', 'm', L.m, 'kg', 'mass', 1), inp('vn', 'v_n^-', T('碰前法向速度（离墙为正）', 'Normal velocity before (away from the wall positive)', 'Normalgeschwindigkeit vorher (von der Wand weg positiv)'), 'm/s', 'velocity', -4), inp('vt', 'v_t', T('切向速度', 'Tangential velocity', 'Tangentialgeschwindigkeit'), 'm/s', 'velocity', 3), inp('e', 'e', L.e, '', 'ratio', 0.5, { min: 0, max: 1 })],
    conditions: [cond('approach', T('向墙运动', 'Moving towards the wall', 'Bewegt sich zur Wand'), 'vn < 0')],
    outputs: [
      out('vn2', 'v_n^+', T('碰后法向速度', 'Normal velocity after', 'Normalgeschwindigkeit nachher'), 'm/s', '-e*vn', { requires: ['approach'] }),
      out('vt2', 'v_t^+', T('碰后切向速度', 'Tangential velocity after', 'Tangentialgeschwindigkeit nachher'), 'm/s', 'vt', { requires: ['approach'] }),
      out('J', 'J_n', T('法向冲量', 'Normal impulse', 'Normalkraftstoß'), 'N·s', 'm*(-e*vn - vn)', { requires: ['approach'] }),
      out('loss', '\\Delta E', T('动能损失', 'Loss of kinetic energy', 'Verlust an kinetischer Energie'), 'J', 'm*vn^2*(1 - e^2)/2', { requires: ['approach'] })
    ],
    example: { text: T('1 kg 小球碰静止光滑平墙，入射速度法向 −4 m/s、切向 3 m/s，e = 0.5。', 'A 1 kg ball hits a fixed smooth wall with normal velocity −4 m/s and tangential 3 m/s, e = 0.5.', 'Eine 1-kg-Kugel trifft eine feste glatte Wand mit Normalgeschwindigkeit −4 m/s und Tangentialgeschwindigkeit 3 m/s, e = 0,5.'), answer: T('出射法向 2 m/s、切向 3 m/s；法向冲量 6 N·s；动能损失 6 J。', 'Leaves with 2 m/s normal and 3 m/s tangential; normal impulse 6 N·s; 6 J of kinetic energy lost.', 'Verlässt die Wand mit 2 m/s normal und 3 m/s tangential; Normalkraftstoß 6 N·s; 6 J kinetische Energie verloren.') },
    point: T('冲量与平均接触力不同；多点摩擦碰撞需要额外模型。', 'Impulse is not the average contact force; several frictional contacts need an extra model.', 'Kraftstoß ist nicht die mittlere Kontaktkraft; mehrere Reibkontakte brauchen ein eigenes Modell.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M19', 'test:acceptance 4 collisions', 'test:physics2652 bounces off the stops'],
    links: { situations: ['collision', 'bounce'], topics: ['momentum'] }, review: R2
  },
  {
    id: 'M20', title: T('转动惯量与定轴转动', 'Moment of inertia and fixed-axis rotation', 'Trägheitsmoment und Drehung um eine feste Achse'),
    stages: ['u'], priority: 'P2', geometry: 'plane',
    assumptions: [T('均匀圆盘绕中心轴，恒力矩，从静止开始', 'Uniform disc about its centre, constant torque, from rest', 'Homogene Scheibe um ihre Mittelachse, konstantes Drehmoment, aus der Ruhe')],
    validity: T('刚体；无轴摩擦', 'Rigid body; no friction in the axle', 'Starrer Körper; keine Lagerreibung'),
    sources: ['S15'],
    inputs: [pos('m', 'm', L.m, 'kg', 'mass', 2), pos('R', 'R', L.r, 'm', 'length', 0.5), inp('tau', '\\tau', T('力矩', 'Torque', 'Drehmoment'), 'N·m', 'torque', 1), nonneg('t', 't', L.t, 's', 'time', 3)],
    lets: [let_('I', 'I', T('转动惯量', 'Moment of inertia', 'Trägheitsmoment'), 'kg·m²', 'm*R^2/2')],
    outputs: [
      out('I', 'I', T('转动惯量', 'Moment of inertia', 'Trägheitsmoment'), 'kg·m²', 'I'),
      out('alpha', '\\alpha', T('角加速度', 'Angular acceleration', 'Winkelbeschleunigung'), 'rad/s²', 'tau/I'),
      out('omega', '\\omega', T('角速度', 'Angular velocity', 'Winkelgeschwindigkeit'), 'rad/s', 'tau/I*t'),
      out('Ek', 'E_k', T('转动动能', 'Rotational kinetic energy', 'Rotationsenergie'), 'J', 'I*(tau/I*t)^2/2'),
      out('W', 'W', T('力矩做的功', 'Work of the torque', 'Arbeit des Drehmoments'), 'J', 'tau*(tau/I*t^2/2)')
    ],
    example: { text: T('均匀圆盘 m = 2 kg，R = 0.5 m，恒力矩 1 N·m，从静止转动 3 s。', 'A uniform disc, m = 2 kg, R = 0.5 m, constant torque 1 N·m, from rest for 3 s.', 'Homogene Scheibe, m = 2 kg, R = 0,5 m, konstantes Drehmoment 1 N·m, 3 s aus der Ruhe.'), answer: T('I = 0.25 kg·m²；α = 4 rad/s²；ω = 12 rad/s；转动动能 18 J。', 'I = 0.25 kg·m²; α = 4 rad/s²; ω = 12 rad/s; rotational energy 18 J.', 'I = 0,25 kg·m²; α = 4 rad/s²; ω = 12 rad/s; Rotationsenergie 18 J.') },
    point: T('惯量依赖转轴，合力矩与合力不能混同。', 'The moment of inertia depends on the axis; net torque is not net force.', 'Das Trägheitsmoment hängt von der Achse ab; Drehmoment ist nicht Kraft.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M20', 'test:physics2651 torque motor'],
    links: { situations: ['rotation', 'spin', 'gear'], topics: ['rotation'] }, review: R2
  },
  {
    id: 'M21', title: T('杠杆与力矩平衡', 'Lever and balance of torques', 'Hebel und Drehmomentgleichgewicht'),
    stages: ['j'], priority: 'P1', geometry: 'plane',
    assumptions: [T('无重杠杆，两力竖直向下，支点固定', 'Weightless lever, both forces vertical and downwards, fixed pivot', 'Gewichtsloser Hebel, beide Kräfte senkrecht abwärts, fester Drehpunkt')],
    validity: T('力臂是支点到力作用线的垂距；倾斜施力时改用垂直分量', 'The lever arm is the perpendicular distance from the pivot to the line of action; for slanted forces use the perpendicular part', 'Der Hebelarm ist der Lotabstand vom Drehpunkt zur Wirkungslinie; schräge Kräfte mit ihrem senkrechten Anteil'),
    sources: ['S79'],
    inputs: [nonneg('F1', 'F_1', T('左侧的力', 'Force on the left', 'Kraft links'), 'N', 'force', 30), pos('l1', 'l_1', T('左侧力臂', 'Left lever arm', 'Linker Hebelarm'), 'm', 'length', 0.2), pos('l2', 'l_2', T('右侧力臂', 'Right lever arm', 'Rechter Hebelarm'), 'm', 'length', 0.5), angle('phi', '\\varphi', T('右侧力与竖直方向的夹角', 'Angle of the right force to the vertical', 'Winkel der rechten Kraft zur Senkrechten'), 0, { min: -Math.PI / 2, max: Math.PI / 2, open: true })],
    outputs: [
      out('F2', 'F_2', T('平衡所需的右侧力', 'Force needed on the right', 'Nötige Kraft rechts'), 'N', 'F1*l1/(l2*cos(phi))'),
      out('N', 'N', T('支点的支持力（竖直分量）', 'Pivot force (vertical part)', 'Lagerkraft (senkrechter Anteil)'), 'N', 'F1 + F1*l1/l2')
    ],
    example: { text: T('无重杠杆左侧 0.2 m 处向下施力 30 N，右侧力臂 0.5 m。', 'A weightless lever: 30 N down at 0.2 m on the left, lever arm 0.5 m on the right.', 'Gewichtsloser Hebel: 30 N abwärts bei 0,2 m links, Hebelarm rechts 0,5 m.'), answer: T('平衡需右侧向下施力 12 N；支点向上支持力 42 N。', 'Balance needs 12 N down on the right; the pivot pushes up with 42 N.', 'Gleichgewicht braucht rechts 12 N abwärts; der Drehpunkt drückt mit 42 N nach oben.') },
    point: T('力臂是支点到力作用线的垂距。', 'The lever arm is the perpendicular distance from the pivot to the line of action.', 'Der Hebelarm ist der Lotabstand vom Drehpunkt zur Wirkungslinie.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M21', 'test:derivationsC the steps hold numerically in the recognised template situations'],
    links: { situations: ['lever'], topics: ['rotation'] }, review: R2
  },
  {
    id: 'M22', title: T('纯滚动', 'Rolling without slipping', 'Rollen ohne Gleiten'),
    stages: ['u'], priority: 'P2', geometry: 'plane',
    assumptions: [T('刚性圆形物体沿斜面滚下；I = k·mR²（圆柱 k = 1/2）', 'A rigid round body rolls down an incline; I = k·mR² (cylinder k = 1/2)', 'Ein starrer runder Körper rollt die Ebene hinab; I = k·mR² (Zylinder k = 1/2)'), A.coulomb],
    validity: T('静摩擦足以维持纯滚动：μs ≥ k·tanθ/(1 + k)；否则边滚边滑', 'Static friction can keep rolling: μs ≥ k·tanθ/(1 + k); otherwise it slips', 'Die Haftreibung hält das Rollen: μs ≥ k·tanθ/(1 + k); sonst gleitet er'),
    sources: ['S15', 'S12'],
    inputs: [angle('theta', '\\theta', L.theta, deg(30), { min: 0, max: Math.PI / 2, open: true }), pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8), pos('k', 'k', T('形状系数 I/(mR²)', 'Shape factor I/(mR²)', 'Formfaktor I/(mR²)'), '', 'ratio', 0.5), nonneg('muS', '\\mu_s', L.muS, '', 'ratio', 0.3), nonneg('muK', '\\mu_k', L.muK, '', 'ratio', 0.25)],
    lets: [let_('muMin', '\\mu_{\\min}', T('纯滚动所需的最小静摩擦因数', 'Smallest static coefficient for rolling', 'Kleinste Haftreibungszahl zum Rollen'), '', 'k*tan(theta)/(1 + k)')],
    conditions: [cond('rolls', T('静摩擦足以维持纯滚动', 'Static friction keeps the rolling', 'Die Haftreibung hält das Rollen'), 'muS >= muMin'), cond('slips', T('边滚边滑', 'Rolling with slipping', 'Rollen mit Gleiten'), 'muS < muMin')],
    outputs: [
      out('muMin', '\\mu_{\\min}', T('所需最小 μs', 'Smallest μs needed', 'Nötiges kleinstes μs'), '', 'muMin'),
      out('a', 'a', T('质心加速度', 'Acceleration of the centre', 'Beschleunigung des Schwerpunkts'), 'm/s²', 'g*sin(theta)/(1 + k)', { when: 'rolls', branch: T('纯滚动', 'Rolling', 'Rollen') }),
      out('a', 'a', T('质心加速度', 'Acceleration of the centre', 'Beschleunigung des Schwerpunkts'), 'm/s²', 'g*(sin(theta) - muK*cos(theta))', { when: 'slips', branch: T('边滚边滑', 'Slipping', 'Gleiten') })
    ],
    example: { text: T('均匀实心圆柱沿 30° 斜面纯滚动，g = 9.8。', 'A uniform solid cylinder rolls down a 30° incline without slipping, g = 9.8.', 'Ein homogener Vollzylinder rollt ohne Gleiten eine 30°-Ebene hinab, g = 9,8.'), answer: T('a = 3.26667 m/s²；需 μs 至少为 tan30°/3 = 0.19245。', 'a = 3.26667 m/s²; it needs μs of at least tan30°/3 = 0.19245.', 'a = 3,26667 m/s²; nötig ist μs von mindestens tan30°/3 = 0,19245.') },
    point: T('静摩擦可建立滚动约束，但并非总在耗散能量。', 'Static friction can enforce rolling without dissipating energy.', 'Die Haftreibung kann das Rollen erzwingen, ohne Energie zu verbrauchen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M22', 'test:acceptance 7 rigid rotation'],
    links: { situations: ['rolling'], topics: ['rotation'] }, review: R2
  },
  {
    id: 'M23', title: T('滑动到滚动', 'From sliding to rolling', 'Vom Gleiten zum Rollen'),
    stages: ['u'], priority: 'P2', geometry: 'plane',
    assumptions: [T('水平面，初速 v0 无自转，动摩擦 μk；I = k·mR²', 'Level ground, initial velocity v0 without spin, kinetic friction μk; I = k·mR²', 'Waagerechter Boden, Anfangsgeschwindigkeit v0 ohne Drehung, Gleitreibung μk; I = k·mR²')],
    validity: T('接触点相对速度归零即转入纯滚动', 'Rolling starts when the contact point stops slipping', 'Das Rollen beginnt, wenn der Berührpunkt nicht mehr gleitet'),
    sources: ['S12', 'S15', 'S49'],
    inputs: [pos('m', 'm', L.m, 'kg', 'mass', 1), pos('v0', 'v_0', L.v0, 'm/s', 'velocity', 3), pos('muK', '\\mu_k', L.muK, '', 'ratio', 0.2), pos('g', 'g', L.g, 'm/s²', 'acceleration', 10), pos('k', 'k', T('形状系数 I/(mR²)', 'Shape factor I/(mR²)', 'Formfaktor I/(mR²)'), '', 'ratio', 0.5)],
    outputs: [
      out('t', 't_*', T('开始纯滚动的时刻', 'Time when rolling starts', 'Beginn des Rollens'), 's', 'k*v0/(muK*g*(1 + k))'),
      out('v', 'v_*', T('纯滚动时的速度', 'Velocity when rolling', 'Geschwindigkeit beim Rollen'), 'm/s', 'v0/(1 + k)'),
      out('Q', 'Q', T('摩擦生热', 'Heat from friction', 'Reibungswärme'), 'J', 'm*v0^2*k/(2*(1 + k))')
    ],
    example: { text: T('均匀圆柱初速 3 m/s、无自转，水平面 μk = 0.2，g = 10。', 'A uniform cylinder at 3 m/s without spin, level ground with μk = 0.2, g = 10.', 'Ein homogener Zylinder mit 3 m/s ohne Drehung, waagerechter Boden mit μk = 0,2, g = 10.'), answer: T('0.5 s 后纯滚动，速率 2 m/s。', 'It rolls after 0.5 s at 2 m/s.', 'Nach 0,5 s rollt er mit 2 m/s.') },
    point: T('接触点相对速度归零是状态切换条件。', 'The contact point coming to rest is the switching condition.', 'Der ruhende Berührpunkt ist die Umschaltbedingung.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:M23', 'test:models rolling with slipping'],
    links: { situations: ['roll-slip'], topics: ['rotation'] }, review: R2
  },
  {
    id: 'M24', title: T('竖直圆周与轻绳临界条件', 'Vertical circle on a rope: critical speed', 'Senkrechter Kreis am Seil: kritische Geschwindigkeit'),
    stages: ['s'], priority: 'P1', geometry: 'plane',
    assumptions: [A.point, T('轻绳只能拉；无阻力', 'A light rope can only pull; no drag', 'Ein leichtes Seil kann nur ziehen; kein Luftwiderstand')],
    validity: T('底点速率 ≥ √(5gR) 才能完成整周；否则在某处松绳转入抛体', 'A full circle needs a bottom speed ≥ √(5gR); otherwise the rope goes slack and the ball flies off', 'Ein voller Kreis braucht unten ≥ √(5gR); sonst wird das Seil schlaff und die Kugel fliegt ab'),
    sources: ['S11', 'S12', 'S13'],
    inputs: [pos('R', 'R', L.r, 'm', 'length', 1), pos('g', 'g', L.g, 'm/s²', 'acceleration', 10), pos('m', 'm', L.m, 'kg', 'mass', 1), nonneg('vb', 'v_b', T('底点速率', 'Speed at the bottom', 'Geschwindigkeit unten'), 'm/s', 'velocity', 8)],
    conditions: [cond('full', T('能完成整个圆周', 'It completes the circle', 'Er durchläuft den ganzen Kreis'), 'vb^2 >= 5*g*R'), cond('slack', T('在上半圆松绳', 'The rope goes slack in the upper half', 'Das Seil wird in der oberen Hälfte schlaff'), 'vb^2 < 5*g*R && vb^2 > 2*g*R')],
    outputs: [
      out('vtMin', 'v_{t,\\min}', T('顶点临界速率', 'Critical speed at the top', 'Kritische Geschwindigkeit oben'), 'm/s', 'sqrt(g*R)'),
      out('vbMin', 'v_{b,\\min}', T('底点最小速率', 'Smallest speed at the bottom', 'Kleinste Geschwindigkeit unten'), 'm/s', 'sqrt(5*g*R)'),
      out('vt', 'v_t', T('顶点速率', 'Speed at the top', 'Geschwindigkeit oben'), 'm/s', 'sqrt(vb^2 - 4*g*R)', { requires: ['full'] }),
      out('Tt', 'T_t', T('顶点绳的拉力', 'Rope tension at the top', 'Seilkraft oben'), 'N', 'm*((vb^2 - 4*g*R)/R - g)', { requires: ['full'] }),
      out('phiS', '\\varphi_s', T('松绳处的位置角（自最低点量起）', 'Angle where the rope goes slack (from the bottom)', 'Winkel, an dem das Seil schlaff wird (von unten)'), 'rad', 'acos((2*g*R - vb^2)/(3*g*R))', { requires: ['slack'] })
    ],
    example: { text: T('半径 1 m，轻绳约束小球完成整周，g = 10，无阻力。', 'Radius 1 m, a ball on a rope makes a full circle, g = 10, no drag.', 'Radius 1 m, eine Kugel am Seil läuft einen vollen Kreis, g = 10, ohne Widerstand.'), answer: T('顶点临界速率 3.16228 m/s；底点最小速率 7.07107 m/s。', 'Critical top speed 3.16228 m/s; smallest bottom speed 7.07107 m/s.', 'Kritische Geschwindigkeit oben 3,16228 m/s; kleinste Geschwindigkeit unten 7,07107 m/s.') },
    point: T('几何路径限制不等于绳一定能提供所需约束力。', 'A geometric path does not mean the rope can supply the needed force.', 'Eine geometrische Bahn heißt nicht, dass das Seil die nötige Kraft liefern kann.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M24', 'test:models vertical circle on a rope'],
    links: { situations: ['vcircle-rope'], topics: ['circular'] }, review: R2
  },
  {
    id: 'M25', title: T('竖直圆周与轻杆', 'Vertical circle on a rod', 'Senkrechter Kreis an der Stange'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'plane',
    assumptions: [A.point, T('轻杆可拉可推；无阻力', 'A light rod can pull and push; no drag', 'Eine leichte Stange kann ziehen und drücken; kein Widerstand')],
    validity: T('底点速率 ≥ 2√(gR) 才能到达顶点', 'The top is reached only with a bottom speed ≥ 2√(gR)', 'Oben ankommen nur mit unten ≥ 2√(gR)'),
    sources: ['S11', 'S13', 'S50'],
    inputs: [pos('R', 'R', L.r, 'm', 'length', 1), pos('g', 'g', L.g, 'm/s²', 'acceleration', 10), pos('m', 'm', L.m, 'kg', 'mass', 1), nonneg('vb', 'v_b', T('底点速率', 'Speed at the bottom', 'Geschwindigkeit unten'), 'm/s', 'velocity', 7)],
    conditions: [cond('reaches', T('能到达顶点', 'It reaches the top', 'Er erreicht den höchsten Punkt'), 'vb^2 >= 4*g*R')],
    outputs: [
      out('vt', 'v_t', T('顶点速率', 'Speed at the top', 'Geschwindigkeit oben'), 'm/s', 'sqrt(vb^2 - 4*g*R)', { requires: ['reaches'] }),
      out('Ft', 'F_t', T('杆对球的力（正为拉，负为推）', 'Rod force on the ball (+ pull, − push)', 'Stangenkraft auf die Kugel (+ Zug, − Druck)'), 'N', 'm*((vb^2 - 4*g*R)/R - g)', { requires: ['reaches'] })
    ],
    example: { text: T('理想轻杆连接小球，R = 1 m，g = 10，底点初速 7 m/s。', 'A ball on an ideal light rod, R = 1 m, g = 10, 7 m/s at the bottom.', 'Eine Kugel an einer idealen leichten Stange, R = 1 m, g = 10, unten 7 m/s.'), answer: T('顶点速率 3 m/s；杆在顶点对小球提供朝上支撑（m = 1 kg 时 1 N）。', 'Top speed 3 m/s; at the top the rod pushes the ball up (1 N for m = 1 kg).', 'Oben 3 m/s; dort drückt die Stange die Kugel nach oben (1 N für m = 1 kg).') },
    point: T('杆可拉可推，临界条件不能照搬轻绳。', 'A rod can pull and push; the rope’s critical condition does not carry over.', 'Eine Stange zieht und drückt; die kritische Bedingung des Seils gilt nicht.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M25', 'test:models vertical circle on a rod'],
    links: { situations: ['vcircle-rod'], topics: ['circular'] }, review: R2
  },
  {
    id: 'M26', title: T('两体引力与开普勒轨道', 'Two-body gravitation and Kepler orbits', 'Zweikörper-Gravitation und Kepler-Bahnen'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'plane',
    assumptions: [T('中心天体固定（或用约化质量），圆轨道；μ = GM 可为教学值', 'Central body fixed (or reduced mass), circular orbit; μ = GM may be a teaching value', 'Zentralkörper fest (oder reduzierte Masse), Kreisbahn; μ = GM darf ein Unterrichtswert sein'), A.teachingUnits],
    validity: T('牛顿引力；圆轨道', 'Newtonian gravity; circular orbit', 'Newtonsche Gravitation; Kreisbahn'),
    sources: ['S16', 'S42'],
    inputs: [pos('mu', '\\mu', T('引力参数 GM', 'Gravitational parameter GM', 'Gravitationsparameter GM'), 'm³/s²', 'gravParam', 1), pos('r', 'r', T('轨道半径', 'Orbit radius', 'Bahnradius'), 'm', 'length', 4)],
    outputs: [
      out('v', 'v_c', T('圆轨道速度', 'Circular speed', 'Kreisbahngeschwindigkeit'), 'm/s', 'sqrt(mu/r)'),
      out('T', 'T', L.T, 's', '2*pi*sqrt(r^3/mu)'),
      out('h', 'h', T('单位质量角动量', 'Angular momentum per unit mass', 'Drehimpuls pro Masse'), 'm²/s', 'sqrt(mu*r)'),
      out('eps', '\\varepsilon', T('单位质量机械能', 'Mechanical energy per unit mass', 'Mechanische Energie pro Masse'), 'J/kg', '-mu/(2*r)')
    ],
    example: { text: T('教学无量纲单位取 μ = GM = 1，圆轨道 r = 4。', 'Teaching units with μ = GM = 1, circular orbit r = 4.', 'Unterrichtseinheiten mit μ = GM = 1, Kreisbahn r = 4.'), answer: T('圆轨道速度 0.5；周期 16π = 50.2655；单位质量角动量 2。', 'Circular speed 0.5; period 16π = 50.2655; angular momentum per mass 2.', 'Kreisbahngeschwindigkeit 0,5; Periode 16π = 50,2655; Drehimpuls pro Masse 2.') },
    point: T('无量纲教学常数必须显式标识；两体约化与守恒量。', 'Teaching constants must be labelled; two-body reduction and conserved quantities.', 'Unterrichtskonstanten müssen gekennzeichnet sein; Zweikörperreduktion und Erhaltungsgrößen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:M26', 'test:physics2651 gravitation'],
    links: { situations: ['orbit'], topics: ['gravitation'] }, review: R2,
    gap: T('偏心轨道的长期相位与近地点监控未做', 'Long-term phase and periapsis monitoring of eccentric orbits are not done', 'Langzeitphase und Periapsis exzentrischer Bahnen werden nicht überwacht')
  },
  {
    id: 'M27', title: T('宇宙速度与逃逸', 'Cosmic velocities and escape', 'Kosmische Geschwindigkeiten und Entweichen'),
    stages: ['s'], priority: 'P1', geometry: 'plane',
    assumptions: [T('球形天体，不计大气与自转', 'Spherical body, no atmosphere, no rotation', 'Kugelförmiger Körper, keine Atmosphäre, keine Rotation'), A.teachingUnits],
    validity: T('总机械能 ≥ 0 时不再束缚', 'Unbound when the total mechanical energy is ≥ 0', 'Ungebunden, wenn die mechanische Gesamtenergie ≥ 0 ist'),
    sources: ['S16'],
    inputs: [pos('mu', '\\mu', T('引力参数 GM', 'Gravitational parameter GM', 'Gravitationsparameter GM'), 'm³/s²', 'gravParam', 100), pos('R', 'R', T('天体半径', 'Radius of the body', 'Radius des Körpers'), 'm', 'length', 2), nonneg('v', 'v', T('发射速率', 'Launch speed', 'Startgeschwindigkeit'), 'm/s', 'velocity', 8)],
    conditions: [cond('bound', T('束缚（总能量 < 0）', 'Bound (energy < 0)', 'Gebunden (Energie < 0)'), 'v^2/2 - mu/R < 0')],
    outputs: [
      out('vc', 'v_1', T('表面圆轨道速度', 'Circular speed at the surface', 'Kreisbahngeschwindigkeit an der Oberfläche'), 'm/s', 'sqrt(mu/R)'),
      out('vesc', 'v_2', T('逃逸速度', 'Escape speed', 'Fluchtgeschwindigkeit'), 'm/s', 'sqrt(2*mu/R)'),
      out('eps', '\\varepsilon', T('单位质量总能量', 'Energy per unit mass', 'Energie pro Masse'), 'J/kg', 'v^2/2 - mu/R'),
      out('rmax', 'r_{\\max}', T('竖直发射能到的最远距离', 'Farthest distance of a vertical launch', 'Größter Abstand bei senkrechtem Start'), 'm', '1/(1/R - v^2/(2*mu))', { requires: ['bound'] })
    ],
    example: { text: T('教学参数 μ = 100 m³/s²，天体半径 R = 2 m，不计大气。', 'Teaching parameters μ = 100 m³/s², radius R = 2 m, no atmosphere.', 'Unterrichtsparameter μ = 100 m³/s², Radius R = 2 m, keine Atmosphäre.'), answer: T('表面圆轨道速度 7.07107 m/s；逃逸速度 10 m/s。', 'Circular speed at the surface 7.07107 m/s; escape speed 10 m/s.', 'Kreisbahngeschwindigkeit 7,07107 m/s; Fluchtgeschwindigkeit 10 m/s.') },
    point: T('零总机械能给出逃逸阈值；不等于达到某固定高度的速度。', 'Zero total energy gives the escape threshold, not the speed to reach some height.', 'Gesamtenergie null ergibt die Fluchtgrenze, nicht die Geschwindigkeit für eine bestimmte Höhe.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:M27', 'test:physics2651 a circular orbit about a static planet'],
    links: { situations: ['orbit'], topics: ['gravitation'] }, review: R2
  },
  {
    id: 'M28', title: T('阻力与终端速度', 'Drag and terminal velocity', 'Luftwiderstand und Endgeschwindigkeit'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'point',
    assumptions: [T('线性阻力 F = −bv，向下为正，从初速 v0 开始', 'Linear drag F = −bv, down positive, from an initial velocity v0', 'Lineare Reibung F = −bv, abwärts positiv, ab der Anfangsgeschwindigkeit v0')],
    validity: T('线性阻力适用于小雷诺数；高速时用平方阻力', 'Linear drag holds at small Reynolds numbers; at high speed use quadratic drag', 'Lineare Reibung gilt bei kleiner Reynolds-Zahl; bei hoher Geschwindigkeit quadratisch'),
    sources: ['S12', 'S55'],
    inputs: [pos('m', 'm', L.m, 'kg', 'mass', 1), pos('b', 'b', T('阻力系数', 'Drag coefficient', 'Reibungskoeffizient'), 'kg/s', 'damping', 2), pos('g', 'g', L.g, 'm/s²', 'acceleration', 10), nonneg('t', 't', L.t, 's', 'time', 1), inp('v0', 'v_0', L.v0, 'm/s', 'velocity', 0)],
    outputs: [
      out('tau', '\\tau', L.tau, 's', 'm/b'),
      out('vInf', 'v_\\infty', T('终端速度', 'Terminal velocity', 'Endgeschwindigkeit'), 'm/s', 'm*g/b'),
      out('v', 'v(t)', T('t 时刻的速度', 'Velocity at t', 'Geschwindigkeit bei t'), 'm/s', 'm*g/b + (v0 - m*g/b)*exp(-b*t/m)'),
      out('x', 'x(t)', T('0 到 t 的位移', 'Displacement 0 … t', 'Verschiebung 0 … t'), 'm', 'm*g/b*t + (v0 - m*g/b)*m/b*(1 - exp(-b*t/m))')
    ],
    example: { text: T('向下为正，m = 1 kg，b = 2 kg/s，g = 10，初静止。', 'Down positive, m = 1 kg, b = 2 kg/s, g = 10, from rest.', 'Abwärts positiv, m = 1 kg, b = 2 kg/s, g = 10, aus der Ruhe.'), answer: T('τ = 0.5 s；v∞ = 5 m/s；t = 1 s 时 v = 4.32332 m/s。', 'τ = 0.5 s; v∞ = 5 m/s; at t = 1 s, v = 4.32332 m/s.', 'τ = 0,5 s; v∞ = 5 m/s; bei t = 1 s ist v = 4,32332 m/s.') },
    point: T('线性阻力与平方阻力有不同有效范围和终端速度。', 'Linear and quadratic drag have different ranges and terminal velocities.', 'Lineare und quadratische Reibung haben verschiedene Gültigkeitsbereiche und Endgeschwindigkeiten.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:M28', 'test:physics2651 drag'],
    links: { situations: ['drag'], topics: ['drag'] }, review: R2
  },
  {
    id: 'M29', title: T('变力 冲量与数值积分', 'Variable force, impulse and numerical integration', 'Veränderliche Kraft, Kraftstoß und numerische Integration'),
    stages: ['u'], priority: 'P2', geometry: 'point',
    assumptions: [T('F = κt 沿直线，从 t = 0 起作用', 'F = κt along a line, from t = 0', 'F = κt längs einer Geraden, ab t = 0')],
    validity: T('κ 的单位为 N/s（表达式需要时间量纲）', 'κ is in N/s (the expression needs the dimension of time)', 'κ in N/s (der Ausdruck braucht die Dimension Zeit)'),
    sources: ['S13', 'S14', 'S55'],
    inputs: [pos('m', 'm', L.m, 'kg', 'mass', 2), inp('kap', '\\kappa', T('力的增长率', 'Rate of the force', 'Anstieg der Kraft'), 'N/s', 'forceRate', 2), nonneg('t', 't', L.t, 's', 'time', 2), inp('v0', 'v_0', L.v0, 'm/s', 'velocity', 0)],
    outputs: [
      out('J', 'J', T('冲量', 'Impulse', 'Kraftstoß'), 'N·s', 'kap*t^2/2'),
      out('v', 'v', T('末速度', 'Final velocity', 'Endgeschwindigkeit'), 'm/s', 'v0 + kap*t^2/(2*m)'),
      out('x', '\\Delta x', T('位移', 'Displacement', 'Verschiebung'), 'm', 'v0*t + kap*t^3/(6*m)'),
      out('W', 'W', T('力做的功', 'Work of the force', 'Arbeit der Kraft'), 'J', 'm*(v0 + kap*t^2/(2*m))^2/2 - m*v0^2/2')
    ],
    example: { text: T('m = 2 kg，初静止，0 到 2 s 内 F = (2 N/s)t。', 'm = 2 kg from rest, F = (2 N/s)t for 0 … 2 s.', 'm = 2 kg aus der Ruhe, F = (2 N/s)t für 0 … 2 s.'), answer: T('冲量 4 N·s；v(2) = 2 m/s；x(2) − x0 = 4/3 m。', 'Impulse 4 N·s; v(2) = 2 m/s; x(2) − x0 = 4/3 m.', 'Kraftstoß 4 N·s; v(2) = 2 m/s; x(2) − x0 = 4/3 m.') },
    point: T('表达式需要时间量纲；同一力的冲量与做功积分不能混淆。', 'The expression needs time’s dimension; impulse and work of the same force are different integrals.', 'Der Ausdruck braucht die Dimension Zeit; Kraftstoß und Arbeit derselben Kraft sind verschiedene Integrale.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:M29', 'test:forces variable forces'],
    links: { situations: ['var-force'], topics: ['momentum'] }, review: R2
  },
  {
    id: 'M30', title: T('弹性杆与梁挠度', 'Elastic rod and beam deflection', 'Elastischer Stab und Balkendurchbiegung'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [A.linear, T('小变形；细杆轴向受力；悬臂梁端部集中力（欧拉–伯努利）', 'Small deformation; axial load on a slender rod; point load at the tip of a cantilever (Euler–Bernoulli)', 'Kleine Verformung; Längskraft am schlanken Stab; Einzellast am Ende eines Kragbalkens (Euler–Bernoulli)')],
    validity: T('应变远小于 1（此处 ≤ 10⁻³ 视为适用）', 'Strain far below 1 (≤ 10⁻³ counts as applicable here)', 'Dehnung weit unter 1 (≤ 10⁻³ gilt hier als zulässig)'),
    restricted: T('只含闭式解；有限元与网格收敛暂缓（X03）', 'Closed forms only; finite elements and grid convergence deferred (X03)', 'Nur geschlossene Formeln; Finite Elemente und Gitterkonvergenz zurückgestellt (X03)'),
    sources: ['S79', 'S54'],
    inputs: [inp('F', 'F', T('轴向力（拉为正）', 'Axial force (tension positive)', 'Längskraft (Zug positiv)'), 'N', 'force', 1000), pos('Lr', 'L', T('杆长', 'Length of the rod', 'Stablänge'), 'm', 'length', 1), pos('Ar', 'A', T('截面积', 'Cross-section', 'Querschnitt'), 'm²', 'area', 1e-4), pos('E', 'E', T('杨氏模量', 'Young’s modulus', 'Elastizitätsmodul'), 'Pa', 'pressure', 2e11), nonneg('Fb', 'F_b', T('梁端集中力', 'Point load at the beam tip', 'Einzellast am Balkenende'), 'N', 'force', 1), pos('Lb', 'L_b', T('梁长', 'Length of the beam', 'Balkenlänge'), 'm', 'length', 1), pos('Ib', 'I', T('截面惯性矩', 'Second moment of area', 'Flächenträgheitsmoment'), 'm⁴', 'secondMoment', 1e-8)],
    conditions: [cond('small', T('小应变（≤ 10⁻³）', 'Small strain (≤ 10⁻³)', 'Kleine Dehnung (≤ 10⁻³)'), 'abs(F)/(Ar*E) <= 1e-3', 'abs(F)/(Ar*E) <= 1e-2')],
    outputs: [
      out('sigma', '\\sigma', T('应力', 'Stress', 'Spannung'), 'Pa', 'F/Ar'),
      out('eps', '\\varepsilon', T('应变', 'Strain', 'Dehnung'), '', 'F/(Ar*E)', { requires: ['small'] }),
      out('dL', '\\Delta L', T('伸长量', 'Elongation', 'Verlängerung'), 'm', 'F*Lr/(E*Ar)', { requires: ['small'] }),
      out('delta', '\\delta', T('悬臂梁端挠度', 'Tip deflection of the cantilever', 'Durchbiegung am Kragbalkenende'), 'm', 'Fb*Lb^3/(3*E*Ib)')
    ],
    example: { text: T('杆长 1 m，截面积 10⁻⁴ m²，E = 2×10¹¹ Pa，轴向拉力 1000 N。', 'A rod of 1 m, cross-section 10⁻⁴ m², E = 2×10¹¹ Pa, axial tension 1000 N.', 'Stab 1 m lang, Querschnitt 10⁻⁴ m², E = 2×10¹¹ Pa, Zugkraft 1000 N.'), answer: T('应力 10 MPa；应变 5×10⁻⁵；伸长 5×10⁻⁵ m。悬臂梁（F = 1 N，I = 10⁻⁸ m⁴）端挠度 0.166667 mm。', 'Stress 10 MPa; strain 5×10⁻⁵; elongation 5×10⁻⁵ m. Cantilever (F = 1 N, I = 10⁻⁸ m⁴): tip deflection 0.166667 mm.', 'Spannung 10 MPa; Dehnung 5×10⁻⁵; Verlängerung 5×10⁻⁵ m. Kragbalken (F = 1 N, I = 10⁻⁸ m⁴): Durchbiegung 0,166667 mm.') },
    point: T('刚体与弹性体是不同近似；小变形模型需要有效性提示。', 'Rigid and elastic bodies are different approximations; small-deformation models need a validity note.', 'Starrer und elastischer Körper sind verschiedene Näherungen; Modelle kleiner Verformung brauchen einen Gültigkeitshinweis.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:M30'],
    links: {}, review: R2,
    gap: T('连续介质求解、边界约束与网格收敛未做', 'Continuum solver, boundary constraints and grid convergence are not done', 'Kontinuumslöser, Randbedingungen und Gitterkonvergenz fehlen')
  },
  {
    id: 'M31', title: T('拉格朗日单摆', 'Lagrangian pendulum', 'Lagrangesches Pendel'),
    stages: ['u'], priority: 'P2', geometry: 'plane',
    assumptions: [T('广义坐标 θ；L = ½mℓ²θ̇² + mgℓcosθ', 'Generalized coordinate θ; L = ½mℓ²θ̇² + mgℓcosθ', 'Verallgemeinerte Koordinate θ; L = ½mℓ²θ̇² + mgℓcosθ'), A.noDrag],
    validity: T('任意摆角（绳保持绷紧）', 'Any amplitude (the string stays taut)', 'Beliebige Amplitude (der Faden bleibt gespannt)'),
    sources: ['S42', 'S50'],
    inputs: [pos('l', '\\ell', T('摆长', 'Length', 'Pendellänge'), 'm', 'length', 1), pos('g', 'g', L.g, 'm/s²', 'acceleration', 10), angle('th', '\\theta', T('摆角', 'Angle', 'Auslenkung'), 0.1, { min: -Math.PI, max: Math.PI, open: true }), inp('om', '\\dot\\theta', T('角速度', 'Angular velocity', 'Winkelgeschwindigkeit'), 'rad/s', 'angularVelocity', 0)],
    lets: [let_('E', 'E/(m\\ell^2)', T('单位转动惯量能量', 'Energy per mℓ²', 'Energie pro mℓ²'), '1/s²', 'om^2/2 - g/l*cos(th)', undefined)],
    conditions: [cond('oscillates', T('往复摆动（不翻过顶点）', 'Swings to and fro (does not go over the top)', 'Schwingt hin und her (nicht über den höchsten Punkt)'), 'om^2/2 - g/l*cos(th) < g/l')],
    outputs: [
      out('acc', '\\ddot\\theta', T('角加速度（欧拉–拉格朗日方程）', 'Angular acceleration (Euler–Lagrange equation)', 'Winkelbeschleunigung (Euler-Lagrange-Gleichung)'), 'rad/s²', '-g/l*sin(th)'),
      out('amp', '\\theta_0', T('振幅', 'Amplitude', 'Amplitude'), 'rad', 'acos(cos(th) - om^2*l/(2*g))', { requires: ['oscillates'] }),
      out('T', 'T', T('精确周期', 'Exact period', 'Exakte Periode'), 's', '4*sqrt(l/g)*ellipK(sin(acos(cos(th) - om^2*l/(2*g))/2))', { requires: ['oscillates'] })
    ],
    example: { text: T('m = 1 kg，ℓ = 1 m，g = 10，θ = 0.1 rad 且角速度为零。', 'm = 1 kg, ℓ = 1 m, g = 10, θ = 0.1 rad at rest.', 'm = 1 kg, ℓ = 1 m, g = 10, θ = 0,1 rad in Ruhe.'), answer: T('初角加速度 −10 sin 0.1 = −0.998334 rad/s²。', 'Initial angular acceleration −10 sin 0.1 = −0.998334 rad/s².', 'Anfängliche Winkelbeschleunigung −10 sin 0,1 = −0,998334 rad/s².') },
    point: T('广义坐标减少约束未知量；势能常数不影响方程。', 'Generalized coordinates remove the constraint unknowns; a constant in the potential does not change the equation.', 'Verallgemeinerte Koordinaten entfernen die Zwangskräfte; eine Konstante im Potential ändert die Gleichung nicht.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:M31', 'test:acceptance 6 oscillations'],
    links: { situations: ['pendulum'], topics: ['oscillation'] }, review: R2
  },
  {
    id: 'M32', title: T('哈密顿方法与对称性', 'Hamiltonian method and symmetry', 'Hamilton-Formalismus und Symmetrie'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'abstract',
    assumptions: [T('一维谐振子 H = p²/(2m) + ½kx²', 'One-dimensional oscillator H = p²/(2m) + ½kx²', 'Eindimensionaler Oszillator H = p²/(2m) + ½kx²')],
    validity: T('受限解析模型：单自由度谐振子的相空间椭圆', 'Restricted analytic model: the phase-space ellipse of one oscillator', 'Eingeschränktes analytisches Modell: Phasenraumellipse eines Oszillators'),
    restricted: T('哈密顿量与相轨道（解析）；一般哈密顿系统与辛积分的长期验证暂缓', 'Hamiltonian and phase orbit (analytic); general Hamiltonian systems and long-term symplectic checks deferred', 'Hamiltonfunktion und Phasenbahn (analytisch); allgemeine Hamiltonsysteme und Langzeitprüfung symplektischer Verfahren zurückgestellt'),
    sources: ['S42', 'S55'],
    inputs: [pos('m', 'm', L.m, 'kg', 'mass', 1), pos('k', 'k', L.k, 'N/m', 'stiffness', 4), inp('x', 'x', L.x, 'm', 'length', 0.5), inp('p', 'p', L.p_mom, 'kg·m/s', 'momentum', 0)],
    outputs: [
      out('H', 'H', T('哈密顿量（能量）', 'Hamiltonian (energy)', 'Hamiltonfunktion (Energie)'), 'J', 'p^2/(2*m) + k*x^2/2'),
      out('xdot', '\\dot x', T('ẋ = ∂H/∂p', 'ẋ = ∂H/∂p', 'ẋ = ∂H/∂p'), 'm/s', 'p/m'),
      out('pdot', '\\dot p', T('ṗ = −∂H/∂x', 'ṗ = −∂H/∂x', 'ṗ = −∂H/∂x'), 'N', '-k*x'),
      out('xa', 'x_{\\max}', T('相椭圆的 x 半轴', 'x semi-axis of the phase ellipse', 'x-Halbachse der Phasenellipse'), 'm', 'sqrt((p^2/m + k*x^2)/k)'),
      out('pa', 'p_{\\max}', T('相椭圆的 p 半轴', 'p semi-axis of the phase ellipse', 'p-Halbachse der Phasenellipse'), 'kg·m/s', 'sqrt(m*(p^2/m + k*x^2))')
    ],
    example: { text: T('m = 1、k = 4、x = 0.5、p = 0，使用一致单位。', 'm = 1, k = 4, x = 0.5, p = 0 in consistent units.', 'm = 1, k = 4, x = 0,5, p = 0 in konsistenten Einheiten.'), answer: T('H = 0.5；初始 ẋ = 0，ṗ = −2；轨道为相空间椭圆。', 'H = 0.5; initially ẋ = 0, ṗ = −2; the orbit is an ellipse in phase space.', 'H = 0,5; anfangs ẋ = 0, ṗ = −2; die Bahn ist eine Ellipse im Phasenraum.') },
    point: T('时间平移对应能量守恒；辛结构是长期动力学的重要约束。', 'Time translation gives energy conservation; the symplectic structure constrains long-term dynamics.', 'Zeittranslation ergibt Energieerhaltung; die symplektische Struktur bindet die Langzeitdynamik.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:M32', 'test:physics2652 Gauss–Legendre'],
    links: { templates: ['central-spring'] }, review: R2
  }
]
