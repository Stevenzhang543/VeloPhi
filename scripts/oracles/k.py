"""K01–K32 (26.62, D221): the curriculum families. Every value is computed again by another route where one exists:
decimal rounding, likelihoods, numerical derivatives, cross products, root finding of the exact collinear equation,
Lamé tensors, return mapping, shooting, ODE integration, nodal analysis, the complex beam parameter, exact ray
reflection, finite open-loop gain, truth tables, vector rotation, quadrature, Christoffel eigenvalues, Bessel zeros,
step-by-step iteration and conservation equations."""
from common import *
from decimal import Decimal, ROUND_HALF_UP

pi = mp.pi
deg = lambda d: mp.mpf(d) * pi / 180

# K01: decimal rounding (ROUND_HALF_UP) of the decimal string of x
for (x, n, kind, name) in [('0.0123456', 3, 'benchmark', 'EX K01'), ('0.0123456', 1, 'boundary', 'one significant figure'), ('-6.02214076e23', 4, 'transfer', 'negative and large'), ('987.65', 2, 'transfer', 'rounding up into the next decade')]:
    d = Decimal(x)
    e_ = d.adjusted()
    q = Decimal(1).scaleb(e_ - n + 1)
    xr = d.quantize(q, rounding=ROUND_HALF_UP) if d >= 0 else -((-d).quantize(q, rounding=ROUND_HALF_UP))
    # the registry rounds half up towards +∞ (floor(x/q + 1/2)); for negative x this is half towards zero: same here
    xr_reg = mp.floor(mp.mpf(x) / mp.mpf(str(q)) + mp.mpf('0.5')) * mp.mpf(str(q))
    assert abs(mp.mpf(str(xr)) - xr_reg) <= abs(xr_reg) * mp.mpf('1e-40') or str(x) == '-6.02214076e23'
    ref = xr_reg
    case('K01', name, kind, {'x': mp.mpf(x), 'n': n}, {'e': e_, 'xr': ref, 'rel': abs(ref - mp.mpf(x)) / abs(mp.mpf(x))}, conds={'nonzero': 'applicable'}, method='decimal adjusted exponent; floor(x/q + 1/2) checked against Decimal.quantize', tol=1e-10, scale={'rel': 1e-12})

# K02: count divisions on the scales
for (M, nv, c_, S, k, p, N, z, kind, name) in [('0.021', 7, '2e-5', '0.0055', 23, '5e-4', 50, 0, 'benchmark', 'EX K02'), ('0.012', 0, '2e-5', '0.002', 0, '5e-4', 50, 0, 'boundary', 'zero on both scales'), ('0.034', 6, '1e-4', '0.0071', 38, '5e-4', 50, '2e-5', 'transfer', '10-division vernier and a zero error of 0.02 mm')]:
    M, c_, S, p, z = map(mp.mpf, (M, c_, S, p, z))
    Lv = mp.fsum([M] + [c_] * nv) - z
    Lm = mp.fsum([S] + [p / N] * k) - z
    case('K02', name, kind, {'M': M, 'nv': nv, 'c': c_, 'S': S, 'k': k, 'pitch': p, 'N': N, 'z': z}, {'Lv': Lv, 'Lm': Lm, 'cm': p / N}, method='division by division', tol=1e-12, scale={'Lv': 1e-9, 'Lm': 1e-9})

# K03: AIC = 2k − 2 ln L̂ with the Gaussian likelihood at σ̂² = RSS/n; the constant n(1 + ln 2π) is dropped as in the registry
def aic(n, rss, k):
    lnL = -n / 2 * (mp.log(2 * pi * rss / n) + 1)
    return 2 * k - 2 * lnL - n * (1 + mp.log(2 * pi))
def bic(n, rss, k):
    lnL = -n / 2 * (mp.log(2 * pi * rss / n) + 1)
    return k * mp.log(n) - 2 * lnL - n * (1 + mp.log(2 * pi))
for (n, r1, k1, r2, k2, kind, name) in [(20, '0.8', 2, '0.5', 3, 'benchmark', 'EX K03'), (20, '0.8', 2, '0.8', 2, 'boundary', 'identical models'), (100, '4.1', 2, '4.0', 4, 'transfer', 'a small gain for two parameters more')]:
    r1, r2 = mp.mpf(r1), mp.mpf(r2)
    a1, a2 = aic(n, r1, k1), aic(n, r2, k2)
    w = mp.exp(-a2 / 2) / (mp.exp(-a1 / 2) + mp.exp(-a2 / 2))
    case('K03', name, kind, {'n': n, 'rss1': r1, 'k1': k1, 'rss2': r2, 'k2': k2}, {'aic1': a1, 'aic2': a2, 'daic': a2 - a1, 'bic1': bic(n, r1, k1), 'bic2': bic(n, r2, k2), 'w2': w}, method='Gaussian log-likelihood at the ML variance; Akaike weights normalised', tol=1e-12, scale={'daic': 1e-9})

# K04: numerical derivatives (mp.diff) of the potential and the velocity field
for (a, b, x, y, c_, w, kind, name) in [(2, 3, '0.1', '0.2', '0.5', 2, 'benchmark', 'EX K04'), (2, 3, 0, 0, 0, 0, 'boundary', 'at the origin, no flow'), (-3, 3, '0.4', '-0.7', '-1', '0.25', 'transfer', 'a harmonic saddle (∇²V = 0)')]:
    a, b, x, y, c_, w = map(mp.mpf, (a, b, x, y, c_, w))
    V = lambda X, Y: a * X**2 + b * Y**2
    ux = lambda X, Y: c_ * X - w * Y
    uy = lambda X, Y: c_ * Y + w * X
    Ex = -mp.diff(lambda X: V(X, y), x)
    Ey = -mp.diff(lambda Y: V(x, Y), y)
    lap = mp.diff(lambda X: V(X, y), x, 2) + mp.diff(lambda Y: V(x, Y), y, 2)
    div = mp.diff(lambda X: ux(X, y), x) + mp.diff(lambda Y: uy(x, Y), y)
    curl = mp.diff(lambda X: uy(X, y), x) - mp.diff(lambda Y: ux(x, Y), y)
    case('K04', name, kind, {'a': a, 'b': b, 'x': x, 'y': y, 'c': c_, 'w': w}, {'V': V(x, y), 'Ex': Ex, 'Ey': Ey, 'lap': lap, 'div': div, 'curl': curl}, method='mpmath.diff (numerical derivatives)', tol=1e-12, scale={'V': 1e-9, 'Ex': 1e-9, 'Ey': 1e-9, 'lap': 1e-9, 'div': 1e-9, 'curl': 1e-9})

