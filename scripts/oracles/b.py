from common import *

# B01: Biot–Savart integrated along an infinite wire (quadrature), inside by Ampère with the enclosed current
for (I, r, a, kind, name) in [(10, '0.05', '0.001', 'benchmark', 'EX B01'), (10, '0.0005', '0.001', 'boundary', 'inside the wire'), (-3, 2, '0.001', 'transfer', 'reversed current, far away')]:
    I, r, a = mp.mpf(I), mp.mpf(r), mp.mpf(a)
    if r >= a:
        B = mu0 * abs(I) / (4 * mp.pi) * mp.quad(lambda z: r / (r**2 + z**2)**mp.mpf(1.5), [-mp.inf, mp.inf])
    else:
        B = mu0 * abs(I) * (r**2 / a**2) / (2 * mp.pi * r)
    case('B01', name, kind, {'I': I, 'r': r, 'a': a}, {'B': B}, conds={'outside': 'applicable' if r >= a else 'notApplicable'}, method='Biot–Savart integral; Ampère inside', tol=1e-10)

# B02: loop by Biot–Savart around the ring; finite solenoid by integrating loops along the axis
def loop_center(N, I, R):
    return N * mu0 * I / (4 * mp.pi) * mp.quad(lambda ph: R * R / R**3, [0, 2 * mp.pi])
def solenoid_center(n, I, l, R):
    return mp.quad(lambda z: mu0 * n * I * R**2 / (2 * (R**2 + z**2)**mp.mpf(1.5)), [-l / 2, -10 * R, -R, 0, R, 10 * R, l / 2] if l / 2 > 10 * R else [-l / 2, 0, l / 2])
for (N, I, R, n, ls, Rs, kind, name) in [(10, 2, '0.1', 1000, '0.5', '0.02', 'benchmark', 'EX B02'), (10, 2, '0.1', 1000, '0.05', '0.02', 'boundary', 'short solenoid: long-solenoid formula only approximate (l = 2.5 R)'), (1, 5, '0.25', 2000, 2, '0.01', 'limit', 'very long solenoid')]:
    I, R, ls, Rs = map(mp.mpf, (I, R, ls, Rs))
    ex = {'Bloop': loop_center(N, I, R), 'Bfinite': solenoid_center(n, I, ls, Rs)}
    if ls >= 10 * Rs:
        ex['Bsol'] = mu0 * n * I
    elif ls >= 3 * Rs:
        ex['Bsol'] = APPROX(mu0 * n * I)
    else:
        ex['Bsol'] = NA_()
    case('B02', name, kind, {'N': N, 'I': I, 'R': R, 'n': n, 'ls': ls, 'Rs': Rs}, ex, method='Biot–Savart (quadrature over the loop and along the solenoid)', tol=1e-10)

# B03: field of wire 1 at wire 2 (Biot–Savart integral) times I2
for (I1, I2, d, l, kind, name) in [(10, 10, '0.1', 1, 'benchmark', 'EX B03'), (10, -10, '0.1', 1, 'transfer', 'opposite currents repel'), (10, 10, '0.1', '0.3', 'boundary', 'short wires: total force not applicable')]:
    I1, I2, d, l = map(mp.mpf, (I1, I2, d, l))
    B1 = mu0 * I1 / (4 * mp.pi) * mp.quad(lambda z: d / (d**2 + z**2)**mp.mpf(1.5), [-mp.inf, mp.inf])
    ex = {'f': B1 * I2}
    ex['F'] = B1 * I2 * l if l >= 20 * d else (APPROX(B1 * I2 * l) if l >= 5 * d else NA_())
    case('B03', name, kind, {'I1': I1, 'I2': I2, 'd': d, 'l': l}, ex, method='Biot–Savart field times current', tol=1e-10)

# B04: integrate the Lorentz force for one revolution (radius from the trajectory, period from the return)
mp.mp.dps = 25
def gyration(m, q, v, B):
    f = lambda t, y: [y[2], y[3], q * y[3] * B / m, -q * y[2] * B / m]
    sol = mp.odefun(f, 0, [0, 0, v, 0])
    T0 = 2 * mp.pi * m / (abs(q) * B)
    Tn = mp.findroot(lambda t: sol(t)[3], (T0 * mp.mpf('0.9'), T0 * mp.mpf('1.1')), solver='anderson')  # vy returns to 0 after a full turn
    ymax = sol(Tn / 2)[1]
    return abs(ymax) / 2, Tn
