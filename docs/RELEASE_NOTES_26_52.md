# VeloΦ（VeloPhi）26.52 发布说明

文档日期：2026-10-26 · 版本 26.52.0

**VeloPhi**（艺术字 VeloΦ，读作 “VEE-lo-fai”）就是此前的 Verity：面向物理专业学生、物理老师和爱好者的二维力学仿真与教学引擎。旧名与一个流行游戏模组重名，本版起全面改名，旧文件与设置自动兼容。26.52 按 `DEV_MANUAL_26_52.md` 和维护者在 26.51 发布后提出的七项要求（V1–V7）开发：**新身份**（名称、Φ 图标、从中心扩散的开场动画、启动不再闪白）；**更整洁的界面**（按任务分组、可折叠并记住状态，动效与反馈）；**物理补全**（滑轨限位、马达力矩上限、滚动阻力、有心力、辛积分、凹形与复合体、切割与组合）；**教学模块**（受力分析图、打点计时器纸带、v–t 图面积、题目模式与 30 道内置题）。英文、德文摘要见文末。

## 本版内容

### V1 启动与开场动画（D54）

- 桌面窗口在页面画好第一帧之前保持隐藏，背景色与开场底色相同：不再先出现小白框再跳成黑屏。
- 开场为纯 CSS（不依赖脚本和字体）：深色底上居中的 Φ 标志；界面就绪后从屏幕中心以圆形快速扩散铺满（420 ms），Φ 同时放大淡出。系统“减少动态效果”或设置中关闭动画时改为短暂淡入。网页版相同。

### V2 改名 VeloPhi（D53）

- 程序、窗口、安装包、文件名、界面、三语文字、文档一律改为 VeloPhi；展示场合（窗口标题、左上角字标、开场、关于页、图标、报告与课件页脚）用 VeloΦ，Φ 着强调色。
- 兼容：`verity-scene` 格式的场景文件照常打开（两个引擎都接受），保存时写新标识 `velophi-scene`；本机设置与试用日志首次启动时从旧键迁移（旧键保留）；桌面版 WebView2 的本地数据从旧目录复制一次。旧发布与 26.51 及以前的文档保持原名。
- Rust 引擎改名为 `velophi-core` / `velophi-wasm` / `velophi-cli`，WebAssembly 为 `src/engine/velophi_core.wasm`。

### V3 Φ 图标（D55）

- 与 26.51 图标同一风格（深色渐变圆角方形、白色轨迹细线、频闪小球、最后一颗高亮），轨迹改为 Φ：圆环上等时间间隔的频闪点（匀速圆周运动）与穿过圆心的竖线上间距按 1 : 3 : 5 : 7 递增的频闪点（自由落体）。16 px 时只保留圆与竖线。

### V4 分区折叠（D56）

- 新的 `Section` 组件：每个面板按任务分组，组标题可折叠，折叠状态按“面板/分组”保存，重启后保持；展开/折叠带高度动画。
- 顶栏：文件菜单（新建、打开、保存、另存为）；页面切换、模板、**题目**、**教学**菜单、撤销/重做；计算按钮；显示、扫描、输出、主题、关于。窄窗口时次要按钮只显示图标。
- 左侧工具：常用 / 物体与形状 / 环境与场 / 连接件与外力 / 测量与标注，吸附开关收进底部；工具栏可收成 56 px 的图标栏。右侧属性：基本、位置与运动、质量与转动、材料、阻力、高级（默认折叠）。场景页、监视页、设置页同样分组。

### V5 动效与反馈（D57）

- 统一的动效令牌（90 / 160 / 240 ms，弹性缓动），只动 transform、opacity、clip-path，不掉帧。按钮按下微缩，页签与分段控件的选中块滑动，对话框与菜单缩放淡入，提示从底部滑入，数值框连续调节碰到上下限时向边界轻推一下。
- 画布：悬停虚线描边、选中实线描边带柔和光晕；吸附时参考线与接触点闪一下；**把物体拖进另一个物体时沿接触面滑动**，不再陷进去（26.51 的已知限制）；时间线拖动时滑块放大并显示时间气泡。
- 全部遵循“减少动态效果”。

