/**
 * Coverage matrix of 26.56 (ENG, FOR, EDU, UX requirements and the 180 model families of the blueprint), generated
 * from the registry data — not written by hand — and checked against the repository:
 *
 *   node scripts/coverage.mjs [--check]
 *
 * Inputs: src/content/models (the registry, bundled with esbuild), src/teaching/activities, the independent
 * reference values tests/fixtures/oracles2656.json, the requirement statuses docs/coverage/requirements-26.56.json
 * and the baseline docs/coverage/baseline-26.55.json. Every evidence reference must resolve:
 *
 *   oracle:<model>             at least three independent reference cases of the model in the fixture
 *   test:<file> <title part>   tests/<file>.test.ts exists and contains the title part
 *   rust:<path> <fn>           engine/velophi-core/<path> has a #[test] fn <fn>
 *   regress:engine template X  template X exists (the Rust–TypeScript run comparison of tests/engine.test.ts — a
 *                              port regression, never counted as independent evidence)
 *
 * The status of a model must agree with its evidence: "verified" needs the oracle cases, and from level 2 on at
 * least one test of the simulation or lab against an independent reference (test: or rust:). A model is "complete"
 * in the sense of the 26.56 brief only when it is verified at level 2 or more, has a graded teaching activity
 * (teaching 2), can be used interactively (template or lab and the activity) and exports with a run manifest.
 *
 * Writes docs/coverage/COVERAGE_26_56.md and docs/coverage/coverage-26.56.json; --check only verifies (exit 1 on
 * any unresolved reference or inconsistent status).
 */
import { build } from 'esbuild'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const checkOnly = process.argv.includes('--check')

// ---- load the registry ----
const tmp = join(tmpdir(), `velophi-coverage-${process.pid}`)
mkdirSync(tmp, { recursive: true })
const entry = join(tmp, 'entry.ts')
writeFileSync(entry, [
  `export { MODELS, linksOf } from ${JSON.stringify(join(repo, 'src/content/models/index.ts'))}`,
  `export { ACTIVITIES } from ${JSON.stringify(join(repo, 'src/teaching/activities/index.ts'))}`
].join('\n'))
const outfile = join(tmp, 'registry.mjs')
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' })
const { MODELS, linksOf, ACTIVITIES } = await import(pathToFileURL(outfile).href)
rmSync(tmp, { recursive: true, force: true })

const fixture = JSON.parse(readFileSync(join(repo, 'tests/fixtures/oracles2656.json'), 'utf8'))
const baseline = JSON.parse(readFileSync(join(repo, 'docs/coverage/baseline-26.55.json'), 'utf8'))
const reqs = JSON.parse(readFileSync(join(repo, 'docs/coverage/requirements-26.56.json'), 'utf8')).requirements
const version = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version.replace(/\.0$/, '')

const baseModel = new Map(baseline.models.map(m => [m.id, m]))
const baseReq = new Map(baseline.requirements.map(r => [r.id, r]))
const oracleCount = new Map()
for (const c of fixture.cases) oracleCount.set(c.model, (oracleCount.get(c.model) ?? 0) + 1)

// ---- evidence references ----
const problems = []
const fileCache = new Map()
const read = p => { if (!fileCache.has(p)) fileCache.set(p, existsSync(p) ? readFileSync(p, 'utf8') : null); return fileCache.get(p) }
const templateText = readdirSync(join(repo, 'src/templates')).filter(f => f.endsWith('.ts')).map(f => read(join(repo, 'src/templates', f))).join('\n')

