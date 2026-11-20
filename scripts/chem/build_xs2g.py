"""Build the two-group cross-section sets of the reactor workshop (26.64, D262, D277).

  python -I scripts/chem/build_xs2g.py [--check]

Reads   src/chem/data/nuclides.json   half-lives of I-135, Xe-135 and Pm-149 (NUBASE2020)
Writes  src/chem/data/xs2g.json       the 12 materials, the kinetics, poison and decay-heat data; the front end loads
                                      it on demand and hands it to the Rust core with `reactorSetData`

THESE ARE TEACHING VALUES. Two energy groups (fast above 0.625 eV, thermal below), homogenised cells, no spectrum
calculation: the numbers are textbook constants and simple combinations of them, chosen so that the four kinds of
lattice of the workshop behave as their real counterparts do (natural uranium is critical with graphite or heavy
water and never with light water; light water needs enrichment and a tight lattice). They are not evaluated
nuclear data and must not be used for design or safety analysis. Every value names its source in `src`:

  lamarsh   J.R. Lamarsh, A.J. Baratta, Introduction to Nuclear Engineering, 3rd ed., Prentice Hall 2001:
            Table 5.2 (thermal diffusion parameters of moderators at 20 C), Table 5.3 (fast-group constants of
            moderators), Table II.2 / 3.4 (2200 m/s data of U-235 and U-238), Table 7.5 (fission product yields)
  iaea2d    IAEA 2-D PWR benchmark, Argonne Code Center Benchmark Problem Book ANL-7416 Suppl. 2 (1977), problem
            11-A2 (the rodded assembly adds 0.045 /cm of thermal absorption)
  orpheus   the six delayed-neutron groups quoted in docs/research/2664/chemistry.md section 5 (source 31)
  ijs       TRIGA reactor simulator physics manual (Jozef Stefan Institute): xenon-135 absorption cross-section
  nubase    NUBASE2020 half-lives (src/chem/data/nuclides.json)
  tk        N.E. Todreas, M.S. Kazimi, Nuclear Systems I: decay heat P/P0 = 0.066 [t^-0.2 - (t + T)^-0.2] (t in s)
  derived   computed below from the cited inputs (the formula is in the code and in `notes`)
  teaching  chosen for this model; the reason is in `notes`

The textbook numbers were typed from the standard tables; before a release they should be compared once more with
the printed tables (docs/chem/DATA_SOURCES.md says the same).

The output is reproducible: the same inputs give the same bytes.
"""
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
NUCLIDES = os.path.join(ROOT, 'src', 'chem', 'data', 'nuclides.json')
OUT = os.path.join(ROOT, 'src', 'chem', 'data', 'xs2g.json')

T_REF = 293.0                       # K, the temperature of the tabulated constants
MAXWELL = math.sqrt(math.pi) / 2    # average of a 1/v cross-section over a Maxwellian at 293 K, in units of sigma(2200 m/s)
LETHARGY = 18.2                     # ln(2 MeV / 0.025 eV): the lethargy a fission neutron crosses to become thermal
BARN = 1.0                          # number densities below are in 1/(barn cm), so N * sigma[barn] is 1/cm

# 2200 m/s data (lamarsh)
U235 = {'a': 680.8, 'f': 582.2, 'nu': 2.418}
U238 = {'a': 2.70}
ZR_A = 0.185
# fast-group microscopic teaching values (barn)
U235_F1, U235_C1, NU1_235 = 12.0, 6.0, 2.43    # epithermal fission and capture of U-235 (group averages), neutrons per fission
NU1_238 = 2.8                                   # neutrons per fast fission of U-238


def r(x, digits=5):
    return float('%.*g' % (digits, x))


def mix(parts):
    """Volume-weighted mixture of cross-section sets: sums for the Sigmas, the transport cross-section 1/(3D) for D."""
    out = {}
    for key in ('a1', 'a2', 's12', 'nf1', 'nf2', 'f1', 'f2'):
        out[key] = sum(v * x[key] for v, x in parts)
    for key in ('D1', 'D2'):
        out[key] = 1.0 / sum(v / x[key] for v, x in parts)
    return out


