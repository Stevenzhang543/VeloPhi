//! Nuclear physics (26.55): decay chains (Bateman), binding energies and reactions, Compton scattering.
//!
//! - Decay chain N₁ → N₂ → … (up to 8 members, the last may be stable): the exact solution as sums of polynomials
//!   times exponentials, built member by member from Nₖ' = λₖ₋₁Nₖ₋₁ − λₖNₖ; equal decay constants give the
//!   t^m·e^{−λt} terms of the confluent case, so equal half-lives need no special input.
//! - Masses: a table of mass excesses (AME2020, MeV, rounded to 1 keV) for the nuclides of the examples; others by the
//!   semi-empirical (Bethe–Weizsäcker) formula, marked as estimates. Binding energy B = Z·Δ(¹H) + N·Δ(n) − Δ.
//! - Reactions: conservation of nucleon number and charge, Q = Σ(mass excess before) − Σ(after) with atomic masses
//!   (β⁺ adds 2mₑc² to the products).

use crate::dmath::{atan, cos, exp, pow};

/// Atomic mass unit (MeV/c²), electron mass (MeV/c²), mass excesses of the neutron and of ¹H (MeV).
pub const U_MEV: f64 = 931.49410242;
pub const ME_MEV: f64 = 0.51099895;
pub const DN: f64 = 8.071318;
pub const DH: f64 = 7.288971;

/// Measured mass excesses Δ = (M − A·u)c² (MeV) of the nuclides used by the examples: (Z, A, Δ, symbol).
pub const TABLE: &[(u32, u32, f64, &str)] = &[
    (1, 1, 7.288971, "H"),
    (1, 2, 13.135722, "H"),
    (1, 3, 14.949806, "H"),
    (2, 3, 14.931218, "He"),
    (2, 4, 2.424916, "He"),
    (3, 6, 14.086879, "Li"),
    (3, 7, 14.907105, "Li"),
    (4, 9, 11.348453, "Be"),
    (6, 12, 0.0, "C"),
    (6, 14, 3.019893, "C"),
    (7, 14, 2.863417, "N"),
    (8, 16, -4.737002, "O"),
    (8, 17, -0.808763, "O"),
    (10, 20, -7.041931, "Ne"),
    (15, 32, -24.304874, "P"),
    (16, 32, -26.015534, "S"),
    (20, 40, -34.846275, "Ca"),
    (26, 56, -60.607134, "Fe"),
    (27, 60, -61.649, "Co"),
    (28, 60, -64.472, "Ni"),
    (28, 62, -66.745784, "Ni"),
    (36, 92, -68.789, "Kr"),
    (38, 90, -85.942, "Sr"),
    (39, 90, -86.488, "Y"),
    (53, 131, -87.444, "I"),
    (54, 131, -88.413, "Xe"),
    (55, 137, -86.546, "Cs"),
    (56, 137, -87.721, "Ba"),
    (56, 141, -79.733, "Ba"),
    (82, 208, -21.748, "Pb"),
    (86, 222, 16.374, "Rn"),
    (88, 226, 23.669, "Ra"),
    (90, 234, 40.615, "Th"),
    (92, 235, 40.920, "U"),
    (92, 238, 47.309, "U"),
];

/// Element symbols by Z (0: neutron).
pub const SYMBOLS: [&str; 104] = [
    "n", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr",
];

/// Semi-empirical binding energy (MeV) with the coefficients of Rohlf (1994).
pub fn semf(z: u32, a: u32) -> f64 {
    if a < 2 {
        return 0.0;
    }
    let (zf, af) = (z as f64, a as f64);
    let n = af - zf;
    let a13 = pow(af, 1.0 / 3.0);
    let mut b = 15.75 * af - 17.8 * a13 * a13 - 0.711 * zf * (zf - 1.0) / a13 - 23.7 * (n - zf) * (n - zf) / af;
    let pair = 11.18 / af.sqrt();
    if z % 2 == 0 && (a - z) % 2 == 0 {
        b += pair;
    } else if z % 2 == 1 && (a - z) % 2 == 1 {
        b -= pair;
    }
    b
}

