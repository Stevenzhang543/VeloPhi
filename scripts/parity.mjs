/**
 * Parity harness of the Rust core (decision D30): the TypeScript engine (bundled with esbuild, run in this Node
 * process) and the native `velophi-cli` must give the same bits.
 *
 *   node scripts/parity.mjs [options]
 *     --random N        random scenes (default 500)          --seed S         generator seed (default 2650)
 *     --random2651 N    random scenes with the physics of 26.51 (drag, gravitation, new connectors; default 300)
 *     --random2652 N    random scenes with the physics of 26.52 (end stops, torque-limited motors, rolling
 *                       resistance, central fields, Gauss–Legendre, concave and compound bodies; default 300)
 *     --impacts N       random scenes of blocks landing flat, in corners and on each other (multi-point frictional
 *                       impacts, D37; default 150)
 *     --branches N      branches (D52) of the templates and of N random scenes, from a random frame with a random
 *                       change (default 60)
 *     --only TEXT       only scenes whose name contains TEXT  --no-build       do not run cargo build
 *     --no-modules      skip the module-level checks         --no-unbounded   skip the unbounded template runs
 *     --until T         simulated time of unbounded runs (default 60 s)
 *     --keep            keep scene files and outputs in engine/target/parity
 *     --bench N         only time the 14 original templates (TS vs native Rust, median of N runs)
 *     --write-fixtures  write the fixture scenes and TS fingerprints used by `cargo test`
 *
 * Module checks: dmath on 10⁶ inputs per function, force-expression parsing and evaluation. Scene checks: the
 * 21 templates (bounded, legacy duration; and unbounded for 60 s), the golden scenes of tests/golden.test.ts
 * and the special scenes of tests/streaming.test.ts, and N random scenes. For every scene: each frame (state,
 * segment index, impact loss) bit for bit, segments, events, warnings (keys), statistics, end state, chunk
 * digests and rolling chain, checkpoints, and the fingerprint. The first mismatch of a scene is reported with
 * frame, component, both values in hex, segment label and the last event. Exit code 1 on any mismatch.
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
const work = join(engine, 'target', 'parity')
const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const flag = name => args.includes(name)
const RANDOM = Number(opt('--random', '500'))
const RANDOM2651 = Number(opt('--random2651', '300'))
const RANDOM2652 = Number(opt('--random2652', '300'))
const IMPACTS = Number(opt('--impacts', '150'))
const BRANCHES = Number(opt('--branches', '60'))
const SEED = Number(opt('--seed', '2650'))
const ONLY = opt('--only', null)
const UNTIL = Number(opt('--until', '60'))

mkdirSync(join(work, 'scenes'), { recursive: true })

// ---- Build ----
const cli = join(engine, 'target', 'release', process.platform === 'win32' ? 'velophi-cli.exe' : 'velophi-cli')
if (!flag('--no-build')) {
  const r = spawnSync('cargo', ['build', '--release', '-p', 'velophi-cli'], { cwd: engine, stdio: 'inherit', env: { ...process.env, CARGO_TARGET_DIR: join(engine, 'target') } })
  if (r.status !== 0) { console.error('cargo build failed'); process.exit(2) }
}
const bundleFile = join(work, 'ts.mjs')
await build({
  stdin: {
    contents: [
      "export { referenceTemplates, buildTemplate } from './src/templates/index.ts'",
      "export { SimulationRun, recordingStates, frameSegment, frameImpactLoss, rebuildChunk } from './tests/reference/core/solver/simulation.ts'",
      "export { validateScene } from './src/core/scene/io.ts'",
      "export { refBranchScene as branchScene } from './tests/reference/core/scene/branch.ts'",
      "export { loadTestCore } from './tests/setup/core.ts'",
      "export { simulate } from './tests/reference/core/solver/simulation.ts'",
      "export { DeltaWriter } from './tests/reference/core/solver/transport.ts'",
      "export { addBody, addConnector, addGround, addIncline, addPulley, anchor, emptyScene, onIncline } from './src/core/scene/build.ts'",
      "export { checkForceExpr, compileForceExpr } from './tests/reference/core/solver/forceExpr.ts'",
      "export * as dm from './src/core/math/dmath.ts'"
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

// ---- Helpers ----
const f64 = new Float64Array(1), u64 = new BigUint64Array(f64.buffer)
const hex = x => { f64[0] = x; return '0x' + u64[0].toString(16).padStart(16, '0') }
const sameBits = (a, b) => { f64[0] = a; const x = u64[0]; f64[0] = b; return x === u64[0] }
const sameNum = (a, b) => sameBits(a, b) || (Number.isNaN(a) && Number.isNaN(b))
/** Scene JSON that keeps −0 (as the string "-0", which the Rust parser reads as −0). */
const sceneText = s => JSON.stringify(s, (k, v) => (Object.is(v, -0) ? '-0' : v))
const sceneParse = t => JSON.parse(t, (k, v) => (v === '-0' ? -0 : v))
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** Read a container written by velophi-cli (engine/ABI.md). */
function readContainer(file) { return parseContainer(readFileSync(file)) }
/** Read a sequence of length-prefixed containers (velophi-cli --deltas). */
function readDeltas(file) {
  const buf = readFileSync(file), out = []
  for (let o = 0; o < buf.length;) { const n = buf.readUInt32LE(o); out.push(parseContainer(buf.subarray(o + 4, o + 4 + n))); o += 4 + n }
  return out
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

/** Message key of a TypeScript warning or error text (the keys of engine/MESSAGES.md). */
function messageKey(text) {
  if (text === null || text === undefined) return null
  const rules = [
    [/^初始重叠 .* mm 已移除/, 'warn.initialOverlapRemoved'],
    [/^初始时 .* 深度重叠/, 'warn.initialDeepOverlap'],
    [/^多个接触点同时碰撞时/, 'warn.multiImpactFriction'],
    [/^t 时刻接触状态无完全一致解/, 'warn.ambiguousMode'],
    [/起改用 Moreau–Jean 时间步进（已选择/, 'warn.reducedAccuracy/reason.moreauSelected'],
    [/起改用 Moreau–Jean 时间步进（t = .* 同一时刻发生/, 'warn.reducedAccuracy/reason.eventsAtInstant'],
    [/起改用 Moreau–Jean 时间步进（碰撞与接触切换过于密集/, 'warn.reducedAccuracy/reason.eventStorm'],
    [/: polygon points are taken relative to its centre of mass$/, 'warn.polygonCentred'],
    [/: μs < μk$/, 'warn.muSBelowMuK'],
    [/变力表达式在 t = .* 时没有有限值/, 'err.forceNotFinite'],
    [/^步长过小/, 'err.stepTooSmall'],
    [/反复切换/, 'err.switchChatter'],
    [/事件抖振/, 'err.eventChatter'],
    [/^步数超过上限/, 'err.stepLimit'],
    [/1 个计算块内积分步数超过/, 'err.chunkStepLimit'],
    [/^计算时间超过/, 'err.budget'],
    [/^已取消$/, 'err.cancelled'],
    [/^求解器内部错误/, 'err.internal']
  ]
  for (const [re, key] of rules) if (re.test(text)) return key
  return `?${text}`
}
const rustKey = m => (m ? (m.key === 'warn.reducedAccuracy' ? `${m.key}/${m.params.reason.key}` : m.key) : null)
/** Canonical form of a message object (both engines): sorted parameter names, numbers by their bits. */
const canonMessage = m => {
  const norm = v => {
    if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : hex(v)
    if (v === 'Infinity' || v === '-Infinity') return hex(Number(v))
    if (Array.isArray(v)) return v.map(norm)
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, norm(v[k])]))
    return v
  }
  return m ? JSON.stringify(norm(m)) : null
}
/** Messages of a run (both engines write `{ key, params }`): compared in full. */
const runMsg = canonMessage

