//! Geometric optics (26.54, D81).
//!
//! - **Imaging**: an object arrow on the principal axis in front of a thin lens or a spherical mirror (paraxial):
//!   1/u + 1/v = 1/f with u > 0, v > 0 for a real image (behind a lens, in front of a mirror), f > 0 converging;
//!   magnification m = −v/u. The three special rays are returned as real and virtual (dashed) segments.
//! - **Ray tracing**: rays from sources through flat and spherical mirrors (true geometry, so spherical aberration
//!   is visible), ideal thin lenses (the paraxial rule tan θ' = tan θ − y/f for any ray), glass shapes (polygons,
//!   semicircles, discs; Snell's law, total internal reflection, Fresnel partial reflection, dispersion with Cauchy's
//!   formula n(λ) = A + B/λ² — a white ray splits into red, green and blue at the first dispersive surface) and
//!   screens.

use std::f64::consts::PI;

/// Wavelengths (µm) of the three colour bands (C, e and F lines) and of white light (D line).
pub const BANDS: [f64; 3] = [0.6563, 0.5461, 0.4861];
pub const LAMBDA_D: f64 = 0.5893;

// ---------------------------------------------------------------------------------------------------------------
// Imaging
// ---------------------------------------------------------------------------------------------------------------

/// Optical element of the imaging experiment.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Imager {
    /// Thin lens of focal length f (f > 0 convex, f < 0 concave) at x = 0, light from the left.
    Lens,
    /// Spherical mirror at x = 0 facing left (f > 0 concave, f < 0 convex).
    Mirror,
}

/// A drawn segment: from (x1, y1) to (x2, y2); `virtual_`: a backward extension (dashed).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Seg {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub virtual_: bool,
}

/// Result of the imaging experiment.
#[derive(Clone, Debug, Default)]
pub struct Image {
    /// Image distance (None: object at the focal point, no image).
    pub v: Option<f64>,
    pub m: Option<f64>,
    /// Position of the image tip (x, y) in the drawing (lens or mirror at x = 0, object at x = −u).
    pub tip: Option<(f64, f64)>,
    pub real: bool,
    pub upright: bool,
    /// The three special rays (parallel, central or vertex, focal), each a list of segments.
    pub rays: Vec<Vec<Seg>>,
}

