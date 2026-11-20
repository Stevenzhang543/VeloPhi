"""Check src/chem/data/{elements,molecules,crystals}.json and write tests/fixtures/chem/data-report.json.

Run:  .cache/chem-venv/Scripts/python.exe -I scripts/chem/check_data.py     (exit code 1 on any violation)

What is checked
  elements   118 records, unique symbols and names in each language, electrons of the configuration sum to z
  molecules  ids and names unique and non-empty in each language; atoms, coordinates and bonds well-formed, finite,
             centred, one connected piece; formula and net charge equal to the structure; every bond length inside the
             plausible range of its element pair and order (table below, worst offenders listed); no two atoms closer
             than 0.6 A and no unbonded pair closer than 1.2 A (1.0 A between two hydrogens); valences (RDKit's model through the SMILES where there
             is one, otherwise a table of allowed valences); net charge equal to the sum of the SMILES formal charges
  crystals   ids and names unique; cell parameters match the crystal system; fractional coordinates in [0, 1); no two
             atoms of the cell (periodic images included) closer than 0.5 A; cell content in the ratio of the formula
  counts     at least 118 elements, 400 molecules, 12 crystals

The report carries the SHA-256 of the three files, so a test can tell whether it belongs to the data in the tree.
"""
import hashlib
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from datalib import DATA_DIR, ELEMENT_SYMBOLS, ROOT, bond_pairs, count_atoms, distance, load_json, parse_formula, symmetry_classes  # noqa: E402
from build_crystals import SYSTEMS, cartesian, cell_matrix  # noqa: E402

REPORT = os.path.join(ROOT, 'tests', 'fixtures', 'chem', 'data-report.json')
TARGETS = {'elements': 118, 'molecules': 400, 'crystals': 12}
METHODS = ('rdkit-etkdg-mmff', 'rdkit-etkdg-uff', 'vsepr', 'literature')
LANGS = ('zh', 'en', 'de')

# Plausible bond lengths in angstrom by element pair (alphabetical) and bond order. The limits enclose the measured
# values of the bond type in ordinary molecules with a margin of a few hundredths: a force-field result that is
# simply wrong (MMFF94 gives 1.40 A for C=O in CO2 and 1.46 A for N2) falls outside.
# Order 1.5 is RDKit's aromatic flag; it also marks the lactam rings of uracil, thymine, cytosine, uric acid and
# caffeine, whose bonds alternate (1.34 and 1.48 A), so the aromatic ranges are wider than benzene alone would need.
RANGES = {
    ('C', 'C', 1): (1.40, 1.60), ('C', 'C', 1.5): (1.33, 1.49), ('C', 'C', 2): (1.29, 1.39), ('C', 'C', 3): (1.17, 1.23),
    ('C', 'H', 1): (1.05, 1.15),
    ('C', 'N', 1): (1.31, 1.53), ('C', 'N', 1.5): (1.29, 1.42), ('C', 'N', 2): (1.24, 1.36), ('C', 'N', 3): (1.12, 1.19),
    ('C', 'O', 1): (1.24, 1.48), ('C', 'O', 1.5): (1.33, 1.44), ('C', 'O', 2): (1.14, 1.27), ('C', 'O', 3): (1.11, 1.16),
    ('C', 'S', 1): (1.66, 1.87), ('C', 'S', 1.5): (1.68, 1.80), ('C', 'S', 2): (1.53, 1.70),
    ('C', 'F', 1): (1.30, 1.41), ('C', 'Cl', 1): (1.69, 1.83), ('Br', 'C', 1): (1.86, 1.99), ('C', 'I', 1): (2.06, 2.20),
    ('C', 'P', 1): (1.78, 1.90), ('C', 'Si', 1): (1.83, 1.92),
    ('H', 'H', 1): (0.70, 0.78), ('H', 'N', 1): (0.98, 1.06), ('H', 'O', 1): (0.93, 1.03), ('H', 'S', 1): (1.30, 1.38),
    ('H', 'P', 1): (1.37, 1.45), ('H', 'Si', 1): (1.44, 1.51), ('B', 'H', 1): (1.10, 1.36),
    ('F', 'H', 1): (0.90, 0.95), ('Cl', 'H', 1): (1.25, 1.30), ('Br', 'H', 1): (1.39, 1.44), ('H', 'I', 1): (1.58, 1.64),
    ('N', 'N', 1): (1.37, 1.49), ('N', 'N', 1.5): (1.30, 1.40), ('N', 'N', 2): (1.10, 1.28), ('N', 'N', 3): (1.08, 1.12),
    ('N', 'O', 1): (1.35, 1.51), ('N', 'O', 2): (1.12, 1.26),
    ('O', 'O', 1): (1.40, 1.51), ('O', 'O', 2): (1.19, 1.29),
    ('O', 'S', 1): (1.54, 1.72), ('O', 'S', 2): (1.40, 1.53), ('S', 'S', 1): (1.98, 2.14), ('S', 'S', 2): (1.87, 2.03),
    ('O', 'P', 1): (1.53, 1.69), ('O', 'P', 2): (1.42, 1.53), ('O', 'Si', 1): (1.58, 1.70),
    # RDKit writes the oxo bonds of chlorine as single bonds to a charged chlorine, so one range covers Cl-O and Cl=O
    ('Cl', 'O', 1): (1.40, 1.73), ('C', 'Fe', 1): (1.75, 2.20),
    ('F', 'F', 1): (1.40, 1.43), ('Cl', 'Cl', 1): (1.97, 2.01), ('Br', 'Br', 1): (2.26, 2.30),
}
# Everything else: the sum of the covalent radii of that bond order (elements.json) within this relative tolerance
RADII_TOLERANCE = 0.15
# Bonds that are known to lie outside the range of their formal order, with the reason
BOND_EXCEPTIONS = {
    ('dinitrogen-tetroxide', 'N', 'N'): 'the N-N bond of N2O4 is 1.78 A, far longer than a normal single bond (measured)',
    ('hydrogendifluoride', 'F', 'H'): 'symmetric three-centre hydrogen bond, F-H 1.14 A',
    ('superoxide', 'O', 'O'): 'bond order 1.5 written as a single bond, 1.35 A',
}
# Allowed sums of bond orders for species without a SMILES (coordination compounds, cages, hypervalent halides)
VALENCES = {'H': {1}, 'B': {3, 4}, 'C': {3, 4}, 'N': {3, 4}, 'O': {1, 2, 3}, 'F': {1}, 'S': {1, 2, 4, 6}, 'P': {3, 5},
            'Cl': {1, 3, 5, 7}, 'Br': {1, 3, 5}, 'I': {1, 3, 5, 7}, 'Xe': {2, 4, 6, 8}, 'Al': {3, 4, 6}}
