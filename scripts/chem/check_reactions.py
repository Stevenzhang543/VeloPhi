"""Check the declared reactions, the electrode couples, the dissolution table, the experiments map and the indicator
supplement of the chemistry catalogue (26.64, D265, D266, D270).

  python -I scripts/chem/check_reactions.py            # prints a summary, writes the report, exit code 1 on a violation
  python -I scripts/chem/check_reactions.py --table    # also prints the comparison of E° with the network

Reads   scripts/chem/catalog/reactions.json          reactions, dissolution, electrolysis
        scripts/chem/catalog/couples.json            electrode couples
        scripts/chem/catalog/experiments_map.json    the 40 guided experiments → reactions, couples, network species
        scripts/chem/catalog/needed_substances.txt   ids this package assumes of the substance catalogue and the network
        scripts/chem/catalog/substances.json         (when it exists) the substance catalogue
        scripts/chem/supplement_indicators.dat       the indicators as species of the aqueous network
        src/chem/data/aqueous.json                   the aqueous network
Writes  tests/fixtures/chem/reactions-report.json    the report the tests read (same inputs, same bytes)

A violation is: an equation that does not balance in elements or charge; a duplicate id; an id nothing defines; a rate
law with a missing parameter; an activation energy outside 0 … 400 kJ/mol; a teaching value without its basis or a
measured one without its source; a name without its three languages; a couple whose electron count does not match its
half-reaction; an E° more than 20 mV away from the value the network's own half-reactions give; an equilibrium
constant that disagrees with the two couples it names; an organic entry outside the twenty curated reactions of D272;
an experiment of D270 without a path; an indicator whose pKa lies outside its textbook transition range.
An id that only `needed_substances.txt` knows is *pending*: it is listed, not a violation (the substance catalogue and
the network are written by other hands; `--strict` turns pending ids into violations for the final run).
"""
import json, math, os, re, sys
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
CAT = os.path.join(HERE, 'catalog')
T0 = 298.15
R_GAS = 8.314462618          # J/(mol·K)
FARADAY = 96485.33212        # C/mol
NERNST = R_GAS * T0 * math.log(10.0) / FARADAY   # 0.05916 V
E0_TOLERANCE = 0.020         # V, against the network
LNK_TOLERANCE = 0.05         # in ln K, against the couples a reaction names

LAWS = {
    'none': [], 'unmodelled': [], 'instant': [],
    'mass': ['k', 'orders', 'Ea', 'Tref'],
    'surface': ['k', 'orders', 'Ea', 'Tref', 'on'],     # `on`: the solid whose area counts (the core has areas of solids only)
    'thermal': ['A', 'Ea'],
    'catalytic': ['catalyst', 'k', 'orders', 'Ea', 'Tref'],
}
CLASSES = {'redox', 'displacement', 'decomposition', 'combustion', 'organic', 'synthesis'}
CURATED = ['org%02d' % i for i in range(1, 21)]
GROUPS = {'junior': 8, 'seniorCompulsory': 9, 'seniorElective': 9, 'demo': 14}
ELEMENTS = set('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y '
               'Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi'.split())


def frac(x):
    return Fraction(str(x)).limit_denominator(100000)


def formula_counts(body):
    """Element counts of a formula: 'Ca(OH)2', 'CuSO4:5H2O', '(C17H35COO)3C3H5', 'CaSO4:0.5H2O'."""
    total = {}
    for part_i, part in enumerate(body.split(':')):
        mult = Fraction(1)
        m = re.match(r'^(\d+\.?\d*)(.*)$', part)
        if part_i > 0 and m:
            mult, part = Fraction(m.group(1)), m.group(2)
        stack = [{}]
        i = 0
        while i < len(part):
            ch = part[i]
            if ch == '(':
                stack.append({})
                i += 1
            elif ch == ')':
                i += 1
                m = re.match(r'\d+\.?\d*', part[i:])
                n = Fraction(m.group(0)) if m else Fraction(1)
                if m:
                    i += len(m.group(0))
                top = stack.pop()
                for k, v in top.items():
                    stack[-1][k] = stack[-1].get(k, 0) + v * n
            else:
                m = re.match(r'[A-Z][a-z]?', part[i:])
                if not m:
                    raise ValueError('formula: cannot read %r at %d' % (body, i))
                tok = m.group(0)
                if tok not in ELEMENTS and tok[0] in ELEMENTS:
                    tok = tok[0]
                if tok not in ELEMENTS:
                    raise ValueError('formula: %r is not an element in %r' % (tok, body))
                i += len(tok)
                m2 = re.match(r'\d+\.?\d*', part[i:])
                n = Fraction(m2.group(0)) if m2 else Fraction(1)
                if m2:
                    i += len(m2.group(0))
                stack[-1][tok] = stack[-1].get(tok, 0) + n
        if len(stack) != 1:
            raise ValueError('formula: unbalanced parentheses in %r' % body)
        for k, v in stack[0].items():
            total[k] = total.get(k, 0) + v * mult
    return total


