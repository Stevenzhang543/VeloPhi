/** 场景绘制编排：把当前场景、相机及可绘制组件转换为渲染后端提交的绘制命令。 */
import { cssFontStack } from './fontStack'
import { buildGpuLighting } from './lighting2dGpu'
import type { LightingEnvironment } from './LightingEnvironment'
import { compoundGeometries } from '../world/compoundGeometry'
import type { Connection } from '../world/Connection'
import type { Camera2D, ParticleEmitter2D, RhythmChart2D, ShapeRenderer2D, SpriteRenderer2D, TextRenderer2D, TileMap2D } from '../world/components'
import { submitRhythmChart } from './rhythmRenderer'
import { rhythmFrame } from './rhythmFrames'
import type { Entity } from '../world/Entity'
import { worldTransform, worldTransformsFor, type WorldTransform2D } from '../world/hierarchy'
import type { CameraRenderView, RenderColor, Renderer2D, RendererStats } from './types'
import { canvasMaterialColor, resolveMaterial } from './materials'
import type { TextureFilter } from './types'
import { resolveSceneRendererEnvironment, sceneRenderingSettings, type SceneRendererEnvironment } from './SceneRendererEnvironment'
import { cameraViewportHalfExtents, visibleWorldBounds } from './cameraMath'
import { renderBoundsIntersect, transformedRenderBounds, type RenderBounds2D } from './visibilityBounds'

export { gameScreenToWorld, visibleWorldBounds } from './cameraMath'

export interface SceneRenderOptions {
  width: number
  height: number
  pixelRatio: number
  editorCamera: CameraRenderView
  gameView: boolean
  activeLayer: number
  renderLayer: number | 'all'
  canvasColor: string
  connections: Connection[]
  editorGrid?: { enabled: boolean; step: number; color: string }
  performanceMode?: boolean
  /** One explicit clock advance; camera queries and lighting never advance it. */
  deltaSeconds?: number
  /** 26.42 P-D: draw 2D lighting on the GPU when the renderer supports it; the result is reported in stats.lightingBackend. */
  lighting?: { environment: LightingEnvironment }
}

export interface ActiveCamera {
  entity: Entity
  component: Camera2D
  view: CameraRenderView
  background: RenderColor
}

/* 调用 Math.min(255, Math.max(0, Number.isFinite(value) ? value : 0)) 并返回调用结果。 */ function byte(value: number): number { return Math.min(255, Math.max(0, Number.isFinite(value) ? value : 0)) }
/* 根据 Number.isFinite(value) 的真假，分别返回 value 或 fallback。 */ function finite(value: number, fallback: number): number { return Number.isFinite(value) ? value : fallback }
/* 将相机视口限制到有效的归一化矩形，异常数值使用默认值。 */
function safeViewport(viewport: Camera2D['viewport']): Camera2D['viewport'] {
  const x = Math.min(1 - 1e-6, Math.max(0, finite(viewport?.x, 0)))
  const y = Math.min(1 - 1e-6, Math.max(0, finite(viewport?.y, 0)))
  return {
    x, y,
    width: Math.max(.000001, Math.min(1 - x, finite(viewport?.width, 1))),
    height: Math.max(.000001, Math.min(1 - y, finite(viewport?.height, 1)))
  }
}
/* 返回具有所列字段的新对象 { r: byte(color.r), g: byte(color.g), b: byte(color.b), a: Math.min(1, Math.max(0, opacity / 100)) }。 */ function rgba(color: { r: number; g: number; b: number }, opacity = 100): RenderColor {
  return { r: byte(color.r), g: byte(color.g), b: byte(color.b), a: Math.min(1, Math.max(0, opacity / 100)) }
}
/* 解析 rgb/rgba 或六位十六进制颜色，无法识别时使用默认背景色。 */
function parseCssColor(value: string): RenderColor {
  const match = value.match(/rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+))?\s*\)/i)
  if (match) return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4]) }
  const hex = value.trim().replace('#', '')
  if (/^[\da-f]{6}$/i.test(hex)) return { r: Number.parseInt(hex.slice(0, 2), 16), g: Number.parseInt(hex.slice(2, 4), 16), b: Number.parseInt(hex.slice(4, 6), 16), a: 1 }
  return { r: 17, g: 21, b: 27, a: 1 }
}

