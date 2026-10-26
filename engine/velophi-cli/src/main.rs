//! `velophi-cli`: runs a scene with the Rust core and writes the whole recording for the parity harness
//! (`scripts/parity.mjs`), or times it.
//!
//! ```text
//! velophi-cli run <scene.json> [--duration T|null|scene] [--until T] [--chunk S] [--out file.bin] [--bench N]
//! velophi-cli batch <list.txt>      one "<scene.json> <out.bin> [flags…]" per line (one process for many scenes)
//! ```
//!
//! The output is a container (engine/ABI.md) whose JSON holds the run's segments, events, warnings, stats,
//! closed chunks (digests), checkpoints and end state, and whose blob holds all frames.

use std::process::ExitCode;
use std::time::Instant;

use serde_json::{json, Value};
use velophi_core::dmath;
use velophi_core::expr::{check_force_expr, ExprArena, SwitchKind, ENV_SIZE};
use velophi_core::message::Message;
use velophi_core::scene::parse_scene;
use velophi_core::simulation::{rebuild_chunk, Advance, SimOptions, SimulationRun};
use velophi_core::transport::{chunk_info_json, end_json, event_json, jnum, segment_json, stats_json, Blob, DeltaWriter};

struct Args {
    scene: String,
    out: Option<String>,
    duration: Option<Option<f64>>,
    until: Option<f64>,
    chunk: f64,
    bench: usize,
    verify_rebuild: bool,
    deltas: Option<String>,
}

fn parse_args(list: &[String]) -> Result<Args, String> {
    let mut a = Args { scene: String::new(), out: None, duration: None, until: None, chunk: 1.0, bench: 0, verify_rebuild: false, deltas: None };
    let mut i = 0;
    while i < list.len() {
        let v = |i: usize| list.get(i + 1).cloned().ok_or_else(|| format!("missing value for {}", list[i]));
        match list[i].as_str() {
            "--out" => {
                a.out = Some(v(i)?);
                i += 1;
            }
            "--duration" => {
                let s = v(i)?;
                a.duration = match s.as_str() {
                    "null" => Some(None),
                    "scene" => None,
                    _ => Some(Some(s.parse().map_err(|_| format!("bad duration {s}"))?)),
                };
                i += 1;
            }
            "--until" => {
                let s = v(i)?;
                a.until = Some(s.parse().map_err(|_| format!("bad time {s}"))?);
                i += 1;
            }
            "--chunk" => {
                let s = v(i)?;
                a.chunk = s.parse().map_err(|_| format!("bad chunk length {s}"))?;
                i += 1;
            }
            "--bench" => {
                let s = v(i)?;
                a.bench = s.parse().map_err(|_| format!("bad count {s}"))?;
                i += 1;
            }
            "--verify-rebuild" => a.verify_rebuild = true,
            "--deltas" => {
                a.deltas = Some(v(i)?);
                i += 1;
            }
            s if s.starts_with("--") => return Err(format!("unknown option {s}")),
            s => {
                if a.scene.is_empty() {
                    a.scene = s.to_string();
                } else {
                    return Err(format!("unexpected argument {s}"));
                }
            }
        }
        i += 1;
    }
    if a.scene.is_empty() {
        return Err("missing scene file".into());
    }
    Ok(a)
}

/// Run the scene once: to its end, or for unbounded runs with --until to the chunk boundary at that time and
/// then stop (as the worker's look-ahead does).
fn run_once(text: &str, a: &Args) -> Result<SimulationRun, Message> {
    let (scene, _) = parse_scene(text)?;
    let opts = SimOptions { duration: a.duration, chunk_seconds: a.chunk, ..SimOptions::default() };
    let mut run = SimulationRun::new(&scene, opts)?;
    match a.until {
        Some(t) if !run.bounded => {
            let f = run.chunk_frames as f64;
            let frame = ((t / run.dt - 1e-9).ceil() / f).ceil() * f;
            if run.advance(u64::MAX, frame) != Advance::Finished {
                run.stop();
            }
        }
        _ => {
            run.advance(u64::MAX, f64::INFINITY);
        }
    }
    Ok(run)
}

