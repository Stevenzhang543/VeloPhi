/** 内置示例项目生成：组装实体、资源和场景，生成游戏及渲染模板并检查项目结构。 */
import { templateGuide } from './templateGuides'
import { DEFAULT_MAX_CATCH_UP_STEPS } from '../runtime/engineTiming'
import { defaultAudioSettings } from '../runtime/audio'
import { defaultInputMap } from '../runtime/input'
import { defaultCollisionMatrix } from '../world/World'
import { defaultPhysicsLayers, PHYSICS_PROFILE_LIBRARY } from '../runtime/physicsProduction'
import { newProjectMetadata } from './projectSession'
import { normalizeProjectManifest } from './projectManifest'
import { assetSourceBytes, sha256Bytes } from '../assets/contentHash'
import { defaultSceneAuthoringSettings } from '../editor/sceneAuthoring'
import { TEMPLATE_ADDITIONS_26_11, type AddedTemplateId } from './templateCatalog26_11'
import { chartSource, composeNeonStep, composePrismPulse, composeSkylineDrift, neonStepChart, prismPulseChart, skylineDriftChart, songWavDataUrl } from './rhythmTemplateSong'
import {
  NOVA_ENGINE_VERSION, NOVA_PROJECT_FORMAT, NOVA_PROJECT_FORMAT_MAJOR,
  NOVA_PROJECT_SCHEMA_VERSION, projectCompatibility
} from './projectFormat'

export type ProjectTemplateCategory = 'rhythm' | 'scene' | 'test' | 'game'
export type ProjectTemplateId = AddedTemplateId | 'rhythm-lab' | 'empty' | 'mouse-knockout' | 'snake' | 'pong' | 'breakout' | 'platformer' | 'top-down' | 'physics-sandbox' | 'collision-lab' | 'rendering-lab' | 'ui-showcase' | 'networked-optional' | 'lighting-starter' | 'tile-world' | 'responsive-ui' | 'particle-lab' | 'audio-lab' | 'animation-lab' | 'physics-cleanup' | 'grid-chase' | 'platformer-trilogy' | 'pendulum-post' | 'reflex-lab' | 'rhythm-lanes' | 'rhythm-lines'
export type ProjectTemplateDifficulty = 'beginner' | 'intermediate' | 'advanced'

export interface ProjectTemplateDescriptor {
  id: ProjectTemplateId
  category: ProjectTemplateCategory
  name: string
  description: string
  features: string[]
  difficulty: ProjectTemplateDifficulty
  setupMinutes: number
  tags: string[]
  introduced?: string
  localized?: Partial<Record<'de' | 'zh', { name: string; description: string }>>
  /** 26.47: a classic (non-rhythm) example, listed after the rhythm starters and labs. */
  classic?: boolean
}

export const PROJECT_TEMPLATE_CATEGORIES: readonly ProjectTemplateCategory[] = ['rhythm', 'scene', 'test', 'game'] as const
/** 26.47: what a rhythm game builds on (besides the rhythm starters): the empty scene and the latency, audio,
 * UI, rendering, particle and lighting labs. Every other template is a classic example (platformers, physics
 * games and labs, world streaming, networking), listed after these. */
const RHYTHM_ENGINE_TEMPLATES = new Set<string>(['empty', 'reflex-lab', 'audio-lab', 'ui-showcase', 'responsive-ui', 'rendering-lab', 'particle-lab', 'lighting-starter'])

const TEMPLATE_LIST: readonly ProjectTemplateDescriptor[] = [
  { id: 'rhythm-lab', category: 'rhythm', name: 'Rhythm Lab', description: 'The open rhythm engine in one song: the chart\'s own note types (spinning prefab stars worth double, mines judged by a script) and a master timeline that moves the camera, the backdrop and bloom on the beat.', features: ['Note types', 'Prefab notes', 'Script judgement', 'Master timeline', 'Triggers'], difficulty: 'intermediate', setupMinutes: 4, tags: ['rhythm', 'music', 'note types', 'timeline', 'chart'], introduced: '26.47', localized: { de: { name: 'Rhythmus-Labor', description: 'Die offene Rhythmus-Engine in einem Song: eigene Notentypen des Charts (drehende Prefab-Sterne mit doppelten Punkten, per Skript bewertete Minen) und eine Master-Zeitleiste, die Kamera, Hintergrund und Bloom im Takt bewegt.' }, zh: { name: '节奏实验室', description: '一首歌展示开放的音游引擎：谱面自定义音符类型（旋转的预制体星星双倍得分、由脚本判定的地雷），以及按拍驱动相机、背景和辉光的主时间线。' } } },
  { id: 'rhythm-lanes', category: 'rhythm', name: 'Rhythm Lanes', description: 'A complete four-lane rhythm game: an original song, a hand-tuned chart with holds, scoring, combo, autoplay, pause and a saved best score.', features: ['RhythmChart2D', 'Chart editor', 'Audio clock', 'Judgement', 'Best score'], difficulty: 'beginner', setupMinutes: 3, tags: ['rhythm', 'music', 'mania', 'chart'], introduced: '26.46', localized: { de: { name: 'Rhythmus-Bahnen', description: 'Vollständiges Rhythmusspiel mit vier Bahnen: eigener Song, abgestimmtes Chart mit Haltenoten, Punkte, Combo, Autoplay, Pause und gespeicherter Bestwert.' }, zh: { name: '节奏下落', description: '完整的四轨下落式音游：原创歌曲、带长按音符的谱面、计分与连击、自动演奏、暂停以及最佳成绩存档。' } } },
  { id: 'rhythm-lines', category: 'rhythm', name: 'Rhythm Lines', description: 'A judgement-line rhythm game: two lines that move, turn and fade with the music, taps, holds, drags and flicks, played with pointer, touch or keyboard.', features: ['RhythmChart2D', 'Judgement lines', 'Line events', 'Drag & flick', 'Touch-ready'], difficulty: 'intermediate', setupMinutes: 4, tags: ['rhythm', 'music', 'judgement line', 'chart'], introduced: '26.46', localized: { de: { name: 'Rhythmus-Linien', description: 'Rhythmusspiel mit Urteilslinien: zwei Linien bewegen, drehen und blenden sich zur Musik, mit Tipp-, Halte-, Zieh- und Wischnoten für Zeiger, Touch oder Tastatur.' }, zh: { name: '节奏判定线', description: '判定线式音游：两条判定线随音乐移动、旋转、淡入淡出，含点击、长按、滑动与划动音符，可用鼠标、触屏或键盘游玩。' } } },
  { id: 'empty', category: 'scene', name: 'Clear Scene', description: 'A clean scene with a configured Camera2D.', features: ['Camera2D', 'Input map', 'Build settings'], difficulty: 'beginner', setupMinutes: 2, tags: ['blank', 'camera', 'starter'] },
  { id: 'physics-sandbox', category: 'scene', name: 'Physics Sandbox', description: 'A playground for materials, ropes, joints, and collision behavior.', features: ['Rigid bodies', 'Materials', 'Rope2D', 'Joints', 'Debugger'], difficulty: 'intermediate', setupMinutes: 8, tags: ['physics', 'rope', 'joints'] },
  { id: 'platformer', category: 'scene', name: 'Platformer Scene', description: 'A playable foundation with a player, platforms, UI, animation, audio, and scripts.', features: ['Physics', 'TileMap2D', 'Animator', 'Audio', 'UI'], difficulty: 'intermediate', setupMinutes: 12, tags: ['platformer', 'character', 'tilemap'] },
  { id: 'top-down', category: 'scene', name: 'Top-down Scene', description: 'A two-scene action foundation with triggers, enemies, prefabs, particles, and save data.', features: ['Prefabs', 'Scene switch', 'Triggers', 'Particles', 'Save API'], difficulty: 'intermediate', setupMinutes: 12, tags: ['top-down', 'prefab', 'save'] },
  { id: 'lighting-starter', category: 'scene', name: 'Lighting Starter', description: 'A composed 2D scene for lights, shadows, particles, sorting, and camera framing.', features: ['2D lights', 'Shadows', 'Particles', 'Sorting', 'Camera'], difficulty: 'beginner', setupMinutes: 6, tags: ['rendering', 'lighting', 'scene'] },
  { id: 'tile-world', category: 'scene', name: 'Tile World Starter', description: 'A two-scene TileMap world with prefabs, triggers, streaming-ready data, and save hooks.', features: ['TileMap2D', 'World scenes', 'Prefabs', 'Triggers', 'Save API'], difficulty: 'intermediate', setupMinutes: 12, tags: ['tilemap', 'world', 'streaming'] },
  { id: 'responsive-ui', category: 'scene', name: 'Responsive UI Starter', description: 'A production Canvas scene with themes, localization, focus, input, audio, and responsive layout.', features: ['Canvas', 'Themes', 'Localization', 'Focus', 'Audio'], difficulty: 'beginner', setupMinutes: 7, tags: ['ui', 'responsive', 'localization'] },
  { id: 'collision-lab', category: 'test', name: 'Collision & CCD Lab', description: 'A deterministic test scene for contacts, sensors, materials, rotation, and fast continuous bodies.', features: ['CCD', 'Sensors', 'Friction', 'Restitution', 'Diagnostics'], difficulty: 'advanced', setupMinutes: 10, tags: ['physics', 'ccd', 'test'] },
  { id: 'rendering-lab', category: 'test', name: 'Rendering Lab', description: 'A visual test scene covering shapes, sprites, text, particles, lighting, and sorting.', features: ['WebGL2', 'Shapes', 'Sprites', 'Text', 'Lighting'], difficulty: 'intermediate', setupMinutes: 8, tags: ['rendering', 'webgl2', 'visual'] },
  { id: 'ui-showcase', category: 'test', name: 'UI & Input Lab', description: 'A responsive menu and HUD demonstrating themes, localization, focus, input, and audio.', features: ['Responsive UI', 'Themes', 'Localization', 'Focus', 'Audio mixer'], difficulty: 'intermediate', setupMinutes: 9, tags: ['ui', 'input', 'accessibility'] },
  { id: 'networked-optional', category: 'test', name: 'Networking Lab', description: 'An opt-in authoritative replication test with diagnostics and a headless smoke test.', features: ['Replication', 'Authority', 'Prediction', 'Diagnostics', 'Headless test'], difficulty: 'advanced', setupMinutes: 15, tags: ['network', 'multiplayer', 'headless'] },
  { id: 'particle-lab', category: 'test', name: 'Particles & Effects Lab', description: 'A renderer lab focused on emitters, imported sprites, lights, sorting, and camera composition.', features: ['Particles', 'Sprites', 'Lighting', 'Sorting', 'WebGL2'], difficulty: 'intermediate', setupMinutes: 8, tags: ['particles', 'effects', 'rendering'] },
  { id: 'audio-lab', category: 'test', name: 'Audio & UI Lab', description: 'A responsive audio-control scene with focus navigation, localization, themes, and mixer-ready clips.', features: ['Audio', 'UI controls', 'Focus', 'Themes', 'Localization'], difficulty: 'beginner', setupMinutes: 7, tags: ['audio', 'ui', 'mixer'] },
  { id: 'animation-lab', category: 'test', name: 'Animation & Character Lab', description: 'A playable character scene for Animator, clips, audio cues, TileMap collision, and runtime UI.', features: ['Animator', 'CharacterBody2D', 'Audio', 'TileMap2D', 'UI'], difficulty: 'intermediate', setupMinutes: 12, tags: ['animation', 'character', 'timeline'] },
  { id: 'mouse-knockout', category: 'game', name: 'Mouse Knockout', description: 'A complete mouse-controlled physics game with runtime spawning, scoring, and a win banner.', features: ['World-space mouse', 'Physics', 'Runtime prefabs', 'Score', 'Portable .exe'], difficulty: 'beginner', setupMinutes: 4, tags: ['mouse', 'physics', 'score'] },
  { id: 'snake', category: 'game', name: 'Snake', description: 'A classic grid game with precise movement, body growth, self-collision, scoring, and portable export.', features: ['Keyboard & gamepad', 'Growth', 'Self-collision', 'Score UI', 'Portable .exe'], difficulty: 'intermediate', setupMinutes: 5, tags: ['snake', 'grid', 'keyboard'] },
  { id: 'pong', category: 'game', name: 'Pong', description: 'A complete two-player paddle game with physical rebounds, scoring, serve resets, and a first-to-seven win state.', features: ['2 players', 'Physics', 'Score', 'Win state', 'Portable .exe'], difficulty: 'intermediate', setupMinutes: 5, tags: ['pong', 'multiplayer', 'physics'] },
  { id: 'breakout', category: 'game', name: 'Breakout', description: 'A complete paddle-and-bricks game with continuous collision, destructible bricks, score, and completion UI.', features: ['Keyboard', 'CCD', 'Destruction', 'Score', 'Portable .exe'], difficulty: 'intermediate', setupMinutes: 6, tags: ['breakout', 'bricks', 'ccd'] },
  { id: 'physics-cleanup', category: 'game', name: 'Physics Cleanup', description: 'A complete pointer-controlled arena variation: push every spawned body outside the camera and clear the board.', features: ['Pointer control', 'Physics', 'Runtime spawn', 'Score', 'Win banner'], difficulty: 'beginner', setupMinutes: 4, tags: ['mouse', 'arena', 'physics'] },
  { id: 'grid-chase', category: 'game', name: 'Grid Chase', description: 'A complete deterministic grid-chase variation with keyboard/gamepad movement, pickups, growth, score, and fail state.', features: ['Keyboard & gamepad', 'Grid movement', 'Pickups', 'Score', 'Portable .exe'], difficulty: 'intermediate', setupMinutes: 5, tags: ['grid', 'chase', 'score'] },
  ...TEMPLATE_ADDITIONS_26_11.map(/** 复制模板功能和标签列表，并附加引入版本及德文、中文名称说明。 */ ({ de, zh, ...descriptor }) => ({ ...descriptor, features: [...descriptor.features], tags: [...descriptor.tags], introduced: '26.11', localized: { de: { name: de[0], description: de[1] }, zh: { name: zh[0], description: zh[1] } } })),
  { id: 'platformer-trilogy', category: 'game', name: 'Skyline Trilogy', description: 'A three-stage platformer run: tutorial, moving-platform challenge and a timed coin arena, with checkpoints and a saved best time.', features: ['CharacterBody2D', 'One-way platforms', 'CameraFollow2D', 'Collectible2D', 'Scene flow'], difficulty: 'intermediate', setupMinutes: 10, tags: ['platformer', 'levels', 'checkpoints'], introduced: '26.42', localized: { de: { name: 'Skyline-Trilogie', description: 'Ein dreistufiger Plattformer-Lauf: Tutorial, Herausforderung mit bewegten Plattformen und zeitgebundene Münzarena, mit Checkpoints und gespeicherter Bestzeit.' }, zh: { name: '星跃三部曲', description: '三段式平台跳跃：教学、移动平台挑战与限时收集竞技场，含检查点与最佳成绩存档。' } } },
  { id: 'pendulum-post', category: 'game', name: 'Pendulum Post', description: 'A rope-and-joint physics puzzle: cut swinging chains at the right moment to deliver two balls past a motorised windmill into a cup.', features: ['RevoluteJoint2D', 'Joint motor', 'Materials', 'Mouse queries', 'CCD'], difficulty: 'intermediate', setupMinutes: 8, tags: ['puzzle', 'rope', 'joints'], introduced: '26.42', localized: { de: { name: 'Pendelpost', description: 'Ein Seil- und Gelenk-Physikrätsel: Schneide schwingende Ketten im richtigen Moment, um zwei Kugeln an einer motorisierten Windmühle vorbei in einen Becher zu bringen.' }, zh: { name: '钟摆邮差', description: '绳索与关节物理谜题：在恰当时机剪断摆动的链条，让两颗球绕过马达风车落入杯中。' } } },
  { id: 'reflex-lab', category: 'test', name: 'Reflex Lab', description: 'A reaction-time game with pointer-follow comparison, script frame statistics and a marker scene for external input-latency capture.', features: ['Reaction timer', 'MouseFollower2D', 'Frame stats', 'Latency marker', 'Save API'], difficulty: 'beginner', setupMinutes: 4, tags: ['latency', 'input', 'reaction'], introduced: '26.42', localized: { de: { name: 'Reflexlabor', description: 'Reaktionszeitspiel mit Zeigerfolge-Vergleich, Skript-Framestatistik und einer Markerszene für externe Eingabelatenz-Messungen.' }, zh: { name: '反应实验室', description: '反应时间小游戏，含指针跟随对比、脚本帧间隔统计，以及供外部输入延迟测量使用的标记场景。' } } },
] as const

export const PROJECT_TEMPLATES: readonly ProjectTemplateDescriptor[] = TEMPLATE_LIST.map(template => template.category === 'rhythm' || RHYTHM_ENGINE_TEMPLATES.has(template.id) ? template : { ...template, classic: true })

type JsonRecord = Record<string, unknown>

/** 从模板种子生成稳定的 UUID 形状标识，使重复生成时资源和实体引用保持一致。 */ function stableUuid(seed: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (const character of seed) {
    first = Math.imul(first ^ character.charCodeAt(0), 0x01000193) >>> 0
    second = Math.imul(second ^ character.charCodeAt(0), 0x85ebca6b) >>> 0
  }
  const half = `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`
  const hex = `${half}${half}`
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/* 返回具有所列字段的新对象 { uuid: stableUuid(`${seed}:${kind}`), kind, enabled: true, removed: false, data }。 */ function component(seed: string, kind: string, data: JsonRecord = {}): JsonRecord {
  return { uuid: stableUuid(`${seed}:${kind}`), kind, enabled: true, removed: false, data }
}

/** 创建带稳定身份和基础变换的实体序列化记录，再附加指定组件。 */ function entity(seed: string, name: string, position: [number, number], components: JsonRecord[], entityType = 'Box'): JsonRecord {
  return {
    uuid: stableUuid(`entity:${seed}`), name, enabled: true, editorVisible: true, editorLocked: false,
    tags: [], groups: [], persistentAcrossScenes: false, prefabAsset: null, prefabInstanceUuid: null,
    prefabSourceUuid: null, prefabOverrides: {}, entityType,
    components: [component(seed, 'Transform2D', { parentUuid: null, position: { x: position[0], y: position[1] }, rotation: 0, scale: { x: 1, y: 1 } }), ...components]
  }
}

/** 按方形、圆或三角形组合渲染器、刚体及碰撞器，应用物理选项并附加脚本和额外组件。 */ function shape(seed: string, name: string, position: [number, number], size: [number, number], options: {
  type?: 'Box' | 'Circle' | 'Triangle'; color?: [number, number, number]; body?: 'Dynamic' | 'Kinematic' | 'Static';
  sensor?: boolean; restitution?: number; friction?: number; continuous?: boolean; scriptAsset?: string; extra?: JsonRecord[]
} = {}): JsonRecord {
  const type = options.type ?? 'Box'
  const rendererShape = type === 'Circle' ? 'Ellipse' : type === 'Triangle' ? 'Polygon' : 'Rectangle'
  const colliderKind = type === 'Circle' ? 'EllipseCollider2D' : type === 'Triangle' ? 'PolygonCollider2D' : 'BoxCollider2D'
  const vertices = type === 'Triangle'
    ? [{ x: 0, y: -size[1] / 2 }, { x: size[0] / 2, y: size[1] / 2 }, { x: -size[0] / 2, y: size[1] / 2 }]
    : type === 'Box'
      ? [{ x: -size[0] / 2, y: -size[1] / 2 }, { x: size[0] / 2, y: -size[1] / 2 }, { x: size[0] / 2, y: size[1] / 2 }, { x: -size[0] / 2, y: size[1] / 2 }]
      : undefined
  const color = options.color ?? [105, 165, 255]
  const parts: JsonRecord[] = [
    component(seed, 'ShapeRenderer2D', { shape: rendererShape, vertices, radiusX: size[0] / 2, radiusY: size[1] / 2, color: { r: color[0], g: color[1], b: color[2] }, opacity: 100, strokeColor: { r: 220, g: 232, b: 255 }, strokeOpacity: 90, strokeWidth: .04, sortingLayer: 1, orderInLayer: 0, material: 'Default', filterMode: 'Linear' }),
    component(seed, 'RigidBody2D', { bodyType: options.body ?? 'Dynamic', massMode: 'Automatic', density: 1, mass: Math.max(1, size[0] * size[1]), autoInertia: true, gravityScale: 1, velocity: { x: 0, y: 0 }, continuousCollision: options.continuous ? 'Continuous' : 'Discrete', sleepingAllowed: true }),
    component(seed, colliderKind, { size: { x: size[0], y: size[1] }, radiusX: size[0] / 2, radiusY: size[1] / 2, vertices, sensor: options.sensor === true, physicsLayer: 0, collisionMask: 0xffffffff, oneWay: false, material: { restitution: options.restitution ?? 0, restitutionThreshold: 1, staticFriction: options.friction ?? .55, dynamicFriction: options.friction ?? .4 } })
  ]
  if (options.scriptAsset) parts.push(component(seed, 'Script2D', { scriptAsset: `asset://${options.scriptAsset}`, properties: {} }))
  parts.push(...(options.extra ?? []))
  return entity(seed, name, position, parts, type)
}

/** 创建具有完整视口、默认背景和正交尺寸的模板主摄像机。 */ function camera(seed = 'camera'): JsonRecord {
  return entity(seed, 'Main Camera', [0, 0], [component(seed, 'Camera2D', { active: true, orthographicSize: 10, zoom: 1, backgroundColor: { r: 20, g: 25, b: 34 }, pixelPerfect: false, viewport: { x: 0, y: 0, width: 1, height: 1 }, nearSortingLayer: -1000, farSortingLayer: 1000 })])
}

/** 创建模板摄像机并覆盖其正交可视尺寸。 */ function cameraAtSize(seed: string, orthographicSize: number): JsonRecord {
  const result = camera(seed)
  const cameraData = (result.components as JsonRecord[]).find(/* 比较 value.kind 与 'Camera2D'，返回严格相等的判断结果。 */ value => value.kind === 'Camera2D')?.data as JsonRecord
  cameraData.orthographicSize = orthographicSize
  return result
}

/** 若实体含刚体则设置其初始二维速度，返回原实体记录以支持组合构建。 */ function setInitialVelocity(value: JsonRecord, x: number, y: number): JsonRecord {
  const rigidBody = (value.components as JsonRecord[]).find(/* 比较 item.kind 与 'RigidBody2D'，返回严格相等的判断结果。 */ item => item.kind === 'RigidBody2D')?.data as JsonRecord | undefined
  if (rigidBody) rigidBody.velocity = { x, y }
  return value
}

/** 创建全屏参考画布及居中标题，并保持矩形布局和实体父级引用一致。 */ function canvasWithLabel(seed: string, text: string): JsonRecord[] {
  const canvasUuid = stableUuid(`entity:${seed}:canvas`)
  const canvas = entity(`${seed}:canvas`, 'HUD Canvas', [0, 0], [
    component(`${seed}:canvas`, 'RectTransform', { parentUuid: null, anchorPreset: 'stretch', position: { x: 0, y: 0 }, size: { x: 1920, y: 1080 } }),
    component(`${seed}:canvas`, 'Canvas', { referenceSize: { x: 1920, y: 1080 }, scaleWithScreen: true, sortingOrder: 100 })
  ])
  const label = entity(`${seed}:label`, 'Scene Title', [0, 0], [
    component(`${seed}:label`, 'RectTransform', { parentUuid: canvasUuid, anchorPreset: 'top', position: { x: 0, y: 48 }, size: { x: 900, y: 72 } }),
    component(`${seed}:label`, 'Text', { text, fontSize: 26, fontWeight: 650, align: 'center', color: { r: 239, g: 245, b: 255 }, opacity: 100 })
  ])
  ;(label.components as JsonRecord[])[0] = component(`${seed}:label`, 'Transform2D', { parentUuid: canvasUuid, position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } })
  return [canvas, label]
}

/** 将文本及其真实源字节摘要封装为可导入资源记录，附加默认导入设置和流水线元信息。 */ function textAsset(seed: string, name: string, assetType: 'script' | 'animation' | 'controller' | 'prefab' | 'localization' | 'uiTheme' | 'tileset' | 'other', path: string, source: string, mimeType: string): JsonRecord {
  const hash = sha256Bytes(assetSourceBytes(source))
  return {
    uuid: stableUuid(`asset:${seed}`), name, path, assetType,
    mimeType, byteLength: source.length, source, sourceModified: 0, importedAt: 0,
    width: 0, height: 0, duration: 0, fontFamily: '',
    settings: { filterMode: 'Linear', compression: 'Lossless', pixelsPerUnit: 100, spriteRegion: null, pivot: { x: .5, y: .5 }, atlas: false },
    pipeline: { importerVersion: 'template-4.2', platform: 'web', sourceHash: hash, artifactHash: hash, contentHash: hash, cacheKey: hash, status: 'ready', lastValidSource: source, error: '', dependencies: [], reverseDependencies: [], cacheHit: false }
  }
}

/** 在文本资源之上配置 Rhai API 版本、调试和热重载元信息。 */ function scriptAsset(seed: string, name: string, source: string): JsonRecord {
  return { ...textAsset(seed, `${name}.rhai`, 'script', `Assets/Scripts/${name}.rhai`, source, 'text/x-rhai'), script: { version: 1, apiVersion: 2, breakpoints: [], breakpointDetails: [], tests: [], packageDependencies: [], packageName: '', reloadPolicy: 'preserve', signalConnections: [], recoverySource: '', lastSavedHash: '' } }
}

/** 生成自包含 SVG 示例图标，构造图像资源并开启图集导入设置。 */ function imageAsset(seed: string, name: string, color: string): JsonRecord {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="${color}"/><path d="M36 68l18 18 40-44" fill="none" stroke="#f8fbff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  return {
    ...textAsset(seed, `${name}.svg`, 'prefab', `Assets/Sprites/${name}.svg`, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, 'image/svg+xml'),
    assetType: 'image', width: 128, height: 128,
    settings: { filterMode: 'Linear', compression: 'Lossless', pixelsPerUnit: 100, spriteRegion: null, pivot: { x: .5, y: .5 }, atlas: true }
  }
}

/** 生成地面、墙和水的图集及瓦片集，配置碰撞、导航、遮挡、变体与动画示例。 */ function worldTileAssets(seed: string): JsonRecord[] {
  const imageUuid = stableUuid(`asset:${seed}-atlas`), tileSetUuid = stableUuid(`asset:${seed}-tileset`)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="32"><rect width="32" height="32" fill="#4f8d62"/><rect x="32" width="32" height="32" fill="#6b5642"/><rect x="64" width="32" height="32" fill="#6ba7d6"/><path d="M35 5h26v22H35z" fill="none" stroke="#9a8061" stroke-width="3"/></svg>`
  const image = { ...textAsset(`${seed}-atlas`, `${seed} Atlas.svg`, 'prefab', `Assets/Tiles/${seed}-atlas.svg`, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, 'image/svg+xml'), uuid: imageUuid, assetType: 'image', width: 96, height: 32 }
  const tiles = [
    { index: 0, name: 'Ground', collision: 'None', polygon: [], terrain: 'Ground', navigationCost: 1, occluder: false, navigationPolygon: [], occlusionPolygon: [], metadata: { biome: 'ground' }, sceneAsset: null, prefabAsset: null, sourceId: 'primary', region: null, animation: null, variants: [{ tile: 1, weight: .08 }] },
    { index: 1, name: 'Wall', collision: 'Box', polygon: [], terrain: 'Wall', navigationCost: 0, occluder: true, navigationPolygon: [], occlusionPolygon: [], metadata: { solid: true }, sceneAsset: null, prefabAsset: null, sourceId: 'primary', region: null, animation: null, variants: [] },
    { index: 2, name: 'Water', collision: 'None', polygon: [], terrain: 'Water', navigationCost: 4, occluder: false, navigationPolygon: [], occlusionPolygon: [], metadata: { surface: 'water' }, sceneAsset: null, prefabAsset: null, sourceId: 'primary', region: null, animation: { frames: [2, 0], framesPerSecond: 2, mode: 'PingPong' }, variants: [] }
  ]
  const document = { version: 2, textureAsset: `asset://${imageUuid}`, sources: [{ id: 'primary', name: 'Template atlas', textureAsset: `asset://${imageUuid}`, margin: 0, spacing: 0 }], tileWidth: 32, tileHeight: 32, columns: 3, rows: 1, tiles }
  const tileSet = { ...textAsset(`${seed}-tileset`, `${seed}.nova-tileset`, 'tileset', `Assets/TileSets/${seed}.nova-tileset`, JSON.stringify(document), 'application/x-nova-tileset'), uuid: tileSetUuid }
  return [image, tileSet]
}

/** 生成八位单声道衰减正弦 WAV 短音，编码为内嵌数据 URI 音频资源。 */ function beepAsset(seed: string, name: string): JsonRecord {
  const sampleRate = 8_000
  const samples = 1_200
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const word = /** 将 WAV 头部的 ASCII 标识逐字节写入指定偏移。 */ (offset: number, value: string) => { for (let index = 0; index < value.length; index++) bytes[offset + index] = value.charCodeAt(index) }
  word(0, 'RIFF'); view.setUint32(4, 36 + samples, true); word(8, 'WAVE'); word(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true)
  word(36, 'data'); view.setUint32(40, samples, true)
  for (let index = 0; index < samples; index++) bytes[44 + index] = 128 + Math.round(Math.sin(index / sampleRate * Math.PI * 2 * 520) * 42 * (1 - index / samples))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return {
    ...textAsset(seed, `${name}.wav`, 'prefab', `Assets/Audio/${name}.wav`, `data:audio/wav;base64,${btoa(binary)}`, 'audio/wav'),
    assetType: 'audio', byteLength: bytes.byteLength, duration: samples / sampleRate
  }
}