class Book:
    """Every id the package may name: the network, the substance catalogue, and the ids only this package assumes."""

    def __init__(self):
        with open(os.path.join(ROOT, 'src', 'chem', 'data', 'aqueous.json'), encoding='utf-8') as fh:
            self.network = json.load(fh)
        self.species = {}            # id → {'comp': {el: Fraction}, 'z': Fraction, 'phase': str, 'origin': str}
        self.net = {}
        for s in self.network['species']:
            self.net[s['id']] = s
            self.species[s['id']] = {'comp': {e: frac(n) for e, n in s['comp'].items()}, 'z': frac(s.get('z', 0)), 'phase': s['phase'], 'origin': 'network'}
        self.substances_file = os.path.join(CAT, 'substances.json')
        self.has_substances = os.path.exists(self.substances_file)
        if self.has_substances:
            with open(self.substances_file, encoding='utf-8') as fh:
                doc = json.load(fh)
            rows = doc.get('substances', []) if isinstance(doc, dict) else doc
            for s in rows:
                if isinstance(s, dict) and 'id' in s and s['id'] not in self.species:
                    comp = s.get('comp') or {k: float(v) for k, v in formula_counts(s.get('formula', '')).items()}
                    self.species[s['id']] = {'comp': {e: frac(n) for e, n in comp.items()}, 'z': frac(s.get('z', 0)), 'phase': s.get('phase', 'aq'), 'origin': 'substance'}
        self.assumed = {}            # id → row of needed_substances.txt
        path = os.path.join(CAT, 'needed_substances.txt')
        self.problems = []
        if os.path.exists(path):
            with open(path, encoding='utf-8') as fh:
                for line in fh:
                    line = line.split('#', 1)[0].rstrip()
                    if not line.strip():
                        continue
                    f = [x.strip() for x in line.split('|')]
                    if len(f) < 5:
                        self.problems.append('needed_substances.txt: cannot read %r' % line)
                        continue
                    sid, formula, phase, z, kind = f[:5]
                    try:
                        comp = formula_counts(formula)
                    except ValueError as e:
                        self.problems.append('needed_substances.txt: %s: %s' % (sid, e))
                        continue
                    row = {'comp': comp, 'z': frac(z), 'phase': phase, 'kind': kind, 'formula': formula}
                    if sid in self.assumed:
                        self.problems.append('needed_substances.txt: %s is listed twice' % sid)
                    self.assumed[sid] = row
                    known = self.species.get(sid)
                    if known is None:
                        self.species[sid] = dict(row, origin='pending')
                    elif known['origin'] == 'substance':
                        mine = {e: n for e, n in comp.items() if n != 0}
                        theirs = {e: n for e, n in known['comp'].items() if n != 0}
                        if mine != theirs:
                            self.problems.append('needed_substances.txt: %s is %s here but %s in substances.json' % (sid, formula, dict((e, str(n)) for e, n in theirs.items())))

    def get(self, sid):
        return self.species.get(sid)

    def log_k(self, sid, t=T0):
        a = self.net[sid].get('logK')
        if not a:
            return 0.0
        return a[0] + a[1] * t + a[2] / t + a[3] * math.log10(t) + a[4] / (t * t) + a[5] * t * t


def side_sum(book, side, used, where, out):
    """Elements and charge of {id: ν}; unknown ids go to `out`."""
    els, z = {}, Fraction(0)
    for sid, nu in side.items():
        sp = book.get(sid)
        if sp is None:
            out.append('%s: unknown id %s' % (where, sid))
            continue
        used.setdefault(sid, set()).add(where)
        n = frac(nu)
        for e, k in sp['comp'].items():
            els[e] = els.get(e, 0) + k * n
        z += sp['z'] * n
    return {e: v for e, v in els.items() if v != 0}, z


