//! WebAssembly interface of the VeloPhi core: a raw C ABI, no wasm-bindgen (decision D29). The JavaScript side
//! allocates input buffers with `alloc`, passes pointers and lengths, and copies results out of linear memory.
//! The full contract — functions, status codes, the delta container and the worker protocol — is in
//! `engine/ABI.md`.
//!
//! Conventions: handles are u32 (0 = none); functions that return bytes take `(out_ptr, out_len)` and return an
//! i32: n > 0 bytes written, −n when the buffer is too small (n bytes needed; nothing is consumed), 0 when there
//! is nothing. Errors are message JSON `{ key, params }` read with `last_error`.

use std::cell::RefCell;

use serde_json::Value;
use velophi_core::driver::{f64s_from_le, parse_run_request, RunDriver};
use velophi_core::message::Message;
use velophi_core::scene::parse_scene_value;
use velophi_core::session::{RunEnd, Session, SessionInit};
use velophi_core::simulation::{Advance, Fallback, SimulationRun, StopReason};
use velophi_core::transport::{end_json, DeltaWriter};

/// Version of this ABI (bumped on any incompatible change).
pub const ABI_VERSION: u32 = 2;

struct Handle {
    driver: RunDriver,
    output: Vec<u8>,
}

thread_local! {
    static HANDLES: RefCell<Vec<Option<Box<Handle>>>> = const { RefCell::new(Vec::new()) };
    static LAST_ERROR: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

fn set_error(m: &Message) {
    LAST_ERROR.with(|e| *e.borrow_mut() = m.to_json().to_string().into_bytes());
}

fn with_handle<T>(h: u32, f: impl FnOnce(&mut Handle) -> T) -> Option<T> {
    HANDLES.with(|hs| {
        let mut hs = hs.borrow_mut();
        let slot = hs.get_mut((h as usize).checked_sub(1)?)?;
        slot.as_deref_mut().map(f)
    })
}

/// Copy `src` to `(out_ptr, out_len)` per the byte-return convention.
fn copy_out(src: &[u8], out_ptr: *mut u8, out_len: u32) -> i32 {
    if src.is_empty() {
        return 0;
    }
    if (out_len as usize) < src.len() || out_ptr.is_null() {
        return -(src.len() as i32);
    }
    // SAFETY: the caller passes a writable buffer of out_len ≥ src.len() bytes in linear memory.
    unsafe { std::ptr::copy_nonoverlapping(src.as_ptr(), out_ptr, src.len()) };
    src.len() as i32
}

/// Bytes at `(ptr, len)` as a slice.
fn input<'a>(ptr: *const u8, len: u32) -> &'a [u8] {
    if ptr.is_null() || len == 0 {
        return &[];
    }
    // SAFETY: the caller passes a readable buffer of len bytes that stays alive for the call.
    unsafe { std::slice::from_raw_parts(ptr, len as usize) }
}

/// ABI version.
#[no_mangle]
pub extern "C" fn abi_version() -> u32 {
    ABI_VERSION
}

/// Newest scene file format the engine reads (26.51: 4; 26.54: 6; 26.55: 7).
#[no_mangle]
pub extern "C" fn scene_version() -> u32 {
    velophi_core::scene::SCENE_VERSION as u32
}

/// Allocate `len` bytes of linear memory for the caller (free with `dealloc(ptr, len)`).
#[no_mangle]
pub extern "C" fn alloc(len: u32) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len.max(1) as usize);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// Free memory returned by `alloc` (same length).
///
/// # Safety
/// `ptr` must come from `alloc(len)` and not be freed twice.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: u32) {
    if !ptr.is_null() {
        drop(Vec::from_raw_parts(ptr, 0, len.max(1) as usize));
    }
}

/// The message JSON of the last failed call.
#[no_mangle]
pub extern "C" fn last_error(out_ptr: *mut u8, out_len: u32) -> i32 {
    LAST_ERROR.with(|e| copy_out(&e.borrow(), out_ptr, out_len))
}

/// Create a run from scene JSON (a scene document, or `{ scene, duration?, chunkSeconds?, maxEventsPerInstant?,
/// fallback? }`). Returns a handle, or 0 on error (see `last_error`).
#[no_mangle]
pub extern "C" fn run_create(ptr: *const u8, len: u32) -> u32 {
    match RunDriver::create_bytes(input(ptr, len)) {
        Ok(driver) => HANDLES.with(|hs| {
            let mut hs = hs.borrow_mut();
            let boxed = Some(Box::new(Handle { driver, output: Vec::new() }));
            if let Some(i) = hs.iter().position(|s| s.is_none()) {
                hs[i] = boxed;
                i as u32 + 1
            } else {
                hs.push(boxed);
                hs.len() as u32
            }
        }),
        Err(m) => {
            set_error(&m);
            0
        }
    }
}

