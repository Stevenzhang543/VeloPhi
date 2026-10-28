from common import *

def lines_meet(P1, d1, P2, d2):
    """Intersection of the lines P1 + s d1 and P2 + t d2 (lu_solve)."""
    s, t = mp.lu_solve(mp.matrix([[d1[0], -d2[0]], [d1[1], -d2[1]]]), mp.matrix([P2[0] - P1[0], P2[1] - P1[1]]))
    return (P1[0] + s * d1[0], P1[1] + s * d1[1])

# O01: mirror in the plane x = 0, object in front (x > 0); reflect rays with r = d − 2(d·n)n and intersect the
# backward extensions of two reflected rays
def reflect(d, n):
    dn = d[0] * n[0] + d[1] * n[1]
    return (d[0] - 2 * dn * n[0], d[1] - 2 * dn * n[1])
for (d0, thi, kind, name) in [(2, mp.pi / 6, 'benchmark', 'EX O01'), ('0.5', 0, 'boundary', 'normal incidence'), (3, mp.mpf(70) * mp.pi / 180, 'transfer', 'grazing 70°')]:
    d0, thi = mp.mpf(d0), mp.mpf(thi)
    n = (mp.mpf(1), mp.mpf(0))
    obj = (d0, mp.mpf('0.1'))
    hits = [(mp.mpf(0), mp.mpf('0.3')), (mp.mpf(0), mp.mpf('-0.4'))]
    refl = [reflect((h[0] - obj[0], h[1] - obj[1]), n) for h in hits]
    img = lines_meet(hits[0], refl[0], hits[1], refl[1])
    r = reflect((-mp.cos(thi), mp.sin(thi)), n)
    case('O01', name, kind, {'d0': d0, 'thi': thi}, {'thr': mp.atan2(abs(r[1]), r[0]), 'di': img[0], 'mag': img[1] / obj[1]}, method='vector reflection and intersection of backward extensions', tol=1e-12, scale={'thr': 1})

# O02/O03: Fermat's principle — the crossing point x on the interface minimizes n1·|AX| + n2·|XB| (findroot of the
# derivative); B is placed (outer findroot) so that the incidence angle is θ1
def fermat(n1, n2, th1):
    def crossing(X):
        return mp.findroot(lambda x: n1 * x / mp.sqrt(x**2 + 1) - n2 * (X - x) / mp.sqrt((X - x)**2 + 1), X / 2)
    X = mp.findroot(lambda X: mp.atan(crossing(X)) - th1, 2 * mp.tan(th1) + mp.mpf('0.1'))
    x = crossing(X)
    return mp.atan(X - x)
mp.mp.dps = 30
for (n1, n2, th1, kind, name) in [(1, '1.5', mp.pi / 6, 'benchmark', 'EX O02'), (1, '1.5', 0, 'boundary', 'normal incidence'), ('1.33', 1, mp.mpf(40) * mp.pi / 180, 'transfer', 'water to air at 40°'), ('1.5', 1, mp.mpf(50) * mp.pi / 180, 'boundary', 'beyond the critical angle: no refracted ray')]:
    n1, n2, th1 = mp.mpf(n1), mp.mpf(n2), mp.mpf(th1)
    ins = {'n1': n1, 'n2': n2, 'th1': th1}
    if n1 * mp.sin(th1) < n2:
        th2 = fermat(n1, n2, th1) if th1 > 0 else mp.mpf(0)
        case('O02', name, kind, ins, {'s2': mp.sin(th2), 'th2': th2, 'vr': n1 / n2}, conds={'refracts': 'applicable'}, method="Fermat's principle (nested findroot)", tol=1e-12, scale={'s2': 1, 'th2': 1})
    else:
        case('O02', name, kind, ins, {'s2': NA_(), 'th2': NA_(), 'vr': n1 / n2}, conds={'refracts': 'notApplicable'}, method='no stationary path through the interface')