// ---- Module checks ----
let failures = 0
const fail = msg => { failures++; console.log(`  MISMATCH ${msg}`) }

function moduleChecks() {
  console.log('Module checks')
  const rng = mulberry32(SEED ^ 0x5eed)
  const N = 1_000_000
  const pick = a => a[Math.floor(rng() * a.length)]
  const special = [0, -0, 1, -1, 0.5, -0.5, Math.PI, -Math.PI, Math.PI / 2, Math.PI / 4, 1e-300, -1e-300, 5e-324, 1e300, Infinity, -Infinity, NaN, 709.78, 709.79, -745.1, -745.2, 1e-8, 2 ** 52, 1.6e6, 1e7, 3 * Math.PI / 4, 0.7853981633974483, 2.356194490192345]
  const gen = kind => {
    const out = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      const r = rng()
      let x
      if (i < special.length) x = special[i]
      else if (r < 0.4) x = (rng() - 0.5) * 20
      else if (r < 0.6) x = (rng() - 0.5) * 2
      else if (r < 0.75) x = (rng() - 0.5) * 2000
      else if (r < 0.85) x = (rng() < 0.5 ? -1 : 1) * Math.exp((rng() - 0.5) * 80)
      else if (r < 0.95) x = (rng() - 0.5) * 2e7
      else { f64[0] = 0; u64[0] = BigInt(Math.floor(rng() * 2 ** 32)) << 32n | BigInt(Math.floor(rng() * 2 ** 32)); x = f64[0] }
      if (kind === 'unit') x = Math.max(-1.0000001, Math.min(1.0000001, x / 20))
      if (kind === 'pos') x = Math.abs(x)
      out[i] = x
    }
    return out
  }
  const fns = [
    ['sin', 1, null], ['cos', 1, null], ['tan', 1, null], ['atan', 1, null], ['asin', 1, 'unit'], ['acos', 1, 'unit'],
    ['exp', 1, null], ['log', 1, 'pos'], ['atan2', 2, null], ['pow', 2, null], ['hypot', 2, null]
  ]
  for (const [name, arity, kind] of fns) {
    const a = gen(kind), b = arity === 2 ? gen(name === 'pow' ? null : kind) : null
    if (name === 'pow') for (let i = 0; i < N; i++) { if (i % 3 === 0) b[i] = Math.round(b[i]) % 70; else b[i] = b[i] % 5; a[i] = i % 5 === 0 ? -Math.abs(a[i]) % 10 : Math.abs(a[i]) % 100 }
    const input = new Float64Array(arity * N)
    for (let i = 0; i < N; i++) { input[arity * i] = a[i]; if (b) input[arity * i + 1] = b[i] }
    const expected = new Float64Array(N)
    const f = V.dm[name]
    const t0 = performance.now()
    for (let i = 0; i < N; i++) expected[i] = arity === 2 ? f(a[i], b[i]) : f(a[i])
    const tsMs = performance.now() - t0
    const inFile = join(work, `math-${name}.in`), outFile = join(work, `math-${name}.out`)
    writeFileSync(inFile, new Uint8Array(input.buffer))
    const r = spawnSync(cli, ['math', name, inFile, outFile], { encoding: 'utf8' })
    if (r.status !== 0) { fail(`dmath ${name}: velophi-cli failed: ${r.stderr}`); continue }
    const got = new Float64Array(readFileSync(outFile).buffer.slice(0))
    let bad = 0, first = -1
    for (let i = 0; i < N; i++) if (!sameNum(expected[i], got[i])) { bad++; if (first < 0) first = i }
    if (bad) fail(`dmath ${name}: ${bad} of ${N} differ; first input ${hex(a[first])}${b ? `, ${hex(b[first])}` : ''}: TS ${hex(expected[first])} Rust ${hex(got[first])}`)
    else console.log(`  dmath ${name.padEnd(6)} ${N} inputs identical (TS ${tsMs.toFixed(0)} ms, Rust ${JSON.parse(r.stdout).ms.toFixed(0)} ms)`)
  }
  // Force expressions: parse/check results, switch lists, and values (exact and with frozen branches)
  const vars = ['t', 'x', 'y', 'vx', 'vy', 'v', 'theta', 'omega', 'm', 'g']
  const funs1 = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'ln', 'log', 'lg', 'sqrt', 'abs', 'sign', 'step']
  const expr = d => {
    const r = rng()
    if (d > 3 || r < 0.25) {
      const q = rng()
      if (q < 0.4) return pick(vars)
      if (q < 0.5) return pick(['pi', 'e'])
      return pick(['0', '1', '2', '0.5', '.25', '3.0', '1e-3', '2E2', '10', '7.5e+1', String(Math.floor(rng() * 100) / 10)])
    }
    if (r < 0.5) return `${expr(d + 1)} ${pick(['+', '-', '*', '/', '^', '**', '*', '+'])} ${expr(d + 1)}`
    if (r < 0.6) return `-${expr(d + 1)}`
    if (r < 0.7) return `(${expr(d + 1)})`
    if (r < 0.85) return `${pick(funs1)}(${expr(d + 1)})`
    if (r < 0.9) return `${pick(['min', 'max', 'atan2'])}(${expr(d + 1)}, ${expr(d + 1)})`
    if (r < 0.95) return `clamp(${expr(d + 1)}, ${expr(d + 1)}, ${expr(d + 1)})`
    return `if(${expr(d + 1)} ${pick(['<', '<=', '>', '>='])} ${expr(d + 1)}, ${expr(d + 1)}, ${expr(d + 1)})`
  }
  const fixed = ['10*sin(2*pi*t)', '5*step(t - 1)', '-0.5*vx', 'if(t < 2, 3*t, 6)', '-m*g*0.1*sign(vx)', 'if(t < 0.4, 6, -1) + 2*step(t - 0.9)', '', '  ', 'x + vx', 'sin(t)', 't', '2*vx', '5.', '.5*m*g', '1e3*m*g', '1e', '2..3', '(1', '1)', 'foo(1)', 'sin', 'sin(1, 2)', 'ellipK(0.5)', 'q*2', '3 < 4', 'if(1, 2, 3)', 'm*g*clamp(vx, -1, 1)', 'abs(vx)*3', 'min(vx, vy)*2', '2**3**2*m', '-2^2', 'm*v^2', '#', 'x@', 'pi', 'e*m*g', 'theta*m*g', 'sqrt(x*x + y*y)*7']
  const cases = []
  for (let i = 0; i < 4000; i++) cases.push(i < fixed.length ? fixed[i] : expr(0))
  const envs = []
  for (let i = 0; i < 6; i++) envs.push(vars.map((_, j) => (j === 0 ? rng() * 3 : (rng() - 0.5) * 6)))
  envs.push(vars.map(() => 0))
  const tsOut = []
  for (const src of cases) {
    const r = V.checkForceExpr(src)
    const o = { ok: r.ok }
    if (r.ok) {
      const c = V.compileForceExpr(src, 0)
      o.switches = c.switches.map(s => `${s.kind}:${s.jump}:${s.zero}`)
      o.values = []
      const swSets = [null, c.switches.map(() => 1), c.switches.map(() => -1), c.switches.map((_, i) => [1, -1, 0][i % 3])]
      for (const e of envs) {
        const env = Float64Array.from(e)
        for (const sw of swSets) {
          o.values.push(hex(c.fn(env, sw)))
          for (const s of c.switches) o.values.push(hex(s.arg(env, sw)))
        }
      }
    }
    tsOut.push(o)
  }
  const inFile = join(work, 'expr.in.json'), outFile = join(work, 'expr.out.json')
  writeFileSync(inFile, JSON.stringify({ cases, envs }))
  const r = spawnSync(cli, ['expr', inFile, outFile], { encoding: 'utf8' })
  if (r.status !== 0) { fail(`expressions: velophi-cli failed: ${r.stderr}`); return }
  const rsOut = JSON.parse(readFileSync(outFile, 'utf8'))
  let bad = 0, okCount = 0
  for (let i = 0; i < cases.length; i++) {
    const a = tsOut[i], b = rsOut[i]
    const same = a.ok === b.ok && (!a.ok || (JSON.stringify(a.switches) === JSON.stringify(b.switches) && a.values.every((v, j) => v === b.values[j] || (isNaNHex(v) && isNaNHex(b.values[j])))))
    if (a.ok) okCount++
    if (!same) { bad++; if (bad <= 5) fail(`expression ${JSON.stringify(cases[i])}: TS ${JSON.stringify(a).slice(0, 300)} Rust ${JSON.stringify(b).slice(0, 300)}`) }
  }
  if (bad) fail(`expressions: ${bad} of ${cases.length} differ`)
  else console.log(`  expressions ${cases.length} cases identical (${okCount} valid, ${cases.length - okCount} rejected by both)`)
}
function isNaNHex(h) { f64[0] = 0; u64[0] = BigInt(h); return Number.isNaN(f64[0]) }

