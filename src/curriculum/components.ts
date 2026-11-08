/**
 * Component → app (26.62, D222): how each of the 310 components of 物理与软件组件库 is realised. The first token is the
 * state — done (the app has it as an object, tool, lab or engine module), partial (it exists in a narrower form; the
 * note says what is missing), model (only as a verified model family: a calculation with conditions and references,
 * not an interactive object), planned (not in the app; the reason says why) — and the rest are resources as in
 * links.ts plus w:<where> (WHERE below) or r:<reason> (REASONS). Honest by construction: a component without an
 * interactive object is never "done". tests/curriculum2662.test.ts checks that all 310 are mapped and every id exists.
 */
import type { Tri } from '../i18n/tri'
import { T } from '../content/models/types'

export const WHERE: Record<string, Tri> = {
  bodies: T('工作台物体：质点、刚体（圆、矩形、多边形、组合体、圆弧）', 'Studio bodies: point masses, rigid bodies (circle, box, polygon, compound, arc)', 'Körper im Arbeitsbereich: Massenpunkte, Starrkörper (Kreis, Rechteck, Polygon, Verbund, Bogen)'),
  flat: T('仅二维（圆、矩形）；三维对象未实现', '2D only (circle, box); 3D objects are not implemented', 'Nur 2D (Kreis, Rechteck); 3D-Objekte gibt es nicht'),
  connectors: T('连接件：绳、杆、弹簧、阻尼器、铰链、焊接、滑轨、电机、齿轮、中心力、外力', 'Connectors: rope, rod, spring, damper, hinge, weld, slider, motor, gear, central force, applied force', 'Verbindungen: Seil, Stab, Feder, Dämpfer, Gelenk, Schweißung, Schiene, Motor, Zahnrad, Zentralkraft, äußere Kraft'),
  chain: T('绳与多段杆可以组成链；没有专用链条对象', 'Ropes and several rods form a chain; there is no dedicated chain object', 'Seile und mehrere Stäbe bilden eine Kette; ein eigenes Kettenobjekt gibt es nicht'),
  pulleys: T('滑轮与动滑轮（绳长约束）', 'Pulleys and movable pulleys (rope-length constraints)', 'Rollen und lose Rollen (Seillängen-Bindung)'),
  contacts: T('接触对：静摩擦、动摩擦、恢复系数、滚动阻力', 'Contact pairs: static and kinetic friction, restitution, rolling resistance', 'Kontaktpaare: Haft- und Gleitreibung, Stoßzahl, Rollwiderstand'),
  fields: T('场区域与重力设置（匀强场、中心力）', 'Field regions and gravity settings (uniform fields, central force)', 'Feldbereiche und Schwerkraft (homogene Felder, Zentralkraft)'),
  drag: T('线性与二次阻力', 'Linear and quadratic drag', 'Lineare und quadratische Reibung'),
  conveyor: T('传送带（速度、共速事件）', 'Conveyor belts (speed, common-speed event)', 'Förderbänder (Geschwindigkeit, Gleichlauf-Ereignis)'),
  events: T('事件列表、停止条件与事件前后读数', 'Event list, stop conditions and readings before and after an event', 'Ereignisliste, Stoppbedingungen und Werte vor und nach einem Ereignis'),
  com: T('观察面板与检查器显示质心', 'The watch panel and inspector show the centre of mass', 'Beobachtung und Inspektor zeigen den Schwerpunkt'),
  liquid: T('液体区域：浮力、浮心、液体阻力', 'Liquid regions: buoyancy, centre of buoyancy, liquid drag', 'Flüssigkeitsbereiche: Auftrieb, Auftriebsmittelpunkt, Flüssigkeitsreibung'),
  particles: T('多刚体小球（高尔顿板、倒入容器）；不是 SPH 流体', 'Many rigid balls (Galton board, pouring); not an SPH fluid', 'Viele starre Kugeln (Galtonbrett, Schütten); keine SPH-Flüssigkeit'),
  waveLab: T('机械波与声实验', 'Mechanical waves and sound lab', 'Versuch Mechanische Wellen und Schall'),
  optics: T('光学实验（光线、透镜与面镜、干涉衍射偏振）', 'Optics labs (rays, lenses and mirrors, interference, diffraction, polarisation)', 'Optikversuche (Strahlen, Linsen und Spiegel, Interferenz, Beugung, Polarisation)'),
  circuitLab: T('电路实验（MNA、暂态、交流、非线性元件）', 'Circuit lab (MNA, transients, AC, nonlinear elements)', 'Schaltungsversuch (MNA, Einschwingen, Wechselstrom, nichtlineare Bauteile)'),
  emLabs: T('电场、电容器与磁场实验', 'Electric field, capacitor and magnetic field labs', 'Versuche zu elektrischem Feld, Kondensator und Magnetfeld'),
  quantumLabs: T('量子、氢原子、光电效应、康普顿实验', 'Quantum, hydrogen, photoelectric and Compton labs', 'Versuche Quanten, Wasserstoff, Photoeffekt, Compton'),
  nuclearLabs: T('衰变与核反应实验', 'Decay and nuclear reaction labs', 'Versuche Zerfall und Kernreaktionen'),
  thermalLabs: T('热学实验（熔化沸腾、热平衡、气体与热机）', 'Thermal labs (melting and boiling, equilibrium, gases and engines)', 'Wärmeversuche (Schmelzen und Sieden, Gleichgewicht, Gase und Wärmekraftmaschinen)'),
  tools: T('测量工具：标尺、量角器、读数', 'Measuring tools: ruler, protractor, readings', 'Messwerkzeuge: Lineal, Winkelmesser, Messwerte'),
  display: T('显示：速度、力、加速度矢量，能量条', 'Display: velocity, force and acceleration vectors, energy bars', 'Anzeige: Geschwindigkeits-, Kraft- und Beschleunigungsvektoren, Energiebalken'),
  charts: T('图表面板、相图、事件直方图', 'Chart panel, phase plot, event histogram', 'Diagramme, Phasenraum, Ereignishistogramm'),
  recording: T('记录、时间轴、回放与导出', 'Recording, timeline, replay and export', 'Aufzeichnung, Zeitachse, Wiedergabe und Export'),
  engine: T('Rust 内核：精确事件求解器、实时多体求解器、确定性运行', 'Rust core: exact event solver, real-time multibody solver, deterministic runs', 'Rust-Kern: exakter Ereignislöser, Echtzeit-Mehrkörperlöser, deterministische Läufe'),
  integrators: T('积分器：Dopri5（自适应）、RK4、Euler、Gauss-4（辛）、Moreau（时间步进）', 'Integrators: Dopri5 (adaptive), RK4, Euler, Gauss-4 (symplectic), Moreau (time stepping)', 'Integratoren: Dopri5 (adaptiv), RK4, Euler, Gauss-4 (symplektisch), Moreau (Zeitschrittverfahren)'),
  formula: T('公式库：表达式、单位与量纲、推导、卡片核验', 'Formula library: expressions, units and dimensions, derivations, card checks', 'Formelbibliothek: Ausdrücke, Einheiten und Dimensionen, Herleitungen, Kartenprüfung'),
  registry: T('模型注册表：条件、分支、常数（CODATA 2022）、独立参考值', 'Model registry: conditions, branches, constants (CODATA 2022), independent references', 'Modellregister: Bedingungen, Zweige, Konstanten (CODATA 2022), unabhängige Referenzwerte'),
  render: T('渲染：画布图层、细节层次、抽稀', 'Rendering: canvas layers, level of detail, decimation', 'Darstellung: Canvas-Ebenen, Detailstufen, Ausdünnung'),
  platform: T('平台：场景文件版本迁移、工作线程、WASM、桌面与安卓', 'Platform: scene file migration, workers, WASM, desktop and Android', 'Plattform: Szenendatei-Migration, Worker, WASM, Desktop und Android'),
  curriculum: T('课程对照（本页）', 'Curriculum map (this page)', 'Lehrplanübersicht (diese Seite)'),
  studio: T('工作台：编辑器、检查器、参数、时间轴、撤销', 'Studio: editor, inspector, parameters, timeline, undo', 'Arbeitsbereich: Editor, Inspektor, Parameter, Zeitachse, Rückgängig'),
  teaching: T('教学：活动、课堂实验、题库、学习路径、提示', 'Teaching: activities, classroom experiments, problem bank, learning paths, hints', 'Unterricht: Aktivitäten, Unterrichtsversuche, Aufgaben, Lernpfade, Hinweise'),
  access: T('无障碍：全键盘活动、色弱配色、课堂投影模式', 'Accessibility: keyboard-only activities, colour-vision palette, projector mode', 'Barrierefreiheit: Aktivitäten nur mit Tastatur, Farbsehschwäche-Palette, Projektionsmodus'),
  i18n: T('中文、英文、德文界面与术语', 'Chinese, English and German interface and terms', 'Chinesische, englische und deutsche Oberfläche und Fachbegriffe'),
  privacy: T('不需要账号；本地保存；AI 密钥只在服务器', 'No account needed; saved locally; the AI key stays on the server', 'Kein Konto nötig; lokal gespeichert; der KI-Schlüssel bleibt auf dem Server'),
  ai: T('Copilot：读数来自引擎、确定性核验、撤销', 'Copilot: readings from the engine, deterministic checks, undo', 'Copilot: Werte aus der Engine, deterministische Prüfung, Rückgängig')
}

