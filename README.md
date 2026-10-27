# VeloΦ（VeloPhi）26.55

面向物理专业学生、物理老师和爱好者的二维物理仿真与教学引擎：力学、电磁学（含有界场区与电磁感应）与液体在同一个运行时中仿真，电路（含暂态与交流）、光学、波、原子与原子核、热学、相对论与一维量子力学在“实验室”中计算。搭场景、设参数、运行，随时暂停读出任意物体的物理量；系统自动识别典型情形，给出带适用条件的公式，代入数值后与仿真结果并排显示误差，并能点开每条公式和每个事件查看推导与解题过程。

画面上的一切都来自数值求解器，公式只做对照，误差公开——这就是“物理上可验证的正确”。

26.52 起项目改名为 **VeloPhi**（艺术字 VeloΦ，Φ 是视觉符号；旧名 Verity 的场景文件与设置自动兼容）。26.53 重写为**前端 Vue、后端 Rust**：所有物理与数值计算都在 Rust 核心中。26.54 按“初中 → 高中 → 大学”的路线图扩展物理（`docs/DEV_MANUAL_26_54.md` 第 2 节总表）：带电物体、匀强电场与磁场、库仑力（电场线与等势线），新的“实验室”页（直流电路、电场线、透镜与面镜、光的反射与折射、氢原子光谱、光电效应、放射性衰变、熔化与沸腾、热平衡、狭义相对论），以及惯性、轮轴、超重失重、宇宙速度、共振、机械效率等模板与相图；界面重新分层：常用工具 + 分类页签 + 搜索，右侧“分析 / 属性 / 场景”三个页签，公式先看情形概览再展开。26.55 完成路线图的第二部分（`docs/DEV_MANUAL_26_55.md`）：电路的时域运行与交流电（电感、二极管、电动机 / 发电机、变压器、保险丝、漏电保护、传感器、示波器），有界电场 / 磁场区域（质谱仪、回旋加速器）、导体棒—导轨的电磁感应、液体与浮力，实验室新增平行板电容器、磁场与电磁感应、干涉衍射与偏振、机械波与声、一维量子力学、气体与热机循环、衰变链与核反应、康普顿散射；模板增至 77 个；学习路径、全局搜索（Ctrl+K）、触屏与窄屏布局；性能优化而计算结果逐位不变。

界面语言：简体中文 · English · Deutsch（设置 › 通用 › 语言，默认跟随系统）。公式按知识难度分级：中国课标（初中 / 高中 / 大学 / 更高）或 IB（MYP / DP SL / DP HL / 大学 / 更高），在“设置 › 知识难度”中选择；“设置 › 学习手册”按主题讲解原理并列出全部公式。

## 快速上手

