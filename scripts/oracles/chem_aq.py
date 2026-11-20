"""Reference values for the aqueous equilibrium of the chemistry core (26.64, D275): PHREEQC 3 on the database the
core itself reads (tests/fixtures/chem/velophi.dat — the same constants and the same activity model, so a difference
is a difference of the implementation, not of the model).

  <venv python> -I scripts/oracles/chem_aq.py      →  tests/fixtures/chem/aq.json

Every case starts from 1 kg of pure water at the case's temperature and adds neutral reagents (PHREEQC keyword
REACTION), optionally in contact with solids (EQUILIBRIUM_PHASES) or a gas phase of fixed volume (GAS_PHASE). The
core receives the same amounts as species of its network. Recorded: pH, ionic strength, mass of water, the
molalities of named species, the amounts of the solids and of the gases.

Families: acids, bases and salts over five decades of concentration; buffers; titration curves (strong–strong,
weak–strong, polyprotic, carbonate with acid, ammonia with acid); solubility and the common-ion effect;
complexation; mixing with precipitation; temperature from 0 to 90 °C; gas solubility in a closed head space.
"""
import json, os, sys
from collections import OrderedDict
from pathlib import Path

import phreeqpython

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
FIX = os.path.join(ROOT, 'tests', 'fixtures', 'chem')

with open(os.path.join(ROOT, 'src', 'chem', 'data', 'aqueous.json'), encoding='utf-8') as fh:
    DB = json.load(fh)
PQ = {s['id']: s['pq'] for s in DB['species']}
PHASE = {s['id']: s['phase'] for s in DB['species']}

