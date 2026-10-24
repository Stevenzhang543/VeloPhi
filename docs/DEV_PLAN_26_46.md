# Nova_A 26.46 — development plan and status

Maintainer's brief for 26.46 (22 Oct 2026), with the choices made when asked:

1. Fix, check or correct the shortcomings found in earlier rounds that were not changed or not found yet.
2. Keep upgrading the backend algorithms and add better physics.
3. Keep upgrading features; tutorials and developer documentation may be used as references.
4. The engine is meant to make a rhythm game: build rhythm-game features and optimise for them.

Choices: rhythm work is the main part of the round (about 60 %); both play styles — moving judgement lines (Phigros-like) and falling lanes (osu!mania-like) — share one core; the engine gets its own chart format and a chart editor inside the editor; Windows desktop and the browser come first, touch tuning later. Before the round, a promotional video of under one minute (introduction and a joke “shareholder” call, real editor footage) was made for 26.45; it is not part of the repository (`releases/promo/`).

No Git writes: nothing is committed, staged, tagged or pushed, also not by sub-agents or release scripts. The maintainer commits by hand. File-by-file record: `docs/EDIT_LEDGER_26_46.md`.

## Plan

| Area | Work | Checks |
|---|---|---|
| Rhythm core (Rust) | New crate `nova_rhythm`: chart model and parser (`.nova-chart` JSON v1), tempo map with tempo changes, eased judgement-line events (x, y, rotation, alpha, speed), judgement of tap, hold, drag and flick by time and position, combo and score, per-frame note geometry for both styles, autoplay. Exposed as `WasmRhythmSession`. | `cargo test -p nova_rhythm` |
| Timing | Song decoded whole and scheduled on the Web Audio clock; chart time from the heard output (`getOutputTimestamp`, latency) with smoothing; input judged by DOM event time stamps; scheduled autoplay hit sounds; device calibration. | `verify-2646-rhythm` |
| Runtime and drawing | `RhythmChart2D` component, runtime owner (load, play, pause, seek, restart, autoplay, speed, signals), frames drawn by the scene renderer, HUD, preview in the Scene view. | `verify-2646-rhythm`, browser check |
| Scripts and blocks | `rhythm_*` functions and blocks; the Rhai signature inventory and API documentation regenerated. | `verify-2643-blocks`, `verify-v26.12-api-signatures` |
| Chart editor | Bottom-panel editor: waveform, beat grid and snap, tools, undo, tempo with tap BPM, judgement lines and events, metronome and note clicks, test from here, calibration. | `verify-2646-rhythm-editor` (built editor, real input) |
| Starters | Rhythm Lanes and Rhythm Lines with original synthesised songs, tuned charts, controller script (pause, retry, autoplay, best score), previews, guides and manual sections. | `verify-v26.11-templates`, `verify-v26.15-library-metadata`, `verify-2642-levels` |
| Physics | Joint servos (revolute and prismatic hold a target with their motor), explosions with falloff. | `verify-2646-physics` |
| Effects | Script post-processing values (set with tween, pulse, reset) on top of presets and volumes. | `verify-2646-physics` |
| Leftovers | Editor code in `src/runtime` (the last M1 gap); keyboard focus after Play; Tauri warning about an unused field; script post-processing (listed as not done in 26.45). | `audit-engine-boundaries`, browser check |

## Status