def is_num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def three_languages(name):
    return isinstance(name, dict) and all(isinstance(name.get(k), str) and name[k].strip() for k in ('zh', 'en', 'de'))


# ---------------------------------------------------------------------------------------------------------------
# E° from the network's own half-reactions

def solve_rational(columns, target):
    """Coefficients a with Σ a_c·columns[c] = target (dicts key → Fraction), or None. Dependent columns get 0."""
    keys = sorted(set(k for c in columns for k in c) | set(target))
    rows = [[c.get(k, Fraction(0)) for c in columns] + [target.get(k, Fraction(0))] for k in keys]
    n = len(columns)
    pivots = []
    r = 0
    for col in range(n):
        p = next((i for i in range(r, len(rows)) if rows[i][col] != 0), None)
        if p is None:
            continue
        rows[r], rows[p] = rows[p], rows[r]
        pv = rows[r][col]
        rows[r] = [x / pv for x in rows[r]]
        for i in range(len(rows)):
            if i != r and rows[i][col] != 0:
                f = rows[i][col]
                rows[i] = [a - f * b for a, b in zip(rows[i], rows[r])]
        pivots.append(col)
        r += 1
    if any(all(x == 0 for x in row[:n]) and row[n] != 0 for row in rows):
        return None
    a = [Fraction(0)] * n
    for i, col in enumerate(pivots):
        a[col] = rows[i][n]
    return a


def network_e0(book, couple):
    """E° of ox + n e⁻ → red from the network's half-reactions and formation constants; None when it cannot be formed."""
    target, log_k = {}, 0.0
    for side, sign in ((couple['red'], 1), (couple['ox'], -1)):
        for sid, nu in side.items():
            s = book.net.get(sid)
            if s is None:
                return None
            nu = frac(nu) * sign
            log_k += float(nu) * book.log_k(sid)
            for comp, c in (s.get('rxn') or {sid: 1}).items():
                target[comp] = target.get(comp, Fraction(0)) + nu * frac(c)
    target['e-'] = target.get('e-', Fraction(0)) - frac(couple['n'])
    target = {k: v for k, v in target.items() if v != 0}
    columns, logs = [], []
    for c in book.network['couples']:
        col = {c['id']: Fraction(1)}
        for k, v in c['rxn'].items():
            col[k] = col.get(k, Fraction(0)) - frac(v)
        columns.append({k: v for k, v in col.items() if v != 0})
        a = c['logK']
        logs.append(a[0] + a[1] * T0 + a[2] / T0 + a[3] * math.log10(T0) + a[4] / (T0 * T0) + a[5] * T0 * T0)
    if not target:
        return None
    a = solve_rational(columns, target)
    if a is None or all(x == 0 for x in a):
        return None
    log_k += sum(float(x) * l for x, l in zip(a, logs))
    return log_k * NERNST / float(couple['n'])


# ---------------------------------------------------------------------------------------------------------------

def check_couples(book, doc, used, bad):
    table, seen = [], set()
    by_id = {}
    for c in doc.get('couples', []):
        cid = c.get('id', '?')
        where = 'couple ' + cid
        if cid in seen:
            bad.append('%s: duplicate id' % where)
        seen.add(cid)
        by_id[cid] = c
        if not (isinstance(c.get('ox'), dict) and isinstance(c.get('red'), dict) and c['ox'] and c['red']):
            bad.append('%s: ox and red are needed' % where)
            continue
        if not is_num(c.get('n')) or c['n'] <= 0 or not is_num(c.get('E0')):
            bad.append('%s: n and E0 are needed' % where)
            continue
        if not c.get('src') or c.get('entry') not in ('hand', 'network', 'computed', 'exact'):
            bad.append('%s: src and entry (hand | network | computed | exact) are needed' % where)
        if c.get('medium') not in (None, 'acid', 'base'):
            bad.append('%s: medium is acid or base' % where)
        missing = []
        ox, zo = side_sum(book, c['ox'], used, where, missing)
        red, zr = side_sum(book, c['red'], used, where, missing)
        if missing:
            bad.extend(missing)
            continue
        if ox != red:
            diff = {e: str(ox.get(e, 0) - red.get(e, 0)) for e in sorted(set(ox) | set(red)) if ox.get(e, 0) != red.get(e, 0)}
            bad.append('%s: elements do not balance (ox − red: %s)' % (where, diff))
        if zo - frac(c['n']) != zr:
            bad.append('%s: %s electrons do not match the charges (ox %s, red %s)' % (where, c['n'], zo, zr))
        e_net = network_e0(book, c)
        if e_net is not None:
            delta = c['E0'] - e_net
            table.append({'id': cid, 'E0': c['E0'], 'network': round(e_net, 4), 'delta_mV': round(delta * 1000, 1), 'entry': c.get('entry')})
            if abs(delta) > E0_TOLERANCE:
                bad.append('%s: E° %.4f V is %.1f mV away from the network (%.4f V)' % (where, c['E0'], delta * 1000, e_net))
    return table, by_id


