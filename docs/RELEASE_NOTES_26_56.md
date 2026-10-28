# VeloΦ（VeloPhi）26.56 发布说明

文档日期：2026-10-28 · 版本 26.56.0

26.56 依据维护者提供的《VeloPhi 能力蓝图》与《模型与例题全集》开发（决策 D98–D109，`docs/DEV_MANUAL_26_56.md`）。两份文档以 26.55（提交 f71a4ff）为静态基线；本版先按实际代码逐项核对，提交覆盖矩阵（`docs/coverage/COVERAGE_26_56_baseline.md`），再补齐公共基础和三个从模型到复现的教学闭环。目标不是把文档列出的能力一律当作缺失，而是在现有成果上让物理结果可独立验证、教学有证据、结果可复现。实施后的矩阵由注册数据生成（`docs/coverage/COVERAGE_26_56.md`）。英文、德文摘要见文末。

## 本版内容

### 公共基础（P0）

- **七个 SI 基本量纲（D99）**：Rust 核心与界面统一为长度、质量、时间、电流、温度、物质的量、发光强度；此前 Rust 是三维、界面是以电荷为基量的四维，两端不一致。温度分绝对温度与温差：绝对温度以 °C 显示时做仿射换算，温差只换比例。显示单位增加温度、压强、密度、体积、物质的量等。
- **常数集（D100）**：CODATA 2018 与 CODATA 2022，带单位、标准不确定度与来源。康普顿散射、磁场与电磁感应、核反应与结合能、平行板电容器四个实验可选常数集，新实验默认 2022；26.55 保存的实验与导出的文件按 2018 计算，结果不变。磁场模块的 μ₀ 不再写死为 2018 值。
- **模型注册（D98、D106）**：蓝图的 180 个模型族全部作为数据注册，每族写明输入（SI 单位与语义量）、适用条件、输出、几何（平面运动、二维截面每米、轴对称……）、假设、有效域、来源与成熟度。计算全部在 Rust 核心中：条件分“适用 / 不适用 / 信息不足 / 近似适用”四种状态并说明原因；可求未知量，报告无解、单解或多解；未定义的结果显示原因而不是数字。
- **独立参照（D109）**：每个模型族至少三组用 mpmath 另行实现的参照（基准、边界、极限或迁移，共 591 组），自动测试逐组比较；比较一律用带量纲尺度的缩放误差和未圆整的值，文档中的圆整答案只供阅读。
- **参照类别（D101）**：公式卡标出比较的性质——“独立解析”“守恒 / 定理检验”“同源一致”（公式用了同一次运行读出的量时，只说明内部一致）。
- **运行清单（D104）**：CSV、实验导出、模型计算、学习活动与参数化题都附带核心版本、后端及其物理版本、常数集与来源、数据集版本和输入的 SHA-256。
- **粒子过程（D107）**：核物理实验新增“粒子过程”：按 PDG 2024 的粒子目录分别检查电荷、重子数、三代轻子数、能量（衰变 Q 值与碰撞阈值）和奇异数。原来的核反应配平只比较质量数与电荷数，现在注明它不是一般的粒子过程校验器。

### 教学

- **学习活动（D102）**：15 个活动覆盖三个闭环——力学（自由落体与事件、斜面受力、静摩擦阈值、沉浮预测、单位与温标）、电路与感应（串并联、电表内阻、RC 充电、LC 振荡、导轨感应）、热学量子与核（气体四过程、无限深势阱、高斯波包、衰变统计、衰变链）。每个活动依次是目标与先修、概念诊断（选项对应常见误概念并给出针对性反馈）、预测与理由、一次只改一个量的控变量实验、修订解释、带逐级提示的题目、迁移题，最后按概念、单位、方向、建模、计算、解释六个维度给出结果。所有答案由 Rust 模型计算。
- **学习记录（D103）**：“已访问”“已练习”“掌握证据”分开记录：打开页面只算访问，完成活动算练习，满足可见的掌握规则（核心题与迁移题各维度全部正确，以每题第一次核对为准——核对后会显示参考答案，之后的改正只作练习；提示照记，不扣分）才记掌握证据。26.55 的“已完成”实际是“已打开”，迁移为访问。学习记录只存在本机，可导出 JSON、清除。
- **参数化题（D102）**：教师在模型页把模型复制为参数化题：选择抽取的输入（区间与步长）、要问的量和必须成立的条件；固定种子可重现，每组参数先由 Rust 模型判定条件与可解性，不合格的抽取按原因计数，预览多组后导出。
- **收敛研究（D108）**：量子实验新增“收敛”面板：自由高斯波包随网格加密与解析解比较（⟨x⟩、σ(t)、范数），时间步自收敛给出观测阶数；吸收层损失与离散误差分开报告。

### 界面（D105）

