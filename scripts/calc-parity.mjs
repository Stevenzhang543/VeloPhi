/**
 * Parity harness of the calculation layer (26.53, D69): the TypeScript reference (tests/reference, the numeric
 * modules of 26.52, bundled with esbuild and run in this Node process) and the Rust session dispatcher
 * (`velophi-cli calc`, the same code the interface runs as WebAssembly and natively) must answer every request with
 * the same bits. Texts are compared after rendering (Rust returns message keys, the reference returns the texts).
 *
 *   node scripts/calc-parity.mjs [options]
 *     --random N        random scenes of 26.50 (default 60)     --random2651 N   (default 40)    --random2652 N (default 40)
 *     --impacts N       random multi-point impact scenes (default 20)
 *     --seed S          generator seed (default 2653)           --only TEXT      only scenes whose name contains TEXT
 *     --no-build        do not run cargo build                  --no-unbounded   skip the unbounded template runs
 *     --budget BYTES    memory budget of the small-budget runs (default 2 MB: chunks are evicted and rebuilt)
 *     --keep            keep scene, request and result files in engine/target/calc-parity
 *
 * Every scene is checked twice: with the default memory budget and with a small one (evictions, rebuilds from
 * checkpoints). Exit code 1 on any mismatch.
 */
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { sceneGenerators } from './lib/scenes.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const engine = join(repo, 'engine')
const work = join(engine, 'target', 'calc-parity')
const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const flag = name => args.includes(name)
const RANDOM = Number(opt('--random', '60'))
const RANDOM2651 = Number(opt('--random2651', '40'))
const RANDOM2652 = Number(opt('--random2652', '40'))
const IMPACTS = Number(opt('--impacts', '20'))
const SEED = Number(opt('--seed', '2653'))
const ONLY = opt('--only', null)
const SMALL = Number(opt('--budget', String(2 * 1024 * 1024)))

rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })

const cli = join(engine, 'target', 'release', process.platform === 'win32' ? 'velophi-cli.exe' : 'velophi-cli')
if (!flag('--no-build')) {
  const r = spawnSync('cargo', ['build', '--release', '-p', 'velophi-cli'], { cwd: engine, stdio: 'inherit' })
  if (r.status !== 0) { console.error('cargo build failed'); process.exit(2) }
}
const bundleFile = join(work, 'ref.mjs')
await build({
  stdin: {
    contents: [
      "export { referenceTemplates, buildTemplate } from './src/templates/index.ts'",
      "export { validateScene } from './src/core/scene/io.ts'",
      "export { simulate } from './tests/reference/core/solver/simulation.ts'",
      "export { addBody, addConnector, addGround, addIncline, addPulley, anchor, emptyScene, onIncline } from './src/core/scene/build.ts'",
      "export { refSession, refCall, libraryJson } from './tests/reference/calcOps.ts'",
      "export { tl } from './src/i18n/index.ts'",
      "export { renderMessage } from './src/i18n/coreText.ts'",
      "export { loadTestCore } from './tests/setup/core.ts'"
    ].join('\n'),
    resolveDir: repo, loader: 'ts'
  },
  bundle: true, format: 'esm', platform: 'node', target: 'node20', outfile: bundleFile, logLevel: 'error'
})
const V = await import(pathToFileURL(bundleFile).href + `?t=${Date.now()}`)
// 26.54 (D77): templates with charges or fields run only in the Rust core; the TS reference has no field forces
const TEMPLATES = V.referenceTemplates()
// The scene check of the interface (polygon and force-expression checks) runs in the Rust core (26.53)
await V.loadTestCore(repo)
const G = sceneGenerators(V)

