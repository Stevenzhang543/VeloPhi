# VeloΦ（VeloPhi）26.55 发布说明

文档日期：2026-10-27 · 版本 26.55.0

26.55 是 26.54 开始的两版计划的下半部分，按 `DEV_MANUAL_26_55.md`（决策 D89–D97）开发：电路的时域运行与交流电、有界电场 / 磁场区域、导体棒—导轨的电磁感应、液体与浮力、波、气体循环、核物理与一维量子力学，界面加入学习路径、全局搜索、触屏与窄屏布局。维护者对本版的要求是**优化性能，但精度与计算结果决不妥协**（D97）：所有性能改动只改变“何时算、算几次”，求解器与计算层的结果逐位不变，并以全部对照与指纹验证。开发中维护者追加了“再加一些实例模板，挑几十个典型的”，新增 31 个模板，共 77 个。英文、德文摘要见文末。

## 本版内容

### P 性能（D97）

规则：求解器、计算层与 TypeScript 参照的运算顺序一律不动（试验过的“按对称性只算一半 J M⁻¹ Jᵀ”会改变舍入，77 个场景的指纹随之改变，已撤回）；界面只改调度与缓存，缓存以全部输入为键。

| 项 | 改动 | 26.54 → 26.55（同一容器、同一 Chromium，1389 × 868，“动滑轮”模板播放；网页发布构建） |
| --- | --- | --- |
| 主线程忙碌（播放 5 s，3 次取中位数） | 时间线、事件表、画面与公式面板的更新合并为每帧一次；渲染器读取普通对象而不经 Vue 响应式代理；深度监听改为浅监听；时间线的事件标记只画可见窗口、标签缓存 | 3365 ms → 2346 ms（−30 %） |
| 卡顿（播放 6 s 中超过 50 ms 的帧） | 同上 | 5 → 0–1，最长帧 83 ms → 50 ms |
| 首屏脚本 | 实验室、设置页、题目、学习路径、全局搜索、导出、视频与教学对话框按需加载（共 718 KB 移出首屏） | 2362 KB → 2040 KB（gzip 782 → 690 KB），而本版新增了约 400 KB 的内容 |
| 文字翻译 | 模块级文字表每个属性记住最近一次翻译（以原文与语言为键） | 重复读取不再查表 |

精度：两类对照 0 处不一致，WebView2 自检中全部参照模板的指纹与 26.54 相同（见“实测结果”）。

### E 电路运行（D89）

- 直流电路实验增加**运行**：与稳态分析同一个编辑器，点“运行”后按时间推进，运行中可拨动开关、改参数，从当时的状态继续。改进节点分析 + 梯形法伴随模型，步长按误差控制（一步与两个半步之差，相对容差 10⁻¹¹），采样点恰好落在步点上；开关、二极管、保险丝与漏电保护器的跳变处先求一致初值。
- **新元件**：电感线圈、交流电源、二极管（导通压降 + 导通电阻）、电动机 / 发电机（反电动势 kω、转动惯量、负载力矩）、变压器（理想变压器 + 励磁电感与绕组电阻，直流时次级电压衰减为零）、保险丝（I²t 熔断，可冷却）、漏电保护器（剩余电流 30 mA 跳闸）、接地、热敏 / 光敏 / 压敏电阻、灵敏电流计（满偏电流与指针）、示波器探头 CH1 / CH2。
- **示波器**与**能量账本**（电源输出 = 焦耳热 + 储能变化 + 机械功），以及熔断、跳闸、二极管通断等事件。
- **24 个预设**，分五组：直流电路（串联、并联、混联、测电源电动势和内阻、分压接法、电容器、短路）；暂态（RC 充电与放电、RL 断电自感、LC 振荡）；交流电与电机（有效值、RC / RL 中的相位、二极管整流与滤波、变压器、远距离输电、电动机的反电动势、发电机）；家庭电路（保险丝、漏电保护）；电表与传感器（电流计改装成电流表 / 电压表、欧姆表、热敏 / 光敏 / 压敏电阻）。
- 新实验**平行板电容器**：C = εᵣS/(4πkd)，改变间距、面积与介质，接电源与断开电源两种情况。

### M 场区、导轨与磁场（D90、D91）

