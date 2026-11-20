"""Reference values for the reactor workshop (26.64, D275, D278) -> tests/fixtures/chem/reactor.json

  python -I scripts/oracles/reactor.py

Every case is a request for the core and the values it must reproduce, computed here by another route with mpmath
(40 digits): closed forms of diffusion theory, root finding on the criticality and in-hour conditions, the exact
solution of the linear kinetics equations by a matrix exponential, the closed form of the xenon chain. The IAEA
two-dimensional PWR benchmark carries the published values. Tolerances are stated per case; for the grid
solutions they cover the discretisation (second order in the cell size), which the tests show by refinement.
"""
import json
import os
import mpmath as mp

mp.mp.dps = 40
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'tests', 'fixtures', 'chem', 'reactor.json')
CASES = []


def f(x):
    return float(x)


def case(id_, kind, request, expect, tol, method):
    CASES.append({'id': id_, 'kind': kind, 'request': request, 'expect': {k: v if isinstance(v, (list, dict)) else f(v) for k, v in expect.items()}, 'tol': tol, 'method': method})


def grid(nx, ny, pitch, cells, materials, boundary, **more):
    r = {'op': 'reactorCriticality', 'grid': {'nx': nx, 'ny': ny, 'pitch_cm': pitch}, 'cells': cells, 'materials': materials, 'boundary': boundary}
    r.update(more)
    return r


# ---- one group: only the fast group carries neutrons (no down-scattering) ----
ONE = {'id': 'one', 'D1': 1.2, 'D2': 1.0, 'a1': 0.02, 'a2': 1.0, 's12': 0.0, 'nf1': 0.025, 'nf2': 0.0}
SLAB = {'left': 'zeroFlux', 'right': 'zeroFlux', 'bottom': 'reflective', 'top': 'reflective'}
D, SA, NF = mp.mpf('1.2'), mp.mpf('0.02'), mp.mpf('0.025')
for width in (60, 100, 200):
    k = NF / (SA + D * (mp.pi / width) ** 2)
    case('slab1g-%d' % width, 'criticality', grid(64, 1, width / 64, [0] * 64, [ONE], SLAB), {'keff': k}, 3e-4,
         'bare slab, one group, flux zero at the faces: k = nuSigma_f / (Sigma_a + D (pi/a)^2)')
for (nx, ny, h) in ((40, 60, 2.0), (50, 50, 3.0)):
    k = NF / (SA + D * ((mp.pi / (nx * h)) ** 2 + (mp.pi / (ny * h)) ** 2))
    case('rect1g-%dx%d' % (nx * h, ny * h), 'criticality', grid(nx, ny, h, [0] * (nx * ny), [ONE], 'zeroFlux'), {'keff': k}, 6e-4,
         'bare rectangle, one group: B^2 = (pi/a)^2 + (pi/b)^2')

# critical width of the one-group slab: a_c = pi sqrt(D / (nuSigma_f - Sigma_a))
ac = mp.pi * mp.sqrt(D / (NF - SA))
case('slab1g-critical', 'criticality', grid(64, 1, f(ac) / 64, [0] * 64, [ONE], SLAB), {'keff': 1, 'width_cm': ac}, 3e-4,
     'critical width of the bare one-group slab, a = pi sqrt(D/(nuSigma_f - Sigma_a)); the core must give k = 1 there')

# ---- two groups ----
TWO = {'id': 'two', 'D1': 1.4, 'D2': 0.4, 'a1': 0.010, 'a2': 0.090, 's12': 0.018, 'nf1': 0.006, 'nf2': 0.140}


def k2(b2):
    d1, d2, a1, a2, s, n1, n2 = [mp.mpf(str(TWO[x])) for x in ('D1', 'D2', 'a1', 'a2', 's12', 'nf1', 'nf2')]
    return (n1 + n2 * s / (a2 + d2 * b2)) / (a1 + s + d1 * b2)


for width in (80, 160):
    case('slab2g-%d' % width, 'criticality', grid(64, 1, width / 64, [0] * 64, [TWO], SLAB), {'keff': k2((mp.pi / width) ** 2)}, 3e-4,
         'bare slab, two groups: both fluxes are cos(Bx), k = (nuSf1 + nuSf2 Ss12/(Sa2 + D2 B^2)) / (Sa1 + Ss12 + D1 B^2)')
case('rect2g-100x140', 'criticality', grid(40, 56, 2.5, [0] * (40 * 56), [TWO], 'zeroFlux'), {'keff': k2((mp.pi / 100) ** 2 + (mp.pi / 140) ** 2)}, 6e-4,
     'bare rectangle, two groups')