1. 打开程序（桌面版 `VeloPhi-v26.55-windows-x64-portable.exe`，或安装 `…-setup.exe`；网页版见 `docs/WEB_HOSTING.md`）。
2. 点“模板”，从 77 个经典模型中选一个（如“板块模型”“质谱仪”“漂浮的木块”），按需修改参数，点“创建场景”；或点“题目”，按章节选一道题作答。
3. 按空格播放 / 暂停；← → 逐帧。场景默认**不限时长**：从 t = 0 开始一直算下去，计算始终领先播放位置一段时间，可随时拖回任意已算时刻；需要时在“场景”页改为“到某时刻停止”或“某事件后 x 秒停止”。时间线上的菱形是事件（碰撞、共速、开始滑动……），点一下打开事件详情。
4. 右侧“分析 › 公式”先按情形列出概览（每个情形一行：名称、时间段、公式数、判定色点与一条关键公式；当前时刻所在的情形自动展开），展开后是当前时刻适用、且不超过所选知识水平的公式（更高级的折叠在下方）：紧凑模式每条一行（判定、公式、理论值与仿真值、误差），点开为完整卡片（已知量与代入式按颜色对应、计算步骤、条件）。顶部可搜索（`/`），其余筛选（物体 / 类别 / 判定、只看收藏 ☆、密度与分组）在“筛选”抽屉中，↑↓ 移动、Enter 详情、F 收藏；悬停公式或已知量时画面中标出相关的物体、力与角度，点击画面中的物体或力箭头按它筛选。时间线下方的公式时间轴标出每个情形的时间段与公式判定，点击跳转。点“详情”看推导、按“已知 / 求 / 解 / 答”的逐步求解、适用条件与仿真对照；点“手册”跳到学习手册中的条目。
5. 点选画布上的物体：“分析 › 监视”给出它此刻的全部读数，可加入监视列表和曲线，也可用表达式定义自定义量（如 `ek(物块) + ep(物块)`）；“渲染与监视”页（Alt+3）用大画面、数值卡片、能量条和曲线展示同一结果。曲线可看最近 10 s 或全程（最小/最大包络），拖动选择区间放大；“相图”按钮把曲线切换为任意两个量的 y–x 图（如 x–vₓ、θ–ω）。
6. 用左侧工具自己搭场景（上方 8 个常用工具，下方按“物体 / 连接 / 力与场 / 编辑 / 标注”分页，也可搜索工具）：单击按默认尺寸放置，或拖拽拉出大小；选中后用手柄改尺寸、旋转、拖动多边形顶点。编辑是连续的（不落网格），只在贴近其他物体时吸附并显示参考线，按住 Alt 关闭吸附；数值框可拖动标签连续调节。连接件有轻绳、轻杆、弹簧（可带三次项）、阻尼器、铰链、焊接、滑轨、马达、齿轮 / 皮带和外力；外力可写成表达式 F(t, 状态)，滑轮可装在物体上成为动滑轮；“场景”页可设重力方向、万有引力、匀强电场、匀强磁场与库仑力，物体可设空气阻力与电荷量（“力与场”页有带电小球、固定电荷与电场 / 磁场开关）。修改后自动重算。
7. 暂停在任意时刻，点时间线上的“从此刻分支”：修改物体或参数后从这一刻继续算，原记录保留，可切换并在曲线中叠加对照。
8. “题目”：30 道内置题按教材章节排列（匀变速直线运动 … 转动）。作答时画面停在 t = 0、曲线与公式暂时隐藏；“揭晓答案”后播放并逐题判分，给出仿真答案、公式理论值与解析；“换一组数据”随机换参数，答案由仿真重新得出。老师可“用当前场景出题”，导出 `.velophi-problem.json` 题目包。
9. “教学”菜单：受力分析图（实际作用点或共点力、按坐标轴或接触面分解、合力，导出 PNG/SVG，可加入实验报告）、打点计时器纸带（逐差法加速度与仿真对照，导出 PNG/CSV）、v–t 图面积（在曲线上按住 Shift 拖动，面积与位移读数对照）。
10. 顶栏“显示”菜单：运动 / 受力 / 能量 / 简洁四个预设，以及各项叠加显示（矢量、轨迹与标注、电场与磁场、电场线、等势线、频闪照片等）。“输出”菜单：CSV 与视频、课件包（视频、截图、公式卡、推导页、CSV，可选 PPTX）、实验报告（HTML，可打印为 PDF），导出语言可单独选择。“参数扫描”批量运行一个参数，“预测”标签让学生先写下预测再对照。
11. “实验室”页（Alt+2）：左侧按主题或按学段列出 18 个实验，中间是实验画布，右侧是读数与代入数值的公式（结果与 Rust 计算值并列）；电路实验可“运行”（暂态、交流、电动机），有 24 个预设；实验可导出、导入与重置。
12. 顶栏菜单“学习路径”按课程标准的顺序（初中、高中必修与选择性必修、大学）把模板、实验、题目与手册串成 160 步；Ctrl+K（⌘K）全局搜索工具、模板、实验、公式、手册与题目。触屏上双指缩放与平移、长按打开菜单；窄屏时工具栏变为图标栏、右侧面板变为抽屉。
13. 语言、知识难度、学习手册、单位与小数点、重力默认值、计算引擎、画面效果、吸附等在“设置”页（Alt+4 或 Ctrl+,）。

