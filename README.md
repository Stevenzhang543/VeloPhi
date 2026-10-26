# VeloΦ（VeloPhi）26.52

面向物理专业学生、物理老师和爱好者的二维力学仿真与教学引擎。搭场景、设参数、运行，随时暂停读出任意物体的物理量；系统自动识别典型情形，给出带适用条件的公式，代入数值后与仿真结果并排显示误差，并能点开每条公式和每个事件查看推导与解题过程。

画面上的一切都来自数值求解器，公式只做对照，误差公开——这就是“物理上可验证的正确”。

26.52 起项目改名为 **VeloPhi**（艺术字 VeloΦ，Φ 是视觉符号；旧名 Verity 的场景文件与设置自动兼容）。本版新增：受力分析图、打点计时器纸带、v–t 图面积等教学表示；按教材章节的 30 道内置题目与题目包；滑轨限位、马达力矩上限、滚动阻力、有心力、Gauss–Legendre 辛积分；凹多边形、复合体与切割；按任务分组、可折叠并记住状态的界面。

界面语言：简体中文 · English · Deutsch（设置 › 通用 › 语言，默认跟随系统）。公式按知识难度分级：中国课标（初中 / 高中 / 大学 / 更高）或 IB（MYP / DP SL / DP HL / 大学 / 更高），在“设置 › 知识难度”中选择；“设置 › 学习手册”按主题讲解原理并列出全部公式。

## 快速上手

1. 打开程序（桌面版 `VeloPhi-v26.52-windows-x64-portable.exe`，或安装 `…-setup.exe`；网页版见 `docs/WEB_HOSTING.md`）。
2. 点“模板”，从 35 个经典模型中选一个（如“板块模型”），按需修改参数，点“创建场景”；或点“题目”，按章节选一道题作答。
3. 按空格播放 / 暂停；← → 逐帧。场景默认**不限时长**：从 t = 0 开始一直算下去，计算始终领先播放位置一段时间，可随时拖回任意已算时刻；需要时在“场景”页改为“到某时刻停止”或“某事件后 x 秒停止”。时间线上的菱形是事件（碰撞、共速、开始滑动……），点一下打开事件详情。
4. 右侧“公式对照”列出当前时刻适用、且不超过所选知识水平的公式（更高级的折叠在下方）：已知量与代入式按颜色对应、理论值、仿真值、误差与判定。点“详情”看推导、按“已知 / 求 / 解 / 答”的逐步求解、适用条件与仿真对照；点“手册”跳到学习手册中的条目。
5. 点选画布上的物体：“监视”标签给出它此刻的全部读数，可加入监视列表和曲线，也可用表达式定义自定义量（如 `ek(物块) + ep(物块)`）；“渲染与监视”页（Alt+2）用大画面、数值卡片、能量条和曲线展示同一结果。曲线可看最近 10 s 或全程（最小/最大包络），拖动选择区间放大。
6. 用左侧工具自己搭场景：单击按默认尺寸放置，或拖拽拉出大小；选中后用手柄改尺寸、旋转、拖动多边形顶点。编辑是连续的（不落网格），只在贴近其他物体时吸附并显示参考线，按住 Alt 关闭吸附；数值框可拖动标签连续调节。连接件有轻绳、轻杆、弹簧（可带三次项）、阻尼器、铰链、焊接、滑轨、马达、齿轮 / 皮带和外力；外力可写成表达式 F(t, 状态)，滑轮可装在物体上成为动滑轮；“场景”页可设重力方向、万有引力，物体可设空气阻力。修改后自动重算。
7. 暂停在任意时刻，点时间线上的“从此刻分支”：修改物体或参数后从这一刻继续算，原记录保留，可切换并在曲线中叠加对照。
8. “题目”：30 道内置题按教材章节排列（匀变速直线运动 … 转动）。作答时画面停在 t = 0、曲线与公式暂时隐藏；“揭晓答案”后播放并逐题判分，给出仿真答案、公式理论值与解析；“换一组数据”随机换参数，答案由仿真重新得出。老师可“用当前场景出题”，导出 `.velophi-problem.json` 题目包。
9. “教学”菜单：受力分析图（实际作用点或共点力、按坐标轴或接触面分解、合力，导出 PNG/SVG，可加入实验报告）、打点计时器纸带（逐差法加速度与仿真对照，导出 PNG/CSV）、v–t 图面积（在曲线上按住 Shift 拖动，面积与位移读数对照）。
10. “显示”菜单可打开频闪照片（按固定时间间隔叠加物体此前的位置）。“输出”菜单：CSV 与视频、课件包（视频、截图、公式卡、推导页、CSV，可选 PPTX）、实验报告（HTML，可打印为 PDF），导出语言可单独选择。“参数扫描”批量运行一个参数，“预测”标签让学生先写下预测再对照。
11. 语言、知识难度、学习手册、单位与小数点、重力默认值、计算引擎、画面效果、吸附等在“设置”页（Alt+3 或 Ctrl+,）。

