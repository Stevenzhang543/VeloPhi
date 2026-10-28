from common import *

# M17/M18: solve the conservation equations (momentum + energy, or common velocity) with findroot
def elastic(m1, m2, u1, u2):
    # centre-of-mass frame: an elastic collision reverses each velocity relative to the centre of mass
    vcm = (m1 * u1 + m2 * u2) / (m1 + m2)
    return 2 * vcm - u1, 2 * vcm - u2
for (m1, m2, u1, u2, kind, name) in [(1, 2, 3, 0, 'benchmark', 'EX M17'), (2, 2, 3, -1, 'transfer', 'equal masses exchange velocities'), (1, 1e6, 3, 0, 'limit', 'very heavy target: bounces back')]:
    m1, m2, u1, u2 = map(mp.mpf, (m1, m2, u1, u2))
    v1, v2 = elastic(m1, m2, u1, u2)
    case('M17', name, kind, {'m1': m1, 'm2': m2, 'u1': u1, 'u2': u2}, {'v1': v1, 'v2': v2, 'p': m1 * u1 + m2 * u2, 'Ek': (m1 * u1**2 + m2 * u2**2) / 2}, method='reflection in the centre-of-mass frame', tol=1e-9, scale={'v1': 1, 'v2': 1})
case('M17', 'separating bodies: no collision', 'boundary', {'m1': 1, 'm2': 2, 'u1': 0, 'u2': 3}, {'v1': NA_(), 'v2': NA_()}, conds={'approach': 'notApplicable'}, method='no contact')
for (m1, m2, u1, u2, kind, name) in [(1, 2, 3, 0, 'benchmark', 'EX M18'), (1, 1, 2, -2, 'transfer', 'head-on with opposite velocities'), (1, 2, 0, 3, 'boundary', 'separating: no collision')]:
    m1, m2, u1, u2 = map(mp.mpf, (m1, m2, u1, u2))
    if u1 <= u2:
        case('M18', name, kind, {'m1': m1, 'm2': m2, 'u1': u1, 'u2': u2}, {'v': NA_(), 'loss': NA_()}, conds={'approach': 'notApplicable'}, method='no contact')
        continue
    v = mp.findroot(lambda v: (m1 + m2) * v - (m1 * u1 + m2 * u2), 0)
    E0 = (m1 * u1**2 + m2 * u2**2) / 2; E1 = (m1 + m2) * v**2 / 2
    case('M18', name, kind, {'m1': m1, 'm2': m2, 'u1': u1, 'u2': u2}, {'v': v, 'Ek0': E0, 'Ek1': E1, 'loss': E0 - E1}, method='momentum equation; energy difference', tol=1e-10, scale={'v': 1, 'Ek1': 1})

# M19: impulse from the change of momentum along the normal
for (m, vn, vt, e_, kind, name) in [(1, -4, 3, '0.5', 'benchmark', 'EX M19'), (1, -4, 3, 1, 'limit', 'elastic: no loss'), (1, 2, 3, '0.5', 'boundary', 'moving away from the wall')]:
    e_ = mp.mpf(e_)
    if vn >= 0:
        case('M19', name, kind, {'m': m, 'vn': vn, 'vt': vt, 'e': e_}, {'vn2': NA_(), 'J': NA_()}, conds={'approach': 'notApplicable'}, method='no impact')
        continue
    vn2 = -e_ * vn
    K0 = m * (vn**2 + vt**2) / 2; K1 = m * (vn2**2 + vt**2) / 2
    case('M19', name, kind, {'m': m, 'vn': vn, 'vt': vt, 'e': e_}, {'vn2': vn2, 'vt2': vt, 'J': m * (vn2 - vn), 'loss': K0 - K1}, method='Newton restitution, momentum change, kinetic energies', tol=1e-12, scale={'loss': 1})

