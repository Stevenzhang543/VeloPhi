//! Physical constants as versioned sets (26.56, D100).
//!
//! A constant carries its value in SI, its unit (a unit of `expr::UNITS`), its standard uncertainty (0 for exact
//! values) and whether it is exact by definition. Two sets exist: CODATA 2018 (the values the 26.55 labs used —
//! old lab files and requests without a set keep them) and CODATA 2022 (the default for new work). The values are
//! those of the NIST tables (as distributed in SciPy's `scipy.constants._codata`, CODATA 2018 and 2022); the
//! defining constants of the 2019 SI (c, h, e, k_B, N_A) are the same exact numbers in both. Conventional values
//! that belong to no CODATA adjustment (standard gravity, standard atmosphere, 0 °C, the reference sound intensity)
//! are listed separately and are the same in every set.
//!
//! k_e = 1/(4πε₀) and m_u c² are derived from the set's values (the derivation is recorded).

/// One constant of a set.
#[derive(Clone, Copy, Debug)]
pub struct Constant {
    pub id: &'static str,
    pub value: f64,
    pub unit: &'static str,
    /// Standard uncertainty (same unit); 0 for exact values.
    pub u: f64,
    pub exact: bool,
    /// 'codata' (from the adjustment), 'defined' (exact SI definition), 'conventional', 'derived'.
    pub origin: &'static str,
}

const fn c(id: &'static str, value: f64, unit: &'static str, u: f64, origin: &'static str) -> Constant {
    Constant { id, value, unit, u, exact: u == 0.0, origin }
}

/// The exact defining constants of the 2019 SI and the values computed exactly from them.
const DEFINED: [Constant; 10] = [
    c("c_light", 299792458.0, "m/s", 0.0, "defined"),
    c("h_planck", 6.62607015e-34, "J·s", 0.0, "defined"),
    c("hbar", 1.0545718176461565e-34, "J·s", 0.0, "defined"),
    c("e_charge", 1.602176634e-19, "C", 0.0, "defined"),
    c("k_B", 1.380649e-23, "J/K", 0.0, "defined"),
    c("N_A", 6.02214076e23, "1/mol", 0.0, "defined"),
    c("R_gas", 8.31446261815324, "J/(mol·K)", 0.0, "defined"),
    c("sigma_SB", 5.6703744191844314e-08, "W/(m²·K⁴)", 0.0, "defined"),
    c("b_Wien", 0.0028977719551851727, "m·K", 0.0, "defined"),
    c("eV", 1.602176634e-19, "J", 0.0, "defined"),
];

/// Conventional values (not part of a CODATA adjustment).
const CONVENTIONAL: [Constant; 4] = [
    c("g_n", 9.80665, "m/s²", 0.0, "conventional"),
    c("p_atm", 101325.0, "Pa", 0.0, "conventional"),
    c("T_0C", 273.15, "K", 0.0, "conventional"),
    c("I_0", 1e-12, "W/m²", 0.0, "conventional"),
];

/// The adjusted constants of CODATA 2018.
const ADJUSTED_2018: [Constant; 11] = [
    c("G_grav", 6.6743e-11, "N·m²/kg²", 1.5e-15, "codata"),
    c("eps0", 8.8541878128e-12, "F/m", 1.3e-21, "codata"),
    c("mu0", 1.25663706212e-06, "H/m", 1.9e-16, "codata"),
    c("m_e", 9.1093837015e-31, "kg", 2.8e-40, "codata"),
    c("m_p", 1.67262192369e-27, "kg", 5.1e-37, "codata"),
    c("m_n", 1.67492749804e-27, "kg", 9.5e-37, "codata"),
    c("m_u", 1.6605390666e-27, "kg", 5e-37, "codata"),
    c("lambda_C", 2.42631023867e-12, "m", 7.3e-22, "codata"),
    c("a0_Bohr", 5.29177210903e-11, "m", 8e-21, "codata"),
    c("alpha_fs", 0.0072973525693, "", 1.1e-12, "codata"),
    c("Ry_E", 13.605693122994 * 1.602176634e-19, "J", 2.6e-11 * 1.602176634e-19, "codata"),
];

/// The adjusted constants of CODATA 2022.
const ADJUSTED_2022: [Constant; 11] = [
    c("G_grav", 6.6743e-11, "N·m²/kg²", 1.5e-15, "codata"),
    c("eps0", 8.8541878188e-12, "F/m", 1.4e-21, "codata"),
    c("mu0", 1.25663706127e-06, "H/m", 2e-16, "codata"),
    c("m_e", 9.1093837139e-31, "kg", 2.8e-40, "codata"),
    c("m_p", 1.67262192595e-27, "kg", 5.2e-37, "codata"),
    c("m_n", 1.67492750056e-27, "kg", 8.5e-37, "codata"),
    c("m_u", 1.66053906892e-27, "kg", 5.2e-37, "codata"),
    c("lambda_C", 2.42631023538e-12, "m", 7.6e-22, "codata"),
    c("a0_Bohr", 5.29177210544e-11, "m", 8.2e-21, "codata"),
    c("alpha_fs", 0.0072973525643, "", 1.1e-12, "codata"),
    c("Ry_E", 13.60569312299 * 1.602176634e-19, "J", 1.5e-11 * 1.602176634e-19, "codata"),
];

