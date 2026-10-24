// 26.42 WP-L：验证三个新模板（platformer-trilogy、pendulum-post、reflex-lab）。
//   1. Vite SSR 打包 templates / templateGuides / templateDiscovery / projectData；
//   2. createTemplateProject → auditTemplateProject（含新增契约）→ validateProjectDocument；
//   3. 资源引用、实体/组件 UUID 唯一性、实体引用（关节目标、相机跟随目标）完整性；
//   4. 用仓库自带 nova_core WASM 的 WasmScriptRuntime 真实编译并执行每个 Rhai 脚本的关键回调，
//      断言命令序列与导出属性（游戏规则逻辑），不涉及渲染与物理求解。
// 用法：在仓库根目录运行 node scripts/verify-2642-levels.mjs；结果写入 .cache/verify/levels-2642.json（已被 .gitignore 忽略）。
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'

const root = process.cwd()
// 26.42: runs in the repository itself now that the three templates are merged (WP-L).
const out = await mkdtemp(join(tmpdir(), 'nova-levels-'))
const results = []
const check = async (name, run) => { try { await run(); results.push({ name, ok: true }); console.log('PASS', name) } catch (error) { results.push({ name, ok: false, error: String(error?.stack ?? error) }); console.log('FAIL', name, '\n   ', String(error?.message ?? error).split('\n').slice(0, 6).join('\n    ')) } }
try {
  await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: out, emptyOutDir: false, rollupOptions: { input: { templates: join(root, 'src/projects/templates.ts'), guides: join(root, 'src/projects/templateGuides.ts'), discovery: join(root, 'src/projects/templateDiscovery.ts'), project: join(root, 'src/projects/projectData.ts') }, output: { entryFileNames: '[name].mjs' } } } })
  const load = name => import(pathToFileURL(join(out, `${name}.mjs`)).href)
  const [templates, guides, discovery, projectData] = await Promise.all(['templates', 'guides', 'discovery', 'project'].map(load))
  const ids = ['platformer-trilogy', 'pendulum-post', 'reflex-lab']
  const projects = {}

  await check('catalogue: 46 unique ids (two rhythm starters since 26.46, Rhythm Lab since 26.47), three new entries localized and discoverable', () => {
    const catalog = templates.PROJECT_TEMPLATES
    assert.equal(catalog.length, 46)
    assert.equal(new Set(catalog.map(item => item.id)).size, 46)
    for (const id of ids) {
      const item = catalog.find(value => value.id === id)
      assert.ok(item, id)
      for (const locale of ['de', 'zh']) assert.ok(item.localized[locale].name && item.localized[locale].description)
    }
    const display = locale => item => `${item.localized?.[locale]?.name ?? item.name} ${item.localized?.[locale]?.description ?? item.description}`
    const search = (query, locale = 'en') => discovery.discoverTemplates(catalog, { category: 'all', difficulty: 'all', query, sort: 'catalog', locale }, display(locale)).map(item => item.id)
    assert.deepEqual(search('星跃', 'zh'), ['platformer-trilogy'])
    assert.ok(search('rope').includes('pendulum-post'))
    assert.ok(search('latency').includes('reflex-lab'))
  })
  await check('guides: EN/DE/ZH controls, expected text and requirements exist', () => {
    for (const id of ids) for (const locale of ['en', 'de', 'zh']) {
      const guide = guides.templateGuide(id, locale)
      assert.ok(guide.controls.length > 12 && guide.expected.length > 8 && guide.requirements.length > 0, `${id}/${locale}`)
    }
  })
  for (const id of ids) await check(`${id}: createTemplateProject passes its release audit and project validation`, () => {
    const project = templates.createTemplateProject(id, `Level ${id}`)
    projects[id] = project
    assert.deepEqual(templates.auditTemplateProject(project, id), [])
    const validation = projectData.validateProjectDocument(project)
    assert.equal(validation.valid, true, JSON.stringify(validation.issues?.slice?.(0, 8) ?? validation))
    const tutorial = project.assets.find(asset => asset.path === 'Assets/Tutorials/Getting Started.md')
    for (const locale of ['en', 'de', 'zh']) assert.ok(tutorial.source.includes(guides.templateGuide(id, locale).controls))
  })
  for (const id of ids) await check(`${id}: unique identities and resolvable asset/entity references`, () => {
    const project = projects[id]
    const assetIds = new Set(project.assets.map(asset => asset.uuid))
    assert.equal(assetIds.size, project.assets.length, 'duplicate asset uuid')
    const allUuids = new Set()
    for (const scene of project.scenes) {
      const entityIds = new Set(scene.entities.map(value => value.uuid))
      assert.equal(entityIds.size, scene.entities.length, `${scene.name}: duplicate entity uuid`)
      for (const value of scene.entities) {
        for (const part of value.components) {
          assert.ok(!allUuids.has(part.uuid), `${scene.name}/${value.name}/${part.kind}: duplicate component uuid`)
          allUuids.add(part.uuid)
          for (const [key, reference] of Object.entries(part.data)) {
            if (key.endsWith('Asset') && typeof reference === 'string' && reference.startsWith('asset://')) assert.ok(assetIds.has(reference.slice(8)), `${value.name}: missing ${reference}`)
          }
          if (part.data.targetEntityUuid) assert.ok(entityIds.has(part.data.targetEntityUuid), `${value.name}/${part.kind}: joint target outside scene`)
          if (part.kind === 'CameraFollow2D' && part.data.targetUuid) assert.ok(entityIds.has(part.data.targetUuid), `${scene.name}: camera target outside scene`)
          if (part.kind === 'RectTransform' && part.data.parentUuid) assert.ok(entityIds.has(part.data.parentUuid), `${value.name}: UI parent outside scene`)
        }
      }
      // UI 名称被脚本 find_entity_handle 引用，同一场景内必须唯一。
      const names = scene.entities.map(value => value.name)
      for (const required of ['Result Panel', 'Result Text', 'Stage Hint', 'Stage Stats', 'Puzzle Status', 'Reflex Prompt', 'Frame Stats']) assert.ok(names.filter(name => name === required).length <= 1, `${scene.name}: ${required} not unique`)
    }
    const build = project.projectSettings.build
    assert.equal(build.startupSceneUuid, project.scenes[0].uuid)
    assert.equal(build.sceneOrder.length, project.scenes.length)
  })

  // ---------------- WASM 脚本执行 ----------------
  const wasm = await import(pathToFileURL(join(root, 'nova_core/pkg/nova_core.js')).href)
  await wasm.default({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  const pose = value => value.components.find(part => part.kind === 'Transform2D').data.position
  const emptyInput = () => ({ down: {}, pressed: {}, released: {}, performed: {}, cancelled: {}, phases: {}, durations: {}, axes: {}, vectors: {}, mousePosition: [960, 540], mouseWorldPosition: [0, 0], viewBounds: [-12.4, 12.4, -7, 7], viewportSize: [1920, 1080], wheel: [0, 0], contexts: ['Gameplay'], maps: ['Default'], scheme: 'keyboard-mouse' })
  const makeContext = (scene, owner, extra = {}) => ({
    apiVersion: 2, entity: owner.uuid, entityName: owner.name, components: owner.components.map(part => part.kind),
    entities: Object.fromEntries(scene.entities.map(value => [value.name, value.uuid])),
    sceneEntities: scene.entities.map(value => ({ uuid: value.uuid, name: value.name, enabled: value.enabled !== false, tags: value.tags ?? [], groups: value.groups ?? [], components: value.components.map(part => part.kind), position: [pose(value).x, pose(value).y] })),
    time: { delta: 1 / 60, fixedDelta: 1 / 60, elapsed: 0, scale: 1, frame: 1 }, randomSeed: 7, input: emptyInput(), contact: null, event: null, properties: {}, save: {},
    transform: { position: [pose(owner).x, pose(owner).y], rotation: 0, scale: [1, 1] }, rigidBody: null, character: null,
    gameFlow: { paused: false, score: 0, session: {}, checkpoints: [] }, networking: { enabled: false, connected: false, authority: true, peerCount: 0, localPeerId: '', role: 'offline', tick: 0 },
    ...extra
  })
  const scriptOf = (project, owner) => {
    const reference = owner.components.find(part => part.kind === 'Script2D').data.scriptAsset
    return project.assets.find(asset => `asset://${asset.uuid}` === reference)
  }
  const runtime = new wasm.WasmScriptRuntime()
  const compiled = new Set()
  const run = (project, owner, fn, context) => {
    const asset = scriptOf(project, owner)
    if (!compiled.has(asset.uuid)) { runtime.compile_cached(asset.uuid, asset.source); compiled.add(asset.uuid) }
    const properties = { ...(owner.components.find(part => part.kind === 'Script2D').data.properties ?? {}), ...(context.properties ?? {}) }
    return JSON.parse(runtime.execute_cached_json(asset.uuid, fn, JSON.stringify({ ...context, properties })))
  }
  const commandTypes = result => result.commands.map(command => command.type)
  const find = (scene, name) => { const value = scene.entities.find(item => item.name === name); assert.ok(value, `missing entity ${name}`); return value }

  await check('every new Rhai script compiles in the shipped WASM runtime', () => {
    for (const id of ids) for (const asset of projects[id].assets.filter(item => item.assetType === 'script')) {
      const validation = JSON.parse(runtime.validate(asset.source))
      assert.ok(validation.valid !== false && !(validation.diagnostics ?? []).some(item => item.severity === 'error'), `${asset.name}: ${JSON.stringify(validation).slice(0, 400)}`)
      runtime.compile_cached(asset.uuid, asset.source); compiled.add(asset.uuid)
    }
  })

  // ---- Skyline Trilogy ----
  await check('trilogy/player: run, buffered coyote jump, jump cut and fall respawn', () => {
    const project = projects['platformer-trilogy'], scene = project.scenes[0], player = find(scene, 'Player')
    const started = run(project, player, 'start', makeContext(scene, player))
    assert.equal(started.properties.spawn_x, -5); assert.ok(Math.abs(started.properties.spawn_y + 2.6) < 1e-9)
    const run1 = makeContext(scene, player, { properties: started.properties, rigidBody: { velocity: [0, 0], angularVelocity: 0, mass: 1, bodyType: 'Kinematic' }, character: { onFloor: true, onWall: false, onCeiling: false, canCoyoteJump: true, floorNormal: [0, 1], wallNormal: [0, 0], platformVelocity: [0, 0] } })
    run1.input.axes = { MoveHorizontal: 1 }; run1.input.pressed = { Jump: true }; run1.input.down = { Jump: true }
    const jumped = run(project, player, 'fixed_update', run1)
    const move = jumped.commands.find(command => command.type === 'moveCharacter')
    assert.ok(Math.abs(move.x - 7.5 / 60) < 1e-9, 'horizontal run speed'); assert.ok(Math.abs(move.y - 12.5 / 60) < 1e-9, 'jump take-off')
    assert.ok(jumped.properties.jump_lock > 0, 'second coyote jump is blocked right after take-off')
    const cut = makeContext(scene, player, { properties: jumped.properties, rigidBody: { velocity: [7.5, 12], angularVelocity: 0, mass: 1, bodyType: 'Kinematic' }, character: { onFloor: false, onWall: false, onCeiling: false, canCoyoteJump: true, floorNormal: [0, 1], wallNormal: [0, 0], platformVelocity: [0, 0] } })
    cut.input.released = { Jump: true }
    const cutResult = run(project, player, 'fixed_update', cut)
    const cutMove = cutResult.commands.find(command => command.type === 'moveCharacter')
    assert.ok(cutMove.y < (12 - .5) / 60 && cutMove.y > 0, 'early release keeps only part of the upward speed')
    const fall = makeContext(scene, player, { properties: jumped.properties, transform: { position: [3, -20], rotation: 0, scale: [1, 1] }, rigidBody: { velocity: [0, -20], angularVelocity: 0, mass: 1, bodyType: 'Kinematic' } })
    const respawn = run(project, player, 'fixed_update', fall)
    const teleport = respawn.commands.find(command => command.type === 'setPosition')
    assert.deepEqual([teleport.x, teleport.y], [-5, -2.6]); assert.ok(respawn.commands.some(command => command.type === 'emitSignal' && command.name === 'run.respawned'))
    const checkpoint = run(project, player, 'on_signal', makeContext(scene, player, { properties: jumped.properties, event: { name: 'run.checkpoint', source: '', payload: { x: 26.5, y: -2.5 } } }))
    assert.equal(checkpoint.properties.spawn_x, 26.5)
    const integerPayload = run(project, player, 'on_signal', makeContext(scene, player, { properties: jumped.properties, event: { name: 'run.checkpoint', source: '', payload: { x: 37, y: -2 } } }))
    assert.equal(integerPayload.properties.spawn_x, 37, 'integer JSON payloads convert with to_float()')
  })
  await check('trilogy/director: stage flow, session totals, coin gate, time limit and best-time save', () => {
    const project = projects['platformer-trilogy']
    const [s1, s2, s3] = project.scenes
    const d1 = find(s1, 'Stage Director')
    const st = run(project, d1, 'start', makeContext(s1, d1))
    assert.ok(st.commands.some(command => command.type === 'sessionSet'), 'stage 1 resets run session')
    assert.ok(st.commands.some(command => command.type === 'startTimer' && command.name === 'hud'))
    const goal1 = run(project, d1, 'on_signal', makeContext(s1, d1, { properties: { ...st.properties, elapsed: 12.5 }, event: { name: 'run.goal', source: '', payload: 1 } }))
    const load = goal1.commands.find(command => command.type === 'loadScene')
    assert.equal(load.scene, 'Stage 2 - Challenge'); assert.ok(s2.name === load.scene)
    const d3 = find(s3, 'Stage Director')
    const st3 = run(project, d3, 'start', makeContext(s3, d3))
    assert.ok(!st3.commands.some(command => command.type === 'sessionSet'), 'later stages keep the run session')
    const hud = run(project, d3, 'on_timer', makeContext(s3, d3, { properties: st3.properties, event: { name: 'hud', source: '', payload: null } }))
    assert.equal(hud.properties.coins, 0); assert.ok(hud.commands.some(command => command.type === 'targetSetUiText' && command.text.includes('Coins 0/10')))
    const blocked = run(project, d3, 'on_signal', makeContext(s3, d3, { properties: st3.properties, event: { name: 'run.goal', source: '', payload: 1 } }))
    assert.equal(blocked.properties.finished, false); assert.ok(blocked.commands.some(command => command.text?.includes('needs every coin')))
    const withoutCoins = makeContext(s3, d3, { properties: { ...st3.properties, elapsed: 40.25, falls: 2 }, event: { name: 'run.goal', source: '', payload: 1 }, gameFlow: { paused: false, score: 10, session: { trilogy_time: 50.5, trilogy_falls: 3 }, checkpoints: [] }, save: { trilogy_best: 120 } })
    withoutCoins.sceneEntities = withoutCoins.sceneEntities.filter(item => !item.name.startsWith('Coin '))
    const win = run(project, d3, 'on_signal', withoutCoins)
    assert.equal(win.properties.finished, true)
    const saved = win.commands.find(command => command.type === 'saveSet' && command.key === 'trilogy_best')
    assert.ok(saved && Math.abs(Number(saved.value) - 90.75) < 1e-9, 'best time = session 50.5 + stage 40.25')
    assert.ok(win.commands.some(command => command.type === 'saveCommit'))
    assert.ok(win.commands.some(command => command.type === 'targetSetUiText' && command.text.includes('NEW RECORD') && command.text.includes('Falls 5')))
    const timeout = run(project, d3, 'update', makeContext(s3, d3, { properties: { ...st3.properties, elapsed: 74.99 }, time: { delta: .05, fixedDelta: 1 / 60, elapsed: 80, scale: 1, frame: 9 } }))
    assert.equal(timeout.properties.finished, true); assert.ok(timeout.commands.some(command => command.text?.includes('Time is up')))
    const restart = makeContext(s3, d3, { properties: st3.properties }); restart.input.pressed = { Restart: true }
    assert.ok(commandTypes(run(project, d3, 'update', restart)).includes('reloadScene'))
  })
  await check('trilogy/mover, phase platform, hazard, flag and goal behaviour', () => {
    const project = projects['platformer-trilogy'], s2 = project.scenes[1]
    const lift = find(s2, 'Lift')
    const st = run(project, lift, 'start', makeContext(s2, lift))
    const v0 = st.commands.find(command => command.type === 'setVelocity'); assert.deepEqual([v0.x, v0.y], [0, 2])
    const top = run(project, lift, 'fixed_update', makeContext(s2, lift, { properties: st.properties, transform: { position: [24, 1.6], rotation: 0, scale: [1, 1] } }))
    const v1 = top.commands.find(command => command.type === 'setVelocity'); assert.deepEqual([v1.x + 0, v1.y], [0, -2]) // axis 0 × -1 yields -0
    const phase = find(s2, 'Phase 2')
    const ps = run(project, phase, 'start', makeContext(s2, phase))
    assert.ok(ps.commands.some(command => command.type === 'startTimer' && command.name === 'phase-delay'), 'offset delays the cycle')
    const toggled = run(project, phase, 'on_timer', makeContext(s2, phase, { properties: ps.properties, event: { name: 'phase', source: '', payload: null } }))
    assert.equal(toggled.properties.solid, false)
    assert.deepEqual(toggled.commands.filter(command => command.type === 'targetSetComponentEnabled').map(command => [command.component, command.enabled]), [['BoxCollider2D', false], ['ShapeRenderer2D', false]])
    const player = find(s2, 'Player')
    const touch = (owner, other) => makeContext(s2, owner, { contact: { otherEntity: other, point: [0, 0], normal: [0, 1], relativeVelocity: [0, 0] } })
    const spike = find(s2, 'Spike 1')
    assert.ok(run(project, spike, 'on_trigger_enter', touch(spike, player.uuid)).commands.some(command => command.name === 'run.hurt'))
    assert.equal(run(project, spike, 'on_trigger_enter', touch(spike, find(s2, 'Lift').uuid)).commands.length, 0, 'non-player contacts are ignored')
    const flag = find(s2, 'Flag 2')
    const reached = run(project, flag, 'on_trigger_enter', touch(flag, player.uuid))
    const payload = reached.commands.find(command => command.name === 'run.checkpoint').payload
    assert.deepEqual([payload.x, payload.y], [29, 2.3]); assert.equal(reached.properties.reached, true)
    const goal = find(s2, 'Goal Gate')
    assert.ok(run(project, goal, 'on_trigger_enter', touch(goal, player.uuid)).commands.some(command => command.name === 'run.goal'))
  })

  // ---- Pendulum Post ----
  await check('pendulum/director: mouse cut picks a link, keys release balls, delivery and loss rules', () => {
    const project = projects['pendulum-post'], scene = project.scenes[0], director = find(scene, 'Puzzle Director')
    const st = run(project, director, 'start', makeContext(scene, director))
    const link = find(scene, 'Link A3')
    const click = makeContext(scene, director, { properties: st.properties })
    click.input.pressed = { Cut: true }; click.input.mouseWorldPosition = [pose(link).x + .05, pose(link).y]
    const cut = run(project, director, 'update', click)
    const destroyed = cut.commands.find(command => command.type === 'targetDestroy')
    assert.ok(destroyed && destroyed.target === link.uuid, 'clicked link is destroyed'); assert.equal(cut.properties.cuts, 1); assert.equal(cut.properties.a_free, true)
    const ball = find(scene, 'Ball A')
    const miss = makeContext(scene, director, { properties: st.properties }); miss.input.pressed = { Cut: true }; miss.input.mouseWorldPosition = [pose(ball).x, pose(ball).y]
    assert.equal(run(project, director, 'update', miss).properties.cuts, 0, 'clicking the ball itself does not count as a cut')
    const key = makeContext(scene, director, { properties: st.properties }); key.input.pressed = { ReleaseB: true }
    const released = run(project, director, 'update', key)
    const toggle = released.commands.find(command => command.type === 'targetSetComponentEnabled')
    assert.equal(toggle.component, 'RevoluteJoint2D'); assert.equal(toggle.target, find(scene, 'Ball B').uuid); assert.equal(released.properties.b_free, true)
    const deliver = (properties, name) => run(project, director, 'on_signal', makeContext(scene, director, { properties, event: { name: 'post.delivered', source: '', payload: find(scene, name).uuid } }))
    const first = deliver({ ...st.properties, cuts: 2, a_free: true, b_free: true }, 'Ball A')
    assert.equal(first.properties.delivered, 1); assert.equal(first.properties.finished, false)
    const duplicate = deliver(first.properties, 'Ball A'); assert.equal(duplicate.properties.delivered, 1, 'the same ball is counted once')
    const second = deliver(first.properties, 'Ball B')
    assert.equal(second.properties.finished, true)
    assert.ok(second.commands.some(command => command.type === 'targetSetUiText' && command.text.includes('Rating 3/3')))
    assert.ok(second.commands.some(command => command.type === 'saveCommit'))
    const lost = run(project, director, 'on_signal', makeContext(scene, director, { properties: st.properties, event: { name: 'post.lost', source: '', payload: find(scene, 'Ball B').uuid } }))
    assert.equal(lost.properties.finished, true); assert.ok(lost.commands.some(command => command.text?.includes('hit the floor')))
  })
  await check('pendulum/cup and floor only react to the two balls', () => {
    const project = projects['pendulum-post'], scene = project.scenes[0]
    const cup = find(scene, 'Cup Goal'), floor = find(scene, 'Pit Floor')
    const contact = (owner, other) => makeContext(scene, owner, { contact: { otherEntity: other, point: [0, 0], normal: [0, 1], relativeVelocity: [0, 0] } })
    assert.equal(run(project, cup, 'on_trigger_enter', contact(cup, find(scene, 'Ball B').uuid)).commands[0].name, 'post.delivered')
    assert.equal(run(project, cup, 'on_trigger_enter', contact(cup, find(scene, 'Link B2').uuid)).commands.length, 0)
    assert.equal(run(project, floor, 'on_collision_enter', contact(floor, find(scene, 'Ball A').uuid)).commands[0].name, 'post.lost')
    assert.equal(run(project, floor, 'on_collision_enter', contact(floor, find(scene, 'Windmill Rotor').uuid)).commands.length, 0)
  })
  await check('pendulum/geometry: chains hang from their anchors and joints point at the previous link', () => {
    const scene = projects['pendulum-post'].scenes[0]
    for (const [key, links] of [['A', 5], ['B', 7]]) {
      let previous = find(scene, `Anchor ${key}`)
      for (let index = 1; index <= links; index++) {
        const link = find(scene, `Link ${key}${index}`)
        const joint = link.components.find(part => part.kind === 'RevoluteJoint2D').data
        assert.equal(joint.targetEntityUuid, previous.uuid)
        const top = pose(link).y + joint.anchor.y, attach = pose(previous).y + joint.connectedAnchor.y
        assert.ok(Math.abs(top - attach) < 1e-9, `Link ${key}${index} joint anchors coincide`)
        previous = link
      }
      const ball = find(scene, `Ball ${key}`), joint = ball.components.find(part => part.kind === 'RevoluteJoint2D').data
      assert.equal(joint.targetEntityUuid, previous.uuid)
      assert.ok(Math.abs(pose(ball).y + joint.anchor.y - (pose(previous).y + joint.connectedAnchor.y)) < 1e-9)
    }
  })

  // ---- Reflex Lab ----
  await check('reflex/director: arm, false start, lamp, five timed rounds, summary and record save', () => {
    const project = projects['reflex-lab'], scene = project.scenes[0], lamp = find(scene, 'Go Lamp')
    let state = run(project, lamp, 'start', makeContext(scene, lamp))
    assert.deepEqual(state.commands.filter(command => command.type === 'setPosition').map(command => [command.x, command.y]), [[0, 40]])
    const press = (properties, elapsed) => { const context = makeContext(scene, lamp, { properties, time: { delta: 1 / 240, fixedDelta: 1 / 60, elapsed, scale: 1, frame: 1 } }); context.input.pressed = { React: true }; return run(project, lamp, 'update', context) }
    const idle = (properties, elapsed) => run(project, lamp, 'update', makeContext(scene, lamp, { properties, time: { delta: 1 / 240, fixedDelta: 1 / 60, elapsed, scale: 1, frame: 1 } }))
    let armed = press(state.properties, 1)
    assert.equal(armed.properties.phase, 1); assert.ok(armed.properties.go_at >= 2.2 && armed.properties.go_at <= 4.5)
    const early = press(armed.properties, 1.5)
    assert.equal(early.properties.phase, 0); assert.equal(early.properties.false_starts, 1)
    let properties = early.properties, clock = 10
    const times = [0.25, 0.21, 0.30, 0.19, 0.24]
    for (let index = 0; index < times.length; index++) {
      armed = press(properties, clock)
      const lit = idle(armed.properties, armed.properties.go_at + .001)
      assert.equal(lit.properties.phase, 2)
      assert.ok(lit.commands.some(command => command.type === 'setPosition' && command.y === 1.2), 'lamp moves into view')
      const hit = press(lit.properties, lit.properties.shown_at + times[index])
      assert.ok(hit.commands.some(command => command.type === 'setPosition' && command.y === 40), 'lamp parks after the press')
      properties = hit.properties; clock = lit.properties.shown_at + 5
      if (index === times.length - 1) {
        assert.equal(hit.properties.phase, 3)
        assert.ok(Math.abs(hit.properties.best_ms - 190) < 1e-6 && Math.abs(hit.properties.worst_ms - 300) < 1e-6)
        const summary = hit.commands.find(command => command.type === 'targetSetUiText' && command.text.startsWith('Average'))
        assert.ok(summary.text.includes('Average 238 ms') && summary.text.includes('False starts 1'), summary.text)
        assert.ok(hit.commands.some(command => command.type === 'saveCommit'))
      } else assert.equal(hit.properties.round, index + 1)
    }
    const again = press(properties, clock)
    assert.equal(again.properties.phase, 0); assert.equal(again.properties.round, 0)
    const frameStats = idle({ ...state.properties, window: .499, frames: 119, worst_frame: .009 }, 3)
    assert.ok(frameStats.commands.some(command => command.type === 'targetSetUiText' && command.text.includes('updates/s')))
    const switching = makeContext(scene, lamp, { properties: state.properties }); switching.input.pressed = { SwitchScene: true }
    assert.equal(run(project, lamp, 'update', switching).commands.find(command => command.type === 'loadScene').scene, 'Latency Marker')
  })
  await check('reflex/latency marker matches the external harness behaviour', () => {
    const project = projects['reflex-lab'], scene = project.scenes[1], marker = find(scene, 'LatencyMarker')
    const held = makeContext(scene, marker); held.input.down = { Jump: true }
    assert.deepEqual(run(project, marker, 'fixed_update', held).commands.map(command => [command.type, command.x, command.y]), [['setPosition', 0, 3]])
    assert.deepEqual(run(project, marker, 'fixed_update', makeContext(scene, marker)).commands.map(command => [command.type, command.x, command.y]), [['setPosition', 0, 40]])
    const pointerScene = project.scenes[0], pointer = find(pointerScene, 'Pointer (script update)')
    const moved = makeContext(pointerScene, pointer); moved.input.mouseWorldPosition = [3.5, -1.25]
    assert.deepEqual(run(project, pointer, 'update', moved).commands.map(command => [command.x, command.y]), [[3.5, -1.25]])
  })
  runtime.free()
} finally {
  await rm(out, { recursive: true, force: true })
}
const failed = results.filter(item => !item.ok)
await mkdir(join(root, '.cache', 'verify'), { recursive: true })
await writeFile(join(root, '.cache', 'verify', 'levels-2642.json'), JSON.stringify({ generatedAt: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
