/** One shared entity record builder; callers retain World allocation, insertion and transactions. */
import { storedComponent, type SceneEntityData, type SceneComponentData } from '../world/sceneEntityData'
import { validateComponentValues } from '../world/componentValidation'
import { validateEntityMetadataValues } from '../projects/projectPreflight'
import { truncateUtf16 } from '../runtime/uiTextLayout'
import { Entity, type AuthoringMetadata2D } from '../world/Entity'
import { BoxEntity } from '../world/BoxEntity'
import { CircleEntity } from '../world/CircleEntity'
import { TriangleEntity } from '../world/TriangleEntity'
import { finiteNumber, normalizeEntity, syncDensityFromMass } from '../world/geometry'
import { normalizeUuid } from '../world/identity'
import { RhythmChart2D, Animator, Area2D, AreaEffector2D, AudioListener, AudioSource, BehaviorTree2D, Button, Camera2D, CameraFollow2D, Canvas, CharacterBody2D, Checkbox, Collider2D, Collectible2D, Cooldown2D, DamageHitbox2D, GridMover2D, Health2D, Lifetime2D, MouseFollower2D, TargetJoint2D, PlatformController2D, Projectile2D, Spawner2D, TopDownController2D, Image as UIImage, Joint2D, Light2D, Panel, ParticleEmitter2D, ProgressBar, RectTransform, RigidBody2D, Script2D, ShadowCaster2D, NavigationAgent2D, NavigationObstacle2D, NavigationRegion2D, ObjectPool2D, Portal2D, ShapeRenderer2D, Skeleton2D, Slider, SpriteRenderer2D, StateMachine2D, Text as UIText, TextInput, TextRenderer2D, TileMap2D, TimelinePlayer, WorldChunk2D, normalizeJointBreakThreshold, pasteComponentValues, type Component2D, type ComponentKind, type ScriptPropertyValue } from '../world/components'
import { Transform } from '../world/Transform'
import { normalizeParticleEmitter } from '../runtime/particleEmitterValues'
import { normalizeTileMap } from '../runtime/tileMapValues'
import { configureUiAccessibility } from '../runtime/uiAccessibility'
import { MAX_AUTHORED_COLLIDER_POINTS } from '../runtime/physicsProduction'


export const SCALAR_ENTITY_PROPERTIES = [
  'layer', 'density', 'restitutionThreshold', 'transparency', 'angularVelocity',
  'linearDamping', 'angularDamping', 'mass', 'inertia', 'gravityScale', 'torque',
  'gravity', 'restitution', 'staticFriction', 'dynamicFriction'
] as const

export const BOOLEAN_ENTITY_PROPERTIES = ['autoInertia', 'isSensor', 'isStatic', 'isKinematic'] as const

export const EXTENDED_COMPONENT_KINDS = [
  'Animator', 'Skeleton2D', 'TimelinePlayer', 'AudioSource', 'AudioListener', 'Canvas', 'RectTransform', 'Panel', 'Image',
  'Text', 'Button', 'Slider', 'ProgressBar', 'Checkbox', 'TextInput', 'TileMap2D', 'ParticleEmitter2D', 'Light2D', 'ShadowCaster2D',
  'CharacterBody2D', 'Area2D', 'AreaEffector2D', 'NavigationRegion2D', 'NavigationObstacle2D', 'NavigationAgent2D', 'BehaviorTree2D', 'StateMachine2D',
  'GridMover2D', 'PlatformController2D', 'TopDownController2D', 'Health2D', 'DamageHitbox2D', 'Collectible2D', 'Projectile2D', 'Spawner2D', 'Cooldown2D', 'Lifetime2D', 'MouseFollower2D', 'CameraFollow2D',
  'WorldChunk2D', 'Portal2D', 'ObjectPool2D', 'RhythmChart2D',
  'FixedJoint2D', 'WeldJoint2D', 'DistanceJoint2D', 'RopeJoint2D', 'RevoluteJoint2D', 'MotorJoint2D', 'PrismaticJoint2D', 'SpringJoint2D', 'WheelJoint2D', 'TargetJoint2D'
] as const
export type EntityBuilderMessageKey = 'invalidEntityRecord' | 'unsupportedShape'
export interface EntityBuilderPorts {
  message(key: EntityBuilderMessageKey, params?: Record<string, string | number>): string
  invalidateTileMap(component: TileMap2D): void
}
export interface EntityBuilder {
  createEntityFromData(item: SceneEntityData, forcedId?: number): Entity
  normalizeIdentifier(value: unknown, fallback?: number): number
  storedShapeType(item: SceneEntityData): string | undefined
}

/** Construct once per real service composition, never once per entity.
 * Live messages and the original Tile cache invalidator are required. */
export function createEntityBuilder(ports: EntityBuilderPorts): EntityBuilder {
  if (!ports || typeof ports.message !== 'function' || typeof ports.invalidateTileMap !== 'function') throw new Error('ENTITY_BUILDER_PORTS_REQUIRED: Supply live messages and the actual Tile cache invalidator.')
  const t = ports.message.bind(ports), invalidateTileMap = ports.invalidateTileMap.bind(ports)


/** 仅从对象读取有限坐标值写入目标向量，非法分量沿用原坐标。 */ function copyVector(target: { x: number; y: number }, source: unknown): void {
  if (!source || typeof source !== 'object') return
  const vector = source as { x?: unknown; y?: unknown }
  target.x = finiteNumber(vector.x, target.x)
  target.y = finiteNumber(vector.y, target.y)
}

/* 调用 Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.round(finiteNumber(value, fallback)))) 并返回调用结果。 */ function normalizeIdentifier(value: unknown, fallback = 1): number {
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.round(finiteNumber(value, fallback))))
}

/** 要求最小顶点数并限制读取长度，保留一个超限哨兵点供物理准备明确报错。 */ function normalizedVertices(vertices: SceneEntityData['vertices'], minimum = 3): Array<{ x: number; y: number }> | null {
  if (!Array.isArray(vertices) || vertices.length < minimum) return null
  // Preserve a bounded one-point-over-limit sentinel. Physics preparation can
  // then produce an explicit diagnostic instead of silently truncating while
  // hostile multi-million-point payloads never reach quadratic validation.
  return vertices.slice(0, MAX_AUTHORED_COLLIDER_POINTS + 1).map(/** 构造并返回记录 { x: finiteNumber(vertex.x, 0), y: finiteNumber(vertex.y, 0) }，字段按当前实参及捕获状态求值。 */ vertex => ({ x: finiteNumber(vertex.x, 0), y: finiteNumber(vertex.y, 0) }))
}

/** 按组件类型查找存储实体的首个组件记录。 */

/** 优先使用实体类型，再由渲染器几何推断基础形状，最后兼容旧形状或名称字段。 */ function storedShapeType(item: SceneEntityData): string | undefined {
  if (item.entityType) return item.entityType
  const renderer = storedComponent(item, 'ShapeRenderer2D')?.data
  if (renderer?.shape === 'Ellipse') return 'Circle'
  if (renderer?.shape === 'Rectangle') return 'Box'
  if (renderer?.shape === 'Polygon') {
    const vertices = renderer.vertices
    return Array.isArray(vertices) && vertices.length === 3 ? 'Triangle' : 'Box'
  }
  return item.shapeType ?? item.name
}

/** 按存储形状构造圆、矩形或三角形实体，兼容旧顶点数据，不支持类型抛错。 */ function createShapeEntity(item: SceneEntityData, id: number, position: { x: number; y: number }): Entity {
  const shapeType = storedShapeType(item)
  if (shapeType === 'Circle') {
    const radiusX = finiteNumber(item.radiusX, 1)
    return new CircleEntity(id, position, radiusX, finiteNumber(item.radiusY, radiusX), item.uuid)
  }
  const vertices = normalizedVertices(item.vertices)
  if (shapeType === 'Box') {
    const entity = new BoxEntity(id, position, { x: 1, y: 1 }, item.uuid)
    if (vertices) entity.vertices = vertices
    return entity
  }
  if (shapeType === 'Triangle') {
    const entity = new TriangleEntity(id, position, { x: 1, y: 1 }, item.uuid)
    if (vertices) entity.vertices = vertices
    return entity
  }
  throw new Error(t('unsupportedShape', { shape: String(shapeType) }))
}

/* 根据 component?.data && typeof component.data === 'object' 的真假，分别返回 component.data 或 {}。 */ function recordData(component: SceneComponentData | undefined): Record<string, unknown> {
  return component?.data && typeof component.data === 'object' ? component.data : {}
}

/** 恢复启用与移除标记，已移除组件始终禁用。 */ function applyComponentMetadata(target: { enabled: boolean; removed: boolean }, source: SceneComponentData): void {
  target.enabled = source.enabled !== false
  target.removed = source.removed === true
  if (target.removed) target.enabled = false
}

