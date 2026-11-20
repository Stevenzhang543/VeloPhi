//! Operations on molecules, crystals and orbitals (engine/CHEM.md, "Molecule operations"): the requests of the 3D
//! viewer. Every number and every generated geometry the viewer shows comes from here; coordinates are ångström,
//! angles degrees, large arrays typed blobs.

use serde_json::{json, Map, Value};
use velophi_core::message::{Message, SimResult};
use velophi_core::transport::{dnum, jnum, Blob};

use super::crystal::{self, Cell, Crystal, Site};
use super::elements::{Element, Table};
use super::measure;
use super::orbital;
use super::shape;
use super::vec3::{add, scale, V3};

fn bad(op: &str, what: impl AsRef<str>) -> Message {
    Message::new("err.internal").text("message", format!("calc {op}: {}", what.as_ref()))
}

fn num(v: &Value, k: &str, default: f64) -> f64 {
    match v.get(k) {
        None | Some(Value::Null) => default,
        Some(x) => {
            let d = dnum(x);
            if d.is_nan() {
                default
            } else {
                d
            }
        }
    }
}

fn opt_num(v: &Value, k: &str) -> Option<f64> {
    v.get(k).filter(|x| !x.is_null()).map(dnum).filter(|d| d.is_finite())
}

/// A JSON array of numbers; `None` when the key is absent, an error when an entry is not a finite number.
fn numbers(op: &str, v: &Value, k: &str) -> SimResult<Option<Vec<f64>>> {
    match v.get(k) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Array(a)) => {
            let out: Vec<f64> = a.iter().map(dnum).collect();
            if out.iter().any(|x| !x.is_finite()) {
                return Err(bad(op, format!("{k}: not a finite number")));
            }
            Ok(Some(out))
        }
        Some(_) => Err(bad(op, format!("{k}: an array is expected"))),
    }
}

fn points(op: &str, v: &Value, k: &str) -> SimResult<Vec<V3>> {
    let flat = numbers(op, v, k)?.unwrap_or_default();
    if flat.len() % 3 != 0 {
        return Err(bad(op, format!("{k}: three coordinates per point")));
    }
    Ok(flat.chunks(3).map(|c| [c[0], c[1], c[2]]).collect())
}

/// Bonds `(i, j, order)` from the flat triples of the molecule format.
fn bond_list(op: &str, v: &Value, count: usize) -> SimResult<Vec<(usize, usize, f64)>> {
    let flat = numbers(op, v, "bonds")?.unwrap_or_default();
    if flat.len() % 3 != 0 {
        return Err(bad(op, "bonds: triples (i, j, order) are expected"));
    }
    let mut out = Vec::with_capacity(flat.len() / 3);
    for t in flat.chunks(3) {
        let (i, j) = (t[0], t[1]);
        if i < 0.0 || j < 0.0 || i.fract() != 0.0 || j.fract() != 0.0 || i as usize >= count || j as usize >= count || i == j {
            return Err(bad(op, format!("bonds: no atoms {i} and {j}")));
        }
        out.push((i as usize, j as usize, t[2]));
    }
    Ok(out)
}

fn v3(p: V3) -> Value {
    json!([jnum(p[0]), jnum(p[1]), jnum(p[2])])
}

fn opt(v: Option<f64>) -> Value {
    v.map(jnum).unwrap_or(Value::Null)
}

fn key(k: Option<&'static str>) -> Value {
    k.map(|s| Value::String(s.to_string())).unwrap_or(Value::Null)
}

