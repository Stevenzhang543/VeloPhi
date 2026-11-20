//! Aqueous equilibrium against PHREEQC on the same database (`tests/fixtures/chem/velophi.dat`): the first checks,
//! with values taken from the reference program by hand; the full set is `tests/fixtures/chem/aq.json`.

use serde_json::{json, Value};
use velophi_chem::db::Database;
use velophi_chem::equil::{solve, totals_of, GasMode, GasSpec, Problem};

fn database() -> Database {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../src/chem/data/aqueous.json")).expect("aqueous.json");
    let doc: Value = serde_json::from_str(&text).expect("json");
    Database::from_aqueous(&doc).expect("database")
}

fn ph_of(db: &Database, amounts: &[(&str, f64)]) -> f64 {
    let list: Vec<(usize, f64)> = amounts.iter().map(|(id, n)| (db.find(id).unwrap_or_else(|| panic!("{id}")), *n)).collect();
    let (totals, _) = totals_of(db, &list);
    let s = solve(&Problem { db, t: 298.15, totals: &totals, solids: &[], gas: None, start: &[], guess: None }).expect("converged");
    s.ph()
}

const KGW: f64 = 1.0 / 0.018015;

#[test]
fn simple_solutions_match_phreeqc() {
    let db = database();
    let _ = json!({});
    // PHREEQC 3 on velophi.dat, 25 °C, 1 kg water
    let cases: [(&[(&str, f64)], f64); 4] = [
        (&[("H2O", KGW), ("H+", 0.01), ("Cl-", 0.01)], 2.0405362179),
        (&[("H2O", KGW), ("Na+", 0.1), ("H+", 0.1), ("CO3-2", 0.1)], 8.0178002990),
        (&[("H2O", KGW), ("NH4+", 0.1), ("Cl-", 0.1)], 5.2369999725),
        (&[("H2O", KGW), ("Fe+3", 0.001), ("Cl-", 0.003)], 3.0110712899),
    ];
    for (amounts, expect) in cases {
        let ph = ph_of(&db, amounts);
        assert!((ph - expect).abs() < 2e-5, "pH {ph} expected {expect} for {amounts:?}");
    }
}

#[test]
fn pure_water_is_neutral_and_calcite_dissolves() {
    let db = database();
    let ph = ph_of(&db, &[("H2O", KGW)]);
    assert!((ph - 6.998).abs() < 0.01, "pure water pH {ph}");
    // Calcite in pure water, closed to the air: about 1.2e-4 mol/kg dissolves, pH near 9.9
    let calcite = db.find("Calcite").unwrap();
    let list = vec![(db.find("H2O").unwrap(), KGW), (calcite, 0.01)];
    let (totals, _) = totals_of(&db, &list);
    let s = solve(&Problem { db: &db, t: 298.15, totals: &totals, solids: &[calcite], gas: None, start: &[(calcite, 0.01)], guess: None }).expect("converged");
    let left = s.solids.iter().find(|x| x.0 == calcite).map(|x| x.1).unwrap_or(0.0);
    assert!((0.01 - left - 1.2e-4).abs() < 2e-5, "dissolved {}", 0.01 - left);
    assert!((s.ph() - 9.9).abs() < 0.1, "pH {}", s.ph());
    // With a head space of CO2 at fixed volume the gas takes part
    let co2 = db.find("CO2(g)").unwrap();
    let list = vec![(db.find("H2O").unwrap(), KGW), (calcite, 0.01), (co2, 0.01)];
    let (totals, _) = totals_of(&db, &list);
    let s = solve(&Problem { db: &db, t: 298.15, totals: &totals, solids: &[calcite], gas: Some(GasSpec { mode: GasMode::FixedVolume(1.0), species: vec![co2] }), start: &[(calcite, 0.01)], guess: None }).expect("converged");
    assert!(s.ph() < 7.5 && s.ph() > 5.5, "pH {}", s.ph());
}
