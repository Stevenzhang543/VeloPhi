from common import *

def nodal(G, Isrc):
    """Solve G·V = I (nodal analysis) in mpmath."""
    return mp.lu_solve(mp.matrix(G), mp.matrix(Isrc))

# E01: force vector from ε0 (k_e = 1/(4πε0)) in components
for (q1, q2, r, a, kind, name) in [('1e-6', '2e-6', '0.1', '0.005', 'benchmark', 'EX E01'), ('1e-6', '-2e-6', '0.1', '0.005', 'transfer', 'unlike charges attract'), ('1e-6', '2e-6', '0.02', '0.005', 'boundary', 'balls close together: point approximation only approximate')]:
    q1, q2, r, a = map(mp.mpf, (q1, q2, r, a))
    Fx = 1 / (4 * mp.pi * eps0) * q1 * q2 * r / r**3
    ex = {'F': abs(Fx), 'Fs': Fx}
    conds = {'point': 'applicable'}
    if r < 10 * a:
        ex = {'F': APPROX(abs(Fx)), 'Fs': APPROX(Fx)}; conds = {'point': 'approximate'}
    case('E01', name, kind, {'q1': q1, 'q2': q2, 'r': r, 'a': a}, ex, conds=conds, method='Coulomb vector with k_e = 1/(4πε0)', tol=1e-12)

# E02: E = −∇V by numerical differentiation of the potential (mpmath.diff)
def V2(q1, q2, d, x, y):
    return ke * (q1 / mp.sqrt((x + d)**2 + y**2) + q2 / mp.sqrt((x - d)**2 + y**2))
for (q1, q2, d, x, y, kind, name) in [('1e-6', '1e-6', '0.1', 0, 0, 'benchmark', 'EX E02: midpoint'), ('1e-6', '-1e-6', '0.1', 0, '0.05', 'transfer', 'dipole, point above the centre'), ('1e-6', '1e-6', '0.1', '0.1', 0, 'boundary', 'at a charge: undefined')]:
    q1, q2, d, x, y = map(mp.mpf, (q1, q2, d, x, y))
    if x == d and y == 0:
        case('E02', name, kind, {'q1': q1, 'q2': q2, 'd': d, 'x': x, 'y': y}, {'Ex': NA_(), 'V': NA_()}, conds={'away': 'notApplicable'}, method='singular point')
        continue
    Ex = -mp.diff(lambda xx: V2(q1, q2, d, xx, y), x)
    Ey = -mp.diff(lambda yy: V2(q1, q2, d, x, yy), y)
    case('E02', name, kind, {'q1': q1, 'q2': q2, 'd': d, 'x': x, 'y': y}, {'Ex': Ex, 'Ey': Ey, 'V': V2(q1, q2, d, x, y)}, method='E = −∇V by mpmath.diff', tol=1e-10, scale={'Ex': 1, 'Ey': 1})

# E03: flux by integrating E·dA over a sphere (mpmath.quad), field from Coulomb
for (Q, r, kind, name) in [('1e-9', '0.2', 'benchmark', 'EX E03'), (0, '0.2', 'boundary', 'no charge enclosed'), ('-3e-9', '2', 'transfer', 'negative charge, larger sphere')]:
    Q, r = mp.mpf(Q), mp.mpf(r)
    E = ke * Q / r**2
    Phi = mp.quad(lambda th: mp.quad(lambda ph: E * r**2 * mp.sin(th), [0, 2 * mp.pi]), [0, mp.pi])
    case('E03', name, kind, {'Q': Q, 'r': r}, {'Phi': Phi, 'E': E}, method='surface integral of E·dA (quadrature)', tol=1e-12, scale={'Phi': 1, 'E': 1})

