# Verity 26.51 发布说明

文档日期：2026-10-25 · 版本 26.51.0

Verity（暂名）是面向物理专业学生、物理老师和爱好者的二维力学仿真与教学引擎。26.51 按 `DEV_MANUAL_26_51.md` 和维护者在 26.50 发布后提出的六项要求（U1–U6）开发：公式按**知识难度**分级（中国课标与 IB 两套体系），公式从 109 条增加到 156 条，解题过程按“已知 / 求 / 解 / 答”展开，设置里新增**学习手册**；编辑改为**无极调节**，只在贴近其他物体时吸附；换了新图标。物理核心增加任意方向重力、万有引力、空气阻力、五种新连接件、多点同时摩擦碰撞、**从任意时刻分支**和自定义量；26.50 的五项遗留全部完成。英文、德文摘要见文末。

## 本版内容

### U1 知识难度（D44）

- 设置 › 知识难度：选择课程体系（中国课标 / IB）和知识水平。中国课标为初中、高中、大学、更高；IB 为 MYP、DP SL、DP HL、大学、更高。默认：简体中文界面为“中国课标 · 高中”，英文、德文界面为“IB · DP SL”。
- 每条公式都有两套级别标签（中国课标：初中 7 条、高中必修 79 条、高中选择性必修 21 条、大学 47 条、更高 2 条；IB：MYP 8 条、SL 100 条、HL 26 条、大学 20 条、更高 2 条）。公式卡片标出级别（如“高中必修”“IB SL”“大学”），超过所选水平的公式折叠为“还有 N 条更高级的公式”，可展开。
- 级别只影响显示：识别与对照照常计算，切换级别不重算、指纹不变。实验报告与课件可选“只含所选知识水平内的公式”。

### U2 解题过程（D45）

- 卡片上直接给出“已知 → 代入 → 结果”：每个已知量一种颜色（色盲安全色板），符号式、已知量表和代入式中同一个量用同一颜色；可就地展开逐步计算。
- 详情中的解题过程按教材格式：已知 / 求 / 解（选用公式 → 单位换算（显示单位不是国际单位时单列一步）→ 代入 → 逐步计算，每一步注明在做什么）/ 答，最后与仿真对照并说明误差。英文为 Given / Find / Solution / Answer，德文为 Gegeben / Gesucht / Lösung / Antwort。最终值与卡片理论值逐位相同。

### U3 更多分级公式

- 公式库 109 → 156 条（新增 47 条），每条都有三语推导、代入求解和级别标签，并且至少在一个模板中被识别、与仿真一致。新增内容：初中——匀速直线运动的路程与速度、牛顿第一定律（合力为零）、功 = 力 × 距离、功率 = 力 × 速度、杠杆平衡条件；高中——自由落体（速度、高度）、恒力拉动物块（加速度、斜拉时的支持力、恒力做功、动能定理、动量定理）、抛体的机械能守恒、弹性与完全非弹性碰撞（碰后速度、等质量交换速度、损失的动能）、匀速圆周运动（角速度、周期、向心加速度、向心力）、万有引力定律与开普勒第二、第三定律、圆轨道环绕速度、齿轮传动；大学与 IB HL——活力公式、轨道能量与偏心率、线性与平方阻力下的终端速度和速度—时间关系、阻尼振动的周期与振幅衰减、转动定律与匀变速转动、力矩做功。
- 新模板 10 个（共 31 个）：匀速运动、拉力加速、自由落体、杠杆、匀速圆周、行星轨道、阻力下落、阻尼振动、马达驱动圆盘、齿轮传动。

### U4 学习手册（D46）

- 设置 › 学习手册：9 个主题（力与运动、摩擦、能量与功、动量与碰撞、圆周运动、振动、转动、万有引力与轨道、阻力），每个主题一篇三语原理讲解和关键关系式；156 条公式条目各有符号表、适用条件、推导、级别与示例。
- 可搜索、按当前知识水平筛选（可切换“显示全部级别”）；“打开示例”载入模板、运行并跳到该公式出现的时刻。公式卡片上的“手册”按钮直接跳到对应条目。示例由识别器在模板上运行得到（`src/handbook/examples.json`，测试保证每个示例仍然出现其公式）。

