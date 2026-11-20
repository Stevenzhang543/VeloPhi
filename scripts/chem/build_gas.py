#!/usr/bin/env python3
"""Gas-phase thermodynamic data for the Gibbs minimiser (26.64, D264): NASA 7-coefficient polynomials.

Writes src/chem/data/gas.json ('velophi-chemgas' 1) from the file nasa_gas.yaml distributed with Cantera, which is
the database of B. J. McBride, S. Gordon, M. A. Reno: Coefficients for Calculating Thermodynamic and Transport
Properties of Individual Species, NASA Technical Memorandum 4513 (1993) — a work of the United States Government.
The coefficients are copied unchanged; the standard-state pressure of that report is 1 bar.

Left out on purpose: condensed phases (soot, liquid water: the result says so), ions, and species outside school
and first-year chemistry.

Run: .cache/chem-venv/Scripts/python.exe scripts/chem/build_gas.py
"""
import json
import os

import cantera as ct

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

# our id → name in nasa_gas.yaml
SPECIES = [
    ('H2(g)', 'H2'), ('O2(g)', 'O2'), ('N2(g)', 'N2'), ('H2O(g)', 'H2O'), ('CO(g)', 'CO'), ('CO2(g)', 'CO2'),
    ('CH4(g)', 'CH4'), ('C2H2(g)', 'C2H2,acetylene'), ('C2H4(g)', 'C2H4'), ('C2H6(g)', 'C2H6'), ('C3H8(g)', 'C3H8'),
    ('C3H6(g)', 'C3H6,propylene'), ('C4H10(g)', 'C4H10,n-butane'), ('CH3OH(g)', 'CH3OH'), ('C2H5OH(g)', 'C2H5OH'),
    ('HCHO(g)', 'HCHO,formaldehy'), ('NH3(g)', 'NH3'), ('NO(g)', 'NO'), ('NO2(g)', 'NO2'), ('N2O(g)', 'N2O'),
    ('N2O4(g)', 'N2O4'), ('HNO3(g)', 'HNO3'), ('SO2(g)', 'SO2'), ('SO3(g)', 'SO3'), ('H2S(g)', 'H2S'), ('S2(g)', 'S2'),
    ('HCl(g)', 'HCL'), ('Cl2(g)', 'CL2'), ('Cl(g)', 'CL'), ('Br2(g)', 'Br2'), ('Br(g)', 'Br'), ('HBr(g)', 'HBr'),
    ('I2(g)', 'I2'), ('I(g)', 'I'), ('HI(g)', 'HI'), ('H(g)', 'H'), ('O(g)', 'O'), ('OH(g)', 'OH'), ('N(g)', 'N'),
    ('HO2(g)', 'HO2'), ('H2O2(g)', 'H2O2'), ('O3(g)', 'O3'), ('Ar(g)', 'Ar'), ('He(g)', 'He'), ('Ne(g)', 'Ne'),
]
ELEMENT = {'Cl': 'Cl', 'CL': 'Cl'}


def main():
    by = {s.name: s for s in ct.Species.list_from_file('nasa_gas.yaml')}
    out = []
    for sid, name in SPECIES:
        s = by[name]
        th = s.input_data['thermo']
        if th['model'] != 'NASA7':
            raise SystemExit('%s: unexpected model %s' % (name, th['model']))
        tr = th['temperature-ranges']
        ranges = [{'Tmin': tr[i], 'Tmax': tr[i + 1], 'a': list(th['data'][i])} for i in range(len(th['data']))]
        comp = {ELEMENT.get(k, k): (int(v) if v == int(v) else v) for k, v in sorted(s.composition.items())}
        out.append({'id': sid, 'nasa': name, 'comp': comp, 'M': round(s.molecular_weight, 5), 'ranges': ranges, 'note': str(th.get('note', '')).strip()})
    doc = {
        'format': 'velophi-chemgas', 'version': 1,
        'generator': {'script': 'scripts/chem/build_gas.py', 'cantera': ct.__version__, 'file': 'nasa_gas.yaml'},
        'source': 'B. J. McBride, S. Gordon, M. A. Reno: Coefficients for Calculating Thermodynamic and Transport Properties of Individual Species, NASA TM-4513 (1993); as distributed with Cantera (nasa_gas.yaml). Work of the United States Government.',
        'P0': 1.0e5,
        'about': 'cp/R = a1 + a2 T + a3 T^2 + a4 T^3 + a5 T^4; h/RT = a1 + a2 T/2 + a3 T^2/3 + a4 T^3/4 + a5 T^4/5 + a6/T; s/R = a1 ln T + a2 T + a3 T^2/2 + a4 T^3/3 + a5 T^4/4 + a7. h includes the enthalpy of formation at 298.15 K. Standard-state pressure P0 in Pa.',
        'species': out,
    }
    path = os.path.join(ROOT, 'src', 'chem', 'data', 'gas.json')
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')
    print('%d species -> %s (%d bytes)' % (len(out), os.path.relpath(path, ROOT), os.path.getsize(path)))


if __name__ == '__main__':
    main()