/// Imaging by a thin lens or a mirror of focal length f; object distance u > 0, object height h.
pub fn image(kind: Imager, f: f64, u: f64, h: f64) -> Image {
    let mut out = Image::default();
    if !(u > 0.0) || f == 0.0 || !f.is_finite() {
        return out;
    }
    let at_focus = (u - f).abs() <= 1e-12 * u.max(f.abs());
    let v = if at_focus { None } else { Some(u * f / (u - f)) };
    out.v = v;
    out.m = v.map(|v| -v / u);
    if let (Some(v), Some(m)) = (v, out.m) {
        out.real = v > 0.0;
        out.upright = m > 0.0;
        out.tip = Some((if kind == Imager::Lens { v } else { -v }, m * h));
    }
    // drawing extent
    let reach = 1.4 * [u, v.map(f64::abs).unwrap_or(0.0), 2.0 * f.abs()].iter().fold(0.0f64, |a, &b| a.max(b));
    let t = (-u, h);
    // outgoing ray from p along d to the edge of the drawing
    let out_seg = |p: (f64, f64), d: (f64, f64)| -> Seg {
        let len = 2.0 * reach / d.0.abs().max(0.05);
        Seg { x1: p.0, y1: p.1, x2: p.0 + d.0 * len, y2: p.1 + d.1 * len, virtual_: false }
    };
    let dashed = |a: (f64, f64), b: (f64, f64)| Seg { x1: a.0, y1: a.1, x2: b.0, y2: b.1, virtual_: true };
    let solid = |a: (f64, f64), b: (f64, f64)| Seg { x1: a.0, y1: a.1, x2: b.0, y2: b.1, virtual_: false };
    let virt_img = out.tip.filter(|_| !out.real);
    let back = |p: (f64, f64), segs: &mut Vec<Seg>| {
        if let Some(i) = virt_img {
            segs.push(dashed(p, i));
        }
    };
    let norm = |x: f64, y: f64| {
        let l = (x * x + y * y).sqrt();
        (x / l, y / l)
    };
    let side = if kind == Imager::Lens { 1.0 } else { -1.0 };
    // 1. parallel to the axis, then through (or as if from) the focal point
    {
        let p = (0.0, h);
        let mut s = vec![solid(t, p)];
        // the outgoing ray passes through the image focal point F' = (side·f, 0)
        let fp = (side * f, 0.0);
        // converging (f > 0): through F'; diverging: as if from F' (dashed back to it)
        let d = if f > 0.0 { norm(fp.0 - p.0, fp.1 - p.1) } else { norm(p.0 - fp.0, p.1 - fp.1) };
        s.push(out_seg(p, d));
        if f < 0.0 {
            s.push(dashed(p, fp));
        }
        back(p, &mut s);
        out.rays.push(s);
    }
    // 2. through the centre of the lens (undeviated) / to the vertex of the mirror (reflected symmetrically)
    {
        let p = (0.0, 0.0);
        let mut s = vec![solid(t, p)];
        let d = if kind == Imager::Lens { norm(u, -h) } else { norm(-u, -h) };
        s.push(out_seg(p, d));
        back(p, &mut s);
        out.rays.push(s);
    }
    // 3. towards (or as if from) the object-side focal point, then parallel to the axis
    if !at_focus {
        // object-side focal point: x = −f for a lens and for a mirror (in front of the element when f > 0)
        let a = (-f, 0.0);
        let tt = u / (u - f);
        let p = (t.0 + tt * (a.0 - t.0), t.1 + tt * (a.1 - t.1));
        let mut s = vec![solid(t, p)];
        if tt < 0.0 {
            // the ray seems to come from the focal point behind the object
            s.push(dashed(a, t));
        } else if tt < 1.0 {
            // aimed at the focal point beyond the element
            s.push(dashed(p, a));
        }
        s.push(out_seg(p, (side, 0.0)));
        back(p, &mut s);
        out.rays.push(s);
    }
    out
}

// ---------------------------------------------------------------------------------------------------------------
// Ray tracing
// ---------------------------------------------------------------------------------------------------------------

/// An element of the ray-tracing experiment.
#[derive(Clone, Debug)]
pub enum Element {
    /// Flat mirror from (x1, y1) to (x2, y2), reflecting on both sides.
    Mirror { x1: f64, y1: f64, x2: f64, y2: f64 },
    /// Spherical mirror: vertex (x, y), facing direction `angle` (towards the incoming light), radius of curvature
    /// r (> 0 concave, < 0 convex), half aperture `half`.
    ArcMirror { x: f64, y: f64, angle: f64, r: f64, half: f64 },
    /// Ideal thin lens: centre, axis direction, focal length, half aperture.
    Lens { x: f64, y: f64, angle: f64, f: f64, half: f64 },
    /// Glass polygon (vertices in order), refractive index at the D line and Cauchy coefficient B (µm²).
    Glass { points: Vec<(f64, f64)>, n: f64, disp: f64 },
    /// Semicircular glass: centre of the flat side, radius, direction of the curved side.
    HalfDisc { x: f64, y: f64, r: f64, angle: f64, n: f64, disp: f64 },
    /// Glass disc.
    Disc { x: f64, y: f64, r: f64, n: f64, disp: f64 },
    /// Screen (absorbs and records the hits).
    Screen { x1: f64, y1: f64, x2: f64, y2: f64 },
}

/// A light source. `band`: None white, Some(0 | 1 | 2) red, green, blue.
#[derive(Clone, Debug)]
pub enum Source {
    Ray { x: f64, y: f64, angle: f64, band: Option<usize> },
    Beam { x: f64, y: f64, angle: f64, width: f64, count: usize, band: Option<usize> },
    Point { x: f64, y: f64, angle: f64, spread: f64, count: usize, band: Option<usize> },
}

