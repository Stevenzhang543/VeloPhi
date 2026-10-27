# VeloΦ（VeloPhi）26.54 发布说明

文档日期：2026-10-27 · 版本 26.54.0

26.54 按 `DEV_MANUAL_26_54.md` 和维护者在 26.53 发布后提出的目标开发：**重新梳理物理框架**——对照“初中 → 高中 → 大学”的物理路线图列出已有与待扩展的全部内容（手册第 2 节总表），按难度分为 A–E 五组，分到 26.54 与 26.55 两个版本（两版内不可能完成的顺延到 26.56、26.57 并标注）；**界面重新规划**——左侧工具与右侧公式加入折叠、分层与分类，主次分明。26.54 完成了界面重排的主体、实验室框架、电与磁的运行时，以及 A 组全部、B 组六个专题和 C 组的两项。英文、德文摘要见文末。

## 本版内容

### U 界面分层（D86）

- **工具面板**：顶部固定 8 个常用工具；下面是分类页签——物体、连接、力与场、编辑、标注，一次只显示一类；面板头部有工具搜索（名称与快捷键，Enter 选第一个）和吸附图标（物体吸附、网格吸附）；“对象”列表默认折叠并显示数量。工具再增加（电荷、电场、磁场）面板也不会变长。窄栏模式保留。
- **右侧面板**：页签由 5 个减为 3 个——**分析**（二级切换：公式 / 监视 / 预测）、**属性**、**场景**；题目模式另加“题目”。所选页签重启后保留。
- **公式三层**：第一层是情形概览，每个情形一行——名称、时间段、公式数、判定色点、一条关键公式，当前时刻所在的情形自动展开；第二层是展开后的紧凑公式行；第三层是点开后的完整卡片。搜索框常驻，其余筛选、分组与密度收进“筛选”抽屉（按钮上显示生效的条件数），图例收进“?”；能量、动量等整次运行的情形默认折叠；“本次运行的其他情形”一行一个，点击跳到该时段。
- **顶栏**：并排的显示开关全部收进“显示”菜单，菜单顶部是四个预设——运动（速度、加速度与轨迹）、受力（所选物体的受力与数值）、能量（速度与轨迹，并打开能量柱）、简洁（只留物体、名称与网格），下面按组列出各项叠加显示。新增“实验室”页；页面快捷键改为 Alt+1 工作台、Alt+2 实验室、Alt+3 渲染与监视、Alt+4 设置。

### E 电与磁（D78、D79）

- **电荷**：物体可设电荷量 q（“属性 › 电荷”；集中在质心）。静止物体的电荷是固定点电荷。左侧“力与场”页有“带电小球”“固定电荷”和电场、磁场开关。
- **场**（“场景 › 电场与磁场”）：匀强电场 E（大小与方向）、垂直纸面的匀强磁场 B（B > 0 指向纸外 ⊙）、库仑力（真实 k = 8.99×10⁹ N·m²/C² 或教学用 k = 1）。力：电场力 qE、洛伦兹力 qv×B、库仑力 kq₁q₂/r²（两物体包围圆相交时按均匀带电球减小）。电场力与库仑力的电势能计入机械能与能量账本，洛伦兹力不做功。
- **读数与受力**：电荷量、电场力 F电、洛伦兹力 F洛、库仑力 F库、电势能；受力显示与受力分析图中有这三种力。
- **画面**：匀强电场画平行虚线箭头，磁场画 ⊙ / × 点阵，带电物体标正负号；“显示”菜单可打开**电场线**（从正电荷出发）与**等势线**，由 Rust 在当前帧计算。
- **公式**：5 类新情形、21 条公式，全部有三语推导与学习手册的“电与磁”专题——带电粒子在匀强电场中（类平抛的位移、速度、偏移量、偏转角、电场力做功）、在匀强磁场中的圆周运动（r = mv/(qB)、T = 2πm/(qB)、洛伦兹力功率为零）、速度选择器（v = E/B）、电场和磁场同时作用（动能定理）、库仑相互作用（库仑定律、能量守恒、正碰的最近距离）。
- **模板**（新分组“电与磁”）：带电粒子在电场中的偏转、磁场中的圆周运动、速度选择器、两个带电小球、α 粒子散射。
- **场景格式**：用到电荷或场的场景写为格式 6（26.53 打开时提示“来自更新的版本”），其余仍为格式 5；不用新功能的场景结果与 26.53 逐位相同。