for (m, q, v, B, kind, name) in [(1, 1, 3, 2, 'benchmark', 'EX B04'), (1, -1, 3, 2, 'transfer', 'negative charge turns the other way'), (2, 1, '0.5', 4, 'boundary', 'slow, strong field')]:
    m, q, v, B = map(mp.mpf, (m, q, v, B))
    r, Tn = gyration(m, q, v, B)
    case('B04', name, kind, {'m': m, 'q': q, 'v': v, 'B': B}, {'r': r, 'T': Tn, 'w': -q * B / m}, method='Lorentz-force ODE over one revolution', tol=1e-9)
mp.mp.dps = 50
case('B04', 'neutral particle', 'boundary', {'m': 1, 'q': 0, 'v': 3, 'B': 2}, {'r': NA_(), 'T': NA_()}, conds={'charged': 'notApplicable'}, method='no magnetic force')

# B05: zero net force solved for v
for (E, B, q, v, kind, name) in [(600, '0.2', '1.602176634e-19', 3000, 'benchmark', 'EX B05'), (600, '0.2', '1.602176634e-19', 4000, 'transfer', 'too fast: deflected by the magnetic force'), (600, '0.2', '-1.602176634e-19', 3000, 'boundary', 'negative charge at the selected speed')]:
    E, B, q, v = map(mp.mpf, (E, B, q, v))
    v0 = mp.findroot(lambda x: q * (E - x * B), 1000)
    case('B05', name, kind, {'E': E, 'B': B, 'q': q, 'v': v}, {'v0': v0, 'Fnet': q * (E - v * B)}, method='root of the net force', tol=1e-10, scale={'Fnet': 1e-20})

# B06: mass from the radius equation solved for m
for (q, v, B, r, kind, name) in [('1e-19', '1e5', '0.1', '0.2', 'benchmark', 'EX B06'), ('3.204353268e-19', '2e5', '0.5', '0.1', 'transfer', 'doubly charged ion'), ('1e-19', '1e5', '0.1', '1e-6', 'boundary', 'tiny radius')]:
    q, v, B, r = map(mp.mpf, (q, v, B, r))
    m = mp.findroot(lambda x: x * v / (q * B) - r, mp.mpf('1e-26'))
    case('B06', name, kind, {'q': q, 'v': v, 'B': B, 'r': r}, {'m': m, 'mq': m / q, 'd': 2 * r}, method='radius equation solved for m', tol=1e-10)

# B07: frequency from the period of the orbit; energy from the exit radius; relativistic check
for (B, Rd, U, kind, name) in [('0.5', '0.5', 20000, 'benchmark', 'EX B07 (proton)'), ('1.5', '0.5', 20000, 'boundary', 'strong field: Ek ≈ 2.6 % of mc²: approximate'), ('1.5', 2, 20000, 'limit', 'large dees: relativistic, not applicable')]:
    B, Rd = mp.mpf(B), mp.mpf(Rd)
    f_ = 1 / (2 * mp.pi * mp_ / (e * B))
    K = (e * B * Rd)**2 / (2 * mp_)
    frac = K / (mp_ * c**2)
    if frac <= mp.mpf('0.01'):
        ex = {'f': f_, 'K': K, 'n': K / (e * U)}
    elif frac <= mp.mpf('0.05'):
        ex = {'f': APPROX(f_), 'K': APPROX(K), 'n': APPROX(K / (e * U))}
    else:
        ex = {'f': NA_(), 'K': NA_()}
    case('B07', name, kind, {'q': e, 'm': mp_, 'B': B, 'Rd': Rd, 'U': U}, ex, method='period of the orbit; exit energy p²/(2m) with p = qBR', tol=1e-10)

# B08: Hall voltage from the force balance qE = q v_d B with drift speed v_d = I/(n q A), E = V_H/w
for (I, B, n, t, qc, kind, name) in [(1, '0.5', '1e28', '1e-3', e, 'benchmark', 'EX B08 (electron-like |q|)'), (1, '0.5', '1e28', '1e-3', -e, 'transfer', 'negative carriers: opposite sign'), (1, 0, '1e28', '1e-3', e, 'boundary', 'no field: no Hall voltage')]:
    I, B, n, t = map(mp.mpf, (I, B, n, t))
    w = mp.mpf('0.01')   # width cancels
    vd = I / (n * qc * w * t)
    VH = vd * B * w
    case('B08', name, kind, {'I': I, 'B': B, 'n': n, 't': t, 'qc': qc}, {'VH': VH, 'RH': 1 / (n * qc)}, method='force balance with the drift speed (width cancels)', tol=1e-10, scale={'VH': 1e-9})

