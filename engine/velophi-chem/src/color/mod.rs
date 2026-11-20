//! What a mixture looks like (26.64, D267): the colour of a solution from the absorption spectra of its species, flame colours from emission lines.
//!
//! A spectrum is sixteen molar absorption coefficients, at 400, 420, … 700 nm (L/(mol·cm)). The absorbance of a
//! layer is the sum over the species of ε·c·l (Beer–Lambert); the light of a white (D65) source that passes is
//! weighted with the CIE 1931 colour matching functions and converted to sRGB. Clear water is exactly white: each
//! tristimulus value is taken relative to the same sum without absorption.

pub mod api;
pub mod tables;

use velophi_core::dmath;

use crate::bench::Vessel;
use crate::db::{Database, LN10};

/// Number of wavelengths of a spectrum.
pub const BANDS: usize = 16;

/// Wavelength of band `i`, nm.
pub fn wavelength(i: usize) -> f64 {
    400.0 + 20.0 * i as f64
}

/// D65 white point (Y = 1).
const WHITE: [f64; 3] = [0.95047, 1.0, 1.08883];

/// XYZ (Y of white = 1) → linear sRGB (IEC 61966-2-1).
fn linear_srgb(xyz: [f64; 3]) -> [f64; 3] {
    [
        3.2406 * xyz[0] - 1.5372 * xyz[1] - 0.4986 * xyz[2],
        -0.9689 * xyz[0] + 1.8758 * xyz[1] + 0.0415 * xyz[2],
        0.0557 * xyz[0] - 0.2040 * xyz[1] + 1.0570 * xyz[2],
    ]
}

/// The sRGB transfer function, to 0 … 255.
fn encode(linear: f64) -> u8 {
    let c = if linear > 0.0 { if linear < 1.0 { linear } else { 1.0 } } else { 0.0 };
    let e = if c <= 0.0031308 { 12.92 * c } else { 1.055 * dmath::pow(c, 1.0 / 2.4) - 0.055 };
    (255.0 * e + 0.5).floor() as u8
}

/// Colour of white light after a layer with this absorbance at the sixteen wavelengths.
pub fn transmitted(absorbance: &[f64; BANDS]) -> [u8; 3] {
    let mut white = [0.0; 3];
    let mut got = [0.0; 3];
    for (i, a) in absorbance.iter().enumerate() {
        let (_, x, y, z, s) = tables::TABLE[2 + 2 * i];
        let t = if a.is_finite() { dmath::exp(-a.max(0.0) * LN10) } else { 0.0 };
        for (k, c) in [x, y, z].into_iter().enumerate() {
            white[k] += s * c;
            got[k] += s * c * t;
        }
    }
    let rgb = linear_srgb([got[0] / white[0] * WHITE[0], got[1] / white[1] * WHITE[1], got[2] / white[2] * WHITE[2]]);
    [encode(rgb[0]), encode(rgb[1]), encode(rgb[2])]
}

/// Colour matching functions at a wavelength (linear between the 10 nm entries; zero outside 380 … 780 nm).
fn matching(nm: f64) -> [f64; 3] {
    let t = &tables::TABLE;
    if !(nm >= t[0].0 && nm <= t[t.len() - 1].0) {
        return [0.0; 3];
    }
    let pos = (nm - t[0].0) / 10.0;
    let i = (pos.floor() as usize).min(t.len() - 2);
    let f = pos - i as f64;
    [t[i].1 + f * (t[i + 1].1 - t[i].1), t[i].2 + f * (t[i + 1].2 - t[i].2), t[i].3 + f * (t[i + 1].3 - t[i].3)]
}

/// Colour of light made of these lines `(wavelength in nm, relative power)`, at full brightness: a colour outside
/// the screen's gamut is moved towards white until it fits. `None` when nothing of it is visible.
pub fn emitted(lines: &[(f64, f64)]) -> Option<[u8; 3]> {
    let mut xyz = [0.0; 3];
    for &(nm, power) in lines {
        if power.is_finite() && power > 0.0 {
            let m = matching(nm);
            for k in 0..3 {
                xyz[k] += power * m[k];
            }
        }
    }
    if !(xyz[1] > 0.0) {
        return None;
    }
    let mut rgb = linear_srgb(xyz);
    let low = rgb[0].min(rgb[1]).min(rgb[2]);
    if low < 0.0 {
        for c in &mut rgb {
            *c -= low;
        }
    }
    let high = rgb[0].max(rgb[1]).max(rgb[2]);
    if !(high > 0.0) {
        return None;
    }
    Some([encode(rgb[0] / high), encode(rgb[1] / high), encode(rgb[2] / high)])
}

