//! The bench on the shipped catalogue (`src/chem/data/catalog.json`): classic mixtures behave as chemistry says.
//! Each test states the expectation it checks; several are regressions for defects found while writing the guided
//! experiments (26.64).

use serde_json::{json, Value};
use velophi_chem::session::{call, BenchSession};
use velophi_core::transport::Blob;

fn load(path: &str) -> Value {
    let text = std::fs::read_to_string(format!("{}/../../{}", env!("CARGO_MANIFEST_DIR"), path)).unwrap_or_else(|e| panic!("{path}: {e}"));
    serde_json::from_str(&text).expect("json")
}

fn setup() {
    let req = json!({ "op": "chemSetData", "aqueous": load("src/chem/data/aqueous.json"), "catalog": load("src/chem/data/catalog.json") });
    velophi_chem::ops::call("chemSetData", &req, &mut Blob::default()).expect("op").expect("data");
}

fn bench(objects: Value) -> BenchSession {
    BenchSession::create(&json!({ "bench": { "format": "velophi-bench", "version": 1, "objects": objects, "log": [] } })).expect("bench")
}

fn op(s: &mut BenchSession, req: Value) -> Value {
    call(s, &req, &mut Blob::default()).unwrap_or_else(|m| panic!("{req}: {} {:?}", m.key, m.params.iter().map(|p| p.0).collect::<Vec<_>>()))
}

fn act(s: &mut BenchSession, action: Value) -> Value {
    op(s, json!({ "op": "apply", "action": action }))
}

fn add(s: &mut BenchSession, to: &str, reagent: &str, value: f64, unit: &str) -> Value {
    act(s, json!({ "act": "add", "to": to, "reagent": reagent, "amount": { "value": value, "unit": unit } }))
}

fn read(s: &mut BenchSession, vessel: &str) -> Value {
    op(s, json!({ "op": "read", "vessel": vessel }))
}

fn f(v: &Value) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("not a number: {v}"))
}

fn solid(r: &Value, id: &str) -> f64 {
    r["solids"].as_array().unwrap().iter().filter(|s| s["id"] == id).map(|s| f(&s["n"])).sum()
}

#[test]
fn calcium_chloride_dissolves_warm_and_stays_dissolved() {
    setup();
    // Defect: the handbook table of calcium hydroxide (a solid of the network) precipitated it from calcium chloride
    // by taking hydroxide out of the water, leaving pH 0.3. Expected: a clear, nearly neutral solution that warms —
    // ΔH of solution of CaCl2 is −81 kJ/mol: 18 mmol into 50 g of water gives about +7 K.
    let mut s = bench(json!([{ "id": "a", "kind": "beaker", "capacity_mL": 250 }]));
    add(&mut s, "a", "water", 50.0, "mL");
    let t0 = f(&read(&mut s, "a")["T"]);
    add(&mut s, "a", "CaCl2_anhydrous", 2.0, "g");
    let r = read(&mut s, "a");
    assert!(r["solids"].as_array().unwrap().is_empty(), "{}", r["solids"]);
    assert!(f(&r["pH"]) > 6.0 && f(&r["pH"]) < 8.0, "pH {}", r["pH"]);
    let rise = f(&r["T"]) - t0;
    assert!(rise > 5.5 && rise < 8.5, "temperature rise {rise}");
    assert_eq!(solid(&r, "Portlandite"), 0.0);
}

