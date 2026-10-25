# Verity 26.50 发布说明

文档日期：2026-10-25 · 版本 26.50.0

Verity（暂名）是面向物理专业学生、物理老师和爱好者的二维力学仿真与教学引擎。26.50 按 `DEV_MANUAL_26_50.md` 完成四件“地基”工作：仿真不再有时长上限，从 t = 0 一直算下去；界面与教学内容提供简体中文、English、Deutsch；每条公式和每个事件都能点开看推导与解题过程；求解器用 Rust 重写，编译为 WebAssembly 运行，与 TypeScript 求解器逐位一致、快约 3.6 倍。另有长时间曲线、频闪照片和求解器信息。英文、德文摘要见文末。

## 本版内容

### 不限时长（D26）

- 新建场景和全部模板默认“不限时长”：运行后从 t = 0 持续计算，计算始终领先播放位置一段时间（默认 20 s 仿真时间，或播放速度 × 3 s，取较大者；“设置 › 仿真”可改），领先够了就暂停，播放头前进时继续。时间线随计算延伸，可随时拖回任意已算时刻；“场景”页可改为“到某时刻停止”或“某类事件后 x 秒停止”（共速、开始滑动、分离、接触、碰撞、绳松弛、绳绷紧）。
- 记录按 1 s 分块，每块开头保存检查点（重新开始积分所需的全部状态）。帧占用的内存超过上限（默认 512 MB，可改）时，最久未看的块被释放；再次查看时从检查点重算，重算与第一次计算走同一段代码，结果逐位相同（每次重算都与原块的摘要核对）。重算 1 s 仿真时间约 10 ms。
- 指纹：有限时长的场景仍用 26.49 的指纹算法；不限时长时为滚动指纹（每块一个 SHA-256，链式相连），“场景”页显示“截至 t 的指纹”。
- 永久静止时自动停止：所有物体的导数严格为零（静止且没有外力做功、主动件）时，之后状态恒定，运行结束。判据是严格相等，所以渐近静止（例如阻尼振动）不会自动停止，由前瞻窗口限制计算量。
- 参数扫描、预测、测试和导出中需要有限长度的地方使用 `legacyDuration`（模板为 26.49 的时长；旧文件为原时长）。

### 三种语言（D27）

- 设置 › 通用 › 语言：跟随系统（默认）、简体中文、English、Deutsch。切换后界面立即刷新，不重算、不改变场景；当前时刻的情形重新识别以更新公式卡片的文字。
- 范围：全部界面、对话框、菜单与提示；109 条公式的名称、适用条件与说明；23 类情形；事件与物理量；21 个模板的名称、说明与参数；求解器的错误与警告；导出内容（CSV 表头、实验报告、课件包、PPTX、视频叠加文字、推导页）。导出使用当前界面语言。
- 实现：界面文字以中文原文为键，英文、德文各一张表（1790 条），测试保证每条中文都有两种译文、占位符一致、译文不含中文、没有多余条目。物理核心（TypeScript 与 Rust）不写任何自然语言，错误和警告是“消息键 + 参数”，由界面按当前语言显示。物理符号与 LaTeX 不翻译。术语表 `docs/i18n/GLOSSARY.md`（德文参照德国高中物理教材用语，如 Haftreibungszahl / Gleitreibungszahl、Federkonstante、Stoßzahl）。
- 德文长词：已在 1100–1440 px 宽度逐页截图检查，标签、按钮和时间线在窄窗口中不溢出（必要时隐藏次要按钮或换短标签）。

### 公式与事件详情（D28）

- 公式对照卡片、监视页公式、事件列表、时间线上的事件菱形、画布上的事件标签都可以打开“详情”面板（停靠在右侧，可拖动宽度；或全屏阅读模式，带目录）。
- 公式详情：**推导**（从受力分析或守恒定律出发，每步有说明和依据，同一情形的公式共享前几步），**代入求解**（由公式表达式自动生成：已知量带显示单位，从内到外逐步代入计算，最终数值与卡片“理论值”逐位相同），**适用条件**逐条核对（成立 / 近似 / 不成立及原因），**与仿真对照**。可“用播放头所在时刻重新代入”、复制 LaTeX、导出为 PNG。109 条公式都有推导与代入求解。
- 事件详情：触发函数 g(t) 的定义（如共速 g = v₁ − v₂、离开 g = N），定位方法与精度，事件前后状态对比；碰撞事件给出恢复系数方程与逐步代入的冲量计算，摩擦碰撞给出 Stronge 路径的分段（压缩、恢复、黏着 / 滑动）。可跳到事件时刻或事件后。
- 课件包与实验报告可选附带推导页（每条公式一页图片；PPTX 中为单独的幻灯片）。