// ---- Scenes (scripts/lib/scenes.mjs) ----
const { goldenScenes, randomScene, randomImpactScene, randomScene2651, randomScene2652 } = sceneGenerators(V)

// ---- Runs ----
/** Run a scene with the TypeScript engine as the harness runs it with Rust (see velophi-cli run_once). */
function runTs(scene, duration, until, withDeltas = false) {
  const t0 = performance.now()
  let run
  try {
    run = new V.SimulationRun(scene, duration === undefined ? {} : { duration })
  } catch (e) {
    return { createError: e.message, ms: performance.now() - t0 }
  }
  const writer = withDeltas ? new V.DeltaWriter(run, true) : null
  if (!run.bounded && until !== undefined) {
    const F = run.chunkFrames
    const frame = Math.ceil(Math.ceil(until / run.dt - 1e-9) / F) * F
    if (!run.advance(Infinity, frame)) run.stop()
  } else run.advance(Infinity)
  if (writer) return { deltas: writer.next(true) }
  const rec = run.result()
  return { run, rec, ms: performance.now() - t0 }
}

/** First difference between a TypeScript delta and a Rust one (numbers by bits, warnings by key), or null. */
function deepDiff(a, b, path) {
  const skip = new Set(['wallMs', 'digestHex', 'rollingHex'])
  if (path.endsWith('.warnings') && Array.isArray(a)) {
    const ka = a.map(runMsg).join(' '), kb = b.map(runMsg).join(' ')
    return ka === kb ? null : `${path}: TS [${ka}] Rust [${kb}]`
  }
  if (path.endsWith('.warning')) return runMsg(a) === runMsg(b) ? null : `${path}: TS ${JSON.stringify(a)} Rust ${JSON.stringify(b)}`
  if (typeof a === 'number' || typeof b === 'number') return typeof a === 'number' && typeof b === 'number' && sameNum(a, b) ? null : `${path}: TS ${typeof a === 'number' ? hex(a) : a} Rust ${typeof b === 'number' ? hex(b) : JSON.stringify(b)}`
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.length !== b.length) return `${path}: typed arrays of length ${a?.length} / ${b?.length}`
    for (let i = 0; i < a.length; i++) if (!sameNum(Number(a[i]), Number(b[i]))) return `${path}[${i}]: TS ${hex(a[i])} Rust ${hex(b[i])}`
    return null
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return `${path}: arrays of length ${a?.length} / ${b?.length}`
    for (let i = 0; i < a.length; i++) { const d = deepDiff(a[i], b[i], `${path}[${i}]`); if (d) return d }
    return null
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    const keys = new Set([...Object.keys(a).filter(k => a[k] !== undefined), ...Object.keys(b)])
    for (const k of keys) { if (skip.has(k)) continue; const d = deepDiff(a[k], b[k], `${path}.${k}`); if (d) return d }
    return null
  }
  return a === b ? null : `${path}: TS ${JSON.stringify(a)} Rust ${JSON.stringify(b)}`
}

