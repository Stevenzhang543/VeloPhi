from common import *

# Q01: photon energy E = hf with f = c/λ; threshold
for (lam, phi_eV, kind, name) in [('400e-9', 2, 'benchmark', 'EX Q01'), ('700e-9', 2, 'boundary', 'below threshold: no emission'), ('250e-9', '4.3', 'transfer', 'UV on a 4.3 eV metal')]:
    lam = mp.mpf(lam); phi = mp.mpf(phi_eV) * e
    f_ = c / lam; E = h * f_
    ex = {'E': E, 'f0': phi / h}
    if E > phi:
        ex.update({'K': E - phi, 'Us': (E - phi) / e})
    else:
        ex.update({'K': NA_(), 'Us': NA_()})
    case('Q01', name, kind, {'lam': lam, 'phi': phi}, ex, conds={'emits': 'applicable' if E > phi else 'notApplicable'}, method='E = h c/λ', tol=1e-12)

# Q02: energy and momentum conservation solved numerically for the scattered photon (findroot)
def compton(lam, th):
    E0 = h * c / lam; mc2 = me * c**2
    def eqs(E1):
        # electron energy from energy conservation; its momentum² from momentum conservation
        Ee = E0 + mc2 - E1
        p2 = (E0**2 + E1**2 - 2 * E0 * E1 * mp.cos(th)) / c**2
        return Ee**2 - (p2 * c**2 + mc2**2)
    E1 = mp.findroot(eqs, E0 * mp.mpf('0.99'))
    return h * c / E1, E0 - E1
for (lam, th, kind, name) in [('7.1e-11', mp.pi / 2, 'benchmark', 'EX Q02'), ('7.1e-11', mp.mpf('1e-6'), 'boundary', 'grazing: almost no shift'), ('2e-12', mp.pi, 'transfer', 'backscatter of a hard photon')]:
    lam = mp.mpf(lam)
    l2, K = compton(lam, th)
    case('Q02', name, kind, {'lam': lam, 'th': th}, {'dl': l2 - lam, 'lam2': l2, 'Ke': K}, method='four-momentum conservation (findroot)', tol=1e-9, scale={'dl': 1e-24, 'Ke': 1e-30})

# Q03: momentum from the relativistic energy–momentum relation (findroot); non-relativistic separately
for (U, kind, name) in [(150, 'benchmark', 'EX Q03'), ('1e5', 'boundary', '100 kV: relativistic, non-relativistic formula not applicable'), ('1e3', 'transfer', '1 kV')]:
    U = mp.mpf(U); K = e * U; mc2 = me * c**2
    p = mp.findroot(lambda p: mp.sqrt((p * c)**2 + mc2**2) - mc2 - K, mp.sqrt(2 * me * K))
    ex = {'lamRel': h / p, 'p': p}
    frac = K / mc2
    pn = mp.sqrt(2 * me * K)
    ex['lam'] = h / pn if frac <= mp.mpf('0.01') else (APPROX(h / pn) if frac <= mp.mpf('0.05') else NA_())
    case('Q03', name, kind, {'U': U}, ex, method='relativistic energy–momentum relation (findroot)', tol=1e-10)

# Q04: photon energy as the difference of the level energies
for (ni, nf, kind, name) in [(3, 2, 'benchmark', 'EX Q04 (Hα, simplified)'), (2, 3, 'boundary', 'absorption: no emitted line'), (2, 1, 'transfer', 'Lyman α')]:
    E1 = mp.mpf('13.6') * e
    En = lambda n: -E1 / mp.mpf(n)**2
    if ni > nf:
        dE = En(ni) - En(nf)
        case('Q04', name, kind, {'ni': ni, 'nf': nf, 'E1': E1}, {'dE': dE, 'lam': h * c / dE, 'f': dE / h}, method='difference of level energies', tol=1e-12)
    else:
        case('Q04', name, kind, {'ni': ni, 'nf': nf, 'E1': E1}, {'dE': NA_(), 'lam': NA_()}, conds={'emission': 'notApplicable'}, method='no emission')

# Q05: shooting: ψ″ = −k²ψ on [0, 1] (scaled), ψ(0) = 0, ψ′(0) = 1; k from the root of ψ(1) (odefun + findroot)
mp.mp.dps = 25
def well_k(n):
    def psi1(K):
        sol = mp.odefun(lambda x, y: [y[1], -K * y[0]], 0, [0, 1])
        return sol(1)[0]
    return mp.sqrt(mp.findroot(psi1, (n * mp.pi)**2 * mp.mpf('1.01')))