/**
 * New projects step at 120 Hz with half the minimum substeps of the 60 Hz Balanced profile, so the
 * substeps per second stay at 480 while an input waits on average 4 ms (instead of 8 ms) for the next
 * fixed step. Existing projects keep their saved tick rate.
 */
const TEMPLATE_TICK_RATE = 120
function templatePhysicsProfile(): JsonRecord {
  return { ...PHYSICS_PROFILE_LIBRARY.Balanced, id: 'Custom', name: 'Responsive 120 Hz', tickRate: TEMPLATE_TICK_RATE, minimumSubsteps: 4 }
}

/** 构造带稳定身份、默认层、作者配置和固定步进物理设置的模板场景。 */ function scene(seed: string, name: string, entities: JsonRecord[], connections: JsonRecord[] = []): JsonRecord {
  return {
    uuid: stableUuid(`scene:${seed}`), name, loaded: true, layers: [1], activeLayer: 1, renderLayer: 'all',
    authoringSettings: defaultSceneAuthoringSettings(1),
    globalSettings: { gravity: 9.80665, airFriction: .01, timeScale: 1, tickRate: TEMPLATE_TICK_RATE, maxCatchUpSteps: DEFAULT_MAX_CATCH_UP_STEPS, collisionMatrix: defaultCollisionMatrix(), interpolation: 'Interpolate', layers: defaultPhysicsLayers(), profile: templatePhysicsProfile(), timerClock: 'fixed', eventDispatch: 'step' },
    entities, connections
  }
}

/** 组合模板场景和资源，创建新项目身份、教程、目录以及输入、音频、渲染、构建等默认配置。 */ function project(name: string, template: ProjectTemplateId, scenes: JsonRecord[], assets: JsonRecord[] = [], tutorial?: string): JsonRecord {
  const sceneIds = scenes.map(/* 调用 String(value.uuid) 并返回调用结果。 */ value => String(value.uuid))
  const metadata = newProjectMetadata(name, template)
  return {
    projectFormat: NOVA_PROJECT_FORMAT,
    projectFormatMajor: NOVA_PROJECT_FORMAT_MAJOR,
    formatVersion: NOVA_PROJECT_SCHEMA_VERSION,
    engineVersion: NOVA_ENGINE_VERSION,
    compatibility: projectCompatibility(),
    projectMetadata: metadata,
    manifest: normalizeProjectManifest(null, metadata),
    assets: [textAsset(`tutorial-${template}`, 'Getting Started.md', 'other', 'Assets/Tutorials/Getting Started.md', tutorial ?? `---\ndismissible: true\ntemplate: ${template}\n---\n# Welcome to ${name}\n\nThis project was created from the **${template}** template. Open the Scene, Assets, Script, Debug, and Manage workspaces to explore the configured systems. Dismiss this tutorial from its Asset Inspector when you are ready.`, 'text/markdown'), ...assets],
    assetFolders: ['Assets', 'Assets/Tutorials', 'Assets/Scenes', 'Assets/Sprites', 'Assets/Audio', 'Assets/Scripts', 'Assets/Fonts', 'Assets/Prefabs', 'Assets/Tiles', 'Assets/TileSets', 'Assets/Materials', 'Assets/Animations', 'Assets/Controllers', 'ProjectSettings', '.nova/cache', '.nova/imported'],
    assetDatabase: { version: 2, favorites: [], savedFilters: [], importPresets: [], collections: [], contentGroups: [{ id: 'main', name: 'Main', mode: 'embedded', optional: false }], viewMode: 'grid', thumbnailSize: 112 },
    plugins: [],
    packages: { manifestVersion: 1, installed: [], lockfile: [], offlineCache: [], offlineMode: true },
    projectSettings: {
      inputMap: defaultInputMap(), audio: defaultAudioSettings(), scripting: { apiVersion: 2, customSignals: [], maxConsoleEntries: 2000, debuggerEnabled: true, hotReloadEnabled: true, breakOnRuntimeError: true, deterministicTestSeed: 1, externalEditorProtocol: true },
      rendering: { lightingEnabled: false, ambientColor: { r: 255, g: 255, b: 255 }, ambientIntensity: 1, shadowQuality: 'Soft', colorSpace: 'sRGB', postProcessing: { enabled: false, exposure: 0, contrast: 1, saturation: 1, vignette: 0, bloom: 0, blur: 0, userMaterial: null }, debugView: 'None' },
      build: {
        gameName: name, target: 'windows', architecture: 'x86_64', runtimeMode: 'game', profile: 'debug', sceneOrder: sceneIds, startupSceneUuid: sceneIds[0], packageIntoExecutable: true, developmentBuild: true, outputDirectory: '',
        platform: { identifier: `top.whitelists.${name.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'game'}`, version: '1.0.0', iconAsset: null, splashAsset: null, orientation: 'auto', permissions: [], signingMode: 'none', signingIdentity: '', notarizationProfile: '' },
        delivery: {
          deterministic: true, incremental: true, compression: 'balanced', patchManifest: true, structuredLogs: true,
          crashReports: true, telemetryEnabled: false, telemetryEndpoint: '', privacyPolicyUrl: '',
          cacheMode: 'incremental', include: ['Assets/**'], exclude: ['**/*.psd', '**/*.kra', '.nova/**'],
          stripUnusedAssets: false, sizeReport: true, dependencyReport: true, debugSymbols: true, crashSymbols: true,
          releaseChannel: 'development', exportTemplate: 'windows-x64-v1', provenance: true, sbom: true, webHeaders: true,
          deploymentMode: 'local', deploymentDestination: '', signingHook: '', notarizationHook: '', cleanMachineJob: false,
          contentCache: true, deltaBuilds: true, ciMatrixVersion: 1, deploymentConnectorId: 'local', deploymentPermissionGranted: false
        }
      },
      world: { navigationDebug: false, areaDebug: false, chunkDebug: false, streamingEnabled: true, memoryBudgetMb: 256, originShiftThreshold: 10000 }
    },
    projectStructure: { assetsRoot: 'Assets', settingsRoot: 'ProjectSettings', cacheRoot: '.nova/cache', importedRoot: '.nova/imported' },
    activeSceneUuid: sceneIds[0], scenes
  }
}

/* 调用 project(name, 'empty', [scene('main', 'Main Scene', [camera()])]) 并返回调用结果。 */ function emptyTemplate(name: string): JsonRecord {
  return project(name, 'empty', [scene('main', 'Main Scene', [camera()])])
}

/** 将模板根实体封装为第二版预制体文档和对应文本资源。 */ function prefabAsset(seed: string, name: string, root: JsonRecord): JsonRecord {
  const document = {
    prefabVersion: 2,
    name,
    bundle: { entities: [root], connections: [], rootUuids: [root.uuid] },
    variantOf: null,
    sourceChecksum: 'template',
    createdAt: new Date(0).toISOString()
  }
  return textAsset(seed, `${name}.nova-prefab`, 'prefab', `Assets/Prefabs/${name}.nova-prefab`, JSON.stringify(document), 'application/x-nova-prefab')
}

/** 构建鼠标推动方块游戏，配置八个动态预制目标、计分定时脚本、完成提示和可运行教程。 */ function mouseKnockoutTemplate(name: string): JsonRecord {
  const managerScriptId = stableUuid('asset:mouse-knockout-manager')
  const targetPrefabId = stableUuid('asset:mouse-knockout-target-prefab')
  const targetReference = `asset://${targetPrefabId}`
  const managerSource = `@export(type="int", min=1, max=64, step=1, group="Game", tooltip="Targets that must leave the camera view") let remaining = 8;
fn start() {
  score_set(0.0);
  entity_set_enabled(find_entity_handle("Congratulations Bar"), false);
  entity_set_enabled(find_entity_handle("Congratulations Text"), false);
  ui_set_text_on(find_entity_handle("Score Text"), "Score  0 / 8");
  spawn_at("${targetReference}", -6.0, -3.8, 0.0, 1.0, 1.0);
  spawn_at("${targetReference}", -2.2, -3.4, 0.0, 1.0, 1.0);
  spawn_at("${targetReference}", 2.2, -3.4, 0.0, 1.0, 1.0);
  spawn_at("${targetReference}", 6.0, -3.8, 0.0, 1.0, 1.0);
  spawn_at("${targetReference}", -6.0, 3.8, 0.0, 1.0, 1.0);
  spawn_at("${targetReference}", -2.2, 3.4, 0.0, 1.0, 1.0);
  spawn_at("${targetReference}", 2.2, 3.4, 0.0, 1.0, 1.0);
  spawn_at("${targetReference}", 6.0, 3.8, 0.0, 1.0, 1.0);
  timer_start("bounds", 0.05, true);
}
fn on_timer(name) {
  if name != "bounds" || remaining <= 0 { return; }
  let previous = remaining;
  let margin = 0.8;
  for target in query_group("knockout-target", 16) {
    let x = entity_position_x_on(target);
    let y = entity_position_y_on(target);
    if x < view_min_x() - margin || x > view_max_x() + margin || y < view_min_y() - margin || y > view_max_y() + margin {
      entity_destroy(target);
      score_add(1.0);
      remaining = remaining - 1;
    }
  }
  if remaining != previous {
    ui_set_text_on(find_entity_handle("Score Text"), \`Score  \${8 - remaining} / 8\`);
  }
  if remaining == 0 {
    timer_cancel("bounds");
    entity_set_enabled(find_entity_handle("Congratulations Bar"), true);
    entity_set_enabled(find_entity_handle("Congratulations Text"), true);
  }
}`
  const player = shape('mouse-knockout-player', 'Mouse Player', [0, 0], [1.6, 1.6], {
    body: 'Kinematic', color: [94, 181, 255], restitution: .7, friction: .08,
    extra: [component('mouse-knockout-player', 'MouseFollower2D', { offset: { x: 0, y: 0 }, maximumSpeed: 40 })]
  })
  const targetPrefabRoot = shape('mouse-knockout-target-prefab-root', 'Knockout Target', [0, 0], [1.25, 1.25], {
    body: 'Dynamic', color: [246, 157, 91], restitution: .86, friction: .08
  })
  targetPrefabRoot.groups = ['knockout-target']
  const manager = entity('mouse-knockout-manager', 'Game Manager', [0, 0], [
    component('mouse-knockout-manager', 'Script2D', { scriptAsset: `asset://${managerScriptId}`, properties: {} })
  ])
  const canvasUuid = stableUuid('entity:mouse-knockout-canvas')
  const canvas = entity('mouse-knockout-canvas', 'Game HUD', [0, 0], [
    component('mouse-knockout-canvas', 'RectTransform', { parentUuid: null, anchorPreset: 'stretch', position: { x: 0, y: 0 }, size: { x: 1920, y: 1080 } }),
    component('mouse-knockout-canvas', 'Canvas', { referenceSize: { x: 1920, y: 1080 }, scaleWithScreen: true, sortingOrder: 100 })
  ])
  const score = uiElement('mouse-knockout-score', 'Score Text', canvasUuid, [-710, -470], [420, 64], 'Text', { text: 'Score  0 / 8', fontSize: 30, fontWeight: 700, align: 'left', color: { r: 242, g: 247, b: 255 }, opacity: 100 })
  const help = uiElement('mouse-knockout-help', 'Instruction Text', canvasUuid, [0, -470], [920, 64], 'Text', { text: 'Move the blue block with your mouse. Knock every orange target out of view.', fontSize: 23, fontWeight: 560, align: 'center', color: { r: 211, g: 220, b: 234 }, opacity: 100 })
  const winBar = uiElement('mouse-knockout-win-bar', 'Congratulations Bar', canvasUuid, [0, 0], [820, 150], 'Panel', { color: { r: 24, g: 56, b: 48 }, opacity: 97, cornerRadius: 24, clipping: true })
  const winText = uiElement('mouse-knockout-win-text', 'Congratulations Text', canvasUuid, [0, 0], [760, 100], 'Text', { text: 'Congratulations!  All targets cleared.', fontSize: 36, fontWeight: 750, align: 'center', color: { r: 185, g: 255, b: 220 }, opacity: 100 })
  winBar.enabled = false
  winText.enabled = false
  const gameScene = scene('mouse-knockout', 'Mouse Knockout Arena', [camera('mouse-knockout-camera'), player, manager, canvas, score, help, winBar, winText])
  ;(gameScene.globalSettings as JsonRecord).gravity = 0
  const tutorial = `---
dismissible: true
template: mouse-knockout
---
# Mouse Knockout — playable starter

Press **Play**, move the blue block with the mouse, and knock all eight orange targets outside the camera view. Every cleared target adds one point; the completion banner appears at 8 / 8.

## Where the game logic lives

- **MouseFollower2D** converts the Game-view pointer to world coordinates inside the native fixed-step runtime. The template's 40-world-unit/s cap keeps collision impulses stable; 0 remains the optional unrestricted mode.
- **KnockoutGameManager.rhai** spawns eight instances from **Knockout Target.nova-prefab**, checks the prefab's **knockout-target** group on a 50 ms timer, scores and destroys out-of-view targets, updates **Score Text**, and reveals the two congratulations UI objects.

## Build a Windows game

Open **Manage → Build Settings**, keep **Windows / x86_64 / Game / Package into executable**, select this scene as Startup, then choose **Build & Run** in the desktop editor. Browser-only editor sessions can make a web build but cannot compile a native .exe.`
  return project(name, 'mouse-knockout', [gameScene], [
    scriptAsset('mouse-knockout-manager', 'KnockoutGameManager', managerSource),
    prefabAsset('mouse-knockout-target-prefab', 'Knockout Target', targetPrefabRoot)
  ], tutorial)
}

/** 构建网格贪吃蛇游戏，配置定时移动、信号传递身体、拾取成长、自碰撞结束及键盘手柄输入。 */ function snakeTemplate(name: string): JsonRecord {
  const headScriptId = stableUuid('asset:snake-head-controller')
  const foodScriptId = stableUuid('asset:snake-food-controller')
  const scoreScriptId = stableUuid('asset:snake-score-controller')
  const segmentScriptIds = Array.from({ length: 8 }, /* 调用 stableUuid(`asset:snake-segment-${index + 1}`) 并返回调用结果。 */ (_, index) => stableUuid(`asset:snake-segment-${index + 1}`))
  const headSource = `@export(type="float", min=-1, max=1, step=1, group="Runtime", tooltip="Current horizontal grid direction") let direction_x = 1.0;\n@export(type="float", min=-1, max=1, step=1, group="Runtime", tooltip="Current vertical grid direction") let direction_y = 0.0;\n@export(type="bool", group="Runtime", tooltip="Whether the snake is accepting movement") let running = true;\nfn start() { running = true; timer_start("snake-step", 0.16, true); }\nfn update(dt) {\n  if !running { return; }\n  if input_pressed("MoveUp") && direction_y != 1.0 { direction_x = 0.0; direction_y = -1.0; }\n  if input_pressed("MoveDown") && direction_y != -1.0 { direction_x = 0.0; direction_y = 1.0; }\n  if input_pressed("MoveLeft") && direction_x != 1.0 { direction_x = -1.0; direction_y = 0.0; }\n  if input_pressed("MoveRight") && direction_x != -1.0 { direction_x = 1.0; direction_y = 0.0; }\n}\nfn on_timer(name) {\n  if name != "snake-step" || !running { return; }\n  let pose = transform();\n  let next_x = pose.position_x + direction_x * 1.2;\n  let next_y = pose.position_y + direction_y * 1.2;\n  if next_x > 8.4 { next_x = -8.4; }\n  if next_x < -8.4 { next_x = 8.4; }\n  if next_y > 4.8 { next_y = -4.8; }\n  if next_y < -4.8 { next_y = 4.8; }\n  signal_emit("snake.segment.1", #{ x: pose.position_x, y: pose.position_y });\n  set_position(next_x, next_y);\n}\nfn on_signal(name, payload, source) {\n  if name == "snake.game.over" { running = false; timer_cancel("snake-step"); }\n}`
  const segmentSource = /** 为指定蛇身序号生成位置传递与头部触发检测脚本，末节不再向后发送信号。 */ (index: number) => `fn on_signal(name, payload, source) {\n  if name != "snake.segment.${index}" { return; }\n  let pose = transform();\n  let target_x = payload.x.to_float();\n  let target_y = payload.y.to_float();\n  set_position(target_x, target_y);${index < 8 ? `\n  signal_emit("snake.segment.${index + 1}", #{ x: pose.position_x, y: pose.position_y });` : ''}\n}\nfn on_trigger_enter(other, px, py, nx, ny, rvx, rvy) {\n  if other == find_entity("Snake Head") { signal_emit("snake.game.over", ${index}); }\n}`
  const foodSource = `@export(type="int", min=0, max=7, step=1, group="Runtime", tooltip="Next grid-safe food position") let food_index = 0;\nfn on_trigger_enter(other, px, py, nx, ny, rvx, rvy) {\n  if other != find_entity("Snake Head") { return; }\n  signal_emit("snake.scored", 1);\n  food_index = (food_index + 1) % 8;\n  if food_index == 0 { set_position(4.8, 1.2); }\n  else if food_index == 1 { set_position(-4.8, -2.4); }\n  else if food_index == 2 { set_position(7.2, 3.6); }\n  else if food_index == 3 { set_position(0.0, -4.8); }\n  else if food_index == 4 { set_position(-7.2, 4.8); }\n  else if food_index == 5 { set_position(3.6, -1.2); }\n  else if food_index == 6 { set_position(-2.4, 3.6); }\n  else { set_position(8.4, 0.0); }\n}`
  const scoreSource = `@export(type="int", min=0, max=999999, step=1, group="Game", tooltip="Collected food") let score = 0;\n@export(type="bool", group="Runtime", tooltip="Whether self-collision ended the run") let game_over = false;\nfn start() {\n  score = 0; game_over = false; ui_set_text("Score  0");\n  entity_set_enabled(find_entity_handle("Game Over Panel"), false);\n  entity_set_enabled(find_entity_handle("Game Over Text"), false);\n}\nfn on_signal(name, payload, source) {\n  if name == "snake.game.over" {\n    if game_over { return; }\n    game_over = true;\n    entity_set_enabled(find_entity_handle("Game Over Panel"), true);\n    entity_set_enabled(find_entity_handle("Game Over Text"), true);\n    return;\n  }\n  if name != "snake.scored" || game_over { return; }\n  score = score + 1;\n  ui_set_text(\`Score  \${score}\`);\n  if score == 1 { entity_set_enabled(find_entity_handle("Snake Segment 4"), true); }\n  else if score == 2 { entity_set_enabled(find_entity_handle("Snake Segment 5"), true); }\n  else if score == 3 { entity_set_enabled(find_entity_handle("Snake Segment 6"), true); }\n  else if score == 4 { entity_set_enabled(find_entity_handle("Snake Segment 7"), true); }\n  else if score == 5 { entity_set_enabled(find_entity_handle("Snake Segment 8"), true); }\n}`
  const head = shape('snake-head', 'Snake Head', [0, 0], [1, 1], { body: 'Kinematic', color: [94, 203, 181], scriptAsset: headScriptId })
  const segments = segmentScriptIds.map(/** 创建对应序号的蛇身运动学传感实体，仅前三节初始启用，其余等待拾取解锁。 */ (scriptId, offset) => {
    const index = offset + 1
    const segment = shape(`snake-segment-${index}`, `Snake Segment ${index}`, [-1.2 * index, 0], [1, 1], { body: 'Kinematic', sensor: true, color: [67 + index * 6, 159 + index * 4, 143 + index * 3], scriptAsset: scriptId })
    if (index > 3) segment.enabled = false
    return segment
  })
  const food = shape('snake-food', 'Food', [4.8, 1.2], [.9, .9], { type: 'Circle', body: 'Static', sensor: true, color: [242, 118, 118], scriptAsset: foodScriptId })
  const canvasUuid = stableUuid('entity:snake-ui-canvas')
  const canvas = entity('snake-ui-canvas', 'HUD Canvas', [0, 0], [
    component('snake-ui-canvas', 'RectTransform', { parentUuid: null, anchorPreset: 'stretch', position: { x: 0, y: 0 }, size: { x: 1920, y: 1080 }, focusable: false, skipNavigation: true }),
    component('snake-ui-canvas', 'Canvas', { referenceSize: { x: 1920, y: 1080 }, scaleWithScreen: true, sortingOrder: 100 })
  ])
  const score = entity('snake-score', 'Score', [0, 0], [
    component('snake-score', 'RectTransform', { parentUuid: canvasUuid, anchorPreset: 'top-left', position: { x: 44, y: 38 }, size: { x: 340, y: 70 }, focusable: false, skipNavigation: true, accessibilityLabel: 'Score' }),
    component('snake-score', 'Text', { text: 'Score  0', fontSize: 32, fontWeight: 760, align: 'left', color: { r: 239, g: 245, b: 255 }, opacity: 100 }),
    component('snake-score', 'Script2D', { scriptAsset: `asset://${scoreScriptId}`, properties: {} })
  ])
  ;(score.components as JsonRecord[])[0] = component('snake-score', 'Transform2D', { parentUuid: canvasUuid, position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } })
  const controls = entity('snake-controls', 'Controls', [0, 0], [
    component('snake-controls', 'RectTransform', { parentUuid: canvasUuid, anchorPreset: 'bottom', position: { x: 0, y: -34 }, size: { x: 900, y: 54 }, focusable: false, skipNavigation: true, accessibilityLabel: 'Movement controls' }),
    component('snake-controls', 'Text', { text: 'Move: Arrow keys / WASD / gamepad D-pad', fontSize: 22, fontWeight: 620, align: 'center', color: { r: 176, g: 190, b: 210 }, opacity: 100 })
  ])
  ;(controls.components as JsonRecord[])[0] = component('snake-controls', 'Transform2D', { parentUuid: canvasUuid, position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } })
  const gameOverPanel = uiElement('snake-game-over-panel', 'Game Over Panel', canvasUuid, [0, 0], [720, 160], 'Panel', { color: { r: 52, g: 31, b: 43 }, opacity: 98, cornerRadius: 24, clipping: true })
  const gameOverText = uiElement('snake-game-over-text', 'Game Over Text', canvasUuid, [0, 0], [660, 100], 'Text', { text: 'Game over — the snake hit its body.', fontSize: 34, fontWeight: 760, align: 'center', color: { r: 255, g: 201, b: 216 }, opacity: 100 })
  gameOverPanel.enabled = false
  gameOverText.enabled = false
  const gameScene = scene('snake-game', 'Snake Game', [camera('snake-camera'), head, ...segments, food, canvas, score, controls, gameOverPanel, gameOverText])
  ;(gameScene.globalSettings as JsonRecord).gravity = 0
  const result = project(name, 'snake', [gameScene], [
    scriptAsset('snake-head-controller', 'SnakeHead', headSource),
    ...segmentScriptIds.map(/* 调用 scriptAsset(`snake-segment-${index + 1}`, `SnakeSegment${index + 1}`, segmentSource(index + 1)) 并返回调用结果。 */ (_, index) => scriptAsset(`snake-segment-${index + 1}`, `SnakeSegment${index + 1}`, segmentSource(index + 1))),
    scriptAsset('snake-food-controller', 'SnakeFood', foodSource),
    scriptAsset('snake-score-controller', 'SnakeScore', scoreSource)
  ], `---\ndismissible: true\ntemplate: snake\n---\n# Snake\n\nPress **Play** and steer with **WASD**, **Arrow keys**, or a gamepad D-pad. Food always appears on the same 1.2-world-unit grid used by the head. Each of the first five pickups enables another linked body segment. Crossing the screen edge wraps to the opposite side; touching the snake's own body stops the timer and shows the game-over panel.`)
  ;((result.projectSettings as JsonRecord).inputMap as JsonRecord[]) = [
    { name: 'MoveUp', kind: 'button', bindings: [{ device: 'keyboard', code: 'ArrowUp' }, { device: 'keyboard', code: 'KeyW' }, { device: 'gamepad-button', code: '12' }] },
    { name: 'MoveDown', kind: 'button', bindings: [{ device: 'keyboard', code: 'ArrowDown' }, { device: 'keyboard', code: 'KeyS' }, { device: 'gamepad-button', code: '13' }] },
    { name: 'MoveLeft', kind: 'button', bindings: [{ device: 'keyboard', code: 'ArrowLeft' }, { device: 'keyboard', code: 'KeyA' }, { device: 'gamepad-button', code: '14' }] },
    { name: 'MoveRight', kind: 'button', bindings: [{ device: 'keyboard', code: 'ArrowRight' }, { device: 'keyboard', code: 'KeyD' }, { device: 'gamepad-button', code: '15' }] }
  ]
  return result
}

/** 构建双人弹球场景，配置独立球拍输入、连续碰撞、出界得分和七分获胜提示。 */ function pongTemplate(name: string): JsonRecord {
  const leftScriptId = stableUuid('asset:pong-left-paddle')
  const rightScriptId = stableUuid('asset:pong-right-paddle')
  const ballScriptId = stableUuid('asset:pong-ball')
  const managerScriptId = stableUuid('asset:pong-manager')
  const paddleSource = /** 按指定输入轴生成球拍固定步移动脚本，并将纵坐标限制在场地范围。 */ (action: string) => `@export(type="float", min=1, max=20, step=0.1, group="Movement", tooltip="Paddle speed in world units per second") let speed = 10.0;
fn fixed_update(dt) {
  let pose = transform();
  let next_y = pose.position_y + input_axis("${action}") * speed * dt;
  if next_y > 4.25 { next_y = 4.25; }
  if next_y < -4.25 { next_y = -4.25; }
  set_position(pose.position_x, next_y);
}`
  const ballSource = `fn serve(direction) {
  set_position(0.0, 0.0);
  set_velocity(direction * 8.5, random_range(-3.8, 3.8));
}
fn start() {
  serve(1.0);
  timer_start("score-check", 0.03, true);
}
fn on_timer(name) {
  if name != "score-check" { return; }
  let pose = transform();
  if pose.position_x < view_min_x() - 0.4 {
    signal_emit("pong.point.right", 1);
    serve(-1.0);
  } else if pose.position_x > view_max_x() + 0.4 {
    signal_emit("pong.point.left", 1);
    serve(1.0);
  }
}`
  const managerSource = `@export(type="int", min=1, max=99, step=1, group="Rules", tooltip="Points needed to win") let winning_score = 7;
@export(type="int", min=0, max=99, step=1, group="Runtime", tooltip="Left player score") let left_score = 0;
@export(type="int", min=0, max=99, step=1, group="Runtime", tooltip="Right player score") let right_score = 0;
fn start() {
  score_set(0.0);
  ui_set_text_on(find_entity_handle("Pong Score"), "0   :   0");
  entity_set_enabled(find_entity_handle("Victory Panel"), false);
  entity_set_enabled(find_entity_handle("Victory Text"), false);
}
fn on_signal(name, payload, source) {
  if name == "pong.point.left" { left_score = left_score + 1; }
  else if name == "pong.point.right" { right_score = right_score + 1; }
  else { return; }
  score_add(1.0);
  ui_set_text_on(find_entity_handle("Pong Score"), \`${'${left_score}'}   :   ${'${right_score}'}\`);
  if left_score >= winning_score || right_score >= winning_score {
    entity_set_enabled(find_entity_handle("Ball"), false);
    entity_set_enabled(find_entity_handle("Victory Panel"), true);
    entity_set_enabled(find_entity_handle("Victory Text"), true);
    if left_score > right_score { ui_set_text_on(find_entity_handle("Victory Text"), "Left player wins!"); }
    else { ui_set_text_on(find_entity_handle("Victory Text"), "Right player wins!"); }
  }
}`
  const manager = entity('pong-manager', 'Game Manager', [0, 0], [component('pong-manager', 'Script2D', { scriptAsset: `asset://${managerScriptId}`, properties: {} })])
  const left = shape('pong-left', 'Left Paddle', [-8.6, 0], [.55, 2.6], { body: 'Kinematic', color: [95, 184, 255], restitution: 1, friction: 0, scriptAsset: leftScriptId })
  const right = shape('pong-right', 'Right Paddle', [8.6, 0], [.55, 2.6], { body: 'Kinematic', color: [255, 166, 94], restitution: 1, friction: 0, scriptAsset: rightScriptId })
  const ball = setInitialVelocity(shape('pong-ball', 'Ball', [0, 0], [.58, .58], { type: 'Circle', color: [242, 247, 255], restitution: 1, friction: 0, continuous: true, scriptAsset: ballScriptId }), 8.5, 2.4)
  const walls = [
    shape('pong-top-wall', 'Top Wall', [0, 5.72], [19.8, .35], { body: 'Static', color: [76, 89, 107], restitution: 1, friction: 0 }),
    shape('pong-bottom-wall', 'Bottom Wall', [0, -5.72], [19.8, .35], { body: 'Static', color: [76, 89, 107], restitution: 1, friction: 0 })
  ]
  const canvasUuid = stableUuid('entity:pong-canvas')
  const canvas = entity('pong-canvas', 'Pong HUD', [0, 0], [
    component('pong-canvas', 'RectTransform', { parentUuid: null, anchorPreset: 'stretch', position: { x: 0, y: 0 }, size: { x: 1920, y: 1080 } }),
    component('pong-canvas', 'Canvas', { referenceSize: { x: 1920, y: 1080 }, scaleWithScreen: true, sortingOrder: 100 })
  ])
  const score = uiElement('pong-score', 'Pong Score', canvasUuid, [0, -455], [520, 80], 'Text', { text: '0   :   0', fontSize: 42, fontWeight: 760, align: 'center', color: { r: 240, g: 246, b: 255 }, opacity: 100 })
  const controls = uiElement('pong-controls', 'Controls', canvasUuid, [0, 470], [1000, 56], 'Text', { text: 'Left: W / S     Right: Arrow Up / Arrow Down     First to 7 wins', fontSize: 22, fontWeight: 600, align: 'center', color: { r: 181, g: 195, b: 216 }, opacity: 100 })
  const victoryPanel = uiElement('pong-victory-panel', 'Victory Panel', canvasUuid, [0, 0], [700, 150], 'Panel', { color: { r: 26, g: 54, b: 67 }, opacity: 98, cornerRadius: 24, clipping: true })
  const victoryText = uiElement('pong-victory-text', 'Victory Text', canvasUuid, [0, 0], [640, 90], 'Text', { text: 'Left player wins!', fontSize: 38, fontWeight: 760, align: 'center', color: { r: 187, g: 229, b: 255 }, opacity: 100 })
  victoryPanel.enabled = false
  victoryText.enabled = false
  const gameScene = scene('pong-game', 'Pong Arena', [cameraAtSize('pong-camera', 6), manager, ...walls, left, right, ball, canvas, score, controls, victoryPanel, victoryText])
  ;(gameScene.globalSettings as JsonRecord).gravity = 0
  const result = project(name, 'pong', [gameScene], [
    scriptAsset('pong-left-paddle', 'PongLeftPaddle', paddleSource('P1Vertical')),
    scriptAsset('pong-right-paddle', 'PongRightPaddle', paddleSource('P2Vertical')),
    scriptAsset('pong-ball', 'PongBall', ballSource),
    scriptAsset('pong-manager', 'PongManager', managerSource)
  ], `---\ndismissible: true\ntemplate: pong\n---\n# Pong\n\nPress **Play**. The left player uses **W/S**, the right player uses **Arrow Up/Down**, and the first player to seven points wins. The ball uses continuous collision detection and physical restitution.`)
  ;((result.projectSettings as JsonRecord).inputMap as JsonRecord[]) = [
    { name: 'P1Vertical', kind: 'axis', bindings: [{ device: 'keyboard', code: 'KeyW', scale: 1, x: 0, y: 1, gamepad: 0, deadzone: .15 }, { device: 'keyboard', code: 'KeyS', scale: -1, x: 0, y: -1, gamepad: 0, deadzone: .15 }] },
    { name: 'P2Vertical', kind: 'axis', bindings: [{ device: 'keyboard', code: 'ArrowUp', scale: 1, x: 0, y: 1, gamepad: 0, deadzone: .15 }, { device: 'keyboard', code: 'ArrowDown', scale: -1, x: 0, y: -1, gamepad: 0, deadzone: .15 }] }
  ]
  return result
}

