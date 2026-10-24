import { serializeEntity as sharedSerializeEntity, readEntityAuthoringData as sharedReadEntityAuthoringData } from '../world/entitySerialization'
import { createRuntimeSceneData } from '../runtime/runtimeSceneData'
import { detachEntityFromConnectionsInWorld, deleteEntitySubtreeInWorld } from '../world/entityRemoval'
import { getEditorEntityBuilder } from '../editor/entityBuilderAdapter'
export function createEntityFromData(item: SceneEntityData, forcedId?: number): Entity { return getEditorEntityBuilder().createEntityFromData(item, forcedId) }
function normalizeIdentifier(value: unknown, fallback = 1): number { return getEditorEntityBuilder().normalizeIdentifier(value, fallback) }
function storedShapeType(item: SceneEntityData): string | undefined { return getEditorEntityBuilder().storedShapeType(item) }
import {instantiateEntityBundleInWorld} from '../runtime/runtimePrefabInstantiator'
import { type SceneEntityData, type EntityBundle, type EntityBundleInstance } from '../world/sceneEntityData'
export type {SceneEntityData,SceneComponentData,EntityBundle,EntityBundleInstance} from '../world/sceneEntityData'
/** 场景编辑与物理状态桥接：序列化和加载项目，创建及修改实体，协调播放、保存与撤销历史。 */
import { notify } from '../runtime/editorFeedback'
import { assertStudioDraftsSaved } from '../editor/studioSaveBoundary'

import { preflightProjectValues } from '../projects/projectPreflight'
import { cancelPendingProjectMutations, flushPendingProjectMutations, setProjectMutationRecorder } from '../runtime/projectMutationRouter'
import { cancelEditorDrafts, settleEditorDrafts } from '../editor/pendingDrafts'

import { reactive, markRaw, toRaw } from 'vue'
import { installPlainView } from '../world/plainView'
import { DEFAULT_MAX_CATCH_UP_STEPS } from '../runtime/engineTiming'
import { World, defaultCollisionMatrix, type EngineDiagnostics, type GlobalPhysicsSettings } from '../world/World'
import { Camera } from '../world/Camera'
import { Entity } from '../world/Entity'



import { finiteNumber, normalizeEntity } from '../world/geometry'
import {
  createConnection as createConnectionModel,
  initializeRopeNodes,
  normalizeConnection,
  type AnchorMode,
  type Connection
} from '../world/Connection'
import { editorState } from './editor'
import { preferencesState } from './preferences'
import { t } from '../i18n'
import { normalizeUuid } from '../world/identity'
import { Button, Canvas, Checkbox, Image as UIImage, Panel, ProgressBar, RectTransform, ShapeRenderer2D, Slider, Text as UIText, TextInput, TileMap2D, type ComponentKind } from '../world/components'

import { SceneManager } from '../world/SceneManager'
import { CommandHistory, DocumentMutationCommand } from '../editor/commands'
import { subtreeEntities, updateSelection, type SelectionMode } from '../editor/selection'
import { assetReference, assetState, loadAssets, readTextAsset, registerEmbeddedImage, serializeAssetDatabaseSettings, serializeAssetFolders, serializeAssets, synchronizeAssetDependencyMetadata, updateTextAsset } from '../assets/AssetDatabase'
import { defaultInputMap, normalizeInputMap, type InputAction } from '../runtime/input'
import { loadDeviceInputSettings, serializeDeviceInputSettings } from '../runtime/deviceInput'
import { defaultAudioSettings, normalizeAudioSettings, type AudioProjectSettings } from '../runtime/audio'

import {getEditorTileMapOwner} from '../editor/tileMapAdapter'
import { buildSettings, normalizeBuildSettings, serializeBuildSettings } from '../runtime/buildSettings'
import { normalizeScriptSettings, scriptProjectSettings, serializeScriptSettings } from '../runtime/scriptSettings'
import { hydrateProjectMetadata, projectSessionState, serializeProjectMetadata } from '../projects/projectSession'
import { NOVA_PROJECT_FORMAT, NOVA_PROJECT_FORMAT_MAJOR, NOVA_PROJECT_SCHEMA_VERSION, projectCompatibility } from '../projects/projectFormat'
import { hydrateProjectManifest, serializeProjectManifest } from '../projects/projectManifest'
import { canonicalProjectText } from '../projects/projectData'
import { recordManualSave, recoveryState, storeRecoverySnapshot } from '../runtime/recovery'
import { loadPluginManifests, serializePluginManifests } from '../runtime/plugins'
import { useSaveProject } from '../editor/saveGame'
import { loadRenderingSettings, serializeRenderingSettings } from '../renderer/renderSettings'
import { clearRenderTextures } from '../renderer/renderTextures'
import { beginPhysicsMonitorSession, recordPhysicsTelemetry } from '../runtime/physicsMonitor'
import { loadPackageState, serializePackageState } from '../runtime/packages'
import { loadWorldGameplaySettings, serializeWorldGameplaySettings, worldGameplayState } from '../runtime/worldGameplay'
import { loadLocalizationSettings, serializeLocalizationSettings } from '../runtime/localization'
import { loadRuntimeAccessibilitySettings, loadUiAudioSettings, serializeRuntimeAccessibilitySettings, serializeUiAudioSettings } from '../runtime/presentation'
import { configureUiAccessibility } from '../runtime/uiAccessibility'
import { loadProductionSettings, serializeProductionSettings } from '../runtime/production'
import { markSourceBaseline, refreshSourceStatus, stableProjectText } from '../runtime/teamWorkflow'
import { defaultPhysicsLayers, defaultPhysicsProfile } from '../runtime/physicsProduction'
import { commitProjectTransaction, createNativeProjectTransactionSink, markProjectDirty, markTransactionBaseline, projectChecksum, projectTransactionState, type ProjectMutationScope } from '../runtime/projectTransactions'
import { loadProjectTrash, serializeProjectTrash } from '../runtime/projectTrash'
import { prepareRuntimeSceneTransition as prepareSceneTransition, type PreparedRuntimeSceneTransition } from '../runtime/runtimeSceneTransition'

interface PhysicsState {
  world: World
  camera: Camera
  selectedEntityId: number | null
  selectedEntityIds: number[]
  focusEntityID: number | null
  activeTool: 'select' | 'move' | 'rotate' | 'scale' | 'pivot' | 'rect' | 'path' | 'polygon' | 'collider' | 'measure' | 'rectangle' | 'circle' | 'triangle'
  globalSettings: GlobalPhysicsSettings
  simulationRunning: boolean
  playMode: 'editing' | 'playing' | 'paused'
  engineDiagnostics: EngineDiagnostics
  inputMap: InputAction[]
  audioSettings: AudioProjectSettings
}







/** Editor compatibility factory: the existing single world uses live project resource and telemetry services. */
export function createEditorWorld(): World {
  const world:World=new World({ readTextAsset, assetRevision: () => assetState.generation, buildTileColliderDescriptors:component=>getEditorTileMapOwner(world).buildTileColliderDescriptors(component), recordPhysicsTelemetry });return world
}

// Playing frames run on the plain objects behind the editor's proxies; observers refresh separately.
installPlainView(toRaw)
const rawWorld = createEditorWorld()
const rawCamera = new Camera()

let simulationSnapshot: string | null = null
rawWorld.entities = reactive([])
rawWorld.connections = reactive([])

export const physicsState = reactive<PhysicsState>({
  world: markRaw(rawWorld),
  camera: markRaw(rawCamera),
  selectedEntityId: null,
  selectedEntityIds: [],
  focusEntityID: null,
  activeTool: 'select',
  globalSettings: {
    gravity: 9.8,
    airFriction: 0.01,
    timeScale: 1,
    tickRate: 60,
    maxCatchUpSteps: DEFAULT_MAX_CATCH_UP_STEPS,
    collisionMatrix: defaultCollisionMatrix(),
    interpolation: 'Interpolate',
    layers: defaultPhysicsLayers(),
    profile: defaultPhysicsProfile()
  },
  simulationRunning: false,
  playMode: 'editing',
  engineDiagnostics: { ...rawWorld.diagnostics },
  inputMap: defaultInputMap(),
  audioSettings: defaultAudioSettings()
})
// Development-only test hooks (stripped from production builds).
if (import.meta.env.DEV) Object.assign(globalThis, { __novaPhysicsState: physicsState, __novaDev: { getSceneJSON: () => getSceneJSON(), loadProject: (source: string) => loadProject(source) } })

export const sceneManager = reactive(new SceneManager())

const runtimeSceneData = createRuntimeSceneData({ state: physicsState, createEntityFromData, normalizeIdentifier })

/** 约束重力、阻力、时间倍率及步进参数，规范化物理档案和固定长度无符号碰撞矩阵。 */ export function normalizeGlobalSettings(): void { return runtimeSceneData.normalizeGlobalSettings() }

/** 同步单选、选择列表和聚焦实体身份，传 null 时清空选择。 */ export function enterEditMode(id: number | null): void {
  physicsState.selectedEntityId = id
  physicsState.selectedEntityIds.splice(0, physicsState.selectedEntityIds.length, ...(id === null ? [] : [id]))
  physicsState.focusEntityID = id
}

/** 过滤不存在与重复实体，再按选择模式更新集合，并确定合法主选择。 */ export function selectEntities(ids: number[], mode: SelectionMode = 'replace', primaryId?: number | null): void {
  const valid = new Set(physicsState.world.entities.map(/* 返回 entity.id 的当前值。 */ entity => entity.id))
  const requested = [...new Set(ids)].filter(/* 调用 valid.has(id) 并返回调用结果。 */ id => valid.has(id))
  const next = updateSelection(physicsState.selectedEntityIds, requested, mode)
  physicsState.selectedEntityIds.splice(0, physicsState.selectedEntityIds.length, ...next)
  const preferred = primaryId !== undefined && primaryId !== null && next.includes(primaryId)
    ? primaryId
    : next[next.length - 1] ?? null
  physicsState.selectedEntityId = preferred
}

