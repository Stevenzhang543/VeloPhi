from common import *

# M01: Galilean transformation and its inverse
for (x0, v, u, t, kind, name) in [(2, 3, 1, 4, 'benchmark', 'EX M01'), (2, 3, 3, 4, 'boundary', 'observer at the same velocity'), (-1, -2, 5, '2.5', 'transfer', 'opposite directions')]:
    t = mp.mpf(t); x = x0 + v * t; xp = x - u * t
    case('M01', name, kind, {'x0': x0, 'v': v, 'u': u, 't': t}, {'x': x, 'xp': xp, 'vp': v - u, 'xBack': xp + u * t}, method='Galilean transformation and inverse', tol=1e-12, scale={'vp': 1, 'xp': 1})

# M02: integrate x'' = a numerically (mpmath Taylor ODE)
for (x0, v0, a, t, kind, name) in [(0, 2, 3, 4, 'benchmark', 'EX M02'), (0, 2, 0, 4, 'boundary', 'a = 0'), (5, 10, -2, 7, 'transfer', 'decelerating past the turning point')]:
    y = ode(lambda tt, yy: [yy[1], mp.mpf(a)], [x0, v0], t)
    case('M02', name, kind, {'x0': x0, 'v0': v0, 'a': a, 't': t}, {'v': y[1], 'x': y[0], 's': y[0] - x0, 'v2': abs(y[1])}, method='mpmath.odefun of x″ = a', tol=1e-12, scale={'v': 1, 's': 1})

# M03: landing time by root finding of y(t) = h − g t²/2; speed = g·t_f; after the impact e·v
for (h, g, e_, kind, name) in [(20, '9.8', 0, 'benchmark', 'EX M03'), (0, '9.8', 0, 'boundary', 'released on the ground'), (20, '9.8', '0.8', 'transfer', 'bounce with e = 0.8')]:
    h = mp.mpf(h); g = mp.mpf(g); e_ = mp.mpf(e_)
    tf = mp.findroot(lambda tt: h - g * tt**2 / 2, mp.sqrt(h + 1)) if h > 0 else mp.mpf(0)
    case('M03', name, kind, {'h': h, 'g': g, 'e': e_}, {'t': tf, 'vBefore': g * tf, 'vAfter': e_ * g * tf, 'hBounce': (e_ * g * tf)**2 / (2 * g)}, method='root of y(t) = 0 (findroot); v = g·t', tol=1e-12, scale={'t': 1, 'vBefore': 1, 'vAfter': 1, 'hBounce': 1})

# M04: flight time from the root of y(t) = h0 + vy t − g t²/2
def m04(v0, th, g, h0):
    vy = v0 * mp.sin(th); vx = v0 * mp.cos(th)
    disc = vy**2 + 2 * g * h0
    T = (vy + mp.sqrt(disc)) / g
    T = mp.findroot(lambda tt: h0 + vy * tt - g * tt**2 / 2, T * 1.001)
    return vx, vy, T
v0, th, g = mp.mpf(20), mp.pi / 6, mp.mpf('9.8')
vx, vy, T = m04(v0, th, g, 0)
case('M04', 'EX M04', 'benchmark', {'v0': v0, 'theta': th, 'g': g, 'h0': 0}, {'Tsame': T, 'Rsame': vx * T, 'T': T, 'R': vx * T, 'H': vy**2 / (2 * g), 'tLand': T}, conds={'sameHeight': 'applicable'}, method='root of y(t) = 0', tol=1e-10)
vx, vy, T = m04(v0, th, g, 10)
case('M04', 'from a 10 m platform: same-height formulas not applicable', 'boundary', {'v0': v0, 'theta': th, 'g': g, 'h0': 10}, {'Tsame': NA_(), 'Rsame': NA_(2 * v0**2 * mp.sin(th) * mp.cos(th) / g), 'T': T, 'R': vx * T, 'tLand': T}, conds={'sameHeight': 'notApplicable', 'lands': 'applicable'}, method='root of y(t) = 0', tol=1e-10)
vx, vy, T = m04(mp.mpf(15), mp.mpf(0), g, mp.mpf('1.25'))
case('M04', 'horizontal launch from 1.25 m', 'transfer', {'v0': 15, 'theta': 0, 'g': g, 'h0': mp.mpf('1.25')}, {'T': T, 'R': vx * T, 'H': NA_()}, conds={'rises': 'notApplicable'}, method='root of y(t) = 0', tol=1e-10)

