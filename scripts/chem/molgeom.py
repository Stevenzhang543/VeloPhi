"""Geometry builders for the species a force field cannot type: ideal VSEPR / coordination polyhedra, Z-matrices
with explicit published lengths and angles, and two closed-form cages.

A geometry instruction is the text after the prefix in the `geom` column of molecules.txt:

  vsepr:<shape>[(k=v,...)]:<centre>:<ligand>,<ligand>,...
      ligand = <group>[(k=v,...)]@<length>[b<order>][*<count>]
      group  = an element symbol, or OH, OH2, NH3, CN, CO, NCS (bonded through the first atom)
  manual:<row>;<row>;...
      row    = <symbol> [<ref> <length> [<ref> <angle> [<ref> <dihedral>]]] [b<order>]     (a Z-matrix, 1-based refs)
             | +<i>-<j>[:<order>]                                                         (an extra bond)
      symbol X is a dummy atom: it helps to place others and is dropped from the result
  special:c60(r56=..,r66=..) | special:ferrocene(fec=..,cc=..,ch=..)

A length written `?` is not a published value: it is replaced by the sum of covalent radii (single-, double- or
triple-bond radii according to the bond order) from elements.json, and the species is then reported as `vsepr`,
never as `literature`. Lengths and angles may be arithmetic expressions (datalib.evaluate), so the published
numbers appear in the list as printed in the source.

Frames: the result of a builder is already in a sensible display frame (planar species in the xy plane, the main
axis of a polyhedron along y), so build_molecules.py only moves the centroid to the origin.
"""
import math
import re

import numpy as np

from datalib import evaluate

TET = math.degrees(math.acos(-1.0 / 3.0))  # 109.4712...


class GeomError(ValueError):
    pass


class Radii:
    """Covalent radii (pm) by bond order from elements.json."""

    def __init__(self, elements):
        self.table = {e['symbol']: e['radius'] for e in elements}

    def bond(self, a, b, order):
        key = {1: 'covalent', 2: 'covalentDouble', 3: 'covalentTriple'}.get(int(round(order)), 'covalent')
        ra, rb = self.table[a][key], self.table[b][key]
        if ra is None or rb is None:
            raise GeomError('no %s radius for %s-%s' % (key, a, b))
        return (ra + rb) / 100.0


class Builder:
    def __init__(self, radii):
        self.radii = radii
        self.atoms = []
        self.pos = []
        self.bonds = []
        self.estimated = False  # a `?` length was used

    def add(self, sym, p):
        self.atoms.append(sym)
        self.pos.append(np.array(p, dtype=float))
        return len(self.atoms) - 1

    def bond(self, i, j, order=1.0):
        self.bonds.append((min(i, j), max(i, j), float(order)))

    def length(self, text, a, b, order):
        if text.strip() == '?':
            self.estimated = True
            return self.radii.bond(a, b, order)
        return evaluate(text)

    def result(self):
        keep = [i for i, s in enumerate(self.atoms) if s != 'X']
        remap = {old: new for new, old in enumerate(keep)}
        bonds = sorted((remap[i], remap[j], o) for i, j, o in self.bonds if i in remap and j in remap)
        if len({(i, j) for i, j, _ in bonds}) != len(bonds):
            raise GeomError('duplicate bond')
        return {'atoms': [self.atoms[i] for i in keep], 'xyz': np.array([self.pos[i] for i in keep]), 'bonds': bonds,
                'estimated': self.estimated}


def unit(v):
    n = float(np.linalg.norm(v))
    if n < 1e-12:
        raise GeomError('zero-length direction')
    return np.asarray(v, dtype=float) / n


def parse_params(text):
    out = {}
    if text:
        for item in text.split(','):
            k, v = item.split('=')
            out[k.strip()] = v.strip()
    return out


# ---------------------------------------------------------------- Z-matrix