/** 构建二十四砖块打砖游戏，配置横向球拍、反弹球重置、碰撞计分及清场提示。 */ function breakoutTemplate(name: string): JsonRecord {
  const paddleScriptId = stableUuid('asset:breakout-paddle')
  const ballScriptId = stableUuid('asset:breakout-ball')
  const brickScriptId = stableUuid('asset:breakout-brick')
  const managerScriptId = stableUuid('asset:breakout-manager')
  const paddleSource = `@export(type="float", min=1, max=25, step=0.1, group="Movement", tooltip="Paddle speed") let speed = 13.0;
fn fixed_update(dt) {
  let pose = transform();
  let next_x = pose.position_x + input_axis("MoveHorizontal") * speed * dt;
  if next_x > 7.7 { next_x = 7.7; }
  if next_x < -7.7 { next_x = -7.7; }
  set_position(next_x, pose.position_y);
}`
  const ballSource = `fn reset_ball() {
  set_position(0.0, -3.4);
  // Keep a guaranteed horizontal component so the ball can never enter a vertical lock.
  set_velocity(random_range(2.8, 4.8), 8.2);
}
fn start() {
  reset_ball();
  timer_start("bounds", 0.03, true);
}
fn on_timer(name) {
  if name == "bounds" && transform().position_y < view_min_y() - 0.5 { reset_ball(); }
}`
  const brickSource = `fn on_collision_enter(other, px, py, nx, ny, rvx, rvy) {
  if other != find_entity("Ball") { return; }
  score_add(1.0);
  signal_emit("breakout.brick", 1);
  destroy();
}`
  const managerSource = `@export(type="int", min=1, max=200, step=1, group="Rules", tooltip="Authored brick count") let brick_count = 24;
fn start() {
  score_set(0.0);
  ui_set_text_on(find_entity_handle("Breakout Score"), "Bricks  0 / 24");
  entity_set_enabled(find_entity_handle("Clear Panel"), false);
  entity_set_enabled(find_entity_handle("Clear Text"), false);
}
fn on_signal(name, payload, source) {
  if name != "breakout.brick" { return; }
  let cleared = score_get().to_int();
  ui_set_text_on(find_entity_handle("Breakout Score"), \`Bricks  ${'${cleared}'} / ${'${brick_count}'}\`);
  if cleared >= brick_count {
    entity_set_enabled(find_entity_handle("Ball"), false);
    entity_set_enabled(find_entity_handle("Clear Panel"), true);
    entity_set_enabled(find_entity_handle("Clear Text"), true);
  }
}`
  const manager = entity('breakout-manager', 'Game Manager', [0, 0], [component('breakout-manager', 'Script2D', { scriptAsset: `asset://${managerScriptId}`, properties: {} })])
  const paddle = shape('breakout-paddle', 'Paddle', [0, -4.8], [3, .48], { body: 'Kinematic', color: [91, 176, 255], restitution: 1, friction: 0, scriptAsset: paddleScriptId })
  const ball = setInitialVelocity(shape('breakout-ball', 'Ball', [0, -3.4], [.5, .5], { type: 'Circle', color: [247, 250, 255], restitution: 1, friction: 0, continuous: true, scriptAsset: ballScriptId }), 4.8, 8.2)
  const walls = [
    shape('breakout-left-wall', 'Left Wall', [-9.65, 0], [.35, 11.7], { body: 'Static', color: [77, 91, 110], restitution: 1, friction: 0 }),
    shape('breakout-right-wall', 'Right Wall', [9.65, 0], [.35, 11.7], { body: 'Static', color: [77, 91, 110], restitution: 1, friction: 0 }),
    shape('breakout-top-wall', 'Top Wall', [0, 5.72], [19.6, .35], { body: 'Static', color: [77, 91, 110], restitution: 1, friction: 0 })
  ]
  const palette: Array<[number, number, number]> = [[245, 113, 121], [244, 164, 92], [239, 204, 99]]
  const bricks = Array.from({ length: 24 }, /** 按三行八列布置独立静态砖块，为每行应用配色并绑定碰撞计分脚本。 */ (_, index) => {
    const row = Math.floor(index / 8), column = index % 8
    return shape(`breakout-brick-${index}`, `Brick ${index + 1}`, [-7.7 + column * 2.2, 1.5 + row * 1.1], [1.85, .7], { body: 'Static', color: palette[row], restitution: 1, friction: 0, scriptAsset: brickScriptId })
  })
  const canvasUuid = stableUuid('entity:breakout-canvas')
  const canvas = entity('breakout-canvas', 'Breakout HUD', [0, 0], [
    component('breakout-canvas', 'RectTransform', { parentUuid: null, anchorPreset: 'stretch', position: { x: 0, y: 0 }, size: { x: 1920, y: 1080 } }),
    component('breakout-canvas', 'Canvas', { referenceSize: { x: 1920, y: 1080 }, scaleWithScreen: true, sortingOrder: 100 })
  ])
  const score = uiElement('breakout-score', 'Breakout Score', canvasUuid, [-690, -470], [430, 64], 'Text', { text: 'Bricks  0 / 24', fontSize: 29, fontWeight: 720, align: 'left', color: { r: 239, g: 245, b: 255 }, opacity: 100 })
  const controls = uiElement('breakout-controls', 'Controls', canvasUuid, [0, 470], [850, 54], 'Text', { text: 'Move paddle: A / D or Left / Right', fontSize: 22, fontWeight: 600, align: 'center', color: { r: 181, g: 195, b: 216 }, opacity: 100 })
  const clearPanel = uiElement('breakout-clear-panel', 'Clear Panel', canvasUuid, [0, 0], [760, 150], 'Panel', { color: { r: 24, g: 60, b: 49 }, opacity: 98, cornerRadius: 24, clipping: true })
  const clearText = uiElement('breakout-clear-text', 'Clear Text', canvasUuid, [0, 0], [700, 90], 'Text', { text: 'Board cleared — congratulations!', fontSize: 36, fontWeight: 760, align: 'center', color: { r: 183, g: 255, b: 219 }, opacity: 100 })
  clearPanel.enabled = false
  clearText.enabled = false
  const gameScene = scene('breakout-game', 'Breakout Board', [cameraAtSize('breakout-camera', 6), manager, ...walls, paddle, ball, ...bricks, canvas, score, controls, clearPanel, clearText])
  ;(gameScene.globalSettings as JsonRecord).gravity = 0
  const result = project(name, 'breakout', [gameScene], [
    scriptAsset('breakout-paddle', 'BreakoutPaddle', paddleSource), scriptAsset('breakout-ball', 'BreakoutBall', ballSource),
    scriptAsset('breakout-brick', 'BreakoutBrick', brickSource), scriptAsset('breakout-manager', 'BreakoutManager', managerSource)
  ], `---\ndismissible: true\ntemplate: breakout\n---\n# Breakout\n\nPress **Play**, move with **A/D** or **Left/Right**, and clear all 24 bricks. The ball uses continuous collision detection, each brick is a real collider, and the HUD is driven by runtime signals.`)
  ;((result.projectSettings as JsonRecord).inputMap as JsonRecord[]) = [{ name: 'MoveHorizontal', kind: 'axis', bindings: [
    { device: 'keyboard', code: 'KeyA', scale: -1, x: -1, y: 0, gamepad: 0, deadzone: .15 }, { device: 'keyboard', code: 'ArrowLeft', scale: -1, x: -1, y: 0, gamepad: 0, deadzone: .15 },
    { device: 'keyboard', code: 'KeyD', scale: 1, x: 1, y: 0, gamepad: 0, deadzone: .15 }, { device: 'keyboard', code: 'ArrowRight', scale: 1, x: 1, y: 0, gamepad: 0, deadzone: .15 }
  ] }]
  return result
}

/** 构建平台角色示例，组合跳跃与土狼时间、动画、音效、瓦片地图、导航和灯光资源。 */ function platformerTemplate(name: string): JsonRecord {
  const scriptId = stableUuid('asset:platformer-controller')
  const spriteId = stableUuid('asset:platformer-player-sprite')
  const audioId = stableUuid('asset:platformer-jump-audio')
  const clipId = stableUuid('asset:platformer-idle-clip')
  const controllerId = stableUuid('asset:platformer-animator-controller')
  const tileSetId = stableUuid('asset:platformer-world-tileset')
  const source = `@export(type="float", min=0, max=30, step=0.1, group="Movement", tooltip="Horizontal speed in world units per second") let speed = 8.0;\n@export(type="float", min=-100, max=0, step=0.1, group="Movement", tooltip="Vertical acceleration") let gravity = -22.0;\n@export(type="float", min=0, max=50, step=0.1, group="Movement", tooltip="Jump speed") let jump_speed = 12.0;\nfn fixed_update(dt) {\n  let move = input_axis("MoveHorizontal");\n  let vertical = rigid_body().velocity_y + gravity * dt;\n  if input_pressed("Jump") && can_coyote_jump() { vertical = jump_speed; audio_play(); }\n  move_character(move * speed * dt, vertical * dt);\n}`
  const clip = JSON.stringify({ version: 1, name: 'Player Idle', loop: true, frameRate: 4, spriteFrames: [{ spriteAsset: `asset://${spriteId}`, duration: .25 }], tracks: [{ property: 'SpriteRenderer.opacity', keyframes: [{ time: 0, value: 82 }, { time: .5, value: 100 }, { time: 1, value: 82 }] }] })
  const controller = JSON.stringify({ version: 1, name: 'Player Controller', defaultState: 'idle', parameters: [], states: [{ id: 'idle', name: 'Idle', clipAsset: `asset://${clipId}`, speed: 1, x: 80, y: 80 }], transitions: [] })
  const player = shape('platformer-player', 'Player', [-4, -2], [1.1, 1.8], { color: [105, 168, 255], body: 'Kinematic', scriptAsset: scriptId, extra: [
    component('platformer-player', 'CharacterBody2D', { maxSlopeAngle: 45, stepHeight: .35, floorSnap: .15, safeMargin: .001, maxSlides: 4, coyoteTime: .12, applyPlatformVelocity: true, collisionMask: 0xffffffff }),
    component('platformer-player', 'SpriteRenderer2D', { spriteAsset: `asset://${spriteId}`, tint: { r: 255, g: 255, b: 255 }, opacity: 100, size: { x: 1.1, y: 1.8 }, pivot: { x: .5, y: .5 }, flipX: false, flipY: false, sortingLayer: 1, orderInLayer: 2, material: 'Default', filterMode: 'Linear' }),
    component('platformer-player', 'Animator', { controllerAsset: `asset://${controllerId}`, speed: 1, autoplay: true, currentState: 'idle', parameters: {} }),
    component('platformer-player', 'AudioSource', { audioClip: `asset://${audioId}`, volume: .8, pitch: 1, loop: false, autoplay: false, bus: 'SFX', spatialBlend: 0, minDistance: 1, maxDistance: 50 })
  ] })
  const ground = shape('platformer-ground', 'Ground', [0, -4], [18, 1], { body: 'Static', color: [87, 107, 94], friction: .8, extra: [component('platformer-ground', 'ShadowCaster2D', { layerMask: 0xffffffff, selfShadows: false, opacity: .82 })] })
  const platform = shape('platformer-platform', 'Platform', [3, -1], [5, .7], { body: 'Static', color: [112, 137, 120], friction: .8, extra: [component('platformer-platform', 'ShadowCaster2D', { layerMask: 0xffffffff, selfShadows: false, opacity: .82 })] })
  const light = entity('platformer-light', 'Level Light', [-2, -1], [component('platformer-light', 'Light2D', { lightType: 'Point', color: { r: 255, g: 226, b: 178 }, intensity: .9, range: 10, innerAngle: 30, outerAngle: 55, areaSize: { x: 4, y: 2 }, layerMask: 0xffffffff, castsShadows: true, shadowSoftness: .58 })])
  const platformTiles = Array(32 * 18).fill(-1).map(/* 根据 Math.floor(index / 32) < 2 的真假，分别返回 1 或 index % 19 === 0 && Math.floor(index / 32) === 2 ? 0 : -1。 */ (_, index) => Math.floor(index / 32) < 2 ? 1 : index % 19 === 0 && Math.floor(index / 32) === 2 ? 0 : -1)
  const tileMap = entity('platformer-tilemap', 'World TileMap', [0, 0], [component('platformer-tilemap', 'TileMap2D', { width: 32, height: 18, tileSize: { x: 1, y: 1 }, chunkSize: 16, tiles: platformTiles, tileSetAsset: `asset://${tileSetId}`, layers: [{ id: 'terrain', name: 'Terrain', visible: true, locked: false, opacity: 1, blendMode: 'Alpha', parallax: { x: 1, y: 1 }, zOrder: 0, collisionEnabled: true, navigationEnabled: true, occlusionEnabled: true, tiles: platformTiles, transforms: Array(32 * 18).fill(0) }], activeLayer: 0, streamingEnabled: true, streamingRadius: 3, bakeCollision: true, bakeNavigation: true, bakeOccluders: true })])
  const navigation = entity('platformer-navigation', 'Platform Navigation', [0, 0], [component('platformer-navigation', 'NavigationRegion2D', { polygon: [{ x: -16, y: -9 }, { x: 16, y: -9 }, { x: 16, y: 9 }, { x: -16, y: 9 }], navigationMode: 'Grid', source: 'TileMap', sourceEntityUuid: stableUuid('entity:platformer-tilemap'), cellSize: .5, agentRadius: .4, navigationLayer: 1, navigationMask: 1, traversalCost: 1 })])
  const tutorialScene = scene('platformer-main', 'Level 01', [camera('platformer-camera'), tileMap, navigation, light, ground, platform, player, ...canvasWithLabel('platformer-ui', 'Platformer')])
  const result = project(name, 'platformer', [tutorialScene], [
    scriptAsset('platformer-controller', 'PlayerController', source), imageAsset('platformer-player-sprite', 'Player', '#69a8ff'), beepAsset('platformer-jump-audio', 'Jump'),
    textAsset('platformer-idle-clip', 'PlayerIdle.nova-anim', 'animation', 'Assets/Animations/PlayerIdle.nova-anim', clip, 'application/x-nova-animation'),
    textAsset('platformer-animator-controller', 'Player.controller', 'controller', 'Assets/Controllers/Player.controller', controller, 'application/x-nova-controller'),
    ...worldTileAssets('platformer-world')
  ])
  ;((result.projectSettings as JsonRecord).inputMap as JsonRecord[]) = [
    { name: 'MoveHorizontal', kind: 'axis', bindings: [{ device: 'keyboard', code: 'KeyA', scale: -1, x: -1, y: 0, gamepad: 0, deadzone: .15 }, { device: 'keyboard', code: 'KeyD', scale: 1, x: 1, y: 0, gamepad: 0, deadzone: .15 }] },
    { name: 'Jump', kind: 'button', bindings: [{ device: 'keyboard', code: 'Space', scale: 1, x: 0, y: 0, gamepad: 0, deadzone: .15 }] }
  ]
  const rendering = (result.projectSettings as JsonRecord).rendering as JsonRecord
  rendering.lightingEnabled = true
  rendering.ambientIntensity = .48
  return result
}

/** 构建俯视移动世界，配置巡逻敌人、预制实例化、触发存档切换场景及瓦片导航。 */ function topDownTemplate(name: string): JsonRecord {
  const scriptId = stableUuid('asset:top-down-controller')
  const enemyScriptId = stableUuid('asset:top-down-enemy')
  const enemyPrefabId = stableUuid('asset:top-enemy-prefab')
  const tileSetId = stableUuid('asset:top-down-world-tileset')
  const source = `@export(type="float", min=0, max=30, step=0.1, group="Movement", tooltip="Top-down movement speed") let speed = 7.0;\nfn update(dt) {\n  let move = input_vector("Move");\n  set_velocity(move.x * speed, move.y * speed);\n  if input_pressed("Spawn") { instantiate("asset://${enemyPrefabId}"); }\n}\nfn on_trigger_enter(other, px, py, nx, ny, rvx, rvy) {\n  save_set("last_trigger", other);\n  save_set("checkpoint", [px, py]);\n  save_commit("slot1");\n  scene_load("Main Menu");\n}`
  const enemySource = `@export(type="float", min=0, max=20, step=0.1, group="AI", tooltip="Patrol movement speed") let patrol_speed = 2.0;\nfn fixed_update(dt) {\n  let pose = transform();\n  let body = rigid_body();\n  if pose.position_x > 7.0 { set_velocity(-patrol_speed, body.velocity_y); }\n  else if pose.position_x < 2.0 { set_velocity(patrol_speed, body.velocity_y); }\n  else if body.velocity_x == 0.0 { set_velocity(patrol_speed, body.velocity_y); }\n}`
  const player = shape('top-player', 'Player', [0, 0], [1.2, 1.2], { type: 'Circle', color: [94, 203, 181], scriptAsset: scriptId, extra: [component('top-player', 'ParticleEmitter2D', { emissionRate: 12, burst: 0, lifetime: 1, maxParticles: 128, initialVelocityMin: { x: -.5, y: -.5 }, initialVelocityMax: { x: .5, y: .5 }, startColor: { r: 94, g: 203, b: 181 }, endColor: { r: 94, g: 203, b: 181 }, startOpacity: 70, endOpacity: 0 })] })
  const enemy = shape('top-enemy', 'Enemy', [5, 0], [1.4, 1.4], { color: [242, 118, 118], body: 'Kinematic', scriptAsset: enemyScriptId })
  const trigger = shape('top-trigger', 'Exit Trigger', [8, 0], [2, 4], { color: [239, 190, 92], body: 'Static', sensor: true })
  const topTiles = Array(40 * 24).fill(0).map(/* 根据 index % 40 === 0 || index % 40 === 39 || Math.floor(index / 40) === 0 || Math.floor(index / 40) === 23 的真假，分别返回 1 或 value。 */ (value, index) => index % 40 === 0 || index % 40 === 39 || Math.floor(index / 40) === 0 || Math.floor(index / 40) === 23 ? 1 : value)
  const topMap = entity('top-down-tilemap', 'World TileMap', [0, 0], [component('top-down-tilemap', 'TileMap2D', { width: 40, height: 24, tileSize: { x: 1, y: 1 }, chunkSize: 16, tiles: topTiles, tileSetAsset: `asset://${tileSetId}`, layers: [{ id: 'ground', name: 'Ground', visible: true, locked: false, opacity: 1, blendMode: 'Alpha', parallax: { x: 1, y: 1 }, zOrder: -10, collisionEnabled: true, navigationEnabled: true, occlusionEnabled: true, tiles: topTiles, transforms: Array(40 * 24).fill(0) }], activeLayer: 0, streamingEnabled: true, streamingRadius: 3, bakeCollision: true, bakeNavigation: true, bakeOccluders: true })])
  const topNavigation = entity('top-down-navigation', 'World Navigation', [0, 0], [component('top-down-navigation', 'NavigationRegion2D', { polygon: [{ x: -19, y: -11 }, { x: 19, y: -11 }, { x: 19, y: 11 }, { x: -19, y: 11 }], navigationMode: 'Grid', source: 'TileMap', sourceEntityUuid: stableUuid('entity:top-down-tilemap'), cellSize: .5, agentRadius: .5, navigationLayer: 1, navigationMask: 1, traversalCost: 1, links: [] })])
  const level = scene('top-level', 'World', [camera('top-camera'), topMap, topNavigation, player, enemy, trigger, ...canvasWithLabel('top-ui', 'Top-down')])
  ;(level.globalSettings as JsonRecord).gravity = 0
  const menu = scene('top-menu', 'Main Menu', [camera('top-menu-camera'), ...canvasWithLabel('top-menu-ui', 'Top-down')])
  ;(menu.globalSettings as JsonRecord).gravity = 0
  const result = project(name, 'top-down', [level, menu], [
    scriptAsset('top-down-controller', 'TopDownController', source), scriptAsset('top-down-enemy', 'EnemyPatrol', enemySource),
    prefabAsset('top-enemy-prefab', 'Enemy', enemy),
    ...worldTileAssets('top-down-world')
  ])
  ;((result.projectSettings as JsonRecord).inputMap as JsonRecord[]) = [{ name: 'Move', kind: 'vector2', bindings: [
    { device: 'keyboard', code: 'KeyW', scale: 1, x: 0, y: 1, gamepad: 0, deadzone: .15 }, { device: 'keyboard', code: 'KeyS', scale: 1, x: 0, y: -1, gamepad: 0, deadzone: .15 },
    { device: 'keyboard', code: 'KeyA', scale: 1, x: -1, y: 0, gamepad: 0, deadzone: .15 }, { device: 'keyboard', code: 'KeyD', scale: 1, x: 1, y: 0, gamepad: 0, deadzone: .15 }
  ] }, { name: 'Spawn', kind: 'button', bindings: [{ device: 'keyboard', code: 'KeyE', scale: 1, x: 0, y: 0, gamepad: 0, deadzone: .15 }] }]
  return result
}

/** 以相互独立的实体对展示距离关节和弹性绳，避免同一对物体被重复约束。 */ function physicsTemplate(name: string): JsonRecord {
  // Joint and rope examples use separate bodies. Coupling two independent
  // constraints across the same pair creates an over-constrained tutorial.
  const jointAnchor = shape('sandbox-joint-anchor', 'Joint Anchor', [-5, 0], [.8, .8], { body: 'Static', color: [132, 148, 166], friction: .8 })
  const jointedBox = shape('sandbox-box', 'Jointed Box', [-5, -3], [2, 2], { color: [103, 162, 255], restitution: .2, extra: [component('sandbox-box', 'DistanceJoint2D', { targetEntityUuid: stableUuid('entity:sandbox-joint-anchor'), distance: 3, stiffness: 240, damping: 28, collideConnected: false })] })
  const ropeEnd = shape('sandbox-rope-end', 'Rope End', [1, -2], [1.4, 1.4], { color: [120, 205, 176], restitution: .25 })
  const ropeBall = shape('sandbox-ball', 'Rope Ball', [5, -2], [1.8, 1.8], { type: 'Circle', color: [236, 154, 92], restitution: .7 })
  const anchors = [ropeEnd, ropeBall].map(/** 构造并返回记录 { entityUuid: value.uuid, mode: 'center', localPoint: { x: 0, y: 0 }, index: 0, sideT: .5 }，字段按当前实参及捕获状态求值。 */ value => ({ entityUuid: value.uuid, mode: 'center', localPoint: { x: 0, y: 0 }, index: 0, sideT: .5 }))
  const rope = {
    uuid: stableUuid('connection:sandbox-rope'), name: 'Elastic Rope', type: 'rope', route: 'manual', anchors,
    manualPoints: [{ x: 1, y: -2 }, { x: 3, y: -.8 }, { x: 5, y: -2 }], manualSegments: [], restLengths: [],
    stretchable: true, bendable: true, stiffness: 120, damping: 24, maxStretch: .45, bendTolerance: 120, stretchTolerance: 180,
    collisionEnabled: true, thickness: .18, ropeNodes: [], breakState: 'intact', breakLink: -1, tension: 0, strain: 0
  }
  return project(name, 'physics-sandbox', [scene('sandbox', 'Physics Playground', [camera('sandbox-camera'), shape('sandbox-ground', 'Ground', [0, -5], [20, 1], { body: 'Static', color: [89, 102, 116], friction: .85 }), jointAnchor, jointedBox, ropeEnd, ropeBall, ...canvasWithLabel('sandbox-ui', 'Physics Sandbox')], [rope])])
}

/** 构建薄墙高速连续碰撞、旋转斜坡、传感区及不同摩擦弹性物体的物理实验场景。 */ function collisionLabTemplate(name: string): JsonRecord {
  const ramp = shape('collision-lab-ramp', 'Rotated Ramp', [-3.4, -1.5], [6.5, .65], { body: 'Static', color: [104, 120, 139], friction: .9 })
  const rampTransform = (ramp.components as JsonRecord[]).find(/* 比较 value.kind 与 'Transform2D'，返回严格相等的判断结果。 */ value => value.kind === 'Transform2D')?.data as JsonRecord
  rampTransform.rotation = .24
  const bullet = setInitialVelocity(shape('collision-lab-bullet', 'CCD Bullet', [-8.5, 2.6], [.24, .24], { type: 'Circle', color: [255, 202, 91], restitution: .2, friction: .05, continuous: true }), 72, 0)
  const sensor = shape('collision-lab-sensor', 'Sensor Zone', [5.8, 0], [2.4, 3.2], { body: 'Static', sensor: true, color: [112, 207, 179] })
  const sensorRenderer = (sensor.components as JsonRecord[]).find(/* 比较 value.kind 与 'ShapeRenderer2D'，返回严格相等的判断结果。 */ value => value.kind === 'ShapeRenderer2D')?.data as JsonRecord
  sensorRenderer.opacity = 28
  sensorRenderer.strokeOpacity = 100
  sensorRenderer.strokeWidth = .08
  const bodies = [
    shape('collision-lab-rubber', 'High Restitution Ball', [-4.2, 3.8], [1.15, 1.15], { type: 'Circle', color: [102, 172, 255], restitution: .95, friction: .05 }),
    shape('collision-lab-friction', 'High Friction Box', [-1.5, 3.3], [1.5, 1.5], { color: [238, 142, 103], restitution: .05, friction: 1.4 }),
    shape('collision-lab-ellipse', 'Offset Ellipse', [1.3, 3.6], [1.8, 1.1], { type: 'Circle', color: [185, 133, 242], restitution: .35, friction: .45 })
  ]
  const labScene = scene('collision-lab', 'Collision & CCD Lab', [
    cameraAtSize('collision-lab-camera', 6),
    shape('collision-lab-ground', 'Ground', [0, -5.45], [20.5, .75], { body: 'Static', color: [73, 84, 99], friction: .9 }),
    shape('collision-lab-target', 'Thin CCD Target', [2.3, 2.6], [.16, 3.2], { body: 'Static', color: [245, 112, 120], restitution: .25, friction: .2 }),
    ramp, bullet, sensor, ...bodies, ...canvasWithLabel('collision-lab-ui', 'Collision & CCD Lab · Play and open Debug → Physics')
  ])
  return project(name, 'collision-lab', [labScene], [], `---\ndismissible: true\ntemplate: collision-lab\n---\n# Collision & CCD Lab\n\nPress **Play** and open **Debug → Physics**. The yellow bullet uses continuous collision against a thin wall; the ramp exercises rotated contacts; the translucent green object is a sensor; the remaining bodies compare restitution and friction.`)
}

