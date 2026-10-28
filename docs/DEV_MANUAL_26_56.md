# VeloPhi 26.56 开发手册

26.56 依据两份文档实施：《VeloPhi 能力蓝图》（ENG、FOR、EDU、UX 需求与成熟度定义）与《模型与例题全集》（180 个模型族，每族一道例题、教学要点与验证要求）。两份文档以 26.55、提交 `f71a4ffd1b3c0e470987e7d8d46d851af2025585` 为静态核对基线。本版先按实际代码核对现状、提交覆盖矩阵（`docs/coverage/COVERAGE_26_56_baseline.md`），再在现有成果上补齐公共基础与三个“模型 → 公式与条件 → 独立参照 → 例题 → 学习活动 → 反馈 → 导出与复现”的闭环。原则与决策 D1–D97 继续有效，本手册新增 D98–D109。

实施后的覆盖矩阵由数据生成：`docs/coverage/COVERAGE_26_56.md`（人读）与 `coverage-26.56.json`（机读），见 D109。

## 1. 基线核对

- 维护者电脑 `E:\VeloPhi`：`main` 的 HEAD 为 `f71a4ff`（“update v26.55”），工作区无改动，HEAD 之后没有新提交（只读命令 `GIT_OPTIONAL_LOCKS=0 git log/status`）。开发容器与电脑逐文件 SHA-256 比对：567 个受控文件中 565 个相同，另两个（`.gitattributes`、`roadmap.txt`）只在电脑上，不影响构建。
- 文档点名的六个问题逐一核对属实（基线矩阵 §0.1）：A01 通用 `Dim` 在 Rust 中是 [L, M, T] 三维，TS 是以电荷为第四基量的四维，两端不一致；A02 学习路径打开内容后即 `setDone`；A03 磁场模块的 μ0 是 CODATA 2018 值，且核物理模块的 u、mₑ、康普顿波长也是 2018 值（比文档所述更广）；A04 二维截面与厚度语义只在代码注释中；A05 核反应校验器只比较 A 与 Z，`nu` 不分中微子与反中微子；A06 公式卡不区分独立解析与同源一致。
- 基线状态（180 个模型族）：已验证 80、部分实现 38、存在但待验证 7、未实现 55；成熟度 L0 59、L1 59、L2 62。需求 60 项：已验证 8、部分实现 40、未实现 12。

## 2. 范围

| 类别 | 内容 |
| --- | --- |
| P0 公共基础 | 七个 SI 基本量纲与温度语义（D99）；常数集与数据版号（D100）；几何与每单位长度语义（D98 geometry）；公式变量绑定与模型注册（D98、D106）；独立参照标签（D101）；错误状态与运行来源（D104）；“已访问”与“有掌握证据”的区分（D103） |
| 闭环一 力学 | M03 自由落体与事件、M07 斜面、M08 静摩擦阈值、F02 浮力与沉浮、G01/G06 单位与量纲：仿真对注册模型与手写闭式，活动 act-freefall、act-incline、act-static、act-float、act-units |
| 闭环二 电路与感应 | E09 串并联、E13 电表内阻、E15 RC、E17 LC、B10/B11 导轨回路：电路求解对注册模型与另行计算的 KCL 残差，活动 act-series、act-meter、act-rc、act-lc、act-rail |
| 闭环三 热学、量子与核 | T10 气体四过程、Q05 无限深势阱、Q08 高斯波包、N01 衰变统计、N02 衰变链：收敛阶、统计检验，活动 act-gas、act-well、act-packet、act-decay、act-chain |
| 180 个模型族 | 每族一个 ModelSpec（输入、条件、输出、几何、假设、有效域、来源、成熟度、关联内容、基准），每族至少三组独立参照（共 591 组） |
| P3 | 21 个 P3 族与其余需要通用求解器的族共 23 个以“受限解析模型”交付，写明计算了什么、暂缓了什么（`restricted`），不以示意动画冒充仿真 |
| 界面任务 | 初中浮沉预测实验、高中 RC 测量与出题、大学高斯波包收敛比较、键盘完成斜面受力分析 |
| 暂缓 | 通用 PDE 与本征值求解器插件（ENG08）、符号等价（FOR10）、QTI/LTI 交换（EDU15）、AI 辅导（EDU18）、间隔复习（EDU12 一部分）、真实数据导入（EDU08 一部分）；L4 需要学生试用，本版不声称 |

