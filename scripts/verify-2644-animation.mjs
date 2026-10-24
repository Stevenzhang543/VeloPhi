/** 26.44 animation and motion checks: easing curves, tweens, the Animator's Any State transitions,
 * state signals, crossfades and script reads, and the one-way drop-through, in the real
 * GameplayRuntime with the Rhai VM and the Rust physics (WASM).
 *
 * Usage: node scripts/verify-2644-animation.mjs (needs nova_core/pkg built from this source).
 * Results: .cache/verify/animation-2644.json */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'

const root = process.cwd()
const out = await mkdtemp(join(tmpdir(), 'nova-animation-2644-'))
const results = []
const observations = {}
const check = async (name, run) => { try { await run(); results.push({ name, ok: true }); console.log('PASS', name) } catch (error) { results.push({ name, ok: false, error: String(error?.message ?? error) }); console.log('FAIL', name, '\n   ', String(error?.message ?? error)) } }
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
    'src/world/components.ts': 'Script2D, CharacterBody2D, Animator',
    'src/runtime/scriptSettings.ts': 'scriptProjectSettings',
    'src/runtime/tweens.ts': 'TweenOwner, EASINGS, easingFunction, tweenProperty',
    'src/runtime/animationDocuments.ts': 'ANY_STATE, normalizeAnimatorController, findAnimatorState',
    'nova_core/pkg/nova_core.js': 'default as initWasm, WasmRuntimeWorld'
  }
  const entry = join(out, 'entry.ts')
  await writeFile(entry, Object.entries(entries).map(([path, names]) => `export { ${names} } from '${join(root, path).replaceAll('\\', '/')}';`).join('\n'))
  await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { animation: entry }, output: { entryFileNames: '[name].mjs' } } } })
  const api = await import(pathToFileURL(join(out, 'build', 'animation.mjs')).href)

  await check('easing curves start at 0, end at 1 and have their textbook midpoints', () => {
    for (const [name, ease] of Object.entries(api.EASINGS)) {
      assert.ok(Math.abs(ease(0)) < 1e-9, `${name}(0) = ${ease(0)}`)
      assert.ok(Math.abs(ease(1) - 1) < 1e-9, `${name}(1) = ${ease(1)}`)
    }
    assert.equal(Object.keys(api.EASINGS).length, 31)
    assert.ok(Math.abs(api.EASINGS.quad_in(0.5) - 0.25) < 1e-12)
    assert.ok(Math.abs(api.EASINGS.cubic_out(0.5) - 0.875) < 1e-12)
    assert.ok(Math.abs(api.EASINGS.sine_in_out(0.5) - 0.5) < 1e-12)
    assert.ok(api.EASINGS.back_out(0.5) > 1, 'back_out overshoots')
    assert.ok(Math.abs(api.EASINGS.bounce_out(1 / 2.75) - 1) < 1e-12, 'bounce_out touches 1 at the first bounce')
    assert.equal(api.easingFunction('EaseOutQuad'), api.EASINGS.quad_out)
    assert.equal(api.easingFunction('ease-in-out-cubic'), api.EASINGS.cubic_in_out)
    assert.equal(api.easingFunction('nonsense'), api.EASINGS.linear)
    assert.equal(api.tweenProperty('Transform.position.x'), 'x')
    assert.equal(api.tweenProperty('alpha'), 'opacity')
  })

  await check('tweens: eased progress, relative targets, delay, yoyo loops, replacement, stop and one finish each', () => {
    const owner = new api.TweenOwner()
    const entity = new api.BoxEntity(1, { x: 0, y: 0 }, { x: 1, y: 1 })
    const finished = []
    const step = seconds => owner.update(seconds, () => true, (target, property, signal) => finished.push([property, signal]))
    assert.ok(owner.start(entity, { property: 'x', to: 4, seconds: 1, easing: 'quad_in' }))
    step(0.5)
    assert.ok(Math.abs(entity.transform.position.x - 1) < 1e-9, `quad_in at half time: ${entity.transform.position.x}`)
    step(0.5)
    assert.equal(entity.transform.position.x, 4)
    assert.deepEqual(finished, [['x', '']])
    owner.start(entity, { property: 'y', to: 2, seconds: 0.5, relative: true, delay: 0.25, signal: 'moved' })
    step(0.25); assert.equal(entity.transform.position.y, 0, 'still waiting for the delay')
    step(0.5); assert.equal(entity.transform.position.y, 2)
    assert.deepEqual(finished.at(-1), ['y', 'moved'])
    owner.start(entity, { property: 'rotation_degrees', to: 90, seconds: 1, loops: 1, yoyo: true })
    step(1); assert.ok(Math.abs(entity.transform.rotation - Math.PI / 2) < 1e-9, 'first play reaches 90°')
    step(0.5); assert.ok(Math.abs(entity.transform.rotation - Math.PI / 4) < 1e-9, 'yoyo comes back')
    step(0.5); assert.ok(Math.abs(entity.transform.rotation) < 1e-9, 'and ends where it started')
    owner.start(entity, { property: 'scale', to: 2, seconds: 1 })
    owner.start(entity, { property: 'scale', to: 3, seconds: 1 })
    assert.equal(owner.size, 1, 'a new tween of the same property replaces the old one')
    owner.start(entity, { property: 'x', to: 0, seconds: 1, loops: -1 })
    step(10); assert.equal(owner.size, 1, 'an endless tween keeps running')
    assert.equal(owner.stop(entity), 1)
    assert.equal(owner.size, 0)
    assert.equal(owner.start(entity, { property: 'color', to: 1, seconds: 1 }), false, 'unknown properties are refused')
    assert.deepEqual(finished.map(([property]) => property), ['x', 'y', 'rotation_degrees', 'scale'], 'each tween finished once (the replaced scale tween only once)')
  })

  await check('controller documents keep Any State transitions and states resolve by id or name', () => {
    const controller = api.normalizeAnimatorController({ states: [{ id: 'idle', name: 'Idle' }, { id: 'run', name: 'Run' }], transitions: [{ id: 't', from: api.ANY_STATE, to: 'run', conditions: [] }, { id: 'u', from: 'missing', to: 'run' }] })
    assert.deepEqual(controller.transitions.map(transition => transition.from), [api.ANY_STATE])
    assert.equal(api.findAnimatorState(controller, 'Run')?.id, 'run')
    assert.equal(api.findAnimatorState(controller, 'run')?.id, 'run')
    assert.equal(api.findAnimatorState(controller, 'IDLE')?.id, 'idle')
  })

  await api.initWasm({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  globalThis.window = Object.assign(new EventTarget(), { performance: globalThis.performance })
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
  globalThis.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail } }
  api.scriptProjectSettings.debuggerEnabled = false; api.scriptProjectSettings.testing.coverageEnabled = false
  const world = api.physicsState.world
  world.runtime = new api.WasmRuntimeWorld(); world.wasmLoaded = true
  const runtime = api.gameplayRuntime
  const clip = (uuid, name, seconds) => ({ uuid, name, path: `Assets/Animations/${name}.anim`, assetType: 'animation', source: JSON.stringify({ version: 4, name, loop: true, frameRate: 12, playbackSpeed: 1, spriteFrames: [], events: [], markers: [], commandTracks: [], tracks: [{ property: 'Transform.scale.y', targetEntityUuid: null, keyframes: [{ time: 0, value: 1, tangentMode: 'Linear', inTangent: 0, outTangent: 0 }, { time: seconds, value: 1, tangentMode: 'Linear', inTangent: 0, outTangent: 0 }] }] }) })
  const controller = { uuid: 'hero-controller', name: 'Hero', path: 'Assets/Controllers/Hero.controller', assetType: 'controller', source: JSON.stringify({
    version: 3, name: 'Hero', defaultState: 'idle',
    parameters: [{ name: 'jump', type: 'Trigger', defaultValue: false }],
    states: [{ id: 'idle', name: 'Idle', clipAsset: 'clip-idle' }, { id: 'run', name: 'Run', clipAsset: 'clip-run' }, { id: 'jump', name: 'Jump', clipAsset: 'clip-jump' }],
    transitions: [
      { id: 'any-jump', from: api.ANY_STATE, to: 'jump', hasExitTime: false, duration: 0.1, conditions: [{ parameter: 'jump', operator: 'trigger', value: true }] },
      { id: 'jump-run', from: 'jump', to: 'run', hasExitTime: true, exitTime: 1, duration: 0.1, conditions: [] }
    ],
    layers: []
  }) }
  const source = `@export let states = "";
@export let entered = 0;
@export let exited = 0;
@export let finished = 0;
@export let blending = false;
@export let elapsed = 0.0;
@export let last_state = "";
@export let x_at_finish = -1.0;
fn start() { animator_play("Run"); tween("x", 3.0, 0.5, "quad_out"); }
fn update(dt) {
  elapsed += dt;
  let state = animator_state();
  if state != last_state { states += state + ","; last_state = state; }
  if animator_in_transition() { blending = true; }
  if elapsed > 0.6 && elapsed - dt <= 0.6 { animator_trigger("jump"); }
  if elapsed > 1.6 && elapsed - dt <= 1.6 { animator_crossfade("Idle", 0.3); }
}
fn on_signal(name, payload, source) {
  if name == "animator.state_entered" { entered += 1; }
  if name == "animator.state_exited" { exited += 1; }
  if name == "tween.finished" { finished += 1; x_at_finish = transform().position_x; }
}`
  const script = { uuid: 'animation-probe', name: 'AnimationProbe', path: 'Assets/AnimationProbe.rhai', assetType: 'script', source, script: api.defaultScriptMetadata() }
  const dropSource = `@export let dropped = false;
@export let elapsed = 0.0;
@export let on_one_way = false;
fn fixed_update(dt) {
  elapsed += dt;
  if character_is_on_floor() && character_floor_is_one_way() { on_one_way = true; }
  if !dropped && elapsed > 0.5 && character_floor_is_one_way() { character_drop_through(); dropped = true; }
  move_character(0.0, -6.0 * dt);
}`
  const dropScript = { uuid: 'drop-probe', name: 'DropProbe', path: 'Assets/DropProbe.rhai', assetType: 'script', source: dropSource, script: api.defaultScriptMetadata() }
  api.assetState.records.splice(0, api.assetState.records.length, script, dropScript, controller, clip('clip-idle', 'Idle', 0.5), clip('clip-run', 'Run', 0.4), clip('clip-jump', 'Jump', 0.5)); api.assetState.generation++
  let id = 2000
  const box = (name, x, y, width, height, type) => { const entity = new api.BoxEntity(id++, { x, y }, { x: width, y: height }); entity.name = name; entity.rigidBody.bodyType = type; return entity }

  await check('Animator: play by name, Any State trigger, exit-time return, crossfade, state signals and script reads', () => {
    const hero = box('Hero', 0, 0, 1, 1, 'Kinematic')
    const animator = hero.addComponent(new api.Animator()); animator.controllerAsset = controller.uuid
    const behaviour = hero.addComponent(new api.Script2D()); behaviour.scriptAsset = script.uuid
    world.entities.splice(0, world.entities.length, hero)
    api.physicsState.playMode = 'playing'
    runtime.beginSession()
    for (let index = 0; index < 60 * 2.4; index++) runtime.frame(1 / 60)
    const properties = { ...hero.script2D.properties }
    runtime.stopSession(false)
    assert.equal(hero.script2D.lastError ?? null, null, `script error: ${hero.script2D.lastError}`)
    observations.animator = properties
    // start() plays Run before the first animation update, so the animator starts in Run instead of the default Idle.
    assert.equal(properties.states, 'Run,Jump,Run,Idle,', `state sequence ${properties.states}`)
    assert.equal(properties.blending, true, 'a transition or crossfade was seen in progress')
    assert.equal(Number(properties.entered), 4, `entered ${properties.entered}`)
    assert.equal(Number(properties.exited), Number(properties.entered) - 1, 'every state but the first was left once')
    assert.equal(Number(properties.finished), 1, 'tween.finished arrived once')
    assert.ok(Math.abs(Number(properties.x_at_finish) - 3) < 1e-6, `x at the end of the tween: ${properties.x_at_finish}`)
  })

  await check('Character: script drop-through passes a one-way platform and lands on the ground below', () => {
    const player = box('Player', 0, 1.05, 1, 1, 'Kinematic')
    player.addComponent(new api.CharacterBody2D())
    const behaviour = player.addComponent(new api.Script2D()); behaviour.scriptAsset = dropScript.uuid
    const platform = box('Ledge', 0, 0, 4, 0.2, 'Static'); platform.collider.oneWay = true; platform.collider.oneWayNormal = { x: 0, y: 1 }
    const ground = box('Ground', 0, -4, 10, 1, 'Static')
    world.entities.splice(0, world.entities.length, ground, platform, player)
    api.physicsState.playMode = 'playing'
    runtime.beginSession()
    const heights = []
    for (let index = 0; index < 60 * 2.5; index++) { runtime.frame(1 / 60); heights.push(player.transform.position.y) }
    const properties = { ...player.script2D.properties }
    runtime.stopSession(false)
    assert.equal(player.script2D.lastError ?? null, null, `script error: ${player.script2D.lastError}`)
    observations.drop = { properties, before: heights[25], end: heights.at(-1) }
    assert.equal(properties.on_one_way, true, 'the script saw the one-way floor')
    assert.ok(Math.abs(heights[25] - 0.6) < 0.05, `stood on the ledge before dropping: ${heights[25]}`)
    assert.ok(Math.abs(heights.at(-1) - -3) < 0.05, `landed on the ground: ${heights.at(-1)}`)
  })
} finally {
  await rm(out, { recursive: true, force: true })
}
await mkdir(join(root, '.cache', 'verify'), { recursive: true })
await writeFile(join(root, '.cache', 'verify', 'animation-2644.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, observations }, null, 2))
const failed = results.filter(item => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
