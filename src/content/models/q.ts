/**
 * Q01–Q14: quantum physics, atoms and solids (blueprint §5.9; doc 02 §9). Models in reduced units (ħ = m = 1 …)
 * say so; their inputs are pure numbers.
 */
import type { ModelSpec } from './types'
import { A, L, T, angle, cond, inp, let_, nonneg, out, pos, roots } from './dsl'

const R2 = { physics: '2026-10-28', language: '2026-10-28' }
const num = (id: string, symbol: string, label: ReturnType<typeof T>, value: number, more = {}) => inp(id, symbol, label, '', 'reduced', value, more)

export const MODELS_Q: ModelSpec[] = [
  {
    id: 'Q01', title: T('光电效应', 'Photoelectric effect', 'Photoeffekt'),
    stages: ['s'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('单光子吸收；逸出功 φ 为材料给定值', 'One-photon absorption; work function φ given for the material', 'Ein-Photon-Absorption; Austrittsarbeit φ für das Material gegeben')],
    validity: T('只有光子能量大于逸出功时才发射电子', 'Electrons are emitted only above the work function', 'Elektronen werden nur oberhalb der Austrittsarbeit emittiert'),
    sources: ['S38', 'S03'],
    inputs: [pos('lam', '\\lambda', L.lambda, 'm', 'length', 400e-9), pos('phi', '\\phi', T('逸出功', 'Work function', 'Austrittsarbeit'), 'J', 'energy', 2 * 1.602176634e-19)],
    lets: [let_('Eph', 'hf', T('光子能量', 'Photon energy', 'Photonenenergie'), 'J', 'h_planck*c_light/lam')],
    conditions: [cond('emits', T('光子能量大于逸出功', 'The photon energy exceeds the work function', 'Die Photonenenergie übersteigt die Austrittsarbeit'), 'Eph > phi')],
    outputs: [out('E', 'hf', T('光子能量', 'Photon energy', 'Photonenenergie'), 'J', 'Eph'), out('K', 'E_{k,\\max}', T('最大初动能', 'Maximum kinetic energy', 'Maximale kinetische Energie'), 'J', 'Eph - phi', { requires: ['emits'] }), out('Us', 'U_c', T('遏止电压', 'Stopping voltage', 'Gegenspannung'), 'V', '(Eph - phi)/e_charge', { requires: ['emits'] }), out('f0', 'f_0', T('截止频率', 'Threshold frequency', 'Grenzfrequenz'), 'Hz', 'phi/h_planck')],
    example: { text: T('波长 400 nm，材料逸出功取 2.00 eV。', 'Wavelength 400 nm, work function 2.00 eV.', 'Wellenlänge 400 nm, Austrittsarbeit 2,00 eV.'), answer: T('光子能量约 3.09960 eV；最大动能 1.09960 eV，遏止电压约 1.09960 V。', 'Photon energy about 3.09960 eV; maximum kinetic energy 1.09960 eV, stopping voltage about 1.09960 V.', 'Photonenenergie etwa 3,09960 eV; maximale kinetische Energie 1,09960 eV, Gegenspannung etwa 1,09960 V.') },
    point: T('频率改变单光子能量，光强主要影响光子数；低于阈频不发射。', 'Frequency sets the photon energy, intensity mainly the number of photons; below the threshold nothing is emitted.', 'Die Frequenz bestimmt die Photonenenergie, die Intensität vor allem die Photonenzahl; unterhalb der Grenze keine Emission.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:Q01', 'rust:src/labs/atom.rs photoelectric_einstein_equation'],
    links: {}, review: R2
  },
  {
    id: 'Q02', title: T('康普顿散射', 'Compton scattering', 'Compton-Streuung'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'plane',
    assumptions: [T('光子与自由静止电子弹性碰撞', 'Elastic collision of a photon with a free electron at rest', 'Elastischer Stoß eines Photons mit einem freien ruhenden Elektron')],
    validity: T('束缚电子与介质效应不在本模型内', 'Bound electrons and medium effects are outside the model', 'Gebundene Elektronen und Mediumeffekte gehören nicht zum Modell'),
    sources: ['S38', 'S03'],
    inputs: [pos('lam', '\\lambda', T('入射波长', 'Incident wavelength', 'Einfallende Wellenlänge'), 'm', 'length', 7.1e-11), angle('th', '\\theta', T('散射角', 'Scattering angle', 'Streuwinkel'), Math.PI / 2, { min: 0, max: Math.PI })],
    lets: [let_('D', '\\Delta\\lambda', T('波长增量', 'Increase of the wavelength', 'Zunahme der Wellenlänge'), 'm', 'h_planck/(m_e*c_light)*2*sin(th/2)^2')],
    outputs: [out('dl', '\\Delta\\lambda', T('波长增量', 'Increase of the wavelength', 'Zunahme der Wellenlänge'), 'm', 'D'), out('lam2', "\\lambda'", T('散射后波长', 'Scattered wavelength', 'Gestreute Wellenlänge'), 'm', 'lam + D'), out('Ke', 'E_k', T('反冲电子动能', 'Kinetic energy of the recoil electron', 'Kinetische Energie des Rückstoßelektrons'), 'J', 'h_planck*c_light*D/(lam*(lam + D))')],
    example: { text: T('自由静止电子散射光子，光子散射角 90°。', 'A photon scattered by a free electron at rest through 90°.', 'Ein Photon wird an einem freien ruhenden Elektron um 90° gestreut.'), answer: T('波长增加约 2.42631 pm；0° 时增量为 0。', 'The wavelength grows by about 2.42631 pm; at 0° by nothing.', 'Die Wellenlänge wächst um etwa 2,42631 pm; bei 0° gar nicht.') },
    point: T('光子能量与动量共同参与守恒。', 'Both energy and momentum of the photon are conserved together.', 'Energie und Impuls des Photons sind gemeinsam erhalten.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:Q02', 'rust:src/labs/nuclear.rs compton_shift', 'test:labs2656 compton constants by set'],
    links: {}, review: R2
  },
  {
    id: 'Q03', title: T('德布罗意波与电子衍射', 'de Broglie waves and electron diffraction', 'De-Broglie-Wellen und Elektronenbeugung'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('电子从静止经电压 U 加速', 'An electron accelerated from rest through U', 'Ein Elektron aus der Ruhe durch U beschleunigt')],
    validity: T('非相对论式要求 eU ≪ mₑc²；高压时用相对论动量', 'The non-relativistic formula needs eU ≪ mₑc²; at high voltage use the relativistic momentum', 'Die nichtrelativistische Formel braucht eU ≪ mₑc²; bei hoher Spannung den relativistischen Impuls'),
    sources: ['S38', 'S03'],
    inputs: [pos('U', 'U', T('加速电压', 'Accelerating voltage', 'Beschleunigungsspannung'), 'V', 'voltage', 150)],
    lets: [let_('K', 'E_k', T('动能', 'Kinetic energy', 'Kinetische Energie'), 'J', 'e_charge*U')],
    conditions: [cond('slow', T('非相对论（eU ≤ 1 % mₑc²）', 'Non-relativistic (eU ≤ 1 % mₑc²)', 'Nichtrelativistisch (eU ≤ 1 % mₑc²)'), 'K <= 0.01*m_e*c_light^2', 'K <= 0.05*m_e*c_light^2')],
    outputs: [out('lam', '\\lambda', T('德布罗意波长（非相对论）', 'de Broglie wavelength (non-relativistic)', 'De-Broglie-Wellenlänge (nichtrelativistisch)'), 'm', 'h_planck/sqrt(2*m_e*K)', { requires: ['slow'] }), out('lamRel', '\\lambda', T('德布罗意波长（相对论）', 'de Broglie wavelength (relativistic)', 'De-Broglie-Wellenlänge (relativistisch)'), 'm', 'h_planck*c_light/sqrt(K^2 + 2*K*m_e*c_light^2)'), out('p', 'p', T('动量（相对论）', 'Momentum (relativistic)', 'Impuls (relativistisch)'), 'kg·m/s', 'sqrt(K^2 + 2*K*m_e*c_light^2)/c_light')],
    example: { text: T('电子从静止经 150 V 加速，采用非相对论近似。', 'An electron accelerated from rest through 150 V, non-relativistic.', 'Ein Elektron aus der Ruhe durch 150 V beschleunigt, nichtrelativistisch.'), answer: T('波长约 0.10014 nm；动量由动能而非任意动画速度求得。', 'Wavelength about 0.10014 nm; the momentum follows from the kinetic energy, not from an animation speed.', 'Wellenlänge etwa 0,10014 nm; der Impuls folgt aus der kinetischen Energie, nicht aus einer Animationsgeschwindigkeit.') },
    point: T('波粒二象性连接动量与波长。', 'Wave–particle duality links momentum and wavelength.', 'Der Welle-Teilchen-Dualismus verknüpft Impuls und Wellenlänge.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:Q03'],
    links: {}, review: R2
  },
  {
    id: 'Q04', title: T('氢原子能级与光谱', 'Hydrogen levels and spectrum', 'Wasserstoffniveaus und Spektrum'),
    stages: ['s'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('简化能级 Eₙ = −E1/n²（E1 默认 13.6 eV，不含约化质量与精细结构）', 'Simplified levels Eₙ = −E1/n² (E1 = 13.6 eV by default; no reduced mass or fine structure)', 'Vereinfachte Niveaus Eₙ = −E1/n² (E1 = 13,6 eV; ohne reduzierte Masse und Feinstruktur)')],
    validity: T('发射要求 nᵢ > n_f；精密谱线需约化质量与精细结构', 'Emission needs nᵢ > n_f; precise lines need the reduced mass and fine structure', 'Emission braucht nᵢ > n_f; genaue Linien brauchen reduzierte Masse und Feinstruktur'),
    sources: ['S38', 'S39', 'S03'],
    inputs: [pos('ni', 'n_i', T('初态量子数', 'Initial quantum number', 'Anfangsquantenzahl'), '', 'count', 3), pos('nf', 'n_f', T('末态量子数', 'Final quantum number', 'Endquantenzahl'), '', 'count', 2), pos('E1', 'E_1', T('基态能量大小（简化）', 'Ground-state energy (simplified)', 'Grundzustandsenergie (vereinfacht)'), 'J', 'energy', 13.6 * 1.602176634e-19)],
    conditions: [cond('emission', T('发射（nᵢ > n_f）', 'Emission (nᵢ > n_f)', 'Emission (nᵢ > n_f)'), 'ni > nf')],
    outputs: [out('dE', 'h\\nu', T('光子能量', 'Photon energy', 'Photonenenergie'), 'J', 'E1*(1/nf^2 - 1/ni^2)', { requires: ['emission'] }), out('lam', '\\lambda', L.lambda, 'm', 'h_planck*c_light/(E1*(1/nf^2 - 1/ni^2))', { requires: ['emission'] }), out('f', '\\nu', L.f, 'Hz', 'E1*(1/nf^2 - 1/ni^2)/h_planck', { requires: ['emission'] })],
    example: { text: T('采用简化能级系数 13.6 eV，电子从 n = 3 跃迁到 n = 2。', 'With the simplified 13.6 eV, an electron goes from n = 3 to n = 2.', 'Mit vereinfachten 13,6 eV geht ein Elektron von n = 3 nach n = 2.'), answer: T('光子能量为 1.88889 eV；按此简化模型波长约 656.39 nm。', 'Photon energy 1.88889 eV; in this simplified model about 656.39 nm.', 'Photonenenergie 1,88889 eV; in diesem vereinfachten Modell etwa 656,39 nm.') },
    point: T('能级差决定光谱；玻尔轨道图与量子轨道概率密度不同。', 'Level differences set the spectrum; Bohr orbits are not quantum probability densities.', 'Niveauunterschiede bestimmen das Spektrum; Bohrsche Bahnen sind keine Aufenthaltswahrscheinlichkeiten.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:Q04', 'rust:src/labs/atom.rs balmer_lines'],
    links: {}, review: R2
  },
  {
    id: 'Q05', title: T('无限深势阱', 'Infinite square well', 'Unendlich tiefer Potentialtopf'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('一维无限深方势阱，粒子质量 m（默认电子）', 'One-dimensional infinite square well, particle mass m (electron by default)', 'Eindimensionaler unendlich tiefer Topf, Teilchenmasse m (Elektron)')],
    validity: T('非相对论；壁处波函数为零', 'Non-relativistic; the wave function vanishes at the walls', 'Nichtrelativistisch; die Wellenfunktion verschwindet an den Wänden'),
    sources: ['S39', 'S03'],
    inputs: [pos('m', 'm', T('粒子质量', 'Mass of the particle', 'Teilchenmasse'), 'kg', 'mass', 9.1093837139e-31), pos('Lw', 'L', T('势阱宽度', 'Width of the well', 'Topfbreite'), 'm', 'length', 1e-9), pos('n', 'n', T('量子数', 'Quantum number', 'Quantenzahl'), '', 'count', 3)],
    outputs: [out('E1', 'E_1', T('基态能量', 'Ground-state energy', 'Grundzustandsenergie'), 'J', 'pi^2*hbar^2/(2*m*Lw^2)'), out('E2', 'E_2', T('第一激发态能量', 'First excited energy', 'Erste Anregungsenergie'), 'J', '4*pi^2*hbar^2/(2*m*Lw^2)'), out('En', 'E_n', T('第 n 能级', 'Level n', 'Niveau n'), 'J', 'n^2*pi^2*hbar^2/(2*m*Lw^2)'), out('ratio', 'E_2/E_1', T('能级比', 'Ratio of levels', 'Verhältnis der Niveaus'), '', '4')],
    example: { text: T('电子在长 1 nm 的一维无限深势阱中，求前两能级。', 'An electron in a 1 nm infinite well: the first two levels.', 'Ein Elektron in einem 1-nm-Topf: die ersten beiden Niveaus.'), answer: T('E1 约 0.376030 eV，E2 约 1.50412 eV；比值严格为 4。', 'E1 about 0.376030 eV, E2 about 1.50412 eV; the ratio is exactly 4.', 'E1 etwa 0,376030 eV, E2 etwa 1,50412 eV; das Verhältnis ist genau 4.') },
    point: T('边界条件量子化能谱；节点数与量子数对应。', 'Boundary conditions quantize the spectrum; nodes match the quantum number.', 'Randbedingungen quantisieren das Spektrum; Knotenzahl entspricht der Quantenzahl.'),
    status: 'verified', level: 3, teaching: 2, references: ['analytic', 'otherMethod'],
    benchmarks: ['oracle:Q05', 'test:loop3 quantumSetup well levels vs Q05 with grid convergence (order 2)', 'rust:src/labs/quantum.rs infinite_well_and_oscillator_levels'],
    links: { activities: ['act-well'] }, review: R2
  },
  {
    id: 'Q06', title: T('量子谐振子', 'Quantum harmonic oscillator', 'Quantenmechanischer harmonischer Oszillator'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [A.reduced],
    validity: T('理想谐振势', 'Ideal harmonic potential', 'Ideales harmonisches Potential'),
    sources: ['S39', 'S43'],
    inputs: [num('w', '\\hbar\\omega', T('能量量子 ħω（约化单位）', 'Energy quantum ħω (reduced units)', 'Energiequant ħω (reduzierte Einheiten)'), 1, { min: 0, open: true }), num('n', 'n', T('量子数', 'Quantum number', 'Quantenzahl'), 2, { min: 0 })],
    outputs: [out('E0', 'E_0', T('零点能', 'Zero-point energy', 'Nullpunktsenergie'), '', 'w/2'), out('E1', 'E_1', T('第一激发态', 'First excited state', 'Erster angeregter Zustand'), '', '1.5*w'), out('En', 'E_n', T('第 n 能级', 'Level n', 'Niveau n'), '', '(n + 0.5)*w')],
    example: { text: T('约化单位 ℏ = m = ω = 1，求前三能级。', 'Reduced units ℏ = m = ω = 1: the first three levels.', 'Reduzierte Einheiten ℏ = m = ω = 1: die ersten drei Niveaus.'), answer: T('E0 = 0.5，E1 = 1.5，E2 = 2.5；基态不具有零总能量。', 'E0 = 0.5, E1 = 1.5, E2 = 2.5; the ground state does not have zero energy.', 'E0 = 0,5, E1 = 1,5, E2 = 2,5; der Grundzustand hat keine Energie null.') },
    point: T('零点能来自量子约束，不能套经典静止图像。', 'Zero-point energy comes from quantum confinement; the classical picture of rest does not apply.', 'Die Nullpunktsenergie kommt aus der Quanteneinschränkung; das klassische Bild der Ruhe gilt nicht.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:Q06', 'rust:src/labs/quantum.rs infinite_well_and_oscillator_levels'],
    links: {}, review: R2
  },
  {
    id: 'Q07', title: T('有限势垒与隧穿', 'Finite barrier and tunnelling', 'Endliche Barriere und Tunneleffekt'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [A.reduced, T('单能平面波入射方势垒', 'A monoenergetic plane wave on a square barrier', 'Monoenergetische ebene Welle auf eine Rechteckbarriere')],
    validity: T('平面波公式；波包有能量展宽，需按能谱加权', 'Plane-wave formula; a packet has a spread of energies and needs weighting', 'Formel für ebene Wellen; ein Paket hat eine Energiebreite und braucht Gewichtung'),
    sources: ['S39'],
    inputs: [num('V0', 'V_0', T('势垒高度', 'Barrier height', 'Barrierenhöhe'), 1, { min: 0, open: true }), num('a', 'a', T('势垒宽度', 'Barrier width', 'Barrierenbreite'), 1, { min: 0, open: true }), num('E', 'E', T('入射能量', 'Incident energy', 'Einfallsenergie'), 0.5, { min: 0, open: true }), num('m', 'm', T('质量（约化）', 'Mass (reduced)', 'Masse (reduziert)'), 1, { min: 0, open: true })],
    conditions: [cond('below', T('E < V0（隧穿）', 'E < V0 (tunnelling)', 'E < V0 (Tunneln)'), 'E < V0'), cond('above', T('E > V0', 'E > V0', 'E > V0'), 'E > V0')],
    outputs: [
      out('T', 'T', T('透射率', 'Transmission', 'Transmission'), '', '1/(1 + V0^2*sinh(sqrt(2*m*(V0 - E))*a)^2/(4*E*(V0 - E)))', { when: 'below', branch: T('隧穿', 'Tunnelling', 'Tunneln') }),
      out('T', 'T', T('透射率', 'Transmission', 'Transmission'), '', '1/(1 + V0^2*sin(sqrt(2*m*(E - V0))*a)^2/(4*E*(E - V0)))', { when: 'above', branch: T('越过势垒', 'Above the barrier', 'Über der Barriere') }),
      out('R', 'R', T('反射率', 'Reflection', 'Reflexion'), '', '1 - 1/(1 + V0^2*sinh(sqrt(2*m*(V0 - E))*a)^2/(4*E*(V0 - E)))', { when: 'below' }),
      out('R', 'R', T('反射率', 'Reflection', 'Reflexion'), '', '1 - 1/(1 + V0^2*sin(sqrt(2*m*(E - V0))*a)^2/(4*E*(E - V0)))', { when: 'above' })
    ],
    example: { text: T('约化单位 ℏ = m = 1，方势垒 V0 = 1、宽 a = 1，平面波 E = 0.5。', 'Reduced units ℏ = m = 1, square barrier V0 = 1, width a = 1, plane wave E = 0.5.', 'Reduzierte Einheiten ℏ = m = 1, Rechteckbarriere V0 = 1, Breite a = 1, ebene Welle E = 0,5.'), answer: T('κ = 1；T = 1/cosh²1 = 0.419974，R = 0.580026。', 'κ = 1; T = 1/cosh²1 = 0.419974, R = 0.580026.', 'κ = 1; T = 1/cosh²1 = 0,419974, R = 0,580026.') },
    point: T('波包有能量展宽，其透射率未必等于单能平面波公式。', 'A packet spreads in energy; its transmission need not equal the plane-wave value.', 'Ein Paket ist energetisch verbreitert; seine Transmission muss nicht dem Wert der ebenen Welle entsprechen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:Q07', 'rust:src/labs/quantum.rs barrier_transmission_matches_the_average'],
    links: {}, review: R2
  },
  {
    id: 'Q08', title: T('高斯波包与自由演化', 'Gaussian packet in free evolution', 'Gaußsches Wellenpaket in freier Entwicklung'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [A.reduced, T('最小不确定高斯包，无势场', 'Minimum-uncertainty Gaussian packet, no potential', 'Gaußpaket minimaler Unschärfe, kein Potential')],
    validity: T('无界自由空间；数值求解的周期边界会回绕，吸收层会带走概率', 'Unbounded free space; the periodic boundary of a numerical solution wraps around and an absorber removes probability', 'Unbegrenzter freier Raum; der periodische Rand einer numerischen Lösung läuft um, eine Absorberschicht entfernt Wahrscheinlichkeit'),
    sources: ['S39', 'S43'],
    inputs: [num('x0', 'x_0', T('初始中心', 'Initial centre', 'Anfangszentrum'), -5), num('p0', 'p_0', T('平均动量', 'Mean momentum', 'Mittlerer Impuls'), 2), num('s0', '\\sigma_0', T('初始宽度', 'Initial width', 'Anfangsbreite'), 1, { min: 0, open: true }), num('t', 't', L.t, 2, { min: 0 }), num('m', 'm', T('质量（约化）', 'Mass (reduced)', 'Masse (reduziert)'), 1, { min: 0, open: true }), num('hb', '\\hbar', T('约化普朗克常数（约化）', 'Reduced Planck constant (reduced)', 'Reduziertes Wirkungsquantum (reduziert)'), 1, { min: 0, open: true })],
    outputs: [out('x', '\\langle x\\rangle', T('中心位置', 'Centre', 'Zentrum'), '', 'x0 + p0*t/m'), out('var', '\\sigma_x^2', T('位置方差', 'Variance of x', 'Varianz von x'), '', 's0^2 + hb^2*t^2/(4*m^2*s0^2)'), out('sx', '\\sigma_x', T('位置标准差', 'Standard deviation of x', 'Standardabweichung von x'), '', 'sqrt(s0^2 + hb^2*t^2/(4*m^2*s0^2))'), out('sp', '\\sigma_p', T('动量标准差（不变）', 'Standard deviation of p (constant)', 'Standardabweichung von p (konstant)'), '', 'hb/(2*s0)')],
    example: { text: T('最小不确定高斯包，约化单位 ℏ = m = 1，x0 = −5、p0 = 2、σ0 = 1，t = 2。', 'A minimum-uncertainty packet, ℏ = m = 1, x0 = −5, p0 = 2, σ0 = 1, t = 2.', 'Ein Paket minimaler Unschärfe, ℏ = m = 1, x0 = −5, p0 = 2, σ0 = 1, t = 2.'), answer: T('中心到达 −1；方差为 2，位置标准差 √2。', 'The centre reaches −1; the variance is 2, the standard deviation √2.', 'Das Zentrum erreicht −1; Varianz 2, Standardabweichung √2.') },
    point: T('概率流不是确定粒子轨迹；自由波包会展宽。', 'The probability current is no particle path; a free packet spreads.', 'Der Wahrscheinlichkeitsstrom ist keine Teilchenbahn; ein freies Paket zerfließt.'),
    status: 'verified', level: 3, teaching: 2, references: ['analytic', 'otherMethod'],
    benchmarks: ['oracle:Q08', 'test:loop3 quantumRun packet vs Q08 (σ(t), ⟨x⟩(t), norm) with grid and step convergence', 'test:loop3 absorber loss is reported apart from discretization error'],
    links: { activities: ['act-packet'] }, review: R2
  },
  {
    id: 'Q09', title: T('自旋与量子测量', 'Spin and quantum measurement', 'Spin und Quantenmessung'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('自旋 1/2，沿与制备方向夹角 θ 的轴测量；独立重复 N 次', 'Spin 1/2 measured along an axis at θ to the preparation; N independent repetitions', 'Spin 1/2, gemessen längs einer Achse unter θ zur Präparation; N unabhängige Wiederholungen')],
    validity: T('理想投影测量', 'Ideal projective measurement', 'Ideale projektive Messung'),
    sources: ['S43', 'S60'],
    inputs: [angle('th', '\\theta', T('测量轴与制备轴的夹角', 'Angle between measurement and preparation axes', 'Winkel zwischen Mess- und Präparationsachse'), Math.PI / 2, { min: 0, max: Math.PI }), pos('N', 'N', T('重复次数', 'Repetitions', 'Wiederholungen'), '', 'count', 1000)],
    outputs: [out('Pp', 'P_+', T('测得 +ℏ/2 的概率', 'Probability of +ℏ/2', 'Wahrscheinlichkeit für +ℏ/2'), '', 'cos(th/2)^2'), out('Pm', 'P_-', T('测得 −ℏ/2 的概率', 'Probability of −ℏ/2', 'Wahrscheinlichkeit für −ℏ/2'), '', 'sin(th/2)^2'), out('Np', '\\langle N_+\\rangle', T('期望次数', 'Expected count', 'Erwartete Anzahl'), '', 'N*cos(th/2)^2'), out('se', 'SE', T('比例的标准误差', 'Standard error of the fraction', 'Standardfehler des Anteils'), '', 'sqrt(cos(th/2)^2*sin(th/2)^2/N)')],
    example: { text: T('自旋 1/2 粒子制备为 z 向上，改沿 x 测量，重复 1000 次。', 'A spin-1/2 particle prepared up along z is measured along x, 1000 times.', 'Ein Spin-1/2-Teilchen, präpariert entlang z, wird 1000-mal entlang x gemessen.'), answer: T('两结果期望各 500 次；比例的理论标准误差约 0.01581。', '500 of each expected; the standard error of the fraction is about 0.01581.', 'Je 500 erwartet; Standardfehler des Anteils etwa 0,01581.') },
    point: T('测量基底决定概率；不能给单个粒子预填两个确定分量。', 'The measurement basis sets the probabilities; a single particle has no two definite components.', 'Die Messbasis bestimmt die Wahrscheinlichkeiten; ein Teilchen hat nicht zwei feste Komponenten.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:Q09'],
    links: {}, review: R2
  },
  {
    id: 'Q10', title: T('两能级与 Rabi 振荡', 'Two levels and Rabi oscillation', 'Zwei Niveaus und Rabi-Oszillation'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('旋转波近似，无退相干；Ω 为 Rabi 频率，Δ 为失谐', 'Rotating-wave approximation, no decoherence; Ω the Rabi frequency, Δ the detuning', 'Drehwellennäherung, keine Dekohärenz; Ω Rabi-Frequenz, Δ Verstimmung')],
    validity: T('Ω、Δ 远小于跃迁频率', 'Ω and Δ far below the transition frequency', 'Ω und Δ weit unter der Übergangsfrequenz'),
    sources: ['S43'],
    inputs: [pos('Om', '\\Omega', T('Rabi 角频率', 'Rabi angular frequency', 'Rabi-Kreisfrequenz'), 'rad/s', 'angularVelocity', 2), inp('De', '\\Delta', T('失谐（角频率）', 'Detuning (angular frequency)', 'Verstimmung (Kreisfrequenz)'), 'rad/s', 'angularVelocity', 0), nonneg('t', 't', L.t, 's', 'time', Math.PI / 2)],
    outputs: [out('Pe', 'P_e', T('激发态概率', 'Excited-state probability', 'Wahrscheinlichkeit des angeregten Zustands'), '', 'Om^2/(Om^2 + De^2)*sin(sqrt(Om^2 + De^2)*t/2)^2'), out('Pg', 'P_g', T('基态概率', 'Ground-state probability', 'Grundzustandswahrscheinlichkeit'), '', '1 - Om^2/(Om^2 + De^2)*sin(sqrt(Om^2 + De^2)*t/2)^2'), out('tpi', 't_\\pi', T('π 脉冲时长（共振）', 'π-pulse duration (on resonance)', 'Dauer eines π-Pulses (resonant)'), 's', 'pi/Om')],
    example: { text: T('共振且无退相干的两能级系统初在基态，Ω = 2 rad/s，t = π/2 s。', 'A resonant two-level system without decoherence starts in the ground state, Ω = 2 rad/s, t = π/2 s.', 'Ein resonantes Zweiniveausystem ohne Dekohärenz startet im Grundzustand, Ω = 2 rad/s, t = π/2 s.'), answer: T('P = sin²(π/2) = 1，为一个 π 脉冲。', 'P = sin²(π/2) = 1, a π pulse.', 'P = sin²(π/2) = 1, ein π-Puls.') },
    point: T('驱动、失谐和退相干是不同参数。', 'Drive, detuning and decoherence are different parameters.', 'Antrieb, Verstimmung und Dekohärenz sind verschiedene Parameter.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:Q10'],
    links: {}, review: R2
  },
  {
    id: 'Q11', title: T('纠缠与密度矩阵', 'Entanglement and the density matrix', 'Verschränkung und Dichtematrix'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'abstract',
    assumptions: [T('Bell 态 |Φ⁺⟩，两粒子在 x–z 平面内沿角度 a、b 测量', 'Bell state |Φ⁺⟩, both measured along angles a and b in the x–z plane', 'Bell-Zustand |Φ⁺⟩, Messung beider längs Winkeln a und b in der x-z-Ebene')],
    validity: T('受限解析：两量子比特 Bell 态', 'Restricted analytic: a two-qubit Bell state', 'Eingeschränkt analytisch: ein Bell-Zustand zweier Qubits'),
    restricted: T('Bell 态联合概率与约化熵；一般密度矩阵演化暂缓', 'Joint probabilities and reduced entropy of a Bell state; general density-matrix dynamics deferred', 'Verbundwahrscheinlichkeiten und reduzierte Entropie eines Bell-Zustands; allgemeine Dichtematrixdynamik zurückgestellt'),
    sources: ['S43'],
    inputs: [angle('a', 'a', T('粒子 A 的测量角', 'Measurement angle of A', 'Messwinkel von A'), 0), angle('b', 'b', T('粒子 B 的测量角', 'Measurement angle of B', 'Messwinkel von B'), 0)],
    outputs: [out('Psame', 'P_{++} + P_{--}', T('结果相同的概率', 'Probability of equal results', 'Wahrscheinlichkeit gleicher Ergebnisse'), '', 'cos((a - b)/2)^2'), out('P00', 'P_{++}', T('两者都为 +', 'Both +', 'Beide +'), '', 'cos((a - b)/2)^2/2'), out('P01', 'P_{+-}', T('A 为 +、B 为 −', 'A +, B −', 'A +, B −'), '', 'sin((a - b)/2)^2/2'), out('S', 'S_A', T('单粒子熵（nat）', 'Single-particle entropy (nat)', 'Einteilchenentropie (nat)'), '', 'ln(2)'), out('E', 'E(a,b)', T('关联函数', 'Correlation', 'Korrelation'), '', 'cos(a - b)')],
    example: { text: T('Bell 态在 z 基测量两粒子，求联合概率与单粒子熵。', 'Measure both particles of a Bell state in the z basis: joint probabilities and the single-particle entropy.', 'Beide Teilchen eines Bell-Zustands in der z-Basis messen: Verbundwahrscheinlichkeiten und Einteilchenentropie.'), answer: T('P00 = P11 = 1/2，P01 = P10 = 0；单粒子熵为 ln2 或 1 bit。', 'P00 = P11 = 1/2, P01 = P10 = 0; entropy ln 2, that is 1 bit.', 'P00 = P11 = 1/2, P01 = P10 = 0; Entropie ln 2, also 1 Bit.') },
    point: T('整体纯态可有混合约化态；相关性不等于可超光速通信。', 'A pure whole can have mixed parts; correlation is not faster-than-light signalling.', 'Ein reiner Gesamtzustand kann gemischte Teile haben; Korrelation ist keine überlichtschnelle Übertragung.'),
    status: 'verified', level: 1, teaching: 0, references: ['otherMethod'], benchmarks: ['oracle:Q11'],
    links: {}, review: R2
  },
  {
    id: 'Q12', title: T('微扰与变分近似', 'Perturbation and variational approximation', 'Störungsrechnung und Variationsverfahren'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'line1d',
    assumptions: [A.reduced, T('H = ½(p² + x²) + λx⁴；高斯试探态 ψ ∝ exp(−αx²/2)', 'H = ½(p² + x²) + λx⁴; Gaussian trial state ψ ∝ exp(−αx²/2)', 'H = ½(p² + x²) + λx⁴; Gaußscher Versuchszustand ψ ∝ exp(−αx²/2)')],
    validity: T('一阶微扰要求 λ 小；变分值是基态能量的上界', 'First order needs a small λ; the variational value is an upper bound', 'Erste Ordnung braucht kleines λ; der Variationswert ist eine obere Schranke'),
    restricted: T('一阶能量与高斯变分；收敛的数值谱作参照见量子实验室', 'First-order energy and Gaussian variation; the quantum lab’s converged spectrum is the reference', 'Energie erster Ordnung und Gaußsche Variation; das konvergierte Spektrum des Quantenlabors ist die Referenz'),
    sources: ['S43'],
    inputs: [num('lam', '\\lambda', T('非谐系数', 'Anharmonic coefficient', 'Anharmonischer Koeffizient'), 0.1, { min: 0 }), num('al', '\\alpha', T('试探参数', 'Trial parameter', 'Versuchsparameter'), 1, { min: 0, open: true })],
    conditions: [cond('weak', T('微扰弱（λ ≤ 0.1）', 'Weak perturbation (λ ≤ 0.1)', 'Schwache Störung (λ ≤ 0,1)'), 'lam <= 0.1', 'lam <= 0.3')],
    outputs: [out('E1', 'E_0^{(1)}', T('一阶微扰能量', 'First-order energy', 'Energie erster Ordnung'), '', '0.5 + 0.75*lam', { requires: ['weak'] }), out('Ea', 'E(\\alpha)', T('试探态能量期望', 'Energy of the trial state', 'Energie des Versuchszustands'), '', '(al + 1/al)/4 + 0.75*lam/al^2'), roots('aopt', '\\alpha^*', T('最优试探参数', 'Best trial parameter', 'Bester Versuchsparameter'), '', { var: 'x', f: '(1 - 1/x^2)/4 - 1.5*lam/x^3', lo: '0.5', hi: '20', accept: 'x > 0' })],
    example: { text: T('约化单位 ℏ = m = ω = 1，λ = 0.1，用未扰动基态做一阶或试探态。', 'Reduced units, λ = 0.1; the unperturbed ground state as first order or trial state.', 'Reduzierte Einheiten, λ = 0,1; der ungestörte Grundzustand als erste Ordnung oder Versuchszustand.'), answer: T('一阶能量 0.575；同一高斯试探态期望也为 0.575，作为变分值是上界。', 'First-order energy 0.575; the same Gaussian trial state also gives 0.575, an upper bound.', 'Energie erster Ordnung 0,575; derselbe Gaußsche Versuchszustand ergibt ebenfalls 0,575, eine obere Schranke.') },
    point: T('近似展开与变分上界的逻辑不同。', 'An expansion and a variational bound reason differently.', 'Reihenentwicklung und Variationsschranke argumentieren verschieden.'),
    status: 'verified', level: 1, teaching: 0, references: ['otherMethod'], benchmarks: ['oracle:Q12'],
    links: {}, review: R2
  },
  {
    id: 'Q13', title: T('费米与玻色统计', 'Fermi and Bose statistics', 'Fermi- und Bose-Statistik'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'abstract',
    assumptions: [T('理想量子气体单粒子态的平均占据数', 'Mean occupation of a single-particle state of an ideal quantum gas', 'Mittlere Besetzung eines Einteilchenzustands eines idealen Quantengases')],
    validity: T('玻色分布要求 E > μ', 'The Bose distribution needs E > μ', 'Die Bose-Verteilung braucht E > μ'),
    restricted: T('占据数；粒子数归一与凝聚暂缓', 'Occupations; normalization of the particle number and condensation deferred', 'Besetzungszahlen; Normierung der Teilchenzahl und Kondensation zurückgestellt'),
    sources: ['S44', 'S45'],
    inputs: [inp('E', 'E', T('能量', 'Energy', 'Energie'), 'J', 'energy', 0), inp('mu', '\\mu', T('化学势', 'Chemical potential', 'Chemisches Potential'), 'J', 'energy', 0), pos('kT', 'k_BT', T('热能', 'Thermal energy', 'Thermische Energie'), 'J', 'energy', 1)],
    conditions: [cond('boseOk', T('E > μ（玻色分布有定义）', 'E > μ (Bose distribution defined)', 'E > μ (Bose-Verteilung definiert)'), 'E > mu')],
    outputs: [out('nF', 'n_F', T('费米占据数', 'Fermi occupation', 'Fermi-Besetzung'), '', '1/(exp((E - mu)/kT) + 1)'), out('nB', 'n_B', T('玻色占据数', 'Bose occupation', 'Bose-Besetzung'), '', '1/(exp((E - mu)/kT) - 1)', { requires: ['boseOk'] }), out('nMB', 'n_{MB}', T('经典（麦克斯韦–玻尔兹曼）', 'Classical (Maxwell–Boltzmann)', 'Klassisch (Maxwell-Boltzmann)'), '', 'exp(-(E - mu)/kT)')],
    example: { text: T('T > 0，费米态 E = μ；另一玻色态满足 (E−μ)/(kBT) = ln2。', 'T > 0: a fermion state at E = μ; a boson state with (E − μ)/(kBT) = ln 2.', 'T > 0: ein Fermi-Zustand bei E = μ; ein Bose-Zustand mit (E − μ)/(kBT) = ln 2.'), answer: T('费米平均占据 1/2；玻色平均占据 1。', 'Fermion occupation 1/2; boson occupation 1.', 'Fermi-Besetzung 1/2; Bose-Besetzung 1.') },
    point: T('占据数不是单粒子波函数概率，Pauli 原理约束费米态。', 'Occupation is not a wave-function probability; Pauli’s principle bounds fermions.', 'Besetzung ist keine Aufenthaltswahrscheinlichkeit; das Pauli-Prinzip begrenzt Fermionen.'),
    status: 'verified', level: 1, teaching: 0, references: ['otherMethod'], benchmarks: ['oracle:Q13'],
    links: {}, review: R2
  },
  {
    id: 'Q14', title: T('晶格与紧束缚能带', 'Lattice and tight-binding band', 'Gitter und Tight-Binding-Band'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'line1d',
    assumptions: [T('一维最近邻链，格点能 ε0，跃迁参数 t_h', 'One-dimensional nearest-neighbour chain, on-site energy ε0, hopping t_h', 'Eindimensionale Kette mit nächsten Nachbarn, Platzenergie ε0, Hüpfen t_h')],
    validity: T('受限解析：无限链的色散；有限链本征值作对照', 'Restricted analytic: dispersion of an infinite chain; a finite chain’s eigenvalues as a check', 'Eingeschränkt analytisch: Dispersion der unendlichen Kette; Eigenwerte einer endlichen Kette als Kontrolle'),
    restricted: T('一维色散；态密度、填充与能隙暂缓', 'One-dimensional dispersion; density of states, filling and gaps deferred', 'Eindimensionale Dispersion; Zustandsdichte, Füllung und Lücken zurückgestellt'),
    sources: ['S40', 'S45'],
    inputs: [inp('e0', '\\varepsilon_0', T('格点能', 'On-site energy', 'Platzenergie'), 'J', 'energy', 0), pos('th', 't_h', T('跃迁参数', 'Hopping', 'Hüpfparameter'), 'J', 'energy', 1.602176634e-19), angle('ka', 'ka', T('波矢 × 晶格常数', 'Wave vector × lattice constant', 'Wellenvektor × Gitterkonstante'), Math.PI / 2, { min: -Math.PI, max: Math.PI })],
    outputs: [out('E', 'E(k)', T('能量', 'Energy', 'Energie'), 'J', 'e0 - 2*th*cos(ka)'), out('Emin', 'E_{\\min}', T('带底', 'Band bottom', 'Bandunterkante'), 'J', 'e0 - 2*th'), out('Emax', 'E_{\\max}', T('带顶', 'Band top', 'Bandoberkante'), 'J', 'e0 + 2*th'), out('W', 'W', T('带宽', 'Bandwidth', 'Bandbreite'), 'J', '4*th')],
    example: { text: T('一维最近邻链，ε0 = 0、跃迁参数 th = 1 eV。', 'A one-dimensional chain with ε0 = 0 and th = 1 eV.', 'Eine eindimensionale Kette mit ε0 = 0 und th = 1 eV.'), answer: T('带边为 −2 与 2 eV，带宽 4 eV；k = π/(2a) 时 E = 0。', 'Band edges −2 and 2 eV, width 4 eV; E = 0 at k = π/(2a).', 'Bandkanten −2 und 2 eV, Breite 4 eV; E = 0 bei k = π/(2a).') },
    point: T('周期性和边界条件形成能带；不是把孤立原子能级简单连线。', 'Periodicity and boundaries form bands; not just joining atomic levels.', 'Periodizität und Ränder bilden Bänder; nicht bloß verbundene Atomniveaus.'),
    status: 'verified', level: 1, teaching: 0, references: ['otherMethod'], benchmarks: ['oracle:Q14'],
    links: {}, review: R2
  }
]
