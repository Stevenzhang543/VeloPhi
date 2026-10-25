# Verity 26.50（暂名）

面向物理专业学生、物理老师和爱好者的二维力学仿真与教学引擎。搭场景、设参数、运行，随时暂停读出任意物体的物理量；系统自动识别典型情形，给出带适用条件的公式，代入数值后与仿真结果并排显示误差，并能点开每条公式和每个事件查看推导与解题过程。

画面上的一切都来自数值求解器，公式只做对照，误差公开——这就是“物理上可验证的正确”。

界面语言：简体中文 · English · Deutsch（设置 › 通用 › 语言，默认跟随系统）。

## 快速上手

1. 打开程序（桌面版 `Verity-v26.50-windows-x64-portable.exe`，或安装 `…-setup.exe`；网页版见 `docs/WEB_HOSTING.md`）。
2. 点“模板”，从 21 个经典模型中选一个（如“板块模型”），按需修改参数，点“创建场景”。
3. 按空格播放 / 暂停；← → 逐帧。场景默认**不限时长**：从 t = 0 开始一直算下去，计算始终领先播放位置一段时间，可随时拖回任意已算时刻；需要时在“场景”页改为“到某时刻停止”或“某事件后 x 秒停止”。时间线上的菱形是事件（碰撞、共速、开始滑动……），点一下打开事件详情。
4. 右侧“公式对照”列出当前时刻适用的公式：符号式、代入式、理论值、仿真值、误差与判定。点“详情”看推导（从受力分析或守恒定律出发）、逐步代入求解、适用条件与仿真对照。
5. 点选画布上的物体：“监视”标签给出它此刻的全部读数，可加入监视列表和曲线；“渲染与监视”页（Alt+2）用大画面、数值卡片、能量条和曲线展示同一结果。曲线可看最近 10 s 或全程（最小/最大包络），拖动选择区间放大。
6. 用左侧工具自己搭场景：单击按默认尺寸放置，或拖拽拉出大小；选中后用手柄改尺寸、旋转、拖动多边形顶点。连接件有轻绳、轻杆、弹簧、铰链和外力；外力可写成表达式 F(t, 状态)，滑轮可装在物体上成为动滑轮。修改后自动重算。
7. “显示”菜单可打开频闪照片（按固定时间间隔叠加物体此前的位置）。“输出”菜单：CSV 与视频、课件包（视频、截图、公式卡、推导页、CSV，可选 PPTX）、实验报告（HTML，可打印为 PDF）。“参数扫描”批量运行一个参数，“预测”标签让学生先写下预测再对照。
8. 语言、单位、重力默认值、计算引擎、画面效果、吸附等在“设置”页（Alt+3 或 Ctrl+,）。

常用快捷键：空格 播放/暂停 · ←/→ 逐帧（Shift ×10）· Ctrl+Z / Ctrl+Y 撤销/重做 · Ctrl+C / Ctrl+V / Ctrl+D 复制/粘贴/原地复制 · Delete 删除 · Esc 取消 · Ctrl+S 保存 · Ctrl+O 打开 · Ctrl+Enter 重新计算 · Alt+1/2/3 切换页面。工具：V 选择 · H 平移 · B 物块 · O 小球 · C 圆柱 · P 多边形 · G 地面 · I 斜面 · W 墙 · M 尺子 · A 量角器 · T 文字 · L 箭头。完整列表见“设置 › 快捷键”。

## 物理模型与计算

- 二维刚体与质点，内部一律国际单位，显示单位可在设置中选择（如 cm、g、km/h）。重力、恒力与变力 F(t, 状态)、弹簧（可带阻尼）、轻绳（可绕定滑轮和动滑轮）、轻杆、铰链。
- 接触：单侧约束 + 库仑摩擦（静/动摩擦因数分开）；碰撞按恢复系数，单点碰撞计入摩擦（Stronge 能量恢复系数），多点同时碰撞为光滑冲量。
- 求解：每个阶段的接触/绳/变力分支固定，约束力由加速度级方程精确解出；Dormand–Prince 5(4) 自适应积分（也可选 RK4 / 半隐式欧拉做对比）；状态切换事件定位到约 10⁻¹² s。事件过于密集时改用 Moreau–Jean 时间步进，并明确标注精度降级。
- 计算引擎：求解器用 Rust 编写，编译为 WebAssembly 在后台线程运行，速度约为 TypeScript 引擎的 3–4 倍；TypeScript 引擎保留为对照与后备。两个引擎的每一帧、每个事件、每条提示逐位相同（500 个随机场景 + 全部模板对照）。
- 不限时长：记录分块保存，每块开头有检查点；超出内存上限（默认 512 MB）时较早的帧被释放，再查看时从检查点逐位相同地重算。
- 可复现：确定性数学库（fdlibm 移植），同一场景每次计算逐位一致（SHA-256 指纹，不限时长时为滚动指纹；Node、Chromium、WebView2 中相同）。26.48/26.49 的场景与模板在有限时长下指纹不变。
- 守恒检查：能量账本（机械能 + 摩擦生热 + 碰撞损失 − 外力与电机做功）漂移 ≤ 10⁻⁸；长时间运行每 100 s ≤ 10⁻⁹ 量级。

