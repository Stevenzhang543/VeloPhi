#!/usr/bin/env python3
"""Display spectra of coloured species and flame lines (26.64, D267).

Writes
    scripts/chem/catalog/spectra.json   {spectra: {species: [ε at 400, 420, … 700 nm]}, spectraSrc: {species: note}}
    scripts/chem/catalog/flames.json    {flames: {element: [[λ/nm, relative intensity], …]}}
    engine/velophi-chem/src/color/tables.rs   CIE 1931 2° colour matching functions and D65 (from colour-science)
    tests/fixtures/chem/colour.json     reference colours computed here with colour-science (the test of the core)

Every spectrum is a "display approximation" (the manual's words): a sum of Gaussian bands in wavelength,
ε(λ) = Σ ε_max · exp(−4 ln 2 · (λ − λ_max)² / w²), built from a literature λ_max, ε_max and a band width w (FWHM, nm).
The values were typed by hand from the usual textbook and handbook figures (Lever, Inorganic Electronic Spectroscopy;
Cotton & Wilkinson; Bishop, Indicators; Green, The Sigma-Aldrich Handbook of Stains, Dyes and Indicators) and are
on the list of hand-entered values in docs/chem/DATA_SOURCES.md. They are good for what the screen shows — which
colour, how deep, how it changes on dilution and with pH — and are not a substitute for a measured spectrum.

Run with the chemistry environment (needs colour-science): .cache/chem-venv/Scripts/python.exe scripts/chem/build_spectra.py
"""
import json
import math
import os

import colour
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GRID = list(range(400, 701, 20))