// ---- Helpers ----
const f64 = new Float64Array(1), u64 = new BigUint64Array(f64.buffer)
const hex = x => { f64[0] = x; return '0x' + u64[0].toString(16).padStart(16, '0') }
const sameBits = (a, b) => { f64[0] = a; const x = u64[0]; f64[0] = b; return x === u64[0] }
const sameNum = (a, b) => sameBits(a, b) || (Number.isNaN(a) && Number.isNaN(b))
const sceneText = s => JSON.stringify(s, (k, v) => (Object.is(v, -0) ? '-0' : v))
const sceneParse = t => JSON.parse(t, (k, v) => (v === '-0' ? -0 : v))
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
function parseContainer(buf) {
  if (buf.toString('latin1', 0, 4) !== 'VRD1') throw new Error('not a container')
  const n = buf.readUInt32LE(4)
  const doc = JSON.parse(buf.toString('utf8', 8, 8 + n))
  const blobStart = Math.ceil((8 + n) / 8) * 8
  const blob = buf.buffer.slice(buf.byteOffset + blobStart, buf.byteOffset + buf.length)
  const revive = v => {
    if (Array.isArray(v)) return v.map(revive)
    if (v && typeof v === 'object') {
      if (v.$f64) return new Float64Array(blob.slice(v.$f64[0], v.$f64[0] + 8 * v.$f64[1]))
      if (v.$i32) return new Int32Array(blob.slice(v.$i32[0], v.$i32[0] + 4 * v.$i32[1]))
      if (v.$u8) return new Uint8Array(blob.slice(v.$u8[0], v.$u8[0] + v.$u8[1]))
      if ('$num' in v) return Number(v.$num)
      const o = {}
      for (const [k, x] of Object.entries(v)) o[k] = revive(x)
      return o
    }
    return v
  }
  return revive(doc)
}
function readResults(file) {
  const buf = readFileSync(file), out = []
  for (let o = 0; o < buf.length;) { const n = buf.readUInt32LE(o); out.push(parseContainer(buf.subarray(o + 4, o + 4 + n))); o += 4 + n }
  return out
}
/** A Rust text ({ key, params } or a literal) as the interface renders it in Chinese. */
function renderText(v) {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && typeof v.key === 'string') return V.renderMessage({ key: v.key, params: v.params ?? {} }, 'zh')
  return v
}
/** Fields whose Rust value is a text (message or literal). */
const TEXT_FIELDS = new Set(['label', 'owner', 'error', 'title', 'detail', 'reason', 'measureLabel', 'measureNote', 'note'])

function deepDiff(a, b, path) {
  const key = path.slice(path.lastIndexOf('.') + 1)
  if (TEXT_FIELDS.has(key) && typeof a === 'string' && b !== null && typeof b === 'object' && !ArrayBuffer.isView(b)) b = renderText(b)
  if (key === 'error' && typeof a === 'string' && b === null) return `${path}: TS ${a} Rust null`
  // Message parameters carry non-finite numbers as strings (engine/ABI.md)
  if (typeof a === 'number' && (b === 'Infinity' || b === '-Infinity' || b === 'NaN')) b = Number(b)
  if (typeof a === 'number' || typeof b === 'number') return typeof a === 'number' && typeof b === 'number' && sameNum(a, b) ? null : `${path}: TS ${typeof a === 'number' ? hex(a) + ' (' + a + ')' : JSON.stringify(a)} Rust ${typeof b === 'number' ? hex(b) + ' (' + b + ')' : JSON.stringify(b)}`
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.length !== b.length) return `${path}: typed arrays of length ${a?.length} / ${b?.length}`
    for (let i = 0; i < a.length; i++) if (!sameNum(Number(a[i]), Number(b[i]))) return `${path}[${i}]: TS ${hex(a[i])} (${a[i]}) Rust ${hex(b[i])} (${b[i]})`
    return null
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return `${path}: arrays of length ${a?.length} / ${b?.length}`
    for (let i = 0; i < a.length; i++) { const d = deepDiff(a[i], b[i], `${path}[${i}]`); if (d) return d }
    return null
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    for (const k of Object.keys(a)) { if (a[k] === undefined) continue; const d = deepDiff(a[k], b[k], `${path}.${k}`); if (d) return d }
    return null
  }
  if ((a === null || a === undefined) && (b === null || b === undefined)) return null
  return a === b ? null : `${path}: TS ${JSON.stringify(a)} Rust ${JSON.stringify(b)}`
}