#[test]
fn carbon_dioxide_leaving_takes_its_enthalpy_along() {
    setup();
    // Defect: gas that left an open vessel dropped out of the enthalpy balance, so every carbonate + acid cooled by
    // tens of kelvin. Expected signs and sizes: Na2CO3(s) + 2 HCl is exothermic (about −27 kJ/mol with the gas
    // leaving: a few kelvin up in 20 mL); NaHCO3(s) + acetic acid is endothermic (about +30 kJ/mol: several
    // kelvin down in 5 mL, as the classroom experiment shows).
    let run = |acid: &str, ml: f64, solid_reagent: &str, g: f64| {
        let mut s = bench(json!([{ "id": "a", "kind": "beaker", "capacity_mL": 250 }]));
        add(&mut s, "a", acid, ml, "mL");
        let t0 = f(&read(&mut s, "a")["T"]);
        add(&mut s, "a", solid_reagent, g, "g");
        let r = read(&mut s, "a");
        let gas: f64 = r["released"].as_array().unwrap().iter().filter(|x| x["id"] == "CO2(g)").map(|x| f(&x["n"])).sum();
        (f(&r["T"]) - t0, gas)
    };
    let (soda, gas) = run("HCl_1M", 20.0, "Na2CO3_solid", 1.0);
    assert!(soda > 1.0 && soda < 8.0, "sodium carbonate with acid: {soda} K");
    assert!(gas > 0.008 && gas < 0.0095, "carbon dioxide {gas}");
    let (baking, gas) = run("CH3COOH_1M", 5.0, "NaHCO3_solid", 0.5);
    assert!(baking < -3.0 && baking > -14.0, "baking soda with acetic acid: {baking} K");
    assert!(gas > 0.004 && gas < 0.006, "carbon dioxide {gas}");
    let (marble, _) = run("HCl_1M", 20.0, "CaCO3_powder", 1.0);
    assert!(marble > 0.0 && marble < 8.0, "marble powder with acid: {marble} K");
}

#[test]
fn a_mixture_already_in_the_jar_burns_when_ignited() {
    setup();
    // Defect: ignition acted only on gas added afterwards, and the flammability limits were compared with partial
    // pressures, so the rising pressure of the flame switched the reaction off half way.
    let mut s = bench(json!([{ "id": "j", "kind": "jar", "capacity_mL": 250, "closed": true }]));
    add(&mut s, "j", "H2_gas", 0.002, "mol");
    let before = read(&mut s, "j");
    let out = act(&mut s, json!({ "act": "ignite", "vessel": "j" }));
    let burn = out["events"].as_array().unwrap().iter().find(|e| e["code"] == "reaction" && e["params"]["id"] == "H2_burn").expect("the mixture burns");
    assert!((f(&burn["params"]["extent"]) - 0.001).abs() < 1e-9);
    let r = read(&mut s, "j");
    let n = |r: &Value, id: &str| r["gas"].as_array().unwrap().iter().filter(|x| x["id"] == id).map(|x| f(&x["n"])).sum::<f64>();
    assert_eq!(n(&r, "H2(g)"), 0.0);
    assert!((n(&r, "H2O(g)") - 0.002).abs() < 1e-12);
    assert!((n(&before, "O2(g)") - n(&r, "O2(g)") - 0.001).abs() < 1e-12);
    // 2 mmol × 241.8 kJ/mol into about 12 mmol of gas at constant volume: well above 1000 K
    assert!(f(&r["T"]) > 1200.0 && f(&r["T"]) < 2600.0, "T {}", r["T"]);
    // Below the lower limit (4 % hydrogen) nothing happens
    let mut s = bench(json!([{ "id": "j", "kind": "jar", "capacity_mL": 250, "closed": true }]));
    add(&mut s, "j", "H2_gas", 0.0002, "mol");
    let out = act(&mut s, json!({ "act": "ignite", "vessel": "j" }));
    assert!(out["events"].as_array().unwrap().iter().all(|e| e["code"] != "reaction"), "{}", out["events"]);
}

