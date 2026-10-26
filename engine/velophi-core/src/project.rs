//! Constraint projection and removal of initial overlaps (port of `src/core/solver/project.ts`).

use crate::dynamics::{add_row, build_rows_into, row_minv_row, tol, Mode, ModeSolution, RowKind, System};
use crate::js::js_max;
use crate::kinematics::{compute_poses, compute_poses_into, contact_kin, probe_value, Pose, RowJ};
use crate::linalg::solve_dense;
use crate::modes::in_region;

/// Largest position- and velocity-level constraint errors corrected by `project`.
#[derive(Clone, Copy, Debug, Default)]
pub struct ProjectionInfo {
    pub position: f64,
    pub velocity: f64,
}

/// Mass-weighted correction Δq = −M⁻¹Jᵀ(JM⁻¹Jᵀ)⁻¹·err; None for no rows.
pub fn correction(sys: &System, rows: &[(&RowJ, f64)]) -> Option<Vec<f64>> {
    let m = rows.len();
    if m == 0 {
        return None;
    }
    let mut w = vec![0.0; m * m];
    let mut b = vec![0.0; m];
    for r in 0..m {
        for k in 0..m {
            w[r * m + k] = row_minv_row(&sys.model, rows[r].0, rows[k].0);
        }
        b[r] = -rows[r].1;
    }
    let res = solve_dense(m, &w, &b, 1e-12);
    let mut g = vec![0.0; 3 * sys.n];
    for (i, r) in rows.iter().enumerate() {
        add_row(&mut g, r.0, res.x[i]);
    }
    for i in 0..sys.n {
        let im = sys.model.dyn_inv_mass[i];
        let ii = sys.model.dyn_inv_inertia[i];
        g[3 * i] *= im;
        g[3 * i + 1] *= im;
        g[3 * i + 2] *= ii;
    }
    Some(g)
}

/// Reusable buffers of `project`.
#[derive(Default, Clone, Debug)]
pub struct ProjectScratch {
    poses: Vec<Pose>,
    rows: ModeSolution,
}

/// Project X onto the constraints of the mode. Returns None when nothing needed correcting (X stays as it
/// is), otherwise the corrected copy; `info` records the largest errors corrected.
pub fn project(sys: &System, x_in: &[f64], mode: &Mode, info: &mut ProjectionInfo, scratch: &mut ProjectScratch) -> Option<Vec<f64>> {
    let n = sys.n;
    let mut x: Option<Vec<f64>> = None;
    for _ in 0..4 {
        let cur = x.as_deref().unwrap_or(x_in);
        compute_poses_into(&sys.model, cur, &mut scratch.poses);
        build_rows_into(sys, &scratch.poses, mode, &mut scratch.rows);
        let rows = &scratch.rows.rows;
        let mut worst = 0.0;
        // Tangent rows, motor drives (26.51) and rolling rest (26.52) have no position-level constraint
        for r in rows.iter().filter(|r| r.kind != RowKind::Tangent && r.kind != RowKind::Drive && r.kind != RowKind::Roll) {
            worst = js_max(worst, r.value.abs());
        }
        if worst <= tol::DRIFT {
            break;
        }
        let pr: Vec<(&RowJ, f64)> =
            rows.iter().filter(|r| r.kind != RowKind::Tangent && r.kind != RowKind::Drive && r.kind != RowKind::Roll).map(|r| (&r.j, r.value)).collect();
        let Some(d) = correction(sys, &pr) else { break };
        let xs = x.get_or_insert_with(|| x_in.to_vec());
        for k in 0..3 * n {
            xs[k] += d[k];
        }
        info.position = js_max(info.position, worst);
    }
    for _ in 0..2 {
        let cur = x.as_deref().unwrap_or(x_in);
        compute_poses_into(&sys.model, cur, &mut scratch.poses);
        build_rows_into(sys, &scratch.poses, mode, &mut scratch.rows);
        let rows = &scratch.rows.rows;
        let mut worst = 0.0;
        for r in rows {
            worst = js_max(worst, r.vel.abs());
        }
        if worst <= tol::VEL_DRIFT {
            break;
        }
        let vr: Vec<(&RowJ, f64)> = rows.iter().map(|r| (&r.j, r.vel)).collect();
        let Some(d) = correction(sys, &vr) else { break };
        let xs = x.get_or_insert_with(|| x_in.to_vec());
        for k in 0..3 * n {
            xs[3 * n + k] += d[k];
        }
        info.velocity = js_max(info.velocity, worst);
    }
    x
}

/// Result of resolve_initial_overlap.
pub struct Overlap {
    pub x: Vec<f64>,
    pub removed: f64,
    /// "A–B" body names of pairs overlapping deeper than the limit.
    pub deep: Vec<String>,
}

/// Remove initial overlaps up to `limit` by projecting the penetrating points to zero gap.
pub fn resolve_initial_overlap(sys: &System, x_in: &[f64], limit: f64) -> Overlap {
    let model = &sys.model;
    let mut x = x_in.to_vec();
    let mut removed = 0.0;
    for _ in 0..20 {
        let poses = compute_poses(model, &x);
        let mut best: Vec<(String, RowJ, f64)> = Vec::new();
        for pair in &sys.pairs {
            let mut inside: Vec<&str> = Vec::new();
            for p in &pair.probes {
                let v = probe_value(model, p, &poses);
                if v < -tol::DRIFT && v >= -limit && !inside.contains(&p.key.as_str()) {
                    inside.push(&p.key);
                }
            }
            if inside.is_empty() {
                continue;
            }
            for f in &pair.features {
                let key = f.probe_key.as_str();
                if !inside.contains(&key) {
                    continue;
                }
                let k = contact_kin(model, f, &poses);
                if !in_region(&k) || k.gap >= -tol::DRIFT || k.gap < -limit {
                    continue;
                }
                match best.iter_mut().find(|b| b.0 == key) {
                    None => best.push((key.to_string(), k.jn, k.gap)),
                    Some(cur) => {
                        if k.gap > cur.2 {
                            cur.1 = k.jn;
                            cur.2 = k.gap;
                        }
                    }
                }
            }
        }
        if best.is_empty() {
            break;
        }
        for b in &best {
            removed = js_max(removed, -b.2);
        }
        let rows: Vec<(&RowJ, f64)> = best.iter().map(|b| (&b.1, b.2)).collect();
        let Some(d) = correction(sys, &rows) else { break };
        for k in 0..3 * sys.n {
            x[k] += d[k];
        }
    }
    if removed == 0.0 {
        x = x_in.to_vec();
    }
    let mut deep = Vec::new();
    let poses = compute_poses(model, &x);
    for pair in &sys.pairs {
        if pair.probes.iter().any(|p| probe_value(model, p, &poses) < -limit) {
            deep.push(format!("{}–{}", model.bodies[pair.x].name, model.bodies[pair.y].name));
        }
    }
    Overlap { x, removed, deep }
}
