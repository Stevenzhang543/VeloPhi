/** 26.44 script debugger checks: Rhai line breakpoints with the VM call stack and locals, stepping
 * into, out of and over lines, conditions, and that a stopped run leaves no trace (the callback re-runs
 * to the stop; its effects apply once) — in the real GameplayRuntime with the Rhai VM (WASM).
 *
 * Usage: node scripts/verify-2644-debugger.mjs (needs nova_core/pkg built from this source).
 * Results: .cache/verify/debugger-2644.json */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'

const root = process.cwd()
const out = await mkdtemp(join(tmpdir(), 'nova-debugger-2644-'))
const results = []
const observations = {}
const check = async (name, run) => { try { await run(); results.push({ name, ok: true }); console.log('PASS', name) } catch (error) { results.push({ name, ok: false, error: String(error?.stack ?? error) }); console.log('FAIL', name, '\n   ', String(error?.message ?? error)) } }
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
    'src/runtime/scriptModules.ts': 'scriptBundleLines, resolveProjectScriptBundle',
    'src/runtime/physicsRecorder.ts': 'PhysicsRecorder',
    'nova_core/pkg/nova_core.js': 'default as initWasm, WasmRuntimeWorld'
  }
  const entry = join(out, 'entry.ts')
  await writeFile(entry, Object.entries(entries).map(([path, names]) => `export { ${names} } from '${join(root, path).replaceAll('\\', '/')}';`).join('\n'))
  await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { debugger: entry }, output: { entryFileNames: '[name].mjs' } } } })
  const api = await import(pathToFileURL(join(out, 'build', 'debugger.mjs')).href)

  await check('bundle lines map the root script and its modules', () => {
    const modules = { 'Assets/Scripts/util.rhai': 'fn twice(x) {\n  x * 2\n}\n', 'Assets/Scripts/main.rhai': 'use "util";\nfn update(dt) {\n  let a = twice(2);\n}\n' }
    const host = { resolveAsset: reference => { const path = reference.endsWith('.rhai') ? reference : `${reference}.rhai`; return modules[path] !== undefined ? { uuid: path, path, assetType: 'script' } : null }, readSource: uuid => modules[uuid] ?? null, compileVisual: source => source }
    const bundle = api.resolveProjectScriptBundle('Assets/Scripts/main.rhai', host)
    const lines = api.scriptBundleLines(bundle, 'Assets/Scripts/main.rhai')
    const compiled = bundle.split('\n')
    assert.equal(compiled[lines.toCompiled(3) - 1].trim(), 'let a = twice(2);')
    assert.deepEqual(lines.locate(lines.toCompiled(3)), { root: true, path: 'Assets/Scripts/main.rhai', line: 3 })
    const helperLine = compiled.findIndex(text => text.trim() === 'x * 2') + 1
    assert.deepEqual(lines.locate(helperLine), { root: false, path: 'Assets/Scripts/util.rhai', line: 2 })
  })

  await check('physics recorder: ring buffer, exact scrub and live restore, continue drops the later frames', () => {
    const recorder = new api.PhysicsRecorder()
    const box = new api.BoxEntity(4000, { x: 0, y: 10 }, { x: 1, y: 1 }); box.rigidBody.bodyType = 'Dynamic'
    const wall = new api.BoxEntity(4001, { x: 5, y: 0 }, { x: 1, y: 8 }); wall.rigidBody.bodyType = 'Static'
    const entities = [box, wall]
    recorder.record(1, 0, entities)
    assert.equal(recorder.status().frames, 0, 'nothing is recorded while disabled')
    recorder.enabled = true
    for (let step = 1; step <= 700; step++) { box.transform.position.y = 10 - step * 0.01; box.velocity = { x: 0, y: -step }; recorder.record(step, step / 60, entities) }
    const status = recorder.status()
    assert.equal(status.frames, status.capacity, 'the ring is full'); assert.equal(status.lastStep, 700); assert.equal(status.firstStep, 700 - status.capacity + 1)
    assert.equal(status.bodies, 1, 'static bodies are not recorded')
    const live = box.transform.position.y
    assert.equal(recorder.scrubTo(0, entities), true)
    assert.ok(Math.abs(box.transform.position.y - (10 - status.firstStep * 0.01)) < 1e-12, 'the oldest frame is shown')
    recorder.record(999, 0, entities)
    assert.equal(recorder.status().lastStep, 700, 'the scrubbed view is not recorded')
    recorder.endScrub(entities)
    assert.ok(Object.is(box.transform.position.y, live), 'live pose restored exactly')
    const teleports = []
    recorder.scrubTo(status.frames - 101, entities)
    const rewound = recorder.continueFromScrub({ entities, teleport: (entity, position, angle) => { teleports.push([entity.uuid, position.y]); entity.transform.position.y = position.y; return true } })
    assert.equal(rewound, 1)
    assert.ok(Math.abs(box.transform.position.y - (10 - 600 * 0.01)) < 1e-12, `rewound to step 600: ${box.transform.position.y}`)
    assert.equal(box.velocity.y, -600)
    assert.equal(recorder.status().lastStep, 600, 'the frames after it are dropped')
    assert.equal(recorder.status().scrubIndex, -1)
  })

  globalThis.window = Object.assign(new EventTarget(), { performance: globalThis.performance, setTimeout, clearTimeout })
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
  globalThis.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail } }
  await api.initWasm({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  const supported = (await readFile(join(root, 'nova_core/pkg/nova_core.d.ts'), 'utf8')).includes('execute_instance_debug_json')
  observations.wasmDebugApi = supported
  api.scriptProjectSettings.debuggerEnabled = true; api.scriptProjectSettings.testing.coverageEnabled = false
  const world = api.physicsState.world
  world.runtime = new api.WasmRuntimeWorld(); world.wasmLoaded = true
  const runtime = api.gameplayRuntime
  const source = [
    '@export let count = 0;',
    '@export let trace = "";',
    'fn helper(x) {',
    '    let doubled = x * 2;',
    '    doubled + 1',
    '}',
    'fn update(dt) {',
    '    let step = 1;',
    '    count += step;',
    '    let value = helper(step);',
    '    trace += `${value},`;',
    '}'
  ].join('\n')
  const breakpoint = (line, extra = {}) => ({ id: `bp-${line}`, line, functionName: '', condition: '', hitCondition: 0, logMessage: '', enabled: true, hitCount: 0, ...extra })
  const script = { uuid: 'debug-probe', name: 'DebugProbe', path: 'Assets/Scripts/DebugProbe.rhai', assetType: 'script', source, script: { ...api.defaultScriptMetadata(), breakpointDetails: [breakpoint(10)] } }
  api.assetState.records.splice(0, api.assetState.records.length, script); api.assetState.generation++
  const debug = () => runtime.scriptDebugger.state
  const hero = new api.BoxEntity(3000, { x: 0, y: 0 }, { x: 1, y: 1 }); hero.name = 'Hero'; hero.rigidBody.bodyType = 'Kinematic'
  const behaviour = hero.addComponent(new api.Script2D()); behaviour.scriptAsset = script.uuid
  world.entities.splice(0, world.entities.length, hero)

  await check('physics recording in the runtime: a falling box can be scrubbed back and continued from there', () => {
    const faller = new api.BoxEntity(3100, { x: 0, y: 20 }, { x: 1, y: 1 }); faller.name = 'Faller'; faller.rigidBody.bodyType = 'Dynamic'
    world.entities.splice(0, world.entities.length, faller)
    api.physicsState.playMode = 'playing'
    runtime.setPhysicsRecording(true)
    runtime.beginSession()
    for (let index = 0; index < 60; index++) runtime.frame(1 / 60)
    const status = runtime.physicsRecordingStatus()
    assert.ok(status.frames >= 55, `recorded ${status.frames} steps`)
    api.physicsState.playMode = 'paused'
    const liveY = faller.transform.position.y
    assert.equal(runtime.scrubPhysics(10), true)
    const scrubbedY = faller.transform.position.y
    assert.ok(scrubbedY > liveY + 0.5, `the box is shown higher up: ${scrubbedY} vs ${liveY}`)
    runtime.endPhysicsScrub()
    assert.ok(Object.is(faller.transform.position.y, liveY))
    runtime.scrubPhysics(10)
    assert.ok(runtime.continuePhysicsFromScrub() >= 1)
    api.physicsState.playMode = 'playing'
    for (let index = 0; index < 3; index++) runtime.frame(1 / 60)
    assert.ok(faller.transform.position.y > liveY + 0.4 && faller.transform.position.y < scrubbedY, `the box falls on from the recorded step: ${faller.transform.position.y}`)
    observations.recording = { frames: status.frames, liveY, scrubbedY, after: faller.transform.position.y }
    runtime.setPhysicsRecording(false)
    runtime.stopSession(false)
    world.entities.splice(0, world.entities.length, hero)
  })

  await check('a breakpoint stops at its line with the VM locals and leaves the stopped run without effect', () => {
    assert.ok(supported, 'nova_core/pkg exports execute_instance_debug_json (rebuild the WASM)')
    api.physicsState.playMode = 'playing'
    runtime.beginSession()
    for (let index = 0; index < 4 && api.physicsState.playMode === 'playing'; index++) runtime.frame(1 / 60)
    assert.equal(hero.script2D.lastError ?? null, null, `script error: ${hero.script2D.lastError}`)
    assert.equal(api.physicsState.playMode, 'paused')
    assert.equal(debug().paused, true)
    assert.equal(debug().callStack[0].line, 10)
    assert.equal(debug().callStack[0].functionName, 'update')
    assert.equal(debug().locals.step, 1)
    assert.equal(debug().locals.count, 1, 'count as the script sees it at line 10')
    assert.equal(Number(hero.script2D.properties.count ?? 0), 0, 'nothing of the stopped run is applied')
    observations.firstStop = { reason: debug().reason, locals: debug().locals, stack: debug().callStack.map(frame => `${frame.functionName}:${frame.line}`) }
  })

  await check('step into enters the helper with a two-frame stack; step out returns to the next line', () => {
    runtime.debugStep('into')
    assert.equal(debug().paused, true)
    assert.deepEqual(debug().callStack.map(frame => `${frame.functionName}:${frame.line}`), ['helper:4', 'update:10'])
    assert.equal(debug().locals.x, 1)
    runtime.debugStep('out')
    assert.equal(debug().callStack[0].line, 11)
    assert.equal(debug().locals.value, 3)
    runtime.debugStep('over')
    assert.equal(debug().paused, true, 'the callback finished: paused at the callback boundary')
    assert.equal(Number(hero.script2D.properties.count), 1, 'the callback ran once')
    assert.equal(hero.script2D.properties.trace, '3,')
  })

  await check('continue runs on to the next hit; a condition skips hits until it holds', () => {
    runtime.debugContinue()
    for (let index = 0; index < 4 && api.physicsState.playMode === 'playing'; index++) runtime.frame(1 / 60)
    assert.equal(api.physicsState.playMode, 'paused')
    assert.equal(debug().callStack[0].line, 10)
    assert.equal(debug().locals.count, 2)
    script.script.breakpointDetails = [breakpoint(10, { condition: 'count > 4' })]
    api.assetState.generation++
    runtime.debugContinue()
    for (let index = 0; index < 20 && api.physicsState.playMode === 'playing'; index++) runtime.frame(1 / 60)
    assert.equal(api.physicsState.playMode, 'paused')
    assert.equal(debug().locals.count, 5, 'stopped at the first hit where count > 4')
    assert.equal(Number(hero.script2D.properties.count), 4)
    assert.equal(hero.script2D.properties.trace, '3,3,3,3,')
    script.script.breakpointDetails = []
    api.assetState.generation++
    runtime.debugContinue()
    for (let index = 0; index < 3; index++) runtime.frame(1 / 60)
    assert.equal(api.physicsState.playMode, 'playing')
    assert.ok(Number(hero.script2D.properties.count) >= 6, `effects apply once per frame: ${hero.script2D.properties.count}`)
    runtime.stopSession(false)
  })
} catch (error) {
  results.push({ name: 'setup', ok: false, error: String(error?.stack ?? error) }); console.log('FAIL setup\n   ', String(error?.stack ?? error))
} finally {
  await rm(out, { recursive: true, force: true })
}
await mkdir(join(root, '.cache', 'verify'), { recursive: true })
await writeFile(join(root, '.cache', 'verify', 'debugger-2644.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, observations }, null, 2))
const passed = results.filter(result => result.ok).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exitCode = passed === results.length ? 0 : 1
