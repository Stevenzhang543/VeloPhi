# Nova_A rhythm-engine roadmap (26.47–26.49)

Decided on 23 October 2026 after the 26.46 video: Nova_A stops competing as a general 2D engine and becomes an engine for rhythm games. The full discussion (research with sources, an evaluation of each idea, the keep/trim/cut list) is in the maintainer's planning document; this file is the version kept with the code.

## Direction

- **An open rhythm engine.** The engine owns the clock, input timing, judgement, scoring, charts and the chart editor. What a note looks like, how it is judged and what the game is made of belong to the game. The built-in falling lanes and judgement lines are presets built on the same mechanisms a developer uses, without privileges.
- **Three principles.** (1) Data and scripts, nothing hard-wired: note types, windows, looks, judgement areas and the show are chart data, behaviour is scripts or blocks. (2) The audio clock is the only time source: input is judged by its own event time, so the frame rate changes how smooth the picture is, not how accurate the judgement is. (3) Hide first, delete later: features a rhythm game does not need are hidden (and cost nothing when unused) for one version before their code is removed, and old projects keep their data.

## Keep, make optional, cut

| Group | Contents | Plan |
|---|---|---|
| Keep | Rendering (sprites, shapes, text, particles, lights, post-processing), cameras; audio and mixer, Rhythm Chart 2D, chart editor; all UI controls; scripts and blocks; animator, rigs, timeline player; prefabs, pools, spawners, lifetimes, state machines; input map, saves, export (desktop and Web), debugger and profiler | Keep investing |
| Optional | Rigid-body physics, colliders, joints, ropes, areas and effectors (physical effects, mini-games); character and action-game components; tile maps | 26.47: listed under “More” in rhythm-first lists; skipped when a scene has none |
| Cut | Real-time networking (replication, prediction, authority, Network Studio, Networking Lab) | Hidden in 26.47, removed in 26.48 (online features of a rhythm game are leaderboards and chart sharing over HTTP) |
| Cut | World streaming (world chunks, portals, world production panel, Tile World starter) | Hidden in 26.47, removed in 26.48 |
| Cut | Navigation and behaviour trees | Hidden in 26.47, removed in 26.49 |
| Change | Solver state checksum on every fixed step | Only while a replay records or plays back, or a network session runs (26.47) |

Projects that use removed components keep that data, read-only, with a notice; a project that needs them can stay on 26.46.

## 26.47 — Open notes and the master timeline

Goal: developers are no longer limited to four built-in notes. They define note types (look, judgement, score, sound — even a prefab as the note, or their own script deciding the judgement), and the chart's master timeline moves the scene, the camera and post-processing on the beat. Costs a rhythm game does not need are removed, and the picture delay is calibrated separately.

1. Chart format version 2 (version 1 charts read unchanged): note types with a base behaviour (tap, hold, drag, flick, or custom: judged by scripts), windows, score weight, combo, what an untouched note becomes, hit area, shape and colour, prefab, hit sound and effect; per-note size and data.
2. Custom notes report presses (`rhythm.touch`); scripts judge with `rhythm_judge`; judgements of every kind enter the same statistics. Hit and miss signals name the type, position and data.
3. Master timeline: tracks on scene objects, the camera or post-processing with the 32 easings, evaluated in the Rust core; triggers (`rhythm.trigger`) that fire once per pass.
4. Chart editor: note types, the Own type tool, tracks and triggers.
5. Picture offset separate from the audio offset; picture test in the calibration dialog; hit error bar; a calibration suggestion after a chart.
6. Lean runtime: no solver synchronisation in scenes without physics, checksum only when used; rhythm-first Add Component and launcher; deprecated components hidden.
7. Rhythm Lab starter; script functions and a block; EN/DE/ZH interface and manual.

Tests: Rust unit tests; runtime checks in the real GameplayRuntime; the built editor with real input; the exported game in the Player; a frame bench; all in the release script. Acceptance by hand: the Rhythm Lab plays (stars, mines, timeline); a new note type is placed and judged by its own rules; a track and a trigger stay on the beat after pause and seek; the picture offset moves the notes but not the judgement; the 26.46 starters still score 1,000,000 in autoplay; old projects open unchanged.

## 26.48 — Free play and levels