### V6 物理补全（两个引擎逐位一致）

- **滑轨限位（D58）**：滑轨可设下限、上限（沿轴的相对位移）与限位恢复系数 e。到达限位作为事件精确定位，带速度时按 e 反弹（动能不增加）；压在限位上时限位给出向内的支持力（画布与受力分析图中标为 F限）。
- **马达力矩上限（D58）**：恒转速马达可设最大力矩；所需力矩超过上限时“打滑”，以最大力矩驱动，转速回到设定值时重新锁定；打滑与锁定都是精确定位的事件。
- **滚动阻力（D59）**：材料与接触对新增滚动阻力系数 C_rr。圆形物体滚动时受阻力偶 M = C_rr·N·r，转速减到 0 时进入“滚动静止”（所需力偶不超过上限时保持）；耗散计入摩擦生热。
- **有心力（D60）**：新工具“有心力”：中心可固定在空间中或随某个物体运动，作用于全部或指定的运动物体，F = k·rⁿ（预设：弹性中心力 n = 1、平方反比 n = −2、大小恒定 n = 0，可自定指数），势能计入机械能。斥力把物体在有限时间内推到无穷远时，计算以“运动状态不再是有限值”停止并说明原因。
- **Gauss–Legendre 辛积分（D61）**：积分方法新增两级四阶隐式辛方法（定步长），守恒系统长时间计算时能量只在很小范围内起伏、不漂移；事件照常精确定位。
- **凹形与复合体（D35）**：多边形可以是凹多边形（边不能相交）；新形状“复合体”由若干圆、矩形、多边形组成，是一个刚体（质量按面积分配，质心与转动惯量按平行轴定理合成）。碰撞时按确定性的凸分解处理，一对物体可在法向不同的几处同时接触（小球落进 V 形槽会同时贴住两个面）。凸多边形仍走原来的代码，旧场景结果逐位不变。
- **切割与组合**：“切割”工具沿画出的直线把矩形、多边形（含凹多边形）切成几块，质量按面积分配、速度取切割处的刚体速度、连接件交给所在的那一块；“组合”工具把几个物体合成一个复合体；复合体可在属性面板中“拆分为独立物体”。都可撤销。物体吸附支持凹形与复合体。
- 新模板 4 个（共 35 个）：弹性中心力、滑轨限位、滚动阻力、V 形槽中的小球。

### V6 教学模块

- **受力分析图（D62）**：“教学 › 受力分析图”对所选物体在当前时刻画隔离体图：力按教材顺序（重力、支持力、摩擦力、拉力、弹力、阻力、引力、其他），符号 G、N、f、T、F弹 …；可选实际作用点或共点力、物体画成形状或质点、标出大小、沿坐标轴或沿接触面分解（虚线分量）、画出合力。数据与画布上的力箭头同源；同一接触面的几个接触点合成一个支持力；求解器中没有单独列出的约束力（齿轮、滑轮上的绳等）画成“F其他”，图中各力之和总等于 m·a，并给出核对。导出 SVG、PNG；实验报告可加入“受力分析图”。
- **打点计时器纸带（D63）**：选择物体、记录方式（路程或沿 x / y 的位移）、打点周期（默认 50 Hz）、计数间隔（默认每 5 个点，T = 0.1 s）、起点与段数；点位由记录的精确状态生成。列出 x₁…xₙ、vₙ = (xₙ + xₙ₊₁)/(2T) 与仿真速度、逐差法加速度与仿真平均加速度。导出 PNG、SVG、CSV。
- **v–t 图面积（D64）**：在曲线上按住 Shift 拖选一段：曲线与时间轴之间的面积着色（正负不同色），给出面积（复合 Simpson）并与直接读数对照（vₓ → Δx、aₓ → Δvₓ、ω → Δθ …）。
- **题目模式与题目包（D40）**：“题目”按教材章节列出 30 道内置题（匀变速直线运动、相互作用、牛顿运动定律、抛体、圆周运动、万有引力、机械能、动量、振动、转动）。作答时画面停在 t = 0，曲线、事件、读数与公式对照暂时隐藏；“揭晓答案”后播放并逐题判分（默认相对误差 2%），给出仿真答案、公式理论值、提示与解析。答案由仿真得出：改场景参数后答案随之改变，“换一组数据”随机换参数出新题。老师可“用当前场景出题”（数值题：某时刻、事件前后、运行结束时的量或最值、事件时刻、公式结果；选择题：固定答案或由仿真决定），导出 `.velophi-problem.json` 题目包，可导入。

