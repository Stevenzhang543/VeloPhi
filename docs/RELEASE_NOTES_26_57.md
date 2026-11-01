# VeloΦ（VeloPhi）26.57 发布说明

文档日期：2026-10-31 · 版本 26.57.0

26.57 依据维护者提供的《VeloPhi 升级手册》（2026-10-31）开发，基线 26.56.0（提交 87f2058），决策 D110–D125（`docs/DEV_MANUAL_26_57.md`）。目标是解决四件事：界面杂乱、公式可信度不足、教学演示不够好用、导入例题后不清楚所求目标。本版先在 26.56 中重拍任务书的三张截图并复现图 A 的读数（N = 16.97 N、f = 3.395 N、a = 3.203 m/s² 与闭式一致，读数本身没有错），再围绕“所求目标”重组任务、结果与界面。覆盖记录由仓库数据生成（`docs/coverage/COVERAGE_26_57.md`）。英文、德文摘要见文末。

## 本版内容

### 任务与结果（P0）

- **任务合同（D110）**：一道题是对象、已知量（每个值写明来源：题干、场景、手动、默认值……，冲突的值并列等待选择）、假设、条件与所求。所求不再是一个符号，而是“哪个对象的什么量、在哪个参考系、取哪个分量、在什么时刻”——例如“物块沿斜面移动 2 m 时（第一次）的速率，地面参考系”。结果带任务修订号、内容哈希、引擎与模型版本、常数集、条件状态、来源与独立核对。
- **旧结果不会冒充新结果（D113）**：每次求解都核对任务的修订号与内容；修改条件或任务所在的场景后，旧结果标为“旧结果”只供比较；晚到的旧请求被丢弃。
- **任务面板（D114）**：右侧新增“任务”页签——粘贴题目、手动填写、示例题，或“从当前场景”列出可求的量（不替你选）。先显示“理解摘要”：对象、坐标与正方向、已知量及来源、所求、条件与假设；缺项、歧义或冲突时先问最少的问题，并给出可直接采用的选项。结果卡片用文字说明计算状态与条件状态，展开后列出独立核对（差值与容差）和全部解（两次经过同一高度时两个根都列出，并说明按什么条件选取）。题干中未用到的数值可以点选后连接到已知量，单位不符时会被阻止并说明原因。
- **变量来源（D111）**：公式卡片的每个已知量标明来源——给定、常数、初态、时刻、仿真、派生，由计算核心写明，不再从文字推断。
- **斜面新模板（D112）**：“斜面：静摩擦与动摩擦”分开 μs 与 μk，初速度可沿斜面向上；六个预设（下滑、静止、上滑后下滑、上滑后静止、临界、光滑）。静止时摩擦力等于所需值 mg sinθ，不是上限 μsN；上滑到速度为零后重新判断分支。旧的斜面模板不变。

### 解题与教学（P1）

- **文字题（D115）**：读中文题干中的数值与单位、对象和问句；默认值（未给 g 时 9.8 m/s²、未给内阻时理想电源等）写明来源。240 条人工标注的评测（165 条开发、75 条冻结盲测）按任务书的八项分别报告，见下文。
- **六个代表任务（D116）**：斜面、斜抛、一维碰撞、有内阻的直流电路、凸透镜成像、两个点电荷的电场。每个都有解析步骤与独立核对（刚体仿真、另一解析途径、守恒检查、节点电压法、光线追迹、电势的数值梯度），可打开演示（带入题目数值；力学题可在画面中定位结果时刻）、练习（新增斜抛、碰撞、透镜、电场四个学习活动）与只改一个条件的迁移题。
- **统一比较（D117）**：题目、学习活动与预测改为经同一个比较服务，保留各自原来的容差；作答的单位先换算（72 km/h 与 20 m/s 是同一答案），大小对而符号反的记为方向错误。
- **工作方式（D118）**：顶栏的“学习 / 解题 / 实验 / 编辑”切换显示预设（右侧页签、底部页签、工具栏与叠层），不改动场景、选择、播放时刻和任务；在某一方式中的改动单独记住，“↺”恢复。任务演示时，公式面板先列与任务有关的情形，其余收进“更多分析”；曲线有“任务”预设。
- **教学包（D122）**：第一批 24 个教学包（匀速与参考系、匀变速、自由落体、斜抛、两绳悬挂、粗糙斜面、静摩擦阈值、阿特伍德机、动滑轮、板块、传送带、弹簧、两种碰撞、杠杆、竖直圆周、单摆、库仑力、电场线、电势、电容器、串并联、平面镜、薄透镜）：标准 / 边界 / 对比预设、讲解、练习与常见错误。进度由内容计算，分“可发现、可运行、可解释、可练习、可迁移、已试用”六项；8 个包前五项全满足，没有一个声称已试用。模型页增加“看演示 / 做练习 / 自由实验”，模型目录可只看有教学包的，全局搜索（Ctrl+K）可按目标词找内容（“射程”“摩擦功”“第一次到达”）。

