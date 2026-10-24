# Nova_A reference projects

Example projects that open in the current editor (Project Format 2, schema 29; older engine stamps are upgraded when opened). Each folder holds `project.nova` and, for most, a README with what it shows, `test-controls.json` and `expected-output.json`. The release packs this folder as `Nova_A-v<version>-reference-projects.zip`.

Starters for new projects (the 45 templates, including the 26.46 rhythm starters) are in the editor: Project Manager → New project. The projects here are larger worked examples and regression references; where several releases produced copies of the same example, only the newest copy is kept (the older copies are in Git history).

- [Migration fixtures](migrations/README.md): one project per historical schema, opened and upgraded by the format tests.
- [Plugins](plugins/): sample plugin package.
- `workspace-recovery-validation.nova-workspaces`: a workspace file used by the recovery checks.

## AI

- [Perception and Utility AI 5.7](projects/ai-v57-perception-utility/README.md) — `ai-v57-perception-utility`

## Animation

- [Animation v4.7 Rig and Sprite](projects/animation-v47-rig-sprite/README.md) — `animation-v47-rig-sprite`
- [Animation v4.7 State Machine](projects/animation-v47-state-machine/README.md) — `animation-v47-state-machine`
- [Blend Trees and Runtime Recording 5.6](projects/animation-v56-blend-runtime/README.md) — `animation-v56-blend-runtime`
- [Animation Graph Interoperability 5.6](projects/animation-v56-interop-recording/README.md) — `animation-v56-interop-recording`
- [Nova_A Animator State Machine](projects/animator-state-machine/README.md) — `animator-state-machine`

## Audio

- [Audio Bus Effects](projects/audio-bus-effects/README.md) — `audio-bus-effects`
- [Positional Audio](projects/audio-positional/README.md) — `audio-positional`
- [Streaming Audio](projects/audio-streaming/README.md) — `audio-streaming`
- [Audio 4.8 Routing and Effects](projects/audio-v48-routing-effects/README.md) — `audio-v48-routing-effects`
- [Audio 4.8 Spatial and Streaming](projects/audio-v48-spatial-streaming/README.md) — `audio-v48-spatial-streaming`
- [Waveform and Mixer Production 5.6](projects/audio-v56-waveform-mixer/README.md) — `audio-v56-waveform-mixer`

## Authoring

- [5,000 Object Authoring Stress](projects/authoring-5000-stress/README.md) — `authoring-5000-stress`
- [Multiple Camera Authoring](projects/authoring-multiple-cameras/README.md) — `authoring-multiple-cameras`
- [Nested Prefab Authoring](projects/authoring-nested-prefabs/README.md) — `authoring-nested-prefabs`
- [Parallax Authoring](projects/authoring-parallax/README.md) — `authoring-parallax`
- [Pixel Art Authoring](projects/authoring-pixel-art/README.md) — `authoring-pixel-art`
- [Resolution Independent Authoring](projects/authoring-resolution-independent/README.md) — `authoring-resolution-independent`
- [Nova_A Component validation Reference](projects/authoring-v43-component-validation/README.md) — `authoring-v43-component-validation`
- [Nova_A Multi-scene authoring Reference](projects/authoring-v43-multiscene/README.md) — `authoring-v43-multiscene`
- [Nova_A Nested prefabs Reference](projects/authoring-v43-nested-prefabs/README.md) — `authoring-v43-nested-prefabs`
- [Nova_A Prefab variants Reference](projects/authoring-v43-prefab-variants/README.md) — `authoring-v43-prefab-variants`

## Build and delivery

- [Build Automation Reference](projects/build-automation/README.md) — `build-automation`
- [Build 5.0 Platform Matrix](projects/build-v50-platform-matrix/README.md) — `build-v50-platform-matrix`
- [Build 5.0 Release Pipeline](projects/build-v50-release-pipeline/README.md) — `build-v50-release-pipeline`

## Cinematics

- [Nested Cinematics and Subtitles 5.6](projects/cinematic-v56-nested-subtitles/README.md) — `cinematic-v56-nested-subtitles`

## Collaboration

- [Nova 26.09 Semantic Collaboration Playground](projects/collaboration-v2609-semantic-merge/README.md) — `collaboration-v2609-semantic-merge`
- [Collaboration 5.0 Local Team](projects/collaboration-v50-local-team/README.md) — `collaboration-v50-local-team`

## Content