/** 按世界原有顺序返回当前选择身份对应的实体列表。 */ export function selectedEntities(): Entity[] {
  const ids = new Set(physicsState.selectedEntityIds)
  return physicsState.world.entities.filter(/* 调用 ids.has(entity.id) 并返回调用结果。 */ entity => ids.has(entity.id))
}

/** 按组件类型复制可持久化字段，脚本仅保存允许序列化的属性，附带组件身份及启用移除状态。 */ 

/** 规范化实体后生成持久化的创作数据。 */ export function serializeEntity(entity: Entity): Record<string, unknown> { return sharedSerializeEntity(entity) }

/** Detached authoring values for inspectors; does not normalize or mutate the entity. */
/** 深复制实体创作数据，向调用方提供不共享可变对象的读取快照。 */ export function readEntityAuthoringData(entity: Entity): Record<string, unknown> { return sharedReadEntityAuthoringData(entity) }

/** 汇集实体身份、编辑属性、实例覆盖、创作元数据和组件记录，不含运行时数字身份。 */ 

/** 规范化设置并捕获活动场景实体、图层和连接，将连接实体数字身份转换为稳定引用。 */ function serializeActiveScene(): Record<string, unknown> {
  normalizeGlobalSettings()
  const entitiesById = new Map(physicsState.world.entities.map(/* 返回按声明顺序构造的数组 [entity.id, entity]。 */ entity => [entity.id, entity]))
  return {
    layers: [...editorState.layers],
    activeLayer: editorState.activeLayer,
    renderLayer: editorState.renderLayer,
    globalSettings: {
      ...physicsState.globalSettings,
      collisionMatrix: [...physicsState.globalSettings.collisionMatrix],
      layers: physicsState.globalSettings.layers.map(/** 构造并返回记录 { ...layer }，字段按当前实参及捕获状态求值。 */ layer => ({ ...layer })),
      profile: { ...physicsState.globalSettings.profile }
    },
    entities: physicsState.world.entities.map(serializeEntity),
    connections: physicsState.world.connections.map(/** 复制连接持久化字段并去除运行身份，将无限断裂阈值编码为空值以供存储。 */ connection => {
      const { id: _runtimeId, ...stored } = connection
      void _runtimeId
      return {
      ...stored,
      breakForce: Number.isFinite(connection.breakForce) ? connection.breakForce : null,
      breakTorque: Number.isFinite(connection.breakTorque) ? connection.breakTorque : null,
      anchors: connection.anchors.map(/** 用实体稳定身份替换锚点运行身份，并复制局部位置。 */ anchor => {
        const { entityId, ...storedAnchor } = anchor
        return { ...storedAnchor, entityUuid: entitiesById.get(entityId)?.uuid, localPoint: { ...anchor.localPoint } }
      }),
      restLengths: [...connection.restLengths],
      manualSegments: connection.manualSegments.map(/* 调用 segment.map(point => ({ ...point })) 并返回调用结果。 */ segment => segment.map(/** 构造并返回记录 { ...point }，字段按当前实参及捕获状态求值。 */ point => ({ ...point }))),
      ropeNodes: connection.ropeNodes.map(/** 构造并返回记录 { position: { ...node.position }, velocity: { ...node.velocity } }，字段按当前实参及捕获状态求值。 */ node => ({ position: { ...node.position }, velocity: { ...node.velocity } }))
    }} )
  }
}

/** 捕获当前场景并同步资源依赖元数据，汇集可保存的项目版本、资源、设置、回收站和所有场景。 */ function projectSource(): Record<string, unknown> {
  // serializeActiveScene creates persistence-owned component/metadata values,
  // including copies of global arrays. Avoid cloning that complete fresh tree
  // again before canonical serialization.
  sceneManager.captureActive(serializeActiveScene(), false)
  const scenes = sceneManager.serialize()
  synchronizeAssetDependencyMetadata({ scenes })
  return {
    projectFormat: NOVA_PROJECT_FORMAT,
    projectFormatMajor: NOVA_PROJECT_FORMAT_MAJOR,
    formatVersion: physicsState.world.projectFormatVersion,
    engineVersion: physicsState.world.projectEngineVersion,
    compatibility: projectCompatibility(),
    projectMetadata: serializeProjectMetadata(),
    manifest: serializeProjectManifest(),
    assets: serializeAssets(),
    assetFolders: serializeAssetFolders(),
    assetDatabase: serializeAssetDatabaseSettings(),
    plugins: serializePluginManifests(),
    packages: serializePackageState(),
    projectTrash: serializeProjectTrash(),
    projectSettings: { inputMap: normalizeInputMap(physicsState.inputMap), deviceInput: serializeDeviceInputSettings(), audio: normalizeAudioSettings(physicsState.audioSettings), physics: serializePhysicsProjectSettings(), build: serializeBuildSettings(sceneManager.scenes.map(/* 返回 scene.uuid 的当前值。 */ scene => scene.uuid)), scripting: serializeScriptSettings(), rendering: serializeRenderingSettings(), world: serializeWorldGameplaySettings(), presentation: { localization: serializeLocalizationSettings(), accessibility: serializeRuntimeAccessibilitySettings(), uiAudio: serializeUiAudioSettings() }, production: serializeProductionSettings() },
    projectStructure: {
      assetsRoot: 'Assets', settingsRoot: 'ProjectSettings', cacheRoot: '.nova/cache', importedRoot: '.nova/imported'
    },
    activeSceneUuid: sceneManager.activeSceneUuid,
    scenes
  }
}

/* 调用 canonicalProjectText(projectSource()) 并返回调用结果。 */ export function getSceneJSON(): string {
  // projectSource is already normalized to the current schema. Passing it
  // through the migration boundary would parse and allocate the complete
  // document twice more, which is particularly costly for 10k-object scenes.
  return canonicalProjectText(projectSource())
}

const ASSET_COMPONENT_FIELDS: Partial<Record<ComponentKind, string[]>> = {
  ShapeRenderer2D: ['textureAsset'],
  SpriteRenderer2D: ['spriteAsset', 'normalMapAsset'],
  TextRenderer2D: ['fontAsset'],
  Script2D: ['scriptAsset', 'eventSheetAsset', 'objectBlueprintAsset'],
  Animator: ['controllerAsset'],
  Skeleton2D: ['rigAsset', 'skinAsset'],
  TimelinePlayer: ['timelineAsset'],
  AudioSource: ['audioClip'],
  Canvas: ['themeAsset'],
  Image: ['spriteAsset'],
  Text: ['fontAsset'],
  TileMap2D: ['tileSetAsset', 'terrainRulesAsset'],
  BehaviorTree2D: ['treeAsset'],
  StateMachine2D: ['machineAsset'],
  Spawner2D: ['prefabAsset'],
  ObjectPool2D: ['prefabAsset'],
  ParticleEmitter2D: ['particleSystemAsset', 'textureAsset', 'material'],
  RhythmChart2D: ['chartAsset', 'audioAsset', 'hitSoundAsset']
}

/* 先计算 value === uuid；仅当其为假值时求右侧 value === `asset://${uuid}`，返回短路求值结果。 */ function matchesAssetReference(value: unknown, uuid: string): boolean {
  return value === uuid || value === `asset://${uuid}`
}

/** 遍历存储场景实体及已知组件资源字段，统计引用并按需替换，变更预制体引用时清除实例覆盖。 */ function visitStoredAssetReferences(scene: Record<string, unknown>, uuid: string, clear: boolean, replacementUuid?: string): number {
  if (!Array.isArray(scene.entities)) return 0
  let count = 0
  const replacement = replacementUuid ? `asset://${replacementUuid}` : null
  for (const entity of scene.entities) {
    if (!entity || typeof entity !== 'object' || !Array.isArray((entity as SceneEntityData).components)) continue
    const storedEntity = entity as SceneEntityData
    if (matchesAssetReference(storedEntity.objectBlueprintAsset, uuid)) {
      count++
      if (clear) storedEntity.objectBlueprintAsset = replacement
    }
    if (matchesAssetReference(storedEntity.prefabAsset, uuid)) {
      count++
      if (clear) {
        storedEntity.prefabAsset = replacement
        storedEntity.prefabInstanceUuid = null
        storedEntity.prefabSourceUuid = null
        storedEntity.prefabOverrides = {}
      }
    }
    for (const rawComponent of storedEntity.components ?? []) {
      if (!rawComponent || typeof rawComponent !== 'object') continue
      const component = rawComponent as { kind?: ComponentKind; data?: Record<string, unknown> }
      const fields = component.kind ? ASSET_COMPONENT_FIELDS[component.kind] : undefined
      if (!fields || !component.data) continue
      for (const field of fields) if (matchesAssetReference(component.data[field], uuid)) {
        count++
        if (clear) component.data[field] = replacement
      }
    }
  }
  return count
}

/** 遍历活动世界实体及已知组件资源字段，统计或替换资源引用，重置受影响预制体绑定。 */ function visitLiveAssetReferences(uuid: string, clear: boolean, replacementUuid?: string): number {
  let count = 0
  const replacement = replacementUuid ? `asset://${replacementUuid}` : null
  for (const entity of physicsState.world.entities) {
    if (matchesAssetReference(entity.objectBlueprintAsset, uuid)) {
      count++
      if (clear) entity.objectBlueprintAsset = replacement
    }
    if (matchesAssetReference(entity.prefabAsset, uuid)) {
      count++
      if (clear) {
        entity.prefabAsset = replacement
        entity.prefabInstanceUuid = null
        entity.prefabSourceUuid = null
        entity.prefabOverrides = {}
      }
    }
    for (const component of entity.componentMap.values()) {
      const fields = ASSET_COMPONENT_FIELDS[component.kind]
      if (!fields) continue
      for (const field of fields) if (matchesAssetReference((component as unknown as Record<string, unknown>)[field], uuid)) {
        count++
        if (clear) (component as unknown as Record<string, unknown>)[field] = replacement
      }
    }
  }
  return count
}