/// Energy equivalents in MeV that the nuclear lab used before 26.56 (CODATA 2018) and their 2022 values.
pub struct NuclearMeV {
    pub u: f64,
    pub me: f64,
}
pub const NUCLEAR_2018: NuclearMeV = NuclearMeV { u: 931.49410242, me: 0.51099895 };
pub const NUCLEAR_2022: NuclearMeV = NuclearMeV { u: 931.49410372, me: 0.51099895069 };

/// The MeV equivalents of a set.
pub fn nuclear(set: &str) -> &'static NuclearMeV {
    if set == "CODATA2018" { &NUCLEAR_2018 } else { &NUCLEAR_2022 }
}

/// Id of the set that old files and requests without a set use (the 26.55 values).
pub const LEGACY: &str = "CODATA2018";
/// Id of the set for new work.
pub const DEFAULT: &str = "CODATA2022";
/// Known sets.
pub const SETS: [&str; 2] = ["CODATA2018", "CODATA2022"];

/// Source text of a set (for provenance records).
pub fn source(set: &str) -> &'static str {
    match set {
        "CODATA2018" => "CODATA 2018 (NIST, Tiesinga et al., Rev. Mod. Phys. 93, 025010 (2021))",
        _ => "CODATA 2022 (NIST, Mohr et al., 2024)",
    }
}

/// A known set id, or the default set for an unknown or missing one.
pub fn normalize(set: Option<&str>, fallback: &'static str) -> &'static str {
    match set {
        Some("CODATA2018") => "CODATA2018",
        Some("CODATA2022") => "CODATA2022",
        _ => fallback,
    }
}

/// Every constant of a set: defined, conventional, adjusted and derived (k_e, u_c2), in a fixed order.
pub fn all(set: &str) -> Vec<Constant> {
    let adjusted: &[Constant] = if set == "CODATA2018" { &ADJUSTED_2018 } else { &ADJUSTED_2022 };
    let mut out: Vec<Constant> = Vec::with_capacity(32);
    out.extend_from_slice(&DEFINED);
    out.extend_from_slice(&CONVENTIONAL);
    out.extend_from_slice(adjusted);
    let eps0 = adjusted.iter().find(|k| k.id == "eps0").unwrap();
    let mu = adjusted.iter().find(|k| k.id == "m_u").unwrap();
    let ke = 1.0 / (4.0 * std::f64::consts::PI * eps0.value);
    out.push(Constant { id: "k_e", value: ke, unit: "N·m²/C²", u: ke * eps0.u / eps0.value, exact: false, origin: "derived" });
    let cc = 299792458.0_f64 * 299792458.0;
    out.push(Constant { id: "u_c2", value: mu.value * cc, unit: "J", u: mu.u * cc, exact: false, origin: "derived" });
    out
}

/// One constant of a set.
pub fn get(set: &str, id: &str) -> Option<Constant> {
    all(set).into_iter().find(|k| k.id == id)
}

/// Value of a constant of a set (panics on an unknown id: a programming error).
pub fn value(set: &str, id: &str) -> f64 {
    get(set, id).unwrap_or_else(|| panic!("unknown constant {id}")).value
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::expr::{dim_equal, unit_dim};

    #[test]
    fn sets_are_complete_and_dimensioned() {
        for s in SETS {
            let a = all(s);
            assert_eq!(a.len(), DEFINED.len() + CONVENTIONAL.len() + 11 + 2);
            for k in &a {
                assert!(unit_dim(k.unit).is_some(), "{} unit {}", k.id, k.unit);
                assert!(k.value.is_finite() && k.value > 0.0);
            }
            // same ids in the same order in both sets
            let ids: Vec<&str> = a.iter().map(|k| k.id).collect();
            let other: Vec<&str> = all(if s == "CODATA2018" { "CODATA2022" } else { "CODATA2018" }).iter().map(|k| k.id).collect();
            assert_eq!(ids, other);
        }
        assert!(dim_equal(&unit_dim("H/m").unwrap(), &unit_dim("N/A²").unwrap()));
    }

    #[test]
    fn values_differ_only_where_the_adjustment_changed() {
        // μ0 is no longer exact after the 2019 SI: the two adjustments differ by 6.8e-10 (relative)
        let a = value("CODATA2018", "mu0");
        let b = value("CODATA2022", "mu0");
        assert!(((a - b) / b).abs() > 6e-10 && ((a - b) / b).abs() < 7e-10);
        assert_eq!(value("CODATA2018", "h_planck"), value("CODATA2022", "h_planck"));
        // μ0 ε0 c² = 1 to the uncertainty of the adjustment
        for s in SETS {
            let x = value(s, "mu0") * value(s, "eps0") * 299792458.0_f64.powi(2);
            assert!((x - 1.0).abs() < 1e-9, "{s}: {x}");
        }
        // m_u c² agrees with the MeV energy equivalent of each adjustment
        let mev = 1.602176634e-13;
        assert!((value("CODATA2018", "u_c2") / mev - NUCLEAR_2018.u).abs() < 1e-6);
        assert!((value("CODATA2022", "u_c2") / mev - NUCLEAR_2022.u).abs() < 1e-6);
    }
}