def build_zmatrix(body, radii):
    b = Builder(radii)
    extra = []
    for row in [r.strip() for r in body.split(';') if r.strip()]:
        m = re.fullmatch(r'\+(\d+)-(\d+)(?::([\d.]+))?', row)
        if m:
            extra.append((int(m.group(1)) - 1, int(m.group(2)) - 1, float(m.group(3) or 1)))
            continue
        tok = row.split()
        order = 1.0
        if re.fullmatch(r'b[\d.]+', tok[-1]):
            order = float(tok[-1][1:])
            tok = tok[:-1]
        sym, args = tok[0], tok[1:]
        n = len(b.atoms)
        if n == 0:
            if args:
                raise GeomError('first Z-matrix row takes no references: %r' % row)
            b.add(sym, (0.0, 0.0, 0.0))
            continue
        if len(args) not in (2, 4, 6) or (len(args) == 2 and n != 1):
            raise GeomError('bad Z-matrix row %r' % row)
        a = int(args[0]) - 1
        r = b.length(args[1], sym, b.atoms[a], order)
        if len(args) == 2:
            p = b.pos[a] + np.array([r, 0.0, 0.0])
        else:
            ref = int(args[2]) - 1
            th = math.radians(evaluate(args[3]))
            e1 = unit(b.pos[ref] - b.pos[a])
            if len(args) == 4:
                # no dihedral: stay in the xy plane, on the +90 degree side of the reference direction
                if abs(e1[2]) > 1e-9:
                    raise GeomError('row %r needs a dihedral: its reference bond leaves the xy plane' % row)
                e2 = np.array([-e1[1], e1[0], 0.0])
                p = b.pos[a] + r * (math.cos(th) * e1 + math.sin(th) * e2)
            else:
                c = int(args[4]) - 1
                phi = math.radians(evaluate(args[5]))
                if abs(math.sin(th)) < 1e-12:
                    p = b.pos[a] + r * math.cos(th) * e1
                else:
                    w = b.pos[c] - b.pos[ref]
                    w = w - np.dot(w, e1) * e1
                    e2 = unit(w)  # raises when the three references are collinear: use a dummy atom then
                    e3 = np.cross(e1, e2)
                    p = b.pos[a] + r * (math.cos(th) * e1 + math.sin(th) * (math.cos(phi) * e2 + math.sin(phi) * e3))
        i = b.add(sym, p)
        if order > 0 and sym != 'X' and b.atoms[a] != 'X':
            b.bond(a, i, order)
    for i, j, o in extra:
        b.bond(i, j, o)
    return b.result()


# ---------------------------------------------------------------- VSEPR and coordination polyhedra

def _ring(n, y=0.0, radius=1.0, start=90.0):
    return [(radius * math.cos(math.radians(start + 360.0 * k / n)), y, radius * math.sin(math.radians(start + 360.0 * k / n))) for k in range(n)]


def _pyramid(angle, n, start):
    """n ligands below the centre, any two of them `angle` apart (n-fold axis along y, lone pair up)."""
    s2 = (1.0 - math.cos(math.radians(angle))) / (1.0 - math.cos(2.0 * math.pi / n))
    s = math.sqrt(s2)
    return _ring(n, y=-math.sqrt(max(0.0, 1.0 - s2)), radius=s, start=start)


def shape_directions(shape, p):
    """Unit vectors of the ligand positions of a shape, in a fixed documented order."""
    g = lambda k, d: evaluate(p[k]) if k in p else d  # noqa: E731
    if shape == 'linear':
        return [(1, 0, 0), (-1, 0, 0)]
    if shape == 'bent':  # AX2E or AX2E2: the angle is the parameter a
        h = math.radians(g('a', TET)) / 2.0
        return [(math.sin(h), -math.cos(h), 0), (-math.sin(h), -math.cos(h), 0)]
    if shape == 'trigonal-planar':
        return [(math.sin(math.radians(t)), math.cos(math.radians(t)), 0) for t in (0, 120, 240)]
    if shape == 'trigonal-pyramidal':  # AX3E, X-A-X angle a
        return _pyramid(g('a', TET), 3, 90.0)
    if shape == 'tetrahedral':
        return [(0, 1, 0)] + _pyramid(TET, 3, 90.0)
    if shape == 'trigonal-bipyramidal':  # axial, axial, three equatorial
        return [(0, 1, 0), (0, -1, 0)] + _ring(3)
    if shape == 'seesaw':  # AX4E: axial, axial, two equatorial; ax = angle between the axial bonds, eq = between the equatorial ones
        d = math.radians((180.0 - g('ax', 180.0)) / 2.0)
        h = math.radians(g('eq', 120.0)) / 2.0
        return [(math.sin(d), math.cos(d), 0), (math.sin(d), -math.cos(d), 0), (math.cos(h), 0, math.sin(h)), (math.cos(h), 0, -math.sin(h))]
    if shape == 't-shaped':  # AX3E2: axial, axial, equatorial; a = axial-equatorial angle
        a = math.radians(g('a', 90.0))
        return [(math.cos(a), math.sin(a), 0), (math.cos(a), -math.sin(a), 0), (1, 0, 0)]
    if shape == 'octahedral':  # top, bottom, then the equatorial ring in order (1 trans 2, 3 trans 5, 4 trans 6)
        return [(0, 1, 0), (0, -1, 0), (1, 0, 0), (0, 0, 1), (-1, 0, 0), (0, 0, -1)]
    if shape == 'square-pyramidal':  # AX5E: apex, then four basal; a = apex-basal angle
        a = math.radians(g('a', 90.0))
        return [(0, 1, 0)] + _ring(4, y=math.cos(a), radius=math.sin(a), start=0.0)
    if shape == 'square-planar':  # in the xy plane, in ring order (1 trans 3, 2 trans 4)
        return [(1, 0, 0), (0, 1, 0), (-1, 0, 0), (0, -1, 0)]
    if shape == 'pentagonal-bipyramidal':  # axial, axial, five equatorial
        return [(0, 1, 0), (0, -1, 0)] + _ring(5)
    raise GeomError('unknown shape %r' % shape)