let smoothedCameraPositions = new WeakMap<Camera2D, { x: number; y: number }>()
// 26.45: render time of each shaking camera (the noise is sampled along it).
let cameraShakeClocks = new WeakMap<Camera2D, number>()
/** Smooth value noise in [-1, 1] along `x` (one lattice value per integer, cosine blend). */
function shakeNoise(seed: number, x: number): number {
  const lattice = (index: number) => { let hash = Math.imul(index ^ Math.imul(seed, 0x9e3779b1), 0x85ebca6b); hash ^= hash >>> 13; hash = Math.imul(hash, 0xc2b2ae35); hash ^= hash >>> 16; return (hash >>> 0) / 0xffff_ffff * 2 - 1 }
  const floor = Math.floor(x), t = (1 - Math.cos((x - floor) * Math.PI)) * .5
  return lattice(floor) * (1 - t) + lattice(floor + 1) * t
}
/** 26.45: the offset and turn a camera's shake adds to its view now. */
export function cameraShakeOffset(component: Camera2D, deltaSeconds = 0): { x: number; y: number; rotation: number } {
  const trauma = Math.min(1, Math.max(0, finite(component.trauma ?? 0, 0)))
  if (trauma <= 0) { cameraShakeClocks.delete(component); return { x: 0, y: 0, rotation: 0 } }
  const time = (cameraShakeClocks.get(component) ?? 0) + Math.max(0, finite(deltaSeconds, 0))
  cameraShakeClocks.set(component, time)
  const shake = component.shake ?? { maxOffset: .5, maxAngle: 3, frequency: 18, recovery: 1.5 }
  const amount = trauma * trauma, phase = time * Math.max(0, finite(shake.frequency, 18))
  return { x: finite(shake.maxOffset, .5) * amount * shakeNoise(1, phase), y: finite(shake.maxOffset, .5) * amount * shakeNoise(2, phase), rotation: finite(shake.maxAngle, 3) * Math.PI / 180 * amount * shakeNoise(3, phase) }
}
/** 将 new WeakMap() 赋给 smoothedCameraPositions，不显式返回值。 */ export function resetCameraSmoothing(): void { smoothedCameraPositions = new WeakMap(); cameraShakeClocks = new WeakMap() }
interface TimelineCameraBlendOverride { fromEntityUuid: string | null; toEntityUuid: string; weight: number }
let timelineCameraBlend: TimelineCameraBlendOverride | null = null
/** 将 value ? { ...value, weight: Math.min(1, Math.max(0, finite(value.weight, 0))) } : null 赋给 timelineCameraBlend，不显式返回值。 */ export function setTimelineCameraBlend(value: TimelineCameraBlendOverride | null): void { timelineCameraBlend = value ? { ...value, weight: Math.min(1, Math.max(0, finite(value.weight, 0))) } : null }

/* 收集活动游戏相机，计算跟随与时间轴混合后的视图，并按优先级稳定排序。 */
export function activeGameCameras(entities: Entity[], width: number, height: number, deltaSeconds?: number, environment?: SceneRendererEnvironment): ActiveCamera[] {
  const renderingSettings = sceneRenderingSettings(environment)
  const safeWidth = Math.max(1, finite(width, 1)), safeHeight = Math.max(1, finite(height, 1))
  return entities
    .flatMap(/* 从有效相机实体生成经过跟随、混合和视口校正的渲染视图。 */ entity => {
      const component = entity.camera2D
      if (!entity.enabled || !component?.enabled || component.removed || !component.active) return []
      const transform = worldTransform(entity, entities)
      const blendOverride = timelineCameraBlend?.toEntityUuid === entity.uuid ? timelineCameraBlend : null
      const sourceEntity = blendOverride?.fromEntityUuid ? entities.find(/* 先计算 candidate.uuid === blendOverride.fromEntityUuid；仅当其为真值时求右侧 candidate.camera2D?.enabled，返回短路求值结果。 */ candidate => candidate.uuid === blendOverride.fromEntityUuid && candidate.camera2D?.enabled) : null
      const sourceComponent = sourceEntity?.camera2D, sourceTransform = sourceEntity ? worldTransform(sourceEntity, entities) : null, cameraBlendWeight = blendOverride?.weight ?? 1
      const viewport = safeViewport(component.viewport)
      const viewportHeight = safeHeight * viewport.height
      const orthographicSize = finite(sourceComponent ? sourceComponent.orthographicSize + (component.orthographicSize - sourceComponent.orthographicSize) * cameraBlendWeight : component.orthographicSize, 10)
      const zoom = finite(sourceComponent ? sourceComponent.zoom + (component.zoom - sourceComponent.zoom) * cameraBlendWeight : component.zoom, 1)
      const rawScale = viewportHeight / (2 * Math.max(.000001, orthographicSize)) * Math.max(.000001, zoom)
      const pixelPerfect = component.pixelPerfect || renderingSettings.pixelSnap
      const scale = pixelPerfect ? Math.max(1, Math.round(rawScale)) : rawScale
      const followed = component.followTargetUuid ? entities.find(/* 比较 candidate.uuid 与 component.followTargetUuid，返回严格相等的判断结果。 */ candidate => candidate.uuid === component.followTargetUuid) : null
      let desired = followed ? { ...worldTransform(followed, entities).position } : { ...transform.position }
      desired = { x: finite(desired.x, 0), y: finite(desired.y, 0) }
      if (sourceTransform) desired = { x: sourceTransform.position.x + (desired.x - sourceTransform.position.x) * cameraBlendWeight, y: sourceTransform.position.y + (desired.y - sourceTransform.position.y) * cameraBlendWeight }
      const previous = smoothedCameraPositions.get(component) ?? { ...desired }
      const shake = cameraShakeOffset(component, deltaSeconds)
      const rotation = finite(sourceTransform ? sourceTransform.rotation + (transform.rotation - sourceTransform.rotation) * cameraBlendWeight : transform.rotation, 0)
      if (component.dragMargins.enabled && followed) {
        const extents = cameraViewportHalfExtents({ scale, offset: { x: 0, y: 0 }, viewport }, safeWidth, safeHeight)
        const cosine = Math.cos(rotation), sine = Math.sin(rotation), dx = desired.x - previous.x, dy = desired.y - previous.y
        const local = { x: dx * cosine + dy * sine, y: -dx * sine + dy * cosine }
        const minX = -extents.x * (1 - component.dragMargins.left), maxX = extents.x * (1 - component.dragMargins.right)
        const minY = -extents.y * (1 - component.dragMargins.bottom), maxY = extents.y * (1 - component.dragMargins.top)
        const excessX = local.x < minX ? local.x - minX : local.x > maxX ? local.x - maxX : 0
        const excessY = local.y < minY ? local.y - minY : local.y > maxY ? local.y - maxY : 0
        desired = { x: previous.x + excessX * cosine - excessY * sine, y: previous.y + excessX * sine + excessY * cosine }
      }
      if (component.limits.enabled) desired = { x: Math.min(finite(component.limits.right, desired.x), Math.max(finite(component.limits.left, desired.x), desired.x)), y: Math.min(finite(component.limits.top, desired.y), Math.max(finite(component.limits.bottom, desired.y), desired.y)) }
      const blend = component.smoothing.enabled ? 1 - Math.exp(-Math.max(0, finite(component.smoothing.speed, 0)) * Math.max(0, finite(deltaSeconds ?? 0, 0))) : 1
      const smoothed = deltaSeconds === undefined ? previous : { x: previous.x + (desired.x - previous.x) * blend, y: previous.y + (desired.y - previous.y) * blend }
      if (deltaSeconds !== undefined) smoothedCameraPositions.set(component, smoothed)
      const shaken = shake.x || shake.y ? { x: smoothed.x + shake.x, y: smoothed.y + shake.y } : smoothed
      const position = pixelPerfect
        ? { x: Math.round(shaken.x * scale) / scale, y: Math.round(shaken.y * scale) / scale }
        : shaken
      const background = sourceComponent ? { r: sourceComponent.backgroundColor.r + (component.backgroundColor.r - sourceComponent.backgroundColor.r) * cameraBlendWeight, g: sourceComponent.backgroundColor.g + (component.backgroundColor.g - sourceComponent.backgroundColor.g) * cameraBlendWeight, b: sourceComponent.backgroundColor.b + (component.backgroundColor.b - sourceComponent.backgroundColor.b) * cameraBlendWeight } : component.backgroundColor
      return [{ entity, component, view: { scale, offset: { x: safeWidth * .5, y: safeHeight * .5 }, position, rotation: rotation + shake.rotation, viewport }, background: rgba(background) }]
    })
    .sort(/* 依次比较相机优先级、堆叠顺序及实体编号。 */ (first, second) => first.component.priority - second.component.priority || first.component.stackOrder - second.component.stackOrder || first.entity.id - second.entity.id)
}

