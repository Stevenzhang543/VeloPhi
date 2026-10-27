# VeloPhi core — calculation operations (26.53, D67)

Every computation of the interface on the physical model, a state or a recording is one request to the Rust core:
`session_call(h, { op, … })` on a session (D66) or `calc_call({ op, … })` without one (ABI in `ABI.md`). The result
is a VRD1 container: JSON with large arrays as blob references (`f64` unless noted), decoded by `parseContainer`
(`src/engine/core.ts`). Numbers are returned unformatted; texts are messages `{ key, params }` (`MESSAGES.md`; keys
of the calculation layer are the Chinese source texts, rendered by `src/i18n/coreText.ts`). A failed request
returns 0 and the message at `last_error` (the front end throws a `MessageError`).

The front-end wrappers are in `src/engine/{session, observe, views, calc}.ts`, `src/formula/{recognize, match,
eventDetail}.ts` and `src/render/chartLod.ts`; `tests/engine/ops.test.ts` checks that every operation the front end
sends is implemented and listed here, and that every implemented operation is listed here.

Frames are indices k (t = k·Δt); "state at t" between frames is the exact state of the continuous solution of its
segment (reduced-accuracy segments interpolate). Bodies are referred to by id unless noted (`g` = global body index).

## Session operations (`velophi-core/src/api.rs`)

### Recording

| op | Parameters | Result |
| --- | --- | --- |
| `info` | — | `frameCount, dt, size, chunkFrames, t, T, duration, segments, events, reducedFrom, warnings, stats, ended, completed, error, stopReason, hash, rolling {hash, t, chunks}, memory {chunks, residentChunks, checkpoints, evictions, rebuilds, remoteRebuilds, memoryBytes, …}, closedChunks, revision` |
| `frames` | `from?, to?, stride?` | `count, states, segment (i32), impactLoss` |
| `exactStates` | `times[]` | `states` (size numbers per time) |
| `ledger` | `frames[]` | `ledger[]` — the energy ledger of each frame (`kinetic`, `gravity`, `spring`, …, `impactLoss`, `balance`) |
| `segments` | `from?` | `segments[]` — `{ index, t0, t1, label, impactLoss, reduced? }` |
| `events` | `from?` | `events[]` — `{ index, t, triggers, changes, segment, impact, at }` |
| `event` | `index` | as one entry of `events`, plus `before`, `after` (states) |
| `setBudget` | `bytes` | `memory` |
| `evict` | `chunk` | `evicted` (tests) |
| `chunkDigest` | `chunk` | `summary` (chunk summary or null), `resident` (tests) |
| `prefetch` | `chunk` | `request {chunk, checkpoint, endFrame}` for the simulation host, or null |
| `remoteFailed` | `chunk` | — (the session recomputes the chunk itself when read) |
| `branchState` | `frame` | initial conditions of a branch: `bodies[] {id, x, y, angle, vx, vy, omega}`, `ropes`, `rods`, `springs` (resolved lengths), `ledger`, `pairs[] [key, sliding distance, heat]` (pairs that slid, in system order) |

### Quantities

| op | Parameters | Result |
| --- | --- | --- |
| `quantities` | — | `quantities[]` — `{ id, label, symbol, unit, group, owner }`, `custom` (errors of custom quantities) |
| `evaluate` | `ids[]` and one of `frame`, `t`, `event` (+ `side: 'before'|'after'`) | `values` |
| `series` | `ids[]`, `from?, to?, stride?` — or `frames[]` | `t`, `values[]` (one array per id) |
| `contactForces` | `frame, on, by` | `Nx, Ny, N, fx, fy, f, vt, inContact, status` |
| `checkCustom` | `expr` | `ok, unit` or `ok: false, error` |
| `extreme` | `id, which: 'max'|'min'` | `value` |
| `stateComponent` | `id` | `component` (index into the state, −1 when derived) |
| `envelope` | `ids[], k0, k1, columns, budget?, rebuild?, level?` | long-chart level of detail (D32): `level, unit, colFirst, colLast (i32), stats {id: {min, max, first, last, state (i32)}}, pending, evicted[], dt` |

### Formulas (D70–D72)

