//! Heat (26.54, D85): the heating curve of a substance under constant power (Q = cmΔt in each phase, Q = mL at the
//! melting and boiling points; an amorphous solid softens over a range instead), and two bodies exchanging heat
//! until they reach the common temperature t = (c₁m₁t₁ + c₂m₂t₂)/(c₁m₁ + c₂m₂).

use crate::dmath::exp;

/// Thermal data of a substance (SI: J/(kg·°C), J/kg, °C).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Substance {
    pub c_solid: f64,
    pub c_liquid: f64,
    pub c_gas: f64,
    pub t_melt: f64,
    pub t_boil: f64,
    pub l_fusion: f64,
    pub l_vapour: f64,
    /// Amorphous solid: softens between these temperatures (no melting point).
    pub soften: Option<(f64, f64)>,
}

/// Water (ice, water, steam) with the textbook values.
pub const WATER: Substance = Substance { c_solid: 2.1e3, c_liquid: 4.2e3, c_gas: 2.0e3, t_melt: 0.0, t_boil: 100.0, l_fusion: 3.36e5, l_vapour: 2.26e6, soften: None };

/// One stage of a heating curve: time and temperature at both ends, the phase, and the heat taken in.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Stage {
    pub t0: f64,
    pub t1: f64,
    pub temp0: f64,
    pub temp1: f64,
    /// "solid", "melting", "liquid", "boiling", "gas", "softening".
    pub phase: &'static str,
    pub heat: f64,
}

/// Heating curve of mass m (kg) at power P (W) from temp0 to temp_end (°C); stages in order.
pub fn heating_curve(s: &Substance, m: f64, power: f64, temp0: f64, temp_end: f64) -> Vec<Stage> {
    let mut out = Vec::new();
    if !(m > 0.0 && power > 0.0) || temp_end <= temp0 {
        return out;
    }
    let mut t = 0.0;
    let mut temp = temp0;
    let mut push = |phase: &'static str, heat: f64, to: f64, t: &mut f64, temp: &mut f64| {
        let dt = heat / power;
        out.push(Stage { t0: *t, t1: *t + dt, temp0: *temp, temp1: to, phase, heat });
        *t += dt;
        *temp = to;
    };
    // pieces of constant heat capacity (or latent heat at a fixed temperature)
    match s.soften {
        Some((a, b)) => {
            // amorphous: c rises over [a, b] so that the same latent heat is spread over the range
            let c_soft = 0.5 * (s.c_solid + s.c_liquid) + s.l_fusion / (b - a);
            let marks = [(a, s.c_solid, "solid"), (b, c_soft, "softening"), (s.t_boil, s.c_liquid, "liquid")];
            for (upto, c, phase) in marks {
                if temp < upto && temp < temp_end {
                    let to = upto.min(temp_end);
                    push(phase, c * m * (to - temp), to, &mut t, &mut temp);
                }
            }
        }
        None => {
            if temp < s.t_melt {
                let to = s.t_melt.min(temp_end);
                push("solid", s.c_solid * m * (to - temp), to, &mut t, &mut temp);
            }
            if temp == s.t_melt && temp_end > s.t_melt {
                push("melting", s.l_fusion * m, s.t_melt, &mut t, &mut temp);
            }
            if temp < s.t_boil && temp >= s.t_melt && temp < temp_end {
                let to = s.t_boil.min(temp_end);
                push("liquid", s.c_liquid * m * (to - temp), to, &mut t, &mut temp);
            }
        }
    }
    if temp == s.t_boil && temp_end > s.t_boil {
        push("boiling", s.l_vapour * m, s.t_boil, &mut t, &mut temp);
    }
    if temp >= s.t_boil && temp < temp_end {
        push("gas", s.c_gas * m * (temp_end - temp), temp_end, &mut t, &mut temp);
    }
    out
}

/// Temperature at time t on a heating curve (linear within each stage).
pub fn temperature_at(stages: &[Stage], t: f64) -> Option<f64> {
    let first = stages.first()?;
    if t <= first.t0 {
        return Some(first.temp0);
    }
    for s in stages {
        if t <= s.t1 {
            let f = if s.t1 > s.t0 { (t - s.t0) / (s.t1 - s.t0) } else { 1.0 };
            return Some(s.temp0 + f * (s.temp1 - s.temp0));
        }
    }
    stages.last().map(|s| s.temp1)
}

