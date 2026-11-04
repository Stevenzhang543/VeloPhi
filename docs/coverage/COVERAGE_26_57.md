# VeloPhi 26.57 覆盖记录

本文件由 `node scripts/coverage2657.mjs` 根据 `tests/fixtures/coverage/requirements-26.57.json` 与教学包注册数据（src/content/packages）生成；机器可读版本为 coverage-26.57.json。生成时检查每条证据引用都指向仓库中存在的测试（文件与测试名、Rust `#[test]` 函数），“已验证”必须至少有一条测试。26.56 的模型族与需求矩阵见 COVERAGE_26_56.md（本版未改模型注册的状态与成熟度）。

## 1 总览

| 项 | 已验证 | 人工检查 | 部分 | 暂缓 |
| --- | --- | --- | --- | --- |
| 任务书 VP-01–VP-18 | 9 | 3 | 3 | 3 |
| 必测案例 T01–T32 | 26 | 3 | 2 | 1 |

教学包：24 个；可发现 24、可运行 24、可解释 24、可练习 8、可迁移 8、已试用 0；前五项全满足的 8 个。内容版本 26.57.1。

## 2 任务书条目

| ID | 优先级 | 条目 | 状态 | 证据 | 测试 | 尚缺 |
| --- | --- | --- | --- | --- | --- | --- |
| VP-01 | P0 | 三张截图对应的最小场景与当前版本基线 | 已验证（自动测试） | 26.56 便携版中重拍图 A（斜面）、图 B（电场实验）、图 C（渲染与监视）；图 A 的 N、f、a 读数按 2 kg、30°、μk = 0.2 复现到显示精度 | test:task2657 reproduces N = mg cosθ, f = μk N, a = g(sinθ − μk cosθ) | 图 B、图 C 是界面状态（无数值缺陷），只作截图基线 |
| VP-02 | P0 | QuantityRef、EvaluationPoint 与结果版本封装 | 已验证（自动测试） | src/task/types.ts：量引用（对象、量、参考系、分量）、求值点（时刻、事件左右、条件穿越、区间、稳态）、结果封装（任务、修订号、内容哈希、引擎与模型版本、常数集、证据、条件检查、来源、核对） | test:task2657 every result carries its revision, content hash, engine version and provenance；test:task2657 T11: velocities after a collision are read on the right side of the event；test:task2657 T02: “speed after 2 m” binds the first arrival |  |
| VP-03 | P0 | 显式 provenance 与条件四态适配 | 已验证（自动测试） | Rust 核心为每个公式变量发送 src（给定/常数/初态/时刻/仿真/派生）；界面只显示，不再从标签文字推断；核心的条件状态映射为四态 | test:task2657 every variable of every recognised situation comes with an explicit source from the core；test:task2657 VP-03: the four condition states of the core map onto the task applicability；test:details shows known values in display units |  |
| VP-04 | P0 | 斜面三分支及 μs/μk 模板升级 | 已验证（自动测试） | 新模板 incline-friction（μs、μk 分开，初速度可向上，六个预设）；旧模板 incline 与 77 个旧模板指纹不变 | test:task2657 a block that can stay at rest has static friction mg sinθ；test:task2657 sliding up then back: the task finds the stop；test:determinism two runs are bit-identical |  |
| VP-05 | P0 | 结果失效、取消与后台请求竞争处理 | 已验证（自动测试） | TaskRunner：请求票据（任务、修订号、哈希）；新请求取代旧请求；显示前再核对；修改条件后旧结果标为“旧结果”只供比较 | test:task2657 drops an answer when the task changed while it was solved；test:task2657 a newer request supersedes an older one；test:task2657 an old result is never current for the new revision；test:task2657 T16 |  |
| VP-06 | P0 | 手动结构化任务编辑器 | 已验证（自动测试） | 任务面板：题型、已知量（单位、来源、冲突）、所求（目录选择，不猜题意）、条件与假设、澄清问题、撤销 | test:task2657 VP-06: a task filled in by hand asks for what is missing, then solves；test:task2657 T12 | 触屏上的连接只做了人工检查 |
| VP-07 | P1 | 文字题解析与最小澄清 | 部分实现 | 规则解析（中文题干）；240 条评测集（165 开发、75 冻结盲测），按 §14.2 的八项分别报告 | test:taskeval2657 the holdout is the frozen file；test:taskeval2657 scores both parts and writes the report | 首次盲测有 2 条应澄清未澄清（发布阻断项），已修正其中一条、另一条复核为标注错误；修正后盲测集不再“盲”，下一版需要新的盲测集；只支持中文题干 |
| VP-08 | P1 | 统一旧题、活动、预测的求值与比较服务 | 已验证（自动测试） | src/task/compare.ts：一处比较；题目、活动、预测保留各自的容差语义；不同单位先换算；符号错误记为方向错误 | test:task2657 problems, activities and predictions agree with 26.56；test:task2657 an answer in another unit is converted first |  |
| VP-09 | P1 | 六个代表任务的完整教学样板 | 已验证（自动测试） | 斜面、抛体、一维碰撞、直流电路、薄透镜、点电荷电场：示例题、解析步骤、独立核对、演示（模板或实验带入任务数值）、练习活动、迁移题 | test:task2657 incline: speed after 2 m；test:task2657 projectile: first time at 3 m；test:task2657 collision: elastic；test:task2657 circuit: 12 V；test:task2657 lens: f = 10 cm；test:task2657 field: superposed field；test:task2657 VP-09；test:task2657 the incline crosses tanθ = μs | 没有学生试用（§14.4） |
| VP-10 | P1 | 工作方式预设与目标优先的公式/图线筛选 | 人工检查（Windows 发布版） | 学习、解题、实验、编辑四种工作方式（只换面板与叠层，不动场景）；任务演示时公式面板先列任务相关情形、其余收进“更多分析”，曲线有“任务”预设 | test:task2657 switching mode changes panels and overlays | 公式与曲线的目标筛选只做了人工检查 |
| VP-11 | P1 | 视觉 token 与画布标注整理 | 人工检查（Windows 发布版） | 默认正文 14 px、常用按钮 32 px，紧凑与课堂投影两种密度；阅读面板不透明；接触力合计、标签避让物体与引线；量的参考系与正方向说明；播放时刻与“已计算至”分开 | test:task2657 N1, N2 of one contact become one N；test:task2657 moves a label off an obstacle；test:task2657 components name the frame | 色盲模拟与灰度阅读没有做 |
| VP-12 | P1 | 按钮、三态勾选、叠卡基础组件 | 部分实现 | TriCheck（mixed 状态、键盘）、StackCards（就地展开、保持阅读位置） | test:task2657 T17 | 叠卡的阅读锚点与触屏只做了人工检查 |
| VP-13 | P1 | 第一批 24 教学包与模型入口 | 已验证（自动测试） | 24 个教学包：标准/边界/对比预设、讲解、四种练习角色、常见错误；进度由内容计算（六个字段），没有一个声称已试用；模型页“看演示 / 做练习 / 自由实验”；全局搜索按目标词 | test:task2657 24 packages; progress is computed；test:task2657 a goal word finds its packages | 完整（六项中前五项全满足）的包见下表；没有学生试用记录 |
| VP-14 | P2 | 卡片停靠与类型化语义连线 | 部分实现 | 结果卡片可经菜单或拖动（吸附与迟滞）固定到任务面板顶部或画面右上角，可撤销、可恢复默认；题干中未用的数值可点选后连到已知量，单位不符时阻止并说明 | test:task2657 VP-14: pins snap with hysteresis | 方程变量与目标之间的连线没有做；连线的单位检查只有人工检查 |
| VP-15 | P2 | 滚动策略与圆形扩散转场 | 人工检查（Windows 发布版） | 数值框只在按住 Alt 时响应滚轮；工作方式与主题切换用视图过渡的圆形扩散（约 320 ms），减弱动态效果或不支持时立即切换 | test:task2657 does nothing without Alt；test:task2657 T23/T24 | 触控板与触屏没有设备可测 |
| VP-16 | P2 | 图片题识别与字段证据回显 | 明确暂缓 |  |  | 本版不读图片；评测集的图片输入方式明确排除 |
| VP-17 | P2 | 第二批 24 教学包 | 明确暂缓 |  |  |  |
| VP-18 | P3 | 第三批 24 教学包与教学试用 | 明确暂缓 |  |  |  |

