"""Reference values for the decay networks (26.64, D275, D276) -> tests/fixtures/chem/nuclear.json

  python -I scripts/oracles/nuclear.py          (venv with mpmath and radioactivedecay)

Kinds of cases, each with the request for the core, the reference amounts and a relative tolerance:

  analytic   two- and three-member chains by the closed Bateman formulas in mpmath (50 digits)
  network    networks with branching, long chains, equal and nearly equal decay constants: exp(A t) N0 by mpmath's
             matrix exponential at 80 digits (no closed form is used, so equal constants need no special care)
  equilibrium  activity ratios of secular and transient equilibrium, closed form
  rd         real chains computed by the package radioactivedecay in its high-precision mode (SymPy). The reference
             uses that package's own data set, ICRP-107 (half-lives and branching fractions); so that the comparison
             tests the solution and not the data, the request carries the same network — the half-lives and
             branching fractions of the members of the chain as the package reports them. These numbers are in the
             fixture for this comparison only; ICRP-107 is not part of the product (docs/chem/DATA_SOURCES.md).
  data       the same chains from the product's own table (NUBASE2020) against the ICRP-107 reference: the
             difference is the difference of two evaluations, the tolerance is a few percent and stated per case

`data` cases name the nuclides only; the test loads src/chem/data/nuclides.json.
"""
import json
import os
import mpmath as mp

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'tests', 'fixtures', 'chem', 'nuclear.json')
CASES = []
LN2 = mp.log(2)


def f(x):
    return float(x)


def expm_solution(lams, edges, n0, times, dps=80):
    """exp(A t) N0 for A_ii = -lambda_i, A_ji = b lambda_i for an edge (i, j, b)."""
    with mp.workdps(dps):
        n = len(lams)
        a = mp.zeros(n)
        for i in range(n):
            a[i, i] = -mp.mpf(lams[i])
        for (i, j, b) in edges:
            a[j, i] += mp.mpf(b) * mp.mpf(lams[i])
        y0 = mp.matrix([mp.mpf(x) for x in n0])
        out = []
        for t in times:
            y = mp.expm(a * mp.mpf(t), method='taylor') * y0
            out.append([y[i] for i in range(n)])
        return out


def network_case(id_, kind, names, lams, edges, n0, times, tol, method, dps=80):
    sol = expm_solution(lams, edges, n0, times, dps)
    request = {
        'op': 'nuclideDecay',
        'network': {'nuclides': [{'id': nm, 'lambda': f(l)} for nm, l in zip(names, lams)], 'decays': [{'from': names[i], 'to': names[j], 'fraction': f(b)} for (i, j, b) in edges]},
        'inventory': {nm: f(x) for nm, x in zip(names, n0) if x != 0},
        'times': [f(t) for t in times],
    }
    CASES.append({'id': id_, 'kind': kind, 'request': request, 'expect': {nm: [f(row[i]) for row in sol] for i, nm in enumerate(names)}, 'tol': tol, 'method': method})


# ---- analytic: closed formulas (another route than the matrix exponential) ----
mp.mp.dps = 50
k = 0
for (l1, l2) in ((1.0, 3.0), (3.0, 1.0), (1e-3, 2.0), (5.0, 1e-4), (0.2, 0.25), (1e-9, 1e-2), (7.0, 7.5), (1e2, 1e-6), (0.5, 40.0), (2.0, 2.2)):
    times = [0.0, 0.05 / max(l1, l2), 1 / max(l1, l2), 1 / min(l1, l2), 5 / min(l1, l2)]
    a, b = mp.mpf(repr(l1)), mp.mpf(repr(l2))
    n1 = [1000 * mp.exp(-a * t) for t in times]
    n2 = [1000 * a / (b - a) * (mp.exp(-a * t) - mp.exp(-b * t)) for t in times]
    n3 = [1000 - x - y for x, y in zip(n1, n2)]
    k += 1
    CASES.append({'id': 'analytic-2-%02d' % k, 'kind': 'analytic', 'request': {
        'op': 'nuclideDecay', 'network': {'nuclides': [{'id': 'A', 'lambda': l1}, {'id': 'B', 'lambda': l2}, {'id': 'C'}], 'decays': [{'from': 'A', 'to': 'B'}, {'from': 'B', 'to': 'C'}]},
        'inventory': {'A': 1000}, 'times': [f(t) for t in times]},
        'expect': {'A': [f(x) for x in n1], 'B': [f(x) for x in n2], 'C': [f(x) for x in n3]}, 'tol': 1e-11,
        'method': 'N_B = N0 l1/(l2 - l1) (e^(-l1 t) - e^(-l2 t)); C by conservation; mpmath, 50 digits'})
