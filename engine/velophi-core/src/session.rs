//! Session (26.53, D66): the receiving side of a streaming run on the interface thread — a port of
//! `StreamRecording` (src/core/solver/stream.ts of 26.52, now tests/reference). It assembles the delta containers
//! of a run (transport.rs) into a recording that grows chunk by chunk, keeps every checkpoint, chunk summary,
//! segment and event, and holds frame chunks under a memory budget: when the budget is exceeded the least recently
//! used closed chunk is dropped; reading one of its frames later recomputes the chunk from its checkpoint
//! (`rebuild_chunk`, the same code path as the run) and checks the result against the chunk's digest, its events
//! and the next checkpoint, so a mismatch can never go unnoticed.
//!
//! Chunks the interface is about to need can be recomputed elsewhere in advance (the native engine or a worker):
//! `prefetch_request` hands out the work, `install_remote` checks and installs the result.
//!
//! All calculations of the interface (observation, recognition, formulas, views, teaching) run on a session.

use std::rc::Rc;

use serde_json::{json, Value};

use crate::checkpoint::checkpoint_state;
use crate::dynamics::{
    build_system, derivative, energy, solve_mode, ModeSolution, System, AUX_BELT, AUX_DAMP, AUX_HEAT, AUX_WORK,
};
use crate::integrators::{dopri5_step, euler_step, gauss4_step, rk4_step, ErrorControl, Stages};
use crate::js::js_round;
use crate::kinematics::compute_poses;
use crate::message::{Message, SimResult};
use crate::model::compile_model;
use crate::record::{chain_digest, frames_per_chunk, hash_events, FrameChunk, CHAIN_START};
use crate::observe::{custom_quantities, CustomEntry, SceneMeta};
use crate::scene::{parse_scene_value, IntegratorKind, Scene};
use crate::sha256::{to_hex, Sha256};
use crate::simulation::{rebuild_chunk, Fallback, Segment, SimEvent, SimOptions};
use crate::transport::{dnum, event_from_json, parse_container, read_f64s, read_i32s, read_u8s, segment_from_json};

/// Default memory budget of a recording's frames (bytes).
pub const DEFAULT_MEMORY_BUDGET: f64 = 512.0 * 1024.0 * 1024.0;

fn internal(text: impl Into<String>) -> Message {
    Message::new("err.internal").text("message", text)
}

/// A closed chunk as announced by the run.
#[derive(Clone, Debug)]
pub struct ChunkInfo {
    pub chunk: usize,
    pub first: u64,
    pub frames: usize,
    pub events_from: usize,
    pub events_to: usize,
    pub digest: [u8; 32],
    pub rolling: [u8; 32],
    pub summary: Vec<f64>,
    pub t: f64,
}

#[derive(Debug)]
struct Slot {
    index: usize,
    first: u64,
    /// Frames received for the chunk.
    count: usize,
    data: Option<FrameChunk>,
    checkpoint: Option<Vec<f64>>,
    info: Option<ChunkInfo>,
    last_use: u64,
}

/// How a run ended (RecordingEnd).
#[derive(Clone, Debug)]
pub struct RunEnd {
    pub completed: bool,
    /// Message JSON or null.
    pub error: Value,
    pub hash: String,
    pub stop_reason: Option<String>,
}

/// Work for a remote rebuilder: recompute a chunk from its checkpoint up to the loop top at `end_frame`.
#[derive(Clone, Debug)]
pub struct RemoteRequest {
    pub chunk: usize,
    pub checkpoint: Vec<f64>,
    pub end_frame: u64,
}

/// How a session is set up (the 'started' information of the run).
#[derive(Clone, Debug)]
pub struct SessionInit {
    /// Frames per chunk of the run (None: 1 s of frames).
    pub chunk_frames: Option<usize>,
    /// Effective duration of the run: None for unbounded.
    pub duration: Option<f64>,
    pub max_events_per_instant: f64,
    pub fallback: Option<Fallback>,
    pub budget_bytes: f64,
}

impl Default for SessionInit {
    fn default() -> Self {
        let d = SimOptions::default();
        SessionInit { chunk_frames: None, duration: None, max_events_per_instant: d.max_events_per_instant, fallback: d.fallback, budget_bytes: DEFAULT_MEMORY_BUDGET }
    }
}

