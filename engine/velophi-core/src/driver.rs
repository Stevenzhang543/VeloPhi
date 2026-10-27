//! Run driver (26.53, D68): a simulation run with its delta writer — the run interface of `engine/ABI.md` (create,
//! info, until, advance, deltas, end, stop, cancel, budget, chunk rebuild) in one place, used by the WebAssembly ABI
//! (`velophi-wasm`), the native desktop engine (`velophi-native`, Tauri commands) and the Node-API test module, so
//! every host drives runs through the same code.

use std::collections::VecDeque;

use serde_json::{json, Value};

use crate::js::js_round;
use crate::message::Message;
use crate::scene::parse_scene_value;
use crate::simulation::{rebuild_chunk, Advance, Fallback, SimOptions, SimulationRun, StopReason};
use crate::transport::{end_json, event_json, jnum, Blob, DeltaWriter};

/// Status of `advance`: the step budget is used, the run paused at its until frame, or it has finished.
pub const BUDGET: i32 = 0;
pub const PAUSED: i32 = 1;
pub const FINISHED: i32 = 2;

/// Options of a run request: a scene document, or `{ scene, duration?, chunkSeconds?, maxEventsPerInstant?,
/// fallback? }` (`duration`: number, `null` for unbounded; absent or `"scene"`: the scene's).
pub fn parse_run_request(doc: &Value) -> Result<(Value, SimOptions), Message> {
    if doc.get("format").is_some() {
        return Ok((doc.clone(), SimOptions::default()));
    }
    let scene = doc.get("scene").cloned().ok_or_else(|| Message::new("abi.noScene"))?;
    let mut o = SimOptions::default();
    match doc.get("duration") {
        None => {}
        Some(Value::String(s)) if s == "scene" => {}
        Some(Value::Null) => o.duration = Some(None),
        Some(v) => o.duration = Some(Some(v.as_f64().ok_or_else(|| Message::new("abi.badOption").text("option", "duration"))?)),
    }
    if let Some(v) = doc.get("chunkSeconds") {
        o.chunk_seconds = v.as_f64().ok_or_else(|| Message::new("abi.badOption").text("option", "chunkSeconds"))?;
    }
    if let Some(v) = doc.get("maxEventsPerInstant") {
        o.max_events_per_instant = v.as_f64().ok_or_else(|| Message::new("abi.badOption").text("option", "maxEventsPerInstant"))?;
    }
    match doc.get("fallback") {
        None | Some(Value::Null) => {}
        Some(Value::Bool(false)) => o.fallback = None,
        Some(v) => {
            let events = v.get("events").and_then(|x| x.as_f64());
            let window = v.get("window").and_then(|x| x.as_f64());
            match (events, window) {
                (Some(events), Some(window)) => o.fallback = Some(Fallback { events, window }),
                _ => return Err(Message::new("abi.badOption").text("option", "fallback")),
            }
        }
    }
    Ok((scene, o))
}

/// A run and the deltas it has produced but not yet handed out.
pub struct RunDriver {
    pub run: SimulationRun,
    writer: DeltaWriter,
    queue: VecDeque<Vec<u8>>,
    tail: bool,
    pub load_warnings: Vec<Message>,
}

impl RunDriver {
    /// Create a run from a request (see `parse_run_request`).
    pub fn create(doc: &Value) -> Result<RunDriver, Message> {
        let (scene_doc, opts) = parse_run_request(doc)?;
        let (scene, load_warnings) = parse_scene_value(&scene_doc)?;
        let run = SimulationRun::new(&scene, opts)?;
        Ok(RunDriver { run, writer: DeltaWriter::new(true), queue: VecDeque::new(), tail: false, load_warnings })
    }

    /// Create a run from request JSON bytes.
    pub fn create_bytes(json_in: &[u8]) -> Result<RunDriver, Message> {
        let doc: Value = serde_json::from_slice(json_in).map_err(|e| Message::new("scene.invalidJson").text("detail", e.to_string()))?;
        RunDriver::create(&doc)
    }

