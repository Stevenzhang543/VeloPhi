//! Observable quantities (26.53, port of src/core/observe/quantities.ts and custom.ts of 26.52): everything the
//! watch panel, the charts, the CSV export and the formula layer read. Each quantity is computed from a recorded
//! state and the mode solution of its segment — never from a separate model — so what is shown is exactly what
//! the solver produced.
//!
//! Quantity ids:
//!   - `<body>.x .y .angle .vx .vy .v .omega .ax .ay .a .alpha .ek .ep .px .py .fd .Fg`, `<body>.angle@pivot`;
//!   - `contact.<on>|<by>.N .f .fx .fy .Nx .Ny .vt`, `pair.<a>|<b>.slide .heat`;
//!   - `<rope>.T .len`, `<spring>.F .x`, `<hinge>.F .Fx .Fy`, `<rod>.F`, `<weld>.F .M`, `<motor>.M .P .w .F`,
//!     `<slider>.N .s`, `<gear>.M`, `<force>.Fx .Fy .F .P`;
//!   - `system.ek .ep .es .e .px .py .Lz@pivot`, `ledger.frictionHeat .appliedWork .damping .beltWork .impactLoss .balance`;
//!   - `custom.<id>`: custom (expression) quantities of the scene.

use serde_json::{json, Value};

use crate::dmath::{atan2, hypot};
use crate::dynamics::{energy, force_value, solve_mode, Friction, Mode, ModeSolution, RowKind, System, AUX_FIXED};
use crate::expr::{dim_equal, dim_mul, dim_pow, format_dim, parse_formula, unit_dim, unit_for, variables, BinOp, Dim, Node, DIMLESS};
use crate::kinematics::{anchor_state, distance_kin, rope_path};
use crate::message::{tx, Message, SimResult, Text};
use crate::model::pair_key;
use crate::session::{ledger_at, Session};

/// Scene data the calculations need beyond the solver's scene: the pivot of the @pivot quantities, the custom
/// quantities and the names of the objects (from the scene document).
#[derive(Clone, Debug, Default)]
pub struct SceneMeta {
    pub pivot: Option<(f64, f64)>,
    pub custom: Vec<CustomDef>,
    /// Bodies, connectors and pulleys: id and display name, in scene order.
    pub owners: Vec<(String, String)>,
    /// The whole scene document.
    pub doc: Value,
}

/// A custom quantity of the scene.
#[derive(Clone, Debug)]
pub struct CustomDef {
    pub id: String,
    pub name: String,
    pub expr: String,
}

impl SceneMeta {
    /// From the scene document.
    pub fn from_doc(doc: &Value) -> SceneMeta {
        let pivot = doc.get("extra").and_then(|e| e.get("pivot")).and_then(|p| {
            let x = p.get("x")?.as_f64()?;
            let y = p.get("y")?.as_f64()?;
            if x.is_finite() && y.is_finite() {
                Some((x, y))
            } else {
                None
            }
        });
        let custom = doc
            .get("customQuantities")
            .and_then(|c| c.as_array())
            .map(|a| {
                a.iter()
                    .map(|q| CustomDef {
                        id: q.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        name: q.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        expr: q.get("expr").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    })
                    .collect()
            })
            .unwrap_or_default();
        let mut owners = Vec::new();
        for key in ["bodies", "connectors", "pulleys"] {
            if let Some(a) = doc.get(key).and_then(|v| v.as_array()) {
                for o in a {
                    let id = o.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let name = o.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    owners.push((id, name));
                }
            }
        }
        SceneMeta { pivot, custom, owners, doc: doc.clone() }
    }
}

/// A quantity that can be watched, charted and exported.
#[derive(Clone, Debug)]
pub struct QuantityDef {
    pub id: String,
    pub label: Text,
    /// KaTeX symbol.
    pub symbol: String,
    /// SI unit (the key into units/units.ts).
    pub unit: String,
    /// Group key: 物体 接触 连接件 系统 能量账本 自定义.
    pub group: &'static str,
    pub owner: Text,
}

impl QuantityDef {
    /// JSON for the interface.
    pub fn to_json(&self) -> Value {
        json!({ "id": self.id, "label": self.label.to_json(), "symbol": self.symbol, "unit": self.unit, "group": self.group, "owner": self.owner.to_json() })
    }
}

const BODY_Q: [(&str, &str, &str, &str); 16] = [
    ("x", "位置 x", "x", "m"),
    ("y", "位置 y", "y", "m"),
    ("angle", "角位置 θ", "\\theta", "rad"),
    ("vx", "速度 vₓ", "v_x", "m/s"),
    ("vy", "速度 v_y", "v_y", "m/s"),
    ("v", "速率 |v|", "|v|", "m/s"),
    ("omega", "角速度 ω", "\\omega", "rad/s"),
    ("ax", "加速度 aₓ", "a_x", "m/s²"),
    ("ay", "加速度 a_y", "a_y", "m/s²"),
    ("a", "加速度大小 |a|", "|a|", "m/s²"),
    ("alpha", "角加速度 β", "\\beta", "rad/s²"),
    ("ek", "动能 Eₖ", "E_k", "J"),
    ("ep", "重力势能 Eₚ", "E_p", "J"),
    ("px", "动量 pₓ", "p_x", "kg·m/s"),
    ("py", "动量 p_y", "p_y", "kg·m/s"),
    // 26.54 (D87)
    ("P", "合力的功率 P", "P", "W"),
];

fn q(id: String, label: &'static str, symbol: &str, unit: &str, group: &'static str, owner: Text) -> QuantityDef {
    QuantityDef { id, label: Text::Msg(tx(label)), symbol: symbol.to_string(), unit: unit.to_string(), group, owner }
}

