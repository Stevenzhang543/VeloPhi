from common import *

K = lambda c_: mp.mpf(c_) + T0C   # Celsius to kelvin

# T01: heat as the integral of m c dT
for (m, c_, T1, T2, kind, name) in [('0.5', 4200, K(20), K(40), 'benchmark', 'EX T01'), ('0.5', 4200, K(20), K(20), 'boundary', 'no temperature change'), ('0.5', 4200, K(20), K(120), 'transfer', 'past the boiling point: mcΔT not applicable')]:
    m = mp.mpf(m)
    Q = mp.quad(lambda T: m * c_, [T1, T2])
    ex = {'dT': T2 - T1, 'Q': Q if T2 <= K(100) else NA_()}
    case('T01', name, kind, {'m': m, 'c': c_, 'T1': T1, 'T2': T2, 'Tm': K(0), 'Tb': K(100)}, ex, conds={'onePhase': 'applicable' if T2 <= K(100) else 'notApplicable'}, method='∫ mc dT', tol=1e-12, scale={'dT': 1, 'Q': 1})

# T02: time by integrating the power until the latent heat is supplied (findroot)
for (m, Lf, P, kind, name) in [('0.1', '3.34e5', 100, 'benchmark', 'EX T02'), ('0.1', '2.26e6', 1000, 'transfer', 'boiling water off with 1 kW'), ('1e-6', '3.34e5', 100, 'boundary', 'a tiny amount')]:
    m, Lf = mp.mpf(m), mp.mpf(Lf)
    t = mp.findroot(lambda tt: P * tt - m * Lf, 1)
    case('T02', name, kind, {'m': m, 'Lf': Lf, 'P': P}, {'Q': P * t, 't': t}, method='root of P t = mL', tol=1e-12)

# T03: equilibrium by solving the energy balance for Tf
for (m1, T1, m2, T2, Cc, kind, name) in [('0.2', K(80), '0.3', K(20), 0, 'benchmark', 'EX T03'), ('0.2', K(80), '0.3', K(20), 420, 'transfer', 'vessel of 420 J/K at 20 °C'), ('0.2', K(50), '0.3', K(50), 0, 'boundary', 'equal temperatures')]:
    m1, m2 = mp.mpf(m1), mp.mpf(m2); c_ = 4200
    Tf = mp.findroot(lambda T: m1 * c_ * (T1 - T) - (m2 * c_ + Cc) * (T - T2), (T1 + T2) / 2)
    case('T03', name, kind, {'m1': m1, 'c1': c_, 'T1': T1, 'm2': m2, 'c2': c_, 'T2': T2, 'Cc': Cc}, {'Tf': Tf, 'Q': m1 * c_ * (T1 - Tf)}, method='energy balance solved for Tf', tol=1e-12, scale={'Q': 1})

# T04: length by integrating dL = α L0 dT (linear approximation) and checking it against the exponential growth
for (L0, al, dT, kind, name) in [(2, '1.2e-5', 50, 'benchmark', 'EX T04'), (2, '1.2e-5', 0, 'boundary', 'no warming'), (1, '2.3e-5', -40, 'transfer', 'cooling aluminium by 40 K')]:
    al = mp.mpf(al)
    dL = mp.quad(lambda T: al * L0, [0, dT])
    case('T04', name, kind, {'L0': L0, 'alpha': al, 'dT': dT}, {'dL': dL, 'L': L0 + dL}, method='∫ αL0 dT', tol=1e-12, scale={'dL': 1e-9})

# T05: steady 1D conduction: solve the discrete heat equation with fixed ends (linear system) and take the flux
def slab_flux(kap, A_, Lw, dT, n=20):
    h = mp.mpf(Lw) / n
    G = [[0] * (n - 1) for _ in range(n - 1)]
    b = [0] * (n - 1)
    for i in range(n - 1):
        G[i][i] = 2
        if i > 0: G[i][i - 1] = -1
        if i < n - 2: G[i][i + 1] = -1
    b[0] = dT; b[-1] = 0
    T_ = mp.lu_solve(mp.matrix(G), mp.matrix(b))
    return kap * A_ * (dT - T_[0]) / h