| op | Parameters | Result |
| --- | --- | --- |
| `setLibrary` | `formulas[]` (computing fields of `src/formula/library.ts`) | `formulas` (count). Also a stateless operation; the library is global to the core. |
| `situations` | — | `situations[]` — `{ key, type, title, t0, t1, tEvent?, bodies }` (recognised incrementally while the recording grows), `passes` |
| `sample` | `key, t` | `sample { vars {name: {value, unit, symbol, label, ref?}}, measures, conditions }` — `ref`: the drawn element a variable refers to (D72) |
| `cards` | `t, trace?, moment?` | `groups[] {situation, sample, cards[], t}` — a card: `{ key, formula, situation, verdict, conditions, theory, sim, absError, relError, reason, measureLabel, measureNote?, trace? }`; `trace`: the value of every node of the formula's expression in pre-order (worked solutions) |
| `card` | `situation, formula, t` | `card` (with trace), `situation`, `sample`, `t`; `card: null` when unknown |
| `timeline` | — | `timeline[] {situation, t, cards [{formula, verdict}]}` — each situation at its event time or mid-point (D71) |
| `eventData` | `index` | `event` — the numbers of an event detail page (impact points, impulses, energies, momenta before and after) |

### Views and teaching

| op | Parameters | Result |
| --- | --- | --- |
| `modelInfo` | — | `model` (bodies with shapes and outlines, pulleys, connectors, pairs, materials), `chunkFrames, dt` |
| `frameView` | `t, exact?, forces?: 'all' | ids[] | null` | `poses` (8 per body: x, y, cos θ, sin θ, vx, vy, ω, θ), `pulleys`, `anchors`, `ropes[] {points, arcs (6 per arc), length, taut}`, `acc`, `forces[] {body (g), forces[] {x, y, fx, fy, kind, label}}`, `solveError` |
| `poses` | `times[]` or `frames[]`, `exact?` | `poses` (8 per body per instant), `bodies` |
| `positions` | `from, to, stride, cheapOnly?` | `frames`, `xy` (2 per dynamic body per frame), `n` — trails and strobes |
| `vectorScales` | `recording?` | `v, a, f` (arrow scales) |
| `emitters` | `block` | `emitters` (12 numbers each: effects at impacts and contacts), `fields, final, frames, events` |
| `fbd` | `t, body` | `fbd {body, forces[] {kind, label, sub, x, y, fx, fy}, …}` — free-body diagram (D62) |
| `tape` | `body, direction, period, every, start, intervals?` | `tape {dots[] {t, s}, lengths, velocities[] {n, t, tape, sim}, accel, …}` — ticker tape (D63) |
| `area` | `id, t0, t1` | `area {area, negative, compareId, compare, …}` — area under a curve (D64) |
| `pick` | `x, y, tol, t?` | `hit {kind, id}` or null — the object under the pointer |
| `bodyAt` | `x, y, tol, dynamicOnly?, t?` | `body` or null |
| `bodiesAt` | `x, y, t?` | `bodies[]` |
| `surfaceBelow` | `x, y, reach?, t?` | `surface {foot, n, angle}` or null — slide-along-surface dragging |
| `featurePoints` | `t?` | `points` (x, y pairs) — object snapping |

The editor queries (`pick` … `featurePoints`) use the initial state of a scene session, else the display state at t.

## Stateless operations (`velophi-core/src/calc.rs`)

| op | Parameters | Result |
| --- | --- | --- |
| `shapeOutline` | `shape` | `pieces[]`, `outline[]` (circles and convex polygons) |
| `compoundMass` | `parts[], mass` | `area, centroid, inertia` of a compound body |
| `shapeInertia` | `shape, mass` | `inertia` |
| `polygonIsSimple` | `points[]` | `simple` |
| `polygonCentroid` | `points[]` | `centroid` |
| `checkForceExpr` | `src` | `ok` or `ok: false, message` (`expr.*`) |
| `evaluateExpr` | `expr, vars {name: value}` | `value, trace` or `error` |
| `simpson` | `values[], h` | `value` (composite Simpson, 3/8 rule for an odd interval count) |
| `setLibrary` | `formulas[]` | `formulas` |
| `version` | — | `core`, `scene` |

## Lab operations (`velophi-core/src/labs`, 26.54, D76; 26.55)

Stateless operations of the lab page (also `calc_call`). Arrays of numbers come back as blob references (`$f64`).
Lengths in m, angles in rad, energies of the atomic experiments in eV, wavelengths in nm, temperatures in °C.