/** 解析动画、控制器和瓦片集文本，递归统计或替换目标资源引用，仅写回有变化的有效文档。 */ function visitDocumentAssetReferences(uuid: string, clear: boolean, replacementUuid?: string): number {
  let count = 0
  const target = `asset://${uuid}`
  const replacement = replacementUuid ? `asset://${replacementUuid}` : null
  const visit = /** 递归遍历数组和对象，识别裸身份或资源地址并统计，修改模式下替换匹配值。 */ (value: unknown): unknown => {
    if (value === uuid || value === target) { count++; return clear ? replacement : value }
    if (Array.isArray(value)) return value.map(visit)
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) (value as Record<string, unknown>)[key] = visit(child)
    }
    return value
  }
  for (const asset of assetState.records) {
    if (asset.uuid === uuid || !['animation', 'controller', 'tileset'].includes(asset.assetType)) continue
    const source = readTextAsset(asset.uuid)
    if (!source) continue
    try {
      const document = JSON.parse(source) as unknown
      const before = count
      visit(document)
      if (clear && count > before) updateTextAsset(asset.uuid, JSON.stringify(document, null, 2))
    } catch { /* Invalid editor documents are left untouched. */ }
  }
  return count
}

/** Counts references in the live scene and every unloaded scene document. */
/** 汇总活动世界、非活动场景以及支持的资源文档中的目标引用数量。 */ export function countAssetReferences(uuid: string): number {
  let count = visitLiveAssetReferences(uuid, false)
  for (const scene of sceneManager.scenes) {
    if (scene.uuid !== sceneManager.activeSceneUuid) count += visitStoredAssetReferences(scene.data, uuid, false)
  }
  return count + visitDocumentAssetReferences(uuid, false)
}

/** Clears an asset reference everywhere so deleting an asset cannot leave a broken scene. */
/** 清空活动世界、非活动场景和支持文档中的目标资源引用，返回修改次数。 */ export function clearAssetReferences(uuid: string): number {
  let count = visitLiveAssetReferences(uuid, true)
  for (const scene of sceneManager.scenes) {
    if (scene.uuid !== sceneManager.activeSceneUuid) count += visitStoredAssetReferences(scene.data, uuid, true)
  }
  return count + visitDocumentAssetReferences(uuid, true)
}

/** Replaces a missing GUID in live, unloaded-scene, and editor-document references. */
/** 校验新旧资源身份后在活动世界、非活动场景与支持文档中替换引用并汇总数量。 */ export function replaceAssetReferences(uuid: string, replacementUuid: string): number {
  if (!uuid || !replacementUuid || uuid === replacementUuid) return 0
  let count = visitLiveAssetReferences(uuid, true, replacementUuid)
  for (const scene of sceneManager.scenes) {
    if (scene.uuid !== sceneManager.activeSceneUuid) count += visitStoredAssetReferences(scene.data, uuid, true, replacementUuid)
  }
  return count + visitDocumentAssetReferences(uuid, true, replacementUuid)
}

export type UiElementKind = 'Canvas' | 'Panel' | 'Image' | 'Text' | 'Button' | 'Slider' | 'ProgressBar' | 'Checkbox' | 'TextInput'

/** Creates a renderer-independent runtime UI entity without a physics body or collider. */
/** 创建无物理碰撞的界面实体，必要时建立根画布，配置默认组件尺寸、位置和无障碍行为，并按选项记录历史。 */ export function createUiEntity(kind: UiElementKind, parentUuid: string | null = null, recordHistory = true): Entity {
  if (kind !== 'Canvas' && !parentUuid) {
    const canvas = physicsState.world.entities.find(/* 先计算 entity.hasComponent('Canvas')；仅当其为真值时求右侧 !entity.parentUuid，返回短路求值结果。 */ entity => entity.hasComponent('Canvas') && !entity.parentUuid)
    parentUuid = canvas?.uuid ?? createUiEntity('Canvas', null, false).uuid
  }
  const entity = physicsState.world.addBox({ x: 0, y: 0 }, { x: 1, y: 1 })
  const sameKind = physicsState.world.entities.filter(/* 先计算 candidate.name === kind；仅当其为假值时求右侧 candidate.name.startsWith(`${kind} `)，返回短路求值结果。 */ candidate => candidate.name === kind || candidate.name.startsWith(`${kind} `)).length
  entity.name = sameKind ? `${kind} ${sameKind + 1}` : kind
  entity.layer = editorState.activeLayer
  entity.renderer.enabled = false
  entity.removeComponent('ShapeRenderer2D')
  entity.removeComponent('RigidBody2D')
  const collider = entity.getCollider()
  if (collider) entity.removeComponent(collider.kind)
  const rect = entity.addComponent(new RectTransform())
  entity.parentUuid = kind === 'Canvas' ? null : parentUuid
  if (kind === 'Canvas') {
    entity.addComponent(new Canvas())
    rect.anchorPreset = 'stretch'
  } else if (kind === 'Panel') { entity.addComponent(new Panel()); rect.size = { x: 1200, y: 720 } }
  else if (kind === 'Image') { entity.addComponent(new UIImage()); rect.size = { x: 420, y: 260 } }
  else if (kind === 'Text') { entity.addComponent(new UIText()); rect.size = { x: 520, y: 96 } }
  else if (kind === 'Button') {
    entity.addComponent(new Button())
    const text = entity.addComponent(new UIText()); text.text = 'Button'
    rect.size = { x: 360, y: 104 }
  } else if (kind === 'Slider') { entity.addComponent(new Slider()); rect.size = { x: 480, y: 80 } }
  else if (kind === 'ProgressBar') { entity.addComponent(new ProgressBar()); rect.size = { x: 480, y: 64 } }
  else if (kind === 'Checkbox') { entity.addComponent(new Checkbox()); rect.size = { x: 360, y: 72 } }
  else { entity.addComponent(new TextInput()); rect.size = { x: 300, y: 96 } }
  if (kind === 'Button' || kind === 'Slider' || kind === 'Checkbox' || kind === 'TextInput') rect.skipNavigation = false
  configureUiAccessibility(entity, physicsState.world.entities)
  if (kind !== 'Canvas') {
    const defaultPositions: Record<Exclude<UiElementKind, 'Canvas'>, { x: number; y: number }> = {
      Panel: { x: 0, y: 0 }, Image: { x: -300, y: -100 }, Text: { x: 220, y: -250 },
      Button: { x: 210, y: -140 }, Slider: { x: 210, y: -35 }, ProgressBar: { x: 210, y: 60 },
      Checkbox: { x: 210, y: 145 }, TextInput: { x: 0, y: 270 }
    }
    const sameKindSiblingCount = physicsState.world.entities.filter(/* 先计算 candidate !== entity && candidate.parentUuid === entity.parentUuid；仅当其为真值时求右侧 candidate.hasComponent(kind)，返回短路求值结果。 */ candidate => candidate !== entity && candidate.parentUuid === entity.parentUuid && candidate.hasComponent(kind)).length
    const position = defaultPositions[kind]
    rect.position = { x: position.x + sameKindSiblingCount * 24, y: position.y + sameKindSiblingCount * 20 }
  }
  if (recordHistory) {
    selectEntities([entity.id], 'replace', entity.id)
    pushHistory(`Create UI ${kind}`)
  }
  return entity
}

/** Creates a tilemap host entity; tile collision is generated in merged runtime batches. */
/** 在当前图层创建瓦片地图实体，去除刚体与碰撞组件，选中新实体并记录历史。 */ export function createTileMapEntity(): Entity {
  const entity = physicsState.world.addBox({ x: 0, y: 0 }, { x: 1, y: 1 })
  entity.name = 'TileMap'
  entity.layer = editorState.activeLayer
  entity.renderer.enabled = false
  entity.removeComponent('RigidBody2D')
  const collider = entity.getCollider()
  if (collider) entity.removeComponent(collider.kind)
  entity.addComponent(new TileMap2D())
  selectEntities([entity.id], 'replace', entity.id)
  pushHistory('Create TileMap')
  return entity
}

/** 序列化原实体并去除实体及组件身份，以新运行身份重建后应用图层和位移、规范化结果。 */ export function cloneEntity(original: Entity, layer = original.layer, offset = { x: 0, y: 0 }): Entity {
  const data = serializeEntity(original) as SceneEntityData
  delete data.uuid
  data.components?.forEach(/** 移除复制数据中的组件稳定身份，确保重建时产生独立身份。 */ component => { delete component.uuid })
  const clone = createEntityFromData(data, physicsState.world.allocateId())
  clone.layer = layer
  clone.transform.position.x += finiteNumber(offset.x)
  clone.transform.position.y += finiteNumber(offset.y)
  normalizeEntity(clone)
  return clone
}





let entityClipboard: EntityBundle | null = null

