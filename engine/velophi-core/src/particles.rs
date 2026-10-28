//! Particle-process checker (26.56, D100; blueprint N11). Unlike the nuclear reaction balance of the nuclear lab
//! (`labs::nuclear::reaction`, which balances only the nucleon number A and the charge number Z and computes Q from
//! atomic mass excesses), this checks a general process of particles against the conservation rules of the standard
//! textbook catalogue: electric charge, baryon number, the three lepton family numbers (electron, muon, tau; a
//! neutrino and its antineutrino are told apart), and energy: a decay at rest is allowed only when the rest energy
//! before is at least the sum after (Q ≥ 0); a two-body collision on a target at rest reports the threshold kinetic
//! energy of the projectile, T_th = [(Σm_f)² − (m₁ + m₂)²]c²/(2m₂).
//!
//! The rules are necessary, not sufficient: a process that passes may still be forbidden by other selection rules
//! (strangeness in strong and electromagnetic processes, angular momentum, parity) or be very rare; the result says
//! so. Rest energies: PDG 2024 for leptons and hadrons, CODATA (the requested set) for e, p, n; neutrinos are taken
//! as massless (upper limits only). Nuclides by (Z, A) with masses from AME2020 mass excesses (labs::nuclear).

use crate::constants;
use crate::labs::nuclear;

/// A catalogue entry: id, charge (e), baryon number, lepton numbers (Le, Lμ, Lτ), strangeness, rest energy (MeV,
/// None: from the constant set).
struct Entry {
    id: &'static str,
    q: i32,
    b: i32,
    l: [i32; 3],
    s: i32,
    mev: Option<f64>,
}

const fn e(id: &'static str, q: i32, b: i32, l: [i32; 3], s: i32, mev: Option<f64>) -> Entry {
    Entry { id, q, b, l, s, mev }
}

/// PDG 2024 rest energies (MeV) of the particles that are not in the constant sets.
const CATALOGUE: &[Entry] = &[
    e("e-", -1, 0, [1, 0, 0], 0, None),
    e("e+", 1, 0, [-1, 0, 0], 0, None),
    e("mu-", -1, 0, [0, 1, 0], 0, Some(105.6583755)),
    e("mu+", 1, 0, [0, -1, 0], 0, Some(105.6583755)),
    e("tau-", -1, 0, [0, 0, 1], 0, Some(1776.93)),
    e("tau+", 1, 0, [0, 0, -1], 0, Some(1776.93)),
    e("nu_e", 0, 0, [1, 0, 0], 0, Some(0.0)),
    e("anti_nu_e", 0, 0, [-1, 0, 0], 0, Some(0.0)),
    e("nu_mu", 0, 0, [0, 1, 0], 0, Some(0.0)),
    e("anti_nu_mu", 0, 0, [0, -1, 0], 0, Some(0.0)),
    e("nu_tau", 0, 0, [0, 0, 1], 0, Some(0.0)),
    e("anti_nu_tau", 0, 0, [0, 0, -1], 0, Some(0.0)),
    e("gamma", 0, 0, [0, 0, 0], 0, Some(0.0)),
    e("p", 1, 1, [0, 0, 0], 0, None),
    e("anti_p", -1, -1, [0, 0, 0], 0, None),
    e("n", 0, 1, [0, 0, 0], 0, None),
    e("anti_n", 0, -1, [0, 0, 0], 0, None),
    e("pi+", 1, 0, [0, 0, 0], 0, Some(139.57039)),
    e("pi-", -1, 0, [0, 0, 0], 0, Some(139.57039)),
    e("pi0", 0, 0, [0, 0, 0], 0, Some(134.9768)),
    e("K+", 1, 0, [0, 0, 0], 1, Some(493.677)),
    e("K-", -1, 0, [0, 0, 0], -1, Some(493.677)),
    e("K0", 0, 0, [0, 0, 0], 1, Some(497.611)),
    e("Lambda", 0, 1, [0, 0, 0], -1, Some(1115.683)),
];