# species: ([(λmax, εmax, FWHM), …], note)
BANDS = {
    # Aqua ions and simple complexes of the transition metals (d–d bands: weak and broad)
    'Cu+2': ([(810, 12, 200)], 'aqua ion, d–d band at about 810 nm, ε 12'),
    'CuSO4': ([(810, 12, 200)], 'as the aqua ion (outer-sphere pair)'),
    'CuCl+': ([(830, 14, 260), (250, 1500, 110)], 'd–d band of the aqua ion; charge-transfer tail'),
    'CuNH3+2': ([(745, 20, 220)], 'Bjerrum: stepwise shift of the d–d band with ammonia'),
    'Cu(NH3)2+2': ([(680, 30, 200)], 'Bjerrum'),
    'Cu(NH3)3+2': ([(645, 42, 190)], 'Bjerrum'),
    'Cu(NH3)4+2': ([(600, 55, 170)], 'tetraammine, λmax about 600 nm, ε 50–60'),
    'CuCl4-2': ([(405, 2500, 90), (950, 100, 300)], 'tetrachlorocuprate: charge transfer at 405 nm (yellow-green solutions)'),
    'CuCl3-': ([(390, 1500, 90)], 'charge transfer, estimated between CuCl2 and CuCl4-2'),
    'Cu(Edta)-2': ([(735, 90, 200)], 'λmax 735 nm, ε about 90'),
    'Cu(Ethylenediamine)2+2': ([(550, 63, 150)], 'bis(ethylenediamine), λmax 550 nm'),
    'Cu(Ethylenediamine)+2': ([(660, 35, 190)], 'mono(ethylenediamine)'),
    'Cu(Glycine)2': ([(630, 45, 180)], 'bis(glycinato), λmax about 630 nm'),
    'Cu(Citrate)-': ([(740, 35, 220)], 'citrate complex (Benedict, Fehling type solutions), estimated'),
    'Cu(Tartarate)': ([(700, 40, 220)], 'tartrate complex (Fehling), estimated'),
    'Fe+2': ([(960, 1.6, 320)], 'aqua ion, d–d band in the near infrared: very pale green'),
    'FeSO4': ([(960, 1.6, 320)], 'as the aqua ion'),
    'Fe+3': ([(240, 4000, 110)], 'aqua ion: charge-transfer band in the ultraviolet, almost colourless in strong acid'),
    'FeOH+2': ([(297, 2000, 150)], 'hydrolysed iron(III): band at 297 nm whose tail makes the solutions yellow'),
    'Fe(OH)2+': ([(300, 2200, 170)], 'as FeOH+2, broader (estimated)'),
    'Fe2(OH)2+4': ([(335, 3500, 170)], 'dimer, band at 335 nm'),
    'FeCl+2': ([(336, 2200, 150)], 'chloro complex, band at 336 nm'),
    'FeCl2+': ([(340, 2400, 170)], 'estimated from FeCl+2'),
    'FeCl3': ([(345, 2600, 180)], 'estimated from FeCl+2'),
    'FeSO4+': ([(305, 2200, 140)], 'sulfato complex, band at 305 nm'),
    'Fe(Thiocyanate)+2': ([(460, 4700, 115)], 'the blood-red complex: λmax 460 nm, ε about 4700'),
    'Fe(Thiocyanate)2+': ([(480, 9000, 120)], 'λmax about 480 nm'),
    'Fe(Oxalate)3-3': ([(260, 6000, 190), (670, 1, 120)], 'trisoxalatoferrate: green-yellow, charge-transfer tail'),
    'Fe(Oxalate)2-': ([(260, 5000, 180)], 'estimated from the tris complex'),
    'Fe(Oxalate)+': ([(260, 4000, 170)], 'estimated from the tris complex'),
    'Fe(Edta)-': ([(258, 9000, 150)], 'pale yellow'),
    'Fe(Salicylate)+': ([(530, 1600, 130)], 'the violet salicylate complex, λmax 530 nm'),
    'Ferricyanide-3': ([(420, 1020, 50), (303, 1600, 60)], 'hexacyanoferrate(III): λmax 420 nm, ε 1020'),
    'Ferrocyanide-4': ([(320, 320, 110)], 'hexacyanoferrate(II): pale yellow'),
    'MnO4-': ([(526, 2400, 72), (310, 1700, 70)], 'permanganate: envelope of the 507/526/546 nm bands, ε about 2400'),
    'MnO4-2': ([(606, 1700, 90), (437, 1400, 60)], 'manganate: bands at 606 and 437 nm (green)'),
    'Mn+2': ([(401, 0.035, 25), (530, 0.017, 60)], 'aqua ion: spin-forbidden bands, very pale pink'),
    'CrO4-2': ([(373, 4800, 70)], 'chromate: λmax 373 nm, ε 4800'),
    'NaCrO4-': ([(373, 4800, 70)], 'as chromate'),
    'KCrO4-': ([(373, 4800, 70)], 'as chromate'),
    'HCrO4-': ([(350, 1560, 75), (440, 190, 90)], 'hydrogen chromate'),
    'H2CrO4': ([(350, 1560, 75), (440, 190, 90)], 'as hydrogen chromate'),
    'Cr2O7-2': ([(350, 3150, 75), (450, 370, 95)], 'dichromate: bands at 350 and 450 nm (orange)'),
    'Cr+3': ([(408, 15.6, 75), (575, 13.4, 100)], 'aqua ion: 408 and 575 nm (violet-grey)'),
    'Cr(OH)+2': ([(417, 20, 80), (583, 16, 105)], 'first hydrolysis product, bands shifted to the red'),
    'Cr(OH)2+': ([(425, 23, 85), (590, 18, 110)], 'estimated'),
    'Cr(OH)4-': ([(430, 30, 80), (600, 25, 110)], 'chromite: green'),
    'CrCl+2': ([(428, 21, 80), (609, 17, 105)], 'chloropentaaqua: green'),
    'CrCl2+': ([(450, 30, 85), (635, 24, 110)], 'dichlorotetraaqua: dark green'),
    'CrSO4+': ([(417, 20, 80), (587, 19, 105)], 'sulfato complex: green'),
    'Cr(Edta)-': ([(390, 105, 70), (540, 200, 90)], 'violet'),
    'Co+2': ([(510, 4.8, 85)], 'aqua ion: 510 nm, ε 4.8 (pink)'),
    'CoSO4': ([(510, 4.8, 85)], 'as the aqua ion'),
    'CoCl+': ([(520, 8, 95)], 'estimated'),
    'Co(NH3)+2': ([(505, 6, 90)], 'estimated'),
    'Ni+2': ([(395, 5.2, 50), (720, 2.2, 110), (655, 1.6, 60)], 'aqua ion: 395, 655 and 720 nm (green)'),
    'NiSO4': ([(395, 5.2, 50), (720, 2.2, 110), (655, 1.6, 60)], 'as the aqua ion'),
    'NiCl+': ([(400, 5.5, 55), (725, 2.4, 110), (660, 1.8, 60)], 'estimated'),
    'NiNH3+2': ([(385, 5.5, 50), (690, 2.6, 110)], 'estimated: shift towards the hexaammine'),
    'Ni(NH3)2+2': ([(378, 6, 50), (660, 3.2, 110)], 'estimated'),
    'Ni(Ethylenediamine)3+2': ([(345, 9, 50), (545, 7, 90)], 'tris(ethylenediamine): violet'),
    'Ni(Edta)-2': ([(380, 14, 55), (590, 8, 100)], 'blue'),
    # Halogens in water
    'I2': ([(460, 746, 100)], 'iodine in water: λmax 460 nm, ε 746'),
    'I3-': ([(353, 26400, 62), (288, 40000, 40)], 'triiodide: 353 nm, ε 26 400'),
    'Br2': ([(390, 175, 95)], 'bromine water: λmax 390 nm, ε 175'),
    'Cl2': ([(325, 75, 70)], 'chlorine water: λmax 325 nm, ε 75'),
    'ClO-': ([(292, 350, 50)], 'hypochlorite: 292 nm, ε 350 (colourless to the eye)'),
    'NO2': ([(400, 160, 160)], 'dissolved nitrogen dioxide, as the gas'),
    # Acid–base indicators (supplement_indicators.dat); the colourless forms carry no spectrum
    'Phph-2': ([(552, 30000, 62)], 'phenolphthalein, pink form: 552 nm, ε about 3·10^4'),
    'Thph-': ([(595, 38000, 62)], 'thymolphthalein, blue form: 595 nm'),
    'Meor-': ([(464, 26000, 95)], 'methyl orange, yellow form: 464 nm'),
    'H(Meor)': ([(507, 44000, 95)], 'methyl orange, red form: 507 nm'),
    'Mered-': ([(430, 20000, 90)], 'methyl red, yellow form: 430 nm'),
    'H(Mered)': ([(520, 44000, 90)], 'methyl red, red form: 520 nm'),
    'Btb-2': ([(617, 37000, 65)], 'bromothymol blue, blue form: 617 nm'),
    'H(Btb)-': ([(433, 16000, 85)], 'bromothymol blue, yellow form: 433 nm'),
    'Bcg-2': ([(617, 40000, 65)], 'bromocresol green, blue form: 617 nm'),
    'H(Bcg)-': ([(444, 18000, 85)], 'bromocresol green, yellow form: 444 nm'),
    'Phred-2': ([(558, 50000, 55)], 'phenol red, red form: 558 nm'),
    'H(Phred)-': ([(432, 22000, 85)], 'phenol red, yellow form: 432 nm'),
    'Thyb-2': ([(596, 34000, 65)], 'thymol blue, blue form: 596 nm'),
    'H(Thyb)-': ([(435, 15000, 85)], 'thymol blue, yellow form: 435 nm'),
    'H2(Thyb)': ([(545, 28000, 75)], 'thymol blue, red form: 545 nm'),
    'Litmus-': ([(590, 20000, 95)], 'litmus, blue form (effective single dye)'),
    'H(Litmus)': ([(500, 15000, 95)], 'litmus, red form (effective single dye)'),
    'Alyr-2': ([(490, 25000, 105)], 'alizarin yellow R, red form'),
    'H(Alyr)-': ([(375, 22000, 85)], 'alizarin yellow R, yellow form'),
    'Congo-2': ([(498, 45000, 105)], 'congo red, red form: 498 nm'),
    'H(Congo)-': ([(590, 35000, 130)], 'congo red, blue form'),
    # Coloured gases (ε from absorption cross sections: ε = σ·N_A / (1000 ln 10))
    'Cl2(g)': ([(330, 66, 65)], 'chlorine: 330 nm, σ 2.55·10^-19 cm²'),
    'NO2(g)': ([(400, 160, 160)], 'nitrogen dioxide: broad band about 400 nm, σ about 6·10^-19 cm²'),
    'Br2(g)': ([(415, 170, 90)], 'bromine vapour: 415 nm'),
    'I2(g)': ([(530, 700, 85)], 'iodine vapour: 530 nm (violet)'),
}