# M20: integrate θ″ = τ/I numerically; I by integrating the mass distribution of the disc (quadrature)
for (m, R, tau, t, kind, name) in [(2, '0.5', 1, 3, 'benchmark', 'EX M20'), (2, '0.5', 0, 3, 'boundary', 'no torque'), (5, '0.2', '-0.5', 2, 'transfer', 'negative torque')]:
    R, tau = mp.mpf(R), mp.mpf(tau)
    sigma_ = m / (mp.pi * R**2)
    I = mp.quad(lambda r: sigma_ * r**2 * 2 * mp.pi * r, [0, R])
    y = ode(lambda tt, yy: [yy[1], tau / I], [0, 0], t)
    case('M20', name, kind, {'m': m, 'R': R, 'tau': tau, 't': t}, {'I': I, 'alpha': tau / I, 'omega': y[1], 'Ek': I * y[1]**2 / 2, 'W': tau * y[0]}, method='inertia by quadrature, ODE for the rotation', tol=1e-10, scale={'alpha': 1, 'omega': 1, 'Ek': 1, 'W': 1})

# M21: torque balance and force balance as a linear system
for (F1, l1, l2, phi, kind, name) in [(30, '0.2', '0.5', 0, 'benchmark', 'EX M21'), (30, '0.2', '0.5', mp.pi / 3, 'transfer', 'right force at 60° to the vertical'), (0, '0.2', '0.5', 0, 'boundary', 'no load')]:
    l1, l2 = mp.mpf(l1), mp.mpf(l2)
    F2 = mp.findroot(lambda F2: F1 * l1 - F2 * mp.cos(phi) * l2, 1)
    case('M21', name, kind, {'F1': F1, 'l1': l1, 'l2': l2, 'phi': phi}, {'F2': F2, 'N': F1 + F1 * l1 / l2}, method='torque balance (findroot)', tol=1e-10, scale={'F2': 1, 'N': 1})

# M22: rolling: solve m a = mg sinθ − f, I α = f R, a = αR as a linear system; threshold from f/N
def m22(th, g, k, muS, muK):
    A_ = mp.matrix([[1, 1, 0], [0, -1, k], [1, 0, -1]])  # a + f/m = g sinθ; −f/m + k (αR) = 0; a − αR = 0
    b = mp.matrix([g * mp.sin(th), 0, 0])
    x = mp.lu_solve(A_, b)
    a, fm = x[0], x[1]
    mumin = fm / (g * mp.cos(th))
    if muS >= mumin:
        return mumin, a, 'rolls'
    return mumin, g * (mp.sin(th) - muK * mp.cos(th)), 'slips'
for (th, k, muS, muK, kind, name) in [(mp.pi / 6, '0.5', '0.3', '0.25', 'benchmark', 'EX M22 cylinder'), (mp.pi / 6, '0.4', '0.3', '0.25', 'transfer', 'solid sphere k = 2/5 (3D result)'), (mp.pi / 6, '0.5', '0.1', '0.08', 'boundary', 'μs too small: slips')]:
    k, muS, muK = mp.mpf(k), mp.mpf(muS), mp.mpf(muK); g = mp.mpf('9.8')
    mumin, a, br = m22(th, g, k, muS, muK)
    case('M22', name, kind, {'theta': th, 'g': g, 'k': k, 'muS': muS, 'muK': muK}, {'muMin': mumin, 'a': a}, conds={'rolls': 'applicable' if br == 'rolls' else 'notApplicable'}, method='linear equations of rolling; threshold f/N', tol=1e-12)

# M23: integrate v and ω until the contact point stops slipping (findroot), heat from energy difference
def m23(m, v0, mu, g, k):
    a = mu * g; R = 1
    alpha = mu * g / (k * R)
    ts = mp.findroot(lambda t: (v0 - a * t) - alpha * t * R, v0 / (3 * a))
    vs = v0 - a * ts
    Q = m * v0**2 / 2 - (m * vs**2 / 2 + k * m * R**2 * (vs / R)**2 / 2)
    return ts, vs, Q