/// Options of a trace.
#[derive(Clone, Copy, Debug)]
pub struct TraceOptions {
    /// Draw partial reflections at glass surfaces (Fresnel).
    pub partial: bool,
    /// Length of a ray that leaves everything (m).
    pub far: f64,
    pub max_depth: usize,
    pub max_segments: usize,
}

impl Default for TraceOptions {
    fn default() -> Self {
        TraceOptions { partial: true, far: 50.0, max_depth: 48, max_segments: 20000 }
    }
}

/// A traced segment with its band (−1 white) and relative intensity.
#[derive(Clone, Copy, Debug)]
pub struct RaySeg {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub band: i32,
    pub intensity: f64,
}

/// What happened at a surface (for the angle annotations of the primary rays).
#[derive(Clone, Copy, Debug)]
pub struct Interaction {
    pub x: f64,
    pub y: f64,
    /// 0 reflection (mirror), 1 refraction, 2 total internal reflection, 3 lens.
    pub kind: u8,
    /// Normal direction at the point (pointing back to the incoming side).
    pub nx: f64,
    pub ny: f64,
    /// Angles of incidence and of the outgoing ray to the normal (rad).
    pub incidence: f64,
    pub outgoing: f64,
    pub n1: f64,
    pub n2: f64,
}

/// Result of a trace.
#[derive(Clone, Debug, Default)]
pub struct Trace {
    pub segments: Vec<RaySeg>,
    pub interactions: Vec<Interaction>,
    /// Screen hits: x, y, band, intensity.
    pub hits: Vec<(f64, f64, i32, f64)>,
}

/// Refractive index of a glass at a band.
pub fn index_of(n_d: f64, disp: f64, band: Option<usize>) -> f64 {
    match band {
        None => n_d,
        Some(b) => n_d - disp / (LAMBDA_D * LAMBDA_D) + disp / (BANDS[b] * BANDS[b]),
    }
}

/// Fresnel reflectance of unpolarized light from index n1 to n2 at incidence cos ci and transmission cos ct.
pub fn fresnel(n1: f64, n2: f64, ci: f64, ct: f64) -> f64 {
    let rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
    let rp = (n1 * ct - n2 * ci) / (n1 * ct + n2 * ci);
    0.5 * (rs * rs + rp * rp)
}

#[derive(Clone, Copy, Debug)]
struct Hit {
    t: f64,
    x: f64,
    y: f64,
    /// Unit normal, outward for glass edges, any orientation for mirrors and lenses.
    nx: f64,
    ny: f64,
    elem: usize,
}

fn seg_hit(ox: f64, oy: f64, dx: f64, dy: f64, x1: f64, y1: f64, x2: f64, y2: f64) -> Option<(f64, f64)> {
    let (ex, ey) = (x2 - x1, y2 - y1);
    let den = dx * ey - dy * ex;
    if den.abs() < 1e-300 {
        return None;
    }
    let (wx, wy) = (x1 - ox, y1 - oy);
    let t = (wx * ey - wy * ex) / den;
    let s = (wx * dy - wy * dx) / den;
    if t > 1e-9 && (-1e-12..=1.0 + 1e-12).contains(&s) {
        Some((t, s))
    } else {
        None
    }
}

/// Intersections of a ray with a circle: parameters t > ε in increasing order.
fn circle_hits(ox: f64, oy: f64, dx: f64, dy: f64, cx: f64, cy: f64, r: f64) -> Vec<f64> {
    let (fx, fy) = (ox - cx, oy - cy);
    let b = fx * dx + fy * dy;
    let c = fx * fx + fy * fy - r * r;
    let disc = b * b - c;
    if disc < 0.0 {
        return vec![];
    }
    let s = disc.sqrt();
    [-b - s, -b + s].into_iter().filter(|&t| t > 1e-9).collect()
}

fn angle_in(a: f64, from: f64, to: f64) -> bool {
    // a within the arc from `from` counter-clockwise to `to`
    let span = (to - from).rem_euclid(2.0 * PI);
    (a - from).rem_euclid(2.0 * PI) <= span + 1e-12
}

