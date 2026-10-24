# Nova_A

Nova_A is an open-source rhythm-game engine with a visual editor. It combines Rust and WebAssembly for timing, judgement, simulation and scripting, a custom TypeScript renderer, and a Vue 3 editor packaged with Tauri.

Make rhythm games of your own design: charts play on the audio clock and judge every input by its own time; the note types, how they are judged and what moves with the music belong to your game. The 2D engine underneath (scenes, components, physics, Rhai scripts and visual scripting) stays available for everything around the chart. The plan for the next versions is in the [rhythm-engine roadmap](./docs/ROADMAP_RHYTHM_ENGINE.md).

[中文介绍](./README.zh-CN.md) · [30-minute quick start](./docs/QUICKSTART_26_42.en.md) · [User manual](./manual/index.html) · [Example projects](./reference-projects/README.md) · [MIT license](./LICENSE.md)

## Features

| Area | Tools |
| --- | --- |
| Rhythm games | Rhythm Chart 2D (falling lanes or moving judgement lines), the chart's own note types (prefab notes, script-judged notes, own windows and score weights), a master timeline that animates objects, the camera and post-processing on the beat, triggers, audio-clock timing with audio and picture calibration, and a chart editor. |
| Scenes and objects | Hierarchy, transforms, multi-selection, reusable scenes and prefabs, component Inspector, snapping and viewport tools. |
| 2D physics | Rust simulation with bodies, colliders (boxes, circles, capsules, convex and concave polygons), sensors, character controllers, joints (including wheel and target joints), ropes, buoyancy and force areas, conveyor surfaces, collision layers and spatial queries. |
| Rendering | Nova_A's own renderer, with WebGL2 as the compatibility baseline; sprites, cameras, TileMaps, materials, lights and particles. |
| Gameplay | Rhai scripts, Blocks and visual graphs, input mapping with player-rebindable keys, signals, camera effects and gameplay components. |
| Animation and audio | Animation tracks, state transitions, timelines, 2D rigs, audio sources and mixer tools. |
| Game interfaces | Canvas layouts, interactive controls, themes, localization and accessibility settings. |
| Assets | Import, preview and organize sprites, atlases, tiles, fonts, audio, scripts and reusable resources. |
| Editing and debugging | Customizable workspaces, light/dark themes, Comfortable controls, keyboard shortcuts, Undo/Redo, project recovery, Console, Profiler, script and block breakpoints, and a physics recording you can rewind and continue from. |

The [capability catalog](./docs/engine/CAPABILITY_CATALOG.md) describes individual tools. The [feature matrix](./docs/engine/FEATURE_MATRIX.md) records their implementation and verification scope.

## Get started

Choose a packaged version from [the release folders](./releases/) and follow its installation notes. Windows releases provide installer and portable formats; Web releases provide files to host over HTTP. Check the selected release's notes for tested platforms and requirements.

1. Open Nova_A and create a project from a starter, or open an existing project.
2. Arrange objects and components using the Hierarchy, viewport and Inspector.
3. Add gameplay through Rhai scripts or the visual authoring tools.
4. Play, pause and inspect the scene, then save your project.
5. Open Build Settings to choose scenes, an available target and an output location.

Nova Player runs exported games. Content is stored in a versioned `game.nova-pak`; supported desktop outputs offer a separate resource package or an executable with embedded game data. Native exports require the matching host and Player template. Serve Web exports over HTTP.

The current upgrade targets Windows x86-64, Linux x86-64 and Web. Target availability and tested combinations are recorded with each release; the current development plan (`docs/DEV_PLAN_<version>.md`) covers ongoing work. Historical platform options do not imply qualification for the current version.

## Learn Nova_A

- [Interactive manual](./manual/index.html), with English, German and Chinese articles.
- Markdown manuals: [English](./manual/MANUAL.en.md), [Deutsch](./manual/MANUAL.de.md), [中文](./manual/MANUAL.zh-CN.md).
- [Reference projects](./reference-projects/README.md), with example workflows and project-specific instructions.
- [Versioning policy](./docs/VERSIONING_2026.md), including public release labels and engine versions.

