//! The bench core on a small catalogue (`tests/fixtures/chem/catalog-mini.json`): actions, equilibrium, heat, rates,
//! conservation, undo and the replay of a document. Closed-form expectations are stated at each check.

use serde_json::{json, Value};
use velophi_chem::session::{call, BenchSession};
use velophi_core::transport::Blob;

fn load(path: &str) -> Value {
    let text = std::fs::read_to_string(format!("{}/../../{}", env!("CARGO_MANIFEST_DIR"), path)).unwrap_or_else(|e| panic!("{path}: {e}"));
    serde_json::from_str(&text).expect("json")
}

fn setup() {
    let req = json!({ "op": "chemSetData", "aqueous": load("src/chem/data/aqueous.json"), "catalog": load("tests/fixtures/chem/catalog-mini.json") });
    let out = velophi_chem::ops::call("chemSetData", &req, &mut Blob::default()).expect("op").expect("data");
    assert_eq!(out["diagnostics"].as_array().map(|a| a.len()), Some(0), "{}", out["diagnostics"]);
    assert_eq!(out["reagents"], 19);
}

fn bench(objects: Value) -> BenchSession {
    BenchSession::create(&json!({ "bench": { "format": "velophi-bench", "version": 1, "objects": objects, "log": [] } })).expect("bench")
}

fn op(s: &mut BenchSession, req: Value) -> Value {
    call(s, &req, &mut Blob::default()).unwrap_or_else(|m| panic!("{req}: {m:?}"))
}

fn add(s: &mut BenchSession, to: &str, reagent: &str, value: f64, unit: &str) -> Value {
    op(s, json!({ "op": "apply", "action": { "act": "add", "to": to, "reagent": reagent, "amount": { "value": value, "unit": unit } } }))
}

fn read(s: &mut BenchSession, vessel: &str) -> Value {
    op(s, json!({ "op": "read", "vessel": vessel }))
}

fn f(v: &Value) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("not a number: {v}"))
}

#[test]
fn titration_passes_through_neutral_and_warms_by_the_heat_of_neutralisation() {
    setup();
    let mut s = bench(json!([{ "id": "flask", "kind": "erlenmeyer", "capacity_mL": 250 }]));
    add(&mut s, "flask", "HCl_0.1M", 20.0, "mL");
    let acid = read(&mut s, "flask");
    // 0.1 mol/kg HCl: pH = −log10(γ·m) with γ ≈ 0.80 → about 1.10
    assert!((f(&acid["pH"]) - 1.10).abs() < 0.02, "pH {}", acid["pH"]);
    assert!((f(&acid["volume_mL"]) - 20.0).abs() < 1e-9);
    let t0 = f(&acid["T"]);
    add(&mut s, "flask", "NaOH_0.1M", 19.0, "mL");
    assert!(f(&read(&mut s, "flask")["pH"]) < 3.0);
    add(&mut s, "flask", "NaOH_0.1M", 1.0, "mL");
    let neutral = read(&mut s, "flask");
    assert!((f(&neutral["pH"]) - 7.0).abs() < 0.05, "pH at the equivalence point {}", neutral["pH"]);
    // 2.00 mmol neutralised × 55.8 kJ/mol into 40.0 g of water (75.3 J/(mol·K)): ΔT = 111.6 J / 167.2 J/K = 0.667 K
    let rise = f(&neutral["T"]) - t0;
    assert!((rise - 0.667).abs() < 0.02, "temperature rise {rise}");
    add(&mut s, "flask", "NaOH_0.1M", 1.0, "mL");
    assert!(f(&read(&mut s, "flask")["pH"]) > 10.5);
}

#[test]
fn silver_chloride_precipitates_and_the_log_replays_to_the_same_state() {
    setup();
    let mut s = bench(json!([{ "id": "tube", "kind": "testTube", "capacity_mL": 25 }]));
    add(&mut s, "tube", "NaCl_0.1M", 5.0, "mL");
    let out = add(&mut s, "tube", "AgNO3_0.1M", 3.0, "mL");
    let events = out["events"].as_array().unwrap();
    let precipitate = events.iter().find(|e| e["code"] == "precipitate").expect("a precipitate event");
    assert_eq!(precipitate["params"]["species"], "Cerargyrite");
    // 0.3 mmol of silver meets 0.5 mmol of chloride: all but a trace of the silver precipitates
    assert!((f(&precipitate["params"]["n"]) - 3.0e-4).abs() < 2e-6, "{}", precipitate["params"]["n"]);
    let hash = op(&mut s, json!({ "op": "hash" }))["hash"].clone();
    // Undo and redo
    op(&mut s, json!({ "op": "undo" }));
    assert!(read(&mut s, "tube")["solids"].as_array().unwrap().is_empty());
    op(&mut s, json!({ "op": "redo" }));
    assert_eq!(op(&mut s, json!({ "op": "hash" }))["hash"], hash);
    // The document replays to the same fingerprint
    let doc = op(&mut s, json!({ "op": "document" }))["bench"].clone();
    assert_eq!(doc["log"].as_array().unwrap().len(), 2);
    let mut again = BenchSession::create(&json!({ "bench": doc })).expect("replay");
    assert_eq!(op(&mut again, json!({ "op": "hash" }))["hash"], hash);
}