export const REASONS: Record<string, Tri> = {
  '3d': T('VeloPhi 是二维引擎；三维需要新的渲染与求解器', 'VeloPhi is a 2D engine; 3D needs a new renderer and solver', 'VeloPhi ist eine 2D-Engine; 3D braucht neue Darstellung und Löser'),
  cfd: T('没有二维流场求解器；只有一维与解析模型（F05–F12、X02）', 'No 2D flow solver; only 1D and analytic models (F05–F12, X02)', 'Kein 2D-Strömungslöser; nur 1D- und analytische Modelle (F05–F12, X02)'),
  mesh: T('没有通用网格生成器；有限差分与有限元只在模型族里（X01–X04）', 'No general mesh generator; finite differences and elements only inside model families (X01–X04)', 'Kein allgemeiner Netzgenerator; Differenzen und Elemente nur in Modellfamilien (X01–X04)'),
  plugin: T('不运行第三方代码：插件需要沙箱与审核流程', 'No third-party code runs: plugins need a sandbox and a review process', 'Es läuft kein Fremdcode: Plugins brauchen Sandbox und Prüfprozess'),
  collab: T('离线优先、不收集学生数据：班级协作需要账号与服务器，暂不做', 'Offline first, no student data collected: class collaboration needs accounts and a server — not planned yet', 'Offline zuerst, keine Schülerdaten: Zusammenarbeit braucht Konten und Server — noch nicht geplant'),
  instrument: T('真实仪器读数要在实验室练习；软件只给虚拟读数（K02）', 'Real instrument readings are practised in the lab; the app only gives virtual readings (K02)', 'Echte Ablesungen übt man im Labor; die App bietet nur virtuelle Ablesungen (K02)'),
  optics: T('偏振实验只有偏振片；波片（相位延迟）未实现', 'The polarisation lab has polarisers only; wave plates (retarders) are not implemented', 'Der Polarisationsversuch hat nur Polarisatoren; Verzögerungsplatten fehlen'),
  sky: T('星图背景属于天文软件范围，不影响物理计算', 'A star map belongs to astronomy software and does not change any physics', 'Eine Sternkarte gehört zu Astronomiesoftware und ändert keine Physik'),
  magnets: T('磁体实验只有单个条形磁体与线圈', 'The magnet lab has a single bar magnet and coils', 'Der Magnetversuch hat einen Stabmagneten und Spulen'),
  source: T('电路实验没有独立电流源；可用电压源与电阻等效', 'The circuit lab has no independent current source; use a voltage source with a resistor', 'Der Schaltungsversuch hat keine Stromquelle; Spannungsquelle mit Widerstand verwenden')
}

