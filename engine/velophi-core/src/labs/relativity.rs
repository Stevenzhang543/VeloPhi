//! Special relativity (26.54, D84): the Lorentz factor, time dilation and length contraction, the Lorentz
//! transformation of events, the addition of velocities, and relativistic momentum and energy. Velocities are
//! fractions β of c; events are (x, t) with x in light-seconds, so c = 1 in the transformation.

/// Speed of light (m/s).
pub const C: f64 = 299792458.0;

/// γ = 1/√(1 − β²) (|β| < 1).
pub fn gamma(beta: f64) -> f64 {
    1.0 / (1.0 - beta * beta).sqrt()
}

/// Event (x, t) of frame S seen from S′ moving at β along +x: x′ = γ(x − βt), t′ = γ(t − βx).
pub fn lorentz(beta: f64, x: f64, t: f64) -> (f64, f64) {
    let g = gamma(beta);
    (g * (x - beta * t), g * (t - beta * x))
}

/// Velocity in S of an object moving at u′ in S′ (S′ moves at v relative to S): u = (u′ + v)/(1 + u′v).
pub fn add_velocity(u_prime: f64, v: f64) -> f64 {
    (u_prime + v) / (1.0 + u_prime * v)
}

/// Momentum and energies of a mass m (kg) moving at β.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Dynamics {
    pub gamma: f64,
    /// p = γmv (kg·m/s), classical mv.
    pub p: f64,
    pub p_classical: f64,
    /// E = γmc², E₀ = mc², Ek = (γ − 1)mc² and the classical ½mv² (J).
    pub e: f64,
    pub e0: f64,
    pub ek: f64,
    pub ek_classical: f64,
}

pub fn dynamics(m: f64, beta: f64) -> Dynamics {
    let g = gamma(beta);
    let v = beta * C;
    let e0 = m * C * C;
    // γ − 1 = β²/(s(1 + s)), s = √(1 − β²), without cancellation at small speeds
    let s = (1.0 - beta * beta).sqrt();
    let g1 = beta * beta / (s * (1.0 + s));
    Dynamics { gamma: g, p: g * m * v, p_classical: m * v, e: g * e0, e0, ek: g1 * e0, ek_classical: 0.5 * m * v * v }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn textbook_values() {
        assert!((gamma(0.6) - 1.25).abs() < 1e-15 && (gamma(0.8) - 5.0 / 3.0).abs() < 1e-14);
        // interval invariance and inverse transformation
        let (x, t) = (3.0, 5.0);
        let (xp, tp) = lorentz(0.6, x, t);
        assert!(((t * t - x * x) - (tp * tp - xp * xp)).abs() < 1e-12);
        let (xb, tb) = lorentz(-0.6, xp, tp);
        assert!((xb - x).abs() < 1e-12 && (tb - t).abs() < 1e-12);
        // simultaneity: events at t = 0 at different x are not simultaneous in S′
        assert!(lorentz(0.5, 1.0, 0.0).1 < 0.0);
        assert!((add_velocity(0.5, 0.5) - 0.8).abs() < 1e-15 && (add_velocity(1.0, 0.7) - 1.0).abs() < 1e-15);
        let d = dynamics(1.0, 0.6);
        assert!(((d.e * d.e) - (d.p * C) * (d.p * C) - d.e0 * d.e0).abs() < 1e-12 * d.e * d.e);
        let d = dynamics(1.0, 1e-4);
        assert!((d.ek / d.ek_classical - 1.0 - 0.75e-8).abs() < 1e-14, "Ek ≈ ½mv²(1 + ¾β²)");
    }
}
