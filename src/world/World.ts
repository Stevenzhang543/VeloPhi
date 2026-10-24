/** 二维世界及求解器桥接：管理实体与连接，同步运行缓冲、执行步进并提供物理查询和诊断。 */
import { plainView } from './plainView'
import { Entity } from './Entity'
import { BoxEntity } from './BoxEntity'
import { CircleEntity } from './CircleEntity'
import { TriangleEntity } from './TriangleEntity'
import type { Vec2 } from './types'
import { finiteNumber, normalizeEntity, syncMassFromDensity } from './geometry'
import {
  CONNECTION_STRIDE,
  connectionsFromJointComponents,
  ROPE_NODE_CAPACITY,
  ROPE_NODE_DATA_OFFSET,
  connectionSharesLayer,
  initializeRopeNodes,
  normalizeConnection,
  scaledLocalAnchor,
  type Connection
} from './Connection'
import init, {
  WasmRuntimeWorld,
  current_format_version,
  engine_version,
  migrate_project_json
} from '../../nova_core/pkg/nova_core.js'
import { invalidateHierarchyIndex, localPointToWorld, setWorldTransform, worldTransform } from './hierarchy'
import { stableSinCos } from './stableTrig'
import { TileMap2D, type TargetJoint2D } from './components'
import { defaultPhysicsLayers, defaultPhysicsProfile, normalizePhysicsMaterial, normalizePhysicsProfile, stablePhysicsEventOrder, type PhysicsInterpolationMode, type PhysicsLayerDefinition, type PhysicsSimulationProfile2D } from '../runtime/physicsProduction'
import { encodeColliderChildren, solverShapeArea, prepareColliderSet, type SolverColliderShape2D } from '../runtime/physicsGeometry'
import { DEFAULT_MAX_CATCH_UP_STEPS, normalizeSimulationFrameDelta } from '../runtime/engineTiming'

export const PHYSICS_STRIDE = 56
export const PHYSICS_LAYER_COUNT = 32

/* 调用 Array.from({ length: PHYSICS_LAYER_COUNT }, (_, layer) => (1 << layer) >>> 0) 并返回调用结果。 */ export function defaultCollisionMatrix(): number[] {
  return Array.from({ length: PHYSICS_LAYER_COUNT }, /** 为每个物理层生成只包含自身位的无符号碰撞掩码。 */ (_, layer) => (1 << layer) >>> 0)
}

export interface GlobalPhysicsSettings {
  gravity: number
  airFriction: number
  timeScale: number
  tickRate: number
  maxCatchUpSteps: number
  collisionMatrix: number[]
  interpolation: PhysicsInterpolationMode
  layers: PhysicsLayerDefinition[]
  profile: PhysicsSimulationProfile2D
  /** 26.42 S-2: clock that advances script timers. Missing means 'frame' (the behaviour before 26.42). */
  timerClock?: 'frame' | 'fixed'
  /** 26.43: when collision/trigger callbacks run. Missing means 'frame' (after all of a frame's physics
   * steps, the behaviour before 26.43); 'step' runs them after the physics step that produced them. */
  eventDispatch?: 'frame' | 'step'
}

export interface EngineDiagnostics {
  bodyCount: number
  connectionCount: number
  stepsLastFrame: number
  totalPhysicsSteps: number
  interpolationAlpha: number
  droppedSeconds: number
  eventCount: number
  configurationRebuilds: number
}

export interface RuntimePhysicsEvent {
  type: 'collisionStarted' | 'collisionStayed' | 'collisionEnded' | 'triggerEntered' | 'triggerStayed' | 'triggerExited' | string
  first?: number
  second?: number
  firstEntityUuid?: string
  secondEntityUuid?: string
  firstCollider?: number
  secondCollider?: number
  point?: [number, number]
  normal?: [number, number]
  relativeVelocity?: [number, number]
  initialRelativeVelocity?: [number, number]
  normalImpulse?: number
  tangentImpulse?: number
  normalForce?: number
  tangentForce?: number
  penetration?: number
  handle?: number
  jointKind?: number
  link?: number
  tension?: number
  strain?: number
  entityUuid?: string
  connectionUuid?: string
  [key: string]: unknown
}

/** Per-world synchronous host services. Resource data and observers stay with their host owner. */
export interface WorldHostServices {
  readTextAsset(reference: string): string | null
  assetRevision(): number
  buildTileColliderDescriptors(component: TileMap2D): readonly {
    center: Vec2
    size: Vec2
    vertices: readonly Vec2[]
    oneWay: boolean
  }[]
  recordPhysicsTelemetry?(entities: Entity[], connections: Connection[], events: RuntimePhysicsEvent[], diagnostics: EngineDiagnostics, tickRate: number, profile: PhysicsSimulationProfile2D): void
}

const DEFAULT_WORLD_HOST_SERVICES: Readonly<WorldHostServices> = Object.freeze({
  readTextAsset: () => null,
  assetRevision: () => 0,
  buildTileColliderDescriptors: (component: TileMap2D) => {
    if (!component.bakeCollision || !component.tileSetAsset) return []
    throw new Error('WORLD_TILE_SERVICE_REQUIRED: configure this world\'s tile collider projection before simulation.')
  }
})

export interface CharacterMoveResult2D {
  position: [number, number]
  appliedMotion: [number, number]
  remainingMotion: [number, number]
  floorNormal: [number, number]
  wallNormal: [number, number]
  ceilingNormal: [number, number]
  platformVelocity: [number, number]
  onFloor: boolean
  onWall: boolean
  onCeiling: boolean
  slideCount: number
  /** 26.43: requested motion actually travelled (slides included), without step lifts or floor snapping. */
  velocityMotion?: [number, number]
  /** 26.43: the character stood on a walkable floor before the move. */
  groundedAtStart?: boolean
  /** 26.44: runtime handle of the body the character stands on (0 when not on a floor). */
  floorHandle?: number
  /** 26.44: the floor is a one-way platform. */
  floorOneWay?: boolean
  /** 26.44: push out of overlapping bodies before the move (a correction, not velocity). */
  recoveryMotion?: [number, number]
}

export interface PhysicsQueryHit2D {
  entityUuid: string
  point: Vec2
  normal: Vec2
  distance: number
  collider?: number
  sensor?: boolean
  physicsLayer?: number
  bodyType?: string
}

export type PhysicsQueryKind2D = 'Ray' | 'Point' | 'Circle' | 'Box' | 'Sweep' | 'Nearest'
export interface PhysicsQueryRequest2D { kind: PhysicsQueryKind2D; origin: Vec2; direction?: Vec2; size?: Vec2; angle?: number; radius?: number; distance?: number; layerMask?: number; includeSensors?: boolean; excludeEntityUuids?: readonly string[]; maximumResults?: number }

interface WasmQueryHit { handle: number; point: [number, number]; normal: [number, number]; distance: number; collider?: number; sensor?: boolean; physicsLayer?: number; bodyType?: string }

interface ConnectionRecord {
  connection: Connection
  segment: number
  bodyA: number
  bodyB: number
}

/** Writes one entity into the stable Float64 ABI shared with nova_core. */
/** 规范实体与关联物理材质，按固定 Float64 ABI 写入世界姿态、形状、运动、质量和碰撞设置；无有效形状时拒绝同步。 */ function writeEntityRecord(data: Float64Array, entityIndex: number, entity: Entity, entities: Entity[], settings: GlobalPhysicsSettings, readTextAsset: WorldHostServices['readTextAsset'], runtimeHandle = entity.id, solverShapes?: SolverColliderShape2D[]): void {
  normalizeEntity(entity)
  let material = entity.collider.material
  if (entity.collider.materialAsset) {
    const source = readTextAsset(entity.collider.materialAsset)
    if (!source) throw Error('PHYSICS_MATERIAL_MISSING: ' + entity.collider.materialAsset)
    try { const value = JSON.parse(source); if (value?.format !== 'nova-physics-material') throw Error('Incorrect material format'); material = normalizePhysicsMaterial(value) }
    catch { throw Error('PHYSICS_MATERIAL_INPUT: repair the linked physics material JSON before simulation.') }
  }
  const transform = worldTransform(entity, entities)
  const collider = entity.collider
  const shapes = solverShapes ?? prepareColliderSet(collider, !entity.isStatic && !entity.isKinematic).shapes
  const shape = shapes[0]
  if (!shape) throw new Error(`Collider '${entity.name}' has no solver-safe shape. Repair the Collider2D component before simulation.`)
  const index = entityIndex * PHYSICS_STRIDE
  data[index] = runtimeHandle
  data[index + 1] = shape.kind === 'Circle' ? 1 : shape.kind === 'Capsule' ? 2 : shape.kind === 'Segment' ? 3 : 0
  data[index + 2] = transform.position.x
  data[index + 3] = transform.position.y
  data[index + 4] = entity.rigidBody.transformOwnership === 'Animation' ? 0 : entity.velocity.x
  data[index + 5] = entity.rigidBody.transformOwnership === 'Animation' ? 0 : entity.velocity.y
  data[index + 6] = entity.acceleration.x
  data[index + 7] = entity.acceleration.y
  data[index + 8] = entity.rigidBody.massMode === 'Automatic' ? Math.max(1e-6, Math.min(1e50, (entity.collider.materialAsset ? material.density : entity.density) * shapes.reduce(/* 计算表达式 sum + solverShapeArea(child, transform.scale) 并返回结果，沿用操作数的原有类型规则。 */ (sum, child) => sum + solverShapeArea(child, transform.scale), 0))) : entity.mass
  data[index + 9] = entity.isStatic || collider.shapeModel === 'WorldBoundary' ? 1 : 0
  data[index + 10] = material.restitution
  data[index + 11] = material.dynamicFriction

  if (shape.kind === 'Circle') {
    data[index + 12] = shape.size.x * Math.abs(transform.scale.x) * .5
    data[index + 13] = shape.size.y * Math.abs(transform.scale.y) * .5
  } else {
    const authored = shape.points.length ? shape.points : [{ x: -shape.size.x * .5, y: -shape.size.y * .5 }, { x: shape.size.x * .5, y: -shape.size.y * .5 }, { x: shape.size.x * .5, y: shape.size.y * .5 }, { x: -shape.size.x * .5, y: shape.size.y * .5 }]
    const xs = authored.map(/* 计算表达式 vertex.x * transform.scale.x 并返回结果，沿用操作数的原有类型规则。 */ vertex => vertex.x * transform.scale.x), ys = authored.map(/* 计算表达式 vertex.y * transform.scale.y 并返回结果，沿用操作数的原有类型规则。 */ vertex => vertex.y * transform.scale.y)
    data[index + 12] = Math.max(...xs) - Math.min(...xs); data[index + 13] = Math.max(...ys) - Math.min(...ys)
  }

  data[index + 14] = transform.rotation
  data[index + 15] = entity.rigidBody.transformOwnership === 'Animation' ? 0 : entity.angularVelocity
  data[index + 16] = entity.torque
  data[index + 17] = entity.gravityScale
  data[index + 18] = entity.linearDamping
  data[index + 19] = entity.angularDamping
  data[index + 20] = material.staticFriction
  data[index + 21] = entity.force.x
  data[index + 22] = entity.force.y
  data[index + 23] = entity.gravity
  data[index + 24] = entity.isKinematic || entity.rigidBody.transformOwnership === 'Animation' ? 1 : 0
  data[index + 25] = entity.autoInertia ? 1 : 0
  data[index + 26] = entity.inertia
  data[index + 27] = material.restitutionThreshold
  data[index + 28] = shape.sensor ? 1 : 0
  data[index + 33] = shape.physicsLayer
  const matrixMask = settings.collisionMatrix[shape.physicsLayer] ?? (1 << shape.physicsLayer)
  data[index + 42] = (shape.collisionMask & matrixMask) >>> 0
  data[index + 43] = shape.offset.x * transform.scale.x
  data[index + 44] = shape.offset.y * transform.scale.y
  data[index + 45] = shape.rotation * Math.sign(transform.scale.x * transform.scale.y)
  data[index + 46] = entity.rigidBody.freezeRotation ? 1 : 0
  data[index + 47] = entity.rigidBody.continuousCollision === 'Continuous' ? 1 : 0
  data[index + 48] = entity.rigidBody.sleepingAllowed ? 1 : 0
  data[index + 49] = entity.rigidBody.sleeping ? 1 : 0
  data[index + 50] = entity.rigidBody.sleepTimer
  data[index + 51] = shape.oneWay ? 1 : 0
  data[index + 52] = shape.oneWayNormal.x / transform.scale.x
  data[index + 53] = shape.oneWayNormal.y / transform.scale.y
  const combineCode = /* 根据 mode === 'Minimum' 的真假，分别返回 1 或 mode === 'Multiply' ? 2 : mode === 'Maximum' ? 3 : 0。 */ (mode: 'Average' | 'Minimum' | 'Maximum' | 'Multiply') => mode === 'Minimum' ? 1 : mode === 'Multiply' ? 2 : mode === 'Maximum' ? 3 : 0
  data[index + 54] = combineCode(material.frictionCombine)
  data[index + 55] = combineCode(material.restitutionCombine)

  const recordVertices = shape.kind === 'ConvexPolygon' ? shape.points : []
  if (recordVertices.length) {
    for (let vertexIndex = 0; vertexIndex < recordVertices.length && vertexIndex < 4; vertexIndex++) {
      const vertex = recordVertices[vertexIndex]
      data[index + 34 + vertexIndex * 2] = vertex.x * transform.scale.x
      data[index + 35 + vertexIndex * 2] = vertex.y * transform.scale.y
    }
    if (recordVertices.length === 3) {
      data[index + 40] = recordVertices[2].x * transform.scale.x
      data[index + 41] = recordVertices[2].y * transform.scale.y
    }
  }
}