/// Mass excess (MeV) and whether it is measured (table) or estimated (semi-empirical).
pub fn mass_excess(z: u32, a: u32) -> (f64, bool) {
    if z == 0 && a == 1 {
        return (DN, true);
    }
    if let Some(e) = TABLE.iter().find(|e| e.0 == z && e.1 == a) {
        return (e.2, true);
    }
    let b = semf(z, a);
    (z as f64 * DH + (a - z) as f64 * DN - b, false)
}

/// Binding energy (MeV) and whether it is measured.
pub fn binding(z: u32, a: u32) -> (f64, bool) {
    if a <= 1 {
        return (0.0, true);
    }
    let (d, measured) = mass_excess(z, a);
    (z as f64 * DH + (a - z) as f64 * DN - d, measured)
}

/// A particle of a reaction.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Particle {
    Nuclide { z: u32, a: u32 },
    Neutron,
    /// β⁻ electron (with atomic masses its mass is already counted).
    Electron,
    Positron,
    Gamma,
    Neutrino,
}

impl Particle {
    pub fn charge(&self) -> i64 {
        match *self {
            Particle::Nuclide { z, .. } => z as i64,
            Particle::Electron => -1,
            Particle::Positron => 1,
            _ => 0,
        }
    }
    pub fn nucleons(&self) -> u32 {
        match *self {
            Particle::Nuclide { a, .. } => a,
            Particle::Neutron => 1,
            _ => 0,
        }
    }
}

/// Balance and Q value of a reaction.
#[derive(Clone, Debug)]
pub struct Reaction {
    pub nucleons: (u32, u32),
    pub charge: (i64, i64),
    pub balanced: bool,
    /// Q (MeV) from atomic mass excesses; None when unbalanced.
    pub q: Option<f64>,
    /// Some mass is a semi-empirical estimate.
    pub estimated: bool,
}

pub fn reaction(before: &[Particle], after: &[Particle]) -> Reaction {
    let a0: u32 = before.iter().map(|p| p.nucleons()).sum();
    let a1: u32 = after.iter().map(|p| p.nucleons()).sum();
    let z0: i64 = before.iter().map(|p| p.charge()).sum();
    let z1: i64 = after.iter().map(|p| p.charge()).sum();
    let balanced = a0 == a1 && z0 == z1;
    let mut est = false;
    let mut side = |ps: &[Particle]| -> f64 {
        let mut d = 0.0;
        for p in ps {
            d += match *p {
                Particle::Nuclide { z, a } => {
                    let (m, measured) = mass_excess(z, a);
                    est |= !measured;
                    m
                }
                Particle::Neutron => DN,
                // atomic masses: a β⁻ electron is the daughter atom's extra electron; a positron needs its own
                // mass and leaves an extra atomic electron: 2mₑ
                Particle::Positron => 2.0 * ME_MEV,
                _ => 0.0,
            };
        }
        d
    };
    let d0 = side(before);
    let d1 = side(after);
    Reaction { nucleons: (a0, a1), charge: (z0, z1), balanced, q: if balanced { Some(d0 - d1) } else { None }, estimated: est }
}

// ---- decay chains ----

/// N(t) = Σ e^{−μ t} Σ c_m t^m: the groups (μ, coefficients).
#[derive(Clone, Debug, Default)]
pub struct ExpPoly {
    pub groups: Vec<(f64, Vec<f64>)>,
}

impl ExpPoly {
    fn add(&mut self, mu: f64, m: usize, c: f64) {
        let g = match self.groups.iter().position(|(x, _)| *x == mu) {
            Some(g) => g,
            None => {
                self.groups.push((mu, Vec::new()));
                self.groups.len() - 1
            }
        };
        let v = &mut self.groups[g].1;
        if v.len() <= m {
            v.resize(m + 1, 0.0);
        }
        v[m] += c;
    }
    pub fn at(&self, t: f64) -> f64 {
        let mut s = 0.0;
        for (mu, cs) in &self.groups {
            let mut p = 0.0;
            for c in cs.iter().rev() {
                p = p * t + c;
            }
            s += p * exp(-mu * t);
        }
        s
    }
}

