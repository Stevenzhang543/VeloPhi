/** 26.45 debugger checks: breakpoints on blocks of a Blocks script stop the real GameplayRuntime (Rhai
 * VM in WASM) at the block, the paused block is found from the stop line, the generated code has no
 * markers left, and the compiled block → line map follows edits.
 *
 * Usage: node scripts/verify-2645-debugger.mjs (needs nova_core/pkg built from this source).
 * Results: .cache/verify/debugger-2645.json */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'

const root = process.cwd()
const out = await mkdtemp(join(tmpdir(), 'nova-debugger-2645-'))
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
    'src/visual/blockScript.ts': 'createBlockScript, createHandler, createBlock, blockScriptSource, compileBlockScript, blockSourceLines, blockBreakpointLines',
    'nova_core/pkg/nova_core.js': 'default as initWasm, WasmRuntimeWorld'
  }
  const entry = join(out, 'entry.ts')
  await writeFile(entry, Object.entries(entries).map(([path, names]) => `export { ${names} } from '${join(root, path).replaceAll('\\', '/')}';`).join('\n'))
  await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { debugger: entry }, output: { entryFileNames: '[name].mjs' } } } })
  const api = await import(pathToFileURL(join(out, 'build', 'debugger.mjs')).href)

  await check('compiled Blocks code carries no line markers and the block → line map points at each block', () => {
    const document = api.createBlockScript()
    const handler = api.createHandler('update'); document.handlers = [handler]
    const first = api.createBlock('changeVariable'); first.fields.variable = 'score'; first.fields.value = '1'
    const loop = api.createBlock('repeat'); loop.fields.times = '2'
    const inner = api.createBlock('changeVariable'); inner.fields.variable = 'score'; inner.fields.value = '10'
    loop.children = [inner]
    handler.blocks = [first, loop]
    const compiled = api.compileBlockScript(document)
    assert.ok(!compiled.code.includes('@@block'), 'no markers in the code')
    const codeLines = compiled.code.split('\n')
    assert.equal(codeLines[compiled.blockLines.get(first.id) - 1].trim(), 'score += 1.0;')
    assert.match(codeLines[compiled.blockLines.get(loop.id) - 1].trim(), /^for __i in 0\.\.2 \{$/)
    assert.equal(codeLines[compiled.blockLines.get(inner.id) - 1].trim(), 'score += 10.0;')
    const { source } = api.blockScriptSource(document)
    const lines = api.blockSourceLines(source)
    assert.equal(source.split('\n')[lines.get(inner.id) - 1].trim(), 'score += 10.0;', 'source lines count the header line')
    observations.blockLines = Object.fromEntries(lines)
  })

  globalThis.window = Object.assign(new EventTarget(), { performance: globalThis.performance, setTimeout, clearTimeout })
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
  globalThis.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail } }
  await api.initWasm({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  api.scriptProjectSettings.debuggerEnabled = true; api.scriptProjectSettings.testing.coverageEnabled = false
  const world = api.physicsState.world
  world.runtime = new api.WasmRuntimeWorld(); world.wasmLoaded = true
  const runtime = api.gameplayRuntime
  const debug = () => runtime.scriptDebugger.state

  await check('a breakpoint on a block stops the game at that block with the block variables', () => {
    const document = api.createBlockScript()
    const handler = api.createHandler('update'); document.handlers = [handler]
    const first = api.createBlock('changeVariable'); first.fields.variable = 'score'; first.fields.value = '1'
    const second = api.createBlock('changeVariable'); second.fields.variable = 'score'; second.fields.value = '5'
    second.breakpoint = true
    handler.blocks = [first, second]
    const { source } = api.blockScriptSource(document)
    assert.deepEqual(api.blockBreakpointLines(source).map(point => point.blockId), [second.id])
    const script = { uuid: 'blocks-probe', name: 'BlocksProbe', path: 'Assets/Scripts/BlocksProbe.rhai', assetType: 'script', source, script: { ...api.defaultScriptMetadata() } }
    api.assetState.records.splice(0, api.assetState.records.length, script); api.assetState.generation++
    const hero = new api.BoxEntity(3200, { x: 0, y: 0 }, { x: 1, y: 1 }); hero.name = 'Hero'; hero.rigidBody.bodyType = 'Kinematic'
    const behaviour = hero.addComponent(new api.Script2D()); behaviour.scriptAsset = script.uuid
    world.entities.splice(0, world.entities.length, hero)
    api.physicsState.playMode = 'playing'
    runtime.beginSession()
    for (let index = 0; index < 4 && api.physicsState.playMode === 'playing'; index++) runtime.frame(1 / 60)
    assert.equal(hero.script2D.lastError ?? null, null, `script error: ${hero.script2D.lastError}`)
    assert.equal(api.physicsState.playMode, 'paused', 'stopped')
    const frame = debug().callStack[0]
    const lines = api.blockSourceLines(source)
    const pausedBlock = [...lines].find(([, line]) => line === frame.line)?.[0]
    assert.equal(pausedBlock, second.id, `stopped at the block with the breakpoint (line ${frame.line})`)
    assert.equal(debug().locals.score, 1, 'the first block already ran')
    observations.blockStop = { line: frame.line, function: frame.functionName, locals: debug().locals }
    runtime.debugContinue()
    for (let index = 0; index < 1; index++) runtime.frame(1 / 60)
    assert.equal(api.physicsState.playMode, 'paused', 'and again on the next frame')
    assert.equal(Number(hero.script2D.properties.score), 6, 'the stopped frame ran once (1 + 5)')
    runtime.stopSession(false)
  })
} catch (error) {
  results.push({ name: 'setup', ok: false, error: String(error?.stack ?? error) }); console.log('FAIL setup\n   ', String(error?.stack ?? error))
} finally {
  await rm(out, { recursive: true, force: true })
}
await mkdir(join(root, '.cache', 'verify'), { recursive: true })
await writeFile(join(root, '.cache', 'verify', 'debugger-2645.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, observations }, null, 2))
const passed = results.filter(result => result.ok).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exitCode = passed === results.length ? 0 : 1