/** 捕获所选实体子树和内部连接，保存根身份及锚点稳定身份，返回独立可复制数据包。 */ export function captureEntityBundle(ids: number[]): EntityBundle | null {
  const entities = subtreeEntities(ids, physicsState.world.entities)
  if (!entities.length) return null
  const includedIds = new Set(entities.map(/* 返回 entity.id 的当前值。 */ entity => entity.id))
  const includedUuids = new Set(entities.map(/* 返回 entity.uuid 的当前值。 */ entity => entity.uuid))
  const rootUuids = entities
    .filter(/* 先计算 !entity.parentUuid；仅当其为假值时求右侧 !includedUuids.has(entity.parentUuid)，返回短路求值结果。 */ entity => !entity.parentUuid || !includedUuids.has(entity.parentUuid))
    .map(/* 返回 entity.uuid 的当前值。 */ entity => entity.uuid)
  const uuidById = new Map(physicsState.world.entities.map(/* 返回按声明顺序构造的数组 [entity.id, entity.uuid]。 */ entity => [entity.id, entity.uuid]))
  const connections = physicsState.world.connections.flatMap(/** 仅捕获全部锚点都属于复制集合的连接，并记录锚点稳定身份。 */ connection => {
    if (!connection.anchors.every(/* 调用 includedIds.has(anchor.entityId) 并返回调用结果。 */ anchor => includedIds.has(anchor.entityId))) return []
    return [{
      connection: JSON.parse(JSON.stringify(connection)) as Connection,
      anchorUuids: connection.anchors.map(/* 当 uuidById.get(anchor.entityId) 为 null 或 undefined 时返回 ''，否则保留左侧值。 */ anchor => uuidById.get(anchor.entityId) ?? '')
    }]
  })
  return {
    entities: entities.map(/** 将实体序列化后深复制，使剪贴板内容独立于当前对象。 */ entity => JSON.parse(JSON.stringify(serializeEntity(entity))) as SceneEntityData),
    connections,
    rootUuids
  }
}

/** 将当前选择子树保存到实体剪贴板，返回捕获实体数量。 */ export function copySelectedEntities(): number {
  entityClipboard = captureEntityBundle(physicsState.selectedEntityIds)
  return entityClipboard?.entities.length ?? 0
}

/** 为复制包分配实体和实例新身份，重连父子与连接锚点，平移根子树并按选项更新选择和运行时。 */ export function instantiateEntityBundle(
  clipboard: EntityBundle,
  offset: { x: number; y: number },
  rootNameSuffix = ' copy',
  select = true,
  invalidateRuntime = true
): EntityBundleInstance {
  return instantiateEntityBundleInWorld(physicsState.world, createEntityFromData, selectEntities, clipboard, offset, rootNameSuffix, select, invalidateRuntime)
}

/** 实例化当前剪贴板，有实体时记录粘贴历史，并返回新实体。 */ export function pasteEntities(offset = { x: 10, y: -10 }): Entity[] {
  if (!entityClipboard) return []
  const pasted = instantiateEntityBundle(entityClipboard, offset)
  if (pasted.entities.length) pushHistory('Paste entities')
  return pasted.entities
}

/** 捕获当前选择并以默认偏移实例化，有复制结果时记录历史。 */ export function duplicateSelectedEntities(): Entity[] {
  const clipboard = captureEntityBundle(physicsState.selectedEntityIds)
  if (!clipboard) return []
  const pasted = instantiateEntityBundle(clipboard, { x: 10, y: -10 })
  if (pasted.entities.length) pushHistory('Duplicate entities')
  return pasted.entities
}

/** 分配连接身份并按指定实体与模式创建连接模型，追加到当前世界。 */ export function addConnection(entityIds: number[], modes: AnchorMode[] = []): Connection {
  const connection = createConnectionModel(
    physicsState.world.allocateConnectionId(),
    physicsState.world.entities,
    entityIds,
    modes
  )
  physicsState.world.connections.push(connection)
  return connection
}

/** 按运行身份移除对应连接，未找到时不更改世界。 */ export function deleteConnection(connectionId: number): void {
  const index = physicsState.world.connections.findIndex(/* 比较 connection.id 与 connectionId，返回严格相等的判断结果。 */ connection => connection.id === connectionId)
  if (index !== -1) physicsState.world.connections.splice(index, 1)
}

/** 重置连接断裂和受力状态，启用碰撞时重新生成绳索节点。 */ export function repairConnection(connectionId: number): void {
  const connection = physicsState.world.connections.find(/* 比较 candidate.id 与 connectionId，返回严格相等的判断结果。 */ candidate => candidate.id === connectionId)
  if (!connection) return
  connection.breakState = 'intact'
  connection.breakLink = -1
  connection.tension = 0
  connection.strain = 0
  if (connection.collisionEnabled) initializeRopeNodes(connection, physicsState.world.entities)
}

/** 从全部连接删除指定实体锚点，并移除失去有效结构的连接。 */ export function detachEntityFromConnections(entityId: number): void {
  detachEntityFromConnectionsInWorld(physicsState.world, entityId)
}

/** 仅复制所有锚点都在实体映射中的连接，分配新身份并重映射锚点、清空受力状态。 */ export function duplicateConnections(entityIdMap: Map<number, number>): void {
  const originals = [...physicsState.world.connections]
  for (const original of originals) {
    if (!original.anchors.every(/* 调用 entityIdMap.has(anchor.entityId) 并返回调用结果。 */ anchor => entityIdMap.has(anchor.entityId))) continue
    const clone = JSON.parse(JSON.stringify(original)) as Connection
    clone.id = physicsState.world.allocateConnectionId()
    clone.uuid = normalizeUuid(undefined)
    clone.name = `${original.name} copy`
    clone.anchors.forEach(/** 将 entityIdMap.get(anchor.entityId)! 赋给 anchor.entityId，不显式返回值。 */ anchor => { anchor.entityId = entityIdMap.get(anchor.entityId)! })
    clone.breakState = 'intact'
    clone.tension = 0
    clone.strain = 0
    if (normalizeConnection(clone, physicsState.world.entities)) physicsState.world.connections.push(clone)
  }
}

/** 从规范化候选开始寻找未占用安全整数身份，必要时从一重新搜索，耗尽返回 null。 */ 

/** 重建实体列表并保证数字身份和稳定身份唯一，同时生成身份映射及最大数字身份。 */ function loadEntities(records: SceneEntityData[]): { entities: Entity[]; maximumId: number; uuidToId: Map<string, number> } { return runtimeSceneData.loadEntities(records) }

/** 过滤不合法连接记录，分配唯一数字身份、解析锚点实体引用并保留规范化成功的连接。 */ function loadConnections(records: unknown[], entities: Entity[], uuidToId: Map<string, number>): { connections: Connection[]; maximumId: number } { return runtimeSceneData.loadConnections(records, entities, uuidToId) }

/** 从场景读取有限数值、插值、物理档案和碰撞矩阵，再统一规范化全局设置。 */ function loadGlobalSettings(scene: Record<string, unknown>): void { return runtimeSceneData.loadGlobalSettings(scene) }

/** 规范化物理设置并复制可保存的重力、时间、求解档案及碰撞层矩阵。 */ function serializePhysicsProjectSettings(): Record<string, unknown> {
  normalizeGlobalSettings()
  return {
    gravity: physicsState.globalSettings.gravity,
    airFriction: physicsState.globalSettings.airFriction,
    timeScale: physicsState.globalSettings.timeScale,
    profile: { ...physicsState.globalSettings.profile },
    layers: physicsState.globalSettings.layers.map(/** 构造并返回记录 { ...layer }，字段按当前实参及捕获状态求值。 */ layer => ({ ...layer })),
    collisionMatrix: [...physicsState.globalSettings.collisionMatrix]
  }
}

/** 读取项目级物理设置，从规范化档案同步步频和插值，再规范化碰撞层矩阵。 */ function loadPhysicsProjectSettings(value: unknown): void { return runtimeSceneData.loadPhysicsProjectSettings(value) }

/** Recover the authored document if a later hydration/normalization owner rejects it. */
/** 加载前保留运行、选择、场景及历史状态，装载失败且已修改文档时恢复旧文档并保留原错误。 */ export function loadProject(jsonString: string, preserveRuntimeSession = false): boolean {
  const rollback = {
    source: null as string | null,
    mode: physicsState.playMode, running: physicsState.simulationRunning, simulation: simulationSnapshot,
    selected: new Set(selectedEntities().map(/* 返回 entity.uuid 的当前值。 */ entity => entity.uuid)),
    primary: physicsState.world.entities.find(/* 比较 entity.id 与 physicsState.selectedEntityId，返回严格相等的判断结果。 */ entity => entity.id === physicsState.selectedEntityId)?.uuid,
    scenes: new Map(sceneManager.scenes.map(/* 返回按声明顺序构造的数组 [scene.uuid, {externalState:scene.externalState,validationState:scene.validationState,dirty:scene.dirty}]。 */ scene => [scene.uuid, {externalState:scene.externalState,validationState:scene.validationState,dirty:scene.dirty}])),
    navigation: [...sceneManager.navigationHistory], navigationIndex: sceneManager.navigationIndex,
    transactions: [...activeHistoryTransactions], baseline: historyBaseline
  }
  const loaded = hydrateProjectDocument(jsonString, preserveRuntimeSession, /** 将 getSceneJSON() 赋给 rollback.source，不显式返回值。 */ () => { rollback.source = getSceneJSON() })
  if (loaded || rollback.source === null) return loaded
  const failure = editorState.statusText
  if (!hydrateProjectDocument(rollback.source, true)) {
    editorState.statusText = failure + ' Previous document recovery also failed: ' + editorState.statusText
    return false
  }
  physicsState.playMode = rollback.mode; physicsState.simulationRunning = rollback.running; simulationSnapshot = rollback.simulation
  const ids = physicsState.world.entities.filter(/* 调用 rollback.selected.has(entity.uuid) 并返回调用结果。 */ entity => rollback.selected.has(entity.uuid)).map(/* 返回 entity.id 的当前值。 */ entity => entity.id)
  selectEntities(ids, 'replace', physicsState.world.entities.find(/* 比较 entity.uuid 与 rollback.primary，返回严格相等的判断结果。 */ entity => entity.uuid === rollback.primary)?.id ?? ids.at(-1) ?? null)
  for (const scene of sceneManager.scenes) {
    const previous = rollback.scenes.get(scene.uuid)
    if (previous) Object.assign(scene, previous)
  }
  sceneManager.navigationHistory = rollback.navigation
  sceneManager.navigationIndex = rollback.navigationIndex
  activeHistoryTransactions = rollback.transactions
  historyBaseline = rollback.baseline
  editorState.statusText = failure
  return false
}