## 兼容性

- 场景文件格式仍为 4，新增字段（滑轨 `limits`、马达 `maxTorque`、材料与接触对 `rolling`、连接件类型 `central`、积分方法 `gauss4`、形状 `compound`、凹多边形）只在使用时写入。旧版本打不开使用了新功能的文件。
- 不含新功能的场景（含 26.51 全部模板）在两个引擎中的结果与 26.51 逐位相同。
- 检查点格式升为 2（含限位、打滑与滚动状态）；由 26.51 编译的 WebAssembly 会被识别为过旧并退回 TypeScript 引擎。

## 实测结果（容器 Linux，Node 22.22，Chromium 141，rustc 1.92）

| 检查 | 结果 |
| --- | --- |
| 自动测试 | 57 个文件 671 项（26.51：600 项）；类型检查、网页构建通过；界面文字 2460 个键，三语齐全；引擎测试使用 Windows 上构建的 WebAssembly（SHA-256 `964e470a…a6808dedf4b660b47664209cd4be325656`） |
| Rust 与 TypeScript 逐位一致 | `scripts/parity.mjs`：1442 个场景（35 个模板有限时长与不限时长 60 s、黄金与特殊场景、500 个随机场景、300 个 26.51 新物理随机场景、300 个 26.52 新物理随机场景、150 个多点碰撞场景、115 个分支），2,354,320 帧、81,775 个事件、4,797 个检查点，0 处不一致。26.52 随机场景覆盖滑轨限位（62 次到达限位）、马达打滑与锁定（14 / 57）、滚动阻力（98）、有心力（170）、辛积分（46）、凹形物体（115）、复合体（54）、凹形地形（62）、一对物体多处接触（15）；1 个随机生成的自相交多边形被两个引擎同样拒绝 |
| 新物理的解析基准 | 限位反弹 v′ = −e·v、竖直滑轨压在下限上 F = mg；马达以 τmax/I 加速后锁定、超载打滑后重新锁定；圆盘滚动减速 (2/3)·C_rr·g、缓坡上 tanθ ≤ C_rr 时保持静止；弹性中心力周期 2π√(m/k)、平方反比圆轨道半径不变、动中心时两体动量守恒；辛积分单摆长时间能量有界；L 形块与复合体的质心和转动惯量（平行轴定理）、L 形块落地静止不穿透、V 形槽中小球同时贴住两个面 |
| 教学模块 | 受力分析图各力之和 = m·a（含“F其他”）；纸带逐差法加速度与仿真平均加速度一致；v–t 面积（Simpson）与位移读数一致；30 道内置题在默认与随机参数下都能从仿真读出答案，有公式卡片的题目理论值与仿真值相差 ≤ 2% |
| 速度 | 14 个原有模板（原时长，5 次中位数）：TypeScript 350 ms，Rust（WebAssembly）91 ms（3.9 倍）；不限时长 300 s：单摆 WASM 729 × 实时，板块模型 15,505 ×，弹簧振子 346 ×，竖直面圆周（杆）835 × |

## Windows 检查

