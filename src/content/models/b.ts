/**
 * B01–B20: magnetism, induction and electromagnetic fields (blueprint §5.7; doc 02 §7).
 */
import type { ModelSpec } from './types'
import { A, L, T, angle, cond, inp, let_, nonneg, out, pos } from './dsl'

const R2 = { physics: '2026-10-28', language: '2026-10-28' }
const mu0Note = T('μ0 取所选常数集（2019 SI 之后 μ0 不再是定义值 4π×10⁻⁷）', 'μ0 from the chosen constant set (since the 2019 SI μ0 is no longer exactly 4π×10⁻⁷)', 'μ0 aus dem gewählten Konstantensatz (seit dem SI 2019 ist μ0 nicht mehr genau 4π×10⁻⁷)')

export const MODELS_B: ModelSpec[] = [
  {
    id: 'B01', title: T('长直导线磁场', 'Field of a long straight wire', 'Magnetfeld eines langen geraden Leiters'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'section2d',
    assumptions: [A.vacuum, mu0Note, T('无限长直导线（截面图），电流在半径 a 的圆截面内均匀分布', 'Infinitely long straight wire (cross-section), current uniform over a circle of radius a', 'Unendlich langer gerader Leiter (Querschnitt), Strom gleichmäßig über einen Kreis vom Radius a')],
    validity: T('三维长直导线的截面；不能把任意画出的线圈当同一几何', 'Cross-section of a long straight wire; an arbitrary drawn coil is not this geometry', 'Querschnitt eines langen geraden Leiters; eine beliebig gezeichnete Spule ist eine andere Geometrie'),
    sources: ['S30', 'S03'],
    inputs: [inp('I', 'I', L.I, 'A', 'current', 10), pos('r', 'r', T('到导线轴线的距离', 'Distance from the axis', 'Abstand von der Achse'), 'm', 'length', 0.05), pos('a', 'a', T('导线半径', 'Radius of the wire', 'Drahtradius'), 'm', 'length', 0.001)],
    conditions: [cond('outside', T('在导线外', 'Outside the wire', 'Außerhalb des Drahts'), 'r >= a'), cond('inside', T('在导线内', 'Inside the wire', 'Im Draht'), 'r < a')],
    outputs: [
      out('B', 'B', L.B, 'T', 'mu0*abs(I)/(2*pi*r)', { when: 'outside', branch: T('导线外：∝ 1/r', 'Outside: ∝ 1/r', 'Außen: ∝ 1/r') }),
      out('B', 'B', L.B, 'T', 'mu0*abs(I)*r/(2*pi*a^2)', { when: 'inside', branch: T('导线内：∝ r', 'Inside: ∝ r', 'Innen: ∝ r') })
    ],
    example: { text: T('直导线电流 10 A，距导线 0.05 m，真空。', 'A straight wire with 10 A, 0.05 m away, vacuum.', 'Gerader Leiter mit 10 A, Abstand 0,05 m, Vakuum.'), answer: T('按 CODATA μ0，B 约为 40 μT；方向由右手定则确定。', 'With the CODATA μ0, B is about 40 μT; the direction follows the right-hand rule.', 'Mit μ0 nach CODATA ist B etwa 40 μT; die Richtung folgt der Rechte-Hand-Regel.') },
    point: T('该式描述三维长直导线截面，不能把任意画出的线圈当同一几何。', 'The formula describes the cross-section of a long straight wire, not any drawn coil.', 'Die Formel beschreibt den Querschnitt eines langen geraden Leiters, keine beliebige Spule.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B01', 'rust:src/labs/magnet.rs straight_wire_and_parallel_wires', 'test:labs2656 magnetMap constants by set'],
    links: { topics: ['induction'] }, review: R2
  },
  {
    id: 'B02', title: T('线圈与螺线管', 'Loop and solenoid', 'Kreisstrom und Spule'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'axisym',
    assumptions: [A.vacuum, mu0Note, T('三维圆线圈中心（轴对称）；长螺线管内部（忽略端部）', 'Centre of a 3D circular loop (axially symmetric); inside a long solenoid (ends neglected)', 'Mitte eines 3D-Kreisstroms (achsensymmetrisch); im Inneren einer langen Spule (Enden vernachlässigt)')],
    validity: T('螺线管长度远大于半径；实验室的二维“螺线管”是两片电流层的截面，属另一几何', 'A solenoid much longer than its radius; the lab’s 2D “solenoid” is the section of two current sheets, another geometry', 'Spule viel länger als ihr Radius; die 2D-„Spule“ des Labors ist der Schnitt zweier Stromschichten, eine andere Geometrie'),
    sources: ['S30', 'S03'],
    inputs: [pos('N', 'N', T('线圈匝数', 'Turns of the loop', 'Windungszahl des Kreisstroms'), '', 'count', 10), inp('I', 'I', L.I, 'A', 'current', 2), pos('R', 'R', T('线圈半径', 'Radius of the loop', 'Radius des Kreisstroms'), 'm', 'length', 0.1), pos('n', 'n', T('螺线管单位长度匝数', 'Turns per metre of the solenoid', 'Windungen pro Meter der Spule'), '1/m', 'turnDensity', 1000), pos('ls', 'l', T('螺线管长度', 'Length of the solenoid', 'Länge der Spule'), 'm', 'length', 0.5), pos('Rs', 'R_s', T('螺线管半径', 'Radius of the solenoid', 'Radius der Spule'), 'm', 'length', 0.02)],
    conditions: [cond('long', T('螺线管足够长（l ≥ 10 Rs）', 'The solenoid is long enough (l ≥ 10 Rs)', 'Die Spule ist lang genug (l ≥ 10 Rs)'), 'ls >= 10*Rs', 'ls >= 3*Rs')],
    outputs: [
      out('Bloop', 'B_0', T('圆线圈中心的磁场', 'Field at the centre of the loop', 'Feld in der Mitte des Kreisstroms'), 'T', 'mu0*N*abs(I)/(2*R)'),
      out('Bsol', 'B', T('长螺线管内部磁场', 'Field inside a long solenoid', 'Feld in einer langen Spule'), 'T', 'mu0*n*abs(I)', { requires: ['long'] }),
      out('Bfinite', 'B_c', T('有限螺线管中心磁场', 'Field at the centre of a finite solenoid', 'Feld in der Mitte einer endlichen Spule'), 'T', 'mu0*n*abs(I)*ls/sqrt(ls^2 + 4*Rs^2)')
    ],
    example: { text: T('三维圆线圈 N = 10 匝，I = 2 A，R = 0.1 m，求中心场。', 'A 3D loop with N = 10 turns, I = 2 A, R = 0.1 m: the field at its centre.', 'Ein 3D-Kreisstrom mit N = 10 Windungen, I = 2 A, R = 0,1 m: Feld in der Mitte.'), answer: T('中心 B ≈ 1.25664×10⁻⁴ T；长螺线管采用另一适用条件。', 'B ≈ 1.25664×10⁻⁴ T at the centre; a long solenoid has its own condition.', 'B ≈ 1,25664×10⁻⁴ T in der Mitte; eine lange Spule hat eine eigene Bedingung.') },
    point: T('真实三维圆环与二维无限延伸截面不等价。', 'A real 3D ring and an infinite 2D section are not equivalent.', 'Ein echter 3D-Ring und ein unendlicher 2D-Schnitt sind nicht gleichwertig.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B02', 'rust:src/labs/magnet.rs long_sheet_pair_is_a_solenoid'],
    links: { topics: ['induction'] }, review: R2
  },
  {
    id: 'B03', title: T('平行电流相互作用', 'Force between parallel currents', 'Kraft zwischen parallelen Strömen'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'section2d',
    assumptions: [A.vacuum, mu0Note, T('两根无限长平行导线；结果是每米长度的力', 'Two infinitely long parallel wires; the result is a force per metre', 'Zwei unendlich lange parallele Leiter; Ergebnis ist eine Kraft pro Meter')],
    validity: T('有限长度 ℓ 时总力 ≈ (F/ℓ)·ℓ 只在 ℓ ≫ d 时成立', 'For a finite length ℓ the total force ≈ (F/ℓ)·ℓ only for ℓ ≫ d', 'Bei endlicher Länge ℓ gilt Gesamtkraft ≈ (F/ℓ)·ℓ nur für ℓ ≫ d'),
    sources: ['S30', 'S03'],
    inputs: [inp('I1', 'I_1', T('电流 1', 'Current 1', 'Strom 1'), 'A', 'current', 10), inp('I2', 'I_2', T('电流 2（同向为正）', 'Current 2 (same direction positive)', 'Strom 2 (gleiche Richtung positiv)'), 'A', 'current', 10), pos('d', 'd', T('导线间距', 'Distance of the wires', 'Leiterabstand'), 'm', 'length', 0.1), pos('l', '\\ell', T('有效长度', 'Effective length', 'Wirksame Länge'), 'm', 'length', 1)],
    conditions: [cond('long', T('导线远长于间距（ℓ ≥ 20d）', 'The wires are much longer than their distance (ℓ ≥ 20d)', 'Die Leiter sind viel länger als ihr Abstand (ℓ ≥ 20d)'), 'l >= 20*d', 'l >= 5*d')],
    outputs: [
      out('f', 'F/\\ell', T('每米长度的力（正为吸引）', 'Force per metre (attraction positive)', 'Kraft pro Meter (Anziehung positiv)'), 'N/m', 'mu0*I1*I2/(2*pi*d)'),
      out('F', 'F', T('长度 ℓ 上的总力', 'Total force over ℓ', 'Gesamtkraft über ℓ'), 'N', 'mu0*I1*I2*l/(2*pi*d)', { requires: ['long'] })
    ],
    example: { text: T('两长平行导线相距 0.1 m，电流各 10 A，同向。', 'Two long parallel wires 0.1 m apart, 10 A each, same direction.', 'Zwei lange parallele Leiter im Abstand 0,1 m, je 10 A, gleiche Richtung.'), answer: T('相互吸引，每米作用力约 2×10⁻⁴ N/m。', 'They attract with about 2×10⁻⁴ N per metre.', 'Sie ziehen sich mit etwa 2×10⁻⁴ N pro Meter an.') },
    point: T('每单位长度的量不能直接标成总力。', 'A per-metre quantity must not be labelled as a total force.', 'Eine Größe pro Meter darf nicht als Gesamtkraft beschriftet werden.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B03', 'rust:src/labs/magnet.rs straight_wire_and_parallel_wires'],
    links: { topics: ['induction'] }, review: R2
  },
  {
    id: 'B04', title: T('带电粒子圆周运动', 'Charged particle in circular motion', 'Geladenes Teilchen auf der Kreisbahn'),
    stages: ['s'], priority: 'P1', geometry: 'point',
    assumptions: [T('匀强磁场，速度垂直于 B，不计重力', 'Uniform field, velocity perpendicular to B, no gravity', 'Homogenes Feld, Geschwindigkeit senkrecht zu B, ohne Schwerkraft'), A.nonRel, A.teachingUnits],
    validity: T('非相对论速度', 'Non-relativistic speed', 'Nichtrelativistische Geschwindigkeit'),
    sources: ['S29'],
    inputs: [pos('m', 'm', L.m, 'kg', 'mass', 1), inp('q', 'q', L.q, 'C', 'charge', 1), nonneg('v', 'v_\\perp', T('垂直于 B 的速率', 'Speed perpendicular to B', 'Geschwindigkeit senkrecht zu B'), 'm/s', 'velocity', 3), pos('B', 'B', L.B, 'T', 'magneticField', 2)],
    conditions: [cond('charged', T('带电（q ≠ 0）', 'Charged (q ≠ 0)', 'Geladen (q ≠ 0)'), 'abs(q) > 0'), cond('slow', T('非相对论（v ≤ 0.1c）', 'Non-relativistic (v ≤ 0.1c)', 'Nichtrelativistisch (v ≤ 0,1c)'), 'v <= 0.1*c_light', 'v <= 0.3*c_light')],
    outputs: [
      out('r', 'r', T('轨道半径', 'Radius', 'Bahnradius'), 'm', 'm*v/(abs(q)*B)', { requires: ['charged', 'slow'] }),
      out('T', 'T', L.T, 's', '2*pi*m/(abs(q)*B)', { requires: ['charged', 'slow'] }),
      out('w', '\\omega', T('角速度（正为逆时针，B 指向纸外）', 'Angular velocity (counter-clockwise positive, B out of the page)', 'Winkelgeschwindigkeit (gegen den Uhrzeigersinn positiv, B aus der Ebene)'), 'rad/s', '-q*B/m', { requires: ['charged', 'slow'] })
    ],
    example: { text: T('教学粒子 m = 1 kg、q = 1 C，垂直以 3 m/s 进入 B = 2 T 匀强场。', 'A teaching particle, m = 1 kg, q = 1 C, enters a 2 T field perpendicularly at 3 m/s.', 'Ein Unterrichtsteilchen, m = 1 kg, q = 1 C, tritt senkrecht mit 3 m/s in ein 2-T-Feld ein.'), answer: T('半径 1.5 m，周期 π s；速率不变。', 'Radius 1.5 m, period π s; the speed stays the same.', 'Radius 1,5 m, Periode π s; die Geschwindigkeit bleibt gleich.') },
    point: T('磁力只改变方向而不做功；教学尺度显式标识。', 'The magnetic force only turns the velocity and does no work; teaching scales are labelled.', 'Die magnetische Kraft dreht nur die Geschwindigkeit und verrichtet keine Arbeit; Unterrichtsgrößen werden gekennzeichnet.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B04', 'rust:tests/electric.rs cyclotron_radius_and_period'],
    links: { situations: ['charge-b', 'zone-b'], topics: ['induction'] }, review: R2
  },
  {
    id: 'B05', title: T('速度选择器', 'Velocity selector', 'Geschwindigkeitsfilter'),
    stages: ['s'], priority: 'P1', geometry: 'point',
    assumptions: [T('E 与 B 互相垂直，且都垂直于速度', 'E and B perpendicular to each other and to the velocity', 'E und B senkrecht zueinander und zur Geschwindigkeit'), A.nonRel],
    validity: T('只在 v = E/B 时直线通过；与电荷正负和质量无关', 'Straight through only for v = E/B, whatever the charge or mass', 'Geradeaus nur für v = E/B, unabhängig von Ladung und Masse'),
    sources: ['S29'],
    inputs: [pos('E', 'E', T('电场强度', 'Electric field', 'Elektrische Feldstärke'), 'V/m', 'electricField', 600), pos('B', 'B', L.B, 'T', 'magneticField', 0.2), inp('q', 'q', L.q, 'C', 'charge', 1.602176634e-19), nonneg('v', 'v', T('粒子速度', 'Speed of the particle', 'Geschwindigkeit des Teilchens'), 'm/s', 'velocity', 3000)],
    outputs: [out('v0', 'v_0', T('无偏转速度', 'Speed without deflection', 'Geschwindigkeit ohne Ablenkung'), 'm/s', 'E/B'), out('Fnet', 'F', T('横向合力（电场方向为正）', 'Net transverse force (along E positive)', 'Resultierende Querkraft (in Richtung E positiv)'), 'N', 'q*(E - v*B)')],
    example: { text: T('互相垂直且使两力相反的 E = 600 V/m、B = 0.2 T。', 'E = 600 V/m and B = 0.2 T, perpendicular and with opposing forces.', 'E = 600 V/m und B = 0,2 T, senkrecht und mit entgegengesetzten Kräften.'), answer: T('无偏转速度 3000 m/s；快慢粒子的偏转方向相反。', 'Undeflected speed 3000 m/s; faster and slower particles are deflected opposite ways.', 'Unabgelenkte Geschwindigkeit 3000 m/s; schnellere und langsamere Teilchen werden entgegengesetzt abgelenkt.') },
    point: T('力抵消有速度和方向条件。', 'The forces cancel only for one speed and direction.', 'Die Kräfte heben sich nur für eine Geschwindigkeit und Richtung auf.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B05', 'rust:tests/electric.rs velocity_selector_goes_straight'],
    links: { situations: ['selector'], topics: ['induction'] }, review: R2
  },
  {
    id: 'B06', title: T('质谱仪', 'Mass spectrometer', 'Massenspektrometer'),
    stages: ['s'], priority: 'P1', geometry: 'point',
    assumptions: [T('粒子以速度 v 垂直进入匀强磁场，走半圆后打到底片', 'The particle enters the uniform field perpendicularly at v and hits the plate after a half circle', 'Das Teilchen tritt senkrecht mit v ein und trifft nach einem Halbkreis die Platte'), A.nonRel],
    validity: T('测得的是质荷比；电荷态另需信息', 'It measures the mass-to-charge ratio; the charge state needs other information', 'Gemessen wird das Verhältnis Masse zu Ladung; die Ladung braucht andere Angaben'),
    sources: ['S29'],
    inputs: [inp('q', 'q', L.q, 'C', 'charge', 1e-19), pos('v', 'v', L.v, 'm/s', 'velocity', 1e5), pos('B', 'B', L.B, 'T', 'magneticField', 0.1), pos('r', 'r', T('轨道半径', 'Radius', 'Bahnradius'), 'm', 'length', 0.2)],
    outputs: [out('m', 'm', T('粒子质量', 'Mass of the particle', 'Masse des Teilchens'), 'kg', 'abs(q)*B*r/v'), out('mq', 'm/q', T('质荷比', 'Mass-to-charge ratio', 'Verhältnis Masse zu Ladung'), 'kg/C', 'B*r/v'), out('d', 'd', T('落点到入口的距离', 'Distance from the entrance to the spot', 'Abstand vom Eintritt zum Auftreffpunkt'), 'm', '2*r')],
    example: { text: T('粒子电荷 10⁻¹⁹ C，速率 10⁵ m/s，在 0.1 T 场中半径 0.2 m。', 'A particle with 10⁻¹⁹ C at 10⁵ m/s moves on a 0.2 m radius in 0.1 T.', 'Ein Teilchen mit 10⁻¹⁹ C und 10⁵ m/s läuft in 0,1 T auf einem Radius von 0,2 m.'), answer: T('m = 2×10⁻²⁶ kg；需另有电荷态信息才能确定质量。', 'm = 2×10⁻²⁶ kg; the charge state must be known to give the mass.', 'm = 2×10⁻²⁶ kg; der Ladungszustand muss bekannt sein.') },
    point: T('测得的是质荷比；先选择速度再弯转分析。', 'It measures the mass-to-charge ratio; select the speed first, then bend.', 'Gemessen wird Masse durch Ladung; erst die Geschwindigkeit auswählen, dann ablenken.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B06', 'rust:tests/regions.rs mass_spectrometer_lands_at_twice_the_radius'],
    links: { situations: ['zone-b'], topics: ['induction'] }, review: R2
  },
  {
    id: 'B07', title: T('回旋加速器', 'Cyclotron', 'Zyklotron'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'point',
    assumptions: [T('经典回旋：频率与半径无关；每次过缝获得 qU', 'Classical cyclotron: frequency independent of the radius; qU gained per gap crossing', 'Klassisches Zyklotron: Frequenz unabhängig vom Radius; qU pro Spaltdurchgang'), A.nonRel],
    validity: T('动能远小于静能（≤ 1 %）；接近相对论时同步条件失效', 'Kinetic energy far below the rest energy (≤ 1 %); near relativistic speeds the resonance fails', 'Kinetische Energie weit unter der Ruheenergie (≤ 1 %); nahe relativistischer Geschwindigkeit versagt die Resonanz'),
    sources: ['S29', 'S37', 'S03'],
    inputs: [inp('q', 'q', L.q, 'C', 'charge', 1.602176634e-19), pos('m', 'm', L.m, 'kg', 'mass', 1.67262192595e-27), pos('B', 'B', L.B, 'T', 'magneticField', 0.5), pos('Rd', 'R', T('D 形盒半径', 'Radius of the dees', 'Radius der Duanten'), 'm', 'length', 0.5), pos('U', 'U', T('缝间电压', 'Gap voltage', 'Spaltspannung'), 'V', 'voltage', 20000)],
    lets: [let_('K', 'E_k', T('最大动能', 'Maximum kinetic energy', 'Maximale kinetische Energie'), 'J', '(q*B*Rd)^2/(2*m)')],
    conditions: [cond('classical', T('非相对论（Ek ≤ 1 % mc²）', 'Non-relativistic (Ek ≤ 1 % mc²)', 'Nichtrelativistisch (Ek ≤ 1 % mc²)'), 'K <= 0.01*m*c_light^2', 'K <= 0.05*m*c_light^2')],
    outputs: [
      out('f', 'f', T('回旋频率', 'Cyclotron frequency', 'Zyklotronfrequenz'), 'Hz', 'abs(q)*B/(2*pi*m)', { requires: ['classical'] }),
      out('K', 'E_k', T('出口动能', 'Kinetic energy at the exit', 'Kinetische Energie am Ausgang'), 'J', 'K', { requires: ['classical'] }),
      out('n', 'n', T('所需加速次数', 'Number of gap crossings', 'Anzahl der Spaltdurchgänge'), '', 'K/(abs(q)*U)', { requires: ['classical'] })
    ],
    example: { text: T('质子处于 B = 0.5 T 的非相对论回旋模型，采用 CODATA 电荷和质量。', 'A proton in a non-relativistic cyclotron with B = 0.5 T, CODATA charge and mass.', 'Ein Proton im nichtrelativistischen Zyklotron mit B = 0,5 T, Ladung und Masse nach CODATA.'), answer: T('回旋频率约 7.62259 MHz；在低速近似下与轨道半径无关。', 'Cyclotron frequency about 7.62259 MHz, independent of the radius at low speed.', 'Zyklotronfrequenz etwa 7,62259 MHz, bei kleiner Geschwindigkeit unabhängig vom Radius.') },
    point: T('相对论质量效应通过 γ 改变同步条件，不用经典式无限加速。', 'Relativity changes the resonance through γ; the classical formula does not accelerate forever.', 'Die Relativität ändert die Resonanz über γ; die klassische Formel beschleunigt nicht unbegrenzt.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B07', 'rust:tests/regions.rs cyclotron_gains_energy_each_gap_crossing', 'test:zoneSemicircle'],
    links: { situations: ['zone-b', 'zone-e'], topics: ['induction'] }, review: R2
  },
  {
    id: 'B08', title: T('霍尔效应', 'Hall effect', 'Hall-Effekt'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('单一载流子，横向平衡', 'One kind of carrier, transverse equilibrium', 'Eine Ladungsträgerart, Quergleichgewicht')],
    validity: T('厚度 t 是沿 B 方向的尺寸（不是宽度）；双载流子另需模型', 't is the size along B (not the width); two kinds of carriers need another model', 't ist die Ausdehnung längs B (nicht die Breite); zwei Trägerarten brauchen ein anderes Modell'),
    sources: ['S29', 'S03'],
    inputs: [inp('I', 'I', L.I, 'A', 'current', 1), inp('B', 'B', L.B, 'T', 'magneticField', 0.5), pos('n', 'n', T('载流子浓度', 'Carrier density', 'Ladungsträgerdichte'), '1/m³', 'numberDensity', 1e28), pos('t', 't', T('厚度（沿 B）', 'Thickness (along B)', 'Dicke (längs B)'), 'm', 'length', 1e-3), inp('qc', 'q', T('载流子电荷', 'Carrier charge', 'Ladung der Träger'), 'C', 'charge', 1.602176634e-19)],
    conditions: [cond('carrier', T('载流子带电', 'The carriers are charged', 'Die Träger sind geladen'), 'abs(qc) > 0')],
    outputs: [out('VH', 'V_H', T('霍尔电压（符号随载流子）', 'Hall voltage (sign follows the carriers)', 'Hall-Spannung (Vorzeichen nach den Trägern)'), 'V', 'I*B/(n*qc*t)', { requires: ['carrier'] }), out('RH', 'R_H', T('霍尔系数', 'Hall coefficient', 'Hall-Koeffizient'), 'm³/C', '1/(n*qc)', { requires: ['carrier'] })],
    example: { text: T('单一载流子，n = 10²⁸ m⁻³，电流 1 A，B = 0.5 T，厚度 1 mm，|q| = e。', 'One carrier type, n = 10²⁸ m⁻³, 1 A, B = 0.5 T, thickness 1 mm, |q| = e.', 'Eine Trägerart, n = 10²⁸ m⁻³, 1 A, B = 0,5 T, Dicke 1 mm, |q| = e.'), answer: T('霍尔电压大小约 0.312075 μV；符号取决于载流子和坐标方向。', 'The Hall voltage is about 0.312075 μV; its sign depends on the carriers and the axes.', 'Die Hall-Spannung ist etwa 0,312075 μV; ihr Vorzeichen hängt von den Trägern und Achsen ab.') },
    point: T('载流子浓度、符号及横向平衡。', 'Carrier density, sign and transverse balance.', 'Trägerdichte, Vorzeichen und Quergleichgewicht.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:B08'],
    links: {}, review: R2
  },
  {
    id: 'B09', title: T('法拉第与楞次定律', 'Faraday’s and Lenz’s laws', 'Faradaysches Gesetz und Lenzsche Regel'),
    stages: ['s'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('N 匝平面线圈，面积 A，法线与 B 的夹角 α 不变，B 在 Δt 内均匀变化', 'Plane coil of N turns, area A, constant angle α between normal and B, B changes uniformly over Δt', 'Ebene Spule mit N Windungen, Fläche A, fester Winkel α zwischen Normale und B, B ändert sich gleichmäßig in Δt')],
    validity: T('平均电动势；负号由选定法向与绕行方向解释', 'Average emf; the minus sign is read with the chosen normal and sense of circulation', 'Mittlere Induktionsspannung; das Minus wird mit gewählter Normale und Umlaufsinn gelesen'),
    sources: ['S31'],
    inputs: [pos('N', 'N', T('匝数', 'Turns', 'Windungszahl'), '', 'count', 100), pos('A', 'A', T('每匝面积', 'Area per turn', 'Fläche pro Windung'), 'm²', 'area', 0.01), inp('B0', 'B_0', T('初磁场', 'Initial field', 'Anfangsfeld'), 'T', 'magneticField', 0), inp('B1', 'B_1', T('末磁场', 'Final field', 'Endfeld'), 'T', 'magneticField', 0.2), pos('dt', '\\Delta t', T('变化时间', 'Duration of the change', 'Dauer der Änderung'), 's', 'time', 0.5), angle('alpha', '\\alpha', T('法线与 B 的夹角', 'Angle between normal and B', 'Winkel zwischen Normale und B'), 0)],
    outputs: [out('dPhi', '\\Delta\\Phi', T('每匝磁通量变化', 'Change of flux per turn', 'Flussänderung pro Windung'), 'Wb', 'A*(B1 - B0)*cos(alpha)'), out('emf', '\\mathcal{E}', T('平均感应电动势', 'Average induced emf', 'Mittlere Induktionsspannung'), 'V', '-N*A*(B1 - B0)*cos(alpha)/dt')],
    example: { text: T('100 匝线圈，每匝面积 0.01 m²，法向同 B，0.5 s 内 B 增加 0.2 T。', '100 turns of 0.01 m² each, normal along B, B rises by 0.2 T in 0.5 s.', '100 Windungen zu je 0,01 m², Normale längs B, B steigt in 0,5 s um 0,2 T.'), answer: T('平均感应电动势大小 0.4 V；负号由选定法向和绕行方向解释。', 'Average emf 0.4 V in size; the minus sign follows the chosen normal and sense.', 'Mittlere Induktionsspannung 0,4 V; das Minus folgt aus Normale und Umlaufsinn.') },
    point: T('反抗的是磁通变化，不是总反抗运动或磁场。', 'It opposes the change of flux, not motion or the field as such.', 'Sie wirkt der Flussänderung entgegen, nicht der Bewegung oder dem Feld an sich.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B09'],
    links: { topics: ['induction'] }, review: R2
  },
  {
    id: 'B10', title: T('运动电动势', 'Motional emf', 'Bewegungsinduktion'),
    stages: ['s'], priority: 'P1', geometry: 'section2d',
    assumptions: [T('导体棒垂直于 B 和导轨匀速运动；回路总电阻 R；忽略自感', 'The rod moves uniformly, perpendicular to B and the rails; total resistance R; self-inductance neglected', 'Der Stab bewegt sich gleichförmig senkrecht zu B und den Schienen; Gesamtwiderstand R; Selbstinduktion vernachlässigt')],
    validity: T('匀速需外力维持；外力功率等于焦耳热功率', 'Uniform motion needs a driving force; its power equals the Joule heating', 'Gleichförmige Bewegung braucht eine Antriebskraft; ihre Leistung ist die Joulesche Wärme'),
    sources: ['S31'],
    inputs: [pos('B', 'B', L.B, 'T', 'magneticField', 0.5), pos('L', 'L', T('导轨间距', 'Rail spacing', 'Schienenabstand'), 'm', 'length', 0.2), inp('v', 'v', L.v, 'm/s', 'velocity', 3), pos('R', 'R', T('回路电阻', 'Resistance of the circuit', 'Widerstand des Kreises'), 'Ω', 'resistance', 2)],
    outputs: [out('emf', '\\mathcal{E}', T('电动势', 'emf', 'Induktionsspannung'), 'V', 'B*L*v'), out('I', 'I', L.I, 'A', 'B*L*v/R'), out('P', 'P', T('焦耳热功率', 'Joule heating power', 'Joulesche Wärmeleistung'), 'W', '(B*L*v)^2/R'), out('F', 'F', T('维持匀速的外力', 'Force that keeps the speed', 'Kraft für gleichförmige Bewegung'), 'N', 'B^2*L^2*v/R'), out('Pmech', 'Fv', T('外力功率', 'Power of the force', 'Leistung der Kraft'), 'W', 'B^2*L^2*v^2/R')],
    example: { text: T('垂直导体棒 B = 0.5 T，L = 0.2 m，以 3 m/s 匀速，回路 R = 2 Ω。', 'A rod perpendicular to B = 0.5 T, L = 0.2 m, at a steady 3 m/s, R = 2 Ω.', 'Ein Stab senkrecht zu B = 0,5 T, L = 0,2 m, mit gleichmäßigen 3 m/s, R = 2 Ω.'), answer: T('电动势 0.3 V；电流 0.15 A；焦耳热功率 0.045 W；维持力大小 0.015 N。', 'emf 0.3 V; current 0.15 A; Joule heating 0.045 W; holding force 0.015 N.', 'Spannung 0,3 V; Strom 0,15 A; Wärmeleistung 0,045 W; Haltekraft 0,015 N.') },
    point: T('电磁制动的反作用与能量转换。', 'Electromagnetic braking: reaction force and energy conversion.', 'Elektromagnetische Bremsung: Gegenkraft und Energieumwandlung.'),
    status: 'verified', level: 3, teaching: 2, references: ['analytic', 'otherMethod'],
    benchmarks: ['oracle:B10', 'test:loop2 rail coast: simulation vs B10/B11 and power balance', 'rust:tests/regions.rs rail_loop_terminal_velocity_and_energy'],
    links: { situations: ['rail'], activities: ['act-rail'], topics: ['induction'] }, review: R2
  },
  {
    id: 'B11', title: T('导轨回路的动力学', 'Dynamics of a rail circuit', 'Dynamik eines Schienenkreises'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'section2d',
    assumptions: [T('恒力 F 沿导轨，回路电阻 R，忽略自感与摩擦', 'Constant force F along the rails, circuit resistance R, no self-inductance or friction', 'Konstante Kraft F längs der Schienen, Widerstand R, ohne Selbstinduktion und Reibung')],
    validity: T('忽略自感是明确近似（L/R ≪ mR/(B²L²)）', 'Neglecting self-inductance is an explicit approximation (L/R ≪ mR/(B²L²))', 'Die Vernachlässigung der Selbstinduktion ist eine ausdrückliche Näherung (L/R ≪ mR/(B²L²))'),
    sources: ['S31', 'S32', 'S56'],
    inputs: [pos('m', 'm', T('导体棒质量', 'Mass of the rod', 'Masse des Stabs'), 'kg', 'mass', 1), pos('B', 'B', L.B, 'T', 'magneticField', 2), pos('L', 'L', T('导轨间距', 'Rail spacing', 'Schienenabstand'), 'm', 'length', 0.5), pos('R', 'R', T('回路电阻', 'Resistance of the circuit', 'Widerstand des Kreises'), 'Ω', 'resistance', 1), inp('F', 'F', T('恒定外力', 'Constant force', 'Konstante Kraft'), 'N', 'force', 4), nonneg('t', 't', L.t, 's', 'time', 1), inp('v0', 'v_0', L.v0, 'm/s', 'velocity', 0)],
    lets: [let_('k', 'B^2L^2/R', T('等效阻尼系数', 'Equivalent damping coefficient', 'Äquivalenter Dämpfungskoeffizient'), 'kg/s', 'B^2*L^2/R'), let_('vT', 'v_\\infty', T('收尾速度', 'Terminal velocity', 'Endgeschwindigkeit'), 'm/s', 'F*R/(B^2*L^2)')],
    outputs: [
      out('k', 'B^2L^2/R', T('等效阻尼系数', 'Equivalent damping coefficient', 'Äquivalenter Dämpfungskoeffizient'), 'kg/s', 'k'),
      out('vT', 'v_\\infty', T('收尾速度', 'Terminal velocity', 'Endgeschwindigkeit'), 'm/s', 'vT'),
      out('v', 'v(t)', T('t 时刻的速度', 'Velocity at t', 'Geschwindigkeit bei t'), 'm/s', 'vT + (v0 - vT)*exp(-k*t/m)'),
      out('x', 'x(t)', T('0 到 t 的位移', 'Displacement 0 … t', 'Verschiebung 0 … t'), 'm', 'vT*t + (v0 - vT)*m/k*(1 - exp(-k*t/m))'),
      out('Q', 'Q', T('0 到 t 的焦耳热', 'Joule heat 0 … t', 'Joulesche Wärme 0 … t'), 'J', 'F*(vT*t + (v0 - vT)*m/k*(1 - exp(-k*t/m))) - m*((vT + (v0 - vT)*exp(-k*t/m))^2 - v0^2)/2')
    ],
    example: { text: T('m = 1 kg，B = 2 T，L = 0.5 m，R = 1 Ω，恒力 4 N，初静止。', 'm = 1 kg, B = 2 T, L = 0.5 m, R = 1 Ω, constant force 4 N, from rest.', 'm = 1 kg, B = 2 T, L = 0,5 m, R = 1 Ω, konstante Kraft 4 N, aus der Ruhe.'), answer: T('等效阻尼 1 kg/s；终速 4 m/s，t = 1 s 时 v = 2.52848 m/s。', 'Equivalent damping 1 kg/s; terminal velocity 4 m/s, v = 2.52848 m/s at t = 1 s.', 'Äquivalente Dämpfung 1 kg/s; Endgeschwindigkeit 4 m/s, bei t = 1 s v = 2,52848 m/s.') },
    point: T('同时解机械运动与电路；忽略自感是明确近似。', 'Solve the motion and the circuit together; neglecting self-inductance is an explicit approximation.', 'Bewegung und Stromkreis zusammen lösen; die Vernachlässigung der Selbstinduktion ist eine ausdrückliche Näherung.'),
    status: 'verified', level: 3, teaching: 2, references: ['analytic', 'otherMethod'],
    benchmarks: ['oracle:B11', 'test:loop2 rail force: simulation vs B11 and energy balance', 'rust:tests/regions.rs rail_loop_terminal_velocity_and_energy'],
    links: { situations: ['rail'], activities: ['act-rail'], topics: ['induction'] }, review: R2
  },
  {
    id: 'B12', title: T('自感 互感与磁能', 'Self- and mutual inductance and magnetic energy', 'Selbst- und Gegeninduktivität und magnetische Energie'),
    stages: ['u'], priority: 'P2', geometry: 'lumped',
    assumptions: [T('两线圈耦合系数 k，按同名端约定', 'Two coils with coupling coefficient k, dot convention', 'Zwei Spulen mit Kopplungsfaktor k, Punktkonvention')],
    validity: T('|k| ≤ 1，磁能非负', '|k| ≤ 1, non-negative magnetic energy', '|k| ≤ 1, nichtnegative magnetische Energie'),
    sources: ['S32'],
    inputs: [pos('L1', 'L_1', T('线圈 1 电感', 'Inductance of coil 1', 'Induktivität von Spule 1'), 'H', 'inductance', 0.1), pos('L2', 'L_2', T('线圈 2 电感', 'Inductance of coil 2', 'Induktivität von Spule 2'), 'H', 'inductance', 0.4), inp('k', 'k', T('耦合系数', 'Coupling coefficient', 'Kopplungsfaktor'), '', 'ratio', 0.5, { min: -1, max: 1 }), inp('dI1', '\\dot I_1', T('线圈 1 电流变化率', 'Rate of change of the current in coil 1', 'Stromänderung in Spule 1'), 'A/s', 'currentRate', 2), inp('I1', 'I_1', T('线圈 1 电流', 'Current in coil 1', 'Strom in Spule 1'), 'A', 'current', 1), inp('I2', 'I_2', T('线圈 2 电流', 'Current in coil 2', 'Strom in Spule 2'), 'A', 'current', 0)],
    outputs: [out('M', 'M', T('互感', 'Mutual inductance', 'Gegeninduktivität'), 'H', 'k*sqrt(L1*L2)'), out('emf2', '\\mathcal{E}_2', T('线圈 2 的感应电动势', 'emf induced in coil 2', 'In Spule 2 induzierte Spannung'), 'V', '-k*sqrt(L1*L2)*dI1'), out('W', 'W', T('磁能', 'Magnetic energy', 'Magnetische Energie'), 'J', 'L1*I1^2/2 + k*sqrt(L1*L2)*I1*I2 + L2*I2^2/2')],
    example: { text: T('L1 = 0.1 H，L2 = 0.4 H，耦合系数 k = 0.5，dI1/dt = 2 A/s。', 'L1 = 0.1 H, L2 = 0.4 H, k = 0.5, dI1/dt = 2 A/s.', 'L1 = 0,1 H, L2 = 0,4 H, k = 0,5, dI1/dt = 2 A/s.'), answer: T('M = 0.1 H；按同名端约定，感应电动势为 −0.2 V。', 'M = 0.1 H; with the dot convention the induced emf is −0.2 V.', 'M = 0,1 H; mit der Punktkonvention ist die induzierte Spannung −0,2 V.') },
    point: T('互感符号与绕组方向相关；能量矩阵必须物理有效。', 'The sign of M depends on the winding sense; the energy matrix must be physically valid.', 'Das Vorzeichen von M hängt vom Wickelsinn ab; die Energiematrix muss physikalisch gültig sein.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B12', 'rust:src/labs/transient.rs transformer_ratio_and_dc'],
    links: {}, review: R2
  },
  {
    id: 'B13', title: T('变压器与输电', 'Transformer and power transmission', 'Transformator und Energieübertragung'),
    stages: ['s'], priority: 'P1', geometry: 'lumped',
    assumptions: [T('理想变压器（无损耗、无励磁电流），交流；输电线电阻 Rline', 'Ideal transformer (lossless, no magnetizing current), AC; line resistance Rline', 'Idealer Transformator (verlustfrei, ohne Magnetisierungsstrom), Wechselstrom; Leitungswiderstand Rline')],
    validity: T('直流不能维持理想变压传能', 'Direct current cannot be transformed', 'Gleichstrom lässt sich nicht transformieren'),
    sources: ['S33', 'S51'],
    inputs: [pos('N1', 'N_1', T('初级匝数', 'Primary turns', 'Primärwindungen'), '', 'count', 10), pos('N2', 'N_2', T('次级匝数', 'Secondary turns', 'Sekundärwindungen'), '', 'count', 1), inp('V1', 'U_1', T('初级电压有效值', 'Primary RMS voltage', 'Primärspannung (effektiv)'), 'V', 'voltage', 230), inp('I2', 'I_2', T('次级电流有效值', 'Secondary RMS current', 'Sekundärstrom (effektiv)'), 'A', 'current', 2), nonneg('Rline', 'R_l', T('输电线电阻', 'Line resistance', 'Leitungswiderstand'), 'Ω', 'resistance', 0)],
    outputs: [out('V2', 'U_2', T('次级电压', 'Secondary voltage', 'Sekundärspannung'), 'V', 'V1*N2/N1'), out('I1', 'I_1', T('初级电流', 'Primary current', 'Primärstrom'), 'A', 'I2*N2/N1'), out('P', 'P', T('传输功率', 'Power transferred', 'Übertragene Leistung'), 'W', 'V1*I2*N2/N1'), out('Ploss', 'P_l', T('次级线路损耗', 'Loss in the secondary line', 'Verlust in der Sekundärleitung'), 'W', 'I2^2*Rline')],
    example: { text: T('理想变压器匝比 10∶1，初级有效值 230 V，次级负载电流 2 A。', 'An ideal 10:1 transformer, 230 V RMS primary, 2 A load current.', 'Idealer Transformator 10:1, 230 V effektiv primär, 2 A Laststrom.'), answer: T('次级 23 V；初级电流 0.2 A；输入输出平均功率均为 46 W。', 'Secondary 23 V; primary current 0.2 A; 46 W in and out.', 'Sekundär 23 V; Primärstrom 0,2 A; 46 W hinein und heraus.') },
    point: T('匝比关系适于相应交流模型，直流不能维持理想变压传能。', 'The turns ratio holds for the AC model; direct current is not transformed.', 'Das Windungsverhältnis gilt im Wechselstrommodell; Gleichstrom wird nicht transformiert.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B13', 'rust:src/labs/transient.rs transformer_ratio_and_dc'],
    links: {}, review: R2
  },
  {
    id: 'B14', title: T('电动机与发电机耦合', 'Motor and generator coupling', 'Kopplung von Motor und Generator'),
    stages: ['u'], priority: 'P2', geometry: 'lumped',
    assumptions: [T('直流电机：V = RI + ke·ω，τ = kt·I（SI 中 ke = kt）', 'DC machine: V = RI + ke·ω, τ = kt·I (ke = kt in SI)', 'Gleichstrommaschine: V = RI + ke·ω, τ = kt·I (ke = kt in SI)')],
    validity: T('线性电机模型；V > ke·ω 为电动，反之为发电', 'Linear machine model; motoring for V > ke·ω, generating otherwise', 'Lineares Maschinenmodell; Motor für V > ke·ω, sonst Generator'),
    sources: ['S31', 'S51', 'S82'],
    inputs: [inp('V', 'V', T('端电压', 'Terminal voltage', 'Klemmenspannung'), 'V', 'voltage', 12), pos('R', 'R', T('电枢电阻', 'Armature resistance', 'Ankerwiderstand'), 'Ω', 'resistance', 1), pos('k', 'k', T('电机常数 ke = kt', 'Machine constant ke = kt', 'Maschinenkonstante ke = kt'), 'V·s', 'machineConstant', 0.1), inp('w', '\\omega', T('角速度', 'Angular velocity', 'Winkelgeschwindigkeit'), 'rad/s', 'angularVelocity', 50)],
    conditions: [cond('motoring', T('电动状态（V > ke·ω）', 'Motoring (V > ke·ω)', 'Motorbetrieb (V > ke·ω)'), 'V > k*w')],
    outputs: [out('E', '\\mathcal{E}', T('反电动势', 'Back emf', 'Gegenspannung'), 'V', 'k*w'), out('I', 'I', T('电枢电流', 'Armature current', 'Ankerstrom'), 'A', '(V - k*w)/R'), out('tau', '\\tau', T('电磁力矩', 'Electromagnetic torque', 'Elektromagnetisches Drehmoment'), 'N·m', 'k*(V - k*w)/R'), out('Pm', 'P_m', T('机械功率', 'Mechanical power', 'Mechanische Leistung'), 'W', 'k*w*(V - k*w)/R'), out('Pcu', 'P_{Cu}', T('铜耗', 'Copper loss', 'Kupferverlust'), 'W', '(V - k*w)^2/R'), out('Pin', 'P_{in}', T('电输入功率', 'Electrical input power', 'Elektrische Eingangsleistung'), 'W', 'V*(V - k*w)/R')],
    example: { text: T('V = 12 V，R = 1 Ω，ke = kt = 0.1 SI，瞬时 ω = 50 rad/s。', 'V = 12 V, R = 1 Ω, ke = kt = 0.1 in SI, ω = 50 rad/s at this moment.', 'V = 12 V, R = 1 Ω, ke = kt = 0,1 in SI, momentan ω = 50 rad/s.'), answer: T('反电动势 5 V，I = 7 A，电磁力矩 0.7 N·m；机械功率 35 W、铜耗 49 W。', 'Back emf 5 V, I = 7 A, torque 0.7 N·m; mechanical power 35 W, copper loss 49 W.', 'Gegenspannung 5 V, I = 7 A, Drehmoment 0,7 N·m; mechanische Leistung 35 W, Kupferverlust 49 W.') },
    point: T('一致 SI 中互易常数数值相等；电与机械共享功率端口。', 'In consistent SI the two constants are equal; electrical and mechanical sides share a power port.', 'In konsistenten SI-Einheiten sind beide Konstanten gleich; Elektrik und Mechanik teilen einen Leistungsanschluss.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B14', 'rust:src/labs/transient.rs motor_reaches_its_speed'],
    links: {}, review: R2
  },
  {
    id: 'B15', title: T('位移电流与电荷连续', 'Displacement current and continuity', 'Verschiebungsstrom und Kontinuität'),
    stages: ['u'], priority: 'P2', geometry: 'section2d',
    assumptions: [A.vacuum, T('平行板间均匀电场', 'Uniform field between parallel plates', 'Homogenes Feld zwischen parallelen Platten')],
    validity: T('忽略边缘场', 'Edge field neglected', 'Randfeld vernachlässigt'),
    sources: ['S34', 'S03'],
    inputs: [pos('A', 'A', T('板面积', 'Plate area', 'Plattenfläche'), 'm²', 'area', 0.01), inp('dE', '\\dot E', T('电场增长率', 'Rate of change of the field', 'Feldänderung'), 'V/(m·s)', 'fieldRate', 1e6)],
    outputs: [out('Id', 'I_d', T('位移电流', 'Displacement current', 'Verschiebungsstrom'), 'A', 'eps0*A*dE'), out('dQ', '\\dot Q', T('极板电荷变化率（导线电流）', 'Rate of change of the plate charge (wire current)', 'Ladungsänderung der Platte (Leiterstrom)'), 'A', 'eps0*A*dE')],
    example: { text: T('真空平行板面积 0.01 m²，均匀电场增长率 10⁶ V/(m·s)。', 'Parallel plates of 0.01 m² in vacuum, the uniform field grows at 10⁶ V/(m·s).', 'Platten mit 0,01 m² im Vakuum, das homogene Feld wächst mit 10⁶ V/(m·s).'), answer: T('位移电流约 8.85419×10⁻⁸ A，应与充电导线电流相等。', 'Displacement current about 8.85419×10⁻⁸ A, equal to the charging current in the wire.', 'Verschiebungsstrom etwa 8,85419×10⁻⁸ A, gleich dem Ladestrom im Leiter.') },
    point: T('传导电流与位移电流共同保证连续性。', 'Conduction and displacement currents together keep continuity.', 'Leitungs- und Verschiebungsstrom zusammen sichern die Kontinuität.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B15'],
    links: {}, review: R2
  },
  {
    id: 'B16', title: T('电磁平面波与能流', 'Plane electromagnetic wave and energy flux', 'Ebene elektromagnetische Welle und Energiefluss'),
    stages: ['u'], priority: 'P2', geometry: 'space3d',
    assumptions: [A.vacuum, T('正弦平面波，E ⊥ B ⊥ 传播方向', 'Sinusoidal plane wave, E ⊥ B ⊥ direction of travel', 'Sinusförmige ebene Welle, E ⊥ B ⊥ Ausbreitungsrichtung')],
    validity: T('幅值与有效值区分', 'Amplitude and RMS value are distinguished', 'Amplitude und Effektivwert werden unterschieden'),
    sources: ['S34', 'S03'],
    inputs: [pos('E0', 'E_0', T('电场振幅', 'Field amplitude', 'Feldamplitude'), 'V/m', 'electricField', 100)],
    outputs: [out('B0', 'B_0', T('磁场振幅', 'Magnetic amplitude', 'Magnetische Amplitude'), 'T', 'E0/c_light'), out('S', '\\langle S\\rangle', T('平均能流密度', 'Mean energy flux', 'Mittlerer Energiefluss'), 'W/m²', 'eps0*c_light*E0^2/2'), out('Erms', 'E_{rms}', T('电场有效值', 'RMS field', 'Effektivwert des Feldes'), 'V/m', 'E0/sqrt(2)')],
    example: { text: T('真空正弦平面波电场振幅 E0 = 100 V/m。', 'A sinusoidal plane wave in vacuum with E0 = 100 V/m.', 'Eine sinusförmige ebene Welle im Vakuum mit E0 = 100 V/m.'), answer: T('磁场振幅约 3.33564×10⁻⁷ T；平均能流密度约 13.2721 W/m²。', 'Magnetic amplitude about 3.33564×10⁻⁷ T; mean flux about 13.2721 W/m².', 'Magnetische Amplitude etwa 3,33564×10⁻⁷ T; mittlerer Fluss etwa 13,2721 W/m².') },
    point: T('电磁场相互耦合；E、B、传播方向互相垂直。', 'E and B are coupled; E, B and the direction of travel are perpendicular.', 'E und B sind gekoppelt; E, B und Ausbreitungsrichtung stehen senkrecht.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B16'],
    links: {}, review: R2
  },
  {
    id: 'B17', title: T('电磁界面与菲涅耳系数', 'Interfaces and Fresnel coefficients', 'Grenzflächen und Fresnel-Koeffizienten'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('无吸收、非磁性介质；平面界面', 'Non-absorbing, non-magnetic media; plane interface', 'Nicht absorbierende, nichtmagnetische Medien; ebene Grenzfläche')],
    validity: T('无全反射时（否则 T = 0，R = 1）', 'Without total internal reflection (otherwise T = 0, R = 1)', 'Ohne Totalreflexion (sonst T = 0, R = 1)'),
    sources: ['S35', 'S34'],
    inputs: [pos('n1', 'n_1', T('入射侧折射率', 'Index on the incident side', 'Brechzahl auf der Einfallsseite'), '', 'ratio', 1), pos('n2', 'n_2', T('透射侧折射率', 'Index on the far side', 'Brechzahl auf der anderen Seite'), '', 'ratio', 1.5), angle('ti', '\\theta_i', T('入射角', 'Angle of incidence', 'Einfallswinkel'), 0, { min: 0, max: Math.PI / 2 })],
    lets: [let_('st', '\\sin\\theta_t', T('折射角正弦', 'Sine of the refraction angle', 'Sinus des Brechungswinkels'), '', 'n1*sin(ti)/n2')],
    conditions: [cond('transmits', T('无全反射', 'No total internal reflection', 'Keine Totalreflexion'), 'st <= 1')],
    outputs: [
      out('rs', 'r_s', T('s 偏振振幅反射系数', 'Amplitude reflection, s polarization', 'Amplitudenreflexion, s-Polarisation'), '', '(n1*cos(ti) - n2*sqrt(1 - st^2))/(n1*cos(ti) + n2*sqrt(1 - st^2))', { requires: ['transmits'] }),
      out('Rs', 'R_s', T('s 偏振功率反射率', 'Power reflectance, s', 'Reflexionsgrad, s'), '', '((n1*cos(ti) - n2*sqrt(1 - st^2))/(n1*cos(ti) + n2*sqrt(1 - st^2)))^2', { requires: ['transmits'] }),
      out('Rp', 'R_p', T('p 偏振功率反射率', 'Power reflectance, p', 'Reflexionsgrad, p'), '', '((n2*cos(ti) - n1*sqrt(1 - st^2))/(n2*cos(ti) + n1*sqrt(1 - st^2)))^2', { requires: ['transmits'] }),
      out('Ts', 'T_s', T('s 偏振功率透射率', 'Power transmittance, s', 'Transmissionsgrad, s'), '', '1 - ((n1*cos(ti) - n2*sqrt(1 - st^2))/(n1*cos(ti) + n2*sqrt(1 - st^2)))^2', { requires: ['transmits'] })
    ],
    example: { text: T('无吸收非磁性介质正入射，n1 = 1，n2 = 1.5。', 'Normal incidence between non-absorbing non-magnetic media, n1 = 1, n2 = 1.5.', 'Senkrechter Einfall zwischen nicht absorbierenden, nichtmagnetischen Medien, n1 = 1, n2 = 1,5.'), answer: T('功率反射率 0.04；透射率 0.96；电场振幅反射系数 −0.2。', 'Reflectance 0.04; transmittance 0.96; amplitude reflection −0.2.', 'Reflexionsgrad 0,04; Transmissionsgrad 0,96; Amplitudenreflexion −0,2.') },
    point: T('场振幅平方还需阻抗因子才能成为功率透射率。', 'The square of the field amplitude needs the impedance factor to become the power transmittance.', 'Das Quadrat der Feldamplitude braucht den Impedanzfaktor, um zum Transmissionsgrad zu werden.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B17'],
    links: { labs: ['wave-optics'] }, review: R2
  },
  {
    id: 'B18', title: T('FDTD 腔模与电磁传播', 'FDTD cavity modes and propagation', 'FDTD-Resonatormoden und Ausbreitung'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'section2d',
    assumptions: [A.vacuum, T('二维 Yee 网格，等间距', 'Two-dimensional Yee grid, uniform spacing', 'Zweidimensionales Yee-Gitter, gleichmäßige Abstände')],
    validity: T('受限解析：只给 CFL 稳定上限与一维 PEC 腔基频；不是 FDTD 求解器', 'Restricted analytic: only the CFL limit and the fundamental of a 1D PEC cavity; not an FDTD solver', 'Eingeschränkt analytisch: nur die CFL-Grenze und die Grundfrequenz eines 1D-PEC-Resonators; kein FDTD-Löser'),
    restricted: T('CFL 上限与腔基频；FDTD 求解、PML 与收敛研究暂缓', 'CFL limit and cavity fundamental; FDTD solving, PML and convergence studies deferred', 'CFL-Grenze und Resonatorgrundfrequenz; FDTD-Lösung, PML und Konvergenzstudien zurückgestellt'),
    sources: ['S52', 'S53', 'S58'],
    inputs: [pos('dx', '\\Delta x', T('网格间距 x', 'Grid spacing x', 'Gitterabstand x'), 'm', 'length', 1e-3), pos('dy', '\\Delta y', T('网格间距 y', 'Grid spacing y', 'Gitterabstand y'), 'm', 'length', 1e-3), pos('dt', '\\Delta t', T('选用的时间步', 'Chosen time step', 'Gewählter Zeitschritt'), 's', 'time', 2e-12), pos('Lc', 'L_c', T('一维腔长', 'Length of a 1D cavity', 'Länge eines 1D-Resonators'), 'm', 'length', 1)],
    lets: [let_('dtmax', '\\Delta t_{\\max}', T('CFL 上限', 'CFL limit', 'CFL-Grenze'), 's', '1/(c_light*sqrt(1/dx^2 + 1/dy^2))')],
    conditions: [cond('stable', T('满足 CFL（Δt ≤ Δt_max）', 'CFL satisfied (Δt ≤ Δt_max)', 'CFL erfüllt (Δt ≤ Δt_max)'), 'dt <= dtmax')],
    outputs: [out('dtmax', '\\Delta t_{\\max}', T('CFL 时间步上限', 'CFL time-step limit', 'CFL-Zeitschrittgrenze'), 's', 'dtmax'), out('S', 'S', T('Courant 数', 'Courant number', 'Courant-Zahl'), '', 'dt/dtmax'), out('f1', 'f_1', T('一维 PEC 腔基频', 'Fundamental of a 1D PEC cavity', 'Grundfrequenz eines 1D-PEC-Resonators'), 'Hz', 'c_light/(2*Lc)')],
    example: { text: T('真空二维等间距网格 Δx = Δy = 1 mm，给出 Yee 格点时间步上限。', 'A 2D vacuum grid with Δx = Δy = 1 mm: the time-step limit of the Yee scheme.', 'Ein 2D-Vakuumgitter mit Δx = Δy = 1 mm: die Zeitschrittgrenze des Yee-Verfahrens.'), answer: T('上限约 2.35865 ps；实际可取 2 ps，并通过空间和时间细化验证。', 'Limit about 2.35865 ps; 2 ps is usable, to be checked by refining space and time.', 'Grenze etwa 2,35865 ps; 2 ps sind nutzbar, mit Orts- und Zeitverfeinerung zu prüfen.') },
    point: T('CFL 稳定不等于结果已收敛；PML 也有数值反射。', 'CFL stability is not convergence; a PML also reflects numerically.', 'CFL-Stabilität ist keine Konvergenz; auch eine PML reflektiert numerisch.'),
    status: 'verified', level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:B18'],
    links: {}, review: R2
  },
  {
    id: 'B19', title: T('磁性材料与磁滞', 'Magnetic materials and hysteresis', 'Magnetische Werkstoffe und Hysterese'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'abstract',
    assumptions: [T('给定的矩形教学 B–H 回线', 'A given rectangular teaching B–H loop', 'Eine gegebene rechteckige Unterrichts-B-H-Schleife')],
    validity: T('受限：只是给定回线的面积与损耗，不是材料模型', 'Restricted: the area and loss of a given loop, not a material model', 'Eingeschränkt: Fläche und Verlust einer gegebenen Schleife, kein Werkstoffmodell'),
    restricted: T('回线面积与损耗；磁滞材料模型（Preisach、Jiles–Atherton）暂缓', 'Loop area and loss; hysteresis material models (Preisach, Jiles–Atherton) deferred', 'Schleifenfläche und Verlust; Hysteresemodelle (Preisach, Jiles–Atherton) zurückgestellt'),
    sources: ['S40', 'S45', 'S54'],
    inputs: [pos('Hc', 'H_c', T('回线半宽（矫顽场）', 'Half-width of the loop (coercive field)', 'Halbe Schleifenbreite (Koerzitivfeld)'), 'A/m', 'magnetizingField', 100), pos('Br', 'B_r', T('回线半高', 'Half-height of the loop', 'Halbe Schleifenhöhe'), 'T', 'magneticField', 0.5), pos('f', 'f', L.f, 'Hz', 'frequency', 50)],
    outputs: [out('w', 'w', T('每周期每单位体积损耗（回线面积）', 'Loss per cycle and volume (loop area)', 'Verlust pro Zyklus und Volumen (Schleifenfläche)'), 'J/m³', '4*Hc*Br'), out('p', 'p', T('单位体积损耗功率', 'Loss power per volume', 'Verlustleistung pro Volumen'), 'W/m³', '4*Hc*Br*f')],
    example: { text: T('给定矩形 B–H 回线，H 半宽 100 A/m、B 半高 0.5 T，f = 50 Hz。', 'A rectangular B–H loop, half-width 100 A/m, half-height 0.5 T, f = 50 Hz.', 'Rechteckige B-H-Schleife, halbe Breite 100 A/m, halbe Höhe 0,5 T, f = 50 Hz.'), answer: T('回线面积 200 J/m³，每秒损耗 10000 W/m³；只是给定教学回线。', 'Loop area 200 J/m³, loss 10000 W/m³; only for this given teaching loop.', 'Schleifenfläche 200 J/m³, Verlust 10000 W/m³; nur für diese gegebene Unterrichtsschleife.') },
    point: T('磁化依历史；常数 μr 无法表达磁滞。', 'Magnetization depends on history; a constant μr cannot express hysteresis.', 'Die Magnetisierung hängt von der Vorgeschichte ab; ein konstantes μr kann keine Hysterese darstellen.'),
    status: 'verified', level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:B19'],
    links: {}, review: R2
  },
  {
    id: 'B20', title: T('传输线与反射', 'Transmission line and reflection', 'Leitung und Reflexion'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('无损传输线，单位长度参数 L′、C′', 'Lossless line with L′ and C′ per metre', 'Verlustfreie Leitung mit L′ und C′ pro Meter')],
    validity: T('高频或长线时导线成为分布参数系统', 'At high frequency or for long lines a wire is a distributed system', 'Bei hoher Frequenz oder langer Leitung ist ein Draht ein verteiltes System'),
    sources: ['S34', 'S51', 'S52'],
    inputs: [pos('Lp', "L'", T('单位长度电感', 'Inductance per metre', 'Induktivitätsbelag'), 'H/m', 'inductancePerLength', 250e-9), pos('Cp', "C'", T('单位长度电容', 'Capacitance per metre', 'Kapazitätsbelag'), 'F/m', 'permittivity', 100e-12), nonneg('ZL', 'Z_L', T('终端负载（纯电阻）', 'Load (resistive)', 'Abschluss (ohmsch)'), 'Ω', 'resistance', 100)],
    outputs: [out('Z0', 'Z_0', T('特性阻抗', 'Characteristic impedance', 'Wellenwiderstand'), 'Ω', 'sqrt(Lp/Cp)'), out('v', 'v', T('传播速度', 'Propagation speed', 'Ausbreitungsgeschwindigkeit'), 'm/s', '1/sqrt(Lp*Cp)'), out('G', '\\Gamma', T('电压反射系数', 'Voltage reflection coefficient', 'Spannungsreflexionsfaktor'), '', '(ZL - sqrt(Lp/Cp))/(ZL + sqrt(Lp/Cp))')],
    example: { text: T('无损线 L′ = 250 nH/m，C′ = 100 pF/m，终端 ZL = 100 Ω。', 'A lossless line, L′ = 250 nH/m, C′ = 100 pF/m, terminated by 100 Ω.', 'Verlustfreie Leitung, L′ = 250 nH/m, C′ = 100 pF/m, Abschluss 100 Ω.'), answer: T('Z0 = 50 Ω，传播速度 2×10⁸ m/s，电压反射系数 1/3。', 'Z0 = 50 Ω, speed 2×10⁸ m/s, reflection coefficient 1/3.', 'Z0 = 50 Ω, Geschwindigkeit 2×10⁸ m/s, Reflexionsfaktor 1/3.') },
    point: T('导线在高频或长距离时成为分布参数系统。', 'At high frequency or over long distances a wire is a distributed system.', 'Bei hoher Frequenz oder großer Länge ist ein Draht ein verteiltes System.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:B20'],
    links: {}, review: R2
  }
]
