# Verity 26.49（暂名）

面向物理专业学生、物理老师和爱好者的二维力学仿真与教学引擎。搭场景、设参数、运行，随时暂停读出任意物体的物理量；系统自动识别典型情形，给出带适用条件的公式，代入数值后与仿真结果并排显示误差。

画面上的一切都来自数值求解器，公式只做对照，误差公开——这就是“物理上可验证的正确”。

## 快速上手

1. 打开程序（桌面版 `Verity-v26.49-windows-x64-portable.exe`，或安装 `…-setup.exe`；网页版见 `docs/WEB_HOSTING.md`）。
2. 点“模板”，从 21 个经典模型中选一个（如“板块模型”），按需修改参数，点“创建场景”。
3. 按空格播放 / 暂停；← → 逐帧；时间线上的菱形是事件（碰撞、共速、开始滑动……），点“事件 ▶”跳过去。计算较长时可以先播放已算出的部分。
4. 右侧“公式对照”列出当前时刻适用的公式：符号式、代入式、理论值、仿真值、误差与判定。
5. 点选画布上的物体：“监视”标签给出它此刻的全部读数，可加入监视列表和曲线；“渲染与监视”页（Alt+2）用大画面、数值卡片、能量条和曲线展示同一结果。
6. 用左侧工具自己搭场景：单击按默认尺寸放置，或拖拽拉出大小；选中后用手柄改尺寸、旋转、拖动多边形顶点。连接件有轻绳、轻杆、弹簧、铰链和外力；外力可在“属性”中写成表达式，滑轮可装在物体上成为动滑轮。修改后自动重算。
7. “输出”菜单：CSV 与视频、课件包（视频、截图、公式卡、CSV，可选 PPTX）、实验报告（HTML，可打印为 PDF）。“参数扫描”批量运行一个参数，“预测”标签让学生先写下预测再对照。
8. 单位、重力默认值、画面效果、吸附等在“设置”页（Alt+3 或 Ctrl+,）。

常用快捷键：空格 播放/暂停 · ←/→ 逐帧（Shift ×10）· Ctrl+Z / Ctrl+Y 撤销/重做 · Ctrl+C / Ctrl+V / Ctrl+D 复制/粘贴/原地复制 · Delete 删除 · Esc 取消 · Ctrl+S 保存 · Ctrl+O 打开 · Ctrl+Enter 重新计算 · Alt+1/2/3 切换页面。工具：V 选择 · H 平移 · B 物块 · O 小球 · C 圆柱 · P 多边形 · G 地面 · I 斜面 · W 墙 · M 尺子 · A 量角器 · T 文字 · L 箭头。完整列表见“设置 › 快捷键”。

## 物理模型

- 二维刚体与质点，内部一律国际单位，显示单位可在设置中选择（如 cm、g、km/h）。重力、恒力与变力 F(t, 状态)、弹簧（可带阻尼）、轻绳（可绕定滑轮和动滑轮）、轻杆、铰链。
- 接触：单侧约束 + 库仑摩擦（静/动摩擦因数分开）；碰撞按恢复系数，单点碰撞计入摩擦（Stronge 能量恢复系数），多点同时碰撞为光滑冲量。
- 求解：每个阶段的接触/绳/变力分支固定，约束力由加速度级方程精确解出；Dormand–Prince 5(4) 自适应积分（也可选 RK4 / 半隐式欧拉做对比）；状态切换事件定位到约 10⁻¹² s。事件过于密集时改用 Moreau–Jean 时间步进，并明确标注精度降级。
- 计算在后台线程（Web Worker）中进行，界面不卡顿；结果与在界面线程计算逐位相同。
- 可复现：确定性数学库（fdlibm 移植），同一场景每次计算逐位一致（SHA-256 指纹；Node 与 Chromium 中相同）。26.48 的模板结果在 26.49 中不变。
- 守恒检查：能量账本（机械能 + 摩擦生热 + 碰撞损失 − 外力与电机做功）漂移 ≤ 10⁻⁸。

## 开发

```
npm ci
npm run dev          # 浏览器开发服务器 http://localhost:5178
npx vitest run       # 全部自动测试（npm test 相同）
npm run typecheck    # 类型检查
npm run build        # 类型检查 + 网页版 → dist/
npx tauri build      # Windows 桌面版（需要 Rust 1.90+ 与 WebView2）
scripts\release.cmd  # 完整发布（Windows）：npm ci、类型检查、测试、Tauri 构建、打包到 releases\v<版本>
```

辅助脚本：`node scripts/bench.mjs [--baseline <旧版源码>]`（求解器计时与指纹对比）· `node scripts/check-browser-hashes.cjs --worker`（在 Chromium 中比较 Worker、主线程与 Node 的指纹；需要另行安装 Playwright）· `python3 scripts/third_party_notices.py`（重新生成第三方声明）。

目录：`src/core`（数学、场景、求解器、记录、观测量）· `src/formula`（识别器、公式库、表达式与量纲）· `src/units`（单位表）· `src/worker`（计算线程）· `src/render`（Canvas 渲染与视觉效果）· `src/export`（CSV、视频、截图、公式卡、课件包、PPTX、报告）· `src/analysis`（预测、参数扫描）· `src/app`（界面与编辑器）· `src/templates`（经典模型）· `tests` · `src-tauri`（桌面外壳）。

## 文档

- `docs/RELEASE_NOTES_26_49.md`：本版发布说明（`RELEASE_NOTES_26_48.md` 为上一版）
- `docs/DEV_MANUAL_26_48.md`：原则、架构、误差阈值与决策 D1–D12
- `docs/DEV_MANUAL_26_49.md`：26.49 的计划、决策 D13–D25 与实际完成情况
- `docs/WEB_HOSTING.md`：网页版部署
- `docs/THIRD_PARTY_NOTICES.md`：第三方组件与许可证
- `docs/reports/`：阶段报告（26.48、26.49）、26.48 Windows 实机检查、26.49 师生试用方案（试用尚未进行）

## 许可

本仓库的许可证由维护者确定；第三方组件的许可见 `docs/THIRD_PARTY_NOTICES.md`。
