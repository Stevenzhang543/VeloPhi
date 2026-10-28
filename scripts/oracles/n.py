from common import *

MeV = mp.mpf('1e6') * e

# N01: λ from the root of e^{−λT½} = ½, N(t) by integrating dN/dt = −λN, the spread by summing the binomial law
def binom_sd(N0, p):
    N0 = int(N0)
    pm = [mp.binomial(N0, k) * p**k * (1 - p)**(N0 - k) for k in range(N0 + 1)]
    m1 = mp.fsum(k * q for k, q in enumerate(pm))
    m2 = mp.fsum(k * k * q for k, q in enumerate(pm))
    return mp.sqrt(max(m2 - m1**2, 0))
for (N0, Th, t, kind, name) in [(1600, 4, 12, 'benchmark', 'EX N01'), (1600, 4, 0, 'boundary', 't = 0: nothing decayed, no spread'), (500, 10, 3, 'transfer', 'less than a half-life')]:
    Th = mp.mpf(Th)
    lam = mp.findroot(lambda l: mp.exp(-l * Th) - mp.mpf('0.5'), (0, 1 / Th), solver='anderson')
    N = ode(lambda tt, y: [-lam * y[0]], [N0], t)[0] if t > 0 else mp.mpf(N0)
    case('N01', name, kind, {'N0': N0, 'Th': Th, 't': t}, {'lam': lam, 'N': N, 'A': lam * N, 'sd': binom_sd(N0, N / N0)}, method='root for λ, mpmath.odefun of dN/dt = −λN, binomial sums', tol=1e-10, scale={'sd': 1})

# N02: integrate the three-member chain as a linear ODE system (no Bateman formula)
def chain(N10, l1, l2, t):
    if t == 0:
        return [mp.mpf(N10), mp.mpf(0), mp.mpf(0)]
    return ode(lambda tt, y: [-l1 * y[0], l1 * y[0] - l2 * y[1], l2 * y[1]], [N10, 0, 0], t)
for (N10, l1, l2, t, kind, name) in [(100, mp.log(2), mp.log(2), 1, 'benchmark', 'EX N02 (equal constants)'), (100, mp.log(2), mp.log(2) * (1 + mp.mpf('1e-6')), 1, 'boundary', 'nearly equal constants: Bateman stays accurate'), (1000, '0.1', 1, 5, 'transfer', 'short-lived daughter'), (100, mp.log(2), mp.log(2), 0, 'boundary', 't = 0')]:
    l1, l2 = mp.mpf(l1), mp.mpf(l2)
    y = chain(N10, l1, l2, t)
    equal = abs(l2 - l1) <= mp.mpf('1e-9') * l1
    case('N02', name, kind, {'N10': N10, 'l1': l1, 'l2': l2, 't': t}, {'N1': y[0], 'N2': y[1], 'N3': y[2]}, conds={'equal': 'applicable' if equal else 'notApplicable', 'distinct': 'notApplicable' if equal else 'applicable'}, method='mpmath.odefun of the chain', tol=1e-8, scale={'N2': 1e-6, 'N3': 1e-6})

# N03: atomic masses in kg from the mass excesses; Q from the mass difference; the alpha energy from momentum
# conservation with masses A·u (findroot for the common momentum)
def alpha(A0, Z0, A1, Z1, D0, D1, Da):
    M = lambda A, D: A * mu + D / c**2
    Q = (M(A0, D0) - M(A1, D1) - M(4, Da)) * c**2
    p = mp.findroot(lambda p: p**2 / (2 * A1 * mu) + p**2 / (2 * 4 * mu) - Q, mp.sqrt(2 * 4 * mu * Q))
    return Q, p**2 / (2 * 4 * mu)
for (A0, Z0, A1, Z1, D0, D1, kind, name) in [(238, 92, 234, 90, '47.309', '40.615', 'benchmark', 'EX N03 ²³⁸U'), (210, 84, 206, 82, '-15.953', '-23.7854', 'transfer', '²¹⁰Po → ²⁰⁶Pb + α'), (238, 92, 235, 90, '47.309', '40.615', 'boundary', 'unbalanced nucleon number')]:
    D0, D1, Da = mp.mpf(D0) * MeV, mp.mpf(D1) * MeV, mp.mpf('2.424916') * MeV
    ins = {'A0': A0, 'Z0': Z0, 'A1': A1, 'Z1': Z1, 'D0': D0, 'D1': D1, 'Da': Da}
    if A0 - A1 == 4 and Z0 - Z1 == 2:
        Q, Ka = alpha(A0, Z0, A1, Z1, D0, D1, Da)
        case('N03', name, kind, ins, {'Q': Q, 'Ka': Ka}, conds={'balanced': 'applicable'}, method='masses from excesses; momentum conservation (findroot)', tol=1e-10)
    else:
        case('N03', name, kind, ins, {'Q': NA_(), 'Ka': NA_()}, conds={'balanced': 'notApplicable'}, method='A and Z do not balance')