for (kap, A_, Lw, dT, t, kind, name) in [(200, '0.01', '0.1', 50, 1, 'benchmark', 'EX T05'), (200, '0.01', '0.1', 0, 1, 'boundary', 'no difference'), ('0.04', 2, '0.05', 25, 3600, 'transfer', 'insulating wall for an hour')]:
    A_, Lw = mp.mpf(A_), mp.mpf(Lw); kap = mp.mpf(kap)
    P = slab_flux(kap, A_, Lw, dT)
    case('T05', name, kind, {'kap': kap, 'A': A_, 'Lw': Lw, 'dT': dT, 't': t}, {'Pq': P, 'Q': P * t, 'Rth': Lw / (kap * A_)}, method='discrete steady heat equation (lu_solve)', tol=1e-10, scale={'Pq': 1, 'Q': 1})

# T06: integrate dT/dt = −k (T − Ta)
for (T0_, Ta, k, t, kind, name) in [(K(80), K(20), '0.1', 10, 'benchmark', 'EX T06'), (K(20), K(20), '0.1', 10, 'boundary', 'already at ambient'), (K(5), K(25), '0.02', 60, 'transfer', 'warming a cold drink')]:
    k = mp.mpf(k)
    Tt = ode(lambda tt, y: [-k * (y[0] - Ta)], [T0_], t)[0]
    th = mp.findroot(lambda tt: mp.exp(-k * tt) - mp.mpf('0.5'), 5)
    case('T06', name, kind, {'T0': T0_, 'Ta': Ta, 'k': k, 't': t}, {'Tt': Tt, 'th': th}, method='mpmath.odefun of Newton cooling', tol=1e-12)

# T07: Stefan–Boltzmann by integrating Planck's law over all wavelengths; Wien peak by maximizing Planck's law
_I3 = None
def planck_total(T):
    # ∫ 2πhc²/λ⁵ /(e^{hc/λkT} − 1) dλ, substituting x = hc/(λkT): 2π (kT)⁴/(h³c²) ∫ x³/(eˣ − 1) dx (quadrature)
    global _I3
    if _I3 is None:
        _I3 = mp.quad(lambda x: x**3 / mp.expm1(x) if x > 0 else 0, [0, 1, 10, mp.inf])
    return 2 * mp.pi * (kB * T)**4 / (h**3 * c**2) * _I3
def wien(T):
    # maximum of x⁵/(eˣ − 1) with x = hc/(λkT): root of its derivative (findroot), then λ = hc/(x kT)
    x = mp.findroot(lambda x: mp.diff(lambda y: y**5 / mp.expm1(y), x), 5)
    return h * c / (x * kB * T)
mp.mp.dps = 30
for (eps_, A_, Tb, Ta, kind, name) in [(1, 1, 400, 300, 'benchmark', 'EX T07'), (1, 1, 300, 300, 'boundary', 'same temperature: no net exchange'), ('0.5', 2, 1000, 300, 'transfer', 'grey body at 1000 K')]:
    eps_ = mp.mpf(eps_)
    P = eps_ * A_ * (planck_total(mp.mpf(Tb)) - planck_total(mp.mpf(Ta)))
    case('T07', name, kind, {'eps': eps_, 'A': A_, 'Tb': Tb, 'Ta': Ta}, {'P': P, 'lmax': wien(mp.mpf(Tb))}, method='integral of Planck’s law; maximum by findroot', tol=1e-9, scale={'P': 1})
mp.mp.dps = 50

# T08: pressure from the kinetic theory: p = (1/3) n_V m ⟨v²⟩ with ⟨v²⟩ from the Maxwell distribution (quadrature)
def kinetic_p(n, T, V):
    M = mp.mpf('0.028'); m1 = M / NA
    a = m1 / (2 * kB * T)
    f = lambda v: 4 * mp.pi * (a / mp.pi)**mp.mpf(1.5) * v**2 * mp.exp(-a * v**2)
    v2 = mp.quad(lambda v: v**2 * f(v), [0, mp.inf])
    return (n * NA / V) * m1 * v2 / 3
for (n, T, V, kind, name) in [(1, 300, '0.024', 'benchmark', 'EX T08'), (1, 300, '0.0001', 'boundary', 'compressed to 0.1 L: about 250 atm, ideal gas not applicable'), (2, 273.15, '0.0448', 'transfer', 'two moles at 0 °C')]:
    V = mp.mpf(V)
    p = kinetic_p(n, mp.mpf(T), V)
    ex = {'N': n * NA, 'nd': n * NA / V}
    ex['p'] = p if p <= 10 * 101325 else (APPROX(p) if p <= 50 * 101325 else NA_())
    case('T08', name, kind, {'n': n, 'Tg': T, 'V': V}, ex, method='kinetic theory with the Maxwell distribution (quadrature)', tol=1e-10)