#[test]
fn zinc_dissolves_in_acid_at_its_rate_and_hydrogen_leaves() {
    setup();
    let mut s = bench(json!([{ "id": "flask", "kind": "erlenmeyer", "capacity_mL": 250 }]));
    add(&mut s, "flask", "HCl_1M", 50.0, "mL");
    add(&mut s, "flask", "Zn_granule", 2.0, "g");
    let zinc0 = 2.0 / 65.38;
    let mut released = 0.0;
    let mut last_ph = 0.0;
    for _ in 0..30 {
        op(&mut s, json!({ "op": "advance", "seconds": 10.0 }));
        let r = read(&mut s, "flask");
        released = r["released"].as_array().unwrap().iter().filter(|g| g["id"] == "H2(g)").map(|g| f(&g["n"])).sum();
        assert!(f(&r["pH"]) >= last_ph - 1e-9, "the acid is used up monotonically");
        last_ph = f(&r["pH"]);
    }
    let r = read(&mut s, "flask");
    let zinc_left: f64 = r["solids"].as_array().unwrap().iter().filter(|x| x["id"] == "Zn(s)").map(|x| f(&x["n"])).sum();
    let zinc_ion: f64 = r["species"].as_array().unwrap().iter().filter(|x| x["id"].as_str().unwrap().starts_with("Zn")).map(|x| f(&x["n"])).sum();
    assert!(zinc_left < zinc0 && zinc_left > 0.0, "zinc left {zinc_left}");
    // Zinc is conserved, and every mole dissolved gave a mole of hydrogen (the little that stays dissolved aside)
    assert!((zinc_left + zinc_ion - zinc0).abs() < 1e-9, "zinc balance {}", zinc_left + zinc_ion - zinc0);
    assert!((released - (zinc0 - zinc_left)).abs() < 2e-4, "hydrogen {released} for {} of zinc", zinc0 - zinc_left);
    // One log entry for the thirty equal waits
    let doc = op(&mut s, json!({ "op": "document" }))["bench"].clone();
    assert_eq!(doc["log"].as_array().unwrap().len(), 3);
    assert_eq!(doc["log"][2]["times"], 30.0);
    let hash = op(&mut s, json!({ "op": "hash" }))["hash"].clone();
    let mut again = BenchSession::create(&json!({ "bench": doc })).expect("replay");
    assert_eq!(op(&mut again, json!({ "op": "hash" }))["hash"], hash);
}

#[test]
fn marble_chips_fizz_and_powder_reacts_at_once() {
    setup();
    let mut s = bench(json!([{ "id": "a", "kind": "beaker", "capacity_mL": 250 }, { "id": "b", "kind": "beaker", "capacity_mL": 250 }]));
    for id in ["a", "b"] {
        add(&mut s, id, "HCl_1M", 50.0, "mL");
    }
    let out = add(&mut s, "a", "CaCO3_powder", 1.0, "g");
    // Powder: 10 mmol of carbonate meet 50 mmol of acid; about 2 mmol of carbon dioxide stay dissolved in the 50 mL
    // (0.033 mol/(kg·atm) at just under one atmosphere, plus the acid's salting effect), the rest leaves at once
    let gas: f64 = out["events"].as_array().unwrap().iter().filter(|e| e["code"] == "gas" && e["params"]["species"] == "CO2(g)").map(|e| f(&e["params"]["n"])).sum();
    assert!(gas > 0.0074 && gas < 0.0088, "carbon dioxide from the powder {gas}");
    // Chips: nothing at the moment they go in, then at a rate
    let out = add(&mut s, "b", "CaCO3_chip", 1.0, "g");
    assert!(out["events"].as_array().unwrap().iter().all(|e| e["code"] != "gas"));
    // The solution first has to saturate with carbon dioxide (about 1.6 mmol in 50 mL); after a minute it fizzes
    op(&mut s, json!({ "op": "advance", "seconds": 60.0 }));
    let early: f64 = read(&mut s, "b")["released"].as_array().unwrap().iter().map(|g| f(&g["n"])).sum();
    op(&mut s, json!({ "op": "advance", "seconds": 600.0 }));
    let late: f64 = read(&mut s, "b")["released"].as_array().unwrap().iter().map(|g| f(&g["n"])).sum();
    assert!(early > 0.0 && late > early, "carbon dioxide from the chips: {early} then {late}");
}

#[test]
fn water_boils_at_the_boiling_point_and_the_energy_balances() {
    setup();
    let mut s = bench(json!([{ "id": "beaker", "kind": "beaker", "capacity_mL": 250 }]));
    add(&mut s, "beaker", "water", 100.0, "g");
    op(&mut s, json!({ "op": "apply", "action": { "act": "heat", "vessel": "beaker", "power": 500.0 } }));
    // 100 g from 25 °C to 100 °C needs 5.551 mol × 75.3 J/(mol·K) × 75 K = 31.35 kJ: 62.7 s at 500 W
    op(&mut s, json!({ "op": "advance", "seconds": 60.0 }));
    let warm = read(&mut s, "beaker");
    assert!((f(&warm["T"]) - (298.15 + 60.0 * 500.0 / (5.5509 * 75.3))).abs() < 0.05, "T {}", warm["T"]);
    op(&mut s, json!({ "op": "advance", "seconds": 60.0 }));
    let boiling = read(&mut s, "beaker");
    assert!((f(&boiling["T"]) - 373.124).abs() < 0.02, "boiling point {}", boiling["T"]);
    // The 57.3 s beyond the boiling point evaporate 28.65 kJ / 40.7 kJ/mol ≈ 0.70 mol ≈ 12.7 g
    let lost = 100.0 - f(&boiling["mass_g"]);
    assert!((lost - 12.7).abs() < 0.6, "water boiled away {lost} g");
}

