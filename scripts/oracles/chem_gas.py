#!/usr/bin/env python3
"""Reference values for the gas equilibrium of the chemistry core (26.64, D275): Cantera.

Cantera is given exactly the species and polynomials of src/chem/data/gas.json (with the same standard-state
pressure, 1 bar), so a difference to the core is a difference of the solvers, not of the data. Cases: equilibrium
compositions at fixed temperature and pressure or volume, adiabatic flame temperatures at constant pressure and at
constant volume, standard reaction quantities. The dimerisation of NO2 is given in closed form (see `dimer`), and
every single-reaction case is checked against the law of mass action before it is written. Output: tests/fixtures/chem/gas.json.

Run: .cache/chem-venv/Scripts/python.exe scripts/oracles/chem_gas.py
"""
import json
import math
import os

import cantera as ct

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = json.load(open(os.path.join(ROOT, 'src', 'chem', 'data', 'gas.json'), encoding='utf-8'))
ATM = 101325.0


def species_of(entry):
    return ct.Species.from_dict({
        'name': entry['id'], 'composition': entry['comp'],
        'thermo': {'model': 'NASA7', 'reference-pressure': DATA['P0'],
                   'temperature-ranges': [entry['ranges'][0]['Tmin']] + [r['Tmax'] for r in entry['ranges']],
                   'data': [r['a'] for r in entry['ranges']]},
    })


ALL = {e['id']: species_of(e) for e in DATA['species']}
AIR = {'O2(g)': 1.0, 'N2(g)': 3.76}
CASES = []


def phase(ids):
    return ct.Solution(thermo='ideal-gas', species=[ALL[i] for i in ids])


def ln_k(nu, T):
    """ln K of a reaction {id: ν} from the standard Gibbs energies (pressures in units of P0)."""
    gas = phase(list(nu))
    gas.TP = T, DATA['P0']
    g = dict(zip(gas.species_names, gas.standard_gibbs_RT))
    return -sum(v * g[k] for k, v in nu.items())


def dimer(cid, n0, T, pressure_atm=None, volume_L=None):
    """N2O4 = 2 NO2 in closed form (the solvers of Cantera return the unreacted gas for this two-species system,
    whose element balances are linearly dependent). α: the fraction dissociated."""
    k = math.exp(ln_k({'N2O4(g)': -1, 'NO2(g)': 2}, T))
    r = ct.gas_constant / 1000
    if volume_L is None:
        p = pressure_atm * ATM / DATA['P0']
        alpha = math.sqrt(k / (4 * p + k))                     # K = 4 α² p / (1 − α²)
        req = {'pressure_atm': pressure_atm}
    else:
        c = n0 * r * T / (volume_L * 1e-3 * DATA['P0'])        # K = 4 α² c / (1 − α)
        alpha = (-k + math.sqrt(k * k + 16 * c * k)) / (8 * c)
        req = {'volume_L': volume_L}
    n = n0 * (1 + alpha)
    x = {'N2O4(g)': (1 - alpha) / (1 + alpha), 'NO2(g)': 2 * alpha / (1 + alpha)}
    p_pa = pressure_atm * ATM if volume_L is None else n * r * T / (volume_L * 1e-3)
    gas = phase(['N2O4(g)', 'NO2(g)'])
    gas.TPX = T, p_pa, x
    mass = n0 * ALL['N2O4(g)'].molecular_weight * 1e-3
    req.update({'amounts': {'N2O4(g)': n0}, 'T': T, 'species': ['N2O4(g)', 'NO2(g)']})
    CASES.append({'id': cid, 'request': req, 'mode': 'TP' if volume_L is None else 'TV', 'reference': 'closed form',
                  'expect': {'T': T, 'P_atm': p_pa / ATM, 'n': n, 'x': x, 'H': float(gas.enthalpy_mass * mass), 'S': float(gas.entropy_mass * mass)}})