Goal: play is not tied to lanes or lines. Judgement areas can be any shape, any number, on any object; input has more gestures. A complete rhythm game's levels, song select and screens are provided; the first cut features are removed.

1. Judgement area component: line, box, circle, ring, polygon; on any object, moved by the timeline; notes bind to an area by name and may come from any direction. Lanes and lines become presets; old charts score the same.
2. Gestures: independent multi-touch, directional flicks with an angle tolerance, hold-and-follow along a curve, rotation input (wheel, stick, gyroscope); per-type accepted inputs.
3. Note paths and groups: notes along curves, per-note speed changes, fake notes, appear and vanish times; note groups animated as a whole by the timeline.
4. Levels: songs → difficulty charts → unlock rules; best score and rank per difficulty saved; preview clips; song packs; a song-select starter.
5. Rhythm UI kit: song select, results (with timing distribution), pause and settings (calibration, volume, scroll speed, keys) as prefabs; UI bound to score and combo without scripts; UI animation on the beat.
6. Chart editor: multi-track timeline view, easing curve editor, BPM and offset detection, batch edits, difficulty comparison.
7. Import: osu!mania (.osu) and RPE charts.
8. Touch and accessibility: large hit areas, multi-touch stress tests, mobile latency measurement, output-latency display with a Bluetooth hint, low-latency drawing option; colour-blind palettes, flash limits, large HUD, player key remapping.
9. Remove real-time networking and world streaming.

Acceptance by hand: a ring-shaped judgement area with notes flying in from all sides; a judgement box moved by the timeline still judges correctly; play a hard chart from a song-select scene and find the best score kept; an imported osu!mania chart plays; two simultaneous holds on a phone; an old project with a networking component opens with a notice and keeps its data.

## 26.49 — 2.5D and expression

Goal: closer to commercial rhythm games in look and feel: perspective and depth, custom shaders, a show that follows the music, practice and replays, many notes at once; a whole way of playing packed as a shareable rule pack.

1. 2.5D: Z depth and rotation around X and Y; a perspective camera; judgement areas and notes in perspective space (slanted lanes, tunnels) with hit tests on the projected positions; camera moves on the timeline; perspective preview in the editor. No models, 3D lights or 3D physics.
2. Shaders per note type and per object (a safe subset); full-screen shader effects switched on the beat.
3. Music-driven values (volume envelope, spectrum) as timeline sources.
4. Practice and replays: section loops, 0.5–1.5× speed with the pitch kept, replays of input, timing-distribution results, a tutorial mode that waits for the player.
5. Performance: instanced note drawing; 2,000 visible notes at 60 fps on a mid-range PC; per-stage rhythm timings in the profiler.
6. Rule packs: note types, judgement areas, scripts and looks packed and installed with the package manager; charts name the rule pack they need.
7. MIDI keyboards and pads as input. Remove navigation and behaviour trees.

Acceptance by hand: a slanted four-lane highway judges correctly; the camera circles the scene on the timeline; the chorus loops at 0.75× without a pitch change; a recorded replay reproduces every judgement; a 2,000-note stress chart stays smooth; the Rhythm Lab's way of playing installs as a rule pack in a new project.

## Beyond these versions

| Project | Contents | First | Why it is large |
|---|---|---|---|
| Full 3D | glTF models, materials and lights, 3D physics, a 3D editor view | The 2.5D renderer of 26.49 | Renderer, editor and scene format change; the engine changes nature |
| Native low-latency audio | Bypassing browser audio on desktop (Windows low-latency APIs) and Android | An audio scheduling layer; real devices to measure | One implementation per platform, measured on real hardware |
| Mobile apps and stores | Android and iOS builds, signing, review, touch performance | The touch work of 26.48 | Developer accounts, devices and review |
| Online platform | Accounts, leaderboards, chart sharing, replay-verified scores, moderation | Replays (26.49) | Servers and long-term operation |
| Frame-accurate video backgrounds | Music videos in sync with the chart | A public audio-clock interface | Decoding, buffering and seeking differ per platform |
| Collaborative charting | Several people editing one chart | The online platform | Synchronisation and conflicts |

Suggested order: native audio and mobile apps first (feel and reach), then the online platform; full 3D only if 2.5D proves too little.