k1, k2, k3 = well_k(1), well_k(2), well_k(3)
mp.mp.dps = 50
for (m, Lw, n, kind, name) in [(me, '1e-9', 3, 'benchmark', 'EX Q05 (electron, 1 nm)'), (me, '1e-10', 1, 'transfer', 'atom-sized well'), (mp.mpf(1000) * me, '1e-9', 2, 'boundary', 'heavy particle: small levels')]:
    Lw = mp.mpf(Lw)
    E = lambda k: hbar**2 * k**2 / (2 * m * Lw**2)
    kn = {1: k1, 2: k2, 3: k3}[n]
    case('Q05', name, kind, {'m': m, 'Lw': Lw, 'n': n}, {'E1': E(k1), 'E2': E(k2), 'En': E(kn), 'ratio': (k2 / k1)**2}, method='shooting with mpmath.odefun and findroot', tol=1e-9)

# Q06: shooting for the oscillator: ψ″ = (x² − 2E)ψ from x = −7 with the decaying start, parity at 0
mp.mp.dps = 20
def osc_E(n):
    x0 = mp.mpf(-7)
    def mismatch(E):
        # asymptotic start ~ |x|^ν e^{−x²/2}
        nu = E - mp.mpf('0.5')
        y0 = abs(x0)**nu * mp.exp(-x0**2 / 2); dy0 = y0 * (-nu / abs(x0) * (-1) - x0) * 1
        dy0 = y0 * (nu / x0 - x0)
        sol = mp.odefun(lambda x, y: [y[1], (x**2 - 2 * E) * y[0]], x0, [y0, dy0])
        y = sol(0)
        return y[1] if n % 2 == 0 else y[0]
    return mp.findroot(mismatch, n + mp.mpf('0.5') + mp.mpf('0.01'))
E0, E1_, E2 = osc_E(0), osc_E(1), osc_E(2)
mp.mp.dps = 50
for (w, n, kind, name) in [(1, 2, 'benchmark', 'EX Q06'), (1, 0, 'boundary', 'ground state'), ('0.5', 1, 'transfer', 'half the quantum')]:
    w = mp.mpf(w)
    case('Q06', name, kind, {'w': w, 'n': n}, {'E0': E0 * w, 'E1': E1_ * w, 'En': {0: E0, 1: E1_, 2: E2}[n] * w}, method='shooting of the Schrödinger equation (odefun, findroot)', tol=1e-9)

# Q07: transfer-matrix solution: match ψ and ψ′ at both edges as a 4×4 linear system
def barrier_T(V0, a, E, m=1):
    k = mp.sqrt(2 * m * E)
    q = mp.sqrt(2 * m * (E - V0) + 0j)
    # unknowns: r, A, B, t ; ψ = e^{ikx} + r e^{−ikx} (x<0), A e^{iqx} + B e^{−iqx} (0<x<a), t e^{ikx} (x>a)
    M = mp.matrix([[-1, 1, 1, 0], [1j * k, 1j * q, -1j * q, 0], [0, mp.exp(1j * q * a), mp.exp(-1j * q * a), -mp.exp(1j * k * a)], [0, 1j * q * mp.exp(1j * q * a), -1j * q * mp.exp(-1j * q * a), -1j * k * mp.exp(1j * k * a)]])
    rhs = mp.matrix([1, 1j * k, 0, 0])
    s = mp.lu_solve(M, rhs)
    return abs(s[3])**2, abs(s[0])**2
for (V0, a, E, kind, name) in [(1, 1, '0.5', 'benchmark', 'EX Q07'), (1, 1, 2, 'transfer', 'above the barrier'), (1, 1, '0.999', 'boundary', 'just below the top')]:
    V0, a, E = map(mp.mpf, (V0, a, E))
    T_, R_ = barrier_T(V0, a, E)
    case('Q07', name, kind, {'V0': V0, 'a': a, 'E': E, 'm': 1}, {'T': T_, 'R': R_}, conds={'below': 'applicable' if E < V0 else 'notApplicable'}, method='transfer matrix (4×4 matching, lu_solve)', tol=1e-10)

# Q08: moments of the initial packet by quadrature, then the free evolution of ⟨x⟩ and ⟨x²⟩ (Ehrenfest)
def packet(x0, p0, s0, t, m=1, hb=1):
    psi = lambda x: (2 * mp.pi * s0**2)**mp.mpf(-0.25) * mp.exp(-(x - x0)**2 / (4 * s0**2) + 1j * p0 * x / hb)
    dpsi = lambda x: mp.diff(psi, x)
    pts = [x0 - 12 * s0, x0, x0 + 12 * s0]
    X = mp.quad(lambda x: x * abs(psi(x))**2, pts)
    X2 = mp.quad(lambda x: x**2 * abs(psi(x))**2, pts)
    P = mp.re(mp.quad(lambda x: mp.conj(psi(x)) * (-1j * hb) * dpsi(x), pts))
    P2 = mp.quad(lambda x: hb**2 * abs(dpsi(x))**2, pts)
    XP = mp.re(mp.quad(lambda x: mp.conj(psi(x)) * (x * (-1j * hb) * dpsi(x)), pts))
    XPsym = XP - 1j * hb / 2   # symmetrized ⟨xp + px⟩/2 = Re⟨xp⟩ for this packet
    Xt = X + P * t / m
    X2t = X2 + 2 * mp.re(XPsym) * t / m + P2 * t**2 / m**2
    return Xt, X2t - Xt**2, mp.sqrt(P2 - P**2)