fn mol_measure(req: &Value, blob: &mut Blob) -> SimResult<Value> {
    const OP: &str = "molMeasure";
    let xyz = points(OP, req, "xyz")?;
    let mut out = Map::new();
    if let Some(pick) = numbers(OP, req, "pick")? {
        if pick.iter().any(|i| *i < 0.0 || i.fract() != 0.0 || *i as usize >= xyz.len()) {
            return Err(bad(OP, "pick: no such atom"));
        }
        let p: Vec<V3> = pick.iter().map(|i| xyz[*i as usize]).collect();
        let atoms: Vec<usize> = pick.iter().map(|i| *i as usize).collect();
        let v = match p.len() {
            2 => {
                let d = measure::distance(p[0], p[1]);
                json!({ "kind": "distance", "atoms": atoms, "distance": jnum(d), "distancePm": jnum(d * 100.0) })
            }
            3 => json!({ "kind": "angle", "atoms": atoms, "angle": jnum(measure::angle_deg(p[0], p[1], p[2])), "legs": [jnum(measure::distance(p[0], p[1])), jnum(measure::distance(p[1], p[2]))] }),
            4 => json!({ "kind": "dihedral", "atoms": atoms, "dihedral": opt(measure::dihedral_deg(p[0], p[1], p[2], p[3])) }),
            _ => return Err(bad(OP, "pick: two, three or four atoms")),
        };
        out.insert("pick".into(), v);
    }
    if req.get("bonds").is_some_and(|b| !b.is_null()) {
        let bonds = bond_list(OP, req, xyz.len())?;
        let nb = measure::neighbours(xyz.len(), &bonds);
        let ij: Vec<i32> = bonds.iter().flat_map(|b| [b.0 as i32, b.1 as i32]).collect();
        let order: Vec<f64> = bonds.iter().map(|b| b.2).collect();
        let length: Vec<f64> = bonds.iter().map(|b| measure::distance(xyz[b.0], xyz[b.1])).collect();
        let (ijk, deg) = measure::all_angles(&xyz, &nb);
        out.insert("bonds".into(), json!({ "ij": blob.i32s(&ij), "order": blob.f64s(&order), "length": blob.f64s(&length) }));
        out.insert("angles".into(), json!({ "ijk": blob.i32s(&ijk), "angle": blob.f64s(&deg) }));
    }
    Ok(Value::Object(out))
}

fn mol_shape(req: &Value, blob: &mut Blob) -> SimResult<Value> {
    const OP: &str = "molShape";
    let table = Table::from_request(req);
    let symbols: Vec<&str> = req.get("atoms").and_then(|a| a.as_array()).map(|a| a.iter().map(|s| s.as_str().unwrap_or("")).collect()).unwrap_or_default();
    let xyz = points(OP, req, "xyz")?;
    if symbols.len() != xyz.len() || symbols.iter().any(|s| s.is_empty()) {
        return Err(bad(OP, "atoms and xyz do not match"));
    }
    let atoms: Vec<Element> = symbols.iter().map(|s| table.get(s)).collect();
    let bonds = bond_list(OP, req, atoms.len())?;
    let per_atom = |k: &str| -> SimResult<Option<Vec<f64>>> {
        match numbers(OP, req, k)? {
            Some(v) if v.len() != atoms.len() => Err(bad(OP, format!("{k}: one value per atom"))),
            other => Ok(other),
        }
    };
    let charges = per_atom("charges")?;
    let formal = per_atom("formal")?;
    let s = shape::analyse(&atoms, &xyz, &bonds, charges.as_deref(), formal.as_deref());

    let centres: Vec<Value> = s
        .centres
        .iter()
        .map(|c| {
            let a = &atoms[c.atom];
            // Nominal lobe centres just outside the covalent radius; the viewer places them by its own ball size
            let reach = a.rcov + 0.1;
            json!({
                "atom": c.atom, "element": a.symbol, "neighbours": c.neighbours, "bonded": c.neighbours.len(), "lonePairs": c.lone_pairs,
                "steric": c.neighbours.len() + c.lone_pairs, "class": if c.class.is_empty() { Value::Null } else { Value::String(c.class.clone()) },
                "geometry": key(c.geometry), "electronGeometry": key(c.electron_geometry), "observed": key(c.observed), "regular": c.regular,
                "ideal": c.ideal.iter().map(|x| jnum(*x)).collect::<Vec<_>>(), "angles": c.angles.iter().map(|x| jnum(*x)).collect::<Vec<_>>(),
                "lobes": c.lobes.iter().map(|d| v3(*d)).collect::<Vec<_>>(),
                "lobePoints": c.lobes.iter().map(|d| v3(add(xyz[c.atom], scale(*d, reach)))).collect::<Vec<_>>()
            })
        })
        .collect();
    // The atom that names the shape of the whole molecule: the only central atom, when there is exactly one
    let main = if s.centres.len() == 1 { Some(0usize) } else { None };
    let geometry = match main {
        Some(k) => key(s.centres[k].geometry),
        None if atoms.len() == 2 && bonds.len() == 1 => Value::String("linear".into()),
        None => Value::Null,
    };
    let bond_json: Vec<Value> = s
        .bonds
        .iter()
        .map(|b| json!({ "i": b.i, "j": b.j, "order": jnum(b.order), "length": jnum(b.length), "deltaEN": opt(b.delta), "negative": b.negative, "kind": b.kind, "ionicCharacter": opt(b.ionic_character) }))
        .collect();
    let dipole = match &s.dipole {
        Some(d) => json!({ "vector": v3(d.vector), "magnitude": jnum(d.magnitude), "source": d.source, "origin": v3(d.origin) }),
        None => Value::Null,
    };
    let axes: Vec<Value> = s.axes.iter().flat_map(|a| a.iter().map(|x| jnum(*x))).collect();
    Ok(json!({
        "count": atoms.len(), "mass": jnum(s.mass), "lonePairs": s.lone_pairs, "centres": centres, "main": main, "geometry": geometry,
        "bonds": bond_json, "dipole": dipole,
        "centre": v3(s.centre), "axes": axes, "extent": v3(s.extent), "radius": jnum(s.radius), "radiusVdw": jnum(s.radius_vdw),
        "radii": { "covalent": blob.f64s(&atoms.iter().map(|a| a.rcov).collect::<Vec<_>>()), "vdw": blob.f64s(&atoms.iter().map(|a| a.rvdw).collect::<Vec<_>>()) },
        "en": atoms.iter().map(|a| opt(a.en)).collect::<Vec<_>>(),
        "diagnostics": s.diagnostics
    }))
}

