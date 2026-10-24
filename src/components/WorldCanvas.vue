<!-- 场景与游戏画布：持有渲染器、输入和单一帧循环，页面切换保留实例，项目退出释放资源。 -->
<script setup lang="ts">
import { installEditorTouch } from '../runtime/editorTouch'
import { boundedFrame } from '../renderer/surfaceLimits'
import { ref, shallowRef, triggerRef, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { physicsState, pushHistory, selectEntities, sceneManager } from '../store/physics'
import { getProjectSessionGeneration } from '../projects/projectSession'
import { BoxEntity } from '../world/BoxEntity'
import { CircleEntity } from '../world/CircleEntity'
import { TriangleEntity } from '../world/TriangleEntity'
import type { Entity } from '../world/Entity'
import type { Vec2 } from '../world/types'
import { addEditorLog, editorState, openContextMenu } from '../store/editor'
import { isValidConvexPolygon, MIN_SIZE, normalizeEntity, syncMassFromDensity } from '../world/geometry'
import { preferencesState as prefs, editorPerformancePreferences } from '../store/preferences'
import { boundCompoundEntityIds, connectionGeometrySignature, connectionSharesLayer, entityBoundaryPoints, repatchConnection, resolveAnchor, routePoints, setManualRoute } from '../world/Connection'
import { t } from '../i18n'
import { defaultColorForLayer } from '../world/layers'
import { compoundGeometries } from '../world/compoundGeometry'
import { localPointToWorld, prepareHierarchyIndex, worldPointToLocal, worldTransform } from '../world/hierarchy'
import { applyRotation, applyScale, applyTranslation, axisVector, captureTransforms, gizmoPivot, gizmoRotation, projectedDelta, restoreTransforms, type GizmoAxis, type TransformSnapshot } from '../editor/gizmo'
import { createRenderer2D, createRendererRecoveryOwner, editorSceneRendererEnvironment, editorLightingEnvironment, RendererCanvasReplacementRequired, type Renderer2D } from '../editor/rendererAdapter'
import { createEditorParticleOwner } from '../editor/particleAdapter'
import { createRenderer2D as createRuntimeRenderer2D } from '../renderer/core'
import { editorRendererEnvironment } from '../editor/rendererAdapter'
import type { RuntimeWorldView, RuntimeWorldSurface } from '../runtime/runtimeWorldHostContracts'
import { reportRendererReset } from '../renderer/capabilities'
import { renderWorld } from '../renderer/sceneRenderer'
import { assetReference, resolveAsset } from '../assets/AssetDatabase'
import { type RectTransform, type TextInput, type TileMap2D } from '../world/components'
import { gameplayRuntime as editorGameplayRuntime } from '../editor/gameplayRuntime'
import type { GameplayRuntime } from '../runtime/GameplayRuntimeCore'
import { GameUiRuntime, gameUiRuntime as editorGameUiRuntime, type UiAccessibilityNode } from '../runtime/gameUi'
import { rebindInputAction } from '../runtime/input'
import { instantiatePrefab } from '../runtime/prefabs'
import {getEditorTileMapOwner} from '../editor/tileMapAdapter'
import { beginTileStroke, continueTileStroke, endTileStroke, tilemapEditorState, worldToTile, type TileStroke } from '../runtime/tilemap'
import { profilerState, recordFrameProfile } from '../runtime/profiler'
import { samplePerformanceTools } from '../runtime/performanceTools'
import { reportFatalError, reportRecoverableError } from '../runtime/faultCenter'
import { physicsDebugState } from '../runtime/physicsDebug'
import { renderDebugView2D, renderLighting2D, renderPostProcessOverlay, renderScreenFlash, worldPostProcessFilter } from '../renderer/lighting2d'
import { beginRenderGraph, captureRenderSurface, completeRenderGraph, createRenderGraphDiagnosticsOwner, recordRenderPass, renderGraphState, type RenderGraphDiagnosticsScope } from '../renderer/renderGraph'
import { captureRenderTexture } from '../renderer/renderTextures'
import { activeGameCameras, resetCameraSmoothing } from '../renderer/sceneRenderer'
import { activeRenderQuality, renderingSettings } from '../renderer/renderSettings'
import { drawPhysicsDebug as drawSharedPhysicsDebug } from '../renderer/physicsDebugDraw'
import { recordEntityProperties } from '../editor/animationStudioState'
import { captureVertexBaseline, restoreVertexBaseline, type VertexBaseline } from '../editor/vertexDrag'
import { navigationPaths, worldGameplayState } from '../runtime/worldGameplay'
import { aiDebugState } from '../runtime/aiTools'
import { worldStreamingState } from '../runtime/worldStreaming'
import { authoringState, createAuthoringObject } from '../editor/authoring2d'
import VirtualControlsOverlay from './VirtualControlsOverlay.vue'
import { beginPerformanceFrame, completePerformanceFrame, currentPerformanceFrameObservation, forgetPerformanceInput, markPerformanceInput, markPerformanceSubmission, performanceRuntimeState, rebasePerformanceFrameContinuity } from '../runtime/largeWorldPerformance'
import { InputReceiptTokenMap } from '../runtime/performance/observability'
import { PHYSICS_UNITS } from '../runtime/physicsProduction'
import { normalizeSimulationFrameDelta } from '../runtime/engineTiming'
import { UiNativeInputBridge, isExternalUiControl } from '../runtime/uiNativeInput'

import { setInputModality } from '../runtime/inputModality'
import { latencyProbe } from '../runtime/latencyProbe'
import { resetRuntimePresentation, syncRuntimePresentation } from '../editor/runtimePresentationSync'
import { activeTextDirection } from '../runtime/localization'

// Runtime identity is fixed for this Canvas mount; the Editor keeps its existing default.
const props = defineProps<{ runtime?: GameplayRuntime | null; runtimeView?: RuntimeWorldView | null; runtimeSurface?: RuntimeWorldSurface | null }>()
const runtimeView = props.runtimeView ?? null
const runtimeSurface = props.runtimeSurface ?? null
if (Boolean(props.runtime) !== Boolean(runtimeView) || Boolean(runtimeView) !== Boolean(runtimeSurface)) throw new Error('RUNTIME_CANVAS_COMPOSITION_REQUIRED')
const gameplayRuntime = props.runtime ?? editorGameplayRuntime
if (runtimeView && (gameplayRuntime.presentation.world !== runtimeView.state.world || gameplayRuntime.scriptDebugger.world !== runtimeView.state.world || gameplayRuntime.graphDebug.world !== runtimeView.state.world)) throw new Error('RUNTIME_CANVAS_WORLD_MISMATCH')
const runtimeAccessibilitySettings=gameplayRuntime.presentation.state.accessibility
const runtimeCaptions=gameplayRuntime.presentation.state.captions
const activeRuntimeCaptions=()=>gameplayRuntime.presentation.activeRuntimeCaptions()
// The Player Canvas owns its UI interaction controller and uses this Core audio; the Editor retains its existing singleton.
const gameUiRuntime = props.runtime ? new GameUiRuntime(gameplayRuntime.audio,()=>gameplayRuntime.presentation.state) : editorGameUiRuntime
// Plain Runtime presentation stays owned by Core; Vue observes only this Canvas bridge.
const timelinePresentationState=shallowRef(gameplayRuntime.animationTimeline.presentation)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const renderCanvasRef = ref<HTMLCanvasElement | null>(null)
const renderCanvasKey = ref(0)
let rendererInitialization = 0, canvasDisposed = false
const rendererRecoveryOwner = createRendererRecoveryOwner()
// Recovery belongs to this viewport; Runtime assets/settings keep the supplied environment.
const runtimeRendererEnvironment = runtimeSurface ? { ...runtimeSurface.renderer, contextRestored: editorRendererEnvironment(rendererRecoveryOwner).contextRestored, submissionFault: (reason: string) => rendererRecoveryOwner.submissionFault(reason) } : null
function createCanvasRenderer(canvas: HTMLCanvasElement, canvas2dOnly: boolean): Renderer2D {
  return runtimeRendererEnvironment ? createRuntimeRenderer2D(canvas, canvas2dOnly, runtimeRendererEnvironment) : createRenderer2D(canvas, canvas2dOnly, rendererRecoveryOwner)
}
const renderGraphDiagnosticsOwner = createRenderGraphDiagnosticsOwner()
let renderGraphDiagnosticsScope: RenderGraphDiagnosticsScope | null = null
/** Scope keys are existing identities; this adds no world epoch, scheduler or frame clock. */
function synchronizeRenderGraphDiagnosticsScope() {
  const projectGeneration = runtimeView?.resources.catalog.revision() ?? getProjectSessionGeneration(), sceneUuid = (runtimeView?.scenes ?? sceneManager).activeSceneUuid ?? '', runtimeSessionIdentity = gameplayRuntime.sessionIdentity, view = editorState.currentPage
  const old = renderGraphDiagnosticsScope
  if (!old || old.projectGeneration !== projectGeneration || old.sceneUuid !== sceneUuid || old.rendererGeneration !== rendererInitialization
    || old.runtimeSessionIdentity !== runtimeSessionIdentity || old.view !== view) {
    renderGraphDiagnosticsScope = { projectGeneration, sceneUuid, rendererGeneration: rendererInitialization, runtimeSessionIdentity, view }
    renderGraphDiagnosticsOwner.updateScope(renderGraphDiagnosticsScope)
  }
}
const gameSurfaceRef = ref<HTMLDivElement | null>(null)
const nativeInputRef = ref<HTMLInputElement | null>(null)
const focusedUiInput = ref<{ entity: Entity; rect: { x: number; y: number; width: number; height: number }; input: TextInput } | null>(null)
const accessibilityNodes = ref<UiAccessibilityNode[]>([])
let accessibilitySignature = ''
let touchPointer: number | null = null
let disposeEditorTouch: (() => void) | null = null
const profileInputObservations = import.meta.env.VITE_NOVA_PERFORMANCE_TRACE === '1'
let inputReceiptTokens: InputReceiptTokenMap | null = null
let inputObservationWorldEpoch: number | null = null, lastConsumedInputFrameSequence = 0
let disposePerformanceInputObservation: (() => void) | null = null
/** Profiling only: this viewport owns its receipt tokens and never replaces the gameplay input sampler. */
function installInputPerformanceObservation() {
  if (!profileInputObservations) return
  disposeInputPerformanceObservation()
  const tokens = new InputReceiptTokenMap(markPerformanceInput, forgetPerformanceInput)
  inputReceiptTokens = tokens
  const stop = gameplayRuntime.setInputObservationCallbacks({
    receipt: receipt => { if (receipt.worldEpoch === inputObservationWorldEpoch) tokens.receipt(receipt) },
    reset: (worldEpoch, inputEpoch) => {
      inputObservationWorldEpoch = worldEpoch; lastConsumedInputFrameSequence = 0; tokens.reset(inputEpoch)
    }
  })
  let disposed = false
  disposePerformanceInputObservation = () => {
    if (disposed) return
    disposed = true; stop(); tokens.dispose()
    if (inputReceiptTokens === tokens) { inputReceiptTokens = null; inputObservationWorldEpoch = null; lastConsumedInputFrameSequence = 0 }
  }
}
function disposeInputPerformanceObservation() { const dispose = disposePerformanceInputObservation; disposePerformanceInputObservation = null; dispose?.() }
const captionTick = ref(0), visibleCaptions = computed(/** 随字幕刷新计数变化获取当前有效的运行时字幕。 */ () => { void captionTick.value; return activeRuntimeCaptions() })
const inputBridge = new UiNativeInputBridge(/* 调用 gameUiRuntime.commitTextInput(uuid, value) 并返回调用结果。 */ (uuid, value) => gameUiRuntime.commitTextInput(uuid, value))
let ctx: CanvasRenderingContext2D | null = null
let renderer: Renderer2D | null = null
let canvasPixelRatio = 1
let isManualDrawing = false
const knownBrokenConnections = new WeakSet<object>()
const connectionGeometrySignatures = new Map<number, string>()
let palette = {
  canvas: '#11151b', grid: '#202630', label: '#626c7c', xAxis: '#a9505b', yAxis: '#4e946d',
  selection: '#ffd166', selectionFill: 'rgba(255,209,102,.24)', handle: '#ff7a59', connection: '#8bb8ff', broken: '#ff6b6b'
}

// The seven gameplay fields remain live Host reads, including field replacement on scene load.
// Editor-only tools retain their legacy state only on the default Editor path.
const runtimeStateKeys = new Set<PropertyKey>(['world', 'camera', 'globalSettings', 'playMode', 'engineDiagnostics', 'inputMap', 'audioSettings'])
const state = runtimeView ? new Proxy(physicsState, {
  get(target, key) {
    if (runtimeStateKeys.has(key)) return Reflect.get(runtimeView.state, key)
    if (key === 'simulationRunning') return runtimeView.state.playMode !== 'editing'
    if (key === 'selectedEntityIds') return []
    if (key === 'selectedEntityId' || key === 'focusEntityID') return null
    return Reflect.get(target, key)
  },
  set(_target, key, value) {
    if (runtimeStateKeys.has(key)) return Reflect.set(runtimeView.state, key, value)
    if (key === 'simulationRunning') throw new Error('RUNTIME_CANVAS_PLAY_MODE_OWNED_BY_CORE')
    throw new Error('RUNTIME_CANVAS_AUTHORING_WRITE_REJECTED: ' + String(key))
  }
}) : physicsState
const world = state.world
const sceneRendererEnvironment = runtimeSurface?.scene ?? (() => {
  const sceneParticleOwner = createEditorParticleOwner(world,{legacyRoot:true})
  return editorSceneRendererEnvironment(()=>getEditorTileMapOwner(world),()=>sceneParticleOwner)
})()
const lightingEnvironment = runtimeSurface?.lighting ?? editorLightingEnvironment(sceneRendererEnvironment,world)
const camera = state.camera
const activeCanvasLayer = () => runtimeView?.activeLayer ?? editorState.activeLayer
const renderCanvasLayer = () => runtimeView?.renderLayer ?? editorState.renderLayer

let isDragging = false; let isPanning = false; let isVertexDragging = false; let dragButton = 0 
let dragStart: Vec2 | null = null; let dragNow: Vec2 | null = null; let lastMouseScreen: Vec2 | null = null
let raf = 0; let resizeRaf = 0; let lastTime = performance.now(); let resizeObserver: ResizeObserver | null = null
let pendingMouseMove: MouseEvent | null = null
let idleFrameTimer: ReturnType<typeof setTimeout> | null = null
let performanceSampleCounter = 0, profileFrameCounter = 0, cachedPerformanceSample = { allocations: 0, assetJobs: 0 }

let hoveredVertex: { entityId: number, index: number, target: 'shape' | 'renderer' | 'collider', virtualPos?: Vec2 } | null = null
let dragMeta: { initialScaleX: number, initialScaleY: number, initialDist: number, vertexBaseline: VertexBaseline } | null = null
let dragEntityId: number | null = null; 
let canvasDragMode: 'none' | 'draw' | 'marquee' = 'none'
let marqueeSelectionMode: 'replace' | 'add' | 'toggle' = 'replace'
let gizmoDrag: {
  tool: 'move' | 'rotate' | 'scale'
  axis: GizmoAxis
  pivot: Vec2
  rotation: number
  startPointer: Vec2
  startAngle: number
  startLocal: Vec2
  snapshots: TransformSnapshot[]
} | null = null
let tileStroke: { entity: Entity; component: TileMap2D; stroke: TileStroke } | null = null
let tileHover: { x: number; y: number } | null = null

let savedCameraState: { scale: number, offset: Vec2 } | null = null;
let hasMovedEntity = false;
// Select-tool press on a selected object: becomes a move drag only after the pointer travels a few pixels,
// so a plain click still just selects and never writes a transform.
let pendingSelectDrag: { world: Vec2; screen: Vec2 } | null = null

watch(/* 返回 authoringState.viewportRequest?.id 的当前值。 */ () => authoringState.viewportRequest?.id, /** 按聚焦选择或摄像机请求计算目标边界，使其居中并适应画布。 */ () => {
  const request = authoringState.viewportRequest
  if (!request || editorState.currentPage !== 'scene') return
  const selected = world.entities.filter(/* 调用 state.selectedEntityIds.includes(entity.id) 并返回调用结果。 */ entity => state.selectedEntityIds.includes(entity.id))
  const cameraEntity = request.action === 'focus-camera'
    ? selected.find(/* 返回 entity.camera2D 的当前值。 */ entity => entity.camera2D) ?? world.entities.find(/* 返回 entity.camera2D?.active 的当前值。 */ entity => entity.camera2D?.active)
    : null
  const targets = cameraEntity ? [cameraEntity] : selected
  if (!targets.length) return
  const points = targets.flatMap(/* 调用 entityBoundaryPoints(entity, 64, world.entities) 并返回调用结果。 */ entity => entityBoundaryPoints(entity, 64, world.entities))
  if (!points.length) points.push(...targets.map(/* 返回 worldTransform(entity, world.entities).position 的当前值。 */ entity => worldTransform(entity, world.entities).position))
  const minX = Math.min(...points.map(/* 返回 point.x 的当前值。 */ point => point.x)), maxX = Math.max(...points.map(/* 返回 point.x 的当前值。 */ point => point.x))
  const minY = Math.min(...points.map(/* 返回 point.y 的当前值。 */ point => point.y)), maxY = Math.max(...points.map(/* 返回 point.y 的当前值。 */ point => point.y))
  const width = canvasRef.value?.clientWidth ?? 800, height = canvasRef.value?.clientHeight ?? 600
  const scale = Math.min(width * .72 / Math.max(maxX - minX, 1), height * .72 / Math.max(maxY - minY, 1))
  camera.targetScale = Math.min(1000, Math.max(.05, scale))
  camera.targetOffset = { x: width / 2 - (minX + maxX) / 2 * camera.targetScale, y: height / 2 + (minY + maxY) / 2 * camera.targetScale }
})

watch(/* 返回 state.focusEntityID 的当前值。 */ () => state.focusEntityID, /** 编辑目标切换时保存并聚焦相机，结束编辑后恢复原视角。 */ (newId) => {
  if (editorState.currentPage !== 'scene') return;

  if (newId !== null) {
    if (!savedCameraState) {
      savedCameraState = { scale: camera.targetScale ?? camera.scale, offset: { x: camera.targetOffset?.x ?? camera.offset.x, y: camera.targetOffset?.y ?? camera.offset.y } };
    }
    
    const ent = world.entities.find(/* 比较 e.id 与 newId，返回严格相等的判断结果。 */ e => e.id === newId); if (!ent) return;
    
    const boundary = entityBoundaryPoints(ent, 64, world.entities)
    const xs = boundary.map(/* 返回 point.x 的当前值。 */ point => point.x); const ys = boundary.map(/* 返回 point.y 的当前值。 */ point => point.y)
    const maxDim = boundary.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1) : 1
    
    const canvasW = canvasRef.value?.clientWidth || 800; const canvasH = canvasRef.value?.clientHeight || 600; const usableW = canvasW - 300; 
    const targetScale = Math.min(usableW / maxDim, canvasH / maxDim) * 0.666;
    
    camera.targetScale = Math.min(Math.max(targetScale, 0.05), 1000);
    const position = worldTransform(ent, world.entities).position
    camera.targetOffset = { x: (usableW / 2) - (position.x * camera.targetScale), y: (canvasH / 2) + (position.y * camera.targetScale) };
  } else {
    if (savedCameraState) {
      camera.targetScale = savedCameraState.scale; camera.targetOffset = { x: savedCameraState.offset.x, y: savedCameraState.offset.y };
      savedCameraState = null;
    }
  }
});