for (m, v0, mu, k, kind, name) in [(1, 3, '0.2', '0.5', 'benchmark', 'EX M23'), (1, 3, '0.2', '0.4', 'transfer', 'solid sphere'), (1, 3, '0.2', '1e-6', 'limit', 'almost no inertia: rolls at once')]:
    mu, k = mp.mpf(mu), mp.mpf(k)
    ts, vs, Q = m23(m, v0, mu, 10, k)
    case('M23', name, kind, {'m': m, 'v0': v0, 'muK': mu, 'g': 10, 'k': k}, {'t': ts, 'v': vs, 'Q': Q}, method='root of the slip velocity; energy balance', tol=1e-9, scale={'t': 1, 'Q': 1})
case('M23', 'very slow start', 'boundary', {'m': 1, 'v0': '1e-6' and 1e-6, 'muK': 0.2, 'g': 10, 'k': 0.5}, {'t': mp.mpf('1e-6') / (3 * mp.mpf('0.2') * 10), 'v': mp.mpf('1e-6') * 2 / 3}, method='closed form check at a tiny speed', tol=1e-9)

# M24/M25: energy between bottom and top; slack angle by root finding of the radial equation T(φ) = 0
def slack_angle(R, g, vb):
    def T_over_m(phi):
        v2 = vb**2 - 2 * g * R * (1 - mp.cos(phi))
        return v2 / R + g * mp.cos(phi)
    return mp.findroot(T_over_m, (mp.pi / 2 + 1e-9, mp.pi), solver='bisect')
for (vb, kind, name) in [(8, 'benchmark', 'EX M24 with 8 m/s at the bottom'), (6, 'transfer', 'too slow: rope goes slack'), (mp.sqrt(50), 'boundary', 'exactly √(5gR)')]:
    R, g, m = 1, 10, 1
    vb = mp.mpf(vb)
    ex = {'vtMin': mp.sqrt(g * R), 'vbMin': mp.sqrt(5 * g * R)}
    if vb**2 >= 5 * g * R - mp.mpf('1e-30'):
        vt = mp.sqrt(vb**2 - 4 * g * R); ex.update({'vt': vt, 'Tt': m * (vt**2 / R - g)})
    else:
        ex.update({'vt': NA_(), 'phiS': slack_angle(R, g, vb)})
    case('M24', name, kind, {'R': R, 'g': g, 'm': m, 'vb': vb}, ex, method='energy conservation; root of the rope force', tol=1e-9, scale={'Tt': 1})
for (vb, kind, name, tol) in [(7, 'benchmark', 'EX M25', 1e-9), (mp.sqrt(40), 'boundary', 'reaches the top at rest (ill-conditioned: √ near zero, tolerance √ε)', 2e-7), (10, 'transfer', 'fast: rod pulls at the top', 1e-9)]:
    R, g, m = 1, 10, 1
    vb = mp.mpf(vb); vt = mp.sqrt(max(vb**2 - 4 * g * R, 0))
    case('M25', name, kind, {'R': R, 'g': g, 'm': m, 'vb': vb}, {'vt': vt, 'Ft': m * (vt**2 / R - g)}, method='energy conservation, radial equation', tol=tol, scale={'vt': 1, 'Ft': 1})
case('M25', 'too slow to reach the top', 'boundary', {'R': 1, 'g': 10, 'm': 1, 'vb': 5}, {'vt': NA_(), 'Ft': NA_()}, conds={'reaches': 'notApplicable'}, method='energy')

# M26: period by integrating the orbit one revolution (find the return time of the angle)
def orbit_period_unit():
    f = lambda t, y: [y[2], y[3], -y[0] / (y[0]**2 + y[1]**2)**mp.mpf(1.5), -y[1] / (y[0]**2 + y[1]**2)**mp.mpf(1.5)]
    sol = mp.odefun(f, 0, [1, 0, 0, 1])
    return mp.findroot(lambda t: sol(t)[1], 2 * mp.pi * (1 + mp.mpf('1e-6')))