# Flame tests: the lines and molecular bands that carry the colour (NIST Atomic Spectra Database for the atomic
# lines; the hydroxide and oxide bands after Pearse & Gaydon, The Identification of Molecular Spectra). Relative
# intensities are for display.
FLAMES = {
    'Li': [[670.8, 100], [610.4, 8]],
    'Na': [[589.0, 100], [589.6, 50]],
    'K': [[766.5, 100], [769.9, 50], [404.4, 3], [404.7, 1.5]],
    'Rb': [[780.0, 100], [794.8, 50], [420.2, 5], [421.6, 2.5]],
    'Cs': [[455.5, 60], [459.3, 20], [852.1, 100], [697.3, 4]],
    'Ca': [[622.0, 100], [554.0, 35], [422.7, 12]],
    'Sr': [[606.0, 50], [660.0, 100], [680.0, 70], [460.7, 12]],
    'Ba': [[524.0, 100], [514.0, 80], [553.5, 60], [493.4, 30]],
    'Cu': [[538.0, 100], [524.0, 80], [555.0, 55], [435.0, 45], [490.0, 40]],
    'B': [[548.0, 100], [519.0, 70], [495.0, 40], [580.0, 35]],
}


def epsilon(bands, lam):
    return sum(e * math.exp(-4 * math.log(2) * (lam - l0) ** 2 / (w * w)) for l0, e, w in bands)


