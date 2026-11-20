"""Build src/chem/data/molecules.json from the curated list scripts/chem/molecules.txt.

Run:  .cache/chem-venv/Scripts/python.exe -I scripts/chem/build_molecules.py   (after build_elements.py)

Two paths, chosen per line of the list:

* SMILES only: RDKit adds the hydrogens, embeds with ETKDGv3 and a fixed seed, optimises with MMFF94 (UFF when
  MMFF94 has no parameters for the molecule; the product records which), keeps the conformer of lowest energy and
  puts it into its principal-axes frame.
* a `geom` instruction (molgeom.py): ideal VSEPR / coordination polyhedra or a Z-matrix with published bond lengths
  and angles, for the small inorganic species whose force-field geometry is wrong or unavailable. With every length
  published the method is `literature` and the citations are listed in `sources`; with any length taken as a sum of
  covalent radii the method is `vsepr`.

The same input and package versions give the same bytes: one thread, fixed seed, no clock, sorted output.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from rdkit import Chem, RDLogger  # noqa: E402
from rdkit.Chem import AllChem, rdMolTransforms  # noqa: E402

from datalib import DATA_DIR, HERE, clean_float, count_atoms, load_json, package_versions, parse_formula, symmetry_classes, write_records  # noqa: E402
import molgeom  # noqa: E402

RDLogger.DisableLog('rdApp.*')

LIST = os.path.join(HERE, 'molecules.txt')
OUT = os.path.join(DATA_DIR, 'molecules.json')
SEED = 20261113
CONFORMERS = 8
COLUMNS = ['id', 'formula', 'category', 'smiles', 'geom', 'zh', 'en', 'de', 'flags', 'sources']

# Display order and names of the categories used in molecules.txt
CATEGORIES = [
    ('element', '单质', 'Elements', 'Elementare Stoffe'),
    ('hydride', '氢化物', 'Hydrides', 'Wasserstoffverbindungen'),
    ('oxide', '氧化物', 'Oxides', 'Oxide'),
    ('halide', '卤化物与卤素互化物', 'Halides and interhalogens', 'Halogenide und Interhalogene'),
    ('oxoacid', '无机酸', 'Inorganic acids', 'Anorganische Säuren'),
    ('anion', '阴离子', 'Anions', 'Anionen'),
    ('cation', '阳离子', 'Cations', 'Kationen'),
    ('inorganic', '其他无机物', 'Other inorganic compounds', 'Weitere anorganische Verbindungen'),
    ('complex', '配合物', 'Coordination compounds', 'Komplexverbindungen'),
    ('ligand', '配体', 'Ligands', 'Liganden'),
    ('alkane', '烷烃', 'Alkanes', 'Alkane'),
    ('cycloalkane', '环烷烃', 'Cycloalkanes', 'Cycloalkane'),
    ('alkene', '烯烃', 'Alkenes', 'Alkene'),
    ('alkyne', '炔烃', 'Alkynes', 'Alkine'),
    ('arene', '芳香烃', 'Aromatic hydrocarbons', 'Aromatische Kohlenwasserstoffe'),
    ('haloalkane', '卤代烃', 'Halogenated hydrocarbons', 'Halogenkohlenwasserstoffe'),
    ('alcohol', '醇', 'Alcohols', 'Alkohole'),
    ('phenol', '酚', 'Phenols', 'Phenole'),
    ('ether', '醚', 'Ethers', 'Ether'),
    ('aldehyde', '醛', 'Aldehydes', 'Aldehyde'),
    ('ketone', '酮', 'Ketones', 'Ketone'),
    ('carboxylic-acid', '羧酸', 'Carboxylic acids', 'Carbonsäuren'),
    ('ester', '酯', 'Esters', 'Ester'),
    ('amine', '胺', 'Amines', 'Amine'),
    ('amide', '酰胺', 'Amides', 'Amide'),
    ('nitrogen-compound', '其他含氮有机物', 'Other organic nitrogen compounds', 'Weitere organische Stickstoffverbindungen'),
    ('sulfur-compound', '含硫有机物', 'Organic sulfur compounds', 'Organische Schwefelverbindungen'),
    ('heterocycle', '杂环化合物', 'Heterocycles', 'Heterocyclen'),
    ('carbohydrate', '糖类', 'Carbohydrates', 'Kohlenhydrate'),
    ('amino-acid', '氨基酸', 'Amino acids', 'Aminosäuren'),
    ('lipid', '油脂与脂肪酸', 'Fats and fatty acids', 'Fette und Fettsäuren'),
    ('nucleobase', '碱基与核苷酸', 'Nucleobases and nucleotides', 'Nukleinbasen und Nukleotide'),
    ('polymer', '高分子的单体与链节', 'Monomers and repeat units', 'Monomere und Wiederholeinheiten'),
    ('indicator', '指示剂与染料', 'Indicators and dyes', 'Indikatoren und Farbstoffe'),
    ('bioactive', '维生素与常见药物', 'Vitamins and common medicines', 'Vitamine und gängige Arzneistoffe'),
]

# Citations for the bond lengths and angles typed into molecules.txt (column `sources`, comma-separated keys)
REFERENCES = {
    'hh79': 'K. P. Huber, G. Herzberg, Molecular Spectra and Molecular Structure IV: Constants of Diatomic Molecules, Van Nostrand Reinhold, 1979 (equilibrium bond lengths)',
    'crc': 'CRC Handbook of Chemistry and Physics, 97th ed., CRC Press, 2016, section 9, "Bond Lengths and Angles in Gas-Phase Molecules" (values of M. D. Harmony et al., J. Phys. Chem. Ref. Data 8, 619 (1979) and Landolt-Börnstein II/7, II/15)',
    'wells': 'A. F. Wells, Structural Inorganic Chemistry, 5th ed., Oxford University Press, 1984 (bond lengths and angles of ions in crystals)',
    'tolles1962': 'W. M. Tolles, W. D. Gwinn, Structure and dipole moment for SF4, J. Chem. Phys. 36, 1119 (1962)',
    'hansen1965': 'K. W. Hansen, L. S. Bartell, Electron diffraction study of the structure of PF5, Inorg. Chem. 4, 1775 (1965)',
    'mcclelland1983': 'B. W. McClelland, L. Hedberg, K. Hedberg, J. Mol. Struct. 99, 309 (1983) (PCl5, gas-phase electron diffraction)',
    'smith1953': 'D. F. Smith, The microwave spectrum and structure of chlorine trifluoride, J. Chem. Phys. 21, 609 (1953)',
    'magnuson1957': 'D. W. Magnuson, Microwave spectrum and molecular structure of bromine trifluoride, J. Chem. Phys. 27, 223 (1957)',
    'robiette1971': 'A. G. Robiette, R. H. Bradley, P. N. Brier, The structures of BrF5 and IF5 by a combined analysis of electron diffraction and microwave data, J. Chem. Soc. D 1971, 1567',
    'adams1970': 'W. J. Adams, H. B. Thompson, L. S. Bartell, Structure, pseudorotation, and vibrational mode coupling in IF7, J. Chem. Phys. 53, 4040 (1970)',
    'templeton1963': 'D. H. Templeton, A. Zalkin, J. D. Forrester, S. M. Williamson, Crystal and molecular structure of xenon trioxide, J. Am. Chem. Soc. 85, 817 (1963)',
    'gundersen1970': 'G. Gundersen, K. Hedberg, J. L. Huston, Molecular structure of xenon tetroxide, XeO4, J. Chem. Phys. 52, 812 (1970)',
    'mcclelland1972': 'B. W. McClelland, G. Gundersen, K. Hedberg, Reinvestigation of the structure of dinitrogen tetroxide, N2O4, by gaseous electron diffraction, J. Chem. Phys. 56, 4541 (1972)',
    'duncan1984': 'J. L. Duncan, J. Harper, The structure of the diborane molecule, Mol. Phys. 51, 371 (1984)',
    'aarset1999': 'K. Aarset, Q. Shen, H. Thomassen, A. D. Richardson, K. Hedberg, Molecular structure of the aluminum halides, J. Phys. Chem. A 103, 1644 (1999) (gas-phase electron diffraction, values rounded to 0.01 A and 1 degree)',
    'hedberg1991': 'K. Hedberg et al., Bond lengths in free molecules of buckminsterfullerene, C60, from gas-phase electron diffraction, Science 254, 410 (1991)',
    'sears1985': 'T. J. Sears, P. R. Bunker, P. B. Davies, S. A. Johnson, V. Spirko, Diode laser absorption spectroscopy of D3O+: determination of the equilibrium structure and potential function of the oxonium ion, J. Chem. Phys. 83, 2676 (1985)',
    'rosenbaum1986': 'N. H. Rosenbaum, J. C. Owrutsky, L. M. Tack, R. J. Saykally, Velocity modulation laser spectroscopy of negative ions: the infrared spectrum of hydroxide (OH-), J. Chem. Phys. 84, 5308 (1986)',
    'kay1961': 'M. I. Kay, B. C. Frazer, A neutron diffraction refinement of the low temperature phase of NaNO2, Acta Cryst. 14, 56 (1961)',
    'effenberger1981': 'H. Effenberger, K. Mereiter, J. Zemann, Crystal structure refinements of magnesite, calcite, rhodochrosite, siderite, smithonite, and dolomite, Z. Kristallogr. 156, 233 (1981)',
    'palenik1967': 'G. J. Palenik, Crystal structure of potassium permanganate; crystal structure of potassium manganate, Inorg. Chem. 6, 503 and 507 (1967)',
    'mcginnety1972': 'J. A. McGinnety, Redetermination of the structures of potassium sulphate and potassium chromate, Acta Cryst. B28, 2845 (1972)',
    'brandon1968': 'J. K. Brandon, I. D. Brown, An accurate determination of the crystal structure of triclinic potassium dichromate, K2Cr2O7, Can. J. Chem. 46, 933 (1968)',
    'akers1968': 'C. Akers, S. W. Peterson, R. D. Willett, A refinement of the crystal structure of KSCN, Acta Cryst. B24, 1125 (1968)',
    'atoji1961': 'M. Atoji, Neutron diffraction studies of CaC2, YC2, LaC2, CeC2, TbC2, YbC2, LuC2, and UC2, J. Chem. Phys. 35, 1950 (1961)',
    'zachariasen1954': 'W. H. Zachariasen, The precise structure of orthoboric acid, Acta Cryst. 7, 305 (1954)',
    'hedberg1979': 'L. Hedberg, T. Iijima, K. Hedberg, Nickel tetracarbonyl, Ni(CO)4. I. Molecular structure by gaseous electron diffraction, J. Chem. Phys. 70, 3224 (1979)',
    'haaland1968': 'A. Haaland, J. E. Nilsson, The determination of barriers to internal rotation by means of electron diffraction. Ferrocene and ruthenocene, Acta Chem. Scand. 22, 2653 (1968)',
    'milburn1966': 'G. H. W. Milburn, M. R. Truter, The crystal structures of cis- and trans-dichlorodiammineplatinum(II), J. Chem. Soc. A 1966, 1609',
    'hawthorne1975': 'F. C. Hawthorne, R. B. Ferguson, Refinement of the crystal structure of cryolite, Can. Mineral. 13, 377 (1975)',
    'burns1963': 'J. H. Burns, P. A. Agron, H. A. Levy, Xenon tetrafluoride molecule and its thermal motion: a neutron diffraction study, Science 139, 1208 (1963)',
    'harshbarger1969': 'W. Harshbarger, G. Lee, R. F. Porter, S. H. Bauer, The structure of borazine, Inorg. Chem. 8, 1683 (1969) (bond lengths; the ring is drawn as a regular hexagon)',
    'sharpe1976': 'A. G. Sharpe, The Chemistry of Cyano Complexes of the Transition Metals, Academic Press, 1976 (Fe-C and C-N distances in the hexacyanoferrates, rounded to 0.01 A)',
    'beagley1974': 'B. Beagley, D. G. Schmidling, A re-evaluation of the molecular structure of iron pentacarbonyl, J. Mol. Struct. 22, 466 (1974)',
    'mais1972': 'R. H. B. Mais, P. G. Owston, A. M. Wood, The crystal structure of K2PtCl4 and K2PdCl4, Acta Cryst. B28, 393 (1972)',
    'ligand': 'hydrogen positions of coordinated NH3, H2O and OH groups: free-molecule geometry (N-H 1.012 A, H-N-H 106.7 deg; O-H 0.958 A, H-O-H 104.5 deg; CRC Handbook, 97th ed., section 9) or a standard O-H of 0.96 A at 109.5 deg',
}


def read_list():
    rows, seen = [], set()
    with open(LIST, encoding='utf-8') as f:
        for n, line in enumerate(f, 1):
            line = line.rstrip('\n')
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            cells = [c.strip() for c in line.split('|')]
            if len(cells) != len(COLUMNS):
                raise SystemExit('molecules.txt line %d: %d columns, expected %d' % (n, len(cells), len(COLUMNS)))
            row = {k: (None if v == '-' else v) for k, v in zip(COLUMNS, cells)}
            row['line'] = n
            if row['id'] in seen:
                raise SystemExit('molecules.txt line %d: duplicate id %s' % (n, row['id']))
            seen.add(row['id'])
            flags = {}
            for item in (row['flags'] or '').split(','):
                if item.strip():
                    k, _, v = item.strip().partition('=')
                    flags[k] = v or True
            row['flags'] = flags
            row['sources'] = [s.strip() for s in (row['sources'] or '').split(',') if s.strip()]
            rows.append(row)
    return rows


# ---------------------------------------------------------------- RDKit path

def _branch_depth(mol, start, blocked):
    """Largest number of bonds from `start` to a heavy atom on its side of the bond start-blocked."""
    seen, frontier, depth = {start, blocked}, [start], 0
    while True:
        nxt = []
        for i in frontier:
            for nb in mol.GetAtomWithIdx(i).GetNeighbors():
                j = nb.GetIdx()
                if j not in seen and nb.GetAtomicNum() > 1:
                    seen.add(j)
                    nxt.append(j)
        if not nxt:
            return depth
        frontier, depth = nxt, depth + 1


def stretch_chains(mol, conf):
    """Flag `anti`: turn every open-chain single bond to the anti arrangement of its two longest branches, so that
    an alkyl chain is the zig-zag every textbook draws instead of the random coil ETKDG returns."""
    for bond in mol.GetBonds():
        if bond.IsInRing() or bond.GetBondTypeAsDouble() != 1.0:
            continue
        b, c = bond.GetBeginAtom(), bond.GetEndAtom()
        if b.GetAtomicNum() == 1 or c.GetAtomicNum() == 1 or b.IsInRing() or c.IsInRing():
            continue
        left = [n.GetIdx() for n in b.GetNeighbors() if n.GetIdx() != c.GetIdx() and n.GetAtomicNum() > 1]
        right = [n.GetIdx() for n in c.GetNeighbors() if n.GetIdx() != b.GetIdx() and n.GetAtomicNum() > 1]
        if not left or not right:
            continue
        a = max(left, key=lambda i: (_branch_depth(mol, i, b.GetIdx()), -i))
        d = max(right, key=lambda i: (_branch_depth(mol, i, c.GetIdx()), -i))
        rdMolTransforms.SetDihedralDeg(conf, a, b.GetIdx(), c.GetIdx(), d, 180.0)


def principal_frame(xyz):
    """Centre on the centroid and rotate onto the principal axes: longest extent along x, shortest along z.
    A proper rotation (never a reflection), so chirality is kept; signs are fixed by the third moments."""
    p = xyz - xyz.mean(axis=0)
    if len(p) < 2:
        return p
    _, vec = np.linalg.eigh(p.T @ p)
    axes = []
    for k in (2, 1):
        ax = vec[:, k].copy()
        proj = p @ ax
        m3 = float(np.sum(proj ** 3))
        if abs(m3) < 1e-6:
            nz = [v for v in proj if abs(v) > 1e-6]
            m3 = nz[0] if nz else 1.0
        axes.append(ax if m3 > 0 else -ax)
    axes.append(np.cross(axes[0], axes[1]))
    return p @ np.array(axes).T


def gasteiger(mol):
    AllChem.ComputeGasteigerCharges(mol)
    q = [float(a.GetProp('_GasteigerCharge')) for a in mol.GetAtoms()]
    # no charges rather than wrong ones: the scheme has no parameters for some elements and does not conserve the
    # charge of a few charge-separated structures
    charge = sum(a.GetFormalCharge() for a in mol.GetAtoms())
    return q if all(math.isfinite(v) for v in q) and abs(sum(q) - charge) < 0.01 else None


def average_over_classes(atoms, pairs, charges):
    """One value per skeleton symmetry class: the oxygens of a carboxylate or of sulfate get the same charge although
    the Lewis structure in the SMILES draws them differently."""
    cls = symmetry_classes(atoms, pairs)
    total, count = {}, {}
    for c, q in zip(cls, charges):
        total[c] = total.get(c, 0.0) + q
        count[c] = count.get(c, 0) + 1
    return [total[c] / count[c] for c in cls]


def build_rdkit(row):
    mol = Chem.MolFromSmiles(row['smiles'])
    if mol is None:
        raise ValueError('RDKit cannot read the SMILES')
    mol = Chem.AddHs(mol)
    flags = row['flags']
    params = AllChem.ETKDGv3()
    params.randomSeed = SEED
    params.numThreads = 1
    count = 1 if 'anti' in flags else int(flags.get('conf', CONFORMERS))
    cids = list(AllChem.EmbedMultipleConfs(mol, numConfs=count, params=params))
    if not cids:
        params.useRandomCoords = True
        cids = list(AllChem.EmbedMultipleConfs(mol, numConfs=count, params=params))
    if not cids:
        raise ValueError('embedding failed')
    if 'anti' in flags:
        stretch_chains(mol, mol.GetConformer(cids[0]))
    # read the bonds now: the MMFF94 set-up applies its own aromaticity model to the molecule
    bonds = sorted((min(b.GetBeginAtomIdx(), b.GetEndAtomIdx()), max(b.GetBeginAtomIdx(), b.GetEndAtomIdx()), b.GetBondTypeAsDouble()) for b in mol.GetBonds())
    use_mmff = AllChem.MMFFHasAllMoleculeParams(mol) and 'uff' not in flags
    if not use_mmff and not AllChem.UFFHasAllMoleculeParams(mol):
        raise ValueError('neither MMFF94 nor UFF has parameters')
    props = AllChem.MMFFGetMoleculeProperties(mol, mmffVariant='MMFF94') if use_mmff else None
    best = None
    for cid in cids:
        ff = AllChem.MMFFGetMoleculeForceField(mol, props, confId=cid) if use_mmff else AllChem.UFFGetMoleculeForceField(mol, confId=cid)
        ff.Initialize()
        for _ in range(20):
            if ff.Minimize(maxIts=1000) == 0:
                break
        else:
            raise ValueError('force-field optimisation did not converge')
        energy = ff.CalcEnergy()
        if best is None or energy < best[0] - 1e-9:
            best = (energy, cid)
    conf = mol.GetConformer(best[1])
    atoms = [a.GetSymbol() for a in mol.GetAtoms()]
    xyz = np.array([[conf.GetAtomPosition(i).x, conf.GetAtomPosition(i).y, conf.GetAtomPosition(i).z] for i in range(len(atoms))])
    if 'cip' in flags:
        labels = ''.join(label for _, label in Chem.FindMolChiralCenters(mol, includeUnassigned=False, useLegacyImplementation=False))
        if labels != flags['cip']:
            raise ValueError('stereocentres are %s, the list expects %s' % (labels, flags['cip']))
    charge = sum(a.GetFormalCharge() for a in mol.GetAtoms())
    q = gasteiger(Chem.AddHs(Chem.MolFromSmiles(row['smiles'])))
    return {'atoms': atoms, 'xyz': principal_frame(xyz), 'bonds': bonds, 'charge': charge, 'charges': q,
            'method': 'rdkit-etkdg-mmff' if use_mmff else 'rdkit-etkdg-uff'}


# ---------------------------------------------------------------- instruction path

def match_graph(atoms, bonds, mol):
    """An isomorphism from the built atoms onto the atoms of the SMILES molecule (elements and connectivity)."""
    import networkx as nx
    from networkx.algorithms import isomorphism
    g1, g2 = nx.Graph(), nx.Graph()
    for i, s in enumerate(atoms):
        g1.add_node(i, el=s)
    for i, j, _ in bonds:
        g1.add_edge(i, j)
    for a in mol.GetAtoms():
        g2.add_node(a.GetIdx(), el=a.GetSymbol())
    for b in mol.GetBonds():
        g2.add_edge(b.GetBeginAtomIdx(), b.GetEndAtomIdx())
    gm = isomorphism.GraphMatcher(g1, g2, node_match=lambda x, y: x['el'] == y['el'])
    return next(gm.isomorphisms_iter(), None)


def build_instruction(row, radii):
    built = molgeom.build(row['geom'], radii)
    atoms, bonds = built['atoms'], built['bonds']
    _, charge = parse_formula(row['formula'])
    charges = None
    if row['smiles']:
        mol = Chem.MolFromSmiles(row['smiles'])
        if mol is None:
            raise ValueError('RDKit cannot read the SMILES')
        mol = Chem.AddHs(mol)
        if sum(a.GetFormalCharge() for a in mol.GetAtoms()) != charge:
            raise ValueError('charge of the SMILES differs from the formula')
        mapping = match_graph(atoms, bonds, mol)
        if mapping is None:
            raise ValueError('the built bonds do not match the SMILES')
        q = gasteiger(mol)
        if q is not None:
            charges = [q[mapping[i]] for i in range(len(atoms))]
    xyz = built['xyz'] - built['xyz'].mean(axis=0)
    if built['estimated']:
        method = 'vsepr'
    else:
        if not row['sources']:
            raise ValueError('every length is given, so the line needs a citation in `sources`')
        method = 'literature'
    return {'atoms': atoms, 'xyz': xyz, 'bonds': bonds, 'charge': charge, 'charges': charges, 'method': method}


# ---------------------------------------------------------------- main

def order_value(o):
    return int(o) if float(o).is_integer() else float(o)


def main():
    elements = load_json(os.path.join(DATA_DIR, 'elements.json'))['elements']
    radii = molgeom.Radii(elements)
    known_categories = {c[0] for c in CATEGORIES}
    rows = read_list()
    records, failures = [], []
    for row in rows:
        try:
            if row['category'] not in known_categories:
                raise ValueError('unknown category %r' % row['category'])
            for k in row['sources']:
                if k not in REFERENCES:
                    raise ValueError('unknown citation key %r' % k)
            for k in ('zh', 'en', 'de', 'formula'):
                if not row[k]:
                    raise ValueError('missing %s' % k)
            res = build_instruction(row, radii) if row['geom'] else build_rdkit(row)
            counts, charge = parse_formula(row['formula'])
            if count_atoms(res['atoms']) != counts:
                raise ValueError('formula says %r, the structure has %r' % (counts, count_atoms(res['atoms'])))
            if res['charge'] != charge:
                raise ValueError('formula charge %+d, structure charge %+d' % (charge, res['charge']))
            pairs = [(i, j) for i, j, _ in res['bonds']]
            charges = res['charges']
            if charges is not None:
                charges = [clean_float(q, 3) for q in average_over_classes(res['atoms'], pairs, charges)]
            flat_bonds = []
            for i, j, o in res['bonds']:
                flat_bonds += [i, j, order_value(o)]
            rec = {
                'id': row['id'],
                'formula': row['formula'],
                'name': {'zh': row['zh'], 'en': row['en'], 'de': row['de']},
                'category': row['category'],
                'species': row['flags'].get('species') or None,
                'smiles': row['smiles'],
                'atoms': res['atoms'],
                'xyz': [clean_float(v, 3) for v in res['xyz'].reshape(-1)],
                'bonds': flat_bonds,
                'charges': charges,
                'charge': res['charge'],
                'method': res['method'],
            }
            if row['geom']:
                rec['sources'] = row['sources']
            records.append(rec)
        except Exception as err:  # collect every bad line before stopping
            failures.append('line %d %s: %s' % (row['line'], row['id'], err))
    if failures:
        print('\n'.join(failures))
        raise SystemExit('%d of %d lines failed; nothing written' % (len(failures), len(rows)))
    used = sorted({k for r in records for k in r.get('sources', [])})
    head = {
        'format': 'velophi-molecules',
        'version': 1,
        'generator': {'script': 'scripts/chem/build_molecules.py', 'seed': SEED, 'conformers': CONFORMERS,
                      **package_versions('rdkit', 'numpy', 'networkx')},
        'categories': [{'id': c[0], 'name': {'zh': c[1], 'en': c[2], 'de': c[3]}} for c in CATEGORIES],
        'references': {k: REFERENCES[k] for k in used},
    }
    text = write_records(OUT, head, 'molecules', records)
    by_method = {}
    for r in records:
        by_method[r['method']] = by_method.get(r['method'], 0) + 1
    print('wrote %s: %d molecules, %d bytes' % (os.path.relpath(OUT), len(records), len(text.encode('utf-8'))))
    print('by method: ' + ', '.join('%s %d' % kv for kv in sorted(by_method.items())))


if __name__ == '__main__':
    main()
