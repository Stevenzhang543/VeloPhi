from common import *
import numpy as np

# W01: integrate m x″ = −k x; the period from the zero of v(t) of a unit release; energy from the state at t
mp.mp.dps = 30
for (m, k, A_, ph, t, kind, name) in [(1, 4, '0.1', 0, 1, 'benchmark', 'EX W01'), (1, 4, 0, 0, 1, 'boundary', 'at rest: no motion'), ('0.5', 50, '0.03', mp.pi / 3, '0.7', 'transfer', 'stiffer spring with a phase')]:
    m, k, A_, ph, t = map(mp.mpf, (m, k, A_, ph, t))
    sol = mp.odefun(lambda tt, y: [y[1], -k / m * y[0]], 0, [mp.mpf(1), mp.mpf(0)])
    half = mp.findroot(lambda tt: sol(tt)[1], (mp.mpf('0.1') * mp.sqrt(m / k), mp.mpf('3.5') * mp.sqrt(m / k)), solver='anderson')
    # half is the first zero of v after the release (half a period)
    T_ = 2 * half
    w0 = 2 * mp.pi / T_
    x0, v0 = A_ * mp.cos(ph), -A_ * w0 * mp.sin(ph)
    if A_ == 0:
        x, v = mp.mpf(0), mp.mpf(0)
    else:
        st = mp.odefun(lambda tt, y: [y[1], -k / m * y[0]], 0, [x0, v0])(t)
        x, v = st
    E = m * v**2 / 2 + k * x**2 / 2
    case('W01', name, kind, {'m': m, 'k': k, 'A': A_, 'phi0': ph, 't': t}, {'w0': w0, 'T': T_, 'x': x, 'v': v, 'vmax': A_ * w0, 'E': E}, method='mpmath.odefun; period from the zero of v', tol=1e-12, scale={'x': 1e-3, 'v': 1e-3, 'vmax': 1e-3, 'E': 1e-6})
mp.mp.dps = 50

# W02: the exact period as four times the quarter swing of θ″ = −(g/ℓ) sin θ (odefun, root of θ(t)); the small-angle
# period from the linearized equation the same way
mp.mp.dps = 25
def quarter(l, g, th0, lin=False):
    rhs = (lambda t, y: [y[1], -g / l * y[0]]) if lin else (lambda t, y: [y[1], -g / l * mp.sin(y[0])])
    sol = mp.odefun(rhs, 0, [th0, mp.mpf(0)])
    w = mp.sqrt(g / l)
    hi = 1.6 / w
    while sol(hi)[0] > 0:
        hi *= 2
    return mp.findroot(lambda t: sol(t)[0], (mp.mpf('0.5') / w, hi), solver='anderson')
for (l, g, th0, kind, name) in [(1, '9.8', '0.2', 'benchmark', 'EX W02 (0.2 rad: small-angle formula only approximate)'), (1, '9.8', '0.05', 'boundary', 'small amplitude'), ('0.5', '9.81', mp.pi / 6, 'transfer', '30°: small-angle formula not applicable'), (1, '9.8', 3, 'boundary', 'near the top: only the exact period')]:
    l, g, th0 = mp.mpf(l), mp.mpf(g), mp.mpf(th0)
    T = 4 * quarter(l, g, th0)
    T0 = 4 * quarter(l, g, mp.mpf(1), lin=True)
    st = lambda v, ok, apx: v if ok else ({'state': 'approximate', 'value': v} if apx else NA_())
    ex = {'T': T, 'T0': st(T0, th0 <= mp.mpf('0.1396'), th0 <= mp.mpf('0.35')), 'T2': st(T0 * (1 + th0**2 / 16), th0 <= mp.mpf('0.6'), th0 <= mp.mpf('1.2'))}
    case('W02', name, kind, {'l': l, 'g': g, 'th0': th0}, ex, method='quarter swing of the nonlinear and linearized ODE (odefun, root)', tol=1e-11)
mp.mp.dps = 50