### 界面与画布

- **阅读（D120）**：默认正文 14 px、常用按钮 32 px；“设置 › 阅读密度”可选紧凑（26.56 的尺寸）或课堂投影。右侧与底部的阅读面板在半透明效果下也保持不透明底色。新的三态父复选框（部分选中显示为 mixed）与就地展开的叠卡。
- **画布（D119）**：同一接触面的多个接触点默认合成一个支持力（标“n 处接触合计”），可在“显示”中改为逐点画出，两者不会同时出现；数值标签避开物体与名称，必要时加引线。
- **时间与量（D121）**：只保留一个播放时刻；计算进度写“已计算至 … s”；“停止计算”与“暂停播放”文字区分；监视量与曲线写明参考系与正方向（“地面参考系中的分量，x 轴向右为正”“大小，不带方向”“沿斜面向下为正”）。
- **电场实验（D121）**：“看方向 / 看等势 / 探针测量”三个观察预设；探针 A、B 与电势差、电场力做功；试探电荷的受力（负电荷受力与场强反向）；“怎样读这张图”说明场线不是轨迹、疏密只定性。
- **停靠与转场（D123、D124）**：结果卡片可经菜单或拖动固定到任务面板顶部或画面右上角，可撤销；切换工作方式与主题时有约 320 ms 的圆形扩散，减弱动态效果或系统不支持时直接切换。数值框只在按住 Alt 时响应滚轮，滚动面板不会误改参数。
- **学习记录（D125）**：作答记录带教学内容版本；学习路径按最近一次作答中的薄弱维度给出复习建议。

### 修复的遗留问题

- 衰变链中两个寿命近乎相等时，三种核素的总数此前只守恒到约 10⁻¹⁰；改为没有相消的计算后守恒到 10⁻¹³。
- 变量定位（悬停公式变量时画布强调对应的物体与力）有了自动测试。
- 导出、模板、题目、受力分析图、纸带、参数扫描、实验报告、课件、关于九个对话框也有焦点陷阱：Tab 不离开对话框，Escape 关闭，关闭后焦点返回。
- 参数化题的校验消息与抽取被拒的原因全部有中文、英文、德文文字。
- 本版检查中发现并修正：可动斜面场景曾被当作固定斜面题；新模板的初速度 −0 使保存再读入后的记录指纹改变；Windows 走查中的八处界面问题（画面时刻与时间轴位数不同、固定的结果显示在无关场景上、打开另一个场景使上一道题的结果被误标为过期、斜抛演示中小球飞出地面、求解后结果不在视野内、搜索词未收录等，见 `docs/reports/26.57-windows-hand-check.md`）。

## 题意识别评测（任务书 §14.2）

| 指标 | 开发 165 条 | 盲测 75 条（首次运行） |
| --- | --- | --- |
| 题型与范围 | 165/165 | 75/75 |
| 对象绑定 | 42/42 | 18/18 |
| 已知量与单位（虚报） | 359/359（0） | 158/158（0） |
| 所求完整匹配 | 84/84 | 36/36 |
| 应澄清的召回 | 60/60 | 26/30（87 %） |
| 有歧义却静默给出结果（发布阻断） | 0 | 2 |
| 直出正确 / 直出覆盖 | 84/84 · 84/84 | 36/36 · 36/36 |

盲测首次运行发现的 2 条静默输出中，1 条是解析缺陷（第二个点电荷没有电荷量却直接求出场强），已修正，另有 2 条电场题的状态不当（应判“无解”）也已修正；另 1 条复核为标注错误（上滑的最大距离只取决于 μk）。修正后盲测为 29/30、静默 1/30（复核后 0/29），但这已不是盲测结果；下一版需要新的盲测集。只支持文字题，图片题本版不读。样本小、区间宽，不能说明任意输入的可靠性。详见 `docs/reports/26.57-task-eval.md`。

## 覆盖记录

| 项 | 已验证 | 人工检查 | 部分 | 暂缓 |
| --- | --- | --- | --- | --- |
| 任务书 VP-01–VP-18 | 9 | 3 | 3 | 3 |
| 必测案例 T01–T32 | 26 | 3 | 2 | 1 |

26.56 需求状态的变化：FOR03、FOR09、UX06、UX08 改为已验证；EDU12、UX13 仍为部分实现。模型注册（180 个模型族）的状态与成熟度不变。

