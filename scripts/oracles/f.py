from common import *

# F01: integrate dp/dz = ρg from the surface down (quadrature); the zero of depth moved does not change the result
for (rho, g, h, p0, kind, name) in [(1000, '9.8', 2, 101325, 'benchmark', 'EX F01'), (1000, '9.8', 0, 101325, 'boundary', 'at the surface'), (13534, '9.80665', '0.76', 0, 'transfer', 'mercury column in vacuum above')]:
    rho, g, h, p0 = map(mp.mpf, (rho, g, h, p0))
    z0 = mp.mpf(7)   # an arbitrary zero of height: integrate from z0 down to z0 − h
    pg = mp.quad(lambda z: rho * g, [z0 - h, z0]) if h > 0 else mp.mpf(0)
    case('F01', name, kind, {'rho': rho, 'g': g, 'h': h, 'p0': p0}, {'pg': pg, 'p': p0 + pg}, method='∫ ρg dz from a shifted zero', tol=1e-13, scale={'pg': 1, 'p': 1})

# F02: equilibrium draft of a rectangular section (width a, height b, a·b = As) by root finding of the vertical
# force balance; fully submerged bodies by comparing the weight with the largest buoyancy
def f02(As, d, rhoB, rhoF, g, a):
    b = As / a
    V = As * d; m = rhoB * V
    if rhoB < rhoF:
        y = mp.findroot(lambda y: rhoF * g * a * y * d - m * g, (0, b), solver='anderson')
        Vs = a * y * d
        return {'V': V, 'm': m, 'Fb': rhoF * g * Vs, 'Vsub': Vs, 'Fn': NA_()}, 'floats'
    Fmax = rhoF * g * V
    if rhoB == rhoF:
        return {'V': V, 'm': m, 'Fb': Fmax, 'Vsub': V, 'Fn': NA_()}, 'neutral'
    return {'V': V, 'm': m, 'Fb': Fmax, 'Vsub': V, 'Fn': m * g - Fmax}, 'sinks'
for (As, d, rhoB, rhoF, g, kind, name) in [('0.05', '0.2', 600, 1000, 10, 'benchmark', 'EX F02 (0.5 m × 0.1 m section, 0.2 m thick)'), ('0.05', '0.2', 7800, 1000, 10, 'transfer', 'steel block sinks: support force'), ('0.05', '0.2', 1000, 1000, 10, 'boundary', 'equal densities: suspended'), ('0.05', 1, 600, 1000, 10, 'transfer', 'unit-thickness mode (1 m) is a different body')]:
    As, d, rhoB, rhoF, g = map(mp.mpf, (As, d, rhoB, rhoF, g))
    ex, br = f02(As, d, rhoB, rhoF, g, mp.mpf('0.5'))
    conds = {k: ('applicable' if k == br else 'notApplicable') for k in ('floats', 'neutral', 'sinks')}
    case('F02', name, kind, {'As': As, 'd': d, 'rhoB': rhoB, 'rhoF': rhoF, 'g': g}, ex, conds=conds, method='draft of a rectangular section by root finding', tol=1e-12)

# F03: torque as the cross product of the lever (G → vertical line through M) with the buoyant force; the
# small-angle limit compared with the exact wall-sided box (polygon of the submerged part)
def torque_vec(m, GM, phi, g):
    # body frame: G at the origin, M at (0, GM); rotate by φ; buoyancy mg acts upward along the vertical through M
    Mx = -GM * mp.sin(phi)   # heel to starboard (φ > 0) puts M on the side the hull moves toward: lever from G
    Fx, Fy = 0, m * g
    return Mx * Fy - 0 * Fx   # z component of r × F with r = (Mx, ·)