/** 按扩展组件类型构造对应实例，未命中已列类型时交给关节组件构造器。 */ function createExtendedComponent(kind: typeof EXTENDED_COMPONENT_KINDS[number], uuid?: string): Component2D {
  if (kind === 'Animator') return new Animator(uuid)
  if (kind === 'Skeleton2D') return new Skeleton2D(uuid)
  if (kind === 'TimelinePlayer') return new TimelinePlayer(uuid)
  if (kind === 'RhythmChart2D') return new RhythmChart2D(uuid)
  if (kind === 'AudioSource') return new AudioSource(uuid)
  if (kind === 'AudioListener') return new AudioListener(uuid)
  if (kind === 'Canvas') return new Canvas(uuid)
  if (kind === 'RectTransform') return new RectTransform(uuid)
  if (kind === 'Panel') return new Panel(uuid)
  if (kind === 'Image') return new UIImage(uuid)
  if (kind === 'Text') return new UIText(uuid)
  if (kind === 'Button') return new Button(uuid)
  if (kind === 'Slider') return new Slider(uuid)
  if (kind === 'ProgressBar') return new ProgressBar(uuid)
  if (kind === 'Checkbox') return new Checkbox(uuid)
  if (kind === 'TextInput') return new TextInput(uuid)
  if (kind === 'TileMap2D') return new TileMap2D(uuid)
  if (kind === 'CharacterBody2D') return new CharacterBody2D(uuid)
  if (kind === 'Area2D') return new Area2D(uuid)
  if (kind === 'AreaEffector2D') return new AreaEffector2D(uuid)
  if (kind === 'NavigationRegion2D') return new NavigationRegion2D(uuid)
  if (kind === 'NavigationObstacle2D') return new NavigationObstacle2D(uuid)
  if (kind === 'NavigationAgent2D') return new NavigationAgent2D(uuid)
  if (kind === 'BehaviorTree2D') return new BehaviorTree2D(uuid)
  if (kind === 'StateMachine2D') return new StateMachine2D(uuid)
  if (kind === 'GridMover2D') return new GridMover2D(uuid)
  if (kind === 'PlatformController2D') return new PlatformController2D(uuid)
  if (kind === 'TopDownController2D') return new TopDownController2D(uuid)
  if (kind === 'Health2D') return new Health2D(uuid)
  if (kind === 'DamageHitbox2D') return new DamageHitbox2D(uuid)
  if (kind === 'Collectible2D') return new Collectible2D(uuid)
  if (kind === 'Projectile2D') return new Projectile2D(uuid)
  if (kind === 'Spawner2D') return new Spawner2D(uuid)
  if (kind === 'Cooldown2D') return new Cooldown2D(uuid)
  if (kind === 'Lifetime2D') return new Lifetime2D(uuid)
  if (kind === 'MouseFollower2D') return new MouseFollower2D(uuid)
  if (kind === 'TargetJoint2D') return new TargetJoint2D(uuid)
  if (kind === 'CameraFollow2D') return new CameraFollow2D(uuid)
  if (kind === 'WorldChunk2D') return new WorldChunk2D(uuid)
  if (kind === 'Portal2D') return new Portal2D(uuid)
  if (kind === 'ObjectPool2D') return new ObjectPool2D(uuid)
  if (kind === 'ParticleEmitter2D') return new ParticleEmitter2D(uuid)
  if (kind === 'Light2D') return new Light2D(uuid)
  if (kind === 'ShadowCaster2D') return new ShadowCaster2D(uuid)
  return new Joint2D(kind, uuid)
}

/* 调用 Math.min(maximum, Math.max(minimum, finiteNumber(value, fallback))) 并返回调用结果。 */ function clamp(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, fallback)))
}

/** 将任意输入转换为有限二维坐标，缺失或非法分量使用回退值。 */ function safeVector(value: unknown, fallback: { x: number; y: number }): { x: number; y: number } {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return { x: finiteNumber(source.x, fallback.x), y: finiteNumber(source.y, fallback.y) }
}

/** 把输入颜色转换为零至二百五十五的整数通道，缺失或非法值使用默认颜色。 */ function safeColor(value: unknown, fallback: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    r: Math.round(clamp(source.r, fallback.r, 0, 255)),
    g: Math.round(clamp(source.g, fallback.g, 0, 255)),
    b: Math.round(clamp(source.b, fallback.b, 0, 255))
  }
}

/** 仅保留允许覆盖的样式字段，限制字符串长度并剔除非有限数值。 */ function safeStyleOverrides(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const allowed = new Set(['background', 'foreground', 'border', 'borderWidth', 'cornerRadius', 'fontSize', 'fontWeight', 'opacity'])
  const result: Record<string, string | number> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key)) continue
    if (typeof raw === 'string') result[key] = raw.slice(0, 80)
    else if (typeof raw === 'number' && Number.isFinite(raw)) result[key] = raw
  }
  return result
}

