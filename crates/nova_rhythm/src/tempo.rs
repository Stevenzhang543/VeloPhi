//! Tempo map: beats to seconds and back across BPM changes (piecewise linear), with a binary search
//! so a lookup costs O(log n) however long the song is.

#[derive(Clone, Debug, PartialEq)]
pub struct TempoSegment {
    pub beat: f64,
    /// Seconds from beat 0 at the start of this segment.
    pub time: f64,
    pub bpm: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TempoMap {
    segments: Vec<TempoSegment>,
}

pub const MIN_BPM: f64 = 1.0;
pub const MAX_BPM: f64 = 10_000.0;

impl TempoMap {
    /// Builds the map from (beat, bpm) points. Points are sorted, invalid ones dropped, and the first
    /// tempo is extended back to beat 0 (and before it, for lead-ins). Empty input means 120 BPM.
    pub fn new(points: &[(f64, f64)]) -> TempoMap {
        let mut sorted: Vec<(f64, f64)> = points
            .iter()
            .copied()
            .filter(|(beat, bpm)| {
                beat.is_finite() && bpm.is_finite() && *bpm >= MIN_BPM && *bpm <= MAX_BPM
            })
            .collect();
        sorted.sort_by(|a, b| a.0.total_cmp(&b.0));
        sorted.dedup_by(|later, earlier| (later.0 - earlier.0).abs() < 1e-9);
        if sorted.is_empty() {
            sorted.push((0.0, 120.0));
        }
        if sorted[0].0 > 0.0 {
            let first_bpm = sorted[0].1;
            sorted.insert(0, (0.0, first_bpm));
        }
        let mut segments = Vec::with_capacity(sorted.len());
        let mut time = 0.0;
        for (index, (beat, bpm)) in sorted.iter().enumerate() {
            if index > 0 {
                let (previous_beat, previous_bpm) = sorted[index - 1];
                time += (beat - previous_beat) * 60.0 / previous_bpm;
            }
            segments.push(TempoSegment {
                beat: *beat,
                time,
                bpm: *bpm,
            });
        }
        // Segments that start before beat 0 keep their tempo; shift times so beat 0 is time 0.
        let zero = Self::time_in(&segments, 0.0);
        for segment in &mut segments {
            segment.time -= zero;
        }
        TempoMap { segments }
    }

    fn time_in(segments: &[TempoSegment], beat: f64) -> f64 {
        let index = match segments.binary_search_by(|s| s.beat.total_cmp(&beat)) {
            Ok(i) => i,
            Err(0) => 0,
            Err(i) => i - 1,
        };
        let s = &segments[index];
        s.time + (beat - s.beat) * 60.0 / s.bpm
    }

    pub fn segments(&self) -> &[TempoSegment] {
        &self.segments
    }

    /// Seconds from beat 0 to `beat` (negative before beat 0).
    pub fn beat_to_time(&self, beat: f64) -> f64 {
        if !beat.is_finite() {
            return 0.0;
        }
        Self::time_in(&self.segments, beat)
    }

    /// Beat at `time` seconds from beat 0.
    pub fn time_to_beat(&self, time: f64) -> f64 {
        if !time.is_finite() {
            return 0.0;
        }
        let index = match self.segments.binary_search_by(|s| s.time.total_cmp(&time)) {
            Ok(i) => i,
            Err(0) => 0,
            Err(i) => i - 1,
        };
        let s = &self.segments[index];
        s.beat + (time - s.time) * s.bpm / 60.0
    }

    pub fn bpm_at_time(&self, time: f64) -> f64 {
        let index = match self.segments.binary_search_by(|s| s.time.total_cmp(&time)) {
            Ok(i) => i,
            Err(0) => 0,
            Err(i) => i - 1,
        };
        self.segments[index].bpm
    }
}
