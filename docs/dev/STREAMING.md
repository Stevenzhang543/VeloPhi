# Streaming runs: chunks, checkpoints and deterministic recompute

Decision D26 of `docs/DEV_MANUAL_26_50.md`, as implemented in the TypeScript engine (26.50). This document is the
contract for the Rust/WASM engine (D29–D31): everything marked **exact** must be reproduced bit for bit.

Source files: `src/core/solver/simulation.ts` (the run), `checkpoint.ts` (checkpoint layout), `codec.ts` (modes as
indices), `transport.ts` (deltas), `stream.ts` (receiving side, eviction, rebuild), `src/core/record/frames.ts`
(chunks, summaries), `src/core/record/fingerprint.ts` (fingerprints), `src/worker/simJob.ts` (worker job,
look-ahead), `src/app/simClient.ts` and `src/app/store.ts` (interface thread).

## 1. Overview

A run is the same step loop as in 26.49 (`SimulationRun.loop`: integrate within a mode, locate events, apply
impacts, re-determine the mode, record a frame on every grid time t_k = k·Δt). What is new:

* **Bounded and unbounded runs.** `settings.duration` is a number (bounded) or `null` (unbounded). A bounded run is
  exactly the 26.49 run: same frames, same events, same `recordingHash`, same limits. An unbounded run has no K; it
  ends when it is stopped by the user, by `settings.stopAt`, by permanent rest, or by an error.
* **Chunks.** Frames are grouped in chunks of F consecutive frames; chunk c holds frames c·F … c·F + F − 1.
* **Checkpoints.** At the start of every chunk the run serializes everything that influences the rest of the run.
  A chunk can be recomputed later from its checkpoint through the very same code path (`rebuildChunk`) and comes
  out bit for bit identical: frames, events, and the checkpoint of the next chunk.
* **Streaming.** The worker posts one delta per closed chunk (frames, checkpoint, summary, digest, segments and
  events) and pauses when it is far enough ahead of the playhead (look-ahead). The interface thread assembles a
  `StreamRecording` that keeps checkpoints, summaries, segments and events for the whole run but holds frame chunks
  under a memory budget; an evicted chunk is recomputed on demand on the interface thread with the TypeScript
  engine.
* **Fingerprints.** Bounded runs keep the 26.49 fingerprint, computed as a stream. Unbounded runs have a rolling
  fingerprint: a chain of chunk digests, available "up to t" while the run grows.

## 2. Run definition

The inputs that define a run (and therefore every frame, event, checkpoint and fingerprint) are: the scene, the
effective duration (`SimOptions.duration ?? scene.settings.duration`; `simulate()` substitutes
`scene.settings.legacyDuration` for `null`), `maxEventsPerInstant` (default 200), `fallback` (default 400 events in
0.05 s) and the chunk length (default 1 s). The wall-clock budget, progress callbacks, slicing (`advance`
deadlines) and pauses never change a result; a budget stop or a cancellation only cuts the recording short.

**Chunk length (exact).** F = max(1, round(1 / Δt)) frames (JS `Math.round`, i.e. halves round up; for positive
values identical to Rust `f64::round`). With Δt = 1/600 s, F = 600.

**K (exact).** Bounded: K = max(0, round(duration / Δt)), frames 0 … K. Unbounded: K = +∞.

## 3. The loop, checkpoints and the identity cache

Every iteration of the event-driven loop and of the Moreau–Jean loop begins with the same four checks, in this
order (exact):

1. `k == cpFrame` → take the checkpoint of chunk c = k / F (below); cpFrame += F.
2. `k >= K` → end, reason `duration`; else `k >= kStop` → end, reason `stopAt`.
3. `k >= pauseFrame` → return (paused; not part of the result).
4. Deadline check (every 4th iteration in the event-driven loop, every iteration in the Moreau–Jean loop) →
   return. Not part of the result.