/// A growing recording assembled from deltas, with evictable frame chunks (see the module header).
pub struct Session {
    pub scene: Scene,
    pub system: Rc<System>,
    pub size: usize,
    pub dt: f64,
    pub chunk_frames: usize,
    pub duration: Option<f64>,
    opts: SimOptions,
    pub budget_bytes: f64,
    pub frame_count: u64,
    pub segments: Vec<Segment>,
    pub events: Vec<SimEvent>,
    /// Warnings as message JSON (the interface renders them).
    pub warnings: Vec<Value>,
    /// Solver statistics as JSON (stats of the delta).
    pub stats: Value,
    pub reduced_from: Option<f64>,
    /// Simulated time reached (s).
    pub t: f64,
    /// Simulated duration (s); +∞ when unbounded.
    pub t_total: f64,
    pub end: Option<RunEnd>,
    /// Final fingerprint (empty until the run has ended).
    pub hash: String,
    slots: Vec<Slot>,
    tick: u64,
    resident_bytes: f64,
    fixed_bytes: f64,
    record_bytes: f64,
    rolling: [u8; 32],
    last_info: Option<(usize, f64)>,
    hasher: Option<Sha256>,
    hashed: u64,
    pub evictions: u64,
    pub rebuilds: u64,
    pub remote_rebuilds: u64,
    in_flight: Vec<usize>,
    /// Bumped whenever frames, segments or events change (caches of derived results key on it).
    pub revision: u64,
    /// Scene data beyond the solver's scene (pivot, custom quantities, names).
    pub meta: SceneMeta,
    customs: Option<Vec<CustomEntry>>,
    /// Recognised situations (formula layer).
    pub recognition: crate::formula::Recognition,
    /// Warnings of impacts (event index → message JSON), kept from the deltas for the event detail view.
    pub impact_warnings: Vec<(usize, Value)>,
    /// Chart envelope caches (lod.rs).
    pub lod: Option<crate::lod::LodCache>,
}

fn chunk_bytes(c: &FrameChunk) -> f64 {
    (c.states.len() * 8 + c.segment.len() * 4 + c.impact_loss.len() * 8) as f64
}

fn same_array(a: &[f64], b: &[f64]) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(x, y)| x.to_bits() == y.to_bits())
}

/// Digest d_c of a chunk: its frame states, then the time and post-event state of its owned events.
pub fn chunk_digest(states: &[f64], events: &[SimEvent], from: usize, to: usize) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update_f64(states);
    let to = to.min(events.len());
    let from = from.min(to);
    hash_events(&mut h, events[from..to].iter().map(|e| (e.t, e.after.as_slice())));
    h.digest()
}

impl Session {
    /// A session for a run of the scene document `doc` (the system is compiled here, from the same scene the run
    /// uses).
    pub fn new(doc: &Value, init: SessionInit) -> SimResult<Session> {
        let (scene, _) = parse_scene_value(doc)?;
        let model = compile_model(&scene)?;
        let system = Rc::new(build_system(model));
        Ok(Self::with_system(scene, SceneMeta::from_doc(doc), system, init))
    }

    /// A session with an already compiled system.
    pub fn with_system(scene: Scene, meta: SceneMeta, system: Rc<System>, init: SessionInit) -> Session {
        let dt = scene.settings.output_step;
        let chunk_frames = init.chunk_frames.unwrap_or_else(|| frames_per_chunk(dt, 1.0));
        let opts = SimOptions {
            duration: Some(init.duration),
            max_events_per_instant: init.max_events_per_instant,
            fallback: init.fallback,
            chunk_seconds: chunk_frames as f64 * dt,
        };
        Session {
            size: system.size,
            dt,
            chunk_frames,
            duration: init.duration,
            opts,
            budget_bytes: init.budget_bytes,
            frame_count: 0,
            segments: Vec::new(),
            events: Vec::new(),
            warnings: Vec::new(),
            stats: json!({ "steps": 0, "rejected": 0, "events": 0, "locateIterations": 0, "maxPositionCorrection": 0, "maxVelocityCorrection": 0, "ambiguousModes": 0, "wallMs": 0 }),
            reduced_from: None,
            t: 0.0,
            t_total: 0.0,
            end: None,
            hash: String::new(),
            slots: Vec::new(),
            tick: 0,
            resident_bytes: 0.0,
            fixed_bytes: 0.0,
            record_bytes: 0.0,
            rolling: CHAIN_START,
            last_info: None,
            hasher: if init.duration.is_some() { Some(Sha256::new()) } else { None },
            hashed: 0,
            evictions: 0,
            rebuilds: 0,
            remote_rebuilds: 0,
            in_flight: Vec::new(),
            revision: 0,
            meta,
            customs: None,
            recognition: Default::default(),
            impact_warnings: Vec::new(),
            lod: None,
            scene,
            system,
        }
    }