/** 读取主题画布调色板，缺少颜色变量时沿用原值。 */ function readPalette() {
  const styles = getComputedStyle(document.documentElement)
  const value = /* 先计算 styles.getPropertyValue(name).trim()；仅当其为假值时求右侧 fallback，返回短路求值结果。 */ (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback
  palette = {
    canvas: value('--bg-canvas', palette.canvas), grid: value('--canvas-grid', palette.grid), label: value('--canvas-grid-label', palette.label),
    xAxis: value('--canvas-x-axis', palette.xAxis), yAxis: value('--canvas-y-axis', palette.yAxis), selection: value('--canvas-selection', palette.selection),
    selectionFill: value('--canvas-selection-fill', palette.selectionFill), handle: value('--canvas-handle', palette.handle),
    connection: value('--connection', palette.connection), broken: value('--connection-broken', palette.broken)
  }
}

watch(/* 返回按声明顺序构造的数组 [prefs.theme, prefs.highContrast, prefs.maxPixelRatio]。 */ () => [prefs.theme, prefs.highContrast, prefs.maxPixelRatio], /** 主题变化后更新调色板并安排尺寸同步。 */ () => { readPalette(); scheduleResize() })
/** 页面 DOM 更新后同步调整保留的画布，避免网格使用上一面板尺寸闪现一帧；不创建额外渲染循环。 */
watch(/* 返回按声明顺序构造的数组 [editorState.currentPage, editorState.activeWorkspace]。 */ () => [editorState.currentPage, editorState.activeWorkspace], /** 进入场景或游戏画布时取消旧尺寸任务并立即调整尺寸。 */ () => {
  if ((editorState.currentPage === 'scene' || editorState.currentPage === 'game') && editorState.activeWorkspace !== 'ui') {
    if (resizeRaf) { cancelAnimationFrame(resizeRaf); resizeRaf = 0 }
    resize()
  }
}, { flush: 'post' })
watch(/* 返回 editorState.currentPage 的当前值。 */ () => editorState.currentPage, /** 离开游戏视图时结束文本输入并取消触摸控件交互。 */ page => {
  if (page !== 'game') {
    closeNativeInput(); gameUiRuntime.pointerCancel(); touchPointer = null
  }
})

/** 同步游戏文本控件与原生输入桥接，按需恢复焦点。 */ function synchronizeNativeInput(focus = false) {
  const active = gameUiRuntime.focusedTextInput(), changed = active?.entity.uuid !== focusedUiInput.value?.entity.uuid
  focusedUiInput.value = active
  if (!active) { inputBridge.reset(); return }
  void nextTick(/** 确认焦点目标未变化后绑定输入值，并按请求聚焦。 */ () => {
    const input = nativeInputRef.value
    if (!input || gameUiRuntime.focusedTextInput()?.entity.uuid !== active.entity.uuid) return
    inputBridge.bind(input, active.entity.uuid, active.input.value)
    if (focus || changed) input.focus({ preventScroll: true })
  })
}
/** 由游戏文本控件矩形和样式计算原生输入框定位。 */ function nativeInputStyle() {
  const active = focusedUiInput.value
  if (!active) return {}
  const style = gameUiRuntime.focusedTextInputStyle()
  return { left: `${active.rect.x}px`, top: `${active.rect.y}px`, width: `${active.rect.width}px`, height: `${active.rect.height}px`, ...style }
}
/** 转发原生输入事件，保留输入法组合状态及长度约束。 */ function onNativeInput(event: Event) { const active = focusedUiInput.value; if (active) inputBridge.input(event.target as HTMLInputElement, active.input.maxLength, (event as InputEvent).isComposing) }
/** 输入法组合结束时提交文本并应用长度限制。 */ function onCompositionEnd(event: CompositionEvent) { const active = focusedUiInput.value; if (active) inputBridge.compositionEnd(event.target as HTMLInputElement, active.input.maxLength) }
/** 隔离原生输入按键，处理控件跳转及确认取消，同时保护输入法按键。 */ function onNativeKey(event: KeyboardEvent) {
  event.stopPropagation()
  if (inputBridge.ownsCompositionKey(event)) return
  if (event.key === 'Tab') { event.preventDefault(); const active = focusedUiInput.value; if (active && nativeInputRef.value) inputBridge.flush(nativeInputRef.value, active.input.maxLength); gameUiRuntime.keyDown(event); synchronizeNativeInput(true); synchronizeAccessibleFocus(); return }
  if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); closeNativeInput(); canvasRef.value?.focus({ preventScroll: true }) }
}
/** 提交未完成输入后清除游戏文本焦点并重置桥接器。 */ function closeNativeInput() {
  const active = focusedUiInput.value
  if (active && nativeInputRef.value) {
    if (inputBridge.isComposing) inputBridge.compositionEnd(nativeInputRef.value, active.input.maxLength)
    else inputBridge.flush(nativeInputRef.value, active.input.maxLength)
  }
  gameUiRuntime.blurTextInput(); focusedUiInput.value = null; inputBridge.reset()
}
/** 没有文本编辑时将 DOM 焦点同步到选中的无障碍控件。 */ function synchronizeAccessibleFocus() {
  if (gameUiRuntime.focusedTextInput()) return
  const focused = gameUiRuntime.accessibilityNodes().find(/* 返回 node.focused 的当前值。 */ node => node.focused)
  if (focused) void nextTick(/* 调用 gameSurfaceRef.value?.querySelector<HTMLElement>(`[data-ui-uuid="${focused.uuid}"]`)?.focus({ preventScroll: true }) 并返回调用结果。 */ () => gameSurfaceRef.value?.querySelector<HTMLElement>(`[data-ui-uuid="${focused.uuid}"]`)?.focus({ preventScroll: true }))
}
/** 按无障碍控件标识更新运行时焦点及原生输入。 */ function onAccessibleFocus(uuid: string) { gameUiRuntime.focusByUuid(uuid); synchronizeNativeInput(true) }
/** 阻止点击传播并激活无障碍控件，再同步文本焦点。 */ function onAccessibleActivate(uuid: string, event: MouseEvent) { event.stopPropagation(); event.preventDefault(); gameUiRuntime.activateByUuid(uuid); synchronizeNativeInput(true) }
/** 接管游戏视图单个触摸或手写笔按下，捕获指针并同步输入方式。 */ function onUiPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' || editorState.currentPage !== 'game' || touchPointer !== null) return
  if (!gameUiRuntime.pointerDown(screenPos(event))) return
  touchPointer = event.pointerId; event.preventDefault(); event.stopPropagation(); canvasRef.value?.setPointerCapture(event.pointerId)
  setInputModality(event.pointerType === 'pen' ? 'pen' : 'touch'); synchronizeNativeInput(true)
}
/** 仅转发当前捕获指针的移动。 */ function onUiPointerMove(event: PointerEvent) { if (event.pointerId === touchPointer) { event.preventDefault(); event.stopPropagation(); gameUiRuntime.pointerMove(screenPos(event)) } }
/** 结束触摸控件交互并释放指针捕获。 */ function onUiPointerUp(event: PointerEvent) {
  if (event.pointerId !== touchPointer) return
  event.preventDefault(); event.stopPropagation(); gameUiRuntime.pointerUp(screenPos(event)); touchPointer = null
  if (canvasRef.value?.hasPointerCapture(event.pointerId)) canvasRef.value.releasePointerCapture(event.pointerId)
}
/** 当前指针取消时终止交互并清空触摸状态。 */ function onUiPointerCancel(event: PointerEvent) { if (event.pointerId === touchPointer) { gameUiRuntime.pointerCancel(); touchPointer = null } if (gizmoDrag || isVertexDragging) cancelActiveCanvasDrag() }

let canvasLogicalWidth = 0, canvasLogicalHeight = 0
/** 综合设备像素比、画质上限、自适应比例和分辨率缩放计算有界像素比。 */ function desiredCanvasPixelRatio(width: number, height: number) {
  return boundedFrame({width, height, pixelRatio: Math.max(.5, Math.min(window.devicePixelRatio || 1, editorState.currentPage === 'game' ? Infinity : prefs.maxPixelRatio, activeRenderQuality.maximumPixelRatio) * performanceRuntimeState.adaptivePixelRatioScale * (Number.isFinite(renderingSettings.resolutionScale) ? Math.min(2, Math.max(.5, renderingSettings.resolutionScale)) : 1)), clearColor: {r:0,g:0,b:0,a:1}}).pixelRatio
}
/** Update requested viewport/input geometry; backing pixels change only with a submitted world. */ function resize(redraw = true) {
  const canvas = canvasRef.value; if (!canvas) return
  const r = canvas.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return
  const oldWidth = canvasLogicalWidth; const oldHeight = canvasLogicalHeight
  canvasLogicalWidth = r.width; canvasLogicalHeight = r.height
  canvasPixelRatio = desiredCanvasPixelRatio(r.width, r.height)
  const dpr = canvasPixelRatio
  // CSS dimensions can change without changing a rounded backing-store pixel.
  // The WebGL viewport still needs the latest logical size in that case.
  renderer?.resize(r.width, r.height, dpr)
  if (oldWidth > 0 && oldHeight > 0 && (oldWidth !== r.width || oldHeight !== r.height)) {
    camera.offset.x += (r.width - oldWidth) / 2; camera.offset.y += (r.height - oldHeight) / 2
  }
  if (!ctx) ctx = canvas.getContext('2d', { alpha: true })!
  if (redraw) render()
}

/** 将多次尺寸变化合并为下一显示帧的一次更新。 */ function scheduleResize() {
  if (resizeRaf) return
  resizeRaf = requestAnimationFrame(/** 清除排队任务标识并实际调整画布尺寸。 */ () => {
    resizeRaf = 0
    resize()
  })
}

let presentationBaselined = false
let lastWorldSubmissionAt: number | null = null, lastWorldDeferred = false
// performance.memory is a costly getter in Chromium; the heap figure is sampled once per second.
let heapSampledAt = -Infinity, heapMb: number | null = null
function sampledHeapMb(now: number): number | null {
  if (now - heapSampledAt < 1000) return heapMb
  heapSampledAt = now
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  heapMb = memory ? memory.usedJSHeapSize / (1024 * 1024) : null
  return heapMb
}
/** 逐帧合并输入、更新相机与玩法、同步连接并渲染，按频率采集性能诊断。 */ function runFrame(time?: number) {
  if (document.hidden) return
  const now = time || performance.now(); const dt = (now - lastTime) / 1000; lastTime = now
  const frameStarted = performance.now()
  beginPerformanceFrame(frameStarted, time)
  flushPendingMouseMove()
  const gameInputScope = editorState.currentPage === 'game'
  gameUiRuntime.sampleInput({ editor: !gameInputScope })
  if (gameInputScope) synchronizeNativeInput()

  if (camera.targetScale !== null && editorPerformancePreferences.value.decorativeMotion) {
    camera.scale += (camera.targetScale - camera.scale) * (1 - Math.exp(-8 * dt));
    if (Math.abs(camera.scale - camera.targetScale) < 0.005) { camera.scale = camera.targetScale; camera.targetScale = null; }
  }
  if (camera.targetScale !== null && !editorPerformancePreferences.value.decorativeMotion) { camera.scale = camera.targetScale; camera.targetScale = null }
  if (camera.targetOffset !== null && editorPerformancePreferences.value.decorativeMotion) {
    const blend = 1 - Math.exp(-8 * dt)
    camera.offset.x += (camera.targetOffset.x - camera.offset.x) * blend;
    camera.offset.y += (camera.targetOffset.y - camera.offset.y) * blend;
    if (Math.abs(camera.offset.x - camera.targetOffset.x) < 0.5 && Math.abs(camera.offset.y - camera.targetOffset.y) < 0.5) {
      camera.offset.x = camera.targetOffset.x; camera.offset.y = camera.targetOffset.y; camera.targetOffset = null;
    }
  }
  if (camera.targetOffset !== null && !editorPerformancePreferences.value.decorativeMotion) { camera.offset = { ...camera.targetOffset }; camera.targetOffset = null }

  if (editorState.currentPage === 'scene' && !state.simulationRunning) syncEditableConnections(true)
  const previousConsumedInput = inputReceiptTokens ? gameplayRuntime.lastFrameConsumedInput : null
  const editorPresentation = !props.runtime
  const playedBefore = editorPresentation && state.playMode === 'playing'
  if (editorPresentation && playedBefore && !presentationBaselined) { resetRuntimePresentation(); syncRuntimePresentation(now, true); presentationBaselined = true }
  gameplayRuntime.frame(normalizeSimulationFrameDelta(dt), canvasRef.value?.getBoundingClientRect())
  // Playing frames write plain objects; observers (Inspector, hierarchy) refresh at a presentation rate and on pause.
  if (editorPresentation && presentationBaselined) {
    const stillPlaying = state.playMode === 'playing'
    syncRuntimePresentation(now, !stillPlaying)
    if (!stillPlaying) presentationBaselined = false
  }
  triggerRef(timelinePresentationState)
  const currentConsumedInput = inputReceiptTokens ? gameplayRuntime.lastFrameConsumedInput : null
  const freshConsumedInput = currentConsumedInput && currentConsumedInput !== previousConsumedInput
    && currentConsumedInput.worldEpoch === inputObservationWorldEpoch && currentConsumedInput.frameSequence > lastConsumedInputFrameSequence
    ? currentConsumedInput : null
  if (freshConsumedInput) lastConsumedInputFrameSequence = freshConsumedInput.frameSequence
  // Runtime commands may change hierarchy membership. Prepare the renderer's
  // identity lookup after simulation so the frame cannot consume stale parents.
  prepareHierarchyIndex(world.entities)
  if (editorState.currentPage === 'scene' && state.simulationRunning) syncEditableConnections(false)
  for (const connection of world.connections) {
    if (connection.breakState !== 'intact' && !knownBrokenConnections.has(connection)) {
      knownBrokenConnections.add(connection)
      editorState.statusText = t('connectionBroken', { name: connection.name })
      addEditorLog(t('connectionBroken', { name: connection.name }), 'Physics', 'warning')
    }
  }
  const simulationEnded = performance.now()
  const renderingStarted = performance.now()
  const inputToken = inputReceiptTokens?.consumeLatest(freshConsumedInput)
  try { render(dt, inputToken) }
  finally { if (inputToken !== undefined) inputReceiptTokens?.release(inputToken) }
  const renderingMs = performance.now() - renderingStarted
  if (latencyProbe.enabled) latencyProbe.frameCompleted({ rafTime: time ?? null, cpuStart: frameStarted, simulationEnd: simulationEnded, renderStart: renderingStarted,
    submittedAt: lastWorldSubmissionAt, deferred: lastWorldDeferred, gpuMs: editorState.rendererStats.gpuMs ?? null,
    fixedSteps: state.engineDiagnostics.stepsLastFrame ?? 0 })
  completePerformanceFrame()
  const frameObservation = currentPerformanceFrameObservation()
  const timings = gameplayRuntime.diagnostics.timings
  const frameMs = Math.max(0, dt * 1000)
  const measured = timings.physicsMs + timings.scriptsMs + timings.animationMs + timings.audioMs + timings.assetsMs + renderingMs
  const sampleInterval = state.simulationRunning || editorState.currentPage === 'game' || prefs.performanceProfile === 'quality' ? 3 : prefs.performanceProfile === 'low-end' ? 30 : 12
  if (performanceSampleCounter++ % sampleInterval === 0) cachedPerformanceSample = samplePerformanceTools(profilerState.current.frame + 1, world.entities.map(/* 返回 entity.uuid 的当前值。 */ entity => entity.uuid), editorState.rendererStats)
  const performanceSample = cachedPerformanceSample
  const profileInterval = profilerState.overheadMode === 'Full' ? 1 : profilerState.overheadMode === 'Low overhead' ? 4 : Number.POSITIVE_INFINITY
  if (Number.isFinite(profileInterval) && profileFrameCounter++ % profileInterval === 0) {
    recordFrameProfile({
      frameMs, physicsMs: timings.physicsMs, renderingMs, scriptsMs: timings.scriptsMs,
      animationMs: timings.animationMs, audioMs: timings.audioMs, assetsMs: timings.assetsMs,
      otherMs: Math.max(0, Math.min(performance.now() - frameStarted, frameMs || Number.POSITIVE_INFINITY) - measured),
      fps: frameObservation.rafIntervalMs === null ? null : 1000 / frameObservation.rafIntervalMs, memoryMb: sampledHeapMb(frameStarted),
      inputMs: timings.inputMs, allocations: performanceSample.allocations,
      gpuPasses: renderGraphState.passes.filter(/* 返回 pass.enabled 的当前值。 */ pass => pass.enabled).length, assetJobs: performanceSample.assetJobs,
      mainThreadMs: performanceRuntimeState.mainThreadMs, workerMs: performanceRuntimeState.workerMs,
      queueWaitMs: performanceRuntimeState.queueWaitMs, cacheHitRate: performanceRuntimeState.cacheHitRate,
      worstFrameMs: performanceRuntimeState.worstFrameMs, onePercentLowFps: performanceRuntimeState.onePercentLowFps,
      ...frameObservation
    })
  }
}

