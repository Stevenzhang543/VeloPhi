//! The C ABI exercised natively, as the JavaScript loader will drive it: create, advance in small slices with a
//! look-ahead pause, take the deltas, assemble frames and events, and compare with a direct run of the core
//! (bit for bit, chunk digests and fingerprint); rebuild chunks through the ABI; errors through last_error.

use std::path::PathBuf;

use serde_json::Value;
use velophi_core::scene::parse_scene;
use velophi_core::sha256::Sha256;
use velophi_core::simulation::{Advance, SimOptions, SimulationRun};
use velophi_core::transport::{parse_container, read_f64s, read_i32s};
use velophi_wasm::*;

fn fixture(name: &str) -> String {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../velophi-core/tests/fixtures").join(name);
    std::fs::read_to_string(p).expect("fixture")
}

/// Read bytes through the byte-return convention (grow the buffer on a negative answer).
fn take(f: impl Fn(*mut u8, u32) -> i32) -> Option<Vec<u8>> {
    let mut buf = vec![0u8; 64];
    loop {
        let r = f(buf.as_mut_ptr(), buf.len() as u32);
        if r == 0 {
            return None;
        }
        if r < 0 {
            buf.resize((-r) as usize, 0);
            continue;
        }
        buf.truncate(r as usize);
        return Some(buf);
    }
}

fn create(json: &str) -> u32 {
    run_create(json.as_ptr(), json.len() as u32)
}

struct Assembled {
    states: Vec<f64>,
    segment: Vec<i32>,
    events: Vec<(f64, Vec<f64>)>,
    rolling: Vec<String>,
    checkpoints: Vec<(usize, Vec<f64>)>,
    deltas: usize,
}

fn absorb(a: &mut Assembled, bytes: &[u8]) {
    a.deltas += 1;
    let (doc, blob) = parse_container(bytes).expect("container");
    let from = doc["fromFrame"].as_u64().unwrap() as usize;
    let states = read_f64s(blob, &doc["states"]).unwrap();
    let seg = read_i32s(blob, &doc["frameSegment"]).unwrap();
    let size = if seg.is_empty() { 1 } else { states.len() / seg.len() };
    // Frames may overlap what a tail delta already sent: overwrite from `from`
    if !seg.is_empty() {
        a.states.truncate(from * size);
        a.states.extend_from_slice(&states);
        a.segment.truncate(from);
        a.segment.extend_from_slice(&seg);
    }
    let ev_from = doc["eventsFrom"].as_u64().unwrap() as usize;
    a.events.truncate(ev_from);
    for e in doc["events"].as_array().unwrap() {
        a.events.push((e["t"].as_f64().unwrap(), read_f64s(blob, &e["after"]).unwrap()));
    }
    for c in doc["chunks"].as_array().unwrap() {
        a.rolling.push(c["rollingHex"].as_str().unwrap().to_string());
    }
    for c in doc["checkpoints"].as_array().unwrap() {
        a.checkpoints.push((c["chunk"].as_u64().unwrap() as usize, read_f64s(blob, &c["data"]).unwrap()));
    }
}

/// Drive a run like the worker: slices of `budget` iterations, pause at `until` frames, take deltas.
fn drive(h: u32, budget: u32, until: f64) -> Assembled {
    let mut a = Assembled { states: Vec::new(), segment: Vec::new(), events: Vec::new(), rolling: Vec::new(), checkpoints: Vec::new(), deltas: 0 };
    run_set_until(h, until);
    let mut slices = 0;
    loop {
        let status = run_advance(h, budget);
        slices += 1;
        if slices % 7 == 0 {
            run_request_tail(h);
        }
        if status == 1 {
            run_stop(h);
        }
        while let Some(bytes) = take(|p, l| run_take_delta(h, p, l)) {
            absorb(&mut a, &bytes);
        }
        match status {
            0 => continue,
            1 | 2 => return a,
            _ => panic!("bad handle"),
        }
    }
}

fn direct(json: &str, duration: Option<Option<f64>>, until: f64) -> SimulationRun {
    let (scene, _) = parse_scene(json).unwrap();
    let mut run = SimulationRun::new(&scene, SimOptions { duration, ..SimOptions::default() }).unwrap();
    if run.advance(u64::MAX, until) != Advance::Finished {
        run.stop();
    }
    run
}

fn all_states(run: &SimulationRun) -> Vec<f64> {
    let mut out = Vec::new();
    for k in 0..run.frame_count() {
        let c = run.chunk_of(k).unwrap();
        let j = (k - c.first) as usize;
        out.extend_from_slice(&c.states[j * run.size..(j + 1) * run.size]);
    }
    out
}

fn bits(v: &[f64]) -> Vec<u64> {
    v.iter().map(|x| x.to_bits()).collect()
}