function runRust(file, out, duration, until, verify, deltas) {
  const a = ['run', file, '--out', out]
  if (deltas) a.push('--deltas', deltas)
  if (duration !== undefined) a.push('--duration', duration === null ? 'null' : String(duration))
  if (until !== undefined) a.push('--until', String(until))
  if (verify) a.push('--verify-rebuild')
  const r = spawnSync(cli, a, { encoding: 'utf8', maxBuffer: 1 << 26 })
  if (r.status !== 0) throw new Error(`velophi-cli failed: ${r.stderr}`)
  const doc = readContainer(out)
  doc.info = JSON.parse(r.stdout.trim().split('\n').pop())
  return doc
}
let rebuildsChecked = 0, crossRebuilds = 0, deltasCompared = 0

let scenesCompared = 0, framesCompared = 0, eventsCompared = 0, checkpointsCompared = 0
const timings = []
/** What the random scenes exercised (TypeScript side). */
const coverage = new Map()
const count = key => coverage.set(key, (coverage.get(key) ?? 0) + 1)

function compareScene(name, scene, duration, until, goldenHash) {
  const text = sceneText(scene)
  const file = join(work, 'scenes', `${name.replace(/[^a-zA-Z0-9_-]+/g, '_')}.json`)
  writeFileSync(file, text)
  const ts = runTs(sceneParse(text), duration, until)
  const verify = !name.startsWith('random') || scenesCompared % 10 === 0
  const deltaFile = verify ? file.replace(/\.json$/, '.deltas') : null
  const rs = runRust(file, file.replace(/\.json$/, '.bin'), duration, until, verify, deltaFile)
  scenesCompared++
  const problems = []
  const P = msg => problems.push(msg)
  if (ts.createError || rs.createError) {
    const a = ts.createError ? messageKey(ts.createError) : null, b = rs.createError ? rustKey(rs.createError) : null
    if (!ts.createError || !rs.createError || a !== b) P(`creation: TS ${ts.createError ?? 'ok'} / Rust ${JSON.stringify(rs.createError ?? 'ok')}`)
    report(name, problems)
    return
  }
  const { run, rec } = ts
  rs.ms = rs.ms ?? rs.info.ms
  const size = rec.size
  // Frames
  if (rec.frameCount !== rs.frameCount) P(`frame count: TS ${rec.frameCount} Rust ${rs.frameCount}`)
  const tsStates = V.recordingStates(rec)
  const n = Math.min(rec.frameCount, rs.frameCount)
  const a32 = new Uint32Array(tsStates.buffer), b32 = new Uint32Array(rs.frames.buffer)
  let firstBad = -1
  for (let i = 0; i < 2 * n * size; i++) if (a32[i] !== b32[i]) { firstBad = i >> 1; break }
  if (firstBad >= 0) {
    const k = Math.floor(firstBad / size), comp = firstBad % size
    const seg = rec.segments[V.frameSegment(rec, k)]
    const lastEv = [...rec.events].reverse().find(e => e.t <= k * rec.dt)
    P(`frame ${k} (t = ${(k * rec.dt).toFixed(6)}) component ${comp}: TS ${hex(tsStates[firstBad])} Rust ${hex(rs.frames[firstBad])}; segment "${seg?.label}"; last event ${lastEv ? `t = ${lastEv.t} [${lastEv.changes.map(c => c.type).join(',')}]` : 'none'}`)
  }
  for (let k = 0; k < n && problems.length < 4; k++) {
    if (V.frameSegment(rec, k) !== rs.frameSegment[k]) { P(`frame ${k}: segment index TS ${V.frameSegment(rec, k)} Rust ${rs.frameSegment[k]}`); break }
    if (!sameBits(V.frameImpactLoss(rec, k), rs.impactLoss[k])) { P(`frame ${k}: impact loss TS ${hex(V.frameImpactLoss(rec, k))} Rust ${hex(rs.impactLoss[k])}`); break }
  }
  framesCompared += n
  // Segments
  if (rec.segments.length !== rs.segments.length) P(`segments: TS ${rec.segments.length} Rust ${rs.segments.length}`)
  for (let i = 0; i < Math.min(rec.segments.length, rs.segments.length); i++) {
    const a = rec.segments[i], b = rs.segments[i]
    if (a.index !== b.index || !sameBits(a.t0, b.t0) || !sameBits(a.t1, b.t1) || a.label !== b.label || !!a.reduced !== !!b.reduced || !sameBits(a.impactLoss, b.impactLoss) || !a.X0.every((v, j) => sameBits(v, b.X0[j]))) {
      P(`segment ${i}: TS (${a.t0}, ${a.t1}, "${a.label}") Rust (${b.t0}, ${b.t1}, "${b.label}")`)
      break
    }
  }
  // Events
  if (rec.events.length !== rs.events.length) P(`events: TS ${rec.events.length} Rust ${rs.events.length}`)
  for (let i = 0; i < Math.min(rec.events.length, rs.events.length); i++) {
    const a = rec.events[i], b = rs.events[i]
    const ta = a.changes.map(c => `${c.type}:${c.subject}`).join(','), tb = b.changes.map(c => `${c.type}:${c.subject}`).join(',')
    const same = a.index === b.index && sameBits(a.t, b.t) && a.segment === b.segment && a.triggers.join(',') === b.triggers.join(',') && ta === tb &&
      a.before.every((v, j) => sameBits(v, b.before[j])) && a.after.every((v, j) => sameBits(v, b.after[j])) &&
      a.changes.every((c, j) => ['impulse', 'vnBefore', 'vnAfter', 'restitution', 'tangentImpulse', 'vtBefore', 'vtAfter'].every(f => (c[f] === undefined && b.changes[j][f] === undefined) || sameBits(c[f], b.changes[j][f])))
    eventsCompared++
    if (!same) { P(`event ${i}: TS t = ${a.t} [${a.triggers}] {${ta}} Rust t = ${b.t} [${b.triggers}] {${tb}}`); break }
  }
  // Warnings, statistics, end
  const wa = rec.warnings.map(runMsg).join(' '), wb = rs.warnings.map(runMsg).join(' ')
  if (wa !== wb) P(`warnings: TS [${wa}] Rust [${wb}]`)
  for (const f of ['steps', 'rejected', 'events', 'locateIterations', 'ambiguousModes', 'maxPositionCorrection', 'maxVelocityCorrection']) if (!sameBits(rec.stats[f], rs.stats[f])) P(`stats.${f}: TS ${rec.stats[f]} Rust ${rs.stats[f]}`)
  if (rec.completed !== rs.end.completed || (rec.stopReason ?? 'duration') !== rs.end.stopReason || runMsg(rec.error) !== runMsg(rs.end.error)) P(`end: TS ${rec.completed} ${rec.stopReason} ${JSON.stringify(rec.error)} Rust ${rs.end.completed} ${rs.end.stopReason} ${JSON.stringify(rs.end.error)}`)
  // Fingerprints: final hash, chunk digests and the rolling chain
  if (rec.hash !== rs.end.hash) P(`fingerprint: TS ${rec.hash} Rust ${rs.end.hash}`)
  if (goldenHash && rec.hash !== goldenHash) P(`TS fingerprint ${rec.hash} differs from the 26.49 golden value ${goldenHash}`)
  if (run.closed.length !== rs.chunks.length) P(`closed chunks: TS ${run.closed.length} Rust ${rs.chunks.length}`)
  for (let i = 0; i < Math.min(run.closed.length, rs.chunks.length); i++) {
    const a = run.closed[i], b = rs.chunks[i]
    const dh = Buffer.from(a.digest).toString('hex'), rh = Buffer.from(a.rolling).toString('hex')
    if (dh !== b.digestHex || rh !== b.rollingHex || a.first !== b.first || a.frames !== b.frames || a.eventsFrom !== b.eventsFrom || a.eventsTo !== b.eventsTo || !a.summary.every((v, j) => sameBits(v, b.summary[j]))) {
      P(`chunk ${a.chunk}: TS digest ${dh.slice(0, 16)}… chain ${rh.slice(0, 16)}… Rust ${b.digestHex.slice(0, 16)}… ${b.rollingHex.slice(0, 16)}…`)
      break
    }
  }
  // Checkpoints
  const tsCps = run.checkpoints.map((d, c) => [c, d]).filter(([, d]) => d)
  if (tsCps.length !== rs.checkpoints.length) P(`checkpoints: TS ${tsCps.length} Rust ${rs.checkpoints.length}`)
  for (let i = 0; i < Math.min(tsCps.length, rs.checkpoints.length); i++) {
    const [c, a] = tsCps[i], b = rs.checkpoints[i]
    checkpointsCompared++
    if (c !== b.chunk || a.length !== b.data.length || !a.every((v, j) => sameBits(v, b.data[j]))) {
      const j = a.findIndex((v, j) => !sameBits(v, b.data[j]))
      P(`checkpoint ${c}: lengths TS ${a.length} Rust ${b.data.length}, first difference at ${j}: TS ${hex(a[j])} Rust ${hex(b.data[j])}`)
      break
    }
  }
  // Rebuilds: Rust from its own checkpoints (velophi-cli --verify-rebuild); TypeScript from the Rust checkpoints
  if (rs.info.rebuildChecked !== undefined) {
    rebuildsChecked += rs.info.rebuildChecked
    for (const p of rs.info.rebuildProblems) P(`Rust rebuild: ${p}`)
  }
  if (verify && !problems.length) {
    const F = run.chunkFrames
    for (const c of run.closed.slice(0, 3)) {
      const cp = rs.checkpoints.find(x => x.chunk === c.chunk)
      if (!cp) continue
      const next = rs.checkpoints.find(x => x.chunk === c.chunk + 1)
      const end = next ? c.first + F : c.first + c.frames - 1
      const r = V.rebuildChunk(scene, run.system, cp.data, { duration: run.bounded ? run.T : null, chunkSeconds: 1 }, end)
      crossRebuilds++
      const orig = run.frames.chunks[c.chunk]
      const ok = r.chunk.count >= c.frames && r.chunk.states.subarray(0, c.frames * size).every((v, j) => sameBits(v, orig.states[j])) && (!next || (r.next && r.next.every((v, j) => sameBits(v, next.data[j]))))
      if (!ok) { P(`TypeScript rebuild of chunk ${c.chunk} from the Rust checkpoint differs`); break }
    }
  }
  // Deltas: the worker's posts when the run is computed in one slice (TypeScript DeltaWriter vs Rust)
  if (deltaFile && !problems.length) {
    const t2 = runTs(sceneParse(text), duration, until, true)
    const rd = readDeltas(deltaFile)
    deltasCompared += rd.length
    if (t2.deltas.length !== rd.length) P(`deltas: TS ${t2.deltas.length} Rust ${rd.length}`)
    for (let i = 0; i < Math.min(t2.deltas.length, rd.length); i++) {
      const diff = deepDiff(t2.deltas[i], rd[i], `delta ${i}`)
      if (diff) { P(diff); break }
    }
  }
  timings.push({ name, ts: ts.ms, rust: rs.ms, frames: rec.frameCount })
  if (name.startsWith('random/') || name.startsWith('impacts/')) {
    count(`integrator ${scene.settings.integrator}`)
    count(`end ${rec.stopReason}${rec.error ? ' ' + rustKey(rec.error) : ''}`)
    if (rec.reducedFrom !== undefined && rec.reducedFrom !== null) count('Moreau–Jean fallback or mode')
    for (const w of new Set(rec.warnings.map(rustKey))) count(w)
    const types = new Set(rec.events.flatMap(e => e.changes.map(c => c.type)))
    for (const t of types) count(`change ${t}`)
    if (rec.events.some(e => e.impact?.points.some(p => p.tangentImpulse !== undefined) && e.impact.points.filter(p => p.impulse > 0).length === 1)) count('frictional impact (Stronge)')
    if (rec.events.some(e => e.impact && e.impact.points.filter(p => p.tangentImpulse !== undefined).length >= 2)) count('26.51 multi-point frictional impact')
    if (rec.events.some(e => e.triggers.includes('switch'))) count('variable-force switch event')
  }
  if (name.startsWith('random2651/')) {
    // 26.51 physics exercised
    if (scene.settings.gravitation) count('26.51 gravitation')
    if (scene.bodies.some(b => b.drag)) count('26.51 drag')
    for (const t of new Set(scene.connectors.map(c => (c.type === 'spring' && c.cubic ? 'cubic spring' : c.type === 'motor' ? `motor ${c.mode}` : c.type)))) {
      if (['cubic spring', 'damper', 'weld', 'slider', 'motor speed', 'motor torque', 'gear'].includes(t)) count(`26.51 ${t}`)
    }
    count(`26.51 end ${rec.stopReason}${rec.error ? ' ' + rustKey(rec.error) : ''}`)
  }
  if (name.startsWith('random2652/')) {
    // 26.52 physics exercised
    if (scene.settings.integrator === 'gauss4') count('26.52 gauss4')
    if (scene.connectors.some(c => c.type === 'central')) count('26.52 central field')
    for (const t of new Set(rec.events.flatMap(e => e.changes.map(c => c.type)))) if (['limit', 'unlimit', 'motorSlip', 'motorLock', 'rollStop', 'rollStart'].includes(t)) count(`26.52 change ${t}`)
    if (rec.segments.some(g => g.label.includes('/r'))) count('26.52 rolling resistance in a mode')
    if (scene.bodies.some(b => b.shape.type === 'compound')) count('26.52 compound body')
    if (scene.bodies.some(b => b.shape.type === 'polygon' && b.id !== 'terrain')) count('26.52 concave body')
    if (scene.bodies.some(b => b.id === 'terrain')) count('26.52 concave terrain')
    if (rec.segments.some(g => { const u = g.mode.units.filter(x => x.points.length > 0).map(x => x.pair.key); return new Set(u).size < u.length })) count('26.52 several contact units of one pair')
    count(`26.52 end ${rec.stopReason}${rec.error ? ' ' + rustKey(rec.error) : ''}`)
  }
  report(name, problems, ts.ms, rs.ms, rec)
}