/* 当 activeGameCameras(entities, width, height)[0] 为 null 或 undefined 时返回 null，否则保留左侧值。 */ export function activeGameCamera(entities: Entity[], width: number, height: number, environment?: SceneRendererEnvironment): ActiveCamera | null { return activeGameCameras(entities, width, height, undefined, environment)[0] ?? null }

/* 解析材质的混合与采样设置，非材质引用保留默认混合和回退采样。 */
function renderState(reference: string, fallbackFilter: TextureFilter, environment: SceneRendererEnvironment) {
  if (environment.assetKind(reference) !== 'material') return { blendMode: 'Alpha' as const, sampling: fallbackFilter, material: null }
  const material = resolveMaterial(reference, new Set(), environment.assets)
  return { blendMode: material.blendMode, sampling: material.sampling, material }
}

/* 从瓦片、精灵、文本或基础渲染器中取得实体排序层。 */
function sortingLayer(entity: Entity): number {
  return entity.getComponent<TileMap2D>('TileMap2D')?.sortingLayer
    ?? entity.spriteRenderer?.sortingLayer ?? entity.textRenderer?.sortingLayer ?? entity.getComponent<RhythmChart2D>('RhythmChart2D')?.sortingLayer ?? entity.renderer.sortingLayer
}

/* 沿父链查找最近视差层，并通过访问集合避免循环遍历。 */
function ancestorParallax(entity: Entity, entities: Entity[]): Entity | null {
  let current: Entity | undefined = entity
  const visited = new Set<string>()
  while (current && !visited.has(current.uuid)) { visited.add(current.uuid); if (current.authoring.kind === 'ParallaxLayer') return current; current = current.parentUuid ? entities.find(/* 比较 candidate.uuid 与 current!.parentUuid，返回严格相等的判断结果。 */ candidate => candidate.uuid === current!.parentUuid) : undefined }
  return null
}

