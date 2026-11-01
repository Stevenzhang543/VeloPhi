# VeloΦ (VeloPhi) 26.58

**English** · [简体中文](README.zh-CN.md) · [Deutsch](README.de.md)

VeloΦ is a 2D physics simulation and teaching engine for students, teachers and anyone curious about physics. You build a scene — blocks, balls, inclines, ropes, springs, charges, circuits, lenses — press play, and read every quantity at any moment. Recognised textbook situations show their formulas with conditions and substituted values **next to** the simulated result, with the error in plain view.

> Everything on the screen comes from the numerical solver; formulas are only compared, and errors are shown. That is what we mean by *physically verifiable*.

![The studio: an incline with friction, forces drawn on the canvas, formulas compared with the simulation](assets/readme/studio.jpg)

- **Repository:** <https://github.com/Stevenzhang543/VeloPhi>
- **Downloads:** <https://github.com/Stevenzhang543/VeloPhi/releases> (Windows portable / installer, web build)
- **Languages:** 简体中文 · English · Deutsch (Settings › General › Language; follows the system by default)

## Highlights

- **An exact solver for teaching.** Event-driven integration (Dormand–Prince 5(4) with error control, or symplectic Gauss–Legendre); contact, friction, impacts and rope states change at events located to about 10⁻¹² s; constraint forces are solved exactly from the acceleration equations; an energy ledger closes to 10⁻⁸.
- **A many-body solver (new in 26.58).** Stacks, piles, dominoes and Galton boards with hundreds of bodies, computed with a soft-step solver re-implemented after the algorithms published with Box2D v3 and Rapier — and a **solver comparison** that shows how far it is from the exact solver.
- **Formulas that are checked, not asserted.** About 180 model families with conditions in four states, independent references and step-by-step derivations; formulas are graded by curriculum level (Chinese curriculum or IB).
- **Labs.** DC and AC circuits, electric and magnetic fields, lenses and ray optics, wave optics, waves and sound, 1D quantum mechanics, gases and heat engines, radioactive decay and nuclear reactions, special relativity.
- **Teaching tools.** Predictions with confidence, tasks from pasted problem text, teaching packages, learning activities, free-body diagrams, ticker tapes, problem sets, reports and courseware export.
- **Reproducible.** Deterministic maths: the same scene gives the same SHA-256 fingerprint in the desktop app, in the browser and in Node; checkpoints rebuild evicted frames bit for bit.
- **Open and offline.** One portable `.exe` or a static web build; no account, no server, no plug-ins.

## What is new in 26.58

| Area | Change |
| --- | --- |
| Engine | New integrator **Real-time many-body (Soft Step)**: sort-and-sweep broad phase, contact manifolds with feature ids and warm starting, sub-stepping with soft contacts and joints, speculative contacts against tunnelling, Poisson-capped restitution, rolling resistance, conveyor belts, sleeping islands; deterministic and checkpointed (native = WebAssembly, bit for bit). 78 boxes: **16 ms** for 3 s instead of 7.4 s with Moreau–Jean. |
| Templates | *Pyramid of boxes*, *Galton board* (with the bin histogram and the binomial expectation under the board), *Dominoes*, *Balls poured into a box* — a new gallery group “Many bodies and statistics”. |
| Analysis | **Solver comparison**: the exact and the many-body solver on the same scene, largest position and energy differences with their sources. A badge next to *Recompute* always shows which solver is in use. |
| Teaching | **Welcome page and 60-second tour**; **confidence** on predictions (“sure but far off” is flagged as a possible misconception); **measured data import** (CSV) laid over the curves with the RMS deviation. |
| Accessibility | **Colour-vision-friendly palette** for vectors, charges and curves (Okabe–Ito for curves, Paul Tol and IBM colour-blind-safe colours for vectors; checked under simulated protanopia, deuteranopia and tritanopia); curves also differ by line style. |
| Physics | Rigid-body scenes use the CODATA 2022 Coulomb constant (files keep the value they store). |

## Download and run