/** 从求解器记录恢复世界姿态、质量、接触和睡眠状态；动画拥有的速度不由求解器覆盖。 */ function readEntityRecord(output: Float64Array, entityIndex: number, entity: Entity, entities: Entity[]): void {
  const index = entityIndex * PHYSICS_STRIDE
  const transform = worldTransform(entity, entities)
  setWorldTransform(entity, {
    ...transform,
    position: {
      x: finiteNumber(output[index + 2], transform.position.x),
      y: finiteNumber(output[index + 3], transform.position.y)
    },
    rotation: finiteNumber(output[index + 14], transform.rotation)
  }, entities)
  if (entity.rigidBody.transformOwnership !== 'Animation') { entity.velocity.x = finiteNumber(output[index + 4], entity.velocity.x); entity.velocity.y = finiteNumber(output[index + 5], entity.velocity.y); entity.angularVelocity = finiteNumber(output[index + 15], entity.angularVelocity) }
  entity.mass = finiteNumber(output[index + 8], entity.mass)
  entity.inertia = finiteNumber(output[index + 26], entity.inertia)
  entity.contactCount = Math.max(0, Math.round(finiteNumber(output[index + 29], 0)))
  entity.contactNormal.x = finiteNumber(output[index + 30], 0)
  entity.contactNormal.y = finiteNumber(output[index + 31], 0)
  entity.penetrationDepth = Math.max(0, finiteNumber(output[index + 32], 0))
  entity.rigidBody.sleeping = output[index + 49] > 0.5
  entity.rigidBody.sleepTimer = Math.max(0, finiteNumber(output[index + 50], 0))
}

/** 26.44: only the per-step contact diagnostics of a body whose pose and motion did not change. */ function readContactDiagnostics(output: Float64Array, entityIndex: number, entity: Entity): void {
  const index = entityIndex * PHYSICS_STRIDE
  entity.contactCount = Math.max(0, Math.round(finiteNumber(output[index + 29], 0)))
  entity.contactNormal.x = finiteNumber(output[index + 30], 0)
  entity.contactNormal.y = finiteNumber(output[index + 31], 0)
  entity.penetrationDepth = Math.max(0, finiteNumber(output[index + 32], 0))
}

/** 筛选仍有效且两端均有活动刚体的连接，必要时初始化碰撞绳节点并展开为分段求解记录。 */ function collectConnectionRecords(entities: Entity[], connections: Connection[], allEntities: Entity[] = entities): ConnectionRecord[] {
  const entityIndexes = new Map(entities.map(/* 返回按声明顺序构造的数组 [entity.id, index]。 */ (entity, index) => [entity.id, index]))
  const records: ConnectionRecord[] = []
  for (const connection of connections) {
    const remainsActive = connection.breakState === 'intact'
      || (connection.collisionEnabled && connection.ropeNodes.length > 0 && connection.breakLink >= 0)
    if (!connection.enabled || !normalizeConnection(connection, allEntities) || !connectionSharesLayer(connection, allEntities) || !remainsActive) continue
    if (connection.breakState === 'intact' && connection.collisionEnabled && connection.ropeNodes.length === 0) {
      initializeRopeNodes(connection, allEntities)
    }
    for (let segment = 0; segment < connection.anchors.length - 1; segment++) {
      const bodyA = entityIndexes.get(connection.anchors[segment].entityId)
      const bodyB = entityIndexes.get(connection.anchors[segment + 1].entityId)
      if (bodyA === undefined || bodyB === undefined || bodyA === bodyB) continue
      records.push({ connection, segment, bodyA, bodyB })
    }
  }
  return records
}

/** Writes one connection segment into the stable Float64 ABI shared with nova_core. */
/** 把连接的两端锚点、材料、约束及首段绳节点写入固定 Float64 ABI 记录。 */ function writeConnectionRecord(data: Float64Array, recordIndex: number, record: ConnectionRecord, entities: Entity[], allEntities: Entity[], runtimeHandle = record.connection.id): void {
  const { connection, segment, bodyA, bodyB } = record
  const anchorA = connection.anchors[segment]
  const anchorB = connection.anchors[segment + 1]
  const localA = scaledLocalAnchor(anchorA, entities[bodyA], allEntities)
  const localB = scaledLocalAnchor(anchorB, entities[bodyB], allEntities)
  const index = recordIndex * CONNECTION_STRIDE
  data[index] = runtimeHandle
  data[index + 1] = bodyA
  data[index + 2] = bodyB
  data[index + 3] = localA.x
  data[index + 4] = localA.y
  data[index + 5] = localB.x
  data[index + 6] = localB.y
  data[index + 7] = connection.restLengths[segment]
  data[index + 8] = connection.stretchable ? 1 : 0
  data[index + 9] = connection.bendable ? 1 : 0
  data[index + 10] = connection.stiffness
  data[index + 11] = connection.damping
  data[index + 12] = connection.maxStretchRatio
  data[index + 13] = connection.bendingToleranceMass
  data[index + 14] = connection.stretchingToleranceMass
  const manualBend = connection.style === 'manual'
    ? Math.max(0, ...(connection.manualSegments[segment] ?? []).map(/* 调用 Math.abs(point.y) 并返回调用结果。 */ point => Math.abs(point.y)))
    : 0
  data[index + 15] = connection.style === 'curved' ? Math.abs(connection.curvature) : manualBend
  data[index + 16] = 1
  data[index + 17] = connection.breakState === 'snapped' ? 1 : connection.breakState === 'torn' ? 2 : 0
  // 26.45: a Weld joint with a spring frequency is a soft weld (9); Wheel joints are 7.
  const softWeld = connection.componentType === 'WeldJoint2D' && ((connection.springFrequency ?? 0) > 0 || (connection.angularFrequency ?? 0) > 0)
  data[index + 18] = softWeld ? 9
    : connection.componentType === 'WheelJoint2D' ? 7
    : connection.componentType === 'FixedJoint2D' || connection.componentType === 'WeldJoint2D' ? 1
    : connection.componentType === 'DistanceJoint2D' ? 2
      : connection.componentType === 'RevoluteJoint2D' || connection.componentType === 'MotorJoint2D' ? 3
        : connection.componentType === 'PrismaticJoint2D' ? 4
          : connection.componentType === 'SpringJoint2D' ? 5
            : connection.componentType === 'RopeJoint2D' ? 6 : 0
  data[index + 20] = connection.binding ? 1 : 0
  data[index + 21] = connection.bindAngle
  data[index + 22] = connection.bindOffset.x
  data[index + 23] = connection.bindOffset.y
  data[index + 24] = connection.collisionEnabled && segment === 0 ? 1 : 0
  data[index + 25] = connection.collisionRadius
  data[index + 26] = connection.linearDensity
  const nodeCount = connection.componentType === 'Rope2D' && segment === 0 ? Math.min(ROPE_NODE_CAPACITY, connection.ropeNodes.length) : 0
  data[index + 27] = nodeCount
  data[index + 28] = connection.breakLink
  if (connection.componentType !== 'Rope2D') {
    data[index + 29] = connection.jointAxis.x
    data[index + 30] = connection.jointAxis.y
    data[index + 31] = connection.limitsEnabled ? 1 : 0
    data[index + 32] = connection.lowerLimit
    data[index + 33] = connection.upperLimit
    data[index + 34] = connection.collideConnected ? 1 : 0
    data[index + 35] = connection.motorEnabled ? 1 : 0
    data[index + 36] = connection.motorSpeed
    data[index + 37] = connection.maxMotorForce
    data[index + 38] = connection.breakForce
    data[index + 39] = connection.breakTorque
    data[index + 40] = connection.springFrequency ?? 0
    data[index + 41] = connection.springDampingRatio ?? 0.7
    data[index + 42] = connection.angularFrequency ?? 0
    data[index + 43] = connection.angularDampingRatio ?? 0.7
  }
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const node = connection.ropeNodes[nodeIndex]
    const nodeOffset = index + ROPE_NODE_DATA_OFFSET + nodeIndex * 4
    data[nodeOffset] = node.position.x
    data[nodeOffset + 1] = node.position.y
    data[nodeOffset + 2] = node.velocity.x
    data[nodeOffset + 3] = node.velocity.y
  }
}