/// Nearest hit of a ray with the elements.
fn nearest(elems: &[Element], ox: f64, oy: f64, dx: f64, dy: f64) -> Option<Hit> {
    let mut best: Option<Hit> = None;
    let mut consider = |h: Hit| {
        if best.is_none_or(|b| h.t < b.t) {
            best = Some(h);
        }
    };
    for (ei, e) in elems.iter().enumerate() {
        match e {
            Element::Mirror { x1, y1, x2, y2 } | Element::Screen { x1, y1, x2, y2 } => {
                if let Some((t, _)) = seg_hit(ox, oy, dx, dy, *x1, *y1, *x2, *y2) {
                    let (ex, ey) = (x2 - x1, y2 - y1);
                    let l = (ex * ex + ey * ey).sqrt();
                    consider(Hit { t, x: ox + t * dx, y: oy + t * dy, nx: -ey / l, ny: ex / l, elem: ei });
                }
            }
            Element::Lens { x, y, angle, half, .. } => {
                let (wx, wy) = (-angle.sin(), angle.cos());
                if let Some((t, _)) = seg_hit(ox, oy, dx, dy, x - half * wx, y - half * wy, x + half * wx, y + half * wy) {
                    consider(Hit { t, x: ox + t * dx, y: oy + t * dy, nx: angle.cos(), ny: angle.sin(), elem: ei });
                }
            }
            Element::ArcMirror { x, y, angle, r, half } => {
                // centre of curvature in front (r > 0) or behind (r < 0) along the facing direction
                let (ux, uy) = (angle.cos(), angle.sin());
                let (cx, cy) = (x + r * ux, y + r * uy);
                let rad = r.abs();
                let span = (half / rad).min(1.0).asin();
                // the vertex seen from the centre
                let base = (y - cy).atan2(x - cx);
                for t in circle_hits(ox, oy, dx, dy, cx, cy, rad) {
                    let (hx, hy) = (ox + t * dx, oy + t * dy);
                    let a = (hy - cy).atan2(hx - cx);
                    if angle_in(a, base - span, base + span) {
                        consider(Hit { t, x: hx, y: hy, nx: (hx - cx) / rad, ny: (hy - cy) / rad, elem: ei });
                        break;
                    }
                }
            }
            Element::Glass { points, .. } => {
                let k = points.len();
                // orientation: outward normal of a counter-clockwise polygon is (ey, −ex)
                let area: f64 = (0..k).map(|i| points[i].0 * points[(i + 1) % k].1 - points[(i + 1) % k].0 * points[i].1).sum();
                let sg = if area >= 0.0 { 1.0 } else { -1.0 };
                for i in 0..k {
                    let (p, q) = (points[i], points[(i + 1) % k]);
                    if let Some((t, _)) = seg_hit(ox, oy, dx, dy, p.0, p.1, q.0, q.1) {
                        let (ex, ey) = (q.0 - p.0, q.1 - p.1);
                        let l = (ex * ex + ey * ey).sqrt();
                        consider(Hit { t, x: ox + t * dx, y: oy + t * dy, nx: sg * ey / l, ny: -sg * ex / l, elem: ei });
                    }
                }
            }
            Element::HalfDisc { x, y, r, angle, .. } => {
                let (ux, uy) = (angle.cos(), angle.sin());
                let (wx, wy) = (-uy, ux);
                if let Some((t, _)) = seg_hit(ox, oy, dx, dy, x - r * wx, y - r * wy, x + r * wx, y + r * wy) {
                    consider(Hit { t, x: ox + t * dx, y: oy + t * dy, nx: -ux, ny: -uy, elem: ei });
                }
                for t in circle_hits(ox, oy, dx, dy, *x, *y, *r) {
                    let (hx, hy) = (ox + t * dx, oy + t * dy);
                    if (hx - x) * ux + (hy - y) * uy >= -1e-12 {
                        consider(Hit { t, x: hx, y: hy, nx: (hx - x) / r, ny: (hy - y) / r, elem: ei });
                        break;
                    }
                }
            }
            Element::Disc { x, y, r, .. } => {
                if let Some(&t) = circle_hits(ox, oy, dx, dy, *x, *y, *r).first() {
                    let (hx, hy) = (ox + t * dx, oy + t * dy);
                    consider(Hit { t, x: hx, y: hy, nx: (hx - x) / r, ny: (hy - y) / r, elem: ei });
                }
            }
        }
    }
    best
}