    /// The custom quantities of the scene, compiled once.
    pub fn customs(&mut self) -> &[CustomEntry] {
        if self.customs.is_none() {
            self.customs = Some(custom_quantities(&self.system, &self.meta));
        }
        self.customs.as_deref().unwrap_or(&[])
    }

    // ---- Receiving ----

    /// Apply a delta container (bytes as the run produced them).
    pub fn apply(&mut self, bytes: &[u8]) -> SimResult<()> {
        let (doc, blob) = parse_container(bytes).ok_or_else(|| internal("transport: not a delta container"))?;
        self.apply_doc(&doc, blob)
    }

    fn apply_doc(&mut self, d: &Value, blob: &[u8]) -> SimResult<()> {
        let bad = || internal("transport: malformed delta");
        let from_frame = dnum(&d["fromFrame"]) as u64;
        let frame_count = dnum(&d["frameCount"]) as u64;
        if from_frame > self.frame_count {
            return Err(internal("transport: missing frames"));
        }
        let states = read_f64s(blob, &d["states"]).ok_or_else(bad)?;
        let seg = read_i32s(blob, &d["frameSegment"]).ok_or_else(bad)?;
        let loss = read_f64s(blob, &d["impactLoss"]).ok_or_else(bad)?;
        self.write_frames(from_frame, &states, &seg, &loss)?;
        self.frame_count = self.frame_count.max(frame_count);
        let seg_from = dnum(&d["segmentsFrom"]) as usize;
        self.segments.truncate(seg_from);
        let segs = d["segments"].as_array().ok_or_else(bad)?;
        for s in segs {
            self.segments.push(segment_from_json(s, blob).ok_or_else(bad)?);
        }
        let ev_from = dnum(&d["eventsFrom"]) as usize;
        self.events.truncate(ev_from);
        self.impact_warnings.retain(|(i, _)| *i < ev_from);
        for e in d["events"].as_array().ok_or_else(bad)? {
            let ev = event_from_json(e, blob).ok_or_else(bad)?;
            if let Some(w) = e.get("impact").and_then(|i| i.get("warning")) {
                self.impact_warnings.push((ev.index, w.clone()));
            }
            self.record_bytes += ((ev.before.len() + ev.after.len() + ev.impact.as_ref().map(|i| i.x.len()).unwrap_or(0)) * 8 + 256) as f64;
            self.events.push(ev);
        }
        self.record_bytes += (segs.len() * (self.size * 8 + 160)) as f64;
        self.warnings = d["warnings"].as_array().cloned().unwrap_or_default();
        self.stats = d["stats"].clone();
        self.t = dnum(&d["t"]);
        self.t_total = dnum(&d["T"]);
        self.reduced_from = match &d["reducedFrom"] {
            Value::Null => None,
            v => Some(dnum(v)),
        };
        if let Some(cps) = d.get("checkpoints").and_then(|c| c.as_array()) {
            for cp in cps {
                let c = dnum(&cp["chunk"]) as usize;
                let data = read_f64s(blob, &cp["data"]).ok_or_else(bad)?;
                let bytes = (data.len() * 8) as f64;
                let slot = self.slot(c);
                let new = slot.checkpoint.is_none();
                slot.checkpoint = Some(data);
                if new {
                    self.fixed_bytes += bytes;
                }
            }
        }
        if let Some(chunks) = d.get("chunks").and_then(|c| c.as_array()) {
            for ci in chunks {
                let info = ChunkInfo {
                    chunk: dnum(&ci["chunk"]) as usize,
                    first: dnum(&ci["first"]) as u64,
                    frames: dnum(&ci["frames"]) as usize,
                    events_from: dnum(&ci["eventsFrom"]) as usize,
                    events_to: dnum(&ci["eventsTo"]) as usize,
                    digest: digest32(read_u8s(blob, &ci["digest"]).ok_or_else(bad)?)?,
                    rolling: digest32(read_u8s(blob, &ci["rolling"]).ok_or_else(bad)?)?,
                    summary: read_f64s(blob, &ci["summary"]).ok_or_else(bad)?,
                    t: dnum(&ci["t"]),
                };
                self.close(info)?;
            }
        }
        self.revision += 1;
        self.evict(None);
        Ok(())
    }