# W03: integrate m x″ + b x′ + k x = 0 from rest at x0; ω_d from the spacing of successive zeros
mp.mp.dps = 25
for (m, k, b, x0, t, kind, name) in [(1, 4, 2, '0.1', 1, 'benchmark', 'EX W03 underdamped'), (1, 4, 4, '0.1', 1, 'boundary', 'critical damping'), (1, 4, 10, '0.1', 1, 'transfer', 'overdamped'), (1, 4, 4 * (1 + mp.mpf('1e-6')), '0.1', '1.5', 'boundary', 'just above critical: no loss of accuracy')]:
    m, k, b, x0, t = map(mp.mpf, (m, k, b, x0, t))
    sol = mp.odefun(lambda tt, y: [y[1], -(b * y[1] + k * y[0]) / m], 0, [x0, mp.mpf(0)])
    zeta = b / (2 * mp.sqrt(m * k))
    br = 'under' if zeta < 1 - mp.mpf('1e-9') else ('critical' if abs(zeta - 1) <= mp.mpf('1e-9') else 'over')
    ex = {'zeta': zeta, 'x': sol(t)[0]}
    if br == 'under':
        w = mp.sqrt(k / m)
        z1 = mp.findroot(lambda tt: sol(tt)[0], (mp.mpf('0.05') / w, mp.mpf('1.4') * mp.pi / w), solver='anderson')
        z2 = mp.findroot(lambda tt: sol(tt)[0], (z1 + mp.mpf('0.05') / w, z1 + mp.mpf('1.4') * mp.pi / w), solver='anderson')
        ex['wd'] = mp.pi / (z2 - z1)
    else:
        ex['wd'] = NA_()
    conds = {c_: ('applicable' if c_ == br else 'notApplicable') for c_ in ('under', 'critical', 'over')}
    case('W03', name, kind, {'m': m, 'k': k, 'b': b, 'x0': x0, 't': t}, ex, conds=conds, method='mpmath.odefun; ω_d from successive zeros', tol=1e-9, scale={'x': 1e-3})
mp.mp.dps = 50

# W04: the steady state x = P cos ωt + Q sin ωt as a 2×2 linear system; the peak by maximizing the amplitude (findroot of d|A|²/dω)
def steady(m, k, b, F0, w):
    M = mp.matrix([[k - m * w**2, b * w], [-b * w, k - m * w**2]])
    P, Q = mp.lu_solve(M, mp.matrix([F0, 0]))
    return mp.sqrt(P**2 + Q**2), mp.atan2(Q, P)
for (m, k, b, F0, w, kind, name) in [(1, 4, '0.4', 1, 2, 'benchmark', 'EX W04 at ω0'), (1, 4, 0, 1, 2, 'boundary', 'undamped at resonance: no finite steady state'), (1, 4, '0.4', 1, '1.5', 'transfer', 'below resonance'), (1, 4, 3, 1, 1, 'boundary', 'heavy damping: no amplitude peak')]:
    m, k, b, F0, w = map(mp.mpf, (m, k, b, F0, w))
    ins = {'m': m, 'k': k, 'b': b, 'F0': F0, 'w': w}
    finite = b > 0 or abs(k - m * w**2) > mp.mpf('1e-12') * k
    ex = {}
    if finite:
        Amp, de = steady(m, k, b, F0, w)
        ex.update({'Amp': Amp, 'delta': de})
    else:
        ex.update({'Amp': NA_(), 'delta': NA_()})
    if b**2 < 2 * m * k:
        A2 = lambda ww: steady(m, k, b, F0, ww)[0]**2
        ex['wr'] = mp.findroot(lambda ww: mp.diff(A2, ww), mp.sqrt(k / m) * mp.mpf('0.99')) if b > 0 else mp.sqrt(k / m)
    else:
        ex['wr'] = NA_()
    case('W04', name, kind, ins, ex, conds={'finite': 'applicable' if finite else 'notApplicable', 'peak': 'applicable' if b**2 < 2 * m * k else 'notApplicable'}, method='2×2 steady-state system (lu_solve); peak by findroot', tol=1e-10)