def box_torque(Bw, Tdraft, KG, phi, rhoF, g, n=1):
    # exact righting moment of a box barge of breadth Bw, draft Tdraft, centre of mass KG above the keel, per unit length
    # (wall-sided: the waterline keeps the displaced area; the centroid of the submerged trapezium by polygon formulas)
    t = mp.tan(phi)
    # submerged polygon in body coordinates (keel at y = 0, centreline x = 0): waterline y = Tdraft + x·tan φ
    P = [(-Bw / 2, 0), (Bw / 2, 0), (Bw / 2, Tdraft + Bw / 2 * t), (-Bw / 2, Tdraft - Bw / 2 * t)]
    A_ = 0; Cx = 0; Cy = 0
    for i in range(4):
        x0, y0 = P[i]; x1, y1 = P[(i + 1) % 4]
        cr = x0 * y1 - x1 * y0
        A_ += cr; Cx += (x0 + x1) * cr; Cy += (y0 + y1) * cr
    A_ /= 2; Cx /= 6 * A_; Cy /= 6 * A_
    # buoyancy rhoF g A_ upward in the world frame; world frame = body rotated by −φ (heel); lever from G = (0, KG)
    rx, ry = Cx - 0, Cy - KG
    c_, s_ = mp.cos(phi), mp.sin(phi)
    wx = rx * c_ + ry * s_   # horizontal world coordinate of the lever
    return -(-wx) * rhoF * g * A_ * n, rhoF * A_ * n
for (m, GM, phi, g, kind, name) in [(10, '0.05', '0.1', 10, 'benchmark', 'EX F03'), (10, '-0.02', '0.1', 10, 'transfer', 'GM < 0: the moment increases the heel'), (10, '0.05', '0.6', 10, 'boundary', 'large angle: the small-angle formula is not applicable')]:
    m, GM, phi, g = map(mp.mpf, (m, GM, phi, g))
    tau = torque_vec(m, GM, phi, g)
    ins = {'m': m, 'GM': GM, 'phi': phi, 'g': g}
    if abs(phi) <= mp.mpf('0.1746'):
        case('F03', name, kind, ins, {'tau': tau, 'GZ': GM * mp.sin(phi)}, conds={'small': 'applicable', 'stable': 'applicable' if GM > 0 else 'notApplicable'}, method='r × F with the lever through the metacentre', tol=1e-12)
    else:
        case('F03', name, kind, ins, {'tau': NA_(tau), 'GZ': NA_()}, conds={'small': 'notApplicable'}, method='outside the small-angle range')
# limit: a box barge 2 m wide, draft 0.5 m, KG chosen so that GM = 0.05 m; exact moment at a clockwise heel of 1 mrad
# (φ = −1e−3 in the model's counter-clockwise convention)
Bw, Td = mp.mpf(2), mp.mpf('0.5')
BM = Bw**2 / (12 * Td); KB = Td / 2; KG = KB + BM - mp.mpf('0.05')
phi = mp.mpf('1e-3')
tau_box, mass = box_torque(Bw, Td, KG, phi, 1000, 10)
case('F03', 'small-angle limit of an exact box barge (φ = 1 mrad; wall-sided correction ~7e−6)', 'limit', {'m': mass, 'GM': mp.mpf('0.05'), 'phi': -phi, 'g': 10}, {'tau': tau_box}, method='polygon centroid of the heeled box', tol=2e-5)

# F04: pressure transmitted, displaced volume conserved, work from p·ΔV
for (A1, A2, F1, s1, kind, name) in [('1e-4', '20e-4', 50, '0.1', 'benchmark', 'EX F04'), ('1e-4', '1e-4', 50, '0.1', 'boundary', 'equal pistons'), ('5e-4', '0.05', 200, '0.25', 'transfer', 'car lift')]:
    A1, A2, F1, s1 = map(mp.mpf, (A1, A2, F1, s1))
    p = F1 / A1; dV = A1 * s1
    case('F04', name, kind, {'A1': A1, 'A2': A2, 'F1': F1, 's1': s1}, {'p': p, 'F2': p * A2, 's2': dV / A2, 'W1': p * dV, 'W2': p * A2 * (dV / A2)}, method='p = F/A, ΔV conserved, W = pΔV', tol=1e-13)

