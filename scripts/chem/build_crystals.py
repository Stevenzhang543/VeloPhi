"""Build src/chem/data/crystals.json from scripts/chem/crystals.json.

Run:  .cache/chem-venv/Scripts/python.exe -I scripts/chem/build_crystals.py

The input gives each structure the way the literature does: lattice constants with their citation, the atoms of the
asymmetric unit, and the symmetry operations (plus lattice centring) that generate the conventional cell. The script
expands that to every atom of the cell and then checks the result against bond distances known independently of the
cell (`expect.nearest`: element pair, distance, tolerance, number of such neighbours). A wrong setting of a space
group or a mistyped coordinate cannot pass that check. Standard library only, so the output is the same everywhere.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from datalib import DATA_DIR, HERE, clean_float, evaluate, load_json, parse_formula, write_records  # noqa: E402

SRC = os.path.join(HERE, 'crystals.json')
OUT = os.path.join(DATA_DIR, 'crystals.json')

CENTRING = {
    'P': [(0, 0, 0)],
    'I': [(0, 0, 0), (0.5, 0.5, 0.5)],
    'F': [(0, 0, 0), (0, 0.5, 0.5), (0.5, 0, 0.5), (0.5, 0.5, 0)],
    'C': [(0, 0, 0), (0.5, 0.5, 0)],
    'R': [(0, 0, 0), (2 / 3, 1 / 3, 1 / 3), (1 / 3, 2 / 3, 2 / 3)],  # rhombohedral lattice on hexagonal axes (obverse)
}
SYSTEMS = {
    'cubic': lambda e: (e['a'], e['a'], e['a'], 90, 90, 90),
    'tetragonal': lambda e: (e['a'], e['a'], e['c'], 90, 90, 90),
    'orthorhombic': lambda e: (e['a'], e['b'], e['c'], 90, 90, 90),
    'hexagonal': lambda e: (e['a'], e['a'], e['c'], 90, 90, 120),
    'trigonal': lambda e: (e['a'], e['a'], e['c'], 90, 90, 120),  # hexagonal axes
}


def cell_matrix(a, b, c, alpha, beta, gamma):
    """Rows are the cell vectors in Cartesian coordinates (a along x, b in the xy plane)."""
    al, be, ga = (math.radians(v) for v in (alpha, beta, gamma))
    bx, by = b * math.cos(ga), b * math.sin(ga)
    cx = c * math.cos(be)
    cy = c * (math.cos(al) - math.cos(be) * math.cos(ga)) / math.sin(ga)
    cz = math.sqrt(max(0.0, c * c - cx * cx - cy * cy))
    return [(a, 0.0, 0.0), (bx, by, 0.0), (cx, cy, cz)]


def cartesian(m, f):
    return tuple(sum(f[i] * m[i][k] for i in range(3)) for k in range(3))


def expand(entry):
    params = {k: evaluate(str(v)) for k, v in entry.get('params', {}).items()}
    ops = entry.get('ops', ['x,y,z'])
    shifts = CENTRING[entry.get('centring', 'P')]
    atoms = []
    for el, *xyz in entry['sites']:
        base = [evaluate(str(v), params) for v in xyz]
        for op in ops:
            comps = op.split(',')
            if len(comps) != 3:
                raise ValueError('bad symmetry operation %r' % op)
            var = dict(params, x=base[0], y=base[1], z=base[2])
            p = [evaluate(c, var) for c in comps]
            for s in shifts:
                q = tuple(round((p[k] + s[k]) % 1.0, 6) % 1.0 for k in range(3))
                if not any(el == e2 and all(min(abs(q[k] - q2[k]), 1 - abs(q[k] - q2[k])) < 1e-4 for k in range(3)) for e2, q2 in atoms):
                    atoms.append((el, q))
    order = []
    for el, *_ in entry['sites']:
        if el not in order:
            order.append(el)
    atoms.sort(key=lambda t: (order.index(t[0]), t[1][2], t[1][1], t[1][0]))
    return atoms


def neighbours(m, atoms, i, other):
    """Sorted distances from atom i to every atom of element `other` in the 27 neighbouring cells."""
    out = []
    for j, (el, f) in enumerate(atoms):
        if el != other:
            continue
        for da in (-1, 0, 1):
            for db in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    if j == i and da == db == dc == 0:
                        continue
                    d = cartesian(m, (f[0] + da - atoms[i][1][0], f[1] + db - atoms[i][1][1], f[2] + dc - atoms[i][1][2]))
                    out.append(math.sqrt(sum(v * v for v in d)))
    return sorted(out)


def main():
    src = load_json(SRC)
    records, seen = [], set()
    for e in src['crystals']:
        if e['id'] in seen:
            raise SystemExit('duplicate crystal id %s' % e['id'])
        seen.add(e['id'])
        if 'derive' in e:  # a lattice constant computed from published ones; the expression is part of the input
            e = dict(e, **{k: evaluate(v) for k, v in e['derive'].items()})
        a, b, c, alpha, beta, gamma = SYSTEMS[e['system']](e)
        m = cell_matrix(a, b, c, alpha, beta, gamma)
        atoms = expand(e)
        exp = e['expect']
        if len(atoms) != exp['atoms']:
            raise SystemExit('%s: %d atoms in the cell, expected %d' % (e['id'], len(atoms), exp['atoms']))
        for el1, el2, dist, tol, count in exp['nearest']:
            for i, (el, _) in enumerate(atoms):
                if el != el1:
                    continue
                near = neighbours(m, atoms, i, el2)[:count + 1]
                bad = [d for d in near[:count] if abs(d - dist) > tol]
                if bad or (len(near) > count and near[count] - dist <= tol):
                    raise SystemExit('%s: %s has %s neighbours at %s, expected %d at %.3f +- %.3f' % (
                        e['id'], el1, el2, ', '.join('%.3f' % d for d in near), count, dist, tol))
        counts, _ = parse_formula(e['formula'])
        have = {}
        for el, _ in atoms:
            have[el] = have.get(el, 0) + 1
        omitted = set(e.get('omits', []))
        ratios = {have.get(el, 0) / n for el, n in counts.items() if el not in omitted}
        if len(ratios) != 1 or set(have) - set(counts):
            raise SystemExit('%s: cell content %r does not match the formula %s' % (e['id'], have, e['formula']))
        rec = {
            'id': e['id'],
            'name': e['name'],
            'formula': e['formula'],
            'system': e['system'],
            'structure': e['structure'],
            'a': clean_float(a, 4), 'b': clean_float(b, 4), 'c': clean_float(c, 4),
            'alpha': alpha, 'beta': beta, 'gamma': gamma,
            'basis': [[el, clean_float(f[0], 5), clean_float(f[1], 5), clean_float(f[2], 5)] for el, f in atoms],
            'source': e['source'],
        }
        if 'note' in e:
            rec['note'] = e['note']
        records.append(rec)
    head = {'format': 'velophi-crystals', 'version': 1, 'generator': {'script': 'scripts/chem/build_crystals.py'}}
    text = write_records(OUT, head, 'crystals', records)
    print('wrote %s: %d crystals, %d atoms in all cells, %d bytes' % (
        os.path.relpath(OUT), len(records), sum(len(r['basis']) for r in records), len(text.encode('utf-8'))))


if __name__ == '__main__':
    main()