- **有界场区**（“场景 › 场区、液体与导轨”）：矩形或圆形区域，区内有匀强电场（可为交变 E₀cos(ωt + φ)）和 / 或匀强磁场。带电物体的质心在区内还是区外冻结在求解模式中，进出边界是事件（时间线上的“进入场区 / 离开场区”），由核心的事件定位求得。区域电场做的功单列在账本中。画布上可直接拖动区域、拖手柄改大小。
- **导轨回路**：导体棒、导轨间距 L、回路电阻 R 与磁感应强度 B；ε = BLv、I = ε/R、安培力 BIL 沿导轨阻碍运动，焦耳热单列在账本中。画面画出两条导轨、电阻与磁场标记；读数 ε、I、F、P。
- 新实验**磁场与电磁感应**：直导线、平行电流、环形电流、螺线管、条形与蹄形磁铁的磁感线（磁矢势的等值线），线框的磁通量与感应电动势。

### F 液体与机械效率（D92、D92b）

- **液体区域**：矩形，密度可设，液面为区域上沿。浸入部分按物体的多边形或圆与液面精确裁剪，浮力 ρgA 作用于浸入部分的形心（因此有扶正力矩）；可选按浸入比例的线性 + 平方液体阻力。读数：浮力、浸入面积、排开体积、物体中心处液体的压强（表压 ρgh）。漂浮测试中吃水深度与解析值相差 < 10⁻⁶ m，能量账本闭合 < 10⁻⁶ J。
- **机械效率**的通用读数：有外力或电机（且有重力）的场景中，每个物体的监视读数里有“有用功（提升该物体，自开始）”与“机械效率 η”——有用功是克服重力提升该物体所做的功，总功是外力、电机与传送带自开始做的功（能量账本中的同一项）。

### W、T、Q 实验室（D93–D95）

实验室从 10 个实验增加到 18 个：

| 领域 | 新实验 | 内容 |
| --- | --- | --- |
| 电与磁 | 平行板电容器 | 见上 |
| 电与磁 | 磁场与电磁感应 | 见上 |
| 光学 | 干涉、衍射与偏振 | 单缝、双缝、光栅的强度分布，薄膜的彩色条纹（含半波损失），多片偏振片与马吕斯定律；白光按 CIE 配色函数合成颜色 |
| 波与量子 | 机械波与声 | 一维弦（蛙跳法，Courant 数为 1 时与连续方程的格点解相同）：脉冲、反射（固定 / 自由端）、叠加、驻波、两种介质、拨弦；多普勒效应；声音的音调、响度与拍（可用 WebAudio 播放） |
| 波与量子 | 一维量子力学 | 分步傅里叶法的含时薛定谔方程（总概率守恒 ≤ 10⁻¹⁰），自由、方势垒、方势阱、无限深势阱、谐振子、双势垒；本征态（Sturm 序列二分）、透射与反射概率、⟨x⟩、⟨p⟩ 与不确定度 |
| 热学 | 气体与热机循环 | 等温、等压、等容、绝热过程的 p–V 图与第一定律逐项（W、Q、ΔU），卡诺、奥托与矩形循环的效率 |
| 原子与原子核 | 衰变链与核反应 | 衰变链（贝特曼解）与放射性平衡、比结合能曲线（AME2020 质量表）、核反应方程配平与 Q 值 |
| 原子与原子核 | 康普顿散射 | Δλ = (h/mₑc)(1 − cosθ)、反冲电子与光子的动量 |

实验室目录可在“按主题”和“按学段”（初中 / 高中 / 大学）两种视图之间切换。

### 公式与学习手册

- 新情形组 E，20 条公式，全部有三语推导与手册例题：**导轨回路**（ε、I、安培力、加速度、速度的指数解、收尾速度、焦耳热；7 条）、**液体中的物体**（浮力、阿基米德原理、浸入比例、吃水深度、合力；5 条）、**磁场区中的圆周运动**（半径、周期、区内时间、弦长；5 条）、**电场区中的加速**（加速度、速度、动能增量；3 条）。公式库共 197 条。
- **识别修正**：“抛体运动”与“单摆”在物体发生碰撞时分段——此前一次运行的多次弹跳合成一个抛体情形，第一次弹起后公式全部偏离（新模板“弹跳的小球”暴露了这个 26.48 起就有的问题）。场区、液体与导轨作用的物体不再给出只考虑机械力的公式。
- 手册新主题“电磁感应”“压强与浮力”；新**概念页**“能源与可持续发展”“固体与液体”“物理中的数学工具”“量子场论初步”，每页附“动手试一试”的链接（打开相关的模板、实验或主题）。

### T 模板（维护者追加）

