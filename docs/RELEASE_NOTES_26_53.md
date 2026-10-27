# VeloΦ（VeloPhi）26.53 发布说明

文档日期：2026-10-27 · 版本 26.53.0

26.53 按 `DEV_MANUAL_26_53.md` 和维护者在 26.52 发布后提出的三项要求开发：**前端 Vue、后端 Rust**——所有物理与数值计算移到 Rust 核心，TypeScript 只做界面与展示，桌面版的仿真在原生 Rust 线程中运行；**公式系统更方便查看**——公式面板改版（搜索、筛选、紧凑与详细两种密度、收藏、键盘）、公式时间轴、公式与画面联动；以及按手册继续的细节修正（V 形槽底静止的静不定摩擦、组合与切割的坐标残差等）。英文、德文摘要见文末。

## 本版内容

### W1 前端 Vue，后端 Rust（D65–D67）

- 26.52 中，仿真已经能在 Rust（WebAssembly）中运行，但界面线程上仍有大量 TypeScript 计算：观测量与自定义量、情形识别、公式取值与判定、事件详情、受力分析图、纸带、v–t 面积、曲线降采样、画面的位姿与力箭头、编辑器的几何，以及被逐出内存的帧块的重算——它们都要先在界面线程上编译一份 TypeScript 求解器。现在这些计算全部在 Rust 核心（`velophi-core`）中：界面线程持有一个 Rust **会话**，收下仿真线程发来的增量数据（字节原样，不在 JavaScript 中解码），所有读数、公式、曲线和画面都向会话查询；编辑状态下用“场景会话”给出初始位姿、轮廓与吸附用的几何。
- 被逐出的帧块在会话中用同一条代码路径从检查点重算（逐位相同，按块摘要核对），远程预取保留：即将用到的块由仿真宿主（原生线程或后台线程）重算后交回。
- WebAssembly 接口升到 2：会话（`session_*`）、无状态计算（`calc_call`）与原有的运行接口；全部操作的参数与结果见 `engine/CALC.md`，测试核对前端用到的操作、Rust 实现的操作与文档三者一致。核心给出的文字一律是消息键，由界面按语言显示（核心的场景错误现在也有三语文字）。
- 界面代码中不再有求解器与数值模块：测试检查 `src/` 不引用参照代码、不存在旧的求解器目录、不定义参照代码的函数；网页构建产物同样检查（`scripts/check-dist.mjs`）。

### W2 原生桌面引擎（D68）

- 桌面版默认在原生 Rust 线程中计算（“求解信息”中显示“原生 Rust”）：每次运行一个线程，增量数据经 Tauri 通道以原始字节流式发给页面，页面原样交给会话；前瞻、停止、取消、预算超时与网页工作线程的协议相同；被逐出帧块的预取重算也在原生线程中进行。原生引擎不可用时自动退回 WebAssembly 后台线程（设置中也可选择），两者结果逐位相同。
- 参数扫描在原生引擎上同时计算多个点（逻辑核数 − 1），结果按点的顺序给出，与逐个计算逐位相同。
- 应用内自检（`velophi.exe --selftest`）改为：每个模板分别用原生 Rust、后台线程中的 WebAssembly、界面线程上的 WebAssembly 计算，比较指纹。

### W3 TypeScript 参照（D69）

- 26.52 的 TypeScript 求解器、记录、观测、识别、公式取值与教学数值部分移到 `tests/reference/`，只在测试与对照脚本中使用，不再进入应用。两类对照逐位比较：`scripts/parity.mjs`（求解器与记录）与新的 `scripts/calc-parity.mjs`（会话的全部计算：读数、序列、能量账本、情形与样本、公式卡片、事件详情、帧视图与力箭头、受力分析图、纸带、面积、箭头比例；含内存很小时的逐出与重算）。
- 前端测试在容器中通过 Node-API 小模块调用原生 Rust，在 Windows 发布构建中直接加载新构建的 WebAssembly，两者是同一份 Rust 源码。

