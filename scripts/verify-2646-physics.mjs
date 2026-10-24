/** 26.46 physics and effects checks in the real GameplayRuntime with the Rust solver (WASM): joint servos hold
 * a revolute arm at a target angle against gravity and move a prismatic slider to a distance, scripts retarget and
 * release them; explode() pushes nearby bodies away with distance falloff and leaves far bodies and the caller
 * alone; script post-processing values tween, pulse and reset on top of the project settings.
 *
 * Usage: node scripts/verify-2646-physics.mjs (needs nova_core/pkg built from this source).
 * Results: .cache/verify/physics-2646.json */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'

const root = process.cwd()
const out = await mkdtemp(join(tmpdir(), 'nova-physics-2646-'))
const results = []
const observations = {}
const only = process.env.NOVA_VERIFY_ONLY ? new RegExp(process.env.NOVA_VERIFY_ONLY) : null
const check = async (name, run) => { if (only && !only.test(name)) return; try { await run(); results.push({ name, ok: true }); console.log('PASS', name) } catch (error) { results.push({ name, ok: false, error: String(error?.stack ?? error) }); console.log('FAIL', name, '\n   ', String(error?.message ?? error)) } }
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
    'src/world/components.ts': 'Script2D, Joint2D',
    'src/world/hierarchy.ts': 'worldTransform',
    'src/runtime/jointServo.ts': 'wrapAngle',
    'src/renderer/postProcessOverrides.ts': 'applyScriptPostValues, setScriptPostValue, pulseScriptPostValue, clearScriptPostValues',
    'src/renderer/runtimeRenderingPolicyOwner.ts': 'RuntimeRenderingPolicyOwner, createInitialRuntimeRenderingPolicyState',
    'nova_core/pkg/nova_core.js': 'default as initWasm, WasmRuntimeWorld'
  }
  const entry = join(out, 'entry.ts')
  await writeFile(entry, Object.entries(entries).map(([path, names]) => `export { ${names} } from '${join(root, path).replaceAll('\\', '/')}';`).join('\n'))
  await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { physics: entry }, output: { entryFileNames: '[name].mjs' } } } })
  const api = await import(pathToFileURL(join(out, 'build', 'physics.mjs')).href)

  globalThis.window = Object.assign(new EventTarget(), { performance: globalThis.performance, setTimeout, clearTimeout })
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
  globalThis.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail } }
  await api.initWasm({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  const world = api.physicsState.world
  world.runtime = new api.WasmRuntimeWorld(); world.wasmLoaded = true
  const runtime = api.gameplayRuntime
  let nextId = 7000
  const box = (x, y, w, h, name = 'Box', type = 'Dynamic') => { const entity = new api.BoxEntity(nextId++, { x, y }, { x: w, y: h }); entity.name = name; entity.rigidBody.bodyType = type; return entity }
  const scripts = []
  const addScript = (entity, name, source) => {
    const asset = { uuid: `script-${name}`, name, path: `Assets/Scripts/${name}.rhai`, assetType: 'script', source, script: { ...api.defaultScriptMetadata() } }
    scripts.push(asset)
    const component = entity.addComponent(new api.Script2D()); component.scriptAsset = asset.uuid
    return component
  }
  const pose = entity => { const transform = api.worldTransform(entity, world.entities); return { x: transform.position.x, y: transform.position.y, angle: transform.rotation } }
  const play = (entities, frames, during) => {
    runtime.stopSession(false)
    api.assetState.records.splice(0, api.assetState.records.length, ...scripts); api.assetState.generation++
    world.entities.splice(0, world.entities.length, ...entities)
    api.physicsState.playMode = 'playing'
    runtime.beginSession()
    for (let frame = 1; frame <= frames; frame++) { runtime.frame(1 / 60); during?.(frame) }
  }
  const stop = () => { runtime.stopSession(false); scripts.length = 0 }
  const degrees = radians => radians * 180 / Math.PI

  /** A 2-unit arm on a static pivot: the revolute joint sits on the pivot and connects the arm's left end, so
   * the joint angle is the arm's angle (the connected body relative to the joint's owner, like the limits). */
  const arm = () => {
    const pivot = box(0, 3, .3, .3, 'Pivot', 'Static')
    const beam = box(1, 3, 2, .2, 'Arm'); beam.rigidBody.density = 2
    const joint = pivot.addComponent(new api.Joint2D('RevoluteJoint2D'))
    joint.targetEntityUuid = beam.uuid; joint.anchor = { x: 0, y: 0 }; joint.connectedAnchor = { x: -1, y: 0 }; joint.maxMotorForce = 400
    return { pivot, beam, joint }
  }

  await check('a revolute servo holds an arm at its target angle against gravity, and lets go when switched off', () => {
    const { pivot, beam, joint } = arm()
    joint.servoEnabled = true; joint.servoTarget = 60
    let held = null
    play([pivot, beam], 300, frame => { if (frame === 180) held = pose(beam) })
    const settled = pose(beam)
    observations.revolute = { held: degrees(held.angle), settled: degrees(settled.angle), motorSpeed: joint.motorSpeed }
    assert.ok(Math.abs(degrees(settled.angle) - 60) < 3, `at 60°: ${degrees(settled.angle)}`)
    assert.ok(Math.abs(degrees(held.angle) - degrees(settled.angle)) < 1.5, 'it holds still')
    joint.servoEnabled = false; joint.motorEnabled = false
    // Released, it swings like a pendulum: down through −90° (hanging) towards the far side.
    let lowest = Infinity
    for (let frame = 0; frame < 120; frame++) { runtime.frame(1 / 60); const y = pose(beam).y; if (y < lowest) lowest = y }
    observations.revolute.lowestCentreY = lowest
    assert.ok(lowest < 2.2, `released, the arm swings down below the pivot: centre y ${lowest}`)
    stop()
  })

  await check('a script retargets the servo (joint_servo) and a weak motor lags behind a strong one', () => {
    const strong = arm()
    addScript(strong.pivot, 'Servo', '@export let time = 0.0;\nfn update(dt) {\n    time += dt;\n    if time < 1.5 { joint_servo(-30.0); } else { joint_servo(90.0); }\n}\n')
    let first = null
    play([strong.pivot, strong.beam], 330, frame => { if (frame === 85) first = pose(strong.beam) })
    const second = pose(strong.beam)
    assert.equal(strong.pivot.script2D.lastError ?? null, null, `script error: ${strong.pivot.script2D.lastError}`)
    observations.scripted = { first: degrees(first.angle), second: degrees(second.angle) }
    assert.ok(Math.abs(degrees(first.angle) + 30) < 4, `first −30°: ${degrees(first.angle)}`)
    assert.ok(Math.abs(degrees(second.angle) - 90) < 4, `then 90°: ${degrees(second.angle)}`)
    stop()
    const weak = arm(); weak.joint.maxMotorForce = 2; weak.joint.servoEnabled = true; weak.joint.servoTarget = 60
    play([weak.pivot, weak.beam], 240)
    observations.weak = degrees(pose(weak.beam).angle)
    assert.ok(degrees(pose(weak.beam).angle) < 30, `a 2 N·m motor cannot lift the arm: ${observations.weak}`)
    stop()
  })

  await check('a prismatic servo slides to its target distance along the axis', () => {
    const rail = box(0, 1, .3, .3, 'Rail', 'Static')
    const slider = box(0, 1, .6, .6, 'Slider')
    const joint = rail.addComponent(new api.Joint2D('PrismaticJoint2D'))
    joint.targetEntityUuid = slider.uuid; joint.axis = { x: 1, y: 0 }; joint.maxMotorForce = 300
    joint.servoEnabled = true; joint.servoTarget = 2.5
    play([rail, slider], 240)
    const at = pose(slider)
    observations.prismatic = at
    assert.ok(Math.abs(at.x - 2.5) < 0.08, `slid to 2.5: ${at.x}`)
    assert.ok(Math.abs(at.y - 1) < 0.05, `stays on its axis: ${at.y}`)
    stop()
  })

  await check('explode() pushes nearby bodies away with falloff; far bodies and the caller stay put', () => {
    const ground = box(0, -.5, 60, 1, 'Ground', 'Static')
    const bomb = box(0, .5, .5, .5, 'Bomb')
    addScript(bomb, 'Bomb', '@export let done = false;\nfn update(dt) {\n    if !done { done = true; explode(0.0, 0.5, 6.0, 40.0); }\n}\n')
    const near = box(1.5, .5, 1, 1, 'Near'), mid = box(-4, .5, 1, 1, 'Mid'), far = box(9, .5, 1, 1, 'Far')
    let speeds = null
    play([ground, bomb, near, mid, far], 3, frame => { if (frame === 2) speeds = { near: near.velocity.x, mid: mid.velocity.x, far: far.velocity.x, bomb: Math.hypot(bomb.velocity.x, bomb.velocity.y) } })
    observations.explosion = speeds
    assert.equal(bomb.script2D.lastError ?? null, null, `script error: ${bomb.script2D.lastError}`)
    assert.ok(speeds.near > 10, `near pushed right: ${speeds.near}`)
    assert.ok(speeds.mid < -2 && Math.abs(speeds.mid) < speeds.near, `mid pushed left, less: ${speeds.mid}`)
    assert.ok(Math.abs(speeds.far) < .01, `far untouched: ${speeds.far}`)
    assert.ok(speeds.bomb < .5, `the caller is left out: ${speeds.bomb}`)
    stop()
  })

  await check('script post-processing tweens, pulses and resets on top of the project values', () => {
    const owner = new api.RuntimeRenderingPolicyOwner(api.createInitialRuntimeRenderingPolicyState())
    const base = { ...owner.updateActivePostProcess() }
    api.setScriptPostValue('vignette', .8, 1, 100)
    const half = api.applyScriptPostValues(base, 100.5), done = api.applyScriptPostValues(base, 101.2)
    assert.ok(Math.abs(half.vignette - (base.vignette + .8) / 2) < 1e-9, `half-way: ${half.vignette}`)
    assert.equal(done.vignette, .8)
    api.pulseScriptPostValue('bloom', 1, .5, 100)
    const pulse = api.applyScriptPostValues(base, 100), later = api.applyScriptPostValues(base, 100.25), gone = api.applyScriptPostValues(base, 100.6)
    assert.ok(Math.abs(pulse.bloom - Math.min(2, base.bloom + 1)) < 1e-9 && later.bloom < pulse.bloom && gone.bloom === base.bloom, JSON.stringify({ pulse: pulse.bloom, later: later.bloom, gone: gone.bloom }))
    api.setScriptPostValue('exposure', 99, 0, 100)
    assert.equal(api.applyScriptPostValues(base, 100).exposure, 8, 'clamped to the range')
    const live = owner.updateActivePostProcess()
    assert.equal(live.exposure, 8, 'the policy owner applies the overrides')
    api.clearScriptPostValues()
    // A script that sets the same tween every frame keeps it running; a new target starts from the value shown.
    api.setScriptPostValue('contrast', 3, 1, 200)
    const quarter = api.applyScriptPostValues(base, 200.5).contrast
    api.setScriptPostValue('contrast', 3, 1, 200.5)
    assert.equal(api.applyScriptPostValues(base, 201).contrast, 3, 'the repeated call did not restart the tween')
    api.setScriptPostValue('contrast', 1, 1, 201)
    assert.ok(Math.abs(api.applyScriptPostValues(base, 201.5).contrast - 2) < 1e-9, `a retarget starts where the tween is (${quarter})`)
    api.clearScriptPostValues()
    assert.deepEqual({ ...owner.updateActivePostProcess() }, base, 'reset restores the project values')
    observations.post = { base, half: half.vignette, pulse: pulse.bloom, later: later.bloom }
  })

  await check('scripts drive post_set / post_pulse during play and Stop clears them', () => {
    const owner = new api.RuntimeRenderingPolicyOwner(api.createInitialRuntimeRenderingPolicyState())
    const base = { ...owner.updateActivePostProcess() }
    const lamp = box(0, 0, 1, 1, 'Lamp', 'Static')
    addScript(lamp, 'Post', 'fn update(dt) {\n    post_set("saturation", 0.2);\n}\n')
    play([lamp], 5)
    assert.equal(lamp.script2D.lastError ?? null, null, `script error: ${lamp.script2D.lastError}`)
    assert.equal(owner.updateActivePostProcess().saturation, .2)
    stop()
    assert.equal(owner.updateActivePostProcess().saturation, base.saturation, 'Stop clears script values')
  })

  await check('angles wrap to (−180°, 180°] so a servo turns the short way', () => {
    assert.ok(Math.abs(api.wrapAngle(Math.PI * 1.5) + Math.PI / 2) < 1e-12)
    assert.ok(Math.abs(api.wrapAngle(-Math.PI * 1.75) - Math.PI / 4) < 1e-12)
  })
} finally {
  await mkdir(join(root, '.cache', 'verify'), { recursive: true })
  await writeFile(join(root, '.cache', 'verify', 'physics-2646.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), results, observations }, null, 2)}\n`)
  await rm(out, { recursive: true, force: true })
}
const failed = results.filter(result => !result.ok)
console.log(`${results.length - failed.length}/${results.length} physics checks passed`)
if (failed.length) process.exit(1)