常用快捷键：空格 播放/暂停 · ←/→ 逐帧（Shift ×10）· Ctrl+Z / Ctrl+Y 撤销/重做 · Ctrl+C / Ctrl+V / Ctrl+D 复制/粘贴/原地复制 · Delete 删除 · Esc 取消 · Ctrl+S 保存 · Ctrl+O 打开 · Ctrl+Enter 重新计算 · Alt+1/2/3/4 切换页面（工作台 / 实验室 / 渲染与监视 / 设置）· Ctrl+K 全局搜索。工具：V 选择 · H 平移 · B 物块 · O 小球 · C 圆柱 · P 多边形 · G 地面 · I 斜面 · W 墙 · M 尺子 · A 量角器 · T 文字 · L 箭头。完整列表见“设置 › 快捷键”。

## 物理模型与计算

- 二维刚体与质点，内部一律国际单位，显示单位可在设置中选择（如 cm、g、km/h）。形状：圆、矩形、凸多边形、凹多边形与复合体（若干部分组成的一个刚体），可用切割工具沿直线切开、用组合工具合成。任意方向的重力、万有引力、有心力 F = k·rⁿ、线性与平方空气阻力、恒力与变力 F(t, 状态)、弹簧（可带阻尼与三次项）、阻尼器、轻绳（可绕定滑轮和动滑轮，物体到达滑轮时停止）、轻杆、铰链、焊接、滑轨（可设上下限位）、马达（可设力矩上限，超过时打滑）、齿轮 / 皮带。
- 电与磁（26.54）：物体可带电荷 q（集中在质心，静止物体为固定点电荷）；匀强电场力 qE、洛伦兹力 qv×B（B 垂直纸面）、库仑力 kq₁q₂/r²（可选真实 k 或教学用 k = 1，近距离按均匀带电球软化）。电势能计入机械能，洛伦兹力不做功；画面可显示匀强场符号、电场线与等势线。带电粒子在电场中的偏转、磁场中的圆周运动、速度选择器、交叉场与库仑相互作用有公式情形与推导。
- 实验室（26.54）：直流电路（改进节点分析）、电场线与等势线、薄透镜与球面镜成像、光线追迹（反射、折射、全反射、色散）、氢原子能级与光谱、光电效应、放射性衰变（确定性随机数）、加热曲线与热平衡、狭义相对论，计算都在 Rust 核心中（`engine/CALC.md` 的实验室操作）。
- 场区、导轨与液体（26.55）：矩形或圆形的有界电场 / 磁场区域（电场可交变），带电物体进出区域由事件定位；导轨回路（ε = BLv、安培力 B²L²v/R 沿导轨、焦耳热计入账本）；矩形液体区域，浸入部分按多边形 / 圆精确裁剪，浮力作用于浸入部分形心，液体阻力按浸入比例。场区、液体与导轨的场景写为格式 7。
- 实验室（26.55）：电路的时域运行（梯形法伴随模型，误差控制步长，相对容差 10⁻¹¹；跳变处求一致初值），平行板电容器，磁感线（磁矢势等值线）与线框磁通量，单缝 / 双缝 / 光栅 / 薄膜 / 偏振，一维弦的蛙跳法与多普勒、拍，分步傅里叶法的一维含时薛定谔方程与本征态，理想气体过程与循环，贝特曼衰变链、AME2020 结合能与核反应 Q 值，康普顿散射。
- 接触：单侧约束 + 库仑摩擦（静/动摩擦因数分开）+ 滚动阻力（C_rr）；凹形与复合体按凸块分解，一对物体可在几处同时接触；碰撞按恢复系数，单点碰撞计入摩擦（Stronge 能量恢复系数），多点同时碰撞按冲量层互补问题计入摩擦（牛顿 / 泊松 / 完全非弹性，保证动能不增加）。
- 求解：每个阶段的接触/绳/变力分支固定，约束力由加速度级方程精确解出；Dormand–Prince 5(4) 自适应积分（也可选两级 Gauss–Legendre 辛方法长时间保能量，或 RK4 / 半隐式欧拉做对比）；状态切换事件定位到约 10⁻¹² s。事件过于密集时改用 Moreau–Jean 时间步进，并明确标注精度降级。
- 计算引擎：前端 Vue，后端 Rust。求解器、观测量、情形识别、公式取值、事件详情、受力分析、纸带、曲线降采样与画面几何都在 Rust 核心中；桌面版在原生 Rust 线程中仿真，网页版在 WebAssembly 后台线程中仿真，界面线程上的 Rust 会话回答全部查询。26.52 的 TypeScript 引擎保留在 `tests/reference/` 作为对照：求解器与全部计算逐位相同（`scripts/parity.mjs`、`scripts/calc-parity.mjs`）；26.54 起的电磁学（26.55 起含场区、导轨回路与液体）与实验室只在 Rust 中实现，对照时跳过这些场景，改用解析解与守恒量验证。
- 不限时长：记录分块保存，每块开头有检查点；超出内存上限（默认 512 MB）时较早的帧被释放，需要时从检查点逐位相同地重算（原生线程或后台线程预取，或在会话中直接重算）。永久静止或近似静止（速度与加速度持续 1 s 低于 10⁻⁶）时自动停止。
- 可复现：确定性数学库（fdlibm 移植），同一场景每次计算逐位一致（SHA-256 指纹，不限时长时为滚动指纹；Node、Chromium、WebView2 中相同）。26.48/26.49 的场景与模板在有限时长下指纹不变（阿特伍德机除外：物块到达滑轮后停止）。
- 守恒检查：能量账本（机械能 + 摩擦生热 + 碰撞损失 − 外力与电机做功）漂移 ≤ 10⁻⁸；长时间运行每 100 s ≤ 10⁻⁹ 量级。