/** 只限制静止的编辑器画布；运行、游戏和交互仍使用显示器帧率。 */
function idleFrameDelay(): number {
  if (state.playMode !== 'editing') return 0
  // 隐藏的停止态仍以有界频率更新插件/热重载，不浪费完整物理同步帧。
  if (document.hidden || !['scene', 'game'].includes(editorState.currentPage) || editorState.activeWorkspace === 'ui') return 1000 / 15
  if (editorState.currentPage !== 'scene' || camera.targetScale !== null || camera.targetOffset !== null || isDragging || isPanning || isVertexDragging) return 0
  const fps = editorPerformancePreferences.value.idleFps
  return fps < 60 ? 1000 / fps : 0
}
/** 每次只拥有一个帧或定时任务，低端等待期间不持续唤醒 rAF。 */
function loop(time?: number) {
  raf = 0; idleFrameTimer = null
  if (canvasDisposed) return
  try { runFrame(time) }
  catch (error) { reportFatalError(error, 'Scene/Game frame', 'Renderer'); return }
  const delay = idleFrameDelay()
  if (delay) idleFrameTimer = setTimeout(/** 等待后交给下一显示帧，不并存多条循环。 */ () => { idleFrameTimer = null; if (!canvasDisposed) raf = requestAnimationFrame(loop) }, delay)
  else raf = requestAnimationFrame(loop)
}
/** 设置或播放状态变化时取消低频等待，及时恢复交互而不重置游戏时钟。 */
function wakeFrameLoop() {
  if (idleFrameTimer !== null) { clearTimeout(idleFrameTimer); idleFrameTimer = null; if (!canvasDisposed && !raf) raf = requestAnimationFrame(loop) }
}
/** Visibility changes occur between complete host frames; release input before clearing unstarted fixed time. */
function onFrameVisibilityChange() {
  if (canvasDisposed) return
  gameplayRuntime.setHostSuspended(document.hidden)
  world.resetSimulationClock()
  lastTime = performance.now(); rebasePerformanceFrameContinuity(); wakeFrameLoop()
}
watch(/** 只观察排程参数和播放模式，避免深层世界观察开销。 */ () => [editorPerformancePreferences.value.idleFps, state.playMode, editorState.currentPage, editorState.activeWorkspace], wakeFrameLoop)

onMounted(/** 挂载时连接运行时输入、创建渲染器并启动帧循环及窗口监听。 */ () => {
  installInputPerformanceObservation()
  if (canvasRef.value) disposeEditorTouch = installEditorTouch(canvasRef.value, { enabled: /** 只对设计视图接管触摸。 */ () => editorState.currentPage === 'scene', camera, down: onMouseDown, move: onMouseMove, up: onMouseUp })
  readPalette()
  gameUiRuntime.setCallback(/* 调用 gameplayRuntime.invokeUiCallback(entity, functionName) 并返回调用结果。 */ (entity, functionName) => gameplayRuntime.invokeUiCallback(entity, functionName))
  gameUiRuntime.setInputActions(state.inputMap)
  gameUiRuntime.setRemapCallback(/** 运行时改键成功后记录输入映射历史。 */ (action, bindingIndex, binding) => {
    if (rebindInputAction(state.inputMap, action, bindingIndex, binding) && !runtimeView) pushHistory('Remap runtime input')
  })
  void resetRenderer()
  window.addEventListener('nova-renderer-reset-request', resetRenderer)
  world.connections.filter(/* 比较 connection.breakState 与 'intact'，返回严格不等的判断结果。 */ connection => connection.breakState !== 'intact').forEach(/* 调用 knownBrokenConnections.add(connection) 并返回调用结果。 */ connection => knownBrokenConnections.add(connection))
  resize()
  if (canvasRef.value) {
    const r = canvasRef.value.getBoundingClientRect(); camera.offset.x = r.width / 2; camera.offset.y = r.height / 2
    resizeObserver = new ResizeObserver(scheduleResize); resizeObserver.observe(canvasRef.value.parentElement!)
  }
  document.addEventListener('visibilitychange', onFrameVisibilityChange); onFrameVisibilityChange(); loop(); window.addEventListener('resize', scheduleResize); window.addEventListener('mouseup', onMouseUp); window.addEventListener('keydown', onKeyDown, true)
  void world.wasmReady.then(/** 物理模块就绪后将初始化失败信息显示在状态栏。 */ () => {
    if (world.wasmError) editorState.statusText = t('physicsUnavailable', { message: world.wasmError.message })
  }).catch(/** 物理初始化拒绝时显示状态并记录可恢复错误。 */ error => { editorState.statusText = t('physicsUnavailable', { message: error instanceof Error ? error.message : String(error) }); reportRecoverableError(error, 'Physics WebAssembly initialization', 'Physics') })
})
onBeforeUnmount(/** 卸载时失效初始化、取消帧与监听并销毁运行时及渲染器。 */ () => { disposeInputPerformanceObservation(); disposeEditorTouch?.(); disposeEditorTouch = null; canvasDisposed = true; rendererInitialization++; renderGraphDiagnosticsOwner.dispose(); pendingMouseMove = null; if (raf) cancelAnimationFrame(raf); if (idleFrameTimer !== null) clearTimeout(idleFrameTimer); if (resizeRaf) cancelAnimationFrame(resizeRaf); document.removeEventListener('visibilitychange', onFrameVisibilityChange); window.removeEventListener('resize', scheduleResize); window.removeEventListener('mouseup', onMouseUp); window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('nova-renderer-reset-request', resetRenderer); if (resizeObserver) resizeObserver.disconnect(); gameUiRuntime.reset(); rendererRecoveryOwner.dispose(); renderer?.destroy(); renderer = null })

let rendererContextAntialias: boolean | null = null
watch(/* 比较 renderingSettings.antiAliasing 与 'Off'，返回严格相等的判断结果。 */ () => renderingSettings.antiAliasing === 'Off', /** 渲染设置变化后异步重建渲染器。 */ () => { void resetRenderer() })
/** 按抗锯齿要求重建画布上下文，以初始化代数阻止过期结果生效。 */ async function resetRenderer() {
  if (!renderCanvasRef.value || canvasDisposed) return
  const generation = ++rendererInitialization
  renderGraphDiagnosticsOwner.invalidate()
  const contextAntialias = renderingSettings.antiAliasing !== 'Off'
  const replaceContext = rendererContextAntialias !== null && rendererContextAntialias !== contextAntialias
  renderer?.destroy(); renderer = null
  try {
    if (replaceContext) {
      renderCanvasKey.value++; await nextTick()
      if (generation !== rendererInitialization || canvasDisposed || !renderCanvasRef.value) return
    }
    try { renderer = createCanvasRenderer(renderCanvasRef.value, false) }
    catch (error) {
      if (!(error instanceof RendererCanvasReplacementRequired)) throw error
      renderCanvasKey.value++; await nextTick()
      if (generation !== rendererInitialization || canvasDisposed || !renderCanvasRef.value) return
      renderer = createCanvasRenderer(renderCanvasRef.value, true)
    }
    if (renderCanvasRef.value) renderer.resize(renderCanvasRef.value.clientWidth, renderCanvasRef.value.clientHeight, canvasPixelRatio)
    rendererContextAntialias = contextAntialias
    rendererBackend.value = renderer.stats.backend
    if (latencyProbe.enabled) { latencyProbe.context.backend = renderer.stats.backend; latencyProbe.context.desynchronized = renderer.stats.desynchronized === true }
    reportRendererReset()
  } catch (error) { reportRecoverableError(error, 'Renderer initialization', 'Renderer') }
}

/** 将鼠标窗口坐标转换为画布逻辑坐标。 */ function screenPos(e: MouseEvent): Vec2 { const r = canvasRef.value!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
/** Game controls own handled scroll; otherwise sample gameplay once before suppressing browser scroll. */
function onWheel(e: WheelEvent) {
  wakeFrameLoop()
  if (e.defaultPrevented) return
  if (editorState.currentPage === 'game') {
    if (!gameUiRuntime.wheel(screenPos(e), e.deltaX, e.deltaY) && state.playMode !== 'editing') gameplayRuntime.input.onWheel(e)
  } else {
    const factor = Math.pow(1.1, prefs.zoomSensitivity)
    camera.zoomAt(screenPos(e), e.deltaY < 0 ? factor : 1 / factor)
  }
  e.preventDefault(); e.stopPropagation()
}
/** 仅在编辑状态接受携带资源标识的拖放。 */ function onAssetDragOver(event: DragEvent) { if (state.playMode === 'editing' && event.dataTransfer?.types.includes('application/x-nova-asset-guid')) event.preventDefault() }
/** 在落点实例化预制体，或按导入尺寸、轴心和过滤设置创建精灵并记录历史。 */ function onAssetDrop(event: DragEvent) {
  if (state.playMode !== 'editing') return
  const guid = event.dataTransfer?.getData('application/x-nova-asset-guid')
  const asset = resolveAsset(guid)
  if (!asset || (asset.assetType !== 'image' && asset.assetType !== 'prefab')) return
  event.preventDefault()
  const point = camera.screenToWorld(screenPos(event))
  if (asset.assetType === 'prefab') {
    const entities = instantiatePrefab(assetReference(asset.uuid), point)
    if (!entities.length) return
    pushHistory('Instantiate prefab')
    addEditorLog(t('prefabInstantiated', { name: asset.name }), 'Assets')
    return
  }
  const pixelsPerUnit = Math.max(.000001, asset.settings.pixelsPerUnit)
  const importedWidth = asset.settings.spriteRegion?.width || asset.width
  const importedHeight = asset.settings.spriteRegion?.height || asset.height
  const width = Math.max(.1, (importedWidth || pixelsPerUnit) / pixelsPerUnit)
  const height = Math.max(.1, (importedHeight || pixelsPerUnit) / pixelsPerUnit)
  const entity = createAuthoringObject('Sprite', point, false)
  entity.name = asset.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Sprite'
  const sprite = entity.spriteRenderer!
  sprite.spriteAsset = assetReference(asset.uuid)
  sprite.size = { x: width, y: height }
  sprite.pivot = { ...asset.settings.pivot }
  sprite.filterMode = asset.settings.filterMode
  sprite.nineSlice = { enabled: Object.values(asset.settings.borders).some(/* 比较 value 与 0，返回大于的判断结果。 */ value => value > 0), ...asset.settings.borders }
  sprite.sortingLayer = editorState.activeLayer
  entity.layer = editorState.activeLayer
  selectEntities([entity.id], 'replace')
  pushHistory('Create sprite from asset')
  addEditorLog(t('assetDropped', { name: asset.name }), 'Assets')
}
/** 应用网格和像素吸附，再寻找未选对象的顶点、边、中心或对齐位置。 */ function snapPoint(point: Vec2): Vec2 {
  let result = { ...point }
  if (prefs.snapToGrid && authoringState.snap.grid) {
    const step = Math.max(0.000001, prefs.gridSize)
    result = { x: Math.round(result.x / step) * step, y: Math.round(result.y / step) * step }
  }
  if (authoringState.snap.pixel) result = { x: Math.round(result.x * 100) / 100, y: Math.round(result.y * 100) / 100 }
  if (!authoringState.snap.vertex && !authoringState.snap.edge && !authoringState.snap.center && !authoringState.snap.object) return result
  const threshold = 10 / Math.max(camera.scale, 1e-9)
  const selected = new Set(state.selectedEntityIds)
  const candidates = (authoringState.performanceMode ? world.entities.slice(0, 5_000) : world.entities).filter(/* 先计算 !selected.has(entity.id) && entity.editorVisible；仅当其为真值时求右侧 entity.layer === editorState.activeLayer，返回短路求值结果。 */ entity => !selected.has(entity.id) && entity.editorVisible && entity.layer === editorState.activeLayer)
  let nearest = threshold
  const consider = /** 候选点更靠近原指针时更新最近吸附结果。 */ (candidate: Vec2) => { const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y); if (distance < nearest) { nearest = distance; result = { ...candidate } } }
  for (const entity of candidates) {
    const center = worldTransform(entity, world.entities).position
    if (authoringState.snap.center) consider(center)
    const boundary = entityBoundaryPoints(entity, authoringState.performanceMode ? 8 : 32, world.entities)
    if (authoringState.snap.vertex) boundary.forEach(consider)
    if (authoringState.snap.edge) for (let index = 0; index < boundary.length; index++) {
      const start = boundary[index], end = boundary[(index + 1) % boundary.length]
      const dx = end.x - start.x, dy = end.y - start.y, lengthSquared = dx * dx + dy * dy
      const amount = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0
      consider({ x: start.x + dx * amount, y: start.y + dy * amount })
    }
    if (authoringState.snap.object) {
      if (Math.abs(center.x - point.x) < nearest) { nearest = Math.abs(center.x - point.x); result.x = center.x }
      if (Math.abs(center.y - point.y) < nearest) { nearest = Math.abs(center.y - point.y); result.y = center.y }
    }
  }
  return result
}

/** 按精灵、路径、多边形或文本计算可视编辑边界，否则采用实体边界。 */ function editorBoundaryPoints(entity: Entity, samples = 48): Vec2[] {
  const sprite = entity.spriteRenderer
  if (sprite) {
    const left = -sprite.pivot.x * sprite.size.x, right = (1 - sprite.pivot.x) * sprite.size.x
    const bottom = -(1 - sprite.pivot.y) * sprite.size.y, top = sprite.pivot.y * sprite.size.y
    return [{ x: left, y: bottom }, { x: right, y: bottom }, { x: right, y: top }, { x: left, y: top }].map(/* 调用 localPointToWorld(entity, point, world.entities) 并返回调用结果。 */ point => localPointToWorld(entity, point, world.entities))
  }
  if ((entity.renderer.shape === 'Line' || entity.authoring.kind === 'Path' || entity.authoring.kind === 'Polygon') && entity.hasComponent('ShapeRenderer2D')) return entity.renderer.vertices.map(/* 调用 localPointToWorld(entity, point, world.entities) 并返回调用结果。 */ point => localPointToWorld(entity, point, world.entities))
  if (entity.textRenderer) {
    const width = Math.max(entity.textRenderer.maxWidth || entity.textRenderer.text.length * entity.textRenderer.fontSize * .58, .2), height = entity.textRenderer.fontSize * entity.textRenderer.lineHeight
    return [{ x: -width / 2, y: -height / 2 }, { x: width / 2, y: -height / 2 }, { x: width / 2, y: height / 2 }, { x: -width / 2, y: height / 2 }].map(/* 调用 localPointToWorld(entity, point, world.entities) 并返回调用结果。 */ point => localPointToWorld(entity, point, world.entities))
  }
  return entityBoundaryPoints(entity, samples, world.entities)
}

/** 跳过输入法及外部控件按键，转发游戏输入或处理顶点删除和取消编辑。 */ function onKeyDown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || event.target === nativeInputRef.value || isExternalUiControl(event.target, gameSurfaceRef.value) || isExternalUiControl(document.activeElement, gameSurfaceRef.value)) return
  if (editorState.currentPage === 'game' && gameUiRuntime.keyDown(event)) { event.preventDefault(); event.stopPropagation(); synchronizeNativeInput(true); synchronizeAccessibleFocus(); return }
  if ((event.key === 'Delete' || event.key === 'Backspace') && hoveredVertex && (hoveredVertex.target === 'renderer')) {
    const entity = world.entities.find(/* 比较 candidate.id 与 hoveredVertex!.entityId，返回严格相等的判断结果。 */ candidate => candidate.id === hoveredVertex!.entityId), minimum = entity?.renderer.shape === 'Line' ? 2 : 3
    if (entity && entity.renderer.vertices.length > minimum) { entity.renderer.vertices.splice(hoveredVertex.index, 1); entity.authoring.path.points = entity.renderer.vertices.map(/** 复制形状顶点以生成独立的作者路径点。 */ point => ({ ...point })); pushHistory('Delete shape point', `vertices:${entity.uuid}`); hoveredVertex = null; event.preventDefault() }
    return
  }
  if (event.key !== 'Escape') return
  if (editorState.manualConnectionId !== null) {
    editorState.manualConnectionId = null
    editorState.manualConnectionPoints.splice(0)
    isManualDrawing = false
    editorState.statusText = t('ready')
  }
  if (gizmoDrag || isVertexDragging) { cancelActiveCanvasDrag(); return }
  gizmoDrag = null
  canvasDragMode = 'none'
}