def tables():
    cmf = colour.MSDS_CMFS['CIE 1931 2 Degree Standard Observer']
    d65 = colour.SDS_ILLUMINANTS['D65']
    rows = []
    for lam in range(380, 781, 10):
        x, y, z = cmf[lam]
        rows.append((lam, float(x), float(y), float(z), float(d65[lam])))
    return rows


def srgb_of_xyz(xyz):
    """XYZ (Y of white = 1) → sRGB 0…255, the IEC 61966-2-1 matrix and transfer function."""
    m = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
    lin = np.clip(m @ np.array(xyz), 0.0, 1.0)
    enc = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * lin ** (1 / 2.4) - 0.055)
    return [int(math.floor(255 * v + 0.5)) for v in enc]


def transmitted(absorbance, rows):
    """Colour of white (D65) light through a layer with the given absorbance at the 16 grid wavelengths."""
    by = {r[0]: r for r in rows}
    white = [0.0, 0.0, 0.0]
    got = [0.0, 0.0, 0.0]
    for a, lam in zip(absorbance, GRID):
        _, x, y, z, s = by[lam]
        t = 10.0 ** (-a)
        for k, c in enumerate((x, y, z)):
            white[k] += s * c
            got[k] += s * c * t
    d65 = (0.95047, 1.0, 1.08883)
    return srgb_of_xyz([got[k] / white[k] * d65[k] for k in range(3)])