    /// The run has ended: the fingerprint is recomputed from the data and must equal the sender's.
    pub fn finish(&mut self, end: RunEnd) -> SimResult<()> {
        if self.end.is_some() {
            return Ok(());
        }
        let hash = if let Some(mut h) = self.hasher.take() {
            // Frames not covered by closed chunks (a recording posted in one piece)
            for k in self.hashed..self.frame_count {
                let s = self.state(k)?.to_vec();
                h.update_f64(&s);
            }
            self.hashed = self.frame_count;
            hash_events(&mut h, self.events.iter().map(|e| (e.t, e.after.as_slice())));
            h.digest_hex()
        } else {
            to_hex(&self.rolling)
        };
        if !end.hash.is_empty() && hash != end.hash {
            return Err(internal("transport: recording fingerprint mismatch"));
        }
        self.hash = hash;
        self.end = Some(end);
        self.revision += 1;
        Ok(())
    }

    /// Rolling fingerprint up to the last closed chunk: (hex, t, chunks).
    pub fn rolling_fingerprint(&self) -> Option<(String, f64, usize)> {
        self.last_info.map(|(c, t)| (to_hex(&self.rolling), t, c + 1))
    }

    fn slot(&mut self, c: usize) -> &mut Slot {
        while self.slots.len() <= c {
            let i = self.slots.len();
            self.slots.push(Slot { index: i, first: (i * self.chunk_frames) as u64, count: 0, data: None, checkpoint: None, info: None, last_use: 0 });
        }
        &mut self.slots[c]
    }

    fn write_frames(&mut self, from: u64, states: &[f64], seg: &[i32], loss: &[f64]) -> SimResult<()> {
        let f = self.chunk_frames as u64;
        let size = self.size;
        let end = from + seg.len() as u64;
        if states.len() != seg.len() * size || loss.len() != seg.len() {
            return Err(internal("transport: frame arrays of different length"));
        }
        let mut k = from;
        while k < end {
            let c = (k / f) as usize;
            self.tick += 1;
            let tick = self.tick;
            let chunk_frames = self.chunk_frames;
            let slot = self.slot(c);
            let j0 = (k - slot.first) as usize;
            let take = ((end - k) as usize).min(chunk_frames - j0);
            let o = (k - from) as usize;
            let mut added = 0.0;
            if slot.data.is_none() {
                let ch = FrameChunk::new(c, slot.first, chunk_frames, size);
                added = chunk_bytes(&ch);
                slot.data = Some(ch);
            }
            let data = slot.data.as_mut().expect("chunk");
            data.states[j0 * size..(j0 + take) * size].copy_from_slice(&states[o * size..(o + take) * size]);
            data.segment[j0..j0 + take].copy_from_slice(&seg[o..o + take]);
            data.impact_loss[j0..j0 + take].copy_from_slice(&loss[o..o + take]);
            data.count = data.count.max(j0 + take);
            slot.count = slot.count.max(j0 + take);
            slot.last_use = tick;
            self.resident_bytes += added;
            k += take as u64;
        }
        Ok(())
    }

    /// A chunk is closed: verify its digest against the received frames and events, extend the chain.
    fn close(&mut self, info: ChunkInfo) -> SimResult<()> {
        let size = self.size;
        let c = info.chunk;
        self.slot(c);
        let digest = {
            let slot = &self.slots[c];
            let data = slot.data.as_ref().filter(|d| d.count >= info.frames).ok_or_else(|| internal(format!("transport: chunk {c} is incomplete")))?;
            let states = &data.states[..info.frames * size];
            chunk_digest(states, &self.events, info.events_from, info.events_to)
        };
        if digest != info.digest {
            return Err(internal(format!("transport: chunk {c} fingerprint mismatch")));
        }
        self.rolling = chain_digest(&self.rolling, &digest);
        if self.rolling != info.rolling {
            return Err(internal(format!("transport: rolling fingerprint mismatch at chunk {c}")));
        }
        if self.hashed == info.first {
            if let Some(h) = self.hasher.as_mut() {
                let data = self.slots[c].data.as_ref().expect("chunk");
                h.update_f64(&data.states[..info.frames * size]);
                self.hashed = info.first + info.frames as u64;
            }
        }
        self.fixed_bytes += (info.summary.len() * 8 + 64) as f64;
        self.last_info = Some((c, info.t));
        self.slots[c].info = Some(info);
        Ok(())
    }

    // ---- Frames ----

    fn slot_index(&self, k: u64) -> usize {
        (k / self.chunk_frames as u64) as usize
    }

    fn is_resident_frame(&self, k: u64) -> bool {
        let c = self.slot_index(k);
        match self.slots.get(c) {
            Some(s) => s.data.as_ref().is_some_and(|d| ((k - s.first) as usize) < d.count),
            None => false,
        }
    }

