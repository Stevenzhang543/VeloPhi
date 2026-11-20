//! The reactor workshop (26.64, D277): two-group neutron diffusion on a grid, point kinetics with six delayed groups,
//! lumped thermal feedback, xenon and samarium. A teaching model: not for design or safety analysis.
//!
//! Boundary of the content (D278): thermal-neutron reactors in steady state and in slow transients only. Fuel is
//! natural or low-enriched uranium (the data file is refused if it offers more than 5 %); nothing is computed at or
//! beyond prompt critical.

pub mod api;
pub mod diffusion;
pub mod kinetics;
pub mod layout;
pub mod materials;
pub mod poisons;
pub mod presets;
// the state and its advance in time live in reactor/reactor.rs, as the work package names the file
#[allow(clippy::module_inception)]
pub mod reactor;
pub mod thermal;
