/** 26.42 S-2: with `timerClock: 'fixed'` a script timer expires in the same fixed physics step at every
 * display frame rate.
 *
 * Runs the real GameplayRuntime, World and Rhai VM (WASM) headless. A script counts its fixed_update calls
 * and records that count each time a repeating 0.1 s timer fires. The same project (120 Hz physics) is
 * driven for two seconds with frames of 1/60, 1/144 and 1/240 s. With the fixed clock the recorded step
 * numbers must be identical; with the frame clock (the behaviour before 26.42, still the default for
 * existing projects) they are reported for comparison.
 *
 * Usage: node scripts/verify-2642-fixed-timers.mjs (needs nova_core/pkg). Results: .cache/verify/fixed-timers-2642.json */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'

const root = process.cwd()
const out = await mkdtemp(join(tmpdir(), 'nova-fixed-timers-'))
const results = []
const check = (name, run) => { try { run(); results.push({ name, ok: true }); console.log('PASS', name) } catch (error) { results.push({ name, ok: false, error: String(error?.message ?? error) }); console.log('FAIL', name, '\n   ', String(error?.message ?? error)) } }
if (!globalThis.crypto) globalThis.crypto = webcrypto
for (const name of ['HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement']) if (!(name in globalThis)) globalThis[name] = class {}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [], maxTouchPoints: 0, platform: 'Win32' } })
const observed = {}
try {
  const entries = {
    'src/editor/gameplayRuntime.ts': 'gameplayRuntime',
    'src/store/physics.ts': 'physicsState',
    'src/assets/AssetDatabase.ts': 'assetState',
    'src/assets/types.ts': 'defaultScriptMetadata',
    'src/world/BoxEntity.ts': 'BoxEntity',
    'src/world/components.ts': 'Script2D',
    'src/runtime/scriptSettings.ts': 'scriptProjectSettings',
    'nova_core/pkg/nova_core.js': 'default as initWasm, WasmRuntimeWorld'
  }
  const entry = join(out, 'entry.ts')
  await writeFile(entry, Object.entries(entries).map(([path, names]) => `export { ${names} } from '${join(root, path).replaceAll('\\', '/')}';`).join('\n'))
  await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { timers: entry }, output: { entryFileNames: '[name].mjs' } } } })
  const api = await import(pathToFileURL(join(out, 'build', 'timers.mjs')).href)
  await api.initWasm({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  globalThis.window = Object.assign(new EventTarget(), { performance: globalThis.performance })
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
  globalThis.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail } }
  api.scriptProjectSettings.debuggerEnabled = false; api.scriptProjectSettings.testing.coverageEnabled = false
  const world = api.physicsState.world
  world.runtime = new api.WasmRuntimeWorld(); world.wasmLoaded = true
  const source = `@export let steps = 0;
@export let fired = "";
fn start() { timer_start("tick", 0.1, true); }
fn fixed_update(dt) { steps += 1; }
fn on_timer(name) { if fired.len() < 600 { fired += steps.to_string() + ","; } }`
  const record = { uuid: 'fixed-timer-probe', name: 'FixedTimerProbe', path: 'Assets/FixedTimerProbe.rhai', assetType: 'script', source, script: api.defaultScriptMetadata() }
  api.assetState.records.splice(0, api.assetState.records.length, record); api.assetState.generation++
  let id = 900
  // The editor's own Runtime for this World (one Core per World); each run is its own session.
  const runtime = api.gameplayRuntime
  const run = (clock, rate) => {
    const settings = api.physicsState.globalSettings
    settings.tickRate = 120; settings.profile.tickRate = 120; settings.timeScale = 1
    if (clock === 'fixed') settings.timerClock = 'fixed'; else delete settings.timerClock
    const entity = new api.BoxEntity(id++, { x: 0, y: 0 }, { x: 1, y: 1 }); entity.name = 'Probe'; entity.isStatic = true
    entity.addComponent(new api.Script2D()).scriptAsset = record.uuid
    world.entities.splice(0, world.entities.length, entity)
    api.physicsState.playMode = 'playing'
    runtime.beginSession()
    const frames = Math.round(rate * 2)
    for (let index = 0; index < frames; index++) runtime.frame(1 / rate)
    const properties = { ...entity.script2D.properties }
    runtime.stopSession(false)
    assert.equal(entity.script2D.lastError ?? null, null, `script error at ${rate} Hz: ${entity.script2D.lastError}`)
    return { steps: properties.steps, fired: String(properties.fired).split(',').filter(Boolean).map(Number) }
  }
  for (const clock of ['fixed', 'frame']) {
    observed[clock] = {}
    for (const rate of [60, 144, 240]) observed[clock][rate] = run(clock, rate)
  }
  check('the probe ran: about 240 fixed steps and about 20 timer expirations in two seconds at 120 Hz', () => {
    for (const rate of [60, 144, 240]) {
      const value = observed.fixed[rate]
      assert.ok(Math.abs(value.steps - 240) <= 2, `${rate} Hz: ${value.steps} steps`)
      assert.ok(value.fired.length >= 18 && value.fired.length <= 21, `${rate} Hz: ${value.fired.length} expirations`)
    }
  })
  check('fixed clock: every expiration happens in the same fixed step at 60, 144 and 240 Hz', () => {
    const length = Math.min(...[60, 144, 240].map(rate => observed.fixed[rate].fired.length))
    const reference = observed.fixed[60].fired.slice(0, length)
    for (const rate of [144, 240]) assert.deepEqual(observed.fixed[rate].fired.slice(0, length), reference, `${rate} Hz differs from 60 Hz`)
    // A 0.1 s repeating timer at 120 Hz fires every 12 fixed steps.
    assert.deepEqual(reference.slice(1, 6).map((value, index) => value - reference[index]), [12, 12, 12, 12, 12])
  })
  check('frame clock (default for existing projects) keeps the frame-time behaviour', () => {
    assert.ok(observed.frame[60].fired.length >= 18, 'frame-clock timers still fire')
    // Reported, not required: with frame time the step of an expiration depends on the display rate.
    results.push({ name: 'frame clock steps differ between display rates (informational)', ok: true, differs: JSON.stringify(observed.frame[60].fired) !== JSON.stringify(observed.frame[144].fired) })
  })
} finally {
  await rm(out, { recursive: true, force: true })
}
await mkdir(join(root, '.cache', 'verify'), { recursive: true })
await writeFile(join(root, '.cache', 'verify', 'fixed-timers-2642.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, observed }, null, 2))
const failed = results.filter(item => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
console.log(JSON.stringify(Object.fromEntries(Object.entries(observed).map(([clock, rates]) => [clock, Object.fromEntries(Object.entries(rates).map(([rate, value]) => [rate, value.fired.slice(0, 8).join(' ')]))]))))
process.exit(failed.length ? 1 : 0)