    fn start_checkpoint(&self, k: u64) -> Option<&Vec<f64>> {
        let s = self.slots.get(self.slot_index(k))?;
        if s.first == k {
            s.checkpoint.as_ref()
        } else {
            None
        }
    }

    /// Make frame k's chunk resident (recomputing it when it was evicted), or tell that its checkpoint holds it.
    fn ensure(&mut self, k: u64) -> SimResult<bool> {
        let c = self.slot_index(k);
        if c >= self.slots.len() {
            return Err(internal(format!("frame {k} has not been received")));
        }
        if self.is_resident_frame(k) {
            self.tick += 1;
            self.slots[c].last_use = self.tick;
            return Ok(true);
        }
        if self.start_checkpoint(k).is_some() {
            return Ok(false);
        }
        if k >= self.frame_count {
            return Err(internal(format!("frame {k} has not been received")));
        }
        self.rebuild(c)?;
        Ok(true)
    }

    /// State of frame k.
    pub fn state(&mut self, k: u64) -> SimResult<&[f64]> {
        let size = self.size;
        let c = self.slot_index(k);
        if self.ensure(k)? {
            let s = &self.slots[c];
            let j = (k - s.first) as usize;
            Ok(&s.data.as_ref().expect("resident").states[j * size..(j + 1) * size])
        } else {
            Ok(checkpoint_state(self.slots[c].checkpoint.as_ref().expect("checkpoint")))
        }
    }

    /// Segment index of frame k.
    pub fn segment(&mut self, k: u64) -> SimResult<usize> {
        let c = self.slot_index(k);
        if self.ensure(k)? {
            let s = &self.slots[c];
            Ok(s.data.as_ref().expect("resident").segment[(k - s.first) as usize] as usize)
        } else {
            Ok(self.slots[c].checkpoint.as_ref().expect("checkpoint")[25] as usize)
        }
    }

    /// Cumulative impact loss up to frame k (J).
    pub fn impact_loss(&mut self, k: u64) -> SimResult<f64> {
        let c = self.slot_index(k);
        if self.ensure(k)? {
            let s = &self.slots[c];
            Ok(s.data.as_ref().expect("resident").impact_loss[(k - s.first) as usize])
        } else {
            Ok(self.slots[c].checkpoint.as_ref().expect("checkpoint")[7])
        }
    }

    /// Frame k can be read without recomputing a chunk.
    pub fn cheap(&self, k: u64) -> bool {
        self.is_resident_frame(k) || self.start_checkpoint(k).is_some()
    }

    /// Is chunk c in memory?
    pub fn is_resident(&self, c: usize) -> bool {
        self.slots.get(c).is_some_and(|s| s.data.is_some())
    }

    /// Summary of closed chunk c: min, max, first, last of every state component (4·size values).
    pub fn summary(&self, c: usize) -> Option<&[f64]> {
        self.slots.get(c)?.info.as_ref().map(|i| i.summary.as_slice())
    }

    /// Number of chunks received (closed or open).
    pub fn chunk_count(&self) -> usize {
        self.slots.len()
    }

    /// Number of closed chunks.
    pub fn closed_chunks(&self) -> usize {
        self.last_info.map(|(c, _)| c + 1).unwrap_or(0)
    }

    fn end_frame(&self, c: usize) -> Option<u64> {
        let slot = self.slots.get(c)?;
        let info = slot.info.as_ref()?;
        let next = self.slots.get(c + 1).and_then(|s| s.checkpoint.as_ref());
        // A complete chunk runs on to the next chunk start (to compare the next checkpoint); the last one to its last frame
        Some(if next.is_some() { slot.first + self.chunk_frames as u64 } else { slot.first + info.frames as u64 - 1 })
    }