/** 从求解器读取连接断裂、张力、应变及有界绳节点状态，非碰撞绳不恢复节点数组。 */ function readConnectionRecord(output: Float64Array, offset: number, recordIndex: number, record: ConnectionRecord): void {
  const { connection } = record
  const index = offset + recordIndex * CONNECTION_STRIDE
  const breakCode = Math.round(finiteNumber(output[index + 17]))
  connection.tension = Math.max(connection.tension, finiteNumber(output[index + 18]))
  connection.strain = Math.max(connection.strain, finiteNumber(output[index + 19]))
  if (breakCode === 1) connection.breakState = 'snapped'
  if (breakCode === 2) connection.breakState = 'torn'
  const nodeCount = Math.min(ROPE_NODE_CAPACITY, Math.max(0, Math.round(finiteNumber(output[index + 27], 0))))
  connection.breakLink = Math.min(nodeCount, Math.max(-1, Math.round(finiteNumber(output[index + 28], -1))))
  if (!connection.collisionEnabled || nodeCount === 0) return
  connection.ropeNodes = Array.from({ length: nodeCount }, /** 从当前连接记录读取单个绳节点的有限位置与速度。 */ (_, nodeIndex) => {
    const nodeOffset = index + ROPE_NODE_DATA_OFFSET + nodeIndex * 4
    return {
      position: { x: finiteNumber(output[nodeOffset]), y: finiteNumber(output[nodeOffset + 1]) },
      velocity: { x: finiteNumber(output[nodeOffset + 2]), y: finiteNumber(output[nodeOffset + 3]) }
    }
  })
}

export class World {
  private readonly host: Readonly<WorldHostServices>
  private nextId = 1
  private nextConnectionId = 1
  private observedEntities: Entity[] = []
  private observedConnections: Connection[] = []
  private plainAccessDepth = 0
  /** Inside a simulation frame the Runtime works on the plain objects; observers keep their proxies. */
  get entities(): Entity[] { return this.plainAccessDepth > 0 ? plainView(this.observedEntities) : this.observedEntities }
  set entities(value: Entity[]) { this.observedEntities = value }
  get connections(): Connection[] { return this.plainAccessDepth > 0 ? plainView(this.observedConnections) : this.observedConnections }
  set connections(value: Connection[]) { this.observedConnections = value }
  /** Runs one simulation frame on plain entity storage. Hosts with proxied storage notify their observers afterwards. */
  withPlainAccess<T>(run: () => T): T {
    this.plainAccessDepth++
    try { return run() } finally { this.plainAccessDepth-- }
  }
  private wasmLoaded = false
  private runtime: WasmRuntimeWorld | null = null
  private runtimeDisposed = false
  private nextRuntimeHandle = 1
  private bodyHandles = new Map<number, number>()
  // 26.44: entity count at the last full physics sync (queries in between only send changed poses).
  private fullSyncEntityCount = -1
  private connectionHandles = new Map<string, number>()
  private bodyRecords = new Map<number, Float64Array>()
  private nativeBodyPoses = new Map<number, { x: number; y: number; rotation: number }>()
  private colliderChildRecords = new Map<number, Float64Array>()
  // 26.45: surface (conveyor speed, rolling resistance) and target joint last sent per body handle.
  private bodySurfaces = new Map<number, string>()
  private bodyTargets = new Map<number, string>()
  private startedTargets = new WeakSet<TargetJoint2D>()
  private connectionRecords = new Map<number, Float64Array>()
  private bodyOrders = new Map<number, number>()
  private connectionOrders = new Map<number, number>()
  private bodyScratch = new Float64Array(PHYSICS_STRIDE)
  private connectionScratch = new Float64Array(CONNECTION_STRIDE)
  private stateBuffer = new Float64Array(0)
  private previousBodyBuffer = new Float64Array(0)
  private activeBodies: Entity[] = []
  private tileCollisionBodies: Entity[] = []
  private tileCollisionOwners = new Map<number, Entity>()
  private tileCollisionSignature = ''
  private activeConnectionRecords: ConnectionRecord[] = []
  private runtimeJointConnections = new Map<string, Connection>()
  private timingSignature = ''
  /** 26.45: readable by world owners (area effects use its gravity). */
  lastSettings: GlobalPhysicsSettings = { gravity: 9.8, airFriction: .01, timeScale: 1, tickRate: 60, maxCatchUpSteps: DEFAULT_MAX_CATCH_UP_STEPS, collisionMatrix: defaultCollisionMatrix(), interpolation: 'Interpolate', layers: defaultPhysicsLayers(), profile: defaultPhysicsProfile() }
  wasmError: Error | null = null
  readonly wasmReady: Promise<void>
  diagnostics: EngineDiagnostics = {
    bodyCount: 0, connectionCount: 0, stepsLastFrame: 0, totalPhysicsSteps: 0,
    interpolationAlpha: 0, droppedSeconds: 0, eventCount: 0, configurationRebuilds: 0
  }
  events: RuntimePhysicsEvent[] = []
  readonly colliderPreparationIssues = new Map<string, string>()
  projectFormatVersion = 29
  projectEngineVersion = '6.7.0'

  /** 浏览器中异步初始化 WASM 世界及实际版本信息；资源与观察服务按世界注入，Node 保持现有无加载后备。 */ constructor(host: WorldHostServices = DEFAULT_WORLD_HOST_SERVICES) {
    // Bind once so callbacks keep their supplied owner, without any process-wide default registration.
    this.host = Object.freeze({
      readTextAsset: host.readTextAsset.bind(host),
      assetRevision: host.assetRevision.bind(host),
      buildTileColliderDescriptors: host.buildTileColliderDescriptors.bind(host),
      recordPhysicsTelemetry: host.recordPhysicsTelemetry?.bind(host)
    })
    // Vite's Node-side audit loader has no browser fetch implementation for file: WASM URLs.
    // Keep its deliberate headless fallback quiet; browsers and Tauri still initialize normally.
    const nodeRuntime = (globalThis as typeof globalThis & { process?: { versions?: { node?: string } } }).process?.versions?.node
    if (nodeRuntime || typeof document === 'undefined') {
      this.wasmReady = Promise.resolve()
      return
    }
    this.wasmReady = init()
      .then(/** WASM 初始化完成后创建运行世界，读取实际引擎及格式版本并标记就绪。 */ () => {
        if (this.runtimeDisposed) return
        this.runtime = new WasmRuntimeWorld()
        this.projectFormatVersion = current_format_version()
        this.projectEngineVersion = engine_version()
        this.wasmLoaded = true
      })
      .catch(/** 把初始化失败规范为 Error 并保存和记录，供界面报告 WASM 加载问题。 */ (error: unknown) => {
        this.wasmError = error instanceof Error ? error : new Error(String(error))
        console.error('Failed to initialize Nova_A physics WASM', this.wasmError)
      })
  }

  /** 分配单调递增的实体整数 ID，超过安全整数范围时拒绝继续。 */ allocateId(): number {
    if (this.nextId > Number.MAX_SAFE_INTEGER) throw new Error('Entity ID space is exhausted')
    return this.nextId++
  }

  /** 将 Math.min(Number.MAX_SAFE_INTEGER + 1, Math.max(1, Math.round(finiteNumber(nextId, 1)))) 赋给 this.nextId，不显式返回值。 */ setNextId(nextId: number): void {
    this.nextId = Math.min(Number.MAX_SAFE_INTEGER + 1, Math.max(1, Math.round(finiteNumber(nextId, 1))))
  }

  /** 将 1 赋给 this.nextId，不显式返回值。 */ resetId(): void {
    this.nextId = 1
  }

  /** 分配单调递增的连接整数 ID，超过安全整数范围时拒绝继续。 */ allocateConnectionId(): number {
    if (this.nextConnectionId > Number.MAX_SAFE_INTEGER) throw new Error('Connection ID space is exhausted')
    return this.nextConnectionId++
  }

  /** 将 Math.min(Number.MAX_SAFE_INTEGER + 1, Math.max(1, Math.round(finiteNumber(nextId, 1)))) 赋给 this.nextConnectionId，不显式返回值。 */ setNextConnectionId(nextId: number): void {
    this.nextConnectionId = Math.min(Number.MAX_SAFE_INTEGER + 1, Math.max(1, Math.round(finiteNumber(nextId, 1))))
  }

  /** 将 1 赋给 this.nextConnectionId，不显式返回值。 */ resetConnectionId(): void {
    this.nextConnectionId = 1
  }

  /** 创建矩形实体、规范其参数并按密度同步质量，加入世界后返回。 */ addBox(pos: Vec2, size: Vec2): BoxEntity {
    const entity = new BoxEntity(this.allocateId(), pos, size)
    normalizeEntity(entity)
    syncMassFromDensity(entity)
    this.entities.push(entity)
    return entity
  }

  /** 创建椭圆实体、规范其参数并按密度同步质量，加入世界后返回。 */ addCircle(pos: Vec2, radiusX: number, radiusY?: number): CircleEntity {
    const entity = new CircleEntity(this.allocateId(), pos, radiusX, radiusY)
    normalizeEntity(entity)
    syncMassFromDensity(entity)
    this.entities.push(entity)
    return entity
  }

  /** 创建三角形实体、规范其参数并按密度同步质量，加入世界后返回。 */ addTriangle(pos: Vec2, size: Vec2): TriangleEntity {
    const entity = new TriangleEntity(this.allocateId(), pos, size)
    normalizeEntity(entity)
    syncMassFromDensity(entity)
    this.entities.push(entity)
    return entity
  }