/** 校验版本与场景数据后加载资源、项目设置和活动世界，恢复有效选择；异常转换为加载失败状态。 */ function hydrateProjectDocument(jsonString: string, preserveRuntimeSession = false, beforeHydrate?: () => void): boolean {
  const selectedUuids = new Set(selectedEntities().map(/* 返回 entity.uuid 的当前值。 */ entity => entity.uuid))
  const primaryUuid = physicsState.world.entities.find(/* 比较 entity.id 与 physicsState.selectedEntityId，返回严格相等的判断结果。 */ entity => entity.id === physicsState.selectedEntityId)?.uuid
  try {
    const preliminary: unknown = JSON.parse(jsonString)
    const preliminaryRecord = !Array.isArray(preliminary) && preliminary && typeof preliminary === 'object' ? preliminary as Record<string, unknown> : null
    const sourceSchema = Number(preliminaryRecord?.formatVersion)
    if (Number.isFinite(sourceSchema) && sourceSchema > NOVA_PROJECT_SCHEMA_VERSION) throw new Error(`Project schema ${sourceSchema} is newer than supported schema ${NOVA_PROJECT_SCHEMA_VERSION}.`)
    const isCurrent = preliminaryRecord?.projectFormat === NOVA_PROJECT_FORMAT && Number(preliminaryRecord.projectFormatMajor) === NOVA_PROJECT_FORMAT_MAJOR && sourceSchema === NOVA_PROJECT_SCHEMA_VERSION
    const parsed: unknown = isCurrent ? preliminary : JSON.parse(physicsState.world.formatProjectJson(jsonString))
    const root = Array.isArray(parsed) ? { entities: parsed } : parsed
    if (!root || typeof root !== 'object') throw new Error(t('invalidProjectRoot'))
    const project = root as Record<string, unknown>
    preflightProjectValues(project)
    const preflightScenes = Array.isArray(project.scenes) ? project.scenes : [project]
    for (const scene of preflightScenes) for (const entity of (scene as {entities: SceneEntityData[]}).entities) {
      const shape = storedShapeType(entity)
      if (shape !== 'Circle' && shape !== 'Box' && shape !== 'Triangle') throw new Error(t('unsupportedShape', {shape: String(shape)}))
    }
    beforeHydrate?.()
    hydrateProjectMetadata(project.projectMetadata)
    hydrateProjectManifest(project.manifest)
    useSaveProject()
    loadAssets(project.assets, project.assetFolders, project.assetDatabase)
    loadPluginManifests(project.plugins)
    loadPackageState(project.packages)
    loadProjectTrash(project.projectTrash)
    const projectSettings = project.projectSettings && typeof project.projectSettings === 'object'
      ? project.projectSettings as Record<string, unknown>
      : {}
    physicsState.inputMap.splice(0, physicsState.inputMap.length, ...normalizeInputMap(projectSettings.inputMap))
    loadDeviceInputSettings(projectSettings.deviceInput)
    Object.assign(physicsState.audioSettings, normalizeAudioSettings(projectSettings.audio))
    loadPhysicsProjectSettings(projectSettings.physics)
    Object.assign(scriptProjectSettings, normalizeScriptSettings(projectSettings.scripting))
    loadRenderingSettings(projectSettings.rendering)
    loadWorldGameplaySettings(projectSettings.world)
    loadProductionSettings(projectSettings.production)
    const presentation = projectSettings.presentation && typeof projectSettings.presentation === 'object' ? projectSettings.presentation as Record<string, unknown> : {}
    loadLocalizationSettings(presentation.localization)
    loadRuntimeAccessibilitySettings(presentation.accessibility)
    loadUiAudioSettings(presentation.uiAudio)
    const sceneRecords = Array.isArray(project.scenes)
      ? project.scenes
      : [{ uuid: normalizeUuid(undefined), name: 'Main Scene', ...project }]
    sceneManager.importProject(sceneRecords, project.activeSceneUuid)
    Object.assign(buildSettings, normalizeBuildSettings(projectSettings.build, sceneManager.scenes.map(/* 返回 scene.uuid 的当前值。 */ scene => scene.uuid)))
    const scene = sceneManager.activeScene.data
    if (!Array.isArray(scene.entities)) throw new Error(t('missingEntitiesArray'))

    const { entities, maximumId, uuidToId } = loadEntities(scene.entities as SceneEntityData[])
    for (const entity of entities) {
      const renderer = entity.getComponent<ShapeRenderer2D>('ShapeRenderer2D')
      if (renderer?.texture && !renderer.textureAsset) {
        const asset = registerEmbeddedImage(renderer.texture, `${entity.name} texture`)
        renderer.textureAsset = assetReference(asset.uuid)
      }
    }
    const { connections, maximumId: maximumConnectionId } = loadConnections(
      Array.isArray(scene.connections) ? scene.connections : [],
      entities,
      uuidToId
    )

    const parsedLayers = Array.isArray(scene.layers)
      ? scene.layers.map(/* 调用 normalizeIdentifier(layer) 并返回调用结果。 */ layer => normalizeIdentifier(layer))
      : entities.map(/* 返回 entity.layer 的当前值。 */ entity => entity.layer)
    const layers = [...new Set([1, ...parsedLayers, ...entities.map(/* 返回 entity.layer 的当前值。 */ entity => entity.layer)])].sort(/* 计算表达式 a - b 并返回结果，沿用操作数的原有类型规则。 */ (a, b) => a - b)
    const namedLayers = sceneManager.activeScene.settings.namedLayers
    for (const layer of layers) if (!namedLayers.some(/* 比较 candidate.id 与 layer，返回严格相等的判断结果。 */ candidate => candidate.id === layer)) namedLayers.push({ id: layer, name: `Layer ${layer}`, visible: true, locked: false })
    namedLayers.sort(/* 计算表达式 first.id - second.id 并返回结果，沿用操作数的原有类型规则。 */ (first, second) => first.id - second.id)
    for (const entity of entities) {
      const definition = namedLayers.find(/* 比较 layer.id 与 entity.layer，返回严格相等的判断结果。 */ layer => layer.id === entity.layer)
      if (definition && (!entity.namedLayer || /^Layer \d+$/.test(entity.namedLayer))) entity.namedLayer = definition.name
    }

    physicsState.world.invalidateRuntime()
    physicsState.world.entities.splice(0, physicsState.world.entities.length, ...entities)
    physicsState.world.connections.splice(0, physicsState.world.connections.length, ...connections)
    if (!preserveRuntimeSession) {
      physicsState.simulationRunning = false
      physicsState.playMode = 'editing'
      simulationSnapshot = null
    }
    editorState.manualConnectionId = null
    editorState.manualConnectionPoints.splice(0)
    editorState.layers.splice(0, editorState.layers.length, ...layers)
    physicsState.world.setNextId(maximumId + 1)
    physicsState.world.setNextConnectionId(maximumConnectionId + 1)

    loadGlobalSettings(scene)

    const requestedActiveLayer = normalizeIdentifier(scene.activeLayer, layers[0])
    editorState.activeLayer = layers.includes(requestedActiveLayer) ? requestedActiveLayer : layers[0]
    if (scene.renderLayer === 'all') editorState.renderLayer = 'all'
    else {
      const requestedRenderLayer = normalizeIdentifier(scene.renderLayer, layers[0])
      editorState.renderLayer = layers.includes(requestedRenderLayer) ? requestedRenderLayer : 'all'
    }

    cancelEditorDrafts()
    cancelPendingProjectMutations()
    const validSelection = entities.filter(/* 调用 selectedUuids.has(entity.uuid) 并返回调用结果。 */ entity => selectedUuids.has(entity.uuid)).map(/* 返回 entity.id 的当前值。 */ entity => entity.id)
    selectEntities(validSelection, 'replace', entities.find(/* 比较 entity.uuid 与 primaryUuid，返回严格相等的判断结果。 */ entity => entity.uuid === primaryUuid)?.id ?? validSelection.at(-1) ?? null)
    return true
  } catch (error) {
    console.error('Failed to load project', error)
    editorState.statusText = t('loadFailed', { message: error instanceof Error ? error.message : t('unknownError') })
    return false
  }
}

/** 序列化当前场景管理器及项目设置并重新加载，成功后恢复仍有效的有限导航历史。 */ function reloadSceneManagerProject(preserveRuntimeSession = false): boolean {
  const navigationHistory = [...sceneManager.navigationHistory]
  const navigationIndex = sceneManager.navigationIndex
  const source = JSON.stringify({
    projectFormat: NOVA_PROJECT_FORMAT,
    projectFormatMajor: NOVA_PROJECT_FORMAT_MAJOR,
    formatVersion: physicsState.world.projectFormatVersion,
    engineVersion: physicsState.world.projectEngineVersion,
    compatibility: projectCompatibility(),
    projectMetadata: serializeProjectMetadata(),
    manifest: serializeProjectManifest(),
    assets: serializeAssets(),
    assetFolders: serializeAssetFolders(),
    assetDatabase: serializeAssetDatabaseSettings(),
    plugins: serializePluginManifests(),
    packages: serializePackageState(),
    projectSettings: { inputMap: normalizeInputMap(physicsState.inputMap), deviceInput: serializeDeviceInputSettings(), audio: normalizeAudioSettings(physicsState.audioSettings), physics: serializePhysicsProjectSettings(), build: serializeBuildSettings(sceneManager.scenes.map(/* 返回 scene.uuid 的当前值。 */ scene => scene.uuid)), scripting: serializeScriptSettings(), rendering: serializeRenderingSettings(), world: serializeWorldGameplaySettings(), presentation: { localization: serializeLocalizationSettings(), accessibility: serializeRuntimeAccessibilitySettings(), uiAudio: serializeUiAudioSettings() }, production: serializeProductionSettings() },
    activeSceneUuid: sceneManager.activeSceneUuid,
    scenes: sceneManager.serialize()
  })
  const loaded = loadProject(source, preserveRuntimeSession)
  if (loaded) {
    const known = new Set(sceneManager.scenes.map(/* 返回 scene.uuid 的当前值。 */ scene => scene.uuid))
    sceneManager.navigationHistory = navigationHistory.filter(/* 调用 known.has(uuid) 并返回调用结果。 */ uuid => known.has(uuid)).slice(-100)
    if (!sceneManager.navigationHistory.length) sceneManager.navigationHistory = [sceneManager.activeSceneUuid]
    sceneManager.navigationIndex = Math.min(sceneManager.navigationHistory.length - 1, Math.max(0, navigationIndex))
  }
  return loaded
}