## 开发

```
npm ci
npm run dev          # 浏览器开发服务器 http://localhost:5178
npx vitest run       # 全部自动测试（npm test 相同）
npm run typecheck    # 类型检查
npm run build        # 类型检查 + 网页版 → dist/
scripts\build-engine.cmd   # Rust 引擎 → src\engine\velophi_core.wasm（Windows，需要 Rust 与 wasm32 目标）
node scripts/build-napi.mjs # 没有 wasm32 目标时：Rust 引擎 → Node-API 模块，供测试使用
npx tauri build      # Windows 桌面版（需要 Rust 1.90+ 与 WebView2）
scripts\release.cmd  # 完整发布（Windows）：引擎、测试、Tauri 构建、打包到 releases\v<版本>
```

辅助脚本：`node scripts/parity.mjs`（TypeScript 参照与原生 Rust 的求解器逐位对照）· `node scripts/calc-parity.mjs`（全部计算操作的逐位对照）· `node scripts/check-dist.mjs`（网页构建不含参照代码）· `node scripts/bench-engine.mjs`（TypeScript 与 WebAssembly 速度）· `node scripts/bench.mjs`（求解器计时与指纹）· `node scripts/check-browser-hashes.cjs --worker`（Chromium 中 WASM、TypeScript、主线程与 Node 的指纹）· `node scripts/long-run.mjs`（30 分钟仿真时间的长时运行）· `node scripts/i18n-keys.mjs`（界面文字提取）· `python3 scripts/third_party_notices.py`（第三方声明）。

