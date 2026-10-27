//! Atoms and light (26.54, D82): the energy levels and spectrum of hydrogen (Bohr model, Eₙ = −13.6 eV/n²),
//! excitation by photons and electrons, and the photoelectric effect.

use crate::dmath::{exp, pow};

/// Planck constant (J·s), speed of light (m/s), elementary charge (C) — exact SI values.
pub const H: f64 = 6.62607015e-34;
pub const C: f64 = 299792458.0;
pub const E_CHARGE: f64 = 1.602176634e-19;
/// Ground-state energy of hydrogen in the textbook form (eV).
pub const E1_EV: f64 = -13.6;

/// Energy of level n (eV).
pub fn level(n: u32) -> f64 {
    E1_EV / (n as f64 * n as f64)
}

/// A spectral line (emission from `upper` to `lower`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Line {
    pub upper: u32,
    pub lower: u32,
    /// Photon energy (eV), frequency (Hz), wavelength (nm).
    pub energy: f64,
    pub frequency: f64,
    pub wavelength: f64,
    pub series: &'static str,
    /// 380 nm ≤ λ ≤ 780 nm.
    pub visible: bool,
}

/// Name of the series that ends on `lower`.
pub fn series_name(lower: u32) -> &'static str {
    match lower {
        1 => "lyman",
        2 => "balmer",
        3 => "paschen",
        4 => "brackett",
        5 => "pfund",
        _ => "humphreys",
    }
}

/// The line of the transition upper → lower (upper > lower ≥ 1).
pub fn line(upper: u32, lower: u32) -> Line {
    let energy = level(upper) - level(lower);
    let frequency = energy * E_CHARGE / H;
    let wavelength = C / frequency * 1e9;
    Line { upper, lower, energy, frequency, wavelength, series: series_name(lower), visible: (380.0..=780.0).contains(&wavelength) }
}

/// All lines between the levels 1 … max_n, by lower level then upper level.
pub fn spectrum(max_n: u32) -> Vec<Line> {
    let mut out = Vec::new();
    for lower in 1..max_n {
        for upper in lower + 1..=max_n {
            out.push(line(upper, lower));
        }
    }
    out
}

/// Excitation of an atom in level `from` by a photon (absorbed only with exactly the energy of a transition, or
/// any energy above ionization) or by an electron (gives any part of its kinetic energy). "Exactly" means to within
/// `PHOTON_TOL`: textbooks give the energies to 0.01 eV (12.09 eV for 1 → 3, where 13.6·8/9 = 12.0889 eV).
#[derive(Clone, Debug, PartialEq)]
pub struct Excitation {
    /// Levels the atom can reach (above `from`, up to max_n).
    pub levels: Vec<u32>,
    /// The atom can be ionized; kinetic energy of the freed electron (eV) for a photon.
    pub ionizes: bool,
    pub free_energy: Option<f64>,
}

/// Largest difference (eV) between a photon's energy and a transition energy for absorption: half of 0.01 eV.
pub const PHOTON_TOL: f64 = 5e-3;

pub fn excite(from: u32, energy: f64, photon: bool, max_n: u32) -> Excitation {
    let e0 = level(from);
    let mut levels = Vec::new();
    for m in from + 1..=max_n {
        let de = level(m) - e0;
        let ok = if photon { (energy - de).abs() <= PHOTON_TOL } else { energy >= de - 1e-12 };
        if ok {
            levels.push(m);
        }
    }
    let ionizes = energy >= -e0 - 1e-12;
    Excitation { levels, ionizes, free_energy: if ionizes && photon { Some(energy + e0) } else { None } }
}

/// Photoelectric effect for a metal of work function W (eV) lit by light of frequency ν (Hz) and power P (W);
/// quantum efficiency η (electrons per photon).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Photo {
    /// hν (eV).
    pub photon: f64,
    pub work: f64,
    /// Largest kinetic energy of the photoelectrons Ek = hν − W (eV; 0 below the threshold).
    pub ek_max: f64,
    /// Stopping voltage (V) = Ek/e.
    pub stop_voltage: f64,
    /// Threshold frequency (Hz) and wavelength (nm).
    pub threshold_frequency: f64,
    pub threshold_wavelength: f64,
    /// Photons per second and saturation current (A).
    pub photon_rate: f64,
    pub saturation: f64,
    pub emits: bool,
}

pub fn photoelectric(work: f64, frequency: f64, power: f64, efficiency: f64) -> Photo {
    let photon = H * frequency / E_CHARGE;
    let emits = photon > work;
    let ek_max = if emits { photon - work } else { 0.0 };
    let photon_rate = if frequency > 0.0 { power / (H * frequency) } else { 0.0 };
    Photo {
        photon,
        work,
        ek_max,
        stop_voltage: ek_max,
        threshold_frequency: work * E_CHARGE / H,
        threshold_wavelength: C * H / (work * E_CHARGE) * 1e9,
        photon_rate,
        saturation: if emits { efficiency * photon_rate * E_CHARGE } else { 0.0 },
        emits,
    }
}