/** 结算编辑后捕获当前场景、清空选择和纹理，创建并切换新场景后重建项目世界。 */ export function createScene(name?: string): boolean {
  if (!settlePendingDocumentEdits()) return false
  selectEntities([], 'replace')
  clearRenderTextures()
  sceneManager.captureActive(serializeActiveScene())
  const scene = sceneManager.create(name)
  sceneManager.setActive(scene.uuid)
  return reloadSceneManagerProject()
}

/** 验证目标场景并结算编辑，保存当前场景后切换目标并重新加载世界。 */ export function setActiveScene(uuid: string): boolean {
  if (uuid === sceneManager.activeSceneUuid) return true
  if (!sceneManager.scenes.some(/* 比较 scene.uuid 与 uuid，返回严格相等的判断结果。 */ scene => scene.uuid === uuid) || !settlePendingDocumentEdits()) return false
  selectEntities([], 'replace')
  clearRenderTextures()
  sceneManager.captureActive(serializeActiveScene())
  if (!sceneManager.setActive(uuid)) return false
  return reloadSceneManagerProject()
}

/** Navigate only after the outgoing world's drafts have reached their original scene. */
/** 验证历史导航目标并结算编辑，捕获当前场景后移动历史位置并重建世界。 */ export function navigateScene(offset: -1 | 1): boolean {
  const index = sceneManager.navigationIndex + offset
  const uuid = sceneManager.navigationHistory[index]
  if (!uuid || !sceneManager.scenes.some(/* 比较 scene.uuid 与 uuid，返回严格相等的判断结果。 */ scene => scene.uuid === uuid) || !settlePendingDocumentEdits()) return false
  sceneManager.captureActive(serializeActiveScene())
  if (!sceneManager.navigate(offset)) return false
  selectEntities([], 'replace')
  clearRenderTextures()
  return reloadSceneManagerProject()
}

/** 结算编辑并清空选择和渲染纹理，再从场景管理器重新加载项目。 */ export function reloadActiveScene(): boolean {
  if (!settlePendingDocumentEdits()) return false
  selectEntities([], 'replace')
  clearRenderTextures()
  return reloadSceneManagerProject()
}

/** 验证加载开关和场景身份，结算编辑并捕获场景后更新加载状态、重建世界。 */ export function setSceneLoaded(uuid: string, loaded: boolean): boolean {
  if (typeof loaded !== 'boolean') return false
  if (!sceneManager.scenes.some(/* 比较 scene.uuid 与 uuid，返回严格相等的判断结果。 */ scene => scene.uuid === uuid) || !settlePendingDocumentEdits()) return false
  sceneManager.captureActive(serializeActiveScene())
  if (!sceneManager.setLoaded(uuid, loaded)) return false
  return reloadSceneManagerProject()
}

/** Runtime-only scene switch. Persistent entities retain their UUID and state. */
/** 准备可提交的运行时场景切换，提供实体构造、全局设置与选择图层视图的捕获恢复适配器。 */ export function prepareRuntimeSceneTransition(identifier?: string): PreparedRuntimeSceneTransition {
  return prepareSceneTransition({
    scenes: sceneManager, world: physicsState.world, origin: /** 构造并返回记录 { ...worldGameplayState.originOffset }，字段按当前实参及捕获状态求值。 */ () => ({ ...worldGameplayState.originOffset }),
    createEntity: /* 调用 createEntityFromData(record, id) 并返回调用结果。 */ (record, id) => createEntityFromData(record, id),
    captureView: /** 深复制全局物理设置并保存图层和选择，供场景切换失败时恢复。 */ () => ({ settings: JSON.parse(JSON.stringify(physicsState.globalSettings)) as GlobalPhysicsSettings, layers: [...editorState.layers], activeLayer: editorState.activeLayer, renderLayer: editorState.renderLayer, selection: [...physicsState.selectedEntityIds], selected: physicsState.selectedEntityId }),
    restoreView: /** 恢复场景切换前的全局设置、图层和实体选择。 */ view => { Object.assign(physicsState.globalSettings, view.settings); editorState.layers.splice(0, editorState.layers.length, ...view.layers); editorState.activeLayer = view.activeLayer; editorState.renderLayer = view.renderLayer; physicsState.selectedEntityIds.splice(0, physicsState.selectedEntityIds.length, ...view.selection); physicsState.selectedEntityId = view.selected },
    applyView: /** 根据新场景及实体建立合法图层，加载场景设置并过滤不存在的选择。 */ (scene, entities) => {
      const layers = [...new Set([1, ...(Array.isArray(scene.layers) ? scene.layers.map(/* 调用 normalizeIdentifier(layer) 并返回调用结果。 */ layer => normalizeIdentifier(layer)) : []), ...entities.map(/* 返回 entity.layer 的当前值。 */ entity => entity.layer)])].sort(/* 计算表达式 a - b 并返回结果，沿用操作数的原有类型规则。 */ (a, b) => a - b)
      editorState.layers.splice(0, editorState.layers.length, ...layers)
      loadGlobalSettings(scene)
      const activeLayer = normalizeIdentifier(scene.activeLayer, layers[0]), renderLayer = normalizeIdentifier(scene.renderLayer, layers[0])
      editorState.activeLayer = layers.includes(activeLayer) ? activeLayer : layers[0]
      editorState.renderLayer = scene.renderLayer === 'all' || !layers.includes(renderLayer) ? 'all' : renderLayer
      selectEntities(physicsState.selectedEntityIds.filter(/** 仅保留新场景实体列表中仍存在的选择身份。 */ id => entities.some(/* 比较 entity.id 与 id，返回严格相等的判断结果。 */ entity => entity.id === id)), 'replace', physicsState.selectedEntityId)
    }
  }, identifier)
}

/** 准备并提交指定运行时场景，失败时显示原因并返回 false。 */ export function runtimeLoadScene(identifier: string): boolean {
  try { return prepareRuntimeSceneTransition(identifier).commit() } catch (error) { editorState.statusText = `Runtime scene preparation failed: ${error instanceof Error ? error.message : String(error)}`; return false }
}
/** 准备并提交当前运行时场景的重新加载，失败时更新状态提示。 */ export function runtimeReloadScene(): boolean {
  try { return prepareRuntimeSceneTransition().commit() } catch (error) { editorState.statusText = `Runtime scene preparation failed: ${error instanceof Error ? error.message : String(error)}`; return false }
}

/** 播放前结算文档编辑，并按预览选项检查工作室草稿是否已保存。 */ function settlePlaybackEdits(allowStudioDrafts = false): boolean {
  if (!settlePendingDocumentEdits()) return false
  if (!allowStudioDrafts) {
    try { assertStudioDraftsSaved() } catch (error) {
      editorState.statusText = error instanceof Error ? error.message : String(error)
      notify(editorState.statusText, 'error')
      return false
    }
  }
  return true
}

/** Asset preview owners may retain drafts while previewing an explicitly selected asset. */
/** 首次播放前结算编辑并保存恢复快照，切换运行标记以及播放、暂停或编辑状态。 */ export function toggleSimulation(state: boolean, options: { assetPreview?: boolean } = {}): boolean {
  if (state && physicsState.playMode === 'editing' && !settlePlaybackEdits(options.assetPreview === true)) return false
  if (state && !physicsState.simulationRunning && simulationSnapshot === null) {
    simulationSnapshot = getSceneJSON()
    beginPhysicsMonitorSession()
  }
  physicsState.simulationRunning = state
  physicsState.playMode = state ? 'playing' : simulationSnapshot === null ? 'editing' : 'paused'
  return true
}

/** 停止仿真并恢复编辑模式，存在播放前快照时重新加载该文档。 */ export function resetSimulation(): void {
  const snapshot = simulationSnapshot
  physicsState.simulationRunning = false
  physicsState.playMode = 'editing'
  simulationSnapshot = null
  if (snapshot && loadProject(snapshot)) historyBaseline = getSceneJSON()
}

/** 结算首次步进前编辑并保存恢复快照，在暂停状态执行一个物理步并更新诊断。 */ export function singleStepSimulation(): boolean {
  if (physicsState.playMode === 'editing' && !settlePlaybackEdits()) return false
  physicsState.simulationRunning = false
  if (simulationSnapshot === null) simulationSnapshot = getSceneJSON()
  physicsState.playMode = 'paused'
  Object.assign(physicsState.engineDiagnostics, physicsState.world.singleStep(physicsState.globalSettings))
  return true
}

/** 执行时调用 resetSimulation()；不显式返回调用结果。 */ export function stopPlayMode(): void {
  resetSimulation()
}

/** Read-only profiling identity remains stable while the runtime projection moves. */
export function getPerformanceAuthoringSource(): string { return simulationSnapshot ?? getSceneJSON() }

/* 比较 simulationSnapshot 与 null，返回严格不等的判断结果。 */ export function hasRuntimeSession(): boolean {
  return simulationSnapshot !== null
}