| File | What it is |
| --- | --- |
| `VeloPhi-v26.58-windows-x64-portable.exe` | Portable desktop app: double-click, nothing is installed. |
| `VeloPhi-v26.58-windows-x64-setup.exe` | Installer for the same app (start menu entry, uninstaller). |
| `VeloPhi-v26.58-web.zip` | Static web build: unzip and serve the folder with any static web server (it needs WebAssembly, so it does not run from `file://`), e.g. `npx serve dist` or `python -m http.server`. |
| `VeloPhi-v26.58-source.zip` | Source code of this release. |
| `VeloPhi-v26.58-release-evidence.zip` | Logs and test reports of the release build. |

Requirements: Windows 10 or 11 (x64) with Microsoft Edge WebView2 (already part of current Windows), or any current desktop browser for the web build. Check a download against `SHA256SUMS.txt`: `certutil -hashfile <file> SHA256`.

## Ten-minute tutorial

1. **First start.** The welcome page offers three ways in: *Teach a lesson* (projection mode and the template gallery), *Practise* (the learning path) and *Experiment* (an empty scene or the many-body sandbox). *60-second tour* lights up the five parts of the studio one by one. You can come back later through the cap icon in the top bar or Ctrl+K → “Welcome and tour”.

   ![Welcome page with three ways in](assets/readme/welcome.jpg)

2. **Open a template.** Click **Templates**, choose a classic model (e.g. *Inclines and friction › Incline: static and kinetic friction*), change its parameters and click **Create scene**. Space plays and pauses, ← → step frame by frame; diamonds on the timeline are events (impacts, sticking, start of sliding) — click one to see what happened and why.
3. **Read the physics.** The right panel *Analysis › Formula* lists the situations of the run; each formula shows the theoretical value, the simulated value and the error. Hover a formula to see the bodies, forces and angles it refers to on the canvas. *Monitor* reads every quantity of the selected body at this moment; *Details* opens derivations and worked solutions.
4. **Build your own scene.** Pick a tool on the left (block, ball, incline, rope, spring, hinge, motor …), click on the canvas to place it, drag to size it. Editing is continuous and snaps only near other bodies (hold Alt to switch snapping off). Every change recomputes automatically.
5. **Predict first.** *Analysis › Predict* lets students write down a value and how sure they are before the run; after the run each prediction is compared with the simulation and the formula. A confident prediction that is far off is marked as a possible misconception.
6. **Solve a problem.** Paste a problem text into the *Task* tab: the givens, the targets and the conditions are read out, missing information is asked for, and the result card states the body, the frame of reference, the time, the conditions and independent checks. *Watch the demonstration* opens a matching scene.
7. **Labs.** The *Lab* page (Alt+2) has circuits that run in time, field lines, lenses, spectra, decay, quantum wells and more, each with readouts and substituted formulas.
8. **Many bodies.** Open *Many bodies and statistics › Galton board*: 120 balls fall through ten rows of pegs; under the board the counts per bin are drawn with the binomial expectation. Any scene can switch to *Real-time many-body* in *Scene › Calculation* (sub-steps, step rate, sleeping). *Solver comparison…* runs the exact and the many-body solver side by side.

   ![Galton board: counts per bin and the binomial distribution](assets/readme/galton.jpg)

   ![Solver comparison: exact versus many-body](assets/readme/compare.jpg)

9. **Compare with your own measurements.** In the chart panel, *Measured data…* reads a CSV file (`t (s), x (cm)` …), lets you map each column to a quantity and its unit, and draws the points over the simulated curve with the RMS deviation.
10. **Share results.** *Export* exports CSV (with a run manifest), video, a lab report (HTML/PDF) and courseware (video, screenshots, formula cards, derivations, optional PPTX).

![The lab page: a DC circuit with readouts](assets/readme/lab.jpg)

**Shortcuts:** Space play/pause · ←/→ frame (Shift ×10) · Ctrl+Z / Ctrl+Y undo/redo · Ctrl+S save · Ctrl+O open · Ctrl+Enter recompute · Alt+1/2/3/4 studio / lab / monitor / settings · Ctrl+K search everything. The full list is under *Settings › Shortcuts*.

## Physics and solvers