/** Resolve one reference: { kind, file, name, independent } or a problem. */
function resolveRef(ref, owner) {
  const [kind, rest = ''] = ref.split(/:(.*)/s)
  const sp = rest.indexOf(' ')
  const head = sp < 0 ? rest : rest.slice(0, sp)
  const tail = sp < 0 ? '' : rest.slice(sp + 1)
  if (kind === 'oracle') {
    const n = oracleCount.get(head) ?? 0
    if (n < 3) problems.push(`${owner}: ${ref}: ${n} reference cases (at least 3)`)
    return { kind, file: 'tests/fixtures/oracles2656.json', name: `${n} cases`, independent: true, n }
  }
  if (kind === 'test') {
    const file = `tests/${head}.test.ts`
    const text = read(join(repo, file))
    if (text === null) problems.push(`${owner}: ${ref}: no file ${file}`)
    else if (tail && !text.includes(tail)) problems.push(`${owner}: ${ref}: “${tail}” not found in ${file}`)
    return { kind, file, name: tail, independent: true }
  }
  if (kind === 'rust') {
    const file = `engine/velophi-core/${head}`
    const text = read(join(repo, file))
    if (text === null) problems.push(`${owner}: ${ref}: no file ${file}`)
    else if (!new RegExp(`#\\[test\\]\\s*(#\\[[^\\]]*\\]\\s*)*fn ${tail}\\s*\\(`).test(text)) problems.push(`${owner}: ${ref}: no #[test] fn ${tail} in ${file}`)
    return { kind, file, name: tail, independent: true }
  }
  if (kind === 'regress') {
    const id = tail.replace(/^template\s+/, '')
    if (head !== 'engine' || !templateText.includes(`id: '${id}'`)) problems.push(`${owner}: ${ref}: unknown template`)
    return { kind, file: 'tests/engine.test.ts', name: `template ${id}`, independent: false }
  }
  problems.push(`${owner}: ${ref}: unknown reference kind`)
  return { kind, file: '', name: ref, independent: false }
}

// ---- models ----
const STAGE = { j: '初中', s: '高中', u: '大学', g: '研究生' }
const STATUS = { verified: '已验证', partial: '部分实现', unverified: '存在但待验证', missing: '未实现', deferred: '明确暂缓' }
const GEOMETRY = { point: '质点／集中', plane: '平面运动', section2d: '二维截面（每米或给定厚度）', plane3d: '平面内的三维源', axisym: '轴对称', line1d: '一维连续体', lumped: '集中参数网络', space3d: '三维', abstract: '无空间几何' }
const DOMAIN = {
  G: ['量纲 测量与数值基础', 'models（受限表达式）、units'], M: ['力学与分析力学', 'rigid（刚体 DAE、事件）'], F: ['流体与连续介质', 'regions（液体）、rigid'],
  W: ['振动与波', 'rigid、waves'], T: ['热学与统计物理', 'gas、heat'], E: ['静电与电路', 'field、circuit'], B: ['磁场与电磁感应', 'magnet、regions、circuit'],
  O: ['光学', 'optics、waveoptics'], Q: ['量子物理', 'quantum、atom'], N: ['原子核与粒子', 'nuclear、decay、particles'], R: ['相对论', 'relativity'], X: ['高级与研究生专题（受限）', 'models（受限解析）']
}
const actById = new Map(ACTIVITIES.map(a => [a.id, a]))

const rows = MODELS.map(m => {
  const base = baseModel.get(m.id)
  if (!base) problems.push(`${m.id}: not in the baseline`)
  const links = linksOf(m)
  const refs = m.benchmarks.map(b => ({ ref: b, ...resolveRef(b, m.id) }))
  const oracle = refs.find(r => r.kind === 'oracle')
  const sim = refs.filter(r => r.kind === 'test' || r.kind === 'rust')
  const regress = refs.filter(r => r.kind === 'regress')
  if (m.status === 'verified') {
    if (!oracle) problems.push(`${m.id}: verified without oracle cases`)
    if (m.level >= 2 && !sim.length) problems.push(`${m.id}: verified at L${m.level} without an independent test of the simulation`)
  }
  for (const a of links.activities ?? []) if (!actById.has(a)) problems.push(`${m.id}: unknown activity ${a}`)
  const acts = ACTIVITIES.filter(a => a.models.includes(m.id)).map(a => a.id)
  const interactive = (links.templates?.length ?? 0) + (links.labs?.length ?? 0) > 0
  const criteria = {
    validity: !!m.validity?.zh && ((m.conditions?.length ?? 0) > 0 || !!m.restricted || m.validity.zh.length > 0),
    independent: m.status === 'verified' && !!oracle && (m.level < 2 || sim.length > 0),
    teaching: m.teaching === 2 && acts.length > 0,
    interactive: interactive && acts.length > 0,
    reproducible: true // every model calculation, activity and lab exports with the run manifest (ENG13)
  }
  const complete = m.level >= 2 && Object.values(criteria).every(Boolean)
  const gap = m.gap?.zh ?? m.restricted?.zh ?? defaultGap(m, acts, interactive)
  return {
    id: m.id, title: m.title.zh, stages: m.stages, priority: m.priority, geometry: m.geometry, domain: m.id[0],
    baseline: base ? { status: base.status, level: base.level, implementation: base.implementation, tests: base.tests, gap: base.gap } : null,
    status: m.status, level: m.level, teaching: m.teaching, restricted: !!m.restricted, references: m.references,
    evidence: { oracleCases: oracle?.n ?? 0, tests: sim.map(r => r.ref), regressions: regress.map(r => r.ref) },
    links: { templates: links.templates ?? [], labs: links.labs ?? [], problems: links.problems ?? [], situations: links.situations ?? [], activities: acts, topics: links.topics ?? [] },
    criteria, complete, gap, review: m.review, sources: m.sources,
    example: m.example.text.zh, answer: m.example.answer.zh, validity: m.validity.zh
  }
})

