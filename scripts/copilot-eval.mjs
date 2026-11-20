#!/usr/bin/env node
/**
 * Evaluation of the Copilot scene builder (26.64, D285): every problem of tests/fixtures/copilot/eval-set.json goes
 * through the same build as in the app (src/ai/sketch/pipeline.ts: notes → sketch → compile → ladder → patches →
 * template → honest failure), and the result is reported per ladder level, with the engine's answers of the built
 * scene held against the engine's answers of the built-in problem the statement was taken from.
 *
 *   VELOPHI_APP_TOKEN_FILE=<file with the app token> node scripts/copilot-eval.mjs [options]
 *     --builder sketch|legacy   the builder of 26.64 (default) or the scene-file builder of 26.60 (the BASELINE)
 *     --only TEXT               only problems whose id or category contains TEXT      --limit N   at most N problems
 *     --strict on|off           strict function calls (default off: the proxy passes `strict` on only after the
 *                               change of docs/dev/COPILOT_STRICT_PROXY.md)
 *     --url URL                 the server (default https://velophi.whitelists.top); requests go to /api/velophi/ai/chat
 *     --out FILE                result file (default .cache/copilot-eval/<builder>-<time>.json)
 *     --record DIR              keep every raw answer as a replay sample ("origin": "recorded") for the offline tests
 *     --replay DIR              no network: answer from the replay samples in DIR (their own problems instead of the
 *                               set) — checks this script and the build offline
 *
 * The token is read from the file named by the environment variable and sent as the Authorization header of the
 * requests to --url; it is never printed and never written: result files and samples hold the problems, the model's
 * answers and the findings, no request headers. The server counts each request against the account's daily quota
 * (a full run of the sketch builder is 120–300 requests).
 */
import { build } from 'esbuild'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const BUILDER = opt('--builder', 'sketch')
const ONLY = opt('--only', '')
const LIMIT = Number(opt('--limit', '0'))
const STRICT = opt('--strict', 'off') === 'on'
const URL0 = String(opt('--url', 'https://velophi.whitelists.top')).replace(/\/+$/, '')
const RECORD = opt('--record', '')
const REPLAY = opt('--replay', '')
if (!['sketch', 'legacy'].includes(BUILDER)) { console.error('--builder must be sketch or legacy'); process.exit(2) }

// ---- the token: from a file, kept in this variable only ----
let token = ''
if (!REPLAY) {
  const file = process.env.VELOPHI_APP_TOKEN_FILE
  if (!file || !existsSync(file)) { console.error('Set VELOPHI_APP_TOKEN_FILE to a file that holds the app token (or use --replay DIR for an offline run).'); process.exit(2) }
  token = readFileSync(file, 'utf8').trim()
  if (!/^[a-f0-9]{64}$/.test(token)) { console.error('The token file does not hold an app token (64 hexadecimal characters).'); process.exit(2) }
}

// ---- the app's own code, bundled for Node (as scripts/calc-parity.mjs does) ----
const work = join(repo, '.cache', 'copilot-eval')
mkdirSync(work, { recursive: true })
const bundle = join(work, 'harness.mjs')
await build({
  stdin: {
    contents: [
      "export { buildFromProblem } from './src/ai/sketch/pipeline.ts'",
      "export { readAnswers, gradeAnswers, buildLegacy } from './src/ai/sketch/evaluate.ts'",
      "export { failureLines } from './src/ai/sketch/messages.ts'",
      "export { loadTestCore } from './tests/setup/core.ts'"
    ].join('\n'),
    resolveDir: repo, loader: 'ts'
  },
  bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error', define: { 'import.meta.env': '{}' }
})
const H = await import(pathToFileURL(bundle).href)
process.env.VELOPHI_CORE = process.env.VELOPHI_CORE ?? 'wasm'
await H.loadTestCore(repo)

