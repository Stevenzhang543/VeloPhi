//! The reactor document (handoff 15.6, `velophi-reactor` 1) and what the static solution of a layout gives the
//! dynamic model: k_eff, the power shape, and — weighted with the adjoint flux — the reactivity coefficients, the
//! generation time and the flux per fission rate (26.64, D277).
//!
//! Layout: `grid { nx, ny, pitch_cm, refine? }` and `cells[nx·ny]`, row-major (cell "x,y" is `cells[y·nx + x]`), each
//! a material id (the 12 materials of the data file or a material of the request) or an index into the request's
//! `materials`. Every cell is refined into `refine` × `refine` cells of the finite-volume grid. A control rod
//! `rods["x,y"] = { material, insertion }` replaces the share `insertion` of its cell by the rod material
//! (volume-weighted mixture: the two-dimensional picture of a rod inserted to that depth).

use std::rc::Rc;

use serde_json::{json, Value};
use velophi_core::message::{Message, SimResult};
use velophi_core::sha256::Sha256;
use velophi_core::transport::{dnum, jnum};

use super::diffusion::{perturbation, Operator, Problem, Solution, Solver, GAMMA_VACUUM};
use super::materials::{self, Conditions, Kind, Library, Material};
use super::thermal::{Loop, Plant};

/// Largest number of cells of the finite-volume grid.
pub const MAX_FINE: usize = 128 * 128;

/// Group speeds (cm/s) when a request brings all its materials and no data file is loaded.
const V1: f64 = 3.0e6;
const V2: f64 = 2.48e5;

fn bad(what: impl Into<String>) -> Message {
    Message::new("err.internal").text("message", format!("reactor: {}", what.into()))
}

#[derive(Clone, Debug)]
pub struct Rod {
    pub cell: usize,
    pub material: usize,
    /// Insertion of the document, 0 (withdrawn) … 1 (fully inserted).
    pub insertion: f64,
}

/// Automatic shutdown: limits on the power (relative to nominal), the period (s) and the peak fuel temperature (K).
#[derive(Clone, Copy, Debug)]
pub struct Protection {
    pub enabled: bool,
    pub power: f64,
    pub period: f64,
    pub fuel_t: f64,
}

pub struct Doc {
    pub nx: usize,
    pub ny: usize,
    pub pitch: f64,
    pub refine: usize,
    pub materials: Vec<Material>,
    pub cells: Vec<usize>,
    /// Enrichment per cell (weight percent; NaN: the document's default).
    pub enrich: Vec<f64>,
    pub enrichment: Option<f64>,
    pub rods: Vec<Rod>,
    pub bc: [f64; 4],
    pub bz2: f64,
    pub height: f64,
    pub plant: Plant,
    pub loop_: Loop,
    pub protection: Protection,
    pub detectors: Vec<usize>,
    /// Strength of the start-up source (neutrons per second).
    pub source: f64,
    pub lib: Option<Rc<Library>>,
    /// Fingerprint of everything the static solution depends on.
    pub key: String,
}

fn cell_of(text: &str, nx: usize, ny: usize) -> Option<usize> {
    let mut it = text.split(',');
    let x: usize = it.next()?.trim().parse().ok()?;
    let y: usize = it.next()?.trim().parse().ok()?;
    if it.next().is_some() || x >= nx || y >= ny {
        return None;
    }
    Some(y * nx + x)
}

fn gamma_of(v: &Value) -> SimResult<f64> {
    Ok(match v {
        Value::String(s) => match s.as_str() {
            "vacuum" => GAMMA_VACUUM,
            "marshak" => 0.5,
            "zeroFlux" => f64::INFINITY,
            "reflective" => 0.0,
            other => return Err(bad(format!("boundary '{other}' (vacuum, marshak, zeroFlux, reflective or a number)"))),
        },
        Value::Null => GAMMA_VACUUM,
        other => {
            let g = dnum(other);
            if g >= 0.0 {
                g
            } else {
                return Err(bad("boundary: γ must be ≥ 0"));
            }
        }
    })
}

fn num(v: &Value, key: &str) -> Option<f64> {
    v.get(key).filter(|x| !x.is_null()).map(dnum).filter(|x| x.is_finite())
}

