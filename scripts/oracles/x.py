from common import *

def fd_dirichlet(n, hh, rhs, a0, a1):
    """Solve y″ = rhs on n intervals with y(0) = a0, y(L) = a1 by second-order finite differences (exact for quadratics)."""
    N = n - 1
    A = mp.matrix(N, N); bvec = mp.matrix(N, 1)
    for i in range(N):
        A[i, i] = -2
        if i > 0: A[i, i - 1] = 1
        if i < N - 1: A[i, i + 1] = 1
        bvec[i] = rhs * hh**2
    bvec[0] -= a0; bvec[N - 1] -= a1
    sol = mp.lu_solve(A, bvec)
    return [a0] + [sol[i] for i in range(N)] + [a1]

# X01: V″ = −ρ/ε by finite differences on a grid through x; E = −V′ by second-order differences
for (Lx, V0, V1, rho, eps, x, n, kind, name) in [(1, 0, 10, 0, eps0, '0.3', 10, 'benchmark', 'EX X01'), ('0.2', 1, -2, '1e-6', eps0, '0.05', 20, 'transfer', 'with space charge'), (1, 0, 10, '1e-9', eps0, 1, 10, 'boundary', 'at the right end'), (1, 0, 10, 0, eps0, '1.5', 10, 'boundary', 'outside the interval')]:
    Lx, V0, V1, rho, x = map(mp.mpf, (Lx, V0, V1, rho, x))
    ins = {'Lx': Lx, 'V0': V0, 'V1': V1, 'rho': rho, 'eps': eps, 'x': x}
    if x > Lx:
        case('X01', name, kind, ins, {'V': NA_(), 'Ex': NA_()}, conds={'inside': 'notApplicable'}, method='outside the domain')
        continue
    hh = Lx / n
    V = fd_dirichlet(n, hh, -rho / eps, V0, V1)
    i = int(mp.nint(x / hh))
    if 0 < i < n:
        E = -(V[i + 1] - V[i - 1]) / (2 * hh)
    else:
        E = -(3 * V[n] - 4 * V[n - 1] + V[n - 2]) / (2 * hh)
    case('X01', name, kind, ins, {'V': V[i], 'Ex': E}, conds={'inside': 'applicable'}, method='finite differences (exact for the quadratic solution), lu_solve', tol=1e-10, scale={'V': 1e-3, 'Ex': 1e-3})

# X02: η u″ = dp/dx by finite differences; wall stress by a one-sided second-order difference; q by Simpson's rule
for (hg, U, eta, G_, y, kind, name) in [('0.01', 1, '0.1', 0, '0.005', 'benchmark', 'EX X02 (Couette)'), ('0.01', 1, '0.1', -100, '0.003', 'transfer', 'with a favourable pressure gradient'), ('0.01', 1, '0.1', 0, 0, 'boundary', 'at the lower plate'), ('0.01', 1, '0.1', 0, '0.02', 'boundary', 'outside the gap')]:
    hg, U, eta, G_, y = map(mp.mpf, (hg, U, eta, G_, y))
    ins = {'hg': hg, 'U': U, 'eta': eta, 'G': G_, 'y': y}
    n = 10; hh = hg / n
    u = fd_dirichlet(n, hh, G_ / eta, mp.mpf(0), U)
    tau0 = eta * (-3 * u[0] + 4 * u[1] - u[2]) / (2 * hh)
    q = hh / 3 * (u[0] + u[n] + 4 * mp.fsum(u[1:n:2]) + 2 * mp.fsum(u[2:n - 1:2]))
    if y > hg:
        case('X02', name, kind, ins, {'u': NA_(), 'tau0': tau0, 'q': q}, conds={'inside': 'notApplicable'}, method='finite differences; Simpson')
        continue
    # every case puts y on a grid node (y is a multiple of h/10)
    i = int(mp.nint(y / hh)); assert abs(i * hh - y) < mp.mpf('1e-40')
    uy = u[i]
    case('X02', name, kind, ins, {'u': uy, 'tau0': tau0, 'q': q}, conds={'inside': 'applicable'}, method='finite differences (exact for the quadratic profile); Simpson', tol=1e-10, scale={'u': 1e-6})

# X03: period of the free oscillation from the zero of the velocity (odefun)
mp.mp.dps = 30
for (m, k, kind, name) in [(2, 200, 'benchmark', 'EX X03'), (1, 1, 'boundary', 'unit system'), ('0.5', '2e4', 'transfer', 'stiff and light')]:
    m, k = mp.mpf(m), mp.mpf(k)
    sol = mp.odefun(lambda t, y: [y[1], -k / m * y[0]], 0, [mp.mpf(1), mp.mpf(0)])
    half = mp.findroot(lambda t: sol(t)[1], (mp.mpf('0.1') * mp.sqrt(m / k), mp.mpf('3.5') * mp.sqrt(m / k)), solver='anderson')
    w = mp.pi / half
    case('X03', name, kind, {'m': m, 'k': k}, {'w': w, 'f': w / (2 * mp.pi)}, method='mpmath.odefun; half period from the zero of v', tol=1e-12)
