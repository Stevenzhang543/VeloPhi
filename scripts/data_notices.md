## Data and references of the chemistry and nuclear parts (26.64) / 化学与核部分的数据与参考

This section is kept by hand in `scripts/data_notices.md` and inserted by `scripts/third_party_notices.py`.
Sources, versions, conversions and the values entered by hand are listed in full in `docs/chem/DATA_SOURCES.md`.
本节手工维护于 `scripts/data_notices.md`，由生成脚本插入；来源、版本、换算与手工录入值的完整清单见 `docs/chem/DATA_SOURCES.md`。

| Data in the application | Source | Terms | What VeloPhi did |
|---|---|---|---|
| `src/chem/data/aqueous.json` (aqueous reaction network) | Thermodynamic databases `phreeqc.dat`, `wateq4f.dat`, `minteq.v4.dat` distributed with PHREEQC version 3 — D. L. Parkhurst and C. A. J. Appelo, U.S. Geological Survey | USGS User Rights Notice (below) | **Modified** by VeloPhi (`scripts/chem/build_aqueous.py`, 2026-11): a subset of elements, oxidation states uncoupled into separate components, reactions rewritten in those components, files merged, and a supplement of hand-entered species added (`scripts/chem/supplement*.dat`). Recipients do not have the original databases; they are available from https://www.usgs.gov/software/phreeqc-version-3 |
| `src/chem/data/nuclides.json` | NUBASE2020: F. G. Kondev, M. Wang, W. J. Huang, S. Naimi, G. Audi, "The NUBASE2020 evaluation of nuclear physics properties", Chinese Physics C 45 (2021) 030001, doi:10.1088/1674-1137/abddae. AME2020: W. J. Huang et al., "The AME 2020 atomic mass evaluation (I)", Chinese Physics C 45 (2021) 030002, doi:10.1088/1674-1137/abddb0; M. Wang et al., "The AME 2020 atomic mass evaluation (II)", Chinese Physics C 45 (2021) 030003, doi:10.1088/1674-1137/abddaf | Creative Commons Attribution 3.0 (https://creativecommons.org/licenses/by/3.0/) | Selected fields converted to JSON and SI units; decay branches normalised; two isomer feeding fractions added from other sources (see DATA_SOURCES) |
| `src/chem/data/gas.json` (gas-phase thermodynamics) | B. J. McBride, S. Gordon, M. A. Reno, "Coefficients for Calculating Thermodynamic and Transport Properties of Individual Species", NASA TM-4513 (1993), as distributed with Cantera 3.2.0 (`nasa_gas.yaml`) | Work of the United States Government; Cantera is BSD-3-Clause | 45 species copied unchanged, renamed to VeloPhi ids |
| `src/chem/data/elements.json` | Python package `mendeleev` 1.3.0 (https://github.com/lmmentel/mendeleev) and the literature it compiles; `periodictable` 2.1.0 (crystal structures) | MIT (below); public domain. Oxidation states in `mendeleev` are compiled from a revision of the Wikipedia article "Oxidation state" — Creative Commons Attribution-ShareAlike (https://creativecommons.org/licenses/by-sa/4.0/); they are shown in the application with this attribution | Extracted at build time; names in three languages and short texts added |
| `src/chem/data/molecules.json`, `crystals.json` | Coordinates generated with RDKit 2026.09 (BSD-3-Clause; not distributed) or entered by hand from the literature cited per record | — | Generated data |
| `src/chem/data/catalog.json` (substances, reagents, reactions, electrode potentials, display spectra, flame lines) | Compiled by hand from handbooks and papers cited per entry (CODATA key values; NBS tables; CRC Handbook; NIST Critically Selected Stability Constants; R. Sander, Atmos. Chem. Phys. 15 (2015) 4399, CC BY 3.0; Palandri and Kharaka, USGS Open-File Report 2004-1068; NIST Atomic Spectra Database) | Facts and cited values | Hand-entered values are marked `entry: "hand"` and listed in DATA_SOURCES |
| `src/chem/data/xs2g.json` (two-group cross sections) | Textbook teaching values, source per value (Lamarsh and Baratta; Duderstadt and Hamilton) | Facts and cited values | Hand-entered |
| CIE 1931 colour matching functions and D65 in `engine/velophi-chem/src/color/tables.rs` | CIE 015 standard tables, exported with colour-science 0.4.6 (BSD-3-Clause; not distributed) | Standard data | Sampled at 10 nm |

Tools used only to build or to verify, not distributed with VeloPhi: PHREEQC through phreeqpython, Cantera, RDKit, colour-science, radioactivedecay, SciPy, mpmath.
只在生成数据或验证时使用、不随程序分发的工具：PHREEQC（经 phreeqpython）、Cantera、RDKit、colour-science、radioactivedecay、SciPy、mpmath。

### USGS User Rights Notice (PHREEQC)

```
User Rights Notice

This software and related material (data and (or) documentation),
contained in or furnished in connection with PHREEQC, are made available
by the U.S. Geological Survey (USGS) to be used in the public interest
and in the advancement of science.  You may, without any fee or cost,
use, copy, modify, or distribute this software, and any derivative works
thereof, and its supporting documentation, subject to the following
restrictions and understandings.

If you distribute copies or modifications of the software and related
material, make sure the recipients receive a copy of this notice and
receive or can get a copy of the original distribution.  If the software
and (or) related material are modified and distributed, it must be
made clear that the recipients do not have the original and they must
be informed of the extent of the modifications.  For example, modified
files must include a prominent notice stating the modifications made, the
author of the modifications, and the date the modifications were made.
This restriction is necessary to guard against problems introduced in the
software by others, reflecting negatively on the reputation of the USGS.

The software is public property and you therefore have the right to
the source code, if desired.

You may charge fees for distribution, warranties, and services provided
in connection with the software or derivative works thereof.  The name
USGS can be used in any advertising or publicity to endorse or promote
any products or commercial entity using this software if specific
written permission is obtained from the USGS.

The user agrees to appropriately acknowledge the authors and the USGS
in publications that result from the use of this software or in products
that include this software in whole or in part.

Although this software program has been used by the U.S. Geological
Survey (USGS), no warranty, expressed or implied, is made by the USGS
or the U.S. Government as to the accuracy and functioning of the
program and related program material nor shall the fact of distribution
constitute any such warranty, and no responsibility is assumed by the
USGS in connection therewith. 

The authors, the USGS, and the United States Government are not
obligated to provide the user with any support, consulting, training or
assistance of any kind with regard to the use, operation, and
performance of this software nor to provide the user with any updates,
revisions, new versions, or "bug fixes."

The user assumes all risk for any damages whatsoever resulting from
loss of use, data, or profits arising in connection with the access,
use, quality, or performance of this software.
```

### mendeleev — MIT License

```
The MIT License (MIT)

Copyright (c) 2015 Lukasz Mentel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