mp.mp.dps = 20
P1 = orbit_period_unit()   # period of the unit circular orbit (μ = r = 1), integrated numerically
mp.mp.dps = 50
for (mu, r, kind, name) in [(1, 4, 'benchmark', 'EX M26'), (mp.mpf('3.986004418e14'), mp.mpf('6.778e6'), 'transfer', 'low Earth orbit (GM of the Earth)'), (1, 1, 'boundary', 'unit orbit')]:
    mu, r = mp.mpf(mu), mp.mpf(r)
    T_ = P1 * mp.sqrt(r**3 / mu)    # scaling of the integrated unit orbit
    case('M26', name, kind, {'mu': mu, 'r': r}, {'v': mp.sqrt(mu / r), 'T': T_, 'h': r * mp.sqrt(mu / r), 'eps': mp.sqrt(mu / r)**2 / 2 - mu / r}, method='numerical integration of the unit orbit, scaled', tol=1e-9)
mp.mp.dps = 50

# M27: escape: energy; farthest distance by root finding of the energy equation
for (mu, R, v, kind, name) in [(100, 2, 8, 'benchmark', 'EX M27 launched at 8 m/s'), (100, 2, 10, 'boundary', 'exactly the escape speed'), (100, 2, 12, 'transfer', 'faster than escape: unbound')]:
    mu, R, v = map(mp.mpf, (mu, R, v))
    ex = {'vc': mp.sqrt(mu / R), 'vesc': mp.sqrt(2 * mu / R), 'eps': v**2 / 2 - mu / R}
    if v**2 / 2 - mu / R < 0:
        ex['rmax'] = mp.findroot(lambda r: v**2 / 2 - mu / R + mu / r, 2 * R)
    else:
        ex['rmax'] = NA_()
    case('M27', name, kind, {'mu': mu, 'R': R, 'v': v}, ex, conds={'bound': 'applicable' if v**2 / 2 < mu / R else 'notApplicable'}, method='energy equation (findroot)', tol=1e-10, scale={'eps': 1})

# M28: integrate m v' = m g − b v numerically
for (m, b, g, t, v0, kind, name) in [(1, 2, 10, 1, 0, 'benchmark', 'EX M28'), (1, 2, 10, 0, 0, 'boundary', 't = 0'), (1, 2, 10, 3, 8, 'transfer', 'starts faster than terminal: slows down')]:
    y = ode(lambda tt, yy: [yy[1], g - mp.mpf(b) / m * yy[1]], [0, v0], t)
    case('M28', name, kind, {'m': m, 'b': b, 'g': g, 't': t, 'v0': v0}, {'tau': mp.mpf(m) / b, 'vInf': mp.mpf(m) * g / b, 'v': y[1], 'x': y[0]}, method='mpmath.odefun of m v′ = mg − bv', tol=1e-10, scale={'v': 1, 'x': 1})

# M29: quadrature of the force
for (m, k, t, v0, kind, name) in [(2, 2, 2, 0, 'benchmark', 'EX M29'), (2, 2, 0, 0, 'boundary', 't = 0'), (2, -1, 3, 4, 'transfer', 'decreasing force, initial velocity')]:
    J = mp.quad(lambda s: k * s, [0, t]); v = v0 + J / m
    x = mp.quad(lambda s: v0 + mp.quad(lambda u: k * u, [0, s]) / m, [0, t])
    case('M29', name, kind, {'m': m, 'kap': k, 't': t, 'v0': v0}, {'J': J, 'v': v, 'x': x, 'W': mp.quad(lambda s: k * s * (v0 + k * s**2 / (2 * m)), [0, t])}, method='quadrature of F and of F·v', tol=1e-10, scale={'J': 1, 'v': 1, 'x': 1, 'W': 1})

# M30: rod by Hooke's law; cantilever tip by integrating the curvature M(x)/(EI) twice
def cantilever(F, L, E, I):
    return mp.quad(lambda x: mp.quad(lambda s: F * (L - s) / (E * I), [0, x]), [0, L])