# E04: work of the field as the integral of qE along a straight path with a linear potential
for (q, V1, V2_, kind, name) in [('2e-6', 100, 20, 'benchmark', 'EX E04'), ('2e-6', 50, 50, 'boundary', 'same potential: no work'), ('-1e-6', 100, 20, 'transfer', 'negative charge')]:
    q = mp.mpf(q); L_ = 1
    W = mp.quad(lambda s: q * (V1 - V2_) / L_, [0, L_])
    case('E04', name, kind, {'q': q, 'V1': V1, 'V2': V2_}, {'dU': -W, 'W': W}, method='∫ qE ds along the path', tol=1e-12, scale={'dU': 1e-12, 'W': 1e-12})

# E05: potential by integrating the field from infinity (quadrature)
def V_sphere(Q, R, r):
    if r >= R:
        return mp.quad(lambda s: ke * Q / s**2, [r, mp.inf])
    return mp.quad(lambda s: ke * Q / s**2, [R, mp.inf])
for (Q, R, r, kind, name) in [('1e-9', '0.1', '0.05', 'benchmark', 'EX E05 inside'), ('1e-9', '0.1', '0.1', 'boundary', 'on the surface'), ('1e-9', '0.1', '0.3', 'transfer', 'outside')]:
    Q, R, r = map(mp.mpf, (Q, R, r))
    E = 0 if r < R else ke * Q / r**2
    case('E05', name, kind, {'Q': Q, 'R': R, 'r': r}, {'Vs': V_sphere(Q, R, R), 'E': E, 'V': V_sphere(Q, R, r)}, conds={'inside': 'applicable' if r < R else 'notApplicable'}, method='V = ∫ E dr from infinity (quadrature)', tol=1e-12, scale={'E': 1})

# E06: energy as the work ∫ V dq of charging (quadrature); halving d at constant U or constant Q
for (A_, d, er, U, kind, name) in [('0.01', '1e-3', 1, 100, 'benchmark', 'EX E06'), ('0.01', '1e-3', 4, 100, 'transfer', 'dielectric εr = 4'), ('0.01', '0.01', 1, 100, 'boundary', 'gap not small: approximate')]:
    A_, d, er = mp.mpf(A_), mp.mpf(d), mp.mpf(er)
    C = eps0 * er * A_ / d; Q = C * U
    W = mp.quad(lambda qq: qq / C, [0, Q])
    ex = {'C': C, 'Q': Q, 'W': W, 'E': U / d, 'Wbat': mp.quad(lambda qq: qq / (2 * C), [0, 2 * C * U]), 'Wiso': mp.quad(lambda qq: qq / (2 * C), [0, Q])}
    conds = {'thin': 'applicable'}
    if d > mp.sqrt(A_) / 20:
        ex = {k: (APPROX(v) if k != 'E' else v) for k, v in ex.items()}; conds = {'thin': 'approximate'}
    case('E06', name, kind, {'A': A_, 'd': d, 'er': er, 'U': U}, ex, conds=conds, method='energy as ∫ V dq (quadrature)', tol=1e-12)

# E07: D and P from the definitions D = ε0 E + P with χ = εr − 1
for (er, E, kind, name) in [(4, 1000, 'benchmark', 'EX E07'), (1, 1000, 'boundary', 'vacuum: no polarization'), (80, 50, 'transfer', 'water-like εr = 80')]:
    P = eps0 * (er - 1) * E
    case('E07', name, kind, {'er': er, 'E': E}, {'D': eps0 * E + P, 'P': P, 'sb': P}, method='D = ε0E + P, P = ε0χE', tol=1e-12, scale={'P': 1e-20, 'sb': 1e-20})

# E08: resistance by integrating dR = ρ dx / A along the wire
for (rho, Lw, Aw, I, kind, name) in [('1.7e-8', 2, '1e-6', 3, 'benchmark', 'EX E08'), ('1.7e-8', 2, '1e-6', 0, 'boundary', 'no current'), ('5e-7', '0.5', '2e-7', '0.5', 'transfer', 'resistance wire')]:
    rho, Aw, I = mp.mpf(rho), mp.mpf(Aw), mp.mpf(I)
    R = mp.quad(lambda x: rho / Aw, [0, Lw])
    case('E08', name, kind, {'rho': rho, 'Lw': Lw, 'Aw': Aw, 'I': I}, {'R': R, 'U': I * R, 'P': I**2 * R}, method='∫ ρ dx/A (quadrature)', tol=1e-12, scale={'U': 1, 'P': 1})

