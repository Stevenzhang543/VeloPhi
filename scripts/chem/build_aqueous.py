"""Build the aqueous reaction network of the chemistry core from PHREEQC database files (26.64, D262).

  python -I scripts/chem/build_aqueous.py

Reads   .cache/chem-src/usgs-phreeqc3/{phreeqc.dat, wateq4f.dat, minteq.v4.dat}   (U.S. Geological Survey, PHREEQC 3)
        scripts/chem/supplement.dat                                               (hand-entered additions, each with its source)
Writes  src/chem/data/aqueous.json      the network for the Rust core (components, species, solids, gases)
        tests/fixtures/chem/velophi.dat the same network as a PHREEQC database, so the reference program computes
                                        with exactly the constants and the activity model the core uses

What it does
  1. Parses master species, aqueous species and phases: reaction, log K, ΔH, analytic expression, ion-size
     parameters of the activity model.
  2. Uncouples redox. Every oxidation state of an element that the source lists as a master species becomes a
     component of its own (Fe+2 and Fe+3, NO3-, NO2- and NH4+, SO4-2 and HS-, O2, H2 …): in the bench, electron
     transfer is a declared reaction with a rate, not an instant equilibrium (manual D264, D265). The half-reactions
     are kept in `couples` for the electrode potentials. Species whose formation still needs electrons are dropped.
  3. Rewrites every species as a formation reaction from components with one analytic expression
     log K(T) = A1 + A2·T + A3/T + A4·log10 T + A5/T² + A6·T² (a van 't Hoff line is the special case A1, A3).
  4. Merges the three files (phreeqc.dat first; a species of a later file is added when no earlier species has the
     same composition up to water) and keeps the elements and ligands of school and first-year chemistry.

The output is reproducible: the same inputs give the same bytes.
"""
import hashlib, json, math, os, re, sys
from collections import OrderedDict
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, '.cache', 'chem-src', 'usgs-phreeqc3')
LN10 = math.log(10.0)
R_KJ = 0.0083147          # kJ/(mol·K), the value PHREEQC uses
T0 = 298.15

# Standard atomic weights (IUPAC 2021 abridged), for molar masses
MASS = {'H': 1.008, 'Li': 6.94, 'B': 10.81, 'C': 12.011, 'N': 14.007, 'O': 15.999, 'F': 18.998, 'Na': 22.990, 'Mg': 24.305,
        'Al': 26.982, 'Si': 28.085, 'P': 30.974, 'S': 32.06, 'Cl': 35.45, 'K': 39.098, 'Ca': 40.078, 'Cr': 51.996,
        'Mn': 54.938, 'Fe': 55.845, 'Co': 58.933, 'Ni': 58.693, 'Cu': 63.546, 'Zn': 65.38, 'Br': 79.904, 'Rb': 85.468,
        'Sr': 87.62, 'Ag': 107.87, 'Cd': 112.41, 'Sn': 118.71, 'I': 126.90, 'Cs': 132.91, 'Ba': 137.33, 'Hg': 200.59,
        'Pb': 207.2}

# Ligands that the sources treat as elements of their own: their real composition
LIGAND = {
    'Acetate': {'C': 2, 'H': 3, 'O': 2}, 'Citrate': {'C': 6, 'H': 5, 'O': 7}, 'Edta': {'C': 10, 'H': 12, 'N': 2, 'O': 8},
    'Formate': {'C': 1, 'H': 1, 'O': 2}, 'Tartarate': {'C': 4, 'H': 4, 'O': 6}, 'Glycine': {'C': 2, 'H': 4, 'N': 1, 'O': 2},
    'Oxalate': {'C': 2, 'O': 4}, 'Thiocyanate': {'S': 1, 'C': 1, 'N': 1}, 'Thiosulfate': {'S': 2, 'O': 3},
    'Sulfite': {'S': 1, 'O': 3}, 'Hypochlorite': {'Cl': 1, 'O': 1}, 'Chlorate': {'Cl': 1, 'O': 3},
    'Perchlorate': {'Cl': 1, 'O': 4}, 'Peroxide': {'H': 2, 'O': 2}, 'Chlorine': {'Cl': 2}, 'Bromine': {'Br': 2},
    'Iodine': {'I': 2}, 'Ferricyanide': {'Fe': 1, 'C': 6, 'N': 6}, 'Ferrocyanide': {'Fe': 1, 'C': 6, 'N': 6},
    'Benzoate': {'C': 7, 'H': 5, 'O': 2}, 'Salicylate': {'C': 7, 'H': 4, 'O': 3}, 'Phthalate': {'C': 8, 'H': 4, 'O': 4},
    'Propionate': {'C': 3, 'H': 5, 'O': 2}, 'Lactate': {'C': 3, 'H': 5, 'O': 3}, 'Ethylenediamine': {'C': 2, 'H': 8, 'N': 2},
    'Methylamine': {'C': 1, 'H': 5, 'N': 1}, 'Phenolate': {'C': 6, 'H': 5, 'O': 1}, 'Ascorbate': {'C': 6, 'H': 7, 'O': 6},
    'Carbonmonoxide': {'C': 1, 'O': 1}, 'Nitricoxide': {'N': 1, 'O': 1}, 'Nitrogendioxide': {'N': 1, 'O': 2},
    'Sulfurdioxide': {'S': 1, 'O': 2},
    # Acid–base indicators (scripts/chem/supplement_indicators.dat): the composition of the base form
    'Phph': {'C': 20, 'H': 12, 'O': 4}, 'Thph': {'C': 28, 'H': 29, 'O': 4}, 'Meor': {'C': 14, 'H': 14, 'N': 3, 'O': 3, 'S': 1},
    'Mered': {'C': 15, 'H': 14, 'N': 3, 'O': 2}, 'Btb': {'C': 27, 'H': 26, 'Br': 2, 'O': 5, 'S': 1}, 'Bcg': {'C': 21, 'H': 12, 'Br': 4, 'O': 5, 'S': 1},
    'Phred': {'C': 19, 'H': 12, 'O': 5, 'S': 1}, 'Thyb': {'C': 27, 'H': 28, 'O': 5, 'S': 1}, 'Litmus': {'C': 12, 'H': 6, 'N': 1, 'O': 3},
    'Alyr': {'C': 13, 'H': 7, 'N': 3, 'O': 5}, 'Congo': {'C': 32, 'H': 22, 'N': 6, 'O': 6, 'S': 2},
}

