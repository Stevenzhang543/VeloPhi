//! Node-API module over the C ABI of `velophi-wasm` (26.53, D69): the front-end tests load the same Rust code
//! natively when no freshly built WebAssembly is available (the container has no wasm32 target). Functions take
//! and return numbers and Uint8Array/Float64Array; the TypeScript loader (`src/engine/core.ts`) wraps them in the
//! same backend interface as the WebAssembly module. Tests only: never part of an application build.
#![allow(clippy::missing_safety_doc)]

use std::ffi::{c_char, c_int, c_void};
use std::ptr::{null, null_mut};

type Env = *mut c_void;
type Val = *mut c_void;
type Info = *mut c_void;
type Status = c_int;
type Callback = unsafe extern "C" fn(Env, Info) -> Val;

extern "C" {
    fn napi_create_function(env: Env, name: *const c_char, len: usize, cb: Callback, data: *mut c_void, result: *mut Val) -> Status;
    fn napi_set_named_property(env: Env, object: Val, name: *const c_char, value: Val) -> Status;
    fn napi_get_cb_info(env: Env, info: Info, argc: *mut usize, argv: *mut Val, this: *mut Val, data: *mut *mut c_void) -> Status;
    fn napi_get_value_double(env: Env, value: Val, result: *mut f64) -> Status;
    fn napi_create_double(env: Env, value: f64, result: *mut Val) -> Status;
    fn napi_get_null(env: Env, result: *mut Val) -> Status;
    fn napi_get_undefined(env: Env, result: *mut Val) -> Status;
    fn napi_get_typedarray_info(env: Env, arr: Val, ty: *mut c_int, length: *mut usize, data: *mut *mut c_void, buffer: *mut Val, offset: *mut usize) -> Status;
    fn napi_create_arraybuffer(env: Env, len: usize, data: *mut *mut c_void, result: *mut Val) -> Status;
    fn napi_create_typedarray(env: Env, ty: c_int, length: usize, buffer: Val, offset: usize, result: *mut Val) -> Status;
    fn napi_create_string_utf8(env: Env, s: *const c_char, len: usize, result: *mut Val) -> Status;
}

const UINT8: c_int = 1;

unsafe fn args<const N: usize>(env: Env, info: Info) -> [Val; N] {
    let mut argc = N;
    let mut argv = [null_mut(); N];
    napi_get_cb_info(env, info, &mut argc, argv.as_mut_ptr(), null_mut(), null_mut());
    argv
}

unsafe fn num(env: Env, v: Val) -> f64 {
    let mut x = f64::NAN;
    napi_get_value_double(env, v, &mut x);
    x
}

unsafe fn ret_num(env: Env, x: f64) -> Val {
    let mut r = null_mut();
    napi_create_double(env, x, &mut r);
    r
}

unsafe fn undefined(env: Env) -> Val {
    let mut r = null_mut();
    napi_get_undefined(env, &mut r);
    r
}

unsafe fn null_val(env: Env) -> Val {
    let mut r = null_mut();
    napi_get_null(env, &mut r);
    r
}

/// Bytes of a typed array argument (any element type).
unsafe fn bytes<'a>(env: Env, v: Val) -> (&'a mut [u8], c_int) {
    let mut ty: c_int = 0;
    let mut len = 0usize;
    let mut data: *mut c_void = null_mut();
    let mut buf = null_mut();
    let mut off = 0usize;
    napi_get_typedarray_info(env, v, &mut ty, &mut len, &mut data, &mut buf, &mut off);
    let size = match ty {
        0..=2 => 1,
        3 | 4 => 2,
        5..=7 => 4,
        _ => 8,
    };
    if data.is_null() || len == 0 {
        return (&mut [], ty);
    }
    (std::slice::from_raw_parts_mut(data as *mut u8, len * size), ty)
}