The checkpoint of chunk c is therefore taken at the first loop top after the iteration that recorded frame c·F has
completed — including everything that iteration did after recording (stop-condition arming, chatter and event-storm
bookkeeping, a switch to the Moreau–Jean fallback, rebuilding the event functions and k1). When an iteration
switches to the fallback and enters the Moreau–Jean loop directly, that loop's first top is the checkpoint point.
Frame 0 is recorded in the constructor; checkpoint 0 is taken at the first loop top. A run that ends in the
constructor (K = 0) has no checkpoint.

Taking the checkpoint of chunk c (exact order):
1. if c > first chunk of this run: close chunk c − 1 (§6);
2. E_c := 0 for c = 0, otherwise the number of events created so far;
3. clear the identity cache (lastY/lastSol);
4. serialize (§4); remember stepsAtChunk := stats.steps.

**Identity cache.** The run remembers the mode solution of its last right-hand-side evaluation (`lastY` = the state
array object, `lastSol`) and reuses it in the event check when it is asked about the very same array object. This
never changes a result:
* `derivative(sys, Y, mode, out)` returns `solveMode(sys, Y, mode)` computed with `computePoses(model, Y)` — exactly
  what `eventMargin` computes when it has no cached solution (`solveMode(sys, Y, mode, computePoses(model, Y))`).
* The cache is consulted only right after a step (`eventMargin(r.X)`, and in `locateEvent` for `step(h)`, h > 0):
  on arrays that the integrator has just allocated and nobody writes before the check. A hit therefore returns the
  solution of exactly those values, in `rhsMode`, which equals `mode` at every consult (it is reset to `mode` before
  the loop continues after an event).
* Stage buffers that are reused (`dopri5Step`'s Y) are never the last evaluated array (the last evaluation of a
  Dormand–Prince step is at the fresh result X1).

So a hit and a miss give the same bits; `SimOptions.solutionCache = false` turns reuse off and
`tests/streaming.test.ts` checks that all 21 templates and the special scenes keep their fingerprints. The cache is
cleared at every checkpoint as well, so a resumed run starts in the same cache state as the original. A port may
omit the cache.

