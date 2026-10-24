# Nova_A 26.47 — development plan and status

Maintainer's brief for 26.47 (23 Oct 2026), after the 26.46 video drew a large response:

1. Keep iterating as a general engine and Nova_A is unlikely to beat mainstream engines such as Godot; specialise instead and turn it into an engine for rhythm games.
2. Strengthen what a rhythm engine needs and cut what it does not. Ideas to evaluate (adopt the useful ones, then go through every area and add what is missing): cut unnecessary physics to save latency and raise the frame rate; better in-game UI building; a better level system; a master timeline and interaction system; prefab single notes (dot, box, line …) with their logic (tap, drag, slide responses); judgement systems (lines, boxes …); a 3D system (camera moves, decoration, richer play — a large change of nature).
3. None of this may be limited (for example to the existing notes only): developers create their own notes and judgement systems, and play is not limited either (movement, tap, drag, judgement).

Asked for: (1) a detailed web search; (2) weigh necessity and difficulty; (3) decide from the current features what to cut and what to add; (4) a roadmap in two to three versions plus the changes too large for three versions, each with goals, concrete requirements and simple tests and acceptance; (5) build version 26.47 from the first roadmap, with the release files.

The roadmap (research with sources, evaluation of each idea, the keep/trim/cut list, 26.47–26.49 and beyond) was written as a planning document for the maintainer; its repository version is `docs/ROADMAP_RHYTHM_ENGINE.md`. This file covers 26.47.

No Git writes: nothing is committed, staged or tagged, also not by sub-agents or release scripts. The maintainer commits by hand. File-by-file record: `docs/EDIT_LEDGER_26_47.md`.

## Plan (Roadmap 1)

| Area | Work | Checks |
|---|---|---|
| Note types (Rust) | Chart version 2: `noteTypes` with base behaviour (tap, hold, drag, flick, custom), windows, weight, combo, timeout result, hit area; per-note size; weighted score; custom notes report presses and take judgements from the game; version 1 unchanged. | `cargo test -p nova_rhythm` |
| Master timeline (Rust) | `tracks` (eased events over beats on a target and property) and `triggers` (beat, name, value) compiled with the tempo map; values per frame; triggers once per pass, reset by a seek. | `cargo test -p nova_rhythm` |
| Runtime | Note-type looks, prefab notes from a pool placed on their notes, `rhythm.touch`, script judgements, typed hit/miss signals, tracks applied to objects, the camera and post-processing with restore after a seek back, `rhythm.trigger`, picture offset, error bar, calibration suggestion. | `verify-2647-rhythm` |
| Scripts and blocks | `rhythm_judge`, `rhythm_my_note`, `rhythm_visual_offset`, `rhythm_set_visual_offset`; block “Judge my note as …”. | `nova_script` tests, `verify-2643-blocks`, `verify-v26.12-api-signatures` |
| Chart editor | Note types section, Own type tool, Timeline section (tracks, events, triggers), triggers on the grid, picture test in the calibration dialog. | `verify-2647-rhythm-editor` |
| Lean runtime | Skip solver synchronisation in scenes without physics; checksum only for replays and networking; rhythm-first Add Component and launcher; deprecated components hidden; frame bench. | `verify-2647-rhythm`, `bench-2647-rhythm-frame` |
| Starter | Rhythm Lab: original song, star prefab notes, script-judged mines, timeline and triggers. | `verify-2647-rhythm`, `verify-2647-rhythm-player`, template checks |
| Documentation | Manual chapter and lesson (EN, DE, ZH), README, roadmap, release notes, hosting guide. | `audit-manual`, `verify-v26.15-library-metadata` |

## Status