## 3. 决策

**D98 模型注册。** `src/content/models/` 是 180 个模型族的数据（纯数据，不含 Vue 与 DOM）：`types.ts` 定义 ModelSpec；`g.ts m1.ts m2.ts f.ts w.ts t.ts e.ts b.ts o.ts q.ts n.ts r.ts x.ts` 按蓝图的领域顺序；`links.ts` 把现有的 77 个模板、18 个实验与 30 道内置题映射到模型族（`linksOf` 合并）；`dsl.ts` 是书写辅助。每个输入有 SI 单位、语义量（同一个符号 V 是体积还是电压由语义量区分，不靠符号）、显示种类、定义域与例题值；输出是受限表达式、带 `when` 的分支或方程的根；`geometry` 记录几何语义（质点、平面运动、二维截面每米、平面内三维点电荷、轴对称、一维、集中参数、三维、无空间）；`status`、`level`、`teaching`、`references`、`benchmarks`、`gap`、`review` 是覆盖矩阵的字段。启动时整个注册（只取计算字段）经 `setModels` 装入 Rust 核心，核心检查每个表达式的量纲；不一致的模型报告为问题，测试要求零问题。

**D99 七个基本量纲与温度。** Rust `expr.rs` 与 TS `formula/units.ts` 统一为 L M T I Θ N J，单位表逐项一致（测试比较两端）。电荷从基量改为 I·T（26.54 D78 的四维约定迁移，旧测试表随之改写）。温度分绝对温度与温差两种 `UnitKind`：绝对温度显示为 °C 时做仿射换算（+273.15），温差只换比例；显示单位表增加温度、压强、密度、体积、物质的量、热容、比热容、电感、磁通量等。表达式中数字 0 适配任何量纲（`t - dt >= 0`、`if(x > 0, v, 0)`），其余加减与比较要求量纲相同，超越函数要求无量纲参数。

**D100 常数集。** Rust `constants.rs` 收录 CODATA 2018 与 CODATA 2022（值、单位、标准不确定度、是否精确、来源），`constants::nuclear(set)` 给出核物理所用的 MeV 等价值。新工作默认 2022。康普顿、磁场、核反应与结合能、平行板电容器四个实验的状态带 `constantsSet`：新实验为 2022；26.55 保存的状态与导出的文件没有这个字段，读入时补为 2018，因此旧结果逐位不变；请求不带常数集时核心也按 26.55 的值计算。名为 2022 的实验文件写为版本 3（26.55 拒读并提示“较新版本”）。磁场模块的 μ0 不再是写死的 2018 常数（A03）。**例外：** 刚体场景的库仑常数保持 26.55 的 2018 值，以保留 77 个模板指纹（D97）；运行清单如实写“CODATA2018”。

**D101 参照类别。** 公式卡把与仿真的比较分为三类：独立解析（公式只用给定参数）、守恒或定理检验（能量、动量、功能关系、冲量：独立于求解器，但单独不确定运动）、同源一致（公式用了同一次运行读出的量，只证明内部一致）。`src/formula/refKind.ts` 按变量是否标“（仿真）”与守恒公式表判定，卡片上显示标签与说明。模型注册的 `references` 记录基准使用的参照类别（analytic、otherMethod、experiment、sameSource）。Rust–TS 逐帧对照一律称“移植回归”。