# Elements and ligands kept (school and first-year chemistry); everything else of the sources is left out
KEEP = {'H', 'O', 'Li', 'Na', 'K', 'Rb', 'Cs', 'Mg', 'Ca', 'Sr', 'Ba', 'Al', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ag',
        'Cd', 'Sn', 'Pb', 'B', 'C', 'Si', 'N', 'P', 'S', 'F', 'Cl', 'Br', 'I'} | set(LIGAND)
# Oxidation states left out although their element is kept (never met at the bench)
DROP_STATE = {'Mn(3)', 'Mn(+3)', 'Cr(2)', 'Cr(+2)', 'Co(3)', 'Co(+3)', 'C(-4)'}
DROP_COMPONENT = {'Mn+3', 'Co+3', 'Cr+2', 'CH4'}
# Readable ids of species whose PHREEQC name mixes two states of one element
ALIAS = {'ClCl': 'Cl2', 'II2-': 'I3-'}
# Phases never offered: silicate minerals and clays beyond silica, and a few with data the sources flag as doubtful
PHASE_MAX_PARTS = 2
PHASE_ALLOW = {'Dolomite', 'Dolomite(d)', 'Huntite', 'Alunite', 'Jarosite-K', 'Struvite', 'Alum-K', 'Mohr-salt', 'Malachite', 'Azurite'}


class Fail(Exception):
    pass


# ---------------------------------------------------------------------------------------------------------------
# Formulas

TOKEN = re.compile(r'\[[^\]]+\]|[A-Z][a-z_]*')


def split_charge(name):
    """('Fe', 3) of 'Fe+3'; ('SO4', -2) of 'SO4-2'; ('H2O', 0)."""
    m = re.search(r'([+-])(\d*\.?\d*)$', name)
    if not m or m.start() == 0:
        return name, 0
    z = float(m.group(2)) if m.group(2) else 1.0
    z = int(z) if z == int(z) else z
    return name[:m.start()], z if m.group(1) == '+' else -z


def formula_counts(body):
    """Element (or ligand, or bracket token) counts of a formula without its charge: 'Ca(OH)2', 'CaSO4:2H2O'."""
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
                m = TOKEN.match(part, i)
                if not m:
                    raise Fail('formula: cannot read %r at %d' % (body, i))
                tok = m.group(0)
                i = m.end()
                m2 = re.match(r'\d+\.?\d*', part[i:])
                n = Fraction(m2.group(0)) if m2 else Fraction(1)
                if m2:
                    i += len(m2.group(0))
                stack[-1][tok] = stack[-1].get(tok, 0) + n
        if len(stack) != 1:
            raise Fail('formula: unbalanced parentheses in %r' % body)
        for k, v in stack[0].items():
            total[k] = total.get(k, 0) + v * mult
    return total


def real_elements(counts):
    """Counts over real elements: bracket tokens '[Fe3]' and ligands are expanded."""
    out = {}
    for tok, n in counts.items():
        if tok.startswith('['):
            el = re.match(r'\[([A-Z][a-z]?)', tok).group(1)
            out[el] = out.get(el, 0) + n
        elif tok in LIGAND:
            for el, k in LIGAND[tok].items():
                out[el] = out.get(el, 0) + n * k
        else:
            out[tok] = out.get(tok, 0) + n
    return out


# ---------------------------------------------------------------------------------------------------------------
# Parsing PHREEQC database files

KEYWORDS = ('SOLUTION_MASTER_SPECIES', 'SOLUTION_SPECIES', 'PHASES', 'EXCHANGE_MASTER_SPECIES', 'EXCHANGE_SPECIES',
            'SURFACE_MASTER_SPECIES', 'SURFACE_SPECIES', 'RATES', 'END', 'NAMED_EXPRESSIONS', 'PITZER', 'SIT',
            'LLNL_AQUEOUS_MODEL_PARAMETERS', 'MEAN_GAMMAS', 'CALCULATE_VALUES', 'SELECTED_OUTPUT', 'USER_PUNCH', 'KNOBS',
            'ISOTOPES', 'ISOTOPE_RATIOS', 'ISOTOPE_ALPHAS', 'SOLID_SOLUTIONS', 'TITLE', 'PRINT', 'USER_GRAPH')


