"""Build tests/fixtures/oracles2656.json from the domain modules.

  python3 -I scripts/oracles/build.py            all modules (the reproducible run)
  python3 -I scripts/oracles/build.py n f        only these modules again; the others come from the per-module
                                                 cache of the last full run (a temporary directory, development only)
"""
import json, os, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
import common

MODULES = ['g', 'm1', 'm2', 'e', 'b', 't', 'q', 'n', 'f', 'w', 'o', 'r', 'x']
cache = os.path.join(tempfile.gettempdir(), 'velophi-oracles')
os.makedirs(cache, exist_ok=True)
only = [a for a in sys.argv[1:] if a in MODULES]
cases = []
for mod in MODULES:
    if not os.path.exists(os.path.join(here, mod + '.py')):
        continue
    cpath = os.path.join(cache, mod + '.json')
    if only and mod not in only and os.path.exists(cpath):
        with open(cpath, encoding='utf-8') as fh:
            cases += json.load(fh)
        continue
    start = len(common.CASES)
    __import__(mod)
    mine = common.CASES[start:]
    with open(cpath, 'w', encoding='utf-8') as fh:
        json.dump(mine, fh)
    cases += mine
out = os.path.join(here, '..', '..', 'tests', 'fixtures', 'oracles2656.json')
with open(out, 'w', encoding='utf-8') as fh:
    json.dump({'generator': 'scripts/oracles (mpmath %s, 50 digits)' % common.mp.__version__, 'cases': cases}, fh, ensure_ascii=False, indent=1)
print(len(cases), 'cases →', os.path.relpath(out))