- “教学 › 模型目录…”：按领域、学段、成熟度与状态筛选和搜索 180 个模型族；模型页显示假设、有效域、几何、条件状态、带分支的输出（条件不成立的公式划掉）、所用常数、参照类别与基准、求未知量、关联的模板 / 实验 / 题目 / 活动和参数化题。
- 实验页头部列出该实验服务的模型族；全局搜索（Ctrl+K）收录模型族与学习活动；学习路径用三种标记分别显示访问、练习与掌握证据，并显示掌握规则。
- 斜面受力分析活动可全部用键盘完成：受力是复选框（空格），摩擦方向是单选组（方向键）；活动、模型目录与学习路径是模态对话框，Tab 不会离开对话框，Escape 关闭。

## 覆盖矩阵（实施后）

| 项 | 26.55 基线 | 26.56 |
| --- | --- | --- |
| 模型族已验证（在其标注的成熟度上） | 80 | 180 |
| 成熟度 L0 / L1 / L2 / L3 | 59 / 59 / 62 / 0 | 0 / 74 / 91 / 15 |
| 带评分证据的学习活动 | 0 | 15 |
| 完成（物理有效域、独立验证、教学证据、交互可用、复现导出五项全满足） | 0 | 15：M03 M07 M08 F02 T10 E09 E13 E15 E17 B10 B11 Q05 Q08 N01 N02 |
| 需求 60 项：已验证 / 部分 / 待验证 / 未实现 / 暂缓 | 8 / 40 / 0 / 12 / 0 | 38 / 17 / 1 / 0 / 4 |

“已验证”的含义随成熟度：L1 指受限解析计算与独立参照一致；L2 及以上还要求仿真或实验与独立参照的自动对照。74 个 L1 族只有受限解析计算；23 个受限模型（21 个 P3 族与 M30、X01）写明计算了什么、暂缓了什么。没有学生试用与修订记录，因此不声称 L4。变量定位（D72）复核时没有找到自动测试，从“已验证”改为“存在但待验证”。

## 兼容性

- 场景格式不变；77 个模板的记录指纹与 26.55 逐位相同。刚体场景的库仑常数保持 26.55 的 CODATA 2018 值（为保留指纹），运行清单如实记为 2018。
- 实验文件：选用 CODATA 2022 的写为版本 3（26.55 打开时提示“较新版本”）；没有常数集的旧文件按 2018 计算；导出附运行清单（旧版本读入时忽略）。
- 学习进度：26.55 的“已完成”迁为“已访问”，不生成练习或掌握记录。
- WebAssembly 接口版本仍为 2；新增计算操作 `units constants manifest setModels modelList modelEval modelSolve particleProcess`，旧操作不带常数集时结果不变。

## 实测结果

| 检查 | 结果 |
| --- | --- |
| 自动测试 | 开发容器（Node-API 原生核心）83 个文件 1783 项全部通过；Windows 发布构建的 WebAssembly 上 1767 项通过、16 项原生引擎协议测试只在 Node-API 下运行；类型检查、网页构建通过；三语文字齐全 |
| Rust 测试 | `cargo test --workspace --release` 88 项全部通过（含模型计算器的四态条件与求根、粒子过程、常数集） |
| 独立参照 | 180 个模型族、591 组 mpmath 参照全部在容差内；覆盖矩阵的每条证据引用都能在仓库中找到（`node scripts/coverage.mjs --check`） |
| 原生与 WebAssembly | 591 组模型计算等全部结果按双精度位求摘要，原生 Rust 与 WebAssembly 相同（`9eebffe5…`） |
| 求解器与计算对照 | `parity.mjs`：490 个场景、1,944,227 帧 0 处不一致；`calc-parity.mjs`：396 次运行、53,142 个请求 0 处不一致 |
| 指纹（D97） | 77 个模板的记录指纹与 26.55 逐位相同（Node 中的指纹文件字节相同；WebView2 自检的 77 个指纹与 26.55 发布时的报告逐个相同） |
| 闭环证据（摘录） | 自由落体落地时刻相对误差 5 × 10⁻¹⁵；RC 电容电压随容差 10⁻⁶ / 10⁻⁹ / 10⁻¹¹ 误差 3.7 × 10⁻⁶ / 3.5 × 10⁻⁸ / 1.7 × 10⁻⁹；LC 十个周期能量 1.3 × 10⁻¹¹；势阱能级观测阶 2.000；波包时间步观测阶 2.0000；400 个种子的衰变均值 z = 1.21、方差比 0.96 |

详见 `docs/reports/26.56-stage-report.md`。

## Windows 检查

Windows x64（Node 22.22.2、Rust 1.92.0、WebView2 143）：`scripts\release.cmd` 全部 11 步通过。共构建三次：构建 1 的检查（四个界面任务）发现六个问题——活动的掌握证据会被“看过参考答案后改正”污染、模态对话框没有焦点陷阱（Tab 后的 Enter 停止了后面场景的计算）、参数化题相邻种子的题目几乎相同、收敛表在侧栏中折行、`1e-4` 式的数字、输入框截断——修正后构建 2 全部复查通过，构建 3 再收窄了收敛表并发布。见 `docs/reports/26.56-windows-hand-check.md` 与开发手册 §11。

## 已知限制