# F05: mass balance residual solved for v2 (findroot)
for (A1, A2, v1, r1, r2, kind, name) in [('4e-4', '1e-4', '0.5', 1000, 1000, 'benchmark', 'EX F05'), ('4e-4', '1e-4', 0, 1000, 1000, 'boundary', 'no flow'), ('0.01', '0.004', 20, '1.2', '0.9', 'transfer', 'gas expanding in the duct')]:
    A1, A2, v1, r1, r2 = map(mp.mpf, (A1, A2, v1, r1, r2))
    mdot = r1 * A1 * v1
    v2 = mp.findroot(lambda v: mdot - r2 * A2 * v, 1)
    case('F05', name, kind, {'A1': A1, 'A2': A2, 'v1': v1, 'rho1': r1, 'rho2': r2}, {'Q1': A1 * v1, 'mdot': mdot, 'v2': v2, 'Q2': A2 * v2}, method='mass balance residual (findroot)', tol=1e-13, scale={'Q1': 1e-9, 'mdot': 1e-9, 'v2': 1e-9, 'Q2': 1e-9})

# F06: integrate Euler's equation dp/ds = −ρ(v dv/ds + g dz/ds) along a streamline with v(s), z(s) varying smoothly
def euler_dp(rho, v1, v2, z1, z2, g):
    v = lambda s: v1 + (v2 - v1) * (3 * s**2 - 2 * s**3)
    z = lambda s: z1 + (z2 - z1) * mp.sin(mp.pi * s / 2)**2
    return mp.quad(lambda s: rho * (v(s) * mp.diff(v, s) + g * mp.diff(z, s)), [0, 1])
for (rho, v1, v2, z1, z2, g, p1, kind, name) in [(1000, 1, 3, 0, 0, '9.8', 101325, 'benchmark', 'EX F06'), (1000, 2, 2, 0, 0, '9.8', 101325, 'boundary', 'same speed and height'), (1000, 1, 4, 0, 3, '9.8', 101325, 'transfer', 'faster and higher'), (1000, 1, 15, 0, 0, '9.8', 101325, 'boundary', 'very fast: absolute pressure would be negative')]:
    rho, v1, v2, z1, z2, g, p1 = map(mp.mpf, (rho, v1, v2, z1, z2, g, p1))
    dp = euler_dp(rho, v1, v2, z1, z2, g)
    p2 = p1 - dp
    ex = {'dp': dp, 'p2': p2 if p2 > 0 else NA_()}
    case('F06', name, kind, {'rho': rho, 'v1': v1, 'v2': v2, 'z1': z1, 'z2': z2, 'g': g, 'p1': p1}, ex, conds={'positive': 'applicable' if p2 > 0 else 'notApplicable'}, method='∫ Euler equation along a streamline (quad)', tol=1e-11, scale={'dp': 1})

# F07: solve the radial momentum balance (1/r)(r u′)′ = −G with u′(0) = 0, u(R) = 0 (odefun from a series start),
# then integrate Q = ∫ 2πr u dr
def poiseuille(R, Lp, eta, dp):
    G = dp / (eta * Lp)
    eps = R * mp.mpf('1e-6')
    # u(r) = u0 − G r²/4 near 0; integrate with u0 = 0 and shift so that u(R) = 0 (the equation is linear)
    sol = mp.odefun(lambda r, y: [y[1], -G - y[1] / r], eps, [-G * eps**2 / 4, -G * eps / 2])
    uR = sol(R)[0]
    u = lambda r: (sol(r)[0] if r > eps else -G * r**2 / 4) - uR
    Q = mp.quad(lambda r: 2 * mp.pi * r * u(r), [0, eps, R])
    return Q