常用快捷键：空格 播放/暂停 · ←/→ 逐帧（Shift ×10）· Ctrl+Z / Ctrl+Y 撤销/重做 · Ctrl+C / Ctrl+V / Ctrl+D 复制/粘贴/原地复制 · Delete 删除 · Esc 取消 · Ctrl+S 保存 · Ctrl+O 打开 · Ctrl+Enter 重新计算 · Alt+1/2/3 切换页面。工具：V 选择 · H 平移 · B 物块 · O 小球 · C 圆柱 · P 多边形 · G 地面 · I 斜面 · W 墙 · M 尺子 · A 量角器 · T 文字 · L 箭头。完整列表见“设置 › 快捷键”。

## 物理模型与计算

- 二维刚体与质点，内部一律国际单位，显示单位可在设置中选择（如 cm、g、km/h）。形状：圆、矩形、凸多边形、凹多边形与复合体（若干部分组成的一个刚体），可用切割工具沿直线切开、用组合工具合成。任意方向的重力、万有引力、有心力 F = k·rⁿ、线性与平方空气阻力、恒力与变力 F(t, 状态)、弹簧（可带阻尼与三次项）、阻尼器、轻绳（可绕定滑轮和动滑轮，物体到达滑轮时停止）、轻杆、铰链、焊接、滑轨（可设上下限位）、马达（可设力矩上限，超过时打滑）、齿轮 / 皮带。
- 接触：单侧约束 + 库仑摩擦（静/动摩擦因数分开）+ 滚动阻力（C_rr）；凹形与复合体按凸块分解，一对物体可在几处同时接触；碰撞按恢复系数，单点碰撞计入摩擦（Stronge 能量恢复系数），多点同时碰撞按冲量层互补问题计入摩擦（牛顿 / 泊松 / 完全非弹性，保证动能不增加）。
- 求解：每个阶段的接触/绳/变力分支固定，约束力由加速度级方程精确解出；Dormand–Prince 5(4) 自适应积分（也可选两级 Gauss–Legendre 辛方法长时间保能量，或 RK4 / 半隐式欧拉做对比）；状态切换事件定位到约 10⁻¹² s。事件过于密集时改用 Moreau–Jean 时间步进，并明确标注精度降级。
- 计算引擎：求解器用 Rust 编写，编译为 WebAssembly 在后台线程运行，速度约为 TypeScript 引擎的 3–4 倍；TypeScript 引擎保留为对照与后备。两个引擎的每一帧、每个事件、每条提示逐位相同（800 多个场景对照，含随机场景、多点碰撞与分支）。
- 不限时长：记录分块保存，每块开头有检查点；超出内存上限（默认 512 MB）时较早的帧被释放，在后台线程中从检查点逐位相同地重算。永久静止或近似静止（速度与加速度持续 1 s 低于 10⁻⁶）时自动停止。
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
npx tauri build      # Windows 桌面版（需要 Rust 1.90+ 与 WebView2）
scripts\release.cmd  # 完整发布（Windows）：引擎、测试、Tauri 构建、打包到 releases\v<版本>
```

辅助脚本：`node scripts/parity.mjs`（TypeScript 与原生 Rust 逐位对照）· `node scripts/bench-engine.mjs`（TypeScript 与 WebAssembly 速度）· `node scripts/bench.mjs`（求解器计时与指纹）· `node scripts/check-browser-hashes.cjs --worker`（Chromium 中 WASM、TypeScript、主线程与 Node 的指纹）· `node scripts/long-run.mjs`（30 分钟仿真时间的长时运行）· `node scripts/i18n-keys.mjs`（界面文字提取）· `python3 scripts/third_party_notices.py`（第三方声明）。

目录：`src/teaching`（受力分析图、纸带、面积、题目与题库）· `engine/`（Rust 引擎：`velophi-core`、`velophi-wasm`、`velophi-cli`；`ABI.md`、`MESSAGES.md`、`PORTING.md`）· `src/core`（数学、场景、求解器、流式记录、观测量）· `src/engine`（WASM 加载器与构建产物）· `src/formula`（识别器、公式库、推导、详情）· `src/i18n`（三语文字表）· `src/units` · `src/worker`（计算线程）· `src/render`（Canvas 渲染、频闪、曲线细节层次）· `src/export` · `src/analysis` · `src/app` · `src/templates` · `tests` · `src-tauri`。

## 文档

- `docs/RELEASE_NOTES_26_52.md`：本版发布说明（中文完整版，含英文、德文摘要）；`docs/RELEASE_NOTES_26_51.md` 等为旧版
- `docs/DEV_MANUAL_26_52.md`：本版开发手册（决策 D53–D64 与 D35、D40 修订）；`docs/DEV_MANUAL_26_51.md`（D34–D52）、`docs/DEV_MANUAL_26_50.md`（D26–D33）。26.51 及以前的文档中的“Verity”即本项目旧名
- `docs/dev/STREAMING.md`：不限时长的分块记录、检查点与滚动指纹
- `docs/i18n/GLOSSARY.md`：三语术语表
- `docs/DEV_MANUAL_26_48.md`、`docs/DEV_MANUAL_26_49.md`：原则、架构与决策 D1–D25
- `docs/WEB_HOSTING.md`、`docs/THIRD_PARTY_NOTICES.md`、`docs/reports/`

## 许可

本仓库的许可证由维护者确定；第三方组件的许可见 `docs/THIRD_PARTY_NOTICES.md`。

---

## English summary

VeloPhi is a 2D mechanics simulation and teaching engine for physics students and teachers. Every number comes from the solver; recognised textbook situations show their formulas with conditions, substituted values and the error against the simulation, and every formula and event opens a derivation and a worked solution. Version 26.52 renames the project from Verity to VeloPhi (VeloΦ; old files and settings carry over) and adds free-body diagrams, ticker tapes and the area under v–t curves, 30 built-in problems by textbook chapter with answers read from the simulation (and problem files teachers can write), slider end stops, torque-limited motors, rolling resistance, central force fields, a symplectic Gauss–Legendre integrator, concave and compound bodies with cutting and combining, and a regrouped interface with collapsible sections. Formulas are graded by knowledge level (Chinese curriculum or IB), the solver runs without a time limit in three languages on a Rust/WebAssembly core that is bit-identical to the TypeScript engine. Start with **Templates** or **Problems**, press Space to play, and click **Details** on a formula card.

## Deutsche Zusammenfassung

VeloPhi ist eine 2D-Simulations- und Lernumgebung für Mechanik für Physikstudierende und Lehrkräfte. Jede Zahl stammt vom Löser; erkannte Standardsituationen zeigen ihre Formeln mit Gültigkeitsbedingungen, eingesetzten Werten und der Abweichung von der Simulation, und jede Formel und jedes Ereignis lässt sich mit Herleitung und Lösungsweg öffnen. Version 26.52 benennt das Projekt von Verity in VeloPhi um (VeloΦ; alte Dateien und Einstellungen werden übernommen) und bringt Kräftepläne, Papierstreifen des Zeitmarkengebers und die Fläche unter v–t-Kurven, 30 eingebaute Aufgaben nach Lehrbuchkapiteln mit Antworten aus der Simulation (und Aufgabendateien für Lehrkräfte), Anschläge an Schienen, Motoren mit Höchstmoment, Rollwiderstand, Zentralkraftfelder, ein symplektisches Gauß–Legendre-Verfahren, konkave und zusammengesetzte Körper mit Schneiden und Verbinden sowie eine neu gegliederte Oberfläche mit einklappbaren Bereichen. Formeln sind nach Kenntnisstand gestuft (chinesischer Lehrplan oder IB); der Löser rechnet ohne Zeitbegrenzung in drei Sprachen mit einem Rust/WebAssembly-Kern, der bitgleich zum TypeScript-Kern ist. Mit **Vorlagen** oder **Aufgaben** beginnen, mit der Leertaste abspielen und auf einer Formelkarte **Details** anklicken.