for (l1, l2, l3) in ((1.0, 2.0, 3.0), (3.0, 0.1, 10.0), (1e-4, 1.0, 50.0), (0.3, 0.31, 0.32), (10.0, 1e-3, 1e-5), (1.0, 100.0, 1e-2), (2.0, 5.0, 2.5), (1e-6, 1e-3, 1.0), (4.0, 0.4, 0.04), (0.7, 0.9, 1.1)):
    ls = [mp.mpf(repr(x)) for x in (l1, l2, l3)]
    times = [0.1 / max(l1, l2, l3), 1.0, 3 / min(l1, l2, l3)]
    # Bateman: N_3 = N0 l1 l2 sum_i e^(-l_i t) / prod_{j != i} (l_j - l_i)
    n3 = [100 * ls[0] * ls[1] * sum(mp.exp(-ls[i] * t) / mp.fprod(ls[j] - ls[i] for j in range(3) if j != i) for i in range(3)) for t in times]
    k += 1
    CASES.append({'id': 'analytic-3-%02d' % k, 'kind': 'analytic', 'request': {
        'op': 'nuclideDecay', 'network': {'nuclides': [{'id': 'A', 'lambda': l1}, {'id': 'B', 'lambda': l2}, {'id': 'C', 'lambda': l3}, {'id': 'D'}], 'decays': [{'from': 'A', 'to': 'B'}, {'from': 'B', 'to': 'C'}, {'from': 'C', 'to': 'D'}]},
        'inventory': {'A': 100}, 'times': [f(t) for t in times]},
        'expect': {'C': [f(x) for x in n3]}, 'tol': 1e-10,
        'method': 'Bateman: N_3 = N0 l1 l2 sum_i e^(-l_i t)/prod_(j != i)(l_j - l_i); mpmath, 50 digits'})

# ---- networks: branching ----
network_case('branch-01', 'network', ['A', 'B', 'C', 'D'], [2.0, 0.3, 5.0, 0], [(0, 1, 0.3), (0, 2, 0.7), (1, 3, 1), (2, 3, 1)], [10, 0, 0, 0], [0.01, 0.5, 2, 20], 1e-10, 'A -> B (30 %), C (70 %) -> D; mpmath expm, 80 digits')
network_case('branch-02', 'network', ['A', 'B', 'C', 'D', 'E'], [1e-3, 4.0, 0.02, 0.5, 0], [(0, 1, 0.64), (0, 2, 0.36), (1, 3, 1), (2, 3, 0.9), (2, 4, 0.1), (3, 4, 1)], [1e6, 0, 5, 0, 0], [1, 30, 600, 5000], 1e-10, 'two paths that join, and a side branch to the end; mpmath expm')
network_case('branch-03', 'network', ['A', 'B', 'C'], [0.7, 0.2, 0], [(0, 1, 0.999999), (0, 2, 0.000001), (1, 2, 1)], [1, 0, 0], [0.5, 5, 40], 1e-10, 'a branch of one part in a million; mpmath expm')
network_case('branch-04', 'network', ['A', 'B', 'C', 'D', 'E', 'F'], [0.11, 0.9, 0.9, 3.0, 0.05, 0], [(0, 1, 0.5), (0, 2, 0.5), (1, 3, 1), (2, 3, 1), (3, 4, 0.2), (3, 5, 0.8), (4, 5, 1)], [3, 1, 0, 0, 0, 0], [0.2, 2, 20, 150], 1e-10, 'two branches with the same decay constant; mpmath expm')
network_case('branch-05', 'network', ['A', 'B', 'C', 'D'], [5.0, 1.0, 0.1, 0], [(0, 1, 0.4), (0, 2, 0.35), (1, 3, 1), (2, 3, 1)], [8, 0, 0, 0], [0.1, 1, 10, 60], 1e-10, 'a quarter of the decays of A is not followed (fractions add to 0.75): the members are still exact; mpmath expm')
for n, (seed, span) in enumerate(((3, 1e2), (7, 1e6), (11, 1e12), (13, 1e3), (17, 1e9))):
    # long linear chains with decay constants spread over `span`
    m = 6 + n
    lams = [10.0 ** (-(mp.log10(span)) * ((i * seed) % m) / (m - 1)) for i in range(m)] + [0]
    lams = [f(x) for x in lams]
    edges = [(i, i + 1, 1) for i in range(m)]
    times = [0.3, 30.0, f(3 / min(lams[:-1]))]
    network_case('chain-%02d' % (n + 1), 'network', ['M%d' % i for i in range(m + 1)], lams, edges, [1] + [0] * m, times, 1e-9, 'linear chain of %d members, decay constants over a factor %g; mpmath expm, 120 digits' % (m, span), dps=120)