  /** 配置时间步并推进物理；存在固定步回调时在每步前后协调脚本、路径和状态，最后读取插值结果及诊断。 */ update(
    dt: number,
    isRunning: boolean,
    globalSettings: GlobalPhysicsSettings,
    beforeFixedStep?: (fixedDelta: number) => void,
    afterFixedStep?: (fixedDelta: number, stepEvents?: RuntimePhysicsEvent[]) => void
  ): EngineDiagnostics {
    this.lastSettings = globalSettings
    if (!this.wasmLoaded || !this.runtime) return this.diagnostics
    this.configureTiming(globalSettings, !isRunning)
    if (isRunning && this.entities.length > 0) {
      const frameDelta = normalizeSimulationFrameDelta(dt)
      const gravity = finiteNumber(globalSettings.gravity, 9.8)
      const airFriction = Math.max(0, finiteNumber(globalSettings.airFriction, 0.01))
      // 26.47: a scene without rigid bodies, tile collision or joints (a rhythm game) skips the solver
      // synchronisation and pose read-back; fixed steps, timers and their callbacks run as before.
      const idle = this.physicsIdle()
      this.physicsIdleFrames = idle ? this.physicsIdleFrames + 1 : 0
      if (beforeFixedStep) {
        const steps = this.runtime.prepare_advance(frameDelta)
        const fixedDelta = 1 / Math.min(1000, Math.max(1, finiteNumber(globalSettings.tickRate, 60)))
        for (let step = 0; step < steps; step++) {
          beforeFixedStep(fixedDelta)
          this.updatePathFollowers(fixedDelta)
          // A fixed_update that adds a body ends the idle frame at once.
          const stepIdle = idle && (step === 0 || this.physicsIdle())
          if (!stepIdle) this.synchronizeRuntime(globalSettings)
          this.runtime.advance_fixed_tick(gravity, airFriction)
          if (!stepIdle) this.readRuntimeState(1, globalSettings)
          // Per-step dispatch hands each step but the last its own events (the next step's sync sends
          // callback edits to the solver). The last step's events stay queued: the host dispatches them
          // after this frame's presentation read, so that read cannot overwrite what a callback set.
          // The frame's `events` lists all of them either way.
          afterFixedStep?.(fixedDelta, globalSettings.eventDispatch === 'step' && step < steps - 1 ? this.drainStepEvents() : undefined)
        }
        this.runtime.complete_advance()
      } else {
        this.updatePathFollowers(frameDelta)
        if (!idle) this.synchronizeRuntime(globalSettings)
        this.runtime.advance(frameDelta, gravity, airFriction)
      }
      if (!idle || !this.physicsIdle()) this.readRuntimeState(this.runtime.interpolation_alpha(), globalSettings)
    } else {
      this.synchronizeRuntime(globalSettings)
    }
    this.readDiagnostics()
    return this.diagnostics
  }

  /** Host calls between complete update/singleStep calls, after releasing held input.
   * Reset sampling/debt only: do not rebuild storage, read poses or drain pending events.
   * Rust retains current presentation until a new fixed tick replaces the old interpolation pair. */
  resetSimulationClock(): void {
    if (!this.wasmLoaded || !this.runtime) return
    this.runtime.reset_frame_clock()
    this.diagnostics.stepsLastFrame = 0
    this.diagnostics.interpolationAlpha = 1
  }

  /** 同步当前编辑数据，强制执行一个固定物理步并回读完整状态及诊断。 */ singleStep(globalSettings: GlobalPhysicsSettings): EngineDiagnostics {
    this.lastSettings = globalSettings
    if (!this.wasmLoaded || !this.runtime) return this.diagnostics
    this.updatePathFollowers(1 / Math.min(1000, Math.max(1, finiteNumber(globalSettings.tickRate, 60))))
    this.synchronizeRuntime(globalSettings)
    this.configureTiming(globalSettings, true)
    this.runtime.single_step(
      finiteNumber(globalSettings.gravity, 9.8),
      Math.max(0, finiteNumber(globalSettings.airFriction, 0.01))
    )
    this.readRuntimeState(1, globalSettings)
    this.readDiagnostics()
    return this.diagnostics
  }

  /** 按速度更新路径归一化进度，在线段间插值目标世界位置，并按设置调整朝向。 */ private updatePathFollowers(delta: number): void {
    for (const pathEntity of this.entities) {
      const path = pathEntity.authoring.path, target = pathEntity.authoring.kind === 'Path' && path.follower.targetUuid ? this.entities.find(/* 比较 entity.uuid 与 path.follower.targetUuid，返回严格相等的判断结果。 */ entity => entity.uuid === path.follower.targetUuid) : null
      if (!target || path.points.length < 2 || !Number.isFinite(delta) || delta <= 0) continue
      const next = path.follower.progress + path.follower.speed * delta
      path.follower.progress = path.closed ? ((next % 1) + 1) % 1 : Math.min(1, Math.max(0, next))
      const segments = path.closed ? path.points.length : path.points.length - 1, scaled = path.follower.progress * segments, segment = Math.min(segments - 1, Math.floor(scaled)), amount = Math.min(1, scaled - segment)
      const first = path.points[segment], second = path.points[(segment + 1) % path.points.length], local = { x: first.x + (second.x - first.x) * amount, y: first.y + (second.y - first.y) * amount }, position = localPointToWorld(pathEntity, local, this.entities), transform = worldTransform(target, this.entities)
      setWorldTransform(target, { ...transform, position, rotation: path.follower.orient ? worldTransform(pathEntity, this.entities).rotation + Math.atan2(second.y - first.y, second.x - first.x) : transform.rotation }, this.entities)
    }
  }

  /** 26.47: frames in a row that skipped the solver synchronisation (no rigid bodies, tile collision or joints). */
  physicsIdleFrames = 0
  /** True when nothing in the scene needs the solver: no body or joint is (or was) in it and no entity has a
   * RigidBody2D or a TileMap2D. */
  physicsIdle(): boolean {
    if (this.bodyHandles.size || this.tileCollisionBodies.length || this.connections.length) return false
    for (const entity of this.entities) if (entity.hasComponent('RigidBody2D') || entity.hasComponent('TileMap2D')) return false
    return true
  }

  /** 返回求解器状态摘要；尚未初始化运行时时返回固定的空状态摘要。 */ stateChecksum(): string {
    if (!this.runtime) return '0000000000000000'
    return (this.runtime as unknown as { state_checksum: () => string }).state_checksum()
  }

  /* 根据 this.wasmLoaded 的真假，分别返回 migrate_project_json(source) 或 source。 */ formatProjectJson(source: string): string {
    return this.wasmLoaded ? migrate_project_json(source) : source
  }

  /** 同步当前世界后请求最近射线命中，将运行句柄映射为项目实体。 */ raycast(origin: Vec2, direction: Vec2, distance: number, mask = 0xffff_ffff): PhysicsQueryHit2D | null {
    this.prepareQuery()
    if (!this.runtime) return null
    return this.mapQueryHit(JSON.parse(this.runtime.raycast_json(origin.x, origin.y, direction.x, direction.y, distance, mask >>> 0)) as WasmQueryHit | null)
  }

  /** 查询全部射线命中，移除无法映射的记录，并按拥有实体 UUID 去重。 */ raycastAll(origin: Vec2, direction: Vec2, distance: number, mask = 0xffff_ffff): PhysicsQueryHit2D[] {
    this.prepareQuery()
    if (!this.runtime) return []
    const mapped = (JSON.parse(this.runtime.raycast_all_json(origin.x, origin.y, direction.x, direction.y, distance, mask >>> 0)) as WasmQueryHit[]).flatMap(/** 把原生命中映射到项目实体，缺少对应实体时不输出记录。 */ hit => {
      const mapped = this.mapQueryHit(hit)
      return mapped ? [mapped] : []
    })
    const seen = new Set<string>()
    return mapped.filter(/* 先计算 !seen.has(hit.entityUuid)；仅当其为真值时求右侧 Boolean(seen.add(hit.entityUuid))，返回短路求值结果。 */ hit => !seen.has(hit.entityUuid) && Boolean(seen.add(hit.entityUuid)))
  }

  /** 同步世界并查询覆盖指定点的碰撞体，返回去重后的项目实体 UUID。 */ overlapPoint(point: Vec2, mask = 0xffff_ffff): string[] {
    this.prepareQuery()
    return this.runtime ? this.mapQueryHandles(JSON.parse(this.runtime.overlap_point_json(point.x, point.y, mask >>> 0)) as number[]) : []
  }

  /** 同步世界并查询与指定圆相交的碰撞体，返回去重后的项目实体 UUID。 */ overlapCircle(center: Vec2, radius: number, mask = 0xffff_ffff): string[] {
    this.prepareQuery()
    return this.runtime ? this.mapQueryHandles(JSON.parse(this.runtime.overlap_circle_json(center.x, center.y, radius, mask >>> 0)) as number[]) : []
  }

  /** 同步世界并查询与旋转矩形相交的碰撞体，返回去重后的项目实体 UUID。 */ overlapBox(center: Vec2, size: Vec2, angle = 0, mask = 0xffff_ffff): string[] {
    this.prepareQuery()
    return this.runtime ? this.mapQueryHandles(JSON.parse(this.runtime.overlap_box_json(center.x, center.y, size.x, size.y, angle, mask >>> 0)) as number[]) : []
  }

  /** 同步世界并执行矩形形状扫描，返回映射后的最近实体命中。 */ shapeCast(center: Vec2, size: Vec2, angle: number, direction: Vec2, distance: number, mask = 0xffff_ffff): PhysicsQueryHit2D | null {
    this.prepareQuery()
    if (!this.runtime) return null
    return this.mapQueryHit(JSON.parse(this.runtime.shape_cast_json(center.x, center.y, size.x, size.y, angle, direction.x, direction.y, distance, mask >>> 0)) as WasmQueryHit | null)
  }