type BrowserProjectFileHandle = { createWritable: () => Promise<{ write: (value: string) => Promise<void>; close: () => Promise<void>; abort?: () => Promise<void> }> }
let browserSaveHandle: { sessionId: string; handle: BrowserProjectFileHandle } | null = null
/** 结算编辑并检查只读状态，选择原生事务、浏览器文件或下载保存通道，成功后更新手动保存与外部变更基线。 */ export async function saveProject(): Promise<boolean> {
  if (!settlePendingDocumentEdits()) return false
  assertStudioDraftsSaved()
  const jsonString = stableProjectText(getSceneJSON())
  if (recoveryState.readOnly) throw new Error('This project is open read-only. Use Open as copy or choose a new writable project folder.')
  const nativeSink = await createNativeProjectTransactionSink()
  if (nativeSink) {
    await commitProjectTransaction(jsonString, { label: 'Save project', scopes: [...projectTransactionState.unsavedScopes], sink: nativeSink })
  } else if ('showSaveFilePicker' in window) {
    const saveState: { staged: { write: (value: string) => Promise<void>; close: () => Promise<void>; abort?: () => Promise<void> } | null } = { staged: null }
    try {
      // The browser hands out a file handle once; later saves of the same session write to it directly instead of asking again.
      const remembered = browserSaveHandle?.sessionId === projectSessionState.id ? browserSaveHandle.handle : null
      const handle = remembered ?? await (window as unknown as { showSaveFilePicker: (options: unknown) => Promise<BrowserProjectFileHandle> }).showSaveFilePicker({ suggestedName: 'project.nova', types: [{ description: 'Nova_A Project', accept: { 'application/json': ['.nova', '.json'] } }] })
      browserSaveHandle = { sessionId: projectSessionState.id, handle }
      await commitProjectTransaction(jsonString, { label: 'Save project', scopes: [...projectTransactionState.unsavedScopes], sink: {
        kind: 'browser-file', writable: true, destination: 'project.nova',
        /** 从保存事务提取项目文本，写入浏览器文件并关闭句柄，成功后清空暂存引用。 */ async write(files) {
          const project = files.find(/* 比较 file.path 与 'project.nova'，返回严格相等的判断结果。 */ file => file.path === 'project.nova'); if (!project) throw new Error('The project transaction did not contain project.nova.')
          saveState.staged = await handle.createWritable(); await saveState.staged.write(project.contents); await saveState.staged.close(); saveState.staged = null
        }
      } })
    } catch (error) {
      if (saveState.staged?.abort) try { await saveState.staged.abort() } catch { /* Preserve the original transaction error. */ }
      // A revoked or stale handle must not block saving: forget it so the next save asks for a destination again.
      if (error instanceof DOMException && error.name !== 'AbortError') browserSaveHandle = null
      if (error instanceof DOMException && error.name === 'AbortError') return false
      throw error
    }
  } else {
    await commitProjectTransaction(jsonString, { label: 'Save project', scopes: [...projectTransactionState.unsavedScopes], sink: {
      kind: 'download', writable: true, destination: 'project.nova',
      /** 从保存事务提取项目文本，创建临时地址触发文件下载，随后释放地址。 */ async write(files) {
        const project = files.find(/* 比较 file.path 与 'project.nova'，返回严格相等的判断结果。 */ file => file.path === 'project.nova'); if (!project) throw new Error('The project transaction did not contain project.nova.')
        const url = URL.createObjectURL(new Blob([project.contents], { type: 'application/json' })), anchor = document.createElement('a')
        anchor.href = url; anchor.download = 'project.nova'; anchor.click(); window.setTimeout(/* 调用 URL.revokeObjectURL(url) 并返回调用结果。 */ () => URL.revokeObjectURL(url), 0)
      }
    } })
  }
  const { suppressSelfProjectChange } = await import('../runtime/projectExternalChanges')
  suppressSelfProjectChange(jsonString)
  markSourceBaseline(jsonString)
  recordManualSave()
  sceneManager.markSaved()
  syncHistoryState()
  return true
}

/** 停止仿真并清空实体连接，失效运行时、清空选择并重置数字身份计数。 */ export function clearScene(): void {
  physicsState.simulationRunning = false
  physicsState.playMode = 'editing'
  simulationSnapshot = null
  physicsState.world.entities.splice(0, physicsState.world.entities.length)
  physicsState.world.connections.splice(0, physicsState.world.connections.length)
  physicsState.world.invalidateRuntime()
  enterEditMode(null)
  physicsState.world.resetId()
  physicsState.world.resetConnectionId()
}

/** 删除全部选择子树并先清除关联连接，恢复编辑选择状态，空世界重置身份计数。 */ export function deleteSelected(): void {
  const ids = new Set(subtreeEntities(physicsState.selectedEntityIds, physicsState.world.entities).map(/* 返回 entity.id 的当前值。 */ entity => entity.id))
  if (!ids.size) return
  for (const id of ids) detachEntityFromConnections(id)
  for (let index = physicsState.world.entities.length - 1; index >= 0; index--) {
    if (ids.has(physicsState.world.entities[index].id)) physicsState.world.entities.splice(index, 1)
  }
  enterEditMode(null)
  if (physicsState.world.entities.length === 0) {
    physicsState.world.resetId()
    physicsState.world.resetConnectionId()
  }
}

/** 删除指定实体及其子树和关联连接，再过滤已删除对象的选择。 */ export function deleteEntity(id: number): void {
  const ids = deleteEntitySubtreeInWorld(physicsState.world, id)
  if (!ids.size) return
  const selection = physicsState.selectedEntityIds.filter(/* 返回 ids.has(entityId) 的逻辑取反结果。 */ entityId => !ids.has(entityId))
  selectEntities(selection, 'replace')
}

/** 恢复编辑摄像机缩放和目标状态，将原点偏移设置到首个画布中心。 */ export function resetCamera(): void {
  physicsState.camera.scale = 40
  physicsState.camera.targetScale = null
  physicsState.camera.targetOffset = null
  const canvas = document.querySelector('canvas')
  physicsState.camera.offset = canvas
    ? { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }
    : { x: 0, y: 0 }
}

/** 将指定实体移至绘制列表末尾，缺失时保持原状态。 */ export function moveToFront(id: number): void {
  const index = physicsState.world.entities.findIndex(/* 比较 entity.id 与 id，返回严格相等的判断结果。 */ entity => entity.id === id)
  if (index === -1) return
  const [entity] = physicsState.world.entities.splice(index, 1)
  physicsState.world.entities.push(entity)
}

/** 将指定实体移至绘制列表开头，缺失时保持原状态。 */ export function moveToBack(id: number): void {
  const index = physicsState.world.entities.findIndex(/* 比较 entity.id 与 id，返回严格相等的判断结果。 */ entity => entity.id === id)
  if (index === -1) return
  const [entity] = physicsState.world.entities.splice(index, 1)
  physicsState.world.entities.unshift(entity)
}

/** 捕获实体子树包并按默认偏移实例化，返回首个克隆或 null。 */ export function duplicateEntity(id: number): Entity | null {
  const clipboard = captureEntityBundle([id])
  if (!clipboard) return null
  const clone = instantiateEntityBundle(clipboard, { x: 10, y: -10 }).entities[0] ?? null
  return clone
}

const commandHistory = new CommandHistory(500, 64 * 1024 * 1024)
let historyBaseline: string | null = null
let applyingHistory = false
let activeHistoryTransactions: Array<{ label: string; mergeKey: string | null; affectedResource: string; before: string }> = []
export const historyState = reactive({
  length: 0,
  index: -1,
  canUndo: false,
  canRedo: false,
  undoLabel: null as string | null,
  redoLabel: null as string | null,
  entries: [] as Array<{ id: string; label: string; timestamp: string; affectedResource: string; scope: string; byteSize: number; applied: boolean }>,
  memoryBytes: 0,
  memoryBudgetBytes: commandHistory.memoryBudgetBytes,
  lastClearReason: commandHistory.lastClearReason,
  dirty: false
})

const AUTOSAVE_KEY = 'nova_a.autosave.v2'
let autosaveTimer: number | null = null

/** 安全读取本地自动保存文本，存储不可用或失败返回 null。 */ function readAutosave(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(AUTOSAVE_KEY)
  } catch {
    return null
  }
}

export const autosaveState = reactive({ available: readAutosave() !== null })

/** 启用自动保存时重置防抖计时，在配置间隔后保存当前项目和恢复快照。 */ function scheduleAutosave(): void {
  if (!preferencesState.autosave || typeof window === 'undefined') return
  if (autosaveTimer !== null) window.clearTimeout(autosaveTimer)
  autosaveTimer = window.setTimeout(/** 保存当前项目至本地及恢复快照，写入失败只记录警告，最后释放计时句柄。 */ () => {
    try {
      const source = getSceneJSON()
      localStorage.setItem(AUTOSAVE_KEY, source)
      storeRecoverySnapshot(source, 'autosave')
      autosaveState.available = true
    } catch (error) {
      console.warn('Nova_A could not write the local autosave.', error)
    }
    autosaveTimer = null
  }, preferencesState.autosaveInterval * 1000)
}

/** 更新自动保存可用状态，有内容时通过正常项目加载入口恢复。 */ export function restoreAutosave(): boolean {
  const value = readAutosave()
  autosaveState.available = value !== null
  return value ? loadProject(value) : false
}

/* 返回 autosaveState.available 的当前值。 */ export function hasAutosave(): boolean {
  return autosaveState.available
}

/** 同步撤销栈状态和内存用量，结合未保存作用域及手动基线摘要更新脏标记。 */ function syncHistoryState(): void {
  historyState.length = commandHistory.length
  historyState.index = commandHistory.index
  historyState.canUndo = commandHistory.canUndo
  historyState.canRedo = commandHistory.canRedo
  historyState.undoLabel = commandHistory.undoLabel
  historyState.redoLabel = commandHistory.redoLabel
  historyState.entries.splice(0, historyState.entries.length, ...commandHistory.entries)
  historyState.memoryBytes = commandHistory.memoryBytes
  historyState.lastClearReason = commandHistory.lastClearReason
  try { historyState.dirty = projectTransactionState.unsavedScopes.length > 0 || Boolean(projectTransactionState.lastManualChecksum) && projectChecksum(getSceneJSON()) !== projectTransactionState.lastManualChecksum } catch { historyState.dirty = projectTransactionState.unsavedScopes.length > 0 }
  if (!historyState.dirty) projectTransactionState.unsavedScopes.splice(0)
}