#[test]
fn fixed_log_replays_to_the_recorded_fingerprint() {
    setup();
    let path = format!("{}/../../tests/fixtures/chem/bench-hash.json", env!("CARGO_MANIFEST_DIR"));
    let mut fixture = load("tests/fixtures/chem/bench-hash.json");
    let mut s = BenchSession::create(&json!({ "bench": fixture["bench"] })).expect("replay");
    let hash = op(&mut s, json!({ "op": "hash" }))["hash"].as_str().unwrap().to_string();
    let ph = f(&read(&mut s, "flask")["pH"]);
    if std::env::var("VELOPHI_UPDATE_FIXTURES").is_ok() {
        fixture["hash"] = json!(hash);
        fixture["pH"] = json!(ph);
        std::fs::write(&path, serde_json::to_string_pretty(&fixture).unwrap() + "\n").expect("write");
        return;
    }
    assert_eq!(fixture["hash"], hash);
    assert_eq!(f(&fixture["pH"]).to_bits(), ph.to_bits());
}

#[test]
fn potassium_nitrate_follows_its_solubility_curve_and_sodium_hydroxide_warms_the_water() {
    setup();
    let mut s = bench(json!([{ "id": "a", "kind": "beaker", "capacity_mL": 250 }, { "id": "b", "kind": "beaker", "capacity_mL": 250 }]));
    add(&mut s, "a", "water", 100.0, "g");
    add(&mut s, "a", "KNO3_solid", 50.0, "g");
    let r = read(&mut s, "a");
    // The dissolution is endothermic (34.89 kJ/mol): the water cools, and what dissolved is what the table allows at
    // the temperature reached (13.3 g per 100 g at 0 °C, 20.9 at 10 °C, linear between)
    let left: f64 = r["solids"].as_array().unwrap().iter().map(|x| f(&x["g"])).sum();
    let t = f(&r["T"]);
    assert!(t < 298.15 - 5.0 && t > 273.15, "T {t}");
    let allowed = 13.3 + (20.9 - 13.3) * (t - 273.15) / 10.0;
    assert!((50.0 - left - allowed).abs() < 0.02, "dissolved {} g, the table allows {allowed} g at {t} K", 50.0 - left);
    // Energy: 16.9 g dissolved took (16.9 / 101.1 mol) × 34.89 kJ/mol from 100 g of water and 33 g of crystals
    let heat = (50.0 - left) / 101.102 * 34_890.0;
    let capacity = f(&r["heatCapacity"]);
    assert!(((298.15 - t) * capacity / heat - 1.0).abs() < 0.08, "cooling {} K with {capacity} J/K for {heat} J", 298.15 - t);
    // Warm it to 60 °C: 110 g per 100 g — everything dissolves; back at 20 °C 31.6 g stay in solution
    op(&mut s, json!({ "op": "apply", "action": { "act": "bath", "vessel": "a", "T": 333.15 } }));
    assert!(read(&mut s, "a")["solids"].as_array().unwrap().is_empty());
    op(&mut s, json!({ "op": "apply", "action": { "act": "bath", "vessel": "a", "T": 293.15 } }));
    let crystals: f64 = read(&mut s, "a")["solids"].as_array().unwrap().iter().map(|x| f(&x["g"])).sum();
    assert!((crystals - (50.0 - 31.6)).abs() < 0.05, "crystals {crystals} g");
    // 4.00 g of sodium hydroxide in 100 g of water: 0.1 mol × 44.51 kJ/mol / (5.551 mol × 75.3 J/(mol·K)) = 10.6 K
    add(&mut s, "b", "water", 100.0, "g");
    add(&mut s, "b", "NaOH_solid", 4.0, "g");
    let r = read(&mut s, "b");
    assert!(r["solids"].as_array().unwrap().is_empty());
    assert!((f(&r["T"]) - 298.15 - 10.6).abs() < 0.3, "T rise {}", f(&r["T"]) - 298.15);
    // 1 mol/kg of hydroxide at about 36 °C (pKw 13.6 there): pH about 13.5
    assert!(f(&r["pH"]) > 13.3 && f(&r["pH"]) < 13.9, "pH {}", r["pH"]);
}

