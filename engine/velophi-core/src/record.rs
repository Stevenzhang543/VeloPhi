//! Frame chunks, chunk summaries and fingerprints (port of `src/core/record/frames.ts` and `fingerprint.ts`).

use crate::js::{js_max, js_round};
use crate::sha256::Sha256;

/// One chunk of frames; only the first `count` frames are valid.
#[derive(Clone, Debug, PartialEq)]
pub struct FrameChunk {
    pub index: usize,
    pub first: u64,
    pub count: usize,
    /// Row-major states, `size` values per frame (capacity frames).
    pub states: Vec<f64>,
    pub segment: Vec<i32>,
    pub impact_loss: Vec<f64>,
}

impl FrameChunk {
    /// An empty chunk for `capacity` frames of `size` values.
    pub fn new(index: usize, first: u64, capacity: usize, size: usize) -> Self {
        FrameChunk { index, first, count: 0, states: vec![0.0; capacity * size], segment: vec![0; capacity], impact_loss: vec![0.0; capacity] }
    }

    /// Number of frames the chunk can hold.
    pub fn capacity(&self) -> usize {
        self.segment.len()
    }
}

/// Frames per chunk for output step `dt` and chunk length `seconds`.
pub fn frames_per_chunk(dt: f64, seconds: f64) -> usize {
    js_max(1.0, js_round(seconds / dt)) as usize
}

/// Summary of a chunk: min, max, first and last of every state component (4·size values).
pub fn chunk_summary(c: &FrameChunk, size: usize) -> Vec<f64> {
    let mut out = vec![0.0; 4 * size];
    let s = &c.states;
    let n = c.count;
    if n == 0 {
        return out;
    }
    for i in 0..size {
        let mut lo = s[i];
        let mut hi = s[i];
        for k in 1..n {
            let v = s[k * size + i];
            if v < lo {
                lo = v;
            }
            if v > hi {
                hi = v;
            }
        }
        out[i] = lo;
        out[size + i] = hi;
        out[2 * size + i] = s[i];
        out[3 * size + i] = s[(n - 1) * size + i];
    }
    out
}

/// Start of the chunk-digest chain (H₋₁).
pub const CHAIN_START: [u8; 32] = [0; 32];

/// Feed the time and post-event state of events into a hasher.
pub fn hash_events<'a>(hasher: &mut Sha256, events: impl Iterator<Item = (f64, &'a [f64])>) {
    for (t, after) in events {
        hasher.update_f64(&[t]);
        hasher.update_f64(after);
    }
}

/// Next link of the chain: H_c = SHA-256(H_{c−1} ‖ d_c).
pub fn chain_digest(prev: &[u8; 32], digest: &[u8; 32]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(prev);
    h.update(digest);
    h.digest()
}