export const COMPONENT_LINKS: Record<string, string> = {
  // C01 场景/几何与力学对象
  'C01-001': 'done w:bodies', 'C01-002': 'done w:bodies', 'C01-003': 'planned r:3d', 'C01-004': 'partial w:flat', 'C01-005': 'partial w:flat',
  'C01-006': 'done w:bodies', 'C01-007': 'done w:bodies', 'C01-008': 'done w:contacts t:bouncing-ball', 'C01-009': 'done w:connectors t:hinged-rod', 'C01-010': 'model M30 X03',
  'C01-011': 'done t:lever M21', 'C01-012': 'done t:incline', 'C01-013': 'done w:connectors t:slider-stop', 'C01-014': 'done w:bodies t:arc-slide t:vertical-loop', 'C01-015': 'done w:pulleys t:atwood',
  'C01-016': 'done w:pulleys t:movable-pulley', 'C01-017': 'done w:connectors', 'C01-018': 'done w:connectors t:spring', 'C01-019': 'done w:connectors t:damped-spring', 'C01-020': 'partial w:chain',
  'C01-021': 'done w:connectors t:hinged-rod', 'C01-022': 'done w:connectors', 'C01-023': 'done w:connectors', 'C01-024': 'done w:connectors', 'C01-025': 'done w:connectors t:gears',
  'C01-026': 'done t:rolling t:rolling-slip', 'C01-027': 'done w:conveyor t:conveyor', 'C01-028': 'done w:contacts', 'C01-029': 'done w:contacts t:incline-friction', 'C01-030': 'done w:fields t:orbit',
  'C01-031': 'done w:fields', 'C01-032': 'done w:connectors t:variable-force', 'C01-033': 'done w:drag t:drag-fall', 'C01-034': 'done w:drag t:drag-fall', 'C01-035': 'done w:connectors t:motor-disc',
  'C01-036': 'done t:pendulum', 'C01-037': 'done w:connectors t:double-pendulum', 'C01-038': 'done w:com', 'C01-039': 'done w:events',
  // C02 流体/热/材料对象
  'C02-001': 'done w:liquid t:floating-block', 'C02-002': 'model F01', 'C02-003': 'done w:liquid t:loaded-boat', 'C02-004': 'model X02 r:cfd', 'C02-005': 'planned r:3d',
  'C02-006': 'model F05 F07', 'C02-007': 'model F05 F06', 'C02-008': 'planned r:cfd', 'C02-009': 'planned r:cfd', 'C02-010': 'done l:gas',
  'C02-011': 'model F06', 'C02-012': 'planned r:cfd', 'C02-013': 'planned r:cfd', 'C02-014': 'partial w:particles t:ball-pour', 'C02-015': 'model K13',
  'C02-016': 'done l:heating', 'C02-017': 'done l:mixing', 'C02-018': 'model T05 X04', 'C02-019': 'model X04', 'C02-020': 'model T06 K15',
  'C02-021': 'model T07 K14', 'C02-022': 'model T05 K15', 'C02-023': 'done l:heating', 'C02-024': 'done l:gas', 'C02-025': 'model T13 X07',
  'C02-026': 'done l:gas', 'C02-027': 'done l:gas', 'C02-028': 'model K16', 'C02-029': 'partial Q14 t:coupled-oscillators', 'C02-030': 'model K10',
  'C02-031': 'model K12', 'C02-032': 'done l:capacitor E07', 'C02-033': 'model B19',
  // C03 波动与光学对象
  'C03-001': 'done l:waves', 'C03-002': 'done l:waves', 'C03-003': 'partial l:wave-optics K29', 'C03-004': 'planned r:3d', 'C03-005': 'model K29',
  'C03-006': 'partial l:waves W08', 'C03-007': 'done l:waves', 'C03-008': 'model B18', 'C03-009': 'done l:wave-optics', 'C03-010': 'done l:wave-optics',
  'C03-011': 'partial l:waves W12', 'C03-012': 'partial l:waves W12', 'C03-013': 'model W09 B18', 'C03-014': 'model W09', 'C03-015': 'done l:rays l:lens',
  'C03-016': 'done l:rays', 'C03-017': 'partial l:rays O02', 'C03-018': 'done l:rays', 'C03-019': 'model K18 O13', 'C03-020': 'done l:rays',
  'C03-021': 'done l:lens', 'C03-022': 'done l:lens', 'C03-023': 'done l:lens', 'C03-024': 'done l:lens', 'C03-025': 'model O06 O13',
  'C03-026': 'done l:rays', 'C03-027': 'done l:rays', 'C03-028': 'model O03', 'C03-029': 'done l:wave-optics', 'C03-030': 'planned r:optics',
  'C03-031': 'done l:wave-optics', 'C03-032': 'model O11', 'C03-033': 'model O10', 'C03-034': 'done l:hydrogen',
  // C04 电路与电磁对象
  'C04-001': 'done l:circuit', 'C04-002': 'done l:circuit', 'C04-003': 'done l:circuit/emf', 'C04-004': 'done l:circuit/acR', 'C04-005': 'planned r:source',
  'C04-006': 'done l:circuit/series', 'C04-007': 'done l:circuit/divider', 'C04-008': 'done l:circuit/rc', 'C04-009': 'done l:circuit/rl', 'C04-010': 'done l:circuit',
  'C04-011': 'done l:circuit/home', 'C04-012': 'done l:circuit/home', 'C04-013': 'done l:circuit/rectifier', 'C04-014': 'done l:circuit/rectifier', 'C04-015': 'partial l:circuit/rectifier',
  'C04-016': 'model E20', 'C04-017': 'model K20', 'C04-018': 'model K21', 'C04-019': 'model K20', 'C04-020': 'done l:circuit/voltmeterConv',
  'C04-021': 'done l:circuit/ammeterConv', 'C04-022': 'partial l:circuit/ohmmeter', 'C04-023': 'partial t:oscilloscope f:chart', 'C04-024': 'done l:field', 'C04-025': 'done w:fields t:charge-deflection',
  'C04-026': 'done l:capacitor', 'C04-027': 'partial l:magnet', 'C04-028': 'done l:magnet', 'C04-029': 'planned r:magnets', 'C04-030': 'model B01',
  'C04-031': 'model B02', 'C04-032': 'partial l:magnet B02', 'C04-033': 'model B19', 'C04-034': 'done l:magnet', 'C04-035': 'done l:circuit/motor',
  'C04-036': 'done l:circuit/generator', 'C04-037': 'done l:circuit/transformer', 'C04-038': 'done w:fields t:cyclotron', 'C04-039': 'done t:velocity-selector t:mass-spectrometer', 'C04-040': 'model B08',
  'C04-041': 'model B16 B18', 'C04-042': 'partial l:magnet B09',
  // C05 量子/原子核/宇宙对象
  'C05-001': 'done l:quantum', 'C05-002': 'done l:quantum', 'C05-003': 'done l:quantum', 'C05-004': 'model Q09', 'C05-005': 'partial O07 Q03 l:wave-optics',
  'C05-006': 'done l:hydrogen Q10', 'C05-007': 'partial l:photo', 'C05-008': 'done l:hydrogen', 'C05-009': 'done l:hydrogen', 'C05-010': 'partial l:nuclear N12',
  'C05-011': 'done l:decay', 'C05-012': 'done l:decay', 'C05-013': 'done l:nuclear', 'C05-014': 'model N11', 'C05-015': 'partial t:cyclotron t:bounded-field',
  'C05-016': 'done t:orbit', 'C05-017': 'done t:orbit t:kepler', 'C05-018': 'model R08 T07', 'C05-019': 'done t:binary-star', 'C05-020': 'partial t:binary-star M26',
  'C05-021': 'model K24', 'C05-022': 'planned r:sky', 'C05-023': 'model O06', 'C05-024': 'done l:relativity', 'C05-025': 'model K26',
  // C06 测量设备/教学控制台
  'C06-001': 'partial w:tools K02', 'C06-002': 'partial w:events f:tape', 'C06-003': 'planned r:instrument', 'C06-004': 'done l:mixing l:heating', 'C06-005': 'model F01',
  'C06-006': 'done t:weigh-in-water t:elevator', 'C06-007': 'done w:display', 'C06-008': 'done l:circuit', 'C06-009': 'done l:field', 'C06-010': 'done l:magnet',
  'C06-011': 'planned r:cfd', 'C06-012': 'partial w:events', 'C06-013': 'done w:tools', 'C06-014': 'partial l:hydrogen W13', 'C06-015': 'done l:decay w:charts',
  'C06-016': 'done l:gas', 'C06-017': 'done w:charts f:chart', 'C06-018': 'done w:display', 'C06-019': 'done f:fbd', 'C06-020': 'done w:charts',
  'C06-021': 'done l:field', 'C06-022': 'model G05 K06', 'C06-023': 'partial G04 K03 s:lesson-rc', 'C06-024': 'done w:recording f:watch', 'C06-025': 'done w:recording',
  'C06-026': 'done f:solverCompare', 'C06-027': 'done f:units',
  // C07 数值/渲染/底层系统
  'C07-001': 'done w:formula', 'C07-002': 'done w:registry', 'C07-003': 'done w:formula', 'C07-004': 'done w:registry', 'C07-005': 'done w:engine',
  'C07-006': 'done w:engine', 'C07-007': 'done w:integrators', 'C07-008': 'partial w:integrators', 'C07-009': 'partial w:integrators K30', 'C07-010': 'done w:engine',
  'C07-011': 'done w:engine', 'C07-012': 'done w:engine', 'C07-013': 'done w:engine', 'C07-014': 'model K09 K10 K12 F11', 'C07-015': 'partial X01 X04 l:field',
  'C07-016': 'planned r:mesh', 'C07-017': 'model X04', 'C07-018': 'model X01', 'C07-019': 'partial l:waves K29', 'C07-020': 'model B18',
  'C07-021': 'done l:circuit', 'C07-022': 'done l:circuit/rc', 'C07-023': 'done l:circuit/rlc', 'C07-024': 'done l:circuit/rectifier', 'C07-025': 'done T15 t:galton',
  'C07-026': 'done l:decay', 'C07-027': 'done l:quantum', 'C07-028': 'done l:quantum Q08', 'C07-029': 'partial t:binary-star M26', 'C07-030': 'model F07 K15',
  'C07-031': 'planned r:cfd', 'C07-032': 'model X03', 'C07-033': 'model G07', 'C07-034': 'done w:integrators', 'C07-035': 'done G08 w:engine',
  'C07-036': 'done w:formula f:solverCompare', 'C07-037': 'done l:field', 'C07-038': 'done w:recording', 'C07-039': 'partial w:render', 'C07-040': 'done w:engine',
  'C07-041': 'done w:render', 'C07-042': 'done l:field w:display', 'C07-043': 'partial l:wave-optics', 'C07-044': 'done t:galton t:ball-pour', 'C07-045': 'done l:rays',
  'C07-046': 'done l:waves l:wave-optics', 'C07-047': 'done w:charts', 'C07-048': 'done w:render', 'C07-049': 'done w:platform', 'C07-050': 'done w:platform',
  'C07-051': 'planned r:plugin', 'C07-052': 'done w:platform', 'C07-053': 'partial w:engine', 'C07-054': 'done w:platform', 'C07-055': 'done w:formula',
  'C07-056': 'done w:engine', 'C07-057': 'partial G07 l:quantum', 'C07-058': 'done w:registry', 'C07-059': 'done f:sweep', 'C07-060': 'partial G04 K03',
  'C07-061': 'done f:export', 'C07-062': 'partial f:repro',
  // C08 课程/交互/协作平台
  'C08-001': 'done w:curriculum', 'C08-002': 'partial f:learning', 'C08-003': 'done w:curriculum', 'C08-004': 'done w:curriculum', 'C08-005': 'done f:handbook',
  'C08-006': 'done w:formula', 'C08-007': 'done f:handbook', 'C08-008': 'done w:formula', 'C08-009': 'done f:task', 'C08-010': 'done f:task',
  'C08-011': 'done w:studio', 'C08-012': 'done w:studio', 'C08-013': 'done w:studio', 'C08-014': 'done w:studio', 'C08-015': 'done w:studio',
  'C08-016': 'done f:repro', 'C08-017': 'done f:solverCompare', 'C08-018': 'planned r:3d', 'C08-019': 'done w:studio', 'C08-020': 'done w:tools',
  'C08-021': 'done f:courseware', 'C08-022': 'done f:lessons w:access', 'C08-023': 'partial f:courseware', 'C08-024': 'done w:teaching', 'C08-025': 'done f:problems',
  'C08-026': 'done w:teaching', 'C08-027': 'partial w:teaching', 'C08-028': 'done f:prediction', 'C08-029': 'done w:teaching', 'C08-030': 'done f:problems',
  'C08-031': 'partial w:teaching', 'C08-032': 'done f:report', 'C08-033': 'partial G05', 'C08-034': 'partial w:teaching', 'C08-035': 'done f:problems',
  'C08-036': 'planned r:collab', 'C08-037': 'partial f:export', 'C08-038': 'done w:i18n', 'C08-039': 'done w:access', 'C08-040': 'done w:access',
  'C08-041': 'partial w:engine', 'C08-042': 'done w:privacy', 'C08-043': 'partial w:platform', 'C08-044': 'partial w:access', 'C08-045': 'done w:registry',
  'C08-046': 'done f:copilot w:ai', 'C08-047': 'partial w:registry', 'C08-048': 'done f:repro'
}