/// The built-in quantities of a system, in display order.
pub fn builtin_quantities(sys: &System, meta: &SceneMeta) -> Vec<QuantityDef> {
    let mut out = Vec::new();
    let model = &sys.model;
    let pivot = meta.pivot;
    for &g in &model.dynamic {
        let b = &model.bodies[g];
        let owner = || Text::Lit(b.name.clone());
        for (k, label, sym, unit) in BODY_Q {
            if (k == "angle" || k == "omega" || k == "alpha") && b.inv_inertia == 0.0 {
                continue;
            }
            out.push(q(format!("{}.{}", b.id, k), label, sym, unit, "物体", owner()));
        }
        if pivot.is_some() {
            out.push(q(format!("{}.angle@pivot", b.id), "摆角（相对竖直）", "\\varphi", "rad", "物体", owner()));
        }
        if b.drag_lin > 0.0 || b.drag_quad > 0.0 {
            out.push(q(format!("{}.fd", b.id), "空气阻力大小 f", "f_d", "N", "物体", owner()));
        }
        if model.g_const > 0.0 && b.attract > 0.0 && model.attractors.len() > 1 {
            out.push(q(format!("{}.Fg", b.id), "受到的引力大小", "F_g", "N", "物体", owner()));
        }
        // 26.54 (D78): charges
        if model.electric && b.charge != 0.0 {
            out.push(q(format!("{}.q", b.id), "电荷量 q", "q", "C", "物体", owner()));
            if model.e_field.x != 0.0 || model.e_field.y != 0.0 {
                out.push(q(format!("{}.FE", b.id), "电场力大小 F电", "F_E", "N", "物体", owner()));
            }
            if model.b_field != 0.0 {
                out.push(q(format!("{}.FB", b.id), "洛伦兹力大小 F洛", "F_B", "N", "物体", owner()));
            }
            if model.k_coulomb > 0.0 && model.charged.len() > 1 {
                out.push(q(format!("{}.Fc", b.id), "库仑力大小 F库", "F_C", "N", "物体", owner()));
            }
        }
        // 26.55 (D92): liquids
        if !model.liquids.is_empty() {
            out.push(q(format!("{}.Fb", b.id), "浮力大小 F浮", "F_b", "N", "物体", owner()));
            out.push(q(format!("{}.Asub", b.id), "浸入部分的面积", "A_{sub}", "m²", "物体", owner()));
            out.push(q(format!("{}.Vsub", b.id), "排开液体的体积", "V_{sub}", "m³", "物体", owner()));
            out.push(q(format!("{}.pl", b.id), "物体中心处液体的压强（表压 ρgh）", "p", "Pa", "物体", owner()));
        }
        // 26.55 (D92b): mechanical efficiency with lifting this body as the useful work
        if (model.has_expr || !model.forces.is_empty() || !model.motors.is_empty()) && (model.settings.gravity.x != 0.0 || model.settings.gravity.y != 0.0) {
            out.push(q(format!("{}.Wuse", b.id), "有用功（提升该物体，自开始）", "W_u", "J", "物体", owner()));
            out.push(q(format!("{}.eta", b.id), "机械效率 η（有用功：提升该物体）", "\\eta", "", "物体", owner()));
        }
    }
    for pair in &sys.pairs {
        let (x, y) = (&model.bodies[pair.x], &model.bodies[pair.y]);
        for (on, by) in [(x, y), (y, x)] {
            if !on.dynamic {
                continue;
            }
            let id = format!("contact.{}|{}", on.id, by.id);
            let owner = || Text::Lit(format!("{}→{}", by.name, on.name));
            out.push(q(format!("{id}.N"), "支持力（压力）N", "N", "N", "接触", owner()));
            out.push(q(format!("{id}.f"), "摩擦力大小 f", "f", "N", "接触", owner()));
            out.push(q(format!("{id}.fx"), "摩擦力 fₓ", "f_x", "N", "接触", owner()));
            out.push(q(format!("{id}.fy"), "摩擦力 f_y", "f_y", "N", "接触", owner()));
            out.push(q(format!("{id}.vt"), "相对滑动速度", "v_{\\text{rel}}", "m/s", "接触", owner()));
        }
        let pk = format!("pair.{}", pair_key(&x.id, &y.id));
        let owner = || Text::Lit(format!("{}–{}", x.name, y.name));
        out.push(q(format!("{pk}.slide"), "相对滑动路程 Δs", "\\Delta s", "m", "接触", owner()));
        out.push(q(format!("{pk}.heat"), "摩擦生热 Q", "Q", "J", "接触", owner()));
    }
    for r in &model.ropes {
        out.push(q(format!("{}.T", r.id), "绳张力 T", "T", "N", "连接件", Text::Lit(r.name.clone())));
        out.push(q(format!("{}.len", r.id), "绳路径长度", "\\ell", "m", "连接件", Text::Lit(r.name.clone())));
    }
    for s in &model.springs {
        if s.damper {
            out.push(q(format!("{}.F", s.id), "阻尼力（拉为正）F", "F", "N", "连接件", Text::Lit(s.name.clone())));
            continue;
        }
        out.push(q(format!("{}.F", s.id), "弹力（拉为正）F", "F", "N", "连接件", Text::Lit(s.name.clone())));
        out.push(q(format!("{}.x", s.id), "形变量 x", "x", "m", "连接件", Text::Lit(s.name.clone())));
    }
    for w in &model.welds {
        out.push(q(format!("{}.F", w.id), "焊接点作用力大小", "F", "N", "连接件", Text::Lit(w.name.clone())));
        out.push(q(format!("{}.M", w.id), "焊接点力矩", "M", "N·m", "连接件", Text::Lit(w.name.clone())));
    }
    for m in &model.motors {
        out.push(q(format!("{}.M", m.id), "马达力矩 M", "M", "N·m", "连接件", Text::Lit(m.name.clone())));
        out.push(q(format!("{}.P", m.id), "马达功率 P", "P", "W", "连接件", Text::Lit(m.name.clone())));
        out.push(q(format!("{}.w", m.id), "相对角速度 ω", "\\omega", "rad/s", "连接件", Text::Lit(m.name.clone())));
        out.push(q(format!("{}.F", m.id), "转轴作用力大小", "F", "N", "连接件", Text::Lit(m.name.clone())));
    }
    for sl in &model.sliders {
        out.push(q(format!("{}.N", sl.id), "滑轨支持力 N", "N", "N", "连接件", Text::Lit(sl.name.clone())));
        out.push(q(format!("{}.s", sl.id), "沿滑轨的位移 s", "s", "m", "连接件", Text::Lit(sl.name.clone())));
    }
    for g in &model.gears {
        out.push(q(format!("{}.M", g.id), "齿轮传递的力矩", "M", "N·m", "连接件", Text::Lit(g.name.clone())));
    }
    for h in &model.hinges {
        out.push(q(format!("{}.F", h.id), "铰链力大小", "F", "N", "连接件", Text::Lit(h.name.clone())));
        out.push(q(format!("{}.Fx", h.id), "铰链力 Fₓ", "F_x", "N", "连接件", Text::Lit(h.name.clone())));
        out.push(q(format!("{}.Fy", h.id), "铰链力 F_y", "F_y", "N", "连接件", Text::Lit(h.name.clone())));
    }
    for r in &model.rods {
        out.push(q(format!("{}.F", r.id), "杆的拉力（拉为正）", "F", "N", "连接件", Text::Lit(r.name.clone())));
    }
    // 26.55 (D91): rail loops
    for rl in &model.rails {
        let owner = || Text::Lit(rl.name.clone());
        out.push(q(format!("{}.emf", rl.id), "感应电动势 E", "E", "V", "连接件", owner()));
        out.push(q(format!("{}.I", rl.id), "感应电流 I", "I", "A", "连接件", owner()));
        out.push(q(format!("{}.F", rl.id), "安培力（沿导轨）F安", "F_A", "N", "连接件", owner()));
        out.push(q(format!("{}.P", rl.id), "电功率（焦耳热功率）", "P", "W", "连接件", owner()));
    }
    for f in &model.forces {
        if !f.a.body.is_some_and(|g| model.bodies[g].dynamic) {
            continue;
        }
        out.push(q(format!("{}.Fx", f.id), "外力 Fₓ", "F_x", "N", "连接件", Text::Lit(f.name.clone())));
        out.push(q(format!("{}.Fy", f.id), "外力 F_y", "F_y", "N", "连接件", Text::Lit(f.name.clone())));
        out.push(q(format!("{}.F", f.id), "外力大小 |F|", "|F|", "N", "连接件", Text::Lit(f.name.clone())));
        out.push(q(format!("{}.P", f.id), "外力的功率 P", "P", "W", "连接件", Text::Lit(f.name.clone())));
    }
    let system = || Text::Msg(tx("系统"));
    for (id, label, sym, unit) in [
        ("system.ek", "总动能", "E_k", "J"),
        ("system.ep", "总重力势能", "E_p", "J"),
        ("system.es", "弹性势能", "E_s", "J"),
        ("system.e", "机械能", "E", "J"),
        ("system.px", "总动量 pₓ", "p_x", "kg·m/s"),
        ("system.py", "总动量 p_y", "p_y", "kg·m/s"),
        // 26.54 (D87)
        ("system.Lz", "对原点的角动量 L", "L_z", "kg·m²/s"),
        ("system.lagr", "拉格朗日量 L = T − V", "\\mathcal{L}", "J"),
        ("system.ham", "哈密顿量 H = T + V", "H", "J"),
    ] {
        out.push(q(id.into(), label, sym, unit, "系统", system()));
    }
    if pivot.is_some() {
        out.push(q("system.Lz@pivot".into(), "对转轴角动量", "L", "kg·m²/s", "系统", system()));
    }
    if model.electric {
        out.push(q("system.eE".into(), "电势能", "E_e", "J", "系统", system()));
    }
    for (id, label, sym) in [
        ("ledger.frictionHeat", "摩擦生热（累计）", "Q_f"),
        ("ledger.appliedWork", "外力做功（累计）", "W_F"),
        ("ledger.damping", "阻尼耗散（累计）", "Q_d"),
        ("ledger.beltWork", "电机与传送带做功（累计）", "W_{\\mathrm{belt}}"),
        ("ledger.impactLoss", "碰撞损失动能（累计）", "\\Delta E_{\\mathrm{coll}}"),
        ("ledger.balance", "能量账本合计（应守恒）", "E_{\\Sigma}"),
    ] {
        out.push(q(id.into(), label, sym, "J", "能量账本", system()));
    }
    if sys.extra_slot.is_some() {
        for (id, label, sym) in [
            ("ledger.fieldWork", "场区电场力做功（累计）", "W_{E}"),
            ("ledger.buoyancyWork", "浮力做功（累计）", "W_b"),
            ("ledger.jouleHeat", "焦耳热（累计）", "Q_J"),
            ("ledger.liquidHeat", "液体阻力耗散（累计）", "Q_l"),
        ] {
            out.push(q(id.into(), label, sym, "J", "能量账本", system()));
        }
    }
    out
}

