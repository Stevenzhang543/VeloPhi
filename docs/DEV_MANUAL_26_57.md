# VeloPhi 26.57 开发手册

文档日期：2026-10-31 · 版本 26.57.0 · 依据：《VeloPhi 升级手册》（`VeloPhi_Upgrade_Manual_2026-10-31.md`，下称“任务书”）。基线：26.56.0（维护者提交 87f2058）。决策 D110–D125。覆盖记录：`docs/coverage/COVERAGE_26_57.md`（由 `node scripts/coverage2657.mjs` 生成）。

## 1. 基线核对

开始前在电脑上只读核对：`GIT_OPTIONAL_LOCKS=0 git log -1` 为 87f2058，工作区与容器逐文件 SHA-256 相同。用 26.56 便携版重拍任务书的三张截图（`docs/reports/26.57/baseline-*.jpg`）：图 A（斜面受力与读数）、图 B（电场实验）、图 C（渲染与监视页）。图 A 的三个读数 N = 16.97 N、f = 3.395 N、a = 3.203 m/s² 与 2 kg、30°、μk = 0.2 的闭式一致（任务书 §6.6 的判断属实：读数本身不是公式错误）；问题在于“所求不明确、单点与合计接触力不分、标签与物体重叠、两处时间信息”，本版逐项处理。

## 2. 范围

| 优先级 | 条目 | 本版 |
| --- | --- | --- |
| P0 | VP-01 基线 · VP-02 量引用与结果封装 · VP-03 来源与条件四态 · VP-04 斜面三分支与 μs/μk · VP-05 结果失效与请求竞争 · VP-06 手动结构化任务 | 全部完成，有自动测试 |
| P1 | VP-07 文字题解析与最小澄清 · VP-08 统一比较 · VP-09 六个代表任务 · VP-10 工作方式 · VP-11 视觉与画布标注 · VP-12 三态勾选与叠卡 · VP-13 第一批 24 教学包 | VP-07 部分（见 §9 评测）；VP-12 部分；其余完成 |
| P2 | VP-14 停靠与语义连线 · VP-15 滚动与圆形转场 · VP-16 图片题 · VP-17 第二批教学包 | VP-14 部分、VP-15 完成；VP-16、VP-17 暂缓 |
| P3 | VP-18 第三批教学包与教学试用 | 暂缓 |

同时修复 26.56 的遗留问题（§10）。

## 3. 决策

**D110 任务合同（schema 2）。** `src/task/types.ts`：任务 = 题干与来源、对象绑定、已知量（每条带 SI 值、单位、来源 stem / image / scene / user / default / model / measurement、状态 adopted / overridden / conflict、修订号、原文）、初始条件、假设（带来源）、条件表（位移、高度、速度到达某值）、所求与选项。所求是 `TaskTarget`：量引用 `QuantityRef`（对象、量、参考系、分量：大小 / 沿斜面 / x / y / 法向）与求值点 `EvaluationPoint`（时刻、事件左右极限及第几次、条件第一次 / 每次穿越、区间最值、稳态）。结果是 `ResultEnvelope`：任务号、修订号、内容哈希、运行号、引擎与模型版本、常数集、适用性四态、计算状态（已求解 / 无解 / 多解 / 失败 / 过期）、数值与单位、全部解及选根条件、求值时刻、证据、条件检查、来源、误差预算与独立核对。`vocab.ts` 是六类题型的目录（对象、参考系、已知量、所求、假设、默认值）；`validate.ts` 给出澄清问题（选所求、选时机、缺项、摩擦种类、冲突、默认值、无效值、超出范围），每个问题带可直接应用的选项。

**D111 核心新增与来源。** Rust 核心：①公式卡片的每个变量带 `src`（given / constant / phase / time / sim / derived），由识别器在构造变量时写明（`formula/mod.rs` 的 `var_*` 构造函数），界面只显示，不再从标签文字推断（任务书 §1.3 第 3 条）；②`crossing` 运算：Σ c·q 到达给定值的时刻（帧间细化、方向、第一次或全部、记录是否覆盖区间）；③`extreme` 增加时间窗与极值时刻；④`modelSolve` 把每个根代回模型，报告残差、是否通过与求根方法；⑤衰变链 `chain_at`（见 §10）。操作见 `engine/CALC.md`。