impl Doc {
    /// Read a reactor document: the request itself or its member `doc`.
    pub fn parse(req: &Value) -> SimResult<Doc> {
        let d = req.get("doc").filter(|v| v.is_object()).unwrap_or(req);
        let lib = materials::library_opt();
        let grid = d.get("grid").filter(|v| v.is_object()).ok_or_else(|| bad("grid missing"))?;
        let nx = num(grid, "nx").unwrap_or(0.0) as usize;
        let ny = num(grid, "ny").unwrap_or(0.0) as usize;
        let pitch = num(grid, "pitch_cm").unwrap_or(f64::NAN);
        let refine = num(grid, "refine").unwrap_or(1.0).clamp(1.0, 64.0) as usize;
        if nx == 0 || ny == 0 || nx > 128 || ny > 128 || !(pitch > 0.0) {
            return Err(bad("grid: nx and ny must be 1 … 128 and pitch_cm > 0"));
        }
        if nx * refine * ny * refine > MAX_FINE {
            return Err(bad(format!("grid: more than {MAX_FINE} cells after refinement")));
        }
        // materials: those of the request, then those of the data file that the cells name
        let mut mats: Vec<Material> = Vec::new();
        for (i, m) in d.get("materials").or_else(|| req.get("materials")).and_then(|v| v.as_array()).map(|a| a.as_slice()).unwrap_or(&[]).iter().enumerate() {
            mats.push(materials::custom(m, i)?);
        }
        let custom = mats.len();
        let find = |id: &str, mats: &mut Vec<Material>| -> SimResult<usize> {
            if let Some(i) = mats.iter().position(|m| m.id == id) {
                return Ok(i);
            }
            let l = lib.as_ref().ok_or_else(|| bad(format!("material '{id}': the reactor data are not loaded (reactorSetData)")))?;
            let i = l.find(id).ok_or_else(|| bad(format!("unknown material '{id}'")))?;
            mats.push(l.materials[i].clone());
            Ok(mats.len() - 1)
        };
        let list = grid.get("cells").or_else(|| d.get("cells")).and_then(|v| v.as_array()).ok_or_else(|| bad("cells missing"))?;
        if list.len() != nx * ny {
            return Err(bad(format!("cells: {} entries for a grid of {nx} × {ny}", list.len())));
        }
        let mut cells = Vec::with_capacity(nx * ny);
        for c in list {
            cells.push(match c {
                Value::String(id) => find(id, &mut mats)?,
                other => {
                    let i = dnum(other);
                    if !(i >= 0.0 && (i as usize) < custom) {
                        return Err(bad("cells: a number must be an index into materials"));
                    }
                    i as usize
                }
            });
        }
        let enrichment = num(d, "enrichment");
        let mut enrich = vec![f64::NAN; nx * ny];
        if let Some(map) = d.get("enrich").and_then(|v| v.as_object()) {
            for (k, v) in map {
                let c = cell_of(k, nx, ny).ok_or_else(|| bad(format!("enrich: cell '{k}'")))?;
                enrich[c] = dnum(v);
            }
        }
        let mut rods = Vec::new();
        if let Some(map) = d.get("rods").and_then(|v| v.as_object()) {
            for (k, v) in map {
                let cell = cell_of(k, nx, ny).ok_or_else(|| bad(format!("rods: cell '{k}'")))?;
                let material = find(v.get("material").and_then(|m| m.as_str()).unwrap_or("b4c"), &mut mats)?;
                rods.push(Rod { cell, material, insertion: num(v, "insertion").unwrap_or(0.0).clamp(0.0, 1.0) });
            }
        }
        rods.sort_by_key(|r| r.cell);
        let b = d.get("boundary").or_else(|| d.get("bc")).cloned().unwrap_or(Value::Null);
        let bc = if b.is_object() {
            let side = |k: &str| gamma_of(b.get(k).unwrap_or(&Value::Null));
            [side("left")?, side("right")?, side("bottom")?, side("top")?]
        } else {
            let g = gamma_of(&b)?;
            [g; 4]
        };
        let height_given = num(d, "height_cm").filter(|h| *h > 0.0);
        let height = height_given.unwrap_or(100.0);
        let bz2 = match num(d, "axialBuckling") {
            Some(b) if b >= 0.0 => b,
            Some(_) => return Err(bad("axialBuckling must be ≥ 0")),
            None => height_given.map(|h| (std::f64::consts::PI / h) * (std::f64::consts::PI / h)).unwrap_or(0.0),
        };
        let mut start = Plant::default();
        if let Some(p) = num(d, "power_W") {
            start.power = p.clamp(1e-3, 1e11);
        }
        let plant = Plant::from_json(d.get("thermal"), start);
        let lp = d.get("loop").cloned().unwrap_or(Value::Null);
        let loop_ = Loop { pump: num(&lp, "pump").unwrap_or(1.0).clamp(0.0, 1.0), exchanger: lp.get("exchanger").and_then(|v| v.as_bool()).unwrap_or(true), turbine: lp.get("turbine").and_then(|v| v.as_bool()).unwrap_or(true) };
        let pr = d.get("protection").cloned().unwrap_or(Value::Null);
        let protection = Protection {
            enabled: pr.get("enabled").and_then(|v| v.as_bool()).unwrap_or(pr.is_object()),
            power: num(&pr, "power").unwrap_or(1.2).max(0.0),
            period: num(&pr, "period_s").unwrap_or(10.0).max(0.0),
            fuel_t: num(&pr, "fuelT_K").unwrap_or(f64::INFINITY),
        };
        let mut detectors = Vec::new();
        for c in d.get("detectors").and_then(|v| v.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
            let text = c.as_str().unwrap_or("");
            detectors.push(cell_of(text, nx, ny).ok_or_else(|| bad(format!("detectors: cell '{text}'")))?);
        }
        // fingerprint of the static problem
        let mut h = Sha256::new();
        h.update(b"velophi-reactor-static-1");
        h.update_f64(&[nx as f64, ny as f64, pitch, refine as f64, bz2, bc[0], bc[1], bc[2], bc[3], enrichment.unwrap_or(-1.0)]);
        for (i, c) in cells.iter().enumerate() {
            let m = &mats[*c];
            h.update(m.id.as_bytes());
            h.update_f64(&[if enrich[i].is_nan() { -1.0 } else { enrich[i] }]);
            if m.kind == Kind::Custom {
                h.update_f64(&[m.xs.d1, m.xs.d2, m.xs.a1, m.xs.a2, m.xs.s12, m.xs.nf1, m.xs.nf2, m.xs.f1, m.xs.f2]);
            }
        }
        for r in &rods {
            h.update_f64(&[r.cell as f64]);
            h.update(mats[r.material].id.as_bytes());
        }
        Ok(Doc { nx, ny, pitch, refine, materials: mats, cells, enrich, enrichment, rods, bc, bz2, height, plant, loop_, protection, detectors, source: num(d, "source_n_per_s").unwrap_or(0.0).max(0.0), lib, key: h.digest_hex() })
    }