### L 实验室（D76、D80–D85）

新页面“实验室”：左侧按领域分组、可折叠、可搜索的实验目录（每项标注初中 / 高中 / 大学），中间是实验画布，右侧是读数与公式——公式代入当前数值，结果与 Rust 计算值并列，原理折叠在下方。器材与参数自动保存，可导出为 `velophi-lab` 文件、导入或重置。物理计算全部是 Rust 核心中的计算操作（12 个，见 `engine/CALC.md`）。

| 领域 | 实验 | 内容 |
| --- | --- | --- |
| 电与磁 | 直流电路 | 在网格上拖出电池（电动势、内阻）、导线、开关、定值电阻、小灯泡（按实际功率发光，超过额定功率 1.2 倍提示可能烧坏）、滑动变阻器（限流 / 分压接法）、电流表、电压表、电容器（稳态 Q = CU）；改进节点分析求解；每个元件的电压、电流、功率，电流动画与电势着色，任意两点的等效电阻，串并联关系说明；理想电源短路、电源电压矛盾、悬空支路与电表接反都给出说明。示例：串联、并联、混联、测电源电动势和内阻、分压接法、电容器、短路 |
| 电与磁 | 电场线与等势线 | 拖动点电荷，加入正负电荷与匀强电场；电场线、等势线，点击任一点测场强与电势；示例：单个电荷、等量异种 / 同种、不等量、平行板、匀强场中的点电荷 |
| 光学 | 透镜与面镜成像 | 凸透镜、凹透镜、凹面镜、凸面镜；拖动物体，三条特殊光线、像距、放大率、正倒与虚实，成像规律（照相机、投影仪、放大镜……） |
| 光学 | 光的反射与折射 | 光线、平行光、点光源与平面镜、球面镜、透镜、玻璃砖、半圆玻璃、三棱镜、屏；反射定律、折射定律、全反射（临界角）、菲涅耳部分反射、三棱镜色散（白光分成红绿蓝）、球差、光导纤维 |
| 原子与原子核 | 氢原子能级与光谱 | 玻尔能级 Eₙ = −13.6 eV/n²，点选两条能级得到光子的能量、频率、波长与谱线系（莱曼 … 汉弗莱），可见光谱上的巴耳末线；用光子或电子碰撞激发 |
| 原子与原子核 | 光电效应 | 6 种阴极金属，光的波长与功率，两极电压；最大初动能、遏止电压、截止频率、饱和电流与 I–U 曲线 |
| 原子与原子核 | 放射性衰变 | N₀ 个原子核逐步随机衰变（同一随机种子可重复），N(t) 与 N₀·2^(−t/T½) 对照，“首次剩一半 / 1/4 / 1/8”的时刻 |
| 热学 | 熔化与沸腾 | 水（冰 → 水 → 水蒸气）、萘、石蜡、酒精在恒定功率下的加热曲线：晶体的熔化与沸腾平台、非晶体没有熔点；Q = cmΔt、Q = mL 分段列出 |
| 热学 | 热平衡 | 两种物质接触，两条温度曲线趋近共同温度 t = (c₁m₁t₁ + c₂m₂t₂)/(c₁m₁ + c₂m₂)，Q放 = Q吸 |
| 相对论 | 狭义相对论 | 光钟与尺（时间延缓、长度收缩）、闵可夫斯基图（点选事件，给出两个参考系中的坐标）、速度合成、质能关系与能量动量关系 |

### M 力学 A 组（D87）

- 新模板：**惯性：抽纸条**、**轮轴**（F·R = G·r，读数“省力倍数 G/F”= R/r）、**电梯中的弹簧秤**（超重与失重）、**宇宙速度**（第一宇宙速度贴地环绕，√2 倍逃逸）、**受迫振动与共振**、**斜面的机械效率**（η = sinθ/(sinθ + μcosθ)）。模板共 46 个。
- 新读数：物体合力的功率 P、系统对原点的角动量 L、拉格朗日量 L = T − V、哈密顿量 H = T + V。
- **相图**：曲线面板的“相图”按钮把曲线切换为任意两个量的 y–x 图（预设 x–vₓ、θ–ω），当前状态用圆点标出，点击曲线跳到该时刻。