# B09: emf as −N dΦ/dt with Φ(t) linear, derivative by mpmath.diff
for (N, A_, B0, B1, dt, al, kind, name) in [(100, '0.01', 0, '0.2', '0.5', 0, 'benchmark', 'EX B09'), (100, '0.01', 0, '0.2', '0.5', mp.pi / 2, 'boundary', 'normal perpendicular to B: no flux change'), (100, '0.01', '0.2', 0, '0.5', mp.pi, 'transfer', 'decreasing field, reversed normal')]:
    A_, B0, B1, dt = map(mp.mpf, (A_, B0, B1, dt))
    Phi = lambda s: A_ * (B0 + (B1 - B0) * s / dt) * mp.cos(al)
    emf = -N * mp.diff(Phi, dt / 2)
    case('B09', name, kind, {'N': N, 'A': A_, 'B0': B0, 'B1': B1, 'dt': dt, 'alpha': al}, {'dPhi': Phi(dt) - Phi(0), 'emf': emf}, method='−N dΦ/dt (mpmath.diff)', tol=1e-10, scale={'dPhi': 1e-3, 'emf': 1e-3})

# B10: force on the current-carrying rod; power balance F v = I² R
for (B, L_, v, R, kind, name) in [('0.5', '0.2', 3, 2, 'benchmark', 'EX B10'), ('0.5', '0.2', 0, 2, 'boundary', 'at rest: no emf'), ('1.2', '0.4', -2, '0.5', 'transfer', 'moving the other way')]:
    B, L_, R = mp.mpf(B), mp.mpf(L_), mp.mpf(R)
    emf = mp.quad(lambda s: v * B, [0, L_])     # ∫ (v × B)·dl along the rod
    I = emf / R; F = I * L_ * B
    case('B10', name, kind, {'B': B, 'L': L_, 'v': v, 'R': R}, {'emf': emf, 'I': I, 'P': I**2 * R, 'F': F, 'Pmech': F * v}, method='∫ (v × B)·dl and the force I L × B', tol=1e-12, scale={'emf': 1, 'I': 1, 'P': 1, 'F': 1, 'Pmech': 1})

# B11: integrate m v′ = F − B²L²v/R; heat by integrating I²R
for (m, B, L_, R, F, t, v0, kind, name) in [(1, 2, '0.5', 1, 4, 1, 0, 'benchmark', 'EX B11'), (1, 2, '0.5', 1, 4, 0, 0, 'boundary', 't = 0'), (1, 2, '0.5', 1, 0, 2, 3, 'transfer', 'coasting: no force, initial 3 m/s'), (1, 2, '0.5', 1, 4, 20, 0, 'limit', 'long after: terminal velocity')]:
    B, L_, R = mp.mpf(B), mp.mpf(L_), mp.mpf(R)
    k = B**2 * L_**2 / R
    if t > 0:
        sol = mp.odefun(lambda tt, y: [y[1], (F - k * y[1]) / m, k * y[1]**2], 0, [0, v0, 0])
        x, v, Q = sol(t)
    else:
        x, v, Q = 0, mp.mpf(v0), 0
    case('B11', name, kind, {'m': m, 'B': B, 'L': L_, 'R': R, 'F': F, 't': t, 'v0': v0}, {'k': k, 'vT': F * R / (B**2 * L_**2), 'v': v, 'x': x, 'Q': Q}, method='mpmath.odefun of the rod; heat = ∫ I²R dt', tol=1e-9, scale={'vT': 1, 'v': 1, 'x': 1, 'Q': 1})

# B12: mutual inductance from the flux linkage (M = k√(L1L2)); energy by integrating the power while ramping both currents
for (L1, L2, k, dI1, I1, I2, kind, name) in [('0.1', '0.4', '0.5', 2, 1, 0, 'benchmark', 'EX B12'), ('0.1', '0.4', 1, 2, 1, -1, 'limit', 'perfect coupling, opposite currents'), ('0.1', '0.4', 0, 2, 1, 1, 'boundary', 'uncoupled')]:
    L1, L2, k = map(mp.mpf, (L1, L2, k))
    M = k * mp.sqrt(L1 * L2)
    # energy: ramp currents linearly from 0 over 1 s, integrate v1 i1 + v2 i2
    W = mp.quad(lambda s: (L1 * I1 + M * I2) * (I1 * s) + (L2 * I2 + M * I1) * (I2 * s), [0, 1])
    case('B12', name, kind, {'L1': L1, 'L2': L2, 'k': k, 'dI1': dI1, 'I1': I1, 'I2': I2}, {'M': M, 'emf2': -M * dI1, 'W': W}, method='flux linkage; energy as ∫ (v1 i1 + v2 i2) dt', tol=1e-12, scale={'M': 1, 'emf2': 1, 'W': 1})