# Neutral reagents: PHREEQC formula (in the element names of velophi.dat) and the same amount as species of the core
REAGENT = {
    'HCl': ('HCl', {'H+': 1, 'Cl-': 1}),
    'HNO3': ('HNO3', {'H+': 1, 'NO3-': 1}),
    'H2SO4': ('H2SO4', {'H+': 2, 'SO4-2': 1}),
    'H3PO4': ('H3PO4', {'H+': 3, 'PO4-3': 1}),
    'HF': ('HF', {'H+': 1, 'F-': 1}),
    'HAc': ('H(Acetate)', {'H(Acetate)': 1}),
    'H2S': ('H2[S-2]', {'H+': 1, 'HS-': 1}),
    'H3BO3': ('H3BO3', {'H3BO3': 1}),
    'CO2': ('CO2', {'CO2': 1}),
    'SO2': ('[S4]O2', {'SO2': 1}),
    'H2C2O4': ('H2(Oxalate)', {'H+': 2, 'Oxalate-2': 1}),
    'NaOH': ('NaOH', {'Na+': 1, 'OH-': 1}),
    'KOH': ('KOH', {'K+': 1, 'OH-': 1}),
    'Ca(OH)2': ('Ca(OH)2', {'Ca+2': 1, 'OH-': 2}),
    'Ba(OH)2': ('Ba(OH)2', {'Ba+2': 1, 'OH-': 2}),
    'NH3': ('[N-3]H3', {'NH3': 1}),
    'NaCl': ('NaCl', {'Na+': 1, 'Cl-': 1}),
    'KCl': ('KCl', {'K+': 1, 'Cl-': 1}),
    'KNO3': ('KNO3', {'K+': 1, 'NO3-': 1}),
    'NaAc': ('Na(Acetate)', {'Na+': 1, 'Acetate-': 1}),
    'NH4Cl': ('[N-3]H4Cl', {'NH4+': 1, 'Cl-': 1}),
    'NH4Ac': ('[N-3]H4(Acetate)', {'NH4+': 1, 'Acetate-': 1}),
    '(NH4)2SO4': ('([N-3]H4)2SO4', {'NH4+': 2, 'SO4-2': 1}),
    'Na2CO3': ('Na2CO3', {'Na+': 2, 'CO3-2': 1}),
    'NaHCO3': ('NaHCO3', {'Na+': 1, 'H+': 1, 'CO3-2': 1}),
    'Na3PO4': ('Na3PO4', {'Na+': 3, 'PO4-3': 1}),
    'Na2HPO4': ('Na2HPO4', {'Na+': 2, 'H+': 1, 'PO4-3': 1}),
    'NaH2PO4': ('NaH2PO4', {'Na+': 1, 'H+': 2, 'PO4-3': 1}),
    'Na2SO4': ('Na2SO4', {'Na+': 2, 'SO4-2': 1}),
    'NaF': ('NaF', {'Na+': 1, 'F-': 1}),
    'Na2S': ('Na2[S-2]', {'Na+': 2, 'HS-': 1, 'H+': -1}),
    'Na2SO3': ('Na2[S4]O3', {'Na+': 2, 'SO3-2': 1}),
    'NaClO': ('Na[Cl1]O', {'Na+': 1, 'ClO-': 1}),
    'KSCN': ('K(Thiocyanate)', {'K+': 1, 'Thiocyanate-': 1}),
    'KI': ('KI', {'K+': 1, 'I-': 1}),
    'AlCl3': ('AlCl3', {'Al+3': 1, 'Cl-': 3}),
    'FeCl3': ('[Fe3]Cl3', {'Fe+3': 1, 'Cl-': 3}),
    'FeSO4': ('FeSO4', {'Fe+2': 1, 'SO4-2': 1}),
    'CuSO4': ('CuSO4', {'Cu+2': 1, 'SO4-2': 1}),
    'ZnCl2': ('ZnCl2', {'Zn+2': 1, 'Cl-': 2}),
    'MgCl2': ('MgCl2', {'Mg+2': 1, 'Cl-': 2}),
    'CaCl2': ('CaCl2', {'Ca+2': 1, 'Cl-': 2}),
    'BaCl2': ('BaCl2', {'Ba+2': 1, 'Cl-': 2}),
    'AgNO3': ('AgNO3', {'Ag+': 1, 'NO3-': 1}),
    'Pb(NO3)2': ('Pb(NO3)2', {'Pb+2': 1, 'NO3-': 2}),
    'K2CrO4': ('K2CrO4', {'K+': 2, 'CrO4-2': 1}),
    'Na2EDTA': ('Na2H2(Edta)', {'Na+': 2, 'H+': 2, 'Edta-4': 1}),
    'HIO3': ('H[I5]O3', {'H+': 1, 'IO3-': 1}),
    'KIO3': ('K[I5]O3', {'K+': 1, 'IO3-': 1}),
    'KBrO3': ('K[Br5]O3', {'K+': 1, 'BrO3-': 1}),
    'Na2S4O6': ('Na2[S25]4O6', {'Na+': 2, 'S4O6-2': 1}),
    'K2S2O8': ('K2[S7]2O8', {'K+': 2, 'S2O8-2': 1}),
}
for name, (formula, parts) in REAGENT.items():
    for sid in parts:
        if sid not in PQ:
            raise SystemExit('reagent %s names the unknown species %s' % (name, sid))

CASES = []


def case(cid, reagents, t=25.0, solids=None, start=None, gas=None, watch=()):
    """reagents {name: mol}; solids [phase ids allowed]; start {phase id: mol}; gas {'volume_L', 'species': [ids], 'initial': {id: mol}}."""
    for p in list(solids or []) + list(start or {}):
        if PHASE.get(p) != 's':
            raise SystemExit('%s: %s is not a solid of the database' % (cid, p))
    for g in (gas or {}).get('species', []):
        if PHASE.get(g) != 'g':
            raise SystemExit('%s: %s is not a gas of the database' % (cid, g))
    CASES.append(dict(id=cid, t=t, reagents=reagents, solids=list(solids or []), start=dict(start or {}), gas=gas, watch=list(watch)))


def logspace(lo, hi, n):
    return [10 ** (lo + (hi - lo) * k / (n - 1)) for k in range(n)]