mp.mp.dps = 50

# X04: three bar elements with a thermal load; fixed–fixed and fixed–free assemblies (lu_solve)
def bar(E, al, dT, fixed_right, n=3, Lb=mp.mpf(1), A_=mp.mpf('1e-4')):
    le = Lb / n; ke = E * A_ / le; fth = E * A_ * al * dT
    K = mp.matrix(n + 1, n + 1); F = mp.matrix(n + 1, 1)
    for e_ in range(n):
        for (i, j, s) in [(e_, e_, 1), (e_, e_ + 1, -1), (e_ + 1, e_, -1), (e_ + 1, e_ + 1, 1)]:
            K[i, j] += s * ke
        F[e_] -= fth; F[e_ + 1] += fth
    free = list(range(1, n + 1 if not fixed_right else n))
    Kf = mp.matrix([[K[i, j] for j in free] for i in free]); Ff = mp.matrix([F[i] for i in free])
    uf = mp.lu_solve(Kf, Ff)
    u = [mp.mpf(0)] * (n + 1)
    for idx, i in enumerate(free):
        u[i] = uf[idx]
    strain = (u[1] - u[0]) / le
    return strain, E * (strain - al * dT), u[n] / Lb
for (E, al, dT, kind, name) in [('2e11', '1e-5', 10, 'benchmark', 'EX X04'), ('2e11', '1e-5', 0, 'boundary', 'no warming: no stress'), ('7e10', '2.3e-5', -30, 'transfer', 'aluminium cooled: tension')]:
    E, al, dT = mp.mpf(E), mp.mpf(al), mp.mpf(dT)
    _, sig, _ = bar(E, al, dT, True)
    _, _, eth = bar(E, al, dT, False)
    case('X04', name, kind, {'E': E, 'al': al, 'dT': dT}, {'eth': eth, 'sig': sig}, method='bar finite elements with thermal load (fixed–fixed, fixed–free)', tol=1e-12, scale={'eth': 1e-12, 'sig': 1})

# X05: integrate L dI/dt = V − dλ/dt − R I (odefun); the initial slope by a one-sided derivative; the steady value at 60 τ
for (R_, Lc, V, dl, I0, t, kind, name) in [(2, '0.5', 0, 1, 0, '0.5', 'benchmark', 'EX X05'), (2, '0.5', 0, 0, 0, 1, 'boundary', 'no drive: no current'), (5, '0.2', 12, -3, 1, '0.05', 'transfer', 'source and opposing flux change')]:
    R_, Lc, V, dl, I0, t = map(mp.mpf, (R_, Lc, V, dl, I0, t))
    sol = mp.odefun(lambda tt, y: [(V - dl - R_ * y[0]) / Lc], 0, [I0])
    tau = Lc / R_
    case('X05', name, kind, {'R': R_, 'Lc': Lc, 'V': V, 'dl': dl, 'I0': I0, 't': t}, {'Iss': sol(60 * tau)[0], 'dI0': mp.diff(lambda s: sol(s)[0], 0, direction=1), 'I': sol(t)[0], 'tau': tau}, method='mpmath.odefun of the coil equation', tol=1e-10, scale={'Iss': 1e-6, 'dI0': 1e-6, 'I': 1e-6})

# X06: ω_pe from the period of a displaced electron slab (odefun); λ_D as the thermal speed over ω_pe
mp.mp.dps = 30
for (ne, kT_eV, Ls, kind, name) in [('1e16', 1, '0.1', 'benchmark', 'EX X06'), ('1e20', '1e4', 1, 'transfer', 'fusion plasma'), ('1e30', '0.01', '1e-3', 'boundary', 'dense and cold: not a plasma (N_D small)')]:
    ne, kT, Ls = mp.mpf(ne), mp.mpf(kT_eV) * e, mp.mpf(Ls)
    w2 = ne * e**2 / (me * eps0)
    sol = mp.odefun(lambda t, y: [y[1], -w2 * y[0]], 0, [mp.mpf(1), mp.mpf(0)])
    s = 1 / mp.sqrt(w2)
    half = mp.findroot(lambda t: sol(t)[1], (mp.mpf('0.1') * s, mp.mpf('3.5') * s), solver='anderson')
    wpe = mp.pi / half
    lD = mp.sqrt(kT / me) / wpe
    ND = 4 * mp.pi / 3 * ne * lD**3
    ok = lD < mp.mpf('0.01') * Ls and ND > 100
    case('X06', name, kind, {'ne': ne, 'kT': kT, 'Ls': Ls}, {'wpe': wpe, 'lD': lD, 'ND': ND}, conds={'plasma': 'applicable' if ok else 'notApplicable'}, method='slab oscillation (odefun); λ_D = v_th/ω_pe', tol=1e-12)
mp.mp.dps = 50