### X 修正

- “动量守恒”情形不再出现在有外力的系统中（匀强场、固定电荷、有万有引力的静止物体、锚点不动的有心力、空气阻力、一端固定的焊接 / 滑轨 / 马达）。这修正了 26.51 起已有的问题：“行星绕恒星运动”模板会给出偏差很大的“动量守恒”卡片。
- 理论值恰为 0 的公式（如洛伦兹力的功率）显示绝对误差，不再显示“100 %”；相对误差 ≥ 100 % 时不再写成 `1.0e+2%`。
- 力箭头全部画完后再画数值标签。

## 兼容性

- 不用电荷与场的场景仍写为格式 5，26.53 的场景文件、设置与题目包照常使用；26.53 的全部模板指纹不变。
- 带电或有场的场景为格式 6，26.53 打开时会提示文件来自更新的版本。
- WebAssembly 接口版本仍为 2；26.53 的 `velophi_core.wasm` 没有电磁与实验室计算，不能与 26.54 的界面一起使用。

## 实测结果（容器 Linux，Node 22，rustc 1.92）

| 检查 | 结果 |
| --- | --- |
| 自动测试 | 66 个文件 843 项（容器中经 Node-API 调用原生 Rust）；换用 Windows 构建的 WebAssembly 时 827 项通过、16 项原生引擎协议测试只在 Node-API 下运行；类型检查、网页构建通过；界面文字三语齐全，0 处问题 |
| 无头 Chromium | 网页版（新构建的 WebAssembly）走查工作台、5 个电磁模板与 10 个实验：1389 × 868 与 1280 × 720 下没有横向滚动，没有脚本错误 |
| Rust 测试 | 全部通过，含实验室计算的单元测试与电磁学的解析解检查（回旋半径与周期、电场偏转、速度选择器、库仑散射的能量守恒、无电磁场景指纹不变） |
| 求解器对照 | `scripts/parity.mjs`（缩减参数）：438 个场景、1,536,806 帧、29,400 个事件、2853 个检查点，TypeScript 参照与 Rust 0 处不一致；电磁模板按 D77 跳过（`docs/reports/26.54/parity.txt`） |
| 计算对照 | `scripts/calc-parity.mjs`：504 次运行、66,920 个请求、10,676 个情形、9464 个样本、93,946 张公式卡片，0 处不一致（`docs/reports/26.54/calc-parity.txt`） |

## Windows 检查

Windows x64（Node 22.22.2、Rust 1.92.0、WebView2 143）：`scripts\release.cmd` 全部 11 步通过——Rust 测试；WebAssembly 重新构建（1,932,288 字节）；类型检查；测试在新构建的 WebAssembly 上通过（原生引擎协议测试只在 Node-API 下运行）；计算对照 344 次运行 0 处不一致；`tauri build`；网页构建不含参照代码；WebView2 中 46 个模板的原生 Rust、后台线程 WebAssembly 与界面线程 WebAssembly 指纹全部相同（3.6 s，原生 760 ms）；打包。实机检查了新布局、模板库、磁场中的圆周运动（原生 Rust）、直流电路与光电效应实验。三次构建的经过与检查记录见 `docs/reports/26.54-windows-hand-check.md`（在证据包中）。

## 已知限制

- 匀强电场与磁场充满整个空间；有界场区（质谱仪、回旋加速器）在 26.55。
- 电路实验室是稳态（电容器开路）；暂态、交流、电动机、传感器与保险丝在 26.55。
- 机械效率目前通过模板中的自定义量给出；通用的“有用功”指定在 26.55。
- 光电流用简化模型（量子效率 5 %，收集效率随电压变化），只用于定性说明 I–U 曲线的形状；遏止电压与截止频率为严格值。
- 网页版需要支持 WebAssembly 的浏览器；只在 Chromium 内核浏览器上验证过。

## 文件