### U5 无极调节（D47）

- 移动、缩放、旋转、顶点、连接点和标注默认连续，坐标不取整、不落网格。
- 物体吸附（默认开）：拖动的物体距离其他物体的面、顶点、圆周 6 px（屏幕）以内时吸到“刚好接触”的位置（面贴面、点贴面、圆与面相切、圆与圆相切），离开 14 px 才脱开，形成“阻尼”手感，并显示参考线和接触点；连接点吸到物体中心、顶点和滑轮切点；旋转在 0°、90° 或附近表面的倾角附近吸附。网格吸附改为可选（默认关）；按住 Alt 临时关闭全部吸附。
- 数值框：拖动标签连续调节（Shift 细调 ×0.1，Ctrl 粗调 ×10），滚轮调节，输入值不取整。

### U6 新图标（D48）

- 主题为“抽象物理轨迹”：一条抛物线与沿轨迹等时间间隔的频闪点，深色渐变圆角方形。矢量源 `assets/icon.svg`（小尺寸版 `icon-small.svg`），桌面图标、安装包、窗口、任务栏、网页图标和界面标志同源。

### 场与阻力（D50）

- 重力为任意方向的向量（“场景”页以大小 + 方向编辑，一键恢复竖直向下）。
- 万有引力：场景开关与引力常量 G（真实值 6.674 × 10⁻¹¹，或教学用 G = 1），作用在每一对有质量的物体之间，静态物体（如恒星）只吸引不运动；引力势能计入能量账本。两物体包围圆重叠时力在圆内线性减小，避免奇点。
- 空气阻力：每个物体可设线性系数 b 与二次系数 c，F = −(b + c|v|)v；耗散计入账本。属性面板显示终端速度。

### 新连接件（D51）

- 焊接（固定连接）、滑轨（平移副，不限位）、马达（恒转速或恒力矩）、齿轮 / 皮带传动比、非线性弹簧（F = −kx − k₃x³）、阻尼器。左侧工具栏、属性面板、画布绘制、受力显示、监视量和报告都已支持；马达做功计入账本的“电机与传送带做功”。

### 多点同时摩擦碰撞（D37）

- 26.50 中多个接触点同时碰撞时不计摩擦冲量（有警告）。现在按冲量层的线性互补问题求解：枚举法向接触集合与每个摩擦接触点的切向状态（黏着、顺滑、逆滑），检验全部互补条件和“动能不增加”，依次尝试牛顿碰撞律、泊松碰撞律（压缩阶段 + 恢复冲量）、完全非弹性；都不可行时才退回光滑冲量并警告。
- 方块带水平速度平落到粗糙地面（两点同时）的结果左右对称；随机 10,000 次多点碰撞动能都不增加、碰后没有接触点仍在接近（`tests/multiFriction.test.ts`）。另外，按牛顿律多点同时反弹会使动能增加的少见情形，改按完全非弹性处理并提示。

### 从此刻分支（D52）

- 暂停在任意时刻，点时间线上的“从此刻分支”：在该时刻的精确状态（位置、角度、速度、能量账本）上建立一个新场景，修改任何物体、连接件或参数（位置、速度、质量、μ、力、加减连接件……）后从此刻继续计算。原记录保留：时间线上的下拉框可在“主线”和各分支之间切换，分支点在时间线上有标记；曲线面板可用虚线叠加父分支的同一物理量。
- 分支保存在场景文件中（`branches`），每个分支都是完整的场景（初始条件 = 分支时刻的状态，`settings.startTime`、`settings.startLedger`），可以单独从头重算并得到相同指纹。分支中的时间按绝对时间显示（时间线、曲线、事件、读数、CSV）。

### 自定义量

- “监视”页 › 自定义量：用表达式定义新的量，如 `ek(物块) + ep(物块)`、`x(B) - x(A)`、`N(物块, 斜面)`、`E - Ek`，可写物体或连接件的名称或 id，系统量 t、E、Ek、Ep、Es、Px、Py、g，函数 sqrt、abs、sin、min、if 等。输入时检查量纲并给出单位，错误时说明原因。自定义量与内置量一样可监视、作图、导出 CSV、参数扫描和预测，保存在场景文件中（`customQuantities`）。