/** 构建形状、图像、世界文字、粒子和点光源组合场景，启用照明供设计与游戏视图比较。 */ function renderingLabTemplate(name: string): JsonRecord {
  const spriteId = stableUuid('asset:rendering-lab-sprite')
  const sprite = entity('rendering-lab-sprite', 'Sprite Sample', [4.6, 1.6], [component('rendering-lab-sprite', 'SpriteRenderer2D', {
    spriteAsset: `asset://${spriteId}`, tint: { r: 255, g: 255, b: 255 }, opacity: 100, size: { x: 2.3, y: 2.3 }, pivot: { x: .5, y: .5 }, flipX: false, flipY: false,
    sortingLayer: 1, orderInLayer: 4, material: 'Default', filterMode: 'Linear', nineSlice: { enabled: false, left: 0, top: 0, right: 0, bottom: 0 }
  })])
  const text = entity('rendering-lab-text', 'World Text', [-4.8, -2.8], [component('rendering-lab-text', 'TextRenderer2D', {
    text: 'Shapes · Sprite · Text · Particles · Light', fontAsset: null, fontFamily: 'Nunito Sans', fontSize: 1.05, fontWeight: 700, lineHeight: 1.2, align: 'left', maxWidth: 10,
    color: { r: 232, g: 240, b: 252 }, opacity: 100, sortingLayer: 1, orderInLayer: 6, material: 'Default'
  })])
  const emitter = entity('rendering-lab-particles', 'Particle Sample', [0, -.8], [component('rendering-lab-particles', 'ParticleEmitter2D', {
    emissionRate: 26, burst: 12, lifetime: 1.5, maxParticles: 256, initialVelocityMin: { x: -1.8, y: 1.2 }, initialVelocityMax: { x: 1.8, y: 3.5 }, gravity: { x: 0, y: -1.2 },
    startColor: { r: 111, g: 183, b: 255 }, endColor: { r: 197, g: 131, b: 244 }, startOpacity: 90, endOpacity: 0, startScale: .16, endScale: .03, sortingLayer: 1, orderInLayer: 5
  })])
  const light = entity('rendering-lab-light', 'Point Light', [0, 1.2], [component('rendering-lab-light', 'Light2D', { lightType: 'Point', color: { r: 137, g: 191, b: 255 }, intensity: 1.1, range: 8, innerAngle: 30, outerAngle: 60, areaSize: { x: 4, y: 3 }, layerMask: 0xffffffff, castsShadows: true, shadowSoftness: .7 })])
  const shapes = [
    shape('rendering-lab-box', 'Rectangle Sample', [-4.8, 1.5], [2.4, 2.4], { body: 'Static', color: [93, 165, 255] }),
    shape('rendering-lab-circle', 'Ellipse Sample', [-1.6, 1.5], [2.4, 1.7], { type: 'Circle', body: 'Static', color: [111, 207, 180] }),
    shape('rendering-lab-triangle', 'Triangle Sample', [1.6, 1.5], [2.4, 2.2], { type: 'Triangle', body: 'Static', color: [242, 156, 96] })
  ]
  const result = project(name, 'rendering-lab', [scene('rendering-lab', 'Rendering Lab', [cameraAtSize('rendering-lab-camera', 6), ...shapes, sprite, text, emitter, light, ...canvasWithLabel('rendering-lab-ui', 'Rendering Lab · compare Scene and Game views')])], [imageAsset('rendering-lab-sprite', 'RenderingLabSprite', '#6e9df8')], `---\ndismissible: true\ntemplate: rendering-lab\n---\n# Rendering Lab\n\nCompare the **Scene** and **Game** views. This scene covers vector shapes, an imported sprite, world text, particles, point lighting, stable sorting, and camera framing.`)
  const rendering = (result.projectSettings as JsonRecord).rendering as JsonRecord
  rendering.lightingEnabled = true
  rendering.ambientIntensity = .58
  return result
}

/** 创建带矩形布局和无障碍元信息的 UI 实体，将按钮标题移到文字组件并同步父级。 */ function uiElement(seed: string, name: string, parentUuid: string, position: [number, number], size: [number, number], kind: string, data: JsonRecord): JsonRecord {
  const interactive = kind === 'Button' || kind === 'Slider' || kind === 'Checkbox' || kind === 'TextInput'
  const order = Number(data.readingOrder ?? data.tabIndex ?? 0)
  const inferredLabel = String(data.accessibilityLabel ?? (kind === 'Checkbox' ? data.label : kind === 'TextInput' ? data.placeholder : kind === 'Button' ? data.text : '') ?? '').trim()
  const role = kind === 'Button' ? 'button' : kind === 'Slider' ? 'slider' : kind === 'Checkbox' ? 'checkbox' : kind === 'TextInput' ? 'textbox' : ''
  const componentData = { ...data }
  const caption = kind === 'Button' && typeof componentData.text === 'string' ? componentData.text : ''
  if (kind === 'Button') delete componentData.text
  for (const key of ['focusable', 'tabIndex', 'readingOrder', 'accessibilityRole', 'accessibilityLabel'] as const) delete componentData[key]
  const result = entity(seed, name, [0, 0], [
    component(seed, 'RectTransform', { parentUuid, anchorPreset: 'center', position: { x: position[0], y: position[1] }, size: { x: size[0], y: size[1] }, minSize: { x: Math.min(80, size[0]), y: Math.min(32, size[1]) }, maxSize: { x: 4096, y: 4096 }, flexGrow: 0, flexShrink: 1, focusable: interactive && data.focusable !== false, skipNavigation: !interactive || data.focusable === false, tabIndex: Number.isFinite(order) && order >= 0 ? Math.round(order) : 0, readingOrder: Number.isFinite(order) && order >= 0 ? Math.round(order) : 0, accessibilityRole: String(data.accessibilityRole ?? role), accessibilityLabel: inferredLabel }),
    component(seed, kind, componentData)
  ])
  if (caption) (result.components as JsonRecord[]).push(component(seed, 'Text', { text: caption, localizationKey: /^\{[^{}]+\}$/.test(caption) ? caption.slice(1, -1) : '', fontSize: 24, fontWeight: 600, align: 'center', color: { r: 255, g: 255, b: 255 }, opacity: 100 }))
  const transform = (result.components as JsonRecord[])[0].data as JsonRecord
  transform.parentUuid = parentUuid
  return result
}

/** 构建响应画布与输入、按钮、复选框、进度、滚动容器，附加主题、本地化和导航配置。 */ function uiShowcaseTemplate(name: string): JsonRecord {
  const canvasUuid = stableUuid('entity:ui-showcase-canvas')
  const canvas = entity('ui-showcase-canvas', 'Responsive Canvas', [0, 0], [
    component('ui-showcase-canvas', 'RectTransform', { parentUuid: null, anchorPreset: 'stretch', position: { x: 0, y: 0 }, size: { x: 1920, y: 1080 }, minSize: { x: 320, y: 180 }, maxSize: { x: 7680, y: 4320 }, flexGrow: 1, flexShrink: 1 }),
    component('ui-showcase-canvas', 'Canvas', { referenceSize: { x: 1920, y: 1080 }, scaleWithScreen: true, sortingOrder: 100, safeArea: true })
  ])
  const panel = uiElement('ui-showcase-panel', 'Menu Panel', canvasUuid, [0, 0], [720, 620], 'Panel', { color: { r: 28, g: 34, b: 46 }, opacity: 96, cornerRadius: 24, layout: 'None', gap: 18, padding: 36, clipping: true, styleClass: 'menu-card' })
  const panelUuid = String(panel.uuid)
  const title = uiElement('ui-showcase-title', 'Localized Title', panelUuid, [0, -220], [600, 70], 'Text', { text: '{menu.title}', fontSize: 38, fontWeight: 700, align: 'center', color: { r: 244, g: 248, b: 255 }, opacity: 100, localizationKey: 'menu.title' })
  const nameInput = uiElement('ui-showcase-input', 'Player Name', panelUuid, [0, -110], [560, 58], 'TextInput', { value: '', placeholder: 'Player name', fontSize: 20, maxLength: 32, focusable: true, tabIndex: 1, styleClass: 'input' })
  const playButton = uiElement('ui-showcase-play', 'Play Button', panelUuid, [0, -20], [560, 62], 'Button', { text: '{menu.play}', action: 'StartGame', focusable: true, tabIndex: 2, styleClass: 'primary', accessibilityLabel: 'Start game' })
  const options = uiElement('ui-showcase-options', 'Options Toggle', panelUuid, [0, 70], [560, 54], 'Checkbox', { checked: true, label: 'Sound enabled', localizationKey: 'menu.sound', action: 'ToggleSound', focusable: true, tabIndex: 3, styleClass: 'checkbox' })
  const loading = uiElement('ui-showcase-progress', 'Loading Progress', panelUuid, [0, 160], [560, 28], 'ProgressBar', { value: 68, min: 0, max: 100, styleClass: 'progress' })
  const scroll = uiElement('ui-showcase-scroll', 'News Scroll View', panelUuid, [0, 245], [560, 90], 'Panel', { color: { r: 22, g: 27, b: 37 }, opacity: 100, cornerRadius: 12, clipping: true, scrollHorizontal: false, scrollVertical: true, contentSize: { x: 560, y: 360 }, scrollSpeed: 42, showScrollbars: true, styleClass: 'scroll' })
  const localization = JSON.stringify({ locale: 'en', entries: { 'menu.title': 'Nova_A UI Showcase', 'menu.playerName': 'Player name', 'menu.play': 'Play', 'menu.sound': 'Sound enabled' } })
  const theme = JSON.stringify({ version: 1, name: 'Showcase', variables: { accent: '#6ea8fe', radius: 12, spacing: 8 }, classes: { 'menu-card': { background: '#1d222c', radius: 24 }, primary: { background: '#4c8df6', foreground: '#ffffff' }, input: { background: '#11151b' } } })
  const result = project(name, 'ui-showcase', [scene('ui-showcase', 'UI Showcase', [camera('ui-showcase-camera'), canvas, panel, title, nameInput, playButton, options, loading, scroll])], [
    { ...textAsset('ui-showcase-locale', 'en.nova-locale', 'localization', 'Assets/Localization/en.nova-locale', localization, 'application/x-nova-localization'), settings: { localizationSettings: { locale: 'en', fallbackLocale: '' } } },
    textAsset('ui-showcase-theme', 'Showcase.nova-theme', 'uiTheme', 'Assets/Themes/Showcase.nova-theme', theme, 'application/x-nova-ui-theme'),
    beepAsset('ui-showcase-click', 'UIClick')
  ])
  ;((result.projectSettings as JsonRecord).presentation as JsonRecord) = { localization: { sourceLocale: 'en', previewLocale: 'en', fallbackChain: ['en'], pseudolocalization: false, buildLocales: ['en'] }, accessibility: { keyboardNavigation: true, gamepadNavigation: true, screenReaderMetadata: true, focusRingColor: '#79b2ff', focusRingWidth: 3, reducedMotion: false, announceFocusChanges: true } }
  return result
}

/** 构建两实体网络示例并登记可选离线网络包，预置复制和无头测试配置但默认关闭联网。 */ function networkedOptionalTemplate(name: string): JsonRecord {
  const first = shape('network-player-one', 'Server Player', [-3, 0], [1.4, 1.4], { type: 'Circle', color: [92, 181, 255], body: 'Kinematic' })
  const second = shape('network-player-two', 'Remote Player', [3, 0], [1.4, 1.4], { type: 'Circle', color: [242, 153, 92], body: 'Kinematic' })
  const result = project(name, 'networked-optional', [scene('network-arena', 'Network Arena', [camera('network-camera'), first, second, ...canvasWithLabel('network-ui', 'Network Arena')])])
  result.packages = { manifestVersion: 1, installed: [{
    manifest: { manifestVersion: 1, id: 'top.whitelists.novaa.networking', name: 'Nova Optional Networking', version: '2.9.0', description: 'Bounded replication and authoritative multiplayer tools.', engine: '>=2.9.0 <6.0.0', dependencies: {}, dependencyHashes: {}, entryPointType: 'runtime', apiCompatibility: '>=1 <2', pluginApi: null, native: false, sha256: 'fd048525377499fbd054cb74b69d5369c57d11431951695d413ec1e14cfe3424', signature: 'nova-official-v1:fd048525377499fbd054cb74b69d5369c57d11431951695d413ec1e14cfe3424', publisher: 'Whitelist', publisherVerified: true, permissions: ['network.client', 'network.listen'], rating: 5, securityUrl: 'https://github.com/Stevenzhang543/Nova_A/security', documentationUrl: 'https://github.com/Stevenzhang543/Nova_A/', license: 'MIT', licenseUrl: 'https://github.com/Stevenzhang543/Nova_A/blob/main/LICENSE.md', provenance: 'nova-official-v1', certification: 'certified', vulnerabilityPolicy: 'Critical and High findings block Stable installation.' },
    source: { kind: 'registry', location: 'Nova_A official offline package' }, enabled: true, project: true, installedAt: 0
  }], lockfile: [{ id: 'top.whitelists.novaa.networking', version: '2.9.0', source: { kind: 'registry', location: 'Nova_A official offline package' }, sha256: 'official-networking-2.9.0' }], offlineCache: [], offlineMode: true }
  ;((((result.packages as JsonRecord).installed as JsonRecord[])[0].manifest as JsonRecord).engine) = '>=2.9.0 <27.0.0'
  ;((result.projectSettings as JsonRecord).production as JsonRecord) = {
    performance: { traceCapacity: 600, memoryBudgetMb: 300, assetBudgetMb: 512, leakWindowFrames: 600, lifetimeCapacity: 2000 }, replay: { seed: 1313822273, capacity: 3600, strictChecksums: true }, testing: { defaultTimeoutMs: 10000, tests: [{ id: 'network-headless', name: 'Network headless smoke', kind: 'headless', sceneUuid: String((result.scenes as JsonRecord[])[0].uuid), steps: 120, timeoutMs: 10000, captureScreenshot: false, assertions: [{ kind: 'finitePhysics', target: '', expected: 'true' }, { kind: 'noRuntimeErrors', target: '', expected: 'true' }] }] }, data: { saveSchemaVersion: 1, saveMigrations: [] }, jobs: { maxWorkers: 2, maxQueued: 256, timeoutMs: 15000 },
    networking: { enabled: false, role: 'host', transport: 'websocket', endpoint: 'ws://127.0.0.1:7777', bindAddress: '127.0.0.1:7777', snapshotRate: 20, interpolationMs: 100, rollbackFrames: 120, bandwidthKbps: 256, reconnect: true, replicatedEntities: [first, second].map(/** 构造并返回记录 { entityUuid: value.uuid, authority: 'server', properties: ['transform', 'rotation', 'velocity'], interpolate: true, predict: true }，字段按当前实参及捕获状态求值。 */ value => ({ entityUuid: value.uuid, authority: 'server', properties: ['transform', 'rotation', 'velocity'], interpolate: true, predict: true })) }
  }
  return result
}

/** 基于完整模板生成变体，替换模板身份和入门说明，并重算教程资源摘要。 */ function templateVariant(name: string, id: ProjectTemplateId, basedOn: string, factory: (name: string) => JsonRecord): JsonRecord {
  const result = factory(name)
  const metadata = result.projectMetadata as JsonRecord | undefined
  if (metadata) metadata.template = id
  const tutorial = (result.assets as JsonRecord[] | undefined)?.find(/* 比较 asset.path 与 'Assets/Tutorials/Getting Started.md'，返回严格相等的判断结果。 */ asset => asset.path === 'Assets/Tutorials/Getting Started.md')
  if (tutorial) {
    const descriptor = PROJECT_TEMPLATES.find(/* 比较 item.id 与 id，返回严格相等的判断结果。 */ item => item.id === id)
    tutorial.source = `---\ndismissible: true\ntemplate: ${id}\nverifiedVariantOf: ${basedOn}\n---\n# ${descriptor?.name ?? name}\n\n${descriptor?.description ?? ''}\n\nThis verified template keeps the complete, playable ${basedOn} runtime foundation while presenting a focused ${id.replace(/-/g, ' ')} workflow. Press **Play**, inspect its configured Scene, Script, Debug, and Manage workspaces, then replace the sample art and rules without rebuilding project infrastructure.\n`
    tutorial.byteLength = String(tutorial.source).length
    const hash = sha256Bytes(assetSourceBytes(String(tutorial.source))), pipeline = tutorial.pipeline as JsonRecord | undefined
    if (pipeline) { pipeline.sourceHash = hash; pipeline.artifactHash = hash; pipeline.contentHash = hash; pipeline.cacheKey = hash; pipeline.lastValidSource = tutorial.source }
  }
  return result
}

/** 创建只保留变换和形状渲染的装饰实体，去除基础刚体与碰撞器。 */ function decorativeShape(seed: string, name: string, position: [number, number], size: [number, number], color: [number, number, number], type: 'Box' | 'Circle' | 'Triangle' = 'Circle'): JsonRecord {
  const result = shape(seed, name, position, size, { type, color, body: 'Static' })
  result.components = (result.components as JsonRecord[]).filter(/* 先计算 value.kind === 'Transform2D'；仅当其为假值时求右侧 value.kind === 'ShapeRenderer2D'，返回短路求值结果。 */ value => value.kind === 'Transform2D' || value.kind === 'ShapeRenderer2D')
  return result
}

// =====================================================================================
// Nova_A 试玩关卡草稿 · 共享辅助函数（片段，不是独立模块）
//
// 插入位置：src/projects/templates.ts 中 decorativeShape() 定义之后、authoredAddition() 之前。
// 依赖 templates.ts 模块内的私有工具：JsonRecord / stableUuid / component / entity / uiElement。
// 只有本文件定义这些辅助函数；10/20/30 三个关卡片段共同使用，避免重复声明。
// =====================================================================================

type LevelColor = [number, number, number]

/** 合并实体中指定组件的数据字段并返回原实体；组件缺失时立即报错，防止模板静默生成错误结构。 */ function patchComponent(value: JsonRecord, kind: string, patch: JsonRecord): JsonRecord {
  const part = (value.components as JsonRecord[]).find(/* 比较 item.kind 与 kind，返回严格相等的判断结果。 */ item => item.kind === kind)
  if (!part) throw new Error(`Template entity ${String(value.name)} has no ${kind}`)
  part.data = { ...(part.data as JsonRecord), ...patch }
  return value
}

/** 为实体追加 Script2D，并写入该实例的导出属性覆盖值（同一脚本资源可被多个实体以不同参数复用）。 */ function attachScript(value: JsonRecord, seed: string, scriptUuid: string, properties: JsonRecord = {}): JsonRecord {
  ;(value.components as JsonRecord[]).push(component(`${seed}:behaviour`, 'Script2D', { scriptAsset: `asset://${scriptUuid}`, properties }))
  return value
}

/** 创建 1920×1080 参考尺寸的全屏 HUD 画布，返回画布实体及其 UUID 供子元素引用。 */ function levelCanvas(seed: string, name = 'HUD Canvas'): { canvas: JsonRecord; uuid: string } {
  const canvas = entity(seed, name, [0, 0], [
    component(seed, 'RectTransform', { parentUuid: null, anchorPreset: 'stretch', position: { x: 0, y: 0 }, size: { x: 1920, y: 1080 } }),
    component(seed, 'Canvas', { referenceSize: { x: 1920, y: 1080 }, scaleWithScreen: true, sortingOrder: 100 })
  ])
  return { canvas, uuid: String(canvas.uuid) }
}

/** 创建画布内文字元素（中心锚点、UI 坐标 y 向下）。 */ function levelText(seed: string, name: string, parent: string, position: [number, number], size: [number, number], text: string, fontSize = 26, align: 'left' | 'center' | 'right' = 'center', color: LevelColor = [236, 243, 255]): JsonRecord {
  return uiElement(seed, name, parent, position, size, 'Text', { text, fontSize, fontWeight: 680, align, color: { r: color[0], g: color[1], b: color[2] }, opacity: 100 })
}

/** 创建初始隐藏的结果面板与结果文字（脚本在胜负时启用并改写文字）。 */ function levelResultPanel(seed: string, parent: string, text: string): JsonRecord[] {
  const panel = uiElement(`${seed}-panel`, 'Result Panel', parent, [0, 0], [980, 190], 'Panel', { color: { r: 22, g: 40, b: 56 }, opacity: 97, cornerRadius: 24, clipping: true })
  const label = levelText(`${seed}-text`, 'Result Text', parent, [0, 0], [920, 150], text, 30, 'center', [196, 238, 255])
  panel.enabled = false
  label.enabled = false
  return [panel, label]
}

/** 创建场景内的世界坐标说明文字（TextRenderer2D），用作关卡内教学标牌。 */ function levelSign(seed: string, name: string, position: [number, number], text: string, fontSize = .42, color: LevelColor = [214, 226, 244]): JsonRecord {
  return entity(seed, name, position, [component(seed, 'TextRenderer2D', {
    text, fontAsset: null, fontFamily: 'Nunito Sans', fontSize, fontWeight: 650, lineHeight: 1.2, align: 'center', maxWidth: 9,
    color: { r: color[0], g: color[1], b: color[2] }, opacity: 100, sortingLayer: 1, orderInLayer: 8, material: 'Default'
  })])
}

/** 键盘绑定记录（与现有模板相同的字段集合）。 */ function levelKey(code: string, scale = 1, x = 0, y = 0): JsonRecord {
  return { device: 'keyboard', code, scale, x, y, gamepad: 0, deadzone: .15 }
}

/** 非键盘绑定记录：手柄按钮/轴或鼠标按钮。 */ function levelDevice(device: 'gamepad-button' | 'gamepad-axis' | 'mouse-button', code: string, scale = 1): JsonRecord {
  return { device, code, scale, x: 0, y: 0, gamepad: 0, deadzone: .15 }
}

// =====================================================================================
// 关卡 L1「星跃三部曲 / Skyline Trilogy」 id: 'platformer-trilogy'（category: game）
//
// 插入位置：src/projects/templates.ts，00-shared 片段之后、authoredAddition() 之前。
// 登记：TEMPLATE_FACTORIES 增加 'platformer-trilogy': platformerTrilogyTemplate（见 90-registration.fragment.ts）。
//
// 三个场景共享 5 个脚本资源（玩家、导演、移动平台、相位平台、触发器三件套），
// 通过 Script2D.properties 为每个实例给出不同参数——这是对“资源与实例分离”的展示。
// 世界坐标 y 向上；UI 坐标以画布中心为原点、y 向下。
// =====================================================================================

type TrilogyRect = [name: string, center: [number, number], size: [number, number]]
interface TrilogyStageSpec {
  index: 1 | 2 | 3
  seed: string
  sceneName: string
  title: string
  hint: string
  next: string
  coinTarget: number
  timeLimit: number
  cameraSize: number
  cameraOffset: [number, number]
  start: [number, number]
  solids: TrilogyRect[]
  oneWay: TrilogyRect[]
  movers: Array<[name: string, center: [number, number], size: [number, number], path: { axis_x: number; axis_y: number; distance: number; speed: number }]>
  phases: Array<[name: string, center: [number, number], size: [number, number], offset: number]>
  spikes: Array<[name: string, center: [number, number]]>
  flags: Array<[name: string, center: [number, number]]>
  coins: Array<[number, number]>
  goal: [number, number]
  signs: Array<[text: string, at: [number, number]]>
}

const TRILOGY_SCENES = ['Stage 1 - Tutorial', 'Stage 2 - Challenge', 'Stage 3 - Collection'] as const

const TRILOGY_PLAYER_SOURCE = `// Shared by all three stages. CharacterBody2D owns collision-safe motion; this script owns the feel.
@export(type="float", min=1, max=20, step=0.1, group="Movement", tooltip="Run speed in world units per second") let speed = 7.5;
@export(type="float", min=-80, max=-5, step=0.5, group="Movement", tooltip="Gravity applied by this script") let gravity = -30.0;
@export(type="float", min=4, max=25, step=0.1, group="Movement", tooltip="Jump take-off speed") let jump_speed = 12.5;
@export(type="float", min=0.1, max=1, step=0.05, group="Movement", tooltip="Upward speed kept when Jump is released early") let jump_cut = 0.45;
@export(type="float", min=-60, max=-5, step=0.5, group="Movement", tooltip="Terminal fall speed") let max_fall = -24.0;
@export(type="float", min=0, max=0.3, step=0.01, group="Movement", tooltip="Jump input buffer in seconds") let buffer_time = 0.12;
@export(type="float", min=-100, max=0, step=0.5, group="Rules", tooltip="Falling below this height respawns the player") let kill_y = -12.0;
@export(type="float", group="Runtime", tooltip="Current respawn x") let spawn_x = 0.0;
@export(type="float", group="Runtime", tooltip="Current respawn y") let spawn_y = 0.0;
@export(type="float", group="Runtime", tooltip="Remaining buffered jump time") let buffer = 0.0;
@export(type="float", group="Runtime", tooltip="Blocks a second coyote jump right after take-off") let jump_lock = 0.0;
fn start() {
  let pose = transform();
  spawn_x = pose.position_x;
  spawn_y = pose.position_y;
  buffer = 0.0;
  jump_lock = 0.0;
}
fn fixed_update(dt) {
  if transform().position_y < kill_y {
    set_position(spawn_x, spawn_y);
    buffer = 0.0;
    signal_emit("run.respawned", 1);
    return;
  }
  let move = input_axis("MoveHorizontal");
  let vertical = rigid_body().velocity_y + gravity * dt;
  if input_pressed("Jump") { buffer = buffer_time; }
  if jump_lock > 0.0 { jump_lock -= dt; }
  if buffer > 0.0 && jump_lock <= 0.0 && can_coyote_jump() {
    vertical = jump_speed;
    buffer = 0.0;
    jump_lock = 0.2;
  }
  if buffer > 0.0 { buffer -= dt; }
  if input_released("Jump") && vertical > 0.0 { vertical *= jump_cut; }
  if vertical < max_fall { vertical = max_fall; }
  move_character(move * speed * dt, vertical * dt);
}
fn on_signal(name, payload, source) {
  if name == "run.checkpoint" {
    spawn_x = payload.x.to_float();
    spawn_y = payload.y.to_float();
  } else if name == "run.hurt" {
    set_position(spawn_x, spawn_y);
    buffer = 0.0;
    signal_emit("run.respawned", 1);
  }
}`

const TRILOGY_DIRECTOR_SOURCE = `// One director per stage. Instance properties select the stage rules; the session carries the run.
@export(type="int", min=1, max=3, step=1, group="Stage", tooltip="Stage number") let stage = 1;
@export(type="string", group="Stage", tooltip="Scene loaded after the goal") let next_scene = "";
@export(type="int", min=0, max=64, step=1, group="Stage", tooltip="Coins required before the goal accepts the player") let coin_target = 0;
@export(type="float", min=0, max=600, step=1, group="Stage", tooltip="Time limit in seconds; 0 disables it") let time_limit = 0.0;
@export(type="string", group="Stage", tooltip="Hint shown at the bottom of the screen") let hint = "";
@export(type="float", group="Runtime", tooltip="Seconds spent in this stage") let elapsed = 0.0;
@export(type="int", group="Runtime", tooltip="Respawns in this stage") let falls = 0;
@export(type="int", group="Runtime", tooltip="Collected coins") let coins = 0;
@export(type="bool", group="Runtime", tooltip="Stage finished or failed") let finished = false;
fn start() {
  elapsed = 0.0;
  falls = 0;
  coins = 0;
  finished = false;
  if stage == 1 {
    session_set("trilogy_time", 0.0);
    session_set("trilogy_falls", 0);
  }
  entity_set_enabled(find_entity_handle("Result Panel"), false);
  entity_set_enabled(find_entity_handle("Result Text"), false);
  ui_set_text_on(find_entity_handle("Stage Hint"), hint);
  timer_start("hud", 0.1, true);
}
fn update(dt) {
  if input_pressed("Restart") { scene_reload(); return; }
  if finished {
    if stage == 3 && input_pressed("Jump") { scene_load("Stage 1 - Tutorial"); }
    return;
  }
  elapsed += dt;
  if time_limit > 0.0 && elapsed >= time_limit {
    finished = true;
    entity_set_enabled(find_entity_handle("Result Panel"), true);
    entity_set_enabled(find_entity_handle("Result Text"), true);
    ui_set_text_on(find_entity_handle("Result Text"), "Time is up - press R to retry this stage");
  }
}
fn on_timer(name) {
  if name != "hud" { return; }
  if coin_target > 0 { coins = coin_target - query_group("coin", 64).len(); }
  let shown = (elapsed * 10.0).floor() / 10.0;
  let text = "Time " + shown + " s   Falls " + falls;
  if time_limit > 0.0 { text += "   Limit " + time_limit.to_int() + " s"; }
  if coin_target > 0 { text += "   Coins " + coins + "/" + coin_target; }
  ui_set_text_on(find_entity_handle("Stage Stats"), text);
}
fn on_signal(name, payload, source) {
  if name == "run.respawned" { falls += 1; return; }
  if name != "run.goal" || finished { return; }
  if coin_target > 0 {
    coins = coin_target - query_group("coin", 64).len();
    if coins < coin_target {
      ui_set_text_on(find_entity_handle("Stage Hint"), "The gate needs every coin: " + coins + "/" + coin_target + " - collect the rest, then step back in");
      return;
    }
  }
  finished = true;
  let total_time = session_get("trilogy_time", 0.0) + elapsed;
  let total_falls = session_get("trilogy_falls", 0) + falls;
  session_set("trilogy_time", total_time);
  session_set("trilogy_falls", total_falls);
  if stage < 3 { scene_load(next_scene); return; }
  let best = save_get("trilogy_best", 0.0);
  let record = best <= 0.0 || total_time < best;
  if record {
    best = total_time;
    save_set("trilogy_best", total_time);
    save_commit("trilogy");
  }
  let summary = "Run complete!  Total " + ((total_time * 10.0).floor() / 10.0) + " s   Falls " + total_falls + "   Best " + ((best * 10.0).floor() / 10.0) + " s";
  if record { summary += "   NEW RECORD"; }
  entity_set_enabled(find_entity_handle("Result Panel"), true);
  entity_set_enabled(find_entity_handle("Result Text"), true);
  ui_set_text_on(find_entity_handle("Result Text"), summary + "   -   Space: play again");
}`

