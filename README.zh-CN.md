中文 | [English](./README.md)

# Nova_A

Nova_A 是一个开源的音游引擎，带有可视化编辑器。计时、判定、模拟与脚本由 Rust 和 WebAssembly 实现，渲染器用 TypeScript 自行编写，编辑器基于 Vue 3，并用 Tauri 打包为桌面应用。

用它制作你自己设计的音游：谱面在音频时钟上播放，每次输入都按它自己的时间判定；音符类型、判定方式以及随音乐变化的内容都由你的游戏决定。底层的 2D 引擎（场景、组件、物理、Rhai 脚本和可视化脚本）照常可用，用来做谱面之外的一切。后续版本计划见[音游引擎路线图](./docs/ROADMAP_RHYTHM_ENGINE.md)。

[30 分钟快速上手](./docs/QUICKSTART_26_42.zh.md) · [用户手册](./manual/index.html) · [示例项目](./reference-projects/README.md) · [MIT 许可证](./LICENSE.md)

## 功能

| 方面 | 工具 |
| --- | --- |
| 音游 | 二维节奏谱面（下落轨道或移动判定线）、谱面自定义音符类型（预制体音符、由脚本判定的音符、自己的判定窗口和分值权重）、按拍驱动物体/相机/后期效果的主时间线、触发器、基于音频时钟的计时与音频/画面延迟校准，以及谱面编辑器。 |
| 场景与对象 | 层级、变换、多选、可复用场景与预制体、组件检查器、吸附与视口工具。 |
| 2D 物理 | Rust 实现的刚体、碰撞体（矩形、圆、胶囊、凸与凹多边形）、传感器、角色控制器、关节（含车轮与目标关节）、绳索、浮力与力场区域、传送带表面、碰撞层与空间查询。 |
| 渲染 | Nova_A 自己的渲染器，以 WebGL2 为兼容基线；精灵、摄像机、瓦片地图、材质、光照与粒子。 |
| 玩法 | Rhai 脚本、积木与可视化图、玩家可改键的输入映射、信号、镜头效果与玩法组件。 |
| 动画与音频 | 动画轨道、状态切换、时间线、2D 骨骼、音源与混音工具。 |
| 游戏界面 | Canvas 布局、交互控件、主题、本地化与无障碍设置。 |
| 资源 | 导入、预览并整理精灵、图集、瓦片、字体、音频、脚本与可复用资源。 |
| 编辑与调试 | 可定制工作区、浅色/深色主题、舒适控件尺寸、快捷键、撤销/重做、项目恢复、控制台、性能分析器、脚本与积木断点，以及可回放并从中继续的物理录制。 |

[能力目录](./docs/engine/CAPABILITY_CATALOG.md)介绍各项工具，[功能矩阵](./docs/engine/FEATURE_MATRIX.md)记录它们的实现与验证范围。

## 开始使用

在发布文件夹中选择一个打包好的版本，按其中的说明安装。Windows 版本提供安装程序和便携版；Web 版本提供需要通过 HTTP 托管的文件。各版本的发布说明列出了测试过的平台与要求。

1. 打开 Nova_A，从模板新建项目，或打开已有项目。
2. 用层级、视口和检查器摆放对象、添加组件。
3. 用 Rhai 脚本或可视化编写工具加入玩法。
4. 运行、暂停并检查场景，然后保存项目。
5. 打开“构建设置”，选择场景、可用的目标平台和输出位置。

导出的游戏由 Nova Player 运行。游戏内容保存在带版本号的 `game.nova-pak` 中；桌面输出可以是单独的资源包，也可以是内嵌游戏数据的可执行文件。原生导出需要对应平台的主机和 Player 模板。Web 导出需要通过 HTTP 访问。

当前升级的目标平台是 Windows x86-64、Linux x86-64 和 Web。各版本实际测试过的组合记录在该版本的发布说明中；当前的开发计划（`docs/DEV_PLAN_<版本>.md`）记录正在进行的工作。旧版本出现过的平台选项不代表当前版本已经验证。

## 学习 Nova_A

- [交互式手册](./manual/index.html)，含英文、德文和中文文章。
- Markdown 手册：[English](./manual/MANUAL.en.md)、[Deutsch](./manual/MANUAL.de.md)、[中文](./manual/MANUAL.zh-CN.md)。
- [示例项目](./reference-projects/README.md)，附带示例流程和各项目的说明。
- [版本规则](./docs/VERSIONING_2026.md)，说明公开版本号与引擎版本号。