### F1 公式面板改版（D70）

- 面板顶部一行工具：**搜索**（标题、符号、公式编号、情形名称；按 `/` 聚焦）、按**物体**、**类别**（运动学 / 动力学 / 能量 / 动量 / 转动 / 碰撞 / 场与振动）、**判定**（一致 / 偏差 / 近似）筛选、**只看收藏**、**紧凑 / 详细**两种密度、**按情形 / 按物体**分组。
- **紧凑**：每条公式一行——判定色点、标题、公式、理论值与仿真值、误差；点一下展开为完整卡片。**详细**：完整卡片（已知量、着色代入、计算步骤、条件与原因）。
- **收藏**（☆/★）：收藏的公式出现时置顶，并在公式时间轴上标星。收藏、密度、分组与筛选保存在设置中，重启后保留。
- **键盘**：↑↓ 在公式间移动，Enter 打开详情，空格展开/收起，F 收藏/取消。
- 筛选后没有公式时，说明是哪个筛选条件排除了它们，并给出“清除筛选”。

### F2 公式时间轴（D71）

- 时间线下方新增可折叠的公式时间轴：每个识别出的情形一段色条（颜色表示类别），碰撞等瞬时情形为竖线标记；色条下沿表示该情形公式的判定（全部一致为绿，有偏差为红，有近似为黄），含收藏公式的情形带 ★。悬停显示情形名称、时间段、公式数与判定；点击跳到该时刻并在公式面板中定位到这个情形；双击把时间线放大到这一段（“显示全程”恢复）。

### F3 公式与画面联动（D72）

- 悬停公式卡片：画面中高亮公式变量涉及的物体（质量、接触的系数、角度；公式不涉及具体物体时高亮整个情形），并加粗显示公式涉及的力（N、f、T、F弹 …，即使“受力”显示关闭），用到 θ 时画出角弧。速度、加速度与力的数值标签互相避让，同一接触点上的作用力与反作用力不再叠在一起。
- 悬停已知量：高亮对应的画面元素——物体（m、M、I、r）、接触（μ、e：支持力与摩擦力）、绳与弹簧（T、L、k）、角度（θ：在斜面接触处画出角弧）、速度（v、u：画出速度箭头）、重力（g）。
- 在“公式”页签打开时点击画面中的物体，公式面板只显示涉及它的公式；点击力箭头，只显示涉及这个力的公式；点击空白处取消。

### X 物理与细节

- **静不定接触（D73）**：一个物体以几个法向不同的面同时接触并静止时，约束力不唯一。现在静止时先使摩擦力最小、再使其余约束力最小（两级最小范数；所选解若需要拉力接触或超出摩擦锥则不采用；运动中与 26.52 相同）；另外，投影后已经静止的“滑动”接触会重新判断能否粘着。小球停在 V 形槽底时得到教材的对称解：两侧摩擦力为 0（受力分析图中不再出现摩擦力），支持力 N₁ = N₂ = mg/(2 cos θ)（相对误差约 10⁻¹⁵）（26.52 给出两侧各 μN 的“夹紧”解）。静止时冗余支撑的支持力平均分配。两个引擎同时修改；V 形槽与活动斜面两个模板的指纹因此改变，其余模板与黄金场景逐位不变；2055 个有限时长的模板、黄金与随机场景与 26.52 的计算结局全部相同。
- **坐标取整（D74）**：组合、切割与拆分写入的位置、局部坐标与角度取 10⁻⁹ 的整数倍，不再出现 2×10⁻¹² m 这样的残差。
- 变力（表达式外力）的箭头现在按当前值绘制（26.52 画的是场景中的常量值）。
- 后台线程在一个帧块计算超过 250 ms 时补发已算出的帧（改写过程中丢失的行为，已恢复）。
- 公式误差的显示：0 显示为 0，很小的相对误差写成 1.3×10⁻¹⁶，不再显示 `0.0e+0`。
- 修正：监视页隐藏时切换模板，可能报错“session already freed”（26.52 已有的问题）。
- 修正：窄面板中详细公式卡片横向溢出、持续计算时时间轴工具栏的“已算到”被截断。

