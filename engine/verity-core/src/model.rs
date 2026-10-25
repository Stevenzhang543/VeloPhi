//! Compiled model (port of `src/core/solver/model.ts`): the scene turned into what the solver needs. Bodies,
//! pulleys and dynamic bodies are referred to by index (`global` index into `bodies`, dynamic slot `index`).

use crate::dmath::{cos, sin};
use crate::expr::{ExprArena, ENV_SIZE};
use crate::js::{js_max, js_min};
use crate::message::{Message, SimResult};
use crate::scene::{BodyDef, BodyKind, ConnectorKind, Material, Scene, SceneSettings, ShapeDef, Vec2, Wrap};

/// Compiled shape of a body.
#[derive(Clone, Debug)]
pub enum ShapeModel {
    Circle {
        radius: f64,
    },
    /// Counter-clockwise vertices, outward edge normals and edge lengths.
    Polygon {
        verts: Vec<Vec2>,
        normals: Vec<Vec2>,
        lengths: Vec<f64>,
    },
}

/// A body compiled for the solver.
#[derive(Clone, Debug)]
pub struct BodyModel {
    /// Index in `Model::bodies`.
    pub global: usize,
    /// Index among dynamic bodies (state slot), −1 for static bodies.
    pub index: i32,
    pub id: String,
    pub name: String,
    pub dynamic: bool,
    pub shape: ShapeModel,
    pub mass: f64,
    pub inertia: f64,
    pub inv_mass: f64,
    pub inv_inertia: f64,
    pub material: Material,
    /// Conveyor belt speed (m/s); 0 for dynamic bodies.
    pub belt_speed: f64,
    /// Radius of a circle around the body origin containing the shape (broad phase).
    pub bound: f64,
    pub static_pos: Vec2,
    pub static_angle: f64,
    pub static_c: f64,
    pub static_s: f64,
    /// Initial state from the scene.
    pub def_position: Vec2,
    pub def_angle: f64,
    pub def_velocity: Vec2,
    pub def_angular_velocity: f64,
}

/// Anchor resolved to its body (global index; None: the world).
#[derive(Clone, Copy, Debug)]
pub struct AnchorModel {
    pub body: Option<usize>,
    pub local: Vec2,
}

/// Pulley: fixed at `position` (world) or carried by dynamic body `body` (`position` in its coordinates).
#[derive(Clone, Debug)]
pub struct PulleyModel {
    pub id: String,
    pub name: String,
    pub position: Vec2,
    pub radius: f64,
    pub body: Option<usize>,
}

/// Compiled rope; `wrap` is +1 for counter-clockwise, −1 for clockwise.
#[derive(Clone, Debug)]
pub struct RopeModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub b: AnchorModel,
    /// (pulley index, wrap)
    pub pulleys: Vec<(usize, f64)>,
    /// NaN until build_system resolves it.
    pub length: f64,
    pub movable: bool,
}

/// Compiled rod.
#[derive(Clone, Debug)]
pub struct RodModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub b: AnchorModel,
    pub length: f64,
}

/// Compiled spring.
#[derive(Clone, Debug)]
pub struct SpringModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub b: AnchorModel,
    pub stiffness: f64,
    pub rest_length: f64,
    pub damping: f64,
}

/// Compiled pin joint.
#[derive(Clone, Debug)]
pub struct HingeModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub b: AnchorModel,
}

/// Compiled applied force; `expr` holds the arena roots of the x and y components.
#[derive(Clone, Debug)]
pub struct ForceModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub force: Vec2,
    pub expr: Option<(usize, usize)>,
}

/// The compiled model of a scene.
#[derive(Clone, Debug)]
pub struct Model {
    pub settings: SceneSettings,
    pub bodies: Vec<BodyModel>,
    /// Global indices of the dynamic bodies, by dynamic slot.
    pub dynamic: Vec<usize>,
    pub pulleys: Vec<PulleyModel>,
    pub ropes: Vec<RopeModel>,
    pub rods: Vec<RodModel>,
    pub springs: Vec<SpringModel>,
    pub hinges: Vec<HingeModel>,
    pub forces: Vec<ForceModel>,
    pub n: usize,
    /// Pair keys of bodies that never collide (joined by a hinge), in insertion order.
    pub no_collide: Vec<String>,
    /// Compiled expressions and the switch list.
    pub arena: ExprArena,
    /// Force index of each switch.
    pub switch_force: Vec<usize>,
    pub has_expr: bool,
    pub force_scale: f64,
    pub accel_scale: f64,
    pub warnings: Vec<Message>,
    /// Pair material overrides (scene.contactPairs).
    pub contact_pairs: Vec<crate::scene::ContactPairDef>,
    /// Some static body has a belt speed ≠ 0 (scene.bodies.some(…)).
    pub running_belt: bool,
    /// 1 / mass and 1 / inertia by dynamic slot.
    pub dyn_inv_mass: Vec<f64>,
    pub dyn_inv_inertia: Vec<f64>,
}