# 1. Acids, bases, salts
for name, concs, watch in [
    ('HCl', [1e-5, 1e-4, 1e-3, 1e-2, 0.1, 0.5], []), ('HNO3', [1e-3, 0.1], []), ('H2SO4', [1e-4, 1e-3, 1e-2, 0.1, 0.5], ['HSO4-']),
    ('H3PO4', [1e-4, 1e-3, 1e-2, 0.1], ['H2PO4-', 'H3PO4']), ('HF', [1e-3, 1e-2, 0.1], ['HF']), ('HAc', [1e-5, 1e-4, 1e-3, 1e-2, 0.1, 1.0], ['Acetate-']),
    ('H2S', [1e-3, 0.05], ['H2S']), ('H3BO3', [1e-2, 0.5], []), ('CO2', [1e-5, 1e-3, 0.03], ['HCO3-']), ('SO2', [1e-3, 0.1], ['HSO3-']),
    ('H2C2O4', [1e-3, 0.05], ['H(Oxalate)-']), ('NaOH', [1e-5, 1e-4, 1e-3, 1e-2, 0.1, 0.5], []), ('KOH', [1e-3, 0.1], []),
    ('Ca(OH)2', [1e-4, 1e-3, 0.01], ['CaOH+']), ('Ba(OH)2', [1e-3, 0.05], []), ('NH3', [1e-5, 1e-4, 1e-3, 1e-2, 0.1, 1.0], ['NH4+']),
    ('NaCl', [1e-3, 0.1, 0.5], []), ('NaAc', [1e-3, 1e-2, 0.1, 0.5], ['H(Acetate)']), ('NH4Cl', [1e-3, 1e-2, 0.1, 0.5], ['NH3']),
    ('NH4Ac', [1e-2, 0.1], []), ('(NH4)2SO4', [1e-2, 0.1], []), ('Na2CO3', [1e-4, 1e-3, 1e-2, 0.1], ['HCO3-']),
    ('NaHCO3', [1e-4, 1e-3, 1e-2, 0.1], ['CO2', 'CO3-2']), ('Na3PO4', [1e-3, 0.05], []), ('Na2HPO4', [1e-3, 0.05], []),
    ('NaH2PO4', [1e-3, 0.05], []), ('Na2SO4', [1e-2, 0.1], []), ('NaF', [1e-2, 0.1], []), ('Na2S', [1e-3, 0.01], ['HS-']),
    ('Na2SO3', [1e-2, 0.1], []), ('NaClO', [1e-3, 0.05], ['HClO']), ('AlCl3', [1e-4, 1e-3, 1e-2], ['AlOH+2']),
    ('FeCl3', [1e-4, 1e-3, 1e-2], ['FeOH+2']), ('CuSO4', [1e-3, 0.05], ['CuOH+']), ('ZnCl2', [1e-3, 0.05], []), ('MgCl2', [1e-2, 0.1], []),
]:
    for c in concs:
        case('pH %s %g' % (name, c), {name: c}, watch=watch)

# 2. Buffers
for a, b in [(0.1, 0.1), (0.1, 0.01), (0.01, 0.1), (0.2, 0.05), (0.001, 0.001)]:
    case('buffer HAc %g NaAc %g' % (a, b), {'HAc': a, 'NaAc': b})
    case('buffer NH3 %g NH4Cl %g' % (a, b), {'NH3': a, 'NH4Cl': b})
for a, b in [(0.05, 0.05), (0.025, 0.025), (0.08, 0.02)]:
    case('buffer NaH2PO4 %g Na2HPO4 %g' % (a, b), {'NaH2PO4': a, 'Na2HPO4': b})
    case('buffer NaHCO3 %g Na2CO3 %g' % (a, b), {'NaHCO3': a, 'Na2CO3': b})

# 3. Titration curves: moles of titrant added to a fixed amount of analyte (the water of the titrant is left out:
#    the comparison is of the chemistry, and both programs see the same amounts)
for f in [0, 0.25, 0.5, 0.9, 0.99, 0.999, 1.0, 1.001, 1.01, 1.1, 1.5]:
    case('titration HCl+NaOH f=%g' % f, {'HCl': 0.002, 'NaOH': 0.002 * f} if f else {'HCl': 0.002})
    case('titration HAc+NaOH f=%g' % f, {'HAc': 0.002, 'NaOH': 0.002 * f} if f else {'HAc': 0.002})
    case('titration NH3+HCl f=%g' % f, {'NH3': 0.002, 'HCl': 0.002 * f} if f else {'NH3': 0.002})
for f in [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]:
    case('titration H3PO4+NaOH f=%g' % f, {'H3PO4': 0.001, 'NaOH': 0.001 * f} if f else {'H3PO4': 0.001})