- 衰变链中两个寿命近乎相等（相对差 10⁻⁶）时，总数守恒到约 10⁻¹⁰（相对）而不是舍入精度：闭式经过 1/(λ₂ − λ₁)。
- 74 个 L1 模型族只有受限解析计算，没有交互仿真对照；通用 PDE 与本征值求解器、符号等价判定、QTI / LTI 交换、AI 辅导、间隔复习与真实数据导入暂缓。
- 误概念库来自文档与教学经验，未经学生数据校准；屏幕阅读器没有实机测试。
- 参数化题校验的内部消息为英文，界面按原因翻译显示。
- 26.55 及更早的对话框（设置、导出等）还没有焦点陷阱；本版只给新的活动、模型目录与学习路径加上。

## 文件

| 文件 | 说明 |
| --- | --- |
| `VeloPhi-v26.56-windows-x64-setup.exe` | Windows 安装程序（当前用户安装，需要 WebView2，缺失时自动下载） |
| `VeloPhi-v26.56-windows-x64-portable.exe` | 便携版，直接运行 |
| `VeloPhi-v26.56-web.zip` | 网页版静态文件，部署见包内 `HOSTING.md` |
| `VeloPhi-v26.56-source.zip` | 源码（工作区快照，不含依赖与构建产物） |
| `VeloPhi-v26.56-release-evidence.zip` | 构建日志、测试报告、计算对照、WebView2 自检、覆盖矩阵、检查记录 |
| `THIRD_PARTY_NOTICES.md` | 第三方组件与许可证全文 |
| `SHA256SUMS.txt` | 校验和 |

本版没有任何 Git 提交、暂存、标签或推送，所有改动留在工作区由维护者手动提交。

---

## English summary

VeloPhi 26.56 implements the maintainer's capability blueprint and model catalogue against the 26.55 baseline (commit f71a4ff). The baseline was checked against the code first and a coverage matrix delivered; the work then completed the common foundation and three closed loops from model to reproducible export. The core and the interface now share seven SI base dimensions with absolute temperatures and temperature differences told apart; physical constants come from named sets (CODATA 2018 for files and states saved before 26.56, CODATA 2022 for new work). All 180 model families of the blueprint are registered as data (inputs with units and meaning, four-state conditions, outputs, geometry, assumptions, validity, sources, maturity) and computed by the Rust core, each checked against at least three independent mpmath references (591 cases). Formula cards say whether their comparison is an independent closed form, a conservation check or same-source consistency; exports carry a run manifest; a particle-process checker applies charge, baryon, lepton-family and energy rules. Fifteen teaching activities (concept diagnosis, prediction with a reason, a controlled experiment, graded hints, transfer, grading by concept, unit, direction, modelling, calculation and explanation) keep visits, practice and mastery evidence apart; teachers turn a model into constrained, reproducible parameterized problems; the quantum lab shows a convergence study. Template fingerprints are unchanged bit for bit. The coverage matrix is generated from the registry and fails when any evidence reference does not resolve; 15 model families meet all five completion criteria, no L4 is claimed.

## Deutsche Zusammenfassung

VeloPhi 26.56 setzt die Fähigkeitsblaupause und den Modellkatalog des Maintainers auf der Grundlage von 26.55 (Commit f71a4ff) um. Zuerst wurde der Stand am Code geprüft und eine Abdeckungsmatrix geliefert; danach wurden die gemeinsame Grundlage und drei geschlossene Lernschleifen vom Modell bis zum reproduzierbaren Export ergänzt. Kern und Oberfläche verwenden nun sieben SI-Basisdimensionen und unterscheiden absolute Temperaturen von Temperaturdifferenzen; physikalische Konstanten stammen aus benannten Sätzen (CODATA 2018 für vor 26.56 gespeicherte Dateien und Zustände, CODATA 2022 für Neues). Alle 180 Modellfamilien sind als Daten registriert (Eingaben mit Einheit und Bedeutung, Bedingungen mit vier Zuständen, Ausgaben, Geometrie, Annahmen, Gültigkeit, Quellen, Reifegrad), werden im Rust-Kern berechnet und mit je mindestens drei unabhängigen mpmath-Referenzen geprüft (591 Fälle). Formelkarten nennen die Art ihres Vergleichs (unabhängige geschlossene Lösung, Erhaltungsprüfung oder Konsistenz aus derselben Quelle); Exporte tragen ein Laufprotokoll; eine Prüfung von Teilchenprozessen wendet Ladungs-, Baryonen-, Leptonfamilien- und Energieregeln an. Fünfzehn Lernaktivitäten (Diagnose, Vorhersage mit Begründung, kontrolliertes Experiment, gestufte Hinweise, Transfer, Bewertung nach Konzept, Einheit, Richtung, Modellierung, Rechnung und Erklärung) trennen Besuche, Übung und Nachweise der Beherrschung; Lehrkräfte erzeugen aus einem Modell reproduzierbare, geprüfte Parameteraufgaben; das Quantenlabor zeigt eine Konvergenzstudie. Die Fingerabdrücke aller Vorlagen sind bitgenau unverändert. Die Abdeckungsmatrix wird aus der Registrierung erzeugt und schlägt fehl, wenn ein Nachweis nicht auffindbar ist; 15 Modellfamilien erfüllen alle fünf Abschlusskriterien, L4 wird nicht beansprucht.
