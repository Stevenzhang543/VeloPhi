//! Transport of recordings (port of `src/core/solver/transport.ts`, worker side): one delta per closed chunk
//! plus tail deltas, encoded as a self-describing binary container (layout in engine/ABI.md):
//!
//! ```text
//! "VRD1" | u32 LE json length | JSON (UTF-8) | zero padding to 8 bytes | blob section
//! ```
//!
//! The JSON is the `RecordingDelta` of transport.ts; every typed array is a reference `{"$f64": [byteOffset,
//! length]}` (or `$i32`, `$u8`) into the blob section, every non-finite number is `{"$num": "Infinity"}`.

use serde_json::{json, Map, Value};

use crate::dynamics::{Mode, System};
use crate::events::EventType;
use crate::impact::{ImpactKind, ImpactResult};
use crate::js::js_min;
use crate::message::num_json;
use crate::sha256::to_hex;
use crate::simulation::{ChangeDetail, ClosedChunk, Segment, SimEvent, SimStats, SimulationRun};

/// Magic of the container.
pub const MAGIC: &[u8; 4] = b"VRD1";

/// Builds the blob section of a container.
#[derive(Default)]
pub struct Blob {
    bytes: Vec<u8>,
}

impl Blob {
    fn align(&mut self) {
        while !self.bytes.len().is_multiple_of(8) {
            self.bytes.push(0);
        }
    }

    /// Append doubles (little-endian); returns the reference.
    pub fn f64s(&mut self, data: &[f64]) -> Value {
        self.align();
        let off = self.bytes.len();
        self.bytes.reserve(data.len() * 8);
        for v in data {
            self.bytes.extend_from_slice(&v.to_le_bytes());
        }
        json!({ "$f64": [off, data.len()] })
    }

    /// Append 32-bit integers; returns the reference.
    pub fn i32s(&mut self, data: &[i32]) -> Value {
        self.align();
        let off = self.bytes.len();
        for v in data {
            self.bytes.extend_from_slice(&v.to_le_bytes());
        }
        json!({ "$i32": [off, data.len()] })
    }

    /// Append bytes; returns the reference.
    pub fn u8s(&mut self, data: &[u8]) -> Value {
        self.align();
        let off = self.bytes.len();
        self.bytes.extend_from_slice(data);
        json!({ "$u8": [off, data.len()] })
    }

    /// The container: magic, JSON length, JSON, padding, blob.
    pub fn finish(mut self, doc: &Value) -> Vec<u8> {
        self.align();
        let text = serde_json::to_string(doc).expect("JSON of plain values");
        let mut out = Vec::with_capacity(16 + text.len() + self.bytes.len());
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&(text.len() as u32).to_le_bytes());
        out.extend_from_slice(text.as_bytes());
        while out.len() % 8 != 0 {
            out.push(b' ');
        }
        out.extend_from_slice(&self.bytes);
        out
    }
}

/// A number as JSON; non-finite values become `{"$num": "Infinity" | "-Infinity" | "NaN"}`.
pub fn jnum(v: f64) -> Value {
    if v.is_finite() {
        num_json(v)
    } else {
        json!({ "$num": num_json(v) })
    }
}

/// Mode as plain data (EncodedMode).
pub fn mode_json(m: &Mode) -> Value {
    let units: Vec<Value> = m
        .units
        .iter()
        .map(|u| json!({ "pair": u.pair, "ref": u.ref_, "points": u.points, "open": u.open, "friction": u.friction.code(), "s": jnum(u.s) }))
        .collect();
    let mut o = Map::new();
    o.insert("units".into(), Value::Array(units));
    o.insert("taut".into(), json!(m.taut));
    if let Some(sw) = &m.sw {
        o.insert("sw".into(), json!(sw));
    }
    Value::Object(o)
}

/// Segment as plain data, t1 clipped to `t1_max`.
pub fn segment_json(s: &Segment, t1_max: f64, blob: &mut Blob) -> Value {
    let mut o = Map::new();
    o.insert("index".into(), json!(s.index));
    o.insert("t0".into(), jnum(s.t0));
    o.insert("t1".into(), jnum(js_min(s.t1, t1_max)));
    o.insert("mode".into(), mode_json(&s.mode));
    o.insert("X0".into(), blob.f64s(&s.x0));
    o.insert("label".into(), json!(s.label));
    o.insert("impactLoss".into(), jnum(s.impact_loss));
    if s.reduced {
        o.insert("reduced".into(), json!(true));
    }
    Value::Object(o)
}

/// A number of a change detail as the TypeScript transport writes it: changes are deep-copied through JSON there,
/// so −0 becomes 0 and non-finite values become null.
fn cnum(v: f64) -> Value {
    if !v.is_finite() {
        Value::Null
    } else if v == 0.0 {
        json!(0.0)
    } else {
        num_json(v)
    }
}