/// JavaScript string comparison `a < b` (UTF-16 code units).
pub fn js_str_lt(a: &str, b: &str) -> bool {
    a.encode_utf16().lt(b.encode_utf16())
}

/// Order-independent key of a body pair.
pub fn pair_key(a: &str, b: &str) -> String {
    if js_str_lt(a, b) {
        format!("{a}|{b}")
    } else {
        format!("{b}|{a}")
    }
}

fn cross(a: Vec2, b: Vec2) -> f64 {
    a.x * b.y - a.y * b.x
}
fn dot(a: Vec2, b: Vec2) -> f64 {
    a.x * b.x + a.y * b.y
}
fn sub(a: Vec2, b: Vec2) -> Vec2 {
    Vec2 { x: a.x - b.x, y: a.y - b.y }
}
fn length(a: Vec2) -> f64 {
    (a.x * a.x + a.y * a.y).sqrt()
}

fn box_polygon(width: f64, height: f64) -> Vec<Vec2> {
    let w = width / 2.0;
    let h = height / 2.0;
    vec![Vec2::new(-w, -h), Vec2::new(w, -h), Vec2::new(w, h), Vec2::new(-w, h)]
}

fn polygon_area(points: &[Vec2]) -> f64 {
    let mut a = 0.0;
    for i in 0..points.len() {
        a += cross(points[i], points[(i + 1) % points.len()]);
    }
    a / 2.0
}

/// Area centroid of a polygon; the origin for a degenerate one.
pub fn polygon_centroid(points: &[Vec2]) -> Vec2 {
    let mut a = 0.0;
    let mut cx = 0.0;
    let mut cy = 0.0;
    for i in 0..points.len() {
        let p = points[i];
        let q = points[(i + 1) % points.len()];
        let c = cross(p, q);
        a += c;
        cx += (p.x + q.x) * c;
        cy += (p.y + q.y) * c;
    }
    if a == 0.0 {
        Vec2::default()
    } else {
        Vec2 { x: cx / (3.0 * a), y: cy / (3.0 * a) }
    }
}

/// Moment of inertia of a uniform shape about its centre of mass (kg·m²).
pub fn shape_inertia(shape: &ShapeDef, mass: f64) -> f64 {
    match shape {
        ShapeDef::Circle { radius } => 0.5 * mass * radius * radius,
        ShapeDef::Box { width, height } => mass * (width * width + height * height) / 12.0,
        ShapeDef::Polygon { points } => {
            let c = polygon_centroid(points);
            let pts: Vec<Vec2> = points.iter().map(|p| sub(*p, c)).collect();
            let mut num = 0.0;
            let mut den = 0.0;
            for i in 0..pts.len() {
                let p = pts[i];
                let q = pts[(i + 1) % pts.len()];
                let cr = cross(p, q);
                num += cr * (dot(p, p) + dot(p, q) + dot(q, q));
                den += cr;
            }
            if den == 0.0 {
                0.0
            } else {
                mass * num / (6.0 * den)
            }
        }
    }
}

fn compile_shape(shape: &ShapeDef, dynamic: bool, warnings: &mut Vec<Message>, name: &str) -> ShapeModel {
    let mut verts = match shape {
        ShapeDef::Circle { radius } => return ShapeModel::Circle { radius: *radius },
        ShapeDef::Box { width, height } => box_polygon(*width, *height),
        ShapeDef::Polygon { points } => points.clone(),
    };
    if polygon_area(&verts) < 0.0 {
        verts.reverse();
    }
    if dynamic && matches!(shape, ShapeDef::Polygon { .. }) {
        let c = polygon_centroid(&verts);
        if c.x.abs() > 1e-12 || c.y.abs() > 1e-12 {
            warnings.push(Message::new("warn.polygonCentred").text("body", name));
            verts = verts.iter().map(|p| sub(*p, c)).collect();
        }
    }
    let mut normals = Vec::with_capacity(verts.len());
    let mut lengths = Vec::with_capacity(verts.len());
    for i in 0..verts.len() {
        let e = sub(verts[(i + 1) % verts.len()], verts[i]);
        let l = length(e);
        lengths.push(l);
        normals.push(if l > 0.0 { Vec2 { x: e.y / l, y: -e.x / l } } else { Vec2::default() });
    }
    ShapeModel::Polygon { verts, normals, lengths }
}

fn bound_radius(shape: &ShapeModel) -> f64 {
    match shape {
        ShapeModel::Circle { radius } => *radius,
        ShapeModel::Polygon { verts, .. } => {
            let mut r = 0.0;
            for v in verts {
                r = js_max(r, length(*v));
            }
            r
        }
    }
}