目录：`engine/`（Rust：`velophi-core` 求解器、会话与全部计算，`velophi-wasm` WebAssembly 接口，`velophi-native` 桌面原生引擎，`velophi-cli`，`velophi-napi` 测试用模块；`ABI.md`、`CALC.md`、`MESSAGES.md`、`PORTING.md`）· `src/engine`（核心的加载、会话、计算接口与仿真宿主）· `src/teaching`（受力分析图、纸带、面积、题目与题库的界面部分）· `src/core`（场景与确定性数学）· `src/formula`（公式库、推导、卡片与面板的展示）· `tests/reference`（26.52 的 TypeScript 引擎，只作对照）· `src/i18n`（三语文字表）· `src/units` · `src/worker`（计算线程）· `src/render`（Canvas 渲染、频闪、曲线细节层次）· `src/export` · `src/analysis` · `src/app` · `src/templates` · `tests` · `src-tauri`。

## 文档

- `docs/RELEASE_NOTES_26_55.md`：本版发布说明（中文完整版，含英文、德文摘要）；`docs/RELEASE_NOTES_26_54.md` 等为旧版
- `docs/DEV_MANUAL_26_55.md`：本版开发手册（决策 D89–D97 与实施记录）；`docs/DEV_MANUAL_26_54.md`：物理路线图对照总表与难度分组（D75–D88）；`docs/DEV_MANUAL_26_53.md`（D65–D74）、`docs/DEV_MANUAL_26_52.md`（D53–D64）、`docs/DEV_MANUAL_26_51.md`（D34–D52）、`docs/DEV_MANUAL_26_50.md`（D26–D33）。26.51 及以前的文档中的“Verity”即本项目旧名
- `docs/dev/STREAMING.md`：不限时长的分块记录、检查点与滚动指纹
- `docs/i18n/GLOSSARY.md`：三语术语表
- `docs/DEV_MANUAL_26_48.md`、`docs/DEV_MANUAL_26_49.md`：原则、架构与决策 D1–D25
- `docs/WEB_HOSTING.md`、`docs/THIRD_PARTY_NOTICES.md`、`docs/reports/`

## 许可

本仓库的许可证由维护者确定；第三方组件的许可见 `docs/THIRD_PARTY_NOTICES.md`。

---

## English summary

VeloPhi is a 2D physics simulation and teaching engine for physics students and teachers. Every number comes from the solver; recognised textbook situations show their formulas with conditions, substituted values and the error against the simulation, and every formula and event opens a derivation and a worked solution. Version 26.55 completes that roadmap: circuits that run in time (inductors, AC, diodes, motors and generators, transformers, fuses, residual-current devices, sensors and an oscilloscope), bounded electric and magnetic field regions, rail-and-rod induction and liquids with buoyancy, eight more lab experiments (capacitor, magnetic fields, wave optics, waves and sound, 1D quantum mechanics, gas cycles, nuclear reactions, Compton scattering), 77 templates, a learning path, global search (Ctrl+K), touch and narrow-screen layouts, and a faster interface whose results are unchanged bit for bit. Version 26.54 follows a roadmap from middle school to university: charged bodies in uniform electric and magnetic fields with Coulomb forces, field lines and equipotentials; a new **Lab** page with DC circuits, electric fields, lenses and mirrors, ray optics, the hydrogen spectrum, the photoelectric effect, radioactive decay, heating curves, thermal equilibrium and special relativity; new templates (inertia, wheel and axle, apparent weight, cosmic velocities, resonance, efficiency) and phase plots; and a layered interface (common tools plus category pages and search; analysis, properties and scene tabs; formulas as a situation overview first). Version 26.53 moves every computation into the Rust core (Vue front end, Rust back end; native Rust threads on the desktop) and makes formulas easier to read: search, filters, compact cards, favourites, a formula timeline and highlighting on the canvas. Version 26.52 renamed the project from Verity to VeloPhi (VeloΦ; old files and settings carry over) and added free-body diagrams, ticker tapes and the area under v–t curves, 30 built-in problems by textbook chapter with answers read from the simulation (and problem files teachers can write), slider end stops, torque-limited motors, rolling resistance, central force fields, a symplectic Gauss–Legendre integrator, concave and compound bodies with cutting and combining, and a regrouped interface with collapsible sections. Formulas are graded by knowledge level (Chinese curriculum or IB), the solver runs without a time limit, in three languages. Start with **Templates** or **Problems**, press Space to play, and click **Details** on a formula card.