#[test]
fn streamed_unbounded_run_equals_direct_run() {
    for name in ["template-board-block.json", "special-mixed.json", "golden-bounce.json", "special-pile.json"] {
        let scene = fixture(name);
        let input = format!("{{\"scene\": {scene}, \"duration\": null}}");
        let h = create(&input);
        assert_ne!(h, 0, "{name}");
        let info: Value = serde_json::from_slice(&take(|p, l| run_info(h, p, l)).unwrap()).unwrap();
        assert!(info["K"].is_null() && info["duration"].is_null());
        let f = info["chunkFrames"].as_f64().unwrap();
        let until = 5.0 * f;
        let a = drive(h, 97, until);
        let run = direct(&scene, Some(None), until);
        assert_eq!(bits(&a.states), bits(&all_states(&run)), "{name}: frames");
        let segs: Vec<i32> = (0..run.frame_count())
            .map(|k| {
                let c = run.chunk_of(k).unwrap();
                c.segment[(k - c.first) as usize]
            })
            .collect();
        assert_eq!(a.segment, segs, "{name}: frame segments");
        assert_eq!(a.events.len(), run.events.len(), "{name}: events");
        for (x, e) in a.events.iter().zip(&run.events) {
            assert_eq!(x.0.to_bits(), e.t.to_bits());
            assert_eq!(bits(&x.1), bits(&e.after));
        }
        let rolling: Vec<String> = run.closed.iter().map(|c| velophi_core::sha256::to_hex(&c.rolling)).collect();
        assert_eq!(a.rolling, rolling, "{name}: rolling chain");
        let end: Value = serde_json::from_slice(&take(|p, l| run_end(h, p, l)).unwrap()).unwrap();
        assert_eq!(end["hash"].as_str().unwrap(), run.hash, "{name}: fingerprint");
        assert_eq!(end["stopReason"].as_str(), run.stop_reason.map(|r| r.name()));
        // Checkpoints posted once each, equal to the direct run's
        for (c, data) in &a.checkpoints {
            assert_eq!(bits(data), bits(run.checkpoints[*c].as_ref().unwrap()), "{name}: checkpoint {c}");
        }
        // Rebuild a chunk through the ABI from a posted checkpoint
        if let Some((c, cp)) = a.checkpoints.iter().find(|(c, _)| *c == 1) {
            let rb = run_create(input.as_ptr(), input.len() as u32);
            let bytes: Vec<u8> = cp.iter().flat_map(|v| v.to_le_bytes()).collect();
            let n = run_rebuild_chunk(rb, bytes.as_ptr(), bytes.len() as u32, (c + 1) as f64 * f);
            assert!(n > 0, "{name}: rebuild");
            let out = take(|p, l| run_take_output(rb, p, l)).unwrap();
            let (doc, blob) = parse_container(&out).unwrap();
            let states = read_f64s(blob, &doc["chunk"]["states"]).unwrap();
            let first = doc["chunk"]["first"].as_u64().unwrap() as usize;
            let size = run.size;
            let orig = &a.states[first * size..first * size + states.len().min(f as usize * size)];
            assert_eq!(bits(&states[..orig.len()]), bits(orig), "{name}: rebuilt frames");
            run_free(rb);
        }
        run_free(h);
    }
}

#[test]
fn streamed_bounded_run_keeps_the_2649_fingerprint() {
    let scene = fixture("template-board-block.json");
    let h = create(&format!("{{\"scene\": {scene}, \"duration\": 2.5}}"));
    let a = drive(h, 50, f64::INFINITY);
    let end: Value = serde_json::from_slice(&take(|p, l| run_end(h, p, l)).unwrap()).unwrap();
    assert_eq!(end["hash"], "bb1283491e1cb3e5cbd463c2d839f0cdee83def25231b27c43a11edd10c9d2d5");
    assert_eq!(end["completed"], true);
    // The assembled frames hash to the same recordingHash (events added as the TypeScript receiver does)
    let mut hasher = Sha256::new();
    hasher.update_f64(&a.states);
    for (t, after) in &a.events {
        hasher.update_f64(&[*t]);
        hasher.update_f64(after);
    }
    assert_eq!(hasher.digest_hex(), "bb1283491e1cb3e5cbd463c2d839f0cdee83def25231b27c43a11edd10c9d2d5");
    assert!(a.deltas >= 3);
    run_free(h);
}

#[test]
fn errors_are_reported_as_message_json() {
    assert_eq!(create("{not json"), 0);
    let e: Value = serde_json::from_slice(&take(|p, l| last_error(p, l)).unwrap()).unwrap();
    assert_eq!(e["key"], "scene.invalidJson");
    let mut doc: Value = serde_json::from_str(&fixture("template-spring.json")).unwrap();
    doc["connectors"][0]["stiffness"] = Value::from(0);
    assert_eq!(create(&doc.to_string()), 0);
    let e: Value = serde_json::from_slice(&take(|p, l| last_error(p, l)).unwrap()).unwrap();
    assert_eq!(e["key"], "scene.stiffnessNotPositive");
    assert_eq!(run_advance(12345, 10), -1);
    // A small buffer is answered with the size needed and nothing is consumed
    let h = create(&fixture("template-pendulum.json"));
    assert!(run_info(h, std::ptr::null_mut(), 0) < 0);
    run_cancel(h);
    let end: Value = serde_json::from_slice(&take(|p, l| run_end(h, p, l)).unwrap()).unwrap();
    assert_eq!(end["error"]["key"], "err.cancelled");
    assert_eq!(end["stopReason"], "user");
    run_free(h);
    // alloc / dealloc round trip
    let p = alloc(1024);
    assert!(!p.is_null());
    unsafe { dealloc(p, 1024) };
}
