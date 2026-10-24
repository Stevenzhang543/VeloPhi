/** 26.45 physics checks in the real GameplayRuntime with the Rust solver (WASM): capsules, dynamic
 * concave polygons, wheel joints driving a car, the target joint moved by a script command, conveyor
 * surfaces set by a script, Archimedes buoyancy (a box floats half under, a plank rights itself),
 * snapshot determinism and the debugger's complete rewind (physics, script variables and timers).
 *
 * Usage: node scripts/verify-2645-physics.mjs (needs nova_core/pkg built from this source).
 * Results: .cache/verify/physics-2645.json */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'

const root = process.cwd()
const out = await mkdtemp(join(tmpdir(), 'nova-physics-2645-'))
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
    'src/world/CircleEntity.ts': 'CircleEntity',
    'src/world/components.ts': 'Script2D, Joint2D, TargetJoint2D, Area2D, AreaEffector2D',
    'src/world/hierarchy.ts': 'worldTransform',
    'src/runtime/physicsGeometry.ts': 'prepareColliderSet',
    'src/runtime/rewindState.ts': 'cloneRuntimeState',
    'src/runtime/areaPhysics.ts': 'clipConvex, submergedPart',
    'nova_core/pkg/nova_core.js': 'default as initWasm, WasmRuntimeWorld'
  }
  const entry = join(out, 'entry.ts')
  await writeFile(entry, Object.entries(entries).map(([path, names]) => `export { ${names} } from '${join(root, path).replaceAll('\\', '/')}';`).join('\n'))
  await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { physics: entry }, output: { entryFileNames: '[name].mjs' } } } })
  const api = await import(pathToFileURL(join(out, 'build', 'physics.mjs')).href)

  await check('clipping finds the submerged part of a body (area and centroid)', () => {
    const square = [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 }]
    const water = [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 0.25 }, { x: -10, y: 0.25 }]
    const part = api.submergedPart([square], water)
    assert.ok(Math.abs(part.area - 0.75) < 1e-12 && Math.abs(part.total - 1) < 1e-12, `three quarters under: ${part.area}`)
    assert.ok(Math.abs(part.centroid.y + 0.125) < 1e-12 && Math.abs(part.centroid.x) < 1e-12, `centroid of the part under: ${JSON.stringify(part.centroid)}`)
    const clockwise = api.clipConvex([...square].reverse(), [...water].reverse())
    assert.equal(clockwise.length, 4, 'orientation does not matter')
    const diamond = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]
    assert.ok(Math.abs(api.submergedPart([diamond], water.map(point => ({ x: point.x, y: Math.min(point.y, 0) }))).area - 1) < 1e-12, 'half a diamond')
    assert.equal(api.clipConvex(square, water.map(point => ({ x: point.x, y: point.y - 20 }))).length, 0, 'nothing above the water')
  })

  globalThis.window = Object.assign(new EventTarget(), { performance: globalThis.performance, setTimeout, clearTimeout })
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
  globalThis.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail } }
  await api.initWasm({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  const declarations = await readFile(join(root, 'nova_core/pkg/nova_core.d.ts'), 'utf8')
  for (const name of ['save_snapshot', 'restore_snapshot', 'set_body_target', 'set_body_surface']) assert.ok(declarations.includes(name), `nova_core/pkg exports ${name} (rebuild the WASM)`)
  observations.scriptInstanceSnapshots = declarations.includes('save_instances')
  const world = api.physicsState.world
  world.runtime = new api.WasmRuntimeWorld(); world.wasmLoaded = true
  const runtime = api.gameplayRuntime
  const settings = api.physicsState.globalSettings
  observations.gravity = settings.gravity
  let nextId = 5000
  const friction = (entity, value) => { entity.collider.material.staticFriction = value; entity.collider.material.dynamicFriction = value; return entity }
  const floor = (width = 80, y = 0) => { const entity = new api.BoxEntity(nextId++, { x: 0, y: y - 0.5 }, { x: width, y: 1 }); entity.name = 'Floor'; entity.rigidBody.bodyType = 'Static'; return friction(entity, 0.6) }
  const box = (x, y, w, h, name = 'Box') => { const entity = new api.BoxEntity(nextId++, { x, y }, { x: w, y: h }); entity.name = name; entity.rigidBody.bodyType = 'Dynamic'; return friction(entity, 0.6) }
  const scripts = []
  const addScript = (entity, name, source) => {
    const asset = { uuid: `script-${name}`, name, path: `Assets/Scripts/${name}.rhai`, assetType: 'script', source, script: { ...api.defaultScriptMetadata() } }
    scripts.push(asset)
    const component = entity.addComponent(new api.Script2D()); component.scriptAsset = asset.uuid
    return component
  }
  const pose = entity => { const transform = api.worldTransform(entity, world.entities); return { x: transform.position.x, y: transform.position.y, angle: transform.rotation } }
  /** Runs a scene for `frames` 60 Hz frames; `during(frame)` runs after each frame. */
  const play = (entities, frames, during) => {
    api.assetState.records.splice(0, api.assetState.records.length, ...scripts); api.assetState.generation++
    world.entities.splice(0, world.entities.length, ...entities)
    api.physicsState.playMode = 'playing'
    runtime.beginSession()
    for (let frame = 1; frame <= frames; frame++) { runtime.frame(1 / 60); during?.(frame) }
  }
  const stop = () => { runtime.stopSession(false); scripts.length = 0 }

  await check('a lying capsule rests flat on the floor with its rounded ends', () => {
    const capsule = box(0, 2, 2, 0.8, 'Capsule'); capsule.collider.shapeModel = 'Capsule'
    play([floor(), capsule], 150)
    const at = pose(capsule)
    observations.capsule = at
    assert.ok(Math.abs(at.y - 0.4) < 0.03, `rests at its half height: ${at.y}`)
    assert.ok(Math.abs(at.angle) < 0.02, `stays level: ${at.angle}`)
    stop()
  })

  await check('a dynamic concave L shape splits into two convex pieces and rests on its long side', () => {
    const shape = box(0, 3, 2, 2, 'L'); shape.collider.shapeModel = 'ConcavePolygon'
    shape.collider.vertices = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 1 }]
    const prepared = api.prepareColliderSet(shape.collider, true)
    assert.equal(prepared.blockedReason, null)
    assert.equal(prepared.shapes.length, 2, `pieces: ${prepared.shapes.length}`)
    play([floor(), shape], 180)
    const at = pose(shape)
    observations.concave = { pieces: prepared.shapes.length, ...at }
    assert.ok(Math.abs(at.y - 1) < 0.04 && Math.abs(at.angle) < 0.03, `rests on its long side: ${JSON.stringify(at)}`)
    stop()
  })

  const car = motorSpeed => {
    const chassis = box(0, 1.4, 3, 0.5, 'Chassis'); chassis.rigidBody.density = 4
    const wheels = [-1.2, 1.2].map((x, index) => {
      const wheel = friction(new api.CircleEntity(nextId++, { x, y: 0.45 }, 0.45), 1); wheel.name = `Wheel${index}`; wheel.rigidBody.bodyType = 'Dynamic'
      const joint = wheel.addComponent(new api.Joint2D('WheelJoint2D'))
      joint.targetEntityUuid = chassis.uuid; joint.connectedAnchor = { x, y: -0.95 }
      joint.limitsEnabled = true; joint.lowerLimit = -0.4; joint.upperLimit = 0.4
      joint.motorEnabled = motorSpeed !== 0; joint.motorSpeed = motorSpeed; joint.maxMotorForce = 40
      return wheel
    })
    return { chassis, wheels, entities: [friction(floor(400), 1), chassis, ...wheels] }
  }

  await check('wheel joints carry the chassis on springs and their motors drive the car', () => {
    const parked = car(0)
    play(parked.entities, 240)
    const rest = pose(parked.chassis)
    assert.ok(rest.y < 1.39 && rest.y > 1.0, `the springs carry the chassis a little lower: ${rest.y}`)
    assert.ok(Math.abs(rest.x) < 0.05 && Math.abs(rest.angle) < 0.02, `parked: ${JSON.stringify(rest)}`)
    stop()
    const driving = car(-12)
    play(driving.entities, 240)
    const moved = pose(driving.chassis)
    observations.car = { rest, moved }
    assert.ok(moved.x > 3, `the car drove right: ${moved.x}`)
    assert.ok(Math.abs(moved.angle) < 0.25, `and stays upright: ${moved.angle}`)
    stop()
  })

  await check('a script moves a target joint: the box is lifted and held, then released', () => {
    const lifted = box(0, 0.5, 1, 1, 'Lifted')
    addScript(lifted, 'Lift', '@export let time = 0.0;\nfn update(dt) {\n    time += dt;\n    if time < 2.0 { target_joint_move(0.0, 4.0); } else { target_joint_release(); }\n}\n')
    let held = null
    play([floor(), lifted], 300, frame => { if (frame === 110) held = pose(lifted) })
    const released = pose(lifted)
    observations.target = { held, released }
    assert.equal(lifted.script2D.lastError ?? null, null, `script error: ${lifted.script2D.lastError}`)
    assert.ok(lifted.getComponent('TargetJoint2D'), 'the first move added a target joint')
    assert.ok(Math.abs(held.y - 4) < 0.15 && Math.abs(held.x) < 0.05, `held at the target: ${JSON.stringify(held)}`)
    assert.ok(Math.abs(released.y - 0.5) < 0.05, `released, it falls back: ${released.y}`)
    stop()
  })

  await check('a conveyor surface set by a script carries a box at its speed', () => {
    const belt = floor(60); belt.name = 'Belt'
    addScript(belt, 'Belt', 'fn update(dt) {\n    set_surface_speed(2.0);\n}\n')
    const parcel = box(0, 0.5, 1, 1, 'Parcel')
    play([belt, parcel], 180)
    observations.conveyor = { vx: parcel.velocity.x, x: pose(parcel).x }
    assert.equal(belt.collider.surfaceSpeed, 2)
    assert.ok(Math.abs(parcel.velocity.x - 2) < 0.1, `moves with the belt: ${parcel.velocity.x}`)
    stop()
  })

  await check('a joint breaks above its force and tells the joined objects (joint.broken)', () => {
    const post = box(0, 4, .4, .4, 'Post'); post.rigidBody.bodyType = 'Static'
    const weight = box(1, 4, 1, 1, 'Weight'); weight.rigidBody.density = 5
    const joint = weight.addComponent(new api.Joint2D('WeldJoint2D'))
    joint.targetEntityUuid = post.uuid; joint.breakForce = 5
    addScript(weight, 'Breaker', '@export let broke = "";\nfn on_signal(signal, payload, source) {\n    if signal == "joint.broken" { broke = payload.kind; }\n}\n')
    play([floor(), post, weight], 60)
    observations.breaking = { broke: weight.script2D.properties.broke, y: pose(weight).y }
    assert.equal(weight.script2D.lastError ?? null, null, `script error: ${weight.script2D.lastError}`)
    assert.equal(weight.script2D.properties.broke, 'WeldJoint2D', 'the weight heard joint.broken')
    assert.ok(pose(weight).y < 1, `and fell once free: ${pose(weight).y}`)
    stop()
  })

  const water = () => {
    const pool = new api.BoxEntity(nextId++, { x: 0, y: -3 }, { x: 40, y: 6 }); pool.name = 'Water'
    pool.rigidBody.bodyType = 'Static'; pool.collider.sensor = true
    const area = pool.addComponent(new api.Area2D()); area.shape = 'Box'; area.size = { x: 40, y: 6 }
    const effector = pool.addComponent(new api.AreaEffector2D())
    effector.effectors = [{ id: 'water', kind: 'Buoyancy', enabled: true, direction: { x: 1, y: 0 }, strength: 0, drag: 1.5, fluidDensity: 1, damagePerSecond: 0, signal: '', angularDrag: 1 }]
    return pool
  }

  await check('buoyancy floats a half-density box half under the surface', () => {
    const floater = box(0, 2, 1, 1, 'Floater'); floater.rigidBody.density = 0.5
    play([floor(80, -8), water(), floater], 480)
    const at = pose(floater)
    observations.buoyancy = { ...at, vy: floater.velocity.y }
    assert.ok(Math.abs(at.y) < 0.06, `half under: centre at the surface (${at.y})`)
    assert.ok(Math.abs(floater.velocity.y) < 0.05, `settled: ${floater.velocity.y}`)
    stop()
  })

  await check('a floating plank rights itself (buoyancy acts at the submerged centre)', () => {
    const plank = box(0, 0.5, 3, 0.4, 'Plank'); plank.rigidBody.density = 0.5
    plank.transform.rotation = 0.7
    play([floor(80, -8), water(), plank], 600)
    const at = pose(plank)
    const tilt = Math.abs(Math.atan2(Math.sin(at.angle), Math.cos(at.angle)))
    observations.plank = { ...at, tilt }
    assert.ok(Math.min(tilt, Math.PI - tilt) < 0.08, `lies flat on the water: ${at.angle}`)
    stop()
  })

  const pile = () => {
    const entities = [floor(30)]
    for (let index = 0; index < 12; index++) entities.push(box((index % 4) - 1.5 + (index % 3) * 0.13, 1 + Math.floor(index / 4) * 1.3 + index * 0.05, 0.9, 0.9, `Pile${index}`))
    return entities
  }

  await check('a restored solver snapshot replays the same steps bit for bit', () => {
    play(pile(), 20)
    const solver = world.runtime
    const steps = solver.save_snapshot(77)
    assert.ok(steps > 0, 'the snapshot has a size')
    for (let index = 0; index < 90; index++) solver.single_step(9.80665, 0.01)
    const first = solver.state_checksum()
    assert.equal(solver.restore_snapshot(77), true)
    for (let index = 0; index < 90; index++) solver.single_step(9.80665, 0.01)
    assert.equal(solver.state_checksum(), first, 'identical after the restore')
    assert.equal(solver.restore_snapshot(78), false, 'an empty slot restores nothing')
    solver.clear_snapshots()
    observations.snapshotBytes = steps
    stop()
  })

  await check('the debugger rewinds exactly: continuing from a keyframe replays physics, script variables and timers', () => {
    assert.ok(observations.scriptInstanceSnapshots, 'nova_core/pkg exports save_instances (rebuild the WASM)')
    const entities = pile()
    const counter = entities[1]
    addScript(counter, 'Counter', '@export let ticks = 0;\n@export let rings = 0;\nlet hidden = 0;\nfn start() {\n    timer_start("ring", 0.25, true);\n}\nfn fixed_update(dt) {\n    hidden += 1;\n    ticks = hidden;\n}\nfn on_timer(name) {\n    rings += 1;\n}\n')
    runtime.setPhysicsRecording(true)
    play(entities, 90)
    assert.equal(counter.script2D.lastError ?? null, null, `script error: ${counter.script2D.lastError}`)
    const status = runtime.physicsRecordingStatus()
    assert.ok(status.keyframes > 0 && status.keyframeInterval >= 1, `keyframes: ${status.keyframes} every ${status.keyframeInterval}`)
    // The live end state after 90 frames (the reference timeline).
    const liveChecksum = world.runtime.state_checksum(), liveTicks = Number(counter.script2D.properties.ticks), liveRings = Number(counter.script2D.properties.rings)
    const livePoses = entities.slice(1).map(pose)
    // Scrub back 40 steps to the nearest keyframe and continue from there.
    api.physicsState.playMode = 'paused'
    const index = runtime.physicsRecordingKeyframe(status.frames - 41)
    assert.ok(index >= 0, 'a keyframe exists')
    const frame = runtime.physicsRecordingFrame(index)
    assert.equal(frame.keyframe, true)
    runtime.scrubPhysics(index)
    assert.ok(runtime.continuePhysicsFromScrub() > 0)
    assert.deepEqual(runtime.physicsRecordingLastContinue(), { exact: true, step: frame.step })
    const rewoundTicks = Number(counter.script2D.properties.ticks)
    assert.ok(rewoundTicks < liveTicks, `script variables went back: ${rewoundTicks} < ${liveTicks}`)
    // Play the same number of fixed steps again: everything must come out identical.
    api.physicsState.playMode = 'playing'
    const remaining = status.lastStep - frame.step
    for (let guard = 0; guard < remaining + 10 && runtime.physicsRecordingStatus().lastStep < status.lastStep; guard++) runtime.frame(1 / 60)
    assert.equal(runtime.physicsRecordingStatus().lastStep, status.lastStep, 'replayed to the same step')
    observations.rewind = { status, keyframe: frame, liveTicks, rewoundTicks, replayTicks: Number(counter.script2D.properties.ticks), liveRings, replayRings: Number(counter.script2D.properties.rings), remaining }
    assert.equal(Number(counter.script2D.properties.ticks), liveTicks, 'the hidden counter replays to the same value')
    assert.equal(Number(counter.script2D.properties.rings), liveRings, 'the timer fires as often as before')
    assert.equal(world.runtime.state_checksum(), liveChecksum, 'the solver reaches the same state bit for bit')
    entities.slice(1).forEach((entity, at) => assert.ok(Math.abs(pose(entity).x - livePoses[at].x) < 1e-9 && Math.abs(pose(entity).y - livePoses[at].y) < 1e-9, `${entity.name} ends where it did`))
    runtime.setPhysicsRecording(false)
    stop()
  })

  await check('Play that starts on a frame without a fixed step keeps static bodies in place', () => {
    // The editor syncs bodies every frame while editing; after a reload the solver holds them
    // without a state until its next step. Before the fix, Play starting on a frame shorter than
    // the fixed step read that empty state and static bodies stayed at (0, 0) (found in 26.45).
    const ground = floor(), ledge = new api.BoxEntity(nextId++, { x: 3, y: 2 }, { x: 4, y: 0.5 }), crate = box(-2, 1, 1, 1, 'Crate')
    ledge.name = 'Ledge'; ledge.rigidBody.bodyType = 'Static'
    world.entities.splice(0, world.entities.length, ground, ledge, crate)
    api.physicsState.playMode = 'editing'
    world.invalidateRuntime()
    world.update(1 / 60, false, settings)
    api.physicsState.playMode = 'playing'
    runtime.beginSession()
    runtime.frame(1 / 1000)
    const first = { ground: pose(ground), ledge: pose(ledge), crate: pose(crate) }
    for (let frame = 0; frame < 90; frame++) runtime.frame(1 / 120)
    observations.firstFrameWithoutStep = { first, ground: pose(ground), ledge: pose(ledge), crate: pose(crate) }
    for (const [name, entity, x, y] of [['ground', ground, 0, -0.5], ['ledge', ledge, 3, 2]]) {
      assert.ok(Math.abs(first[name].x - x) < 1e-9 && Math.abs(first[name].y - y) < 1e-9, `${name} stays put on the first frame: ${JSON.stringify(first[name])}`)
      assert.ok(Math.abs(pose(entity).x - x) < 1e-9 && Math.abs(pose(entity).y - y) < 1e-9, `${name} stays put while playing: ${JSON.stringify(pose(entity))}`)
    }
    assert.ok(Math.abs(first.crate.x + 2) < 1e-9 && Math.abs(first.crate.y - 1) < 1e-9, `the crate starts where it was placed: ${JSON.stringify(first.crate)}`)
    assert.ok(Math.abs(pose(crate).y - 0.5) < 0.03, `the crate lands on the ground: ${pose(crate).y}`)
    stop()
  })
} catch (error) {
  results.push({ name: 'setup', ok: false, error: String(error?.stack ?? error) }); console.log('FAIL setup\n   ', String(error?.stack ?? error))
} finally {
  await rm(out, { recursive: true, force: true })
}
await mkdir(join(root, '.cache', 'verify'), { recursive: true })
await writeFile(join(root, '.cache', 'verify', 'physics-2645.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, observations }, null, 2))
const passed = results.filter(result => result.ok).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exitCode = passed === results.length ? 0 : 1
