//! Conservation (26.64, D275): random sequences of bench actions. Pouring, waiting, heating and stoppering move and
//! transform matter but never make or lose it: after every such step the amount of each element over all vessels
//! (solution, water, solids, liquids, gas held, gas released) is what it was, and every solution is electrically
//! neutral. The limit asserted is 10⁻¹⁰ relative, not the 10⁻¹² of the manual: the amounts are read from the species
//! of the last equilibrium, which meets the stored component totals (those are exact) to the solver's convergence —
//! about 6·10⁻¹² for elements and 4·10⁻¹¹ for charge on these sequences (docs/chem/VALIDATION.md). Adding a reagent changes the totals, so the reference is taken again after each addition.

use std::collections::BTreeMap;

use serde_json::{json, Value};
use velophi_chem::session::{call, BenchSession};
use velophi_core::transport::Blob;

fn load(path: &str) -> Value {
    let text = std::fs::read_to_string(format!("{}/../../{}", env!("CARGO_MANIFEST_DIR"), path)).unwrap_or_else(|e| panic!("{path}: {e}"));
    serde_json::from_str(&text).expect("json")
}

fn op(s: &mut BenchSession, req: Value) -> Value {
    call(s, &req, &mut Blob::default()).unwrap_or_else(|m| panic!("{req}: {m:?}"))
}

fn f(v: &Value) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("not a number: {v}"))
}

/// A small deterministic generator (numerical recipes LCG): the sequences are the same on every run.
struct Dice(u64);
impl Dice {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0 >> 33
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
    fn unit(&mut self) -> f64 {
        self.next() as f64 / (1u64 << 31) as f64
    }
}

const VESSELS: [&str; 3] = ["a", "b", "c"];

/// Element totals (mol of atoms) over the whole bench, and the largest net charge of a solution relative to its ions.
fn totals(s: &mut BenchSession, comp: &mut BTreeMap<String, BTreeMap<String, f64>>) -> (BTreeMap<String, f64>, f64) {
    let mut out: BTreeMap<String, f64> = BTreeMap::new();
    let mut worst_charge = 0.0f64;
    for v in VESSELS {
        let r = op(s, json!({ "op": "read", "vessel": v }));
        let mut amounts: Vec<(String, f64)> = Vec::new();
        let (mut charge, mut ions) = (0.0, 0.0);
        for sp in r["species"].as_array().cloned().unwrap_or_default() {
            let id = sp["id"].as_str().unwrap().to_string();
            charge += f(&sp["z"]) * f(&sp["n"]);
            ions += f(&sp["z"]).abs() * f(&sp["n"]);
            if id != "H2O" {
                amounts.push((id, f(&sp["n"])));
            }
        }
        if ions > 0.0 {
            worst_charge = worst_charge.max(charge.abs() / ions);
        }
        if let Some(w) = r.get("water_mol") {
            amounts.push(("H2O".to_string(), f(w)));
        }
        for key in ["solids", "liquids", "gas", "released", "solutes"] {
            for sp in r[key].as_array().cloned().unwrap_or_default() {
                amounts.push((sp["id"].as_str().unwrap().to_string(), f(&sp["n"])));
            }
        }
        for (id, n) in amounts {
            if !comp.contains_key(&id) {
                let info = velophi_chem::ops::call("chemSpecies", &json!({ "op": "chemSpecies", "ids": [id] }), &mut Blob::default()).expect("op").expect("species");
                let c = info["species"][0]["comp"].as_object().unwrap_or_else(|| panic!("{id}: no composition")).iter().map(|(k, v)| (k.clone(), f(v))).collect();
                comp.insert(id.clone(), c);
            }
            for (el, k) in &comp[&id] {
                *out.entry(el.clone()).or_insert(0.0) += k * n;
            }
        }
    }
    (out, worst_charge)
}

