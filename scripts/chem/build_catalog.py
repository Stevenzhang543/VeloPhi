"""Build the chemistry catalogue src/chem/data/catalog.json (`velophi-chemcat` 1; 26.64, D262, D263).

  python -I scripts/chem/build_catalog.py            # validate, write the product, print the counts
  python -I scripts/chem/build_catalog.py --check    # validate, rebuild in memory and compare with the file on disk

Reads   scripts/chem/catalog/substances.json   species outside the aqueous network and catalogue data of network solids
        scripts/chem/catalog/thermo.json       enthalpies of formation of the components of the network
        scripts/chem/catalog/forms.json        forms of solids, the solids that precipitate
        scripts/chem/catalog/solids_review.tsv the classification of every network solid (audit of forms.precipitates)
        scripts/chem/catalog/display.json      formulas, names and appearance of network species
        scripts/chem/catalog/reagents.json     the shelf
        scripts/chem/catalog/{spectra,flames,reactions,couples}.json   sections of other packages, merged as they are
        scripts/chem/catalog/needed_substances.txt   (optional) ids another package still waits for
        scripts/chem/catalog/nasa298.json      (optional) Hf, S, cp at 298.15 K from the NASA Glenn polynomials; without
                                               it the same numbers are evaluated here from Cantera's data files
        src/chem/data/aqueous.json             the aqueous network (ids, compositions, charges, molar masses)
        src/chem/data/elements.json            atomic weights; density, melting and boiling point of the elements
Writes  src/chem/data/catalog.json             same inputs, same bytes

The source tables are the data; this script only expands, checks and merges them. It stops with a list of violations
(exit code 1) when: an id is defined twice; a referenced species is neither in the network nor a substance; a
substance repeats the composition and phase of a network species; a `dissolves` or a recipe does not balance in
elements or charge; a solubility table is not ordered in temperature or not shaped as its record says (rising by
default, `solShape` max or decreasing where the chemistry is so); a name lacks one of the three languages or is used
twice in a language within a section; a network solid is not classified in solids_review.tsv or the precipitates
differ from it; a component has no row in thermo.json; a network species that needs a display entry has none; a
labelled molarity is not reproduced by recipe and density; a count is below its target (D260).
An id that only needed_substances.txt knows as a species still wanted in the network (or of the electrochemical
series only) is *pending*: records of the merged sections that need it are left out of the product and listed under
`pending`, as are indicator solutions whose indicator is not in the network yet.
"""
import hashlib
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
CAT = os.path.join(HERE, 'catalog')
DATA = os.path.join(ROOT, 'src', 'chem', 'data')
OUT = os.path.join(DATA, 'catalog.json')

T0 = 298.15
R_GAS = 8.314462618
LN10 = math.log(10.0)
RHO_WATER_20 = 0.9982            # g/mL, the density estimate of a dilute solution starts from it
TARGETS = {'substances': 150, 'reagents': 200}
LANGS = ('zh', 'en', 'de')
PHASES = ('s', 'l', 'g', 'aq')
TEXTURES = ('powder', 'crystal', 'floc', 'gel', 'metal', 'liquid')
GROUPS = ('acid', 'base', 'saltSolution', 'solidSalt', 'metal', 'oxide', 'nonmetal', 'indicator', 'organic', 'gas', 'solvent')
HAZARDS = ('corrosive', 'toxic', 'flammable', 'oxidiser', 'irritant', 'environment')
CLASSES = ('precipitate', 'reagent-only', 'mineral')
NASA_SRC = 'NASA Glenn via Cantera'
MERGED = ('spectra', 'flames', 'reactions', 'couples')     # sections owned by other packages
META = ('format', 'version', 'note', 'about', 'sources')
EMPTY = {'spectra': {}, 'spectraSrc': {}, 'flames': {}, 'reactions': [], 'dissolution': {}, 'couples': []}

bad = []       # violations
notes = []     # warnings printed with the summary


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def num(x, digits):
    """Rounded float without a negative zero; integers stay integers so the text does not grow a `.0`."""
    v = round(float(x), digits)
    if not math.isfinite(v):
        raise ValueError('non-finite number: %r' % (x,))
    if v == 0:
        return 0
    return int(v) if v == int(v) and abs(v) < 1e15 else v


# ---------------------------------------------------------------- formulas

_TOKEN = re.compile(r'([A-Z][a-z]?)|(\d+(?:\.\d+)?)|([()\[\]])')


def parse_group(text, weights):
    stack, opened, last = [{}], [], None
    pos = 0
    while pos < len(text):
        m = _TOKEN.match(text, pos)
        if not m:
            raise ValueError('bad character %r in formula %r' % (text[pos], text))
        pos = m.end()
        sym, count, bracket = m.groups()
        if sym:
            if sym not in weights:
                raise ValueError('unknown element %r in formula %r' % (sym, text))
            last = {sym: 1.0}
            _add(stack[-1], last, 1.0)
        elif count:
            if last is None:
                raise ValueError('count without a group in formula %r' % text)
            _add(stack[-1], last, float(count) - 1.0)
            last = None
        elif bracket in '([':
            opened.append(bracket)
            stack.append({})
            last = None
        else:
            if not opened or opened.pop() != {')': '(', ']': '['}[bracket]:
                raise ValueError('unbalanced brackets in formula %r' % text)
            last = stack.pop()
            _add(stack[-1], last, 1.0)
    if opened:
        raise ValueError('unbalanced brackets in formula %r' % text)
    return stack[0]


def _add(into, group, times):
    for k, v in group.items():
        into[k] = into.get(k, 0.0) + v * times