# E09: nodal analysis of the two circuits
for (R1, R2, U, kind, name) in [(6, 3, 9, 'benchmark', 'EX E09'), (1e6, 1, 9, 'limit', 'very unequal resistors'), (6, 3, 0, 'boundary', 'no source voltage')]:
    R1, R2, U = map(mp.mpf, (R1, R2, U))
    # series: node a (after R1), source fixed at U: (1/R1 + 1/R2) Va = U/R1
    Va = nodal([[1 / R1 + 1 / R2]], [U / R1])[0]
    Is = Va / R2
    Ip = U / R1 + U / R2
    case('E09', name, kind, {'R1': R1, 'R2': R2, 'U': U}, {'Rs': (U / Is) if U != 0 else R1 + R2, 'Is': Is, 'U1': U - Va, 'Rp': (U / Ip) if U != 0 else R1 * R2 / (R1 + R2), 'Ip': Ip, 'I1': U / R1, 'I2': U / R2}, method='nodal analysis', tol=1e-12, scale={'Is': 1, 'U1': 1, 'Ip': 1, 'I1': 1, 'I2': 1})

# E10: nodal analysis of the bridge with the galvanometer (nodes: left mid, right mid; top at U, bottom at 0)
def bridge(R1, R2, R3, R4, U, Rg):
    G = [[1 / R1 + 1 / R2 + 1 / Rg, -1 / Rg], [-1 / Rg, 1 / R3 + 1 / R4 + 1 / Rg]]
    V = nodal(G, [U / R1, U / R3])
    return V[0], V[1], (V[0] - V[1]) / Rg
for (R1, R2, R3, R4, U, Rg, kind, name) in [(100, 200, 100, 200, 6, 50, 'benchmark', 'EX E10 balanced'), (100, 200, 120, 200, 6, 50, 'transfer', 'unbalanced arm'), (100, 200, 100, 200, 6, '1e-9', 'boundary', 'ideal galvanometer (Rg → 0)')]:
    R1, R2, R3, R4, U, Rg = map(mp.mpf, (R1, R2, R3, R4, U, Rg))
    Vl, Vr, Ig = bridge(R1, R2, R3, R4, U, Rg)
    ex = {'Ig': Ig}
    if abs(R1 * R4 - R2 * R3) <= mp.mpf('1e-12') * R1 * R4:
        ex.update({'Vl': Vl, 'Il': (U - Vl) / R1})
    else:
        ex.update({'Vl': NA_()})
    case('E10', name, kind, {'R1': R1, 'R2': R2, 'R3': R3, 'R4': R4, 'U': U, 'Rg': Rg}, ex, method='nodal analysis with the galvanometer', tol=1e-10, scale={'Ig': 1e-3})

# E11: full network with the load by nodal analysis; Norton current with the port shorted
for (Vs, R1, R2, RL, kind, name) in [(12, 1000, 1000, 1000, 'benchmark', 'EX E11'), (12, 1000, 1000, '1e12', 'limit', 'open port: VL → Vth'), (12, 1000, 3000, 250, 'transfer', 'other divider and load')]:
    Vs, R1, R2, RL = map(mp.mpf, (Vs, R1, R2, RL))
    V = nodal([[1 / R1 + 1 / R2 + 1 / RL]], [Vs / R1])[0]
    Voc = nodal([[1 / R1 + 1 / R2]], [Vs / R1])[0]
    Isc = Vs / R1
    case('E11', name, kind, {'Vs': Vs, 'R1': R1, 'R2': R2, 'RL': RL}, {'Vth': Voc, 'Rth': Voc / Isc, 'IN': Isc, 'VL': V, 'IL': V / RL}, method='nodal analysis, open-circuit voltage and short-circuit current', tol=1e-10)
