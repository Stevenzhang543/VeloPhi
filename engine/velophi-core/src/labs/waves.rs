//! Mechanical waves and sound (26.55, D93).
//!
//! - A string (or a chain of particles for longitudinal waves: the same equation) of length L with N points, wave
//!   speed c = √(T/μ) per point (two media possible), integrated with the leapfrog scheme
//!   μ·u_tt = T·u_xx (+ damping γ·u_t). The time step is Δx/c_max: where c = c_max the Courant number is 1 and the
//!   scheme reproduces d'Alembert's solution exactly at the grid points (no numerical dispersion).
//! - Ends: fixed (u = 0), free (u_x = 0, mirror point), driven (u = A·sin(2πft + φ) or a Gaussian pulse) and
//!   absorbing (first-order Mur condition; exact for outgoing waves at Courant number 1).
//! - Doppler effect: wave fronts of a moving source and the observed frequencies; sound: pitch (note and cents),
//!   wavelength and intensity level of a tone in air.

use crate::dmath::{cos, exp, log, sin};

/// End condition of the string.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum End {
    Fixed,
    Free,
    /// Driven end: amplitude, frequency (Hz), phase; `pulse` > 0: a single Gaussian pulse of that duration (s) centred
    /// at 2·pulse instead of a sine.
    Driven { amp: f64, freq: f64, phase: f64, pulse: f64 },
    Absorbing,
}

/// The string.
#[derive(Clone, Debug)]
pub struct StringSpec {
    pub n: usize,
    pub length: f64,
    /// Wave speed of the left part and of the right part (m/s), the boundary at `split`·L.
    pub c1: f64,
    pub c2: f64,
    pub split: f64,
    /// Damping rate γ (1/s).
    pub damping: f64,
    pub left: End,
    pub right: End,
}

impl StringSpec {
    pub fn dx(&self) -> f64 {
        self.length / (self.n - 1) as f64
    }
    pub fn dt(&self) -> f64 {
        self.dx() / self.c1.abs().max(self.c2.abs()).max(1e-300)
    }
    pub fn speed_at(&self, i: usize) -> f64 {
        let x = i as f64 * self.dx();
        if x < self.split * self.length {
            self.c1
        } else {
            self.c2
        }
    }
}

/// Displacements at the current and the previous time level.
#[derive(Clone, Debug)]
pub struct WaveState {
    pub t: f64,
    pub u: Vec<f64>,
    pub prev: Vec<f64>,
}

fn drive_value(e: End, t: f64) -> f64 {
    match e {
        End::Driven { amp, freq, phase, pulse } => {
            if pulse > 0.0 {
                let s = (t - 2.0 * pulse) / (0.5 * pulse);
                amp * exp(-s * s)
            } else {
                amp * sin(2.0 * std::f64::consts::PI * freq * t + phase)
            }
        }
        _ => 0.0,
    }
}

/// Start from a shape at rest: the first step is the half update (exact at Courant number 1).
pub fn at_rest(spec: &StringSpec, u: Vec<f64>, t0: f64) -> WaveState {
    let n = spec.n;
    let dt = spec.dt();
    let dx = spec.dx();
    let mut prev = u.clone();
    // u(−Δt) = u(Δt) for a state at rest: u(−Δt) = u + ½ r² Δ²u
    for i in 1..n - 1 {
        let r = spec.speed_at(i) * dt / dx;
        prev[i] = u[i] + 0.5 * r * r * (u[i + 1] - 2.0 * u[i] + u[i - 1]);
    }
    if spec.left == End::Free {
        let r = spec.speed_at(0) * dt / dx;
        prev[0] = u[0] + r * r * (u[1] - u[0]);
    }
    if spec.right == End::Free {
        let r = spec.speed_at(n - 1) * dt / dx;
        prev[n - 1] = u[n - 1] + r * r * (u[n - 2] - u[n - 1]);
    }
    WaveState { t: t0, u, prev }
}

/// One leapfrog step.
pub fn step(spec: &StringSpec, s: &mut WaveState, next: &mut Vec<f64>) {
    let n = spec.n;
    let dt = spec.dt();
    let dx = spec.dx();
    let g = 0.5 * spec.damping * dt;
    next.clear();
    next.resize(n, 0.0);
    for i in 1..n - 1 {
        let r = spec.speed_at(i) * dt / dx;
        next[i] = (2.0 * s.u[i] - (1.0 - g) * s.prev[i] + r * r * (s.u[i + 1] - 2.0 * s.u[i] + s.u[i - 1])) / (1.0 + g);
    }
    let t1 = s.t + dt;
    let end = |e: End, i: usize, j: usize, next: &mut Vec<f64>| {
        let r = spec.speed_at(i) * dt / dx;
        next[i] = match e {
            End::Fixed => 0.0,
            End::Free => (2.0 * s.u[i] - (1.0 - g) * s.prev[i] + 2.0 * r * r * (s.u[j] - s.u[i])) / (1.0 + g),
            End::Driven { .. } => drive_value(e, t1),
            End::Absorbing => s.u[j] + (r - 1.0) / (r + 1.0) * (next[j] - s.u[i]),
        };
    };
    end(spec.left, 0, 1, next);
    end(spec.right, n - 1, n - 2, next);
    std::mem::swap(&mut s.prev, &mut s.u);
    std::mem::swap(&mut s.u, next);
    s.t = t1;
}

