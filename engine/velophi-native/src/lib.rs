//! Native engine of the desktop application (26.53, D68). A run is computed in its own Rust thread by the same run
//! driver as the WebAssembly worker (`velophi_core::driver`), following the job protocol of `src/worker/simJob.ts`:
//! 'engine', 'started', 'partial' (one per closed chunk, plus the open chunk when nothing was posted for 250 ms),
//! 'done' with the end state, 'error'. Unbounded runs compute up to the look-ahead and wait for the playhead.
//!
//! Messages are framed for the Tauri channel (raw bytes, no JSON for the frames): u32 little-endian header length,
//! the JSON header, then the delta container if any (`src/engine/host.ts` `decodeNativeMessage`). The interface
//! thread hands the container to its session unchanged, so a native run and a WebAssembly run give the same
//! recording bit for bit.
//!
//! Chunk rebuilds (prefetch of evicted chunks) run in one rebuild thread that keeps the compiled runs of the last
//! scenes. Nothing here depends on Tauri: `src-tauri` wires these functions to commands, and the Node-API test module
//! uses them to check the native host against the WebAssembly job.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use velophi_core::driver::{RunDriver, BUDGET, FINISHED, PAUSED};
use velophi_core::message::Message;

/// ABI version of the engine (the same as the WebAssembly core's).
pub const ABI_VERSION: u32 = 2;
/// Default look-ahead of an unbounded run (s of simulated time; simJob.ts).
pub const DEFAULT_LOOK_AHEAD: f64 = 20.0;
/// Wall-clock time after which the frames of an unfinished chunk are posted anyway.
const TAIL: Duration = Duration::from_millis(250);
/// Target wall-clock time of one `advance` call (ms) and of a slice between control checks.
const CALL_MS: f64 = 10.0;
const SLICE: Duration = Duration::from_millis(50);
/// Compiled runs kept by the rebuild thread.
const REBUILD_RUNS: usize = 3;

/// A framed message: header length (u32 LE), JSON header, then `bytes`.
pub fn frame(header: &Value, bytes: Option<&[u8]>) -> Vec<u8> {
    let h = header.to_string().into_bytes();
    let mut out = Vec::with_capacity(4 + h.len() + bytes.map_or(0, |b| b.len()));
    out.extend_from_slice(&(h.len() as u32).to_le_bytes());
    out.extend_from_slice(&h);
    if let Some(b) = bytes {
        out.extend_from_slice(b);
    }
    out
}

/// Control of a running job (the job protocol's messages after 'start').
#[derive(Clone, Debug, PartialEq)]
pub enum Control {
    Playhead { t: f64, rate: f64 },
    ComputeTo(f64),
    LookAhead(f64),
    Stop,
    Cancel,
}

impl Control {
    /// From the page's message `{ type: 'playhead' | 'computeTo' | 'lookAhead' | 'stop' | 'cancel', … }`.
    pub fn from_json(v: &Value) -> Option<Control> {
        let num = |k: &str| v.get(k).and_then(|x| x.as_f64());
        match v.get("type")?.as_str()? {
            "playhead" => Some(Control::Playhead { t: num("t")?, rate: num("rate").unwrap_or(1.0) }),
            "computeTo" => Some(Control::ComputeTo(num("t")?)),
            "lookAhead" => Some(Control::LookAhead(num("seconds")?)),
            "stop" => Some(Control::Stop),
            "cancel" => Some(Control::Cancel),
            _ => None,
        }
    }
}

/// Where a job's messages go; false when the page is gone (the job then ends).
pub type Post = Box<dyn FnMut(Vec<u8>) -> bool + Send>;

/// Logical processors available to the engine.
pub fn threads() -> usize {
    thread::available_parallelism().map(|n| n.get()).unwrap_or(1)
}

/// Version information: `{ core, abi, threads }`.
pub fn info() -> Value {
    json!({ "core": env!("CARGO_PKG_VERSION"), "abi": ABI_VERSION, "threads": threads() })
}

type RebuildReply = Sender<Result<Vec<u8>, Message>>;

/// The native engine: running jobs and the rebuild thread.
pub struct Engine {
    runs: Mutex<HashMap<u32, Sender<Control>>>,
    next: AtomicU32,
    rebuilds: Mutex<Option<Sender<(Value, RebuildReply)>>>,
}

impl Default for Engine {
    fn default() -> Self {
        Engine::new()
    }
}

impl Engine {
    pub fn new() -> Engine {
        Engine { runs: Mutex::new(HashMap::new()), next: AtomicU32::new(1), rebuilds: Mutex::new(None) }
    }