/* 沿祖先层解析屏幕空间或视差偏移，将实体位置调整到当前相机视图。 */
function authoringPosition(entity: Entity, position: { x: number; y: number }, entities: Entity[], view: CameraRenderView): { x: number; y: number } {
  let current: Entity | undefined = entity, canvasLayer: Entity | undefined, parallaxLayer: Entity | undefined
  const visited = new Set<string>()
  while (current && !visited.has(current.uuid)) {
    visited.add(current.uuid)
    if (!canvasLayer && current.authoring.kind === 'CanvasLayer') canvasLayer = current
    if (!parallaxLayer && current.authoring.kind === 'ParallaxLayer') parallaxLayer = current
    current = current.parentUuid ? entities.find(/* 比较 candidate.uuid 与 current!.parentUuid，返回严格相等的判断结果。 */ candidate => candidate.uuid === current!.parentUuid) : undefined
  }
  const cameraPosition = view.position ?? { x: 0, y: 0 }
  if (canvasLayer?.authoring.canvasLayer.screenSpace) return { x: position.x + cameraPosition.x, y: position.y + cameraPosition.y }
  if (parallaxLayer) return { x: position.x + cameraPosition.x * (1 - parallaxLayer.authoring.parallax.motionScale.x), y: position.y + cameraPosition.y * (1 - parallaxLayer.authoring.parallax.motionScale.y) }
  return position
}
/* 组合层内次序、作者指定深度与可选 Y 排序偏移。 */
/** 计算作者层内次序。`worldY` 由调用方批量求解后传入；省略时退回单次查询，保持既有行为。 */
function authoredOrder(entity: Entity, base: number, entities: Entity[], worldY?: number): number {
  const depthKey = entity.authoring.sortMode === 'YSort' ? -(worldY ?? worldTransform(entity, entities).position.y) * .000001 : 0
  return base + entity.authoring.zOrder + depthKey
}

/* 解析精灵资源并提交含视差重复、翻转、蒙皮及九宫格设置的绘制命令。 */
type FrameSpriteMeshes = Map<Entity, ReturnType<SceneRendererEnvironment['deformSkin']>>
/** Bounds and all cameras/repeat copies borrow one pose result during this synchronous frame. */
function frameSpriteMesh(entity: Entity, sprite: SpriteRenderer2D, meshes: FrameSpriteMeshes, environment: SceneRendererEnvironment): ReturnType<SceneRendererEnvironment['deformSkin']> {
  if (!meshes.has(entity)) meshes.set(entity, environment.deformSkin(entity, sprite))
  return meshes.get(entity) ?? null
}

function submitSprite(renderer: Renderer2D, entity: Entity, sprite: SpriteRenderer2D, entities: Entity[], view: CameraRenderView, meshes: FrameSpriteMeshes, environment: SceneRendererEnvironment, worldTransforms?: ReadonlyMap<string, WorldTransform2D>): void {
  if (!sprite.enabled || sprite.removed || !sprite.spriteAsset) return
  const state = renderState(sprite.material, sprite.filterMode, environment)
  const texture = environment.assets.resolveTexture(sprite.spriteAsset, state.sampling)
  if (!texture) return
  const transform = worldTransforms?.get(entity.uuid) ?? worldTransform(entity, entities)
  const base = authoringPosition(entity, transform.position, entities, view), parallaxLayer = ancestorParallax(entity, entities), parallax = parallaxLayer?.authoring.parallax
  const repeatX = parallax && parallax.repeat.x > 0 ? [-1, 0, 1] : [0], repeatY = parallax && parallax.repeat.y > 0 ? [-1, 0, 1] : [0]
  const mesh = frameSpriteMesh(entity, sprite, meshes, environment)
  const normalMap = sprite.normalMapAsset && !sprite.nineSlice.enabled ? environment.assets.resolveTexture(sprite.normalMapAsset, state.sampling) : null
  for (const y of repeatY) for (const x of repeatX) {
    const mirrored = parallax?.mirror === true && Math.abs(x + y) % 2 === 1
    renderer.submitSprite({
      position: { x: base.x + x * (parallax?.repeat.x ?? 0), y: base.y + y * (parallax?.repeat.y ?? 0) }, rotation: transform.rotation, scale: transform.scale,
      size: sprite.size, pivot: sprite.pivot, flipX: mirrored ? !sprite.flipX : sprite.flipX, flipY: sprite.flipY,
      tint: renderer.stats.backend === 'Canvas2D' && state.material ? canvasMaterialColor(state.material, rgba(sprite.tint, sprite.opacity)) : rgba(sprite.tint, sprite.opacity), texture,
      sortingLayer: sprite.sortingLayer, orderInLayer: authoredOrder(entity, sprite.orderInLayer, entities) + (parallax?.depth ?? 0) * .000001,
      material: sprite.material, blendMode: state.blendMode,
      nineSlice: sprite.nineSlice.enabled ? { left: sprite.nineSlice.left, top: sprite.nineSlice.top, right: sprite.nineSlice.right, bottom: sprite.nineSlice.bottom } : null,
      mesh, normalMap
    })
  }
}