case('slab2g-axial', 'criticality', grid(64, 1, 120 / 64, [0] * 64, [TWO], SLAB, axialBuckling=4e-4), {'keff': k2((mp.pi / 120) ** 2 + mp.mpf('4e-4'))}, 3e-4,
     'bare slab, two groups, with an axial buckling added to the removal of both groups')
bc = mp.findroot(lambda b: k2(b * b) - 1, mp.mpf('0.03'))
case('slab2g-critical', 'criticality', grid(64, 1, f(mp.pi / bc) / 64, [0] * 64, [TWO], SLAB), {'keff': 1, 'width_cm': mp.pi / bc}, 3e-4,
     'critical width of the bare two-group slab from k(B^2) = 1 (root finding), a = pi/B')

# ---- reflected slab, one group: core of half-width a, reflector of thickness t, zero flux outside ----
REF = {'id': 'refl', 'D1': 0.9, 'D2': 1.0, 'a1': 0.004, 'a2': 1.0, 's12': 0.0, 'nf1': 0.0, 'nf2': 0.0}
DR, SAR = mp.mpf('0.9'), mp.mpf('0.004')
LR = mp.sqrt(DR / SAR)
for (a, t) in ((40, 20), (30, 40)):
    def cond(k, a=a, t=t):
        b = mp.sqrt((NF / k - SA) / D)
        return D * b * mp.tan(b * a) - DR / LR * mp.coth(t / LR)
    # the fundamental mode has B a < pi/2: k lies between the bare half-slab and the infinite medium
    k_lo = NF / (SA + D * (mp.pi / (2 * a)) ** 2) * (1 + mp.mpf('1e-12'))
    k = mp.findroot(cond, (k_lo, NF / SA * (1 - mp.mpf('1e-9'))), solver='anderson')
    cells = [0] * a + [1] * t
    case('reflected1g-%d-%d' % (a, t), 'criticality', grid(len(cells), 1, 1.0, cells, [ONE, REF], {'left': 'reflective', 'right': 'zeroFlux', 'bottom': 'reflective', 'top': 'reflective'}),
         {'keff': k}, 3e-4, 'reflected slab, one group: D_c B tan(B a) = (D_r/L_r) coth(t/L_r) with B^2 = (nuSigma_f/k - Sigma_a)/D_c (root finding)')

# ---- IAEA 2-D PWR benchmark (ANL-7416 Suppl. 2, problem 11-A2), quarter core ----
IAEA = [
    {'id': 'fuel1', 'D1': 1.5, 'D2': 0.4, 'a1': 0.010, 'a2': 0.080, 's12': 0.02, 'nf1': 0.0, 'nf2': 0.135},
    {'id': 'fuel2', 'D1': 1.5, 'D2': 0.4, 'a1': 0.010, 'a2': 0.085, 's12': 0.02, 'nf1': 0.0, 'nf2': 0.135},
    {'id': 'fuel2rod', 'D1': 1.5, 'D2': 0.4, 'a1': 0.010, 'a2': 0.130, 's12': 0.02, 'nf1': 0.0, 'nf2': 0.135},
    {'id': 'reflector', 'D1': 2.0, 'D2': 0.3, 'a1': 0.0, 'a2': 0.010, 's12': 0.04, 'nf1': 0.0, 'nf2': 0.0},
]
# material per band of 20 cm (the first band is the half assembly on the symmetry line, 10 cm)
MAP = ['322232214', '222222214', '222222114', '222222144', '322231144', '222211444', '221114444', '111444444', '444444444']


def band(i):
    return 0 if i == 0 else (i + 1) // 2


cells = [int(MAP[band(y)][band(x)]) - 1 for y in range(17) for x in range(17)]
case('iaea2d', 'iaea', grid(17, 17, 10.0, cells, IAEA, {'left': 'reflective', 'bottom': 'reflective', 'right': 'vacuum', 'top': 'vacuum'}, axialBuckling=0.8e-4),
     {'keff': mp.mpf('1.02959'), 'feenox': [1.02975, 1.02986]}, 5e-4,
     'published values: 1.02959 is the reference solution of the benchmark book; FeenoX reports 1.02975 to 1.02986 on its meshes (docs/research/2664/chemistry.md, source 32). Outer boundary: no incoming current, -D dphi/dn = 0.4692 phi. The test refines the grid (10, 5, 2.5 cm) and checks the convergence towards the reference.')

# ---- kinetics ----
BETA = [mp.mpf(x) for x in ('2.584e-4', '1.520e-3', '1.391e-3', '3.070e-3', '1.102e-3', '2.584e-4')]
LAM = [mp.mpf(x) for x in ('0.013', '0.032', '0.119', '0.318', '1.403', '3.929')]
BT = sum(BETA)