## Deutsche Zusammenfassung

VeloPhi ist eine 2D-Simulations- und Lernumgebung für Physik für Physikstudierende und Lehrkräfte. Jede Zahl stammt vom Löser; erkannte Standardsituationen zeigen ihre Formeln mit Gültigkeitsbedingungen, eingesetzten Werten und der Abweichung von der Simulation, und jede Formel und jedes Ereignis lässt sich mit Herleitung und Lösungsweg öffnen. Version 26.55 schließt diesen Lehrplan ab: Schaltungen im Zeitbereich (Spulen, Wechselstrom, Dioden, Motoren und Generatoren, Transformatoren, Sicherungen, FI-Schutzschalter, Sensoren und Oszilloskop), begrenzte elektrische und magnetische Feldbereiche, Induktion an Leiterschienen und Flüssigkeiten mit Auftrieb, acht weitere Laborexperimente (Kondensator, Magnetfelder, Wellenoptik, Wellen und Schall, 1D-Quantenmechanik, Kreisprozesse, Kernreaktionen, Compton-Streuung), 77 Vorlagen, ein Lernpfad, globale Suche (Strg+K), Touch- und Schmalbild-Layouts und eine schnellere Oberfläche mit bitgenau unveränderten Ergebnissen. Version 26.54 folgt einem Lehrplan von der Mittelstufe bis zur Universität: geladene Körper in homogenen elektrischen und magnetischen Feldern mit Coulombkräften, Feld- und Äquipotenziallinien; eine neue Seite **Labor** mit Gleichstromkreisen, elektrischen Feldern, Linsen und Spiegeln, Strahlenoptik, Wasserstoffspektrum, Photoeffekt, radioaktivem Zerfall, Erwärmungskurven, thermischem Gleichgewicht und spezieller Relativitätstheorie; neue Vorlagen (Trägheit, Wellrad, scheinbares Gewicht, kosmische Geschwindigkeiten, Resonanz, Wirkungsgrad) und Phasendiagramme; sowie eine gestufte Oberfläche (häufige Werkzeuge plus Kategorien und Suche; Reiter Analyse, Eigenschaften und Szene; Formeln zuerst als Situationsübersicht). Version 26.53 verlagert jede Berechnung in den Rust-Kern (Vue-Oberfläche, Rust-Kern; native Rust-Threads auf dem Desktop) und macht Formeln leichter lesbar: Suche, Filter, kompakte Karten, Favoriten, eine Formel-Zeitleiste und Hervorhebung in der Ansicht. Version 26.52 benannte das Projekt von Verity in VeloPhi um (VeloΦ; alte Dateien und Einstellungen werden übernommen) und brachte Kräftepläne, Papierstreifen des Zeitmarkengebers und die Fläche unter v–t-Kurven, 30 eingebaute Aufgaben nach Lehrbuchkapiteln mit Antworten aus der Simulation (und Aufgabendateien für Lehrkräfte), Anschläge an Schienen, Motoren mit Höchstmoment, Rollwiderstand, Zentralkraftfelder, ein symplektisches Gauß–Legendre-Verfahren, konkave und zusammengesetzte Körper mit Schneiden und Verbinden sowie eine neu gegliederte Oberfläche mit einklappbaren Bereichen. Formeln sind nach Kenntnisstand gestuft (chinesischer Lehrplan oder IB); der Löser rechnet ohne Zeitbegrenzung, in drei Sprachen. Mit **Vorlagen** oder **Aufgaben** beginnen, mit der Leertaste abspielen und auf einer Formelkarte **Details** anklicken.