# T09: first law
for (Q, W, kind, name) in [(500, 200, 'benchmark', 'EX T09'), (0, 0, 'boundary', 'nothing exchanged'), (-300, 100, 'transfer', 'gives off heat and does work')]:
    case('T09', name, kind, {'Q': Q, 'W': W}, {'dU': mp.mpf(Q) - W, 'Won': -mp.mpf(W)}, method='ΔU = Q − W', tol=1e-12, scale={'dU': 1, 'Won': 1})

# T10: work as the quadrature of p dV along each path; heat from the first law; adiabat from pV^γ
def t10(n, T1, V1, V2, T2, g, proc):
    Cv = R / (g - 1)
    p1 = n * R * T1 / V1
    if proc == 1:
        W = mp.quad(lambda V: n * R * T1 / V, [V1, V2]); dU = 0; Te = T1
    elif proc == 2:
        W = mp.quad(lambda V: p1, [V1, V2]); Te = p1 * V2 / (n * R); dU = n * Cv * (Te - T1)
    elif proc == 3:
        W = 0; Te = T2; dU = n * Cv * (T2 - T1)
    else:
        W = mp.quad(lambda V: p1 * (V1 / V)**g, [V1, V2]); Te = p1 * (V1 / V2)**g * V2 / (n * R); dU = n * Cv * (Te - T1)
    return W, dU, dU + W, Te
for (proc, V2, kind, name) in [(1, '0.02', 'benchmark', 'EX T10 isothermal'), (2, '0.02', 'transfer', 'isobaric'), (3, '0.01', 'transfer', 'isochoric to 400 K'), (4, '0.02', 'transfer', 'adiabatic'), (1, '0.01', 'boundary', 'no volume change')]:
    n, T1, V1, T2, g = 1, mp.mpf(300), mp.mpf('0.01'), mp.mpf(400), mp.mpf('1.4')
    W, dU, Q, Te = t10(n, T1, V1, mp.mpf(V2), T2, g, proc)
    case('T10', name, kind, {'n': n, 'T1': T1, 'V1': V1, 'V2': V2, 'T2': T2, 'gamma': g, 'proc': proc}, {'W': W, 'dU': dU, 'Q': Q, 'Tend': Te}, method='quadrature of p dV; first law', tol=1e-10, scale={'W': 1, 'dU': 1, 'Q': 1})

# T11: entropy by integrating δQ/T over the isotherms
for (Th, Tc, Qh, kind, name) in [(600, 300, 1000, 'benchmark', 'EX T11'), (400, 400, 1000, 'boundary', 'equal temperatures: no engine'), (K(100), K(0), 500, 'transfer', 'between 100 °C and 0 °C (absolute temperatures)')]:
    Th, Tc = mp.mpf(Th), mp.mpf(Tc)
    if not Th > Tc:
        case('T11', name, kind, {'Th': Th, 'Tc': Tc, 'Qh': Qh}, {'eta': NA_(), 'W': NA_()}, conds={'order': 'notApplicable'}, method='no engine')
        continue
    Qc = Qh * Tc / Th   # reversible: entropy taken in equals entropy given off
    dS = -mp.quad(lambda q: 1 / Th, [0, Qh]) + mp.quad(lambda q: 1 / Tc, [0, Qc])
    case('T11', name, kind, {'Th': Th, 'Tc': Tc, 'Qh': Qh}, {'eta': (Qh - Qc) / Qh, 'W': Qh - Qc, 'Qc': Qc, 'dS': dS}, method='entropy balance ∫ δQ/T', tol=1e-12, scale={'dS': 1})

# T12: Otto efficiency from the heats of the two isochores along the cycle
for (r, g, kind, name) in [(8, '1.4', 'benchmark', 'EX T12'), ('1.000001', '1.4', 'boundary', 'almost no compression'), (10, '1.3', 'transfer', 'r = 10, γ = 1.3')]:
    r, g = mp.mpf(r), mp.mpf(g)
    T1 = 300; T2 = T1 * r**(g - 1); T3 = 2000; T4 = T3 / r**(g - 1)
    Qin = T3 - T2; Qout = T4 - T1
    case('T12', name, kind, {'r': r, 'gamma': g}, {'eta': 1 - Qout / Qin}, method='heats of the cycle (per n Cv)', tol=1e-10, scale={'eta': 1e-6})