### 26.50 遗留（全部完成）

1. 被释放的帧块改在后台的重算线程中用 Rust（WebAssembly）重算，播放和曲线需要之前就预取，界面只接收并核对结果；尚未到达时仍在界面线程中同步重算。
2. 数字的小数点可选“点”“德文界面用逗号”“逗号”（设置 › 单位与数值，输入框两种都接受）；导出（报告、课件、视频叠字、CSV 表头）可单独选择语言。
3. “到达滑轮”事件：物块或绳端被拉到滑轮处（两者间的绳长 1 mm）时作为事件精确定位，计算在此停止并说明原因，取代 26.50 中的“步长过小”。
4. 渐近静止：不限时长的运行中，所有速度与加速度持续 1 s 低于 10⁻⁶ 时按“近似静止”停止，指纹旁注明。
5. 发布构建增加 WebView2 中的引擎自检：构建后的桌面程序以 `--selftest` 启动，在真实 WebView2 中把每个模板用 Rust（WebAssembly）和 TypeScript 各算一遍、比较指纹，结果写入发布证据包。

## 兼容性

- 场景文件格式升为 4（新增连接件、`settings.gravitation`、物体的 `drag`、`branches`、`settings.startTime` / `startLedger`、`customQuantities`）；格式 1–3 打开时只补默认值。格式 4 的文件不保证能在 26.50 中打开。
- 有限时长下，26.48、26.49 的模板与手工场景指纹保持不变，唯一的例外是阿特伍德机：轻物块在 t ≈ 0.958 s 到达滑轮后计算停止（26.48 起物块会穿过滑轮继续算）；到达之前的帧与 26.48 逐位相同。新指纹 `c9210c01363e…`。
- 不限时长下，物体最终静止于摩擦（如板块模型、两物块与弹簧）或阻尼振动的场景现在会在近似静止后停止。
- Rust 与 TypeScript 两个引擎都实现了本版全部新物理，逐位一致（D49）。旧版本编译的 WebAssembly 会被识别为过旧并退回 TypeScript 引擎。

## 实测结果（容器 Linux，Node 22.22，Chromium 141，rustc 1.92）

| 检查 | 结果 |
| --- | --- |
| 自动测试 | 52 个文件 600 项（26.50：463 项）；类型检查、网页构建通过；引擎测试使用 Windows 上构建的 WebAssembly（SHA-256 `cc116621…2192a06986`） |
| Rust 与 TypeScript 逐位一致 | `scripts/parity.mjs`：811 个场景（31 个模板有限时长与不限时长 60 s、黄金与特殊场景、300 个随机场景、200 个含本版新物理的随机场景、150 个多点碰撞场景、91 个分支），1,649,976 帧、52,212 个事件、3,250 个检查点，0 处不一致；覆盖万有引力、阻力、五种新连接件、多点摩擦碰撞（205 个场景）、分支（改 μ、改速度、改质量、不改） |
| 多点摩擦碰撞 | 随机 10,000 次（平落、墙角、不同 μ 与 e）：动能全部不增加，碰后无接近中的接触点；需要警告的不到 2% |
| 分支 | 6 个模板在 1/3 处分支、不作修改：之后的状态与父分支相差 ≤ 10⁻⁶（相对），能量账本连续；保存后重新打开，分支场景重算指纹相同 |
| 自定义量 | 与其组成的内置量逐帧相等（同一表达式求值）；单位推断与错误提示 7 项测试 |
| 手册 | 156 条公式全部有条目、推导与示例，每个示例在其模板中的指定时刻仍出现该公式 |
| 速度 | 14 个原有模板（原时长，5 次中位数）：TypeScript 306 ms，Rust（WebAssembly）97 ms（3.2 倍）；不限时长 300 s：单摆 WASM 682 × 实时，板块模型 13,380 ×，弹簧振子 334 ×，竖直面圆周（杆）381 × |