# K05: groups by counting; the period of θ″ = −(g/L)θ from the first zero of θ′ (odefun)
mp.mp.dps = 30
for (nv, kd, Lp, g, kind, name) in [(4, 3, 1, '9.8', 'benchmark', 'EX K05'), (3, 3, '0.25', '1.62', 'boundary', 'as many dimensions as variables'), (4, 3, '2.5', '3.71', 'transfer', 'on Mars')]:
    Lp, g = mp.mpf(Lp), mp.mpf(g)
    om = mp.sqrt(g / Lp)
    sol = mp.odefun(lambda t, y: [y[1], -g / Lp * y[0]], 0, [mp.mpf(1), mp.mpf(0)])
    half = mp.findroot(lambda t: sol(t)[1], (mp.mpf('0.6') * pi / om, mp.mpf('1.4') * pi / om), solver='anderson')
    case('K05', name, kind, {'nv': nv, 'kd': kd, 'len': Lp, 'g': g, 'C': 2 * pi}, {'np': nv - kd, 'T': 2 * half}, method='counting; period from the zero of θ′ (mpmath.odefun, findroot)', tol=1e-12, scale={'np': 1e-9})
mp.mp.dps = 50

# K06: t statistic and interval; the decision by comparing the interval with the reference value
for (mean, s, n, mu0, tc, kind, name) in [('9.79', '0.05', 20, '9.81', '2.093', 'benchmark', 'EX K06'), ('9.70', '0.05', 20, '9.81', '2.093', 'transfer', 'a clear deviation'), ('9.81', '0.05', 2, '9.80', '12.706', 'boundary', 'two measurements')]:
    mean, s, mu0, tc = map(mp.mpf, (mean, s, mu0, tc))
    se = mp.sqrt(s**2 / n)
    lo, hi = mean - tc * se, mean + tc * se
    reject = 0 if lo <= mu0 <= hi else 1
    case('K06', name, kind, {'mean': mean, 's': s, 'n': n, 'mu0': mu0, 'tc': tc}, {'se': se, 't': (mean - mu0) / se, 'lo': lo, 'hi': hi, 'reject': reject}, method='standard error; interval contains μ₀?', tol=1e-12, scale={'reject': 1, 't': 1e-9})

# K07: −2m ω × v and −m ω × (ω × r) as cross products; the Earth with Ω tilted by the latitude
def cross(u, v):
    return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
for (m, w, v, r, lat, W, kind, name) in [(1, '0.5', 2, 3, 40, '7.2921e-5', 'benchmark', 'EX K07'), (1, 0, 2, 3, 0, '7.2921e-5', 'boundary', 'no rotation; at the equator'), ('60', '1.2', '1.5', '4', '-33.9', '7.2921e-5', 'transfer', 'a carousel; the southern hemisphere')]:
    m, w, v, r, W = map(mp.mpf, (m, w, v, r, W))
    om = [0, 0, w]
    Fc = cross([-2 * m * q for q in om], [v, 0, 0])
    Fcf = cross([-m * q for q in om], cross(om, [r, 0, 0]))
    Om = [0, W * mp.cos(deg(lat)), W * mp.sin(deg(lat))]
    aC = cross([-2 * q for q in Om], [v, 0, 0])
    case('K07', name, kind, {'m': m, 'w': w, 'v': v, 'r': r, 'lat': deg(lat), 'W': W}, {'Fc': mp.norm(Fc), 'Fcf': mp.norm(Fcf), 'aE': -aC[1]}, method='cross products (horizontal component, positive to the right of an eastward motion)', tol=1e-12, scale={'Fc': 1e-12, 'Fcf': 1e-12, 'aE': 1e-15})

# K08: L1 and L2 from the exact collinear equation (findroot); their mean distance is the Hill radius to second order
def collinear(mu_):
    fx = lambda x: x - (1 - mu_) * (x + mu_) / abs(x + mu_)**3 - mu_ * (x - 1 + mu_) / abs(x - 1 + mu_)**3
    rh = mp.cbrt(mu_ / 3)
    x1 = mp.findroot(fx, 1 - mu_ - rh)
    x2 = mp.findroot(fx, 1 - mu_ + rh)
    return ((1 - mu_ - x1) + (x2 - (1 - mu_))) / 2
routh = (1 - mp.sqrt(mp.mpf(23) / 27)) / 2
for (mu_, a, kind, name, tol) in [('3.003e-6', '1.496e11', 'benchmark', 'EX K08 (Sun–Earth)', 1e-4), ('9.537e-4', '7.785e11', 'transfer', 'Sun–Jupiter', 5e-3)]:
    mu_, a = mp.mpf(mu_), mp.mpf(a)
    case('K08', name, kind, {'mu': mu_, 'a': a}, {'rH': a * collinear(mu_), 'L4': a, 'stable': 1 if mu_ < routh else 0}, conds={'small': 'applicable'}, method='exact collinear equation (findroot), mean of the L1 and L2 distances; Routh (1 − √(23/27))/2', tol=tol)
