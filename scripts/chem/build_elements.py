"""Build src/chem/data/elements.json: the 118 elements with a recorded source for every field.

Run:  .cache/chem-venv/Scripts/python.exe -I scripts/chem/build_elements.py

Sources are the databases shipped inside the pinned packages `mendeleev` (MIT; a compilation of literature values,
each column carries citation keys) and `periodictable` (public domain), plus three small tables typed here: the
Chinese and German element names, corrections to the uncited discovery column, and the visible emission lines that
every school textbook lists. Nothing is fetched from the network. Missing values are written as null.
"""
import math
import os
import re
import sys
import warnings

warnings.filterwarnings('ignore')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from datalib import DATA_DIR, ELEMENT_SYMBOLS, clean_float, package_versions, write_records  # noqa: E402

import periodictable  # noqa: E402
from mendeleev.fetch import fetch_table  # noqa: E402

OUT = os.path.join(DATA_DIR, 'elements.json')

# Names of the elements in Chinese (全国科学技术名词审定委员会; 113, 115, 117, 118 as announced in 2017) and in German
# (GDCh spelling: Silicium, Cobalt, Iod, Bismut, Caesium). Typed by hand; the build asserts 118 unique entries each.
# Element 113 is U+9FED (钅+尔, the simplified form); the traditional form is U+9268.
NAMES_ZH = (
    '氢 氦 锂 铍 硼 碳 氮 氧 氟 氖 钠 镁 铝 硅 磷 硫 氯 氩 钾 钙 钪 钛 钒 铬 锰 铁 钴 镍 铜 锌 镓 锗 砷 硒 溴 氪 铷 锶 钇 锆 '
    '铌 钼 锝 钌 铑 钯 银 镉 铟 锡 锑 碲 碘 氙 铯 钡 镧 铈 镨 钕 钷 钐 铕 钆 铽 镝 钬 铒 铥 镱 镥 铪 钽 钨 铼 锇 铱 铂 金 汞 '
    '铊 铅 铋 钋 砹 氡 钫 镭 锕 钍 镤 铀 镎 钚 镅 锔 锫 锎 锿 镄 钔 锘 铹 \U0002CB3B \U0002CB4A \U0002CB73 \U0002CB5B '
    '\U0002CB76 鿏 \U0002B7FC \U0002CB2D 鿔 鿭 \U0002B4E7 镆 \U0002B7F7 鿬 鿫').split()
NAMES_DE = (
    'Wasserstoff Helium Lithium Beryllium Bor Kohlenstoff Stickstoff Sauerstoff Fluor Neon Natrium Magnesium Aluminium '
    'Silicium Phosphor Schwefel Chlor Argon Kalium Calcium Scandium Titan Vanadium Chrom Mangan Eisen Cobalt Nickel '
    'Kupfer Zink Gallium Germanium Arsen Selen Brom Krypton Rubidium Strontium Yttrium Zirconium Niob Molybdän '
    'Technetium Ruthenium Rhodium Palladium Silber Cadmium Indium Zinn Antimon Tellur Iod Xenon Caesium Barium Lanthan '
    'Cer Praseodym Neodym Promethium Samarium Europium Gadolinium Terbium Dysprosium Holmium Erbium Thulium Ytterbium '
    'Lutetium Hafnium Tantal Wolfram Rhenium Osmium Iridium Platin Gold Quecksilber Thallium Blei Bismut Polonium Astat '
    'Radon Francium Radium Actinium Thorium Protactinium Uran Neptunium Plutonium Americium Curium Berkelium '
    'Californium Einsteinium Fermium Mendelevium Nobelium Lawrencium Rutherfordium Dubnium Seaborgium Bohrium Hassium '
    'Meitnerium Darmstadtium Roentgenium Copernicium Nihonium Flerovium Moscovium Livermorium Tenness Oganesson').split()
# IUPAC spelling where the package uses the American one
NAMES_EN_FIX = {13: 'Aluminium', 55: 'Caesium'}

# mendeleev series id -> category key
CATEGORY = {1: 'reactive-nonmetal', 2: 'noble-gas', 3: 'alkali-metal', 4: 'alkaline-earth', 5: 'metalloid', 6: 'halogen',
            7: 'post-transition-metal', 8: 'transition-metal', 9: 'lanthanide', 10: 'actinide'}

