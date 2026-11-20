"""Build the nuclide table of the chemistry core from NUBASE2020 and AME2020 (26.64, D262, D276).

  python -I scripts/chem/build_nuclides.py [--check]

Reads   .cache/chem-src/nubase2020/nubase_4.mas20   NUBASE2020 (half-lives, decay modes and intensities, isomers,
                                                    isotopic abundances, mass excesses)
        .cache/chem-src/ame2020/mass_1.mas20        AME2020 (unrounded mass excesses of the ground states)
        scripts/chem/nuclide_feeding.json           hand-entered isomer feeding fractions, each with its source
Writes  src/chem/data/nuclides.json                 the table the front end loads on demand and hands to the Rust core
                                                    with `nuclideSetData` (engine/CHEM.md)

Sources and licence (docs/chem/DATA_SOURCES.md, "核素数据"): both evaluations were published open access in
Chinese Physics C 45 (2021) 030001-030003 under the Creative Commons Attribution 3.0 licence; the ASCII files are
the electronic form of the published tables (Atomic Mass Data Center, https://amdc.impcas.ac.cn/). The input files
are data only: this script parses them by column and never executes anything from them.

What it keeps
  * every ground state of NUBASE2020 (state 0);
  * the isomers flagged m and n (states 1 and 2) that NUBASE2020 lists as stable or with a half-life of at least
    one second ("main isomers": long enough to be a species of their own in a decay chain);
  * per nuclide: Z, A, state, mass excess (keV), half-life (s), isotopic abundance (%), flags, and the decay modes
    with their intensities as published (percent / 100). Limits ("<") are dropped; a mode whose intensity is unknown
    ("?") is kept with `null` only when the nuclide has no quantified mode at all.

What it does not do: it does not renormalise intensities, does not subtract the beta-delayed modes from their
parent mode and does not compute daughters or Q values - those are computations of the Rust core
(engine/velophi-chem/src/nuclear/nuclides.rs), so the file stays a transcription of the sources.

The output is reproducible: the same inputs give the same bytes (no dates, sorted keys where order is not fixed by
the source, '\n' line ends). `--check` rebuilds in memory and compares with the file on disk.
"""
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
NUBASE = os.path.join(ROOT, '.cache', 'chem-src', 'nubase2020', 'nubase_4.mas20')
AME = os.path.join(ROOT, '.cache', 'chem-src', 'ame2020', 'mass_1.mas20')
FEEDING = os.path.join(HERE, 'nuclide_feeding.json')
OUT = os.path.join(ROOT, 'src', 'chem', 'data', 'nuclides.json')

# The SHA-256 of the files this table was built from (downloaded 2026-11-13 from
# https://amdc.impcas.ac.cn/masstables/Ame2020/). Other bytes are refused: a changed source is a decision, not an accident.
EXPECTED = {
    'nubase_4.mas20': '1585a5eea86c5e17e90307c7e6e786d060049c4039e392a261ff6db977df9859',
    'mass_1.mas20': 'e8599c6d7f724fac91934e59f1b9de8fb8f63e820f4b39456b790665ed2a3307',
}

