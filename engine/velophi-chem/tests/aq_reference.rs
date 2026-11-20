//! Aqueous equilibrium against the reference program (26.64, D275): the cases of `tests/fixtures/chem/aq.json`,
//! computed by PHREEQC 3 on the database the core reads (`scripts/oracles/chem_aq.py`). Same constants, same activity
//! model: a difference is a difference of the implementation. Tolerances (docs/chem/VALIDATION.md): pH 0.005 by the
//! manual; the limits asserted here are the much tighter ones the two programs actually agree to.

use serde_json::Value;
use velophi_chem::db::{Database, Phase};
use velophi_chem::equil::{solve, totals_of, GasMode, GasSpec, Problem};

fn load(path: &str) -> Value {
    let text = std::fs::read_to_string(format!("{}/../../{}", env!("CARGO_MANIFEST_DIR"), path)).unwrap_or_else(|e| panic!("{path}: {e}"));
    serde_json::from_str(&text).expect("json")
}

#[test]
fn agrees_with_phreeqc() {
    let db = Database::from_aqueous(&load("src/chem/data/aqueous.json")).expect("database");
    let doc = load("tests/fixtures/chem/aq.json");
    let cases = doc["cases"].as_array().expect("cases");
    assert!(cases.len() >= 200, "{} cases", cases.len());
    let (mut worst_ph, mut worst_i, mut worst_m, mut worst_s, mut worst_g) = ((0.0f64, String::new()), (0.0f64, String::new()), (0.0f64, String::new()), (0.0f64, String::new()), (0.0f64, String::new()));
    let mut failed = Vec::new();
    let mut iterations = 0usize;
    for c in cases {
        let id = c["id"].as_str().unwrap().to_string();
        let t = c["T"].as_f64().unwrap();
        let amounts: Vec<(usize, f64)> = c["amounts"].as_object().unwrap().iter().map(|(k, v)| (db.find(k).unwrap_or_else(|| panic!("{id}: {k}")), v.as_f64().unwrap())).collect();
        let (totals, outside) = totals_of(&db, &amounts);
        assert!(outside.is_empty(), "{id}");
        let solids: Vec<usize> = c["solids"].as_array().unwrap().iter().map(|v| db.find(v.as_str().unwrap()).unwrap()).collect();
        let start: Vec<(usize, f64)> = amounts.iter().copied().filter(|a| db.species[a.0].phase == Phase::Solid).collect();
        let gas = c.get("gas").filter(|g| g.is_object()).map(|g| GasSpec { mode: GasMode::FixedVolume(g["volume_L"].as_f64().unwrap()), species: g["species"].as_array().unwrap().iter().map(|v| db.find(v.as_str().unwrap()).unwrap()).collect() });
        let s = match solve(&Problem { db: &db, t, totals: &totals, solids: &solids, gas, start: &start, guess: None }) {
            Ok(s) => s,
            Err(e) => {
                failed.push(format!("{id}: {e:?}"));
                continue;
            }
        };
        iterations += s.iterations;
        let e = &c["expect"];
        let note = |w: &mut (f64, String), d: f64| {
            if d > w.0 {
                *w = (d, id.clone());
            }
        };
        note(&mut worst_ph, (s.ph() - e["pH"].as_f64().unwrap()).abs());
        let ei = e["I"].as_f64().unwrap();
        note(&mut worst_i, (s.ionic_strength - ei).abs() / ei.max(1e-6));
        for (k, v) in e["species"].as_object().unwrap() {
            let want = v.as_f64().unwrap();
            let got = s.aqueous.iter().find(|x| db.species[x.0].id == *k).map(|x| x.1).unwrap_or(0.0);
            if want > 1e-12 {
                note(&mut worst_m, (got - want).abs() / want);
            }
        }
        for (k, v) in e["solids"].as_object().unwrap() {
            let want = v.as_f64().unwrap();
            let got = s.solids.iter().find(|x| db.species[x.0].id == *k).map(|x| x.1).unwrap_or(0.0);
            note(&mut worst_s, (got - want).abs() / want.abs().max(1e-4));
        }
        for (k, v) in e["gas"].as_object().unwrap() {
            let want = v.as_f64().unwrap();
            let got = s.gas.iter().find(|x| db.species[x.0].id == *k).map(|x| x.1).unwrap_or(0.0);
            note(&mut worst_g, (got - want).abs() / want.abs().max(1e-6));
        }
    }
    println!("cases {} failed {} mean iterations {:.1}", cases.len(), failed.len(), iterations as f64 / cases.len() as f64);
    println!("worst pH {:.3e} ({})", worst_ph.0, worst_ph.1);
    println!("worst I rel {:.3e} ({})", worst_i.0, worst_i.1);
    println!("worst molality rel {:.3e} ({})", worst_m.0, worst_m.1);
    println!("worst solid rel {:.3e} ({})", worst_s.0, worst_s.1);
    println!("worst gas rel {:.3e} ({})", worst_g.0, worst_g.1);
    assert!(failed.is_empty(), "not solved: {failed:#?}");
    assert!(worst_ph.0 < 1e-4, "pH {worst_ph:?}");
    assert!(worst_i.0 < 1e-4, "I {worst_i:?}");
    assert!(worst_m.0 < 1e-4, "molality {worst_m:?}");
    assert!(worst_s.0 < 1e-4, "solids {worst_s:?}");
    assert!(worst_g.0 < 2e-4, "gas {worst_g:?}");
}