/** 按实际扩展组件类型限制数值、列表、文本和枚举，恢复缺省结构并失效需要重建的瓦片缓存。 */ function normalizeExtendedComponent(component: Component2D): void {
  if (component instanceof Animator) {
    component.controllerAsset = typeof component.controllerAsset === 'string' ? component.controllerAsset : null
    component.speed = clamp(component.speed, 1, -100, 100)
    component.currentState = typeof component.currentState === 'string' ? component.currentState.slice(0, 80) : ''
    const parameters: Record<string, boolean | number> = {}
    if (component.parameters && typeof component.parameters === 'object') for (const [name, value] of Object.entries(component.parameters).slice(0, 256)) {
      if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) parameters[name.slice(0, 80)] = value
    }
    component.parameters = parameters
    const layerWeights: Record<string, number> = {}
    if (component.layerWeights && typeof component.layerWeights === 'object') for (const [name, value] of Object.entries(component.layerWeights).slice(0, 32)) {
      layerWeights[name.slice(0, 80)] = clamp(value, 1, 0, 1)
    }
    component.layerWeights = layerWeights
  } else if (component instanceof Skeleton2D) {
    component.rigAsset = typeof component.rigAsset === 'string' ? component.rigAsset : null
    component.skinAsset = typeof component.skinAsset === 'string' ? component.skinAsset : null
    component.pose = (Array.isArray(component.pose) ? component.pose : []).slice(0, 512).flatMap(/** 保留有骨骼身份的姿态记录，限制身份长度并规范化位置、旋转和缩放。 */ value => {
      if (!value || typeof value.boneId !== 'string') return []
      return [{ boneId: value.boneId.slice(0, 80), position: safeVector(value.position, { x: 0, y: 0 }), rotation: finiteNumber(value.rotation), scale: safeVector(value.scale, { x: 1, y: 1 }) }]
    })
  } else if (component instanceof RhythmChart2D) {
    const reference = (value: unknown) => typeof value === 'string' && value ? value : null
    component.chartAsset = reference(component.chartAsset); component.audioAsset = reference(component.audioAsset); component.hitSoundAsset = reference(component.hitSoundAsset)
    component.leadInSeconds = clamp(component.leadInSeconds, 2, 0, 30); component.unitScale = clamp(component.unitScale, 1, .001, 1000)
    component.scrollSpeed = clamp(component.scrollSpeed, 8, .01, 1000); component.laneWidth = clamp(component.laneWidth, 1.6, .01, 1000)
    component.judgeY = clamp(component.judgeY, -3.5, -1e6, 1e6); component.hitWidth = clamp(component.hitWidth, 1.6, .01, 1000); component.flickSpeed = clamp(component.flickSpeed, 18, .01, 1e6)
    component.perfectMs = clamp(component.perfectMs, 45, 1, 1000); component.greatMs = clamp(component.greatMs, 90, component.perfectMs, 1000)
    component.goodMs = clamp(component.goodMs, 135, component.greatMs, 1000); component.badMs = clamp(component.badMs, 180, component.goodMs, 1000)
    component.offsetMs = clamp(component.offsetMs, 0, -10_000, 10_000); component.volume = clamp(component.volume, 1, 0, 2); component.hitSoundVolume = clamp(component.hitSoundVolume, .5, 0, 2)
    component.bus = typeof component.bus === 'string' && component.bus ? component.bus : 'Music'
    component.laneKeys = typeof component.laneKeys === 'string' ? component.laneKeys.slice(0, 200) : ''
  } else if (component instanceof TimelinePlayer) {
    component.timelineAsset = typeof component.timelineAsset === 'string' ? component.timelineAsset : null
    component.speed = clamp(component.speed, 1, -100, 100)
    component.currentTime = clamp(component.currentTime, 0, 0, 86_400)
  } else if (component instanceof AudioSource) {
    component.audioClip = typeof component.audioClip === 'string' ? component.audioClip : null
    component.volume = clamp(component.volume, 1, 0, 1); component.pitch = clamp(component.pitch, 1, .25, 4)
    component.spatialBlend = clamp(component.spatialBlend, 0, 0, 1); component.minDistance = clamp(component.minDistance, 1, 0, 1e9)
    component.maxDistance = clamp(component.maxDistance, 50, component.minDistance + 1e-6, 1e9)
    component.bus = typeof component.bus === 'string' && component.bus.trim() ? component.bus.trim().slice(0, 80) : 'SFX'
    if (!['Linear', 'Inverse', 'Exponential', 'Custom'].includes(component.attenuationCurve)) component.attenuationCurve = 'Linear'
    component.voicePriority = Math.round(clamp(component.voicePriority, 50, 0, 255))
    if (!['ImportSetting', 'Stream', 'Buffer'].includes(component.streamOverride)) component.streamOverride = 'ImportSetting'
    component.customAttenuation = (Array.isArray(component.customAttenuation) ? component.customAttenuation : []).slice(0, 64).map(/** 构造并返回记录 { distance: clamp(point?.distance, 0, 0, 1), gain: clamp(point?.gain, 1, 0, 1) }，字段按当前实参及捕获状态求值。 */ point => ({ distance: clamp(point?.distance, 0, 0, 1), gain: clamp(point?.gain, 1, 0, 1) })).sort(/* 计算表达式 a.distance - b.distance 并返回结果，沿用操作数的原有类型规则。 */ (a, b) => a.distance - b.distance)
    if (component.customAttenuation.length < 2) component.customAttenuation = [{ distance: 0, gain: 1 }, { distance: 1, gain: 0 }]
  } else if (component instanceof Canvas) {
    component.referenceSize = safeVector(component.referenceSize, { x: 1920, y: 1080 })
    component.referenceSize.x = clamp(component.referenceSize.x, 1920, 1, 100_000)
    component.referenceSize.y = clamp(component.referenceSize.y, 1080, 1, 100_000)
    component.sortingOrder = Math.round(clamp(component.sortingOrder, 0, -1_000_000, 1_000_000))
    component.dpiScale = clamp(component.dpiScale, 1, .25, 8)
    component.localePreview = typeof component.localePreview === 'string' ? component.localePreview.slice(0, 35) : ''
    if (!component.safeAreaInsets || typeof component.safeAreaInsets !== 'object') component.safeAreaInsets = { left: 0, top: 0, right: 0, bottom: 0 }
    for (const side of ['left', 'top', 'right', 'bottom'] as const) component.safeAreaInsets[side] = clamp(component.safeAreaInsets[side], 0, 0, 100_000)
    component.themeAsset = typeof component.themeAsset === 'string' ? component.themeAsset.slice(0, 160) : null
    component.themeVariant = typeof component.themeVariant === 'string' && component.themeVariant.trim() ? component.themeVariant.trim().slice(0, 80) : 'default'
  } else if (component instanceof RectTransform) {
    if (!['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right', 'stretch'].includes(component.anchorPreset)) component.anchorPreset = 'center'
    component.pivot = safeVector(component.pivot, { x: .5, y: .5 }); component.position = safeVector(component.position, { x: 0, y: 0 }); component.size = safeVector(component.size, { x: 240, y: 80 }); component.preferredSize = safeVector(component.preferredSize, component.size); component.anchorMin = safeVector(component.anchorMin, { x: .5, y: .5 }); component.anchorMax = safeVector(component.anchorMax, { x: .5, y: .5 })
    component.pivot.x = clamp(component.pivot.x, .5, 0, 1); component.pivot.y = clamp(component.pivot.y, .5, 0, 1)
    component.anchorMin.x = clamp(component.anchorMin.x, .5, 0, 1); component.anchorMin.y = clamp(component.anchorMin.y, .5, 0, 1); component.anchorMax.x = clamp(component.anchorMax.x, .5, component.anchorMin.x, 1); component.anchorMax.y = clamp(component.anchorMax.y, .5, component.anchorMin.y, 1)
    component.size.x = clamp(component.size.x, 240, 0, 1e9); component.size.y = clamp(component.size.y, 80, 0, 1e9)
    component.preferredSize.x = clamp(component.preferredSize.x, component.size.x, 0, 1e9); component.preferredSize.y = clamp(component.preferredSize.y, component.size.y, 0, 1e9)
    if (!component.margins || typeof component.margins !== 'object') component.margins = { left: 0, top: 0, right: 0, bottom: 0 }
    for (const side of ['left', 'top', 'right', 'bottom'] as const) component.margins[side] = finiteNumber(component.margins[side])
    if (!component.offsets || typeof component.offsets !== 'object') component.offsets = { left: 0, top: 0, right: 0, bottom: 0 }
    for (const side of ['left', 'top', 'right', 'bottom'] as const) component.offsets[side] = finiteNumber(component.offsets[side])
    if (!['Fixed', 'Fill', 'Content'].includes(component.horizontalPolicy)) component.horizontalPolicy = 'Fixed'
    if (!['Fixed', 'Fill', 'Content'].includes(component.verticalPolicy)) component.verticalPolicy = 'Fixed'
    component.minSize = safeVector(component.minSize, { x: 0, y: 0 }); component.maxSize = safeVector(component.maxSize, { x: 100_000, y: 100_000 })
    component.minSize.x = clamp(component.minSize.x, 0, 0, 1e9); component.minSize.y = clamp(component.minSize.y, 0, 0, 1e9)
    component.maxSize.x = clamp(component.maxSize.x, 100_000, component.minSize.x, 1e9); component.maxSize.y = clamp(component.maxSize.y, 100_000, component.minSize.y, 1e9)
    component.aspectRatio = clamp(component.aspectRatio, 0, 0, 1e6)
    if (!['None', 'Fit', 'WidthControlsHeight', 'HeightControlsWidth'].includes(component.aspectConstraint)) component.aspectConstraint = 'None'
    component.breakpoints = (Array.isArray(component.breakpoints) ? component.breakpoints : []).slice(0, 32).map(/** 限制响应断点宽度并恢复可见性与布局坐标，缺失位置尺寸采用当前组件值。 */ point => ({ minWidth: clamp(point?.minWidth, 0, 0, 100_000), maxWidth: clamp(point?.maxWidth, 100_000, 0, 100_000), visible: point?.visible !== false, position: safeVector(point?.position, component.position), size: safeVector(point?.size, component.size) })).filter(/* 比较 point.maxWidth 与 point.minWidth，返回大于或等于的判断结果。 */ point => point.maxWidth >= point.minWidth)
    component.tabIndex = Math.round(clamp(component.tabIndex, 0, -1, 100_000)); component.remapBindingIndex = Math.round(clamp(component.remapBindingIndex, 0, 0, 31))
    for (const key of ['focusUp', 'focusDown', 'focusLeft', 'focusRight'] as const) component[key] = typeof component[key] === 'string' && component[key] ? component[key]!.slice(0, 160) : null
    component.accessibilityRole = typeof component.accessibilityRole === 'string' ? component.accessibilityRole.slice(0, 80) : ''
    component.accessibilityLabel = typeof component.accessibilityLabel === 'string' ? component.accessibilityLabel.slice(0, 500) : ''
    component.accessibilityDescription = typeof component.accessibilityDescription === 'string' ? component.accessibilityDescription.slice(0, 1000) : ''
    component.accessibilityState = typeof component.accessibilityState === 'string' ? component.accessibilityState.slice(0, 500) : ''
    component.accessibilityValue = typeof component.accessibilityValue === 'string' ? component.accessibilityValue.slice(0, 500) : ''
    if (!['Off', 'Polite', 'Assertive'].includes(component.accessibilityLive)) component.accessibilityLive = 'Off'
    component.readingOrder = Math.round(clamp(component.readingOrder, component.tabIndex, 0, 100_000))
    component.remapAction = typeof component.remapAction === 'string' ? component.remapAction.slice(0, 80) : ''
  } else if (component instanceof Panel) {
    component.color = safeColor(component.color, { r: 35, g: 41, b: 52 })
    component.opacity = clamp(component.opacity, 92, 0, 100); component.cornerRadius = clamp(component.cornerRadius, 14, 0, 1e6)
    if (!['None', 'Row', 'Column', 'Grid', 'Flow', 'Overlay', 'Center', 'Margin', 'Aspect', 'Split', 'Horizontal', 'Vertical'].includes(component.layout)) component.layout = 'None'
    component.gap = clamp(component.gap, 8, 0, 1e6); component.columns = Math.round(clamp(component.columns, 2, 1, 64)); component.scrollSpeed = clamp(component.scrollSpeed, 42, 0, 1e6)
    if (!component.padding || typeof component.padding !== 'object') component.padding = { left: 0, top: 0, right: 0, bottom: 0 }
    for (const side of ['left', 'top', 'right', 'bottom'] as const) component.padding[side] = finiteNumber(component.padding[side])
    component.scrollOffset = safeVector(component.scrollOffset, { x: 0, y: 0 }); component.contentSize = safeVector(component.contentSize, { x: 0, y: 0 })
    if (!['Normal', 'Modal', 'Popup', 'Tooltip'].includes(component.behavior)) component.behavior = 'Normal'
    component.dropGroup = typeof component.dropGroup === 'string' ? component.dropGroup.slice(0, 80) : ''
    component.tooltipText = typeof component.tooltipText === 'string' ? component.tooltipText.slice(0, 2000) : ''
    component.tooltipDelay = clamp(component.tooltipDelay, .45, 0, 10)
    component.styleClass = typeof component.styleClass === 'string' ? component.styleClass.slice(0, 80) : 'panel'
    component.styleOverrides = safeStyleOverrides(component.styleOverrides)
  } else if (component instanceof UIImage) {
    component.tint = safeColor(component.tint, { r: 255, g: 255, b: 255 })
    component.spriteAsset = typeof component.spriteAsset === 'string' ? component.spriteAsset : null
    component.opacity = clamp(component.opacity, 100, 0, 100)
  } else if (component instanceof UIText) {
    component.color = safeColor(component.color, { r: 245, g: 248, b: 252 })
    component.text = typeof component.text === 'string' ? component.text.slice(0, 100_000) : 'Text'
    component.fontAsset = typeof component.fontAsset === 'string' ? component.fontAsset : null
    component.fontFamily = typeof component.fontFamily === 'string' ? component.fontFamily.slice(0, 200) : 'Nunito Sans, sans-serif'
    component.fontSize = clamp(component.fontSize, 24, 1, 1000); component.fontWeight = Math.round(clamp(component.fontWeight, 600, 100, 900)); component.opacity = clamp(component.opacity, 100, 0, 100)
    if (!['left', 'right', 'center', 'start', 'end'].includes(component.align)) component.align = 'center'
    component.localizationKey = typeof component.localizationKey === 'string' ? component.localizationKey.slice(0, 240) : ''
    if (!component.localizationVariables || typeof component.localizationVariables !== 'object' || Array.isArray(component.localizationVariables)) component.localizationVariables = {}
  } else if (component instanceof Button) {
    component.normalColor = safeColor(component.normalColor, { r: 45, g: 106, b: 214 }); component.hoveredColor = safeColor(component.hoveredColor, { r: 61, g: 126, b: 235 }); component.pressedColor = safeColor(component.pressedColor, { r: 31, g: 82, b: 174 }); component.disabledColor = safeColor(component.disabledColor, { r: 90, g: 97, b: 110 })
    component.state = component.interactable ? 'Normal' : 'Disabled'
    component.onPressed = typeof component.onPressed === 'string' ? component.onPressed.slice(0, 80) : 'on_pressed'; component.onHoverEnter = typeof component.onHoverEnter === 'string' ? component.onHoverEnter.slice(0, 80) : 'on_hover_enter'; component.onHoverExit = typeof component.onHoverExit === 'string' ? component.onHoverExit.slice(0, 80) : 'on_hover_exit'
    component.pressAudio = typeof component.pressAudio === 'string' ? component.pressAudio.slice(0, 160) : null; component.hoverAudio = typeof component.hoverAudio === 'string' ? component.hoverAudio.slice(0, 160) : null; component.focusAudio = typeof component.focusAudio === 'string' ? component.focusAudio.slice(0, 160) : null
    component.styleClass = typeof component.styleClass === 'string' ? component.styleClass.slice(0, 80) : 'button'
    component.styleOverrides = safeStyleOverrides(component.styleOverrides)
  } else if (component instanceof Slider || component instanceof ProgressBar) {
    component.min = finiteNumber(component.min); component.max = Math.max(component.min + 1e-9, finiteNumber(component.max, 1)); component.value = clamp(component.value, .5, component.min, component.max)
    if (component instanceof ProgressBar) { component.fillColor = safeColor(component.fillColor, { r: 79, g: 150, b: 255 }); component.backgroundColor = safeColor(component.backgroundColor, { r: 31, g: 37, b: 47 }) }
    component.styleClass = typeof component.styleClass === 'string' ? component.styleClass.slice(0, 80) : component instanceof ProgressBar ? 'progress' : 'slider'
    component.styleOverrides = safeStyleOverrides(component.styleOverrides)
  } else if (component instanceof Checkbox) {
    component.label = typeof component.label === 'string' ? component.label.slice(0, 1000) : 'Checkbox'
    component.localizationKey = typeof component.localizationKey === 'string' ? component.localizationKey.slice(0, 240) : ''
    component.styleClass = typeof component.styleClass === 'string' ? component.styleClass.slice(0, 80) : 'checkbox'; component.styleOverrides = safeStyleOverrides(component.styleOverrides)
  } else if (component instanceof TextInput) {
    component.value = typeof component.value === 'string' ? truncateUtf16(component.value, 100_000) : ''
    component.placeholder = typeof component.placeholder === 'string' ? component.placeholder.slice(0, 1000) : ''
    component.maxLength = Math.round(clamp(component.maxLength, 256, 0, 100_000)); component.value = truncateUtf16(component.value, component.maxLength)
    component.styleClass = typeof component.styleClass === 'string' ? component.styleClass.slice(0, 80) : 'input'; component.styleOverrides = safeStyleOverrides(component.styleOverrides)
  } else if (component instanceof TileMap2D) {
    normalizeTileMap(component)
    invalidateTileMap(component)
  } else if (component instanceof CharacterBody2D) {
    component.maxSlopeAngle = clamp(component.maxSlopeAngle, 45, 0, 89.9); component.stepHeight = clamp(component.stepHeight, .35, 0, 1e6)
    component.floorSnap = clamp(component.floorSnap, .15, 0, 1e6); component.safeMargin = clamp(component.safeMargin, .001, 1e-9, 1e3)
    component.maxSlides = Math.round(clamp(component.maxSlides, 4, 1, 32)); component.coyoteTime = clamp(component.coyoteTime, .12, 0, 60)
    component.collisionMask = Math.round(clamp(component.collisionMask, 0xffff_ffff, 0, 0xffff_ffff)) >>> 0
  } else if (component instanceof Area2D) {
    component.size = safeVector(component.size, { x: 4, y: 4 }); component.size.x = clamp(component.size.x, 4, 1e-6, 1e9); component.size.y = clamp(component.size.y, 4, 1e-6, 1e9)
    component.radius = clamp(component.radius, 2, 1e-6, 1e9); component.collisionMask = Math.round(clamp(component.collisionMask, 0xffff_ffff, 0, 0xffff_ffff)) >>> 0
    if (!['Box', 'Circle'].includes(component.shape)) component.shape = 'Box'
  } else if (component instanceof AreaEffector2D) {
    component.priority = Math.round(clamp(component.priority, 0, -10_000, 10_000)); component.effectors = (Array.isArray(component.effectors) ? component.effectors : []).slice(0, 32).map(/** 规范化区域效果类型、身份、方向和受力参数，非法类型回退为信号效果。 */ (effect, index) => ({
      id: typeof effect.id === 'string' ? effect.id.slice(0, 80) : `effect-${index}`, kind: ['Gravity', 'Wind', 'Drag', 'Buoyancy', 'PointGravity', 'Damage', 'Signal'].includes(effect.kind) ? effect.kind : 'Signal',
      enabled: effect.enabled !== false, direction: safeVector(effect.direction, { x: 0, y: -1 }), strength: finiteNumber(effect.strength), drag: clamp(effect.drag, 0, 0, 1e9),
      fluidDensity: clamp(effect.fluidDensity, 1, 0, 1e9), damagePerSecond: clamp(effect.damagePerSecond, 0, 0, 1e9), signal: typeof effect.signal === 'string' ? effect.signal.slice(0, 128) : 'area.effect',
      ...(effect.angularDrag !== undefined ? { angularDrag: clamp(effect.angularDrag, 0, 0, 1e9) } : {}), ...(effect.falloff !== undefined ? { falloff: (['None', 'Linear', 'InverseSquare'] as const).includes(effect.falloff) ? effect.falloff : 'None' } : {})
    }))
  } else if (component instanceof NavigationRegion2D) {
    component.polygon = (Array.isArray(component.polygon) ? component.polygon : []).slice(0, 4096).map(/* 调用 safeVector(point, { x: 0, y: 0 }) 并返回调用结果。 */ point => safeVector(point, { x: 0, y: 0 }))
    component.cellSize = clamp(component.cellSize, .5, .01, 1e6); component.clusterSize = Math.round(clamp(component.clusterSize, 16, 4, 64)); component.rebakeInterval = clamp(component.rebakeInterval, .5, .02, 60); component.navigationLayer = Math.round(clamp(component.navigationLayer, 1, 1, 32)); component.navigationMask = Math.round(clamp(component.navigationMask, 1, 0, 0xffff_ffff)) >>> 0; component.traversalCost = clamp(component.traversalCost, 1, .001, 1e6); component.agentRadius = clamp(component.agentRadius, .4, 0, 1e6)
    if (!['Grid', 'Polygon'].includes(component.navigationMode)) component.navigationMode = 'Grid'
    if (!['SceneGeometry', 'TileMap', 'Manual'].includes(component.source)) component.source = 'Manual'
    component.sourceEntityUuid = typeof component.sourceEntityUuid === 'string' ? component.sourceEntityUuid.slice(0, 128) : null
    component.links = (Array.isArray(component.links) ? component.links : []).slice(0, 2048).map(/** 规范化导航连接身份、端点、代价及方向启用标记。 */ (link, index) => ({ id: typeof link.id === 'string' ? link.id.slice(0, 80) : `link-${index}`, start: safeVector(link.start, { x: 0, y: 0 }), end: safeVector(link.end, { x: 1, y: 0 }), bidirectional: link.bidirectional !== false, cost: clamp(link.cost, 1, .001, 1e6), enabled: link.enabled !== false }))
    component.costAreas = (Array.isArray(component.costAreas) ? component.costAreas : []).slice(0, 2048).map(/** 规范化导航代价区域的形状、位置尺寸、倍率和导航层。 */ (area, index) => { const size = safeVector(area.size, { x: 1, y: 1 }); return { id: typeof area.id === 'string' ? area.id.slice(0, 80) : `cost-${index}`, name: typeof area.name === 'string' ? area.name.slice(0, 80) : `Cost ${index + 1}`, shape: area.shape === 'Circle' ? 'Circle' as const : 'Box' as const, center: safeVector(area.center, { x: 0, y: 0 }), size: { x: clamp(size.x, 1, .001, 1e6), y: clamp(size.y, 1, .001, 1e6) }, radius: clamp(area.radius, 1, .001, 1e6), multiplier: clamp(area.multiplier, 1, .001, 1_000), navigationLayer: Math.round(clamp(area.navigationLayer, component.navigationLayer, 1, 32)), enabled: area.enabled !== false } })
    if (!['AStar', 'HierarchicalAStar', 'FlowField'].includes(component.algorithm)) component.algorithm = 'AStar'
  } else if (component instanceof NavigationObstacle2D) {
    component.size = safeVector(component.size, { x: 1, y: 1 }); component.size.x = clamp(component.size.x, 1, .001, 1e6); component.size.y = clamp(component.size.y, 1, .001, 1e6); component.radius = clamp(component.radius, .5, .001, 1e6); component.navigationLayer = Math.round(clamp(component.navigationLayer, 1, 1, 32)); component.avoidanceVelocity = safeVector(component.avoidanceVelocity, { x: 0, y: 0 }); component.dynamic = component.dynamic !== false; if (!['Box', 'Circle'].includes(component.shape)) component.shape = 'Circle'
  } else if (component instanceof NavigationAgent2D) {
    component.targetPosition = safeVector(component.targetPosition, { x: 0, y: 0 }); component.targetEntityUuid = typeof component.targetEntityUuid === 'string' ? component.targetEntityUuid.slice(0, 128) : null
    component.speed = clamp(component.speed, 4, 0, 1e6); component.acceleration = clamp(component.acceleration, 20, 0, 1e9); component.radius = clamp(component.radius, .4, .001, 1e6); component.stoppingDistance = clamp(component.stoppingDistance, .1, 0, 1e6); component.avoidanceRadius = clamp(component.avoidanceRadius, 1.2, 0, 1e6); component.maximumAvoidanceNeighbors = Math.round(clamp(component.maximumAvoidanceNeighbors, 16, 1, 32)); component.repathInterval = clamp(component.repathInterval, .25, .02, 60); component.navigationLayer = Math.round(clamp(component.navigationLayer, 1, 1, 32)); component.navigationMask = Math.round(clamp(component.navigationMask, 1, 0, 0xffff_ffff)) >>> 0; component.avoidancePriority = clamp(component.avoidancePriority, .5, 0, 1); component.velocity = safeVector(component.velocity, { x: 0, y: 0 }); component.path = (Array.isArray(component.path) ? component.path : []).slice(0, 65_536).map(/* 调用 safeVector(point, { x: 0, y: 0 }) 并返回调用结果。 */ point => safeVector(point, { x: 0, y: 0 })); component.pathIndex = Math.round(clamp(component.pathIndex, 0, 0, component.path.length)); if (!['Idle', 'Pending', 'Ready', 'Unreachable'].includes(component.pathStatus)) component.pathStatus = 'Idle'
  } else if (component instanceof BehaviorTree2D) {
    component.treeAsset = typeof component.treeAsset === 'string' ? component.treeAsset : null; component.tickRate = clamp(component.tickRate, 10, 1, 1000); component.blackboardOverrides = Object.fromEntries(Object.entries(component.blackboardOverrides && typeof component.blackboardOverrides === 'object' ? component.blackboardOverrides : {}).slice(0, 256).flatMap(/** 保留布尔、有限数字及受限长度文本黑板值，并限制键长度。 */ ([key, value]) => typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' ? [[key.slice(0, 80), typeof value === 'string' ? value.slice(0, 256) : value]] : []))
  } else if (component instanceof StateMachine2D) component.machineAsset = typeof component.machineAsset === 'string' ? component.machineAsset : null
  else if (component instanceof GridMover2D) { component.action = typeof component.action === 'string' ? component.action.slice(0, 80) : 'Move'; component.cellSize = safeVector(component.cellSize, { x: 1, y: 1 }); component.cellSize.x = clamp(component.cellSize.x, 1, .000001, 1e9); component.cellSize.y = clamp(component.cellSize.y, 1, .000001, 1e9); component.repeatDelay = clamp(component.repeatDelay, .12, 0, 60) }
  else if (component instanceof PlatformController2D) { component.moveAction = typeof component.moveAction === 'string' ? component.moveAction.slice(0, 80) : 'Horizontal'; component.jumpAction = typeof component.jumpAction === 'string' ? component.jumpAction.slice(0, 80) : 'Jump'; component.speed = clamp(component.speed, 6, 0, 1e6); component.acceleration = clamp(component.acceleration, 36, 0, 1e9); component.airControl = clamp(component.airControl, .55, 0, 1); component.jumpImpulse = clamp(component.jumpImpulse, 10, 0, 1e9); component.maximumFallSpeed = clamp(component.maximumFallSpeed, 30, 0, 1e9); component.jumpBufferTime = clamp(component.jumpBufferTime, .1, 0, 2); component.jumpCutFactor = clamp(component.jumpCutFactor, 1, 0, 1); component.dropThroughAction = typeof component.dropThroughAction === 'string' ? component.dropThroughAction.slice(0, 80) : '' }
  else if (component instanceof TopDownController2D) { component.moveAction = typeof component.moveAction === 'string' ? component.moveAction.slice(0, 80) : 'Move'; component.speed = clamp(component.speed, 5, 0, 1e6); component.acceleration = clamp(component.acceleration, 30, 0, 1e9) }
  else if (component instanceof Health2D) { component.maximum = clamp(component.maximum, 100, .000001, 1e12); component.current = clamp(component.current, component.maximum, 0, component.maximum); component.invulnerabilitySeconds = clamp(component.invulnerabilitySeconds, 0, 0, 86_400); component.damagedSignal = typeof component.damagedSignal === 'string' ? component.damagedSignal.slice(0, 128) : 'health.damaged'; component.diedSignal = typeof component.diedSignal === 'string' ? component.diedSignal.slice(0, 128) : 'health.died' }
  else if (component instanceof DamageHitbox2D) { component.damage = clamp(component.damage, 10, 0, 1e12); component.knockback = clamp(component.knockback, 0, 0, 1e12); component.targetTag = typeof component.targetTag === 'string' ? component.targetTag.slice(0, 80) : 'damageable'; component.hitCooldown = clamp(component.hitCooldown, .1, 0, 86_400); component.hitSignal = typeof component.hitSignal === 'string' ? component.hitSignal.slice(0, 128) : 'damage.hit' }
  else if (component instanceof Collectible2D) { component.collectorTag = typeof component.collectorTag === 'string' ? component.collectorTag.slice(0, 80) : 'player'; component.score = finiteNumber(component.score, 1); component.collectedSignal = typeof component.collectedSignal === 'string' ? component.collectedSignal.slice(0, 128) : 'collectible.collected' }
  else if (component instanceof Projectile2D) { component.speed = clamp(component.speed, 12, 0, 1e9); component.direction = safeVector(component.direction, { x: 1, y: 0 }); component.damage = clamp(component.damage, 10, 0, 1e12); component.ownerUuid = typeof component.ownerUuid === 'string' ? component.ownerUuid.slice(0, 128) : ''; component.lifetime = clamp(component.lifetime, 5, 0, 86_400) }
  else if (component instanceof Spawner2D) { component.prefabAsset = typeof component.prefabAsset === 'string' ? component.prefabAsset : null; component.interval = clamp(component.interval, 1, .000001, 86_400); component.initialDelay = clamp(component.initialDelay, 0, 0, 86_400); component.burst = Math.round(clamp(component.burst, 1, 1, 256)); component.maximumAlive = Math.round(clamp(component.maximumAlive, 32, 1, 100_000)) }
  else if (component instanceof Cooldown2D) { component.duration = clamp(component.duration, 1, .000001, 86_400); component.readySignal = typeof component.readySignal === 'string' ? component.readySignal.slice(0, 128) : 'cooldown.ready' }
  else if (component instanceof Lifetime2D) component.seconds = clamp(component.seconds, 5, .000001, 86_400)
  else if (component instanceof TargetJoint2D) {
    component.anchor = safeVector(component.anchor, { x: 0, y: 0 }); component.target = safeVector(component.target, { x: 0, y: 0 })
    component.frequency = clamp(component.frequency, 5, 0.01, 1000); component.dampingRatio = clamp(component.dampingRatio, 0.7, 0, 1000)
    component.maxForce = clamp(component.maxForce, 1000, 0, 1e12); component.startAtBody = component.startAtBody !== false
  }
  else if (component instanceof MouseFollower2D) { component.offset = safeVector(component.offset, { x: 0, y: 0 }); component.maximumSpeed = clamp(component.maximumSpeed, 0, 0, 1e9) }
  else if (component instanceof CameraFollow2D) { component.targetUuid = typeof component.targetUuid === 'string' ? component.targetUuid.slice(0, 128) : ''; component.targetTag = typeof component.targetTag === 'string' ? component.targetTag.slice(0, 80) : 'player'; component.offset = safeVector(component.offset, { x: 0, y: 0 }); component.smoothing = clamp(component.smoothing, 8, 0, 1e6); component.deadZone = safeVector(component.deadZone, { x: 0, y: 0 }); component.deadZone.x = clamp(component.deadZone.x, 0, 0, 1e9); component.deadZone.y = clamp(component.deadZone.y, 0, 0, 1e9) }
  else if (component instanceof WorldChunk2D) {
    component.size = safeVector(component.size, { x: 64, y: 64 }); component.loadDistance = clamp(component.loadDistance, 96, 0, 1e9); component.unloadDistance = clamp(component.unloadDistance, 128, component.loadDistance, 1e9); component.preloadPriority = Math.round(clamp(component.preloadPriority, 0, -1e6, 1e6)); component.memoryEstimateMb = clamp(component.memoryEstimateMb, 8, .001, 1e6); component.sceneUuid = typeof component.sceneUuid === 'string' ? component.sceneUuid.slice(0, 128) : ''
  } else if (component instanceof Portal2D) {
    component.targetSceneUuid = typeof component.targetSceneUuid === 'string' ? component.targetSceneUuid.slice(0, 128) : ''; component.targetPortal = typeof component.targetPortal === 'string' ? component.targetPortal.slice(0, 128) : ''; component.triggerRadius = clamp(component.triggerRadius, 1, .001, 1e6)
  } else if (component instanceof ObjectPool2D) {
    component.prefabAsset = typeof component.prefabAsset === 'string' ? component.prefabAsset : null; component.prewarm = Math.round(clamp(component.prewarm, 8, 0, 100_000)); component.capacity = Math.round(clamp(component.capacity, 32, Math.max(1, component.prewarm), 100_000))
  } else if (component instanceof ParticleEmitter2D) {
    normalizeParticleEmitter(component)
  } else if (component instanceof Light2D) {
    if (!['Point', 'Spot', 'Directional', 'Area'].includes(component.lightType)) component.lightType = 'Point'
    component.color = safeColor(component.color, { r: 255, g: 235, b: 196 })
    component.intensity = clamp(component.intensity, 1, 0, 32)
    component.range = clamp(component.range, 8, .001, 1e6)
    component.innerAngle = clamp(component.innerAngle, 30, 0, 179)
    component.outerAngle = clamp(component.outerAngle, 55, component.innerAngle, 179)
    component.areaSize = safeVector(component.areaSize, { x: 4, y: 2 })
    component.areaSize.x = clamp(component.areaSize.x, 4, .001, 1e6); component.areaSize.y = clamp(component.areaSize.y, 2, .001, 1e6)
    component.layerMask = Math.round(clamp(component.layerMask, 0xffff_ffff, 0, 0xffff_ffff)) >>> 0
    component.shadowSoftness = clamp(component.shadowSoftness, .5, 0, 1)
  } else if (component instanceof ShadowCaster2D) {
    component.layerMask = Math.round(clamp(component.layerMask, 0xffff_ffff, 0, 0xffff_ffff)) >>> 0
    component.opacity = clamp(component.opacity, .85, 0, 1)
  } else if (component instanceof Joint2D) {
    component.targetEntityUuid = typeof component.targetEntityUuid === 'string' ? component.targetEntityUuid : null
    component.anchor = safeVector(component.anchor, { x: 0, y: 0 }); component.connectedAnchor = safeVector(component.connectedAnchor, { x: 0, y: 0 })
    component.axis = safeVector(component.axis, { x: 1, y: 0 }); const axisLength = Math.hypot(component.axis.x, component.axis.y)
    component.axis = axisLength > 1e-9 ? { x: component.axis.x / axisLength, y: component.axis.y / axisLength } : { x: 1, y: 0 }
    component.distance = clamp(component.distance, 1, 0, 1e9); component.stiffness = clamp(component.stiffness, 1200, 0, 1e12); component.damping = clamp(component.damping, 35, 0, 1e9)
    component.lowerLimit = finiteNumber(component.lowerLimit, -1); component.upperLimit = Math.max(component.lowerLimit, finiteNumber(component.upperLimit, 1))
    component.referenceOffset = safeVector(component.referenceOffset, { x: 0, y: 0 }); component.referenceAngle = finiteNumber(component.referenceAngle)
    component.motorSpeed = finiteNumber(component.motorSpeed); component.maxMotorForce = clamp(component.maxMotorForce, 1000, 0, 1e12)
    // JSON uses null for an authored unlimited threshold; keep that sentinel unlimited.
    component.breakForce = normalizeJointBreakThreshold(component.breakForce)
    component.breakTorque = normalizeJointBreakThreshold(component.breakTorque)
    component.frequency = clamp(component.frequency, component.kind === 'WheelJoint2D' ? 4 : 0, 0, 1000); component.dampingRatio = clamp(component.dampingRatio, 0.7, 0, 1000)
    component.angularFrequency = clamp(component.angularFrequency, 0, 0, 1000); component.angularDampingRatio = clamp(component.angularDampingRatio, 0.7, 0, 1000)
  }
}

/** 从组件记录重建变换、渲染、脚本、扩展和物理组件，保留作者组件顺序与必要旧格式默认值。 */ function applyStoredComponents(entity: Entity, item: SceneEntityData): void {
  if (!Array.isArray(item.components)) return

  const transformSource = storedComponent(item, 'Transform2D')
  if (transformSource) {
    const data = recordData(transformSource)
    const transform = new Transform(transformSource.uuid)
    applyComponentMetadata(transform, transformSource)
    transform.parentUuid = typeof data.parentUuid === 'string' ? data.parentUuid : null
    copyVector(transform.position, data.position)
    copyVector(transform.scale, data.scale)
    transform.rotation = finiteNumber(data.rotation, transform.rotation)
    transform.removed = false
    transform.enabled = true
    entity.componentMap.set('Transform2D', transform)
  }

  const rendererSource = storedComponent(item, 'ShapeRenderer2D')
  if (rendererSource) {
    const data = recordData(rendererSource)
    const shape = data.shape === 'Ellipse' || data.shape === 'Polygon' || data.shape === 'Line' ? data.shape : 'Rectangle'
    const renderer = new ShapeRenderer2D(shape, rendererSource.uuid)
    applyComponentMetadata(renderer, rendererSource)
    const vertices = normalizedVertices(data.vertices as SceneEntityData['vertices'])
    if (vertices) renderer.vertices = vertices
    renderer.radiusX = Math.max(1e-9, finiteNumber(data.radiusX, renderer.radiusX))
    renderer.radiusY = Math.max(1e-9, finiteNumber(data.radiusY, renderer.radiusY))
    if (data.color && typeof data.color === 'object') {
      const color = data.color as Record<string, unknown>
      renderer.color = {
        r: finiteNumber(color.r, renderer.color.r),
        g: finiteNumber(color.g, renderer.color.g),
        b: finiteNumber(color.b, renderer.color.b)
      }
    }
    renderer.opacity = finiteNumber(data.opacity, renderer.opacity)
    if (data.strokeColor && typeof data.strokeColor === 'object') {
      const color = data.strokeColor as Record<string, unknown>
      renderer.strokeColor = { r: finiteNumber(color.r, renderer.strokeColor.r), g: finiteNumber(color.g, renderer.strokeColor.g), b: finiteNumber(color.b, renderer.strokeColor.b) }
    }
    renderer.strokeOpacity = finiteNumber(data.strokeOpacity, renderer.strokeOpacity)
    renderer.strokeWidth = Math.max(0, finiteNumber(data.strokeWidth, renderer.strokeWidth))
    renderer.material = typeof data.material === 'string' ? data.material.slice(0, 80) : renderer.material
    renderer.filterMode = data.filterMode === 'Nearest' ? 'Nearest' : 'Linear'
    renderer.textureAsset = typeof data.textureAsset === 'string' ? data.textureAsset : null
    renderer.texture = typeof data.texture === 'string' ? data.texture : null
    renderer.sortingLayer = normalizeIdentifier(data.sortingLayer, renderer.sortingLayer)
    renderer.orderInLayer = Math.round(finiteNumber(data.orderInLayer, renderer.orderInLayer))
    entity.componentMap.set('ShapeRenderer2D', renderer)
  } else {
    entity.removeComponent('ShapeRenderer2D')
  }

  const spriteSource = storedComponent(item, 'SpriteRenderer2D')
  if (spriteSource) {
    const data = recordData(spriteSource)
    const sprite = new SpriteRenderer2D(spriteSource.uuid)
    applyComponentMetadata(sprite, spriteSource)
    sprite.spriteAsset = typeof data.spriteAsset === 'string' ? data.spriteAsset : null
    if (data.tint && typeof data.tint === 'object') {
      const color = data.tint as Record<string, unknown>
      sprite.tint = { r: finiteNumber(color.r, 255), g: finiteNumber(color.g, 255), b: finiteNumber(color.b, 255) }
    }
    sprite.opacity = finiteNumber(data.opacity, sprite.opacity)
    sprite.flipX = data.flipX === true; sprite.flipY = data.flipY === true
    copyVector(sprite.pivot, data.pivot); copyVector(sprite.size, data.size)
    sprite.sortingLayer = normalizeIdentifier(data.sortingLayer, sprite.sortingLayer)
    sprite.orderInLayer = Math.round(finiteNumber(data.orderInLayer, sprite.orderInLayer))
    sprite.material = typeof data.material === 'string' ? data.material.slice(0, 80) : sprite.material
    sprite.filterMode = data.filterMode === 'Nearest' ? 'Nearest' : 'Linear'
    sprite.normalMapAsset = typeof data.normalMapAsset === 'string' ? data.normalMapAsset : null
    sprite.lightMask = Math.round(clamp(data.lightMask, 0xffff_ffff, 0, 0xffff_ffff)) >>> 0
    if (data.nineSlice && typeof data.nineSlice === 'object') Object.assign(sprite.nineSlice, data.nineSlice)
    entity.componentMap.set('SpriteRenderer2D', sprite)
  }

  const textSource = storedComponent(item, 'TextRenderer2D')
  if (textSource) {
    const data = recordData(textSource)
    const text = new TextRenderer2D(textSource.uuid)
    applyComponentMetadata(text, textSource)
    text.text = typeof data.text === 'string' ? data.text.slice(0, 10_000) : text.text
    text.fontAsset = typeof data.fontAsset === 'string' ? data.fontAsset : null
    text.fontFamily = typeof data.fontFamily === 'string' ? data.fontFamily.slice(0, 200) : text.fontFamily
    text.fontSize = Math.max(.000001, finiteNumber(data.fontSize, text.fontSize))
    text.fontWeight = Math.min(900, Math.max(100, Math.round(finiteNumber(data.fontWeight, text.fontWeight))))
    text.lineHeight = Math.min(10, Math.max(.1, finiteNumber(data.lineHeight, text.lineHeight)))
    if (['left', 'right', 'center', 'start', 'end'].includes(String(data.align))) text.align = data.align as CanvasTextAlign
    if (data.color && typeof data.color === 'object') {
      const color = data.color as Record<string, unknown>
      text.color = { r: finiteNumber(color.r, 255), g: finiteNumber(color.g, 255), b: finiteNumber(color.b, 255) }
    }
    text.opacity = finiteNumber(data.opacity, text.opacity)
    text.maxWidth = Math.max(0, finiteNumber(data.maxWidth, text.maxWidth))
    text.sortingLayer = normalizeIdentifier(data.sortingLayer, text.sortingLayer)
    text.orderInLayer = Math.round(finiteNumber(data.orderInLayer, text.orderInLayer))
    text.material = typeof data.material === 'string' ? data.material.slice(0, 80) : text.material
    entity.componentMap.set('TextRenderer2D', text)
  }

  const cameraSource = storedComponent(item, 'Camera2D')
  if (cameraSource) {
    const data = recordData(cameraSource)
    const camera = new Camera2D(cameraSource.uuid)
    applyComponentMetadata(camera, cameraSource)
    camera.active = data.active !== false
    camera.orthographicSize = Math.max(.000001, finiteNumber(data.orthographicSize, camera.orthographicSize))
    if (data.viewport && typeof data.viewport === 'object') {
      const viewport = data.viewport as Record<string, unknown>
      camera.viewport = {
        x: Math.min(1, Math.max(0, finiteNumber(viewport.x))), y: Math.min(1, Math.max(0, finiteNumber(viewport.y))),
        width: Math.min(1, Math.max(.000001, finiteNumber(viewport.width, 1))), height: Math.min(1, Math.max(.000001, finiteNumber(viewport.height, 1)))
      }
    }
    if (data.backgroundColor && typeof data.backgroundColor === 'object') {
      const color = data.backgroundColor as Record<string, unknown>
      camera.backgroundColor = { r: finiteNumber(color.r, 17), g: finiteNumber(color.g, 21), b: finiteNumber(color.b, 27) }
    }
    camera.nearSortingLayer = Math.round(finiteNumber(data.nearSortingLayer, camera.nearSortingLayer))
    camera.farSortingLayer = Math.round(finiteNumber(data.farSortingLayer, camera.farSortingLayer))
    camera.pixelPerfect = data.pixelPerfect === true
    camera.zoom = Math.max(.000001, finiteNumber(data.zoom, camera.zoom))
    camera.priority = Math.round(finiteNumber(data.priority, 0)); camera.stackOrder = Math.round(finiteNumber(data.stackOrder, 0))
    camera.cullingMask = Math.round(clamp(data.cullingMask, 0xffff_ffff, 0, 0xffff_ffff)) >>> 0
    camera.clearColor = data.clearColor !== false
    camera.renderTexture = typeof data.renderTexture === 'string' ? data.renderTexture.slice(0, 120) : ''
    camera.previewInEditor = data.previewInEditor !== false
    camera.followTargetUuid = typeof data.followTargetUuid === 'string' ? data.followTargetUuid : null
    if (data.smoothing && typeof data.smoothing === 'object') { const value = data.smoothing as Record<string, unknown>; camera.smoothing = { enabled: value.enabled === true, speed: Math.max(0, finiteNumber(value.speed, 5)) } }
    if (data.limits && typeof data.limits === 'object') { const value = data.limits as Record<string, unknown>; camera.limits = { enabled: value.enabled === true, left: finiteNumber(value.left, -100), right: finiteNumber(value.right, 100), bottom: finiteNumber(value.bottom, -100), top: finiteNumber(value.top, 100) } }
    if (data.dragMargins && typeof data.dragMargins === 'object') { const value = data.dragMargins as Record<string, unknown>; camera.dragMargins = { enabled: value.enabled === true, left: Math.min(1, Math.max(0, finiteNumber(value.left, .1))), right: Math.min(1, Math.max(0, finiteNumber(value.right, .1))), top: Math.min(1, Math.max(0, finiteNumber(value.top, .1))), bottom: Math.min(1, Math.max(0, finiteNumber(value.bottom, .1))) } }
    entity.componentMap.set('Camera2D', camera)
  }

  const scriptSource = storedComponent(item, 'Script2D')
  if (scriptSource) {
    const data = recordData(scriptSource)
    const script = new Script2D(scriptSource.uuid)
    applyComponentMetadata(script, scriptSource)
    script.scriptAsset = typeof data.scriptAsset === 'string' ? data.scriptAsset : null
    script.eventSheetAsset = typeof data.eventSheetAsset === 'string' ? data.eventSheetAsset : null
    script.objectBlueprintAsset = typeof data.objectBlueprintAsset === 'string' ? data.objectBlueprintAsset : null
    const safeScriptProperty = /** 限制脚本属性嵌套深度与集合规模，仅保留可序列化基础值和有限数值，非法值返回 undefined。 */ (value: unknown, depth = 0): ScriptPropertyValue | undefined => {
      if (depth > 8) return undefined
      if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
      if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
      if (Array.isArray(value)) return value.slice(0, 1024).flatMap(/** 递归规范化脚本数组成员并过滤不支持的值。 */ item => { const safe = safeScriptProperty(item, depth + 1); return safe === undefined ? [] : [safe] })
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 1024).flatMap(/** 递归规范化脚本对象字段，限制键长度并过滤不支持的值。 */ ([key, item]) => { const safe = safeScriptProperty(item, depth + 1); return safe === undefined ? [] : [[key.slice(0, 128), safe]] }))
      return undefined
    }
    if (data.properties && typeof data.properties === 'object' && !Array.isArray(data.properties)) {
      for (const [name, value] of Object.entries(data.properties as Record<string, unknown>)) {
        const safe = safeScriptProperty(value)
        if (safe !== undefined) script.properties[name] = safe
      }
    }
    entity.componentMap.set('Script2D', script)
  }

  for (const kind of EXTENDED_COMPONENT_KINDS) {
    const source = storedComponent(item, kind)
    if (!source) continue
    const component = createExtendedComponent(kind, source.uuid)
    pasteComponentValues(component, recordData(source))
    // Envelope metadata is authoritative; a stale data.enabled must not re-enable a removed component.
    applyComponentMetadata(component, source)
    normalizeExtendedComponent(component)
    entity.componentMap.set(kind, component)
  }

  const bodySource = storedComponent(item, 'RigidBody2D')
  if (bodySource) {
    const data = recordData(bodySource)
    const body = new RigidBody2D(bodySource.uuid)
    applyComponentMetadata(body, bodySource)
    if (data.bodyType === 'Static' || data.bodyType === 'Kinematic') body.bodyType = data.bodyType
    if (data.massMode === 'Manual') body.massMode = 'Manual'
    if (typeof data.autoInertia === 'boolean') body.autoInertia = data.autoInertia
    for (const property of ['density', 'mass', 'inertia', 'gravityScale', 'localGravity', 'angularVelocity', 'linearDamping', 'angularDamping', 'torque'] as const) {
      body[property] = finiteNumber(data[property], body[property])
    }
    copyVector(body.velocity, data.velocity)
    copyVector(body.acceleration, data.acceleration)
    copyVector(body.force, data.force)
    body.continuousCollision = data.continuousCollision === 'Continuous' ? 'Continuous' : 'Discrete'
    if (typeof data.sleepingAllowed === 'boolean') body.sleepingAllowed = data.sleepingAllowed
    if (typeof data.freezeRotation === 'boolean') body.freezeRotation = data.freezeRotation
    body.transformOwnership = data.transformOwnership === 'Animation' ? 'Animation' : 'Physics'
    entity.componentMap.set('RigidBody2D', body)
  } else {
    entity.removeComponent('RigidBody2D')
  }

  const colliderSources = item.components.filter(/* 先计算 component.kind === 'BoxCollider2D' || component.kind === 'EllipseCollider2D'；仅当其为假值时求右侧 component.kind === 'PolygonCollider2D'，返回短路求值结果。 */ component => component.kind === 'BoxCollider2D' || component.kind === 'EllipseCollider2D' || component.kind === 'PolygonCollider2D')
  if (colliderSources.length) {
    for (const kind of ['BoxCollider2D', 'EllipseCollider2D', 'PolygonCollider2D'] as const) entity.componentMap.delete(kind)
    for (const colliderSource of colliderSources) {
    const data = recordData(colliderSource)
    const collider = new Collider2D(colliderSource.kind as 'BoxCollider2D' | 'EllipseCollider2D' | 'PolygonCollider2D', colliderSource.uuid)
    applyComponentMetadata(collider, colliderSource)
    copyVector(collider.offset, data.offset)
    copyVector(collider.size, data.size)
    collider.rotation = finiteNumber(data.rotation, collider.rotation)
    collider.radiusX = Math.max(1e-9, finiteNumber(data.radiusX, collider.radiusX))
    collider.radiusY = Math.max(1e-9, finiteNumber(data.radiusY, collider.radiusY))
    const shapeModels = ['Box', 'Circle', 'Capsule', 'Segment', 'Chain', 'WorldBoundary', 'ConvexPolygon', 'ConcavePolygon'] as const
    if (shapeModels.includes(data.shapeModel as typeof shapeModels[number])) collider.shapeModel = data.shapeModel as typeof collider.shapeModel
    const vertices = normalizedVertices(data.vertices as SceneEntityData['vertices'], collider.shapeModel === 'Chain' ? 2 : 3)
    if (vertices) collider.vertices = vertices
    collider.shapes = Array.isArray(data.shapes) ? data.shapes.slice(0, 128).flatMap(/** 过滤无效复合碰撞形状，规范化几何和碰撞属性，并从主碰撞体继承缺省层与传感器设置。 */ (value, index) => {
      if (!value || typeof value !== 'object') return []
      const raw = value as Record<string, unknown>
      const kind = shapeModels.includes(raw.kind as typeof shapeModels[number]) ? raw.kind as typeof collider.shapeModel : 'Box'
      const offset = { x: 0, y: 0 }, size = { x: 1, y: 1 }
      copyVector(offset, raw.offset); copyVector(size, raw.size)
      size.x = Math.max(1e-9, Math.abs(size.x)); size.y = Math.max(1e-9, Math.abs(size.y))
      const physicsLayer=Math.min(31,Math.max(0,Math.round(finiteNumber(raw.physicsLayer,data.physicsLayer as number)))); const oneWayNormal={x:0,y:1};copyVector(oneWayNormal,raw.oneWayNormal)
      return [{ id: typeof raw.id === 'string' && raw.id ? raw.id : `shape-${index + 1}`, kind, offset, rotation: finiteNumber(raw.rotation), size, radius: Math.max(1e-9, finiteNumber(raw.radius, .5)), points: normalizedVertices(raw.points as SceneEntityData['vertices'], kind === 'Chain' ? 2 : 3) ?? [], enabled: raw.enabled !== false, sensor: typeof raw.sensor==='boolean'?raw.sensor:data.sensor===true, physicsLayer, collisionMask: Math.min(0xffff_ffff,Math.max(0,Math.round(finiteNumber(raw.collisionMask,data.collisionMask as number))))>>>0, oneWay: raw.oneWay===true, oneWayNormal }]
    }) : []
    collider.sensor = data.sensor === true
    collider.physicsLayer = Math.min(31, Math.max(0, Math.round(finiteNumber(data.physicsLayer))))
    collider.collisionMask = Math.min(0xffff_ffff, Math.max(0, Math.round(finiteNumber(data.collisionMask, 1 << collider.physicsLayer)))) >>> 0
    collider.oneWay = data.oneWay === true
    collider.surfaceSpeed = Math.min(1e4, Math.max(-1e4, finiteNumber(data.surfaceSpeed, 0)))
    collider.rollingResistance = Math.min(1e3, Math.max(0, finiteNumber(data.rollingResistance, 0)))
    collider.materialAsset = typeof data.materialAsset === 'string' ? data.materialAsset : null
    copyVector(collider.oneWayNormal, data.oneWayNormal)
    const oneWayLength = Math.hypot(collider.oneWayNormal.x, collider.oneWayNormal.y)
    collider.oneWayNormal = oneWayLength > 1e-9 ? { x: collider.oneWayNormal.x / oneWayLength, y: collider.oneWayNormal.y / oneWayLength } : { x: 0, y: 1 }
    const material = data.material && typeof data.material === 'object' ? data.material as Record<string, unknown> : {}
    collider.material.density = Math.max(1e-9, finiteNumber(material.density, 1))
    collider.material.frictionCombine = ['Average', 'Minimum', 'Maximum', 'Multiply'].includes(String(material.frictionCombine)) ? material.frictionCombine as typeof collider.material.frictionCombine : 'Average'
    collider.material.restitutionCombine = ['Average', 'Minimum', 'Maximum', 'Multiply'].includes(String(material.restitutionCombine)) ? material.restitutionCombine as typeof collider.material.restitutionCombine : 'Maximum'
    if (data.material && typeof data.material === 'object') {
      const material = data.material as Record<string, unknown>
      collider.material.restitution = finiteNumber(material.restitution, collider.material.restitution)
      collider.material.restitutionThreshold = finiteNumber(material.restitutionThreshold, collider.material.restitutionThreshold)
      collider.material.staticFriction = finiteNumber(material.staticFriction, collider.material.staticFriction)
      collider.material.dynamicFriction = finiteNumber(material.dynamicFriction, collider.material.dynamicFriction)
    }
    entity.componentMap.set(collider.kind, collider)
    }
  } else {
    const collider = entity.getCollider(true)
    if (collider) entity.removeComponent(collider.kind)
  }
  // Hydration replaces collider instances, but must not change authored list order.
  const remainingComponents = new Map(entity.componentMap)
  entity.componentMap.clear()
  for (const source of item.components) {
    const component = remainingComponents.get(source.kind as ComponentKind)
    if (!component) continue
    entity.componentMap.set(component.kind, component)
    remainingComponents.delete(component.kind)
  }
  // Keep required constructor defaults absent from legacy component documents.
  for (const component of remainingComponents.values()) entity.componentMap.set(component.kind, component)
}