mp.mp.dps = 25
for (x0, p0, s0, t, kind, name) in [(-5, 2, 1, 2, 'benchmark', 'EX Q08'), (-5, 2, 1, 0, 'boundary', 't = 0'), (0, '-1', '0.5', 3, 'transfer', 'narrow packet spreads faster')]:
    x0, p0, s0 = map(mp.mpf, (x0, p0, s0))
    Xt, var, sp = packet(x0, p0, s0, mp.mpf(t))
    case('Q08', name, kind, {'x0': x0, 'p0': p0, 's0': s0, 't': t, 'm': 1, 'hb': 1}, {'x': Xt, 'var': var, 'sx': mp.sqrt(var), 'sp': sp}, method='initial moments by quadrature, free evolution of ⟨x⟩ and ⟨x²⟩', tol=1e-9, scale={'x': 1})
mp.mp.dps = 50

# Q09: Born rule with spinors: |⟨n|↑z⟩|² for n in the x–z plane
for (th, N, kind, name) in [(mp.pi / 2, 1000, 'benchmark', 'EX Q09'), (0, 1000, 'boundary', 'same axis: certain'), (mp.pi / 3, 400, 'transfer', '60° between the axes')]:
    up = mp.matrix([1, 0])
    n_up = mp.matrix([mp.cos(th / 2), mp.sin(th / 2)])
    Pp = abs((n_up.T * up)[0])**2
    case('Q09', name, kind, {'th': th, 'N': N}, {'Pp': Pp, 'Pm': 1 - Pp, 'Np': N * Pp, 'se': mp.sqrt(Pp * (1 - Pp) / N)}, method='spinor projection', tol=1e-12, scale={'Pp': 1, 'Pm': 1, 'se': 1e-6, 'Np': 1})

# Q10: matrix exponential of the rotating-frame Hamiltonian H = (ħ/2)[[−Δ, Ω], [Ω, Δ]] acting on |g⟩
for (Om, De, t, kind, name) in [(2, 0, mp.pi / 2, 'benchmark', 'EX Q10 (π pulse)'), (2, 0, 0, 'boundary', 't = 0'), (2, '1.5', 1, 'transfer', 'detuned drive')]:
    Om, De, t = mp.mpf(Om), mp.mpf(De), mp.mpf(t)
    H = mp.matrix([[-De / 2, Om / 2], [Om / 2, De / 2]])
    U = mp.expm(-1j * H * t)
    psi = U * mp.matrix([1, 0])
    Pe = abs(psi[1])**2
    case('Q10', name, kind, {'Om': Om, 'De': De, 't': t}, {'Pe': Pe, 'Pg': abs(psi[0])**2, 'tpi': mp.pi / Om}, method='matrix exponential (mpmath.expm)', tol=1e-12, scale={'Pe': 1, 'Pg': 1})

