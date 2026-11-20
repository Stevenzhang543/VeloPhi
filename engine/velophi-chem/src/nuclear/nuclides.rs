//! The nuclide table (26.64, D276): ground states and main isomers with mass excess, half-life, abundance and decay
//! modes, as transcribed from NUBASE2020 / AME2020 by `scripts/chem/build_nuclides.py` (src/chem/data/nuclides.json).
//!
//! The table is data of the interface, handed over once with `nuclideSetData` and global to the core instance, like
//! the model registry (`setModels`). What the data file does not contain is computed here:
//!
//! - the daughter of every decay mode and its Q value from the mass excesses (atomic masses: a β⁻ electron is the
//!   daughter atom's extra electron, a proton leaves as a hydrogen atom, an α particle as a helium atom);
//! - the branches of the decay network: β-delayed particle emission (`B-n`, `B+p` …) is published as a part of the
//!   β intensity and is taken out of it; `EC` and `e+` listed beside `B+` are its components and add nothing;
//!   intensities that add up to more than 1 are scaled down to 1, a sum below 1 leaves the rest untracked;
//! - which state of the daughter is fed: the ground state unless the table's feeding list (or the request) gives the
//!   fraction that reaches an isomer. NUBASE does not publish that fraction in general; where a daughter has an
//!   isomer in the table and nothing is known, the branch is reported with the diagnostic `nuclide.isomerFeeding`.

use std::cell::RefCell;
use std::rc::Rc;

use serde_json::{json, Value};
use velophi_core::message::{Message, SimResult};
use velophi_core::transport::dnum;

/// Element symbols by Z (0: the neutron).
pub const SYMBOLS: [&str; 119] = [
    "n", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
];

/// Atomic mass unit in keV (CODATA 2018, the value AME2020 is evaluated with), electron rest energy (keV), the
/// Avogadro constant (exact) and ln 2.
pub const U_KEV: f64 = 931494.10242;
pub const ME_KEV: f64 = 510.99895;
pub const AVOGADRO: f64 = 6.02214076e23;
pub const LN2: f64 = std::f64::consts::LN_2;

/// Flags of a nuclide (the bit field of the data file).
pub const F_MASS_EST: u32 = 1;
pub const F_T_EST: u32 = 2;
pub const F_T_LIMIT: u32 = 4;
pub const F_UNBOUND: u32 = 8;
pub const F_MODES_OPEN: u32 = 16;

/// A decay mode: the change of Z by the β part, the emitted particles (Z, A, count) and what it is a part of.
pub struct ModeDef {
    pub name: &'static str,
    /// ΔZ of the β part: +1 β⁻, −1 β⁺ / electron capture, ±2 double β, 0 none.
    pub beta: i32,
    pub emit: &'static [(u16, u16, u16)],
    /// The mode whose published intensity includes this one (β-delayed emission, the components of `B+`).
    pub part_of: Option<&'static str>,
    pub fission: bool,
    pub isomeric: bool,
}

const fn mode(name: &'static str, beta: i32, emit: &'static [(u16, u16, u16)], part_of: Option<&'static str>) -> ModeDef {
    ModeDef { name, beta, emit, part_of, fission: false, isomeric: false }
}

const P1: &[(u16, u16, u16)] = &[(1, 1, 1)];
const P2: &[(u16, u16, u16)] = &[(1, 1, 2)];
const P3: &[(u16, u16, u16)] = &[(1, 1, 3)];
const N1: &[(u16, u16, u16)] = &[(0, 1, 1)];
const N2: &[(u16, u16, u16)] = &[(0, 1, 2)];
const N3: &[(u16, u16, u16)] = &[(0, 1, 3)];
const N4: &[(u16, u16, u16)] = &[(0, 1, 4)];
const ALPHA: &[(u16, u16, u16)] = &[(2, 4, 1)];
const DEUTERON: &[(u16, u16, u16)] = &[(1, 2, 1)];
const TRITON: &[(u16, u16, u16)] = &[(1, 3, 1)];