def parse_formula(text, weights):
    """Composition of a neutral formula; `:` separates water of crystallisation and the like (`CuSO4:5H2O`,
    `CaSO4:0.5H2O`), the part after it may start with a multiplier."""
    comp = {}
    for i, part in enumerate(text.split(':')):
        m = re.match(r'(\d+(?:\.\d+)?)(?=[A-Z(\[])', part) if i else None
        times = float(m.group(1)) if m else 1.0
        _add(comp, parse_group(part[m.end():] if m else part, weights), times)
    return {k: comp[k] for k in sorted(comp)}


def molar_mass(comp, weights):
    return sum(weights[e] * n for e, n in comp.items())


def same_comp(a, b, tol=1e-6):
    return all(abs(a.get(k, 0.0) - b.get(k, 0.0)) <= tol for k in set(a) | set(b))


def clean_comp(comp):
    return {k: num(v, 6) for k, v in comp.items() if abs(v) > 1e-9}


# ---------------------------------------------------------------- the network

class Network:
    def __init__(self, doc):
        self.species = {s['id']: s for s in doc['species']}
        self.components = list(doc['components'])
        self.solids = [s['id'] for s in doc['species'] if s['phase'] == 's']
        self.gases = [s['id'] for s in doc['species'] if s['phase'] == 'g']

    def delta_h_formation(self, sid):
        """Enthalpy of the formation reaction from the components at 298.15 K, kJ/mol (the engine's formula)."""
        a = self.species[sid].get('logK') or [0.0] * 6
        dlog = a[1] - a[2] / (T0 * T0) + a[3] / (T0 * LN10) - 2.0 * a[4] / (T0 ** 3) + 2.0 * a[5] * T0
        return R_GAS * T0 * T0 * LN10 * dlog / 1000.0


# ---------------------------------------------------------------- NASA values

class Nasa:
    """Hf (kJ/mol), S and cp (J/(mol K)) at 298.15 K of a NASA Glenn species. nasa298.json is used when it exists and
    carries the species; otherwise the polynomials shipped with Cantera are evaluated (fits that start at 300 K are
    extrapolated by 1.85 K, which changes Hf by less than 0.01 kJ/mol against the JANAF value)."""

    def __init__(self):
        self.table = None
        self.cantera = None
        self.used_file = False
        self.used_cantera = False
        path = os.path.join(CAT, 'nasa298.json')
        if os.path.exists(path):
            doc = load(path)
            rows = doc.get('species', doc) if isinstance(doc, dict) else doc
            if isinstance(rows, list):
                rows = {r.get('name') or r.get('id'): r for r in rows if isinstance(r, dict)}
            self.table = {k: v for k, v in rows.items() if isinstance(v, dict) and 'Hf' in v}

    def get(self, name):
        if self.table is not None and name in self.table:
            r = self.table[name]
            self.used_file = True
            return num(r['Hf'], 3), (num(r['S'], 3) if r.get('S') is not None else None), (num(r['cp'], 3) if r.get('cp') is not None else None)
        if self.cantera is None:
            try:
                import cantera as ct
            except ImportError:
                raise SystemExit('build_catalog.py needs the Cantera package (or scripts/chem/catalog/nasa298.json) for the substances that name a NASA species')
            self.cantera = {}
            self.version = ct.__version__
            for f in ('nasa_condensed.yaml', 'nasa_gas.yaml'):
                for s in ct.Species.list_from_file(f):
                    self.cantera.setdefault(s.name, s)
        s = self.cantera.get(name)
        if s is None:
            return None
        th = s.thermo
        if not (th.min_temp - 2.0 <= T0 <= th.max_temp):
            bad.append('NASA species %s is not valid at 298.15 K (%.2f … %.2f K)' % (name, th.min_temp, th.max_temp))
            return None
        self.used_cantera = True
        return num(th.h(T0) / 1e6, 3), num(th.s(T0) / 1e3, 3), num(th.cp(T0) / 1e3, 3)


# ---------------------------------------------------------------- helpers of the checks

def names_of(rec, where):
    n = rec.get('name')
    if isinstance(n, list) and len(n) == 3:
        n = dict(zip(LANGS, n))
    if not isinstance(n, dict) or any(not isinstance(n.get(l), str) or not n[l].strip() for l in LANGS):
        bad.append('%s: the name needs zh, en and de' % where)
        return {l: '' for l in LANGS}
    return {l: n[l] for l in LANGS}


def check_unique(section, entries):
    """entries: (id, key per language). The same text twice in one language within a section is a violation."""
    for lang in LANGS:
        seen = {}
        for rid, key in entries:
            k = key[lang]
            if k in seen and k:
                bad.append('%s: %s name %r is used by %s and %s' % (section, lang, k, seen[k], rid))
            seen.setdefault(k, rid)


def check_color(c, where):
    if c is None:
        return None
    if not (isinstance(c, list) and len(c) == 3 and all(isinstance(v, int) and 0 <= v <= 255 for v in c)):
        bad.append('%s: colour must be three integers 0 … 255' % where)
    return c


def shape_ok(values, shape):
    rises = [b >= a for a, b in zip(values, values[1:])]
    falls = [b <= a for a, b in zip(values, values[1:])]
    if shape == 'decreasing':
        return all(falls)
    if shape == 'max':
        peak = values.index(max(values))
        return 0 < peak < len(values) - 1 and all(rises[:peak]) and all(falls[peak:])
    return all(rises)


# ---------------------------------------------------------------- build