## 兼容

- 场景文件格式不变；77 个旧模板在默认参数下的记录与 26.56 逐位相同。
- 设置新增阅读密度与“各接触点分别画出”，旧设置自动补默认值；默认字号比 26.56 大，可选“紧凑”恢复。
- 新的任务文件格式（velophi-task，schema 2）。学习记录增加可选的内容版本字段，旧记录照常读取。

## 验证

- 类型检查通过；前端与核心测试 86 个文件 1848 项全部通过（容器 Node-API 核心），Windows 发布构建的 WebAssembly 核心上 1832 项通过、16 项原生协议测试跳过；Rust 测试全部通过。
- 计算对照（TypeScript 参照与原生 Rust）：400 次运行、53 618 个请求，0 处不同；求解器逐帧对照 523 个场景、1 964 108 帧，0 处不同；77 个旧模板的记录指纹与 26.56 相同。
- WebView2 中原生 Rust 与 WebAssembly 的全部 78 个模板一致；26.56 计算的原生与 WebAssembly 摘要相同。
- 在 Windows 便携版中走查任务面板、六个代表任务中的三个（斜面、斜抛、电场）、工作方式、画布、监视页、教学包、阅读密度与对话框；走查中发现的八处问题修正后重新构建并复查（共三次构建），截图见 `docs/reports/26.57-windows-hand-check.md`。

## 已知限制

- 没有学生与教师试用，不声称学习效果，也不标 L4；24 个教学包中 16 个缺少练习角色或迁移题。
- 图片题识别、第二批与第三批教学包暂缓。文字题只支持中文题干。
- 方程变量与目标之间的语义连线没有做；触屏、触控板与色盲模拟没有设备或没有做，只做了键盘与鼠标的人工检查。
- 刚体场景的库仑常数仍为 CODATA 2018（保留旧模板指纹）；74 个 L1 模型族只有受限解析计算，通用 PDE 求解器暂缓。

---

## English summary

26.57 organises VeloPhi around the asked target (upgrade manual of 2026-10-31, baseline 26.56.0). A task now has typed quantity references (object, quantity, frame, component) and evaluation points (time, either side of an event, first or every crossing of a condition, interval extremes, steady state); results carry the task revision and content hash, so a late answer to an old question is never shown as current. A new Task tab reads a Chinese problem text, a hand-filled task or the current scene, asks only the clarifications that change the answer, and shows result cards with frame, evaluation point, condition state, provenance and independent checks. Six representative tasks (incline, projectile, 1D collision, DC circuit, thin lens, point-charge field) each have analysis, an independent check, a demonstration, practice and a transfer question. A new incline template separates μs and μk; problems, activities and predictions compare through one service; four work modes (learn, solve, experiment, edit); contact forces are summed once on the canvas and labels avoid bodies; formula variables show their source; 24 teaching packages with computed progress. The 240-case understanding set is reported per measure, development and frozen holdout apart (the holdout's first run found two silent outputs; fixed, and reported as no longer blind). No learner trials yet.

## Deutsche Zusammenfassung

26.57 richtet VeloPhi an der gesuchten Größe aus (Upgrade-Handbuch vom 31.10.2026, Basis 26.56.0). Aufgaben haben typisierte Größenbezüge (Objekt, Größe, Bezugssystem, Komponente) und Auswertungspunkte (Zeitpunkt, vor oder nach einem Ereignis, erstes oder jedes Erreichen einer Bedingung, Extremwerte, stationär); Ergebnisse tragen Revision und Inhaltsprüfsumme der Aufgabe, sodass eine verspätete Antwort auf eine alte Frage nie als aktuell erscheint. Der neue Bereich „Aufgabe“ liest einen chinesischen Aufgabentext, eine von Hand ausgefüllte Aufgabe oder die aktuelle Szene, stellt nur die Rückfragen, die das Ergebnis ändern, und zeigt Ergebniskarten mit Bezugssystem, Auswertungspunkt, Bedingungszustand, Herkunft und unabhängigen Prüfungen. Sechs Musteraufgaben (schiefe Ebene, Wurf, 1D-Stoß, Gleichstromkreis, dünne Linse, Feld von Punktladungen) mit Analyse, Prüfung, Vorführung, Übung und Transfer. Neue Vorlage mit getrennten μs und μk; ein gemeinsamer Vergleichsdienst für Aufgaben, Aktivitäten und Vorhersagen; vier Arbeitsweisen; Kontaktkräfte werden einmal summiert gezeichnet, Beschriftungen weichen Körpern aus; Formelvariablen zeigen ihre Herkunft; 24 Lernpakete mit berechnetem Stand. Noch keine Erprobung mit Lernenden.
