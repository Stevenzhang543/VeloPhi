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
    /// Drag coefficients (26.51): linear b (N·s/m) and quadratic c (N·s²/m²); 0 without drag.
    pub drag_lin: f64,
    pub drag_quad: f64,
    /// Gravitating mass (kg; 26.51): the body's mass when gravitation is on (static bodies too), else 0.
    pub attract: f64,
    /// Centre of attraction of a static body (world, m): its area centroid; dynamic bodies use their centre of mass.
    pub grav_pos: Vec2,
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
    /// k₃ of a nonlinear spring (0: linear).
    pub cubic: f64,
    /// A damper (26.51): stiffness 0, no potential energy.
    pub damper: bool,
}

/// Compiled weld; `angle0` (rad) is NaN until build_system resolves it.
#[derive(Clone, Debug)]
pub struct WeldModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub b: AnchorModel,
    pub angle0: f64,
}

/// Compiled slider; `axis` is the unit direction in a's body frame (world when a has no dynamic body).
#[derive(Clone, Debug)]
pub struct SliderModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub b: AnchorModel,
    pub axis: Vec2,
    pub free: bool,
    pub angle0: f64,
}

/// Compiled motor (a pin joint with a drive).
#[derive(Clone, Debug)]
pub struct MotorModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub b: AnchorModel,
    pub torque_mode: bool,
    pub speed: f64,
    pub torque: f64,
}