# The `discoverers` / `discovery_year` columns of mendeleev carry no citation and contain misspelt names and a few
# wrong years. Corrected here by hand (well-documented history; see docs/chem/DATA_SOURCES.md): z -> (year, names).
# None keeps the package value.
DISCOVERY_FIX = {
    2: (None, 'William Ramsay, Per Teodor Cleve, Nils Abraham Langlet'),
    4: (None, 'Louis-Nicolas Vauquelin'),
    5: (None, 'Humphry Davy, Joseph Louis Gay-Lussac, Louis Jacques Thénard'),
    8: (None, 'Joseph Priestley, Carl Wilhelm Scheele'),
    10: (None, 'William Ramsay, Morris Travers'),
    11: (None, 'Humphry Davy'), 12: (None, 'Humphry Davy'), 19: (None, 'Humphry Davy'), 20: (None, 'Humphry Davy'),
    56: (None, 'Humphry Davy'),
    13: (None, 'Hans Christian Ørsted'),
    18: (None, 'William Ramsay, Lord Rayleigh'),
    36: (None, 'William Ramsay, Morris Travers'), 54: (None, 'William Ramsay, Morris Travers'),
    37: (None, 'Robert Bunsen, Gustav Kirchhoff'), 55: (None, 'Robert Bunsen, Gustav Kirchhoff'),
    41: (None, 'Charles Hatchett'),
    43: (None, 'Carlo Perrier, Emilio Segrè'),
    48: (None, 'Friedrich Stromeyer'),
    59: (None, 'Carl Auer von Welsbach'), 60: (1885, 'Carl Auer von Welsbach'),
    76: (None, 'Smithson Tennant'),
    77: (None, 'Smithson Tennant'),
    78: (None, 'Antonio de Ulloa'),
    85: (None, 'Dale R. Corson, Kenneth R. MacKenzie, Emilio Segrè'),
    86: (1900, 'Friedrich Ernst Dorn'),
    87: (None, 'Marguerite Perey'),
    91: (None, 'Frederick Soddy, John Cranston, Otto Hahn, Lise Meitner'),
    94: (None, 'Glenn T. Seaborg, Joseph W. Kennedy, Edwin M. McMillan, Arthur C. Wahl'),
    97: (None, 'Glenn T. Seaborg, Stanley G. Thompson, Albert Ghiorso'),
    98: (None, 'Glenn T. Seaborg, Stanley G. Thompson, Albert Ghiorso, Kenneth Street Jr.'),
    101: (None, 'Glenn T. Seaborg, Stanley G. Thompson, Albert Ghiorso, Kenneth Street Jr.'),
    107: (1981, 'GSI Helmholtz Centre for Heavy Ion Research'),
    108: (None, 'GSI Helmholtz Centre for Heavy Ion Research'), 109: (None, 'GSI Helmholtz Centre for Heavy Ion Research'),
    110: (None, 'GSI Helmholtz Centre for Heavy Ion Research'), 111: (None, 'GSI Helmholtz Centre for Heavy Ion Research'),
    113: (2004, 'RIKEN'),
    116: (None, 'Joint Institute for Nuclear Research, Lawrence Livermore National Laboratory'),
}

# Visible emission lines (nm, in air) that school and first-year textbooks list for flame tests and discharge tubes.
# No installed package provides optical lines (periodictable has X-ray lines only), so this is a hand table; the
# source is recorded as "textbook value" and no relative intensities are given.
EMISSION_LINES = {
    'H': [410.2, 434.0, 486.1, 656.3],
    'He': [447.1, 501.6, 587.6, 667.8, 706.5],
    'Li': [610.4, 670.8],
    'Na': [589.0, 589.6],
    'K': [404.4, 766.5, 769.9],
    'Ca': [422.7],
    'Sr': [460.7],
    'Ba': [553.5],
    'Rb': [420.2, 780.0],
    'Cs': [455.5, 459.3],
    'Hg': [404.7, 435.8, 546.1, 577.0, 579.1],
    'Ne': [585.2, 640.2],
    'Tl': [535.0],
    'In': [410.2, 451.1],
}

# eV per particle -> kJ/mol: e * N_A / 1000 with the exact SI values of 2019
EV_TO_KJMOL = 1.602176634e-19 * 6.02214076e23 / 1000.0

