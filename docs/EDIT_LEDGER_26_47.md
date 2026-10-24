# Nova_A 26.47 — Edit ledger

Every file changed from the 26.46 release to 26.47, with the reason. The plan and status are in `docs/DEV_PLAN_26_47.md`, the direction for the next rounds in `docs/ROADMAP_RHYTHM_ENGINE.md`. Nothing was committed, staged or tagged; all changes are in the working tree for the maintainer to commit.

## Version

- `package.json`, `Cargo.toml`, `Cargo.lock`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `crates/nova_format/src/lib.rs`, `src/projects/projectFormat.ts`, `tests/fixtures/migrations/public-schema-expected.json` — Engine 26.47.0 / release 26.47. Project format 2 / schema 29 unchanged. (`src-tauri/Cargo.lock` is rewritten by the release build with the new version.)
- `docs/DEV_PLAN_26_47.md`, `docs/EDIT_LEDGER_26_47.md`, `docs/RELEASE_NOTES_26_47.md` (new), `docs/WEB_HOSTING_26_47.md` (new: the 26.46 guide plus a section on chart version 2, prefab notes and the stored picture offset).
- `docs/ROADMAP_RHYTHM_ENGINE.md` (new) — The rhythm-engine direction kept with the code: principles, the keep / optional / cut table, the plans for 26.47, 26.48 and 26.49 with acceptance by hand, and the projects too large for three versions.
- `README.md`, `README.zh-CN.md` — Nova_A introduced as a rhythm-game engine; a Rhythm row in the feature table; the current records named.

## Rhythm core (Rust)

- `crates/nova_rhythm/src/chart.rs` — Chart version 2 (version 1 reads unchanged): `noteTypes` (id, base behaviour tap/hold/drag/flick/custom, windows, weight, combo, untouched result, hit area), per-note `type`, `size` and `data`, `tracks` (target, property, eased events over beats) and `triggers` (beat, name, value); compiled to `NoteType`, `Track`, `Trigger` with the tempo map. Built-in types are indices 0–3, the chart's own follow. New errors: unknown note type, duplicate or empty type id, bad windows, more than 256 types, 512 tracks or 20,000 triggers.
- `crates/nova_rhythm/src/session.rs` — Windows, weight, combo and hit area per note type; weighted score (900,000 × weighted accuracy + 100,000 × longest combo over the combo notes; every version 1 chart scores as before); custom notes report presses (`take_touches`) without being consumed and take judgements from the game (`judge_note` by name or offset); notes to avoid count perfect when untouched; `track_values` at a time; triggers taken once per pass (`take_triggers`), a seek starts again at the new time; `pending()`; the frame's note draw carries type and size.
- `crates/nova_rhythm/src/curve.rs` — `started(time)`: a track before its first event leaves its target alone.
- `crates/nova_rhythm/src/lib.rs` — Re-exports `NoteType`, `Track`, `Trigger`, `TouchEvent`.
- `crates/nova_rhythm/src/tests.rs` — Four new tests: note types compile and report errors; type weights and combo in the score; custom notes report touches and take script judgements, notes to avoid; tracks and triggers with seek.
- `crates/nova_wasm/src/rhythm.rs` — The new data across the boundary: judgements with type (stride 12), frame notes with type and size (stride 12), notes with type and source (stride 10), touches (stride 7), triggers (stride 3), `type_ids`, `track_info`, `trigger_names`, `track_values`, `judge_note`, `note_pending`.

## Scripts (Rust)

- `crates/nova_script/src/lib.rs` — `RhythmSnapshot` gains the picture offset and the object's note; command `RhythmJudge` (serialised as `rhythmJudge`); functions `rhythm_judge(note, judgement)` (unknown names count as miss), `rhythm_judge(note, offset_ms)`, `rhythm_my_note()`, `rhythm_visual_offset()`, `rhythm_set_visual_offset(ms)` (clamped to ±500 ms); a new test. Formatted with `cargo fmt`.
- `crates/nova_script/tests/fixtures/all-blocks.rhai` — Regenerated: the code of every block, including “Judge my note as …”.