def norm_name(name):
    """One spelling for a charge of one: 'Cu+1' → 'Cu+'."""
    return re.sub(r'(?<=[^0-9+-])([+-])1$', lambda m: m.group(1), name)


def parse_equation(text):
    """[(coefficient, species)] of each side of 'a A + b B = c C + d D'."""
    if '=' not in text:
        raise Fail('equation: no "=" in %r' % text)
    sides = []
    for side in text.split('=', 1):
        terms = []
        # A "+" or "-" that separates terms has a space before it; a charge sign does not
        for raw in re.split(r'\s+\+\s+', ' ' + side.strip() + ' '):
            raw = raw.strip()
            if not raw:
                continue
            m = re.match(r'^(\d+\.?\d*|\.\d+)\s*(\S.*)$', raw)
            if m and not re.match(r'^\d', m.group(2)):
                terms.append((Fraction(m.group(1)), norm_name(m.group(2).strip())))
            else:
                terms.append((Fraction(1), norm_name(raw)))
        sides.append(terms)
    return sides


def to_kj(value, unit):
    u = (unit or 'kj').lower()
    if u.startswith('kcal'):
        return value * 4.184
    if u.startswith('cal'):
        return value * 4.184e-3
    if u.startswith('j'):
        return value * 1e-3
    return value


def parse_dat(path, tag):
    masters, species, phases = [], [], []
    mode = None
    cur = None
    with open(path, encoding='latin-1') as fh:
        # ";" separates statements on one line; a comment runs to the end of the physical line
        lines = [part for raw in fh.read().splitlines() for part in raw.split('#', 1)[0].split(';')]
    pending_phase = None
    for raw in lines:
        line = raw.split('#', 1)[0].rstrip()
        if not line.strip():
            continue
        first = line.split()[0]
        if first.upper() in KEYWORDS:
            mode, cur, pending_phase = first.upper(), None, None
            continue
        if mode == 'SOLUTION_MASTER_SPECIES':
            f = line.split()
            if len(f) >= 2:
                masters.append({'element': f[0], 'species': norm_name(f[1])})
            continue
        if mode not in ('SOLUTION_SPECIES', 'PHASES'):
            continue
        s = line.strip()
        opt = s.lstrip('-').split()[0].lower() if s else ''
        is_option = s.startswith('-') or opt in ('log_k', 'logk', 'delta_h', 'deltah', 'analytic', 'analytical_expression', 'gamma', 'dw', 'vm', 'millero', 'no_check', 'mole_balance', 'erm_ddl', 'co2_llnl_gamma', 'llnl_gamma', 'activity_water', 'add_logk', 'add_constant', 't_c', 'p_c', 'omega', 'viscosity')
        if is_option and cur is not None:
            f = s.lstrip('-').split()
            vals = f[1:]
            if opt in ('log_k', 'logk'):
                cur['log_k'] = float(vals[0])
            elif opt in ('delta_h', 'deltah'):
                cur['delta_h'] = to_kj(float(vals[0]), vals[1] if len(vals) > 1 else None)
            elif opt.startswith('analytic') or opt == 'a_e' or opt == 'ae':
                a = [float(v) for v in vals[:6]]
                cur['analytic'] = a + [0.0] * (6 - len(a))
            elif opt == 'gamma':
                cur['gamma'] = [float(vals[0]), float(vals[1])]
            elif opt in ('add_logk', 'mole_balance'):
                cur['skip'] = opt
            continue
        if mode == 'SOLUTION_SPECIES':
            lhs, rhs = parse_equation(s)
            cur = {'lhs': lhs, 'rhs': rhs, 'name': rhs[0][1], 'src': tag}
            species.append(cur)
        else:
            if '=' in s:
                if pending_phase is None:
                    raise Fail('%s: phase equation without a name: %s' % (tag, s))
                lhs, rhs = parse_equation(s)
                cur = {'lhs': lhs, 'rhs': rhs, 'name': pending_phase, 'formula': lhs[0][1], 'src': tag}
                phases.append(cur)
                pending_phase = None
            else:
                pending_phase = s.split()[0]
                cur = None
    return masters, species, phases


def analytic_of(entry):
    """Analytic coefficients of an entry's own log K(T): the analytic expression if given, else van 't Hoff."""
    if entry.get('analytic'):
        return list(entry['analytic'])
    log_k = entry.get('log_k', 0.0)
    dh = entry.get('delta_h', 0.0)
    return [log_k + dh / (LN10 * R_KJ * T0), 0.0, -dh / (LN10 * R_KJ), 0.0, 0.0, 0.0]


def log_k_at(a, t):
    return a[0] + a[1] * t + a[2] / t + a[3] * math.log10(t) + a[4] / (t * t) + a[5] * t * t


# ---------------------------------------------------------------------------------------------------------------
# One database → species as formation reactions from its (uncoupled) components