## 3 必测案例（§14.1）

| 编号 | 状态 | 测试 | 说明 |
| --- | --- | --- | --- |
| T01 | 已验证（自动测试） | test:task2657 T01 |  |
| T02 | 已验证（自动测试） | test:task2657 T02；test:task2657 incline: speed after 2 m |  |
| T03 | 已验证（自动测试） | test:task2657 T03 |  |
| T04 | 已验证（自动测试） | test:task2657 T04 |  |
| T05 | 已验证（自动测试） | test:task2657 T05 | 修正：此前任何含可动“斜面”角色物体的场景都被当作固定斜面题 |
| T06 | 已验证（自动测试） | test:task2657 T06；test:task2657 the detailed view shows each point |  |
| T07 | 已验证（自动测试） | test:task2657 T07 |  |
| T08 | 已验证（自动测试） | test:task2657 T08 |  |
| T09 | 已验证（自动测试） | test:task2657 T09 |  |
| T10 | 已验证（自动测试） | test:task2657 projectile: first time at 3 m；test:task2657 finds both times a projectile passes |  |
| T11 | 已验证（自动测试） | test:task2657 T11 |  |
| T12 | 已验证（自动测试） | test:task2657 T12 |  |
| T13 | 明确暂缓 |  | 没有图片输入（VP-16） |
| T14 | 已验证（自动测试） | test:task2657 drops an answer when the task changed while it was solved |  |
| T15 | 已验证（自动测试） | test:task2657 T15 |  |
| T16 | 已验证（自动测试） | test:task2657 T16 |  |
| T17 | 已验证（自动测试） | test:task2657 T17 |  |
| T18 | 人工检查（Windows 发布版） |  | 任务面板的连线：单位不符时提示并阻止 |
| T19 | 人工检查（Windows 发布版） |  | 点选数值再点选一行已知量完成连接（不需要拖线） |
| T20 | 人工检查（Windows 发布版） |  | 叠卡展开时阅读位置与焦点保持 |
| T21 | 已验证（自动测试） | test:task2657 T21 |  |
| T22 | 部分实现 |  | 没有触控板可测；内容列表保留原生滚动，没有加平滑层 |
| T23 | 已验证（自动测试） | test:task2657 T23/T24 |  |
| T24 | 已验证（自动测试） | test:task2657 T23/T24 |  |
| T25 | 已验证（自动测试） | test:task2657 T25；test:task2657 field: superposed field |  |
| T26 | 已验证（自动测试） | test:task2657 a goal word finds its packages |  |
| T27 | 已验证（自动测试） | test:task2657 an answer in another unit is converted first |  |
| T28 | 已验证（自动测试） | test:task2657 T28 |  |
| T29 | 已验证（自动测试） | test:task2657 T29；test:determinism two runs are bit-identical |  |
| T30 | 已验证（自动测试） | test:task2657 a task comes back with its targets |  |
| T31 | 已验证（自动测试） | test:loop3 over many seeds the count left after 12 s |  |
| T32 | 部分实现 | test:ux2656 Tab stays inside the dialog | 键盘走查任务面板与对话框（人工）；触屏没有设备 |