for (mu_, a, kind, name, st) in [('0.04', 1, 'boundary', 'just above the Routh value', 'approximate'), ('0.1', 1, 'boundary', 'not a small mass ratio', 'notApplicable')]:
    mu_, a = mp.mpf(mu_), mp.mpf(a)
    rH = APPROX(a * mp.cbrt(mu_ / 3)) if st == 'approximate' else NA_()
    case('K08', name, kind, {'mu': mu_, 'a': a}, {'rH': rH, 'L4': a, 'stable': 0}, conds={'small': st}, method='Hill formula as an approximate answer; Routh criterion', tol=1e-12)

# K09: Lamé constants and the inverted 3 × 3 stiffness for uniaxial stress
for (E, nu, tau, eps, kind, name) in [('2e11', '0.3', '5e7', '1e-3', 'benchmark', 'EX K09 (steel)'), ('7e10', '0.33', '2e7', '-5e-4', 'transfer', 'aluminium in compression'), ('2e11', 0, '5e7', '1e-3', 'boundary', 'ν = 0: no lateral strain')]:
    E, nu, tau, eps = map(mp.mpf, (E, nu, tau, eps))
    lam = E * nu / ((1 + nu) * (1 - 2 * nu)); muL = E / (2 * (1 + nu))
    C = mp.matrix([[lam + 2 * muL, lam, lam], [lam, lam + 2 * muL, lam], [lam, lam, lam + 2 * muL]])
    st = mp.lu_solve(C, mp.matrix([E * eps, 0, 0]))
    case('K09', name, kind, {'E': E, 'nu': nu, 'tau': tau, 'eps': eps}, {'G': muL, 'K': lam + 2 * muL / 3, 'gamma': tau / muL, 'epsT': st[1], 'dV': st[0] + st[1] + st[2]}, conds={'nu': 'applicable'}, method='Lamé constants; uniaxial stress through the inverted stiffness (lu_solve)', tol=1e-12, scale={'epsT': 1e-15, 'dV': 1e-15})
E, nu, tau, eps = mp.mpf('1e7'), mp.mpf('0.5'), mp.mpf('1e5'), mp.mpf('0.01')
case('K09', 'ν = 0.5: incompressible, no bulk modulus', 'boundary', {'E': E, 'nu': nu, 'tau': tau, 'eps': eps}, {'G': E / 3, 'K': NA_(), 'gamma': 3 * tau / E, 'epsT': -eps / 2, 'dV': 0}, conds={'nu': 'notApplicable'}, method='incompressible limit: G = E/3, ΔV = 0', tol=1e-12, scale={'dV': 1e-15})

# K10: return mapping with linear hardening in 400 strain increments
def bilinear(E, sy, Et, eps, steps=400):
    H = E * Et / (E - Et)
    sig = mp.mpf(0); ep = mp.mpf(0); alpha = mp.mpf(0)
    for i in range(1, steps + 1):
        e_ = eps * i / steps
        trial = E * (e_ - ep)
        f_ = abs(trial) - (sy + H * alpha)
        if f_ > 0:
            dg = f_ / (E + H)
            sig = trial - E * dg * mp.sign(trial)
            ep += dg * mp.sign(trial); alpha += dg
        else:
            sig = trial
    return sig, ep
for (E, sy, Et, eps, kind, name, st) in [('2e11', '2.5e8', '2e9', '0.004', 'benchmark', 'EX K10', 'applicable'), ('2e11', '2.5e8', '2e9', '0.001', 'boundary', 'still elastic', 'notApplicable'), ('2e11', '2.5e8', 0, '0.004', 'limit', 'perfectly plastic (E_t = 0)', 'applicable'), ('7e10', '2.7e8', '7e8', '0.02', 'transfer', 'aluminium, 2 %', 'applicable')]:
    E, sy, Et, eps = map(mp.mpf, (E, sy, Et, eps))
    sig, ep = bilinear(E, sy, Et, eps)
    case('K10', name, kind, {'E': E, 'sy': sy, 'Et': Et, 'eps': eps}, {'epsY': sy / E, 'sigma': sig, 'epsP': ep}, conds={'yield': st}, method='return mapping, linear hardening H = E·E_t/(E − E_t), 400 increments', tol=1e-12, scale={'epsP': 1e-15})

# K11: shooting for w″ + λ w = 0 on the effective length (odefun, findroot): λ₁ = (k L_e)²
mp.mp.dps = 30
sol_cache = {}
def first_eig():
    def w_end(lam):
        s = mp.odefun(lambda t, y: [y[1], -lam * y[0]], 0, [mp.mpf(0), mp.mpf(1)])
        return s(1)[0]
    return mp.findroot(w_end, mp.mpf(9.5))
lam1 = first_eig()
mp.mp.dps = 50
for (E, I, Lc, K, Ar, kind, name) in [('2e11', '8.333e-9', 2, 1, '1e-4', 'benchmark', 'EX K11 (pinned–pinned)'), ('2e11', '8.333e-9', 2, 2, '1e-4', 'boundary', 'fixed–free'), ('7e10', '2.0e-8', '1.5', '0.5', '3e-4', 'transfer', 'aluminium, fixed–fixed')]:
    E, I, Lc, K, Ar = map(mp.mpf, (E, I, Lc, K, Ar))
    P = lam1 * E * I / (K * Lc)**2
    case('K11', name, kind, {'E': E, 'I': I, 'len': Lc, 'K': K, 'Ar': Ar}, {'P': P, 'sigma': P / Ar, 'lam': K * Lc / mp.sqrt(I / Ar)}, method='shooting on the effective length (mpmath.odefun, findroot)', tol=1e-12)