#[test]
fn the_dimer_of_nitrogen_dioxide_follows_the_bath() {
    setup();
    // Defect: the declared equilibrium 2 NO2 = N2O4 was not recomputed when a bath changed the temperature.
    // Expected: p(N2O4) / p(NO2)² equals K(T) of the catalogue entry (ln K = −21.1439 + 6879.58 / T) in both baths.
    let mut s = bench(json!([{ "id": "j", "kind": "jar", "capacity_mL": 250, "closed": true }]));
    add(&mut s, "j", "NO2_gas", 0.004, "mol");
    let mut shares = Vec::new();
    for t in [273.15, 353.15] {
        act(&mut s, json!({ "act": "bath", "vessel": "j", "T": t }));
        op(&mut s, json!({ "op": "advance", "seconds": 5.0 }));
        let r = read(&mut s, "j");
        let n = |id: &str| r["gas"].as_array().unwrap().iter().filter(|x| x["id"] == id).map(|x| f(&x["n"])).sum::<f64>();
        let rt_v = 0.082057366 * t / 0.25;
        let (p_mono, p_di) = (n("NO2(g)") * rt_v, n("N2O4(g)") * rt_v);
        let ln_q = (p_di / (p_mono * p_mono)).ln();
        let ln_k = -21.1439 + 6879.58 / t;
        assert!((ln_q - ln_k).abs() < 1e-3, "at {t} K: ln Q {ln_q}, ln K {ln_k}");
        shares.push(2.0 * n("N2O4(g)") / (n("NO2(g)") + 2.0 * n("N2O4(g)")));
        // Nitrogen is conserved
        assert!((n("NO2(g)") + 2.0 * n("N2O4(g)") - 0.004).abs() < 1e-9);
    }
    assert!(shares[0] > 0.6 && shares[1] < 0.15, "dimer share cold {} hot {}", shares[0], shares[1]);
}

#[test]
fn copper_in_dilute_nitric_acid_does_not_stall_the_clock() {
    setup();
    // Defect: the trace of nitrogen oxides set the step length, and one second of bench time took a minute.
    let mut s = bench(json!([{ "id": "e", "kind": "erlenmeyer", "capacity_mL": 250, "closed": true }]));
    add(&mut s, "e", "HNO3_2M", 30.0, "mL");
    add(&mut s, "e", "Cu_wire", 3.0, "g");
    let copper0 = solid(&read(&mut s, "e"), "Cu(s)");
    let started = std::time::Instant::now();
    for _ in 0..30 {
        op(&mut s, json!({ "op": "advance", "seconds": 2.0 }));
    }
    assert!(started.elapsed().as_secs_f64() < 20.0, "a minute of bench time took {:?}", started.elapsed());
    let r = read(&mut s, "e");
    assert!(solid(&r, "Cu(s)") < copper0, "copper dissolves");
    let blue = r["species"].as_array().unwrap().iter().filter(|x| x["id"] == "Cu+2").map(|x| f(&x["n"])).sum::<f64>();
    assert!(blue > 0.0);
}
fn released(r: &Value, id: &str) -> f64 {
    r["released"].as_array().unwrap().iter().filter(|x| x["id"] == id).map(|x| f(&x["n"])).sum()
}

/// Electrolyse 100 mL in a beaker for `seconds`; returns (reading, circuit).
fn electrolyse(liquid: &str, anode: &str, cathode: &str, volts: f64, seconds: f64) -> (Value, Value) {
    let mut s = bench(json!([{ "id": "c", "kind": "beaker", "capacity_mL": 250 }]));
    add(&mut s, "c", liquid, 100.0, "mL");
    act(&mut s, json!({ "act": "circuit", "id": "x", "a": { "vessel": "c", "electrode": anode }, "b": { "vessel": "c", "electrode": cathode }, "source": volts, "load": 1.0 }));
    op(&mut s, json!({ "op": "advance", "seconds": seconds }));
    let r = read(&mut s, "c");
    let circuit = op(&mut s, json!({ "op": "state" }))["circuits"][0].clone();
    (r, circuit)
}

const FARADAY: f64 = 96485.33212;