    /// Recompute an evicted chunk from its checkpoint and verify it (see the module header).
    fn rebuild(&mut self, c: usize) -> SimResult<()> {
        let (cp, info) = {
            let s = &self.slots[c];
            match (&s.checkpoint, &s.info) {
                (Some(cp), Some(info)) => (cp.clone(), info.clone()),
                _ => return Err(internal(format!("chunk {c} is not in memory and cannot be recomputed"))),
            }
        };
        let end_frame = self.end_frame(c).expect("closed chunk");
        let r = rebuild_chunk(self.system.clone(), &cp, self.opts.clone(), end_frame)?;
        let mut chunk = r.chunk;
        if chunk.count < info.frames {
            return Err(internal(format!("rebuild: chunk {c} ended early")));
        }
        let size = self.size;
        let d = chunk_digest(&chunk.states[..info.frames * size], &self.events, info.events_from, info.events_to);
        if d != info.digest {
            return Err(internal(format!("rebuild: chunk {c} differs from the original run")));
        }
        for e in &r.events {
            if e.index >= info.events_to {
                break;
            }
            match self.events.get(e.index) {
                Some(o) if o.t.to_bits() == e.t.to_bits() && same_array(&o.after, &e.after) => {}
                _ => return Err(internal(format!("rebuild: event {} differs from the original run", e.index))),
            }
        }
        if let Some(again) = &r.again {
            if !same_array(again, &cp) {
                return Err(internal(format!("rebuild: checkpoint {c} does not restore exactly")));
            }
        }
        if let (Some(next), Some(rn)) = (self.slots.get(c + 1).and_then(|s| s.checkpoint.as_ref()), &r.next) {
            if !same_array(next, rn) {
                return Err(internal(format!("rebuild: checkpoint {} differs from the original run", c + 1)));
            }
        }
        chunk.count = info.frames;
        self.resident_bytes += chunk_bytes(&chunk);
        self.tick += 1;
        let s = &mut self.slots[c];
        s.data = Some(chunk);
        s.last_use = self.tick;
        self.rebuilds += 1;
        self.in_flight.retain(|&x| x != c);
        self.evict(Some(c));
        Ok(())
    }

    // ---- Remote rebuilds (prefetch) ----

    /// Work for a remote rebuilder when chunk c is evicted, closed and not already on its way; marks it in flight.
    pub fn prefetch_request(&mut self, c: usize) -> Option<RemoteRequest> {
        let s = self.slots.get(c)?;
        if s.data.is_some() || self.in_flight.contains(&c) || s.info.is_none() {
            return None;
        }
        let cp = s.checkpoint.clone()?;
        let end_frame = self.end_frame(c)?;
        self.in_flight.push(c);
        Some(RemoteRequest { chunk: c, checkpoint: cp, end_frame })
    }

    /// A remote rebuild failed or was abandoned: chunk c can be requested again.
    pub fn remote_failed(&mut self, c: usize) {
        self.in_flight.retain(|&x| x != c);
    }

    /// Install a chunk recomputed elsewhere (the `run_take_output` container of a rebuild). Returns false when it
    /// does not verify (it is then ignored; the chunk is recomputed here when it is read).
    pub fn install_remote(&mut self, c: usize, bytes: &[u8]) -> bool {
        self.in_flight.retain(|&x| x != c);
        let Some((doc, blob)) = parse_container(bytes) else { return false };
        let size = self.size;
        let Some(slot) = self.slots.get(c) else { return false };
        if slot.data.is_some() {
            return true;
        }
        let Some(info) = slot.info.clone() else { return false };
        let ch = &doc["chunk"];
        let first = dnum(&ch["first"]) as u64;
        let count = dnum(&ch["count"]) as usize;
        let (Some(states), Some(seg), Some(loss)) = (read_f64s(blob, &ch["states"]), read_i32s(blob, &ch["segment"]), read_f64s(blob, &ch["impactLoss"])) else {
            return false;
        };
        if first != slot.first || count < info.frames || states.len() < info.frames * size {
            return false;
        }
        if chunk_digest(&states[..info.frames * size], &self.events, info.events_from, info.events_to) != info.digest {
            return false;
        }
        if let (Some(next), Some(rn)) = (self.slots.get(c + 1).and_then(|s| s.checkpoint.as_ref()), doc.get("next").and_then(|n| read_f64s(blob, n))) {
            if !same_array(next, &rn) {
                return false;
            }
        }
        let mut chunk = FrameChunk::new(c, first, self.chunk_frames, size);
        let n = info.frames;
        chunk.states[..n * size].copy_from_slice(&states[..n * size]);
        chunk.segment[..n].copy_from_slice(&seg[..n]);
        chunk.impact_loss[..n].copy_from_slice(&loss[..n]);
        chunk.count = n;
        self.resident_bytes += chunk_bytes(&chunk);
        self.tick += 1;
        let s = &mut self.slots[c];
        s.data = Some(chunk);
        s.last_use = self.tick;
        self.remote_rebuilds += 1;
        self.evict(Some(c));
        true
    }

    // ---- Memory ----

    /// Change the memory budget (bytes) and evict down to it.
    pub fn set_budget(&mut self, bytes: f64) {
        self.budget_bytes = bytes;
        self.evict(None);
    }