    /// Start a job: `{ scene, budgetMs, duration ('scene' | null | number), lookAhead, playhead, rate }`. Returns its
    /// id; messages go to `post` from the job's thread.
    pub fn start(self: &Arc<Self>, request: Value, post: Post) -> u32 {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::channel();
        self.runs.lock().expect("runs").insert(id, tx);
        let engine = Arc::clone(self);
        thread::Builder::new()
            .name(format!("velophi-run-{id}"))
            .spawn(move || {
                run_job(request, rx, post);
                engine.runs.lock().expect("runs").remove(&id);
            })
            .expect("spawn run thread");
        id
    }

    /// Send a control message to job `id`; false when it has ended.
    pub fn control(&self, id: u32, c: Control) -> bool {
        let runs = self.runs.lock().expect("runs");
        runs.get(&id).map(|tx| tx.send(c).is_ok()).unwrap_or(false)
    }

    /// Jobs still running.
    pub fn running(&self) -> usize {
        self.runs.lock().expect("runs").len()
    }

    /// Cancel every job (the window is closing).
    pub fn cancel_all(&self) {
        for tx in self.runs.lock().expect("runs").values() {
            let _ = tx.send(Control::Cancel);
        }
    }

    /// Recompute an evicted chunk: `{ scene, duration, chunkFrames, checkpoint: number[], endFrame }` → the rebuild
    /// container (as `run_rebuild_chunk`). Blocks until the rebuild thread answers.
    pub fn rebuild(&self, request: Value) -> Result<Vec<u8>, Message> {
        let (reply, answer) = mpsc::channel();
        {
            let mut slot = self.rebuilds.lock().expect("rebuilds");
            let tx = slot.get_or_insert_with(spawn_rebuilder);
            if tx.send((request.clone(), reply.clone())).is_err() {
                // The thread has died (it never should): start a new one
                let fresh = spawn_rebuilder();
                fresh.send((request, reply)).map_err(|_| internal("rebuild thread unavailable"))?;
                *slot = Some(fresh);
            }
        }
        answer.recv().map_err(|_| internal("rebuild thread unavailable"))?
    }
}

/// The scene of a request: `sceneText` (JSON text in which −0 is written "-0", as `jsonBytes` writes it — the IPC's
/// own JSON would turn −0 into 0) or `scene`.
fn scene_of(req: &Value) -> Result<Value, Message> {
    match req.get("sceneText").and_then(|v| v.as_str()) {
        Some(t) => serde_json::from_str(t).map_err(|e| Message::new("scene.invalidJson").text("detail", e.to_string())),
        None => req.get("scene").cloned().ok_or_else(|| Message::new("abi.noScene")),
    }
}

fn internal(m: &str) -> Message {
    Message::new("err.internal").text("message", m.to_string())
}

/// The rebuild thread: keeps the compiled runs of the last scenes (key: duration, chunk length and scene text).
fn spawn_rebuilder() -> Sender<(Value, RebuildReply)> {
    let (tx, rx) = mpsc::channel::<(Value, RebuildReply)>();
    thread::Builder::new()
        .name("velophi-rebuild".into())
        .spawn(move || {
            let mut runs: Vec<(String, RunDriver)> = Vec::new();
            for (req, reply) in rx {
                let _ = reply.send(rebuild_one(&mut runs, &req));
            }
        })
        .expect("spawn rebuild thread");
    tx
}

fn rebuild_one(runs: &mut Vec<(String, RunDriver)>, req: &Value) -> Result<Vec<u8>, Message> {
    let scene = scene_of(req)?;
    let chunk_frames = req.get("chunkFrames").and_then(|v| v.as_f64()).unwrap_or(1.0);
    let duration = req.get("duration").cloned().unwrap_or(Value::Null);
    let key = format!("{duration}|{chunk_frames}|{scene}");
    let i = match runs.iter().position(|(k, _)| *k == key) {
        Some(i) => i,
        None => {
            let dt = scene.get("settings").and_then(|s| s.get("outputStep")).and_then(|v| v.as_f64()).unwrap_or(0.0);
            let d = RunDriver::create(&json!({ "scene": scene, "duration": duration, "chunkSeconds": chunk_frames * dt }))?;
            runs.push((key, d));
            if runs.len() > REBUILD_RUNS {
                runs.remove(0);
            }
            runs.len() - 1
        }
    };
    let cp: Vec<f64> = match req.get("checkpointHex").and_then(|v| v.as_str()) {
        Some(h) => from_hex(h).ok_or_else(|| Message::new("abi.badOption").text("option", "checkpointHex"))?,
        None => req.get("checkpoint").and_then(|v| v.as_array()).map(|a| a.iter().map(|x| x.as_f64().unwrap_or(f64::NAN)).collect()).unwrap_or_default(),
    };
    let end_frame = req.get("endFrame").and_then(|v| v.as_f64()).unwrap_or(0.0);
    runs[i].1.rebuild_chunk(&cp, end_frame as u64)
}