### Rust 计算核心（D29–D31）

- 新增 `engine/` Rust 工作区：`verity-core`（求解器全部模块：确定性数学库、模型、运动学、动力学、模式、事件、碰撞与 Stronge 摩擦碰撞、Dormand–Prince / RK4 / 欧拉、投影、Moreau–Jean、变力表达式、流式记录与检查点、SHA-256；`#![forbid(unsafe_code)]`，依赖只有 serde、serde_json）、`verity-wasm`（不用 wasm-bindgen 的 C ABI，见 `engine/ABI.md`）、`verity-cli`（原生对照工具）。
- 界面在计算线程中加载 `src/engine/verity_core.wasm`（647,649 字节，SHA-256 `471db4a1…0c19`，发布构建时在 Windows 上重新生成并记录哈希），数据以与 TypeScript 引擎相同的二进制增量格式传回。“设置 › 仿真 › 计算引擎”可选“自动（Rust / WebAssembly）”或“TypeScript”；WASM 无法加载时自动退回 TypeScript，并在“场景”页注明原因。
- 逐位一致的规则（D30）：超越函数一律用移植的 fdlibm、复刻 JS 的 min/max/round 语义、不用迭代顺序不确定的容器、求和与循环顺序逐行对照、不开启 FMA 与 relaxed SIMD。`node scripts/parity.mjs` 比较每一帧、每个事件、每条提示（键与参数）、每个检查点和指纹。
- 桌面版的内容安全策略增加 `'wasm-unsafe-eval'`（只允许编译 WebAssembly，不允许 `eval`）。

### 长时间曲线（D32）

- 曲线可看“最近 10 s”（播放时跟随）或“全程”。全程时按像素列画最小 / 最大包络，几十万帧的曲线也能流畅重绘；在曲线上拖动选择区间放大，放大到一定程度画原始帧，双击恢复。

### 频闪照片（D33）

- “显示”菜单或顶栏按钮打开：在 t − n·τ 时刻用精确状态画出半透明的物体轮廓（τ 默认 0.1 s，10 张，透明度递减，可选时刻标签；“设置 › 显示”可改）。截图、视频与课件导出与画面一致。

### 求解器信息

- “场景”页显示：引擎（Rust (WebAssembly) 或 TypeScript 及原因）、已算到的时刻、计算速度（× 实时）、帧内存与上限、块数 / 常驻块数、检查点数、重算次数、截至当前的指纹（可复制）。

### 其他

- 公式库修正：水平面减速滑行的摩擦功改为对任意初速度方向成立的形式；斜面上共速时刻用 |a|；LaTeX 中不再含中文。
- 顶栏在不限时长时显示“停止计算”；时间线、标签在窄窗口中自动收起次要按钮；监视页自动缩放只取前 `legacyDuration` 秒，避免自由落体越落越远时画面缩到看不见。
- 关于页列出 Rust 引擎的组件与许可（MIT / Apache-2.0）；`docs/THIRD_PARTY_NOTICES.md` 重新生成（51 个 npm 包、232 个桌面版 crate、11 个引擎 crate）。

## 兼容性

- 场景文件格式升为 3：`settings.duration` 可为 `null`（不限时长），新增 `settings.stopAt` 与 `settings.legacyDuration`。格式 1、2 的文件打开时保留原来的时长（有限时长），结果与 26.49 相同；新建场景与模板为不限时长。格式 3 的文件不保证能在 26.49 中打开。
- 有限时长下，26.48 的 14 个模板、26.49 的 21 个模板与手工场景指纹与 26.49 逐位相同（`tests/golden.test.ts`、`tests/streaming.test.ts`）；板块模型（默认参数，2.5 s）仍为 `bb1283491e1c…`。
- 26.49 的偏好设置自动迁移；语言默认跟随系统。

## 实测结果（容器 Linux，Node 22.22，Chromium 141，rustc 1.92）