**D112 斜面模板。** 新模板 `incline-friction`：μs 与 μk 分开，初速度沿斜面（向下为正，负值为向上），六个预设（下滑、静止、上滑后下滑、上滑后静止、临界、光滑）；三个沿斜面的自定义量 `custom.s / vs / as`。旧模板 `incline` 不变（指纹相同）。新模板的初速度写作 `0 − v₀ sinθ`，避免 −0 在保存再读入后变成 +0 而改变记录指纹（确定性测试发现）。

**D113 求解请求与失效。** `src/task/runner.ts`：每次求解领取票据（任务号、修订号、内容哈希）；新请求取代旧请求；结果在显示前再核对票据；被取代或被取消的答案丢弃并计数。`src/app/task/taskState.ts`：修改任务或任务所在场景，结果转为“旧结果”只供比较（灰色、标注），不会冒充当前结果；任务与草稿在页面与工作方式之间保持。

**D114 任务面板与结果卡片。** 右侧“任务”页签：粘贴题目 → 理解摘要（对象、坐标与正方向、已知量及来源、冲突、所求、条件与假设）→ 澄清 → 求解 → 结果卡片 → 演示 / 练习 / 迁移。手动填写与示例题、从当前场景提出可求的量（不替用户选）。结果卡片：量、对象、参考系、求值点、数值与单位、计算状态与条件状态（文字，不只靠颜色）、来源；展开后是条件、独立核对（差值与容差）与全部解。题干中未用到的数值可点选后再点选一行已知量完成连接（不必拖线），单位不符时阻止并说明。

**D115 文字题解析与评测集。** `src/task/parse.ts` 是规则解析（中文题干：数值与单位、对象、关系词、问句部分）。缺项、歧义或冲突时给澄清而不静默求值；默认值（g、内阻、抛出高度、两电荷在 x 轴上）明示来源。评测集 240 条（`tests/fixtures/task-eval-*-2657.json`：165 开发、75 盲测；盲测文件冻结，SHA-256 记录在 `docs/coverage/task-eval-2657-freeze.md`），`tests/taskeval2657.test.ts` 按任务书 §14.2 的八项分别计分（Wilson 区间），写 `docs/reports/26.57/task-eval.json`。

**D116 六个代表任务。** `src/task/samples.ts` 与 `plan.ts`：斜面（沿斜面移动 2 m 时的速率）、斜抛（第一次到达 3 m 高与射程）、一维弹性碰撞、有内阻的并联电路、凸透镜成像、两个点电荷的合场与负电荷受力。每个所求有解析解与至少一条独立核对：刚体仿真（条件求根、事件左右极限）、另一解析途径、守恒检查、节点电压法、光线追迹、电势的数值梯度。`src/app/task/demo.ts`：演示（力学题用模板带入任务数值，可定位结果时刻；电路、透镜、电场打开实验并带入任务的元件、物距或电荷）、练习（新活动 act-projectile、act-collision、act-lens、act-field）与迁移题（只改一个条件：倾角跨过 tanθ = μs、平台抛出、碰撞类型、连接方式、物在焦点内、试探电荷变号）。

**D117 统一比较服务。** `src/task/compare.ts`：`delta = |q − q_ref|`，`pass ⇔ delta ≤ atol + rtol·max(|q|, |q_ref|)`。题目、活动与预测改为经这一处比较，各自的旧容差语义写成规则（题目 tol·|q_ref| + abs、活动缩放误差、预测 1 % / 5 % 分级）；测试在一张网格上逐项比较新旧结果相同。作答的单位先换算为 SI（72 km/h 与 20 m/s 是同一答案）；大小对而符号反的是方向错误，不是计算错误。

**D118 工作方式。** `src/app/workMode.ts`：学习、解题、实验、编辑是同一场景上的显示预设（右侧页签、底部页签、工具栏、叠层）。切换从不改动场景、选择、播放时刻、任务与草稿；在某一方式中所做的改变记在该方式下，“↺”恢复预设。任务演示时，公式面板先列与任务有关的情形，其余收进“更多分析”；曲线有“任务”预设。