/// The listed form of a quantity id (pair order canonical).
pub fn canonical_quantity_id(id: &str) -> String {
    if !id.starts_with("pair.") {
        return id.to_string();
    }
    let Some(dot) = id.rfind('.') else { return id.to_string() };
    if dot <= 5 {
        return id.to_string();
    }
    let bodies: Vec<&str> = id[5..dot].split('|').collect();
    if bodies.len() != 2 {
        return id.to_string();
    }
    format!("pair.{}{}", pair_key(bodies[0], bodies[1]), &id[dot..])
}

// ---- Custom quantities ----

/// A built-in quantity that expressions read, as a synthetic variable.
#[derive(Clone, Debug)]
pub struct CustomRef {
    pub variable: String,
    pub id: String,
}

/// A compiled custom quantity.
#[derive(Clone, Debug)]
pub struct CompiledCustom {
    pub node: Node,
    pub refs: Vec<CustomRef>,
    pub globals: Vec<String>,
    pub unit: String,
}

/// A custom quantity of the scene and its compiled form, or the error.
#[derive(Clone, Debug)]
pub struct CustomEntry {
    pub def: CustomDef,
    pub compiled: Option<CompiledCustom>,
    pub error: Option<Message>,
}

const ONE_ARG: [&str; 27] = ["x", "y", "angle", "vx", "vy", "v", "omega", "ax", "ay", "a", "alpha", "ek", "ep", "px", "py", "fd", "Fg", "T", "len", "F", "Fx", "Fy", "M", "P", "w", "N", "s"];
const CONTACT: [&str; 7] = ["N", "Nx", "Ny", "f", "fx", "fy", "vt"];
const PAIR: [&str; 2] = ["slide", "heat"];

fn alias(k: &str) -> &str {
    match k {
        "theta" => "angle",
        "beta" => "alpha",
        _ => k,
    }
}

/// Variables of the system: the built-in quantity each reads (None: computed directly) and its unit.
pub fn custom_global(name: &str) -> Option<(Option<&'static str>, &'static str)> {
    Some(match name {
        "t" => (None, "s"),
        "g" => (None, "m/s²"),
        "E" => (Some("system.e"), "J"),
        "Ek" => (Some("system.ek"), "J"),
        "Ep" => (Some("system.ep"), "J"),
        "Es" => (Some("system.es"), "J"),
        "Px" => (Some("system.px"), "kg·m/s"),
        "Py" => (Some("system.py"), "kg·m/s"),
        _ => return None,
    })
}