**D102 学习活动、评分与参数化题。** `src/teaching/activities/`：15 个活动（types、defs、grade、index），每个有目标、先修、概念诊断（选项对应误概念并给针对性反馈）、预测与理由、一次只改一个输入的控变量实验、逐级提示的核心题、迁移题。所有期望答案由 Rust 模型计算（`modelEval`），界面只比较。评分分概念、单位、方向、建模、计算、解释六个维度；数值题按带量纲尺度的缩放误差、每量独立容差，单位与方向分别判定，方向从模型的分支读出（例如摩擦方向）。掌握证据的规则可见：一次完整作答中核心题与迁移题的全部评分维度正确；提示次数照记，不扣分。`src/teaching/paramProblem.ts`：教师从模型复制出参数化题，选择抽取的输入（区间与步长）、要问的输出、必须成立的条件；mulberry32 固定种子，网格取值后由 Rust 模型判定条件与可解性，失败的抽取按原因计数，预览多组种子，导出 JSON 附运行清单。

**D103 学习记录。** `src/teaching/records.ts`（存于本机 `velophi.learning.v1`）把“已访问”“已练习”“掌握证据”分开：打开页面只记访问，完成活动记一次练习（作答、逐题证据、预测与理由、实验设置、修订、六维计数），满足 D102 的规则才记掌握证据。26.55 的 `ui.learnDone` 意为“已打开”，迁移为访问，不生成练习或掌握（A02）。学习路径用三种标记（眼、笔、旗）分别显示，可查看规则、导出 JSON、清除全部或某一阶段的访问。

**D104 运行清单。** 核心操作 `manifest(backend, input, constantsSet)` 返回核心版本、场景格式、后端及其 physicsVersion 与求解器说明、常数集与来源、数据集（AME2020、PDG 2024 等）、输入的 SHA-256、全部后端的版本表。`physicsVersion` 只在同一输入的结果因物理纠错而改变时才变（旧行为保留，D97）。清单附在 CSV 头部、模型计算导出、活动记录、参数化题与实验导出中；实验中不用常数集的，清单写“常数内置于后端”，不虚报常数集。

**D105 模型目录与界面。** 顶栏“教学 › 模型目录…”打开目录：按领域、学段、成熟度、状态筛选与搜索；模型页显示假设、有效域、几何、受限说明，输入用显示单位（按 `UnitKind`），条件四态与原因，输出与分支（条件不成立的公式划掉，不作答案），所用常数及其集合与来源，参照类别与基准，求未知量（区间求根，报告无解、单解或多解），关联的模板、实验、题目与活动，以及教师参数化题。实验页头部列出该实验服务的模型族（点开模型页）。全局搜索（Ctrl+K）收录模型族与活动。失败时显示核心的消息而不是数字。

**D106 Rust 模型计算器。** `engine/velophi-core/src/modelcalc.rs`：注册（`setModels`、`modelList`）、计算（`modelEval`）与求解（`modelSolve`）。条件四态：适用、不适用、信息不足（附缺少的量）、近似适用（`approx` 成立而严格条件不成立）；输入超出定义域时报告并使全部输出不适用。输出可按 `when` 选分支，或在区间内用网格加二分求根（`accept` 物理筛选），报告根的个数。未定义的结果（除以零、负数开方）返回 null 与原因，从不返回数字。新函数 sinh、cosh、asinh、acosh、atanh、sinc、cbrt、floor（确定性数学库）。消息键见 `engine/MESSAGES.md`“Model registry”，操作见 `engine/CALC.md`。TS 端的调用为 `src/engine/models.ts`（`evalModel`、`invertModel`——不用 `solveModel` 这个名字，因为 `solveMode` 是网页构建检查的参照代码标记）。

**D107 粒子过程校验器。** `particles.rs`：PDG 2024 的粒子目录（轻子、规范玻色子、介子、重子，含反粒子）与核素；`particleProcess` 分别检查电荷、重子数、三代轻子数、能量（衰变的 Q 与碰撞的阈值）与奇异数（只作弱过程提示），报告违反的守恒律与估计值。核反应配平（`reaction`）保持原样只管 A 与 Z，界面写明它不是一般粒子过程的校验器（A05）。

**D108 收敛研究。** `src/teaching/convergence.ts` 与量子实验中的“收敛”面板：自由高斯波包按网格加密对照 Q08 的闭式（⟨x⟩、σ(t)、范数），另做时间步自收敛（观测阶数约 2.0）；吸收层损失与离散误差分开报告。四舍五入噪声以下的误差显示为“≤ 舍入”。

