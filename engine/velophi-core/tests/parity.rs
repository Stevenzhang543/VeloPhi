//! Native parity without Node: the fixture scenes (templates, golden and special scenes written by
//! `node scripts/parity.mjs --write-fixtures`) must reproduce the TypeScript fingerprints — bounded runs the
//! 26.49 `recordingHash`, unbounded runs of 10 s the rolling fingerprint — and every chunk must rebuild from its
//! checkpoint bit for bit.

use std::path::PathBuf;

use serde_json::Value;
use velophi_core::scene::parse_scene;
use velophi_core::simulation::{rebuild_chunk, simulate, Advance, SimOptions, SimulationRun};

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures")
}

fn expected() -> Vec<Value> {
    let text = std::fs::read_to_string(fixtures().join("expected.json")).expect("expected.json");
    serde_json::from_str::<Value>(&text).expect("JSON").as_array().expect("list").clone()
}

fn load(file: &str) -> String {
    std::fs::read_to_string(fixtures().join(file)).expect("fixture")
}

#[test]
fn bounded_fingerprints_match_typescript() {
    for e in expected() {
        let (scene, _) = parse_scene(&load(e["file"].as_str().unwrap())).expect("scene");
        let run = simulate(&scene, SimOptions::default()).expect("run");
        assert_eq!(run.hash, e["bounded"]["hash"].as_str().unwrap(), "{}", e["name"]);
        assert_eq!(run.frame_count(), e["bounded"]["frames"].as_u64().unwrap(), "{}", e["name"]);
        assert_eq!(run.events.len() as u64, e["bounded"]["events"].as_u64().unwrap(), "{}", e["name"]);
    }
}

fn unbounded(text: &str, until: f64) -> SimulationRun {
    let (scene, _) = parse_scene(text).expect("scene");
    let mut run = SimulationRun::new(&scene, SimOptions { duration: Some(None), ..SimOptions::default() }).expect("run");
    let f = run.chunk_frames as f64;
    let frame = ((until / run.dt - 1e-9).ceil() / f).ceil() * f;
    if run.advance(u64::MAX, frame) != Advance::Finished {
        run.stop();
    }
    run
}

#[test]
fn unbounded_rolling_fingerprints_match_typescript() {
    for e in expected() {
        let run = unbounded(&load(e["file"].as_str().unwrap()), 10.0);
        assert_eq!(run.hash, e["unbounded10"]["hash"].as_str().unwrap(), "{}", e["name"]);
        assert_eq!(run.frame_count(), e["unbounded10"]["frames"].as_u64().unwrap(), "{}", e["name"]);
        assert_eq!(run.stop_reason.map(|r| r.name()), e["unbounded10"]["stopReason"].as_str(), "{}", e["name"]);
    }
}

#[test]
fn chunks_rebuild_bit_for_bit() {
    for name in ["special-mixed.json", "special-pile.json", "golden-bounce.json", "template-movable-pulley.json", "template-board-block.json"] {
        let run = unbounded(&load(name), 6.0);
        let size = run.size;
        let f = run.chunk_frames as u64;
        let mut checked = 0;
        for c in &run.closed {
            let Some(Some(cp)) = run.checkpoints.get(c.chunk) else { continue };
            let next = run.checkpoints.get(c.chunk + 1).and_then(|x| x.as_ref());
            let end = if next.is_some() { c.first + f } else { c.first + c.frames as u64 - 1 };
            let r = rebuild_chunk(run.system.clone(), cp, run.options().clone(), end).expect("rebuild");
            let orig = run.frames[c.chunk].as_ref().unwrap();
            let n = c.frames;
            assert!(r.chunk.count >= n, "{name} chunk {}", c.chunk);
            assert!(r.chunk.states[..n * size].iter().zip(&orig.states[..n * size]).all(|(a, b)| a.to_bits() == b.to_bits()), "{name} chunk {}", c.chunk);
            assert_eq!(r.chunk.segment[..n], orig.segment[..n]);
            assert_eq!(r.again.as_deref(), Some(cp.as_slice()));
            if let Some(next) = next {
                assert_eq!(r.next.as_deref().map(|v| v.iter().map(|x| x.to_bits()).collect::<Vec<_>>()), Some(next.iter().map(|x| x.to_bits()).collect()));
            }
            checked += 1;
        }
        assert!(checked > 0, "{name}");
    }
}

#[test]
fn format_2_files_keep_their_fingerprint() {
    let mut doc: Value = serde_json::from_str(&load("template-board-block.json")).unwrap();
    doc["version"] = Value::from(2);
    doc["settings"]["duration"] = Value::from(2.5);
    doc["settings"].as_object_mut().unwrap().remove("legacyDuration");
    doc["settings"].as_object_mut().unwrap().remove("stopAt");
    let (scene, _) = parse_scene(&doc.to_string()).unwrap();
    assert_eq!(scene.settings.duration, Some(2.5));
    assert_eq!(scene.settings.legacy_duration, 2.5);
    let run = simulate(&scene, SimOptions::default()).unwrap();
    assert_eq!(run.hash, "bb1283491e1cb3e5cbd463c2d839f0cdee83def25231b27c43a11edd10c9d2d5");
}

#[test]
fn invalid_scenes_are_rejected_with_keys() {
    let mut doc: Value = serde_json::from_str(&load("template-incline.json")).unwrap();
    doc["settings"]["duration"] = Value::from(4000);
    assert_eq!(parse_scene(&doc.to_string()).unwrap_err().key, "scene.durationRange");
    let mut doc: Value = serde_json::from_str(&load("template-variable-force.json")).unwrap();
    doc["connectors"][0]["expr"]["x"] = Value::from("sin(t)");
    let e = parse_scene(&doc.to_string()).unwrap_err();
    assert_eq!(e.key, "scene.forceExprInvalid");
    assert!(parse_scene("{").is_err());
    assert_eq!(parse_scene("{\"format\": \"x\"}").unwrap_err().key, "scene.wrongFormat");
}