def add_scaled(target, source, k):
    for name, v in source.items():
        target[name] = target.get(name, 0) + v * k
        if target[name] == 0:
            del target[name]


def reduce_database(path, tag, external=False):
    masters, species, phases = parse_dat(path, tag)
    components = OrderedDict()      # species name → {'element': 'Fe', 'state': 'Fe(+3)' or None}
    primary = {}
    for m in masters:
        el = m['element']
        if el in ('E', 'Alkalinity'):
            continue
        base = el.split('(')[0]
        if '(' not in el:
            primary[base] = m['species']
            components.setdefault(m['species'], {'element': base, 'state': None})
        else:
            if el in DROP_STATE:
                continue
            components.setdefault(m['species'], {'element': base, 'state': el})
    defs = {}
    couples = {}
    for sp in species:
        name = sp['name']
        c_self = sp['rhs'][0][0]
        vec = {}
        for c, x in sp['lhs']:
            add_scaled(vec, {x: Fraction(1)}, c / c_self)
        for c, x in sp['rhs'][1:]:
            add_scaled(vec, {x: Fraction(1)}, -c / c_self)
        a = [v / float(c_self) for v in analytic_of(sp)]
        if len(sp['lhs']) == 1 and sp['lhs'][0][1] == name:
            if sp.get('gamma') and name in components:
                components[name]['gamma'] = sp['gamma']
            continue                       # identity reaction of a master species
        entry = {'vec': vec, 'a': a, 'gamma': sp.get('gamma'), 'src': tag, 'skip': sp.get('skip')}
        if name in components:
            if 'e-' in vec:
                couples[name] = entry      # the half-reaction that tied this oxidation state to the primary one
            if sp.get('gamma'):
                components[name]['gamma'] = sp['gamma']
            continue
        if name not in defs:
            defs[name] = entry
    reduced = {}

    def reduce(name, depth=0):
        if name in reduced:
            return reduced[name]
        if depth > 40:
            raise Fail('%s: reduction of %s does not end' % (tag, name))
        d = defs[name]
        vec, a = {}, list(d['a'])
        for x, c in d['vec'].items():
            if x in components or x == 'e-':
                add_scaled(vec, {x: Fraction(1)}, c)
            elif x in defs:
                r = reduce(x, depth + 1)
                if r is None:
                    reduced[name] = None
                    return None
                add_scaled(vec, r['vec'], c)
                a = [a[i] + float(c) * r['a'][i] for i in range(6)]
            elif external:
                add_scaled(vec, {x: Fraction(1)}, c)   # defined by an earlier file: resolved when the files are merged
            else:
                reduced[name] = None       # refers to something the file never defines (or a dropped state)
                return None
        reduced[name] = {'vec': vec, 'a': a}
        return reduced[name]

    out_species = OrderedDict()
    for name, d in defs.items():
        r = reduce(name)
        if r is None or 'e-' in r['vec'] or d.get('skip'):
            continue
        out_species[name] = {'vec': r['vec'], 'a': r['a'], 'gamma': d['gamma'], 'src': tag}
    out_phases = OrderedDict()
    for ph in phases:
        if ph.get('skip'):
            continue
        c_self = ph['lhs'][0][0]
        vec, a = {}, [-(v / float(c_self)) for v in analytic_of(ph)]   # formation is the reverse of dissolution
        ok = True
        terms = [(-c / c_self, x) for c, x in ph['lhs'][1:]] + [(c / c_self, x) for c, x in ph['rhs']]
        for c, x in terms:
            if x in components or x == 'e-':
                add_scaled(vec, {x: Fraction(1)}, c)
            elif x in defs and reduce(x) is not None:
                r = reduced[x]
                add_scaled(vec, r['vec'], c)
                # Formation of the phase = −(its dissolution) + the formation of every species the dissolution names
                a = [a[i] + float(c) * r['a'][i] for i in range(6)]
            elif external:
                add_scaled(vec, {x: Fraction(1)}, c)
            else:
                ok = False
        if not ok or 'e-' in vec or ph['name'] in out_phases:
            continue
        if not external:
            # Self-check: the dissolution reaction as the source writes it, recomputed from the formation constants,
            # must give the source's own log K (a sign or a coefficient lost in the rewriting shows up here)
            def lk(x):
                return 0.0 if (x in components or x == 'e-') else log_k_at(reduced[x]['a'], T0)
            again = sum(float(c) * lk(x) for c, x in ph['rhs']) - sum(float(c) * lk(x) for c, x in ph['lhs'][1:]) - float(c_self) * log_k_at(a, T0)
            own = log_k_at(analytic_of(ph), T0)
            if abs(again - own) > 1e-6 * max(1.0, abs(own)):
                raise Fail('%s: phase %s: log K of its reaction is %.6f in the source, %.6f after rewriting' % (tag, ph['name'], own, again))
        out_phases[ph['name']] = {'vec': vec, 'a': a, 'formula': ph['formula'], 'src': tag}
    red_couples = {}
    for name, d in couples.items():
        vec, a, ok = {}, list(d['a']), True
        for x, c in d['vec'].items():
            if x in components or x == 'e-':
                add_scaled(vec, {x: Fraction(1)}, c)
            elif x in defs and reduce(x) is not None:
                add_scaled(vec, reduced[x]['vec'], c)
                a = [a[i] + float(c) * reduced[x]['a'][i] for i in range(6)]
            else:
                ok = False
        if ok:
            red_couples[name] = {'vec': vec, 'a': a, 'src': tag}
    return {'tag': tag, 'components': components, 'primary': primary, 'species': out_species, 'phases': out_phases, 'couples': red_couples}