_LIGAND = re.compile(r'([A-Za-z0-9]+)(?:\(([^)]*)\))?@([^b*]+?)(?:b([\d.]+))?(?:\*(\d+))?')


def _perp(u):
    """A fixed unit vector perpendicular to u: in the xy plane whenever u is."""
    z = np.array([0.0, 0.0, 1.0])
    w = np.cross(z, u)
    if np.linalg.norm(w) < 1e-9:
        w = np.array([1.0, 0.0, 0.0])
    return unit(w)


def _place_hydrogens(b, anchor, u, polar_deg, count, bond_len, torsion):
    """Hydrogens on a ligand atom: `count` of them on a cone of half-angle polar_deg around the direction back to
    the centre. The rotation about the bond is the given torsion, or else the one of 36 that keeps the new atoms
    farthest from everything already placed (first best wins, so the choice is deterministic)."""
    e2 = _perp(u)
    e3 = np.cross(u, e2)
    th = math.radians(polar_deg)

    def positions(phi0):
        out = []
        for k in range(count):
            phi = math.radians(phi0 + 360.0 * k / count)
            out.append(b.pos[anchor] + bond_len * (-math.cos(th) * u + math.sin(th) * (math.cos(phi) * e2 + math.sin(phi) * e3)))
        return out

    if torsion is not None:
        best = positions(torsion)
    else:
        best, score = None, -1.0
        others = [p for i, p in enumerate(b.pos) if i != anchor]
        for step in range(36):
            cand = positions(10.0 * step)
            d = min((float(np.linalg.norm(c - o)) for c in cand for o in others), default=0.0)
            if d > score + 1e-9:
                best, score = cand, d
    for p in best:
        b.bond(anchor, b.add('H', p))


def _attach(b, centre, group, params, length_text, order, u):
    u = unit(u)
    g = lambda k, d: evaluate(params[k]) if k in params else d  # noqa: E731
    tor = evaluate(params['tor']) if 'tor' in params else None
    first = {'OH': 'O', 'OH2': 'O', 'NH3': 'N', 'CN': 'C', 'CO': 'C', 'NCS': 'N'}.get(group, group)
    d = b.length(length_text, b.atoms[centre], first, order)
    i = b.add(first, b.pos[centre] + d * u)
    b.bond(centre, i, order)
    if group == 'OH':  # standard hydroxyl: O-H 0.96 A, centre-O-H 109.5 degrees unless given
        _place_hydrogens(b, i, u, g('ang', 109.5), 1, g('oh', 0.96), tor)
    elif group == 'OH2':  # free-water geometry, the centre on the bisector in the plane of the molecule
        _place_hydrogens(b, i, u, 180.0 - g('hoh', 104.5) / 2.0, 2, g('oh', 0.958), tor)
    elif group == 'NH3':  # free-ammonia geometry: N-H 1.012 A, H-N-H 106.7 degrees
        s = math.sqrt((1.0 - math.cos(math.radians(g('hnh', 106.7)))) / 1.5)
        _place_hydrogens(b, i, u, math.degrees(math.asin(s)), 3, g('nh', 1.012), tor)
    elif group in ('CN', 'CO'):
        second = 'N' if group == 'CN' else 'O'
        key = 'cn' if group == 'CN' else 'co'
        r = b.length(params.get(key, '?'), 'C', second, 3)
        b.bond(i, b.add(second, b.pos[i] + r * u), 3)
    elif group == 'NCS':
        r1 = b.length(params.get('nc', '?'), 'N', 'C', 3)
        j = b.add('C', b.pos[i] + r1 * u)
        b.bond(i, j, 3)
        r2 = b.length(params.get('cs', '?'), 'C', 'S', 1)
        b.bond(j, b.add('S', b.pos[j] + r2 * u), 1)
    elif group != first:
        raise GeomError('unknown ligand group %r' % group)


