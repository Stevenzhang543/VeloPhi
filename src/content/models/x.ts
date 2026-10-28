/**
 * X01–X10: fields, continua, computational methods and frontier topics (blueprint §5.12; doc 02 §12). The P3 models
 * are restricted analytic benchmarks: each states which part is computed and which solver is deferred; none of them
 * stands in for a field solver, CFD, finite elements, molecular dynamics or quantum field theory.
 */
import type { ModelSpec } from './types'
import { A, L, T, cond, inp, nonneg, out, pos } from './dsl'

const R2 = { physics: '2026-10-28', language: '2026-10-28' }

export const MODELS_X: ModelSpec[] = [
  {
    id: 'X01', title: T('泊松方程与静电边值', 'Poisson’s equation and electrostatic boundary values', 'Poisson-Gleichung und elektrostatische Randwerte'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('一维区间 [0, L]，两端给定电势，均匀体电荷 ρ，均匀介电常数 ε', 'One-dimensional interval [0, L], given potentials at both ends, uniform charge density ρ and permittivity ε', 'Eindimensionales Intervall [0, L], vorgegebene Potentiale an beiden Enden, homogene Ladungsdichte ρ und Permittivität ε')],
    validity: T('受限：一维解析解；二维、三维和非均匀问题需要场求解器', 'Restricted: the one-dimensional analytic solution; 2D, 3D and non-uniform problems need a field solver', 'Eingeschränkt: die eindimensionale analytische Lösung; 2D, 3D und inhomogene Probleme brauchen einen Feldlöser'),
    restricted: T('一维匀质 Dirichlet 问题；多维网格求解暂缓（静电实验室 fieldAt 处理点电荷叠加）', 'One-dimensional uniform Dirichlet problem; multidimensional grid solvers deferred (the field lab’s fieldAt sums point charges)', 'Eindimensionales homogenes Dirichlet-Problem; mehrdimensionale Gitterlöser zurückgestellt (fieldAt im Feldlabor summiert Punktladungen)'),
    sources: ['S25', 'S26', 'S54', 'S58'],
    inputs: [pos('Lx', 'L', T('区间长', 'Length of the interval', 'Länge des Intervalls'), 'm', 'length', 1), inp('V0', 'V(0)', T('左端电势', 'Potential at the left end', 'Potential am linken Ende'), 'V', 'voltage', 0), inp('V1', 'V(L)', T('右端电势', 'Potential at the right end', 'Potential am rechten Ende'), 'V', 'voltage', 10), inp('rho', '\\rho', T('体电荷密度', 'Charge density', 'Raumladungsdichte'), 'C/m³', 'chargeDensity', 0), pos('eps', '\\varepsilon', T('介电常数', 'Permittivity', 'Permittivität'), 'F/m', 'permittivity', 8.8541878188e-12), nonneg('x', 'x', L.x, 'm', 'length', 0.3)],
    conditions: [cond('inside', T('x 在区间内', 'x inside the interval', 'x im Intervall'), 'x <= Lx')],
    outputs: [out('V', 'V(x)', T('电势', 'Potential', 'Potential'), 'V', 'V0 + (V1 - V0)*x/Lx + rho/(2*eps)*x*(Lx - x)', { requires: ['inside'] }), out('Ex', 'E_x', T('电场', 'Electric field', 'Elektrisches Feld'), 'V/m', '-(V1 - V0)/Lx - rho/(2*eps)*(Lx - 2*x)', { requires: ['inside'] })],
    example: { text: T('一维无电荷区间长 1 m，V(0) = 0 V，V(1) = 10 V。', 'A charge-free 1 m interval, V(0) = 0 V, V(1) = 10 V.', 'Ein ladungsfreies Intervall von 1 m, V(0) = 0 V, V(1) = 10 V.'), answer: T('解析解 V(x) = 10x V，Ex = −10 V/m；x = 0.3 m 时 V = 3 V。', 'V(x) = 10x V, Ex = −10 V/m; at x = 0.3 m, V = 3 V.', 'V(x) = 10x V, Ex = −10 V/m; bei x = 0,3 m ist V = 3 V.') },
    point: T('几何、材料、源和边界共同定义 PDE 问题。', 'Geometry, material, sources and boundaries together define a PDE problem.', 'Geometrie, Material, Quellen und Ränder definieren gemeinsam ein PDE-Problem.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:X01'],
    links: {}, review: R2
  },
  {
    id: 'X02', title: T('黏性流场与 CFD', 'Viscous flow and CFD', 'Viskose Strömung und CFD'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'section2d',
    assumptions: [A.steady, A.incompressible, T('平板间充分发展层流（Couette–Poiseuille），无滑移', 'Fully developed laminar flow between plates (Couette–Poiseuille), no slip', 'Voll ausgebildete laminare Strömung zwischen Platten (Couette–Poiseuille), Haftbedingung')],
    validity: T('受限：通道解析基准；一般几何、湍流与 CFD 求解暂缓', 'Restricted: an analytic channel benchmark; general geometry, turbulence and CFD solvers are deferred', 'Eingeschränkt: analytischer Kanal-Benchmark; allgemeine Geometrie, Turbulenz und CFD-Löser zurückgestellt'),
    restricted: T('平板 Couette–Poiseuille 解析剖面；数值流场求解暂缓', 'Analytic Couette–Poiseuille profile; numerical flow solvers deferred', 'Analytisches Couette-Poiseuille-Profil; numerische Strömungslöser zurückgestellt'),
    sources: ['S17', 'S54', 'S57', 'S58'],
    inputs: [pos('hg', 'h', T('板距', 'Gap', 'Plattenabstand'), 'm', 'length', 0.01), inp('U', 'U', T('上板速度', 'Speed of the upper plate', 'Geschwindigkeit der oberen Platte'), 'm/s', 'speed', 1), pos('eta', '\\eta', T('动力黏度', 'Dynamic viscosity', 'Dynamische Viskosität'), 'Pa·s', 'viscosity', 0.1), inp('G', '\\mathrm{d}p/\\mathrm{d}x', T('压强梯度', 'Pressure gradient', 'Druckgradient'), 'N/m³', 'pressureGradient', 0), nonneg('y', 'y', T('离下板高度', 'Height above the lower plate', 'Höhe über der unteren Platte'), 'm', 'length', 0.005)],
    conditions: [cond('inside', T('y 在板间', 'y between the plates', 'y zwischen den Platten'), 'y <= hg')],
    outputs: [out('u', 'u(y)', T('流速', 'Flow speed', 'Strömungsgeschwindigkeit'), 'm/s', 'U*y/hg + G/(2*eta)*(y^2 - hg*y)', { requires: ['inside'] }), out('tau0', '\\tau_0', T('下板剪应力', 'Shear stress at the lower plate', 'Schubspannung an der unteren Platte'), 'Pa', 'eta*U/hg - G*hg/2'), out('q', 'q', T('单位宽度流量', 'Flow per unit width', 'Volumenstrom pro Breite'), 'm²/s', 'U*hg/2 - G*hg^3/(12*eta)')],
    example: { text: T('稳态平面 Couette 流，板距 0.01 m，上板速度 1 m/s，下板静止，η = 0.1 Pa·s。', 'Steady plane Couette flow: gap 0.01 m, upper plate 1 m/s, lower plate at rest, η = 0.1 Pa·s.', 'Stationäre ebene Couette-Strömung: Abstand 0,01 m, obere Platte 1 m/s, untere ruht, η = 0,1 Pa·s.'), answer: T('u(y) = 100y m/s；剪应力 10 Pa；这是无压差、无滑移的解析基准。', 'u(y) = 100y m/s; shear stress 10 Pa; an analytic benchmark without pressure gradient and with no slip.', 'u(y) = 100y m/s; Schubspannung 10 Pa; ein analytischer Benchmark ohne Druckgradient und mit Haftbedingung.') },
    point: T('数值流场需要质量守恒与压力约束；湍流闭合不是画流线。', 'Numerical flow fields need mass conservation and the pressure constraint; turbulence closure is not drawing streamlines.', 'Numerische Strömungen brauchen Massenerhaltung und Druckbedingung; Turbulenzmodellierung ist kein Stromlinienzeichnen.'),
    status: 'verified', level: 1, teaching: 0, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:X02'],
    links: {}, review: R2
  },
  {
    id: 'X03', title: T('弹性有限元与振型', 'Elastic finite elements and mode shapes', 'Elastische finite Elemente und Eigenformen'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'line1d',
    assumptions: [T('单自由度等效弹性系统，无阻尼', 'A single-degree-of-freedom equivalent elastic system, no damping', 'Ein elastisches Ersatzsystem mit einem Freiheitsgrad, ungedämpft')],
    validity: T('受限：单自由度参照；多单元刚度与质量矩阵、网格收敛暂缓', 'Restricted: a single-degree-of-freedom reference; multi-element stiffness and mass matrices and mesh convergence deferred', 'Eingeschränkt: Referenz mit einem Freiheitsgrad; Mehrelement-Matrizen und Netzkonvergenz zurückgestellt'),
    restricted: T('单自由度固有频率；有限元装配与振型暂缓', 'Natural frequency of one degree of freedom; finite-element assembly and mode shapes deferred', 'Eigenfrequenz eines Freiheitsgrads; FE-Assemblierung und Eigenformen zurückgestellt'),
    sources: ['S79', 'S54', 'S58'],
    inputs: [pos('m', 'm', T('等效质量', 'Equivalent mass', 'Ersatzmasse'), 'kg', 'mass', 2), pos('k', 'k', T('等效刚度', 'Equivalent stiffness', 'Ersatzsteifigkeit'), 'N/m', 'stiffness', 200)],
    outputs: [out('w', '\\omega', T('角频率', 'Angular frequency', 'Kreisfrequenz'), 'rad/s', 'sqrt(k/m)'), out('f', 'f', L.f, 'Hz', 'sqrt(k/m)/(2*pi)')],
    example: { text: T('单自由度等效弹性系统 m = 2 kg，k = 200 N/m，无阻尼。', 'A single-degree-of-freedom system m = 2 kg, k = 200 N/m, no damping.', 'Ein System mit einem Freiheitsgrad, m = 2 kg, k = 200 N/m, ungedämpft.'), answer: T('角频率 10 rad/s，频率 1.59155 Hz；作为多单元模型的简化参照。', 'Angular frequency 10 rad/s, frequency 1.59155 Hz; a simplified reference for multi-element models.', 'Kreisfrequenz 10 rad/s, Frequenz 1,59155 Hz; eine vereinfachte Referenz für Mehrelementmodelle.') },
    point: T('质量矩阵、刚度矩阵和边界决定振型。', 'Mass matrix, stiffness matrix and boundaries determine the mode shapes.', 'Massen- und Steifigkeitsmatrix sowie Ränder bestimmen die Eigenformen.'),
    status: 'verified', level: 1, teaching: 0, references: ['otherMethod'], benchmarks: ['oracle:X03'],
    links: {}, review: R2
  },
  {
    id: 'X04', title: T('热方程与热应力', 'Heat equation and thermal stress', 'Wärmeleitung und Wärmespannung'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'line1d',
    assumptions: [A.linear, T('细杆均匀升温 ΔT，两端完全固定', 'A slender rod warmed uniformly by ΔT, both ends fully fixed', 'Ein schlanker Stab gleichmäßig um ΔT erwärmt, beide Enden fest eingespannt')],
    validity: T('受限：均匀温度、完全约束；自由端无热应力；瞬态热传导与耦合暂缓', 'Restricted: uniform temperature and full restraint; a free end has no thermal stress; transient conduction and coupling deferred', 'Eingeschränkt: homogene Temperatur und volle Einspannung; ein freies Ende ist spannungsfrei; instationäre Wärmeleitung und Kopplung zurückgestellt'),
    restricted: T('均匀升温的约束热应力；热—力耦合求解暂缓', 'Restrained thermal stress under uniform warming; coupled thermo-mechanical solvers deferred', 'Wärmespannung bei gleichmäßiger Erwärmung; gekoppelte thermomechanische Löser zurückgestellt'),
    sources: ['S20', 'S79', 'S54'],
    inputs: [pos('E', 'E', T('杨氏模量', 'Young’s modulus', 'Elastizitätsmodul'), 'Pa', 'pressure', 2e11), pos('al', '\\alpha', T('线膨胀系数', 'Linear expansion coefficient', 'Längenausdehnungskoeffizient'), '1/K', 'expansion', 1e-5), inp('dT', '\\Delta T', L.dT, 'K', 'temperatureDifference', 10, { kind: 'temperatureDifference' })],
    outputs: [out('eth', '\\varepsilon_{th}', T('自由热应变', 'Free thermal strain', 'Freie Wärmedehnung'), '', 'al*dT'), out('sig', '\\sigma', T('固定约束下的应力（负为压）', 'Stress when fully restrained (negative: compression)', 'Spannung bei voller Einspannung (negativ: Druck)'), 'Pa', '-E*al*dT')],
    example: { text: T('两端完全固定细杆 E = 2×10¹¹ Pa，α = 10⁻⁵ K⁻¹，均匀升温 10 K。', 'A rod fixed at both ends, E = 2×10¹¹ Pa, α = 10⁻⁵ K⁻¹, warmed uniformly by 10 K.', 'Ein beidseitig eingespannter Stab, E = 2×10¹¹ Pa, α = 10⁻⁵ K⁻¹, gleichmäßig um 10 K erwärmt.'), answer: T('轴向自由热应变应为 10⁻⁴；因固定约束产生压应力 −20 MPa。', 'Free axial strain 10⁻⁴; the restraint produces a compressive stress of −20 MPa.', 'Freie Dehnung 10⁻⁴; die Einspannung erzeugt eine Druckspannung von −20 MPa.') },
    point: T('温度场改变本构应变；先热后力或强耦合取决于反馈程度。', 'The temperature field changes the constitutive strain; one-way or strong coupling depends on the feedback.', 'Das Temperaturfeld ändert die Dehnung; einseitige oder starke Kopplung hängt von der Rückwirkung ab.'),
    status: 'verified', level: 1, teaching: 0, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:X04'],
    links: {}, review: R2
  },
  {
    id: 'X05', title: T('线圈磁通与电路耦合', 'Coil flux linkage and circuit coupling', 'Flussverkettung einer Spule und Schaltungskopplung'),
    stages: ['u'], priority: 'P2', geometry: 'lumped',
    assumptions: [A.lumped, T('线圈 R、L 串联外源 V；外磁链以恒定速率变化（给定，不由机械运动求出）', 'A coil R, L in series with a source V; the external flux linkage changes at a given constant rate (not from a mechanical motion)', 'Eine Spule R, L in Reihe mit einer Quelle V; die äußere Flussverkettung ändert sich mit gegebener konstanter Rate (nicht aus einer Bewegung)')],
    validity: T('V = RI + L dI/dt + dλext/dt；外场只计一次；全机电耦合属导轨模型 B10–B11', 'V = RI + L dI/dt + dλext/dt; the external field counted once; the full electromechanical coupling is the rail model B10–B11', 'V = RI + L dI/dt + dλext/dt; das äußere Feld einmal gezählt; die volle elektromechanische Kopplung ist das Schienenmodell B10–B11'),
    sources: ['S31', 'S32', 'S56'],
    inputs: [pos('R', 'R', L.R, 'Ω', 'resistance', 2), pos('Lc', 'L', L.Lind, 'H', 'inductance', 0.5), inp('V', 'V', T('外源电压', 'Source voltage', 'Quellenspannung'), 'V', 'voltage', 0), inp('dl', '\\dot\\lambda_{ext}', T('外磁链变化率', 'Rate of change of the external flux linkage', 'Änderungsrate der äußeren Flussverkettung'), 'Wb/s', 'fluxRate', 1), inp('I0', 'I_0', T('初始电流', 'Initial current', 'Anfangsstrom'), 'A', 'current', 0), nonneg('t', 't', L.t, 's', 'time', 0.5)],
    outputs: [out('Iss', 'I_\\infty', T('稳态电流', 'Steady current', 'Stationärer Strom'), 'A', '(V - dl)/R'), out('dI0', '\\dot I(0)', T('初始电流变化率', 'Initial rate of change of the current', 'Anfängliche Stromänderungsrate'), 'A/s', '(V - dl - R*I0)/Lc'), out('I', 'I(t)', L.I, 'A', '(V - dl)/R + (I0 - (V - dl)/R)*exp(-R*t/Lc)'), out('tau', '\\tau', L.tau, 's', 'Lc/R')],
    example: { text: T('线圈 R = 2 Ω、L = 0.5 H，外源电压 0，外磁链增加率为 1 Wb/s。', 'A coil R = 2 Ω, L = 0.5 H, no source voltage, the external flux linkage grows at 1 Wb/s.', 'Eine Spule R = 2 Ω, L = 0,5 H, keine Quellenspannung, die äußere Flussverkettung wächst mit 1 Wb/s.'), answer: T('方程 0.5 İ + 2I = −1；稳态电流 −0.5 A，初 I = 0 时 İ = −2 A/s。', '0.5 İ + 2I = −1; steady current −0.5 A; from I = 0, İ = −2 A/s.', '0,5 İ + 2I = −1; stationärer Strom −0,5 A; aus I = 0 ist İ = −2 A/s.') },
    point: T('磁链变化驱动电流，电流又可产生反作用；不能双重计入外场。', 'A changing flux linkage drives the current, which can react back; do not count the external field twice.', 'Eine sich ändernde Flussverkettung treibt den Strom, der zurückwirken kann; das äußere Feld nicht doppelt zählen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:X05', 'rust:src/labs/transient.rs rl_and_discharge'],
    links: {}, review: R2
  },
  {
    id: 'X06', title: T('等离子体与 MHD 分层', 'Plasmas and the MHD hierarchy', 'Plasmen und die MHD-Hierarchie'),
    stages: ['g'], priority: 'P3', geometry: 'abstract',
    assumptions: [T('准中性电子等离子体，离子静止背景，电子温度以 kB·Te 给定', 'Quasi-neutral electron plasma on a fixed ion background; electron temperature given as kB·Te', 'Quasineutrales Elektronenplasma auf ruhendem Ionenhintergrund; Elektronentemperatur als kB·Te')],
    validity: T('受限：特征尺度审查（ωpe、λD、ND）；PIC、Vlasov 与 MHD 求解暂缓', 'Restricted: a review of characteristic scales (ωpe, λD, ND); PIC, Vlasov and MHD solvers deferred', 'Eingeschränkt: Prüfung der charakteristischen Skalen (ωpe, λD, ND); PIC-, Vlasov- und MHD-Löser zurückgestellt'),
    restricted: T('等离子体频率、Debye 长与等离子体参数；动力学求解暂缓', 'Plasma frequency, Debye length and plasma parameter; kinetic solvers deferred', 'Plasmafrequenz, Debye-Länge und Plasmaparameter; kinetische Löser zurückgestellt'),
    sources: ['S81', 'S03', 'S52'],
    inputs: [pos('ne', 'n_e', T('电子数密度', 'Electron number density', 'Elektronendichte'), '1/m³', 'numberDensity', 1e16), pos('kT', 'k_BT_e', T('电子温度（能量）', 'Electron temperature (energy)', 'Elektronentemperatur (Energie)'), 'J', 'energy', 1.602176634e-19), pos('Ls', 'L', T('系统尺度', 'System size', 'Systemgröße'), 'm', 'length', 0.1)],
    conditions: [cond('plasma', T('等离子体判据（λD ≪ L 且 ND ≫ 1）', 'Plasma criteria (λD ≪ L and ND ≫ 1)', 'Plasmakriterien (λD ≪ L und ND ≫ 1)'), 'sqrt(eps0*kT/(ne*e_charge^2)) < 0.01*Ls && 4/3*pi*ne*sqrt(eps0*kT/(ne*e_charge^2))^3 > 100')],
    outputs: [out('wpe', '\\omega_{pe}', T('电子等离子体角频率', 'Electron plasma frequency', 'Elektronenplasmafrequenz'), 'rad/s', 'sqrt(ne*e_charge^2/(m_e*eps0))'), out('lD', '\\lambda_D', T('Debye 长度', 'Debye length', 'Debye-Länge'), 'm', 'sqrt(eps0*kT/(ne*e_charge^2))'), out('ND', 'N_D', T('Debye 球内电子数', 'Electrons in a Debye sphere', 'Elektronen in einer Debye-Kugel'), '', '4/3*pi*ne*sqrt(eps0*kT/(ne*e_charge^2))^3')],
    example: { text: T('电子密度 10¹⁶ m⁻³，电子温度以 kBT = 1 eV 给定。', 'Electron density 10¹⁶ m⁻³, temperature given as kBT = 1 eV.', 'Elektronendichte 10¹⁶ m⁻³, Temperatur als kBT = 1 eV.'), answer: T('电子等离子体角频率约 5.64146×10⁹ rad/s；Debye 长约 74.3394 μm。', 'Electron plasma frequency about 5.64146×10⁹ rad/s; Debye length about 74.3394 μm.', 'Elektronenplasmafrequenz etwa 5,64146×10⁹ rad/s; Debye-Länge etwa 74,3394 μm.') },
    point: T('单粒子、流体、MHD、PIC 和 Vlasov 有不同尺度前提。', 'Single particles, fluids, MHD, PIC and Vlasov rest on different scale assumptions.', 'Einzelteilchen, Fluid, MHD, PIC und Vlasov beruhen auf verschiedenen Skalenannahmen.'),
    status: 'verified', level: 1, teaching: 0, references: ['otherMethod'], benchmarks: ['oracle:X06'],
    links: {}, review: R2
  },
  {
    id: 'X07', title: T('分子动力学与系综', 'Molecular dynamics and ensembles', 'Molekulardynamik und Ensembles'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'abstract',
    assumptions: [A.reduced, T('两粒子 Lennard-Jones 势（ε、σ 为约化单位）', 'Two-particle Lennard-Jones potential (ε, σ in reduced units)', 'Lennard-Jones-Paarpotential (ε, σ in reduzierten Einheiten)')],
    validity: T('受限：对势与力；NVE/NVT 动力学、邻居表与系综采样暂缓（示意碰撞不是 MD）', 'Restricted: pair potential and force; NVE/NVT dynamics, neighbour lists and ensemble sampling deferred (illustrative collisions are not MD)', 'Eingeschränkt: Paarpotential und Kraft; NVE/NVT-Dynamik, Nachbarlisten und Ensembles zurückgestellt (anschauliche Stöße sind keine MD)'),
    restricted: T('Lennard-Jones 对势、力与极小点；分子动力学积分暂缓', 'Lennard-Jones potential, force and minimum; molecular-dynamics integration deferred', 'Lennard-Jones-Potential, Kraft und Minimum; MD-Integration zurückgestellt'),
    sources: ['S61', 'S44'],
    inputs: [pos('ep', '\\varepsilon', T('势阱深度（约化）', 'Well depth (reduced)', 'Topftiefe (reduziert)'), '', 'reduced', 1), pos('sg', '\\sigma', T('尺度参数（约化）', 'Length parameter (reduced)', 'Längenparameter (reduziert)'), '', 'reduced', 1), pos('r', 'r', T('粒子间距（约化）', 'Separation (reduced)', 'Abstand (reduziert)'), '', 'reduced', 2 ** (1 / 6))],
    outputs: [out('U', 'U', T('势能', 'Potential energy', 'Potentielle Energie'), '', '4*ep*((sg/r)^12 - (sg/r)^6)'), out('F', 'F', T('径向力（正为排斥）', 'Radial force (positive: repulsive)', 'Radialkraft (positiv: abstoßend)'), '', '24*ep/r*(2*(sg/r)^12 - (sg/r)^6)'), out('rm', 'r_{\\min}', T('势能极小点', 'Position of the minimum', 'Lage des Minimums'), '', '2^(1/6)*sg')],
    example: { text: T('Lennard–Jones 约化单位 ε = σ = 1，取 r = 2^(1/6)。', 'Lennard-Jones in reduced units ε = σ = 1, at r = 2^(1/6).', 'Lennard-Jones in reduzierten Einheiten ε = σ = 1, bei r = 2^(1/6).'), answer: T('势能 U = −1，势能导数为 0，处于两粒子势能极小点。', 'U = −1 and the derivative is 0: the minimum of the pair potential.', 'U = −1 und die Ableitung ist 0: das Minimum des Paarpotentials.') },
    point: T('宏观温度来自多自由度统计，恒温器改变采样系综。', 'Macroscopic temperature comes from statistics over many degrees of freedom; thermostats change the sampled ensemble.', 'Makroskopische Temperatur kommt aus der Statistik vieler Freiheitsgrade; Thermostate ändern das Ensemble.'),
    status: 'verified', level: 1, teaching: 0, references: ['otherMethod'], benchmarks: ['oracle:X07'],
    links: {}, review: R2
  },
  {
    id: 'X08', title: T('参数反演与可辨识性', 'Parameter estimation and identifiability', 'Parameterschätzung und Identifizierbarkeit'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('x(t) = v0 t + ½ a t²，x0 = 0 已知；两次无噪声观测', 'x(t) = v0 t + ½ a t² with x0 = 0 known; two noise-free observations', 'x(t) = v0 t + ½ a t² mit bekanntem x0 = 0; zwei rauschfreie Beobachtungen')],
    validity: T('两观测时刻不同且非零时 a、v0 唯一；否则不可辨识（不给数）', 'a and v0 are unique when the two times differ and are non-zero; otherwise not identifiable (no number given)', 'a und v0 sind eindeutig, wenn die Zeiten verschieden und nicht null sind; sonst nicht identifizierbar (keine Zahl)'),
    sources: ['S57', 'S62', 'S80'],
    inputs: [pos('t1', 't_1', T('观测时刻 1', 'Time 1', 'Zeit 1'), 's', 'time', 1), inp('x1', 'x_1', T('观测位置 1', 'Position 1', 'Ort 1'), 'm', 'length', 1), pos('t2', 't_2', T('观测时刻 2', 'Time 2', 'Zeit 2'), 's', 'time', 2), inp('x2', 'x_2', T('观测位置 2', 'Position 2', 'Ort 2'), 'm', 'length', 4)],
    conditions: [cond('identifiable', T('可辨识（t1 ≠ t2）', 'Identifiable (t1 ≠ t2)', 'Identifizierbar (t1 ≠ t2)'), 'abs(t2 - t1) > 1e-12*(t1 + t2)')],
    outputs: [out('a', 'a', L.a, 'm/s²', '2*(x2*t1 - x1*t2)/(t1*t2*(t2 - t1))', { requires: ['identifiable'] }), out('v0', 'v_0', L.v0, 'm/s', '(x1*t2^2 - x2*t1^2)/(t1*t2*(t2 - t1))', { requires: ['identifiable'] })],
    example: { text: T('x0 = v0 = 0，观测 t = 1 s 时 x = 1 m，t = 2 s 时 x = 4 m，无噪声。', 'x0 = v0 = 0; observed x = 1 m at t = 1 s and x = 4 m at t = 2 s, no noise.', 'x0 = v0 = 0; beobachtet x = 1 m bei t = 1 s und x = 4 m bei t = 2 s, rauschfrei.'), answer: T('由两点得到 a = 2 m/s²（v0 = 0）；若只观测加速度且不知道 m，只能识别 F/m。', 'From the two points a = 2 m/s² (v0 = 0); observing only the acceleration without m identifies only F/m.', 'Aus den zwei Punkten a = 2 m/s² (v0 = 0); nur aus der Beschleunigung ohne m lässt sich nur F/m bestimmen.') },
    point: T('拟合好不等于参数唯一；结构可辨识性先于优化器。', 'A good fit does not make parameters unique; structural identifiability comes before the optimizer.', 'Eine gute Anpassung macht Parameter nicht eindeutig; strukturelle Identifizierbarkeit kommt vor dem Optimierer.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:X08'],
    links: {}, review: R2
  },
  {
    id: 'X09', title: T('反馈控制与状态空间', 'Feedback control and state space', 'Regelung und Zustandsraum'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('一阶线性系统 ẋ = ax + bu，状态反馈 u = −Kx，无饱和与采样', 'First-order linear system ẋ = ax + bu, state feedback u = −Kx, no saturation or sampling', 'Lineares System erster Ordnung ẋ = ax + bu, Zustandsrückführung u = −Kx, ohne Sättigung und Abtastung')],
    validity: T('闭环极点 a − bK < 0 时稳定；饱和、采样与噪声会改变结果', 'Stable when the closed-loop pole a − bK < 0; saturation, sampling and noise change the result', 'Stabil, wenn der Pol a − bK < 0; Sättigung, Abtastung und Rauschen ändern das Ergebnis'),
    sources: ['S82'],
    inputs: [inp('a', 'a', T('系统参数 a', 'System parameter a', 'Systemparameter a'), '1/s', 'rate', 1), inp('b', 'b', T('输入增益 b', 'Input gain b', 'Eingangsverstärkung b'), '', 'ratio', 1), inp('K', 'K', T('反馈增益', 'Feedback gain', 'Rückführverstärkung'), '1/s', 'rate', 3), inp('x0', 'x_0', T('初始状态', 'Initial state', 'Anfangszustand'), '', 'state', 1), nonneg('t', 't', L.t, 's', 'time', 1)],
    conditions: [cond('stable', T('闭环稳定（a − bK < 0）', 'Closed loop stable (a − bK < 0)', 'Geschlossener Kreis stabil (a − bK < 0)'), 'a - b*K < 0')],
    outputs: [out('p', 'p', T('闭环极点', 'Closed-loop pole', 'Pol des geschlossenen Kreises'), '1/s', 'a - b*K'), out('x', 'x(t)', T('状态', 'State', 'Zustand'), '', 'x0*exp((a - b*K)*t)'), out('ts', 't_s', T('衰减到 2% 的时间', 'Time to decay to 2 %', 'Zeit bis auf 2 % abgeklungen'), 's', 'ln(50)/(b*K - a)', { requires: ['stable'] })],
    example: { text: T('a = 1 s⁻¹，b = 1，K = 3 s⁻¹，初状态 x0 = 1。', 'a = 1 s⁻¹, b = 1, K = 3 s⁻¹, initial state x0 = 1.', 'a = 1 s⁻¹, b = 1, K = 3 s⁻¹, Anfangszustand x0 = 1.'), answer: T('闭环极点为 −2 s⁻¹，x(1) = e⁻² = 0.135335。', 'Closed-loop pole −2 s⁻¹, x(1) = e⁻² = 0.135335.', 'Pol −2 s⁻¹, x(1) = e⁻² = 0,135335.') },
    point: T('反馈可稳定不稳定系统，但执行器饱和、采样和噪声会改变结果。', 'Feedback can stabilize an unstable system, but saturation, sampling and noise change the outcome.', 'Rückführung kann ein instabiles System stabilisieren, aber Sättigung, Abtastung und Rauschen ändern das Ergebnis.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:X09'],
    links: {}, review: R2
  },
  {
    id: 'X10', title: T('经典场与量子场入门', 'Classical and quantum fields: a first look', 'Klassische und Quantenfelder: ein erster Blick'),
    stages: ['g'], priority: 'P3', geometry: 'abstract',
    assumptions: [A.reduced, T('自由实标量场的单个动量模，ℏ = c = 1', 'One momentum mode of a free real scalar field, ℏ = c = 1', 'Eine Impulsmode eines freien reellen Skalarfelds, ℏ = c = 1')],
    validity: T('受限：自由场单模的谐振子能级；相互作用、重整化和规范场暂缓', 'Restricted: oscillator levels of one free mode; interactions, renormalization and gauge fields deferred', 'Eingeschränkt: Oszillatorniveaus einer freien Mode; Wechselwirkung, Renormierung und Eichfelder zurückgestellt'),
    restricted: T('自由场单模色散与能级；相互作用量子场暂缓', 'Dispersion and levels of one free mode; interacting quantum fields deferred', 'Dispersion und Niveaus einer freien Mode; wechselwirkende Quantenfelder zurückgestellt'),
    sources: ['S48', 'S43'],
    inputs: [nonneg('k', 'k', T('波数（约化）', 'Wavenumber (reduced)', 'Wellenzahl (reduziert)'), '', 'reduced', 3), nonneg('m', 'm', T('质量（约化）', 'Mass (reduced)', 'Masse (reduziert)'), '', 'reduced', 4), nonneg('n', 'n', T('该模量子数', 'Number of quanta in the mode', 'Quantenzahl der Mode'), '', 'count', 1)],
    outputs: [out('wk', '\\omega_k', T('模频率', 'Mode frequency', 'Modenfrequenz'), '', 'sqrt(k^2 + m^2)'), out('E0', 'E_0', T('单模真空能', 'Vacuum energy of the mode', 'Vakuumenergie der Mode'), '', 'sqrt(k^2 + m^2)/2'), out('En', 'E_n', T('n 个量子时的能量', 'Energy with n quanta', 'Energie mit n Quanten'), '', '(n + 0.5)*sqrt(k^2 + m^2)')],
    example: { text: T('自由标量场单模，约化单位 ℏ = c = 1，k = 3，m = 4。', 'One mode of a free scalar field, reduced units ℏ = c = 1, k = 3, m = 4.', 'Eine Mode eines freien Skalarfelds, reduzierte Einheiten ℏ = c = 1, k = 3, m = 4.'), answer: T('ωk = 5；单模真空能为 2.5，增加一个量子使能量增加 5。', 'ωk = 5; vacuum energy of the mode 2.5; one more quantum adds 5.', 'ωk = 5; Vakuumenergie der Mode 2,5; ein weiteres Quant fügt 5 hinzu.') },
    point: T('场模量子化与粒子激发；单模不代表已实现相互作用 QFT。', 'Quantized field modes and particle excitations; one mode is not an interacting QFT.', 'Quantisierte Feldmoden und Teilchenanregungen; eine Mode ist keine wechselwirkende QFT.'),
    status: 'verified', level: 1, teaching: 0, references: ['otherMethod'], benchmarks: ['oracle:X10'],
    links: { topics: ['concept:qft'] }, review: R2
  }
]