# ---- equal and nearly equal constants ----
for n, (lam, eps) in enumerate(((0.5, 0), (0.5, 1e-15), (0.5, 1e-12), (0.5, 1e-9), (0.5, 1e-6), (0.5, 1e-3), (3.0, 0), (1e-5, 1e-10), (40.0, 1e-13), (1.0, 1e-8))):
    lams = [lam, lam * (1 + eps), lam * (1 + 2 * eps), 0]
    network_case('degenerate-%02d' % (n + 1), 'network', ['A', 'B', 'C', 'D'], lams, [(0, 1, 1), (1, 2, 1), (2, 3, 1)], [1, 0, 0, 0], [0.1 / lam, 1 / lam, 8 / lam], 1e-10,
                 'three members with decay constants %g (1 + k %g), k = 0, 1, 2: the closed formula divides by their differences; mpmath expm' % (lam, eps))
for n, (l1, l2) in enumerate(((1.0, 1.0), (2.0, 2.0 * (1 + 1e-14)), (1e-3, 1e-3 * (1 + 1e-10)), (9.0, 9.0), (0.25, 0.25 * (1 - 1e-11)))):
    network_case('degenerate-pair-%02d' % (n + 1), 'network', ['A', 'B', 'C'], [l1, l2, 0], [(0, 1, 1), (1, 2, 1)], [5, 2, 0], [0.01 / l1, 1 / l1, 20 / l1], 1e-10, 'a pair of equal or nearly equal constants with both members present at the start; mpmath expm')
# ---- stiff: decay constants more than 16 orders of magnitude apart ----
network_case('stiff-01', 'network', ['P', 'Q', 'R'], [4.9e-18, 4.2e3, 0], [(0, 1, 1), (1, 2, 1)], [1e24, 0, 0], [1e-6, 1.0, 1e6, 1e17], 1e-10, 'parent 21 orders of magnitude longer lived than the daughter; mpmath expm, 120 digits', dps=120)
network_case('stiff-02', 'network', ['P', 'Q', 'R', 'S', 'T'], [1e-17, 1e-2, 1e4, 1e-9, 0], [(0, 1, 1), (1, 2, 1), (2, 3, 1), (3, 4, 1)], [1e20, 0, 0, 0, 0], [1e-3, 1e3, 1e9, 1e16], 1e-9, 'alternating long and short lives over 21 orders of magnitude; mpmath expm, 160 digits', dps=160)

# ---- equilibrium ----
mp.mp.dps = 50
for n, (t1, t2) in enumerate(((1e6, 1.0), (1e4, 3.0), (1600 * 3.156e7, 3.82 * 86400), (28.8, 2.67 / 365.25), (1e9, 1e3))):
    l1, l2 = LN2 / mp.mpf(repr(t1)), LN2 / mp.mpf(repr(t2))
    t = 30 * t2
    ratio = l2 / (l2 - l1) * (1 - mp.exp(-(l2 - l1) * t))
    CASES.append({'id': 'secular-%02d' % (n + 1), 'kind': 'equilibrium', 'request': {
        'op': 'nuclideDecay', 'network': {'nuclides': [{'id': 'P', 'halfLife': t1}, {'id': 'D', 'halfLife': t2}, {'id': 'S'}], 'decays': [{'from': 'P', 'to': 'D'}, {'from': 'D', 'to': 'S'}]},
        'inventory': {'P': 1e12}, 'times': [f(t)]}, 'expect': {'ratio': f(ratio), 'of': ['D', 'P']}, 'tol': 1e-10,
        'method': 'secular equilibrium: after 30 half-lives of the daughter A_D/A_P = l2/(l2 - l1) (1 - e^(-(l2 - l1) t)), within 1e-9 of 1 for these pairs'})