**D109 覆盖矩阵与证据。** 独立参照：`scripts/oracles/*.py` 用 mpmath（50 位精度）另行实现每个模型族的计算（不同的公式形式或数值方法：求根、积分、级数、线性方程组），`build.py` 生成 `tests/fixtures/oracles2656.json`（591 组：基准、边界、极限或迁移），`tests/models2656.test.ts` 逐组比较。矩阵：`scripts/coverage.mjs` 从注册数据生成矩阵，并检查每条证据引用——`oracle:<id>`（至少三组）、`test:<文件> <测试名片段>`、`rust:<路径> <测试函数>`、`regress:engine template <id>`（移植回归，不算独立证据）——都能在仓库中找到；状态与证据不一致时失败（`tests/coverage2656.test.ts` 在测试中运行它）。“完成”只给同时满足物理有效域、独立验证、教学证据、交互可用与复现导出的模型族。

## 4. 架构与共享合同

```
Vue 界面（只显示与比较）                         Rust 核心（计算）
  ModelCatalog / ModelView / ActivityRunner  ──calc──▶  modelcalc.rs   setModels · modelEval · modelSolve · manifest
  LabPage 与各实验                          ──calc──▶  labs/*.rs      实验操作（带 constantsSet）
  LearningPath（记录）                                   particles.rs   particleProcess
  src/content/models（注册数据） ──setModels──▶          constants.rs   常数集
```

- 类型化输入：注册的 `inputs`（SI 单位、语义量、显示种类、定义域）；界面的数值框按 `UnitKind` 换算显示单位，提交时换回 SI。
- 观测量：`modelEval` 的 `outputs[{id, value, raw, state, branch, missing}]`、`conditions[{id, state, missing}]`、`lets`、`constants`（所用常数及其集合）。
- 运行元数据：D104 的清单。
- 诊断合同：核心返回消息键（`MESSAGES.md`），界面翻译；`MessageError` 在 TS 中携带键与参数。
- 不同的物理问题用不同后端（刚体、电路、量子、气体……），但都经过同一个 `calc` 入口、同一套清单与诊断。界面不另算一套物理答案：活动、参数化题与模型页的每个数值都来自核心。

## 5. 兼容与迁移

| 对象 | 处理 |
| --- | --- |
| 场景文件 | 格式不变（5/6/7）；77 个模板在默认参数下的记录指纹与 26.55 逐位相同（`.cache/node-hashes.json` 与 26.55 的文件字节相同） |
| 实验文件 | 带 2022 常数集的写为版本 3；没有常数集的旧文件与旧状态按 2018 计算；导出附运行清单 |
| 学习进度 | `ui.learnDone`（已打开）迁为访问记录，不生成练习或掌握；新记录存 `velophi.learning.v1` |
| 计算操作 | 新增 `units constants manifest setModels modelList modelEval modelSolve particleProcess`；旧操作不带常数集时结果不变；ABI 版本仍为 2 |
| 三语文字 | 新增 228 条（`src/i18n/texts/v2656.ts`），删除 26.55 中 5 条不再使用的文字 |

## 6. 三个闭环

| 环节 | 闭环一（力学） | 闭环二（电路与感应） | 闭环三（热、量子、核） |
| --- | --- | --- | --- |
| 模型 | M03 M07 M08 F02 G01 G06 | E09 E13 E15 E17 B10 B11 | T10 Q05 Q08 N01 N02（G07 G08） |
| 公式与条件 | 四态条件；斜面三分支（下滑、上滑、静止）；沉浮由密度比判定 | 串并联、电压表负载、RC 指数、LC 周期与能量、运动电动势与收尾速度 | 四过程的 W、Q、ΔU；能级 n²；σ(t)；二项分布；贝特曼（相等与近相等寿命） |
| 独立参照 | 591 组 mpmath 参照中的对应组；`tests/loop1.test.ts` 用手写闭式 | `loop2`：另行求解的节点方程与 KCL 残差、戴维南等效 | `loop3`：辛普森求积、二阶收敛、多种子的均值与方差（χ² 界） |
| 例题 | 注册中的例题与圆整答案（阅读用）；测试用未圆整值 | 同左 | 同左 |
| 学习活动 | act-freefall、act-incline（全键盘）、act-static、act-float、act-units | act-series、act-meter、act-rc、act-lc、act-rail | act-gas、act-well、act-packet、act-decay、act-chain |
| 反馈 | 六维评分、逐级提示、误概念反馈 | 同左 | 同左 |
| 导出与复现 | 活动记录 JSON 附清单；CSV 头附清单 | 实验导出附清单；参数化题固定种子 | 收敛表与清单；衰变固定种子 |