/// What compiling needs: built-in quantity id → unit, and the objects that can be named.
pub struct CustomScope<'a> {
    pub units: Vec<(String, String)>,
    pub owners: &'a [(String, String)],
}

impl CustomScope<'_> {
    fn unit(&self, id: &str) -> Option<&str> {
        self.units.iter().find(|(i, _)| i == id).map(|(_, u)| u.as_str())
    }
}

fn resolve_owner(scope: &CustomScope, raw: &str) -> Result<String, Message> {
    let name = js_trim(raw);
    if name.is_empty() {
        return Err(tx("括号里应写物体或连接件的名称（或 id）"));
    }
    if scope.owners.iter().any(|(id, _)| id == name) {
        return Ok(name.to_string());
    }
    let by_name: Vec<&(String, String)> = scope.owners.iter().filter(|(_, n)| js_trim(n) == name).collect();
    if by_name.len() == 1 {
        return Ok(by_name[0].0.clone());
    }
    if by_name.len() > 1 {
        return Err(tx("有多个对象叫“{0}”，请改用它的 id").text("0", name));
    }
    Err(tx("找不到名为“{0}”的物体或连接件").text("0", name))
}

/// JavaScript String.prototype.trim (Unicode white space and line terminators).
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(|c: char| c.is_whitespace() || c == '\u{FEFF}')
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// Rewrite every `key(args)` call without nested parentheses (the regex of compileCustom).
fn rewrite_calls(src: &str, f: &mut dyn FnMut(&str, &str, &str) -> Result<String, Message>) -> Result<String, Message> {
    let chars: Vec<char> = src.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let starts = (c.is_ascii_alphabetic() || c == '_') && (i == 0 || !is_word(chars[i - 1]));
        if starts {
            let mut j = i + 1;
            while j < chars.len() && is_word(chars[j]) {
                j += 1;
            }
            // The identifier is greedy; a shorter one can never be followed by "(" (the next char is a word char)
            let mut k = j;
            while k < chars.len() && (chars[k].is_whitespace() || chars[k] == '\u{FEFF}') {
                k += 1;
            }
            if k < chars.len() && chars[k] == '(' {
                let mut m = k + 1;
                while m < chars.len() && chars[m] != '(' && chars[m] != ')' {
                    m += 1;
                }
                if m < chars.len() && chars[m] == ')' {
                    let whole: String = chars[i..=m].iter().collect();
                    let key: String = chars[i..j].iter().collect();
                    let inner: String = chars[k + 1..m].iter().collect();
                    out.push_str(&f(&whole, &key, &inner)?);
                    i = m + 1;
                    continue;
                }
            }
            // No match at this identifier: emit it and continue after it (positions inside it cannot match)
            out.extend(&chars[i..j]);
            i = j;
            continue;
        }
        out.push(c);
        i += 1;
    }
    Ok(out)
}

/// Compile an expression against the quantities of a scene (compileCustom).
pub fn compile_custom(expr: &str, scope: &CustomScope) -> Result<CompiledCustom, Message> {
    let src = js_trim(expr);
    if src.is_empty() {
        return Err(tx("表达式为空"));
    }
    {
        let cs: Vec<char> = src.chars().collect();
        for i in 0..cs.len().saturating_sub(1) {
            if cs[i] == '_' && cs[i + 1] == '_' && (i == 0 || !is_word(cs[i - 1])) {
                return Err(tx("名称不能以两个下划线开头"));
            }
        }
    }
    let mut refs: Vec<CustomRef> = Vec::new();
    let rewritten = rewrite_calls(src, &mut |whole, key, inner| {
        let k = alias(key);
        let one = ONE_ARG.contains(&k);
        let contact = CONTACT.contains(&k);
        let pair = PAIR.contains(&k);
        if !one && !contact && !pair {
            return Ok(whole.to_string());
        }
        let args: Vec<&str> = inner.split(',').collect();
        let id = if args.len() == 1 && one {
            format!("{}.{}", resolve_owner(scope, args[0])?, k)
        } else if args.len() == 2 && contact {
            format!("contact.{}|{}.{}", resolve_owner(scope, args[0])?, resolve_owner(scope, args[1])?, k)
        } else if args.len() == 2 && pair {
            canonical_quantity_id(&format!("pair.{}|{}.{}", resolve_owner(scope, args[0])?, resolve_owner(scope, args[1])?, k))
        } else if contact || pair {
            return Err(tx("{0}(…) 需要两个物体，如 {0}(b1, b2)").text("0", key));
        } else {
            return Err(tx("{0}(…) 只需要一个对象，如 {0}(b1)").text("0", key));
        };
        if scope.unit(&id).is_none() {
            return Err(tx("{0}({1})：本场景中没有这个量").text("0", key).text("1", js_trim(inner)));
        }
        if let Some(r) = refs.iter().find(|r| r.id == id) {
            return Ok(r.variable.clone());
        }
        let variable = format!("__q{}", refs.len());
        refs.push(CustomRef { variable: variable.clone(), id });
        Ok(variable)
    })?;
    let node = parse_formula(&rewritten)?;
    let mut dims: Vec<(String, Dim)> = Vec::new();
    let mut globals = Vec::new();
    let mut vars = Vec::new();
    variables(&node, &mut vars);
    for v in vars {
        if let Some(r) = refs.iter().find(|r| r.variable == v) {
            dims.push((v, scope.unit(&r.id).and_then(unit_dim).unwrap_or(DIMLESS)));
            continue;
        }
        let Some((gid, gunit)) = custom_global(&v) else {
            return Err(tx("未知的量 {0}：可用 t、E、Ek、Ep、Es、Px、Py、g，或 x(物体) 这样的写法").text("0", v));
        };
        if let Some(gid) = gid {
            if scope.unit(gid).is_none() {
                return Err(tx("{0}：本场景中没有这个量").text("0", v));
            }
        }
        globals.push(v.clone());
        dims.push((v, unit_dim(gunit).unwrap_or(DIMLESS)));
    }
    let d = dimension_of(&node, &dims)?.0;
    Ok(CompiledCustom { node, refs, globals, unit: unit_for(&d) })
}

/// Dimension of a term and whether a free numeric coefficient can still take a unit.
type Dm = (Dim, bool);