for n, (t1, t2) in enumerate(((10.0, 2.0), (65.94, 6.015), (12.75, 1.678), (8.0, 5.0), (100.0, 60.0))):
    l1, l2 = LN2 / mp.mpf(repr(t1)), LN2 / mp.mpf(repr(t2))
    t = 25 * t2 * t1 / (t1 - t2)
    ratio = l2 / (l2 - l1) * (1 - mp.exp(-(l2 - l1) * t))
    CASES.append({'id': 'transient-%02d' % (n + 1), 'kind': 'equilibrium', 'request': {
        'op': 'nuclideDecay', 'network': {'nuclides': [{'id': 'P', 'halfLife': t1}, {'id': 'D', 'halfLife': t2}, {'id': 'S'}], 'decays': [{'from': 'P', 'to': 'D'}, {'from': 'D', 'to': 'S'}]},
        'inventory': {'P': 1e12}, 'times': [f(t)]}, 'expect': {'ratio': f(ratio), 'of': ['D', 'P'], 'limit': f(l2 / (l2 - l1))}, 'tol': 1e-10,
        'method': 'transient equilibrium: A_D/A_P tends to l2/(l2 - l1) = T1/(T1 - T2)'})

# ---- radioactivedecay (ICRP-107), high precision ----
import radioactivedecay as rd  # noqa: E402

DATA = 'ICRP-107 via radioactivedecay %s (test reference only)' % rd.__version__


def rd_network(parent):
    """The chain below `parent` as the package holds it: members, half-lives (s), branching fractions."""
    members, edges, queue = [], [], [parent]
    while queue:
        name = queue.pop(0)
        if name in members:
            continue
        members.append(name)
        nuc = rd.Nuclide(name)
        for daughter, fraction in zip(nuc.progeny(), nuc.branching_fractions()):
            if daughter == 'SF':
                continue
            edges.append((name, daughter, float(fraction)))
            queue.append(daughter)
    nuclides = []
    for name in members:
        hl = rd.Nuclide(name).half_life('s')
        nuclides.append({'id': name, 'halfLife': None if hl == float('inf') else float(hl)})
    return nuclides, [{'from': a, 'to': b, 'fraction': x} for a, b, x in edges]


def rd_case(id_, parent, times, unit_time, tol=1e-9):
    nuclides, decays = rd_network(parent)
    expect = {n['id']: [] for n in nuclides}
    for t in times:
        inv = rd.InventoryHP({parent: 1.0}, 'num').decay(t, unit_time)
        nums = inv.numbers()
        for n in nuclides:
            expect[n['id']].append(float(nums.get(n['id'], 0.0)))
    seconds = {'s': 1.0, 'h': 3600.0, 'd': 86400.0, 'y': 365.2422 * 86400.0}[unit_time]
    year = float(rd.Nuclide('H-3').half_life('s') / rd.Nuclide('H-3').half_life('y')) if unit_time == 'y' else None
    CASES.append({'id': id_, 'kind': 'rd', 'data': DATA, 'request': {'op': 'nuclideDecay', 'network': {'nuclides': nuclides, 'decays': decays}, 'inventory': {parent: 1.0}, 'times': [t * (year or seconds) for t in times]},
                  'expect': expect, 'tol': tol, 'floor': 1e-30,
                  'method': 'radioactivedecay.InventoryHP (SymPy arithmetic) with its ICRP-107 data; the request carries the same half-lives and branching fractions'})


rd_case('rd-Mo99', 'Mo-99', [1, 6, 24, 66, 300], 'h')
rd_case('rd-U238', 'U-238', [1, 1e3, 1e6, 1e9, 4.468e9], 'y')
rd_case('rd-U238-early', 'U-238', [1, 30, 365], 'd')
rd_case('rd-Th232', 'Th-232', [1, 10, 100, 1e6, 1.4e10], 'y')
rd_case('rd-U235', 'U-235', [1, 1e4, 1e8, 7e8], 'y')
rd_case('rd-Ra226', 'Ra-226', [1, 30, 1600, 1e4], 'y')
rd_case('rd-Rn222', 'Rn-222', [0.5, 3, 24, 240], 'h')
rd_case('rd-Sr90', 'Sr-90', [1, 30, 300], 'y')
rd_case('rd-Cs137', 'Cs-137', [0.01, 1, 30, 100], 'y')
rd_case('rd-I131', 'I-131', [1, 8, 80], 'd')
rd_case('rd-Am241', 'Am-241', [1, 432, 1e4, 1e7], 'y')
rd_case('rd-Pu239', 'Pu-239', [1, 2.4e4, 1e6], 'y')
rd_case('rd-Np237', 'Np-237', [1, 1e3, 2e6], 'y')
rd_case('rd-Bi212', 'Bi-212', [10, 60, 600], 's')
rd_case('rd-Zr95', 'Zr-95', [1, 64, 640], 'd')
# the value of the research note: activity of Tc-99m after 6 h per becquerel of Mo-99 at the start
mo = rd.Inventory({'Mo-99': 1.0}, 'Bq').decay(6, 'h').activities('Bq')
CASES.append({'id': 'rd-Mo99-activity', 'kind': 'activity', 'data': DATA, 'request': {'op': 'nuclideDecay', 'network': dict(zip(('nuclides', 'decays'), rd_network('Mo-99'))), 'inventory': {'Mo-99': 1.0}, 'unit': 'Bq', 'times': [6 * 3600.0]},
              'expect': {'Tc-99m': float(mo['Tc-99m']), 'Mo-99': float(mo['Mo-99'])}, 'tol': 1e-9, 'method': 'radioactivedecay: 1 Bq of Mo-99, activities after 6 h (the research note gives 0.4228 for Tc-99m)'})