/** 比较连接几何签名，按需重新修补并清理已删除连接缓存。 */ function syncEditableConnections(repatchChanged: boolean) {
  const currentIds = new Set<number>()
  for (const connection of world.connections) {
    currentIds.add(connection.id)
    const signature = connectionGeometrySignature(connection, world.entities)
    const previous = connectionGeometrySignatures.get(connection.id)
    if (repatchChanged && previous !== undefined && previous !== signature) {
      repatchConnection(connection, world.entities)
      connectionGeometrySignatures.set(connection.id, connectionGeometrySignature(connection, world.entities))
    } else connectionGeometrySignatures.set(connection.id, signature)
  }
  for (const id of connectionGeometrySignatures.keys()) {
    if (!currentIds.has(id)) connectionGeometrySignatures.delete(id)
  }
}

/** 用直线或二次曲线绘制平滑路径。 */ function strokeSmoothPath(context: CanvasRenderingContext2D, points: Vec2[]) {
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  if (points.length === 2) {
    context.lineTo(points[1].x, points[1].y)
  } else {
    for (let index = 1; index < points.length - 1; index++) {
      const midpoint = {
        x: (points[index].x + points[index + 1].x) * 0.5,
        y: (points[index].y + points[index + 1].y) * 0.5
      }
      context.quadraticCurveTo(points[index].x, points[index].y, midpoint.x, midpoint.y)
    }
    const penultimate = points[points.length - 2]
    const last = points[points.length - 1]
    context.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y)
  }
  context.stroke()
}

const drawTools = new Set(['rectangle', 'circle', 'triangle'])
/* 调用 drawTools.has(state.activeTool) 并返回调用结果。 */ function isDrawTool(): boolean { return drawTools.has(state.activeTool) }
/* 根据 event.ctrlKey || event.metaKey 的真假，分别返回 'toggle' 或 event.shiftKey ? 'add' : 'replace'。 */ function selectionMode(event: MouseEvent): 'replace' | 'add' | 'toggle' { return event.ctrlKey || event.metaKey ? 'toggle' : event.shiftKey ? 'add' : 'replace' }
/** 按弧度旋转二维向量。 */ function rotateVector(vector: Vec2, angle: number): Vec2 { const cosine = Math.cos(angle); const sine = Math.sin(angle); return { x: vector.x * cosine - vector.y * sine, y: vector.x * sine + vector.y * cosine } }
/** 将点投影到有限线段并求最近距离，兼容零长度线段。 */ function distanceToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x; const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const amount = lengthSquared > 0 ? Math.min(1, Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0
  return Math.hypot(point.x - start.x - dx * amount, point.y - start.y - dy * amount)
}
/** 扩展选择到绑定复合体成员并排除锁定实体。 */ function transformSelectionIds(): number[] {
  const ids = new Set<number>()
  for (const id of state.selectedEntityIds) for (const member of boundCompoundEntityIds(id, world.connections, world.entities)) ids.add(member)
  return [...ids].filter(/* 返回 world.entities.find(entity => entity.id === id)?.editorLocked 的逻辑取反结果。 */ id => !world.entities.find(/* 比较 entity.id 与 id，返回严格相等的判断结果。 */ entity => entity.id === id)?.editorLocked)
}
/** 由有效选择计算主实体、操作轴心和局部或世界旋转。 */ function currentGizmo() {
  const ids = transformSelectionIds()
  if (!ids.length) return null
  const primaryId = ids.includes(state.selectedEntityId ?? -1) ? state.selectedEntityId : ids[ids.length - 1] ?? null
  return {
    ids,
    primaryId,
    pivot: gizmoPivot(ids, primaryId, editorState.pivotMode, world.entities),
    rotation: gizmoRotation(primaryId, editorState.transformSpace, world.entities)
  }
}
/** 按当前工具在固定屏幕容差内命中移动、旋转或缩放轴。 */ function hitGizmo(point: Vec2): GizmoAxis | null {
  const gizmo = currentGizmo()
  if (!gizmo || state.activeTool === 'select' || isDrawTool() || ['pivot', 'path', 'polygon', 'collider', 'measure'].includes(state.activeTool)) return null
  const unit = 1 / camera.scale
  const x = axisVector('x', gizmo.rotation); const y = axisVector('y', gizmo.rotation)
  const xEnd = { x: gizmo.pivot.x + x.x * 72 * unit, y: gizmo.pivot.y + x.y * 72 * unit }
  const yEnd = { x: gizmo.pivot.x + y.x * 72 * unit, y: gizmo.pivot.y + y.y * 72 * unit }
  if (state.activeTool === 'rotate') return Math.abs(Math.hypot(point.x - gizmo.pivot.x, point.y - gizmo.pivot.y) - 52 * unit) <= 9 * unit ? 'xy' : null
  if (state.activeTool === 'scale' || state.activeTool === 'rect') {
    if (Math.hypot(point.x - xEnd.x, point.y - xEnd.y) <= 10 * unit) return 'x'
    if (Math.hypot(point.x - yEnd.x, point.y - yEnd.y) <= 10 * unit) return 'y'
    if (Math.hypot(point.x - gizmo.pivot.x, point.y - gizmo.pivot.y) <= 10 * unit) return 'xy'
    return null
  }
  if (Math.hypot(point.x - gizmo.pivot.x, point.y - gizmo.pivot.y) <= 10 * unit) return 'xy'
  if (distanceToSegment(point, gizmo.pivot, xEnd) <= 7 * unit) return 'x'
  if (distanceToSegment(point, gizmo.pivot, yEnd) <= 7 * unit) return 'y'
  return null
}
/** 开始变换拖动时保存轴心、初始指针与实体变换快照。 */ function beginGizmoDrag(axis: GizmoAxis, point: Vec2, toolOverride?: 'move') {
  const gizmo = currentGizmo()
  const tool = toolOverride ?? state.activeTool
  if (!gizmo || (tool !== 'move' && tool !== 'rotate' && tool !== 'scale' && tool !== 'rect')) return
  const local = rotateVector({ x: point.x - gizmo.pivot.x, y: point.y - gizmo.pivot.y }, -gizmo.rotation)
  gizmoDrag = {
    tool: tool === 'rect' ? 'scale' : tool,
    axis,
    pivot: gizmo.pivot,
    rotation: gizmo.rotation,
    startPointer: { ...point },
    startAngle: Math.atan2(point.y - gizmo.pivot.y, point.x - gizmo.pivot.x),
    startLocal: local,
    snapshots: captureTransforms(gizmo.ids, world.entities)
  }
  hasMovedEntity = false
}

/** 仅允许编辑状态未锁定实体开始顶点拖动，并保存初始比例及距离。 */ function beginVertexDrag(entityId: number, point: Vec2, button: number): boolean {
  const entity = world.entities.find(/* 比较 candidate.id 与 entityId，返回严格相等的判断结果。 */ candidate => candidate.id === entityId)
  if (!entity || entity.editorLocked || state.playMode !== 'editing') return false
  dragEntityId = entityId
  dragButton = button
  isVertexDragging = true
  const position = worldTransform(entity, world.entities).position
  dragMeta = {
    initialScaleX: entity.transform.scale.x,
    initialScaleY: entity.transform.scale.y,
    initialDist: Math.max(0.1, Math.hypot(point.x - position.x, point.y - position.y)),
    vertexBaseline: captureVertexBaseline(entity)
  }
  return true
}

/** 按控件、瓦片、连接、测量、轴心、顶点及变换优先级分派按下，必要时开始绘图或框选。 */ function onMouseDown(e: MouseEvent) {
  wakeFrameLoop()
  const sPos = screenPos(e); const wPos = camera.screenToWorld(sPos); dragButton = e.button; hasMovedEntity = false
  if (editorState.currentPage === 'game') {
    if (e.button === 0) { canvasRef.value?.focus({ preventScroll: true }); if (gameUiRuntime.pointerDown(sPos)) { e.preventDefault(); e.stopPropagation() }; synchronizeNativeInput(true) }
    return
  }
  const tileEntity = tilemapEditorState.active ? world.entities.find(/* 比较 entity.uuid 与 tilemapEditorState.selectedEntityUuid，返回严格相等的判断结果。 */ entity => entity.uuid === tilemapEditorState.selectedEntityUuid) ?? null : null
  const tileMap = tileEntity?.getComponent<TileMap2D>('TileMap2D') ?? null
  if (e.button === 0 && tileEntity && tileMap && state.playMode === 'editing') {
    const cell = worldToTile(tileEntity, tileMap, wPos, world.entities)
    if (cell) { tileStroke = { entity: tileEntity, component: tileMap, stroke: beginTileStroke(tileMap, cell) }; tileHover = cell; return }
  }
  if (editorState.manualConnectionId !== null && e.button === 0 && state.playMode === 'editing') { isManualDrawing = true; editorState.manualConnectionPoints.splice(0, editorState.manualConnectionPoints.length, wPos); return }
  if (e.button === 0 && state.activeTool === 'select' && state.playMode === 'editing') {
    const uiEntity = gameUiRuntime.entityAt(sPos)
    if (uiEntity && !uiEntity.hasComponent('Canvas')) {
      selectEntities([uiEntity.id], selectionMode(e), uiEntity.id)
      return
    }
  }
  if (state.activeTool === 'measure' && e.button === 0 && state.playMode === 'editing') {
    const point = snapPoint(wPos); authoringState.measurement = { active: true, start: point, end: point }; return
  }
  if (state.activeTool === 'pivot' && e.button === 0 && state.playMode === 'editing') {
    const entity = world.entities.find(/* 比较 candidate.id 与 state.selectedEntityId，返回严格相等的判断结果。 */ candidate => candidate.id === state.selectedEntityId)
    if (entity && !entity.editorLocked) {
      const local = worldPointToLocal(entity, snapPoint(wPos), world.entities)
      const sprite = entity.spriteRenderer
      if (sprite) {
        const pivot = { x: Math.max(0, Math.min(1, local.x / Math.max(sprite.size.x, 1e-9) + .5)), y: Math.max(0, Math.min(1, local.y / Math.max(sprite.size.y, 1e-9) + .5)) }
        sprite.pivot = pivot; entity.authoring.origin = { ...pivot }
      } else entity.authoring.origin = { ...local }
      pushHistory('Set object pivot', `pivot:${entity.uuid}`)
    }
    return
  }
  if (vertexToolActive()) checkHoverVertex(wPos)
  if (e.button === 2 && hoveredVertex && beginVertexDrag(hoveredVertex.entityId, wPos, e.button)) return
  if (e.button === 2) { const hitId = hitTest(wPos); if (hitId !== null) openContextMenu(e, 'grid-entity', hitId); else { isPanning = true; lastMouseScreen = sPos } return }
  if (e.button === 1) { isPanning = true; lastMouseScreen = sPos; return }
  if (e.button !== 0) return

  if (isDrawTool()) {
    if (state.playMode !== 'editing') return
    canvasDragMode = 'draw'; isDragging = true; dragStart = wPos; dragNow = wPos
    return
  }

  if (vertexToolActive() && state.playMode === 'editing' && hoveredVertex) {
    if (beginVertexDrag(hoveredVertex.entityId, wPos, e.button)) return
  }

  if (state.playMode === 'editing') {
    const axis = hitGizmo(wPos)
    if (axis) { beginGizmoDrag(axis, wPos); return }
  }

  const hitId = hitTest(wPos)
  if (hitId !== null) {
    const entity = world.entities.find(/* 比较 candidate.id 与 hitId，返回严格相等的判断结果。 */ candidate => candidate.id === hitId)
    if (!state.selectedEntityIds.includes(hitId) || e.ctrlKey || e.metaKey || e.shiftKey) selectEntities([hitId], selectionMode(e), hitId)
    if (state.playMode === 'editing' && state.activeTool === 'move' && entity && !entity.editorLocked && state.selectedEntityIds.includes(hitId)) beginGizmoDrag('xy', wPos)
    else if (state.playMode === 'editing' && state.activeTool === 'select' && entity && !entity.editorLocked && state.selectedEntityIds.includes(hitId) && !(e.ctrlKey || e.metaKey || e.shiftKey)) pendingSelectDrag = { world: wPos, screen: sPos }
    return
  }

  marqueeSelectionMode = selectionMode(e)
  if (marqueeSelectionMode === 'replace') selectEntities([], 'replace')
  canvasDragMode = 'marquee'; isDragging = true; dragStart = wPos; dragNow = wPos
}

/** 在路径或多边形最近线段后插入吸附顶点并记录历史。 */ function onDoubleClick(event: MouseEvent) {
  if (!['path', 'polygon'].includes(state.activeTool) || state.selectedEntityId === null || state.playMode !== 'editing') return
  const entity = world.entities.find(/* 比较 candidate.id 与 state.selectedEntityId，返回严格相等的判断结果。 */ candidate => candidate.id === state.selectedEntityId)
  if (!entity?.hasComponent('ShapeRenderer2D') || entity.editorLocked) return
  const point = worldPointToLocal(entity, snapPoint(camera.screenToWorld(screenPos(event))), world.entities), vertices = entity.renderer.vertices
  let insertion = vertices.length
  if (vertices.length > 1) {
    let nearest = Number.POSITIVE_INFINITY, segmentCount = entity.renderer.shape === 'Line' ? vertices.length - 1 : vertices.length
    for (let index = 0; index < segmentCount; index++) { const distance = distanceToSegment(point, vertices[index], vertices[(index + 1) % vertices.length]); if (distance < nearest) { nearest = distance; insertion = index + 1 } }
  }
  vertices.splice(insertion, 0, point); entity.authoring.path.points = vertices.map(/** 复制插入后的顶点以同步作者路径。 */ vertex => ({ ...vertex })); pushHistory('Add shape point', `vertices:${entity.uuid}`)
}

/** 仅保留最新鼠标移动样本，避免高频事件积压编辑操作。 */ function onMouseMove(e: MouseEvent) {
  wakeFrameLoop()
  // Browser mouse events can arrive much faster than the display can present
  // them. Retaining only the newest sample prevents an expensive drag or snap
  // operation from building an input backlog while still updating every frame.
  pendingMouseMove = e
  if (latencyProbe.enabled && (gizmoDrag || pendingSelectDrag)) latencyProbe.inputReceived('editor-drag', 'pointermove', false, e.timeStamp)
}

/** 取出并清空最新样本，再执行本帧移动逻辑。 */ function flushPendingMouseMove() {
  const event = pendingMouseMove
  if (!event) return
  pendingMouseMove = null
  processMouseMove(event)
}

