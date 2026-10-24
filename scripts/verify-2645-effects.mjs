/** 26.45 effects checks in the real GameplayRuntime (WASM): camera shake (trauma model: bounded,
 * smooth, calms down; reduced motion keeps a quarter), camera zoom and follow from scripts, the screen
 * flash, particles that collide through the physics world (fast particles do not pass through a thin
 * floor) and sub-emitters.
 *
 * Usage: node scripts/verify-2645-effects.mjs (needs nova_core/pkg built from this source).
 * Results: .cache/verify/effects-2645.json */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'

const root = process.cwd()
const out = await mkdtemp(join(tmpdir(), 'nova-effects-2645-'))
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
    'src/world/components.ts': 'Script2D, Camera2D, ParticleEmitter2D',
    'src/renderer/sceneRenderer.ts': 'cameraShakeOffset, activeGameCameras',
    'nova_core/pkg/nova_core.js': 'default as initWasm, WasmRuntimeWorld'
  }
  const entry = join(out, 'entry.ts')
  await writeFile(entry, Object.entries(entries).map(([path, names]) => `export { ${names} } from '${join(root, path).replaceAll('\\', '/')}';`).join('\n'))
  await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { effects: entry }, output: { entryFileNames: '[name].mjs' } } } })
  const api = await import(pathToFileURL(join(out, 'build', 'effects.mjs')).href)

  await check('camera shake is bounded by trauma², smooth, and nothing without trauma', () => {
    const camera = new api.Camera2D()
    assert.deepEqual(api.cameraShakeOffset(camera, 1 / 60), { x: 0, y: 0, rotation: 0 })
    camera.trauma = 1
    let previous = api.cameraShakeOffset(camera, 1 / 60), largest = 0, largestStep = 0
    for (let frame = 0; frame < 240; frame++) {
      const offset = api.cameraShakeOffset(camera, 1 / 60)
      largest = Math.max(largest, Math.hypot(offset.x, offset.y)); largestStep = Math.max(largestStep, Math.hypot(offset.x - previous.x, offset.y - previous.y))
      assert.ok(Math.abs(offset.x) <= camera.shake.maxOffset + 1e-12 && Math.abs(offset.rotation) <= camera.shake.maxAngle * Math.PI / 180 + 1e-12)
      previous = offset
    }
    assert.ok(largest > camera.shake.maxOffset * .3, `it shakes: ${largest}`)
    // Smooth noise: four times the frame rate, about a quarter of the largest step between frames.
    const fine = new api.Camera2D(); fine.trauma = 1
    let finePrevious = api.cameraShakeOffset(fine, 1 / 240), fineStep = 0
    for (let frame = 0; frame < 960; frame++) { const offset = api.cameraShakeOffset(fine, 1 / 240); fineStep = Math.max(fineStep, Math.hypot(offset.x - finePrevious.x, offset.y - finePrevious.y)); finePrevious = offset }
    assert.ok(fineStep < largestStep * .4, `smoothly (largest step ${largestStep} at 60 Hz, ${fineStep} at 240 Hz)`)
    camera.trauma = .5
    const half = api.cameraShakeOffset(camera, 0)
    assert.ok(Math.hypot(half.x, half.y) <= camera.shake.maxOffset * .25 * Math.SQRT2 + 1e-12, 'half the trauma, a quarter of the shake')
    observations.shake = { largest, largestStep, fineStep }
  })

  globalThis.window = Object.assign(new EventTarget(), { performance: globalThis.performance, setTimeout, clearTimeout })
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
  globalThis.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail } }
  await api.initWasm({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  const world = api.physicsState.world
  world.runtime = new api.WasmRuntimeWorld(); world.wasmLoaded = true
  const runtime = api.gameplayRuntime
  let nextId = 7000
  const scripted = (name, source) => {
    const asset = { uuid: `script-${name}`, name, path: `Assets/Scripts/${name}.rhai`, assetType: 'script', source, script: { ...api.defaultScriptMetadata() } }
    api.assetState.records.splice(0, api.assetState.records.length, asset); api.assetState.generation++
    return asset
  }
  const cameraEntity = () => { const entity = new api.BoxEntity(nextId++, { x: 0, y: 0 }, { x: 1, y: 1 }); entity.name = 'Camera'; entity.rigidBody.bodyType = 'Kinematic'; entity.collider.enabled = false; entity.addComponent(new api.Camera2D()); return entity }

  await check('scripts shake, zoom and point the camera; trauma calms down; the screen flash fades', () => {
    const camera = cameraEntity()
    const target = new api.BoxEntity(nextId++, { x: 5, y: 2 }, { x: 1, y: 1 }); target.name = 'Hero'; target.rigidBody.bodyType = 'Kinematic'
    const director = new api.BoxEntity(nextId++, { x: 0, y: 0 }, { x: 1, y: 1 }); director.name = 'Director'; director.rigidBody.bodyType = 'Kinematic'
    const asset = scripted('Director', 'fn start() {\n    camera_shake(0.8);\n    camera_zoom(2.0);\n    camera_follow(find_entity_handle("Hero"));\n    screen_flash(255.0, 0.0, 0.0, 0.5);\n}\n')
    director.addComponent(new api.Script2D()).scriptAsset = asset.uuid
    world.entities.splice(0, world.entities.length, camera, target, director)
    api.physicsState.playMode = 'playing'
    runtime.beginSession()
    runtime.frame(1 / 60)
    assert.equal(director.script2D.lastError ?? null, null, `script error: ${director.script2D.lastError}`)
    const component = camera.camera2D
    assert.ok(component.trauma > .7 && component.trauma < .8, `trauma ${component.trauma}`)
    assert.equal(component.zoom, 2)
    assert.equal(component.followTargetUuid, target.uuid)
    const flash = runtime.screenFlashOverlay()
    assert.ok(flash && flash.r === 255 && flash.alpha > .7, `flash ${JSON.stringify(flash)}`)
    for (let frame = 0; frame < 20; frame++) runtime.frame(1 / 60)
    assert.ok(runtime.screenFlashOverlay().alpha < flash.alpha, 'the flash fades')
    for (let frame = 0; frame < 40; frame++) runtime.frame(1 / 60)
    assert.equal(runtime.screenFlashOverlay(), null, 'and is gone after its time')
    assert.equal(component.trauma, 0, 'trauma 0.8 recovers within a second at 1.5/s')
    const view = api.activeGameCameras(world.entities, 800, 600, 1 / 60)[0].view
    observations.camera = { position: view.position, zoom: component.zoom, follow: component.followTargetUuid === target.uuid }
    runtime.stopSession(false)
  })

  await check('reduced motion keeps a quarter of the shake and shows no flash', () => {
    const camera = cameraEntity()
    const director = new api.BoxEntity(nextId++, { x: 0, y: 0 }, { x: 1, y: 1 }); director.name = 'Director'; director.rigidBody.bodyType = 'Kinematic'
    const asset = scripted('Calm', 'fn start() {\n    camera_shake(0.8);\n    screen_flash(255.0, 255.0, 255.0, 0.5);\n}\n')
    director.addComponent(new api.Script2D()).scriptAsset = asset.uuid
    world.entities.splice(0, world.entities.length, camera, director)
    runtime.presentation.state.accessibility.reducedMotion = true
    try {
      api.physicsState.playMode = 'playing'
      runtime.beginSession()
      runtime.frame(1 / 60)
      assert.ok(camera.camera2D.trauma > .15 && camera.camera2D.trauma < .2, `quarter: ${camera.camera2D.trauma}`)
      assert.equal(runtime.screenFlashOverlay(), null)
      runtime.stopSession(false)
    } finally { runtime.presentation.state.accessibility.reducedMotion = false }
  })

  await check('fast particles bounce off a thin floor through the physics world; sub-emitters fire', () => {
    const floor = new api.BoxEntity(nextId++, { x: 0, y: 0 }, { x: 40, y: .1 }); floor.name = 'Floor'; floor.rigidBody.bodyType = 'Static'
    const source = new api.BoxEntity(nextId++, { x: 0, y: 3 }, { x: .2, y: .2 }); source.name = 'Sparks'; source.rigidBody.bodyType = 'Kinematic'; source.collider.enabled = false
    const emitter = source.addComponent(new api.ParticleEmitter2D())
    Object.assign(emitter, { emissionRate: 0, burst: 40, looping: false, lifetime: 1.2, initialVelocityMin: { x: -2, y: -60 }, initialVelocityMax: { x: 2, y: -50 }, gravity: { x: 0, y: 0 }, collisionMode: 'Bounce', collisionRestitution: .5, worldSpace: true })
    const puff = new api.BoxEntity(nextId++, { x: 0, y: 10 }, { x: .2, y: .2 }); puff.name = 'Puff'; puff.rigidBody.bodyType = 'Kinematic'; puff.collider.enabled = false
    const child = puff.addComponent(new api.ParticleEmitter2D())
    Object.assign(child, { emissionRate: 0, burst: 0, autoplay: false, lifetime: .2, worldSpace: true })
    emitter.subEmitterUuid = child.uuid; emitter.subEmitterCount = 2
    world.entities.splice(0, world.entities.length, floor, source, puff)
    api.physicsState.playMode = 'playing'
    runtime.beginSession()
    let lowest = Infinity, collisions = 0, subemissions = 0
    for (let frame = 0; frame < 90; frame++) {
      runtime.frame(1 / 60)
      const state = runtime.particles.states.get(emitter.uuid)
      for (const particle of state?.particles ?? []) lowest = Math.min(lowest, particle.position.y)
      collisions += runtime.particles.diagnostics.collisions; subemissions += runtime.particles.diagnostics.subemissions
    }
    observations.particles = { lowest, collisions, subemissions }
    assert.ok(collisions >= 40, `every particle hit the floor: ${collisions}`)
    assert.ok(lowest > 0.04, `none passed through the 0.1-thick floor (lowest y ${lowest})`)
    assert.ok(subemissions > 0, 'expired particles started the sub-emitter')
    runtime.stopSession(false)
  })
} catch (error) {
  results.push({ name: 'setup', ok: false, error: String(error?.stack ?? error) }); console.log('FAIL setup\n   ', String(error?.stack ?? error))
} finally {
  await rm(out, { recursive: true, force: true })
}
await mkdir(join(root, '.cache', 'verify'), { recursive: true })
await writeFile(join(root, '.cache', 'verify', 'effects-2645.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, observations }, null, 2))
const passed = results.filter(result => result.ok).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exitCode = passed === results.length ? 0 : 1