    pub fn lib(&self) -> Option<&Library> {
        self.lib.as_deref()
    }

    /// Enrichment of a cell (weight percent), 0 for a cell without fuel.
    pub fn enrichment_of(&self, cell: usize) -> f64 {
        let wanted = if self.enrich[cell].is_nan() { self.enrichment } else { Some(self.enrich[cell]) };
        self.materials[self.cells[cell]].enrichment(wanted)
    }

    /// The finite-volume problem at a state of the core with the rods at `insertion` (one value per rod).
    pub fn problem(&self, c: &Conditions, insertion: &[f64]) -> Problem {
        let lib = self.lib();
        let mut coarse = Vec::with_capacity(self.cells.len());
        for (i, m) in self.cells.iter().enumerate() {
            let wanted = if self.enrich[i].is_nan() { self.enrichment } else { Some(self.enrich[i]) };
            coarse.push(self.materials[*m].evaluate(lib, wanted, c));
        }
        for (r, rod) in self.rods.iter().enumerate() {
            let share = insertion.get(r).copied().unwrap_or(rod.insertion);
            if share > 0.0 {
                let other = self.materials[rod.material].evaluate(lib, None, c);
                coarse[rod.cell] = coarse[rod.cell].mixed(&other, share);
            }
        }
        let (fx, fy) = (self.nx * self.refine, self.ny * self.refine);
        let mut xs = Vec::with_capacity(fx * fy);
        for y in 0..fy {
            for x in 0..fx {
                xs.push(coarse[(y / self.refine) * self.nx + x / self.refine]);
            }
        }
        Problem { nx: fx, ny: fy, h: self.pitch / self.refine as f64, xs, bc: self.bc, bz2: self.bz2 }
    }