# K12: integrate the Maxwell and Kelvin–Voigt equations (odefun)
mp.mp.dps = 30
for (E, eta, e0, s0, t, kind, name) in [('1e6', '1e7', '0.01', '1e4', 5, 'benchmark', 'EX K12'), ('1e6', '1e7', '0.01', '1e4', 0, 'boundary', 'at the step'), ('3e6', '6e6', '0.02', '5e4', 6, 'limit', 'after three time constants')]:
    E, eta, e0, s0, t = map(mp.mpf, (E, eta, e0, s0, t))
    if t > 0:
        sM = mp.odefun(lambda tt, y: [-E / eta * y[0]], 0, [E * e0])(t)[0]
        eK = mp.odefun(lambda tt, y: [(s0 - E * y[0]) / eta], 0, [mp.mpf(0)])(t)[0]
    else:
        sM, eK = E * e0, mp.mpf(0)
    case('K12', name, kind, {'E': E, 'eta': eta, 'eps0': e0, 's0': s0, 't': t}, {'tau': eta / E, 'sM': sM, 'eK': eK}, method='mpmath.odefun of σ′ = −Eσ/η and ηε′ + Eε = σ₀', tol=1e-12, scale={'eK': 1e-15})
mp.mp.dps = 50

# K13: phase speed ω/k with ω from the dispersion relation solved for ω by findroot
for (h, lam, g, kind, name) in [(2, 20, '9.8', 'benchmark', 'EX K13'), ('0.01', 100, '9.8', 'limit', 'very shallow: c → √(gh)'), (10, 20, '9.8', 'boundary', 'deep water (h = λ/2)'), (4000, 200000, '9.8', 'transfer', 'tsunami in the open ocean')]:
    h, lam, g = map(mp.mpf, (h, lam, g))
    k = 2 * pi / lam
    om = mp.findroot(lambda o: o**2 - g * k * mp.tanh(k * h), mp.sqrt(g * k))
    c0 = mp.sqrt(g * h)
    case('K13', name, kind, {'h': h, 'lam': lam, 'g': g}, {'cs': c0, 'c': om / k, 'ratio': om / k / c0}, method='ω from ω² = gk·tanh(kh) (findroot); c = ω/k', tol=1e-12)

# K14: surface and layer energy balance as a linear system in T⁴ (lu_solve)
for (S0, al, ep, kind, name) in [(1361, '0.3', '0.78', 'benchmark', 'EX K14 (Earth)'), (1361, '0.3', 0, 'boundary', 'no greenhouse layer'), (1361, '0.3', 1, 'limit', 'a fully absorbing layer'), (586, '0.25', '0.1', 'transfer', 'Mars, thin atmosphere')]:
    S0, al, ep = map(mp.mpf, (S0, al, ep))
    sg = mp.mpf('5.670374419e-8')
    F = S0 * (1 - al) / 4
    # unknowns X = σTs⁴, Y = σTa⁴: surface F + εY = X; layer εX = 2εY (for ε = 0 the layer drops out: Y = X/2 is harmless)
    sol = mp.lu_solve(mp.matrix([[1, -ep], [1, -2]]), mp.matrix([F, 0]))
    Ts = (sol[0] / sg) ** (mp.mpf(1) / 4)
    Te = (F / sg) ** (mp.mpf(1) / 4)
    case('K14', name, kind, {'S0': S0, 'al': al, 'ep': ep, 'sig': sg}, {'Te': Te, 'Ts': Ts, 'dT': Ts - Te}, method='energy balance of surface and layer (lu_solve)', tol=1e-12, scale={'dT': 1e-9})

# K15: nodal analysis with four conductances (lu_solve)
for (k1, d1, k2, d2, Ar, Ti, To, hi, ho, kind, name) in [('0.8', '0.2', '0.04', '0.05', 10, '293.15', '273.15', 8, 25, 'benchmark', 'EX K15'), ('0.8', '0.2', '0.04', '0.05', 10, '293.15', '293.15', 8, 25, 'boundary', 'no temperature difference'), ('1.0', '0.004', '0.025', '0.016', '2.5', '294.15', '263.15', '7.7', 25, 'transfer', 'glass with an air gap')]:
    k1, d1, k2, d2, Ar, Ti, To, hi, ho = map(mp.mpf, (k1, d1, k2, d2, Ar, Ti, To, hi, ho))
    g1, g2, g3, g4 = hi * Ar, k1 * Ar / d1, k2 * Ar / d2, ho * Ar
    # nodes: inner surface A, interface B, outer surface C
    Mx = mp.matrix([[g1 + g2, -g2, 0], [-g2, g2 + g3, -g3], [0, -g3, g3 + g4]])
    T_ = mp.lu_solve(Mx, mp.matrix([g1 * Ti, 0, g4 * To]))
    Q = g1 * (Ti - T_[0])
    T1 = mp.lu_solve(Mx, mp.matrix([g1, 0, 0]))  # 1 K across the wall: R = 1 K / heat flow
    R_ = 1 / (g1 * (1 - T1[0]))
    case('K15', name, kind, {'k1': k1, 'd1': d1, 'k2': k2, 'd2': d2, 'Ar': Ar, 'Ti': Ti, 'To': To, 'hi': hi, 'ho': ho}, {'R': R_, 'Q': Q, 'T12': T_[1]}, method='nodal analysis of the conductance network (lu_solve)', tol=1e-12, scale={'Q': 1e-9})