fn find_body(bodies: &[BodyModel], id: &str) -> Option<usize> {
    // Map semantics of the TypeScript byId: the last body with the id wins (ids are unique after validation)
    bodies.iter().rposition(|b| b.id == id)
}

/// Compile a scene into the solver model.
pub fn compile_model(scene: &Scene) -> SimResult<Model> {
    let mut warnings = Vec::new();
    let mut bodies: Vec<BodyModel> = Vec::new();
    let mut dynamic: Vec<usize> = Vec::new();
    for def in &scene.bodies {
        let is_dynamic = def.kind != BodyKind::Static;
        let shape = compile_shape(&def.shape, is_dynamic, &mut warnings, &def.name);
        let mass = if is_dynamic { js_max(def.mass, 1e-12) } else { 0.0 };
        let fixed = def.kind == BodyKind::Particle || def.fixed_rotation;
        let inertia = if is_dynamic { def.inertia.unwrap_or_else(|| shape_inertia(&def.shape, mass)) } else { 0.0 };
        let bound = bound_radius(&shape);
        let model = body_model(def, bodies.len(), if is_dynamic { dynamic.len() as i32 } else { -1 }, shape, mass, inertia, fixed, bound);
        if def.material.mu_s < def.material.mu_k {
            warnings.push(Message::new("warn.muSBelowMuK").text("body", def.name.clone()));
        }
        if is_dynamic {
            dynamic.push(bodies.len());
        }
        bodies.push(model);
    }
    let anchor = |a: &crate::scene::Anchor| AnchorModel { body: a.body.as_deref().and_then(|id| find_body(&bodies, id)), local: a.local };
    let mut pulleys = Vec::new();
    for p in &scene.pulleys {
        let carrier = p.body.as_deref().and_then(|id| find_body(&bodies, id));
        if let Some(ci) = carrier.filter(|&ci| !bodies[ci].dynamic) {
            let cb = &bodies[ci];
            let c = cos(cb.static_angle);
            let s = sin(cb.static_angle);
            let position = Vec2 { x: cb.static_pos.x + c * p.position.x - s * p.position.y, y: cb.static_pos.y + s * p.position.x + c * p.position.y };
            pulleys.push(PulleyModel { id: p.id.clone(), name: p.name.clone(), position, radius: js_max(0.0, p.radius), body: None });
        } else {
            pulleys.push(PulleyModel { id: p.id.clone(), name: p.name.clone(), position: p.position, radius: js_max(0.0, p.radius), body: carrier });
        }
    }
    let pulley_by_id = |id: &str| pulleys.iter().rposition(|p| p.id == id);
    let mut arena = ExprArena::default();
    let mut switch_force = Vec::new();
    let mut ropes = Vec::new();
    let mut rods = Vec::new();
    let mut springs = Vec::new();
    let mut hinges = Vec::new();
    let mut forces: Vec<ForceModel> = Vec::new();
    let mut no_collide: Vec<String> = Vec::new();
    for c in &scene.connectors {
        match &c.kind {
            ConnectorKind::Rope { a, b, pulleys: list, length } => {
                let list: Vec<(usize, f64)> =
                    list.iter().filter_map(|(pid, wrap)| pulley_by_id(pid).map(|pi| (pi, if *wrap == Wrap::Ccw { 1.0 } else { -1.0 }))).collect();
                let movable = list.iter().any(|(pi, _)| pulleys[*pi].body.is_some());
                ropes.push(RopeModel {
                    id: c.id.clone(),
                    name: c.name.clone(),
                    a: anchor(a),
                    b: anchor(b),
                    pulleys: list,
                    length: length.unwrap_or(f64::NAN),
                    movable,
                });
            }
            ConnectorKind::Rod { a, b, length } => {
                rods.push(RodModel { id: c.id.clone(), name: c.name.clone(), a: anchor(a), b: anchor(b), length: length.unwrap_or(f64::NAN) });
            }
            ConnectorKind::Spring { a, b, stiffness, rest_length, damping } => springs.push(SpringModel {
                id: c.id.clone(),
                name: c.name.clone(),
                a: anchor(a),
                b: anchor(b),
                stiffness: *stiffness,
                rest_length: rest_length.unwrap_or(f64::NAN),
                damping: *damping,
            }),
            ConnectorKind::Hinge { a, b } => {
                hinges.push(HingeModel { id: c.id.clone(), name: c.name.clone(), a: anchor(a), b: anchor(b) });
                if let (Some(x), Some(y)) = (&a.body, &b.body) {
                    let key = pair_key(x, y);
                    if !no_collide.contains(&key) {
                        no_collide.push(key);
                    }
                }
            }
            ConnectorKind::Force { a, force, expr } => {
                let mut compiled = None;
                if let Some((ex, ey)) = expr {
                    let before = arena.switches.len();
                    let x = arena.compile_force_expr(ex)?;
                    for _ in before..arena.switches.len() {
                        switch_force.push(forces.len());
                    }
                    let before = arena.switches.len();
                    let y = arena.compile_force_expr(ey)?;
                    for _ in before..arena.switches.len() {
                        switch_force.push(forces.len());
                    }
                    compiled = Some((x, y));
                }
                forces.push(ForceModel { id: c.id.clone(), name: c.name.clone(), a: anchor(a), force: *force, expr: compiled });
            }
        }
    }
    let gv = scene.settings.gravity;
    let g = (gv.x * gv.x + gv.y * gv.y).sqrt();
    let mut force_scale = 0.0;
    for &bi in &dynamic {
        force_scale += bodies[bi].mass * js_max(g, 1.0);
    }
    for f in &forces {
        let Some((ex, ey)) = f.expr else {
            force_scale += (f.force.x * f.force.x + f.force.y * f.force.y).sqrt();
            continue;
        };
        let Some(bi) = f.a.body else { continue };
        let body = &bodies[bi];
        if !body.dynamic {
            continue;
        }
        let mut env = [0.0; ENV_SIZE];
        env[1] = body.def_position.x;
        env[2] = body.def_position.y;
        env[3] = body.def_velocity.x;
        env[4] = body.def_velocity.y;
        env[5] = (body.def_velocity.x * body.def_velocity.x + body.def_velocity.y * body.def_velocity.y).sqrt();
        env[6] = body.def_angle;
        env[7] = if body.inv_inertia > 0.0 { body.def_angular_velocity } else { 0.0 };
        env[8] = body.mass;
        env[9] = g;
        let fx = arena.eval(ex, &env, None);
        let fy = arena.eval(ey, &env, None);
        let size = (fx * fx + fy * fy).sqrt();
        if size.is_finite() {
            force_scale += size;
        }
    }
    for s in &springs {
        force_scale += s.stiffness * 0.1;
    }
    force_scale = js_max(force_scale, 1e-6);
    let accel_scale = js_max(g, 1.0);
    let has_expr = forces.iter().any(|f| f.expr.is_some());
    let dyn_inv_mass = dynamic.iter().map(|&g| bodies[g].inv_mass).collect();
    let dyn_inv_inertia = dynamic.iter().map(|&g| bodies[g].inv_inertia).collect();
    let running_belt = scene.bodies.iter().any(|b| b.kind == BodyKind::Static && b.belt_speed != 0.0);
    Ok(Model {
        settings: scene.settings.clone(),
        n: dynamic.len(),
        bodies,
        dynamic,
        pulleys,
        ropes,
        rods,
        springs,
        hinges,
        forces,
        no_collide,
        arena,
        switch_force,
        has_expr,
        force_scale,
        accel_scale,
        warnings,
        contact_pairs: scene.contact_pairs.clone(),
        running_belt,
        dyn_inv_mass,
        dyn_inv_inertia,
    })
}