    /// The moderator has no temperature of its own: no coolant channels, so the liquid moderator carries the heat.
    pub fn moderator_is_coolant(&self) -> bool {
        !self.cells.iter().any(|c| self.materials[*c].kind == Kind::Coolant)
    }

    pub fn fissile(&self, cell: usize) -> bool {
        self.materials[self.cells[cell]].fissile()
    }

    /// Lowest damage temperature of the fuels in the layout (K).
    pub fn damage_limit(&self) -> f64 {
        let mut limit = f64::INFINITY;
        for c in &self.cells {
            if let Some(f) = &self.materials[*c].fuel {
                if f.damage < limit {
                    limit = f.damage;
                }
            }
        }
        limit
    }

    /// Volume of the fuel cells (cm³).
    pub fn fuel_volume(&self) -> f64 {
        (0..self.cells.len()).filter(|c| self.fissile(*c)).count() as f64 * self.pitch * self.pitch * self.height
    }

    pub fn rod_insertions(&self) -> Vec<f64> {
        self.rods.iter().map(|r| r.insertion).collect()
    }
}

/// The static solution of a layout: k_eff and the shapes (fine grid, row-major).
pub struct Static {
    pub k: f64,
    pub flux1: Vec<f64>,
    pub flux2: Vec<f64>,
    /// Power density per fine cell and per cell of the document, relative to the mean over the fuel cells.
    pub power: Vec<f64>,
    pub cell_power: Vec<f64>,
    /// Largest cell power (the hot cell).
    pub peak: f64,
    pub applications: usize,
    pub restarts: usize,
    pub residual: f64,
    pub converged: bool,
}

/// Default tolerance of the eigenvalue iteration (relative residual of the fission source).
pub const TOLERANCE: f64 = 1e-9;

fn shapes(doc: &Doc, solver: &Solver, s: &Solution) -> (Vec<f64>, Vec<f64>, f64) {
    let op = &solver.op;
    let r = doc.refine;
    let (fx, fy) = (doc.nx * r, doc.ny * r);
    let h2 = (doc.pitch / r as f64) * (doc.pitch / r as f64);
    let mut power = vec![0.0; fx * fy];
    let mut cell = vec![0.0; doc.nx * doc.ny];
    for y in 0..fy {
        for x in 0..fx {
            let q = op.index(x, y);
            let p = op.fis[0][q] * s.flux[0][q] + op.fis[1][q] * s.flux[1][q];
            power[y * fx + x] = p / h2;
            cell[(y / r) * doc.nx + x / r] += p;
        }
    }
    // the total fission rate is 1: the mean power density of the fuel cells is 1/(their area)
    let fuel_cells = (0..cell.len()).filter(|c| doc.fissile(*c)).count().max(1) as f64;
    let mean = 1.0 / (fuel_cells * doc.pitch * doc.pitch);
    let mut peak = 0.0f64;
    for c in cell.iter_mut() {
        *c /= doc.pitch * doc.pitch * mean;
        if *c > peak {
            peak = *c;
        }
    }
    for p in power.iter_mut() {
        *p /= mean;
    }
    (power, cell, peak)
}

/// Solve the layout at a state of the core.
pub fn solve(doc: &Doc, c: &Conditions, insertion: &[f64], tol: f64) -> SimResult<(Solver, Solution, Static)> {
    let solver = Solver::new(&doc.problem(c, insertion))?;
    let s = solver.criticality(tol, 60)?;
    let (power, cell_power, peak) = shapes(doc, &solver, &s);
    // fluxes relative to the mean power density 1 (see `shapes`)
    let fuel_cells = (0..doc.cells.len()).filter(|c| doc.fissile(*c)).count().max(1) as f64;
    let scale = fuel_cells * doc.pitch * doc.pitch;
    let flux1: Vec<f64> = solver.op.row_major(&s.flux[0]).iter().map(|v| v * scale).collect();
    let flux2: Vec<f64> = solver.op.row_major(&s.flux[1]).iter().map(|v| v * scale).collect();
    let st = Static { k: s.k, flux1, flux2, power, cell_power, peak, applications: s.applications, restarts: s.restarts, residual: s.residual, converged: s.converged };
    Ok((solver, s, st))
}

