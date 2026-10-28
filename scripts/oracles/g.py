from common import *
import numpy as np

# G01: unit conversion by the SI definitions (1 h = 3600 s, 1 g = 1e-3 kg)
v = mp.mpf(72) * 1000 / 3600
m = mp.mpf(500) / 1000
case('G01', 'EX G01: 72 km/h, 500 g', 'benchmark', {'v': v, 'm': m}, {'vSI': 20, 'mSI': '0.5' and 0.5, 'Ek': m * v**2 / 2}, method='SI definitions of h and g')
case('G01', 'zero velocity', 'boundary', {'v': 0, 'm': 1}, {'vSI': 0, 'Ek': 0}, scale={'vSI': 1, 'Ek': 1}, method='SI definitions')
case('G01', '1 cm/s and 1 g (prefixes)', 'limit', {'v': mp.mpf(1) / 100, 'm': mp.mpf(1) / 1000}, {'vSI': 0.01, 'mSI': 0.001, 'Ek': mp.mpf('0.001') * mp.mpf('0.01')**2 / 2}, method='SI prefixes')

# G02: components by projection, rotation of the axes by matrix multiplication (numpy as another route)
def g02(F, th, ph):
    vec = np.array([float(F * mp.cos(th)), float(F * mp.sin(th))])
    Rm = np.array([[np.cos(float(ph)), np.sin(float(ph))], [-np.sin(float(ph)), np.cos(float(ph))]])
    w = Rm @ vec
    return vec, w
for (F, th, ph, kind, name) in [(10, mp.pi / 6, mp.pi / 6, 'benchmark', 'EX G02: 10 N at 30°, axes turned 30°'), (10, mp.pi / 6, 0, 'boundary', 'axes not turned'), (3, 2 * mp.pi / 3, -mp.pi / 4, 'transfer', 'second quadrant, axes turned −45°')]:
    vec, w = g02(F, th, ph)
    case('G02', name, kind, {'F': F, 'theta': th, 'phi': ph}, {'Fx': vec[0], 'Fy': vec[1], 'Fx2': w[0], 'Fy2': w[1], 'mod': F}, method='rotation matrix (numpy)', tol=1e-12, scale={k: F for k in ('Fx', 'Fy', 'Fx2', 'Fy2')})

# G03: x = c t², exact derivative 2ct; central difference exact for quadratics; forward difference 2ct + c dt
for (cc, t, dt, kind, name) in [(2, 1, mp.mpf('0.1'), 'benchmark', 'EX G03'), (2, mp.mpf('0.05'), mp.mpf('0.1'), 'boundary', 'previous sample before t = 0'), (3, 2, mp.mpf('1e-3'), 'limit', 'small Δt')]:
    exp_ = {'v': 2 * cc * t, 'vf': 2 * cc * t + cc * dt, 's': mp.quad(lambda s: 2 * cc * s, [0, t])}
    exp_['vc'] = 2 * cc * t if t - dt >= 0 else NA_()
    if t - dt < 0:
        exp_['vc'] = {'state': 'notApplicable', 'value': None}
    case('G03', name, kind, {'c': cc, 't': t, 'dt': dt}, exp_, method='derivative and quadrature (mpmath.quad)', tol=1e-9)

# G04: least squares by numpy.polyfit
for pts, kind, name in [([(0, 1), (1, 3), (2, 5)], 'benchmark', 'EX G04'), ([(0, 1), (1, 3), (2, 6)], 'transfer', 'one point off the line'), ([(1, 1), (1, 3), (1, 5)], 'boundary', 'all times equal')]:
    ts = [p[0] for p in pts]; xs = [p[1] for p in pts]
    ins = {'t1': ts[0], 'x1': xs[0], 't2': ts[1], 'x2': xs[1], 't3': ts[2], 'x3': xs[2]}
    if len(set(ts)) == 1:
        case('G04', name, kind, ins, {'a': NA_(), 'b': NA_()}, conds={'spread': 'notApplicable'}, method='numpy.polyfit (rank-deficient: no fit)')
        continue
    a, b = np.polyfit(np.array(ts, float), np.array(xs, float), 1)
    res = [x - (a * t + b) for t, x in zip(ts, xs)]
    case('G04', name, kind, ins, {'a': a, 'b': b, 'r1': res[0], 'r2': res[1], 'r3': res[2]}, method='numpy.polyfit', tol=1e-12, scale={'r1': 1, 'r2': 1, 'r3': 1, 'b': 1})