| op | Parameters | Result |
| --- | --- | --- |
| `fieldMap` | `charges[{x, y, q, r}], E {x, y}, k, region {x0, y0, x1, y1}, perCharge, grid, levels` | `lines {xy, starts, charge}` (field lines from the positive charges, D79), `contours {levels, segs, starts}` (equipotentials, marching squares) |
| `fieldAt` | `charges[], E, k, points[{x, y}]` | `E[{x, y}]` (V/m), `V[]` (V; zero at infinity and, for the uniform field, at the origin) |
| `circuitSolve` | `elements[{id, kind, a, b, c?, d?, E, r, R, U, P, pos, C, closed, …}]` (kinds `wire switch resistor lamp rheostat battery ammeter voltmeter capacitor`; 26.55: `inductor ac diode motor transformer fuse rcd thermistor ldr fsr galvanometer probe`, see `circuitRun`; equal node keys are connected) | `ok, issues[{kind, elements, fatal}]` (`shortIdeal conflict noSource floating meterReversed lampOver`; 26.55: `needsRun motorStalled fuseBlown rcdTripped meterOver`; diodes, fuses and RCDs switch until consistent), `nodes {key: V}`, `elements {id: {U, I, P, Iparts?, extra?}}` (U = V(a) − V(b), I from a to b; lamp: P/P_rated, capacitor: Q), `relations[{kind: series/parallel, elements}]` |
| `circuitResistance` | `elements[], a, b` | `R` (Ω, batteries taken out; null: no path) |
| `opticsImage` | `element: lens/mirror, f, u, h` | `v, m` (null at the focal point), `tip {x, y}`, `real, upright`, `rays[[{x1, y1, x2, y2, virtual}]]` |
| `opticsTrace` | `elements[{type: mirror/screen/arcMirror/lens/glass/halfDisc/disc …}], sources[{type: ray/beam/point, color?}], partial, far` | `segments` (x1 y1 x2 y2 band intensity × N; band −1 white, 0 red, 1 green, 2 blue), `interactions[{x, y, kind, nx, ny, incidence, outgoing, n1, n2}]` (kind 0 mirror, 1 refraction, 2 total reflection, 3 lens), `hits[[x, y, band, intensity]]` |
| `hydrogen` | `maxN, upper?, lower?, energy?, from?, by: photon/electron` | `levels[]` (eV), `lines[{upper, lower, energy, frequency, wavelength, series, visible}]`, `line?`, `excite? {levels, ionizes, free}` |
| `photoelectric` | `W, wavelength or frequency, power, efficiency, U?, uMin, uMax, samples` | `frequency, wavelength, photon, work, ekMax, stopVoltage, thresholdFrequency, thresholdWavelength, photonRate, saturation, emits, current`, `curve` (U, I pairs) |
| `decay` | `n0, halfLife, dt, steps, seed` | `p`, `stepOf` (decay step of each nucleus, 0: none), `counts`, `theory`, `halvings[3]` |
| `relativity` | `beta, properTime, properLength, events[{x, t}], uPrime, mass` | `beta, gamma, dilated, contracted, events[{x, t}]` (in S′), `u`, `dynamics {gamma, p, pClassical, E, E0, Ek, EkClassical}`, `curve` (β, γ pairs) |
| `heatingCurve` | `substance {cSolid, cLiquid, cGas, tMelt, tBoil, lFusion, lVapour, softFrom?, softTo?}, m, P, t0, tEnd` | `stages[{t0, t1, temp0, temp1, phase, heat}]` |
| `heatMix` | `c1, m1, t1, c2, m2, t2, k, duration?, samples` | `tEq, tau, heat`, `curve` (t, T₁, T₂ triples) |
| `circuitRun` | `elements[]` as `circuitSolve` plus `inductor {L, r}`, `ac {E (amplitude), f, phase, r}`, `diode {U (forward), r}`, `motor {R, k, J, fr (friction), load, generator, omega}`, `transformer {n1, n2, L (magnetizing), r, r2; terminals a b primary, c d secondary}`, `fuse {I}`, `rcd {I; a→b live, c→d neutral}`, `thermistor {R, beta, T}`, `ldr {R, gamma, lux}`, `fsr {R, F0, F}`, `galvanometer {r, I}`, `probe {channel}`; `t0, duration, samples, rtol` (default 10⁻¹¹), `state {id: [x, ω, s, m]}` (26.55, D89) | `ok, fatal`, `t` (samples + 1), `U, I, X, Y` (sample-major, sample k element e at k·E + e; X/Y per kind: lamp P/P_rated, capacitor Q, motor ω and state, transformer U₂ and I₂, RCD I_neutral and state, fuse state and melt fraction), `energy {id: J}` (∫U·I dt), `mech {id: J}` (motor ∫kIω dt), `stored`, `state`, `events[{t, kind, element, energy}]` (`diodeOn diodeOff motorStart motorStop motorReverse fuseBlown rcdTripped jump`), `steps, minStep, maxStep` |
| `plateCapacitor` | `S, d, er, mode: battery/isolated, U or Q, S0?, d0?, er0?` (the state before a change) | `C, Q, U, E, sigma, energy, density` and the values before (`C0, Q0, U0, E0, energy0`), `batteryWork, handWork` |
| `magnetMap` | `wires[{x, y, I, r}], magnets[{x, y, angle, length, thickness, M}], solenoids[{x, y, angle, length, thickness, turns, I, r}], B {x, y}, region, grid, lines, arrows, probes[{x, y}], loop? {x1, y1, x2, y2}` | `contours {levels, segs, starts}` (field lines = contours of A_z), `arrows` (x y Bx By × N), `probes[{Bx, By, A}]`, `forces[{x, y}]` (N/m on each wire), `flux` (Wb/m), `wires[[x, y, I]]` |
| `waveRun` | `n, length, c1, c2, split, damping, left/right {type: fixed/free/driven/absorb, amp, freq, phase, pulse}, u[], prev[]?` (without `prev`: u at rest), `t0, duration, frames` | `dt, dx, stepsPerFrame, frames` (frames × n), `t[]`, `u[], prev[]` (state for the next request), `energy` |
| `doppler` | `f, c, vs, vo, t, max` | `ahead, behind` (observed frequencies; null at or above the wave speed), `mach`, `fronts[]` (centre x, radius pairs) |
| `sound` | `f, amp, rho, v` | `note` (0 = C … 11 = B), `octave, cents, intensity` (W/m²), `level` (dB), `wavelength, period` |
| `waveOptics` | `setup: single/double/grating/film/polarizer, lambda` (nm), `white, a, d, N, L, half, samples`; film `n0, n1, n2, t0, t1, t` (nm); polarizer `input?, angles[]` | slits: `x, I, rgb, maxima[[m, x]], minima[[m, x]], spacing, centralWidth, color`; film: `t, R, rgb, Rat`; polarizer: `I[]` |
| `quantumSetup` | `potential {kind: free/barrier/step/well/harmonic/double/box/points, V0, c, w, gap, omega, points}, x0, x1, n, states` (units ħ = mₑ = 1, nm) | `units {length, energy (eV), time (s)}`, `x, V, dx, energies[], states` (states × n) |
| `quantumRun` | `potential, x0, x1, n, re[]/im[] or packet {x0, sigma, k0}` (box: `cre[], cim[]` coefficients of the eigenstates), `t0, duration, frames, dt?, absorb, split?` | `prob, re, im` (frames × n), `expect[{t, norm, x, dx, p, dp, energy, left, right}]`, `absorbed, dt, steps`, `theoryT` (barrier) |
| `barrierT` | `V0, w, E[]` | `T[]` (plane-wave transmission) |
| `gasProcess` | `n, gamma, p, V, kind: isothermal/isobaric/isochoric/adiabatic, target` (V, or T for isochoric), `samples` | `kind, from {p, V, T}, to, W, Q, dU, curve[]` (V, p pairs) |
| `gasCycle` | `kind: carnot/otto/rectangle, n, gamma` and `Th, Tc, V1, V2` / `T1, V1, r, T3` / `p1, p2, V1, V2`, `samples` | `processes[]` (as `gasProcess`), `Qin, Qout, W, efficiency, theory` |
| `decayChain` | `halfLives[]` (0: stable), `n0[], tEnd, samples, t?` | `t, N, A` (members × samples), `lambda[], at[]` |
| `binding` | `nuclides[{Z, A}]` | `measured[{Z, A, symbol, B, BA}]` (AME2020), `semf[[A, Z, B/A]]`, `nuclides[{Z, A, symbol, B, BA, measured, massExcess, mass}]` |
| `reaction` | `before[], after[]` of `{kind: nuclide/n/e-/e+/gamma/nu, Z, A}` | `valid, A[2], Z[2], balanced, Q` (MeV), `estimated` |
| `compton` | `lambda` (pm), `theta` | `lambda2, shift, compton` (pm), `E1, E2, Ek` (MeV), `phi`, `curve` (θ, Δλ pairs) |