# M05: meeting time from findroot of the position difference
case('M05', 'EX M05', 'benchmark', {'vA': 5, 'd': 12, 'vB': 2, 'tMax': 100}, {'t': mp.findroot(lambda t: 5 * t - 12 - 2 * t, 1), 'tc': 4, 'x': 20}, method='findroot', tol=1e-10)
case('M05', 'B faster: never meets', 'boundary', {'vA': 2, 'd': 12, 'vB': 5, 'tMax': 100}, {'t': {'state': 'applicable', 'value': None}, 'tc': NA_()}, conds={'closes': 'notApplicable'}, method='no positive root')
case('M05', 'meeting after the observed interval', 'transfer', {'vA': 5, 'd': 12, 'vB': 4, 'tMax': 10}, {'t': {'state': 'applicable', 'value': None}, 'tc': 12, 'x': 60}, method='root at 12 s lies outside [0, 10 s]', tol=1e-12)

# M06: force balance solved as a 2×2 linear system for the two tensions (left, right)
def m06(m, g, al):
    A_ = mp.matrix([[-mp.cos(al), mp.cos(al)], [mp.sin(al), mp.sin(al)]])
    b = mp.matrix([0, m * g])
    Tlr = mp.lu_solve(A_, b)
    return Tlr[0]
for (m, g, al, kind, name) in [(10, '9.8', mp.pi / 6, 'benchmark', 'EX M06'), (10, '9.8', mp.pi / 2, 'limit', 'vertical ropes: T = mg/2'), (10, '9.8', mp.mpf('0.01'), 'boundary', 'nearly horizontal ropes')]:
    g = mp.mpf(g); T_ = m06(m, g, al)
    case('M06', name, kind, {'m': m, 'g': g, 'alpha': al}, {'T': T_, 'Th': T_ * mp.cos(al)}, method='2×2 force balance (lu_solve)', tol=1e-10, scale={'Th': 1})
case('M06', 'horizontal ropes', 'boundary', {'m': 10, 'g': '9.8' and 9.8, 'alpha': 0}, {'T': NA_()}, conds={'notFlat': 'notApplicable'}, method='no finite tension')

# M07: forces as vectors in x–y; acceleration = projection of the net force on the incline direction
def m07(m, th, muS, muK, g, v0):
    down = mp.matrix([mp.cos(th), -mp.sin(th)])        # unit vector down the slope
    n = mp.matrix([mp.sin(th), mp.cos(th)])            # outward normal
    W = mp.matrix([0, -m * g])
    N = -(W[0] * n[0] + W[1] * n[1])                   # normal force balances the normal component
    Wd = W[0] * down[0] + W[1] * down[1]
    if v0 > 0 or (v0 == 0 and Wd > muS * N):
        f = -muK * N
    elif v0 < 0:
        f = muK * N
    else:
        f = -Wd
    return (Wd + f) / m, N, abs(f)
for (m, th, muS, muK, g, v0, kind, name, branch) in [
        (2, mp.pi / 6, '0.25', '0.2', '9.8', 1, 'benchmark', 'EX M07: sliding down', 'slideDown'),
        (2, mp.pi / 6, '0.25', '0.2', '9.8', -1, 'transfer', 'sliding up: friction down the slope', 'slideUp'),
        (2, mp.pi / 6, '0.7', '0.6', '9.8', 0, 'boundary', 'at rest: μs ≥ tanθ', 'stick'),
        (2, mp.pi / 6, '0.5', '0.4', '9.8', 0, 'boundary', 'released from rest just above the threshold (tan 30° = 0.577 > 0.5)', 'slideDown')]:
    muS, muK, g = mp.mpf(muS), mp.mpf(muK), mp.mpf(g)
    a, N, f_ = m07(m, th, muS, muK, g, v0)
    conds = {'slideDown': 'notApplicable', 'slideUp': 'notApplicable', 'stick': 'notApplicable'}; conds[branch] = 'applicable'
    case('M07', name, kind, {'m': m, 'theta': th, 'muS': muS, 'muK': muK, 'g': g, 'v0': v0}, {'a': a, 'N': N, 'f': f_}, conds=conds, method='vector force balance', tol=1e-12, scale={'a': 1})

# M08: piecewise friction
def m08(m, muS, muK, g, F, v0):
    fmax = muS * m * g
    if v0 <= 0 and F <= fmax:
        return fmax, F, 0, 'static'
    return fmax, muK * m * g, (F - muK * m * g) / m, 'sliding'