- [Nova_A Multilingual runtime fonts Reference](projects/content-v44-font-coverage/README.md) — `content-v44-font-coverage`
- [Nova_A Parallax and reusable paths Reference](projects/content-v44-parallax-path/README.md) — `content-v44-parallax-path`
- [Nova_A Sprite and atlas production Reference](projects/content-v44-sprite-atlas/README.md) — `content-v44-sprite-atlas`
- [Nova_A TileMap layers and streaming Reference](projects/content-v44-tilemap-streaming/README.md) — `content-v44-tilemap-streaming`

## Creator games (code, blocks, mixed)

- [Nova 26.10 Block-authored Game](projects/creator-v2610-block-game/README.md) — `creator-v2610-block-game`
- [Nova 26.14 Enemy Family](projects/creator-v2614-enemy-family/README.md) — `creator-v2614-enemy-family`
- [Nova 26.24 Coin Trail — blocks](projects/creator-v2624-blocks-game/README.md) — `creator-v2624-blocks-game`
- [Nova 26.24 Coin Trail — code](projects/creator-v2624-code-game/README.md) — `creator-v2624-code-game`
- [Nova 26.24 Output Quality Workshop](projects/creator-v2624-output-quality/README.md) — `creator-v2624-output-quality`
- [Nova 26.28 Animated Menu](projects/creator-v2628-animated-menu/README.md) — `creator-v2628-animated-menu`
- [Nova 26.38 Coin Trail — mixed](projects/creator-v2638-mixed-game/README.md) — `creator-v2638-mixed-game`
- [Animation and Cutscene](projects/creator-v60-animation-cutscene/README.md) — `creator-v60-animation-cutscene`
- [Localized Responsive Menu](projects/creator-v60-localized-menu/README.md) — `creator-v60-localized-menu`
- [Local Network Sample](projects/creator-v60-network-sample/README.md) — `creator-v60-network-sample`
- [Package and Plugin Workflow](projects/creator-v60-package-plugin/README.md) — `creator-v60-package-plugin`
- [Physics Puzzle](projects/creator-v60-physics-puzzle/README.md) — `creator-v60-physics-puzzle`
- [Complete Platformer](projects/creator-v60-platformer/README.md) — `creator-v60-platformer`
- [Save and Checkpoint Workflow](projects/creator-v60-save-checkpoint/README.md) — `creator-v60-save-checkpoint`
- [Complete Snake](projects/creator-v60-snake/README.md) — `creator-v60-snake`
- [TileMap Streamed World](projects/creator-v60-tilemap-world/README.md) — `creator-v60-tilemap-world`
- [Complete Top-down Game](projects/creator-v60-top-down/README.md) — `creator-v60-top-down`
- [Web Deployment](projects/creator-v60-web-deployment/README.md) — `creator-v60-web-deployment`
- [Windows Portable Export](projects/creator-v60-windows-portable/README.md) — `creator-v60-windows-portable`
- [Nova_A 6.0.1 Mouse Knockout](projects/creator-v601-mouse-knockout/README.md) — `creator-v601-mouse-knockout`
- [Nova_A 6.0.2 interaction and exported-game audit](projects/creator-v602-interaction-export-audit/README.md) — `creator-v602-interaction-export-audit`
- [Nova_A 6.0.3 template export and accessibility audit](projects/creator-v603-template-export-accessibility/README.md) — `creator-v603-template-export-accessibility`
- [Nova_A 6.0.4 linked build and performance audit](projects/creator-v604-linked-build-performance/README.md) — `creator-v604-linked-build-performance`
- [Nova_A 6.2.0 behavior-contract audit](projects/creator-v620-behavior-contract/README.md) — `creator-v620-behavior-contract`
- [Nova_A 6.3.0 automation and visual-block audit](projects/creator-v630-automation-blocks/README.md) — `creator-v630-automation-blocks`
- [Nova_A 6.4.0 content and animation audit](projects/creator-v640-content-animation/README.md) — `creator-v640-content-animation`
- [Nova_A 6.5.0 physics and renderer audit](projects/creator-v650-physics-renderer/README.md) — `creator-v650-physics-renderer`
- [Nova_A 6.6 co-op arena](projects/creator-v660-coop-arena/README.md) — `creator-v660-coop-arena`
- [Nova_A 6.6 headless authority](projects/creator-v660-headless-authority/README.md) — `creator-v660-headless-authority`
- [Nova_A 6.7 no-code touch platformer](projects/creator-v670-touch-platformer/README.md) — `creator-v670-touch-platformer`
- [Nova_A 6.8 large-world playground](projects/creator-v680-large-world/README.md) — `creator-v680-large-world`
- [Nova 6.9 Offline Package Shipping](projects/creator-v690-package-shipping/README.md) — `creator-v690-package-shipping`
- [Nova 6.9 Semantic Collaboration](projects/creator-v690-semantic-collaboration/README.md) — `creator-v690-semantic-collaboration`
- [Nova 7 Migration and Recovery Lab](projects/creator-v700-migration-recovery/README.md) — `creator-v700-migration-recovery`
- [Nova 7 Stable Creator Platform](projects/creator-v700-stable-platform/README.md) — `creator-v700-stable-platform`