    /// Drop the frames of closed chunk c (tests; normally done by the budget).
    pub fn evict_chunk(&mut self, c: usize) -> bool {
        let Some(s) = self.slots.get_mut(c) else { return false };
        if s.data.is_none() || s.info.is_none() || s.checkpoint.is_none() {
            return false;
        }
        let bytes = chunk_bytes(s.data.as_ref().expect("data"));
        s.data = None;
        self.resident_bytes -= bytes;
        self.evictions += 1;
        true
    }

    fn evict(&mut self, keep: Option<usize>) {
        while self.resident_bytes + self.fixed_bytes + self.record_bytes > self.budget_bytes {
            let mut victim: Option<(usize, u64)> = None;
            for s in &self.slots {
                if s.data.is_none() || s.info.is_none() || s.checkpoint.is_none() || Some(s.index) == keep {
                    continue;
                }
                if victim.is_none_or(|(_, u)| s.last_use < u) {
                    victim = Some((s.index, s.last_use));
                }
            }
            let Some((c, _)) = victim else { return };
            self.evict_chunk(c);
        }
    }

    /// Memory and work counters (StreamStats).
    pub fn memory_json(&self) -> Value {
        let resident = self.slots.iter().filter(|s| s.data.is_some()).count();
        let checkpoints = self.slots.iter().filter(|s| s.checkpoint.is_some()).count();
        json!({
            "memoryBytes": self.resident_bytes + self.fixed_bytes + self.record_bytes, "residentBytes": self.resident_bytes,
            "chunks": self.slots.len(), "residentChunks": resident, "checkpoints": checkpoints, "evictions": self.evictions,
            "rebuilds": self.rebuilds, "remoteRebuilds": self.remote_rebuilds
        })
    }

    // ---- Exact states and solutions ----

    /// Frame index at or before time t (as exactStateAt chooses it).
    pub fn frame_at(&self, t: f64) -> u64 {
        let n = self.frame_count as f64;
        let mut k = (n - 1.0).min(0f64.max((t / self.dt).floor()));
        if k + 1.0 < n && (k + 1.0) * self.dt <= t {
            k += 1.0;
        }
        while k > 0.0 && k * self.dt > t {
            k -= 1.0;
        }
        k as u64
    }

    /// Index of the segment containing time t (the last one starting at or before t).
    pub fn segment_at_time(&self, t: f64) -> usize {
        let mut seg = 0;
        for s in &self.segments {
            if s.t0 <= t {
                seg = s.index;
            }
        }
        seg
    }

    /// State at an arbitrary time: one step from the last frame (or the last event) before t, in that mode.
    pub fn exact_state_at(&mut self, t: f64) -> SimResult<Vec<f64>> {
        let k = self.frame_at(t);
        let tk = k as f64 * self.dt;
        if t == tk {
            return Ok(self.state(k)?.to_vec());
        }
        let mut si = 0usize;
        for (i, s) in self.segments.iter().enumerate() {
            if s.t0 <= t {
                si = i;
            }
        }
        if self.segments[si].reduced {
            // Time-stepping part: no continuous solution between frames, linear interpolation (reduced accuracy)
            if k + 1 >= self.frame_count {
                return Ok(self.state(k)?.to_vec());
            }
            let a = self.state(k)?.to_vec();
            let b = self.state(k + 1)?.to_vec();
            let s = (t - tk) / self.dt;
            let mut out: Vec<f64> = (0..self.size).map(|i| a[i] + s * (b[i] - a[i])).collect();
            if let Some(slot) = self.system.time_slot {
                out[slot] = t;
            }
            return Ok(out);
        }
        let (x0, t0) = if self.segments[si].t0 > tk { (self.segments[si].x0.clone(), self.segments[si].t0) } else { (self.state(k)?.to_vec(), tk) };
        if t == t0 {
            return Ok(x0);
        }
        let sys = self.system.clone();
        let mode = self.segments[si].mode.clone();
        step_to(&sys, &mode, &x0, t - t0, t)
    }

    /// Mode solution (forces, contact states) at frame k.
    pub fn frame_solution(&mut self, k: u64) -> SimResult<ModeSolution> {
        let seg = self.segment(k)?;
        let x = self.state(k)?.to_vec();
        solve_mode(&self.system, &x, &self.segments[seg].mode, None)
    }

    /// Energy ledger of state X with the given cumulative impact loss (J).
    pub fn ledger_at(&self, x: &[f64], impact_loss: f64) -> Ledger {
        ledger_at(&self.system, x, impact_loss)
    }