VALENCE_EXCEPTIONS = {
    'diborane': 'two three-centre B-H-B bonds drawn as four bonds',
    'aluminium-chloride-dimer': 'bridging chlorine atoms carry a dative bond each',
    'hydrogendifluoride': 'three-centre hydrogen bond',
    'ferrocene': 'ten Fe-C contacts of the two eta-5 rings drawn as bonds',
}
METALS = {'Li', 'Be', 'Na', 'Mg', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ag', 'Pt', 'Au', 'Hg', 'Sn', 'Pb'}


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


class Checker:
    def __init__(self):
        self.violations = []

    def bad(self, where, what):
        self.violations.append('%s: %s' % (where, what))


def check_names(ck, kind, records):
    ids = [r.get('id', r.get('symbol')) for r in records]
    for i in sorted({i for i in ids if ids.count(i) > 1}, key=str):
        ck.bad(kind, 'duplicate id %s' % i)
    for lang in LANGS:
        names = [(r.get('name') or {}).get(lang) for r in records]
        for r, n in zip(records, names):
            if not isinstance(n, str) or not n.strip():
                ck.bad('%s %s' % (kind, r.get('id', r.get('symbol'))), 'missing %s name' % lang)
        for n in sorted({n for n in names if n and names.count(n) > 1}):
            ck.bad(kind, 'duplicate %s name %r' % (lang, n))


def check_elements(ck, doc):
    els = doc['elements']
    if doc.get('format') != 'velophi-elements' or len(els) != 118:
        ck.bad('elements', 'expected format velophi-elements with 118 records, found %d' % len(els))
    if [e['symbol'] for e in els] != ELEMENT_SYMBOLS[:len(els)] or [e['z'] for e in els] != list(range(1, len(els) + 1)):
        ck.bad('elements', 'symbols or atomic numbers out of order')
    check_names(ck, 'elements', els)
    present = {}
    for e in els:
        if sum(k for _, _, k in e['subshells']) != e['z']:
            ck.bad('element %s' % e['symbol'], 'subshell occupations do not sum to z')
        if not (isinstance(e['mass'], (int, float)) and e['mass'] > 0):
            ck.bad('element %s' % e['symbol'], 'mass missing')
        for k, v in e.items():
            if isinstance(v, dict):
                for k2, v2 in v.items():
                    if v2 not in (None, [], {}):
                        present['%s.%s' % (k, k2)] = present.get('%s.%s' % (k, k2), 0) + 1
            if v not in (None, [], {}):
                present[k] = present.get(k, 0) + 1
    for field in sorted(set(present)):
        top = field.split('.')[0]
        if top not in doc['sources'] and field not in doc['sources'] and top not in ('z', 'massIsMassNumber', 'configurationPredicted', 'sublimes', 'allotrope', 'densityPhase', 'name', 'radius'):
            ck.bad('elements', 'field %s has no entry in sources' % field)
    return present


def bond_range(a, b, order, radii):
    key = tuple(sorted((a, b))) + (order,)
    if key in RANGES:
        return RANGES[key]
    name = {1: 'covalent', 2: 'covalentDouble', 3: 'covalentTriple'}.get(order, 'covalent')
    ra, rb = radii[a].get(name) or radii[a]['covalent'], radii[b].get(name) or radii[b]['covalent']
    if ra is None or rb is None:
        return None
    s = (ra + rb) / 100.0
    return (s * (1 - RADII_TOLERANCE), s * (1 + RADII_TOLERANCE))


def check_molecules(ck, doc, radii):
    from rdkit import Chem, RDLogger
    RDLogger.DisableLog('rdApp.*')
    mols = doc['molecules']
    if doc.get('format') != 'velophi-molecules':
        ck.bad('molecules', 'wrong format field')
    check_names(ck, 'molecules', mols)
    categories = {c['id'] for c in doc.get('categories', [])}
    refs = doc.get('references', {})
    by_category, by_method, offenders = {}, {}, []
    for m in mols:
        mid = m.get('id', '?')
        where = 'molecule %s' % mid
        if not re.fullmatch(r'[a-z][a-z0-9-]*', str(mid)):
            ck.bad(where, 'id is not lower-case letters, digits and hyphens starting with a letter')
        by_category[m.get('category')] = by_category.get(m.get('category'), 0) + 1
        by_method[m.get('method')] = by_method.get(m.get('method'), 0) + 1
        if m.get('category') not in categories:
            ck.bad(where, 'unknown category %r' % m.get('category'))
        if m.get('method') not in METHODS:
            ck.bad(where, 'unknown method %r' % m.get('method'))
        if m.get('method') in ('vsepr', 'literature'):
            src = m.get('sources')
            if not isinstance(src, list) or any(s not in refs for s in src):
                ck.bad(where, 'sources missing or not in references')
            if m['method'] == 'literature' and not src:
                ck.bad(where, 'method literature without a citation')
        atoms, xyz, flat = m.get('atoms') or [], m.get('xyz') or [], m.get('bonds') or []
        n = len(atoms)
        if n == 0 or any(a not in ELEMENT_SYMBOLS for a in atoms):
            ck.bad(where, 'no atoms or unknown element')
            continue
        if len(xyz) != 3 * n or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in xyz):
            ck.bad(where, 'coordinates missing or not finite')
            continue
        if any(abs(sum(xyz[k::3]) / n) > 0.002 for k in range(3)):
            ck.bad(where, 'not centred on the centroid')
        if len(flat) % 3:
            ck.bad(where, 'bond list is not made of triples')
            continue
        bonds = bond_pairs(flat)
        seen = set()
        for i, j, o in bonds:
            if not (isinstance(i, int) and isinstance(j, int) and 0 <= i < j < n) or o not in (1, 2, 3, 1.5) or (i, j) in seen:
                ck.bad(where, 'bad bond %r' % ((i, j, o),))
            seen.add((i, j))
        # one connected piece
        reach, stack = {0}, [0]
        nbr = [[] for _ in range(n)]
        for i, j, _ in bonds:
            nbr[i].append(j)
            nbr[j].append(i)
        while stack:
            for k in nbr[stack.pop()]:
                if k not in reach:
                    reach.add(k)
                    stack.append(k)
        if len(reach) != n:
            ck.bad(where, 'structure is not connected (%d of %d atoms reached)' % (len(reach), n))
        # formula and charge
        try:
            counts, charge = parse_formula(m.get('formula', ''))
            if counts != count_atoms(atoms):
                ck.bad(where, 'formula %s does not match the atoms %r' % (m.get('formula'), count_atoms(atoms)))
            if charge != m.get('charge'):
                ck.bad(where, 'formula charge %+d, record charge %r' % (charge, m.get('charge')))
        except ValueError as err:
            ck.bad(where, str(err))
        q = m.get('charges')
        if q is not None:
            if len(q) != n or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in q):
                ck.bad(where, 'partial charges malformed')
            elif abs(sum(q) - m.get('charge', 0)) > 0.0006 * n + 0.002:
                ck.bad(where, 'partial charges sum to %.3f, net charge %r' % (sum(q), m.get('charge')))
        # distances
        cls = symmetry_classes(atoms, [(i, j) for i, j, _ in bonds])
        orders_of_class = {}
        for i, j, o in bonds:
            orders_of_class.setdefault(tuple(sorted((cls[i], cls[j]))), set()).add(o)
        for i, j, o in bonds:
            d = distance(xyz, i, j)
            a, b = atoms[i], atoms[j]
            if (mid,) + tuple(sorted((a, b))) in BOND_EXCEPTIONS:
                continue
            # resonance-equivalent bonds drawn with different orders in one Lewis structure: accept the whole span
            orders = orders_of_class[tuple(sorted((cls[i], cls[j])))]
            spans = [bond_range(a, b, oo, radii) for oo in orders]
            if any(s is None for s in spans):
                ck.bad(where, 'no bond-length range for %s-%s' % (a, b))
                continue
            lo, hi = min(s[0] for s in spans), max(s[1] for s in spans)
            dev = (d - (lo + hi) / 2) / ((hi - lo) / 2)
            offenders.append((abs(dev), mid, '%s-%s' % (a, b), o, round(d, 3), round(lo, 3), round(hi, 3)))
            if abs(dev) > 1 + 1e-9:
                ck.bad(where, 'bond %s%d-%s%d (order %s) is %.3f A, outside %.2f-%.2f' % (a, i, b, j, o, d, lo, hi))
        for i in range(n):
            for j in range(i + 1, n):
                d = distance(xyz, i, j)
                if d < 0.6:
                    ck.bad(where, 'atoms %d and %d are %.3f A apart' % (i, j, d))
                elif d < (1.0 if atoms[i] == atoms[j] == 'H' else 1.2) and (i, j) not in seen:
                    ck.bad(where, 'unbonded atoms %s%d and %s%d are %.3f A apart' % (atoms[i], i, atoms[j], j, d))
        # valences
        smiles = m.get('smiles')
        if smiles:
            mol = Chem.MolFromSmiles(smiles)
            if mol is None:
                ck.bad(where, 'RDKit rejects the SMILES (valence)')
                continue
            mol = Chem.AddHs(mol)
            if sum(a.GetFormalCharge() for a in mol.GetAtoms()) != m.get('charge'):
                ck.bad(where, 'net charge differs from the sum of the SMILES formal charges')
            want = sorted((tuple(sorted((b.GetBeginAtom().GetSymbol(), b.GetEndAtom().GetSymbol()))), b.GetBondTypeAsDouble()) for b in mol.GetBonds())
            have = sorted((tuple(sorted((atoms[i], atoms[j]))), float(o)) for i, j, o in bonds)
            if sorted(a.GetSymbol() for a in mol.GetAtoms()) != sorted(atoms) or want != have:
                ck.bad(where, 'atoms or bonds differ from the SMILES')
        elif mid not in VALENCE_EXCEPTIONS:
            total = [0.0] * n
            for i, j, o in bonds:
                total[i] += o
                total[j] += o
            for i, a in enumerate(atoms):
                if a in METALS:
                    if not 1 <= len(nbr[i]) <= 12:
                        ck.bad(where, 'metal %s%d has %d neighbours' % (a, i, len(nbr[i])))
                elif a not in VALENCES or round(total[i]) not in VALENCES[a] or abs(total[i] - round(total[i])) > 1e-9:
                    ck.bad(where, 'valence %g of %s%d is not allowed' % (total[i], a, i))
    offenders.sort(reverse=True)
    return by_category, by_method, offenders[:12]


