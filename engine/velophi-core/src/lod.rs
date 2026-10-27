//! Level of detail of long time charts (decision D32; port of render/chartLod.ts, 26.53): min/max envelopes of
//! quantity time series at three levels — single frames, blocks of B frames and chunks of F frames.
//!
//! The statistics of a chunk of a plain state component come from the chunk summaries of the session; everything
//! else comes from scans of chunks in memory (frame values kept in a small LRU cache for the frame level). Scans are
//! spread over calls by a work budget (frame evaluations; the core has no clock); evicted chunks are reported so the
//! interface can have them recomputed off its thread, or recomputed here (`rebuild`, one chunk per call).

use std::collections::{HashMap, HashSet, VecDeque};

use serde_json::{json, Value};

use crate::dynamics::{System, AUX_FIXED};
use crate::message::SimResult;
use crate::model::pair_key;
use crate::observe::Observation;
use crate::session::Session;
use crate::transport::Blob;

/// Blocks per chunk of the middle level.
pub const BLOCKS_PER_CHUNK: usize = 20;
/// Frame-value arrays kept for the frame level (one per quantity and chunk).
const RAW_CACHE: usize = 1024;

#[derive(Clone, Debug)]
struct ChunkLod {
    count: usize,
    blocks: Vec<f64>,
    min: f64,
    max: f64,
    first: f64,
    last: f64,
}

#[derive(Clone, Debug)]
struct QuantityLod {
    id: String,
    component: i64,
    chunks: HashMap<usize, ChunkLod>,
    starts: HashMap<usize, f64>,
}

/// The chart caches of one session.
#[derive(Default, Debug)]
pub struct LodCache {
    f: usize,
    b: usize,
    nb: usize,
    quantities: HashMap<String, QuantityLod>,
    raw: HashMap<(String, usize), Vec<f64>>,
    raw_order: VecDeque<(String, usize)>,
    failed: HashSet<usize>,
    pub scans: u64,
    pub rebuilds: u64,
    revision: u64,
}

impl LodCache {
    fn new(f: usize) -> LodCache {
        let b = 1usize.max(f.div_ceil(BLOCKS_PER_CHUNK));
        LodCache { f, b, nb: f.div_ceil(b), ..Default::default() }
    }

    fn raw_touch(&mut self, key: &(String, usize)) {
        if let Some(p) = self.raw_order.iter().position(|k| k == key) {
            self.raw_order.remove(p);
            self.raw_order.push_back(key.clone());
        }
    }

    fn raw_set(&mut self, key: (String, usize), a: Vec<f64>) {
        if let Some(p) = self.raw_order.iter().position(|k| *k == key) {
            self.raw_order.remove(p);
        }
        self.raw_order.push_back(key.clone());
        self.raw.insert(key, a);
        while self.raw.len() > RAW_CACHE {
            if let Some(k) = self.raw_order.pop_front() {
                self.raw.remove(&k);
            } else {
                break;
            }
        }
    }
}

/// State component of a quantity id that is read straight from the state, or −1.
pub fn state_component(sys: &System, id: &str) -> i64 {
    let Some(dot) = id.rfind('.') else { return -1 };
    let head = &id[..dot];
    let q = &id[dot + 1..];
    let n = sys.n as i64;
    if let Some(rest) = head.strip_prefix("pair.") {
        let mut it = rest.split('|');
        let (a, b) = (it.next().unwrap_or(""), it.next().unwrap_or(""));
        let key = pair_key(a, b);
        let Some(pair) = sys.pairs.iter().find(|p| p.key == key) else { return -1 };
        let base = (sys.aux_base + AUX_FIXED + 2 * pair.index) as i64;
        return match q {
            "slide" => base,
            "heat" => base + 1,
            _ => -1,
        };
    }
    let Some(body) = sys.model.bodies.iter().find(|b| b.id == head) else { return -1 };
    if !body.dynamic {
        return -1;
    }
    let i = body.index as i64;
    match q {
        "x" => 3 * i,
        "y" => 3 * i + 1,
        "angle" => 3 * i + 2,
        "vx" => 3 * n + 3 * i,
        "vy" => 3 * n + 3 * i + 1,
        "omega" => 3 * n + 3 * i + 2,
        _ => -1,
    }
}

