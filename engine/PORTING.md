# Porting notes: TypeScript solver → Rust core

The Rust core (`verity-core`) is a line-by-line port of `src/core` and gives **bit-identical** results
(manual 26.50, D29–D31). From 26.51 on, new physics is written in Rust only; the TypeScript solver stays as the
test oracle and as the fallback when WebAssembly is unavailable.

## Module map

| TypeScript (`src/core`) | Rust (`verity-core/src`) |
| --- | --- |
| `math/dmath.ts` (fdlibm port) | `dmath.rs` |
| `math/linalg.ts`, `math/vec.ts` | `linalg.rs` (vectors inline) |
| `scene/types.ts`, `io.ts`, `build.ts` | `scene.rs` (serde types, formats 1–3, validation) |
| `solver/model.ts` | `model.rs` |
| `solver/kinematics.ts` | `kinematics.rs` |
| `solver/dynamics.ts` | `dynamics.rs` |
| `solver/modes.ts` | `modes.rs` |
| `solver/events.ts` | `events.rs` |
| `solver/impact.ts` | `impact.rs` |
| `solver/integrators.ts` | `integrators.rs` |
| `solver/project.ts` | `project.rs` |
| `solver/moreau.ts` | `moreau.rs` |
| `solver/forceExpr.ts` + `formula/expr.ts` (parser, dimensions) | `expr.rs` |
| `solver/simulation.ts` (driver, streaming, stop/rest) | `simulation.rs` |
| `solver/checkpoint.ts`, `codec.ts` | `checkpoint.rs` |
| `solver/transport.ts` (worker deltas) | `transport.rs` (VRD1 containers, `ABI.md`) |
| `record/sha256.ts`, `fingerprint.ts`, `frames.ts` | `sha256.rs`, `record.rs` |
| (messages) `src/i18n/message.ts` | `message.rs` (`MESSAGES.md`) |
| — | `js.rs`: JavaScript number semantics |

## Parity rules as applied (D30)

1. Transcendentals only through `dmath.rs` (same algorithms as dmath.ts). No `f64::sin/cos/exp/ln/powf/atan2/hypot`;
   no `mul_add` (Rust never fuses on its own). `sqrt`, `abs`, `+ − × ÷` are IEEE-exact in both languages.
2. `js.rs`: `js_min`/`js_max` (NaN and −0 like `Math.min/max`), `js_round` (halves towards +∞), `js_sign`.
   `Math.floor/ceil/trunc` map to the f64 methods (identical).
3. Containers with JavaScript iteration order: `Map`/`Set` (insertion order) → `Vec` or insertion-ordered lists;
   `BTreeMap` only where TS sorts keys. `Array.prototype.sort()` (UTF-16 order, stable) → `sort_by` with the same
   comparator; ids are ASCII so byte order equals UTF-16 order.
4. Same evaluation order: sums, products and loops follow the TS source line by line (`a*b*c` grouping, `x/2` vs
   `0.5*x`). Clippy lints that would reorder floating-point operations are allowed locally with a reason.
5. NaN stops a run with an error and never enters a fingerprint. Message parameters may hold NaN; the parity
   harness compares NaN parameters by value, not by bits.
6. No SIMD, no threads, no clocks: the engine is a pure function of the scene, and the worker measures wall time.

Strings that feed logic are ported exactly: `describeMode` labels decide segmentation in the Moreau–Jean loop.
Negative zero in scenes is written as the string `"-0"` by the loader (`sceneJson`) and read back as −0.

## Gotchas found while porting

- Identity caches (`lastY/lastSol` in TS) are an optimisation only; the checkpoint clears them, and a test runs every
  template with the cache off.
- `Number.prototype.toFixed/toPrecision` only appear in texts, which are now messages with numeric parameters.
- JSON numbers: serde_json with `float_roundtrip` writes the shortest round-trip form; JavaScript reads it back
  exactly. Non-finite numbers are wrapped (`{"$num": …}` in containers, strings in messages).
- Event ownership at chunk boundaries, the check order at the loop top, the `kStop` formula of `stopAt` and the rest
  criterion must match `docs/dev/STREAMING.md` exactly; the TypeScript side verifies every Rust chunk against its
  digest, so a divergence throws instead of showing wrong frames.

## Checking

```text
node scripts/parity.mjs [--random N] [--seed S]   TS vs native Rust: modules, 21 templates (bounded and 60 s
                                                  unbounded), golden/special scenes, N random scenes; frames,
                                                  events, messages, checkpoints, rebuilds, deltas — bit for bit
node scripts/parity.mjs --bench 7                 TS vs native Rust speed (14 original templates)
node scripts/bench-engine.mjs                     TS vs WebAssembly speed in Node
npx vitest run tests/engine.test.ts               WebAssembly through the worker job vs TypeScript
node scripts/check-browser-hashes.cjs --worker    Chromium: WASM worker, TS worker, main thread, fallback
cargo test --release; cargo clippy --all-targets -- -D warnings; cargo fmt --check
```

Results at release 26.50: 500 random scenes + templates + golden/special scenes, 0 mismatches; native Rust
≈ 11× and WebAssembly ≈ 3.8× faster than TypeScript on the 14 original templates (Node).