/// The seven state variables the cross-sections follow, in the order of `Summary::alpha`.
pub const FEEDBACK: [&str; 7] = ["fuelT", "moderatorT", "coolantT", "moderatorVoid", "coolantVoid", "xenon", "samarium"];

fn component(c: &Conditions, i: usize) -> f64 {
    match i {
        0 => c.fuel_t,
        1 => c.moderator_t,
        2 => c.coolant_t,
        3 => c.moderator_void,
        4 => c.coolant_void,
        5 => c.xenon,
        _ => c.samarium,
    }
}

fn shifted(c: &Conditions, i: usize, step: f64) -> Conditions {
    let mut out = *c;
    match i {
        0 => out.fuel_t += step,
        1 => out.moderator_t += step,
        2 => out.coolant_t += step,
        3 => out.moderator_void += step,
        4 => out.coolant_void += step,
        5 => out.xenon += step,
        _ => out.samarium += step,
    }
    out
}

/// Steps of the finite perturbations: 50 K of fuel temperature, 10 K of moderator and coolant temperature, 5 % void,
/// 10¹⁵ cm⁻³ of xenon and of samarium.
const STEPS: [f64; 7] = [50.0, 10.0, 10.0, 0.05, 0.05, 1e-9, 1e-9];

/// What the dynamic model keeps of a static solution.
#[derive(Clone, Debug, PartialEq)]
pub struct Summary {
    /// Fingerprint of the document, the rod positions and the base state.
    pub key: String,
    pub k: f64,
    /// Static reactivity 1 − 1/k at the base state.
    pub rho: f64,
    pub base: Conditions,
    pub rods: Vec<f64>,
    /// ∂ρ/∂x for the variables of `FEEDBACK` (adjoint-weighted first-order perturbation at the base state).
    pub alpha: [f64; 7],
    /// Power of the hottest cell relative to the mean of the fuel cells.
    pub peak: f64,
    /// Mean generation time Λ (s).
    pub generation: f64,
    /// Mean thermal flux in the fuel per unit of fission-rate density (cm).
    pub flux_per_fission: f64,
    /// Thermal flux at the detectors per unit of fission-rate density (cm).
    pub detectors: Vec<f64>,
    /// Importance of a source neutron relative to an average fission neutron.
    pub source_weight: f64,
    pub converged: bool,
}

pub fn summary_key(doc: &Doc, base: &Conditions, rods: &[f64]) -> String {
    let mut h = Sha256::new();
    h.update(doc.key.as_bytes());
    h.update_f64(rods);
    h.update_f64(&[base.fuel_t, base.moderator_t, base.coolant_t, base.moderator_void, base.coolant_void, base.xenon, base.samarium]);
    h.digest_hex()
}

