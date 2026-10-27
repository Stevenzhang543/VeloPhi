//! Wave optics (26.55, D93): Fraunhofer intensity of slits and gratings, thin films and polarizers.
//!
//! - N slits of width a and spacing d at screen distance L: I(θ) = I₀·[sin β/β]²·[sin(Nα)/(N sin α)]², with
//!   β = πa·sinθ/λ, α = πd·sinθ/λ and x = L·tanθ (exact in the angle, no small-angle approximation; N = 1 is the
//!   single slit, N = 2 the double slit).
//! - Thin film of index n₁ and thickness t between n₀ and n₂, normal incidence: reflectance from the Airy sum of all
//!   reflections, R = |r₀₁ + r₁₂e^{iδ}|² / |1 + r₀₁r₁₂e^{iδ}|², δ = 4πn₁t/λ (the half-wave loss is in the signs of
//!   the Fresnel coefficients r = (nᵢ − nⱼ)/(nᵢ + nⱼ)).
//! - Polarizers: Malus's law I = I₀cos²Δθ, an unpolarized beam is halved by the first one.
//! - White light: 380–780 nm in 5 nm steps with equal energy; colours from the CIE 1931 colour-matching functions
//!   (multi-lobe Gaussian fit of Wyman, Sloan and Shirley, 2013) converted to sRGB. Colours are for display only.

use crate::dmath::{atan, cos, exp, pow, sin};

const PI: f64 = std::f64::consts::PI;

/// Grating factor sin(Nα)/(N sin α) with its limit ±1 where sin α = 0.
fn array_factor(n: usize, alpha: f64) -> f64 {
    let s = sin(alpha);
    if s.abs() < 1e-12 {
        // α = mπ: the factor is (−1)^{m(N−1)}
        let m = (alpha / PI).round() as i64;
        if (m * (n as i64 - 1)).rem_euclid(2) == 0 {
            1.0
        } else {
            -1.0
        }
    } else {
        sin(n as f64 * alpha) / (n as f64 * s)
    }
}

fn sinc(b: f64) -> f64 {
    if b.abs() < 1e-8 {
        1.0 - b * b / 6.0
    } else {
        sin(b) / b
    }
}

/// Relative intensity I/I₀ at screen position x (m) for N slits of width a and spacing d, wavelength λ (m),
/// screen distance L (m).
pub fn slits(x: f64, lambda: f64, a: f64, d: f64, n: usize, l: f64) -> f64 {
    let th = atan(x / l);
    let st = sin(th);
    let b = PI * a * st / lambda;
    let f = sinc(b);
    let g = if n <= 1 { 1.0 } else { array_factor(n, PI * d * st / lambda) };
    f * f * g * g
}

/// Screen positions of the principal maxima of order m (d·sinθ = mλ) within |x| ≤ half (m).
pub fn maxima(lambda: f64, d: f64, l: f64, half: f64) -> Vec<(i32, f64)> {
    let mut out = Vec::new();
    let mmax = (d / lambda).floor() as i32;
    for m in -mmax..=mmax {
        let s = m as f64 * lambda / d;
        if s.abs() >= 1.0 {
            continue;
        }
        let x = l * s / (1.0 - s * s).sqrt();
        if x.abs() <= half {
            out.push((m, x));
        }
    }
    out
}

/// Screen positions of the minima of a single slit (a·sinθ = mλ, m ≠ 0) within |x| ≤ half.
pub fn slit_minima(lambda: f64, a: f64, l: f64, half: f64) -> Vec<(i32, f64)> {
    let mut out = Vec::new();
    let mmax = (a / lambda).floor() as i32;
    for m in -mmax..=mmax {
        if m == 0 {
            continue;
        }
        let s = m as f64 * lambda / a;
        if s.abs() >= 1.0 {
            continue;
        }
        let x = l * s / (1.0 - s * s).sqrt();
        if x.abs() <= half {
            out.push((m, x));
        }
    }
    out
}