/// Energy of the string per unit tension between the two stored time levels: ½Σ((uⁿ − uⁿ⁻¹)/(cΔt))²Δx +
/// ½Σ(∂uⁿ)(∂uⁿ⁻¹)Δx. On a uniform string with fixed or free ends and no damping this is exactly what the leapfrog
/// scheme conserves (to rounding).
pub fn energy(spec: &StringSpec, s: &WaveState) -> f64 {
    let dt = spec.dt();
    let dx = spec.dx();
    let mut e = 0.0;
    for i in 0..spec.n {
        let c = spec.speed_at(i);
        let v = (s.u[i] - s.prev[i]) / (c * dt);
        // the end points of a free end carry half a cell
        let w = if (i == 0 && spec.left == End::Free) || (i == spec.n - 1 && spec.right == End::Free) { 0.5 } else { 1.0 };
        e += 0.5 * w * v * v * dx;
    }
    for i in 0..spec.n - 1 {
        let d1 = (s.u[i + 1] - s.u[i]) / dx;
        let d0 = (s.prev[i + 1] - s.prev[i]) / dx;
        e += 0.5 * d1 * d0 * dx;
    }
    e
}

// ---- Doppler and sound ----

/// Observed frequency on the line through source and observer: f' = f·(c + v_o)/(c − v_s), velocities positive
/// towards the other; None when the source moves at or above the wave speed towards the observer.
pub fn doppler(f: f64, c: f64, v_source: f64, v_observer: f64) -> Option<f64> {
    if v_source >= c {
        None
    } else {
        Some(f * (c + v_observer) / (c - v_source))
    }
}

/// Wave fronts of a source that moved along x at speed v since t = 0 and emits at frequency f: (centre x, radius)
/// of the fronts emitted at t_k = k/f ≤ t.
pub fn fronts(f: f64, c: f64, v: f64, t: f64, max: usize) -> Vec<(f64, f64)> {
    let mut out = Vec::new();
    if f <= 0.0 {
        return out;
    }
    let count = ((t * f).floor() as usize + 1).min(max);
    let first = ((t * f).floor() as usize + 1).saturating_sub(count);
    for k in first..first + count {
        let te = k as f64 / f;
        out.push((v * te, c * (t - te)));
    }
    out
}

/// Note of a frequency in equal temperament (A4 = 440 Hz): (note index 0 = C … 11 = B, octave, cents off).
pub fn note(f: f64) -> (i32, i32, f64) {
    let semis = 12.0 * log(f / 440.0) / log(2.0);
    let k = semis.round();
    let cents = 100.0 * (semis - k);
    let midi = 69 + k as i32;
    (midi.rem_euclid(12), midi.div_euclid(12) - 1, cents)
}

/// Intensity (W/m²) and level (dB re 10⁻¹² W/m²) of a plane sound wave of displacement amplitude A in a medium of
/// density ρ and sound speed v: I = ½ρvω²A².
pub fn sound_level(f: f64, amp: f64, rho: f64, v: f64) -> (f64, f64) {
    let w = 2.0 * std::f64::consts::PI * f;
    let i = 0.5 * rho * v * w * w * amp * amp;
    (i, 10.0 * log(i / 1e-12) / log(10.0))
}

/// Exact displacement of mode n of a string fixed at both ends, released at rest from amplitude 1.
pub fn mode_shape(spec: &StringSpec, n: usize, t: f64) -> Vec<f64> {
    let k = n as f64 * std::f64::consts::PI / spec.length;
    let w = spec.c1 * k;
    (0..spec.n).map(|i| sin(k * i as f64 * spec.dx()) * cos(w * t)).collect()
}

/// Frequency of mode n of a string with both ends fixed (or both free): f = n·c/(2L).
pub fn mode_frequency(c: f64, length: f64, n: usize) -> f64 {
    n as f64 * c / (2.0 * length)
}

/// Wave speed of a string of tension T (N) and linear density μ (kg/m).
pub fn string_speed(tension: f64, mu: f64) -> f64 {
    (tension / mu).sqrt()
}