const TRILOGY_MOVER_SOURCE = `// Kinematic platform. It moves by velocity (not teleport) so CharacterBody2D inherits the platform motion.
@export(type="float", min=-1, max=1, step=1, group="Path", tooltip="Horizontal direction") let axis_x = 1.0;
@export(type="float", min=-1, max=1, step=1, group="Path", tooltip="Vertical direction") let axis_y = 0.0;
@export(type="float", min=0.5, max=30, step=0.1, group="Path", tooltip="Travel distance from the authored position") let distance = 4.0;
@export(type="float", min=0.1, max=12, step=0.1, group="Path", tooltip="Speed in world units per second") let speed = 2.0;
@export(type="float", group="Runtime") let origin_x = 0.0;
@export(type="float", group="Runtime") let origin_y = 0.0;
@export(type="float", group="Runtime") let direction = 1.0;
fn start() {
  let pose = transform();
  origin_x = pose.position_x;
  origin_y = pose.position_y;
  direction = 1.0;
  set_velocity(axis_x * speed, axis_y * speed);
}
fn fixed_update(dt) {
  let pose = transform();
  let travelled = (pose.position_x - origin_x) * axis_x + (pose.position_y - origin_y) * axis_y;
  if travelled >= distance { direction = -1.0; }
  else if travelled <= 0.0 { direction = 1.0; }
  set_velocity(axis_x * speed * direction, axis_y * speed * direction);
}`

const TRILOGY_PHASE_SOURCE = `// Blinking platform. Disables its own collider and renderer; a faint outline entity stays visible as a telegraph.
@export(type="float", min=0.2, max=10, step=0.1, group="Timing", tooltip="Seconds the platform is solid") let solid_seconds = 1.6;
@export(type="float", min=0.2, max=10, step=0.1, group="Timing", tooltip="Seconds the platform is gone") let gone_seconds = 1.0;
@export(type="float", min=0, max=10, step=0.1, group="Timing", tooltip="Delay before the first cycle") let offset = 0.0;
@export(type="bool", group="Runtime") let solid = true;
fn start() {
  solid = true;
  if offset > 0.0 { timer_start("phase-delay", offset, false); } else { timer_start("phase", solid_seconds, false); }
}
fn on_timer(name) {
  if name == "phase-delay" { timer_start("phase", solid_seconds, false); return; }
  if name != "phase" { return; }
  solid = !solid;
  let me = entity_handle();
  component_set_enabled_on(me, "BoxCollider2D", solid);
  component_set_enabled_on(me, "ShapeRenderer2D", solid);
  if solid { timer_start("phase", solid_seconds, false); } else { timer_start("phase", gone_seconds, false); }
}`

const TRILOGY_HAZARD_SOURCE = `// Shared by every spike: touching one sends the player back to the last flag.
fn on_trigger_enter(other, px, py, nx, ny, rvx, rvy) {
  if other == find_entity("Player") { signal_emit("run.hurt", 1); }
}`

const TRILOGY_FLAG_SOURCE = `// Checkpoint flag: publishes its own position as the next respawn point, once.
@export(type="bool", group="Runtime", tooltip="Whether this flag was reached") let reached = false;
fn on_trigger_enter(other, px, py, nx, ny, rvx, rvy) {
  if reached || other != find_entity("Player") { return; }
  reached = true;
  let pose = transform();
  signal_emit("run.checkpoint", #{ x: pose.position_x, y: pose.position_y });
  ui_set_text_on(find_entity_handle("Stage Hint"), "Checkpoint saved");
}`

const TRILOGY_GOAL_SOURCE = `// Stage gate. The director decides whether the stage is complete.
fn on_trigger_enter(other, px, py, nx, ny, rvx, rvy) {
  if other == find_entity("Player") { signal_emit("run.goal", 1); }
}`

const TRILOGY_STAGES: readonly TrilogyStageSpec[] = [
  {
    index: 1, seed: 'trilogy-s1', sceneName: TRILOGY_SCENES[0], title: 'Stage 1 / 3  -  Tutorial', next: TRILOGY_SCENES[1],
    hint: 'A / D run   Space jump (hold = higher)   R restart stage', coinTarget: 0, timeLimit: 0, cameraSize: 7, cameraOffset: [2.5, 1.5], start: [-5, -2.6],
    solids: [['Ground A', [2, -4], [20, 1]], ['Ground B', [24, -4], [18, 1]], ['Ground C', [45, -4], [20, 1]], ['Start Wall', [-8.5, 1], [1, 10]], ['Step Block', [6, -2.75], [2, 1.5]], ['Tall Wall', [30, -2.3], [1, 2.4]], ['End Wall', [55.5, 1], [1, 10]]],
    oneWay: [['Ledge 1', [20, -1.5], [4, .35]], ['Ledge 2', [24.5, .8], [3, .35]]],
    movers: [], phases: [],
    spikes: [['Spike 1', [41, -3.25]]],
    flags: [['Flag 1', [26.5, -2.5]], ['Flag 2', [37, -2.5]]],
    coins: [], goal: [53, -2],
    signs: [['A / D or arrows to run', [-4, -.5]], ['Space / W to jump  -  hold for height', [6, .2]], ['Fell in? You respawn at the last flag', [13.5, .5]], ['Jump up through one-way platforms', [20, 1.6]], ['Hold Jump to clear the tall wall', [30, 1.4]], ['Spikes send you back to the last flag', [41, -1]], ['Gate: next stage', [53, 1]]]
  },
  {
    index: 2, seed: 'trilogy-s2', sceneName: TRILOGY_SCENES[1], title: 'Stage 2 / 3  -  Challenge', next: TRILOGY_SCENES[2],
    hint: 'Moving platforms carry you; blinking platforms keep a faint outline', coinTarget: 0, timeLimit: 0, cameraSize: 7, cameraOffset: [2.5, 1.5], start: [-6, -2.6],
    solids: [['Start Ground', [-2, -4], [14, 1]], ['Start Wall', [-9.5, 1], [1, 10]], ['Island', [19, -4], [4, 1]], ['High Ledge', [31, 1], [6, .6]], ['Final Ground', [51, -1], [12, 1]], ['End Wall', [57.5, 3], [1, 10]]],
    oneWay: [],
    movers: [['Glider', [8, -3.2], [3, .5], { axis_x: 1, axis_y: 0, distance: 6, speed: 2.5 }], ['Lift', [24, -3], [2.6, .5], { axis_x: 0, axis_y: 1, distance: 4.5, speed: 2 }]],
    phases: [['Phase 1', [36.5, 1.6], [2.2, .5], 0], ['Phase 2', [40, 2.2], [2.2, .5], .9], ['Phase 3', [43.5, 1.4], [2.2, .5], 0]],
    spikes: [['Spike 1', [19.6, -3.25]], ['Spike 2', [32.2, 1.55]], ['Spike 3', [48, -.25]], ['Spike 4', [49, -.25]]],
    flags: [['Flag 1', [17.8, -2.5]], ['Flag 2', [29, 2.3]]],
    coins: [], goal: [55, 1],
    signs: [['Moving platforms carry you', [8, 0]], ['Ride the lift up', [24, 3.6]], ['Blinking platforms: watch the outline', [40, 4.6]], ['Final gate', [55, 3.6]]]
  },
  {
    index: 3, seed: 'trilogy-s3', sceneName: TRILOGY_SCENES[2], title: 'Stage 3 / 3  -  Collection', next: '',
    hint: 'Collect all 10 coins in 75 s, then step into the summit gate', coinTarget: 10, timeLimit: 75, cameraSize: 8.5, cameraOffset: [0, 1], start: [-3, -4.7],
    solids: [['Floor', [0, -6], [31, 1]], ['Left Wall', [-15.5, 1], [1, 15]], ['Right Wall', [15.5, 1], [1, 15]]],
    oneWay: [['Ledge L1', [-10, -3.4], [4, .35]], ['Ledge R1', [10, -3.4], [4, .35]], ['Ledge L2', [-5, -1.2], [4, .35]], ['Ledge R2', [5, -1.2], [4, .35]], ['Ledge L3', [-10, 1], [4, .35]], ['Ledge R3', [10, 1], [4, .35]], ['Ledge L4', [-5, 3.2], [4, .35]], ['Ledge R4', [5, 3.2], [4, .35]], ['Summit', [0, 5.4], [6, .35]]],
    movers: [['Center Lift', [0, -4.5], [2.6, .5], { axis_x: 0, axis_y: 1, distance: 7.5, speed: 2.2 }]],
    phases: [],
    spikes: [],
    flags: [],
    coins: [[-12, -4.8], [12, -4.8], [-10, -2.4], [10, -2.4], [-5, -.2], [5, -.2], [-10, 2], [10, 2], [-5, 4.2], [5, 4.2]],
    goal: [0, 6.9],
    signs: [['10 coins open the summit gate', [-11, 5]], ['Lift: ride up, then jump through the summit', [9, 6]]]
  }
]

/** 构建三场景平台跳跃试玩关卡：教学→挑战→收集，共享玩家与导演脚本，通过会话累计全程成绩并存档最佳时间。 */ function platformerTrilogyTemplate(name: string): JsonRecord {
  const scripts = {
    player: stableUuid('asset:trilogy-player'), director: stableUuid('asset:trilogy-director'), mover: stableUuid('asset:trilogy-mover'),
    phase: stableUuid('asset:trilogy-phase'), hazard: stableUuid('asset:trilogy-hazard'), flag: stableUuid('asset:trilogy-flag'), goal: stableUuid('asset:trilogy-goal')
  }
  const palette: Record<string, LevelColor> = { solid: [86, 104, 128], oneWay: [120, 170, 214], mover: [116, 205, 176], phase: [233, 180, 98], spike: [240, 104, 120], flag: [255, 214, 102], goal: [139, 220, 255], coin: [250, 206, 84], player: [105, 168, 255] }
  const scenes = TRILOGY_STAGES.map(/** 按关卡规格生成单个场景：地形、平台、危险物、检查点、金币、终点、相机跟随、HUD 与导演脚本。 */ spec => {
    const s = spec.seed
    const playerSeed = `${s}-player`
    const playerUuid = stableUuid(`entity:${playerSeed}`)
    const player = shape(playerSeed, 'Player', spec.start, [.9, 1.6], {
      body: 'Kinematic', color: palette.player, scriptAsset: scripts.player,
      extra: [component(playerSeed, 'CharacterBody2D', { maxSlopeAngle: 45, stepHeight: .3, floorSnap: .2, safeMargin: .001, maxSlides: 4, coyoteTime: .1, applyPlatformVelocity: true, collisionMask: 0xffffffff })]
    })
    player.tags = ['player']
    const cam = cameraAtSize(`${s}-camera`, spec.cameraSize)
    patchComponent(cam, 'Transform2D', { position: { x: spec.start[0] + spec.cameraOffset[0], y: spec.start[1] + spec.cameraOffset[1] } })
    ;(cam.components as JsonRecord[]).push(component(`${s}-camera`, 'CameraFollow2D', { targetUuid: playerUuid, targetTag: 'player', offset: { x: spec.cameraOffset[0], y: spec.cameraOffset[1] }, smoothing: 6, deadZone: { x: .4, y: .7 }, followX: true, followY: true }))
    const world: JsonRecord[] = []
    for (const [label, at, size] of spec.solids) world.push(shape(`${s}-${label}`, label, at, size, { body: 'Static', color: palette.solid, friction: .8 }))
    for (const [label, at, size] of spec.oneWay) {
      const ledge = shape(`${s}-${label}`, label, at, size, { body: 'Static', color: palette.oneWay, friction: .8 })
      world.push(patchComponent(ledge, 'BoxCollider2D', { oneWay: true, oneWayNormal: { x: 0, y: 1 } }))
    }
    for (const [label, at, size, path] of spec.movers) {
      const platform = shape(`${s}-${label}`, label, at, size, { body: 'Kinematic', color: palette.mover, friction: .9, scriptAsset: scripts.mover })
      world.push(patchComponent(platform, 'Script2D', { properties: { ...path } }))
    }
    for (const [label, at, size, offset] of spec.phases) {
      const ghost = decorativeShape(`${s}-${label}-ghost`, `${label} Outline`, at, size, palette.phase, 'Box')
      patchComponent(ghost, 'ShapeRenderer2D', { opacity: 22, orderInLayer: -1 })
      const platform = shape(`${s}-${label}`, label, at, size, { body: 'Static', color: palette.phase, friction: .8, scriptAsset: scripts.phase })
      world.push(ghost, patchComponent(platform, 'Script2D', { properties: { solid_seconds: 1.6, gone_seconds: 1, offset } }))
    }
    for (const [label, at] of spec.spikes) {
      const spike = shape(`${s}-${label}`, label, at, [1, .5], { type: 'Triangle', body: 'Static', sensor: true, color: palette.spike, scriptAsset: scripts.hazard })
      world.push(patchComponent(spike, 'Transform2D', { rotation: Math.PI }))
    }
    for (const [label, at] of spec.flags) world.push(shape(`${s}-${label}`, label, at, [.6, 2], { body: 'Static', sensor: true, color: palette.flag, scriptAsset: scripts.flag }))
    spec.coins.forEach(/** 生成带 Collectible2D 的静态传感金币，收集者标签为 player，并加入 coin 分组供导演统计。 */ (at, index) => {
      const coin = shape(`${s}-coin-${index + 1}`, `Coin ${index + 1}`, at, [.6, .6], {
        type: 'Circle', body: 'Static', sensor: true, color: palette.coin,
        extra: [component(`${s}-coin-${index + 1}`, 'Collectible2D', { collectorTag: 'player', score: 1, destroyOnCollect: true, collectedSignal: 'collectible.collected' })]
      })
      coin.groups = ['coin']
      world.push(coin)
    })
    const goal = shape(`${s}-goal`, 'Goal Gate', spec.goal, [1.4, 3], { body: 'Static', sensor: true, color: palette.goal, scriptAsset: scripts.goal })
    patchComponent(goal, 'ShapeRenderer2D', { opacity: 55 })
    const scenery = [
      decorativeShape(`${s}-hill-1`, 'Backdrop Hill 1', [spec.start[0] + 6, -9], [22, 12], [33, 44, 62]),
      decorativeShape(`${s}-hill-2`, 'Backdrop Hill 2', [spec.start[0] + 30, -10], [30, 14], [29, 38, 55]),
      decorativeShape(`${s}-moon`, 'Backdrop Moon', [spec.start[0] + 14, 7], [3, 3], [206, 222, 255])
    ].map(/* 把背景装饰放到所有玩法物体之后绘制。 */ value => patchComponent(value, 'ShapeRenderer2D', { orderInLayer: -10, opacity: 70 }))
    const signs = spec.signs.map(/* 生成编号的世界标牌。 */ ([text, at], index) => levelSign(`${s}-sign-${index + 1}`, `Sign ${index + 1}`, at, text))
    const directorSeed = `${s}-director`
    const director = attachScript(entity(directorSeed, 'Stage Director', [0, 0], []), directorSeed, scripts.director, { stage: spec.index, next_scene: spec.next, coin_target: spec.coinTarget, time_limit: spec.timeLimit, hint: spec.hint })
    const { canvas, uuid } = levelCanvas(`${s}-hud`)
    const hud = [
      canvas,
      levelText(`${s}-title`, 'Stage Title', uuid, [-640, -470], [600, 60], spec.title, 30, 'left'),
      levelText(`${s}-stats`, 'Stage Stats', uuid, [560, -470], [720, 60], 'Time 0 s   Falls 0', 25, 'right', [190, 214, 240]),
      levelText(`${s}-hint`, 'Stage Hint', uuid, [0, 462], [1500, 56], spec.hint, 24, 'center', [176, 196, 222]),
      ...levelResultPanel(`${s}-result`, uuid, '')
    ]
    return scene(s, spec.sceneName, [cam, ...scenery, ...world, goal, player, ...signs, director, ...hud])
  })
  const tutorial = `---\ndismissible: true\ntemplate: platformer-trilogy\n---\n# Skyline Trilogy\n\nPress **Play**. Run with **A/D** (or arrows / left stick), jump with **Space/W** (hold for a higher jump), **R** restarts the current stage.\n\n1. **Tutorial** teaches running, variable jump height, one-way platforms, respawn flags and spikes.\n2. **Challenge** adds a horizontal glider, a vertical lift and three blinking platforms.\n3. **Collection** is a timed arena: collect all ten coins (Collectible2D), then enter the summit gate.\n\nThe whole run time and falls are carried between scenes through the session API; the best full run is stored with save_commit("trilogy").\n\n## What to inspect\n\n- **TrilogyPlayer.rhai** – CharacterBody2D motion, coyote time, jump buffer and jump cut.\n- **TrilogyDirector.rhai** – one script, three instances; Script2D properties select stage rules.\n- **TrilogyMover.rhai** – kinematic platforms move by velocity so the character inherits their motion.\n- Camera **CameraFollow2D** follows the player tag with smoothing and a dead zone.`
  const result = project(name, 'platformer-trilogy', scenes, [
    scriptAsset('trilogy-player', 'TrilogyPlayer', TRILOGY_PLAYER_SOURCE),
    scriptAsset('trilogy-director', 'TrilogyDirector', TRILOGY_DIRECTOR_SOURCE),
    scriptAsset('trilogy-mover', 'TrilogyMover', TRILOGY_MOVER_SOURCE),
    scriptAsset('trilogy-phase', 'TrilogyPhasePlatform', TRILOGY_PHASE_SOURCE),
    scriptAsset('trilogy-hazard', 'TrilogyHazard', TRILOGY_HAZARD_SOURCE),
    scriptAsset('trilogy-flag', 'TrilogyFlag', TRILOGY_FLAG_SOURCE),
    scriptAsset('trilogy-goal', 'TrilogyGoal', TRILOGY_GOAL_SOURCE)
  ], tutorial)
  ;(result.projectSettings as JsonRecord).inputMap = [
    { name: 'MoveHorizontal', kind: 'axis', bindings: [levelKey('KeyA', -1, -1), levelKey('ArrowLeft', -1, -1), levelKey('KeyD', 1, 1), levelKey('ArrowRight', 1, 1), levelDevice('gamepad-axis', '0')] },
    { name: 'Jump', kind: 'button', bindings: [levelKey('Space'), levelKey('KeyW'), levelKey('ArrowUp'), levelDevice('gamepad-button', '0')] },
    { name: 'Restart', kind: 'button', bindings: [levelKey('KeyR'), levelDevice('gamepad-button', '9')] }
  ]
  return result
}

// =====================================================================================
// 关卡 L2「钟摆邮差 / Pendulum Post」 id: 'pendulum-post'（category: game）
//
// 插入位置：src/projects/templates.ts，00-shared 片段之后、authoredAddition() 之前。
// 登记：TEMPLATE_FACTORIES 增加 'pendulum-post': pendulumPostTemplate。
//
// 两颗球分别挂在由刚体链节 + RevoluteJoint2D 组成的“绳索”上摆动。点击任意链节将其剪断
// （query_radius + entity_destroy），或按 1/2 直接松开球与链的连接（component_set_enabled_on）。
// 中央风车由带马达的 RevoluteJoint2D 驱动；两侧冰面坡道摩擦为 0，把落点偏差引导进中央杯子；
// 坡道末端与杯沿之间留有缺口，掉到地面即失败。两颗球都进杯即胜利，剪断次数决定评级。
// =====================================================================================

const PENDULUM_DIRECTOR_SOURCE = `// Puzzle director: cutting, delivery bookkeeping, rating and HUD.
@export(type="float", min=0.2, max=2, step=0.05, group="Input", tooltip="Click radius used to pick a rope link") let cut_radius = 0.6;
@export(type="int", group="Runtime", tooltip="Cuts and releases used") let cuts = 0;
@export(type="int", group="Runtime", tooltip="Balls inside the cup") let delivered = 0;
@export(type="bool", group="Runtime") let a_free = false;
@export(type="bool", group="Runtime") let b_free = false;
@export(type="bool", group="Runtime") let a_done = false;
@export(type="bool", group="Runtime") let b_done = false;
@export(type="bool", group="Runtime") let finished = false;
@export(type="float", group="Runtime") let elapsed = 0.0;
fn start() {
  cuts = 0; delivered = 0; elapsed = 0.0;
  a_free = false; b_free = false; a_done = false; b_done = false; finished = false;
  entity_set_enabled(find_entity_handle("Result Panel"), false);
  entity_set_enabled(find_entity_handle("Result Text"), false);
  timer_start("hud", 0.1, true);
}
fn update(dt) {
  if input_pressed("Restart") { scene_reload(); return; }
  if finished { return; }
  elapsed += dt;
  if input_pressed("ReleaseA") && !a_free {
    component_set_enabled_on(find_entity_handle("Ball A"), "RevoluteJoint2D", false);
    a_free = true; cuts += 1;
  }
  if input_pressed("ReleaseB") && !b_free {
    component_set_enabled_on(find_entity_handle("Ball B"), "RevoluteJoint2D", false);
    b_free = true; cuts += 1;
  }
  if input_pressed("Cut") {
    for target in query_radius(mouse_world_x(), mouse_world_y(), cut_radius, 16) {
      let label = entity_name_on(target);
      if label.starts_with("Link ") {
        entity_destroy(target);
        cuts += 1;
        if label.starts_with("Link A") { a_free = true; } else { b_free = true; }
        break;
      }
    }
  }
}
fn on_timer(name) {
  if name != "hud" { return; }
  let sa = if a_done { "in the cup" } else if a_free { "falling" } else { "swinging" };
  let sb = if b_done { "in the cup" } else if b_free { "falling" } else { "swinging" };
  ui_set_text_on(find_entity_handle("Puzzle Status"), "Ball A " + sa + "   Ball B " + sb + "   Cuts " + cuts + "   " + ((elapsed * 10.0).floor() / 10.0) + " s");
}
fn on_signal(name, payload, source) {
  if finished { return; }
  let ball_a = find_entity("Ball A");
  let ball_b = find_entity("Ball B");
  if name == "post.delivered" {
    if payload == ball_a && !a_done { a_done = true; delivered += 1; }
    else if payload == ball_b && !b_done { b_done = true; delivered += 1; }
    if delivered < 2 { return; }
    finished = true;
    let stars = if cuts <= 2 { 3 } else if cuts <= 4 { 2 } else { 1 };
    let best = save_get("pendulum_best_cuts", 0);
    if best == 0 || cuts < best { save_set("pendulum_best_cuts", cuts); save_commit("pendulum-post"); }
    entity_set_enabled(find_entity_handle("Result Panel"), true);
    entity_set_enabled(find_entity_handle("Result Text"), true);
    ui_set_text_on(find_entity_handle("Result Text"), "Both balls delivered!  Cuts " + cuts + "   Rating " + stars + "/3   " + ((elapsed * 10.0).floor() / 10.0) + " s   -   R to replay");
  } else if name == "post.lost" {
    if (payload == ball_a && !a_done) || (payload == ball_b && !b_done) {
      finished = true;
      entity_set_enabled(find_entity_handle("Result Panel"), true);
      entity_set_enabled(find_entity_handle("Result Text"), true);
      ui_set_text_on(find_entity_handle("Result Text"), "A ball hit the floor - press R to try again");
    }
  }
}`

const PENDULUM_CUP_SOURCE = `// Cup sensor: reports a delivered ball to the director.
fn on_trigger_enter(other, px, py, nx, ny, rvx, rvy) {
  if other == find_entity("Ball A") || other == find_entity("Ball B") { signal_emit("post.delivered", other); }
}`

const PENDULUM_FLOOR_SOURCE = `// Pit floor: a ball touching it is lost. Rope links and other debris are ignored.
fn on_collision_enter(other, px, py, nx, ny, rvx, rvy) {
  if other == find_entity("Ball A") || other == find_entity("Ball B") { signal_emit("post.lost", other); }
}`