/// Rebuild every closed chunk from its checkpoint and compare frames, events and checkpoints with the run.
fn verify_rebuild(run: &SimulationRun) -> (usize, Vec<String>) {
    let mut checked = 0;
    let mut problems = Vec::new();
    let size = run.size;
    let f = run.chunk_frames as u64;
    let same = |a: &[f64], b: &[f64]| a.len() == b.len() && a.iter().zip(b).all(|(x, y)| x.to_bits() == y.to_bits());
    for c in &run.closed {
        let Some(Some(cp)) = run.checkpoints.get(c.chunk) else { continue };
        let next = run.checkpoints.get(c.chunk + 1).and_then(|x| x.as_ref());
        let end = if next.is_some() { c.first + f } else { c.first + c.frames as u64 - 1 };
        checked += 1;
        let r = match rebuild_chunk(run.system.clone(), cp, run.options().clone(), end) {
            Ok(r) => r,
            Err(m) => {
                problems.push(format!("chunk {}: rebuild failed {}", c.chunk, m.to_json()));
                continue;
            }
        };
        let orig = run.frames[c.chunk].as_ref().expect("chunk in memory");
        let n = c.frames;
        if r.chunk.count < n
            || !same(&r.chunk.states[..n * size], &orig.states[..n * size])
            || r.chunk.segment[..n] != orig.segment[..n]
            || !same(&r.chunk.impact_loss[..n], &orig.impact_loss[..n])
        {
            problems.push(format!("chunk {}: frames differ", c.chunk));
        }
        if r.again.as_deref() != Some(cp.as_slice()) && !r.again.as_deref().is_some_and(|a| same(a, cp)) {
            problems.push(format!("chunk {}: checkpoint does not restore exactly", c.chunk));
        }
        if let Some(next) = next {
            if !r.next.as_deref().is_some_and(|a| same(a, next)) {
                problems.push(format!("chunk {}: next checkpoint differs", c.chunk + 1));
            }
        }
        for e in &r.events {
            if e.index >= c.events_to {
                break;
            }
            let Some(o) = e.index.checked_sub(run.event_base()).and_then(|i| run.events.get(i)) else { continue };
            let ok = o.t.to_bits() == e.t.to_bits()
                && same(&o.after, &e.after)
                && o.segment == e.segment
                && o.triggers == e.triggers
                && o.changes.iter().map(|c| c.kind()).eq(e.changes.iter().map(|c| c.kind()));
            if !ok {
                problems.push(format!("chunk {}: event {} differs", c.chunk, e.index));
                break;
            }
        }
    }
    (checked, problems)
}

fn encode_run(run: &SimulationRun, ms: f64) -> Vec<u8> {
    let sys = run.system.clone();
    let size = run.size;
    let n = run.frame_count() as usize;
    let mut states = Vec::with_capacity(n * size);
    let mut seg = Vec::with_capacity(n);
    let mut loss = Vec::with_capacity(n);
    for k in 0..n as u64 {
        let c = run.chunk_of(k).expect("all frames in memory");
        let j = (k - c.first) as usize;
        states.extend_from_slice(&c.states[j * size..(j + 1) * size]);
        seg.push(c.segment[j]);
        loss.push(c.impact_loss[j]);
    }
    let mut blob = Blob::default();
    let frames = blob.f64s(&states);
    let frame_segment = blob.i32s(&seg);
    let impact_loss = blob.f64s(&loss);
    let segments: Vec<Value> = run.segments.iter().map(|s| segment_json(s, f64::INFINITY, &mut blob)).collect();
    let events: Vec<Value> = run.events.iter().map(|e| event_json(&sys, e, &mut blob)).collect();
    let chunks: Vec<Value> = run.closed.iter().map(|c| chunk_info_json(c, &mut blob)).collect();
    let checkpoints: Vec<Value> =
        run.checkpoints.iter().enumerate().filter_map(|(i, c)| c.as_ref().map(|d| json!({ "chunk": i, "data": blob.f64s(d) }))).collect();
    let doc = json!({
        "size": size,
        "dt": jnum(run.dt),
        "chunkFrames": run.chunk_frames,
        "bounded": run.bounded,
        "K": run.k_max,
        "T": jnum(run.t_end),
        "frameCount": n,
        "frames": frames,
        "frameSegment": frame_segment,
        "impactLoss": impact_loss,
        "segments": segments,
        "events": events,
        "warnings": run.warnings.iter().map(|w| w.to_json()).collect::<Vec<_>>(),
        "stats": stats_json(&run.stats),
        "end": end_json(run),
        "chunks": chunks,
        "checkpoints": checkpoints,
        "rolling": run.rolling_fingerprint().map(|r| json!({ "hash": r.hash, "t": jnum(r.t), "chunks": r.chunks })),
        "reducedFrom": run.reduced_from.map(jnum),
        "ms": ms,
    });
    blob.finish(&doc)
}

