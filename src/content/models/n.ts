/**
 * N01–N12: nuclear physics and an introduction to particles (blueprint §5.10; doc 02 §10). Mass excesses and
 * energies are entered in J (shown in MeV); data values carry their data set (AME2020) in the inputs' labels.
 */
import type { ModelSpec } from './types'
import { L, T, cond, inp, let_, nonneg, out, pos } from './dsl'

const R2 = { physics: '2026-10-28', language: '2026-10-28' }
const MeV = 1.602176634e-13
const mev = (id: string, symbol: string, label: ReturnType<typeof T>, valueMeV: number, more = {}) => inp(id, symbol, label, 'J', 'energy', valueMeV * MeV, more)

export const MODELS_N: ModelSpec[] = [
  {
    id: 'N01', title: T('放射性衰变与半衰期', 'Radioactive decay and half-life', 'Radioaktiver Zerfall und Halbwertszeit'),
    stages: ['s'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('核素独立随机衰变；N(t) 是期望值', 'Nuclei decay independently and at random; N(t) is the expected value', 'Kerne zerfallen unabhängig und zufällig; N(t) ist der Erwartungswert')],
    validity: T('单次实验的剩余数围绕期望值起伏（二项分布）', 'The count left in one experiment scatters around the expectation (binomial)', 'Der Rest in einem Experiment streut um den Erwartungswert (binomial)'),
    sources: ['S41', 'S60'],
    inputs: [pos('N0', 'N_0', L.N0, '', 'count', 1600), pos('Th', 'T_{1/2}', L.halfLife, 's', 'time', 4), nonneg('t', 't', L.t, 's', 'time', 12)],
    lets: [let_('p', 'p', T('单个核存活概率', 'Survival probability of one nucleus', 'Überlebenswahrscheinlichkeit eines Kerns'), '', '2^(-t/Th)')],
    outputs: [out('lam', '\\lambda', T('衰变常数', 'Decay constant', 'Zerfallskonstante'), '1/s', 'ln(2)/Th'), out('N', '\\langle N\\rangle', T('期望剩余数', 'Expected number left', 'Erwartete Restanzahl'), '', 'N0*p'), out('A', 'A', T('活度', 'Activity', 'Aktivität'), 'Bq', 'ln(2)/Th*N0*p'), out('sd', '\\sigma_N', T('剩余数的标准差（二项）', 'Standard deviation of the count (binomial)', 'Standardabweichung der Anzahl (binomial)'), '', 'sqrt(N0*p*(1 - p))')],
    example: { text: T('教学核素 N0 = 1600，半衰期 4 s，求 12 s 的期望剩余量。', 'A teaching nuclide, N0 = 1600, half-life 4 s: the expected number after 12 s.', 'Ein Unterrichtsnuklid, N0 = 1600, Halbwertszeit 4 s: erwartete Anzahl nach 12 s.'), answer: T('经过三个半衰期，期望 N = 200；此时活度约 34.6574 Bq。', 'Three half-lives: expected N = 200; activity about 34.6574 Bq.', 'Drei Halbwertszeiten: erwartet N = 200; Aktivität etwa 34,6574 Bq.') },
    point: T('单个衰变随机，指数律描述群体期望。', 'Single decays are random; the exponential law describes the expectation.', 'Einzelne Zerfälle sind zufällig; das Exponentialgesetz beschreibt den Erwartungswert.'),
    status: 'verified', level: 3, teaching: 2, references: ['analytic', 'otherMethod'],
    benchmarks: ['oracle:N01', 'test:loop3 decay Monte Carlo: fixed seed regression and many-seed distribution (mean, variance, χ²)', 'rust:src/labs/decay.rs counts_follow_the_law_within_three_sigma'],
    links: { activities: ['act-decay'] }, review: R2
  },
  {
    id: 'N02', title: T('衰变链与简并寿命', 'Decay chains and equal lifetimes', 'Zerfallsketten und gleiche Lebensdauern'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('链 1 → 2 → 3（稳定），初始只有 1', 'Chain 1 → 2 → 3 (stable), only 1 present at first', 'Kette 1 → 2 → 3 (stabil), anfangs nur 1')],
    validity: T('相等衰变常数时取解析极限（不能除以 λ2 − λ1）', 'For equal constants use the analytic limit (no division by λ2 − λ1)', 'Bei gleichen Konstanten den analytischen Grenzwert nehmen (keine Division durch λ2 − λ1)'),
    sources: ['S41', 'S55', 'S75'],
    inputs: [pos('N10', 'N_{1,0}', T('母核初始数', 'Initial parent number', 'Anfangszahl der Mutterkerne'), '', 'count', 100), pos('l1', '\\lambda_1', T('母核衰变常数', 'Decay constant of the parent', 'Zerfallskonstante der Mutter'), '1/s', 'rate', Math.LN2), pos('l2', '\\lambda_2', T('子核衰变常数', 'Decay constant of the daughter', 'Zerfallskonstante der Tochter'), '1/s', 'rate', Math.LN2), nonneg('t', 't', L.t, 's', 'time', 1)],
    conditions: [cond('equal', T('两衰变常数相等', 'Equal decay constants', 'Gleiche Zerfallskonstanten'), 'abs(l2 - l1) <= 1e-9*l1'), cond('distinct', T('两衰变常数不同', 'Different decay constants', 'Verschiedene Zerfallskonstanten'), 'abs(l2 - l1) > 1e-9*l1')],
    outputs: [
      out('N1', 'N_1', T('母核数', 'Parent number', 'Anzahl der Mutterkerne'), '', 'N10*exp(-l1*t)'),
      out('N2', 'N_2', T('子核数', 'Daughter number', 'Anzahl der Tochterkerne'), '', 'N10*l1*t*exp(-l1*t)', { when: 'equal', branch: T('相等常数（极限式）', 'Equal constants (limit)', 'Gleiche Konstanten (Grenzwert)') }),
      out('N2', 'N_2', T('子核数', 'Daughter number', 'Anzahl der Tochterkerne'), '', 'N10*l1/(l2 - l1)*(exp(-l1*t) - exp(-l2*t))', { when: 'distinct', branch: T('不同常数（Bateman）', 'Different constants (Bateman)', 'Verschiedene Konstanten (Bateman)') }),
      out('N3', 'N_3', T('稳定末项数', 'Stable end product', 'Stabiles Endprodukt'), '', 'N10*(1 - exp(-l1*t) - l1*t*exp(-l1*t))', { when: 'equal' }),
      out('N3', 'N_3', T('稳定末项数', 'Stable end product', 'Stabiles Endprodukt'), '', 'N10*(1 - exp(-l1*t) - l1/(l2 - l1)*(exp(-l1*t) - exp(-l2*t)))', { when: 'distinct' })
    ],
    example: { text: T('链 1→2→稳定 3，前两项 λ 均为 ln2 s⁻¹，N10 = 100、其余为 0，t = 1 s。', 'Chain 1 → 2 → stable 3, both λ = ln 2 s⁻¹, N10 = 100, the rest 0, t = 1 s.', 'Kette 1 → 2 → stabil 3, beide λ = ln 2 s⁻¹, N10 = 100, sonst 0, t = 1 s.'), answer: T('N1 = 50，N2 = 34.6574，N3 = 15.3426；总量 100。', 'N1 = 50, N2 = 34.6574, N3 = 15.3426; total 100.', 'N1 = 50, N2 = 34,6574, N3 = 15,3426; Summe 100.') },
    point: T('相等衰变常数要取解析极限，不能直接除以 λ2−λ1。', 'Equal decay constants need the analytic limit, not a division by λ2 − λ1.', 'Gleiche Zerfallskonstanten brauchen den analytischen Grenzwert, keine Division durch λ2 − λ1.'),
    status: 'verified', level: 3, teaching: 2, references: ['analytic', 'otherMethod'],
    benchmarks: ['oracle:N02', 'test:loop3 decayChain vs N02 (equal and nearly equal constants, total conserved)', 'rust:src/labs/nuclear.rs bateman_chains'],
    links: { activities: ['act-chain'] }, review: R2
  },
  {
    id: 'N03', title: T('核反应配平与 Q 值', 'Balancing nuclear reactions and the Q value', 'Kernreaktionen ausgleichen und der Q-Wert'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('α 衰变 X → Y + ⁴He，用原子质量过剩（AME2020，给定值有舍入）', 'Alpha decay X → Y + ⁴He with atomic mass excesses (AME2020; the given values are rounded)', 'Alphazerfall X → Y + ⁴He mit atomaren Massenüberschüssen (AME2020; die Werte sind gerundet)')],
    validity: T('核子数与电荷守恒（只配平 A 与 Z）；β± 与轻子另有规则', 'Nucleon number and charge conserved (balances A and Z only); β± and leptons have further rules', 'Nukleonenzahl und Ladung erhalten (nur A und Z); β± und Leptonen haben weitere Regeln'),
    sources: ['S41', 'S73', 'S74'],
    inputs: [pos('A0', 'A_X', T('母核质量数', 'Mass number of the parent', 'Massenzahl der Mutter'), '', 'count', 238), pos('Z0', 'Z_X', T('母核电荷数', 'Charge number of the parent', 'Ladungszahl der Mutter'), '', 'count', 92), pos('A1', 'A_Y', T('子核质量数', 'Mass number of the daughter', 'Massenzahl der Tochter'), '', 'count', 234), pos('Z1', 'Z_Y', T('子核电荷数', 'Charge number of the daughter', 'Ladungszahl der Tochter'), '', 'count', 90), mev('D0', '\\Delta_X', T('母核质量过剩', 'Mass excess of the parent', 'Massenüberschuss der Mutter'), 47.309), mev('D1', '\\Delta_Y', T('子核质量过剩', 'Mass excess of the daughter', 'Massenüberschuss der Tochter'), 40.615), mev('Da', '\\Delta_\\alpha', T('⁴He 质量过剩', 'Mass excess of ⁴He', 'Massenüberschuss von ⁴He'), 2.424916)],
    conditions: [cond('balanced', T('核子数与电荷配平', 'Nucleon number and charge balance', 'Nukleonenzahl und Ladung ausgeglichen'), 'abs(A0 - A1 - 4) < 0.5 && abs(Z0 - Z1 - 2) < 0.5')],
    outputs: [out('Q', 'Q', T('Q 值', 'Q value', 'Q-Wert'), 'J', 'D0 - D1 - Da', { requires: ['balanced'] }), out('Ka', 'E_\\alpha', T('α 粒子动能（两体，非相对论）', 'Kinetic energy of the alpha (two-body, non-relativistic)', 'Kinetische Energie des Alphas (Zweikörper, nichtrelativistisch)'), 'J', '(D0 - D1 - Da)*A1/(A1 + 4)', { requires: ['balanced'] })],
    example: { text: T('238U→234Th+4He，给定原子质量过剩分别 47.309、40.615、2.424916 MeV。', '²³⁸U → ²³⁴Th + ⁴He with mass excesses 47.309, 40.615 and 2.424916 MeV.', '²³⁸U → ²³⁴Th + ⁴He mit Massenüberschüssen 47,309, 40,615 und 2,424916 MeV.'), answer: T('核子数 238 = 234 + 4，电荷 92 = 90 + 2；Q = 4.269084 MeV。', 'Nucleons 238 = 234 + 4, charge 92 = 90 + 2; Q = 4.269084 MeV.', 'Nukleonen 238 = 234 + 4, Ladung 92 = 90 + 2; Q = 4,269084 MeV.') },
    point: T('用原子质量还是核质量必须一致；配平不是只看方程排版。', 'Atomic or nuclear masses must be used consistently; balancing is more than layout.', 'Atom- oder Kernmassen konsequent verwenden; Ausgleichen ist mehr als die Schreibweise.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'experiment'], benchmarks: ['oracle:N03', 'rust:src/labs/nuclear.rs textbook_q_values', 'test:particles2656 reaction validator scope'],
    links: {}, review: R2
  },
  {
    id: 'N04', title: T('质量亏损与结合能', 'Mass defect and binding energy', 'Massendefekt und Bindungsenergie'),
    stages: ['s'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('B = ZΔ(¹H) + NΔ(n) − Δ(原子)，质量过剩取 AME2020', 'B = ZΔ(¹H) + NΔ(n) − Δ(atom), mass excesses from AME2020', 'B = ZΔ(¹H) + NΔ(n) − Δ(Atom), Massenüberschüsse aus AME2020')],
    validity: T('表值与半经验估计分开标记', 'Table values and semi-empirical estimates are marked apart', 'Tabellenwerte und halbempirische Schätzungen werden getrennt gekennzeichnet'),
    sources: ['S73', 'S74'],
    inputs: [pos('Z', 'Z', T('质子数', 'Protons', 'Protonen'), '', 'count', 1), nonneg('N', 'N', T('中子数', 'Neutrons', 'Neutronen'), '', 'count', 1), mev('DH', '\\Delta_H', T('¹H 质量过剩', 'Mass excess of ¹H', 'Massenüberschuss von ¹H'), 7.288971), mev('Dn', '\\Delta_n', T('中子质量过剩', 'Mass excess of the neutron', 'Massenüberschuss des Neutrons'), 8.071318), mev('Da', '\\Delta', T('原子质量过剩', 'Mass excess of the atom', 'Massenüberschuss des Atoms'), 13.135722)],
    outputs: [out('B', 'B', T('结合能', 'Binding energy', 'Bindungsenergie'), 'J', 'Z*DH + N*Dn - Da'), out('BA', 'B/A', T('比结合能', 'Binding energy per nucleon', 'Bindungsenergie pro Nukleon'), 'J', '(Z*DH + N*Dn - Da)/(Z + N)')],
    example: { text: T('氘的 ΔH = 7.288971、Δn = 8.071318、ΔD = 13.135722，单位 MeV。', 'Deuterium: ΔH = 7.288971, Δn = 8.071318, ΔD = 13.135722 MeV.', 'Deuterium: ΔH = 7,288971, Δn = 8,071318, ΔD = 13,135722 MeV.'), answer: T('总结合能 2.224567 MeV；每核子 1.1122835 MeV。', 'Binding energy 2.224567 MeV; 1.1122835 MeV per nucleon.', 'Bindungsenergie 2,224567 MeV; 1,1122835 MeV pro Nukleon.') },
    point: T('稳定性由总能量比较，不能只数质子中子。', 'Stability is a comparison of energies, not of counts of protons and neutrons.', 'Stabilität ist ein Energievergleich, kein Zählen von Protonen und Neutronen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'experiment'], benchmarks: ['oracle:N04', 'rust:src/labs/nuclear.rs textbook_q_values'],
    links: {}, review: R2
  },
  {
    id: 'N05', title: T('卢瑟福散射', 'Rutherford scattering', 'Rutherford-Streuung'),
    stages: ['u'], priority: 'P2', geometry: 'plane',
    assumptions: [T('纯库仑力，重靶不反冲，非相对论', 'Pure Coulomb force, heavy target without recoil, non-relativistic', 'Reine Coulomb-Kraft, schweres Ziel ohne Rückstoß, nichtrelativistisch')],
    validity: T('最近距离大于核半径', 'Closest approach outside the nucleus', 'Kleinster Abstand außerhalb des Kerns'),
    sources: ['S24', 'S41'],
    inputs: [mev('E', 'E', T('α 粒子动能', 'Kinetic energy of the alpha', 'Kinetische Energie des Alphas'), 5), pos('z', 'z', T('入射粒子电荷数', 'Charge number of the projectile', 'Ladungszahl des Geschosses'), '', 'count', 2), pos('Zt', 'Z', T('靶核电荷数', 'Charge number of the target', 'Ladungszahl des Ziels'), '', 'count', 79), pos('b', 'b', T('碰撞参数', 'Impact parameter', 'Stoßparameter'), 'm', 'length', 100e-15), pos('Rn', 'R_n', T('核半径（约）', 'Nuclear radius (approx.)', 'Kernradius (ca.)'), 'm', 'length', 7e-15)],
    lets: [let_('kq', 'k_e zZe^2', T('库仑强度', 'Coulomb strength', 'Coulomb-Stärke'), 'J·m', 'k_e*z*Zt*e_charge^2')],
    conditions: [cond('outside', T('最近距离在核外', 'Closest approach outside the nucleus', 'Kleinster Abstand außerhalb des Kerns'), 'kq/(2*E)*(1 + sqrt(1 + (2*E*b/kq)^2)) > Rn')],
    outputs: [out('th', '\\theta', T('散射角', 'Scattering angle', 'Streuwinkel'), 'rad', '2*atan(kq/(2*E*b))', { requires: ['outside'] }), out('rmin', 'r_{\\min}', T('最近距离', 'Distance of closest approach', 'Kleinster Abstand'), 'm', 'kq/(2*E)*(1 + sqrt(1 + (2*E*b/kq)^2))')],
    example: { text: T('α 粒子 E = 5 MeV，重靶 Z = 79，碰撞参数 b = 100 fm（CODATA 常数）。', 'An alpha with E = 5 MeV, heavy target Z = 79, impact parameter 100 fm (CODATA constants).', 'Ein Alpha mit E = 5 MeV, schweres Ziel Z = 79, Stoßparameter 100 fm (Konstanten nach CODATA).'), answer: T('tan(θ/2) ≈ 0.22751；散射角约 25.634°（文档以 ke·e² = 1.44 MeV·fm 圆整得 25.6355°）。', 'tan(θ/2) ≈ 0.22751; about 25.634° (the document’s rounded k_e e² = 1.44 MeV·fm gives 25.6355°).', 'tan(θ/2) ≈ 0,22751; etwa 25,634° (mit gerundetem k_e e² = 1,44 MeV·fm 25,6355°).') },
    point: T('由散射反推相互作用模型；重靶和纯库仑有适用域。', 'Scattering reveals the interaction; heavy target and pure Coulomb have limits.', 'Streuung verrät die Wechselwirkung; schweres Ziel und reine Coulomb-Kraft haben Grenzen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:N05', 'rust:tests/electric.rs coulomb_scattering_conserves_energy'],
    links: { situations: ['coulomb'] }, review: R2
  },
  {
    id: 'N06', title: T('射线衰减与相互作用', 'Attenuation of radiation', 'Schwächung von Strahlung'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('单能窄束，线性衰减系数 μ', 'Monoenergetic narrow beam, linear attenuation coefficient μ', 'Monoenergetischer schmaler Strahl, linearer Schwächungskoeffizient μ')],
    validity: T('不含散射累积（积累因子）与能谱变化', 'No build-up from scattering and no spectral change', 'Ohne Aufbau durch Streuung und ohne Spektraländerung'),
    sources: ['S41', 'S59', 'S60'],
    inputs: [pos('mu', '\\mu', T('线性衰减系数', 'Linear attenuation coefficient', 'Linearer Schwächungskoeffizient'), '1/m', 'wavenumber', 20), nonneg('x', 'x', T('厚度', 'Thickness', 'Dicke'), 'm', 'length', 0.05)],
    outputs: [out('frac', 'I/I_0', T('透射比例', 'Transmitted fraction', 'Durchgelassener Anteil'), '', 'exp(-mu*x)'), out('hvl', 'x_{1/2}', T('半值层', 'Half-value layer', 'Halbwertsschicht'), 'm', 'ln(2)/mu')],
    example: { text: T('单能窄束，线性衰减系数 μ = 0.2 cm⁻¹，厚度 5 cm。', 'A narrow monoenergetic beam, μ = 0.2 cm⁻¹, thickness 5 cm.', 'Schmaler monoenergetischer Strahl, μ = 0,2 cm⁻¹, Dicke 5 cm.'), answer: T('透射比例 e⁻¹ = 0.367879；半值层 3.46574 cm。', 'Transmitted fraction e⁻¹ = 0.367879; half-value layer 3.46574 cm.', 'Durchgelassen e⁻¹ = 0,367879; Halbwertsschicht 3,46574 cm.') },
    point: T('几何、散射累积和能谱会改变探测到的强度。', 'Geometry, scattering build-up and the spectrum change the detected intensity.', 'Geometrie, Streuaufbau und Spektrum ändern die gemessene Intensität.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:N06'],
    links: {}, review: R2
  },
  {
    id: 'N07', title: T('探测计数与泊松统计', 'Counting and Poisson statistics', 'Zählstatistik nach Poisson'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('独立等时测量，计数服从泊松分布', 'Independent measurements of equal duration, Poisson counts', 'Unabhängige Messungen gleicher Dauer, Poisson-verteilte Zählungen')],
    validity: T('正态近似要求计数 ≥ 20；低计数用专门置信区间', 'The normal approximation needs ≥ 20 counts; low counts need special intervals', 'Die Normalnäherung braucht ≥ 20 Zählungen; wenige Zählungen brauchen besondere Intervalle'),
    sources: ['S60', 'S80'],
    inputs: [nonneg('Ns', 'N_s', T('总计数', 'Total counts', 'Gesamtzählungen'), '', 'count', 1100), nonneg('Nb', 'N_b', T('本底计数', 'Background counts', 'Untergrundzählungen'), '', 'count', 100)],
    conditions: [cond('many', T('计数足够（各 ≥ 20）', 'Enough counts (≥ 20 each)', 'Genug Zählungen (je ≥ 20)'), 'Ns >= 20 && Nb >= 20')],
    outputs: [out('net', 'N_s - N_b', T('净计数', 'Net counts', 'Nettozählungen'), '', 'Ns - Nb'), out('u', 'u', T('净计数的标准不确定度', 'Standard uncertainty of the net counts', 'Standardunsicherheit der Nettozählungen'), '', 'sqrt(Ns + Nb)', { requires: ['many'] }), out('rel', 'u/N', T('相对不确定度', 'Relative uncertainty', 'Relative Unsicherheit'), '', 'sqrt(Ns + Nb)/(Ns - Nb)', { requires: ['many'] })],
    example: { text: T('独立等时测量总计数 1100、背景 100。', 'Independent equal-time measurements: 1100 counts in total, 100 background.', 'Unabhängige Messungen gleicher Dauer: 1100 Zählungen insgesamt, 100 Untergrund.'), answer: T('净计数 1000，标准不确定度 √1200 = 34.6410；相对约 3.46%。', 'Net 1000, standard uncertainty √1200 = 34.6410; about 3.46 % relative.', 'Netto 1000, Standardunsicherheit √1200 = 34,6410; relativ etwa 3,46 %.') },
    point: T('背景扣除会增加方差；探测效率和死时间另有校正。', 'Subtracting background adds variance; efficiency and dead time need further corrections.', 'Untergrundabzug erhöht die Varianz; Effizienz und Totzeit brauchen weitere Korrekturen.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:N07'],
    links: {}, review: R2
  },
  {
    id: 'N08', title: T('活度 吸收剂量与单位', 'Activity, absorbed dose and units', 'Aktivität, Energiedosis und Einheiten'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('只作单位练习：吸收剂量 = 沉积能量 / 质量', 'Units exercise only: absorbed dose = energy deposited / mass', 'Nur Einheitenübung: Energiedosis = deponierte Energie / Masse')],
    validity: T('不用于个体剂量决策；Sv 需明确定义加权方案', 'Not for decisions about personal doses; Sv needs a stated weighting', 'Nicht für Entscheidungen über persönliche Dosen; Sv braucht eine festgelegte Wichtung'),
    sources: ['S01', 'S41'],
    inputs: [nonneg('E', 'E_{dep}', T('沉积能量', 'Energy deposited', 'Deponierte Energie'), 'J', 'energy', 1e-6), pos('m', 'm', T('介质质量', 'Mass of the medium', 'Masse des Mediums'), 'kg', 'mass', 0.01)],
    outputs: [out('D', 'D', T('吸收剂量', 'Absorbed dose', 'Energiedosis'), 'Gy', 'E/m')],
    example: { text: T('仅作单位练习：0.01 kg 介质吸收能量 10⁻⁶ J。', 'A units exercise only: 0.01 kg absorbs 10⁻⁶ J.', 'Nur eine Einheitenübung: 0,01 kg nehmen 10⁻⁶ J auf.'), answer: T('吸收剂量 10⁻⁴ Gy，即 0.1 mGy；不能仅由这个数换算活度或有效剂量。', 'Absorbed dose 10⁻⁴ Gy, that is 0.1 mGy; this alone gives neither activity nor effective dose.', 'Energiedosis 10⁻⁴ Gy, also 0,1 mGy; daraus folgen weder Aktivität noch effektive Dosis.') },
    point: T('Bq、Gy、Sv 表示不同物理或加权量。', 'Bq, Gy and Sv are different physical or weighted quantities.', 'Bq, Gy und Sv sind verschiedene physikalische oder gewichtete Größen.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:N08'],
    links: {}, review: R2
  },
  {
    id: 'N09', title: T('分支过程与链式反应思想', 'Branching processes and the idea of a chain reaction', 'Verzweigungsprozesse und die Idee der Kettenreaktion'),
    stages: ['s', 'u'], priority: 'P3', geometry: 'abstract',
    assumptions: [T('纯抽象分支模型：每代平均繁殖数 k', 'Purely abstract branching model: mean offspring k per generation', 'Rein abstraktes Verzweigungsmodell: mittlere Nachkommenzahl k pro Generation')],
    validity: T('受限解析：期望值，不含材料与几何，不是反应堆计算', 'Restricted analytic: the expectation, without materials or geometry; not a reactor calculation', 'Eingeschränkt analytisch: der Erwartungswert ohne Material und Geometrie; keine Reaktorrechnung'),
    restricted: T('期望与临界分类；随机实现与灭绝概率暂缓', 'Expectation and criticality; random realizations and extinction probability deferred', 'Erwartungswert und Kritikalität; Zufallsrealisierungen und Aussterbewahrscheinlichkeit zurückgestellt'),
    sources: ['S41', 'S60'],
    inputs: [pos('N0', 'N_0', L.N0, '', 'count', 100), nonneg('k', 'k', T('平均繁殖数', 'Mean offspring number', 'Mittlere Nachkommenzahl'), '', 'ratio', 0.8), nonneg('g', 'g', T('代数', 'Generations', 'Generationen'), '', 'count', 5)],
    conditions: [cond('sub', T('亚临界（k < 1）', 'Subcritical (k < 1)', 'Unterkritisch (k < 1)'), 'k < 1')],
    outputs: [out('N', '\\mathbb{E}[N_g]', T('期望数目', 'Expected number', 'Erwartete Anzahl'), '', 'N0*k^g'), out('total', '\\mathbb{E}[\\sum N]', T('全部后代期望总数（亚临界）', 'Expected total of all generations (subcritical)', 'Erwartete Gesamtzahl aller Generationen (unterkritisch)'), '', 'N0/(1 - k)', { requires: ['sub'] })],
    example: { text: T('纯抽象分支模型 N0 = 100，平均繁殖数 k = 0.8，求五代后的期望。', 'An abstract branching model with N0 = 100 and k = 0.8: the expectation after five generations.', 'Ein abstraktes Verzweigungsmodell mit N0 = 100 und k = 0,8: Erwartungswert nach fünf Generationen.'), answer: T('期望为 100×0.8⁵ = 32.768，不是某次实现的整数计数。', 'Expectation 100×0.8⁵ = 32.768, not the integer count of one realization.', 'Erwartungswert 100×0,8⁵ = 32,768, keine ganze Zahl einer Realisierung.') },
    point: T('亚临界、临界、超临界是平均演化分类；随机过程仍可能灭绝。', 'Sub-, super- and criticality describe the mean; a random process can still die out.', 'Unter-, über- und kritisch beschreiben den Mittelwert; ein Zufallsprozess kann trotzdem aussterben.'),
    status: 'verified', level: 1, teaching: 0, references: ['otherMethod'], benchmarks: ['oracle:N09'],
    links: {}, review: R2
  },
  {
    id: 'N10', title: T('聚变与恒星能源', 'Fusion and stellar energy', 'Kernfusion und Sternenergie'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('Q = Δm·c²，Δm 为初末态质量差（u）', 'Q = Δm·c² with the mass difference of initial and final states (in u)', 'Q = Δm·c² mit der Massendifferenz von Anfangs- und Endzustand (in u)')],
    validity: T('Q 不决定反应速率；质量差应按选定质量表重算', 'Q does not set the rate; recompute the mass difference from the chosen table', 'Q bestimmt nicht die Rate; Massendifferenz aus der gewählten Tabelle neu berechnen'),
    sources: ['S41', 'S74', 'S47'],
    inputs: [inp('dm', '\\Delta m', T('质量亏损', 'Mass defect', 'Massendefekt'), 'kg', 'mass', 0.01888 * 1.66053906892e-27)],
    outputs: [out('Q', 'Q', T('释放能量', 'Energy released', 'Freigesetzte Energie'), 'J', 'dm*c_light^2')],
    example: { text: T('以 D + T → ⁴He + n 为例，给定本算例质量亏损 0.01888 u。', 'D + T → ⁴He + n with a given mass defect of 0.01888 u.', 'D + T → ⁴He + n mit gegebenem Massendefekt 0,01888 u.'), answer: T('Q ≈ 17.5866 MeV；质量亏损经舍入，精确值应按选定质量表重算。', 'Q ≈ 17.5866 MeV; the mass defect is rounded, recompute from the chosen table for precision.', 'Q ≈ 17,5866 MeV; der Massendefekt ist gerundet, für Genauigkeit aus der gewählten Tabelle neu rechnen.') },
    point: T('能量来自初末态质量差，放热不等于反应自动发生。', 'The energy comes from the mass difference; releasing energy does not make the reaction happen by itself.', 'Die Energie stammt aus der Massendifferenz; Energiefreisetzung heißt nicht, dass die Reaktion von selbst abläuft.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'experiment'], benchmarks: ['oracle:N10', 'rust:src/labs/nuclear.rs textbook_q_values'],
    links: {}, review: R2
  },
  {
    id: 'N11', title: T('粒子目录与守恒选择', 'Particle catalogue and conservation rules', 'Teilchenkatalog und Erhaltungsregeln'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'abstract',
    assumptions: [T('自由中子 β⁻ 衰变 n → p + e⁻ + ν̄ₑ；静能取所选常数集', 'Free-neutron β⁻ decay n → p + e⁻ + ν̄ₑ; rest energies from the constant set', 'Zerfall des freien Neutrons n → p + e⁻ + ν̄ₑ; Ruheenergien aus dem Konstantensatz')],
    validity: T('受限：动能可分配量；守恒规则（电荷、重子数、轻子数）由独立的粒子过程校验器检查', 'Restricted: the kinetic energy available; the conservation rules (charge, baryon and lepton numbers) are checked by the separate particle-process checker', 'Eingeschränkt: verfügbare kinetische Energie; Erhaltungsregeln (Ladung, Baryonen- und Leptonenzahl) prüft der eigene Teilchenprozess-Prüfer'),
    restricted: T('能量阈值与守恒规则（粒子过程校验器）；截面与动力学暂缓', 'Energy threshold and conservation rules (particle-process checker); cross-sections and dynamics deferred', 'Energieschwelle und Erhaltungsregeln (Teilchenprozess-Prüfer); Wirkungsquerschnitte und Dynamik zurückgestellt'),
    sources: ['S41', 'S43', 'S59'],
    inputs: [mev('mnu', 'm_\\nu c^2', T('中微子静能（假设值，通常取 0）', 'Neutrino rest energy (assumed, usually 0)', 'Ruheenergie des Neutrinos (angenommen, meist 0)'), 0, { min: 0 })],
    conditions: [cond('allowed', T('能量上允许（Q ≥ 0）', 'Energetically allowed (Q ≥ 0)', 'Energetisch erlaubt (Q ≥ 0)'), '(m_n - m_p - m_e)*c_light^2 - mnu >= 0')],
    outputs: [out('K', 'E_k', T('可分配总动能', 'Kinetic energy available', 'Verfügbare kinetische Energie'), 'J', '(m_n - m_p - m_e)*c_light^2 - mnu', { requires: ['allowed'] }), out('dmc2', '(m_n - m_p)c^2', T('中子与质子静能差', 'Rest-energy difference of neutron and proton', 'Ruheenergiedifferenz von Neutron und Proton'), 'J', '(m_n - m_p)*c_light^2')],
    example: { text: T('自由中子 β⁻ 衰变，给定中子与质子静能差 1.2933 MeV，电子静能 0.5110 MeV。', 'Free-neutron β⁻ decay with the neutron–proton difference 1.2933 MeV and the electron rest energy 0.5110 MeV.', 'Zerfall des freien Neutrons mit Neutron-Proton-Differenz 1,2933 MeV und Elektronenruheenergie 0,5110 MeV.'), answer: T('可分配总动能约 0.7823 MeV；电荷 0 = +1−1，电子轻子数 0 = +1−1。', 'About 0.7823 MeV of kinetic energy; charge 0 = +1 − 1, electron lepton number 0 = +1 − 1.', 'Etwa 0,7823 MeV kinetische Energie; Ladung 0 = +1 − 1, Elektron-Leptonenzahl 0 = +1 − 1.') },
    point: T('只检验 A 和 Z 不足以构成一般粒子反应校验。', 'Checking only A and Z does not make a general particle-process check.', 'Nur A und Z zu prüfen ist keine allgemeine Prüfung von Teilchenprozessen.'),
    status: 'verified', level: 1, teaching: 0, references: ['analytic', 'experiment'], benchmarks: ['oracle:N11', 'test:particles2656 conservation rules'],
    links: { labs: ['nuclear'] }, review: R2
  },
  {
    id: 'N12', title: T('核素图与数据溯源', 'Chart of nuclides and data provenance', 'Nuklidkarte und Datenherkunft'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('核素由 Z 与 A 确定', 'A nuclide is fixed by Z and A', 'Ein Nuklid ist durch Z und A bestimmt')],
    validity: T('A ≥ Z ≥ 1；质量、寿命与衰变支路来自评估数据', 'A ≥ Z ≥ 1; masses, lifetimes and branches come from evaluated data', 'A ≥ Z ≥ 1; Massen, Lebensdauern und Zerfallszweige stammen aus evaluierten Daten'),
    sources: ['S75', 'S76', 'S74'],
    inputs: [pos('Z', 'Z', T('质子数', 'Protons', 'Protonen'), '', 'count', 6), pos('A', 'A', T('质量数', 'Mass number', 'Massenzahl'), '', 'count', 14)],
    conditions: [cond('valid', T('A ≥ Z', 'A ≥ Z', 'A ≥ Z'), 'A >= Z')],
    outputs: [out('N', 'N', T('中子数', 'Neutrons', 'Neutronen'), '', 'A - Z', { requires: ['valid'] }), out('NZ', 'N/Z', T('中子质子比', 'Neutron-to-proton ratio', 'Neutronen-Protonen-Verhältnis'), '', '(A - Z)/Z', { requires: ['valid'] })],
    example: { text: T('给定核素 14C，Z = 6、A = 14；仅根据标记确定位置。', 'The nuclide ¹⁴C with Z = 6 and A = 14: place it from the label alone.', 'Das Nuklid ¹⁴C mit Z = 6 und A = 14: nur aus der Bezeichnung einordnen.'), answer: T('中子数 N = 8；核素图以 Z 和 N 定位。同 Z 不同 N 是同位素。', 'N = 8 neutrons; the chart places it by Z and N. Same Z, other N: isotopes.', 'N = 8 Neutronen; die Karte ordnet nach Z und N. Gleiches Z, anderes N: Isotope.') },
    point: T('质量、寿命、能级和衰变支路来自不同评估数据。', 'Masses, lifetimes, levels and branches come from different evaluations.', 'Massen, Lebensdauern, Niveaus und Zweige stammen aus verschiedenen Evaluationen.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:N12'],
    links: {}, review: R2
  }
]