/** 构建双钟摆投递物理谜题：链节绳索、可剪断关节、马达风车、冰面坡道、杯形传感器与失败地面。 */ function pendulumPostTemplate(name: string): JsonRecord {
  const scripts = { director: stableUuid('asset:pendulum-director'), cup: stableUuid('asset:pendulum-cup'), floor: stableUuid('asset:pendulum-floor') }
  const linkColor: LevelColor = [176, 140, 104]
  const bodies: JsonRecord[] = []
  /** 生成一条竖直链：锚点 + N 个链节（每节以 RevoluteJoint2D 铰接上一节），末端挂球并赋初速度。 */ const pendulum = (key: 'A' | 'B', anchorAt: [number, number], links: number, ballColor: LevelColor, swing: number): void => {
    const anchor = shape(`pendulum-anchor-${key}`, `Anchor ${key}`, anchorAt, [.5, .5], { type: 'Circle', body: 'Static', color: [140, 152, 170] })
    bodies.push(anchor)
    let previous = anchor
    for (let index = 1; index <= links; index++) {
      const seed = `pendulum-link-${key}${index}`
      const link = shape(seed, `Link ${key}${index}`, [anchorAt[0], anchorAt[1] - .35 - (index - 1) * .7], [.2, .7], {
        body: 'Dynamic', color: linkColor, friction: .4,
        extra: [component(seed, 'RevoluteJoint2D', { targetEntityUuid: previous.uuid, anchor: { x: 0, y: .35 }, connectedAnchor: { x: 0, y: index === 1 ? 0 : -.35 }, collideConnected: false, stiffness: 1200, damping: 35 })]
      })
      patchComponent(link, 'RigidBody2D', { density: .8, linearDamping: .02, angularDamping: .05 })
      bodies.push(link)
      previous = link
    }
    const lowest = anchorAt[1] - links * .7
    const ballSeed = `pendulum-ball-${key}`
    const ball = shape(ballSeed, `Ball ${key}`, [anchorAt[0], lowest - .45], [.9, .9], {
      type: 'Circle', body: 'Dynamic', color: ballColor, restitution: .45, friction: .2, continuous: true,
      extra: [component(ballSeed, 'RevoluteJoint2D', { targetEntityUuid: previous.uuid, anchor: { x: 0, y: .45 }, connectedAnchor: { x: 0, y: -.35 }, collideConnected: false, stiffness: 1200, damping: 35 })]
    })
    patchComponent(ball, 'RigidBody2D', { density: 2 })
    bodies.push(setInitialVelocity(ball, swing, 0))
  }
  pendulum('A', [-7, 6.2], 5, [255, 160, 86], 5.5)
  pendulum('B', [6.5, 6.2], 7, [190, 140, 255], -5)
  const ramp = (seed: string, label: string, at: [number, number], rotation: number): JsonRecord => patchComponent(shape(seed, label, at, [9.8, .35], { body: 'Static', color: [150, 214, 240], friction: 0, restitution: .05 }), 'Transform2D', { rotation })
  const hub = shape('pendulum-windmill-hub', 'Windmill Hub', [0, 1], [.5, .5], { type: 'Circle', body: 'Static', color: [120, 132, 150] })
  const rotor = shape('pendulum-windmill-rotor', 'Windmill Rotor', [0, 1], [4.4, .28], {
    body: 'Dynamic', color: [236, 120, 140], restitution: .3, friction: .3,
    extra: [component('pendulum-windmill-rotor', 'RevoluteJoint2D', { targetEntityUuid: hub.uuid, anchor: { x: 0, y: 0 }, connectedAnchor: { x: 0, y: 0 }, collideConnected: false, motorEnabled: true, motorSpeed: 1.2, maxMotorForce: 6000, stiffness: 1200, damping: 35 })]
  })
  patchComponent(rotor, 'RigidBody2D', { density: 4, gravityScale: 0, sleepingAllowed: false })
  const cupColor: LevelColor = [104, 214, 168]
  const cupSensor = shape('pendulum-cup-sensor', 'Cup Goal', [0, -5.35], [3.3, 1.1], { body: 'Static', sensor: true, color: cupColor, scriptAsset: scripts.cup })
  patchComponent(cupSensor, 'ShapeRenderer2D', { opacity: 25 })
  const floor = shape('pendulum-floor', 'Pit Floor', [0, -6.75], [25, .5], { body: 'Static', color: [92, 64, 78], friction: .8, scriptAsset: scripts.floor })
  const arena = [
    floor,
    shape('pendulum-wall-left', 'Left Wall', [-12.7, 0], [.5, 14], { body: 'Static', color: [70, 82, 102], restitution: .4 }),
    shape('pendulum-wall-right', 'Right Wall', [12.7, 0], [.5, 14], { body: 'Static', color: [70, 82, 102], restitution: .4 }),
    ramp('pendulum-ramp-left', 'Left Ice Ramp', [-7.7, -1.9], -.351),
    ramp('pendulum-ramp-right', 'Right Ice Ramp', [7.7, -1.9], .351),
    shape('pendulum-cup-bottom', 'Cup Bottom', [0, -6.15], [3.9, .3], { body: 'Static', color: cupColor, friction: .9 }),
    shape('pendulum-cup-left', 'Cup Left Wall', [-1.95, -5.4], [.3, 1.8], { body: 'Static', color: cupColor, restitution: .2 }),
    shape('pendulum-cup-right', 'Cup Right Wall', [1.95, -5.4], [.3, 1.8], { body: 'Static', color: cupColor, restitution: .2 }),
    cupSensor, hub, rotor,
    levelSign('pendulum-sign-cup', 'Cup Sign', [0, -3.4], 'Deliver both balls here', .38, [180, 236, 210]),
    levelSign('pendulum-sign-ice', 'Ice Sign', [-8.4, -.4], 'Ice: friction 0', .34, [180, 222, 246])
  ]
  const director = attachScript(entity('pendulum-director', 'Puzzle Director', [0, 0], []), 'pendulum-director', scripts.director)
  const { canvas, uuid } = levelCanvas('pendulum-hud')
  const hud = [
    canvas,
    levelText('pendulum-title', 'Puzzle Title', uuid, [-660, -470], [560, 60], 'Pendulum Post', 32, 'left'),
    levelText('pendulum-status', 'Puzzle Status', uuid, [520, -470], [800, 60], 'Ball A swinging   Ball B swinging   Cuts 0', 24, 'right', [196, 216, 240]),
    levelText('pendulum-hint', 'Puzzle Hint', uuid, [0, 462], [1500, 56], 'Click a rope link to cut it   1 / 2 release a ball   R restart', 24, 'center', [176, 196, 222]),
    ...levelResultPanel('pendulum-result', uuid, '')
  ]
  const tutorial = `---\ndismissible: true\ntemplate: pendulum-post\n---\n# Pendulum Post\n\nPress **Play**. Two balls swing on rope chains. **Click a rope link** in the Game view to cut the chain there, or press **1** / **2** to release ball A / B directly. Get both balls into the green cup. A ball touching the dark floor ends the attempt; **R** restarts.\n\n## Engine features on show\n\n- Rope chains are real rigid bodies joined with **RevoluteJoint2D**; the windmill uses a **motor** on the same joint type.\n- Cutting uses **mouse_world_x/y + query_radius + entity_destroy**; releasing uses **component_set_enabled_on** on the joint.\n- The ramps use a zero-friction material, the balls use continuous collision, the cup is a sensor.\n\nTuning knobs: ball initial velocity (Rigid Body → Velocity), rotor motor speed, ramp rotation and the cut radius on Puzzle Director.`
  const result = project(name, 'pendulum-post', [scene('pendulum-post', 'Pendulum Post', [cameraAtSize('pendulum-camera', 7), ...arena, ...bodies, director, ...hud])], [
    scriptAsset('pendulum-director', 'PendulumDirector', PENDULUM_DIRECTOR_SOURCE),
    scriptAsset('pendulum-cup', 'PendulumCup', PENDULUM_CUP_SOURCE),
    scriptAsset('pendulum-floor', 'PendulumFloor', PENDULUM_FLOOR_SOURCE)
  ], tutorial)
  ;(result.projectSettings as JsonRecord).inputMap = [
    { name: 'Cut', kind: 'button', bindings: [levelDevice('mouse-button', '0')] },
    { name: 'ReleaseA', kind: 'button', bindings: [levelKey('Digit1'), levelKey('Numpad1'), levelDevice('gamepad-button', '4')] },
    { name: 'ReleaseB', kind: 'button', bindings: [levelKey('Digit2'), levelKey('Numpad2'), levelDevice('gamepad-button', '5')] },
    { name: 'Restart', kind: 'button', bindings: [levelKey('KeyR'), levelDevice('gamepad-button', '9')] }
  ]
  return result
}

// =====================================================================================
// 关卡 L6「反应与延迟实验室 / Reflex Lab」 id: 'reflex-lab'（category: test）
//
// 插入位置：src/projects/templates.ts，00-shared 片段之后、authoredAddition() 之前。
// 登记：TEMPLATE_FACTORIES 增加 'reflex-lab': reflexLabTemplate。
//
// 场景 1「Reflex Test」：随机等待后亮绿灯，按 React 计时，5 轮给出平均/最佳/最差与抢跑次数；
//   同屏两个指针跟随体对比“原生定步 MouseFollower2D”与“脚本逐帧 set_position”的跟手差异；
//   HUD 显示脚本侧帧间隔统计（不是显示器呈现时间）。
// 场景 2「Latency Marker」：与 scripts/latency/make_test_project.py 注入的 LatencyMarker 同源脚本
//   （按住 Space 时白块出现在 (0,3)），便于外部 SendInput + 屏幕采样工具直接测端到端延迟。
// M 键在两个场景间切换。
// =====================================================================================

const REFLEX_RESET = `
  phase = 0; round = 0; false_starts = 0; go_at = 0.0; shown_at = 0.0;
  total_ms = 0.0; best_ms = 0.0; worst_ms = 0.0; history = "";
  set_position(0.0, 40.0);
  ui_set_text_on(find_entity_handle("Reflex Prompt"), "Press React (Space / Enter / click / A) to start round 1 of " + rounds);
  ui_set_text_on(find_entity_handle("Reflex Result"), "Results appear here");`

const REFLEX_DIRECTOR_SOURCE = `// Reaction test. Measures from the frame that moved the green lamp on screen to the frame that
// observed the React press. Results therefore include input and display latency and are quantised
// to the frame interval; use the Latency Marker scene with an external capture tool for system latency.
@export(type="int", min=1, max=20, step=1, group="Rules", tooltip="Valid rounds per run") let rounds = 5;
@export(type="float", min=0.2, max=10, step=0.1, group="Rules", tooltip="Shortest random wait") let min_wait = 1.2;
@export(type="float", min=0.5, max=15, step=0.1, group="Rules", tooltip="Longest random wait") let max_wait = 3.5;
@export(type="int", group="Runtime", tooltip="0 ready, 1 waiting, 2 lamp on, 3 run complete") let phase = 0;
@export(type="int", group="Runtime") let round = 0;
@export(type="int", group="Runtime") let false_starts = 0;
@export(type="float", group="Runtime") let go_at = 0.0;
@export(type="float", group="Runtime") let shown_at = 0.0;
@export(type="float", group="Runtime") let total_ms = 0.0;
@export(type="float", group="Runtime") let best_ms = 0.0;
@export(type="float", group="Runtime") let worst_ms = 0.0;
@export(type="string", group="Runtime") let history = "";
@export(type="float", group="Runtime", tooltip="Frame statistics window") let window = 0.0;
@export(type="int", group="Runtime") let frames = 0;
@export(type="float", group="Runtime") let worst_frame = 0.0;
fn start() {${REFLEX_RESET}
  window = 0.0; frames = 0; worst_frame = 0.0;
}
fn update(dt) {
  window += dt;
  frames += 1;
  if dt > worst_frame { worst_frame = dt; }
  if window >= 0.5 {
    let average = window / frames * 1000.0;
    let rate = (frames.to_float() / window).floor();
    ui_set_text_on(find_entity_handle("Frame Stats"), "Script update interval  " + ((average * 10.0).floor() / 10.0) + " ms avg   " + ((worst_frame * 10000.0).floor() / 10.0) + " ms worst   " + rate + " updates/s");
    window = 0.0; frames = 0; worst_frame = 0.0;
  }
  if input_pressed("SwitchScene") { scene_load("Latency Marker"); return; }
  if input_pressed("Restart") {${REFLEX_RESET}
    return;
  }
  let now = time_elapsed();
  if phase == 0 {
    if input_pressed("React") {
      phase = 1;
      go_at = now + random_range(min_wait, max_wait);
      ui_set_text_on(find_entity_handle("Reflex Prompt"), "Wait for green...");
    }
  } else if phase == 1 {
    if input_pressed("React") {
      false_starts += 1;
      phase = 0;
      ui_set_text_on(find_entity_handle("Reflex Prompt"), "Too early! False starts: " + false_starts + "  -  press React to retry the round");
    } else if now >= go_at {
      phase = 2;
      shown_at = now;
      set_position(0.0, 1.2);
      ui_set_text_on(find_entity_handle("Reflex Prompt"), "NOW!");
    }
  } else if phase == 2 {
    if input_pressed("React") {
      let ms = (now - shown_at) * 1000.0;
      set_position(0.0, 40.0);
      round += 1;
      total_ms += ms;
      if round == 1 || ms < best_ms { best_ms = ms; }
      if ms > worst_ms { worst_ms = ms; }
      history = history + ms.to_int() + " ms   ";
      ui_set_text_on(find_entity_handle("Reflex Result"), history);
      if round >= rounds {
        phase = 3;
        let average = total_ms / round;
        let best_average = save_get("reflex_best_average", 0.0);
        if best_average <= 0.0 || average < best_average {
          best_average = average;
          save_set("reflex_best_average", average);
          save_commit("reflex-lab");
        }
        ui_set_text_on(find_entity_handle("Reflex Prompt"), "Average " + average.to_int() + " ms   Best " + best_ms.to_int() + "   Worst " + worst_ms.to_int() + "   False starts " + false_starts + "   Record " + best_average.to_int() + " ms  -  React: new run");
      } else {
        phase = 0;
        ui_set_text_on(find_entity_handle("Reflex Prompt"), "Round " + round + "/" + rounds + ": " + ms.to_int() + " ms  -  press React for the next round");
      }
    }
  } else if phase == 3 {
    if input_pressed("React") {${REFLEX_RESET}
    }
  }
}`

const REFLEX_POINTER_SOURCE = `// Follows the pointer once per rendered frame (update). Compare with the MouseFollower2D circle,
// which the native fixed step drives, and with the operating-system cursor.
fn update(dt) {
  set_position(mouse_world_x(), mouse_world_y());
}`

// Must stay byte-compatible in behaviour with scripts/latency/make_test_project.py so the external
// harness measures the same input -> fixed step -> script -> transform -> renderer path.
const REFLEX_MARKER_SOURCE = `// Latency test marker: visible at the centre while Jump is held, parked off-screen otherwise.
fn fixed_update(dt) {
  if input_down("Jump") { set_position(0.0, 3.0); } else { set_position(0.0, 40.0); }
}`

const REFLEX_MARKER_SCENE_SOURCE = `// Marker scene manager: M returns to the reaction test.
fn update(dt) {
  if input_pressed("SwitchScene") { scene_load("Reflex Test"); }
}`

/** 构建反应时间与输入延迟试验双场景：随机绿灯计时、指针跟随对比、脚本帧间隔统计及外部延迟测量标记。 */ function reflexLabTemplate(name: string): JsonRecord {
  const scripts = { director: stableUuid('asset:reflex-director'), pointer: stableUuid('asset:reflex-pointer'), marker: stableUuid('asset:reflex-marker'), markerScene: stableUuid('asset:reflex-marker-scene') }
  const waitLamp = decorativeShape('reflex-wait-lamp', 'Wait Lamp', [0, 1.2], [7, 3.4], [58, 64, 80], 'Box')
  const goLamp = attachScript(patchComponent(decorativeShape('reflex-go-lamp', 'Go Lamp', [0, 40], [7, 3.4], [76, 217, 140], 'Box'), 'ShapeRenderer2D', { orderInLayer: 4 }), 'reflex-go-lamp', scripts.director)
  const exact = shape('reflex-pointer-exact', 'Pointer (MouseFollower2D)', [-6, -3.6], [.55, .55], {
    type: 'Circle', body: 'Kinematic', sensor: true, color: [96, 200, 255],
    extra: [component('reflex-pointer-exact', 'MouseFollower2D', { offset: { x: 0, y: 0 }, maximumSpeed: 0 })]
  })
  const scripted = attachScript(patchComponent(decorativeShape('reflex-pointer-script', 'Pointer (script update)', [6, -3.6], [.8, .8], [255, 170, 90], 'Circle'), 'ShapeRenderer2D', { opacity: 60, orderInLayer: 6 }), 'reflex-pointer-script', scripts.pointer)
  const legendExact = levelSign('reflex-legend-exact', 'Legend Exact', [-6, -4.7], 'blue = MouseFollower2D (fixed step)', .32, [150, 214, 255])
  const legendScript = levelSign('reflex-legend-script', 'Legend Script', [6, -4.7], 'orange ring = Rhai update()', .32, [255, 196, 140])
  const { canvas, uuid } = levelCanvas('reflex-hud')
  const hud = [
    canvas,
    levelText('reflex-title', 'Reflex Title', uuid, [-640, -470], [600, 60], 'Reflex Lab', 32, 'left'),
    levelText('reflex-frames', 'Frame Stats', uuid, [480, -470], [880, 60], 'Script update interval  -', 22, 'right', [190, 214, 240]),
    levelText('reflex-prompt', 'Reflex Prompt', uuid, [0, 300], [1600, 64], 'Press React (Space / Enter / click / A) to start', 30, 'center'),
    levelText('reflex-result', 'Reflex Result', uuid, [0, 370], [1600, 56], 'Results appear here', 24, 'center', [196, 230, 210]),
    levelText('reflex-hint', 'Reflex Hint', uuid, [0, 462], [1600, 56], 'Move the pointer to compare followers   R reset   M latency marker scene', 22, 'center', [170, 190, 216])
  ]
  const reflexScene = scene('reflex-test', 'Reflex Test', [cameraAtSize('reflex-camera', 6), waitLamp, goLamp, exact, scripted, legendExact, legendScript, ...hud])
  ;(reflexScene.globalSettings as JsonRecord).gravity = 0
  const marker = attachScript(patchComponent(decorativeShape('reflex-latency-marker', 'LatencyMarker', [0, 3], [3, 3], [255, 255, 255], 'Box'), 'ShapeRenderer2D', { strokeOpacity: 0, orderInLayer: 50 }), 'reflex-latency-marker', scripts.marker)
  const markerManager = attachScript(entity('reflex-marker-manager', 'Marker Scene Manager', [0, 0], []), 'reflex-marker-manager', scripts.markerScene)
  const markerHud = levelCanvas('reflex-marker-hud')
  const markerScene = scene('reflex-marker', 'Latency Marker', [cameraAtSize('reflex-marker-camera', 6), marker, markerManager, markerHud.canvas,
    levelText('reflex-marker-hint', 'Marker Hint', markerHud.uuid, [0, 440], [1600, 90], 'Hold Space: the white marker appears while Jump is down (external capture target)   M back', 24, 'center', [180, 196, 220])])
  ;(markerScene.globalSettings as JsonRecord).gravity = 0
  const tutorial = `---\ndismissible: true\ntemplate: reflex-lab\n---\n# Reflex Lab\n\n**Reflex Test**: press React (**Space**, **Enter**, left click or gamepad **A**) to arm a round, wait for the green lamp, then press React as fast as possible. Five valid rounds produce average / best / worst times; pressing early counts as a false start. The best average is stored with save_commit("reflex-lab").\n\nThe measured time runs from the frame that moved the lamp to the frame that saw the press. It therefore contains your reaction **plus** input and display latency, rounded to the frame interval. It is a game-side observation, not a calibrated latency measurement.\n\nMove the pointer to compare the blue **MouseFollower2D** circle (native fixed step) with the orange ring (Rhai update) and the system cursor. The top-right line shows the script-side update interval, not presentation timing.\n\n**Latency Marker** (press **M**): a white square appears while Space is held. It uses the same script as the external latency harness in scripts/latency, so SendInput + screen capture tools can target it.`
  const result = project(name, 'reflex-lab', [reflexScene, markerScene], [
    scriptAsset('reflex-director', 'ReflexDirector', REFLEX_DIRECTOR_SOURCE),
    scriptAsset('reflex-pointer', 'ReflexPointer', REFLEX_POINTER_SOURCE),
    scriptAsset('reflex-marker', 'LatencyMarker', REFLEX_MARKER_SOURCE),
    scriptAsset('reflex-marker-scene', 'LatencyMarkerScene', REFLEX_MARKER_SCENE_SOURCE)
  ], tutorial)
  ;(result.projectSettings as JsonRecord).inputMap = [
    { name: 'React', kind: 'button', bindings: [levelKey('Space'), levelKey('Enter'), levelDevice('mouse-button', '0'), levelDevice('gamepad-button', '0')] },
    { name: 'Jump', kind: 'button', bindings: [levelKey('Space'), levelDevice('gamepad-button', '0')] },
    { name: 'SwitchScene', kind: 'button', bindings: [levelKey('KeyM'), levelDevice('gamepad-button', '8')] },
    { name: 'Restart', kind: 'button', bindings: [levelKey('KeyR'), levelDevice('gamepad-button', '9')] }
  ]
  return result
}

const RHYTHM_CONTROLLER_SOURCE = `// Rhythm game controls. The RhythmChart2D does timing, judgement, scoring and drawing; this script
// handles the menu keys and keeps the best score of the song (save_set / save_commit).
@export(type="string", group="Song", tooltip="Save key for this song's best score") let save_key = "rhythm";
@export(type="bool", group="Runtime", tooltip="Autoplay toggled with the Autoplay action") let autoplay_on = false;
fn start() {
  show_best(save_key);
}
fn update(dt) {
  if input_pressed("Pause") {
    if rhythm_state() == "paused" { rhythm_resume(); } else { rhythm_pause(); }
  }
  if input_pressed("Retry") { rhythm_restart(); show_best(save_key); ui_set_text_on(find_entity_handle("Result Text"), ""); }
  if input_pressed("Autoplay") {
    autoplay_on = !autoplay_on;
    rhythm_set_autoplay(autoplay_on);
    ui_set_text_on(find_entity_handle("Mode Text"), if autoplay_on { "AUTOPLAY" } else { "" });
  }
}
// Script functions see only their arguments, so the save key is passed in.
fn show_best(key) {
  let best = save_get(key, 0);
  ui_set_text_on(find_entity_handle("Best Text"), "Best  " + best);
}
fn on_signal(name, payload, source) {
  if name != "rhythm.finished" { return; }
  let score = payload.score.to_int();
  let best = save_get(save_key, 0);
  if !autoplay_on && score > best {
    save_set(save_key, score);
    save_commit(save_key);
    ui_set_text_on(find_entity_handle("Best Text"), "New best  " + score);
  }
  let accuracy = (payload.accuracy * 10000.0).floor() / 100.0;
  ui_set_text_on(find_entity_handle("Result Text"), payload.rank + "   " + score + "   " + accuracy + "%   max combo " + payload.maxCombo.to_int() + "   R to play again");
}`

/** 26.46 节奏模板：原创歌曲与由同一音符事件生成的谱面、RhythmChart2D、控制脚本、HUD 与输入映射。 */ function rhythmTemplate(name: string, id: 'rhythm-lanes' | 'rhythm-lines'): JsonRecord {
  const lanes = id === 'rhythm-lanes'
  const song = lanes ? composeNeonStep() : composeSkylineDrift()
  const songUuid = stableUuid(`asset:${id}-song`), chartUuid = stableUuid(`asset:${id}-chart`), scriptUuid = stableUuid(`asset:${id}-controller`)
  const audio = songWavDataUrl(song)
  const songAsset = { ...textAsset(`${id}-song`, `${song.title}.wav`, 'other', `Assets/Audio/${song.title}.wav`, audio.url, 'audio/wav'), uuid: songUuid, assetType: 'audio', byteLength: audio.bytes, duration: audio.duration }
  const chart = lanes ? neonStepChart(song, `asset://${songUuid}`) : skylineDriftChart(song, `asset://${songUuid}`)
  const chartAsset = { ...textAsset(`${id}-chart`, `${song.title}.nova-chart`, 'other', `Assets/Charts/${song.title}.nova-chart`, chartSource(chart), 'application/x-nova-chart'), uuid: chartUuid, assetType: 'chart' }
  const rhythm = entity(`${id}-chart`, 'Rhythm Chart', [0, 0], [component(`${id}-chart`, 'RhythmChart2D', {
    chartAsset: `asset://${chartUuid}`, audioAsset: `asset://${songUuid}`, playOnStart: true, botPlay: false, leadInSeconds: 2, unitScale: 1,
    scrollSpeed: lanes ? 9 : 7.5, laneWidth: 1.5, judgeY: -3.7, hitWidth: 1.4, flickSpeed: 16,
    perfectMs: 45, greatMs: 90, goodMs: 135, badMs: 180, offsetMs: 0, volume: .9, bus: 'Music', hitSound: true, hitSoundAsset: null, hitSoundVolume: .45, laneKeys: '',
    showLanes: true, showJudgements: true, showCombo: true, hitEffects: true,
    noteColor: lanes ? { r: 110, g: 214, b: 255 } : { r: 140, g: 220, b: 255 }, holdColor: { r: 255, g: 205, b: 110 }, dragColor: { r: 255, g: 236, b: 140 }, flickColor: { r: 255, g: 110, b: 160 },
    lineColor: { r: 240, g: 246, b: 255 }, laneColor: lanes ? { r: 22, g: 28, b: 54 } : { r: 30, g: 36, b: 64 }, sortingLayer: 10, orderInLayer: 0
  })])
  attachScript(rhythm, `${id}-chart`, scriptUuid, { save_key: song.id })
  const glow = (seed: string, position: [number, number], size: number, color: [number, number, number], opacity: number) => patchComponent(decorativeShape(`${id}-${seed}`, `Backdrop ${seed}`, position, [size, size], color, 'Circle'), 'ShapeRenderer2D', { opacity, strokeOpacity: 0, sortingLayer: 1, orderInLayer: -20 })
  const backdrop = lanes
    ? [glow('a', [-7.5, 3.2], 7, [60, 40, 140], 35), glow('b', [7.8, -2.6], 8, [20, 90, 150], 30), glow('c', [0, 6.5], 10, [90, 30, 110], 25)]
    : [glow('a', [-6, -3], 9, [30, 70, 150], 30), glow('b', [6.5, 3.2], 7, [120, 50, 140], 28), glow('c', [0, 0], 13, [16, 30, 70], 40)]
  const camera = cameraAtSize(`${id}-camera`, 5)
  patchComponent(camera, 'Camera2D', { backgroundColor: lanes ? { r: 9, g: 10, b: 24 } : { r: 8, g: 14, b: 30 } })
  const { canvas, uuid } = levelCanvas(`${id}-hud`)
  const controlsText = lanes ? 'D  F  J  K  or click the lanes     Esc pause     R retry     B autoplay' : 'Click / tap notes on the lines (any letter key also works)     Esc pause     R retry     B autoplay'
  const hud = [
    canvas,
    levelText(`${id}-title`, 'Song Title', uuid, [-640, -480], [620, 56], song.title, 34, 'left'),
    levelText(`${id}-artist`, 'Song Artist', uuid, [-640, -430], [620, 40], `${song.artist}   ·   ${song.bpm} BPM   ·   Level ${chart.meta.level}`, 20, 'left', [170, 186, 220]),
    levelText(`${id}-best`, 'Best Text', uuid, [640, 470], [620, 40], 'Best  0', 22, 'right', [190, 210, 240]),
    levelText(`${id}-mode`, 'Mode Text', uuid, [-640, -385], [620, 40], '', 22, 'left', [255, 214, 120]),
    levelText(`${id}-result`, 'Result Text', uuid, [0, 300], [1500, 48], '', 28, 'center', [214, 238, 255]),
    levelText(`${id}-controls`, 'Controls Text', uuid, [-140, 486], [1500, 36], controlsText, 18, 'left', [150, 166, 200])
  ]
  const main = scene(`${id}-main`, song.title, [camera, ...backdrop, rhythm, ...hud])
  ;(main.globalSettings as JsonRecord).gravity = 0
  const tutorial = lanes
    ? `---\ndismissible: true\ntemplate: rhythm-lanes\n---\n# Rhythm Lanes\n\nPress **Play**: after a two-second lead-in the notes of **${song.title}** fall towards the judgement line. Hit them with **D F J K** (or click / touch the lanes) when they reach the line; hold the key for long notes.\n\nJudgement windows are ±45 ms (Perfect), ±90 ms (Great), ±135 ms (Good) and ±180 ms (Bad). Score is out of 1,000,000: 900,000 for accuracy and 100,000 for the longest combo.\n\n**Esc** pauses, **R** plays again, **B** toggles autoplay. Select **Rhythm Chart** and press **Edit chart** in its inspector to change the notes in the chart editor; **Offset** fixes audio delay for this chart, and the chart editor's calibration sets it for your device.`
    : `---\ndismissible: true\ntemplate: rhythm-lines\n---\n# Rhythm Lines\n\nPress **Play**: notes travel towards two judgement lines that move, turn and fade with **${song.title}**. Click or touch a note on its line when it arrives (any letter key also hits the next note). Hold for long notes, keep the pointer on yellow drag notes and swipe across pink flick notes.\n\n**Esc** pauses, **R** plays again, **B** toggles autoplay. The lines' motion is chart data: open the chart editor from the **Rhythm Chart** inspector and edit the line events to change it.`
  const result = project(name, id, [main], [songAsset, chartAsset, scriptAsset(`${id}-controller`, 'RhythmController', RHYTHM_CONTROLLER_SOURCE)], tutorial)
  ;(result.projectSettings as JsonRecord).inputMap = [
    { name: 'Pause', kind: 'button', bindings: [levelKey('Escape'), levelKey('KeyP'), levelDevice('gamepad-button', '9')] },
    { name: 'Retry', kind: 'button', bindings: [levelKey('KeyR'), levelDevice('gamepad-button', '3')] },
    { name: 'Autoplay', kind: 'button', bindings: [levelKey('KeyB')] }
  ]
  const folders = result.assetFolders as string[]
  if (!folders.includes('Assets/Charts')) folders.push('Assets/Charts')
  return result
}

const RHYTHM_LAB_CONTROLLER_SOURCE = `// Rhythm Lab. The chart says what each note type is (the stars are worth double, the mines are judged
// here) and what the timeline does (camera, backdrop, bloom, the section triggers). This script adds the
// menu keys, the best score, and the game's own judgement of the mines.
@export(type="string", group="Song", tooltip="Save key for this song's best score") let save_key = "rhythm";
@export(type="bool", group="Runtime", tooltip="Autoplay toggled with the Autoplay action") let autoplay_on = false;
fn start() {
  show_best(save_key);
}
fn update(dt) {
  if input_pressed("Pause") {
    if rhythm_state() == "paused" { rhythm_resume(); } else { rhythm_pause(); }
  }
  if input_pressed("Retry") { rhythm_restart(); show_best(save_key); ui_set_text_on(find_entity_handle("Section Text"), ""); ui_set_text_on(find_entity_handle("Result Text"), ""); }
  if input_pressed("Autoplay") {
    autoplay_on = !autoplay_on;
    rhythm_set_autoplay(autoplay_on);
    ui_set_text_on(find_entity_handle("Mode Text"), if autoplay_on { "AUTOPLAY" } else { "" });
  }
}
fn show_best(key) {
  let best = save_get(key, 0);
  ui_set_text_on(find_entity_handle("Best Text"), "Best  " + best);
}
fn on_signal(name, payload, source) {
  // A press on a mine (a "custom" note type): the game decides, here a miss and a shake.
  if name == "rhythm.touch" {
    if payload.type == "mine" {
      rhythm_judge(payload.note, "miss");
      camera_shake(0.5);
      ui_set_text_on(find_entity_handle("Section Text"), "MINE!  Leave the red ones alone");
    }
    return;
  }
  // Timeline triggers: named moments in the chart.
  if name == "rhythm.trigger" {
    if payload.name == "verse" { ui_set_text_on(find_entity_handle("Section Text"), "VERSE"); }
    if payload.name == "drop" { ui_set_text_on(find_entity_handle("Section Text"), "DROP  -  stars x2, avoid mines"); camera_shake(0.3); }
    if payload.name == "outro" { ui_set_text_on(find_entity_handle("Section Text"), "OUTRO"); }
    return;
  }
  if name != "rhythm.finished" { return; }
  let score = payload.score.to_int();
  let best = save_get(save_key, 0);
  if !autoplay_on && score > best {
    save_set(save_key, score);
    save_commit(save_key);
    ui_set_text_on(find_entity_handle("Best Text"), "New best  " + score);
  }
  let accuracy = (payload.accuracy * 10000.0).floor() / 100.0;
  ui_set_text_on(find_entity_handle("Result Text"), payload.rank + "   " + score + "   " + accuracy + "%   max combo " + payload.maxCombo.to_int() + "   R to play again");
}`

/** The star note's spinning core (a child of the prefab root, which the chart places on its note). */
const RHYTHM_LAB_STAR_SPIN_SOURCE = `// Spins the star. The root of the prefab follows the note; this child turns on its own.
@export(type="float", min=0, max=20, group="Star") let speed = 2.4;
let angle = 0.0;
fn update(dt) {
  angle += speed * dt;
  set_rotation(angle);
}`