## Windows 检查

在维护者的 Windows x64 电脑上用 `scripts\release.cmd` 构建：Rust 测试通过；WebAssembly 在 Windows 上重新构建（702,868 字节）；类型检查与全部测试通过；**WebView2 自检**：31 个模板在 WebView2（Edg/143）中用 Rust（WebAssembly）与 TypeScript 各算一遍，指纹全部相同。

实机检查（分支与父分支叠加、自定义量、知识难度与课程体系切换、学习手册与打开示例、行星与齿轮模板、阿特伍德机的“到达滑轮”、导出语言、无极拖动与贴合、新图标）发现 6 个问题，已在发布前修正并重新构建：

1. 桌面窗口标题仍是“Verity 26.50”，网页版标题仍是“Verity 26.49”。新增版本一致性测试。
2. 桌面版的确认对话框不等待回答（对话框插件的 `confirm` 是异步的）：有未保存修改时新建、打开、用模板替换会直接执行，“取消”无效；删除分支、清除日志、恢复默认设置同样不等确认。此前的桌面版也有此问题。全部改为等待回答。
3. 设置 › 知识与公式中各级别的说明没有左对齐。
4. 没有均匀重力的场景（行星）中加速度箭头过长：比例改为同时考虑万有引力加速度，过长的加速度箭头与力一样缩短并注明。
5. 导出语言与界面不同时，报告中的积分方法、物体类型、关键时刻说明与情形标题仍是界面语言。
6. 模板库搜索后右侧仍显示未列出的模板；新分组的顺序与图标。

详见 `docs/reports/26.51-windows-hand-check.md`。

## 已知限制

- 分支的时间线从分支时刻开始（显示绝对时间），不把父分支 [0, t] 的记录拼接进来；叠加的父分支曲线在界面线程中用 TypeScript 重新计算（结果缓存）。
- 多点摩擦碰撞最多 8 个摩擦接触点；更多时按光滑冲量计算并警告。滑轨不限位、马达无力矩上限、链节绳、凹形与复合体、切割、辛积分、原生桌面引擎、自定义公式卡、触屏与交互白板、无障碍、题目模式、分享、教学表示与插件接口顺延到 26.52。
- 万有引力在两物体包围圆重叠时被软化（线性减小），碰撞与接触仍按形状精确处理。
- 拖动时把物体明显压进另一个物体（法向超过 14 px 的脱开距离）会留在重叠位置，运行时提示“初始深度重叠”并可能改用时间步进；沿表面拖动时保持贴合。
- 网页版只在 Chromium 内核浏览器上验证过；不能直接双击 `index.html`（需 HTTP 服务器）。

## 文件

| 文件 | 说明 |
| --- | --- |
| `Verity-v26.51-windows-x64-setup.exe` | Windows 安装程序（当前用户安装，需要 WebView2，缺失时自动下载） |
| `Verity-v26.51-windows-x64-portable.exe` | 便携版，直接运行 |
| `Verity-v26.51-web.zip` | 网页版静态文件，部署见包内 `HOSTING.md` |
| `Verity-v26.51-source.zip` | 源码（工作区快照，不含依赖与构建产物） |
| `Verity-v26.51-release-evidence.zip` | 构建日志、测试报告、WebView2 自检、对照记录、阶段报告、检查记录 |
| `THIRD_PARTY_NOTICES.md` | 第三方组件与许可证全文 |
| `SHA256SUMS.txt` | 校验和 |

本版没有任何 Git 提交、暂存、标签或推送，所有改动留在工作区由维护者手动提交。

---

## English summary