    /// The 'started' information: `{ K, size, chunkFrames, duration, dt, loadWarnings, abi }` (K and duration null
    /// when unbounded).
    pub fn info(&self, abi: u32) -> Value {
        let r = &self.run;
        json!({
            "K": r.k_max,
            "size": r.size,
            "chunkFrames": r.chunk_frames,
            "duration": if r.bounded { jnum(r.t_end) } else { Value::Null },
            "dt": jnum(r.dt),
            "loadWarnings": self.load_warnings.iter().map(|w| w.to_json()).collect::<Vec<_>>(),
            "abi": abi,
        })
    }

    /// Pause at the top of the loop once frame `frame` is recorded (+∞: no pause). Never changes a result.
    pub fn set_until(&mut self, frame: f64) {
        self.run.set_pause_frame(frame);
    }

    /// Run at most `steps` loop iterations: BUDGET, PAUSED or FINISHED.
    pub fn advance(&mut self, steps: u64) -> i32 {
        let until = self.run.pause_frame();
        match self.run.advance(steps, until) {
            Advance::Budget => BUDGET,
            Advance::Paused => PAUSED,
            Advance::Finished => FINISHED,
        }
    }

    /// The next delta also carries the open chunk (a tail delta).
    pub fn request_tail(&mut self) {
        self.tail = true;
    }

    /// The next delta without handing it out (closed chunks first, then a tail when requested or at the end).
    pub fn peek_delta(&mut self) -> Option<&Vec<u8>> {
        if self.queue.is_empty() {
            let tail = std::mem::take(&mut self.tail);
            let deltas = self.writer.next(&mut self.run, tail);
            self.queue.extend(deltas);
        }
        self.queue.front()
    }

    /// Drop the delta returned by `peek_delta`.
    pub fn pop_delta(&mut self) {
        self.queue.pop_front();
    }

    /// Hand out the next delta.
    pub fn take_delta(&mut self) -> Option<Vec<u8>> {
        self.peek_delta()?;
        self.queue.pop_front()
    }

    /// End state `{ completed, error, hash, stopReason }` of a finished run.
    pub fn end(&self) -> Option<Value> {
        if self.run.finished {
            Some(end_json(&self.run))
        } else {
            None
        }
    }

    /// End the run here without an error (user stop of an unbounded run).
    pub fn stop(&mut self) {
        self.run.stop();
    }

    /// End with `err.cancelled`.
    pub fn cancel(&mut self) {
        self.run.cancel(None);
    }

    /// End a bounded run whose wall-clock budget is exhausted (`err.budget { seconds, t }`).
    pub fn fail_budget(&mut self, budget_ms: f64) {
        let t = self.run.t;
        let m = Message::new("err.budget").num("seconds", js_round(budget_ms / 1000.0)).num("t", t);
        self.run.end_with_error(m, StopReason::Error);
    }

    /// Recompute a chunk from a checkpoint up to the loop top at `end_frame`: the rebuild container
    /// `{ chunk: { index, first, count, states, segment, impactLoss }, events, next, again, error }`.
    pub fn rebuild_chunk(&self, cp: &[f64], end_frame: u64) -> Result<Vec<u8>, Message> {
        let sys = self.run.system.clone();
        let r = rebuild_chunk(sys.clone(), cp, self.run.options().clone(), end_frame)?;
        let mut blob = Blob::default();
        let c = &r.chunk;
        let size = sys.size;
        let doc = json!({
            "chunk": {
                "index": c.index, "first": c.first, "count": c.count,
                "states": blob.f64s(&c.states[..c.count * size]), "segment": blob.i32s(&c.segment[..c.count]), "impactLoss": blob.f64s(&c.impact_loss[..c.count])
            },
            "events": r.events.iter().map(|e| event_json(&sys, e, &mut blob)).collect::<Vec<_>>(),
            "next": r.next.as_ref().map(|d| blob.f64s(d)),
            "again": r.again.as_ref().map(|d| blob.f64s(d)),
            "error": r.run_error.as_ref().map(|m| m.to_json()),
        });
        Ok(blob.finish(&doc))
    }
}

/// Little-endian doubles of a checkpoint.
pub fn f64s_from_le(bytes: &[u8]) -> Vec<f64> {
    bytes.chunks_exact(8).map(|c| f64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]])).collect()
}