/** What a "partial" component is missing (shown under its state). */
export const PARTIAL_NOTES: Record<string, Tri> = {
  'C01-004': T('二维圆盘代替球体', 'A 2D disc stands for a sphere', 'Eine 2D-Scheibe steht für die Kugel'),
  'C01-005': T('二维矩形代替长方体', 'A 2D box stands for a cuboid', 'Ein 2D-Rechteck steht für den Quader'),
  'C07-008': T('有 Gauss-4 辛积分器；没有 Verlet/蛙跳', 'Gauss-4 is symplectic; there is no Verlet/leapfrog', 'Gauss-4 ist symplektisch; Verlet/Leapfrog fehlen'),
  'C07-009': T('Moreau 时间步进是隐式的；刚性 ODE 的比较在 K30', 'Moreau time stepping is implicit; stiff ODEs are compared in K30', 'Das Moreau-Verfahren ist implizit; steife Gleichungen vergleicht K30'),
  'C07-053': T('等待与运行有上限；没有用户可调的计算预算', 'Waits and runs are bounded; there is no user-set budget', 'Warten und Läufe sind begrenzt; ein einstellbares Budget fehlt'),
  'C08-041': T('实时多体求解器用于大场景；没有单独的性能档设置', 'The real-time multibody solver handles large scenes; there is no separate performance setting', 'Der Echtzeit-Löser übernimmt große Szenen; eine eigene Leistungsstufe fehlt'),
  'C08-043': T('桌面版与安卓版可离线；没有课程包下载', 'Desktop and Android work offline; there are no course-package downloads', 'Desktop und Android laufen offline; Kurspakete zum Herunterladen fehlen'),
  'C08-044': T('有课堂投影模式；没有 WebXR', 'Projector mode exists; there is no WebXR', 'Projektionsmodus vorhanden; WebXR fehlt'),
  'C08-047': T('每个模型族有审校日期；没有审批流程界面', 'Each model family has review dates; there is no approval workflow', 'Jede Modellfamilie hat Prüfdaten; ein Freigabeablauf fehlt')
}
