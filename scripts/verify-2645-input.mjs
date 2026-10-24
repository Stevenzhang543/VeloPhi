/** 26.45 game input checks: the player's own bindings (only the changes are stored, they come back
 * on the next start and reset to the project's), `{input:Action}` prompt tokens in UI text, and the
 * script API in the real GameplayRuntime with the Rhai VM (WASM): `input_rebind` waits for the next
 * key, changes the binding and sends `input.rebound`; Escape cancels; `input_prompt` follows.
 *
 * Usage: node scripts/verify-2645-input.mjs (needs nova_core/pkg built from this source).
 * Results: .cache/verify/input-2645.json */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'

const root = process.cwd()
const out = await mkdtemp(join(tmpdir(), 'nova-input-2645-'))
const results = []
const observations = {}
const check = async (name, run) => { try { await run(); results.push({ name, ok: true }); console.log('PASS', name) } catch (error) { results.push({ name, ok: false, error: String(error?.stack ?? error) }); console.log('FAIL', name, '\n   ', String(error?.message ?? error)) } }
if (!globalThis.crypto) globalThis.crypto = webcrypto
for (const name of ['HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement']) if (!(name in globalThis)) globalThis[name] = class {}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [], maxTouchPoints: 0, platform: 'Win32' } })
const memoryStorage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), values } }
const key = code => ({ code, key: code.replace(/^Key/, '').toLowerCase(), repeat: false, isComposing: false, keyCode: 0, defaultPrevented: false, target: null, getModifierState: () => false, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, timeStamp: 0, preventDefault() {} })
try {
  const entries = {
    'src/editor/gameplayRuntime.ts': 'gameplayRuntime',
    'src/store/physics.ts': 'physicsState',
    'src/assets/AssetDatabase.ts': 'assetState',
    'src/assets/types.ts': 'defaultScriptMetadata',
    'src/world/BoxEntity.ts': 'BoxEntity',
    'src/world/components.ts': 'Script2D',
    'src/runtime/input.ts': 'defaultInputMap',
    'src/runtime/inputBindingStore.ts': 'inputBindingOverrides, loadInputBindings, saveInputBindings, resetInputBindings, replaceInputPromptTokens, inputBindingStorageKey',
    'nova_core/pkg/nova_core.js': 'default as initWasm, WasmRuntimeWorld'
  }
  const entry = join(out, 'entry.ts')
  await writeFile(entry, Object.entries(entries).map(([path, names]) => `export { ${names} } from '${join(root, path).replaceAll('\\', '/')}';`).join('\n'))
  await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { input: entry }, output: { entryFileNames: '[name].mjs' } } } })
  const api = await import(pathToFileURL(join(out, 'build', 'input.mjs')).href)

  await check("the player's bindings: only changes are stored, they come back, and reset to the project's", () => {
    const storage = memoryStorage()
    const defaults = api.defaultInputMap()
    const live = api.defaultInputMap()
    live.find(action => action.name === 'Jump').bindings[0] = { ...live.find(action => action.name === 'Jump').bindings[0], code: 'KeyK' }
    assert.deepEqual(api.inputBindingOverrides(defaults, live), { Jump: [{ index: 0, device: 'keyboard', code: 'KeyK' }] })
    assert.equal(api.saveInputBindings(storage, 'game-1', defaults, live), true)
    const stored = JSON.parse(storage.values.get(api.inputBindingStorageKey('game-1')))
    assert.equal(stored.format, 'nova-input-bindings')
    const restarted = api.defaultInputMap()
    assert.equal(api.loadInputBindings(storage, 'game-1', restarted), 1)
    assert.equal(restarted.find(action => action.name === 'Jump').bindings[0].code, 'KeyK', 'restored on the next start')
    assert.equal(restarted.find(action => action.name === 'Jump').bindings[1].code, '0', 'other bindings untouched')
    assert.equal(api.loadInputBindings(storage, 'other-game', api.defaultInputMap()), 0, 'per game')
    api.resetInputBindings(storage, 'game-1', defaults, restarted)
    assert.equal(restarted.find(action => action.name === 'Jump').bindings[0].code, 'Space')
    assert.equal(storage.values.size, 0, 'the stored bindings are forgotten')
    storage.setItem(api.inputBindingStorageKey('game-1'), '{broken')
    assert.equal(api.loadInputBindings(storage, 'game-1', api.defaultInputMap()), 0, 'damaged settings are ignored')
  })

  await check('UI text tokens show the prompt of an action', () => {
    assert.equal(api.replaceInputPromptTokens('Press {input:Jump} to start, {input: Fire } to shoot', action => ({ Jump: 'Space', Fire: 'LMB' })[action] ?? '?'), 'Press Space to start, LMB to shoot')
    assert.equal(api.replaceInputPromptTokens('No tokens here', () => 'x'), 'No tokens here')
  })

  globalThis.window = Object.assign(new EventTarget(), { performance: globalThis.performance, setTimeout, clearTimeout })
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
  globalThis.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail } }
  await api.initWasm({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  const world = api.physicsState.world
  world.runtime = new api.WasmRuntimeWorld(); world.wasmLoaded = true
  const runtime = api.gameplayRuntime

  await check('input_rebind waits for the next key, rebinds, signals, and input_prompt follows; Escape cancels', () => {
    api.physicsState.inputMap.splice(0, api.physicsState.inputMap.length, ...api.defaultInputMap())
    const source = [
      '@export let result = "";',
      '@export let before = "";',
      '@export let after = "";',
      '@export let asked = 0;',
      'fn update(dt) {',
      '    if asked == 0 { before = input_prompt("Jump"); input_rebind("Jump"); asked = 1; }',
      '    after = input_prompt("Jump");',
      '}',
      'fn on_signal(signal, payload, source) {',
      '    if signal == "input.rebound" { result = `rebound ${payload.action} ${payload.code} ${payload.prompt}`; }',
      '    if signal == "input.rebind_cancelled" { result = "cancelled"; }',
      '}'
    ].join('\n')
    const script = { uuid: 'rebind-probe', name: 'RebindProbe', path: 'Assets/Scripts/RebindProbe.rhai', assetType: 'script', source, script: { ...api.defaultScriptMetadata() } }
    api.assetState.records.splice(0, api.assetState.records.length, script); api.assetState.generation++
    const menu = new api.BoxEntity(3300, { x: 0, y: 0 }, { x: 1, y: 1 }); menu.name = 'Menu'; menu.rigidBody.bodyType = 'Kinematic'
    menu.addComponent(new api.Script2D()).scriptAsset = script.uuid
    world.entities.splice(0, world.entities.length, menu)
    api.physicsState.playMode = 'playing'
    runtime.beginSession()
    runtime.frame(1 / 60); runtime.frame(1 / 60)
    assert.equal(menu.script2D.lastError ?? null, null, `script error: ${menu.script2D.lastError}`)
    assert.equal(menu.script2D.properties.before, 'Space')
    assert.equal(runtime.input.capturingBinding, true, 'listening for a key')
    runtime.input.onKeyDown(key('KeyK'))
    runtime.frame(1 / 60); runtime.input.onKeyUp(key('KeyK')); runtime.frame(1 / 60)
    const jump = api.physicsState.inputMap.find(action => action.name === 'Jump')
    assert.equal(jump.bindings[0].code, 'KeyK', 'Jump is now K')
    assert.equal(menu.script2D.properties.result, 'rebound Jump KeyK K')
    assert.equal(menu.script2D.properties.after, 'K', 'input_prompt follows the new binding')
    observations.rebind = { ...menu.script2D.properties }
    runtime.stopSession(false)
    // Escape cancels and leaves the binding alone.
    menu.script2D.properties = {}
    runtime.beginSession()
    runtime.frame(1 / 60)
    runtime.input.onKeyDown(key('Escape'))
    runtime.frame(1 / 60); runtime.frame(1 / 60)
    assert.equal(menu.script2D.properties.result, 'cancelled')
    assert.equal(jump.bindings[0].code, 'KeyK')
    runtime.stopSession(false)
  })
} catch (error) {
  results.push({ name: 'setup', ok: false, error: String(error?.stack ?? error) }); console.log('FAIL setup\n   ', String(error?.stack ?? error))
} finally {
  await rm(out, { recursive: true, force: true })
}
await mkdir(join(root, '.cache', 'verify'), { recursive: true })
await writeFile(join(root, '.cache', 'verify', 'input-2645.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, observations }, null, 2))
const passed = results.filter(result => result.ok).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exitCode = passed === results.length ? 0 : 1