/// The ids of the catalogue (for the interface).
pub fn catalogue() -> Vec<&'static str> {
    CATALOGUE.iter().map(|x| x.id).collect()
}

/// One particle of a process: a catalogue id or a nuclide (Z, A).
#[derive(Clone, Debug)]
pub enum Item {
    Particle(String),
    Nuclide { z: u32, a: u32 },
}

/// Quantum numbers and rest energy (MeV) of an item; None for an unknown id.
fn props(it: &Item, set: &str) -> Option<(i32, i32, [i32; 3], i32, f64, bool)> {
    let me = constants::nuclear(set).me;
    let c2 = |kg: f64| kg * 299792458.0_f64 * 299792458.0 / constants::value(set, "e_charge") * 1e-6;
    match it {
        Item::Particle(id) => {
            let x = CATALOGUE.iter().find(|x| x.id == id)?;
            let m = match (x.mev, x.id) {
                (Some(m), _) => m,
                (None, "e-" | "e+") => me,
                (None, "p" | "anti_p") => c2(constants::value(set, "m_p")),
                (None, _) => c2(constants::value(set, "m_n")),
            };
            Some((x.q, x.b, x.l, x.s, m, true))
        }
        Item::Nuclide { z, a } => {
            if *a == 0 || z > a {
                return None;
            }
            // nuclear rest energy = atomic mass − Z electrons (electron binding neglected, < 0.1 MeV for heavy atoms)
            let (d, measured) = nuclear::mass_excess(*z, *a);
            let m = *a as f64 * constants::nuclear(set).u + d - *z as f64 * me;
            Some((*z as i32, *a as i32, [0, 0, 0], 0, m, measured))
        }
    }
}

/// Result of a check.
#[derive(Debug, Clone)]
pub struct Check {
    pub known: bool,
    pub charge: (i32, i32),
    pub baryon: (i32, i32),
    pub lepton: ([i32; 3], [i32; 3]),
    pub strangeness: (i32, i32),
    /// Rest energies before and after (MeV).
    pub mass: (f64, f64),
    /// Q = Σm_i − Σm_f (MeV) for a decay of one particle at rest.
    pub q: Option<f64>,
    /// Threshold kinetic energy of the first particle on the second at rest (MeV), for two particles before.
    pub threshold: Option<f64>,
    /// Every conservation rule holds and the energy allows it.
    pub allowed: bool,
    /// Rules that fail (keys: charge, baryon, leptonE, leptonMu, leptonTau, energy).
    pub violations: Vec<&'static str>,
    /// Strangeness changes (allowed only for weak processes).
    pub strangeness_changes: bool,
    /// A nuclide mass is a semi-empirical estimate.
    pub estimated: bool,
}