for f in [0, 0.5, 1.0, 1.5, 2.0, 2.2]:
    case('titration Na2CO3+HCl f=%g' % f, {'Na2CO3': 0.001, 'HCl': 0.001 * f} if f else {'Na2CO3': 0.001})

# 4. Solubility and the common-ion effect (the solid is in the vessel from the start)
for phase, extra in [
    ('Cerargyrite', {}), ('Cerargyrite', {'NaCl': 0.01}), ('Cerargyrite', {'NaCl': 0.5}), ('Cerargyrite', {'AgNO3': 0.01}),
    ('Barite', {}), ('Barite', {'Na2SO4': 0.01}), ('Gypsum', {}), ('Gypsum', {'CaCl2': 0.1}), ('Gypsum', {'NaCl': 0.5}),
    ('Calcite', {}), ('Calcite', {'CO2': 0.01}), ('Calcite', {'HCl': 0.005}), ('Calcite', {'Na2CO3': 0.01}),
    ('Brucite', {}), ('Brucite', {'MgCl2': 0.05}), ('Brucite', {'NH4Cl': 0.1}), ('Portlandite', {}), ('Portlandite', {'NaOH': 0.1}),
    ('Fluorite', {}), ('Fluorite', {'NaF': 0.01}), ('PbI2(s)', {}), ('PbI2(s)', {'KI': 0.05}), ('Ag2CrO4', {}), ('Ag2CrO4', {'K2CrO4': 0.01}),
    ('Whewellite', {}), ('Whewellite', {'HCl': 0.01}),
]:
    case('solubility %s%s' % (phase, ''.join(' +%s %g' % kv for kv in extra.items())), dict(extra), solids=[phase], start={phase: 0.05})

# 4b. Oxo-anions of the supplement (26.64): iodic acid is a moderately strong acid, the others spectators
for c in [1e-3, 0.05, 0.3]:
    case('pH HIO3 %g' % c, {'HIO3': c}, watch=['HIO3'])
case('salts KBrO3 Na2S4O6 K2S2O8', {'KBrO3': 0.02, 'Na2S4O6': 0.01, 'K2S2O8': 0.01})
case('solubility AgIO3', {}, solids=['AgIO3'], start={'AgIO3': 0.01})
case('solubility AgIO3 +KIO3 0.01', {'KIO3': 0.01}, solids=['AgIO3'], start={'AgIO3': 0.01})
case('mix Pb(NO3)2 + KIO3', {'Pb(NO3)2': 0.005, 'KIO3': 0.012}, solids=['Pb(IO3)2'])

# 5. Complexation
for c in [0.001, 0.01, 0.1, 0.5]:
    case('complex Cu 0.001 + NH3 %g' % c, {'CuSO4': 0.001, 'NH3': c}, watch=['Cu(NH3)4+2', 'Cu+2'])
for c in [0.01, 0.1, 1.0]:
    case('AgCl in NH3 %g' % c, {'NH3': c}, solids=['Cerargyrite'], start={'Cerargyrite': 0.01}, watch=['Ag(NH3)2+'])
for c in [1e-4, 1e-3, 1e-2]:
    case('complex Fe3 0.001 + SCN %g' % c, {'FeCl3': 0.001, 'HNO3': 0.05, 'KSCN': c}, watch=['Fe(Thiocyanate)+2'])
case('complex Ca 0.001 + EDTA 0.001', {'CaCl2': 0.001, 'Na2EDTA': 0.001, 'NaOH': 0.002}, watch=['Ca(Edta)-2'])
case('complex Zn 0.001 + NH3 0.5', {'ZnCl2': 0.001, 'NH3': 0.5}, watch=['Zn(NH3)4+2'])

