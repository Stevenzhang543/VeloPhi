# VeloPhi core — WebAssembly ABI (version 2)

`velophi-wasm` exports a raw C ABI (no wasm-bindgen, no imports). The JavaScript side is `src/engine/core.ts`
(`CoreBackend`); the simulation job that drives runs is `src/worker/simJob.ts`; sessions are `src/engine/session.ts`.
Decisions: manual 26.50, D29 (interface) and D30 (bit parity); manual 26.53, D66 (sessions), D67 (calculation
interface), D68 (native desktop engine). Version 2 keeps every run export of version 1 and adds sessions and
stateless calculations; the operations of `session_call` and `calc_call` are listed in `CALC.md`.

The same functions exist natively: `engine/velophi-napi` (Node-API module for the tests, outside the workspace) and
the Tauri commands of `src-tauri` (D68) call the same `velophi-core` code, so all three give bit-identical results.

## Conventions

- Handles are `u32`; 0 means "none" / error.
- Input bytes: the caller allocates with `alloc(len)`, copies the bytes into linear memory, passes `(ptr, len)` and
  frees with `dealloc(ptr, len)` after the call.
- Output bytes: functions that return bytes take `(out_ptr, out_len)` and return an `i32`:
  `n > 0` — n bytes written; `-n` — the buffer is too small, n bytes are needed, nothing was consumed (call again with
  a larger buffer); `0` — nothing to return.
- Errors are message JSON `{ "key": …, "params": { … } }` (keys in `MESSAGES.md`), read with `last_error`.
  Non-finite numbers in message parameters are the strings `"Infinity"`, `"-Infinity"`, `"NaN"`.
- Any call may grow linear memory: re-create typed-array views of `memory.buffer` after every call.

## Exports

| Function | Description |
| --- | --- |
| `abi_version() -> u32` | 2. The loader refuses other versions (there is no TypeScript engine to fall back to since 26.53: the application reports the failure). |
| `scene_version() -> u32` | Newest scene file format the engine reads (4 since 26.51, 6 since 26.54, 7 since 26.55). |
| `alloc(len) -> ptr`, `dealloc(ptr, len)` | Linear-memory buffers for the caller. |
| `last_error(out_ptr, out_len) -> i32` | Message JSON of the last failed call. |
| `run_create(ptr, len) -> handle` | Create a run from JSON: a scene document, or `{ scene, duration?, chunkSeconds?, maxEventsPerInstant?, fallback? }`. `duration`: number (bounded) or `null` (unbounded); absent: the scene's. Negative zero is written as the string `"-0"`. 0 on error. |
| `run_info(h, out…) -> i32` | `{ K, size, chunkFrames, duration, dt, loadWarnings, abi }`; `K` and `duration` are `null` when unbounded. |
| `run_set_until(h, frame: f64)` | Pause at the top of the loop once frame `frame` is recorded (`+∞`: never). Pausing never changes results. |
| `run_advance(h, budget_steps: u32) -> i32` | Run at most `budget_steps` loop iterations: 0 budget used, 1 paused at the until frame, 2 finished, −1 unknown handle. |
| `run_time(h) -> f64`, `run_frame_count(h) -> f64` | Simulated time reached; frames recorded. |
| `run_request_tail(h)` | The next `run_take_delta` also returns the open chunk's frames (a tail delta). |
| `run_take_delta(h, out…) -> i32` | Next delta container: one per closed chunk, then a tail delta when requested or when the run has ended. 0 when there is nothing new. |
| `run_end(h, out…) -> i32` | `{ completed, error, hash, stopReason }` of a finished run; 0 while it runs. `stopReason`: `duration`, `stopAt`, `rest`, `restApprox` (26.51), `pulley` (26.51), `user`, `error`. |
| `run_stop(h)` | End the run here without an error (user stop of an unbounded run). Deltas with the rest follow. |
| `run_cancel(h)` | End with `err.cancelled`. |
| `run_fail_budget(h, budget_ms: f64)` | End a bounded run with `err.budget { seconds, t }` (the engine has no clock; the worker measures wall time). |
| `run_rebuild_chunk(h, cp_ptr, cp_len, end_frame: f64) -> i32` | Recompute a chunk from a checkpoint (little-endian f64 array, layout in `docs/dev/STREAMING.md`) through the same code path up to the loop top at `end_frame`. Returns the size of the result container (take it with `run_take_output`), 0 on error. |
| `run_take_output(h, out…) -> i32` | The result of the last `run_rebuild_chunk`: `{ chunk: { index, first, count, states, segment, impactLoss }, events, next, again, error }`. |
| `run_free(h)` | Free a run (its slot is reused). |
| `run_output(h) -> ptr` | Pointer to the result of the last `run_rebuild_chunk` (version 2; its size is the return value of that call). |
| **Sessions (version 2, D66)** | |
| `session_create(ptr, len) -> handle` | `{ scene, chunkFrames?, duration?, budgetBytes?, maxEventsPerInstant?, fallback? }` — the run's `started` information. Without `chunkFrames` and deltas it is a *scene session* (the editor: initial poses, outlines, picking). 0 on error. |
| `session_simulate(ptr, len) -> handle` | A whole run into a new session, synchronously: `{ scene, duration?, until?, chunkSeconds?, budgetBytes?, maxSteps? }` (branches, handbook examples, sweeps on the web, tests). An unbounded scene runs for its legacy duration unless `duration` or `until` is given. 0 on error. |
| `session_apply(h, ptr, len) -> i32` | Apply one delta container exactly as the run produced it (the bytes are not decoded in JavaScript). Closed chunks are checked against their digest and the rolling fingerprint. 1 ok, 0 error. |
| `session_finish(h, ptr, len) -> i32` | End the recording with the run's `{ completed, error, hash, stopReason }`; the fingerprint is recomputed from the data and must equal `hash`. 1 ok, 0 error. |
| `session_call(h, ptr, len) -> i32` | One operation `{ op, … }` (`CALC.md`). Returns the size of the result container, read at `session_output(h)`; 0 on error. |
| `session_output(h) -> ptr` | Pointer to the last result container of the session. |
| `session_frame_count(h) -> f64` | Frames recorded. |
| `session_state(h, k: f64, out: *mut f64) -> i32` | State of frame k written to `out` (`size` numbers); an evicted chunk is recomputed first. 1 ok, 0 error. |
| `session_cheap(h, k) -> i32` | 1 when frame k is in memory (reading it recomputes nothing). |
| `session_segment(h, k) -> i32`, `session_impact_loss(h, k) -> f64` | Segment index and cumulative impact loss of frame k. |
| `session_install(h, chunk, ptr, len) -> i32` | Install a chunk recomputed by the simulation host (the `run_rebuild_chunk` container); checked like a delta. 1 ok, 0 error. |
| `session_free(h)` | Free a session. |
| **Stateless calculations (version 2, D67)** | |
| `calc_call(ptr, len) -> i32` | One operation `{ op, … }` without a session (`CALC.md`); the size of the result, read at `calc_output()`; 0 on error. |
| `calc_output() -> ptr` | Pointer to the last `calc_call` result. |