| 文件 | 说明 |
| --- | --- |
| `VeloPhi-v26.54-windows-x64-setup.exe` | Windows 安装程序（当前用户安装，需要 WebView2，缺失时自动下载） |
| `VeloPhi-v26.54-windows-x64-portable.exe` | 便携版，直接运行 |
| `VeloPhi-v26.54-web.zip` | 网页版静态文件，部署见包内 `HOSTING.md` |
| `VeloPhi-v26.54-source.zip` | 源码（工作区快照，不含依赖与构建产物） |
| `VeloPhi-v26.54-release-evidence.zip` | 构建日志、测试报告、计算对照、WebView2 自检、检查记录 |
| `THIRD_PARTY_NOTICES.md` | 第三方组件与许可证全文 |
| `SHA256SUMS.txt` | 校验和 |

本版没有任何 Git 提交、暂存、标签或推送，所有改动留在工作区由维护者手动提交。

---

## English summary

VeloPhi 26.54 starts a two-release plan (26.54 and 26.55) that maps the physics curriculum from middle school to university onto the engine: the development manual lists every topic with its current state, the extension it needs, a difficulty group (A: templates and readouts; B: a lab page with a Rust calculation; C: runtime extensions; D: new numerical runtimes; E: handbook only) and the release that delivers it, with topics beyond two releases marked for 26.56 and 26.57. This release adds **electricity and magnetism** to the mechanics runtime — charged bodies, fixed point charges, uniform electric and magnetic fields and Coulomb forces with their potential energy in the energy ledger, field lines and equipotentials, five new situations with 21 derived formulas and five templates; a new **Lab** page with ten experiments computed in the Rust core (DC circuits, electric fields, lenses and mirrors, ray optics with total internal reflection and dispersion, the hydrogen spectrum, the photoelectric effect, radioactive decay, heating curves, thermal equilibrium and special relativity); six mechanics templates (inertia, wheel and axle, apparent weight in a lift, cosmic velocities, resonance, efficiency of an incline), power, angular momentum, Lagrangian and Hamiltonian readouts and **phase plots**. The interface is **layered**: eight common tools plus category pages and a tool search on the left; analysis, properties and scene tabs on the right; formulas first as one line per situation, then compact rows, then full cards, with filters in a drawer; all display switches in one menu with four presets.

## Deutsche Zusammenfassung

VeloPhi 26.54 beginnt einen Plan über zwei Versionen (26.54 und 26.55), der den Physiklehrstoff von der Mittelstufe bis zur Universität auf die Engine abbildet: Das Entwicklerhandbuch listet jedes Thema mit seinem Stand, der nötigen Erweiterung, einer Schwierigkeitsgruppe (A: Vorlagen und Messwerte; B: eine Laborseite mit Rust-Berechnung; C: Erweiterungen der Laufzeit; D: neue numerische Laufzeiten; E: nur Lernhandbuch) und der Version, die es liefert; was in zwei Versionen nicht möglich ist, ist für 26.56 und 26.57 vermerkt. Diese Version ergänzt die Mechanik um **Elektrizität und Magnetismus** — geladene Körper, feste Punktladungen, homogene elektrische und magnetische Felder und Coulombkräfte mit ihrer potenziellen Energie in der Energiebilanz, Feld- und Äquipotenziallinien, fünf neue Situationen mit 21 hergeleiteten Formeln und fünf Vorlagen; eine neue Seite **Labor** mit zehn im Rust-Kern berechneten Experimenten (Gleichstromkreise, elektrische Felder, Linsen und Spiegel, Strahlenoptik mit Totalreflexion und Dispersion, Wasserstoffspektrum, Photoeffekt, radioaktiver Zerfall, Erwärmungskurven, thermisches Gleichgewicht und spezielle Relativitätstheorie); sechs Mechanikvorlagen (Trägheit, Wellrad, scheinbares Gewicht im Aufzug, kosmische Geschwindigkeiten, Resonanz, Wirkungsgrad der schiefen Ebene), Messwerte für Leistung, Drehimpuls, Lagrange- und Hamilton-Funktion sowie **Phasendiagramme**. Die Oberfläche ist **gestuft**: links acht häufige Werkzeuge plus Kategorien und Werkzeugsuche; rechts die Reiter Analyse, Eigenschaften und Szene; Formeln zuerst als eine Zeile je Situation, dann kompakte Zeilen, dann vollständige Karten, Filter in einer Schublade; alle Anzeigeschalter in einem Menü mit vier Voreinstellungen.