/// Add ε·c of the listed species `(species, mol/L)` to an absorbance per cm.
pub fn add(db: &Database, per_cm: &mut [f64; BANDS], species: usize, molar: f64) {
    if let Some(e) = db.cat.spectra.get(&species) {
        if molar.is_finite() && molar > 0.0 {
            for k in 0..BANDS {
                per_cm[k] += e[k] * molar;
            }
        }
    }
}

/// Inner width of a vessel, cm: a cylinder one and a half times as tall as wide that holds its capacity.
pub fn width_cm(v: &Vessel) -> f64 {
    dmath::pow(4.0 * v.capacity_l * 1e3 / (1.5 * core::f64::consts::PI), 1.0 / 3.0)
}

/// Absorbance per cm of the solution in a vessel; `None` without a solution.
pub fn solution(db: &Database, v: &Vessel) -> Option<[f64; BANDS]> {
    if !(v.volume_l > 0.0) {
        return None;
    }
    let mut a = [0.0; BANDS];
    if let Some(s) = &v.sol {
        for &(i, m, _) in &s.aqueous {
            add(db, &mut a, i, m * s.water_kg / v.volume_l);
        }
    }
    for (&i, &n) in &v.solutes {
        add(db, &mut a, i, n / v.volume_l);
    }
    Some(a)
}

/// Absorbance per cm of the gas in the head space of a vessel; `None` when it holds none.
pub fn head_space(db: &Database, v: &Vessel) -> Option<[f64; BANDS]> {
    let room = v.capacity_l - v.volume_l;
    if v.gas.is_empty() || !(room > 0.0) {
        return None;
    }
    let mut a = [0.0; BANDS];
    for (&i, &n) in &v.gas {
        add(db, &mut a, i, n / room);
    }
    Some(a)
}

/// A layer of `path` cm.
pub fn through(per_cm: &[f64; BANDS], path: f64) -> [f64; BANDS] {
    let mut a = *per_cm;
    for x in &mut a {
        *x *= path;
    }
    a
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clear_is_white_and_opaque_is_black() {
        assert_eq!(transmitted(&[0.0; BANDS]), [255, 255, 255]);
        assert_eq!(transmitted(&[9.0; BANDS]), [0, 0, 0]);
        // A grey filter of absorbance 1 passes a tenth: sRGB of 0.1 is 89
        assert_eq!(transmitted(&[1.0; BANDS]), [89, 89, 89]);
    }

    #[test]
    fn single_lines_have_their_hue() {
        let c = |nm| emitted(&[(nm, 1.0)]).unwrap();
        let sodium = c(589.0);
        assert!(sodium[0] == 255 && sodium[1] > 120 && sodium[1] < 230 && sodium[2] < 60, "{sodium:?}");
        let lithium = c(670.8);
        assert!(lithium[0] == 255 && lithium[1] < 40 && lithium[2] < 100, "{lithium:?}");
        let green = c(530.0);
        assert!(green[1] == 255 && green[0] < 140 && green[2] < 200, "{green:?}");
        let blue = c(455.0);
        assert!(blue[2] == 255 && blue[1] < 90, "{blue:?}");
        assert_eq!(emitted(&[(900.0, 1.0)]), None);
        assert_eq!(emitted(&[]), None);
    }

    #[test]
    fn matching_functions_interpolate_the_table() {
        let m = matching(555.0);
        assert!((m[1] - 0.5 * (tables::TABLE[17].2 + tables::TABLE[18].2)).abs() < 1e-15);
        assert_eq!(matching(379.9), [0.0; 3]);
        assert_eq!(matching(f64::NAN), [0.0; 3]);
    }
}
