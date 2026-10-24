/** 编辑器共享状态：管理日志、选择辅助、图层、上下文菜单及界面配置。 */
import { reactive } from "vue"
import { cloneEntity, deleteEntity, duplicateConnections, physicsState, pushHistory, sceneManager } from "./physics"
import type { Vec2 } from '../world/types'
import { t } from '../i18n'
import type { PivotMode, TransformSpace } from '../editor/gizmo'
import { scriptProjectSettings } from '../runtime/scriptSettings'

export type EditorPage = 'scene' | 'game' | 'script' | 'settings' | 'manage'
export type EditorWorkspace = 'design' | 'script' | 'animation' | 'ui' | 'debug' | 'manage' | 'custom'
export type BottomPanelTab = 'assets' | 'packages' | 'console' | 'animation' | 'audio' | 'worldProduction' | 'networkStudio' | 'ecosystem' | 'tilemap' | 'chart' | 'presentation' | 'profiler' | 'rendering' | 'project' | 'build'
/** 26.46: the chart open in the chart editor (asset reference, and the RhythmChart2D that opened it). */
export interface ChartEditorTarget { chartAsset: string; entityUuid: string; componentUuid: string; revision: number }
export type ManageSection = 'learn' | 'settings' | 'automation' | 'packages' | 'project' | 'rendering' | 'build'
export type InspectorCategory = 'all' | 'general' | 'transform' | 'render' | 'physics' | 'gameplay' | 'ui'
type ContextMenuType = 'sidebar-entity' | 'layer' | 'grid-entity' | 'none'
export type EditorLogLevel = 'trace' | 'debug' | 'info' | 'warning' | 'error' | 'fatal'
import type { EditorLogCategory } from '../contracts/applicationLog'
export type { EditorLogCategory } from '../contracts/applicationLog'

export interface EditorLogEntry {
  id: number
  timestamp: string
  level: EditorLogLevel
  category: EditorLogCategory
  message: string
  source?: string
}

export const editorState = reactive({
  currentPage: "scene" as EditorPage,
  statusText: t('ready'),
  layoutVersion: 0,
  showGrid: true,
  showXAxis: true, // NEW
  showYAxis: true, // NEW
  layers: [1], 
  activeLayer: 1, 
  renderLayer: 'all' as number | 'all',
  transformSpace: 'world' as TransformSpace,
  pivotMode: 'center' as PivotMode,
  angleSnapEnabled: true,
  angleSnapDegrees: 15,
  activeWorkspace: 'design' as EditorWorkspace,
  manageSection: 'settings' as ManageSection,
  hierarchyVisible: true,
  inspectorVisible: true,
  bottomPanelVisible: true,
  distractionFree: false,
  commandPaletteOpen: false,
  commandPaletteMode: 'commands' as 'commands' | 'quick' | 'global' | 'context',
  workspaceManagerOpen: false,
  shortcutEditorOpen: false,
  undoHistoryOpen: false,
  statusCenterOpen: false,
  hierarchyWidth: 264,
  inspectorWidth: 320,
  hierarchyDock: 'left' as 'left' | 'right',
  inspectorDock: 'right' as 'left' | 'right',
  inspectorSearch: '',
  settingsSearch: '',
  settingsScope: 'all' as 'all' | 'editor' | 'project' | 'runtime',
  inspectorCategory: 'all' as InspectorCategory,
  inspectorModifiedOnly: false,
  inspectorPinnedOnly: false,
  pinnedInspectorProperties: [] as string[],
  componentPickerOpen: false,
  createObjectPaletteOpen: false,
  lastCanvasWorldPoint: { x: 0, y: 0 } as Vec2,
  bottomPanelOpen: false,
  bottomPanelHeight: 280,
  bottomPanelTab: 'assets' as BottomPanelTab,
  chartEditor: null as ChartEditorTarget | null,
  bottomPanelPinned: true,
  physicsMonitorOpen: false,
  renameRequestId: null as number | null,
  logs: [] as EditorLogEntry[],
  rendererStats: {
    backend: 'Canvas2D' as 'WebGL2' | 'Canvas2D',
    drawCalls: 0,
    batches: 0,
    triangles: 0,
    sprites: 0,
    shapes: 0,
    text: 0,
    textures: 0,
    gpuMs: null as number | null,
    passes: 1,
    renderTargets: 0,
    overdraw: 0,
    batchBreaks: 0,
    atlasPages: 0,
    textureMemoryBytes: 0,
    textureUploads: 0,
    textureEvictions: 0,
    textureBudgetBytes: 0,
    textureBudgetExceeded: false,
    streamingMisses: 0,
    shaderCompiles: 0,
    shaderFallbacks: 0,
    contextLosses: 0,
    batchBreakReasons: {}
  },
  manualConnectionId: null as number | null,
  manualConnectionPoints: [] as Vec2[],
  
  contextMenu: {
    visible: false,
    x: 0, y: 0,
    type: 'none' as ContextMenuType,
    targetId: null as number | null
  }
})