/// Level of a window of `frames` frames in `columns` columns.
pub fn choose_level(frames: f64, columns: f64, f: usize) -> &'static str {
    let fpc = frames / columns.max(1.0);
    let b = 1usize.max(f.div_ceil(BLOCKS_PER_CHUNK)) as f64;
    if fpc < b {
        "frame"
    } else if fpc < f as f64 {
        "block"
    } else {
        "chunk"
    }
}

fn avail_in(s: &Session, f: usize, c: usize) -> usize {
    let first = (c * f) as u64;
    if s.frame_count <= first {
        0
    } else {
        f.min((s.frame_count - first) as usize)
    }
}

fn resident(s: &Session, f: usize, c: usize) -> bool {
    let n = avail_in(s, f, c);
    if n == 0 {
        return false;
    }
    s.cheap((c * f + if n > 1 { 1 } else { 0 }) as u64)
}

/// Value of quantity `q` at frame k (state component or full observation).
fn frame_value(s: &mut Session, component: i64, id: &str, k: u64, obs_cache: &mut Option<(Vec<f64>, usize, f64)>) -> SimResult<f64> {
    if component >= 0 {
        return Ok(s.state(k)?[component as usize]);
    }
    if obs_cache.is_none() {
        let seg = s.segment(k)?;
        let loss = s.impact_loss(k)?;
        let x = s.state(k)?.to_vec();
        *obs_cache = Some((x, seg, loss));
    }
    let (x, seg, loss) = obs_cache.as_ref().expect("filled");
    let sys = s.system.clone();
    let meta = s.meta.clone();
    let customs = s.customs().to_vec();
    let mode = s.segments[*seg].mode.clone();
    let obs = Observation::new(&sys, &meta, &customs, x, &mode, *loss, Some(k as f64 * s.dt))?;
    Ok(obs.value(id))
}

/// Scan chunk c for the given quantities. Returns the frames evaluated.
fn scan(s: &mut Session, lod: &mut LodCache, c: usize, ids: &[String]) -> SimResult<usize> {
    let (f, b) = (lod.f, lod.b);
    let first = c * f;
    let avail = avail_in(s, f, c);
    if avail == 0 || ids.is_empty() {
        return Ok(0);
    }
    let mut from = Vec::new();
    let mut arrays: Vec<Vec<f64>> = Vec::new();
    for id in ids {
        let key = (id.clone(), c);
        let raw = lod.raw.get(&key).cloned();
        if raw.is_some() {
            lod.raw_touch(&key);
        }
        let st = lod.quantities[id].chunks.get(&c);
        let fr = match (st, &raw) {
            (Some(st), Some(_)) => st.count.min(avail),
            _ => 0,
        };
        from.push(fr);
        arrays.push(raw.unwrap_or_else(|| vec![0.0; f]));
    }
    let k0 = *from.iter().min().unwrap_or(&0);
    let mut work = 0;
    let comps: Vec<i64> = ids.iter().map(|id| lod.quantities[id].component).collect();
    for j in k0..avail {
        let k = (first + j) as u64;
        let mut cache = None;
        for (i, id) in ids.iter().enumerate() {
            if j < from[i] {
                continue;
            }
            arrays[i][j] = frame_value(s, comps[i], id, k, &mut cache)?;
        }
        work += 1;
    }
    for (i, id) in ids.iter().enumerate() {
        let raw = std::mem::take(&mut arrays[i]);
        let nb = lod.nb;
        let q = lod.quantities.get_mut(id).expect("quantity");
        let fresh = from[i] == 0 || !q.chunks.contains_key(&c);
        if fresh {
            q.chunks.insert(c, ChunkLod { count: 0, blocks: vec![0.0; 4 * nb], min: f64::INFINITY, max: f64::NEG_INFINITY, first: f64::NAN, last: f64::NAN });
        }
        let st = q.chunks.get_mut(&c).expect("chunk");
        let mut bi = from[i] / b;
        while bi * b < avail {
            let j0 = bi * b;
            let j1 = avail.min(j0 + b);
            let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
            for &v in &raw[j0..j1] {
                if v < lo {
                    lo = v;
                }
                if v > hi {
                    hi = v;
                }
            }
            st.blocks[4 * bi] = lo;
            st.blocks[4 * bi + 1] = hi;
            st.blocks[4 * bi + 2] = raw[j0];
            st.blocks[4 * bi + 3] = raw[j1 - 1];
            bi += 1;
        }
        let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
        let nb_used = avail.div_ceil(b);
        for bb in 0..nb_used {
            if st.blocks[4 * bb] < lo {
                lo = st.blocks[4 * bb];
            }
            if st.blocks[4 * bb + 1] > hi {
                hi = st.blocks[4 * bb + 1];
            }
        }
        st.min = lo;
        st.max = hi;
        st.first = raw[0];
        st.last = raw[avail - 1];
        st.count = avail;
        lod.raw_set((id.clone(), c), raw);
    }
    lod.scans += 1;
    Ok(work)
}