function report(name, problems, tsMs, rsMs, rec) {
  if (problems.length) {
    failures++
    console.log(`  ✗ ${name}`)
    for (const p of problems.slice(0, 6)) console.log(`      ${p}`)
  } else if (!name.startsWith('random/') || process.env.PARITY_VERBOSE) {
    console.log(`  ✓ ${name.padEnd(40)} ${String(rec?.frameCount ?? '').padStart(6)} frames  TS ${tsMs?.toFixed(1).padStart(8)} ms  Rust ${rsMs?.toFixed(1).padStart(8)} ms`)
  }
}

// ---- Fixtures for `cargo test` ----
/**
 * --write-fixtures: the template, golden and special scenes as JSON with their TypeScript fingerprints (bounded:
 * the 26.49 recordingHash; unbounded for 10 s: the rolling fingerprint) into engine/velophi-core/tests/fixtures,
 * so the Rust tests check parity without Node.
 */
function writeFixtures() {
  const dir = join(engine, 'velophi-core', 'tests', 'fixtures')
  mkdirSync(dir, { recursive: true })
  const list = []
  const add = (name, scene) => {
    const file = `${name.replace(/[^a-zA-Z0-9_-]+/g, '_')}.json`
    const text = sceneText(scene)
    writeFileSync(join(dir, file), text + '\n')
    const bounded = runTs(sceneParse(text), scene.settings.duration ?? scene.settings.legacyDuration)
    const unbounded = runTs(sceneParse(text), null, 10)
    list.push({ name, file, bounded: { hash: bounded.rec.hash, frames: bounded.rec.frameCount, events: bounded.rec.events.length }, unbounded10: { hash: unbounded.rec.hash, frames: unbounded.rec.frameCount, stopReason: unbounded.rec.stopReason } })
  }
  for (const t of TEMPLATES) add(`template-${t.id}`, V.buildTemplate(t.id))
  for (const [name, scene] of goldenScenes()) add(name.replace('/', '-'), scene)
  writeFileSync(join(dir, 'expected.json'), JSON.stringify(list, null, 1) + '\n')
  console.log(`wrote ${list.length} fixtures to ${dir}`)
}