let nextLogId = 1
/** 追加带时间、级别和来源的日志，并按脚本项目配置限制最多保留数量。 */ export function addEditorLog(message: string, category: EditorLogCategory = 'Editor', level: EditorLogLevel = 'info', source?: string): void {
  editorState.logs.push({ id: nextLogId++, timestamp: new Date().toLocaleTimeString(), level, category, message, source })
  const limit = Math.min(10_000, Math.max(100, scriptProjectSettings.maxConsoleEntries))
  if (editorState.logs.length > limit) editorState.logs.splice(0, editorState.logs.length - limit)
}

/** 执行 editorState.layoutVersion++ 更新对应状态；不显式返回值。 */ export function reconfigureLayout() { editorState.layoutVersion++ }

/** 分配新的安全整数层标识，登记可见命名层并切换活动层，再记录历史。 */ export function addLayer() {
  const newLayer = Math.max(...editorState.layers, 0) + 1
  if (!Number.isSafeInteger(newLayer)) {
    editorState.statusText = t('layerIdExhausted')
    return
  }
  editorState.layers.push(newLayer)
  sceneManager.activeScene.settings.namedLayers.push({ id: newLayer, name: `Layer ${newLayer}`, visible: true, locked: false })
  editorState.activeLayer = newLayer
  editorState.statusText = t('createdLayer', { layer: newLayer })
  pushHistory()
}

/** 切换当前编辑层并显示本地化状态。 */ export function setActiveLayer(layer: number) {
  editorState.activeLayer = layer
  editorState.statusText = t('switchedLayer', { layer })
}

/** 设置全部或指定渲染层过滤并更新状态说明。 */ export function setRenderLayer(layer: number | 'all') {
  editorState.renderLayer = layer
  editorState.statusText = layer === 'all' ? t('renderAllLayers') : t('renderLayer', { layer })
}

/** 阻止浏览器默认菜单，在指针位置打开指定类别和目标的编辑器菜单。 */ export function openContextMenu(e: MouseEvent, type: ContextMenuType, targetId: number | null = null) {
  e.preventDefault()
  editorState.contextMenu.visible = true
  editorState.contextMenu.x = e.clientX
  editorState.contextMenu.y = e.clientY
  editorState.contextMenu.type = type
  editorState.contextMenu.targetId = targetId
}

/** 将 false 赋给 editorState.contextMenu.visible，不显式返回值。 */ export function closeContextMenu() {
  editorState.contextMenu.visible = false
}

