/**
 * Interface texts of 26.64: the chart of nuclides, the nuclide pages, the decay-chain view, and the wording of every
 * diagnostic and error of the nuclear and reactor operations of the core (D276–D278; the codes are listed in
 * engine/MESSAGES.md, "Nuclides and reactor"). The texts of the reactor workshop itself are in v2664reactor.ts.
 * One entry per Chinese source text: `'中文': ['English', 'Deutsch']` (British spelling; terms as in docs/i18n/GLOSSARY.md).
 */
export const TEXTS_2664_NUC: Record<string, readonly [string, string]> = {
  // the lab catalogue and the links from the decay lab
  '核素图': ['Nuclide chart', 'Nuklidkarte'],
  '中子数—质子数平面上的全部核素：半衰期、衰变方式、结合能，衰变链随时间的演化': ['Every nuclide on the plane of neutron and proton number: half-lives, decay modes, binding energies, and decay chains in time', 'Alle Nuklide in der Ebene von Neutronen- und Protonenzahl: Halbwertszeiten, Zerfallsarten, Bindungsenergien und Zerfallsreihen im Zeitverlauf'],
  '用 NUBASE2020 的半衰期与分支比算真实核素的衰变链': ['Decay chains of real nuclides with the half-lives and branching ratios of NUBASE2020', 'Zerfallsreihen echter Nuklide mit den Halbwertszeiten und Verzweigungsverhältnissen von NUBASE2020'],
  '真实的链': ['Real chain', 'Echte Zerfallsreihe'],
  '核素页': ['Nuclide page', 'Nuklidseite'],

  // the chart
  '核素图：横轴中子数 N，纵轴质子数 Z。方向键移动，加减号缩放。': ['Chart of nuclides: neutron number N across, proton number Z up. Arrow keys move, plus and minus zoom.', 'Nuklidkarte: Neutronenzahl N nach rechts, Protonenzahl Z nach oben. Pfeiltasten bewegen, Plus und Minus zoomen.'],
  '显示全图': ['Show whole chart', 'Ganze Karte zeigen'],
  '图例': ['Legend', 'Legende'],
  '搜索核素，如 U-235、铀235': ['Find a nuclide, e.g. U-235', 'Nuklid suchen, z. B. U-235'],
  '搜索核素': ['Find a nuclide', 'Nuklid suchen'],
  '没有找到这个核素': ['No such nuclide', 'Kein solches Nuklid'],
  '衰变方式': ['Decay mode', 'Zerfallsart'],
  '比结合能': ['Binding energy per nucleon', 'Bindungsenergie je Nukleon'],
  '正在载入核素表…': ['Loading the nuclide table…', 'Nuklidtabelle wird geladen …'],
  '在图上点一个核素，或在上面搜索。': ['Choose a nuclide on the chart, or search above.', 'Ein Nuklid auf der Karte wählen oder oben suchen.'],
  '核素表里没有 {0}。': ['The nuclide table has no {0}.', 'Die Nuklidtabelle enthält {0} nicht.'],
  'β⁺ 或电子俘获': ['β⁺ or electron capture', 'β⁺ oder Elektroneneinfang'],
  '自发裂变': ['Spontaneous fission', 'Spontane Spaltung'],
  '质子发射': ['Proton emission', 'Protonenemission'],
  '中子发射': ['Neutron emission', 'Neutronenemission'],
  '其他方式': ['Other modes', 'Andere Arten'],
  '未知': ['Unknown', 'Unbekannt'],

  // the page of a nuclide
  '衰变分支': ['Decay branches', 'Zerfallszweige'],
  '子核': ['Daughter', 'Tochter'],
  '份额': ['Share', 'Anteil'],
  '发表的衰变方式': ['Decay modes as published', 'Veröffentlichte Zerfallsarten'],
  '同质异能态': ['Isomers', 'Isomere'],
  '半衰期未知': ['Half-life unknown', 'Halbwertszeit unbekannt'],
  '裂变产物（不跟踪）': ['Fission products (not followed)', 'Spaltprodukte (nicht verfolgt)'],
  '表外的核素': ['A nuclide outside the table', 'Nuklid außerhalb der Tabelle'],
  '由系统学估计': ['estimated from systematics', 'aus der Systematik geschätzt'],
  '只有界限': ['a limit only', 'nur eine Grenze'],
  '衰变常数 λ': ['Decay constant λ', 'Zerfallskonstante λ'],
  '半衰期（秒）': ['Half-life (seconds)', 'Halbwertszeit (Sekunden)'],
  '质量过剩': ['Mass excess', 'Massenexzess'],
  '结合能': ['Binding energy', 'Bindungsenergie'],
  '强度未知': ['intensity unknown', 'Intensität unbekannt'],
  '到 {0} 的份额未知，按基态计': ['the share reaching {0} is unknown; the ground state is assumed', 'der Anteil nach {0} ist unbekannt; der Grundzustand wird angenommen'],
  '对粒子发射不稳定：寿命极短，半衰期没有数值。': ['Unstable against particle emission: extremely short-lived, no half-life value.', 'Instabil gegen Teilchenemission: extrem kurzlebig, kein Wert der Halbwertszeit.'],
  '有的衰变方式只知道存在，强度没有数值。': ['Some decay modes are only known to exist; their intensity has no value.', 'Von einigen Zerfallsarten ist nur bekannt, dass es sie gibt; ihre Intensität hat keinen Wert.'],
  '发表的强度合计为 {0}；核心按它们的比例计算分支。': ['The published intensities add up to {0}; the core computes the branches in their proportion.', 'Die veröffentlichten Intensitäten ergeben zusammen {0}; der Kern berechnet die Zweige in ihrem Verhältnis.'],

  // the decay-chain view
  '衰变链图：{0} 个核素': ['Decay-chain diagram: {0} nuclides', 'Bild der Zerfallsreihe: {0} Nuklide'],
  '纵轴的量': ['Quantity plotted', 'Aufgetragene Größe'],
  '核数': ['Nuclei', 'Kerne'],
  '时长': ['Duration', 'Dauer'],
  '对数时间': ['Log time', 'Zeit logarithmisch'],
  '对数纵轴': ['Log values', 'Werte logarithmisch'],
  '读数时刻': ['Read at', 'Ablesezeit'],
  '初始的量': ['Initial amount', 'Anfangsmenge'],
  't = {0} 时': ['At t = {0}', 'Bei t = {0}'],
  '模型的说明': ['Notes of the model', 'Hinweise des Modells'],
  '{0} 是稳定核素，没有衰变链。': ['{0} is stable and has no decay chain.', '{0} ist stabil und hat keine Zerfallsreihe.'],
  '{0}：{1} 自发裂变，裂变产物不跟踪': ['{0}: {1} fission spontaneously; the fission products are not followed', '{0}: {1} spalten spontan; die Spaltprodukte werden nicht verfolgt'],
  '{0}：{1} 衰变到表外的核素': ['{0}: {1} decay to a nuclide outside the table', '{0}: {1} zerfallen in ein Nuklid außerhalb der Tabelle'],
  '{0}：{1} 走的是低于阈值的分支，没有跟踪': ['{0}: {1} take branches below the threshold, which are not followed', '{0}: {1} nehmen Zweige unter der Schwelle, die nicht verfolgt werden'],
  '{0}：{1} 的去向未知': ['{0}: where {1} go is unknown', '{0}: wohin {1} gehen, ist unbekannt'],
  '{0}：{1} 没有列出的衰变方式': ['{0}: {1} have no listed decay mode', '{0}: für {1} ist keine Zerfallsart angegeben'],
  '贝特曼解析解 {0} 个值，转移矩阵 {1} 个值；相对误差界 {2}': ['Analytic Bateman solution for {0} values, transition matrix for {1}; relative error bound {2}', 'Analytische Bateman-Lösung für {0} Werte, Übergangsmatrix für {1}; relative Fehlerschranke {2}'],
  '贝特曼解析解 {0} 个值；相对误差界 {1}': ['Analytic Bateman solution for {0} values; relative error bound {1}', 'Analytische Bateman-Lösung für {0} Werte; relative Fehlerschranke {1}'],

  // data sources (NUBASE2020 / AME2020, CC BY 3.0)
  '数据来源与许可': ['Data sources and licence', 'Datenquellen und Lizenz'],
  '核素数据取自 NUBASE2020 与 AME2020 两个评价，按知识共享署名 3.0 许可（CC BY 3.0）使用：': ['The nuclide data are those of the NUBASE2020 and AME2020 evaluations, used under the Creative Commons Attribution 3.0 licence (CC BY 3.0):', 'Die Nukliddaten stammen aus den Evaluationen NUBASE2020 und AME2020 und werden unter der Lizenz Creative Commons Namensnennung 3.0 (CC BY 3.0) verwendet:'],
  '改动说明：从原表中选取了基态与主要的同质异能态，半衰期换算为秒，衰变强度换算为份额；子核、分支比、Q 值与结合能由本应用的计算核心从这些数据算出。': ['Changes made: ground states and the main isomers were selected from the tables, half-lives converted to seconds and decay intensities to fractions; daughters, branching fractions, Q values and binding energies are computed from these data by the calculation core of this application.', 'Vorgenommene Änderungen: Grundzustände und die wichtigsten Isomere wurden aus den Tabellen ausgewählt, Halbwertszeiten in Sekunden und Zerfallsintensitäten in Anteile umgerechnet; Töchter, Verzweigungsanteile, Q-Werte und Bindungsenergien berechnet der Rechenkern dieser Anwendung aus diesen Daten.'],
  '表内共 {0} 个核素：{1} 个基态、{2} 个同质异能态，其中 {3} 个稳定。': ['The table holds {0} nuclides: {1} ground states and {2} isomers, {3} of them stable.', 'Die Tabelle enthält {0} Nuklide: {1} Grundzustände und {2} Isomere, davon {3} stabil.'],

  // diagnostics of the nuclear operations (engine/MESSAGES.md)
  '{0} 的 {1} 衰变有多少落到同质异能态 {2} 没有数据，这里按全部到基态 {3} 计算。': ['There are no data on how much of the {1} decay of {0} feeds the isomer {2}; all of it is taken to reach the ground state {3}.', 'Es gibt keine Daten dazu, welcher Teil des {1}-Zerfalls von {0} das Isomer {2} bevölkert; hier geht alles in den Grundzustand {3}.'],
  '{0} 已知的分支比合计只有 {1}，其余的去向没有跟踪。': ['The known branches of {0} add up to only {1}; the rest is not followed.', 'Die bekannten Zweige von {0} ergeben zusammen nur {1}; der Rest wird nicht verfolgt.'],
  '{0} 的衰变方式或分支比未知，衰变链到它为止。': ['The decay modes or branching ratios of {0} are not known; the chain ends there.', 'Zerfallsarten oder Verzweigungsverhältnisse von {0} sind unbekannt; die Reihe endet dort.'],
  '{0} 的半衰期未知，衰变链到它为止。': ['The half-life of {0} is not known; the chain ends there.', 'Die Halbwertszeit von {0} ist unbekannt; die Reihe endet dort.'],
  '{1} 个数值中有 {0} 个改用转移矩阵求出（衰变常数相近或时间很早，解析求和的舍入误差过大）；两种算法解的是同一组方程。': ['{0} of {1} values come from the transition matrix instead (nearly equal decay constants or very early times, where the analytic sum loses too many digits); both methods solve the same equations.', '{0} von {1} Werten stammen stattdessen aus der Übergangsmatrix (fast gleiche Zerfallskonstanten oder sehr frühe Zeiten, bei denen die analytische Summe zu viele Stellen verliert); beide Verfahren lösen dieselben Gleichungen.'],

  // diagnostics of the reactor operations
  '教学模型：两群扩散、均匀化截面、集总热工，不能用于设计或安全分析。': ['A teaching model: two-group diffusion, homogenised cross-sections, lumped thermal hydraulics. Not for design or safety analysis.', 'Ein Lehrmodell: Zweigruppen-Diffusion, homogenisierte Wirkungsquerschnitte, konzentrierte Thermohydraulik. Nicht für Auslegung oder Sicherheitsanalysen.'],
  '增殖因数的迭代没有收敛到设定的精度，k = {0} 只是近似值。': ['The iteration for the multiplication factor did not reach the set accuracy; k = {0} is only approximate.', 'Die Iteration für den Multiplikationsfaktor hat die vorgegebene Genauigkeit nicht erreicht; k = {0} ist nur ein Näherungswert.'],
  '反应性 {0} 已达到 0.9 β（{1}），接近瞬发临界：超出本模型的适用范围，仿真在 t = {2} 停下，不再往后算。': ['The reactivity {0} has reached 0.9 β ({1}), close to prompt critical: this is outside the range of the model, so the simulation stops at t = {2} and computes nothing beyond.', 'Die Reaktivität {0} hat 0,9 β ({1}) erreicht und liegt nahe an prompt kritisch: Das liegt außerhalb des Gültigkeitsbereichs des Modells; die Simulation hält bei t = {2} an und rechnet nicht weiter.'],
  '这个布局在所给功率下不临界（k = {0}），平衡状态靠一项正的补偿反应性 {1} 维持；真实的堆里没有吸收体能提供它。': ['This layout is not critical at the power given (k = {0}); the equilibrium is held by a positive compensating reactivity of {1}, which no absorber of a real reactor could provide.', 'Diese Anordnung ist bei der angegebenen Leistung nicht kritisch (k = {0}); das Gleichgewicht wird durch eine positive Ausgleichsreaktivität von {1} gehalten, die kein Absorber eines echten Reaktors liefern könnte.'],
  '这一步里重新求解布局的次数用完了，只算到 t = {0}；继续运行会接着算。': ['This step used up its new solutions of the layout and reached only t = {0}; running on continues from there.', 'In diesem Schritt wurden die neuen Lösungen der Anordnung aufgebraucht; erreicht wurde nur t = {0}. Beim Weiterlaufen wird von dort fortgesetzt.'],
  '保护停堆（{0}）：t = {1}，测得 {2}，限值 {3}。': ['Trip ({0}): t = {1}, measured {2}, limit {3}.', 'Schutzabschaltung ({0}): t = {1}, gemessen {2}, Grenzwert {3}.'],
  '堆芯损坏：t = {0} 时燃料最高温度 {1} 超过了损坏限值 {2}，仿真结束。': ['Core damage: at t = {0} the peak fuel temperature of {1} exceeded the damage limit of {2}; the simulation has ended.', 'Kernschaden: Bei t = {0} überschritt die höchste Brennstofftemperatur von {1} die Schadensgrenze von {2}; die Simulation ist beendet.'],
  '功率超过限值': ['power above the limit', 'Leistung über dem Grenzwert'],
  '周期短于限值': ['period shorter than the limit', 'Periode kürzer als der Grenzwert'],
  '燃料温度超过限值': ['fuel temperature above the limit', 'Brennstofftemperatur über dem Grenzwert'],
  '手动停堆': ['manual scram', 'Handabschaltung'],

  // errors of the nuclear and reactor operations (the core gives an English detail)
  '计算没有完成：{0}': ['The calculation did not finish: {0}', 'Die Rechnung wurde nicht abgeschlossen: {0}'],
  '核素数据文件无效：{0}': ['The nuclide data file is not valid: {0}', 'Die Nukliddatei ist ungültig: {0}'],
  '核素请求无法计算：{0}': ['The nuclide request cannot be computed: {0}', 'Die Nuklidanfrage lässt sich nicht berechnen: {0}'],
  '衰变网络无法计算：{0}': ['The decay network cannot be computed: {0}', 'Das Zerfallsnetz lässt sich nicht berechnen: {0}'],
  '反应堆截面数据无效：{0}': ['The reactor cross-section data are not valid: {0}', 'Die Wirkungsquerschnittsdaten des Reaktors sind ungültig: {0}'],
  '任务无法检查：{0}': ['The task cannot be checked: {0}', 'Die Aufgabe lässt sich nicht prüfen: {0}'],
  '反应堆布局无法计算：{0}': ['The reactor layout cannot be computed: {0}', 'Die Reaktoranordnung lässt sich nicht berechnen: {0}']
}