/// Every decay mode of the data file (NUBASE2020 notation).
pub const MODES: &[ModeDef] = &[
    mode("B-", 1, &[], None),
    mode("B+", -1, &[], None),
    mode("EC", -1, &[], Some("B+")),
    mode("e+", -1, &[], Some("B+")),
    mode("A", 0, ALPHA, None),
    ModeDef { name: "IT", beta: 0, emit: &[], part_of: None, fission: false, isomeric: true },
    ModeDef { name: "SF", beta: 0, emit: &[], part_of: None, fission: true, isomeric: false },
    mode("p", 0, P1, None),
    mode("2p", 0, P2, None),
    mode("3p", 0, P3, None),
    mode("n", 0, N1, None),
    mode("2n", 0, N2, None),
    mode("3n", 0, N3, None),
    mode("2B-", 2, &[], None),
    mode("2B+", -2, &[], None),
    mode("B-n", 1, N1, Some("B-")),
    mode("B-2n", 1, N2, Some("B-")),
    mode("B-3n", 1, N3, Some("B-")),
    mode("B-4n", 1, N4, Some("B-")),
    mode("B-p", 1, P1, Some("B-")),
    mode("B-A", 1, ALPHA, Some("B-")),
    mode("B-d", 1, DEUTERON, Some("B-")),
    mode("B-t", 1, TRITON, Some("B-")),
    ModeDef { name: "B-SF", beta: 1, emit: &[], part_of: Some("B-"), fission: true, isomeric: false },
    mode("B+p", -1, P1, Some("B+")),
    mode("B+2p", -1, P2, Some("B+")),
    mode("B+3p", -1, P3, Some("B+")),
    mode("B+A", -1, ALPHA, Some("B+")),
    mode("B+pA", -1, &[(1, 1, 1), (2, 4, 1)], Some("B+")),
    ModeDef { name: "B+SF", beta: -1, emit: &[], part_of: Some("B+"), fission: true, isomeric: false },
    mode("14C", 0, &[(6, 14, 1)], None),
    mode("12C", 0, &[(6, 12, 1)], None),
    mode("18O", 0, &[(8, 18, 1)], None),
    mode("20O", 0, &[(8, 20, 1)], None),
    mode("20Ne", 0, &[(10, 20, 1)], None),
    mode("22Ne", 0, &[(10, 22, 1)], None),
    mode("23F", 0, &[(9, 23, 1)], None),
    mode("24Ne", 0, &[(10, 24, 1)], None),
    mode("25Ne", 0, &[(10, 25, 1)], None),
    mode("28Mg", 0, &[(12, 28, 1)], None),
    mode("30Mg", 0, &[(12, 30, 1)], None),
    mode("32Si", 0, &[(14, 32, 1)], None),
    mode("34Si", 0, &[(14, 34, 1)], None),
    mode("d", 0, DEUTERON, None),
    mode("3H", 0, TRITON, None),
    mode("3He", 0, &[(2, 3, 1)], None),
];

pub fn mode_index(name: &str) -> Option<usize> {
    MODES.iter().position(|m| m.name == name)
}

/// One nuclide of the table.
#[derive(Clone, Debug)]
pub struct Nuclide {
    pub z: u16,
    pub a: u16,
    /// 0 ground state, 1 isomer m, 2 isomer n.
    pub state: u8,
    /// Mass excess (keV); NaN when not known.
    pub mass_excess: f64,
    /// Half-life (s): +∞ stable, NaN not known.
    pub half_life: f64,
    /// Isotopic abundance (percent), 0 when none.
    pub abundance: f64,
    pub flags: u32,
    /// Published decay modes: (index into `MODES`, intensity as a fraction; NaN when not known).
    pub decays: Vec<(usize, f64)>,
}

impl Nuclide {
    pub fn stable(&self) -> bool {
        self.half_life == f64::INFINITY
    }
    /// Decay constant (1/s): 0 for a stable nuclide, NaN when the half-life is not known.
    pub fn lambda(&self) -> f64 {
        if self.stable() {
            0.0
        } else {
            LN2 / self.half_life
        }
    }
    /// "U-238", "Tc-99m", "Hf-178n".
    pub fn id(&self) -> String {
        format_id(self.z, self.a, self.state)
    }
    /// Atomic mass (u).
    pub fn mass_u(&self) -> f64 {
        self.a as f64 + self.mass_excess / U_KEV
    }
}