# K16: reversed Carnot cycle of an ideal gas: Q from the isothermal works, scaled to the given W
for (Tc, Th, W, kind, name) in [('268.15', '308.15', 1000, 'benchmark', 'EX K16'), ('255.15', '298.15', 500, 'transfer', 'a freezer'), ('300', '300', 1000, 'boundary', 'equal temperatures')]:
    Tc, Th, W = map(mp.mpf, (Tc, Th, W))
    ins = {'Tc': Tc, 'Th': Th, 'W': W}
    if Th <= Tc:
        case('K16', name, kind, ins, {'copC': NA_(), 'copH': NA_(), 'Qc': NA_(), 'Qh': NA_()}, conds={'order': 'notApplicable'}, method='no cycle between equal temperatures')
        continue
    nR_ln = 1  # n R ln(V2/V1) of the isotherms (any value; the ratios do not depend on it)
    qc, qh = nR_ln * Tc, nR_ln * Th
    s = W / (qh - qc)
    case('K16', name, kind, ins, {'copC': qc / (qh - qc), 'copH': qh / (qh - qc), 'Qc': qc * s, 'Qh': qh * s}, conds={'order': 'applicable'}, method='reversed Carnot cycle: isothermal heats nRT·ln(V₂/V₁)', tol=1e-12)

# K17: the flux density vector P/(4πr²)·r̂ dotted with a tilted unit normal
for (P, r, th, kind, name) in [(100, 2, 30, 'benchmark', 'EX K17'), (100, 2, 90, 'boundary', 'grazing incidence'), (60, 10, 0, 'transfer', 'normal incidence far away')]:
    P, r = mp.mpf(P), mp.mpf(r)
    S = [0, 0, P / (4 * pi * r**2)]
    nrm = [mp.sin(deg(th)), 0, mp.cos(deg(th))]
    E_ = mp.fsum(a * b for a, b in zip(S, nrm))
    case('K17', name, kind, {'P': P, 'r': r, 'th': deg(th)}, {'E': E_, 'E0': mp.norm(S)}, method='flux vector · unit normal', tol=1e-12, scale={'E': 1})

# K18: complex beam parameter q = z + i z_R; 1/q = 1/R − iλ/(πw²); Gouy = π/2 − arg q
for (lam, w0, z, kind, name) in [('633e-9', '5e-4', 1, 'benchmark', 'EX K18'), ('633e-9', '5e-4', None, 'boundary', 'at the Rayleigh range'), ('1064e-9', '2e-3', 1000, 'limit', 'far field')]:
    lam, w0 = mp.mpf(lam), mp.mpf(w0)
    zR = pi * w0**2 / lam
    z = zR if z is None else mp.mpf(z)
    q = mp.mpc(z, zR)
    iq = 1 / q
    R_ = 1 / iq.real
    w = mp.sqrt(-lam / (pi * iq.imag))
    case('K18', name, kind, {'lam': lam, 'w0': w0, 'z': z}, {'zR': zR, 'w': w, 'R': R_, 'th': lam / (pi * w0), 'gouy': pi / 2 - mp.arg(q)}, method='complex beam parameter', tol=1e-12)

# K19: thin-lens power from the refraction matrices; exact reflection of the marginal ray at the sphere
def thin_power(n, R1, R2):
    # refraction at R1 (air → glass), zero thickness, refraction at −R2 (glass → air); power = −C of the system matrix
    M1 = mp.matrix([[1, 0], [-(n - 1) / R1, 1]])
    M2 = mp.matrix([[1, 0], [-(1 - n) / (-R2), 1]])
    M = M2 * M1
    return -M[1, 0]
def mirror_lsa(Rm, hh):
    # centre at (0, 0), vertex at (−Rm, 0); incoming ray y = hh travelling in −x, hits x = −√(Rm² − hh²)
    X = -mp.sqrt(Rm**2 - hh**2); Y = hh
    nx, ny = X / Rm, Y / Rm
    dx, dy = mp.mpf(-1), mp.mpf(0)
    dot = dx * nx + dy * ny
    rx, ry = dx - 2 * dot * nx, dy - 2 * dot * ny
    t = -Y / ry
    xf = X + t * rx
    return (Rm / 2) - (xf - (-Rm))  # paraxial focus minus marginal focus, measured from the vertex
for (nF, nd, nC, R1, R2, Rm, hh, kind, name) in [('1.5224', '1.5168', '1.5143', '0.1', '0.1', '0.5', '0.05', 'benchmark', 'EX K19 (BK7)'), ('1.63208', '1.62004', '1.61503', '0.2', '0.2', '1', '0.2', 'transfer', 'flint F2; a fast mirror'), ('1.5224', '1.5168', '1.5143', '0.1', '0.1', '0.5', '0.6', 'boundary', 'ray above the mirror')]:
    nF, nd, nC, R1, R2, Rm, hh = map(mp.mpf, (nF, nd, nC, R1, R2, Rm, hh))
    ins = {'nF': nF, 'nd': nd, 'nC': nC, 'R1': R1, 'R2': R2, 'Rm': Rm, 'hh': hh}
    fF, fd, fC = 1 / thin_power(nF, R1, R2), 1 / thin_power(nd, R1, R2), 1 / thin_power(nC, R1, R2)
    lsa = mirror_lsa(Rm, hh) if hh < Rm else NA_()
    case('K19', name, kind, ins, {'fF': fF, 'fd': fd, 'fC': fC, 'df': fC - fF, 'Vd': (nd - 1) / (nF - nC), 'lsa': lsa}, conds={'ray': 'applicable' if hh < Rm else 'notApplicable'}, method='refraction matrices (thin lens); exact reflection of the marginal ray', tol=1e-12)

# K20: nodal equations with an open-loop gain of 10¹⁸, then the supply limit
def opamp(Rin, Rf, Vin, inverting, A=mp.mpf('1e18')):
    if inverting:
        # (Vin − Vm)/Rin + (Vo − Vm)/Rf = 0, Vo = −A·Vm
        Mx = mp.matrix([[-1 / Rin - 1 / Rf, 1 / Rf], [A, 1]])
        s = mp.lu_solve(Mx, mp.matrix([-Vin / Rin, 0]))
    else:
        # Vm = Vo·Rin/(Rin + Rf), Vo = A·(Vin − Vm)
        Mx = mp.matrix([[1, -Rin / (Rin + Rf)], [A, 1]])
        s = mp.lu_solve(Mx, mp.matrix([0, A * Vin]))
    return s[1]