/** 处理画笔、测量、平移和变换拖动；顶点编辑转换到局部坐标并校验凸多边形。 */ function processMouseMove(e: MouseEvent) {
  const sPos = screenPos(e); const wPos = camera.screenToWorld(sPos)
  editorState.lastCanvasWorldPoint = { ...wPos }
  if (editorState.currentPage === 'game') { gameUiRuntime.pointerMove(sPos); return }
  if (tilemapEditorState.active) {
    const tileEntity = tileStroke?.entity ?? world.entities.find(/* 比较 entity.uuid 与 tilemapEditorState.selectedEntityUuid，返回严格相等的判断结果。 */ entity => entity.uuid === tilemapEditorState.selectedEntityUuid) ?? null
    const tileMap = tileStroke?.component ?? tileEntity?.getComponent<TileMap2D>('TileMap2D') ?? null
    const cell = tileEntity && tileMap ? worldToTile(tileEntity, tileMap, wPos, world.entities) : null
    tileHover = cell
    if (tileStroke && cell) continueTileStroke(tileStroke.component, tileStroke.stroke, cell)
    if (tileStroke) return
  }
  if (isManualDrawing) { const points = editorState.manualConnectionPoints; const previous = points[points.length - 1]; if (!previous || Math.hypot(previous.x - wPos.x, previous.y - wPos.y) > 3 / camera.scale) points.push(wPos); return }
  if (authoringState.measurement.active && authoringState.measurement.start) { authoringState.measurement.end = snapPoint(wPos); return }
  if (isPanning && lastMouseScreen) { camera.targetScale = null; camera.targetOffset = null; camera.offset.x += sPos.x - lastMouseScreen.x; camera.offset.y += sPos.y - lastMouseScreen.y; lastMouseScreen = sPos; return }

  if (pendingSelectDrag && !gizmoDrag) {
    if (Math.hypot(sPos.x - pendingSelectDrag.screen.x, sPos.y - pendingSelectDrag.screen.y) < 4) return
    const origin = pendingSelectDrag.world
    pendingSelectDrag = null
    beginGizmoDrag('xy', origin, 'move')
  }
  if (gizmoDrag) {
    hasMovedEntity = true
    if (gizmoDrag.tool === 'move') {
      let delta = projectedDelta({ x: wPos.x - gizmoDrag.startPointer.x, y: wPos.y - gizmoDrag.startPointer.y }, gizmoDrag.axis, gizmoDrag.rotation)
      if (prefs.snapToGrid) {
        const target = snapPoint({ x: gizmoDrag.pivot.x + delta.x, y: gizmoDrag.pivot.y + delta.y })
        delta = projectedDelta({ x: target.x - gizmoDrag.pivot.x, y: target.y - gizmoDrag.pivot.y }, gizmoDrag.axis, gizmoDrag.rotation)
      }
      applyTranslation(gizmoDrag.snapshots, delta, world.entities)
    } else if (gizmoDrag.tool === 'rotate') {
      let delta = Math.atan2(wPos.y - gizmoDrag.pivot.y, wPos.x - gizmoDrag.pivot.x) - gizmoDrag.startAngle
      if (editorState.angleSnapEnabled) { const step = Math.max(0.1, editorState.angleSnapDegrees) * Math.PI / 180; delta = Math.round(delta / step) * step }
      applyRotation(gizmoDrag.snapshots, gizmoDrag.pivot, delta, world.entities)
    } else {
      const current = rotateVector({ x: wPos.x - gizmoDrag.pivot.x, y: wPos.y - gizmoDrag.pivot.y }, -gizmoDrag.rotation)
      let factor = { x: 1, y: 1 }
      if (gizmoDrag.axis === 'x') factor.x = Math.max(0.01, Math.abs(current.x) / Math.max(Math.abs(gizmoDrag.startLocal.x), 1e-6))
      else if (gizmoDrag.axis === 'y') factor.y = Math.max(0.01, Math.abs(current.y) / Math.max(Math.abs(gizmoDrag.startLocal.y), 1e-6))
      else { const uniform = Math.max(0.01, Math.hypot(current.x, current.y) / Math.max(Math.hypot(gizmoDrag.startLocal.x, gizmoDrag.startLocal.y), 1e-6)); factor = { x: uniform, y: uniform } }
      applyScale(gizmoDrag.snapshots, gizmoDrag.pivot, factor, world.entities)
    }
    latencyProbe.editorCommandApplied()
    return
  }

  if (!isDragging && !isVertexDragging && vertexToolActive()) checkHoverVertex(wPos)
  if (isVertexDragging && dragEntityId && dragMeta) {
    hasMovedEntity = true
    const entity = world.entities.find(/* 比较 candidate.id 与 dragEntityId，返回严格相等的判断结果。 */ candidate => candidate.id === dragEntityId); if (!entity || !hoveredVertex || entity.editorLocked) return
    const transform = worldTransform(entity, world.entities)
    if (dragButton === 2) { const scaleFactor = Math.hypot(wPos.x - transform.position.x, wPos.y - transform.position.y) / dragMeta.initialDist; entity.transform.scale.x = Math.max(MIN_SIZE, dragMeta.initialScaleX * scaleFactor); entity.transform.scale.y = Math.max(MIN_SIZE, dragMeta.initialScaleY * scaleFactor) }
    else {
      const local = worldPointToLocal(entity, snapPoint(wPos), world.entities)
      if (hoveredVertex.target === 'renderer') {
        const candidate = entity.renderer.vertices.map(/** 复制渲染顶点用于候选编辑，避免验证前覆盖原几何。 */ vertex => ({ ...vertex })); candidate[hoveredVertex.index] = local
        if (entity.renderer.shape === 'Line' || isValidConvexPolygon(candidate)) { entity.renderer.vertices = candidate; entity.authoring.path.points = candidate.map(/** 复制已验证顶点以同步作者路径。 */ point => ({ ...point })) }
      } else if (hoveredVertex.target === 'collider') {
        const collider = entity.getCollider(); if (!collider) return
        if (collider.kind === 'EllipseCollider2D') { collider.radiusX = Math.max(.01, Math.abs(local.x - collider.offset.x)); collider.radiusY = Math.max(.01, Math.abs(local.y - collider.offset.y)) }
        else { const candidate = collider.vertices.map(/** 复制碰撞顶点用于候选几何检查。 */ vertex => ({ ...vertex })); candidate[hoveredVertex.index] = { x: local.x - collider.offset.x, y: local.y - collider.offset.y }; if (isValidConvexPolygon(candidate)) collider.vertices = candidate }
      } else if (entity instanceof BoxEntity || entity instanceof TriangleEntity) {
        const candidate = entity.vertices.map(/** 复制基础实体顶点用于候选几何检查。 */ vertex => ({ ...vertex })); candidate[hoveredVertex.index] = local; if (isValidConvexPolygon(candidate)) entity.vertices = candidate
      } else if (entity instanceof CircleEntity) { entity.radiusX = Math.max(0.1, Math.abs(local.x)); entity.radiusY = Math.max(0.1, Math.abs(local.y)) }
    }
    return
  }
  if (isDragging && dragStart) dragNow = wPos
}

/** 按拖动矩形筛选实体边界并依框选模式更新选择。 */ function selectMarqueeEntities(start: Vec2, end: Vec2) {
  const left = Math.min(start.x, end.x); const right = Math.max(start.x, end.x); const bottom = Math.min(start.y, end.y); const top = Math.max(start.y, end.y)
  const ids = world.entities.flatMap(/** 排除不可编辑及不符合筛选条件的实体，返回与框选相交的标识。 */ entity => {
    if (!entity.enabled || !entity.editorVisible || entity.editorLocked || entity.layer !== editorState.activeLayer || entity.hasComponent('RectTransform') || !matchesSelectionFilter(entity)) return []
    const boundary = editorBoundaryPoints(entity, 48)
    if (!boundary.length) return []
    const xs = boundary.map(/* 返回 point.x 的当前值。 */ point => point.x); const ys = boundary.map(/* 返回 point.y 的当前值。 */ point => point.y)
    return Math.max(...xs) >= left && Math.min(...xs) <= right && Math.max(...ys) >= bottom && Math.min(...ys) <= top ? [entity.id] : []
  })
  selectEntities(ids, marqueeSelectionMode)
}

/** 结束全部画布拖动并清空指针、几何及变换快照。 */ function finishCanvasDrag() {
  isDragging = isPanning = isVertexDragging = false
  pendingSelectDrag = null
  canvasDragMode = 'none'; dragStart = dragNow = lastMouseScreen = null; dragMeta = null; dragEntityId = null; gizmoDrag = null
}

/** 取消进行中的变换拖动：先恢复捕获的基准姿态，再清空拖动状态。
 * §24 要求 Escape 与 pointercancel 都是"恢复基准"，而不是把已写入的位移留成不可撤销的残留。
 * 刻意不写历史：回到基准后文档未变，无需产生一条空事务。 */
function cancelActiveCanvasDrag() {
  if (gizmoDrag && hasMovedEntity) {
    restoreTransforms(gizmoDrag.snapshots, world.entities)
    recordEntityProperties(gizmoDrag.snapshots.map(/* 收集被还原的实体以刷新属性显示。 */ snapshot => snapshot.entity))
    editorState.statusText = t('ready')
  }
  // 顶点拖动同样直接改写文档几何，取消时必须整体还原，否则位移成为不可撤销的残留。
  if (isVertexDragging && dragEntityId !== null && dragMeta) {
    const entity = world.entities.find(/* 比较 candidate.id 与 dragEntityId，返回严格相等的判断结果。 */ candidate => candidate.id === dragEntityId)
    if (entity) {
      restoreVertexBaseline(entity, dragMeta.vertexBaseline)
      recordEntityProperties([entity])
      editorState.statusText = t('ready')
    }
  }
  finishCanvasDrag()
}

/** 释放前处理最后移动样本，完成瓦片、连接、变换或创建操作并记录历史。 */ function onMouseUp(event?: MouseEvent) {
  flushPendingMouseMove()
  if (editorState.currentPage === 'game') {
    if (event && canvasRef.value && gameUiRuntime.pointerUp(screenPos(event))) { event.preventDefault(); event.stopPropagation() }
    return
  }
  if (authoringState.measurement.active) { authoringState.measurement.active = false; return }
  if (tileStroke) {
    const point = event && canvasRef.value ? camera.screenToWorld(screenPos(event)) : null
    const cell = point ? worldToTile(tileStroke.entity, tileStroke.component, point, world.entities) : tileStroke.stroke.previous
    const changed = cell ? endTileStroke(tileStroke.component, tileStroke.stroke, cell) : tileStroke.stroke.changed
    if (changed) pushHistory('Paint TileMap', `tilemap:${tileStroke.entity.uuid}`)
    tileStroke = null
    return
  }
  if (isManualDrawing) { const connection = world.connections.find(/* 比较 candidate.id 与 editorState.manualConnectionId，返回严格相等的判断结果。 */ candidate => candidate.id === editorState.manualConnectionId); if (connection && editorState.manualConnectionPoints.length >= 2) { setManualRoute(connection, editorState.manualConnectionPoints, world.entities); pushHistory('Draw connection'); editorState.statusText = t('connectionUpdated') } editorState.manualConnectionId = null; editorState.manualConnectionPoints.splice(0); isManualDrawing = false; return }

  if (gizmoDrag) {
    if (hasMovedEntity) {
      for (const snapshot of gizmoDrag.snapshots) { normalizeEntity(snapshot.entity); if (snapshot.entity.rigidBody.massMode === 'Automatic') syncMassFromDensity(snapshot.entity) }
      recordEntityProperties(gizmoDrag.snapshots.map(/* 返回 snapshot.entity 的当前值。 */ snapshot => snapshot.entity))
      pushHistory(`${gizmoDrag.tool[0].toUpperCase()}${gizmoDrag.tool.slice(1)} entities`, `transform:${gizmoDrag.tool}`)
    }
    finishCanvasDrag(); return
  }

  if (isVertexDragging && dragEntityId !== null) {
    const entity = world.entities.find(/* 比较 candidate.id 与 dragEntityId，返回严格相等的判断结果。 */ candidate => candidate.id === dragEntityId)
    if (entity && hasMovedEntity) { normalizeEntity(entity); if (entity.rigidBody.massMode === 'Automatic') syncMassFromDensity(entity); pushHistory('Edit shape vertices', `vertices:${entity.uuid}`) }
    finishCanvasDrag(); return
  }

  if (isDragging && dragStart && dragNow) {
    const dragDistX = Math.abs(dragStart.x - dragNow.x); const dragDistY = Math.abs(dragStart.y - dragNow.y)
    if (canvasDragMode === 'marquee') {
      if (dragDistX > 0.2 || dragDistY > 0.2) selectMarqueeEntities(dragStart, dragNow)
    } else if (canvasDragMode === 'draw' && (dragDistX > 0.5 || dragDistY > 0.5)) {
      const width = Math.max(dragDistX, 0.1); const height = Math.max(dragDistY, 0.1)
      const center = snapPoint({ x: Math.min(dragStart.x, dragNow.x) + width / 2, y: Math.min(dragStart.y, dragNow.y) + height / 2 })
      let created: Entity | null = null
      if (state.activeTool === 'rectangle') created = world.addBox(center, { x: width, y: height })
      else if (state.activeTool === 'circle') created = world.addCircle(center, width / 2, height / 2)
      else if (state.activeTool === 'triangle') created = world.addTriangle(center, { x: width, y: height })
      if (created) { created.layer = editorState.activeLayer; created.color = defaultColorForLayer(created.layer); created.density = prefs.defaultDensity; created.restitution = prefs.defaultRestitution; created.staticFriction = prefs.defaultFriction; created.dynamicFriction = prefs.defaultFriction; syncMassFromDensity(created); selectEntities([created.id], 'replace', created.id); pushHistory('Create entity') }
    }
  }
  finishCanvasDrag()
}

/** 判断当前工具是否支持顶点悬停及拖动。 */ function vertexToolActive(): boolean { return state.activeTool === 'select' || state.activeTool === 'path' || state.activeTool === 'polygon' || state.activeTool === 'collider' }
/** 在当前对象的渲染、碰撞顶点或椭圆边缘寻找控制点并更新光标。 */ function checkHoverVertex(p: Vec2) {
  if (!state.selectedEntityId) { hoveredVertex = null; document.body.style.cursor = 'default'; return }
  const ent = world.entities.find(/* 比较 e.id 与 state.selectedEntityId，返回严格相等的判断结果。 */ e => e.id === state.selectedEntityId)
  if (!ent || ent.editorLocked || ent.hasComponent('RectTransform')) { hoveredVertex = null; document.body.style.cursor = 'default'; return }
  const threshold = 12 / camera.scale 
  
  if ((state.activeTool === 'path' || state.activeTool === 'polygon') && ent.hasComponent('ShapeRenderer2D')) {
    const vertices = ent.renderer.vertices
    let minDist = threshold; let foundIndex = -1
    for (let index = 0; index < vertices.length; index++) {
      const point = localPointToWorld(ent, vertices[index], world.entities), distance = Math.hypot(p.x - point.x, p.y - point.y)
      if (distance < minDist) { minDist = distance; foundIndex = index }
    }
    if (foundIndex !== -1) { hoveredVertex = { entityId: ent.id, index: foundIndex, target: 'renderer' }; document.body.style.cursor = 'crosshair'; return }
  } else if (state.activeTool === 'collider') {
    const collider = ent.getCollider()
    if (collider) {
      if (collider.kind === 'EllipseCollider2D') {
        const local = worldPointToLocal(ent, p, world.entities), relative = { x: local.x - collider.offset.x, y: local.y - collider.offset.y }
        const magnitude = Math.hypot(relative.x / Math.max(collider.radiusX, 1e-9), relative.y / Math.max(collider.radiusY, 1e-9))
        if (magnitude > 0) {
          const virtualPos = { x: collider.offset.x + relative.x / magnitude, y: collider.offset.y + relative.y / magnitude }
          const point = localPointToWorld(ent, virtualPos, world.entities)
          if (Math.hypot(p.x - point.x, p.y - point.y) < threshold) { hoveredVertex = { entityId: ent.id, index: -1, target: 'collider', virtualPos }; document.body.style.cursor = 'crosshair'; return }
        }
      } else {
        let minDist = threshold; let foundIndex = -1
        for (let index = 0; index < collider.vertices.length; index++) {
          const point = localPointToWorld(ent, { x: collider.vertices[index].x + collider.offset.x, y: collider.vertices[index].y + collider.offset.y }, world.entities), distance = Math.hypot(p.x - point.x, p.y - point.y)
          if (distance < minDist) { minDist = distance; foundIndex = index }
        }
        if (foundIndex !== -1) { hoveredVertex = { entityId: ent.id, index: foundIndex, target: 'collider' }; document.body.style.cursor = 'crosshair'; return }
      }
    }
  } else if (ent instanceof BoxEntity || ent instanceof TriangleEntity) {
    let minDist = threshold; let foundIndex = -1
    for (let i = 0; i < ent.vertices.length; i++) {
      const point = localPointToWorld(ent, ent.vertices[i], world.entities)
      const vx = point.x; const vy = point.y
      const dist = Math.sqrt((p.x - vx)**2 + (p.y - vy)**2)
      if (dist < minDist) { minDist = dist; foundIndex = i }
    }
    if (foundIndex !== -1) { hoveredVertex = { entityId: ent.id, index: foundIndex, target: 'shape' }; document.body.style.cursor = 'crosshair'; return }
  } 
  else if (ent instanceof CircleEntity) {
    const local = worldPointToLocal(ent, p, world.entities)
    const localX = local.x; const localY = local.y
    const nx = localX / ent.radiusX; const ny = localY / ent.radiusY; const mag = Math.sqrt(nx * nx + ny * ny)
    if (mag > 0) {
      const ex = (nx / mag) * ent.radiusX; const ey = (ny / mag) * ent.radiusY
      const point = localPointToWorld(ent, { x: ex, y: ey }, world.entities)
      const wx = point.x; const wy = point.y
      const dist = Math.sqrt((p.x - wx)**2 + (p.y - wy)**2)
      if (dist < threshold) { hoveredVertex = { entityId: ent.id, index: -1, target: 'shape', virtualPos: { x: ex, y: ey } }; document.body.style.cursor = 'crosshair'; return }
    }
  }
  hoveredVertex = null; document.body.style.cursor = 'default'
}

/** 按绘制层级从前向后，用线段距离或多边形包含判断命中实体。 */ function hitTest(p: Vec2): number | null {
  const sourceOrder=new Map(world.entities.map(/* 返回按声明顺序构造的数组 [entity.id,index]。 */ (entity,index)=>[entity.id,index]))
  const ordered = [...world.entities].sort(/** 依次按层、层内顺序和原实体顺序排列命中候选。 */ (a, b) => a.layer - b.layer || a.renderer.orderInLayer - b.renderer.orderInLayer || (sourceOrder.get(a.id)??0) - (sourceOrder.get(b.id)??0))
  for (let i = ordered.length - 1; i >= 0; i--) {
    const e = ordered[i]
    const selectable = e.spriteRenderer || e.textRenderer || e.camera2D || e.hasComponent('ShapeRenderer2D') && e.renderer.enabled
    if (!e.enabled || e.hasComponent('RectTransform') || !selectable || !matchesSelectionFilter(e)) continue
    if (editorState.currentPage === 'scene' && (!e.editorVisible || e.editorLocked)) continue
    if (editorState.currentPage === 'scene' && e.layer !== editorState.activeLayer) continue;
    const polygon = editorBoundaryPoints(e, 64)
    if (e.renderer.shape === 'Line' && polygon.some(/* 先计算 index > 0；仅当其为真值时求右侧 distanceToSegment(p, polygon[index - 1], point) < 7 / camera.scale，返回短路求值结果。 */ (point, index) => index > 0 && distanceToSegment(p, polygon[index - 1], point) < 7 / camera.scale)) return e.id
    let inside = false
    for (let j = 0, k = polygon.length - 1; j < polygon.length; k = j++) {
      const a = polygon[j]; const b = polygon[k]
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside
    }
    if (inside) return e.id
  }
  return null
}

/** 按可见、未锁定、精灵、摄像机或物理类别判断实体是否可选。 */ function matchesSelectionFilter(entity: Entity): boolean {
  const filter = authoringState.selectionFilter
  return filter === 'All' || filter === 'Visible' && entity.editorVisible || filter === 'Unlocked' && !entity.editorLocked || filter === 'Sprites' && Boolean(entity.spriteRenderer) || filter === 'Cameras' && Boolean(entity.camera2D) || filter === 'Physics' && entity.hasComponent('RigidBody2D')
}

