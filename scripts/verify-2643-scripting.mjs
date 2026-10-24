/** 26.43 scripting: global scripts, cross-script calls, delayed calls, script audio and video.
 *
 * Runs the real GameplayRuntime, World and Rhai VM (WASM) headless. A project global script "Game"
 * is started before the scene, a player calls it (call_global), the global calls back (call_on with
 * the caller's handle), the player calls a group (call_group) and itself later (after). Media calls
 * run without audio/video devices and must fail softly: play_video emits "video.finished" with
 * reason "unavailable" so a waiting script never hangs. A self-calling loop must be bounded per
 * phase without freezing the frame. Stopping the session removes the global host object.
 *
 * Usage: node scripts/verify-2643-scripting.mjs (needs nova_core/pkg). Results: .cache/verify/scripting-2643.json */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'

const root = process.cwd()
const out = await mkdtemp(join(tmpdir(), 'nova-scripting-'))
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
    'src/store/editor.ts': 'editorState',
    'src/assets/AssetDatabase.ts': 'assetState',
    'src/assets/types.ts': 'defaultScriptMetadata',
    'src/world/BoxEntity.ts': 'BoxEntity',
    'src/world/components.ts': 'Script2D',
    'src/runtime/scriptSettings.ts': 'scriptProjectSettings',
    'src/runtime/scriptAnalysis.ts': 'analyzeScript',
    'nova_core/pkg/nova_core.js': 'default as initWasm, WasmRuntimeWorld'
  }
  const entry = join(out, 'entry.ts')
  await writeFile(entry, Object.entries(entries).map(([path, names]) => `export { ${names} } from '${join(root, path).replaceAll('\\', '/')}';`).join('\n'))
  await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { scripting: entry }, output: { entryFileNames: '[name].mjs' } } } })
  const api = await import(pathToFileURL(join(out, 'build', 'scripting.mjs')).href)
  await api.initWasm({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  globalThis.window = Object.assign(new EventTarget(), { performance: globalThis.performance })
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
  globalThis.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail } }
  api.scriptProjectSettings.debuggerEnabled = false; api.scriptProjectSettings.testing.coverageEnabled = false
  const world = api.physicsState.world
  world.runtime = new api.WasmRuntimeWorld(); world.wasmLoaded = true
  const sources = {
    game: `@export let coins = 0;
@export let calls = 0;
@export let awoke = false;
fn awake() { awoke = true; }
fn add_coins(n) { coins += n; calls += 1; }
fn ping(from) { call_on(from, "pong", [coins]); }`,
    player: `@export let got = -1;
@export let later = 0;
@export let video_reason = "";
@export let started_after_global = false;
fn start() {
  call_global("Game", "add_coins", [5]);
  call_global("Game", "ping", [entity_handle()]);
  call_global("Missing", "nothing");
  call_group("enemies", "hit", [2]);
  after(0.25, "delayed", [7]);
  play_sound("Assets/Audio/missing.wav", #{ volume: 0.5 });
  play_music("Assets/Audio/missing.ogg", 1.0);
  set_bus_volume("Music", 0.5);
  play_video("Assets/Video/missing.webm");
}
fn pong(value) { got = value; }
fn delayed(v) { later = v; }
fn on_signal(name, payload, source) { if name == "video.finished" { video_reason = payload.reason; } }`,
    enemy: `@export let hp = 10;
fn hit(n) { hp -= n; }`,
    looper: `@export let count = 0;
fn start() { call_on(entity_handle(), "again"); }
fn again() { count += 1; call_on(entity_handle(), "again"); }`
  }
  const records = Object.entries(sources).map(([name, source]) => ({ uuid: `script-2643-${name}`, name: `${name}.rhai`, path: `Assets/Scripts/${name}.rhai`, assetType: 'script', source, script: api.defaultScriptMetadata() }))
  api.assetState.records.splice(0, api.assetState.records.length, ...records); api.assetState.generation++
  for (const record of records) {
    const diagnostics = api.analyzeScript(record.source).diagnostics.filter(item => item.severity === 'error')
    observed[`analysis:${record.name}`] = diagnostics.map(item => `${item.code} ${item.message}`)
  }
  let id = 700
  const host = (name, script, groups = []) => {
    const entity = new api.BoxEntity(id++, { x: id, y: 0 }, { x: 1, y: 1 }); entity.name = name
    entity.rigidBody.bodyType = 'Static'; entity.groups = groups
    const component = entity.addComponent(new api.Script2D()); component.scriptAsset = `script-2643-${script}`
    return entity
  }
  const settings = api.physicsState.globalSettings
  settings.tickRate = 60; settings.profile.tickRate = 60; settings.timeScale = 1
  api.scriptProjectSettings.globalScripts = [{ name: 'Game', scriptAsset: 'Assets/Scripts/game.rhai', enabled: true }, { name: 'Off', scriptAsset: 'script-2643-game', enabled: false }]
  const player = host('Player', 'player'), enemyA = host('EnemyA', 'enemy', ['enemies']), enemyB = host('EnemyB', 'enemy', ['enemies']), looper = host('Looper', 'looper')
  world.entities.splice(0, world.entities.length, player, enemyA, enemyB, looper)
  api.editorState.logs.splice(0, api.editorState.logs.length)
  api.physicsState.playMode = 'playing'
  const runtime = api.gameplayRuntime
  runtime.beginSession()
  const game = world.entities.find(entity => entity.name === 'Game')
  observed.firstEntity = world.entities[0]?.name
  observed.gameHost = game ? { persistent: game.persistentAcrossScenes, components: game.components.map(item => item.kind), ownership: game.ownership } : null
  const started = performance.now()
  for (let index = 0; index < 6; index++) runtime.frame(1 / 60)
  observed.firstFramesMs = performance.now() - started
  observed.afterSixFrames = { coins: game?.script2D?.properties.coins, calls: game?.script2D?.properties.calls, awoke: game?.script2D?.properties.awoke, got: player.script2D.properties.got, later: player.script2D.properties.later, hp: [enemyA.script2D.properties.hp, enemyB.script2D.properties.hp], videoReason: player.script2D.properties.video_reason, loops: looper.script2D.properties.count }
  for (let index = 0; index < 18; index++) runtime.frame(1 / 60)
  observed.afterQuarterSecond = { later: player.script2D.properties.later, loops: looper.script2D.properties.count }
  observed.logs = api.editorState.logs.map(log => `${log.level}: ${log.message}`)
  observed.errors = [player, enemyA, enemyB, looper, game].map(entity => entity?.script2D?.lastError ?? null)
  runtime.stopSession(false)
  observed.afterStop = { gameStillInWorld: world.entities.some(entity => entity.name === 'Game'), entities: world.entities.length }

  check('new script functions are known to the static analyzer (no NOVA-SEM-003)', () => {
    for (const [name, errors] of Object.entries(observed).filter(([key]) => key.startsWith('analysis:'))) assert.deepEqual(errors, [], name)
  })
  check('the enabled global script runs on a persistent, physics-free host placed first; disabled ones do not start', () => {
    assert.equal(observed.firstEntity, 'Game')
    assert.deepEqual(observed.gameHost, { persistent: true, components: ['Transform2D', 'Script2D'], ownership: 'Runtime' })
    assert.equal(observed.afterSixFrames.awoke, true)
    assert.ok(!observed.logs.some(line => line.includes('Off')), 'disabled global did not start')
  })
  check('call_global reaches the global script with arguments, and call_on returns to the caller', () => {
    assert.equal(observed.afterSixFrames.coins, 5)
    assert.equal(observed.afterSixFrames.calls, 1)
    assert.equal(observed.afterSixFrames.got, 5)
  })
  check('call_group calls every member of the group', () => assert.deepEqual(observed.afterSixFrames.hp, [8, 8]))
  check('after(0.25, ...) waits for game time and then passes its arguments', () => {
    assert.equal(observed.afterSixFrames.later, 0)
    assert.equal(observed.afterQuarterSecond.later, 7)
  })
  check('a call to a missing global and media without devices fail softly with one message each', () => {
    assert.equal(observed.logs.filter(line => line.includes('no global script named “Missing”')).length, 1)
    assert.equal(observed.logs.filter(line => line.includes('play_sound could not play')).length, 1)
    assert.equal(observed.afterSixFrames.videoReason, 'unavailable')
    assert.deepEqual(observed.errors, [null, null, null, null, null])
  })
  check('a self-calling loop is bounded per phase and does not freeze the frame', () => {
    assert.ok(observed.afterSixFrames.loops > 0, 'the loop ran')
    assert.ok(observed.afterSixFrames.loops <= 512 * 30, `bounded: ${observed.afterSixFrames.loops}`)
    assert.ok(observed.afterQuarterSecond.loops > observed.afterSixFrames.loops, 'it continues in later phases')
    assert.equal(observed.logs.filter(line => line.includes('script calls in one phase')).length, 1)
  })
  check('stopping the session removes the global host', () => assert.equal(observed.afterStop.gameStillInWorld, false))
} finally {
  await rm(out, { recursive: true, force: true })
}
await mkdir(join(root, '.cache', 'verify'), { recursive: true })
await writeFile(join(root, '.cache', 'verify', 'scripting-2643.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, observed }, null, 2))
const failed = results.filter(item => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