## Rhythm runtime and drawing

- `src/runtime/rhythmChartDocument.ts` — The chart file in TypeScript: note types, bases, shapes, tracks (object, camera, post-processing properties), triggers; version 1 and 2 read; saved as version 1 unless a version 2 feature is used; defaults for a new type.
- `src/runtime/rhythmOwner.ts` — Note-type looks and per-type hit sounds and effects; prefab notes from a pool (at most 256) placed and turned on their notes, `rhythm_my_note()` data, `rhythm.note_hit` / `rhythm.note_miss` with a fifth of a second linger; `rhythm.touch` for custom notes; script judgements; typed `rhythm.hit` / `rhythm.miss` payloads (type, world position, line, data, `avoided`); tracks applied to objects, the camera and post-processing with the target's own value restored before the first event and after a seek back; `rhythm.trigger` to every object; the stored picture offset moves drawing, not judgement; error bar data; `suggestedCalibrationMs` in `rhythm.finished`; autoplay leaves notes to avoid silent.
- `src/renderer/rhythmFrames.ts` — Frame note stride 12 (type, size); per-frame note-type looks; error bar data.
- `src/renderer/rhythmRenderer.ts` — Shapes per note type (bar, circle, ring, diamond, square, none), colour and size; prefab types not drawn; the hit error bar under the judgement line. Found in the release check: in lanes charts the Paused and start messages moved up between the combo and the score (they covered the combo since 26.46).
- `src/runtime/GameplayRuntimeCore.ts` — Ports for prefab spawning, removal and script post-processing; the `rhythmJudge` command and the `visual` rhythm action; the stored picture offset at start; the snapshot per object (its note). The fixed-step solver checksum is hashed only while a replay records or plays back or a network session runs.
- `src/runtime/productionNetworkOwner.ts` — `networkingActive` for the checksum rule.
- `src/world/World.ts` — A scene without rigid bodies, tile collision or joints skips the solver's synchronisation and pose read-back every fixed step (fixed steps, timers and scripts run as before); the count of skipped steps for the checks.
- `src/world/components.ts` — RhythmChart2D `showErrorBar`.
- `src/world/componentPrimitiveTypes.ts`, `src/world/componentFieldDescriptions.ts` — Regenerated for the new field (`componentEnums.ts` unchanged).

## Editor

- `src/components/ChartTypesTimeline.vue` (new) — The chart editor's Note types section (add, rename with the notes following, behaviour, windows, weight, combo, untouched result, hit area, shape, colour, size, effect, prefab, hit sound, usage count, remove) and Timeline section (tracks with target, property and events; triggers with beat, name and value).
- `src/components/ChartEditorPanel.vue` — The Own type tool (7) with its type list; own types drawn in their colour with their initial; track bars and trigger flags on the grid; the picture test in the calibration dialog; preview frames with note-type looks.
- `src/editor/chartEditing.ts` — The `custom` tool.
- `src/components/RhythmChartInspector.vue` — Display: Hit error bar.
- `src/components/SceneSideBar.vue` — Found in the release check: the children of a collapsed object were also listed at the top level of the Hierarchy (the fallback meant for parent cycles listed every object not yet shown; objects spawned during Play, such as prefab notes, start collapsed and showed it). Only objects that no root reaches are listed there now.
- `src/editor/componentPalette.ts`, `src/components/ConfigPanel.vue` — Add Component lists Rhythm, Core, 2D, Audio, UI, Camera and Script first and the classic groups under “More”; components planned for removal (World Chunk 2D, Portal 2D, the navigation components, Behavior Tree 2D) only when searched for or with “Also show components to be removed”.
- `src/components/ProjectManager.vue`, `src/projects/templateDiscovery.ts` — The Rhythm games category and icon; rhythm starters and the latency, audio, UI, rendering, particle and lighting labs first, the other templates marked Classic.
- `src/i18n.ts` — Note types, timeline, picture test, error bar, component lists and Classic badge in English, German and Chinese; the feature lists of the three rhythm starters in German and Chinese (found in the release check: they were shown in English).

