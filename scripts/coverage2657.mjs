/**
 * Coverage record of 26.57 (manual VP-01–VP-18, the must-test cases T01–T32, the 26.56 requirements whose status
 * changed, and the first 24 teaching packages), generated — not written by hand — and checked against the repository:
 *
 *   node scripts/coverage2657.mjs [--check]
 *
 * Inputs: docs/coverage/requirements-26.57.json and the package registry (src/content/packages, bundled with
 * esbuild; its progress fields are computed from the content that exists, never claimed). Every evidence reference
 * must resolve:
 *
 *   test:<file> <title part>   tests/<file>.test.ts exists and contains the title part
 *   rust:<path> <fn>           engine/velophi-core/<path> has a #[test] fn <fn>
 *
 * A status “verified” needs at least one test; “hand” means checked by hand in the Windows release build (the hand
 * check report) and may list tests; “partial” and “deferred” say what is missing. Writes docs/coverage/COVERAGE_26_57.md
 * and docs/coverage/coverage-26.57.json; --check only verifies (exit 1 on any unresolved reference or inconsistency).
 */
import { build } from 'esbuild'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const checkOnly = process.argv.includes('--check')

const tmp = join(tmpdir(), `velophi-coverage2657-${process.pid}`)
mkdirSync(tmp, { recursive: true })
const entry = join(tmp, 'entry.ts')
writeFileSync(entry, `export { PACKAGES, packageStatus, PACKAGE_CONTENT_VERSION } from ${JSON.stringify(join(repo, 'src/content/packages/index.ts'))}\n`)
const outfile = join(tmp, 'packages.mjs')
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' })
const { PACKAGES, packageStatus, PACKAGE_CONTENT_VERSION } = await import(pathToFileURL(outfile).href)
rmSync(tmp, { recursive: true, force: true })

const req = JSON.parse(readFileSync(join(repo, 'docs/coverage/requirements-26.57.json'), 'utf8'))
const problems = []
const cache = new Map()
const read = p => { if (!cache.has(p)) cache.set(p, existsSync(p) ? readFileSync(p, 'utf8') : null); return cache.get(p) }
function resolveRef(ref, owner) {
  const m = /^(test|rust):(\S+)\s+(.+)$/.exec(ref)
  if (!m) { problems.push(`${owner}: malformed reference “${ref}”`); return false }
  const [, kind, file, part] = m
  const path = kind === 'test' ? join(repo, 'tests', `${file}.test.ts`) : join(repo, 'engine/velophi-core', file)
  const text = read(path)
  if (text === null) { problems.push(`${owner}: ${kind} file missing for “${ref}”`); return false }
  const ok = kind === 'test' ? text.includes(part) : new RegExp(`#\\[test\\][\\s\\S]{0,80}fn ${part}\\b`).test(text)
  if (!ok) problems.push(`${owner}: “${part}” not found in ${path.slice(repo.length + 1)}`)
  return ok
}
const STATUSES = new Set(['verified', 'hand', 'partial', 'deferred'])
function checkRow(r, owner) {
  if (!STATUSES.has(r.status)) problems.push(`${owner}: unknown status ${r.status}`)
  const resolved = (r.tests ?? []).filter(t => resolveRef(t, owner)).length
  if (r.status === 'verified' && resolved === 0) problems.push(`${owner}: “verified” without a test`)
  if (r.status === 'deferred' && (r.tests ?? []).length) problems.push(`${owner}: “deferred” with tests`)
}
for (const v of req.vp) checkRow(v, v.id)
for (const c of req.cases) checkRow(c, c.id)
for (const u of req.updates) checkRow({ status: u.to === 'unverified' ? 'partial' : u.to, tests: u.tests }, u.id)
const ids = req.cases.map(c => c.id)
for (let i = 1; i <= 32; i++) { const id = `T${String(i).padStart(2, '0')}`; if (!ids.includes(id)) problems.push(`case ${id} missing`) }
for (let i = 1; i <= 18; i++) { const id = `VP-${String(i).padStart(2, '0')}`; if (!req.vp.some(v => v.id === id)) problems.push(`${id} missing`) }

const pk = PACKAGES.map(p => ({ id: p.id, title: p.title, stage: p.stage, task: p.task ?? null, demos: p.demos.map(d => d.role), practice: p.practice.length, ...packageStatus(p) }))
if (pk.length !== 24) problems.push(`expected 24 packages, found ${pk.length}`)
if (pk.some(p => p.trialled)) problems.push('a package claims trials')

if (problems.length) { console.error('coverage2657: problems\n  ' + problems.join('\n  ')); process.exit(1) }
const count = (list, s) => list.filter(x => x.status === s).length
const fields = ['discoverable', 'runnable', 'explainable', 'practisable', 'transferable', 'trialled']
const summary = {
  vp: Object.fromEntries([...STATUSES].map(s => [s, count(req.vp, s)])),
  cases: Object.fromEntries([...STATUSES].map(s => [s, count(req.cases, s)])),
  packages: { total: pk.length, complete: pk.filter(p => p.complete).length, ...Object.fromEntries(fields.map(f => [f, pk.filter(p => p[f]).length])) }
}
if (checkOnly) { console.log(`coverage2657: all references resolve (${req.vp.length} VP, ${req.cases.length} cases, ${req.updates.length} updates, ${pk.length} packages)`); process.exit(0) }