#[test]
fn hydrogen_is_collected_over_water_and_carbon_dioxide_clouds_limewater() {
    setup();
    let mut s = bench(json!([
        { "id": "gen", "kind": "erlenmeyer", "capacity_mL": 250, "closed": true },
        { "id": "jar", "kind": "gasJar", "capacity_mL": 250, "collect": "water" },
        { "id": "flask", "kind": "erlenmeyer", "capacity_mL": 250 },
        { "id": "wash", "kind": "beaker", "capacity_mL": 250 }
    ]));
    op(&mut s, json!({ "op": "apply", "action": { "act": "connect", "from": "gen", "to": "jar" } }));
    add(&mut s, "gen", "HCl_1M", 50.0, "mL");
    add(&mut s, "gen", "Zn_granule", 1.0, "g");
    for _ in 0..60 {
        op(&mut s, json!({ "op": "advance", "seconds": 10.0 }));
    }
    let gen = read(&mut s, "gen");
    let jar = read(&mut s, "jar");
    let zinc_left: f64 = gen["solids"].as_array().unwrap().iter().map(|x| f(&x["n"])).sum();
    let gone = 1.0 / 65.38 - zinc_left;
    // The generator stays at the room's pressure; what left it is in the jar: first the air of its head space, then
    // hydrogen. Moles are conserved: gas made = gas in the jar + the change of the generator's head space
    assert!((f(&gen["P"]) - 101_325.0).abs() < 50.0, "generator pressure {}", gen["P"]);
    let in_jar: f64 = jar["gas"].as_array().unwrap().iter().map(|g| f(&g["n"])).sum();
    assert!(gone > 0.0015, "zinc reacted {gone}");
    // … plus the 50 mL of air the acid pushed out of the flask when it was poured in (2.04 mmol) and the water vapour
    // that the head space lost with what it vented (about 3 % of the gas)
    let displaced = 0.050 / (0.082057366 * 298.15);
    assert!((in_jar - gone - displaced).abs() < 4e-4, "{in_jar} mol in the jar for {gone} mol of hydrogen made and {displaced} mol of air displaced");
    let hydrogen: f64 = jar["gas"].as_array().unwrap().iter().filter(|g| g["id"] == "H2(g)").map(|g| f(&g["n"])).sum();
    // The head space is well mixed: what leaves first is mostly the air that was in the flask (the reason the first
    // gas is discarded at the bench). Hydrogen is conserved between the flask's head space and the jar
    let in_flask: f64 = gen["gas"].as_array().unwrap().iter().filter(|g| g["id"] == "H2(g)").map(|g| f(&g["n"])).sum();
    assert!(hydrogen > 0.0 && hydrogen < in_flask, "hydrogen: {hydrogen} in the jar, {in_flask} in the flask");
    assert!((hydrogen + in_flask - gone).abs() < 0.02 * gone, "hydrogen {hydrogen} + {in_flask} of {gone} made");
    assert!((f(&jar["gas_mL"]) - in_jar * 0.082057366 * 298.15 * 1e3).abs() < 1.0);
    // Carbon dioxide from marble powder, led into limewater: calcite precipitates there
    op(&mut s, json!({ "op": "apply", "action": { "act": "connect", "from": "flask", "to": "wash" } }));
    add(&mut s, "wash", "water", 100.0, "g");
    op(&mut s, json!({ "op": "apply", "action": { "act": "add", "to": "wash", "reagent": "NaOH_0.1M", "amount": { "value": 20.0, "unit": "mL" } } }));
    add(&mut s, "flask", "HCl_1M", 20.0, "mL");
    add(&mut s, "flask", "CaCO3_powder", 0.5, "g");
    let wash = read(&mut s, "wash");
    // 2 mmol of hydroxide took up carbon dioxide: the wash solution is no longer strongly basic
    assert!(f(&wash["pH"]) < 11.0, "pH of the wash bottle {}", wash["pH"]);
    let carbon: f64 = wash["species"].as_array().unwrap().iter().filter(|x| ["HCO3-", "CO3-2", "CO2", "NaHCO3", "NaCO3-"].contains(&x["id"].as_str().unwrap())).map(|x| f(&x["n"])).sum();
    assert!(carbon > 1.0e-3, "carbon taken up {carbon}");
}

fn circuit<'a>(state: &'a Value, id: &str) -> &'a Value {
    state["circuits"].as_array().unwrap().iter().find(|c| c["id"] == id).expect("circuit")
}