/* 按路径平滑度和显式或自动切线采样三次贝塞尔曲线，生成绘制顶点。 */
function renderedPathVertices(entity: Entity): Array<{ x: number; y: number }> {
  const path = entity.authoring.path, points = path.points.length ? path.points : entity.renderer.vertices
  if (entity.authoring.kind !== 'Path' || points.length < 2 || path.smoothing <= 0) return entity.renderer.vertices
  const result: Array<{ x: number; y: number }> = [], segmentCount = path.closed ? points.length : points.length - 1, steps = Math.max(3, Math.round(3 + path.smoothing * 21))
  for (let index = 0; index < segmentCount; index++) {
    const nextIndex = (index + 1) % points.length, p0 = points[index], p3 = points[nextIndex]
    const previous = points[(index - 1 + points.length) % points.length], following = points[(nextIndex + 1) % points.length]
    const automaticOut = { x: (p3.x - previous.x) * path.smoothing / 6, y: (p3.y - previous.y) * path.smoothing / 6 }, automaticIn = { x: (p0.x - following.x) * path.smoothing / 6, y: (p0.y - following.y) * path.smoothing / 6 }
    const outgoing = path.tangents[index]?.outgoing ?? automaticOut, incoming = path.tangents[nextIndex]?.incoming ?? automaticIn
    const p1 = { x: p0.x + outgoing.x, y: p0.y + outgoing.y }, p2 = { x: p3.x + incoming.x, y: p3.y + incoming.y }
    for (let step = index ? 1 : 0; step <= steps; step++) { const t = step / steps, inverse = 1 - t; result.push({ x: inverse ** 3 * p0.x + 3 * inverse ** 2 * t * p1.x + 3 * inverse * t ** 2 * p2.x + t ** 3 * p3.x, y: inverse ** 3 * p0.y + 3 * inverse ** 2 * t * p1.y + 3 * inverse * t ** 2 * p2.y + t ** 3 * p3.y }) }
  }
  return result
}

/* 解析导入字体及回退字体，提交包含描边、对齐和作者层级的文本命令。 */
function submitText(renderer: Renderer2D, entity: Entity, text: TextRenderer2D, entities: Entity[], view: CameraRenderView, environment: SceneRendererEnvironment, worldTransforms?: ReadonlyMap<string, WorldTransform2D>): void {
  if (!text.enabled || text.removed || !text.text) return
  const transform = worldTransforms?.get(entity.uuid) ?? worldTransform(entity, entities)
  const importedFont = environment.fontMetadata(text.fontAsset)
  const fontFamily = cssFontStack(importedFont?.family || text.fontFamily, importedFont?.fallbackFamilies)
  const outlineWidth = importedFont?.outlineWidth ?? 0
  renderer.submitText({
    position: authoringPosition(entity, transform.position, entities, view), rotation: transform.rotation, scale: transform.scale,
    text: text.text, fontFamily,
    fontSize: text.fontSize, fontWeight: text.fontWeight, lineHeight: text.lineHeight,
    align: text.align, color: rgba(text.color, text.opacity), outlineColor: { r: 0, g: 0, b: 0, a: outlineWidth > 0 ? text.opacity / 100 : 0 }, outlineWidth, maxWidth: text.maxWidth,
    sortingLayer: text.sortingLayer, orderInLayer: authoredOrder(entity, text.orderInLayer, entities), material: text.material
  })
}

/** Expand the existing camera culling rectangle for texture preparation only. */
/* 按受限预加载倍率扩大相机可见区域，并保留基础边界余量。 */
export function texturePreloadBounds(bounds: ReturnType<typeof visibleWorldBounds>, margin: number) {
  const factor = Math.min(8, Math.max(1, finite(margin, 1.5))), centerX = (bounds.minX + bounds.maxX) / 2, centerY = (bounds.minY + bounds.maxY) / 2
  const halfWidth = ((bounds.maxX - bounds.minX) / 2 + 4) * factor, halfHeight = ((bounds.maxY - bounds.minY) / 2 + 4) * factor
  return { minX: centerX - halfWidth, maxX: centerX + halfWidth, minY: centerY - halfHeight, maxY: centerY + halfHeight }
}