## 开发

```
npm ci
npm run dev          # 浏览器开发服务器 http://localhost:5178
npx vitest run       # 全部自动测试（npm test 相同）
npm run typecheck    # 类型检查
npm run build        # 类型检查 + 网页版 → dist/
scripts\build-engine.cmd   # Rust 引擎 → src\engine\verity_core.wasm（Windows，需要 Rust 与 wasm32 目标）
npx tauri build      # Windows 桌面版（需要 Rust 1.90+ 与 WebView2）
scripts\release.cmd  # 完整发布（Windows）：引擎、测试、Tauri 构建、打包到 releases\v<版本>
```

辅助脚本：`node scripts/parity.mjs`（TypeScript 与原生 Rust 逐位对照）· `node scripts/bench-engine.mjs`（TypeScript 与 WebAssembly 速度）· `node scripts/bench.mjs`（求解器计时与指纹）· `node scripts/check-browser-hashes.cjs --worker`（Chromium 中 WASM、TypeScript、主线程与 Node 的指纹）· `node scripts/long-run.mjs`（30 分钟仿真时间的长时运行）· `node scripts/i18n-keys.mjs`（界面文字提取）· `python3 scripts/third_party_notices.py`（第三方声明）。

目录：`engine/`（Rust 引擎：`verity-core`、`verity-wasm`、`verity-cli`；`ABI.md`、`MESSAGES.md`、`PORTING.md`）· `src/core`（数学、场景、求解器、流式记录、观测量）· `src/engine`（WASM 加载器与构建产物）· `src/formula`（识别器、公式库、推导、详情）· `src/i18n`（三语文字表）· `src/units` · `src/worker`（计算线程）· `src/render`（Canvas 渲染、频闪、曲线细节层次）· `src/export` · `src/analysis` · `src/app` · `src/templates` · `tests` · `src-tauri`。

## 文档

- `docs/RELEASE_NOTES_26_50.md`：本版发布说明（中文完整版，含英文、德文摘要）
- `docs/DEV_MANUAL_26_50.md`、`docs/DEV_MANUAL_26_51.md`：本版与下一版的开发手册（决策 D26–D43）
- `docs/dev/STREAMING.md`：不限时长的分块记录、检查点与滚动指纹
- `docs/i18n/GLOSSARY.md`：三语术语表
- `docs/DEV_MANUAL_26_48.md`、`docs/DEV_MANUAL_26_49.md`：原则、架构与决策 D1–D25
- `docs/WEB_HOSTING.md`、`docs/THIRD_PARTY_NOTICES.md`、`docs/reports/`

## 许可

本仓库的许可证由维护者确定；第三方组件的许可见 `docs/THIRD_PARTY_NOTICES.md`。

---

## English summary

Verity is a 2D mechanics simulation and teaching engine for physics students and teachers. Every number comes from the solver; recognised textbook situations show their formulas with conditions, substituted values and the error against the simulation, and every formula and event opens a derivation and a worked solution. Version 26.50 runs simulations without a time limit (streamed in chunks with bit-identical recomputation from checkpoints), speaks Chinese, English and German, and computes with a Rust core compiled to WebAssembly that is bit-identical to the TypeScript engine and about 3–4 times as fast. Start with **Templates**, press Space to play, and click **Details** on a formula card.

## Deutsche Zusammenfassung

Verity ist eine 2D-Simulations- und Lernumgebung für Mechanik für Physikstudierende und Lehrkräfte. Jede Zahl stammt vom Löser; erkannte Standardsituationen zeigen ihre Formeln mit Gültigkeitsbedingungen, eingesetzten Werten und der Abweichung von der Simulation, und jede Formel und jedes Ereignis lässt sich mit Herleitung und Lösungsweg öffnen. Version 26.50 rechnet ohne Zeitbegrenzung (blockweise Aufzeichnung mit bitgleicher Neuberechnung aus Prüfpunkten), ist auf Chinesisch, Englisch und Deutsch verfügbar und rechnet mit einem nach WebAssembly übersetzten Rust-Kern, der bitgleich zum TypeScript-Kern und etwa 3- bis 4-mal so schnell ist. Mit **Vorlagen** beginnen, mit der Leertaste abspielen und auf einer Formelkarte **Details** anklicken.