**D119 接触力合计与标签。** 同一接触的多个接触点（核心的 N1、N2…）在画布上默认合成一个 N，画在按大小加权的中心，标注“（n 处接触合计）”；显示设置“各接触点分别画出”时才逐点画出，两者不会同时出现（受力不重复计入，T06；核心的受力分析图同样合计）。数值标签避开已放置的标签、运动物体与物体名称，先上下移动，再换到箭头另一侧；离开箭头的标签画一条细引线。

**D120 基础组件与阅读密度。** `TriCheck`（父复选框：全选、部分选中 mixed、全不选；键盘）、`StackCards`（就地展开的叠卡，保持阅读位置）。默认密度：正文 14 px、常用按钮 32 px；“紧凑”保留 26.56 的尺寸；“课堂投影”即投影仪模式。右侧与底部的阅读面板在半透明效果下也使用稳定的不透明底色，玻璃效果只留给导航、菜单与浮层。

**D121 时间与量的说明。** 一个主要播放时刻（“t = … / 时长”）；计算进度写“已计算至 … s”，不再与播放时刻并列成两个时钟；监视页由右侧时钟显示播放时刻，底部时间轴不再重复；“停止计算”与“暂停播放”文字区分。监视量与曲线说明参考系与正方向（“地面参考系中的分量，x 轴向右为正”“大小，不带方向”“沿斜面向下为正”“所有接触点的合计”）。电场实验：观察预设（看方向 / 看等势 / 探针测量）、探针 A 与 B、电势差与电场力做功、试探电荷的受力（负电荷另作说明）、“怎样读这张图”（场线不是轨迹、疏密只定性）。

**D122 教学包（第一批 24 个）。** `src/content/packages/index.ts`：每个包是一个演示加标准 / 边界 / 对比预设、讲解、四种练习角色（概念、计算、建模 / 条件、迁移）、常见错误、目标词。进度由内容计算（可发现、可运行、可解释、可练习、可迁移、已试用六个字段），从不手写；没有一个包声称已试用。入口：模型页的“看演示 / 做练习 / 自由实验”，模型目录“只看有教学包的”，全局搜索按目标词（“射程”“摩擦功”“第一次到达”）与六类题型的所求。

**D123 停靠。** `src/app/task/dock.ts`：结果卡片可经菜单（键盘、触屏）或拖动标题（吸附 16 px 进入、28 px 释放的迟滞）固定到任务面板顶部或画面右上角；固定只是布局，存于本机，不改场景；可撤销最近一次，“恢复默认”清除全部。画面上固定的卡片只显示当前修订的结果，过期时明说。

**D124 圆形扩散转场。** `src/app/viewTransition.ts`：切换工作方式与主题时，新界面从点击处以圆形扩散约 320 ms（View Transition API）；状态立即改变，动画只负责呈现，被打断或跳过也停在同一状态。不支持该接口、减弱动态效果（系统或应用设置）或窗口隐藏时直接切换（T23、T24）。

**D125 记录的内容版本与复习。** 活动作答记录带 `contentVersion`（教学内容版本）与 `appVersion`；26.57 之前的记录没有这两个字段，照常保留并标为“较早的内容版本”，不重新评分。学习路径给出复习建议：依据最近一次作答中未全部答对的评分维度（按正确率由低到高），已有掌握证据的活动不再建议——不是自适应算法（任务书 §8.6）。任务文件附 `appVersion`。

## 4. 架构

```
Vue 界面                                              Rust 核心
  TaskPanel / ResultCard / CanvasPins                   teaching.rs   crossing · extreme(t0,t1) · combo
    └ task/*（合同、目录、校验、解析、计划、比较）──calc/session──▶ modelcalc.rs  modelSolve（残差、方法）
  FormulaPanel（变量来源）◀──────── src ──────────────── formula/*      情形识别、变量来源
  渲染 renderer.ts（接触合计、标签避让）◀── 受力 ──────── views.rs       受力箭头 N1、N2…
  learn/packages · content/packages（进度由内容计算）     labs/nuclear.rs chain_at
```

- 任务层（`src/task`）不依赖 Vue 与 DOM，可在测试中直接运行；界面状态在 `src/app/task`。
- 每个数值来自核心：解析计划用核心的模型计算与会话运算，独立核对用另一条计算路径（仿真、另一公式、节点电压法、光线追迹、数值梯度），比较一律经 `compare.ts`。
- 本机存储（只是布局与草稿）：`velophi.task.v1`（任务与草稿）、`velophi.dock.v1`（固定）、`velophi.workmode.v1`（工作方式及其记忆）。