#[test]
fn daniell_cell_and_the_electrolysis_of_copper_sulfate_and_brine() {
    setup();
    let mut s = bench(json!([
        { "id": "zn", "kind": "beaker", "capacity_mL": 250 }, { "id": "cu", "kind": "beaker", "capacity_mL": 250 },
        { "id": "cell", "kind": "beaker", "capacity_mL": 250 }, { "id": "brine", "kind": "beaker", "capacity_mL": 250 }
    ]));
    add(&mut s, "zn", "ZnSO4_1M", 100.0, "mL");
    add(&mut s, "cu", "CuSO4_1M", 100.0, "mL");
    // Without a salt bridge the circuit is open
    let out = op(&mut s, json!({ "op": "apply", "action": { "act": "circuit", "id": "daniell", "a": { "vessel": "zn", "electrode": "Zn(s)" }, "b": { "vessel": "cu", "electrode": "Cu(s)" }, "load": 100.0 } }));
    assert_eq!(f(&circuit(&out["state"], "daniell")["I"]), 0.0);
    let out = op(&mut s, json!({ "op": "apply", "action": { "act": "circuitSet", "id": "daniell", "bridge": true } }));
    let c = circuit(&out["state"], "daniell");
    // Zn | Zn²⁺ (1 M) ‖ Cu²⁺ (1 M) | Cu: 1.10 V from the standard potentials; both sulfates have nearly the same
    // activity coefficient, so the electromotive force stays within a few millivolts of it
    assert!((f(&c["emf"]) - 1.1037).abs() < 0.01, "emf {}", c["emf"]);
    assert_eq!(c["anode"], "a");
    assert_eq!(c["anodeCouple"], "Zn+2/Zn");
    assert_eq!(c["cathodeCouple"], "Cu+2/Cu");
    let i = f(&c["I"]);
    assert!(i > 0.0 && i < f(&c["emf"]) / 100.0);
    // Faraday: the charge passed in 1000 s dissolves Q/2F of zinc and plates the same amount of copper
    let out = op(&mut s, json!({ "op": "advance", "seconds": 1000.0 }));
    let c = circuit(&out["state"], "daniell");
    let moles = f(&c["charge"]) / (2.0 * 96_485.332_12);
    assert!((f(&c["charge"]) / (i * 1000.0) - 1.0).abs() < 0.02, "charge {} for {} A", c["charge"], i);
    assert!((f(&c["a"]["massChange_g"]) + moles * 65.38).abs() < 1e-9);
    assert!((f(&c["b"]["massChange_g"]) - moles * 63.546).abs() < 1e-9);
    // Copper sulfate between graphite electrodes at 3 V: copper at the cathode, oxygen at the anode, acid forms
    add(&mut s, "cell", "CuSO4_1M", 100.0, "mL");
    let ph0 = f(&read(&mut s, "cell")["pH"]);
    let out = op(&mut s, json!({ "op": "apply", "action": { "act": "circuit", "id": "plating", "a": { "vessel": "cell", "electrode": "C(s)" }, "b": { "vessel": "cell", "electrode": "C(s)" }, "source": 3.0, "load": 1.0 } }));
    let c = circuit(&out["state"], "plating");
    assert_eq!(c["anodeCouple"], "O2/H2O");
    assert_eq!(c["cathodeCouple"], "Cu+2/Cu");
    assert!(f(&c["I"]) > 0.0);
    op(&mut s, json!({ "op": "advance", "seconds": 600.0 }));
    assert!(f(&read(&mut s, "cell")["pH"]) < ph0 - 0.3, "the solution turns acidic");
    // Saturated brine between graphite electrodes: chlorine at the anode, hydrogen at the cathode, the solution
    // turns basic; in a dilute chloride solution oxygen is discharged instead
    add(&mut s, "brine", "NaCl_sat", 100.0, "mL");
    let out = op(&mut s, json!({ "op": "apply", "action": { "act": "circuit", "id": "chlor", "a": { "vessel": "brine", "electrode": "C(s)" }, "b": { "vessel": "brine", "electrode": "C(s)" }, "source": 6.0, "load": 1.0 } }));
    let c = circuit(&out["state"], "chlor");
    assert_eq!(c["anodeCouple"], "Cl2/Cl-");
    assert_eq!(c["cathodeCouple"], "H+/H2");
    op(&mut s, json!({ "op": "advance", "seconds": 120.0 }));
    assert!(f(&read(&mut s, "brine")["pH"]) > 9.0, "pH {}", read(&mut s, "brine")["pH"]);
    op(&mut s, json!({ "op": "apply", "action": { "act": "empty", "vessel": "brine" } }));
    add(&mut s, "brine", "NaCl_0.1M", 10.0, "mL");
    add(&mut s, "brine", "water", 90.0, "g");
    let out = op(&mut s, json!({ "op": "apply", "action": { "act": "circuitSet", "id": "chlor", "source": 6.0 } }));
    assert_eq!(circuit(&out["state"], "chlor")["anodeCouple"], "O2/H2O");
}

#[test]
fn a_redox_pair_without_a_declared_reaction_is_reported_as_not_modelled() {
    setup();
    let mut s = bench(json!([{ "id": "a", "kind": "beaker", "capacity_mL": 250 }, { "id": "b", "kind": "beaker", "capacity_mL": 250 }]));
    // Zinc in copper sulfate would react (1.1 V), and the small catalogue declares no such reaction
    add(&mut s, "a", "CuSO4_1M", 50.0, "mL");
    add(&mut s, "a", "Zn_granule", 1.0, "g");
    let r = read(&mut s, "a");
    let d = r["diagnostics"].as_array().unwrap().iter().find(|d| d["code"] == "redox.unmodelled").expect("the pair is reported");
    assert_eq!(d["severity"], "unmodelled");
    assert_eq!(d["params"]["oxidant"], "Cu+2/Cu");
    assert_eq!(d["params"]["reductant"], "Zn+2/Zn");
    // 1.10 V between the standard potentials; with no zinc ion in the solution yet (counted at 10⁻⁶) about 1.25 V
    assert!(f(&d["params"]["volts"]) > 1.05 && f(&d["params"]["volts"]) < 1.35, "{}", d["params"]["volts"]);
    // Zinc in hydrochloric acid is declared: nothing to report. Neither is there for zinc sulfate alone
    add(&mut s, "b", "HCl_1M", 50.0, "mL");
    add(&mut s, "b", "Zn_granule", 1.0, "g");
    assert!(read(&mut s, "b")["diagnostics"].as_array().unwrap().iter().all(|d| d["code"] != "redox.unmodelled"));
}