/// Two bodies (heat capacities C₁ = c₁m₁, C₂ = c₂m₂) exchanging heat through a conductance k (W/°C):
/// T₁ − T₂ = (t₁ − t₂)·e^(−t/τ), 1/τ = k(1/C₁ + 1/C₂); the common temperature is reached for t ≫ τ.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Mix {
    pub t_eq: f64,
    pub tau: f64,
    /// Heat that has flowed from body 1 to body 2 when they are in equilibrium (J).
    pub heat: f64,
}

pub fn mix(c1: f64, m1: f64, t1: f64, c2: f64, m2: f64, t2: f64, k: f64) -> Mix {
    let (h1, h2) = (c1 * m1, c2 * m2);
    let t_eq = (h1 * t1 + h2 * t2) / (h1 + h2);
    Mix { t_eq, tau: 1.0 / (k * (1.0 / h1 + 1.0 / h2)), heat: h1 * (t1 - t_eq) }
}

/// Temperatures of both bodies at time t.
pub fn mix_at(mx: &Mix, t1: f64, t2: f64, h1: f64, h2: f64, t: f64) -> (f64, f64) {
    let d = (t1 - t2) * exp(-t / mx.tau);
    // T₁ = T_eq + d·C₂/(C₁ + C₂), T₂ = T_eq − d·C₁/(C₁ + C₂)
    (mx.t_eq + d * h2 / (h1 + h2), mx.t_eq - d * h1 / (h1 + h2))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ice_to_steam() {
        // 1 kg of ice at −10 °C to steam at 110 °C at 2100 W
        let st = heating_curve(&WATER, 1.0, 2100.0, -10.0, 110.0);
        let phases: Vec<&str> = st.iter().map(|s| s.phase).collect();
        assert_eq!(phases, ["solid", "melting", "liquid", "boiling", "gas"]);
        assert!((st[0].heat - 2.1e3 * 10.0).abs() < 1e-9 && (st[0].t1 - 10.0).abs() < 1e-12);
        assert!((st[1].heat - 3.36e5).abs() < 1e-9 && st[1].temp0 == 0.0 && st[1].temp1 == 0.0);
        assert!((st[2].heat - 4.2e5).abs() < 1e-9);
        assert!((st[3].heat - 2.26e6).abs() < 1e-6);
        let total: f64 = st.iter().map(|s| s.heat).sum();
        assert!((st.last().unwrap().t1 - total / 2100.0).abs() < 1e-9);
        assert_eq!(temperature_at(&st, 12.0), Some(0.0));
        // starting in the liquid
        let st = heating_curve(&WATER, 0.5, 1000.0, 20.0, 100.0);
        assert_eq!(st.len(), 1);
        assert!((st[0].heat - 4.2e3 * 0.5 * 80.0).abs() < 1e-9);
        // amorphous: no plateau
        let wax = Substance { soften: Some((48.0, 58.0)), t_melt: 53.0, ..WATER };
        let st = heating_curve(&wax, 1.0, 1000.0, 20.0, 80.0);
        assert!(st.iter().all(|s| s.temp1 > s.temp0));
    }

    #[test]
    fn mixing_reaches_the_weighted_mean() {
        // 0.2 kg water at 80 °C with 0.3 kg water at 20 °C: 44 °C
        let m = mix(4200.0, 0.2, 80.0, 4200.0, 0.3, 20.0, 50.0);
        assert!((m.t_eq - 44.0).abs() < 1e-12);
        // heat lost by the hot body = heat gained by the cold one
        assert!((m.heat - 4200.0 * 0.3 * 24.0).abs() < 1e-9);
        let (a, b) = mix_at(&m, 80.0, 20.0, 840.0, 1260.0, 0.0);
        assert!((a - 80.0).abs() < 1e-12 && (b - 20.0).abs() < 1e-12);
        let (a, b) = mix_at(&m, 80.0, 20.0, 840.0, 1260.0, 40.0 * m.tau);
        assert!((a - 44.0).abs() < 1e-9 && (b - 44.0).abs() < 1e-9);
        // energy at any time: C₁T₁ + C₂T₂ constant
        let (a, b) = mix_at(&m, 80.0, 20.0, 840.0, 1260.0, 0.7 * m.tau);
        assert!((840.0 * a + 1260.0 * b - (840.0 * 80.0 + 1260.0 * 20.0)).abs() < 1e-9);
    }
}