## 5. 兼容与迁移

| 对象 | 处理 |
| --- | --- |
| 场景文件 | 格式不变；77 个旧模板在默认参数下的记录指纹与 26.56 逐位相同，新增 `incline-friction` 一个 |
| 设置 | 新增 `density`（默认 'default'）与 `display.contactPoints`（默认关）；旧设置读入时补默认值。默认字号比 26.56 大，需要旧尺寸可选“紧凑” |
| 画面 | 多接触点的支持力默认合计显示（视觉变化，物理与读数不变）；可在“显示”中打开逐点 |
| 任务文件 | 新格式 `velophi-task`，schema 2，附 `appVersion`；版本不符时拒读并说明 |
| 学习记录 | 作答记录增加可选字段 `contentVersion`、`appVersion`；旧记录照常读取 |
| 计算操作 | 新增 `crossing`；`extreme` 增加可选参数；`modelSolve` 的根增加 `residual`、`checked`，结果增加 `method`；ABI 版本仍为 2 |
| 三语文字 | 新增约 760 条（`src/i18n/texts/v2657.ts`），删除 10 条不再使用的文字 |

## 6. 新增与修改的文件

新增：`src/task/{types,vocab,build,validate,parse,plan,samples,adapters,runner,scene,compare}.ts`、`src/app/task/{taskState,demo,dock}.ts`、`src/app/{workMode,viewTransition,numWheel}.ts`、`src/app/learn/packages.ts`、`src/content/packages/index.ts`、`src/formula/varSource.ts`、`src/analysis/quantityNote.ts`、`src/templates/t2657.ts`、组件 `TriCheck.vue StackCards.vue task/{TaskPanel,ResultCard,CanvasPins}.vue`、`src/i18n/texts/v2657.ts`；`scripts/coverage2657.mjs`；测试 `task2657 taskeval2657 coverage2657`、`tests/helpers/taskEval.ts`、`tests/fixtures/task-eval-{dev,holdout}-2657.json`；`docs/coverage/{requirements-26.57.json,COVERAGE_26_57.md,coverage-26.57.json,task-eval-2657-freeze.md}`、`docs/reports/26.57/*`。

修改：Rust `api.rs teaching.rs modelcalc.rs labs/{mod,nuclear}.rs formula/{mod,situations,situations2651,situations2654,situations2655}.rs`、`engine/CALC.md`；渲染 `render/renderer.ts`；界面 `App.vue TopBar.vue Timeline.vue MonitorPage.vue ChartPanel.vue FormulaPanel.vue WatchPanel.vue MetricTile.vue NumField.vue CommandPalette.vue LearningPath.vue SettingsPage.vue SettingsPanel.vue ActivityRunner.vue`、九个对话框（焦点陷阱）、实验 `CircuitLab FieldLab LensLab`、模型 `ModelCatalog ModelView ParamProblemPanel`；`settings.ts store.ts appearance.ts styles.css focusTrap.ts lab/{state,circuitPresets}.ts learn/records.ts`；`analysis/prediction.ts teaching/{problems,records}.ts teaching/activities/{defs,grade}.ts content/models/{links,m1,m2,e,o}.ts engine/models.ts formula/{recognize,detail}.ts templates/index.ts i18n/*`；版本号与发布脚本。

## 7. 如何添加一种题型或一个教学包

1. 题型：在 `vocab.ts` 中写对象、参考系、已知量（SI 单位、范围、默认值及说明）、所求（量引用、求值点、需要的已知量）；在 `plan.ts` 中写解析计划与至少一条独立核对；在 `samples.ts` 中写示例题；在 `parse.ts` 中写识别规则；在评测集中加入开发用例（盲测集冻结，不改）。
2. 教学包：在 `content/packages/index.ts` 中写演示（模板或实验与预设）、练习来源（活动、`problem:`、`task:`）、常见错误与目标词；进度由 `packageStatus` 计算。
3. 运行 `npx vitest run tests/task2657.test.ts tests/taskeval2657.test.ts` 与 `node scripts/coverage2657.mjs`（引用不存在或状态与证据不符时失败）。

## 8. 验证