# G05: first-order propagation for v = s/t (partial derivatives written out)
def g05(s, us, t, ut, r):
    dvds = 1 / t; dvdt = -s / t**2
    var = (dvds * us)**2 + (dvdt * ut)**2 + 2 * dvds * dvdt * r * us * ut
    return s / t, mp.sqrt(var)
for (s, us, t, ut, r, kind, name) in [(1, '0.01', 2, '0.02', 0, 'benchmark', 'EX G05 independent'), (1, '0.01', 2, '0.02', '0.8', 'transfer', 'correlated inputs r = 0.8'), (1, '0.3', 2, '0.02', 0, 'boundary', 'large uncertainty: first order not applicable')]:
    s, us, t, ut, r = map(mp.mpf, (s, us, t, ut, r))
    v, uv = g05(s, us, t, ut, r)
    if us / s > mp.mpf('0.2'):
        case('G05', name, kind, {'s': s, 'us': us, 't': t, 'ut': ut, 'r': r}, {'v': v, 'uv': NA_()}, conds={'small': 'notApplicable'}, method='partial derivatives')
    else:
        case('G05', name, kind, {'s': s, 'us': us, 't': t, 'ut': ut, 'r': r}, {'v': v, 'uv': uv, 'rel': uv / v}, conds={'small': 'applicable'}, method='partial derivatives of v = s/t', tol=1e-12)

# G06: thermodynamic temperature from Celsius (affine), differences by scale
case('G06', 'EX G06: 20 °C', 'benchmark', {'T1': 20 + T0C, 'dT': 10, 'm': 2, 'a': 3, 'v': 4}, {'TK': mp.mpf('293.15'), 'tC': 20, 'dTK': 10, 'F': 6, 'p': 8}, method='T = t + 273.15 K (SI)', tol=1e-12)
case('G06', 'absolute zero', 'boundary', {'T1': 0, 'dT': 0, 'm': 1, 'a': 0, 'v': 0}, {'TK': 0, 'tC': -T0C, 'dTK': 0}, scale={'TK': 1, 'dTK': 1, 'tC': 1}, method='SI')
case('G06', 'negative Celsius', 'transfer', {'T1': -40 + T0C, 'dT': 40, 'm': 1, 'a': 1, 'v': 1}, {'tC': -40, 'dTK': 40}, method='SI', tol=1e-12)

# G07: Richardson by solving Q_h = Q + C h^p for (Q, C, p) with mpmath.findroot (another route)
def g07(q1, q2, q3, r):
    def eqs(Q, C, p):
        return [Q + C - q1, Q + C / r**p - q2, Q + C / r**(2 * p) - q3]
    Q, C, p = mp.findroot(eqs, (q3, q1 - q3, 1.5))
    return p, Q
for (q, r, kind, name) in [(('1.04', '1.01', '1.0025'), 2, 'benchmark', 'EX G07'), (('2.0', '1.5', '1.375'), 2, 'transfer', 'first order, r = 2'), (('1.0', '1.0', '1.0'), 2, 'boundary', 'no change (0/0)')]:
    q1, q2, q3 = map(mp.mpf, q)
    if q1 == q2:
        case('G07', name, kind, {'q1': q1, 'q2': q2, 'q3': q3, 'r': r}, {'p': NA_(), 'qx': NA_()}, conds={'monotone': 'notApplicable'}, method='no root: differences are zero')
        continue
    p, Q = g07(q1, q2, q3, mp.mpf(r))
    case('G07', name, kind, {'q1': q1, 'q2': q2, 'q3': q3, 'r': r}, {'p': p, 'qx': Q}, method='mpmath.findroot of Q + C h^p', tol=1e-10)

# G08: standard error from the binomial variance; 1.96 = Φ⁻¹(0.975) computed with mpmath
z = mp.sqrt(2) * mp.erfinv(mp.mpf('0.95'))
for (p, n, kind, name) in [('0.5', 10000, 'benchmark', 'EX G08'), ('0.5', 40000, 'transfer', 'four times the samples'), ('0.001', 1000, 'boundary', 'np < 10: no normal interval')]:
    p = mp.mpf(p); se = mp.sqrt(p * (1 - p) / n)
    if n * p < 10:
        case('G08', name, kind, {'p': p, 'n': n}, {'se': se, 'hw': NA_()}, conds={'normal': 'notApplicable'}, method='binomial variance')
    else:
        case('G08', name, kind, {'p': p, 'n': n}, {'se': se, 'hw': z * se}, method='binomial variance; z = √2·erfinv(0.95)', tol=1e-12)