/// Exact amounts of a chain with decay constants λₖ (0: stable) and initial amounts n0ₖ. Decay constants that agree
/// to 10⁻¹² (relative) are treated as equal.
pub fn chain(lambda: &[f64], n0: &[f64]) -> Vec<ExpPoly> {
    let mut lam: Vec<f64> = lambda.to_vec();
    // merge nearly equal constants so the confluent formulas apply
    for i in 0..lam.len() {
        for j in 0..i {
            if (lam[i] - lam[j]).abs() <= 1e-12 * lam[i].abs().max(lam[j].abs()) {
                lam[i] = lam[j];
            }
        }
    }
    let mut out: Vec<ExpPoly> = Vec::with_capacity(lam.len());
    for k in 0..lam.len() {
        let mut nk = ExpPoly::default();
        let l = lam[k];
        nk.add(l, 0, n0.get(k).copied().unwrap_or(0.0));
        if k > 0 {
            let prev = out[k - 1].clone();
            let lp = lam[k - 1];
            for (mu, cs) in &prev.groups {
                for (m, &c) in cs.iter().enumerate() {
                    if c == 0.0 {
                        continue;
                    }
                    let c = lp * c;
                    if *mu == l {
                        // ∫₀ᵗ e^{−λ(t−s)} s^m e^{−λs} ds = e^{−λt} t^{m+1}/(m+1)
                        nk.add(l, m + 1, c / (m + 1) as f64);
                    } else {
                        // e^{−λt}∫₀ᵗ s^m e^{as} ds, a = λ − μ:
                        //   e^{−μt} Σⱼ (−1)ʲ m!/(m−j)! t^{m−j}/a^{j+1} − e^{−λt}(−1)^m m!/a^{m+1}
                        let a = l - mu;
                        let mut fact = 1.0; // m!/(m−j)!
                        let mut apow = a; // a^{j+1}
                        for j in 0..=m {
                            let sign = if j % 2 == 0 { 1.0 } else { -1.0 };
                            nk.add(*mu, m - j, c * sign * fact / apow);
                            fact *= (m - j) as f64;
                            apow *= a;
                        }
                        let mfact: f64 = (1..=m).map(|x| x as f64).product();
                        let sign = if m % 2 == 0 { 1.0 } else { -1.0 };
                        nk.add(l, 0, -c * sign * mfact / pow(a, (m + 1) as f64));
                    }
                }
            }
        }
        out.push(nk);
    }
    out
}

// ---- Compton scattering ----

/// Compton wavelength of the electron h/(mₑc) (m).
pub const COMPTON: f64 = 2.42631023867e-12;