def ln_k_from_couples(book, r, couples):
    """ln K of a reaction from the two couples it names (`via`: oxidant couple, reductant couple); None if they do not
    give its equation."""
    ox_c, red_c = couples.get(r['via'][0]), couples.get(r['via'][1])
    if ox_c is None or red_c is None:
        return None, 'via names an unknown couple'
    n1, n2 = frac(ox_c['n']), frac(red_c['n'])
    # Electrons exchanged: the least common multiple of the two electron counts (the comparison below is up to a factor)
    n = Fraction(n1.numerator * n2.numerator, math.gcd(n1.numerator, n2.numerator)) if n1.denominator == 1 and n2.denominator == 1 else n1 * n2
    a, b = n / n1, n / n2
    vec = {}
    for side, k in ((ox_c['ox'], -a), (ox_c['red'], a), (red_c['red'], -b), (red_c['ox'], b)):
        for sid, nu in side.items():
            vec[sid] = vec.get(sid, Fraction(0)) + k * frac(nu)
    vec = {k: v for k, v in vec.items() if v != 0}
    eq = {k: frac(v) for k, v in r['eq'].items() if v != 0}
    if set(vec) != set(eq):
        return None, 'the couples give %s' % {k: str(v) for k, v in sorted(vec.items())}
    ratios = {eq[k] / vec[k] for k in vec}
    if len(ratios) != 1:
        return None, 'the couples give %s' % {k: str(v) for k, v in sorted(vec.items())}
    scale = ratios.pop()
    return float(scale * n) * FARADAY * (ox_c['E0'] - red_c['E0']) / (R_GAS * T0), None