pub fn format_id(z: u16, a: u16, state: u8) -> String {
    let suffix = match state {
        1 => "m",
        2 => "n",
        _ => "",
    };
    format!("{}-{}{}", SYMBOLS.get(z as usize).copied().unwrap_or("?"), a, suffix)
}

/// Parse a nuclide name: "U-238", "U238", "238U", "Tc-99m", "99mTc", "tc99m" (case of the symbol is ignored).
pub fn parse_id(text: &str) -> Option<(u16, u16, u8)> {
    let t: Vec<char> = text.trim().chars().filter(|c| *c != '-' && *c != ' ').collect();
    if t.is_empty() {
        return None;
    }
    // split into the runs: digits, letters
    let (mut digits, mut letters, mut tail) = (String::new(), String::new(), String::new());
    let lead_digit = t[0].is_ascii_digit();
    let mut i = 0;
    if lead_digit {
        while i < t.len() && t[i].is_ascii_digit() {
            digits.push(t[i]);
            i += 1;
        }
        // "99mTc": an isomer letter before the symbol
        if i + 1 < t.len() && (t[i] == 'm' || t[i] == 'n') && t[i + 1].is_ascii_uppercase() {
            tail.push(t[i]);
            i += 1;
        }
        while i < t.len() && t[i].is_ascii_alphabetic() {
            letters.push(t[i]);
            i += 1;
        }
    } else {
        while i < t.len() && t[i].is_ascii_alphabetic() {
            letters.push(t[i]);
            i += 1;
        }
        while i < t.len() && t[i].is_ascii_digit() {
            digits.push(t[i]);
            i += 1;
        }
        while i < t.len() && t[i].is_ascii_alphabetic() {
            tail.push(t[i]);
            i += 1;
        }
    }
    if i != t.len() || digits.is_empty() || letters.is_empty() || digits.len() > 3 {
        return None;
    }
    let state = match tail.as_str() {
        "" => 0,
        "m" => 1,
        "n" => 2,
        _ => return None,
    };
    let z = SYMBOLS.iter().position(|s| s.eq_ignore_ascii_case(&letters))?;
    let a: u16 = digits.parse().ok()?;
    if a == 0 || (z as u16) > a {
        return None;
    }
    Some((z as u16, a, state))
}

/// A feeding fraction: of the decays of `parent` by `mode`, `fraction` reach the daughter's isomer `daughter_state`.
#[derive(Clone, Debug)]
pub struct Feeding {
    pub parent: (u16, u16, u8),
    pub mode: usize,
    pub daughter_state: u8,
    pub fraction: f64,
}

/// The installed table.
#[derive(Default)]
pub struct Table {
    /// Sorted by (Z, A, state).
    pub nuclides: Vec<Nuclide>,
    pub feeding: Vec<Feeding>,
    pub citations: Vec<String>,
    pub licence: String,
}

fn key(z: u16, a: u16, state: u8) -> u32 {
    ((z as u32) << 16) | ((a as u32) << 4) | state as u32
}

thread_local! {
    static TABLE: RefCell<Rc<Table>> = RefCell::new(Rc::new(Table::default()));
}

fn bad(what: impl Into<String>) -> Message {
    Message::new("err.internal").text("message", format!("nuclide data: {}", what.into()))
}

/// The installed table; an error while none has been handed over.
pub fn table() -> SimResult<Rc<Table>> {
    let t = TABLE.with(|t| t.borrow().clone());
    if t.nuclides.is_empty() {
        return Err(bad("not loaded (nuclideSetData)"));
    }
    Ok(t)
}