// ---- Speed ----
/**
 * --bench N: the 14 original templates at their legacy duration, median of N runs after two warm-up runs, TS in
 * this process and Rust in velophi-cli (native, in-process timing; scene parsing and compilation included on both
 * sides). The WASM build is timed on Windows (Chromium/WebView2) in the next round.
 */
function bench(runs) {
  const original = ['incline', 'board-block', 'conveyor', 'conveyor-incline', 'collision-1d', 'collision-2d', 'projectile', 'pendulum', 'spring', 'hinged-rod', 'rolling', 'ball-rod', 'atwood', 'table-pulley']
  let tsTotal = 0, rsTotal = 0
  console.log(`Speed: 14 original templates, median of ${runs} runs (ms)`)
  console.log('  template              TS        Rust      TS/Rust')
  for (const id of original) {
    const scene = V.buildTemplate(id)
    const text = sceneText(scene)
    const file = join(work, 'scenes', `bench-${id}.json`)
    writeFileSync(file, text)
    const d = scene.settings.legacyDuration
    for (let i = 0; i < 2; i++) runTs(sceneParse(text), d)
    const times = []
    for (let i = 0; i < runs; i++) times.push(runTs(sceneParse(text), d).ms)
    times.sort((a, b) => a - b)
    const ts = times[Math.floor(runs / 2)]
    const r = spawnSync(cli, ['run', file, '--duration', String(d), '--bench', String(runs)], { encoding: 'utf8' })
    const rs = JSON.parse(r.stdout.trim().split('\n').pop()).ms
    tsTotal += ts; rsTotal += rs
    console.log(`  ${id.padEnd(20)} ${ts.toFixed(2).padStart(8)}  ${rs.toFixed(2).padStart(8)}  ${(ts / rs).toFixed(1).padStart(7)}`)
  }
  console.log(`  total                ${tsTotal.toFixed(1).padStart(8)}  ${rsTotal.toFixed(1).padStart(8)}  ${(tsTotal / rsTotal).toFixed(1).padStart(7)}   (Node ${process.version}, native Rust)`)
}