编辑器内也有上下文帮助和学习工具。建议从一个小示例开始：运行它，再看看其中的对象、组件和脚本是如何连接的。

## 从源码开发

在仓库根目录运行命令。本仓库固定使用 Node.js **22.22.2**、pnpm **10.30.0** 和 Rust **1.92.0**。WebAssembly 构建需要 Rust 的 `wasm32-unknown-unknown` 目标和 `wasm-pack`。保留锁文件，并安装锁定的依赖：

```sh
pnpm install --frozen-lockfile
```

启动浏览器版编辑器（会先构建开发版 WASM，再启动 Vite）：

```sh
pnpm dev
```

安装好 Tauri 原生依赖后，启动桌面版编辑器：

```sh
pnpm tauri dev
```

构建并预览浏览器版应用：

```sh
pnpm build
pnpm preview
```

在目标操作系统上构建桌面安装包：

```sh
pnpm tauri build
```

桌面开发需要本机的编译器和 WebView 库，请按所锁定的 Tauri 工具链和目标平台准备。移动检出目录后，请重新安装依赖并重新生成构建输出，不要沿用旧路径下的链接或原生构建元数据。

## 验证修改

```sh
pnpm check
pnpm test:core
cargo clippy --workspace --all-targets -- -D warnings
pnpm check:repository
```

这些命令依次检查 TypeScript、运行 Rust 工作区测试、对 Rust 代码做 lint，并运行仓库检查（生成的组件表、手册、模板目录、忽略规则、字号）。行为检查位于 `scripts/verify-*.mjs`，用 `node scripts/<名称>.mjs` 单独运行（浏览器检查使用 Microsoft Edge，或 `NOVA_AUDIT_BROWSER` 指定的 Chromium）。在 Windows 上，`scripts\release.cmd` 会运行全部检查，构建编辑器、桌面安装包和 Web 包，并把发布文件写入 `releases\v<版本>`；它不会做任何 Git 提交。

## 仓库结构

| 路径 | 用途 |
| --- | --- |
| `src/components/`、`src/ui/`、`src/layout/` | 编辑器面板、通用控件、视觉变量与布局。 |
| `src/editor/`、`src/store/` | 编辑器集成、编写状态与编辑流程。 |
| `src/runtime/`、`src/renderer/` | 运行时系统与 Nova_A 的渲染实现。 |
| `crates/` | Rust 数学、物理、运行时、Rhai 脚本、项目格式、WASM 边界与无界面模块。 |
| `nova_core/` | 核心兼容入口和生成的 WASM 包。 |
| `src-tauri/` | 桌面应用宿主与原生集成。 |
| `scripts/`、`tests/` | 构建与发布工具、生成器、检查与测试数据。 |
| `manual/`、`docs/` | 用户手册、工程规范与各版本记录。 |
| `reference-projects/` | 示例项目与教程。 |
| `releases/` | 打包好的版本（不在 Git 中）：发布说明、证据与校验和。 |

模拟、物理、脚本和格式的基础由 Rust 模块提供。编辑器使用 Vue 3，游戏渲染使用 Nova_A 自己的渲染器。编辑器、运行时与 Player 的分离由 `scripts/audit-engine-boundaries.mjs` 检查；`docs/engine/` 下的功能目录和功能矩阵说明各模块。

项目使用带版本的 schema，并保持对象和资源的标识稳定。受支持的旧格式通过项目格式工具迁移；更改项目格式，或用旧版引擎打开项目之前，请先查阅手册。

## 参与开发

修改架构或运行时契约之前，请先阅读 `docs/` 下的相关工程文档：运行时、渲染器和 Player 的代码不能依赖编辑器或 Vue 状态。保持改动聚焦，保护已有项目，并运行覆盖受影响行为的检查。报告问题时请附上复现步骤和平台信息。

当前版本的记录在 `docs/` 下（`DEV_PLAN_<版本>.md` 记录计划与状态，`EDIT_LEDGER_<版本>.md` 记录每个改动的文件，另有 `RELEASE_NOTES_<版本>.md` 与 `WEB_HOSTING_<版本>.md`）。更早版本的记录保留在 Git 历史和各版本的发布包中，手册中的版本章节对其做了汇总。

## 许可证

Nova_A 以 [MIT 许可证](./LICENSE.md)发布。随附的字体和第三方组件保留各自的许可证与声明。改编自 Godot 的编辑器图标在许可证及随附声明中注明出处。用户导入的资源仍受其作者许可证约束。
