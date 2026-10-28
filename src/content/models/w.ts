/**
 * W01–W14: oscillations and waves (blueprint §5.4; doc 02 §4). Angles in rad (shown in degrees by default);
 * the approximate period formulas of the pendulum carry their range as conditions (approximate beyond it).
 */
import type { ModelSpec } from './types'
import { A, L, T, cond, inp, let_, nonneg, out, pos } from './dsl'

const R2 = { physics: '2026-10-28', language: '2026-10-28' }
const springIn = (m: number, k: number) => [pos('m', 'm', L.m, 'kg', 'mass', m), pos('k', 'k', L.k, 'N/m', 'stiffness', k)]

export const MODELS_W: ModelSpec[] = [
  {
    id: 'W01', title: T('简谐振子', 'Simple harmonic oscillator', 'Harmonischer Oszillator'),
    stages: ['s'], priority: 'P1', geometry: 'line1d',
    assumptions: [T('理想弹簧（线性回复力），无阻尼', 'Ideal spring (linear restoring force), no damping', 'Ideale Feder (lineare Rückstellkraft), keine Dämpfung')],
    validity: T('形变在线性范围内；x = A cos(ω0 t + φ0)', 'Deformation in the linear range; x = A cos(ω0 t + φ0)', 'Verformung im linearen Bereich; x = A cos(ω0 t + φ0)'),
    sources: ['S18'],
    inputs: [...springIn(1, 4), nonneg('A', 'A', T('振幅', 'Amplitude', 'Amplitude'), 'm', 'length', 0.1), inp('phi0', '\\varphi_0', T('初相位', 'Initial phase', 'Anfangsphase'), 'rad', 'angle', 0), nonneg('t', 't', L.t, 's', 'time', 1)],
    lets: [let_('w0', '\\omega_0', T('固有角频率', 'Natural angular frequency', 'Eigenkreisfrequenz'), 'rad/s', 'sqrt(k/m)')],
    outputs: [out('w0', '\\omega_0', T('固有角频率', 'Natural angular frequency', 'Eigenkreisfrequenz'), 'rad/s', 'sqrt(k/m)'), out('T', 'T', L.T, 's', '2*pi*sqrt(m/k)'), out('x', 'x(t)', L.x, 'm', 'A*cos(w0*t + phi0)'), out('v', 'v(t)', L.v, 'm/s', '-A*w0*sin(w0*t + phi0)'), out('vmax', 'v_{\\max}', T('最大速率', 'Maximum speed', 'Höchstgeschwindigkeit'), 'm/s', 'A*w0'), out('E', 'E', T('总机械能', 'Total mechanical energy', 'Gesamte mechanische Energie'), 'J', 'k*A^2/2')],
    example: { text: T('m = 1 kg，k = 4 N/m，A = 0.1 m，从最大位移释放。', 'm = 1 kg, k = 4 N/m, A = 0.1 m, released from the largest displacement.', 'm = 1 kg, k = 4 N/m, A = 0,1 m, aus der größten Auslenkung losgelassen.'), answer: T('ω0 = 2 rad/s，T = π s，最大速率 0.2 m/s，总能量 0.02 J。', 'ω0 = 2 rad/s, T = π s, maximum speed 0.2 m/s, total energy 0.02 J.', 'ω0 = 2 rad/s, T = π s, Höchstgeschwindigkeit 0,2 m/s, Gesamtenergie 0,02 J.') },
    point: T('相位、振幅和频率各有不同含义。', 'Phase, amplitude and frequency mean different things.', 'Phase, Amplitude und Frequenz bedeuten Verschiedenes.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:W01', 'test:acceptance spring oscillator k = 50 N/m'],
    links: {}, review: R2
  },
  {
    id: 'W02', title: T('单摆与小角近似', 'Pendulum and the small-angle approximation', 'Fadenpendel und Kleinwinkelnäherung'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'plane',
    assumptions: [A.point, T('轻绳不可伸长且保持张紧，无阻力', 'Light inextensible taut string, no resistance', 'Leichter undehnbarer gespannter Faden, kein Widerstand')],
    validity: T('小角公式只在小振幅成立；二阶修正是近似；精确周期用完全椭圆积分', 'The small-angle formula holds only for small amplitudes; the second-order correction is approximate; the exact period uses the complete elliptic integral', 'Die Kleinwinkelformel gilt nur für kleine Amplituden; die Korrektur zweiter Ordnung ist eine Näherung; die exakte Periode nutzt das vollständige elliptische Integral'),
    sources: ['S18', 'S42'],
    inputs: [pos('l', '\\ell', T('摆长', 'Length', 'Pendellänge'), 'm', 'length', 1), pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8), inp('th0', '\\theta_0', T('摆幅（弧度）', 'Amplitude (radians)', 'Amplitude (Bogenmaß)'), 'rad', 'angle', 0.2, { min: 0, max: Math.PI, open: true })],
    conditions: [cond('small', T('小角（θ0 ≤ 8°）', 'Small angle (θ0 ≤ 8°)', 'Kleiner Winkel (θ0 ≤ 8°)'), 'th0 <= 0.1396', 'th0 <= 0.35'), cond('moderate', T('二阶修正适用（θ0 ≤ 0.6 rad）', 'Second-order correction applies (θ0 ≤ 0.6 rad)', 'Korrektur zweiter Ordnung anwendbar (θ0 ≤ 0,6 rad)'), 'th0 <= 0.6', 'th0 <= 1.2')],
    outputs: [out('T0', 'T_0', T('小角周期', 'Small-angle period', 'Kleinwinkelperiode'), 's', '2*pi*sqrt(l/g)', { requires: ['small'] }), out('T2', 'T_2', T('二阶修正周期', 'Period with second-order correction', 'Periode mit Korrektur zweiter Ordnung'), 's', '2*pi*sqrt(l/g)*(1 + th0^2/16)', { requires: ['moderate'] }), out('T', 'T', T('精确周期（椭圆积分）', 'Exact period (elliptic integral)', 'Exakte Periode (elliptisches Integral)'), 's', '4*sqrt(l/g)*ellipK(sin(th0/2))')],
    example: { text: T('ℓ = 1 m，g = 9.8；小振幅与 θ0 = 0.2 rad 对比。', 'ℓ = 1 m, g = 9.8; small amplitude compared with θ0 = 0.2 rad.', 'ℓ = 1 m, g = 9,8; kleine Amplitude im Vergleich mit θ0 = 0,2 rad.'), answer: T('小角周期 2.00709 s；含二阶幅度修正约 2.01211 s。', 'Small-angle period 2.00709 s; with the second-order correction about 2.01211 s.', 'Kleinwinkelperiode 2,00709 s; mit Korrektur zweiter Ordnung etwa 2,01211 s.') },
    point: T('近似有适用域；0.2 必须是弧度。', 'Approximations have a range; 0.2 must be radians.', 'Näherungen haben einen Gültigkeitsbereich; 0,2 muss im Bogenmaß sein.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:W02', 'test:acceptance 6 oscillations'],
    links: { situations: ['pendulum'] }, review: R2
  },
  {
    id: 'W03', title: T('阻尼与三种响应', 'Damping and the three responses', 'Dämpfung und die drei Fälle'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('线性黏性阻尼 −bv；从静止的位移 x0 释放', 'Linear viscous damping −bv; released from rest at x0', 'Lineare viskose Dämpfung −bv; aus der Ruhe bei x0 losgelassen')],
    validity: T('ζ 区分欠阻尼、临界与过阻尼；临界附近用极限式', 'ζ tells under-, critically and over-damped apart; near critical the limit formula is used', 'ζ unterscheidet schwache, aperiodische Grenz- und starke Dämpfung; nahe dem Grenzfall gilt die Grenzformel'),
    sources: ['S18', 'S55'],
    inputs: [...springIn(1, 4), nonneg('b', 'b', T('阻尼系数', 'Damping coefficient', 'Dämpfungskonstante'), 'kg/s', 'damping', 2), inp('x0', 'x_0', T('初始位移', 'Initial displacement', 'Anfangsauslenkung'), 'm', 'length', 0.1), nonneg('t', 't', L.t, 's', 'time', 1)],
    lets: [let_('w0', '\\omega_0', T('固有角频率', 'Natural angular frequency', 'Eigenkreisfrequenz'), 'rad/s', 'sqrt(k/m)'), let_('gam', '\\gamma', T('衰减率 b/2m', 'Decay rate b/2m', 'Abklingrate b/2m'), '1/s', 'b/(2*m)')],
    conditions: [cond('under', T('欠阻尼（ζ < 1）', 'Underdamped (ζ < 1)', 'Schwach gedämpft (ζ < 1)'), 'b/(2*sqrt(m*k)) < 1 - 1e-9'), cond('critical', T('临界阻尼（ζ = 1）', 'Critically damped (ζ = 1)', 'Aperiodischer Grenzfall (ζ = 1)'), 'abs(b/(2*sqrt(m*k)) - 1) <= 1e-9'), cond('over', T('过阻尼（ζ > 1）', 'Overdamped (ζ > 1)', 'Stark gedämpft (ζ > 1)'), 'b/(2*sqrt(m*k)) > 1 + 1e-9')],
    outputs: [
      out('zeta', '\\zeta', T('阻尼比', 'Damping ratio', 'Dämpfungsgrad'), '', 'b/(2*sqrt(m*k))'),
      out('wd', '\\omega_d', T('阻尼角频率', 'Damped angular frequency', 'Gedämpfte Kreisfrequenz'), 'rad/s', 'sqrt(w0^2 - gam^2)', { requires: ['under'] }),
      out('x', 'x(t)', L.x, 'm', 'x0*exp(-gam*t)*(cos(sqrt(w0^2 - gam^2)*t) + gam/sqrt(w0^2 - gam^2)*sin(sqrt(w0^2 - gam^2)*t))', { when: 'under', branch: T('欠阻尼：衰减振荡', 'Underdamped: decaying oscillation', 'Schwach gedämpft: abklingende Schwingung') }),
      out('x', 'x(t)', L.x, 'm', 'x0*exp(-w0*t)*(1 + w0*t)', { when: 'critical', branch: T('临界：最快无振荡回零', 'Critical: fastest return without oscillation', 'Grenzfall: schnellste Rückkehr ohne Schwingung') }),
      out('x', 'x(t)', L.x, 'm', 'x0*((-gam - sqrt(gam^2 - w0^2))*exp((-gam + sqrt(gam^2 - w0^2))*t) - (-gam + sqrt(gam^2 - w0^2))*exp((-gam - sqrt(gam^2 - w0^2))*t))/(-2*sqrt(gam^2 - w0^2))', { when: 'over', branch: T('过阻尼：缓慢蠕回', 'Overdamped: slow creep back', 'Stark gedämpft: langsames Kriechen') })
    ],
    example: { text: T('m = 1 kg，k = 4 N/m，b = 2 kg/s。', 'm = 1 kg, k = 4 N/m, b = 2 kg/s.', 'm = 1 kg, k = 4 N/m, b = 2 kg/s.'), answer: T('ζ = 0.5，属欠阻尼；振幅包络 e⁻ᵗ，阻尼角频率 √3 rad/s。', 'ζ = 0.5, underdamped; envelope e⁻ᵗ, damped angular frequency √3 rad/s.', 'ζ = 0,5, schwach gedämpft; Hüllkurve e⁻ᵗ, gedämpfte Kreisfrequenz √3 rad/s.') },
    point: T('欠阻尼、临界和过阻尼由无量纲阻尼比区分。', 'The dimensionless damping ratio tells the three cases apart.', 'Der dimensionslose Dämpfungsgrad unterscheidet die drei Fälle.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:W03', 'test:physics2651 damper'],
    links: {}, review: R2
  },
  {
    id: 'W04', title: T('受迫振动与共振', 'Driven oscillation and resonance', 'Erzwungene Schwingung und Resonanz'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('线性振子，正弦驱动 F0 cos ωt，读稳态（瞬态已衰减）', 'Linear oscillator driven by F0 cos ωt; the steady state (transients decayed)', 'Linearer Oszillator mit Antrieb F0 cos ωt; eingeschwungener Zustand (Einschwingen abgeklungen)')],
    validity: T('无阻尼且 ω = ω0 时没有有限稳态；大振幅需检查线性', 'Without damping at ω = ω0 there is no finite steady state; check linearity at large amplitude', 'Ohne Dämpfung bei ω = ω0 gibt es keinen endlichen eingeschwungenen Zustand; bei großer Amplitude Linearität prüfen'),
    sources: ['S18'],
    inputs: [...springIn(1, 4), nonneg('b', 'b', T('阻尼系数', 'Damping coefficient', 'Dämpfungskonstante'), 'kg/s', 'damping', 0.4), nonneg('F0', 'F_0', T('驱动力幅', 'Driving force amplitude', 'Amplitude der Antriebskraft'), 'N', 'force', 1), nonneg('w', '\\omega', T('驱动角频率', 'Driving angular frequency', 'Antriebskreisfrequenz'), 'rad/s', 'angularVelocity', 2)],
    conditions: [cond('finite', T('存在有限稳态', 'A finite steady state exists', 'Ein endlicher eingeschwungener Zustand existiert'), 'b > 0 || abs(k - m*w^2) > 1e-12*k'), cond('peak', T('振幅有极大（b² < 2mk）', 'The amplitude has a maximum (b² < 2mk)', 'Die Amplitude hat ein Maximum (b² < 2mk)'), 'b^2 < 2*m*k')],
    outputs: [out('Amp', 'A', T('稳态振幅', 'Steady-state amplitude', 'Amplitude im eingeschwungenen Zustand'), 'm', 'F0/sqrt((k - m*w^2)^2 + (b*w)^2)', { requires: ['finite'] }), out('delta', '\\delta', T('相位滞后', 'Phase lag', 'Phasennacheilung'), 'rad', 'atan2(b*w, k - m*w^2)', { requires: ['finite'] }), out('wr', '\\omega_r', T('振幅峰值角频率', 'Angular frequency of the amplitude peak', 'Kreisfrequenz des Amplitudenmaximums'), 'rad/s', 'sqrt(k/m - b^2/(2*m^2))', { requires: ['peak'] })],
    example: { text: T('m = 1、k = 4、b = 0.4，单位为 SI；F0 = 1 N，以 ω = 2 rad/s 驱动。', 'm = 1, k = 4, b = 0.4 (SI); F0 = 1 N, driven at ω = 2 rad/s.', 'm = 1, k = 4, b = 0,4 (SI); F0 = 1 N, angetrieben mit ω = 2 rad/s.'), answer: T('稳态振幅 A = 1.25 m，相位滞后 π/2；这是理想线性模型结果。', 'Steady-state amplitude 1.25 m, phase lag π/2; a result of the ideal linear model.', 'Amplitude 1,25 m, Phasennacheilung π/2; ein Ergebnis des idealen linearen Modells.') },
    point: T('稳态共振峰与固有频率未必重合；大振幅需检查线性假设。', 'The resonance peak need not lie at the natural frequency; check linearity at large amplitudes.', 'Das Resonanzmaximum liegt nicht unbedingt bei der Eigenfrequenz; bei großen Amplituden Linearität prüfen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:W04', 'test:sim2656 W04 resonance', 'regress:engine template resonance'],
    links: {}, review: R2
  },
  {
    id: 'W05', title: T('耦合振子与简正模', 'Coupled oscillators and normal modes', 'Gekoppelte Oszillatoren und Eigenschwingungen'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('两个等质量，各以 k 连到固定端，中间以 kc 耦合；无阻尼', 'Two equal masses, each tied to a wall by k, coupled by kc; no damping', 'Zwei gleiche Massen, je mit k an der Wand, mit kc gekoppelt; ungedämpft')],
    validity: T('线性小振动；能量交换周期要求 kc > 0', 'Linear small oscillations; the exchange period needs kc > 0', 'Lineare kleine Schwingungen; die Austauschperiode braucht kc > 0'),
    sources: ['S18', 'S42'],
    inputs: [...springIn(1, 4), nonneg('kc', 'k_c', T('耦合劲度', 'Coupling stiffness', 'Kopplungssteifigkeit'), 'N/m', 'stiffness', 2)],
    conditions: [cond('coupled', T('有耦合（kc > 0）', 'Coupled (kc > 0)', 'Gekoppelt (kc > 0)'), 'kc > 0')],
    outputs: [out('w1', '\\omega_1', T('同相模角频率', 'In-phase mode', 'Gleichphasige Eigenschwingung'), 'rad/s', 'sqrt(k/m)'), out('w2', '\\omega_2', T('反相模角频率', 'Out-of-phase mode', 'Gegenphasige Eigenschwingung'), 'rad/s', 'sqrt((k + 2*kc)/m)'), out('Tx', 'T_{ex}', T('能量完全交换一次的时间', 'Time for one complete energy exchange', 'Zeit für einen vollständigen Energieaustausch'), 's', 'pi/(sqrt((k + 2*kc)/m) - sqrt(k/m))', { requires: ['coupled'] })],
    example: { text: T('两个等质量 m = 1 kg，各以 k = 4 N/m 连到固定端，中间 kc = 2 N/m。', 'Two equal masses m = 1 kg, each tied to a wall with k = 4 N/m, coupled by kc = 2 N/m.', 'Zwei gleiche Massen m = 1 kg, je mit k = 4 N/m an der Wand, gekoppelt mit kc = 2 N/m.'), answer: T('同相模角频率 2 rad/s；反相模 √8 = 2.82843 rad/s。', 'In-phase mode 2 rad/s; out-of-phase mode √8 = 2.82843 rad/s.', 'Gleichphasig 2 rad/s; gegenphasig √8 = 2,82843 rad/s.') },
    point: T('复杂线性运动可分解为本征模。', 'Complicated linear motion splits into normal modes.', 'Komplizierte lineare Bewegung zerfällt in Eigenschwingungen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:W05', 'test:models two blocks joined by a spring'],
    links: {}, review: R2
  },
  {
    id: 'W06', title: T('双摆与混沌', 'Double pendulum and chaos', 'Doppelpendel und Chaos'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'plane',
    assumptions: [T('近邻轨迹间距按局部拟合的 λ 指数增长', 'The separation of neighbouring trajectories grows exponentially with a locally fitted λ', 'Der Abstand benachbarter Bahnen wächst exponentiell mit lokal angepasstem λ')],
    validity: T('受限：只在间距仍小时成立；λ 由具体能量与轨迹决定，不由本模型计算', 'Restricted: only while the separation is still small; λ depends on the energy and the trajectory and is not computed here', 'Eingeschränkt: nur solange der Abstand klein ist; λ hängt von Energie und Bahn ab und wird hier nicht berechnet'),
    restricted: T('指数增长估算；有限时间 Lyapunov 拟合与 Poincaré 统计暂缓（双摆模板只做轨迹仿真）', 'Exponential growth estimate; finite-time Lyapunov fits and Poincaré statistics deferred (the double-pendulum template only simulates trajectories)', 'Schätzung des exponentiellen Wachstums; Lyapunov-Anpassung und Poincaré-Statistik zurückgestellt (die Doppelpendel-Vorlage simuliert nur Bahnen)'),
    sources: ['S42', 'S50', 'S57'],
    inputs: [pos('d0', '\\delta_0', T('初始差', 'Initial separation', 'Anfangsabstand'), 'rad', 'angle', 1e-6), inp('lam', '\\lambda', T('局部 Lyapunov 指数（给定）', 'Local Lyapunov exponent (given)', 'Lokaler Lyapunov-Exponent (gegeben)'), '1/s', 'rate', 0.5), nonneg('t', 't', L.t, 's', 'time', 10)],
    conditions: [cond('linear', T('间距仍小（< 0.1 rad）', 'Separation still small (< 0.1 rad)', 'Abstand noch klein (< 0,1 rad)'), 'd0*exp(lam*t) < 0.1', 'd0*exp(lam*t) < 0.5')],
    outputs: [out('d', '\\delta(t)', T('估算间距', 'Estimated separation', 'Geschätzter Abstand'), 'rad', 'd0*exp(lam*t)', { requires: ['linear'] }), out('tp', 't_{0.1}', T('间距达 0.1 rad 的可预报时间', 'Predictability time to 0.1 rad', 'Vorhersagezeit bis 0,1 rad'), 's', 'ln(0.1/d0)/lam')],
    example: { text: T('双摆两条近邻轨迹若局部拟合 λ = 0.5 s⁻¹，初始差 10⁻⁶ rad，估算 10 s 后差。', 'Two neighbouring trajectories of a double pendulum with a fitted λ = 0.5 s⁻¹ and an initial difference of 10⁻⁶ rad: the difference after 10 s.', 'Zwei benachbarte Bahnen eines Doppelpendels mit angepasstem λ = 0,5 s⁻¹ und Anfangsunterschied 10⁻⁶ rad: der Unterschied nach 10 s.'), answer: T('指数增长估算为 1.48413×10⁻⁴ rad；λ 由具体能量和轨迹决定。', 'Exponential estimate 1.48413×10⁻⁴ rad; λ depends on the energy and the trajectory.', 'Exponentielle Schätzung 1,48413×10⁻⁴ rad; λ hängt von Energie und Bahn ab.') },
    point: T('混沌不等于随机数；长期逐点误差不是唯一指标。', 'Chaos is not randomness; long-term pointwise error is not the only measure.', 'Chaos ist kein Zufall; der punktweise Langzeitfehler ist nicht das einzige Maß.'),
    status: 'verified', level: 1, teaching: 0, references: ['otherMethod'], benchmarks: ['oracle:W06', 'regress:engine template double-pendulum'],
    links: {}, review: R2
  },
  {
    id: 'W07', title: T('弦上的行波', 'Travelling waves on a string', 'Fortschreitende Wellen auf einer Saite'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'line1d',
    assumptions: [T('理想弦：张力均匀，小振幅横波', 'Ideal string: uniform tension, small transverse amplitude', 'Ideale Saite: gleichmäßige Spannung, kleine Queramplitude')],
    validity: T('线性波动方程；张力 Ts 与周期 T 用不同符号', 'Linear wave equation; tension Ts and period T are different symbols', 'Lineare Wellengleichung; Spannkraft Ts und Periode T sind verschiedene Symbole'),
    sources: ['S19'],
    inputs: [pos('Ts', 'T_s', T('张力', 'Tension', 'Spannkraft'), 'N', 'force', 100), pos('mu', '\\mu', T('线密度', 'Linear density', 'Längendichte'), 'kg/m', 'linearDensity', 0.01), pos('lam', '\\lambda', L.lambda, 'm', 'length', 0.5), nonneg('dist', 's', T('传播距离', 'Distance travelled', 'Laufstrecke'), 'm', 'length', 2)],
    outputs: [out('c', 'c', L.c, 'm/s', 'sqrt(Ts/mu)'), out('f', 'f', L.f, 'Hz', 'sqrt(Ts/mu)/lam'), out('kw', 'k', T('波数', 'Wavenumber', 'Wellenzahl'), '1/m', '2*pi/lam'), out('tt', 't', T('传播时间', 'Travel time', 'Laufzeit'), 's', 'dist/sqrt(Ts/mu)')],
    example: { text: T('张力 Ts = 100 N，线密度 μ = 0.01 kg/m，波长 0.5 m。', 'Tension Ts = 100 N, linear density μ = 0.01 kg/m, wavelength 0.5 m.', 'Spannkraft Ts = 100 N, Längendichte μ = 0,01 kg/m, Wellenlänge 0,5 m.'), answer: T('波速 100 m/s；频率 200 Hz；2 m 传播需 0.02 s。', 'Speed 100 m/s; frequency 200 Hz; 2 m take 0.02 s.', 'Geschwindigkeit 100 m/s; Frequenz 200 Hz; 2 m dauern 0,02 s.') },
    point: T('质点振动方向不等于波传播方向；Ts 与周期 T 应分符号。', 'The particles move across the direction of travel; keep Ts and the period T apart.', 'Die Teilchen schwingen quer zur Laufrichtung; Ts und Periode T auseinanderhalten.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:W07', 'rust:src/labs/waves.rs pulse_travels_at_c_and_reflects', 'rust:src/labs/waves.rs energy_is_kept_on_a_fixed_string'],
    links: { labs: ['waves'] }, review: R2
  },
  {
    id: 'W08', title: T('界面反射与阻抗', 'Reflection at a junction and impedance', 'Reflexion an einer Verbindungsstelle und Impedanz'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('两段弦同张力相接，接头处位移与横向力连续', 'Two strings of equal tension joined; displacement and transverse force continuous at the joint', 'Zwei Saiten gleicher Spannung verbunden; Auslenkung und Querkraft an der Stelle stetig')],
    validity: T('系数指位移振幅；压强等其他波变量的反射符号不同', 'The coefficients refer to displacement amplitudes; other wave variables such as pressure reflect with other signs', 'Die Koeffizienten gelten für Auslenkungen; andere Wellengrößen wie Druck reflektieren mit anderem Vorzeichen'),
    sources: ['S19'],
    inputs: [pos('Ts', 'T_s', T('张力', 'Tension', 'Spannkraft'), 'N', 'force', 1), pos('mu1', '\\mu_1', T('入射段线密度', 'Linear density of the incident side', 'Längendichte der Einfallsseite'), 'kg/m', 'linearDensity', 1), pos('mu2', '\\mu_2', T('透射段线密度', 'Linear density of the far side', 'Längendichte der anderen Seite'), 'kg/m', 'linearDensity', 9), nonneg('Ai', 'A_i', T('入射位移振幅', 'Incident displacement amplitude', 'Einfallende Auslenkungsamplitude'), 'm', 'length', 0.01)],
    lets: [let_('Z1', 'Z_1', T('入射段阻抗', 'Impedance of the incident side', 'Impedanz der Einfallsseite'), 'kg/s', 'sqrt(Ts*mu1)'), let_('Z2', 'Z_2', T('透射段阻抗', 'Impedance of the far side', 'Impedanz der anderen Seite'), 'kg/s', 'sqrt(Ts*mu2)')],
    outputs: [out('Z1', 'Z_1', T('入射段阻抗', 'Impedance of the incident side', 'Impedanz der Einfallsseite'), 'kg/s', 'Z1'), out('Z2', 'Z_2', T('透射段阻抗', 'Impedance of the far side', 'Impedanz der anderen Seite'), 'kg/s', 'Z2'), out('r', 'r', T('位移反射系数', 'Displacement reflection coefficient', 'Reflexionsfaktor der Auslenkung'), '', '(Z1 - Z2)/(Z1 + Z2)'), out('tc', 't', T('位移透射系数', 'Displacement transmission coefficient', 'Transmissionsfaktor der Auslenkung'), '', '2*Z1/(Z1 + Z2)'), out('Ar', 'A_r', T('反射振幅', 'Reflected amplitude', 'Reflektierte Amplitude'), 'm', 'Ai*(Z1 - Z2)/(Z1 + Z2)'), out('R', 'R', T('能量反射比', 'Energy reflectance', 'Energiereflexionsgrad'), '', '((Z1 - Z2)/(Z1 + Z2))^2'), out('Tr', 'T', T('能量透射比', 'Energy transmittance', 'Energietransmissionsgrad'), '', '4*Z1*Z2/(Z1 + Z2)^2')],
    example: { text: T('同张力两段弦，Z1 = 1、Z2 = 3（Ts = 1 N，μ1 = 1、μ2 = 9 kg/m），入射位移振幅 0.01 m。', 'Two strings of equal tension, Z1 = 1 and Z2 = 3 (Ts = 1 N, μ1 = 1, μ2 = 9 kg/m), incident amplitude 0.01 m.', 'Zwei Saiten gleicher Spannung, Z1 = 1 und Z2 = 3 (Ts = 1 N, μ1 = 1, μ2 = 9 kg/m), einfallende Amplitude 0,01 m.'), answer: T('位移反射系数 −0.5，透射位移系数 0.5；反射能量比 0.25、透射 0.75。', 'Reflection coefficient −0.5, transmission 0.5; reflected energy 0.25, transmitted 0.75.', 'Reflexionsfaktor −0,5, Transmission 0,5; reflektierte Energie 0,25, durchgelassen 0,75.') },
    point: T('位移、压强等不同波变量的反射符号不同。', 'Displacement, pressure and other wave variables reflect with different signs.', 'Auslenkung, Druck und andere Wellengrößen reflektieren mit verschiedenen Vorzeichen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:W08', 'test:sim2656 W08 string junction'],
    links: { labs: ['waves'] }, review: R2
  },
  {
    id: 'W09', title: T('驻波与边界条件', 'Standing waves and boundary conditions', 'Stehende Wellen und Randbedingungen'),
    stages: ['s'], priority: 'P1', geometry: 'line1d',
    assumptions: [T('均匀弦或管，端点理想固定或自由', 'Uniform string or pipe, ends ideally fixed or free', 'Gleichförmige Saite oder Röhre, Enden ideal fest oder frei')],
    validity: T('两端固定：f = nc/2L；一端固定一端自由：f = (2n−1)c/4L', 'Both ends fixed: f = nc/2L; one fixed and one free: f = (2n − 1)c/4L', 'Beide Enden fest: f = nc/2L; ein Ende fest, eines frei: f = (2n − 1)c/4L'),
    sources: ['S19'],
    inputs: [pos('Lw', 'L', T('长度', 'Length', 'Länge'), 'm', 'length', 1), pos('c', 'c', L.c, 'm/s', 'speed', 100), pos('n', 'n', T('模式序号', 'Mode number', 'Modenzahl'), '', 'count', 3)],
    conditions: [cond('integer', T('n 为正整数', 'n is a positive integer', 'n ist eine positive ganze Zahl'), 'abs(n - floor(n + 0.5)) < 1e-9')],
    outputs: [out('f1', 'f_1', T('基频（两端固定）', 'Fundamental (both ends fixed)', 'Grundfrequenz (beide Enden fest)'), 'Hz', 'c/(2*Lw)'), out('fn', 'f_n', T('第 n 个本征频率（两端固定）', 'n-th frequency (both ends fixed)', 'n-te Frequenz (beide Enden fest)'), 'Hz', 'floor(n + 0.5)*c/(2*Lw)', { requires: ['integer'] }), out('fnf', "f'_n", T('第 n 个本征频率（一端自由）', 'n-th frequency (one end free)', 'n-te Frequenz (ein Ende frei)'), 'Hz', '(2*floor(n + 0.5) - 1)*c/(4*Lw)', { requires: ['integer'] })],
    example: { text: T('两端固定弦 L = 1 m，波速 100 m/s，求前三个本征频率。', 'A string fixed at both ends, L = 1 m, speed 100 m/s: the first three frequencies.', 'Eine beidseitig feste Saite, L = 1 m, Geschwindigkeit 100 m/s: die ersten drei Frequenzen.'), answer: T('n = 1、2、3 时为 50、100、150 Hz。', '50, 100 and 150 Hz for n = 1, 2, 3.', '50, 100 und 150 Hz für n = 1, 2, 3.') },
    point: T('端点条件选择允许模式；固定自由端有不同谱列。', 'The end conditions select the allowed modes; fixed and free ends give different series.', 'Die Randbedingungen wählen die erlaubten Moden; feste und freie Enden ergeben verschiedene Reihen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:W09', 'rust:src/labs/waves.rs standing_mode_is_exact_and_has_its_frequency'],
    links: { labs: ['waves'] }, review: R2
  },
  {
    id: 'W10', title: T('多普勒效应', 'Doppler effect', 'Doppler-Effekt'),
    stages: ['s'], priority: 'P1', geometry: 'line1d',
    assumptions: [T('声波相对静止介质传播；源与观察者沿连线运动', 'Sound travels relative to a medium at rest; source and observer move along the line joining them', 'Schall breitet sich relativ zum ruhenden Medium aus; Quelle und Beobachter bewegen sich auf ihrer Verbindungslinie')],
    validity: T('相互接近为正；源速须小于声速', 'Approaching counts positive; the source must be slower than sound', 'Annäherung zählt positiv; die Quelle muss langsamer als der Schall sein'),
    sources: ['S19'],
    inputs: [pos('f', 'f', T('声源频率', 'Source frequency', 'Quellfrequenz'), 'Hz', 'frequency', 440), pos('c', 'c', T('声速', 'Speed of sound', 'Schallgeschwindigkeit'), 'm/s', 'speed', 340), inp('vo', 'v_o', T('观察者速度（向源为正）', 'Observer speed (toward the source positive)', 'Beobachtergeschwindigkeit (zur Quelle positiv)'), 'm/s', 'speed', 0), inp('vs', 'v_s', T('声源速度（向观察者为正）', 'Source speed (toward the observer positive)', 'Quellgeschwindigkeit (zum Beobachter positiv)'), 'm/s', 'speed', 34)],
    conditions: [cond('subsonic', T('源速与观察者速度小于声速', 'Source and observer slower than sound', 'Quelle und Beobachter langsamer als der Schall'), 'abs(vs) < c && abs(vo) < c')],
    outputs: [out('f2', "f'", T('接收频率', 'Received frequency', 'Empfangene Frequenz'), 'Hz', 'f*(c + vo)/(c - vs)', { requires: ['subsonic'] })],
    example: { text: T('声源 440 Hz 以 34 m/s 向静止观察者接近，声速 340 m/s。', 'A 440 Hz source approaches a resting observer at 34 m/s; speed of sound 340 m/s.', 'Eine 440-Hz-Quelle nähert sich mit 34 m/s einem ruhenden Beobachter; Schallgeschwindigkeit 340 m/s.'), answer: T('f′ = 440 × 340/306 = 488.889 Hz。', 'f′ = 440 × 340/306 = 488.889 Hz.', 'f′ = 440 × 340/306 = 488,889 Hz.') },
    point: T('声波相对介质传播；需统一接近方向的符号。', 'Sound travels relative to the medium; fix the sign of approach.', 'Schall läuft relativ zum Medium; Vorzeichen der Annäherung festlegen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:W10', 'rust:src/labs/waves.rs doppler_and_notes'],
    links: { labs: ['waves'] }, review: R2
  },
  {
    id: 'W11', title: T('拍与叠加', 'Beats and superposition', 'Schwebung und Überlagerung'),
    stages: ['s'], priority: 'P1', geometry: 'line1d',
    assumptions: [T('两列同幅正弦波线性叠加', 'Two sine waves of equal amplitude superposed linearly', 'Zwei Sinuswellen gleicher Amplitude linear überlagert')],
    validity: T('频率相近时听到拍；两频率相等时无拍', 'Beats are heard for close frequencies; none for equal frequencies', 'Schwebungen bei nahen Frequenzen; keine bei gleichen Frequenzen'),
    sources: ['S19'],
    inputs: [pos('f1', 'f_1', T('频率 1', 'Frequency 1', 'Frequenz 1'), 'Hz', 'frequency', 440), pos('f2', 'f_2', T('频率 2', 'Frequency 2', 'Frequenz 2'), 'Hz', 'frequency', 444)],
    conditions: [cond('distinct', T('两频率不同', 'The frequencies differ', 'Die Frequenzen sind verschieden'), 'abs(f1 - f2) > 0')],
    outputs: [out('fb', 'f_b', T('拍频', 'Beat frequency', 'Schwebungsfrequenz'), 'Hz', 'abs(f1 - f2)'), out('Tb', 'T_b', T('相邻响度极大间隔', 'Time between loudness maxima', 'Abstand der Lautstärkemaxima'), 's', '1/abs(f1 - f2)', { requires: ['distinct'] }), out('fm', '\\bar f', T('听到的平均频率', 'Mean frequency heard', 'Gehörte mittlere Frequenz'), 'Hz', '(f1 + f2)/2')],
    example: { text: T('两同幅声波频率 440 Hz 与 444 Hz。', 'Two sound waves of equal amplitude at 440 Hz and 444 Hz.', 'Zwei Schallwellen gleicher Amplitude mit 440 Hz und 444 Hz.'), answer: T('拍频 4 Hz，相邻响度极大间隔 0.25 s。', 'Beat frequency 4 Hz; loudness maxima 0.25 s apart.', 'Schwebungsfrequenz 4 Hz; Maxima im Abstand von 0,25 s.') },
    point: T('叠加不意味着源的频率发生改变。', 'Superposition does not change the frequencies of the sources.', 'Überlagerung ändert die Frequenzen der Quellen nicht.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:W11', 'rust:src/labs/waves.rs doppler_and_notes'],
    links: { labs: ['waves'] }, review: R2
  },
  {
    id: 'W12', title: T('声强级与对数尺度', 'Sound intensity level and logarithmic scales', 'Schallintensitätspegel und logarithmische Skalen'),
    stages: ['s'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('参考声强 I0 = 10⁻¹² W/m²；非相干声源的声强相加', 'Reference intensity I0 = 10⁻¹² W/m²; intensities of incoherent sources add', 'Bezugsintensität I0 = 10⁻¹² W/m²; Intensitäten inkohärenter Quellen addieren sich')],
    validity: T('零声强没有有限分贝值（不截成 0 dB）；声压级另有参考值', 'Zero intensity has no finite level (it is not cut to 0 dB); the sound-pressure level has another reference', 'Intensität null hat keinen endlichen Pegel (nicht auf 0 dB abschneiden); der Schalldruckpegel hat einen anderen Bezug'),
    sources: ['S19'],
    inputs: [pos('I', 'I', T('单个声源声强', 'Intensity of one source', 'Intensität einer Quelle'), 'W/m²', 'intensity', 1e-6), pos('nS', 'n', T('相同非相干声源个数', 'Number of equal incoherent sources', 'Anzahl gleicher inkohärenter Quellen'), '', 'count', 2)],
    outputs: [out('L1', 'L_I', T('单源声强级（dB）', 'Level of one source (dB)', 'Pegel einer Quelle (dB)'), '', '10*lg(I/I_0)'), out('Ln', "L_I'", T('n 个声源合成声强级（dB）', 'Level of n sources (dB)', 'Pegel von n Quellen (dB)'), '', '10*lg(nS*I/I_0)')],
    example: { text: T('声强 I = 10⁻⁶ W/m²；再叠加一个相同但不相干的声源。', 'Intensity 10⁻⁶ W/m²; add an equal but incoherent source.', 'Intensität 10⁻⁶ W/m²; eine gleiche, inkohärente Quelle kommt hinzu.'), answer: T('初始声强级 60 dB；声强翻倍后约 63.0103 dB。', '60 dB at first; about 63.0103 dB with twice the intensity.', 'Zuerst 60 dB; bei doppelter Intensität etwa 63,0103 dB.') },
    point: T('dB 不能直接相加；声强级和声压级须区分。', 'Decibels do not add; tell intensity and pressure levels apart.', 'Dezibel addieren sich nicht; Intensitäts- und Schalldruckpegel unterscheiden.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:W12', 'rust:src/labs/waves.rs doppler_and_notes'],
    links: { labs: ['waves'] }, review: R2
  },
  {
    id: 'W13', title: T('傅里叶分析与采样混叠', 'Fourier analysis and aliasing', 'Fourier-Analyse und Aliasing'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('等间隔采样 N 点，采样率 fs；单一正弦', 'N equally spaced samples at rate fs; a single sine', 'N gleichabständige Abtastwerte mit Rate fs; ein einzelner Sinus')],
    validity: T('高于 Nyquist 频率的分量折叠到 [0, fs/2]；非整周期采样有谱泄漏', 'Components above the Nyquist frequency fold into [0, fs/2]; non-integer periods leak', 'Anteile über der Nyquist-Frequenz falten sich in [0, fs/2]; nicht ganzzahlige Perioden verursachen Leckeffekt'),
    sources: ['S19', 'S67'],
    inputs: [pos('fs', 'f_s', T('采样率', 'Sampling rate', 'Abtastrate'), 'Hz', 'frequency', 100), pos('Ns', 'N', T('采样点数', 'Number of samples', 'Anzahl der Abtastwerte'), '', 'count', 1000), nonneg('f', 'f', T('信号频率', 'Signal frequency', 'Signalfrequenz'), 'Hz', 'frequency', 70)],
    conditions: [cond('below', T('信号频率不高于 Nyquist 频率', 'Signal at or below the Nyquist frequency', 'Signal höchstens bei der Nyquist-Frequenz'), 'f <= fs/2')],
    outputs: [out('fN', 'f_N', T('Nyquist 频率', 'Nyquist frequency', 'Nyquist-Frequenz'), 'Hz', 'fs/2'), out('df', '\\Delta f', T('频率分辨率', 'Frequency resolution', 'Frequenzauflösung'), 'Hz', 'fs/Ns'), out('fa', 'f_a', T('显示的（混叠后）频率', 'Apparent (aliased) frequency', 'Scheinbare (gefaltete) Frequenz'), 'Hz', 'abs(f - fs*floor(f/fs + 0.5))')],
    example: { text: T('采样率 100 Hz，1000 点，真实正弦频率 70 Hz。', 'Sampling at 100 Hz, 1000 points, a true sine of 70 Hz.', 'Abtastung mit 100 Hz, 1000 Punkte, wahrer Sinus mit 70 Hz.'), answer: T('Nyquist 频率 50 Hz；频率间隔 0.1 Hz；70 Hz 混叠为 30 Hz。', 'Nyquist frequency 50 Hz; resolution 0.1 Hz; 70 Hz aliases to 30 Hz.', 'Nyquist-Frequenz 50 Hz; Auflösung 0,1 Hz; 70 Hz erscheint als 30 Hz.') },
    point: T('采样丢失的信息不能靠插值恢复；窗函数影响谱泄漏。', 'Information lost in sampling cannot be recovered by interpolation; the window affects leakage.', 'Beim Abtasten verlorene Information lässt sich nicht interpolieren; das Fenster beeinflusst den Leckeffekt.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:W13'],
    links: {}, review: R2
  },
  {
    id: 'W14', title: T('色散与群速度', 'Dispersion and group velocity', 'Dispersion und Gruppengeschwindigkeit'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('模型色散关系 ω = a k²；窄谱波包', 'Model dispersion relation ω = a k²; a narrow-band packet', 'Modell-Dispersionsrelation ω = a k²; schmalbandiges Paket')],
    validity: T('群速度描述窄谱包络；宽谱时包络变形，需完整模拟', 'The group velocity describes a narrow-band envelope; broad spectra deform it and need a full simulation', 'Die Gruppengeschwindigkeit beschreibt eine schmalbandige Hülle; breite Spektren verformen sie und brauchen eine volle Simulation'),
    sources: ['S19', 'S38'],
    inputs: [pos('a', 'a', T('色散系数', 'Dispersion coefficient', 'Dispersionskoeffizient'), 'm²/s', 'diffusivity', 1), pos('k0', 'k_0', T('中心波数', 'Central wavenumber', 'Zentrale Wellenzahl'), '1/m', 'wavenumber', 2)],
    outputs: [out('w0', '\\omega_0', T('中心角频率', 'Central angular frequency', 'Zentrale Kreisfrequenz'), 'rad/s', 'a*k0^2'), out('vp', 'v_p', T('相速度', 'Phase velocity', 'Phasengeschwindigkeit'), 'm/s', 'a*k0'), out('vg', 'v_g', T('群速度', 'Group velocity', 'Gruppengeschwindigkeit'), 'm/s', '2*a*k0')],
    example: { text: T('模型系数 a = 1 m²/s，中心波数 k0 = 2 m⁻¹。', 'Model coefficient a = 1 m²/s, central wavenumber k0 = 2 m⁻¹.', 'Modellkoeffizient a = 1 m²/s, zentrale Wellenzahl k0 = 2 m⁻¹.'), answer: T('ω0 = 4 rad/s；相速度 2 m/s；群速度 4 m/s。', 'ω0 = 4 rad/s; phase velocity 2 m/s; group velocity 4 m/s.', 'ω0 = 4 rad/s; Phasengeschwindigkeit 2 m/s; Gruppengeschwindigkeit 4 m/s.') },
    point: T('包络、相位和信息传播速度不应混同。', 'Envelope, phase and signal speeds are not the same.', 'Hüllkurven-, Phasen- und Signalgeschwindigkeit sind nicht dasselbe.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:W14', 'test:loop3 quantum packet centre moves at the group velocity'],
    links: {}, review: R2
  }
]