mp.mp.dps = 25
for (r, Lp, eta, dp, rho, kind, name) in [('1e-3', 1, '1e-3', 100, 1000, 'benchmark', 'EX F07'), ('2e-3', 1, '1e-3', 100, 1000, 'transfer', 'radius doubled: 16 × the flow'), ('5e-3', 1, '1e-3', 100, 1000, 'boundary', 'wide pipe: Re above 2300, not laminar')]:
    r, Lp, eta, dp, rho = map(mp.mpf, (r, Lp, eta, dp, rho))
    Q = poiseuille(r, Lp, eta, dp)
    vm = Q / (mp.pi * r**2); Re = rho * vm * 2 * r / eta
    ins = {'r': r, 'Lp': Lp, 'eta': eta, 'dp': dp, 'rho': rho}
    if Re < 2000:
        case('F07', name, kind, ins, {'Q': Q, 'vm': vm, 'Re': Re}, conds={'laminar': 'applicable'}, method='radial ODE (odefun) and ∫ 2πr u dr', tol=1e-10)
    else:
        case('F07', name, kind, ins, {'Q': NA_(Q), 'vm': NA_(), 'Re': Re}, conds={'laminar': 'notApplicable'}, method='radial ODE (odefun); Re too large', tol=1e-10)
mp.mp.dps = 50

# F08: integrate m dv/dt = (ρs − ρf)Vg − 6πηrv until the speed has settled (50 relaxation times)
for (r, rs, rf, eta, g, kind, name) in [('1e-4', 2000, 1000, 1, 10, 'benchmark', 'EX F08'), ('1e-4', 1000, 1000, 1, 10, 'boundary', 'neutral density: no settling'), ('1e-4', 900, 1000, 1, 10, 'transfer', 'lighter sphere rises'), ('1e-3', 2500, 1000, '1e-3', '9.81', 'boundary', 'sand grain in water: Re too large')]:
    r, rs, rf, eta, g = map(mp.mpf, (r, rs, rf, eta, g))
    V = 4 * mp.pi * r**3 / 3; m = rs * V; b = 6 * mp.pi * eta * r
    tau = m / b
    v = ode(lambda t, y: [((rs - rf) * V * g - b * y[0]) / m], [0], 60 * tau)[0]
    Re = rf * abs(v) * 2 * r / eta
    ins = {'r': r, 'rhoS': rs, 'rhoF': rf, 'eta': eta, 'g': g}
    if Re < mp.mpf('0.1'):
        case('F08', name, kind, ins, {'vt': v, 'Re': Re}, conds={'creeping': 'applicable'}, method='mpmath.odefun of the settling motion to 60 τ', tol=1e-12, scale={'vt': 1e-20, 'Re': 1e-20})
    else:
        case('F08', name, kind, ins, {'vt': NA_(v), 'Re': Re}, conds={'creeping': 'notApplicable'}, method='mpmath.odefun; Re too large for Stokes', tol=1e-12)

# F09: ratio of the inertial to the viscous force scale
for (rho, v, Lc, eta, kind, name) in [(1000, '0.1', '0.01', '1e-3', 'benchmark', 'EX F09'), (1000, 0, '0.01', '1e-3', 'boundary', 'fluid at rest'), ('1.204', 30, '0.1', '1.81e-5', 'transfer', 'air around a 10 cm body at 30 m/s')]:
    rho, v, Lc, eta = map(mp.mpf, (rho, v, Lc, eta))
    inertial = rho * v**2 / Lc; viscous = eta * v / Lc**2
    Re = inertial / viscous if v > 0 else mp.mpf(0)
    case('F09', name, kind, {'rho': rho, 'v': v, 'Lc': Lc, 'eta': eta}, {'Re': Re, 'nu': eta / rho}, conds={'pipeLaminar': 'applicable' if Re < 2000 else 'notApplicable'}, method='ratio of the inertial and viscous force scales', tol=1e-13, scale={'Re': 1})