def main():
    rows = tables()
    spectra = {k: [round(epsilon(b, lam), 4) for lam in GRID] for k, (b, _) in BANDS.items()}
    src = {k: note + ' — display approximation (hand)' for k, (_, note) in BANDS.items()}
    about = 'Molar absorption coefficients in L/(mol·cm) at 400, 420, … 700 nm; Gaussian bands from literature λmax, ε and width. Display approximation (D267). Generated by scripts/chem/build_spectra.py; edit the band table there.'
    with open(os.path.join(HERE, 'catalog', 'spectra.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'about': about, 'spectra': spectra, 'spectraSrc': src}, f, ensure_ascii=False, indent=1)
        f.write('\n')
    with open(os.path.join(HERE, 'catalog', 'flames.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'about': 'Flame tests: [wavelength in nm, relative intensity] of the lines and bands that carry the colour. Display data. Generated by scripts/chem/build_spectra.py.', 'flames': FLAMES}, f, ensure_ascii=False, indent=1)
        f.write('\n')

    out = ['//! CIE 1931 2° standard observer and the D65 illuminant at 380 … 780 nm in steps of 10 nm.',
           '//! Generated by scripts/chem/build_spectra.py from colour-science %s (CIE 015:2018 tables); do not edit.' % colour.__version__, '',
           '/// (wavelength in nm, x̄, ȳ, z̄, relative power of D65)',
           'pub const TABLE: [(f64, f64, f64, f64, f64); %d] = [' % len(rows)]
    for lam, x, y, z, s in rows:
        out.append('    (%d.0, %r, %r, %r, %r),' % (lam, x, y, z, s))
    out.append('];')
    with open(os.path.join(ROOT, 'engine', 'velophi-chem', 'src', 'color', 'tables.rs'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(out) + '\n')

    # Reference colours for the test of the core: mixtures at a path length, computed here
    cases = []
    def case(name, conc, path):
        a = [path * sum(c * spectra[s][i] for s, c in conc.items()) for i in range(16)]
        cases.append({'id': name, 'species': conc, 'path_cm': path, 'absorbance': a, 'rgb': transmitted(a, rows)})
    case('water', {}, 5.0)
    for c in (0.01, 0.1, 0.5, 1.0):
        case('Cu+2 %g' % c, {'Cu+2': c}, 5.0)
    for c in (0.001, 0.01, 0.05):
        case('Cu(NH3)4+2 %g' % c, {'Cu(NH3)4+2': c}, 5.0)
    for c in (1e-5, 1e-4, 1e-3, 1e-2):
        case('MnO4- %g' % c, {'MnO4-': c}, 5.0)
    for c in (1e-5, 1e-4, 1e-3):
        case('Fe(Thiocyanate)+2 %g' % c, {'Fe(Thiocyanate)+2': c}, 2.0)
    case('chromate', {'CrO4-2': 1e-3}, 5.0)
    case('dichromate', {'Cr2O7-2': 2e-3}, 5.0)
    case('nickel', {'Ni+2': 0.3}, 5.0)
    case('cobalt', {'Co+2': 0.3}, 5.0)
    case('triiodide', {'I3-': 1e-4}, 5.0)
    case('phenolphthalein base', {'Phph-2': 2e-5}, 5.0)
    case('methyl orange half way', {'Meor-': 1e-5, 'H(Meor)': 1e-5}, 5.0)
    case('bromothymol blue green', {'Btb-2': 6e-6, 'H(Btb)-': 1.4e-5}, 5.0)
    case('copper and chromate', {'Cu+2': 0.2, 'CrO4-2': 2e-4}, 5.0)
    # The same sums against the integration of colour-science over the interpolated spectrum (a check of this script,
    # not of the core): the 20 nm sum and the fine integration must give neighbouring colours
    worst = 0
    for c in cases:
        sd = colour.SpectralDistribution(dict(zip(GRID, [10.0 ** (-a) for a in c['absorbance']])))
        sd = sd.copy().interpolate(colour.SpectralShape(400, 700, 5))
        xyz = colour.sd_to_XYZ(sd, illuminant=colour.SDS_ILLUMINANTS['D65'].copy().align(sd.shape), method='Integration') / 100
        fine = srgb_of_xyz(list(xyz))
        worst = max(worst, max(abs(a - b) for a, b in zip(fine, c['rgb'])))
    with open(os.path.join(ROOT, 'tests', 'fixtures', 'chem', 'colour.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'about': 'Reference colours of solutions, computed by scripts/chem/build_spectra.py with the CIE tables of colour-science %s.' % colour.__version__,
                   'grid': GRID, 'cases': cases}, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('spectra %d, flames %d, cases %d; largest difference to the fine integration: %d of 255' % (len(spectra), len(FLAMES), len(cases), worst))
    for c in cases:
        print('  %-28s %s' % (c['id'], c['rgb']))


if __name__ == '__main__':
    main()