writeFileSync(join(repo, 'docs/coverage/coverage-26.57.json'), JSON.stringify({ version: req.version, generated: 'scripts/coverage2657.mjs', contentVersion: PACKAGE_CONTENT_VERSION, summary, vp: req.vp, cases: req.cases, updates: req.updates, packages: pk }, null, 1) + '\n')
const ST = { verified: '已验证（自动测试）', hand: '人工检查（Windows 发布版）', partial: '部分实现', deferred: '明确暂缓' }
const esc = s => String(s ?? '').replace(/\|/g, '\\|')
const md = ['# VeloPhi 26.57 覆盖记录', '']
md.push('本文件由 `node scripts/coverage2657.mjs` 根据 `docs/coverage/requirements-26.57.json` 与教学包注册数据（src/content/packages）生成；机器可读版本为 coverage-26.57.json。生成时检查每条证据引用都指向仓库中存在的测试（文件与测试名、Rust `#[test]` 函数），“已验证”必须至少有一条测试。26.56 的模型族与需求矩阵见 COVERAGE_26_56.md（本版未改模型注册的状态与成熟度）。', '')
md.push('## 1 总览', '')
md.push('| 项 | 已验证 | 人工检查 | 部分 | 暂缓 |', '| --- | --- | --- | --- | --- |')
md.push(`| 任务书 VP-01–VP-18 | ${summary.vp.verified} | ${summary.vp.hand} | ${summary.vp.partial} | ${summary.vp.deferred} |`)
md.push(`| 必测案例 T01–T32 | ${summary.cases.verified} | ${summary.cases.hand} | ${summary.cases.partial} | ${summary.cases.deferred} |`, '')
md.push(`教学包：${summary.packages.total} 个；可发现 ${summary.packages.discoverable}、可运行 ${summary.packages.runnable}、可解释 ${summary.packages.explainable}、可练习 ${summary.packages.practisable}、可迁移 ${summary.packages.transferable}、已试用 ${summary.packages.trialled}；前五项全满足的 ${summary.packages.complete} 个。内容版本 ${PACKAGE_CONTENT_VERSION}。`, '')
md.push('## 2 任务书条目', '', '| ID | 优先级 | 条目 | 状态 | 证据 | 测试 | 尚缺 |', '| --- | --- | --- | --- | --- | --- | --- |')
for (const v of req.vp) md.push(`| ${v.id} | ${v.priority} | ${esc(v.title)} | ${ST[v.status]} | ${esc(v.evidence)} | ${esc((v.tests ?? []).join('；'))} | ${esc(v.remaining)} |`)
md.push('', '## 3 必测案例（§14.1）', '', '| 编号 | 状态 | 测试 | 说明 |', '| --- | --- | --- | --- |')
for (const c of req.cases) md.push(`| ${c.id} | ${ST[c.status]} | ${esc((c.tests ?? []).join('；'))} | ${esc(c.note)} |`)
md.push('', '## 4 26.56 需求状态的变化', '', '| ID | 26.56 | 26.57 | 证据 | 测试 | 尚缺 |', '| --- | --- | --- | --- | --- | --- |')
const RS = { verified: '已验证', partial: '部分实现', unverified: '存在但待验证', deferred: '明确暂缓' }
for (const u of req.updates) md.push(`| ${u.id} | ${RS[u.from] ?? u.from} | ${RS[u.to] ?? u.to} | ${esc(u.evidence)} | ${esc((u.tests ?? []).join('；'))} | ${esc(u.remaining)} |`)
md.push('', '## 5 教学包（第一批 24 个）', '', '进度字段由内容计算：可发现＝登记了模型族与目标词；可运行＝至少一个演示能打开；可解释＝模型已核验且有例题；可练习＝概念、计算、建模三种练习角色都有；可迁移＝有迁移题；已试用＝有学生试用记录（本版没有）。', '')
md.push('| 包 | 名称 | 学段 | 演示预设 | 练习 | 可发现 | 可运行 | 可解释 | 可练习 | 可迁移 | 已试用 | 任务 | 尚缺 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
const yn = b => (b ? '✓' : '—')
for (const p of pk) md.push(`| ${p.id} | ${esc(p.title)} | ${p.stage} | ${p.demos.join('、')} | ${p.practice} | ${yn(p.discoverable)} | ${yn(p.runnable)} | ${yn(p.explainable)} | ${yn(p.practisable)} | ${yn(p.transferable)} | ${yn(p.trialled)} | ${p.task ?? '—'} | ${esc(p.missing.join('；'))} |`)
md.push('', '## 6 复现', '', '```', 'node scripts/coverage2657.mjs --check   # 只检查引用与状态', 'node scripts/coverage2657.mjs           # 重新生成本文件与 coverage-26.57.json', 'npx vitest run tests/task2657.test.ts tests/taskeval2657.test.ts', '```', '')
writeFileSync(join(repo, 'docs/coverage/COVERAGE_26_57.md'), md.join('\n'))
console.log(`coverage2657: wrote docs/coverage/COVERAGE_26_57.md and coverage-26.57.json (packages complete ${summary.packages.complete}/${summary.packages.total})`)
