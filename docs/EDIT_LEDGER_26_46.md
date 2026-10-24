# Nova_A 26.46 — Edit ledger

Every file changed from the 26.45 release to 26.46, with the reason. The plan and status are in `docs/DEV_PLAN_26_46.md`. Nothing was committed, staged or tagged; all changes are in the working tree for the maintainer to commit.

## Version

- `package.json`, `Cargo.toml`, `Cargo.lock`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `crates/nova_format/src/lib.rs`, `src/projects/projectFormat.ts`, `tests/fixtures/migrations/public-schema-expected.json` — Engine 26.46.0 / release 26.46. `Cargo.toml` also lists the new `crates/nova_rhythm` workspace member; `Cargo.lock` records it. (`src-tauri/Cargo.lock` is rewritten by the release build with the new version.)
- `docs/DEV_PLAN_26_46.md`, `docs/EDIT_LEDGER_26_46.md`, `docs/RELEASE_NOTES_26_46.md` (new), `docs/WEB_HOSTING_26_46.md` (new: the 26.45 guide plus a section on rhythm games — song decoding limits, the first-press audio start, stored calibration, CSP for songs).

## Rhythm core (Rust)

- `crates/nova_rhythm/Cargo.toml`, `crates/nova_rhythm/src/lib.rs` (new crate) — The rhythm game core, independent of the physics and the browser.
- `crates/nova_rhythm/src/chart.rs` (new) — The `.nova-chart` model and parser (format `nova-chart`, version 1): lanes or lines mode, tempo points, judgement lines with eased events, tap/hold/drag/flick notes; validation with readable errors (unknown lane or line, hold without an end, more than 100,000 notes or 256 lines); note times from the tempo map.
- `crates/nova_rhythm/src/tempo.rs` (new) — Tempo map with tempo changes: beat ↔ time, BPM at a time, beats before 0 (lead-in).
- `crates/nova_rhythm/src/ease.rs`, `crates/nova_rhythm/src/curve.rs` (new) — 32 easing curves and event curves for line x, y, rotation, alpha and speed; line position along time is integrated speed (notes on a speed-changing line arrive on time).
- `crates/nova_rhythm/src/session.rs` (new) — Playing a chart: contacts from keys and pointers, judgement by time windows and position (lane, distance along a rotated line), holds that break when let go early, drags and flicks, combo, score (900,000 accuracy + 100,000 combo), early/late counts and mean offset, seek and reset, autoplay, per-frame geometry of visible notes and lines for both styles.
- `crates/nova_rhythm/src/tests.rs` (new) — Tempo, parsing, judgement windows, holds, drags, flicks, line mapping, autoplay to 1,000,000, seek.
- `crates/nova_wasm/src/rhythm.rs` (new), `crates/nova_wasm/src/lib.rs`, `crates/nova_wasm/Cargo.toml` — `WasmRhythmSession` (load, settings array, input batches, update, frame arrays, statistics, seek, autoplay) and `rhythm_validate_chart`.
- `crates/nova_format/src/lib.rs` — Project validation checks that a RhythmChart2D's chart reference points to a `chart` asset.

## Scripts (Rust)

- `crates/nova_script/src/lib.rs` — `RhythmSnapshot` in the script context; commands `Rhythm`, `PostSet`, `PostPulse`, `PostReset`, `JointServo`, `Explode`; `register_rhythm_api` (26 functions) and `register_effects_api` (`post_set`, `post_pulse`, `post_reset`, `joint_servo`, `joint_servo_off`, `explode`); tests for both.
- `crates/nova_script/tests/fixtures/all-blocks.rhai` — Regenerated: the code of every block, including the new ones.

## Audio and input

- `src/runtime/audioRuntimeContracts.ts` — `RhythmAudioPort`, `RhythmAudioBuffer`, `RhythmAudioVoice`: decode a whole song, start it at an audio-clock time on a mixer bus, read the heard context time.
- `src/runtime/audioRuntime.ts`, `src/runtime/audioOwner.ts` — The rhythm port: decoding with size limits (64 MB file, 256 MB decoded), a synthesised click, scheduled voices on the bus, `getOutputTimestamp` with a fallback; voices stop with the rest of the audio.
- `src/runtime/input.ts` — Timed input: key and pointer events with their DOM time stamps (coalesced pointer moves, game surface only, left button only), opened and drained by the rhythm owner; releases for keys and pointers still held when input is released.

## Rhythm runtime and drawing

