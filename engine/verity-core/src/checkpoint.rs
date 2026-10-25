//! Checkpoints of a streaming run (port of `src/core/solver/checkpoint.ts` and `codec.ts`). The layout is part
//! of the engine contract (docs/dev/STREAMING.md §4): a checkpoint written by either engine resumes in the other.

use crate::dynamics::{Friction, Mode, UnitMode};

/// Version of the checkpoint layout.
pub const CHECKPOINT_FORMAT: f64 = 1.0;
/// Values before X.
pub const CHECKPOINT_HEADER: usize = 26;

/// The open segment as stored in a checkpoint.
#[derive(Clone, Debug, PartialEq)]
pub struct CheckpointSegment {
    pub index: f64,
    pub t0: f64,
    pub impact_loss: f64,
    pub reduced: bool,
    pub x0: Vec<f64>,
}

/// Solver statistics stored in a checkpoint.
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct CheckpointStats {
    pub steps: f64,
    pub rejected: f64,
    pub events: f64,
    pub locate_iterations: f64,
    pub ambiguous_modes: f64,
}

/// A checkpoint as plain data.
#[derive(Clone, Debug, PartialEq)]
pub struct Checkpoint {
    pub chunk: f64,
    pub k: f64,
    pub t: f64,
    pub h: f64,
    pub impact_loss: f64,
    pub last_event_t: f64,
    pub events_at_instant: f64,
    pub reduced_from: Option<f64>,
    pub k_stop: f64,
    pub event_count: f64,
    pub frame_segment: f64,
    pub segment: CheckpointSegment,
    pub stats: CheckpointStats,
    pub projection: (f64, f64),
    pub x: Vec<f64>,
    pub k1: Vec<f64>,
    pub mode: Mode,
    pub thresholds: Vec<f64>,
    pub starts: Vec<f64>,
    pub recent_events: Vec<f64>,
    pub toggles: Vec<(f64, Vec<f64>)>,
}

/// Mode flattened as in `encodeMode` (pair and features as indices).
pub fn encode_mode_into(m: &Mode, out: &mut Vec<f64>) {
    out.push(m.units.len() as f64);
    for u in &m.units {
        out.push(u.pair as f64);
        out.push(u.ref_ as f64);
        out.push(u.friction.code() as f64);
        out.push(u.s);
        out.push(u.points.len() as f64);
        out.extend(u.points.iter().map(|&p| p as f64));
        out.push(u.open.len() as f64);
        out.extend(u.open.iter().map(|&p| p as f64));
    }
    out.push(m.taut.len() as f64);
    out.extend(m.taut.iter().map(|&b| if b { 1.0 } else { 0.0 }));
    match &m.sw {
        Some(sw) => {
            out.push(sw.len() as f64);
            out.extend(sw.iter().map(|&b| b as f64));
        }
        None => out.push(-1.0),
    }
}

/// Serialize a checkpoint.
pub fn encode_checkpoint(cp: &Checkpoint) -> Vec<f64> {
    let n = cp.x.len();
    let mut out = Vec::with_capacity(CHECKPOINT_HEADER + 3 * n + 64);
    out.extend_from_slice(&[
        CHECKPOINT_FORMAT,
        0.0,
        n as f64,
        cp.chunk,
        cp.k,
        cp.t,
        cp.h,
        cp.impact_loss,
        cp.last_event_t,
        cp.events_at_instant,
        if cp.reduced_from.is_none() { 0.0 } else { 1.0 },
        cp.reduced_from.unwrap_or(0.0),
        cp.k_stop,
        cp.event_count,
        cp.segment.index,
        cp.segment.t0,
        cp.segment.impact_loss,
        if cp.segment.reduced { 1.0 } else { 0.0 },
        cp.stats.steps,
        cp.stats.rejected,
        cp.stats.events,
        cp.stats.locate_iterations,
        cp.stats.ambiguous_modes,
        cp.projection.0,
        cp.projection.1,
        cp.frame_segment,
    ]);
    out.extend_from_slice(&cp.x);
    out.extend_from_slice(&cp.k1);
    out.extend_from_slice(&cp.segment.x0);
    encode_mode_into(&cp.mode, &mut out);
    out.push(cp.thresholds.len() as f64);
    out.extend_from_slice(&cp.thresholds);
    out.extend_from_slice(&cp.starts);
    out.push(cp.recent_events.len() as f64);
    out.extend_from_slice(&cp.recent_events);
    out.push(cp.toggles.len() as f64);
    for (index, times) in &cp.toggles {
        out.push(*index);
        out.push(times.len() as f64);
        out.extend_from_slice(times);
    }
    out[1] = out.len() as f64;
    out
}

/// Error of decode_checkpoint.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CheckpointError(pub &'static str);

struct Reader<'a> {
    d: &'a [f64],
    o: usize,
}

impl Reader<'_> {
    fn next(&mut self) -> Result<f64, CheckpointError> {
        let v = *self.d.get(self.o).ok_or(CheckpointError("checkpoint: length mismatch"))?;
        self.o += 1;
        Ok(v)
    }
    fn count(&mut self) -> Result<usize, CheckpointError> {
        let v = self.next()?;
        if !(v >= 0.0 && v.fract() == 0.0 && v <= self.d.len() as f64) {
            return Err(CheckpointError("checkpoint: bad count"));
        }
        Ok(v as usize)
    }
    fn take(&mut self, n: usize) -> Result<Vec<f64>, CheckpointError> {
        if self.o + n > self.d.len() {
            return Err(CheckpointError("checkpoint: length mismatch"));
        }
        let v = self.d[self.o..self.o + n].to_vec();
        self.o += n;
        Ok(v)
    }
}