# X07: force as −dU/dr (numerical derivative); the minimum by findroot of dU/dr
for (ep, sg, r, kind, name) in [(1, 1, mp.mpf(2)**(mp.mpf(1) / 6), 'benchmark', 'EX X07'), (1, 1, 1, 'boundary', 'r = σ: U = 0, strongly repulsive'), ('0.5', '1.2', '1.5', 'transfer', 'other well depth and size')]:
    ep, sg, r = mp.mpf(ep), mp.mpf(sg), mp.mpf(r)
    U = lambda q: 4 * ep * ((sg / q)**12 - (sg / q)**6)
    rm = mp.findroot(lambda q: mp.diff(U, q), (sg, 2 * sg), solver='anderson', tol=mp.mpf('1e-30'))
    case('X07', name, kind, {'ep': ep, 'sg': sg, 'r': r}, {'U': U(r), 'F': -mp.diff(U, r), 'rm': rm}, method='numerical derivative; minimum by findroot', tol=1e-12, scale={'U': 1, 'F': 1})

# X08: least squares of the observations on the design matrix (normal equations, lu_solve)
for (t1, x1, t2, x2, kind, name) in [(1, 1, 2, 4, 'benchmark', 'EX X08'), (1, 1, 1, 4, 'boundary', 'both observations at the same time: not identifiable'), ('0.5', 2, 3, -1, 'transfer', 'braking after a start with speed')]:
    t1, x1, t2, x2 = map(mp.mpf, (t1, x1, t2, x2))
    ins = {'t1': t1, 'x1': x1, 't2': t2, 'x2': x2}
    if t1 != t2:
        A_ = mp.matrix([[t1, t1**2 / 2], [t2, t2**2 / 2]])
        sol = mp.lu_solve(A_.T * A_, A_.T * mp.matrix([x1, x2]))
        case('X08', name, kind, ins, {'v0': sol[0], 'a': sol[1]}, conds={'identifiable': 'applicable'}, method='least squares (normal equations)', tol=1e-12, scale={'v0': 1, 'a': 1})
    else:
        case('X08', name, kind, ins, {'v0': NA_(), 'a': NA_()}, conds={'identifiable': 'notApplicable'}, method='rank-deficient design matrix')

# X09: integrate the closed loop; the settling time by the root of |x(t)| = 0.02|x0|
for (a, b, K, x0, t, kind, name) in [(1, 1, 3, 1, 1, 'benchmark', 'EX X09'), (1, 1, 0, 1, 1, 'transfer', 'open loop: unstable'), (1, 1, 1, 1, 2, 'boundary', 'marginal: a − bK = 0'), ('-0.5', 2, '0.25', '-2', 3, 'transfer', 'stable plant, extra damping')]:
    a, b, K, x0, t = map(mp.mpf, (a, b, K, x0, t))
    p = a - b * K
    sol = mp.odefun(lambda tt, y: [a * y[0] + b * (-K * y[0])], 0, [x0])
    ex = {'p': p, 'x': sol(t)[0]}
    if p < 0:
        ex['ts'] = mp.findroot(lambda tt: abs(sol(tt)[0]) - mp.mpf('0.02') * abs(x0), (0, 20 / -p), solver='illinois')
    else:
        ex['ts'] = NA_()
    case('X09', name, kind, {'a': a, 'b': b, 'K': K, 'x0': x0, 't': t}, ex, conds={'stable': 'applicable' if p < 0 else 'notApplicable'}, method='mpmath.odefun of the closed loop; root for 2 %', tol=1e-10, scale={'p': 1})

# X10: the lattice dispersion ω² = m² + (2/a)² sin²(ka/2) in the continuum limit; oscillator levels by shooting
mp.mp.dps = 20
def osc_E(n):
    x0 = mp.mpf(-7)
    def mismatch(E):
        nu = E - mp.mpf('0.5')
        y0 = abs(x0)**nu * mp.exp(-x0**2 / 2)
        dy0 = y0 * (nu / x0 - x0)
        y = mp.odefun(lambda x, y: [y[1], (x**2 - 2 * E) * y[0]], x0, [y0, dy0])(0)
        return y[1] if n % 2 == 0 else y[0]
    return mp.findroot(mismatch, n + mp.mpf('0.5') + mp.mpf('0.01'))
levels = {n: osc_E(n) for n in (0, 1, 3)}
mp.mp.dps = 50
for (k, m, n, kind, name) in [(3, 4, 1, 'benchmark', 'EX X10'), (0, 4, 0, 'boundary', 'mode at rest: ω = m'), (5, 0, 3, 'transfer', 'massless field, three quanta')]:
    k, m = mp.mpf(k), mp.mpf(m)
    a_ = mp.mpf('1e-12')
    wk = mp.sqrt(m**2 + (2 / a_)**2 * mp.sin(k * a_ / 2)**2)
    case('X10', name, kind, {'k': k, 'm': m, 'n': n}, {'wk': wk, 'E0': levels[0] * wk, 'En': levels[n] * wk}, method='lattice dispersion (a → 0); oscillator levels by shooting', tol=1e-9)