def build():
    net = Network(load(os.path.join(DATA, 'aqueous.json')))
    elements = load(os.path.join(DATA, 'elements.json'))['elements']
    weights = {e['symbol']: e['mass'] for e in elements}
    element = {e['symbol']: e for e in elements}
    nasa = Nasa()

    def source(name, default=None):
        path = os.path.join(CAT, name)
        if not os.path.exists(path):
            return default
        return load(path)

    # ---- substances -------------------------------------------------------------------------------------------
    sdoc = source('substances.json', {'substances': []})
    substances, overlays, display = [], [], {}
    sub = {}                         # id -> {comp, M, phase, z}
    seen = set()
    for r in sdoc['substances']:
        sid = r.get('id')
        if not sid or sid in seen:
            bad.append('substances: id %r missing or defined twice' % sid)
            continue
        seen.add(sid)
        if r.get('overlay'):
            if sid not in net.species or net.species[sid]['phase'] != 's':
                bad.append('substances: overlay %s is not a solid of the network' % sid)
                continue
            overlays.append(r)
            continue
        if sid in net.species:
            bad.append('substances: %s is a species of the network (use an overlay record to add data to it)' % sid)
            continue
        if r.get('phase') not in PHASES:
            bad.append('substances: %s has no valid phase' % sid)
            continue
        try:
            comp = parse_formula(r['formula'], weights)
        except (KeyError, ValueError) as e:
            bad.append('substances: %s: %s' % (sid, e))
            continue
        sub[sid] = {'comp': comp, 'M': molar_mass(comp, weights), 'phase': r['phase'], 'z': 0}
        for n in net.species.values():
            if n['phase'] == r['phase'] and n.get('z', 0) == 0 and same_comp(n['comp'], comp):
                bad.append('substances: %s repeats the composition and phase of the network species %s' % (sid, n['id']))

    def known(i):
        return i in net.species or i in sub

    def comp_of(i):
        return net.species[i]['comp'] if i in net.species else sub[i]['comp']

    def mass_of(i):
        return net.species[i]['M'] if i in net.species else sub[i]['M']

    def charge_of(i):
        return net.species[i].get('z', 0) if i in net.species else 0

    def balance(target_comp, parts, where):
        """Σ ν·comp(part) must equal target_comp, Σ ν·z must be zero."""
        missing = [i for i in parts if not known(i)]
        if missing:
            bad.append('%s: unknown species %s' % (where, ', '.join(missing)))
            return False
        total, z = {}, 0.0
        for i, nu in parts.items():
            _add(total, comp_of(i), nu)
            z += nu * charge_of(i)
        ok = True
        if target_comp is not None and not same_comp(total, target_comp):
            diff = {k: round(total.get(k, 0) - target_comp.get(k, 0), 6) for k in sorted(set(total) | set(target_comp)) if abs(total.get(k, 0) - target_comp.get(k, 0)) > 1e-6}
            bad.append('%s: elements do not balance (products minus formula: %s)' % (where, diff))
            ok = False
        if abs(z) > 1e-9:
            bad.append('%s: charge does not balance (%+g)' % (where, z))
            ok = False
        return ok

    def solubility(r, where, water_per_formula):
        pts = r.get('sol')
        if not pts:
            return None
        ts = [p[0] for p in pts]
        if any(len(p) != 2 or p[1] <= 0 for p in pts) or any(b <= a for a, b in zip(ts, ts[1:])) or ts[0] < 0 or ts[-1] > 100:
            bad.append('%s: solubility points must be [t/°C, g/100 g] with t rising within 0 … 100 and positive values' % where)
            return None
        shape = r.get('solShape', 'rising')
        if shape not in ('rising', 'max', 'decreasing') or not shape_ok([p[1] for p in pts], shape):
            bad.append('%s: the solubility table is not %s in temperature (declare solShape max or decreasing where the chemistry is so)' % (where, shape))
        out = {'points': [[num(t + 273.15, 2), p] for t, p in pts], 'src': r.get('solSrc', 'SOL'), 'entry': 'hand'}
        if shape != 'rising':
            out['shape'] = shape
        return out

    def physical(r, out):
        el = element.get(r.get('el')) if r.get('el') else None
        if r.get('el') and el is None:
            bad.append('substances: %s names the unknown element %r' % (r['id'], r['el']))
        from_elements = False
        for key, ekey in (('rho', 'density'), ('Tm', 'melt'), ('Tb', 'boil')):
            v = r.get(key)
            if v is None and el is not None and el.get(ekey) is not None:
                v = el[ekey]
                from_elements = True
            out[key] = v
        for key in ('Hfus', 'Hvap'):
            out[key] = r.get(key)
        if r.get('antoine') is not None:
            a = r['antoine']
            if not (isinstance(a, list) and len(a) == 5 and a[3] < a[4]):
                bad.append('substances: %s: antoine must be [A, B, C, Tmin, Tmax]' % r['id'])
            out['antoine'] = a
        out['Tign'] = r.get('Tign')
        hand = any(r.get(k) is not None for k in ('rho', 'Tm', 'Tb', 'Hfus', 'Hvap', 'Tign'))
        src = []
        if from_elements:
            src.append('elements.json')
        if hand:
            src.append(r.get('propSrc', 'CRC'))
        if r.get('antoine') is not None:
            src.append('NIST')
        out['propSrc'] = '; '.join(src) if src else None

    for r in sdoc['substances']:
        sid = r.get('id')
        if r.get('overlay') or sid not in sub:
            continue
        where = 'substances: %s' % sid
        info = sub[sid]
        out = {'id': sid, 'formula': r['formula'], 'comp': clean_comp(info['comp']), 'phase': r['phase'], 'M': num(info['M'], 3)}
        if r.get('nasa'):
            v = nasa.get(r['nasa'])
            if v is None:
                bad.append('%s: NASA species %r not found' % (where, r['nasa']))
                v = (None, None, None)
            out.update({'Hf': v[0], 'S': v[1], 'cp': v[2], 'src': NASA_SRC, 'entry': 'file', 'nasa': r['nasa']})
        else:
            out.update({'Hf': r.get('Hf'), 'S': r.get('S'), 'cp': r.get('cp')})
            given = any(r.get(k) is not None for k in ('Hf', 'S', 'cp'))
            if given and r.get('src') not in sdoc.get('sources', {}):
                bad.append('%s: thermodynamic values need a src that the table of sources names' % where)
            out.update({'src': r.get('src') if given else None, 'entry': 'hand' if given else None})
        physical(r, out)
        if r.get('dissolves'):
            balance(info['comp'], r['dissolves'], where + ' dissolves')
            out['dissolves'] = r['dissolves']
        sol = solubility(r, where, 0)
        if sol:
            if not r.get('dissolves'):
                bad.append('%s: a solubility table needs `dissolves`' % where)
            out['solubility'] = sol
        if r.get('Hsol') is not None:
            out['Hsol'] = r['Hsol']
        if r.get('extracts'):
            unknown = [i for i in r['extracts'] if not known(i)]
            if unknown:
                bad.append('%s extracts: unknown species %s' % (where, ', '.join(unknown)))
            out['extracts'] = r['extracts']
        if r.get('crystallises'):
            out['crystallises'] = r['crystallises']
        if r.get('note'):
            out['note'] = r['note']
        substances.append(out)
        d = {'f': r.get('f') or r['formula'], 'name': names_of(r, where)}
        if r.get('color') is not None:
            d['color'] = check_color(r['color'], where)
        if r.get('texture') is not None:
            if r['texture'] not in TEXTURES:
                bad.append('%s: unknown texture %r' % (where, r['texture']))
            d['texture'] = r['texture']
        if r['phase'] in ('s', 'l') and ('color' not in d or 'texture' not in d):
            bad.append('%s: a solid or liquid needs colour and texture' % where)
        display[sid] = d

    # Overlay records: catalogue data of a network solid (the engine attaches them to the network species)
    for r in overlays:
        sid = r['id']
        where = 'substances: overlay %s' % sid
        n = net.species[sid]
        out = {'id': sid, 'overlay': True, 'comp': n['comp'], 'phase': 's', 'M': n['M']}
        physical(r, out)
        if not r.get('dissolves') or not balance(n['comp'], r['dissolves'], where + ' dissolves'):
            if not r.get('dissolves'):
                bad.append('%s: needs `dissolves` (the engine takes the water of crystallisation from it)' % where)
        out['dissolves'] = r.get('dissolves')
        sol = solubility(r, where, 0)
        if sol:
            out['solubility'] = sol
        if r.get('crystallises'):
            out['crystallises'] = r['crystallises']
        if r.get('note'):
            out['note'] = r['note']
        for k in ('Hf', 'S', 'cp', 'Hfus', 'Hvap', 'Tign', 'antoine'):
            if out.get(k) is None:
                out.pop(k, None)
        substances.append(out)

    table_salts = {s['id'] for s in substances if s.get('solubility')}
    for s in substances:
        c = s.get('crystallises')
        if c and c not in table_salts and not (c in net.species and net.species[c]['phase'] == 's'):
            bad.append('substances: %s crystallises as %r, which is neither a table salt nor a network solid' % (s['id'], c))

    # ---- thermo -----------------------------------------------------------------------------------------------
    tdoc = source('thermo.json', {'Hf': [], 'sources': {}})
    thermo = {'Hf': {}, 'src': {}, 'entry': {}}
    rows = {}
    for r in tdoc['Hf']:
        tid = r.get('id')
        if tid in rows:
            bad.append('thermo: %s has two rows' % tid)
        rows[tid] = r
        if tid not in net.species:
            bad.append('thermo: %s is not a species of the network' % tid)
    for c in net.components:
        if c not in rows:
            bad.append('thermo: component %s has no row (write {"id": "%s"} when the value is unknown)' % (c, c))
    for tid, r in rows.items():
        if tid not in net.species:
            continue
        if r.get('from'):
            g = r['from']
            if g not in net.species or net.species[g].get('rxn') != {tid: 1} or rows.get(g, {}).get('Hf') is None:
                bad.append('thermo: %s cannot be derived from %s (needs a network species formed from it alone, with a tabulated Hf)' % (tid, g))
                continue
            thermo['Hf'][tid] = num(rows[g]['Hf'] - net.delta_h_formation(g), 2)
            thermo['src'][tid] = '%s of %s and the enthalpy of solution of the network' % (rows[g].get('src'), g)
            thermo['entry'][tid] = 'derived'
        elif r.get('Hf') is None:
            thermo['Hf'][tid] = None
        else:
            if r.get('src') not in tdoc.get('sources', {}):
                bad.append('thermo: %s needs a src that the table of sources names' % tid)
            thermo['Hf'][tid] = r['Hf']
            thermo['src'][tid] = r['src']
            thermo['entry'][tid] = 'hand'

    # ---- forms and precipitates -------------------------------------------------------------------------------
    fdoc = source('forms.json', {'forms': {}, 'precipitates': []})
    forms = {}
    for key, f in fdoc['forms'].items():
        try:
            if f['shape'] in ('sphere', 'cylinder'):
                per_mm = (6.0 if f['shape'] == 'sphere' else 4.0) / f['d']
            elif f['shape'] == 'cube':
                per_mm = 6.0 / f['a']
            elif f['shape'] == 'strip':
                per_mm = 2.0 * (f['w'] + f['t']) / (f['w'] * f['t'])
            elif f['shape'] == 'sheet':
                per_mm = 2.0 / f['t']
            else:
                raise KeyError(f['shape'])
        except (KeyError, ZeroDivisionError) as e:
            bad.append('forms: %s: cannot compute the specific area (%s)' % (key, e))
            continue
        forms[key] = num(per_mm * 1e-3, 7)      # mm²/mm³ = 1e-3 m²/cm³
    review = {}
    path = os.path.join(CAT, 'solids_review.tsv')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.rstrip('\n')
                if not line or line.startswith('#') or line.startswith('id\t'):
                    continue
                cells = line.split('\t')
                if len(cells) != 4 or cells[1] not in CLASSES or not cells[3].strip():
                    bad.append('solids_review.tsv: bad row %r' % line[:60])
                    continue
                if cells[0] in review:
                    bad.append('solids_review.tsv: %s is classified twice' % cells[0])
                review[cells[0]] = cells[1]
    for s in net.solids:
        if s not in review:
            bad.append('solids_review.tsv: the network solid %s is not classified' % s)
    for s in review:
        if s not in net.species or net.species[s]['phase'] != 's':
            bad.append('solids_review.tsv: %s is not a solid of the network' % s)
    precipitates = list(fdoc['precipitates'])
    if len(set(precipitates)) != len(precipitates):
        bad.append('forms: a precipitate is listed twice')
    listed, reviewed = set(precipitates), {s for s, c in review.items() if c == 'precipitate'}
    if listed != reviewed:
        bad.append('forms: precipitates differ from solids_review.tsv (only in forms.json: %s; only in the review: %s)' % (sorted(listed - reviewed), sorted(reviewed - listed)))
    forms_out = dict(forms)
    forms_out['precipitates'] = [s for s in net.solids if s in listed]

    # ---- display ----------------------------------------------------------------------------------------------
    ddoc = source('display.json', {'rows': []})
    net_display = {}
    for row in ddoc['rows']:
        if not isinstance(row, list) or len(row) < 5:
            bad.append('display: bad row %r' % (row,))
            continue
        did = row[0]
        where = 'display: %s' % did
        if did not in net.species:
            bad.append('%s is not a species of the network (substances carry their own display fields)' % where)
            continue
        if did in net_display:
            bad.append('%s has two rows' % where)
        d = {'f': row[1], 'name': names_of({'name': row[2:5]}, where)}
        if len(row) > 5 and row[5] is not None:
            d['color'] = check_color(row[5], where)
        if len(row) > 6 and row[6] is not None:
            if row[6] not in TEXTURES:
                bad.append('%s: unknown texture %r' % (where, row[6]))
            d['texture'] = row[6]
        if net.species[did]['phase'] == 's' and ('color' not in d or 'texture' not in d):
            bad.append('%s: a solid needs colour and texture' % where)
        net_display[did] = d
    wanted = list(net.components) + [s for s in net.solids if review.get(s) in ('precipitate', 'reagent-only')] + net.gases
    for w in wanted:
        if w not in net_display:
            bad.append('display: the network species %s needs an entry (component, bench solid or gas)' % w)
    all_display = {}
    for s in net.species:                       # network order first, then the substances
        if s in net_display:
            all_display[s] = net_display[s]
    all_display.update(display)
    check_unique('display', [(k, v['name']) for k, v in all_display.items()])

    # ---- reagents ---------------------------------------------------------------------------------------------
    rdoc = source('reagents.json', {})
    reagents, pending = [], []
    rseen = set()

    def reagent(rec, where):
        rid = rec['id']
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.]*', rid) or rid in rseen:
            bad.append('%s: id missing, malformed or defined twice' % where)
        rseen.add(rid)
        if rec['group'] not in GROUPS:
            bad.append('%s: unknown group %r' % (where, rec['group']))
        for h in rec['hazard']:
            if h not in HAZARDS:
                bad.append('%s: unknown hazard key %r' % (where, h))
        reagents.append(rec)

    def recipe_solution(species_per_kg, where):
        unknown = [i for i in species_per_kg if not known(i)]
        if unknown:
            bad.append('%s: unknown species %s' % (where, ', '.join(unknown)))
            return None
        z = sum(n * charge_of(i) for i, n in species_per_kg.items())
        scale = max([abs(n) for n in species_per_kg.values()] + [1e-12])
        if abs(z) > 1e-9 * scale:
            bad.append('%s: the recipe is not neutral (%+g mol of charge per kg of water)' % (where, z))
        if any(n <= 0 for n in species_per_kg.values()):
            bad.append('%s: amounts must be positive' % where)
        return {'water_kg': 1, 'species': {i: num(n, 10) for i, n in species_per_kg.items()}}

    def check_molarity(rec, per_litre, where):
        """(1000·water_kg + Σ n·M)/rho mL of the recipe hold the labelled moles."""
        sp = rec['recipe']['species']
        grams = 1000.0 + sum(n * mass_of(i) for i, n in sp.items())
        for i, c in per_litre.items():
            got = sp[i] * rec['rho'] * 1000.0 / grams
            if abs(got - c) > 1e-7 * max(c, 1e-3):
                bad.append('%s: the recipe gives %.9g mol/L of %s, the label says %.9g' % (where, got, i, c))

    def from_molarity(per_litre, rho, where):
        """Molalities from amounts per litre: the water of one litre is 1000·rho minus the mass of the solutes."""
        if any(not known(i) for i in per_litre):
            bad.append('%s: unknown species %s' % (where, ', '.join(i for i in per_litre if not known(i))))
            return None, rho, False
        solute = sum(c * mass_of(i) for i, c in per_litre.items())
        est = rho is None
        if est:
            rho = num(RHO_WATER_20 + solute / 1000.0, 4)
        water = 1000.0 * rho - solute
        if water <= 0:
            bad.append('%s: density %.4g g/mL leaves no water for %.4g g of solute per litre' % (where, rho, solute))
            return None, rho, est
        return {i: c * 1000.0 / water for i, c in per_litre.items()}, rho, est

    for fam in rdoc.get('solutions', []):
        base = fam['species']
        fam_names = names_of(fam, 'reagents: family of %s' % fam['bottles'][0]['id'])
        solute_mass = sum(nu * mass_of(i) for i, nu in base.items()) if all(known(i) for i in base) else None
        for b in fam['bottles']:
            where = 'reagents: %s' % b['id']
            if solute_mass is None:
                bad.append('%s: unknown species %s' % (where, ', '.join(i for i in base if not known(i))))
                continue
            rho, est, label, per_litre = b.get('rho'), False, b.get('label'), None
            if 'c' in b:
                per_litre = {i: nu * b['c'] for i, nu in base.items()}
                per_kg, rho, est = from_molarity(per_litre, rho, where)
                label = label or '%g mol/L' % b['c']
            elif 'w' in b:
                m = 1000.0 * b['w'] / ((1.0 - b['w']) * solute_mass)
                per_kg = {i: nu * m for i, nu in base.items()}
                label = label or '%g %%' % num(b['w'] * 100.0, 6)
            elif 'm' in b:
                per_kg = {i: nu * b['m'] for i, nu in base.items()}
                label = label or '≈%g mol/kg' % b['m']
            else:
                bad.append('%s: needs c, w or m' % where)
                continue
            if per_kg is None:
                continue
            recipe = recipe_solution(per_kg, where)
            if recipe is None:
                continue
            rec = {'id': b['id'], 'name': names_of(b, where) if b.get('name') else fam_names, 'group': fam['group'], 'kind': 'solution', 'label': label, 'recipe': recipe, 'rho': rho, 'hazard': b.get('hazard', fam.get('hazard', []))}
            if est:
                rec['rhoEst'] = True
            if b.get('beyondModel'):
                rec['beyondModel'] = True
            if per_litre:
                check_molarity(rec, per_litre, where)
            reagent(rec, where)

    for m in rdoc.get('mixed', []):
        where = 'reagents: %s' % m['id']
        rho, est, per_litre = m.get('rho'), False, None
        if 'c' in m:
            per_litre = dict(m['c'])
            per_kg, rho, est = from_molarity(per_litre, rho, where)
        else:
            per_kg = dict(m.get('m', {}))
        if per_kg is None:
            continue
        recipe = recipe_solution(per_kg, where)
        if recipe is None:
            continue
        rec = {'id': m['id'], 'name': names_of(m, where), 'group': m['group'], 'kind': 'solution', 'label': m['label'], 'recipe': recipe, 'rho': rho, 'hazard': m.get('hazard', [])}
        if est:
            rec['rhoEst'] = True
        if m.get('note'):
            rec['note'] = m['note']
        if per_litre:
            check_molarity(rec, per_litre, where)
        reagent(rec, where)

    sub_by_id = {s['id']: s for s in substances}

    def density_of(i):
        return sub_by_id.get(i, {}).get('rho')

    for p in rdoc.get('pure', []):
        where = 'reagents: %s' % p['id']
        sid = p['species']
        if not known(sid):
            bad.append('%s: unknown species %s' % (where, sid))
            continue
        phase = net.species[sid]['phase'] if sid in net.species else sub[sid]['phase']
        kind = p.get('kind') or {'s': 'solid', 'l': 'liquid', 'g': 'gas'}.get(phase)
        if kind != {'s': 'solid', 'l': 'liquid', 'g': 'gas'}.get(phase):
            bad.append('%s: kind %r does not fit the phase of %s' % (where, kind, sid))
        rec = {'id': p['id'], 'name': names_of(p, where), 'group': p['group'], 'kind': kind, 'label': all_display.get(sid, {}).get('f', sid), 'recipe': {'species': {sid: 1}}}
        if kind == 'solid':
            if p.get('form') not in forms:
                bad.append('%s: unknown form %r' % (where, p.get('form')))
            rec['form'] = p.get('form')
        else:
            rec['rho'] = density_of(sid)
        rec['hazard'] = p.get('hazard', [])
        reagent(rec, where)

    for b in rdoc.get('blends', []):
        where = 'reagents: %s' % b['id']
        parts = b.get('g') or b.get('mol') or {}
        unknown = [i for i in parts if not known(i)]
        if unknown or not parts:
            bad.append('%s: unknown species %s' % (where, ', '.join(unknown) or '(none given)'))
            continue
        amounts = {i: (v / mass_of(i) if 'g' in b else v) for i, v in parts.items()}
        if 'g' in b and abs(sum(parts.values()) - 100.0) > 1e-9:
            bad.append('%s: the masses must add up to 100 g' % where)
        rec = {'id': b['id'], 'name': names_of(b, where), 'group': b['group'], 'kind': b['kind'], 'label': b['label'], 'recipe': {'species': {i: num(n, 10) for i, n in amounts.items()}}}
        if b['kind'] == 'solid':
            if b.get('form') not in forms:
                bad.append('%s: unknown form %r' % (where, b.get('form')))
            rec['form'] = b.get('form')
        elif b['kind'] == 'liquid':
            rec['rho'] = b.get('rho')
        rec['hazard'] = b.get('hazard', [])
        if b.get('note'):
            rec['note'] = b['note']
        reagent(rec, where)

    for g in rdoc.get('gases', []):
        where = 'reagents: %s' % g['id']
        sid = g['species']
        phase = net.species[sid]['phase'] if sid in net.species else sub.get(sid, {}).get('phase')
        if phase != 'g':
            bad.append('%s: %s is not a gas of the network or of the substances' % (where, sid))
            continue
        reagent({'id': g['id'], 'name': names_of(g, where), 'group': 'gas', 'kind': 'gas', 'label': all_display.get(sid, {}).get('f', sid), 'recipe': {'species': {sid: 1}}, 'hazard': g.get('hazard', [])}, where)

    # Indicator solutions: an indicator is a component of the network once supplement_indicators.dat is built in
    def indicator_part(part, where):
        """Species per kg of water of one indicator: its component with the protons and sodium ions that neutralise
        it. Returns (species, name of the indicator when the network does not carry it)."""
        el = part['element']
        comps = [c for c in net.components if re.fullmatch(re.escape(el) + r'(?:[-+]\d*)?', c)]
        if len(comps) != 1:
            return None, el
        comp = comps[0]
        z = net.species[comp].get('z', 0)
        sodium = part.get('sodium', 0)
        protons = part.get('protons', -z - sodium)
        if z > 0 or abs(protons + sodium + z) > 1e-9 or protons < 0 or sodium < 0:
            bad.append('%s: protons %g and sodium %g do not neutralise %s' % (where, protons, sodium, comp))
            return None, None
        grams = part.get('g', part.get('gPerKg'))
        m = grams / (mass_of(comp) + protons * mass_of('H+') + sodium * mass_of('Na+'))
        out = {comp: m}
        if protons:
            out['H+'] = protons * m
        if sodium:
            out['Na+'] = sodium * m
        return out, None

    for it in rdoc.get('indicators', {}).get('items', []):
        where = 'reagents: %s' % it['id']
        per_kg, missing = dict(it.get('extra', {})), []
        for part in it.get('mix', [it]):
            got, miss = indicator_part(part, where)
            if miss:
                missing.append(miss)
            for k, v in (got or {}).items():
                per_kg[k] = per_kg.get(k, 0.0) + v
        if missing:
            pending.append({'section': 'reagents', 'id': it['id'], 'missing': missing, 'why': 'indicator not in the network yet (supplement_indicators.dat)'})
            continue
        recipe = recipe_solution(per_kg, where)
        if recipe is None:
            continue
        reagent({'id': it['id'], 'name': names_of(it, where), 'group': 'indicator', 'kind': 'solution', 'label': it['label'], 'recipe': recipe, 'rho': it.get('rho'), 'hazard': it.get('hazard', [])}, where)

    check_unique('reagents', [(r['id'], {l: r['name'][l] + ' | ' + r['label'] for l in LANGS}) for r in reagents])

    # ---- sections of other packages ---------------------------------------------------------------------------
    wanted_elsewhere = {}        # id -> kind, from needed_substances.txt
    path = os.path.join(CAT, 'needed_substances.txt')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                cells = [c.strip() for c in line.split('|')]
                if len(cells) >= 5 and not line.lstrip().startswith('#'):
                    wanted_elsewhere[cells[0]] = cells[4]
    merged, section_sources = {}, {}
    for name in MERGED:
        doc = source(name + '.json')
        if doc is None:
            continue
        if not isinstance(doc, dict):
            bad.append('%s.json: the top level must be an object' % name)
            continue
        body = {k: v for k, v in doc.items() if k not in META}
        if name not in body:
            body = {name: body}
        if isinstance(doc.get('sources'), dict):
            section_sources[name] = doc['sources']
        for k, v in body.items():
            if k in merged or k in ('substances', 'thermo', 'forms', 'display', 'reagents', 'pending', 'generator', 'counts'):
                bad.append('%s.json: the key %r is already taken by another section' % (name, k))
            merged[k] = v
    for k, v in EMPTY.items():
        merged.setdefault(k, v)

    def resolve(section, rid, ids, soft=False):
        """True when every id is known. Unknown ids another package still waits for make the record pending."""
        unknown = [i for i in ids if not known(i)]
        if not unknown:
            return True
        awaited = [i for i in unknown if wanted_elsewhere.get(i) in ('network', 'series')]
        if len(awaited) == len(unknown) or soft:
            pending.append({'section': section, 'id': rid, 'missing': unknown, 'why': 'species not in the network'})
        else:
            bad.append('%s: %s names unknown species %s' % (section, rid, ', '.join(i for i in unknown if i not in awaited)))
        return False

    if isinstance(merged.get('couples'), list):
        for c in merged['couples']:
            ids = list(c.get('ox', {})) + list(c.get('red', {}))
            resolve('couples', c.get('id'), ids, soft=c.get('bench') is False)      # couples stay: the engine skips them
    if isinstance(merged.get('reactions'), list):
        kept = []
        for r in merged['reactions']:
            rate = r.get('rate') or {}
            ids = list(r.get('eq') or {}) + list(r.get('between') or []) + list(rate.get('orders', {}) or {}) + list((r.get('needs') or {}).get('min', {}) or {})
            if isinstance(rate.get('catalyst'), str):
                ids.append(rate['catalyst'])
            if not resolve('reactions', r.get('id'), ids):
                continue
            total, z = {}, 0.0
            for i, nu in (r.get('eq') or {}).items():
                _add(total, comp_of(i), nu)
                z += nu * charge_of(i)
            if any(abs(v) > 1e-6 for v in total.values()) or abs(z) > 1e-6:
                bad.append('reactions: %s does not balance (%s, charge %+g)' % (r.get('id'), {k: round(v, 6) for k, v in total.items() if abs(v) > 1e-6}, z))
            kept.append(r)
        merged['reactions'] = kept
    if isinstance(merged.get('dissolution'), dict):
        merged['dissolution'] = {k: v for k, v in merged['dissolution'].items() if resolve('dissolution', k, [k])}
    if isinstance(merged.get('spectra'), dict):
        merged['spectra'] = {k: v for k, v in merged['spectra'].items() if resolve('spectra', k, [k], soft=True)}
    if isinstance(merged.get('flames'), dict):
        for k in merged['flames']:
            if k not in weights:
                bad.append('flames: %s is not an element' % k)

    # ---- counts and targets -----------------------------------------------------------------------------------
    own = [s for s in substances if not s.get('overlay')]
    counts = {
        'substances': len(own), 'overlays': len(substances) - len(own), 'tableSalts': len(table_salts),
        'thermoHf': sum(1 for v in thermo['Hf'].values() if v is not None), 'thermoNull': sum(1 for v in thermo['Hf'].values() if v is None),
        'forms': len(forms), 'precipitates': len(forms_out['precipitates']), 'display': len(all_display),
        'reagents': len(reagents), 'reagentsByGroup': {g: sum(1 for r in reagents if r['group'] == g) for g in GROUPS},
        'reagentsByKind': {k: sum(1 for r in reagents if r['kind'] == k) for k in ('solution', 'solid', 'liquid', 'gas')},
        'reactions': len(merged['reactions']) if isinstance(merged.get('reactions'), list) else 0,
        'couples': len(merged['couples']) if isinstance(merged.get('couples'), list) else 0,
        'pending': len(pending),
        'networkSpecies': len(net.species), 'species': len(net.species) + len(own),
    }
    for key, target in TARGETS.items():
        if counts[key] < target:
            bad.append('counts: %d %s, the target is %d (D260)' % (counts[key], key, target))

    inputs = {}
    for name in sorted(os.listdir(CAT)):
        if name.endswith('.json') or name.endswith('.tsv'):
            if name[:-5] in MERGED or name in ('substances.json', 'thermo.json', 'forms.json', 'display.json', 'reagents.json', 'solids_review.tsv', 'nasa298.json'):
                inputs['catalog/' + name] = sha256(os.path.join(CAT, name))
    inputs['aqueous.json'] = sha256(os.path.join(DATA, 'aqueous.json'))
    inputs['elements.json'] = sha256(os.path.join(DATA, 'elements.json'))
    generator = {'script': 'scripts/chem/build_catalog.py', 'inputs': inputs}
    if nasa.used_cantera:
        generator['cantera'] = nasa.version
    if nasa.used_file:
        generator['nasa298'] = True
    sources = {'substances': sdoc.get('sources', {}), 'thermo': tdoc.get('sources', {}), 'reagents': rdoc.get('sources', {})}
    sources.update(section_sources)

    product = [('format', 'velophi-chemcat'), ('version', 1), ('generator', generator), ('counts', counts), ('sources', sources),
               ('substances', substances), ('thermo', thermo), ('forms', forms_out), ('display', all_display), ('reagents', reagents), ('pending', pending)]
    product += [(k, merged[k]) for k in merged]
    return product, counts, pending