#[test]
fn an_acid_defined_in_the_file_behaves_by_its_pka() {
    setup();
    let doc = json!({ "format": "velophi-bench", "version": 1,
        "objects": [{ "id": "a", "kind": "beaker", "capacity_mL": 250 }],
        "custom": {
            "acids": [{ "base": "Lac-", "z": -1, "M": 89.07, "pKa": [3.86], "forms": ["HLac"] }],
            "reagents": [{ "id": "lactic_0.1M", "kind": "solution", "recipe": { "water_kg": 1, "species": { "HLac": 0.1 } }, "rho": 1.009008 }]
        },
        "log": [{ "act": "add", "to": "a", "reagent": "lactic_0.1M", "amount": { "value": 50, "unit": "mL" } }] });
    let mut s = BenchSession::create(&json!({ "bench": doc })).expect("bench");
    assert_eq!(op(&mut s, json!({ "op": "state" }))["custom"].as_array().unwrap().len(), 0);
    // A weak acid of 0.1 mol/L with pKa 3.86: [H⁺] = √(Ka·c) to first order → pH 2.43; with the dissociated part
    // subtracted and the activity coefficients, 2.44
    let r = read(&mut s, "a");
    assert!((f(&r["pH"]) - 2.44).abs() < 0.02, "pH {}", r["pH"]);
    // Half neutralised: pH = pKa − log γ(Lac⁻) ≈ 3.86 + 0.08
    add(&mut s, "a", "NaOH_0.1M", 25.0, "mL");
    let r = read(&mut s, "a");
    assert!((f(&r["pH"]) - 3.86).abs() < 0.12, "half-way pH {}", r["pH"]);
    assert!(r["diagnostics"].as_array().unwrap().iter().any(|d| d["code"] == "thermal.unknownEnthalpy"));
    // The definition travels with the document
    let again = op(&mut s, json!({ "op": "document" }))["bench"].clone();
    assert_eq!(again["custom"]["acids"][0]["base"], "Lac-");
    let hash = op(&mut s, json!({ "op": "hash" }))["hash"].clone();
    let mut replay = BenchSession::create(&json!({ "bench": again })).expect("replay");
    assert_eq!(op(&mut replay, json!({ "op": "hash" }))["hash"], hash);
    // The shared database is untouched: another bench does not know the acid
    let mut other = bench(json!([{ "id": "a", "kind": "beaker", "capacity_mL": 250 }]));
    assert!(call(&mut other, &json!({ "op": "apply", "action": { "act": "add", "to": "a", "reagent": "lactic_0.1M", "amount": { "value": 1, "unit": "mL" } } }), &mut Blob::default()).is_err());
}

#[test]
fn rate_laws_follow_their_closed_forms() {
    setup();
    let mut s = bench(json!([
        { "id": "first", "kind": "beaker", "capacity_mL": 250 }, { "id": "warm", "kind": "beaker", "capacity_mL": 250 },
        { "id": "second", "kind": "beaker", "capacity_mL": 250 }
    ]));
    let amount = |r: &Value, id: &str| -> f64 { r["species"].as_array().unwrap().iter().filter(|x| x["id"] == id).map(|x| f(&x["n"])).sum() };
    // First order, k = 1.0e-3 s⁻¹ at 25 °C: n(t) = n₀·e^(−kt)
    add(&mut s, "first", "H2O2_0.1M", 100.0, "mL");
    add(&mut s, "warm", "H2O2_0.1M", 100.0, "mL");
    op(&mut s, json!({ "op": "apply", "action": { "act": "bath", "vessel": "first", "T": 298.15 } }));
    op(&mut s, json!({ "op": "apply", "action": { "act": "bath", "vessel": "warm", "T": 318.15 } }));
    // Second order with equal amounts, k = 10 kg/(mol·s): 1/m − 1/m₀ = kt
    add(&mut s, "second", "HClO_1mM", 100.0, "mL");
    add(&mut s, "second", "H2O2_1mM", 100.0, "mL");
    let n0 = amount(&read(&mut s, "first"), "H2O2");
    let m0 = amount(&read(&mut s, "second"), "H2O2") / (f(&read(&mut s, "second")["water_g"]) * 1e-3);
    assert!((n0 - 0.01).abs() < 1e-7 && (m0 - 5e-4).abs() < 2e-6, "{n0} {m0}");
    let mut t = 0.0;
    for step in [50.0, 150.0, 300.0, 500.0, 1000.0] {
        op(&mut s, json!({ "op": "advance", "seconds": step }));
        t += step;
        let n = amount(&read(&mut s, "first"), "H2O2");
        let expect = n0 * (-1.0e-3 * t as f64).exp();
        assert!((n / expect - 1.0).abs() < 2e-3, "first order at {t} s: {n} for {expect}");
        // Arrhenius: Ea = 75 kJ/mol, 45 °C against 25 °C: k × exp(−Ea/R·(1/318.15 − 1/298.15)) = 6.70 k
        let k_warm = 1.0e-3 * (-75_000.0_f64 / 8.314462618 * (1.0 / 318.15 - 1.0 / 298.15)).exp();
        let n = amount(&read(&mut s, "warm"), "H2O2");
        let expect = n0 * (-k_warm * t).exp();
        // (the small catalogue lets the decay run only above 0.01 mol/kg, so that it does not disturb the second-order
        // pair below: the warm beaker is compared while it is above that)
        assert!((n / expect - 1.0).abs() < 5e-3 || expect < 0.15 * n0, "Arrhenius at {t} s: {n} for {expect}");
        let r = read(&mut s, "second");
        let m = amount(&r, "H2O2") / (f(&r["water_g"]) * 1e-3);
        let expect = 1.0 / (1.0 / m0 + 10.0 * t);
        assert!((m / expect - 1.0).abs() < 2e-3, "second order at {t} s: {m} for {expect}");
    }
    // The oxygen made by the first-order decay left the open beaker: half a mole per mole of peroxide
    let r = read(&mut s, "first");
    let oxygen: f64 = r["released"].as_array().unwrap().iter().filter(|g| g["id"] == "O2(g)").map(|g| f(&g["n"])).sum();
    let gone = n0 - amount(&r, "H2O2");
    // (to the 2e-8 mol of peroxide that is present as HO2⁻ and not counted in `gone`)
    assert!((oxygen + amount(&r, "O2") - 0.5 * gone).abs() < 1e-7, "oxygen {oxygen} for {gone} of peroxide");
}