/** The star note's root: it hears its own judgement (rhythm.note_hit / rhythm.note_miss). */
const RHYTHM_LAB_STAR_SOURCE = `// A prefab note. rhythm_my_note() is the note this object shows; its judgement arrives as a signal.
fn on_signal(name, payload, source) {
  if name == "rhythm.note_hit" {
    let note = rhythm_my_note();
    if note != () && payload.judgement == "perfect" { post_pulse("exposure", 0.35, 0.25); }
  }
}`

/** 26.47 节奏实验室：原创歌曲、自定义音符类型（预制体星星、脚本判定的地雷）、主时间线与触发器。 */ function rhythmLabTemplate(name: string): JsonRecord {
  const id = 'rhythm-lab'
  const song = composePrismPulse()
  const songUuid = stableUuid(`asset:${id}-song`), chartUuid = stableUuid(`asset:${id}-chart`), scriptUuid = stableUuid(`asset:${id}-controller`)
  const starUuid = stableUuid(`asset:${id}-star-prefab`), starScriptUuid = stableUuid(`asset:${id}-star`), spinScriptUuid = stableUuid(`asset:${id}-star-spin`)
  const audio = songWavDataUrl(song)
  const songAsset = { ...textAsset(`${id}-song`, `${song.title}.wav`, 'other', `Assets/Audio/${song.title}.wav`, audio.url, 'audio/wav'), uuid: songUuid, assetType: 'audio', byteLength: audio.bytes, duration: audio.duration }
  const chart = prismPulseChart(song, `asset://${songUuid}`, `asset://${starUuid}`, 'Prism')
  const chartAsset = { ...textAsset(`${id}-chart`, `${song.title}.nova-chart`, 'other', `Assets/Charts/${song.title}.nova-chart`, chartSource(chart), 'application/x-nova-chart'), uuid: chartUuid, assetType: 'chart' }
  // The star prefab: a soft glow (the root, placed on the note) and a spinning six-pointed star made of two
  // triangles (shapes are convex), the second a child of the first so it turns with it.
  const triangle = (radius: number, start: number) => [0, 1, 2].map(index => { const angle = start + index * Math.PI * 2 / 3; return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius } })
  const starRoot = patchComponent(decorativeShape(`${id}-star-root`, 'Star Note', [0, 0], [1.3, 1.3], [255, 214, 110], 'Circle'), 'ShapeRenderer2D', { opacity: 28, strokeOpacity: 0, sortingLayer: 10, orderInLayer: 5 })
  ;(starRoot.components as JsonRecord[]).push(component(`${id}-star-root-script`, 'Script2D', { scriptAsset: `asset://${starScriptUuid}`, properties: {} }))
  const starCore = patchComponent(decorativeShape(`${id}-star-core`, 'Star Core', [0, 0], [.9, .9], [255, 222, 120], 'Triangle'), 'ShapeRenderer2D', { shape: 'Polygon', vertices: triangle(.55, Math.PI / 2), opacity: 92, strokeColor: { r: 255, g: 250, b: 220 }, strokeOpacity: 100, strokeWidth: .04, sortingLayer: 10, orderInLayer: 6 })
  ;((starCore.components as JsonRecord[])[0].data as JsonRecord).parentUuid = starRoot.uuid
  ;(starCore.components as JsonRecord[]).push(component(`${id}-star-core-script`, 'Script2D', { scriptAsset: `asset://${spinScriptUuid}`, properties: {} }))
  const starPoint = patchComponent(decorativeShape(`${id}-star-point`, 'Star Point', [0, 0], [.9, .9], [255, 200, 90], 'Triangle'), 'ShapeRenderer2D', { shape: 'Polygon', vertices: triangle(.55, -Math.PI / 2), opacity: 92, strokeColor: { r: 255, g: 250, b: 220 }, strokeOpacity: 100, strokeWidth: .04, sortingLayer: 10, orderInLayer: 7 })
  ;((starPoint.components as JsonRecord[])[0].data as JsonRecord).parentUuid = starCore.uuid
  const starPrefab = { ...textAsset(`${id}-star-prefab`, 'Star Note.nova-prefab', 'prefab', 'Assets/Prefabs/Star Note.nova-prefab', JSON.stringify({ prefabVersion: 2, name: 'Star Note', bundle: { entities: [starRoot, starCore, starPoint], connections: [], rootUuids: [starRoot.uuid] }, variantOf: null, sourceChecksum: 'template', createdAt: new Date(0).toISOString() }), 'application/x-nova-prefab'), uuid: starUuid }
  const rhythm = entity(`${id}-chart`, 'Rhythm Chart', [0, 0], [component(`${id}-chart`, 'RhythmChart2D', {
    chartAsset: `asset://${chartUuid}`, audioAsset: `asset://${songUuid}`, playOnStart: true, botPlay: false, leadInSeconds: 2, unitScale: 1,
    scrollSpeed: 9, laneWidth: 1.5, judgeY: -3.7, hitWidth: 1.4, flickSpeed: 16,
    perfectMs: 45, greatMs: 90, goodMs: 135, badMs: 180, offsetMs: 0, volume: .9, bus: 'Music', hitSound: true, hitSoundAsset: null, hitSoundVolume: .45, laneKeys: '',
    showLanes: true, showJudgements: true, showCombo: true, hitEffects: true, showErrorBar: true,
    noteColor: { r: 120, g: 226, b: 255 }, holdColor: { r: 170, g: 150, b: 255 }, dragColor: { r: 255, g: 236, b: 140 }, flickColor: { r: 255, g: 110, b: 160 },
    lineColor: { r: 240, g: 246, b: 255 }, laneColor: { r: 20, g: 24, b: 50 }, sortingLayer: 10, orderInLayer: 0
  })])
  attachScript(rhythm, `${id}-chart`, scriptUuid, { save_key: song.id })
  // The backdrop prism the timeline turns, pulses and brightens; two glows behind it.
  const prism = patchComponent(decorativeShape(`${id}-prism`, 'Prism', [0, 1.2], [9, 9], [70, 60, 170], 'Triangle'), 'ShapeRenderer2D', { shape: 'Polygon', vertices: Array.from({ length: 6 }, (_, index) => ({ x: Math.cos(index * Math.PI / 3) * 4.2, y: Math.sin(index * Math.PI / 3) * 4.2 })), opacity: 35, strokeColor: { r: 150, g: 170, b: 255 }, strokeOpacity: 60, strokeWidth: .08, sortingLayer: 1, orderInLayer: -10 })
  const glow = (seed: string, position: [number, number], size: number, color: [number, number, number], opacity: number) => patchComponent(decorativeShape(`${id}-${seed}`, `Backdrop ${seed}`, position, [size, size], color, 'Circle'), 'ShapeRenderer2D', { opacity, strokeOpacity: 0, sortingLayer: 1, orderInLayer: -20 })
  const backdrop = [glow('a', [-7.2, -2.8], 8, [40, 70, 160], 30), glow('b', [7.4, 3], 7, [140, 50, 130], 28)]
  const camera = cameraAtSize(`${id}-camera`, 5)
  patchComponent(camera, 'Camera2D', { backgroundColor: { r: 8, g: 9, b: 22 } })
  const { canvas, uuid } = levelCanvas(`${id}-hud`)
  const hud = [
    canvas,
    levelText(`${id}-title`, 'Song Title', uuid, [-640, -480], [620, 56], song.title, 34, 'left'),
    levelText(`${id}-artist`, 'Song Artist', uuid, [-640, -430], [620, 40], `${song.artist}   ·   ${song.bpm} BPM   ·   Rhythm Lab`, 20, 'left', [170, 186, 220]),
    levelText(`${id}-best`, 'Best Text', uuid, [640, 470], [620, 40], 'Best  0', 22, 'right', [190, 210, 240]),
    levelText(`${id}-mode`, 'Mode Text', uuid, [-640, -385], [620, 40], '', 22, 'left', [255, 214, 120]),
    levelText(`${id}-section`, 'Section Text', uuid, [565, -430], [760, 40], '', 22, 'right', [255, 222, 140]),
    levelText(`${id}-result`, 'Result Text', uuid, [0, 300], [1500, 48], '', 28, 'center', [214, 238, 255]),
    levelText(`${id}-controls`, 'Controls Text', uuid, [-140, 486], [1500, 36], 'D  F  J  K  or click the lanes     gold stars x2, red mines: hands off     Esc pause     R retry     B autoplay', 18, 'left', [150, 166, 200])
  ]
  const main = scene(`${id}-main`, song.title, [camera, ...backdrop, prism, rhythm, ...hud])
  ;(main.globalSettings as JsonRecord).gravity = 0
  const tutorial = `---\ndismissible: true\ntemplate: rhythm-lab\n---\n# Rhythm Lab\n\nPress **Play**. **${song.title}** is a four-lane chart (D F J K) that uses what 26.47 opened up:\n\n- **Note types of the chart's own.** Gold **stars** are a prefab (*Star Note*): the chart places the prefab on each star note, the prefab's script spins it and hears its own judgement. Stars count double. Red **mines** are a *custom* type: pressing one is reported to the **RhythmLabController** script as \`rhythm.touch\`, and the script judges it with \`rhythm_judge(note, "miss")\`. A mine nobody touches counts as perfect.\n- **The master timeline.** In the chart, tracks zoom the camera at the drop, turn and pulse the **Prism** backdrop on every bar and raise bloom; triggers (\`verse\`, \`drop\`, \`outro\`) arrive as \`rhythm.trigger\` signals and change the section text.\n\nOpen the chart editor from the **Rhythm Chart** inspector: **Note types** lists star and mine, **Timeline** lists the tracks and triggers. The bar under the judgement line shows how early or late each hit was.\n\n**Esc** pauses, **R** plays again, **B** toggles autoplay.`
  const result = project(name, id, [main], [songAsset, chartAsset, starPrefab, scriptAsset(`${id}-controller`, 'RhythmLabController', RHYTHM_LAB_CONTROLLER_SOURCE), scriptAsset(`${id}-star`, 'StarNote', RHYTHM_LAB_STAR_SOURCE), scriptAsset(`${id}-star-spin`, 'StarSpin', RHYTHM_LAB_STAR_SPIN_SOURCE)], tutorial)
  ;(result.projectSettings as JsonRecord).inputMap = [
    { name: 'Pause', kind: 'button', bindings: [levelKey('Escape'), levelKey('KeyP'), levelDevice('gamepad-button', '9')] },
    { name: 'Retry', kind: 'button', bindings: [levelKey('KeyR'), levelDevice('gamepad-button', '3')] },
    { name: 'Autoplay', kind: 'button', bindings: [levelKey('KeyB')] }
  ]
  // The timeline's bloom track needs post-processing on (neutral until the drop).
  const rendering = (result.projectSettings as JsonRecord).rendering as JsonRecord
  rendering.postProcessing = { ...(rendering.postProcessing as JsonRecord), enabled: true, bloom: 0, exposure: 0 }
  const folders = result.assetFolders as string[]
  for (const folder of ['Assets/Charts', 'Assets/Prefabs']) if (!folders.includes(folder)) folders.push(folder)
  return result
}

/** 按新增模板身份构建检查点游戏、物理实验或视觉场景，附加对应输入、脚本、教程和渲染设置。 */ function authoredAddition(name: string, id: AddedTemplateId): JsonRecord {
  const descriptor = PROJECT_TEMPLATES.find(/* 比较 value.id 与 id，返回严格相等的判断结果。 */ value => value.id === id)!
  const bodies: JsonRecord[] = [], assets: JsonRecord[] = []
  const colors: [number, number, number][] = [[102, 178, 255], [120, 221, 187], [255, 182, 108], [200, 152, 255], [247, 133, 161], [238, 218, 129]]
  const addBody = /** 生成带物理配置的模板对象，加入待组装场景并返回其记录。 */ (suffix: string, position: [number, number], size: [number, number], options: Parameters<typeof shape>[4] = {}) => {
    const value = shape(`${id}-${suffix}`, suffix, position, size, options); bodies.push(value); return value
  }
  const addArt = /** 生成无物理装饰对象，加入待组装场景并返回其记录。 */ (suffix: string, position: [number, number], size: [number, number], color: [number, number, number], type: 'Box' | 'Circle' | 'Triangle' = 'Circle') => {
    const value = decorativeShape(`${id}-${suffix}`, suffix, position, size, color, type); bodies.push(value); return value
  }
  let gravity = descriptor.category === 'test' ? 9.80665 : 0
  let instructions = 'Press Play. Inspect the named objects and their components. Stop returns to the authored scene.'
  if (descriptor.category === 'game') {
    const courses: Record<string, [number, number][]> = {
      'coin-trail': [[-6, -2], [-3, 1], [0, 3], [3, 1], [6, -2], [0, -3]],
      'checkpoint-sprint': [[-6, -3], [-6, 3], [-2, 3], [-2, -3], [2, -3], [2, 3], [6, 3], [6, -3]],
      'slalom-run': [[-6, -3], [-4, 2], [-1, -2], [1, 2], [4, -2], [6, 3]],
      'orbit-dodge': [[-6, 0], [-3, 3], [3, 3], [6, 0], [3, -3], [-3, -3]],
      'target-circuit': [[-5, 0], [-3, 3], [0, 0], [3, -3], [5, 0], [3, 3], [0, 0], [-3, -3]],
      'hazard-crossing': [[0, -3], [0, -1], [0, 1], [0, 3]]
    }
    const points = courses[id]!, timeLimit = id === 'checkpoint-sprint' ? 25 : id === 'target-circuit' ? 20 : 0
    const hazards: [number, number][] = id === 'slalom-run' ? [[-3, -.5], [0, .5], [3, -.5]] : id === 'orbit-dodge' ? [[3, 0], [-3, 0]] : id === 'hazard-crossing' ? [[-4, -2], [2, 0], [-1, 2]] : []
    points.forEach(/** 创建指定序号的检查点装饰，仅启用首个目标以匹配依次收集规则。 */ (point, index) => {
      const goal = addArt(`Checkpoint ${index + 1}`, point, [.8, .8], colors[1])
      goal.enabled = index === 0
    })
    // 26.42 S-5: moving hazards drive themselves with set_position in their own script. In 26.41 the
    // player's script moved them with entity_set_position every frame, a cross-entity write that the
    // Runtime applies as a world edit. The player keeps the same formula for its hit test.
    const movingHazards = id === 'orbit-dodge' || id === 'hazard-crossing'
    const hazardX = (index: number, hx: number) => id === 'orbit-dodge' ? `cos(elapsed * ${index ? '1.3' : '1.0'} + ${index ? '3.141592653589793' : '0.0'}) * ${index ? '5.0' : '3.0'}` : id === 'hazard-crossing' ? `sin(elapsed * ${1 + index * .3} + ${index.toFixed(1)}) * 6.0` : hx.toFixed(1)
    const hazardY = (index: number, hy: number) => id === 'orbit-dodge' ? `sin(elapsed * ${index ? '1.3' : '1.0'} + ${index ? '3.141592653589793' : '0.0'}) * 2.5` : hy.toFixed(1)
    hazards.forEach(/* 创建危险物装饰；移动危险物附带自身的运动脚本。 */ (point, index) => {
      const hazard = addArt(`Hazard ${index + 1}`, point, [1.2, 1.2], colors[4])
      if (!movingHazards) return
      const motion = `@export(type="float", min=0, max=10000, group="Runtime") let elapsed = 0.0;
@export(type="bool", group="Runtime") let running = true;
fn start() { elapsed = 0.0; running = true; set_position(${hazardX(index, point[0])}, ${hazardY(index, point[1])}); }
fn update(dt) {
  if input_pressed("Restart") { elapsed = 0.0; running = true; set_position(${hazardX(index, point[0])}, ${hazardY(index, point[1])}); return; }
  if !running { return; }
  elapsed += dt;
  set_position(${hazardX(index, point[0])}, ${hazardY(index, point[1])});
}
fn on_signal(name, payload, source) { if name == "course.finished" { running = false; } }`
      ;(hazard.components as JsonRecord[]).push(component(`${id}-hazard-${index + 1}-script`, 'Script2D', { scriptAsset: `asset://${stableUuid(`asset:${id}-hazard-${index + 1}`)}`, properties: {} }))
      assets.push(scriptAsset(`${id}-hazard-${index + 1}`, `HazardMotion${index + 1}`, motion))
    })
    instructions = 'WASD / arrow keys move. Collect the green checkpoint; the next appears after collection. Avoid pink circles. R restarts, including after a win or loss.'
    // Rhai functions have their own scope. Lifecycle callbacks own the exported
    // state, so reset that state directly in each callback instead of a helper.
    const resetSource = `
  checkpoint = 0; elapsed = 0.0; finished = false; score_set(0.0); set_position(-7.5, -4.0);
  for index in 0..${points.length} { entity_set_enabled(find_entity_handle("Checkpoint " + (index + 1)), index == 0); }
  ui_set_text_on(find_entity_handle("Scene Title"), "${descriptor.name} | Checkpoint 1/${points.length} | WASD / arrows | R restart");`
    const source = `@export(type="int", min=0, max=8, group="Runtime") let checkpoint = 0;
@export(type="float", min=0, max=10000, group="Runtime") let elapsed = 0.0;
@export(type="bool", group="Runtime") let finished = false;
fn start() { ${resetSource} }
fn update(dt) {
  if input_pressed("Restart") { ${resetSource} return; }
  if finished { return; }
  elapsed += dt;
  let pose = transform();
  let mx = input_axis("MoveHorizontal"); let my = input_axis("MoveVertical");
  if mx != 0.0 && my != 0.0 { mx *= 0.7071067811865476; my *= 0.7071067811865476; }
  let x = pose.position_x + mx * 6.0 * dt;
  let y = pose.position_y + my * 6.0 * dt;
  if x < -8.0 { x = -8.0; } else if x > 8.0 { x = 8.0; }
  if y < -4.5 { y = -4.5; } else if y > 4.5 { y = 4.5; }
  set_position(x, y);
  ${hazards.map(/** 按关卡生成危险物位置（与危险物自身脚本同一公式）与圆形命中检测源码，命中时结束游戏并显示重启提示。 */ ([hx, hy], index) => {
    return `let hx${index} = ${hazardX(index, hx)}; let hy${index} = ${hazardY(index, hy)};\n  if (x - hx${index}) * (x - hx${index}) + (y - hy${index}) * (y - hy${index}) < 0.81 { finished = true; ${movingHazards ? 'signal_emit("course.finished", #{}); ' : ''}ui_set_text_on(find_entity_handle("Scene Title"), "Hazard hit | R to restart"); return; }`
  }).join('\n  ')}
  ${timeLimit ? `if elapsed >= ${timeLimit}.0 { finished = true; ui_set_text_on(find_entity_handle("Scene Title"), "Time expired | R to restart"); return; }` : ''}
  let xs = [${points.map(/* 调用 point[0].toFixed(1) 并返回调用结果。 */ point => point[0].toFixed(1)).join(', ')}]; let ys = [${points.map(/* 调用 point[1].toFixed(1) 并返回调用结果。 */ point => point[1].toFixed(1)).join(', ')}];
  let dx = x - xs[checkpoint]; let dy = y - ys[checkpoint];
  if dx * dx + dy * dy < 0.64 {
    entity_set_enabled(find_entity_handle("Checkpoint " + (checkpoint + 1)), false);
    checkpoint += 1; score_add(1.0);
    if checkpoint == ${points.length} { finished = true; ${movingHazards ? 'signal_emit("course.finished", #{}); ' : ''}ui_set_text_on(find_entity_handle("Scene Title"), "Course complete! | R to restart"); }
    else { entity_set_enabled(find_entity_handle("Checkpoint " + (checkpoint + 1)), true); }
  }
  if !finished { ui_set_text_on(find_entity_handle("Scene Title"), "${descriptor.name} | Checkpoint " + (checkpoint + 1) + "/${points.length}${timeLimit ? ` | Limit ${timeLimit}s | elapsed ` : ' | elapsed ' }" + elapsed.to_int() + "s | R restart"); }
}`
    const player = addArt('Player', [-7.5, -4], [.6, .6], colors[0])
    ;(player.components as JsonRecord[]).push(component(`${id}-player-script`, 'Script2D', { scriptAsset: `asset://${stableUuid(`asset:${id}-game`)}`, properties: {} }))
    assets.push(scriptAsset(`${id}-game`, 'CheckpointGame', source))
  } else if (descriptor.category === 'test') {
    addBody('Ground', [0, -5], [20, .6], { body: 'Static', color: [70, 84, 105], restitution: id === 'restitution-gallery' ? 1 : .1, friction: .6 })
    if (id === 'domino-cascade') {
      for (let i = 0; i < 20; i++) addBody(`Domino ${i + 1}`, [-6.8 + i * .7, -3.65], [.25, 2.1], { color: colors[i % colors.length], friction: .7 })
      setInitialVelocity(addBody('Striker', [-8.5, -3.4], [.75, .75], { type: 'Circle', continuous: true }), 8, 0)
    } else if (id === 'pyramid-stack') {
      for (let row = 0; row < 7; row++) for (let column = 0; column < 7 - row; column++) addBody(`Block ${row}-${column}`, [(column - (6 - row) / 2) * 1.1, -4.15 + row * 1.04], [1, 1], { color: colors[row % colors.length], friction: .8 })
    } else if (id === 'restitution-gallery') {
      for (let i = 0; i < 6; i++) addBody(`Restitution ${(i / 5).toFixed(1)}`, [-6.25 + i * 2.5, 3.4], [1, 1], { type: 'Circle', restitution: i / 5, friction: 0, color: colors[i] })
    } else if (id === 'friction-ramp') {
      for (let i = 0; i < 4; i++) {
        const friction = [0, .2, .6, 1.2][i], x = -6.75 + i * 4.5
        const ramp = addBody(`Ramp ${i + 1}`, [x, -1], [4, .35], { body: 'Static', friction, color: colors[i] })
        ;((ramp.components as JsonRecord[])[0].data as JsonRecord).rotation = -.35
        addBody(`Friction ${friction}`, [x - 1, .05], [.65, .65], { friction, color: colors[i] })
      }
    } else if (id === 'pendulum-row') {
      for (let i = 0; i < 5; i++) {
        const x = -7 + i * 3.25, length = 2 + i * .25
        const anchor = addBody(`Anchor ${i + 1}`, [x, 3.5], [.3, .3], { body: 'Static' })
        addBody(`Pendulum ${i + 1}`, [x + length * .5, 3.5 - length * Math.sqrt(.75)], [.7, .7], { type: 'Circle', color: colors[i], extra: [component(`${id}-joint-${i}`, 'DistanceJoint2D', { targetEntityUuid: anchor.uuid, distance: length, stiffness: 240, damping: 2, collideConnected: false })] })
      }
    } else if (id === 'billiards-break') {
      gravity = 0
      addBody('Top Cushion', [0, 5], [20, .6], { body: 'Static', restitution: .9, friction: 0 })
      for (const x of [-9.6, 9.6]) addBody(`Side Cushion ${x}`, [x, 0], [.6, 10], { body: 'Static', restitution: .9, friction: 0 })
      for (let row = 0; row < 4; row++) for (let col = 0; col <= row; col++) addBody(`Ball ${row}-${col}`, [2 + row * .77, (col - row / 2) * .88], [.85, .85], { type: 'Circle', restitution: .92, friction: .02, color: colors[(row + col) % colors.length] })
      setInitialVelocity(addBody('Cue Ball', [-6, 0], [.85, .85], { type: 'Circle', restitution: .92, friction: .02, continuous: true, color: [240, 245, 255] }), 12, 0)
    } else {
      for (let i = 0; i < 24; i++) setInitialVelocity(addBody(`Ballistic ${i + 1}`, [-1.65 + (i % 8) * .47, -3.5 + Math.floor(i / 8) * .5], [.35, .35], { type: 'Circle', restitution: .55, continuous: true, color: colors[i % colors.length] }), ((i % 8) - 3.5) * .65, 6 + Math.floor(i / 8) * 1.5)
      for (const x of [-9.6, 9.6]) addBody(`Basin Wall ${x}`, [x, -2], [.6, 6], { body: 'Static' })
    }
  } else if (id === 'sprite-wall') {
    assets.push(imageAsset(`${id}-sprite`, 'SharedSprite', '#ffffff'))
    for (let i = 0; i < 24; i++) bodies.push(entity(`${id}-${i}`, `Sprite ${i + 1}`, [-6.25 + (i % 6) * 2.5, 3.6 - Math.floor(i / 6) * 2.35], [component(`${id}-${i}`, 'SpriteRenderer2D', { spriteAsset: `asset://${stableUuid(`asset:${id}-sprite`)}`, size: { x: 1.7, y: 1.7 }, opacity: 100, tint: { r: colors[i % 6][0], g: colors[i % 6][1], b: colors[i % 6][2] }, sortingLayer: 1, orderInLayer: i })]))
  } else if (id === 'shape-poster' || id === 'neon-garden' || id === 'orbit-gallery') {
    addArt('Central Star', [0, 0], [2.3, 2.3], colors[2], 'Circle')
    for (let i = 0; i < (id === 'neon-garden' ? 18 : 6); i++) {
      const angle = i * Math.PI / 3, radius = id === 'orbit-gallery' ? 1.8 + i * .62 : 2.5 + Math.floor(i / 6) * 1.1
      const object = addArt(`Shape ${i + 1}`, [Math.cos(angle) * radius, Math.sin(angle) * radius], [1, 1], colors[i % 6], i % 2 ? 'Triangle' : 'Box')
      if (id === 'orbit-gallery') {
        const source = `@export(type="float", min=0, max=100000, group="Runtime") let angle = ${angle.toFixed(8)};\nfn update(dt) { angle += dt * ${(1.2 - i * .13).toFixed(2)}; set_position(cos(angle) * ${radius.toFixed(2)}, sin(angle) * ${radius.toFixed(2)}); }`
        assets.push(scriptAsset(`${id}-${i}`, `Orbit${i + 1}`, source))
        ;(object.components as JsonRecord[]).push(component(`${id}-script-${i}`, 'Script2D', { scriptAsset: `asset://${stableUuid(`asset:${id}-${i}`)}`, properties: {} }))
      }
    }
    if (id === 'shape-poster') bodies.push(entity(`${id}-caption`, 'Poster Caption', [-6.7, -3.8], [component(`${id}-caption`, 'TextRenderer2D', { text: 'NOVA / FORM & MOTION', fontSize: .8, fontWeight: 700, maxWidth: 13.5, color: { r: 239, g: 244, b: 255 }, opacity: 100, sortingLayer: 1, orderInLayer: 20 })]))
    if (id === 'neon-garden') for (let i = 0; i < 3; i++) bodies.push(entity(`${id}-light-${i}`, `Light ${i + 1}`, [-4 + i * 4, 1], [component(`${id}-light-${i}`, 'Light2D', { lightType: 'Point', color: { r: colors[i][0], g: colors[i][1], b: colors[i][2] }, intensity: 1.4, range: 7, castsShadows: true, layerMask: 0xffffffff })]))
  } else {
    const rain = id === 'rain-room', stars = id === 'starfield', count = rain ? 7 : stars ? 3 : 5
    for (let i = 0; i < count; i++) {
      const color = colors[i % 6]
      bodies.push(entity(`${id}-emitter-${i}`, `Emitter ${i + 1}`, rain ? [-7.5 + i * 2.5, 5] : stars ? [8.5, 0] : [-6 + i * 3, -2.5], [component(`${id}-emitter-${i}`, 'ParticleEmitter2D', {
        emissionRate: rain ? 16 : stars ? 20 : 18, burst: 10, lifetime: stars ? 6 : 2, maxParticles: stars ? 160 : 80,
        initialVelocityMin: rain ? { x: -.4, y: -7 } : stars ? { x: -2 - i, y: -1.5 } : { x: -1.5, y: 2.5 },
        initialVelocityMax: rain ? { x: .4, y: -5 } : stars ? { x: -1.8 - i, y: 1.5 } : { x: 1.5, y: 5 },
        gravity: { x: 0, y: rain ? -2 : stars ? 0 : -1.8 }, startColor: { r: color[0], g: color[1], b: color[2] }, endColor: { r: color[0], g: color[1], b: color[2] },
        startOpacity: 95, endOpacity: 0, startScale: stars ? .03 + i * .025 : rain ? .04 : .12, endScale: .02, sortingLayer: 1, orderInLayer: i
      })]))
    }
    if (rain) {
      const foreground = [addArt('Silhouette Base', [0, -4.3], [20, 1.2], [49, 58, 76], 'Box'), addArt('Shelter', [0, -1.5], [3.5, 4.6], [66, 79, 100], 'Box')]
      for (const object of foreground) ((object.components as JsonRecord[]).find(/* 比较 part.kind 与 'ShapeRenderer2D'，返回严格相等的判断结果。 */ part => part.kind === 'ShapeRenderer2D')!.data as JsonRecord).orderInLayer = 20
    }
  }
  const title = descriptor.category === 'game' ? `${descriptor.name} | WASD / arrows | R restart` : descriptor.name
  const main = scene(id, descriptor.name, [cameraAtSize(`${id}-camera`, 6), ...bodies, ...canvasWithLabel(`${id}-ui`, title)])
  ;(main.globalSettings as JsonRecord).gravity = gravity
  const result = project(name, id, [main], assets, `---\ndismissible: true\ntemplate: ${id}\n---\n# ${descriptor.name}\n\n${descriptor.description}\n\n${instructions}\n\n## Edit and verify\n\nSelect named objects in Scene and change one component at a time. Play checks runtime behavior; Stop restores authored values. Save, reopen, and use Manage → Build to verify persistence and export. ${descriptor.category === 'game' ? 'These are small complete checkpoint games; edit CheckpointGame.rhai to change course rules. All movement and hit tests use world units.' : 'Physics tests are teaching fixtures, not numerical certification. Particle renderings need Play to emit.'}\n`)
  if (descriptor.category === 'game') {
    const bind = /** 构造并返回记录 { device: 'keyboard', code, scale, x: 0, y: 0, gamepad: 0, deadzone: .15 }，字段按当前实参及捕获状态求值。 */ (code: string, scale: number) => ({ device: 'keyboard', code, scale, x: 0, y: 0, gamepad: 0, deadzone: .15 })
    ;(result.projectSettings as JsonRecord).inputMap = [
      { name: 'MoveHorizontal', kind: 'axis', bindings: [bind('KeyA', -1), bind('ArrowLeft', -1), bind('KeyD', 1), bind('ArrowRight', 1)] },
      { name: 'MoveVertical', kind: 'axis', bindings: [bind('KeyW', 1), bind('ArrowUp', 1), bind('KeyS', -1), bind('ArrowDown', -1)] },
      { name: 'Restart', kind: 'button', bindings: [bind('KeyR', 1)] }
    ]
  }
  if (id === 'neon-garden') { const rendering = (result.projectSettings as JsonRecord).rendering as JsonRecord; rendering.lightingEnabled = true; rendering.ambientIntensity = .12 }
  return result
}