/** 在编辑视图绘制保持屏幕尺寸的变换手柄。 */ function renderTransformGizmo(context: CanvasRenderingContext2D) {
  if (editorState.currentPage !== 'scene' || state.playMode !== 'editing' || state.activeTool === 'select' || isDrawTool()) return
  const gizmo = currentGizmo()
  if (!gizmo) return
  const unit = 1 / camera.scale
  const xAxis = axisVector('x', gizmo.rotation)
  const yAxis = axisVector('y', gizmo.rotation)
  const endpoint = /** 由轴心沿指定轴计算固定屏幕长度的世界端点。 */ (axis: Vec2, length: number) => ({ x: gizmo.pivot.x + axis.x * length * unit, y: gizmo.pivot.y + axis.y * length * unit })
  const drawAxis = /** 绘制变换轴线及移动箭头或缩放方形端点。 */ (axis: Vec2, color: string) => {
    const start = endpoint(axis, 8); const end = endpoint(axis, 72)
    context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y)
    context.lineWidth = 2.4 * unit; context.strokeStyle = color; context.stroke()
    if (state.activeTool === 'move') {
      const perpendicular = { x: -axis.y, y: axis.x }
      context.beginPath(); context.moveTo(end.x, end.y)
      context.lineTo(end.x - axis.x * 11 * unit + perpendicular.x * 5 * unit, end.y - axis.y * 11 * unit + perpendicular.y * 5 * unit)
      context.lineTo(end.x - axis.x * 11 * unit - perpendicular.x * 5 * unit, end.y - axis.y * 11 * unit - perpendicular.y * 5 * unit)
      context.closePath(); context.fillStyle = color; context.fill()
    } else {
      context.fillStyle = color; context.fillRect(end.x - 5 * unit, end.y - 5 * unit, 10 * unit, 10 * unit)
    }
  }
  context.save(); context.lineCap = 'round'; context.lineJoin = 'round'
  if (state.activeTool === 'rotate') {
    context.beginPath(); context.arc(gizmo.pivot.x, gizmo.pivot.y, 52 * unit, 0, Math.PI * 2)
    context.lineWidth = 3 * unit; context.strokeStyle = palette.selection; context.stroke()
    const handle = endpoint(xAxis, 52)
    context.beginPath(); context.arc(handle.x, handle.y, 5 * unit, 0, Math.PI * 2); context.fillStyle = palette.selection; context.fill()
  } else {
    drawAxis(xAxis, palette.xAxis)
    drawAxis(yAxis, palette.yAxis)
    context.fillStyle = state.activeTool === 'scale' ? palette.selection : palette.canvas
    context.strokeStyle = palette.selection; context.lineWidth = 2 * unit
    context.fillRect(gizmo.pivot.x - 6 * unit, gizmo.pivot.y - 6 * unit, 12 * unit, 12 * unit)
    context.strokeRect(gizmo.pivot.x - 6 * unit, gizmo.pivot.y - 6 * unit, 12 * unit, 12 * unit)
  }
  context.restore()
}

/** 显示路径、碰撞或轴心控制点并突出悬停顶点。 */ function renderPointGizmo(context: CanvasRenderingContext2D) {
  if (!['path', 'polygon', 'collider', 'pivot'].includes(state.activeTool) || state.selectedEntityId === null) return
  const entity = world.entities.find(/* 比较 candidate.id 与 state.selectedEntityId，返回严格相等的判断结果。 */ candidate => candidate.id === state.selectedEntityId)
  if (!entity) return
  const unit = 1 / camera.scale
  let points: Vec2[] = []
  if (state.activeTool === 'path' || state.activeTool === 'polygon') points = entity.renderer.vertices.map(/* 调用 localPointToWorld(entity, point, world.entities) 并返回调用结果。 */ point => localPointToWorld(entity, point, world.entities))
  else if (state.activeTool === 'collider') {
    const collider = entity.getCollider()
    if (collider?.kind === 'EllipseCollider2D') points = [{ x: collider.offset.x + collider.radiusX, y: collider.offset.y }, { x: collider.offset.x, y: collider.offset.y + collider.radiusY }, { x: collider.offset.x - collider.radiusX, y: collider.offset.y }, { x: collider.offset.x, y: collider.offset.y - collider.radiusY }].map(/* 调用 localPointToWorld(entity, point, world.entities) 并返回调用结果。 */ point => localPointToWorld(entity, point, world.entities))
    else points = (collider?.vertices ?? []).map(/** 为局部碰撞顶点加上偏移后转换到世界空间。 */ point => localPointToWorld(entity, { x: point.x + (collider?.offset.x ?? 0), y: point.y + (collider?.offset.y ?? 0) }, world.entities))
  }
  else {
    const sprite = entity.spriteRenderer
    const local = sprite ? { x: (sprite.pivot.x - .5) * sprite.size.x, y: (sprite.pivot.y - .5) * sprite.size.y } : entity.authoring.origin
    points = [localPointToWorld(entity, local, world.entities)]
  }
  context.save()
  for (let index = 0; index < points.length; index++) {
    const point = points[index], active = hoveredVertex?.entityId === entity.id && hoveredVertex.index === index
    context.beginPath(); context.arc(point.x, point.y, (active ? 6 : 4.5) * unit, 0, Math.PI * 2)
    context.fillStyle = active ? palette.handle : '#ffffff'; context.fill()
    context.lineWidth = 2 * unit; context.strokeStyle = palette.selection; context.stroke()
  }
  context.restore()
}

/** 根据关闭、自定义分辨率或预设取得摄像机覆盖框比例。 */ function cameraAspectRatio(): number | null {
  if (authoringState.cameraOverlay === 'Off') return null
  if (authoringState.cameraOverlay === 'Custom') return Math.max(1, authoringState.cameraResolution.width) / Math.max(1, authoringState.cameraResolution.height)
  const [width, height] = authoringState.cameraOverlay.split(':').map(Number)
  return width / height
}

/** 绘制参考线、摄像机取景范围和测量距离覆盖层。 */ function renderAuthoringOverlays(context: CanvasRenderingContext2D, width: number, height: number) {
  const unit = 1 / camera.scale
  if (authoringState.guidesVisible) {
    const left = -camera.offset.x / camera.scale, right = left + width / camera.scale
    const top = camera.offset.y / camera.scale, bottom = top - height / camera.scale
    context.save(); context.strokeStyle = 'rgba(70, 171, 255, .9)'; context.lineWidth = unit; context.setLineDash([5 * unit, 3 * unit])
    for (const x of authoringState.guides.vertical) { context.beginPath(); context.moveTo(x, bottom); context.lineTo(x, top); context.stroke() }
    for (const y of authoringState.guides.horizontal) { context.beginPath(); context.moveTo(left, y); context.lineTo(right, y); context.stroke() }
    context.restore()
  }
  const aspect = cameraAspectRatio()
  if (aspect) {
    const availableWidth = Math.max(80, width - 56), availableHeight = Math.max(80, height - 56)
    const frameWidth = Math.min(availableWidth, availableHeight * aspect), frameHeight = frameWidth / aspect
    const left = (width - frameWidth) / 2, top = (height - frameHeight) / 2
    const first = camera.screenToWorld({ x: left, y: top }), second = camera.screenToWorld({ x: left + frameWidth, y: top + frameHeight })
    context.save(); context.strokeStyle = 'rgba(126,180,255,.82)'; context.lineWidth = 1.5 * unit; context.setLineDash([7 * unit, 5 * unit]); context.strokeRect(first.x, second.y, second.x - first.x, first.y - second.y); context.setLineDash([]); context.restore()
  }
  for (const entity of world.entities) {
    const cameraComponent = entity.camera2D
    if (!cameraComponent?.previewInEditor || entity.layer !== editorState.activeLayer) continue
    const transform = worldTransform(entity, world.entities), frameHeight = cameraComponent.orthographicSize * 2 / Math.max(cameraComponent.zoom, .0001), frameWidth = frameHeight * (aspect ?? 16 / 9)
    context.save(); context.strokeStyle = state.selectedEntityIds.includes(entity.id) ? palette.selection : 'rgba(111,170,255,.46)'; context.lineWidth = (state.selectedEntityIds.includes(entity.id) ? 2 : 1) * unit; context.strokeRect(transform.position.x - frameWidth / 2, transform.position.y - frameHeight / 2, frameWidth, frameHeight); context.restore()
  }
  const measurement = authoringState.measurement
  if (measurement.start && measurement.end) {
    const dx = measurement.end.x - measurement.start.x, dy = measurement.end.y - measurement.start.y, distance = Math.hypot(dx, dy)
    const middle = { x: (measurement.start.x + measurement.end.x) / 2, y: (measurement.start.y + measurement.end.y) / 2 }
    context.save(); context.strokeStyle = '#66d4b0'; context.fillStyle = '#66d4b0'; context.lineWidth = 2 * unit
    context.beginPath(); context.moveTo(measurement.start.x, measurement.start.y); context.lineTo(measurement.end.x, measurement.end.y); context.stroke()
    for (const point of [measurement.start, measurement.end]) { context.beginPath(); context.arc(point.x, point.y, 4 * unit, 0, Math.PI * 2); context.fill() }
    context.translate(middle.x, middle.y); context.scale(unit, -unit); context.font = '600 12px "JetBrains Mono Variable", "Noto Sans SC Variable", monospace'; context.textAlign = 'center'; context.fillText(`${distance.toFixed(3)} m  Δ ${dx.toFixed(3)}, ${dy.toFixed(3)}`, 0, -8); context.restore()
  }
}

let rulerPalette: { key: string; band: string; tick: string; text: string; edge: string } | null = null
/** Ruler colors follow the active theme tokens; resolved once per theme/palette/contrast change, never per frame. */
function rulerColors(): { band: string; tick: string; text: string; edge: string } {
  const root = document.documentElement
  const key = `${root.dataset.theme}|${root.dataset.palette}|${root.dataset.highContrast}|${root.dataset.reduceTransparency}`
  if (rulerPalette?.key === key) return rulerPalette
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
  document.body.appendChild(probe)
  const read = (token: string, fallback: string) => { probe.style.color = ''; probe.style.color = `var(${token}, ${fallback})`; return getComputedStyle(probe).color || fallback }
  rulerPalette = { key, band: read('--surface-panel', '#171e27'), tick: read('--border-strong', '#4b5563'), text: read('--text-muted', '#a8b3c2'), edge: read('--border-subtle', '#2b3442') }
  probe.remove()
  return rulerPalette
}

/** 按缩放选择刻度密度，在画布顶部与左侧绘制标尺。 */ function renderScreenRulers(context: CanvasRenderingContext2D, width: number, height: number): void {
  if (!authoringState.rulersVisible || editorState.currentPage === 'game') return
  const size = 20, step = Math.max(.000001, prefs.gridSize), worldLeft = -camera.offset.x / camera.scale, worldTop = camera.offset.y / camera.scale
  let tick = step
  while (tick * camera.scale < 56) tick *= 10
  if (tick * camera.scale > 280) tick /= 2
  const colors = rulerColors(), label = (value: number) => Number(value.toFixed(4)).toString()
  context.save(); context.globalAlpha = .94; context.fillStyle = colors.band; context.fillRect(0, 0, width, size); context.fillRect(0, 0, size, height); context.globalAlpha = 1
  context.fillStyle = colors.edge; context.fillRect(0, size - 1, width, 1); context.fillRect(size - 1, 0, 1, height)
  context.strokeStyle = colors.tick; context.fillStyle = colors.text; context.font = '500 10px "JetBrains Mono Variable", ui-monospace, monospace'; context.lineWidth = 1; context.textBaseline = 'middle'
  for (let value = Math.floor(worldLeft / tick) * tick; value <= worldLeft + width / camera.scale; value += tick) { const x = Math.round(camera.offset.x + value * camera.scale) + .5; if (x < size) continue; context.beginPath(); context.moveTo(x, size - 6); context.lineTo(x, size - 1); context.stroke(); context.fillText(label(value), x + 3, size / 2 - 1) }
  for (let value = Math.ceil((worldTop - height / camera.scale) / tick) * tick; value <= worldTop; value += tick) { const y = Math.round(camera.offset.y - value * camera.scale) + .5; if (y < size) continue; context.beginPath(); context.moveTo(size - 6, y); context.lineTo(size - 1, y); context.stroke(); context.save(); context.translate(size / 2 - 1, y - 3); context.rotate(-Math.PI / 2); context.fillText(label(value), 0, 0); context.restore() }
  context.fillStyle = colors.band; context.fillRect(0, 0, size, size)
  context.restore()
}

/** 物理调试：共用绘制（src/renderer/physicsDebugDraw.ts）；场景视图只画当前图层。 */ function drawPhysicsDebug(context: CanvasRenderingContext2D) {
  if (!physicsDebugState.enabled) return
  drawSharedPhysicsDebug(context, {
    entities: world.entities, connections: world.connections, events: world.events, layerColors: state.globalSettings.layers, pixelsPerUnit: camera.scale,
    include: entity => !(editorState.currentPage === 'scene' && entity.layer !== editorState.activeLayer)
  }, physicsDebugState)
}