Verity 26.51 organises the formulas by the user's level and gives the editor more freedom. **Knowledge levels:** choose the Chinese curriculum (lower secondary, upper secondary, university, beyond) or IB (MYP, DP SL, DP HL, university, beyond); every formula carries both tags, cards show their level, and formulas above the chosen level fold into one line (display only: nothing is recomputed). **Worked solutions** follow the textbook format Given / Find / Solution / Answer with colour-matched symbols and values. **156 formulas** (47 new, each with a trilingual derivation and worked solution) and 10 new templates. **Learning handbook** in the settings: nine topics with principles, every formula with symbols, conditions, derivation, level and a one-click example. **Stepless editing:** no grid by default; objects snap only when they come close to other objects (enter at 6 px, release at 14 px, guides shown, Alt disables snapping); number fields can be scrubbed. **New icon** (a strobed trajectory). Physics: gravity in any direction, gravitation between bodies, linear and quadratic air drag, welds, sliders, motors, gears/belts, cubic springs and dampers; simultaneous frictional impacts at several points (Newton, Poisson or plastic, never adding energy); **branching** from any moment with changes, kept beside the original run and overlaid in the charts; custom expression quantities. The five open items of 26.50 are done: chunk recomputation in a background worker, decimal comma and a separate export language, a "reaches the pulley" event, stopping at approximate rest, and an engine self-check inside WebView2 in every release build. Both engines (Rust/WebAssembly and TypeScript) implement everything bit-identically (811 scenes, 0 mismatches). Scene files move to format 4. Found in the Windows check and fixed: confirmation dialogs in the desktop app did not wait for the answer (Cancel had no effect, also in earlier desktop versions); window and page titles; exports in another language kept some interface-language labels; acceleration arrows in scenes without uniform gravity.

## Deutsche Zusammenfassung

Verity 26.51 ordnet die Formeln nach dem Kenntnisstand und macht das Bearbeiten freier. **Kenntnisstufen:** chinesischer Lehrplan (Sekundarstufe I, Sekundarstufe II, Universität, darüber hinaus) oder IB (MYP, DP SL, DP HL, Universität, darüber hinaus); jede Formel trägt beide Stufen, Karten zeigen sie an, Formeln oberhalb der gewählten Stufe werden zu einer Zeile zusammengeklappt (nur Anzeige, keine Neuberechnung). **Lösungswege** im Schulbuchformat Gegeben / Gesucht / Lösung / Antwort mit farblich zugeordneten Größen. **156 Formeln** (47 neue, jede mit dreisprachiger Herleitung und Lösungsweg) und 10 neue Vorlagen. **Lernhandbuch** in den Einstellungen: neun Themen mit Prinzipien, jede Formel mit Symbolen, Voraussetzungen, Herleitung, Stufe und einem Beispiel per Klick. **Stufenloses Bearbeiten:** standardmäßig ohne Raster; Objekte rasten nur nahe an anderen Objekten ein (Einrasten bei 6 px, Lösen bei 14 px, Hilfslinien, Alt schaltet ab); Zahlenfelder lassen sich ziehen. **Neues Symbol** (eine stroboskopische Bahn). Physik: Schwerkraft in beliebiger Richtung, Gravitation zwischen Körpern, lineare und quadratische Luftreibung, Schweißverbindungen, Schienen, Motoren, Zahnräder/Riemen, kubische Federn und Dämpfer; gleichzeitige Reibungsstöße an mehreren Punkten (Newton, Poisson oder vollständig unelastisch, ohne Energiezuwachs); **Verzweigen** zu jedem Zeitpunkt mit Änderungen, neben dem ursprünglichen Lauf erhalten und in den Kurven überlagert; eigene Größen per Ausdruck. Die fünf offenen Punkte von 26.50 sind erledigt: Neuberechnung im Hintergrund, Dezimalkomma und eigene Exportsprache, Ereignis „erreicht die Rolle“, Ende bei annähernder Ruhe und ein Selbsttest der Engine in WebView2 bei jedem Release-Build. Beide Engines (Rust/WebAssembly und TypeScript) setzen alles bitgleich um (811 Szenen, 0 Abweichungen). Szenendateien wechseln zu Format 4. Bei der Prüfung unter Windows gefunden und behoben: Bestätigungsdialoge der Desktop-App warteten nicht auf die Antwort („Abbrechen“ blieb wirkungslos, auch in früheren Desktop-Versionen); Fenster- und Seitentitel; Exporte in einer anderen Sprache enthielten noch einige Texte der Oberflächensprache; Beschleunigungspfeile in Szenen ohne homogene Schwerkraft.