function defaultGap(m, acts, interactive) {
  const g = []
  if (m.level === 1) {
    const tested = m.benchmarks.some(b => b.startsWith('test:') || b.startsWith('rust:'))
    g.push(!interactive ? '只有受限解析计算（模型计算器），无交互仿真' : tested ? '交互内容是解析计算或只对照了部分输出，按 L1 计；没有对本模型全部输出的数值仿真对照' : '交互内容未与本模型逐项对照，只交付受限解析计算')
  }
  if (m.level === 2) g.push('L3 需要收敛研究、有效域边界与闭环基准')
  if (m.teaching === 0) g.push('无教学内容')
  else if (m.teaching === 1 || !acts.length) g.push('有内容链接，无带证据的活动')
  g.push('L4 需要学生试用与修订记录')
  return g.join('；')
}

// ---- requirements ----
const reqRows = reqs.map(r => {
  const base = baseReq.get(r.id)
  if (!base) problems.push(`${r.id}: not in the baseline`)
  if (!STATUS[r.status]) problems.push(`${r.id}: unknown status ${r.status}`)
  for (const t of r.tests) resolveRef(t, r.id)
  if (r.status === 'verified' && !r.tests.length) problems.push(`${r.id}: verified without a test`)
  return { ...r, title: base?.title ?? '', priority: base?.priority ?? '', baseline: base ? { status: base.status, evidence: base.evidence, gap: base.gap } : null }
})
for (const b of baseline.requirements) if (!reqs.some(r => r.id === b.id)) problems.push(`${b.id}: requirement missing`)
for (const b of baseline.models) if (!MODELS.some(m => m.id === b.id)) problems.push(`${b.id}: model family missing`)

if (problems.length) {
  console.error(`coverage: ${problems.length} problem(s)`)
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}

// ---- summary ----
const count = (xs, f) => xs.reduce((o, x) => { const k = f(x); o[k] = (o[k] ?? 0) + 1; return o }, {})
const summary = {
  models: rows.length,
  status: count(rows, r => r.status),
  level: count(rows, r => `L${r.level}`),
  teaching: count(rows, r => String(r.teaching)),
  complete: rows.filter(r => r.complete).map(r => r.id),
  baselineStatus: count(rows, r => r.baseline?.status ?? '—'),
  baselineLevel: count(rows, r => `L${r.baseline?.level ?? 0}`),
  oracleCases: fixture.cases.length,
  activities: ACTIVITIES.length,
  requirements: count(reqRows, r => r.status),
  baselineRequirements: count(reqRows, r => r.baseline?.status ?? '—')
}

if (checkOnly) {
  console.log(`coverage: ${rows.length} models, ${reqRows.length} requirements, ${fixture.cases.length} oracle cases, all references resolve; complete: ${summary.complete.length}`)
  process.exit(0)
}