CORES = {'He': 2, 'Ne': 10, 'Ar': 18, 'Kr': 36, 'Xe': 54, 'Rn': 86}
L_OF = {'s': 0, 'p': 1, 'd': 2, 'f': 3}
L_NAME = 'spdf'

CITATIONS = {
    'crc95': 'W. M. Haynes (ed.), CRC Handbook of Chemistry and Physics, 95th ed., CRC Press, 2014',
    'crc97': 'W. M. Haynes (ed.), CRC Handbook of Chemistry and Physics, 97th ed., CRC Press, 2016',
    'iupac2013': 'J. Meija et al., Atomic weights of the elements 2013 (IUPAC Technical Report), Pure Appl. Chem. 88, 265 (2016); '
                 'CIAAW tables of standard atomic weights and of radioactive elements (ciaaw.org)',
    'nubase2020': 'F. G. Kondev et al., The NUBASE2020 evaluation of nuclear physics properties, Chinese Phys. C 45, 030001 (2021)',
    'slater1964': 'J. C. Slater, Atomic radii in crystals, J. Chem. Phys. 41, 3199 (1964)',
    'cordero2008': 'B. Cordero et al., Covalent radii revisited, Dalton Trans. 2008, 2832',
    'pyykko2009a': 'P. Pyykkö, M. Atsumi, Molecular double-bond covalent radii for elements Li–E112, Chem. Eur. J. 15, 12770 (2009)',
    'pyykko2005': 'P. Pyykkö, S. Riedel, M. Patzschke, Triple-bond covalent radii, Chem. Eur. J. 11, 3511 (2005)',
    'nist-asd': 'A. Kramida, Yu. Ralchenko, J. Reader and NIST ASD Team, NIST Atomic Spectra Database (ground states and ionization energies)',
    'andersen2004': 'T. Andersen, Atomic negative ions: structure, dynamics and collisions, Phys. Rep. 394, 157 (2004)',
    'enwiki-ox': 'Wikipedia, "Oxidation state" (list of oxidation states of the elements), revision 1102394064',
    'am1976': 'N. W. Ashcroft, N. D. Mermin, Solid State Physics, Holt, Rinehart and Winston, 1976 (tables of element crystal structures)',
}


def src(package, table, *keys, note=None):
    out = {'package': package, 'table': table, 'citation': '; '.join(CITATIONS[k] for k in keys) if keys else None}
    if note:
        out['note'] = note
    return out