def check_reactions(book, doc, couples, used, bad):
    seen = set()
    stats = {'class': {}, 'law': {}, 'teaching': [], 'measured': [], 'hand': [], 'curated': {}, 'extensions': {}}
    for r in doc.get('reactions', []):
        rid = r.get('id', '?')
        where = 'reaction ' + rid
        if rid in seen:
            bad.append('%s: duplicate id' % where)
        seen.add(rid)
        if not three_languages(r.get('name')):
            bad.append('%s: the name needs zh, en and de' % where)
        cls = r.get('class')
        if cls not in CLASSES:
            bad.append('%s: class %r' % (where, cls))
        stats['class'][cls] = stats['class'].get(cls, 0) + 1
        rate = r.get('rate') or {}
        law = rate.get('law')
        if law not in LAWS:
            bad.append('%s: rate law %r' % (where, law))
            continue
        stats['law'][law] = stats['law'].get(law, 0) + 1
        for key in LAWS[law]:
            if key not in rate:
                bad.append('%s: the %s law needs %s' % (where, law, key))
        for key in ('k', 'A', 'Ea', 'Tref'):
            if key in rate and not is_num(rate[key]):
                bad.append('%s: rate.%s is not a number' % (where, key))
        for key in ('k', 'A', 'Tref'):
            if is_num(rate.get(key)) and rate[key] <= 0:
                bad.append('%s: rate.%s must be positive' % (where, key))
        if is_num(rate.get('Ea')) and not 0 <= rate['Ea'] <= 400:
            bad.append('%s: activation energy %s kJ/mol outside 0 … 400' % (where, rate['Ea']))
        missing = []
        eq = r.get('eq') or {}
        if eq:
            if any(not is_num(v) or v == 0 for v in eq.values()):
                bad.append('%s: a coefficient of eq is zero or not a number' % where)
            left, zl = side_sum(book, {k: -v for k, v in eq.items() if v < 0}, used, where, missing)
            right, zr = side_sum(book, {k: v for k, v in eq.items() if v > 0}, used, where, missing)
            if not missing:
                if left != right:
                    diff = {e: str(right.get(e, 0) - left.get(e, 0)) for e in sorted(set(left) | set(right)) if left.get(e, 0) != right.get(e, 0)}
                    bad.append('%s: elements do not balance (products − reactants: %s)' % (where, diff))
                if zl != zr:
                    bad.append('%s: charge does not balance (reactants %s, products %s)' % (where, zl, zr))
        elif law in ('none', 'unmodelled'):
            if not r.get('between'):
                bad.append('%s: an entry without eq names the species in between' % where)
        else:
            bad.append('%s: eq is needed' % where)
        named = dict.fromkeys(list((rate.get('orders') or {}).keys()) + list(((r.get('needs') or {}).get('min') or {}).keys()) + list(((r.get('needs') or {}).get('max') or {}).keys()) + list(r.get('between') or []))
        if 'catalyst' in rate:
            named[rate['catalyst']] = None
        for sid in named:
            if book.get(sid) is None:
                missing.append('%s: unknown id %s' % (where, sid))
            else:
                used.setdefault(sid, set()).add(where)
        bad.extend(missing)
        for key, phases in (('on', ('s',)), ('of', ('s', 'l'))):
            if key in rate:
                sp = book.get(rate[key])
                if not (rate[key] in eq and eq[rate[key]] < 0 and sp and sp['phase'] in phases):
                    bad.append('%s: rate.%s must be a %s the equation consumes' % (where, key, 'solid' if key == 'on' else 'solid or liquid'))
        for sid, n in (rate.get('orders') or {}).items():
            if not is_num(n):
                bad.append('%s: order of %s is not a number' % (where, sid))
        needs = r.get('needs') or {}
        for key in needs:
            if key not in ('Tmin', 'Tmax', 'ignite', 'light', 'min', 'max', 'unsaturated'):
                bad.append('%s: needs.%s is not a known condition' % (where, key))
        for key in ('Tmin', 'Tmax'):
            if key in needs and not (is_num(needs[key]) and 150 <= needs[key] <= 3000):
                bad.append('%s: needs.%s is a temperature in kelvin' % (where, key))
        for sid in needs.get('unsaturated', []):
            if sid not in book.net or book.net[sid]['phase'] != 's':
                bad.append('%s: needs.unsaturated names network solids (%s)' % (where, sid))
        if 'lnK' in rate:
            v = rate['lnK']
            if not (isinstance(v, list) and len(v) == 2 and all(is_num(x) for x in v)):
                bad.append('%s: lnK is [a, b] with ln K = a + b/T' % where)
            elif 'via' in r and not missing:
                want, why = ln_k_from_couples(book, r, couples)
                if want is None:
                    bad.append('%s: %s' % (where, why))
                elif abs(v[0] + v[1] / T0 - want) > LNK_TOLERANCE:
                    bad.append('%s: ln K %.3f at 25 °C, the couples %s give %.3f' % (where, v[0] + v[1] / T0, r['via'], want))
        elif 'via' in r:
            bad.append('%s: via without lnK' % where)
        has_constant = any(k in rate for k in ('k', 'A'))
        if law in ('none', 'unmodelled') and not three_languages(r.get('note')):
            bad.append('%s: an entry that does not run says why (note in zh, en, de)' % where)
        if 'note' in r and not three_languages(r['note']):
            bad.append('%s: the note needs zh, en and de' % where)
        if not isinstance(r.get('src'), str) or not r['src'].strip():
            bad.append('%s: src is needed' % where)
        if r.get('teaching'):
            if not isinstance(r.get('basis'), str) or not r['basis'].strip():
                bad.append('%s: a teaching value states its basis' % where)
            stats['teaching'].append(rid)
        elif has_constant:
            stats['measured'].append(rid)
            if r.get('entry') != 'hand':
                bad.append('%s: a measured constant says how it was entered (entry: hand)' % where)
        if r.get('entry') == 'hand':
            stats['hand'].append(rid)
        cur = r.get('curated')
        if cls == 'organic' or cur is not None:
            if cur not in CURATED and cur != 'test':
                bad.append('%s: an organic entry belongs to one of org01 … org20 or to the functional-group tests' % where)
            stats['curated'].setdefault(cur, []).append(rid)
        if not isinstance(r.get('effects', []), list):
            bad.append('%s: effects is a list of keys' % where)
        # Fields the reader of the core (catalog.rs) does not use: counted for the report
        if 'gas' in rate:
            stats['extensions'].setdefault('rate.gas', []).append(rid)
        if r.get('beyondModel'):
            stats['extensions'].setdefault('beyondModel', []).append(rid)
        if rate.get('reversible') and not (law == 'instant' and 'lnK' in rate):
            bad.append('%s: reversible belongs to an instant law with lnK' % where)
        if law == 'mass' and 'lnK' in rate:
            stats['extensions'].setdefault('lnK with a mass law', []).append(rid)
    for topic in CURATED:
        if topic not in stats['curated']:
            bad.append('reactions: no entry for the curated organic reaction %s' % topic)
    for topic, title in (doc.get('curated') or {}).items():
        if not three_languages(title):
            bad.append('reactions: curated.%s needs zh, en and de' % topic)
    for topic in CURATED:
        if topic not in (doc.get('curated') or {}):
            bad.append('reactions: curated.%s has no title' % topic)
    # The classroom order of the metals with dilute acid
    order = doc.get('activityOrder') or []
    ks = [next((r['rate'].get('k') for r in doc.get('reactions', []) if r.get('id') == rid), None) for rid in order]
    if any(k is None for k in ks):
        bad.append('reactions: activityOrder names an entry without a rate constant')
    elif any(a < b for a, b in zip(ks, ks[1:])):
        bad.append('reactions: the rate constants of activityOrder are not in descending order')
    return stats, seen