# B13: ideal transformer from power balance and the flux per turn (same dΦ/dt in both windings)
for (N1, N2, V1, I2, Rl, kind, name) in [(10, 1, 230, 2, 0, 'benchmark', 'EX B13'), (1, 20, 230, '0.5', 4, 'transfer', 'step-up with line resistance'), (10, 1, 230, 0, 0, 'boundary', 'no load')]:
    I2, Rl = mp.mpf(I2), mp.mpf(Rl)
    dPhi = mp.mpf(V1) / N1
    V2 = N2 * dPhi
    I1 = mp.findroot(lambda x: V1 * x - V2 * I2, 0.1) if I2 != 0 else mp.mpf(0)
    case('B13', name, kind, {'N1': N1, 'N2': N2, 'V1': V1, 'I2': I2, 'Rline': Rl}, {'V2': V2, 'I1': I1, 'P': V1 * I1, 'Ploss': I2**2 * Rl}, method='equal volts per turn; power balance (findroot)', tol=1e-10, scale={'I1': 1, 'P': 1, 'Ploss': 1})

# B14: the circuit equation solved for I; mechanical power as torque × speed
for (V, R, k, w, kind, name) in [(12, 1, '0.1', 50, 'benchmark', 'EX B14'), (12, 1, '0.1', 120, 'transfer', 'faster than no-load: generating'), (12, 1, '0.1', 0, 'boundary', 'stalled')]:
    k = mp.mpf(k)
    I = mp.findroot(lambda x: V - R * x - k * w, 1)
    ex = {'E': k * w, 'I': I, 'tau': k * I, 'Pm': k * I * w, 'Pcu': I**2 * R, 'Pin': V * I}
    case('B14', name, kind, {'V': V, 'R': R, 'k': k, 'w': w}, ex, conds={'motoring': 'applicable' if V > k * w else 'notApplicable'}, method='armature equation (findroot); P = τω', tol=1e-12, scale={'Pm': 1, 'E': 1, 'I': 1, 'tau': 1, 'Pcu': 1, 'Pin': 1})

# B15: displacement current from the time derivative of the flux of E
for (A_, dE, kind, name) in [('0.01', '1e6', 'benchmark', 'EX B15'), ('0.01', 0, 'boundary', 'static field'), ('0.5', '-3e7', 'transfer', 'discharging')]:
    A_, dE = mp.mpf(A_), mp.mpf(dE)
    Id = eps0 * mp.diff(lambda s: A_ * dE * s, 1)
    case('B15', name, kind, {'A': A_, 'dE': dE}, {'Id': Id, 'dQ': Id}, method='ε0 dΦ_E/dt (mpmath.diff)', tol=1e-10, scale={'Id': 1e-12, 'dQ': 1e-12})

# B16: time average of the Poynting vector over one period (quadrature), B0 from Faraday for a plane wave
for (E0, kind, name) in [(100, 'benchmark', 'EX B16'), ('1e-6', 'boundary', 'very weak wave'), (1000, 'transfer', 'ten times the field')]:
    E0 = mp.mpf(E0)
    B0 = E0 / c
    S = mp.quad(lambda ph: E0 * mp.cos(ph) * B0 * mp.cos(ph) / mu0, [0, 2 * mp.pi]) / (2 * mp.pi)
    case('B16', name, kind, {'E0': E0}, {'B0': B0, 'S': S, 'Erms': mp.sqrt(mp.quad(lambda ph: (E0 * mp.cos(ph))**2, [0, 2 * mp.pi]) / (2 * mp.pi))}, method='period average of E×B/μ0 (quadrature)', tol=1e-9)

# B17: Fresnel from the boundary conditions solved as a linear system (s polarization) and Brewster check (p)
def fresnel(n1, n2, ti):
    st = n1 * mp.sin(ti) / n2
    ct = mp.sqrt(1 - st**2); ci = mp.cos(ti)
    # s: E tangential continuous, H tangential continuous → 1 + r = t, n1 ci (1 − r) = n2 ct t
    sol = mp.lu_solve(mp.matrix([[1, -1], [n1 * ci, n2 * ct]]), mp.matrix([-1, n1 * ci]))
    rs = sol[0]
    rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct)
    return rs, rp