| 检查 | 结果 |
| --- | --- |
| 自动测试 | 40 个文件 463 项全部通过（26.49：311 项）；类型检查、网页构建通过 |
| Rust 与 TypeScript 逐位一致 | `scripts/parity.mjs`：550 个场景（21 个模板有限时长与不限时长 60 s、黄金场景、流式特殊场景、500 个随机场景），1,276,129 帧、45,836 个事件、2,494 个检查点，0 处不一致；Rust 从自己的检查点重算 1378 块、TypeScript 从 Rust 检查点重算 256 块，全部一致。随机场景覆盖 Moreau–Jean 后备、Stronge 摩擦碰撞、四种积分器、stopAt、各类错误与警告 |
| WASM 与 TypeScript | 发布版 WASM：Node 中 31 项引擎测试通过；无头 Chromium 中 21 个模板经 WASM 计算线程、TS 计算线程、主线程三种方式指纹全部相同，不限时长单摆 30 s 的滚动指纹相同；WASM 文件无法加载时退回 TS |
| 无限时长 | 单摆、弹簧振子、竖直面圆周（杆）各算 30 分钟仿真时间（1,080,001 帧）不中断；帧内存 97–131 MB（默认上限 512 MB）；以 24 MB 上限运行（约 1400–1500 次释放）后拖回 t = 10 s、600 s、1700 s，帧与精确状态逐位等于不释放的运行，滚动指纹相同；重算 1 s 约 10–12 ms |
| 能量账本 | 上述 30 分钟运行：每 100 s 漂移 ≤ 3.7 × 10⁻¹⁰（阈值 10⁻⁷），1800 s 时最大 6.6 × 10⁻⁹ |
| 三语言 | 1790 条界面文字两种译文齐全；无头 Chromium 中英文、德文界面逐页扫描（工作台、五个标签、曲线与事件、详情、监视页、设置十个分区、模板、扫描、关于、导出对话框）只剩语言名“简体中文” |
| 详情 | 109 条公式的代入求解最终值与卡片理论值逐位相同；推导式通过量纲检查；每种事件类型都有详情 |

## 性能

`node scripts/bench-engine.mjs --runs 7`：14 个原有模板按 26.49 的时长，同一 Node 进程中 TypeScript 与发布版 WebAssembly 各取 7 次中位数（ms；多次复测合计倍数在 3.6–3.8 之间）：

| 模板 | TypeScript | Rust (WASM) | 倍数 |
| --- | --- | --- | --- |
| 斜面滑块 | 16.1 | 4.2 | 3.8 |
| 板块模型 | 72.0 | 20.2 | 3.6 |
| 水平传送带 | 17.7 | 5.9 | 3.0 |
| 倾斜传送带 | 16.2 | 5.6 | 2.9 |
| 一维碰撞 | 10.7 | 2.6 | 4.1 |
| 二维斜碰 | 10.0 | 2.6 | 3.9 |
| 抛体运动 | 14.4 | 3.8 | 3.8 |
| 单摆 | 49.6 | 10.9 | 4.5 |
| 弹簧振子 | 34.7 | 11.3 | 3.1 |
| 定轴转动细杆 | 16.4 | 4.5 | 3.6 |
| 斜面上的圆柱 | 10.9 | 3.5 | 3.1 |
| 小球碰撞细杆 | 5.2 | 1.8 | 2.9 |
| 阿特伍德机 | 13.7 | 3.2 | 4.2 |
| 桌面—滑轮连接体 | 23.8 | 5.6 | 4.2 |
| 合计 | 311.3 | 85.7 | 3.6 |

不限时长连续计算 300 s 仿真时间（× 实时）：单摆 171 → 663，板块模型 54 → 167，弹簧振子 119 → 397，竖直面圆周（杆）150 → 955。原生 Rust（`verity-cli`）比 TypeScript 快约 13 倍，桌面版直接调用原生引擎留待 26.51 评估。

## Windows 检查

在维护者的 Windows 电脑上完成（`docs/reports/26.50-windows-hand-check.md`）：`scripts\release.cmd` 构建通过（16 项 Rust 测试、463 项测试，WASM 在 Windows 上构建，两次构建逐字节相同）；WebView2 中计算引擎为 Rust (WebAssembly)；板块模型 2.5 s 指纹在 WASM 与 TypeScript 引擎下都是 `bb1283491e1c…`（WASM 26 ms，TypeScript 76 ms）；斜面滑块不限时长的滚动指纹（截至 31 s、34 s）与 Node 相同；运行中切换中文、英文、德文正常，公式详情的推导与代入求解完整。检查中发现的 5 个界面问题（切换语言后右侧标签与情形标题不更新、英文“复制”误作 Duplicate、德文长词溢出、个别德文数字用小数逗号）已在发布前修正并重新构建。

## 已知限制

- 释放后的块在界面线程中用 TypeScript 引擎同步重算（每块约 10 ms，逐位相同并核对摘要）；手册 D32 设想在计算线程中进行，留待 26.51。
- 静止检测要求导数严格为零：渐近静止不会自动停止（由前瞻窗口限制计算量）。阿特伍德机、桌面—滑轮连接体不限时长时，物块到达滑轮后求解器因步长过小停止并给出说明（与 26.49 相同的物理限制：模型中没有“到达滑轮”的约束）。
- 德文数字仍用小数点（D27 中“德文小数逗号”未做）；导出语言跟随界面语言，导出对话框中没有单独的语言选项。
- 文字表以中文原文为键（gettext 方式），不是手册 D27 设想的嵌套键对象；完整性由测试保证，效果相同。
- TypeScript 求解器在本版仍具备全部功能（D31：26.51 起冻结）。
- 师生试用（26.49 手册 P0）仍未进行；多点同时摩擦碰撞仍按光滑冲量计算（有警告），26.51 解决。
- 网页版只在 Chromium 内核浏览器上验证过；不能直接双击 `index.html`（需 HTTP 服务器）。

