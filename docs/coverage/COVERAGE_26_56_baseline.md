# VeloPhi 26.56 覆盖矩阵（基线：26.55，提交 f71a4ff）

本文件是 26.56 开发开始时对照两份文档（《能力蓝图》《模型与例题全集》）逐项核对的**基线矩阵**，以及本版的实施计划。核对依据是仓库实际代码与测试，不以 README 的功能名称判定完成。实施后的状态见本文件第 6 节（由 `scripts/coverage.mjs` 根据注册数据重新生成）。

## 0 基线核对

- 维护者电脑 `E:\VeloPhi`：`main` 分支 HEAD = `f71a4ffd1b3c0e470987e7d8d46d851af2025585`（“update v26.55”），`git status` 无改动；HEAD 之后没有新的提交。只读命令：`GIT_OPTIONAL_LOCKS=0 git log`、`git status --short`。
- 开发容器的工作副本与维护者电脑逐文件 SHA-256 比对：567 个受控文件中 565 个相同，`.gitattributes` 与 `roadmap.txt` 只在电脑上（不影响构建，已取回）。
- 仓库中没有 `AGENTS.md`；适用规则取自维护者在会话中给出的约束（不做 Git 写操作、不使用子代理、旧发布不动等）与 `docs/DEV_MANUAL_26_55.md`、`engine/ABI.md`、`engine/CALC.md`、`engine/MESSAGES.md`、`engine/PORTING.md`、`docs/dev/STREAMING.md`。

### 0.1 文档点名的基线问题（A01–A06）

| 编号 | 文档的描述 | 26.55 实际代码 | 结论 |
| --- | --- | --- | --- |
| A01 | 通用 Dim 仍为长度质量时间三维 | `engine/velophi-core/src/expr.rs:347` `pub type Dim = [f64; 3]`；前端 `src/formula/units.ts` 已是 [L, M, T, Q] 四维（26.54 D78，以电荷而非电流为基量） | 属实，且两端不一致；需修复 |
| A02 | 学习路径打开内容即 setDone | `src/app/learn/actions.ts` `openStep()` 在 `ok` 后调用 `setDone(s, true)`，进度存 `settings.ui.learnDone` | 属实；需改为“已访问”并迁移 |
| A03 | 磁场模块用 CODATA2018 的 μ0 | `labs/magnet.rs:18` `MU0 = 1.25663706212e-6`（注释 CODATA 2018）；另 `labs/nuclear.rs` 的 u、mₑ、康普顿波长也是 2018 值 | 属实，范围比文档所述更广；需常数集合 |
| A04 | 二维几何应作为模型定义 | 磁矢势为每米截面（注释）、液体 `depth` 为厚度（regions.rs） | 语义存在于代码，未作为模型元数据显示 |
| A05 | 核反应校验器不能充当一般粒子过程校验器 | `labs/nuclear.rs` `reaction()` 只比较核子数与电荷；`nu` 不区分中微子与反中微子 | 属实；需独立的粒子过程校验器 |
| A06 | 公式一致与物理验证需区分 | 公式卡只有“一致／偏差”；Rust–TS 指纹对照是移植回归 | 属实；需 referenceKind 与 regressionKind |

## 1 状态与成熟度定义

- **已验证**：仓库有自动测试把该模型的计算与独立参照（手写闭式、另一算法或外部数据）比较，并覆盖文档验证要求的主要项。
- **部分实现**：有实现，但只覆盖模型的一部分或验证要求的一部分。
- **存在但待验证**：有实现，没有独立的自动测试。
- **未实现**；**明确暂缓**（写明依赖与保留接口）。
- 成熟度 L0 概念或示意；L1 条件受限的解析计算；L2 可交互数值仿真（事件、无伪输出）；L3 验证过的领域能力（独立基准、收敛、有效域、回归）；L4 验证过的教学活动（需要学生试用与修订记录——本版没有学生试用，因此不标 L4）。

## 2 需求项（ENG、FOR、EDU、UX）