// ---- Main ----
if (flag('--write-fixtures')) { writeFixtures(); process.exit(0) }
if (opt('--bench', null)) { bench(Number(opt('--bench', '7'))); process.exit(0) }
if (!flag('--no-modules') && !ONLY) moduleChecks()
const want = name => !ONLY || name.includes(ONLY)
console.log('Templates (bounded, legacy duration)')
for (const t of TEMPLATES) if (want(`template/${t.id}`)) { const s = V.buildTemplate(t.id); compareScene(`template/${t.id}`, s, s.settings.legacyDuration, undefined, null) }
if (!flag('--no-unbounded')) {
  console.log(`Templates (unbounded, ${UNTIL} s)`)
  for (const t of TEMPLATES) if (want(`unbounded/${t.id}`)) compareScene(`unbounded/${t.id}`, V.buildTemplate(t.id), null, UNTIL, null)
}
console.log('Golden and special scenes')
for (const [name, scene, hash, dur] of goldenScenes()) {
  if (!want(name)) continue
  if (dur === null) compareScene(name, scene, null, UNTIL, null)
  else compareScene(name, scene, scene.settings.duration ?? scene.settings.legacyDuration, undefined, hash)
}
console.log(`Random scenes (${RANDOM}, seed ${SEED})`)
{
  const rng = mulberry32(SEED)
  let shown = 0
  for (let i = 0; i < RANDOM; i++) {
    const scene = randomScene(rng, i)
    try { V.validateScene(scene) } catch (e) { console.log(`  (random/${i} invalid: ${e.message})`); continue }
    if (!want(`random/${i}`)) continue
    const before = failures
    compareScene(`random/${i}`, scene, undefined, undefined, null)
    if (failures === before && ++shown % 100 === 0) console.log(`  … ${shown} random scenes identical`)
  }
}
console.log(`Random scenes of 26.51 (${RANDOM2651}, seed ${SEED})`)
{
  const rng = mulberry32(SEED ^ 0x2651)
  let shown = 0
  for (let i = 0; i < RANDOM2651; i++) {
    const scene = randomScene2651(rng, i)
    try { V.validateScene(scene) } catch (e) { console.log(`  (random2651/${i} invalid: ${e.message})`); continue }
    if (!want(`random2651/${i}`)) continue
    const before = failures
    compareScene(`random2651/${i}`, scene, undefined, undefined, null)
    if (failures === before && ++shown % 100 === 0) console.log(`  … ${shown} random scenes of 26.51 identical`)
  }
}