for (n1, n2, th, kind, name) in [('1.5', 1, mp.mpf(50) * mp.pi / 180, 'benchmark', 'EX O03 (50°: total reflection)'), ('1.5', 1, mp.mpf(30) * mp.pi / 180, 'transfer', 'below the critical angle'), (1, '1.5', mp.mpf(60) * mp.pi / 180, 'boundary', 'from less to more dense: no critical angle')]:
    n1, n2, th = mp.mpf(n1), mp.mpf(n2), mp.mpf(th)
    ex = {'thc': mp.findroot(lambda a: n1 * mp.sin(a) - n2, (0, mp.pi / 2), solver='anderson') if n1 > n2 else NA_()}
    ex['th2'] = fermat(n1, n2, th) if n1 * mp.sin(th) <= n2 else NA_()
    case('O03', name, kind, {'n1': n1, 'n2': n2, 'th': th}, ex, conds={'denser': 'applicable' if n1 > n2 else 'notApplicable', 'transmits': 'applicable' if n1 * mp.sin(th) <= n2 else 'notApplicable'}, method="root of n1 sin θ = n2; Fermat's principle", tol=1e-12)
mp.mp.dps = 50

# O04: thin lens at x = 0, object tip at (−u, h): intersect the ray through the centre with the ray parallel to the
# axis that leaves through the focus (lu_solve)
for (f, u, kind, name) in [('0.1', '0.3', 'benchmark', 'EX O04'), ('0.1', '0.05', 'transfer', 'inside the focus: virtual, upright, enlarged'), ('-0.2', '0.3', 'transfer', 'diverging lens'), ('0.1', '0.1', 'boundary', 'object at the focus: image at infinity')]:
    f, u = mp.mpf(f), mp.mpf(u); h = mp.mpf('1e-3')
    ins = {'f': f, 'u': u}
    if u != f:
        img = lines_meet((-u, h), (u, -h), (mp.mpf(0), h), (mp.mpf(1), -h / f))
        case('O04', name, kind, ins, {'v': img[0], 'mag': img[1] / h}, conds={'finite': 'applicable'}, method='intersection of the central and the focal ray', tol=1e-12)
    else:
        case('O04', name, kind, ins, {'v': NA_(), 'mag': NA_()}, conds={'finite': 'notApplicable'}, method='the two rays are parallel')

# O05: exact reflection on the sphere (vertex at 0, centre at (R, 0)) of a ray to the vertex and of the ray through
# the centre from an object tip (u, h) with tiny h; their intersection is the image point
def sphere_image(R, u, h):
    C = (R, mp.mpf(0))
    # ray to the vertex: normal there is the axis, reflection mirrors the direction
    d1 = (-u, -h); r1 = (u, -h)
    # ray through the centre of curvature: reflects back on itself
    d2 = (C[0] - u, C[1] - h)
    return lines_meet((mp.mpf(0), mp.mpf(0)), r1, (u, h), d2)
for (R, u, kind, name) in [('0.4', '0.6', 'benchmark', 'EX O05'), ('0.4', '0.1', 'transfer', 'inside the focus: virtual image'), ('-0.4', '0.6', 'transfer', 'convex mirror'), ('0.4', '0.2', 'boundary', 'object at the focus')]:
    R, u = mp.mpf(R), mp.mpf(u); h = mp.mpf('1e-15')
    ins = {'R': R, 'u': u}
    if u != R / 2:
        img = sphere_image(R, u, h)
        case('O05', name, kind, ins, {'f': R / 2, 'v': img[0], 'mag': img[1] / h}, conds={'finite': 'applicable'}, method='exact reflection of the vertex ray and the centre ray (h → 0)', tol=1e-12)
    else:
        case('O05', name, kind, ins, {'f': R / 2, 'v': NA_(), 'mag': NA_()}, conds={'finite': 'notApplicable'}, method='reflected rays parallel')

# O06: system matrix of lens–gap–lens; the back focus by tracing a ray parallel to the axis
for (f1, f2, d, kind, name) in [('0.1', '0.2', 0, 'benchmark', 'EX O06 (in contact)'), ('0.1', '0.2', '0.05', 'transfer', '5 cm apart'), ('0.2', '0.05', '0.25', 'boundary', 'afocal telescope: no focal length'), ('0.1', '-0.15', '0.02', 'transfer', 'with a diverging lens')]:
    f1, f2, d = mp.mpf(f1), mp.mpf(f2), mp.mpf(d)
    Ln = lambda f: mp.matrix([[1, 0], [-1 / f, 1]])
    M = Ln(f2) * mp.matrix([[1, d], [0, 1]]) * Ln(f1)
    P = -M[1, 0]
    ins = {'f1': f1, 'f2': f2, 'd': d}
    if abs(P) > mp.mpf('1e-30'):
        ray = M * mp.matrix([1, 0])
        case('O06', name, kind, ins, {'P': P, 'feq': 1 / P, 'bfl': -ray[0] / ray[1]}, conds={'focal': 'applicable'}, method='ABCD system matrix; parallel ray trace', tol=1e-12)
    else:
        case('O06', name, kind, ins, {'P': {'value': P}, 'feq': NA_(), 'bfl': NA_()}, conds={'focal': 'notApplicable'}, method='afocal system', tol=1e-12, scale={'P': 1})