| 编号 | 优先级 | 需求 | 基线状态 | 基线实现与证据 | 差距 | 26.56 计划 |
| --- | --- | --- | --- | --- | --- | --- |
| ENG01 | P0 | 单位与类型 | 部分实现 | TS 4 维 [L,M,T,Q]（formula/units.ts），Rust 3 维（expr.rs）；显示单位表 units/units.ts | 七量纲、温度仿射、物质的量与发光强度缺失；两端不一致 | Rust 与 TS 统一为 L M T I Θ N J；温度分绝对温度与温差；°C 仿射换算；显示单位增加温度、压强、密度、体积、物质的量等 |
| ENG02 | P0 | 常数 材料与数据 | 部分实现 | 常数散在各实验模块（magnet.rs μ0 = CODATA2018，nuclear.rs u、mₑ、λC = 2018，atom.rs 2019 SI 定义值），AME2020 表与 SEMF 估计已区分 | 无常数集合与版号；旧场景锁定原版的机制缺失 | constants.rs：CODATA2018 与 CODATA2022 两套（值、单位、标准不确定度、来源）；请求带 constantsSet，旧文件默认 2018，新实验默认 2022；数据版号 dataSetVersion |
| ENG03 | P0 | 几何与坐标 | 部分实现 | magnet.rs 注释写明二维截面每米；液体 depth 为垂直纸面的厚度 | 几何语义未作为模型定义，界面不显示 | ModelSpec.geometry（平面运动、二维截面每米、平面内三维点电荷、轴对称、一维、集中参数、三维）；实验页与模型页显示几何标签 |
| ENG04 | P0 | 场景与初边值 | 部分实现 | 场景加载 scene.rs 诊断键（MESSAGES.md）；电路 issues（浮动、冲突…） | 模型计算器无诊断 | 模型计算返回诊断：缺输入、非法域、无解、多解 |
| ENG05 | P0 | 时间与事件 | 已验证 | 事件定位（events.rs）、事件前后状态（event op）、阶段与分支 | — | 沿用；在活动与运行清单中引用事件前后 |
| ENG06 | P1 | 求解器选择 | 部分实现 | 刚体：多积分器（含 Gauss–Legendre）与 Moreau–Jean；电路：梯形法 MNA；量子：分步傅里叶；波：蛙跳 | PDE 与本征值插件化未做 | 沿用；量子实验增加网格／步长收敛研究 |
| ENG07 | P1 | 约束与接触 | 已验证 | D73 最小范数选择（physics2653.test.ts）与警告 | 最小范数在界面标为“数值约定” | 沿用；模型 SV10 标注求解约定 |
| ENG08 | P2 | PDE 与边界 | 未实现 | 无通用 PDE | — | 暂缓（P2–P3，X01 受限解析） |
| ENG09 | P1 | 耦合守恒 | 部分实现 | 导轨回路与焦耳热写入账本（D90）；电路能量 ∫UI dt、电动机机械功 | 跨模块重复入账的系统检查 | B10 B11 E14 的能量闭合基准 |
| ENG10 | P0 | 独立验证 | 部分实现 | 大量手写解析值测试（acceptance.test.ts 等）与 Rust 单元测试；Rust–TS 指纹对照 | 对照类型未区分；公式卡未标独立性 | referenceKind 与 regressionKind；每个模型族的独立 oracle（mpmath，另一实现与方法） |
| ENG11 | P0 | 误差与诊断 | 部分实现 | 公式卡 absError／relError；NaN 显示为“—” | 未统一 e = |q−qref|/max(|qref|, qscale)；百分比分母不明 | 模型基准与活动评分使用带单位的缩放误差；NaN、未收敛不显示为 0 |
| ENG12 | P1 | 守恒与通量 | 部分实现 | 能量账本、电路能量 | KCL 残差不可查 | 电路 KCL 残差（独立计算）；量子范数；随机过程归一 |
| ENG13 | P0 | 记录与复现 | 部分实现 | 场景指纹、检查点、分支继承账本 | 无 physicsVersion、solverVersion、constantsSet 的统一运行清单 | RunManifest（Rust 提供版本与常数，场景 SHA-256），导出时随附 |
| ENG14 | P1 | 性能与取消 | 已验证 | D97：结果不变的性能优化；运行可取消 | — | 沿用；新功能不改 77 个模板指纹 |
| ENG15 | P1 | 数据接口与导出 | 部分实现 | CSV、报告、课件导出 | CSV 缺运行元数据 | CSV 头部写运行清单；实验与活动导出 JSON（参数、结果、常数、版本） |
| ENG16 | P1 | 内容和插件注册 | 部分实现 | 模板、实验、题目各自注册 | 无模型族注册；三者未关联 | src/content/models：180 个 ModelSpec，关联模板、实验、题目、公式、基准与活动；公式为受限 AST |
| ENG17 | P0 | 兼容与迁移 | 部分实现 | 场景格式 7、实验室文件 2、旧名兼容 | learnDone 语义为“已打开” | learnDone 迁为“已访问”，不生成掌握记录；实验文件 3 带常数集合 |
| ENG18 | P1 | 可靠性与内容治理 | 部分实现 | 三语文本测试、文件错误提示 | 无审阅记录 | 模型注册记录 review 字段（物理、教学、语言） |
| FOR01 | P0 | 注册字段 | 部分实现 | FormulaDef：id、situation、expr、unit、measure、requires、approxOf | 无来源、有效域、先修与语义 ID | FormulaSpec：formulaId、版本、来源、符号的语义 ID 与量纲、条件、有效域、推导 |
| FOR02 | P0 | 语义 AST | 部分实现 | 受限表达式语言（expr.rs／formula/expr.ts），LaTeX 由 AST 生成 | 量纲三／四维 | 七量纲推断；新增 sinh、cosh 等函数 |
| FOR03 | P0 | 参数与数据来源 | 部分实现 | 情形样本变量带 ref（D72） | 来源类别未区分 | 模型计算输出区分给定、常数（含版号）、派生 |
| FOR04 | P0 | 适用条件 | 部分实现 | 条件 ok／approx／fail（CondStatus） | 缺“信息不足”状态 | 模型条件四态：适用、不适用、信息不足、近似适用，带原因 |
| FOR05 | P1 | 求解与分支 | 部分实现 | 情形分支（如 slideUp／slideDown／stick） | 无求未知数、无解与多解 | modelSolve：在给定区间求根，报告无解／单解／多解与物理筛选 |
| FOR06 | P0 | 对照独立性 | 未实现 | 公式卡一律“一致／偏差” | 未区分解析独立、同源一致、守恒检查 | 公式库 ref 字段与卡片标签；Rust–TS 对照标为移植回归 |
| FOR07 | P0 | 误差度量 | 部分实现 | absError、relError | 无按量纲缩放 | 缩放误差 qscale（模型基准与评分） |
| FOR08 | P1 | 推导与步骤 | 已验证 | 三语推导（derivations/*）与代入步骤（trace） | — | 沿用；模型页显示条件与推导链 |
| FOR09 | P1 | 跨表征 | 部分实现 | 变量 ref 定位画面元素（D72）、公式时间线 | — | 沿用 |
| FOR10 | P2 | 符号等价与答案 | 未实现 | — | — | 暂缓 |
| EDU01 | P0 | 目标与证据 | 未实现 | 学习路径只有“已打开” | 访问、练习、掌握证据未分开 | 三种记录分开；活动带目标与证据类别 |
| EDU02 | P1 | 先修图与课程包 | 部分实现 | 学习路径按学段排序 | 无先修关系 | 模型与活动的 prerequisites |
| EDU03 | P1 | 诊断与误概念 | 未实现 | — | — | 概念诊断题：选项对应误概念与针对性反馈 |
| EDU04 | P1 | 深度和支架 | 部分实现 | 学段与公式分级（levels.ts） | — | 逐级提示 |
| EDU05 | P1 | 预测 观察 解释 | 部分实现 | 预测面板（数值＋备注） | 理由与修订未单列 | 活动中的预测＋理由，运行后修订解释 |
| EDU06 | P1 | 实验设计 | 部分实现 | 参数扫描 | — | 活动的控变量步骤 |
| EDU07 | P1 | 多表征与过程证据 | 部分实现 | 受力图、纸带、面积、能量图 | 过程证据未记录 | 活动记录过程证据 |
| EDU08 | P2 | 真实数据与迁移 | 未实现 | — | — | 暂缓 |
| EDU09 | P1 | 题型与评分 | 部分实现 | 数值题统一 2 % 容差 | 评分不分概念、单位、方向、建模、计算、解释 | 评分分维度；每个量独立容差；单位与方向检查 |
| EDU10 | P1 | 有约束的参数化 | 部分实现 | “换一组数”在 vary 范围内随机，答案读自仿真 | 不检查物理前提与可解性 | 约束参数化：先由 Rust 模型判定条件与可解性，固定种子可重现 |
| EDU11 | P1 | 提示与反馈 | 部分实现 | 题目 hint 与 explain | — | 分级提示，记录求助但不惩罚 |
| EDU12 | P2 | 熟练度与复习 | 未实现 | — | — | 证据充分判定（规则可见），复习暂缓 |
| EDU13 | P1 | 活动编辑器 | 部分实现 | 题目包编辑（课件对话框） | — | 教师把活动复制为参数化题、预览多组参数、校验 |
| EDU14 | P1 | 教师使用 | 部分实现 | 演示与题目模式 | — | 沿用 |
| EDU15 | P2 | 交换与分享 | 未实现 | — | — | 暂缓（不声称 QTI／LTI） |
| EDU16 | P1 | 学习数据与离线 | 部分实现 | 本地设置与试用日志 | 学生无法导出与清除学习记录 | 学习记录查看、导出与清除 |
| EDU17 | P1 | 可访问学习 | 部分实现 | 可聚焦画布、aria-live（26.55） | — | 活动键盘可用；M07 键盘任务 |
| EDU18 | P2 | AI 辅导与教学有效性 | 未实现 | — | — | 暂缓 |
| UX01 | — | 按目标找到合适内容 | 部分实现 | 全局搜索（模板、实验、题目、手册） | 不能按保真度与成熟度检索 | 模型目录：主题、学段、先修、成熟度筛选；全局搜索收录模型 |
| UX02 | — | 在沙盒 实验 题目间切换 | 已验证 | 页面与题目模式 | — | 沿用 |
| UX03 | — | 看懂学习进度 | 未实现 | 只有“已打开” | — | 已访问／已练习／掌握证据分开显示 |
| UX04 | — | 判断结果适用范围 | 未实现 | — | — | 模型标签：几何、厚度、假设、常数与数据版本 |
| UX05 | — | 发现与修正不适用公式 | 部分实现 | 公式卡“不适用”带条件文字 | — | 四态条件与原因 |
| UX06 | — | 关联变量和物体 | 已验证 | D72 变量定位 | — | 沿用 |
| UX07 | — | 看懂精度与数值状态 | 未实现 | — | — | 解析／数值／同源／示意标签 |
| UX08 | — | 管理运行和失败 | 部分实现 | 运行状态与取消 | — | 模型计算与活动的失败状态 |
| UX09 | — | 对比实验分支 | 已验证 | 分支（branches.ts） | — | 沿用；量子收敛表同单位对比 |
| UX10 | — | 分阶段学习 | 部分实现 | 题目模式隐藏答案 | — | 活动先预测后看答案 |
| UX11 | — | 编辑并发布教学活动 | 部分实现 | 题目包 | — | 参数化题预览与校验 |
| UX12 | — | 使用键盘和辅助技术 | 部分实现 | 可聚焦画布、快捷键 | — | M07 键盘任务验收与修正 |
| UX13 | — | 在不同设备上连续工作 | 已验证 | 窄屏与触屏布局（26.55） | — | 新界面同样适配 |
| UX14 | — | 保存和交换结果 | 部分实现 | 场景、题目、CSV | 缺条件与版本 | 导出带运行清单 |

## 3 全部 180 个模型族（基线）

学段、优先级取自《模型与例题全集》。“26.56 计划”是本版目标；实际结果见第 6 节。


### 量纲 测量与数值基础

| ID | 模型族 | 学段 | 优先级 | 基线状态 | 基线 L | 基线实现 | 基线测试 | 差距 | 26.56 计划 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G01 | 单位换算与前缀 | 初中 | P1 | 部分实现 | L1 | src/units/units.ts 显示单位表（km/h、g、cm…），输入在提交时换算为 SI | tests/units.test.ts（读数与公式的 SI 单位一致） | 无“保存再载入＋三语切换后 SI 不变”的组合测试；温度、物质的量等单位缺失 | 闭环一：独立基准（仿真 vs 解析、事件前后）、活动（预测＋理由、诊断、迁移）；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| G02 | 矢量分解与坐标变换 | 高中 | P1 | 部分实现 | L1 | 受力图 src/teaching/fbd.ts、矢量箭头、vx/vy 读数 | tests/teaching2652.test.ts free-body diagram（沿接触面的分量） | 没有可旋转坐标系；分量随坐标系变换、模与点积不变未测 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| G03 | 采样 微分与积分 | 高中至大学 | P1 | 部分实现 | L2 | 纸带 src/teaching/tape.ts（逐段平均速度）、面积 src/teaching/area.ts、calc `simpson` | tests/teaching2652.test.ts（纸带与面积） | 没有中心差分与端点单侧公式的通用工具；采样率改变后的误差比较未提供 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| G04 | 线性拟合与残差 | 高中至大学 | P1 | 未实现 | L0 | 无（参数扫描 src/analysis/sweep.ts 只列表，不拟合） | — | 缺最小二乘拟合、残差、拟合区间与保留原始点 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| G05 | 不确定度与相关性 | 大学 | P1 | 未实现 | L0 | 无 | — | 缺不确定度传播（独立与相关）与误差条语义 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| G06 | 量纲检查与温标 | 高中至大学 | P1 | 部分实现 | L1 | Rust expr.rs Dim 为 [L, M, T] 三维；TS formula/units.ts 为 [L, M, T, Q] 四维（26.54 D78 以电荷为第四基量） | tests/custom.test.ts、derivations*.test.ts（量纲一致） | A01：不是七个 SI 基本量纲；无温度（绝对与温差）语义与摄氏仿射换算；两端维数不一致 | 闭环一：独立基准（仿真 vs 解析、事件前后）、活动（预测＋理由、诊断、迁移）；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| G07 | 时间步与网格收敛 | 大学 | P1 | 未实现 | L0 | 量子与波实验可改网格，但无收敛研究工具 | — | 缺三档细化、观测阶数与 Richardson 外推 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| G08 | 随机种子与统计误差 | 大学 | P1 | 部分实现 | L1 | 放射性衰变 labs/decay.rs 有 seed | decay.rs same_seed_same_sequence、counts_follow_the_law_within_three_sigma | 没有多种子分布与标准误差的报告界面 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |

### 力学与分析力学

| ID | 模型族 | 学段 | 优先级 | 基线状态 | 基线 L | 基线实现 | 基线测试 | 差距 | 26.56 计划 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M01 | 匀速运动与参考系 | 初中 | P1 | 部分实现 | L2 | 模板 uniform-motion；情形 uniform（uni.*） | tests/models.test.ts、golden.test.ts | 没有参考系变换与反向变换 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M02 | 匀变速直线运动 | 高中 | P1 | 已验证 | L2 | 模板 pull-force；情形 const-force（cf.*）；题 k-pull | tests/models.test.ts、acceptance.test.ts | 无收敛与有效域记录；非恒定加速度时撤下结论已由条件实现 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M03 | 自由落体与事件时刻 | 高中 | P1 | 已验证 | L2 | 模板 free-fall；情形 projectile（ff.*）；题 k-free-fall；事件 impact 前后 | tests/models.test.ts、acceptance.test.ts（事件 1e-9 s） | 公式卡对照未标记独立性；“落地前／碰撞后”的学习活动缺失 | 闭环一：独立基准（仿真 vs 解析、事件前后）、活动（预测＋理由、诊断、迁移）；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M04 | 斜抛运动 | 高中 | P1 | 已验证 | L2 | 模板 projectile；情形 projectile（pr.*）；题 p-* | acceptance.test.ts 5 projectile | 高台抛出时同高射程式的“不适用”提示需核对；独立性标签缺失 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M05 | 追及与分段运动 | 高中 | P1 | 存在但待验证 | L2 | 模板 pursuit | golden.test.ts（指纹回归） | 无相遇事件的公式与分支（反向、无追及、中途变速） | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M06 | 两绳悬挂与静力平衡 | 高中 | P1 | 存在但待验证 | L2 | 模板 two-ropes | golden.test.ts | 无静力平衡公式卡；松绳分支未单独验证 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M07 | 粗糙斜面滑动 | 高中 | P1 | 已验证 | L2 | 模板 incline、slope-up、incline-efficiency；情形 incline（incline.*）；题 k-incline | acceptance.test.ts 1 incline slider；models.test.ts | 公式卡的对照独立性未标记；键盘完成任务未验收 | 闭环一：独立基准（仿真 vs 解析、事件前后）、活动（预测＋理由、诊断、迁移）；任务四 UI 验收；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M08 | 静摩擦阈值与滑动切换 | 高中 | P1 | 已验证 | L2 | 情形 incline（stick、staticHolds）、flat；题 f-incline-rest、f-table-rest | acceptance.test.ts（μ = 0.7 静止 f = mg sinθ；m2 ≤ μs m1 静止） | 临界值两侧与重粘连未成组测试；概念诊断（静摩擦≠μsN）缺失 | 闭环一：独立基准（仿真 vs 解析、事件前后）、活动（预测＋理由、诊断、迁移）；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M09 | 功 能量与机械效率 | 初中至高中 | P1 | 已验证 | L2 | 能量账本 observe.rs、效率读数（26.55 D92b）；模板 incline-efficiency | models.test.ts 账本闭合 | 输入功为零时不计算效率的分支待核对 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M10 | 超重 失重与加速度计 | 高中 | P1 | 存在但待验证 | L2 | 模板 elevator | golden.test.ts | 无支持力公式卡与接触失效分支 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M11 | 阿特伍德机 | 高中 | P1 | 已验证 | L2 | 模板 atwood；情形 atwood | acceptance.test.ts 8b | 到达滑轮停止（R13）已有；滑轮有惯量时两侧张力不同未覆盖 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M12 | 动滑轮与绳长约束 | 初中至高中 | P1 | 已验证 | L2 | 模板 movable-pulley；情形 movable-pulley | pulleys.test.ts、models.test.ts | 加轮重或损耗后的重新计账未单独测试 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M13 | 板块与相对滑动 | 高中 | P1 | 已验证 | L2 | 模板 board-block；情形 board-block、board-together | acceptance.test.ts 2 | F 扫描穿越临界值自动换分支未测 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M14 | 传送带与共速事件 | 高中 | P1 | 已验证 | L2 | 模板 conveyor、conveyor-incline | acceptance.test.ts 3 | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M15 | 可动斜面与系统动量 | 大学 | P2 | 已验证 | L2 | 模板 movable-wedge；情形 wedge | models.test.ts movable wedge | 固定斜面极限未成组 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M16 | 弹簧与能量交换 | 高中 | P1 | 已验证 | L2 | 模板 spring、spring-blocks | acceptance.test.ts 6；models.test.ts | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M17 | 一维弹性碰撞 | 高中 | P1 | 已验证 | L2 | 模板 collision-1d、three-balls；情形 collision | acceptance.test.ts 4 | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M18 | 完全非弹性碰撞 | 高中 | P1 | 已验证 | L2 | 模板 collision-1d（e = 0）；情形 collision（col.in.*） | acceptance.test.ts 4 | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M19 | 斜碰与接触冲量 | 大学 | P2 | 已验证 | L2 | 模板 collision-2d、bouncing-ball、slider-stop；情形 collision、bounce | acceptance.test.ts 4、physics2652.test.ts | 多点摩擦碰撞仅有警告（D37），无额外模型 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M20 | 转动惯量与定轴转动 | 大学 | P2 | 已验证 | L2 | 模板 hinged-rod、motor-disc、gears；情形 rotation、spin、gear | acceptance.test.ts 7、physics2651.test.ts | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M21 | 杠杆与力矩平衡 | 初中 | P1 | 已验证 | L2 | 模板 lever、wheel-axle；情形 lever；题 f-lever | models.test.ts | 倾斜施力与杆自重的分支待核对 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M22 | 纯滚动 | 大学 | P2 | 已验证 | L2 | 模板 rolling、rolling-resistance；情形 rolling | acceptance.test.ts 7、physics2652.test.ts | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M23 | 滑动到滚动 | 大学 | P2 | 已验证 | L2 | 模板 rolling-slip；情形 roll-slip | models.test.ts rolling with slipping | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M24 | 竖直圆周与轻绳临界条件 | 高中 | P1 | 已验证 | L2 | 模板 vertical-circle-rope；情形 vcircle-rope | models.test.ts vertical circle on a rope | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M25 | 竖直圆周与轻杆 | 高中至大学 | P2 | 已验证 | L2 | 模板 vertical-circle-rod；情形 vcircle-rod | models.test.ts vertical circle on a rod | 恰以零速到顶点的极限未单独测 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M26 | 两体引力与开普勒轨道 | 高中至大学 | P2 | 已验证 | L2 | 模板 orbit、kepler、binary-star；情形 orbit | physics2651.test.ts gravitation | 长期相位与近地点漂移未监控 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M27 | 宇宙速度与逃逸 | 高中 | P1 | 部分实现 | L2 | 模板 cosmic-velocity（情形 orbit） | golden.test.ts | 无逃逸阈值的束缚／非束缚分支公式 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M28 | 阻力与终端速度 | 高中至大学 | P2 | 已验证 | L2 | 模板 drag-fall、sinking-ball；情形 drag | physics2651.test.ts drag | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M29 | 变力 冲量与数值积分 | 大学 | P2 | 已验证 | L2 | 模板 variable-force；情形 var-force | models.test.ts variable force | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M30 | 弹性杆与梁挠度 | 大学 | P2 | 未实现 | L0 | 无（刚体模型） | — | 弹性杆与梁需要连续介质或解析模块 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M31 | 拉格朗日单摆 | 大学 | P2 | 部分实现 | L0 | 手册 concept math 提及；observe.rs 有拉格朗日量读数 | — | 无广义坐标推导与牛顿约束求解的交叉比较 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| M32 | 哈密顿方法与对称性 | 大学至研究生 | P3 | 部分实现 | L1 | PhasePlot.vue 相图；Gauss–Legendre 辛积分器（D61） | physics2652.test.ts Gauss–Legendre | 无哈密顿量与相空间教学模型 | 受限解析 L1（哈密顿量与相轨道（解析）），完整后端暂缓 |

### 流体与连续介质

| ID | 模型族 | 学段 | 优先级 | 基线状态 | 基线 L | 基线实现 | 基线测试 | 差距 | 26.56 计划 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | 液体压强 | 初中 | P1 | 部分实现 | L1 | regions.rs 液体：物体中心处的表压读数 | regions.rs 测试（间接） | 无绝对压强与 p0 选择；零点与单位切换未测 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| F02 | 浮力与沉浮 | 初中 | P1 | 已验证 | L2 | regions.rs 浸入面积 × 厚度 depth；模板 floating-block、densities、weigh-in-water、rising-block、sinking-ball、loaded-boat | engine/velophi-core/tests/regions.rs floating_block_draft_and_archimedes | 厚度语义在界面上不突出；预测—实验—解释活动缺失（任务一） | 任务一 UI 验收；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| F03 | 浮体稳定性与浮心 | 大学 | P2 | 部分实现 | L2 | 浮力作用于浸入部分形心（隐含回复力矩） | — | 无 GM 与小角稳定性分析 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| F04 | 帕斯卡原理与液压 | 初中 | P1 | 未实现 | L0 | 无 | — | 帕斯卡原理与液压缺失 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| F05 | 连续性方程 | 高中至大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| F06 | 伯努利与流速压差 | 高中至大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| F07 | 泊肃叶流 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| F08 | 斯托克斯沉降 | 大学 | P2 | 部分实现 | L2 | 线性阻力（drag）可用于沉降 | physics2651.test.ts drag（一般线性阻力） | 无 Stokes 系数与 Re 适用性检查 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| F09 | 雷诺数与相似性 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| F10 | 表面张力与毛细 | 大学 | P2 | 部分实现 | L0 | 概念页 solids（表面张力与毛细） | — | 无计算 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| F11 | 应力应变与弹性波 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| F12 | 可压缩性与声速 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |

### 振动 波与声

| ID | 模型族 | 学段 | 优先级 | 基线状态 | 基线 L | 基线实现 | 基线测试 | 差距 | 26.56 计划 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W01 | 简谐振子 | 高中 | P1 | 已验证 | L2 | 模板 spring、vertical-spring、central-spring；情形 spring | acceptance.test.ts 6 | 相位与能量的长时验收可补 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| W02 | 单摆与小角近似 | 高中至大学 | P1 | 已验证 | L2 | 模板 pendulum、physical-pendulum；情形 pendulum（小角近似分级、椭圆积分精确周期） | acceptance.test.ts 6（5°、8°、30°） | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| W03 | 阻尼与三种响应 | 大学 | P2 | 已验证 | L2 | 模板 damped-spring；情形 damped | physics2651.test.ts damper | 临界与过阻尼分支未成组 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| W04 | 受迫振动与共振 | 高中至大学 | P2 | 存在但待验证 | L2 | 模板 resonance | golden.test.ts | 无稳态振幅与相位公式卡 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| W05 | 耦合振子与简正模 | 大学 | P2 | 部分实现 | L2 | 模板 coupled-oscillators、spring-blocks；情形 spring-pair | models.test.ts two blocks joined by a spring | 无简正模频率与本征向量 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| W06 | 双摆与混沌 | 大学至研究生 | P3 | 存在但待验证 | L2 | 模板 double-pendulum | golden.test.ts | 无有限时间 Lyapunov 与统计报告 | 受限解析 L1（有限时间指数增长估算），完整后端暂缓 |
| W07 | 弦上的行波 | 高中至大学 | P1 | 已验证 | L2 | labs/waves.rs 蛙跳法弦 | waves.rs pulse_travels_at_c_and_reflects、energy_is_kept_on_a_fixed_string | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| W08 | 界面反射与阻抗 | 大学 | P2 | 部分实现 | L2 | waves.rs 两种介质（c1、c2、split） | waves.rs（反射） | 无阻抗与反射系数的定量对照 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| W09 | 驻波与边界条件 | 高中 | P1 | 已验证 | L2 | waves.rs 驻波 | waves.rs standing_mode_is_exact_and_has_its_frequency | 网格细化下的收敛未报告 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| W10 | 多普勒效应 | 高中 | P1 | 已验证 | L1 | waves.rs doppler | waves.rs doppler_and_notes | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| W11 | 拍与叠加 | 高中 | P1 | 部分实现 | L1 | WaveLab 拍（sound op） | waves.rs doppler_and_notes | 拍频的时域包络与频谱未对照 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| W12 | 声强级与对数尺度 | 高中 | P1 | 部分实现 | L1 | sound op：声强与声强级 | waves.rs doppler_and_notes | 零强度的 dB 下限标签待核对 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| W13 | 傅里叶分析与采样混叠 | 大学 | P2 | 未实现 | L0 | 无（quantum.rs 有 FFT，未用于采样教学） | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| W14 | 色散与群速度 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |

### 热学与统计物理

| ID | 模型族 | 学段 | 优先级 | 基线状态 | 基线 L | 基线实现 | 基线测试 | 差距 | 26.56 计划 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | 比热与升温 | 初中 | P1 | 已验证 | L1 | labs/heat.rs 加热曲线 | heat.rs ice_to_steam | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| T02 | 潜热与加热曲线 | 初中 | P1 | 已验证 | L1 | labs/heat.rs 熔化与汽化平台 | heat.rs ice_to_steam | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| T03 | 热平衡与量热 | 初中 | P1 | 已验证 | L1 | labs/heat.rs heatMix | heat.rs mixing_reaches_the_weighted_mean | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| T04 | 热膨胀 | 高中 | P1 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| T05 | 热传导 | 高中至大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| T06 | 牛顿冷却 | 高中至大学 | P2 | 部分实现 | L1 | heatMix 的交换系数 k（指数趋近） | heat.rs | 无牛顿冷却独立模型 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| T07 | 热辐射与黑体 | 高中至大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| T08 | 理想气体状态方程 | 高中 | P1 | 已验证 | L1 | labs/gas.rs（R = 8.314462618） | gas.rs processes_satisfy_the_first_law_and_the_integral | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| T09 | 热力学第一定律 | 高中 | P1 | 已验证 | L1 | labs/gas.rs 第一定律 | gas.rs processes_satisfy_the_first_law_and_the_integral | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| T10 | 理想气体四类过程 | 高中至大学 | P1 | 已验证 | L1 | labs/gas.rs 四种过程 | gas.rs processes_satisfy_the_first_law_and_the_integral | 对照与功积分来自同一模块（需外部独立参照）；γ 与自由度一致性未检 | 闭环三：独立 oracle、收敛或统计检验、数据版号、活动；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| T11 | 卡诺热机与熵 | 高中至大学 | P1 | 部分实现 | L1 | labs/gas.rs 卡诺循环效率 | gas.rs cycle_efficiencies | 无熵变 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| T12 | 奥托循环 | 大学 | P2 | 已验证 | L1 | labs/gas.rs 奥托循环 | gas.rs cycle_efficiencies | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| T13 | 分子速率分布 | 大学 | P2 | 部分实现 | L0 | GasLab 中的分子为示意 | — | 无速率分布与采样统计 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| T14 | 系综 配分函数与两能级 | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（两能级配分函数），完整后端暂缓 |
| T15 | 随机游走与扩散 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| T16 | 伊辛模型与相变思想 | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（两自旋精确枚举），完整后端暂缓 |

### 静电与电路

| ID | 模型族 | 学段 | 优先级 | 基线状态 | 基线 L | 基线实现 | 基线测试 | 差距 | 26.56 计划 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E01 | 库仑力与叠加 | 高中 | P1 | 已验证 | L1 | labs/field.rs；模板 two-charges（情形 coulomb） | field.rs single_charge_field_is_coulomb；electric.rs | 常数 k 的版号未记录 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E02 | 电场线与合场 | 高中 | P1 | 已验证 | L1 | labs/field.rs 电场线与等势线 | field.rs dipole_lines…、uniform_field_equipotentials… | 零场点处理待核对 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E03 | 高斯定律与对称性 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E04 | 电势 电势能与功 | 高中 | P1 | 已验证 | L2 | field.rs fieldAt（V）；模板 charge-deflection、oscilloscope；情形 charge-e | electric.rs deflection_in_uniform_electric_field | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E05 | 导体平衡与屏蔽 | 高中至大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E06 | 电容器与储能 | 高中 | P1 | 存在但待验证 | L1 | labs/mod.rs plateCapacitor（恒压与恒电荷） | —（无自动测试） | 常数版号；断电与恒压两种约束的电源做功对照待核对 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E07 | 介质极化与边界 | 大学 | P2 | 存在但待验证 | L1 | plateCapacitor 的 εr | — | 无 D、P 与边界条件 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E08 | 欧姆定律与电阻率 | 初中至大学 | P1 | 部分实现 | L1 | circuit.rs 电阻、滑动变阻器 | circuit.rs series_with_internal_resistance | 无电阻率 R = ρL/A | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E09 | 串并联电路 | 初中 | P1 | 已验证 | L1 | circuit.rs 串并联、预设 series／parallel | circuit.rs series_with_internal_resistance、parallel_and_mixed | KCL 残差不可查；对照与实现同源 | 闭环二：MNA／暂态与解析独立对照、收敛与 KCL／能量残差、活动；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E10 | 基尔霍夫与桥式电路 | 高中至大学 | P1 | 部分实现 | L1 | circuit.rs MNA；检流计 | circuit.rs wire_loops_share_current | 电桥算例与奇异拓扑原因待补 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E11 | 戴维南与诺顿等效 | 大学 | P2 | 未实现 | L0 | 无（可通过电路搭建间接得到） | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E12 | 内阻与最大功率 | 高中 | P1 | 部分实现 | L1 | 电池内阻 r；预设 emf | circuit.rs series_with_internal_resistance | 无最大功率的扫描与效率对照 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E13 | 电表内阻与测量扰动 | 高中 | P1 | 部分实现 | L1 | 电表改装预设（ammeterConv、voltmeterConv、ohmmeter） | circuit.rs | 理想表与真实表切换、负载扰动的对照缺失 | 闭环二：MNA／暂态与解析独立对照、收敛与 KCL／能量残差、活动；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E14 | 焦耳热与电热耦合 | 初中至大学 | P1 | 部分实现 | L1 | circuitRun 能量 ∫UI dt | transient.rs rc_charging_and_energy | 无电热耦合 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E15 | RC 充放电 | 高中至大学 | P1 | 已验证 | L2 | transient.rs 梯形法自适应；预设 rc | transient.rs rc_charging_and_energy | 解析参照与数值的收敛研究缺失；教师参数化题缺失（任务二） | 闭环二：MNA／暂态与解析独立对照、收敛与 KCL／能量残差、活动；任务二 UI 验收；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E16 | RL 自感暂态 | 高中至大学 | P1 | 已验证 | L2 | transient.rs；预设 rl | transient.rs rl_and_discharge | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E17 | LC 振荡 | 高中至大学 | P1 | 已验证 | L2 | transient.rs；预设 lc | transient.rs lc_oscillation_keeps_energy_and_period | 长时相位漂移未单独验收 | 闭环二：MNA／暂态与解析独立对照、收敛与 KCL／能量残差、活动；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E18 | RLC 交流与相量 | 高中至大学 | P1 | 已验证 | L2 | transient.rs 交流；预设 acR、rlc | transient.rs ac_rms_phase_and_rectifier | 相量稳态与瞬态分离的对照待补 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E19 | 二极管与整流 | 高中至大学 | P2 | 已验证 | L2 | transient.rs 二极管（定压降＋电阻）；预设 rectifier | transient.rs ac_rms_phase_and_rectifier；circuit.rs diodes… | 无指数模型 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| E20 | 传感器 放大与晶体管接口 | 大学 | P2 | 部分实现 | L1 | 热敏、光敏、压敏电阻 | circuit.rs diodes_fuses_rcd_sensors_2655 | 无运放与晶体管 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |

### 磁学 电磁感应与电磁场

| ID | 模型族 | 学段 | 优先级 | 基线状态 | 基线 L | 基线实现 | 基线测试 | 差距 | 26.56 计划 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B01 | 长直导线磁场 | 高中至大学 | P1 | 已验证 | L1 | labs/magnet.rs（二维截面、每米、μ0 取 CODATA2018） | magnet.rs straight_wire_and_parallel_wires | A03：μ0 版号固定为 2018；几何语义仅写在代码注释 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B02 | 线圈与螺线管 | 高中至大学 | P1 | 部分实现 | L1 | magnet.rs 螺线管为两片电流层的二维截面 | magnet.rs long_sheet_pair_is_a_solenoid | 无三维圆线圈轴对称模型（A04） | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B03 | 平行电流相互作用 | 高中至大学 | P1 | 已验证 | L1 | magnet.rs 每米作用力 | magnet.rs straight_wire_and_parallel_wires | 每米量的标签需在界面明确 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B04 | 带电粒子圆周运动 | 高中 | P1 | 已验证 | L2 | 模板 cyclotron、bounded-field、circular-field；情形 charge-b、zone-b | electric.rs cyclotron_radius_and_period | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B05 | 速度选择器 | 高中 | P1 | 已验证 | L2 | 模板 velocity-selector；情形 selector | electric.rs velocity_selector_goes_straight | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B06 | 质谱仪 | 高中 | P1 | 已验证 | L2 | 模板 mass-spectrometer；情形 zone-b（zb.d） | regions.rs mass_spectrometer_lands_at_twice_the_radius | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B07 | 回旋加速器 | 高中至大学 | P2 | 已验证 | L2 | 模板 cyclotron-dees | regions.rs cyclotron_gains_energy_each_gap_crossing | 无相对论失效提示 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B08 | 霍尔效应 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B09 | 法拉第与楞次定律 | 高中 | P1 | 部分实现 | L1 | magnet.rs 线框磁通（每米） | magnet.rs | 无 dΦ/dt 感应电动势的时变对照 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B10 | 运动电动势 | 高中 | P1 | 已验证 | L2 | 模板 rail-coast；情形 rail | regions.rs rail_loop_terminal_velocity_and_energy | 外力功率＝焦耳热的独立对照待补 | 闭环二：MNA／暂态与解析独立对照、收敛与 KCL／能量残差、活动；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B11 | 导轨回路的动力学 | 高中至大学 | P1 | 已验证 | L2 | 模板 rail-force、rail-fall；情形 rail | regions.rs rail_loop_terminal_velocity_and_energy | 忽略自感为明确近似；EX 数值待对照 | 闭环二：MNA／暂态与解析独立对照、收敛与 KCL／能量残差、活动；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B12 | 自感 互感与磁能 | 大学 | P2 | 部分实现 | L1 | 变压器励磁电感 | transient.rs transformer_ratio_and_dc | 无互感 M = k√(L1L2) 的独立元件 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B13 | 变压器与输电 | 高中 | P1 | 已验证 | L2 | 预设 transformer、transmission | transient.rs transformer_ratio_and_dc | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B14 | 电动机与发电机耦合 | 大学 | P2 | 已验证 | L2 | 电动机／发电机元件；预设 generator | transient.rs motor_reaches_its_speed | 功率端口账本的独立对照待补 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B15 | 位移电流与电荷连续 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B16 | 电磁平面波与能流 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B17 | 电磁界面与菲涅耳系数 | 大学 | P2 | 部分实现 | L1 | waveoptics.rs 薄膜反射（正入射） | waveoptics.rs single_slit_and_film_and_polarizers | 无 s、p 偏振的斜入射 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| B18 | FDTD 腔模与电磁传播 | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（CFL 上限），完整后端暂缓 |
| B19 | 磁性材料与磁滞 | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（给定回线面积），完整后端暂缓 |
| B20 | 传输线与反射 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |

### 几何光学与波动光学

| ID | 模型族 | 学段 | 优先级 | 基线状态 | 基线 L | 基线实现 | 基线测试 | 差距 | 26.56 计划 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O01 | 平面镜与反射 | 初中 | P1 | 已验证 | L1 | labs/optics.rs 平面镜光路 | optics.rs snell_and_total_internal_reflection | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| O02 | 折射与色散 | 初中至高中 | P1 | 已验证 | L1 | optics.rs 折射与色散 | optics.rs snell…、prism_disperses_white_light | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| O03 | 全反射与光纤 | 高中 | P1 | 已验证 | L1 | optics.rs 全反射 | optics.rs snell_and_total_internal_reflection | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| O04 | 薄透镜成像 | 初中至高中 | P1 | 已验证 | L1 | optics.rs opticsImage（焦点处 v = null） | optics.rs thin_lens_and_mirror_formula | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| O05 | 球面镜成像 | 初中至高中 | P1 | 已验证 | L1 | optics.rs 面镜 | optics.rs thin_lens_and_mirror_formula、ideal_lens…_mirror_shows_aberration | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| O06 | 透镜组合与光学仪器 | 高中至大学 | P2 | 部分实现 | L1 | opticsTrace 多元件 | — | 无组合焦距的独立对照 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| O07 | 双缝干涉 | 高中 | P1 | 已验证 | L1 | labs/waveoptics.rs 双缝 | waveoptics.rs double_slit_fringes | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| O08 | 单缝衍射与分辨率 | 高中至大学 | P1 | 已验证 | L1 | waveoptics.rs 单缝 | waveoptics.rs single_slit_and_film_and_polarizers | 无圆孔分辨率 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| O09 | 光栅与有限缝宽包络 | 高中至大学 | P1 | 部分实现 | L1 | waveoptics.rs 光栅 | waveoptics.rs | 缺级与 |mλ/d| > 1 的拒绝待核对 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| O10 | 薄膜干涉 | 高中至大学 | P1 | 已验证 | L1 | waveoptics.rs 薄膜 | waveoptics.rs single_slit_and_film… | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| O11 | 迈克耳孙干涉仪 | 高中至大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| O12 | 偏振与马吕斯定律 | 高中 | P1 | 已验证 | L1 | waveoptics.rs 偏振片 | waveoptics.rs single_slit_and_film_and_polarizers | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| O13 | ABCD 矩阵与近轴光学 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| O14 | 菲涅耳衍射与波前传播 | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（Fresnel 数），完整后端暂缓 |

### 量子 原子与固体

| ID | 模型族 | 学段 | 优先级 | 基线状态 | 基线 L | 基线实现 | 基线测试 | 差距 | 26.56 计划 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q01 | 光电效应 | 高中 | P1 | 已验证 | L1 | labs/atom.rs photoelectric | atom.rs photoelectric_einstein_equation | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| Q02 | 康普顿散射 | 高中至大学 | P1 | 已验证 | L1 | labs/nuclear.rs compton（COMPTON 取 CODATA2018） | nuclear.rs compton_shift | 常数版号 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| Q03 | 德布罗意波与电子衍射 | 高中至大学 | P1 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| Q04 | 氢原子能级与光谱 | 高中 | P1 | 已验证 | L1 | labs/atom.rs hydrogen（E1 = −13.6 eV 简化） | atom.rs balmer_lines、excitation_rules | 简化精度标签 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| Q05 | 无限深势阱 | 大学 | P2 | 已验证 | L2 | labs/quantum.rs Sturm 二分本征值（有限差分） | quantum.rs infinite_well_and_oscillator_levels | 无网格收敛阶报告；约化单位标签 | 闭环三：独立 oracle、收敛或统计检验、数据版号、活动；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| Q06 | 量子谐振子 | 大学 | P2 | 已验证 | L2 | labs/quantum.rs | quantum.rs infinite_well_and_oscillator_levels | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| Q07 | 有限势垒与隧穿 | 大学 | P2 | 已验证 | L2 | labs/quantum.rs barrierT | quantum.rs barrier_transmission_matches_the_average | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| Q08 | 高斯波包与自由演化 | 大学 | P2 | 部分实现 | L2 | labs/quantum.rs 分步傅里叶、吸收层 | quantum.rs norm_is_kept_and_packets_move | 无 σ(t) 解析对照与网格／步长收敛；吸收损失与离散误差未分开（任务三） | 闭环三：独立 oracle、收敛或统计检验、数据版号、活动；任务三 UI 验收；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| Q09 | 自旋与量子测量 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| Q10 | 两能级与 Rabi 振荡 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| Q11 | 纠缠与密度矩阵 | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（Bell 态概率与约化熵），完整后端暂缓 |
| Q12 | 微扰与变分近似 | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（一阶微扰与变分值），完整后端暂缓 |
| Q13 | 费米与玻色统计 | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（占据数），完整后端暂缓 |
| Q14 | 晶格与紧束缚能带 | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（一维紧束缚色散），完整后端暂缓 |

### 核物理与粒子入门

| ID | 模型族 | 学段 | 优先级 | 基线状态 | 基线 L | 基线实现 | 基线测试 | 差距 | 26.56 计划 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| N01 | 放射性衰变与半衰期 | 高中 | P1 | 已验证 | L2 | labs/decay.rs 蒙特卡罗（seed） | decay.rs counts_follow_the_law_within_three_sigma | 多种子分布与统计带的界面与报告 | 闭环三：独立 oracle、收敛或统计检验、数据版号、活动；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| N02 | 衰变链与简并寿命 | 大学 | P2 | 已验证 | L1 | labs/nuclear.rs Bateman（含相等常数） | nuclear.rs bateman_chains | — | 闭环三：独立 oracle、收敛或统计检验、数据版号、活动；模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| N03 | 核反应配平与 Q 值 | 高中至大学 | P1 | 部分实现 | L1 | labs/nuclear.rs reaction（核子数与电荷） | nuclear.rs textbook_q_values | A05：只校验 A 与 Z，不能作一般粒子过程校验器 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| N04 | 质量亏损与结合能 | 高中 | P1 | 已验证 | L1 | labs/nuclear.rs binding（AME2020 取整到 1 keV，SEMF 估计另标） | nuclear.rs textbook_q_values | 数据版号未随结果导出 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| N05 | 卢瑟福散射 | 大学 | P2 | 已验证 | L2 | 模板 alpha-scattering；情形 coulomb | electric.rs coulomb_scattering_conserves_energy | 散射角与碰撞参数的对照待补 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| N06 | 射线衰减与相互作用 | 高中至大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| N07 | 探测计数与泊松统计 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| N08 | 活度 吸收剂量与单位 | 高中至大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| N09 | 分支过程与链式反应思想 | 高中至大学 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（分支过程期望），完整后端暂缓 |
| N10 | 聚变与恒星能源 | 高中至大学 | P2 | 部分实现 | L1 | reaction 可算聚变 Q | nuclear.rs textbook_q_values | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| N11 | 粒子目录与守恒选择 | 大学至研究生 | P3 | 未实现 | L0 | 无（reaction 不区分中微子与反中微子） | — | — | 受限解析 L1（守恒选择规则（独立校验器）），完整后端暂缓 |
| N12 | 核素图与数据溯源 | 高中至大学 | P2 | 部分实现 | L1 | binding 的核素符号与 N = A − Z | nuclear.rs | 无核素图 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |

### 相对论与天体物理

| ID | 模型族 | 学段 | 优先级 | 基线状态 | 基线 L | 基线实现 | 基线测试 | 差距 | 26.56 计划 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | 时间延缓与长度收缩 | 高中至大学 | P1 | 已验证 | L1 | labs/relativity.rs | relativity.rs textbook_values | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| R02 | 洛伦兹变换与同时性 | 大学 | P2 | 已验证 | L1 | labs/relativity.rs 事件变换 | relativity.rs textbook_values | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| R03 | 相对论速度合成 | 高中至大学 | P1 | 已验证 | L1 | labs/relativity.rs 速度合成 | relativity.rs textbook_values | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| R04 | 相对论能量与动量 | 大学 | P2 | 已验证 | L1 | labs/relativity.rs dynamics | relativity.rs textbook_values | 低速动能的消减误差待核对 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| R05 | 固有时与双生子模型 | 大学 | P2 | 部分实现 | L1 | labs/relativity.rs 固有时延缓 | relativity.rs textbook_values | 无分段世界线积分 | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| R06 | 弱引力场与引力红移 | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（弱场红移），完整后端暂缓 |
| R07 | 史瓦西时空与光线偏折 | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（弱偏折），完整后端暂缓 |
| R08 | 恒星辐射与尺度 | 高中至大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |

### 多物理场与高阶计算

| ID | 模型族 | 学段 | 优先级 | 基线状态 | 基线 L | 基线实现 | 基线测试 | 差距 | 26.56 计划 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| X01 | 泊松方程与静电边值 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| X02 | 黏性流场与 CFD | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（平面 Couette 解析基准），完整后端暂缓 |
| X03 | 弹性有限元与振型 | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（单自由度等效），完整后端暂缓 |
| X04 | 热方程与热应力 | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（固定杆热应力），完整后端暂缓 |
| X05 | 线圈磁通与电路耦合 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| X06 | 等离子体与 MHD 分层 | 研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（等离子体尺度），完整后端暂缓 |
| X07 | 分子动力学与系综 | 大学至研究生 | P3 | 未实现 | L0 | 无 | — | — | 受限解析 L1（LJ 势能），完整后端暂缓 |
| X08 | 参数反演与可辨识性 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| X09 | 反馈控制与状态空间 | 大学 | P2 | 未实现 | L0 | 无 | — | — | 模型计算器 L1（条件四态、分支）＋独立 oracle 三组 |
| X10 | 经典场与量子场入门 | 研究生及更高 | P3 | 部分实现 | L0 | 概念页 qft | — | 无计算 | 受限解析 L1（单模自由场），完整后端暂缓 |

基线合计：已验证 80，部分实现 38，存在但待验证 7，未实现 55，明确暂缓 0。

## 4 现有内容与模型族的对应

沿用《模型与例题全集》第 13 节：77 个模板、18 个实验室、30 道内置题全部对应到模型族（`src/content/models/links.ts` 机器可读，测试检查每个入口都有归属且 ID 真实存在）。旧入口不删除、不另做一套。

## 5 本版实施顺序

1. P0 公共基础：七量纲与温度语义；常数集合与数据版号；几何语义；公式注册字段与对照独立性；模型计算的四态条件与诊断；运行清单；已访问与掌握证据；粒子过程校验器。
2. 三个闭环：G01 G06 M03 M07 M08；E09 E13 E15 E17 B10 B11；T10 Q05 Q08 N01 N02。每个闭环做到“模型 → 公式与条件 → 独立参照 → 例题 → 学习活动 → 反馈 → 导出与复现”。
3. 四个界面任务：F02 浮沉预测、E15 RC 测量与出题、Q08 收敛比较、M07 键盘完成。
4. 扩展到其余模型族：每个模型族至少有 L1 计算器（受限 AST、量纲检查、四态条件、分支）与独立 oracle（基准、有效域边界、极限或迁移三组）；P3 以受限解析模型交付并标注有效域。
5. 回归：cargo、vitest、类型检查、parity、calc-parity、77 个模板的 D97 指纹不变；Windows 构建与 WebView2 自检。