for (n1, n2, ti, kind, name) in [(1, '1.5', 0, 'benchmark', 'EX B17'), (1, '1.5', mp.atan(mp.mpf('1.5')), 'transfer', 'Brewster angle: Rp = 0'), ('1.5', 1, mp.pi / 3, 'boundary', 'total internal reflection: not applicable')]:
    n1, n2 = mp.mpf(n1), mp.mpf(n2)
    if n1 * mp.sin(ti) / n2 > 1:
        case('B17', name, kind, {'n1': n1, 'n2': n2, 'ti': ti}, {'Rs': NA_(), 'Ts': NA_()}, conds={'transmits': 'notApplicable'}, method='no transmitted wave')
        continue
    rs, rp = fresnel(n1, n2, ti)
    case('B17', name, kind, {'n1': n1, 'n2': n2, 'ti': ti}, {'rs': rs, 'Rs': rs**2, 'Rp': rp**2, 'Ts': 1 - rs**2}, method='boundary conditions as a linear system', tol=1e-12, scale={'Rp': 1, 'rs': 1})

# B18: CFL from the von Neumann growth factor of the 2D Yee scheme: largest stable dt = root of max|λ| = 1
for (dx, dy, dt, Lc, kind, name) in [('1e-3', '1e-3', '2e-12', 1, 'benchmark', 'EX B18'), ('1e-3', '1e-3', '3e-12', 1, 'boundary', 'too large a step: unstable'), ('1e-3', '2e-3', '2e-12', '0.5', 'transfer', 'unequal spacing')]:
    dx, dy, dt, Lc = map(mp.mpf, (dx, dy, dt, Lc))
    # stability: (c dt)² (sin²(kx dx/2)/dx² + sin²(ky dy/2)/dy²) ≤ 1 for all k → worst case sines = 1
    dtmax = mp.findroot(lambda s: (c * s)**2 * (1 / dx**2 + 1 / dy**2) - 1, dx / c)
    case('B18', name, kind, {'dx': dx, 'dy': dy, 'dt': dt, 'Lc': Lc}, {'dtmax': dtmax, 'S': dt / dtmax, 'f1': c / (2 * Lc)}, conds={'stable': 'applicable' if dt <= dtmax else 'notApplicable'}, method='von Neumann condition (findroot)', tol=1e-12)

# B19: loop area by integrating H dB around the rectangle
for (Hc, Br, f_, kind, name) in [(100, '0.5', 50, 'benchmark', 'EX B19'), ('1e-9', '0.5', 50, 'boundary', 'almost no hysteresis'), (2000, '1.2', 400, 'transfer', 'hard material at 400 Hz')]:
    Hc, Br = mp.mpf(Hc), mp.mpf(Br)
    w = mp.quad(lambda B: Hc, [-Br, Br]) - mp.quad(lambda B: -Hc, [-Br, Br])
    case('B19', name, kind, {'Hc': Hc, 'Br': Br, 'f': f_}, {'w': w, 'p': w * f_}, method='∮ H dB around the loop', tol=1e-12, scale={'w': 1e-6, 'p': 1e-6})

# B20: telegrapher solution: impedance from Z0 = V/I of a travelling wave, speed from the dispersion ω/k
for (Lp, Cp, ZL, kind, name) in [('250e-9', '100e-12', 100, 'benchmark', 'EX B20'), ('250e-9', '100e-12', 50, 'boundary', 'matched: no reflection'), ('250e-9', '100e-12', 0, 'transfer', 'short circuit: Γ = −1')]:
    Lp, Cp = mp.mpf(Lp), mp.mpf(Cp)
    w = mp.mpf('1e8')
    k = w * mp.sqrt(Lp * Cp)        # dispersion of the lossless line
    Z0 = w * Lp / k                  # V/I of a forward wave from −∂V/∂z = L′ ∂I/∂t
    case('B20', name, kind, {'Lp': Lp, 'Cp': Cp, 'ZL': ZL}, {'Z0': Z0, 'v': w / k, 'G': (ZL - Z0) / (ZL + Z0)}, method='travelling-wave solution of the telegrapher equations', tol=1e-12, scale={'G': 1})
