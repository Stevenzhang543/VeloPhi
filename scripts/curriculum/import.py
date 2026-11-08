"""Import the curriculum workbook (26.62, D222) into src/curriculum/data/curriculum.json.

  python3 -I scripts/curriculum/import.py

Source: docs/curriculum/VeloPhi_Physics_Curriculum_Masterplan.xlsx (research baseline 2026-11-08, written for VeloPhi;
candidate course mappings, not an official certification — see its sheet 说明与使用规则). The workbook is the only
input; the JSON keeps every sheet in compact positional rows, deduplicates the long repeated cells and checks that the
scene sheet repeats the topic sheet (so only the scene ids are kept). The app maps topics and components to its own
resources in src/curriculum/links.ts and components.ts — never in this generated file.
"""
import hashlib, json, os, sys

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit('openpyxl is required (pip install openpyxl)')

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(os.path.join(here, '..', '..'))
src = os.path.join(root, 'docs', 'curriculum', 'VeloPhi_Physics_Curriculum_Masterplan.xlsx')
out = os.path.join(root, 'src', 'curriculum', 'data', 'curriculum.json')

wb = openpyxl.load_workbook(src, data_only=True)


def rows(name, width):
    ws = wb[name]
    data = [tuple(r[:width]) for r in ws.iter_rows(values_only=True)]
    return data[0], [r for r in data[1:] if any(c is not None for c in r)]


def s(v):
    return '' if v is None else str(v).strip()


class Pool:
    """Deduplicated long cells (acceptance text, boundary text, URLs)."""
    def __init__(self):
        self.items, self.index = [], {}

    def __call__(self, v):
        v = s(v)
        if v not in self.index:
            self.index[v] = len(self.items)
            self.items.append(v)
        return self.index[v]


urls, accepts, bounds = Pool(), Pool(), Pool()

# ---- topics (知识模拟总表) ----
head, trows = rows('知识模拟总表', 21)
assert head[0] == 'ID' and head[20] == '参考标准URL', head
topics = []
for r in trows:
    deps = [d.strip() for d in s(r[16]).split(',') if d.strip()]
    topics.append([s(r[0]), s(r[1]), s(r[2]), s(r[3]), s(r[4]), s(r[5]), s(r[6]), s(r[7]), int(r[8]),
                   s(r[9]), s(r[10]), s(r[11]), s(r[12]), s(r[13]), s(r[14]), s(r[15]), deps, s(r[17]),
                   accepts(r[18]), bounds(r[19]), urls(r[20])])
ids = [t[0] for t in topics]
assert len(ids) == len(set(ids)) == 283, len(ids)

# ---- scenes (实验场景模板): must repeat the topic row ----
head, srows = rows('实验场景模板', 12)
by_id = {t[0]: t for t in topics}
scenes = []
for r in srows:
    t = by_id[s(r[1])]
    same = (s(r[2]) == t[1], s(r[3]) == t[7], s(r[4]) == t[4], s(r[5]) == t[6], s(r[6]) == t[5], s(r[7]) == t[3],
            accepts(r[8]) == t[18], s(r[9]) == t[17], [d.strip() for d in s(r[10]).split(',') if d.strip()] == t[16], urls(r[11]) == t[20])
    assert all(same), (r[0], same)
    scenes.append([s(r[0]), s(r[1])])
assert len(scenes) == 283

# ---- components (物理与软件组件库) ----
head, crows = rows('物理与软件组件库', 10)
kernels = {s(r[6]) for r in crows}
ifaces = {s(r[8]) for r in crows}
assert len(kernels) == 1 and len(ifaces) == 1, (kernels, ifaces)
components = [[s(r[0]), s(r[1]), s(r[2]), s(r[3]), s(r[4]), s(r[5]), s(r[7]), s(r[9]) == '是'] for r in crows]
assert len(components) == 310
cids = {c[0] for c in components}
missing = sorted({d for t in topics for d in t[16]} - cids)
assert not missing, missing

# ---- the small sheets ----
_, acc = rows('数值与教学验收', 4)
acceptance = [[s(x) for x in r] for r in acc]
assert len(acceptance) == 30
_, rm = rows('研发阶段Roadmap', 6)
roadmap = [[s(x) for x in r] for r in rm]
_, so = rows('课程标准来源', 6)
sources = [[s(x) for x in r] for r in so]
_, ru = rows('说明与使用规则', 2)
rules = [s(r[1]) for r in ru]
_, sy = rows('官方课程章节索引', 6)
syllabus = [[s(x) for x in r] for r in sy]
assert len(syllabus) == 168
_, ju = rows('中国初中21项必做实验', 9)
junior = [[s(r[0]), s(r[1]), s(r[2]), s(r[3]), s(r[4]), s(r[5]), s(r[6]), urls(r[7]), s(r[8])] for r in ju]
assert len(junior) == 21

_, ov = rows('项目概览', 8)
priorities = [[s(r[0]), int(r[1]), s(r[2])] for r in ov if s(r[0]).startswith('P') and isinstance(r[1], (int, float))]
advice = next(s(r[0]) for r in ov if s(r[0]).startswith('开发建议'))
baseline = next(s(r[0]) for r in ov if s(r[0]).startswith('研究基准'))

with open(src, 'rb') as fh:
    digest = hashlib.sha256(fh.read()).hexdigest()

data = {
    'source': {'file': 'docs/curriculum/VeloPhi_Physics_Curriculum_Masterplan.xlsx', 'sha256': digest, 'baseline': baseline},
    'kernel': kernels.pop(), 'interface': ifaces.pop(),
    'priorities': priorities, 'advice': advice,
    'urls': urls.items, 'accepts': accepts.items, 'bounds': bounds.items,
    'topics': topics, 'scenes': scenes, 'components': components, 'acceptance': acceptance,
    'roadmap': roadmap, 'sources': sources, 'rules': rules, 'syllabus': syllabus, 'junior': junior,
}
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
    fh.write('\n')
print(f'{len(topics)} topics, {len(components)} components, {len(syllabus)} syllabus chapters, {len(junior)} experiments → {os.path.relpath(out, root)} ({os.path.getsize(out)} bytes)')
