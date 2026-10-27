//! Radioactive decay (26.54, D83): N₀ nuclei, each decaying in a step of length Δt with probability
//! p = 1 − 2^(−Δt/T½). The step in which a nucleus decays is drawn directly from the geometric distribution (the
//! same law as one draw per nucleus and step, but O(N₀)). The random numbers are a fixed generator (SplitMix64) and
//! the logarithm is `dmath::log`, so a seed gives the same sequence on every platform.

use crate::dmath::{log, pow};

/// SplitMix64 generator.
#[derive(Clone, Debug)]
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Rng {
        Rng(seed)
    }
    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    /// Uniform in (0, 1].
    pub fn uniform(&mut self) -> f64 {
        ((self.next_u64() >> 11) as f64 + 1.0) / 9007199254740992.0
    }
}

/// A decay experiment.
#[derive(Clone, Debug, Default)]
pub struct DecayRun {
    /// Step (1-based) in which each nucleus decays; 0: still undecayed after the last step.
    pub step_of: Vec<u32>,
    /// Undecayed nuclei after each step (index 0: N₀).
    pub counts: Vec<u32>,
    /// N₀·2^(−t/T½) at the same times.
    pub theory: Vec<f64>,
    /// First time at which N ≤ N₀/2, N₀/4, N₀/8 (None when not reached).
    pub halvings: [Option<f64>; 3],
    /// Decay probability per step.
    pub p: f64,
}

/// Run the experiment: n0 nuclei, half-life T½, step Δt, number of steps, seed.
pub fn decay(n0: u32, half_life: f64, dt: f64, steps: u32, seed: u64) -> DecayRun {
    let p = if half_life > 0.0 { 1.0 - pow(2.0, -dt / half_life) } else { 1.0 };
    let mut rng = Rng::new(seed);
    let ln_q = if p < 1.0 { log(1.0 - p) } else { f64::NEG_INFINITY };
    let mut step_of = Vec::with_capacity(n0 as usize);
    let mut decayed_in = vec![0u32; steps as usize + 2];
    for _ in 0..n0 {
        let u = rng.uniform();
        // geometric: P(k) = (1 − p)^(k − 1)·p, k = ⌈ln U / ln(1 − p)⌉ (k ≥ 1)
        let k = if p >= 1.0 {
            1.0
        } else if p <= 0.0 {
            f64::INFINITY
        } else {
            (log(u) / ln_q).ceil().max(1.0)
        };
        let k = if k <= steps as f64 { k as u32 } else { 0 };
        step_of.push(k);
        if k > 0 {
            decayed_in[k as usize] += 1;
        }
    }
    let mut counts = Vec::with_capacity(steps as usize + 1);
    let mut theory = Vec::with_capacity(steps as usize + 1);
    let mut n = n0;
    let mut halvings = [None; 3];
    for s in 0..=steps {
        if s > 0 {
            n -= decayed_in[s as usize];
        }
        counts.push(n);
        let t = s as f64 * dt;
        theory.push(n0 as f64 * pow(2.0, -t / half_life));
        for (j, h) in halvings.iter_mut().enumerate() {
            if h.is_none() && (n as f64) <= n0 as f64 / (2u32 << j) as f64 {
                *h = Some(t);
            }
        }
    }
    DecayRun { step_of, counts, theory, halvings, p }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_sequence() {
        let a = decay(1000, 2.0, 0.1, 100, 7);
        let b = decay(1000, 2.0, 0.1, 100, 7);
        assert_eq!(a.step_of, b.step_of);
        assert_ne!(a.step_of, decay(1000, 2.0, 0.1, 100, 8).step_of);
        assert_eq!(a.counts[0], 1000);
        assert!(a.counts.windows(2).all(|w| w[1] <= w[0]));
    }

    #[test]
    fn counts_follow_the_law_within_three_sigma() {
        // at t = T½, 2T½, 3T½ over many seeds: mean within 3σ/√runs of the expectation
        let (n0, th, dt) = (2000u32, 1.0, 0.05);
        let runs = 200;
        for (k, step) in [(1, 20usize), (2, 40), (3, 60)] {
            let ps = pow(2.0, -(k as f64));
            let mut sum = 0.0;
            for seed in 0..runs {
                sum += decay(n0, th, dt, 60, seed).counts[step] as f64;
            }
            let mean = sum / runs as f64;
            let expect = n0 as f64 * ps;
            let sigma = (n0 as f64 * ps * (1.0 - ps)).sqrt() / (runs as f64).sqrt();
            assert!((mean - expect).abs() < 3.0 * sigma, "t = {k}T½: {mean} vs {expect} ± {sigma}");
        }
        // one run of many nuclei halves near T½
        let r = decay(100000, 1.0, 0.01, 400, 3);
        let h = r.halvings[0].unwrap();
        assert!((h - 1.0).abs() < 0.03, "first halving at {h}");
        assert!((r.theory[100] - 50000.0).abs() < 1e-9);
    }
}
