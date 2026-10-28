# VeloPhi 26.56 覆盖矩阵（实施后）

本文件由 `node scripts/coverage.mjs` 根据模型注册数据（src/content/models）、活动注册（src/teaching/activities）、独立参照（tests/fixtures/oracles2656.json）和需求状态（docs/coverage/requirements-26.56.json）生成；机器可读版本为 coverage-26.56.json。基线（26.55，提交 f71a4ff）见 COVERAGE_26_56_baseline.md。生成时检查每条证据引用都指向仓库中存在的测试（文件与测试名、Rust `#[test]` 函数、预言值用例数），状态与证据不一致时生成失败。

## 1 判定规则

- **已验证**：模型计算与独立参照（mpmath 另行实现，至少三组：基准、边界、极限或迁移）一致；成熟度 L2 及以上还必须有仿真或实验对独立参照（手写闭式、另一算法或注册模型的另一代码路径）的自动测试。Rust–TypeScript 逐帧对照（regress）只算移植回归，不算独立证据。
- **部分实现**、**存在但待验证**、**未实现**、**明确暂缓**：同基线定义。
- 成熟度：L0 概念或示意；L1 条件受限的解析计算；L2 可交互数值仿真；L3 验证过的领域能力（独立基准、收敛或统计检验、有效域、闭环）；L4 验证过的教学活动——需要学生试用与修订记录，本版没有，因此不标 L4。
- 教学成熟度：0 无；1 有内容链接（模板、实验、题目、手册）；2 有带评分证据的学习活动。
- **完成**（26.56 任务书第六节）：同时满足物理有效域（条件或受限说明）、独立验证、教学证据（教学 2 且有活动）、交互可用（模板或实验＋活动）和复现导出（运行清单）。只有这些模型族标“完成”。

## 2 总览

| 项 | 基线 26.55 | 26.56 |
| --- | --- | --- |
| 模型族：已验证 | 80 | 180 |
| 模型族：部分实现 | 38 | 0 |
| 模型族：存在但待验证 | 7 | 0 |
| 模型族：未实现 | 55 | 0 |
| 模型族：明确暂缓 | 0 | 0 |
| 模型族：L0 | 59 | 0 |
| 模型族：L1 | 59 | 74 |
| 模型族：L2 | 62 | 91 |
| 模型族：L3 | 0 | 15 |
| 带评分证据的活动 | 0 | 15 |
| 独立参照用例 | 0 | 591 |
| 完成（五项全满足） | 0 | 15 |
| 需求：已验证 | 8 | 38 |
| 需求：部分实现 | 40 | 17 |
| 需求：存在但待验证 | 0 | 1 |
| 需求：未实现 | 12 | 0 |
| 需求：明确暂缓 | 0 | 4 |

完成的模型族：M03、M07、M08、F02、T10、E09、E13、E15、E17、B10、B11、Q05、Q08、N01、N02。

## 3 需求项（ENG、FOR、EDU、UX）