/// Little-endian doubles written as hex (16 digits each): checkpoints cross the JSON of the IPC bit for bit (−0, NaN
/// and ±∞ included).
pub fn from_hex(h: &str) -> Option<Vec<f64>> {
    if h.len() % 16 != 0 {
        return None;
    }
    let b = h.as_bytes();
    let digit = |c: u8| -> Option<u8> {
        match c {
            b'0'..=b'9' => Some(c - b'0'),
            b'a'..=b'f' => Some(c - b'a' + 10),
            b'A'..=b'F' => Some(c - b'A' + 10),
            _ => None,
        }
    };
    let mut out = Vec::with_capacity(h.len() / 16);
    for chunk in b.chunks(16) {
        let mut bytes = [0u8; 8];
        for (i, pair) in chunk.chunks(2).enumerate() {
            bytes[i] = digit(pair[0])? * 16 + digit(pair[1])?;
        }
        out.push(f64::from_le_bytes(bytes));
    }
    Some(out)
}

/// State of a job between slices.
struct Job {
    bounded: bool,
    chunk_frames: f64,
    dt: f64,
    playhead: f64,
    rate: f64,
    wanted: f64,
    look_ahead: f64,
}

impl Job {
    /// Frame where an unbounded run pauses (+∞ when bounded): the look-ahead rounded up to a chunk boundary.
    fn until_frame(&self) -> f64 {
        if self.bounded {
            return f64::INFINITY;
        }
        let t = (self.playhead + self.look_ahead.max(3.0 * self.rate)).max(self.wanted);
        let f = self.chunk_frames;
        ((t / self.dt - 1e-9).ceil() / f).ceil() * f
    }

    /// Apply a control; Some(stop?) for Stop / Cancel.
    fn apply(&mut self, c: Control) -> Option<bool> {
        match c {
            Control::Playhead { t, rate } => {
                self.playhead = t;
                self.rate = rate.max(0.0);
            }
            Control::ComputeTo(t) => self.wanted = self.wanted.max(t),
            Control::LookAhead(s) => self.look_ahead = s.max(1.0),
            Control::Stop => return Some(true),
            Control::Cancel => return Some(false),
        }
        None
    }
}

fn ms(d: Duration) -> f64 {
    d.as_secs_f64() * 1000.0
}