| 检查 | 命令 | 结果（容器，Node-API 核心） |
| --- | --- | --- |
| 类型 | `npx vue-tsc --noEmit` | 通过 |
| 前端与核心测试 | `npx vitest run` | 86 个文件 1848 项全部通过（Windows 的 WebAssembly 上 1832 项通过、16 项原生协议测试跳过） |
| Rust | `cargo test --workspace --release`（engine） | 全部通过 |
| 计算对照 | `node scripts/calc-parity.mjs --random 30 --random2651 20 --random2652 20 --impacts 10` | 400 次运行、53 618 个请求，0 处不同 |
| 求解器对照 | `node scripts/parity.mjs --random 120 --random2651 60 --random2652 60 --impacts 30` | 523 个场景、1 964 108 帧，0 处不同 |
| 模板指纹 | `tests/hashes.test.ts` 写 `.cache/node-hashes.json` | 77 个旧模板与 26.56 相同，另加 1 个新模板 |
| 覆盖记录 | `node scripts/coverage.mjs --check`、`node scripts/coverage2657.mjs --check` | 全部引用可解析 |
| 原生与 WASM | `tests/crosscore2656.test.ts` 写 `.cache/crosscore-<core>.json` | Node-API 与 Windows 发布构建的 WebAssembly 摘要相同（`8cd2dbf9…`；`modelSolve` 的输出增加了字段，与 26.56 的摘要不同是预期的）；WebView2 自检 78 个模板一致 |
| 题意识别 | `tests/taskeval2657.test.ts` | 见 §9 |

## 9. 题意识别评测（任务书 §14.2）

240 条：120 条完整、60 条歧义或缺项、30 条冲突或错误单位、30 条超出范围；开发 165 条、盲测 75 条（按题型与变体划分，冻结后不改）。只支持文字输入；图片输入明确排除（VP-16）。

| 指标 | 开发 165 | 盲测 75（首次运行） | 盲测 75（修正后，非盲） |
| --- | --- | --- | --- |
| 题型识别（范围内） | 144/144 | 66/66 | 66/66 |
| 超出范围召回 | 21/21 | 9/9 | 9/9 |
| 对象绑定 | 42/42 | 18/18 | 18/18 |
| 已知量与单位 | 359/359，虚报 0 | 158/158，虚报 0 | 158/158，虚报 0 |
| 所求完整匹配 | 84/84 | 36/36 | 36/36 |
| 应澄清召回 | 60/60 | 26/30（87 %，95 % 区间 70–95 %） | 29/30 |
| 静默输出（发布阻断） | 0/60 | **2/30** | 1/30（复核为标注错误后 0/29） |
| 直出正确 / 覆盖 | 84/84 · 84/84 | 36/36 · 36/36 | 同左 |
| 澄清后成功 · 平均澄清次数 | 11/11 · 1.21 | 3/3 · 1.28 | 3/3 · 1.33 |
| 核心验证拒绝 | 0/84 | 0/36 | 0/36 |

首次盲测发现的缺陷已修正，盲测文件未改：field-ambi-10（第二个点电荷没有给出电荷量却直接求出场强——静默输出，发布阻断；现在追问缺少的电荷量）、field-conf-04（试探电荷放在点电荷所在处，应判“无解”却停在“缺项”）、field-conf-05（场点与一个电荷重合时报“计算失败”，应为“无解：点电荷模型在此没有有限的场强”）；incline-ambi-09 经复核是标注错误（上滑的最大距离只取决于 μk，追问 μs 不必要），记录在报告中。修正后的盲测数字不再是盲测结果；下一版需要新的盲测集。样本小，区间宽，不足以说明任意输入的可靠性。

## 10. 遗留问题与已知限制

26.56 列出的问题：