## First game

- [First Game 5.0 Tier-1 Export](projects/first-game-v50-tier1/README.md) — `first-game-v50-tier1`

## Multiplayer

- [Nova_A 26.07 co-op rollback](projects/multiplayer-v2607-coop-rollback/README.md) — `multiplayer-v2607-coop-rollback`
- [Nova_A 26.07 headless authority](projects/multiplayer-v2607-headless-authority/README.md) — `multiplayer-v2607-headless-authority`
- [Nova 26.18 Co-op client](projects/multiplayer-v2618-coop-client/README.md) — `multiplayer-v2618-coop-client`
- [Nova 26.18 Co-op host](projects/multiplayer-v2618-coop-host/README.md) — `multiplayer-v2618-coop-host`

## Packages and plugins

- [Package Authoring Reference](projects/package-authoring/README.md) — `package-authoring`
- [Package 5.0 Extension SDK](projects/package-v50-extension-sdk/README.md) — `package-v50-extension-sdk`

## Physics

- [Nova_A Physics Sandbox Reference](projects/physics-sandbox/README.md) — `physics-sandbox`
- [physics-sandbox.nova](projects/physics-sandbox.nova)
- [Nova 26.17 Navigation and streamed worlds](projects/physics-v2617-navigation/README.md) — `physics-v2617-navigation`
- [Nova 26.17 Platforms and materials](projects/physics-v2617-platformer/README.md) — `physics-v2617-platformer`
- [Nova 26.17 Constraints and cloth puzzle](projects/physics-v2617-puzzle/README.md) — `physics-v2617-puzzle`
- [Nova_A 4.5 Physics Diagnostics](projects/physics-v45-diagnostics/README.md) — `physics-v45-diagnostics`
- [Nova_A 4.5 Joint Laboratory](projects/physics-v45-joints/README.md) — `physics-v45-joints`
- [Nova_A 4.5 Platformer Physics](projects/physics-v45-platformer/README.md) — `physics-v45-platformer`
- [Nova_A 4.5 Queries and Triggers](projects/physics-v45-queries-triggers/README.md) — `physics-v45-queries-triggers`
- [Nova_A 4.5 Rope2D Laboratory](projects/physics-v45-rope2d/README.md) — `physics-v45-rope2d`
- [Nova_A 4.5 Top-down Physics](projects/physics-v45-top-down/README.md) — `physics-v45-top-down`

## Rendering

- [Multilingual Font Pipeline](projects/rendering-fonts-multilingual/README.md) — `rendering-fonts-multilingual`
- [Lighting and Shadows](projects/rendering-lighting-shadows/README.md) — `rendering-lighting-shadows`
- [Particle Authoring](projects/rendering-particles/README.md) — `rendering-particles`
- [Render Textures and Cameras](projects/rendering-render-textures/README.md) — `rendering-render-textures`
- [Shader and Typed Uniforms](projects/rendering-shader-uniforms/README.md) — `rendering-shader-uniforms`
- [Rendering 4.8 Lighting and Materials](projects/rendering-v48-lighting-materials/README.md) — `rendering-v48-lighting-materials`
- [Rendering 4.8 Particles](projects/rendering-v48-particles/README.md) — `rendering-v48-particles`
- [Rendering 4.8 Shader Platform](projects/rendering-v48-shader-platform/README.md) — `rendering-v48-shader-platform`
- [Rendering 4.8 Texture and Atlas](projects/rendering-v48-texture-atlas/README.md) — `rendering-v48-texture-atlas`
- [Renderer Fallback 5.5](projects/rendering-v55-fallback/README.md) — `rendering-v55-fallback`
- [Material Graph and Layers 5.5](projects/rendering-v55-material-graph/README.md) — `rendering-v55-material-graph`
- [Particle Trails and Events 5.5](projects/rendering-v55-particle-trails/README.md) — `rendering-v55-particle-trails`
- [Pixel and High DPI 5.5](projects/rendering-v55-pixel-high-dpi/README.md) — `rendering-v55-pixel-high-dpi`

## Scripting

- [Inventory, helper module and callback](projects/scripting-v2624-inventory-callback/README.md) — `scripting-v2624-inventory-callback`

## Server and headless authority

