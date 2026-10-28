/**
 * M01–M16: kinematics, forces, friction, energy, connected bodies (blueprint §5.2; doc 02 §2).
 */
import type { ModelSpec } from './types'
import { A, L, T, angle, cond, deg, inp, let_, nonneg, out, pos, roots } from './dsl'

const R2 = { physics: '2026-10-28', language: '2026-10-28' }

export const MODELS_M1: ModelSpec[] = [
  {
    id: 'M01', title: T('匀速运动与参考系', 'Uniform motion and frames of reference', 'Gleichförmige Bewegung und Bezugssysteme'),
    stages: ['j'], priority: 'P1', geometry: 'point',
    assumptions: [A.point, T('观察者以速度 u 匀速运动，t = 0 时两坐标原点重合（伽利略变换）', 'The observer moves uniformly at u; the origins coincide at t = 0 (Galilean transformation)', 'Der Beobachter bewegt sich gleichförmig mit u; die Ursprünge fallen bei t = 0 zusammen (Galilei-Transformation)')],
    validity: T('速度远小于光速', 'Speeds far below the speed of light', 'Geschwindigkeiten weit unter der Lichtgeschwindigkeit'),
    sources: ['S10', 'S11'],
    inputs: [inp('x0', 'x_0', T('初位置', 'Initial position', 'Anfangsort'), 'm', 'length', 2), inp('v', 'v', L.v, 'm/s', 'velocity', 3), inp('u', 'u', T('观察者的速度', 'Velocity of the observer', 'Geschwindigkeit des Beobachters'), 'm/s', 'velocity', 1), nonneg('t', 't', L.t, 's', 'time', 4)],
    outputs: [
      out('x', 'x', T('地面系中的位置', 'Position in the ground frame', 'Ort im Bodensystem'), 'm', 'x0 + v*t'),
      out('xp', "x'", T('观察者系中的位置', 'Position in the observer’s frame', 'Ort im Beobachtersystem'), 'm', 'x0 + (v - u)*t'),
      out('vp', "v'", T('相对速度', 'Relative velocity', 'Relativgeschwindigkeit'), 'm/s', 'v - u'),
      out('xBack', 'x', T('由 x′ 反变换回地面系', 'Back from x′ to the ground frame', 'Von x′ zurück ins Bodensystem'), 'm', 'x0 + (v - u)*t + u*t')
    ],
    example: { text: T('物体 x0 = 2 m，v = 3 m/s；观察者以 1 m/s 同向运动，求 4 s 后位置与相对速度。', 'A body with x0 = 2 m, v = 3 m/s; an observer moves at 1 m/s the same way. Position and relative velocity after 4 s?', 'Ein Körper mit x0 = 2 m, v = 3 m/s; ein Beobachter bewegt sich mit 1 m/s in dieselbe Richtung. Ort und Relativgeschwindigkeit nach 4 s?'), answer: T('地面系 x = 14 m；同原点参考系 x′ = 10 m，v′ = 2 m/s。', 'Ground frame x = 14 m; observer frame with the same origin x′ = 10 m, v′ = 2 m/s.', 'Bodensystem x = 14 m; Beobachtersystem mit gleichem Ursprung x′ = 10 m, v′ = 2 m/s.') },
    point: T('同一运动在不同参考系有不同描述。', 'The same motion is described differently in different frames.', 'Dieselbe Bewegung wird in verschiedenen Bezugssystemen verschieden beschrieben.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M01', 'test:derivationsC the steps hold numerically in the recognised template situations'],
    links: { situations: ['uniform'], topics: ['motion'] }, review: R2
  },
  {
    id: 'M02', title: T('匀变速直线运动', 'Uniformly accelerated motion in a line', 'Gleichmäßig beschleunigte geradlinige Bewegung'),
    stages: ['s'], priority: 'P1', geometry: 'point',
    assumptions: [A.point, T('加速度恒定', 'Constant acceleration', 'Konstante Beschleunigung')],
    validity: T('只有加速度恒定时闭式公式成立', 'The closed forms hold only for a constant acceleration', 'Die geschlossenen Formeln gelten nur bei konstanter Beschleunigung'),
    sources: ['S10'],
    inputs: [inp('x0', 'x_0', T('初位置', 'Initial position', 'Anfangsort'), 'm', 'length', 0), inp('v0', 'v_0', L.v0, 'm/s', 'velocity', 2), inp('a', 'a', L.a, 'm/s²', 'acceleration', 3), nonneg('t', 't', L.t, 's', 'time', 4)],
    outputs: [
      out('v', 'v', L.v, 'm/s', 'v0 + a*t'),
      out('x', 'x', L.x, 'm', 'x0 + v0*t + a*t^2/2'),
      out('s', '\\Delta x', T('位移', 'Displacement', 'Verschiebung'), 'm', 'v0*t + a*t^2/2'),
      out('v2', 'v', T('由 v² − v0² = 2aΔx 求速率', 'Speed from v² − v0² = 2aΔx', 'Betrag aus v² − v0² = 2aΔx'), 'm/s', 'sqrt(v0^2 + 2*a*(v0*t + a*t^2/2))')
    ],
    example: { text: T('x0 = 0，v0 = 2 m/s，a = 3 m/s²，t = 4 s。', 'x0 = 0, v0 = 2 m/s, a = 3 m/s², t = 4 s.', 'x0 = 0, v0 = 2 m/s, a = 3 m/s², t = 4 s.'), answer: T('v = 2 + 12 = 14 m/s；位移 = 8 + 24 = 32 m。', 'v = 2 + 12 = 14 m/s; displacement = 8 + 24 = 32 m.', 'v = 2 + 12 = 14 m/s; Verschiebung = 8 + 24 = 32 m.') },
    point: T('只有加速度恒定才能直接使用这组闭式公式。', 'Only a constant acceleration allows these closed forms.', 'Nur bei konstanter Beschleunigung gelten diese geschlossenen Formeln.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M02', 'test:acceptance', 'test:derivationsC the steps hold numerically in the recognised template situations'],
    links: { situations: ['const-force'], topics: ['motion'] }, review: R2
  },
  {
    id: 'M03', title: T('自由落体与事件时刻', 'Free fall and the time of an event', 'Freier Fall und Ereigniszeitpunkt'),
    stages: ['s'], priority: 'P1', geometry: 'point',
    assumptions: [A.point, A.noDrag, A.uniformG, T('落地是事件：落地前读数取事件左极限，碰撞后取右极限（恢复系数 e）', 'Landing is an event: the reading before it is the left limit, after the impact the right limit (coefficient of restitution e)', 'Der Aufprall ist ein Ereignis: der Wert davor ist der linksseitige Grenzwert, danach der rechtsseitige (Stoßzahl e)')],
    validity: T('从静止释放；h ≥ 0；阻力可忽略（下落速度远小于终端速度）', 'Released from rest; h ≥ 0; drag negligible (speed far below the terminal speed)', 'Aus der Ruhe losgelassen; h ≥ 0; Luftwiderstand vernachlässigbar (weit unter der Endgeschwindigkeit)'),
    sources: ['S10', 'S12'],
    inputs: [nonneg('h', 'h', L.h, 'm', 'length', 20), pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8), inp('e', 'e', L.e, '', 'ratio', 0, { min: 0, max: 1 })],
    outputs: [
      out('t', 't_f', T('落地时刻', 'Time of landing', 'Zeitpunkt des Aufpralls'), 's', 'sqrt(2*h/g)'),
      out('vBefore', 'v_f^-', T('落地前瞬间的速率', 'Speed just before landing', 'Geschwindigkeit kurz vor dem Aufprall'), 'm/s', 'sqrt(2*g*h)'),
      out('vAfter', 'v_f^+', T('碰撞后瞬间的速率', 'Speed just after the impact', 'Geschwindigkeit kurz nach dem Aufprall'), 'm/s', 'e*sqrt(2*g*h)'),
      out('hBounce', 'h_1', T('第一次反弹高度', 'Height of the first bounce', 'Höhe des ersten Rücksprungs'), 'm', 'e^2*h')
    ],
    example: { text: T('从 20 m 高静止释放，g = 9.8 m/s²，不计阻力。', 'Released from rest 20 m up, g = 9.8 m/s², no air resistance.', 'Aus 20 m Höhe aus der Ruhe losgelassen, g = 9,8 m/s², ohne Luftwiderstand.'), answer: T('t = 2.02031 s；落地前速率为 19.7990 m/s。', 't = 2.02031 s; speed just before landing 19.7990 m/s.', 't = 2,02031 s; Geschwindigkeit kurz vor dem Aufprall 19,7990 m/s.') },
    point: T('落地前与碰撞后读数不同；必须定义事件左右极限。', 'Readings before landing and after the impact differ; the left and right limits of the event must be defined.', 'Werte vor dem Aufprall und nach dem Stoß sind verschieden; links- und rechtsseitiger Grenzwert des Ereignisses müssen festgelegt sein.'),
    status: 'verified', level: 3, teaching: 2, references: ['analytic', 'otherMethod'],
    benchmarks: ['oracle:M03', 'test:loop1 free fall event time and both sides', 'test:loop1 step convergence', 'test:acceptance'],
    links: { situations: ['projectile'], activities: ['act-freefall'], topics: ['motion'] }, review: R2
  },
  {
    id: 'M04', title: T('斜抛运动', 'Oblique projectile motion', 'Schiefer Wurf'),
    stages: ['s'], priority: 'P1', geometry: 'point',
    assumptions: [A.point, A.noDrag, A.uniformG],
    validity: T('射程与飞行时间的简式要求起落同高；高台抛出时解 y = 0 的正根', 'The short range and flight-time formulas need equal launch and landing heights; from a platform solve y = 0 for its positive root', 'Die kurzen Formeln für Wurfweite und Flugzeit verlangen gleiche Abwurf- und Landehöhe; vom Podest die positive Lösung von y = 0'),
    sources: ['S11'],
    inputs: [nonneg('v0', 'v_0', L.v0, 'm/s', 'velocity', 20), angle('theta', '\\theta', T('抛射角', 'Launch angle', 'Abwurfwinkel'), deg(30), { min: -Math.PI / 2, max: Math.PI / 2 }), pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8), inp('h0', 'h_0', T('抛出点比落地面高', 'Height of the launch point above the landing level', 'Höhe des Abwurfpunkts über der Landeebene'), 'm', 'length', 0)],
    lets: [let_('vy', 'v_{0y}', T('竖直初速度', 'Vertical initial velocity', 'Senkrechte Anfangsgeschwindigkeit'), 'm/s', 'v0*sin(theta)'), let_('vx', 'v_{0x}', T('水平初速度', 'Horizontal initial velocity', 'Waagerechte Anfangsgeschwindigkeit'), 'm/s', 'v0*cos(theta)')],
    conditions: [
      cond('sameHeight', T('起落同高', 'Launch and landing at the same height', 'Abwurf und Landung auf gleicher Höhe'), 'abs(h0) <= 1e-9*v0^2/g'),
      cond('lands', T('能落到该高度', 'It reaches that level', 'Er erreicht diese Höhe'), 'vy^2 + 2*g*h0 >= 0'),
      cond('rises', T('向上抛出', 'Thrown upwards', 'Nach oben geworfen'), 'vy > 0')
    ],
    outputs: [
      out('Tsame', 'T', T('飞行时间（同高）', 'Time of flight (equal heights)', 'Flugzeit (gleiche Höhe)'), 's', '2*vy/g', { requires: ['sameHeight'] }),
      out('Rsame', 'R', T('射程（同高）', 'Range (equal heights)', 'Wurfweite (gleiche Höhe)'), 'm', 'v0^2*sin(2*theta)/g', { requires: ['sameHeight'] }),
      out('T', 'T', T('飞行时间（一般）', 'Time of flight (general)', 'Flugzeit (allgemein)'), 's', '(vy + sqrt(vy^2 + 2*g*h0))/g', { requires: ['lands'] }),
      out('R', 'R', T('射程（一般）', 'Range (general)', 'Wurfweite (allgemein)'), 'm', 'vx*(vy + sqrt(vy^2 + 2*g*h0))/g', { requires: ['lands'] }),
      out('H', 'H', T('最高点相对抛出点的高度', 'Highest point above the launch point', 'Höchster Punkt über dem Abwurfpunkt'), 'm', 'vy^2/(2*g)', { requires: ['rises'] }),
      roots('tLand', 't', T('y = 0 的根（只取正根）', 'Roots of y = 0 (positive only)', 'Lösungen von y = 0 (nur positive)'), 's', { var: 't', f: 'h0 + vy*t - g*t^2/2', lo: '0', hi: '2*(abs(vy) + sqrt(2*g*abs(h0)))/g', accept: 't > 0' })
    ],
    example: { text: T('v0 = 20 m/s，θ = 30°，g = 9.8 m/s²，同高度起落。', 'v0 = 20 m/s, θ = 30°, g = 9.8 m/s², equal launch and landing heights.', 'v0 = 20 m/s, θ = 30°, g = 9,8 m/s², gleiche Abwurf- und Landehöhe.'), answer: T('T = 2.04082 s；R = 35.3480 m；最高点相对起点高 5.10204 m。', 'T = 2.04082 s; R = 35.3480 m; the highest point is 5.10204 m above the start.', 'T = 2,04082 s; R = 35,3480 m; der höchste Punkt liegt 5,10204 m über dem Start.') },
    point: T('分运动独立；射程式要求同高度且无阻力。', 'The component motions are independent; the range formula needs equal heights and no drag.', 'Die Teilbewegungen sind unabhängig; die Wurfweitenformel verlangt gleiche Höhen und keinen Luftwiderstand.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M04', 'test:acceptance 5 projectile'],
    links: { situations: ['projectile'], topics: ['motion'] }, review: R2
  },
  {
    id: 'M05', title: T('追及与分段运动', 'Pursuit and piecewise motion', 'Verfolgung und abschnittsweise Bewegung'),
    stages: ['s'], priority: 'P1', geometry: 'point',
    assumptions: [A.point, T('A 从原点、B 从前方 d 处同时同向出发，各自匀速', 'A starts at the origin and B a distance d ahead at the same time, the same way, each at constant velocity', 'A startet im Ursprung, B gleichzeitig im Abstand d davor in dieselbe Richtung, jeweils gleichförmig')],
    validity: T('相遇时刻必须为正且在观察时段内', 'The meeting time must be positive and within the observed interval', 'Der Treffzeitpunkt muss positiv und im Beobachtungszeitraum liegen'),
    sources: ['S10'],
    inputs: [inp('vA', 'v_A', T('A 的速度', 'Velocity of A', 'Geschwindigkeit von A'), 'm/s', 'velocity', 5), inp('d', 'd', T('B 领先的距离', 'Lead of B', 'Vorsprung von B'), 'm', 'length', 12), inp('vB', 'v_B', T('B 的速度', 'Velocity of B', 'Geschwindigkeit von B'), 'm/s', 'velocity', 2), pos('tMax', 't_{\\max}', T('观察时长', 'Observed duration', 'Beobachtungsdauer'), 's', 'time', 100)],
    conditions: [cond('closes', T('A 比 B 快（距离在缩小）', 'A is faster than B (the gap closes)', 'A ist schneller als B (der Abstand schrumpft)'), 'vA > vB')],
    outputs: [
      roots('t', 't', T('相遇时刻', 'Meeting time', 'Treffzeitpunkt'), 's', { var: 't', f: 'vA*t - (d + vB*t)', lo: '0', hi: 'tMax', accept: 't >= 0' }),
      out('tc', 't', T('相遇时刻（闭式）', 'Meeting time (closed form)', 'Treffzeitpunkt (geschlossen)'), 's', 'd/(vA - vB)', { requires: ['closes'] }),
      out('x', 'x', T('相遇位置', 'Meeting position', 'Treffpunkt'), 'm', 'vA*d/(vA - vB)', { requires: ['closes'] })
    ],
    example: { text: T('A 从原点以 5 m/s 前进；B 在前方 12 m，以 2 m/s 同向运动。', 'A starts at the origin at 5 m/s; B is 12 m ahead at 2 m/s the same way.', 'A startet im Ursprung mit 5 m/s; B ist 12 m voraus mit 2 m/s in dieselbe Richtung.'), answer: T('令 5t = 12 + 2t，t = 4 s，相遇位置 20 m。', '5t = 12 + 2t gives t = 4 s, meeting at 20 m.', '5t = 12 + 2t ergibt t = 4 s, Treffpunkt bei 20 m.') },
    point: T('交点既是位置相等条件，也是事件求根问题。', 'The meeting point is both an equal-position condition and a root-finding problem for an event.', 'Der Treffpunkt ist sowohl Ortsgleichheit als auch eine Nullstellensuche für ein Ereignis.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M05', 'test:sim2656 M05 pursuit', 'regress:engine template pursuit'],
    links: { topics: ['motion'] }, review: R2
  },
  {
    id: 'M06', title: T('两绳悬挂与静力平衡', 'Two ropes and static equilibrium', 'Zwei Seile und statisches Gleichgewicht'),
    stages: ['s'], priority: 'P1', geometry: 'plane',
    assumptions: [T('两根对称轻绳只能拉不能推', 'Two symmetric light ropes that can only pull', 'Zwei symmetrische leichte Seile, die nur ziehen können'), A.uniformG],
    validity: T('绳与水平夹角大于 0；夹角趋于 0 时张力无限增大', 'The angle to the horizontal is above 0; the tension grows without limit as it goes to 0', 'Der Winkel zur Waagerechten ist größer als 0; gegen 0 wächst die Seilkraft unbegrenzt'),
    sources: ['S12', 'S79'],
    inputs: [pos('m', 'm', L.m, 'kg', 'mass', 10), pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8), angle('alpha', '\\alpha', T('绳与水平的夹角', 'Angle of the ropes to the horizontal', 'Winkel der Seile zur Waagerechten'), deg(30), { min: 0, max: Math.PI / 2 })],
    conditions: [cond('notFlat', T('绳不水平', 'The ropes are not horizontal', 'Die Seile sind nicht waagerecht'), 'alpha > 1e-6')],
    outputs: [
      out('T', 'T', T('每根绳的张力', 'Tension of each rope', 'Kraft in jedem Seil'), 'N', 'm*g/(2*sin(alpha))', { requires: ['notFlat'] }),
      out('Th', 'T_x', T('张力的水平分量', 'Horizontal component of the tension', 'Waagerechter Anteil der Seilkraft'), 'N', 'm*g*cos(alpha)/(2*sin(alpha))', { requires: ['notFlat'] })
    ],
    example: { text: T('质量 10 kg，两根对称轻绳与水平夹角各 30°，g = 9.8 m/s²。', 'A 10 kg mass hangs from two symmetric light ropes, each at 30° to the horizontal, g = 9.8 m/s².', 'Eine Masse von 10 kg hängt an zwei symmetrischen leichten Seilen, je 30° zur Waagerechten, g = 9,8 m/s².'), answer: T('2T × 0.5 = 98，故每根绳张力 98 N。', '2T × 0.5 = 98, so each rope carries 98 N.', '2T × 0,5 = 98, also trägt jedes Seil 98 N.') },
    point: T('对同一物体列平衡方程；绳只能拉不能推。', 'Write the equilibrium of one body; a rope can only pull.', 'Gleichgewicht für einen Körper aufstellen; ein Seil kann nur ziehen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M06', 'test:sim2656 M06 two ropes', 'regress:engine template two-ropes'],
    links: { topics: ['friction'] }, review: R2
  },
  {
    id: 'M07', title: T('粗糙斜面滑动', 'Sliding on a rough incline', 'Gleiten auf der rauen schiefen Ebene'),
    stages: ['s'], priority: 'P1', geometry: 'plane',
    assumptions: [A.point, A.coulomb, A.uniformG, T('沿斜面向下为正', 'Down the incline is positive', 'Hangabwärts positiv')],
    validity: T('物块与固定斜面保持接触；摩擦方向由相对滑动方向决定；静止时用静摩擦不等式', 'The block stays on the fixed incline; friction opposes the relative sliding; at rest the static inequality decides', 'Der Klotz bleibt auf der festen Ebene; die Reibung wirkt der Relativbewegung entgegen; in Ruhe entscheidet die Haftreibungsungleichung'),
    sources: ['S12', 'S49'],
    inputs: [pos('m', 'm', L.m, 'kg', 'mass', 2), angle('theta', '\\theta', L.theta, deg(30), { min: 0, max: Math.PI / 2, open: true }), nonneg('muS', '\\mu_s', L.muS, '', 'ratio', 0.25), nonneg('muK', '\\mu_k', L.muK, '', 'ratio', 0.2), pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8), inp('v0', 'v_0', T('沿斜面的初速度（向下为正）', 'Initial velocity along the incline (down positive)', 'Anfangsgeschwindigkeit längs der Ebene (abwärts positiv)'), 'm/s', 'velocity', 1)],
    conditions: [
      cond('slideDown', T('相对斜面向下滑', 'Sliding down the incline', 'Gleitet hangabwärts'), 'v0 > 0 || abs(v0) <= 0 && tan(theta) > muS'),
      cond('slideUp', T('相对斜面向上滑', 'Sliding up the incline', 'Gleitet hangaufwärts'), 'v0 < 0'),
      cond('stick', T('静止且静摩擦足够', 'At rest with enough static friction', 'In Ruhe, Haftreibung reicht'), 'abs(v0) <= 0 && tan(theta) <= muS')
    ],
    outputs: [
      out('a', 'a', T('沿斜面的加速度', 'Acceleration along the incline', 'Beschleunigung längs der Ebene'), 'm/s²', 'g*(sin(theta) - muK*cos(theta))', { when: 'slideDown', branch: T('向下滑：摩擦沿斜面向上', 'Sliding down: friction up the incline', 'Gleitet abwärts: Reibung hangaufwärts') }),
      out('a', 'a', T('沿斜面的加速度', 'Acceleration along the incline', 'Beschleunigung längs der Ebene'), 'm/s²', 'g*(sin(theta) + muK*cos(theta))', { when: 'slideUp', branch: T('向上滑：摩擦沿斜面向下', 'Sliding up: friction down the incline', 'Gleitet aufwärts: Reibung hangabwärts') }),
      out('a', 'a', T('沿斜面的加速度', 'Acceleration along the incline', 'Beschleunigung längs der Ebene'), 'm/s²', '0*g', { when: 'stick', branch: T('静止：静摩擦平衡重力分力', 'At rest: static friction balances the weight component', 'In Ruhe: Haftreibung hält dem Hangabtrieb das Gleichgewicht') }),
      out('N', 'N', L.N, 'N', 'm*g*cos(theta)'),
      out('f', 'f', T('摩擦力大小', 'Size of the friction force', 'Betrag der Reibungskraft'), 'N', 'muK*m*g*cos(theta)', { when: 'slideDown' }),
      out('f', 'f', T('摩擦力大小', 'Size of the friction force', 'Betrag der Reibungskraft'), 'N', 'muK*m*g*cos(theta)', { when: 'slideUp' }),
      out('f', 'f', T('摩擦力大小', 'Size of the friction force', 'Betrag der Reibungskraft'), 'N', 'm*g*sin(theta)', { when: 'stick' })
    ],
    example: { text: T('物块已沿 30° 斜面下滑，μk = 0.2，g = 9.8 m/s²。', 'A block already slides down a 30° incline, μk = 0.2, g = 9.8 m/s².', 'Ein Klotz gleitet bereits eine 30°-Ebene hinab, μk = 0,2, g = 9,8 m/s².'), answer: T('a = 3.20259 m/s²，方向向下。', 'a = 3.20259 m/s², down the incline.', 'a = 3,20259 m/s², hangabwärts.') },
    point: T('静摩擦判定与滑动后的动摩擦公式应分开。', 'Keep the static-friction test apart from the kinetic formula after sliding starts.', 'Haftreibungstest und Gleitreibungsformel getrennt halten.'),
    status: 'verified', level: 3, teaching: 2, references: ['analytic', 'otherMethod'],
    benchmarks: ['oracle:M07', 'test:loop1 incline three branches', 'test:acceptance 1 incline slider', 'test:ux2656 keyboard M07'],
    links: { situations: ['incline'], activities: ['act-incline'], topics: ['friction'] }, review: R2
  },
  {
    id: 'M08', title: T('静摩擦阈值与滑动切换', 'Static-friction threshold and the switch to sliding', 'Haftreibungsgrenze und Übergang zum Gleiten'),
    stages: ['s'], priority: 'P1', geometry: 'plane',
    assumptions: [A.point, A.coulomb, T('水平面上的物块受水平拉力 F', 'A block on level ground pulled horizontally by F', 'Ein Klotz auf waagerechtem Boden, waagerecht mit F gezogen')],
    validity: T('静摩擦只在需要时出现，大小 ≤ μsN；滑动后为 μkN', 'Static friction is only as large as needed, up to μsN; once sliding it is μkN', 'Die Haftreibung ist nur so groß wie nötig, höchstens μsN; beim Gleiten μkN'),
    sources: ['S12', 'S49', 'S50'],
    inputs: [pos('m', 'm', L.m, 'kg', 'mass', 2), nonneg('muS', '\\mu_s', L.muS, '', 'ratio', 0.4), nonneg('muK', '\\mu_k', L.muK, '', 'ratio', 0.3), pos('g', 'g', L.g, 'm/s²', 'acceleration', 10), nonneg('F', 'F', T('水平拉力', 'Horizontal pull', 'Waagerechte Zugkraft'), 'N', 'force', 6), nonneg('v0', 'v_0', T('初速度（沿 F 方向）', 'Initial velocity (along F)', 'Anfangsgeschwindigkeit (in Richtung F)'), 'm/s', 'velocity', 0)],
    lets: [let_('fmax', 'f_{s,\\max}', T('最大静摩擦力', 'Maximum static friction', 'Maximale Haftreibung'), 'N', 'muS*m*g')],
    conditions: [
      cond('static', T('静止且拉力不超过最大静摩擦力', 'At rest and the pull does not exceed the maximum static friction', 'In Ruhe und Zug nicht größer als die maximale Haftreibung'), 'v0 <= 0 && F <= fmax'),
      cond('sliding', T('滑动（已在运动或拉力超过最大静摩擦力）', 'Sliding (already moving or the pull exceeds the maximum static friction)', 'Gleiten (bereits in Bewegung oder Zug über der maximalen Haftreibung)'), 'v0 > 0 || F > fmax')
    ],
    outputs: [
      out('fmax', 'f_{s,\\max}', T('最大静摩擦力', 'Maximum static friction', 'Maximale Haftreibung'), 'N', 'fmax'),
      out('f', 'f', T('摩擦力', 'Friction force', 'Reibungskraft'), 'N', 'F', { when: 'static', branch: T('静摩擦：等于拉力（不是 μsN）', 'Static: equal to the pull (not μsN)', 'Haftreibung: gleich dem Zug (nicht μsN)') }),
      out('f', 'f', T('摩擦力', 'Friction force', 'Reibungskraft'), 'N', 'muK*m*g', { when: 'sliding', branch: T('滑动摩擦 μkN', 'Kinetic μkN', 'Gleitreibung μkN') }),
      out('a', 'a', L.a, 'm/s²', '0*g', { when: 'static', branch: T('静止', 'At rest', 'In Ruhe') }),
      out('a', 'a', L.a, 'm/s²', '(F - muK*m*g)/m', { when: 'sliding', branch: T('滑动', 'Sliding', 'Gleiten') })
    ],
    example: { text: T('2 kg 物块，μs = 0.4、μk = 0.3，g = 10；水平拉力从 6 N 升至 10 N。', 'A 2 kg block, μs = 0.4, μk = 0.3, g = 10; the horizontal pull rises from 6 N to 10 N.', 'Ein 2-kg-Klotz, μs = 0,4, μk = 0,3, g = 10; der waagerechte Zug steigt von 6 N auf 10 N.'), answer: T('最大静摩擦 8 N；6 N 时静止且摩擦 6 N；滑动后摩擦 6 N，加速度 2 m/s²。', 'Maximum static friction 8 N; at 6 N it stays at rest with 6 N of friction; sliding (10 N) it has 6 N of friction and 2 m/s².', 'Maximale Haftreibung 8 N; bei 6 N bleibt er in Ruhe mit 6 N Reibung; beim Gleiten (10 N) 6 N Reibung und 2 m/s².') },
    point: T('静摩擦通常不等于 μsN。', 'Static friction is usually not μsN.', 'Die Haftreibung ist meist nicht μsN.'),
    status: 'verified', level: 3, teaching: 2, references: ['analytic', 'otherMethod'],
    benchmarks: ['oracle:M08', 'test:loop1 threshold both sides and re-stick', 'test:acceptance'],
    links: { situations: ['flat', 'incline'], activities: ['act-static'], topics: ['friction'] }, review: R2
  },
  {
    id: 'M09', title: T('功 能量与机械效率', 'Work, energy and efficiency', 'Arbeit, Energie und Wirkungsgrad'),
    stages: ['j', 's'], priority: 'P1', geometry: 'point',
    assumptions: [T('恒力 F 与位移夹角 θ；滑动摩擦 f 恒定；以动能增加为有用功', 'Constant force F at θ to the displacement; constant kinetic friction f; the gain of kinetic energy is the useful work', 'Konstante Kraft F unter θ zur Verschiebung; konstante Gleitreibung f; die Zunahme der kinetischen Energie ist die Nutzarbeit')],
    validity: T('输入功为零时效率无定义', 'The efficiency is undefined when the input work is zero', 'Ohne zugeführte Arbeit ist der Wirkungsgrad undefiniert'),
    sources: ['S13'],
    inputs: [nonneg('F', 'F', T('拉力', 'Pull', 'Zugkraft'), 'N', 'force', 10), nonneg('s', 's', T('位移', 'Displacement', 'Verschiebung'), 'm', 'length', 5), angle('theta', '\\theta', T('力与位移的夹角', 'Angle between force and displacement', 'Winkel zwischen Kraft und Verschiebung'), 0), nonneg('f', 'f', T('摩擦力', 'Friction force', 'Reibungskraft'), 'N', 'force', 4), nonneg('Ek0', 'E_{k0}', T('初动能', 'Initial kinetic energy', 'Anfängliche kinetische Energie'), 'J', 'energy', 0)],
    conditions: [cond('input', T('输入功大于零', 'The input work is positive', 'Die zugeführte Arbeit ist positiv'), 'F*s*cos(theta) > 0')],
    outputs: [
      out('Win', 'W_F', T('拉力做的功', 'Work of the pull', 'Arbeit der Zugkraft'), 'J', 'F*s*cos(theta)'),
      out('Q', 'Q', T('摩擦耗散', 'Friction loss', 'Reibungsverlust'), 'J', 'f*s'),
      out('Ek', 'E_k', T('末动能', 'Final kinetic energy', 'Kinetische Endenergie'), 'J', 'Ek0 + F*s*cos(theta) - f*s'),
      out('eta', '\\eta', T('效率（有用功 / 输入功）', 'Efficiency (useful / input work)', 'Wirkungsgrad (Nutzarbeit / zugeführte Arbeit)'), '', '(F*s*cos(theta) - f*s)/(F*s*cos(theta))', { requires: ['input'] })
    ],
    example: { text: T('水平拉力 10 N，位移 5 m，摩擦 4 N，初动能为零。', 'A horizontal pull of 10 N over 5 m, friction 4 N, initial kinetic energy zero.', 'Waagerechter Zug 10 N über 5 m, Reibung 4 N, anfangs keine kinetische Energie.'), answer: T('输入功 50 J，摩擦耗散 20 J，末动能 30 J；效率 60%。', 'Input work 50 J, friction loss 20 J, final kinetic energy 30 J; efficiency 60 %.', 'Zugeführte Arbeit 50 J, Reibungsverlust 20 J, kinetische Endenergie 30 J; Wirkungsgrad 60 %.') },
    point: T('先定义系统和有用功；机械能不守恒不代表总能量丢失。', 'Define the system and the useful work first; mechanical energy not conserved does not mean energy lost.', 'Erst System und Nutzarbeit festlegen; nicht erhaltene mechanische Energie heißt nicht verlorene Energie.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M09', 'test:acceptance energy ledger closes for every template'],
    links: { situations: ['const-force', 'energy'], topics: ['energy'] }, review: R2
  },
  {
    id: 'M10', title: T('超重 失重与加速度计', 'Apparent weight and the accelerometer', 'Scheinbares Gewicht und Beschleunigungsmesser'),
    stages: ['s'], priority: 'P1', geometry: 'point',
    assumptions: [A.point, T('秤读支持力；向上为正', 'The scale reads the normal force; upwards positive', 'Die Waage zeigt die Normalkraft; aufwärts positiv')],
    validity: T('接触时支持力不能为负：g + a ≤ 0 时人与秤分离', 'The normal force cannot be negative: for g + a ≤ 0 the person leaves the scale', 'Die Normalkraft kann nicht negativ sein: bei g + a ≤ 0 löst sich die Person von der Waage'),
    sources: ['S12'],
    inputs: [pos('m', 'm', L.m, 'kg', 'mass', 60), pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8), inp('ay', 'a_y', T('电梯的加速度（向上为正）', 'Acceleration of the lift (up positive)', 'Beschleunigung des Aufzugs (aufwärts positiv)'), 'm/s²', 'acceleration', 2)],
    conditions: [cond('contact', T('保持接触（g + a > 0）', 'Contact kept (g + a > 0)', 'Kontakt bleibt (g + a > 0)'), 'g + ay > 0')],
    outputs: [
      out('N', 'N', T('秤的读数（支持力）', 'Scale reading (normal force)', 'Waagenanzeige (Normalkraft)'), 'N', 'm*(g + ay)', { when: 'contact', branch: T('接触', 'In contact', 'Kontakt') }),
      out('ratio', 'N/(mg)', T('读数与重力之比', 'Reading over weight', 'Anzeige durch Gewichtskraft'), '', '(g + ay)/g', { requires: ['contact'] })
    ],
    example: { text: T('60 kg 人随电梯向上加速 2 m/s²，g = 9.8。', 'A 60 kg person in a lift accelerating upwards at 2 m/s², g = 9.8.', 'Eine 60-kg-Person im Aufzug, der mit 2 m/s² nach oben beschleunigt, g = 9,8.'), answer: T('N = 60 × 11.8 = 708 N；自由下落时 N = 0。', 'N = 60 × 11.8 = 708 N; in free fall N = 0.', 'N = 60 × 11,8 = 708 N; im freien Fall N = 0.') },
    point: T('秤读支持力而不是直接测重力；非惯性系需要惯性力。', 'A scale reads the normal force, not gravity itself; an accelerated frame needs an inertial force.', 'Eine Waage zeigt die Normalkraft, nicht die Schwerkraft; im beschleunigten System braucht man eine Trägheitskraft.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M10', 'test:sim2656 M10 elevator', 'regress:engine template elevator'],
    links: { topics: ['friction'] }, review: R2
  },
  {
    id: 'M11', title: T('阿特伍德机', 'Atwood machine', 'Atwoodsche Fallmaschine'),
    stages: ['s'], priority: 'P1', geometry: 'plane',
    assumptions: [A.lightRope, A.uniformG],
    validity: T('绳保持绷紧；物块到达滑轮前', 'The rope stays taut; before a block reaches the pulley', 'Das Seil bleibt gespannt; bevor ein Klotz die Rolle erreicht'),
    sources: ['S12', 'S50'],
    inputs: [pos('m1', 'm_1', T('物块 1 的质量', 'Mass of block 1', 'Masse von Klotz 1'), 'kg', 'mass', 2), pos('m2', 'm_2', T('物块 2 的质量', 'Mass of block 2', 'Masse von Klotz 2'), 'kg', 'mass', 3), pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8)],
    outputs: [
      out('a', 'a', T('加速度（m2 向下为正）', 'Acceleration (m2 down positive)', 'Beschleunigung (m2 abwärts positiv)'), 'm/s²', '(m2 - m1)*g/(m1 + m2)'),
      out('T', 'T', T('绳的张力', 'Rope tension', 'Seilkraft'), 'N', '2*m1*m2*g/(m1 + m2)')
    ],
    example: { text: T('m1 = 2 kg，m2 = 3 kg，轻绳无质量滑轮，g = 9.8。', 'm1 = 2 kg, m2 = 3 kg, light rope, massless pulley, g = 9.8.', 'm1 = 2 kg, m2 = 3 kg, leichtes Seil, masselose Rolle, g = 9,8.'), answer: T('重物向下加速度 1.96 m/s²，绳张力 23.52 N。', 'The heavier block accelerates down at 1.96 m/s²; the tension is 23.52 N.', 'Der schwerere Klotz beschleunigt mit 1,96 m/s² abwärts; die Seilkraft ist 23,52 N.') },
    point: T('约束关联加速度；滑轮有转动惯量时两侧张力可以不同。', 'The constraint links the accelerations; with a heavy pulley the tensions on the two sides differ.', 'Die Bindung koppelt die Beschleunigungen; mit massiver Rolle sind die Seilkräfte beidseits verschieden.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M11', 'test:acceptance 8b Atwood'],
    links: { situations: ['atwood'], topics: ['friction'] }, review: R2
  },
  {
    id: 'M12', title: T('动滑轮与绳长约束', 'Movable pulley and rope-length constraint', 'Lose Rolle und Seillängenbindung'),
    stages: ['j', 's'], priority: 'P1', geometry: 'plane',
    assumptions: [A.lightRope, T('匀速提升；动滑轮质量 mp 可设为 0', 'Lifted at constant speed; the movable pulley’s mass mp may be 0', 'Gleichförmig angehoben; die Masse mp der losen Rolle darf 0 sein')],
    validity: T('两段绳竖直；不计摩擦', 'Both rope segments vertical; no friction', 'Beide Seilstücke senkrecht; keine Reibung'),
    sources: ['S12', 'S13', 'S50'],
    inputs: [pos('m', 'm', T('物体质量', 'Mass of the load', 'Masse der Last'), 'kg', 'mass', 10), nonneg('mp', 'm_p', T('动滑轮质量', 'Mass of the movable pulley', 'Masse der losen Rolle'), 'kg', 'mass', 0), pos('g', 'g', L.g, 'm/s²', 'acceleration', 10), nonneg('dy', '\\Delta y', T('提升高度', 'Height lifted', 'Hubhöhe'), 'm', 'length', 0.5)],
    outputs: [
      out('F', 'F', T('拉力', 'Pull', 'Zugkraft'), 'N', '(m + mp)*g/2'),
      out('ds', '\\Delta s', T('绳端移动距离', 'Distance moved by the rope end', 'Weg des Seilendes'), 'm', '2*dy'),
      out('Win', 'W_{in}', T('输入功', 'Input work', 'Zugeführte Arbeit'), 'J', '(m + mp)*g*dy'),
      out('Wuse', 'W_{use}', T('有用功', 'Useful work', 'Nutzarbeit'), 'J', 'm*g*dy'),
      out('eta', '\\eta', T('机械效率', 'Efficiency', 'Wirkungsgrad'), '', 'm/(m + mp)')
    ],
    example: { text: T('理想动滑轮提升 10 kg 物体 0.5 m，g = 10，匀速。', 'An ideal movable pulley lifts 10 kg by 0.5 m at constant speed, g = 10.', 'Eine ideale lose Rolle hebt 10 kg gleichförmig um 0,5 m, g = 10.'), answer: T('拉力 50 N，绳端位移 1 m；输入和有用功均为 50 J。', 'Pull 50 N, rope end moves 1 m; input and useful work are both 50 J.', 'Zug 50 N, Seilende bewegt sich 1 m; zugeführte und Nutzarbeit je 50 J.') },
    point: T('省力与位移的交换来自绳长约束。', 'Trading force for distance comes from the rope-length constraint.', 'Kraft gegen Weg zu tauschen folgt aus der Seillängenbindung.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M12', 'test:pulleys'],
    links: { situations: ['movable-pulley'], topics: ['energy'] }, review: R2
  },
  {
    id: 'M13', title: T('板块与相对滑动', 'Board and block: relative sliding', 'Brett und Klotz: Relativgleiten'),
    stages: ['s'], priority: 'P1', geometry: 'plane',
    assumptions: [A.coulomb, T('地面光滑，水平力 F 作用在板上', 'Smooth floor; the horizontal force F acts on the board', 'Glatter Boden; die waagerechte Kraft F wirkt auf das Brett')],
    validity: T('先假设共同运动，再用静摩擦不等式验证；不成立时换为相对滑动分支', 'Assume common motion, check it with the static inequality, otherwise switch to the sliding branch', 'Gemeinsame Bewegung annehmen, mit der Haftreibungsungleichung prüfen, sonst Gleitzweig'),
    sources: ['S12', 'S49'],
    inputs: [pos('M', 'M', T('板的质量', 'Mass of the board', 'Masse des Bretts'), 'kg', 'mass', 4), pos('m', 'm', T('物块的质量', 'Mass of the block', 'Masse des Klotzes'), 'kg', 'mass', 1), nonneg('F', 'F', T('作用在板上的水平力', 'Horizontal force on the board', 'Waagerechte Kraft auf das Brett'), 'N', 'force', 12), nonneg('muS', '\\mu_s', L.muS, '', 'ratio', 0.5), nonneg('muK', '\\mu_k', L.muK, '', 'ratio', 0.5), pos('g', 'g', L.g, 'm/s²', 'acceleration', 10)],
    lets: [let_('ac', 'a_c', T('共同加速度（假设）', 'Common acceleration (assumed)', 'Gemeinsame Beschleunigung (angenommen)'), 'm/s²', 'F/(M + m)')],
    conditions: [
      cond('together', T('所需静摩擦不超过最大静摩擦', 'The required static friction does not exceed its maximum', 'Die nötige Haftreibung übersteigt ihr Maximum nicht'), 'm*ac <= muS*m*g'),
      cond('slip', T('物块相对板滑动', 'The block slides on the board', 'Der Klotz gleitet auf dem Brett'), 'm*ac > muS*m*g')
    ],
    outputs: [
      out('Fc', 'F_c', T('开始相对滑动的临界拉力', 'Critical force for relative sliding', 'Grenzkraft für Relativgleiten'), 'N', 'muS*(M + m)*g'),
      out('am', 'a_m', T('物块的加速度', 'Acceleration of the block', 'Beschleunigung des Klotzes'), 'm/s²', 'ac', { when: 'together', branch: T('共同运动', 'Moving together', 'Gemeinsame Bewegung') }),
      out('am', 'a_m', T('物块的加速度', 'Acceleration of the block', 'Beschleunigung des Klotzes'), 'm/s²', 'muK*g', { when: 'slip', branch: T('相对滑动', 'Relative sliding', 'Relativgleiten') }),
      out('ab', 'a_b', T('板的加速度', 'Acceleration of the board', 'Beschleunigung des Bretts'), 'm/s²', 'ac', { when: 'together' }),
      out('ab', 'a_b', T('板的加速度', 'Acceleration of the board', 'Beschleunigung des Bretts'), 'm/s²', '(F - muK*m*g)/M', { when: 'slip' }),
      out('f', 'f', T('板对物块的摩擦力', 'Friction of the board on the block', 'Reibung des Bretts auf den Klotz'), 'N', 'm*ac', { when: 'together' }),
      out('f', 'f', T('板对物块的摩擦力', 'Friction of the board on the block', 'Reibung des Bretts auf den Klotz'), 'N', 'muK*m*g', { when: 'slip' })
    ],
    example: { text: T('M = 4 kg 的板受 12 N 水平力，上有 1 kg 物块，地面光滑，g = 10，μs = 0.5。', 'A 4 kg board pulled by 12 N carries a 1 kg block; smooth floor, g = 10, μs = 0.5.', 'Ein 4-kg-Brett wird mit 12 N gezogen und trägt einen 1-kg-Klotz; glatter Boden, g = 10, μs = 0,5.'), answer: T('共同加速度 2.4 m/s²；需摩擦 2.4 N，小于 5 N，故无相对滑动。', 'Common acceleration 2.4 m/s²; it needs 2.4 N of friction, less than 5 N, so no relative sliding.', 'Gemeinsame Beschleunigung 2,4 m/s²; nötig sind 2,4 N Reibung, weniger als 5 N, also kein Relativgleiten.') },
    point: T('先假设共同运动，再用摩擦不等式验证。', 'Assume common motion, then check it with the friction inequality.', 'Gemeinsame Bewegung annehmen, dann mit der Reibungsungleichung prüfen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M13', 'test:acceptance 2 board and block'],
    links: { situations: ['board-block', 'board-together'], topics: ['friction'] }, review: R2
  },
  {
    id: 'M14', title: T('传送带与共速事件', 'Conveyor belt and common velocity', 'Förderband und gemeinsame Geschwindigkeit'),
    stages: ['s'], priority: 'P1', geometry: 'point',
    assumptions: [A.coulomb, T('水平带匀速 V，带足够长；共速后静摩擦为零', 'Level belt at constant V, long enough; no friction after the common velocity', 'Waagerechtes Band mit konstantem V, lang genug; nach der gemeinsamen Geschwindigkeit keine Reibung')],
    validity: T('物块速度小于带速（V > v0）', 'The block is slower than the belt (V > v0)', 'Der Klotz ist langsamer als das Band (V > v0)'),
    sources: ['S12', 'S13'],
    inputs: [pos('m', 'm', L.m, 'kg', 'mass', 1), inp('V', 'V', T('带速', 'Belt velocity', 'Bandgeschwindigkeit'), 'm/s', 'velocity', 3), inp('v0', 'v_0', T('物块初速度', 'Initial velocity of the block', 'Anfangsgeschwindigkeit des Klotzes'), 'm/s', 'velocity', 0), pos('muK', '\\mu_k', L.muK, '', 'ratio', 0.2), pos('g', 'g', L.g, 'm/s²', 'acceleration', 10), pos('Lb', 'L', T('带长', 'Length of the belt', 'Bandlänge'), 'm', 'length', 100)],
    conditions: [cond('slower', T('物块比带慢', 'The block is slower than the belt', 'Der Klotz ist langsamer als das Band'), 'V > v0'), cond('onBelt', T('共速前不离开带', 'It reaches the belt speed before the end', 'Er erreicht die Bandgeschwindigkeit vor dem Ende'), '(V^2 - v0^2)/(2*muK*g) <= Lb')],
    outputs: [
      out('a', 'a', L.a, 'm/s²', 'muK*g', { requires: ['slower'] }),
      out('t', 't_*', T('达到共速的时刻', 'Time to the common velocity', 'Zeit bis zur gemeinsamen Geschwindigkeit'), 's', '(V - v0)/(muK*g)', { requires: ['slower', 'onBelt'] }),
      out('x', 'x_*', T('共速前物块的位移', 'Displacement of the block until then', 'Verschiebung des Klotzes bis dahin'), 'm', '(V^2 - v0^2)/(2*muK*g)', { requires: ['slower', 'onBelt'] }),
      out('ds', '\\Delta s', T('相对滑动距离', 'Relative sliding distance', 'Relativer Gleitweg'), 'm', '(V - v0)^2/(2*muK*g)', { requires: ['slower', 'onBelt'] }),
      out('Q', 'Q', T('摩擦生热', 'Heat from friction', 'Reibungswärme'), 'J', 'muK*m*g*(V - v0)^2/(2*muK*g)', { requires: ['slower', 'onBelt'] }),
      out('Wb', 'W_b', T('带的驱动做功', 'Work of the belt drive', 'Arbeit des Bandantriebs'), 'J', 'muK*m*g*V*(V - v0)/(muK*g)', { requires: ['slower', 'onBelt'] })
    ],
    example: { text: T('传送带向右 3 m/s，物块初静止，μk = 0.2，g = 10，带足够长。', 'Belt moving right at 3 m/s, block starts at rest, μk = 0.2, g = 10, belt long enough.', 'Band nach rechts mit 3 m/s, Klotz anfangs in Ruhe, μk = 0,2, g = 10, Band lang genug.'), answer: T('a = 2 m/s²；1.5 s 后共速，物块位移 2.25 m。', 'a = 2 m/s²; common velocity after 1.5 s, the block has moved 2.25 m.', 'a = 2 m/s²; gemeinsame Geschwindigkeit nach 1,5 s, der Klotz hat sich 2,25 m bewegt.') },
    point: T('摩擦方向取决于相对运动，摩擦也能对物块做正功。', 'Friction opposes the relative motion and can do positive work on the block.', 'Reibung wirkt der Relativbewegung entgegen und kann am Klotz positive Arbeit verrichten.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M14', 'test:acceptance 3 conveyors'],
    links: { situations: ['flat', 'incline'], topics: ['friction'] }, review: R2
  },
  {
    id: 'M15', title: T('可动斜面与系统动量', 'Movable wedge and system momentum', 'Bewegliche schiefe Ebene und Systemimpuls'),
    stages: ['u'], priority: 'P2', geometry: 'plane',
    assumptions: [T('光滑斜面置于光滑地面，无水平外力', 'Smooth wedge on a smooth floor, no horizontal external force', 'Glatter Keil auf glattem Boden, keine waagerechte äußere Kraft'), A.uniformG],
    validity: T('物块保持与斜面接触', 'The block stays on the wedge', 'Der Klotz bleibt auf dem Keil'),
    sources: ['S14', 'S42', 'S50'],
    inputs: [pos('M', 'M', T('斜面质量', 'Mass of the wedge', 'Masse des Keils'), 'kg', 'mass', 3), pos('m', 'm', T('物块质量', 'Mass of the block', 'Masse des Klotzes'), 'kg', 'mass', 1), angle('theta', '\\theta', L.theta, deg(30), { min: 0, max: Math.PI / 2, open: true }), pos('g', 'g', L.g, 'm/s²', 'acceleration', 10)],
    lets: [let_('D', 'D', T('分母', 'Denominator', 'Nenner'), 'kg', 'M + m*sin(theta)^2')],
    outputs: [
      out('arel', 'a_{rel}', T('物块相对斜面的加速度', 'Acceleration of the block relative to the wedge', 'Beschleunigung des Klotzes relativ zum Keil'), 'm/s²', '(M + m)*g*sin(theta)/D'),
      out('A', 'A', T('斜面的加速度大小', 'Size of the wedge’s acceleration', 'Betrag der Keilbeschleunigung'), 'm/s²', 'm*g*sin(theta)*cos(theta)/D'),
      out('N', 'N', T('斜面对物块的支持力', 'Normal force of the wedge on the block', 'Normalkraft des Keils auf den Klotz'), 'N', 'M*m*g*cos(theta)/D')
    ],
    example: { text: T('光滑斜面 M = 3 kg，物块 m = 1 kg，θ = 30°，g = 10，无水平外力。', 'Smooth wedge M = 3 kg, block m = 1 kg, θ = 30°, g = 10, no horizontal external force.', 'Glatter Keil M = 3 kg, Klotz m = 1 kg, θ = 30°, g = 10, keine waagerechte äußere Kraft.'), answer: T('相对斜面下滑加速度 6.15385 m/s²；斜面加速度大小 1.33235 m/s²。', 'Relative acceleration 6.15385 m/s²; the wedge accelerates at 1.33235 m/s².', 'Relativbeschleunigung 6,15385 m/s²; der Keil beschleunigt mit 1,33235 m/s².') },
    point: T('约束与参考系转换；水平方向总动量守恒。', 'Constraint and change of frame; the horizontal momentum of the system is conserved.', 'Bindung und Bezugssystemwechsel; der waagerechte Gesamtimpuls bleibt erhalten.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M15', 'test:models movable wedge'],
    links: { situations: ['wedge', 'momentum'], topics: ['momentum'] }, review: R2
  },
  {
    id: 'M16', title: T('弹簧与能量交换', 'Spring and energy exchange', 'Feder und Energieaustausch'),
    stages: ['s'], priority: 'P1', geometry: 'point',
    assumptions: [T('轻弹簧，胡克定律；水平无摩擦', 'Light spring obeying Hooke’s law; level and frictionless', 'Leichte Feder nach Hooke; waagerecht und reibungsfrei')],
    validity: T('弹性限度内', 'Within the elastic limit', 'Innerhalb der Elastizitätsgrenze'),
    sources: ['S13', 'S18'],
    inputs: [pos('k', 'k', L.k, 'N/m', 'stiffness', 100), pos('m', 'm', L.m, 'kg', 'mass', 1), inp('x', 'x', T('压缩量', 'Compression', 'Stauchung'), 'm', 'length', 0.2)],
    outputs: [
      out('Ep', 'E_p', T('弹性势能', 'Elastic potential energy', 'Spannenergie'), 'J', 'k*x^2/2'),
      out('vmax', 'v_{\\max}', T('通过平衡位置时的速率', 'Speed through the equilibrium position', 'Geschwindigkeit in der Ruhelage'), 'm/s', 'abs(x)*sqrt(k/m)'),
      out('omega', '\\omega', L.omega, 'rad/s', 'sqrt(k/m)')
    ],
    example: { text: T('k = 100 N/m，m = 1 kg，水平无摩擦，弹簧压缩 0.2 m 后释放。', 'k = 100 N/m, m = 1 kg, level and frictionless, released from a compression of 0.2 m.', 'k = 100 N/m, m = 1 kg, waagerecht und reibungsfrei, aus 0,2 m Stauchung losgelassen.'), answer: T('初始弹性势能 2 J；通过平衡位置时速率 2 m/s。', 'Initial elastic energy 2 J; speed through equilibrium 2 m/s.', 'Anfängliche Spannenergie 2 J; Geschwindigkeit in der Ruhelage 2 m/s.') },
    point: T('参考势能零点不影响可观测速度。', 'The zero of potential energy does not change the observable speed.', 'Der Nullpunkt der potentiellen Energie ändert die beobachtbare Geschwindigkeit nicht.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:M16', 'test:acceptance spring oscillator k = 50 N/m'],
    links: { situations: ['spring', 'energy'], topics: ['oscillation'] }, review: R2
  }
]