# W05: eigenvalues of M⁻¹K (mpmath.eigsy)
for (m, k, kc, kind, name) in [(1, 4, 2, 'benchmark', 'EX W05'), (1, 4, 0, 'boundary', 'uncoupled: degenerate modes, no exchange'), ('0.5', 10, '0.5', 'transfer', 'weak coupling: slow exchange')]:
    m, k, kc = map(mp.mpf, (m, k, kc))
    K = mp.matrix([[k + kc, -kc], [-kc, k + kc]]) / m
    ev = sorted(mp.eigsy(K)[0])
    w1, w2 = mp.sqrt(ev[0]), mp.sqrt(ev[1])
    ex = {'w1': w1, 'w2': w2, 'Tx': mp.pi / (w2 - w1) if kc > 0 else NA_()}
    case('W05', name, kind, {'m': m, 'k': k, 'kc': kc}, ex, conds={'coupled': 'applicable' if kc > 0 else 'notApplicable'}, method='eigenvalues of the stiffness matrix (eigsy)', tol=1e-12)

# W06: integrate dδ/dt = λδ; the predictability time as the root of δ(t) = 0.1
for (d0, lam, t, kind, name) in [('1e-6', '0.5', 10, 'benchmark', 'EX W06'), ('1e-6', '0.5', 0, 'boundary', 't = 0'), ('1e-6', '0.5', 30, 'boundary', 'separation no longer small: estimate not applicable'), ('1e-8', '1.2', 5, 'transfer', 'stronger chaos')]:
    d0, lam, t = map(mp.mpf, (d0, lam, t))
    d = ode(lambda s, y: [lam * y[0]], [d0], t)[0] if t > 0 else d0
    tp = mp.findroot(lambda s: mp.log(d0) + lam * s - mp.log(mp.mpf('0.1')), 1)   # root of ln δ(t) = ln 0.1
    ex = {'tp': tp, 'd': d if d < mp.mpf('0.1') else ({'state': 'approximate', 'value': d} if d < mp.mpf('0.5') else NA_())}
    case('W06', name, kind, {'d0': d0, 'lam': lam, 't': t}, ex, method='mpmath.odefun of dδ/dt = λδ; root for δ = 0.1', tol=1e-11)

# W07: long-wavelength phase velocity of a beaded string (masses μa, tension Ts)
def beaded(Ts, mu, a=mp.mpf('1e-3')):
    kk = mp.mpf('1e-9') / a
    return 2 * mp.sqrt(Ts / (mu * a**2)) * mp.sin(kk * a / 2) / kk
for (Ts, mu, lam, dist, kind, name) in [(100, '0.01', '0.5', 2, 'benchmark', 'EX W07'), (100, '0.01', '0.5', 0, 'boundary', 'no distance'), (70, '4e-4', '1.3', '0.65', 'transfer', 'guitar string')]:
    Ts, mu, lam, dist = map(mp.mpf, (Ts, mu, lam, dist))
    c_ = beaded(Ts, mu)
    case('W07', name, kind, {'Ts': Ts, 'mu': mu, 'lam': lam, 'dist': dist}, {'c': c_, 'f': c_ / lam, 'kw': 2 * mp.pi / lam, 'tt': dist / c_}, method='beaded string, long-wavelength limit', tol=1e-12, scale={'tt': 1e-6})

# W08: continuity of displacement and of the transverse force Ts·∂y/∂x with the wavenumbers k = ω√(μ/Ts) (lu_solve);
# energy ratios from the power flux ½ ω² A² √(Ts μ)
def junction(Ts, mu1, mu2, Ai, w=mp.mpf(10)):
    k1, k2 = w * mp.sqrt(mu1 / Ts), w * mp.sqrt(mu2 / Ts)
    r, t = mp.lu_solve(mp.matrix([[-1, 1], [Ts * k1, Ts * k2]]), mp.matrix([1, Ts * k1]))
    P = lambda mu, A: w**2 * A**2 * mp.sqrt(Ts * mu) / 2
    return r, t, P(mu1, r) / P(mu1, 1), P(mu2, t) / P(mu1, 1)