| 编号 | 优先级 | 需求 | 基线 | 26.56 | 实现与证据 | 自动测试 | 剩余限制 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ENG01 | P0 | 单位与类型 | 部分实现 | **已验证** | Rust expr.rs 与 TS formula/units.ts 统一为七个 SI 基本量纲 L M T I Θ N J（D99）；UnitKind 区分绝对温度与温差，°C 显示为仿射换算；显示单位表增加温度、压强、密度、体积、物质的量等 | test:units2656 dims2656 seven dimensions；test:units2656 Celsius affine；test:units2656 display conversions；test:dims2656 rejects V + m/s² and ln(1 m) | 复合单位仍按表匹配，没有用户自定义单位 |
| ENG02 | P0 | 常数 材料与数据 | 部分实现 | **已验证** | engine/velophi-core/src/constants.rs：CODATA2018 与 CODATA2022 两套（值、单位、标准不确定度、来源）；康普顿、磁场、核反应、结合能、平行板电容器实验带 constantsSet，新实验默认 2022，旧状态与旧文件保持 2018；运行清单列出数据集（AME2020、PDG 2024） | test:labs2656 magnetMap constants by set；test:labs2656 compton constants by set；test:particles2656 the electron rest energy of the set | 刚体场景的库仑常数保持 26.55 的 CODATA 2018 值，以保留 77 个模板指纹（D97）；切换需要新的 physicsVersion |
| ENG03 | P0 | 几何与坐标 | 部分实现 | **已验证** | ModelSpec.geometry（平面运动、二维截面每米、平面内三维点电荷、轴对称、一维、集中参数、三维、无空间）；模型页与实验页（模型标签）显示几何、假设、有效域 | test:models2656 restricted models say what is computed and the matrix fields are filled；test:loop1 the thickness scales volume and force | 刚体场景的读数面板尚未逐量标注“每米厚度” |
| ENG04 | P0 | 场景与初边值 | 部分实现 | **已验证** | 模型计算返回逐项诊断：缺输入（信息不足）、输入超出定义域、无解／单解／多解；场景加载诊断沿用 26.55 | rust:src/modelcalc.rs four_states_branches_and_roots；rust:src/modelcalc.rs solving_for_an_unknown_finds_both_angles | — |
| ENG05 | P0 | 时间与事件 | 已验证 | **已验证** | 事件定位与事件前后状态沿用 26.55；闭环一检查事件时刻、事件两侧速度和事件定位随容差收敛 | test:loop1 free fall event time and both sides；test:loop1 step convergence | — |
| ENG06 | P1 | 求解器选择 | 部分实现 | **部分实现** | 沿用多积分器、梯形 MNA、分步傅里叶、蛙跳；量子实验新增网格与步长收敛研究（观测阶数、外推） | test:loop3 the split-operator time step converges at second order；test:loop3 the free packet converges spectrally to Q08 | PDE 与本征值求解器的插件接口未做 |
| ENG07 | P1 | 约束与接触 | 已验证 | **已验证** | D73 最小范数约定与警告沿用；SV10 的数值约定在模型中注明 | test:physics2653 | — |
| ENG08 | P2 | PDE 与边界 | 未实现 | **明确暂缓** | 没有通用 PDE 求解器；X01 等以受限解析模型交付并标明受限 | test:models2656 restricted models say what is computed | 通用 PDE（P2–P3）暂缓，依赖求解器插件接口 |
| ENG09 | P1 | 耦合守恒 | 部分实现 | **部分实现** | 导轨回路的焦耳热与机械功、RC 电路能量账本的闭合检查（闭环二） | test:loop2 rail force: simulation vs B11 and energy balance；test:loop2 energy ledger RC | 没有跨模块重复入账的系统检查 |
| ENG10 | P0 | 独立验证 | 部分实现 | **已验证** | 每个模型族至少三组独立参照（scripts/oracles/*.py，mpmath 另行实现与方法，591 组）；模型注册记录 references 类别；Rust–TS 对照标为移植回归 | test:models2656 independent reference values；test:models2656 every verified model has a benchmark, a boundary and a limit or transfer case | 参照由开发者编写，未经外部同行复核 |
| ENG11 | P0 | 误差与诊断 | 部分实现 | **已验证** | 模型基准与活动评分统一使用 e = \|q − qref\| / max(\|qref\|, qscale)；未定义结果返回 null 与原因，不显示为 0 | test:activities2656 separates calculation, unit and direction；test:models2656 evaluates every worked example without undefined results | — |
| ENG12 | P1 | 守恒与通量 | 部分实现 | **已验证** | 电路 KCL 残差由测试另行计算；量子范数与吸收层损失分开报告；衰变统计归一（多种子均值与方差） | test:loop2 circuitSolve vs E09 with independent KCL residual；test:loop3 absorber loss is reported apart from discretization error；test:loop3 over many seeds | — |
| ENG13 | P0 | 记录与复现 | 部分实现 | **已验证** | 运行清单 manifest（核心版本、场景格式、后端及其 physicsVersion 与求解器、常数集与来源、数据集、输入 SHA-256）；CSV 头、模型计算、活动记录、参数化题与实验导出均附带 | test:labs2656 an exported experiment carries the run manifest | 旧版本导出的文件没有清单（读入时不补造） |
| ENG14 | P1 | 性能与取消 | 已验证 | **已验证** | D97：本版不改变 77 个模板指纹；Rust 与 TS 参考逐帧一致；calc-parity 逐位一致 | test:engine bounded run identical to the reference engine | — |
| ENG15 | P1 | 数据接口与导出 | 部分实现 | **已验证** | CSV 写入运行清单；实验、模型计算、活动与学习记录导出 JSON（参数、结果、常数集、版本） | test:labs2656 an exported experiment carries the run manifest；test:activities2656 keeps visits, practice and mastery apart; exports and clears | 不提供 QTI／LTI 等交换格式 |
| ENG16 | P1 | 内容和插件注册 | 部分实现 | **已验证** | src/content/models：180 个 ModelSpec（输入、条件、输出、几何、假设、来源、成熟度、基准、关联模板／实验／题目／公式情形／活动）；受限表达式在 Rust 中检查量纲 | test:models2656 covers the 180 model families of the blueprint；test:models2656 links point at existing templates；test:models2656 installs in the core without problems | — |
| ENG17 | P0 | 兼容与迁移 | 部分实现 | **已验证** | learnDone 迁移为“已访问”，不生成练习或掌握记录；实验文件 3 带常数集，旧文件保持 2018；场景格式与旧名兼容沿用 | test:activities2656 migrates the 26.55 “opened” list to visits only；test:labs2656 lab states: new experiments use 2022 | — |
| ENG18 | P1 | 可靠性与内容治理 | 部分实现 | **部分实现** | 模型注册 review 字段记录物理与语言审阅日期（开发者审阅） | test:models2656 restricted models say what is computed and the matrix fields are filled | 没有教师或外部专家的教学审阅记录；审阅为开发者自审 |
| FOR01 | P0 | 注册字段 | 部分实现 | **部分实现** | ModelSpec 记录来源编号、输入的语义量与单位、条件、有效域、假设与推导链接；公式工作室的 FormulaDef 库沿用 | test:models2656 has unique ids and matches the core’s unit table | 公式工作室的 FormulaDef 尚未迁到带版本号与来源的 FormulaSpec |
| FOR02 | P0 | 语义 AST | 部分实现 | **已验证** | 受限表达式语言七量纲推断（两端一致）；新增 sinh、cosh、asinh、acosh、atanh、sinc、cbrt、floor；数字 0 适配任何量纲 | test:dims2656 rejects V + m/s² and ln(1 m)；rust:src/modelcalc.rs four_states_branches_and_roots | — |
| FOR03 | P0 | 参数与数据来源 | 部分实现 | **部分实现** | 模型计算输出区分输入、中间量与所用常数（含常数集） | test:models2656 evaluates every worked example without undefined results | 公式卡片的变量尚未逐一标注“给定／常数／派生” |
| FOR04 | P0 | 适用条件 | 部分实现 | **已验证** | 条件四态：适用、不适用、信息不足、近似适用（附缺少的量） | rust:src/modelcalc.rs four_states_branches_and_roots | — |
| FOR05 | P1 | 求解与分支 | 部分实现 | **已验证** | modelSolve：区间内求根，报告无解／单解／多解并按物理条件筛选；分支输出带分支名 | rust:src/modelcalc.rs solving_for_an_unknown_finds_both_angles | — |
| FOR06 | P0 | 对照独立性 | 未实现 | **已验证** | 公式卡显示“独立解析／守恒检验／同源一致性”；模型基准记录参照类别；Rust–TS 对照标为移植回归 | test:models2656 formula reference kinds | — |
| FOR07 | P0 | 误差度量 | 部分实现 | **已验证** | 带量纲尺度的缩放误差（模型基准与评分） | test:models2656 independent reference values | — |
| FOR08 | P1 | 推导与步骤 | 已验证 | **已验证** | 三语推导与代入步骤沿用 | test:derivationsA the steps hold numerically in the recognised template situations | — |
| FOR09 | P1 | 跨表征 | 部分实现 | **部分实现** | 变量定位画面元素（D72）、公式时间线沿用 | — | 没有自动测试（复核时未找到） |
| FOR10 | P2 | 符号等价与答案 | 未实现 | **明确暂缓** | — | — | 符号等价判定暂缓 |
| EDU01 | P0 | 目标与证据 | 未实现 | **已验证** | 15 个活动各有目标、证据类别；学习记录把“已访问”“已练习”“掌握证据”分开 | test:activities2656 keeps visits, practice and mastery apart；test:activities2656 there are the activities the models link to | — |
| EDU02 | P1 | 先修图与课程包 | 部分实现 | **部分实现** | 活动与模型记录 prerequisites（活动、模型） | test:activities2656 there are the activities the models link to | 没有课程包和先修图的可视化与路径排序 |
| EDU03 | P1 | 诊断与误概念 | 未实现 | **已验证** | 每个活动有概念诊断题，选项对应误概念并给出针对性反馈 | test:ux2656 every activity: diagnosis, prediction, questions and transfer pass the same checks | 误概念库来自文档与教学经验，未经学生数据校准 |
| EDU04 | P1 | 深度和支架 | 部分实现 | **部分实现** | 题目带逐级提示（hints），按学段分配活动 | test:ux2656 every activity | 没有按学生表现自适应的深度调整 |
| EDU05 | P1 | 预测 观察 解释 | 部分实现 | **已验证** | 活动先预测（选项＋理由），实验后修订解释，记录修订与是否改变 | test:activities2656 keeps visits, practice and mastery apart | — |
| EDU06 | P1 | 实验设计 | 部分实现 | **部分实现** | 活动的控变量实验：一次只改一个输入，其余保持 | test:ux2656 every activity | 学生不能自行设计实验方案 |
| EDU07 | P1 | 多表征与过程证据 | 部分实现 | **部分实现** | 作答记录保存预测、理由、实验设置、修订与逐题证据 | test:activities2656 keeps visits, practice and mastery apart | 图表与画面操作不作为过程证据记录 |
| EDU08 | P2 | 真实数据与迁移 | 未实现 | **部分实现** | 每个活动有迁移题（换情境、换参数） | test:ux2656 every activity | 真实测量数据导入暂缓 |
| EDU09 | P1 | 题型与评分 | 部分实现 | **已验证** | 评分分概念、单位、方向、建模、计算、解释六个维度；每量独立容差 | test:activities2656 separates calculation, unit and direction；test:activities2656 reads the friction direction from the branch of the model | — |
| EDU10 | P1 | 有约束的参数化 | 部分实现 | **已验证** | 参数化题：固定种子可重现（种子经打散，相邻种子的题目分散），网格取值后由 Rust 模型判定条件与可解性，失败给出原因 | test:activities2656 is reproducible from the seed；test:activities2656 rejects draws whose conditions fail and reports why；test:activities2656 neighbouring seeds give spread-out problems | — |
| EDU11 | P1 | 提示与反馈 | 部分实现 | **已验证** | 逐级提示；求助次数照记，不扣分（规则可见）；核对后显示参考答案，评分以每题第一次核对为准，之后的修改只作练习 | test:activities2656 mastery needs every dimension；test:activities2656 the first check is the evidence | — |
| EDU12 | P2 | 熟练度与复习 | 未实现 | **部分实现** | 掌握证据的判定规则在学习路径中可见 | test:activities2656 mastery needs every dimension | 间隔复习暂缓；L4 需要学生试用与修订记录，本版不声称 |
| EDU13 | P1 | 活动编辑器 | 部分实现 | **部分实现** | 教师把模型复制为参数化题，预览多组参数、校验并导出 | test:activities2656 checks the specification | 没有完整的活动编辑器（问题文字、诊断选项仍在代码中） |
| EDU14 | P1 | 教师使用 | 部分实现 | **已验证** | 演示与题目模式沿用；参数化题供教师出题 | test:teaching2652 another set of numbers gives other answers | — |
| EDU15 | P2 | 交换与分享 | 未实现 | **明确暂缓** | — | — | 不声称 QTI／LTI 兼容 |
| EDU16 | P1 | 学习数据与离线 | 部分实现 | **已验证** | 学习记录只存本机（velophi.learning.v1），学生可查看、导出 JSON、清除 | test:activities2656 keeps visits, practice and mastery apart; exports and clears | — |
| EDU17 | P1 | 可访问学习 | 部分实现 | **已验证** | 活动可全键盘完成；斜面受力分析用复选框与单选组（M07 键盘任务）；对话框焦点陷阱与 Escape | test:ux2656 the forces are check boxes (Space) and the friction direction a radio group (arrow keys)；test:ux2656 Tab stays inside the dialog | 未做屏幕阅读器实机测试 |
| EDU18 | P2 | AI 辅导与教学有效性 | 未实现 | **明确暂缓** | — | — | AI 辅导暂缓 |
| UX01 | — | 按目标找到合适内容 | 部分实现 | **已验证** | 模型目录：领域、学段、成熟度、状态筛选与搜索；全局搜索收录模型与活动 | test:models2656 covers the 180 model families | — |
| UX02 | — | 在沙盒 实验 题目间切换 | 已验证 | **已验证** | 沙盒、实验、题目切换沿用 | test:engine bounded run identical to the reference engine | — |
| UX03 | — | 看懂学习进度 | 未实现 | **已验证** | 学习路径分别显示已访问（眼）、已练习（笔）、掌握证据（旗） | test:activities2656 keeps visits, practice and mastery apart | — |
| UX04 | — | 判断结果适用范围 | 未实现 | **已验证** | 模型标签：几何、假设、有效域、受限说明、常数集与数据版本 | test:models2656 restricted models say what is computed and the matrix fields are filled | — |
| UX05 | — | 发现与修正不适用公式 | 部分实现 | **已验证** | 条件四态与原因（缺少的量、超出定义域） | rust:src/modelcalc.rs four_states_branches_and_roots | — |
| UX06 | — | 关联变量和物体 | 已验证 | **存在但待验证** | 变量定位沿用（D72） | — | 基线标为已验证；复核时没有找到对应的自动测试，改为存在但待验证 |
| UX07 | — | 看懂精度与数值状态 | 未实现 | **部分实现** | 公式卡参照类别标签；量子实验收敛表；模型页显示参照类别 | test:models2656 formula reference kinds | 其余实验的数值误差状态未逐一显示 |
| UX08 | — | 管理运行和失败 | 部分实现 | **部分实现** | 模型计算与活动的失败状态显示为消息（不显示数字） | test:dims2656 rejects V + m/s² and ln(1 m) | 失败状态的界面没有专门的自动测试 |
| UX09 | — | 对比实验分支 | 已验证 | **已验证** | 分支对比沿用；量子收敛表同单位对比 | test:branch | — |
| UX10 | — | 分阶段学习 | 部分实现 | **已验证** | 活动先预测后看结果，答案在作答后显示 | test:ux2656 every activity | — |
| UX11 | — | 编辑并发布教学活动 | 部分实现 | **部分实现** | 参数化题预览与校验 | test:activities2656 checks the specification | 没有活动发布流程 |
| UX12 | — | 使用键盘和辅助技术 | 部分实现 | **已验证** | M07 键盘任务；新对话框为模态（aria-modal），Tab 不离开对话框，Escape 关闭，强调色按钮焦点可见 | test:ux2656 the forces are check boxes (Space)；test:ux2656 Tab stays inside the dialog | 26.55 及更早的对话框尚无焦点陷阱；未做屏幕阅读器实机测试 |
| UX13 | — | 在不同设备上连续工作 | 已验证 | **部分实现** | 新界面沿用窄屏布局 | — | 新对话框在触屏与窄屏上只做了人工检查 |
| UX14 | — | 保存和交换结果 | 部分实现 | **已验证** | 导出带运行清单（CSV、实验、模型计算、活动、学习记录） | test:labs2656 an exported experiment carries the run manifest | — |

## 4 全部 180 个模型族

列：基线状态与成熟度 → 本版状态与成熟度；教学成熟度；完成；独立证据（预言值用例数＋仿真或实验测试；regress 为移植回归）；关联内容（模板 T、实验 L、题目 P、活动 A）；依赖（计算后端）；差距与限制。

### G 量纲 测量与数值基础

依赖：P0 公共基础（ENG01 量纲、ENG02 常数、ENG10 独立验证、ENG13 运行清单）与后端 models（受限表达式）、units。

| ID | 模型族 | 学段 | 优先级 | 几何 | 基线 | 26.56 | 教学 | 完成 | 独立证据 | 关联 | 差距与限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G01 | 单位换算与前缀 | 初中 | P1 | 无空间几何 | 部分实现 · L1 | **已验证 · L1** | 活动＋证据 | — | oracle ×3；test:units2656 display conversions；test:units2656 save-load-language | A act-units | 只有受限解析计算（模型计算器），无交互仿真；L4 需要学生试用与修订记录 |
| G02 | 矢量分解与坐标变换 | 高中 | P1 | 无空间几何 | 部分实现 · L1 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| G03 | 采样 微分与积分 | 高中、大学 | P1 | 无空间几何 | 部分实现 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:teaching2652 area under v–t；test:teaching2652 successive differences give the acceleration | 模型页 | 纸带与面积工具作用于仿真记录（L2）；中心差分、端点单侧公式与采样率误差比较只在模型计算器中，记录工具未提供 |
| G04 | 线性拟合与残差 | 高中、大学 | P1 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 拟合区间的选择、原始点保留与拟合叠加到图表（EDU08）待做 |
| G05 | 不确定度与相关性 | 大学 | P1 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 误差条与图表联动、蒙特卡罗传播待做 |
| G06 | 量纲检查与温标 | 高中、大学 | P1 | 无空间几何 | 部分实现 · L1 | **已验证 · L1** | 活动＋证据 | — | oracle ×3；test:units2656 dims2656 seven dimensions；test:dims2656 rejects V + m/s² and ln(1 m)；test:units2656 Celsius affine | A act-units | 只有受限解析计算（模型计算器），无交互仿真；L4 需要学生试用与修订记录 |
| G07 | 时间步与网格收敛 | 大学 | P1 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3；test:loop3 the split-operator time step converges at second order | L quantum；A act-packet | 交互内容是解析计算或只对照了部分输出，按 L1 计；没有对本模型全部输出的数值仿真对照；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| G08 | 随机种子与统计误差 | 大学 | P1 | 无空间几何 | 部分实现 · L1 | **已验证 · L1** | 内容 | — | oracle ×3；test:loop3 decay seeds and statistical band | L decay；A act-decay | 交互内容是解析计算或只对照了部分输出，按 L1 计；没有对本模型全部输出的数值仿真对照；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |

### M 力学与分析力学

依赖：P0 公共基础（ENG01 量纲、ENG02 常数、ENG10 独立验证、ENG13 运行清单）与后端 rigid（刚体 DAE、事件）。

| ID | 模型族 | 学段 | 优先级 | 几何 | 基线 | 26.56 | 教学 | 完成 | 独立证据 | 关联 | 差距与限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M01 | 匀速运动与参考系 | 初中 | P1 | 质点／集中 | 部分实现 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:derivationsC the steps hold numerically in the recognised template situations | T uniform-motion, inertia | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M02 | 匀变速直线运动 | 高中 | P1 | 质点／集中 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:acceptance；test:derivationsC the steps hold numerically in the recognised template situations | T pull-force；P k-pull, e-work | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M03 | 自由落体与事件时刻 | 高中 | P1 | 质点／集中 | 已验证 · L2 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×3；test:loop1 free fall event time and both sides；test:loop1 step convergence；test:acceptance | T free-fall, ball-into-water, bouncing-ball；P k-free-fall；A act-freefall | L4 需要学生试用与修订记录 |
| M04 | 斜抛运动 | 高中 | P1 | 质点／集中 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:acceptance 5 projectile | T projectile, charge-deflection, oscilloscope；P p-oblique, p-horizontal, p-from-height | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M05 | 追及与分段运动 | 高中 | P1 | 质点／集中 | 存在但待验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:sim2656 M05 pursuit；regress:engine template pursuit（回归） | T pursuit | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M06 | 两绳悬挂与静力平衡 | 高中 | P1 | 平面运动 | 存在但待验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×4；test:sim2656 M06 two ropes；regress:engine template two-ropes（回归） | T v-groove, charged-pendulum, two-ropes | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M07 | 粗糙斜面滑动 | 高中 | P1 | 平面运动 | 已验证 · L2 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×4；test:loop1 incline three branches；test:acceptance 1 incline slider；test:ux2656 keyboard M07 | T incline, conveyor-incline, incline-efficiency, slope-up, incline-pulley；P k-incline, f-incline-rest；A act-incline | L4 需要学生试用与修订记录 |
| M08 | 静摩擦阈值与滑动切换 | 高中 | P1 | 平面运动 | 已验证 · L2 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×5；test:loop1 threshold both sides and re-stick；test:acceptance | T incline, table-pulley, pull-force；P k-pull, k-incline, f-incline-rest, f-table-rest, n-table, e-work；A act-static | L4 需要学生试用与修订记录 |
| M09 | 功 能量与机械效率 | 初中、高中 | P1 | 质点／集中 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:acceptance energy ledger closes for every template | T pull-force, incline-efficiency, slope-up；P k-pull, e-work | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M10 | 超重 失重与加速度计 | 高中 | P1 | 质点／集中 | 存在但待验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:sim2656 M10 elevator；regress:engine template elevator（回归） | T elevator | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M11 | 阿特伍德机 | 高中 | P1 | 平面运动 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:acceptance 8b Atwood | T atwood, table-pulley, incline-pulley；P f-table-rest, n-atwood, n-table | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M12 | 动滑轮与绳长约束 | 初中、高中 | P1 | 平面运动 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:pulleys | T movable-pulley | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M13 | 板块与相对滑动 | 高中 | P1 | 平面运动 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:acceptance 2 board and block | T board-block, inertia；P n-board | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M14 | 传送带与共速事件 | 高中 | P1 | 质点／集中 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:acceptance 3 conveyors | T conveyor, conveyor-incline；P n-conveyor | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M15 | 可动斜面与系统动量 | 大学 | P2 | 平面运动 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×4；test:models movable wedge | T movable-wedge；P n-wedge | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M16 | 弹簧与能量交换 | 高中 | P1 | 质点／集中 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:acceptance spring oscillator k = 50 N/m | T spring, spring-blocks；P m-spring, o-spring | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M17 | 一维弹性碰撞 | 高中 | P1 | 质点／集中 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×4；test:acceptance 4 collisions | T collision-1d, three-balls, pendulum-collision；P m-elastic, m-inelastic | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M18 | 完全非弹性碰撞 | 高中 | P1 | 质点／集中 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:acceptance 4 collisions | T collision-1d, pendulum-collision；P m-elastic, m-inelastic | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M19 | 斜碰与接触冲量 | 大学 | P2 | 质点／集中 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:acceptance 4 collisions；test:physics2652 bounces off the stops | T collision-2d, ball-rod, slider-stop, v-groove, bouncing-ball, three-balls | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M20 | 转动惯量与定轴转动 | 大学 | P2 | 平面运动 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:physics2651 torque motor | T hinged-rod, ball-rod, motor-disc, gears, physical-pendulum；P e-rod | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M21 | 杠杆与力矩平衡 | 初中 | P1 | 平面运动 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:derivationsC the steps hold numerically in the recognised template situations | T lever, wheel-axle；P f-lever | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M22 | 纯滚动 | 大学 | P2 | 平面运动 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:acceptance 7 rigid rotation | T rolling, rolling-resistance, v-groove；P r-rolling | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M23 | 滑动到滚动 | 大学 | P2 | 平面运动 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×4；test:models rolling with slipping | T rolling-slip, rolling-resistance；P r-slip | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M24 | 竖直圆周与轻绳临界条件 | 高中 | P1 | 平面运动 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:models vertical circle on a rope | T vertical-circle-rope, uniform-circle；P c-uniform, c-rope | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M25 | 竖直圆周与轻杆 | 高中、大学 | P2 | 平面运动 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×4；test:models vertical circle on a rod | T vertical-circle-rod, uniform-circle；P c-uniform, c-rod | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M26 | 两体引力与开普勒轨道 | 高中、大学 | P2 | 平面运动 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:physics2651 gravitation | T orbit, binary-star, kepler；P g-circle, g-ellipse | 偏心轨道的长期相位与近地点监控未做 |
| M27 | 宇宙速度与逃逸 | 高中 | P1 | 平面运动 | 部分实现 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:physics2651 a circular orbit about a static planet | T cosmic-velocity | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M28 | 阻力与终端速度 | 高中、大学 | P2 | 质点／集中 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:physics2651 drag | T drag-fall, charged-drop, sinking-ball, ball-into-water；P n-drag | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M29 | 变力 冲量与数值积分 | 大学 | P2 | 质点／集中 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:forces variable forces | T variable-force | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M30 | 弹性杆与梁挠度（受限） | 大学 | P2 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 连续介质求解、边界约束与网格收敛未做 |
| M31 | 拉格朗日单摆 | 大学 | P2 | 平面运动 | 部分实现 · L0 | **已验证 · L2** | 内容 | — | oracle ×3；test:acceptance 6 oscillations | T pendulum；P e-pendulum, o-pendulum | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| M32 | 哈密顿方法与对称性（受限） | 大学、研究生 | P3 | 无空间几何 | 部分实现 · L1 | **已验证 · L1** | 内容 | — | oracle ×3；test:physics2652 Gauss–Legendre | T central-spring | 哈密顿量与相轨道（解析）；一般哈密顿系统与辛积分的长期验证暂缓 |

### F 流体与连续介质

依赖：P0 公共基础（ENG01 量纲、ENG02 常数、ENG10 独立验证、ENG13 运行清单）与后端 regions（液体）、rigid。

| ID | 模型族 | 学段 | 优先级 | 几何 | 基线 | 26.56 | 教学 | 完成 | 独立证据 | 关联 | 差距与限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | 液体压强 | 初中 | P1 | 一维连续体 | 部分实现 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；test:sim2656 F01 liquid pressure | 模型页 | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| F02 | 浮力与沉浮 | 初中 | P1 | 二维截面（每米或给定厚度） | 已验证 · L2 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×4；rust:tests/regions.rs floating_block_draft_and_archimedes；test:loop1 floating block: thickness modes and the float/sink prediction against the simulation | T floating-block, sinking-ball, rising-block, weigh-in-water, densities, loaded-boat, ball-into-water；A act-float | L4 需要学生试用与修订记录 |
| F03 | 浮体稳定性与浮心 | 大学 | P2 | 二维截面（每米或给定厚度） | 部分实现 · L2 | **已验证 · L2** | 内容 | — | oracle ×4；rust:src/regions.rs circle_segment_and_corner | T floating-block, loaded-boat | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| F04 | 帕斯卡原理与液压 | 初中 | P1 | 二维截面（每米或给定厚度） | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| F05 | 连续性方程 | 高中、大学 | P2 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| F06 | 伯努利与流速压差 | 高中、大学 | P2 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×4 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| F07 | 泊肃叶流 | 大学 | P2 | 轴对称 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| F08 | 斯托克斯沉降 | 大学 | P2 | 质点／集中 | 部分实现 · L2 | **已验证 · L2** | 内容 | — | oracle ×4；test:physics2651 linear drag: v(t) = v_t | 模型页 | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| F09 | 雷诺数与相似性 | 大学 | P2 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| F10 | 表面张力与毛细 | 大学 | P2 | 轴对称 | 部分实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×4 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| F11 | 应力应变与弹性波 | 大学 | P2 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×4 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| F12 | 可压缩性与声速 | 大学 | P2 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |

### W 振动与波

依赖：P0 公共基础（ENG01 量纲、ENG02 常数、ENG10 独立验证、ENG13 运行清单）与后端 rigid、waves。

| ID | 模型族 | 学段 | 优先级 | 几何 | 基线 | 26.56 | 教学 | 完成 | 独立证据 | 关联 | 差距与限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W01 | 简谐振子 | 高中 | P1 | 一维连续体 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:acceptance spring oscillator k = 50 N/m | T spring, central-spring, vertical-spring；P o-spring | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| W02 | 单摆与小角近似 | 高中、大学 | P1 | 平面运动 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×4；test:acceptance 6 oscillations | T pendulum, charged-pendulum, pendulum-collision, physical-pendulum；P e-pendulum, o-pendulum | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| W03 | 阻尼与三种响应 | 大学 | P2 | 一维连续体 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×4；test:physics2651 damper | T damped-spring, elevator | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| W04 | 受迫振动与共振 | 高中、大学 | P2 | 一维连续体 | 存在但待验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×4；test:sim2656 W04 resonance；regress:engine template resonance（回归） | T variable-force, resonance | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| W05 | 耦合振子与简正模 | 大学 | P2 | 一维连续体 | 部分实现 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；test:models two blocks joined by a spring | T spring-blocks, coupled-oscillators；P m-spring | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| W06 | 双摆与混沌（受限） | 大学、研究生 | P3 | 平面运动 | 存在但待验证 · L2 | **已验证 · L1** | 无 | — | oracle ×4；regress:engine template double-pendulum（回归） | T double-pendulum | 指数增长估算；有限时间 Lyapunov 拟合与 Poincaré 统计暂缓（双摆模板只做轨迹仿真） |
| W07 | 弦上的行波 | 高中、大学 | P1 | 一维连续体 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/waves.rs pulse_travels_at_c_and_reflects；rust:src/labs/waves.rs energy_is_kept_on_a_fixed_string | L waves | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| W08 | 界面反射与阻抗 | 大学 | P2 | 一维连续体 | 部分实现 · L2 | **已验证 · L2** | 内容 | — | oracle ×4；test:sim2656 W08 string junction | L waves | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| W09 | 驻波与边界条件 | 高中 | P1 | 一维连续体 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×4；rust:src/labs/waves.rs standing_mode_is_exact_and_has_its_frequency | L waves | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| W10 | 多普勒效应 | 高中 | P1 | 一维连续体 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×4；rust:src/labs/waves.rs doppler_and_notes | L waves | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| W11 | 拍与叠加 | 高中 | P1 | 一维连续体 | 部分实现 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/waves.rs doppler_and_notes | L waves | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| W12 | 声强级与对数尺度 | 高中 | P1 | 无空间几何 | 部分实现 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/waves.rs doppler_and_notes | L waves | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| W13 | 傅里叶分析与采样混叠 | 大学 | P2 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×4 | L waves | 交互内容未与本模型逐项对照，只交付受限解析计算；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| W14 | 色散与群速度 | 大学 | P2 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3；test:loop3 quantum packet centre moves at the group velocity | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |

### T 热学与统计物理

依赖：P0 公共基础（ENG01 量纲、ENG02 常数、ENG10 独立验证、ENG13 运行清单）与后端 gas、heat。

| ID | 模型族 | 学段 | 优先级 | 几何 | 基线 | 26.56 | 教学 | 完成 | 独立证据 | 关联 | 差距与限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | 比热与升温 | 初中 | P1 | 无空间几何 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/heat.rs ice_to_steam | L heating | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| T02 | 潜热与加热曲线 | 初中 | P1 | 无空间几何 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/heat.rs ice_to_steam | L heating | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| T03 | 热平衡与量热 | 初中 | P1 | 无空间几何 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/heat.rs mixing_reaches_the_weighted_mean | L mixing | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| T04 | 热膨胀 | 高中 | P1 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| T05 | 热传导 | 高中、大学 | P2 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| T06 | 牛顿冷却 | 高中、大学 | P2 | 无空间几何 | 部分实现 · L1 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| T07 | 热辐射与黑体 | 高中、大学 | P2 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| T08 | 理想气体状态方程 | 高中 | P1 | 无空间几何 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/gas.rs processes_satisfy_the_first_law_and_the_integral | L gas | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| T09 | 热力学第一定律 | 高中 | P1 | 无空间几何 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/gas.rs processes_satisfy_the_first_law_and_the_integral | L gas | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| T10 | 理想气体四类过程 | 高中、大学 | P1 | 无空间几何 | 已验证 · L1 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×5；test:loop3 gasProcess vs T10 (four branches, quadrature of p dV)；test:loop3 cycle closes | L gas；A act-gas | L4 需要学生试用与修订记录 |
| T11 | 卡诺热机与熵 | 高中、大学 | P1 | 无空间几何 | 部分实现 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/gas.rs cycle_efficiencies | L gas | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| T12 | 奥托循环 | 大学 | P2 | 无空间几何 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/gas.rs cycle_efficiencies | L gas | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| T13 | 分子速率分布 | 大学 | P2 | 无空间几何 | 部分实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 分子动力学采样与直方图的统计验证未做（GasLab 中的分子为示意） |
| T14 | 系综 配分函数与两能级（受限） | 大学、研究生 | P3 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×3 | 模型页 | 两能级配分函数；一般系综与相变暂缓 |
| T15 | 随机游走与扩散 | 大学 | P2 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| T16 | 伊辛模型与相变思想（受限） | 大学、研究生 | P3 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×4 | 模型页 | 两自旋枚举与 Metropolis 接受概率；大格点蒙特卡罗暂缓 |

### E 静电与电路

依赖：P0 公共基础（ENG01 量纲、ENG02 常数、ENG10 独立验证、ENG13 运行清单）与后端 field、circuit。

| ID | 模型族 | 学段 | 优先级 | 几何 | 基线 | 26.56 | 教学 | 完成 | 独立证据 | 关联 | 差距与限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E01 | 库仑力与叠加 | 高中 | P1 | 平面内的三维源 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/field.rs single_charge_field_is_coulomb；rust:tests/electric.rs coulomb_scattering_conserves_energy | T two-charges；L field | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| E02 | 电场线与合场 | 高中 | P1 | 平面内的三维源 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/field.rs dipole_lines_go_from_plus_to_minus；test:labs2656 fieldAt vs E02 | T two-charges；L field | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| E03 | 高斯定律与对称性 | 大学 | P2 | 三维 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | L field | 通量的数值积分与非对称形状演示未做 |
| E04 | 电势 电势能与功 | 高中 | P1 | 无空间几何 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；rust:tests/electric.rs deflection_in_uniform_electric_field | T charge-deflection, oscilloscope, field-combo, charged-pendulum, charged-drop；L field | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| E05 | 导体平衡与屏蔽 | 高中、大学 | P2 | 三维 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | L field | 任意形状导体的边值求解属于 X01（受限） |
| E06 | 电容器与储能 | 高中 | P1 | 二维截面（每米或给定厚度） | 存在但待验证 · L1 | **已验证 · L1** | 内容 | — | oracle ×3；test:labs2656 plateCapacitor vs E06 | L capacitor | 交互内容是解析计算或只对照了部分输出，按 L1 计；没有对本模型全部输出的数值仿真对照；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| E07 | 介质极化与边界 | 大学 | P2 | 无空间几何 | 存在但待验证 · L1 | **已验证 · L1** | 内容 | — | oracle ×3 | L capacitor | 交互内容未与本模型逐项对照，只交付受限解析计算；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| E08 | 欧姆定律与电阻率 | 初中、高中、大学 | P1 | 一维连续体 | 部分实现 · L1 | **已验证 · L1** | 内容 | — | oracle ×3 | L circuit | 交互内容未与本模型逐项对照，只交付受限解析计算；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| E09 | 串并联电路 | 初中 | P1 | 集中参数网络 | 已验证 · L1 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×3；test:loop2 circuitSolve vs E09 with independent KCL residual；test:circuitPresets wires connect only at their ends | L circuit；A act-series | L4 需要学生试用与修订记录 |
| E10 | 基尔霍夫与桥式电路 | 高中、大学 | P1 | 集中参数网络 | 部分实现 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；test:loop2 bridge vs circuitSolve | L circuit | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| E11 | 戴维南与诺顿等效 | 大学 | P2 | 集中参数网络 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×4 | L circuit | 交互内容未与本模型逐项对照，只交付受限解析计算；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| E12 | 内阻与最大功率 | 高中 | P1 | 集中参数网络 | 部分实现 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/circuit.rs series_with_internal_resistance | L circuit | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| E13 | 电表内阻与测量扰动 | 高中 | P1 | 集中参数网络 | 部分实现 · L1 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×4；test:loop2 voltmeter loading vs circuitSolve | L circuit；A act-meter | L4 需要学生试用与修订记录 |
| E14 | 焦耳热与电热耦合 | 初中、高中、大学 | P1 | 集中参数网络 | 部分实现 · L1 | **已验证 · L1** | 内容 | — | oracle ×3；rust:src/labs/transient.rs rc_charging_and_energy | L circuit | 电路与热模块的双向耦合未做 |
| E15 | RC 充放电 | 高中、大学 | P1 | 集中参数网络 | 已验证 · L2 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×4；test:loop2 circuitRun RC vs E15 with rtol convergence；test:loop2 energy ledger RC；rust:src/labs/transient.rs rc_charging_and_energy | L circuit；A act-rc | L4 需要学生试用与修订记录 |
| E16 | RL 自感暂态 | 高中、大学 | P1 | 集中参数网络 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/transient.rs rl_and_discharge | L circuit | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| E17 | LC 振荡 | 高中、大学 | P1 | 集中参数网络 | 已验证 · L2 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×3；test:loop2 circuitRun LC period, energy and phase drift；rust:src/labs/transient.rs lc_oscillation_keeps_energy_and_period | L circuit；A act-lc | L4 需要学生试用与修订记录 |
| E18 | RLC 交流与相量 | 高中、大学 | P1 | 集中参数网络 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×4；rust:src/labs/transient.rs ac_rms_phase_and_rectifier | L circuit | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| E19 | 二极管与整流 | 高中、大学 | P2 | 集中参数网络 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/transient.rs ac_rms_phase_and_rectifier | L circuit | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| E20 | 传感器 放大与晶体管接口 | 大学 | P2 | 集中参数网络 | 部分实现 · L1 | **已验证 · L1** | 内容 | — | oracle ×3 | L circuit | 运放与晶体管元件进入电路实验室待做 |

### B 磁场与电磁感应

依赖：P0 公共基础（ENG01 量纲、ENG02 常数、ENG10 独立验证、ENG13 运行清单）与后端 magnet、regions、circuit。

| ID | 模型族 | 学段 | 优先级 | 几何 | 基线 | 26.56 | 教学 | 完成 | 独立证据 | 关联 | 差距与限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B01 | 长直导线磁场 | 高中、大学 | P1 | 二维截面（每米或给定厚度） | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/magnet.rs straight_wire_and_parallel_wires；test:labs2656 magnetMap constants by set | L magnet | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B02 | 线圈与螺线管 | 高中、大学 | P1 | 轴对称 | 部分实现 · L1 | **已验证 · L1** | 内容 | — | oracle ×3；rust:src/labs/magnet.rs long_sheet_pair_is_a_solenoid | L magnet | 交互内容是解析计算或只对照了部分输出，按 L1 计；没有对本模型全部输出的数值仿真对照；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B03 | 平行电流相互作用 | 高中、大学 | P1 | 二维截面（每米或给定厚度） | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/magnet.rs straight_wire_and_parallel_wires | L magnet | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B04 | 带电粒子圆周运动 | 高中 | P1 | 质点／集中 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×4；rust:tests/electric.rs cyclotron_radius_and_period | T cyclotron, bounded-field, circular-field, field-combo | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B05 | 速度选择器 | 高中 | P1 | 质点／集中 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；rust:tests/electric.rs velocity_selector_goes_straight | T velocity-selector | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B06 | 质谱仪 | 高中 | P1 | 质点／集中 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；rust:tests/regions.rs mass_spectrometer_lands_at_twice_the_radius | T mass-spectrometer | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B07 | 回旋加速器 | 高中、大学 | P2 | 质点／集中 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；rust:tests/regions.rs cyclotron_gains_energy_each_gap_crossing；test:zoneSemicircle | T cyclotron-dees | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B08 | 霍尔效应 | 大学 | P2 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B09 | 法拉第与楞次定律 | 高中 | P1 | 无空间几何 | 部分实现 · L1 | **已验证 · L1** | 内容 | — | oracle ×3 | L magnet | 交互内容未与本模型逐项对照，只交付受限解析计算；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B10 | 运动电动势 | 高中 | P1 | 二维截面（每米或给定厚度） | 已验证 · L2 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×3；test:loop2 rail coast: simulation vs B10/B11 and power balance；rust:tests/regions.rs rail_loop_terminal_velocity_and_energy | T rail-coast；A act-rail | L4 需要学生试用与修订记录 |
| B11 | 导轨回路的动力学 | 高中、大学 | P1 | 二维截面（每米或给定厚度） | 已验证 · L2 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×4；test:loop2 rail force: simulation vs B11 and energy balance；rust:tests/regions.rs rail_loop_terminal_velocity_and_energy | T rail-force, rail-coast, rail-fall；A act-rail | L4 需要学生试用与修订记录 |
| B12 | 自感 互感与磁能 | 大学 | P2 | 集中参数网络 | 部分实现 · L1 | **已验证 · L1** | 内容 | — | oracle ×3；rust:src/labs/transient.rs transformer_ratio_and_dc | L circuit | 交互内容是解析计算或只对照了部分输出，按 L1 计；没有对本模型全部输出的数值仿真对照；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B13 | 变压器与输电 | 高中 | P1 | 集中参数网络 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/transient.rs transformer_ratio_and_dc | L circuit | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B14 | 电动机与发电机耦合 | 大学 | P2 | 集中参数网络 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/transient.rs motor_reaches_its_speed | L circuit | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B15 | 位移电流与电荷连续 | 大学 | P2 | 二维截面（每米或给定厚度） | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B16 | 电磁平面波与能流 | 大学 | P2 | 三维 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B17 | 电磁界面与菲涅耳系数 | 大学 | P2 | 无空间几何 | 部分实现 · L1 | **已验证 · L1** | 内容 | — | oracle ×3 | L wave-optics | 交互内容未与本模型逐项对照，只交付受限解析计算；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| B18 | FDTD 腔模与电磁传播（受限） | 大学、研究生 | P3 | 二维截面（每米或给定厚度） | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×3 | 模型页 | CFL 上限与腔基频；FDTD 求解、PML 与收敛研究暂缓 |
| B19 | 磁性材料与磁滞（受限） | 大学、研究生 | P3 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×3 | 模型页 | 回线面积与损耗；磁滞材料模型（Preisach、Jiles–Atherton）暂缓 |
| B20 | 传输线与反射 | 大学 | P2 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |

### O 光学

依赖：P0 公共基础（ENG01 量纲、ENG02 常数、ENG10 独立验证、ENG13 运行清单）与后端 optics、waveoptics。

| ID | 模型族 | 学段 | 优先级 | 几何 | 基线 | 26.56 | 教学 | 完成 | 独立证据 | 关联 | 差距与限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O01 | 平面镜与反射 | 初中 | P1 | 平面运动 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/optics.rs snell_and_total_internal_reflection | L rays | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| O02 | 折射与色散 | 初中、高中 | P1 | 平面运动 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×4；rust:src/labs/optics.rs snell_and_total_internal_reflection；rust:src/labs/optics.rs prism_disperses_white_light | L rays | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| O03 | 全反射与光纤 | 高中 | P1 | 平面运动 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/optics.rs snell_and_total_internal_reflection | L rays | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| O04 | 薄透镜成像 | 初中、高中 | P1 | 平面运动 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×4；rust:src/labs/optics.rs thin_lens_and_mirror_formula | L lens | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| O05 | 球面镜成像 | 初中、高中 | P1 | 平面运动 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×4；rust:src/labs/optics.rs thin_lens_and_mirror_formula；rust:src/labs/optics.rs ideal_lens_focuses_parallel_rays_and_mirror_shows_aberration | L lens | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| O06 | 透镜组合与光学仪器 | 高中、大学 | P2 | 平面运动 | 部分实现 · L1 | **已验证 · L2** | 内容 | — | oracle ×4；rust:src/labs/optics.rs ideal_lens_focuses_parallel_rays_and_mirror_shows_aberration | L lens | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| O07 | 双缝干涉 | 高中 | P1 | 平面运动 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×4；rust:src/labs/waveoptics.rs double_slit_fringes | L wave-optics | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| O08 | 单缝衍射与分辨率 | 高中、大学 | P1 | 平面运动 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/waveoptics.rs single_slit_and_film_and_polarizers | L wave-optics | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| O09 | 光栅与有限缝宽包络 | 高中、大学 | P1 | 平面运动 | 部分实现 · L1 | **已验证 · L2** | 内容 | — | oracle ×4；test:sim2656 O09 grating | L wave-optics | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| O10 | 薄膜干涉 | 高中、大学 | P1 | 一维连续体 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×4；rust:src/labs/waveoptics.rs single_slit_and_film_and_polarizers | L wave-optics | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| O11 | 迈克耳孙干涉仪 | 高中、大学 | P2 | 平面运动 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | L wave-optics | 交互内容未与本模型逐项对照，只交付受限解析计算；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| O12 | 偏振与马吕斯定律 | 高中 | P1 | 一维连续体 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/waveoptics.rs single_slit_and_film_and_polarizers | L wave-optics | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| O13 | ABCD 矩阵与近轴光学 | 大学 | P2 | 平面运动 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×4；rust:src/labs/optics.rs ideal_lens_focuses_parallel_rays_and_mirror_shows_aberration | L rays | 交互内容是解析计算或只对照了部分输出，按 L1 计；没有对本模型全部输出的数值仿真对照；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| O14 | 菲涅耳衍射与波前传播（受限） | 大学、研究生 | P3 | 平面运动 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×3 | 模型页 | Fresnel 数与区域判定；波前传播计算暂缓 |

### Q 量子物理

依赖：P0 公共基础（ENG01 量纲、ENG02 常数、ENG10 独立验证、ENG13 运行清单）与后端 quantum、atom。

| ID | 模型族 | 学段 | 优先级 | 几何 | 基线 | 26.56 | 教学 | 完成 | 独立证据 | 关联 | 差距与限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q01 | 光电效应 | 高中 | P1 | 无空间几何 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/atom.rs photoelectric_einstein_equation | L photo | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| Q02 | 康普顿散射 | 高中、大学 | P1 | 平面运动 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/nuclear.rs compton_shift；test:labs2656 compton constants by set | L compton | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| Q03 | 德布罗意波与电子衍射 | 高中、大学 | P1 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| Q04 | 氢原子能级与光谱 | 高中 | P1 | 无空间几何 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/atom.rs balmer_lines | L hydrogen | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| Q05 | 无限深势阱 | 大学 | P2 | 一维连续体 | 已验证 · L2 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×3；test:loop3 quantumSetup well levels vs Q05 with grid convergence (order 2)；rust:src/labs/quantum.rs infinite_well_and_oscillator_levels | L quantum；A act-well | L4 需要学生试用与修订记录 |
| Q06 | 量子谐振子 | 大学 | P2 | 一维连续体 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/quantum.rs infinite_well_and_oscillator_levels | L quantum | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| Q07 | 有限势垒与隧穿 | 大学 | P2 | 一维连续体 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/quantum.rs barrier_transmission_matches_the_average | L quantum | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| Q08 | 高斯波包与自由演化 | 大学 | P2 | 一维连续体 | 部分实现 · L2 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×3；test:loop3 quantumRun packet vs Q08 (σ(t), ⟨x⟩(t), norm) with grid and step convergence；test:loop3 absorber loss is reported apart from discretization error | L quantum；A act-packet | L4 需要学生试用与修订记录 |
| Q09 | 自旋与量子测量 | 大学 | P2 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| Q10 | 两能级与 Rabi 振荡 | 大学 | P2 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| Q11 | 纠缠与密度矩阵（受限） | 大学、研究生 | P3 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×3 | 模型页 | Bell 态联合概率与约化熵；一般密度矩阵演化暂缓 |
| Q12 | 微扰与变分近似（受限） | 大学、研究生 | P3 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×3 | 模型页 | 一阶能量与高斯变分；收敛的数值谱作参照见量子实验室 |
| Q13 | 费米与玻色统计（受限） | 大学、研究生 | P3 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×3 | 模型页 | 占据数；粒子数归一与凝聚暂缓 |
| Q14 | 晶格与紧束缚能带（受限） | 大学、研究生 | P3 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×3 | 模型页 | 一维色散；态密度、填充与能隙暂缓 |

### N 原子核与粒子

依赖：P0 公共基础（ENG01 量纲、ENG02 常数、ENG10 独立验证、ENG13 运行清单）与后端 nuclear、decay、particles。

| ID | 模型族 | 学段 | 优先级 | 几何 | 基线 | 26.56 | 教学 | 完成 | 独立证据 | 关联 | 差距与限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| N01 | 放射性衰变与半衰期 | 高中 | P1 | 无空间几何 | 已验证 · L2 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×3；test:loop3 decay Monte Carlo: fixed seed regression and many-seed distribution (mean, variance, χ²)；rust:src/labs/decay.rs counts_follow_the_law_within_three_sigma | L decay；A act-decay | L4 需要学生试用与修订记录 |
| N02 | 衰变链与简并寿命 | 大学 | P2 | 无空间几何 | 已验证 · L1 | **已验证 · L3** | 活动＋证据 | 是 | oracle ×4；test:loop3 decayChain vs N02 (equal and nearly equal constants, total conserved)；rust:src/labs/nuclear.rs bateman_chains | L nuclear；A act-chain | L4 需要学生试用与修订记录 |
| N03 | 核反应配平与 Q 值 | 高中、大学 | P1 | 无空间几何 | 部分实现 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/nuclear.rs textbook_q_values；test:particles2656 reaction validator scope | L nuclear | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| N04 | 质量亏损与结合能 | 高中 | P1 | 无空间几何 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/nuclear.rs textbook_q_values | L nuclear | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| N05 | 卢瑟福散射 | 大学 | P2 | 平面运动 | 已验证 · L2 | **已验证 · L2** | 内容 | — | oracle ×3；rust:tests/electric.rs coulomb_scattering_conserves_energy | T alpha-scattering | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| N06 | 射线衰减与相互作用 | 高中、大学 | P2 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| N07 | 探测计数与泊松统计 | 大学 | P2 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| N08 | 活度 吸收剂量与单位 | 高中、大学 | P2 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| N09 | 分支过程与链式反应思想（受限） | 高中、大学 | P3 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×4 | 模型页 | 期望与临界分类；随机实现与灭绝概率暂缓 |
| N10 | 聚变与恒星能源 | 高中、大学 | P2 | 无空间几何 | 部分实现 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/nuclear.rs textbook_q_values | L nuclear | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| N11 | 粒子目录与守恒选择（受限） | 大学、研究生 | P3 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×3；test:particles2656 conservation rules | L nuclear | 能量阈值与守恒规则（粒子过程校验器）；截面与动力学暂缓 |
| N12 | 核素图与数据溯源 | 高中、大学 | P2 | 无空间几何 | 部分实现 · L1 | **已验证 · L1** | 内容 | — | oracle ×4 | L nuclear | 交互内容未与本模型逐项对照，只交付受限解析计算；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |

### R 相对论

依赖：P0 公共基础（ENG01 量纲、ENG02 常数、ENG10 独立验证、ENG13 运行清单）与后端 relativity。

| ID | 模型族 | 学段 | 优先级 | 几何 | 基线 | 26.56 | 教学 | 完成 | 独立证据 | 关联 | 差距与限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | 时间延缓与长度收缩 | 高中、大学 | P1 | 一维连续体 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×4；rust:src/labs/relativity.rs textbook_values | L relativity | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| R02 | 洛伦兹变换与同时性 | 大学 | P2 | 一维连续体 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×4；rust:src/labs/relativity.rs textbook_values | L relativity | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| R03 | 相对论速度合成 | 高中、大学 | P1 | 一维连续体 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×5；rust:src/labs/relativity.rs textbook_values | L relativity | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| R04 | 相对论能量与动量 | 大学 | P2 | 一维连续体 | 已验证 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/relativity.rs textbook_values | L relativity | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| R05 | 固有时与双生子模型 | 大学 | P2 | 一维连续体 | 部分实现 · L1 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/relativity.rs textbook_values | L relativity | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| R06 | 弱引力场与引力红移（受限） | 大学、研究生 | P3 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×4 | 模型页 | 均匀场一阶频移；完整度规与卫星钟暂缓 |
| R07 | 史瓦西时空与光线偏折（受限） | 大学、研究生 | P3 | 平面运动 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×4 | 模型页 | 弱场偏折（一阶与二阶）与俘获判据；强场测地线积分暂缓 |
| R08 | 恒星辐射与尺度 | 高中、大学 | P2 | 三维 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |

### X 高级与研究生专题（受限）

依赖：P0 公共基础（ENG01 量纲、ENG02 常数、ENG10 独立验证、ENG13 运行清单）与后端 models（受限解析）。

| ID | 模型族 | 学段 | 优先级 | 几何 | 基线 | 26.56 | 教学 | 完成 | 独立证据 | 关联 | 差距与限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| X01 | 泊松方程与静电边值（受限） | 大学 | P2 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×4 | 模型页 | 一维匀质 Dirichlet 问题；多维网格求解暂缓（静电实验室 fieldAt 处理点电荷叠加） |
| X02 | 黏性流场与 CFD（受限） | 大学、研究生 | P3 | 二维截面（每米或给定厚度） | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×4 | 模型页 | 平板 Couette–Poiseuille 解析剖面；数值流场求解暂缓 |
| X03 | 弹性有限元与振型（受限） | 大学、研究生 | P3 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×3 | 模型页 | 单自由度固有频率；有限元装配与振型暂缓 |
| X04 | 热方程与热应力（受限） | 大学、研究生 | P3 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×3 | 模型页 | 均匀升温的约束热应力；热—力耦合求解暂缓 |
| X05 | 线圈磁通与电路耦合 | 大学 | P2 | 集中参数网络 | 未实现 · L0 | **已验证 · L2** | 内容 | — | oracle ×3；rust:src/labs/transient.rs rl_and_discharge | 模型页 | L3 需要收敛研究、有效域边界与闭环基准；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| X06 | 等离子体与 MHD 分层（受限） | 研究生 | P3 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×3 | 模型页 | 等离子体频率、Debye 长与等离子体参数；动力学求解暂缓 |
| X07 | 分子动力学与系综（受限） | 大学、研究生 | P3 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 无 | — | oracle ×3 | 模型页 | Lennard-Jones 对势、力与极小点；分子动力学积分暂缓 |
| X08 | 参数反演与可辨识性 | 大学 | P2 | 一维连续体 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×3 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| X09 | 反馈控制与状态空间 | 大学 | P2 | 无空间几何 | 未实现 · L0 | **已验证 · L1** | 内容 | — | oracle ×4 | 模型页 | 只有受限解析计算（模型计算器），无交互仿真；有内容链接，无带证据的活动；L4 需要学生试用与修订记录 |
| X10 | 经典场与量子场入门（受限） | 研究生 | P3 | 无空间几何 | 部分实现 · L0 | **已验证 · L1** | 无 | — | oracle ×3 | 模型页 | 自由场单模色散与能级；相互作用量子场暂缓 |

## 5 学习活动注册

| 活动 | 标题 | 学段 | 模型 | 先修 | 诊断 | 核心题 | 迁移题 | 控变量实验 | 评分维度 | 打开 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| act-float | 预测沉浮：密度与浮力 | 初中 | F02 | — | 1 | 4 | 2 | rhoB ×6 |  | floating-block |
| act-units | 单位、量纲与温标 | 初中 | G06, G01 | — | 1 | 3 | 2 | T1 ×4 |  | — |
| act-freefall | 自由落体与事件前后 | 高中 | M03 | act-units | 1 | 3 | 2 | e ×4 |  | free-fall |
| act-incline | 斜面受力分析（可全键盘完成） | 高中 | M07 | act-static, M02, M08 | 1 | 4 | 2 | theta ×4 |  | incline |
| act-static | 静摩擦的阈值 | 高中 | M08 | — | 1 | 3 | 2 | F ×6 |  | pull-force |
| act-series | 串联与并联 | 初中 | E09 | — | 1 | 4 | 2 | R2 ×4 |  | circuit series |
| act-meter | 电表内阻与测量干扰 | 高中 | E13 | act-series | 1 | 3 | 1 | RV ×4 |  | circuit divider |
| act-rc | RC 充电：测时间常数 | 高中 | E15 | act-series | 1 | 4 | 2 | R ×4 |  | circuit rc |
| act-lc | LC 振荡的能量交换 | 高中 | E17 | act-rc | 1 | 4 | 2 | C ×3 |  | circuit lc |
| act-rail | 导轨上的电磁感应 | 高中 | B11, B10 | act-series, B10 | 1 | 4 | 1 | R ×4 |  | rail-force |
| act-gas | 理想气体的四个过程 | 高中 | T10 | T08, T09 | 1 | 3 | 2 | V2 ×4 |  | gas |
| act-well | 无限深势阱的能级 | 大学 | Q05 | Q03 | 1 | 3 | 1 | Lw ×3 |  | quantum |
| act-packet | 自由高斯波包的扩展 | 大学 | Q08, G07 | act-well | 1 | 4 | 2 | t ×4 |  | quantum |
| act-decay | 衰变的统计规律 | 高中 | N01, G08 | — | 1 | 4 | 1 | t ×4 |  | decay |
| act-chain | 衰变链与相等寿命 | 大学 | N02 | act-decay | 1 | 3 | 2 | l2 ×4 |  | nuclear |

## 6 复现

```
node scripts/coverage.mjs --check        # 只检查引用与状态
node scripts/coverage.mjs                # 重新生成本文件与 coverage-26.56.json
python3 scripts/oracles/build.py         # 重新生成独立参照（需要 mpmath）
npx vitest run tests/models2656.test.ts  # 注册模型对独立参照
```