fn unify(a: Dm, b: Dm, what: &str) -> Result<Dm, Message> {
    if dim_equal(&a.0, &b.0) {
        return Ok((a.0, a.1 && b.1));
    }
    if b.1 {
        return Ok((a.0, a.1));
    }
    if a.1 {
        return Ok((b.0, false));
    }
    Err(tx("量纲不一致：{0} {1} {2}").text("0", format_dim(&a.0)).text("1", what).text("2", format_dim(&b.0)))
}

fn pure(a: Dm, func: &str) -> Result<(), Message> {
    if !a.1 && !dim_equal(&a.0, &DIMLESS) {
        return Err(tx("{0} 的参数必须无量纲，实为 {1}").text("0", func).text("1", format_dim(&a.0)));
    }
    Ok(())
}

fn dimension_of(node: &Node, dims: &[(String, Dim)]) -> Result<Dm, Message> {
    Ok(match node {
        Node::Num(_) => (DIMLESS, true),
        Node::Var(name) => (dims.iter().find(|(n, _)| n == name).map(|(_, d)| *d).unwrap_or(DIMLESS), false),
        Node::Neg(a) => dimension_of(a, dims)?,
        Node::Cmp(op, l, r) => {
            let op = match op {
                crate::expr::CmpOp::Lt => "<",
                crate::expr::CmpOp::Le => "<=",
                crate::expr::CmpOp::Gt => ">",
                crate::expr::CmpOp::Ge => ">=",
            };
            unify(dimension_of(l, dims)?, dimension_of(r, dims)?, op)?;
            (DIMLESS, false)
        }
        Node::Bin(op, l, r) => {
            let a = dimension_of(l, dims)?;
            if *op == BinOp::Pow {
                let p = match r.as_ref() {
                    Node::Num(v) => Some(*v),
                    Node::Neg(x) => match x.as_ref() {
                        Node::Num(v) => Some(-*v),
                        _ => None,
                    },
                    _ => None,
                };
                if let Some(p) = p {
                    return Ok((dim_pow(&a.0, p), a.1));
                }
                pure(dimension_of(r, dims)?, "^")?;
                if !a.1 && !dim_equal(&a.0, &DIMLESS) {
                    return Err(tx("有量纲的量只能取数字次幂"));
                }
                return Ok((DIMLESS, a.1));
            }
            let b = dimension_of(r, dims)?;
            match op {
                BinOp::Add => unify(a, b, "+")?,
                BinOp::Sub => unify(a, b, "-")?,
                BinOp::Mul => (dim_mul(&a.0, &b.0), a.1 || b.1),
                _ => (dim_mul(&a.0, &dim_pow(&b.0, -1.0)), a.1 || b.1),
            }
        }
        Node::Call(f, args) => {
            let mut a = Vec::with_capacity(args.len());
            for x in args {
                a.push(dimension_of(x, dims)?);
            }
            match f.as_str() {
                "if" => unify(a[1], a[2], ",")?,
                "sqrt" => (dim_pow(&a[0].0, 0.5), a[0].1),
                "abs" => a[0],
                "sign" | "step" => (DIMLESS, false),
                "min" | "max" => unify(a[0], a[1], ",")?,
                "clamp" => unify(unify(a[0], a[1], ",")?, a[2], ",")?,
                "atan2" => {
                    unify(a[0], a[1], ",")?;
                    (DIMLESS, false)
                }
                _ => {
                    for x in &a {
                        pure(*x, f)?;
                    }
                    (DIMLESS, false)
                }
            }
        }
    })
}

/// The custom quantities of a scene, compiled against the built-in quantities.
pub fn custom_quantities(sys: &System, meta: &SceneMeta) -> Vec<CustomEntry> {
    if meta.custom.is_empty() {
        return Vec::new();
    }
    let units = builtin_quantities(sys, meta).into_iter().map(|q| (q.id, q.unit)).collect();
    let scope = CustomScope { units, owners: &meta.owners };
    meta.custom
        .iter()
        .map(|def| match compile_custom(&def.expr, &scope) {
            Ok(c) => CustomEntry { def: def.clone(), compiled: Some(c), error: None },
            Err(e) => CustomEntry { def: def.clone(), compiled: None, error: Some(e) },
        })
        .collect()
}

/// KaTeX symbol of a custom quantity.
pub fn custom_symbol(id: &str) -> String {
    let clean: String = id.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    format!("Q_{{\\mathrm{{{clean}}}}}")
}

/// Every quantity of a system, in display order (custom quantities last).
pub fn list_quantities(sys: &System, meta: &SceneMeta, customs: &[CustomEntry]) -> Vec<QuantityDef> {
    let mut out = builtin_quantities(sys, meta);
    for c in customs {
        let Some(comp) = &c.compiled else { continue };
        out.push(QuantityDef {
            id: format!("custom.{}", c.def.id),
            label: Text::Lit(c.def.name.clone()),
            symbol: custom_symbol(&c.def.id),
            unit: comp.unit.clone(),
            group: "自定义",
            owner: Text::Msg(tx("自定义")),
        });
    }
    out
}

// ---- Evaluation ----

/// Everything needed to evaluate quantities at one state.
pub struct Observation<'a> {
    pub sys: &'a System,
    pub meta: &'a SceneMeta,
    pub customs: &'a [CustomEntry],
    pub x: &'a [f64],
    pub mode: &'a Mode,
    pub sol: ModeSolution,
    pub impact_loss: f64,
    /// Time of the state, when known.
    pub t: Option<f64>,
}

/// Contact forces on body `on` by body `by` (zero when not in contact).
#[derive(Clone, Debug)]
pub struct ContactForces {
    pub nx: f64,
    pub ny: f64,
    pub n: f64,
    pub fx: f64,
    pub fy: f64,
    pub f: f64,
    pub vt: f64,
    pub in_contact: bool,
    /// 滑动 / 相对静止 / 光滑接触 / 未接触
    pub status: &'static str,
}