新增 31 个，共 77 个：

- **电与磁**：质谱仪、回旋加速器、有界磁场中的偏转、圆形磁场区域、示波管、电场与磁场的组合、电场中的带电摆球、电场中的带电油滴
- **电磁感应**：导体棒在恒力下运动、导体棒以初速度滑行、导体棒沿竖直导轨下落
- **压强与浮力**：漂浮的木块、铁球在水中下沉、水中释放的木块上浮、称重法测浮力、三种物体的沉浮、船的载重、小球落入水中
- **力学**：物块冲上斜面、斜面上的连接体、追及与相遇、两绳悬挂重物、弹跳的小球、三球依次碰撞、两摆球的碰撞、竖直弹簧振子、复摆、双摆、耦合振子、双星、开普勒第三定律

场区、液体与导轨模板是 Rust 专有场景（23 个，按 D77 用解析解与守恒量验证）；其余新模板 TypeScript 参照与 Rust 逐位相同。

### U 界面

- **学习路径**（顶栏“教学”菜单）：8 个学段（初中；高中必修 1–3；选择性必修 1–3；大学）、32 个单元、160 步，每步是一个模板、实验、题目、手册主题或概念页，点开即打开并记为完成；“继续”打开下一个未完成的步骤。进度只保存在本机。
- **全局搜索**（Ctrl+K / ⌘K，或顶栏的搜索按钮）：页面、工具、模板、实验与电路预设、公式、手册主题与概念页、题目、学习路径单元，分组显示，↑ ↓ 选择、Enter 打开；一次搜索约 0.5 ms。
- **触屏**：单指等同鼠标，空白处单指平移，双指捏合缩放、双指拖动平移，长按打开快捷菜单，双击。
- **键盘与读屏**：画布可用 Tab 聚焦，选择与提示由 `aria-live` 播报，方向键微移。
- **窄屏**：≤ 1100 px 时左侧工具栏变为图标栏、右侧面板变为抽屉；≤ 760 px 时顶栏换行、实验室上下排列。
- 快捷键表加入 Ctrl+K 与触屏手势。

### X 修正

- 无限时长的场景在算到原先的有限时长时再适合一次视图（此前只按第一块记录适合视图，物体运动较远的模板看不全）；手动平移或缩放后不再自动适合。场区与液体计入视图范围。
- 有分支的场景继承场区做功、浮力做功、焦耳热与液体阻力耗散的累计值。
- 磁场区中“区内时间”“弦长”两条公式要求半个圆周在区域内：回旋加速器中半径增大、粒子从 D 形盒另一侧射出后，它们显示为“不适用”而不是偏差。
- 模板“斜面上的连接体”在 m₁ 到达斜面顶端时停止（此前它会被顶角抛过滑轮，与 m₂ 纠缠）。
- 电路实验：竖直元件的名称与数值分两行，变压器的匝数写在两个线圈之间，电表与探头的读数放在空处，不再与相邻元件的标注重叠；示例“家庭电路与漏电保护”中第一盏灯的零线此前没有接上（不发光），“远距离输电”中小灯泡与降压变压器的副线圈画在了一起，均已修正。
- 界面文字新增 821 条，全部有英文与德文；不再使用的 26.54 “计划中”实验说明已删除。

## 兼容性

- 不用场区、液体与导轨回路的场景仍写为格式 5（带电或有匀强场的为格式 6），与 26.54 相同，求解结果逐位相同；26.54 的全部模板指纹不变。26.54 及更早的场景文件、设置与题目包照常使用。
- 用到场区、液体或导轨回路的场景写为**格式 7**：26.54 打开时提示“文件来自更新的版本”（26.54 会读格式 6 而不认识这些字段，若仍写为 6 会被静默忽略）。
- 实验室文件（`velophi-lab`）：只用 26.54 元件的电路仍写为版本 1，两版互通；含电感、交流电源、二极管、电动机等新元件的电路写为版本 2，26.54 导入时提示版本较新而不是出错。
- WebAssembly 接口版本仍为 2；26.54 的 `velophi_core.wasm` 没有本版的计算，不能与 26.55 的界面一起使用。

## 实测结果（容器 Linux，Node 22，rustc 1.92）

