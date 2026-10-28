"""Independent reference values (oracles) for the model registry (26.56, D106).

Every case is computed here with mpmath at 50 significant digits, from the physics written out again in Python —
not from the registry's expressions — and where a different route exists it is used (numerical integration of the
equation of motion, quadrature, root finding, enumeration, least squares by a library). The fixture records the
method of each case. Automatic checks compare unrounded values with the scaled error
e = |q − q_ref| / max(|q_ref|, q_scale) (blueprint §9.1); the rounded answers of doc 02 are for reading only.

Constants: CODATA 2022 (NIST; the values of scipy.constants, typed in again below), exact SI defining constants.
"""
import mpmath as mp

mp.mp.dps = 50

# CODATA 2022 and exact SI values
c = mp.mpf(299792458)
h = mp.mpf('6.62607015e-34')
hbar = h / (2 * mp.pi)
e = mp.mpf('1.602176634e-19')
kB = mp.mpf('1.380649e-23')
NA = mp.mpf('6.02214076e23')
R = kB * NA
G = mp.mpf('6.6743e-11')
eps0 = mp.mpf('8.8541878188e-12')
mu0 = mp.mpf('1.25663706127e-6')
me = mp.mpf('9.1093837139e-31')
mp_ = mp.mpf('1.67262192595e-27')
mn = mp.mpf('1.67492750056e-27')
mu = mp.mpf('1.66053906892e-27')
sigma = 2 * mp.pi**5 * kB**4 / (15 * h**3 * c**2)
ke = 1 / (4 * mp.pi * eps0)
lamC = mp.mpf('2.42631023538e-12')
eV = e
T0C = mp.mpf('273.15')
gn = mp.mpf('9.80665')

CASES = []


def f(x):
    """A float for JSON (None for undefined)."""
    if x is None:
        return None
    if isinstance(x, str):
        return float(mp.mpf(x))
    return float(x)


def case(model, name, kind, inputs, expect, conds=None, method='', tol=1e-9, scale=None, cset='CODATA2022'):
    """kind: benchmark | boundary | limit | transfer.  expect: {output: value | {'state': …, 'value': …}}."""
    ex = {}
    for k, v in expect.items():
        if isinstance(v, dict):
            ex[k] = {kk: f(vv) if kk in ('value', 'raw') else vv for kk, vv in v.items()}
        else:
            ex[k] = f(v)
    CASES.append({
        'model': model, 'name': name, 'kind': kind,
        'inputs': {k: f(v) for k, v in inputs.items()},
        'expect': ex, 'conditions': conds or {}, 'method': method, 'tol': tol,
        'scale': {k: f(v) for k, v in (scale or {}).items()}, 'constantsSet': cset,
    })


def NA_(raw=None):
    """An output that must not be given as an answer (its condition fails)."""
    d = {'state': 'notApplicable', 'value': None}
    if raw is not None:
        d['raw'] = raw
    return d


def INS():
    return {'state': 'insufficient', 'value': None}


def APPROX(v):
    return {'state': 'approximate', 'value': v}


def rk4(fun, y0, t0, t1, n):
    """Classical Runge–Kutta in mpmath (an independent route for ODE references)."""
    y = [mp.mpf(v) for v in y0]
    t = mp.mpf(t0)
    hh = (mp.mpf(t1) - t) / n
    for _ in range(n):
        k1 = fun(t, y)
        k2 = fun(t + hh / 2, [a + hh / 2 * b for a, b in zip(y, k1)])
        k3 = fun(t + hh / 2, [a + hh / 2 * b for a, b in zip(y, k2)])
        k4 = fun(t + hh, [a + hh * b for a, b in zip(y, k3)])
        y = [a + hh / 6 * (b1 + 2 * b2 + 2 * b3 + b4) for a, b1, b2, b3, b4 in zip(y, k1, k2, k3, k4)]
        t += hh
    return y


def ode(fun, y0, t1):
    """High-accuracy ODE solution at t1 with mpmath's Taylor integrator (another route than closed forms)."""
    sol = mp.odefun(lambda t, y: fun(t, y), 0, [mp.mpf(v) for v in y0])
    return sol(mp.mpf(t1))