/// Contact forces on body `on` by body `by` in a mode solution (zero when not in contact).
pub fn contact_forces_of(sys: &System, mode: &Mode, sol: &ModeSolution, on_id: &str, by_id: &str) -> ContactForces {
    let model = &sys.model;
    let key = pair_key(on_id, by_id);
    for (ui, u) in mode.units.iter().enumerate() {
        let pair = &sys.pairs[u.pair];
        if pair.key != key || u.points.is_empty() {
            continue;
        }
        let st = &sol.units[ui];
        let (mut nx, mut ny) = (0.0, 0.0);
        for (pi, &p) in u.points.iter().enumerate() {
            let k = &st.point_kin[pi];
            let l = st.point_lambda[pi];
            let sign = if model.bodies[pair.features[p].a.body].id == on_id { 1.0 } else { -1.0 };
            nx += sign * l * k.nx;
            ny += sign * l * k.ny;
        }
        let ref_sign = if model.bodies[pair.features[u.ref_].a.body].id == on_id { 1.0 } else { -1.0 };
        let fx = ref_sign * st.tangent * st.ref_kin.tx;
        let fy = ref_sign * st.tangent * st.ref_kin.ty;
        let status = match u.friction {
            Friction::Slide => "滑动",
            Friction::Stick => "相对静止",
            Friction::None => "光滑接触",
        };
        return ContactForces { nx, ny, n: st.normal, fx, fy, f: st.tangent.abs(), vt: ref_sign * st.vt, in_contact: true, status };
    }
    ContactForces { nx: 0.0, ny: 0.0, n: 0.0, fx: 0.0, fy: 0.0, f: 0.0, vt: f64::NAN, in_contact: false, status: "未接触" }
}

impl<'a> Observation<'a> {
    /// Context of a state in a mode (makeContextFor).
    pub fn new(sys: &'a System, meta: &'a SceneMeta, customs: &'a [CustomEntry], x: &'a [f64], mode: &'a Mode, impact_loss: f64, t: Option<f64>) -> SimResult<Self> {
        let sol = solve_mode(sys, x, mode, None)?;
        Ok(Observation { sys, meta, customs, x, mode, sol, impact_loss, t })
    }

    /// Contact forces of the unit of the pair (on, by).
    pub fn contact_forces(&self, on_id: &str, by_id: &str) -> ContactForces {
        contact_forces_of(self.sys, self.mode, &self.sol, on_id, by_id)
    }

    fn row_lambda(&self, kind: RowKind, owner: usize, sub: usize) -> f64 {
        for (k, r) in self.sol.rows.iter().enumerate() {
            if r.kind == kind && r.owner == owner && r.sub == sub {
                return self.sol.lambda[k];
            }
        }
        0.0
    }