#[test]
fn electrolysis_gives_the_textbook_products() {
    setup();
    // Defect: with the full table of couples the anode chose hydrogen peroxide or chlorate (couples that need oxygen
    // transfer and do not run at an electrode), and copper(I) at the cathode. Expected, by Faraday's law from the
    // charge the circuit reports:
    // water (dilute sulfuric acid, sodium sulfate): H2 = Q/2F at the cathode, O2 = Q/4F at the anode, 2 : 1
    for (liquid, anode) in [("H2SO4_0.5M", "Pt(s)"), ("Na2SO4_0.1M", "Pt(s)"), ("H2SO4_0.5M", "C(s)")] {
        let (r, c) = electrolyse(liquid, anode, "Pt(s)", 6.0, 120.0);
        let q = f(&c["charge"]);
        assert!(q > 1.0, "{liquid}: charge {q}");
        assert!((released(&r, "H2(g)") / (q / (2.0 * FARADAY)) - 1.0).abs() < 1e-6, "{liquid}: hydrogen {}", released(&r, "H2(g)"));
        assert!((released(&r, "O2(g)") / (q / (4.0 * FARADAY)) - 1.0).abs() < 1e-6, "{liquid}: oxygen {}", released(&r, "O2(g)"));
        assert_eq!(released(&r, "Cl2(g)"), 0.0);
    }
    // saturated brine on graphite: chlorine at the anode, hydrogen at the iron cathode, 1 : 1, and the solution
    // turns alkaline (sodium hydroxide)
    let (r, c) = electrolyse("NaCl_sat", "C(s)", "Fe(s)", 6.0, 120.0);
    let q = f(&c["charge"]);
    assert_eq!(c["anodeCouple"], "Cl2/Cl-");
    assert!((released(&r, "H2(g)") / (q / (2.0 * FARADAY)) - 1.0).abs() < 1e-6);
    assert!((released(&r, "Cl2(g)") / (q / (2.0 * FARADAY)) - 1.0).abs() < 1e-6);
    assert_eq!(released(&r, "O2(g)"), 0.0);
    assert!(f(&r["pH"]) > 11.0, "pH {}", r["pH"]);
    // a dilute chloride (0.1 mol/L, below the rule's 0.5 mol/kg) gives mostly oxygen
    let (r, _) = electrolyse("NaCl_0.1M", "C(s)", "Fe(s)", 6.0, 120.0);
    assert!(released(&r, "O2(g)") > 2.0 * released(&r, "Cl2(g)"), "{}", r["released"]);
    // copper sulfate between graphite electrodes: copper on the cathode (Q/2F), oxygen at the anode, the solution
    // turns more acid; no copper(I) oxide
    for liquid in ["CuSO4_0.1M", "CuSO4_1M"] {
        let mut s = bench(json!([{ "id": "c", "kind": "beaker", "capacity_mL": 250 }]));
        add(&mut s, "c", liquid, 100.0, "mL");
        let before = read(&mut s, "c");
        assert!(before["solids"].as_array().unwrap().is_empty(), "{liquid} is a clear solution: {}", before["solids"]);
        act(&mut s, json!({ "act": "circuit", "id": "x", "a": { "vessel": "c", "electrode": "C(s)" }, "b": { "vessel": "c", "electrode": "C(s)" }, "source": 3.0, "load": 1.0 }));
        op(&mut s, json!({ "op": "advance", "seconds": 120.0 }));
        let r = read(&mut s, "c");
        let c = op(&mut s, json!({ "op": "state" }))["circuits"][0].clone();
        let q = f(&c["charge"]);
        let plated = c["b"]["deposit"].as_array().unwrap().iter().filter(|x| x["id"] == "Cu(s)").map(|x| f(&x["n"])).sum::<f64>();
        assert!((plated / (q / (2.0 * FARADAY)) - 1.0).abs() < 1e-6, "{liquid}: copper {plated} for {q} C");
        assert!((f(&c["b"]["massChange_g"]) - plated * 63.546).abs() < 1e-6);
        assert!(f(&r["pH"]) < f(&before["pH"]), "{liquid}: pH {} → {}", before["pH"], r["pH"]);
        assert!(r["solids"].as_array().unwrap().is_empty(), "{}", r["solids"]);
    }
    // refining: a copper anode loses what the cathode gains, and the solution does not change
    let (r, c) = electrolyse("CuSO4_0.1M", "Cu(s)", "C(s)", 1.0, 120.0);
    assert!(f(&c["a"]["massChange_g"]) < 0.0);
    assert!((f(&c["a"]["massChange_g"]) + f(&c["b"]["massChange_g"])).abs() < 1e-12);
    assert!(r["released"].as_array().unwrap().is_empty());
}