# T13: moments of the Maxwell distribution by quadrature
for (T, M, kind, name) in [(300, '0.028', 'benchmark', 'EX T13'), (300, '0.002016', 'transfer', 'hydrogen'), (1, '0.028', 'boundary', 'very cold')]:
    T, M = mp.mpf(T), mp.mpf(M)
    a = M / (2 * R * T)
    f = lambda v: 4 * mp.pi * (a / mp.pi)**mp.mpf(1.5) * v**2 * mp.exp(-a * v**2)
    vrms = mp.sqrt(mp.quad(lambda v: v**2 * f(v), [0, mp.inf]))
    vmean = mp.quad(lambda v: v * f(v), [0, mp.inf])
    vp = mp.findroot(lambda v: mp.diff(f, v), 1 / mp.sqrt(a))
    case('T13', name, kind, {'Tg': T, 'M': M}, {'vrms': vrms, 'vmean': vmean, 'vp': vp}, method='moments and maximum of the Maxwell distribution', tol=1e-10)

# T14: sums over the two states
for (x, T, kind, name) in [(mp.log(3), 300, 'benchmark', 'EX T14'), (mp.mpf('1e-6'), 300, 'limit', 'high temperature: P1 → 1/2'), (50, 300, 'boundary', 'low temperature: ground state')]:
    D = x * kB * T
    Es = [0, D]; ws = [mp.exp(-E_ / (kB * T)) for E_ in Es]; Z = sum(ws)
    case('T14', name, kind, {'D': D, 'Tg': T}, {'Z': Z, 'P1': ws[1] / Z, 'E': sum(E_ * w for E_, w in zip(Es, ws)) / Z}, method='sum over states', tol=1e-12, scale={'P1': 1e-300, 'E': 1e-300})

# T15: Monte-Carlo-free check: the Gaussian solution of the diffusion equation, its second moment by quadrature
for (D, t, kind, name) in [('0.1', 5, 'benchmark', 'EX T15'), ('0.1', '1e-9', 'boundary', 'just started'), ('2e-9', 3600, 'transfer', 'molecule in water for an hour')]:
    D, t = mp.mpf(D), mp.mpf(t)
    s2 = 2 * D * t
    g_ = lambda x: mp.exp(-x**2 / (4 * D * t)) / mp.sqrt(4 * mp.pi * D * t)
    msd = mp.quad(lambda x: x**2 * g_(x), [-mp.inf, 0, mp.inf])
    case('T15', name, kind, {'D': D, 't': t}, {'msd': msd, 'sd': mp.sqrt(msd), 'mean': mp.quad(lambda x: x * g_(x), [-mp.inf, 0, mp.inf])}, method='second moment of the diffusion kernel (quadrature)', tol=1e-9, scale={'mean': 1e-6, 'msd': 1e-30, 'sd': 1e-30})

# T16: enumerate the four states
for (J, hh, kT, kind, name) in [(1, 0, 1, 'benchmark', 'EX T16'), (1, '0.5', 1, 'transfer', 'with a field'), (1, 0, 100, 'limit', 'hot: all states alike')]:
    J, hh, kT = map(mp.mpf, (J, hh, kT))
    states = [(1, 1), (1, -1), (-1, 1), (-1, -1)]
    Es = [-J * a * b - hh * (a + b) for a, b in states]
    ws = [mp.exp(-E_ / kT) for E_ in Es]; Z = sum(ws)
    case('T16', name, kind, {'J': J, 'h': hh, 'kT': kT}, {'Ealigned': Es[0], 'Eanti': Es[1], 'acc': min(1, mp.exp(-2 * J / kT)), 'Z': Z, 'E': sum(E_ * w for E_, w in zip(Es, ws)) / Z}, method='enumeration of the four states', tol=1e-12, scale={'E': 1})
case('T16', 'ferromagnet at low temperature', 'boundary', {'J': 1, 'h': 0, 'kT': '0.05' and 0.05}, {'acc': mp.exp(-40)}, method='Metropolis probability', tol=1e-12)