## 7. 新增与修改的文件

新增：`src/content/models/*`（17 个文件）、`src/teaching/activities/*`（4）、`src/teaching/{records,paramProblem,convergence}.ts`、`src/app/learn/records.ts`、`src/app/models/{labels,run}.ts`、`src/app/components/ActivityRunner.vue`、`src/app/components/models/{ModelCatalog,ModelView,ParamProblemPanel}.vue`、`src/app/components/lab/QuantumConvergence.vue`、`src/engine/models.ts`、`src/formula/refKind.ts`、`src/i18n/texts/v2656.ts`；Rust `constants.rs`、`modelcalc.rs`、`particles.rs`；`scripts/oracles/*.py`、`scripts/coverage.mjs`；测试 `activities2656 coverage2656 crosscore2656 dims2656 labs2656 loop1 loop2 loop3 models2656 particles2656 sim2656 units2656 ux2656` 与 `tests/fixtures/oracles2656.json`；`docs/coverage/*`。

修改：Rust `calc.rs expr.rs lib.rs labs/{mod,magnet,nuclear}.rs`；`engine/CALC.md MESSAGES.md`；界面 `App.vue TopBar.vue CommandPalette.vue FormulaPanel.vue LearningPath.vue NumField.vue`、实验 `LabPage CapacitorLab ComptonLab MagnetLab NuclearLab QuantumLab`、`lab/state.ts learn/{actions,paths}.ts main.ts settings.ts store.ts`；`engine/labs.ts export/csv.ts formula/{expr,recognize,units}.ts i18n/{coreText,tables}.ts units/units.ts`；测试 `units.test.ts engine/ops.test.ts`；版本号与发布脚本。

## 8. 如何添加一个模型族或活动

1. 在对应领域文件中写 ModelSpec：输入（SI 单位与语义量）、条件、输出（受限表达式）、几何、假设、有效域、来源编号、例题与答案。P3 或需要暂缓求解器的写 `restricted`。
2. 在 `scripts/oracles/<领域>.py` 中用另一种方法写至少三组参照（基准、边界、极限或迁移），`python3 scripts/oracles/build.py <领域>` 重新生成。
3. 运行 `npx vitest run tests/models2656.test.ts`（核心检查量纲与参照）；有仿真或实验时在 `tests/` 中写对照测试，并把 `test:` 或 `rust:` 引用写入 `benchmarks`。
4. 活动：在 `defs.ts` 中写目标、先修、诊断、预测、实验、题目与迁移；答案只引用模型输出。`tests/ux2656.test.ts` 自动检查每个活动可作答。
5. `node scripts/coverage.mjs` 重新生成矩阵（引用不存在或状态与证据不符时失败）。

## 9. 验证

| 检查 | 命令 | 结果（容器，Node-API 核心） |
| --- | --- | --- |
| 类型 | `npx vue-tsc --noEmit` | 通过 |
| 前端与核心测试 | `npx vitest run` | 83 个文件 1783 项全部通过（Windows 的 WebAssembly 上 1767 项通过、16 项原生协议测试跳过） |
| Rust | `cargo test --workspace --release`（engine） | 全部通过 |
| 计算对照 | `node scripts/calc-parity.mjs --random 30 --random2651 20 --random2652 20 --impacts 10` | 396 次运行、53 142 个请求，0 处不同 |
| 求解器对照 | `node scripts/parity.mjs --random 120 --random2651 60 --random2652 60 --impacts 40 --branches 30` | 0 处不同 |
| 模板指纹（D97） | `tests/hashes.test.ts` 写 `.cache/node-hashes.json` | 77 个，与 26.55 字节相同 |
| 覆盖矩阵 | `node scripts/coverage.mjs --check` | 全部引用可解析 |
| 原生与 WASM | `tests/crosscore2656.test.ts` 写 `.cache/crosscore-<core>.json` | Node-API 与 Windows 发布构建的 WebAssembly 摘要相同（`9eebffe5…`） |