## 兼容性

- 场景文件格式仍为 4；26.52 的场景文件、设置与题目包照常使用。
- 除 V 形槽与活动斜面外，26.52 的全部模板与黄金场景指纹不变。
- WebAssembly 接口版本为 2，26.52 的 `velophi_core.wasm` 不能与 26.53 的界面一起使用。网页版不再有 TypeScript 引擎作为后备：WebAssembly 无法加载时给出错误说明。

## 实测结果（容器 Linux，Node 22，Chromium，rustc 1.92）

| 检查 | 结果 |
| --- | --- |
| 自动测试 | 64 个文件 748 项（容器中经 Node-API 调用原生 Rust）；换用 Windows 构建的 WebAssembly 时同样通过（原生引擎协议的 16 项只在 Node-API 下运行）；类型检查、网页构建通过；界面文字 2511 个键，三语齐全 |
| 求解器对照 | `scripts/parity.mjs`：1442 个场景、2,354,320 帧、81,751 个事件、4797 个检查点，TypeScript 参照与 Rust 0 处不一致；14 个原有模板 TS 1006 ms、Rust 82 ms（`docs/reports/26.53/parity.txt`） |
| 计算对照 | `scripts/calc-parity.mjs`：480 次运行（模板有限时长与不限时长、黄金与特殊场景、随机场景，各以默认与很小的内存预算运行），64,504 个请求、10,620 个情形、9408 个样本、93,256 张公式卡片，0 处不一致（`docs/reports/26.53/calc-parity.txt`） |
| 与 26.52 的引擎比较 | 2055 个有限时长场景的计算结局（完成或出错、停止原因、帧数）全部相同，1909 个指纹逐位相同，没有场景明显变慢 |
| 原生桌面引擎 | 原生作业与 WebAssembly 作业的记录逐位相同；前瞻暂停、跟随播放位置、停止、取消；帧块重算与 WebAssembly 的重算逐字节相同 |
| 静不定接触 | V 形槽底静止：f = 0，N₁ = N₂ = mg/(2 cos θ)（相对误差约 10⁻¹⁵），两个引擎逐位相同 |

## Windows 检查

Windows x64（Node 22.22.2、Rust 1.92.0、WebView2 143）：`scripts\release.cmd` 全部 11 步通过——Rust 测试；WebAssembly 重新构建（1,699,812 字节）；类型检查；748 项测试（732 项在新构建的 WebAssembly 上通过，16 项原生引擎协议测试只在 Node-API 下运行）；计算对照 320 次运行 0 处不一致；`tauri build`；网页构建不含参照代码；WebView2 中 35 个模板的原生 Rust、后台线程 WebAssembly 与界面线程 WebAssembly 指纹全部相同（2.8 s，原生 577 ms）；打包。实机检查了原生引擎与运行统计、公式面板两种密度与画面筛选、公式时间轴、V 形槽底的受力（N = 2.991 N × 2，无摩擦力）与并行参数扫描（11 个点 0.3 s），见 `docs/reports/26.53-windows-hand-check.md`（在证据包中）。

## 已知限制

- 已知量与画面元素的对应按变量名推断，个别情形中的变量（如传送带速度 u）会高亮物体的速度而不是传送带。
- 网页版需要支持 WebAssembly 的浏览器；只在 Chromium 内核浏览器上验证过；不能直接双击 `index.html`（需 HTTP 服务器）。
- 复合体各部分重叠时按重叠部分重复计入质量；切割不支持圆与复合体；受力分析图的“F其他”不区分来源。
- 顺延到 26.54：链节绳、自定义公式卡、触屏与交互白板、无障碍、分享、插件接口。

## 文件