SOURCES = {
    'symbol': src('mendeleev', 'elements.symbol'),
    'name.en': src('mendeleev', 'elements.name', note='IUPAC spelling: Aluminium and Caesium replace the American forms of the package'),
    'name.zh': src(None, 'hand table in build_elements.py', note='names fixed by the China National Committee for Terminology in Sciences and Technologies; 113, 115, 117, 118 as announced in 2017'),
    'name.de': src(None, 'hand table in build_elements.py', note='German names in the spelling recommended by the GDCh'),
    'mass': src('mendeleev', 'elements.atomic_weight', 'iupac2013', note='standard atomic weight (conventional value where IUPAC gives an interval); cross-checked against periodictable (CIAAW 2021) to 1e-4 relative. Where massIsMassNumber is true the element has no standard atomic weight and the value is the mass number of its most stable isotope as listed by CIAAW'),
    'group': src('mendeleev', 'elements.group_id', note='null for the fifteen lanthanides (57-71) and fifteen actinides (89-103)'),
    'period': src('mendeleev', 'elements.period'),
    'block': src('mendeleev', 'elements.block', note='La-Yb and Ac-No are written as f, Lu and Lr as d (IUPAC 2021 provisional recommendation on group 3); the package has La/Ac as d and Lu/Lr as f'),
    'category': src('mendeleev', 'elements.series_id', note='series of the package mapped to keys; lanthanide = 57-71 and actinide = 89-103 (the package counts Lu and Lr as transition metals); polonium is listed as a post-transition metal, not a metalloid'),
    'configuration': src('mendeleev', 'elements.electronic_configuration', 'nist-asd', note='ground-state configuration; equal to the NIST ground configuration (ionizationenergies.ground_shells) for every element that table covers, asserted at build time; configurationPredicted marks the elements beyond that table'),
    'subshells': src('mendeleev', 'elements.electronic_configuration', note='[n, l, electrons] expanded from the configuration; the electrons sum to z'),
    'oxidationStates': src('mendeleev', 'oxidationstates', 'enwiki-ox', note='common = category "main" of the package, other = category "extended"'),
    'electronegativity': src('mendeleev', 'elements.en_pauling', 'crc95', note='Pauling scale'),
    'radius.atomic': src('mendeleev', 'elements.atomic_radius', 'slater1964', note='empirical atomic radius, pm'),
    'radius.covalent': src('mendeleev', 'elements.covalent_radius_cordero', 'cordero2008', note='single-bond covalent radius, pm; the package averages the three carbon values and the low- and high-spin values of Mn, Fe, Co'),
    'radius.covalentDouble': src('mendeleev', 'elements.covalent_radius_pyykko_double', 'pyykko2009a', note='double-bond covalent radius, pm'),
    'radius.covalentTriple': src('mendeleev', 'elements.covalent_radius_pyykko_triple', 'pyykko2005', note='triple-bond covalent radius, pm'),
    'radius.vdw': src('mendeleev', 'elements.vdw_radius', 'crc95', note='van der Waals radius, pm'),
    'ionisation': src('mendeleev', 'ionizationenergies (ion_charge = 0)', 'nist-asd', note='first ionisation energy in eV; kJ/mol = eV x 96.4853 (e x N_A, exact SI constants)'),
    'electronAffinity': src('mendeleev', 'elements.electron_affinity', 'crc95', 'andersen2004', note='eV; negative entries of the package (no stable anion: He, Be, N, Ar, Xe, Yb) and the calculated value for Og are written as null'),
    'melt': src('mendeleev', 'phasetransitions.melting_point', 'crc97', note='K at 101.325 kPa; phase-transition rows are skipped; where several allotropes are listed the one named in "allotrope" is used; null when the substance sublimes'),
    'boil': src('mendeleev', 'phasetransitions.boiling_point', 'crc97', note='K at 101.325 kPa; a sublimation point when sublimes is true'),
    'density': src('mendeleev', 'elements.density', 'crc95', note='g/cm3 near room temperature; gases as ideal-gas density at 25 C and 101.325 kPa (densityPhase says which); the theoretical estimates the package takes from Wikipedia (At, Fr, Es and every element from Fm on) are written as null'),
    'state': src('mendeleev', 'phasetransitions', 'crc97', note='derived: state at 298.15 K and 101.325 kPa from the melting and boiling (or sublimation) point; null when those are unknown'),
    'crystal': src('periodictable', 'crystal_structure', 'am1976', note='structure type mapped to keys; a as given, b and c computed from the b/a and c/a ratios of the table, angstrom; the table lists diamond for carbon and the hexagonal cell of La, Pr, Nd; selenium and tellurium (c/a far from 1.63) are keyed "hexagonal", not hcp'),
    'discovery': src('mendeleev', 'elements.discovery_year, elements.discoverers', note='the package gives no citation for these columns; name spellings and the entries of Be, Nd, Pt, Rn, Bh, Nh, Lv were corrected by hand (DISCOVERY_FIX in build_elements.py); ancient = known since antiquity'),
    'abundanceCrust': src('mendeleev', 'elements.abundance_crust', 'crc95', note='mg/kg in the Earth\'s crust'),
    'isotopes': src('mendeleev', 'isotopes.mass_number, isotopes.abundance', 'nubase2020', 'iupac2013', note='isotopes with a natural abundance (percent, representative isotopic composition); cross-checked against periodictable (CIAAW 2021) to 0.2 percentage points; for elements without one, the isotope whose mass number is given as mass, with abundance null'),
    'emissionLines': src(None, 'hand table in build_elements.py', note='textbook value: the flame-test and discharge-tube lines listed in school and first-year texts, nm in air; no installed package provides visible lines, so only these are given and without relative intensities'),
}