/** Cull the pixels submitted by this frontend, never an entity origin with a fixed-size guess. */
function entityIntersectsRenderBounds(entity: Entity, entities: Entity[], view: CameraRenderView, bounds: RenderBounds2D, meshes: FrameSpriteMeshes, environment: SceneRendererEnvironment): boolean {
  // Tile chunks own their transformed/parallax bounds. Text layout and live particle bounds are
  // not exposed by these systems yet; retain them conservatively instead of dropping pixels.
  // 26.46: a rhythm chart's lanes, notes and HUD extend far from its origin; keep it like text.
  if (entity.getComponent<TileMap2D>('TileMap2D') || entity.getComponent<ParticleEmitter2D>('ParticleEmitter2D') || entity.textRenderer?.text || entity.getComponent<RhythmChart2D>('RhythmChart2D')) return true
  const shape = entity.getComponent<ShapeRenderer2D>('ShapeRenderer2D'), sprite = entity.spriteRenderer
  if (!shape && !sprite) return true
  const transform = worldTransform(entity, entities)
  const position = authoringPosition(entity, transform.position, entities, view)
  if (shape) {
    const points = shape.shape === 'Ellipse'
      ? [{ x: -shape.radiusX, y: -shape.radiusY }, { x: shape.radiusX, y: -shape.radiusY }, { x: shape.radiusX, y: shape.radiusY }, { x: -shape.radiusX, y: shape.radiusY }]
      : renderedPathVertices(entity)
    const local = points.length ? points : [{ x: -.5, y: -.5 }, { x: .5, y: -.5 }, { x: .5, y: .5 }, { x: -.5, y: .5 }]
    // strokeGeometry caps its world-space miter at four half-widths.
    if (renderBoundsIntersect(transformedRenderBounds(local, position, transform.rotation, transform.scale, Math.max(0, shape.strokeWidth) * 2), bounds)) return true
  }
  if (sprite?.spriteAsset) {
    const mesh = frameSpriteMesh(entity, sprite, meshes, environment)
    const left = -sprite.pivot.x * sprite.size.x, right = left + sprite.size.x
    const bottom = -sprite.pivot.y * sprite.size.y, top = bottom + sprite.size.y
    const local = mesh?.positions ?? [{ x: left, y: bottom }, { x: right, y: bottom }, { x: right, y: top }, { x: left, y: top }]
    const spriteBounds = transformedRenderBounds(local, position, transform.rotation, transform.scale)
    const repeat = ancestorParallax(entity, entities)?.authoring.parallax.repeat
    if (spriteBounds && repeat) {
      // The frontend submits the original and the two neighboring repeat copies.
      const repeatX = Math.max(0, repeat.x), repeatY = Math.max(0, repeat.y)
      spriteBounds.minX -= repeatX; spriteBounds.maxX += repeatX
      spriteBounds.minY -= repeatY; spriteBounds.maxY += repeatY
    }
    if (renderBoundsIntersect(spriteBounds, bounds)) return true
  }
  return false
}