| 检查 | 结果 |
| --- | --- |
| 自动测试 | 70 个文件 1084 项（容器中经 Node-API 调用原生 Rust）；在 Windows 构建的 WebAssembly 上 1068 项通过、16 项原生引擎协议测试只在 Node-API 下运行；类型检查、网页构建通过；界面文字三语齐全，占位符一致 |
| Rust 测试 | `cargo test --workspace --release` 全部通过，含电路暂态（RC、RL、LC 的时间常数、周期与能量，交流有效值与整流，电动机，变压器，保险丝与漏电保护）、场区与导轨（质谱仪落点、回旋加速器每次过缝的能量、收尾速度与能量、漂浮的吃水深度）、波（驻波频率与节点、波速、能量）、一维量子（能级、概率守恒、透射率）、气体（第一定律、循环效率）与核物理（Q 值、贝特曼链、康普顿位移）的解析解检查 |
| 求解器对照 | `scripts/parity.mjs`（完整参数）：1499 个场景、2,954,343 帧、82,699 个事件、5845 个检查点，分块重算 3455 + 1013 次、后台增量 3965 次，TypeScript 参照与 Rust 0 处不一致；场区、液体与导轨场景按 D77 跳过（`docs/reports/26.55/parity.txt`） |
| 计算对照 | `scripts/calc-parity.mjs`：556 次运行、77,534 个请求（16,626 个情形、13,816 个样本、129,377 张公式卡片），0 处不一致（`docs/reports/26.55/calc-parity.txt`） |
| 性能 | 见“P 性能”：主线程 −30 %、卡顿帧 5 → 0–1、首屏脚本 2362 → 2040 KB；对照与指纹逐位不变 |
| 无头 Chromium | 网页版走查学习路径、全局搜索（一次约 0.5 ms）、概念页、经搜索打开电路示例、窄屏与手机布局，31 个新模板的公式卡片，24 个电路示例逐个截图；没有脚本错误 |

## Windows 检查

Windows x64（Node 22.22.2、Rust 1.92.0、WebView2 143）：`scripts\release.cmd` 全部 11 步通过——Rust 测试；WebAssembly 重新构建（2,244,985 字节）；类型检查；测试在新构建的 WebAssembly 上 1068 项通过（16 项原生引擎协议测试只在 Node-API 下运行）；计算对照 396 次运行 0 处不一致；`tauri build`；网页构建不含参照代码；WebView2 中 77 个模板的原生 Rust、后台线程 WebAssembly 与界面线程 WebAssembly 指纹全部相同（6.4 s，原生 1340 ms），其中 26.54 的 46 个模板的指纹与 26.54 发布时完全相同；打包。共构建三次：前两次也全部通过，但在制作宣传片与实机检查时发现手册 §5.2 R12–R14 的问题，修正后第三次构建发布。实机检查了质谱仪、回旋加速器、斜面上的连接体、全局搜索、变压器与家庭电路示例和学习路径，见 `docs/reports/26.55-windows-hand-check.md`（在证据包中）。

## 已知限制

- 液体只能是矩形区域；液面穿过物体最低点 / 最高点不是事件（浮力连续，只有导数在此不连续，由自适应步长处理；见手册 R4）。液体中的二维物体按“每米厚度”计算。
- 导轨回路中的导体棒只受沿导轨方向的电磁阻尼力；线圈中磁通变化与运行时的耦合（楞次定律的动态演示）在“磁场与电磁感应”实验中以静态读数给出，运行时耦合顺延到 26.56。
- 气缸中的分子只作示意（速率按 √T 缩放）；分子动理论与速率分布、热传导顺延到 26.56。
- 一维量子实验的本征值有网格误差（无限深势阱与解析值相对 ≤ 10⁻⁴）；二维量子与自旋在 26.57。
- 光电流仍为简化模型（见 26.54）；网页版只在 Chromium 内核浏览器上验证过。

## 文件

| 文件 | 说明 |
| --- | --- |
| `VeloPhi-v26.55-windows-x64-setup.exe` | Windows 安装程序（当前用户安装，需要 WebView2，缺失时自动下载） |
| `VeloPhi-v26.55-windows-x64-portable.exe` | 便携版，直接运行 |
| `VeloPhi-v26.55-web.zip` | 网页版静态文件，部署见包内 `HOSTING.md` |
| `VeloPhi-v26.55-source.zip` | 源码（工作区快照，不含依赖与构建产物） |
| `VeloPhi-v26.55-release-evidence.zip` | 构建日志、测试报告、计算对照、WebView2 自检、检查记录 |
| `THIRD_PARTY_NOTICES.md` | 第三方组件与许可证全文 |
| `SHA256SUMS.txt` | 校验和 |