for (F, Lr, Ar, E, Fb, Lb, Ib, kind, name) in [(1000, 1, '1e-4', '2e11', 1, 1, '1e-8', 'benchmark', 'EX M30 and SV13'), (0, 1, '1e-4', '2e11', 0, 1, '1e-8', 'boundary', 'no load'), (mp.mpf('5e4'), 1, '1e-4', '2e11', 2, 2, '1e-8', 'transfer', 'strain 2.5e-3: small-strain only approximate')]:
    Ar, E, Ib = mp.mpf(Ar), mp.mpf(E), mp.mpf(Ib); F = mp.mpf(F)
    eps_ = F / (Ar * E)
    ex = {'sigma': F / Ar, 'delta': cantilever(mp.mpf(Fb), mp.mpf(Lb), E, Ib)}
    if abs(eps_) <= mp.mpf('1e-3'):
        ex.update({'eps': eps_, 'dL': eps_ * Lr})
    else:
        ex.update({'eps': APPROX(eps_), 'dL': APPROX(eps_ * Lr)})
    case('M30', name, kind, {'F': F, 'Lr': Lr, 'Ar': Ar, 'E': E, 'Fb': Fb, 'Lb': Lb, 'Ib': Ib}, ex, method='Hooke’s law; double integral of M/(EI)', tol=1e-10, scale={'sigma': 1, 'eps': 1e-12, 'dL': 1e-12, 'delta': 1e-12})

# M31: Newtonian tangential equation; period by integrating the ODE to the turning point (quarter period)
def pend_period(l, g, th0):
    f = lambda t, y: [y[1], -g / l * mp.sin(y[0])]
    sol = mp.odefun(f, 0, [th0, 0])
    w = mp.sqrt(g / l)
    tq = mp.findroot(lambda t: sol(t)[0], mp.pi / (2 * w))
    return 4 * tq
mp.mp.dps = 25
for (l, g, th, om, kind, name) in [(1, 10, '0.1', 0, 'benchmark', 'EX M31'), (1, 10, '2.0', 0, 'transfer', 'large amplitude 2 rad'), (1, 10, '0.5', 7, 'boundary', 'goes over the top: no period')]:
    th = mp.mpf(th); om = mp.mpf(om)
    ex = {'acc': -mp.mpf(g) / l * mp.sin(th)}
    E = om**2 / 2 - mp.mpf(g) / l * mp.cos(th)
    if E < mp.mpf(g) / l:
        ex['amp'] = mp.acos(-E * l / g)
        ex['T'] = pend_period(mp.mpf(l), mp.mpf(g), ex['amp'])
    else:
        ex['T'] = NA_()
    case('M31', name, kind, {'l': l, 'g': g, 'th': th, 'om': om}, ex, method='tangential Newton equation; period from the ODE', tol=1e-9)
mp.mp.dps = 50

# M32: Hamilton's equations integrated for a quarter period: the phase ellipse semi-axes
for (m, k, x, p, kind, name) in [(1, 4, '0.5', 0, 'benchmark', 'EX M32'), (1, 4, 0, 0, 'boundary', 'at rest at the origin'), (2, 8, '0.3', '0.4', 'transfer', 'general point of phase space')]:
    x, p = mp.mpf(x), mp.mpf(p)
    H = p**2 / (2 * m) + k * x**2 / 2
    w = mp.sqrt(mp.mpf(k) / m)
    ex = {'H': H, 'xdot': p / m, 'pdot': -k * x, 'xa': mp.sqrt(2 * H / k), 'pa': mp.sqrt(2 * m * H)}
    case('M32', name, kind, {'m': m, 'k': k, 'x': x, 'p': p}, ex, method='Hamilton equations', tol=1e-12, scale={'H': 1, 'xdot': 1, 'pdot': 1, 'xa': 1, 'pa': 1})