# O07: maximum of the two-beam phasor sum |1 + e^{ikd·s}|² (findroot of the derivative in s = sin θ); the paraxial spacing
# as the limit of the first maximum for a vanishing wavelength (λ scaled by 1e−8 and the result scaled back)
def two_beam_s(lam, d, m):
    # in the phase variable u = d·s/λ (path difference in wavelengths)
    I = lambda u: abs(1 + mp.exp(2j * mp.pi * u))**2
    return mp.findroot(lambda u: mp.diff(I, u), m + mp.mpf('1e-3')) * lam / d if m != 0 else mp.mpf(0)
for (lam, D, d, m, kind, name) in [('500e-9', 2, '0.5e-3', 1, 'benchmark', 'EX O07'), ('500e-9', 2, '0.5e-3', 0, 'boundary', 'central fringe'), ('633e-9', 1, '5e-6', 2, 'transfer', 'wide angle: the paraxial spacing is not applicable'), ('500e-9', 2, '1e-6', 3, 'boundary', 'order beyond 90°: does not exist')]:
    lam, D, d = mp.mpf(lam), mp.mpf(D), mp.mpf(d)
    ins = {'lam': lam, 'D': D, 'd': d, 'm': m}
    q = max(m, 1) * lam / d
    sc = mp.mpf('1e-8')
    dy = D * mp.tan(mp.asin(two_beam_s(lam * sc, d, 1))) / sc
    ex = {'dy': dy if q < mp.mpf('0.05') else ({'state': 'approximate', 'value': dy} if q < mp.mpf('0.2') else NA_())}
    ex['ym'] = D * mp.tan(mp.asin(two_beam_s(lam, d, m))) if m * lam <= d else NA_()
    case('O07', name, kind, ins, ex, conds={'exists': 'applicable' if m * lam <= d else 'notApplicable'}, method='maximum of the two-beam phasor sum (findroot)', tol=1e-10, scale={'ym': 1e-3})

# O08: zero of the slit field ∫ cos(kxs) dx over the slit (quad + findroot); Rayleigh factor from the first zero of J1
j11 = mp.findroot(lambda x: mp.besselj(1, x), 3.8)
mp.mp.dps = 30
def slit_zero(a, lam, m):
    # field of the slit in the variable u = a·s/λ, with x measured in slit widths
    E = lambda u: mp.quad(lambda x: mp.cos(2 * mp.pi * x * u), [-mp.mpf('0.5'), 0, mp.mpf('0.5')])
    return mp.findroot(E, m + mp.mpf('1e-3')) * lam / a
for (a, lam, D, m, Da, kind, name) in [('1e-4', '500e-9', 2, 1, '1e-3', 'benchmark', 'EX O08'), ('2e-5', '633e-9', '1.5', 2, '5e-3', 'transfer', 'narrow slit, second dark fringe'), ('1.25e-6', '500e-9', 1, 3, '1e-3', 'boundary', 'third dark fringe beyond 90°')]:
    a, lam, D, Da = mp.mpf(a), mp.mpf(lam), mp.mpf(D), mp.mpf(Da)
    ex = {'thR': mp.asin(j11 / mp.pi * lam / Da)}
    ex['s'] = slit_zero(a, lam, m) if m * lam <= a else NA_()
    ex['w'] = 2 * D * mp.tan(mp.asin(slit_zero(a, lam, 1))) if lam < a else NA_()
    case('O08', name, kind, {'a': a, 'lam': lam, 'D': D, 'm': m, 'Da': Da}, ex, conds={'exists': 'applicable' if m * lam <= a else 'notApplicable'}, method='zero of the slit field integral; first zero of J1', tol=1e-10)
mp.mp.dps = 50