# ---------------------------------------------------------------------------------------------------------------
# Merge

def water_free(vec):
    return tuple(sorted((k, v) for k, v in vec.items() if k != 'H2O'))


def merge(dbs):
    comps = OrderedDict()
    for name in ('H2O', 'H+'):
        comps[name] = dict(dbs[0]['components'][name], src=dbs[0]['tag'])
    species, phases, couples = OrderedDict(), OrderedDict(), OrderedDict()
    seen_sp, seen_ph = {}, {}
    notes = []
    for db in dbs:
        local = {}                         # a component of this file in terms of the merged components

        def local_expr(name):
            if name in local:
                return local[name]
            if name in comps:
                local[name] = ({name: Fraction(1)}, [0.0] * 6)
            elif name in species:          # a species of an earlier file: use that file's constant
                local[name] = (dict(species[name]['vec']), list(species[name]['a']))
            elif name in db['components']:
                comps[name] = dict(db['components'][name], src=db['tag'])
                local[name] = ({name: Fraction(1)}, [0.0] * 6)
            else:
                local[name] = None         # a reference nothing defines
            return local[name]

        def translate(vec, a):
            out, aa = {}, list(a)
            for x, c in vec.items():
                expr = local_expr(x)
                if expr is None:
                    return None, None
                e, ea = expr
                add_scaled(out, e, c)
                aa = [aa[i] + float(c) * ea[i] for i in range(6)]
            return out, aa

        for name in db['components']:
            if name not in DROP_COMPONENT:
                local_expr(name)
        for name, sp in db['species'].items():
            vec, a = translate(sp['vec'], sp['a'])
            if vec is None:
                notes.append('%s: %s refers to an undefined species' % (db['tag'], name))
                continue
            if name in comps:
                continue
            key = water_free(vec)
            if name in species or key in seen_sp:
                continue
            seen_sp[key] = name
            species[name] = {'vec': vec, 'a': a, 'gamma': sp['gamma'], 'src': sp['src']}
        for name, ph in db['phases'].items():
            vec, a = translate(ph['vec'], ph['a'])
            if vec is None:
                notes.append('%s: %s refers to an undefined species' % (db['tag'], name))
                continue
            key = tuple(sorted(vec.items()))
            # The same composition from an earlier file is the same solid under another name; within one file it
            # is another form of it (calcite and aragonite, gibbsite and the amorphous hydroxide) and is kept
            if name in phases or seen_ph.get(key, db['tag']) != db['tag']:
                continue
            seen_ph[key] = db['tag']
            phases[name] = {'vec': vec, 'a': a, 'formula': ph['formula'], 'src': ph['src']}
        for name, cp in db['couples'].items():
            if name in couples:
                continue
            # Components of the half-reaction that this merge did not meet stay out (the couple is then unusable)
            if all(x == 'e-' or local_expr(x) is not None for x in cp['vec']):
                vec, a = {}, list(cp['a'])
                for x, c in cp['vec'].items():
                    if x == 'e-':
                        add_scaled(vec, {'e-': Fraction(1)}, c)
                    else:
                        e, ea = local_expr(x)
                        add_scaled(vec, e, c)
                        a = [a[i] + float(c) * ea[i] for i in range(6)]
                couples[name] = {'vec': vec, 'a': a, 'src': cp['src']}
    return comps, species, phases, couples, notes


# ---------------------------------------------------------------------------------------------------------------
# Naming for the PHREEQC file: an uncoupled oxidation state is a bracket element, '[Fe3]', '[N-3]'

def state_token(element, state):
    v = re.search(r'\(([+-]?\d+)\)', state).group(1)
    v = v.lstrip('+')
    return '[%s%s]' % (element, v)


def rename(formula, states):
    """Replace the element symbols named in `states` (element → bracket token) in a formula or species name."""
    body, z = split_charge(formula)
    out = TOKEN.sub(lambda m: states.get(m.group(0), m.group(0)), body)
    if z == 0:
        return out
    mag = abs(z)
    return out + ('+' if z > 0 else '-') + ('' if mag == 1 else ('%g' % mag))


def fmt_num(x):
    return repr(round(x, 10)) if x != int(x) else str(int(x))


def fmt_coef(c):
    f = float(c)
    return '' if f == 1 else (('%d ' % f) if f == int(f) else ('%.10g ' % f))


