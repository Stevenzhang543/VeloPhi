//! Decay networks against the reference data of `scripts/oracles/nuclear.py` (tests/fixtures/chem/nuclear.json):
//! closed Bateman formulas and matrix exponentials in mpmath, and the package radioactivedecay in high precision.
//! Tolerances are relative and stated per case in the fixture (1e-11 … 1e-9 for the solution; a few percent where
//! two data evaluations are compared).

use serde_json::{json, Value};
use velophi_chem::api::calc_bytes;
use velophi_core::transport::{parse_container, read_f64s};

fn call(req: &Value) -> (Value, Vec<u8>) {
    let bytes = calc_bytes(req).unwrap_or_else(|m| panic!("{}: {:?}", req["op"], m));
    let (doc, blob) = parse_container(&bytes).expect("container");
    (doc, blob.to_vec())
}

fn load(path: &str) -> Value {
    let full = format!("{}/../../{}", env!("CARGO_MANIFEST_DIR"), path);
    serde_json::from_str(&std::fs::read_to_string(full).expect(path)).expect("json")
}

fn set_table() {
    call(&json!({ "op": "nuclideSetData", "data": load("src/chem/data/nuclides.json") }));
}

/// Amounts of a result as rows by nuclide.
fn rows(r: &(Value, Vec<u8>), key: &str) -> Vec<(String, Vec<f64>)> {
    let ids: Vec<String> = r.0["nuclides"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
    let all = read_f64s(&r.1, &r.0[key]).unwrap();
    let count = all.len() / ids.len();
    ids.into_iter().enumerate().map(|(i, id)| (id, all[i * count..(i + 1) * count].to_vec())).collect()
}

#[test]
fn reference_cases() {
    set_table();
    let fixture = load("tests/fixtures/chem/nuclear.json");
    let (mut count, mut worst, mut worst_data) = (0, 0.0f64, 0.0f64);
    let mut by_kind = std::collections::BTreeMap::new();
    for case in fixture["cases"].as_array().unwrap() {
        let (id, kind, tol) = (case["id"].as_str().unwrap(), case["kind"].as_str().unwrap(), case["tol"].as_f64().unwrap());
        let r = call(&case["request"]);
        let n = rows(&r, if kind == "activity" { "A" } else { "N" });
        let mut err = 0.0f64;
        if kind == "equilibrium" {
            let a = rows(&r, "A");
            let of = case["expect"]["of"].as_array().unwrap();
            let pick = |k: usize| a.iter().find(|x| x.0 == of[k].as_str().unwrap()).unwrap().1[0];
            err = (pick(0) / pick(1) / case["expect"]["ratio"].as_f64().unwrap() - 1.0).abs();
        } else {
            let floor = case["floor"].as_f64().unwrap_or(0.0);
            for (name, want) in case["expect"].as_object().unwrap() {
                let got = &n.iter().find(|x| &x.0 == name).unwrap_or_else(|| panic!("{id}: {name} missing")).1;
                let want: Vec<f64> = match want {
                    Value::Array(a) => a.iter().map(|x| x.as_f64().unwrap()).collect(),
                    x => vec![x.as_f64().unwrap()],
                };
                assert_eq!(got.len(), want.len(), "{id} {name}");
                for (g, w) in got.iter().zip(want.iter()) {
                    // amounts below `floor` of the inventory are beyond the precision of the reference itself
                    if w.abs() <= floor {
                        continue;
                    }
                    let e = (g / w - 1.0).abs();
                    assert!(e <= tol, "{id} {name}: {g} against {w} (relative {e:e}, tolerance {tol:e})");
                    err = err.max(e);
                }
            }
        }
        assert!(err <= tol, "{id}: relative deviation {err:e}, tolerance {tol:e}");
        if kind == "data" {
            worst_data = worst_data.max(err);
        } else {
            worst = worst.max(err);
        }
        *by_kind.entry(kind.to_string()).or_insert(0) += 1;
        count += 1;
    }
    println!("nuclear reference: {count} cases {by_kind:?}; worst deviation of the solution {worst:.2e}, of the data comparison {worst_data:.2e}");
    assert!(count >= 80);
}

#[test]
fn table_and_chains() {
    set_table();
    let info = call(&json!({ "op": "nuclideInfo", "ids": ["U-238", "Tc-99m", "K-40", "99Mo", "Xx-1"] })).0;
    assert_eq!(info["count"], 4171);
    assert_eq!(info["missing"], json!(["Xx-1"]));
    let n = info["nuclides"].as_array().unwrap();
    // U-238: 4.463 Gy, alpha to Th-234 with Q = 4.270 MeV
    assert!((n[0]["halfLife"].as_f64().unwrap() / (4.463e9 * 31556926.0) - 1.0).abs() < 1e-6);
    let alpha = n[0]["branches"].as_array().unwrap().iter().find(|b| b["mode"] == "A").unwrap();
    assert_eq!(alpha["to"], "Th-234");
    assert!((alpha["Q"].as_f64().unwrap() - 4269.9).abs() < 1.0, "{}", alpha["Q"]);
    // Tc-99m: isomeric transition, Q = the excitation energy 142.68 keV
    let it = n[1]["branches"].as_array().unwrap().iter().find(|b| b["mode"] == "IT").unwrap();
    assert!(it["to"] == "Tc-99" && (it["Q"].as_f64().unwrap() - 142.68).abs() < 1.0);
    // K-40: beta minus 89.28 %, beta plus and capture 10.72 %
    let k = n[2]["branches"].as_array().unwrap();
    assert!(k.iter().any(|b| b["to"] == "Ca-40" && (b["fraction"].as_f64().unwrap() - 0.8928).abs() < 1e-9));
    assert!(k.iter().any(|b| b["to"] == "Ar-40" && (b["fraction"].as_f64().unwrap() - 0.1072).abs() < 1e-9));
    // Mo-99 feeds the isomer with the sourced fraction
    let mo = n[3]["branches"].as_array().unwrap();
    assert!(mo.iter().any(|b| b["to"] == "Tc-99m" && (b["fraction"].as_f64().unwrap() - 0.8778).abs() < 1e-12));
    // binding energy per nucleon of Fe-56: 8790.3 keV
    let fe = call(&json!({ "op": "nuclideInfo", "ids": ["Fe-56"] })).0;
    assert!((fe["nuclides"][0]["bindingPerNucleon"].as_f64().unwrap() - 8790.3).abs() < 0.2);

    // the uranium series ends in Pb-206, the thorium series in Pb-208, the actinium series in Pb-207
    for (parent, end, members) in [("U-238", "Pb-206", 14), ("Th-232", "Pb-208", 11), ("U-235", "Pb-207", 12)] {
        let c = call(&json!({ "op": "nuclideChain", "parent": parent })).0;
        let list = c["nuclides"].as_array().unwrap();
        let stable: Vec<&str> = list.iter().filter(|m| m["stable"] == true).map(|m| m["id"].as_str().unwrap()).collect();
        // (side branches of a few parts per million may end elsewhere, such as Tl-205)
        assert!(stable.contains(&end), "{parent}: {stable:?}");
        assert!(list.len() >= members, "{parent}: {} members", list.len());
        // topological order: every decay leads to a later member
        for e in c["edges"].as_array().unwrap() {
            assert!(e["from"].as_u64() < e["to"].as_u64());
        }
    }
    // Th-234 to Pa-234: the isomer Pa-234m is in the table and no feeding is known: said, not guessed
    let c = call(&json!({ "op": "nuclideChain", "parent": "U-238" })).0;
    assert!(c["diagnostics"].as_array().unwrap().iter().any(|d| d["code"] == "nuclide.isomerFeeding" && d["params"]["isomer"] == "Pa-234m"));
    // and the request can supply it
    let c = call(&json!({ "op": "nuclideChain", "parent": "Th-234", "feeding": [{ "parent": "Th-234", "mode": "B-", "to": "Pa-234m", "fraction": 1.0 }] })).0;
    assert!(c["nuclides"].as_array().unwrap().iter().any(|m| m["id"] == "Pa-234m"));

    // conservation: nuclei of the members plus the untracked part stay constant
    let r = call(&json!({ "op": "nuclideDecay", "inventory": { "U-238": 1e20, "Th-232": 5e19 }, "grid": { "tEnd": 1.5e17, "samples": 41 }, "minBranch": 0 }));
    let n = rows(&r, "N");
    let untracked = read_f64s(&r.1, &r.0["untracked"]).unwrap();
    for (k, lost) in untracked.iter().enumerate() {
        let total: f64 = n.iter().map(|x| x.1[k]).sum::<f64>() + lost;
        assert!((total / 1.5e20 - 1.0).abs() < 1e-12, "sample {k}: {total}");
    }
    // mass: 1 g of Ra-226 has an activity of 3.66e10 Bq (the old curie, 3.7e10, to 1 %)
    let r = call(&json!({ "op": "nuclideDecay", "inventory": { "Ra-226": 1.0 }, "unit": "g", "times": [0.0] }));
    let a = rows(&r, "A");
    assert!((a[0].1[0] / 3.66e10 - 1.0).abs() < 5e-3, "{}", a[0].1[0]);
    // the chart: every nuclide once
    assert_eq!(call(&json!({ "op": "nuclideChart" })).0["count"], 4171);
}

#[test]
fn determinism_and_errors() {
    set_table();
    let req = json!({ "op": "nuclideDecay", "inventory": { "U-238": 1.0 }, "times": [1.0, 1e6, 1e12, 1e17] });
    assert_eq!(calc_bytes(&req).unwrap(), calc_bytes(&req).unwrap());
    assert!(calc_bytes(&json!({ "op": "nuclideDecay", "inventory": { "Xx-9": 1.0 }, "times": [1.0] })).is_err());
    assert!(calc_bytes(&json!({ "op": "nuclideDecay", "inventory": { "U-238": -1.0 }, "times": [1.0] })).is_err());
    // a cycle in a network of the request is refused
    let cyc = json!({ "op": "nuclideChain", "network": { "nuclides": [{ "id": "A", "halfLife": 1 }, { "id": "B", "halfLife": 1 }], "decays": [{ "from": "A", "to": "B" }, { "from": "B", "to": "A" }] } });
    assert!(calc_bytes(&cyc).is_err());
}