#[test]
fn elements_and_charge_are_conserved_over_random_sequences() {
    let req = json!({ "op": "chemSetData", "aqueous": load("src/chem/data/aqueous.json"), "catalog": load("tests/fixtures/chem/catalog-mini.json") });
    velophi_chem::ops::call("chemSetData", &req, &mut Blob::default()).expect("op").expect("data");
    let solutions = ["water", "HCl_0.1M", "HCl_1M", "NaOH_0.1M", "HAc_0.1M", "AgNO3_0.1M", "NaCl_0.1M", "CuSO4_1M", "ZnSO4_1M", "H2SO4_0.5M", "H2O2_0.1M"];
    let solids = ["Zn_granule", "CaCO3_chip", "CaCO3_powder", "KNO3_solid", "NaOH_solid"];
    let mut comp = BTreeMap::new();
    let (mut worst, mut worst_at, mut worst_charge, mut checked) = (0.0f64, String::new(), 0.0f64, 0usize);
    for seed in 1..=12u64 {
        let mut dice = Dice(seed.wrapping_mul(0x9E3779B97F4A7C15));
        let mut s = BenchSession::create(&json!({ "bench": { "format": "velophi-bench", "version": 1, "objects": [
            { "id": "a", "kind": "beaker", "capacity_mL": 400 }, { "id": "b", "kind": "erlenmeyer", "capacity_mL": 250 }, { "id": "c", "kind": "flask", "capacity_mL": 500, "closed": true }
        ], "log": [] } })).expect("bench");
        // Something in every vessel first
        for v in VESSELS {
            op(&mut s, json!({ "op": "apply", "action": { "act": "add", "to": v, "reagent": "water", "amount": { "value": 30.0, "unit": "mL" } } }));
        }
        let mut reference = totals(&mut s, &mut comp).0;
        for step in 0..40 {
            let v = VESSELS[dice.below(3) as usize];
            let kind = dice.below(10);
            let action = match kind {
                0..=2 => json!({ "act": "add", "to": v, "reagent": solutions[dice.below(solutions.len() as u64) as usize], "amount": { "value": 1.0 + 9.0 * dice.unit(), "unit": "mL" } }),
                3 => json!({ "act": "add", "to": v, "reagent": solids[dice.below(solids.len() as u64) as usize], "amount": { "value": 0.05 + 0.5 * dice.unit(), "unit": "g" } }),
                4..=5 => {
                    let to = VESSELS[((VESSELS.iter().position(|x| *x == v).unwrap() as u64 + 1 + dice.below(2)) % 3) as usize];
                    json!({ "act": "pour", "from": v, "to": to, "amount": { "value": 0.1 + 0.5 * dice.unit(), "unit": "fraction" } })
                }
                6 => json!({ "act": "heat", "vessel": v, "power": if dice.below(2) == 0 { 0.0 } else { 20.0 + 80.0 * dice.unit() } }),
                _ => json!({ "act": "wait", "seconds": 1.0 + 30.0 * dice.unit() }),
            };
            let label = format!("seed {seed} step {step}: {action}");
            // An action the bench refuses (a full vessel) changes nothing: that is conservation too
            let _ = call(&mut s, &json!({ "op": "apply", "action": action }), &mut Blob::default());
            let (now, charge) = totals(&mut s, &mut comp);
            worst_charge = worst_charge.max(charge);
            if kind <= 3 {
                reference = now;
                continue;
            }
            checked += 1;
            for (el, n) in &reference {
                let got = now.get(el).copied().unwrap_or(0.0);
                let scale = n.abs().max(1e-6);
                let d = (got - n).abs() / scale;
                if d > worst {
                    worst = d;
                    worst_at = format!("{label}: {el} {n} → {got}");
                }
            }
            reference = now;
        }
    }
    println!("conservation over {checked} steps: worst element {worst:.3e} ({worst_at}), worst charge {worst_charge:.3e}");
    assert!(checked > 150);
    assert!(worst < 1e-10, "{worst:e} at {worst_at}");
    assert!(worst_charge < 1e-10, "charge {worst_charge:e}");
}