def case(cid, amounts, T, pressure_atm=None, volume_L=None, adiabatic=False, species=None, reaction=None):
    present = set()
    for i in amounts:
        present |= set(ALL[i].composition)
    # Only species made of the elements present (the core drops the others in the same way)
    ids = [i for i in ALL if set(ALL[i].composition) <= present] if species is None else sorted(set(species) | set(amounts))
    gas = phase(ids)
    total = sum(amounts.values())
    p = pressure_atm * ATM if volume_L is None else total * ct.gas_constant / 1000 * T / (volume_L * 1e-3)
    gas.TPX = T, p, amounts
    mass = sum(n * ALL[i].molecular_weight for i, n in amounts.items()) * 1e-3   # kg
    h0 = gas.enthalpy_mass * mass
    mode = ('HP' if volume_L is None else 'UV') if adiabatic else ('TP' if volume_L is None else 'TV')
    done = None
    for rtol in (1e-12, 1e-10, 1e-9):
        for solver in ('element_potential', 'gibbs', 'vcs'):
            try:
                gas.TPX = T, p, amounts
                gas.equilibrate(mode, solver=solver, rtol=rtol, max_steps=50000)
                done = (solver, rtol)
                break
            except ct.CanteraError:
                pass
        if done:
            break
    if not done:
        raise SystemExit('%s: Cantera did not converge' % cid)
    n_total = mass / gas.mean_molecular_weight * 1e3      # mol
    if reaction is not None:
        # The law of mass action must hold at what Cantera returns (it has returned unreacted mixtures silently)
        xs = dict(zip(gas.species_names, gas.X))
        ln_q = sum(v * math.log(xs[k] * gas.P / DATA['P0']) for k, v in reaction.items())
        if abs(ln_q - ln_k(reaction, gas.T)) > 1e-7:
            raise SystemExit('%s: Cantera result violates the law of mass action by %g' % (cid, ln_q - ln_k(reaction, gas.T)))
    x = {i: float(v) for i, v in zip(gas.species_names, gas.X) if v > 1e-12}
    req = {'amounts': amounts, 'T': T}
    if volume_L is None:
        req['pressure_atm'] = pressure_atm
    else:
        req['volume_L'] = volume_L
    if adiabatic:
        req['adiabatic'] = True
    if species is not None:
        req['species'] = species
    CASES.append({'id': cid, 'request': req, 'mode': mode, 'reference': 'Cantera', 'cantera': {'solver': done[0], 'rtol': done[1]},
                  'expect': {'T': float(gas.T), 'P_atm': float(gas.P / ATM), 'n': float(n_total), 'x': x,
                             'H': float(gas.enthalpy_mass * mass), 'S': float(gas.entropy_mass * mass), 'H0': float(h0)}})


def fuel_air(fuel, oxygen_per_fuel, phi):
    return {fuel: 1.0, 'O2(g)': oxygen_per_fuel / phi, 'N2(g)': 3.76 * oxygen_per_fuel / phi}


# 1. Composition at a temperature and pressure: dissociation at flame temperatures
for T in (1500, 2000, 2500, 3000, 3500):
    case('H2 + 0.5 O2 at %d K' % T, {'H2(g)': 1.0, 'O2(g)': 0.5}, T, 1.0)
for T in (2000, 2500, 3000):
    case('CO2 at %d K' % T, {'CO2(g)': 1.0}, T, 1.0)
for T in (1500, 2000, 2500):
    case('air at %d K (thermal NO)' % T, {'N2(g)': 0.79, 'O2(g)': 0.21}, T, 1.0)
# 2. School equilibria
for T in (273.15, 298.15, 320, 350, 400):
    for p in (0.5, 1.0, 2.0):
        dimer('N2O4 = 2 NO2 at %g K, %g atm' % (T, p), 1.0, T, pressure_atm=p)
for T in (500, 700, 900):
    for p in (1.0, 100.0, 200.0):
        case('N2 + 3 H2 at %d K, %g atm' % (T, p), {'N2(g)': 1.0, 'H2(g)': 3.0}, T, p, species=['N2(g)', 'H2(g)', 'NH3(g)'], reaction={'N2(g)': -1, 'H2(g)': -3, 'NH3(g)': 2})
for T in (700, 900, 1100):
    case('2 SO2 + O2 at %d K' % T, {'SO2(g)': 2.0, 'O2(g)': 1.0}, T, 1.0, species=['SO2(g)', 'O2(g)', 'SO3(g)'], reaction={'SO2(g)': -2, 'O2(g)': -1, 'SO3(g)': 2})
for T in (600, 700, 800):
    case('H2 + I2 at %d K' % T, {'H2(g)': 1.0, 'I2(g)': 1.0}, T, 1.0, species=['H2(g)', 'I2(g)', 'HI(g)'], reaction={'H2(g)': -1, 'I2(g)': -1, 'HI(g)': 2})
for T in (800, 1100, 1500):
    case('CO + H2O at %d K (water-gas shift)' % T, {'CO(g)': 1.0, 'H2O(g)': 1.0}, T, 1.0, species=['CO(g)', 'H2O(g)', 'CO2(g)', 'H2(g)'], reaction={'CO(g)': -1, 'H2O(g)': -1, 'CO2(g)': 1, 'H2(g)': 1})
case('CH4 + H2O at 1100 K (steam reforming)', {'CH4(g)': 1.0, 'H2O(g)': 2.0}, 1100, 1.0, species=['CH4(g)', 'H2O(g)', 'CO(g)', 'CO2(g)', 'H2(g)'])
# 3. A closed vessel at a temperature
dimer('N2O4 0.01 mol in 1 L at 350 K', 0.01, 350, volume_L=1.0)
case('NH3 0.1 mol in 2 L at 800 K', {'NH3(g)': 0.1}, 800, volume_L=2.0, species=['N2(g)', 'H2(g)', 'NH3(g)'], reaction={'N2(g)': -1, 'H2(g)': -3, 'NH3(g)': 2})
# 4. Adiabatic flames at constant pressure, reactants at 298.15 K
for phi in (0.5, 0.8, 1.0, 1.2, 1.5):
    case('H2/air phi=%g' % phi, fuel_air('H2(g)', 0.5, phi), 298.15, 1.0, adiabatic=True)