// ---- Requests ----
/** The requests checked for a scene, from the reference session (both engines have the same recording). */
function requestsFor(sess, rng) {
  const rec = sess.rec
  const n = rec.frameCount
  const ops = [{ op: 'info' }, { op: 'segments' }, { op: 'events' }, { op: 'quantities' }]
  if (n === 0) return ops
  const stride = Math.max(1, Math.floor(n / 150))
  ops.push({ op: 'frames', from: 0, stride })
  ops.push({ op: 'frames', from: Math.floor(n / 2), to: Math.min(n - 1, Math.floor(n / 2) + 7) })
  for (let i = 0; i < Math.min(rec.events.length, 12); i++) ops.push({ op: 'event', index: i })
  for (let i = 0; i < Math.min(rec.events.length, 40); i++) ops.push({ op: 'eventData', index: i })
  ops.push({ op: 'eventData', index: rec.events.length + 2 })
  const T = (n - 1) * rec.dt
  const times = []
  for (let i = 0; i < 12; i++) times.push(rng() * T)
  for (const e of rec.events.slice(0, 6)) { times.push(e.t); times.push(Math.min(T, e.t + 1e-7)) }
  for (const s of rec.segments.slice(0, 6)) times.push(Math.min(T, s.t0 + 0.37 * rec.dt))
  ops.push({ op: 'exactStates', times })
  const frames = []
  for (let i = 0; i < 8; i++) frames.push(Math.floor(rng() * n))
  frames.push(0, n - 1)
  ops.push({ op: 'ledger', frames })
  const ids = V.refCall(sess, { op: 'quantities' }).quantities.map(q => q.id)
  // Unknown ids and ids written in the other pair order must give the same answers too
  ids.push('nobody.x', 'system.nothing', 'ledger.kinetic')
  for (const id of ids.slice()) if (id.startsWith('pair.')) { const m = /^pair\.([^|]+)\|([^.]+)\.(\w+)$/.exec(id); if (m) ids.push(`pair.${m[2]}|${m[1]}.${m[3]}`) }
  for (const k of frames.slice(0, 5)) ops.push({ op: 'evaluate', ids, frame: k })
  for (const t of times.slice(0, 8)) ops.push({ op: 'evaluate', ids, t })
  ops.push({ op: 'series', ids, from: 0, stride: Math.max(1, Math.floor(n / 60)) })
  const pairs = new Set()
  for (const id of ids) { const m = /^contact\.([^|]+)\|([^.]+)\./.exec(id); if (m) pairs.add(`${m[1]}|${m[2]}`) }
  for (const p of [...pairs].slice(0, 6)) { const [on, by] = p.split('|'); ops.push({ op: 'contactForces', frame: frames[0], on, by }); ops.push({ op: 'contactForces', frame: n - 1, on, by }) }
  // Formula layer: situations, samples, cards
  const sits = V.refCall(sess, { op: 'situations' }).situations
  ops.push({ op: 'situations' })
  for (const st of sits.slice(0, 40)) for (const t of [st.t0, 0.5 * (st.t0 + st.t1), st.t1, st.t0 + rng() * (st.t1 - st.t0)]) ops.push({ op: 'sample', key: st.key, t })
  const ct = new Set([0, T, ...times.slice(0, 6)])
  for (const st of sits.slice(0, 20)) { ct.add(st.tEvent ?? st.t0); ct.add(0.5 * (st.t0 + st.t1)) }
  for (const t of ct) ops.push({ op: 'cards', t })
  // Views and teaching (26.53, D69): frame views (drawing state and exact), free-body diagrams, tapes, areas, scales
  const dynIds = rec.system.model.dynamic.map(b => b.id)
  const vt = [0, T, ...times.slice(0, 10), ...rec.events.slice(0, 4).map(e => Math.max(0, e.t - 0.3 * rec.dt))]
  for (const t of vt) ops.push({ op: 'frameView', t, exact: false, forces: 'all' })
  for (const t of vt.slice(0, 6)) ops.push({ op: 'frameView', t, exact: true, forces: dynIds.slice(0, 1) })
  for (const id of dynIds.slice(0, 3)) {
    for (const t of [0, T, ...times.slice(0, 4)]) ops.push({ op: 'fbd', t, body: id })
    for (const direction of ['path', 'x', 'y']) ops.push({ op: 'tape', body: id, direction, period: 0.02, every: 5, start: rng() * T * 0.5, intervals: 6 })
    for (const key of ['vx', 'vy', 'ax', 'omega', 'ek']) ops.push({ op: 'area', id: `${id}.${key}`, t0: rng() * T, t1: rng() * T })
  }
  ops.push({ op: 'fbd', t: 0, body: 'nobody' })
  ops.push({ op: 'vectorScales', recording: true })
  ops.push({ op: 'vectorScales', recording: false })
  return ops
}