for (F, v0, kind, name) in [(6, 0, 'benchmark', 'EX M08: 6 N holds'), (10, 0, 'transfer', 'EX M08: 10 N slides'), (8, 0, 'boundary', 'exactly at the threshold (8 N)'), (mp.mpf('8.000001'), 0, 'boundary', 'just above the threshold'), (3, 1, 'limit', 'already sliding with a small pull (decelerates)')]:
    m, muS, muK, g = 2, mp.mpf('0.4'), mp.mpf('0.3'), 10
    fmax, f_, a, br = m08(m, muS, muK, g, mp.mpf(F), v0)
    conds = {'static': 'applicable' if br == 'static' else 'notApplicable', 'sliding': 'applicable' if br == 'sliding' else 'notApplicable'}
    case('M08', name, kind, {'m': m, 'muS': muS, 'muK': muK, 'g': g, 'F': F, 'v0': v0}, {'fmax': fmax, 'f': f_, 'a': a}, conds=conds, method='Coulomb friction case analysis', tol=1e-12, scale={'a': 1})

# M09: work–energy theorem written as the integral of the net force over the path (quadrature)
for (F, s, th, fr, Ek0, kind, name) in [(10, 5, 0, 4, 0, 'benchmark', 'EX M09'), (0, 5, 0, 0, 0, 'boundary', 'no input work: efficiency undefined'), (10, 5, mp.pi / 3, 2, 3, 'transfer', 'pull at 60°, initial kinetic energy')]:
    Win = mp.quad(lambda x: F * mp.cos(th), [0, s]); Q = mp.quad(lambda x: fr, [0, s])
    exp_ = {'Win': Win, 'Q': Q, 'Ek': Ek0 + Win - Q}
    exp_['eta'] = (Win - Q) / Win if Win > 0 else NA_()
    case('M09', name, kind, {'F': F, 's': s, 'theta': th, 'f': fr, 'Ek0': Ek0}, exp_, method='quadrature of the forces over the path', tol=1e-12, scale={'Win': 1, 'Q': 1, 'Ek': 1})

# M10: Newton's second law for the person
for (m, g, ay, kind, name) in [(60, '9.8', 2, 'benchmark', 'EX M10'), (60, '9.8', '-9.8', 'boundary', 'free fall: no contact'), (60, '9.8', -3, 'transfer', 'accelerating downwards')]:
    g = mp.mpf(g); ay = mp.mpf(ay)
    if g + ay > 0:
        case('M10', name, kind, {'m': m, 'g': g, 'ay': ay}, {'N': m * (g + ay), 'ratio': (g + ay) / g}, method='N − mg = m a', tol=1e-12)
    else:
        case('M10', name, kind, {'m': m, 'g': g, 'ay': ay}, {'N': {'state': 'notApplicable', 'value': None}, 'ratio': NA_()}, conds={'contact': 'notApplicable'}, method='no contact')

# M11: two equations of motion solved together
for (m1, m2, g, kind, name) in [(2, 3, '9.8', 'benchmark', 'EX M11'), (3, 3, '9.8', 'boundary', 'equal masses'), (1, 100, '9.8', 'limit', 'm2 ≫ m1: a → g')]:
    g = mp.mpf(g)
    sol = mp.lu_solve(mp.matrix([[m1, -1], [m2, 1]]), mp.matrix([-m1 * g, m2 * g]))  # m1 a = T − m1 g ; m2 a = m2 g − T
    case('M11', name, kind, {'m1': m1, 'm2': m2, 'g': g}, {'a': sol[0], 'T': sol[1]}, method='simultaneous equations (lu_solve)', tol=1e-12, scale={'a': 1})

# M12: virtual work: F·Δs = (m + mp) g Δy with Δs = 2Δy
for (m, mp_, g, dy, kind, name) in [(10, 0, 10, '0.5', 'benchmark', 'EX M12'), (10, 2, 10, '0.5', 'transfer', 'pulley of 2 kg'), (10, 0, 10, 0, 'boundary', 'not lifted')]:
    dy = mp.mpf(dy)
    case('M12', name, kind, {'m': m, 'mp': mp_, 'g': g, 'dy': dy}, {'F': (m + mp_) * g / 2, 'ds': 2 * dy, 'Win': (m + mp_) * g / 2 * 2 * dy, 'Wuse': m * g * dy, 'eta': mp.mpf(m) / (m + mp_)}, method='virtual work', tol=1e-12, scale={'ds': 1, 'Win': 1, 'Wuse': 1})

# M13: solve both branches as linear systems and pick the one consistent with the friction inequality
def m13(M, m, F, muS, muK, g):
    s = mp.lu_solve(mp.matrix([[M, 1], [m, -1]]), mp.matrix([F, 0]))  # M a = F − f ; m a = f
    a, f_ = s[0], s[1]
    if f_ <= muS * m * g:
        return a, a, f_, 'together'
    return muK * g, (F - muK * m * g) / M, muK * m * g, 'slip'
