//! VeloPhi physics core: a port of the TypeScript solver of `src/core` that gives bit-identical results
//! (decisions D29–D31 of docs/DEV_MANUAL_26_50.md). Pure Rust, no clocks, threads or OS calls, so the same
//! code runs natively (parity harness, `velophi-cli`) and as WebAssembly (`velophi-wasm`).
//!
//! Module map (TypeScript → Rust) and the porting rules are in `engine/PORTING.md`.
#![forbid(unsafe_code)]

pub mod api;
pub mod calc;
pub mod checkpoint;
pub mod constants;
pub mod dmath;
pub mod driver;
pub mod dynamics;
pub mod events;
pub mod expr;
pub mod formula;
pub mod impact;
pub mod integrators;
pub mod js;
pub mod kinematics;
pub mod labs;
pub mod linalg;
pub mod lod;
pub mod message;
pub mod model;
pub mod modelcalc;
pub mod particles;
pub mod modes;
pub mod moreau;
pub mod numeric;
pub mod observe;
pub mod project;
pub mod record;
pub mod regions;
pub mod scene;
pub mod session;
pub mod sha256;
pub mod simulation;
pub mod teaching;
pub mod transport;
pub mod views;