| Area | Result | Checks |
|---|---|---|
| Rhythm core (Rust) | Done. 100,000 notes and 256 judgement lines at most; holds break when let go early; drags need a contact on the note; flicks need a pointer faster than the flick speed (or a key press); the earliest pending note wins a press, the nearest among simultaneous notes. Scores to exactly 1,000,000 in autoplay. | `cargo test` (rhythm and script tests), `verify-2646-rhythm` |
| Timing | Done. With a mock Web Audio clock the song starts within 3 ms of the schedule and chart time follows the heard output; presses 70 ms late are judged 70 ms late independent of the frame; the clock smoother never steps back and snaps after seeks. | `verify-2646-rhythm` |
| Runtime and drawing | Done. Both starters play in the built editor; notes fall, judgement lines move, turn and fade; autoplay reaches the full score. HUD placement checked on screenshots (lanes and lines). | `verify-2646-rhythm`, `verify-2646-rhythm-editor`, `verify-2646-rhythm-player` (exported games in the Player), screenshots in `release-audits/v26.46-rhythm-*` |
| Scripts and blocks | Done: 26 rhythm functions, 6 action blocks and 2 conditions; post, servo and explosion functions and blocks; API documentation regenerated (236 documented symbols). | `verify-2643-blocks`, `verify-v26.12-api-signatures` |
| Chart editor | Done; a real-input browser run places and undoes a note, draws the waveform, opens the calibration dialog and plays the chart. | `verify-2646-rhythm-editor` |
| Starters | Done: “Neon Step” (128 BPM, 29 bars, 173 notes) and “Skyline Drift” (100 BPM, 24 bars, 129 notes, two lines with events); best score saved per chart; previews from real captures. | template checks |
| Physics | Done: a servo holds a 2-unit arm at 60.0° against gravity (error < 0.02°), a script retargets −30° → 90°, a 2 N·m motor cannot lift the arm, a prismatic servo reaches 2.5 units; `explode` pushes near bodies harder than far ones and leaves bodies outside the radius and the caller alone. The servo first measured the joint the other way round from the solver's motor and limits, which drove the arm away from its target; found by the check and fixed (the servo now uses the solver's sense). | `verify-2646-physics` |
| Effects | Done: tween, pulse, clamp, reset; values applied through the rendering policy and cleared by Stop; repeated `post_set` calls keep the running tween. | `verify-2646-physics` |
| Leftovers | Done: `GameplayRuntime.ts` and `testRunner.ts` moved to `src/editor` (the boundary audit has no known gaps left); Play no longer keeps the keyboard focus (found by the browser check: the first keys after Play went to the button); Tauri checks the declared decoded size; `joint_servo_off()` also switches the motor off; lines-mode keys leave the keys of input actions free (found while writing the manual: R in the Rhythm Lines starter hit notes as well as retrying). Found in the hand check of the first release build and fixed before the final run: resuming a paused chart sought back one second, and a seek resets the judgements, so score and combo started again from zero; resume now moves only the clock back (notes judged before the pause stay judged and are not clicked again by autoplay). | `audit-engine-boundaries`, `verify-2646-rhythm` |

## Not done in 26.46

- Touch play is supported but not tuned for phones and tablets (large hit areas, multi-touch stress, mobile audio latency); planned with the mobile round.
- The physics recording's rewind does not cover music or the chart; audio already played is not rewound either.
- Prefab overrides inside lists (polygon points, gradients) are still recorded as the whole list.
- A song-select scene, chart difficulty sets and online leaderboards belong to the game, not to the engine, and are left to the rhythm game itself.

## Release

`scripts\release.cmd` on Windows: checks (now including `verify-2646-rhythm`, `verify-2646-physics`, `verify-2646-rhythm-editor` and `verify-2646-rhythm-player`), editor, desktop installers and Web package, then the eleven files in `releases\v26.46`. No Git writes.

Run 1 (22 Oct, 19:35–19:51) passed every check and was packaged. The hand check of its exe found the resume defect described above; after the fix everything was built and checked again. Run 2 (20:00–20:14) passed all 54 checks; its packaging stopped because the first build's exe was still running from the release folder, so that file was moved aside and only the packaging step was repeated. Hand checks of both builds: `hand-checks/` in the evidence archive.

## Cleanup after the release

At the maintainer's request (22 Oct): old files with no further use were deleted; code, build inputs, current documentation and reusable caches were kept. Tracked deletions (old version records and staging journals, an exported game committed by mistake, 98 re-stamped reference-project copies, unused scripts, fixtures and source modules) are listed in the edit ledger. Untracked: stale build output and incremental compilation caches, installers of 26.1–26.45 left in the Tauri bundle folders, old evidence, audit screenshots and round launchers; the dependency caches (`node_modules`, `.pnpm-store`, the Cargo `target` folders and the managed Tauri cache) and the releases stay. Checked afterwards: `vue-tsc`, the build, the repository and engine audits, the template, library, API, blocks, rhythm and physics checks and `cargo test --workspace`.
