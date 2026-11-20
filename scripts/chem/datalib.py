"""Shared helpers of the element / molecule / crystal data pipeline.

Used by build_elements.py, build_molecules.py, build_crystals.py and check_data.py. Everything here is
deterministic: no clocks, no randomness, no dictionary-order dependence in what gets written.
"""
import ast
import json
import math
import os
import re
from importlib import metadata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
DATA_DIR = os.path.join(ROOT, 'src', 'chem', 'data')

ELEMENT_SYMBOLS = (
    'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr '
    'Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir '
    'Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl '
    'Mc Lv Ts Og').split()
assert len(ELEMENT_SYMBOLS) == 118


def package_versions(*names):
    """Installed versions of the named distributions, for the `generator` block of a product."""
    return {n: metadata.version(n) for n in names}


def clean_float(x, digits):
    """Round to `digits` decimals and turn -0.0 into 0.0 so the text of a product never depends on the sign of zero."""
    if x is None:
        return None
    v = round(float(x), digits)
    if not math.isfinite(v):
        raise ValueError('non-finite number in output: %r' % (x,))
    return 0.0 if v == 0 else v


def compact(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def write_records(path, head, key, records, tail=None):
    """Write `{...head, key: [records], ...tail}` with one record per line.

    One line per record keeps the file small (no indentation) and still gives line-based diffs. Always UTF-8
    with LF line ends, so the bytes are the same on every platform.
    """
    parts = ['{']
    for k, v in head.items():
        parts.append(compact(k) + ':' + compact(v) + ',')
    parts.append(compact(key) + ':[')
    for i, r in enumerate(records):
        parts.append(compact(r) + (',' if i + 1 < len(records) else ''))
    if tail:
        parts.append('],')
        items = list(tail.items())
        for i, (k, v) in enumerate(items):
            parts.append(compact(k) + ':' + compact(v) + (',' if i + 1 < len(items) else ''))
    else:
        parts.append(']')
    parts.append('}')
    text = '\n'.join(parts) + '\n'
    json.loads(text)  # the product must parse
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    return text


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


# ---------------------------------------------------------------- formulas

_TOKEN = re.compile(r'([A-Z][a-z]?)|(\d+)|([()\[\]])')


def parse_formula(text):
    """Composition and net charge of a display formula such as `C2H5OH`, `SO4^2-` or `[Cu(NH3)4]^2+`.

    Returns (counts by element symbol, charge). Raises ValueError on anything it does not understand, so a typo in
    the curated list cannot pass silently.
    """
    body, charge = text, 0
    if '^' in text:
        body, tail = text.split('^', 1)
        m = re.fullmatch(r'(\d*)([+-])', tail)
        if not m:
            raise ValueError('bad charge suffix in formula %r' % text)
        charge = int(m.group(1) or '1') * (1 if m.group(2) == '+' else -1)
    body = body.replace('=', '').replace('≡', '')  # bond marks of condensed formulas (CH2=CH2, CH≡CH) carry no atoms
    stack = [{}]
    pos = 0
    closers = {')': '(', ']': '['}
    opened = []
    last = None  # the group or element a following count multiplies
    while pos < len(body):
        m = _TOKEN.match(body, pos)
        if not m:
            raise ValueError('bad character %r in formula %r' % (body[pos], text))
        pos = m.end()
        sym, num, br = m.groups()
        if sym:
            if sym not in ELEMENT_SYMBOLS:
                raise ValueError('unknown element %r in formula %r' % (sym, text))
            last = {sym: 1}
            _add(stack[-1], last, 1)
        elif num:
            if last is None:
                raise ValueError('count without a group in formula %r' % text)
            _add(stack[-1], last, int(num) - 1)
            last = None
        elif br in '([':
            opened.append(br)
            stack.append({})
            last = None
        else:
            if not opened or opened.pop() != closers[br]:
                raise ValueError('unbalanced brackets in formula %r' % text)
            last = stack.pop()
            _add(stack[-1], last, 1)
    if opened:
        raise ValueError('unbalanced brackets in formula %r' % text)
    return {k: v for k, v in sorted(stack[0].items())}, charge


def _add(into, group, times):
    for k, v in group.items():
        into[k] = into.get(k, 0) + v * times


def count_atoms(atoms):
    out = {}
    for a in atoms:
        out[a] = out.get(a, 0) + 1
    return {k: v for k, v in sorted(out.items())}


# ---------------------------------------------------------------- graph symmetry

def symmetry_classes(atoms, pairs):
    """Classes of atoms that the skeleton (elements and connectivity only) cannot tell apart.

    Iterated neighbourhood refinement. Bond orders and formal charges are ignored on purpose: the two oxygens of a
    carboxylate, or the four of sulfate, land in one class although a single Lewis structure draws them differently.
    """
    n = len(atoms)
    nbr = [[] for _ in range(n)]
    for i, j in pairs:
        nbr[i].append(j)
        nbr[j].append(i)
    keys = sorted(set(atoms))
    cls = [keys.index(a) for a in atoms]
    count = len(keys)
    while True:
        sig = [(cls[i], tuple(sorted(cls[j] for j in nbr[i]))) for i in range(n)]
        order = sorted(set(sig))
        new = [order.index(s) for s in sig]
        if len(order) == count:
            return new
        cls, count = new, len(order)


def bond_pairs(bonds):
    """The flat [i, j, order, ...] list of the product as (i, j, order) triples."""
    return [(bonds[k], bonds[k + 1], bonds[k + 2]) for k in range(0, len(bonds), 3)]


# ---------------------------------------------------------------- small numeric expressions

_FUNCS = {
    'sqrt': math.sqrt,
    'sind': lambda d: math.sin(math.radians(d)),
    'cosd': lambda d: math.cos(math.radians(d)),
    'tand': lambda d: math.tan(math.radians(d)),
    'asind': lambda v: math.degrees(math.asin(v)),
    'acosd': lambda v: math.degrees(math.acos(v)),
    'atand': lambda v: math.degrees(math.atan(v)),
}
_BINOPS = {ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: lambda a, b: a * b,
           ast.Div: lambda a, b: a / b, ast.Pow: lambda a, b: a ** b}


def evaluate(expr, variables=None):
    """Value of an arithmetic expression from the curated list, e.g. `2.25*cosd(45.5)`.

    Only numbers, + - * / **, parentheses, the trigonometric helpers above (in degrees) and the named variables are
    accepted; the published numbers stay visible in the list instead of being pre-multiplied by hand.
    """
    def walk(node):
        if isinstance(node, ast.Expression):
            return walk(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.Name) and variables is not None and node.id in variables:
            return float(variables[node.id])
        if isinstance(node, ast.BinOp) and type(node.op) in _BINOPS:
            return _BINOPS[type(node.op)](walk(node.left), walk(node.right))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            v = walk(node.operand)
            return -v if isinstance(node.op, ast.USub) else v
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _FUNCS and len(node.args) == 1:
            return _FUNCS[node.func.id](walk(node.args[0]))
        raise ValueError('expression not allowed: %r' % expr)
    return walk(ast.parse(expr.strip(), mode='eval'))


# ---------------------------------------------------------------- geometry of a product record

def distance(xyz, i, j):
    return math.sqrt(sum((xyz[3 * i + k] - xyz[3 * j + k]) ** 2 for k in range(3)))


def angle(xyz, i, j, k):
    """Angle i-j-k in degrees."""
    a = [xyz[3 * i + t] - xyz[3 * j + t] for t in range(3)]
    b = [xyz[3 * k + t] - xyz[3 * j + t] for t in range(3)]
    na = math.sqrt(sum(v * v for v in a))
    nb = math.sqrt(sum(v * v for v in b))
    c = sum(p * q for p, q in zip(a, b)) / (na * nb)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))