/// A new Uint8Array holding `b` (null when empty).
unsafe fn ret_bytes(env: Env, b: &[u8]) -> Val {
    if b.is_empty() {
        return null_val(env);
    }
    let mut data: *mut c_void = null_mut();
    let mut ab = null_mut();
    napi_create_arraybuffer(env, b.len(), &mut data, &mut ab);
    std::ptr::copy_nonoverlapping(b.as_ptr(), data as *mut u8, b.len());
    let mut r = null_mut();
    napi_create_typedarray(env, UINT8, b.len(), ab, 0, &mut r);
    r
}

/// Call a byte-returning export (n > 0 bytes, −n buffer too small, 0 nothing) and collect the result.
fn take(f: impl Fn(*mut u8, u32) -> i32) -> Vec<u8> {
    let r = f(null_mut(), 0);
    if r >= 0 {
        return Vec::new();
    }
    let mut v = vec![0u8; (-r) as usize];
    let n = f(v.as_mut_ptr(), v.len() as u32);
    v.truncate(n.max(0) as usize);
    v
}

use velophi_wasm as w;

macro_rules! export {
    ($name:ident, |$env:ident, $info:ident| $body:block) => {
        unsafe extern "C" fn $name($env: Env, $info: Info) -> Val $body
    };
}

export!(abi_version, |env, _info| { ret_num(env, w::abi_version() as f64) });
export!(scene_version, |env, _info| { ret_num(env, w::scene_version() as f64) });
export!(last_error, |env, _info| {
    let b = take(|p, l| w::last_error(p, l));
    let mut r = null_mut();
    napi_create_string_utf8(env, b.as_ptr() as *const c_char, b.len(), &mut r);
    r
});
export!(session_create, |env, info| {
    let [a] = args::<1>(env, info);
    let (b, _) = bytes(env, a);
    ret_num(env, w::session_create(b.as_ptr(), b.len() as u32) as f64)
});
export!(session_simulate, |env, info| {
    let [a] = args::<1>(env, info);
    let (b, _) = bytes(env, a);
    ret_num(env, w::session_simulate(b.as_ptr(), b.len() as u32) as f64)
});
export!(session_apply, |env, info| {
    let [h, a] = args::<2>(env, info);
    let (b, _) = bytes(env, a);
    ret_num(env, w::session_apply(num(env, h) as u32, b.as_ptr(), b.len() as u32) as f64)
});
export!(session_finish, |env, info| {
    let [h, a] = args::<2>(env, info);
    let (b, _) = bytes(env, a);
    ret_num(env, w::session_finish(num(env, h) as u32, b.as_ptr(), b.len() as u32) as f64)
});
export!(session_call, |env, info| {
    let [h, a] = args::<2>(env, info);
    let hh = num(env, h) as u32;
    let (b, _) = bytes(env, a);
    let n = w::session_call(hh, b.as_ptr(), b.len() as u32);
    if n <= 0 {
        return null_val(env);
    }
    let p = w::session_output(hh);
    ret_bytes(env, std::slice::from_raw_parts(p, n as usize))
});
export!(session_frame_count, |env, info| {
    let [h] = args::<1>(env, info);
    ret_num(env, w::session_frame_count(num(env, h) as u32))
});
export!(session_state, |env, info| {
    let [h, k, out] = args::<3>(env, info);
    let (b, _) = bytes(env, out);
    ret_num(env, w::session_state(num(env, h) as u32, num(env, k), b.as_mut_ptr() as *mut f64) as f64)
});
export!(session_install, |env, info| {
    let [h, c, a] = args::<3>(env, info);
    let (b, _) = bytes(env, a);
    ret_num(env, w::session_install(num(env, h) as u32, num(env, c) as u32, b.as_ptr(), b.len() as u32) as f64)
});
export!(session_cheap, |env, info| {
    let [h, k] = args::<2>(env, info);
    ret_num(env, w::session_cheap(num(env, h) as u32, num(env, k)) as f64)
});
export!(session_segment, |env, info| {
    let [h, k] = args::<2>(env, info);
    ret_num(env, w::session_segment(num(env, h) as u32, num(env, k)) as f64)
});
export!(session_impact_loss, |env, info| {
    let [h, k] = args::<2>(env, info);
    ret_num(env, w::session_impact_loss(num(env, h) as u32, num(env, k)))
});
export!(session_free, |env, info| {
    let [h] = args::<1>(env, info);
    w::session_free(num(env, h) as u32);
    undefined(env)
});
export!(calc_call, |env, info| {
    let [a] = args::<1>(env, info);
    let (b, _) = bytes(env, a);
    let n = w::calc_call(b.as_ptr(), b.len() as u32);
    if n <= 0 {
        return null_val(env);
    }
    ret_bytes(env, std::slice::from_raw_parts(w::calc_output(), n as usize))
});
export!(run_create, |env, info| {
    let [a] = args::<1>(env, info);
    let (b, _) = bytes(env, a);
    ret_num(env, w::run_create(b.as_ptr(), b.len() as u32) as f64)
});
export!(run_info, |env, info| {
    let [h] = args::<1>(env, info);
    let hh = num(env, h) as u32;
    ret_bytes(env, &take(|p, l| w::run_info(hh, p, l)))
});
export!(run_set_until, |env, info| {
    let [h, f] = args::<2>(env, info);
    w::run_set_until(num(env, h) as u32, num(env, f));
    undefined(env)
});
export!(run_advance, |env, info| {
    let [h, n] = args::<2>(env, info);
    ret_num(env, w::run_advance(num(env, h) as u32, num(env, n) as u32) as f64)
});
export!(run_time, |env, info| {
    let [h] = args::<1>(env, info);
    ret_num(env, w::run_time(num(env, h) as u32))
});
export!(run_frame_count, |env, info| {
    let [h] = args::<1>(env, info);
    ret_num(env, w::run_frame_count(num(env, h) as u32))
});
export!(run_request_tail, |env, info| {
    let [h] = args::<1>(env, info);
    w::run_request_tail(num(env, h) as u32);
    undefined(env)
});
export!(run_take_delta, |env, info| {
    let [h] = args::<1>(env, info);
    let hh = num(env, h) as u32;
    ret_bytes(env, &take(|p, l| w::run_take_delta(hh, p, l)))
});
export!(run_end, |env, info| {
    let [h] = args::<1>(env, info);
    let hh = num(env, h) as u32;
    ret_bytes(env, &take(|p, l| w::run_end(hh, p, l)))
});
export!(run_stop, |env, info| {
    let [h] = args::<1>(env, info);
    w::run_stop(num(env, h) as u32);
    undefined(env)
});
export!(run_cancel, |env, info| {
    let [h] = args::<1>(env, info);
    w::run_cancel(num(env, h) as u32);
    undefined(env)
});
export!(run_fail_budget, |env, info| {
    let [h, ms] = args::<2>(env, info);
    w::run_fail_budget(num(env, h) as u32, num(env, ms));
    undefined(env)
});
export!(run_rebuild_chunk, |env, info| {
    let [h, cp, end] = args::<3>(env, info);
    let hh = num(env, h) as u32;
    let (b, _) = bytes(env, cp);
    let n = w::run_rebuild_chunk(hh, b.as_ptr(), b.len() as u32, num(env, end));
    if n <= 0 {
        return null_val(env);
    }
    ret_bytes(env, std::slice::from_raw_parts(w::run_output(hh), n as usize))
});
export!(run_free, |env, info| {
    let [h] = args::<1>(env, info);
    w::run_free(num(env, h) as u32);
    undefined(env)
});