    /// Value of quantity `id`; NaN for unknown ids.
    pub fn value(&self, id: &str) -> f64 {
        let sys = self.sys;
        let model = &sys.model;
        let n = sys.n;
        let x = self.x;
        let Some(dot) = id.rfind('.') else { return f64::NAN };
        let (head, q) = (&id[..dot], &id[dot + 1..]);
        if head == "custom" {
            let Some(c) = self.customs.iter().find(|e| e.def.id == q).and_then(|e| e.compiled.as_ref()) else { return f64::NAN };
            let vals: Vec<(String, f64)> = c
                .refs
                .iter()
                .map(|r| (r.variable.clone(), self.value(&r.id)))
                .chain(c.globals.iter().map(|g| {
                    let v = match g.as_str() {
                        "t" => self.t.unwrap_or_else(|| sys.time_slot.map(|s| x[s]).unwrap_or(f64::NAN)),
                        "g" => hypot(model.settings.gravity.x, model.settings.gravity.y),
                        other => custom_global(other).and_then(|(id, _)| id).map(|id| self.value(id)).unwrap_or(f64::NAN),
                    };
                    (g.clone(), v)
                }))
                .collect();
            return crate::expr::evaluate(&c.node, &|name| vals.iter().find(|(n, _)| n == name).map(|(_, v)| *v)).unwrap_or(f64::NAN);
        }
        if let Some(rest) = head.strip_prefix("contact.") {
            let mut it = rest.split('|');
            let on = it.next().unwrap_or("");
            let by = it.next().unwrap_or("");
            let c = self.contact_forces(on, by);
            return match q {
                "N" => c.n,
                "Nx" => c.nx,
                "Ny" => c.ny,
                "f" => c.f,
                "fx" => c.fx,
                "fy" => c.fy,
                "vt" => c.vt,
                _ => f64::NAN,
            };
        }
        if let Some(rest) = head.strip_prefix("pair.") {
            let mut it = rest.split('|');
            let a = it.next().unwrap_or("");
            let b = it.next().unwrap_or("");
            let key = pair_key(a, b);
            let Some(pair) = sys.pairs.iter().find(|p| p.key == key) else { return f64::NAN };
            let base = sys.aux_base + AUX_FIXED + 2 * pair.index;
            return match q {
                "slide" => x[base],
                "heat" => x[base + 1],
                _ => f64::NAN,
            };
        }
        let poses = &self.sol.poses;
        if head == "system" {
            let e = energy(sys, x, poses);
            let (mut px, mut py) = (0.0, 0.0);
            for &g in &model.dynamic {
                let b = &model.bodies[g];
                let i = b.index as usize;
                px += b.mass * x[3 * n + 3 * i];
                py += b.mass * x[3 * n + 3 * i + 1];
            }
            return match q {
                "ek" => e.kinetic,
                "ep" => e.gravity,
                "es" => e.spring,
                "e" => e.total,
                "eE" => e.electric,
                "px" => px,
                "py" => py,
                // 26.54 (D87)
                "Lz" => {
                    let mut l = 0.0;
                    for &g in &model.dynamic {
                        let b = &model.bodies[g];
                        let i = b.index as usize;
                        let (vx, vy) = (x[3 * n + 3 * i], x[3 * n + 3 * i + 1]);
                        l += b.mass * (x[3 * i] * vy - x[3 * i + 1] * vx) + if b.inv_inertia > 0.0 { b.inertia * x[3 * n + 3 * i + 2] } else { 0.0 };
                    }
                    l
                }
                "lagr" => e.kinetic - (e.total - e.kinetic),
                "ham" => e.total,
                "Lz@pivot" => {
                    let Some((pvx, pvy)) = self.meta.pivot else { return f64::NAN };
                    let mut l = 0.0;
                    for &g in &model.dynamic {
                        let b = &model.bodies[g];
                        let i = b.index as usize;
                        let (rx, ry) = (x[3 * i] - pvx, x[3 * i + 1] - pvy);
                        let (vx, vy) = (x[3 * n + 3 * i], x[3 * n + 3 * i + 1]);
                        l += b.mass * (rx * vy - ry * vx) + if b.inv_inertia > 0.0 { b.inertia * x[3 * n + 3 * i + 2] } else { 0.0 };
                    }
                    l
                }
                _ => f64::NAN,
            };
        }
        if head == "ledger" {
            let l = ledger_at(sys, x, self.impact_loss);
            return match q {
                "kinetic" => l.kinetic,
                "gravity" => l.gravity,
                "spring" => l.spring,
                "field" => l.field,
                "mechanical" => l.mechanical,
                "frictionHeat" => l.friction_heat,
                "appliedWork" => l.applied_work,
                "damping" => l.damping,
                "beltWork" => l.belt_work,
                "impactLoss" => l.impact_loss,
                "balance" => l.balance,
                // 26.55
                "fieldWork" => l.extra.map_or(f64::NAN, |e| e[0]),
                "buoyancyWork" => l.extra.map_or(f64::NAN, |e| e[1]),
                "jouleHeat" => l.extra.map_or(f64::NAN, |e| e[2]),
                "liquidHeat" => l.extra.map_or(f64::NAN, |e| e[3]),
                _ => f64::NAN,
            };
        }
        if let Some(k) = model.rails.iter().position(|r| r.id == head) {
            let (emf, i, f) = crate::regions::rail_values(model, k, poses);
            return match q {
                "emf" => emf,
                "I" => i,
                "F" => f,
                "P" => emf * i,
                _ => f64::NAN,
            };
        }
        if let Some(body) = model.bodies.iter().find(|b| b.id == head) {
            if !body.dynamic {
                return self.connector_value(head, q);
            }
            let i = body.index as usize;
            let (vx, vy, w) = (x[3 * n + 3 * i], x[3 * n + 3 * i + 1], x[3 * n + 3 * i + 2]);
            let (ax, ay) = (self.sol.acc[3 * i], self.sol.acc[3 * i + 1]);
            let g = model.settings.gravity;
            return match q {
                "x" => x[3 * i],
                "y" => x[3 * i + 1],
                "angle" => x[3 * i + 2],
                "vx" => vx,
                "vy" => vy,
                "v" => (vx * vx + vy * vy).sqrt(),
                "omega" => w,
                "ax" => ax,
                "ay" => ay,
                "a" => (ax * ax + ay * ay).sqrt(),
                "alpha" => self.sol.acc[3 * i + 2],
                "ek" => 0.5 * body.mass * (vx * vx + vy * vy) + if body.inv_inertia > 0.0 { 0.5 * body.inertia * w * w } else { 0.0 },
                "ep" => -body.mass * (g.x * x[3 * i] + g.y * (x[3 * i + 1] - model.settings.energy_zero_y)),
                "px" => body.mass * vx,
                "py" => body.mass * vy,
                "P" => body.mass * (ax * vx + ay * vy) + if body.inv_inertia > 0.0 { body.inertia * self.sol.acc[3 * i + 2] * w } else { 0.0 },
                "fd" => {
                    let sp = (vx * vx + vy * vy).sqrt();
                    (body.drag_lin + body.drag_quad * sp) * sp
                }
                "Fg" => {
                    let (mut fx, mut fy) = (0.0, 0.0);
                    let p = &poses[body.global];
                    for &og in &model.attractors {
                        if og == body.global {
                            continue;
                        }
                        let o = &model.bodies[og];
                        let (pox, poy) = if o.dynamic { (poses[og].x, poses[og].y) } else { (o.grav_pos.x, o.grav_pos.y) };
                        let (dx, dy) = (pox - p.x, poy - p.y);
                        let d2 = dx * dx + dy * dy;
                        if !(d2 > 0.0) {
                            continue;
                        }
                        let d = d2.sqrt();
                        let r = body.bound + o.bound;
                        let f = if d >= r { model.g_const * body.attract * o.attract / d2 } else { model.g_const * body.attract * o.attract * d / (r * r * r) };
                        fx += f * dx / d;
                        fy += f * dy / d;
                    }
                    (fx * fx + fy * fy).sqrt()
                }
                // 26.54 (D78)
                "q" => body.charge,
                "FE" | "FB" | "Fc" if model.electric => {
                    let parts = crate::dynamics::electric_parts(model, poses, body.global);
                    let (fx, fy) = parts[match q {
                        "FE" => 0,
                        "FB" => 1,
                        _ => 2,
                    }];
                    (fx * fx + fy * fy).sqrt()
                }
                // 26.55 (D92)
                "Fb" => crate::regions::buoyancy_of(model, body.global, poses).0,
                "Asub" => crate::regions::buoyancy_of(model, body.global, poses).1,
                // gauge pressure ρgh of the liquid at the body's centre (0 outside every liquid)
                "pl" => {
                    let gm = (g.x * g.x + g.y * g.y).sqrt();
                    let (px, py) = (x[3 * i], x[3 * i + 1]);
                    let mut p = 0.0;
                    for l in &model.liquids {
                        if px >= l.x0 && px <= l.x1 && py >= l.y0 && py <= l.y1 {
                            p += l.rho * gm * (l.y1 - py);
                        }
                    }
                    p
                }
                "Vsub" => {
                    let mut v = 0.0;
                    for l in &model.liquids {
                        v += crate::regions::submerged(model, body.global, &poses[body.global], l).0 * l.depth;
                    }
                    v
                }
                // 26.55 (D92b): useful work = rise of this body's gravitational potential energy since the start; total
                // work = work of the applied forces and motors since the start (the ledger)
                "Wuse" | "eta" => {
                    let wuse = -body.mass * (g.x * (x[3 * i] - body.def_position.x) + g.y * (x[3 * i + 1] - body.def_position.y));
                    if q == "Wuse" {
                        wuse
                    } else {
                        let l = ledger_at(sys, x, self.impact_loss);
                        let (w0, b0) = model.settings.start_ledger.as_ref().map_or((0.0, 0.0), |s| (s.applied_work, s.belt_work));
                        let total = (l.applied_work - w0) + (l.belt_work - b0);
                        if total.abs() > 1e-12 { wuse / total } else { f64::NAN }
                    }
                }
                "angle@pivot" => match self.meta.pivot {
                    None => f64::NAN,
                    Some((pvx, pvy)) => atan2(x[3 * i] - pvx, pvy - x[3 * i + 1]),
                },
                _ => f64::NAN,
            };
        }
        self.connector_value(head, q)
    }