/// Install the table of `src/chem/data/nuclides.json`; returns its counts and citations.
pub fn set(data: &Value) -> SimResult<Value> {
    if data.get("format").and_then(|v| v.as_str()) != Some("velophi-nuclides") {
        return Err(bad("format is not velophi-nuclides"));
    }
    let names = data.get("modes").and_then(|v| v.as_array()).ok_or_else(|| bad("modes missing"))?;
    let mut map = Vec::with_capacity(names.len());
    for n in names {
        let name = n.as_str().unwrap_or("");
        map.push(mode_index(name).ok_or_else(|| bad(format!("unknown decay mode {name}")))?);
    }
    let rows = data.get("nuclides").and_then(|v| v.as_array()).ok_or_else(|| bad("nuclides missing"))?;
    let mut nuclides = Vec::with_capacity(rows.len());
    for (k, row) in rows.iter().enumerate() {
        let r = row.as_array().filter(|r| r.len() >= 8).ok_or_else(|| bad(format!("row {k} is not an array of 8")))?;
        let int = |i: usize| r[i].as_u64().ok_or_else(|| bad(format!("row {k} column {i}")));
        let (z, a, state) = (int(0)? as u16, int(1)? as u16, int(2)? as u8);
        if z as usize >= SYMBOLS.len() || a == 0 || z > a || state > 2 {
            return Err(bad(format!("row {k}: Z, A or state out of range")));
        }
        let half_life = match &r[4] {
            Value::Null => f64::NAN,
            v => {
                let t = dnum(v);
                if t == 0.0 {
                    f64::INFINITY
                } else if t > 0.0 {
                    t
                } else {
                    return Err(bad(format!("row {k}: half-life")));
                }
            }
        };
        let mut decays = Vec::new();
        let d = r[7].as_array().ok_or_else(|| bad(format!("row {k}: decays")))?;
        for pair in d.chunks(2) {
            if pair.len() != 2 {
                return Err(bad(format!("row {k}: decays come in pairs")));
            }
            let m = pair[0].as_u64().map(|m| m as usize).filter(|m| *m < map.len()).ok_or_else(|| bad(format!("row {k}: mode index")))?;
            let f = if pair[1].is_null() { f64::NAN } else { dnum(&pair[1]) };
            if f < 0.0 {
                return Err(bad(format!("row {k}: negative intensity")));
            }
            decays.push((map[m], f));
        }
        nuclides.push(Nuclide { z, a, state, mass_excess: if r[3].is_null() { f64::NAN } else { dnum(&r[3]) }, half_life, abundance: dnum(&r[5]).max(0.0), flags: int(6)? as u32, decays });
    }
    nuclides.sort_by_key(|n| key(n.z, n.a, n.state));
    if nuclides.windows(2).any(|w| key(w[0].z, w[0].a, w[0].state) == key(w[1].z, w[1].a, w[1].state)) {
        return Err(bad("a nuclide is listed twice"));
    }
    let mut feeding = Vec::new();
    for (k, row) in data.get("feeding").and_then(|v| v.as_array()).map(|a| a.as_slice()).unwrap_or(&[]).iter().enumerate() {
        let r = row.as_array().filter(|r| r.len() >= 6).ok_or_else(|| bad(format!("feeding {k}")))?;
        let int = |i: usize| r[i].as_u64().ok_or_else(|| bad(format!("feeding {k} column {i}")));
        let m = int(3)? as usize;
        let fraction = dnum(&r[5]);
        if m >= map.len() || !(fraction > 0.0 && fraction <= 1.0) || !(1..=2).contains(&int(4)?) {
            return Err(bad(format!("feeding {k}: mode, state or fraction")));
        }
        feeding.push(Feeding { parent: (int(0)? as u16, int(1)? as u16, int(2)? as u8), mode: map[m], daughter_state: int(4)? as u8, fraction });
    }
    let citations: Vec<String> = data.get("citations").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|c| c.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
    let licence = data.get("licence").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let t = Table { nuclides, feeding, citations, licence };
    let out = json!({
        "nuclides": t.nuclides.len(),
        "ground": t.nuclides.iter().filter(|n| n.state == 0).count(),
        "isomers": t.nuclides.iter().filter(|n| n.state != 0).count(),
        "stable": t.nuclides.iter().filter(|n| n.stable()).count(),
        "feeding": t.feeding.len(),
        "citations": t.citations,
        "licence": t.licence,
    });
    TABLE.with(|cell| *cell.borrow_mut() = Rc::new(t));
    Ok(out)
}

/// Where a branch leads.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Target {
    /// Index of the daughter in the table.
    Nuclide(usize),
    /// Spontaneous or β-delayed fission: the products are a distribution the table does not hold.
    Fission,
    /// The daughter (Z, A) is not in the table.
    Outside(u16, u16),
}