def main():
    files = [('phreeqc.dat', 'phreeqc.dat'), ('wateq4f.dat', 'wateq4f.dat'), ('minteq.v4.dat', 'minteq.v4.dat')]
    # Hand-entered additions: supplement.dat first, then supplement_<topic>.dat in name order
    supplements = [os.path.join(HERE, 'supplement.dat')] + sorted(os.path.join(HERE, f) for f in os.listdir(HERE) if f.startswith('supplement_') and f.endswith('.dat'))
    dbs, hashes = [], {}
    for fname, tag in files:
        p = os.path.join(SRC, fname)
        with open(p, 'rb') as fh:
            hashes[tag] = hashlib.sha256(fh.read()).hexdigest()
        dbs.append(reduce_database(p, tag))
    for supplement in supplements:
        if os.path.exists(supplement):
            tag = os.path.basename(supplement)
            with open(supplement, 'rb') as fh:
                hashes[tag] = hashlib.sha256(fh.read().replace(bytes([13, 10]), bytes([10]))).hexdigest()
            dbs.append(reduce_database(supplement, tag, external=True))
    comps, species, phases, couples, notes = merge(dbs)

    # Which components are kept: every real element of the component is in KEEP
    def kept_component(name):
        if name in DROP_COMPONENT:
            return False
        body, _ = split_charge(name)
        try:
            els = real_elements(formula_counts(body))
        except Fail:
            return False
        return all(e in KEEP for e in els) and all(e in MASS or e in LIGAND for e in els)

    keep_c = OrderedDict((n, c) for n, c in comps.items() if kept_component(n))

    # Bracket tokens: the non-primary oxidation states of an element with several component states
    by_element = {}
    for name, c in keep_c.items():
        by_element.setdefault(c['element'], []).append(name)
    token_of = {}                              # component name → (element, token) when it is renamed
    primaries = {}
    for db in dbs:
        for el, sp in db['primary'].items():
            primaries.setdefault(el, sp)
    for el, names in by_element.items():
        if len(names) < 2 or el in LIGAND:
            continue
        for name in names:
            if name == primaries.get(el):
                continue
            st = keep_c[name]['state']
            if st:
                token_of[name] = (el, state_token(el, st))
    # H2 and O2 are states of H and O
    pq_name = {}

    def species_states(vec):
        """Element → token for a species with the given component vector; None if two states of one element mix."""
        states = {}
        seen = {}
        for x in vec:
            el = keep_c[x]['element']
            if el in ('H', 'O'):
                # Hydrogen and oxygen are in almost every species; only the elements themselves (H2, O2) are a
                # state of their own, and only when nothing else in the species carries that element
                if x in token_of:
                    others = [y for y in vec if y != x and el in real_elements(formula_counts(split_charge(pq_name[y])[0]))]
                    if others:
                        return None
                    states[el] = token_of[x][1]
                continue
            if len(by_element.get(el, [])) < 2 or el in LIGAND:
                continue
            tok = token_of[x][1] if x in token_of else el
            if seen.setdefault(el, tok) != tok:
                return None
            if x in token_of:
                states[el] = tok
        return states

    for name in keep_c:
        if name in token_of:
            el, tok = token_of[name]
            pq_name[name] = rename(name, {el: tok})
        else:
            pq_name[name] = name

    def friendly(name):
        plain = re.sub(r'\[([A-Z][a-z]?)[+-]?\d*\]', lambda m: m.group(1), name)
        return ALIAS.get(plain, plain)

    ident = {}

    def give_id(name):
        fid = friendly(name)
        if fid in ident.values() and ident.get(name) != fid:
            raise Fail('two species share the id %s' % fid)
        ident[name] = fid
        return fid

    for name in keep_c:
        give_id(name)

    def element_comp(pq):
        body, z = split_charge(pq)
        counts = real_elements(formula_counts(body))
        return OrderedDict((k, float(v) if v != int(v) else int(v)) for k, v in sorted(counts.items())), z

    def molar_mass(comp):
        return round(sum(MASS[e] * n for e, n in comp.items()), 4)

    out_species = []
    dropped = []
    order = {n: i for i, n in enumerate(keep_c)}

    def vec_json(vec):
        return OrderedDict((ident[x], float(c) if c.denominator != 1 else int(c)) for x, c in sorted(vec.items(), key=lambda kv: order[kv[0]]))

    def check_balance(name, pq, vec, is_phase_formula=None):
        """The species' elements and charge equal those of its components (a wrong rename shows up here)."""
        comp, z = element_comp(is_phase_formula or pq)
        total, zt = {}, 0
        for x, c in vec.items():
            cx, zx = element_comp(pq_name[x])
            for e, n in cx.items():
                total[e] = total.get(e, 0) + Fraction(n).limit_denominator(1000) * c
            zt += Fraction(zx).limit_denominator(1000) * c
        total = {e: n for e, n in total.items() if n != 0}
        mine = {e: Fraction(n).limit_denominator(1000) for e, n in comp.items() if n != 0}
        return mine == total and (is_phase_formula is not None or Fraction(z).limit_denominator(1000) == zt)

    for name, c in keep_c.items():
        comp, z = element_comp(pq_name[name])
        out_species.append(OrderedDict(id=ident[name], pq=pq_name[name], phase='aq', z=z, comp=comp, M=molar_mass(comp), component=True,
                                       gamma=c.get('gamma'), src=c['src']))
    for name, sp in species.items():
        if any(x not in keep_c for x in sp['vec']):
            continue
        st = species_states(sp['vec'])
        if st is None:
            dropped.append((name, 'mixed oxidation states'))
            continue
        pq = rename(name, st)
        try:
            comp, z = element_comp(pq)
        except Fail as e:
            dropped.append((name, str(e)))
            continue
        if not all(e in MASS for e in comp):
            continue
        if not check_balance(name, pq, sp['vec']):
            dropped.append((name, 'formula does not match its reaction'))
            continue
        out_species.append(OrderedDict(id=give_id(name), pq=pq, phase='aq', z=z, comp=comp, M=molar_mass(comp), rxn=vec_json(sp['vec']),
                                       logK=[round(v, 9) for v in sp['a']], gamma=sp['gamma'], src=sp['src']))
    out_phases = []
    for name, ph in phases.items():
        if any(x not in keep_c for x in ph['vec']):
            continue
        parts = [x for x in ph['vec'] if x not in ('H2O', 'H+')]
        if len(parts) > PHASE_MAX_PARTS and name not in PHASE_ALLOW:
            continue
        if any(keep_c[x]['element'] == 'Si' for x in parts) and len(parts) > 1:
            continue
        st = species_states(ph['vec'])
        if st is None:
            dropped.append((name, 'mixed oxidation states'))
            continue
        formula = rename(ph['formula'], st)
        try:
            comp, _ = element_comp(formula)
        except Fail as e:
            dropped.append((name, str(e)))
            continue
        if not all(e in MASS for e in comp):
            continue
        if not check_balance(name, formula, ph['vec'], is_phase_formula=formula):
            dropped.append((name, 'formula does not match its reaction'))
            continue
        is_gas = name.endswith('(g)')
        # A solid named like a dissolved species (Cd(OH)2) gets the phase suffix in its id; PHREEQC keeps the two apart
        pid = name if name not in ident.values() else name + '(s)'
        out_phases.append(OrderedDict(id=pid, pq=name, formula=formula, phase='g' if is_gas else 's', z=0, comp=comp, M=molar_mass(comp),
                                      rxn=vec_json(ph['vec']), logK=[round(v, 9) for v in ph['a']], src=ph['src']))
    out_couples = []
    for name, cp in couples.items():
        if name not in keep_c or any(x != 'e-' and x not in keep_c for x in cp['vec']):
            continue
        vec = OrderedDict((ident.get(x, x), float(c) if c.denominator != 1 else int(c)) for x, c in sorted(cp['vec'].items(), key=lambda kv: order.get(kv[0], -1)))
        out_couples.append(OrderedDict(id=ident[name], rxn=vec, logK=[round(v, 9) for v in cp['a']], src=cp['src']))

    doc = OrderedDict(
        format='velophi-chemdb', version=1,
        generator=OrderedDict(script='scripts/chem/build_aqueous.py', sources=hashes),
        notice=('Derived data, not an original USGS file: rewritten by the VeloPhi project (scripts/chem/build_aqueous.py) from the PHREEQC 3 database '
                'files phreeqc.dat, wateq4f.dat and minteq.v4.dat of the U.S. Geological Survey and from hand-entered supplements. Modifications: redox states '
                'uncoupled into separate components, every species rewritten as a formation reaction with one analytic log K(T), the three files merged, '
                'a subset of elements kept. The original distribution: https://www.usgs.gov/software/phreeqc-version-3 ; its User Rights Notice: '
                'scripts/chem/licenses/USGS-PHREEQC-NOTICE.txt. Parkhurst and Appelo (2013), USGS Techniques and Methods 6-A43.'),
        components=[ident[n] for n in keep_c],
        species=out_species + out_phases,
        couples=out_couples,
    )
    os.makedirs(os.path.join(ROOT, 'src', 'chem', 'data'), exist_ok=True)
    out_json = os.path.join(ROOT, 'src', 'chem', 'data', 'aqueous.json')
    with open(out_json, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(doc, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')

    # The same network as a PHREEQC database
    L = ['# VeloPhi aqueous network (generated by scripts/chem/build_aqueous.py; do not edit).',
         '# NOTICE: derived data, not an original USGS file. Rewritten by the VeloPhi project from phreeqc.dat, wateq4f.dat and',
         '# minteq.v4.dat of PHREEQC 3 (U.S. Geological Survey) and from hand-entered supplements; see the notice field of',
         '# src/chem/data/aqueous.json and scripts/chem/licenses/USGS-PHREEQC-NOTICE.txt.',
         '# Every species is a formation reaction from the components with one analytic expression for log K(T).',
         '# Oxidation states are uncoupled: a state that is a component of its own is a bracket element.',
         'SOLUTION_MASTER_SPECIES']
    seen_el = set()
    for name, c in keep_c.items():
        if name in ('H2O', 'H+'):
            continue
        el = token_of[name][1] if name in token_of else c['element']
        comp, _ = element_comp(pq_name[name])
        if el in seen_el:
            continue
        seen_el.add(el)
        L.append('%s\t%s\t0\t%s\t%s' % (el, pq_name[name], fmt_num(molar_mass(comp)), fmt_num(molar_mass(comp))))
    # PHREEQC itself needs the water couples H2 / H+ and O2 / H2O (they set the pe scale; the amounts stay negligible)
    L[7:7] = ['H\tH+\t-1\tH\t1.008', 'H(0)\tH2\t0\tH', 'H(1)\tH+\t-1\t0', 'E\te-\t0\t0\t0', 'O\tH2O\t0\tO\t15.999', 'O(0)\tO2\t0\tO', 'O(-2)\tH2O\t0\t0']
    pq_of_id = {ident[n]: pq_name[n] for n in keep_c}
    L.append('SOLUTION_SPECIES')
    L += ['H+ = H+', '\t-gamma 9 0', 'e- = e-', 'H2O = H2O', '2 H2O = O2 + 4 H+ + 4 e-', '\t-log_k -86.08', '\t-delta_h 134.79 kcal',
          '2 H+ + 2 e- = H2', '\t-log_k -3.15', '\t-delta_h -1.759 kcal']
    for sp in out_species:
        if sp.get('component'):
            if sp['id'] in ('H2O', 'H+'):
                continue
            L.append('%s = %s' % (sp['pq'], sp['pq']))
        else:
            lhs = ' + '.join('%s%s' % (fmt_coef(Fraction(c).limit_denominator(1000)), pq_of_id[x]) for x, c in sp['rxn'].items() if c > 0)
            neg = ' + '.join('%s%s' % (fmt_coef(Fraction(-c).limit_denominator(1000)), pq_of_id[x]) for x, c in sp['rxn'].items() if c < 0)
            L.append('%s = %s%s' % (lhs, sp['pq'], (' + ' + neg) if neg else ''))
            L.append('\t-analytic ' + ' '.join(repr(v) for v in sp['logK']))
        if sp.get('gamma'):
            L.append('\t-gamma %s %s' % (fmt_num(sp['gamma'][0]), fmt_num(sp['gamma'][1])))
    L.append('PHASES')
    for ph in out_phases:
        L.append(ph['pq'])
        rhs = ' + '.join('%s%s' % (fmt_coef(Fraction(c).limit_denominator(1000)), pq_of_id[x]) for x, c in ph['rxn'].items() if c > 0)
        neg = ' + '.join('%s%s' % (fmt_coef(Fraction(-c).limit_denominator(1000)), pq_of_id[x]) for x, c in ph['rxn'].items() if c < 0)
        L.append('\t%s%s = %s' % (ph['formula'], (' + ' + neg) if neg else '', rhs))
        L.append('\t-analytic ' + ' '.join(repr(-v) for v in ph['logK']))
    L.append('END')
    os.makedirs(os.path.join(ROOT, 'tests', 'fixtures', 'chem'), exist_ok=True)
    with open(os.path.join(ROOT, 'tests', 'fixtures', 'chem', 'velophi.dat'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(L) + '\n')

    # Debye–Hückel parameters of water, 0 … 100 °C in steps of 1 K at 1 atm, as PHREEQC computes them (relative
    # permittivity after Bradley and Pitzer 1979, density after Wagner and Pruß 2002): the activity model of the core
    # reads this table, so both programs use the same A(T) and B(T)
    import phreeqpython
    from pathlib import Path
    pp = phreeqpython.PhreeqPython(database='velophi.dat', database_directory=Path(os.path.join(ROOT, 'tests', 'fixtures', 'chem')))
    if pp.ip.phc_database_error_count:
        raise Fail('PHREEQC does not accept the generated database:\n' + pp.ip.get_error_string())
    pp.ip.run_string('SOLUTION 1\n temp 25\n pH 7\nREACTION_TEMPERATURE 1\n 0 100 in 101 steps\nSELECTED_OUTPUT 1\n -reset false\nUSER_PUNCH 1\n -headings tc A B\n 10 PUNCH TC, DH_A, DH_B\nEND\n')
    rows = sorted(r for r in pp.ip.get_selected_output_array()[1:] if abs(r[0] - round(r[0])) < 1e-9)
    table = OrderedDict((int(round(r[0])), r) for r in rows)
    if sorted(table) != list(range(0, 101)):
        raise Fail('Debye–Hückel table: expected 0 … 100 °C, got %d rows' % len(table))
    doc['dh'] = OrderedDict(t0=273.15, dt=1.0, A=[round(table[k][1], 9) for k in range(101)], B=[round(table[k][2], 9) for k in range(101)],
                            src='PHREEQC %s (DH_A, DH_B)' % pp.ip.version if hasattr(pp.ip, 'version') else 'PHREEQC 3 (DH_A, DH_B)')
    with open(out_json, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(doc, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')

    n_aq = sum(1 for s in out_species if not s.get('component'))
    n_s = sum(1 for p in out_phases if p['phase'] == 's')
    n_g = sum(1 for p in out_phases if p['phase'] == 'g')
    print('components %d, aqueous species %d, solids %d, gases %d, couples %d; dropped %d' % (len(keep_c), n_aq, n_s, n_g, len(out_couples), len(dropped)))
    if '--verbose' in sys.argv:
        for n in notes:
            print('  note', n)
        for name, why in dropped:
            print('  dropped %s: %s' % (name, why))
        print('  components:', ' '.join(keep_c))
    print('→', os.path.relpath(out_json, ROOT), os.path.getsize(out_json), 'bytes')


if __name__ == '__main__':
    main()