/** Only a successful current Runtime caller may supply an input token; resize/manual redraws have none. */ function render(deltaSeconds = 0, consumedInputToken?: number) {
  if (!ctx || !canvasRef.value) return
  const desiredPixelRatio = desiredCanvasPixelRatio(canvasLogicalWidth, canvasLogicalHeight)
  if (Math.abs(desiredPixelRatio - canvasPixelRatio) > .001) resize(false)
  const cvs = canvasRef.value; const width = canvasLogicalWidth; const height = canvasLogicalHeight
  if (state.playMode === 'editing') resetCameraSmoothing()
  synchronizeRenderGraphDiagnosticsScope()
  const graphStarted = beginRenderGraph(renderGraphDiagnosticsOwner)
  let passStarted = graphStarted
  let worldSubmitted = false
  lastWorldSubmissionAt = null; lastWorldDeferred = false
  if (renderer) {
    const renderedStats = renderWorld(renderer, world.entities, {
      width, height, pixelRatio: canvasPixelRatio,
      deltaSeconds: state.playMode === 'playing' ? deltaSeconds * state.globalSettings.timeScale : 0,
      editorCamera: { scale: camera.scale, offset: { ...camera.offset } },
      gameView: editorState.currentPage === 'game', activeLayer: activeCanvasLayer(),
      renderLayer: editorState.currentPage === 'game' ? renderCanvasLayer() : activeCanvasLayer(),
      canvasColor: palette.canvas,
      connections: world.connections,
      editorGrid: { enabled: editorState.showGrid, step: prefs.gridSize, color: palette.grid },
      performanceMode: authoringState.performanceMode,
      lighting: { environment: lightingEnvironment }
    }, sceneRendererEnvironment)
    lightingOnGpu = renderedStats.lightingBackend === 'WebGL2'
    if (renderedStats.lightingBackend) { lightingStats.backend = renderedStats.lightingBackend; lightingStats.fallback = renderedStats.lightingFallbackReason ?? null; lightingStats.lights = renderedStats.lights ?? 0 }
    Object.assign(editorState.rendererStats, renderedStats)
    worldSubmitted = typeof renderedStats.cpuSubmissionAtMs === 'number' && Number.isFinite(renderedStats.cpuSubmissionAtMs)
    lastWorldDeferred = (renderedStats as { gpuSubmissionStatus?: string }).gpuSubmissionStatus === 'deferred'
    if (worldSubmitted) {
      lastWorldSubmissionAt = renderedStats.cpuSubmissionAtMs!
      const packet = markPerformanceSubmission(renderedStats.cpuSubmissionAtMs!, consumedInputToken)
      // 把已消费但尚未关联的输入绑定到本次提交。只有第一次绑定生效，
      // 因此后续提交不会被误当作该输入的响应（主指令 §26.4）。
      gameplayRuntime.bindConsumedInputToPacket(packet)
    }
  }
  passStarted = recordRenderPass('World', passStarted, worldSubmitted, worldSubmitted ? editorState.rendererStats.drawCalls : 0, renderGraphDiagnosticsOwner)
  if (!worldSubmitted) {
    for (const name of ['Lighting', 'PostProcess', 'EditorOverlay', 'UI'] as const) recordRenderPass(name, passStarted, false, 0, renderGraphDiagnosticsOwner)
    completeRenderGraph(graphStarted, editorState.rendererStats, passStarted, passStarted, renderGraphDiagnosticsOwner)
    editorState.rendererStats.passes = 0
    return
  }
  const nextWidth = Math.max(1, Math.round(width * canvasPixelRatio)), nextHeight = Math.max(1, Math.round(height * canvasPixelRatio))
  const resized = cvs.width !== nextWidth || cvs.height !== nextHeight
  if (resized) { cvs.width = nextWidth; cvs.height = nextHeight; overlayStats.resizes++ }
  const isGameView = editorState.currentPage === 'game'
  // 26.42 P-A: the Game view overlay is often empty (no light, post effect, debug view, UI or point gizmo).
  // Then it is cleared once after the last frame that drew and skipped afterwards; resizing (which also
  // covers DPR changes) clears the bitmap by itself. `?overlaySkip=0` restores the clear on every frame.
  if (overlaySkipEnabled && isGameView && !gameOverlayHasContent(world.entities) && !gameplayRuntime.screenFlashOverlay()) {
    // Assigning the backing-store size above already cleared the bitmap.
    if (resized) overlayDrewLastFrame = false
    if (overlayDrewLastFrame) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cvs.width, cvs.height); overlayDrewLastFrame = false; overlayStats.clears++ }
    else overlayStats.skipped++
    for (const name of ['Lighting', 'PostProcess', 'EditorOverlay', 'UI'] as const) passStarted = recordRenderPass(name, passStarted, false, 0, renderGraphDiagnosticsOwner)
    finishOverlayFrame(width, height, isGameView, graphStarted, passStarted)
    return
  }
  overlayDrewLastFrame = true
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  // Reset and clear in backing-store pixels. This prevents retained overlay
  // fragments when DPR, axes, scenes, or panel dimensions change together.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, cvs.width, cvs.height)
  overlayStats.clears++
  ctx.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0)
  // 26.42 P-D: with GPU lighting the light is already in the world surface; this Canvas 2D pass is the fallback.
  if (!lightingOnGpu) renderLighting2D(ctx, world.entities, {
    width, height, editorCamera: { scale: camera.scale, offset: { ...camera.offset } },
    gameView: isGameView, activeLayer: activeCanvasLayer()
  }, lightingEnvironment)
  passStarted = recordRenderPass('Lighting', passStarted, renderingSettings.lightingEnabled, 0, renderGraphDiagnosticsOwner)
  // The WebGL2 post shader already applies the vignette; only the Canvas 2D renderer needs it drawn here.
  if (rendererBackend.value !== 'WebGL2') renderPostProcessOverlay(ctx, width, height, lightingEnvironment)
  renderDebugView2D(ctx, world.entities, {
    width, height, editorCamera: { scale: camera.scale, offset: { ...camera.offset } },
    gameView: isGameView, activeLayer: activeCanvasLayer()
  }, lightingEnvironment)
  passStarted = recordRenderPass('PostProcess', passStarted, renderingSettings.postProcessing.enabled || renderingSettings.debugView !== 'None', 0, renderGraphDiagnosticsOwner)
  ctx.save(); ctx.translate(camera.offset.x, camera.offset.y); ctx.scale(camera.scale, -camera.scale) 
  const viewL = -camera.offset.x / camera.scale; const viewR = viewL + width / camera.scale
  const viewT = camera.offset.y / camera.scale; const viewB = viewT - height / camera.scale   

  const selectedIds = new Set(state.selectedEntityIds)

  if (!isGameView && tilemapEditorState.active) drawTilemapOverlay(ctx, { minX: viewL, maxX: viewR, minY: viewB, maxY: viewT })

  if (!isGameView && editorState.showGrid) {
    let step = Math.max(0.000001, prefs.gridSize)
    while (camera.scale * step < 8) step *= 10
    while ((viewR - viewL) / step + (viewT - viewB) / step > 1_024) step *= 10
    const startX = Math.floor(viewL / step) * step; const startY = Math.floor(viewB / step) * step
    const textStep = step * 10
    ctx.save(); ctx.scale(1, -1); ctx.fillStyle = palette.label; ctx.font = `${10 / camera.scale}px sans-serif`
    for (let x = startX; x < viewR; x += step) { if (editorState.showXAxis && x % textStep === 0 && x !== 0) ctx.fillText(x.toString(), x + 2, 12 / camera.scale) }
    for (let y = startY; y < viewT; y += step) { if (editorState.showYAxis && y % textStep === 0 && y !== 0) ctx.fillText(y.toString(), 4 / camera.scale, -y + 4 / camera.scale) }
    ctx.restore()
  }

  const lwNormal = 1 / camera.scale; const lwSelected = 3 / camera.scale
  const compounds = !isGameView && selectedIds.size > 0 && world.connections.some(/* 返回 connection.binding 的当前值。 */ connection => connection.binding)
    ? compoundGeometries(world.entities, world.connections)
    : []
  const compoundByMember = new Map<number, (typeof compounds)[number]>()
  for (const compound of compounds) for (const member of compound.members) compoundByMember.set(member.id, compound)
  for (const e of world.entities) {
    if (!e.enabled || !e.authoring.visible) continue
    if (e.hasComponent('RectTransform')) continue
    if (!isGameView && !e.editorVisible) continue
    if (editorState.currentPage === 'scene' && e.layer !== editorState.activeLayer) continue;
    const compound = compoundByMember.get(e.id)
    const isSelected = !isGameView && (compound ? [...compound.memberIds].some(/* 调用 selectedIds.has(id) 并返回调用结果。 */ id => selectedIds.has(id)) : selectedIds.has(e.id))
    if (!isSelected) continue
    const transform = worldTransform(e, world.entities)
    const pos = transform.position
    const selectionBoundary = editorBoundaryPoints(e, 48)
    const maxRadius = selectionBoundary.length ? Math.max(...selectionBoundary.map(/* 调用 Math.hypot(point.x - pos.x, point.y - pos.y) 并返回调用结果。 */ point => Math.hypot(point.x - pos.x, point.y - pos.y)), MIN_SIZE) : MIN_SIZE
    if (pos.x + maxRadius < viewL || pos.x - maxRadius > viewR || pos.y + maxRadius < viewB || pos.y - maxRadius > viewT) continue; 
    
    ctx.lineWidth = isSelected ? lwSelected : lwNormal
    ctx.fillStyle = palette.selectionFill
    ctx.strokeStyle = palette.selection
    
    ctx.beginPath()
    if (selectionBoundary.length) { ctx.moveTo(selectionBoundary[0].x, selectionBoundary[0].y); for (const point of selectionBoundary.slice(1)) ctx.lineTo(point.x, point.y); if (e.renderer.shape !== 'Line') ctx.closePath() }
    
    // Sprite selection stays as an outside-only outline so pixel art remains unobscured.
    if (!e.spriteRenderer) ctx.fill()
    if (!compound || compound.members.length === 1) ctx.stroke()

    if (prefs.showDiagnostics && isSelected && !isVertexDragging && !isDragging && hoveredVertex && hoveredVertex.entityId === e.id) {
      let vx = 0, vy = 0; const cosR = Math.cos(transform.rotation); const sinR = Math.sin(transform.rotation)
      if (e instanceof CircleEntity && hoveredVertex.virtualPos) {
        const localX = hoveredVertex.virtualPos.x * transform.scale.x; const localY = hoveredVertex.virtualPos.y * transform.scale.y
        vx = pos.x + (localX * cosR - localY * sinR); vy = pos.y + (localX * sinR + localY * cosR)
      } else if (e instanceof BoxEntity || e instanceof TriangleEntity) {
        const v = e.vertices[hoveredVertex.index]
        const localX = v.x * transform.scale.x; const localY = v.y * transform.scale.y
        vx = pos.x + (localX * cosR - localY * sinR); vy = pos.y + (localX * sinR + localY * cosR)
      }
      ctx.beginPath(); ctx.fillStyle = palette.handle; ctx.arc(vx, vy, 6 / camera.scale, 0, Math.PI * 2); ctx.fill()
    }
  }

  ctx.lineWidth = 2 / camera.scale
  if (!isGameView && editorState.showXAxis) { ctx.beginPath(); ctx.strokeStyle = palette.xAxis; ctx.moveTo(viewL, 0); ctx.lineTo(viewR, 0); ctx.stroke() }
  if (!isGameView && editorState.showYAxis) { ctx.beginPath(); ctx.strokeStyle = palette.yAxis; ctx.moveTo(0, viewT); ctx.lineTo(0, viewB); ctx.stroke() }
  if (!isGameView && prefs.showConnections) {
    for (const connection of world.connections) {
      if (connection.binding || !connectionSharesLayer(connection, world.entities)) continue
      const connectedLayer = world.entities.find(/* 比较 entity.id 与 connection.anchors[0]?.entityId，返回严格相等的判断结果。 */ entity => entity.id === connection.anchors[0]?.entityId)?.layer
      const visible = connectedLayer !== undefined && connectedLayer === editorState.activeLayer
      if (!visible) continue
      ctx.save()
      ctx.strokeStyle = connection.breakState === 'intact' ? palette.connection : palette.broken
      // A physical string is rendered at its collision diameter, so the grid and
      // canvas communicate the same real-world size used by the solver.
      ctx.lineWidth = connection.collisionEnabled
        ? Math.max(Math.max(2.5, prefs.connectionThickness) / camera.scale, connection.collisionRadius * 2)
        : Math.max(2.5, prefs.connectionThickness) / camera.scale
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.shadowColor = connection.breakState === 'intact' ? palette.connection : palette.broken
      ctx.shadowBlur = 5 / camera.scale
      if (connection.breakState !== 'intact') ctx.setLineDash([8 / camera.scale, 6 / camera.scale])
      for (const points of routePoints(connection, world.entities)) {
        if (points.length < 2) continue
        if (connection.collisionEnabled) strokeSmoothPath(ctx, points)
        else {
          ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y)
          if (connection.style === 'curved' && points.length === 3) ctx.quadraticCurveTo(points[1].x, points[1].y, points[2].x, points[2].y)
          else for (let index = 1; index < points.length; index++) ctx.lineTo(points[index].x, points[index].y)
          ctx.stroke()
        }
      }
      ctx.setLineDash([]); ctx.shadowBlur = 0
      for (const anchor of connection.anchors) {
        const point = resolveAnchor(anchor, world.entities)
        if (!point) continue
        ctx.beginPath(); ctx.arc(point.x, point.y, 6 / camera.scale, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'; ctx.fill()
        ctx.lineWidth = 2.5 / camera.scale; ctx.strokeStyle = palette.connection; ctx.stroke()
        ctx.beginPath(); ctx.arc(point.x, point.y, 1.8 / camera.scale, 0, Math.PI * 2)
        ctx.fillStyle = palette.connection; ctx.fill()
      }
      ctx.restore()
    }
  }

  for (const compound of compounds) {
    if (compound.members.length < 2 || compound.boundary.length === 0) continue
    const styleEntity = compound.members[0]
    const isSelected = !isGameView && [...compound.memberIds].some(/* 调用 selectedIds.has(id) 并返回调用结果。 */ id => selectedIds.has(id))
    const visible = isSelected && styleEntity.layer === editorState.activeLayer
    if (!visible) continue
    ctx.beginPath()
    for (const segment of compound.boundary) {
      ctx.moveTo(segment.start.x, segment.start.y)
      ctx.lineTo(segment.end.x, segment.end.y)
    }
    ctx.lineWidth = isSelected ? lwSelected : lwNormal
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.strokeStyle = palette.selection
    ctx.stroke()
  }
  renderTransformGizmo(ctx)
  renderPointGizmo(ctx)
  if (!isGameView) renderAuthoringOverlays(ctx, width, height)
  if (!isGameView && isDragging && canvasDragMode !== 'none' && dragStart && dragNow) {
    ctx.strokeStyle = palette.selection; ctx.lineWidth = 1 / camera.scale; ctx.setLineDash([5/camera.scale, 5/camera.scale])
    const x = Math.min(dragStart.x, dragNow.x), y = Math.min(dragStart.y, dragNow.y)
    const w = Math.abs(dragStart.x - dragNow.x), h = Math.abs(dragStart.y - dragNow.y)
    ctx.beginPath()
    if (canvasDragMode === 'marquee') { ctx.rect(x, y, w, h); ctx.fillStyle = palette.selectionFill; ctx.fill(); ctx.stroke() }
    else if (state.activeTool === 'rectangle') ctx.rect(x, y, w, h)
    else if (state.activeTool === 'circle') ctx.ellipse(x+w/2, y+h/2, w/2, h/2, 0, 0, Math.PI*2) 
    else if (state.activeTool === 'triangle') { 
      ctx.save(); ctx.translate(x + w / 2, y + h / 2)
      ctx.moveTo(0, h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(-w / 2, -h / 2); ctx.closePath(); ctx.stroke(); ctx.restore()
    }
    if (canvasDragMode === 'draw' && state.activeTool !== 'triangle') ctx.stroke()
    ctx.setLineDash([])
  }
  if (!isGameView && editorState.manualConnectionId !== null && editorState.manualConnectionPoints.length > 1) {
    ctx.beginPath(); ctx.moveTo(editorState.manualConnectionPoints[0].x, editorState.manualConnectionPoints[0].y)
    for (let index = 1; index < editorState.manualConnectionPoints.length; index++) ctx.lineTo(editorState.manualConnectionPoints[index].x, editorState.manualConnectionPoints[index].y)
    ctx.strokeStyle = palette.connection; ctx.lineWidth = prefs.connectionThickness / camera.scale; ctx.lineCap = 'round'; ctx.stroke()
  }
  drawPhysicsDebug(ctx)
  drawWorldGameplayDebug(ctx)
  ctx.restore()
  passStarted = recordRenderPass('EditorOverlay', passStarted, !isGameView, 1, renderGraphDiagnosticsOwner)
  finishOverlayFrame(width, height, isGameView, graphStarted, passStarted)
}

let overlayDrewLastFrame = true
/** 26.42 P-D: lighting drawn by the WebGL2 renderer this frame; the backend of the current world renderer. */
let lightingOnGpu = false
const rendererBackend = ref<'WebGL2' | 'Canvas2D' | null>(null)
/** Read by verify-2642-lighting and the latency probe (globalThis.__novaLighting); mutated in place, no per-frame allocation. */
const lightingStats: { backend: string; fallback: string | null; lights: number } = { backend: 'Off', fallback: null, lights: 0 }
if (!props.runtime) (globalThis as { __novaLighting?: typeof lightingStats }).__novaLighting = lightingStats
/** The WebGL2 renderer applies exposure, contrast, saturation, blur and bloom in its post shader; a CSS filter on top applied them twice. */
function renderCanvasFilter(): string { return rendererBackend.value === 'WebGL2' ? 'none' : worldPostProcessFilter(lightingEnvironment) }
/** P-A 计数（clears = 整屏清空次数，skipped = 跳过的帧，resizes = 尺寸或 DPR 变化，这类清空不计入预算）；verify-2642-glass-budget 与延迟探针读取 globalThis.__novaOverlayStats。 */
const overlayStats = { clears: 0, skipped: 0, resizes: 0 }
if (!props.runtime) (globalThis as { __novaOverlayStats?: typeof overlayStats }).__novaOverlayStats = overlayStats
const overlaySkipEnabled = typeof location === 'undefined' || new URLSearchParams(location.search).get('overlaySkip') !== '0'
/** 26.42 P-A：游戏视图本帧是否有任何叠加内容（光照、后处理、调试视图、游戏 UI 或点编辑手柄）。判断偏保守：拿不准就视为有内容。 */
function gameOverlayHasContent(entities: readonly Entity[]): boolean {
  const settings = lightingEnvironment.settings
  if ((settings.lightingEnabled && !lightingOnGpu) || settings.debugView !== 'None') return true
  if (settings.postProcessing.enabled && rendererBackend.value !== 'WebGL2') return true
  if (['path', 'polygon', 'collider', 'pivot'].includes(state.activeTool) && state.selectedEntityId !== null) return true
  for (const entity of entities) if (entity.hasComponent('RectTransform')) return true
  return false
}
/** 叠加层收尾：解析游戏 UI（输入命中依赖它）、无障碍节点、渲染图统计和渲染纹理捕获；跳过帧与绘制帧共用。 */
function finishOverlayFrame(width: number, height: number, isGameView: boolean, graphStarted: number, passStarted: number): void {
  if (!ctx) return
  const selectedIds = new Set(state.selectedEntityIds)
  const uiEntities = isGameView ? world.entities : world.entities.filter(/* 比较 entity.layer 与 editorState.activeLayer，返回严格相等的判断结果。 */ entity => entity.layer === editorState.activeLayer)
  // 26.45: screen_flash covers the game view under the HUD.
  if (isGameView) renderScreenFlash(ctx, width, height, gameplayRuntime.screenFlashOverlay())
  gameUiRuntime.render(ctx, width, height, uiEntities, { editor: !isGameView, selectedEntityIds: selectedIds })
  renderScreenRulers(ctx, width, height)
  const nodes = isGameView ? gameUiRuntime.accessibilityNodes() : []
  const nextAccessibilitySignature = JSON.stringify(nodes)
  if (nextAccessibilitySignature !== accessibilitySignature) { accessibilitySignature = nextAccessibilitySignature; accessibilityNodes.value = nodes }
  recordRenderPass('UI', passStarted, true, uiEntities.length ? 1 : 0, renderGraphDiagnosticsOwner)
  completeRenderGraph(graphStarted, editorState.rendererStats, passStarted, passStarted, renderGraphDiagnosticsOwner)
  editorState.rendererStats.passes = 5
  if (renderCanvasRef.value) {
    captureRenderSurface(renderCanvasRef.value, canvasRef.value, renderCanvasFilter())
    const renderTextureCameras = isGameView ? activeGameCameras(world.entities, width, height).filter(/* 返回 camera.component.renderTexture 的当前值。 */ camera => camera.component.renderTexture) : []
    editorState.rendererStats.renderTargets += new Set(renderTextureCameras.map(/* 返回 camera.component.renderTexture 的当前值。 */ camera => camera.component.renderTexture)).size
    for (const activeCamera of renderTextureCameras) {
      if (activeCamera.component.renderTexture) captureRenderTexture(activeCamera.component.renderTexture, renderCanvasRef.value, activeCamera.component.viewport, renderGraphState.frame)
    }
  }
  if (isGameView && (runtimeCaptions.length || visibleCaptions.value.length)) captionTick.value++
}

/** 在世界位置绘制保持屏幕字号的调试标签及背景。 */ function drawWorldDebugLabel(context: CanvasRenderingContext2D, point: Vec2, text: string, color: string, yOffset = 0): void {
  context.save(); context.translate(point.x, point.y); context.scale(1 / camera.scale, -1 / camera.scale)
  context.font = '500 11px ui-rounded, "SF Pro Rounded", system-ui, sans-serif'; context.textBaseline = 'middle'
  const width = Math.min(320, context.measureText(text).width + 10), y = -14 - yOffset
  context.fillStyle = 'rgba(10, 15, 23, .82)'; context.fillRect(-2, y - 9, width, 18)
  context.fillStyle = color; context.fillText(text, 3, y)
  context.restore()
}

/** 绘制具有最大屏幕长度限制的向量箭头，忽略近零向量。 */ function drawWorldDebugVector(context: CanvasRenderingContext2D, start: Vec2, vector: Vec2, color: string): void {
  const length = Math.hypot(vector.x, vector.y); if (length <= 1e-9) return
  const maximum = 64 / camera.scale, scale = Math.min(maximum / length, 1), end = { x: start.x + vector.x * scale, y: start.y + vector.y * scale }
  const angle = Math.atan2(end.y - start.y, end.x - start.x), head = 6 / camera.scale
  context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.lineTo(end.x - Math.cos(angle - .55) * head, end.y - Math.sin(angle - .55) * head); context.moveTo(end.x, end.y); context.lineTo(end.x - Math.cos(angle + .55) * head, end.y - Math.sin(angle + .55) * head)
  context.strokeStyle = color; context.stroke()
}