SYMBOLS = ['n', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
           'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr',
           'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd',
           'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
           'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm',
           'Md', 'No', 'Lr', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og']

# Half-life units of NUBASE2020 in seconds; the year is the tropical year of the evaluation (365.2422 d).
YEAR = 31556926.0
UNITS = {'ys': 1e-24, 'zs': 1e-21, 'as': 1e-18, 'fs': 1e-15, 'ps': 1e-12, 'ns': 1e-9, 'us': 1e-6, 'ms': 1e-3, 's': 1.0,
         'm': 60.0, 'h': 3600.0, 'd': 86400.0, 'y': YEAR, 'ky': 1e3 * YEAR, 'My': 1e6 * YEAR, 'Gy': 1e9 * YEAR,
         'Ty': 1e12 * YEAR, 'Py': 1e15 * YEAR, 'Ey': 1e18 * YEAR, 'Zy': 1e21 * YEAR, 'Yy': 1e24 * YEAR}

# Decay modes in the order of the output's mode table (the core knows each by name). Modes of the source that are
# not listed here stop the build: a new notation must be looked at, not guessed.
MODES = ['B-', 'B+', 'EC', 'e+', 'A', 'IT', 'SF', 'p', '2p', '3p', 'n', '2n', '3n', '2B-', '2B+',
         'B-n', 'B-2n', 'B-3n', 'B-4n', 'B-p', 'B-A', 'B-d', 'B-t', 'B-SF',
         'B+p', 'B+2p', 'B+3p', 'B+A', 'B+pA', 'B+SF',
         '14C', '12C', '18O', '20O', '20Ne', '22Ne', '23F', '24Ne', '25Ne', '28Mg', '30Mg', '32Si', '34Si', 'd', '3H', '3He']
ALIASES = {'EC+B+': 'B+', 'B': 'B-'}
# Two-cluster notations ("24Ne+26Ne", "28Mg+30Mg") appear only as limits or as approximate values below 1e-13 %.
SKIP = {'24Ne+26Ne', '28Mg+30Mg'}

# flags (bit field)
F_MASS_EST = 1       # mass excess from systematics ('#')
F_T_EST = 2          # half-life from systematics ('#')
F_T_LIMIT = 4        # half-life is a limit ('>' or '<') or approximate ('~'); the number is the limit
F_UNBOUND = 8        # particle unstable ('p-unst'): no half-life given
F_MODES_OPEN = 16    # at least one decay mode has no quantified intensity ('?' or a limit)


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        h.update(fh.read())
    return h.hexdigest()


def num(text, digits):
    """A float rounded to `digits` significant digits (so the JSON holds no noise digits); None for empty text."""
    text = text.strip().replace('#', '')
    if not text:
        return None
    return float('%.*g' % (digits, float(text)))


def parse_ame(path):
    """(Z, A) -> (mass excess in keV, estimated) for the ground states of AME2020."""
    out = {}
    started = False
    with open(path, encoding='ascii') as fh:
        for line in fh:
            if not started:
                started = line.startswith('1N-Z')
                continue
            if len(line) < 54 or not line[14:19].strip().isdigit():
                continue
            z, a = int(line[9:14]), int(line[14:19])
            field = line[28:42]
            out[(z, a)] = (num(field, 13), '#' in field)
    return out


def parse_modes(text, where):
    """The decay modes of a NUBASE line: ([(mode, fraction or None)], abundance or None, some mode not quantified)."""
    modes, abundance, open_, fed = [], None, False, []
    for tok in text.split(';'):
        tok = tok.strip()
        if not tok:
            continue
        # "B-=100[gs=12,m=88]": percent of the decays that reach the daughter's ground state and its isomer m
        note = re.search(r'\[gs=([0-9.]+),m=([0-9.]+)\]$', tok)
        if note:
            tok = tok[:note.start()].strip()
        m = re.match(r'^([A-Za-z0-9+\-]+?)\s*(=|~|<|>|\?| le | ge )\s*(.*)$', tok)
        if not m:
            raise SystemExit('%s: decay mode not understood: %r' % (where, tok))
        name, op, rest = m.group(1), m.group(2).strip(), m.group(3).strip()
        if name == 'IS':
            abundance = num(rest.split()[0], 8)
            continue
        name = ALIASES.get(name, name)
        if name in SKIP:
            open_ = True
            continue
        if name not in MODES:
            raise SystemExit('%s: unknown decay mode %r in %r' % (where, name, text))
        value = rest.split()[0] if rest else ''
        if op in ('=', '~', '>') and value == '?':
            op = '?'                          # "p=?": listed, intensity not known
        if op in ('=', '~', '>'):
            if not re.match(r'^[0-9.]+(e[-+]?[0-9]+)?#?$', value):
                raise SystemExit('%s: intensity not understood: %r' % (where, tok))
            modes.append((name, float('%.7g' % (float(value.replace('#', '')) / 100.0))))
            if note and float(note.group(1)) + float(note.group(2)) > 0.0:
                gs, m1 = float(note.group(1)), float(note.group(2))
                fed.append((name, float('%.7g' % (m1 / (gs + m1)))))
            if op != '=':
                open_ = open_ or op == '>'
        else:
            open_ = True
            if op == '?':
                modes.append((name, None))
    quantified = [m for m in modes if m[1] is not None]
    if quantified:
        modes = quantified
    # the same mode twice (an alias and its target): keep the first
    seen, unique = set(), []
    for m in modes:
        if m[0] not in seen:
            seen.add(m[0])
            unique.append(m)
    return unique, abundance, open_, fed


def parse_nubase(path, ame):
    rows, stats = [], {'ground': 0, 'isomers': 0, 'stable': 0, 'massFromAme': 0, 'massDiffMax_keV': 0.0}
    with open(path, encoding='ascii') as fh:
        for line in fh:
            if line.startswith('#') or len(line) < 20:
                continue
            line = line.rstrip('\n').ljust(210)
            a, z, state = int(line[0:3]), int(line[4:7]), line[7:8]
            flag = line[16:17].strip() or line[15:16].strip()
            where = line[11:17].strip()
            if state == '0':
                level = 0
            elif state == '1' and 'm' in line[11:17]:
                level = 1
            elif state == '2' and 'n' in line[11:17]:
                level = 2
            else:
                continue                      # levels, resonances, isobaric analogue states, further isomers
            flags = 0
            tfield, unit = line[69:78].strip(), line[78:80].strip()
            if tfield == 'stbl':
                half = 0.0
            elif tfield == 'p-unst':
                half, flags = None, flags | F_UNBOUND
            elif tfield == '':
                half = None
            else:
                m = re.match(r'^([<>~]?)([0-9.]+)(#?)$', tfield)
                if not m or unit not in UNITS:
                    raise SystemExit('%s: half-life not understood: %r %r' % (where, tfield, unit))
                half = float('%.7g' % (float(m.group(2)) * UNITS[unit]))
                if m.group(1):
                    flags |= F_T_LIMIT
                if m.group(3):
                    flags |= F_T_EST
            if level > 0 and not (half is not None and (half == 0.0 or half >= 1.0)):
                continue
            mfield = line[18:31]
            mass = num(mfield, 13)
            if '#' in mfield:
                flags |= F_MASS_EST
            if level == 0 and (z, a) in ame:
                am, est = ame[(z, a)]
                if mass is not None:
                    stats['massDiffMax_keV'] = max(stats['massDiffMax_keV'], abs(am - mass))
                mass = am
                flags = (flags | F_MASS_EST) if est else (flags & ~F_MASS_EST)
                stats['massFromAme'] += 1
            modes, abundance, open_, fed = parse_modes(line[119:209], where)
            if open_:
                flags |= F_MODES_OPEN
            rows.append({'z': z, 'a': a, 's': level, 'mass': mass, 'half': half, 'abundance': abundance, 'flags': flags, 'modes': modes, 'fed': fed})
            stats['ground' if level == 0 else 'isomers'] += 1
            if half == 0.0:
                stats['stable'] += 1
    rows.sort(key=lambda r: (r['z'], r['a'], r['s']))
    keys = [(r['z'], r['a'], r['s']) for r in rows]
    if len(set(keys)) != len(keys):
        raise SystemExit('duplicate nuclide in NUBASE')
    return rows, stats


def parse_id(text):
    m = re.match(r'^([A-Za-z]{1,2})-([0-9]{1,3})([mn]?)$', text)
    if not m or m.group(1) not in SYMBOLS:
        raise SystemExit('nuclide id not understood: %r' % text)
    return SYMBOLS.index(m.group(1)), int(m.group(2)), {'': 0, 'm': 1, 'n': 2}[m.group(3)]


def jnum(x):
    """Shortest JSON number: integers without '.0'."""
    if x is None:
        return 'null'
    if float(x) == int(x) and abs(x) < 1e15:
        return str(int(x))
    return repr(float(x))


def build():
    for path in (NUBASE, AME):
        got = sha256(path)
        if got != EXPECTED[os.path.basename(path)]:
            raise SystemExit('%s: unexpected content (sha256 %s)' % (path, got))
    ame = parse_ame(AME)
    rows, stats = parse_nubase(NUBASE, ame)
    index = {(r['z'], r['a'], r['s']): r for r in rows}
    with open(FEEDING, encoding='utf-8') as fh:
        supplement = json.load(fh)
    source_ids = [None] + [s['id'] for s in supplement['sources']]
    feeding = []
    # daughter of a mode with an annotation: only beta-minus and isomeric transitions carry one in NUBASE2020
    step = {'B-': 1, 'IT': 0}
    for r in rows:
        for name, frac in r['fed']:
            if name not in step:
                raise SystemExit('feeding annotation on mode %s of Z=%d A=%d: add its daughter rule' % (name, r['z'], r['a']))
            if frac > 0.0 and (r['z'] + step[name], r['a'], 1) in index and (r['z'] + step[name], r['a'], 1) != (r['z'], r['a'], r['s']):
                feeding.append([r['z'], r['a'], r['s'], MODES.index(name), 1, frac, 0])
    for f in supplement['feeding']:
        parent, daughter = parse_id(f['parent']), parse_id(f['to'])
        if parent not in index or daughter not in index or daughter[2] == 0:
            raise SystemExit('feeding %s -> %s: nuclide not in the table or not an isomer' % (f['parent'], f['to']))
        if f['mode'] not in [m[0] for m in index[parent]['modes']] or not 0.0 < f['fraction'] <= 1.0:
            raise SystemExit('feeding %s: mode or fraction not valid' % f['parent'])
        feeding.append([parent[0], parent[1], parent[2], MODES.index(f['mode']), daughter[2], f['fraction'], source_ids.index(f['source'])])
    feeding.sort()

    head = {
        'format': 'velophi-nuclides',
        'version': 1,
        'generator': {
            'script': 'scripts/chem/build_nuclides.py',
            'sources': {
                'nubase_4.mas20': EXPECTED['nubase_4.mas20'],
                'mass_1.mas20': EXPECTED['mass_1.mas20'],
                'nuclide_feeding.json': sha256(FEEDING),
            },
        },
        'licence': 'CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/): the data are those of the publications cited in "citations", selected and converted (half-lives to seconds, intensities to fractions) by the generator script',
        'citations': [
            'F.G. Kondev, M. Wang, W.J. Huang, S. Naimi, G. Audi, The NUBASE2020 evaluation of nuclear physics properties, Chinese Physics C 45 (2021) 030001, doi:10.1088/1674-1137/abddae',
            'W.J. Huang, M. Wang, F.G. Kondev, G. Audi, S. Naimi, The AME 2020 atomic mass evaluation (I). Evaluation of input data, and adjustment procedures, Chinese Physics C 45 (2021) 030002, doi:10.1088/1674-1137/abddb0',
            'M. Wang, W.J. Huang, F.G. Kondev, G. Audi, S. Naimi, The AME 2020 atomic mass evaluation (II). Tables, graphs and references, Chinese Physics C 45 (2021) 030003, doi:10.1088/1674-1137/abddaf',
        ],
        'counts': {'nuclides': len(rows), 'ground': stats['ground'], 'isomers': stats['isomers'], 'stable': stats['stable']},
        'units': {'massExcess': 'keV', 'halfLife': 's (0: stable, null: not known)', 'abundance': 'percent', 'intensity': 'fraction of decays (null: not known)', 'year_s': YEAR},
        'flags': {'massEstimated': F_MASS_EST, 'halfLifeEstimated': F_T_EST, 'halfLifeLimit': F_T_LIMIT, 'particleUnstable': F_UNBOUND, 'modesOpen': F_MODES_OPEN},
        'modes': MODES,
        'columns': ['Z', 'A', 'state', 'massExcess', 'halfLife', 'abundance', 'flags', 'decays'],
        'feedingColumns': ['Z', 'A', 'state', 'mode', 'daughterState', 'fraction', 'source'],
        'feedingSources': [{'citation': 'NUBASE2020: the annotation [gs=..,m=..] of the decay mode', 'url': 'https://doi.org/10.1088/1674-1137/abddae', 'read': '2026-11-13'}]
                          + [{'citation': s['citation'], 'url': s['url'], 'read': s['read']} for s in supplement['sources']],
        'feeding': feeding,
    }
    lines = []
    for r in rows:
        decays = ','.join('%d,%s' % (MODES.index(name), jnum(frac)) for name, frac in r['modes'])
        lines.append('[%d,%d,%d,%s,%s,%s,%d,[%s]]' % (r['z'], r['a'], r['s'], jnum(r['mass']), jnum(r['half']), jnum(r['abundance'] or 0), r['flags'], decays))
    text = json.dumps(head, ensure_ascii=False, separators=(',', ':'))
    text = text[:-1] + ',"nuclides":[\n' + ',\n'.join(lines) + '\n]}\n'
    json.loads(text)                          # must be valid JSON
    return text, stats, len(rows)


def main():
    text, stats, count = build()
    data = text.encode('utf-8')
    if '--check' in sys.argv[1:]:
        with open(OUT, 'rb') as fh:
            same = fh.read() == data
        print('nuclides.json is %s' % ('up to date' if same else 'DIFFERENT from a fresh build'))
        sys.exit(0 if same else 1)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'wb') as fh:
        fh.write(data)
    print('%d nuclides (%d ground states, %d isomers, %d stable), %d bytes, sha256 %s' % (count, stats['ground'], stats['isomers'], stats['stable'], len(data), hashlib.sha256(data).hexdigest()))
    print('ground-state mass excess from AME2020 for %d nuclides; largest difference to the NUBASE2020 column %.6f keV' % (stats['massFromAme'], stats['massDiffMax_keV']))


if __name__ == '__main__':
    main()
