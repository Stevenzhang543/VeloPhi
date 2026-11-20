//! Gas equilibrium against the reference program (26.64, D275): the cases of `tests/fixtures/chem/gas.json`,
//! computed by Cantera on the species and polynomials the core reads (`scripts/oracles/chem_gas.py`). Same data: a
//! difference is a difference of the solvers. The manual asks for adiabatic temperatures within 1 K; the limits
//! asserted here are the ones the two programs actually agree to (docs/chem/VALIDATION.md).

use serde_json::{json, Value};
use velophi_chem::api::calc;
use velophi_core::transport::Blob;

fn load(path: &str) -> Value {
    let text = std::fs::read_to_string(format!("{}/../../{}", env!("CARGO_MANIFEST_DIR"), path)).unwrap_or_else(|e| panic!("{path}: {e}"));
    serde_json::from_str(&text).expect("json")
}

/// One operation through the same entry the interface uses.
fn call(req: Value) -> Value {
    let op = req["op"].as_str().expect("op").to_string();
    match calc(&op, &req, &mut Blob::default()).expect("a chemistry operation") {
        Ok(v) => v,
        Err(e) => panic!("{op}: {}", e.key),
    }
}

fn setup() {
    let counts = call(json!({ "op": "gasSetData", "gas": load("src/chem/data/gas.json") }));
    assert!(counts["species"].as_u64().unwrap() >= 40);
}

#[test]
fn agrees_with_cantera() {
    setup();
    let doc = load("tests/fixtures/chem/gas.json");
    let cases = doc["cases"].as_array().expect("cases");
    assert!(cases.len() >= 40, "{} cases", cases.len());
    let (mut worst_t, mut worst_x, mut worst_h, mut worst_s) = ((0.0f64, String::new()), (0.0f64, String::new()), (0.0f64, String::new()), (0.0f64, String::new()));
    let mut failed = Vec::new();
    for c in cases {
        let id = c["id"].as_str().unwrap().to_string();
        let mut req = c["request"].clone();
        req["op"] = json!("gasEquilibrium");
        let got = call(req);
        if got["ok"] != json!(true) {
            failed.push(format!("{id}: {}", got["diagnostics"]));
            continue;
        }
        let e = &c["expect"];
        let f = |v: &Value| v.as_f64().unwrap();
        let dt = (f(&got["T"]) - f(&e["T"])).abs();
        if dt > worst_t.0 {
            worst_t = (dt, id.clone());
        }
        let dp = (f(&got["P_atm"]) / f(&e["P_atm"]) - 1.0).abs();
        let dn = (f(&got["n"]) / f(&e["n"]) - 1.0).abs();
        assert!(dp < 2e-6 && dn < 2e-6, "{id}: pressure {dp:e}, amount {dn:e}");
        let fractions: std::collections::BTreeMap<&str, f64> = got["species"].as_array().unwrap().iter().map(|s| (s["id"].as_str().unwrap(), f(&s["x"]))).collect();
        for (sid, x) in e["x"].as_object().unwrap() {
            let x = f(x);
            let mine = fractions.get(sid.as_str()).copied().unwrap_or(0.0);
            // Relative for what a reader sees (above a part per million); absolute below
            let d = if x > 1e-6 { (mine / x - 1.0).abs() } else { (mine - x).abs() / 1e-6 };
            if d > worst_x.0 {
                worst_x = (d, format!("{id} / {sid}: {mine:e} vs {x:e}"));
            }
        }
        // Enthalpy and entropy of the mixture, relative to R·T·n and R·n
        let scale = 8.314462618 * f(&e["n"]);
        let dh = (f(&got["H"]) - f(&e["H"])).abs() / (scale * f(&e["T"]));
        let ds = (f(&got["S"]) - f(&e["S"])).abs() / scale;
        if dh > worst_h.0 {
            worst_h = (dh, id.clone());
        }
        if ds > worst_s.0 {
            worst_s = (ds, id.clone());
        }
        // An adiabatic state keeps the enthalpy (or energy) of the reactants
        if c["mode"] == json!("HP") {
            let kept = (f(&got["H"]) - f(&got["initial"]["H"])).abs() / (scale * f(&e["T"]));
            assert!(kept < 1e-9, "{id}: enthalpy not kept, {kept:e}");
        }
        if c["mode"] == json!("UV") {
            let kept = (f(&got["U"]) - f(&got["initial"]["U"])).abs() / (scale * f(&e["T"]));
            assert!(kept < 1e-9, "{id}: energy not kept, {kept:e}");
        }
    }
    println!("worst: T {:.3e} K ({}), x {:.3e} ({}), H {:.3e} ({}), S {:.3e} ({})", worst_t.0, worst_t.1, worst_x.0, worst_x.1, worst_h.0, worst_h.1, worst_s.0, worst_s.1);
    assert!(failed.is_empty(), "{failed:#?}");
    assert!(worst_t.0 < 0.01, "temperature: {worst_t:?}");
    assert!(worst_x.0 < 1e-5, "composition: {worst_x:?}");
    assert!(worst_h.0 < 1e-6 && worst_s.0 < 1e-6, "H {worst_h:?}, S {worst_s:?}");
}