console.log(`Random scenes of 26.52 (${RANDOM2652}, seed ${SEED})`)
{
  const rng = mulberry32(SEED ^ 0x2652)
  let shown = 0
  for (let i = 0; i < RANDOM2652; i++) {
    const scene = randomScene2652(rng, i)
    try { V.validateScene(scene) } catch (e) { console.log(`  (random2652/${i} invalid: ${e.message})`); continue }
    if (!want(`random2652/${i}`)) continue
    const before = failures
    compareScene(`random2652/${i}`, scene, undefined, undefined, null)
    if (failures === before && ++shown % 100 === 0) console.log(`  … ${shown} random scenes of 26.52 identical`)
  }
}

console.log(`Random multi-point impacts (${IMPACTS}, seed ${SEED})`)
{
  const rng = mulberry32(SEED ^ 0x37)
  let shown = 0
  for (let i = 0; i < IMPACTS; i++) {
    const scene = randomImpactScene(rng, i)
    try { V.validateScene(scene) } catch (e) { console.log(`  (impacts/${i} invalid: ${e.message})`); continue }
    if (!want(`impacts/${i}`)) continue
    const before = failures
    compareScene(`impacts/${i}`, scene, undefined, undefined, null)
    if (failures === before && ++shown % 50 === 0) console.log(`  … ${shown} impact scenes identical`)
  }
}

console.log(`Branches (templates and ${BRANCHES} random scenes, seed ${SEED})`)
{
  const rng = mulberry32(SEED ^ 0x52)
  const sources = [...TEMPLATES.map(t => [`branch/${t.id}`, V.buildTemplate(t.id, {})])]
  const rr = mulberry32(SEED ^ 0x5200)
  for (let i = 0; i < BRANCHES; i++) sources.push([`branch/random${i}`, i % 2 ? randomScene2651(rr, 1000 + i) : randomScene(rr, 1000 + i)])
  const r52 = mulberry32(SEED ^ 0x5252)
  for (let i = 0; i < Math.ceil(BRANCHES / 3); i++) sources.push([`branch/random2652-${i}`, randomScene2652(r52, 2000 + i)])
  let shown = 0
  for (const [name, parent] of sources) {
    if (!want(name)) continue
    try { V.validateScene(parent) } catch { continue }
    const rec = V.simulate(parent, { duration: Math.min(parent.settings.duration ?? parent.settings.legacyDuration, 3) })
    if (rec.error || rec.frameCount < 4) continue
    const k = 1 + Math.floor(rng() * (rec.frameCount - 2))
    const b = V.branchScene(rec, k)
    if (!b) continue
    // A change at the branch point: friction, a velocity, a mass or nothing
    const change = Math.floor(rng() * 4)
    const moving = b.bodies.filter(x => x.kind !== 'static')
    if (change === 0) for (const x of b.bodies) x.material = { ...x.material, muS: x.material.muS * 0.5, muK: x.material.muK * 0.5 }
    if (change === 1 && moving.length) moving[0].velocity = { x: moving[0].velocity.x + 0.5, y: moving[0].velocity.y }
    if (change === 2 && moving.length) moving[0].mass *= 1.5
    b.settings.duration = Math.min(b.settings.duration ?? b.settings.legacyDuration, 2)
    try { V.validateScene(b) } catch (e) { console.log(`  (${name} invalid: ${e.message})`); continue }
    const before = failures
    compareScene(name, b, undefined, undefined, null)
    count(`26.51 branch ${['μ', 'velocity', 'mass', 'unchanged'][change]}`)
    if (failures === before && ++shown % 25 === 0) console.log(`  … ${shown} branches identical`)
  }
}

// ---- Summary ----
const original = ['incline', 'board-block', 'conveyor', 'conveyor-incline', 'collision-1d', 'collision-2d', 'projectile', 'pendulum', 'spring', 'hinged-rod', 'rolling', 'ball-rod', 'atwood', 'table-pulley']
const sum = (list, f) => list.reduce((s, x) => s + x[f], 0)
const orig = timings.filter(t => original.some(id => t.name === `template/${id}`))
console.log('\nSummary')
console.log(`  scenes compared ${scenesCompared}, frames compared ${framesCompared}, events ${eventsCompared}, checkpoints ${checkpointsCompared}`)
console.log(`  chunk rebuilds verified: Rust from its own checkpoints ${rebuildsChecked}, TypeScript from Rust checkpoints ${crossRebuilds}; worker deltas compared ${deltasCompared}`)
if (orig.length) console.log(`  14 original templates (bounded, single run incl. compile): TS ${sum(orig, 'ts').toFixed(0)} ms, Rust ${sum(orig, 'rust').toFixed(0)} ms (×${(sum(orig, 'ts') / sum(orig, 'rust')).toFixed(1)})`)
console.log(`  all scenes: TS ${sum(timings, 'ts').toFixed(0)} ms, Rust ${sum(timings, 'rust').toFixed(0)} ms`)
if (coverage.size) console.log(`  random scenes exercised: ${[...coverage.entries()].sort().map(([k, v]) => `${k} ×${v}`).join('; ')}`)
console.log(failures ? `  ${failures} MISMATCH(ES)` : '  0 mismatches: bit-identical')
if (!flag('--keep')) rmSync(join(work, 'scenes'), { recursive: true, force: true })
process.exit(failures ? 1 : 0)