| 文件 | 说明 |
| --- | --- |
| `VeloPhi-v26.53-windows-x64-setup.exe` | Windows 安装程序（当前用户安装，需要 WebView2，缺失时自动下载） |
| `VeloPhi-v26.53-windows-x64-portable.exe` | 便携版，直接运行 |
| `VeloPhi-v26.53-web.zip` | 网页版静态文件，部署见包内 `HOSTING.md` |
| `VeloPhi-v26.53-source.zip` | 源码（工作区快照，不含依赖与构建产物） |
| `VeloPhi-v26.53-release-evidence.zip` | 构建日志、测试报告、计算对照、WebView2 自检、阶段报告、检查记录 |
| `THIRD_PARTY_NOTICES.md` | 第三方组件与许可证全文 |
| `SHA256SUMS.txt` | 校验和 |

本版没有任何 Git 提交、暂存、标签或推送，所有改动留在工作区由维护者手动提交。

---

## English summary

VeloPhi 26.53 rebuilds the architecture as **a Vue front end on a Rust back end**. Every computation on the model, the state or the recording — readouts and custom quantities, situation recognition, formula values and verdicts, event details, free-body diagrams, ticker tapes, areas, chart envelopes, the poses and force arrows of the canvas, editor geometry and the recomputation of evicted chunks — now runs in the Rust core; the interface thread queries a Rust session that receives the run's deltas as raw bytes. The desktop app computes runs in **native Rust threads** (falling back to the WebAssembly worker, bit-identical), and parameter sweeps compute several points at once. The former TypeScript engine is kept only as the test reference; two harnesses compare it with the Rust core bit for bit. The **formula panel** gains search (`/`), filters by body, category, verdict and favourites, compact and detailed cards, grouping by situation or body, favourites and keyboard control; a **formula timeline** under the timeline shows each situation with the verdicts of its formulas; hovering a formula or a known value highlights the bodies, forces, contacts, angles or velocities it refers to, and clicking a body or a force on the canvas filters the formulas. A ball at rest in a V-groove now gets the textbook symmetric forces (no friction, N = mg/(2 cos θ)), and combining or cutting bodies leaves no rounding residue.

## Deutsche Zusammenfassung

VeloPhi 26.53 baut die Architektur als **Vue-Oberfläche über einem Rust-Kern** neu auf. Jede Berechnung an Modell, Zustand oder Aufzeichnung — Messwerte und eigene Größen, Situationserkennung, Formelwerte und Urteile, Ereignisdetails, Kräftepläne, Papierstreifen, Flächen, Kurvenhüllen, Lagen und Kraftpfeile der Ansicht, Editorgeometrie und die Neuberechnung ausgelagerter Blöcke — läuft jetzt im Rust-Kern; die Oberfläche fragt eine Rust-Sitzung ab, die die Teilergebnisse des Laufs als Rohbytes erhält. Die Desktop-App rechnet in **nativen Rust-Threads** (mit bitgleichem Rückfall auf den WebAssembly-Worker), Parameterstudien rechnen mehrere Punkte gleichzeitig. Die frühere TypeScript-Engine bleibt nur als Testreferenz; zwei Vergleichsskripte prüfen sie bitgenau gegen den Rust-Kern. Die **Formelleiste** erhält Suche (`/`), Filter nach Körper, Kategorie, Urteil und Favoriten, kompakte und ausführliche Karten, Gruppierung nach Situation oder Körper, Favoriten und Tastaturbedienung; eine **Formel-Zeitleiste** unter der Zeitleiste zeigt jede Situation mit den Urteilen ihrer Formeln; beim Überfahren einer Formel oder eines bekannten Werts werden die betroffenen Körper, Kräfte, Kontakte, Winkel oder Geschwindigkeiten hervorgehoben, und ein Klick auf einen Körper oder eine Kraft filtert die Formeln. Eine in einer V-Nut ruhende Kugel erhält jetzt die symmetrischen Lehrbuchkräfte (keine Reibung, N = mg/(2 cos θ)), und Verbinden oder Schneiden hinterlässt keine Rundungsreste.