pub fn check(before: &[Item], after: &[Item], set: &str) -> Check {
    let side = |xs: &[Item]| -> Option<(i32, i32, [i32; 3], i32, f64, bool)> {
        let mut acc = (0, 0, [0, 0, 0], 0, 0.0, true);
        for x in xs {
            let (q, b, l, s, m, meas) = props(x, set)?;
            acc.0 += q;
            acc.1 += b;
            for k in 0..3 {
                acc.2[k] += l[k];
            }
            acc.3 += s;
            acc.4 += m;
            acc.5 &= meas;
        }
        Some(acc)
    };
    let (Some(a), Some(b)) = (side(before), side(after)) else {
        return Check { known: false, charge: (0, 0), baryon: (0, 0), lepton: ([0; 3], [0; 3]), strangeness: (0, 0), mass: (0.0, 0.0), q: None, threshold: None, allowed: false, violations: vec!["unknown"], strangeness_changes: false, estimated: false };
    };
    let mut v: Vec<&'static str> = Vec::new();
    if a.0 != b.0 {
        v.push("charge");
    }
    if a.1 != b.1 {
        v.push("baryon");
    }
    for (k, key) in ["leptonE", "leptonMu", "leptonTau"].iter().enumerate() {
        if a.2[k] != b.2[k] {
            v.push(key);
        }
    }
    let q = if before.len() == 1 { Some(a.4 - b.4) } else { None };
    let threshold = if before.len() == 2 {
        let (m1, m2) = (props(&before[0], set).unwrap().4, props(&before[1], set).unwrap().4);
        let t = if m2 > 0.0 { ((b.4 * b.4) - (m1 + m2) * (m1 + m2)) / (2.0 * m2) } else { f64::INFINITY };
        Some(t.max(0.0))
    } else {
        None
    };
    if let Some(q) = q {
        // rounding of tabulated masses: a margin of 1 eV
        if q < -1e-6 {
            v.push("energy");
        }
    }
    Check {
        known: true,
        charge: (a.0, b.0),
        baryon: (a.1, b.1),
        lepton: (a.2, b.2),
        strangeness: (a.3, b.3),
        mass: (a.4, b.4),
        q,
        threshold,
        allowed: v.is_empty(),
        violations: v,
        strangeness_changes: a.3 != b.3,
        estimated: !(a.5 && b.5),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn p(id: &str) -> Item {
        Item::Particle(id.to_string())
    }

    #[test]
    fn neutron_decay_and_its_wrong_versions() {
        let ok = check(&[p("n")], &[p("p"), p("e-"), p("anti_nu_e")], "CODATA2022");
        assert!(ok.allowed && (ok.q.unwrap() - 0.78233).abs() < 2e-5, "{ok:?}");
        // a neutrino instead of the antineutrino breaks the electron lepton number, not the charge
        let nu = check(&[p("n")], &[p("p"), p("e-"), p("nu_e")], "CODATA2022");
        assert_eq!(nu.violations, vec!["leptonE"]);
        // no lepton at all: charge and lepton number
        let bare = check(&[p("n")], &[p("p")], "CODATA2022");
        assert_eq!(bare.violations, vec!["charge"]);
        // a free proton cannot decay into a neutron (energy)
        let pd = check(&[p("p")], &[p("n"), p("e+"), p("nu_e")], "CODATA2022");
        assert_eq!(pd.violations, vec!["energy"]);
    }

    #[test]
    fn muon_decay_pion_decay_and_threshold() {
        let mu = check(&[p("mu-")], &[p("e-"), p("anti_nu_e"), p("nu_mu")], "CODATA2022");
        assert!(mu.allowed && mu.q.unwrap() > 104.0);
        assert_eq!(check(&[p("mu-")], &[p("e-"), p("gamma")], "CODATA2022").violations, vec!["leptonE", "leptonMu"]);
        assert!(check(&[p("pi+")], &[p("mu+"), p("nu_mu")], "CODATA2022").allowed);
        // antiproton production p + p → p + p + p + p̄: threshold 6 m_p c² (about 5.63 GeV)
        let t = check(&[p("p"), p("p")], &[p("p"), p("p"), p("p"), p("anti_p")], "CODATA2022");
        let mp = t.mass.0 / 2.0;
        assert!(t.allowed && (t.threshold.unwrap() - 6.0 * mp).abs() < 1e-6 * mp, "{t:?}");
        // strangeness: K⁻ + p → Λ + π⁰ conserves it; Λ → p + π⁻ changes it (weak only)
        assert!(!check(&[p("K-"), p("p")], &[p("Lambda"), p("pi0")], "CODATA2022").strangeness_changes);
        assert!(check(&[p("Lambda")], &[p("p"), p("pi-")], "CODATA2022").strangeness_changes);
    }

    #[test]
    fn nuclides_and_unknown_names() {
        // ¹⁴C → ¹⁴N + e⁻ + ν̄ₑ with nuclear masses: Q ≈ 0.1565 MeV, as the atomic-mass balance of the nuclear lab
        let c = check(&[Item::Nuclide { z: 6, a: 14 }], &[Item::Nuclide { z: 7, a: 14 }, p("e-"), p("anti_nu_e")], "CODATA2022");
        assert!(c.allowed && (c.q.unwrap() - 0.1565).abs() < 1e-3, "{c:?}");
        assert!(!check(&[p("quark")], &[p("p")], "CODATA2022").known);
    }
}