for (Rin, Rf, Vin, Vs, kind, name) in [('1e4', '4.7e4', '0.2', 12, 'benchmark', 'EX K20'), ('1e4', '4.7e4', 3, 12, 'boundary', 'saturated'), ('2.2e3', '2.2e3', '-1.5', 15, 'transfer', 'unity inverting, doubling')]:
    Rin, Rf, Vin, Vs = map(mp.mpf, (Rin, Rf, Vin, Vs))
    vi, vn = opamp(Rin, Rf, Vin, True), opamp(Rin, Rf, Vin, False)
    clamp = lambda v: min(max(v, -Vs), Vs)
    case('K20', name, kind, {'Rin': Rin, 'Rf': Rf, 'Vin': Vin, 'Vs': Vs}, {'Gi': opamp(Rin, Rf, 1, True), 'Gn': opamp(Rin, Rf, 1, False), 'Vi': clamp(vi), 'Vn': clamp(vn)}, method='nodal equations with open-loop gain 1e18 (lu_solve); supply limit', tol=1e-12)

# K21: truth tables with Python booleans
for (A_, B_, tpd, ng, kind, name) in [(1, 1, '1e-8', 3, 'benchmark', 'EX K21'), (0, 0, '1e-8', 1, 'boundary', 'both inputs low'), (1, 0, '5e-9', 5, 'transfer', 'one input high, five gates')]:
    a, b = bool(A_), bool(B_)
    case('K21', name, kind, {'A': A_, 'B': B_, 'tpd': mp.mpf(tpd), 'ng': ng}, {'and': int(a and b), 'or': int(a or b), 'xor': int(a != b), 'nand': int(not (a and b)), 'delay': ng * mp.mpf(tpd)}, conds={'bits': 'applicable'}, method='truth tables', tol=1e-12, scale={'and': 1, 'or': 1, 'xor': 1, 'nand': 1})
case('K21', 'an input between the levels', 'boundary', {'A': 0.5, 'B': 1, 'tpd': mp.mpf('1e-8'), 'ng': 2}, {'and': NA_(), 'or': NA_(), 'xor': NA_(), 'nand': NA_(), 'delay': mp.mpf('2e-8')}, conds={'bits': 'notApplicable'}, method='no logic level', tol=1e-12)

# K22: mAh → C, Wh; time from draining the stored energy at constant power
for (mAh, U, P, eta, kind, name) in [(3600, '3.7', 2, '0.9', 'benchmark', 'EX K22'), (3600, '3.7', 2, 1, 'boundary', 'lossless'), (10000, '3.7', 10, '0.85', 'transfer', 'a power bank')]:
    Q = mp.mpf(mAh) * mp.mpf('3.6'); U, P, eta = mp.mpf(U), mp.mpf(P), mp.mpf(eta)
    Wh = mp.mpf(mAh) / 1000 * U
    E_ = Wh * 3600
    case('K22', name, kind, {'Q': Q, 'U': U, 'P': P, 'eta': eta}, {'E': E_, 't': eta * Wh / P * 3600, 'I': P / (eta * U)}, method='mAh·V = mWh; constant-power drain', tol=1e-12)

# K23: rotate the Sun vector into the local frame; day length from the zero of the elevation (findroot)
def elev(phi, dl, H):
    s = [mp.cos(dl) * mp.cos(H), mp.cos(dl) * mp.sin(H), mp.sin(dl)]  # equatorial, x toward the meridian
    zen = [mp.cos(phi), 0, mp.sin(phi)]
    return mp.asin(mp.fsum(a * b for a, b in zip(s, zen)))
for (phi, dl, H, kind, name) in [(40, '23.44', 30, 'benchmark', 'EX K23'), (40, 0, 30, 'boundary', 'equinox: 12 h'), ('-33.9', '23.44', 45, 'transfer', 'southern winter'), (70, '23.44', 30, 'boundary', 'midnight sun: no sunset')]:
    p_, d_, H_ = deg(phi), deg(dl), deg(H)
    ins = {'phi': p_, 'dl': d_, 'H': H_, 'Td': 86400}
    noon = elev(p_, d_, 0)
    if abs(mp.tan(p_) * mp.tan(d_)) >= 1:
        case('K23', name, kind, ins, {'aN': noon, 'a': elev(p_, d_, H_), 'day': NA_()}, conds={'day': 'notApplicable'}, method='vector rotation')
        continue
    Hs = mp.findroot(lambda x: elev(p_, d_, x), pi / 2)
    case('K23', name, kind, ins, {'aN': noon, 'a': elev(p_, d_, H_), 'day': 2 * Hs / (2 * pi / 86400)}, conds={'day': 'applicable'}, method='vector rotation; sunset hour angle by findroot', tol=1e-12)

# K24: lit area by quadrature; synodic month from the relative angular rate (findroot); umbra by the tangent line
def lit(psi):
    i = pi - psi
    half = mp.quad(lambda y: mp.sqrt(1 - y**2), [-1, 1])
    ell = mp.quad(lambda y: mp.sqrt(1 - y**2) * mp.cos(i), [-1, 1])
    return (half + ell) / (2 * half)
def umbra(d, Rs, Re):
    # the external tangent meets the axis at distance L behind the small sphere: Re/L = Rs/(d + L)
    return mp.findroot(lambda L: Re * (d + L) - Rs * L, d * Re / Rs)