# O09: principal maximum of the N-slit array factor (findroot of its derivative), envelope from the slit integral,
# highest order by counting
def array_peak(d, lam, m, N=40):
    # array factor in the phase variable u = d·s/λ
    I = lambda u: abs(mp.fsum(mp.exp(2j * mp.pi * u * j) for j in range(N)))**2
    # bracket narrower than the spacing 1/N of the subsidiary extrema
    return mp.findroot(lambda u: mp.diff(I, u), (m - mp.mpf('0.3') / N, m + mp.mpf('0.27') / N), solver='anderson') * lam / d
mp.mp.dps = 30
for (nl, lam, m, a, kind, name) in [('5e5', '500e-9', 1, '0.5e-6', 'benchmark', 'EX O09'), ('5e5', '500e-9', 4, '0.5e-6', 'boundary', 'fourth order at 90° and at an envelope zero (missing)'), ('5e5', '500e-9', 5, '0.5e-6', 'boundary', 'fifth order does not exist'), ('6e5', '589e-9', 2, '0.6e-6', 'transfer', 'sodium light, second order')]:
    nl, lam, a = mp.mpf(nl), mp.mpf(lam), mp.mpf(a); d = 1 / nl
    mm = 0
    while (mm + 1) * lam <= d:
        mm += 1
    ex = {'d': d, 'mmax': mm}
    if abs(m * lam / d) <= 1:
        s = array_peak(d, lam, m)
        env = abs(mp.quad(lambda x: mp.exp(2j * mp.pi * x * s / lam), [-a / 2, a / 2]) / a)**2
        ex.update({'s': s, 'th': mp.asin(min(s, 1)), 'env': env})
    else:
        ex.update({'s': NA_(), 'th': NA_(), 'env': NA_()})
    case('O09', name, kind, {'nl': nl, 'lam': lam, 'm': m, 'a': a}, ex, conds={'exists': 'applicable' if abs(m * lam / d) <= 1 else 'notApplicable'}, method='N-slit array factor maximum; slit integral; counting orders', tol=1e-9, scale={'env': 1, 'mmax': 1})
mp.mp.dps = 50

# O10: reflectance of the film from its characteristic matrix; the thickness of maximum reflectance by findroot of dR/dt
def film_R(n1, n, n2, de):
    # de = 2π n t / λ, the phase thickness of the film
    M11, M12, M21, M22 = mp.cos(de), 1j * mp.sin(de) / n, 1j * n * mp.sin(de), mp.cos(de)
    r = (n1 * M11 + n1 * n2 * M12 - M21 - n2 * M22) / (n1 * M11 + n1 * n2 * M12 + M21 + n2 * M22)
    return abs(r)**2
for (n, n1, n2, lam, m, kind, name) in [('1.5', 1, 1, '600e-9', 0, 'benchmark', 'EX O10 (soap-like film in air)'), ('1.38', 1, '1.52', '550e-9', 0, 'transfer', 'MgF₂ on glass: two reversals'), ('1.5', 1, 1, '600e-9', 2, 'boundary', 'third reinforcing thickness'), ('1.33', '1.5', 1, '600e-9', 0, 'boundary', 'water film under glass: no reversal')]:
    n, n1, n2, lam = mp.mpf(n), mp.mpf(n1), mp.mpf(n2), mp.mpf(lam)
    flips = (1 if n > n1 else 0) + (1 if n2 > n else 0)
    guess = ((m + mp.mpf('0.5')) if flips == 1 else (m + 1)) * mp.pi
    de = mp.findroot(lambda q: mp.diff(lambda x: film_R(n1, n, n2, x), q), guess * (1 + mp.mpf('1e-3')))
    t = de * lam / (2 * mp.pi * n)
    case('O10', name, kind, {'n': n, 'n1': n1, 'n2': n2, 'lam': lam, 'm': m}, {'t': t}, conds={'one': 'applicable' if flips == 1 else 'notApplicable', 'even': 'notApplicable' if flips == 1 else 'applicable'}, method='characteristic matrix of the film; maximum of R(t)', tol=1e-10)

