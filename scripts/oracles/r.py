from common import *

YEAR = mp.mpf('365.25') * 86400

def light_clock_gamma(v):
    """Ground time t of one tick of a light clock (proper tick 1 s): (ct/2)² = (c·1/2)² + (vt/2)² (findroot)."""
    return mp.findroot(lambda t: (c * t / 2)**2 - (c / 2)**2 - (v * t / 2)**2, (1, 1e6), solver='anderson')

# R01: γ from the light clock; the length from the time the rod takes to pass a ground clock
for (beta, tau, L0, kind, name) in [('0.6', 10, 5, 'benchmark', 'EX R01'), (0, 10, 5, 'boundary', 'at rest: classical values'), ('0.99', 1, 1, 'transfer', '0.99c'), (1, 10, 5, 'boundary', 'v = c is not allowed for a massive body')]:
    v = mp.mpf(beta) * c; tau, L0 = mp.mpf(tau), mp.mpf(L0)
    ins = {'v': v, 'tau': tau, 'L0': L0}
    if abs(v) < c:
        g = light_clock_gamma(v) if v != 0 else mp.mpf(1)
        Lm = v * ((L0 / v) / g) if v != 0 else L0
        case('R01', name, kind, ins, {'gam': g, 'dt': g * tau, 'Lm': Lm}, conds={'sub': 'applicable'}, method='light clock (findroot); passage time of the rod', tol=1e-12)
    else:
        case('R01', name, kind, ins, {'gam': NA_(), 'dt': NA_(), 'Lm': NA_()}, conds={'sub': 'notApplicable'}, method='no rest frame moving at c')

# R02: the boost as the matrix exponential of the rapidity generator acting on (ct, x)
def boost(v):
    phi = mp.atanh(v / c)
    return mp.expm(mp.matrix([[0, -phi], [-phi, 0]]))
for (beta, x, t, kind, name) in [('0.6', 3 * c, 5, 'benchmark', 'EX R02'), ('0.6', 0, 0, 'boundary', 'the common origin'), ('-0.8', '1e9', 2, 'transfer', 'S′ moving the other way, spacelike event'), ('0.6', 4 * c, 4, 'boundary', 'lightlike event: interval zero')]:
    v, x, t = mp.mpf(beta) * c, mp.mpf(x), mp.mpf(t)
    B = boost(v)
    ct2, x2 = B * mp.matrix([c * t, x])
    case('R02', name, kind, {'v': v, 'x': x, 't': t}, {'gam': B[0, 0], 'x2': x2, 't2': ct2 / c, 's2': (c * t)**2 - x**2}, conds={'sub': 'applicable'}, method='matrix exponential of the rapidity generator', tol=1e-12, scale={'x2': 1, 't2': 1e-8, 's2': 1e4})

# R03: transform two events of the object's worldline from the ship frame to the ground and take Δx/Δt
def compose(u1, v):
    g = mp.cosh(mp.atanh(v / c))
    ev = lambda tp, xp: (g * (tp + v * xp / c**2), g * (xp + v * tp))
    t0, x0 = ev(0, 0); t1, x1 = ev(1, u1)
    return (x1 - x0) / (t1 - t0)
for (u1, v, kind, name) in [(mp.mpf('0.5') * c, mp.mpf('0.5') * c, 'benchmark', 'EX R03'), (c, mp.mpf('0.6') * c, 'boundary', 'light stays at c'), (mp.mpf('-0.9') * c, mp.mpf('0.5') * c, 'transfer', 'thrown backwards'), (300, 200, 'transfer', 'everyday speeds: almost the classical sum'), (mp.mpf('0.5') * c, c, 'boundary', 'a ship at c is not an inertial frame')]:
    u1, v = mp.mpf(u1), mp.mpf(v)
    if abs(v) < c and abs(u1) <= c:
        case('R03', name, kind, {'u1': u1, 'v': v}, {'u': compose(u1, v), 'uc': u1 + v}, conds={'valid': 'applicable'}, method='events transformed to the ground frame', tol=1e-12)
    else:
        case('R03', name, kind, {'u1': u1, 'v': v}, {'u': NA_(), 'uc': u1 + v}, conds={'valid': 'notApplicable'}, method='no inertial frame at c')

# R04: kinetic energy as the work ∫ v dp from rest (quad, with dp/dv = mγ³ from the momentum p = mγv)
for (m, beta, kind, name) in [(me, '0.6', 'benchmark', 'EX R04'), (me, '1e-8', 'boundary', 'slow electron: no cancellation in E_k'), (mp_, '0.9', 'transfer', 'fast proton')]:
    v = mp.mpf(beta) * c
    p = lambda w: m * w / mp.sqrt(1 - (w / c)**2)
    K = mp.quad(lambda w: w * mp.diff(p, w), [0, v])
    case('R04', name, kind, {'m': m, 'v': v}, {'E0': m * c**2, 'E': m * c**2 + K, 'K': K, 'pc': p(v) * c}, conds={'sub': 'applicable'}, method='work integral ∫ v dp (quad)', tol=1e-11)