# N04: binding energy from the masses of hydrogen atoms, neutrons and the atom
for (Z, N, Dx, kind, name) in [(1, 1, '13.135722', 'benchmark', 'EX N04 deuterium'), (2, 2, '2.424916', 'transfer', '⁴He'), (1, 0, '7.288971', 'boundary', '¹H: nothing bound')]:
    DH, Dn, Dx = mp.mpf('7.288971') * MeV, mp.mpf('8.071318') * MeV, mp.mpf(Dx) * MeV
    MH, Mn, Mx = mu + DH / c**2, mu + Dn / c**2, (Z + N) * mu + Dx / c**2
    B = (Z * MH + N * Mn - Mx) * c**2
    case('N04', name, kind, {'Z': Z, 'N': N, 'DH': DH, 'Dn': Dn, 'Da': Dx}, {'B': B, 'BA': B / (Z + N)}, method='mass difference in kg', tol=1e-9, scale={'B': 1e-16, 'BA': 1e-16})

# N05: deflection from the orbit integral θ = π − 2∫₀^{u_max} b du / √(1 − b²u² − (k/E)u) and r_min from the
# turning point (findroot), both from energy and angular-momentum conservation
def rutherford(E, z, Zt, b):
    k = ke * z * Zt * e**2
    umax = mp.findroot(lambda u: 1 - b**2 * u**2 - k / E * u, (0, 1 / b), solver='anderson')
    I = mp.quad(lambda u: b / mp.sqrt(1 - b**2 * u**2 - k / E * u), [0, umax])
    return mp.pi - 2 * I, 1 / umax
for (EM, z, Zt, b, Rn, kind, name) in [(5, 2, 79, '100e-15', '7e-15', 'benchmark', 'EX N05'), (2, 1, 29, '50e-15', '5e-15', 'transfer', '2 MeV proton on copper'), (40, 2, 79, '1e-15', '7e-15', 'boundary', 'close collision reaches the nucleus: Coulomb angle not applicable')]:
    E, b, Rn = mp.mpf(EM) * MeV, mp.mpf(b), mp.mpf(Rn)
    th, rmin = rutherford(E, z, Zt, b)
    ins = {'E': E, 'z': z, 'Zt': Zt, 'b': b, 'Rn': Rn}
    if rmin > Rn:
        case('N05', name, kind, ins, {'th': th, 'rmin': rmin}, conds={'outside': 'applicable'}, method='orbit integral (quad) and turning point (findroot)', tol=1e-9)
    else:
        case('N05', name, kind, ins, {'th': NA_(th), 'rmin': rmin}, conds={'outside': 'notApplicable'}, method='orbit integral (quad) and turning point (findroot)', tol=1e-9)

# N06: integrate dI/dx = −μI; the half-value layer as the root of I(x) = I0/2
for (mu_, x, kind, name) in [(20, '0.05', 'benchmark', 'EX N06'), (20, 0, 'boundary', 'no absorber'), (50, '0.1', 'transfer', 'denser absorber')]:
    mu_, x = mp.mpf(mu_), mp.mpf(x)
    I = ode(lambda s, y: [-mu_ * y[0]], [1], x)[0] if x > 0 else mp.mpf(1)
    hvl = mp.findroot(lambda s: mp.exp(-mu_ * s) - mp.mpf('0.5'), (0, 1 / mu_), solver='anderson')
    case('N06', name, kind, {'mu': mu_, 'x': x}, {'frac': I, 'hvl': hvl}, method='mpmath.odefun of dI/dx = −μI; root for x½', tol=1e-12)

# N07: variance of a difference of independent Poisson counts from the sums Σ k² P(k)
def pois_var(lam):
    lam = mp.mpf(lam)
    P = lambda k: mp.exp(-lam + k * mp.log(lam) - mp.loggamma(k + 1))
    top = int(lam + 40 * mp.sqrt(lam) + 50)   # the tail beyond 40 σ is far below 50 digits
    m1 = mp.fsum(k * P(k) for k in range(top))
    m2 = mp.fsum(k * k * P(k) for k in range(top))
    return m2 - m1**2