case('E11', 'shorted load', 'boundary', {'Vs': 12, 'R1': 1000, 'R2': 1000, 'RL': mp.mpf('1e-9')}, {'IL': mp.mpf(12) / 1000 * (1 / (1 + mp.mpf('1e-9') / 500)) * (1 / (1 + 0)) }, method='load short: IL → Vs/R1', tol=1e-9)

# E12: maximum power by maximizing P(R) numerically (findroot of dP/dR)
for (E, r, R, kind, name) in [(12, 2, 2, 'benchmark', 'EX E12'), (12, 2, 0, 'boundary', 'short circuit'), (12, 2, 8, 'transfer', 'larger load: more efficient, less power')]:
    E, r, R = map(mp.mpf, (E, r, R))
    P = lambda x: E**2 * x / (x + r)**2
    Ropt = mp.findroot(lambda x: mp.diff(P, x), r * 1.3)
    case('E12', name, kind, {'E': E, 'r': r, 'R': R}, {'I': E / (R + r), 'U': E * R / (R + r), 'PR': P(R), 'Pr': (E / (R + r))**2 * r, 'eta': R / (R + r), 'Pmax': P(Ropt)}, method='circuit equations; max of P(R) by findroot of dP/dR', tol=1e-10, scale={'U': 1, 'PR': 1, 'eta': 1})

# E13: nodal analysis with the voltmeter as a resistor
for (Vs, R1, R2, RV, kind, name) in [(10, 10000, 10000, 100000, 'benchmark', 'EX E13'), (10, 10000, 10000, '1e8', 'limit', 'nearly ideal meter'), (10, 10000, 10000, 10000, 'transfer', 'meter as large as the resistor'), (10, 10000, 10000, 2e6, 'boundary', 'RV = 200 R2: ideal result only approximate')]:
    Vs, R1, R2, RV = map(mp.mpf, (Vs, R1, R2, RV))
    Vread = nodal([[1 / R1 + 1 / R2 + 1 / RV]], [Vs / R1])[0]
    Vtrue = nodal([[1 / R1 + 1 / R2]], [Vs / R1])[0]
    ex = {'Vtrue': Vtrue, 'Vread': Vread, 'err': (Vread - Vtrue) / Vtrue}
    if RV >= 1000 * R2:
        ex['Videal'] = Vtrue
    elif RV >= 100 * R2:
        ex['Videal'] = APPROX(Vtrue)
    else:
        ex['Videal'] = NA_()
    case('E13', name, kind, {'Vs': Vs, 'R1': R1, 'R2': R2, 'RV': RV}, ex, method='nodal analysis with the meter resistance', tol=1e-10, scale={'err': 1e-6})

# E14: heat by integrating the power
for (I, R, t, Cth, kind, name) in [(2, 5, 10, 100, 'benchmark', 'EX E14'), (0, 5, 10, 100, 'boundary', 'no current'), ('0.5', 47, 60, 20, 'transfer', 'small resistor heating for a minute')]:
    I = mp.mpf(I)
    Q = mp.quad(lambda s: I**2 * R, [0, t])
    case('E14', name, kind, {'I': I, 'R': R, 't': t, 'Cth': Cth}, {'P': I**2 * R, 'Q': Q, 'dT': Q / Cth}, method='∫ I²R dt', tol=1e-12, scale={'P': 1, 'Q': 1, 'dT': 1})

# E15: integrate C dV/dt = (Vs − V)/R; energies by quadrature of the powers
_rc_cache = {}
def rc(R, C, Vs, V0, t):
    key = (R, C, Vs, V0)
    if key not in _rc_cache:
        _rc_cache[key] = mp.odefun(lambda tt, yy: [(Vs - yy[0]) / (R * C)], 0, [V0])
    return _rc_cache[key](t)[0]