/// [min, max, first, last] of unit u of quantity q, or None when it is not known.
fn unit_stats(s: &Session, lod: &LodCache, q: &QuantityLod, level: &str, u: usize) -> Option<[f64; 4]> {
    let (f, b, nb) = (lod.f, lod.b, lod.nb);
    match level {
        "chunk" => {
            if let Some(st) = q.chunks.get(&u) {
                if st.count >= avail_in(s, f, u) {
                    return Some([st.min, st.max, st.first, st.last]);
                }
            }
            if q.component >= 0 {
                if let Some(sm) = s.summary(u) {
                    let n = sm.len() / 4;
                    let i = q.component as usize;
                    return Some([sm[i], sm[n + i], sm[2 * n + i], sm[3 * n + i]]);
                }
            }
            None
        }
        "block" => {
            let c = u / nb;
            let bi = u % nb;
            let st = q.chunks.get(&c)?;
            if st.count < avail_in(s, f, c).min(bi * b + b) {
                return None;
            }
            Some([st.blocks[4 * bi], st.blocks[4 * bi + 1], st.blocks[4 * bi + 2], st.blocks[4 * bi + 3]])
        }
        _ => {
            let c = u / f;
            let raw = lod.raw.get(&(q.id.clone(), c))?;
            let st = q.chunks.get(&c)?;
            if st.count <= u - c * f {
                return None;
            }
            let v = raw[u - c * f];
            let fin = v.is_finite();
            Some([if fin { v } else { f64::INFINITY }, if fin { v } else { f64::NEG_INFINITY }, v, v])
        }
    }
}

/// Parameters of an envelope request.
pub struct EnvelopeRequest {
    pub ids: Vec<String>,
    pub k0: f64,
    pub k1: f64,
    pub columns: f64,
    /// Frame evaluations allowed for scans in this call (at least one chunk is scanned).
    pub budget: usize,
    pub rebuild: bool,
    pub level: Option<String>,
}

/// Min/max envelope of quantities over a frame window (render/chartLod.ts `chartEnvelope`).
pub fn envelope(s: &mut Session, req: &EnvelopeRequest, blob: &mut Blob) -> SimResult<Value> {
    let mut lod = match s.lod.take() {
        Some(l) if l.f == s.chunk_frames => l,
        _ => LodCache::new(s.chunk_frames),
    };
    let r = envelope_with(s, &mut lod, req, blob);
    lod.revision = s.revision;
    s.lod = Some(lod);
    r
}