def check_dissolution(book, doc, used, bad):
    out = []
    for sid, d in (doc.get('dissolution') or {}).items():
        where = 'dissolution ' + sid
        if sid not in book.net or book.net[sid]['phase'] != 's':
            bad.append('%s: not a solid of the network' % where)
            continue
        used.setdefault(sid, set()).add(where)
        for key in ('kAcid', 'nAcid', 'EaAcid', 'kNeutral', 'EaNeutral'):
            if not is_num(d.get(key)):
                bad.append('%s: %s is needed' % (where, key))
        for key in d:
            if key.startswith('Ea') and is_num(d[key]) and not 0 <= d[key] <= 400:
                bad.append('%s: %s outside 0 … 400 kJ/mol' % (where, key))
            if key.startswith('k') and is_num(d[key]) and d[key] < 0:
                bad.append('%s: %s is negative' % (where, key))
        if not d.get('src') or d.get('entry') not in ('hand', 'read'):
            bad.append('%s: src and entry (read | hand) are needed' % where)
        out.append(sid)
    return out


def check_experiments(book, doc, reactions, couples, used, bad):
    rows = doc.get('experiments', [])
    counts = {}
    seen = set()
    for x in rows:
        xid = x.get('id', '?')
        where = 'experiment ' + xid
        if xid in seen:
            bad.append('%s: duplicate id' % where)
        seen.add(xid)
        if not three_languages(x.get('name')):
            bad.append('%s: the name needs zh, en and de' % where)
        g = x.get('group')
        counts[g] = counts.get(g, 0) + 1
        for rid in x.get('reactions', []):
            if rid not in reactions:
                bad.append('%s: unknown reaction %s' % (where, rid))
        for cid in x.get('couples', []):
            if cid not in couples:
                bad.append('%s: unknown couple %s' % (where, cid))
        for sid in x.get('network', []):
            if sid not in book.net:
                bad.append('%s: %s is not a species of the network' % (where, sid))
        for sid in x.get('substances', []):
            if book.get(sid) is None:
                bad.append('%s: unknown id %s' % (where, sid))
            else:
                used.setdefault(sid, set()).add(where)
        if not (x.get('reactions') or x.get('couples') or x.get('network')):
            if not (isinstance(x.get('noReaction'), str) and x['noReaction'].strip()):
                bad.append('%s: no reaction, couple or network path (and no noReaction reason)' % where)
    for g, n in GROUPS.items():
        if counts.get(g, 0) != n:
            bad.append('experiments: group %s has %d entries, D270 wants %d' % (g, counts.get(g, 0), n))
    if len(rows) != 40:
        bad.append('experiments: %d entries, D270 wants 40' % len(rows))
    return counts