在维护者的 Windows x64 电脑上（工作区本轮改名为 `E:\VeloPhi`）用 `scripts\release.cmd` 构建：Rust 测试通过；WebAssembly 在 Windows 上重新构建（789,125 字节，SHA-256 `964e470a…cd4be325656`）；类型检查与全部测试（57 个文件 671 项）通过；**WebView2 自检**：35 个模板在 WebView2（Edg/143）中用 Rust（WebAssembly）与 TypeScript 各算一遍，指纹全部相同（5.0 s）。

第一次构建的测试发现滑轨限位的一个物理问题并修正：滑块压在限位上时，事件阈值的滞回让它每次反弹多陷入 10⁻⁹ m、能量被一点点泵入，出现 408 个限位事件后退回 Moreau–Jean。两个引擎都改为限位远离时不加滞回（与接触相同），该模板现在 20 个事件后停在限位上。

实机检查（启动、改名与设置迁移、题目模式、受力分析图、纸带、v–t 面积、V 形槽模板、切割与组合、出题与题目包导出导入、含受力分析图的实验报告）发现 3 个问题，已在发布前修正并重新构建：

1. **桌面版公式卡片排版错乱**：开场动画的内联 `<style>` 让 Tauri 把它的哈希加进 CSP，`'unsafe-inline'` 随之失效，KaTeX 的内联样式全部被拦截（浏览器中正常，所以此前的检查没有发现）。开场样式改为独立的样式表，并让 Tauri 不改动 `style-src`；新增测试防止再次出现。
2. 几处英文译文借用了含义不同的旧键（题目的提示按钮显示 “Note”，受力分析图中 “Bodies”、小写的 “particle”“force”），改为新键。
3. 受力分析图：力表中理论上为 0 的分量显示为 0（不再显示 10⁻¹⁵ 量级的残差）；合力箭头与从质心出发的同向力重合时向旁边平移，不再被盖住。

详见 `docs/reports/26.52-windows-hand-check.md`。

## 已知限制

- 复合体各部分重叠时按重叠部分重复计入质量（均匀密度）；同一复合体内部不检测碰撞。切割不支持圆与复合体。
- 受力分析图的“F其他”不区分具体来源；课件包不自动加入受力分析图（可手动加入导出的 PNG）。
- 一个物体同时以两个法向不同的面接触另一个物体并静止时（小球停在 V 形槽底），两侧的静摩擦力是静不定的。目前可能给出两侧摩擦力等于 μN、互相“夹紧”的解：满足平衡与库仑定律，但不是教材的对称解（f = 0）。运动过程不受影响；26.53 改进。
- 题目答案与容差以仿真为准；手算取 g = 10 m/s² 时与题中 g 不同会带来约 2% 的差别。题目包为明文，不做防作弊。
- 分支的时间线仍从分支时刻开始；多点摩擦碰撞最多 8 个摩擦接触点。链节绳、原生桌面引擎、自定义公式卡、触屏与交互白板、无障碍、分享、插件接口顺延到 26.53。
- 网页版只在 Chromium 内核浏览器上验证过；不能直接双击 `index.html`（需 HTTP 服务器）。

## 文件

| 文件 | 说明 |
| --- | --- |
| `VeloPhi-v26.52-windows-x64-setup.exe` | Windows 安装程序（当前用户安装，需要 WebView2，缺失时自动下载） |
| `VeloPhi-v26.52-windows-x64-portable.exe` | 便携版，直接运行 |
| `VeloPhi-v26.52-web.zip` | 网页版静态文件，部署见包内 `HOSTING.md` |
| `VeloPhi-v26.52-source.zip` | 源码（工作区快照，不含依赖与构建产物） |
| `VeloPhi-v26.52-release-evidence.zip` | 构建日志、测试报告、WebView2 自检、对照记录、阶段报告、检查记录 |
| `THIRD_PARTY_NOTICES.md` | 第三方组件与许可证全文 |
| `SHA256SUMS.txt` | 校验和 |

