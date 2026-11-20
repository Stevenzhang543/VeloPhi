//! Fission-product poisons (26.64, D277): iodine-135 → xenon-135 and promethium-149 → samarium-149 in the fuel.
//!
//!   dI/dt  = γ_I·F − λ_I·I
//!   dX/dt  = γ_X·F + λ_I·I − λ_X·X − σ_X·φ·X
//!   dP/dt  = γ_P·F − λ_P·P
//!   dS/dt  = λ_P·P − σ_S·φ·S
//!
//! F is the fission rate per volume of fuel cell and φ the thermal flux in the fuel. Concentrations are in
//! 10²⁴ cm⁻³ = 1/(barn·cm), so that σ[barn]·X is a macroscopic cross-section in 1/cm; F is then in 10²⁴ cm⁻³ s⁻¹ and
//! φ in 10²⁴ cm⁻² s⁻¹ (the products σφ are 1/s either way). The feedback on the reactivity is the absorption
//! σ_X·X + σ_S·S added to the thermal absorption of the fuel cells (`materials.rs`).

use super::materials::PoisonData;

/// Concentrations in 1/(barn·cm).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Poisons {
    pub iodine: f64,
    pub xenon: f64,
    pub promethium: f64,
    pub samarium: f64,
}

impl PoisonData {
    /// Time derivatives for the fission rate `f` (10²⁴ cm⁻³ s⁻¹) and the thermal flux `phi` (10²⁴ cm⁻² s⁻¹).
    pub fn rates(&self, p: &Poisons, f: f64, phi: f64) -> Poisons {
        Poisons {
            iodine: self.gamma_i * f - self.lambda_i * p.iodine,
            xenon: self.gamma_xe * f + self.lambda_i * p.iodine - self.lambda_xe * p.xenon - self.sigma_xe * phi * p.xenon,
            promethium: self.gamma_pm * f - self.lambda_pm * p.promethium,
            samarium: self.lambda_pm * p.promethium - self.sigma_sm * phi * p.samarium,
        }
    }

    /// The concentrations in equilibrium with a steady fission rate and flux. Without flux, samarium has no
    /// equilibrium (it is stable and only burns in a flux): it is given as 0 then.
    pub fn equilibrium(&self, f: f64, phi: f64) -> Poisons {
        Poisons {
            iodine: self.gamma_i * f / self.lambda_i,
            xenon: (self.gamma_i + self.gamma_xe) * f / (self.lambda_xe + self.sigma_xe * phi),
            promethium: self.gamma_pm * f / self.lambda_pm,
            samarium: if phi > 0.0 { self.gamma_pm * f / (self.sigma_sm * phi) } else { 0.0 },
        }
    }
}