def inhour(rho, gen):
    def g(w):
        return gen * w + sum(b * w / (w + l) for b, l in zip(BETA, LAM)) - rho
    if rho > 0:
        return mp.findroot(g, (mp.mpf(0), rho / gen), solver='anderson')
    return mp.findroot(g, (-LAM[0] * (1 - mp.mpf('1e-12')), mp.mpf(0)), solver='anderson')


for (frac, gen) in ((0.05, '2e-5'), (0.3, '2e-5'), (0.6, '1e-3'), (-0.5, '2e-5'), (-5.0, '2e-5')):
    rho = mp.mpf(frac) * BT
    w = inhour(rho, mp.mpf(gen))
    case('inhour-%g-%s' % (frac, gen), 'inhour', {'op': 'reactorKinetics', 'rho': f(rho), 'generation': float(gen), 'duration': 1.0, 'samples': 1},
         {'omega': w, 'period': 1 / w}, 1e-9, 'largest root of the in-hour equation rho = Lambda w + sum beta_i w/(w + lambda_i) (mpmath root finding)')


def exact(rho, gen, times):
    """n(t) after a step of the reactivity from equilibrium at n = 1: exp(A t) y0 with the 7 x 7 kinetics matrix."""
    a = mp.zeros(7)
    a[0, 0] = (rho - BT) / gen
    for i in range(6):
        a[0, i + 1] = LAM[i]
        a[i + 1, 0] = BETA[i] / gen
        a[i + 1, i + 1] = -LAM[i]
    y0 = mp.matrix([1] + [BETA[i] / (gen * LAM[i]) for i in range(6)])
    return [(mp.expm(a * t) * y0)[0] for t in times]


for (name, frac, gen, times) in (('step+0.3', 0.3, '2e-5', [0.01, 0.1, 1, 10, 60]), ('step-0.5', -0.5, '2e-5', [0.01, 0.1, 1, 10, 100]), ('step+0.2-slow', 0.2, '1e-3', [0.1, 1, 10, 100])):
    rho = mp.mpf(frac) * BT
    n = exact(rho, mp.mpf(gen), times)
    case('kinetics-' + name, 'kinetics', {'op': 'reactorKinetics', 'rho': f(rho), 'generation': float(gen), 'times': [float(t) for t in times]},
         {'n': [f(x) for x in n], 'promptJump': BT / (BT - rho)}, 2e-6,
         'power after a step of the reactivity from critical equilibrium: exp(A t) y0 of the linear kinetics equations (mpmath expm); the prompt jump is beta/(beta - rho)')

# ---- xenon ----
with open(os.path.join(HERE, '..', '..', 'src', 'chem', 'data', 'xs2g.json'), encoding='utf-8') as fh:
    P = json.load(fh)['poisons']
gi, gx, li, lx, sx = [mp.mpf(repr(P[k])) for k in ('gammaI', 'gammaXe', 'lambdaI', 'lambdaXe', 'sigmaXe_b')]
gp, ss = mp.mpf(repr(P['gammaPm'])), mp.mpf(repr(P['sigmaSm_b']))
HOURS = [1, 5, 11, 24, 48]
for (fis, phi) in ((mp.mpf('1e13'), mp.mpf('5e13')), (mp.mpf('2e11'), mp.mpf('1e12'))):
    s = sx * mp.mpf('1e-24') * phi
    i0 = gi * fis / li
    x0 = (gi + gx) * fis / (lx + s)
    tp = max(mp.log(li * li * i0 / (lx * (x0 * (li - lx) + li * i0))) / (li - lx), mp.mpf(0))

    def xt(t, i0=i0, x0=x0):
        return x0 * mp.exp(-lx * t) + li * i0 / (li - lx) * (mp.exp(-lx * t) - mp.exp(-li * t))
    case('xenon-%s' % mp.nstr(phi, 2), 'poisons', {'op': 'reactorPoisons', 'fissionRate': f(fis), 'flux': f(phi), 'start': 'equilibrium', 'shutdownAt': 0, 'hours': HOURS},
         {'iodineEq': i0, 'xenonEq': x0, 'samariumEq': gp * fis / (ss * mp.mpf('1e-24') * phi), 'peakAfter': tp, 'peakXenon': xt(tp), 'xenon': [f(xt(3600 * h)) for h in HOURS]}, 1e-6,
         'equilibrium I = gamma_I F/lambda_I, X = (gamma_I + gamma_X) F/(lambda_X + sigma_X phi); after shutdown X(t) = X0 e^(-lx t) + li I0/(li - lx)(e^(-lx t) - e^(-li t)), peak where dX/dt = 0 (closed forms; data of xs2g.json)')

with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
    json.dump({'generator': 'scripts/oracles/reactor.py (mpmath %s, 40 digits)' % mp.__version__, 'cases': CASES}, fh, ensure_ascii=False, indent=1)
    fh.write('\n')
print(len(CASES), 'cases ->', os.path.relpath(OUT))
