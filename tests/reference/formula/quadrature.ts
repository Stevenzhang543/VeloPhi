/**
 * Adaptive Gauss–Kronrod quadrature (7-point Gauss, 15-point Kronrod) for the variable-force formulas:
 * ∫F(t)dt and ∫(t − s)F(s)ds of a force given as an expression of time, computed independently of the
 * solver. Known break points (where the expression jumps) split the interval first. Only IEEE arithmetic,
 * fixed evaluation order: the result is the same in every engine.
 */

/**
 * Kronrod nodes on [0, 1] (the Gauss nodes at odd indices), Kronrod weights (WGK) and Gauss weights (WG), as
 * in QUADPACK qk15.
 */
const XGK = [
  0.991455371120812639206854697526329, 0.949107912342758524526189684047851, 0.864864423359769072789712788640926,
  0.741531185599394439863864773280788, 0.586087235467691130294144845693013, 0.405845151377397166906606412076961,
  0.207784955007898467600689403773245, 0
]
const WGK = [
  0.022935322010529224963732008058970, 0.063092092629978553290700663189204, 0.104790010322250183839876322541518,
  0.140653259715525918745189590510238, 0.169004726639267902826583426598550, 0.190350578064785409913256402421014,
  0.204432940075298892414161999234649, 0.209482141084727828012999174891714
]
const WG = [0.129484966168869693270611432679082, 0.279705391489276667901467771423780, 0.381830050505118944950369775488975, 0.417959183673469387755102040816327]

/** One 15-point rule on [a, b]: Kronrod estimate and |Kronrod − Gauss|. */
function gk15(f: (x: number) => number, a: number, b: number): { value: number; error: number } {
  const c = 0.5 * (a + b), h = 0.5 * (b - a)
  const fc = f(c)
  let resK = fc * WGK[7], resG = fc * WG[3]
  for (let j = 0; j < 7; j++) {
    const dx = h * XGK[j]
    const f1 = f(c - dx), f2 = f(c + dx)
    resK += WGK[j] * (f1 + f2)
    if (j % 2 === 1) resG += WG[(j - 1) / 2] * (f1 + f2)
  }
  return { value: resK * h, error: Math.abs((resK - resG) * h) }
}

/**
 * Integral of f over [a, b] by adaptive bisection until each piece's error estimate is below tol·max(1, |piece|)
 * (relative to the scale of the integral). `breaks` inside (a, b) split the interval first. Returns NaN when
 * f is not finite somewhere.
 */
export function integrate(f: (x: number) => number, a: number, b: number, breaks: number[] = [], tol = 1e-13): number {
  if (!(b > a)) return 0
  const pts = [a, ...breaks.filter(x => x > a && x < b).sort((x, y) => x - y), b]
  let total = 0
  for (let i = 0; i + 1 < pts.length; i++) total += adapt(f, pts[i], pts[i + 1], tol, 0)
  return total
}

function adapt(f: (x: number) => number, a: number, b: number, tol: number, depth: number): number {
  const r = gk15(f, a, b)
  if (!Number.isFinite(r.value)) return Number.NaN
  if (r.error <= tol * Math.max(1, Math.abs(r.value)) || depth >= 40 || b - a <= 1e-14 * Math.max(1, Math.abs(a))) return r.value
  const m = 0.5 * (a + b)
  return adapt(f, a, m, tol, depth + 1) + adapt(f, m, b, tol, depth + 1)
}