/// Reflectance of a thin film (normal incidence).
pub fn film_reflectance(lambda: f64, n0: f64, n1: f64, n2: f64, t: f64) -> f64 {
    let r01 = (n0 - n1) / (n0 + n1);
    let r12 = (n1 - n2) / (n1 + n2);
    let delta = 4.0 * PI * n1 * t / lambda;
    let (c, s) = (cos(delta), sin(delta));
    // numerator r01 + r12 e^{iδ}, denominator 1 + r01 r12 e^{iδ}
    let (nr, ni) = (r01 + r12 * c, r12 * s);
    let (dr, di) = (1.0 + r01 * r12 * c, r01 * r12 * s);
    (nr * nr + ni * ni) / (dr * dr + di * di)
}

/// Intensities after each polarizer (angles in rad) for an input of intensity 1, unpolarized (None) or linearly
/// polarized at the given angle.
pub fn polarizers(input: Option<f64>, angles: &[f64]) -> Vec<f64> {
    let mut out = Vec::with_capacity(angles.len());
    let mut i = 1.0;
    let mut pol = input;
    for &a in angles {
        i = match pol {
            None => 0.5 * i,
            Some(p) => {
                let c = cos(a - p);
                i * c * c
            }
        };
        pol = Some(a);
        out.push(i);
    }
    out
}

// ---- colour ----

fn lobe(l: f64, mu: f64, s1: f64, s2: f64) -> f64 {
    let s = if l < mu { s1 } else { s2 };
    let t = (l - mu) / s;
    exp(-0.5 * t * t)
}

/// CIE 1931 colour-matching functions at λ (nm), analytic multi-lobe fit.
pub fn cie(l: f64) -> (f64, f64, f64) {
    let x = 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
    let y = 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
    let z = 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);
    (x, y, z)
}

fn gamma(c: f64) -> f64 {
    let c = c.clamp(0.0, 1.0);
    if c <= 0.0031308 {
        12.92 * c
    } else {
        1.055 * pow(c, 1.0 / 2.4) - 0.055
    }
}

/// XYZ (Y = 1 is white) to gamma-encoded sRGB in 0 … 1 (negative channels cut, the brightest channel at most 1).
pub fn xyz_to_srgb(x: f64, y: f64, z: f64) -> [f64; 3] {
    let mut r = 3.2406 * x - 1.5372 * y - 0.4986 * z;
    let mut g = -0.9689 * x + 1.8758 * y + 0.0415 * z;
    let mut b = 0.0557 * x - 0.2040 * y + 1.0570 * z;
    // spectral colours lie outside the sRGB gamut: negative channels are cut to zero (display only)
    r = r.max(0.0);
    g = g.max(0.0);
    b = b.max(0.0);
    let hi = r.max(g).max(b);
    if hi > 1.0 {
        r /= hi;
        g /= hi;
        b /= hi;
    }
    [gamma(r), gamma(g), gamma(b)]
}

/// Display colour of a spectral line (nm), full brightness.
pub fn wavelength_rgb(l: f64) -> [f64; 3] {
    let (x, y, z) = cie(l);
    let m = x.max(y).max(z).max(1e-12);
    xyz_to_srgb(x / m, y / m, z / m)
}

/// Wavelengths of the white-light sum (nm).
pub fn white_wavelengths() -> Vec<f64> {
    (0..=80).map(|k| 380.0 + 5.0 * k as f64).collect()
}