| Solver | When to use | Accuracy |
| --- | --- | --- |
| Exact (Dormand–Prince 5(4), default) | Teaching scenes with a few bodies | Error-controlled (relative 10⁻¹⁰), events to ~10⁻¹² s, energy ledger ≤ 10⁻⁸ |
| Gauss–Legendre (symplectic) | Long conservative runs (orbits, pendulums) | Energy stays bounded over long times |
| Moreau–Jean | Fallback when events get too dense | Reduced: events not located, marked in the interface |
| Real-time many-body (Soft Step) | Stacks, piles, dominoes, Galton boards; hundreds of bodies | First order in the sub-step, soft contacts (millimetre overlaps), marked in the interface |

Everything is computed in a Rust core: natively in the desktop app and as WebAssembly in the browser — with bit-identical results. The 26.52 TypeScript engine is kept as a test reference, and every computation is compared with it bit for bit where it applies.

## Build from source

Requirements: Node.js 20+, Rust 1.90+ (with the `wasm32-unknown-unknown` target for the web core), and for the desktop app the Tauri prerequisites on Windows (WebView2, MSVC build tools).

```bash
npm ci
npm run dev                  # development server at http://localhost:5178
npx vitest run               # all automated tests
npm run typecheck            # vue-tsc
npm run build                # type check + web build → dist/
scripts\build-engine.cmd     # Rust core → src\engine\velophi_core.wasm (Windows)
node scripts/build-napi.mjs  # Rust core as a Node-API module for the tests (no wasm32 target needed)
npx tauri build              # Windows desktop app
scripts\release.cmd          # full release on Windows: engine tests, WebAssembly, tests, Tauri, self-check, packaging
```

Engine checks: `cargo test --release --workspace` in `engine/`, `node scripts/parity.mjs` (TypeScript reference vs native Rust, frames, events and checkpoints bit for bit), `node scripts/calc-parity.mjs` (every calculation operation), `node scripts/check-browser-hashes.cjs --worker` (fingerprints in Chromium).

## Project structure

| Path | Content |
| --- | --- |
| `engine/velophi-core` | Rust core: scene model, exact solver, many-body solver (`src/world`), events, observations, formulas, labs, sessions |
| `engine/velophi-wasm`, `velophi-native`, `velophi-cli`, `velophi-napi` | WebAssembly interface, native desktop engine, command-line runner, Node-API test module |
| `src/app` | Vue 3 interface (pages, panels, dialogs, editor) |
| `src/render` | Canvas rendering (bodies, forces, fields, histograms, effects) |
| `src/templates`, `src/content`, `src/teaching`, `src/task` | Templates, model registry and teaching packages, activities and problems, the task layer |
| `src/i18n` | Interface texts in three languages |
| `src-tauri` | Desktop shell (Tauri 2) |
| `tests`, `scripts` | Automated tests (with the TypeScript reference engine) and build / check scripts |

Development manuals, reports and release notes are kept outside the repository; each release contains its release notes.

## Acknowledgements and references

- The many-body solver follows the algorithms published by Erin Catto for [Box2D v3](https://box2d.org/) ([Solver2D](https://box2d.org/posts/2024/02/solver2d/), MIT) and by Dimforge for [Rapier](https://rapier.rs/) (Apache-2.0); the code is VeloΦ’s own.
- Design ideas for teaching with simulations from [PhET Interactive Simulations](https://phet.colorado.edu/) research (implicit scaffolding).
- Colour-vision palettes after Okabe & Ito ([Color Universal Design](https://jfly.uni-koeln.de/color/)), [Paul Tol](https://personal.sron.nl/~pault/) and the IBM Design Library colour-blind-safe palette; checked with the CVD simulation of Machado, Oliveira & Fernandes (2009).
- Built with [Rust](https://www.rust-lang.org/), [Vue](https://vuejs.org/), [Vite](https://vitejs.dev/), [Tauri](https://tauri.app/) and [uPlot](https://github.com/leeoniya/uPlot); third-party licences are listed in `THIRD_PARTY_NOTICES.md` of each release.

## Licence

The licence of this repository is chosen by the maintainer; third-party components keep their own licences (see `docs/THIRD_PARTY_NOTICES.md`).