/// The 'started' information of a run: `{ K, size, chunkFrames, duration, dt, loadWarnings, abi }` (K and duration
/// null when unbounded).
#[no_mangle]
pub extern "C" fn run_info(handle: u32, out_ptr: *mut u8, out_len: u32) -> i32 {
    with_handle(handle, |h| copy_out(h.driver.info(ABI_VERSION).to_string().as_bytes(), out_ptr, out_len)).unwrap_or(0)
}

/// Pause the run at the top of the loop once frame `frame` is recorded (+∞: no pause). Never changes a result.
#[no_mangle]
pub extern "C" fn run_set_until(handle: u32, frame: f64) {
    with_handle(handle, |h| h.driver.set_until(frame));
}

/// Run at most `budget_steps` loop iterations. Status: 0 budget used (call again), 1 paused at the until frame,
/// 2 finished, −1 unknown handle.
#[no_mangle]
pub extern "C" fn run_advance(handle: u32, budget_steps: u32) -> i32 {
    with_handle(handle, |h| h.driver.advance(budget_steps as u64)).unwrap_or(-1)
}

/// Simulated time reached (s).
#[no_mangle]
pub extern "C" fn run_time(handle: u32) -> f64 {
    with_handle(handle, |h| h.driver.run.t).unwrap_or(f64::NAN)
}

/// Number of recorded frames.
#[no_mangle]
pub extern "C" fn run_frame_count(handle: u32) -> f64 {
    with_handle(handle, |h| h.driver.run.frame_count() as f64).unwrap_or(f64::NAN)
}

/// The next take_delta also returns the frames, segments and events of the open chunk (a tail delta).
#[no_mangle]
pub extern "C" fn run_request_tail(handle: u32) {
    with_handle(handle, |h| h.driver.request_tail());
}

/// Take the next delta (container of engine/ABI.md): one per closed chunk, then a tail delta when requested or
/// when the run has ended. Byte-return convention; 0 when there is nothing new.
#[no_mangle]
pub extern "C" fn run_take_delta(handle: u32, out_ptr: *mut u8, out_len: u32) -> i32 {
    with_handle(handle, |h| {
        let Some(front) = h.driver.peek_delta() else { return 0 };
        let r = copy_out(front, out_ptr, out_len);
        if r > 0 {
            h.driver.pop_delta();
        }
        r
    })
    .unwrap_or(0)
}

/// End state `{ completed, error, hash, stopReason }` of a finished run (0 while it runs).
#[no_mangle]
pub extern "C" fn run_end(handle: u32, out_ptr: *mut u8, out_len: u32) -> i32 {
    with_handle(handle, |h| match h.driver.end() {
        Some(e) => copy_out(e.to_string().as_bytes(), out_ptr, out_len),
        None => 0,
    })
    .unwrap_or(0)
}

/// End the run here without an error (user stop of an unbounded run); deltas with the rest follow.
#[no_mangle]
pub extern "C" fn run_stop(handle: u32) {
    with_handle(handle, |h| h.driver.stop());
}

/// Cancel the run (error `err.cancelled`).
#[no_mangle]
pub extern "C" fn run_cancel(handle: u32) {
    with_handle(handle, |h| h.driver.cancel());
}

/// End a bounded run because its wall-clock budget is exhausted (`err.budget { seconds, t }`).
#[no_mangle]
pub extern "C" fn run_fail_budget(handle: u32, budget_ms: f64) {
    with_handle(handle, |h| h.driver.fail_budget(budget_ms));
}

/// Recompute a chunk from a checkpoint (little-endian doubles at `(cp_ptr, cp_len)` bytes) through the same
/// code path, up to the loop top at `end_frame`. Returns the size of the result container (`run_output` /
/// `run_take_output`), or 0 on error (`last_error`).
#[no_mangle]
pub extern "C" fn run_rebuild_chunk(handle: u32, cp_ptr: *const u8, cp_len: u32, end_frame: f64) -> i32 {
    let cp = f64s_from_le(input(cp_ptr, cp_len));
    with_handle(handle, |h| match h.driver.rebuild_chunk(&cp, end_frame as u64) {
        Ok(bytes) => {
            h.output = bytes;
            h.output.len() as i32
        }
        Err(m) => {
            set_error(&m);
            0
        }
    })
    .unwrap_or(0)
}