# ---------------------------------------------------------------- output

def compact(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def render(product):
    """Compact JSON with one record per line: lists of objects and the big maps break after every entry, so the file
    stays small and still diffs by line. UTF-8, LF line ends."""
    lines = ['{']
    last = len(product) - 1
    for n, (key, value) in enumerate(product):
        tail = '' if n == last else ','
        if isinstance(value, list) and value and all(isinstance(v, dict) for v in value):
            lines.append(compact(key) + ':[')
            lines += [compact(v) + (',' if i + 1 < len(value) else '') for i, v in enumerate(value)]
            lines.append(']' + tail)
        elif isinstance(value, dict) and len(value) > 12 and key not in ('counts', 'generator'):
            lines.append(compact(key) + ':{')
            items = list(value.items())
            lines += [compact(k) + ':' + compact(v) + (',' if i + 1 < len(items) else '') for i, (k, v) in enumerate(items)]
            lines.append('}' + tail)
        else:
            lines.append(compact(key) + ':' + compact(value) + tail)
    lines.append('}')
    text = '\n'.join(lines) + '\n'
    json.loads(text)
    return text


def main(argv):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    product, counts, pending = build()
    if bad:
        print('build_catalog.py: %d violation(s)' % len(bad))
        for b in bad:
            print('  - ' + b)
        return 1
    text = render(product)
    if '--check' in argv:
        with open(OUT, encoding='utf-8', newline='') as f:
            same = f.read() == text
        print('catalog.json is %s' % ('up to date' if same else 'NOT up to date: run scripts/chem/build_catalog.py'))
        if not same:
            return 1
    else:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
    c = counts
    print('catalog.json: %d bytes, sha256 %s' % (len(text.encode('utf-8')), hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]))
    print('substances %d (+ %d overlays of network solids; %d with a solubility table)' % (c['substances'], c['overlays'], c['tableSalts']))
    print('thermo.Hf %d values, %d null' % (c['thermoHf'], c['thermoNull']))
    print('forms %d, precipitates %d, display %d' % (c['forms'], c['precipitates'], c['display']))
    print('reagents %d: %s' % (c['reagents'], ', '.join('%s %d' % kv for kv in c['reagentsByGroup'].items())))
    print('           %s' % ', '.join('%s %d' % kv for kv in c['reagentsByKind'].items()))
    print('reactions %d, couples %d, species in all %d (network %d)' % (c['reactions'], c['couples'], c['species'], c['networkSpecies']))
    if pending:
        print('pending (left out or unresolved until the network carries the species): %d' % len(pending))
        for p in pending:
            print('  - %s %s: %s' % (p['section'], p['id'], ', '.join(p['missing'])))
    for n in notes:
        print('note: ' + n)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