/// Level of an intensity ratio (dB).
pub fn db(ratio: f64) -> f64 {
    10.0 * log(ratio) / log(10.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(n: usize, left: End, right: End) -> StringSpec {
        StringSpec { n, length: 2.0, c1: 10.0, c2: 10.0, split: 1.0, damping: 0.0, left, right }
    }

    #[test]
    fn standing_mode_is_exact_and_has_its_frequency() {
        let sp = spec(201, End::Fixed, End::Fixed);
        for n in [1usize, 3, 7] {
            let mut s = at_rest(&sp, mode_shape(&sp, n, 0.0), 0.0);
            let mut buf = Vec::new();
            let steps = 1234;
            for _ in 0..steps {
                step(&sp, &mut s, &mut buf);
            }
            let exact = mode_shape(&sp, n, s.t);
            let worst = s.u.iter().zip(exact.iter()).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max);
            assert!(worst < 1e-11, "mode {n}: {worst}");
        }
        // nodes of mode 3 at L/3 and 2L/3; f₃ = 3c/(2L) = 7.5 Hz
        assert!((mode_frequency(10.0, 2.0, 3) - 7.5).abs() < 1e-15);
        assert!((string_speed(40.0, 0.4) - 10.0).abs() < 1e-15);
    }

    #[test]
    fn pulse_travels_at_c_and_reflects() {
        // a pulse driven into a string with an absorbing far end leaves without reflection; with a fixed end it
        // comes back inverted
        for (right, sign) in [(End::Fixed, -1.0), (End::Free, 1.0)] {
            let sp = StringSpec { n: 401, length: 4.0, c1: 2.0, c2: 2.0, split: 1.0, damping: 0.0, left: End::Driven { amp: 0.1, freq: 0.0, phase: 0.0, pulse: 0.1 }, right };
            let mut s = at_rest(&sp, vec![0.0; 401], 0.0);
            let mut buf = Vec::new();
            // the pulse peaks at the left end at t = 0.2 s, reaches the right end at 2.2 s and is back at x = 2 at 3.2 s
            while s.t < 3.2 - 1e-12 {
                step(&sp, &mut s, &mut buf);
            }
            let (imax, _) = s.u.iter().enumerate().fold((0, 0.0f64), |b, (i, v)| if v.abs() > b.1 { (i, v.abs()) } else { b });
            assert!((imax as f64 * sp.dx() - 2.0).abs() <= 2.0 * sp.dx(), "peak at {}", imax as f64 * sp.dx());
            assert!((s.u[imax] - sign * 0.1).abs() < 2e-3, "{}", s.u[imax]);
        }
        let sp = StringSpec { n: 401, length: 4.0, c1: 2.0, c2: 2.0, split: 1.0, damping: 0.0, left: End::Driven { amp: 0.1, freq: 0.0, phase: 0.0, pulse: 0.1 }, right: End::Absorbing };
        let mut s = at_rest(&sp, vec![0.0; 401], 0.0);
        let mut buf = Vec::new();
        while s.t < 3.2 {
            step(&sp, &mut s, &mut buf);
        }
        assert!(s.u.iter().fold(0.0f64, |m, v| m.max(v.abs())) < 1e-9, "absorbed");
    }

    #[test]
    fn energy_is_kept_on_a_fixed_string() {
        let sp = spec(301, End::Fixed, End::Fixed);
        let shape: Vec<f64> = (0..301).map(|i| { let x = i as f64 * sp.dx(); 0.05 * exp(-((x - 0.7) / 0.1).powi(2)) }).collect();
        let mut s = at_rest(&sp, shape, 0.0);
        let mut buf = Vec::new();
        for _ in 0..10 {
            step(&sp, &mut s, &mut buf);
        }
        let e0 = energy(&sp, &s);
        for _ in 0..5000 {
            step(&sp, &mut s, &mut buf);
        }
        assert!((energy(&sp, &s) - e0).abs() < 1e-12 * e0, "{} vs {e0}", energy(&sp, &s));
    }

    #[test]
    fn doppler_and_notes() {
        assert!((doppler(440.0, 340.0, 34.0, 0.0).unwrap() - 440.0 * 340.0 / 306.0).abs() < 1e-12);
        assert!(doppler(440.0, 340.0, 340.0, 0.0).is_none());
        assert_eq!(note(440.0).0, 9);
        assert_eq!(note(440.0).1, 4);
        assert!(note(261.6255653005986).2.abs() < 1e-9, "middle C");
        let (i, l) = sound_level(1000.0, 1.1e-11, 1.2, 343.0);
        assert!(i > 0.0 && (l - 0.0).abs() < 1.5);
        let f = fronts(10.0, 340.0, 100.0, 0.25, 100);
        assert_eq!(f.len(), 3);
        assert!((f[0].1 - 340.0 * 0.25).abs() < 1e-12 && f[2].0 == 100.0 * 0.2);
    }
}