for (M, m, F, muS, muK, kind, name) in [(4, 1, 12, '0.5', '0.5', 'benchmark', 'EX M13'), (4, 1, 30, '0.5', '0.4', 'transfer', 'F above the critical force'), (4, 1, 25, '0.5', '0.4', 'boundary', 'exactly the critical force')]:
    muS, muK = mp.mpf(muS), mp.mpf(muK); g = 10
    am, ab, f_, br = m13(M, m, F, muS, muK, g)
    case('M13', name, kind, {'M': M, 'm': m, 'F': F, 'muS': muS, 'muK': muK, 'g': g}, {'Fc': muS * (M + m) * g, 'am': am, 'ab': ab, 'f': f_}, conds={'together': 'applicable' if br == 'together' else 'notApplicable'}, method='simultaneous equations per branch', tol=1e-12)

# M14: integrate the block until it reaches the belt speed (root of v(t) − V)
def m14(m, V, v0, mu, g):
    a = mu * g
    t = mp.findroot(lambda tt: v0 + a * tt - V, 1)
    x = mp.quad(lambda tt: v0 + a * tt, [0, t])
    return a, t, x, x - 0, V * t
for (m, V, v0, mu, kind, name) in [(1, 3, 0, '0.2', 'benchmark', 'EX M14'), (1, 3, 1, '0.2', 'transfer', 'block starts at 1 m/s'), (1, 3, 3, '0.2', 'boundary', 'already at the belt speed')]:
    mu = mp.mpf(mu); g = 10
    if V <= v0:
        case('M14', name, kind, {'m': m, 'V': V, 'v0': v0, 'muK': mu, 'g': g, 'Lb': 100}, {'a': NA_(), 't': NA_()}, conds={'slower': 'notApplicable'}, method='no relative sliding')
        continue
    a, t, x, _, belt = m14(m, V, v0, mu, g)
    ds = V * t - x
    case('M14', name, kind, {'m': m, 'V': V, 'v0': v0, 'muK': mu, 'g': g, 'Lb': 100}, {'a': a, 't': t, 'x': x, 'ds': ds, 'Q': mu * m * g * ds, 'Wb': mu * m * g * V * t}, method='root of v(t) = V, quadrature of v', tol=1e-10)

# M15: unknowns (A, a_rel, N) from three equations (block x, block y, wedge x)
def m15(M, m, th, g):
    s, c = mp.sin(th), mp.cos(th)
    # wedge accelerates −A (left), block relative a down the slope (right-down): block acc = (a c − A, −a s)
    A_ = mp.matrix([[-m, m * c, -s], [0, -m * s, -c], [M, 0, -s]])
    b = mp.matrix([0, -m * g, 0])
    x = mp.lu_solve(A_, b)
    return x[0], x[1], x[2]
for (M, m, th, kind, name) in [(3, 1, mp.pi / 6, 'benchmark', 'EX M15'), (mp.mpf('1e9'), 1, mp.pi / 6, 'limit', 'very heavy wedge: fixed incline'), (3, 1, mp.pi / 4, 'transfer', '45° wedge'), (3, 1, mp.mpf('1e-6'), 'boundary', 'almost flat wedge')]:
    A_, ar, N = m15(M, m, th, 10)
    case('M15', name, kind, {'M': M, 'm': m, 'theta': th, 'g': 10}, {'arel': ar, 'A': abs(A_), 'N': N}, method='3×3 Newton equations (lu_solve)', tol=1e-9, scale={'A': 1})

# M16: energy conservation checked with the ODE of the oscillator (speed at x = 0)
for (k, m, x, kind, name) in [(100, 1, '0.2', 'benchmark', 'EX M16'), (100, 1, 0, 'boundary', 'not compressed'), (400, 4, '0.05', 'transfer', 'stiffer spring, heavier block')]:
    x = mp.mpf(x); w = mp.sqrt(mp.mpf(k) / m)
    vmax = abs(x) * w if x != 0 else 0
    if x != 0:
        y = ode(lambda t, yy: [yy[1], -mp.mpf(k) / m * yy[0]], [x, 0], mp.pi / (2 * w))
        vmax = abs(y[1])
    case('M16', name, kind, {'k': k, 'm': m, 'x': x}, {'Ep': k * x**2 / 2, 'vmax': vmax, 'omega': w}, method='ODE of the oscillator to the equilibrium crossing', tol=1e-10, scale={'Ep': 1, 'vmax': 1})