Windows 发布（`scripts\release.cmd`）在新构建的 WebAssembly 核心上再跑全部测试，并在 WebView2 中对照原生 Rust 与 WebAssembly 的全部模板。

## 10. 已知限制

- 刚体场景的库仑常数仍为 CODATA 2018（D100 例外，保指纹）。
- 衰变链中两个寿命近乎相等（相对差 10⁻⁶）时，三种核素的总数守恒到约 10⁻¹⁰（相对），不是舍入精度：闭式经过 1/(λ₂ − λ₁)。
- 参数化题校验的内部消息为英文，界面按原因翻译。
- 模型计算器的 74 个 L1 族只有受限解析计算；23 个受限模型写明暂缓的部分。
- 没有学生试用与修订记录，因此不声称 L4；误概念库未经学生数据校准。
- 变量定位（D72）复核时没有找到自动测试，矩阵中改为“存在但待验证”。

## 11. 实施记录：Windows 检查中的修正

第一次 Windows 发布构建（构建 1，步骤 1–10 全部通过，打包因发布说明尚未传到电脑而停在第 11 步）之后，在便携版中逐项走查了四个界面任务，发现并修正了下列问题，随后重新构建（构建 2），复查后又做了一处布局收窄（构建 3，发布）。

| 编号 | 发现 | 修正 | 测试 |
| --- | --- | --- | --- |
| R1 | 活动的数值题核对后立即显示参考答案，学生改正后再核对，结果仍记为掌握证据——证据被参考答案污染 | 每题以第一次核对为证据（`keepFirst`），之后的修改只作练习：界面注明，结果页列出“核对后修改过”的题数，学习记录中另存 `revised`，掌握规则文字写明“以每题第一次核对为准” | `activities2656` the first check is the evidence |
| R2 | 模态对话框没有焦点陷阱：在斜面活动中按 Tab 离开对话框，Enter 落到后面页面的按钮上，停止了当前场景的计算；学习路径按 Escape 不关闭；强调色按钮的焦点框与按钮同色，看不见 | `src/app/focusTrap.ts`：活动、模型目录与学习路径三个对话框的 Tab / Shift+Tab 在对话框内循环，Escape 关闭，`aria-modal`，打开时聚焦；强调色按钮的焦点框改为正文色 | `ux2656` Tab stays inside the dialog |
| R3 | 参数化题相邻种子 1–5 抽到的电阻几乎相同（1500、1600、1600、1900、1600 Ω）：mulberry32 对相邻种子的第一个数混合不足 | 种子先经 murmur3 终结函数打散；同一种子仍逐位重现 | `activities2656` neighbouring seeds give spread-out problems |
| R4 | 量子实验的收敛表在侧栏中逐字折行（“≤ 舍入”竖排）；网格加密一栏给出无意义的“阶 25.42”（谱方法没有固定阶） | 表格不折行、可横向滚动，表头缩短；网格表去掉阶（导出中保留），时间步表保留阶；构建 2 复查时时间步表的“阶”仍需横向滚动，再收窄（⟨x⟩ 8 位、表头“差值”）后构建 3 | —（界面布局，人工检查） |
| R5 | 模型页与活动显示 `1e-4 F`、`4.995e-4 J` | 26.56 的界面用 `readableSig`：10⁻⁴、4.995 × 10⁻⁴；导出文件仍用原格式 | `units2656` readable powers of ten |
| R6 | 参数化题的区间输入框太窄，0.00005 显示为“0.0000” | 输入框加宽 | — |

这些修正不涉及物理计算：Rust 核心、模型注册与独立参照未改，覆盖矩阵不变。