const TEMPLATE_FACTORIES: Record<Exclude<ProjectTemplateId, AddedTemplateId>, (name: string) => JsonRecord> = {
  empty: emptyTemplate,
  'physics-sandbox': physicsTemplate,
  platformer: platformerTemplate,
  'top-down': topDownTemplate,
  'collision-lab': collisionLabTemplate,
  'rendering-lab': renderingLabTemplate,
  'ui-showcase': uiShowcaseTemplate,
  'networked-optional': networkedOptionalTemplate,
  'mouse-knockout': mouseKnockoutTemplate,
  snake: snakeTemplate,
  pong: pongTemplate,
  breakout: breakoutTemplate,
  'lighting-starter': /* 调用 templateVariant(name, 'lighting-starter', 'Rendering Lab', renderingLabTemplate) 并返回调用结果。 */ name => templateVariant(name, 'lighting-starter', 'Rendering Lab', renderingLabTemplate),
  'tile-world': /* 调用 templateVariant(name, 'tile-world', 'Top-down Scene', topDownTemplate) 并返回调用结果。 */ name => templateVariant(name, 'tile-world', 'Top-down Scene', topDownTemplate),
  'responsive-ui': /* 调用 templateVariant(name, 'responsive-ui', 'UI & Input Lab', uiShowcaseTemplate) 并返回调用结果。 */ name => templateVariant(name, 'responsive-ui', 'UI & Input Lab', uiShowcaseTemplate),
  'particle-lab': /* 调用 templateVariant(name, 'particle-lab', 'Rendering Lab', renderingLabTemplate) 并返回调用结果。 */ name => templateVariant(name, 'particle-lab', 'Rendering Lab', renderingLabTemplate),
  'audio-lab': /* 调用 templateVariant(name, 'audio-lab', 'UI & Input Lab', uiShowcaseTemplate) 并返回调用结果。 */ name => templateVariant(name, 'audio-lab', 'UI & Input Lab', uiShowcaseTemplate),
  'animation-lab': /* 调用 templateVariant(name, 'animation-lab', 'Platformer Scene', platformerTemplate) 并返回调用结果。 */ name => templateVariant(name, 'animation-lab', 'Platformer Scene', platformerTemplate),
  'physics-cleanup': /* 调用 templateVariant(name, 'physics-cleanup', 'Mouse Knockout', mouseKnockoutTemplate) 并返回调用结果。 */ name => templateVariant(name, 'physics-cleanup', 'Mouse Knockout', mouseKnockoutTemplate),
  'grid-chase': /* 调用 templateVariant(name, 'grid-chase', 'Snake', snakeTemplate) 并返回调用结果。 */ name => templateVariant(name, 'grid-chase', 'Snake', snakeTemplate),
  'platformer-trilogy': platformerTrilogyTemplate,
  'pendulum-post': pendulumPostTemplate,
  'reflex-lab': reflexLabTemplate,
  'rhythm-lanes': name => rhythmTemplate(name, 'rhythm-lanes'),
  'rhythm-lab': name => rhythmLabTemplate(name),
  'rhythm-lines': name => rhythmTemplate(name, 'rhythm-lines')
}

/** 选择已登记模板生成器，补充三语操作指南并重算资源摘要，结构审计通过后返回项目。 */ export function createTemplateProject(template: ProjectTemplateId, name: string): JsonRecord {
  const factory = TEMPLATE_ADDITIONS_26_11.some(/* 比较 value.id 与 template，返回严格相等的判断结果。 */ value => value.id === template)
    ? /* 调用 authoredAddition(name, template as AddedTemplateId) 并返回调用结果。 */ (name: string) => authoredAddition(name, template as AddedTemplateId)
    : TEMPLATE_FACTORIES[template as keyof typeof TEMPLATE_FACTORIES]
  if (!factory) throw new Error(`Unknown project template: ${String(template).slice(0, 80)}`)
  const result = factory(name)
  const tutorial = (result.assets as JsonRecord[] | undefined)?.find(/* 比较 asset.path 与 'Assets/Tutorials/Getting Started.md'，返回严格相等的判断结果。 */ asset => asset.path === 'Assets/Tutorials/Getting Started.md')
  if (tutorial) {
    const instructions = (['en', 'de', 'zh'] as const).map(/** 按语言读取模板指南，将操作、预期结果和使用要求渲染为教程 Markdown。 */ locale => {
      const guide = templateGuide(template, locale)
      const labels = locale === 'de' ? ['Steuerung und Einrichtung', 'Erwartetes Ergebnis', 'Voraussetzungen'] : locale === 'zh' ? ['操作与准备', '预期结果', '使用要求'] : ['Controls and setup', 'Expected result', 'Requirements']
      return `## ${labels[0]} (${locale})\n\n${guide.controls}\n\n### ${labels[1]}\n\n${guide.expected}\n\n${labels[2]}: ${guide.requirements.join(' · ')}\n`
    }).join('\n')
    tutorial.source = `${String(tutorial.source ?? '')}\n\n${instructions}`
    const bytes = assetSourceBytes(String(tutorial.source)), hash = sha256Bytes(bytes)
    tutorial.byteLength = bytes.length
    const pipeline = tutorial.pipeline as JsonRecord | undefined
    if (pipeline) { pipeline.sourceHash = hash; pipeline.artifactHash = hash; pipeline.contentHash = hash; pipeline.cacheKey = hash; pipeline.lastValidSource = tutorial.source }
  }
  const failures = auditTemplateProject(result, template)
  if (failures.length) throw new Error(`Template ${template} failed its release audit: ${failures.join('; ')}`)
  return result
}

/** 检查模板场景、可见几何和登记信息，并按模板契约确认组件、资源、输入及脚本示例配置。 */ export function auditTemplateProject(project: JsonRecord, template: ProjectTemplateId): string[] {
  const scenes = Array.isArray(project.scenes) ? project.scenes as JsonRecord[] : []
  const entities = scenes.flatMap(/* 根据 Array.isArray(scene.entities) 的真假，分别返回 scene.entities as JsonRecord[] 或 []。 */ scene => Array.isArray(scene.entities) ? scene.entities as JsonRecord[] : [])
  const components = new Set(entities.flatMap(/* 根据 Array.isArray(entity.components) 的真假，分别返回 (entity.components as JsonRecord[]).map(item => String(item.kind)) 或 []。 */ entity => Array.isArray(entity.components) ? (entity.components as JsonRecord[]).map(/* 调用 String(item.kind) 并返回调用结果。 */ item => String(item.kind)) : []))
  const assets = Array.isArray(project.assets) ? project.assets as JsonRecord[] : []
  const assetTypes = new Set(assets.map(/* 调用 String(asset.assetType) 并返回调用结果。 */ asset => String(asset.assetType)))
  const connections = scenes.flatMap(/* 根据 Array.isArray(scene.connections) 的真假，分别返回 scene.connections as JsonRecord[] 或 []。 */ scene => Array.isArray(scene.connections) ? scene.connections as JsonRecord[] : [])
  const failures: string[] = []
  const requireComponents = /** 将缺失的必需组件种类追加到模板审计失败列表。 */ (...kinds: string[]) => { for (const kind of kinds) if (!components.has(kind)) failures.push(`missing ${kind}`) }
  const descriptor = PROJECT_TEMPLATES.find(/* 比较 value.id 与 template，返回严格相等的判断结果。 */ value => value.id === template)
  const auditTemplate: ProjectTemplateId = ({
    'lighting-starter': 'rendering-lab', 'tile-world': 'top-down', 'responsive-ui': 'ui-showcase',
    'particle-lab': 'rendering-lab', 'audio-lab': 'ui-showcase', 'animation-lab': 'platformer',
    'physics-cleanup': 'mouse-knockout', 'grid-chase': 'snake'
  } as Partial<Record<ProjectTemplateId, ProjectTemplateId>>)[template] ?? template
  const inputMap = ((project.projectSettings as JsonRecord | undefined)?.inputMap as JsonRecord[] | undefined) ?? []
  const scripts = assets.filter(/* 比较 asset.assetType 与 'script'，返回严格相等的判断结果。 */ asset => asset.assetType === 'script').map(/* 调用 String(asset.source) 并返回调用结果。 */ asset => String(asset.source)).join('\n')
  const componentData = /** 按实体名称和组件种类读取模板组件数据，未找到时返回 undefined。 */ (entityName: string, kind: string): JsonRecord | undefined => {
    const sourceEntity = entities.find(/* 比较 item.name 与 entityName，返回严格相等的判断结果。 */ item => item.name === entityName)
    return Array.isArray(sourceEntity?.components) ? ((sourceEntity.components as JsonRecord[]).find(/* 比较 item.kind 与 kind，返回严格相等的判断结果。 */ item => item.kind === kind)?.data as JsonRecord | undefined) : undefined
  }
  const entityY = /** 读取指定模板实体的变换纵坐标，缺失时转换为 NaN 供断言失败。 */ (name: string): number => {
    const sourceEntity = entities.find(/* 比较 item.name 与 name，返回严格相等的判断结果。 */ item => item.name === name)
    const transform = Array.isArray(sourceEntity?.components) ? (sourceEntity.components as JsonRecord[]).find(/* 比较 item.kind 与 'Transform2D'，返回严格相等的判断结果。 */ item => item.kind === 'Transform2D') : undefined
    return Number(((transform?.data as JsonRecord | undefined)?.position as JsonRecord | undefined)?.y)
  }
  if (!descriptor) failures.push('template is missing from the launcher catalog')
  if (!scenes.length) failures.push('missing scene')
  requireComponents('Transform2D', 'Camera2D')
  for (const sourceScene of scenes) {
    const layers = new Set(Array.isArray(sourceScene.layers) ? sourceScene.layers.map(Number) : [1])
    const sceneEntities = Array.isArray(sourceScene.entities) ? sourceScene.entities as JsonRecord[] : []
    for (const sourceEntity of sceneEntities) {
      if (!['Box', 'Circle', 'Triangle'].includes(String(sourceEntity.entityType))) failures.push(`${sourceEntity.name ?? 'entity'} uses an unsupported runtime shape`)
      const renderers = Array.isArray(sourceEntity.components)
        ? (sourceEntity.components as JsonRecord[]).filter(/** 筛选具有可见内容的渲染及 UI 组件，用于模板透明度、图层和几何检查。 */ item => ['ShapeRenderer2D', 'SpriteRenderer2D', 'TextRenderer2D', 'Panel', 'Image', 'Text', 'Button', 'Slider', 'ProgressBar', 'Checkbox', 'TextInput'].includes(String(item.kind)))
        : []
      for (const renderer of renderers) {
        const data = renderer.data as JsonRecord | undefined
        const opacity = Number(data?.opacity ?? 100)
        const sortingLayer = Number(data?.sortingLayer ?? 1)
        if (!Number.isFinite(opacity) || opacity < 10) failures.push(`${sourceEntity.name ?? 'entity'} renderer is barely visible`)
        if (!layers.has(sortingLayer)) failures.push(`${sourceEntity.name ?? 'entity'} uses undeclared sorting layer ${sortingLayer}`)
        if (data?.shape === 'Rectangle') {
          const vertices = Array.isArray(data.vertices) ? data.vertices as JsonRecord[] : []
          const xs = vertices.map(/* 调用 Number(vertex.x) 并返回调用结果。 */ vertex => Number(vertex.x)).filter(Number.isFinite)
          const ys = vertices.map(/* 调用 Number(vertex.y) 并返回调用结果。 */ vertex => Number(vertex.y)).filter(Number.isFinite)
          const width = xs.length ? Math.max(...xs) - Math.min(...xs) : 0
          const height = ys.length ? Math.max(...ys) - Math.min(...ys) : 0
          if (vertices.length < 4 || width < .1 || height < .1) failures.push(`${sourceEntity.name ?? 'entity'} has no visible rectangle geometry`)
        }
      }
    }
  }
  if (auditTemplate === 'mouse-knockout') {
    requireComponents('RigidBody2D', 'BoxCollider2D', 'MouseFollower2D', 'Script2D', 'Canvas', 'Panel', 'Text')
    for (const api of ['view_min_x(', 'view_max_x(', 'spawn_at(', 'timer_start(', 'query_group(', 'entity_destroy(', 'score_add(', 'entity_set_enabled(', 'ui_set_text_on(']) if (!scripts.includes(api)) failures.push(`missing ${api} Mouse Knockout tutorial call`)
    const prefab = assets.find(/* 先计算 asset.assetType === 'prefab'；仅当其为真值时求右侧 asset.name === 'Knockout Target.nova-prefab'，返回短路求值结果。 */ asset => asset.assetType === 'prefab' && asset.name === 'Knockout Target.nova-prefab')
    try {
      const document = JSON.parse(String(prefab?.source ?? 'null')) as JsonRecord | null
      const bundle = document?.bundle as JsonRecord | undefined
      if (document?.prefabVersion !== 2 || !Array.isArray(bundle?.entities) || !Array.isArray(bundle?.rootUuids)) failures.push('Mouse Knockout target prefab is invalid')
    } catch { failures.push('Mouse Knockout target prefab is invalid JSON') }
    const settings = (project.projectSettings as JsonRecord | undefined)?.build as JsonRecord | undefined
    if (settings?.packageIntoExecutable !== true || settings?.runtimeMode !== 'game') failures.push('Mouse Knockout must default to a portable game executable')
    if (Number((scenes[0]?.globalSettings as JsonRecord | undefined)?.gravity) !== 0) failures.push('Mouse Knockout arena must use zero gravity')
  } else if (auditTemplate === 'snake') {
    requireComponents('RigidBody2D', 'BoxCollider2D', 'EllipseCollider2D', 'Script2D', 'Canvas', 'Text')
    if (entities.filter(/* 调用 String(item.name).startsWith('Snake Segment') 并返回调用结果。 */ item => String(item.name).startsWith('Snake Segment')).length !== 8) failures.push('Snake requires three starting segments and five growth segments')
    if (entities.filter(/* 先计算 String(item.name).startsWith('Snake Segment')；仅当其为真值时求右侧 item.enabled !== false，返回短路求值结果。 */ item => String(item.name).startsWith('Snake Segment') && item.enabled !== false).length !== 3) failures.push('Snake must start with exactly three enabled body segments')
    for (const api of ['input_pressed(', 'timer_start(', 'timer_cancel(', 'signal_emit(', 'on_trigger_enter', 'ui_set_text(', 'entity_set_enabled(']) if (!scripts.includes(api)) failures.push(`missing ${api} Snake gameplay call`)
    if (!entities.some(/* 先计算 item.name === 'Game Over Panel'；仅当其为真值时求右侧 item.enabled === false，返回短路求值结果。 */ item => item.name === 'Game Over Panel' && item.enabled === false)) failures.push('Snake is missing its initially hidden game-over UI')
    const settings = (project.projectSettings as JsonRecord | undefined)?.build as JsonRecord | undefined
    if (settings?.packageIntoExecutable !== true) failures.push('Snake must default to portable desktop packaging')
  } else if (auditTemplate === 'platformer') {
    requireComponents('SpriteRenderer2D', 'RigidBody2D', 'BoxCollider2D', 'Script2D', 'Animator', 'AudioSource', 'TileMap2D', 'Light2D', 'ShadowCaster2D', 'Canvas', 'Text')
    for (const type of ['image', 'audio', 'script', 'animation', 'controller']) if (!assetTypes.has(type)) failures.push(`missing ${type} asset`)
    if (!(entityY('Ground') < entityY('Player'))) failures.push('gravity-driven player must start above the ground')
    if (!scripts.includes('move_character(') || !scripts.includes('can_coyote_jump(')) failures.push('platformer must demonstrate exact CharacterBody2D motion and coyote time')
  } else if (auditTemplate === 'top-down') {
    requireComponents('Script2D', 'ParticleEmitter2D', 'Canvas', 'Text')
    if (scenes.length < 2) failures.push('missing scene transition target')
    for (const type of ['prefab', 'script']) if (!assetTypes.has(type)) failures.push(`missing ${type} asset`)
    for (const api of ['instantiate(', 'scene_load(', 'save_commit(']) if (!scripts.includes(api)) failures.push(`missing ${api} tutorial call`)
    const prefab = assets.find(/* 比较 asset.assetType 与 'prefab'，返回严格相等的判断结果。 */ asset => asset.assetType === 'prefab')
    try {
      const document = JSON.parse(String(prefab?.source ?? 'null')) as JsonRecord | null
      const bundle = document?.bundle as JsonRecord | undefined
      if (document?.prefabVersion !== 2 || !Array.isArray(bundle?.entities) || !Array.isArray(bundle?.rootUuids)) failures.push('top-down enemy prefab is invalid')
    } catch { failures.push('top-down enemy prefab is invalid JSON') }
  } else if (auditTemplate === 'physics-sandbox') {
    requireComponents('RigidBody2D', 'DistanceJoint2D', 'BoxCollider2D', 'EllipseCollider2D')
    if (!connections.some(/* 比较 connection.type 与 'rope'，返回严格相等的判断结果。 */ connection => connection.type === 'rope')) failures.push('missing Rope2D connection')
    if (!(entityY('Ground') < Math.min(entityY('Jointed Box'), entityY('Rope End'), entityY('Rope Ball')))) failures.push('sandbox bodies must start above the collision ground')
  } else if (auditTemplate === 'ui-showcase') {
    requireComponents('Canvas', 'Panel', 'Text', 'TextInput', 'Button', 'Checkbox', 'ProgressBar')
    for (const type of ['localization', 'uiTheme', 'audio']) if (!assetTypes.has(type)) failures.push(`missing ${type} asset`)
  } else if (auditTemplate === 'networked-optional') {
    const packages = project.packages as JsonRecord | undefined
    const installed = Array.isArray(packages?.installed) ? packages.installed as JsonRecord[] : []
    if (!installed.some(/* 比较 (item.manifest as JsonRecord | undefined)?.id 与 'top.whitelists.novaa.networking'，返回严格相等的判断结果。 */ item => (item.manifest as JsonRecord | undefined)?.id === 'top.whitelists.novaa.networking')) failures.push('missing optional networking package')
    const production = ((project.projectSettings as JsonRecord | undefined)?.production as JsonRecord | undefined)?.networking as JsonRecord | undefined
    if (production?.enabled !== false || !Array.isArray(production.replicatedEntities) || production.replicatedEntities.length !== 2) failures.push('optional networking must start offline with two replication descriptors')
  } else if (auditTemplate === 'collision-lab') {
    requireComponents('RigidBody2D', 'BoxCollider2D', 'EllipseCollider2D', 'Canvas', 'Text')
    if (componentData('CCD Bullet', 'RigidBody2D')?.continuousCollision !== 'Continuous') failures.push('collision lab bullet must use continuous collision detection')
    if (componentData('Sensor Zone', 'BoxCollider2D')?.sensor !== true) failures.push('collision lab must contain a real sensor')
    const rubberMaterial = componentData('High Restitution Ball', 'EllipseCollider2D')?.material as JsonRecord | undefined
    if (Number(rubberMaterial?.restitution ?? 0) < .9) failures.push('collision lab restitution case is missing')
  } else if (auditTemplate === 'rendering-lab') {
    requireComponents('ShapeRenderer2D', 'SpriteRenderer2D', 'TextRenderer2D', 'ParticleEmitter2D', 'Light2D', 'Canvas', 'Text')
    if (!assetTypes.has('image')) failures.push('rendering lab is missing its imported sprite')
    const rendering = (project.projectSettings as JsonRecord | undefined)?.rendering as JsonRecord | undefined
    if (rendering?.lightingEnabled !== true) failures.push('rendering lab lighting is disabled')
  } else if (auditTemplate === 'pong') {
    requireComponents('RigidBody2D', 'BoxCollider2D', 'EllipseCollider2D', 'Script2D', 'Canvas', 'Panel', 'Text')
    if (!['P1Vertical', 'P2Vertical'].every(/** 检查当前双人游戏动作是否已在输入映射中登记。 */ action => inputMap.some(/* 比较 value.name 与 action，返回严格相等的判断结果。 */ value => value.name === action))) failures.push('Pong two-player input actions are incomplete')
    if (componentData('Ball', 'RigidBody2D')?.continuousCollision !== 'Continuous') failures.push('Pong ball must use continuous collision detection')
    for (const contract of ['input_axis(', 'signal_emit("pong.point.', 'score_add(', 'ui_set_text_on(', 'winning_score = 7']) if (!scripts.includes(contract)) failures.push(`Pong is missing ${contract}`)
  } else if (auditTemplate === 'breakout') {
    requireComponents('RigidBody2D', 'BoxCollider2D', 'EllipseCollider2D', 'Script2D', 'Canvas', 'Panel', 'Text')
    if (entities.filter(/* 调用 String(item.name).startsWith('Brick ') 并返回调用结果。 */ item => String(item.name).startsWith('Brick ')).length !== 24) failures.push('Breakout must contain exactly 24 authored bricks')
    if (!inputMap.some(/* 比较 value.name 与 'MoveHorizontal'，返回严格相等的判断结果。 */ value => value.name === 'MoveHorizontal')) failures.push('Breakout movement action is missing')
    if (componentData('Ball', 'RigidBody2D')?.continuousCollision !== 'Continuous') failures.push('Breakout ball must use continuous collision detection')
    for (const contract of ['on_collision_enter', 'destroy(', 'score_add(', 'signal_emit("breakout.brick"', 'score_get(', 'view_min_y(']) if (!scripts.includes(contract)) failures.push(`Breakout is missing ${contract}`)
  }

  if (auditTemplate === 'platformer-trilogy') {
    requireComponents('CharacterBody2D', 'CameraFollow2D', 'Collectible2D', 'Script2D', 'TextRenderer2D', 'Canvas', 'Panel', 'Text')
    if (scenes.length !== 3) failures.push('Skyline Trilogy must contain exactly three stages')
    for (const contract of ['move_character(', 'can_coyote_jump(', 'input_released(', 'scene_load(', 'scene_reload(', 'session_set(', 'save_commit(', 'query_group("coin"', 'component_set_enabled_on(']) if (!scripts.includes(contract)) failures.push(`Skyline Trilogy is missing ${contract}`)
    if (entities.filter(item => String(item.name).startsWith('Coin ')).length !== 10) failures.push('Skyline Trilogy stage 3 must contain ten coins')
    if (!entities.some(item => item.name === 'Player' && Array.isArray(item.tags) && (item.tags as unknown[]).includes('player'))) failures.push('Skyline Trilogy player must carry the player tag')
    if (!entities.some(item => (item.components as JsonRecord[]).some(part => part.kind === 'BoxCollider2D' && (part.data as JsonRecord).oneWay === true))) failures.push('Skyline Trilogy must demonstrate one-way platforms')
    for (const action of ['MoveHorizontal', 'Jump', 'Restart']) if (!inputMap.some(value => value.name === action)) failures.push(`Skyline Trilogy input action ${action} is missing`)
  } else if (auditTemplate === 'pendulum-post') {
    requireComponents('RevoluteJoint2D', 'RigidBody2D', 'BoxCollider2D', 'EllipseCollider2D', 'Script2D', 'Canvas', 'Panel', 'Text')
    if (componentData('Windmill Rotor', 'RevoluteJoint2D')?.motorEnabled !== true) failures.push('Pendulum Post windmill must use a joint motor')
    for (const ball of ['Ball A', 'Ball B']) if (componentData(ball, 'RigidBody2D')?.continuousCollision !== 'Continuous') failures.push(`${ball} must use continuous collision`)
    if (Number((componentData('Left Ice Ramp', 'BoxCollider2D')?.material as JsonRecord | undefined)?.dynamicFriction ?? 1) !== 0) failures.push('Pendulum Post ramps must be frictionless')
    if (componentData('Cup Goal', 'BoxCollider2D')?.sensor !== true) failures.push('Pendulum Post cup must be a sensor')
    for (const contract of ['query_radius(', 'mouse_world_x(', 'entity_destroy(', 'component_set_enabled_on(', 'on_trigger_enter', 'on_collision_enter', 'scene_reload(']) if (!scripts.includes(contract)) failures.push(`Pendulum Post is missing ${contract}`)
    if (!inputMap.some(value => value.name === 'Cut' && Array.isArray(value.bindings) && (value.bindings as JsonRecord[]).some(binding => binding.device === 'mouse-button'))) failures.push('Pendulum Post must bind Cut to a mouse button')
  } else if (auditTemplate === 'rhythm-lab') {
    requireComponents('RhythmChart2D', 'Script2D', 'Camera2D', 'Canvas', 'Text')
    for (const type of ['chart', 'audio', 'prefab']) if (!assetTypes.has(type)) failures.push(`missing ${type} asset`)
    const rhythm = componentData('Rhythm Chart', 'RhythmChart2D')
    if (!rhythm?.chartAsset || !rhythm?.audioAsset) failures.push('the rhythm chart must reference its chart and song')
    for (const contract of ['rhythm_judge(', '"rhythm.touch"', '"rhythm.trigger"', 'rhythm_my_note(', 'rhythm_restart(', 'save_commit(']) if (!scripts.includes(contract)) failures.push(`Rhythm Lab is missing ${contract}`)
    if (!entities.some(item => item.name === 'Prism')) failures.push('Rhythm Lab needs the Prism object its timeline animates')
  } else if (auditTemplate === 'rhythm-lanes' || auditTemplate === 'rhythm-lines') {
    requireComponents('RhythmChart2D', 'Script2D', 'Camera2D', 'Canvas', 'Text')
    for (const type of ['chart', 'audio']) if (!assetTypes.has(type)) failures.push(`missing ${type} asset`)
    const rhythm = componentData('Rhythm Chart', 'RhythmChart2D')
    if (!rhythm?.chartAsset || !rhythm?.audioAsset) failures.push('the rhythm chart must reference its chart and song')
    for (const contract of ['rhythm_pause(', 'rhythm_resume(', 'rhythm_restart(', 'rhythm_set_autoplay(', '"rhythm.finished"', 'save_commit(']) if (!scripts.includes(contract)) failures.push(`rhythm template is missing ${contract}`)
    for (const action of ['Pause', 'Retry', 'Autoplay']) if (!inputMap.some(value => value.name === action)) failures.push(`rhythm template input action ${action} is missing`)
  } else if (auditTemplate === 'reflex-lab') {
    requireComponents('MouseFollower2D', 'Script2D', 'Canvas', 'Text', 'TextRenderer2D')
    if (scenes.length !== 2 || !scenes.some(value => value.name === 'Latency Marker')) failures.push('Reflex Lab must ship the Latency Marker scene')
    if (!entities.some(item => item.name === 'LatencyMarker')) failures.push('Reflex Lab is missing the harness LatencyMarker entity')
    for (const contract of ['time_elapsed(', 'random_range(', 'input_pressed("React")', 'input_down("Jump")', 'mouse_world_x(', 'save_commit(', 'scene_load(']) if (!scripts.includes(contract)) failures.push(`Reflex Lab is missing ${contract}`)
  }
  if (descriptor?.category === 'game') {
    const settings = (project.projectSettings as JsonRecord | undefined)?.build as JsonRecord | undefined
    if (settings?.runtimeMode !== 'game' || settings?.packageIntoExecutable !== true || !settings.startupSceneUuid) failures.push('playable game must default to an executable startup scene')
    if (!assets.some(/* 比较 asset.assetType 与 'script'，返回严格相等的判断结果。 */ asset => asset.assetType === 'script')) failures.push('playable game is missing gameplay scripts')
  }
  return failures
}

/* 调用 JSON.stringify(createTemplateProject(template, name)) 并返回调用结果。 */ export function createTemplateProjectJson(template: ProjectTemplateId, name: string): string {
  return JSON.stringify(createTemplateProject(template, name))
}