本版没有任何 Git 提交、暂存、标签或推送，所有改动留在工作区由维护者手动提交。

---

## English summary

VeloPhi 26.52 is the first release under the new name: Verity is now **VeloPhi** (styled VeloΦ; the old name clashed with a popular game mod). Old scene files, settings and the desktop app's local data carry over. **Identity:** the desktop window stays hidden until the first frame is ready (no white flash), the opening expands from the centre of the screen, and the new icon draws Φ from strobed motion (uniform circular motion and free fall). **Interface:** panels are grouped by task in collapsible sections that remember their state, the top bar has File, Problems and Teaching menus, the tool palette can shrink to an icon rail, and one set of motion tokens gives every control immediate feedback; a body dragged into another now slides along its surface. **Physics** (bit-identical in the Rust/WebAssembly and TypeScript engines): slider end stops with restitution, torque-limited motors that slip and lock again, rolling resistance, central force fields F = k·rⁿ, a symplectic Gauss–Legendre integrator, concave polygons and compound bodies with contacts at several places, a cutting tool and combining bodies; four new templates (35 in all). **Teaching:** free-body diagrams (actual points or concurrent forces, components along the axes or the contact surface, resultant, SVG/PNG, report), ticker tapes (successive differences beside the simulation, PNG/CSV), the area under any chart curve by Shift-drag, and a problem mode with 30 built-in problems by textbook chapter whose answers come from the simulation — so “another set of numbers” always gives a correct new problem — plus problem files teachers can write and share.

## Deutsche Zusammenfassung

VeloPhi 26.52 ist die erste Version unter dem neuen Namen: Verity heißt jetzt **VeloPhi** (geschrieben VeloΦ; der alte Name kollidierte mit einer bekannten Spielmodifikation). Alte Szenendateien, Einstellungen und die lokalen Daten der Desktop-App werden übernommen. **Auftritt:** das Desktop-Fenster bleibt verborgen, bis das erste Bild fertig ist (kein weißes Aufblitzen), der Start öffnet sich vom Bildschirmmittelpunkt aus, und das neue Symbol zeichnet Φ aus stroboskopischen Bewegungen (gleichförmige Kreisbewegung und freier Fall). **Oberfläche:** Bereiche nach Aufgaben gegliedert, einklappbar und mit gemerktem Zustand, Menüs Datei, Aufgaben und Unterricht in der oberen Leiste, eine schmale Symbolleiste für die Werkzeuge und einheitliche Bewegungen mit sofortiger Rückmeldung; ein in einen anderen Körper gezogener Körper gleitet an dessen Oberfläche entlang. **Physik** (bitgleich in der Rust/WebAssembly- und der TypeScript-Engine): Anschläge an Schienen mit Stoßzahl, Motoren mit Höchstmoment, die rutschen und wieder einrasten, Rollwiderstand, Zentralkraftfelder F = k·rⁿ, ein symplektisches Gauß–Legendre-Verfahren, konkave Vielecke und zusammengesetzte Körper mit Kontakten an mehreren Stellen, ein Schneidewerkzeug und das Verbinden von Körpern; vier neue Vorlagen (35 insgesamt). **Unterricht:** Kräftepläne (tatsächliche Angriffspunkte oder im Schwerpunkt, Zerlegung längs der Achsen oder der Kontaktfläche, Resultierende, SVG/PNG, Bericht), Papierstreifen des Zeitmarkengebers (Differenzenverfahren neben der Simulation, PNG/CSV), die Fläche unter jeder Kurve per Umschalt+Ziehen und ein Aufgabenmodus mit 30 eingebauten Aufgaben nach Lehrbuchkapiteln, deren Antworten aus der Simulation stammen — „andere Zahlen“ ergeben so stets eine korrekte neue Aufgabe — sowie Aufgabendateien, die Lehrkräfte schreiben und weitergeben können.