/** 将旧格式白名单数值和布尔实体属性写入实例，非法数值保留原值。 */ function applyStoredProperties(entity: Entity, source: Record<string, unknown>): void {
  const mutableEntity = entity as unknown as Record<string, unknown>
  for (const property of SCALAR_ENTITY_PROPERTIES) {
    if (source[property] !== undefined) {
      mutableEntity[property] = finiteNumber(source[property], mutableEntity[property] as number)
    }
  }
  for (const property of BOOLEAN_ENTITY_PROPERTIES) {
    if (typeof source[property] === 'boolean') mutableEntity[property] = source[property]
  }
}

/** 恢复旧格式名称、纹理及有限颜色分量。 */ function applyStoredAppearance(entity: Entity, source: Record<string, unknown>): void {
  if (typeof source.name === 'string' && source.name.trim()) entity.name = source.name.trim()
  if (typeof source.texture === 'string' || source.texture === null) entity.texture = source.texture
  if (!source.color || typeof source.color !== 'object') return
  const color = source.color as { r?: unknown; g?: unknown; b?: unknown }
  entity.color.r = finiteNumber(color.r, entity.color.r)
  entity.color.g = finiteNumber(color.g, entity.color.g)
  entity.color.b = finiteNumber(color.b, entity.color.b)
}