/* 逐相机提交世界绘制命令、更新质量并执行视域裁剪，在帧末处理纹理预加载任务。 */
export function renderWorld(renderer: Renderer2D, entities: Entity[], options: SceneRenderOptions, suppliedEnvironment?: SceneRendererEnvironment): RendererStats {
  const environment = resolveSceneRendererEnvironment(suppliedEnvironment)
  const renderingSettings = environment.settings
  const cameras = options.gameView ? activeGameCameras(entities, options.width, options.height, options.deltaSeconds ?? 0, environment) : []
  const primaryCamera = cameras[0] ?? null
  const qualityPosition = primaryCamera?.view.position ?? options.editorCamera.position ?? { x: 0, y: 0 }
  environment.publishPostProcess(qualityPosition)
  environment.publishRenderQuality(qualityPosition)
  const frame = {
    width: options.width,
    height: options.height,
    pixelRatio: options.pixelRatio,
    clearColor: primaryCamera?.background ?? parseCssColor(options.canvasColor)
  }
  if (renderer.tryBeginFrame) {
    if (!renderer.tryBeginFrame(frame)) return { ...renderer.stats, cpuSubmissionAtMs: null }
  } else renderer.beginFrame(frame)
  const compounds = compoundGeometries(entities, options.connections)
  const compoundMembers = new Set(compounds.filter(/* 比较 compound.members.length 与 1，返回大于的判断结果。 */ compound => compound.members.length > 1).flatMap(/* 返回按声明顺序构造的数组 [...compound.memberIds]。 */ compound => [...compound.memberIds]))
  const passes = options.gameView && cameras.length ? cameras : [{ entity: null, component: null, view: options.editorCamera, background: parseCssColor(options.canvasColor) }]
  const preloadJobs: Array<() => void> = [], requestedTextures = new Set<string>()
  const spriteMeshes: FrameSpriteMeshes = new Map()
  let preparedTileTextures = 0
  const requestTexture = /* 对有限数量的纹理引用去重，解析后提交可选预加载请求。 */ (reference: string | null | undefined, filter?: TextureFilter) => {
    if (!reference || requestedTextures.has(reference) || requestedTextures.size >= 256) return
    requestedTextures.add(reference)
    const texture = environment.assets.resolveTexture(reference, filter); if (texture) renderer.preloadTexture?.(texture)
  }
  for (const camera of passes) {
    renderer.beginCamera(camera.view)
    const visibleBounds = visibleWorldBounds(camera.view, options.width, options.height)
    if (!options.gameView && options.editorGrid?.enabled) submitEditorGrid(renderer, options)
    const near = camera.component?.nearSortingLayer ?? -Infinity
    const far = camera.component?.farSortingLayer ?? Infinity
    const cullingMask = camera.component?.cullingMask ?? 0xffff_ffff
    const candidates = entities
      .filter(/* 先计算 entity.enabled && entity.authoring.visible；仅当其为真值时求右侧 (options.gameView || entity.editorVisible)，返回短路求值结果。 */ entity => entity.enabled && entity.authoring.visible && (options.gameView || entity.editorVisible))
      .filter(/* 先计算 options.gameView；仅当其为假值时求右侧 entity.layer === options.activeLayer，返回短路求值结果。 */ entity => options.gameView || entity.layer === options.activeLayer)
      .filter(/* 先计算 options.renderLayer === 'all'；仅当其为假值时求右侧 entity.layer === options.renderLayer，返回短路求值结果。 */ entity => options.renderLayer === 'all' || entity.layer === options.renderLayer)
      .filter(/* 比较 (cullingMask & (1 << (entity.layer & 31))) 与 0，返回严格不等的判断结果。 */ entity => (cullingMask & (1 << (entity.layer & 31))) !== 0)
      .filter(/* 先计算 sortingLayer(entity) >= near；仅当其为真值时求右侧 sortingLayer(entity) <= far，返回短路求值结果。 */ entity => sortingLayer(entity) >= near && sortingLayer(entity) <= far)
    const positioned = candidates.filter(entity => !options.performanceMode || entityIntersectsRenderBounds(entity, entities, camera.view, visibleBounds, spriteMeshes, environment))
    // authoredOrder 对 YSort 实体会调用 worldTransform，而实测 worldTransform 为 O(depth)（约 323ns/层）。
    // 在比较器内求值会把它重复 O(n log n) 次；按实体预计算一次后降为每帧 O(n) 次，排序结果不变。
    // YSort 实体需要世界 Y 作为排序键。逐实体查询会让世界变换被重复求解；这里按拓扑序批量
    // 求解一次，使每个祖先只算一次，键值与排序结果都不变。无 YSort 实体时完全跳过。
    // 世界变换按拓扑序批量求解一次，排序键与随后的绘制循环共用同一张表。
    // 实测 worldTransform 为 O(depth)（约 323ns/层），逐实体查询会让每个祖先被重复求解；
    // 批量求解每个祖先只算一次，结果与逐次调用逐字段相等（见 verify-engine-world-transform-oracle）。
    const worldTransforms = worldTransformsFor(entities, positioned)
    const orderKeys = new Map<number, number>()
    for (const entity of positioned) orderKeys.set(entity.id, authoredOrder(entity, entity.renderer.orderInLayer, entities, worldTransforms?.get(entity.uuid)?.position.y))
    // 上面的循环已覆盖 positioned 的每个实体，回退值不可达；保留它只是避免在渲染热路径抛出。
    const visible = positioned.sort(/* 依次比较实体排序层、作者层内次序及实体编号。 */ (first, second) => sortingLayer(first) - sortingLayer(second) || (orderKeys.get(first.id) ?? 0) - (orderKeys.get(second.id) ?? 0) || first.id - second.id)
    for (const entity of visible) {
      const tileMap = entity.getComponent<TileMap2D>('TileMap2D')
      if (tileMap) for (const chunk of environment.tileChunkCommands(entity, tileMap, entities, visibleBounds, camera.view.position)) renderer.submitTileChunk(chunk)
      const shape = entity.getComponent<ShapeRenderer2D>('ShapeRenderer2D')
      if (shape) {
        const transform = worldTransforms.get(entity.uuid) ?? worldTransform(entity, entities)
        const materialState = renderState(shape.material, shape.filterMode, environment)
        renderer.submitShape({
          shape: shape.shape, position: authoringPosition(entity, transform.position, entities, camera.view), rotation: transform.rotation, scale: transform.scale,
          vertices: renderedPathVertices(entity), radiusX: shape.radiusX, radiusY: shape.radiusY,
          fill: renderer.stats.backend === 'Canvas2D' && materialState.material ? canvasMaterialColor(materialState.material, rgba(shape.color, shape.opacity)) : rgba(shape.color, shape.opacity), stroke: rgba(shape.strokeColor, compoundMembers.has(entity.id) ? 0 : shape.strokeOpacity),
          strokeWidth: shape.strokeWidth, texture: environment.assets.resolveTexture(shape.textureAsset, materialState.sampling),
          sortingLayer: shape.sortingLayer, orderInLayer: authoredOrder(entity, shape.orderInLayer, entities, worldTransforms.get(entity.uuid)?.position.y), material: shape.material, blendMode: materialState.blendMode
        })
      }
      const sprite = entity.getComponent<SpriteRenderer2D>('SpriteRenderer2D')
      if (sprite) submitSprite(renderer, entity, sprite, entities, camera.view, spriteMeshes, environment, worldTransforms)
      const text = entity.getComponent<TextRenderer2D>('TextRenderer2D')
      if (text) submitText(renderer, entity, text, entities, camera.view, environment, worldTransforms)
      const rhythm = entity.getComponent<RhythmChart2D>('RhythmChart2D')
      if (rhythm?.enabled && !rhythm.removed) {
        const transform = worldTransforms.get(entity.uuid) ?? worldTransform(entity, entities)
        submitRhythmChart(renderer, rhythm, { position: authoringPosition(entity, transform.position, entities, camera.view), rotation: transform.rotation, scale: transform.scale }, rhythmFrame(rhythm.uuid))
      }
    }
    environment.submitParticles(renderer, visible, entities)
    for (const compound of compounds) {
      if (compound.members.length < 2 || !compound.members.some(/* 调用 visible.includes(member) 并返回调用结果。 */ member => visible.includes(member))) continue
      const style = compound.members[0].renderer
      for (const segment of compound.boundary) renderer.submitShape({
        shape: 'Line', position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, vertices: [segment.start, segment.end], radiusX: 0, radiusY: 0,
        fill: rgba(style.color, 0), stroke: rgba(style.strokeColor, style.strokeOpacity), strokeWidth: style.strokeWidth,
        sortingLayer: style.sortingLayer, orderInLayer: style.orderInLayer + .001, material: style.material
      })
    }
    renderer.endCamera()
    if (renderingSettings.textureStreaming.enabled && options.performanceMode) {
      const bounds = texturePreloadBounds(visibleBounds, renderingSettings.textureStreaming.preloadMargin), drawn = new Set(visible)
      for (const entity of candidates) {
        if (preloadJobs.length >= 256) break
        if (drawn.has(entity)) continue
        const position = (worldTransforms.get(entity.uuid) ?? worldTransform(entity, entities)).position
        if (position.x < bounds.minX || position.x > bounds.maxX || position.y < bounds.minY || position.y > bounds.maxY) continue
        preloadJobs.push(/* 预加载实体精灵、形状、粒子及相关材质使用的纹理。 */ () => {
          const sprite = entity.spriteRenderer, shape = entity.getComponent<ShapeRenderer2D>('ShapeRenderer2D'), particles = entity.getComponent<ParticleEmitter2D>('ParticleEmitter2D')
          if (sprite?.enabled) { requestTexture(sprite.spriteAsset, sprite.filterMode); requestTexture(sprite.normalMapAsset, sprite.filterMode) }
          if (shape?.enabled) requestTexture(shape.textureAsset, shape.filterMode)
          if (particles?.enabled) requestTexture(particles.textureAsset)
          for (const reference of [sprite?.material, shape?.material, particles?.material]) if (reference && reference !== 'Default') for (const texture of Object.values(resolveMaterial(reference, new Set(), environment.assets).textures)) requestTexture(texture)
        })
        if (preloadJobs.length >= 256) break
      }
      for (const entity of visible) {
        const tileMap = entity.getComponent<TileMap2D>('TileMap2D')
        if (!tileMap?.enabled || preloadJobs.length >= 256) continue
        preloadJobs.push(/* 在瓦片纹理数量预算内遍历预加载块并提交纹理请求。 */ () => { if (preparedTileTextures >= 256) return; for (const chunk of environment.tileChunkCommands(entity, tileMap, entities, bounds, camera.view.position)) for (const sprite of chunk.sprites) { renderer.preloadTexture?.(sprite.texture); if (++preparedTileTextures >= 256) return } })
      }
    }
  }
  let lightingBackend: 'WebGL2' | 'Canvas2D' | 'Off' = 'Off', lightingFallbackReason: string | null = null
  if (options.lighting?.environment.settings.lightingEnabled) {
    if (renderer.submitLighting && renderer.supportsGpuLighting?.()) {
      const built = buildGpuLighting(entities, options.gameView, options.activeLayer, options.lighting.environment)
      if (built.frame) { renderer.submitLighting(built.frame); lightingBackend = 'WebGL2' }
      else { lightingBackend = 'Canvas2D'; lightingFallbackReason = built.fallback }
    } else { lightingBackend = 'Canvas2D'; lightingFallbackReason = renderer.stats.backend === 'WebGL2' ? 'gpu lighting unavailable' : 'Canvas2D renderer' }
  }
  const stats = renderer.endFrame()
  for (const preload of preloadJobs) preload()
  return { ...stats, lightingBackend, lightingFallbackReason, textureUploadQueue: renderer.stats.textureUploadQueue, textureUploadQueueBytes: renderer.stats.textureUploadQueueBytes, textureUploadDeferrals: renderer.stats.textureUploadDeferrals }
}