/// Change detail as plain data.
pub fn change_json(c: &ChangeDetail) -> Value {
    let mut o = Map::new();
    o.insert("type".into(), json!(c.kind().name()));
    o.insert("subject".into(), json!(c.subject));
    o.insert("bodies".into(), json!(c.bodies));
    let mut opt = |k: &str, v: Option<f64>| {
        if let Some(v) = v {
            o.insert(k.into(), cnum(v));
        }
    };
    opt("impulse", c.impulse);
    opt("vnBefore", c.vn_before);
    opt("vnAfter", c.vn_after);
    opt("restitution", c.restitution);
    if let Some((x, y)) = c.point {
        o.insert("point".into(), json!({ "x": cnum(x), "y": cnum(y) }));
    }
    if let Some((x, y)) = c.normal {
        o.insert("normal".into(), json!({ "x": cnum(x), "y": cnum(y) }));
    }
    let mut opt = |k: &str, v: Option<f64>| {
        if let Some(v) = v {
            o.insert(k.into(), cnum(v));
        }
    };
    opt("tangentImpulse", c.tangent_impulse);
    opt("vtBefore", c.vt_before);
    opt("vtAfter", c.vt_after);
    if let Some(i) = c.switch_index {
        o.insert("switchIndex".into(), json!(i));
    }
    if let Some(b) = c.branch {
        o.insert("branch".into(), json!(b));
    }
    if let Some(k) = c.kink {
        o.insert("kink".into(), json!(k));
    }
    Value::Object(o)
}

fn impact_json(sys: &System, imp: &ImpactResult, blob: &mut Blob) -> Value {
    let points: Vec<Value> = imp
        .points
        .iter()
        .map(|p| {
            let mut o = Map::new();
            o.insert("kind".into(), json!(if p.kind == ImpactKind::Contact { "contact" } else { "rope" }));
            o.insert("pair".into(), json!(p.pair.map(|x| x as i64).unwrap_or(-1)));
            o.insert(
                "feature".into(),
                json!(match (p.pair, p.feature) {
                    (Some(_), Some(f)) => f as i64,
                    _ => -1,
                }),
            );
            o.insert("rope".into(), json!(p.rope));
            o.insert("vnBefore".into(), jnum(p.vn_before));
            o.insert("vnAfter".into(), jnum(p.vn_after));
            o.insert("impulse".into(), jnum(p.impulse));
            o.insert("restitution".into(), jnum(p.restitution));
            o.insert("cx".into(), jnum(p.cx));
            o.insert("cy".into(), jnum(p.cy));
            o.insert("nx".into(), jnum(p.nx));
            o.insert("ny".into(), jnum(p.ny));
            if let Some(v) = p.tangent_impulse {
                o.insert("tangentImpulse".into(), jnum(v));
            }
            if let Some(v) = p.vt_before {
                o.insert("vtBefore".into(), jnum(v));
            }
            if let Some(v) = p.vt_after {
                o.insert("vtAfter".into(), jnum(v));
            }
            if let Some(f) = p.friction {
                o.insert("friction".into(), json!(f));
            }
            Value::Object(o)
        })
        .collect();
    let _ = sys;
    let mut o = Map::new();
    o.insert("X".into(), blob.f64s(&imp.x));
    o.insert("points".into(), Value::Array(points));
    o.insert("energyBefore".into(), jnum(imp.energy_before));
    o.insert("energyAfter".into(), jnum(imp.energy_after));
    o.insert("loss".into(), jnum(imp.loss));
    if let Some(w) = &imp.warning {
        o.insert("warning".into(), w.to_json());
    }
    Value::Object(o)
}

/// Event as plain data.
pub fn event_json(sys: &System, e: &SimEvent, blob: &mut Blob) -> Value {
    let triggers: Vec<&str> = e.triggers.iter().map(|t: &EventType| t.name()).collect();
    json!({
        "index": e.index,
        "t": jnum(e.t),
        "triggers": triggers,
        "changes": e.changes.iter().map(change_json).collect::<Vec<_>>(),
        "before": blob.f64s(&e.before),
        "after": blob.f64s(&e.after),
        "impact": match &e.impact { Some(i) => impact_json(sys, i, blob), None => Value::Null },
        "segment": e.segment,
    })
}

/// Solver statistics as plain data (wallMs is the interface's business: 0).
pub fn stats_json(s: &SimStats) -> Value {
    json!({
        "steps": s.steps, "rejected": s.rejected, "events": s.events, "locateIterations": s.locate_iterations,
        "maxPositionCorrection": jnum(s.max_position_correction), "maxVelocityCorrection": jnum(s.max_velocity_correction),
        "ambiguousModes": s.ambiguous_modes, "wallMs": 0
    })
}