# Q11: build |Φ⁺⟩, projectors along a and b, partial trace for the entropy
def bell(a, b):
    phi = mp.matrix([1, 0, 0, 1]) / mp.sqrt(2)
    def proj(ang, sgn):
        v = mp.matrix([mp.cos(ang / 2), mp.sin(ang / 2)]) if sgn > 0 else mp.matrix([-mp.sin(ang / 2), mp.cos(ang / 2)])
        return v * v.T
    def kron(A, B):
        return mp.matrix([[A[i // 2, j // 2] * B[i % 2, j % 2] for j in range(4)] for i in range(4)])
    P = lambda s1, s2: (phi.T * kron(proj(a, s1), proj(b, s2)) * phi)[0]
    rho = phi * phi.T
    rhoA = mp.matrix([[rho[0, 0] + rho[1, 1], rho[0, 2] + rho[1, 3]], [rho[2, 0] + rho[3, 1], rho[2, 2] + rho[3, 3]]])
    ev = mp.eigsy(rhoA)[0]
    S = -sum(l * mp.log(l) for l in ev if l > 0)
    return P(1, 1), P(1, -1), P(1, 1) + P(-1, -1), S, P(1, 1) + P(-1, -1) - P(1, -1) - P(-1, 1)
for (a, b, kind, name) in [(0, 0, 'benchmark', 'EX Q11 (z basis)'), (0, mp.pi, 'boundary', 'opposite axes: always different'), (0, mp.pi / 4, 'transfer', 'axes 45° apart')]:
    P00, P01, Ps, S, E_ = bell(mp.mpf(a), mp.mpf(b))
    case('Q11', name, kind, {'a': a, 'b': b}, {'Psame': Ps, 'P00': P00, 'P01': P01, 'S': S, 'E': E_}, method='state vector, projectors and partial trace', tol=1e-12, scale={'P01': 1, 'P00': 1, 'Psame': 1, 'E': 1})

# Q12: ⟨H⟩ of the trial Gaussian by quadrature; the best α by findroot of d⟨H⟩/dα
def trial_E(al, lam):
    norm = mp.quad(lambda x: mp.exp(-al * x**2), [-mp.inf, mp.inf])
    kin = mp.quad(lambda x: mp.diff(lambda y: mp.exp(-al * y**2 / 2), x)**2 / 2, [-mp.inf, mp.inf])
    pot = mp.quad(lambda x: (x**2 / 2 + lam * x**4) * mp.exp(-al * x**2), [-mp.inf, mp.inf])
    return (kin + pot) / norm
mp.mp.dps = 20
for (lam, al, kind, name) in [('0.1', 1, 'benchmark', 'EX Q12'), (0, 1, 'boundary', 'no perturbation: exact 0.5'), ('0.25', '1.3', 'transfer', 'stronger anharmonicity: first order only approximate')]:
    lam, al = mp.mpf(lam), mp.mpf(al)
    E1 = mp.mpf('0.5') + lam * mp.quad(lambda x: x**4 * mp.exp(-x**2), [-mp.inf, mp.inf]) / mp.sqrt(mp.pi)
    aopt = mp.findroot(lambda a: mp.diff(lambda y: trial_E(y, lam), a), 1.2) if lam > 0 else mp.mpf(1)
    ex = {'Ea': trial_E(al, lam), 'aopt': aopt}
    ex['E1'] = E1 if lam <= mp.mpf('0.1') else (APPROX(E1) if lam <= mp.mpf('0.3') else NA_())
    case('Q12', name, kind, {'lam': lam, 'al': al}, ex, method='quadrature of ⟨H⟩; minimum by findroot', tol=1e-9)
mp.mp.dps = 50

# Q13: Bose as a geometric series of Boltzmann factors; Fermi as the probability of a two-state occupation
for (Ex, mu_, kT, kind, name) in [(0, 0, 1, 'benchmark', 'EX Q13 fermion at E = μ'), (mp.log(2), 0, 1, 'transfer', 'EX Q13 boson (E − μ)/kT = ln 2'), (0, '0.1', 1, 'boundary', 'boson below μ: undefined')]:
    Ex, mu_ = mp.mpf(Ex), mp.mpf(mu_)
    x = (Ex - mu_) / kT
    nF = mp.exp(-x) / (1 + mp.exp(-x))
    ex = {'nF': nF, 'nMB': mp.exp(-x)}
    ex['nB'] = mp.nsum(lambda k: mp.exp(-k * x), [1, mp.inf]) if x > 0 else NA_()
    case('Q13', name, kind, {'E': Ex, 'mu': mu_, 'kT': kT}, ex, conds={'boseOk': 'applicable' if x > 0 else 'notApplicable'}, method='sums over occupations', tol=1e-12)

# Q14: Bloch sum on the infinite chain (complex arithmetic) and the extremes of a long finite chain (eigenvalues)
import numpy as np
for (e0, th, ka, kind, name) in [(0, e, mp.pi / 2, 'benchmark', 'EX Q14'), (0, e, 0, 'boundary', 'band bottom (k = 0)'), (mp.mpf('0.5') * e, mp.mpf('0.2') * e, mp.pi / 3, 'transfer', 'other site energy and hopping')]:
    E = e0 - th * mp.re(mp.exp(1j * ka) + mp.exp(-1j * ka))
    N = 400
    Hm = np.diag(np.full(N, float(e0 / e))) - float(th / e) * (np.eye(N, k=1) + np.eye(N, k=-1))
    Hm[0, -1] = Hm[-1, 0] = -float(th / e)   # periodic chain
    ev = np.linalg.eigvalsh(Hm)
    case('Q14', name, kind, {'e0': e0, 'th': th, 'ka': ka}, {'E': E, 'Emin': ev[0] * e, 'Emax': ev[-1] * e, 'W': (ev[-1] - ev[0]) * e}, method='Bloch sum; eigenvalues of a periodic 400-site chain (numpy)', tol=1e-12, scale={'E': 1e-19})