## Script API and blocks

- `src/runtime/scriptApiCatalog.ts` — The four new functions; the picture offset and the object's note are host-dependent values.
- `src/visual/blockScript.ts`, `src/visual/blockScriptCopy.ts` — Block “Judge my note as …” (Sound) in three languages.
- `src/visual/rhaiApiSignatures.generated.json` — Regenerated from the new WebAssembly build.
- `docs/RHAI_API_V2.md`, `docs/RHAI_API_V2_MANIFEST.json`, `docs/NOVA_RHAI_API_V2_STUBS.rhai` — Regenerated (`scripts/generate-script-api-docs.mjs`): the four new functions.

## Starter

- `src/projects/rhythmTemplateSong.ts` — “Prism Pulse” (120 BPM, original, synthesised in code) and its chart: 97 notes with eight star notes (prefab, double weight) and eight mines (script judged, weight 0, perfect when untouched), five tracks (camera zoom, prism rotation, scale and alpha, bloom) and three triggers.
- `src/projects/templates.ts` — Rhythm Lab: song, chart, star prefab (glow, spinning core and point), prism backdrop, section text, controller script (mines, camera shake, trigger texts, pause, retry, autoplay, best score), post-processing; the rhythm category first; the rhythm-first and classic marking of every template; audit rules. Found in the release check: Retry in the three rhythm controllers (Lanes, Lines, Lab) now also clears the result line of the previous run.
- `src/projects/templateGuides.ts` — Rhythm Lab controls, expected result and requirements in three languages.
- `src/assets/template-previews/rhythm-lab.png` (new) — Preview from a Player capture.

## Manual

- `manual/MANUAL.en.md`, `manual/MANUAL.de.md`, `manual/MANUAL.zh-CN.md`, `manual/index.html` — The manual presents 26.47 (engine 26.47.0) with a chapter on 26.47 and a lesson “Your own notes and the master timeline” in all three languages, and the Rhythm Lab instructions.

## Checks

- `scripts/verify-2647-rhythm.mjs` (new) — 8 checks: version 2 charts in Rust and TypeScript; per-type windows, weights, script judgement and notes to avoid; picture offset and error bar; tracks, camera, post-processing, restore after a seek, triggers once per pass; the Rhythm Lab to 1,000,000 with prefab stars, mines, timeline and triggers; renderer shapes; physics skipping and checksums; rhythm-first lists. After the release check also: each star's point is a child of its core, and Retry clears the result line in every rhythm starter.
- `scripts/verify-2647-rhythm-editor.mjs` (new) — The built editor with real pointer and keyboard input: the lab's types, tracks and triggers; a new type placed with the Own type tool and undone; a trigger; the picture test; Add Component; Play. After the release check also: collapsing the lab's HUD Canvas hides its texts and expanding shows them again.
- `scripts/verify-2647-rhythm-player.mjs` (new) — The Rhythm Lab exported and played in the Player.
- `scripts/bench-2647-rhythm-frame.mjs` (new) — Frame bench (headless, 120 Hz) of Rhythm Lanes, Rhythm Lab and a physics starter, physics part and whole frame. Its generated imports use forward slashes so that it also runs on Windows (the first release run failed there on a backslash path).
- `scripts/verify-2646-rhythm.mjs` — Renderer test frames with the 12-value note stride, note types and error bar.
- `scripts/verify-template-catalog.mjs`, `scripts/verify-v26.11-templates.mjs`, `scripts/verify-2642-levels.mjs`, `scripts/fixtures/v26.15-template-library.json` — 46 starters, the rhythm category and starters first, one introduced in 26.47 (intended changes of order and count).
- `scripts/release.cmd` — Runs the four new checks.