fn envelope_with(s: &mut Session, lod: &mut LodCache, req: &EnvelopeRequest, blob: &mut Blob) -> SimResult<Value> {
    let (f, b, nb) = (lod.f, lod.b, lod.nb);
    if s.frame_count == 0 {
        return Ok(json!({ "level": "frame", "unit": 1, "colFirst": blob.i32s(&[]), "colLast": blob.i32s(&[]), "stats": {}, "pending": false, "evicted": [], "dt": s.dt }));
    }
    let last = (s.frame_count - 1) as f64;
    let k0 = 0f64.max(last.min(req.k0.floor()));
    let k1 = k0.max(last.min(req.k1.floor()));
    let mut ids: Vec<String> = Vec::new();
    for id in &req.ids {
        if !ids.contains(id) {
            ids.push(id.clone());
        }
    }
    let sys = s.system.clone();
    for id in &ids {
        if !lod.quantities.contains_key(id) {
            lod.quantities.insert(id.clone(), QuantityLod { id: id.clone(), component: state_component(&sys, id), chunks: HashMap::new(), starts: HashMap::new() });
        }
    }
    let mut level: &str = match req.level.as_deref() {
        Some("frame") => "frame",
        Some("block") => "block",
        Some("chunk") => "chunk",
        _ => choose_level(k1 - k0 + 1.0, req.columns, f),
    };
    let (k0u, k1u) = (k0 as usize, k1 as usize);
    if req.level.is_none() && level == "frame" && (k1u / f - k0u / f + 1) * ids.len() > RAW_CACHE / 2 {
        level = "block";
    }
    let block_of = |k: usize| {
        let c = k / f;
        c * nb + (k - c * f) / b
    };
    let lastu = last as usize;
    let unit_first = |u: usize| match level {
        "frame" => u,
        "block" => (u / nb) * f + (u % nb) * b,
        _ => u * f,
    };
    let unit_last = |u: usize| {
        let v = match level {
            "frame" => u,
            "block" => ((u / nb) * f + f).min(unit_first(u) + b) - 1,
            _ => u * f + f - 1,
        };
        lastu.min(v)
    };
    let u0 = match level {
        "frame" => k0u,
        "block" => block_of(k0u),
        _ => k0u / f,
    };
    let u1 = match level {
        "frame" => k1u,
        "block" => block_of(k1u),
        _ => k1u / f,
    };
    let uu = u1 - u0 + 1;
    let cc = 1usize.max((req.columns.floor().max(0.0) as usize).min(uu));
    let col_start = |j: usize| u0 + (j * uu) / cc;
    let c0 = unit_first(u0) / f;
    let c1 = unit_last(u1) / f;
    let known = |s: &Session, lod: &LodCache, id: &str, c: usize| -> bool {
        let q = &lod.quantities[id];
        if level == "chunk" && q.component >= 0 && s.summary(c).is_some() {
            return true;
        }
        let Some(st) = q.chunks.get(&c) else { return false };
        if st.count < avail_in(s, f, c) {
            return false;
        }
        level != "frame" || lod.raw.contains_key(&(id.to_string(), c))
    };
    let mut evicted: Vec<usize> = Vec::new();
    let mut work: Vec<(usize, Vec<String>)> = Vec::new();
    let mut c = c1 as i64;
    while c >= c0 as i64 {
        let cu = c as usize;
        let need: Vec<String> = ids.iter().filter(|id| !known(s, lod, id, cu)).cloned().collect();
        if !need.is_empty() {
            if resident(s, f, cu) {
                work.push((cu, need));
            } else if !lod.failed.contains(&cu) {
                evicted.push(cu);
            }
        }
        c -= 1;
    }
    let mut done = 0usize;
    let mut scanned = 0;
    for (cu, need) in &work {
        if scanned > 0 && done >= req.budget {
            break;
        }
        done += scan(s, lod, *cu, need)?;
        scanned += 1;
    }
    if req.rebuild && !evicted.is_empty() {
        let cu = evicted.remove(0);
        let probe = (cu * f + 1usize.min(avail_in(s, f, cu).saturating_sub(1))) as u64;
        match s.state(probe) {
            Ok(_) => {
                lod.rebuilds += 1;
                let need: Vec<String> = ids.iter().filter(|id| !known(s, lod, id, cu)).cloned().collect();
                scan(s, lod, cu, &need)?;
            }
            Err(_) => {
                lod.failed.insert(cu);
            }
        }
    }
    // Stand-ins: the value at the start of each chunk still unknown
    let extra = req.budget + req.budget / 3 + 1;
    'stand: for cu in c0..=c1 {
        let start_k = cu * f;
        if start_k > lastu {
            break;
        }
        for id in &ids {
            if known(s, lod, id, cu) || lod.quantities[id].starts.contains_key(&cu) || !s.cheap(start_k as u64) {
                continue;
            }
            if done > extra {
                break 'stand;
            }
            let comp = lod.quantities[id].component;
            let mut cache = None;
            let v = frame_value(s, comp, id, start_k as u64, &mut cache)?;
            done += 1;
            lod.quantities.get_mut(id).expect("q").starts.insert(cu, v);
        }
    }
    let mut col_first = vec![0i32; cc];
    let mut col_last = vec![0i32; cc];
    for j in 0..cc {
        col_first[j] = unit_first(col_start(j)) as i32;
        col_last[j] = unit_last(col_start(j + 1) - 1) as i32;
    }
    let mut stats = serde_json::Map::new();
    let mut pending = false;
    for id in &ids {
        let q = &lod.quantities[id];
        let (mut mn, mut mx, mut fs, mut ls, mut state) = (vec![0.0; cc], vec![0.0; cc], vec![0.0; cc], vec![0.0; cc], vec![0i32; cc]);
        for j in 0..cc {
            let (mut lo, mut hi, mut fst, mut lst) = (f64::INFINITY, f64::NEG_INFINITY, f64::NAN, f64::NAN);
            let (mut any, mut missing) = (false, false);
            for u in col_start(j)..col_start(j + 1) {
                match unit_stats(s, lod, q, level, u) {
                    None => missing = true,
                    Some(r) => {
                        if !any {
                            fst = r[2];
                        }
                        any = true;
                        if r[0] < lo {
                            lo = r[0];
                        }
                        if r[1] > hi {
                            hi = r[1];
                        }
                        lst = r[3];
                    }
                }
            }
            if any && !missing {
                mn[j] = lo;
                mx[j] = hi;
                fs[j] = fst;
                ls[j] = lst;
                continue;
            }
            pending = true;
            let mut stand = f64::NAN;
            let ca = (col_first[j] as usize).div_ceil(f);
            let cb = col_last[j] as usize / f;
            let mut cx = ca;
            while cx <= cb && stand.is_nan() {
                if let Some(v) = q.starts.get(&cx) {
                    stand = *v;
                }
                cx += 1;
            }
            if any {
                mn[j] = lo.min(if stand.is_finite() { stand } else { lo });
                mx[j] = hi.max(if stand.is_finite() { stand } else { hi });
                fs[j] = fst;
                ls[j] = lst;
                state[j] = 1;
            } else if !stand.is_nan() {
                mn[j] = stand;
                mx[j] = stand;
                fs[j] = stand;
                ls[j] = stand;
                state[j] = 1;
            } else {
                mn[j] = f64::NAN;
                mx[j] = f64::NAN;
                fs[j] = f64::NAN;
                ls[j] = f64::NAN;
                state[j] = 2;
            }
        }
        stats.insert(id.clone(), json!({ "min": blob.f64s(&mn), "max": blob.f64s(&mx), "first": blob.f64s(&fs), "last": blob.f64s(&ls), "state": blob.i32s(&state) }));
    }
    let unit = match level {
        "frame" => 1,
        "block" => b,
        _ => f,
    };
    Ok(json!({
        "level": level, "unit": unit, "colFirst": blob.i32s(&col_first), "colLast": blob.i32s(&col_last), "stats": Value::Object(stats),
        "pending": pending, "evicted": evicted, "dt": crate::transport::jnum(s.dt), "scans": lod.scans, "rebuilds": lod.rebuilds
    }))
}