#[test]
fn sulfide_and_sulfite_wait_for_acid() {
    setup();
    // Defect: mixing sodium sulfide and sodium sulfite precipitated sulfur at pH 13. The comproportionation
    // 2 H2S + SO2 → 3 S + 2 H2O needs acid.
    let mut s = bench(json!([{ "id": "a", "kind": "beaker", "capacity_mL": 250 }]));
    add(&mut s, "a", "Na2S_0.1M", 10.0, "mL");
    add(&mut s, "a", "Na2SO3_0.1M", 10.0, "mL");
    let r = read(&mut s, "a");
    assert!(f(&r["pH"]) > 12.0);
    assert_eq!(solid(&r, "S(s)"), 0.0, "{}", r["solids"]);
    add(&mut s, "a", "HCl_1M", 10.0, "mL");
    let r = read(&mut s, "a");
    assert!(solid(&r, "S(s)") > 1.0e-3, "sulfur after acid: {}", r["solids"]);
}

#[test]
fn a_vessel_boiled_dry_does_not_stop_the_bench() {
    setup();
    // Defect: one vessel that could not be solved made `wait` fail for the whole bench.
    let mut s = bench(json!([{ "id": "dish", "kind": "evaporatingDish", "capacity_mL": 100 }, { "id": "b", "kind": "beaker", "capacity_mL": 250 }]));
    add(&mut s, "dish", "NaCl_0.1M", 2.0, "mL");
    add(&mut s, "b", "HCl_1M", 50.0, "mL");
    add(&mut s, "b", "Zn_granule", 2.0, "g");
    act(&mut s, json!({ "act": "heat", "vessel": "dish", "power": 200.0 }));
    let mut stalled = false;
    let started = std::time::Instant::now();
    for _ in 0..12 {
        let out = op(&mut s, json!({ "op": "advance", "seconds": 5.0 }));
        stalled |= out["events"].as_array().unwrap().iter().any(|e| (e["code"] == "stalled" || e["code"] == "nearlyDry") && e["vessel"] == "dish");
    }
    // 200 W for 60 s is more than twice what 2 g of water needs: the dish is dry or has stalled, and either way the
    // zinc in the other beaker went on reacting
    assert!(started.elapsed().as_secs_f64() < 12.0, "a minute of boiling took {:?}", started.elapsed());
    let dish = read(&mut s, "dish");
    assert!(stalled || f(&dish["volume_mL"]) < 0.2, "dish: {} mL", dish["volume_mL"]);
    assert!(released(&read(&mut s, "b"), "H2(g)") > 1e-4);
}

#[test]
fn reactions_fed_by_a_precipitate_or_running_out_go_to_the_end() {
    setup();
    // Iron(II) hydroxide in air turns red-brown: the oxidation takes dissolved iron(II), which the precipitate
    // resupplies. (Regression: with the step no longer set by trace amounts, only the dissolved 10⁻⁷ mol reacted.)
    let mut s = bench(json!([{ "id": "t", "kind": "testTube", "capacity_mL": 25 }]));
    add(&mut s, "t", "FeSO4_0.1M", 3.0, "mL");
    add(&mut s, "t", "NaOH_1M", 1.0, "mL");
    for _ in 0..24 {
        op(&mut s, json!({ "op": "advance", "seconds": 30.0 }));
    }
    let r = read(&mut s, "t");
    let ferric: f64 = r["solids"].as_array().unwrap().iter().filter(|x| x["id"].as_str().unwrap().starts_with("Fe(OH)3") || x["id"] == "Goethite" || x["id"] == "Ferrihydrite").map(|x| f(&x["n"])).sum();
    assert!(ferric > 1.5e-4, "iron(III) after twelve minutes in air: {}", r["solids"]);
    // Permanganate in acidified ethanol is used up, not left at 4·10⁻⁷ mol
    let mut s = bench(json!([{ "id": "t", "kind": "testTube", "capacity_mL": 25 }]));
    add(&mut s, "t", "ethanol", 2.0, "mL");
    add(&mut s, "t", "H2SO4_1M", 1.0, "mL");
    add(&mut s, "t", "KMnO4_0.01M", 1.0, "mL");
    for _ in 0..16 {
        op(&mut s, json!({ "op": "advance", "seconds": 30.0 }));
    }
    let r = read(&mut s, "t");
    let left: f64 = r["species"].as_array().unwrap().iter().filter(|x| x["id"] == "MnO4-").map(|x| f(&x["n"])).sum();
    assert!(left < 1e-9, "permanganate left {left}");
    // Copper reacts with nitric acid of every strength between dilute and concentrated
    let mut s = bench(json!([{ "id": "b", "kind": "beaker", "capacity_mL": 100 }]));
    add(&mut s, "b", "HNO3_6M", 20.0, "mL");
    add(&mut s, "b", "Cu_wire", 3.0, "g");
    let copper0 = solid(&read(&mut s, "b"), "Cu(s)");
    op(&mut s, json!({ "op": "advance", "seconds": 60.0 }));
    assert!(solid(&read(&mut s, "b"), "Cu(s)") < copper0 - 1e-6);
}

