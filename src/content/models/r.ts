/**
 * R01–R08: special relativity, weak gravity and stellar scales (blueprint §5.11; doc 02 §11). Speeds are in m/s with
 * c_light from the constant set; R06 and R07 are restricted analytic models (weak field) and say so.
 */
import type { ModelSpec } from './types'
import { L, T, cond, inp, let_, nonneg, out, pos } from './dsl'

const R2 = { physics: '2026-10-28', language: '2026-10-28' }
const C = 299792458
const YEAR = 365.25 * 86400
const vel = (id: string, symbol: string, label: ReturnType<typeof T>, value: number) => inp(id, symbol, label, 'm/s', 'velocity', value)
const massive = cond('sub', T('有质量物体：|v| < c', 'Massive body: |v| < c', 'Massiver Körper: |v| < c'), 'abs(v) < c_light')

export const MODELS_R: ModelSpec[] = [
  {
    id: 'R01', title: T('时间延缓与长度收缩', 'Time dilation and length contraction', 'Zeitdilatation und Längenkontraktion'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'line1d',
    assumptions: [T('惯性系，匀速相对运动；杆沿运动方向', 'Inertial frames in uniform relative motion; rod along the motion', 'Inertialsysteme in gleichförmiger Relativbewegung; Stab längs der Bewegung')],
    validity: T('固有量与坐标测量分清；长度比较要求在各自系同时测两端', 'Keep proper and coordinate quantities apart; lengths need both ends at the same time in the measuring frame', 'Eigen- und Koordinatengrößen trennen; Längen brauchen beide Enden gleichzeitig im messenden System'),
    sources: ['S37'],
    inputs: [vel('v', 'v', T('相对速度', 'Relative velocity', 'Relativgeschwindigkeit'), 0.6 * C), nonneg('tau', '\\Delta\\tau', T('固有时间间隔', 'Proper time interval', 'Eigenzeitintervall'), 's', 'time', 10), nonneg('L0', 'L_0', T('固有长度', 'Proper length', 'Eigenlänge'), 'm', 'length', 5)],
    lets: [let_('gam', '\\gamma', T('洛伦兹因子', 'Lorentz factor', 'Lorentzfaktor'), '', '1/sqrt(1 - (v/c_light)^2)')],
    conditions: [massive],
    outputs: [out('gam', '\\gamma', T('洛伦兹因子', 'Lorentz factor', 'Lorentzfaktor'), '', 'gam', { requires: ['sub'] }), out('dt', '\\Delta t', T('地面系测得的时间间隔', 'Interval measured on the ground', 'Im Bodensystem gemessenes Intervall'), 's', 'gam*tau', { requires: ['sub'] }), out('Lm', 'L', T('地面系测得的长度', 'Length measured on the ground', 'Im Bodensystem gemessene Länge'), 'm', 'L0/gam', { requires: ['sub'] })],
    example: { text: T('v = 0.6c，钟的固有时间间隔 10 s，杆固有长 5 m。', 'v = 0.6c, a clock’s proper interval 10 s, a rod of proper length 5 m.', 'v = 0,6c, Eigenzeitintervall einer Uhr 10 s, Stab mit Eigenlänge 5 m.'), answer: T('γ = 1.25；地面系测时间间隔 12.5 s，平行杆长 4 m。', 'γ = 1.25; the ground measures 12.5 s and a parallel rod of 4 m.', 'γ = 1,25; der Boden misst 12,5 s und einen parallelen Stab von 4 m.') },
    point: T('固有量与坐标测量要分清，长度比较要求各自系同时测两端。', 'Tell proper quantities from coordinate measurements; comparing lengths needs simultaneous end points in each frame.', 'Eigengrößen von Koordinatenmessungen unterscheiden; Längenvergleich braucht gleichzeitige Endpunkte im jeweiligen System.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:R01', 'rust:src/labs/relativity.rs textbook_values'],
    links: { labs: ['relativity'] }, review: R2
  },
  {
    id: 'R02', title: T('洛伦兹变换与同时性', 'Lorentz transformation and simultaneity', 'Lorentz-Transformation und Gleichzeitigkeit'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('标准构型：S′ 以 v 沿 x 轴运动，原点重合时 t = t′ = 0', 'Standard configuration: S′ moves at v along x, origins coincide at t = t′ = 0', 'Standardkonfiguration: S′ bewegt sich mit v längs x, Ursprünge fallen bei t = t′ = 0 zusammen')],
    validity: T('时空坐标的变换（不是屏幕旋转）；间隔 c²t² − x² 不变', 'A transformation of spacetime coordinates (not a rotation of the picture); the interval c²t² − x² is invariant', 'Eine Transformation der Raumzeitkoordinaten (keine Bilddrehung); das Intervall c²t² − x² ist invariant'),
    sources: ['S37'],
    inputs: [vel('v', 'v', T('S′ 的速度', 'Velocity of S′', 'Geschwindigkeit von S′'), 0.6 * C), inp('x', 'x', T('事件位置', 'Position of the event', 'Ort des Ereignisses'), 'm', 'length', 3 * C), inp('t', 't', T('事件时刻', 'Time of the event', 'Zeit des Ereignisses'), 's', 'time', 5)],
    lets: [let_('gam', '\\gamma', T('洛伦兹因子', 'Lorentz factor', 'Lorentzfaktor'), '', '1/sqrt(1 - (v/c_light)^2)')],
    conditions: [massive],
    outputs: [out('gam', '\\gamma', T('洛伦兹因子', 'Lorentz factor', 'Lorentzfaktor'), '', 'gam', { requires: ['sub'] }), out('x2', "x'", T('S′ 中位置', 'Position in S′', 'Ort in S′'), 'm', 'gam*(x - v*t)', { requires: ['sub'] }), out('t2', "t'", T('S′ 中时刻', 'Time in S′', 'Zeit in S′'), 's', 'gam*(t - v*x/c_light^2)', { requires: ['sub'] }), out('s2', 's^2', T('间隔 c²t² − x²', 'Interval c²t² − x²', 'Intervall c²t² − x²'), 'm²', 'c_light^2*t^2 - x^2')],
    example: { text: T('取 c = 1、v = 0.6，事件 x = 3、t = 5，使用一致时空单位（此处 x = 3 光秒、t = 5 s）。', 'With c = 1 and v = 0.6, the event x = 3, t = 5 in consistent units (here x = 3 light-seconds, t = 5 s).', 'Mit c = 1 und v = 0,6 das Ereignis x = 3, t = 5 in einheitlichen Einheiten (hier x = 3 Lichtsekunden, t = 5 s).'), answer: T('γ = 1.25，x′ = 0，t′ = 4；间隔 t²−x² = 16 保持不变。', 'γ = 1.25, x′ = 0, t′ = 4; the interval t² − x² = 16 is unchanged.', 'γ = 1,25, x′ = 0, t′ = 4; das Intervall t² − x² = 16 bleibt.') },
    point: T('时空坐标转换，不是屏幕视角旋转。', 'A change of spacetime coordinates, not a rotation of the view.', 'Ein Wechsel der Raumzeitkoordinaten, keine Drehung der Ansicht.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:R02', 'rust:src/labs/relativity.rs textbook_values'],
    links: { labs: ['relativity'] }, review: R2
  },
  {
    id: 'R03', title: T('相对论速度合成', 'Relativistic velocity addition', 'Relativistische Geschwindigkeitsaddition'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'line1d',
    assumptions: [T('共线运动；飞船相对地面 v，物体相对飞船 u′', 'Collinear motion; ship at v relative to the ground, object at u′ relative to the ship', 'Kollineare Bewegung; Schiff mit v gegen den Boden, Objekt mit u′ gegen das Schiff')],
    validity: T('|v| < c，|u′| ≤ c；不同方向用向量形式', '|v| < c, |u′| ≤ c; other directions need the vector form', '|v| < c, |u′| ≤ c; andere Richtungen brauchen die Vektorform'),
    sources: ['S37'],
    inputs: [vel('u1', "u'", T('物体相对飞船速度', 'Velocity relative to the ship', 'Geschwindigkeit gegen das Schiff'), 0.5 * C), vel('v', 'v', T('飞船相对地面速度', 'Velocity of the ship', 'Geschwindigkeit des Schiffs'), 0.5 * C)],
    conditions: [cond('valid', T('|v| < c 且 |u′| ≤ c', '|v| < c and |u′| ≤ c', '|v| < c und |u′| ≤ c'), 'abs(v) < c_light && abs(u1) <= c_light')],
    outputs: [out('u', 'u', T('地面测速度', 'Velocity on the ground', 'Geschwindigkeit im Bodensystem'), 'm/s', '(u1 + v)/(1 + u1*v/c_light^2)', { requires: ['valid'] }), out('uc', 'u_{cl}', T('经典相加（对比）', 'Classical sum (for comparison)', 'Klassische Summe (zum Vergleich)'), 'm/s', 'u1 + v')],
    example: { text: T('飞船相对地面 0.5c，飞船发射物相对船同向 0.5c。', 'A ship moves at 0.5c; it launches an object forward at 0.5c relative to itself.', 'Ein Schiff fliegt mit 0,5c; es startet ein Objekt mit 0,5c nach vorn.'), answer: T('地面测速度为 0.8c。', 'The ground measures 0.8c.', 'Der Boden misst 0,8c.') },
    point: T('经典加法是低速极限，光速不随惯性系改变。', 'Classical addition is the low-speed limit; the speed of light is the same in every frame.', 'Klassische Addition ist der Grenzfall kleiner Geschwindigkeiten; Licht ist in jedem System gleich schnell.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:R03', 'rust:src/labs/relativity.rs textbook_values'],
    links: { labs: ['relativity'] }, review: R2
  },
  {
    id: 'R04', title: T('相对论能量与动量', 'Relativistic energy and momentum', 'Relativistische Energie und Impuls'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('静质量不随速度变化', 'The rest mass does not change with speed', 'Die Ruhemasse hängt nicht von der Geschwindigkeit ab')],
    validity: T('动能用 β²γ²/(γ+1)·mc² 稳定求值，低速时不发生相消', 'Kinetic energy is evaluated stably as β²γ²/(γ + 1)·mc², without cancellation at low speed', 'Die kinetische Energie wird stabil als β²γ²/(γ + 1)·mc² berechnet, ohne Auslöschung bei kleinen Geschwindigkeiten'),
    sources: ['S37', 'S03'],
    inputs: [pos('m', 'm', T('静质量', 'Rest mass', 'Ruhemasse'), 'kg', 'mass', 9.1093837139e-31), vel('v', 'v', L.v, 0.6 * C)],
    lets: [let_('gam', '\\gamma', T('洛伦兹因子', 'Lorentz factor', 'Lorentzfaktor'), '', '1/sqrt(1 - (v/c_light)^2)')],
    conditions: [massive],
    outputs: [out('E0', 'E_0', T('静能', 'Rest energy', 'Ruheenergie'), 'J', 'm*c_light^2'), out('E', 'E', T('总能量', 'Total energy', 'Gesamtenergie'), 'J', 'gam*m*c_light^2', { requires: ['sub'] }), out('K', 'E_k', T('动能', 'Kinetic energy', 'Kinetische Energie'), 'J', '(v/c_light)^2*gam^2/(gam + 1)*m*c_light^2', { requires: ['sub'] }), out('pc', 'pc', T('动量 × c', 'Momentum × c', 'Impuls × c'), 'J', 'gam*m*v*c_light', { requires: ['sub'] })],
    example: { text: T('电子以 0.6c 运动，静能取 0.5110 MeV。', 'An electron at 0.6c; rest energy 0.5110 MeV.', 'Ein Elektron mit 0,6c; Ruheenergie 0,5110 MeV.'), answer: T('总能量 0.63875 MeV；动能 0.12775 MeV；pc = 0.38325 MeV。', 'Total energy 0.63875 MeV; kinetic 0.12775 MeV; pc = 0.38325 MeV.', 'Gesamtenergie 0,63875 MeV; kinetisch 0,12775 MeV; pc = 0,38325 MeV.') },
    point: T('静质量不随速度变；低速动能应稳定求差避免消减。', 'Rest mass does not change; at low speed compute the kinetic energy stably, without cancellation.', 'Die Ruhemasse bleibt; bei kleinen Geschwindigkeiten die kinetische Energie stabil berechnen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:R04', 'rust:src/labs/relativity.rs textbook_values'],
    links: { labs: ['relativity'] }, review: R2
  },
  {
    id: 'R05', title: T('固有时与双生子模型', 'Proper time and the twins', 'Eigenzeit und Zwillinge'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('往返两段匀速，速率相同；转向耗时忽略', 'Two legs at the same constant speed; the turnaround takes no time', 'Zwei Etappen mit gleicher konstanter Geschwindigkeit; die Wende dauert keine Zeit')],
    validity: T('比较同一出发与重逢事件之间的两条世界线；转向打破对称', 'Compares two worldlines between the same departure and reunion; the turnaround breaks the symmetry', 'Vergleicht zwei Weltlinien zwischen gleichem Abflug und Wiedersehen; die Wende bricht die Symmetrie'),
    sources: ['S37', 'S46'],
    inputs: [pos('Tg', 'T', T('地面总时间', 'Total time on the ground', 'Gesamtzeit am Boden'), 's', 'time', 10 * YEAR), vel('v', 'v', T('旅行速率', 'Travel speed', 'Reisegeschwindigkeit'), 0.8 * C)],
    conditions: [massive],
    outputs: [out('tau', '\\tau', T('旅行者固有时', 'Proper time of the traveller', 'Eigenzeit des Reisenden'), 's', 'Tg*sqrt(1 - (v/c_light)^2)', { requires: ['sub'] }), out('diff', 'T - \\tau', T('少经历的时间', 'Time the traveller misses', 'Zeit, die der Reisende weniger erlebt'), 's', 'Tg*(v/c_light)^2/(1 + sqrt(1 - (v/c_light)^2))', { requires: ['sub'] })],
    example: { text: T('理想化旅程：地面时间总 10 年，旅行者两段匀速速率均为 0.8c，转向耗时忽略。', 'An idealized trip: 10 years on the ground, the traveller goes out and back at 0.8c, turnaround instant.', 'Eine idealisierte Reise: 10 Jahre am Boden, der Reisende fliegt mit 0,8c hin und zurück, Wende ohne Zeit.'), answer: T('旅行者固有时为 10×0.6 = 6 年，比地面少 4 年。', 'The traveller ages 10 × 0.6 = 6 years, 4 years less than on the ground.', 'Der Reisende altert 10 × 0,6 = 6 Jahre, 4 Jahre weniger als am Boden.') },
    point: T('比较同一出发和重逢事件间不同世界线；转向打破对称。', 'Compare different worldlines between the same departure and reunion; the turnaround breaks the symmetry.', 'Verschiedene Weltlinien zwischen gleichem Abflug und Wiedersehen vergleichen; die Wende bricht die Symmetrie.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:R05', 'rust:src/labs/relativity.rs textbook_values'],
    links: { labs: ['relativity'] }, review: R2
  },
  {
    id: 'R06', title: T('弱引力场与引力红移', 'Weak gravity and gravitational redshift', 'Schwache Gravitation und Rotverschiebung'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'line1d',
    assumptions: [T('近地面均匀弱场，高度差远小于半径', 'A uniform weak field near the surface; the height difference is small compared with the radius', 'Homogenes schwaches Feld nahe der Oberfläche; Höhenunterschied klein gegen den Radius')],
    validity: T('受限：一阶弱场近似；与史瓦西结果的相对差约 h/R', 'Restricted: first-order weak field; differs from the Schwarzschild result by about h/R relative', 'Eingeschränkt: schwaches Feld erster Ordnung; relativer Unterschied zum Schwarzschild-Ergebnis etwa h/R'),
    restricted: T('均匀场一阶频移；完整度规与卫星钟暂缓', 'First-order shift in a uniform field; the full metric and satellite clocks deferred', 'Verschiebung erster Ordnung im homogenen Feld; volle Metrik und Satellitenuhren zurückgestellt'),
    sources: ['S46', 'S03'],
    inputs: [pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8), nonneg('h', 'h', T('高度差', 'Height difference', 'Höhenunterschied'), 'm', 'length', 100), pos('Rp', 'R', T('行星半径', 'Planetary radius', 'Planetenradius'), 'm', 'length', 6.371e6)],
    conditions: [cond('small', T('高度差 ≪ 行星半径（h/R < 0.0016）', 'Height ≪ planetary radius (h/R < 0.0016)', 'Höhe ≪ Planetenradius (h/R < 0,0016)'), 'h/Rp < 1.6e-3', 'h/Rp < 1.6e-2')],
    outputs: [out('df', '\\Delta f/f', T('频率相对差（上方钟更快）', 'Relative frequency difference (the upper clock runs faster)', 'Relativer Frequenzunterschied (die obere Uhr geht schneller)'), '', 'g*h/c_light^2', { requires: ['small'] })],
    example: { text: T('弱场近地面高度差 100 m，g = 9.8。', 'Near the ground in a weak field: 100 m height difference, g = 9.8.', 'Nahe dem Boden im schwachen Feld: 100 m Höhenunterschied, g = 9,8.'), answer: T('上方钟相对下方走得更快，频率相对差约 1.09040×10⁻¹⁴。', 'The upper clock runs faster by about 1.09040×10⁻¹⁴.', 'Die obere Uhr geht um etwa 1,09040×10⁻¹⁴ schneller.') },
    point: T('等效原理与势差；只是一阶弱场近似。', 'The equivalence principle and the potential difference; only a first-order weak-field approximation.', 'Äquivalenzprinzip und Potentialdifferenz; nur eine Näherung erster Ordnung.'),
    status: 'verified', level: 1, teaching: 0, references: ['otherMethod'], benchmarks: ['oracle:R06'],
    links: {}, review: R2
  },
  {
    id: 'R07', title: T('史瓦西时空与光线偏折', 'Schwarzschild spacetime and light deflection', 'Schwarzschild-Raumzeit und Lichtablenkung'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'plane',
    assumptions: [T('静态球对称质量，光线碰撞参数 b', 'Static spherical mass, light with impact parameter b', 'Statische kugelsymmetrische Masse, Licht mit Stoßparameter b')],
    validity: T('受限：弱偏折一阶 4GM/(bc²) 与二阶修正；b 小于 3√3·GM/c² 时光被俘获', 'Restricted: weak deflection to first order 4GM/(bc²) and the second-order correction; light is captured for b below 3√3·GM/c²', 'Eingeschränkt: schwache Ablenkung erster Ordnung 4GM/(bc²) und Korrektur zweiter Ordnung; unter b = 3√3·GM/c² wird Licht eingefangen'),
    restricted: T('弱场偏折（一阶与二阶）与俘获判据；强场测地线积分暂缓', 'Weak-field deflection (first and second order) and the capture criterion; strong-field geodesic integration deferred', 'Schwachfeldablenkung (erste und zweite Ordnung) und Einfangkriterium; Geodätenintegration im starken Feld zurückgestellt'),
    sources: ['S46'],
    inputs: [pos('M', 'M', T('质量', 'Mass', 'Masse'), 'kg', 'mass', (C * C) / 6.6743e-11), pos('b', 'b', T('碰撞参数', 'Impact parameter', 'Stoßparameter'), 'm', 'length', 100)],
    lets: [let_('mg', 'GM/c^2', T('引力长度', 'Gravitational length', 'Gravitationslänge'), 'm', 'G_grav*M/c_light^2')],
    conditions: [cond('escapes', T('光不被俘获（b > 3√3 GM/c²）', 'Light not captured (b > 3√3 GM/c²)', 'Licht nicht eingefangen (b > 3√3 GM/c²)'), 'b > 3*sqrt(3)*mg'), cond('weak', T('弱偏折（b > 2000 GM/c²）', 'Weak deflection (b > 2000 GM/c²)', 'Schwache Ablenkung (b > 2000 GM/c²)'), 'b > 2000*mg', 'b > 40*mg')],
    outputs: [out('rs', 'r_s', T('史瓦西半径', 'Schwarzschild radius', 'Schwarzschild-Radius'), 'm', '2*mg'), out('a1', '\\alpha_1', T('一阶偏折角', 'First-order deflection', 'Ablenkung erster Ordnung'), 'rad', '4*mg/b', { requires: ['escapes', 'weak'] }), out('a2', '\\alpha_2', T('含二阶修正的偏折角', 'Deflection with the second-order term', 'Ablenkung mit Term zweiter Ordnung'), 'rad', '4*mg/b + 15*pi/4*(mg/b)^2', { requires: ['escapes', 'weak'] })],
    example: { text: T('教学单位 c = G = 1，质量 M = 1，弱偏折参数 b = 100（此处以 GM/c² = 1 m、b = 100 m 表示）。', 'Teaching units c = G = 1, M = 1, impact parameter b = 100 (here GM/c² = 1 m and b = 100 m).', 'Unterrichtseinheiten c = G = 1, M = 1, Stoßparameter b = 100 (hier GM/c² = 1 m und b = 100 m).'), answer: T('史瓦西半径 2；弱场偏折角约 0.04 rad（二阶修正后约 0.0412 rad）。', 'Schwarzschild radius 2; weak-field deflection about 0.04 rad (about 0.0412 rad with the second-order term).', 'Schwarzschild-Radius 2; Schwachfeldablenkung etwa 0,04 rad (mit Term zweiter Ordnung etwa 0,0412 rad).') },
    point: T('时空几何和测地线；强场不能沿用弱偏折公式。', 'Spacetime geometry and geodesics; the weak formula does not hold in strong fields.', 'Raumzeitgeometrie und Geodäten; die Schwachfeldformel gilt nicht im starken Feld.'),
    status: 'verified', level: 1, teaching: 0, references: ['otherMethod'], benchmarks: ['oracle:R07'],
    links: {}, review: R2
  },
  {
    id: 'R08', title: T('恒星辐射与尺度', 'Stellar radiation and size', 'Sternstrahlung und Größe'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'space3d',
    assumptions: [T('恒星视为有效温度 T 的球形黑体', 'A star as a spherical black body of effective temperature T', 'Ein Stern als kugelförmiger schwarzer Körper mit Effektivtemperatur T')],
    validity: T('本征光度与距离造成的视亮度不同；有效温度是黑体近似', 'Intrinsic luminosity differs from the apparent brightness set by distance; the effective temperature is a black-body approximation', 'Leuchtkraft ist nicht die entfernungsabhängige scheinbare Helligkeit; die Effektivtemperatur ist eine Schwarzkörpernäherung'),
    sources: ['S38', 'S47'],
    inputs: [pos('Rs', 'R', T('恒星半径', 'Radius of the star', 'Sternradius'), 'm', 'length', 6.957e8), inp('Ts', 'T_{eff}', T('有效温度', 'Effective temperature', 'Effektivtemperatur'), 'K', 'temperature', 5772, { kind: 'temperature', min: 0, open: true }), pos('Lr', 'L/L_{ref}', T('光度比', 'Luminosity ratio', 'Leuchtkraftverhältnis'), '', 'ratio', 4), pos('Tr', 'T/T_{ref}', T('温度比', 'Temperature ratio', 'Temperaturverhältnis'), '', 'ratio', 1)],
    outputs: [out('Lum', 'L', T('光度', 'Luminosity', 'Leuchtkraft'), 'W', '4*pi*Rs^2*sigma_SB*Ts^4'), out('Rr', 'R/R_{ref}', T('半径比', 'Radius ratio', 'Radienverhältnis'), '', 'sqrt(Lr)/Tr^2')],
    example: { text: T('理想化恒星总光度为参照星的 4 倍、有效温度相同，求半径比。', 'An idealized star with four times the luminosity of a reference star at the same effective temperature: the radius ratio.', 'Ein idealisierter Stern mit vierfacher Leuchtkraft eines Vergleichssterns bei gleicher Effektivtemperatur: das Radienverhältnis.'), answer: T('R/Rref = √4 = 2；若温度相同，光度随半径平方变化。', 'R/Rref = √4 = 2; at equal temperature the luminosity goes with the radius squared.', 'R/Rref = √4 = 2; bei gleicher Temperatur wächst die Leuchtkraft mit dem Radiusquadrat.') },
    point: T('观测量到模型参数的反演，黑体有效温度是近似。', 'Inferring model parameters from observations; the black-body effective temperature is an approximation.', 'Modellparameter aus Beobachtungen; die Schwarzkörper-Effektivtemperatur ist eine Näherung.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:R08'],
    links: {}, review: R2
  }
]