def num(x, digits=None):
    """A database number as a JSON number: None for missing, integers without a trailing .0."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    v = float(x)
    if digits is not None:
        v = clean_float(v, digits)
    return int(v) if v == int(v) and abs(v) < 1e15 else v


def parse_config(text, by_symbol):
    """`[Ar] 3d5 4s` -> ({(3, 2): 5, ...} for all subshells including the core, normalised short string)."""
    occ = {}
    short = []
    for tok in text.split():
        m = re.fullmatch(r'\[(\w+)\]', tok)
        if m:
            occ.update(by_symbol[m.group(1)])
            short.append(tok)
            continue
        m = re.fullmatch(r'(\d)([spdf])(\d*)', tok)
        if not m:
            raise ValueError('cannot read configuration %r' % text)
        n, l, k = int(m.group(1)), L_OF[m.group(2)], int(m.group(3) or '1')
        occ[(n, l)] = k
        short.append('%d%s%d' % (n, m.group(2), k))
    return occ, ' '.join(short)


def parse_nist_shells(text, by_symbol):
    """NIST ground shells such as `[Ar].3d5.4s` or `[Hg].6p` -> occupation by (n, l)."""
    occ = {}
    for tok in text.split('.'):
        m = re.fullmatch(r'\[(\w+)\]', tok)
        if m:
            occ.update(by_symbol[m.group(1)])
            continue
        m = re.fullmatch(r'(\d)([spdf])(\d*)', tok)
        if not m:
            raise ValueError('cannot read NIST shells %r' % text)
        occ[(int(m.group(1)), L_OF[m.group(2)])] = int(m.group(3) or '1')
    return occ


def main():
    el = fetch_table('elements').sort_values('atomic_number').reset_index(drop=True)
    iso = fetch_table('isotopes')
    ox = fetch_table('oxidationstates')
    ie = fetch_table('ionizationenergies')
    pt = fetch_table('phasetransitions')
    assert len(el) == 118 and list(el.symbol) == ELEMENT_SYMBOLS
    assert len(NAMES_ZH) == 118 and len(set(NAMES_ZH)) == 118, 'Chinese names: 118 unique entries expected'
    assert len(NAMES_DE) == 118 and len(set(NAMES_DE)) == 118, 'German names: 118 unique entries expected'
    assert all(len(n) == 1 for n in NAMES_ZH), 'each Chinese element name is one character'

    # configurations first: later elements refer to the noble-gas cores
    occ_by_symbol, short_by_z = {}, {}
    for _, e in el.iterrows():
        occ, short = parse_config(e['electronic_configuration'], occ_by_symbol)
        z = int(e['atomic_number'])
        assert sum(occ.values()) == z, 'configuration of %s does not hold %d electrons' % (e['symbol'], z)
        occ_by_symbol[e['symbol']] = occ
        short_by_z[z] = short
    expect = {'Cr': '[Ar] 3d5 4s1', 'Cu': '[Ar] 3d10 4s1', 'Nb': '[Kr] 4d4 5s1', 'Mo': '[Kr] 4d5 5s1', 'Ru': '[Kr] 4d7 5s1',
              'Rh': '[Kr] 4d8 5s1', 'Pd': '[Kr] 4d10', 'Ag': '[Kr] 4d10 5s1', 'La': '[Xe] 5d1 6s2', 'Ce': '[Xe] 4f1 5d1 6s2',
              'Gd': '[Xe] 4f7 5d1 6s2', 'Pt': '[Xe] 4f14 5d9 6s1', 'Au': '[Xe] 4f14 5d10 6s1', 'Th': '[Rn] 6d2 7s2',
              'U': '[Rn] 5f3 6d1 7s2', 'Fe': '[Ar] 3d6 4s2', 'O': '[He] 2s2 2p4'}
    for sym, want in expect.items():
        got = short_by_z[ELEMENT_SYMBOLS.index(sym) + 1]
        assert got == want, 'configuration of %s: %s, expected %s' % (sym, got, want)

    # NIST ground states as an independent check of the configurations, and the first ionisation energies
    neutral = ie[ie.ion_charge == 0]
    nist = {int(r['atomic_number']): r for _, r in neutral.iterrows()}
    for z, r in sorted(nist.items()):
        got = parse_nist_shells(r['ground_shells'], occ_by_symbol)
        assert got == occ_by_symbol[ELEMENT_SYMBOLS[z - 1]], 'configuration of %s differs from the NIST ground state %s' % (ELEMENT_SYMBOLS[z - 1], r['ground_shells'])

    estimated_density = {85, 87, 99} | set(range(100, 119))
    density_mismatch = []  # solids and liquids whose density differs by 5 % or more from periodictable (CRC 80th ed.)
    records = []
    for _, e in el.iterrows():
        z = int(e['atomic_number'])
        sym = e['symbol']
        lanthanide, actinide = 57 <= z <= 71, 89 <= z <= 103

        # ---- mass
        sub = iso[iso.atomic_number == z]
        natural = sorted((int(a), float(b)) for a, b in zip(sub.mass_number, sub.abundance) if b == b)
        weight = float(e['atomic_weight'])
        ptel = periodictable.elements[z]
        if natural:
            mass, mass_is_number = weight, False
            assert abs(weight - ptel.mass) / weight < 1e-4 or z == 18, 'atomic weight of %s: %r vs periodictable %r' % (sym, weight, ptel.mass)
            ptab = {i.isotope: i.abundance for i in ptel if i.abundance}
            if ptab:  # periodictable has no abundances for uranium
                for a, ab in natural:
                    assert abs(ab - ptab.get(a, 0.0)) < 0.2, 'abundance of %s-%d: %r vs periodictable %r' % (sym, a, ab, ptab.get(a))
                # mendeleev lists ground states only, so the naturally occurring isomer Ta-180m is missing there
                missing = sorted(set(ptab) - {a for a, _ in natural})
                assert missing == ([180] if z == 73 else []), 'isotopes of %s only in periodictable: %r' % (sym, missing)
                natural = sorted(natural + [(a, ptab[a]) for a in missing])
            assert abs(sum(a for _, a in natural) - 100.0) < 0.01, 'abundances of %s do not sum to 100' % sym
            isotopes = [{'a': a, 'abundance': num(ab, 4)} for a, ab in natural]
        else:
            mass, mass_is_number = float(round(weight)), True
            assert e['is_radioactive'] == 1
            isotopes = [{'a': int(round(weight)), 'abundance': None}]

        # ---- classification
        if lanthanide:
            category = 'lanthanide'
        elif actinide:
            category = 'actinide'
        elif z == 84:
            category = 'post-transition-metal'
        else:
            category = CATEGORY[int(e['series_id'])]
        if lanthanide or actinide:
            group = None
            block = 'd' if z in (71, 103) else 'f'
        else:
            group = int(e['group_id'])
            block = e['block']

        # ---- electrons
        occ = occ_by_symbol[sym]
        subshells = [[n, l, k] for (n, l), k in sorted(occ.items())]
        common = sorted(int(v) for v, c in zip(ox[ox.atomic_number == z].oxidation_state, ox[ox.atomic_number == z].category) if c == 'main')
        other = sorted(int(v) for v, c in zip(ox[ox.atomic_number == z].oxidation_state, ox[ox.atomic_number == z].category) if c != 'main')
        ion = None
        if z in nist:
            ev = float(nist[z]['ionization_energy'])
            ion = {'eV': num(ev, 4), 'kJmol': num(ev * EV_TO_KJMOL, 1)}
        ea = num(e['electron_affinity'], 4)
        if ea is not None and (ea <= 0 or z >= 104):
            ea = None

        # ---- phase data
        rows = pt[pt.atomic_number == z]
        rows = rows[rows.is_transition != 1]
        if z == 15:
            rows = rows[rows.allotrope == 'white']
        assert len(rows) <= 1, 'ambiguous phase-transition rows for %s' % sym
        melt = boil = allotrope = None
        sublimes = False
        if len(rows) == 1:
            r = rows.iloc[0]
            sublimes = r['is_sublimation_point'] == 1
            melt = None if sublimes else num(r['melting_point'], 4)
            boil = num(r['boiling_point'], 4)
            allotrope = r['allotrope'] if isinstance(r['allotrope'], str) else None
        t0 = 298.15
        state = None
        if sublimes and boil is not None:
            state = 'solid' if boil > t0 else 'gas'
        elif melt is not None and melt > t0:
            state = 'solid'
        elif boil is not None and boil <= t0:
            state = 'gas'
        elif melt is not None and boil is not None and melt <= t0 < boil:
            state = 'liquid'
        density = None if z in estimated_density else num(e['density'], 6)
        if density is not None:
            assert state is not None, 'density of %s without a standard state' % sym
            if state != 'gas' and ptel.density and abs(density - ptel.density) / density >= 0.05:
                density_mismatch.append(sym)

        # ---- crystal structure of the solid (Ashcroft & Mermin via periodictable)
        crystal = None
        cs = getattr(ptel, 'crystal_structure', None)
        if cs and cs['symmetry'] not in ('atom', 'diatom'):
            key = {'BCC': 'bcc', 'fcc': 'fcc', 'hcp': 'hcp', 'Diamond': 'diamond', 'SC': 'sc', 'Tetragonal': 'tetragonal',
                   'Orthorhombic': 'orthorhombic', 'Rhombohedral': 'rhombohedral', 'Cubic': 'cubic', 'Monoclinic': 'monoclinic'}[cs['symmetry']]
            if key == 'hcp' and not 1.5 <= cs['c/a'] <= 1.95:
                key = 'hexagonal'
            crystal = {'structure': key, 'a': num(cs.get('a'), 4), 'b': None, 'c': None, 'alpha': num(cs.get('alpha'), 3)}
            if 'b/a' in cs:
                crystal['b'] = num(cs['a'] * cs['b/a'], 3)
            if 'c/a' in cs:
                crystal['c'] = num(cs['a'] * cs['c/a'], 3)

        # ---- discovery
        who = e['discoverers'] if isinstance(e['discoverers'], str) else None
        ancient = bool(who and who.lower().startswith('known to the ancients'))
        year = None if ancient else num(e['discovery_year'])
        by = None if ancient else who
        if z in DISCOVERY_FIX:
            fy, fb = DISCOVERY_FIX[z]
            year, by = (fy if fy is not None else year), fb
        discovery = {'year': year, 'by': by, 'ancient': ancient}

        rec = {
            'z': z,
            'symbol': sym,
            'name': {'zh': NAMES_ZH[z - 1], 'en': NAMES_EN_FIX.get(z, e['name']), 'de': NAMES_DE[z - 1]},
            'mass': num(mass, 6),
            'massIsMassNumber': mass_is_number,
            'group': group,
            'period': int(e['period']),
            'block': block,
            'category': category,
            'configuration': short_by_z[z],
            'configurationPredicted': z not in nist,
            'subshells': subshells,
            'oxidationStates': {'common': common, 'other': other},
            'electronegativity': num(e['en_pauling'], 2),
            'radius': {'atomic': num(e['atomic_radius'], 1), 'covalent': num(e['covalent_radius_cordero'], 1),
                       'covalentDouble': num(e['covalent_radius_pyykko_double'], 1), 'covalentTriple': num(e['covalent_radius_pyykko_triple'], 1),
                       'vdw': num(e['vdw_radius'], 1)},
            'ionisation': ion,
            'electronAffinity': ea,
            'melt': melt,
            'boil': boil,
            'sublimes': bool(sublimes),
            'allotrope': allotrope,
            'state': state,
            'density': density,
            'densityPhase': state if density is not None else None,
            'crystal': crystal,
            'discovery': discovery,
            'abundanceCrust': num(e['abundance_crust'], 12),
            'isotopes': isotopes,
        }
        if sym in EMISSION_LINES:
            rec['emissionLines'] = EMISSION_LINES[sym]
        records.append(rec)

    assert len(records) == 118
    assert len({r['name']['en'] for r in records}) == 118
    print('density differs from periodictable by 5 % or more:', density_mismatch)
    assert {r['symbol'] for r in records if r['state'] == 'liquid'} == {'Br', 'Hg'}, 'liquids at 25 C'
    assert {r['symbol'] for r in records if r['state'] == 'gas'} == {'H', 'He', 'N', 'O', 'F', 'Ne', 'Cl', 'Ar', 'Kr', 'Xe', 'Rn'}, 'gases at 25 C'

    head = {
        'format': 'velophi-elements',
        'version': 1,
        'generator': {'script': 'scripts/chem/build_elements.py', **package_versions('mendeleev', 'periodictable')},
        'sources': SOURCES,
    }
    text = write_records(OUT, head, 'elements', records)
    filled = {}
    for r in records:
        for k, v in r.items():
            if v not in (None, [], {}):
                filled[k] = filled.get(k, 0) + 1
    print('wrote %s: %d elements, %d bytes' % (os.path.relpath(OUT), len(records), len(text.encode('utf-8'))))
    print('fields present: ' + ', '.join('%s %d' % kv for kv in sorted(filled.items())))


if __name__ == '__main__':
    main()