/// Colours of white light filtered by a transmission (or reflection) function of λ at every sample: XYZ summed over
/// the spectrum, scaled so that the brightest sample has Y = `peak`.
pub fn white_colours(samples: usize, f: impl Fn(usize, f64) -> f64, peak: f64) -> Vec<[f64; 3]> {
    let ls = white_wavelengths();
    let cmf: Vec<(f64, f64, f64)> = ls.iter().map(|&l| cie(l)).collect();
    let yn: f64 = cmf.iter().map(|c| c.1).sum();
    let mut xyz = vec![(0.0, 0.0, 0.0); samples];
    let mut ymax = 0.0f64;
    for (s, out) in xyz.iter_mut().enumerate() {
        let (mut x, mut y, mut z) = (0.0, 0.0, 0.0);
        for (k, &l) in ls.iter().enumerate() {
            let w = f(s, l);
            x += w * cmf[k].0;
            y += w * cmf[k].1;
            z += w * cmf[k].2;
        }
        *out = (x / yn, y / yn, z / yn);
        ymax = ymax.max(y / yn);
    }
    let k = if peak > 0.0 && ymax > 0.0 { peak / ymax } else { 1.0 };
    // the equal-energy white (X = Y = Z) mapped to the white of sRGB (D65) by scaling X and Z
    xyz.iter().map(|&(x, y, z)| xyz_to_srgb(0.9505 * k * x, k * y, 1.089 * k * z)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn double_slit_fringes() {
        // d = 0.25 mm, λ = 600 nm, L = 2 m: Δx ≈ λL/d = 4.8 mm; maxima where d sinθ = mλ
        let (lam, d, l) = (600e-9, 0.25e-3, 2.0);
        let m = maxima(lam, d, l, 0.02);
        let x1 = m.iter().find(|(k, _)| *k == 1).unwrap().1;
        // exact position L·tanθ; the small-angle spacing λL/d differs by (λ/d)²/2 ≈ 3·10⁻⁶ here
        assert!((x1 - lam * l / d).abs() < 1e-5 * x1);
        let s1 = lam / d;
        assert!((x1 - l * s1 / (1.0 - s1 * s1).sqrt()).abs() < 1e-15);
        // the intensity of two narrow slits at a maximum is 1, half way between it is 0
        assert!((slits(x1, lam, 1e-9, d, 2, l) - 1.0).abs() < 1e-9);
        assert!(slits(0.5 * x1, lam, 1e-9, d, 2, l) < 1e-9);
        // a grating of N slits: the same maxima, N − 1 minima between them
        let n = 6;
        let mut zeros = 0;
        let mut prev = slits(0.0, lam, 1e-9, d, n, l);
        let steps = 6000;
        for k in 1..steps {
            let x = x1 * k as f64 / steps as f64;
            let v = slits(x, lam, 1e-9, d, n, l);
            if v < 1e-6 && prev >= 1e-6 {
                zeros += 1;
            }
            prev = v;
        }
        assert_eq!(zeros, n - 1);
    }

    #[test]
    fn single_slit_and_film_and_polarizers() {
        // single slit a = 0.1 mm: first minimum at sinθ = λ/a
        let (lam, a, l) = (500e-9, 0.1e-3, 1.0);
        let x = slit_minima(lam, a, l, 0.05)[0].1.abs();
        assert!(slits(x, lam, a, 0.0, 1, l) < 1e-20);
        // quarter-wave antireflection coating on glass: n₁ = √1.5, t = λ/(4n₁) → R = 0
        let n1 = 1.5f64.sqrt();
        assert!(film_reflectance(550e-9, 1.0, n1, 1.5, 550e-9 / (4.0 * n1)) < 1e-20);
        // bare glass: ((1 − 1.5)/(1 + 1.5))² = 4 %
        assert!((film_reflectance(550e-9, 1.0, 1.5, 1.5, 1e-7) - 0.04).abs() < 1e-15);
        // a thin soap film (n = 1.33 in air) is dark as t → 0 (the half-wave loss at the top surface)
        assert!(film_reflectance(550e-9, 1.0, 1.33, 1.0, 1e-12) < 1e-8);
        // Malus: unpolarized → ½, then cos² 45° → ¼; crossed polarizers → 0
        let p = polarizers(None, &[0.0, PI / 4.0, PI / 2.0]);
        assert!((p[0] - 0.5).abs() < 1e-15 && (p[1] - 0.25).abs() < 1e-15 && (p[2] - 0.125).abs() < 1e-15);
        assert!(polarizers(None, &[0.0, PI / 2.0])[1] < 1e-30);
    }

    #[test]
    fn colours() {
        // the white-light sum of a flat spectrum is (nearly) white; 650 nm is red, 450 nm blue
        let w = white_colours(1, |_, _| 1.0, 1.0)[0];
        assert!(w.iter().all(|c| *c > 0.9), "{w:?}");
        let r = wavelength_rgb(650.0);
        assert!(r[0] > 0.9 && r[1] < 0.6 && r[2] < 0.3, "{r:?}");
        let b = wavelength_rgb(450.0);
        assert!(b[2] > 0.9 && b[0] < 0.6, "{b:?}");
    }
}