| Area | Result | Checks |
|---|---|---|
| Note types (Rust) | Done. Built-in types are indices 0–3, the chart's own follow; unknown types, duplicate ids and bad windows are reported. A note to avoid that passes untouched counts perfect; script judgements by name or by offset (outside the windows: miss); a press on a custom note is reported and not consumed. Score: 900,000 × weighted accuracy + 100,000 × longest combo over the combo notes; every 26.46 chart scores as before. | 4 new Rust tests, all 14 pass |
| Master timeline (Rust) | Done. A track is NaN before its first event (the target keeps its value); triggers are taken once and a seek starts again at the new time. | Rust tests |
| Runtime | Done. In the checks: a star 50 ms late is Good by its own windows; a pressed mine is judged a miss by a script, an untouched one perfect; a gesture judged by offset is Great; the score is exactly the weighted formula. A picture offset of 100 ms moves the drawn notes 100 ms ahead while presses keep their offsets (0, +30, −20 ms). Tracks move an object and zoom the camera; bloom reaches its value; a seek back restores the object; a pause and resume does not repeat a trigger, a seek replays it. | `verify-2647-rhythm` (8 checks) |
| Rhythm Lab | Done. Autoplay reaches 1,000,000 with 97 notes (8 stars, 8 mines); every star object hears its own judgement through `rhythm_my_note()`; triggers verse, drop, outro in order; in the drop the camera is at zoom 1.14, the prism turns and brightens; star objects are pooled (2) and hidden at the end. Exported and run in the Player: stars with their spinning cores, zoom and prism in the drop, P pauses and resumes. | `verify-2647-rhythm`, `verify-2647-rhythm-player` |
| Chart editor | Done. With real input: the lab's two types, five tracks and three triggers are listed; a new type is added and placed with the Own type tool and both are undone; a trigger is added and undone; the picture test flashes and turns 14 taps into a suggestion; Add Component lists Rhythm first and hides deprecated components until “Show all”; Play scores. | `verify-2647-rhythm-editor` |
| Lean runtime | Done. A physics-free scene skipped the solver synchronisation on every frame of the check and hashed no checksum; a replay recording hashed every step; a falling body still falls. Bench (headless, 120 Hz): physics part of a Rhythm Lanes frame 0.106 → 0.077 ms; the whole frame stays near 1 ms (Rhythm Lab 0.81 ms mean), mostly scripts. | `verify-2647-rhythm`, `bench-2647-rhythm-frame` |
| Older checks | The 26.46 renderer check uses the 12-value note stride; the catalogue checks count 46 templates and the rhythm category first (intended changes, noted in the ledger). | `verify-2646-rhythm`, `verify-template-catalog`, `verify-v26.11-templates`, `verify-2642-levels`, `verify-v26.15-library-metadata` |

## Not done in 26.47 (planned)

- Free-form judgement areas, gestures (multi-touch tracking, directional flicks, follow paths, rotation), note paths and note groups — 26.48.
- Level system, song select, rhythm UI kit, chart import, touch tuning, accessibility options — 26.48.
- Removing real-time networking and world streaming (hidden in 26.47) — 26.48; navigation and behaviour trees — 26.49.
- 2.5D, shaders, music-driven values, practice and replays, instanced drawing, rule packs — 26.49.

## Release

`scripts\release.cmd` on Windows: checks (now including `verify-2647-rhythm`, `verify-2647-rhythm-editor`, `verify-2647-rhythm-player` and `bench-2647-rhythm-frame`), editor, desktop installers and Web package, then the eleven files in `releases\v26.47`. No Git writes.

Four runs on 23 October 2026, each build checked by hand from a copy of its portable exe (`.cache/evidence-26.47/hand-checks/README.md`):

| Run | Checks | Found by hand | Fixed in the next run |
|---|---|---|---|
| 1 (18:51–19:10) | 57 passed; the frame bench failed on a Windows path (re-run alone after the fix: passed, then packaged) | Retry kept the last result on screen; the rhythm starters' feature lists were English in the Chinese interface; the Paused box covered the combo (since 26.46) | Retry clears the result in all three rhythm starters; translated lists; the box moved |
| 2 (19:28–19:43) | all passed, packaged | The moved box covered the accuracy line at the end of a chart | The box sits in the gap between combo and score |
| 3 (19:47–20:02) | all passed, packaged | Collapsing an object listed its children at the top level of the Hierarchy (older defect, visible with prefab notes during Play) | Only objects no root reaches are listed at the top level; a collapse/expand step in `verify-2647-rhythm-editor` |
| 4 (20:11–20:26) | all 58 passed, packaged | Nothing new: collapse hides children, prefab notes nested, the lab plays to 1,000,000 with the message box clear of combo and score | — |

Frame bench of the released build (Windows, the real runtime in Node, 120 Hz, mean per frame): Rhythm Lanes 0.82 ms (physics 0.063 ms, solver skipped), Rhythm Lab 0.79 ms (0.065 ms), Platformer with three rigid bodies 1.16 ms (0.302 ms); scripts are the largest part. After the last hand check only the packaging step was repeated, to put the hand-check notes into the evidence archive.