本版没有任何 Git 提交、暂存、标签或推送，所有改动留在工作区由维护者手动提交。

---

## English summary

VeloPhi 26.55 completes the two-release curriculum plan begun in 26.54. The maintainer asked for better performance with no compromise on accuracy, so every optimisation changes only when and how often things are computed — never what: the solver, the calculation layer and the reference keep their exact floating-point order, and both parity harnesses and the WebView2 fingerprints are unchanged bit for bit. Main-thread time while playing a template drops by 30 % (3.37 s → 2.35 s in 5 s of playback), frames over 50 ms from 5 to at most 1, and the initial script from 2.36 MB to 2.04 MB although the release adds about 0.4 MB of content. New physics: **circuits that run in time** (inductors, AC sources, diodes, motors and generators, transformers, fuses, residual-current devices, sensors, galvanometers and an oscilloscope, with error-controlled trapezoidal integration and 24 presets); **bounded electric and magnetic field regions** whose boundary crossings are located as events; **rail-and-rod induction** with Joule heat in the energy ledger; **liquids** with exact clipping of the submerged area and buoyancy at its centroid; a general **efficiency** readout; eight new lab experiments (parallel-plate capacitor, magnetic fields and induction, wave optics, mechanical waves and sound, 1D quantum mechanics, gas processes and heat-engine cycles, decay chains and nuclear reactions, Compton scattering); 20 new derived formulas and four concept pages. Projectile and pendulum situations now split at impacts. **31 new templates** (77 in total) cover mass spectrometers, cyclotrons, rods on rails, floating and sinking, and classic mechanics such as the double pendulum and binary stars. The interface adds a **learning path** (8 stages, 32 units, 160 steps), **global search** (Ctrl+K), touch gestures, keyboard and screen-reader support and layouts for narrow screens.

## Deutsche Zusammenfassung

VeloPhi 26.55 schließt den mit 26.54 begonnenen Lehrplan über zwei Versionen ab. Der Betreuer wünschte mehr Leistung ohne jeden Abstrich an Genauigkeit; daher ändert jede Optimierung nur, wann und wie oft gerechnet wird — nie, was: Löser, Rechenschicht und Referenz behalten ihre exakte Reihenfolge der Gleitkommaoperationen, und beide Vergleichsläufe sowie die WebView2-Fingerabdrücke bleiben bitgenau gleich. Die Hauptthread-Zeit beim Abspielen einer Vorlage sinkt um 30 % (3,37 s → 2,35 s in 5 s Wiedergabe), Bilder über 50 ms von 5 auf höchstens 1 und das erste Skript von 2,36 MB auf 2,04 MB, obwohl die Version etwa 0,4 MB Inhalt hinzufügt. Neue Physik: **Schaltungen im Zeitbereich** (Spulen, Wechselspannungsquellen, Dioden, Motoren und Generatoren, Transformatoren, Sicherungen, FI-Schutzschalter, Sensoren, Galvanometer und Oszilloskop, mit fehlergesteuerter Trapezregel und 24 Voreinstellungen); **begrenzte elektrische und magnetische Feldbereiche**, deren Grenzübertritte als Ereignisse lokalisiert werden; **Induktion an Leiterschienen** mit Joulescher Wärme in der Energiebilanz; **Flüssigkeiten** mit exaktem Zuschnitt der eingetauchten Fläche und Auftrieb in deren Schwerpunkt; ein allgemeiner Messwert für den **Wirkungsgrad**; acht neue Laborexperimente (Plattenkondensator, Magnetfelder und Induktion, Wellenoptik, mechanische Wellen und Schall, eindimensionale Quantenmechanik, Gasprozesse und Kreisprozesse, Zerfallsreihen und Kernreaktionen, Compton-Streuung); 20 neue hergeleitete Formeln und vier Begriffsseiten. Wurf- und Pendelsituationen werden jetzt bei Stößen geteilt. **31 neue Vorlagen** (insgesamt 77) zeigen Massenspektrometer, Zyklotron, Leiterstäbe auf Schienen, Schwimmen und Sinken sowie klassische Mechanik wie Doppelpendel und Doppelsterne. Die Oberfläche erhält einen **Lernpfad** (8 Stufen, 32 Einheiten, 160 Schritte), eine **globale Suche** (Strg+K), Touch-Gesten, Tastatur- und Screenreader-Unterstützung sowie Layouts für schmale Bildschirme.