// ---- Native engine (26.53, D68): the desktop engine's jobs, polled instead of a Tauri channel ----

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, OnceLock};

fn engine() -> &'static Arc<velophi_native::Engine> {
    static E: OnceLock<Arc<velophi_native::Engine>> = OnceLock::new();
    E.get_or_init(|| Arc::new(velophi_native::Engine::new()))
}

type Queue = Arc<Mutex<VecDeque<Vec<u8>>>>;
fn queues() -> &'static Mutex<HashMap<u32, Queue>> {
    static Q: OnceLock<Mutex<HashMap<u32, Queue>>> = OnceLock::new();
    Q.get_or_init(|| Mutex::new(HashMap::new()))
}

unsafe fn json_arg(env: Env, v: Val) -> serde_json::Value {
    let (b, _) = bytes(env, v);
    serde_json::from_slice(b).unwrap_or(serde_json::Value::Null)
}

export!(native_info, |env, _info| {
    let s = velophi_native::info().to_string();
    let mut r = null_mut();
    napi_create_string_utf8(env, s.as_ptr() as *const c_char, s.len(), &mut r);
    r
});
export!(native_start, |env, info| {
    let [a] = args::<1>(env, info);
    let req = json_arg(env, a);
    let q: Queue = Arc::new(Mutex::new(VecDeque::new()));
    let q2 = Arc::clone(&q);
    let id = engine().start(req, Box::new(move |m| { q2.lock().expect("queue").push_back(m); true }));
    queues().lock().expect("queues").insert(id, q);
    ret_num(env, id as f64)
});
export!(native_poll, |env, info| {
    let [h] = args::<1>(env, info);
    let id = num(env, h) as u32;
    let q = queues().lock().expect("queues").get(&id).cloned();
    let m = q.and_then(|q| q.lock().expect("queue").pop_front());
    match m {
        Some(m) => ret_bytes(env, &m),
        None => null_val(env),
    }
});
export!(native_running, |env, _info| { ret_num(env, engine().running() as f64) });
export!(native_control, |env, info| {
    let [h, c] = args::<2>(env, info);
    let ok = match velophi_native::Control::from_json(&json_arg(env, c)) {
        Some(c) => engine().control(num(env, h) as u32, c),
        None => false,
    };
    ret_num(env, if ok { 1.0 } else { 0.0 })
});
export!(native_release, |env, info| {
    let [h] = args::<1>(env, info);
    queues().lock().expect("queues").remove(&(num(env, h) as u32));
    undefined(env)
});
export!(native_rebuild, |env, info| {
    let [a] = args::<1>(env, info);
    match engine().rebuild(json_arg(env, a)) {
        Ok(b) => ret_bytes(env, &b),
        Err(_) => null_val(env),
    }
});