/// A whole number of a request within a range.
fn count_of(v: &Value, lo: usize, hi: usize, default: usize) -> usize {
    let d = dnum(v);
    if d.is_finite() {
        (d.round().max(lo as f64).min(hi as f64)) as usize
    } else {
        default
    }
}

fn crystal_build(req: &Value, blob: &mut Blob) -> SimResult<Value> {
    const OP: &str = "crystalBuild";
    /// More atoms than this are refused: the viewer is specified for 2000 and stays usable well beyond.
    const MAX_ATOMS: usize = 40_000;
    let table = Table::from_request(req);
    let structure = req.get("structure").and_then(|v| v.as_str()).unwrap_or("");
    let mut diagnostics: Vec<Value> = Vec::new();

    // Basis: explicit, or generated from the structure type
    let mut names: Vec<String> = Vec::new();
    let mut sites: Vec<Site> = Vec::new();
    let mut hexagonal = false;
    let explicit = req.get("basis").and_then(|b| b.as_array()).filter(|b| !b.is_empty());
    if let Some(basis) = explicit {
        for (k, entry) in basis.iter().enumerate() {
            let e = entry.as_array().filter(|e| e.len() == 4).ok_or_else(|| bad(OP, format!("basis[{k}]: [element, u, v, w] is expected")))?;
            let symbol = e[0].as_str().filter(|s| !s.is_empty()).ok_or_else(|| bad(OP, format!("basis[{k}]: element symbol")))?;
            let f = [dnum(&e[1]), dnum(&e[2]), dnum(&e[3])];
            if f.iter().any(|x| !x.is_finite()) {
                return Err(bad(OP, format!("basis[{k}]: fractional coordinates")));
            }
            let species = match names.iter().position(|n| n == symbol) {
                Some(i) => i,
                None => {
                    names.push(symbol.to_string());
                    names.len() - 1
                }
            };
            sites.push(Site { species, frac: [crystal::wrap(f[0]), crystal::wrap(f[1]), crystal::wrap(f[2])] });
        }
    } else {
        let Some(st) = crystal::standard(structure, opt_num(req, "u")) else {
            // A structure the core cannot generate is reported, never guessed
            return Ok(json!({ "ok": false, "structure": structure, "diagnostics": [{ "code": "crystal.structureUnknown", "severity": "unmodelled", "params": { "structure": structure } }] }));
        };
        names = match req.get("species").and_then(|v| v.as_array()) {
            Some(a) => a.iter().map(|s| s.as_str().unwrap_or("").to_string()).collect(),
            None => req.get("element").and_then(|v| v.as_str()).map(|s| vec![s.to_string()]).unwrap_or_default(),
        };
        if names.len() != st.species || names.iter().any(|n| n.is_empty()) {
            return Err(bad(OP, format!("{structure}: {} species are expected", st.species)));
        }
        hexagonal = st.hexagonal;
        sites = st.sites.iter().map(|(s, f)| Site { species: *s, frac: *f }).collect();
    }
    let species: Vec<Element> = names.iter().map(|n| table.get(n)).collect();
    for e in species.iter().filter(|e| !e.known()) {
        diagnostics.push(json!({ "code": "mol.unknownElement", "severity": "unmodelled", "params": { "symbol": e.symbol } }));
    }

    // Cell: b and c default to a (an ideal close packing for hcp without c), γ to 120° for the hexagonal types
    let a = num(req, "a", f64::NAN);
    let b = num(req, "b", a);
    let c = match opt_num(req, "c") {
        Some(c) => c,
        None if structure == "hcp" && explicit.is_none() => a * (8.0f64 / 3.0).sqrt(),
        None => a,
    };
    let gamma = num(req, "gamma", if hexagonal { 120.0 } else { 90.0 });
    let cell = Cell::new(a, b, c, num(req, "alpha", 90.0), num(req, "beta", 90.0), gamma).ok_or_else(|| bad(OP, "the lattice constants do not span a cell"))?;
    let cr = Crystal { cell, species, sites };

    let n: [usize; 3] = match req.get("n").and_then(|v| v.as_array()) {
        Some(v) if v.len() == 3 => [count_of(&v[0], 1, 16, 1), count_of(&v[1], 1, 16, 1), count_of(&v[2], 1, 16, 1)],
        _ => [1, 1, 1],
    };
    if (n[0] + 1) * (n[1] + 1) * (n[2] + 1) * cr.sites.len() > 8 * MAX_ATOMS {
        return Err(bad(OP, "too many cells"));
    }
    let tolerance = num(req, "tolerance", 0.13).clamp(0.0, 0.5);
    let bond_scale = num(req, "bondScale", 1.3).clamp(0.0, 3.0);
    let sh = crystal::shells(&cr, tolerance, bond_scale);
    let block = crystal::expand(&cr, &sh, n);
    if block.atoms.len() > MAX_ATOMS {
        return Err(bad(OP, format!("{} atoms: at most {MAX_ATOMS}", block.atoms.len())));
    }

    // Polyhedron: of the atom asked for, or of the default atom with `"auto"` / `true`
    let chosen = match req.get("polyhedron") {
        None | Some(Value::Null) | Some(Value::Bool(false)) => None,
        Some(Value::Bool(true)) | Some(Value::String(_)) => block.default_polyhedron_atom(&cr, &sh),
        Some(v) => {
            let i = dnum(v);
            if i.is_finite() && i >= 0.0 && (i as usize) < block.atoms.len() {
                Some(i as usize)
            } else {
                return Err(bad(OP, "polyhedron: no such atom"));
            }
        }
    };
    let polyhedron = match chosen.and_then(|atom| block.polyhedron(&sh, atom)) {
        Some(p) => {
            let centre_site = block.atoms[p.atom].site;
            let flat: Vec<f64> = p.vertices.iter().flat_map(|v| v.2).collect();
            let index: Vec<i32> = p.vertices.iter().map(|v| v.0.map(|i| i as i32).unwrap_or(-1)).collect();
            let kinds: Vec<i32> = p.vertices.iter().map(|v| cr.sites[v.1].species as i32).collect();
            json!({
                "atom": p.atom, "element": cr.species[cr.sites[centre_site].species].symbol, "number": p.number,
                "distance": jnum(p.distance.0), "distanceMax": jnum(p.distance.1), "shape": if p.shape.is_empty() { Value::Null } else { Value::String(p.shape.to_string()) },
                "vertices": blob.f64s(&flat), "index": blob.i32s(&index), "kind": blob.i32s(&kinds), "faces": p.faces
            })
        }
        None => Value::Null,
    };

    let (fill, model, charges) = cr.fill_radii(&sh);
    let counts = cr.counts();
    let units = cr.formula_units();
    let species_json: Vec<Value> = cr
        .species
        .iter()
        .enumerate()
        .map(|(i, e)| json!({ "symbol": e.symbol, "mass": jnum(e.mass), "rcov": jnum(e.rcov), "rvdw": jnum(e.rvdw), "rfill": jnum(fill[i]), "charge": charges[i], "count": counts[i], "formula": counts[i] / units }))
        .collect();
    let site_json: Vec<Value> = cr
        .sites
        .iter()
        .enumerate()
        .map(|(s, site)| {
            let first = &sh.shell[s];
            let far = first.iter().fold(0.0f64, |m, nb| m.max(nb.distance));
            json!({ "element": cr.species[site.species].symbol, "frac": v3(site.frac), "number": first.len(), "nearest": jnum(sh.nearest[s]), "farthest": jnum(far) })
        })
        .collect();
    let kind: Vec<i32> = block.atoms.iter().map(|a| cr.sites[a.site].species as i32).collect();
    let site: Vec<i32> = block.atoms.iter().map(|a| a.site as i32).collect();
    let xyz: Vec<f64> = block.atoms.iter().flat_map(|a| a.pos).collect();
    let ij: Vec<i32> = block.bonds.iter().flat_map(|b| [b.0 as i32, b.1 as i32]).collect();
    let length: Vec<f64> = block.bonds.iter().map(|b| b.2).collect();
    let edges: Vec<f64> = block.edges.iter().flat_map(|e| *e).collect();
    let vectors: Vec<Value> = cr.cell.vectors.iter().flat_map(|v| v.iter().map(|x| jnum(*x))).collect();
    let nearest = sh.nearest.iter().fold(f64::INFINITY, |m, d| m.min(*d));
    Ok(json!({
        "ok": true, "structure": if structure.is_empty() { Value::Null } else { Value::String(structure.to_string()) },
        "cell": { "a": jnum(cr.cell.a), "b": jnum(cr.cell.b), "c": jnum(cr.cell.c), "alpha": jnum(cr.cell.alpha), "beta": jnum(cr.cell.beta), "gamma": jnum(cr.cell.gamma), "vectors": vectors, "volume": jnum(cr.cell.volume) },
        "species": species_json, "radiusModel": model, "sites": site_json,
        "n": n, "count": block.atoms.len(), "kind": blob.i32s(&kind), "site": blob.i32s(&site), "xyz": blob.f64s(&xyz),
        "bonds": { "ij": blob.i32s(&ij), "length": blob.f64s(&length) },
        "edges": { "xyz": blob.f64s(&edges), "outer": block.outer_edges },
        "polyhedron": polyhedron,
        "density": jnum(cr.density()), "cellMass": jnum(cr.cell_mass()), "formulaUnits": units, "packing": opt(cr.packing(&sh)),
        "nearest": if nearest.is_finite() { jnum(nearest) } else { Value::Null },
        "centre": v3(block.centre), "radius": jnum(block.radius), "diagnostics": diagnostics
    }))
}