for (Ts, mu1, mu2, Ai, kind, name) in [(1, 1, 9, '0.01', 'benchmark', 'EX W08'), (1, 1, 1, '0.01', 'boundary', 'matched: no reflection'), (50, '0.01', '0.0025', '0.002', 'transfer', 'onto a lighter string: upright reflection'), (1, 1, '1e12', '0.01', 'limit', 'very heavy far side: like a fixed end')]:
    Ts, mu1, mu2, Ai = map(mp.mpf, (Ts, mu1, mu2, Ai))
    r, t, R, Tr = junction(Ts, mu1, mu2, Ai)
    case('W08', name, kind, {'Ts': Ts, 'mu1': mu1, 'mu2': mu2, 'Ai': Ai}, {'Z1': mp.sqrt(Ts * mu1), 'Z2': mp.sqrt(Ts * mu2), 'r': r, 'tc': t, 'Ar': Ai * r, 'R': R, 'Tr': Tr}, method='junction conditions (lu_solve), power flux', tol=1e-12, scale={'r': 1, 'Ar': 1e-3, 'R': 1, 'Tr': 1, 'tc': 1})

# W09: shooting y″ = −κ²y on [0, 1] with y(0) = 0: κ from y(1) = 0 (fixed) or y′(1) = 0 (free)
mp.mp.dps = 25
_kap = {}
def kappa(n, free):
    key = (n, free)
    if key not in _kap:
        def end(K):
            s = mp.odefun(lambda x, y: [y[1], -K * y[0]], 0, [0, 1])(1)
            return s[1] if free else s[0]
        guess = ((2 * n - 1) * mp.pi / 2 if free else n * mp.pi)
        _kap[key] = mp.sqrt(mp.findroot(end, (guess**2 * mp.mpf('0.9'), guess**2 * mp.mpf('1.1')), solver='anderson'))
    return _kap[key]
for (Lw, c_, n, kind, name) in [(1, 100, 3, 'benchmark', 'EX W09'), (1, 100, 1, 'boundary', 'fundamental'), ('0.65', 420, 2, 'transfer', 'guitar string, second mode'), (1, 100, '2.5', 'boundary', 'n not an integer: no mode')]:
    Lw, c_ = mp.mpf(Lw), mp.mpf(c_); n = mp.mpf(n)
    f1 = kappa(1, False) * c_ / (2 * mp.pi * Lw)
    if n == int(n):
        ex = {'f1': f1, 'fn': kappa(int(n), False) * c_ / (2 * mp.pi * Lw), 'fnf': kappa(int(n), True) * c_ / (2 * mp.pi * Lw)}
        cs = {'integer': 'applicable'}
    else:
        ex = {'f1': f1, 'fn': NA_(), 'fnf': NA_()}
        cs = {'integer': 'notApplicable'}
    case('W09', name, kind, {'Lw': Lw, 'c': c_, 'n': n}, ex, conds=cs, method='shooting (odefun, root of the end condition)', tol=1e-12)
mp.mp.dps = 50

# W10: arrival times of successive crests at a moving observer (root finding), received frequency from their spacing
def doppler(f, c, vo, vs):
    D = mp.mpf(1000)
    xs = lambda t: -D + vs * t   # source moves in +x toward the observer when vs > 0
    xo = lambda t: -vo * t       # observer moves in −x toward the source when vo > 0
    def arrive(te):
        return mp.findroot(lambda t: xs(te) + c * (t - te) - xo(t), te + D / c)
    t1, t2 = arrive(mp.mpf(0)), arrive(1 / f)
    return 1 / (t2 - t1)