/// Compiled gear: ω_a + ratio·ω_b = 0 between dynamic bodies (None: the world); `offset0` resolved at build.
#[derive(Clone, Debug)]
pub struct GearModel {
    pub id: String,
    pub name: String,
    pub a: Option<usize>,
    pub b: Option<usize>,
    pub ratio: f64,
    pub offset0: f64,
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
    /// Connectors of 26.51 (D51).
    pub welds: Vec<WeldModel>,
    pub sliders: Vec<SliderModel>,
    pub motors: Vec<MotorModel>,
    pub gears: Vec<GearModel>,
    /// Gravitational constant when gravitation is on (26.51, D50), else 0.
    pub g_const: f64,
    /// Global indices of the bodies with a gravitating mass, in scene order.
    pub attractors: Vec<usize>,
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
        let mut model = body_model(def, bodies.len(), if is_dynamic { dynamic.len() as i32 } else { -1 }, shape, mass, inertia, fixed, bound);
        model.attract = if scene.settings.gravitation.is_some() && def.mass > 0.0 { def.mass } else { 0.0 };
        if !is_dynamic {
            if let ShapeModel::Polygon { verts, .. } = &model.shape {
                // Centre of attraction of a static polygon: its centroid in the world
                let c = polygon_centroid(verts);
                model.grav_pos =
                    Vec2 { x: def.position.x + model.static_c * c.x - model.static_s * c.y, y: def.position.y + model.static_s * c.x + model.static_c * c.y };
            }
        }
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
    let mut welds = Vec::new();
    let mut sliders = Vec::new();
    let mut motors = Vec::new();
    let mut gears = Vec::new();
    let mut no_collide: Vec<String> = Vec::new();
    let no_collide_add = |a: &crate::scene::Anchor, b: &crate::scene::Anchor, list: &mut Vec<String>| {
        if let (Some(x), Some(y)) = (&a.body, &b.body) {
            let key = pair_key(x, y);
            if !list.contains(&key) {
                list.push(key);
            }
        }
    };
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
            ConnectorKind::Spring { a, b, stiffness, rest_length, damping, cubic } => springs.push(SpringModel {
                id: c.id.clone(),
                name: c.name.clone(),
                a: anchor(a),
                b: anchor(b),
                stiffness: *stiffness,
                rest_length: rest_length.unwrap_or(f64::NAN),
                damping: *damping,
                cubic: *cubic,
                damper: false,
            }),
            ConnectorKind::Damper { a, b, damping } => springs.push(SpringModel {
                id: c.id.clone(),
                name: c.name.clone(),
                a: anchor(a),
                b: anchor(b),
                stiffness: 0.0,
                rest_length: f64::NAN,
                damping: *damping,
                cubic: 0.0,
                damper: true,
            }),
            ConnectorKind::Weld { a, b } => {
                welds.push(WeldModel { id: c.id.clone(), name: c.name.clone(), a: anchor(a), b: anchor(b), angle0: f64::NAN });
                no_collide_add(a, b, &mut no_collide);
            }
            ConnectorKind::Motor { a, b, torque_mode, speed, torque } => {
                motors.push(MotorModel {
                    id: c.id.clone(),
                    name: c.name.clone(),
                    a: anchor(a),
                    b: anchor(b),
                    torque_mode: *torque_mode,
                    speed: *speed,
                    torque: *torque,
                });
                no_collide_add(a, b, &mut no_collide);
            }
            ConnectorKind::Slider { a, b, axis, free } => {
                let am = anchor(a);
                let l = (axis.x * axis.x + axis.y * axis.y).sqrt();
                let mut ax = Vec2 { x: axis.x / l, y: axis.y / l };
                // On a static body (or the world) the axis is fixed in the world
                if let Some(g) = am.body.filter(|&g| !bodies[g].dynamic) {
                    let cb = &bodies[g];
                    ax = Vec2 { x: cb.static_c * ax.x - cb.static_s * ax.y, y: cb.static_s * ax.x + cb.static_c * ax.y };
                }
                sliders.push(SliderModel { id: c.id.clone(), name: c.name.clone(), a: am, b: anchor(b), axis: ax, free: *free, angle0: f64::NAN });
                no_collide_add(a, b, &mut no_collide);
            }
            ConnectorKind::Gear { a, b, ratio } => {
                let ga = a.body.as_deref().and_then(|id| find_body(&bodies, id)).filter(|&g| bodies[g].dynamic);
                let gb = b.body.as_deref().and_then(|id| find_body(&bodies, id)).filter(|&g| bodies[g].dynamic);
                gears.push(GearModel { id: c.id.clone(), name: c.name.clone(), a: ga, b: gb, ratio: *ratio, offset0: f64::NAN });
                // Meshing gears overlap at their teeth: the two bodies do not collide
                no_collide_add(a, b, &mut no_collide);
            }
            ConnectorKind::Hinge { a, b } => {
                hinges.push(HingeModel { id: c.id.clone(), name: c.name.clone(), a: anchor(a), b: anchor(b) });
                no_collide_add(a, b, &mut no_collide);
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
    // 26.51: motors and gravitation add to the force scale (absent in older scenes, so their tolerances are unchanged)
    for m in &motors {
        if m.torque_mode {
            force_scale += m.torque.abs();
        }
    }
    let g_const = scene.settings.gravitation.unwrap_or(0.0);
    let attractors: Vec<usize> = (0..bodies.len()).filter(|&k| bodies[k].attract > 0.0).collect();
    for i in 0..attractors.len() {
        for j in i + 1..attractors.len() {
            let a = &bodies[attractors[i]];
            let b = &bodies[attractors[j]];
            if !a.dynamic && !b.dynamic {
                continue;
            }
            let dx = b.grav_pos.x - a.grav_pos.x;
            let dy = b.grav_pos.y - a.grav_pos.y;
            let d2 = dx * dx + dy * dy;
            let rr = a.bound + b.bound;
            let d = d2.sqrt();
            if d2 > 0.0 {
                force_scale += if d >= rr { g_const * a.attract * b.attract / d2 } else { g_const * a.attract * b.attract * d / (rr * rr * rr) };
            }
        }
    }
    force_scale = js_max(force_scale, 1e-6);
    let mut accel_scale = js_max(g, 1.0);
    if g_const > 0.0 {
        for &bg in &dynamic {
            accel_scale = js_max(accel_scale, force_scale * bodies[bg].inv_mass);
        }
    }
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
        welds,
        sliders,
        motors,
        gears,
        g_const,
        attractors,
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
        drag_lin: match def.drag {
            Some(d) if is_dynamic => js_max(0.0, d.linear),
            _ => 0.0,
        },
        drag_quad: match def.drag {
            Some(d) if is_dynamic => js_max(0.0, d.quadratic),
            _ => 0.0,
        },
        attract: 0.0,
        grav_pos: def.position,
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
