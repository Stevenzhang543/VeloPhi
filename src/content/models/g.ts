/**
 * G01–G08: units, vectors, sampling, fitting, uncertainty, dimensions and temperature, convergence, statistics
 * (blueprint §5.1; doc 02 §1).
 */
import type { ModelSpec } from './types'
import { L, T, angle, cond, inp, let_, nonneg, out, pos } from './dsl'

export const MODELS_G: ModelSpec[] = [
  {
    id: 'G01', title: T('单位换算与前缀', 'Unit conversion and prefixes', 'Einheitenumrechnung und Vorsätze'),
    stages: ['j'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('内部一律以 SI 存储；显示单位只在输入与读数处换算', 'Everything is stored in SI; display units are converted only at input and readout', 'Alles wird in SI gespeichert; Anzeigeeinheiten werden nur bei Eingabe und Anzeige umgerechnet')],
    validity: T('线性单位（含前缀）；摄氏温度另作仿射换算（G06）', 'Linear units (with prefixes); Celsius temperatures are converted affinely (G06)', 'Lineare Einheiten (mit Vorsätzen); Celsius-Temperaturen werden affin umgerechnet (G06)'),
    sources: ['S01', 'S03'],
    inputs: [
      inp('v', 'v', L.v, 'm/s', 'velocity', 20),
      pos('m', 'm', L.m, 'kg', 'mass', 0.5)
    ],
    outputs: [
      out('vSI', 'v', T('速度（SI 记录）', 'Velocity (SI record)', 'Geschwindigkeit (SI-Wert)'), 'm/s', 'v'),
      out('mSI', 'm', T('质量（SI 记录）', 'Mass (SI record)', 'Masse (SI-Wert)'), 'kg', 'm'),
      out('Ek', 'E_k', L.Ek, 'J', 'm*v^2/2')
    ],
    example: { text: T('速度输入 72 km/h，质量输入 500 g，求 SI 记录。', 'Enter a velocity of 72 km/h and a mass of 500 g; give the SI record.', 'Gib 72 km/h und 500 g ein; wie lauten die SI-Werte?'), answer: T('1 h = 3600 s；速度为 20 m/s，质量为 0.500 kg。', '1 h = 3600 s; the velocity is 20 m/s, the mass 0.500 kg.', '1 h = 3600 s; die Geschwindigkeit ist 20 m/s, die Masse 0,500 kg.') },
    point: T('显示单位改变不改变物理状态；区分数量值与单位。', 'Changing the display unit does not change the physical state; tell the number from the unit.', 'Eine andere Anzeigeeinheit ändert den physikalischen Zustand nicht; Zahlenwert und Einheit unterscheiden.'),
    status: 'verified', level: 1, teaching: 2, references: ['analytic'],
    benchmarks: ['oracle:G01', 'test:units2656 display conversions', 'test:units2656 save-load-language'],
    links: { activities: ['act-units'], topics: ['motion'] },
    review: { physics: '2026-10-28', language: '2026-10-28' }
  },
  {
    id: 'G02', title: T('矢量分解与坐标变换', 'Vector components and change of axes', 'Vektorzerlegung und Achsenwechsel'),
    stages: ['s'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('平面直角坐标系；新坐标轴相对原轴转过 φ', 'Plane Cartesian axes; the new axes are turned by φ', 'Ebene kartesische Achsen; die neuen Achsen sind um φ gedreht')],
    validity: T('任意平面矢量', 'Any plane vector', 'Beliebiger ebener Vektor'),
    sources: ['S09'],
    inputs: [
      nonneg('F', 'F', T('力的大小', 'Magnitude of the force', 'Betrag der Kraft'), 'N', 'force', 10),
      angle('theta', '\\theta', T('力与 x 轴的夹角', 'Angle of the force to the x axis', 'Winkel der Kraft zur x-Achse'), Math.PI / 6),
      angle('phi', '\\varphi', T('新坐标轴转过的角度', 'Rotation of the new axes', 'Drehung der neuen Achsen'), Math.PI / 6)
    ],
    outputs: [
      out('Fx', 'F_x', T('x 分量', 'x component', 'x-Komponente'), 'N', 'F*cos(theta)'),
      out('Fy', 'F_y', T('y 分量', 'y component', 'y-Komponente'), 'N', 'F*sin(theta)'),
      out('Fx2', "F_{x'}", T('新坐标系的 x′ 分量', "x′ component in the turned axes", "x′-Komponente in den gedrehten Achsen"), 'N', 'F*cos(theta - phi)'),
      out('Fy2', "F_{y'}", T('新坐标系的 y′ 分量', "y′ component in the turned axes", "y′-Komponente in den gedrehten Achsen"), 'N', 'F*sin(theta - phi)'),
      out('mod', '|F|', T('模（两坐标系相同）', 'Magnitude (the same in both axes)', 'Betrag (in beiden Achsen gleich)'), 'N', 'sqrt((F*cos(theta - phi))^2 + (F*sin(theta - phi))^2)')
    ],
    example: { text: T('力 10 N，与 x 正轴夹角 30°，求分量。', 'A force of 10 N at 30° to the positive x axis: find its components.', 'Eine Kraft von 10 N unter 30° zur positiven x-Achse: Komponenten?'), answer: T('Fx = 8.6603 N，Fy = 5.0000 N；模仍为 10 N。', 'Fx = 8.6603 N, Fy = 5.0000 N; the magnitude is still 10 N.', 'Fx = 8,6603 N, Fy = 5,0000 N; der Betrag bleibt 10 N.') },
    point: T('箭头长度是表征，物理向量必须绑定坐标系。', 'The arrow length is a representation; a physical vector is bound to a frame of axes.', 'Die Pfeillänge ist eine Darstellung; ein physikalischer Vektor gehört zu einem Achsensystem.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:G02'],
    links: { topics: ['motion'] }, review: { physics: '2026-10-28' }
  },
  {
    id: 'G03', title: T('采样 微分与积分', 'Sampling, differentiation and integration', 'Abtastung, Ableitung und Integration'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('x(t) = c·t²，等间隔采样 Δt', 'x(t) = c·t², sampled every Δt', 'x(t) = c·t², im Abstand Δt abgetastet')],
    validity: T('中心差分对二次函数精确；对一般函数误差为 O(Δt²)', 'The central difference is exact for quadratics; O(Δt²) in general', 'Der zentrale Differenzenquotient ist für Parabeln exakt; allgemein O(Δt²)'),
    sources: ['S10', 'S57'],
    inputs: [
      pos('c', 'c', T('系数', 'Coefficient', 'Koeffizient'), 'm/s²', 'acceleration', 2),
      pos('t', 't', L.t, 's', 'time', 1),
      pos('dt', '\\Delta t', T('采样间隔', 'Sampling interval', 'Abtastintervall'), 's', 'time', 0.1)
    ],
    lets: [let_('xp', 'x_+', T('后一采样点', 'Next sample', 'Nächster Wert'), 'm', 'c*(t + dt)^2'), let_('xm', 'x_-', T('前一采样点', 'Previous sample', 'Vorheriger Wert'), 'm', 'c*(t - dt)^2'), let_('x0', 'x', T('此刻', 'Now', 'Jetzt'), 'm', 'c*t^2')],
    conditions: [cond('inside', T('前一采样点不早于 0', 'The previous sample is not before 0', 'Der vorherige Wert liegt nicht vor 0'), 't - dt >= 0')],
    outputs: [
      out('vc', 'v_c', T('中心差分速度', 'Central-difference velocity', 'Zentraler Differenzenquotient'), 'm/s', '(xp - xm)/(2*dt)', { requires: ['inside'] }),
      out('vf', 'v_f', T('向前差分速度', 'Forward-difference velocity', 'Vorwärtsdifferenz'), 'm/s', '(xp - x0)/dt'),
      out('v', 'v', T('解析速度 2ct', 'Exact velocity 2ct', 'Exakte Geschwindigkeit 2ct'), 'm/s', '2*c*t'),
      out('s', '\\Delta x', T('0 到 t 的位移（对 v 积分）', 'Displacement 0 … t (integral of v)', 'Verschiebung 0 … t (Integral von v)'), 'm', 'c*t^2')
    ],
    example: { text: T('x(t) = 2t² m，采样间隔 0.1 s，求 t = 1 s 的速度及 0 到 1 s 位移。', 'x(t) = 2t² m sampled every 0.1 s: velocity at t = 1 s and displacement 0 … 1 s.', 'x(t) = 2t² m, Abtastung alle 0,1 s: Geschwindigkeit bei t = 1 s und Verschiebung 0 … 1 s.'), answer: T('中心差分得 4 m/s；对 v = 4t 积分得 2 m。', 'The central difference gives 4 m/s; integrating v = 4t gives 2 m.', 'Der zentrale Differenzenquotient ergibt 4 m/s; das Integral von v = 4t ergibt 2 m.') },
    point: T('导数和面积连接曲线与运动；带噪数据求导会放大噪声。', 'Slopes and areas link graphs and motion; differentiating noisy data amplifies the noise.', 'Steigung und Fläche verbinden Graph und Bewegung; Ableiten verrauschter Daten verstärkt das Rauschen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:G03', 'test:teaching2652 area under v–t', 'test:teaching2652 successive differences give the acceleration'],
    links: { topics: ['concept:math'] },
    gap: T('纸带与面积工具作用于仿真记录（L2）；中心差分、端点单侧公式与采样率误差比较只在模型计算器中，记录工具未提供', 'Ticker tape and area work on recordings (L2); central differences, one-sided end formulas and the sampling-rate comparison exist only in the model calculator, not in the recording tools', 'Ticker-Streifen und Fläche arbeiten auf Aufzeichnungen (L2); zentrale Differenzen, einseitige Randformeln und der Abtastvergleich gibt es nur im Modellrechner, nicht in den Aufzeichnungswerkzeugen'),
    review: { physics: '2026-10-28' }
  },
  {
    id: 'G04', title: T('线性拟合与残差', 'Linear fit and residuals', 'Lineare Regression und Residuen'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('三个数据点，等权最小二乘', 'Three data points, unweighted least squares', 'Drei Messpunkte, ungewichtete kleinste Quadrate')],
    validity: T('拟合参数只描述所给区间；残差为零不证明模型普遍正确', 'The fit describes the given range only; zero residuals do not prove the model in general', 'Die Anpassung gilt nur im gegebenen Bereich; Residuen null beweisen das Modell nicht allgemein'),
    sources: ['S57', 'S67', 'S80'],
    inputs: [
      inp('t1', 't_1', T('第 1 点时刻', 'Time of point 1', 'Zeit von Punkt 1'), 's', 'time', 0), inp('x1', 'x_1', T('第 1 点位置', 'Position of point 1', 'Ort von Punkt 1'), 'm', 'length', 1),
      inp('t2', 't_2', T('第 2 点时刻', 'Time of point 2', 'Zeit von Punkt 2'), 's', 'time', 1), inp('x2', 'x_2', T('第 2 点位置', 'Position of point 2', 'Ort von Punkt 2'), 'm', 'length', 3),
      inp('t3', 't_3', T('第 3 点时刻', 'Time of point 3', 'Zeit von Punkt 3'), 's', 'time', 2), inp('x3', 'x_3', T('第 3 点位置', 'Position of point 3', 'Ort von Punkt 3'), 'm', 'length', 5)
    ],
    lets: [
      let_('tm', '\\bar t', T('时刻平均', 'Mean time', 'Mittlere Zeit'), 's', '(t1 + t2 + t3)/3'),
      let_('xm', '\\bar x', T('位置平均', 'Mean position', 'Mittlerer Ort'), 'm', '(x1 + x2 + x3)/3'),
      let_('Stt', 'S_{tt}', T('时刻离差平方和', 'Sum of squared time deviations', 'Quadratsumme der Zeitabweichungen'), 's²', '(t1 - tm)^2 + (t2 - tm)^2 + (t3 - tm)^2'),
      let_('Stx', 'S_{tx}', T('协离差和', 'Sum of cross deviations', 'Summe der Kreuzabweichungen'), 'm·s', '(t1 - tm)*(x1 - xm) + (t2 - tm)*(x2 - xm) + (t3 - tm)*(x3 - xm)')
    ],
    conditions: [cond('spread', T('时刻不全相同', 'The times are not all equal', 'Die Zeiten sind nicht alle gleich'), 'Stt > 0')],
    outputs: [
      out('a', 'a', T('斜率', 'Slope', 'Steigung'), 'm/s', 'Stx/Stt', { requires: ['spread'] }),
      out('b', 'b', T('截距', 'Intercept', 'Achsenabschnitt'), 'm', 'xm - Stx/Stt*tm', { requires: ['spread'] }),
      out('r1', 'r_1', T('第 1 点残差', 'Residual of point 1', 'Residuum von Punkt 1'), 'm', 'x1 - (xm - Stx/Stt*tm) - Stx/Stt*t1', { requires: ['spread'] }),
      out('r2', 'r_2', T('第 2 点残差', 'Residual of point 2', 'Residuum von Punkt 2'), 'm', 'x2 - (xm - Stx/Stt*tm) - Stx/Stt*t2', { requires: ['spread'] }),
      out('r3', 'r_3', T('第 3 点残差', 'Residual of point 3', 'Residuum von Punkt 3'), 'm', 'x3 - (xm - Stx/Stt*tm) - Stx/Stt*t3', { requires: ['spread'] })
    ],
    example: { text: T('测得 (t,x) 为 (0,1)、(1,3)、(2,5)，单位为 s 与 m。', 'Measured (t, x): (0, 1), (1, 3), (2, 5) in s and m.', 'Gemessen (t, x): (0, 1), (1, 3), (2, 5) in s und m.'), answer: T('a = 2 m/s，b = 1 m，三点残差均为 0。', 'a = 2 m/s, b = 1 m; all three residuals are 0.', 'a = 2 m/s, b = 1 m; alle drei Residuen sind 0.') },
    point: T('拟合参数有物理意义；残差为零不能证明假设普遍正确。', 'Fit parameters have a physical meaning; zero residuals do not prove the assumption in general.', 'Anpassungsparameter haben eine physikalische Bedeutung; Residuen null beweisen die Annahme nicht allgemein.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:G04'],
    links: {}, gap: T('拟合区间的选择、原始点保留与拟合叠加到图表（EDU08）待做', 'Choosing the fit range, keeping raw points and overlaying fits on charts (EDU08) are still to do', 'Wahl des Anpassungsbereichs, Erhalt der Rohdaten und Überlagerung im Diagramm (EDU08) fehlen noch'),
    review: { physics: '2026-10-28' }
  },
  {
    id: 'G05', title: T('不确定度与相关性', 'Uncertainty and correlation', 'Unsicherheit und Korrelation'),
    stages: ['u'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('一阶（线性）传播；v = s/t', 'First-order (linear) propagation; v = s/t', 'Lineare Fortpflanzung erster Ordnung; v = s/t')],
    validity: T('相对不确定度小；强非线性或大不确定度时改用蒙特卡罗传播', 'Small relative uncertainties; use Monte Carlo propagation for strong non-linearity or large uncertainties', 'Kleine relative Unsicherheiten; bei starker Nichtlinearität Monte-Carlo-Fortpflanzung'),
    sources: ['S80'],
    inputs: [
      pos('s', 's', T('路程', 'Distance', 'Strecke'), 'm', 'length', 1), nonneg('us', 'u(s)', T('路程的标准不确定度', 'Standard uncertainty of the distance', 'Standardunsicherheit der Strecke'), 'm', 'length', 0.01),
      pos('t', 't', L.t, 's', 'time', 2), nonneg('ut', 'u(t)', T('时间的标准不确定度', 'Standard uncertainty of the time', 'Standardunsicherheit der Zeit'), 's', 'time', 0.02),
      inp('r', 'r(s,t)', T('相关系数', 'Correlation coefficient', 'Korrelationskoeffizient'), '', 'ratio', 0, { min: -1, max: 1 })
    ],
    lets: [let_('v0', 'v', T('速度', 'Velocity', 'Geschwindigkeit'), 'm/s', 's/t')],
    conditions: [cond('small', T('相对不确定度小（≤ 5 %）', 'Small relative uncertainties (≤ 5 %)', 'Kleine relative Unsicherheiten (≤ 5 %)'), 'us/s <= 0.05 && ut/t <= 0.05', 'us/s <= 0.2 && ut/t <= 0.2')],
    outputs: [
      out('v', 'v', L.v, 'm/s', 's/t'),
      out('uv', 'u(v)', T('速度的标准不确定度', 'Standard uncertainty of the velocity', 'Standardunsicherheit der Geschwindigkeit'), 'm/s', 'v0*sqrt((us/s)^2 + (ut/t)^2 - 2*r*(us/s)*(ut/t))', { requires: ['small'] }),
      out('rel', 'u(v)/v', T('相对标准不确定度', 'Relative standard uncertainty', 'Relative Standardunsicherheit'), '', 'sqrt((us/s)^2 + (ut/t)^2 - 2*r*(us/s)*(ut/t))', { requires: ['small'] })
    ],
    example: { text: T('s = 1.00 m，u(s) = 0.01 m；t = 2.00 s，u(t) = 0.02 s，输入独立。', 's = 1.00 m, u(s) = 0.01 m; t = 2.00 s, u(t) = 0.02 s; independent inputs.', 's = 1,00 m, u(s) = 0,01 m; t = 2,00 s, u(t) = 0,02 s; unabhängige Eingaben.'), answer: T('v = 0.500 m/s；相对标准不确定度 1.414%，u(v) = 0.00707 m/s。', 'v = 0.500 m/s; relative standard uncertainty 1.414 %, u(v) = 0.00707 m/s.', 'v = 0,500 m/s; relative Standardunsicherheit 1,414 %, u(v) = 0,00707 m/s.') },
    point: T('测量不确定度与数值误差是不同量；有相关性时须加协方差项。', 'Measurement uncertainty and numerical error are different; correlated inputs need the covariance term.', 'Messunsicherheit und numerischer Fehler sind verschieden; korrelierte Größen brauchen den Kovarianzterm.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:G05'],
    links: {}, gap: T('误差条与图表联动、蒙特卡罗传播待做', 'Error bars in charts and Monte Carlo propagation are still to do', 'Fehlerbalken in Diagrammen und Monte-Carlo-Fortpflanzung fehlen noch'),
    review: { physics: '2026-10-28' }
  },
  {
    id: 'G06', title: T('量纲检查与温标', 'Dimension check and temperature scales', 'Dimensionsprüfung und Temperaturskalen'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('七个 SI 基本量纲 L M T I Θ N J；摄氏温度 = 热力学温度 − 273.15 K（仿射），温差只按比例换算', 'Seven SI base dimensions L M T I Θ N J; Celsius temperature = thermodynamic temperature − 273.15 K (affine); differences convert by scale only', 'Sieben SI-Basisdimensionen L M T I Θ N J; Celsius-Temperatur = thermodynamische Temperatur − 273,15 K (affin); Differenzen nur mit Faktor')],
    validity: T('量纲一致是公式正确的必要条件，不是充分条件', 'Dimensional consistency is necessary, not sufficient, for a correct formula', 'Dimensionskonsistenz ist notwendig, nicht hinreichend für eine richtige Formel'),
    sources: ['S01', 'S80'],
    inputs: [
      inp('T1', 'T', T('温度（读数可用 °C）', 'Temperature (may be entered in °C)', 'Temperatur (Eingabe auch in °C)'), 'K', 'temperature', 293.15, { kind: 'temperature', min: 0 }),
      inp('dT', '\\Delta T', L.dT, 'K', 'temperatureDifference', 10, { kind: 'temperatureDifference' }),
      pos('m', 'm', L.m, 'kg', 'mass', 2), inp('a', 'a', L.a, 'm/s²', 'acceleration', 3), inp('v', 'v', L.v, 'm/s', 'velocity', 4)
    ],
    outputs: [
      out('TK', 'T', T('热力学温度', 'Thermodynamic temperature', 'Thermodynamische Temperatur'), 'K', 'T1', { kind: 'temperature' }),
      out('tC', 't', T('摄氏温度（与 273.15 K 之差，数值即 °C 读数）', 'Celsius temperature (difference from 273.15 K; its number is the °C reading)', 'Celsius-Temperatur (Differenz zu 273,15 K; ihre Zahl ist der °C-Wert)'), 'K', 'T1 - T_0C', { kind: 'temperatureDifference' }),
      out('dTK', '\\Delta T', T('温差（K 与 °C 相同）', 'Temperature difference (the same in K and °C)', 'Temperaturdifferenz (in K und °C gleich)'), 'K', 'dT', { kind: 'temperatureDifference' }),
      out('F', 'F', T('ma（量纲为力）', 'ma (dimension of a force)', 'ma (Dimension einer Kraft)'), 'N', 'm*a'),
      out('p', 'p', T('mv（量纲为动量，不能作力）', 'mv (dimension of a momentum, not a force)', 'mv (Dimension eines Impulses, keine Kraft)'), 'kg·m/s', 'm*v')
    ],
    example: { text: T('检查 F = ma 与 F = mv 是否都可作力公式；把 20 °C 转为热力学温度。', 'Are F = ma and F = mv both possible force formulas? Convert 20 °C to a thermodynamic temperature.', 'Sind F = ma und F = mv beide mögliche Kraftformeln? Rechne 20 °C in eine thermodynamische Temperatur um.'), answer: T('ma 为 kg·m/s²，合法；mv 为动量，拒绝作为力；20 °C = 293.15 K。', 'ma is kg·m/s², allowed; mv is a momentum and is rejected as a force; 20 °C = 293.15 K.', 'ma ist kg·m/s², zulässig; mv ist ein Impuls und wird als Kraft abgelehnt; 20 °C = 293,15 K.') },
    point: T('使用七个 SI 基本量纲；温差与摄氏绝对温度的转换不同。', 'Use the seven SI base dimensions; temperature differences and Celsius temperatures convert differently.', 'Die sieben SI-Basisdimensionen verwenden; Temperaturdifferenzen und Celsius-Temperaturen werden verschieden umgerechnet.'),
    status: 'verified', level: 1, teaching: 2, references: ['analytic'],
    benchmarks: ['oracle:G06', 'test:units2656 dims2656 seven dimensions', 'test:dims2656 rejects V + m/s² and ln(1 m)', 'test:units2656 Celsius affine'],
    links: { activities: ['act-units'] }, review: { physics: '2026-10-28', language: '2026-10-28' }
  },
  {
    id: 'G07', title: T('时间步与网格收敛', 'Time-step and grid convergence', 'Zeitschritt- und Gitterkonvergenz'),
    stages: ['u'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('三档细化，比值 r 恒定，处于渐近区', 'Three refinements with a constant ratio r, in the asymptotic range', 'Drei Verfeinerungen mit konstantem Verhältnis r im asymptotischen Bereich')],
    validity: T('相邻差同号且不为零；否则阶数无定义（避免 0/0）', 'Successive differences have the same sign and are not zero; otherwise the order is undefined (no 0/0)', 'Aufeinanderfolgende Differenzen gleichen Vorzeichens und ungleich null; sonst ist die Ordnung undefiniert (kein 0/0)'),
    sources: ['S57', 'S58'],
    inputs: [
      inp('q1', 'Q_h', T('步长 h 的结果', 'Result with step h', 'Ergebnis mit Schritt h'), '', 'value', 1.04),
      inp('q2', 'Q_{h/r}', T('步长 h/r 的结果', 'Result with step h/r', 'Ergebnis mit Schritt h/r'), '', 'value', 1.01),
      inp('q3', 'Q_{h/r^2}', T('步长 h/r² 的结果', 'Result with step h/r²', 'Ergebnis mit Schritt h/r²'), '', 'value', 1.0025),
      inp('r', 'r', T('细化比', 'Refinement ratio', 'Verfeinerungsverhältnis'), '', 'ratio', 2, { min: 1, open: true })
    ],
    lets: [let_('d1', '\\delta_1', T('第一次差', 'First difference', 'Erste Differenz'), '', 'q1 - q2'), let_('d2', '\\delta_2', T('第二次差', 'Second difference', 'Zweite Differenz'), '', 'q2 - q3')],
    conditions: [cond('monotone', T('相邻差同号且不为零', 'Successive differences have the same sign and are not zero', 'Aufeinanderfolgende Differenzen gleichen Vorzeichens, ungleich null'), 'd1*d2 > 0')],
    outputs: [
      out('p', 'p', T('观测阶数', 'Observed order', 'Beobachtete Ordnung'), '', 'ln(d1/d2)/ln(r)', { requires: ['monotone'] }),
      out('qx', 'Q_\\infty', T('Richardson 外推值', 'Richardson extrapolation', 'Richardson-Extrapolation'), '', 'q3 - d2/(d1/d2 - 1)', { requires: ['monotone'] })
    ],
    example: { text: T('同一观测量的三次结果为 1.04、1.01、1.0025，步长逐次减半。', 'Three results of one observable: 1.04, 1.01, 1.0025, halving the step each time.', 'Drei Ergebnisse einer Größe: 1,04, 1,01, 1,0025 bei jeweils halbiertem Schritt.'), answer: T('相邻差为 0.03、0.0075，阶数 p = 2；外推极限为 1.0000。', 'Differences 0.03 and 0.0075, order p = 2; extrapolated limit 1.0000.', 'Differenzen 0,03 und 0,0075, Ordnung p = 2; extrapolierter Grenzwert 1,0000.') },
    point: T('更小容差不自动等于更高物理准确度；须处于渐近区。', 'A smaller tolerance is not automatically more accurate physics; the results must be in the asymptotic range.', 'Eine kleinere Toleranz bedeutet nicht automatisch genauere Physik; die Ergebnisse müssen im asymptotischen Bereich liegen.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic'], benchmarks: ['oracle:G07', 'test:loop3 the split-operator time step converges at second order'],
    links: { labs: ['quantum'], activities: ['act-packet'] }, review: { physics: '2026-10-28' }
  },
  {
    id: 'G08', title: T('随机种子与统计误差', 'Random seeds and statistical error', 'Zufallssaat und statistischer Fehler'),
    stages: ['u'], priority: 'P1', geometry: 'abstract',
    assumptions: [T('n 次独立伯努利试验，成功概率 p', 'n independent Bernoulli trials with success probability p', 'n unabhängige Bernoulli-Versuche mit Erfolgswahrscheinlichkeit p')],
    validity: T('正态近似要求 np 与 n(1−p) 足够大（≥ 10）', 'The normal approximation needs np and n(1 − p) large enough (≥ 10)', 'Die Normalnäherung braucht np und n(1 − p) groß genug (≥ 10)'),
    sources: ['S60', 'S80'],
    inputs: [inp('p', 'p', T('理论概率', 'Probability', 'Wahrscheinlichkeit'), '', 'probability', 0.5, { min: 0, max: 1 }), pos('n', 'n', T('试验次数', 'Number of trials', 'Anzahl der Versuche'), '', 'count', 10000)],
    conditions: [cond('normal', T('np 与 n(1−p) 都不小于 10', 'np and n(1 − p) are both at least 10', 'np und n(1 − p) sind beide mindestens 10'), 'n*p >= 10 && n*(1 - p) >= 10')],
    outputs: [
      out('se', 'SE(\\hat p)', T('比例估计的标准误差', 'Standard error of the proportion', 'Standardfehler des Anteils'), '', 'sqrt(p*(1 - p)/n)'),
      out('hw', '1.96\\,SE', T('95 % 区间半宽（正态近似）', 'Half-width of the 95 % interval (normal approximation)', 'Halbe Breite des 95-%-Intervalls (Normalnäherung)'), '', '1.959963984540054*sqrt(p*(1 - p)/n)', { requires: ['normal'] })
    ],
    example: { text: T('10000 次独立伯努利试验，理论 p = 0.5，求比例估计的标准误差。', '10000 independent Bernoulli trials, p = 0.5: standard error of the estimated proportion.', '10000 unabhängige Bernoulli-Versuche, p = 0,5: Standardfehler des geschätzten Anteils.'), answer: T('SE = 0.005，95% 区间半宽约 0.0098；样本量增四倍，SE 减半。', 'SE = 0.005, half-width of the 95 % interval about 0.0098; four times the samples halve the SE.', 'SE = 0,005, halbe Breite des 95-%-Intervalls etwa 0,0098; viermal so viele Versuche halbieren den SE.') },
    point: T('期望值不是某次随机实验的必然结果。', 'The expected value is not the certain outcome of one random experiment.', 'Der Erwartungswert ist nicht das sichere Ergebnis eines Zufallsexperiments.'),
    status: 'verified', level: 1, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:G08', 'test:loop3 decay seeds and statistical band'],
    links: { labs: ['decay'], activities: ['act-decay'] }, review: { physics: '2026-10-28' }
  }
]