- [Nova 26.18 Headless Authority](projects/server-v2618-headless-authority/README.md) — `server-v2618-headless-authority`
- [Nova 26.38 Headless Authority](projects/server-v2638-headless-authority/README.md) — `server-v2638-headless-authority`

## World streaming

- [Nova_A 26.30 streamed co-op client](projects/world-v2630-stream-client/README.md) — `world-v2630-stream-client`
- [Nova_A 26.30 streamed co-op host](projects/world-v2630-stream-host/README.md) — `world-v2630-stream-host`
- [Streaming State Handoff 5.7](projects/world-v57-streaming-handoff/README.md) — `world-v57-streaming-handoff`

## Other examples

- [Nova_A Accessible HUD](projects/accessible-hud/README.md) — `accessible-hud`
- [Nova_A Ccd Test](projects/ccd-test/README.md) — `ccd-test`
- [Nova_A Controller Navigation](projects/controller-navigation/README.md) — `controller-navigation`
- [Data Foundation Validation](projects/data-foundation-validation/README.md) — `data-foundation-validation`
- [data-foundation-validation.nova](projects/data-foundation-validation.nova)
- [Nova 26.19 Delivery Workshop](projects/delivery-v2619-package-build/README.md) — `delivery-v2619-package-build`
- [Nova 26.19 Collaboration Workshop](projects/delivery-v2619-semantic-merge/README.md) — `delivery-v2619-semantic-merge`
- [Offline Registry Delivery](projects/delivery-v59-offline-registry/README.md) — `delivery-v59-offline-registry`
- [Platform Template Matrix](projects/delivery-v59-platform-matrix/README.md) — `delivery-v59-platform-matrix`
- [Nova_A 6.7 Android delivery gate](projects/delivery-v670-android-gated/README.md) — `delivery-v670-android-gated`
- [Malicious Package Corpus](projects/ecosystem-v59-malicious-corpus/README.md) — `ecosystem-v59-malicious-corpus`
- [WASM Plugin API Matrix](projects/ecosystem-v59-wasm-api-matrix/README.md) — `ecosystem-v59-wasm-api-matrix`
- [Nova_A Empty 2D Reference](projects/empty/README.md) — `empty`
- [empty.nova](projects/empty.nova)
- [Game Flow Menu 5.4](projects/gameplay-v54-menu/README.md) — `gameplay-v54-menu`
- [Gameplay Platformer 5.4](projects/gameplay-v54-platformer/README.md) — `gameplay-v54-platformer`
- [Projectile Pooling 5.4](projects/gameplay-v54-pooling/README.md) — `gameplay-v54-pooling`
- [Snake Growth 5.4](projects/gameplay-v54-snake-growth/README.md) — `gameplay-v54-snake-growth`
- [Twin-stick 5.4](projects/gameplay-v54-twin-stick/README.md) — `gameplay-v54-twin-stick`
- [Optional Headless Networking](projects/headless-networking/README.md) — `headless-networking`
- [Nova_A Joint Showcase](projects/joint-showcase/README.md) — `joint-showcase`
- [Nova_A Localization Workflow](projects/localization-workflow/README.md) — `localization-workflow`
- [Bounded Navigation 5.7](projects/navigation-v57-10000-agents/README.md) — `navigation-v57-10000-agents`
- [Grid and Polygon Navigation](projects/navigation-world/README.md) — `navigation-world`
- [Late Join Replication 5.8](projects/network-v58-late-join/README.md) — `network-v58-late-join`
- [Two-process Localhost RPC 5.8](projects/network-v58-localhost-rpc/README.md) — `network-v58-localhost-rpc`
- [Packet Loss and Reconnect 5.8](projects/network-v58-loss-reconnect/README.md) — `network-v58-loss-reconnect`
- [Replay and Rollback 5.8](projects/network-v58-replay-rollback/README.md) — `network-v58-replay-rollback`
- [Nova_A Networked Optional Reference](projects/networked-optional/README.md) — `networked-optional`
- [networked-optional.nova](projects/networked-optional.nova)
- [Optional Object Pool Package](projects/optional-object-pool/README.md) — `optional-object-pool`
- [Nova 26.09 100k Large-world Playground](projects/performance-v2609-large-world/README.md) — `performance-v2609-large-world`
- [Performance 4.8 Capture](projects/performance-v48-capture/README.md) — `performance-v48-capture`
- [Nova 26.08 Touch, Pen, and Accessibility Playground](projects/platform-v2608-touch-pen-accessibility/README.md) — `platform-v2608-touch-pen-accessibility`
- [Nova_A Platformer Reference](projects/platformer/README.md) — `platformer`
- [Nova_A Platformer Character](projects/platformer-character/README.md) — `platformer-character`
- [platformer.nova](projects/platformer.nova)
- [Production Media 26.05](projects/production-media-v2605-polished/README.md) — `production-media-v2605-polished`
- [Nova_A Pseudolocalization Stress](projects/pseudoloc-stress/README.md) — `pseudoloc-stress`
- [Nova_A Responsive Menu](projects/responsive-menu/README.md) — `responsive-menu`
- [Nova_A RTL Interface](projects/rtl-interface/README.md) — `rtl-interface`
- [Nova_A Runtime Rebinding](projects/runtime-rebinding/README.md) — `runtime-rebinding`
- [Save Migration and Recovery](projects/save-migration/README.md) — `save-migration`
- [Nova_A API v1 Examples](projects/script-api-v1-examples/README.md) — `script-api-v1-examples`
- [Nova_A Async Tasks](projects/script-async-tasks/README.md) — `script-async-tasks`
- [Nova_A Debugger Scenarios](projects/script-debugger-scenarios/README.md) — `script-debugger-scenarios`
- [Nova_A Lifecycle and Signals](projects/script-lifecycle-signals/README.md) — `script-lifecycle-signals`
- [Nova_A Script Test Runner](projects/script-test-runner/README.md) — `script-test-runner`
- [Script v4.6 API Contract](projects/script-v46-api-contract/README.md) — `script-v46-api-contract`
- [Script v4.6 Debugger](projects/script-v46-debugger/README.md) — `script-v46-debugger`
- [Script v4.6 External Tools](projects/script-v46-external-tools/README.md) — `script-v46-external-tools`
- [Script v4.6 Hot Reload](projects/script-v46-hot-reload/README.md) — `script-v46-hot-reload`
- [Script v4.6 Language Services](projects/script-v46-language-services/README.md) — `script-v46-language-services`
- [Script v4.6 Tests Coverage](projects/script-v46-tests-coverage/README.md) — `script-v46-tests-coverage`
- [Simulation Production 26.06](projects/simulation-v2606-physics-navigation-ai/README.md) — `simulation-v2606-physics-navigation-ai`
- [Snake v5.1 playable reference](projects/snake-v51-playable/README.md) — `snake-v51-playable`
- [Source Control Workflow](projects/source-control-workflow/README.md) — `source-control-workflow`
- [Nova_A Sprite Animation](projects/sprite-animation/README.md) — `sprite-animation`
- [Nova_A Stacking Test](projects/stacking-test/README.md) — `stacking-test`
- [Asynchronous Streamed World](projects/streamed-world/README.md) — `streamed-world`
- [Animated and Metadata Tiles](projects/tilemap-animated/README.md) — `tilemap-animated`
- [Multi-layer Tilemap 2.0](projects/tilemap-multilayer/README.md) — `tilemap-multilayer`
- [Terrain Rules and Validation](projects/tilemap-terrain-rules/README.md) — `tilemap-terrain-rules`
- [Deterministic Tile World 5.7](projects/tilemap-v57-background-bake/README.md) — `tilemap-v57-background-bake`
- [Nova_A Top-down Reference](projects/top-down/README.md) — `top-down`
- [Nova_A Top Down Character](projects/top-down-character/README.md) — `top-down-character`
- [top-down.nova](projects/top-down.nova)
- [Nova_A Trigger Showcase](projects/trigger-showcase/README.md) — `trigger-showcase`
- [Nova_A UI Showcase Reference](projects/ui-showcase/README.md) — `ui-showcase`
- [ui-showcase.nova](projects/ui-showcase.nova)
- [UI v4.7 Accessibility](projects/ui-v47-accessibility/README.md) — `ui-v47-accessibility`
- [UI v4.7 Multilingual RTL](projects/ui-v47-multilingual-rtl/README.md) — `ui-v47-multilingual-rtl`
- [UI v4.7 Responsive HUD](projects/ui-v47-responsive-hud/README.md) — `ui-v47-responsive-hud`
- [Visual scripting v5.2 foundation reference](projects/visual-scripting-v52-foundation/README.md) — `visual-scripting-v52-foundation`
- [Visual scripting v5.3 production reference](projects/visual-scripting-v53-production/README.md) — `visual-scripting-v53-production`
- [Web Deployment Reference](projects/web-deployment/README.md) — `web-deployment`
- [Workspace and Recovery Validation](projects/workspace-recovery-validation/README.md) — `workspace-recovery-validation`
- [workspace-recovery-validation.nova](projects/workspace-recovery-validation.nova)
