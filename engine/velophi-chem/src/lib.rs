//! VeloPhi chemistry core (26.64, D261): species and reactions from sourced data, aqueous equilibrium, kinetics, heat,
//! phases, gases, electrochemistry, the bench session, nuclides and the reactor workshop. Like the physics core it is
//! pure Rust without clocks, threads or OS calls and uses only IEEE-754 basic operations and the deterministic
//! elementary functions of `velophi_core::dmath`, so the WebAssembly build, the native build and the Node-API test
//! module give bit-identical results. Collections that are iterated are sorted vectors or `BTreeMap`s, never hash
//! maps.
//!
//! The interface is the one of the physics core (engine/ABI.md, version 3): stateless operations through
//! `calc_call` (`api::calc`), the bench as a session (`session::BenchSession`). Operations: engine/CHEM.md.
#![forbid(unsafe_code)]
// `!(x > 0.0)` is written on purpose throughout: it is also true for NaN, which `x <= 0.0` is not
#![allow(clippy::neg_cmp_op_on_partial_ord)]
// Index loops over parallel arrays of a linear system read better than iterator chains
#![allow(clippy::needless_range_loop)]

pub mod api;
pub mod balance;
pub mod bench;
pub mod catalog;
pub mod color;
pub mod db;
pub mod echem;
pub mod equil;
pub mod gibbs;
pub mod kinetics;
pub mod mol;
pub mod nuclear;
pub mod ops;
pub mod reactor;
pub mod session;