fn orbital_sample(req: &Value, blob: &mut Blob) -> SimResult<Value> {
    const OP: &str = "orbitalSample";
    let whole = |k: &str| -> SimResult<i64> {
        let v = num(req, k, f64::NAN);
        if v.is_finite() && v.fract() == 0.0 {
            Ok(v as i64)
        } else {
            Err(bad(OP, format!("{k}: a whole number is expected")))
        }
    };
    let (n, l, m) = (whole("n")?, whole("l")?, whole("m")?);
    if !(1..=4).contains(&n) || l < 0 || l >= n || m.abs() > l {
        return Err(bad(OP, "quantum numbers: 1 ≤ n ≤ 4, 0 ≤ l < n, |m| ≤ l"));
    }
    let (n, l, m) = (n as usize, l as usize, m as i32);
    let z = num(req, "Z", 1.0);
    if !(z.is_finite() && (0.05..=200.0).contains(&z)) {
        return Err(bad(OP, "Z: out of range"));
    }
    let count = count_of(req.get("count").unwrap_or(&Value::Null), 0, 400_000, 16_000);
    let seed = num(req, "seed", 20_261_113.0);
    let seed = if seed.is_finite() && seed >= 0.0 { seed as u64 } else { 20_261_113 };
    let table = orbital::radial_table(n, l, z);
    let (xyz, sign) = orbital::sample(l, m, &table, count, seed);
    // The curves on every 16th grid point (257 values)
    let step = orbital::GRID / 256;
    let pick = |v: &[f64]| -> Vec<f64> { v.iter().step_by(step).copied().collect() };
    let mut out = json!({
        "n": n, "l": l, "m": m, "Z": jnum(z), "key": orbital::orbital_key(l, m), "subshell": format!("{n}{}", ["s", "p", "d", "f"][l]),
        "count": count, "seed": seed, "xyz": blob.f64s(&xyz), "sign": blob.u8s(&sign),
        "rMax": jnum(table.r_max), "r50": jnum(table.quantile(0.5)), "r90": jnum(table.quantile(0.9)), "r99": jnum(table.quantile(0.99)),
        "radial": { "r": blob.f64s(&pick(&table.r)), "R": blob.f64s(&pick(&table.big_r)), "P": blob.f64s(&pick(&table.p)) },
        "enclosed": jnum(table.enclosed), "radialNodes": table.nodes.len(), "nodeRadii": table.nodes.iter().map(|x| jnum(*x)).collect::<Vec<_>>(),
        "angularNodes": l, "nodes": table.nodes.len() + l,
        "meanRadius": jnum(orbital::mean_radius(n, l, z)), "peakRadius": jnum(table.peak), "energyEv": jnum(orbital::energy_ev(n, z)), "bohr": jnum(orbital::BOHR)
    });
    if req.get("at").is_some_and(|v| !v.is_null()) {
        let at = points(OP, req, "at")?;
        out["psi"] = Value::Array(at.iter().map(|p| jnum(orbital::psi(n, l, m, z, *p))).collect());
    }
    Ok(out)
}