/* 根据缩放调整网格间距，在数量上限内提交固定屏幕线宽的编辑网格。 */
function submitEditorGrid(renderer: Renderer2D, options: SceneRenderOptions): void {
  const camera = options.editorCamera
  const scale = Math.max(.000001, camera.scale)
  let step = Math.max(.000001, Number.isFinite(options.editorGrid?.step) ? options.editorGrid!.step : 1)
  while (step * scale < 8) step *= 10
  const viewLeft = -camera.offset.x / scale
  const viewRight = viewLeft + options.width / scale
  const viewTop = camera.offset.y / scale
  const viewBottom = viewTop - options.height / scale
  while ((viewRight - viewLeft) / step + (viewTop - viewBottom) / step > 1_024) step *= 10
  const color = parseCssColor(options.editorGrid?.color ?? '#202630')
  const submit = /* 提交最低排序层的网格线命令，使网格绘制在场景对象下方。 */ (start: { x: number; y: number }, end: { x: number; y: number }) => renderer.submitShape({
    shape: 'Line', position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, vertices: [start, end],
    radiusX: 0, radiusY: 0, fill: { ...color, a: 0 }, stroke: color, strokeWidth: 1 / scale,
    sortingLayer: Number.MIN_SAFE_INTEGER, orderInLayer: 0, material: '__EditorGrid'
  })
  const startX = Math.floor(viewLeft / step) * step
  const startY = Math.floor(viewBottom / step) * step
  for (let x = startX; x <= viewRight; x += step) submit({ x, y: viewBottom }, { x, y: viewTop })
  for (let y = startY; y <= viewTop; y += step) submit({ x: viewLeft, y }, { x: viewRight, y })
}