fn command_run(a: &Args) -> Result<(), String> {
    let text = std::fs::read_to_string(&a.scene).map_err(|e| format!("{}: {e}", a.scene))?;
    let t0 = Instant::now();
    let run = match run_once(&text, a) {
        Ok(r) => r,
        Err(m) => {
            let doc = json!({ "createError": m.to_json() });
            if let Some(out) = &a.out {
                std::fs::write(out, Blob::default().finish(&doc)).map_err(|e| format!("{out}: {e}"))?;
            }
            println!("{}", doc);
            return Ok(());
        }
    };
    let ms = t0.elapsed().as_secs_f64() * 1000.0;
    if a.bench > 0 {
        let mut times = Vec::with_capacity(a.bench);
        for _ in 0..a.bench {
            let t0 = Instant::now();
            let r = run_once(&text, a).map_err(|m| m.to_json().to_string())?;
            times.push(t0.elapsed().as_secs_f64() * 1000.0);
            std::hint::black_box(r.k);
        }
        times.sort_by(|x, y| x.total_cmp(y));
        println!("{}", json!({ "ms": times[times.len() / 2], "min": times[0], "runs": a.bench, "hash": run.hash, "frames": run.frame_count() }));
    } else {
        let mut info =
            json!({ "ms": ms, "hash": run.hash, "frames": run.frame_count(), "completed": run.completed(), "stopReason": run.stop_reason.map(|r| r.name()) });
        if a.verify_rebuild {
            let (checked, problems) = verify_rebuild(&run);
            info["rebuildChecked"] = json!(checked);
            info["rebuildProblems"] = json!(problems);
        }
        println!("{}", info);
    }
    if let Some(out) = &a.out {
        std::fs::write(out, encode_run(&run, ms)).map_err(|e| format!("{out}: {e}"))?;
    }
    if let Some(file) = &a.deltas {
        // The deltas a worker posts when the whole run is computed in one slice (release: the posted data is
        // dropped from the run), each as u32 LE length + container
        let mut run = run_once(&text, a).map_err(|m| m.to_json().to_string())?;
        let mut writer = DeltaWriter::new(true);
        let mut bytes = Vec::new();
        for d in writer.next(&mut run, true) {
            bytes.extend_from_slice(&(d.len() as u32).to_le_bytes());
            bytes.extend_from_slice(&d);
        }
        std::fs::write(file, bytes).map_err(|e| format!("{file}: {e}"))?;
    }
    Ok(())
}

/// `math <fn> <in> <out>`: evaluate a dmath function on little-endian doubles (pairs for two arguments).
fn command_math(name: &str, input: &str, output: &str) -> Result<(), String> {
    let bytes = std::fs::read(input).map_err(|e| format!("{input}: {e}"))?;
    let xs: Vec<f64> = bytes.chunks_exact(8).map(|c| f64::from_le_bytes(c.try_into().expect("8 bytes"))).collect();
    let f1: Option<fn(f64) -> f64> = match name {
        "sin" => Some(dmath::sin),
        "cos" => Some(dmath::cos),
        "tan" => Some(dmath::tan),
        "atan" => Some(dmath::atan),
        "asin" => Some(dmath::asin),
        "acos" => Some(dmath::acos),
        "exp" => Some(dmath::exp),
        "log" => Some(dmath::log),
        _ => None,
    };
    let f2: Option<fn(f64, f64) -> f64> = match name {
        "atan2" => Some(dmath::atan2),
        "pow" => Some(dmath::pow),
        "hypot" => Some(dmath::hypot),
        _ => None,
    };
    let t0 = Instant::now();
    let out: Vec<f64> = match (f1, f2) {
        (Some(f), _) => xs.iter().map(|&x| f(x)).collect(),
        (_, Some(f)) => xs.chunks_exact(2).map(|p| f(p[0], p[1])).collect(),
        _ => return Err(format!("unknown function {name}")),
    };
    let ms = t0.elapsed().as_secs_f64() * 1000.0;
    let mut bytes = Vec::with_capacity(out.len() * 8);
    for v in &out {
        bytes.extend_from_slice(&v.to_le_bytes());
    }
    std::fs::write(output, bytes).map_err(|e| format!("{output}: {e}"))?;
    println!("{}", json!({ "ms": ms }));
    Ok(())
}