/** 恢复旧格式变换、速度、加速度和力，非法坐标沿用当前分量。 */ function applyStoredTransform(entity: Entity, item: SceneEntityData, source: Record<string, unknown>): void {
  if (item.transform) {
    copyVector(entity.transform.position, item.transform.position)
    copyVector(entity.transform.scale, item.transform.scale)
    entity.transform.rotation = finiteNumber(item.transform.rotation, entity.transform.rotation)
  }
  copyVector(entity.velocity, source.velocity)
  copyVector(entity.acceleration, source.acceleration)
  copyVector(entity.force, source.force)
}

/** 先校验实体和组件数据，再兼容新旧记录重建实体、实例与创作元数据，规范化后恢复作者显式无障碍设置。 */ function createEntityFromData(item: SceneEntityData, forcedId?: number): Entity {
  if (!item || typeof item !== 'object') throw new Error(t('invalidEntityRecord'))
  validateEntityMetadataValues(item)
  if (Array.isArray(item.components)) for (const component of item.components) {
    if (!component || typeof component !== 'object') throw new Error(t('invalidEntityRecord'))
    if (component.data != null) {
      if (typeof component.data !== 'object' || Array.isArray(component.data)) throw new Error(`${component.kind}.data: expected an object.`)
      validateComponentValues(String(component.kind), component.data)
    }
  }
  const id = normalizeIdentifier(forcedId ?? item.id)
  const position = {
    x: finiteNumber(item.transform?.position?.x, 0),
    y: finiteNumber(item.transform?.position?.y, 0)
  }
  const source = item as Record<string, unknown>
  const entity = createShapeEntity(item, id, position)
  if (Array.isArray(item.components)) applyStoredComponents(entity, item)
  else {
    applyStoredProperties(entity, source)
    applyStoredAppearance(entity, source)
    applyStoredTransform(entity, item, source)
  }
  if (typeof item.name === 'string' && item.name.trim()) entity.name = item.name.trim()
  entity.enabled = item.enabled !== false
  entity.editorVisible = item.editorVisible !== false
  entity.editorLocked = item.editorLocked === true
  entity.tags = Array.isArray(item.tags) ? item.tags.filter(/* 比较 typeof tag 与 'string'，返回严格相等的判断结果。 */ tag => typeof tag === 'string').map(/* 调用 tag.slice(0, 80) 并返回调用结果。 */ tag => tag.slice(0, 80)) : []
  entity.groups = Array.isArray(item.groups) ? [...new Set(item.groups.filter(/* 比较 typeof group 与 'string'，返回严格相等的判断结果。 */ group => typeof group === 'string').map(/* 调用 group.trim().slice(0, 80) 并返回调用结果。 */ group => group.trim().slice(0, 80)).filter(Boolean))].slice(0, 32) : []
  entity.namedLayer = typeof item.namedLayer === 'string' && item.namedLayer.trim() ? item.namedLayer.trim().slice(0, 80) : `Layer ${entity.layer}`
  entity.ownerUuid = typeof item.ownerUuid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.ownerUuid) ? normalizeUuid(item.ownerUuid) : null
  entity.ownership = item.ownership === 'Prefab' || item.ownership === 'Runtime' ? item.ownership : 'Scene'
  entity.editorOnly = item.editorOnly === true
  entity.runtimePersistence = item.runtimePersistence === 'Session' || item.runtimePersistence === 'SaveGame' || item.runtimePersistence === 'Transient' ? item.runtimePersistence : 'Scene'
  entity.persistentAcrossScenes = item.persistentAcrossScenes === true
  entity.objectBlueprintAsset = typeof item.objectBlueprintAsset === 'string' ? item.objectBlueprintAsset : item.objectBlueprintAsset === null ? null : entity.script2D?.objectBlueprintAsset ?? null
  if (entity.script2D) entity.script2D.objectBlueprintAsset = entity.objectBlueprintAsset
  entity.prefabAsset = typeof item.prefabAsset === 'string' ? item.prefabAsset : null
  entity.prefabInstanceUuid = typeof item.prefabInstanceUuid === 'string' ? item.prefabInstanceUuid : null
  entity.prefabSourceUuid = typeof item.prefabSourceUuid === 'string' ? item.prefabSourceUuid : null
  entity.prefabOverrides = item.prefabOverrides && typeof item.prefabOverrides === 'object' && !Array.isArray(item.prefabOverrides)
    ? JSON.parse(JSON.stringify(item.prefabOverrides)) as Record<string, unknown>
    : {}
  entity.prefabLayers = Array.isArray(item.prefabLayers) ? item.prefabLayers.flatMap(/** 过滤无效预制体层，规范化实例来源身份并深复制覆盖值。 */ layer => {
    if (!layer || typeof layer.asset !== 'string' || typeof layer.instanceUuid !== 'string' || typeof layer.sourceUuid !== 'string') return []
    return [{ asset: layer.asset, instanceUuid: normalizeUuid(layer.instanceUuid), sourceUuid: normalizeUuid(layer.sourceUuid), overrides: layer.overrides && typeof layer.overrides === 'object' ? JSON.parse(JSON.stringify(layer.overrides)) as Record<string, unknown> : {} }]
  }).slice(0, 32) : []
  entity.sceneLayers = Array.isArray(item.sceneLayers) ? item.sceneLayers.flatMap(/** 过滤无效场景实例层，规范化实例身份和来源身份。 */ layer => {
    if (!layer || typeof layer.asset !== 'string' || typeof layer.instanceUuid !== 'string' || typeof layer.sourceUuid !== 'string') return []
    return [{ asset: layer.asset, instanceUuid: normalizeUuid(layer.instanceUuid), sourceUuid: normalizeUuid(layer.sourceUuid) }]
  }).slice(0, 32) : []
  if (!item.authoring) {
    if (entity.camera2D) entity.authoring.kind = 'Camera'
    else if (entity.spriteRenderer) entity.authoring.kind = entity.hasComponent('Animator') ? 'AnimatedSprite' : 'Sprite'
    else if (entity.textRenderer) entity.authoring.kind = 'WorldText'
  }
  if (item.authoring && typeof item.authoring === 'object') {
    const authoring = item.authoring
    const knownKinds = new Set(['Empty', 'Sprite', 'AnimatedSprite', 'WorldText', 'Polygon', 'Line', 'Path', 'Camera', 'CanvasLayer', 'ParallaxLayer', 'Rectangle', 'Circle', 'Triangle', 'Collider', 'ScriptHost', 'AudioEmitter', 'Light', 'NavigationRegion', 'PackageObject'])
    if (typeof authoring.kind === 'string' && knownKinds.has(authoring.kind)) entity.authoring.kind = authoring.kind as AuthoringMetadata2D['kind']
    if (authoring.origin) copyVector(entity.authoring.origin, authoring.origin)
    entity.authoring.visible = authoring.visible !== false
    entity.authoring.zOrder = Math.trunc(finiteNumber(authoring.zOrder, entity.authoring.zOrder))
    entity.authoring.renderLayer = Math.max(0, Math.trunc(finiteNumber(authoring.renderLayer, entity.layer)))
    entity.authoring.sortMode = authoring.sortMode === 'YSort' ? 'YSort' : 'LayerThenOrder'
    if (authoring.canvasLayer) entity.authoring.canvasLayer = {
      screenSpace: authoring.canvasLayer.screenSpace === true,
      followCamera: authoring.canvasLayer.followCamera !== false
    }
    if (authoring.parallax) {
      copyVector(entity.authoring.parallax.motionScale, authoring.parallax.motionScale)
      copyVector(entity.authoring.parallax.repeat, authoring.parallax.repeat)
      entity.authoring.parallax.mirror = authoring.parallax.mirror === true
      entity.authoring.parallax.depth = Math.min(1_000_000, Math.max(-1_000_000, finiteNumber(authoring.parallax.depth)))
    }
    if (authoring.path) {
      entity.authoring.path.closed = authoring.path.closed === true
      entity.authoring.path.smoothing = Math.min(1, Math.max(0, finiteNumber(authoring.path.smoothing, entity.authoring.path.smoothing)))
      entity.authoring.path.points = Array.isArray(authoring.path.points)
        ? authoring.path.points.slice(0, 10_000).map(/** 构造并返回记录 { x: finiteNumber(point.x), y: finiteNumber(point.y) }，字段按当前实参及捕获状态求值。 */ point => ({ x: finiteNumber(point.x), y: finiteNumber(point.y) }))
        : entity.authoring.path.points
      entity.authoring.path.tangents = Array.isArray(authoring.path.tangents)
        ? authoring.path.tangents.slice(0, entity.authoring.path.points.length).map(/** 把路径切线的入向和出向控制坐标转换为有限数值。 */ tangent => ({ incoming: { x: finiteNumber(tangent?.incoming?.x), y: finiteNumber(tangent?.incoming?.y) }, outgoing: { x: finiteNumber(tangent?.outgoing?.x), y: finiteNumber(tangent?.outgoing?.y) } }))
        : entity.authoring.path.tangents
      entity.authoring.path.asset = typeof authoring.path.asset === 'string' ? authoring.path.asset.slice(0, 256) : null
      if (authoring.path.follower) entity.authoring.path.follower = {
        targetUuid: typeof authoring.path.follower.targetUuid === 'string' ? normalizeUuid(authoring.path.follower.targetUuid) : null,
        progress: Math.min(1, Math.max(0, finiteNumber(authoring.path.follower.progress))),
        speed: Math.min(1_000_000, Math.max(-1_000_000, finiteNumber(authoring.path.follower.speed))),
        orient: authoring.path.follower.orient !== false
      }
    }
  }

  if (entity.isStatic) entity.isKinematic = false
  normalizeEntity(entity)
  const storedRectData = item.components?.find(/* 比较 component.kind 与 'RectTransform'，返回严格相等的判断结果。 */ component => component.kind === 'RectTransform')?.data
  const rect = entity.getComponent<RectTransform>('RectTransform')
  if (rect && (entity.hasComponent('Button') || entity.hasComponent('Slider') || entity.hasComponent('Checkbox') || entity.hasComponent('TextInput')) && storedRectData?.skipNavigation !== true) rect.skipNavigation = false
  configureUiAccessibility(entity)
  // Defaults repair omitted legacy metadata; explicit author choices must survive reopening.
  if (rect && typeof storedRectData?.focusable === 'boolean') rect.focusable = storedRectData.focusable
  if (rect && typeof storedRectData?.skipNavigation === 'boolean') rect.skipNavigation = storedRectData.skipNavigation
  const authoredBody = storedComponent(item, 'RigidBody2D')
  if (!authoredBody || typeof recordData(authoredBody).density !== 'number') syncDensityFromMass(entity)
  return entity
}
  return Object.freeze({ createEntityFromData, normalizeIdentifier, storedShapeType })
}