def check_crystals(ck, doc):
    crystals = doc['crystals']
    if doc.get('format') != 'velophi-crystals':
        ck.bad('crystals', 'wrong format field')
    check_names(ck, 'crystals', crystals)
    closest = []
    for c in crystals:
        where = 'crystal %s' % c.get('id')
        cell = [c.get(k) for k in ('a', 'b', 'c', 'alpha', 'beta', 'gamma')]
        if not all(isinstance(v, (int, float)) and math.isfinite(v) and v > 0 for v in cell):
            ck.bad(where, 'cell parameters missing')
            continue
        if c.get('system') not in SYSTEMS:
            ck.bad(where, 'unknown crystal system %r' % c.get('system'))
            continue
        ideal = SYSTEMS[c['system']](c)
        if any(abs(p - q) > 1e-9 for p, q in zip(cell, ideal)):
            ck.bad(where, 'cell parameters do not fit the %s system' % c['system'])
        if not isinstance(c.get('source'), str) or len(c['source']) < 20:
            ck.bad(where, 'no citation')
        basis = c.get('basis') or []
        if not basis:
            ck.bad(where, 'no atoms')
            continue
        m = cell_matrix(*cell)
        for el, *f in basis:
            if el not in ELEMENT_SYMBOLS or len(f) != 3 or not all(isinstance(v, (int, float)) and 0 <= v < 1 for v in f):
                ck.bad(where, 'bad basis atom %r' % ([el] + f,))
        dmin = None
        for i in range(len(basis)):
            for j in range(i, len(basis)):
                for da in (-1, 0, 1):
                    for db in (-1, 0, 1):
                        for dc in (-1, 0, 1):
                            if i == j and da == db == dc == 0:
                                continue
                            v = cartesian(m, (basis[j][1] + da - basis[i][1], basis[j][2] + db - basis[i][2], basis[j][3] + dc - basis[i][3]))
                            d = math.sqrt(sum(x * x for x in v))
                            if dmin is None or d < dmin:
                                dmin = d
        closest.append((round(dmin, 3), c['id']))
        if dmin < 0.5:
            ck.bad(where, 'two atoms of the cell are %.3f A apart' % dmin)
        try:
            counts, _ = parse_formula(c.get('formula', ''))
            have = count_atoms([b[0] for b in basis])
            ratios = {have[el] / counts[el] for el in have if el in counts}
            if set(have) - set(counts) or len(ratios) != 1:
                ck.bad(where, 'cell content %r is not a multiple of %s' % (have, c.get('formula')))
        except ValueError as err:
            ck.bad(where, str(err))
    return sorted(closest)[:3]