// ---- the model: the official proxy, or recorded answers ----
let requests = 0
async function askServer(req) {
  const body = { messages: req.messages, temperature: req.temperature, max_tokens: req.max_tokens, thinking: { type: 'disabled' } }
  if (req.tools?.length) {
    body.tools = req.tools.map(t => ({ type: 'function', function: { name: t.function.name, description: t.function.description, parameters: t.function.parameters, ...(STRICT && t.function.strict ? { strict: true } : {}) } }))
    if (req.tool_choice !== undefined) body.tool_choice = req.tool_choice
  }
  if (req.response_format) body.response_format = req.response_format
  for (let attempt = 0; ; attempt++) {
    requests++
    const r = await fetch(`${URL0}/api/velophi/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
    const text = await r.text()
    let data = null
    try { data = JSON.parse(text) } catch { data = null }
    if (r.ok && data?.choices?.[0]?.message) {
      const m = data.choices[0].message
      return { message: { role: 'assistant', content: m.content ?? null, ...(Array.isArray(m.tool_calls) && m.tool_calls.length ? { tool_calls: m.tool_calls } : {}) }, finishReason: data.choices[0].finish_reason ?? null, usage: data.usage, truncated: data.choices[0].finish_reason === 'length' }
    }
    if (data?.code === 'quota') throw new Error('the daily quota of the account is used up')
    if (r.status === 401 || r.status === 403) throw new Error('the server refused the token')
    if ((r.status === 429 || r.status >= 500) && attempt < 2) { await new Promise(s => setTimeout(s, 2000 * (attempt + 1))); continue }
    throw new Error(`the server answered ${r.status}${data?.code ? ` (${data.code})` : ''}`)
  }
}

// ---- the problems ----
let problems
let replaySamples = null
if (REPLAY) {
  replaySamples = readdirSync(resolve(repo, REPLAY)).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(resolve(repo, REPLAY), f), 'utf8')))
  problems = replaySamples.map(s => ({ id: s.id, category: 'replay', problem: s.problem, asks: (s.expect.answers ?? []).map((v, i) => ({ q: String(i + 1), prompt: '', expected: v, unit: '', tolerance: 1e-6 })), sample: s }))
} else problems = JSON.parse(readFileSync(resolve(repo, opt('--set', 'tests/fixtures/copilot/eval-set.json')), 'utf8')).problems
if (ONLY) problems = problems.filter(p => p.id.includes(ONLY) || p.category.includes(ONLY))
if (LIMIT > 0) problems = problems.slice(0, LIMIT)

const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4']
const results = []
const t0 = Date.now()
for (const p of problems) {
  const row = { id: p.id, category: p.category, builder: BUILDER, ok: false, via: null, repairs: 0, requests: 0, first: null, final: null, firstCodes: [], finalCodes: [], answers: null, error: null }
  const exchanges = []
  const left = p.sample ? [...p.sample.answers] : null
  const ask = left
    ? async req => { const a = left.shift(); if (!a) throw new Error('the sample has no further answer'); const tool = req.tools?.[0]?.function.name; return tool ? { message: { role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: tool, arguments: a.raw } }] }, finishReason: 'tool_calls' } : { message: { role: 'assistant', content: a.raw }, finishReason: 'stop' } }
    : askServer
  const before = requests
  try {
    if (BUILDER === 'legacy') {
      const r = await H.buildLegacy(p.problem, ask)
      row.ok = r.ok; row.via = r.ok ? 'scene-file' : null; row.repairs = r.tries - 1; row.refused = r.refused
      row.finalCodes = r.errors.slice(0, 6)
      if (r.ok) row.answers = H.gradeAnswers(H.readAnswers(r.scene, r.questions), p.asks)
    } else {
      const o = await H.buildFromProblem({ problem: p.problem }, { ask, strict: p.sample ? p.sample.strict : STRICT, onExchange: x => exchanges.push({ step: x.step, raw: x.raw }) })
      row.ok = o.ok; row.via = o.via; row.repairs = o.repairs; row.refused = o.refused; row.fallback = o.fallback
      row.first = o.rounds[0]?.levels ?? null; row.firstCodes = o.rounds[0]?.codes ?? []
      row.final = o.ladder?.levels ?? null; row.finalCodes = (o.ladder?.diagnostics ?? []).map(d => d.code)
      if (o.ok && o.ladder?.scene) row.answers = H.gradeAnswers(H.readAnswers(o.ladder.scene, o.ladder.questions), p.asks)
      else if (o.sketchLadder) row.failure = H.failureLines(o.sketchLadder)
      if (RECORD && !p.sample) {
        mkdirSync(resolve(repo, RECORD), { recursive: true })
        const expect = { ok: o.ok, via: o.via, ...(o.refused !== undefined ? { refused: o.refused } : {}), repairs: o.repairs, requests: o.requests, rounds: o.rounds.map(r => r.codes), rejected: o.rejected.length, ...(row.answers ? { answers: row.answers.each.map(e => e.got) } : {}), ...(row.failure ? { failure: row.failure } : {}) }
        writeFileSync(join(resolve(repo, RECORD), `${p.id}.json`), JSON.stringify({ id: p.id, origin: 'recorded', note: `Recorded ${new Date().toISOString().slice(0, 10)} with ${STRICT ? 'strict function calls' : 'JSON mode'}; expect is what this version of the app made of it.`, problem: p.problem, strict: STRICT, answers: exchanges, expect }, null, 1) + '\n')
      }
    }
  } catch (e) { row.error = String(e?.message ?? e).slice(0, 200) }
  row.requests = left ? p.sample.answers.length - left.length : requests - before
  results.push(row)
  const lv = row.final ? LEVELS.map(l => (row.final[l] === true ? '+' : row.final[l] === false ? '-' : '·')).join('') : '     '
  console.log(`${row.error ? 'ERROR ' : row.ok ? 'LOADED' : row.refused !== undefined ? 'REFUSE' : 'FAILED'} ${p.id.padEnd(26)} ${lv} ${row.via ?? '-'}${row.answers ? ` answers ${row.answers.correct}/${row.answers.total}` : ''}${row.error ? ` — ${row.error}` : ''}`)
  if (row.error && /quota|refused the token/.test(row.error)) break
}

// ---- the report, per ladder level ----
const n = results.length
const count = f => results.filter(f).length
const pct = k => (n ? `${k}/${n} (${((100 * k) / n).toFixed(1)} %)` : '0/0')
const summary = {
  builder: BUILDER, strict: STRICT, problems: n, seconds: Math.round((Date.now() - t0) / 1000),
  requests: results.reduce((a, r) => a + r.requests, 0),
  firstAnswer: Object.fromEntries(LEVELS.map(l => [l, count(r => r.first?.[l] === true)])),
  final: Object.fromEntries(LEVELS.map(l => [l, count(r => r.final?.[l] === true)])),
  loaded: count(r => r.ok), viaSketch: count(r => r.via === 'sketch'), viaTemplate: count(r => r.via === 'template'),
  refused: count(r => r.refused !== undefined), failedHonestly: count(r => !r.ok && r.refused === undefined && !r.error), errors: count(r => !!r.error),
  allAnswersCorrect: count(r => r.answers && r.answers.total > 0 && r.answers.correct === r.answers.total),
  answers: { correct: results.reduce((a, r) => a + (r.answers?.correct ?? 0), 0), asked: problems.slice(0, n).reduce((a, p) => a + p.asks.length, 0) },
  byCategory: Object.fromEntries([...new Set(results.map(r => r.category))].map(c => { const rs = results.filter(r => r.category === c); return [c, { problems: rs.length, loaded: rs.filter(r => r.ok).length, allAnswersCorrect: rs.filter(r => r.answers && r.answers.total > 0 && r.answers.correct === r.answers.total).length }] }))
}
console.log(`\n${BUILDER} builder — ${n} problems, ${summary.requests} requests, ${summary.seconds} s`)
if (BUILDER === 'sketch') {
  console.log(`  first answer passes   ${LEVELS.map(l => `${l} ${summary.firstAnswer[l]}`).join('  ')}`)
  console.log(`  after repairs passes  ${LEVELS.map(l => `${l} ${summary.final[l]}`).join('  ')}`)
}
console.log(`  loaded ${pct(summary.loaded)} (sketch ${summary.viaSketch}, template ${summary.viaTemplate}); refused ${summary.refused}; failed honestly ${summary.failedHonestly}; errors ${summary.errors}`)
console.log(`  answers: every question right in ${pct(summary.allAnswersCorrect)}; ${summary.answers.correct}/${summary.answers.asked} single answers`)
const out = resolve(repo, opt('--out', join('.cache', 'copilot-eval', `${BUILDER}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`)))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ format: 'velophi-copilot-eval-result', version: 1, at: new Date().toISOString(), server: REPLAY ? 'replay' : URL0, summary, results }, null, 1) + '\n')
console.log(`  result file: ${out}`)
process.exit(summary.errors ? 1 : 0)
