/**
 * K01–K32 (26.62, D221): the model families the curriculum blueprint (《VeloPhi 全课程物理仿真开发蓝图》, 2026-11-08,
 * 283 topics) needs and the registry did not have — measurement and data, frames and three bodies, solid mechanics,
 * shallow water, climate and heat networks, photometry and beams, aberrations, op-amps and logic, batteries, sky
 * geometry, cosmology, tides, seismic waves, membranes, stiff integration and sensitivity. Each is an analytic
 * relation with its assumptions; independent references in scripts/oracles/k.py (mpmath, other routes).
 */
import type { ModelSpec } from './types'
import { A, L, T, angle, cond, inp, let_, nonneg, out, pos } from './dsl'

const R2 = { physics: '2026-11-08', language: '2026-11-08' }
const V = { status: 'verified' as const, review: R2 }

export const MODELS_K: ModelSpec[] = [
  {
    id: 'K01', title: T('有效数字与舍入', 'Significant figures and rounding', 'Signifikante Stellen und Runden'),
    stages: ['j', 's'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('四舍五入到 n 位有效数字（尾数 5 进位）', 'Round half up to n significant figures', 'Kaufmännisch auf n signifikante Stellen runden')],
    validity: T('x ≠ 0；n 为正整数', 'x ≠ 0; n a positive integer', 'x ≠ 0; n positive ganze Zahl'), sources: ['S01'],
    inputs: [inp('x', 'x', T('测量值', 'Measured value', 'Messwert'), '', 'ratio', 0.0123456), pos('n', 'n', T('有效数字位数', 'Significant figures', 'Signifikante Stellen'), '', 'ratio', 3)],
    lets: [let_('e', 'e', T('数量级（10 的指数）', 'Order of magnitude (power of ten)', 'Größenordnung (Zehnerpotenz)'), '', 'floor(lg(abs(x)))')],
    conditions: [cond('nonzero', T('x ≠ 0', 'x ≠ 0', 'x ≠ 0'), 'abs(x) > 0')],
    outputs: [out('e', 'e', T('数量级', 'Order of magnitude', 'Größenordnung'), '', 'e', { requires: ['nonzero'] }), out('xr', 'x_r', T('舍入后的值', 'Rounded value', 'Gerundeter Wert'), '', 'floor(x/10^(e - n + 1) + 0.5)*10^(e - n + 1)', { requires: ['nonzero'] }), out('rel', '\\delta', T('舍入引起的相对误差', 'Relative rounding error', 'Relativer Rundungsfehler'), '', 'abs(floor(x/10^(e - n + 1) + 0.5)*10^(e - n + 1) - x)/abs(x)', { requires: ['nonzero'] })],
    example: { text: T('把 0.0123456 保留 3 位有效数字。', 'Round 0.0123456 to 3 significant figures.', 'Runde 0,0123456 auf 3 signifikante Stellen.'), answer: T('数量级 −2；0.0123；相对误差 3.69×10⁻³。', 'Order −2; 0.0123; relative error 3.69×10⁻³.', 'Größenordnung −2; 0,0123; relativer Fehler 3,69·10⁻³.') },
    point: T('前导零不是有效数字；舍入误差不超过末位的一半。', 'Leading zeros are not significant; the rounding error is at most half the last digit.', 'Führende Nullen zählen nicht; der Rundungsfehler ist höchstens eine halbe Einheit der letzten Stelle.'),
    level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:K01'], links: {}, ...V
  },
  {
    id: 'K02', title: T('游标卡尺与螺旋测微器读数', 'Reading a vernier caliper and a micrometer', 'Ablesen von Messschieber und Bügelmessschraube'),
    stages: ['j', 's'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('读数 = 主尺读数 + 对齐格数 × 精度 − 零点误差', 'Reading = main scale + aligned division × least count − zero error', 'Ablesung = Hauptskala + Teilstrich × Genauigkeit − Nullfehler')],
    validity: T('虚拟读数训练，不能代替实物操作', 'Virtual reading practice; it does not replace handling the real instrument', 'Virtuelles Ablesen ersetzt nicht das echte Messgerät'), sources: ['S01', 'S04'],
    inputs: [nonneg('M', 'M', T('游标卡尺主尺读数', 'Caliper main scale', 'Hauptskala des Messschiebers'), 'm', 'length', 0.021), nonneg('nv', 'n', T('游标对齐的格数', 'Aligned vernier division', 'Übereinstimmender Noniusstrich'), '', 'ratio', 7), pos('c', 'c', T('游标精度', 'Least count of the vernier', 'Noniusgenauigkeit'), 'm', 'length', 2e-5),
      nonneg('S', 'S', T('螺旋测微器固定刻度', 'Micrometer sleeve', 'Skalenhülse der Messschraube'), 'm', 'length', 0.0055), nonneg('k', 'k', T('可动刻度对齐格数', 'Thimble division', 'Teilstrich der Messtrommel'), '', 'ratio', 23), pos('pitch', 'p', T('螺距', 'Pitch', 'Steigung'), 'm', 'length', 5e-4), pos('N', 'N', T('可动刻度总格数', 'Divisions on the thimble', 'Teilstriche der Trommel'), '', 'ratio', 50), inp('z', 'z', T('零点误差', 'Zero error', 'Nullfehler'), 'm', 'length', 0)],
    outputs: [out('Lv', 'L_v', T('游标卡尺读数', 'Caliper reading', 'Ablesung am Messschieber'), 'm', 'M + nv*c - z'), out('Lm', 'L_m', T('螺旋测微器读数', 'Micrometer reading', 'Ablesung an der Messschraube'), 'm', 'S + k*pitch/N - z'), out('cm', 'c_m', T('螺旋测微器精度', 'Micrometer least count', 'Genauigkeit der Messschraube'), 'm', 'pitch/N')],
    example: { text: T('主尺 21 mm、第 7 格对齐（精度 0.02 mm）；测微器固定刻度 5.5 mm、可动刻度 23 格。', 'Main scale 21 mm, division 7 aligned (0.02 mm); micrometer sleeve 5.5 mm, thimble 23.', 'Hauptskala 21 mm, Strich 7 (0,02 mm); Messschraube 5,5 mm, Trommel 23.') , answer: T('21.14 mm；5.730 mm（精度 0.01 mm）。', '21.14 mm; 5.730 mm (least count 0.01 mm).', '21,14 mm; 5,730 mm (Genauigkeit 0,01 mm).') },
    point: T('螺旋测微器要估读到 0.001 mm；零点误差要减去。', 'A micrometer is read to 0.001 mm by estimation; subtract the zero error.', 'Die Messschraube wird auf 0,001 mm geschätzt; den Nullfehler abziehen.'),
    level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:K02'], links: {}, ...V
  },
  {
    id: 'K03', title: T('非线性拟合与模型选择', 'Nonlinear fitting and model selection', 'Nichtlineare Anpassung und Modellwahl'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('独立同分布高斯残差；最小二乘的残差平方和 RSS 已求出', 'Independent Gaussian residuals; the least-squares RSS is known', 'Unabhängige Gauß-Residuen; die Residuenquadratsumme RSS ist bekannt')],
    validity: T('AIC/BIC 只比较同一数据上的模型', 'AIC/BIC only compare models on the same data', 'AIC/BIC vergleichen nur Modelle auf denselben Daten'), sources: ['S08'],
    inputs: [pos('n', 'n', T('数据点数', 'Number of points', 'Anzahl der Punkte'), '', 'ratio', 20), pos('rss1', 'RSS_1', T('模型 1 的残差平方和', 'RSS of model 1', 'RSS von Modell 1'), '', 'ratio', 0.8), pos('k1', 'k_1', T('模型 1 的参数个数', 'Parameters of model 1', 'Parameter von Modell 1'), '', 'ratio', 2), pos('rss2', 'RSS_2', T('模型 2 的残差平方和', 'RSS of model 2', 'RSS von Modell 2'), '', 'ratio', 0.5), pos('k2', 'k_2', T('模型 2 的参数个数', 'Parameters of model 2', 'Parameter von Modell 2'), '', 'ratio', 3)],
    outputs: [out('aic1', 'AIC_1', T('模型 1 的 AIC', 'AIC of model 1', 'AIC von Modell 1'), '', 'n*log(rss1/n) + 2*k1'), out('aic2', 'AIC_2', T('模型 2 的 AIC', 'AIC of model 2', 'AIC von Modell 2'), '', 'n*log(rss2/n) + 2*k2'), out('daic', '\\Delta AIC', T('AIC₂ − AIC₁', 'AIC₂ − AIC₁', 'AIC₂ − AIC₁'), '', 'n*log(rss2/rss1) + 2*(k2 - k1)'), out('bic1', 'BIC_1', T('模型 1 的 BIC', 'BIC of model 1', 'BIC von Modell 1'), '', 'n*log(rss1/n) + k1*log(n)'), out('bic2', 'BIC_2', T('模型 2 的 BIC', 'BIC of model 2', 'BIC von Modell 2'), '', 'n*log(rss2/n) + k2*log(n)'), out('w2', 'w_2', T('模型 2 的 Akaike 权重', 'Akaike weight of model 2', 'Akaike-Gewicht von Modell 2'), '', '1/(1 + exp((n*log(rss2/rss1) + 2*(k2 - k1))/2))')],
    example: { text: T('20 个点：线性模型 RSS = 0.8（2 参数），指数模型 RSS = 0.5（3 参数）。', '20 points: linear RSS = 0.8 (2 parameters), exponential RSS = 0.5 (3 parameters).', '20 Punkte: linear RSS = 0,8 (2 Parameter), exponentiell RSS = 0,5 (3 Parameter).'), answer: T('AIC₁ = −60.378，AIC₂ = −67.778，ΔAIC = −7.40；模型 2 的权重 0.976。', 'AIC₁ = −60.378, AIC₂ = −67.778, ΔAIC = −7.40; weight of model 2: 0.976.', 'AIC₁ = −60,378, AIC₂ = −67,778, ΔAIC = −7,40; Gewicht von Modell 2: 0,976.') },
    point: T('参数越多拟合越好，信息准则为此付出惩罚。', 'More parameters always fit better; information criteria charge for them.', 'Mehr Parameter passen immer besser; Informationskriterien bestrafen das.'),
    level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:K03'], links: {}, ...V
  },
  {
    id: 'K04', title: T('梯度、散度与旋度', 'Gradient, divergence and curl', 'Gradient, Divergenz und Rotation'),
    stages: ['u'], priority: 'P2', geometry: 'plane',
    assumptions: [T('势 V = a x² + b y²；速度场 u = (c x − ω y, c y + ω x)', 'Potential V = a x² + b y²; velocity field u = (c x − ω y, c y + ω x)', 'Potential V = a x² + b y²; Geschwindigkeitsfeld u = (c x − ω y, c y + ω x)')],
    validity: T('二维光滑场', 'Smooth two-dimensional fields', 'Glatte zweidimensionale Felder'), sources: ['S08', 'S09'],
    inputs: [inp('a', 'a', T('势的系数 a', 'Coefficient a', 'Koeffizient a'), 'V/m²', 'electricField', 2), inp('b', 'b', T('势的系数 b', 'Coefficient b', 'Koeffizient b'), 'V/m²', 'electricField', 3), inp('x', 'x', L.x, 'm', 'length', 0.1), inp('y', 'y', T('纵坐标', 'y coordinate', 'y-Koordinate'), 'm', 'length', 0.2), inp('c', 'c', T('源强 c', 'Source strength c', 'Quellstärke c'), '1/s', 'frequency', 0.5), inp('w', '\\omega', L.omega, '1/s', 'frequency', 2)],
    outputs: [out('V', 'V', T('电势', 'Potential', 'Potential'), 'V', 'a*x^2 + b*y^2'), out('Ex', 'E_x', T('E 的 x 分量 −∂V/∂x', 'E_x = −∂V/∂x', 'E_x = −∂V/∂x'), 'V/m', '-2*a*x'), out('Ey', 'E_y', T('E 的 y 分量 −∂V/∂y', 'E_y = −∂V/∂y', 'E_y = −∂V/∂y'), 'V/m', '-2*b*y'), out('lap', '\\nabla^2 V', T('拉普拉斯 ∇²V', 'Laplacian ∇²V', 'Laplace ∇²V'), 'V/m²', '2*(a + b)'), out('div', '\\nabla\\cdot u', T('速度场的散度', 'Divergence of u', 'Divergenz von u'), '1/s', '2*c'), out('curl', '(\\nabla\\times u)_z', T('速度场的旋度', 'Curl of u', 'Rotation von u'), '1/s', '2*w')],
    example: { text: T('a = 2、b = 3 V/m²，点 (0.1, 0.2) m；c = 0.5、ω = 2 s⁻¹。', 'a = 2, b = 3 V/m², point (0.1, 0.2) m; c = 0.5, ω = 2 s⁻¹.', 'a = 2, b = 3 V/m², Punkt (0,1; 0,2) m; c = 0,5, ω = 2 s⁻¹.'), answer: T('V = 0.14 V；E = (−0.4, −1.2) V/m；∇²V = 10 V/m²；散度 1 s⁻¹，旋度 4 s⁻¹。', 'V = 0.14 V; E = (−0.4, −1.2) V/m; ∇²V = 10 V/m²; divergence 1 s⁻¹, curl 4 s⁻¹.', 'V = 0,14 V; E = (−0,4; −1,2) V/m; ∇²V = 10 V/m²; Divergenz 1 s⁻¹, Rotation 4 s⁻¹.') },
    point: T('刚体转动的旋度是角速度的两倍；均匀膨胀没有旋度。', 'The curl of a rigid rotation is twice its angular velocity; uniform expansion has none.', 'Die Rotation einer starren Drehung ist das Doppelte der Winkelgeschwindigkeit; gleichmäßige Ausdehnung hat keine.'),
    level: 1, teaching: 0, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:K04'], links: {}, ...V
  },
  {
    id: 'K05', title: T('量纲分析与 π 定理', 'Dimensional analysis and the π theorem', 'Dimensionsanalyse und Π-Theorem'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('物理关系与单位选择无关；单摆周期只依赖 L、g（m 无法组成无量纲量）', 'Physical relations do not depend on the units; a pendulum period can only depend on L and g (m cannot be made dimensionless)', 'Physikalische Gesetze hängen nicht von den Einheiten ab; die Pendelperiode hängt nur von L und g ab')],
    validity: T('常数 C 需由实验或理论给出（小角单摆 C = 2π）', 'The constant C comes from experiment or theory (small-angle pendulum C = 2π)', 'Die Konstante C stammt aus Experiment oder Theorie (kleiner Winkel: C = 2π)'), sources: ['S01'],
    inputs: [pos('nv', 'n', T('变量个数', 'Number of variables', 'Anzahl der Variablen'), '', 'ratio', 4), pos('kd', 'k', T('独立量纲个数', 'Independent dimensions', 'Unabhängige Dimensionen'), '', 'ratio', 3), pos('len', 'L', L.len, 'm', 'length', 1), pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8), pos('C', 'C', T('无量纲常数', 'Dimensionless constant', 'Dimensionslose Konstante'), '', 'ratio', 6.283185307179586)],
    outputs: [out('np', 'n - k', T('无量纲组个数', 'Number of dimensionless groups', 'Anzahl dimensionsloser Gruppen'), '', 'nv - kd'), out('T', 'T', L.T, 's', 'C*sqrt(len/g)')],
    example: { text: T('单摆：T、L、g、m 四个量，三个基本量纲；L = 1 m。', 'Pendulum: T, L, g, m with three base dimensions; L = 1 m.', 'Pendel: T, L, g, m mit drei Grunddimensionen; L = 1 m.'), answer: T('1 个无量纲组 T√(g/L)；T = 2.007 s（C = 2π）。', 'One group T√(g/L); T = 2.007 s (C = 2π).', 'Eine Gruppe T√(g/L); T = 2,007 s (C = 2π).') },
    point: T('量纲分析给出关系的形式，不给出常数。', 'Dimensional analysis gives the form of a relation, not its constant.', 'Die Dimensionsanalyse liefert die Form, nicht die Konstante.'),
    level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:K05'], links: {}, ...V
  },
  {
    id: 'K06', title: T('t 检验与置信区间', 't test and confidence interval', 't-Test und Konfidenzintervall'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('n 次独立测量，近似正态；临界值 t_c 按自由度 n − 1 与置信水平查表', 'n independent, roughly normal measurements; the critical value t_c from the table for n − 1 degrees of freedom', 'n unabhängige, etwa normalverteilte Messungen; kritischer Wert t_c aus der Tabelle für n − 1 Freiheitsgrade')],
    validity: T('样本量太小或分布偏斜时结论不可靠', 'Unreliable for very small or skewed samples', 'Unzuverlässig bei sehr kleinen oder schiefen Stichproben'), sources: ['S08'],
    inputs: [inp('mean', '\\bar x', T('样本均值', 'Sample mean', 'Stichprobenmittel'), 'm/s²', 'acceleration', 9.79), pos('s', 's', T('样本标准差', 'Sample standard deviation', 'Standardabweichung'), 'm/s²', 'acceleration', 0.05), pos('n', 'n', T('测量次数', 'Number of measurements', 'Anzahl der Messungen'), '', 'ratio', 20), inp('mu0', '\\mu_0', T('参考值', 'Reference value', 'Referenzwert'), 'm/s²', 'acceleration', 9.81), pos('tc', 't_c', T('临界值', 'Critical value', 'Kritischer Wert'), '', 'ratio', 2.093)],
    outputs: [out('se', 's_{\\bar x}', T('均值的标准误差', 'Standard error of the mean', 'Standardfehler des Mittels'), 'm/s²', 's/sqrt(n)'), out('t', 't', T('t 统计量', 't statistic', 't-Statistik'), '', '(mean - mu0)/(s/sqrt(n))'), out('lo', '\\bar x - t_c s_{\\bar x}', T('置信区间下限', 'Lower confidence limit', 'Untere Konfidenzgrenze'), 'm/s²', 'mean - tc*s/sqrt(n)'), out('hi', '\\bar x + t_c s_{\\bar x}', T('置信区间上限', 'Upper confidence limit', 'Obere Konfidenzgrenze'), 'm/s²', 'mean + tc*s/sqrt(n)'), out('reject', 'H_0', T('拒绝参考值（1 = 是）', 'Reference rejected (1 = yes)', 'Referenz verworfen (1 = ja)'), '', 'step(abs(mean - mu0)/(s/sqrt(n)) - tc)')],
    example: { text: T('20 次测 g：均值 9.79、标准差 0.05 m/s²，与 9.81 比较（95%，t_c = 2.093）。', '20 measurements of g: mean 9.79, s = 0.05 m/s², against 9.81 (95 %, t_c = 2.093).', '20 Messungen von g: Mittel 9,79, s = 0,05 m/s², gegen 9,81 (95 %, t_c = 2,093).'), answer: T('标准误差 0.0112；t = −1.79；区间 [9.767, 9.813]，不拒绝 9.81。', 'Standard error 0.0112; t = −1.79; interval [9.767, 9.813]; 9.81 is not rejected.', 'Standardfehler 0,0112; t = −1,79; Intervall [9,767; 9,813]; 9,81 wird nicht verworfen.') },
    point: T('“不显著”不等于“相等”；区间才说明精度。', '“Not significant” is not “equal”; the interval shows the precision.', '„Nicht signifikant“ heißt nicht „gleich“; das Intervall zeigt die Genauigkeit.'),
    level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:K06'], links: {}, ...V
  },
  {
    id: 'K07', title: T('非惯性系：离心力与科里奥利力', 'Rotating frames: centrifugal and Coriolis forces', 'Rotierende Bezugssysteme: Zentrifugal- und Corioliskraft'),
    stages: ['u'], priority: 'P2', geometry: 'plane',
    assumptions: [T('匀速转动参考系；速度在转动平面内、与转轴垂直', 'Uniformly rotating frame; velocity in the plane, perpendicular to the axis', 'Gleichförmig rotierendes System; Geschwindigkeit in der Ebene, senkrecht zur Achse')],
    validity: T('虚拟力只在转动参考系中出现', 'Fictitious forces appear only in the rotating frame', 'Scheinkräfte treten nur im rotierenden System auf'), sources: ['S08', 'S12'],
    inputs: [pos('m', 'm', L.m, 'kg', 'mass', 1), nonneg('w', '\\omega', T('平台角速度', 'Angular velocity of the platform', 'Winkelgeschwindigkeit der Plattform'), 'rad/s', 'angularVelocity', 0.5), nonneg('v', 'v', T('相对平台的速率', 'Speed relative to the platform', 'Geschwindigkeit relativ zur Plattform'), 'm/s', 'velocity', 2), nonneg('r', 'r', T('到转轴的距离', 'Distance from the axis', 'Abstand zur Achse'), 'm', 'length', 3), angle('lat', '\\varphi', T('纬度', 'Latitude', 'Breite'), 0.6981317007977318), pos('W', '\\Omega', T('地球自转角速度', 'Angular velocity of the Earth', 'Winkelgeschwindigkeit der Erde'), 'rad/s', 'angularVelocity', 7.2921e-5)],
    outputs: [out('Fc', 'F_C', T('科里奥利力 2mωv', 'Coriolis force 2mωv', 'Corioliskraft 2mωv'), 'N', '2*m*w*v'), out('Fcf', 'F_{cf}', T('离心力 mω²r', 'Centrifugal force mω²r', 'Zentrifugalkraft mω²r'), 'N', 'm*w^2*r'), out('aE', 'a_C', T('地面水平运动的科里奥利加速度', 'Horizontal Coriolis acceleration on the Earth', 'Horizontale Coriolisbeschleunigung auf der Erde'), 'm/s²', '2*W*v*sin(lat)')],
    example: { text: T('1 kg 物体在 0.5 rad/s 的转台上以 2 m/s 运动，距轴 3 m；同样速度在北纬 40° 地面。', '1 kg moving at 2 m/s on a platform turning at 0.5 rad/s, 3 m from the axis; the same speed at 40° N on the Earth.', '1 kg mit 2 m/s auf einer Plattform mit 0,5 rad/s, 3 m von der Achse; dieselbe Geschwindigkeit bei 40° N auf der Erde.'), answer: T('科里奥利力 2 N，离心力 0.75 N；地面 1.87×10⁻⁴ m/s²。', 'Coriolis 2 N, centrifugal 0.75 N; on the Earth 1.87×10⁻⁴ m/s².', 'Coriolis 2 N, zentrifugal 0,75 N; auf der Erde 1,87·10⁻⁴ m/s².') },
    point: T('科里奥利力垂直于相对速度，不做功。', 'The Coriolis force is perpendicular to the relative velocity and does no work.', 'Die Corioliskraft steht senkrecht zur Relativgeschwindigkeit und verrichtet keine Arbeit.'),
    level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:K07'], links: {}, ...V
  },
  {
    id: 'K08', title: T('限制性三体与拉格朗日点', 'Restricted three-body problem and Lagrange points', 'Eingeschränktes Dreikörperproblem und Lagrange-Punkte'),
    stages: ['u'], priority: 'P3', geometry: 'plane',
    assumptions: [T('两主天体作圆轨道，第三体质量可忽略；Hill 近似 μ ≪ 1', 'Two primaries on circular orbits, a massless third body; Hill approximation μ ≪ 1', 'Zwei Hauptkörper auf Kreisbahnen, masseloser dritter Körper; Hill-Näherung μ ≪ 1')],
    validity: T('受限：L1/L2 距离用 Hill 近似（μ 小时误差约 μ^(1/3)/3）；精确位置需解五次方程', 'Restricted: L1/L2 distances by the Hill approximation (error about μ^(1/3)/3 for small μ); exact positions need a quintic', 'Eingeschränkt: L1/L2 nach Hill (Fehler etwa μ^(1/3)/3); exakt braucht eine Gleichung fünften Grades'),
    restricted: T('L1/L2 用 Hill 半径；L4/L5 在等边三角形顶点，稳定判据 μ < 0.0385（Routh）', 'L1/L2 by the Hill radius; L4/L5 at the equilateral points, stable for μ < 0.0385 (Routh)', 'L1/L2 über den Hill-Radius; L4/L5 an den gleichseitigen Punkten, stabil für μ < 0,0385 (Routh)'),
    sources: ['S08'],
    inputs: [nonneg('mu', '\\mu', T('质量比 m₂/(m₁ + m₂)', 'Mass ratio m₂/(m₁ + m₂)', 'Massenverhältnis m₂/(m₁ + m₂)'), '', 'ratio', 3.003e-6), pos('a', 'a', T('两主天体间距', 'Separation of the primaries', 'Abstand der Hauptkörper'), 'm', 'length', 1.496e11)],
    conditions: [cond('small', T('μ ≪ 1（Hill 近似）', 'μ ≪ 1 (Hill approximation)', 'μ ≪ 1 (Hill-Näherung)'), 'mu <= 0.001', 'mu <= 0.05')],
    outputs: [out('rH', 'r_H', T('L1/L2 到小天体的距离（Hill）', 'Distance of L1/L2 from the smaller body (Hill)', 'Abstand L1/L2 vom kleineren Körper (Hill)'), 'm', 'a*cbrt(mu/3)', { requires: ['small'] }), out('L4', 'r_{L4}', T('L4 到两主天体的距离', 'Distance of L4 from both primaries', 'Abstand von L4 zu beiden Hauptkörpern'), 'm', 'a'), out('stable', 's', T('L4/L5 稳定（1 = 是）', 'L4/L5 stable (1 = yes)', 'L4/L5 stabil (1 = ja)'), '', 'step(0.0385208965 - mu)')],
    example: { text: T('日地系统 μ = 3.003×10⁻⁶，a = 1 AU。', 'Sun–Earth, μ = 3.003×10⁻⁶, a = 1 AU.', 'Sonne–Erde, μ = 3,003·10⁻⁶, a = 1 AE.'), answer: T('L1/L2 距地球约 1.50×10⁹ m（150 万千米）；L4/L5 稳定。', 'L1/L2 about 1.50×10⁹ m from the Earth (1.5 million km); L4/L5 stable.', 'L1/L2 etwa 1,50·10⁹ m von der Erde (1,5 Mio. km); L4/L5 stabil.') },
    point: T('L1、L2、L3 不稳定；L4、L5 在质量比足够小时稳定。', 'L1, L2 and L3 are unstable; L4 and L5 are stable for small enough mass ratios.', 'L1, L2 und L3 sind instabil; L4 und L5 sind bei kleinem Massenverhältnis stabil.'),
    level: 1, teaching: 0, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:K08'], links: {}, ...V
  },
  {
    id: 'K09', title: T('剪切模量、体积模量与泊松比', 'Shear modulus, bulk modulus and Poisson’s ratio', 'Schubmodul, Kompressionsmodul und Querkontraktionszahl'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('各向同性线弹性材料，小变形', 'Isotropic linear elastic material, small strains', 'Isotroper linear-elastischer Werkstoff, kleine Verformungen')],
    validity: T('0 ≤ ν < 0.5', '0 ≤ ν < 0.5', '0 ≤ ν < 0,5'), sources: ['S08'],
    inputs: [pos('E', 'E', T('杨氏模量', 'Young’s modulus', 'Elastizitätsmodul'), 'Pa', 'pressure', 200e9), nonneg('nu', '\\nu', T('泊松比', 'Poisson’s ratio', 'Querkontraktionszahl'), '', 'ratio', 0.3), inp('tau', '\\tau', T('剪应力', 'Shear stress', 'Schubspannung'), 'Pa', 'pressure', 50e6), inp('eps', '\\varepsilon', T('纵向应变', 'Axial strain', 'Längsdehnung'), '', 'ratio', 1e-3)],
    conditions: [cond('nu', T('ν < 0.5', 'ν < 0.5', 'ν < 0,5'), 'nu < 0.5')],
    outputs: [out('G', 'G', T('剪切模量', 'Shear modulus', 'Schubmodul'), 'Pa', 'E/(2*(1 + nu))'), out('K', 'K', T('体积模量', 'Bulk modulus', 'Kompressionsmodul'), 'Pa', 'E/(3*(1 - 2*nu))', { requires: ['nu'] }), out('gamma', '\\gamma', T('剪应变', 'Shear strain', 'Schubverzerrung'), '', 'tau*2*(1 + nu)/E'), out('epsT', '\\varepsilon_\\perp', T('横向应变', 'Lateral strain', 'Querdehnung'), '', '-nu*eps'), out('dV', '\\Delta V/V', T('体积应变', 'Volumetric strain', 'Volumendehnung'), '', 'eps*(1 - 2*nu)')],
    example: { text: T('钢 E = 200 GPa、ν = 0.3；剪应力 50 MPa；纵向应变 10⁻³。', 'Steel E = 200 GPa, ν = 0.3; shear stress 50 MPa; axial strain 10⁻³.', 'Stahl E = 200 GPa, ν = 0,3; Schubspannung 50 MPa; Längsdehnung 10⁻³.'), answer: T('G = 76.9 GPa，K = 167 GPa；γ = 6.5×10⁻⁴；横向应变 −3×10⁻⁴；体积应变 4×10⁻⁴。', 'G = 76.9 GPa, K = 167 GPa; γ = 6.5×10⁻⁴; lateral strain −3×10⁻⁴; volumetric 4×10⁻⁴.', 'G = 76,9 GPa, K = 167 GPa; γ = 6,5·10⁻⁴; Querdehnung −3·10⁻⁴; Volumen 4·10⁻⁴.') },
    point: T('ν → 0.5 时材料不可压缩，K → ∞。', 'For ν → 0.5 the material is incompressible, K → ∞.', 'Für ν → 0,5 ist der Werkstoff inkompressibel, K → ∞.'),
    level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:K09'], links: {}, ...V
  },
  {
    id: 'K10', title: T('弹塑性与屈服', 'Elastoplasticity and yield', 'Elastoplastizität und Fließen'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('单轴加载，双线性本构：屈服前 σ = Eε，屈服后切线模量 E_t', 'Uniaxial loading, bilinear law: σ = Eε before yield, tangent modulus E_t after', 'Einachsige Belastung, bilineares Gesetz: σ = Eε vor dem Fließen, Tangentenmodul E_t danach')],
    validity: T('单调加载；卸载按弹性斜率 E', 'Monotonic loading; unloading along the elastic slope E', 'Monotone Belastung; Entlastung entlang der Steigung E'), sources: ['S08'],
    inputs: [pos('E', 'E', T('杨氏模量', 'Young’s modulus', 'Elastizitätsmodul'), 'Pa', 'pressure', 200e9), pos('sy', '\\sigma_y', T('屈服强度', 'Yield stress', 'Fließgrenze'), 'Pa', 'pressure', 250e6), nonneg('Et', 'E_t', T('强化切线模量', 'Hardening tangent modulus', 'Verfestigungsmodul'), 'Pa', 'pressure', 2e9), nonneg('eps', '\\varepsilon', T('总应变', 'Total strain', 'Gesamtdehnung'), '', 'ratio', 0.004)],
    conditions: [cond('yield', T('已屈服（ε > σ_y/E）', 'Yielded (ε > σ_y/E)', 'Geflossen (ε > σ_y/E)'), 'eps > sy/E')],
    outputs: [out('epsY', '\\varepsilon_y', T('屈服应变', 'Yield strain', 'Fließdehnung'), '', 'sy/E'), out('sigma', '\\sigma', T('应力', 'Stress', 'Spannung'), 'Pa', 'if(eps > sy/E, sy + Et*(eps - sy/E), E*eps)'), out('epsP', '\\varepsilon_p', T('卸载后的残余应变', 'Residual strain after unloading', 'Bleibende Dehnung nach Entlastung'), '', 'if(eps > sy/E, eps - (sy + Et*(eps - sy/E))/E, 0)')],
    example: { text: T('E = 200 GPa，σ_y = 250 MPa，E_t = 2 GPa，拉到 ε = 0.4%。', 'E = 200 GPa, σ_y = 250 MPa, E_t = 2 GPa, strained to 0.4 %.', 'E = 200 GPa, σ_y = 250 MPa, E_t = 2 GPa, auf 0,4 % gedehnt.'), answer: T('屈服应变 0.125%；σ = 255.5 MPa；残余应变 0.272%。', 'Yield strain 0.125 %; σ = 255.5 MPa; residual strain 0.272 %.', 'Fließdehnung 0,125 %; σ = 255,5 MPa; bleibend 0,272 %.') },
    point: T('屈服后卸载回不到原长：留下塑性应变。', 'Unloading after yield does not return to the original length: a plastic strain remains.', 'Nach dem Fließen geht die Entlastung nicht auf die Ausgangslänge zurück: Es bleibt plastische Dehnung.'),
    level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:K10'], links: {}, ...V
  },
  {
    id: 'K11', title: T('欧拉压杆屈曲', 'Euler buckling of a column', 'Euler-Knicken eines Stabs'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('细长、直、均匀的线弹性压杆；有效长度系数 K（两端铰支 1，一端固定一端自由 2）', 'Slender, straight, uniform linear elastic column; effective length factor K (pinned–pinned 1, fixed–free 2)', 'Schlanker, gerader, homogener linear-elastischer Stab; Knicklängenbeiwert K (gelenkig–gelenkig 1, eingespannt–frei 2)')],
    validity: T('临界应力低于屈服强度（长细比足够大）', 'The critical stress is below the yield stress (slender enough)', 'Die kritische Spannung liegt unter der Fließgrenze (schlank genug)'), sources: ['S08'],
    inputs: [pos('E', 'E', T('杨氏模量', 'Young’s modulus', 'Elastizitätsmodul'), 'Pa', 'pressure', 200e9), pos('I', 'I', T('截面惯性矩', 'Second moment of area', 'Flächenträgheitsmoment'), 'm⁴', 'length', 8.333e-9), pos('len', 'L', L.len, 'm', 'length', 2), pos('K', 'K', T('有效长度系数', 'Effective length factor', 'Knicklängenbeiwert'), '', 'ratio', 1), pos('Ar', 'A', T('截面积', 'Cross-section', 'Querschnitt'), 'm²', 'area', 1e-4)],
    outputs: [out('P', 'P_{cr}', T('临界载荷', 'Critical load', 'Knicklast'), 'N', 'pi^2*E*I/(K*len)^2'), out('sigma', '\\sigma_{cr}', T('临界应力', 'Critical stress', 'Knickspannung'), 'Pa', 'pi^2*E*I/((K*len)^2*Ar)'), out('lam', '\\lambda', T('长细比', 'Slenderness ratio', 'Schlankheitsgrad'), '', 'K*len/sqrt(I/Ar)')],
    example: { text: T('钢杆 E = 200 GPa，I = 8.333×10⁻⁹ m⁴，L = 2 m，两端铰支，A = 1 cm²。', 'Steel bar E = 200 GPa, I = 8.333×10⁻⁹ m⁴, L = 2 m, pinned ends, A = 1 cm².', 'Stahlstab E = 200 GPa, I = 8,333·10⁻⁹ m⁴, L = 2 m, gelenkig, A = 1 cm².'), answer: T('P_cr = 4.11 kN；σ_cr = 41.1 MPa；长细比 219。', 'P_cr = 4.11 kN; σ_cr = 41.1 MPa; slenderness 219.', 'P_cr = 4,11 kN; σ_cr = 41,1 MPa; Schlankheit 219.') },
    point: T('长度加倍，临界载荷降为四分之一。', 'Doubling the length divides the critical load by four.', 'Doppelte Länge viertelt die Knicklast.'),
    level: 1, teaching: 0, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:K11'], links: {}, ...V
  },
  {
    id: 'K12', title: T('黏弹性：应力松弛与蠕变', 'Viscoelasticity: stress relaxation and creep', 'Viskoelastizität: Spannungsrelaxation und Kriechen'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('Maxwell 模型（弹簧与阻尼串联）描述松弛，Kelvin–Voigt 模型（并联）描述蠕变', 'Maxwell model (spring and dashpot in series) for relaxation, Kelvin–Voigt (in parallel) for creep', 'Maxwell-Modell (Feder und Dämpfer in Reihe) für Relaxation, Kelvin-Voigt (parallel) für Kriechen')],
    validity: T('线性黏弹性，单一松弛时间', 'Linear viscoelasticity, one relaxation time', 'Lineare Viskoelastizität, eine Relaxationszeit'), sources: ['S08'],
    inputs: [pos('E', 'E', T('弹性模量', 'Elastic modulus', 'Elastizitätsmodul'), 'Pa', 'pressure', 1e6), pos('eta', '\\eta', T('黏度', 'Viscosity', 'Viskosität'), 'Pa·s', 'viscosity', 1e7), inp('eps0', '\\varepsilon_0', T('阶跃应变', 'Step strain', 'Sprungdehnung'), '', 'ratio', 0.01), inp('s0', '\\sigma_0', T('阶跃应力', 'Step stress', 'Sprungspannung'), 'Pa', 'pressure', 1e4), nonneg('t', 't', L.t, 's', 'time', 5)],
    outputs: [out('tau', '\\tau', T('松弛时间 η/E', 'Relaxation time η/E', 'Relaxationszeit η/E'), 's', 'eta/E'), out('sM', '\\sigma(t)', T('Maxwell 松弛应力', 'Maxwell relaxation stress', 'Maxwell-Relaxationsspannung'), 'Pa', 'E*eps0*exp(-t*E/eta)'), out('eK', '\\varepsilon(t)', T('Kelvin 蠕变应变', 'Kelvin creep strain', 'Kelvin-Kriechdehnung'), '', 's0/E*(1 - exp(-t*E/eta))')],
    example: { text: T('E = 1 MPa，η = 10⁷ Pa·s；ε₀ = 1%，σ₀ = 10 kPa；t = 5 s。', 'E = 1 MPa, η = 10⁷ Pa·s; ε₀ = 1 %, σ₀ = 10 kPa; t = 5 s.', 'E = 1 MPa, η = 10⁷ Pa·s; ε₀ = 1 %, σ₀ = 10 kPa; t = 5 s.'), answer: T('τ = 10 s；松弛应力 6.07 kPa；蠕变应变 0.393%。', 'τ = 10 s; relaxation stress 6.07 kPa; creep strain 0.393 %.', 'τ = 10 s; Relaxationsspannung 6,07 kPa; Kriechdehnung 0,393 %.') },
    point: T('同一个 τ = η/E 决定松弛和蠕变的快慢。', 'The same τ = η/E sets the pace of relaxation and creep.', 'Dasselbe τ = η/E bestimmt Relaxation und Kriechen.'),
    level: 1, teaching: 0, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:K12'], links: {}, ...V
  },
  {
    id: 'K13', title: T('浅水波与色散', 'Shallow-water waves and dispersion', 'Flachwasserwellen und Dispersion'),
    stages: ['u'], priority: 'P2', geometry: 'section2d',
    assumptions: [A.incompressible, T('小振幅重力波（线性），无表面张力', 'Small-amplitude gravity waves (linear), no surface tension', 'Schwerewellen kleiner Amplitude (linear), ohne Oberflächenspannung')],
    validity: T('h ≪ λ 时 c → √(gh)', 'For h ≪ λ, c → √(gh)', 'Für h ≪ λ geht c → √(gh)'), sources: ['S17', 'S08'],
    inputs: [pos('h', 'h', T('水深', 'Depth', 'Wassertiefe'), 'm', 'length', 2), pos('lam', '\\lambda', L.lambda, 'm', 'length', 20), pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8)],
    outputs: [out('cs', 'c_0', T('浅水波速 √(gh)', 'Shallow-water speed √(gh)', 'Flachwassergeschwindigkeit √(gh)'), 'm/s', 'sqrt(g*h)'), out('c', 'c', T('线性色散关系的波速', 'Speed from the linear dispersion relation', 'Geschwindigkeit aus der Dispersionsrelation'), 'm/s', 'sqrt(g*lam/(2*pi)*tanh(2*pi*h/lam))'), out('ratio', 'c/c_0', T('比值', 'Ratio', 'Verhältnis'), '', 'sqrt(g*lam/(2*pi)*tanh(2*pi*h/lam))/sqrt(g*h)')],
    example: { text: T('水深 2 m，波长 20 m。', 'Depth 2 m, wavelength 20 m.', 'Tiefe 2 m, Wellenlänge 20 m.'), answer: T('√(gh) = 4.43 m/s；色散关系 4.17 m/s（比值 0.941）。', '√(gh) = 4.43 m/s; dispersion relation 4.17 m/s (ratio 0.941).', '√(gh) = 4,43 m/s; Dispersionsrelation 4,17 m/s (Verhältnis 0,941).') },
    point: T('水越浅波越慢——海啸在近岸变高、变慢。', 'Shallower water, slower waves: a tsunami slows and grows near the shore.', 'Flacheres Wasser, langsamere Wellen: Ein Tsunami wird an der Küste langsamer und höher.'),
    level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:K13'], links: {}, ...V
  },
  {
    id: 'K14', title: T('温室效应与行星平衡温度', 'Greenhouse effect and planetary equilibrium temperature', 'Treibhauseffekt und Gleichgewichtstemperatur'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('行星为黑体；单层大气对长波的发射率 ε，对短波透明', 'Black-body planet; a single atmospheric layer with long-wave emissivity ε, transparent to sunlight', 'Schwarzer Planet; eine Atmosphärenschicht mit Emissionsgrad ε im Langwelligen, durchlässig für Sonnenlicht')],
    validity: T('教学模型：忽略对流、云与反馈', 'Teaching model: no convection, clouds or feedback', 'Lehrmodell: ohne Konvektion, Wolken und Rückkopplung'), sources: ['S08'],
    inputs: [pos('S0', 'S_0', T('太阳常数', 'Solar constant', 'Solarkonstante'), 'W/m²', 'intensity', 1361), nonneg('al', '\\alpha', T('反照率', 'Albedo', 'Albedo'), '', 'ratio', 0.3), nonneg('ep', '\\varepsilon', T('大气长波发射率', 'Long-wave emissivity of the atmosphere', 'Langwelliger Emissionsgrad der Atmosphäre'), '', 'ratio', 0.78), pos('sig', '\\sigma', T('斯特藩-玻尔兹曼常量', 'Stefan–Boltzmann constant', 'Stefan-Boltzmann-Konstante'), 'W/(m²·K⁴)', 'intensity', 5.670374419e-8)],
    outputs: [out('Te', 'T_e', T('无大气的平衡温度', 'Equilibrium temperature without atmosphere', 'Gleichgewichtstemperatur ohne Atmosphäre'), 'K', 'sqrt(sqrt(S0*(1 - al)/(4*sig)))'), out('Ts', 'T_s', T('有单层大气的地表温度', 'Surface temperature with one layer', 'Oberflächentemperatur mit einer Schicht'), 'K', 'sqrt(sqrt(S0*(1 - al)/(4*sig)))*(2/(2 - ep))^(1/4)'), out('dT', '\\Delta T', T('温室增温', 'Greenhouse warming', 'Treibhauserwärmung'), 'K', 'sqrt(sqrt(S0*(1 - al)/(4*sig)))*((2/(2 - ep))^(1/4) - 1)')],
    example: { text: T('地球：S₀ = 1361 W/m²，反照率 0.3，ε = 0.78。', 'Earth: S₀ = 1361 W/m², albedo 0.3, ε = 0.78.', 'Erde: S₀ = 1361 W/m², Albedo 0,3, ε = 0,78.'), answer: T('T_e = 254.6 K；T_s = 288.1 K；增温 33.5 K。', 'T_e = 254.6 K; T_s = 288.1 K; warming 33.5 K.', 'T_e = 254,6 K; T_s = 288,1 K; Erwärmung 33,5 K.') },
    point: T('太阳辐射只照在截面 πR² 上，散热却来自全部表面 4πR²，所以有因子 4。', 'Sunlight falls on the cross-section πR², heat leaves the whole surface 4πR²: hence the factor 4.', 'Sonnenlicht trifft auf den Querschnitt πR², Wärme verlässt die ganze Oberfläche 4πR²: daher der Faktor 4.'),
    level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:K14'], links: {}, ...V
  },
  {
    id: 'K15', title: T('热阻网络与多层墙', 'Thermal resistance networks and layered walls', 'Wärmewiderstände und mehrschichtige Wände'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'line1d',
    assumptions: [A.steady, T('一维稳态导热；两层串联，内外表面对流换热', 'One-dimensional steady conduction; two layers in series with convection at both surfaces', 'Eindimensionale stationäre Wärmeleitung; zwei Schichten in Reihe mit Konvektion an beiden Oberflächen')],
    validity: T('热阻串联相加，与电阻类比', 'Thermal resistances in series add, like electrical ones', 'Wärmewiderstände in Reihe addieren sich wie elektrische'), sources: ['S08'],
    inputs: [pos('k1', 'k_1', T('第一层热导率', 'Conductivity of layer 1', 'Wärmeleitfähigkeit Schicht 1'), 'W/(m·K)', 'thermalConductivity', 0.8), pos('d1', 'd_1', T('第一层厚度', 'Thickness of layer 1', 'Dicke Schicht 1'), 'm', 'length', 0.2), pos('k2', 'k_2', T('第二层热导率', 'Conductivity of layer 2', 'Wärmeleitfähigkeit Schicht 2'), 'W/(m·K)', 'thermalConductivity', 0.04), pos('d2', 'd_2', T('第二层厚度', 'Thickness of layer 2', 'Dicke Schicht 2'), 'm', 'length', 0.05), pos('Ar', 'A', L.A, 'm²', 'area', 10), inp('Ti', 'T_i', T('室内温度', 'Inside temperature', 'Innentemperatur'), 'K', 'temperature', 293.15), inp('To', 'T_o', T('室外温度', 'Outside temperature', 'Außentemperatur'), 'K', 'temperature', 273.15), pos('hi', 'h_i', T('内表面换热系数', 'Inside film coefficient', 'Wärmeübergang innen'), 'W/(m²·K)', 'heatTransfer', 8), pos('ho', 'h_o', T('外表面换热系数', 'Outside film coefficient', 'Wärmeübergang außen'), 'W/(m²·K)', 'heatTransfer', 25)],
    outputs: [out('R', 'R', T('总热阻', 'Total thermal resistance', 'Gesamtwärmewiderstand'), 'K/W', '1/(hi*Ar) + d1/(k1*Ar) + d2/(k2*Ar) + 1/(ho*Ar)'), out('Q', '\\dot Q', T('热流', 'Heat flow', 'Wärmestrom'), 'W', '(Ti - To)/(1/(hi*Ar) + d1/(k1*Ar) + d2/(k2*Ar) + 1/(ho*Ar))'), out('T12', 'T_{12}', T('两层交界面温度', 'Temperature between the layers', 'Temperatur zwischen den Schichten'), 'K', 'Ti - (Ti - To)/(1/(hi*Ar) + d1/(k1*Ar) + d2/(k2*Ar) + 1/(ho*Ar))*(1/(hi*Ar) + d1/(k1*Ar))')],
    example: { text: T('砖 20 cm（k = 0.8）+ 保温 5 cm（k = 0.04），10 m²，室内 20 °C、室外 0 °C。', 'Brick 20 cm (k = 0.8) + insulation 5 cm (k = 0.04), 10 m², 20 °C inside, 0 °C outside.', 'Ziegel 20 cm (k = 0,8) + Dämmung 5 cm (k = 0,04), 10 m², innen 20 °C, außen 0 °C.'), answer: T('R = 0.1665 K/W；热流 120.1 W；交界面 15.50 °C。', 'R = 0.1665 K/W; heat flow 120.1 W; interface 15.50 °C.', 'R = 0,1665 K/W; Wärmestrom 120,1 W; Grenzfläche 15,50 °C.') },
    point: T('温度降主要落在热阻最大的保温层上。', 'Most of the temperature drop is across the largest resistance, the insulation.', 'Der größte Temperaturabfall liegt am größten Widerstand, der Dämmung.'),
    level: 1, teaching: 0, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:K15'], links: {}, ...V
  },
  {
    id: 'K16', title: T('制冷机与热泵', 'Refrigerators and heat pumps', 'Kältemaschinen und Wärmepumpen'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('理想（可逆）循环工作在两个热源之间', 'Ideal (reversible) cycle between two reservoirs', 'Idealer (reversibler) Kreisprozess zwischen zwei Wärmebädern')],
    validity: T('实际 COP 低于可逆极限', 'Real COPs are below the reversible limit', 'Reale Leistungszahlen liegen unter der reversiblen Grenze'), sources: ['S08'],
    inputs: [pos('Tc', 'T_c', T('低温热源', 'Cold reservoir', 'Kaltes Bad'), 'K', 'temperature', 268.15), pos('Th', 'T_h', T('高温热源', 'Hot reservoir', 'Warmes Bad'), 'K', 'temperature', 308.15), nonneg('W', 'W', L.W, 'J', 'energy', 1000)],
    conditions: [cond('order', T('T_h > T_c', 'T_h > T_c', 'T_h > T_c'), 'Th > Tc')],
    outputs: [out('copC', 'COP_c', T('制冷系数上限', 'Maximum COP of a refrigerator', 'Maximale Leistungszahl (Kälte)'), '', 'Tc/(Th - Tc)', { requires: ['order'] }), out('copH', 'COP_h', T('热泵制热系数上限', 'Maximum COP of a heat pump', 'Maximale Leistungszahl (Wärme)'), '', 'Th/(Th - Tc)', { requires: ['order'] }), out('Qc', 'Q_c', T('最多吸收的热量', 'Heat taken in at most', 'Höchstens aufgenommene Wärme'), 'J', 'Tc/(Th - Tc)*W', { requires: ['order'] }), out('Qh', 'Q_h', T('最多放出的热量', 'Heat delivered at most', 'Höchstens abgegebene Wärme'), 'J', 'Th/(Th - Tc)*W', { requires: ['order'] })],
    example: { text: T('室外 −5 °C，室内 35 °C 散热器，输入功 1 kJ。', 'Outside −5 °C, radiators at 35 °C, 1 kJ of work.', 'Außen −5 °C, Heizkörper 35 °C, 1 kJ Arbeit.'), answer: T('制冷 COP ≤ 6.70；热泵 COP ≤ 7.70；最多送入 7.70 kJ 热量。', 'Refrigerator COP ≤ 6.70; heat pump COP ≤ 7.70; at most 7.70 kJ of heat.', 'Kälte ≤ 6,70; Wärmepumpe ≤ 7,70; höchstens 7,70 kJ Wärme.') },
    point: T('COP_h = COP_c + 1：热泵送出的热量包括输入的功。', 'COP_h = COP_c + 1: the heat delivered includes the work put in.', 'COP_h = COP_c + 1: Die abgegebene Wärme enthält die zugeführte Arbeit.'),
    level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:K16'], links: {}, ...V
  },
  {
    id: 'K17', title: T('辐照度与逆平方律', 'Irradiance and the inverse-square law', 'Bestrahlungsstärke und Abstandsgesetz'),
    stages: ['s'], priority: 'P1', geometry: 'space3d',
    assumptions: [T('各向同性点光源，无吸收；斜入射按余弦定律', 'Isotropic point source, no absorption; oblique incidence by the cosine law', 'Isotrope Punktquelle, keine Absorption; schräger Einfall nach dem Kosinusgesetz')],
    validity: T('距离远大于光源尺寸', 'Distance much larger than the source', 'Abstand viel größer als die Quelle'), sources: ['S08'],
    inputs: [pos('P', 'P', L.P, 'W', 'power', 100), pos('r', 'r', L.d, 'm', 'length', 2), angle('th', '\\theta', T('入射角', 'Angle of incidence', 'Einfallswinkel'), 0.5235987755982988)],
    outputs: [out('E', 'E', T('辐照度', 'Irradiance', 'Bestrahlungsstärke'), 'W/m²', 'P*cos(th)/(4*pi*r^2)'), out('E0', 'E_0', T('正入射辐照度', 'Irradiance at normal incidence', 'Bestrahlungsstärke bei senkrechtem Einfall'), 'W/m²', 'P/(4*pi*r^2)')],
    example: { text: T('100 W 点光源，距离 2 m，入射角 30°。', '100 W point source, 2 m away, 30° incidence.', '100-W-Punktquelle, 2 m, 30° Einfall.'), answer: T('1.72 W/m²；正入射 1.99 W/m²。', '1.72 W/m²; normal incidence 1.99 W/m².', '1,72 W/m²; senkrecht 1,99 W/m².') },
    point: T('距离加倍，辐照度变为四分之一。', 'Twice the distance, a quarter of the irradiance.', 'Doppelter Abstand, ein Viertel der Bestrahlungsstärke.'),
    level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:K17'], links: {}, ...V
  },
  {
    id: 'K18', title: T('高斯光束', 'Gaussian beams', 'Gaußstrahlen'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('傍轴近似，TEM₀₀ 模，束腰在 z = 0', 'Paraxial approximation, TEM₀₀ mode, waist at z = 0', 'Paraxiale Näherung, TEM₀₀-Mode, Taille bei z = 0')],
    validity: T('束腰远大于波长', 'Waist much larger than the wavelength', 'Taille viel größer als die Wellenlänge'), sources: ['S08'],
    inputs: [pos('lam', '\\lambda', L.lambda, 'm', 'length', 633e-9), pos('w0', 'w_0', T('束腰半径', 'Waist radius', 'Taillenradius'), 'm', 'length', 5e-4), pos('z', 'z', T('传播距离', 'Distance from the waist', 'Abstand von der Taille'), 'm', 'length', 1)],
    outputs: [out('zR', 'z_R', T('瑞利长度', 'Rayleigh range', 'Rayleigh-Länge'), 'm', 'pi*w0^2/lam'), out('w', 'w(z)', T('光斑半径', 'Beam radius', 'Strahlradius'), 'm', 'w0*sqrt(1 + (z*lam/(pi*w0^2))^2)'), out('R', 'R(z)', T('波前曲率半径', 'Radius of curvature', 'Krümmungsradius'), 'm', 'z*(1 + (pi*w0^2/(lam*z))^2)'), out('th', '\\theta', T('远场发散半角', 'Far-field half-angle', 'Fernfeld-Halbwinkel'), 'rad', 'lam/(pi*w0)'), out('gouy', '\\zeta', T('古伊相位', 'Gouy phase', 'Gouy-Phase'), 'rad', 'atan(z*lam/(pi*w0^2))')],
    example: { text: T('He-Ne 激光 633 nm，束腰 0.5 mm，距束腰 1 m。', 'He-Ne laser 633 nm, waist 0.5 mm, 1 m from the waist.', 'He-Ne-Laser 633 nm, Taille 0,5 mm, 1 m davon.'), answer: T('z_R = 1.24 m；w = 0.642 mm；R = 2.54 m；发散半角 0.403 mrad。', 'z_R = 1.24 m; w = 0.642 mm; R = 2.54 m; half-angle 0.403 mrad.', 'z_R = 1,24 m; w = 0,642 mm; R = 2,54 m; Halbwinkel 0,403 mrad.') },
    point: T('束腰越细，光束发散越快。', 'The narrower the waist, the faster the beam spreads.', 'Je schmaler die Taille, desto schneller divergiert der Strahl.'),
    level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:K18'], links: {}, ...V
  },
  {
    id: 'K19', title: T('色差与球差', 'Chromatic and spherical aberration', 'Chromatische und sphärische Aberration'),
    stages: ['u'], priority: 'P2', geometry: 'plane',
    assumptions: [T('薄双凸透镜（磨镜者公式）；球面镜的边缘光线按精确几何反射', 'Thin biconvex lens (lensmaker’s formula); marginal ray on a spherical mirror reflected exactly', 'Dünne Bikonvexlinse (Linsenschleiferformel); Randstrahl am Kugelspiegel exakt reflektiert')],
    validity: T('近轴焦距与有限孔径的差别', 'Paraxial focus against finite aperture', 'Paraxialer Brennpunkt gegen endliche Öffnung'), sources: ['S08'],
    inputs: [pos('nF', 'n_F', T('蓝光折射率（486 nm）', 'Index for blue (486 nm)', 'Brechzahl blau (486 nm)'), '', 'ratio', 1.5224), pos('nd', 'n_d', T('黄光折射率（588 nm）', 'Index for yellow (588 nm)', 'Brechzahl gelb (588 nm)'), '', 'ratio', 1.5168), pos('nC', 'n_C', T('红光折射率（656 nm）', 'Index for red (656 nm)', 'Brechzahl rot (656 nm)'), '', 'ratio', 1.5143), pos('R1', 'R_1', T('前表面曲率半径', 'Front radius', 'Vorderer Radius'), 'm', 'length', 0.1), pos('R2', 'R_2', T('后表面曲率半径（取正值）', 'Back radius (positive)', 'Hinterer Radius (positiv)'), 'm', 'length', 0.1), pos('Rm', 'R_m', T('球面镜曲率半径', 'Mirror radius', 'Spiegelradius'), 'm', 'length', 0.5), pos('hh', 'h', T('边缘光线高度', 'Height of the marginal ray', 'Höhe des Randstrahls'), 'm', 'length', 0.05)],
    conditions: [cond('ray', T('h < R_m', 'h < R_m', 'h < R_m'), 'hh < Rm')],
    outputs: [out('fF', 'f_F', T('蓝光焦距', 'Focal length (blue)', 'Brennweite blau'), 'm', '1/((nF - 1)*(1/R1 + 1/R2))'), out('fd', 'f_d', T('黄光焦距', 'Focal length (yellow)', 'Brennweite gelb'), 'm', '1/((nd - 1)*(1/R1 + 1/R2))'), out('fC', 'f_C', T('红光焦距', 'Focal length (red)', 'Brennweite rot'), 'm', '1/((nC - 1)*(1/R1 + 1/R2))'), out('df', '\\Delta f', T('纵向色差 f_C − f_F', 'Longitudinal chromatic aberration f_C − f_F', 'Längsfarbfehler f_C − f_F'), 'm', '1/((nC - 1)*(1/R1 + 1/R2)) - 1/((nF - 1)*(1/R1 + 1/R2))'), out('Vd', 'V_d', T('阿贝数', 'Abbe number', 'Abbe-Zahl'), '', '(nd - 1)/(nF - nC)'), out('lsa', 'LSA', T('球面镜的纵向球差', 'Longitudinal spherical aberration of the mirror', 'Längsaberration des Kugelspiegels'), 'm', 'Rm/2 - Rm + Rm/(2*sqrt(1 - (hh/Rm)^2))', { requires: ['ray'] })],
    example: { text: T('BK7 双凸透镜 R = 10 cm；球面镜 R = 50 cm，边缘光线高 5 cm。', 'BK7 biconvex lens R = 10 cm; mirror R = 50 cm, marginal ray at 5 cm.', 'BK7-Bikonvexlinse R = 10 cm; Spiegel R = 50 cm, Randstrahl bei 5 cm.'), answer: T('f_d = 96.75 mm；色差 1.51 mm；阿贝数 63.8；球差 1.26 mm。', 'f_d = 96.75 mm; chromatic 1.51 mm; Abbe number 63.8; spherical 1.26 mm.', 'f_d = 96,75 mm; Farbfehler 1,51 mm; Abbe-Zahl 63,8; sphärisch 1,26 mm.') },
    point: T('理想薄透镜公式只对近轴单色光精确。', 'The ideal thin-lens formula is exact only for paraxial monochromatic light.', 'Die ideale Linsenformel gilt exakt nur für paraxiales monochromatisches Licht.'),
    level: 1, teaching: 0, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:K19'], links: {}, ...V
  },
  {
    id: 'K20', title: T('理想运算放大器', 'The ideal operational amplifier', 'Der ideale Operationsverstärker'),
    stages: ['u'], priority: 'P2', geometry: 'lumped',
    assumptions: [T('理想运放：开环增益无穷大、输入电流为零（虚短、虚断）；输出受电源电压限幅', 'Ideal op-amp: infinite open-loop gain, no input current (virtual short); output limited by the supply', 'Idealer OPV: unendliche Verstärkung, kein Eingangsstrom (virtueller Kurzschluss); Ausgang durch die Versorgung begrenzt')],
    validity: T('负反馈且输出未饱和时线性', 'Linear with negative feedback while the output is not saturated', 'Linear bei Gegenkopplung, solange der Ausgang nicht sättigt'), sources: ['S51'],
    inputs: [pos('Rin', 'R_{in}', T('输入电阻', 'Input resistor', 'Eingangswiderstand'), 'Ω', 'resistance', 10e3), pos('Rf', 'R_f', T('反馈电阻', 'Feedback resistor', 'Rückkopplungswiderstand'), 'Ω', 'resistance', 47e3), inp('Vin', 'V_{in}', T('输入电压', 'Input voltage', 'Eingangsspannung'), 'V', 'voltage', 0.2), pos('Vs', 'V_{sat}', T('饱和电压', 'Saturation voltage', 'Sättigungsspannung'), 'V', 'voltage', 12)],
    outputs: [out('Gi', 'G_-', T('反相放大倍数', 'Inverting gain', 'Invertierende Verstärkung'), '', '-Rf/Rin'), out('Gn', 'G_+', T('同相放大倍数', 'Non-inverting gain', 'Nichtinvertierende Verstärkung'), '', '1 + Rf/Rin'), out('Vi', 'V_-', T('反相输出', 'Inverting output', 'Invertierender Ausgang'), 'V', 'clamp(-Rf/Rin*Vin, -Vs, Vs)'), out('Vn', 'V_+', T('同相输出', 'Non-inverting output', 'Nichtinvertierender Ausgang'), 'V', 'clamp((1 + Rf/Rin)*Vin, -Vs, Vs)')],
    example: { text: T('R_in = 10 kΩ，R_f = 47 kΩ，输入 0.2 V，电源 ±12 V。', 'R_in = 10 kΩ, R_f = 47 kΩ, 0.2 V input, ±12 V supply.', 'R_in = 10 kΩ, R_f = 47 kΩ, 0,2 V Eingang, ±12 V.'), answer: T('反相 −4.7 倍，输出 −0.94 V；同相 5.7 倍，输出 1.14 V。', 'Inverting ×(−4.7): −0.94 V; non-inverting ×5.7: 1.14 V.', 'Invertierend ×(−4,7): −0,94 V; nichtinvertierend ×5,7: 1,14 V.') },
    point: T('放大倍数由外部电阻决定，与运放本身几乎无关。', 'The gain is set by the external resistors, hardly by the op-amp itself.', 'Die Verstärkung bestimmen die äußeren Widerstände, kaum der OPV selbst.'),
    level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:K20'], links: {}, ...V
  },
  {
    id: 'K21', title: T('逻辑门与半加器', 'Logic gates and the half adder', 'Logikgatter und Halbaddierer'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'lumped',
    assumptions: [T('输入取 0 或 1；每级门延迟 t_pd', 'Inputs are 0 or 1; each gate delays by t_pd', 'Eingänge 0 oder 1; jedes Gatter verzögert um t_pd')],
    validity: T('理想数字电平', 'Ideal digital levels', 'Ideale Logikpegel'), sources: ['S51'],
    inputs: [nonneg('A', 'A', T('输入 A', 'Input A', 'Eingang A'), '', 'ratio', 1), nonneg('B', 'B', T('输入 B', 'Input B', 'Eingang B'), '', 'ratio', 1), nonneg('tpd', 't_{pd}', T('单级门延迟', 'Delay per gate', 'Verzögerung je Gatter'), 's', 'time', 1e-8), nonneg('ng', 'n', T('串联的门级数', 'Gates in series', 'Gatter in Reihe'), '', 'ratio', 3)],
    conditions: [cond('bits', T('输入为 0 或 1', 'Inputs are 0 or 1', 'Eingänge sind 0 oder 1'), 'abs(A*(1 - A)) <= 0 && abs(B*(1 - B)) <= 0')],
    outputs: [out('and', 'A\\cdot B', T('与', 'AND', 'UND'), '', 'A*B', { requires: ['bits'] }), out('or', 'A + B', T('或', 'OR', 'ODER'), '', 'A + B - A*B', { requires: ['bits'] }), out('xor', 'A\\oplus B', T('异或（半加器的和）', 'XOR (sum of the half adder)', 'XOR (Summe des Halbaddierers)'), '', 'A + B - 2*A*B', { requires: ['bits'] }), out('nand', '\\overline{AB}', T('与非', 'NAND', 'NAND'), '', '1 - A*B', { requires: ['bits'] }), out('delay', 't', T('链路总延迟', 'Delay of the chain', 'Laufzeit der Kette'), 's', 'ng*tpd')],
    example: { text: T('A = 1、B = 1；三级门串联，每级 10 ns。', 'A = 1, B = 1; three gates in series, 10 ns each.', 'A = 1, B = 1; drei Gatter in Reihe, je 10 ns.'), answer: T('与 1，或 1，异或 0（进位 1），与非 0；延迟 30 ns。', 'AND 1, OR 1, XOR 0 (carry 1), NAND 0; delay 30 ns.', 'UND 1, ODER 1, XOR 0 (Übertrag 1), NAND 0; Laufzeit 30 ns.') },
    point: T('与非门可以组成任何逻辑函数。', 'NAND gates alone can build any logic function.', 'Mit NAND-Gattern allein lässt sich jede Logikfunktion bauen.'),
    level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:K21'], links: {}, ...V
  },
  {
    id: 'K22', title: T('电池容量、能量与续航', 'Battery capacity, energy and run time', 'Akkukapazität, Energie und Laufzeit'),
    stages: ['j', 's'], priority: 'P1', geometry: 'lumped',
    assumptions: [T('恒定电压与恒定功率放电；效率 η 计入转换损耗', 'Constant voltage and constant-power discharge; efficiency η covers conversion losses', 'Konstante Spannung und Leistung; Wirkungsgrad η umfasst Wandlungsverluste')],
    validity: T('估算：实际电压随电量下降', 'Estimate: the real voltage drops as the charge is used', 'Schätzung: Die reale Spannung sinkt mit der Ladung'), sources: ['S51'],
    inputs: [pos('Q', 'Q', T('容量（电荷量）', 'Capacity (charge)', 'Kapazität (Ladung)'), 'C', 'charge', 12960), pos('U', 'U', L.U, 'V', 'voltage', 3.7), pos('P', 'P', T('负载功率', 'Load power', 'Lastleistung'), 'W', 'power', 2), pos('eta', '\\eta', T('效率', 'Efficiency', 'Wirkungsgrad'), '', 'ratio', 0.9)],
    outputs: [out('E', 'E', T('储存的能量', 'Stored energy', 'Gespeicherte Energie'), 'J', 'Q*U'), out('t', 't', T('续航时间', 'Run time', 'Laufzeit'), 's', 'eta*Q*U/P'), out('I', 'I', T('平均电流', 'Average current', 'Mittlerer Strom'), 'A', 'P/(eta*U)')],
    example: { text: T('3600 mAh（12960 C）、3.7 V 的电池，负载 2 W，效率 90%。', 'A 3600 mAh (12960 C), 3.7 V battery, 2 W load, 90 % efficiency.', 'Ein Akku mit 3600 mAh (12960 C), 3,7 V, 2 W Last, 90 %.'), answer: T('能量 47 952 J（13.3 Wh）；续航 21 578 s（约 6.0 h）。', 'Energy 47,952 J (13.3 Wh); run time 21,578 s (about 6.0 h).', 'Energie 47 952 J (13,3 Wh); Laufzeit 21 578 s (etwa 6,0 h).') },
    point: T('mAh 是电荷量，Wh 才是能量。', 'mAh is a charge; Wh is an energy.', 'mAh ist eine Ladung, Wh eine Energie.'),
    level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:K22'], links: {}, ...V
  },
  {
    id: 'K23', title: T('太阳高度角、昼长与四季', 'Sun elevation, day length and seasons', 'Sonnenhöhe, Tageslänge und Jahreszeiten'),
    stages: ['j', 's'], priority: 'P1', geometry: 'space3d',
    assumptions: [T('地球为球体，太阳视为点光源，不计大气折射；太阳赤纬 δ 表示季节（夏至 +23.44°）', 'Spherical Earth, point Sun, no refraction; the declination δ stands for the season (+23.44° at the June solstice)', 'Kugelförmige Erde, punktförmige Sonne, keine Refraktion; die Deklination δ steht für die Jahreszeit (+23,44° zur Sommersonnenwende)')],
    validity: T('|φ| + |δ| < 90°（无极昼极夜）', '|φ| + |δ| < 90° (no polar day or night)', '|φ| + |δ| < 90° (kein Polartag/-nacht)'), sources: ['S08'],
    inputs: [angle('phi', '\\varphi', T('纬度', 'Latitude', 'Breite'), 0.6981317007977318), angle('dl', '\\delta', T('太阳赤纬', 'Solar declination', 'Sonnendeklination'), 0.40910517666747087), angle('H', 'H', T('时角（离正午）', 'Hour angle (from noon)', 'Stundenwinkel (ab Mittag)'), 0.5235987755982988), pos('Td', 'T_0', T('一个太阳日', 'One solar day', 'Ein Sonnentag'), 's', 'time', 86400)],
    conditions: [cond('day', T('有日出日落', 'The Sun rises and sets', 'Die Sonne geht auf und unter'), 'abs(tan(phi)*tan(dl)) < 1')],
    outputs: [out('aN', '\\alpha_0', T('正午太阳高度角', 'Noon elevation', 'Mittagshöhe'), 'rad', 'pi/2 - abs(phi - dl)'), out('a', '\\alpha', T('该时刻太阳高度角', 'Elevation at this hour', 'Höhe zu dieser Stunde'), 'rad', 'asin(sin(phi)*sin(dl) + cos(phi)*cos(dl)*cos(H))'), out('day', 'T_d', T('昼长', 'Day length', 'Tageslänge'), 's', 'acos(-tan(phi)*tan(dl))/pi*Td', { requires: ['day'] })],
    example: { text: T('北纬 40°，夏至（δ = 23.44°），正午与午后 2 h（H = 30°）。', '40° N at the June solstice (δ = 23.44°), at noon and 2 h after (H = 30°).', '40° N zur Sommersonnenwende (δ = 23,44°), mittags und 2 h danach (H = 30°).'), answer: T('正午 73.44°；午后两小时 59.81°；昼长约 14.84 h。', 'Noon 73.44°; two hours later 59.81°; day length about 14.84 h.', 'Mittags 73,44°; zwei Stunden später 59,81°; Tageslänge etwa 14,84 h.') },
    point: T('四季来自地轴倾斜，不是日地距离。', 'Seasons come from the tilted axis, not from the Earth–Sun distance.', 'Jahreszeiten kommen von der geneigten Achse, nicht vom Abstand zur Sonne.'),
    level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:K23'], links: {}, ...V
  },
  {
    id: 'K24', title: T('月相与日月食几何', 'Moon phases and eclipse geometry', 'Mondphasen und Finsternisgeometrie'),
    stages: ['j', 's'], priority: 'P1', geometry: 'space3d',
    assumptions: [T('圆轨道；被照亮比例由日-月角距 ψ 决定；本影锥按相似三角形', 'Circular orbits; the lit fraction depends on the Sun–Moon elongation ψ; the umbral cone by similar triangles', 'Kreisbahnen; der beleuchtete Anteil hängt von der Elongation ψ ab; Kernschattenkegel über ähnliche Dreiecke')],
    validity: T('朔望月由恒星月与恒星年给出', 'The synodic month follows from the sidereal month and year', 'Der synodische Monat folgt aus siderischem Monat und Jahr'), sources: ['S08'],
    inputs: [angle('psi', '\\psi', T('日月角距', 'Elongation', 'Elongation'), 1.5707963267948966), pos('Tm', 'T_m', T('恒星月', 'Sidereal month', 'Siderischer Monat'), 's', 'time', 2360591.5104), pos('Te', 'T_e', T('恒星年', 'Sidereal year', 'Siderisches Jahr'), 's', 'time', 31558149.7632), pos('d', 'd', T('日地距离', 'Sun–Earth distance', 'Abstand Sonne–Erde'), 'm', 'length', 1.496e11), pos('Rs', 'R_s', T('太阳半径', 'Radius of the Sun', 'Sonnenradius'), 'm', 'length', 6.957e8), pos('Re', 'R_e', T('地球半径', 'Radius of the Earth', 'Erdradius'), 'm', 'length', 6.371e6)],
    outputs: [out('k', 'k', T('月面被照亮的比例', 'Lit fraction of the disc', 'Beleuchteter Anteil'), '', '(1 - cos(psi))/2'), out('Ts', 'T_s', T('朔望月', 'Synodic month', 'Synodischer Monat'), 's', 'Tm*Te/(Te - Tm)'), out('Lu', 'L_u', T('地球本影长度', 'Length of the Earth’s umbra', 'Länge des Erdkernschattens'), 'm', 'd*Re/(Rs - Re)')],
    example: { text: T('上弦月（角距 90°）；恒星月 27.32 d，恒星年 365.26 d。', 'First quarter (elongation 90°); sidereal month 27.32 d, year 365.26 d.', 'Erstes Viertel (90°); siderischer Monat 27,32 d, Jahr 365,26 d.'), answer: T('照亮一半；朔望月 29.53 d；地球本影长 1.38×10⁹ m（约地月距的 3.6 倍）。', 'Half lit; synodic month 29.53 d; umbra 1.38×10⁹ m (about 3.6 Earth–Moon distances).', 'Halb beleuchtet; synodischer Monat 29,53 d; Kernschatten 1,38·10⁹ m (etwa 3,6 Mondabstände).') },
    point: T('月相不是地球的影子造成的；月食只发生在满月。', 'Phases are not the Earth’s shadow; lunar eclipses happen only at full moon.', 'Phasen sind nicht der Erdschatten; Mondfinsternisse gibt es nur bei Vollmond.'),
    level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:K24'], links: {}, ...V
  },
  {
    id: 'K25', title: T('红移与哈勃定律', 'Redshift and Hubble’s law', 'Rotverschiebung und Hubble-Gesetz'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('z = Δλ/λ；低红移 v ≈ cz；距离 d = v/H₀', 'z = Δλ/λ; at low redshift v ≈ cz; distance d = v/H₀', 'z = Δλ/λ; bei kleiner Rotverschiebung v ≈ cz; Entfernung d = v/H₀')],
    validity: T('z ≪ 1 时 cz 与相对论多普勒公式一致', 'For z ≪ 1, cz agrees with the relativistic Doppler formula', 'Für z ≪ 1 stimmt cz mit der relativistischen Dopplerformel überein'), sources: ['S08'],
    inputs: [pos('lo', '\\lambda_{obs}', T('观测波长', 'Observed wavelength', 'Beobachtete Wellenlänge'), 'm', 'length', 700e-9), pos('le', '\\lambda_{em}', T('发射波长', 'Emitted wavelength', 'Emittierte Wellenlänge'), 'm', 'length', 656.28e-9), pos('H0', 'H_0', T('哈勃常数', 'Hubble constant', 'Hubble-Konstante'), '1/s', 'frequency', 2.2685455026110557e-18), pos('c', 'c', T('光速', 'Speed of light', 'Lichtgeschwindigkeit'), 'm/s', 'velocity', 299792458)],
    conditions: [cond('low', T('z ≪ 1', 'z ≪ 1', 'z ≪ 1'), '(lo - le)/le < 0.01', '(lo - le)/le < 0.1')],
    outputs: [out('z', 'z', T('红移', 'Redshift', 'Rotverschiebung'), '', '(lo - le)/le'), out('v', 'v', T('退行速度 cz', 'Recession speed cz', 'Fluchtgeschwindigkeit cz'), 'm/s', 'c*(lo - le)/le', { requires: ['low'] }), out('vr', 'v_r', T('相对论多普勒速度', 'Relativistic Doppler speed', 'Relativistische Dopplergeschwindigkeit'), 'm/s', 'c*((lo/le)^2 - 1)/((lo/le)^2 + 1)'), out('d', 'd', T('哈勃距离 cz/H₀', 'Hubble distance cz/H₀', 'Hubble-Entfernung cz/H₀'), 'm', 'c*(lo - le)/(le*H0)', { requires: ['low'] })],
    example: { text: T('Hα 656.28 nm 观测到 700 nm；H₀ = 70 km/s/Mpc。', 'Hα 656.28 nm observed at 700 nm; H₀ = 70 km/s/Mpc.', 'Hα 656,28 nm bei 700 nm beobachtet; H₀ = 70 km/s/Mpc.'), answer: T('z = 0.0666；cz = 1.997×10⁷ m/s（相对论 1.931×10⁷）；d ≈ 8.8×10²⁴ m（约 285 Mpc，近似量级）。', 'z = 0.0666; cz = 1.997×10⁷ m/s (relativistic 1.931×10⁷); d ≈ 8.8×10²⁴ m (about 285 Mpc, an estimate).', 'z = 0,0666; cz = 1,997·10⁷ m/s (relativistisch 1,931·10⁷); d ≈ 8,8·10²⁴ m (etwa 285 Mpc, Abschätzung).') },
    point: T('宇宙学红移来自空间膨胀；cz 只在低红移近似成立。', 'Cosmological redshift comes from expansion; cz holds only at low redshift.', 'Kosmologische Rotverschiebung kommt von der Expansion; cz gilt nur bei kleiner Rotverschiebung.'),
    level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:K25'], links: {}, ...V
  },
  {
    id: 'K26', title: T('宇宙尺度因子（物质主导）', 'Cosmic scale factor (matter-dominated)', 'Kosmischer Skalenfaktor (materiedominiert)'),
    stages: ['u'], priority: 'P3', geometry: 'abstract',
    assumptions: [T('平直、物质主导的 Einstein–de Sitter 宇宙：a(t) = (t/t₀)^(2/3)', 'Flat, matter-dominated Einstein–de Sitter universe: a(t) = (t/t₀)^(2/3)', 'Flaches, materiedominiertes Einstein-de-Sitter-Universum: a(t) = (t/t₀)^(2/3)')],
    validity: T('受限：不含暗能量与辐射，年龄偏小', 'Restricted: no dark energy or radiation; the age comes out too small', 'Eingeschränkt: ohne Dunkle Energie und Strahlung; das Alter wird zu klein'),
    restricted: T('只计算 Einstein–de Sitter 模型；ΛCDM 需数值积分', 'Only the Einstein–de Sitter model; ΛCDM needs numerical integration', 'Nur das Einstein-de-Sitter-Modell; ΛCDM braucht numerische Integration'),
    sources: ['S08'],
    inputs: [pos('H0', 'H_0', T('哈勃常数', 'Hubble constant', 'Hubble-Konstante'), '1/s', 'frequency', 2.2685455026110557e-18), pos('f', 't/t_0', T('时间占当前年龄的比例', 'Time as a fraction of the present age', 'Zeit als Anteil des heutigen Alters'), '', 'ratio', 0.5)],
    outputs: [out('t0', 't_0', T('宇宙年龄 2/(3H₀)', 'Age 2/(3H₀)', 'Alter 2/(3H₀)'), 's', '2/(3*H0)'), out('a', 'a', T('尺度因子', 'Scale factor', 'Skalenfaktor'), '', 'f^(2/3)'), out('z', 'z', T('该时刻发出的光的红移', 'Redshift of light emitted then', 'Rotverschiebung des damals ausgesandten Lichts'), '', 'f^(-2/3) - 1'), out('H', 'H', T('该时刻的哈勃参数', 'Hubble parameter then', 'Hubble-Parameter damals'), '1/s', 'H0/f')],
    example: { text: T('H₀ = 70 km/s/Mpc；宇宙年龄一半时。', 'H₀ = 70 km/s/Mpc; at half the present age.', 'H₀ = 70 km/s/Mpc; beim halben heutigen Alter.'), answer: T('t₀ = 2.94×10¹⁷ s（9.31 Gyr）；a = 0.630；z = 0.587；H = 4.54×10⁻¹⁸ s⁻¹。', 't₀ = 2.94×10¹⁷ s (9.31 Gyr); a = 0.630; z = 0.587; H = 4.54×10⁻¹⁸ s⁻¹.', 't₀ = 2,94·10¹⁷ s (9,31 Gyr); a = 0,630; z = 0,587; H = 4,54·10⁻¹⁸ s⁻¹.') },
    point: T('1 + z = 1/a：红移量出光传播期间空间被拉伸了多少。', '1 + z = 1/a: the redshift measures how much space stretched while the light travelled.', '1 + z = 1/a: Die Rotverschiebung misst die Dehnung des Raumes.'),
    level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:K26'], links: {}, ...V
  },
  {
    id: 'K27', title: T('潮汐与洛希极限', 'Tides and the Roche limit', 'Gezeiten und Roche-Grenze'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('差分引力的一阶近似 Δa = 2GMR/d³；流体卫星的洛希极限 2.44 R(ρ_M/ρ_m)^(1/3)', 'Differential gravity to first order Δa = 2GMR/d³; Roche limit of a fluid satellite 2.44 R(ρ_M/ρ_m)^(1/3)', 'Differenzielle Gravitation in erster Ordnung Δa = 2GMR/d³; Roche-Grenze eines flüssigen Mondes 2,44 R(ρ_M/ρ_m)^(1/3)')],
    validity: T('R ≪ d', 'R ≪ d', 'R ≪ d'), sources: ['S08'],
    inputs: [pos('G', 'G', T('引力常量', 'Gravitational constant', 'Gravitationskonstante'), 'N·m²/kg²', 'gravConst', 6.6743e-11), pos('M', 'M', T('施潮天体质量', 'Mass of the tide-raising body', 'Masse des gezeitenerzeugenden Körpers'), 'kg', 'mass', 7.342e22), pos('R', 'R', T('受潮天体半径', 'Radius of the body', 'Radius des Körpers'), 'm', 'length', 6.371e6), pos('d', 'd', T('两者中心距离', 'Distance between the centres', 'Abstand der Mittelpunkte'), 'm', 'length', 3.844e8), pos('rM', '\\rho_M', T('主天体密度', 'Density of the primary', 'Dichte des Hauptkörpers'), 'kg/m³', 'density', 5514), pos('rm', '\\rho_m', T('卫星密度', 'Density of the satellite', 'Dichte des Mondes'), 'kg/m³', 'density', 3344)],
    outputs: [out('da', '\\Delta a', T('潮汐加速度', 'Tidal acceleration', 'Gezeitenbeschleunigung'), 'm/s²', '2*G*M*R/d^3'), out('roche', 'd_R', T('洛希极限（流体）', 'Roche limit (fluid)', 'Roche-Grenze (flüssig)'), 'm', '2.44*R*(rM/rm)^(1/3)')],
    example: { text: T('月球对地球表面的潮汐加速度；地球-月球密度的洛希极限。', 'The Moon’s tidal acceleration on the Earth’s surface; the Roche limit for Earth and Moon densities.', 'Gezeitenbeschleunigung des Mondes auf der Erde; Roche-Grenze für Erd- und Monddichte.'), answer: T('Δa = 1.10×10⁻⁶ m/s²（约 g 的 1.1×10⁻⁷）；洛希极限 1.84×10⁷ m。', 'Δa = 1.10×10⁻⁶ m/s² (about 1.1×10⁻⁷ g); Roche limit 1.84×10⁷ m.', 'Δa = 1,10·10⁻⁶ m/s² (etwa 1,1·10⁻⁷ g); Roche-Grenze 1,84·10⁷ m.') },
    point: T('潮汐力随 1/d³ 减小，所以月球的潮汐比太阳大。', 'Tidal forces fall off as 1/d³, so the Moon’s tides beat the Sun’s.', 'Gezeitenkräfte fallen mit 1/d³, daher überwiegt der Mond die Sonne.'),
    level: 1, teaching: 0, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:K27'], links: {}, ...V
  },
  {
    id: 'K28', title: T('地震波：P 波与 S 波', 'Seismic waves: P and S waves', 'Seismische Wellen: P- und S-Wellen'),
    stages: ['u'], priority: 'P2', geometry: 'line1d',
    assumptions: [T('均匀各向同性弹性介质；震源距离由 S−P 到时差求出', 'Homogeneous isotropic elastic medium; distance from the S−P time difference', 'Homogenes isotropes elastisches Medium; Entfernung aus der S−P-Laufzeitdifferenz')],
    validity: T('S 波不能在液体中传播（G = 0）', 'S waves do not travel in liquids (G = 0)', 'S-Wellen laufen nicht in Flüssigkeiten (G = 0)'), sources: ['S08'],
    inputs: [pos('K', 'K', T('体积模量', 'Bulk modulus', 'Kompressionsmodul'), 'Pa', 'pressure', 50e9), nonneg('G', 'G', T('剪切模量', 'Shear modulus', 'Schubmodul'), 'Pa', 'pressure', 30e9), pos('rho', '\\rho', L.rho, 'kg/m³', 'density', 3000), pos('D', 'D', T('震中距', 'Distance', 'Entfernung'), 'm', 'length', 100e3)],
    conditions: [cond('solid', T('固体（G > 0）', 'Solid (G > 0)', 'Festkörper (G > 0)'), 'G > 0')],
    outputs: [out('vp', 'v_P', T('P 波速度', 'P-wave speed', 'P-Wellengeschwindigkeit'), 'm/s', 'sqrt((K + 4*G/3)/rho)'), out('vs', 'v_S', T('S 波速度', 'S-wave speed', 'S-Wellengeschwindigkeit'), 'm/s', 'sqrt(G/rho)', { requires: ['solid'] }), out('dt', '\\Delta t', T('S−P 到时差', 'S−P time difference', 'S−P-Laufzeitdifferenz'), 's', 'D/sqrt(G/rho) - D/sqrt((K + 4*G/3)/rho)', { requires: ['solid'] })],
    example: { text: T('K = 50 GPa，G = 30 GPa，ρ = 3000 kg/m³，震中距 100 km。', 'K = 50 GPa, G = 30 GPa, ρ = 3000 kg/m³, 100 km away.', 'K = 50 GPa, G = 30 GPa, ρ = 3000 kg/m³, 100 km entfernt.'), answer: T('v_P = 5.48 km/s，v_S = 3.16 km/s；到时差 13.37 s。', 'v_P = 5.48 km/s, v_S = 3.16 km/s; difference 13.37 s.', 'v_P = 5,48 km/s, v_S = 3,16 km/s; Differenz 13,37 s.') },
    point: T('外核中没有 S 波——这是外核为液态的证据。', 'No S waves in the outer core: evidence that it is liquid.', 'Keine S-Wellen im äußeren Kern: ein Beleg, dass er flüssig ist.'),
    level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:K28'], links: {}, ...V
  },
  {
    id: 'K29', title: T('膜的振动模态', 'Vibration modes of a membrane', 'Schwingungsmoden einer Membran'),
    stages: ['u'], priority: 'P2', geometry: 'plane',
    assumptions: [T('均匀张紧的薄膜，边缘固定，小振幅；圆膜基频用 j₀₁ = 2.4048', 'Uniformly stretched membrane, fixed edge, small amplitude; the circular drum uses j₀₁ = 2.4048', 'Gleichmäßig gespannte Membran, fester Rand, kleine Amplitude; die Kreismembran nutzt j₀₁ = 2,4048')],
    validity: T('线性波动方程 ∂²u/∂t² = c²∇²u', 'Linear wave equation ∂²u/∂t² = c²∇²u', 'Lineare Wellengleichung ∂²u/∂t² = c²∇²u'), sources: ['S08'],
    inputs: [pos('Tm', 'T', T('张力（单位长度）', 'Tension per length', 'Spannung je Länge'), 'N/m', 'stiffness', 1000), pos('sg', '\\sigma', T('面密度', 'Areal density', 'Flächendichte'), 'kg/m²', 'arealDensity', 0.1), pos('Lx', 'L_x', T('矩形边长 x', 'Side x', 'Seite x'), 'm', 'length', 0.5), pos('Ly', 'L_y', T('矩形边长 y', 'Side y', 'Seite y'), 'm', 'length', 0.3), pos('m', 'm', T('x 方向模态数', 'Mode number in x', 'Modenzahl in x'), '', 'ratio', 1), pos('n', 'n', T('y 方向模态数', 'Mode number in y', 'Modenzahl in y'), '', 'ratio', 1), pos('a', 'a', T('圆膜半径', 'Radius of the drum', 'Radius der Kreismembran'), 'm', 'length', 0.15)],
    outputs: [out('c', 'c', T('膜上波速', 'Wave speed on the membrane', 'Wellengeschwindigkeit'), 'm/s', 'sqrt(Tm/sg)'), out('fmn', 'f_{mn}', T('矩形膜模态频率', 'Mode frequency of the rectangle', 'Modenfrequenz des Rechtecks'), 'Hz', 'sqrt(Tm/sg)/2*sqrt((m/Lx)^2 + (n/Ly)^2)'), out('f01', 'f_{01}', T('圆膜基频', 'Fundamental of the drum', 'Grundton der Kreismembran'), 'Hz', '2.404825557695773*sqrt(Tm/sg)/(2*pi*a)')],
    example: { text: T('张力 1000 N/m，面密度 0.1 kg/m²；0.5 m × 0.3 m 矩形 (1,1) 模；半径 15 cm 的鼓。', 'Tension 1000 N/m, 0.1 kg/m²; mode (1,1) of a 0.5 m × 0.3 m rectangle; a drum of radius 15 cm.', 'Spannung 1000 N/m, 0,1 kg/m²; Mode (1,1) eines 0,5 m × 0,3 m Rechtecks; Trommel mit 15 cm Radius.'), answer: T('c = 100 m/s；f₁₁ = 194.4 Hz；f₀₁ = 255.2 Hz。', 'c = 100 m/s; f₁₁ = 194.4 Hz; f₀₁ = 255.2 Hz.', 'c = 100 m/s; f₁₁ = 194,4 Hz; f₀₁ = 255,2 Hz.') },
    point: T('鼓的泛音不是基频的整数倍，所以音高不如弦乐清晰。', 'A drum’s overtones are not integer multiples, so its pitch is less clear than a string’s.', 'Die Obertöne einer Trommel sind keine ganzzahligen Vielfachen.'),
    level: 1, teaching: 0, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:K29'], links: {}, ...V
  },
  {
    id: 'K30', title: T('刚性方程与隐式积分', 'Stiff equations and implicit integration', 'Steife Gleichungen und implizite Integration'),
    stages: ['u'], priority: 'P2', geometry: 'abstract',
    assumptions: [T('测试方程 y′ = −λy，y(0) = 1，步长 h，N 步', 'Test equation y′ = −λy, y(0) = 1, step h, N steps', 'Testgleichung y′ = −λy, y(0) = 1, Schritt h, N Schritte')],
    validity: T('显式欧拉要求 λh ≤ 2 才稳定；隐式欧拉对任意 h 稳定', 'Explicit Euler is stable only for λh ≤ 2; implicit Euler for any h', 'Expliziter Euler ist nur für λh ≤ 2 stabil; impliziter für jedes h'), sources: ['S08'],
    inputs: [pos('lam', '\\lambda', T('衰减率', 'Decay rate', 'Zerfallsrate'), '1/s', 'frequency', 50), pos('h', 'h', T('步长', 'Step', 'Schrittweite'), 's', 'time', 0.05), pos('N', 'N', T('步数', 'Number of steps', 'Anzahl der Schritte'), '', 'ratio', 20)],
    outputs: [out('gE', 'g_E', T('显式欧拉放大因子', 'Amplification of explicit Euler', 'Verstärkung des expliziten Euler'), '', '1 - lam*h'), out('gI', 'g_I', T('隐式欧拉放大因子', 'Amplification of implicit Euler', 'Verstärkung des impliziten Euler'), '', '1/(1 + lam*h)'), out('yE', 'y_E', T('显式欧拉 N 步后', 'Explicit Euler after N steps', 'Expliziter Euler nach N Schritten'), '', '(1 - lam*h)^N'), out('yI', 'y_I', T('隐式欧拉 N 步后', 'Implicit Euler after N steps', 'Impliziter Euler nach N Schritten'), '', '(1 + lam*h)^(-N)'), out('y', 'y', T('精确解', 'Exact solution', 'Exakte Lösung'), '', 'exp(-lam*h*N)'), out('stable', 's', T('显式欧拉稳定（1 = 是）', 'Explicit Euler stable (1 = yes)', 'Expliziter Euler stabil (1 = ja)'), '', 'step(2 - lam*h)')],
    example: { text: T('λ = 50 s⁻¹，h = 0.05 s（λh = 2.5），20 步。', 'λ = 50 s⁻¹, h = 0.05 s (λh = 2.5), 20 steps.', 'λ = 50 s⁻¹, h = 0,05 s (λh = 2,5), 20 Schritte.'), answer: T('显式因子 −1.5，20 步后 3325（发散）；隐式因子 0.286，1.3×10⁻¹¹；精确 1.9×10⁻²²。', 'Explicit factor −1.5, 3325 after 20 steps (diverges); implicit 0.286, 1.3×10⁻¹¹; exact 1.9×10⁻²².', 'Explizit −1,5, nach 20 Schritten 3325 (divergiert); implizit 0,286, 1,3·10⁻¹¹; exakt 1,9·10⁻²².') },
    point: T('稳定不等于准确：隐式欧拉不发散，但大步长仍有误差。', 'Stable is not accurate: implicit Euler does not blow up but large steps still err.', 'Stabil ist nicht genau: Der implizite Euler divergiert nicht, große Schritte bleiben ungenau.'),
    level: 1, teaching: 0, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:K30'], links: {}, ...V
  },
  {
    id: 'K31', title: T('灵敏度分析与最优化', 'Sensitivity analysis and optimization', 'Sensitivitätsanalyse und Optimierung'),
    stages: ['u'], priority: 'P2', geometry: 'plane',
    assumptions: [A.noDrag, A.uniformG, T('射程 R(v, θ) = v² sin2θ/g，在同一水平面落地', 'Range R(v, θ) = v² sin2θ/g, landing at the launch height', 'Reichweite R(v, θ) = v² sin2θ/g, Landung in Abwurfhöhe')],
    validity: T('解析导数；最优角 45°', 'Analytic derivatives; optimum at 45°', 'Analytische Ableitungen; Optimum bei 45°'), sources: ['S11'],
    inputs: [pos('v', 'v_0', T('初速度', 'Launch speed', 'Abwurfgeschwindigkeit'), 'm/s', 'velocity', 20), angle('th', '\\theta', T('抛射角', 'Launch angle', 'Abwurfwinkel'), 0.5235987755982988), pos('g', 'g', L.g, 'm/s²', 'acceleration', 9.8)],
    outputs: [out('R', 'R', T('射程', 'Range', 'Reichweite'), 'm', 'v^2*sin(2*th)/g'), out('dRdth', '\\partial R/\\partial\\theta', T('对角度的灵敏度', 'Sensitivity to the angle', 'Empfindlichkeit gegen den Winkel'), 'm', '2*v^2*cos(2*th)/g'), out('dRdv', '\\partial R/\\partial v', T('对速度的灵敏度', 'Sensitivity to the speed', 'Empfindlichkeit gegen die Geschwindigkeit'), 's', '2*v*sin(2*th)/g'), out('Rmax', 'R_{max}', T('最优角下的射程', 'Range at the optimum angle', 'Reichweite beim optimalen Winkel'), 'm', 'v^2/g'), out('Sth', 'S_\\theta', T('相对灵敏度 (θ/R)∂R/∂θ', 'Relative sensitivity (θ/R)∂R/∂θ', 'Relative Sensitivität (θ/R)∂R/∂θ'), '', '2*th*cos(2*th)/sin(2*th)')],
    example: { text: T('v₀ = 20 m/s，θ = 30°。', 'v₀ = 20 m/s, θ = 30°.', 'v₀ = 20 m/s, θ = 30°.'), answer: T('R = 35.35 m；∂R/∂θ = 40.8 m/rad；∂R/∂v = 3.53 s；最大射程 40.8 m（45°）；相对灵敏度 0.605。', 'R = 35.35 m; ∂R/∂θ = 40.8 m/rad; ∂R/∂v = 3.53 s; maximum 40.8 m (45°); relative sensitivity 0.605.', 'R = 35,35 m; ∂R/∂θ = 40,8 m/rad; ∂R/∂v = 3,53 s; Maximum 40,8 m (45°); relative Sensitivität 0,605.') },
    point: T('在最优点附近输出对参数不敏感（导数为零）。', 'Near the optimum the output is insensitive to the parameter (zero derivative).', 'Nahe dem Optimum ist das Ergebnis unempfindlich (Ableitung null).'),
    level: 1, teaching: 0, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:K31'], links: {}, ...V
  },
  {
    id: 'K32', title: T('质心与质心系', 'Centre of mass and the centre-of-mass frame', 'Schwerpunkt und Schwerpunktsystem'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'line1d',
    assumptions: [T('一维两质点；弹性碰撞在质心系中只改变速度方向', 'Two point masses in one dimension; an elastic collision only reverses velocities in the CM frame', 'Zwei Massenpunkte in einer Dimension; ein elastischer Stoß kehrt im Schwerpunktsystem nur die Geschwindigkeiten um')],
    validity: T('无外力（或外力冲量可忽略）', 'No external force (or negligible impulse)', 'Keine äußere Kraft (oder vernachlässigbarer Kraftstoß)'), sources: ['S14'],
    inputs: [pos('m1', 'm_1', T('质量 1', 'Mass 1', 'Masse 1'), 'kg', 'mass', 1), inp('x1', 'x_1', T('位置 1', 'Position 1', 'Ort 1'), 'm', 'length', 0), inp('v1', 'v_1', T('速度 1', 'Velocity 1', 'Geschwindigkeit 1'), 'm/s', 'velocity', 3), pos('m2', 'm_2', T('质量 2', 'Mass 2', 'Masse 2'), 'kg', 'mass', 2), inp('x2', 'x_2', T('位置 2', 'Position 2', 'Ort 2'), 'm', 'length', 1), inp('v2', 'v_2', T('速度 2', 'Velocity 2', 'Geschwindigkeit 2'), 'm/s', 'velocity', 0)],
    outputs: [out('xc', 'x_C', T('质心位置', 'Centre of mass', 'Schwerpunkt'), 'm', '(m1*x1 + m2*x2)/(m1 + m2)'), out('vc', 'v_C', T('质心速度', 'Velocity of the centre of mass', 'Schwerpunktgeschwindigkeit'), 'm/s', '(m1*v1 + m2*v2)/(m1 + m2)'), out('u1', 'u_1', T('质心系中速度 1', 'Velocity 1 in the CM frame', 'Geschwindigkeit 1 im Schwerpunktsystem'), 'm/s', 'v1 - (m1*v1 + m2*v2)/(m1 + m2)'), out('u2', 'u_2', T('质心系中速度 2', 'Velocity 2 in the CM frame', 'Geschwindigkeit 2 im Schwerpunktsystem'), 'm/s', 'v2 - (m1*v1 + m2*v2)/(m1 + m2)'), out('Ki', 'K_{int}', T('质心系动能（可转化部分）', 'Kinetic energy in the CM frame (available)', 'Kinetische Energie im Schwerpunktsystem (verfügbar)'), 'J', 'm1*m2/(m1 + m2)*(v1 - v2)^2/2'), out('w1', "v_1'", T('弹性碰撞后速度 1', 'Velocity 1 after an elastic collision', 'Geschwindigkeit 1 nach elastischem Stoß'), 'm/s', '2*(m1*v1 + m2*v2)/(m1 + m2) - v1'), out('w2', "v_2'", T('弹性碰撞后速度 2', 'Velocity 2 after an elastic collision', 'Geschwindigkeit 2 nach elastischem Stoß'), 'm/s', '2*(m1*v1 + m2*v2)/(m1 + m2) - v2')],
    example: { text: T('1 kg 在 0 m 以 3 m/s 运动，2 kg 在 1 m 静止。', '1 kg at 0 m moving at 3 m/s, 2 kg at 1 m at rest.', '1 kg bei 0 m mit 3 m/s, 2 kg bei 1 m in Ruhe.'), answer: T('质心 0.667 m，速度 1 m/s；质心系中 +2 与 −1 m/s；可转化动能 3 J；弹性碰撞后 −1 与 2 m/s。', 'CM at 0.667 m moving at 1 m/s; +2 and −1 m/s in the CM frame; 3 J available; after an elastic collision −1 and 2 m/s.', 'Schwerpunkt 0,667 m mit 1 m/s; +2 und −1 m/s im Schwerpunktsystem; 3 J verfügbar; nach elastischem Stoß −1 und 2 m/s.') },
    point: T('完全非弹性碰撞最多损失质心系里的那部分动能。', 'A perfectly inelastic collision loses at most the CM-frame kinetic energy.', 'Ein vollständig unelastischer Stoß verliert höchstens die Energie im Schwerpunktsystem.'),
    level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:K32'], links: {}, ...V
  }
]