fn hex(v: f64) -> String {
    format!("0x{:016x}", v.to_bits())
}

/// `expr <in.json> <out.json>`: check, compile and evaluate force expressions (module parity).
fn command_expr(input: &str, output: &str) -> Result<(), String> {
    let doc: Value = serde_json::from_str(&std::fs::read_to_string(input).map_err(|e| format!("{input}: {e}"))?).map_err(|e| e.to_string())?;
    let cases = doc["cases"].as_array().ok_or("cases")?;
    let envs: Vec<[f64; ENV_SIZE]> = doc["envs"]
        .as_array()
        .ok_or("envs")?
        .iter()
        .map(|e| {
            let mut a = [0.0; ENV_SIZE];
            for (i, v) in e.as_array().into_iter().flatten().enumerate().take(ENV_SIZE) {
                a[i] = v.as_f64().unwrap_or(0.0);
            }
            a
        })
        .collect();
    let mut out = Vec::new();
    for c in cases {
        let src = c.as_str().unwrap_or("");
        if check_force_expr(src).is_err() {
            out.push(json!({ "ok": false }));
            continue;
        }
        let mut arena = ExprArena::default();
        let root = arena.compile_force_expr(src).map_err(|m| m.to_json().to_string())?;
        let ns = arena.switches.len();
        let switches: Vec<String> = arena
            .switches
            .iter()
            .map(|s| {
                let kind = match s.kind {
                    SwitchKind::Step => "step",
                    SwitchKind::Sign => "sign",
                    SwitchKind::If => "if",
                    SwitchKind::Abs => "abs",
                    SwitchKind::Min => "min",
                    SwitchKind::Max => "max",
                };
                format!("{}:{}:{}", kind, s.jump, s.zero)
            })
            .collect();
        let sw_sets: Vec<Option<Vec<i8>>> = vec![None, Some(vec![1; ns]), Some(vec![-1; ns]), Some((0..ns).map(|i| [1, -1, 0][i % 3]).collect())];
        let mut values = Vec::new();
        for env in &envs {
            for sw in &sw_sets {
                let s = sw.as_deref();
                values.push(hex(arena.eval(root, env, s)));
                for k in 0..ns {
                    values.push(hex(arena.switch_arg(k, env, s)));
                }
            }
        }
        out.push(json!({ "ok": true, "switches": switches, "values": values }));
    }
    std::fs::write(output, Value::Array(out).to_string()).map_err(|e| format!("{output}: {e}"))?;
    Ok(())
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(|s| s.as_str()) {
        Some("run") => parse_args(&args[1..]).and_then(|a| command_run(&a)),
        Some("math") if args.len() == 4 => command_math(&args[1], &args[2], &args[3]),
        Some("sha-bench") => {
            // Throughput of the fingerprint hash (4.3 MB of doubles, in 600×1-frame pieces like the run)
            let data: Vec<f64> = (0..537_500).map(|i| dmath::sin(i as f64)).collect();
            for _ in 0..3 {
                let t0 = Instant::now();
                let mut h = velophi_core::sha256::Sha256::new();
                for c in data.chunks(4800) {
                    h.update_f64(c);
                }
                let d = h.digest_hex();
                println!("sha 4.3 MB {:.2} ms {}", t0.elapsed().as_secs_f64() * 1000.0, &d[..8]);
            }
            Ok(())
        }
        Some("expr") if args.len() == 3 => command_expr(&args[1], &args[2]),
        Some("batch") => match args.get(1) {
            Some(list) => std::fs::read_to_string(list).map_err(|e| format!("{list}: {e}")).and_then(|text| {
                for line in text.lines().filter(|l| !l.trim().is_empty()) {
                    let parts: Vec<String> = line.split_whitespace().map(|s| s.to_string()).collect();
                    let mut v = vec![parts[0].clone(), "--out".into(), parts[1].clone()];
                    v.extend_from_slice(&parts[2..]);
                    command_run(&parse_args(&v)?)?;
                }
                Ok(())
            }),
            None => Err("missing list file".into()),
        },
        _ => Err("usage: velophi-cli run <scene.json> [--duration T|null|scene] [--until T] [--chunk S] [--out file.bin] [--bench N]\n       velophi-cli batch <list.txt>".into()),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("velophi-cli: {e}");
            ExitCode::from(2)
        }
    }
}