#[test]
fn a_document_replays_and_a_vessel_does_not_overflow() {
    setup();
    let mut s = bench(json!([{ "id": "a", "kind": "beaker", "capacity_mL": 50 }]));
    add(&mut s, "a", "HCl_0.1M", 20.0, "mL");
    op(&mut s, json!({ "op": "apply", "action": { "act": "ambient", "T": 303.15 } }));
    op(&mut s, json!({ "op": "apply", "action": { "act": "place", "object": { "id": "b", "kind": "beaker", "capacity_mL": 100 } } }));
    op(&mut s, json!({ "op": "layout", "objects": [{ "id": "b", "x": 3.5 }, { "id": "a", "x": 1.0 }] }));
    add(&mut s, "b", "NaOH_0.1M", 10.0, "mL");
    // More than the beaker holds: refused, and nothing changed
    let hash = op(&mut s, json!({ "op": "hash" }))["hash"].clone();
    let refused = call(&mut s, &json!({ "op": "apply", "action": { "act": "add", "to": "a", "reagent": "water", "amount": { "value": 40.0, "unit": "mL" } } }), &mut Blob::default());
    assert_eq!(refused.err().map(|m| m.key), Some("chem.vesselFull"));
    assert_eq!(op(&mut s, json!({ "op": "hash" }))["hash"], hash);
    let refused = call(&mut s, &json!({ "op": "apply", "action": { "act": "pour", "from": "b", "to": "nowhere" } }), &mut Blob::default());
    assert!(refused.is_err());
    assert_eq!(op(&mut s, json!({ "op": "hash" }))["hash"], hash);
    // The document starts where the session started: the room at 25 °C, one object; the rest is in the log
    let doc = op(&mut s, json!({ "op": "document" }))["bench"].clone();
    assert_eq!(doc["objects"].as_array().unwrap().len(), 1);
    assert_eq!(doc["objects"][0]["x"], json!(1.0));
    assert!((f(&doc["settings"]["ambientT"]) - 298.15).abs() < 1e-9);
    let placed = doc["log"].as_array().unwrap().iter().find(|e| e["act"] == "place").expect("place in the log");
    assert_eq!(placed["object"]["x"], json!(3.5));
    let mut again = BenchSession::create(&json!({ "bench": doc })).expect("the document loads again");
    assert_eq!(op(&mut again, json!({ "op": "hash" }))["hash"], hash);
    assert_eq!(op(&mut again, json!({ "op": "document" }))["bench"], doc);
}

#[test]
fn fixtures_are_kept_as_given_and_are_not_chemistry() {
    // 26.65 (D297): the things on the bench that are not vessels — a tripod, a burner, a reagent bottle — are a
    // drawing list of the document: kept as given, written back, replayed, and never part of the state or the log
    setup();
    let mut s = bench(json!([{ "id": "a", "kind": "beaker", "capacity_mL": 250 }]));
    let hash = op(&mut s, json!({ "op": "hash" }))["hash"].clone();
    let fixtures = json!([{ "id": "f1", "kind": "tripod", "x": 0.0, "y": 0.0 }, { "id": "f2", "kind": "alcoholBurner", "x": 0.0, "y": 0.0, "cap": false, "lit": true, "power": 150.0 }]);
    let out = op(&mut s, json!({ "op": "layout", "objects": [{ "id": "a", "y": 9.0, "on": "f1" }], "fixtures": fixtures }));
    assert_eq!(out["fixtures"], fixtures);
    assert_eq!(out["objects"][0]["on"], "f1");
    // a layout without the list leaves it alone
    assert_eq!(op(&mut s, json!({ "op": "layout", "objects": [] }))["fixtures"], fixtures);
    assert_eq!(op(&mut s, json!({ "op": "hash" }))["hash"], hash, "drawing is not chemistry");
    add(&mut s, "a", "water", 50.0, "g");
    op(&mut s, json!({ "op": "undo" }));
    assert_eq!(op(&mut s, json!({ "op": "layout", "objects": [] }))["fixtures"], fixtures, "undo does not touch the drawing list");
    let doc = op(&mut s, json!({ "op": "document" }))["bench"].clone();
    assert_eq!(doc["fixtures"], fixtures);
    assert_eq!(doc["log"].as_array().unwrap().len(), 0);
    let mut again = BenchSession::create(&json!({ "bench": doc })).expect("replay");
    assert_eq!(op(&mut again, json!({ "op": "document" }))["bench"]["fixtures"], fixtures);
    assert_eq!(op(&mut again, json!({ "op": "hash" }))["hash"], hash);
}