# R05: proper time as the sum of the Minkowski intervals of the two legs
for (T_, beta, kind, name) in [(10 * YEAR, '0.8', 'benchmark', 'EX R05'), (10 * YEAR, '1e-6', 'boundary', 'slow trip: tiny difference without cancellation'), (20 * YEAR, '0.99', 'transfer', '0.99c for 20 years')]:
    v = mp.mpf(beta) * c
    leg = lambda dt, dx: mp.sqrt(dt**2 - (dx / c)**2)
    tau = leg(T_ / 2, v * T_ / 2) + leg(T_ / 2, -v * T_ / 2)
    case('R05', name, kind, {'Tg': T_, 'v': v}, {'tau': tau, 'diff': T_ - tau}, conds={'sub': 'applicable'}, method='Minkowski interval of each leg', tol=1e-11)

# R06: the exact Schwarzschild clock rate ratio for a planet with the same surface g (radius 6371 km); the weak
# uniform-field formula differs by about h/R
RE = mp.mpf('6.371e6')
for (g, dh, tol, kind, name) in [('9.8', 100, 5e-5, 'benchmark', 'EX R06 (Schwarzschild, h/R ≈ 1.6e−5)'), ('9.8', 1, 5e-7, 'limit', '1 m: the uniform-field limit'), ('9.8', 0, 1e-12, 'boundary', 'no height difference'), ('9.8', '2e5', 1e-3, 'transfer', '200 km: outside the uniform field')]:
    g, dh = mp.mpf(g), mp.mpf(dh)
    M = g * RE**2 / G; rs = 2 * G * M / c**2
    df = mp.sqrt((1 - rs / (RE + dh)) / (1 - rs / RE)) - 1
    q = dh / RE
    ex = {'df': df if q < mp.mpf('1.6e-3') else ({'state': 'approximate', 'value': df} if q < mp.mpf('1.6e-2') else NA_())}
    case('R06', name, kind, {'g': g, 'h': dh, 'Rp': RE}, ex, method='exact Schwarzschild rate ratio', tol=tol, scale={'df': 1e-20})

# R07: the exact deflection from the photon orbit integral α = 2∫₀^{u0} du/√(1/b² − u² + 2m u³) − π (quad, u0 by
# findroot); tolerances follow the size of the neglected orders
def deflection(mg, b):
    f = lambda u: 1 / b**2 - u**2 + 2 * mg * u**3
    u0 = mp.findroot(f, (1 / b * mp.mpf('0.5'), 1 / b * mp.mpf('1.5')), solver='anderson')
    return 2 * mp.quad(lambda u: 1 / mp.sqrt(f(u)), [0, u0]) - mp.pi
for (M, b, tol, outs, kind, name) in [
        (c**2 / G, 100, 2e-3, ('rs', 'a2', 'a1s'), 'benchmark', 'EX R07: second order vs the exact orbit integral (third order ~1e−3)'),
        (c**2 / G, '1e5', 5e-5, ('a1', 'a2'), 'limit', 'weak-field limit b = 10⁵ GM/c²'),
        (mp.mpf('1.98847e30'), mp.mpf('6.957e8'), 1e-5, ('rs', 'a1', 'a2'), 'transfer', 'grazing the Sun'),
        (c**2 / G, 4, 1e-12, ('rs', 'cap'), 'boundary', 'b below 3√3 GM/c²: captured')]:
    M, b = mp.mpf(M), mp.mpf(b)
    mg = G * M / c**2
    ex = {}
    if 'rs' in outs:
        ex['rs'] = 2 * mg
    if 'cap' in outs:
        ex.update({'a1': NA_(), 'a2': NA_()})
        case('R07', name, kind, {'M': M, 'b': b}, ex, conds={'escapes': 'notApplicable'}, method='no turning point: the photon is captured', tol=tol)
        continue
    al = deflection(mg, b)
    if 'a1' in outs:
        ex['a1'] = al
    if 'a1s' in outs:
        ex['a1'] = {'state': 'approximate'}
    if 'a2' in outs:
        ex['a2'] = al
    case('R07', name, kind, {'M': M, 'b': b}, ex, conds={'escapes': 'applicable'}, method='photon orbit integral (quad)', tol=tol)

# R08: luminosity by integrating Planck's spectral exitance over all wavelengths (dimensionless quadrature);
# the radius ratio by solving L(R) = Lr·L_ref (findroot)
I3 = mp.quad(lambda x: x**3 / mp.expm1(x), [0, 1, 10, mp.inf])
def lum(R_, T_):
    return 4 * mp.pi * R_**2 * 2 * mp.pi * (kB * T_)**4 / (h**3 * c**2) * I3
for (Rs, Ts, Lr, Tr, kind, name) in [('6.957e8', 5772, 4, 1, 'benchmark', 'EX R08 (the Sun; ratio 4 at equal temperature)'), ('6.957e8', 5772, 1, 1, 'boundary', 'identical stars'), ('1.711e9', 9940, '25.4', mp.mpf(9940) / 5772, 'transfer', 'a hotter, larger star')]:
    Rs, Ts, Lr, Tr = map(mp.mpf, (Rs, Ts, Lr, Tr))
    Rr = mp.findroot(lambda q: lum(q * Rs, Tr * Ts) - Lr * lum(Rs, Ts), 1)
    case('R08', name, kind, {'Rs': Rs, 'Ts': Ts, 'Lr': Lr, 'Tr': Tr}, {'Lum': lum(Rs, Ts), 'Rr': Rr}, method='Planck spectrum integrated (quad); ratio by findroot', tol=1e-12)