# 6. Mixing with precipitation (the candidate solids are named)
case('mix BaCl2 + Na2SO4', {'BaCl2': 0.01, 'Na2SO4': 0.012}, solids=['Barite'])
case('mix AgNO3 + NaCl', {'AgNO3': 0.01, 'NaCl': 0.008}, solids=['Cerargyrite'])
case('mix AgNO3 + NaCl excess', {'AgNO3': 0.01, 'NaCl': 0.05}, solids=['Cerargyrite'])
case('mix CaCl2 + Na2CO3', {'CaCl2': 0.01, 'Na2CO3': 0.01}, solids=['Calcite'])
case('mix FeCl3 + NaOH', {'FeCl3': 0.01, 'NaOH': 0.03}, solids=['Fe(OH)3(a)'])
case('mix FeCl3 + NaOH short', {'FeCl3': 0.01, 'NaOH': 0.02}, solids=['Fe(OH)3(a)'])
case('mix CuSO4 + NaOH', {'CuSO4': 0.01, 'NaOH': 0.02}, solids=['Cu(OH)2(s)'])
case('mix CuSO4 + NaOH + NH3', {'CuSO4': 0.01, 'NaOH': 0.02, 'NH3': 1.0}, solids=['Cu(OH)2(s)'], watch=['Cu(NH3)4+2'])
case('mix MgCl2 + NaOH', {'MgCl2': 0.05, 'NaOH': 0.05}, solids=['Brucite'])
case('mix Pb(NO3)2 + KI', {'Pb(NO3)2': 0.01, 'KI': 0.03}, solids=['PbI2(s)'])
case('mix AgNO3 + K2CrO4', {'AgNO3': 0.02, 'K2CrO4': 0.02}, solids=['Ag2CrO4'])
case('mix Ag + Cl + CrO4 (two candidates)', {'AgNO3': 0.01, 'NaCl': 0.004, 'K2CrO4': 0.01}, solids=['Cerargyrite', 'Ag2CrO4'])
case('mix AlCl3 + NaOH amphoteric', {'AlCl3': 0.01, 'NaOH': 0.05}, solids=['Gibbsite'])
case('mix AlCl3 + NaOH precipitate', {'AlCl3': 0.01, 'NaOH': 0.03}, solids=['Gibbsite'])
case('mix CaCl2 + Na2SO4 below saturation', {'CaCl2': 0.005, 'Na2SO4': 0.005}, solids=['Gypsum'])

# 7. Temperature
for t in [0, 10, 40, 60, 90]:
    case('water at %d C' % t, {}, t=t)
    case('HAc 0.01 at %d C' % t, {'HAc': 0.01}, t=t)
    case('NH3 0.01 at %d C' % t, {'NH3': 0.01}, t=t)
for t in [5, 50, 80]:
    case('calcite at %d C' % t, {}, t=t, solids=['Calcite'], start={'Calcite': 0.01})
    case('NaHCO3 0.05 at %d C' % t, {'NaHCO3': 0.05}, t=t)
    case('gypsum at %d C' % t, {}, t=t, solids=['Gypsum'], start={'Gypsum': 0.1})

# 8. A closed head space (fixed volume)
case('CO2 0.02 mol over water, 1 L', {}, gas={'volume_L': 1.0, 'species': ['CO2(g)'], 'initial': {'CO2(g)': 0.02}})
case('CO2 0.02 mol over NaOH 0.01, 1 L', {'NaOH': 0.01}, gas={'volume_L': 1.0, 'species': ['CO2(g)'], 'initial': {'CO2(g)': 0.02}})
case('NH3 0.01 mol over water, 0.5 L', {}, gas={'volume_L': 0.5, 'species': ['NH3(g)'], 'initial': {'NH3(g)': 0.01}})
case('H2S 0.01 mol over water, 1 L', {}, gas={'volume_L': 1.0, 'species': ['H2S(g)'], 'initial': {'H2S(g)': 0.01}})
case('CO2 from Na2CO3 + HCl into 0.25 L', {'Na2CO3': 0.01, 'HCl': 0.02}, gas={'volume_L': 0.25, 'species': ['CO2(g)'], 'initial': {}})
case('CO2 + calcite, 1 L', {}, solids=['Calcite'], start={'Calcite': 0.01}, gas={'volume_L': 1.0, 'species': ['CO2(g)'], 'initial': {'CO2(g)': 0.01}})
case('SO2 0.01 mol over water, 1 L', {}, gas={'volume_L': 1.0, 'species': ['SO2(g)'], 'initial': {'SO2(g)': 0.01}})
case('O2 and N2 (air) over water, 1 L', {}, gas={'volume_L': 1.0, 'species': ['O2(g)', 'N2(g)'], 'initial': {'O2(g)': 0.00858, 'N2(g)': 0.0319}})