/// One branch of the decay network of a nuclide.
#[derive(Clone, Debug)]
pub struct Branch {
    pub mode: &'static str,
    pub target: Target,
    /// Fraction of the decays of the parent.
    pub fraction: f64,
    /// Q value (keV) from the atomic mass excesses; NaN when a mass is missing or for fission.
    pub q: f64,
    /// The daughter has an isomer in the table and no feeding fraction is known: everything is put in the ground state.
    pub isomer_unknown: Option<usize>,
}

/// The branches of a nuclide.
#[derive(Clone, Debug, Default)]
pub struct Branches {
    pub list: Vec<Branch>,
    /// Sum of the published intensities after taking the delayed modes out of their β mode.
    pub sum: f64,
    /// The nuclide decays but no intensity is published.
    pub unknown: bool,
}

impl Table {
    pub fn find(&self, z: u16, a: u16, state: u8) -> Option<usize> {
        self.nuclides.binary_search_by_key(&key(z, a, state), |n| key(n.z, n.a, n.state)).ok()
    }

    pub fn find_id(&self, id: &str) -> Option<usize> {
        let (z, a, s) = parse_id(id)?;
        self.find(z, a, s)
    }

    fn excess(&self, z: u16, a: u16) -> f64 {
        self.find(z, a, 0).map(|i| self.nuclides[i].mass_excess).unwrap_or(f64::NAN)
    }

    /// Binding energy (keV) of a nuclide from the mass excesses of ¹H, the neutron and the nuclide (ground-state
    /// atomic masses; for an isomer the excitation energy lowers it).
    pub fn binding(&self, i: usize) -> f64 {
        let n = &self.nuclides[i];
        n.z as f64 * self.excess(1, 1) + (n.a - n.z) as f64 * self.excess(0, 1) - n.mass_excess
    }

    /// The branches of nuclide `i` (see the module text). `extra` are feeding fractions of the request, which come
    /// before the table's.
    pub fn branches(&self, i: usize, extra: &[Feeding]) -> Branches {
        let n = &self.nuclides[i];
        let mut out = Branches::default();
        if n.decays.is_empty() {
            return out;
        }
        if n.decays.iter().all(|d| d.1.is_nan()) {
            out.unknown = true;
            return out;
        }
        let listed = |name: &str| n.decays.iter().any(|d| MODES[d.0].name == name && !d.1.is_nan());
        let component = |def: &ModeDef| def.part_of == Some("B+") && def.emit.is_empty() && !def.fission;
        let delayed = |def: &ModeDef| def.part_of.is_some() && (!def.emit.is_empty() || def.fission);
        // the mode the β⁺-delayed intensities are taken out of: B+, or the first of EC / e+ when B+ is not listed
        let plus_base = if listed("B+") { mode_index("B+") } else { n.decays.iter().find(|d| !d.1.is_nan() && component(&MODES[d.0])).map(|d| d.0) };
        // net intensity of every mode
        let mut net: Vec<(usize, f64)> = Vec::new();
        for &(m, f) in &n.decays {
            if f.is_nan() {
                continue;
            }
            let def = &MODES[m];
            let mut f = f;
            // a component of B+ listed beside it adds nothing
            if component(def) && listed("B+") {
                continue;
            }
            let family = if Some(m) == plus_base {
                Some("B+")
            } else if def.part_of.is_none() {
                Some(def.name)
            } else {
                None
            };
            if let Some(family) = family {
                // a β mode: take its delayed parts out
                for &(m2, f2) in &n.decays {
                    let d2 = &MODES[m2];
                    if d2.part_of == Some(family) && delayed(d2) && !f2.is_nan() {
                        f -= f2;
                    }
                }
            }
            if f > 0.0 {
                net.push((m, f));
            }
        }
        out.sum = net.iter().map(|x| x.1).sum();
        let scale = if out.sum > 1.0 { 1.0 / out.sum } else { 1.0 };
        for (m, f) in net {
            let def = &MODES[m];
            let f = f * scale;
            if def.fission {
                out.list.push(Branch { mode: def.name, target: Target::Fission, fraction: f, q: f64::NAN, isomer_unknown: None });
                continue;
            }
            let (mut dz, mut da) = (def.beta, 0i32);
            let mut emitted = 0.0;
            for &(ez, ea, count) in def.emit {
                dz -= ez as i32 * count as i32;
                da -= ea as i32 * count as i32;
                emitted += count as f64 * self.excess(ez, ea);
            }
            let (z2, a2) = (n.z as i32 + dz, n.a as i32 + da);
            if z2 < 0 || a2 < 1 || z2 > a2 {
                out.list.push(Branch { mode: def.name, target: Target::Outside(z2.max(0) as u16, a2.max(0) as u16), fraction: f, q: f64::NAN, isomer_unknown: None });
                continue;
            }
            let (z2, a2) = (z2 as u16, a2 as u16);
            let Some(ground) = self.find(z2, a2, 0) else {
                out.list.push(Branch { mode: def.name, target: Target::Outside(z2, a2), fraction: f, q: f64::NAN, isomer_unknown: None });
                continue;
            };
            let q_ground = n.mass_excess - self.nuclides[ground].mass_excess - emitted;
            // feeding of an isomer of the daughter
            let fed = extra.iter().chain(self.feeding.iter()).find(|x| x.parent == (n.z, n.a, n.state) && x.mode == m);
            let isomer = fed.and_then(|x| self.find(z2, a2, x.daughter_state).map(|j| (j, x.fraction))).filter(|(j, _)| *j != i);
            match isomer {
                Some((j, phi)) => {
                    let q_iso = n.mass_excess - self.nuclides[j].mass_excess - emitted;
                    out.list.push(Branch { mode: def.name, target: Target::Nuclide(j), fraction: f * phi, q: q_iso, isomer_unknown: None });
                    if phi < 1.0 {
                        out.list.push(Branch { mode: def.name, target: Target::Nuclide(ground), fraction: f * (1.0 - phi), q: q_ground, isomer_unknown: None });
                    }
                }
                None => {
                    // an isomer of the daughter below the decaying state that might be fed
                    let other = (1..=2u8).filter_map(|s| self.find(z2, a2, s)).find(|j| *j != i && !(def.isomeric && self.nuclides[*j].state >= n.state));
                    out.list.push(Branch { mode: def.name, target: Target::Nuclide(ground), fraction: f, q: q_ground, isomer_unknown: if fed.is_none() { other } else { None } });
                }
            }
        }
        out
    }
}