def build_vsepr(body, radii):
    parts = body.split(':')
    if len(parts) != 3:
        raise GeomError('vsepr instruction needs shape:centre:ligands, got %r' % body)
    m = re.fullmatch(r'([a-z0-9-]+)(?:\(([^)]*)\))?', parts[0])
    if not m:
        raise GeomError('bad shape %r' % parts[0])
    dirs = shape_directions(m.group(1), parse_params(m.group(2)))
    b = Builder(radii)
    centre = b.add(parts[1], (0.0, 0.0, 0.0))
    ligands = []
    for item in _split_top(parts[2]):
        lm = _LIGAND.fullmatch(item.strip())
        if not lm:
            raise GeomError('bad ligand %r' % item)
        group, params, length_text, order, count = lm.groups()
        ligands += [(group, parse_params(params), length_text, float(order or 1))] * int(count or 1)
    if len(ligands) != len(dirs):
        raise GeomError('shape %s has %d positions, %d ligands given' % (m.group(1), len(dirs), len(ligands)))
    for (group, params, length_text, order), u in zip(ligands, dirs):
        _attach(b, centre, group, params, length_text, order, np.array(u, dtype=float))
    return b.result()


def _split_top(text):
    """Split on commas that are not inside parentheses."""
    out, depth, cur = [], 0, ''
    for ch in text:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            out.append(cur)
            cur = ''
        else:
            cur += ch
    out.append(cur)
    return out


# ---------------------------------------------------------------- closed-form cages

def build_c60(params, radii):
    """Truncated icosahedron with two edge lengths: r56 on the pentagons, r66 between two hexagons.

    Every atom sits on an edge of a regular icosahedron of edge L = r66 + 2 r56, at the fraction t = r56 / L from one
    of its ends. The 30 hexagon-hexagon edges are written as double bonds, which is one Kekulé structure of C60.
    """
    r56, r66 = evaluate(params['r56']), evaluate(params['r66'])
    phi = (1.0 + math.sqrt(5.0)) / 2.0
    verts = []
    for s1 in (1, -1):
        for s2 in (1, -1):
            verts += [(0, s1, s2 * phi), (s1, s2 * phi, 0), (s2 * phi, 0, s1)]
    verts = np.array(sorted(verts), dtype=float)
    edge = r66 + 2.0 * r56
    verts *= edge / 2.0  # the coordinates above have edge length 2
    t = r56 / edge
    b = Builder(radii)
    index = {}
    for i in range(12):
        for j in range(12):
            if i != j and abs(np.linalg.norm(verts[i] - verts[j]) - edge) < 1e-6:
                index[(i, j)] = b.add('C', verts[i] + t * (verts[j] - verts[i]))
    if len(b.atoms) != 60:
        raise GeomError('C60 construction gave %d atoms' % len(b.atoms))
    for (i, j), a in sorted(index.items()):
        if i < j:
            b.bond(a, index[(j, i)], 2)
        for (i2, k), c in sorted(index.items()):
            if i2 == i and k > j and abs(np.linalg.norm(b.pos[a] - b.pos[c]) - r56) < 1e-6:
                b.bond(a, c, 1)
    if len(b.bonds) != 90:
        raise GeomError('C60 construction gave %d bonds' % len(b.bonds))
    return b.result()


def build_ferrocene(params, radii):
    """Eclipsed (D5h) sandwich from the Fe-C, C-C and C-H distances; ring planes perpendicular to y."""
    fec, cc, ch = evaluate(params['fec']), evaluate(params['cc']), evaluate(params['ch'])
    ring_r = cc / (2.0 * math.sin(math.pi / 5.0))
    height = math.sqrt(fec * fec - ring_r * ring_r)
    b = Builder(radii)
    fe = b.add('Fe', (0.0, 0.0, 0.0))
    for sign in (1.0, -1.0):
        carbons = [b.add('C', p) for p in _ring(5, y=sign * height, radius=ring_r)]
        for k, c in enumerate(carbons):
            b.bond(fe, c, 1)
            b.bond(c, carbons[(k + 1) % 5], 1.5)
        for c, p in zip(carbons, _ring(5, y=sign * height, radius=ring_r + ch)):
            b.bond(c, b.add('H', p), 1)
    return b.result()


def build(instruction, radii):
    """Dispatch a `geom` instruction; returns atoms, xyz (numpy), bonds [(i, j, order)], estimated."""
    kind, _, body = instruction.partition(':')
    if kind == 'vsepr':
        return build_vsepr(body, radii)
    if kind == 'manual':
        return build_zmatrix(body, radii)
    if kind == 'special':
        m = re.fullmatch(r'([a-z0-9]+)\(([^)]*)\)', body)
        if m and m.group(1) == 'c60':
            return build_c60(parse_params(m.group(2)), radii)
        if m and m.group(1) == 'ferrocene':
            return build_ferrocene(parse_params(m.group(2)), radii)
    raise GeomError('unknown geometry instruction %r' % instruction)