/// Photon of wavelength λ (m) scattered by θ: (λ', photon energy after (MeV), electron kinetic energy (MeV),
/// electron recoil angle φ (rad)).
pub fn compton(lambda: f64, theta: f64) -> (f64, f64, f64, f64) {
    let hc = 1.23984198e-12; // MeV·m
    let l2 = lambda + COMPTON * (1.0 - cos(theta));
    let e1 = hc / lambda;
    let e2 = hc / l2;
    // cot φ = (1 + E/(mₑc²)) tan(θ/2)
    let half = 0.5 * theta;
    let phi = if theta.abs() < 1e-15 { 0.5 * std::f64::consts::PI } else { atan(1.0 / ((1.0 + e1 / ME_MEV) * crate::dmath::tan(half))) };
    (l2, e2, e1 - e2, phi)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn textbook_q_values() {
        let nuc = |z, a| Particle::Nuclide { z, a };
        // D + T → ⁴He + n: 17.59 MeV
        let r = reaction(&[nuc(1, 2), nuc(1, 3)], &[nuc(2, 4), Particle::Neutron]);
        assert!(r.balanced && (r.q.unwrap() - 17.589).abs() < 2e-3, "{:?}", r.q);
        // ²²⁶Ra α decay: 4.87 MeV; ¹⁴C β⁻: 0.156 MeV; ⁶⁰Co β⁻: 2.82 MeV
        assert!((reaction(&[nuc(88, 226)], &[nuc(86, 222), nuc(2, 4)]).q.unwrap() - 4.871).abs() < 2e-3);
        assert!((reaction(&[nuc(6, 14)], &[nuc(7, 14), Particle::Electron, Particle::Neutrino]).q.unwrap() - 0.1565).abs() < 1e-3);
        assert!((reaction(&[nuc(27, 60)], &[nuc(28, 60), Particle::Electron, Particle::Neutrino]).q.unwrap() - 2.823).abs() < 2e-3);
        // ²³⁵U + n → ¹⁴¹Ba + ⁹²Kr + 3n: about 173 MeV
        let f = reaction(&[nuc(92, 235), Particle::Neutron], &[nuc(56, 141), nuc(36, 92), Particle::Neutron, Particle::Neutron, Particle::Neutron]);
        assert!(f.balanced && (f.q.unwrap() - 173.3).abs() < 0.1 && !f.estimated);
        // unbalanced
        assert!(!reaction(&[nuc(92, 235)], &[nuc(56, 141), nuc(36, 92)]).balanced);
        // binding energy per nucleon: ⁴He 7.074, ⁵⁶Fe 8.790, ⁶²Ni 8.795, ²³⁸U 7.570 MeV
        for (z, a, ba) in [(2, 4, 7.0739), (26, 56, 8.7903), (28, 62, 8.7945), (92, 238, 7.5701)] {
            let (b, measured) = binding(z, a);
            assert!(measured && (b / a as f64 - ba).abs() < 2e-4, "{z} {a}: {}", b / a as f64);
        }
        // the semi-empirical formula is within 1 % of ⁵⁶Fe
        assert!((semf(26, 56) - 492.26).abs() < 0.01 * 492.26);
    }

    #[test]
    fn bateman_chains() {
        // A → B → C (stable), λ₁ = 1, λ₂ = 3: N₂ = N₀λ₁/(λ₂ − λ₁)(e^{−λ₁t} − e^{−λ₂t})
        let c = chain(&[1.0, 3.0, 0.0], &[1000.0, 0.0, 0.0]);
        for t in [0.0f64, 0.1, 0.7, 2.0, 5.0] {
            let n2 = 1000.0 * 1.0 / 2.0 * ((-t).exp() - (-3.0 * t).exp());
            assert!((c[1].at(t) - n2).abs() < 1e-10 * 1000.0, "t {t}");
            let total = c[0].at(t) + c[1].at(t) + c[2].at(t);
            assert!((total - 1000.0).abs() < 1e-9);
        }
        // equal constants: N₂ = N₀λt e^{−λt}, N₃ = N₀(λt)²/2 e^{−λt}
        let c = chain(&[0.5, 0.5, 0.5, 0.0], &[1.0, 0.0, 0.0, 0.0]);
        for t in [0.3f64, 1.0, 4.0] {
            assert!((c[1].at(t) - 0.5 * t * (-0.5 * t).exp()).abs() < 1e-15);
            assert!((c[2].at(t) - (0.5 * t).powi(2) / 2.0 * (-0.5 * t).exp()).abs() < 1e-15);
            let total: f64 = c.iter().map(|n| n.at(t)).sum();
            assert!((total - 1.0).abs() < 1e-14);
        }
        // secular equilibrium: λ₁ ≪ λ₂ → activities equal after a few T½ of the daughter
        let c = chain(&[1e-6, 1.0, 0.0], &[1e9, 0.0, 0.0]);
        let t = 30.0;
        assert!((1.0 * c[1].at(t) / (1e-6 * c[0].at(t)) - 1.0).abs() < 1e-5);
    }

    #[test]
    fn compton_shift() {
        // 90°: Δλ = λ_C; backscatter: 2λ_C
        let (l2, _, _, _) = compton(7.1e-11, std::f64::consts::FRAC_PI_2);
        assert!((l2 - 7.1e-11 - COMPTON).abs() < 1e-24);
        let (l2, e2, ek, phi) = compton(7.1e-11, std::f64::consts::PI);
        assert!((l2 - 7.1e-11 - 2.0 * COMPTON).abs() < 1e-24 && ek > 0.0 && e2 > 0.0 && phi.abs() < 1e-12);
    }
}