def run(pp, c):
    lines = ['SOLUTION 1', ' temp %r' % float(c['t']), ' pH 7 charge', ' -water 1']
    if c['reagents']:
        lines.append('REACTION 1')
        for name, mol in c['reagents'].items():
            lines.append(' %s %r' % (REAGENT[name][0], float(mol)))
        lines.append(' 1 moles in 1 steps')
    phases = OrderedDict((p, 0.0) for p in c['solids'])
    phases.update(c['start'])
    if phases:
        lines.append('EQUILIBRIUM_PHASES 1')
        for p, mol in phases.items():
            lines.append(' %s 0 %r' % (PQ[p], float(mol)))
    gas = c['gas']
    if gas:
        lines += ['GAS_PHASE 1', ' -fixed_volume', ' -volume %r' % float(gas['volume_L']), ' -temperature %r' % float(c['t'])]
        for g in gas['species']:
            # Initial partial pressure of the amount given (ideal gas), atm
            n0 = gas['initial'].get(g, 0.0)
            lines.append(' %s %r' % (PQ[g], n0 * 0.082057366080960 * (273.15 + c['t']) / gas['volume_L']))
    watch = sorted(set(c['watch']))
    punch = ['-LA("H+")', 'MU', 'TOT("water")', 'TC'] + ['MOL("%s")' % PQ[s] for s in watch] + ['EQUI("%s")' % PQ[p] for p in phases] + (['GAS("%s")' % PQ[g] for g in gas['species']] if gas else [])
    lines += ['SELECTED_OUTPUT 1', ' -reset false', 'USER_PUNCH 1', ' -headings ' + ' '.join('c%d' % i for i in range(len(punch))), ' 10 PUNCH ' + ', '.join(punch), 'END']
    pp.ip.run_string('\n'.join(lines) + '\n')
    row = pp.ip.get_selected_output_array()[-1]
    k = 4
    species = OrderedDict((s, row[k + i]) for i, s in enumerate(watch))
    k += len(watch)
    solids = OrderedDict((p, row[k + i]) for i, p in enumerate(phases))
    k += len(phases)
    gases = OrderedDict((g, row[k + i]) for i, g in enumerate(gas['species'])) if gas else OrderedDict()
    # The amounts the core receives
    amounts = {'H2O': 1.0 / 0.018015}
    for name, mol in c['reagents'].items():
        for sid, nu in REAGENT[name][1].items():
            amounts[sid] = amounts.get(sid, 0.0) + nu * mol
    for p, mol in c['start'].items():
        amounts[p] = amounts.get(p, 0.0) + mol
    if gas:
        for g, mol in gas['initial'].items():
            amounts[g] = amounts.get(g, 0.0) + mol
    out = OrderedDict(id=c['id'], T=273.15 + c['t'], amounts=OrderedDict(sorted((k_, v) for k_, v in amounts.items() if v != 0.0)), solids=list(phases))
    if gas:
        out['gas'] = OrderedDict(volume_L=gas['volume_L'], species=gas['species'])
    out['expect'] = OrderedDict(pH=row[0], I=row[1], water_kg=row[2], species=species, solids=solids, gas=gases)
    return out


def main():
    pp = phreeqpython.PhreeqPython(database='velophi.dat', database_directory=Path(FIX))
    if pp.ip.phc_database_error_count:
        raise SystemExit(pp.ip.get_error_string())
    out, failed = [], []
    for c in CASES:
        try:
            out.append(run(pp, c))
        except Exception as e:           # a case PHREEQC cannot run is reported, never silently dropped
            failed.append((c['id'], str(e).strip().splitlines()[-1][:200]))
    doc = OrderedDict(generator='scripts/oracles/chem_aq.py (PHREEQC 3 through phreeqpython %s, database tests/fixtures/chem/velophi.dat)' % phreeqpython.__version__ if hasattr(phreeqpython, '__version__') else 'scripts/oracles/chem_aq.py (PHREEQC 3 through phreeqpython, database tests/fixtures/chem/velophi.dat)', cases=out)
    path = os.path.join(FIX, 'aq.json')
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print('%d cases → %s' % (len(out), os.path.relpath(path, ROOT)))
    for cid, why in failed:
        print('  FAILED in the reference program: %s — %s' % (cid, why))
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