for (R, C, Vs, V0, t, kind, name) in [(1000, '1e-4', 5, 0, '0.1', 'benchmark', 'EX E15'), (1000, '1e-4', 5, 0, 0, 'boundary', 't = 0: VC continuous, current jumps'), (1000, '1e-4', 0, 5, '0.25', 'transfer', 'discharging from 5 V'), (2200, '4.7e-6', 12, 3, '0.05', 'limit', 'after almost 5 τ')]:
    R, C, Vs, V0, t = map(mp.mpf, (R, C, Vs, V0, t))
    VC = rc(R, C, Vs, V0, t) if t > 0 else V0
    tau = R * C
    WR = mp.quad(lambda s: (Vs - rc(R, C, Vs, V0, s))**2 / R, [0, t]) if t > 0 else 0
    case('E15', name, kind, {'R': R, 'C': C, 'Vs': Vs, 'V0': V0, 't': t}, {'tau': tau, 'VC': VC, 'I': (Vs - VC) / R, 'I0': (Vs - V0) / R, 'Vtau': rc(R, C, Vs, V0, tau), 'WC': C * (VC**2 - V0**2) / 2, 'WR': WR}, method='mpmath.odefun of the circuit; quadrature of the power', tol=1e-9, scale={'I': 1e-3, 'WC': 1e-6, 'WR': 1e-6, 'VC': 1})

# E16: integrate L dI/dt = Vs − R I
for (R, L_, Vs, I0, t, kind, name) in [(10, 1, 10, 0, '0.1', 'benchmark', 'EX E16'), (10, 1, 10, 0, 0, 'boundary', 't = 0'), (10, 1, 0, 1, '0.3', 'transfer', 'decay from 1 A')]:
    t = mp.mpf(t)
    I = ode(lambda tt, yy: [(Vs - R * yy[0]) / L_], [I0], t)[0] if t > 0 else mp.mpf(I0)
    case('E16', name, kind, {'R': R, 'L': L_, 'Vs': Vs, 'I0': I0, 't': t}, {'tau': mp.mpf(L_) / R, 'I': I, 'UL': Vs - R * I}, method='mpmath.odefun of the RL circuit', tol=1e-10, scale={'I': 1, 'UL': 1})

# E17: integrate the LC circuit; period from the first return of V to its start, extremes at quarter period
mp.mp.dps = 30
for (L_, C, V0, I0, kind, name) in [(1, '1e-4', 10, 0, 'benchmark', 'EX E17'), (1, '1e-4', 0, 0, 'boundary', 'no energy'), ('0.01', '1e-6', 3, '0.02', 'transfer', 'started with both charge and current')]:
    L_, C, V0, I0 = map(mp.mpf, (L_, C, V0, I0))
    U = C * V0**2 / 2 + L_ * I0**2 / 2
    w = 1 / mp.sqrt(L_ * C)
    if U == 0:
        case('E17', name, kind, {'L': L_, 'C': C, 'V0': V0, 'I0': I0}, {'omega': w, 'T': 2 * mp.pi / w, 'U': 0, 'Imax': 0, 'Vmax': 0}, method='trivial', tol=1e-12, scale={'U': 1, 'Imax': 1, 'Vmax': 1})
        continue
    sol = mp.odefun(lambda t, y: [-y[1] / C, y[0] / L_], 0, [V0, I0])   # y = (V, I): C dV/dt = −I, L dI/dt = V
    # period: the first time after T/2 at which (V, I) returns to the start: root of the phase angle difference
    T0 = 2 * mp.pi / w
    g_ = (lambda t: sol(t)[1]) if I0 == 0 else (lambda t: sol(t)[1] - I0)
    T_ = mp.findroot(g_, (T0 * mp.mpf('0.95'), T0 * mp.mpf('1.05')), solver='anderson')
    Imax = mp.sqrt(2 * U / L_)
    case('E17', name, kind, {'L': L_, 'C': C, 'V0': V0, 'I0': I0}, {'omega': w, 'T': T_, 'U': U, 'Imax': Imax, 'Vmax': mp.sqrt(2 * U / C)}, method='mpmath.odefun of the LC circuit; period from the return of I', tol=1e-9)