/** 按开关绘制导航、人工智能、模拟、区域和分块信息，并限制调试标签数量。 */ function drawWorldGameplayDebug(context: CanvasRenderingContext2D): void {
  if (!worldGameplayState.navigationDebug && !worldGameplayState.aiDebug && !worldGameplayState.simulationDebug && !worldGameplayState.areaDebug && !worldGameplayState.chunkDebug) return
  context.save(); context.lineWidth = 2 / camera.scale
  if (worldGameplayState.navigationDebug) {
    context.strokeStyle = '#5ea6ff'; context.fillStyle = '#5ea6ff'
    for (const path of navigationPaths()) {
      if (!path.points.length) continue
      context.beginPath(); context.moveTo(path.points[0].x, path.points[0].y); path.points.slice(1).forEach(/* 调用 context.lineTo(point.x, point.y) 并返回调用结果。 */ point => context.lineTo(point.x, point.y)); context.stroke()
      for (const point of path.points) { context.beginPath(); context.arc(point.x, point.y, 2.5 / camera.scale, 0, Math.PI * 2); context.fill() }
    }
  }
  const aiByEntity = worldGameplayState.aiDebug ? new Map(aiDebugState.agents.map(/* 返回按声明顺序构造的数组 [item.entityUuid, item]。 */ item => [item.entityUuid, item])) : null
  const machineByEntity = worldGameplayState.aiDebug ? new Map(aiDebugState.machines.map(/* 返回按声明顺序构造的数组 [item.entityUuid, item]。 */ item => [item.entityUuid, item])) : null
  let aiLabels = 0, simulationLabels = 0
  for (const entity of world.entities) {
    if (!entity.enabled || (editorState.currentPage === 'scene' && entity.layer !== editorState.activeLayer)) continue
    const transform = worldTransform(entity, world.entities)
    if (worldGameplayState.aiDebug && aiLabels < 512) {
      const behavior = entity.getComponent<import('../world/components').BehaviorTree2D>('BehaviorTree2D'), machine = entity.getComponent<import('../world/components').StateMachine2D>('StateMachine2D'), agent = entity.getComponent<import('../world/components').NavigationAgent2D>('NavigationAgent2D')
      const behaviorDebug = aiByEntity?.get(entity.uuid), machineDebug = machineByEntity?.get(entity.uuid)
      if (behavior?.enabled || machine?.enabled || agent?.enabled) {
        if (agent?.enabled) {
          const target = agent.targetEntityUuid ? world.entities.find(/* 比较 candidate.uuid 与 agent.targetEntityUuid，返回严格相等的判断结果。 */ candidate => candidate.uuid === agent.targetEntityUuid) : null
          const targetPoint = target ? worldTransform(target, world.entities).position : agent.targetPosition
          context.save(); context.setLineDash([5 / camera.scale, 4 / camera.scale]); context.strokeStyle = '#77c8ff'; context.beginPath(); context.moveTo(transform.position.x, transform.position.y); context.lineTo(targetPoint.x, targetPoint.y); context.stroke(); context.setLineDash([]); drawWorldDebugVector(context, transform.position, agent.velocity, '#52e0bb'); context.restore()
        }
        const active = machineDebug?.activeState || machine?.currentState || behaviorDebug?.activeNode || behavior?.currentNode || 'idle'
        const perceived = behaviorDebug ? ` · seen ${behaviorDebug.perceived}` : ''
        drawWorldDebugLabel(context, transform.position, `${entity.name} · ${active}${perceived}`, '#8bd5ff', 18)
        aiLabels++
      }
    }
    if (worldGameplayState.simulationDebug && simulationLabels < 512 && entity.hasComponent('RigidBody2D')) {
      const speed = Math.hypot(entity.velocity.x, entity.velocity.y), angular = entity.angularVelocity
      drawWorldDebugLabel(context, transform.position, `${entity.name} · ${speed.toFixed(2)} ${PHYSICS_UNITS.speed} · ω ${angular.toFixed(2)} rad/s · ${entity.rigidBody.mass.toFixed(2)} ${PHYSICS_UNITS.mass}`, entity.rigidBody.sleeping ? '#87a8d6' : '#a8f0c6')
      simulationLabels++
    }
    const area = entity.getComponent<import('../world/components').Area2D>('Area2D')
    if (worldGameplayState.areaDebug && area?.enabled) {
      context.setLineDash([6 / camera.scale, 4 / camera.scale]); context.strokeStyle = '#65d6b4'
      context.beginPath()
      if (area.shape === 'Circle') context.arc(transform.position.x, transform.position.y, area.radius, 0, Math.PI * 2)
      else context.rect(transform.position.x - area.size.x / 2, transform.position.y - area.size.y / 2, area.size.x, area.size.y)
      context.stroke(); context.setLineDash([])
    }
    const chunk = entity.getComponent<import('../world/components').WorldChunk2D>('WorldChunk2D')
    if (worldGameplayState.chunkDebug && chunk?.enabled) {
      const snapshot = worldStreamingState.cells.find(/* 比较 cell.entityUuid 与 entity.uuid，返回严格相等的判断结果。 */ cell => cell.entityUuid === entity.uuid), status = snapshot?.status ?? (chunk.initiallyLoaded ? 'Active' : 'Unloaded')
      const active = status === 'Active', pending = ['Loading', 'Activating', 'Deactivating', 'Unloading'].includes(status)
      context.strokeStyle = active ? '#63d6a3' : pending ? '#ffd166' : '#c28cff'; context.fillStyle = active ? 'rgba(99,214,163,.08)' : pending ? 'rgba(255,209,102,.08)' : 'rgba(194,140,255,.06)'
      context.setLineDash(pending ? [5 / camera.scale, 4 / camera.scale] : []); context.fillRect(transform.position.x - chunk.size.x / 2, transform.position.y - chunk.size.y / 2, chunk.size.x, chunk.size.y); context.strokeRect(transform.position.x - chunk.size.x / 2, transform.position.y - chunk.size.y / 2, chunk.size.x, chunk.size.y); context.setLineDash([])
      drawWorldDebugLabel(context, { x: transform.position.x - chunk.size.x / 2, y: transform.position.y + chunk.size.y / 2 }, `${chunk.ownership || entity.name} · ${status}`, context.strokeStyle as string)
    }
  }
  if (worldGameplayState.simulationDebug) {
    for (const connection of world.connections.slice(0, 256)) {
      if (!connection.enabled) continue
      const paths = routePoints(connection, world.entities), points = paths[0]
      if (!points?.length) continue
      const midpoint = points[Math.floor(points.length / 2)]
      drawWorldDebugLabel(context, midpoint, `${connection.name} · ${connection.tension.toFixed(2)} ${PHYSICS_UNITS.force} · ${(connection.strain * 100).toFixed(1)}% · ${connection.breakState}`, connection.breakState === 'intact' ? '#ffd37d' : '#ff7b86', 36)
    }
  }
  context.restore()
}

/** 转换可见范围到瓦片局部空间，按缩放抽稀网格并绘制选区或悬停单元。 */ function drawTilemapOverlay(context: CanvasRenderingContext2D, view: { minX: number; maxX: number; minY: number; maxY: number }) {
  const entity = world.entities.find(/* 比较 candidate.uuid 与 tilemapEditorState.selectedEntityUuid，返回严格相等的判断结果。 */ candidate => candidate.uuid === tilemapEditorState.selectedEntityUuid)
  const component = entity?.getComponent<TileMap2D>('TileMap2D')
  if (!entity || !component) return
  const halfWidth = component.width * component.tileSize.x * .5
  const halfHeight = component.height * component.tileSize.y * .5
  context.save()
  context.strokeStyle = palette.selection
  context.globalAlpha = .34
  context.lineWidth = 1 / camera.scale
  const localView = [
    worldPointToLocal(entity, { x: view.minX, y: view.minY }, world.entities),
    worldPointToLocal(entity, { x: view.maxX, y: view.minY }, world.entities),
    worldPointToLocal(entity, { x: view.maxX, y: view.maxY }, world.entities),
    worldPointToLocal(entity, { x: view.minX, y: view.maxY }, world.entities)
  ]
  const minimumLocalX = Math.min(...localView.map(/* 返回 point.x 的当前值。 */ point => point.x)), maximumLocalX = Math.max(...localView.map(/* 返回 point.x 的当前值。 */ point => point.x))
  const minimumLocalY = Math.min(...localView.map(/* 返回 point.y 的当前值。 */ point => point.y)), maximumLocalY = Math.max(...localView.map(/* 返回 point.y 的当前值。 */ point => point.y))
  const firstX = Math.max(0, Math.floor((minimumLocalX + halfWidth) / component.tileSize.x))
  const lastX = Math.min(component.width, Math.ceil((maximumLocalX + halfWidth) / component.tileSize.x))
  const firstY = Math.max(0, Math.floor((minimumLocalY + halfHeight) / component.tileSize.y))
  const lastY = Math.min(component.height, Math.ceil((maximumLocalY + halfHeight) / component.tileSize.y))
  const transform = worldTransform(entity, world.entities)
  const stepX = Math.max(1, Math.ceil(7 / Math.max(1e-9, camera.scale * component.tileSize.x * Math.abs(transform.scale.x))))
  const stepY = Math.max(1, Math.ceil(7 / Math.max(1e-9, camera.scale * component.tileSize.y * Math.abs(transform.scale.y))))
  for (let x = firstX; x <= lastX; x += stepX) {
    const localX = x * component.tileSize.x - halfWidth
    const start = localPointToWorld(entity, { x: localX, y: -halfHeight }, world.entities)
    const end = localPointToWorld(entity, { x: localX, y: halfHeight }, world.entities)
    context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke()
  }
  for (let y = firstY; y <= lastY; y += stepY) {
    const localY = y * component.tileSize.y - halfHeight
    const start = localPointToWorld(entity, { x: -halfWidth, y: localY }, world.entities)
    const end = localPointToWorld(entity, { x: halfWidth, y: localY }, world.entities)
    context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke()
  }
  const selection = tilemapEditorState.selection
  const cells = selection ? [selection.start, selection.end] : tileHover ? [tileHover, tileHover] : null
  if (cells) {
    const left = Math.min(cells[0].x, cells[1].x), right = Math.max(cells[0].x, cells[1].x) + 1
    const bottom = Math.min(cells[0].y, cells[1].y), top = Math.max(cells[0].y, cells[1].y) + 1
    const corners = [
      { x: left * component.tileSize.x - halfWidth, y: bottom * component.tileSize.y - halfHeight },
      { x: right * component.tileSize.x - halfWidth, y: bottom * component.tileSize.y - halfHeight },
      { x: right * component.tileSize.x - halfWidth, y: top * component.tileSize.y - halfHeight },
      { x: left * component.tileSize.x - halfWidth, y: top * component.tileSize.y - halfHeight }
    ].map(/* 调用 localPointToWorld(entity, point, world.entities) 并返回调用结果。 */ point => localPointToWorld(entity, point, world.entities))
    context.beginPath(); context.moveTo(corners[0].x, corners[0].y); corners.slice(1).forEach(/* 调用 context.lineTo(point.x, point.y) 并返回调用结果。 */ point => context.lineTo(point.x, point.y)); context.closePath()
    context.globalAlpha = .22; context.fillStyle = palette.selection; context.fill()
    context.globalAlpha = 1; context.lineWidth = 2 / camera.scale; context.stroke()
  }
  context.restore()
}
</script>

<template>
  <div ref="gameSurfaceRef" class="canvas-container" @dragover="onAssetDragOver" @drop="onAssetDrop">
    <canvas :key="renderCanvasKey" ref="renderCanvasRef" class="render-canvas" :style="{ filter: renderCanvasFilter() }" aria-hidden="true" />
    <canvas ref="canvasRef" class="overlay-canvas" data-game-input-surface tabindex="0" :aria-label="editorState.currentPage === 'game' ? t('game') : t('scene')" @touchstart="touchPointer !== null && $event.stopPropagation()" @touchmove="touchPointer !== null && $event.stopPropagation()" @pointerdown="onUiPointerDown" @pointermove="onUiPointerMove" @pointerup="onUiPointerUp" @pointercancel="onUiPointerCancel" @lostpointercapture="onUiPointerCancel" @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @dblclick="onDoubleClick" @wheel="onWheel" @contextmenu.prevent />
    <VirtualControlsOverlay v-if="editorState.currentPage === 'game'" :runtime="gameplayRuntime" :world="gameplayRuntime.presentation.world" :input-actions="state.inputMap" />
    <div v-if="editorState.currentPage === 'game' && accessibilityNodes.length" class="game-ui-a11y" aria-label="Game UI">
      <div
        v-for="node in accessibilityNodes"
        :key="node.uuid"
        class="game-ui-a11y-node" data-game-ui-control :data-ui-uuid="node.uuid"
        :style="{ left: `${node.rect.x}px`, top: `${node.rect.y}px`, width: `${node.rect.width}px`, height: `${node.rect.height}px` }"
        :role="node.role"
        :aria-label="node.label"
        :aria-valuemin="node.valueMin"
        :aria-valuemax="node.valueMax"
        :aria-valuenow="node.valueNow"
        :aria-checked="node.checked"
        :aria-description="node.description || undefined"
        :aria-valuetext="node.value || undefined"
        :aria-live="node.live"
        :data-accessibility-state="node.state || undefined"
        :aria-disabled="node.disabled"
        :aria-current="node.focused ? 'true' : undefined"
        :tabindex="node.disabled ? -1 : node.tabIndex"
        @focus="onAccessibleFocus(node.uuid)" @click="onAccessibleActivate(node.uuid, $event)"
      ></div>
    </div>
    <div v-if="editorState.currentPage === 'game' && (runtimeAccessibilitySettings.subtitles && timelinePresentationState.subtitles.length || visibleCaptions.length)" class="timeline-subtitles" :class="{ 'caption-transparent': !runtimeAccessibilitySettings.captionBackground }" :style="{ '--caption-scale': runtimeAccessibilitySettings.captionScale }" aria-live="polite" aria-atomic="false">
      <p v-for="subtitle in (runtimeAccessibilitySettings.subtitles ? timelinePresentationState.subtitles : [])" :key="`${subtitle.ownerUuid}:${subtitle.clipId}`" :class="`safe-${subtitle.safeArea}`" :lang="subtitle.locale || undefined">{{ subtitle.text }}</p>
      <p v-for="caption in visibleCaptions" :key="caption.id" class="safe-TitleSafe">{{ caption.speaker ? `${caption.speaker}: ` : '' }}{{ caption.text }}</p>
    </div>
    <input
      v-if="focusedUiInput && editorState.currentPage === 'game'"
      ref="nativeInputRef"
      class="native-ui-input" data-game-ui-control :lang="gameUiRuntime.focusedTextInputLocale() || undefined" :dir="activeTextDirection(gameUiRuntime.focusedTextInputLocale())"
      :aria-label="focusedUiInput.entity.getComponent<RectTransform>('RectTransform')?.accessibilityLabel || focusedUiInput.entity.name"
      :style="nativeInputStyle()"
      :type="focusedUiInput.input.password ? 'password' : 'text'"
      :placeholder="gameUiRuntime.focusedTextInputPlaceholder()"
      :maxlength="Math.max(0, focusedUiInput.input.maxLength)"
      @input="onNativeInput"
      @compositionstart="inputBridge.compositionStart()"
      @compositionend="onCompositionEnd"
      @keydown="onNativeKey"
      @blur="closeNativeInput"
    >
  </div>
</template>

<style scoped>
.canvas-container { position: relative; width: 100%; height: 100%; overflow: hidden; contain: strict; isolation: isolate; }
canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; touch-action: none; }
.render-canvas { z-index: 0; pointer-events: none; image-rendering: auto; }
.overlay-canvas { z-index: 1; image-rendering: auto; }
.native-ui-input { position: absolute; z-index: 8; min-width: 0; min-height: 0; padding: 0 12px; border: 2px solid #4f96ff; border-radius: 8px; outline: 0; color: #f5f7fb; background: #151b24; box-shadow: 0 0 0 3px rgba(79,150,255,.18); font: 500 16px/1.2 var(--font-ui); }
.game-ui-a11y { position: absolute; inset: 0; z-index: 7; pointer-events: none; }
.game-ui-a11y-node { position: absolute; overflow: hidden; opacity: .001; pointer-events: none; }
.timeline-subtitles { position: absolute; inset: 0; z-index: 9; pointer-events: none; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
.timeline-subtitles p { max-width: min(80%, 860px); margin: 0 10% 7%; padding: 8px 14px; border: 1px solid rgba(255,255,255,.22); border-radius: 10px; color: #fff; background: rgba(5,8,13,.78); box-shadow: 0 5px 20px rgba(0,0,0,.28); font: 650 calc(clamp(16px,2.15vw,28px) * var(--caption-scale, 1))/1.35 var(--font-ui); text-align: center; text-wrap: balance; }
.timeline-subtitles p.safe-TitleSafe { max-width: min(80%, 860px); margin-right: 10%; margin-left: 10%; margin-bottom: 7%; }
.timeline-subtitles p.safe-ActionSafe { max-width: 90%; margin-right: 5%; margin-left: 5%; margin-bottom: 4%; }
.timeline-subtitles p.safe-FullFrame { max-width: 96%; margin-right: 2%; margin-left: 2%; margin-bottom: 2%; }
.timeline-subtitles.caption-transparent p { background: transparent; border-color: transparent; box-shadow: none; text-shadow: 0 1px 3px #000, 0 -1px 3px #000; }
.overlay-canvas:focus-visible { outline: 2px solid var(--accent, #79b2ff); outline-offset: -2px; }
</style>