fn glass_of(e: &Element) -> Option<(f64, f64)> {
    match e {
        Element::Glass { n, disp, .. } | Element::HalfDisc { n, disp, .. } | Element::Disc { n, disp, .. } => Some((*n, *disp)),
        _ => None,
    }
}

#[derive(Clone, Copy, Debug)]
struct Ray {
    ox: f64,
    oy: f64,
    dx: f64,
    dy: f64,
    band: Option<usize>,
    intensity: f64,
    /// Glass element the ray is inside of.
    inside: Option<usize>,
    depth: usize,
    primary: bool,
}

/// Trace all sources through the elements.
pub fn trace(elems: &[Element], sources: &[Source], o: &TraceOptions) -> Trace {
    let mut out = Trace::default();
    let mut stack: Vec<Ray> = Vec::new();
    let emit = |x: f64, y: f64, a: f64, band: Option<usize>, stack: &mut Vec<Ray>| stack.push(Ray { ox: x, oy: y, dx: a.cos(), dy: a.sin(), band, intensity: 1.0, inside: None, depth: 0, primary: true });
    for s in sources {
        match *s {
            Source::Ray { x, y, angle, band } => emit(x, y, angle, band, &mut stack),
            Source::Beam { x, y, angle, width, count, band } => {
                let (wx, wy) = (-angle.sin(), angle.cos());
                let c = count.max(1);
                for i in 0..c {
                    let f = if c == 1 { 0.0 } else { i as f64 / (c - 1) as f64 - 0.5 };
                    emit(x + f * width * wx, y + f * width * wy, angle, band, &mut stack);
                }
            }
            Source::Point { x, y, angle, spread, count, band } => {
                let c = count.max(1);
                let full = spread >= 2.0 * PI - 1e-9;
                for i in 0..c {
                    let a = if full { angle + 2.0 * PI * i as f64 / c as f64 } else if c == 1 { angle } else { angle - spread / 2.0 + spread * i as f64 / (c - 1) as f64 };
                    emit(x, y, a, band, &mut stack);
                }
            }
        }
    }
    stack.reverse();
    let cutoff = 0.03;
    while let Some(r) = stack.pop() {
        if out.segments.len() >= o.max_segments {
            break;
        }
        let band_i = r.band.map(|b| b as i32).unwrap_or(-1);
        let Some(h) = nearest(elems, r.ox, r.oy, r.dx, r.dy) else {
            out.segments.push(RaySeg { x1: r.ox, y1: r.oy, x2: r.ox + o.far * r.dx, y2: r.oy + o.far * r.dy, band: band_i, intensity: r.intensity });
            continue;
        };
        out.segments.push(RaySeg { x1: r.ox, y1: r.oy, x2: h.x, y2: h.y, band: band_i, intensity: r.intensity });
        if r.depth >= o.max_depth {
            continue;
        }
        let child = |dx: f64, dy: f64, intensity: f64, band: Option<usize>, inside: Option<usize>| Ray { ox: h.x, oy: h.y, dx, dy, band, intensity, inside, depth: r.depth + 1, primary: r.primary };
        // normal facing the incoming ray
        let facing = if h.nx * r.dx + h.ny * r.dy > 0.0 { (-h.nx, -h.ny) } else { (h.nx, h.ny) };
        let ci = -(facing.0 * r.dx + facing.1 * r.dy);
        let incidence = ci.clamp(-1.0, 1.0).acos();
        match &elems[h.elem] {
            Element::Screen { .. } => out.hits.push((h.x, h.y, band_i, r.intensity)),
            Element::Mirror { .. } | Element::ArcMirror { .. } => {
                let dn = r.dx * facing.0 + r.dy * facing.1;
                let (rx, ry) = (r.dx - 2.0 * dn * facing.0, r.dy - 2.0 * dn * facing.1);
                if r.primary {
                    out.interactions.push(Interaction { x: h.x, y: h.y, kind: 0, nx: facing.0, ny: facing.1, incidence, outgoing: incidence, n1: 1.0, n2: 1.0 });
                }
                stack.push(child(rx, ry, r.intensity, r.band, r.inside));
            }
            Element::Lens { x, y, angle, f, .. } => {
                let (ux, uy) = (angle.cos(), angle.sin());
                let (wx, wy) = (-uy, ux);
                let yl = (h.x - x) * wx + (h.y - y) * wy;
                let du = r.dx * ux + r.dy * uy;
                let dw = r.dx * wx + r.dy * wy;
                let s = if du >= 0.0 { 1.0 } else { -1.0 };
                let k = dw / du.abs().max(1e-300) - yl / f;
                let l = (1.0 + k * k).sqrt();
                let (nu, nw) = (s / l, k / l);
                let (ndx, ndy) = (nu * ux + nw * wx, nu * uy + nw * wy);
                if r.primary {
                    out.interactions.push(Interaction { x: h.x, y: h.y, kind: 3, nx: facing.0, ny: facing.1, incidence, outgoing: (ndx * facing.0 + ndy * facing.1).abs().clamp(0.0, 1.0).acos(), n1: 1.0, n2: 1.0 });
                }
                stack.push(child(ndx, ndy, r.intensity, r.band, r.inside));
            }
            e => {
                let Some((nd, disp)) = glass_of(e) else { continue };
                let exiting = r.inside == Some(h.elem);
                // a white ray splits at the first dispersive surface it enters
                if r.band.is_none() && disp > 0.0 && !exiting {
                    for b in (0..3).rev() {
                        stack.push(Ray { band: Some(b), ox: r.ox, oy: r.oy, depth: r.depth, ..r });
                    }
                    // the white segment drawn above is replaced by the three bands
                    out.segments.pop();
                    continue;
                }
                let n_glass = index_of(nd, disp, r.band);
                let (n1, n2) = if exiting { (n_glass, 1.0) } else { (1.0, n_glass) };
                let eta = n1 / n2;
                let k = 1.0 - eta * eta * (1.0 - ci * ci);
                let dn = r.dx * facing.0 + r.dy * facing.1;
                let (rx, ry) = (r.dx - 2.0 * dn * facing.0, r.dy - 2.0 * dn * facing.1);
                if k < 0.0 {
                    if r.primary {
                        out.interactions.push(Interaction { x: h.x, y: h.y, kind: 2, nx: facing.0, ny: facing.1, incidence, outgoing: incidence, n1, n2 });
                    }
                    stack.push(child(rx, ry, r.intensity, r.band, r.inside));
                    continue;
                }
                let ct = k.sqrt();
                let (tx, ty) = (eta * r.dx + (eta * ci - ct) * facing.0, eta * r.dy + (eta * ci - ct) * facing.1);
                let refl = fresnel(n1, n2, ci, ct);
                if r.primary {
                    out.interactions.push(Interaction { x: h.x, y: h.y, kind: 1, nx: facing.0, ny: facing.1, incidence, outgoing: ct.clamp(-1.0, 1.0).acos(), n1, n2 });
                }
                let inside_after = if exiting { None } else { Some(h.elem) };
                stack.push(child(tx, ty, r.intensity * (1.0 - refl), r.band, inside_after));
                if o.partial && r.intensity * refl >= cutoff {
                    let mut c = child(rx, ry, r.intensity * refl, r.band, r.inside);
                    c.primary = false;
                    stack.push(c);
                }
            }
        }
    }
    out
}