  /** 校验有限输入及排除预算，执行带掩码的原生查询，拒绝结果饱和并按项目拥有者归并命中。 */ queryPhysics(request: PhysicsQueryRequest2D): PhysicsQueryHit2D[] {
    const excluded = new Set(request.excludeEntityUuids ?? [])
    if (excluded.size > 1024) throw new Error('PHYSICS_QUERY_LIMIT: at most 1024 excluded entities are supported.')
    this.prepareQuery()
    if (!this.runtime) return []
    const excludedHandles = this.activeBodies.flatMap(/* 根据 excluded.has((this.tileCollisionOwners.get(entity.id) ?? entity).uuid) 的真假，分别返回 [this.bodyHandles.get(entity.id)!] 或 []。 */ entity => excluded.has((this.tileCollisionOwners.get(entity.id) ?? entity).uuid) ? [this.bodyHandles.get(entity.id)!] : [])
    if (excludedHandles.length > 1024) throw new Error('PHYSICS_QUERY_LIMIT: excluded entities expand to more than 1024 solver bodies.')
    const payload = { kind: request.kind, origin: [request.origin.x, request.origin.y], direction: [request.direction?.x ?? 1, request.direction?.y ?? 0], size: [request.size?.x ?? 1, request.size?.y ?? 1], angle: request.angle ?? 0, radius: request.radius ?? 1, distance: request.distance ?? 0, layerMask: (request.layerMask ?? 0xffff_ffff) >>> 0, includeSensors: request.includeSensors !== false, excludedHandles, maximumResults: request.maximumResults ?? 4096 }
    if ([...payload.origin, ...payload.direction, ...payload.size, payload.angle, payload.radius, payload.distance].some(/* 返回 Number.isFinite(value) 的逻辑取反结果。 */ value => !Number.isFinite(value))) throw new Error('PHYSICS_QUERY_INPUT: query values must be finite.')
    const native = this.runtime as WasmRuntimeWorld & { query_filtered_json(source: string): string }
    const hits = JSON.parse(native.query_filtered_json(JSON.stringify(payload))) as WasmQueryHit[]
    if (hits.length === 4096) throw new Error('PHYSICS_QUERY_LIMIT: query saturated 4096 solver-body results; narrow the region or layer mask before owner grouping and sorting.')
    const owners = new Map(this.activeBodies.map(/* 返回按声明顺序构造的数组 [this.bodyHandles.get(entity.id), this.tileCollisionOwners.get(entity.id) ?? entity]。 */ entity => [this.bodyHandles.get(entity.id), this.tileCollisionOwners.get(entity.id) ?? entity]))
    const seen = new Set<string>()
    return hits.flatMap(/** 按项目拥有者过滤未知及重复原生命中，保留首个命中的几何和碰撞属性。 */ hit => {
      const entity = owners.get(hit.handle)
      if (!entity || seen.has(entity.uuid)) return []
      seen.add(entity.uuid)
      return [{ entityUuid: entity.uuid, point: { x: hit.point[0], y: hit.point[1] }, normal: { x: hit.normal[0], y: hit.normal[1] }, distance: hit.distance, collider: hit.collider, sensor: hit.sensor, physicsLayer: hit.physicsLayer, bodyType: hit.bodyType }]
    })
  }

  /** 把最近对象请求转换为最多返回一项的统一物理查询。 */ nearest(center: Vec2, maximumDistance: number, mask = 0xffff_ffff, _samples = 64): PhysicsQueryHit2D | null {
    return this.queryPhysics({ kind: 'Nearest', origin: center, distance: Math.max(0, finiteNumber(maximumDistance, 0)), layerMask: mask, maximumResults: 1 })[0] ?? null
  }

  /* 调用 this.events.filter(event => event.firstEntityUuid === entityUuid || event.secondEntityUuid === entityUuid) 并返回调用结果。 */ contactQuery(entityUuid: string): RuntimePhysicsEvent[] {
    return this.events.filter(/* 先计算 event.firstEntityUuid === entityUuid；仅当其为假值时求右侧 event.secondEntityUuid === entityUuid，返回短路求值结果。 */ event => event.firstEntityUuid === entityUuid || event.secondEntityUuid === entityUuid)
  }

  /** 26.45: identifies the solver's body and joint layout (handles in order); a physics snapshot
   * can only be restored while it is unchanged. */
  runtimeLayoutKey(): string {
    let key = ''
    for (const entity of this.activeBodies) key += `${this.bodyHandles.get(entity.id) ?? -1},`
    key += '|'
    for (const record of this.activeConnectionRecords) key += `${this.connectionHandles.get(`${record.connection.uuid}:${record.segment}`) ?? -1},`
    return key
  }

  /** 26.45: segment casts for particles (see ParticleWorld.castParticleSegments); hits on the body
   * of `ignore` (the emitter's own) do not count. */
  castParticleSegments(segments: Float64Array, mask: number, ignore: Entity | null): Float64Array | null {
    const runtime = this.runtime as unknown as { cast_segments?(segments: Float64Array, mask: number): Float64Array } | null
    if (!this.wasmLoaded || !runtime?.cast_segments) return null
    this.prepareQuery()
    const raw = runtime.cast_segments(segments, mask >>> 0), ignored = ignore ? this.bodyHandles.get(ignore.id) : undefined
    const result = new Float64Array(Math.floor(raw.length / 5) * 4)
    for (let index = 0; index * 5 + 4 < raw.length; index++) {
      if (raw[index * 5] < .5 || raw[index * 5 + 4] === ignored) continue
      result[index * 4] = 1; result[index * 4 + 1] = raw[index * 5 + 1]; result[index * 4 + 2] = raw[index * 5 + 2]; result[index * 4 + 3] = raw[index * 5 + 3]
    }
    return result
  }

  /** 26.45: the body's pose after the last fixed step (the solver's, not the interpolated display
   * pose); null when the entity has no body in the solver. */
  physicsPose(entity: Entity): { position: Vec2; rotation: number } | null {
    const handle = this.bodyHandles.get(entity.id), pose = handle === undefined ? undefined : this.nativeBodyPoses.get(handle)
    return pose ? { position: { x: pose.x, y: pose.y }, rotation: pose.rotation } : null
  }

  /** 26.45: complete solver snapshots kept in WASM by slot (the debugger's rewind keyframes).
   * Returns the snapshot's approximate size in bytes (0 without a solver). */
  saveRuntimeSnapshot(slot: number): number {
    const runtime = this.runtime as unknown as { save_snapshot?(slot: number): number } | null
    return runtime?.save_snapshot ? runtime.save_snapshot(slot) : 0
  }

  /** 26.45: restores a snapshot and shows it (see adoptRuntimeState); false when the slot is empty. */
  restoreRuntimeSnapshot(slot: number): boolean {
    const runtime = this.runtime as unknown as { restore_snapshot?(slot: number): boolean } | null
    if (!runtime?.restore_snapshot || !runtime.restore_snapshot(slot)) return false
    this.adoptRuntimeState()
    return true
  }

  dropRuntimeSnapshot(slot: number): void { (this.runtime as unknown as { drop_snapshot?(slot: number): boolean } | null)?.drop_snapshot?.(slot) }
  clearRuntimeSnapshots(): void { (this.runtime as unknown as { clear_snapshots?(): void } | null)?.clear_snapshots?.() }

  /** 26.45: after the solver state was replaced (a restored snapshot), shows it: bodies, ropes and
   * joints take the solver's poses and velocities, and conveyor/target settings are sent again. */
  adoptRuntimeState(): void {
    if (!this.runtime) return
    this.bodySurfaces.clear()
    this.bodyTargets.clear()
    this.readRuntimeState(1, this.lastSettings)
    this.events = []
    this.stepEventBuffer = []
  }

  /** 先更新实体世界姿态；已存在运行句柄时同步传送求解器，原生失败返回假。 */ teleport(entity: Entity, position: Vec2, angle = worldTransform(entity, this.entities).rotation): boolean {
    const transform = worldTransform(entity, this.entities)
    const target = { x: finiteNumber(position.x, transform.position.x), y: finiteNumber(position.y, transform.position.y) }
    setWorldTransform(entity, { ...transform, position: target, rotation: finiteNumber(angle, transform.rotation) }, this.entities)
    const handle = this.bodyHandles.get(entity.id)
    if (!this.runtime || handle === undefined) return true
    try {
      const runtime = this.runtime as unknown as { teleport_body: (handle: number, x: number, y: number, angle: number) => void }
      runtime.teleport_body(handle, target.x, target.y, finiteNumber(angle, transform.rotation))
      this.storeNativeBodyPose(handle, target.x, target.y, finiteNumber(angle, transform.rotation))
      return true
    } catch { return false }
  }

  /** 规范角色移动配置，调用求解器滑动与台阶移动，成功后同时更新实体位置和同步记录缓存。 */ moveCharacterBox(
    entity: Entity,
    size: Vec2,
    displacement: Vec2,
    settings: { maxSlopeAngle: number; stepHeight: number; floorSnap: number; maxSlides: number; safeMargin: number; collisionMask: number }
  ): CharacterMoveResult2D | null {
    this.prepareQuery()
    const handle = this.bodyHandles.get(entity.id)
    if (!this.runtime || handle === undefined) return null
    const runtime = this.runtime as unknown as {
      move_character_box_json: (handle: number, width: number, height: number, dx: number, dy: number, slope: number, step: number, snap: number, slides: number, margin: number, mask: number) => string
    }
    const result = JSON.parse(runtime.move_character_box_json(
      handle,
      Math.abs(finiteNumber(size.x, 1)), Math.abs(finiteNumber(size.y, 1)),
      finiteNumber(displacement.x), finiteNumber(displacement.y),
      finiteNumber(settings.maxSlopeAngle, Math.PI / 4), Math.max(0, finiteNumber(settings.stepHeight)),
      Math.max(0, finiteNumber(settings.floorSnap)), Math.min(32, Math.max(1, Math.round(finiteNumber(settings.maxSlides, 4)))),
      Math.max(1e-9, finiteNumber(settings.safeMargin, 1e-5)), settings.collisionMask >>> 0
    )) as CharacterMoveResult2D & { error?: string }
    if (result.error) return null
    setWorldTransform(entity, {
      ...worldTransform(entity, this.entities),
      position: { x: result.position[0], y: result.position[1] }
    }, this.entities)
    const record = this.bodyRecords.get(handle)
    if (record) {
      record[2] = result.position[0]
      record[3] = result.position[1]
    }
    // Character translation leaves the solver angle unchanged; the entity may still display an older interpolated angle.
    const nativeRotation = this.nativeBodyPoses.get(handle)?.rotation ?? worldTransform(entity, this.entities).rotation
    this.storeNativeBodyPose(handle, result.position[0], result.position[1], nativeRotation)
    return result
  }

  /** 26.44: entity (the project-owned one for baked tile collision) of a character's floor handle. */ entityForBodyHandle(handle: number | undefined): Entity | null {
    return typeof handle === 'number' && handle > 0 ? this.entityForHandle(handle) : null
  }

  /** 26.44: let a character drop through one-way platforms for `seconds` (it keeps passing while it still overlaps one). */ dropThroughOneWay(entity: Entity, seconds: number): boolean {
    this.prepareQuery()
    const handle = this.bodyHandles.get(entity.id)
    if (!this.runtime || handle === undefined) return false
    const runtime = this.runtime as unknown as { set_one_way_pass_through?: (handle: number, seconds: number) => void }
    if (typeof runtime.set_one_way_pass_through !== 'function') return false
    try { runtime.set_one_way_pass_through(handle, Math.min(10, Math.max(0, finiteNumber(seconds)))); return true } catch { return false }
  }