/// Collection voltage scale (V) of the phototube model.
pub const U_COLLECT: f64 = 1.0;

/// Photocurrent at anode voltage U (V) in the phototube model: below −U_c no current; between −U_c and 0 the
/// fraction of electrons whose energy exceeds e|U| (energies spread evenly over 0 … Ek) of the current at U = 0;
/// for U > 0 the collection rises towards saturation, I = I_s(1 − ½e^(−U/U₀)).
pub fn current(p: &Photo, u: f64) -> f64 {
    if !p.emits {
        return 0.0;
    }
    if u >= 0.0 {
        p.saturation * (1.0 - 0.5 * exp(-u / U_COLLECT))
    } else if -u >= p.stop_voltage {
        0.0
    } else {
        0.5 * p.saturation * (1.0 - (-u) / p.stop_voltage)
    }
}

/// Wavelength (nm) to frequency (Hz).
pub fn frequency_of(wavelength_nm: f64) -> f64 {
    C / (wavelength_nm * 1e-9)
}

/// de Broglie wavelength (nm) of an electron of kinetic energy Ek (eV), non-relativistic.
pub fn de_broglie_electron(ek: f64) -> f64 {
    let m = 9.1093837015e-31;
    H / pow(2.0 * m * ek * E_CHARGE, 0.5) * 1e9
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn balmer_lines() {
        // Hα: 3 → 2, 1.889 eV, ≈ 656 nm (with E1 = −13.6 eV)
        let l = line(3, 2);
        assert!((l.energy - 13.6 * (1.0 / 4.0 - 1.0 / 9.0)).abs() < 1e-12);
        assert!((l.wavelength - 656.5).abs() < 1.0 && l.visible && l.series == "balmer");
        assert!((l.frequency * l.wavelength * 1e-9 - C).abs() < 1e-3);
        // Lyman lines are ultraviolet, Paschen infrared; five visible Balmer lines up to n = 7 (Hα … Hε)
        assert!(spectrum(7).iter().filter(|l| l.series == "lyman").all(|l| !l.visible));
        assert_eq!(spectrum(7).iter().filter(|l| l.visible).count(), 5);
        assert_eq!(spectrum(5).len(), 10);
    }

    #[test]
    fn excitation_rules() {
        // 10.2 eV photon: 1 → 2 only; 11 eV photon: nothing; 11 eV electron: 1 → 2
        assert_eq!(excite(1, 10.2, true, 6).levels, vec![2]);
        // textbook values to 0.01 eV: 12.09 eV (1 → 3), 12.75 eV (1 → 4), 13.06 eV (1 → 5)
        assert_eq!(excite(1, 12.09, true, 6).levels, vec![3]);
        assert_eq!(excite(1, 12.75, true, 6).levels, vec![4]);
        assert_eq!(excite(1, 13.06, true, 6).levels, vec![5]);
        assert!(excite(1, 12.1, true, 6).levels.is_empty());
        assert!(excite(1, 11.0, true, 6).levels.is_empty());
        assert_eq!(excite(1, 11.0, false, 6).levels, vec![2]);
        let e = excite(1, 14.0, true, 6);
        assert!(e.ionizes && (e.free_energy.unwrap() - 0.4).abs() < 1e-12);
    }

    #[test]
    fn photoelectric_einstein_equation() {
        // sodium W = 2.29 eV, 400 nm: Ek = hc/λ − W
        let f = frequency_of(400.0);
        let p = photoelectric(2.29, f, 1e-3, 0.05);
        let ek = H * C / 400e-9 / E_CHARGE - 2.29;
        assert!((p.ek_max - ek).abs() < 1e-12 && (p.stop_voltage - ek).abs() < 1e-12 && p.emits);
        assert!((current(&p, -p.stop_voltage)).abs() < 1e-30 && current(&p, -0.5 * p.stop_voltage) > 0.0);
        assert!((current(&p, 50.0) - p.saturation).abs() < 1e-12 * p.saturation);
        assert!((p.saturation - 0.05 * 1e-3 / (H * f) * E_CHARGE).abs() < 1e-18);
        // below the threshold: no current at any voltage, however bright
        let p = photoelectric(2.29, p.threshold_frequency * 0.99, 1.0, 0.05);
        assert!(!p.emits && current(&p, 100.0) == 0.0);
        // the saturation current is proportional to the light power
        let (a, b) = (photoelectric(2.29, f, 1e-3, 0.05), photoelectric(2.29, f, 2e-3, 0.05));
        assert!((b.saturation / a.saturation - 2.0).abs() < 1e-12);
    }
}