/// Run one job to its end (or until it is cancelled or the page is gone).
pub fn run_job(req: Value, rx: Receiver<Control>, mut post: Post) {
    if !post(frame(&json!({ "type": "engine", "engine": "native" }), None)) {
        return;
    }
    let created = scene_of(&req).and_then(|scene| {
        let mut run_req = json!({ "scene": scene });
        match req.get("duration") {
            None => {}
            Some(Value::String(s)) if s == "scene" => {}
            Some(v) => run_req["duration"] = v.clone(),
        }
        RunDriver::create(&run_req)
    });
    let mut d = match created {
        Ok(d) => d,
        Err(m) => {
            let _ = post(frame(&json!({ "type": "error", "message": m.key, "msg": m.to_json() }), None));
            return;
        }
    };
    let info = d.info(ABI_VERSION);
    let num = |k: &str, def: f64| req.get(k).and_then(|v| v.as_f64()).unwrap_or(def);
    let budget_ms = num("budgetMs", 0.0);
    let mut job = Job {
        bounded: !info["duration"].is_null(),
        chunk_frames: info["chunkFrames"].as_f64().unwrap_or(1.0),
        dt: info["dt"].as_f64().unwrap_or(1.0),
        playhead: num("playhead", 0.0),
        rate: num("rate", 1.0).max(0.0),
        wanted: 0.0,
        look_ahead: num("lookAhead", DEFAULT_LOOK_AHEAD).max(1.0),
    };
    let started = json!({ "type": "started", "K": info["K"], "size": info["size"], "chunkFrames": info["chunkFrames"], "duration": info["duration"], "dt": info["dt"] });
    if !post(frame(&started, None)) {
        return;
    }
    let mut compute_ms = 0.0;
    let mut last_post = Instant::now();
    let mut steps: f64 = 2000.0;
    let mut stop = false;

    loop {
        // Control messages received meanwhile
        loop {
            match rx.try_recv() {
                Ok(c) => match job.apply(c) {
                    Some(true) => stop = true,
                    Some(false) => return,
                    None => {}
                },
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => return,
            }
        }
        let mut status = BUDGET;
        if stop {
            d.stop();
            status = FINISHED;
        } else {
            d.set_until(job.until_frame());
            let slice = Instant::now();
            while status == BUDGET && slice.elapsed() < SLICE {
                let c0 = Instant::now();
                status = d.advance(steps as u64);
                let t = ms(c0.elapsed());
                if status == BUDGET {
                    steps = (steps * if t > 0.05 { CALL_MS / t } else { 4.0 }).round().clamp(100.0, (1u64 << 22) as f64);
                }
                if job.bounded && budget_ms > 0.0 && status == BUDGET && compute_ms + ms(slice.elapsed()) > budget_ms {
                    d.fail_budget(budget_ms);
                    status = FINISHED;
                }
            }
            compute_ms += ms(slice.elapsed());
        }
        let finished = status == FINISHED;
        let paused = status == PAUSED;
        if finished || paused || last_post.elapsed() >= TAIL {
            d.request_tail();
        }
        let mut deltas = Vec::new();
        while let Some(x) = d.take_delta() {
            deltas.push(x);
        }
        if finished {
            let end = d.end().unwrap_or_else(|| json!({ "completed": false, "error": null, "hash": "" }));
            let last = deltas.pop();
            for x in &deltas {
                if !post(frame(&json!({ "type": "partial", "paused": false, "computeMs": compute_ms }), Some(x))) {
                    return;
                }
            }
            let _ = post(frame(&json!({ "type": "done", "end": end, "computeMs": compute_ms }), last.as_deref()));
            return;
        }
        if !deltas.is_empty() {
            last_post = Instant::now();
            let n = deltas.len();
            for (i, x) in deltas.iter().enumerate() {
                if !post(frame(&json!({ "type": "partial", "paused": paused && i + 1 == n, "computeMs": compute_ms }), Some(x))) {
                    return;
                }
            }
        }
        if paused {
            // Wait until the playhead, a requested time or the look-ahead moves the until frame past what is recorded
            let recorded = d.run.frame_count() as f64 - 1.0;
            loop {
                match rx.recv_timeout(Duration::from_secs(3600)) {
                    Ok(c) => match job.apply(c) {
                        Some(true) => {
                            stop = true;
                            break;
                        }
                        Some(false) => return,
                        None => {
                            if job.until_frame() > recorded {
                                break;
                            }
                        }
                    },
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode(m: &[u8]) -> (Value, Option<Vec<u8>>) {
        let n = u32::from_le_bytes([m[0], m[1], m[2], m[3]]) as usize;
        let h: Value = serde_json::from_slice(&m[4..4 + n]).unwrap();
        (h, if m.len() > 4 + n { Some(m[4 + n..].to_vec()) } else { None })
    }

    fn scene() -> Value {
        json!({
            "format": "velophi-scene", "version": 4, "name": "drop",
            "settings": { "gravity": { "x": 0, "y": -9.8 }, "duration": 1.0, "outputStep": 1.0 / 600.0 },
            "bodies": [{ "id": "b", "name": "b", "kind": "dynamic", "shape": { "type": "circle", "radius": 0.1 }, "position": { "x": 0, "y": 1 }, "mass": 1 }],
            "connectors": []
        })
    }

    #[test]
    fn a_bounded_job_streams_started_partials_and_done() {
        let engine = Arc::new(Engine::new());
        let (tx, rx) = mpsc::channel();
        engine.start(json!({ "scene": scene(), "budgetMs": 60000, "duration": "scene" }), Box::new(move |m| tx.send(m).is_ok()));
        let msgs: Vec<(Value, Option<Vec<u8>>)> = rx.iter().map(|m| decode(&m)).collect();
        assert_eq!(msgs[0].0["type"], "engine");
        assert_eq!(msgs[1].0["type"], "started");
        let last = msgs.last().unwrap();
        assert_eq!(last.0["type"], "done");
        assert_eq!(last.0["end"]["completed"], true);
        // Same deltas as the driver run directly
        let mut d = RunDriver::create(&json!({ "scene": scene() })).unwrap();
        while d.advance(1 << 20) != FINISHED {}
        d.request_tail();
        let mut direct = Vec::new();
        while let Some(x) = d.take_delta() {
            direct.push(x);
        }
        assert_eq!(d.end().unwrap()["hash"], last.0["end"]["hash"]);
        let streamed: usize = msgs.iter().filter_map(|m| m.1.as_ref()).count();
        assert!(streamed >= 1 && !direct.is_empty());
    }

    #[test]
    fn controls_parse() {
        assert_eq!(Control::from_json(&json!({ "type": "playhead", "t": 1.5, "rate": 2 })), Some(Control::Playhead { t: 1.5, rate: 2.0 }));
        assert_eq!(Control::from_json(&json!({ "type": "stop" })), Some(Control::Stop));
        assert_eq!(Control::from_json(&json!({ "type": "nope" })), None);
    }
}