for (Ns, Nb, kind, name) in [(1100, 100, 'benchmark', 'EX N07'), (400, 50, 'transfer', 'fewer counts'), (15, 5, 'boundary', 'too few counts for the normal approximation')]:
    if Ns >= 20 and Nb >= 20:
        u = mp.sqrt(pois_var(Ns) + pois_var(Nb))
        case('N07', name, kind, {'Ns': Ns, 'Nb': Nb}, {'net': Ns - Nb, 'u': u, 'rel': u / (Ns - Nb)}, conds={'many': 'applicable'}, method='Poisson moments by summation', tol=1e-10)
    else:
        case('N07', name, kind, {'Ns': Ns, 'Nb': Nb}, {'net': Ns - Nb, 'u': NA_(), 'rel': NA_()}, conds={'many': 'notApplicable'}, method='normal approximation not applicable')

# N08: dose as energy per mass (units exercise)
for (E, m, kind, name) in [('1e-6', '0.01', 'benchmark', 'EX N08'), (0, 1, 'boundary', 'nothing deposited'), (2, 70, 'transfer', '2 J in 70 kg')]:
    E, m = mp.mpf(E), mp.mpf(m)
    case('N08', name, kind, {'E': E, 'm': m}, {'D': mp.fdiv(E, m)}, method='E/m', tol=1e-14, scale={'D': 1e-9})

# N09: iterate the generations; the total as an infinite sum (nsum)
for (N0, k, g, kind, name) in [(100, '0.8', 5, 'benchmark', 'EX N09'), (100, 1, 5, 'boundary', 'critical: the total grows without bound'), (1000, '0.5', 10, 'transfer', 'strongly subcritical'), (10, '1.5', 4, 'transfer', 'supercritical')]:
    k = mp.mpf(k); N = mp.mpf(N0)
    for _ in range(g):
        N *= k
    ex = {'N': N}
    ex['total'] = N0 * mp.nsum(lambda j: k**j, [0, mp.inf]) if k < 1 else NA_()
    case('N09', name, kind, {'N0': N0, 'k': k, 'g': g}, ex, conds={'sub': 'applicable' if k < 1 else 'notApplicable'}, method='generation by generation; geometric series by nsum', tol=1e-12)

# N10: energy from the mass defect via u c² in MeV (CODATA 2022 value 931.49410372 MeV), not via c² in SI
for (dm, kind, name) in [('0.01888', 'benchmark', 'EX N10 D + T'), ('0.003505', 'transfer', 'D + D → ³He + n'), (0, 'boundary', 'no mass defect')]:
    dm = mp.mpf(dm)
    case('N10', name, kind, {'dm': dm * mu}, {'Q': dm * mp.mpf('931.49410372') * MeV}, method='u c² in MeV (CODATA 2022)', tol=1e-9, scale={'Q': 1e-16})

# N11: rest energies in MeV (CODATA, not the masses in kg) for the free-neutron decay
SETS = {
    'CODATA2022': ('939.56542194', '938.27208943', '0.51099895069'),
    'CODATA2018': ('939.56542052', '938.27208816', '0.51099895000'),
}
for (cset, mnu, kind, name) in [('CODATA2022', 0, 'benchmark', 'EX N11 (CODATA 2022)'), ('CODATA2018', 0, 'transfer', 'old files: CODATA 2018'), ('CODATA2022', 1, 'boundary', 'a 1 MeV neutrino would forbid the decay')]:
    En, Ep, Ee = (mp.mpf(v) * MeV for v in SETS[cset])
    K = En - Ep - Ee - mnu * MeV
    ex = {'dmc2': En - Ep, 'K': K if K >= 0 else NA_()}
    case('N11', name, kind, {'mnu': mnu * MeV}, ex, conds={'allowed': 'applicable' if K >= 0 else 'notApplicable'}, method='rest energies in MeV (%s)' % cset, tol=2e-7, cset=cset)

# N12: count neutrons by listing the nucleons
for (Z, A, kind, name) in [(6, 14, 'benchmark', 'EX N12 ¹⁴C'), (1, 1, 'boundary', '¹H: no neutron'), (92, 238, 'transfer', '²³⁸U'), (8, 6, 'boundary', 'A < Z is not a nuclide')]:
    nucleons = ['p'] * Z + ['n'] * (A - Z) if A >= Z else None
    if nucleons is None:
        case('N12', name, kind, {'Z': Z, 'A': A}, {'N': NA_(), 'NZ': NA_()}, conds={'valid': 'notApplicable'}, method='not a nuclide')
    else:
        Nn = nucleons.count('n')
        case('N12', name, kind, {'Z': Z, 'A': A}, {'N': Nn, 'NZ': mp.mpf(Nn) / Z}, conds={'valid': 'applicable'}, method='count of the listed nucleons', tol=1e-15, scale={'N': 1, 'NZ': 1})