/** Requests run while the recording grows (incremental recognition): after some of the deltas. */
function partialRequests(perDelta, rng) {
  const ops = []
  const nd = perDelta.length
  const ks = [...new Set([0, Math.floor(nd / 3), Math.floor((2 * nd) / 3), nd - 2].filter(k => k >= 0 && k < nd - 1))]
  for (const k of ks) {
    const T = (perDelta[k].frames - 1) * perDelta[k].dt
    if (!(T >= 0)) continue
    ops.push({ op: 'situations', afterDelta: k })
    for (const t of [rng() * T, T]) ops.push({ op: 'cards', t, afterDelta: k })
  }
  return ops
}

// ---- Scenes ----
const want = name => !ONLY || name.includes(ONLY)
const jobs = []
function add(name, scene, duration, until) {
  if (!want(name)) return
  const text = sceneText(scene)
  for (const budget of [undefined, SMALL]) jobs.push({ name: budget ? `${name} (small budget)` : name, text, duration, until, budget })
}
for (const t of TEMPLATES) { const s = V.buildTemplate(t.id); add(`template/${t.id}`, s, s.settings.legacyDuration) }
if (!flag('--no-unbounded')) for (const t of TEMPLATES) add(`unbounded/${t.id}`, V.buildTemplate(t.id), null, 12)
// Custom quantities (valid ones and every kind of error) and the pivot quantities
{
  const s = V.buildTemplate('board-block')
  s.customQuantities = [
    { id: 'q1', name: 'E 木板', expr: 'ek(board) + ep(board)' }, { id: 'q2', name: 'gap', expr: 'x(物块) - x(木板)' },
    { id: 'q3', name: 'f', expr: 'f(block, board) + N(block, board)/10' }, { id: 'q4', name: 'heat', expr: 'heat(board, block) + slide(block, board)' },
    { id: 'q5', name: 'mix', expr: 'sqrt(vx(block)^2 + vy(block)^2) * t + if(t < 0.5, 1, 2)' }, { id: 'q6', name: 'glob', expr: 'E + Ek - Ep + Px*g + Py' },
    { id: 'q7', name: 'trig', expr: 'sin(2*t) + atan2(y(block), x(block)) + clamp(vx(block), 0, 1) + min(vx(block), vy(block))' },
    { id: 'q8', name: 'bad1', expr: 'foo(block)' }, { id: 'q9', name: 'bad2', expr: 'x(nobody)' }, { id: 'q10', name: 'bad3', expr: 'x(block) + vx(block)' },
    { id: 'q11', name: 'bad4', expr: 'sin(x(block))' }, { id: 'q12', name: 'bad5', expr: 'N(block)' }, { id: 'q13', name: 'bad6', expr: '__q0 + 1' },
    { id: 'q14', name: 'bad7', expr: '' }, { id: 'q15', name: 'bad8', expr: 'x(block) +' }, { id: 'q16', name: 'bad9', expr: 'zz + 1' },
    { id: 'q17', name: 'pow', expr: 'x(block)^2 / y(block)^0.5 + vx(block)^(1+1)' }, { id: 'q18', name: 'bad10', expr: 'x(block)^t' },
    { id: 'q19', name: 'theta', expr: 'theta(block) + beta(block) + lg(2) + ln(3) + exp(1) + abs(-2) + sign(-1) + step(0)' }
  ]
  add('special/custom', s, s.settings.legacyDuration)
  const p = V.buildTemplate('pendulum')
  p.customQuantities = [{ id: 'q1', name: 'L', expr: 'T(rope) * len(rope) + E' }, { id: 'q2', name: 'phi', expr: 'x(摆球) - 2*y(bob)' }]
  add('special/pendulum-pivot', p, p.settings.legacyDuration)
}
for (const [name, scene, , dur] of G.goldenScenes()) add(name, scene, dur === null ? null : scene.settings.duration ?? scene.settings.legacyDuration, dur === null ? 12 : undefined)
let invalid = 0
const gen = [['random', G.randomScene, RANDOM, 0], ['random2651', G.randomScene2651, RANDOM2651, 0x2651], ['random2652', G.randomScene2652, RANDOM2652, 0x2652], ['impacts', G.randomImpactScene, IMPACTS, 0x37]]
for (const [kind, f, count, salt] of gen) {
  const rng = mulberry32(SEED ^ salt)
  for (let i = 0; i < count; i++) {
    const scene = f(rng, i)
    try { V.validateScene(scene) } catch { invalid++; continue }
    add(`${kind}/${i}`, scene, undefined)
  }
}