## 4 26.56 需求状态的变化

| ID | 26.56 | 26.57 | 证据 | 测试 | 尚缺 |
| --- | --- | --- | --- | --- | --- |
| FOR03 | 部分实现 | 已验证 | 公式卡片的每个变量带来源（给定/常数/初态/时刻/仿真/派生），由核心发送 | test:task2657 every variable of every recognised situation comes with an explicit source from the core |  |
| FOR09 | 部分实现 | 已验证 | 变量定位：悬停变量时在画布上强调对应物体与力，抽出为纯函数后有自动测试 | test:task2657 μ of a contact lights the normal and friction arrows；test:formula/panel cards and known values refer to bodies, forces, contacts and angles |  |
| UX06 | 存在但待验证 | 已验证 | 同上（D72 的画布部分） | test:task2657 μ of a contact lights the normal and friction arrows |  |
| UX08 | 部分实现 | 已验证 | 失败的结果卡片显示状态与原因，不显示数字（服务端渲染测试） | test:task2657 renders the state in words and no value |  |
| EDU12 | 部分实现 | 部分实现 | 学习路径给出复习建议：依据最近一次作答中未全部答对的维度（不是自适应算法）；记录带内容版本 | test:task2657 suggests the weak dimensions of the latest attempt | L4 仍需要学生试用与修订记录 |
| UX13 | 部分实现 | 部分实现 | 26.56 之前的九个模态对话框也有了焦点陷阱（Tab 循环、Escape 关闭、打开时聚焦、关闭后焦点返回） |  | 触屏与窄屏只做了人工检查 |