    /// Energy ledger of frame k.
    pub fn frame_ledger(&mut self, k: u64) -> SimResult<Ledger> {
        let x = self.state(k)?.to_vec();
        let l = self.impact_loss(k)?;
        Ok(ledger_at(&self.system, &x, l))
    }

    /// Effective bounded K of the run (None when unbounded).
    pub fn k_total(&self) -> Option<u64> {
        self.duration.map(|d| js_round(d / self.dt).max(0.0) as u64)
    }
}

fn digest32(v: Vec<u8>) -> SimResult<[u8; 32]> {
    v.try_into().map_err(|_| internal("transport: digest of wrong length"))
}

/// One integrator step of h from x0 in `mode` (exactStateAt); the clock entry is set to `t`.
pub fn step_to(sys: &System, mode: &crate::dynamics::Mode, x0: &[f64], h: f64, t: f64) -> SimResult<Vec<f64>> {
    let st = &sys.model.settings;
    let slot = sys.time_slot;
    let n = sys.n;
    let mut sol = ModeSolution::default();
    let mut rhs = |y: &[f64], out: &mut [f64]| derivative(sys, y, mode, out, &mut sol);
    let mut r = match st.integrator {
        IntegratorKind::Rk4 => rk4_step(&mut rhs, x0, h, None, slot)?,
        IntegratorKind::Euler => euler_step(&mut rhs, x0, h, 3 * n, None, slot)?,
        IntegratorKind::Gauss4 => gauss4_step(&mut rhs, x0, h, None, slot)?,
        _ => {
            let ctl = ErrorControl { rel_tol: st.rel_tol, abs_tol: st.abs_tol, count: 6 * n };
            let mut stages = Stages::default();
            dopri5_step(&mut rhs, x0, h, &ctl, None, slot, &mut stages)?
        }
    };
    if let Some(s) = slot {
        r.x[s] = t;
    }
    Ok(r.x)
}

/// Energy ledger of a state (J).
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Ledger {
    pub kinetic: f64,
    pub gravity: f64,
    pub spring: f64,
    pub field: f64,
    /// Electric potential energy (26.54, D78); `electric_on`: the scene has charges in fields (the JSON then has it).
    pub electric: f64,
    pub electric_on: bool,
    pub mechanical: f64,
    pub friction_heat: f64,
    pub applied_work: f64,
    pub damping: f64,
    pub belt_work: f64,
    pub impact_loss: f64,
    pub balance: f64,
    /// 26.55: field-region work, buoyancy work, Joule heat of the rail loops, liquid drag heat (scenes with them).
    pub extra: Option<[f64; crate::regions::EXTRA_LEN]>,
}

impl Ledger {
    /// JSON with the TypeScript field names.
    pub fn to_json(&self) -> Value {
        use crate::transport::jnum;
        let mut v = json!({
            "kinetic": jnum(self.kinetic), "gravity": jnum(self.gravity), "spring": jnum(self.spring), "field": jnum(self.field),
            "mechanical": jnum(self.mechanical), "frictionHeat": jnum(self.friction_heat), "appliedWork": jnum(self.applied_work),
            "damping": jnum(self.damping), "beltWork": jnum(self.belt_work), "impactLoss": jnum(self.impact_loss), "balance": jnum(self.balance)
        });
        if self.electric_on {
            v["electric"] = jnum(self.electric);
        }
        if let Some(e) = self.extra {
            v["fieldWork"] = jnum(e[0]);
            v["buoyancyWork"] = jnum(e[1]);
            v["jouleHeat"] = jnum(e[2]);
            v["liquidHeat"] = jnum(e[3]);
        }
        v
    }
}

/// Energy ledger of state X with the given cumulative impact loss (ledgerAt).
pub fn ledger_at(sys: &System, x: &[f64], impact_loss: f64) -> Ledger {
    let poses = compute_poses(&sys.model, x);
    let e = energy(sys, x, &poses);
    let b = sys.aux_base;
    let (friction_heat, applied_work, damping, belt_work) = (x[b + AUX_HEAT], x[b + AUX_WORK], x[b + AUX_DAMP], x[b + AUX_BELT]);
    Ledger {
        kinetic: e.kinetic,
        gravity: e.gravity,
        spring: e.spring,
        field: e.field,
        electric: e.electric,
        electric_on: sys.model.electric,
        mechanical: e.total,
        friction_heat,
        applied_work,
        damping,
        belt_work,
        impact_loss,
        balance: e.total + friction_heat + damping + impact_loss - applied_work - belt_work,
        extra: sys.extra_slot.map(|k| [x[k], x[k + 1], x[k + 2], x[k + 3]]),
    }
}