/// ChunkInfo as plain data.
pub fn chunk_info_json(c: &ClosedChunk, blob: &mut Blob) -> Value {
    json!({
        "chunk": c.chunk, "first": c.first, "frames": c.frames, "eventsFrom": c.events_from, "eventsTo": c.events_to,
        "digest": blob.u8s(&c.digest), "rolling": blob.u8s(&c.rolling), "summary": blob.f64s(&c.summary), "t": jnum(c.t),
        "digestHex": to_hex(&c.digest), "rollingHex": to_hex(&c.rolling)
    })
}

/// End of a run as plain data (RecordingEnd).
pub fn end_json(run: &SimulationRun) -> Value {
    json!({
        "completed": run.completed(),
        "error": match &run.error { Some(m) => m.to_json(), None => Value::Null },
        "hash": run.hash,
        "stopReason": run.stop_reason.map(|r| r.name()),
    })
}

/// Collects the deltas of a run (DeltaWriter of transport.ts); with `release`, posted chunks, checkpoints,
/// segments and events are dropped from the run.
pub struct DeltaWriter {
    frames: u64,
    segments: usize,
    events: usize,
    checkpoints: usize,
    closed: usize,
    release: bool,
    /// The final delta of an ended run has been produced.
    ended: bool,
}

impl DeltaWriter {
    /// A writer for a fresh run.
    pub fn new(release: bool) -> Self {
        DeltaWriter { frames: 0, segments: 0, events: 0, checkpoints: 0, closed: 0, release, ended: false }
    }

    /// One delta per chunk closed since the previous call, then — when `tail` is set or the run has ended —
    /// one more with everything else computed so far. Each delta is an encoded container. Once the final delta of
    /// an ended run has been returned, nothing more is.
    pub fn next(&mut self, run: &mut SimulationRun, tail: bool) -> Vec<Vec<u8>> {
        let mut out = Vec::new();
        if self.ended {
            return out;
        }
        while self.closed < run.closed.len() {
            let c = run.closed[self.closed].clone();
            self.closed += 1;
            out.push(self.chunk_delta(run, &c));
        }
        if tail || run.finished {
            if let Some(d) = self.rest_delta(run) {
                out.push(d);
            }
            // After the run has ended there is exactly one final delta (the 'done' message of the worker)
            self.ended = run.finished;
        }
        if self.release && !run.finished {
            run.forget(self.segments.saturating_sub(1), self.events);
        }
        out
    }

    #[allow(clippy::too_many_arguments)]
    fn common(
        &mut self,
        run: &mut SimulationRun,
        blob: &mut Blob,
        frames_to: u64,
        segments_to: usize,
        events_to: usize,
        cp_to: usize,
        t_end: f64,
    ) -> Map<String, Value> {
        let sys = run.system.clone();
        let segments_to = segments_to.max(self.segments);
        let events_to = events_to.max(self.events);
        let seg_from = self.segments.saturating_sub(1);
        let seg_start = seg_from.saturating_sub(run.segment_base());
        let segs: Vec<Value> = run.segments.iter().skip(seg_start).take(segments_to - seg_from).map(|s| segment_json(s, t_end, blob)).collect();
        let ev_start = self.events.saturating_sub(run.event_base());
        let events: Vec<Value> = run.events.iter().skip(ev_start).take(events_to - self.events).map(|e| event_json(&sys, e, blob)).collect();
        let mut checkpoints = Vec::new();
        while self.checkpoints < cp_to {
            let i = self.checkpoints;
            self.checkpoints += 1;
            let Some(Some(data)) = run.checkpoints.get(i) else { continue };
            checkpoints.push(json!({ "chunk": i, "data": blob.f64s(data) }));
            if self.release {
                run.checkpoints[i] = None;
            }
        }
        let mut o = Map::new();
        o.insert("segmentsFrom".into(), json!(seg_from));
        o.insert("segments".into(), Value::Array(segs));
        o.insert("eventsFrom".into(), json!(self.events));
        o.insert("events".into(), Value::Array(events));
        o.insert("checkpoints".into(), Value::Array(checkpoints));
        o.insert("warnings".into(), Value::Array(run.warnings.iter().map(|w| w.to_json()).collect()));
        o.insert("stats".into(), stats_json(&run.stats));
        o.insert("t".into(), jnum(t_end));
        o.insert("T".into(), jnum(run.t_end));
        o.insert(
            "reducedFrom".into(),
            match run.reduced_from {
                Some(v) => jnum(v),
                None => Value::Null,
            },
        );
        self.segments = segments_to;
        self.events = events_to;
        self.frames = self.frames.max(frames_to);
        o
    }