def fuel(n_u, zeta, i_eff, sigma_f1_238, struct_a2, d1, d2):
    """A fuel cell with uranium number density n_u (1/(barn cm), averaged over the cell).

    Returns the set at enrichment 0 and its change per weight percent of U-235 (atom fraction taken equal to the
    weight fraction), and the U-238 resonance capture, which carries the Doppler effect.
    thermal: Maxwellian averages of the 2200 m/s data, divided by the self-shielding (disadvantage) factor zeta
    fast:    U-238 resonance capture N * I_eff / lethargy, fast fission of U-238, epithermal fission and capture of U-235
    """
    c28 = n_u * i_eff / LETHARGY
    f28 = n_u * sigma_f1_238
    base = {
        'D1': d1, 'D2': d2,
        'a1': c28 + f28, 'nf1': NU1_238 * f28, 'f1': f28,
        'a2': MAXWELL * n_u * U238['a'] / zeta + struct_a2, 'nf2': 0.0, 'f2': 0.0,
        's12': 0.0,
    }
    per = {
        'a1': n_u / 100 * (U235_F1 + U235_C1) - (c28 + f28) / 100,
        'nf1': n_u / 100 * NU1_235 * U235_F1 - NU1_238 * f28 / 100,
        'f1': n_u / 100 * U235_F1 - f28 / 100,
        'a2': MAXWELL * n_u / 100 * (U235['a'] - U238['a']) / zeta,
        'nf2': MAXWELL * n_u / 100 * U235['nu'] * U235['f'] / zeta,
        'f2': MAXWELL * n_u / 100 * U235['f'] / zeta,
    }
    return base, per, c28


def decay_heat_groups():
    """Exponential groups for the decay heat after long operation, P/P0 = 0.066 t^-0.2 (t in s).

    One group per half decade of the decay constant, from 0.316 /s down to 1e-9 /s; the amplitudes are a
    non-negative least-squares fit of the relative error on 1 s ... 1e8 s. Groups faster than 0.316 /s are left out
    on purpose: the power law diverges towards t = 0, and without them the share at the moment of shutdown (the sum
    of the amplitudes) stays at about 7 % of the power, as observed. In the core every group is fed in proportion
    to the power and decays with its constant, so a finite operating time gives the bracket of the textbook formula
    by itself.
    """
    import numpy as np
    from scipy.optimize import nnls
    lam = [10.0 ** (-0.5 - 0.5 * k) for k in range(18)]         # 0.316 /s ... 1e-9 /s
    t = np.logspace(0, 8, 321)
    target = 0.066 * t ** -0.2
    a = np.exp(-np.outer(t, lam)) / target[:, None]
    coeff, _ = nnls(a, np.ones_like(t))
    coeff = [r(float(c), 4) for c in coeff]
    fit = np.exp(-np.outer(t, lam)) @ np.array(coeff)
    err = float(np.max(np.abs(fit / target - 1.0)))
    keep = [(l, c) for l, c in zip(lam, coeff) if c > 0.0]
    return [r(l, 6) for l, _ in keep], [c for _, c in keep], err


def half_life(table, z, a):
    for row in table['nuclides']:
        if row[0] == z and row[1] == a and row[2] == 0:
            return row[4]
    raise SystemExit('nuclide %d-%d not in nuclides.json' % (z, a))