# F10: vertical force balance of the column: 2πrγ cos θ = ρgπr²h (findroot)
for (gam, th, rho, g, r, kind, name) in [('0.072', 0, 1000, '9.8', '5e-4', 'benchmark', 'EX F10'), ('0.072', mp.pi / 2, 1000, '9.8', '5e-4', 'boundary', '90° contact angle: no rise'), ('0.485', mp.mpf(140) * mp.pi / 180, 13534, '9.8', '5e-4', 'transfer', 'mercury in glass: depression'), ('0.072', 0, 1000, '9.8', '5e-3', 'boundary', 'wide tube: Bond number too large')]:
    gam, rho, g, r = map(mp.mpf, (gam, rho, g, r)); th = mp.mpf(th)
    h = mp.findroot(lambda h: 2 * mp.pi * r * gam * mp.cos(th) - rho * g * mp.pi * r**2 * h, 0)
    Bo = rho * g * r**2 / gam
    ins = {'gam': gam, 'th': th, 'rho': rho, 'g': g, 'r': r}
    if Bo < mp.mpf('0.1'):
        case('F10', name, kind, ins, {'h': h, 'Bo': Bo}, conds={'narrow': 'applicable'}, method='force balance on the column (findroot)', tol=1e-12, scale={'h': 1e-2})
    else:
        case('F10', name, kind, ins, {'h': {'state': 'approximate', 'value': h} if Bo < 1 else NA_(h), 'Bo': Bo}, conds={'narrow': 'approximate' if Bo < 1 else 'notApplicable'}, method='force balance; Bond number large', tol=1e-12)

# F11: a chain of masses ρAa joined by springs EA/a; long-wavelength phase velocity ω/k and the spring force
def chain_speed(E, rho, a=mp.mpf('1e-3')):
    kk = mp.mpf('1e-9') / a   # k·a = 1e−9: the dispersion correction (ka)²/24 ≈ 4e−20 is far below the tolerance
    m = rho * a; ks = E / a   # per unit area
    w = 2 * mp.sqrt(ks / m) * mp.sin(kk * a / 2)
    return w / kk
for (E, rho, eps, sy, kind, name) in [('2e11', 8000, '1e-4', '2.5e8', 'benchmark', 'EX F11'), ('2e11', 8000, 0, '2.5e8', 'boundary', 'unstrained'), ('7e10', 2700, '1e-3', '2.7e8', 'transfer', 'aluminium'), ('2e11', 8000, '2e-3', '2.5e8', 'boundary', 'beyond yield: Hooke not applicable')]:
    E, rho, eps, sy = map(mp.mpf, (E, rho, eps, sy))
    a = mp.mpf('1e-3'); A_ = mp.mpf('1e-4')
    F = (E * A_ / a) * (eps * a)   # spring force for an element stretched by ε·a
    sig = F / A_
    ins = {'E': E, 'rho': rho, 'eps': eps, 'sy': sy}
    ex = {'sig': sig if sig <= sy else NA_(), 'c': chain_speed(E, rho)}
    case('F11', name, kind, ins, ex, conds={'elastic': 'applicable' if sig <= sy else 'notApplicable'}, method='mass–spring chain: long-wavelength ω/k; spring force per area', tol=1e-12, scale={'sig': 1})

# F12: c² = dp/dρ along the isentrope p = Kρ^γ (numerical derivative); stagnation density from the energy equation
# h + v²/2 = h0 with h = γ/(γ−1)·p/ρ on the same isentrope (findroot)
for (gam, p, rho, v, kind, name) in [('1.4', '1e5', '1.25', 100, 'benchmark', 'EX F12'), ('1.4', '1e5', '1.25', 0, 'boundary', 'at rest'), ('1.67', '2e5', '0.33', 250, 'transfer', 'helium-like gas, faster')]:
    gam, p, rho, v = map(mp.mpf, (gam, p, rho, v))
    K = p / rho**gam
    c_ = mp.sqrt(mp.diff(lambda r: K * r**gam, rho))
    hh = lambda r: gam / (gam - 1) * K * r**(gam - 1)
    rho0 = mp.findroot(lambda r: hh(r) - hh(rho) - v**2 / 2, rho * (1 + v**2 / (2 * c_**2)))
    Ma = v / c_
    case('F12', name, kind, {'gam': gam, 'p': p, 'rho': rho, 'v': v}, {'c': c_, 'Ma': Ma, 'drho': rho0 / rho - 1}, conds={'incompressible': 'applicable' if Ma < mp.mpf('0.3') else 'notApplicable'}, method='dp/dρ on the isentrope; stagnation by the energy equation (findroot)', tol=1e-12, scale={'Ma': 1, 'drho': 1})