# O11: count the change of the round-trip phase in cycles (findroot)
for (lam, N, Lc, kind, name) in [('632.8e-9', 100, '0.05', 'benchmark', 'EX O11'), ('632.8e-9', 0, '0.05', 'boundary', 'no fringes'), ('589e-9', 2500, '0.1', 'transfer', 'sodium light, longer cell')]:
    lam, Lc = mp.mpf(lam), mp.mpf(Lc)
    dx = mp.findroot(lambda x: 2 * mp.pi * 2 * x / lam - 2 * mp.pi * N, lam)
    dn = mp.findroot(lambda q: 2 * mp.pi * 2 * Lc * q / lam - 2 * mp.pi * N, mp.mpf('1e-5'))
    case('O11', name, kind, {'lam': lam, 'N': N, 'Lc': Lc}, {'dx': dx, 'dn': dn}, method='round-trip phase counted in cycles (findroot)', tol=1e-12, scale={'dx': 1e-9, 'dn': 1e-12})

# O12: Jones vectors and projectors; the unpolarized input as an average over the polarization angle (quad)
def proj(a):
    return mp.matrix([[mp.cos(a)**2, mp.cos(a) * mp.sin(a)], [mp.cos(a) * mp.sin(a), mp.sin(a)**2]])
for (I0, th, kind, name) in [(100, mp.pi / 3, 'benchmark', 'EX O12'), (100, mp.pi / 2, 'boundary', 'crossed: nothing passes'), (40, mp.pi / 6, 'transfer', '30° between the axes')]:
    I0, th = mp.mpf(I0), mp.mpf(th)
    E = mp.matrix([mp.sqrt(I0), 0])
    out1 = proj(th) * E
    I1 = out1[0]**2 + out1[1]**2
    def through(psi):
        v = proj(th) * proj(0) * mp.matrix([mp.sqrt(I0) * mp.cos(psi), mp.sqrt(I0) * mp.sin(psi)])
        return v[0]**2 + v[1]**2
    I2 = mp.quad(through, [0, mp.pi]) / mp.pi
    case('O12', name, kind, {'I0': I0, 'th': th}, {'I1': I1, 'I2': I2}, method='Jones projectors; average over the input polarization (quad)', tol=1e-12, scale={'I1': 1e-6, 'I2': 1e-6})

# O13: the product of the propagation and thin-lens matrices applied to the ray
for (f, y, th, d, kind, name) in [('0.1', '1e-3', 0, '0.1', 'benchmark', 'EX O13'), ('0.1', 0, 0, '0.1', 'boundary', 'ray on the axis'), ('-0.05', '2e-3', '0.01', '0.2', 'transfer', 'diverging lens, tilted ray'), ('0.1', '1e-3', '0.3', '0.1', 'boundary', 'steep ray: not paraxial')]:
    f, y, th, d = map(mp.mpf, (f, y, th, d))
    ok = abs(th) < mp.mpf('0.05') and abs(y / f) < mp.mpf('0.05')
    apx = abs(th) < mp.mpf('0.2') and abs(y / f) < mp.mpf('0.2')
    v = mp.matrix([[1, d], [0, 1]]) * mp.matrix([[1, 0], [-1 / f, 1]]) * mp.matrix([y, th])
    st = lambda x: x if ok else ({'state': 'approximate', 'value': x} if apx else NA_())
    case('O13', name, kind, {'f': f, 'y': y, 'th': th, 'd': d}, {'th2': st(v[1]), 'y2': st(v[0])}, method='matrix product (propagation · thin lens)', tol=1e-12, scale={'th2': 1e-6, 'y2': 1e-9})

# O14: number of half-wave Fresnel zones seen from the axis, from exact path lengths (differs from a²/λz by about (a/z)²/4)
def zones(a, lam, z):
    return 2 * (mp.sqrt(z**2 + a**2) - z) / lam
for (a, lam, z, kind, name) in [('0.5e-3', '500e-9', '0.1', 'benchmark', 'EX O14 (near field)'), ('0.5e-3', '500e-9', 10, 'transfer', '10 m: far field'), ('0.5e-3', '500e-9', 1, 'boundary', 'NF = 0.5: far field only approximate')]:
    a, lam, z = map(mp.mpf, (a, lam, z))
    NF = zones(a, lam, z)
    zF = mp.findroot(lambda zz: zones(a, lam, zz) - mp.mpf('0.1'), a**2 / (mp.mpf('0.1') * lam))
    case('O14', name, kind, {'a': a, 'lam': lam, 'z': z}, {'NF': NF, 'zF': zF}, conds={'far': 'applicable' if NF < mp.mpf('0.1') else ('approximate' if NF < 1 else 'notApplicable')}, method='Fresnel zone count from exact path lengths (paraxial difference ≤ (a/z)²/4)', tol=1e-5)