/// Critical angle of total internal reflection from glass of index n into air (rad).
pub fn critical_angle(n: f64) -> Option<f64> {
    if n > 1.0 {
        Some((1.0 / n).asin())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thin_lens_and_mirror_formula() {
        // convex f = 10, u = 30: v = 15, m = −0.5, real inverted
        let i = image(Imager::Lens, 10.0, 30.0, 2.0);
        assert!((i.v.unwrap() - 15.0).abs() < 1e-12 && (i.m.unwrap() + 0.5).abs() < 1e-12 && i.real && !i.upright);
        // all three rays pass through the image tip
        let tip = i.tip.unwrap();
        for ray in &i.rays {
            let s = ray.iter().find(|s| !s.virtual_ && s.x1 >= -1e-12 && s.x2 > s.x1).unwrap();
            let t = (tip.0 - s.x1) / (s.x2 - s.x1);
            let yy = s.y1 + t * (s.y2 - s.y1);
            assert!((yy - tip.1).abs() < 1e-9, "{yy} vs {}", tip.1);
        }
        assert_eq!(i.rays.len(), 3);
        // magnifier: u < f, virtual upright image on the object side
        let i = image(Imager::Lens, 10.0, 5.0, 1.0);
        assert!((i.v.unwrap() + 10.0).abs() < 1e-12 && (i.m.unwrap() - 2.0).abs() < 1e-12 && !i.real && i.upright);
        // the dashed backward extensions meet at the virtual image
        for ray in &i.rays {
            assert!(ray.iter().any(|s| s.virtual_ && (s.x2 - i.tip.unwrap().0).abs() < 1e-12 && (s.y2 - i.tip.unwrap().1).abs() < 1e-12));
        }
        // concave lens: always virtual, upright, reduced
        let i = image(Imager::Lens, -10.0, 20.0, 1.0);
        assert!((1.0 / 20.0 + 1.0 / i.v.unwrap() - 1.0 / -10.0).abs() < 1e-12 && !i.real && i.upright && i.m.unwrap() < 1.0);
        // object at the focal point: no image
        assert!(image(Imager::Lens, 10.0, 10.0, 1.0).v.is_none());
        // concave mirror f = 10, u = 15: v = 30 (real, in front), m = −2
        let i = image(Imager::Mirror, 10.0, 15.0, 1.0);
        assert!((i.v.unwrap() - 30.0).abs() < 1e-12 && i.real && (i.tip.unwrap().0 + 30.0).abs() < 1e-12);
        let tip = i.tip.unwrap();
        for ray in &i.rays {
            let s = ray.iter().find(|s| !s.virtual_ && s.x1.abs() < 1e-12 && s.x2 < 0.0).unwrap();
            let t = (tip.0 - s.x1) / (s.x2 - s.x1);
            assert!((s.y1 + t * (s.y2 - s.y1) - tip.1).abs() < 1e-9);
        }
        // convex mirror: virtual behind the mirror
        let i = image(Imager::Mirror, -10.0, 15.0, 1.0);
        assert!(!i.real && i.tip.unwrap().0 > 0.0 && i.upright);
    }

    #[test]
    fn snell_and_total_internal_reflection() {
        // a ray into a glass block at 40° incidence: sin i = n sin r
        let block = Element::Glass { points: vec![(0.0, -1.0), (2.0, -1.0), (2.0, 1.0), (0.0, 1.0)], n: 1.5, disp: 0.0 };
        let a = 40f64.to_radians();
        let t = trace(&[block.clone()], &[Source::Ray { x: -1.0, y: -a.tan(), angle: a, band: None }], &TraceOptions { partial: false, ..Default::default() });
        let first = t.interactions[0];
        assert_eq!(first.kind, 1);
        assert!((first.incidence - a).abs() < 1e-12);
        assert!((first.incidence.sin() - 1.5 * first.outgoing.sin()).abs() < 1e-12);
        // leaving the parallel block the ray is parallel to the incoming one
        let last = t.segments.last().unwrap();
        let ang = (last.y2 - last.y1).atan2(last.x2 - last.x1);
        assert!((ang - a).abs() < 1e-12);
        // inside a semicircle aimed at the centre: beyond the critical angle total reflection, below refraction
        let c = critical_angle(1.5).unwrap();
        for (inc, tir) in [(c + 0.02, true), (c - 0.02, false)] {
            // the ray enters the curved side radially (undeviated) and meets the flat side at the centre
            let half = Element::HalfDisc { x: 0.0, y: 0.0, r: 1.0, angle: -PI / 2.0, n: 1.5, disp: 0.0 };
            let (sx, sy) = (2.0 * (inc).sin(), -2.0 * inc.cos());
            let dir = (-sy).atan2(-sx);
            let t = trace(&[half], &[Source::Ray { x: sx, y: sy, angle: dir, band: None }], &TraceOptions { partial: false, ..Default::default() });
            let at_flat = t.interactions.iter().find(|i| i.x.abs() < 1e-9 && i.y.abs() < 1e-9).unwrap();
            assert_eq!(at_flat.kind == 2, tir, "incidence {inc} vs critical {c}");
            assert!((at_flat.incidence - inc).abs() < 1e-9);
        }
    }

    #[test]
    fn prism_disperses_white_light() {
        let prism = Element::Glass { points: vec![(-1.0, 0.0), (1.0, 0.0), (0.0, 1.7)], n: 1.52, disp: 0.0042 };
        let t = trace(&[prism], &[Source::Ray { x: -2.0, y: 0.3, angle: 0.25, band: None }], &TraceOptions { partial: false, ..Default::default() });
        // three outgoing rays, blue bent most
        let outs: Vec<&RaySeg> = t.segments.iter().filter(|s| s.band >= 0 && s.x1 > 0.0 && (s.x2 - s.x1).hypot(s.y2 - s.y1) > 10.0).collect();
        assert_eq!(outs.len(), 3);
        let dir = |b: i32| {
            let s = outs.iter().find(|s| s.band == b).unwrap();
            (s.y2 - s.y1).atan2(s.x2 - s.x1)
        };
        assert!(dir(2) < dir(1) && dir(1) < dir(0), "red deviated least: {} {} {}", dir(0), dir(1), dir(2));
        assert!(index_of(1.52, 0.0042, Some(2)) > index_of(1.52, 0.0042, Some(0)));
    }

    #[test]
    fn ideal_lens_focuses_parallel_rays_and_mirror_shows_aberration() {
        let lens = Element::Lens { x: 0.0, y: 0.0, angle: 0.0, f: 2.0, half: 1.0 };
        let screen = Element::Screen { x1: 2.0, y1: -3.0, x2: 2.0, y2: 3.0 };
        let t = trace(&[lens, screen], &[Source::Beam { x: -3.0, y: 0.0, angle: 0.0, width: 1.6, count: 9, band: None }], &TraceOptions::default());
        assert_eq!(t.hits.len(), 9);
        assert!(t.hits.iter().all(|h| h.1.abs() < 1e-12), "all rays meet at F");
        // tilted beam: meets on the focal plane at y = f tan θ
        let lens = Element::Lens { x: 0.0, y: 0.0, angle: 0.0, f: 2.0, half: 1.0 };
        let screen = Element::Screen { x1: 2.0, y1: -3.0, x2: 2.0, y2: 3.0 };
        let th: f64 = 0.1;
        let t = trace(&[lens, screen], &[Source::Beam { x: -3.0, y: -3.0 * th.tan(), angle: th, width: 1.0, count: 5, band: None }], &TraceOptions::default());
        assert!(t.hits.iter().all(|h| (h.1 - 2.0 * th.tan()).abs() < 1e-12));
        // concave spherical mirror R = 4 (f = 2): paraxial rays near F, marginal rays closer to the mirror
        let m = Element::ArcMirror { x: 0.0, y: 0.0, angle: PI, r: 4.0, half: 1.5 };
        let t = trace(&[m], &[Source::Ray { x: -6.0, y: 0.05, angle: 0.0, band: None }, Source::Ray { x: -6.0, y: 1.4, angle: 0.0, band: None }], &TraceOptions::default());
        let cross = |k: usize| {
            // reflected segment of ray k crosses the axis at
            let s = t.segments.iter().filter(|s| s.x1.abs() < 0.5 && s.x2 < s.x1).nth(k).unwrap();
            s.x1 - s.y1 * (s.x2 - s.x1) / (s.y2 - s.y1)
        };
        let (a, b) = (cross(0), cross(1));
        assert!((a + 2.0).abs() < 1e-3, "paraxial focus {a}");
        assert!(b > a + 0.05, "marginal focus {b} closer to the mirror (spherical aberration)");
    }
}