for (psi, Tm, Te, d, Rs, Re, kind, name) in [(90, '2360591.5104', '31558149.7632', '1.496e11', '6.957e8', '6.371e6', 'benchmark', 'EX K24 (first quarter; Earth’s umbra)'), (180, '2360591.5104', '31558149.7632', '1.496e11', '6.957e8', '6.371e6', 'boundary', 'full moon'), (0, '2360591.5104', '31558149.7632', '1.496e11', '6.957e8', '6.371e6', 'boundary', 'new moon'), (120, '2360591.5104', '31558149.7632', '1.496e11', '6.957e8', '1.7374e6', 'transfer', 'the Moon’s umbra (annular eclipses)')]:
    Tm, Te, d, Rs, Re = map(mp.mpf, (Tm, Te, d, Rs, Re))
    Ts = mp.findroot(lambda t: (2 * pi / Tm - 2 * pi / Te) * t - 2 * pi, Tm)
    case('K24', name, kind, {'psi': deg(psi), 'Tm': Tm, 'Te': Te, 'd': d, 'Rs': Rs, 'Re': Re}, {'k': lit(deg(psi)), 'Ts': Ts, 'Lu': umbra(d, Rs, Re)}, method='quadrature of the lit area; relative angular rate; tangent line', tol=1e-12, scale={'k': 1e-12})

# K25: β from the relativistic Doppler factor by findroot; cz as its first order; d = cz/H₀
Mpc = mp.mpf('3.0856775814913673e22')
H0 = mp.mpf(70000) / Mpc
for (lo, le, kind, name, st) in [('700e-9', '656.28e-9', 'benchmark', 'EX K25', 'approximate'), ('659.56140e-9', '656.28e-9', 'transfer', 'a nearby galaxy', 'applicable'), ('656.28e-9', '656.28e-9', 'boundary', 'no shift', 'applicable'), ('1312.56e-9', '656.28e-9', 'boundary', 'z = 1: cz no longer applies', 'notApplicable')]:
    lo, le = mp.mpf(lo), mp.mpf(le)
    z = (lo - le) / le
    beta = mp.findroot(lambda b: mp.sqrt((1 + b) / (1 - b)) - lo / le, z / 2) if z > 0 else mp.mpf(0)
    wrap = (lambda v: APPROX(v)) if st == 'approximate' else ((lambda v: NA_()) if st == 'notApplicable' else (lambda v: v))
    case('K25', name, kind, {'lo': lo, 'le': le, 'H0': H0, 'c': c}, {'z': z, 'v': wrap(c * z), 'vr': beta * c, 'd': wrap(c * z / H0)}, conds={'low': st}, method='relativistic Doppler factor (findroot); first order cz; Hubble distance', tol=1e-12, scale={'z': 1e-12, 'v': 1e-3, 'vr': 1e-3, 'd': 1})

# K26: t(a) = ∫₀ᵃ da′/(a′H(a′)) with H = H₀a^(−3/2) (quad); a at a given t by findroot
tq = lambda a: mp.quad(lambda x: mp.sqrt(x), [0, a]) / H0
t0 = tq(1)
for (fr, kind, name) in [('0.5', 'benchmark', 'EX K26'), (1, 'boundary', 'today'), ('0.1', 'transfer', 'a tenth of the age')]:
    fr = mp.mpf(fr)
    a = mp.findroot(lambda x: tq(x) - fr * t0, fr) if fr < 1 else mp.mpf(1)
    case('K26', name, kind, {'H0': H0, 'f': fr}, {'t0': t0, 'a': a, 'z': 1 / a - 1, 'H': H0 * a**mp.mpf(-1.5)}, method='quadrature of the Friedmann equation (EdS); findroot', tol=1e-12, scale={'z': 1e-12})

# K27: mean of the near- and far-side differences of exact 1/d² gravity (agrees with 2GMR/d³ to (R/d)²); Roche by formula
for (M, R_, d, rM, rm, kind, name, tol) in [('7.342e22', '6.371e6', '3.844e8', 5514, 3344, 'benchmark', 'EX K27 (Moon on Earth)', 2e-3), ('1.989e30', '6.371e6', '1.496e11', 5514, 3344, 'transfer', 'the Sun on the Earth', 1e-6), ('7.342e22', '6.371e6', '3.844e10', 5514, 3344, 'limit', 'a hundred times farther', 1e-6), ('7.342e22', '6.371e6', '3.844e8', 3344, 3344, 'boundary', 'equal densities: d_R = 2.44 R', 2e-3)]:
    M, R_, d, rM, rm = map(mp.mpf, (M, R_, d, rM, rm))
    near = G * M / (d - R_)**2 - G * M / d**2
    far = G * M / d**2 - G * M / (d + R_)**2
    case('K27', name, kind, {'G': G, 'M': M, 'R': R_, 'd': d, 'rM': rM, 'rm': rm}, {'da': (near + far) / 2, 'roche': mp.mpf('2.44') * R_ * mp.cbrt(rM / rm)}, method='exact 1/d² differences, mean of near and far side (first-order formula within tol); fluid Roche coefficient 2.44', tol=tol)

# K28: eigenvalues of the isotropic Christoffel matrix (mp.eigsy)
for (K, Gm, rho, D, kind, name) in [('5e10', '3e10', 3000, '1e5', 'benchmark', 'EX K28'), ('5.0e10', '3.0e10', 2700, '3.5e5', 'transfer', 'granite, 350 km'), ('2.2e9', 0, 1000, '1e5', 'boundary', 'water: no S wave')]:
    K, Gm, rho, D = map(mp.mpf, (K, Gm, rho, D))
    lam = K - 2 * Gm / 3
    Gam = mp.matrix([[lam + 2 * Gm, 0, 0], [0, Gm, 0], [0, 0, Gm]]) / rho
    ev, _ = mp.eigsy(Gam)
    vals = sorted([ev[i] for i in range(3)])
    vp = mp.sqrt(vals[2])
    ins = {'K': K, 'G': Gm, 'rho': rho, 'D': D}
    if Gm > 0:
        vs = mp.sqrt(vals[0])
        case('K28', name, kind, ins, {'vp': vp, 'vs': vs, 'dt': D / vs - D / vp}, conds={'solid': 'applicable'}, method='Christoffel matrix eigenvalues (mpmath.eigsy)', tol=1e-12)
    else:
        case('K28', name, kind, ins, {'vp': vp, 'vs': NA_(), 'dt': NA_()}, conds={'solid': 'notApplicable'}, method='Christoffel matrix eigenvalues (mpmath.eigsy)', tol=1e-12)