for (f, c, vo, vs, kind, name) in [(440, 340, 0, 34, 'benchmark', 'EX W10'), (440, 340, 0, 0, 'boundary', 'both at rest'), (500, 343, 20, -15, 'transfer', 'observer approaching, source receding'), (440, 340, 0, 400, 'boundary', 'source faster than sound: formula not applicable')]:
    f, c, vo, vs = map(mp.mpf, (f, c, vo, vs))
    ins = {'f': f, 'c': c, 'vo': vo, 'vs': vs}
    if abs(vs) < c and abs(vo) < c:
        case('W10', name, kind, ins, {'f2': doppler(f, c, vo, vs)}, conds={'subsonic': 'applicable'}, method='crest arrival times (findroot)', tol=1e-12)
    else:
        case('W10', name, kind, ins, {'f2': NA_()}, conds={'subsonic': 'notApplicable'}, method='no crest reaches the observer ahead of the source')

# W11: the beat period as the time for the two phases to realign by one cycle (findroot)
for (f1, f2, kind, name) in [(440, 444, 'benchmark', 'EX W11'), (440, 440, 'boundary', 'equal frequencies: no beats'), (256, '260.5', 'transfer', 'tuning fork against a string')]:
    f1, f2 = mp.mpf(f1), mp.mpf(f2)
    ex = {'fm': (f1 + f2) / 2}
    if f1 != f2:
        Tb = mp.findroot(lambda t: 2 * mp.pi * abs(f1 - f2) * t - 2 * mp.pi, 1)
        ex.update({'Tb': Tb, 'fb': 1 / Tb})
    else:
        ex.update({'Tb': NA_(), 'fb': 0})
    case('W11', name, kind, {'f1': f1, 'f2': f2}, ex, conds={'distinct': 'applicable' if f1 != f2 else 'notApplicable'}, method='phase realignment (findroot)', tol=1e-13, scale={'fb': 1})

# W12: add intensities, then take the logarithm
for (I, n, kind, name) in [('1e-6', 2, 'benchmark', 'EX W12'), ('1e-12', 1, 'boundary', 'at the reference intensity: 0 dB'), ('3e-5', 10, 'transfer', 'ten equal sources')]:
    I = mp.mpf(I)
    tot = mp.fsum([I] * n)
    case('W12', name, kind, {'I': I, 'nS': n}, {'L1': 10 * mp.log10(I / mp.mpf('1e-12')), 'Ln': 10 * mp.log10(tot / mp.mpf('1e-12'))}, method='sum of intensities, log10', tol=1e-12, scale={'L1': 1, 'Ln': 1})

# W13: sample the signal and read the peak of its discrete Fourier transform (numpy rfft)
for (fs, N, f, kind, name) in [(100, 1000, 70, 'benchmark', 'EX W13'), (100, 1000, 50, 'boundary', 'exactly at the Nyquist frequency'), (100, 1000, 130, 'transfer', '130 Hz also appears at 30 Hz'), (100, 1000, 20, 'transfer', 'below Nyquist: no aliasing')]:
    n = np.arange(N)
    s = np.cos(2 * np.pi * f * n / fs)
    spec = np.abs(np.fft.rfft(s))
    fa = int(np.argmax(spec)) * fs / N
    case('W13', name, kind, {'fs': fs, 'Ns': N, 'f': f}, {'fN': mp.mpf(fs) / 2, 'df': mp.mpf(fs) / N, 'fa': fa}, conds={'below': 'applicable' if f <= fs / 2 else 'notApplicable'}, method='peak of the DFT of the samples (numpy rfft)', tol=1e-12)

# W14: the derivative dω/dk numerically; the phase velocity ω/k
for (a, k0, kind, name) in [(1, 2, 'benchmark', 'EX W14'), (1, '1e-3', 'boundary', 'long waves: both speeds tend to zero'), ('0.5', 10, 'transfer', 'shorter waves')]:
    a, k0 = mp.mpf(a), mp.mpf(k0)
    om = lambda k: a * k**2
    case('W14', name, kind, {'a': a, 'k0': k0}, {'w0': om(k0), 'vp': om(k0) / k0, 'vg': mp.diff(om, k0)}, method='numerical derivative of ω(k)', tol=1e-12)