## 文件

| 文件 | 说明 |
| --- | --- |
| `Verity-v26.50-windows-x64-setup.exe` | Windows 安装程序（当前用户安装，需要 WebView2，缺失时自动下载） |
| `Verity-v26.50-windows-x64-portable.exe` | 便携版，直接运行 |
| `Verity-v26.50-web.zip` | 网页版静态文件，部署见包内 `HOSTING.md` |
| `Verity-v26.50-source.zip` | 源码（工作区快照，不含依赖与构建产物；含 `engine/` 与 WASM 构建产物） |
| `Verity-v26.50-release-evidence.zip` | 构建日志、测试报告、对照与性能记录、阶段报告、检查记录 |
| `THIRD_PARTY_NOTICES.md` | 第三方组件与许可证全文 |
| `SHA256SUMS.txt` | 校验和 |

本版没有任何 Git 提交、暂存、标签或推送，所有改动留在工作区由维护者手动提交。

---

## English summary

Verity 26.50 lays four foundations. **Unbounded runs:** new scenes and all templates simulate from t = 0 without a time limit; computation stays a look-ahead window ahead of playback, records are kept in 1-second chunks with checkpoints, and chunks evicted under the memory budget (512 MB by default) are recomputed bit for bit; runs can still stop at a time or a given time after an event, and stop by themselves at permanent rest. **Three languages:** Chinese, English and German for the whole interface, all 109 formulas, situations, events, templates, solver messages and every export; the solver cores emit language-neutral message keys. **Details:** every formula card and every event opens a derivation, a step-by-step worked solution with the current numbers (bit-identical to the card's theoretical value), a condition check and the comparison with the simulation; collision events show the impulse calculation. **Rust core:** the solver was ported to Rust and runs as WebAssembly in the worker, bit-identical to the TypeScript engine (550 scenes, 1.28 million frames, 0 mismatches) and about 3.6 times as fast; the TypeScript engine remains as a reference and fallback. Also new: whole-run charts with min/max envelopes and zoom, stroboscopic pictures, and a solver information panel. Scene files move to format 3; files from 26.48/26.49 keep their duration and fingerprints.

## Deutsche Zusammenfassung

Verity 26.50 legt vier Grundlagen. **Unbegrenzte Laufzeit:** Neue Szenen und alle Vorlagen rechnen ab t = 0 ohne Zeitgrenze; die Berechnung läuft der Wiedergabe um ein Vorausfenster voraus, die Aufzeichnung wird in 1-Sekunden-Blöcken mit Prüfpunkten gespeichert, und Blöcke, die wegen des Speicherlimits (Standard 512 MB) verworfen wurden, werden bitgleich neu berechnet; ein Lauf kann weiterhin zu einem Zeitpunkt oder eine Zeit nach einem Ereignis enden und endet bei dauerhafter Ruhe von selbst. **Drei Sprachen:** Chinesisch, Englisch und Deutsch für die gesamte Oberfläche, alle 109 Formeln, Situationen, Ereignisse, Vorlagen, Meldungen des Lösers und alle Exporte; die Rechenkerne liefern sprachneutrale Meldungsschlüssel. **Details:** Jede Formelkarte und jedes Ereignis öffnet eine Herleitung, einen schrittweisen Lösungsweg mit den aktuellen Zahlen (bitgleich zum theoretischen Wert der Karte), die Prüfung der Bedingungen und den Vergleich mit der Simulation; Stoßereignisse zeigen die Kraftstoßrechnung. **Rust-Kern:** Der Löser wurde nach Rust portiert und läuft als WebAssembly im Worker, bitgleich zum TypeScript-Kern (550 Szenen, 1,28 Millionen Frames, 0 Abweichungen) und etwa 3,6-mal so schnell; der TypeScript-Kern bleibt als Referenz und Rückfallebene. Außerdem neu: Diagramme über den ganzen Lauf mit Min/Max-Hüllkurve und Zoom, Stroboskopbilder und eine Löser-Infoanzeige. Szenendateien wechseln zu Format 3; Dateien aus 26.48/26.49 behalten ihre Dauer und ihre Fingerabdrücke.