    fn chunk_delta(&mut self, run: &mut SimulationRun, c: &ClosedChunk) -> Vec<u8> {
        let size = run.size;
        let mut blob = Blob::default();
        let from = self.frames;
        let to = c.first + c.frames as u64;
        let (states, seg, loss) = {
            let chunk = run.frames[c.chunk].as_ref().expect("closed chunk in memory");
            let j0 = (from - c.first) as usize;
            let j1 = (to - c.first) as usize;
            (blob.f64s(&chunk.states[j0 * size..j1 * size]), blob.i32s(&chunk.segment[j0..j1]), blob.f64s(&chunk.impact_loss[j0..j1]))
        };
        let is_final = run.finished && run.closed.last().is_some_and(|l| l.chunk == c.chunk);
        let t_end = if is_final { run.t } else { (c.first + c.frames as u64) as f64 * run.dt };
        let mut o = self.common(run, &mut blob, to, c.segments_to, c.events_to, c.chunk + 2, js_min(run.t_end, t_end));
        o.insert("fromFrame".into(), json!(from));
        o.insert("frameCount".into(), json!(to));
        o.insert("states".into(), states);
        o.insert("frameSegment".into(), seg);
        o.insert("impactLoss".into(), loss);
        o.insert("chunks".into(), Value::Array(vec![chunk_info_json(c, &mut blob)]));
        if self.release {
            run.release_chunk(c.chunk);
        }
        blob.finish(&Value::Object(o))
    }

    fn rest_delta(&mut self, run: &mut SimulationRun) -> Option<Vec<u8>> {
        let size = run.size;
        let to = run.frame_count();
        if to <= self.frames && run.segment_count() <= self.segments && run.event_count() <= self.events && !run.finished {
            return None;
        }
        let from = self.frames.min(to);
        let n = (to - from) as usize;
        let mut states = vec![0.0; n * size];
        let mut seg = vec![0i32; n];
        let mut loss = vec![0.0; n];
        for k in from..to {
            let c = run.chunk_of(k).expect("open chunk in memory");
            let j = (k - c.first) as usize;
            let o = (k - from) as usize;
            states[o * size..(o + 1) * size].copy_from_slice(&c.states[j * size..(j + 1) * size]);
            seg[o] = c.segment[j];
            loss[o] = c.impact_loss[j];
        }
        let mut blob = Blob::default();
        let sref = blob.f64s(&states);
        let gref = blob.i32s(&seg);
        let lref = blob.f64s(&loss);
        let cp_to = run.checkpoints.len();
        let (sc, ec) = (run.segment_count(), run.event_count());
        let mut o = self.common(run, &mut blob, to, sc, ec, cp_to, js_min(run.t_end, run.t));
        o.insert("fromFrame".into(), json!(from));
        o.insert("frameCount".into(), json!(to));
        o.insert("states".into(), sref);
        o.insert("frameSegment".into(), gref);
        o.insert("impactLoss".into(), lref);
        o.insert("chunks".into(), Value::Array(Vec::new()));
        Some(blob.finish(&Value::Object(o)))
    }
}

/// Parse a container: the JSON document and the blob section (for tests and tools).
pub fn parse_container(bytes: &[u8]) -> Option<(Value, &[u8])> {
    if bytes.len() < 8 || &bytes[0..4] != MAGIC {
        return None;
    }
    let n = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize;
    let json_end = 8 + n;
    let doc: Value = serde_json::from_slice(bytes.get(8..json_end)?).ok()?;
    let blob_start = json_end.div_ceil(8) * 8;
    Some((doc, bytes.get(blob_start..)?))
}

/// Read a `$f64` reference of a container.
pub fn read_f64s(blob: &[u8], r: &Value) -> Option<Vec<f64>> {
    let a = r.get("$f64")?.as_array()?;
    let off = a.first()?.as_u64()? as usize;
    let len = a.get(1)?.as_u64()? as usize;
    let bytes = blob.get(off..off + 8 * len)?;
    Some(bytes.chunks_exact(8).map(|c| f64::from_le_bytes(c.try_into().expect("8 bytes"))).collect())
}

/// Read a `$i32` reference of a container.
pub fn read_i32s(blob: &[u8], r: &Value) -> Option<Vec<i32>> {
    let a = r.get("$i32")?.as_array()?;
    let off = a.first()?.as_u64()? as usize;
    let len = a.get(1)?.as_u64()? as usize;
    let bytes = blob.get(off..off + 4 * len)?;
    Some(bytes.chunks_exact(4).map(|c| i32::from_le_bytes(c.try_into().expect("4 bytes"))).collect())
}
