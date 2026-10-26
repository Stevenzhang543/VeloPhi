//! WebAssembly interface of the VeloPhi core: a raw C ABI, no wasm-bindgen (decision D29). The JavaScript side
//! allocates input buffers with `alloc`, passes pointers and lengths, and copies results out of linear memory.
//! The full contract — functions, status codes, the delta container and the worker protocol — is in
//! `engine/ABI.md`.
//!
//! Conventions: handles are u32 (0 = none); functions that return bytes take `(out_ptr, out_len)` and return an
//! i32: n > 0 bytes written, −n when the buffer is too small (n bytes needed; nothing is consumed), 0 when there
//! is nothing. Errors are message JSON `{ key, params }` read with `last_error`.

use std::cell::RefCell;
use std::collections::VecDeque;

use serde_json::{json, Value};
use velophi_core::js::js_round;
use velophi_core::message::Message;
use velophi_core::scene::parse_scene_value;
use velophi_core::simulation::{rebuild_chunk, Advance, Fallback, SimOptions, SimulationRun, StopReason};
use velophi_core::transport::{end_json, event_json, jnum, Blob, DeltaWriter};

/// Version of this ABI (bumped on any incompatible change).
pub const ABI_VERSION: u32 = 1;

struct Handle {
    run: SimulationRun,
    writer: DeltaWriter,
    queue: VecDeque<Vec<u8>>,
    tail: bool,
    output: Vec<u8>,
    load_warnings: Vec<Message>,
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

/// Newest scene file format the engine reads (26.51: 4). The loader refuses an older engine for newer scenes.
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

fn parse_options(doc: &Value) -> Result<(Value, SimOptions), Message> {
    if doc.get("format").is_some() {
        return Ok((doc.clone(), SimOptions::default()));
    }
    let scene = doc.get("scene").cloned().ok_or_else(|| Message::new("abi.noScene"))?;
    let mut o = SimOptions::default();
    match doc.get("duration") {
        None => {}
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

fn create(json_in: &[u8]) -> Result<Handle, Message> {
    let doc: Value = serde_json::from_slice(json_in).map_err(|e| Message::new("scene.invalidJson").text("detail", e.to_string()))?;
    let (scene_doc, opts) = parse_options(&doc)?;
    let (scene, load_warnings) = parse_scene_value(&scene_doc)?;
    let run = SimulationRun::new(&scene, opts)?;
    Ok(Handle { run, writer: DeltaWriter::new(true), queue: VecDeque::new(), tail: false, output: Vec::new(), load_warnings })
}

/// Create a run from scene JSON (a scene document, or `{ scene, duration?, chunkSeconds?, maxEventsPerInstant?,
/// fallback? }`). Returns a handle, or 0 on error (see `last_error`).
#[no_mangle]
pub extern "C" fn run_create(ptr: *const u8, len: u32) -> u32 {
    match create(input(ptr, len)) {
        Ok(h) => HANDLES.with(|hs| {
            let mut hs = hs.borrow_mut();
            let boxed = Some(Box::new(h));
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

/// The 'started' information of a run: `{ K, size, chunkFrames, duration, loadWarnings }` (K and duration null
/// when unbounded).
#[no_mangle]
pub extern "C" fn run_info(handle: u32, out_ptr: *mut u8, out_len: u32) -> i32 {
    with_handle(handle, |h| {
        let r = &h.run;
        let doc = json!({
            "K": r.k_max,
            "size": r.size,
            "chunkFrames": r.chunk_frames,
            "duration": if r.bounded { jnum(r.t_end) } else { Value::Null },
            "dt": jnum(r.dt),
            "loadWarnings": h.load_warnings.iter().map(|w| w.to_json()).collect::<Vec<_>>(),
            "abi": ABI_VERSION,
        });
        copy_out(doc.to_string().as_bytes(), out_ptr, out_len)
    })
    .unwrap_or(0)
}

/// Pause the run at the top of the loop once frame `frame` is recorded (+∞: no pause). Never changes a result.
#[no_mangle]
pub extern "C" fn run_set_until(handle: u32, frame: f64) {
    with_handle(handle, |h| h.run.set_pause_frame(frame));
}

/// Run at most `budget_steps` loop iterations. Status: 0 budget used (call again), 1 paused at the until frame,
/// 2 finished, −1 unknown handle.
#[no_mangle]
pub extern "C" fn run_advance(handle: u32, budget_steps: u32) -> i32 {
    with_handle(handle, |h| {
        let until = h.run.pause_frame();
        match h.run.advance(budget_steps as u64, until) {
            Advance::Budget => 0,
            Advance::Paused => 1,
            Advance::Finished => 2,
        }
    })
    .unwrap_or(-1)
}

/// Simulated time reached (s).
#[no_mangle]
pub extern "C" fn run_time(handle: u32) -> f64 {
    with_handle(handle, |h| h.run.t).unwrap_or(f64::NAN)
}

/// Number of recorded frames.
#[no_mangle]
pub extern "C" fn run_frame_count(handle: u32) -> f64 {
    with_handle(handle, |h| h.run.frame_count() as f64).unwrap_or(f64::NAN)
}

/// The next take_delta also returns the frames, segments and events of the open chunk (a tail delta).
#[no_mangle]
pub extern "C" fn run_request_tail(handle: u32) {
    with_handle(handle, |h| h.tail = true);
}

/// Take the next delta (container of engine/ABI.md): one per closed chunk, then a tail delta when requested or
/// when the run has ended. Byte-return convention; 0 when there is nothing new.
#[no_mangle]
pub extern "C" fn run_take_delta(handle: u32, out_ptr: *mut u8, out_len: u32) -> i32 {
    with_handle(handle, |h| {
        if h.queue.is_empty() {
            let tail = std::mem::take(&mut h.tail);
            let deltas = h.writer.next(&mut h.run, tail);
            h.queue.extend(deltas);
        }
        let Some(front) = h.queue.front() else { return 0 };
        let r = copy_out(front, out_ptr, out_len);
        if r > 0 {
            h.queue.pop_front();
        }
        r
    })
    .unwrap_or(0)
}

/// End state `{ completed, error, hash, stopReason }` of a finished run (0 while it runs).
#[no_mangle]
pub extern "C" fn run_end(handle: u32, out_ptr: *mut u8, out_len: u32) -> i32 {
    with_handle(handle, |h| if h.run.finished { copy_out(end_json(&h.run).to_string().as_bytes(), out_ptr, out_len) } else { 0 }).unwrap_or(0)
}

/// End the run here without an error (user stop of an unbounded run); deltas with the rest follow.
#[no_mangle]
pub extern "C" fn run_stop(handle: u32) {
    with_handle(handle, |h| h.run.stop());
}

/// Cancel the run (error `err.cancelled`).
#[no_mangle]
pub extern "C" fn run_cancel(handle: u32) {
    with_handle(handle, |h| h.run.cancel(None));
}

/// End a bounded run because its wall-clock budget is exhausted (`err.budget { seconds, t }`), as the
/// TypeScript engine does with `budgetMs`.
#[no_mangle]
pub extern "C" fn run_fail_budget(handle: u32, budget_ms: f64) {
    with_handle(handle, |h| {
        let t = h.run.t;
        let m = Message::new("err.budget").num("seconds", js_round(budget_ms / 1000.0)).num("t", t);
        h.run.end_with_error(m, StopReason::Error);
    });
}

/// Recompute a chunk from a checkpoint (little-endian doubles at `(cp_ptr, cp_len)` bytes) through the same
/// code path, up to the loop top at `end_frame`. Returns the size of the result container (take it with
/// `run_take_output`), or 0 on error (`last_error`).
#[no_mangle]
pub extern "C" fn run_rebuild_chunk(handle: u32, cp_ptr: *const u8, cp_len: u32, end_frame: f64) -> i32 {
    let bytes = input(cp_ptr, cp_len);
    let cp: Vec<f64> = bytes.chunks_exact(8).map(|c| f64::from_le_bytes(c.try_into().expect("8 bytes"))).collect();
    with_handle(handle, |h| {
        let sys = h.run.system.clone();
        match rebuild_chunk(sys.clone(), &cp, h.run.options().clone(), end_frame as u64) {
            Ok(r) => {
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
                h.output = blob.finish(&doc);
                h.output.len() as i32
            }
            Err(m) => {
                set_error(&m);
                0
            }
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