/** 保留至少一层，删除指定层及其实体，修正活动渲染层后记录历史。 */ export function deleteLayer(layerId: number) {
  if (editorState.layers.length <= 1) return 
  const layerIndex = editorState.layers.indexOf(layerId)
  if (layerIndex === -1) return
  editorState.layers.splice(layerIndex, 1)
  sceneManager.activeScene.settings.namedLayers = sceneManager.activeScene.settings.namedLayers.filter(/* 比较 layer.id 与 layerId，返回严格不等的判断结果。 */ layer => layer.id !== layerId)
  if (editorState.activeLayer === layerId) editorState.activeLayer = editorState.layers[0]
  if (editorState.renderLayer === layerId) editorState.renderLayer = 'all'
  const ids = physicsState.world.entities.filter(/* 比较 entity.layer 与 layerId，返回严格相等的判断结果。 */ entity => entity.layer === layerId).map(/* 返回 entity.id 的当前值。 */ entity => entity.id)
  ids.forEach(deleteEntity)
  editorState.statusText = t('deletedLayer', { layer: layerId })
  pushHistory()
}

/** 复制层及实体，重映射内部父级和连接，选择新层并记录历史。 */ export function duplicateLayer(layerId: number) {
  const newLayerId = Math.max(...editorState.layers, 0) + 1
  if (!Number.isSafeInteger(newLayerId)) {
    editorState.statusText = t('duplicateLayerIdExhausted')
    return
  }
  editorState.layers.push(newLayerId)
  const sourceLayer = sceneManager.activeScene.settings.namedLayers.find(/* 比较 layer.id 与 layerId，返回严格相等的判断结果。 */ layer => layer.id === layerId)
  sceneManager.activeScene.settings.namedLayers.push({ id: newLayerId, name: `${sourceLayer?.name ?? `Layer ${layerId}`} copy`, visible: sourceLayer?.visible !== false, locked: false })
  const toClone = physicsState.world.entities.filter(/* 比较 e.layer 与 layerId，返回严格相等的判断结果。 */ e => e.layer === layerId)
  const entityIdMap = new Map<number, number>()
  const entityUuidMap = new Map<string, string>()
  toClone.forEach(/** 克隆层内实体并记录旧新数字身份及 UUID 映射。 */ original => {
    const clone = cloneEntity(original, newLayerId)
    entityIdMap.set(original.id, clone.id)
    entityUuidMap.set(original.uuid, clone.uuid)
    physicsState.world.entities.push(clone)
  })
  toClone.forEach(/** 为克隆实体恢复同一复制层内部的父级关系，避免指向原层对象。 */ original => {
    const clone = physicsState.world.entities.find(/* 比较 entity.id 与 entityIdMap.get(original.id)，返回严格相等的判断结果。 */ entity => entity.id === entityIdMap.get(original.id))
    if (clone && original.parentUuid && entityUuidMap.has(original.parentUuid)) clone.parentUuid = entityUuidMap.get(original.parentUuid)!
  })
  duplicateConnections(entityIdMap)
  editorState.activeLayer = newLayerId
  editorState.statusText = t('duplicatedLayer', { source: layerId, target: newLayerId })
  pushHistory()
}

/** 保持层内实体相对顺序，将其整体移至世界绘制列表前端或后端并记录历史。 */ function moveLayer(layerId: number, destination: 'front' | 'back') {
  const layerEntities = physicsState.world.entities.filter(/* 比较 entity.layer 与 layerId，返回严格相等的判断结果。 */ entity => entity.layer === layerId)
  for (let index = physicsState.world.entities.length - 1; index >= 0; index--) {
    if (physicsState.world.entities[index].layer === layerId) physicsState.world.entities.splice(index, 1)
  }
  if (destination === 'front') physicsState.world.entities.push(...layerEntities)
  else physicsState.world.entities.unshift(...layerEntities)
  editorState.statusText = t(destination === 'front' ? 'movedLayerFront' : 'movedLayerBack', { layer: layerId })
  pushHistory()
}

/** 执行时调用 moveLayer(layerId, 'front')；不显式返回调用结果。 */ export function moveLayerToFront(layerId: number) {
  moveLayer(layerId, 'front')
}

/** 执行时调用 moveLayer(layerId, 'back')；不显式返回调用结果。 */ export function moveLayerToBack(layerId: number) {
  moveLayer(layerId, 'back')
}