/// Read a checkpoint written by encode_checkpoint (an error on a malformed buffer).
pub fn decode_checkpoint(d: &[f64]) -> Result<Checkpoint, CheckpointError> {
    if d.len() < CHECKPOINT_HEADER || d[0] != CHECKPOINT_FORMAT || d[1] != d.len() as f64 {
        return Err(CheckpointError("checkpoint: unknown format"));
    }
    let mut r = Reader { d, o: CHECKPOINT_HEADER };
    let n = {
        let v = d[2];
        if !(v >= 0.0 && v.fract() == 0.0) {
            return Err(CheckpointError("checkpoint: bad count"));
        }
        v as usize
    };
    let x = r.take(n)?;
    let k1 = r.take(n)?;
    let x0 = r.take(n)?;
    let nu = r.count()?;
    let mut units = Vec::with_capacity(nu);
    for _ in 0..nu {
        let pair = r.count()?;
        let ref_ = r.count()?;
        let friction = Friction::from_code(r.next()?);
        let s = r.next()?;
        let np = r.count()?;
        let mut points = Vec::with_capacity(np);
        for _ in 0..np {
            points.push(r.count()?);
        }
        let no = r.count()?;
        let mut open = Vec::with_capacity(no);
        for _ in 0..no {
            open.push(r.count()?);
        }
        units.push(UnitMode { pair, ref_, points, open, friction, s });
    }
    let nr = r.count()?;
    let taut = r.take(nr)?.into_iter().map(|v| v != 0.0).collect();
    let w = r.next()?;
    let sw = if w >= 0.0 {
        let nw = w as usize;
        Some(r.take(nw)?.into_iter().map(|v| v as i8).collect())
    } else {
        None
    };
    let mode = Mode { units, taut, sw };
    let m = r.count()?;
    let thresholds = r.take(m)?;
    let starts = r.take(m)?;
    let re = r.count()?;
    let recent_events = r.take(re)?;
    let nt = r.count()?;
    let mut toggles = Vec::with_capacity(nt);
    for _ in 0..nt {
        let index = r.next()?;
        let k = r.count()?;
        toggles.push((index, r.take(k)?));
    }
    if r.o != d.len() {
        return Err(CheckpointError("checkpoint: length mismatch"));
    }
    Ok(Checkpoint {
        chunk: d[3],
        k: d[4],
        t: d[5],
        h: d[6],
        impact_loss: d[7],
        last_event_t: d[8],
        events_at_instant: d[9],
        reduced_from: if d[10] != 0.0 { Some(d[11]) } else { None },
        k_stop: d[12],
        event_count: d[13],
        frame_segment: d[25],
        segment: CheckpointSegment { index: d[14], t0: d[15], impact_loss: d[16], reduced: d[17] != 0.0, x0 },
        stats: CheckpointStats { steps: d[18], rejected: d[19], events: d[20], locate_iterations: d[21], ambiguous_modes: d[22] },
        projection: (d[23], d[24]),
        x,
        k1,
        mode,
        thresholds,
        starts,
        recent_events,
        toggles,
    })
}

/// State X (frame chunk·F) of a serialized checkpoint.
pub fn checkpoint_state(d: &[f64]) -> &[f64] {
    &d[CHECKPOINT_HEADER..CHECKPOINT_HEADER + d[2] as usize]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let cp = Checkpoint {
            chunk: 2.0,
            k: 1200.0,
            t: 2.0,
            h: 0.001,
            impact_loss: 0.5,
            last_event_t: 1.5,
            events_at_instant: 0.0,
            reduced_from: None,
            k_stop: f64::INFINITY,
            event_count: 3.0,
            frame_segment: 2.0,
            segment: CheckpointSegment { index: 2.0, t0: 1.5, impact_loss: 0.5, reduced: false, x0: vec![1.0, 2.0] },
            stats: CheckpointStats { steps: 10.0, rejected: 1.0, events: 3.0, locate_iterations: 30.0, ambiguous_modes: 0.0 },
            projection: (1e-13, 0.0),
            x: vec![3.0, 4.0],
            k1: vec![5.0, 6.0],
            mode: Mode {
                units: vec![UnitMode { pair: 1, ref_: 2, points: vec![2, 3], open: vec![], friction: Friction::Slide, s: -1.0 }],
                taut: vec![true],
                sw: Some(vec![1, -1, 0]),
            },
            thresholds: vec![-1e-9, 0.0],
            starts: vec![0.0, 1.0],
            recent_events: vec![1.5],
            toggles: vec![(0.0, vec![1.0, 1.5])],
        };
        let enc = encode_checkpoint(&cp);
        assert_eq!(enc[1], enc.len() as f64);
        let dec = decode_checkpoint(&enc).unwrap();
        assert_eq!(dec, cp);
        assert_eq!(encode_checkpoint(&dec), enc);
    }
}