- `src/runtime/rhythmChartDocument.ts` (new) — The chart file in TypeScript: types, defaults, normalisation, stable serialisation (one note per line), tempo map mirroring the Rust one.
- `src/runtime/rhythmClock.ts` (new) — Lane keys (defaults per lane count, authored keys), keys of input actions kept free in lines mode, the settings array, the chart clock (start, pause, smoothed sampling, event times), song scheduling, judgement labels.
- `src/runtime/rhythmOwner.ts` (new) — Runs every RhythmChart2D during Play: loads and reloads charts and songs, starts on the audio clock (or waits for the first press when the browser blocks sound), maps keys and pointers into the core, plays hit sounds, publishes frames, emits `rhythm.*` signals, handles script commands (resume moves only the clock back one second; judgements, score and combo stay), stores the device calibration.
- `src/renderer/rhythmFrames.ts`, `src/renderer/rhythmRenderer.ts` (new) — Frame registry and drawing: lanes, key flashes, notes, hold bodies, judgement lines, hit effects, judgement, combo, score, progress; placeholder lanes without a frame; no HUD in previews.
- `src/renderer/sceneRenderer.ts` — Draws RhythmChart2D in the entity loop; sorting layer and culling.
- `src/runtime/GameplayRuntimeCore.ts` — The rhythm owner (begin, update while playing or paused, stop), client-to-world mapping for touches, the script context's `rhythm` snapshot, the new script commands, `explode()`, servos before each physics step, script post-processing cleared on Stop, keys of input actions passed to the rhythm owner.
- `src/world/components.ts` — `RhythmChart2D` (chart, song, timing, judgement windows, keys, sound, display, colours, runtime state); Joint2D servo fields (`servoEnabled`, `servoTarget`, `servoGain`, `servoMaxSpeed`).
- `src/world/componentRegistry.ts`, `src/world/entityBuilder.ts`, `src/world/componentSignals.ts` — Registration (Audio category, one per object), construction and asset references, the five `rhythm.*` signals.
- `src/world/componentPrimitiveTypes.ts`, `src/world/componentFieldDescriptions.ts` — Regenerated for the new fields (`componentEnums.ts` unchanged).
- `src/store/physics.ts` — RhythmChart2D asset fields (chart, song, hit sound) for references and export.
- `src/assets/AssetDatabase.ts`, `src/runtime/runtimeAssetRecordContracts.ts`, `src/runtime/runtimeAssetValues.ts`, `src/runtime/runtimeAssetPreparation.ts`, `src/runtime/novaPak.ts` — The `chart` asset type (`.nova-chart`, `Assets/Charts`), readable by scripts and packed into games.

## Editor

- `src/components/RhythmChartInspector.vue` (new), `src/components/ConfigPanel.vue` — The component's Inspector: chart (new, edit), song, play on start, autoplay, lead-in, offset, speed, scale, lane width, judgement line, lane keys, judgement windows, sound, display, colours, live status.
- `src/components/ChartEditorPanel.vue` (new), `src/editor/chartEditing.ts` (new), `src/editor/chartAudio.ts` (new) — The chart editor: timeline with waveform, beat grid, snap, tools, selection and history, tempo and tap BPM, judgement lines and events, playback with metronome and note clicks on its own audio context, preview frames in the Scene view, test from here, calibration with a tap pad.
- `src/components/EditorBottomPanel.vue`, `src/editor/workspaces.ts`, `src/store/editor.ts` — The contextual Chart editor tab and its target.
- `src/components/ActionBar.vue` — After Play the keyboard focus moves to the game view instead of staying on the button.
- `src/components/RuntimeComponentsInspector.vue` — Servo rows for revolute and prismatic joints; the motor row also for prismatic joints.
- `src/i18n.ts` — Rhythm, chart editor and servo text in English, German and Chinese.

## Moved editor code (last M1 gap)