  /** 同步运行体后施加一次临时力与扭矩；没有有效运行句柄时返回假。 */ applyTransientForce(entity: Entity, force: Vec2, torque = 0): boolean {
    this.prepareQuery()
    const handle = this.bodyHandles.get(entity.id)
    if (!this.runtime || handle === undefined) return false
    const runtime = this.runtime as unknown as { apply_transient_force: (handle: number, x: number, y: number, torque: number) => void }
    runtime.apply_transient_force(handle, finiteNumber(force.x), finiteNumber(force.y), finiteNumber(torque))
    return true
  }

  /** Shift the coordinate frame while retaining native handles, sleep and contact state. */
  /** 校验平移范围，移动原生坐标系及根实体、绳节点、缓存和事件点，保留运行句柄及求解接触状态。 */ shiftOrigin(offset: Vec2): void {
    if (![offset.x, offset.y].every(/* 先计算 Number.isFinite(value)；仅当其为真值时求右侧 Math.abs(value) <= 1e12，返回短路求值结果。 */ value => Number.isFinite(value) && Math.abs(value) <= 1e12)) throw new Error('ORIGIN_SHIFT_INPUT: offset must be finite and within world bounds.')
    const ids = new Set(this.entities.map(/* 返回 entity.uuid 的当前值。 */ entity => entity.uuid)), roots = this.entities.filter(/* 先计算 !entity.parentUuid；仅当其为假值时求右侧 !ids.has(entity.parentUuid)，返回短路求值结果。 */ entity => !entity.parentUuid || !ids.has(entity.parentUuid))
    if (roots.some(/* 先计算 !Number.isFinite(entity.transform.position.x - offset.x)；仅当其为假值时求右侧 !Number.isFinite(entity.transform.position.y - offset.y)，返回短路求值结果。 */ entity => !Number.isFinite(entity.transform.position.x - offset.x) || !Number.isFinite(entity.transform.position.y - offset.y))) throw new Error('ORIGIN_SHIFT_INPUT: translated positions must be finite.')
    const runtime = this.runtime as (WasmRuntimeWorld & { shift_origin(x: number, y: number): void }) | null
    runtime?.shift_origin(offset.x, offset.y)
    const move = /** 从二维点减去世界原点偏移，就地转换到新的坐标系。 */ (point: Vec2) => { point.x -= offset.x; point.y -= offset.y }
    for (const entity of roots) move(entity.transform.position)
    for (const entity of this.tileCollisionBodies) move(entity.transform.position)
    const shiftedConnections = new Set<Connection>()
    for (const connection of [...this.connections, ...this.activeConnectionRecords.map(/* 返回 record.connection 的当前值。 */ record => record.connection)]) {
      if (shiftedConnections.has(connection)) continue
      shiftedConnections.add(connection); for (const node of connection.ropeNodes) move(node.position)
    }
    const bodies = /** 按刚体 ABI 步长移动每条缓存记录的位置字段。 */ (values: Float64Array) => { for (let at = 0; at + PHYSICS_STRIDE <= values.length; at += PHYSICS_STRIDE) { values[at + 2] -= offset.x; values[at + 3] -= offset.y } }
    const ropes = /** 按连接 ABI 步长及绳节点容量移动每个缓存绳节点的位置字段。 */ (values: Float64Array) => { for (let at = 0; at + CONNECTION_STRIDE <= values.length; at += CONNECTION_STRIDE) for (let node = 0; node < Math.min(ROPE_NODE_CAPACITY, values[at + 27]); node++) { const index = at + ROPE_NODE_DATA_OFFSET + node * 4; values[index] -= offset.x; values[index + 1] -= offset.y } }
    for (const record of this.bodyRecords.values()) bodies(record)
    for (const pose of this.nativeBodyPoses.values()) { pose.x -= offset.x; pose.y -= offset.y }
    for (const record of this.connectionRecords.values()) ropes(record)
    bodies(this.previousBodyBuffer)
    const bodyLength = Math.min(this.activeBodies.length * PHYSICS_STRIDE, this.stateBuffer.length)
    bodies(this.stateBuffer.subarray(0, bodyLength)); ropes(this.stateBuffer.subarray(bodyLength))
    for (const event of this.events) if (event.point) { event.point[0] -= offset.x; event.point[1] -= offset.y }
  }

  /** 清空求解器和对应句柄、差异记录、瓦片碰撞及计时缓存，重置运行句柄分配器。 */ invalidateRuntime(): void {
    invalidateHierarchyIndex()
    this.runtime?.clear()
    this.fullSyncEntityCount = -1
    this.bodyHandles.clear()
    this.connectionHandles.clear()
    this.bodyRecords.clear()
    this.nativeBodyPoses.clear()
    this.colliderChildRecords.clear()
    this.bodySurfaces.clear()
    this.bodyTargets.clear()
    this.startedTargets = new WeakSet<TargetJoint2D>()
    this.connectionRecords.clear()
    this.bodyOrders.clear()
    this.connectionOrders.clear()
    this.activeConnectionRecords = []
    this.runtimeJointConnections.clear()
    this.activeBodies = []
    this.tileCollisionBodies = []
    this.tileCollisionOwners.clear()
    this.tileCollisionSignature = ''
    this.nextRuntimeHandle = 1
    this.timingSignature = ''
  }

  /** Final host-owned disposal; clear cached views and free the native wrapper once. */
  disposeRuntimeWorld(): void {
    if (this.runtimeDisposed) return
    this.runtimeDisposed = true
    const runtime = this.runtime
    this.runtime = null
    this.wasmLoaded = false
    try { this.invalidateRuntime() } finally { runtime?.free() }
  }

  /** 分配不重复的 32 位运行句柄，达到上限时拒绝继续。 */ private allocateRuntimeHandle(): number {
    if (this.nextRuntimeHandle >= 0xffff_ffff) throw new Error('Runtime handle space is exhausted')
    return this.nextRuntimeHandle++
  }

  /** 仅在 WASM 已就绪时把当前编辑数据同步到查询世界。26.44: between full syncs (one per fixed step) a query
   * only sends the poses that scripts changed; the full sync (shapes, materials, added or removed
   * bodies) runs when the entity list changed or no full sync has happened yet. Before 26.44 every
   * query and every character move re-encoded every body (14 ms per query with 2,600 bodies). */ private prepareQuery(): void {
    if (!this.wasmLoaded) return
    if (this.fullSyncEntityCount !== this.entities.length || !this.synchronizePoses()) this.synchronizeRuntime(this.lastSettings)
  }

  /** 26.44: send changed world poses of the bodies of the last full sync; false when a full sync is needed. */ private synchronizePoses(): boolean {
    const runtime = this.runtime
    if (!runtime) return true
    for (const entity of this.activeBodies) {
      if (this.tileCollisionOwners.has(entity.id)) continue
      const handle = this.bodyHandles.get(entity.id), cached = handle === undefined ? undefined : this.bodyRecords.get(handle)
      if (handle === undefined || !cached || !entity.enabled) return false
      const transform = worldTransform(entity, this.entities)
      if (Object.is(transform.position.x, cached[2]) && Object.is(transform.position.y, cached[3]) && Object.is(transform.rotation, cached[14])) continue
      cached[2] = transform.position.x; cached[3] = transform.position.y; cached[14] = transform.rotation
      runtime.upsert_body(handle, this.bodyOrders.get(handle) ?? 0, cached)
      this.storeNativeBodyPose(handle, cached[2], cached[3], cached[14])
    }
    return true
  }

  /** 查找运行句柄对应的活动体，并将合成瓦片碰撞体还原为其项目拥有实体。 */ private entityForHandle(handle: number): Entity | null {
    const entity = this.activeBodies.find(/* 比较 this.bodyHandles.get(candidate.id) 与 handle，返回严格相等的判断结果。 */ candidate => this.bodyHandles.get(candidate.id) === handle) ?? null
    return entity ? this.tileCollisionOwners.get(entity.id) ?? entity : null
  }

  /** 把有效运行命中转为实体 UUID 和有限坐标；缺失句柄或实体时返回 null。 */ private mapQueryHit(hit: WasmQueryHit | null): PhysicsQueryHit2D | null {
    if (!hit) return null
    const entity = this.entityForHandle(hit.handle)
    if (!entity) return null
    return { entityUuid: entity.uuid, point: { x: finiteNumber(hit.point?.[0]), y: finiteNumber(hit.point?.[1]) }, normal: { x: finiteNumber(hit.normal?.[0]), y: finiteNumber(hit.normal?.[1]) }, distance: Math.max(0, finiteNumber(hit.distance)) }
  }

  /** 将运行句柄映射为项目实体 UUID，忽略未知句柄并去重。 */ private mapQueryHandles(handles: number[]): string[] {
    return [...new Set(handles.flatMap(/** 将单个句柄转换为可用实体 UUID，未知句柄输出空列表。 */ handle => {
      const entity = this.entityForHandle(handle)
      return entity ? [entity.uuid] : []
    }))]
  }