# ---- the product's table against the same references: a comparison of data ----
YEAR = float(rd.Nuclide('H-3').half_life('s') / rd.Nuclide('H-3').half_life('y'))
for (id_, parent, t, watch, tol, why) in (
        ('data-Mo99', 'Mo-99', 6 * 3600.0, ['Mo-99', 'Tc-99m'], 5e-3, 'half-lives 65.932 h and 6.0066 h (NUBASE2020) against 65.94 h and 6.015 h; feeding 0.8778 against 0.8773'),
        ('data-Cs137', 'Cs-137', 30 * YEAR, ['Cs-137', 'Ba-137m'], 1e-2, 'half-life 30.04 y against 30.167 y; feeding 0.947 against 0.944'),
        ('data-Sr90', 'Sr-90', 10 * YEAR, ['Sr-90', 'Y-90'], 1e-2, 'half-life 28.91 y against 28.79 y'),
        ('data-I131', 'I-131', 8 * 86400.0, ['I-131'], 2e-3, 'half-life 8.0249 d against 8.0207 d'),
        ('data-Ra226', 'Ra-226', 100 * YEAR, ['Ra-226', 'Rn-222', 'Pb-210', 'Po-210'], 2e-2, 'half-lives of Ra-226 and Pb-210 differ by under one percent'),
        ('data-Th232', 'Th-232', 50 * YEAR, ['Th-232', 'Ra-228', 'Th-228', 'Ra-224', 'Pb-212'], 2e-2, 'half-lives of Ra-228 and Th-228 differ by under half a percent'),
        ('data-U238', 'U-238', 1e9 * YEAR, ['U-238', 'U-234', 'Th-230', 'Ra-226', 'Pb-206'], 2e-2, 'half-lives of the long-lived members differ by under one percent; Th-234 feeds Pa-234 instead of Pa-234m in the table, which does not change the members compared'),
        ('data-U235', 'U-235', 1e8 * YEAR, ['U-235', 'Pa-231', 'Ac-227', 'Pb-207'], 2e-2, 'half-lives differ by under one percent'),
        ('data-Co60', 'Co-60', 5 * YEAR, ['Co-60', 'Ni-60'], 2e-3, 'half-life 5.2711 y against 5.2713 y'),
        ('data-C14', 'C-14', 5000 * YEAR, ['C-14', 'N-14'], 5e-3, 'half-life 5700 y in both')):
    nums = rd.InventoryHP({parent: 1.0}, 'num').decay(t, 's').numbers()
    CASES.append({'id': id_, 'kind': 'data', 'data': DATA, 'request': {'op': 'nuclideDecay', 'inventory': {parent: 1.0}, 'times': [t], 'minBranch': 1e-6},
                  'expect': {n: float(nums.get(n, 0.0)) for n in watch}, 'tol': tol, 'method': 'radioactivedecay (ICRP-107) against the table of the product (NUBASE2020): ' + why})

with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
    json.dump({'generator': 'scripts/oracles/nuclear.py (mpmath %s, radioactivedecay %s)' % (mp.__version__, rd.__version__), 'cases': CASES}, fh, ensure_ascii=False, indent=1)
    fh.write('\n')
kinds = {}
for c in CASES:
    kinds[c['kind']] = kinds.get(c['kind'], 0) + 1
print(len(CASES), 'cases ->', os.path.relpath(OUT), kinds)