/// Run one molecule operation; `None` when `op` is not one of them.
pub fn call(op: &str, req: &Value, blob: &mut Blob) -> Option<SimResult<Value>> {
    Some(match op {
        "molMeasure" => mol_measure(req, blob),
        "molShape" => mol_shape(req, blob),
        "crystalBuild" => crystal_build(req, blob),
        "orbitalSample" => orbital_sample(req, blob),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use velophi_core::transport::{parse_container, read_f64s, read_i32s, read_u8s};

    fn run(req: Value) -> (Value, Vec<u8>) {
        let mut blob = Blob::default();
        let out = call(req["op"].as_str().unwrap(), &req, &mut blob).expect("a molecule operation").expect("no error");
        let bytes = blob.finish(&out);
        let (doc, b) = parse_container(&bytes).unwrap();
        (doc, b.to_vec())
    }

    fn water() -> Value {
        let half = 104.52f64.to_radians() / 2.0;
        json!({ "atoms": ["O", "H", "H"], "xyz": [0.0, 0.0, 0.0, 0.9572 * half.sin(), 0.9572 * half.cos(), 0.0, -0.9572 * half.sin(), 0.9572 * half.cos(), 0.0], "bonds": [0, 1, 1, 0, 2, 1] })
    }

    #[test]
    fn measure_request() {
        let mut req = water();
        req["op"] = json!("molMeasure");
        req["pick"] = json!([1, 0, 2]);
        let (doc, blob) = run(req.clone());
        assert_eq!(doc["pick"]["kind"], "angle");
        assert!((doc["pick"]["angle"].as_f64().unwrap() - 104.52).abs() < 1e-12);
        let lengths = read_f64s(&blob, &doc["bonds"]["length"]).unwrap();
        assert!(lengths.iter().all(|l| (l - 0.9572).abs() < 1e-15));
        assert_eq!(read_i32s(&blob, &doc["angles"]["ijk"]).unwrap(), vec![1, 0, 2]);
        req["pick"] = json!([0, 1]);
        let (doc, _) = run(req.clone());
        assert!((doc["pick"]["distancePm"].as_f64().unwrap() - 95.72).abs() < 1e-12);
        req["pick"] = json!([0, 7]);
        let mut blob = Blob::default();
        assert!(call("molMeasure", &req, &mut blob).unwrap().is_err());
        assert!(call("somethingElse", &req, &mut blob).is_none());
    }

    #[test]
    fn shape_request() {
        let mut req = water();
        req["op"] = json!("molShape");
        let (doc, blob) = run(req.clone());
        assert_eq!((doc["geometry"].as_str(), doc["centres"][0]["class"].as_str(), doc["main"].as_u64()), (Some("bent"), Some("AX2E2"), Some(0)));
        assert_eq!(doc["centres"][0]["lobePoints"].as_array().unwrap().len(), 2);
        assert_eq!(doc["dipole"]["source"], "bonds");
        assert_eq!(read_f64s(&blob, &doc["radii"]["vdw"]).unwrap(), vec![1.52, 1.1, 1.1]);
        // With partial charges the dipole is Σ q r, and an override of the electronegativity reaches the bonds
        req["charges"] = json!([-0.8, 0.4, 0.4]);
        req["elements"] = json!({ "H": { "en": 3.44 } });
        let (doc, _) = run(req);
        let half = 104.52f64.to_radians() / 2.0;
        assert!((doc["dipole"]["magnitude"].as_f64().unwrap() - 0.8 * 0.9572 * half.cos() * shape::E_ANGSTROM_DEBYE).abs() < 1e-12);
        assert_eq!((doc["dipole"]["source"].as_str(), doc["bonds"][0]["kind"].as_str()), (Some("charges"), Some("nonpolar")));
    }

    #[test]
    fn crystal_request() {
        let (doc, blob) = run(json!({ "op": "crystalBuild", "structure": "rock-salt", "species": ["Na", "Cl"], "a": 5.640, "n": [2, 2, 2], "polyhedron": "auto" }));
        assert_eq!((doc["count"].as_u64(), doc["formulaUnits"].as_u64(), doc["radiusModel"].as_str()), (Some(125), Some(4), Some("ionic")));
        assert!((doc["density"].as_f64().unwrap() - 2.165).abs() < 2e-3);
        assert_eq!(read_f64s(&blob, &doc["xyz"]).unwrap().len(), 375);
        assert_eq!((doc["polyhedron"]["number"].as_u64(), doc["polyhedron"]["shape"].as_str(), doc["polyhedron"]["element"].as_str()), (Some(6), Some("octahedron"), Some("Na")));
        assert!(read_i32s(&blob, &doc["polyhedron"]["index"]).unwrap().iter().all(|i| *i >= 0));
        // The same cell from an explicit basis
        let basis = json!([["Na", 0, 0, 0], ["Na", 0.5, 0.5, 0], ["Na", 0.5, 0, 0.5], ["Na", 0, 0.5, 0.5], ["Cl", 0.5, 0.5, 0.5], ["Cl", 0, 0, 0.5], ["Cl", 0, 0.5, 0], ["Cl", 0.5, 0, 0]]);
        let (again, _) = run(json!({ "op": "crystalBuild", "structure": "rock-salt", "basis": basis, "a": 5.640 }));
        assert_eq!((again["count"].as_u64(), again["density"].as_f64()), (Some(27), doc["density"].as_f64()));
        // Elements: structure type and lattice constants only; an unknown type is reported as unmodelled
        let (cu, _) = run(json!({ "op": "crystalBuild", "structure": "fcc", "element": "Cu", "a": 3.615 }));
        assert_eq!((cu["count"].as_u64(), cu["sites"][0]["number"].as_u64()), (Some(14), Some(12)));
        assert!((cu["packing"].as_f64().unwrap() - 0.7405).abs() < 5e-5);
        let (mg, _) = run(json!({ "op": "crystalBuild", "structure": "hcp", "element": "Mg", "a": 3.209 }));
        assert!((mg["packing"].as_f64().unwrap() - 0.7405).abs() < 5e-5);
        let (odd, _) = run(json!({ "op": "crystalBuild", "structure": "alpha-manganese", "element": "Mn", "a": 8.9 }));
        assert_eq!((odd["ok"].as_bool(), odd["diagnostics"][0]["severity"].as_str()), (Some(false), Some("unmodelled")));
    }

    #[test]
    fn orbital_request() {
        let (doc, blob) = run(json!({ "op": "orbitalSample", "n": 3, "l": 2, "m": 0, "count": 500, "at": [0.0, 0.0, 2.0, 2.0, 0.0, 0.0] }));
        assert_eq!((doc["key"].as_str(), doc["subshell"].as_str(), doc["radialNodes"].as_u64(), doc["nodes"].as_u64()), (Some("dz2"), Some("3d"), Some(0), Some(2)));
        assert_eq!(read_f64s(&blob, &doc["xyz"]).unwrap().len(), 1500);
        assert_eq!(read_u8s(&blob, &doc["sign"]).unwrap().len(), 500);
        assert_eq!(read_f64s(&blob, &doc["radial"]["P"]).unwrap().len(), 257);
        // d_z²: positive along z, negative in the xy plane
        assert!(doc["psi"][0].as_f64().unwrap() > 0.0 && doc["psi"][1].as_f64().unwrap() < 0.0);
        let mut blob = Blob::default();
        assert!(call("orbitalSample", &json!({ "n": 2, "l": 2, "m": 0 }), &mut blob).unwrap().is_err());
    }
}