// ---- Reference, then Rust in one batch ----
const t0 = performance.now()
const lines = []
jobs.forEach((j, i) => {
  const scene = sceneParse(j.text)
  const ro = { duration: j.duration, until: j.until, budget: j.budget }
  const perDelta = []
  const plan = V.refSession(scene, ro, (k, ss) => perDelta.push({ frames: ss.rec.frameCount, dt: ss.rec.dt }))
  j.file = join(work, `s${i}.json`); j.ops = join(work, `o${i}.json`); j.out = join(work, `r${i}.bin`)
  writeFileSync(j.file, j.text)
  if ('createError' in plan) { j.createError = plan.createError; writeFileSync(j.ops, '[]') }
  else {
    const rng = mulberry32(SEED + i)
    const partial = partialRequests(perDelta, rng)
    const expectPartial = new Map()
    const call = (ss, r) => { try { return V.refCall(ss, r) } catch (e) { return { $error: e.message } } }
    // Second pass: the partial requests on the growing recording
    const sess = partial.length ? V.refSession(sceneParse(j.text), ro, (k, ss) => partial.forEach((r, ri) => { if (r.afterDelta === k) expectPartial.set(ri, call(ss, r)) })) : plan
    j.requests = [{ op: 'setLibrary', formulas: V.libraryJson() }, ...partial, ...requestsFor(sess, rng)]
    j.expected = j.requests.map((r, ri) => (ri >= 1 && ri <= partial.length ? expectPartial.get(ri - 1) : call(sess, r)))
    writeFileSync(j.ops, JSON.stringify(j.requests))
  }
  const flags = []
  if (j.duration !== undefined) flags.push('--duration', j.duration === null ? 'null' : String(j.duration))
  if (j.until !== undefined) flags.push('--until', String(j.until))
  if (j.budget !== undefined) flags.push('--budget', String(j.budget))
  lines.push([j.file, j.ops, j.out, ...flags].join(' '))
})
const tsMs = performance.now() - t0
writeFileSync(join(work, 'batch.txt'), lines.join('\n'))
const t1 = performance.now()
const r = spawnSync(cli, ['calcbatch', join(work, 'batch.txt')], { encoding: 'utf8', maxBuffer: 1 << 28 })
if (r.status !== 0) { console.error(`velophi-cli failed: ${r.stderr}`); process.exit(2) }
const rsMs = performance.now() - t1

// ---- Compare ----
let failures = 0, compared = 0, situationsSeen = 0, cardsSeen = 0, samplesSeen = 0
for (const j of jobs) {
  const got = readResults(j.out)
  if (j.createError) {
    if (!got[0]?.createError) { failures++; console.log(`  ${j.name}: TS cannot create the run (${j.createError}), Rust can`) }
    continue
  }
  if (got[0]?.createError) { failures++; console.log(`  ${j.name}: Rust cannot create the run: ${JSON.stringify(got[0].createError)}`); continue }
  let bad = null
  for (let i = 0; i < j.requests.length && !bad; i++) {
    compared++
    const exp = j.expected[i], g = got[i]
    if (j.requests[i].op === 'situations' && exp?.situations) situationsSeen += exp.situations.length
    if (j.requests[i].op === 'sample') samplesSeen++
    if (j.requests[i].op === 'cards' && exp?.groups) for (const gr of exp.groups) cardsSeen += gr.cards.length
    if (exp && exp.$error !== undefined) { if (!g.$error) bad = `${j.requests[i].op}: TS error ${exp.$error}, Rust none`; continue }
    if (g && g.$error) { bad = `${j.requests[i].op}: Rust error ${JSON.stringify(g.$error)}`; continue }
    const d = deepDiff(exp, g, j.requests[i].op)
    if (d) bad = `${JSON.stringify(j.requests[i]).slice(0, 120)} → ${d}`
  }
  if (bad) { failures++; console.log(`  ${j.name}: ${bad}`) }
}
console.log(`calc parity: ${jobs.length} runs (${invalid} random scenes refused by the scene check, as in parity.mjs), ${compared} requests compared (${situationsSeen} situations, ${samplesSeen} samples, ${cardsSeen} formula cards); TS ${tsMs.toFixed(0)} ms, Rust ${rsMs.toFixed(0)} ms`)
console.log(failures ? `  ${failures} MISMATCH(ES)` : '  0 mismatches: bit-identical')
if (!flag('--keep')) rmSync(work, { recursive: true, force: true })
process.exit(failures ? 1 : 0)