def build():
    with open(NUCLIDES, encoding='utf-8') as fh:
        nuclide_bytes = fh.read()
    table = json.loads(nuclide_bytes)

    # ---- moderators and structure (reference state 293 K) ----
    water = {'D1': 1.13, 'D2': 0.16, 'a1': 0.0, 'a2': 0.0197, 's12': 0.0419, 'nf1': 0.0, 'nf2': 0.0, 'f1': 0.0, 'f2': 0.0}
    heavy = {'D1': 1.29, 'D2': 0.87, 'a1': 0.0, 'a2': 9.3e-5, 's12': 0.00985, 'nf1': 0.0, 'nf2': 0.0, 'f1': 0.0, 'f2': 0.0}
    graphite = {'D1': 1.016, 'D2': 0.84, 'a1': 0.0, 'a2': 2.4e-4, 's12': 0.00276, 'nf1': 0.0, 'nf2': 0.0, 'f1': 0.0, 'f2': 0.0}
    # stainless steel 304: N(Fe) 0.0600, N(Cr) 0.0165, N(Ni) 0.0075 per barn cm; sigma_a(2200) 2.56, 3.1, 4.5 barn
    steel_a2 = MAXWELL * (0.0600 * 2.56 + 0.0165 * 3.1 + 0.0075 * 4.5)
    steel = {'D1': 1.1, 'D2': 0.29, 'a1': 0.003, 'a2': r(steel_a2, 3), 's12': 0.001, 'nf1': 0.0, 'nf2': 0.0, 'f1': 0.0, 'f2': 0.0}
    # zirconium: N 0.0429 per barn cm, sigma_a(2200) 0.185 barn, sigma_s 6.4 barn
    zr_a2 = MAXWELL * 0.0429 * ZR_A
    zircaloy = {'D1': 1.2, 'D2': r(1.0 / (3.0 * (0.0429 * 6.4 + zr_a2)), 3), 'a1': 0.0005, 'a2': r(zr_a2, 3), 's12': 0.0003, 'nf1': 0.0, 'nf2': 0.0, 'f1': 0.0, 'f2': 0.0}
    cavity = {'D1': 5.0, 'D2': 5.0, 'a1': 1e-6, 'a2': 1e-6, 's12': 0.0, 'nf1': 0.0, 'nf2': 0.0, 'f1': 0.0, 'f2': 0.0}
    b4c = {'D1': 1.2, 'D2': 0.3, 'a1': 0.008, 'a2': 0.40, 's12': 0.005, 'nf1': 0.0, 'nf2': 0.0, 'f1': 0.0, 'f2': 0.0}
    agincd = {'D1': 1.2, 'D2': 0.3, 'a1': 0.015, 'a2': 0.25, 's12': 0.003, 'nf1': 0.0, 'nf2': 0.0, 'f1': 0.0, 'f2': 0.0}
    # coolant channel: a pressure tube with light water, 50 % water, 10 % zircaloy, 40 % gap
    coolant = mix([(0.5, water), (0.1, zircaloy), (0.4, cavity)])
    coolant = {k: r(v, 4) for k, v in coolant.items()}
    source = {'D1': 1.1, 'D2': 0.6, 'a1': 0.001, 'a2': 0.02, 's12': 0.001, 'nf1': 0.0, 'nf2': 0.0, 'f1': 0.0, 'f2': 0.0}

    # ---- fuels ----
    # natural uranium metal (19.1 g/cm3: 0.04833 atoms per barn cm), one rod in an otherwise empty channel: 2 % of the cell
    nat0, nat_per, nat_c28 = fuel(n_u=0.02 * 0.04833, zeta=1.4, i_eff=10.0, sigma_f1_238=0.04, struct_a2=1.5e-4, d1=1.6, d2=2.0)
    nat = {k: r(nat0[k] + 0.72 * nat_per.get(k, 0.0)) for k in nat0}
    # UO2 (10.4 g/cm3: 0.0232 uranium atoms per barn cm), rod bundle without moderator: 45 % of the cell, zircaloy 12 %
    leu0, leu_per, leu_c28 = fuel(n_u=0.45 * 0.0232, zeta=1.1, i_eff=20.0, sigma_f1_238=0.10, struct_a2=0.12 * zr_a2, d1=2.0, d2=0.85)
    leu_ref = 3.0
    leu = {k: r(leu0[k] + leu_ref * leu_per.get(k, 0.0)) for k in leu0}

    lam_dh, a_dh, err_dh = decay_heat_groups()
    ln2 = math.log(2.0)

    def material(id_, kind, zh, en, de, xs, src, note, dep=None):
        m = {'id': id_, 'kind': kind, 'name': {'zh': zh, 'en': en, 'de': de}, 'xs': xs, 'src': src, 'note': note}
        if dep:
            m['dep'] = dep
        return m

    tab = {'D1': 'lamarsh', 'D2': 'lamarsh', 'a2': 'lamarsh', 's12': 'lamarsh', 'a1': 'teaching'}
    liquid = {'density': [2.0e-4, 2.6e-6], 'oneOverV': True}
    materials = [
        material('fuel_nat', 'fuel', '天然铀燃料', 'Natural-uranium fuel', 'Natururan-Brennstoff', nat,
                 {'D1': 'teaching', 'D2': 'teaching', 'a1': 'derived', 'a2': 'derived', 's12': 'teaching', 'nf1': 'derived', 'nf2': 'derived', 'f1': 'derived', 'f2': 'derived'},
                 'Uranium metal rod in an otherwise empty channel: 2 % of the cell is uranium (0.711 wt% U-235). Thermal: Maxwellian averages of the 2200 m/s data divided by a self-shielding factor 1.4 (a rod of about 3 cm), plus 1.5e-4 /cm for can, air and impurities. Fast: U-238 resonance capture with an effective resonance integral of 10 b over the lethargy 18.2, fast fission of U-238 with 0.04 b, epithermal U-235 fission 12 b and capture 6 b. D (1.6 and 2.0 cm) chosen between a moderator and a cavity: the channel is mostly empty. For lattices with a large pitch (about 20 cm) in graphite or heavy water.',
                 {'enrichment': 0.72, 'adjustable': False, 'base': {k: r(v) for k, v in nat0.items()}, 'perPercent': {k: r(v) for k, v in nat_per.items()},
                  'c28': r(nat_c28), 'doppler': 0.005, 'oneOverV': True, 'damage_K': 1405.0}),
        material('fuel_leu', 'fuel', '低浓铀燃料', 'Low-enriched uranium fuel', 'Schwach angereicherter Uranbrennstoff', leu,
                 {'D1': 'derived', 'D2': 'derived', 'a1': 'derived', 'a2': 'derived', 's12': 'teaching', 'nf1': 'derived', 'nf2': 'derived', 'f1': 'derived', 'f2': 'derived'},
                 'UO2 rod bundle without moderator: 45 % of the cell is UO2, 12 % zircaloy; enrichment adjustable from 0.72 to 5 wt% (reference 3 %). Thermal: Maxwellian averages divided by a self-shielding factor 1.1. Fast: effective resonance integral 20 b, fast fission of U-238 0.10 b, epithermal U-235 fission 12 b and capture 6 b. For tight lattices (pitch of 1 to 2 cm) with light water.',
                 {'enrichment': leu_ref, 'adjustable': True, 'min': 0.72, 'max': 5.0, 'base': {k: r(v) for k, v in leu0.items()}, 'perPercent': {k: r(v) for k, v in leu_per.items()},
                  'c28': r(leu_c28), 'doppler': 0.006, 'oneOverV': True, 'damage_K': 3120.0}),
        material('water', 'moderator', '轻水', 'Light water', 'Leichtes Wasser', water, tab,
                 'H2O at 293 K (Lamarsh Tables 5.2 and 5.3); fast absorption neglected. Density with temperature by a quadratic fit to pressurised liquid water, 1 - 2.0e-4 dT - 2.6e-6 dT^2 (dT above 293 K; 0.73 at 580 K); the Sigmas follow the density and the void fraction, D its inverse, thermal absorption also 1/v.', dict(liquid)),
        material('heavy_water', 'moderator', '重水', 'Heavy water', 'Schweres Wasser', heavy, tab,
                 'D2O with 0.25 % H2O at 293 K (Lamarsh Tables 5.2 and 5.3); the same density fit as light water.', dict(liquid)),
        material('graphite', 'solid', '石墨', 'Graphite', 'Graphit', graphite, tab,
                 'Reactor graphite, 1.60 g/cm3, at 293 K (Lamarsh Tables 5.2 and 5.3); thermal absorption 1/v with its temperature.', {'oneOverV': True}),
        material('steel', 'structure', '不锈钢', 'Stainless steel', 'Edelstahl', steel,
                 {'D1': 'teaching', 'D2': 'teaching', 'a1': 'teaching', 'a2': 'derived', 's12': 'teaching'},
                 'Type 304: thermal absorption from the 2200 m/s cross-sections of Fe, Cr and Ni (2.56, 3.1, 4.5 b) and their number densities; reflector and structure.'),
        material('zircaloy', 'structure', '锆合金', 'Zircaloy', 'Zircaloy', zircaloy,
                 {'D1': 'teaching', 'D2': 'derived', 'a1': 'teaching', 'a2': 'derived', 's12': 'teaching'},
                 'Zirconium, 0.0429 atoms per barn cm, absorption 0.185 b, scattering 6.4 b.'),
        material('b4c', 'absorber', '碳化硼控制棒', 'Boron-carbide control rod', 'Borcarbid-Steuerstab', b4c,
                 {'D1': 'teaching', 'D2': 'teaching', 'a1': 'teaching', 'a2': 'teaching', 's12': 'teaching'},
                 'Effective values of a homogenised rod cell: a real B4C rod is black to thermal neutrons, which diffusion theory cannot represent; 0.40 /cm makes a fully inserted cell strongly absorbing. Scale: the rodded assembly of the IAEA benchmark adds 0.045 /cm with rods in about a tenth of its area.'),
        material('agincd', 'absorber', '银铟镉控制棒', 'Silver-indium-cadmium control rod', 'Silber-Indium-Cadmium-Steuerstab', agincd,
                 {'D1': 'teaching', 'D2': 'teaching', 'a1': 'teaching', 'a2': 'teaching', 's12': 'teaching'},
                 'Effective values of a homogenised rod cell: weaker than B4C for thermal neutrons, stronger above (resonances of indium and silver).'),
        material('coolant', 'coolant', '冷却剂通道', 'Coolant channel', 'Kühlkanal', coolant,
                 {'D1': 'derived', 'D2': 'derived', 'a1': 'derived', 'a2': 'derived', 's12': 'derived'},
                 'A pressure tube with light-water coolant: 50 % water, 10 % zircaloy, 40 % gap (volume-weighted Sigmas, 1/D weighted). The water part follows the coolant temperature and void.', {'density': [2.0e-4, 2.6e-6], 'oneOverV': True, 'liquidShare': {'a2': r(0.5 * water['a2'] / coolant['a2'], 4), 's12': r(0.5 * water['s12'] / coolant['s12'], 4)}}),
        material('void', 'void', '空腔', 'Cavity', 'Hohlraum', cavity,
                 {'D1': 'teaching', 'D2': 'teaching', 'a1': 'teaching', 'a2': 'teaching', 's12': 'teaching'},
                 'An empty cell. Neutrons stream through a cavity without collisions, which diffusion theory does not describe; a large diffusion coefficient (5 cm) stands in for it.'),
        material('source', 'source', '中子源', 'Neutron source', 'Neutronenquelle', source,
                 {'D1': 'teaching', 'D2': 'teaching', 'a1': 'teaching', 'a2': 'teaching', 's12': 'teaching'},
                 'A start-up source in a small steel capsule. The source strength is a property of the reactor document (neutrons per second); the cell itself is a weak absorber.'),
    ]

    doc = {
        'format': 'velophi-xs2g',
        'version': 1,
        'generator': {'script': 'scripts/chem/build_xs2g.py', 'sources': {'nuclides.json': hashlib.sha256(nuclide_bytes.encode('utf-8')).hexdigest()}},
        'teaching': 'Teaching values for a two-group diffusion model with homogenised cells. Not evaluated nuclear data; not for design or safety analysis.',
        'sources': {
            'lamarsh': 'J.R. Lamarsh, A.J. Baratta, Introduction to Nuclear Engineering, 3rd ed., Prentice Hall 2001: Tables 5.2, 5.3, 7.5 and the 2200 m/s data of Table II.2',
            'iaea2d': 'IAEA 2-D PWR benchmark, ANL-7416 Supplement 2 (1977), problem 11-A2',
            'orpheus': 'ORPHEUS teaching code, theory manual, reactor kinetics (docs/research/2664/chemistry.md, source 31)',
            'ijs': 'TRIGA reactor simulator physics manual, Jozef Stefan Institute (docs/research/2664/chemistry.md, source 28)',
            'nubase': 'NUBASE2020: F.G. Kondev et al., Chinese Physics C 45 (2021) 030001',
            'tk': 'N.E. Todreas, M.S. Kazimi, Nuclear Systems I, decay heat after long operation P/P0 = 0.066 t^-0.2',
            'derived': 'computed by scripts/chem/build_xs2g.py from the cited inputs',
            'teaching': 'chosen for this teaching model; see the note of the entry',
        },
        'groups': {
            'boundary_eV': 0.625, 'T_ref_K': T_REF,
            'v1_cm_s': 3.0e6, 'v2_cm_s': 2.48e5,
            'note': 'v2: mean speed of a Maxwellian at 293 K (2/sqrt(pi) times 2200 m/s), grows with the square root of the moderator temperature; v1: chosen so the slowing-down time 1/(v1 Sigma_s12) is 8 microseconds in water and 0.12 ms in graphite',
            'src': {'v1_cm_s': 'teaching', 'v2_cm_s': 'derived'},
        },
        'kinetics': {
            'beta': [2.584e-4, 1.520e-3, 1.391e-3, 3.070e-3, 1.102e-3, 2.584e-4],
            'lambda': [0.013, 0.032, 0.119, 0.318, 1.403, 3.929],
            'src': 'orpheus',
        },
        'fission': {'energy_J': 3.204e-11, 'note': '200 MeV per fission', 'src': 'lamarsh'},
        'poisons': {
            'gammaI': 0.0639, 'gammaXe': 0.00237, 'gammaPm': 0.01071,
            'lambdaI': r(ln2 / half_life(table, 53, 135), 6), 'lambdaXe': r(ln2 / half_life(table, 54, 135), 6), 'lambdaPm': r(ln2 / half_life(table, 61, 149), 6),
            'sigmaXe_b': 2.65e6, 'sigmaSm_b': 4.1e4,
            'src': {'gammaI': 'lamarsh', 'gammaXe': 'lamarsh', 'gammaPm': 'lamarsh', 'lambdaI': 'nubase', 'lambdaXe': 'nubase', 'lambdaPm': 'nubase', 'sigmaXe_b': 'ijs', 'sigmaSm_b': 'lamarsh'},
            'note': 'Yields per fission of U-235 by thermal neutrons; the absorption cross-sections are thermal averages used as they are (no 1/v correction).',
        },
        'decayHeat': {'lambda': lam_dh, 'a': a_dh, 'fitError': r(err_dh, 2), 'src': 'tk',
                      'note': 'Non-negative least-squares fit of 0.066 t^-0.2 by exponential groups on 1 s to 1e8 s (relative error fitError). The sum of a is the decay-heat share of the power in equilibrium.'},
        'materials': materials,
    }
    text = json.dumps(doc, ensure_ascii=False, indent=1) + '\n'
    return text, doc


def main():
    text, doc = build()
    data = text.encode('utf-8')
    if '--check' in sys.argv[1:]:
        with open(OUT, 'rb') as fh:
            same = fh.read() == data
        print('xs2g.json is %s' % ('up to date' if same else 'DIFFERENT from a fresh build'))
        sys.exit(0 if same else 1)
    with open(OUT, 'wb') as fh:
        fh.write(data)
    print('%d materials, %d decay-heat groups (fit error %.3g, equilibrium share %.4f), %d bytes' % (
        len(doc['materials']), len(doc['decayHeat']['a']), doc['decayHeat']['fitError'], sum(doc['decayHeat']['a']), len(data)))
    for m in doc['materials']:
        x = m['xs']
        print('  %-12s D %.4g %.4g  a %.5g %.5g  s12 %.5g  nf %.5g %.5g' % (m['id'], x['D1'], x['D2'], x['a1'], x['a2'], x['s12'], x['nf1'], x['nf2']))


if __name__ == '__main__':
    main()
