# VeloPhi core — WebAssembly ABI (version 1)

`velophi-wasm` exports a raw C ABI (no wasm-bindgen, no imports). The JavaScript side is `src/engine/wasm.ts`; the
worker job that drives it is `src/worker/wasmJob.ts`. Decisions: manual 26.50, D29 (interface) and D30 (bit parity).

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
| `abi_version() -> u32` | 1. The loader refuses other versions. |
| `scene_version() -> u32` | Newest scene file format the engine reads (4 since 26.51). The loader refuses an engine that reads an older format (and one without this export), and runs the TypeScript engine instead. |
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

## Result containers ("VRD1")

```text
"VRD1" | u32 LE: JSON length n | JSON (UTF-8, n bytes) | padding to a multiple of 8 | blob
```

In the JSON every typed array is a reference into the blob — `{"$f64": [byteOffset, length]}`, `{"$i32": …}`,
`{"$u8": …}` (offsets relative to the blob start, 8-byte aligned) — and every non-finite number is
`{"$num": "Infinity" | "-Infinity" | "NaN"}`. A delta decodes to exactly the `RecordingDelta` of
`src/core/solver/transport.ts` (the parity harness compares them field by field); `stats.wallMs` is 0 (the worker
fills it in); chunk infos carry `digestHex`/`rollingHex` in addition.

## Call sequences

Bounded run (the worker, `wasmJob.ts`):

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

Chunk rebuild: the main thread normally rebuilds evicted chunks with the TypeScript engine from the checkpoints the
Rust engine streamed (bit-identical; every rebuilt chunk is checked against its digest). `run_rebuild_chunk` exists
for parity tests and for a future WASM rebuild on the main thread.

## Building

Windows: `scripts\build-engine.cmd` (`cargo build -p velophi-wasm --release --target wasm32-unknown-unknown`,
copies `src\engine\velophi_core.wasm`, writes its SHA-256 to `src\engine\velophi_core.wasm.sha256`). The release
script runs it and the tests check the hash file.