    fn connector_value(&self, head: &str, q: &str) -> f64 {
        let sys = self.sys;
        let model = &sys.model;
        let poses = &self.sol.poses;
        if let Some(ri) = model.ropes.iter().position(|r| r.id == head) {
            if q == "T" {
                return self.sol.rope_tension[ri];
            }
            if q == "len" {
                return rope_path(model, poses, &model.ropes[ri]).length;
            }
        }
        if let Some(sp) = model.springs.iter().find(|s| s.id == head) {
            let (d, ux, uy) = distance_kin(model, poses, &sp.a, &sp.b);
            let ext = d.value - sp.rest_length;
            if q == "x" {
                return ext;
            }
            if q == "F" {
                let pa = anchor_state(poses, &sp.a);
                let pb = anchor_state(poses, &sp.b);
                let vrel = ux * (pa.vx - pb.vx) + uy * (pa.vy - pb.vy);
                return sp.stiffness * ext + sp.cubic * ext * ext * ext + sp.damping * vrel;
            }
        }
        if let Some(wi) = model.welds.iter().position(|w| w.id == head) {
            if q == "F" {
                return hypot(self.row_lambda(RowKind::Weld, wi, 0), self.row_lambda(RowKind::Weld, wi, 1));
            }
            if q == "M" {
                return self.row_lambda(RowKind::Weld, wi, 2);
            }
        }
        if let Some(mi) = model.motors.iter().position(|m| m.id == head) {
            let mo = &model.motors[mi];
            let wa = mo.a.body.map(|g| poses[g].w).unwrap_or(0.0);
            let wb = mo.b.body.map(|g| poses[g].w).unwrap_or(0.0);
            let m = if mo.torque_mode { mo.torque } else { self.row_lambda(RowKind::Drive, mi, 2) };
            match q {
                "M" => return m,
                "P" => return m * (wb - wa),
                "w" => return wb - wa,
                "F" => return hypot(self.row_lambda(RowKind::Motor, mi, 0), self.row_lambda(RowKind::Motor, mi, 1)),
                _ => {}
            }
        }
        if let Some(si) = model.sliders.iter().position(|s| s.id == head) {
            let sl = &model.sliders[si];
            if q == "N" {
                return self.row_lambda(RowKind::Slider, si, 0).abs();
            }
            if q == "s" {
                let pa = anchor_state(poses, &sl.a);
                let pb = anchor_state(poses, &sl.b);
                let a = sl.a.body.filter(|&g| model.bodies[g].dynamic).map(|g| &poses[g]);
                let (ax, ay) = match a {
                    Some(p) => (p.c * sl.axis.x - p.s * sl.axis.y, p.s * sl.axis.x + p.c * sl.axis.y),
                    None => (sl.axis.x, sl.axis.y),
                };
                return ax * (pb.px - pa.px) + ay * (pb.py - pa.py);
            }
        }
        if let Some(gi) = model.gears.iter().position(|g| g.id == head) {
            if q == "M" {
                return self.row_lambda(RowKind::Gear, gi, 0);
            }
        }
        if let Some(hi) = model.hinges.iter().position(|h| h.id == head) {
            let (mut fx, mut fy) = (0.0, 0.0);
            for (k, r) in self.sol.rows.iter().enumerate() {
                if r.kind != RowKind::Hinge || r.owner != hi {
                    continue;
                }
                if r.sub == 0 {
                    fx = self.sol.lambda[k];
                } else {
                    fy = self.sol.lambda[k];
                }
            }
            match q {
                "Fx" => return fx,
                "Fy" => return fy,
                "F" => return (fx * fx + fy * fy).sqrt(),
                _ => {}
            }
        }
        if let Some(ri) = model.rods.iter().position(|r| r.id == head) {
            if q == "F" {
                let mut f = 0.0;
                for (k, r) in self.sol.rows.iter().enumerate() {
                    if r.kind == RowKind::Rod && r.owner == ri {
                        f = -self.sol.lambda[k];
                    }
                }
                return f;
            }
        }
        if let Some(fi) = model.forces.iter().position(|f| f.id == head) {
            let f = &model.forces[fi];
            if f.a.body.is_some_and(|g| model.bodies[g].dynamic) {
                let Ok((fx, fy)) = force_value(sys, fi, self.x, self.mode.sw.as_deref()) else { return f64::NAN };
                return match q {
                    "Fx" => fx,
                    "Fy" => fy,
                    "F" => (fx * fx + fy * fy).sqrt(),
                    "P" => {
                        let p = anchor_state(poses, &f.a);
                        fx * p.vx + fy * p.vy
                    }
                    _ => f64::NAN,
                };
            }
        }
        f64::NAN
    }
}

/// Observation of recorded frame k.
pub fn frame_observation<'a>(s: &'a mut Session, k: u64, x: &'a mut Vec<f64>) -> SimResult<(usize, f64)> {
    let seg = s.segment(k)?;
    let loss = s.impact_loss(k)?;
    x.clear();
    x.extend_from_slice(s.state(k)?);
    Ok((seg, loss))
}

/// Values of quantities at frames from..=to (stride), one solve per frame: times and one series per id.
pub fn quantity_series(s: &mut Session, ids: &[String], from: u64, to: u64, stride: u64) -> SimResult<(Vec<f64>, Vec<Vec<f64>>)> {
    let stride = stride.max(1);
    let count = if to >= from { ((to - from) / stride + 1) as usize } else { 0 };
    let mut t = Vec::with_capacity(count);
    let mut values: Vec<Vec<f64>> = ids.iter().map(|_| Vec::with_capacity(count)).collect();
    let sys = s.system.clone();
    let meta = s.meta.clone();
    let customs = s.customs().to_vec();
    let mut x = Vec::new();
    for c in 0..count as u64 {
        let k = from + c * stride;
        let (seg, loss) = frame_observation(s, k, &mut x)?;
        let mode = s.segments[seg].mode.clone();
        let obs = Observation::new(&sys, &meta, &customs, &x, &mode, loss, Some(k as f64 * s.dt))?;
        t.push(k as f64 * s.dt);
        for (j, id) in ids.iter().enumerate() {
            values[j].push(obs.value(id));
        }
    }
    Ok((t, values))
}

/// The custom-quantity compile errors of the scene, for the editor: [{ id, error }].
pub fn custom_errors(customs: &[CustomEntry]) -> Value {
    Value::Array(
        customs
            .iter()
            .map(|c| json!({ "id": c.def.id, "unit": c.compiled.as_ref().map(|x| x.unit.clone()), "error": c.error.as_ref().map(|e| e.to_json()) }))
            .collect(),
    )
}