/// Feeding fractions of a request: `[{ parent, mode, to, fraction }]`.
pub fn request_feeding(req: &Value) -> SimResult<Vec<Feeding>> {
    let mut out = Vec::new();
    for f in req.get("feeding").and_then(|v| v.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
        let s = |k: &str| f.get(k).and_then(|v| v.as_str()).unwrap_or("");
        let parent = parse_id(s("parent")).ok_or_else(|| bad(format!("feeding: parent {}", s("parent"))))?;
        let to = parse_id(s("to")).ok_or_else(|| bad(format!("feeding: to {}", s("to"))))?;
        let mode = mode_index(s("mode")).ok_or_else(|| bad(format!("feeding: mode {}", s("mode"))))?;
        let fraction = f.get("fraction").map(dnum).unwrap_or(f64::NAN);
        if !(fraction > 0.0 && fraction <= 1.0) || to.2 == 0 {
            return Err(bad("feeding: fraction must be in (0, 1] and the target an isomer"));
        }
        out.push(Feeding { parent, mode, daughter_state: to.2, fraction });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids() {
        assert_eq!(parse_id("U-238"), Some((92, 238, 0)));
        assert_eq!(parse_id("u238"), Some((92, 238, 0)));
        assert_eq!(parse_id("238U"), Some((92, 238, 0)));
        assert_eq!(parse_id("Tc-99m"), Some((43, 99, 1)));
        assert_eq!(parse_id("99mTc"), Some((43, 99, 1)));
        assert_eq!(parse_id("Hf-178n"), Some((72, 178, 2)));
        assert_eq!(parse_id("n-1"), Some((0, 1, 0)));
        assert_eq!(parse_id("Xx-12"), None);
        assert_eq!(parse_id("He-1"), None);
        assert_eq!(parse_id("U-238x"), None);
        assert_eq!(format_id(43, 99, 1), "Tc-99m");
        assert_eq!(MODES.len(), 46);
        // every part_of names a mode
        for m in MODES {
            if let Some(p) = m.part_of {
                assert!(mode_index(p).is_some(), "{}", m.name);
            }
        }
    }
}