#[test]
fn mistakes_have_consequences_that_replay() {
    // 26.65 (D297 item 9): what follows by itself is the core's, so a replay gives it again. Limits come from the
    // objects: brim_mL (liquid above it runs over), burst_kPa (the stopper's overpressure), heatable, shock_K.
    setup();
    let mut s = bench(json!([
        { "id": "over", "kind": "beaker", "capacity_mL": 50, "brim_mL": 60 },
        { "id": "gen", "kind": "erlenmeyer", "capacity_mL": 250, "closed": true, "burst_kPa": 50 },
        { "id": "cyl", "kind": "measuringCylinder", "capacity_mL": 50, "heat_J_K": 58.8, "loss_W_K": 0.15, "heatable": false },
        { "id": "tube", "kind": "testTube", "capacity_mL": 20, "heat_J_K": 12.6, "loss_W_K": 0.08, "shock_K": 100 }
    ]));
    // 80 mL into a beaker that holds 60 mL to its brim: 20 mL run over onto the bench, 60 mL stay
    let out = add(&mut s, "over", "water", 80.0, "mL");
    let spill = out["events"].as_array().unwrap().iter().find(|e| e["code"] == "overflow").expect("an overflow event");
    assert!((f(&spill["params"]["volume_mL"]) - 20.0).abs() < 1e-9, "{}", spill["params"]);
    let r = read(&mut s, "over");
    assert!((f(&r["volume_mL"]) - 60.0).abs() < 1e-9 && (f(&r["spilled_mL"]) - 20.0).abs() < 1e-9);
    // zinc and acid in a stoppered flask: the hydrogen raises the pressure until the stopper is blown out (50 kPa over)
    add(&mut s, "gen", "HCl_1M", 50.0, "mL");
    add(&mut s, "gen", "Zn_granule", 5.0, "g");
    let mut blown = None;
    for _ in 0..400 {
        let out = op(&mut s, json!({ "op": "advance", "seconds": 5.0 }));
        if let Some(e) = out["events"].as_array().unwrap().iter().find(|e| e["code"] == "stopper.blown") {
            blown = Some(e.clone());
            break;
        }
        assert!(f(&read(&mut s, "gen")["P"]) <= 101_325.0 + 50_000.0 + 1e-6, "the pressure stays below what the stopper holds");
    }
    let blown = blown.expect("the stopper is blown out");
    assert!(f(&blown["params"]["P"]) > 101_325.0 + 50_000.0, "{}", blown["params"]);
    let g = read(&mut s, "gen");
    assert_eq!(g["closed"], false);
    assert!((f(&g["P"]) - 101_325.0).abs() < 1e-6, "open to the room again");
    // a measuring cylinder over a flame cracks once it is 15 K above the room; what was in it runs out
    add(&mut s, "cyl", "water", 30.0, "mL");
    op(&mut s, json!({ "op": "apply", "action": { "act": "heat", "vessel": "cyl", "power": 150.0 } }));
    let mut cracked = None;
    for _ in 0..60 {
        let out = op(&mut s, json!({ "op": "advance", "seconds": 1.0 }));
        if let Some(e) = out["events"].as_array().unwrap().iter().find(|e| e["code"] == "vessel.cracked") {
            cracked = Some(e.clone());
            break;
        }
    }
    let cracked = cracked.expect("the cylinder cracks");
    assert_eq!(cracked["params"]["reason"], "heated");
    assert!((f(&cracked["params"]["volume_mL"]) - 30.0).abs() < 1e-6);
    let c = read(&mut s, "cyl");
    assert_eq!(c["cracked"], true);
    assert_eq!(f(&c["volume_mL"]), 0.0);
    assert_eq!(f(&c["heater"]), 0.0);
    let refused = call(&mut s, &json!({ "op": "apply", "action": { "act": "add", "to": "cyl", "reagent": "water", "amount": { "value": 5.0, "unit": "mL" } } }), &mut Blob::default());
    assert_eq!(refused.err().map(|m| m.key), Some("chem.cracked"));
    // an empty test tube heated well above 100 °C, then cold water: the glass cracks (shock_K 100)
    op(&mut s, json!({ "op": "apply", "action": { "act": "heat", "vessel": "tube", "power": 30.0 } }));
    op(&mut s, json!({ "op": "advance", "seconds": 60.0 }));
    op(&mut s, json!({ "op": "apply", "action": { "act": "heat", "vessel": "tube", "power": 0.0 } }));
    assert!(f(&read(&mut s, "tube")["T"]) > 298.15 + 100.0, "the empty tube is hot: {}", read(&mut s, "tube")["T"]);
    let out = add(&mut s, "tube", "water", 5.0, "mL");
    assert!(out["events"].as_array().unwrap().iter().any(|e| e["code"] == "vessel.cracked" && e["params"]["reason"] == "shock"), "{}", out["events"]);
    // the whole of it replays to the same fingerprint
    let hash = op(&mut s, json!({ "op": "hash" }))["hash"].clone();
    let doc = op(&mut s, json!({ "op": "document" }))["bench"].clone();
    let mut again = BenchSession::create(&json!({ "bench": doc })).expect("replay");
    assert_eq!(op(&mut again, json!({ "op": "hash" }))["hash"], hash);
}