/// Copy out the result of the last `run_rebuild_chunk` (byte-return convention).
#[no_mangle]
pub extern "C" fn run_take_output(handle: u32, out_ptr: *mut u8, out_len: u32) -> i32 {
    with_handle(handle, |h| {
        let r = copy_out(&h.output, out_ptr, out_len);
        if r > 0 {
            h.output.clear();
        }
        r
    })
    .unwrap_or(0)
}

/// Free a run.
#[no_mangle]
pub extern "C" fn run_free(handle: u32) {
    HANDLES.with(|hs| {
        if let Some(slot) = hs.borrow_mut().get_mut((handle as usize).wrapping_sub(1)) {
            *slot = None;
        }
    });
}

// ---- Sessions (ABI 2, 26.53 D66/D67) ----

struct SessionHandle {
    session: Session,
    output: Vec<u8>,
}

thread_local! {
    static SESSIONS: RefCell<Vec<Option<Box<SessionHandle>>>> = const { RefCell::new(Vec::new()) };
    static CALC_OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

fn with_session<T>(h: u32, f: impl FnOnce(&mut SessionHandle) -> T) -> Option<T> {
    SESSIONS.with(|hs| {
        let mut hs = hs.borrow_mut();
        let slot = hs.get_mut((h as usize).checked_sub(1)?)?;
        slot.as_deref_mut().map(f)
    })
}

fn session_init(doc: &Value) -> Result<SessionInit, Message> {
    let mut init = SessionInit::default();
    if let Some(v) = doc.get("chunkFrames").and_then(|v| v.as_f64()) {
        init.chunk_frames = Some(v.max(1.0) as usize);
    }
    init.duration = doc.get("duration").and_then(|v| v.as_f64());
    if let Some(v) = doc.get("budgetBytes").and_then(|v| v.as_f64()) {
        init.budget_bytes = v;
    }
    if let Some(v) = doc.get("maxEventsPerInstant").and_then(|v| v.as_f64()) {
        init.max_events_per_instant = v;
    }
    match doc.get("fallback") {
        None | Some(Value::Null) => {}
        Some(Value::Bool(false)) => init.fallback = None,
        Some(v) => match (v.get("events").and_then(|x| x.as_f64()), v.get("window").and_then(|x| x.as_f64())) {
            (Some(events), Some(window)) => init.fallback = Some(Fallback { events, window }),
            _ => return Err(Message::new("abi.badOption").text("option", "fallback")),
        },
    }
    Ok(init)
}

/// Create a session: `{ scene, chunkFrames?, duration?, budgetBytes?, maxEventsPerInstant?, fallback? }` (the run's
/// 'started' information; a session without `chunkFrames` and without deltas is a scene session for the editor).
/// Returns a handle, or 0 on error (`last_error`).
#[no_mangle]
pub extern "C" fn session_create(ptr: *const u8, len: u32) -> u32 {
    let made = (|| -> Result<Session, Message> {
        let doc: Value = serde_json::from_slice(input(ptr, len)).map_err(|e| Message::new("scene.invalidJson").text("detail", e.to_string()))?;
        let scene = doc.get("scene").cloned().ok_or_else(|| Message::new("abi.noScene"))?;
        let init = session_init(&doc)?;
        Session::new(&scene, init)
    })();
    match made {
        Ok(session) => SESSIONS.with(|hs| {
            let mut hs = hs.borrow_mut();
            let boxed = Some(Box::new(SessionHandle { session, output: Vec::new() }));
            if let Some(i) = hs.iter().position(|s| s.is_none()) {
                hs[i] = boxed;
                i as u32 + 1
            } else {
                hs.push(boxed);
                hs.len() as u32
            }
        }),
        Err(m) => {
            set_error(&m);
            0
        }
    }
}

/// Apply one delta container of the run (bytes as the run produced them). 1 ok, 0 error (`last_error`).
#[no_mangle]
pub extern "C" fn session_apply(handle: u32, ptr: *const u8, len: u32) -> i32 {
    let bytes = input(ptr, len);
    with_session(handle, |h| match h.session.apply(bytes) {
        Ok(()) => 1,
        Err(m) => {
            set_error(&m);
            0
        }
    })
    .unwrap_or(0)
}

/// End the recording with the run's end state `{ completed, error, hash, stopReason }`. 1 ok, 0 error.
#[no_mangle]
pub extern "C" fn session_finish(handle: u32, ptr: *const u8, len: u32) -> i32 {
    let end = (|| -> Result<RunEnd, Message> {
        let v: Value = serde_json::from_slice(input(ptr, len)).map_err(|e| Message::new("scene.invalidJson").text("detail", e.to_string()))?;
        Ok(RunEnd {
            completed: v.get("completed").and_then(|x| x.as_bool()).unwrap_or(false),
            error: v.get("error").cloned().unwrap_or(Value::Null),
            hash: v.get("hash").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            stop_reason: v.get("stopReason").and_then(|x| x.as_str()).map(String::from),
        })
    })();
    let end = match end {
        Ok(e) => e,
        Err(m) => {
            set_error(&m);
            return 0;
        }
    };
    with_session(handle, |h| match h.session.finish(end) {
        Ok(()) => 1,
        Err(m) => {
            set_error(&m);
            0
        }
    })
    .unwrap_or(0)
}

/// Run one calculation request (JSON `{ op, … }`, engine/CALC.md). Returns the size of the result container (read
/// it at `session_output`), or 0 on error (`last_error`).
#[no_mangle]
pub extern "C" fn session_call(handle: u32, ptr: *const u8, len: u32) -> i32 {
    let req: Value = match serde_json::from_slice(input(ptr, len)) {
        Ok(v) => v,
        Err(e) => {
            set_error(&Message::new("err.internal").text("message", e.to_string()));
            return 0;
        }
    };
    with_session(handle, |h| match velophi_core::api::call_bytes(&mut h.session, &req) {
        Ok(bytes) => {
            h.output = bytes;
            h.output.len() as i32
        }
        Err(m) => {
            set_error(&m);
            0
        }
    })
    .unwrap_or(0)
}

/// Pointer to the result of the last `session_call` (valid until the next call on this session).
#[no_mangle]
pub extern "C" fn session_output(handle: u32) -> *const u8 {
    with_session(handle, |h| h.output.as_ptr()).unwrap_or(std::ptr::null())
}

/// Frames recorded so far.
#[no_mangle]
pub extern "C" fn session_frame_count(handle: u32) -> f64 {
    with_session(handle, |h| h.session.frame_count as f64).unwrap_or(f64::NAN)
}

/// Write the state of frame k (`size` doubles) to `out_ptr`. 1 ok, 0 error (`last_error`).
#[no_mangle]
pub extern "C" fn session_state(handle: u32, k: f64, out_ptr: *mut f64) -> i32 {
    with_session(handle, |h| match h.session.state(k as u64) {
        Ok(x) => {
            // SAFETY: the caller passes room for `size` doubles.
            unsafe { std::ptr::copy_nonoverlapping(x.as_ptr(), out_ptr, x.len()) };
            1
        }
        Err(m) => {
            set_error(&m);
            0
        }
    })
    .unwrap_or(0)
}

/// Install chunk `chunk` recomputed elsewhere (a rebuild container). 1 installed, 0 rejected.
#[no_mangle]
pub extern "C" fn session_install(handle: u32, chunk: u32, ptr: *const u8, len: u32) -> i32 {
    let bytes = input(ptr, len);
    with_session(handle, |h| i32::from(h.session.install_remote(chunk as usize, bytes))).unwrap_or(0)
}

/// Free a session.
#[no_mangle]
pub extern "C" fn session_free(handle: u32) {
    SESSIONS.with(|hs| {
        if let Some(slot) = hs.borrow_mut().get_mut((handle as usize).wrapping_sub(1)) {
            *slot = None;
        }
    });
}

/// A stateless calculation (`calc.rs`). Returns the size of the result (read it at `calc_output`), 0 on error.
#[no_mangle]
pub extern "C" fn calc_call(ptr: *const u8, len: u32) -> i32 {
    let req: Value = match serde_json::from_slice(input(ptr, len)) {
        Ok(v) => v,
        Err(e) => {
            set_error(&Message::new("err.internal").text("message", e.to_string()));
            return 0;
        }
    };
    match velophi_core::calc::call_bytes(&req) {
        Ok(bytes) => CALC_OUTPUT.with(|o| {
            let n = bytes.len() as i32;
            *o.borrow_mut() = bytes;
            n
        }),
        Err(m) => {
            set_error(&m);
            0
        }
    }
}

/// Pointer to the result of the last `calc_call`.
#[no_mangle]
pub extern "C" fn calc_output() -> *const u8 {
    CALC_OUTPUT.with(|o| o.borrow().as_ptr())
}

/// Pointer to the result of the last `run_rebuild_chunk` (raw container bytes, for `session_install`).
#[no_mangle]
pub extern "C" fn run_output(handle: u32) -> *const u8 {
    with_handle(handle, |h| h.output.as_ptr()).unwrap_or(std::ptr::null())
}

/// Run a whole simulation into a new session (synchronous; branches, the handbook examples, the self-check and
/// tests): `{ scene, duration?, chunkSeconds?, budgetBytes?, maxSteps? }`. Returns a session handle, or 0 on error.
#[no_mangle]
pub extern "C" fn session_simulate(ptr: *const u8, len: u32) -> u32 {
    let made = (|| -> Result<Session, Message> {
        let doc: Value = serde_json::from_slice(input(ptr, len)).map_err(|e| Message::new("scene.invalidJson").text("detail", e.to_string()))?;
        let (scene_doc, mut opts) = parse_run_request(&doc)?;
        let (scene, _) = parse_scene_value(&scene_doc)?;
        // As `simulate` does: an unbounded scene runs for its legacy duration unless `duration` or `until` says otherwise
        if opts.duration.is_none() && scene.settings.duration.is_none() && doc.get("until").is_none() {
            opts.duration = Some(Some(scene.settings.legacy_duration));
        }
        let mut run = SimulationRun::new(&scene, opts)?;
        let mut init = SessionInit { chunk_frames: Some(run.chunk_frames), duration: if run.bounded { Some(run.t_end) } else { None }, ..SessionInit::default() };
        if let Some(v) = doc.get("budgetBytes").and_then(|v| v.as_f64()) {
            init.budget_bytes = v;
        }
        let mut session = Session::new(&scene_doc, init)?;
        let mut writer = DeltaWriter::new(true);
        let max_steps = doc.get("maxSteps").and_then(|v| v.as_f64()).unwrap_or(f64::INFINITY);
        let mut steps = 0.0;
        let until = if run.bounded { f64::INFINITY } else { doc.get("until").and_then(|v| v.as_f64()).map(|t| (t / run.dt - 1e-9).ceil()).unwrap_or(f64::INFINITY) };
        loop {
            let st = run.advance(100_000, until);
            steps += 100_000.0;
            for d in writer.next(&mut run, false) {
                session.apply(&d)?;
            }
            match st {
                Advance::Finished => break,
                Advance::Paused => {
                    run.stop();
                }
                Advance::Budget if steps >= max_steps => {
                    let m = Message::new("err.budget").num("seconds", 0.0).num("t", run.t);
                    run.end_with_error(m, StopReason::Error);
                }
                Advance::Budget => {}
            }
        }
        for d in writer.next(&mut run, true) {
            session.apply(&d)?;
        }
        let e = end_json(&run);
        session.finish(RunEnd {
            completed: e.get("completed").and_then(|x| x.as_bool()).unwrap_or(false),
            error: e.get("error").cloned().unwrap_or(Value::Null),
            hash: e.get("hash").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            stop_reason: e.get("stopReason").and_then(|x| x.as_str()).map(String::from),
        })?;
        Ok(session)
    })();
    match made {
        Ok(session) => SESSIONS.with(|hs| {
            let mut hs = hs.borrow_mut();
            let boxed = Some(Box::new(SessionHandle { session, output: Vec::new() }));
            if let Some(i) = hs.iter().position(|s| s.is_none()) {
                hs[i] = boxed;
                i as u32 + 1
            } else {
                hs.push(boxed);
                hs.len() as u32
            }
        }),
        Err(m) => {
            set_error(&m);
            0
        }
    }
}

/// Whether frame k can be read without recomputing a chunk (1) or not (0).
#[no_mangle]
pub extern "C" fn session_cheap(handle: u32, k: f64) -> i32 {
    with_session(handle, |h| i32::from(h.session.cheap(k as u64))).unwrap_or(0)
}

/// Segment index of frame k (−1 on error).
#[no_mangle]
pub extern "C" fn session_segment(handle: u32, k: f64) -> i32 {
    with_session(handle, |h| h.session.segment(k as u64).map(|s| s as i32).unwrap_or(-1)).unwrap_or(-1)
}

/// Cumulative impact loss at frame k (NaN on error).
#[no_mangle]
pub extern "C" fn session_impact_loss(handle: u32, k: f64) -> f64 {
    with_session(handle, |h| h.session.impact_loss(k as u64).unwrap_or(f64::NAN)).unwrap_or(f64::NAN)
}