def main():
    paths = {k: os.path.join(DATA_DIR, k + '.json') for k in TARGETS}
    docs = {k: load_json(p) for k, p in paths.items()}
    ck = Checker()
    present = check_elements(ck, docs['elements'])
    radii = {e['symbol']: e['radius'] for e in docs['elements']['elements']}
    by_category, by_method, offenders = check_molecules(ck, docs['molecules'], radii)
    closest = check_crystals(ck, docs['crystals'])
    counts = {k: len(docs[k][k]) for k in TARGETS}
    for k, target in TARGETS.items():
        if counts[k] < target:
            ck.bad(k, '%d records, target %d' % (counts[k], target))

    report = {
        'format': 'velophi-chem-data-report',
        'files': {k + '.json': {'sha256': sha256(p), 'bytes': os.path.getsize(p)} for k, p in sorted(paths.items())},
        'counts': counts,
        'targets': TARGETS,
        'moleculesByCategory': dict(sorted(by_category.items())),
        'moleculesByMethod': dict(sorted(by_method.items())),
        'atomsInMolecules': sum(len(m['atoms']) for m in docs['molecules']['molecules']),
        'largestMolecule': max(len(m['atoms']) for m in docs['molecules']['molecules']),
        'elementFieldsPresent': dict(sorted(present.items())),
        'bondsNearestToTheirLimits': [{'molecule': o[1], 'bond': o[2], 'order': o[3], 'length': o[4], 'min': o[5], 'max': o[6]} for o in offenders],
        'closestAtomsInCrystals': [{'crystal': c, 'distance': d} for d, c in closest],
        'violations': ck.violations,
    }
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    with open(REPORT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(report, ensure_ascii=False, indent=1) + '\n')

    print('elements %(elements)d, molecules %(molecules)d, crystals %(crystals)d' % counts)
    print('molecules by method: ' + ', '.join('%s %d' % kv for kv in sorted(by_method.items())))
    print('molecules by category: ' + ', '.join('%s %d' % kv for kv in sorted(by_category.items())))
    print('element fields present: ' + ', '.join('%s %d' % kv for kv in sorted(present.items())))
    print('bonds nearest to their limits (|deviation| in half-widths of the range):')
    for o in offenders:
        print('  %-28s %-6s order %-3s %.3f A in %.2f-%.2f  (%.2f)' % (o[1], o[2], o[3], o[4], o[5], o[6], o[0]))
    print('sizes: ' + ', '.join('%s %d bytes' % (k, v['bytes']) for k, v in report['files'].items()))
    if ck.violations:
        print('%d VIOLATIONS' % len(ck.violations))
        for v in ck.violations:
            print('  ' + v)
        sys.exit(1)
    print('no violations; report written to %s' % os.path.relpath(REPORT, ROOT))


if __name__ == '__main__':
    main()
