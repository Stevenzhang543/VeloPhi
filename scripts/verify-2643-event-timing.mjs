/** 26.43: collision callbacks after each physics step (globalSettings.eventDispatch = 'step').
 *
 * A box falls onto the ground at 120 Hz. The script counts fixed_update calls and records the count
 * when on_collision_enter first runs. The fixed steps are identical whether a frame holds one step or
 * four, so with per-step dispatch the callback must see the same count in both cases (it runs right
 * after the step that made contact). With frame dispatch (the default before 26.43) a four-step frame
 * delays the callback to the end of the frame: its count is a multiple of four and never earlier.
 * A command issued by the callback (a bounce) applies on the next step only in per-step mode.
 *
 * Usage: node scripts/verify-2643-event-timing.mjs (needs nova_core/pkg). Results: .cache/verify/event-timing-2643.json */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'

const root = process.cwd()
const out = await mkdtemp(join(tmpdir(), 'nova-event-timing-'))
const results = [], runs = {}
const check = (name, run) => { try { run(); results.push({ name, ok: true }); console.log('PASS', name) } catch (error) { results.push({ name, ok: false, error: String(error?.message ?? error) }); console.log('FAIL', name, '\n   ', String(error?.message ?? error)) } }
if (!globalThis.crypto) globalThis.crypto = webcrypto
for (const name of ['HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement']) if (!(name in globalThis)) globalThis[name] = class {}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [], maxTouchPoints: 0, platform: 'Win32' } })
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
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { timing: entry }, output: { entryFileNames: '[name].mjs' } } } })
  const api = await import(pathToFileURL(join(out, 'build', 'timing.mjs')).href)
  await api.initWasm({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  globalThis.window = Object.assign(new EventTarget(), { performance: globalThis.performance })
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
  globalThis.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail } }
  api.scriptProjectSettings.debuggerEnabled = false; api.scriptProjectSettings.testing.coverageEnabled = false
  const world = api.physicsState.world
  world.runtime = new api.WasmRuntimeWorld(); world.wasmLoaded = true
  const source = `@export let fixed_count = 0;
@export let hit_at = -1;
@export let bounce_seen_at = -1;
fn fixed_update(dt) {
  fixed_count += 1;
  if hit_at >= 0 && bounce_seen_at < 0 && rigid_body().velocity_y > 5.0 { bounce_seen_at = fixed_count; }
}
fn on_collision_enter(other, px, py, nx, ny, rvx, rvy) {
  if hit_at < 0 { hit_at = fixed_count; set_velocity(0.0, 8.0); }
}`
  const record = { uuid: 'event-timing-probe', name: 'EventTimingProbe', path: 'Assets/EventTimingProbe.rhai', assetType: 'script', source, script: api.defaultScriptMetadata() }
  api.assetState.records.splice(0, api.assetState.records.length, record); api.assetState.generation++
  let id = 1200
  const runtime = api.gameplayRuntime
  const box = (name, x, y, width, height, type) => { const entity = new api.BoxEntity(id++, { x, y }, { x: width, y: height }); entity.name = name; entity.rigidBody.bodyType = type; return entity }
  const run = (dispatch, stepsPerFrame, startY) => {
    const settings = api.physicsState.globalSettings
    settings.tickRate = 120; settings.profile.tickRate = 120; settings.timeScale = 1; settings.maxCatchUpSteps = 8; settings.profile.maxCatchUpSteps = 8
    if (dispatch === 'step') settings.eventDispatch = 'step'; else delete settings.eventDispatch
    const falling = box('Falling', 0, startY, 1, 1, 'Dynamic')
    const script = falling.addComponent(new api.Script2D()); script.scriptAsset = record.uuid
    world.entities.splice(0, world.entities.length, box('Ground', 0, -4, 20, 1, 'Static'), falling)
    api.physicsState.playMode = 'playing'
    runtime.beginSession()
    for (let frame = 0; frame < 240 / stepsPerFrame; frame++) runtime.frame(stepsPerFrame / 120)
    const properties = { ...falling.script2D.properties }
    runtime.stopSession(false)
    assert.equal(falling.script2D.lastError ?? null, null, `script error: ${falling.script2D.lastError}`)
    return { dispatch, stepsPerFrame, startY, fixedCount: Number(properties.fixed_count), hitAt: Number(properties.hit_at), bounceSeenAt: Number(properties.bounce_seen_at) }
  }
  for (const startY of [0, 0.37, 1.1, 2.6]) for (const dispatch of ['step', 'frame']) for (const steps of [1, 4]) runs[`${dispatch}-${steps}-${startY}`] = run(dispatch, steps, startY)
  check('every run makes contact and counts its fixed steps', () => { for (const value of Object.values(runs)) assert.ok(value.hitAt > 0 && value.fixedCount >= 200, JSON.stringify(value)) })
  check('per-step dispatch: the callback runs right after the contact step, however steps group into frames', () => {
    for (const startY of [0, 0.37, 1.1, 2.6]) assert.equal(runs[`step-4-${startY}`].hitAt, runs[`step-1-${startY}`].hitAt, `start ${startY}`)
  })
  check('frame dispatch (projects before 26.43) is unchanged: the callback waits for the end of the frame', () => {
    for (const startY of [0, 0.37, 1.1, 2.6]) {
      const one = runs[`frame-1-${startY}`], four = runs[`frame-4-${startY}`]
      assert.equal(one.hitAt, runs[`step-1-${startY}`].hitAt, 'one step per frame: both modes agree')
      assert.equal(four.hitAt % 4, 0, `four steps per frame: ${four.hitAt} is a frame end`)
      assert.ok(four.hitAt >= one.hitAt && four.hitAt - one.hitAt < 4, `start ${startY}: ${four.hitAt} vs ${one.hitAt}`)
    }
  })
  check("per-step dispatch: the callback's command applies on the very next step", () => {
    for (const startY of [0, 0.37, 1.1, 2.6]) { const value = runs[`step-4-${startY}`]; assert.equal(value.bounceSeenAt, value.hitAt + 1, JSON.stringify(value)) }
  })
} finally {
  await rm(out, { recursive: true, force: true })
}
await mkdir(join(root, '.cache', 'verify'), { recursive: true })
await writeFile(join(root, '.cache', 'verify', 'event-timing-2643.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, runs }, null, 2))
const failed = results.filter(item => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
