/**
 * E01–E20: electrostatics and circuits (blueprint §5.6; doc 02 §6). The circuit lab (labs/circuit.rs, transient.rs)
 * is the numerical backend; these restricted analytic models are its independent references.
 */
import type { ModelSpec } from './types'
import { A, L, T, cond, inp, let_, nonneg, out, pos, roots } from './dsl'

const R2 = { physics: '2026-10-28', language: '2026-10-28' }
const q = (id: string, symbol: string, label: ReturnType<typeof T>, value: number) => inp(id, symbol, label, 'C', 'charge', value)

export const MODELS_E: ModelSpec[] = [
  {
    id: 'E01', title: T('库仑力与叠加', 'Coulomb force and superposition', 'Coulomb-Kraft und Überlagerung'),
    stages: ['s'], priority: 'P1', geometry: 'plane3d',
    assumptions: [A.vacuum, T('点电荷（球对称小球的外部）；k_e 取所选常数集', 'Point charges (outside small spherical charges); k_e from the chosen constant set', 'Punktladungen (außerhalb kleiner geladener Kugeln); k_e aus dem gewählten Konstantensatz')],
    validity: T('间距远大于带电体尺寸；两球相交时点电荷式不适用', 'Distance much larger than the bodies; for overlapping spheres the point-charge formula does not apply', 'Abstand viel größer als die Körper; bei sich überlappenden Kugeln gilt die Punktladungsformel nicht'),
    sources: ['S24', 'S03'],
    inputs: [q('q1', 'q_1', T('电荷 1', 'Charge 1', 'Ladung 1'), 1e-6), q('q2', 'q_2', T('电荷 2', 'Charge 2', 'Ladung 2'), 2e-6), pos('r', 'r', T('间距', 'Distance', 'Abstand'), 'm', 'length', 0.1), nonneg('a', 'a', T('带电小球半径', 'Radius of the charged balls', 'Radius der geladenen Kugeln'), 'm', 'length', 0.005)],
    conditions: [cond('point', T('点电荷近似（r ≥ 10a）', 'Point-charge approximation (r ≥ 10a)', 'Punktladungsnäherung (r ≥ 10a)'), 'r >= 10*a', 'r > 2*a'), cond('repel', T('同号相斥', 'Like charges repel', 'Gleichnamige Ladungen stoßen sich ab'), 'q1*q2 > 0')],
    outputs: [
      out('F', 'F', T('库仑力大小', 'Size of the Coulomb force', 'Betrag der Coulomb-Kraft'), 'N', 'k_e*abs(q1*q2)/r^2', { requires: ['point'] }),
      out('Fs', 'F_r', T('沿连线的分量（正为斥力）', 'Component along the line (repulsion positive)', 'Komponente längs der Verbindung (Abstoßung positiv)'), 'N', 'k_e*q1*q2/r^2', { requires: ['point'] })
    ],
    example: { text: T('q1 = 1 μC、q2 = 2 μC，间距 0.1 m，使用 CODATA 的 ke。', 'q1 = 1 μC, q2 = 2 μC, 0.1 m apart, with the CODATA k_e.', 'q1 = 1 μC, q2 = 2 μC im Abstand 0,1 m, mit k_e nach CODATA.'), answer: T('力大小 1.79751 N；同号相斥、异号相吸。', 'Force 1.79751 N; like charges repel, unlike attract.', 'Kraft 1,79751 N; gleichnamige stoßen sich ab, ungleichnamige ziehen sich an.') },
    point: T('点电荷奇点与有限尺寸软化必须区分。', 'The point-charge singularity and finite-size softening are different things.', 'Singularität der Punktladung und Glättung endlicher Größe sind verschieden.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:E01', 'rust:src/labs/field.rs single_charge_field_is_coulomb', 'rust:tests/electric.rs coulomb_scattering_conserves_energy'],
    links: { situations: ['coulomb'], topics: ['electric'] }, review: R2
  },
  {
    id: 'E02', title: T('电场线与合场', 'Field lines and superposed fields', 'Feldlinien und überlagerte Felder'),
    stages: ['s'], priority: 'P1', geometry: 'plane3d',
    assumptions: [A.vacuum, T('两个点电荷位于 x = ±d；在 (x, y) 处求场强与电势（电势零点在无穷远）', 'Two point charges at x = ±d; field and potential at (x, y) (zero potential at infinity)', 'Zwei Punktladungen bei x = ±d; Feld und Potential bei (x, y) (Potential null im Unendlichen)')],
    validity: T('场点不与电荷重合', 'The field point is not at a charge', 'Der Feldpunkt liegt nicht auf einer Ladung'),
    sources: ['S24', 'S26'],
    inputs: [q('q1', 'q_1', T('x = −d 处的电荷', 'Charge at x = −d', 'Ladung bei x = −d'), 1e-6), q('q2', 'q_2', T('x = +d 处的电荷', 'Charge at x = +d', 'Ladung bei x = +d'), 1e-6), pos('d', 'd', T('半间距', 'Half the separation', 'Halber Abstand'), 'm', 'length', 0.1), inp('x', 'x', T('场点 x', 'Field point x', 'Feldpunkt x'), 'm', 'length', 0), inp('y', 'y', T('场点 y', 'Field point y', 'Feldpunkt y'), 'm', 'length', 0)],
    lets: [let_('r1', 'r_1', T('到电荷 1 的距离', 'Distance to charge 1', 'Abstand zu Ladung 1'), 'm', 'sqrt((x + d)^2 + y^2)'), let_('r2', 'r_2', T('到电荷 2 的距离', 'Distance to charge 2', 'Abstand zu Ladung 2'), 'm', 'sqrt((x - d)^2 + y^2)')],
    conditions: [cond('away', T('场点不在电荷上', 'The point is not at a charge', 'Der Punkt liegt nicht auf einer Ladung'), 'r1 > 0 && r2 > 0')],
    outputs: [
      out('Ex', 'E_x', T('场强 x 分量', 'Field, x component', 'Feldstärke, x-Komponente'), 'V/m', 'k_e*(q1*(x + d)/r1^3 + q2*(x - d)/r2^3)', { requires: ['away'] }),
      out('Ey', 'E_y', T('场强 y 分量', 'Field, y component', 'Feldstärke, y-Komponente'), 'V/m', 'k_e*(q1*y/r1^3 + q2*y/r2^3)', { requires: ['away'] }),
      out('V', 'V', T('电势', 'Potential', 'Potential'), 'V', 'k_e*(q1/r1 + q2/r2)', { requires: ['away'] })
    ],
    example: { text: T('相同的 +1 μC 电荷分别在 x = ±0.1 m，求中点场。', 'Equal +1 μC charges at x = ±0.1 m: the field at the midpoint.', 'Gleiche Ladungen +1 μC bei x = ±0,1 m: Feld in der Mitte.'), answer: T('合场为 0；电势却约为 179751 V。', 'The field is 0, but the potential is about 179751 V.', 'Das Feld ist 0, das Potential aber etwa 179751 V.') },
    point: T('场线不是轨迹；零场不等于零电势。', 'Field lines are not paths; zero field does not mean zero potential.', 'Feldlinien sind keine Bahnen; Feld null heißt nicht Potential null.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:E02', 'rust:src/labs/field.rs dipole_lines_go_from_plus_to_minus', 'test:labs2656 fieldAt vs E02'],
    links: { topics: ['electric'] }, review: R2
  },
  {
    id: 'E03', title: T('高斯定律与对称性', 'Gauss’s law and symmetry', 'Gaußscher Satz und Symmetrie'),
    stages: ['u'], priority: 'P2', geometry: 'space3d',
    assumptions: [A.vacuum, T('闭合曲面；球对称时由通量求场强', 'Closed surface; with spherical symmetry the field follows from the flux', 'Geschlossene Fläche; bei Kugelsymmetrie folgt das Feld aus dem Fluss')],
    validity: T('总通量与面形状无关；局部场强只在对称时能直接求出', 'The total flux does not depend on the surface’s shape; the local field follows directly only with symmetry', 'Der Gesamtfluss hängt nicht von der Form ab; das lokale Feld folgt nur bei Symmetrie direkt'),
    sources: ['S25', 'S03'],
    inputs: [q('Q', 'Q_{enc}', T('包围的电荷', 'Enclosed charge', 'Eingeschlossene Ladung'), 1e-9), pos('r', 'r', T('球面半径', 'Radius of the sphere', 'Kugelradius'), 'm', 'length', 0.2)],
    outputs: [
      out('Phi', '\\Phi_E', T('电通量', 'Electric flux', 'Elektrischer Fluss'), 'V·m', 'Q/eps0'),
      out('E', 'E', T('球面上的场强（球对称）', 'Field on the sphere (spherical symmetry)', 'Feld auf der Kugel (Kugelsymmetrie)'), 'V/m', 'Q/(4*pi*eps0*r^2)')
    ],
    example: { text: T('闭合面包围 1 nC 电荷，使用 CODATA ε0。', 'A closed surface encloses 1 nC, with the CODATA ε0.', 'Eine geschlossene Fläche umschließt 1 nC, mit ε0 nach CODATA.'), answer: T('总电通量约 112.941 V·m，与面的具体形状无关。', 'The total flux is about 112.941 V·m, whatever the shape.', 'Der Gesamtfluss ist etwa 112,941 V·m, unabhängig von der Form.') },
    point: T('高斯定律普遍成立，直接求局部场还需要对称性。', 'Gauss’s law always holds; finding the local field directly needs symmetry.', 'Der Gaußsche Satz gilt immer; das lokale Feld direkt zu bestimmen braucht Symmetrie.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:E03'],
    links: {}, review: R2, gap: T('通量的数值积分与非对称形状演示未做', 'Numerical flux integration and non-symmetric shapes are not shown', 'Numerische Flussintegration und unsymmetrische Formen fehlen')
  },
  {
    id: 'E04', title: T('电势 电势能与功', 'Potential, potential energy and work', 'Potential, potentielle Energie und Arbeit'),
    stages: ['s'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('静电场（保守场）', 'Electrostatic (conservative) field', 'Elektrostatisches (konservatives) Feld')],
    validity: T('时变非保守场不能只用静电势表示', 'A time-varying non-conservative field cannot be described by a potential alone', 'Ein zeitveränderliches, nichtkonservatives Feld lässt sich nicht nur durch ein Potential beschreiben'),
    sources: ['S26'],
    inputs: [q('q', 'q', L.q, 2e-6), inp('V1', 'V_1', T('起点电势', 'Potential at the start', 'Potential am Anfang'), 'V', 'voltage', 100), inp('V2', 'V_2', T('终点电势', 'Potential at the end', 'Potential am Ende'), 'V', 'voltage', 20)],
    outputs: [out('dU', '\\Delta U', T('电势能的变化', 'Change of potential energy', 'Änderung der potentiellen Energie'), 'J', 'q*(V2 - V1)'), out('W', 'W_E', T('电场力做的功', 'Work of the electric force', 'Arbeit der elektrischen Kraft'), 'J', 'q*(V1 - V2)')],
    example: { text: T('2 μC 正电荷从 100 V 移到 20 V。', 'A +2 μC charge moves from 100 V to 20 V.', 'Eine Ladung +2 μC bewegt sich von 100 V nach 20 V.'), answer: T('ΔU = −1.6×10⁻⁴ J；电场做功 1.6×10⁻⁴ J。', 'ΔU = −1.6×10⁻⁴ J; the field does 1.6×10⁻⁴ J of work.', 'ΔU = −1,6×10⁻⁴ J; das Feld verrichtet 1,6×10⁻⁴ J Arbeit.') },
    point: T('电势零点任意，电势差有物理意义。', 'The zero of potential is arbitrary; potential differences have meaning.', 'Der Nullpunkt des Potentials ist beliebig; Potentialdifferenzen haben Bedeutung.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic'], benchmarks: ['oracle:E04', 'rust:tests/electric.rs deflection_in_uniform_electric_field'],
    links: { situations: ['charge-e', 'zone-e'], topics: ['electric'] }, review: R2
  },
  {
    id: 'E05', title: T('导体平衡与屏蔽', 'Conductors in equilibrium and shielding', 'Leiter im Gleichgewicht und Abschirmung'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'space3d',
    assumptions: [A.vacuum, T('孤立导体球，静电平衡', 'Isolated conducting sphere in equilibrium', 'Isolierte leitende Kugel im Gleichgewicht')],
    validity: T('球形解析式不能代替任意形状导体的边值问题', 'The sphere’s closed form does not replace the boundary-value problem of other shapes', 'Die Formel der Kugel ersetzt nicht das Randwertproblem anderer Formen'),
    sources: ['S25', 'S26'],
    inputs: [q('Q', 'Q', L.q, 1e-9), pos('R', 'R', T('球半径', 'Radius of the sphere', 'Kugelradius'), 'm', 'length', 0.1), nonneg('r', 'r', T('到球心的距离', 'Distance from the centre', 'Abstand vom Mittelpunkt'), 'm', 'length', 0.05)],
    conditions: [cond('inside', T('在导体内部', 'Inside the conductor', 'Im Inneren des Leiters'), 'r < R'), cond('outside', T('在导体外部', 'Outside the conductor', 'Außerhalb des Leiters'), 'r >= R')],
    outputs: [
      out('Vs', 'V_S', T('表面电势', 'Potential of the surface', 'Potential der Oberfläche'), 'V', 'k_e*Q/R'),
      out('E', 'E', T('场强', 'Field', 'Feldstärke'), 'V/m', '0*k_e*Q/R^2', { when: 'inside', branch: T('内部：场强为零', 'Inside: no field', 'Innen: kein Feld') }),
      out('E', 'E', T('场强', 'Field', 'Feldstärke'), 'V/m', 'k_e*Q/r^2', { when: 'outside', branch: T('外部：如点电荷', 'Outside: like a point charge', 'Außen: wie eine Punktladung') }),
      out('V', 'V', T('电势', 'Potential', 'Potential'), 'V', 'k_e*Q/R', { when: 'inside', branch: T('内部：等于表面电势', 'Inside: equal to the surface', 'Innen: gleich der Oberfläche') }),
      out('V', 'V', T('电势', 'Potential', 'Potential'), 'V', 'k_e*Q/r', { when: 'outside' })
    ],
    example: { text: T('孤立导体球半径 0.1 m，带电 1 nC，真空静电平衡。', 'An isolated conducting sphere of radius 0.1 m with 1 nC, in vacuum and in equilibrium.', 'Isolierte leitende Kugel, Radius 0,1 m, 1 nC, im Vakuum im Gleichgewicht.'), answer: T('表面电势约 89.8755 V；内部电场为 0，电势等于表面。', 'Surface potential about 89.8755 V; no field inside, the potential there equals the surface’s.', 'Oberflächenpotential etwa 89,8755 V; innen kein Feld, das Potential gleich dem der Oberfläche.') },
    point: T('内部零场不等于零电势；自由电荷在边界重排。', 'Zero field inside is not zero potential; free charges rearrange on the surface.', 'Feld null innen heißt nicht Potential null; freie Ladungen ordnen sich an der Oberfläche um.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:E05'],
    links: {}, review: R2, gap: T('任意形状导体的边值求解属于 X01（受限）', 'Conductors of any shape need the boundary-value solver of X01 (restricted)', 'Leiter beliebiger Form brauchen den Randwertlöser von X01 (eingeschränkt)')
  },
  {
    id: 'E06', title: T('电容器与储能', 'Capacitor and stored energy', 'Kondensator und gespeicherte Energie'),
    stages: ['s'], priority: 'P1', geometry: 'section2d',
    assumptions: [T('平行板，忽略边缘场', 'Parallel plates, edge field neglected', 'Parallele Platten, Randfeld vernachlässigt'), A.linear],
    validity: T('板间距远小于板的尺寸', 'Gap much smaller than the plates', 'Plattenabstand viel kleiner als die Platten'),
    sources: ['S27', 'S03'],
    inputs: [pos('A', 'S', T('极板面积', 'Plate area', 'Plattenfläche'), 'm²', 'area', 0.01), pos('d', 'd', T('板间距', 'Gap', 'Plattenabstand'), 'm', 'length', 1e-3), pos('er', '\\varepsilon_r', T('相对介电常数', 'Relative permittivity', 'Relative Permittivität'), '', 'ratio', 1), inp('U', 'U', L.U, 'V', 'voltage', 100)],
    lets: [let_('C', 'C', L.C, 'F', 'eps0*er*A/d')],
    conditions: [cond('thin', T('板间距远小于板宽（d ≤ √S/20）', 'Gap far below the plate width (d ≤ √S/20)', 'Abstand weit unter der Plattenbreite (d ≤ √S/20)'), 'd <= sqrt(A)/20', 'd <= sqrt(A)/5')],
    outputs: [
      out('C', 'C', L.C, 'F', 'C', { requires: ['thin'] }),
      out('Q', 'Q', L.q, 'C', 'C*U', { requires: ['thin'] }),
      out('W', 'W', T('储存的能量', 'Stored energy', 'Gespeicherte Energie'), 'J', 'C*U^2/2', { requires: ['thin'] }),
      out('E', 'E', T('板间场强', 'Field between the plates', 'Feld zwischen den Platten'), 'V/m', 'U/d'),
      out('Wbat', 'W_{U}', T('板距减半（接电源）后的能量', 'Energy after halving the gap (battery connected)', 'Energie nach Halbierung des Abstands (mit Quelle)'), 'J', '2*C*U^2/2', { requires: ['thin'] }),
      out('Wiso', 'W_{Q}', T('板距减半（断开电源）后的能量', 'Energy after halving the gap (isolated)', 'Energie nach Halbierung des Abstands (getrennt)'), 'J', '(C*U)^2/(2*2*C)', { requires: ['thin'] })
    ],
    example: { text: T('真空平行板 A = 0.01 m²，d = 1 mm，接 100 V。', 'Parallel plates in vacuum, A = 0.01 m², d = 1 mm, at 100 V.', 'Plattenkondensator im Vakuum, A = 0,01 m², d = 1 mm, an 100 V.'), answer: T('C ≈ 88.5419 pF，Q ≈ 8.85419 nC，储能约 4.42709×10⁻⁷ J。', 'C ≈ 88.5419 pF, Q ≈ 8.85419 nC, energy about 4.42709×10⁻⁷ J.', 'C ≈ 88,5419 pF, Q ≈ 8,85419 nC, Energie etwa 4,42709×10⁻⁷ J.') },
    point: T('恒压与断电恒电荷是不同约束。', 'Constant voltage and constant charge are different constraints.', 'Konstante Spannung und konstante Ladung sind verschiedene Bindungen.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:E06', 'test:labs2656 plateCapacitor vs E06'],
    links: { topics: ['electric'] }, review: R2
  },
  {
    id: 'E07', title: T('介质极化与边界', 'Dielectric polarization and boundaries', 'Dielektrische Polarisation und Grenzflächen'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [A.linear, T('均匀场', 'Uniform field', 'Homogenes Feld')],
    validity: T('线性各向同性介质；非线性介质另设模型', 'Linear isotropic dielectrics; non-linear media need another model', 'Lineare isotrope Dielektrika; nichtlineare Medien brauchen ein anderes Modell'),
    sources: ['S27', 'S25', 'S03'],
    inputs: [inp('er', '\\varepsilon_r', T('相对介电常数', 'Relative permittivity', 'Relative Permittivität'), '', 'ratio', 4, { min: 1 }), inp('E', 'E', T('介质内场强', 'Field in the dielectric', 'Feld im Dielektrikum'), 'V/m', 'electricField', 1000)],
    outputs: [out('D', 'D', T('电位移', 'Electric displacement', 'Elektrische Flussdichte'), 'C/m²', 'eps0*er*E'), out('P', 'P', T('极化强度', 'Polarization', 'Polarisation'), 'C/m²', 'eps0*(er - 1)*E'), out('sb', '\\sigma_b', T('与场垂直的界面束缚面电荷', 'Bound surface charge on a face normal to the field', 'Gebundene Flächenladung senkrecht zum Feld'), 'C/m²', 'eps0*(er - 1)*E')],
    example: { text: T('线性各向同性介质 εr = 4，内部 E = 1000 V/m。', 'A linear isotropic dielectric with εr = 4 and E = 1000 V/m inside.', 'Lineares isotropes Dielektrikum mit εr = 4 und innen E = 1000 V/m.'), answer: T('D ≈ 3.54168×10⁻⁸ C/m²；P ≈ 2.65626×10⁻⁸ C/m²。', 'D ≈ 3.54168×10⁻⁸ C/m²; P ≈ 2.65626×10⁻⁸ C/m².', 'D ≈ 3,54168×10⁻⁸ C/m²; P ≈ 2,65626×10⁻⁸ C/m².') },
    point: T('自由电荷与束缚电荷不同；非线性介质另设模型。', 'Free and bound charges differ; non-linear media need another model.', 'Freie und gebundene Ladungen sind verschieden; nichtlineare Medien brauchen ein anderes Modell.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:E07'],
    links: {}, review: R2
  },
  {
    id: 'E08', title: T('欧姆定律与电阻率', 'Ohm’s law and resistivity', 'Ohmsches Gesetz und spezifischer Widerstand'),
    stages: ['j', 's', 'u'], priority: 'P1', geometry: 'line1d',
    assumptions: [T('均匀导线，温度不变', 'Uniform wire at constant temperature', 'Homogener Draht bei konstanter Temperatur')],
    validity: T('欧姆导体；欧姆关系并非所有器件的普遍定律', 'Ohmic conductors; Ohm’s relation is not a law for every device', 'Ohmsche Leiter; das Ohmsche Gesetz gilt nicht für jedes Bauteil'),
    sources: ['S28', 'S51'],
    inputs: [pos('rho', '\\rho_e', T('电阻率', 'Resistivity', 'Spezifischer Widerstand'), 'Ω·m', 'resistivity', 1.7e-8), pos('Lw', 'L', T('导线长度', 'Length of the wire', 'Drahtlänge'), 'm', 'length', 2), pos('Aw', 'A', T('截面积', 'Cross-section', 'Querschnitt'), 'm²', 'area', 1e-6), inp('I', 'I', L.I, 'A', 'current', 3)],
    outputs: [out('R', 'R', L.R, 'Ω', 'rho*Lw/Aw'), out('U', 'U', T('压降', 'Voltage drop', 'Spannungsabfall'), 'V', 'I*rho*Lw/Aw'), out('P', 'P', T('热功率', 'Heating power', 'Wärmeleistung'), 'W', 'I^2*rho*Lw/Aw')],
    example: { text: T('ρe = 1.7×10⁻⁸ Ω·m，长 2 m，截面 10⁻⁶ m²，电流 3 A。', 'ρe = 1.7×10⁻⁸ Ω·m, 2 m long, cross-section 10⁻⁶ m², 3 A.', 'ρe = 1,7×10⁻⁸ Ω·m, 2 m lang, Querschnitt 10⁻⁶ m², 3 A.'), answer: T('R = 0.034 Ω；压降 0.102 V；热功率 0.306 W。', 'R = 0.034 Ω; drop 0.102 V; heating 0.306 W.', 'R = 0,034 Ω; Spannungsabfall 0,102 V; Wärmeleistung 0,306 W.') },
    point: T('欧姆关系并非所有器件的普遍定律。', 'Ohm’s relation is not a universal law of every device.', 'Das Ohmsche Gesetz gilt nicht für jedes Bauteil.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:E08'],
    links: {}, review: R2
  },
  {
    id: 'E09', title: T('串并联电路', 'Series and parallel circuits', 'Reihen- und Parallelschaltung'),
    stages: ['j'], priority: 'P1', geometry: 'lumped',
    assumptions: [A.lumped, A.ideal, T('理想电源，导线无电阻', 'Ideal source, resistanceless wires', 'Ideale Quelle, widerstandslose Leitungen')],
    validity: T('电阻为欧姆电阻且大于 0', 'Ohmic resistors above 0', 'Ohmsche Widerstände größer als 0'),
    sources: ['S28'],
    inputs: [pos('R1', 'R_1', T('电阻 1', 'Resistor 1', 'Widerstand 1'), 'Ω', 'resistance', 6), pos('R2', 'R_2', T('电阻 2', 'Resistor 2', 'Widerstand 2'), 'Ω', 'resistance', 3), inp('U', 'U', T('电源电压', 'Source voltage', 'Quellenspannung'), 'V', 'voltage', 9)],
    outputs: [
      out('Rs', 'R_s', T('串联总电阻', 'Series resistance', 'Gesamtwiderstand in Reihe'), 'Ω', 'R1 + R2'),
      out('Is', 'I_s', T('串联电流', 'Series current', 'Strom in Reihe'), 'A', 'U/(R1 + R2)'),
      out('U1', 'U_1', T('串联时 R1 的电压', 'Voltage across R1 in series', 'Spannung an R1 in Reihe'), 'V', 'U*R1/(R1 + R2)'),
      out('Rp', 'R_p', T('并联总电阻', 'Parallel resistance', 'Gesamtwiderstand parallel'), 'Ω', 'R1*R2/(R1 + R2)'),
      out('Ip', 'I_p', T('并联总电流', 'Total parallel current', 'Gesamtstrom parallel'), 'A', 'U*(R1 + R2)/(R1*R2)'),
      out('I1', 'I_1', T('并联时 R1 的电流', 'Current through R1 in parallel', 'Strom durch R1 parallel'), 'A', 'U/R1'),
      out('I2', 'I_2', T('并联时 R2 的电流', 'Current through R2 in parallel', 'Strom durch R2 parallel'), 'A', 'U/R2')
    ],
    example: { text: T('6 Ω 与 3 Ω 分别串联和并联在 9 V 理想源上。', '6 Ω and 3 Ω in series and in parallel on an ideal 9 V source.', '6 Ω und 3 Ω in Reihe und parallel an einer idealen 9-V-Quelle.'), answer: T('串联 9 Ω、总电流 1 A；并联 2 Ω、总电流 4.5 A，两支路 1.5 A 与 3 A。', 'Series 9 Ω, 1 A; parallel 2 Ω, 4.5 A, with 1.5 A and 3 A in the branches.', 'Reihe 9 Ω, 1 A; parallel 2 Ω, 4,5 A, in den Zweigen 1,5 A und 3 A.') },
    point: T('节点连接决定电路，不由图上远近决定。', 'The node connections define the circuit, not distances in the drawing.', 'Die Knotenverbindungen bestimmen die Schaltung, nicht die Abstände in der Zeichnung.'),
    status: 'verified', level: 3, teaching: 2, references: ['analytic', 'otherMethod'],
    benchmarks: ['oracle:E09', 'test:loop2 circuitSolve vs E09 with independent KCL residual', 'test:circuitPresets wires connect only at their ends'],
    links: { activities: ['act-series'] }, review: R2
  },
  {
    id: 'E10', title: T('基尔霍夫与桥式电路', 'Kirchhoff’s laws and the bridge', 'Kirchhoffsche Regeln und Brückenschaltung'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'lumped',
    assumptions: [A.lumped, T('理想电源；检流计内阻 Rg', 'Ideal source; galvanometer resistance Rg', 'Ideale Quelle; Innenwiderstand des Galvanometers Rg')],
    validity: T('线性电阻网络', 'Linear resistor network', 'Lineares Widerstandsnetz'),
    sources: ['S28', 'S51'],
    inputs: [pos('R1', 'R_1', T('左上臂', 'Upper left arm', 'Oberer linker Zweig'), 'Ω', 'resistance', 100), pos('R2', 'R_2', T('左下臂', 'Lower left arm', 'Unterer linker Zweig'), 'Ω', 'resistance', 200), pos('R3', 'R_3', T('右上臂', 'Upper right arm', 'Oberer rechter Zweig'), 'Ω', 'resistance', 100), pos('R4', 'R_4', T('右下臂', 'Lower right arm', 'Unterer rechter Zweig'), 'Ω', 'resistance', 200), inp('U', 'U', T('电源电压', 'Source voltage', 'Quellenspannung'), 'V', 'voltage', 6), nonneg('Rg', 'R_g', T('检流计内阻', 'Galvanometer resistance', 'Galvanometerwiderstand'), 'Ω', 'resistance', 50)],
    lets: [let_('Vth', 'V_{th}', T('检流计两端开路电压', 'Open-circuit voltage at the galvanometer', 'Leerlaufspannung am Galvanometer'), 'V', 'U*(R2/(R1 + R2) - R4/(R3 + R4))'), let_('Rth', 'R_{th}', T('从检流计看进去的电阻', 'Resistance seen by the galvanometer', 'Widerstand vom Galvanometer aus'), 'Ω', 'R1*R2/(R1 + R2) + R3*R4/(R3 + R4)')],
    conditions: [cond('balanced', T('电桥平衡 R1R4 = R2R3', 'Balanced bridge R1R4 = R2R3', 'Abgeglichene Brücke R1R4 = R2R3'), 'abs(R1*R4 - R2*R3) <= 1e-12*R1*R4')],
    outputs: [
      out('Ig', 'I_g', T('检流计电流', 'Galvanometer current', 'Galvanometerstrom'), 'A', 'Vth/(Rth + Rg)'),
      out('Vl', 'V_l', T('左中点电位', 'Potential of the left midpoint', 'Potential des linken Mittelpunkts'), 'V', 'U*R2/(R1 + R2)', { requires: ['balanced'] }),
      out('Il', 'I_l', T('左支路电流（平衡时）', 'Current in the left branch (balanced)', 'Strom im linken Zweig (abgeglichen)'), 'A', 'U/(R1 + R2)', { requires: ['balanced'] })
    ],
    example: { text: T('电桥两分压支路均为上臂 100 Ω、下臂 200 Ω，源 6 V，中点接理想检流计。', 'Both dividers of a bridge have 100 Ω above and 200 Ω below, 6 V source, a galvanometer between the midpoints.', 'Beide Teiler einer Brücke haben oben 100 Ω und unten 200 Ω, Quelle 6 V, Galvanometer zwischen den Mitten.'), answer: T('中点均为 4 V，检流计电流 0；每分压支路电流 0.02 A。', 'Both midpoints at 4 V, no galvanometer current; 0.02 A in each divider.', 'Beide Mitten bei 4 V, kein Galvanometerstrom; 0,02 A in jedem Teiler.') },
    point: T('一般电路依靠节点与约束方程。', 'General circuits rest on node and constraint equations.', 'Allgemeine Schaltungen beruhen auf Knoten- und Bindungsgleichungen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:E10', 'test:loop2 bridge vs circuitSolve'],
    links: {}, review: R2
  },
  {
    id: 'E11', title: T('戴维南与诺顿等效', 'Thévenin and Norton equivalents', 'Thévenin- und Norton-Ersatzschaltung'),
    stages: ['u'], priority: 'P2', geometry: 'lumped',
    assumptions: [A.lumped, T('线性网络，独立源', 'Linear network, independent sources', 'Lineares Netz, unabhängige Quellen')],
    validity: T('端口等效不保证内部能量分布相同；受控源不可简单全置零', 'The port equivalent does not keep the internal energy distribution; dependent sources must not simply be zeroed', 'Die Ersatzschaltung erhält die innere Energieverteilung nicht; gesteuerte Quellen nicht einfach null setzen'),
    sources: ['S51', 'S28'],
    inputs: [inp('Vs', 'V_s', T('电源电压', 'Source voltage', 'Quellenspannung'), 'V', 'voltage', 12), pos('R1', 'R_1', T('上臂', 'Upper resistor', 'Oberer Widerstand'), 'Ω', 'resistance', 1000), pos('R2', 'R_2', T('下臂（端口两端）', 'Lower resistor (across the port)', 'Unterer Widerstand (am Tor)'), 'Ω', 'resistance', 1000), pos('RL', 'R_L', T('负载', 'Load', 'Last'), 'Ω', 'resistance', 1000)],
    outputs: [out('Vth', 'V_{th}', T('戴维南电压', 'Thévenin voltage', 'Thévenin-Spannung'), 'V', 'Vs*R2/(R1 + R2)'), out('Rth', 'R_{th}', T('戴维南电阻', 'Thévenin resistance', 'Thévenin-Widerstand'), 'Ω', 'R1*R2/(R1 + R2)'), out('IN', 'I_N', T('诺顿电流', 'Norton current', 'Norton-Strom'), 'A', 'Vs/R1'), out('VL', 'V_L', T('负载电压', 'Load voltage', 'Lastspannung'), 'V', 'Vs*R2/(R1 + R2)*RL/(R1*R2/(R1 + R2) + RL)'), out('IL', 'I_L', T('负载电流', 'Load current', 'Laststrom'), 'A', 'Vs*R2/(R1 + R2)/(R1*R2/(R1 + R2) + RL)')],
    example: { text: T('12 V 源，两只 1 kΩ 分压，端口在下臂，接 1 kΩ 负载。', 'A 12 V source, two 1 kΩ dividers, port across the lower one, 1 kΩ load.', '12-V-Quelle, zwei 1-kΩ-Teiler, Tor am unteren, Last 1 kΩ.'), answer: T('Vth = 6 V、Rth = 500 Ω；负载电压 4 V、电流 4 mA。', 'Vth = 6 V, Rth = 500 Ω; load 4 V and 4 mA.', 'Vth = 6 V, Rth = 500 Ω; Last 4 V und 4 mA.') },
    point: T('端口等效不保证内部能量分布相同。', 'A port equivalent does not keep the internal energy distribution.', 'Eine Ersatzschaltung erhält die innere Energieverteilung nicht.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:E11'],
    links: {}, review: R2
  },
  {
    id: 'E12', title: T('内阻与最大功率', 'Internal resistance and maximum power', 'Innenwiderstand und maximale Leistung'),
    stages: ['s'], priority: 'P1', geometry: 'lumped',
    assumptions: [A.lumped, T('电源 = 理想电动势串联内阻 r', 'Source = ideal emf in series with r', 'Quelle = ideale Urspannung in Reihe mit r')],
    validity: T('线性电源模型', 'Linear source model', 'Lineares Quellenmodell'),
    sources: ['S28'],
    inputs: [inp('E', '\\mathcal{E}', L.emf, 'V', 'voltage', 12), pos('r', 'r', T('内阻', 'Internal resistance', 'Innenwiderstand'), 'Ω', 'resistance', 2), nonneg('R', 'R', T('负载电阻', 'Load resistance', 'Lastwiderstand'), 'Ω', 'resistance', 2)],
    outputs: [out('I', 'I', L.I, 'A', 'E/(R + r)'), out('U', 'U', T('路端电压', 'Terminal voltage', 'Klemmenspannung'), 'V', 'E*R/(R + r)'), out('PR', 'P_R', T('负载功率', 'Load power', 'Lastleistung'), 'W', 'E^2*R/(R + r)^2'), out('Pr', 'P_r', T('内阻热功率', 'Heating in the source', 'Wärme in der Quelle'), 'W', 'E^2*r/(R + r)^2'), out('eta', '\\eta', T('效率', 'Efficiency', 'Wirkungsgrad'), '', 'R/(R + r)'), out('Pmax', 'P_{\\max}', T('最大负载功率（R = r）', 'Maximum load power (R = r)', 'Maximale Lastleistung (R = r)'), 'W', 'E^2/(4*r)')],
    example: { text: T('电动势 12 V、内阻 2 Ω，负载 2 Ω。', 'emf 12 V, internal resistance 2 Ω, load 2 Ω.', 'Urspannung 12 V, Innenwiderstand 2 Ω, Last 2 Ω.'), answer: T('I = 3 A，负载电压 6 V，功率 18 W；效率 50%。', 'I = 3 A, load voltage 6 V, power 18 W; efficiency 50 %.', 'I = 3 A, Lastspannung 6 V, Leistung 18 W; Wirkungsgrad 50 %.') },
    point: T('最大功率与最大效率不同。', 'Maximum power is not maximum efficiency.', 'Maximale Leistung ist nicht maximaler Wirkungsgrad.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:E12', 'rust:src/labs/circuit.rs series_with_internal_resistance'],
    links: {}, review: R2
  },
  {
    id: 'E13', title: T('电表内阻与测量扰动', 'Meter resistance and the disturbance of a measurement', 'Messgeräte-Innenwiderstand und Rückwirkung'),
    stages: ['s'], priority: 'P1', geometry: 'lumped',
    assumptions: [A.lumped, T('电压表 = 理想表并联内阻 RV', 'Voltmeter = ideal meter in parallel with RV', 'Spannungsmesser = ideales Gerät parallel zu RV')],
    validity: T('“理想表”结论只在 RV ≫ R2 时适用', 'The ideal-meter result holds only for RV ≫ R2', 'Das Ergebnis des idealen Geräts gilt nur für RV ≫ R2'),
    sources: ['S28', 'S51'],
    inputs: [inp('Vs', 'V_s', T('电源电压', 'Source voltage', 'Quellenspannung'), 'V', 'voltage', 10), pos('R1', 'R_1', T('上臂', 'Upper resistor', 'Oberer Widerstand'), 'Ω', 'resistance', 10000), pos('R2', 'R_2', T('下臂（被测）', 'Lower resistor (measured)', 'Unterer Widerstand (gemessen)'), 'Ω', 'resistance', 10000), pos('RV', 'R_V', T('电压表内阻', 'Voltmeter resistance', 'Innenwiderstand des Spannungsmessers'), 'Ω', 'resistance', 100000)],
    lets: [let_('Rp', 'R_2\\parallel R_V', T('下臂与表的并联', 'Lower resistor parallel to the meter', 'Unterer Widerstand parallel zum Messgerät'), 'Ω', 'R2*RV/(R2 + RV)')],
    conditions: [cond('ideal', T('电压表可视为理想（RV ≥ 1000 R2）', 'The voltmeter is practically ideal (RV ≥ 1000 R2)', 'Der Spannungsmesser ist praktisch ideal (RV ≥ 1000 R2)'), 'RV >= 1000*R2', 'RV >= 100*R2')],
    outputs: [
      out('Vtrue', 'V_2', T('未接表时的电压', 'Voltage without the meter', 'Spannung ohne Messgerät'), 'V', 'Vs*R2/(R1 + R2)'),
      out('Vread', 'V_{read}', T('电压表读数', 'Voltmeter reading', 'Anzeige des Spannungsmessers'), 'V', 'Vs*Rp/(R1 + Rp)'),
      out('err', '\\delta', T('相对偏差', 'Relative deviation', 'Relative Abweichung'), '', '(Vs*Rp/(R1 + Rp) - Vs*R2/(R1 + R2))/(Vs*R2/(R1 + R2))'),
      out('Videal', 'V_{read}', T('按理想表计算的读数', 'Reading of an ideal meter', 'Anzeige eines idealen Geräts'), 'V', 'Vs*R2/(R1 + R2)', { requires: ['ideal'] })
    ],
    example: { text: T('10 V 源，两只 10 kΩ 分压；100 kΩ 电压表并下臂。', 'A 10 V source with two 10 kΩ resistors; a 100 kΩ voltmeter across the lower one.', '10-V-Quelle mit zwei 10-kΩ-Widerständen; ein 100-kΩ-Spannungsmesser am unteren.'), answer: T('下臂等效 9.09091 kΩ；读数 4.76190 V，低于原来的 5 V。', 'The lower arm becomes 9.09091 kΩ; the meter reads 4.76190 V instead of 5 V.', 'Der untere Zweig wird 9,09091 kΩ; die Anzeige ist 4,76190 V statt 5 V.') },
    point: T('测量仪器也是电路的一部分。', 'The instrument is part of the circuit.', 'Das Messgerät ist Teil der Schaltung.'),
    status: 'verified', level: 3, teaching: 2, references: ['analytic', 'otherMethod'],
    benchmarks: ['oracle:E13', 'test:loop2 voltmeter loading vs circuitSolve'],
    links: { activities: ['act-meter'] }, review: R2
  },
  {
    id: 'E14', title: T('焦耳热与电热耦合', 'Joule heating and electro-thermal coupling', 'Joulesche Wärme und elektrothermische Kopplung'),
    stages: ['j', 's', 'u'], priority: 'P1', geometry: 'lumped',
    assumptions: [T('恒定电流，忽略散热，电阻不随温度变', 'Constant current, no heat loss, resistance independent of temperature', 'Konstanter Strom, keine Wärmeabgabe, Widerstand temperaturunabhängig')],
    validity: T('温升小（电阻变化可忽略）', 'Small temperature rise (negligible change of resistance)', 'Kleine Erwärmung (Widerstandsänderung vernachlässigbar)'),
    sources: ['S20', 'S28'],
    inputs: [inp('I', 'I', L.I, 'A', 'current', 2), pos('R', 'R', L.R, 'Ω', 'resistance', 5), nonneg('t', 't', L.t, 's', 'time', 10), pos('Cth', 'C_{th}', T('总热容', 'Total heat capacity', 'Gesamte Wärmekapazität'), 'J/K', 'heatCapacity', 100)],
    outputs: [out('P', 'P', T('热功率', 'Heating power', 'Wärmeleistung'), 'W', 'I^2*R'), out('Q', 'Q', T('焦耳热', 'Joule heat', 'Joulesche Wärme'), 'J', 'I^2*R*t'), out('dT', '\\Delta T', T('温升', 'Temperature rise', 'Temperaturanstieg'), 'K', 'I^2*R*t/Cth', { kind: 'temperatureDifference' })],
    example: { text: T('2 A 流过 5 Ω 电阻 10 s，总热容 100 J/K，忽略散热。', '2 A through 5 Ω for 10 s, total heat capacity 100 J/K, no heat loss.', '2 A durch 5 Ω für 10 s, gesamte Wärmekapazität 100 J/K, keine Wärmeabgabe.'), answer: T('发热 200 J，升温 2 K。', '200 J of heat, a rise of 2 K.', '200 J Wärme, 2 K Erwärmung.') },
    point: T('热量反过来可改变电阻。', 'The heat can change the resistance in turn.', 'Die Wärme kann ihrerseits den Widerstand ändern.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:E14', 'rust:src/labs/transient.rs rc_charging_and_energy'],
    links: {}, review: R2, gap: T('电路与热模块的双向耦合未做', 'Two-way coupling of the circuit and a thermal model is not done', 'Zweiseitige Kopplung von Schaltung und Wärmemodell fehlt')
  },
  {
    id: 'E15', title: T('RC 充放电', 'Charging and discharging an RC circuit', 'Laden und Entladen eines RC-Glieds'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'lumped',
    assumptions: [A.lumped, A.ideal, T('开关在 t = 0 闭合；电容初电压 V0（电容电压连续）', 'The switch closes at t = 0; the capacitor starts at V0 (its voltage is continuous)', 'Der Schalter schließt bei t = 0; der Kondensator beginnt bei V0 (seine Spannung ist stetig)')],
    validity: T('有限电阻（R > 0）；理想电源', 'Finite resistance (R > 0); ideal source', 'Endlicher Widerstand (R > 0); ideale Quelle'),
    sources: ['S28', 'S51', 'S56'],
    inputs: [pos('R', 'R', L.R, 'Ω', 'resistance', 1000), pos('C', 'C', L.C, 'F', 'capacitance', 1e-4), inp('Vs', 'V_s', T('电源电压', 'Source voltage', 'Quellenspannung'), 'V', 'voltage', 5), inp('V0', 'V_0', T('电容初电压', 'Initial capacitor voltage', 'Anfangsspannung des Kondensators'), 'V', 'voltage', 0), nonneg('t', 't', L.t, 's', 'time', 0.1)],
    lets: [let_('tau', '\\tau', L.tau, 's', 'R*C')],
    outputs: [
      out('tau', '\\tau', L.tau, 's', 'tau'),
      out('VC', 'V_C', T('电容电压', 'Capacitor voltage', 'Kondensatorspannung'), 'V', 'Vs + (V0 - Vs)*exp(-t/tau)'),
      out('I', 'I', T('电流', 'Current', 'Strom'), 'A', '(Vs - V0)/R*exp(-t/tau)'),
      out('I0', 'I_0', T('开关闭合瞬间的电流', 'Current just after closing', 'Strom unmittelbar nach dem Schließen'), 'A', '(Vs - V0)/R'),
      out('Vtau', 'V_C(\\tau)', T('一个时间常数时的电压', 'Voltage after one time constant', 'Spannung nach einer Zeitkonstante'), 'V', 'Vs + (V0 - Vs)*exp(-1)'),
      out('WC', 'W_C', T('电容储能的增加', 'Increase of the stored energy', 'Zunahme der gespeicherten Energie'), 'J', 'C*((Vs + (V0 - Vs)*exp(-t/tau))^2 - V0^2)/2'),
      out('WR', 'W_R', T('电阻消耗的能量', 'Energy dissipated in R', 'In R umgesetzte Energie'), 'J', 'C*(Vs - V0)^2*(1 - exp(-2*t/tau))/2')
    ],
    example: { text: T('R = 1 kΩ，C = 100 μF，源 5 V，初电压 0，求 0.1 s 电压。', 'R = 1 kΩ, C = 100 μF, 5 V source, uncharged: the voltage at 0.1 s.', 'R = 1 kΩ, C = 100 μF, Quelle 5 V, ungeladen: Spannung bei 0,1 s.'), answer: T('τ = 0.1 s；VC = 3.16060 V；电流 1.83940 mA。', 'τ = 0.1 s; VC = 3.16060 V; current 1.83940 mA.', 'τ = 0,1 s; VC = 3,16060 V; Strom 1,83940 mA.') },
    point: T('有限电流下电容电压连续。', 'With finite currents the capacitor voltage is continuous.', 'Bei endlichen Strömen ist die Kondensatorspannung stetig.'),
    status: 'verified', level: 3, teaching: 2, references: ['analytic', 'otherMethod'],
    benchmarks: ['oracle:E15', 'test:loop2 circuitRun RC vs E15 with rtol convergence', 'test:loop2 energy ledger RC', 'rust:src/labs/transient.rs rc_charging_and_energy'],
    links: { activities: ['act-rc'] }, review: R2
  },
  {
    id: 'E16', title: T('RL 自感暂态', 'RL transient (self-inductance)', 'RL-Einschaltvorgang (Selbstinduktion)'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'lumped',
    assumptions: [A.lumped, A.ideal, T('电感电流连续；初电流 I0', 'Continuous inductor current; initial current I0', 'Stetiger Spulenstrom; Anfangsstrom I0')],
    validity: T('线性电感', 'Linear inductor', 'Lineare Spule'),
    sources: ['S32', 'S51', 'S56'],
    inputs: [pos('R', 'R', L.R, 'Ω', 'resistance', 10), pos('L', 'L', L.Lind, 'H', 'inductance', 1), inp('Vs', 'V_s', T('电源电压', 'Source voltage', 'Quellenspannung'), 'V', 'voltage', 10), inp('I0', 'I_0', T('初电流', 'Initial current', 'Anfangsstrom'), 'A', 'current', 0), nonneg('t', 't', L.t, 's', 'time', 0.1)],
    outputs: [out('tau', '\\tau', L.tau, 's', 'L/R'), out('I', 'I', L.I, 'A', 'Vs/R + (I0 - Vs/R)*exp(-R*t/L)'), out('UL', 'U_L', T('电感两端电压', 'Voltage across the inductor', 'Spannung an der Spule'), 'V', '(Vs - R*I0)*exp(-R*t/L)')],
    example: { text: T('R = 10 Ω，L = 1 H，源 10 V，初电流 0，求 0.1 s 电流。', 'R = 10 Ω, L = 1 H, 10 V source, no initial current: the current at 0.1 s.', 'R = 10 Ω, L = 1 H, Quelle 10 V, ohne Anfangsstrom: Strom bei 0,1 s.'), answer: T('τ = 0.1 s；I = 0.632121 A。', 'τ = 0.1 s; I = 0.632121 A.', 'τ = 0,1 s; I = 0,632121 A.') },
    point: T('有限电压下电感电流连续。', 'With finite voltages the inductor current is continuous.', 'Bei endlichen Spannungen ist der Spulenstrom stetig.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:E16', 'rust:src/labs/transient.rs rl_and_discharge'],
    links: {}, review: R2
  },
  {
    id: 'E17', title: T('LC 振荡', 'LC oscillation', 'LC-Schwingung'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'lumped',
    assumptions: [A.lumped, T('无电阻的理想 LC 回路', 'Ideal LC circuit without resistance', 'Idealer LC-Kreis ohne Widerstand')],
    validity: T('电阻可忽略（Q 值高）', 'Negligible resistance (high quality factor)', 'Vernachlässigbarer Widerstand (hohe Güte)'),
    sources: ['S32'],
    inputs: [pos('L', 'L', L.Lind, 'H', 'inductance', 1), pos('C', 'C', L.C, 'F', 'capacitance', 1e-4), inp('V0', 'V_0', T('电容初电压', 'Initial capacitor voltage', 'Anfangsspannung des Kondensators'), 'V', 'voltage', 10), inp('I0', 'I_0', T('初电流', 'Initial current', 'Anfangsstrom'), 'A', 'current', 0)],
    lets: [let_('U', 'U', T('总能量', 'Total energy', 'Gesamtenergie'), 'J', 'C*V0^2/2 + L*I0^2/2')],
    outputs: [out('omega', '\\omega_0', L.omega, 'rad/s', '1/sqrt(L*C)'), out('T', 'T', L.T, 's', '2*pi*sqrt(L*C)'), out('U', 'U', T('总能量', 'Total energy', 'Gesamtenergie'), 'J', 'U'), out('Imax', 'I_{\\max}', T('最大电流', 'Maximum current', 'Maximaler Strom'), 'A', 'sqrt(2*U/L)'), out('Vmax', 'V_{\\max}', T('最大电容电压', 'Maximum capacitor voltage', 'Maximale Kondensatorspannung'), 'V', 'sqrt(2*U/C)')],
    example: { text: T('L = 1 H，C = 100 μF，初电容电压 10 V、电流 0。', 'L = 1 H, C = 100 μF, capacitor at 10 V, no current.', 'L = 1 H, C = 100 μF, Kondensator bei 10 V, kein Strom.'), answer: T('ω0 = 100 rad/s；周期 0.0628319 s；能量 0.005 J；最大电流 0.1 A。', 'ω0 = 100 rad/s; period 0.0628319 s; energy 0.005 J; maximum current 0.1 A.', 'ω0 = 100 rad/s; Periode 0,0628319 s; Energie 0,005 J; maximaler Strom 0,1 A.') },
    point: T('场能交换可类比弹簧振子。', 'The exchange of field energies resembles a spring oscillator.', 'Der Austausch der Feldenergien gleicht einem Federschwinger.'),
    status: 'verified', level: 3, teaching: 2, references: ['analytic', 'otherMethod'],
    benchmarks: ['oracle:E17', 'test:loop2 circuitRun LC period, energy and phase drift', 'rust:src/labs/transient.rs lc_oscillation_keeps_energy_and_period'],
    links: { activities: ['act-lc'] }, review: R2
  },
  {
    id: 'E18', title: T('RLC 交流与相量', 'RLC circuits with alternating current: phasors', 'RLC-Wechselstromkreis: Zeiger'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'lumped',
    assumptions: [A.lumped, T('线性正弦稳态（瞬态已衰减）', 'Linear sinusoidal steady state (transients have died out)', 'Linearer sinusförmiger Dauerzustand (Einschwingvorgang abgeklungen)')],
    validity: T('相量只用于线性正弦稳态；任意波形不能一律峰值除 √2', 'Phasors only for linear sinusoidal steady states; other waveforms are not peak/√2', 'Zeiger nur im linearen sinusförmigen Dauerzustand; andere Kurvenformen sind nicht Scheitelwert/√2'),
    sources: ['S33', 'S51'],
    inputs: [pos('R', 'R', L.R, 'Ω', 'resistance', 10), pos('L', 'L', L.Lind, 'H', 'inductance', 0.1), pos('C', 'C', L.C, 'F', 'capacitance', 1e-4), inp('Vrms', 'V_{rms}', T('电源电压有效值', 'RMS source voltage', 'Effektivwert der Quellenspannung'), 'V', 'voltage', 10), pos('w', '\\omega', T('电源角频率', 'Angular frequency of the source', 'Kreisfrequenz der Quelle'), 'rad/s', 'angularVelocity', 316.22776601683796)],
    lets: [let_('X', 'X', T('电抗', 'Reactance', 'Blindwiderstand'), 'Ω', 'w*L - 1/(w*C)')],
    outputs: [out('w0', '\\omega_0', T('谐振角频率', 'Resonant angular frequency', 'Resonanzkreisfrequenz'), 'rad/s', '1/sqrt(L*C)'), out('Z', '|Z|', T('阻抗', 'Impedance', 'Scheinwiderstand'), 'Ω', 'sqrt(R^2 + X^2)'), out('I', 'I_{rms}', T('电流有效值', 'RMS current', 'Effektivwert des Stroms'), 'A', 'Vrms/sqrt(R^2 + X^2)'), out('phi', '\\varphi', T('电压超前电流的相位', 'Phase of the voltage ahead of the current', 'Phasenvorsprung der Spannung'), 'rad', 'atan2(X, R)'), out('P', 'P', T('平均功率', 'Average power', 'Mittlere Leistung'), 'W', 'Vrms^2*R/(R^2 + X^2)')],
    example: { text: T('R = 10 Ω，L = 0.1 H，C = 100 μF，谐振，源电压有效值 10 V。', 'R = 10 Ω, L = 0.1 H, C = 100 μF at resonance, 10 V RMS.', 'R = 10 Ω, L = 0,1 H, C = 100 μF in Resonanz, 10 V effektiv.'), answer: T('ω0 = 316.228 rad/s；Z = 10 Ω；Irms = 1 A；平均功率 10 W。', 'ω0 = 316.228 rad/s; Z = 10 Ω; Irms = 1 A; average power 10 W.', 'ω0 = 316,228 rad/s; Z = 10 Ω; Irms = 1 A; mittlere Leistung 10 W.') },
    point: T('相量限于线性正弦稳态。', 'Phasors are limited to linear sinusoidal steady states.', 'Zeiger gelten nur im linearen sinusförmigen Dauerzustand.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:E18', 'rust:src/labs/transient.rs ac_rms_phase_and_rectifier'],
    links: {}, review: R2
  },
  {
    id: 'E19', title: T('二极管与整流', 'Diode and rectification', 'Diode und Gleichrichtung'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'lumped',
    assumptions: [T('定压降模型（导通压降 Vd）或肖克利指数模型', 'Constant-drop model (forward drop Vd) or Shockley’s exponential model', 'Modell konstanter Durchlassspannung (Vd) oder exponentielles Shockley-Modell')],
    validity: T('定压降模型是近似；指数模型在给定 Is、n、温度下', 'The constant drop is an approximation; the exponential model for given Is, n and temperature', 'Die konstante Durchlassspannung ist eine Näherung; das Exponentialmodell für gegebene Is, n und Temperatur'),
    sources: ['S51'],
    inputs: [inp('Vs', 'V_s', T('电源电压', 'Source voltage', 'Quellenspannung'), 'V', 'voltage', 5), pos('R', 'R', L.R, 'Ω', 'resistance', 1000), nonneg('Vd', 'V_d', T('导通压降', 'Forward drop', 'Durchlassspannung'), 'V', 'voltage', 0.7), pos('Is', 'I_s', T('反向饱和电流', 'Saturation current', 'Sättigungsstrom'), 'A', 'current', 1e-12), pos('n', 'n', T('理想因子', 'Ideality factor', 'Idealitätsfaktor'), '', 'ratio', 1), pos('Tj', 'T', T('结温', 'Junction temperature', 'Sperrschichttemperatur'), 'K', 'temperature', 300, { kind: 'temperature' })],
    lets: [let_('VT', 'V_T', T('热电压 kT/e', 'Thermal voltage kT/e', 'Temperaturspannung kT/e'), 'V', 'k_B*Tj/e_charge')],
    conditions: [cond('on', T('正向导通（Vs > Vd）', 'Forward conducting (Vs > Vd)', 'Leitend in Durchlassrichtung (Vs > Vd)'), 'Vs > Vd'), cond('off', T('截止', 'Blocking', 'Sperrend'), 'Vs <= Vd')],
    outputs: [
      out('I', 'I', T('电流（定压降模型）', 'Current (constant-drop model)', 'Strom (Modell konstanter Durchlassspannung)'), 'A', '(Vs - Vd)/R', { when: 'on', branch: T('导通', 'Conducting', 'Leitend') }),
      out('I', 'I', T('电流（定压降模型）', 'Current (constant-drop model)', 'Strom (Modell konstanter Durchlassspannung)'), 'A', '0*Vs/R', { when: 'off', branch: T('截止', 'Blocking', 'Sperrend') }),
      roots('Iexp', 'I', T('电流（指数模型，求根）', 'Current (exponential model, root)', 'Strom (Exponentialmodell, Nullstelle)'), 'A', { var: 'x', f: 'Vs - x*R - n*VT*ln(x/Is + 1)', lo: '0', hi: 'abs(Vs)/R', accept: 'x >= 0', samples: 2000 })
    ],
    example: { text: T('先用定压降模型：5 V 源串 1 kΩ 与正向二极管，压降 0.7 V。', 'Constant-drop model first: 5 V source, 1 kΩ and a forward diode with 0.7 V drop.', 'Zuerst das Modell konstanter Durchlassspannung: 5 V, 1 kΩ und eine Diode mit 0,7 V.'), answer: T('导通时 I = 4.3 mA；这是定压降模型结果，不是指数器件方程的精确解。', 'Conducting, I = 4.3 mA; a constant-drop result, not the exact solution of the exponential device equation.', 'Leitend, I = 4,3 mA; ein Ergebnis des einfachen Modells, nicht die exakte Lösung der Exponentialgleichung.') },
    point: T('分段线性和指数模型有不同保真度。', 'Piecewise-linear and exponential models have different fidelity.', 'Stückweise lineare und exponentielle Modelle sind verschieden genau.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:E19', 'rust:src/labs/transient.rs ac_rms_phase_and_rectifier'],
    links: {}, review: R2
  },
  {
    id: 'E20', title: T('传感器 放大与晶体管接口', 'Sensors, amplifiers and transistor interfaces', 'Sensoren, Verstärker und Transistorschnittstellen'),
    stages: ['u'], priority: 'P2', geometry: 'lumped',
    assumptions: [T('理想运放（无限增益与输入阻抗）有输出饱和；晶体管在放大区 IC ≈ βIB', 'Ideal op-amp (infinite gain and input impedance) with output saturation; transistor in its active region IC ≈ βIB', 'Idealer Operationsverstärker (unendliche Verstärkung und Eingangswiderstand) mit Sättigung; Transistor im aktiven Bereich IC ≈ βIB')],
    validity: T('输出在供电范围内；晶体管未饱和', 'Output within the supply; transistor not saturated', 'Ausgang innerhalb der Versorgung; Transistor nicht gesättigt'),
    sources: ['S51', 'S82'],
    inputs: [pos('Rf', 'R_f', T('反馈电阻', 'Feedback resistor', 'Rückkopplungswiderstand'), 'Ω', 'resistance', 9000), pos('Rg', 'R_g', T('接地电阻', 'Ground resistor', 'Widerstand nach Masse'), 'Ω', 'resistance', 1000), inp('Vi', 'V_i', T('输入电压', 'Input voltage', 'Eingangsspannung'), 'V', 'voltage', 0.2), pos('Vsat', 'V_{sat}', T('输出饱和电压', 'Output saturation voltage', 'Sättigungsspannung des Ausgangs'), 'V', 'voltage', 2), pos('beta', '\\beta', T('电流放大系数', 'Current gain', 'Stromverstärkung'), '', 'ratio', 100), nonneg('IB', 'I_B', T('基极电流', 'Base current', 'Basisstrom'), 'A', 'current', 2e-5)],
    lets: [let_('G', 'G', T('增益', 'Gain', 'Verstärkung'), '', '1 + Rf/Rg')],
    conditions: [cond('linear', T('线性区（|G·Vi| ≤ Vsat）', 'Linear region (|G·Vi| ≤ Vsat)', 'Linearer Bereich (|G·Vi| ≤ Vsat)'), 'abs(G*Vi) <= Vsat'), cond('saturated', T('饱和', 'Saturated', 'Gesättigt'), 'abs(G*Vi) > Vsat')],
    outputs: [
      out('G', 'G', T('同相放大倍数', 'Non-inverting gain', 'Verstärkung (nichtinvertierend)'), '', 'G'),
      out('Vo', 'V_o', T('输出电压', 'Output voltage', 'Ausgangsspannung'), 'V', 'G*Vi', { when: 'linear', branch: T('线性', 'Linear', 'Linear') }),
      out('Vo', 'V_o', T('输出电压', 'Output voltage', 'Ausgangsspannung'), 'V', 'sign(Vi)*Vsat', { when: 'saturated', branch: T('饱和', 'Saturated', 'Gesättigt') }),
      out('IC', 'I_C', T('集电极电流（放大区）', 'Collector current (active region)', 'Kollektorstrom (aktiver Bereich)'), 'A', 'beta*IB')
    ],
    example: { text: T('理想非反相运放 Rf = 9 kΩ、Rg = 1 kΩ，输入 0.2 V，供电允许 2 V 输出。', 'An ideal non-inverting amplifier with Rf = 9 kΩ, Rg = 1 kΩ, input 0.2 V, output limited to 2 V.', 'Idealer nichtinvertierender Verstärker mit Rf = 9 kΩ, Rg = 1 kΩ, Eingang 0,2 V, Ausgang bis 2 V.'), answer: T('增益 10，输出 2 V；若输入升为 1 V 而供电 ±5 V，则进入饱和。', 'Gain 10, output 2 V; with 1 V in and ±5 V supply it saturates.', 'Verstärkung 10, Ausgang 2 V; bei 1 V Eingang und ±5 V Versorgung gesättigt.') },
    point: T('理想增益与带宽、饱和不同；晶体管式有工作区条件。', 'Ideal gain is not bandwidth or saturation; transistor formulas have operating regions.', 'Ideale Verstärkung ist nicht Bandbreite oder Sättigung; Transistorformeln haben Arbeitsbereiche.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:E20'],
    links: {}, review: R2, gap: T('运放与晶体管元件进入电路实验室待做', 'Op-amp and transistor elements in the circuit lab are still to do', 'Operationsverstärker und Transistoren im Schaltungslabor fehlen noch')
  }
]