#[test]
fn electrolysis_gas_is_collected_from_a_stoppered_flask() {
    setup();
    // Regression: in a stoppered vessel the cathode reduced the oxygen of the enclosed air and no hydrogen formed.
    let mut s = bench(json!([{ "id": "cell", "kind": "erlenmeyer", "capacity_mL": 250 }, { "id": "jar", "kind": "jar", "capacity_mL": 250, "collect": "water" }]));
    add(&mut s, "cell", "Na2SO4_0.1M", 200.0, "mL");
    act(&mut s, json!({ "act": "stopper", "vessel": "cell" }));
    act(&mut s, json!({ "act": "connect", "from": "cell", "to": "jar" }));
    act(&mut s, json!({ "act": "circuit", "id": "x", "a": { "vessel": "cell", "electrode": "C(s)" }, "b": { "vessel": "cell", "electrode": "C(s)" }, "source": 12.0, "load": 1.0 }));
    for _ in 0..20 {
        op(&mut s, json!({ "op": "advance", "seconds": 30.0 }));
    }
    let c = op(&mut s, json!({ "op": "state" }))["circuits"][0].clone();
    assert_eq!(c["cathodeCouple"], "H2O/H2");
    let jar = read(&mut s, "jar");
    let n = |id: &str| jar["gas"].as_array().unwrap().iter().filter(|x| x["id"] == id).map(|x| f(&x["n"])).sum::<f64>();
    // 600 s at about 0.13 A: 0.42 mmol of hydrogen and half as much oxygen were made (Faraday); what left the 50 mL
    // head space is a mixture with the air that was in it, so the jar holds part of the hydrogen and no more gas in
    // all than was made
    let q = f(&c["charge"]);
    let cell = read(&mut s, "cell");
    let in_cell = cell["gas"].as_array().unwrap().iter().filter(|x| x["id"] == "H2(g)").map(|x| f(&x["n"])).sum::<f64>();
    // (a few per cent of the hydrogen stay dissolved in the 200 mL of solution)
    let share = (n("H2(g)") + in_cell) / (q / (2.0 * 96485.33212));
    assert!(share > 0.9 && share <= 1.0 + 1e-9, "hydrogen {} + {} for {q} C", n("H2(g)"), in_cell);
    assert!(n("H2(g)") > 2e-5, "hydrogen in the jar: {}", jar["gas"]);
    let total: f64 = jar["gas"].as_array().unwrap().iter().map(|x| f(&x["n"])).sum();
    assert!(total < 1.05 * 1.5 * q / (2.0 * 96485.33212), "the jar holds {total} mol for {q} C");
    // Stoppering a jar that holds collected gas does not add a jarful of air on top (regression)
    let mut s = bench(json!([{ "id": "j", "kind": "jar", "capacity_mL": 250, "collect": "water" }]));
    add(&mut s, "j", "O2_gas", 240.0, "mL");
    act(&mut s, json!({ "act": "stopper", "vessel": "j" }));
    let r = read(&mut s, "j");
    assert!((f(&r["P"]) - 101325.0).abs() < 1500.0, "pressure after stoppering {}", r["P"]);
}