The editor also includes contextual help and learning tools. Start with a small example, run it, and inspect how its objects, components and scripts connect.

## Develop from source

Run commands from the repository root. The checkout pins Node.js **22.22.2**, pnpm **10.30.0** and Rust **1.92.0**. Rust's `wasm32-unknown-unknown` target and `wasm-pack` are required for the WebAssembly build. Keep the lockfiles and install frozen dependencies:

```sh
pnpm install --frozen-lockfile
```

Start the browser editor; this builds development WASM before starting Vite:

```sh
pnpm dev
```

Start the desktop editor with the native Tauri prerequisites installed:

```sh
pnpm tauri dev
```

Build and preview the browser application:

```sh
pnpm build
pnpm preview
```

Build desktop bundles on the target operating system:

```sh
pnpm tauri build
```

Desktop development needs the host's compiler and WebView libraries. Use the prerequisites for the locked Tauri toolchain and selected platform. When relocating a checkout, reinstall dependencies and rebuild generated outputs rather than reusing links or native build metadata from the old path.

## Validate changes

```sh
pnpm check
pnpm test:core
cargo clippy --workspace --all-targets -- -D warnings
pnpm check:repository
```

These commands check TypeScript, run the Rust workspace tests, lint Rust code and run the repository checks (generated component tables, manual, template catalog, ignore rules, typography). Behaviour checks live in `scripts/verify-*.mjs`; run one with `node scripts/<name>.mjs` (browser checks use Microsoft Edge, or the Chromium named by `NOVA_AUDIT_BROWSER`). On Windows, `scripts\release.cmd` runs every check, builds the editor, the desktop bundles and the Web package, and writes the release set to `releases\v<version>`; it never commits.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/components/`, `src/ui/`, `src/layout/` | Editor panels, shared controls, visual tokens and layout. |
| `src/editor/`, `src/store/` | Editor integration, authoring state and editing workflows. |
| `src/runtime/`, `src/renderer/` | Runtime systems and Nova_A's rendering implementation. |
| `crates/` | Rust math, physics, runtime, Rhai scripting, project format, WASM boundary and headless modules. |
| `nova_core/` | Core compatibility entry and generated WASM package. |
| `src-tauri/` | Desktop application host and native integration. |
| `scripts/`, `tests/` | Build and release tools, generators, checks and test fixtures. |
| `manual/`, `docs/` | User documentation, engineering specifications and version-specific records. |
| `reference-projects/` | Example projects and tutorials. |
| `releases/` | Packaged versions (not in Git): release notes, evidence and checksums. |

Rust modules provide the simulation, physics, scripting and format foundations. The editor uses Vue 3; game rendering uses Nova_A's custom renderer. Editor/Runtime/Player separation is enforced by `scripts/audit-engine-boundaries.mjs`; the capability catalog and feature matrix under `docs/engine/` describe the modules.

Projects use versioned schemas and stable object/resource identities. Supported older formats migrate through the project-format tools; consult the manual before changing a project's format or opening it with an older engine.

## Contributing

Read the relevant engineering documents under `docs/` before changing architecture or runtime contracts: Runtime, Renderer and Player code must not depend on the editor or Vue stores. Keep changes focused, protect existing projects and run checks covering the affected behavior. Include reproduction steps and platform information when reporting a bug.

The current version's records are under `docs/` (`DEV_PLAN_<version>.md` for plan and status, `EDIT_LEDGER_<version>.md` for every changed file, `RELEASE_NOTES_<version>.md`, `WEB_HOSTING_<version>.md`). Earlier versions' records stay in Git history and in each release's archive; the manual's release chapters summarise them.

## License

Nova_A is distributed under the [MIT license](./LICENSE.md). Bundled fonts and third-party components retain their own licenses and notices. Adapted Godot editor icons are attributed in the license and bundled notices. User-imported assets remain subject to their authors' licenses.