def check_indicators(bad):
    """The indicator supplement: every species balances in its own tokens and in charge, every indicator has its
    composition in the header, and every pKa lies inside the textbook transition range written next to it."""
    path = os.path.join(HERE, 'supplement_indicators.dat')
    out = []
    if not os.path.exists(path):
        bad.append('supplement_indicators.dat is missing')
        return out
    with open(path, encoding='utf-8') as fh:
        text = fh.read()
    ligand = {}
    for m in re.finditer(r"^#\s+'(\w+)':\s*(\{[^}]*\})", text, re.M):
        try:
            ligand[m.group(1)] = json.loads(m.group(2).replace("'", '"'))
        except ValueError:
            bad.append('indicators: cannot read the composition of %s' % m.group(1))
    meta = {}
    for m in re.finditer(r'^#\s*@indicator\s+(.*)$', text, re.M):
        row = dict(kv.split('=', 1) for kv in m.group(1).split() if '=' in kv)
        meta.setdefault(row.get('element', '?'), []).append(row)
    masters, mode, eqs, cur = {}, None, [], None
    for raw in text.splitlines():
        line = raw.split('#', 1)[0].rstrip()
        if not line.strip():
            continue
        first = line.split()[0]
        if first in ('SOLUTION_MASTER_SPECIES', 'SOLUTION_SPECIES', 'PHASES', 'END'):
            mode = first
            continue
        if mode == 'SOLUTION_MASTER_SPECIES':
            f = line.split()
            masters[f[0]] = f[1]
        elif mode == 'SOLUTION_SPECIES':
            if '=' in line:
                cur = {'eq': line.strip(), 'log_k': 0.0}
                eqs.append(cur)
            elif first.lstrip('-') == 'log_k' and cur is not None:
                cur['log_k'] = float(line.split()[1])

    def parse_species(name):
        m = re.search(r'([+-])(\d*)$', name)
        z = 0
        body = name
        if m and m.start() > 0:
            z = int(m.group(2) or 1) * (1 if m.group(1) == '+' else -1)
            body = name[:m.start()]
        counts = {}
        for tok, num in re.findall(r'([A-Z][a-z]*)(\d*)', body.replace('(', '').replace(')', '')):
            counts[tok] = counts.get(tok, 0) + int(num or 1)
        return counts, z

    def side(text_):
        counts, z = {}, 0
        for term in re.split(r'\s+\+\s+', text_.strip()):
            m = re.match(r'^(\d+)\s+(\S+)$', term.strip())
            n, name = (int(m.group(1)), m.group(2)) if m else (1, term.strip())
            c, zz = parse_species(name)
            for k, v in c.items():
                counts[k] = counts.get(k, 0) + n * v
            z += n * zz
        return counts, z

    steps = {}
    for e in eqs:
        lhs, rhs = e['eq'].split('=', 1)
        if side(lhs) != side(rhs):
            bad.append('indicators: %s does not balance' % e['eq'])
        terms = [t.strip() for t in re.split(r'\s+\+\s+', lhs.strip())]
        if lhs.strip() == rhs.strip():
            continue
        el = next((k for k in masters if k in parse_species(rhs.strip())[0]), None)
        protons = next((int(re.match(r'^(\d+)\s', t).group(1)) if re.match(r'^(\d+)\s', t) else 1 for t in terms if t.split()[-1] == 'H+'), 0)
        if el:
            steps.setdefault(el, []).append((protons, e['log_k'], rhs.strip()))
    for el, master in masters.items():
        if el not in ligand:
            bad.append('indicators: no composition for %s in the header' % el)
        if el not in meta:
            bad.append('indicators: no @indicator line for %s' % el)
            continue
        cumulative = dict((p, k) for p, k, _ in steps.get(el, []))
        for row in meta[el]:
            try:
                lo, hi = (float(v) for v in row['range'].split('..'))
                pka = float(row['pKa'])
                step = int(row.get('step', 1))
            except (KeyError, ValueError):
                bad.append('indicators: @indicator line of %s needs pKa, range=lo..hi' % el)
                continue
            have = cumulative.get(step, None)
            if have is None:
                bad.append('indicators: %s has no species with %d proton(s)' % (el, step))
                continue
            stepwise = have - cumulative.get(step - 1, 0.0)
            if abs(stepwise - pka) > 1e-9:
                bad.append('indicators: %s step %d: log_k gives pKa %.3f, the @indicator line says %.3f' % (el, step, stepwise, pka))
            if not lo <= pka <= hi:
                bad.append('indicators: %s pKa %.2f outside its transition range %.1f … %.1f' % (el, pka, lo, hi))
            out.append({'element': el, 'master': master, 'name': row.get('name', ''), 'step': step, 'pKa': pka, 'range': [lo, hi], 'acid': row.get('acid', ''), 'base': row.get('base', ''), 'flag': row.get('flag', '')})
    return out


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(errors='replace')   # a console that cannot show ° or → must not stop the check
    strict = '--strict' in sys.argv
    bad = []
    book = Book()
    bad.extend(book.problems)

    def load(name):
        path = os.path.join(CAT, name)
        if not os.path.exists(path):
            bad.append('%s is missing' % name)
            return {}
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)

    rdoc, cdoc, xdoc = load('reactions.json'), load('couples.json'), load('experiments_map.json')
    used = {}
    table, couples = check_couples(book, cdoc, used, bad)
    stats, reaction_ids = check_reactions(book, rdoc, couples, used, bad)
    dissolution = check_dissolution(book, rdoc, used, bad)
    groups = check_experiments(book, xdoc, reaction_ids, couples, used, bad)
    indicators = check_indicators(bad)
    known_indicators = set(i['element'] for i in indicators)
    for x in xdoc.get('experiments', []):
        for el in x.get('indicators', []):
            if el not in known_indicators:
                bad.append('experiment %s: unknown indicator %s' % (x.get('id'), el))
    pending = sorted(sid for sid in used if book.species[sid]['origin'] == 'pending')
    unused = sorted(sid for sid in book.assumed if sid not in used)
    for sid in unused:
        bad.append('needed_substances.txt: %s is not used by any entry' % sid)
    if strict:
        bad.extend('pending id %s (%s)' % (sid, book.assumed[sid]['kind']) for sid in pending if book.assumed[sid]['kind'] != 'series')
    n_couples = len(cdoc.get('couples', []))
    n_reactions = len(rdoc.get('reactions', []))
    if n_couples < 60:
        bad.append('couples: %d entries, at least 60 are wanted' % n_couples)
    if n_reactions < 100:
        bad.append('reactions: %d entries, at least 100 are wanted' % n_reactions)
    report = {
        'format': 'velophi-chem-reactions-report', 'version': 1,
        'violations': bad,
        'counts': {'reactions': n_reactions, 'couples': n_couples, 'dissolution': len(dissolution), 'experiments': len(xdoc.get('experiments', [])),
                   'indicators': len(set(i['element'] for i in indicators)),
                   'byClass': dict(sorted((str(k), v) for k, v in stats['class'].items())), 'byLaw': dict(sorted(stats['law'].items())),
                   'teaching': len(stats['teaching']), 'measured': len(stats['measured']), 'hand': len(stats['hand']),
                   'experimentGroups': dict(sorted((str(k), v) for k, v in groups.items())),
                   'couplesByEntry': dict(sorted((e, sum(1 for c in cdoc.get('couples', []) if c.get('entry') == e)) for e in ('exact', 'hand', 'network', 'computed')))},
        'substancesFile': book.has_substances,
        'pending': [{'id': sid, 'formula': book.assumed[sid]['formula'], 'phase': book.assumed[sid]['phase'], 'kind': book.assumed[sid]['kind']} for sid in pending],
        'teaching': sorted(stats['teaching']), 'measured': sorted(stats['measured']),
        'curated': dict(sorted((str(k), sorted(v)) for k, v in stats['curated'].items())),
        'extensions': dict(sorted((k, sorted(v)) for k, v in stats['extensions'].items())),
        'e0': table,
        'indicators': indicators,
    }
    out = os.path.join(ROOT, 'tests', 'fixtures', 'chem', 'reactions-report.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print('reactions %d (teaching %d, measured %d), couples %d, dissolution %d, experiments %d, indicators %d' % (
        n_reactions, len(stats['teaching']), len(stats['measured']), n_couples, len(dissolution), len(xdoc.get('experiments', [])), report['counts']['indicators']))
    print('by class:', report['counts']['byClass'])
    print('by law:  ', report['counts']['byLaw'])
    if '--table' in sys.argv or any('away from the network' in b for b in bad):
        print('E° against the network (V):')
        for row in table:
            print('  %-24s %8.4f  network %8.4f  Δ %+6.1f mV  (%s)' % (row['id'], row['E0'], row['network'], row['delta_mV'], row['entry']))
    if pending:
        print('pending ids (%d, known only to needed_substances.txt%s):' % (len(pending), '' if book.has_substances else '; substances.json does not exist yet'))
        print('  ' + ' '.join(pending))
    for b in bad:
        print('VIOLATION', b)
    print('→', os.path.relpath(out, ROOT))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
