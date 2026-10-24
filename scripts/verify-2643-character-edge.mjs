/** 26.43 P-1: a jumping character that hits the side of a box near its top edge is not launched.
 *
 * Before 26.43 the character controller stepped up mid-air: when the feet of a jumping character met
 * the side of a box within the step height (0.35 m), it was lifted onto the step, and the template
 * scripts read that lift back as velocity (motion / dt): 0.35 m in one 1/120 s step is 42 m/s
 * upward, so the character flew. This check runs the real GameplayRuntime, World, Rust character
 * query and Rhai VM (WASM) headless with the Platformer template geometry (player 1.1 x 1.8,
 * platform 5 x 0.7 at (3, -1), ground at y = -4) and the template's movement script. It jumps
 * towards the platform edge with a range of jump speeds and start positions and records the largest
 * upward velocity and height the script sees.
 *
 * Usage: node scripts/verify-2643-character-edge.mjs (needs nova_core/pkg). Results: .cache/verify/character-edge-2643.json */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'

const root = process.cwd()
const out = await mkdtemp(join(tmpdir(), 'nova-character-edge-'))
const results = []
const check = (name, run) => { try { run(); results.push({ name, ok: true }); console.log('PASS', name) } catch (error) { results.push({ name, ok: false, error: String(error?.message ?? error) }); console.log('FAIL', name, '\n   ', String(error?.message ?? error)) } }
if (!globalThis.crypto) globalThis.crypto = webcrypto
for (const name of ['HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement']) if (!(name in globalThis)) globalThis[name] = class {}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [], maxTouchPoints: 0, platform: 'Win32' } })
const runs = []
try {
  const entries = {
    'src/editor/gameplayRuntime.ts': 'gameplayRuntime',
    'src/store/physics.ts': 'physicsState',
    'src/assets/AssetDatabase.ts': 'assetState',
    'src/assets/types.ts': 'defaultScriptMetadata',
    'src/world/BoxEntity.ts': 'BoxEntity',
    'src/world/components.ts': 'Script2D, CharacterBody2D',
    'src/runtime/scriptSettings.ts': 'scriptProjectSettings',
    'nova_core/pkg/nova_core.js': 'default as initWasm, WasmRuntimeWorld'
  }
  const entry = join(out, 'entry.ts')
  await writeFile(entry, Object.entries(entries).map(([path, names]) => `export { ${names} } from '${join(root, path).replaceAll('\\', '/')}';`).join('\n'))
  await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { edge: entry }, output: { entryFileNames: '[name].mjs' } } } })
  const api = await import(pathToFileURL(join(out, 'build', 'edge.mjs')).href)
  await api.initWasm({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  globalThis.window = Object.assign(new EventTarget(), { performance: globalThis.performance })
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
  globalThis.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail } }
  api.scriptProjectSettings.debuggerEnabled = false; api.scriptProjectSettings.testing.coverageEnabled = false
  const world = api.physicsState.world
  world.runtime = new api.WasmRuntimeWorld(); world.wasmLoaded = true
  // The Platformer template movement (gravity -22, speed 8), with a fixed "hold right, jump once" input.
  const source = `@export let jump_speed = 12.0;
@export let vy_max = -1000.0;
@export let y_max = -1000.0;
@export let jumped = false;
@export let side_hits = 0;
fn fixed_update(dt) {
  let vertical = rigid_body().velocity_y + -22.0 * dt;
  if !jumped && can_coyote_jump() { vertical = jump_speed; jumped = true; }
  move_character(8.0 * dt, vertical * dt);
}
fn update(dt) {
  let v = rigid_body().velocity_y;
  if v > vy_max { vy_max = v; }
  let y = transform().position_y;
  if y > y_max { y_max = y; }
  if character_is_on_wall() { side_hits += 1; }
}`
  const record = { uuid: 'character-edge-probe', name: 'CharacterEdgeProbe', path: 'Assets/CharacterEdgeProbe.rhai', assetType: 'script', source, script: api.defaultScriptMetadata() }
  api.assetState.records.splice(0, api.assetState.records.length, record); api.assetState.generation++
  let id = 900
  const runtime = api.gameplayRuntime
  const box = (name, x, y, width, height, type) => {
    const entity = new api.BoxEntity(id++, { x, y }, { x: width, y: height }); entity.name = name
    entity.rigidBody.bodyType = type
    return entity
  }
  const run = (startX, jumpSpeed) => {
    const settings = api.physicsState.globalSettings
    settings.tickRate = 120; settings.profile.tickRate = 120; settings.timeScale = 1
    const player = box('Player', startX, -2.6 + 0.001, 1.1, 1.8, 'Kinematic')
    const character = player.addComponent(new api.CharacterBody2D())
    character.stepHeight = 0.35; character.floorSnap = 0.15; character.safeMargin = 0.001
    const script = player.addComponent(new api.Script2D()); script.scriptAsset = record.uuid; script.properties = { jump_speed: jumpSpeed }
    world.entities.splice(0, world.entities.length, box('Ground', 0, -4, 18, 1, 'Static'), box('Platform', 3, -1, 5, 0.7, 'Static'), player)
    api.physicsState.playMode = 'playing'
    runtime.beginSession()
    for (let index = 0; index < 120 * 2; index++) runtime.frame(1 / 120)
    const properties = { ...player.script2D.properties }
    runtime.stopSession(false)
    assert.equal(player.script2D.lastError ?? null, null, `script error: ${player.script2D.lastError}`)
    return { startX, jumpSpeed, vyMax: Number(properties.vy_max), yMax: Number(properties.y_max), sideHits: Number(properties.side_hits), jumped: properties.jumped === true }
  }
  for (const startX of [-4.2, -3.9, -3.6, -3.3]) for (let jumpSpeed = 9.5; jumpSpeed <= 12.01; jumpSpeed += 0.25) runs.push(run(startX, Math.round(jumpSpeed * 100) / 100))
  check('the probe ran: every run jumped, and the jumps reached the platform side', () => {
    assert.ok(runs.every(value => value.jumped), 'every run jumped')
    assert.ok(runs.filter(value => value.sideHits > 0).length >= runs.length / 4, `${runs.filter(value => value.sideHits > 0).length} of ${runs.length} runs touched the platform side`)
  })
  check('no run gains upward speed beyond its jump speed (no mid-air step-up launch)', () => {
    for (const value of runs) assert.ok(value.vyMax <= value.jumpSpeed + 0.05, `start ${value.startX}, jump ${value.jumpSpeed}: velocity reached ${value.vyMax.toFixed(2)}`)
  })
  check('no run rises above its ballistic apex (plus the height of the platform top when it lands there)', () => {
    for (const value of runs) {
      // The script integrates semi-implicitly at 120 Hz (first step at the full jump speed), so the
      // discrete apex is v0^2/2g + v0*dt/2 above the start: sum the same steps instead of using v0^2/2g.
      let apex = -2.6 + 0.001
      for (let v = value.jumpSpeed; v > 0; v -= 22 / 120) apex += v / 120
      assert.ok(value.yMax <= Math.max(apex, -0.65 + 0.9) + 0.02, `start ${value.startX}, jump ${value.jumpSpeed}: y reached ${value.yMax.toFixed(2)} (apex ${apex.toFixed(2)})`)
    }
  })
} finally {
  await rm(out, { recursive: true, force: true })
}
await mkdir(join(root, '.cache', 'verify'), { recursive: true })
await writeFile(join(root, '.cache', 'verify', 'character-edge-2643.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, runs }, null, 2))
const failed = results.filter(item => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
console.log(`largest upward velocity seen: ${Math.max(...runs.map(value => value.vyMax)).toFixed(2)} m/s over ${runs.length} runs`)
process.exit(failed.length ? 1 : 0)
