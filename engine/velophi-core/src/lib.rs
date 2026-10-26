//! VeloPhi physics core: a port of the TypeScript solver of `src/core` that gives bit-identical results
//! (decisions D29–D31 of docs/DEV_MANUAL_26_50.md). Pure Rust, no clocks, threads or OS calls, so the same
//! code runs natively (parity harness, `velophi-cli`) and as WebAssembly (`velophi-wasm`).
//!
//! Module map (TypeScript → Rust) and the porting rules are in `engine/PORTING.md`.
#![forbid(unsafe_code)]

pub mod checkpoint;
pub mod dmath;
pub mod dynamics;
pub mod events;
pub mod expr;
pub mod impact;
pub mod integrators;
pub mod js;
pub mod kinematics;
pub mod linalg;
pub mod message;
pub mod model;
pub mod modes;
pub mod moreau;
pub mod project;
pub mod record;
pub mod scene;
pub mod sha256;
pub mod simulation;
pub mod transport;