/// Solve the layout at the base state with the rods at `rods` and derive the summary (two eigenvalue solutions:
/// the flux and the adjoint).
pub fn summary(doc: &Doc, base: &Conditions, rods: &[f64]) -> SimResult<Summary> {
    let problem = doc.problem(base, rods);
    let solver = Solver::new(&problem)?;
    let s = solver.criticality(TOLERANCE, 60)?;
    let adj = solver.adjoint(&s, TOLERANCE, 60);
    let op = &solver.op;
    let (_, _, peak) = shapes(doc, &solver, &s);
    let r = doc.refine;
    let (fx, fy) = (doc.nx * r, doc.ny * r);
    let h2 = problem.h * problem.h;
    let (v1, v2) = match doc.lib() {
        Some(l) => (l.v1, l.v2 * (base.moderator_t / l.t_ref).sqrt()),
        None => (V1, V2),
    };
    let mut generation = 0.0;
    let mut in_fuel = 0.0;
    let mut source_total = 0.0;
    let mut detectors = vec![0.0; doc.detectors.len()];
    let (mut importance, mut source_cells) = (0.0, 0usize);
    for y in 0..fy {
        for x in 0..fx {
            let q = op.index(x, y);
            let cell = (y / r) * doc.nx + x / r;
            generation += (adj.flux[0][q] * s.flux[0][q] / v1 + adj.flux[1][q] * s.flux[1][q] / v2) * h2;
            if doc.fissile(cell) {
                in_fuel += s.flux[1][q] * h2;
            }
            source_total += problem.xs[y * fx + x].nf1 * s.flux[0][q] * h2 + problem.xs[y * fx + x].nf2 * s.flux[1][q] * h2;
            for (d, dc) in doc.detectors.iter().enumerate() {
                if *dc == cell {
                    detectors[d] += s.flux[1][q] / (r * r) as f64;
                }
            }
            if doc.materials[doc.cells[cell]].kind == Kind::Source {
                importance += adj.flux[0][q];
                source_cells += 1;
            }
        }
    }
    // the adjoint is scaled to ⟨φ†, Fφ⟩ = 1, so the mean importance of a fission neutron is 1/Σ(fission source)
    let source_weight = if source_cells > 0 && source_total > 0.0 { importance / source_cells as f64 * source_total } else { 1.0 };
    let fuel_area = (0..doc.cells.len()).filter(|c| doc.fissile(*c)).count().max(1) as f64 * doc.pitch * doc.pitch;
    for d in detectors.iter_mut() {
        *d *= fuel_area;
    }
    let mut alpha = [0.0; 7];
    if doc.lib.is_some() {
        for i in 0..7 {
            let changed = Operator::new(&doc.problem(&shifted(base, i, STEPS[i]), rods))?;
            alpha[i] = perturbation(op, &changed, s.k, &s.flux, &adj.flux) / STEPS[i];
        }
    }
    Ok(Summary {
        key: summary_key(doc, base, rods),
        k: s.k,
        rho: 1.0 - 1.0 / s.k,
        base: *base,
        rods: rods.to_vec(),
        alpha,
        peak,
        generation,
        flux_per_fission: in_fuel,
        detectors,
        source_weight,
        converged: s.converged && adj.converged,
    })
}

impl Summary {
    /// Reactivity of the feedback: Σ α·(x − x_base).
    pub fn feedback(&self, now: &Conditions) -> f64 {
        let mut rho = 0.0;
        for i in 0..7 {
            rho += self.alpha[i] * (component(now, i) - component(&self.base, i));
        }
        rho
    }

    pub fn to_json(&self) -> Value {
        json!({
            "key": self.key, "k": jnum(self.k), "rho": jnum(self.rho), "base": self.base.to_json(),
            "rods": self.rods.iter().map(|x| jnum(*x)).collect::<Vec<_>>(),
            "alpha": self.alpha.iter().map(|x| jnum(*x)).collect::<Vec<_>>(),
            "peak": jnum(self.peak), "generation": jnum(self.generation), "fluxPerFission": jnum(self.flux_per_fission),
            "detectors": self.detectors.iter().map(|x| jnum(*x)).collect::<Vec<_>>(),
            "sourceWeight": jnum(self.source_weight), "converged": self.converged,
        })
    }

    pub fn from_json(v: &Value) -> Option<Summary> {
        let list = |k: &str| -> Option<Vec<f64>> { Some(v.get(k)?.as_array()?.iter().map(dnum).collect()) };
        let a = list("alpha")?;
        if a.len() != 7 || a.iter().any(|x| !x.is_finite()) {
            return None;
        }
        let mut alpha = [0.0; 7];
        alpha.copy_from_slice(&a);
        let f = |k: &str| -> Option<f64> { v.get(k).map(dnum).filter(|x| x.is_finite()) };
        Some(Summary {
            key: v.get("key")?.as_str()?.to_string(),
            k: f("k")?,
            rho: f("rho")?,
            base: Conditions::from_json(v.get("base"), Conditions::cold(293.0)),
            rods: list("rods")?,
            alpha,
            peak: f("peak")?,
            generation: f("generation")?,
            flux_per_fission: f("fluxPerFission")?,
            detectors: list("detectors")?,
            source_weight: f("sourceWeight")?,
            converged: v.get("converged").and_then(|x| x.as_bool()).unwrap_or(false),
        })
    }
}