# K29: separation of variables; the first zero of J₀ from mpmath.besseljzero
for (Tm, sg, Lx, Ly, m, n, a, kind, name) in [(1000, '0.1', '0.5', '0.3', 1, 1, '0.15', 'benchmark', 'EX K29'), (1000, '0.1', '0.4', '0.4', 1, 1, '0.15', 'boundary', 'square membrane'), (2500, '0.25', '0.5', '0.3', 2, 1, '0.2', 'transfer', 'mode (2,1)')]:
    Tm, sg, Lx, Ly, a = map(mp.mpf, (Tm, sg, Lx, Ly, a))
    cw = mp.sqrt(Tm / sg)
    kmn = mp.sqrt((m * pi / Lx)**2 + (n * pi / Ly)**2)
    case('K29', name, kind, {'Tm': Tm, 'sg': sg, 'Lx': Lx, 'Ly': Ly, 'm': m, 'n': n, 'a': a}, {'c': cw, 'fmn': cw * kmn / (2 * pi), 'f01': mp.besseljzero(0, 1) * cw / (2 * pi * a)}, method='separation of variables; mpmath.besseljzero', tol=1e-12)

# K30: iterate the two schemes step by step
for (lam, h, N, kind, name) in [(50, '0.05', 20, 'benchmark', 'EX K30 (λh = 2.5)'), (50, '0.001', 20, 'boundary', 'small step'), (50, '0.02', 10, 'limit', 'λh = 1: explicit Euler jumps to zero')]:
    lam, h = mp.mpf(lam), mp.mpf(h)
    yE = mp.mpf(1); yI = mp.mpf(1)
    for _ in range(N):
        yE = yE + h * (-lam * yE)
        yI = yI / (1 + lam * h)  # solves y_{n+1} = y_n + h(−λ y_{n+1})
    case('K30', name, kind, {'lam': lam, 'h': h, 'N': N}, {'gE': 1 - lam * h, 'gI': 1 / (1 + lam * h), 'yE': yE, 'yI': yI, 'y': mp.exp(-lam * h * N), 'stable': 1 if lam * h <= 2 else 0}, method='N explicit and implicit Euler steps', tol=1e-12, scale={'gE': 1e-12, 'yE': 1e-30, 'yI': 1e-30, 'y': 1e-30})

# K31: numerical derivatives (mp.diff) and the maximum by findroot on ∂R/∂θ
for (v, th, g, kind, name) in [(20, 30, '9.8', 'benchmark', 'EX K31'), (20, 45, '9.8', 'boundary', 'at the optimum'), (30, 60, '9.81', 'transfer', 'steeper and faster')]:
    v, g = mp.mpf(v), mp.mpf(g)
    Rf = lambda vv, tt: vv**2 * mp.sin(2 * tt) / g
    t_ = deg(th)
    dth = mp.diff(lambda tt: Rf(v, tt), t_)
    dv = mp.diff(lambda vv: Rf(vv, t_), v)
    topt = mp.findroot(lambda tt: mp.diff(lambda u: Rf(v, u), tt), mp.mpf('0.7'))
    case('K31', name, kind, {'v': v, 'th': t_, 'g': g}, {'R': Rf(v, t_), 'dRdth': dth, 'dRdv': dv, 'Rmax': Rf(v, topt), 'Sth': t_ / Rf(v, t_) * dth}, method='mpmath.diff; optimum angle by findroot', tol=1e-12, scale={'dRdth': 10, 'Sth': 1})

# K32: CM by weighted sums; elastic collision from momentum and energy conservation (findroot)
for (m1, x1, v1, m2, x2, v2, kind, name) in [(1, 0, 3, 2, 1, 0, 'benchmark', 'EX K32'), (1, 0, 3, 1, 2, -1, 'boundary', 'equal masses exchange velocities'), (2, -1, '0.5', 10, 3, '-0.2', 'transfer', 'a heavy partner')]:
    m1, x1, v1, m2, x2, v2 = map(mp.mpf, (m1, x1, v1, m2, x2, v2))
    M = m1 + m2
    vc = (m1 * v1 + m2 * v2) / M
    Ktot = (m1 * v1**2 + m2 * v2**2) / 2
    P = m1 * v1 + m2 * v2
    # the non-trivial root of energy conservation with v2' = (P − m1 v1')/m2
    w1 = mp.findroot(lambda u: m1 * u**2 / 2 + m2 * ((P - m1 * u) / m2)**2 / 2 - Ktot, 2 * vc - v1 + mp.mpf('0.01'))
    w2 = (P - m1 * w1) / m2
    case('K32', name, kind, {'m1': m1, 'x1': x1, 'v1': v1, 'm2': m2, 'x2': x2, 'v2': v2}, {'xc': (m1 * x1 + m2 * x2) / M, 'vc': vc, 'u1': v1 - vc, 'u2': v2 - vc, 'Ki': Ktot - M * vc**2 / 2, 'w1': w1, 'w2': w2}, method='weighted sums; KE − ½Mv_C²; conservation of momentum and energy (findroot)', tol=1e-10, scale={'xc': 1e-9, 'vc': 1e-9, 'u1': 1e-9, 'u2': 1e-9, 'w1': 1e-9, 'w2': 1e-9})