/// Module entry point (Node-API version 1 registration).
#[no_mangle]
pub unsafe extern "C" fn napi_register_module_v1(env: Env, exports: Val) -> Val {
    let list: &[(&str, Callback)] = &[
        ("abiVersion", abi_version),
        ("sceneVersion", scene_version),
        ("lastError", last_error),
        ("sessionCreate", session_create),
        ("sessionSimulate", session_simulate),
        ("sessionApply", session_apply),
        ("sessionFinish", session_finish),
        ("sessionCall", session_call),
        ("sessionFrameCount", session_frame_count),
        ("sessionState", session_state),
        ("sessionInstall", session_install),
        ("sessionCheap", session_cheap),
        ("sessionSegment", session_segment),
        ("sessionImpactLoss", session_impact_loss),
        ("sessionFree", session_free),
        ("calcCall", calc_call),
        ("runCreate", run_create),
        ("runInfo", run_info),
        ("runSetUntil", run_set_until),
        ("runAdvance", run_advance),
        ("runTime", run_time),
        ("runFrameCount", run_frame_count),
        ("runRequestTail", run_request_tail),
        ("runTakeDelta", run_take_delta),
        ("runEnd", run_end),
        ("runStop", run_stop),
        ("runCancel", run_cancel),
        ("runFailBudget", run_fail_budget),
        ("runRebuildChunk", run_rebuild_chunk),
        ("runFree", run_free),
        ("nativeInfo", native_info),
        ("nativeStart", native_start),
        ("nativePoll", native_poll),
        ("nativeRunning", native_running),
        ("nativeControl", native_control),
        ("nativeRelease", native_release),
        ("nativeRebuild", native_rebuild),
    ];
    for (name, cb) in list {
        let c = std::ffi::CString::new(*name).expect("name");
        let mut f = null_mut();
        napi_create_function(env, c.as_ptr(), name.len(), *cb, null_mut(), &mut f);
        napi_set_named_property(env, exports, c.as_ptr(), f);
    }
    let _ = null::<u8>();
    exports
}