for phi in (0.6, 0.8, 1.0, 1.2, 1.4):
    case('CH4/air phi=%g' % phi, fuel_air('CH4(g)', 2.0, phi), 298.15, 1.0, adiabatic=True)
case('C3H8/air phi=1', fuel_air('C3H8(g)', 5.0, 1.0), 298.15, 1.0, adiabatic=True)
case('C4H10/air phi=1', fuel_air('C4H10(g)', 6.5, 1.0), 298.15, 1.0, adiabatic=True)
case('C2H5OH/air phi=1', fuel_air('C2H5OH(g)', 3.0, 1.0), 298.15, 1.0, adiabatic=True)
case('CO/air phi=1', fuel_air('CO(g)', 0.5, 1.0), 298.15, 1.0, adiabatic=True)
case('NH3/air phi=1', fuel_air('NH3(g)', 0.75, 1.0), 298.15, 1.0, adiabatic=True)
case('H2/O2', {'H2(g)': 2.0, 'O2(g)': 1.0}, 298.15, 1.0, adiabatic=True)
case('C2H2/O2', {'C2H2(g)': 1.0, 'O2(g)': 2.5}, 298.15, 1.0, adiabatic=True)
case('CH4/O2', {'CH4(g)': 1.0, 'O2(g)': 2.0}, 298.15, 1.0, adiabatic=True)
case('CH4/air phi=1 at 10 atm', fuel_air('CH4(g)', 2.0, 1.0), 298.15, 10.0, adiabatic=True)
case('CH4/air phi=1 preheated to 600 K', fuel_air('CH4(g)', 2.0, 1.0), 600.0, 1.0, adiabatic=True)
case('H2/Cl2', {'H2(g)': 1.0, 'Cl2(g)': 1.0}, 298.15, 1.0, adiabatic=True)
# 5. Adiabatic at constant volume (a closed vessel filled at 1 atm and 298.15 K: 1 L holds 0.0409 mol)
N1 = ATM * 1e-3 / (ct.gas_constant / 1000 * 298.15)
for name, mix in (('H2/air', fuel_air('H2(g)', 0.5, 1.0)), ('CH4/air', fuel_air('CH4(g)', 2.0, 1.0)), ('H2/O2', {'H2(g)': 2.0, 'O2(g)': 1.0})):
    s = sum(mix.values())
    case('%s in a closed 1 L vessel' % name, {k: v / s * N1 for k, v in mix.items()}, 298.15, volume_L=1.0, adiabatic=True)

# 6. Standard reaction quantities (ΔH, ΔS, ΔG, ln K with pressures in units of the standard pressure)
REACTIONS = []
for name, nu, temps in (
    ('N2O4 = 2 NO2', {'N2O4(g)': -1, 'NO2(g)': 2}, (298.15, 350)),
    ('N2 + 3 H2 = 2 NH3', {'N2(g)': -1, 'H2(g)': -3, 'NH3(g)': 2}, (298.15, 700)),
    ('2 SO2 + O2 = 2 SO3', {'SO2(g)': -2, 'O2(g)': -1, 'SO3(g)': 2}, (298.15, 900)),
    ('H2 + I2 = 2 HI', {'H2(g)': -1, 'I2(g)': -1, 'HI(g)': 2}, (700,)),
    ('CH4 + 2 O2 = CO2 + 2 H2O', {'CH4(g)': -1, 'O2(g)': -2, 'CO2(g)': 1, 'H2O(g)': 2}, (298.15,)),
    ('2 H2 + O2 = 2 H2O', {'H2(g)': -2, 'O2(g)': -1, 'H2O(g)': 2}, (298.15, 2000)),
    ('N2 + O2 = 2 NO', {'N2(g)': -1, 'O2(g)': -1, 'NO(g)': 2}, (298.15, 2500)),
):
    gas = phase(list(nu))
    for T in temps:
        gas.TP = T, DATA['P0']
        h = dict(zip(gas.species_names, gas.standard_enthalpies_RT * ct.gas_constant / 1000 * T))
        s = dict(zip(gas.species_names, gas.standard_entropies_R * ct.gas_constant / 1000))
        dh = sum(v * h[k] for k, v in nu.items())
        ds = sum(v * s[k] for k, v in nu.items())
        REACTIONS.append({'id': '%s at %g K' % (name, T), 'species': nu, 'T': T, 'dH': dh, 'dS': ds, 'dG': dh - T * ds, 'lnK': -(dh - T * ds) / (ct.gas_constant / 1000 * T)})

out = {'about': 'Gas equilibria and adiabatic flames computed by Cantera %s with the species of src/chem/data/gas.json (scripts/oracles/chem_gas.py).' % ct.__version__,
       'R': ct.gas_constant / 1000, 'cases': CASES, 'reactions': REACTIONS}
path = os.path.join(ROOT, 'tests', 'fixtures', 'chem', 'gas.json')
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
    f.write('\n')
print('%d cases, %d reactions -> tests/fixtures/chem/gas.json' % (len(CASES), len(REACTIONS)))
for c in CASES:
    if c['mode'] in ('HP', 'UV'):
        print('  %-40s T = %.2f K, P = %.3f atm' % (c['id'], c['expect']['T'], c['expect']['P_atm']))