- `src/runtime/GameplayRuntime.ts` → `src/editor/gameplayRuntime.ts`, `src/runtime/testRunner.ts` → `src/editor/testRunner.ts` — The editor's composition of the gameplay runtime and the test runner reach editor modules, so they belong to the editor; the runtime folder is editor-free.
- Importers: `src/components/DeviceInputPanel.vue`, `GraphProductionPanel.vue`, `PhysicsRuntimePanel.vue`, `ProfilerPanel.vue`, `ScriptStudio.vue`, `VirtualControlsOverlay.vue`, `VisualGraphEditor.vue`, `WorldCanvas.vue`, `blocks/BlockScriptEditor.vue`, `src/editor/animationPreviewSession.ts`, `src/editor/objectProvenance.ts`, `src/editor/runCommands.ts`, `src/panels/SettingsPanel.vue`.
- `src/runtime/stableCreatorPlatform.ts` — The runtime evidence path points at `GameplayRuntimeCore.ts`.
- `scripts/audit-engine-boundaries.mjs` — No known M1 gaps; the rhythm owner and renderer are checked entries.
- `scripts/verify-2642-fixed-timers.mjs`, `verify-2643-character-edge.mjs`, `verify-2643-event-timing.mjs`, `verify-2643-scripting.mjs`, `verify-2644-animation.mjs`, `verify-2644-debugger.mjs`, `verify-2645-debugger.mjs`, `verify-2645-effects.mjs`, `verify-2645-input.mjs`, `verify-2645-physics.mjs` — Build the runtime from its new path.
- `docs/engine/CAPABILITY_CATALOG.md`, `docs/engine/FEATURE_MATRIX.md` — Current paths.

## Physics and effects

- `src/runtime/jointServo.ts` (new) — Servo control for revolute and prismatic joints, measured in the solver's sense (connected body relative to the joint's owner).
- `src/renderer/postProcessOverrides.ts` (new), `src/renderer/runtimeRenderingPolicyOwner.ts` — Script post-processing values (tween, pulse, clamp, reset) applied on top of presets and volumes.
- `docs/PHYSICS_2D.md` — Servos and explosions.

## Script API, blocks and documentation

- `src/runtime/scriptApiCatalog.ts` — The `rhythm` group and the effects and physics entries.
- `src/visual/blockScript.ts`, `src/visual/blockScriptCopy.ts` — Rhythm blocks and conditions, “Turn my joint to”, “Flash … by … for … s”, “Explode here”, in three languages.
- `src/visual/rhaiApiSignatures.generated.json` — Regenerated from the new WebAssembly build.
- `docs/RHAI_API_V2.md`, `docs/RHAI_API_V2_MANIFEST.json`, `docs/NOVA_RHAI_API_V2_STUBS.rhai`, `docs/RHAI_V1_TO_V2.json` — Regenerated (`scripts/generate-script-api-docs.mjs`).

## Starters

- `src/projects/rhythmTemplateSong.ts` (new) — Two original songs composed and synthesised in code (PolyBLEP oscillators, delay, soft clipping; 22.05 kHz mono WAV) and their hand-tuned charts.
- `src/projects/templates.ts` — Rhythm Lanes and Rhythm Lines: song, chart, chart object, backdrop, HUD texts, controller script (pause, retry, autoplay, best score), input map, audit rules.
- `src/projects/templateGuides.ts` — Controls, expected result and requirements in three languages; manual and task sections.
- `src/assets/template-previews/rhythm-lanes.png`, `rhythm-lines.png` (new) — Previews from real game captures.
- `scripts/fixtures/v26.15-template-library.json`, `scripts/verify-v26.11-templates.mjs`, `scripts/verify-2642-levels.mjs` — 45 starters; two introduced in 26.46.
- `scripts/fixtures/component-property-dispositions.mjs` — RhythmChart2D's runtime fields.

## Desktop host

- `src-tauri/src/lib.rs` — A package entry larger than its declared decoded size is refused (the field was read but never used).

## Manual

- `manual/MANUAL.en.md`, `manual/MANUAL.de.md`, `manual/MANUAL.zh-CN.md`, `manual/index.html` — The manual presents 26.46 (engine 26.46.0) with a chapter on 26.46 and a lesson “Make a rhythm game” in all three languages, and the two starters' instructions.

## Checks

- `scripts/verify-2646-rhythm.mjs` (new) — 17 checks of the core, timing, runtime, scripts, templates, audio scheduling and drawing.
- `scripts/verify-2646-physics.mjs` (new) — 7 checks of servos, explosions and script post-processing.
- `scripts/verify-2646-rhythm-editor.mjs` (new) — The built editor with real pointer and keyboard input: chart editor, note placement and undo, waveform, calibration, Play with autoplay, both starters; screenshots in `release-audits/`.
- `scripts/verify-2646-rhythm-player.mjs` (new) — Both rhythm starters packed as exported games and run in the independent Player: chart and song load from the package, a first press starts the song, autoplay scores, P pauses and resumes.
- `scripts/release.cmd` — Runs the four new checks.

## Cleanup after the release (maintainer's request: delete old files with no further use)

Made after `releases\v26.46` was packaged; the released archives are unchanged. Deleted tracked files stay in Git history.

