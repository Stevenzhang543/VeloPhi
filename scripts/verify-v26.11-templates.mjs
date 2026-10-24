/** 验证脚本（v26.11-templates）：组织对应功能与边界场景检查，断言行为并汇总验证结果。 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const compiled = await mkdtemp(join(tmpdir(), 'nova-v2611-templates-'))
const checks = []
const check = /** 执行检查函数，正常完成后登记通过记录。 */ (name, run) => { run(); checks.push({ name, status: 'passed' }) }
const report = /** 写入模板行为检查报告，并明确记录源码与WASM验证不等同于完整游玩及原生导出资格。 */ async (status, error) => {
  await mkdir(join(root, 'release-audits'), { recursive: true })
  await writeFile(join(root, 'release-audits/v26.11-template-behavior.json'), JSON.stringify({ status, generatedAt: new Date().toISOString(), checks, error, scope: 'Source factories, catalog discovery, component hydration, particle simulation/draw submissions, and actual WASM script execution. Does not certify full rendered playthroughs or native exports.' }, null, 2))
}
try {
  await writeFile(join(compiled, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: compiled, emptyOutDir: false, rollupOptions: { input: { templates: join(root, 'src/projects/templates.ts'), discovery: join(root, 'src/projects/templateDiscovery.ts'), components: join(root, 'src/world/components.ts'), particles: join(root, 'src/runtime/particleOwner.ts'), box: join(root, 'src/world/BoxEntity.ts') }, output: { entryFileNames: '[name].mjs' } } } })
  const { PROJECT_TEMPLATES: catalog, createTemplateProject } = await import(pathToFileURL(join(compiled, 'templates.mjs')).href)
  const { discoverTemplates } = await import(pathToFileURL(join(compiled, 'discovery.mjs')).href)
  const { ParticleEmitter2D, pasteComponentValues } = await import(pathToFileURL(join(compiled, 'components.mjs')).href)
  // 26.42: the legacy ParticleRuntime shim needs the editor's installed port; drive the pure fixed-World owner directly.
  const { RuntimeParticleOwner } = await import(pathToFileURL(join(compiled, 'particles.mjs')).href)
  const { BoxEntity } = await import(pathToFileURL(join(compiled, 'box.mjs')).href)
  const additions = catalog.filter(/* 比较 value.introduced 与 '26.11'，返回严格相等的判断结果。 */ value => value.introduced === '26.11')
  check('46 unique starters (two rhythm starters since 26.46, Rhythm Lab since 26.47); 20 additional localized recipes', /** 验证模板总量、新增数量、标识唯一性及中德文名称描述。 */ () => { assert.equal(catalog.length, 46); assert.equal(additions.length, 20); assert.equal(new Set(catalog.map(/* 返回 value.id 的当前值。 */ value => value.id)).size, 46); for (const item of additions) for (const locale of ['de', 'zh']) { assert.ok(item.localized[locale].name); assert.ok(item.localized[locale].description) } })
  check('Every original and new particle recipe hydrates its authored fields', /** 逐模板验证粒子字段都可被组件识别并完整恢复，且初始不透明度处于预期范围。 */ () => {
    for (const descriptor of catalog) for (const scene of createTemplateProject(descriptor.id, descriptor.name).scenes) for (const entity of scene.entities) for (const part of entity.components.filter(/* 比较 value.kind 与 'ParticleEmitter2D'，返回严格相等的判断结果。 */ value => value.kind === 'ParticleEmitter2D')) {
      const emitter = new ParticleEmitter2D()
      for (const key of Object.keys(part.data)) assert.ok(key in emitter, `${descriptor.id}/${entity.name}: ignored particle field ${key}`)
      pasteComponentValues(emitter, part.data)
      for (const [key, value] of Object.entries(part.data)) assert.deepEqual(emitter[key], value, `${descriptor.id}/${entity.name}: hydration dropped ${key}`)
      assert.ok(emitter.startOpacity >= 10 && emitter.startOpacity <= 100)
    }
  })
  for (const id of ['rendering-lab', 'particle-fireworks', 'rain-room', 'starfield']) check(`${id}: real particle simulation submits visible moving particles`, /** 将模板粒子组件恢复到运行实体，推进模拟并检查绘制提交、不透明度与运动方向。 */ () => {
    const project = createTemplateProject(id, id), entities = project.scenes[0].entities.filter(/** 筛选包含二维粒子发射器的实体。 */ value => value.components.some(/* 比较 part.kind 与 'ParticleEmitter2D'，返回严格相等的判断结果。 */ part => part.kind === 'ParticleEmitter2D')).map(/** 按模板变换创建实体，恢复粒子配置并附加发射器组件。 */ (value, index) => {
      const transform = value.components.find(/* 比较 part.kind 与 'Transform2D'，返回严格相等的判断结果。 */ part => part.kind === 'Transform2D').data, part = value.components.find(/* 比较 part.kind 与 'ParticleEmitter2D'，返回严格相等的判断结果。 */ part => part.kind === 'ParticleEmitter2D')
      const entity = new BoxEntity(index + 1, transform.position, { x: 1, y: 1 }, value.uuid)
      const emitter = new ParticleEmitter2D(part.uuid); pasteComponentValues(emitter, part.data); entity.addComponent(emitter); return entity
    })
    const runtime = new RuntimeParticleOwner({ entities }, { resources: { generation: 0, resolveTexture: () => null }, readBudget: () => ({ particleBudget: 4_000, adaptiveParticleScale: 1 }), emitterIndices: () => null, nowMs: () => performance.now() }), commands = []
    runtime.reset(); runtime.update(.1, true)
    runtime.submit({ stats: { backend: 'Canvas2D' }, submitShape: /* 调用 commands.push(command) 并返回调用结果。 */ command => commands.push(command), submitSprite: /* 调用 commands.push(command) 并返回调用结果。 */ command => commands.push(command) }, entities)
    assert.ok(commands.length > 0)
    assert.ok(commands.every(/* 比较 (command.fill?.a ?? command.tint?.a ?? 0) 与 .1，返回大于的判断结果。 */ command => (command.fill?.a ?? command.tint?.a ?? 0) > .1))
    if (id === 'rain-room') assert.ok(commands.every(/* 比较 command.position.y 与 5，返回小于的判断结果。 */ command => command.position.y < 5), 'rain should fall')
    if (id === 'starfield') assert.ok(commands.every(/* 比较 command.position.x 与 8.5，返回小于的判断结果。 */ command => command.position.x < 8.5), 'stars should drift left')
    runtime.dispose()
  })
  const display = /** 创建指定语言的模板显示文本提取器，缺失翻译时使用默认名称和描述。 */ locale => /** 拼接模板的本地化名称和描述，缺失时回退到默认文本。 */ item => `${item.localized?.[locale]?.name ?? item.name} ${item.localized?.[locale]?.description ?? item.description}`
  const filters = { category: 'all', difficulty: 'all', query: '', sort: 'catalog', locale: 'en' }
  check('Localized, multiword, category, difficulty, empty and sorted discovery', /** 验证模板多语言搜索、空结果、类别难度过滤及新增和时长排序。 */ () => {
    assert.equal(discoverTemplates(catalog, filters, display('en')).length, 46)
    assert.deepEqual(discoverTemplates(catalog, { ...filters, query: '轨道 闪避', locale: 'zh' }, display('zh')).map(/* 返回 item.id 的当前值。 */ item => item.id), ['orbit-dodge'])
    assert.deepEqual(discoverTemplates(catalog, { ...filters, query: 'Münzpfad', locale: 'de' }, display('de')).map(/* 返回 item.id 的当前值。 */ item => item.id), ['coin-trail'])
    assert.equal(discoverTemplates(catalog, { ...filters, query: 'no-such-template' }, display('en')).length, 0)
    assert.ok(discoverTemplates(catalog, { ...filters, category: 'game', difficulty: 'beginner' }, display('en')).every(/* 先计算 item.category === 'game'；仅当其为真值时求右侧 item.difficulty === 'beginner'，返回短路求值结果。 */ item => item.category === 'game' && item.difficulty === 'beginner'))
    const newest = discoverTemplates(catalog, { ...filters, sort: 'newest' }, display('en')); assert.equal(newest[0].introduced, '26.47'); assert.ok(newest.slice(1, 3).every(item => item.introduced === '26.46')); assert.ok(newest.slice(3, 6).every(item => item.introduced === '26.42')); assert.ok(newest.slice(6, 26).every(/* 比较 item.introduced 与 '26.11'，返回严格相等的判断结果。 */ item => item.introduced === '26.11'))
    const quick = discoverTemplates(catalog, { ...filters, sort: 'time' }, display('en')); assert.ok(quick.every(/* 先计算 index === 0；仅当其为假值时求右侧 quick[index - 1].setupMinutes <= item.setupMinutes，返回短路求值结果。 */ (item, index) => index === 0 || quick[index - 1].setupMinutes <= item.setupMinutes))
  })
  const wasm = await import(pathToFileURL(join(root, 'nova_core/pkg/nova_core.js')).href)
  await wasm.default({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  const pose = /* 返回 entity.components.find(value => value.kind === 'Transform2D').data.position 的当前值。 */ entity => entity.components.find(/* 比较 value.kind 与 'Transform2D'，返回严格相等的判断结果。 */ value => value.kind === 'Transform2D').data.position
  const context = /** 依据模板实体和脚本所有者构造固定时间与输入的WASM执行上下文。 */ (project, owner, properties = {}, position = pose(owner)) => {
    const entities = project.scenes[0].entities
    return {
      apiVersion: 2, entity: owner.uuid, entityName: owner.name, components: owner.components.map(/* 返回 value.kind 的当前值。 */ value => value.kind),
      entities: Object.fromEntries(entities.map(/* 返回按声明顺序构造的数组 [value.name, value.uuid]。 */ value => [value.name, value.uuid])), sceneEntities: entities.map(/** 提取模板实体的身份、组件和实际位置，组成脚本场景记录。 */ value => ({ uuid: value.uuid, name: value.name, enabled: value.enabled !== false, tags: [], groups: [], components: value.components.map(/* 返回 part.kind 的当前值。 */ part => part.kind), position: [pose(value).x, pose(value).y] })),
      time: { delta: 1 / 60, fixedDelta: 1 / 60, elapsed: 0, scale: 1, frame: 1 }, randomSeed: 7,
      input: { down: {}, pressed: {}, released: {}, performed: {}, cancelled: {}, phases: {}, durations: {}, axes: {}, vectors: {}, mousePosition: [960, 540], mouseWorldPosition: [0, 0], viewBounds: [-10.66, 10.66, -6, 6], viewportSize: [1920, 1080], wheel: [0, 0], contexts: ['Gameplay'], maps: ['Default'], scheme: 'keyboard-mouse' },
      contact: null, event: null, properties, save: {}, transform: { position: [position.x, position.y], rotation: 0, scale: [1, 1] }, rigidBody: null, character: null,
      gameFlow: { paused: false, score: 0, session: {}, checkpoints: [] }, networking: { enabled: false, connected: false, authority: true, peerCount: 0, localPeerId: '', role: 'offline', tick: 0 }
    }
  }
  for (const descriptor of additions) {
    const project = createTemplateProject(descriptor.id, descriptor.name), entities = project.scenes[0].entities
    check(`${descriptor.id}: authored scene and safe asset references`, /** 验证模板项目身份、实体数量以及所有资源地址均能解析到项目资源。 */ () => {
      assert.equal(project.projectMetadata.template, descriptor.id)
      assert.ok(entities.length > 4)
      const ids = new Set(project.assets.map(/* 返回 value.uuid 的当前值。 */ value => value.uuid))
      for (const value of entities) for (const part of value.components) for (const [key, reference] of Object.entries(part.data)) if (key.endsWith('Asset') && typeof reference === 'string' && reference.startsWith('asset://')) assert.ok(ids.has(reference.slice(8)), `${value.name}: missing ${reference}`)
    })
    if (descriptor.id === 'rain-room') check('rain-room: silhouette sorts in front of every rain emitter', /** 验证形状绘制层顺序始终高于粒子层。 */ () => {
      const orders = /** 收集全部实体中指定组件种类的绘制层顺序，缺省为零。 */ kind => entities.flatMap(/** 提取单个实体内指定组件种类的绘制层顺序。 */ value => value.components.filter(/* 比较 part.kind 与 kind，返回严格相等的判断结果。 */ part => part.kind === kind).map(/* 当 part.data.orderInLayer 为 null 或 undefined 时返回 0，否则保留左侧值。 */ part => part.data.orderInLayer ?? 0))
      assert.ok(Math.min(...orders('ShapeRenderer2D')) > Math.max(...orders('ParticleEmitter2D')))
    })
    for (const owner of entities.filter(/** 筛选包含脚本组件的实体。 */ value => value.components.some(/* 比较 part.kind 与 'Script2D'，返回严格相等的判断结果。 */ part => part.kind === 'Script2D'))) {
      const reference = owner.components.find(/* 比较 part.kind 与 'Script2D'，返回严格相等的判断结果。 */ part => part.kind === 'Script2D').data.scriptAsset
      const asset = project.assets.find(/* 比较 `asset://${value.uuid}` 与 reference，返回严格相等的判断结果。 */ value => `asset://${value.uuid}` === reference)
      const runtime = new wasm.WasmScriptRuntime()
      try {
        runtime.compile_cached(asset.uuid, asset.source)
        const run = /* 调用 JSON.parse(runtime.execute_cached_json(asset.uuid, fn, JSON.stringify(data))) 并返回调用结果。 */ (fn, data) => JSON.parse(runtime.execute_cached_json(asset.uuid, fn, JSON.stringify(data)))
        if (descriptor.category === 'game' && owner.name.startsWith('Hazard ')) {
          // 26.42 S-5: moving hazards drive themselves with set_position instead of a cross-entity write each frame.
          check(`${descriptor.id}/${owner.name}: hazard moves itself and stops when the course ends`, () => {
            const started = run('start', context(project, owner))
            assert.ok(started.commands.some(command => command.type === 'setPosition'))
            const moved = run('update', context(project, owner, started.properties))
            assert.ok(moved.properties.elapsed > 0 && moved.commands.some(command => command.type === 'setPosition'))
            assert.ok(!moved.commands.some(command => command.type === 'targetSetPosition'))
            const stopped = run('on_signal', { ...context(project, owner, moved.properties), event: { name: 'course.finished', source: '', payload: {} } })
            assert.equal(stopped.properties.running, false)
          })
          continue
        }
        if (descriptor.category !== 'game') {
          check(`${descriptor.id}/${asset.name}: actual WASM orbit tick`, /** 验证更新脚本提交位置修改命令并维护有限的角度属性。 */ () => { const result = run('update', context(project, owner)); assert.ok(result.commands.some(/* 比较 command.type 与 'setPosition'，返回严格相等的判断结果。 */ command => command.type === 'setPosition')); assert.ok(Number.isFinite(result.properties.angle)) })
          continue
        }
        let current
        check(`${descriptor.id}: initialize HUD and exactly one checkpoint`, /** 验证模板启动重置关卡状态和得分，并只启用一个目标。 */ () => { current = run('start', context(project, owner)); assert.equal(current.properties.checkpoint, 0); assert.equal(current.properties.finished, false); assert.ok(current.commands.some(/* 比较 command.type 与 'scoreSet'，返回严格相等的判断结果。 */ command => command.type === 'scoreSet')); assert.equal(current.commands.filter(/* 先计算 command.type === 'targetSetEnabled'；仅当其为真值时求右侧 command.enabled === true，返回短路求值结果。 */ command => command.type === 'targetSetEnabled' && command.enabled === true).length, 1) })
        check(`${descriptor.id}: movement and bounds execute in WASM`, /** 模拟向边界外移动，验证位置命令保持在场景界限内。 */ () => { const data = context(project, owner, current.properties, { x: 8, y: 4.5 }); data.input.axes = { MoveHorizontal: 1, MoveVertical: 1 }; const result = run('update', data); const move = result.commands.find(/* 比较 command.type 与 'setPosition'，返回严格相等的判断结果。 */ command => command.type === 'setPosition'); assert.ok(move); assert.ok(move.x <= 8 && move.y <= 4.5); current = result })
        check(`${descriptor.id}: full course scores, wins, freezes and restarts`, /** 依次到达所有检查点，验证得分、完成提示、结束后静止及重新开始行为。 */ () => {
          const goals = entities.filter(/* 调用 value.name.startsWith('Checkpoint ') 并返回调用结果。 */ value => value.name.startsWith('Checkpoint '))
          for (let index = 0; index < goals.length; index++) {
            // A hazard-free instant supplies a position at the exact next authored checkpoint.
            const data = context(project, owner, { ...current.properties, elapsed: 0 }, pose(goals[index]))
            current = run('update', data)
            assert.equal(current.properties.checkpoint, index + 1)
            assert.ok(current.commands.some(/* 比较 command.type 与 'scoreAdd'，返回严格相等的判断结果。 */ command => command.type === 'scoreAdd'))
          }
          assert.equal(current.properties.finished, true)
          assert.ok(current.commands.some(/* 先计算 command.type === 'targetSetUiText'；仅当其为真值时求右侧 command.text.includes('complete')，返回短路求值结果。 */ command => command.type === 'targetSetUiText' && command.text.includes('complete')))
          assert.equal(run('update', context(project, owner, current.properties)).commands.length, 0)
          const restart = context(project, owner, current.properties); restart.input.pressed.Restart = true; current = run('update', restart)
          assert.equal(current.properties.finished, false); assert.equal(current.properties.checkpoint, 0)
        })
        if (['checkpoint-sprint', 'target-circuit'].includes(descriptor.id)) check(`${descriptor.id}: timer expires`, /** 验证到达时间限制后结束游戏并显示超时提示。 */ () => { const result = run('update', context(project, owner, { ...current.properties, elapsed: 30 })); assert.equal(result.properties.finished, true); assert.ok(result.commands.some(/* 调用 command.text?.includes('Time expired') 并返回调用结果。 */ command => command.text?.includes('Time expired'))) })
        const hazards = entities.filter(/* 调用 value.name.startsWith('Hazard ') 并返回调用结果。 */ value => value.name.startsWith('Hazard '))
        if (hazards.length) check(`${descriptor.id}: hazard ends round`, /** 根据障碍运动命令模拟接触，验证游戏结束并显示碰撞提示。 */ () => {
          // Execute once to read the actual moving hazard command, then sample that
          // exact elapsed time at its reported position in an independent tick.
          const first = run('update', context(project, owner, current.properties))
          let moving = first.commands.find(/* 比较 command.type 与 'targetSetPosition'，返回严格相等的判断结果。 */ command => command.type === 'targetSetPosition')
          // 26.42: moving hazards run their own script; evaluate it at the player's elapsed time for the same tick.
          const hazardScript = hazards[0].components.find(part => part.kind === 'Script2D')
          if (!moving && hazardScript) {
            const hazardAsset = project.assets.find(value => `asset://${value.uuid}` === hazardScript.data.scriptAsset)
            runtime.compile_cached(hazardAsset.uuid, hazardAsset.source)
            const tick = JSON.parse(runtime.execute_cached_json(hazardAsset.uuid, 'update', JSON.stringify(context(project, hazards[0], { elapsed: current.properties.elapsed, running: true }))))
            moving = tick.commands.find(command => command.type === 'setPosition')
          }
          const hitPosition = moving ? { x: moving.x, y: moving.y } : pose(hazards[0])
          const hit = run('update', context(project, owner, current.properties, hitPosition)); assert.equal(hit.properties.finished, true); assert.ok(hit.commands.some(/* 调用 command.text?.includes('Hazard hit') 并返回调用结果。 */ command => command.text?.includes('Hazard hit')))
        })
      } finally { runtime.free() }
    }
  }
  await report('passed')
  console.log(`26.11 template behavior: ${checks.length} checks passed`)
} catch (error) {
  await report('failed', String(error))
  throw error
} finally { await rm(compiled, { recursive: true, force: true }) }
