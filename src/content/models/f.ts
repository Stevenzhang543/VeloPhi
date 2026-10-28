/**
 * F01–F12: fluids and continua (blueprint §5.3; doc 02 §3). The 2D scenes compute volumes as section area × the
 * thickness perpendicular to the page (D100); F02 states both explicitly.
 */
import type { ModelSpec } from './types'
import { A, L, T, cond, inp, let_, nonneg, out, pos } from './dsl'

const R2 = { physics: '2026-10-28', language: '2026-10-28' }
const eta = (value: number) => pos('eta', '\\eta', T('动力黏度', 'Dynamic viscosity', 'Dynamische Viskosität'), 'Pa·s', 'viscosity', value)

export const MODELS_F: ModelSpec[] = [
  {
    id: 'F01', title: T('液体压强', 'Pressure in a liquid', 'Druck in einer Flüssigkeit'),
    stages: ['j'], priority: 'P1', geometry: 'line1d',
    assumptions: [T('静止、不可压缩液体；匀强重力', 'Liquid at rest and incompressible; uniform gravity', 'Ruhende, inkompressible Flüssigkeit; homogene Schwerkraft')],
    validity: T('深度从液面向下量起；表压与绝对压强分开', 'Depth measured down from the surface; gauge and absolute pressure kept apart', 'Tiefe ab der Oberfläche nach unten; Überdruck und Absolutdruck getrennt'),
    sources: ['S17'],
    inputs: [pos('rho', '\\rho', L.rho, 'kg/m³', 'density', 1000), pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8), nonneg('h', 'h', T('液面下深度', 'Depth below the surface', 'Tiefe unter der Oberfläche'), 'm', 'length', 2), nonneg('p0', 'p_0', T('液面上的外界压强', 'Pressure above the surface', 'Druck über der Oberfläche'), 'Pa', 'pressure', 101325)],
    outputs: [out('pg', 'p - p_0', T('表压', 'Gauge pressure', 'Überdruck'), 'Pa', 'rho*g*h'), out('p', 'p', T('绝对压强', 'Absolute pressure', 'Absolutdruck'), 'Pa', 'p0 + rho*g*h')],
    example: { text: T('水密度 1000 kg/m³，深度 2 m，p0 = 101325 Pa，g = 9.8。', 'Water, 1000 kg/m³, depth 2 m, p0 = 101325 Pa, g = 9.8.', 'Wasser, 1000 kg/m³, Tiefe 2 m, p0 = 101325 Pa, g = 9,8.'), answer: T('表压 19600 Pa；绝对压强 120925 Pa。', 'Gauge 19600 Pa; absolute 120925 Pa.', 'Überdruck 19600 Pa; absolut 120925 Pa.') },
    point: T('压强是标量，表压与绝对压强要区分。', 'Pressure is a scalar; tell gauge and absolute pressure apart.', 'Druck ist ein Skalar; Über- und Absolutdruck unterscheiden.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:F01', 'test:sim2656 F01 liquid pressure'],
    links: {}, review: R2
  },
  {
    id: 'F02', title: T('浮力与沉浮', 'Buoyancy, floating and sinking', 'Auftrieb, Schwimmen und Sinken'),
    stages: ['j'], priority: 'P1', geometry: 'section2d',
    assumptions: [A.thickness, T('均匀物体，静止液体，物体不吸水', 'Uniform body, liquid at rest, the body takes up no liquid', 'Homogener Körper, ruhende Flüssigkeit, der Körper nimmt keine Flüssigkeit auf')],
    validity: T('漂浮、悬浮、沉底三支由密度比较决定；沉底时支持力另算', 'Floating, suspended and sinking are decided by the densities; a sunk body needs a support force', 'Schwimmen, Schweben und Sinken entscheiden die Dichten; ein gesunkener Körper braucht eine Stützkraft'),
    sources: ['S17'],
    inputs: [pos('As', 'A_s', T('截面面积（纸面内）', 'Section area (in the page)', 'Schnittfläche (in der Zeichenebene)'), 'm²', 'area', 0.05), pos('d', 'd', T('垂直纸面的厚度', 'Thickness perpendicular to the page', 'Dicke senkrecht zur Zeichenebene'), 'm', 'length', 0.2), pos('rhoB', '\\rho_b', T('物体密度', 'Density of the body', 'Dichte des Körpers'), 'kg/m³', 'density', 600), pos('rhoF', '\\rho_f', T('液体密度', 'Density of the liquid', 'Dichte der Flüssigkeit'), 'kg/m³', 'density', 1000), pos('g', 'g', L.g, 'm/s²', 'acceleration', 10)],
    lets: [let_('V', 'V', L.V, 'm³', 'As*d')],
    conditions: [
      cond('floats', T('漂浮（ρb < ρf）', 'Floats (ρb < ρf)', 'Schwimmt (ρb < ρf)'), 'rhoB < rhoF*(1 - 1e-12)'),
      cond('neutral', T('悬浮（ρb = ρf）', 'Suspended (ρb = ρf)', 'Schwebt (ρb = ρf)'), 'abs(rhoB - rhoF) <= 1e-12*rhoF'),
      cond('sinks', T('下沉（ρb > ρf）', 'Sinks (ρb > ρf)', 'Sinkt (ρb > ρf)'), 'rhoB > rhoF*(1 + 1e-12)')
    ],
    outputs: [
      out('V', 'V', T('体积（截面 × 厚度）', 'Volume (section × thickness)', 'Volumen (Schnitt × Dicke)'), 'm³', 'As*d'),
      out('m', 'm', L.m, 'kg', 'rhoB*As*d'),
      out('Fb', 'F_b', T('平衡时的浮力', 'Buoyant force at rest', 'Auftriebskraft in Ruhe'), 'N', 'rhoB*As*d*g', { when: 'floats', branch: T('漂浮：浮力等于重力', 'Floating: buoyancy equals weight', 'Schwimmend: Auftrieb gleich Gewicht') }),
      out('Fb', 'F_b', T('平衡时的浮力', 'Buoyant force at rest', 'Auftriebskraft in Ruhe'), 'N', 'rhoF*As*d*g', { when: 'neutral', branch: T('悬浮：完全浸没', 'Suspended: fully submerged', 'Schwebend: ganz eingetaucht') }),
      out('Fb', 'F_b', T('平衡时的浮力', 'Buoyant force at rest', 'Auftriebskraft in Ruhe'), 'N', 'rhoF*As*d*g', { when: 'sinks', branch: T('下沉：完全浸没，另需支持力', 'Sinking: fully submerged, a support force is needed', 'Sinkend: ganz eingetaucht, Stützkraft nötig') }),
      out('Vsub', 'V_{sub}', T('排开液体体积', 'Volume displaced', 'Verdrängtes Volumen'), 'm³', 'As*d*rhoB/rhoF', { when: 'floats' }),
      out('Vsub', 'V_{sub}', T('排开液体体积', 'Volume displaced', 'Verdrängtes Volumen'), 'm³', 'As*d', { when: 'neutral' }),
      out('Vsub', 'V_{sub}', T('排开液体体积', 'Volume displaced', 'Verdrängtes Volumen'), 'm³', 'As*d', { when: 'sinks' }),
      out('Fn', 'F_N', T('沉底时容器底的支持力', 'Support force from the bottom when sunk', 'Stützkraft des Bodens, wenn gesunken'), 'N', '(rhoB - rhoF)*As*d*g', { requires: ['sinks'] })
    ],
    example: { text: T('截面 0.05 m²、厚度 0.2 m（体积 0.01 m³）、密度 600 kg/m³ 的木块漂浮于水，g = 10。', 'A block with section 0.05 m² and thickness 0.2 m (0.01 m³), density 600 kg/m³, floats in water; g = 10.', 'Ein Block mit Schnitt 0,05 m² und Dicke 0,2 m (0,01 m³), Dichte 600 kg/m³, schwimmt in Wasser; g = 10.'), answer: T('物块质量 6 kg；浮力 60 N；排水体积 0.006 m³，即浸没 60%。', 'Mass 6 kg; buoyancy 60 N; displaced 0.006 m³, that is 60 % submerged.', 'Masse 6 kg; Auftrieb 60 N; verdrängt 0,006 m³, also 60 % eingetaucht.') },
    point: T('二维图的面积必须结合明确厚度才能得到体积。', 'An area in a 2D picture needs a stated thickness to become a volume.', 'Eine Fläche im 2D-Bild braucht eine angegebene Dicke, um ein Volumen zu werden.'),
    status: 'verified', level: 3, teaching: 2, references: ['analytic', 'otherMethod'],
    benchmarks: ['oracle:F02', 'rust:tests/regions.rs floating_block_draft_and_archimedes', 'test:loop1 floating block: thickness modes and the float/sink prediction against the simulation'],
    links: { activities: ['act-float'] }, review: R2
  },
  {
    id: 'F03', title: T('浮体稳定性与浮心', 'Stability of floating bodies', 'Stabilität schwimmender Körper'),
    stages: ['u'], priority: 'P2', geometry: 'section2d',
    assumptions: [T('小倾角；GM 由给定船型的水线几何得出', 'Small heel angle; GM from the waterline geometry of the given hull', 'Kleiner Krängungswinkel; GM aus der Wasserliniengeometrie des Rumpfs')],
    validity: T('小角度（≲ 10°）；大角度要用完整的回复力臂曲线', 'Small angles (≲ 10°); large angles need the full righting-arm curve', 'Kleine Winkel (≲ 10°); große Winkel brauchen die volle Hebelarmkurve'),
    sources: ['S17', 'S50'],
    inputs: [pos('m', 'm', L.m, 'kg', 'mass', 10), inp('GM', 'GM', T('稳心高度', 'Metacentric height', 'Metazentrische Höhe'), 'm', 'length', 0.05), inp('phi', '\\varphi', T('横倾角', 'Heel angle', 'Krängungswinkel'), 'rad', 'angle', 0.1), pos('g', 'g', L.g, 'm/s²', 'acceleration', 10)],
    conditions: [cond('small', T('小倾角', 'Small heel angle', 'Kleiner Krängungswinkel'), 'abs(phi) <= 0.1746', 'abs(phi) <= 0.35'), cond('stable', T('GM > 0：小角度稳定', 'GM > 0: stable at small angles', 'GM > 0: stabil bei kleinen Winkeln'), 'GM > 0')],
    outputs: [out('tau', '\\tau', T('回复力矩', 'Righting moment', 'Aufrichtendes Moment'), 'N·m', '-m*g*GM*sin(phi)', { requires: ['small'] }), out('GZ', 'GZ', T('回复力臂', 'Righting arm', 'Aufrichtender Hebelarm'), 'm', 'GM*sin(phi)', { requires: ['small'] })],
    example: { text: T('小倾角浮体 m = 10 kg，GM = 0.05 m，φ = 0.1 rad，g = 10。', 'A floating body heeled slightly: m = 10 kg, GM = 0.05 m, φ = 0.1 rad, g = 10.', 'Ein leicht gekrängter Schwimmkörper: m = 10 kg, GM = 0,05 m, φ = 0,1 rad, g = 10.'), answer: T('回复力矩约为 −0.499167 N·m；GM > 0 表示小角度稳定。', 'Righting moment about −0.499167 N·m; GM > 0 means stable at small angles.', 'Aufrichtendes Moment etwa −0,499167 N·m; GM > 0 heißt stabil bei kleinen Winkeln.') },
    point: T('浮心随浸没几何变化，质心与浮心不一定重合。', 'The centre of buoyancy moves with the submerged shape; it need not coincide with the centre of mass.', 'Der Auftriebsschwerpunkt wandert mit der eingetauchten Form; er muss nicht mit dem Schwerpunkt zusammenfallen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:F03', 'rust:src/regions.rs circle_segment_and_corner'],
    links: {}, review: R2
  },
  {
    id: 'F04', title: T('帕斯卡原理与液压', 'Pascal’s principle and hydraulics', 'Pascalsches Prinzip und Hydraulik'),
    stages: ['j'], priority: 'P1', geometry: 'section2d',
    assumptions: [A.incompressible, T('活塞无摩擦，两活塞同高', 'Frictionless pistons at the same height', 'Reibungsfreie Kolben auf gleicher Höhe')],
    validity: T('增力不增能量：两端功相等', 'Force is multiplied, energy is not: the work is equal on both sides', 'Die Kraft wird vervielfacht, die Energie nicht: gleiche Arbeit auf beiden Seiten'),
    sources: ['S17'],
    inputs: [pos('A1', 'A_1', T('小活塞面积', 'Area of the small piston', 'Fläche des kleinen Kolbens'), 'm²', 'area', 1e-4), pos('A2', 'A_2', T('大活塞面积', 'Area of the large piston', 'Fläche des großen Kolbens'), 'm²', 'area', 20e-4), nonneg('F1', 'F_1', T('小活塞上的力', 'Force on the small piston', 'Kraft auf den kleinen Kolben'), 'N', 'force', 50), nonneg('s1', 's_1', T('小活塞移动距离', 'Stroke of the small piston', 'Weg des kleinen Kolbens'), 'm', 'length', 0.1)],
    outputs: [out('p', 'p', T('液体中的附加压强', 'Added pressure in the liquid', 'Zusätzlicher Druck in der Flüssigkeit'), 'Pa', 'F1/A1'), out('F2', 'F_2', T('理想输出力', 'Ideal output force', 'Ideale Ausgangskraft'), 'N', 'F1*A2/A1'), out('s2', 's_2', T('大活塞升高', 'Rise of the large piston', 'Hub des großen Kolbens'), 'm', 's1*A1/A2'), out('W1', 'W_1', T('输入功', 'Work in', 'Zugeführte Arbeit'), 'J', 'F1*s1'), out('W2', 'W_2', T('输出功', 'Work out', 'Abgegebene Arbeit'), 'J', '(F1*A2/A1)*(s1*A1/A2)')],
    example: { text: T('A1 = 1 cm²，A2 = 20 cm²，小活塞力 50 N，移动 0.1 m。', 'A1 = 1 cm², A2 = 20 cm², 50 N on the small piston, stroke 0.1 m.', 'A1 = 1 cm², A2 = 20 cm², 50 N am kleinen Kolben, Hub 0,1 m.'), answer: T('理想输出力 1000 N，大活塞升高 0.005 m；两端功均为 5 J。', 'Ideal output 1000 N, the large piston rises 0.005 m; 5 J of work on each side.', 'Ideale Ausgangskraft 1000 N, der große Kolben hebt sich 0,005 m; je 5 J Arbeit.') },
    point: T('增力不增能量；需要不可压缩与低损耗假设。', 'More force, not more energy; needs incompressibility and low losses.', 'Mehr Kraft, nicht mehr Energie; setzt Inkompressibilität und geringe Verluste voraus.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:F04'],
    links: {}, review: R2
  },
  {
    id: 'F05', title: T('连续性方程', 'Continuity equation', 'Kontinuitätsgleichung'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'line1d',
    assumptions: [A.steady, T('一维管流，截面上速度均匀', 'One-dimensional pipe flow, uniform velocity over a section', 'Eindimensionale Rohrströmung, gleichförmige Geschwindigkeit im Querschnitt')],
    validity: T('守恒的是质量通量；密度改变时体积流量不同', 'The mass flux is conserved; with a changing density the volume flow differs', 'Erhalten ist der Massenstrom; bei veränderlicher Dichte ändert sich der Volumenstrom'),
    sources: ['S17'],
    inputs: [pos('A1', 'A_1', T('入口截面', 'Inlet section', 'Eintrittsquerschnitt'), 'm²', 'area', 4e-4), pos('A2', 'A_2', T('出口截面', 'Outlet section', 'Austrittsquerschnitt'), 'm²', 'area', 1e-4), nonneg('v1', 'v_1', T('入口流速', 'Inlet speed', 'Eintrittsgeschwindigkeit'), 'm/s', 'speed', 0.5), pos('rho1', '\\rho_1', T('入口密度', 'Inlet density', 'Dichte am Eintritt'), 'kg/m³', 'density', 1000), pos('rho2', '\\rho_2', T('出口密度', 'Outlet density', 'Dichte am Austritt'), 'kg/m³', 'density', 1000)],
    outputs: [out('Q1', 'Q_1', T('入口体积流量', 'Volume flow at the inlet', 'Volumenstrom am Eintritt'), 'm³/s', 'A1*v1'), out('mdot', '\\dot m', T('质量流量', 'Mass flow', 'Massenstrom'), 'kg/s', 'rho1*A1*v1'), out('v2', 'v_2', T('出口流速', 'Outlet speed', 'Austrittsgeschwindigkeit'), 'm/s', 'rho1*A1*v1/(rho2*A2)'), out('Q2', 'Q_2', T('出口体积流量', 'Volume flow at the outlet', 'Volumenstrom am Austritt'), 'm³/s', 'rho1*A1*v1/rho2')],
    example: { text: T('不可压缩水管 A1 = 4 cm²、A2 = 1 cm²，v1 = 0.5 m/s。', 'Incompressible water pipe, A1 = 4 cm², A2 = 1 cm², v1 = 0.5 m/s.', 'Inkompressibles Wasserrohr, A1 = 4 cm², A2 = 1 cm², v1 = 0,5 m/s.'), answer: T('流量 2×10⁻⁴ m³/s；v2 = 2 m/s。', 'Flow 2×10⁻⁴ m³/s; v2 = 2 m/s.', 'Volumenstrom 2×10⁻⁴ m³/s; v2 = 2 m/s.') },
    point: T('守恒的是质量通量；变密度时体积流量不必恒定。', 'The mass flux is conserved; with varying density the volume flow need not be constant.', 'Erhalten ist der Massenstrom; bei veränderlicher Dichte muss der Volumenstrom nicht konstant sein.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:F05'],
    links: {}, review: R2
  },
  {
    id: 'F06', title: T('伯努利与流速压差', 'Bernoulli: speed and pressure difference', 'Bernoulli: Geschwindigkeit und Druckdifferenz'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'line1d',
    assumptions: [A.steady, A.incompressible, T('无黏、沿同一流线、无泵与损失', 'Inviscid, along one streamline, no pump and no losses', 'Reibungsfrei, entlang einer Stromlinie, ohne Pumpe und Verluste')],
    validity: T('有黏性损失或泵做功时原式失效；出口绝对压强必须为正', 'Fails with viscous losses or pump work; the outlet absolute pressure must stay positive', 'Gilt nicht bei Reibungsverlusten oder Pumpenarbeit; der Absolutdruck am Austritt muss positiv bleiben'),
    sources: ['S17'],
    inputs: [pos('rho', '\\rho', L.rho, 'kg/m³', 'density', 1000), nonneg('v1', 'v_1', T('点 1 流速', 'Speed at point 1', 'Geschwindigkeit an Punkt 1'), 'm/s', 'speed', 1), nonneg('v2', 'v_2', T('点 2 流速', 'Speed at point 2', 'Geschwindigkeit an Punkt 2'), 'm/s', 'speed', 3), inp('z1', 'z_1', T('点 1 高度', 'Height of point 1', 'Höhe von Punkt 1'), 'm', 'length', 0), inp('z2', 'z_2', T('点 2 高度', 'Height of point 2', 'Höhe von Punkt 2'), 'm', 'length', 0), pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8), pos('p1', 'p_1', T('点 1 绝对压强', 'Absolute pressure at point 1', 'Absolutdruck an Punkt 1'), 'Pa', 'pressure', 101325)],
    conditions: [cond('positive', T('点 2 绝对压强为正（无空化）', 'Positive absolute pressure at point 2 (no cavitation)', 'Positiver Absolutdruck an Punkt 2 (keine Kavitation)'), 'p1 - (rho*(v2^2 - v1^2)/2 + rho*g*(z2 - z1)) > 0')],
    outputs: [out('dp', 'p_1 - p_2', T('压差', 'Pressure difference', 'Druckdifferenz'), 'Pa', 'rho*(v2^2 - v1^2)/2 + rho*g*(z2 - z1)'), out('p2', 'p_2', T('点 2 绝对压强', 'Absolute pressure at point 2', 'Absolutdruck an Punkt 2'), 'Pa', 'p1 - rho*(v2^2 - v1^2)/2 - rho*g*(z2 - z1)', { requires: ['positive'] })],
    example: { text: T('同高理想水流，v1 = 1 m/s，v2 = 3 m/s，ρ = 1000 kg/m³。', 'Ideal water flow at one height, v1 = 1 m/s, v2 = 3 m/s, ρ = 1000 kg/m³.', 'Ideale Wasserströmung auf gleicher Höhe, v1 = 1 m/s, v2 = 3 m/s, ρ = 1000 kg/m³.'), answer: T('压差 p1−p2 = ρ(9−1)/2 = 4000 Pa。', 'p1 − p2 = ρ(9 − 1)/2 = 4000 Pa.', 'p1 − p2 = ρ(9 − 1)/2 = 4000 Pa.') },
    point: T('只沿适用的稳态无黏流线使用；不能从流速大推导任意场景压强小。', 'Use it only along a steady inviscid streamline; “faster means lower pressure” is not a general rule.', 'Nur entlang einer stationären reibungsfreien Stromlinie; „schneller heißt weniger Druck“ ist keine allgemeine Regel.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:F06'],
    links: {}, review: R2
  },
  {
    id: 'F07', title: T('泊肃叶流', 'Poiseuille flow', 'Hagen-Poiseuille-Strömung'),
    stages: ['u'], priority: 'P2', geometry: 'axisym',
    assumptions: [A.steady, A.incompressible, T('充分发展的层流，管壁无滑移', 'Fully developed laminar flow, no slip at the wall', 'Voll ausgebildete laminare Strömung, Haftbedingung an der Wand')],
    validity: T('层流：以管径为尺度 Re ≲ 2000（光滑直圆管经验判据）', 'Laminar: Re ≲ 2000 based on the diameter (empirical criterion for smooth straight pipes)', 'Laminar: Re ≲ 2000 mit dem Durchmesser (Erfahrungswert für glatte gerade Rohre)'),
    sources: ['S17'],
    inputs: [pos('r', 'r', T('管半径', 'Pipe radius', 'Rohrradius'), 'm', 'length', 1e-3), pos('Lp', 'L', T('管长', 'Pipe length', 'Rohrlänge'), 'm', 'length', 1), eta(1e-3), nonneg('dp', '\\Delta p', T('压差', 'Pressure difference', 'Druckdifferenz'), 'Pa', 'pressure', 100), pos('rho', '\\rho', L.rho, 'kg/m³', 'density', 1000)],
    conditions: [cond('laminar', T('层流（Re < 2000）', 'Laminar (Re < 2000)', 'Laminar (Re < 2000)'), 'rho*(dp*r^2/(8*eta*Lp))*2*r/eta < 2000', 'rho*(dp*r^2/(8*eta*Lp))*2*r/eta < 2300')],
    outputs: [out('Q', 'Q', T('体积流量', 'Volume flow', 'Volumenstrom'), 'm³/s', 'pi*r^4*dp/(8*eta*Lp)', { requires: ['laminar'] }), out('vm', '\\bar v', T('平均流速', 'Mean speed', 'Mittlere Geschwindigkeit'), 'm/s', 'dp*r^2/(8*eta*Lp)', { requires: ['laminar'] }), out('Re', 'Re', T('雷诺数（以管径）', 'Reynolds number (diameter)', 'Reynoldszahl (Durchmesser)'), '', 'rho*(dp*r^2/(8*eta*Lp))*2*r/eta')],
    example: { text: T('圆管 r = 1 mm，L = 1 m，动力黏度 10⁻³ Pa·s，压差 100 Pa。', 'A round pipe, r = 1 mm, L = 1 m, viscosity 10⁻³ Pa·s, pressure difference 100 Pa.', 'Ein Rundrohr, r = 1 mm, L = 1 m, Viskosität 10⁻³ Pa·s, Druckdifferenz 100 Pa.'), answer: T('Q = 3.92699×10⁻⁸ m³/s；平均流速 0.0125 m/s。', 'Q = 3.92699×10⁻⁸ m³/s; mean speed 0.0125 m/s.', 'Q = 3,92699×10⁻⁸ m³/s; mittlere Geschwindigkeit 0,0125 m/s.') },
    point: T('管径四次方效应；要求充分发展层流及无滑移边界。', 'The fourth power of the radius; needs fully developed laminar flow and no slip.', 'Die vierte Potenz des Radius; setzt voll ausgebildete laminare Strömung und Haftbedingung voraus.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:F07'],
    links: {}, review: R2
  },
  {
    id: 'F08', title: T('斯托克斯沉降', 'Stokes settling', 'Stokes-Sedimentation'),
    stages: ['u'], priority: 'P2', geometry: 'point',
    assumptions: [T('刚性小球在无界静止流体中缓慢运动，计入浮力', 'A small rigid sphere moving slowly in an unbounded fluid at rest, buoyancy included', 'Eine kleine starre Kugel bewegt sich langsam in unbegrenzter ruhender Flüssigkeit, Auftrieb berücksichtigt')],
    validity: T('Re ≪ 1（以直径为尺度）；Re 不够小时不是高精度参照', 'Re ≪ 1 (diameter); not a precise reference when Re is not small', 'Re ≪ 1 (Durchmesser); keine genaue Referenz, wenn Re nicht klein ist'),
    sources: ['S17'],
    inputs: [pos('r', 'r', T('球半径', 'Sphere radius', 'Kugelradius'), 'm', 'length', 1e-4), pos('rhoS', '\\rho_s', T('球密度', 'Density of the sphere', 'Dichte der Kugel'), 'kg/m³', 'density', 2000), pos('rhoF', '\\rho_f', T('流体密度', 'Density of the fluid', 'Dichte des Fluids'), 'kg/m³', 'density', 1000), eta(1), pos('g', 'g', L.g, 'm/s²', 'acceleration', 10)],
    lets: [let_('vt', 'v_\\infty', T('终端速度', 'Terminal speed', 'Endgeschwindigkeit'), 'm/s', '2*r^2*(rhoS - rhoF)*g/(9*eta)')],
    conditions: [cond('creeping', T('蠕流（Re < 0.1）', 'Creeping flow (Re < 0.1)', 'Schleichströmung (Re < 0,1)'), 'rhoF*abs(vt)*2*r/eta < 0.1', 'rhoF*abs(vt)*2*r/eta < 1')],
    outputs: [out('vt', 'v_\\infty', T('终端速度（向下为正）', 'Terminal speed (down positive)', 'Endgeschwindigkeit (nach unten positiv)'), 'm/s', '2*r^2*(rhoS - rhoF)*g/(9*eta)', { requires: ['creeping'] }), out('Re', 'Re', T('雷诺数（以直径）', 'Reynolds number (diameter)', 'Reynoldszahl (Durchmesser)'), '', 'rhoF*abs(vt)*2*r/eta')],
    example: { text: T('球半径 0.1 mm，ρs = 2000、ρf = 1000 kg/m³，η = 1 Pa·s，g = 10。', 'A sphere of 0.1 mm radius, ρs = 2000, ρf = 1000 kg/m³, η = 1 Pa·s, g = 10.', 'Eine Kugel mit 0,1 mm Radius, ρs = 2000, ρf = 1000 kg/m³, η = 1 Pa·s, g = 10.'), answer: T('终端速度 2.22222×10⁻⁵ m/s；以直径为尺度的 Re 约 4.44×10⁻⁶。', 'Terminal speed 2.22222×10⁻⁵ m/s; Re about 4.44×10⁻⁶ based on the diameter.', 'Endgeschwindigkeit 2,22222×10⁻⁵ m/s; Re etwa 4,44×10⁻⁶ mit dem Durchmesser.') },
    point: T('适用性靠 Re 检查；浮力必须计入。', 'Check validity with Re; include buoyancy.', 'Gültigkeit über Re prüfen; Auftrieb berücksichtigen.'),
    status: 'verified', level: 2, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:F08', 'test:physics2651 linear drag: v(t) = v_t'],
    links: {}, review: R2
  },
  {
    id: 'F09', title: T('雷诺数与相似性', 'Reynolds number and similarity', 'Reynoldszahl und Ähnlichkeit'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('特征尺度与特征速度由场景给定', 'Characteristic length and speed set by the situation', 'Charakteristische Länge und Geschwindigkeit aus der Situation')],
    validity: T('转捩阈值依赖几何与扰动；2000 只是光滑直圆管的经验判据', 'The transition threshold depends on geometry and disturbances; 2000 is only an empirical value for smooth straight pipes', 'Die Umschlagschwelle hängt von Geometrie und Störungen ab; 2000 ist nur ein Erfahrungswert für glatte gerade Rohre'),
    sources: ['S17', 'S58'],
    inputs: [pos('rho', '\\rho', L.rho, 'kg/m³', 'density', 1000), nonneg('v', 'v', T('特征速度', 'Characteristic speed', 'Charakteristische Geschwindigkeit'), 'm/s', 'speed', 0.1), pos('Lc', 'L', T('特征尺度（管径）', 'Characteristic length (diameter)', 'Charakteristische Länge (Durchmesser)'), 'm', 'length', 0.01), eta(1e-3)],
    conditions: [cond('pipeLaminar', T('光滑直圆管经验：Re < 2000 时层流', 'Smooth straight pipe (empirical): laminar for Re < 2000', 'Glattes gerades Rohr (Erfahrung): laminar für Re < 2000'), 'rho*v*Lc/eta < 2000')],
    outputs: [out('Re', 'Re', T('雷诺数', 'Reynolds number', 'Reynoldszahl'), '', 'rho*v*Lc/eta'), out('nu', '\\nu', T('运动黏度', 'Kinematic viscosity', 'Kinematische Viskosität'), 'm²/s', 'eta/rho')],
    example: { text: T('ρ = 1000 kg/m³，v = 0.1 m/s，管径 L = 0.01 m，η = 10⁻³ Pa·s。', 'ρ = 1000 kg/m³, v = 0.1 m/s, diameter L = 0.01 m, η = 10⁻³ Pa·s.', 'ρ = 1000 kg/m³, v = 0,1 m/s, Durchmesser L = 0,01 m, η = 10⁻³ Pa·s.'), answer: T('Re = 1000；若采用光滑直圆管经验判据可讨论层流，但不能推广到所有几何。', 'Re = 1000; with the empirical criterion for smooth straight pipes laminar flow can be discussed, but not for every geometry.', 'Re = 1000; mit dem Erfahrungswert für glatte gerade Rohre lässt sich laminare Strömung diskutieren, nicht aber für jede Geometrie.') },
    point: T('无量纲数连接不同尺度系统；转捩受几何和扰动影响。', 'Dimensionless numbers link systems of different size; transition depends on geometry and disturbances.', 'Dimensionslose Zahlen verbinden Systeme verschiedener Größe; der Umschlag hängt von Geometrie und Störungen ab.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:F09'],
    links: {}, review: R2
  },
  {
    id: 'F10', title: T('表面张力与毛细', 'Surface tension and capillarity', 'Oberflächenspannung und Kapillarität'),
    stages: ['u'], priority: 'P2', geometry: 'axisym',
    assumptions: [T('细圆管，弯月面近似为球冠（Jurin）', 'Narrow round tube, meniscus close to a spherical cap (Jurin)', 'Enges Rundrohr, Meniskus nahezu Kugelkappe (Jurin)')],
    validity: T('Bond 数 ρgr²/γ ≪ 1；接触角 90° 时 h = 0，疏水时为负（下降）', 'Bond number ρgr²/γ ≪ 1; h = 0 at a 90° contact angle, negative (depression) when non-wetting', 'Bond-Zahl ρgr²/γ ≪ 1; h = 0 bei 90° Kontaktwinkel, negativ (Absenkung) bei Nichtbenetzung'),
    sources: ['S17', 'S79'],
    inputs: [pos('gam', '\\gamma', T('表面张力系数', 'Surface tension', 'Oberflächenspannung'), 'N/m', 'surfaceTension', 0.072), inp('th', '\\theta', T('接触角', 'Contact angle', 'Kontaktwinkel'), 'rad', 'angle', 0, { min: 0, max: Math.PI }), pos('rho', '\\rho', L.rho, 'kg/m³', 'density', 1000), pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8), pos('r', 'r', T('管半径', 'Tube radius', 'Rohrradius'), 'm', 'length', 5e-4)],
    conditions: [cond('narrow', T('细管（Bond 数 < 0.1）', 'Narrow tube (Bond number < 0.1)', 'Enges Rohr (Bond-Zahl < 0,1)'), 'rho*g*r^2/gam < 0.1', 'rho*g*r^2/gam < 1')],
    outputs: [out('h', 'h', T('液柱升高（负为下降）', 'Rise of the column (negative: depression)', 'Steighöhe (negativ: Absenkung)'), 'm', '2*gam*cos(th)/(rho*g*r)', { requires: ['narrow'] }), out('Bo', 'Bo', T('Bond 数', 'Bond number', 'Bond-Zahl'), '', 'rho*g*r^2/gam')],
    example: { text: T('完全润湿毛细管，γ = 0.072 N/m，r = 0.5 mm，ρ = 1000，g = 9.8。', 'A fully wetting capillary, γ = 0.072 N/m, r = 0.5 mm, ρ = 1000, g = 9.8.', 'Eine vollständig benetzende Kapillare, γ = 0,072 N/m, r = 0,5 mm, ρ = 1000, g = 9,8.'), answer: T('h = 0.0293878 m，约 2.94 cm。', 'h = 0.0293878 m, about 2.94 cm.', 'h = 0,0293878 m, etwa 2,94 cm.') },
    point: T('接触角、曲率和表面能是附加物理，不由普通浮力自动产生。', 'Contact angle, curvature and surface energy are additional physics, not produced by ordinary buoyancy.', 'Kontaktwinkel, Krümmung und Oberflächenenergie sind zusätzliche Physik, nicht Folge des gewöhnlichen Auftriebs.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:F10'],
    links: { topics: ['concept:solids'] }, review: R2
  },
  {
    id: 'F11', title: T('应力应变与弹性波', 'Stress, strain and elastic waves', 'Spannung, Dehnung und elastische Wellen'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [A.linear, T('细长杆，单轴应力', 'A slender rod under uniaxial stress', 'Ein schlanker Stab unter einachsiger Spannung')],
    validity: T('弹性范围内（应力不超过屈服强度）；细杆纵波速度不能用于任意三维体', 'Within the elastic range (stress below yield); the rod speed does not hold for arbitrary 3D bodies', 'Im elastischen Bereich (Spannung unter der Streckgrenze); die Stabgeschwindigkeit gilt nicht für beliebige 3D-Körper'),
    sources: ['S79', 'S19'],
    inputs: [pos('E', 'E', T('杨氏模量', 'Young’s modulus', 'Elastizitätsmodul'), 'Pa', 'pressure', 2e11), pos('rho', '\\rho', L.rho, 'kg/m³', 'density', 8000), nonneg('eps', '\\varepsilon', T('应变', 'Strain', 'Dehnung'), '', 'ratio', 1e-4), pos('sy', '\\sigma_y', T('屈服强度', 'Yield strength', 'Streckgrenze'), 'Pa', 'pressure', 2.5e8)],
    conditions: [cond('elastic', T('弹性范围', 'Elastic range', 'Elastischer Bereich'), 'E*eps <= sy')],
    outputs: [out('sig', '\\sigma', T('应力', 'Stress', 'Spannung'), 'Pa', 'E*eps', { requires: ['elastic'] }), out('c', 'c_{rod}', T('细杆纵波速度', 'Longitudinal wave speed in a rod', 'Längswellengeschwindigkeit im Stab'), 'm/s', 'sqrt(E/rho)')],
    example: { text: T('细长杆 E = 2×10¹¹ Pa，ρ = 8000 kg/m³，应变 10⁻⁴。', 'A slender rod, E = 2×10¹¹ Pa, ρ = 8000 kg/m³, strain 10⁻⁴.', 'Ein schlanker Stab, E = 2×10¹¹ Pa, ρ = 8000 kg/m³, Dehnung 10⁻⁴.'), answer: T('应力 20 MPa；细杆纵波速度 5000 m/s。', 'Stress 20 MPa; longitudinal rod speed 5000 m/s.', 'Spannung 20 MPa; Längswellengeschwindigkeit 5000 m/s.') },
    point: T('本构关系与运动方程共同决定连续介质；三维纵波速度另含泊松比。', 'The constitutive law and the equation of motion together describe a continuum; the 3D longitudinal speed also involves Poisson’s ratio.', 'Stoffgesetz und Bewegungsgleichung beschreiben das Kontinuum gemeinsam; die 3D-Längswelle hängt auch von der Querkontraktionszahl ab.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:F11'],
    links: {}, review: R2
  },
  {
    id: 'F12', title: T('可压缩性与声速', 'Compressibility and the speed of sound', 'Kompressibilität und Schallgeschwindigkeit'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('理想气体，等熵小扰动', 'Ideal gas, isentropic small disturbances', 'Ideales Gas, isentrope kleine Störungen')],
    validity: T('Ma < 0.3 时可当不可压缩处理；高马赫数或大振幅退出线性声学', 'Below Ma 0.3 the flow may be treated as incompressible; high Mach numbers or large amplitudes leave linear acoustics', 'Unter Ma 0,3 darf man inkompressibel rechnen; hohe Machzahlen oder große Amplituden verlassen die lineare Akustik'),
    sources: ['S19', 'S21'],
    inputs: [pos('gam', '\\gamma', L.gamma, '', 'ratio', 1.4, { min: 1, open: true }), pos('p', 'p', L.p, 'Pa', 'pressure', 1e5), pos('rho', '\\rho', L.rho, 'kg/m³', 'density', 1.25), nonneg('v', 'v', T('流速', 'Flow speed', 'Strömungsgeschwindigkeit'), 'm/s', 'speed', 100)],
    conditions: [cond('incompressible', T('可按不可压缩处理（Ma < 0.3）', 'May be treated as incompressible (Ma < 0.3)', 'Darf als inkompressibel gelten (Ma < 0,3)'), 'v/sqrt(gam*p/rho) < 0.3')],
    outputs: [out('c', 'c', T('声速', 'Speed of sound', 'Schallgeschwindigkeit'), 'm/s', 'sqrt(gam*p/rho)'), out('Ma', 'Ma', T('马赫数', 'Mach number', 'Machzahl'), '', 'v/sqrt(gam*p/rho)'), out('drho', '\\rho_0/\\rho - 1', T('等熵滞止时的相对密度变化', 'Relative density change at isentropic stagnation', 'Relative Dichteänderung bei isentroper Stauung'), '', '(1 + (gam - 1)/2*(v^2*rho/(gam*p)))^(1/(gam - 1)) - 1')],
    example: { text: T('理想气体 γ = 1.4，p = 100000 Pa，ρ = 1.25 kg/m³，流速 100 m/s。', 'Ideal gas, γ = 1.4, p = 100000 Pa, ρ = 1.25 kg/m³, flow speed 100 m/s.', 'Ideales Gas, γ = 1,4, p = 100000 Pa, ρ = 1,25 kg/m³, Strömung 100 m/s.'), answer: T('声速 334.664 m/s；Ma = 0.298807。', 'Speed of sound 334.664 m/s; Ma = 0.298807.', 'Schallgeschwindigkeit 334,664 m/s; Ma = 0,298807.') },
    point: T('小扰动声学、可压缩流与激波是不同求解级别。', 'Small-signal acoustics, compressible flow and shocks are different levels of modelling.', 'Kleinsignalakustik, kompressible Strömung und Stöße sind verschiedene Modellstufen.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:F12'],
    links: {}, review: R2
  }
]