  /** 准备活动碰撞体与连接，只有顺序或 ABI 数据改变时更新求解器，销毁已离开活动集合的运行对象。 */ private synchronizeRuntime(settings: GlobalPhysicsSettings): void {
    const runtime = this.runtime
    if (!runtime) return
    this.fullSyncEntityCount = this.entities.length
    this.rebuildTileCollisionBodies()
    const colliderSets = new Map<number, ReturnType<typeof prepareColliderSet>>()
    this.colliderPreparationIssues.clear()
    this.activeBodies = this.entities.filter(/** 仅接受启用且具有有效刚体及碰撞器的实体，准备形状并记录阻塞原因。 */ entity => {
      if (!entity.enabled || !entity.hasComponent('RigidBody2D') || !entity.rigidBody.enabled || entity.getCollider() === null || !entity.collider.enabled) return false
      const prepared = prepareColliderSet(entity.collider, !entity.isStatic && !entity.isKinematic)
      colliderSets.set(entity.id, prepared)
      if (prepared.blockedReason) this.colliderPreparationIssues.set(entity.uuid, prepared.blockedReason)
      return prepared.shapes.length > 0 && !prepared.blockedReason
    }).concat(this.tileCollisionBodies)
    const liveBodies = new Set<number>()
    this.activeBodies.forEach(/** 为活动体分配或复用句柄，按记录差异更新刚体及复合子形状并缓存当前顺序。 */ (entity, order) => {
      let handle = this.bodyHandles.get(entity.id)
      if (handle === undefined) {
        handle = this.allocateRuntimeHandle()
        this.bodyHandles.set(entity.id, handle)
      }
      liveBodies.add(entity.id)
      const prepared = colliderSets.get(entity.id) ?? prepareColliderSet(entity.collider, !entity.isStatic && !entity.isKinematic)
      this.bodyScratch.fill(0)
      writeEntityRecord(this.bodyScratch, 0, entity, this.entities, settings, this.host.readTextAsset, handle, prepared.shapes)
      const cached = this.bodyRecords.get(handle)
      if (!cached || this.bodyOrders.get(handle) !== order || !recordsEqual(cached, this.bodyScratch)) {
        // Interpolation is a display pose. A velocity/material/shape edit must not send
        // that older pose back to the solver; explicit transform edits still take effect.
        const x = this.bodyScratch[2], y = this.bodyScratch[3], rotation = this.bodyScratch[14]
        const nativePose = this.nativeBodyPoses.get(handle)
        if (cached && nativePose) {
          if (Object.is(x, cached[2])) this.bodyScratch[2] = nativePose.x
          if (Object.is(y, cached[3])) this.bodyScratch[3] = nativePose.y
          if (Object.is(rotation, cached[14])) this.bodyScratch[14] = nativePose.rotation
        }
        runtime.upsert_body(handle, order, this.bodyScratch)
        this.storeNativeBodyPose(handle, this.bodyScratch[2], this.bodyScratch[3], this.bodyScratch[14])
        this.bodyScratch[2] = x; this.bodyScratch[3] = y; this.bodyScratch[14] = rotation
        this.storeRecord(this.bodyRecords, handle, this.bodyScratch)
        this.bodyOrders.set(handle, order)
      }
      const children = encodeColliderChildren(prepared.shapes, worldTransform(entity, this.entities).scale, settings.collisionMatrix)
      const cachedChildren = this.colliderChildRecords.get(handle)
      if (!cachedChildren || !recordsEqual(cachedChildren, children)) {
        runtime.upsert_collider_shapes(handle, children)
        this.storeRecord(this.colliderChildRecords, handle, children)
      }
      this.synchronizeBodyExtras(runtime, entity, handle)
    })
    for (const [entityId, handle] of [...this.bodyHandles]) {
      if (liveBodies.has(entityId)) continue
      runtime.destroy_body(handle)
      this.bodyHandles.delete(entityId)
      this.bodyRecords.delete(handle)
      this.nativeBodyPoses.delete(handle)
      this.colliderChildRecords.delete(handle)
      this.bodyOrders.delete(handle)
      this.bodySurfaces.delete(handle)
      this.bodyTargets.delete(handle)
    }

    const joints = connectionsFromJointComponents(this.entities), liveJoints = new Set(joints.map(/* 返回 connection.uuid 的当前值。 */ connection => connection.uuid))
    for (const uuid of this.runtimeJointConnections.keys()) if (!liveJoints.has(uuid)) this.runtimeJointConnections.delete(uuid)
    for (const connection of joints) {
      const previous = this.runtimeJointConnections.get(connection.uuid)
      if (previous) { connection.breakState = previous.breakState; connection.breakLink = previous.breakLink }
      this.runtimeJointConnections.set(connection.uuid, connection)
    }
    const runtimeConnections = [...this.connections, ...joints]
    this.activeConnectionRecords = collectConnectionRecords(this.activeBodies, runtimeConnections, this.entities)
    const liveConnections = new Set<string>()
    this.activeConnectionRecords.forEach(/** 按连接 UUID 和分段索引复用句柄，仅记录或排序改变时更新原生连接。 */ (record, order) => {
      const key = `${record.connection.uuid}:${record.segment}`
      liveConnections.add(key)
      let handle = this.connectionHandles.get(key)
      if (handle === undefined) {
        handle = this.allocateRuntimeHandle()
        this.connectionHandles.set(key, handle)
      }
      this.connectionScratch.fill(0)
      writeConnectionRecord(this.connectionScratch, 0, record, this.activeBodies, this.entities, handle)
      const cached = this.connectionRecords.get(handle)
      if (!cached || this.connectionOrders.get(handle) !== order || !recordsEqual(cached, this.connectionScratch)) {
        runtime.upsert_connection(handle, order, this.connectionScratch)
        this.storeRecord(this.connectionRecords, handle, this.connectionScratch)
        this.connectionOrders.set(handle, order)
      }
    })
    for (const [key, handle] of [...this.connectionHandles]) {
      if (liveConnections.has(key)) continue
      runtime.destroy_connection(handle)
      this.connectionHandles.delete(key)
      this.connectionRecords.delete(handle)
      this.connectionOrders.delete(handle)
    }
  }

  /** 规范时间步、追帧和质量参数，仅配置签名变化时调用原生计时与迭代设置。 */ private configureTiming(settings: GlobalPhysicsSettings, paused: boolean): void {
    if (!this.runtime) return
    const profile = normalizePhysicsProfile(settings.profile ?? defaultPhysicsProfile())
    const tickRate = Math.min(1000, Math.max(1, finiteNumber(settings.tickRate, profile.tickRate)))
    const catchUp = Math.min(240, Math.max(1, Math.round(finiteNumber(settings.maxCatchUpSteps, profile.maxCatchUpSteps))))
    const timeScale = Math.min(100, Math.max(0, finiteNumber(settings.timeScale, 1)))
    const dropCode = profile.droppedTimePolicy === 'PreserveBacklog' ? 1 : profile.droppedTimePolicy === 'SlowMotion' ? 2 : 0
    const signature = `${tickRate}:${catchUp}:${timeScale}:${paused}:${dropCode}:${profile.minimumSubsteps}:${profile.velocityIterations}:${profile.positionIterations}:${profile.sleepLinearThreshold}:${profile.sleepAngularThreshold}:${profile.timeToSleep}`
    if (signature === this.timingSignature) return
    const runtime = this.runtime as unknown as {
      set_timing: (tickRate: number, catchUp: number, scale: number, paused: boolean, droppedPolicy: number) => void
      set_physics_quality_iterations: (substeps: number, velocityIterations: number, positionIterations: number, sleepLinear: number, sleepAngular: number, timeToSleep: number) => void
    }
    runtime.set_timing(tickRate, catchUp, timeScale, paused, dropCode)
    runtime.set_physics_quality_iterations(profile.minimumSubsteps, profile.velocityIterations, profile.positionIterations, profile.sleepLinearThreshold, profile.sleepAngularThreshold, profile.timeToSleep)
    this.timingSignature = signature
  }

  /** 用资源代数、地图修订及世界变换作为缓存签名，变化时重建不可见静态瓦片碰撞体及拥有者映射。 */ private rebuildTileCollisionBodies(): void {
    const tileMaps = this.entities.flatMap(/** 筛选实体及瓦片地图组件都启用且未移除的地图。 */ entity => {
      const component = entity.getComponent<TileMap2D>('TileMap2D')
      return component?.enabled && !component.removed && entity.enabled ? [{ entity, component }] : []
    })
    const assetRevision = this.host.assetRevision()
    if (!Number.isSafeInteger(assetRevision) || assetRevision < 0) throw new Error('WORLD_ASSET_REVISION_INVALID: expected a nonnegative safe integer.')
    const signature = `${assetRevision}|${tileMaps.map(/** 将地图身份、内容修订、碰撞设置及世界变换编码为重建缓存签名。 */ ({ entity, component }) => {
      const transform = worldTransform(entity, this.entities)
      return [entity.uuid, component.revision, component.tileSetAsset, component.width, component.height, component.tileSize.x, component.tileSize.y, component.physicsLayer, component.collisionMask, transform.position.x, transform.position.y, transform.rotation, transform.scale.x, transform.scale.y].join(':')
    }).join('|')}`
    if (signature === this.tileCollisionSignature) return
    const bodies: Entity[] = []
    const owners = new Map<number, Entity>()
    let syntheticId = -1
    for (const { entity, component } of tileMaps) {
      const transform = worldTransform(entity, this.entities)
      for (const descriptor of this.host.buildTileColliderDescriptors(component)) {
        const center = {
          x: descriptor.center.x * transform.scale.x,
          y: descriptor.center.y * transform.scale.y
        }
        const { sine, cosine } = stableSinCos(transform.rotation)
        const worldCenter = {
          x: transform.position.x + center.x * cosine - center.y * sine,
          y: transform.position.y + center.x * sine + center.y * cosine
        }
        const body = new BoxEntity(syntheticId--, worldCenter, descriptor.size)
        body.name = `${entity.name} collision`
        body.editorVisible = false
        body.renderer.enabled = false
        body.isStatic = true
        body.transform.rotation = transform.rotation
        body.transform.scale = { x: transform.scale.x, y: transform.scale.y }
        if (descriptor.vertices.length >= 3) body.vertices = descriptor.vertices.map(/** 构造并返回记录 { ...point }，字段按当前实参及捕获状态求值。 */ point => ({ ...point }))
        body.collider.physicsLayer = component.physicsLayer
        body.collider.collisionMask = component.collisionMask >>> 0
        body.collider.oneWay = descriptor.oneWay
        body.collider.oneWayNormal = { x: 0, y: 1 }
        bodies.push(body)
        owners.set(body.id, entity)
      }
    }
    // A failed projector must not publish a successful cache revision or discard the last valid projection.
    this.tileCollisionBodies = bodies
    this.tileCollisionOwners = owners
    this.tileCollisionSignature = signature
  }

