# Nova_A 26.46

Engine 26.46.0. Project format 2 / schema 29 is unchanged; 26.38–26.45 projects open through the usual upgrade check with only the engine-version stamp updated. A project that uses the new Rhythm Chart 2D component or `.nova-chart` assets needs 26.46 or later. The plan and status for this round are in `docs/DEV_PLAN_26_46.md`; every changed file is listed with its reason in `EDIT_LEDGER.md`.

26.46 is the first round aimed at the engine's own rhythm game: about 60 % of the work is rhythm-game features, the rest is physics, effects and fixes.

## Rhythm games

- **Rhythm Chart 2D.** A new component (Add component → Audio) plays a chart in one of two styles that share one core: falling **lanes** (1–8 lanes with one key per lane, D F J K for four, as in osu!mania) or moving **judgement lines** (notes travel to lines that move, turn, change speed and fade, played with the pointer or touch, or with any letter key, as in Phigros). Note types: Tap, Hold, Drag (keep the pointer or a key on it) and Flick (a fast swipe, or a key press).
- **A Rust core.** Charts, the tempo map (tempo changes), judgement, holds, combo, score and the per-frame note positions live in a new crate, `nova_rhythm`, reached from the browser through the WebAssembly core (`WasmRhythmSession`). The TypeScript tempo map used by the editor is checked against it.
- **Timing on the audio clock.** The song is decoded whole and scheduled on the Web Audio clock (no `<audio>` element that drifts). Chart time follows the sound that is actually heard (`getOutputTimestamp`, output latency included) and is smoothed so it never steps backwards. Each key press and touch is judged by its own DOM event time stamp, not by the frame it is handled in: a press 70 ms late is judged 70 ms late at 30 or 240 frames per second. Autoplay hit sounds are scheduled ahead on the same clock.
- **Judgement and score.** Windows Perfect / Great / Good / Bad default to ±45 / 90 / 135 / 180 ms and are set on the component. The score is out of 1,000,000: 900,000 for accuracy (Perfect 1, Great 0.8, Good 0.5) and 100,000 for the longest combo. Ranks: P (all Perfect), S from 950,000, A from 900,000, B from 800,000, C from 700,000, else D. Early and late counts and the mean offset are kept for calibration screens.
- **Calibration.** The chart editor's Calibrate… plays 20 clicks; tapping along measures this device's audio delay, which is stored per device (and per browser for Web games) and applied to every chart. Scripts read and set it (`rhythm_calibration()`, `rhythm_set_calibration(ms)`). Each chart also has its own offset, and each component another one.
- **Signals.** `rhythm.started`, `rhythm.hit` (judgement, offset, lane, note kind), `rhythm.miss`, `rhythm.beat` (every beat of the tempo map) and `rhythm.finished` (score, accuracy, max combo, counts, full combo, all perfect, rank, mean offset).
- **Scripts.** 26 functions in a new `rhythm` group: `rhythm_play([seconds])`, `rhythm_pause()`, `rhythm_resume()` (the music restarts one second early so the player finds the beat; score and combo are kept), `rhythm_stop()`, `rhythm_restart()`, `rhythm_seek(seconds)` (practice: earlier notes are skipped, not missed), `rhythm_set_offset(ms)`, `rhythm_set_autoplay(on)`, `rhythm_set_speed(speed)`, and readers for time, beat, BPM, score, combo, accuracy, progress, state, last judgement, counts and all statistics at once.
- **Blocks.** The Sound category has rhythm blocks (play, pause, resume, restart, autoplay, note speed) and two conditions (the chart's state, the combo).
- **Drawing.** The chart is drawn in the scene by the renderer (Canvas 2D and WebGL2): lanes with key flashes, notes, hold bodies, judgement lines, hit effects, the judgement text with its offset, combo, score and a progress bar. In the editor's Scene view the chart shows its first notes without playing.
- **Starters.** **Rhythm Lanes** (four lanes, the original 128 BPM song “Neon Step”, 173 notes with holds) and **Rhythm Lines** (two moving judgement lines, the original 100 BPM song “Skyline Drift”, 129 notes of every kind). The songs are synthesised by the engine's own code (no samples, no third-party audio). Both starters have Pause (P, Escape), Retry (R), Autoplay (B) and a best score saved per chart.
- **Lines mode and project keys.** In lines mode every letter, digit and Space counts as a hit, except keys that the project's input actions use (so P, R and B in the starters pause, retry and toggle autoplay instead of hitting a note). Authored lane keys on the component replace this.
- **Browsers that block sound until the player clicks** show “Click or press a key to start”; that first press starts the song and is not counted as a hit.

## Chart editor

- Bottom panel → **Chart editor** (opened from the component's Edit chart). The song is drawn as a waveform beside a beat grid; snap 1/1 to 1/16 (triplets included); Play from the cursor at 0.5–1× with metronome and note clicks scheduled on the audio clock.
- Tools: 1 Select, 2 Tap, 3 Hold (drag for its length), 4 Drag, 5 Flick, 6 Erase. Right-click deletes. Select: box selection, drag to move, arrows move by a snap step or a lane, M mirrors, Ctrl+C / Ctrl+V copy to the cursor, Ctrl+Z / Ctrl+Y (200 steps), Ctrl+S saves. Wheel scrolls, Ctrl+wheel zooms, a click in the waveform jumps.
- Side panel: title, artist, charter, level, song and offset; tempo changes with **Tap BPM**; judgement lines with X, Y, rotation, alpha and speed and their eased events (32 curves, from linear and step to elastic and bounce); actions on the selection (note type, mirror, delete). The status line shows notes, length and notes per second; a chart the core cannot read (a note on a lane or line that does not exist, a hold without an end) is reported above the timeline and Test from here waits until it is fixed.
- **Test from here** starts Play at the cursor and moves the keyboard focus to the game.
- Chart files are `.nova-chart` JSON (`"format": "nova-chart"`, version 1), written with one note per line so changes compare well in Git. New charts are created in `Assets/Charts`.

## Physics and effects

- **Joint servos.** Revolute and Prismatic joints can hold a target angle (degrees) or distance with their motor: speed = gain × error, limited by a maximum speed; the joint's maximum motor force still limits the push, so a heavy arm lags and a blocked one holds instead of shaking. The target is measured like the joint's limits (the connected body relative to the body that holds the joint): put the joint on the base and connect the moving part. Inspector: Servo, Servo target, Servo gain, Servo maximum speed. Scripts: `joint_servo(target)`, `joint_servo_off()` (also switches the motor off). Block: “Turn my joint to …”.
- **Explosions.** `explode(x, y, radius, impulse)` gives every dynamic body within the radius an impulse away from the point, fading with the distance from the body's edge; the caller is left out. Block: “Explode here”.
- **Script post-processing.** `post_set(name, value[, seconds])` sets exposure, contrast, saturation, vignette, bloom or blur for the session (tweened over seconds; calling it every frame with the same value keeps the tween), `post_pulse(name, amount, seconds)` adds a fading flash (beat flashes, hits), `post_reset()` returns to the project's settings. Stop clears everything. Block: “Flash … by … for … s”. Post-processing must be enabled in the project's rendering settings.

## Fixes and cleanup

- After clicking Play, the keyboard reaches the game at once: the Play button no longer keeps the focus (before, the first key presses of a rhythm or platform game could be swallowed until the game view was clicked).
- The editor's play-session composition (`GameplayRuntime`) and the test runner moved from `src/runtime` to `src/editor`, so the runtime folder no longer holds editor code; the engine boundary audit passes with no known exceptions.
- The Tauri host checks the declared decoded size of a package entry (it was read but unused, a compiler warning).
- `post_set` tweens end exactly on their target value.

## Checks

New: `scripts/verify-2646-rhythm.mjs` (17 checks: core, tempo parity, chart round trip, songs, templates, autoplay to 1,000,000, timing judgements, holds, judgement-line touches, lines-mode keys, script control, template controller, Web Audio scheduling, clock smoothing, lane keys, renderer), `scripts/verify-2646-physics.mjs` (7 checks: revolute and prismatic servos, script servo with a weak motor, explosion falloff, post-processing tweens, pulses and reset), `scripts/verify-2646-rhythm-editor.mjs` (the built editor with real input: chart editor, placing and undoing a note, waveform, calibration dialog, Play with autoplay, both starters), `scripts/verify-2646-rhythm-player.mjs` (both starters exported and run in the independent Player: chart and song from the package, first-press start, autoplay score, pause and resume). Rust: `cargo test -p nova_rhythm`, `nova_script` tests for the new commands. All are part of `scripts\release.cmd`.

## Known limits

- Touch play works but is not yet tuned for phones and tablets (planned for a later round).
- Pointer input counts only on the game view (`[data-game-input-surface]`).
- The physics recording's rewind does not rewind music or the chart.
- Songs above 64 MB, or above 256 MB once decoded, are refused.