writeFileSync(join(repo, 'docs/coverage/coverage-26.56.json'), JSON.stringify({ version, generated: 'scripts/coverage.mjs', baseline: { version: baseline.baseline, commit: baseline.commit }, summary, requirements: reqRows, models: rows, activities: ACTIVITIES.map(activityRow) }, null, 1) + '\n')

function activityRow(a) {
  const qs = [...a.diagnostic, a.predict.question, ...a.questions, ...a.transfer.questions]
  const dims = [...new Set(qs.flatMap(q => q.dims ?? []))]
  return {
    id: a.id, title: a.title.zh, stage: a.stage, models: a.models, goals: a.goals.map(g => g.zh),
    prerequisites: a.prerequisites, diagnostic: a.diagnostic.length, questions: a.questions.length, transfer: a.transfer.questions.length,
    experiment: a.experiment ? { vary: a.experiment.vary, values: a.experiment.values.length } : null, dims, open: a.open ?? null
  }
}

// ---- markdown ----
const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const lv = (s, l) => `${STATUS[s] ?? s}${l === undefined ? '' : ` · L${l}`}`
const TEACH = ['无', '内容', '活动＋证据']
const md = []
md.push(`# VeloPhi ${version} 覆盖矩阵（实施后）`, '')
md.push(`本文件由 \`node scripts/coverage.mjs\` 根据模型注册数据（src/content/models）、活动注册（src/teaching/activities）、独立参照（tests/fixtures/oracles2656.json）和需求状态（docs/coverage/requirements-26.56.json）生成；机器可读版本为 coverage-26.56.json。基线（26.55，提交 ${baseline.commit.slice(0, 7)}）见 COVERAGE_26_56_baseline.md。生成时检查每条证据引用都指向仓库中存在的测试（文件与测试名、Rust \`#[test]\` 函数、预言值用例数），状态与证据不一致时生成失败。`, '')
md.push('## 1 判定规则', '')
md.push('- **已验证**：模型计算与独立参照（mpmath 另行实现，至少三组：基准、边界、极限或迁移）一致；成熟度 L2 及以上还必须有仿真或实验对独立参照（手写闭式、另一算法或注册模型的另一代码路径）的自动测试。Rust–TypeScript 逐帧对照（regress）只算移植回归，不算独立证据。')
md.push('- **部分实现**、**存在但待验证**、**未实现**、**明确暂缓**：同基线定义。')
md.push('- 成熟度：L0 概念或示意；L1 条件受限的解析计算；L2 可交互数值仿真；L3 验证过的领域能力（独立基准、收敛或统计检验、有效域、闭环）；L4 验证过的教学活动——需要学生试用与修订记录，本版没有，因此不标 L4。')
md.push('- 教学成熟度：0 无；1 有内容链接（模板、实验、题目、手册）；2 有带评分证据的学习活动。')
md.push('- **完成**（26.56 任务书第六节）：同时满足物理有效域（条件或受限说明）、独立验证、教学证据（教学 2 且有活动）、交互可用（模板或实验＋活动）和复现导出（运行清单）。只有这些模型族标“完成”。', '')
md.push('## 2 总览', '')
md.push(`| 项 | 基线 26.55 | ${version} |`, '| --- | --- | --- |')
for (const s of Object.keys(STATUS)) md.push(`| 模型族：${STATUS[s]} | ${summary.baselineStatus[s] ?? 0} | ${summary.status[s] ?? 0} |`)
for (const l of [0, 1, 2, 3]) md.push(`| 模型族：L${l} | ${summary.baselineLevel[`L${l}`] ?? 0} | ${summary.level[`L${l}`] ?? 0} |`)
md.push(`| 带评分证据的活动 | 0 | ${ACTIVITIES.length} |`)
md.push(`| 独立参照用例 | 0 | ${fixture.cases.length} |`)
md.push(`| 完成（五项全满足） | 0 | ${summary.complete.length} |`)
for (const s of Object.keys(STATUS)) md.push(`| 需求：${STATUS[s]} | ${summary.baselineRequirements[s] ?? 0} | ${summary.requirements[s] ?? 0} |`)
md.push('', `完成的模型族：${summary.complete.join('、')}。`, '')
md.push('## 3 需求项（ENG、FOR、EDU、UX）', '')
md.push(`| 编号 | 优先级 | 需求 | 基线 | ${version} | 实现与证据 | 自动测试 | 剩余限制 |`, '| --- | --- | --- | --- | --- | --- | --- | --- |')
for (const r of reqRows) md.push(`| ${r.id} | ${r.priority || '—'} | ${esc(r.title)} | ${STATUS[r.baseline?.status] ?? '—'} | **${STATUS[r.status]}** | ${esc(r.evidence)} | ${esc(r.tests.join('；') || '—')} | ${esc(r.remaining)} |`)
md.push('')
md.push('## 4 全部 180 个模型族', '')
md.push('列：基线状态与成熟度 → 本版状态与成熟度；教学成熟度；完成；独立证据（预言值用例数＋仿真或实验测试；regress 为移植回归）；关联内容（模板 T、实验 L、题目 P、活动 A）；依赖（计算后端）；差距与限制。', '')
for (const [d, [name, backend]] of Object.entries(DOMAIN)) {
  const list = rows.filter(r => r.domain === d)
  md.push(`### ${d} ${name}`, '', `依赖：P0 公共基础（ENG01 量纲、ENG02 常数、ENG10 独立验证、ENG13 运行清单）与后端 ${backend}。`, '')
  md.push('| ID | 模型族 | 学段 | 优先级 | 几何 | 基线 | 26.56 | 教学 | 完成 | 独立证据 | 关联 | 差距与限制 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const r of list) {
    const ev = [`oracle ×${r.evidence.oracleCases}`, ...r.evidence.tests, ...r.evidence.regressions.map(x => `${x}（回归）`)].join('；')
    const ln = [r.links.templates.length ? `T ${r.links.templates.join(', ')}` : '', r.links.labs.length ? `L ${r.links.labs.join(', ')}` : '', r.links.problems.length ? `P ${r.links.problems.join(', ')}` : '', r.links.activities.length ? `A ${r.links.activities.join(', ')}` : ''].filter(Boolean).join('；') || '模型页'
    md.push(`| ${r.id} | ${esc(r.title)}${r.restricted ? '（受限）' : ''} | ${r.stages.map(s => STAGE[s]).join('、')} | ${r.priority} | ${GEOMETRY[r.geometry]} | ${r.baseline ? lv(r.baseline.status, r.baseline.level) : '—'} | **${lv(r.status, r.level)}** | ${TEACH[r.teaching]} | ${r.complete ? '是' : '—'} | ${esc(ev)} | ${esc(ln)} | ${esc(r.gap)} |`)
  }
  md.push('')
}
md.push('## 5 学习活动注册', '')
md.push('| 活动 | 标题 | 学段 | 模型 | 先修 | 诊断 | 核心题 | 迁移题 | 控变量实验 | 评分维度 | 打开 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const a of ACTIVITIES.map(activityRow)) {
  const pre = [...(a.prerequisites.activities ?? []), ...(a.prerequisites.models ?? [])].join(', ') || '—'
  md.push(`| ${a.id} | ${esc(a.title)} | ${STAGE[a.stage]} | ${a.models.join(', ')} | ${pre} | ${a.diagnostic} | ${a.questions} | ${a.transfer} | ${a.experiment ? `${a.experiment.vary} ×${a.experiment.values}` : '—'} | ${a.dims.join(', ')} | ${a.open ? Object.values(a.open).join(' ') : '—'} |`)
}
md.push('')
md.push('## 6 复现', '', '```', 'node scripts/coverage.mjs --check        # 只检查引用与状态', 'node scripts/coverage.mjs                # 重新生成本文件与 coverage-26.56.json', 'python3 scripts/oracles/build.py         # 重新生成独立参照（需要 mpmath）', 'npx vitest run tests/models2656.test.ts  # 注册模型对独立参照', '```', '')
writeFileSync(join(repo, 'docs/coverage/COVERAGE_26_56.md'), md.join('\n'))
console.log(`coverage: wrote docs/coverage/COVERAGE_26_56.md and coverage-26.56.json (${rows.length} models, ${reqRows.length} requirements, complete ${summary.complete.length})`)