#[test]
fn reaction_quantities_agree_with_cantera() {
    setup();
    let doc = load("tests/fixtures/chem/gas.json");
    for r in doc["reactions"].as_array().unwrap() {
        let got = call(json!({ "op": "gasReaction", "species": r["species"], "T": r["T"] }));
        let id = r["id"].as_str().unwrap();
        assert_eq!(got["balanced"], json!(true), "{id}");
        for key in ["dH", "dS", "dG", "lnK"] {
            let (a, b) = (got[key].as_f64().unwrap(), r[key].as_f64().unwrap());
            assert!((a - b).abs() <= 1e-9 * b.abs().max(1.0), "{id} {key}: {a} vs {b}");
        }
    }
    // Textbook anchors, independent of the reference program: ΔH° of formation of water vapour and of the
    // combustion of methane at 298.15 K (CODATA: −241.83 kJ/mol; −802.3 kJ/mol to water vapour)
    let water = call(json!({ "op": "gasThermo", "ids": ["H2O(g)", "H2(g)", "CO2(g)"], "T": 298.15 }));
    let h = |i: usize| water["values"][i]["h"].as_f64().unwrap();
    assert!((h(0) + 241_826.0).abs() < 30.0, "{}", h(0));
    assert!(h(1).abs() < 1.0, "{}", h(1));
    assert!((h(2) + 393_510.0).abs() < 60.0, "{}", h(2));
    let burn = call(json!({ "op": "gasReaction", "species": { "CH4(g)": -1, "O2(g)": -2, "CO2(g)": 1, "H2O(g)": 2 }, "T": 298.15 }));
    assert!((burn["dH"].as_f64().unwrap() + 802_300.0).abs() < 400.0, "{}", burn["dH"]);
    let unbalanced = call(json!({ "op": "gasReaction", "species": { "H2(g)": -1, "O2(g)": -1, "H2O(g)": 1 }, "T": 298.15 }));
    assert_eq!(unbalanced["balanced"], json!(false));
}

#[test]
fn laws_and_limits() {
    setup();
    let eq = |req: Value| { let mut r = req; r["op"] = json!("gasEquilibrium"); call(r) };
    // Le Chatelier: more NO2 when hot, less under pressure; the amounts scale with the size of the system
    let share = |t: f64, p: f64, n: f64| {
        let r = eq(json!({ "amounts": { "N2O4(g)": n }, "T": t, "pressure_atm": p, "species": ["NO2(g)"] }));
        r["species"].as_array().unwrap().iter().find(|s| s["id"] == json!("NO2(g)")).map(|s| s["x"].as_f64().unwrap()).unwrap()
    };
    assert!(share(350.0, 1.0, 1.0) > share(300.0, 1.0, 1.0));
    assert!(share(300.0, 5.0, 1.0) < share(300.0, 1.0, 1.0));
    assert!((share(320.0, 1.0, 1.0) - share(320.0, 1.0, 1e-4)).abs() < 1e-12);
    // The equilibrium constant from the composition equals the one from the standard Gibbs energies
    let r = eq(json!({ "amounts": { "N2O4(g)": 1.0 }, "T": 320.0, "pressure_atm": 2.0, "species": ["NO2(g)"] }));
    let x = |id: &str| r["species"].as_array().unwrap().iter().find(|s| s["id"] == json!(id)).map(|s| s["x"].as_f64().unwrap()).unwrap();
    let p_over_p0 = 2.0 * 101325.0 / 1.0e5;
    let k = x("NO2(g)") * x("NO2(g)") / x("N2O4(g)") * p_over_p0;
    let reaction = call(json!({ "op": "gasReaction", "species": { "N2O4(g)": -1, "NO2(g)": 2 }, "T": 320.0 }));
    assert!((k.ln() - reaction["lnK"].as_f64().unwrap()).abs() < 1e-9, "{k}");
    // An inert gas alone, and elements that no candidate can hold
    let argon = eq(json!({ "amounts": { "Ar(g)": 2.0 }, "T": 500.0 }));
    assert_eq!(argon["ok"], json!(true));
    assert!((argon["V_L"].as_f64().unwrap() - 2.0 * 8.314462618 * 500.0 / 101325.0 * 1e3).abs() < 1e-9);
    // Diagnostics: cold combustion products would condense; a mixture that cannot cool to the range
    let cold = eq(json!({ "amounts": { "H2(g)": 2.0, "O2(g)": 1.0 }, "T": 320.0 }));
    assert!(cold["diagnostics"].as_array().unwrap().iter().any(|d| d["code"] == json!("gas.wouldCondense")), "{}", cold["diagnostics"]);
    let hot = eq(json!({ "amounts": { "H2(g)": 2.0, "O2(g)": 1.0 }, "T": 2000.0 }));
    assert!(hot["diagnostics"].as_array().unwrap().is_empty(), "{}", hot["diagnostics"]);
    // Determinism: the same request twice gives the same bytes
    let req = json!({ "op": "gasEquilibrium", "amounts": { "CH4(g)": 1.0, "O2(g)": 2.0, "N2(g)": 7.52 }, "T": 298.15, "adiabatic": true });
    assert_eq!(call(req.clone()).to_string(), call(req).to_string());
}