- `Nova_A_Apple_UI_LowLatency_NoCommit_Prompt.md` (deleted) — The prompt of an earlier round; kept in 26.45 for the maintainer to decide, now removed.
- `test/` (deleted, 13 files) — A Windows game exported into the repository during the 26.45 hand checks (an 18 MB `My Game.exe` with its build reports) that had been committed. `.gitignore` now ignores game exports in any folder inside the repository (`*.exe`, `build-info.json`, `nova-build-*.json`, the manifests and reports an export writes, `game.nova-pak`), and `scripts/audit-repository-hygiene.mjs` checks those rules.
- `docs/` (deleted, 41 files) — The version records of 26.40–26.45 (`DEV_PLAN_26_43`–`_45`, `EDIT_LEDGER_26_40`–`_45`, `RELEASE_NOTES_26_40`–`_45`, `WEB_HOSTING_26_40`–`_45`, `DEV_MANUAL_26_42`); the staging journals of 26.13–26.15 (`RUNTIME_STAGE.md`, `RENDERER_STAGE.md`, `LAYOUT_ENGINE_STAGE.md`); statements superseded long ago (`KNOWN_LIMITATIONS.md` of 26.10, `STABILITY.md`, `PLATFORM_VERIFICATION.md` and `BENCHMARKS.md` of the 3.x releases, `PROJECT_FORMAT_2_SCHEMA_28.md`); the 26.32–26.37 UI and UX plans, audits, checklists and ledgers (`docs/ui/UI_AUDIT.md`, `MIGRATION.md`, `EDIT_LEDGER.md`, `VERIFICATION.md`, `UI_V2_PLAN.md`, `UI_MOTION_IMPLEMENTATION_PLAN.md`, `MOTION_QA_CHECKLIST.md`, `docs/ux/`) and the 26.34 engine audit and roadmap (`docs/engine/ENGINE_CAPABILITY_AUDIT.md`, `IMPLEMENTATION_ROADMAP.md`). Kept: the 26.46 records, the Rhai API and protocol documents, the physics, audio, particle, material, renderer and performance guides, the compatibility, stable-contract and versioning policies, the quick start, the latency measurements, the engine catalog, feature and test matrices, competitor research, and the UI specifications (`UI_SPEC`, `DECISIONS`, `MOTION_SYSTEM_SPEC`, `UI_VISUAL_V3_SPEC`).
- `README.md`, `README.zh-CN.md` — No links to the deleted tracker; the current version's records are named, earlier ones are in Git history and the release archives. `docs/ui/UI_SPEC.md` — No reference to the deleted migration document.
- `reference-projects/projects/` (98 folders deleted) — Older copies of examples that every release re-stamped (the Coin Trail code/blocks/mixed games of 26.10–26.37, the animated-menu and output-quality references, the headless-authority server of 26.08–26.37, the stream client/host of 26.29, the 4.9 build, collaboration, first-game and package references, the inventory-callback script of 26.23); the newest copy of each is kept, and `server-v2618-headless-authority` stays because the 26.18 co-op references point to it. `reference-projects/README.md` is now an index of the remaining projects by subject instead of a release-by-release history; the manual's links to removed copies point to the kept copies.
- `scripts/verify-2640-motion-frames.mjs`, `scripts/verify-2640-web-release.mjs`, `scripts/lib/worldAudit17.mjs` (deleted) — One-off 26.40 checks that no release run uses (the second checked the 26.40 Web package).
- `tests/fixtures/` (6 files deleted) — Fixtures of scripts removed in 26.45 (`v1_1_2_project.json`, the 4.6 headless pass/fail scripts, the Rhai API v1 contract).
- `src/` (22 files deleted) — Modules nothing imports: `assets/TextureAtlas.ts` and `assets/derivedSpriteTexture.ts` (legacy wrappers of the media owner), `runtime/physics2d.ts`, `runtime/runtimeRequiredMediaReady.ts`, `runtime/creatorQualification.ts` (v6 audits), `runtime/featureLifecycle.ts`, `world/componentFieldPresentation.ts` and `componentFieldSchema.ts`, `editor/scriptLanguageSyntax.ts`, `panels/RendererPanel.vue`, `panels/ScenePanel.vue`, and the eleven unused SVGs in `assets/icons/` (the editor draws its icons with `EditorIcon`). Found by tracing every import from the four HTML entries and the scripts; `vue-tsc` and the build pass without them. `src/runtime/stableCreatorPlatform.ts` names `GameplayRuntimeCore.ts` instead of the deleted `physics2d.ts`.