/** Keep non-command editor navigation from becoming the implicit undo target. */
/** 仅在普通编辑状态更新历史文档基线，避免历史恢复期间覆盖基线。 */ export function synchronizeHistoryBaseline(): void {
  if (physicsState.playMode !== 'editing' || applyingHistory) return
  historyBaseline = getSceneJSON()
  syncHistoryState()
}

/** 取消未提交草稿后恢复历史文档，保留场景外部状态及仍有效导航，并用重入标记保护恢复过程。 */ function applyHistoryDocument(document: string): void {
  const externalStates = new Map(sceneManager.scenes.map(/* 返回按声明顺序构造的数组 [scene.uuid, {externalState: scene.externalState, validationState: scene.validationState}]。 */ scene => [scene.uuid, {externalState: scene.externalState, validationState: scene.validationState}]))
  const navigation = [...sceneManager.navigationHistory], navigationIndex = sceneManager.navigationIndex
  cancelEditorDrafts()
  cancelPendingProjectMutations()
  applyingHistory = true
  try {
    if (!loadProject(document)) throw new Error('History document could not be restored.')
    for (const scene of sceneManager.scenes) {
      const external = externalStates.get(scene.uuid)
      if (external) Object.assign(scene, external)
    }
    sceneManager.navigationHistory = navigation.filter(/** 只保留历史恢复后仍存在场景的导航身份。 */ uuid => sceneManager.scenes.some(/* 比较 scene.uuid 与 uuid，返回严格相等的判断结果。 */ scene => scene.uuid === uuid))
    if (!sceneManager.navigationHistory.length) sceneManager.navigationHistory = [sceneManager.activeSceneUuid]
    sceneManager.navigationIndex = Math.min(navigationIndex, sceneManager.navigationHistory.length - 1)
    historyBaseline = getSceneJSON()
  } finally {
    applyingHistory = false
  }
}

/** 依据操作标签关键词推断修改作用域，用于脏状态和资源历史分类。 */ function commandScope(label: string): ProjectMutationScope {
  const value = label.toLowerCase()
  if (/asset|import|prefab|folder|sprite|texture|material|shader/.test(value)) return 'asset'
  if (/script|code|rhai/.test(value)) return 'script'
  if (/animat|keyframe|timeline|controller/.test(value)) return 'animation'
  if (/ui|canvas|layout|widget|presentation|localization/.test(value)) return 'ui'
  if (/package|plugin/.test(value)) return 'packages'
  if (/build|preset|export/.test(value)) return 'build'
  if (/setting|physics layer|input|audio|render/.test(value)) return 'settings'
  return 'scene'
}

/** 保留播放时明确执行的资源重导入，只更新恢复快照中的资源域，绝不提交仿真实体状态。 */ export function pushAssetReimportHistory(label = 'Reimport asset', mergeKey: string | null = null): void {
  if (physicsState.playMode === 'editing') { pushHistory(label, mergeKey); return }
  if (applyingHistory || !simulationSnapshot) return
  const before = simulationSnapshot, authored = JSON.parse(before)
  const assets = serializeAssets(), assetFolders = serializeAssetFolders(), assetDatabase = serializeAssetDatabaseSettings()
  if (JSON.stringify(authored.assets) === JSON.stringify(assets) && JSON.stringify(authored.assetFolders) === JSON.stringify(assetFolders) && JSON.stringify(authored.assetDatabase) === JSON.stringify(assetDatabase)) return
  Object.assign(authored, { assets, assetFolders, assetDatabase })
  const after = JSON.stringify(authored)
  commandHistory.commit(new DocumentMutationCommand({ label, before, after, apply: applyHistoryDocument, mergeKey, affectedResource: 'project.nova:assets', scope: 'asset' }), true)
  simulationSnapshot = after
  historyBaseline = after
  markProjectDirty('asset'); sceneManager.markDirty(); syncHistoryState()
}

/** 在编辑模式比较序列化文档基线，提交实际变化或更新活动事务，标记脏状态并安排自动保存。 */ export function pushHistory(label = 'Edit scene', mergeKey: string | null = null, affectedResource = 'project.nova'): void {
  if (physicsState.playMode !== 'editing' || applyingHistory) return
  const stateString = getSceneJSON()
  if (activeHistoryTransactions.length) { historyBaseline = stateString; scheduleAutosave(); return }
  if (historyBaseline === null) {
    historyBaseline = stateString
    syncHistoryState()
    scheduleAutosave()
    return
  }
  if (historyBaseline === stateString) return
  const scope = commandScope(label)
  commandHistory.commit(new DocumentMutationCommand({
    label,
    before: historyBaseline,
    after: stateString,
    apply: applyHistoryDocument,
    mergeKey,
    affectedResource,
    scope
  }), true)
  markProjectDirty(scope)
  if (scope === 'scene' || scope === 'asset') sceneManager.markDirty()
  historyBaseline = stateString
  syncHistoryState()
  scheduleAutosave()
  window.setTimeout(/* 调用 refreshSourceStatus(getSceneJSON()) 并返回调用结果。 */ () => refreshSourceStatus(getSceneJSON()), 0)
}

/** Settle valid drafts and implicit edits before a document/history boundary. */
/** 提交有效控件草稿和待处理修改，记录文档差异并关闭活动事务，非法草稿返回 false。 */ export function settlePendingDocumentEdits(): boolean {
  if (applyingHistory || physicsState.playMode !== 'editing') return true
  if (!settleEditorDrafts()) return false
  flushPendingProjectMutations()
  cancelPendingProjectMutations()
  pushHistory('Commit pending property edits')
  while (activeHistoryTransactions.length) commitHistoryTransaction()
  return true
}

/** Groups any number of document mutations into one named, reversible command. */
/** 仅在编辑且非历史恢复状态开启事务，最外层先结算待处理编辑，再保存事务前文档。 */ export function beginHistoryTransaction(label: string, mergeKey: string | null = null, affectedResource = mergeKey ?? 'project.nova'): boolean {
  if (physicsState.playMode !== 'editing' || applyingHistory) return false
  if (!activeHistoryTransactions.length && !settlePendingDocumentEdits()) return false
  const before = getSceneJSON(); if (historyBaseline === null) historyBaseline = before
  activeHistoryTransactions.push({ label: label.trim().slice(0, 160) || 'Edit scene', mergeKey, affectedResource, before })
  return true
}

/** 先序列化验证当前文档再出栈，嵌套事务只更新基线，最外层提交单个历史命令和脏状态。 */ export function commitHistoryTransaction(): boolean {
  const transaction = activeHistoryTransactions[activeHistoryTransactions.length - 1]; if (!transaction) return false
  // Serialization can reject a malformed draft; retain the transaction for correction/cancel.
  const after = getSceneJSON()
  activeHistoryTransactions.pop()
  historyBaseline = after
  if (activeHistoryTransactions.length) { scheduleAutosave(); return true }
  if (after === transaction.before) { syncHistoryState(); return false }
  const scope = commandScope(transaction.label)
  commandHistory.commit(new DocumentMutationCommand({ label: transaction.label, before: transaction.before, after, apply: applyHistoryDocument, mergeKey: transaction.mergeKey, scope, affectedResource: transaction.affectedResource }), true)
  markProjectDirty(scope)
  if (scope === 'scene' || scope === 'asset') sceneManager.markDirty()
  syncHistoryState(); scheduleAutosave(); window.setTimeout(/* 调用 refreshSourceStatus(getSceneJSON()) 并返回调用结果。 */ () => refreshSourceStatus(getSceneJSON()), 0); return true
}

/** 先恢复最内层事务前文档，成功后移除事务并同步历史状态。 */ export function cancelHistoryTransaction(): boolean {
  const transaction = activeHistoryTransactions[activeHistoryTransactions.length - 1]; if (!transaction) return false
  applyHistoryDocument(transaction.before); activeHistoryTransactions.pop(); syncHistoryState(); return true
}

/** 清空命令和活动事务并更新文档基线，按需建立手动保存基线。 */ export function clearEditorHistory(reason = 'project-open', source = getSceneJSON(), establishManualBaseline = true): void {
  commandHistory.clear(reason); activeHistoryTransactions = []; historyBaseline = source; if (establishManualBaseline) markTransactionBaseline(source); syncHistoryState()
}

/** 先结算待处理编辑，再撤销一条命令并刷新历史、状态提示及源码状态。 */ export function undo(): void {
  if (!settlePendingDocumentEdits()) return
  if (!commandHistory.undo()) return
  syncHistoryState()
  editorState.statusText = t('undoSuccess')
  window.setTimeout(/* 调用 refreshSourceStatus(getSceneJSON()) 并返回调用结果。 */ () => refreshSourceStatus(getSceneJSON()), 0)
}

/** 先结算待处理编辑，再重做一条命令并刷新历史、状态提示及源码状态。 */ export function redo(): void {
  if (!settlePendingDocumentEdits()) return
  if (!commandHistory.redo()) return
  syncHistoryState()
  editorState.statusText = t('redoSuccess')
  window.setTimeout(/* 调用 refreshSourceStatus(getSceneJSON()) 并返回调用结果。 */ () => refreshSourceStatus(getSceneJSON()), 0)
}

setProjectMutationRecorder(/** 仅在编辑状态把项目修改通知转换为带合并键和资源定位的历史记录。 */ (label, mergeKey, resource) => {
  if (physicsState.playMode === 'editing') pushHistory(label, mergeKey, resource)
})