mp.mp.dps = 50

# E18: complex impedance (mpmath complex numbers)
for (R, L_, C, Vrms, w, kind, name) in [(10, '0.1', '1e-4', 10, None, 'benchmark', 'EX E18 at resonance'), (10, '0.1', '1e-4', 10, 200, 'transfer', 'below resonance: capacitive'), (10, '0.1', '1e-4', 10, '1e5', 'limit', 'far above resonance: inductive'), (10, '0.1', '1e-4', 10, 1, 'boundary', 'almost DC: the capacitor blocks')]:
    R, L_, C = mp.mpf(R), mp.mpf(L_), mp.mpf(C)
    w = 1 / mp.sqrt(L_ * C) if w is None else mp.mpf(w)
    Z = R + 1j * w * L_ + 1 / (1j * w * C)
    I = Vrms / Z
    case('E18', name, kind, {'R': R, 'L': L_, 'C': C, 'Vrms': Vrms, 'w': w}, {'w0': 1 / mp.sqrt(L_ * C), 'Z': abs(Z), 'I': abs(I), 'phi': mp.arg(Z), 'P': (abs(I)**2 * R)}, method='complex impedance (mpc)', tol=1e-10, scale={'phi': 1})

# E19: constant drop and the exact Shockley root (mpmath.findroot)
def shockley(Vs, R, Is, n, T):
    VT = kB * T / e
    return mp.findroot(lambda x: Vs - x * R - n * VT * mp.log(x / Is + 1), (mp.mpf('1e-15'), Vs / R), solver='anderson')
for (Vs, R, Vd, kind, name) in [(5, 1000, '0.7', 'benchmark', 'EX E19'), ('0.5', 1000, '0.7', 'boundary', 'below the forward drop: blocking'), (12, 470, '0.7', 'transfer', 'higher source voltage')]:
    Vs, Vd = mp.mpf(Vs), mp.mpf(Vd)
    Iexp = shockley(Vs, R, mp.mpf('1e-12'), 1, 300)
    ex = {'Iexp': Iexp}
    ex['I'] = (Vs - Vd) / R if Vs > Vd else 0
    case('E19', name, kind, {'Vs': Vs, 'R': R, 'Vd': Vd, 'Is': '1e-12' and 1e-12, 'n': 1, 'Tj': 300}, ex, conds={'on': 'applicable' if Vs > Vd else 'notApplicable'}, method='Shockley root (findroot); constant drop', tol=1e-9, scale={'I': 1e-6, 'Iexp': 1e-9})

# E20: ideal op-amp from the virtual short (Vn = Vp) as an equation; saturation
for (Rf, Rg, Vi, Vsat, kind, name) in [(9000, 1000, '0.2', 2, 'benchmark', 'EX E20'), (9000, 1000, 1, 5, 'transfer', 'saturates at ±5 V'), (9000, 1000, 0, 2, 'boundary', 'no input')]:
    Vi = mp.mpf(Vi)
    Vo = mp.findroot(lambda vo: vo * Rg / (Rg + Rf) - Vi, 1)
    G = 1 + mp.mpf(Rf) / Rg
    ex = {'G': G, 'IC': 100 * mp.mpf('2e-5')}
    ex['Vo'] = Vo if abs(Vo) <= Vsat else mp.sign(Vi) * Vsat
    case('E20', name, kind, {'Rf': Rf, 'Rg': Rg, 'Vi': Vi, 'Vsat': Vsat, 'beta': 100, 'IB': '2e-5' and 2e-5}, ex, conds={'linear': 'applicable' if abs(Vo) <= Vsat else 'notApplicable'}, method='virtual short as an equation (findroot)', tol=1e-12, scale={'Vo': 1})