  /** 复用缓冲读取当前及前一固定步状态，按设置插值显示姿态，并刷新刚体和连接同步记录。 */ private readRuntimeState(alpha: number, settings: GlobalPhysicsSettings): void {
    if (!this.runtime) return
    const stateLength = this.runtime.state_len()
    const bodyLength = this.runtime.body_state_len()
    // 26.45: the solver rebuilds its state at its next step. Until then (the world was cleared or
    // bodies were added or removed since the last step) the state does not describe these bodies;
    // reading it gave every body an empty record, and static bodies, which are not read again,
    // stayed at (0, 0). In the editor this happened when Play began on a frame without a fixed step.
    if (bodyLength !== this.activeBodies.length * PHYSICS_STRIDE) return
    this.stateBuffer = ensureBuffer(this.stateBuffer, stateLength)
    this.previousBodyBuffer = ensureBuffer(this.previousBodyBuffer, bodyLength)
    if (this.copyBorrowedRuntimeState(false, this.stateBuffer, stateLength) !== stateLength) return
    const previousLength = this.copyBorrowedRuntimeState(true, this.previousBodyBuffer, bodyLength)
    this.activeBodies.forEach(/** 恢复单个刚体状态，可选插值显示姿态，并缓存回写记录避免无变化的重复同步。 */ (entity, index) => {
      const handle = this.bodyHandles.get(entity.id), offset = index * PHYSICS_STRIDE
      // 26.44: a static body, or a body that slept through the step without moving, has nothing to
      // read back except its contact diagnostics; its cached record (written at the last sync) stays
      // valid. Re-reading and re-encoding every resting tile and body each step dominated large scenes.
      const cached = handle !== undefined ? this.bodyRecords.get(handle) : undefined
      const unchanged = cached !== undefined && this.stateBuffer[offset + 9] > .5
        || (cached !== undefined && this.stateBuffer[offset + 49] > .5 && cached[49] > .5
          && Object.is(cached[2], this.stateBuffer[offset + 2]) && Object.is(cached[3], this.stateBuffer[offset + 3]) && Object.is(cached[14], this.stateBuffer[offset + 14]))
      if (unchanged) {
        readContactDiagnostics(this.stateBuffer, index, entity)
        return
      }
      if (handle !== undefined) this.storeNativeBodyPose(handle, this.stateBuffer[offset + 2], this.stateBuffer[offset + 3], this.stateBuffer[offset + 14])
      readEntityRecord(this.stateBuffer, index, entity, this.entities)
      if (settings.interpolation === 'Interpolate' && previousLength === bodyLength && alpha < 1) {
        const transform = worldTransform(entity, this.entities)
        setWorldTransform(entity, {
          ...transform,
          position: {
            x: interpolate(this.previousBodyBuffer[offset + 2], this.stateBuffer[offset + 2], alpha),
            y: interpolate(this.previousBodyBuffer[offset + 3], this.stateBuffer[offset + 3], alpha)
          },
          rotation: interpolateAngle(this.previousBodyBuffer[offset + 14], this.stateBuffer[offset + 14], alpha)
        }, this.entities)
      }
      if (handle !== undefined) {
        this.bodyScratch.fill(0)
        writeEntityRecord(this.bodyScratch, 0, entity, this.entities, settings, this.host.readTextAsset, handle)
        this.storeRecord(this.bodyRecords, handle, this.bodyScratch)
      }
    })
    this.activeConnectionRecords.forEach(/** 恢复单条连接段状态，并将其最新 ABI 内容存入对应运行句柄缓存。 */ (record, index) => {
      readConnectionRecord(this.stateBuffer, bodyLength, index, record)
      const handle = this.connectionHandles.get(`${record.connection.uuid}:${record.segment}`)
      if (handle !== undefined) {
        this.connectionScratch.fill(0)
        writeConnectionRecord(this.connectionScratch, 0, record, this.activeBodies, this.entities, handle)
        this.storeRecord(this.connectionRecords, handle, this.connectionScratch)
      }
    })
  }

  /** Borrow and copy within one synchronous call; no pointer/view survives a tick or await. */
  /** 26.45: conveyor speed, rolling resistance and the target joint of one body, sent when changed. */
  private synchronizeBodyExtras(runtime: WasmRuntimeWorld, entity: Entity, handle: number): void {
    const extras = runtime as unknown as Partial<{
      set_body_surface(handle: number, speed: number, rolling: number): void
      set_body_target(handle: number, ax: number, ay: number, tx: number, ty: number, hertz: number, ratio: number, maxForce: number): void
      clear_body_target(handle: number): boolean
    }>
    const collider = entity.collider
    const speed = finiteNumber(collider?.surfaceSpeed, 0), rolling = Math.max(0, finiteNumber(collider?.rollingResistance, 0))
    const surfaceKey = speed || rolling ? `${speed}:${rolling}` : ''
    if ((this.bodySurfaces.get(handle) ?? '') !== surfaceKey && extras.set_body_surface) {
      extras.set_body_surface(handle, speed, rolling)
      if (surfaceKey) this.bodySurfaces.set(handle, surfaceKey); else this.bodySurfaces.delete(handle)
    }
    const target = entity.getComponent<TargetJoint2D>('TargetJoint2D')
    if (target?.enabled && !target.removed && !entity.isStatic && !entity.isKinematic) {
      const transform = worldTransform(entity, this.entities), scale = transform.scale
      if (target.startAtBody && !this.startedTargets.has(target)) {
        // The target starts where the anchor is, so the body does not jump when play starts.
        const { sine, cosine } = stableSinCos(transform.rotation)
        const local = { x: target.anchor.x * scale.x, y: target.anchor.y * scale.y }
        target.target = { x: transform.position.x + local.x * cosine - local.y * sine, y: transform.position.y + local.x * sine + local.y * cosine }
      }
      this.startedTargets.add(target)
      const anchor = { x: target.anchor.x * scale.x, y: target.anchor.y * scale.y }
      const key = [anchor.x, anchor.y, target.target.x, target.target.y, target.frequency, target.dampingRatio, target.maxForce].join(':')
      if (this.bodyTargets.get(handle) !== key && extras.set_body_target) {
        extras.set_body_target(handle, anchor.x, anchor.y, finiteNumber(target.target.x), finiteNumber(target.target.y), target.frequency, target.dampingRatio, target.maxForce)
        this.bodyTargets.set(handle, key)
      }
    } else if (this.bodyTargets.has(handle)) {
      extras.clear_body_target?.(handle)
      this.bodyTargets.delete(handle)
    }
  }

  private copyBorrowedRuntimeState(previous: boolean, target: Float64Array, expectedLength: number): number {
    if (!this.runtime) return 0
    const view: unknown = previous ? this.runtime.previous_body_state_view() : this.runtime.state_view()
    const buffer: unknown = this.runtime.memory_buffer() // Non-mutating; must not relocate the borrowed storage.
    if (!(view instanceof Float64Array) || !(buffer instanceof ArrayBuffer) || view.buffer !== buffer || !(target.buffer instanceof ArrayBuffer) || target.buffer === buffer || view.length !== expectedLength || target.length !== expectedLength || !Number.isSafeInteger(expectedLength) || expectedLength < 0 || view.byteOffset % 8 !== 0 || view.byteLength !== expectedLength * 8 || !Number.isSafeInteger(view.byteOffset + view.byteLength) || view.byteOffset + view.byteLength > buffer.byteLength) throw new Error('Invalid or expired ordinary WASM state view.')
    target.set(view)
    return view.length
  }

  /** Events already handed out step by step this frame (eventDispatch 'step'); readDiagnostics prepends them. */
  private stepEventBuffer: RuntimePhysicsEvent[] = []
  /** Drains the events of the step that just ran, mapped to stable identities and ordered. */
  private drainStepEvents(): RuntimePhysicsEvent[] {
    if (!this.runtime) return []
    try {
      const events = this.mapRuntimeEvents(JSON.parse(this.runtime.drain_events_json()) as RuntimePhysicsEvent[])
      if (this.stepEventBuffer.length < 100_000) this.stepEventBuffer.push(...events)
      return events
    } catch (error) {
      console.warn('Nova_A received malformed runtime events', error)
      return []
    }
  }
  /** 把原生事件的刚体或关节句柄补充为项目稳定 UUID 并稳定排序。 */ private mapRuntimeEvents(rawEvents: RuntimePhysicsEvent[]): RuntimePhysicsEvent[] {
      const entityByHandle = new Map<number, Entity>()
      for (const entity of this.activeBodies) {
        const handle = this.bodyHandles.get(entity.id)
        if (handle !== undefined) entityByHandle.set(handle, this.tileCollisionOwners.get(entity.id) ?? entity)
      }
      const connectionByHandle = new Map<number, Connection>()
      for (const record of this.activeConnectionRecords) {
        const handle = this.connectionHandles.get(`${record.connection.uuid}:${record.segment}`)
        if (handle !== undefined) connectionByHandle.set(handle, record.connection)
      }
      return stablePhysicsEventOrder(rawEvents.map(/** 把原生事件的刚体或关节句柄补充为项目稳定 UUID，保留原事件字段。 */ event => ({
        ...event,
        firstEntityUuid: typeof event.first === 'number' ? entityByHandle.get(event.first)?.uuid : undefined,
        secondEntityUuid: typeof event.second === 'number' ? entityByHandle.get(event.second)?.uuid : undefined,
        entityUuid: typeof event.handle === 'number' && (event.type === 'bodySleeping' || event.type === 'bodyWoke') ? entityByHandle.get(event.handle)?.uuid : undefined,
        connectionUuid: typeof event.handle === 'number' && event.type === 'jointBroken' ? connectionByHandle.get(event.handle)?.uuid : undefined
      })))
  }

  /** 读取求解诊断和事件，将运行句柄关联回实体或连接，稳定排序并发布物理遥测；格式错误只记录警告。 */ private readDiagnostics(): void {
    if (!this.runtime) return
    try {
      this.diagnostics = JSON.parse(this.runtime.diagnostics_json()) as EngineDiagnostics
      const remaining = this.mapRuntimeEvents(JSON.parse(this.runtime.drain_events_json()) as RuntimePhysicsEvent[])
      this.events = this.stepEventBuffer.length ? [...this.stepEventBuffer, ...remaining] : remaining
      this.stepEventBuffer = []
      this.host.recordPhysicsTelemetry?.(this.entities, this.connections, this.events, this.diagnostics, this.lastSettings.tickRate, this.lastSettings.profile)
    } catch (error) {
      console.warn('Nova_A received malformed runtime diagnostics', error)
    }
  }

  /** Retain solver poses separately from the interpolated entity display without allocating every frame. */
  private storeNativeBodyPose(handle: number, x: number, y: number, rotation: number): void {
    const pose = this.nativeBodyPoses.get(handle)
    if (pose) { pose.x = x; pose.y = y; pose.rotation = rotation }
    else this.nativeBodyPoses.set(handle, { x, y, rotation })
  }

  /** 已有同长度缓存时原地复制，否则保存独立数组副本，避免缓存引用临时工作缓冲。 */ private storeRecord(records: Map<number, Float64Array>, handle: number, source: Float64Array): void {
    const cached = records.get(handle)
    if (cached?.length === source.length) cached.set(source)
    else records.set(handle, source.slice())
  }
}

/** 按长度及 Object.is 逐个比较浮点记录，精确识别含负零等值差异。 */ function recordsEqual(first: Float64Array, second: Float64Array): boolean {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index++) if (!Object.is(first[index], second[index])) return false
  return true
}

/* 根据 buffer.length === length 的真假，分别返回 buffer 或 new Float64Array(length)。 */ function ensureBuffer(buffer: Float64Array, length: number): Float64Array {
  return buffer.length === length ? buffer : new Float64Array(length)
}

/* 计算表达式 from + (to - from) * Math.min(1, Math.max(0, finiteNumber(alpha, 1))) 并返回结果，沿用操作数的原有类型规则。 */ function interpolate(from: number, to: number, alpha: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, finiteNumber(alpha, 1)))
}

/** 沿归一化最短角差进行插值，并把混合比例限制为零至一。 */ function interpolateAngle(from: number, to: number, alpha: number): number {
  const difference = ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
  return from + difference * Math.min(1, Math.max(0, finiteNumber(alpha, 1)))
}
