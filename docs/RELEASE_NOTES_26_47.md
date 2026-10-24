# Nova_A 26.47

Engine 26.47.0. Project format 2 / schema 29 is unchanged; 26.38–26.46 projects open through the usual upgrade check with only the engine-version stamp updated. Charts from 26.46 open and score exactly as before. A chart that uses the new note types, note sizes or data, tracks or triggers is saved as chart version 2, which 26.46 cannot read. The plan and status for this round are in `docs/DEV_PLAN_26_47.md`, the plan for the next rounds in `docs/ROADMAP_RHYTHM_ENGINE.md`; every changed file is listed with its reason in `EDIT_LEDGER.md`.

26.47 is the first round of Nova_A as a rhythm-game engine: the built-in notes and the two play styles stay, and what a note is, how it is judged and what moves with the music is now the game's.

## The chart's own note types

- **Note types** (chart `noteTypes`). Each has an id and a name; a base behaviour — Tap, Hold, Drag, Flick, or **Script judged**; its own judgement windows (else the component's); a **score weight** (0: not scored); whether it counts for the combo; what an untouched note becomes when its window has passed (Miss, or **Perfect** for notes to avoid); a hit area (width along the lane or line, height across it); and a look: a shape (bar, circle, diamond, square, ring or none) with a colour and size, or a **prefab**, plus its own hit sound and hit effect. A note names its type; the four built-in names stay valid. Notes can also have a `size` and any `data`.
- **Score** stays out of 1,000,000: 900,000 for accuracy weighted by the note types' weights and 100,000 for the longest combo over the notes that count for it. Every 26.46 chart scores as before.
- **Prefab notes.** For each visible note of a type with a prefab, the chart places an instance of the prefab on the note every frame (turned with its judgement line) and reuses the instances (a pool, at most 256 at once). A script on the prefab reads its note with `rhythm_my_note()` (id, type, beat, time, lane, line, x, data) and receives `rhythm.note_hit` / `rhythm.note_miss`; the object stays where it was judged for a fifth of a second before it goes back to the pool.
- **Script-judged notes.** A press inside the window and hit area of such a note sends `rhythm.touch` (note, type, offset, position, lane, line, data) to the chart's object (and to the note's prefab object); scripts judge with `rhythm_judge(note, "perfect" … "miss")`, or with an offset in milliseconds that the type's windows classify. Script judgements count like any other. A note no script judges is missed (or perfect for a note to avoid) when its window has passed. Autoplay judges custom notes perfect on time and leaves notes to avoid silent.
- `rhythm.hit` and `rhythm.miss` now carry the note's type, its world position, line and data; `rhythm.hit` has `avoided` for notes to avoid that passed untouched.

## The master timeline

- **Tracks** (chart `tracks`) animate a scene object (by name: x, y, rotation, scaleX, scaleY, scale, alpha), the camera (x, y, zoom, rotation) or post-processing (exposure, contrast, saturation, vignette, bloom, blur) with eased events over beats (the same 32 curves as the judgement lines). The values come from the Rust core at the chart's time. Before its first event a track leaves the target alone; after a seek back the target gets its own value again. Post-processing tracks need post-processing turned on in the rendering settings.
- **Triggers** (chart `triggers`: beat, name, value) send `rhythm.trigger` (name, value, beat) to every object, once per pass: pausing and resuming does not repeat one, a seek or a restart plays them again from the new time.
- A track whose object does not exist is reported once and skipped.

## Chart editor

- **Note types** section: add, rename (notes follow), set the behaviour, windows, weight, combo, untouched result, hit area, shape, colour, size, effect, prefab and hit sound; the number of notes using a type; remove (its notes become taps).
- The **Own type** tool (7) places the type chosen next to the tools; the selection's type list includes the chart's own types. Own types are drawn in their colour with their initial; script-judged types as diamonds.
- **Timeline** section: tracks with their target (scene objects by name, Camera, Post-processing), property and events; triggers with beat, name and value. Track events are drawn as bars beside the field and triggers as flags across the grid.

## Timing