**Resuming (rebuild).** `new SimulationRun(scene, opts, { system, checkpoint })` restores the state (§4), puts frame
c·F (X, frame segment, impact loss) into its first chunk, sets segment and event index offsets (the open segment's
index, the checkpoint's event count) and sets cpFrame = c·F: the first loop top takes checkpoint c again, which must
encode to the same values. The event functions are rebuilt with `buildEventFns(sys, mode, poses(X),
solveMode(sys, X, mode), X)` (their structure depends only on the mode) and their `threshold` and `start` are
overwritten from the checkpoint. `rebuildChunk(scene, system, checkpoint, opts, endFrame)` runs a resumed run to the
loop top at `endFrame`: the next chunk start for a complete chunk (it then also holds checkpoint c + 1), the last
frame for the final chunk of an ended run. No budget applies to a rebuild.

## 4. Checkpoint layout (exact)

One Float64Array; posted or stored as little-endian IEEE-754 doubles. Integers, flags and indices are exact
doubles; +∞ is IEEE +∞. N is the state length.

| Offset | Field |
| --- | --- |
| 0 | format = 1 |
| 1 | length L (number of doubles in the record) |
| 2 | N |
| 3 | chunk index c |
| 4 | k = c·F (frame of the chunk start) |
| 5 | t (simulated time reached; equals k·Δt) |
| 6 | h (next trial step) |
| 7 | impactLoss (cumulative, J) |
| 8 | lastEventT (−1 before the first event) |
| 9 | eventsAtInstant |
| 10 | reduced: 1 when the Moreau–Jean fallback is active |
| 11 | reducedFrom (0 when not reduced) |
| 12 | kStop (+∞: no stop condition has fired) |
| 13 | eventCount (events created before the checkpoint) |
| 14 | open segment: index |
| 15 | open segment: t0 |
| 16 | open segment: impactLoss |
| 17 | open segment: reduced (0/1) |
| 18 | stats.steps (accepted steps) |
| 19 | stats.rejected |
| 20 | stats.events |
| 21 | stats.locateIterations |
| 22 | stats.ambiguousModes |
| 23 | largest position correction of the projection so far |
| 24 | largest velocity correction of the projection so far |
| 25 | frame segment: segment index recorded for frame k (differs from 14 when the fallback started right after the frame was recorded) |
| 26 … | X (N values): the state, equal to frame k |
| … | k1 (N values): f(X) in the current mode |
| … | X0 of the open segment (N values) |
| … | mode (below) |
| … | M, then M thresholds, then M starts of the event functions, in `buildEventFns` order |
| … | R, then R recent event times (event-storm window), oldest first |
| … | T, then for each variable-force switch with recent toggles, in ascending switch index: index, n, n times |

Mode: U (units), then per unit in mode order: pair (index in `system.pairs`), ref (index of the reference feature in
the pair's feature list), friction (0 none, 1 stick, 2 slide), s (slide sign), P, P point feature indices, O, O open
feature indices; then R' (ropes) and R' taut flags (0/1); then W = −1 when the mode has no switch branches, else W
and W branches. This is `encodeMode` (`codec.ts`) flattened.

In the Moreau–Jean part (reduced = 1) the fields that only the event-driven loop reads are written empty:
h = 0, lastEventT = 0, eventsAtInstant = 0, k1 = N zeros, M = 0, R = 0, T = 0. The mode is the descriptive
`stateMode` of the fallback, whose label the loop compares to open a new segment.

What a checkpoint does not contain because it does not influence later results: warnings (impact-warning
deduplication only affects the warning list), the progress counter, wall-clock data, earlier segments and events
(the open segment's label is `describeMode(mode)`).

## 5. Stop conditions and limits

Checked as part of the run definition (exact):

* **Duration.** Bounded runs end at frame K (§3, check 2).
* **stopAt** `{ on, after }`: kinds `stick` (common velocity / relative rest), `slip`, `separate` (lift-off or
  sliding off), `touch` (also matches an impact), `impact`, `slack`, `taut`. The first event whose `changes` contain
  a matching type arms the stop: `kStop = max(k, ceil((tE + after) / Δt))`, evaluated in doubles right after the
  event's frame is recorded (if the event fell on the grid), k being the current frame index. The initial impacts
  in the constructor count (tE = 0). The run ends at the loop top with k ≥ kStop. The Moreau–Jean part creates no
  change events, so a stop condition cannot fire there. A bounded run with stopAt ends at the earlier of the two.
* **Permanent rest** (unbounded runs only; never in the Moreau–Jean part). Allowed when the model has no clock entry
  (no variable-force expressions: nothing depends on time) and no static body has a belt speed ≠ 0. Criterion: in
  the accept branch, after k1 has been updated to f(X_new) (FSAL or a fresh evaluation), if this step recorded a
  frame (clipped to the grid) and **every** component of k1 is exactly zero (positions' rates = velocities,
  accelerations, friction heat, applied work, damping, belt work, per-pair slide and heat rates), the run ends with
  reason `rest`. This is conservative: f(X) = 0 makes X a fixed point of the ODE in the current mode, every event
  function keeps its value (no event can fire; the re-arming of thresholds only moves them towards zero below the
  values), and a Dormand–Prince step from X with all stages zero returns X (up to the sign of zero). Playback holds
  the final state. Scenes that come to rest only up to round-off (accelerations of 10⁻¹⁵) are not detected and keep
  computing; the bouncing ball that sticks to the floor is.
* **User stop** (`run.stop()`): ends the run at the current frame without an error (`completed`, reason `user`).
  `cancel()` ends it with the error '已取消' (reason `user`).
* **Errors** end the run with reason `error` (step size below 1e-14, a chattering variable-force switch, an internal
  error, and the limits below).

Limits (exact):

| | Bounded | Unbounded |
| --- | --- | --- |
| Accepted steps | stats.steps > 5 000 000 → error (26.49) | stats.steps − stepsAtChunk > 500 000 → error ("1 个计算块内积分步数超过 500000") |
| Wall-clock budget | `budgetMs` (checked as in 26.49) | none |
| Event storm / chatter | as 26.49 (fallback or error) | same |

Order at the end of the accept branch (exact): k1 := f(X_new) (FSAL or a fresh evaluation) → rest check →
progress callback (every 0.1 s; returning false cancels) → step limit → wall-clock budget (bounded only, every 256
steps). The Moreau–Jean loop has no step limit (four steps per frame, as in 26.49); its budget check is bounded
only.

## 6. Chunks, summaries and fingerprints (exact)

**Closing chunk c** happens at checkpoint c + 1, or at the end of the run for the last chunk (whatever its length).
The chunk then owns the events with index in [E_c, E_{c+1}), where E_{c+1} is the event count at the close (at the
end of the run for the last chunk). An event exactly at the grid time of frame (c + 1)·F belongs to chunk c if it
was handled before that frame was recorded (the frame shows its after-state), otherwise to chunk c + 1. Chunk 0 also
owns the events created in the constructor (initial impacts, the 'timestep' event of an explicit Moreau–Jean run).

**Summary** of a chunk: Float64Array(4N) = [min over the chunk's frames of component 0 … N − 1, max …, first …,
last …] (`<` and `>` comparisons, first frame's value as the start).

**Bounded fingerprint** (`recordingHash`, 26.49): SHA-256 over, in order, the states of frames 0 … frameCount − 1
(N little-endian doubles each), then for every event in order its time t (one double) and its post-event state
(N doubles). The run feeds the states of each chunk to the hasher when the chunk closes, so no whole-recording array
is ever needed.

**Rolling fingerprint** (unbounded runs; computed for every run):
* d_c = SHA-256( states of chunk c's frames, frame-major, N little-endian doubles each ‖ for each owned event in
  index order: t (double) ‖ after (N doubles) )
* H_{−1} = 32 zero bytes; H_c = SHA-256( H_{c−1} ‖ d_c ) (64 input bytes).
* "Fingerprint up to t" = lowercase hex of H_c of the last closed chunk c, with t = time of that chunk's last frame,
  (first + count − 1)·Δt. The final fingerprint of an ended unbounded run (`Recording.hash`) is hex(H_last).

Eviction never changes a fingerprint: the interface thread recomputes d_c from the received frames and events when a
chunk arrives and checks d_c and H_c against the sender's; a recomputed chunk must reproduce d_c.

## 7. Deltas (worker → interface thread)

`RecordingDelta` (`transport.ts`); typed arrays are transferred, not copied.

| Field | Content |
| --- | --- |
| fromFrame, frameCount | frames [fromFrame, frameCount) are in this delta |
| states, frameSegment, impactLoss | Float64Array((frameCount − fromFrame)·N), Int32Array, Float64Array |
| segmentsFrom, segments | segments from this index on replace the receiver's (the last one grows); t1 clipped to the delta's end time |
| eventsFrom, events | new events (pairs and features as indices, states as Float64Array) |
| checkpoints | `[{ chunk, data }]`: checkpoints taken since the previous delta (§4 layout) |
| chunks | `[ChunkInfo]`: chunks closed by this delta: chunk, first, frames, eventsFrom, eventsTo, digest (32 bytes), rolling (H_c, 32 bytes), summary (4N doubles), t |
| warnings, stats, t, T, reducedFrom | as in 26.49 (T = +∞ for an unbounded run) |

The worker posts one delta per closed chunk: its frames (the chunk's own arrays when the whole chunk goes in one
piece), the checkpoints up to the next chunk's, the segments and events that exist when the chunk closed, and the
chunk's `ChunkInfo`. When a chunk takes longer than 250 ms of wall clock, a delta with the frames computed so far
(no ChunkInfo) is posted in between; the chunk's own delta then carries the rest of its frames. The run ends with a
final delta in a 'done' message. A whole recording can still be sent as one delta from frame 0
(`encodeRecording`, no checkpoints: such a recording cannot evict).

Messages (`simJob.ts`):

* to the worker: `start { scene, budgetMs, sliceMs?, duration?, lookAhead?, playhead?, rate? }`, `playhead { t, rate }`,
  `computeTo { t }`, `lookAhead { seconds }`, `stop`, `cancel`;
* from the worker: `started { K, size, chunkFrames, duration }` (duration null = unbounded), `partial { delta, paused,
  computeMs }`, `done { delta, end: { completed, error, hash, stopReason }, computeMs }`, `error { message }`.

**Look-ahead.** A bounded run computes to its end. An unbounded run computes to the frame
`ceil(ceil(target/Δt − 1e-9)/F)·F`, target = max(playhead + max(lookAhead, 3·rate), computeTo) — a chunk boundary —
and pauses there (`advance(deadline, untilFrame)` returns at the loop top; checkpoint c of that boundary is already
taken). `playhead`, `computeTo` and `lookAhead` messages move the target and resume. Defaults: look-ahead 20 s
(settings page), rate = playback speed, 0 while paused.

## 8. Interface thread: StreamRecording

* Holds, for the whole run, every checkpoint, chunk summary, digest, segment and event; and frame chunks in memory
  under a budget (default 512 MiB, settings page). Memory = resident frame arrays + checkpoints + summaries + an
  estimate of segments and events.
* Eviction: least recently used **closed** chunks that have a checkpoint; never the open chunk. Every frame access
  marks its chunk as used.
* Frame access is synchronous. A chunk start frame is served from its checkpoint (X, frame segment, impact loss)
  without recomputing. Any other frame of an evicted chunk triggers `rebuildChunk` on this thread, and the result is
  verified before use: d_c over the recomputed frames and the stored events equals the chunk's digest; the recomputed
  events equal the stored ones (time and post-event state bits); the checkpoint taken again equals the stored one;
  the checkpoint at the next chunk start equals the stored one. A mismatch throws.
* `frameIsCheap(rec, k)` tells whether a frame can be read without recomputing; whole-run scans in the interface
  (view fitting, vector scales, energy-bar scales, trajectories, chart overviews) only read cheap frames.
* Snapshots (`snapshot()`) share the store; `final(end)` verifies the final fingerprint.
* Run statistics for the solver-information panel (`state.run` in the store): computed time, speed (simulated s per
  wall s of computing), memory bytes, chunk / resident / checkpoint counts, chunks recomputed, engine 'ts', paused,
  rolling fingerprint.

## 9. Scene format 3

`settings.duration: number | null` (null = unbounded, default for new scenes and templates; otherwise
0 < duration ≤ 3600 s), `settings.stopAt: { on, after } | null` (0 ≤ after ≤ 3600 s), `settings.legacyDuration`
(0 < legacyDuration ≤ 3600 s: the finite length used where a bounded run is required — `simulate()`, parameter
sweeps, tests — when duration is null; templates keep their 26.49 duration here). Files of format 1 and 2 keep
their numeric duration (so their fingerprints are unchanged) and get legacyDuration = duration, stopAt = null.

## 10. Notes for the Rust/WASM engine

* Reproduce §3 (check order at the loop top, checkpoint placement), §4 (layout, including the empty fields of the
  Moreau–Jean part and the toggles' ascending order), §5 (kStop formula, rest criterion and where it is evaluated,
  step limits) and §6 (event ownership, digests) exactly; tests/streaming.test.ts states the properties.
* A checkpoint taken by one engine must resume in the other: the TypeScript rebuild on the interface thread must
  reproduce chunks computed by the Rust engine in the worker (the digest check in §8 enforces it).
* `describeMode` labels are part of segments (not of fingerprints) and are compared by the Moreau–Jean loop.
* The identity cache may be omitted (§3).
