/** 验证脚本（template-catalog）：组织对应功能与边界场景检查，断言行为并汇总验证结果。 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build as viteBuild } from 'vite'
import { REGISTERED_EXPORT_TEMPLATES } from './export-template-registry.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const machineVersion = String(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version ?? '')
const versionParts = machineVersion.split('.')
const release = versionParts.length === 3 ? `${versionParts[0]}.${versionParts[1].padStart(2, '0')}${versionParts[2] === '0' ? '' : `.${versionParts[2]}`}` : machineVersion
const compiled = await mkdtemp(join(tmpdir(), 'nova-template-catalog-'))
const checks = []
const check = /* 调用 checks.push({ id, status: passed ? 'passed' : 'failed', detail, metrics }) 并返回调用结果。 */ (id, passed, detail, metrics = {}) => checks.push({ id, status: passed ? 'passed' : 'failed', detail, metrics })

try {
  await viteBuild({
    configFile: false, root, logLevel: 'warn', ssr: { noExternal: true },
    build: {
      ssr: true, outDir: compiled, emptyOutDir: false,
      rollupOptions: {
        input: { templates: join(root, 'src/projects/templates.ts'), projectData: join(root, 'src/projects/projectData.ts'), language: join(root, 'src/editor/scriptLanguage.ts'), buildSettings: join(root, 'src/runtime/buildSettings.ts'), exportTemplates: join(root, 'src/runtime/exportTemplates.ts'), novaPak: join(root, 'src/runtime/novaPak.ts'), accessibility: join(root, 'src/runtime/uiAccessibility.ts'), components: join(root, 'src/world/components.ts'), boxEntity: join(root, 'src/world/BoxEntity.ts') },
        output: { entryFileNames: '[name].mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' }
      }
    }
  })
  const load = /* 调用 import(`${pathToFileURL(join(compiled, `${name}.mjs`)).href}?v=${Date.now()}`) 并返回调用结果。 */ name => import(`${pathToFileURL(join(compiled, `${name}.mjs`)).href}?v=${Date.now()}`)
  const [templates, projectData, language, builds, browserTemplates, novaPak, accessibility, components, boxEntities] = await Promise.all(['templates', 'projectData', 'language', 'buildSettings', 'exportTemplates', 'novaPak', 'accessibility', 'components', 'boxEntity'].map(load))
  const ids = templates.PROJECT_TEMPLATES.map(/* 返回 template.id 的当前值。 */ template => template.id)
  const categoryCounts = Object.fromEntries(templates.PROJECT_TEMPLATE_CATEGORIES.map(/** 统计模板目录中指定分类的模板数量。 */ category => [category, templates.PROJECT_TEMPLATES.filter(/* 比较 template.category 与 category，返回严格相等的判断结果。 */ template => template.category === category).length]))
  // 26.47: the rhythm category comes first (Rhythm Lab, Rhythm Lanes, Rhythm Lines); the original 20 templates stay.
  check('CATALOG-CATEGORIES', templates.PROJECT_TEMPLATE_CATEGORIES.join(',') === 'rhythm,scene,test,game' && categoryCounts.rhythm >= 3 && categoryCounts.scene >= 7 && categoryCounts.test >= 7 && categoryCounts.game >= 6, 'The launcher lists the rhythm starters first and preserves at least the original 20 templates across Scene, Test and Gameplay categories.', { categoryCounts })
  check('CATALOG-IDENTITY', new Set(ids).size === ids.length && ids.length >= 20, 'Every launcher template has one stable, unique ID; additive releases may extend the catalog.', { ids })
  check('CATALOG-DISCOVERY-METADATA', templates.PROJECT_TEMPLATES.every(/** 校验模板难度、预计配置时长及至少两个标签的元数据要求。 */ template => ['beginner','intermediate','advanced'].includes(template.difficulty) && Number.isFinite(template.setupMinutes) && template.setupMinutes > 0 && Array.isArray(template.tags) && template.tags.length >= 2), 'Every template has searchable tags, a difficulty, and an honest setup-time estimate.')
  const browserRegistry = browserTemplates.exportTemplateState.templates.map(/** 提取导出模板身份与目标，并排序架构和运行模式以便稳定比较。 */ template => ({ id: template.id, target: template.target, architectures: [...template.architectures].sort(), runtimeModes: [...template.runtimeModes].sort() })).sort(/* 调用 a.id.localeCompare(b.id) 并返回调用结果。 */ (a, b) => a.id.localeCompare(b.id))
  const cliRegistry = REGISTERED_EXPORT_TEMPLATES.map(/** 提取导出模板身份与目标，并排序架构和运行模式以便稳定比较。 */ template => ({ id: template.id, target: template.target, architectures: [...template.architectures].sort(), runtimeModes: [...template.runtimeModes].sort() })).sort(/* 调用 a.id.localeCompare(b.id) 并返回调用结果。 */ (a, b) => a.id.localeCompare(b.id))
  check('CATALOG-EXPORT-TEMPLATE-REGISTRY', JSON.stringify(browserRegistry) === JSON.stringify(cliRegistry), 'Interactive and headless builders register the same stable export-template IDs and target tuples.', { browserRegistry, cliRegistry })

  const projects = new Map(), templateFailures = [], schemaFailures = [], scriptFailures = [], buildFailures = [], packageFailures = [], accessibilityFailures = []
  for (const descriptor of templates.PROJECT_TEMPLATES) {
    try {
      const project = templates.createTemplateProject(descriptor.id, `Verify ${descriptor.name}`)
      projects.set(descriptor.id, project)
      const failures = templates.auditTemplateProject(project, descriptor.id)
      if (failures.length) templateFailures.push({ template: descriptor.id, failures })
      const validation = projectData.validateProjectDocument(project)
      if (!validation.valid) schemaFailures.push({ template: descriptor.id, issues: validation.issues.filter(/* 比较 issue.severity 与 'error'，返回严格相等的判断结果。 */ issue => issue.severity === 'error') })
      const sceneIds = project.scenes.map(/* 返回 scene.uuid 的当前值。 */ scene => scene.uuid)
      const settings = builds.normalizeBuildSettings(project.projectSettings?.build, sceneIds)
      const buildIssues = builds.validateBuildSettings(settings, { host: 'windows', architecture: 'x86_64', androidAvailable: false, androidReason: 'not installed' }).filter(/* 先计算 issue.severity === 'error'；仅当其为假值时求右侧 issue.severity === 'warning'，返回短路求值结果。 */ issue => issue.severity === 'error' || issue.severity === 'warning')
      if (buildIssues.length) buildFailures.push({ template: descriptor.id, templateId: settings.delivery.exportTemplate, issues: buildIssues })
      for (const scene of project.scenes) {
        const explicitOrders = new Map()
        for (const entity of scene.entities) {
          const parts = new Map(entity.components.map(/* 返回按声明顺序构造的数组 [component.kind, component.data ?? {}]。 */ component => [component.kind, component.data ?? {}])), rect = parts.get('RectTransform')
          if (!rect) continue
          const interactive = ['Button', 'Slider', 'Checkbox', 'TextInput'].some(/* 调用 parts.has(kind) 并返回调用结果。 */ kind => parts.has(kind))
          const semanticLabel = String(rect.accessibilityLabel ?? parts.get('Text')?.text ?? parts.get('Checkbox')?.label ?? parts.get('TextInput')?.placeholder ?? entity.name ?? '').trim()
          if (interactive && (rect.focusable !== true || rect.skipNavigation === true || !semanticLabel)) accessibilityFailures.push({ template: descriptor.id, scene: scene.name, entity: entity.name, reason: 'interactive control lacks reachable, named RectTransform metadata' })
          if (!interactive && rect.focusable === true && rect.skipNavigation !== true && !String(rect.accessibilityRole ?? '').trim() && !String(rect.accessibilityLabel ?? '').trim()) accessibilityFailures.push({ template: descriptor.id, scene: scene.name, entity: entity.name, reason: 'passive UI element is focusable' })
          const order = Number(rect.readingOrder ?? 0)
          if (interactive && order > 0) { const previous = explicitOrders.get(order); if (previous) accessibilityFailures.push({ template: descriptor.id, scene: scene.name, entity: entity.name, reason: `reading order ${order} duplicates ${previous}` }); else explicitOrders.set(order, entity.name) }
        }
      }
      for (const asset of project.assets.filter(/* 比较 asset.assetType 与 'script'，返回严格相等的判断结果。 */ asset => asset.assetType === 'script')) {
        const errors = language.analyzeScript(asset.source, asset.script?.apiVersion ?? 2).diagnostics.filter(/* 比较 diagnostic.severity 与 'error'，返回严格相等的判断结果。 */ diagnostic => diagnostic.severity === 'error')
        if (errors.length) scriptFailures.push({ template: descriptor.id, script: asset.name, errors })
      }
      try {
        const startupSceneUuid = settings.startupSceneUuid || project.activeSceneUuid || project.scenes[0]?.uuid || ''
        const projectJson = JSON.stringify(project)
        const firstPackage = await novaPak.createNovaPak(projectJson, project.assets, startupSceneUuid, { deterministic: true, compression: 'balanced' })
        const secondPackage = await novaPak.createNovaPak(projectJson, project.assets, startupSceneUuid, { deterministic: true, compression: 'balanced' })
        const parsed = await novaPak.parseNovaPak(firstPackage)
        const deterministic = firstPackage.byteLength === secondPackage.byteLength
          && firstPackage.every(/* 比较 secondPackage[index] 与 value，返回严格相等的判断结果。 */ (value, index) => secondPackage[index] === value)
        if (!deterministic || parsed.index.startupSceneUuid !== startupSceneUuid || !parsed.files.has('project.nova')) {
          throw new Error(`NovaPak round-trip mismatch (deterministic=${deterministic}, startup=${parsed.index.startupSceneUuid}, projectEntry=${parsed.files.has('project.nova')})`)
        }
      } catch (error) {
        packageFailures.push({ template: descriptor.id, error: error instanceof Error ? error.message : String(error) })
      }
    } catch (error) {
      templateFailures.push({ template: descriptor.id, failures: [error instanceof Error ? error.message : String(error)] })
    }
  }
  check('CATALOG-FACTORIES', projects.size === ids.length && templateFailures.length === 0, 'Every registered template factory completes and passes its template-specific structural audit, including verified variants.', { templateFailures })
  check('CATALOG-SCHEMA', schemaFailures.length === 0, 'Every generated template passes the same full project validator used by Create Project.', { schemaFailures })
  check('CATALOG-SCRIPTS-STATIC', scriptFailures.length === 0, 'Every authored template script passes the API-v2 static analyzer.', { scriptFailures })
  check('CATALOG-BUILD-DEFAULTS', buildFailures.length === 0, 'Every untouched template resolves to a registered Windows x64 export template with no blocking errors or warnings.', { buildFailures })
  check('CATALOG-PACKAGE-OUTPUT', packageFailures.length === 0, 'Every untouched template creates, parses, and deterministically reproduces a valid NovaPak with its selected startup scene.', { packageFailures })
  check('CATALOG-UI-SEMANTICS', accessibilityFailures.length === 0, 'Every template UI distinguishes passive visuals from reachable controls and has unique explicit reading order.', { accessibilityFailures })

  const passive = new boxEntities.BoxEntity(1, { x: 0, y: 0 }, { x: 1, y: 1 }); passive.name = 'Legacy HUD'; const passiveRect = passive.addComponent(new components.RectTransform()); passiveRect.focusable = true; passiveRect.skipNavigation = false
  const first = new boxEntities.BoxEntity(2, { x: 0, y: 0 }, { x: 1, y: 1 }); first.name = 'First action'; const firstRect = first.addComponent(new components.RectTransform()); firstRect.focusable = true; firstRect.skipNavigation = false; first.addComponent(new components.Button())
  const second = new boxEntities.BoxEntity(3, { x: 0, y: 0 }, { x: 1, y: 1 }); second.name = 'Second action'; const secondRect = second.addComponent(new components.RectTransform()); secondRect.focusable = true; secondRect.skipNavigation = false; second.addComponent(new components.Button())
  const automaticIssues = accessibility.auditUiAccessibility([passive, first, second]).filter(/* 比较 issue.severity 与 'info'，返回严格不等的判断结果。 */ issue => issue.severity !== 'info')
  firstRect.readingOrder = 1; secondRect.readingOrder = 1
  const explicitIssues = accessibility.auditUiAccessibility([first, second]).filter(/* 比较 issue.code 与 'NOVA-A11Y-ORDER-DUPLICATE'，返回严格相等的判断结果。 */ issue => issue.code === 'NOVA-A11Y-ORDER-DUPLICATE')
  check('CATALOG-UI-COMPATIBILITY', automaticIssues.length === 0 && explicitIssues.length === 2, 'Legacy passive HUDs and automatic order zero are quiet, while duplicate explicit orders remain visible.', { automaticIssues, explicitIssues })

  const wasm = await import(`${pathToFileURL(join(root, 'nova_core/pkg/nova_core.js')).href}?v=${Date.now()}`)
  await wasm.default({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  const wasmFailures = []
  for (const [templateId, project] of projects) {
    for (const asset of project.assets.filter(/* 比较 asset.assetType 与 'script'，返回严格相等的判断结果。 */ asset => asset.assetType === 'script')) {
      const runtime = new wasm.WasmScriptRuntime()
      try { runtime.compile_cached(asset.uuid, asset.source) }
      catch (error) { wasmFailures.push({ template: templateId, script: asset.name, error: error instanceof Error ? error.message : String(error) }) }
      finally { try { runtime.free() } catch { /* compile traps are already reported */ } }
    }
  }
  check('CATALOG-SCRIPTS-WASM', wasmFailures.length === 0, 'Every gameplay script compiles in the exact WASM Rhai runtime used by Play and exported games.', { wasmFailures })

  const baseContext = /** 根据项目实体建立脚本测试上下文，提供固定时间、输入、刚体及离线网络状态。 */ project => {
    const entities = project.scenes.flatMap(/* 返回 scene.entities 的当前值。 */ scene => scene.entities)
    return {
      apiVersion: 2, entity: 'script-owner', entityName: 'Script owner', components: ['Transform2D', 'RigidBody2D', 'BoxCollider2D', 'EllipseCollider2D', 'Script2D', 'Text'],
      entities: Object.fromEntries(entities.map(/* 返回按声明顺序构造的数组 [entity.name, entity.uuid]。 */ entity => [entity.name, entity.uuid])), sceneEntities: entities.map(/** 将实体转换为脚本可见场景记录，保留组件、标签和分组并使用测试原点。 */ entity => ({ uuid: entity.uuid, name: entity.name, enabled: entity.enabled !== false, tags: entity.tags ?? [], groups: entity.groups ?? [], components: entity.components.map(/* 返回 component.kind 的当前值。 */ component => component.kind), position: [0, 0] })),
      time: { delta: 1 / 60, fixedDelta: 1 / 60, elapsed: 0, scale: 1, frame: 1 }, randomSeed: 7,
      input: { down: {}, pressed: {}, released: {}, performed: {}, cancelled: {}, phases: {}, durations: {}, axes: {}, vectors: {}, mousePosition: [960, 540], mouseWorldPosition: [0, 0], viewBounds: [-10.66, 10.66, -6, 6], viewportSize: [1920, 1080], wheel: [0, 0], contexts: ['Gameplay'], maps: ['Default'], scheme: 'keyboard-mouse' },
      contact: null, event: null, properties: {}, save: {}, transform: { position: [0, 0], rotation: 0, scale: [1, 1] }, rigidBody: { velocity: [4, 8], angularVelocity: 0, mass: 1, bodyType: 'Dynamic' }, character: null,
      gameFlow: { paused: false, score: 0, session: {}, checkpoints: [] }, networking: { enabled: false, connected: false, authority: true, peerCount: 0, localPeerId: '', role: 'offline', tick: 0 }
    }
  }
  const execute = /** 查找并编译指定脚本，以可调整的项目上下文执行函数，并确保释放WASM运行时。 */ (project, scriptName, fn, mutate = /* 返回 context 的当前值。 */ context => context) => {
    const asset = project.assets.find(/* 比较 candidate.name 与 scriptName，返回严格相等的判断结果。 */ candidate => candidate.name === scriptName)
    if (!asset) throw new Error(`Missing ${scriptName}`)
    const runtime = new wasm.WasmScriptRuntime()
    try {
      runtime.compile_cached(asset.uuid, asset.source)
      return JSON.parse(runtime.execute_cached_json(asset.uuid, fn, JSON.stringify(mutate(baseContext(project)))))
    } finally { runtime.free() }
  }
  const snake = projects.get('snake'), pong = projects.get('pong'), breakout = projects.get('breakout')
  let gameplayError = '', snakeStart, snakeScore, snakeCrash, pongStart, pongPoint, breakoutHit, breakoutPoint
  try {
    snakeStart = execute(snake, 'SnakeScore.rhai', 'start')
    snakeScore = execute(snake, 'SnakeScore.rhai', 'on_signal', /** 使用贪吃蛇启动属性和得分事件构造脚本执行上下文。 */ context => ({ ...context, properties: snakeStart.properties, event: { name: 'snake.scored', source: 'Food', payload: 1 } }))
    snakeCrash = execute(snake, 'SnakeScore.rhai', 'on_signal', /** 使用贪吃蛇得分属性和游戏结束事件构造脚本执行上下文。 */ context => ({ ...context, properties: snakeScore.properties, event: { name: 'snake.game.over', source: 'Snake Segment 4', payload: 4 } }))
    pongStart = execute(pong, 'PongManager.rhai', 'start')
    pongPoint = execute(pong, 'PongManager.rhai', 'on_signal', /** 使用乒乓球启动属性和左侧得分事件构造脚本执行上下文。 */ context => ({ ...context, properties: pongStart.properties, event: { name: 'pong.point.left', source: 'Ball', payload: 1 } }))
    const breakoutBall = breakout.scenes[0].entities.find(/* 比较 entity.name 与 'Ball'，返回严格相等的判断结果。 */ entity => entity.name === 'Ball')
    breakoutHit = execute(breakout, 'BreakoutBrick.rhai', 'on_collision_enter', /** 注入球体碰撞对象、接触法线和相对速度以模拟打砖块碰撞。 */ context => ({ ...context, contact: { otherEntity: breakoutBall.uuid, point: [0, 0], normal: [0, -1], relativeVelocity: [4, 8] } }))
    breakoutPoint = execute(breakout, 'BreakoutManager.rhai', 'on_signal', /** 设置打砖块得分与砖块事件，构造奖励处理的脚本执行上下文。 */ context => ({ ...context, gameFlow: { ...context.gameFlow, score: 1 }, event: { name: 'breakout.brick', source: 'Brick 1', payload: 1 } }))
  } catch (error) { gameplayError = error instanceof Error ? error.message : String(error) }
  const types = /** 提取执行结果中的命令类型，没有命令时返回空列表。 */ execution => execution?.commands?.map(/* 返回 command.type 的当前值。 */ command => command.type) ?? []
  check('GAME-SNAKE', !gameplayError && ['uiSetText', 'targetSetEnabled'].every(/* 调用 types(snakeStart).includes(type) 并返回调用结果。 */ type => types(snakeStart).includes(type)) && ['uiSetText', 'targetSetEnabled'].every(/* 调用 types(snakeScore).includes(type) 并返回调用结果。 */ type => types(snakeScore).includes(type)) && types(snakeCrash).filter(/* 比较 type 与 'targetSetEnabled'，返回严格相等的判断结果。 */ type => type === 'targetSetEnabled').length === 2 && snakeScore.properties.score === 1 && snakeCrash.properties.game_over === true, 'Snake initializes its HUD, grows one exact linked segment after scoring, and presents game over after self-collision.', { gameplayError, start: types(snakeStart), score: types(snakeScore), crash: types(snakeCrash), properties: snakeCrash?.properties })
  check('GAME-PONG', !gameplayError && ['scoreSet', 'targetSetUiText', 'targetSetEnabled'].every(/* 调用 types(pongStart).includes(type) 并返回调用结果。 */ type => types(pongStart).includes(type)) && types(pongPoint).includes('scoreAdd') && pongPoint.properties.left_score === 1, 'Pong initializes its HUD and win objects, then persists and renders a scored point through the sandbox bridge.', { gameplayError, start: types(pongStart), point: types(pongPoint), properties: pongPoint?.properties })
  check('GAME-BREAKOUT', !gameplayError && ['scoreAdd', 'emitSignal', 'destroy'].every(/* 调用 types(breakoutHit).includes(type) 并返回调用结果。 */ type => types(breakoutHit).includes(type)) && types(breakoutPoint).includes('targetSetUiText'), 'Breakout collision destroys a real brick, adds score, emits its rule signal, and refreshes the HUD.', { gameplayError, hit: types(breakoutHit), point: types(breakoutPoint) })

  let commandFloodBlocked = false
  try {
    const runtime = new wasm.WasmScriptRuntime()
    try { runtime.execute_json('fn update(dt) { for value in 0..5000 { score_add(1.0); } }', 'update', JSON.stringify(baseContext(pong))) }
    finally { runtime.free() }
  } catch (error) { commandFloodBlocked = String(error).includes('too many host commands') }
  check('SECURITY-SCRIPT-BUDGET', commandFloodBlocked, 'The runtime interrupts a script that floods the host command bridge.')

  const deep = {}, cursor = { value: deep }
  let current = cursor.value
  for (let depth = 0; depth < 100; depth++) { current.next = {}; current = current.next }
  const deepValidation = projectData.validateProjectDocument(deep)
  check('SECURITY-PROJECT-BUDGET', !deepValidation.valid && deepValidation.issues.some(/* 比较 issue.code 与 'resource-budget'，返回严格相等的判断结果。 */ issue => issue.code === 'resource-budget'), 'The project loader rejects recursively deep documents before normalization or rendering.', { issues: deepValidation.issues })

  const [physicsSolver, webglRenderer, canvasRenderer, sceneRenderer, runtimeSource] = await Promise.all([
    readFile(join(root, 'crates/nova_physics/src/solver/contact_solver.rs'), 'utf8'), readFile(join(root, 'src/renderer/WebGL2Renderer.ts'), 'utf8'),
    readFile(join(root, 'src/renderer/Canvas2DRenderer.ts'), 'utf8'), readFile(join(root, 'src/renderer/sceneRenderer.ts'), 'utf8'), readFile(join(root, 'src/runtime/GameplayRuntimeCore.ts'), 'utf8')
  ])
  check('PHYSICS-PRECISION', physicsSolver.includes('fn directional_inverse_mass') && physicsSolver.includes('cross_a * cross_a * a.inv_inertia') && physicsSolver.includes('let k12 ='), 'Soft contacts use the rotational effective mass of off-center contacts and solve two-point manifolds as a block (26.44).')
  check('RENDERER-CONTAINMENT', webglRenderer.includes('MAX_PACKET_VERTICES') && webglRenderer.includes('geometry.positions.some') && webglRenderer.includes('finally {') && canvasRenderer.includes('MAX_FRAME_COMMANDS') && canvasRenderer.includes('safeViewport') && canvasRenderer.includes('finally {') && sceneRenderer.includes('safeViewport'), 'Both render backends contain invalid geometry, camera, viewport, and resource values and always restore draw state.')
  check('RUNTIME-BRIDGE-CONTRACT', runtimeSource.includes('MAX_SCRIPT_BRIDGE_COMMANDS') && runtimeSource.includes('parseScriptExecution') && runtimeSource.includes('malformed host command'), 'The TypeScript host validates sandbox output before applying engine mutations.')
} finally {
  await rm(compiled, { recursive: true, force: true })
}

const failed = checks.filter(/* 比较 check.status 与 'failed'，返回严格相等的判断结果。 */ check => check.status === 'failed')
const report = { format: 'nova-template-catalog-verification', version: 3, engineVersion: machineVersion, release, generatedAt: new Date().toISOString(), checks, severity0Open: 0, severity1Open: failed.length, status: failed.length ? 'failed' : 'passed' }
await mkdir(join(root, 'release-audits'), { recursive: true })
await writeFile(join(root, 'release-audits/template-catalog-verification.json'), `${JSON.stringify(report, null, 2)}\n`)
if (failed.length) { console.error(failed); process.exit(1) }
console.log(`Nova_A template catalog verification passed: ${checks.length} checks.`)