- **Picture offset.** Screens show frames late. The new per-device picture offset draws notes, lines and the timeline that much earlier; judgement is not affected. The calibration dialog has a **picture test** (tap along with flashes, no sound): the difference to the audio calibration is suggested as the picture offset. Scripts: `rhythm_visual_offset()`, `rhythm_set_visual_offset(ms)`.
- **Hit error bar** (component option, Display): the windows as bands under the judgement line with a fading tick for each recent hit.
- After a played chart with at least 20 timed hits (not autoplay), `rhythm.finished` has `suggestedCalibrationMs`: the device calibration plus the mean offset of the hits.

## A leaner runtime and rhythm-first lists

- A scene without rigid bodies, tile collision or joints skips the solver's synchronisation and pose read-back every fixed step; fixed steps, timers and scripts run as before. In the frame bench (headless, 120 Hz, mock audio) the physics part of a Rhythm Lanes frame fell from about 0.106 ms to 0.077 ms; the whole frame stays near 1 ms and is dominated by scripts. Audio output and the screen are the larger delays, which is what the picture offset addresses.
- The solver state checksum is computed only while a replay records or plays back, or a network session runs (it was hashed on every fixed step).
- **Add Component** lists Rhythm first, then Core, 2D, Audio, UI, Camera and Script; the classic groups follow under “More”. Components planned for removal in the roadmap (World Chunk 2D, Portal 2D, the navigation components, Behavior Tree 2D) are listed only when searched for or with “Also show components to be removed”.
- The **Project Manager** has a Rhythm games category; the rhythm starters and the latency, audio, UI, rendering, particle and lighting labs come first, the other 35 templates are marked Classic and listed after them.

## New starter: Rhythm Lab

“Prism Pulse” (120 BPM, E minor, original, synthesised by the engine's own code), a four-lane chart with 97 notes: eight gold **stars** (a prefab of a glow and a spinning six-pointed star, double score), eight red **mines** (script judged by the lab's controller: a press is a miss and a camera shake; untouched they count perfect), and a drop in which the camera zooms, the backdrop prism turns and pulses on every bar and bloom rises; triggers mark verse, drop and outro. The chart shows the error bar. Pause (P, Escape), Retry (R), Autoplay (B), best score saved.

## Fixes from the release check

- Retry (R) in the rhythm starters (Rhythm Lanes, Rhythm Lines, Rhythm Lab) clears the last result line; before, the result of the finished run stayed on screen while the new one played.
- In lanes charts the Paused and start messages sit between the combo and the score instead of covering the combo.
- The rhythm starters' feature lists in the Project Manager are translated into German and Chinese.
- Collapsing an object in the Hierarchy hides its children; they were also listed at the top level (for objects created during Play, such as prefab notes, as well).

## Scripts and blocks

- New functions: `rhythm_judge(note, judgement_or_offset_ms)`, `rhythm_my_note()`, `rhythm_visual_offset()`, `rhythm_set_visual_offset(ms)`.
- New block (Sound): “Judge my note as …” for prefab notes.

## Checks

New: `scripts/verify-2647-rhythm.mjs` (8 checks: version 2 charts in Rust and TypeScript; per-type windows, weights, script judgement, notes to avoid; picture offset and error bar; tracks, camera, post-processing, restore after seek, triggers once per pass; the Rhythm Lab to 1,000,000 with prefab stars, mines, timeline and triggers; renderer shapes; physics skipping and checksums; rhythm-first lists), `scripts/verify-2647-rhythm-editor.mjs` (the built editor with real input: the lab's types, tracks and triggers; a new type placed with the Own type tool and undone; a trigger; the picture test; Add Component; Play), `scripts/verify-2647-rhythm-player.mjs` (the lab exported and played in the Player: stars with their cores, camera zoom and prism in the drop, pause and resume), `scripts/bench-2647-rhythm-frame.mjs` (frame bench). Rust: `cargo test -p nova_rhythm` (4 new tests), a new `nova_script` test. All run in `scripts\release.cmd`.

## Known limits

- Judgement areas are still the lanes and the judgement lines; free-form areas, gestures and note paths are planned for 26.48.
- A track finds its object by name (the first object with that name).
- At most 256 prefab note objects at once; one per visible note.
- Touch play is supported but not yet tuned for phones and tablets.
- The physics recording's rewind does not rewind music or the chart.