## 5 教学包（第一批 24 个）

进度字段由内容计算：可发现＝登记了模型族与目标词；可运行＝至少一个演示能打开；可解释＝模型已核验且有例题；可练习＝概念、计算、建模三种练习角色都有；可迁移＝有迁移题；已试用＝有学生试用记录（本版没有）。

| 包 | 名称 | 学段 | 演示预设 | 练习 | 可发现 | 可运行 | 可解释 | 可练习 | 可迁移 | 已试用 | 任务 | 尚缺 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M01 | 匀速运动与参考系 | j | standard、contrast | 0 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| M02 | 匀变速直线运动 | s | standard、boundary | 1 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| M03 | 自由落体与事件时刻 | s | standard、boundary、contrast | 5 | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | 没有学生试用记录 |
| M04 | 斜抛运动 | s | standard、boundary、contrast | 6 | ✓ | ✓ | ✓ | ✓ | ✓ | — | projectile | 没有学生试用记录 |
| M06 | 两绳悬挂与静力平衡 | s | standard | 0 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| M07 | 粗糙斜面滑动 | s | standard、boundary、contrast | 7 | ✓ | ✓ | ✓ | ✓ | ✓ | — | incline | 没有学生试用记录 |
| M08 | 静摩擦阈值与滑动切换 | s | standard、boundary、contrast | 4 | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | 没有学生试用记录 |
| M11 | 阿特伍德机 | s | standard、boundary | 1 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| M12 | 动滑轮与绳长约束 | s | standard | 0 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| M13 | 板块与相对滑动 | s | standard | 1 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| M14 | 传送带与共速事件 | s | standard、contrast | 1 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| M16 | 弹簧与能量交换 | s | standard、contrast | 1 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| M17 | 一维弹性碰撞 | s | standard、boundary、contrast | 6 | ✓ | ✓ | ✓ | ✓ | ✓ | — | collision | 没有学生试用记录 |
| M18 | 完全非弹性碰撞 | s | standard | 2 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| M21 | 杠杆与力矩平衡 | j | standard | 1 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| M24 | 竖直圆周与轻绳 | s | standard、contrast | 1 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| W02 | 单摆与小角近似 | s | standard、contrast | 1 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| E01 | 库仑力与叠加 | s | standard、contrast | 1 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| E02 | 电场线与合场 | s | standard、boundary、contrast | 5 | ✓ | ✓ | ✓ | ✓ | ✓ | — | field | 没有学生试用记录 |
| E04 | 电势 电势能与功 | s | standard | 0 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| E06 | 电容器与储能 | s | standard | 0 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| E09 | 串并联电路 | j | standard、contrast、boundary | 5 | ✓ | ✓ | ✓ | ✓ | ✓ | — | circuit | 没有学生试用记录 |
| O01 | 平面镜与反射 | j | standard | 0 | ✓ | ✓ | ✓ | — | — | — | — | 标准、边界、对比预设不全；练习不足四种角色（概念、计算、建模）；没有迁移题；没有学生试用记录 |
| O04 | 薄透镜成像 | j | standard、boundary、contrast | 5 | ✓ | ✓ | ✓ | ✓ | ✓ | — | lens | 没有学生试用记录 |

## 6 复现

```
node scripts/coverage2657.mjs --check   # 只检查引用与状态
node scripts/coverage2657.mjs           # 重新生成本文件与 coverage-26.57.json
npx vitest run tests/task2657.test.ts tests/taskeval2657.test.ts
```