| 问题 | 处理 |
| --- | --- |
| 衰变链中两个寿命近乎相等时守恒只到约 10⁻¹⁰ | 已修正：`chain_at` 不再经过 1/(λ₂ − λ₁) 的闭式，而是对 B = A + μI（非负的下双对角矩阵）做缩放与平方的非负级数 e^(Bτ)，再乘 e^(−μt)——每一项都非负，没有相消；三种核素的总数守恒到 10⁻¹³（相对）。Rust 测试 `chain_without_cancellation`；衰变链实验改用它 |
| 变量定位（D72）没有自动测试 | 已修正：画布部分抽出为纯函数 `arrowsOfBody`，与 `varHighlight` 一起测试（UX06、FOR09 改为已验证） |
| 公式卡片的变量没有标注来源 | 已修正（D111，FOR03 改为已验证） |
| 26.56 之前的对话框没有焦点陷阱 | 已修正：导出、模板、题目、受力分析图、纸带、参数扫描、实验报告、课件、关于九个对话框（`v-dialog`：Tab 循环、Escape 关闭、打开时聚焦、关闭后焦点返回） |
| 参数化题校验的内部消息为英文 | 已修正：全部消息与抽取被拒的原因都有文字 |
| 间隔复习暂缓 | 部分：按明确薄弱点给复习建议（D125）；不做自适应算法 |

本版检查中发现并修正：新模板的 −0 初速度使保存再读入后的指纹改变（D112）；可动斜面场景被当作固定斜面题（T05）；首次盲测的三条解析缺陷（§9）。

仍然存在、本版不能解决的：

- 刚体场景的库仑常数仍为 CODATA 2018（保留 77 个模板指纹，D97 例外）。
- 74 个 L1 模型族只有受限解析计算，23 个受限模型写明暂缓的部分；通用 PDE / 本征值求解器（ENG08）暂缓。
- 没有学生与教师试用（任务书 §14.4），因此不声称 L4、不声称学习效果；误概念库未经学生数据校准。24 个教学包中 8 个满足前五项（可发现、可运行、可解释、可练习、可迁移），其余 16 个缺少练习角色或迁移题——没有用换数字的重复题充数。
- 图片题识别（VP-16、T13）与第二、三批教学包（VP-17、VP-18）暂缓。
- 文字题只支持中文题干；修正后的盲测集已不是盲测。
- 方程变量与目标之间的语义连线（VP-14 的一部分）没有做；连线的单位检查、叠卡的阅读锚点、触屏与触控板（T18–T20、T22、T32 的触屏部分）只能人工检查或没有设备。
- 色盲模拟与灰度阅读检查没有做。
- 公式工作室的 FormulaDef 尚未迁为带版本与来源的 FormulaSpec（FOR01）；活动编辑器（EDU13）、真实数据导入（EDU08）、QTI / LTI（EDU15）、AI 辅导（EDU18）暂缓。

## 11. 实施记录：Windows 检查中的修正

构建 1（11 步全部通过）之后在便携版中走查任务面板、工作方式、画布、电场实验、监视页、教学包、阅读密度、显示菜单与对话框（`docs/reports/26.57-windows-hand-check.md`，截图 `docs/reports/26.57/hand-*.jpg`），发现并修正：

| 编号 | 发现 | 修正 |
| --- | --- | --- |
| H1 | 监视列表中量的说明与对象名挤在一行，中文折行把对象名拆开 | 对象名与说明各占一行 |
| H2 | 求解后结果在面板下方需要自己滚动；空的“固定的结果”标题紧挨未固定的卡片，像已固定 | 求解后结果区滚入视野；空的固定区说明怎样固定，未固定的结果另有“结果”标题 |
| H3 | 画面上的时刻与时间轴、监视页时钟位数不同（1.00 s 与 1.003 s），像两个时间 | 画面时刻改用同一格式（`fmtTime`） |
| H4 | 文字题的结果固定到画面后，显示在与它无关的场景上 | 只在任务所在的场景（看演示后）显示，否则提示先看演示 |
| H5 | 全局搜索“摩擦功”找不到对应的所求 | 所求的搜索词（三语）进入索引 |
| H6 | 物块静止时“适合视图”只框住物块，看不清斜面角度与比例尺 | 最小范围改为 1.5 m × 1.0 m |

| H7 | 打开另一个场景后，上一道题的结果被标为过期，画面与公式面板仍按该题显示 | 只有编辑题目所在的场景才使结果过期；另一个场景上不显示该题的固定结果与任务筛选（`sceneLoads`） |
| H8 | 斜抛演示中射程超过模板地面（30 m），小球飞出后一直下落 | 演示延长地面并在落地后 0.5 s 结束；模板与指纹不变 |

这些修正不涉及物理计算：Rust 核心与模板未改，测试、指纹与对照结果不变。H1–H6 在构建 2、H7–H8 在构建 3 中复查。