## Result containers ("VRD1")

```text
"VRD1" | u32 LE: JSON length n | JSON (UTF-8, n bytes) | padding to a multiple of 8 | blob
```

In the JSON every typed array is a reference into the blob — `{"$f64": [byteOffset, length]}`, `{"$i32": …}`,
`{"$u8": …}` (offsets relative to the blob start, 8-byte aligned) — and every non-finite number is
`{"$num": "Infinity" | "-Infinity" | "NaN"}`. A delta decodes to exactly the `RecordingDelta` of the TypeScript
reference (`tests/reference/core/solver/transport.ts`; the parity harness compares them field by field);
`stats.wallMs` is 0 (the host fills it in); chunk infos carry `digestHex`/`rollingHex` in addition. Session and
calculation results use the same container: large arrays are blob references, everything else JSON
(`parseContainer` in `src/engine/core.ts`).

## Call sequences

Bounded run (the job, `simJob.ts`, in the simulation worker or on the interface thread):

```text
h = run_create({ scene, duration: T })        → post 'started' from run_info
loop: run_advance(h, n) until 2 (finished), measuring wall time; n sized to ~5 ms per call;
      after each slice: run_take_delta (with run_request_tail every 250 ms) → post 'partial'
      wall budget exceeded → run_fail_budget(h, budgetMs)
finished: last delta + run_end → post 'done'; run_free(h)
```

Unbounded run with look-ahead: as above with `duration: null`; before every slice
`run_set_until(h, ceil(target / Δt / F) · F)` where target = max(playhead + max(lookAhead, 3 s × rate), computeTo);
status 1 (paused) waits for the next 'playhead'/'computeTo' message. `run_stop` ends it (user stop).

Interface thread: `session_create` with the `started` information, then `session_apply` for every delta and
`session_finish` with the end state; all reads go through `session_call` / `session_state`. An evicted chunk is
recomputed in the session when it is read (the same code path, bit-identical). To avoid that pause the session's
`prefetch` operation names the work, the simulation host recomputes it (`run_rebuild_chunk` in the rebuild worker, or
the native `engine_rebuild` command) and the page hands the result to `session_install`.

Desktop (D68): the Tauri commands `engine_run_start` / `engine_run_control` / `engine_rebuild` / `engine_sweep` /
`engine_info` run the same loop in native threads and send every delta container as raw bytes through a Tauri
channel; the page passes them to `session_apply` unchanged. Message framing on the channel: `u32` LE header length,
JSON header (`{ type, … }` as the job's messages), then the delta bytes.

## Building

Windows: `scripts\build-engine.cmd` (`cargo build -p velophi-wasm --release --target wasm32-unknown-unknown`,
copies `src\engine\velophi_core.wasm`, writes its SHA-256 to `src\engine\velophi_core.wasm.sha256`). The release
script runs it and the tests check the hash file.