#[allow(clippy::too_many_arguments)]
fn body_model(def: &BodyDef, global: usize, index: i32, shape: ShapeModel, mass: f64, inertia: f64, fixed: bool, bound: f64) -> BodyModel {
    let is_dynamic = def.kind != BodyKind::Static;
    BodyModel {
        global,
        index,
        id: def.id.clone(),
        name: def.name.clone(),
        dynamic: is_dynamic,
        shape,
        mass,
        inertia,
        inv_mass: if is_dynamic { 1.0 / mass } else { 0.0 },
        inv_inertia: if is_dynamic && !fixed && inertia > 0.0 { 1.0 / inertia } else { 0.0 },
        material: def.material,
        belt_speed: if def.kind == BodyKind::Static { def.belt_speed } else { 0.0 },
        bound,
        static_pos: def.position,
        static_angle: def.angle,
        static_c: cos(def.angle),
        static_s: sin(def.angle),
        def_position: def.position,
        def_angle: def.angle,
        def_velocity: def.velocity,
        def_angular_velocity: def.angular_velocity,
    }
}

/// Effective friction and restitution of a pair: the pair override, else the smaller of the two bodies' values.
pub fn pair_material(model: &Model, a: &BodyModel, b: &BodyModel) -> Material {
    for p in &model.contact_pairs {
        if (p.a == a.id && p.b == b.id) || (p.a == b.id && p.b == a.id) {
            return Material { mu_s: p.mu_s, mu_k: p.mu_k, restitution: p.restitution };
        }
    }
    Material {
        mu_s: js_min(a.material.mu_s, b.material.mu_s),
        mu_k: js_min(a.material.mu_k, b.material.mu_k),
        restitution: js_min(a.material.restitution, b.material.restitution),
    }
}
