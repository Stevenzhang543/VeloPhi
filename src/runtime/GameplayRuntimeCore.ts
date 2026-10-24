/** 游戏脚本运行桥接：组织脚本实例和回调，将脚本命令应用到场景与各游戏子系统。 */
import { latencyProbe } from './latencyProbe'
import type { GameplayWorldHost } from './gameplayWorldHost'
import type { PreparedRuntimeSceneTransition } from './runtimeSceneContracts'
import { finiteNumber, normalizeEntity } from '../world/geometry'
import type { Entity } from '../world/Entity'
import type { Animator, AudioSource, Checkbox, NavigationAgent2D, ProgressBar, ScriptPropertyValue, Slider, Text as UIText, TextRenderer2D, TimelinePlayer } from '../world/components'
import { hierarchyOrder, worldTransform, setWorldTransform, subtreeEntities } from '../world/hierarchy'
import { SignalQueue, type SignalQueueStats } from './signalQueue'
import { InputConsumptionLedger, type InputConsumptionStats } from './inputConsumption'
import type { RuntimePhysicsEvent } from '../world/World'
import { INPUT_EDGE_CAPACITY, InputManager, inputPromptForAction, rebindInputAction, type InputBinding, type InputActionEdge, type InputSnapshot, type InputReceiptObservation, type InputSampleObservation, type InputObservationResetReason } from './input'
import { RuntimeTime, type TimerExpiration } from './time'
import { executeScriptTestSuite } from './scriptTestExecution'
import { WasmScriptRuntime } from '../../nova_core/pkg/nova_core.js'
import { AnimationTimelineOwner } from './animationTimelineOwner'
import { dispatchTimelineUiAction } from './timelineUiActions'
import { RuntimeAudioOwner } from './audioOwner'
import { applyJointServos } from './jointServo'
import { clearScriptPostValues, isScriptPostValue, pulseScriptPostValue, setScriptPostValue } from '../renderer/postProcessOverrides'
import { reservedActionKeys } from './rhythmClock'
import { RuntimeRhythmOwner, storedRhythmCalibration, storedRhythmVisualOffset, storeRhythmCalibration, type RhythmCommandAction } from './rhythmOwner'
import { MediaClock } from './mediaClock'

import { RuntimePresentationOwner } from './presentationOwner'
import { RuntimeParticleOwner } from './particleOwner'
import type { RuntimeSaveOwner, SaveValue } from './runtimeSaveOwner'

import { analyzeScript } from './scriptAnalysis'
import { analyzeScript26, statementAtLine } from './scriptAnalysisAnnotations'
import { ScriptDebugOwner, debugSourceRevision, evaluateDebugExpression, type DebugFrame, type DebugStepMode, type ScriptTestResult } from './scriptDebugOwner'
import { scriptProjectSettings } from './scriptSettings'
import { WorldGameplayOwner } from './worldGameplayOwner'
import { GraphDebugOwner, type GraphTraceCommand } from './graphDebugOwner'
import type { Camera2D, CharacterBody2D } from '../world/components'
import { TargetJoint2D, type Joint2D } from '../world/components'
import { ReplayOwner } from './replayOwner'
import { ProductionNetworkOwner } from './productionNetworkOwner'
import { recordScriptFunction, shouldRecordScriptFunction } from './profiler'
import { synchronizePerformanceWorld } from './largeWorldPerformance'
import type { GameplayScriptServices, ScriptResource as ScriptResourceView, ScriptBreakpoint, ScriptDebugCounterOwner, ScriptDebugCounterSession } from './scriptServices'
import { resolveEventHandlers } from './eventSheetReader'
import { ScriptHotReloadOwner,type HotReloadPlan } from './scriptHotReloadOwner'
import { recordScriptCoverage, resetScriptCoverage } from './scriptCoverage'


import { planGraphHotReload } from '../visual/graphRuntimeHotReload'
import type { PendingEntityResolution, RuntimeEntityHandle, RuntimeEntitySnapshot, TargetMutation } from './dynamicObjectsOwner'
import { GameFlowOwner } from './gameFlowOwner'
import type { GameplayComponentsOwner, GameplayWorldOptions } from './gameplayComponentsOwner'
import { activeGameCamera, gameScreenToWorld, visibleWorldBounds } from '../renderer/sceneRenderer'
import { parseScriptContract, validateScriptContract, type ScriptContractReport } from './scriptContracts'
import { eventCallbackFamily, type ObjectEventKind } from './eventSheetReader'
import { resolveProjectScriptBundle, scriptBundleLines, type ScriptBundleLines } from './scriptModules'
import { createGlobalScriptHosts, removeGlobalScriptHosts, type GlobalScriptHost } from './globalScripts'
import { RuntimeVideoOwner } from './videoOwner'
import { TweenOwner } from './tweens'
import { blockBreakpointLines } from '../visual/blockScript'
import { PhysicsRecorder, type PhysicsRecorderKeyframes, type PhysicsRecorderStatus } from './physicsRecorder'
import { captureComponentFields, cloneRuntimeState, restoreComponentFields, type ComponentFieldsSnapshot } from './rewindState'
import type { RuntimeTimeRewind } from './time'

/** 26.45: where run-time rebinding goes (see GameplayRuntime.setInputRemapSink). */
export interface GameplayInputRemapSink {
  remap(action: string, index: number, binding: Pick<InputBinding, 'device' | 'code'>): boolean
  reset(): void
}

/** 26.45: the game state of one rewind keyframe (see rewindKeyframeStore). */
interface GameplayRewindState {
  layout: string
  step: number
  components: ComponentFieldsSnapshot[]
  behaviors: Map<string, Record<string, ScriptPropertyValue>>
  initialized: Set<string>
  time: RuntimeTimeRewind
  media: MediaClock
  tweens: unknown
  animation: unknown
  timeline: unknown
  bytes: number
}

type LifecycleFunction = 'awake' | 'start' | 'fixed_update' | 'update' | 'late_update' | 'on_destroy' | 'on_timer' | 'on_task' | 'on_signal'

interface ScriptExecution {
  commands: ScriptCommand[]
  logs: Array<{ level: string; message: string }>
  properties: Record<string, ScriptPropertyValue>
}

const MAX_SCRIPT_BRIDGE_BYTES = 16 * 1024 * 1024
const MAX_SCRIPT_BRIDGE_COMMANDS = 4_096
const MAX_SCRIPT_BRIDGE_LOGS = 512

/** 结构说明（自动提取）：parseScriptExecution；输入 source、limits；直接调用 Error、JSON.parse、Array.isArray、Math.min、Math.max 等；包含显式抛错路径。 */ function parseScriptExecution(source: string, limits = { commands: MAX_SCRIPT_BRIDGE_COMMANDS, logs: MAX_SCRIPT_BRIDGE_LOGS }): ScriptExecution {
  if (source.length > MAX_SCRIPT_BRIDGE_BYTES) throw new Error('Script result exceeded the 16 MB host-bridge limit.')
  const value = JSON.parse(source) as Partial<ScriptExecution> | null
  if (!value || !Array.isArray(value.commands) || !Array.isArray(value.logs) || !value.properties || typeof value.properties !== 'object' || Array.isArray(value.properties)) throw new Error('Script result did not match the host-bridge contract.')
  const commandLimit = Math.min(MAX_SCRIPT_BRIDGE_COMMANDS, Math.max(1, Math.round(limits.commands)))
  const logLimit = Math.min(MAX_SCRIPT_BRIDGE_LOGS, Math.max(1, Math.round(limits.logs)))
  if (value.commands.length > commandLimit) throw new Error(`Script emitted more than its ${commandLimit}-command behavior budget in one invocation.`)
  if (value.logs.length > logLimit) throw new Error(`Script emitted more than its ${logLimit}-log behavior budget in one invocation.`)
  if (value.commands.some(/* 先计算 !command || typeof command !== 'object'；仅当其为假值时求右侧 typeof (command as { type?: unknown }).type !== 'string'，返回短路求值结果。 */ command => !command || typeof command !== 'object' || typeof (command as { type?: unknown }).type !== 'string')) throw new Error('Script emitted a malformed host command.')
  if (value.logs.some(/** 结构说明（自动提取）：value.logs.some 回调；输入 log；返回表达式求值结果。 */ log => !log || typeof log !== 'object' || typeof (log as { level?: unknown }).level !== 'string' || typeof (log as { message?: unknown }).message !== 'string')) throw new Error('Script emitted a malformed log entry.')
  return value as ScriptExecution
}

export interface ExportedProperty {
  name: string
  value: ScriptPropertyValue
  valueType: string
  defaultValue: ScriptPropertyValue
  minimum: number | null
  maximum: number | null
  step: number | null
  enumValues: string[]
  resourceType: string | null
  group: string
  tooltip: string
  serialized: boolean
}

type ScriptCommand =
  | GraphTraceCommand
  | { type: 'applyForce'; x: number; y: number }
  | { type: 'applyImpulse'; x: number; y: number }
  | { type: 'setVelocity'; x: number; y: number }
  | { type: 'setPosition'; x: number; y: number }
  | { type: 'setRotation'; radians: number }
  | { type: 'setScale'; x: number; y: number }
  | { type: 'setAngularVelocity'; radiansPerSecond: number }
  | { type: 'moveCharacter'; x: number; y: number }
  | { type: 'animatorSetBool'; name: string; value: boolean }
  | { type: 'animatorSetFloat'; name: string; value: number }
  | { type: 'animatorSetInteger'; name: string; value: number }
  | { type: 'animatorTrigger'; name: string }
  | { type: 'animatorPlay'; state: string }
  | { type: 'animatorCrossfade'; state: string; seconds: number }
  | { type: 'characterDropThrough'; seconds: number }
  | { type: 'targetJointMove'; x: number; y: number }
  | { type: 'targetJointRelease' }
  | { type: 'setSurfaceSpeed'; speed: number }
  | { type: 'inputRebind'; action: string; index: number }
  | { type: 'inputBindingsReset' }
  | { type: 'cameraShake'; amount: number }
  | { type: 'cameraZoom'; zoom: number }
  | { type: 'cameraFollow'; target: string; generation: number }
  | { type: 'screenFlash'; r: number; g: number; b: number; seconds: number }
  | { type: 'tween'; target: string; generation: number; property: string; to: number; seconds: number; easing: string; delay: number; loops: number; yoyo: boolean; relative: boolean; signal: string }
  | { type: 'tweenStop'; target: string; generation: number; property: string }
  | { type: 'audioPlay' }
  | { type: 'audioPause' }
  | { type: 'audioStop' }
  | { type: 'destroy' }
  | { type: 'despawn' }
  | { type: 'instantiate'; prefab: string }
  | { type: 'spawnAt'; pendingId: string; prefab: string; x: number; y: number; rotation: number; scaleX: number; scaleY: number }
  | { type: 'targetSetPosition'; target: string; generation: number; x: number; y: number }
  | { type: 'targetSetRotation'; target: string; generation: number; radians: number }
  | { type: 'targetSetScale'; target: string; generation: number; x: number; y: number }
  | { type: 'targetSetEnabled'; target: string; generation: number; enabled: boolean }
  | { type: 'targetSetComponentEnabled'; target: string; generation: number; component: string; enabled: boolean }
  | { type: 'targetSetUiText'; target: string; generation: number; text: string }
  | { type: 'targetSetUiValue'; target: string; generation: number; value: number }
  | { type: 'targetAddTag' | 'targetRemoveTag'; target: string; generation: number; tag: string }
  | { type: 'targetAddGroup' | 'targetRemoveGroup'; target: string; generation: number; group: string }
  | { type: 'targetDestroy'; target: string; generation: number }
  | { type: 'loadScene'; scene: string }
  | { type: 'reloadScene' }
  | { type: 'quit' }
  | { type: 'gamePause'; paused: boolean }
  | { type: 'checkpointSet' | 'checkpointRestore'; name: string }
  | { type: 'scoreSet' | 'scoreAdd'; value: number }
  | { type: 'sessionSet'; key: string; value: unknown }
  | { type: 'inputContextPush'; name: string; priority: number; consume: boolean }
  | { type: 'inputContextPop' | 'inputMapEnable' | 'inputMapDisable' | 'inputSchemeSet'; name: string }
  | { type: 'startTimer'; name: string; seconds: number; repeat: boolean }
  | { type: 'pauseTimer'; name: string }
  | { type: 'resumeTimer'; name: string }
  | { type: 'cancelTimer'; name: string }
  | { type: 'startTask'; name: string; seconds: number }
  | { type: 'cancelTask'; name: string }
  | { type: 'emitSignal'; name: string; target: string; payload: unknown }
  | { type: 'saveSet'; key: string; value: SaveValue }
  | { type: 'saveDelete'; key: string }
  | { type: 'saveClear' }
  | { type: 'saveLoad'; slot: string }
  | { type: 'saveCommit'; slot: string }
  | { type: 'uiSetText'; text: string }
  | { type: 'uiSetValue'; value: number }
  | { type: 'navigationSetTarget'; x: number; y: number }
  | { type: 'networkRpc'; name: string; payload: unknown }
  | { type: 'callFunction'; target: string; generation: number; function: string; args: unknown }
  | { type: 'callGlobal'; name: string; function: string; args: unknown }
  | { type: 'callGroup'; group: string; function: string; args: unknown }
  | { type: 'callLater'; function: string; seconds: number; args: unknown }
  | { type: 'playSound'; asset: string; bus: string; volume: number; pitch: number; looped: boolean; tag: string }
  | { type: 'stopSounds'; tag: string; fade: number }
  | { type: 'playMusic'; asset: string; fade: number; volume: number }
  | { type: 'stopMusic'; fade: number }
  | { type: 'setBusVolume'; bus: string; volume: number }
  | { type: 'playVideo'; asset: string; skippable: boolean; volume: number; looped: boolean }
  | { type: 'stopVideo' }
  | { type: 'rhythm'; action: string; value: number }
  | { type: 'rhythmJudge'; note: number; judgement: string; offsetMs: number }
  | { type: 'postSet'; name: string; value: number; seconds: number }
  | { type: 'postPulse'; name: string; amount: number; seconds: number }
  | { type: 'postReset' }
  | { type: 'jointServo'; enabled: boolean; target: number }
  | { type: 'explode'; x: number; y: number; radius: number; impulse: number }

interface ScriptContact {
  otherEntity: string
  point: [number, number]
  normal: [number, number]
  relativeVelocity: [number, number]
}

interface ScriptEvent { name: string; source: string; payload: unknown }
type ScriptCallTarget = { kind: 'entity'; handle: RuntimeEntityHandle } | { kind: 'global'; name: string } | { kind: 'group'; group: string }
interface PendingScriptCall { source: string; target: ScriptCallTarget; function: string; args: unknown[] }
/** Calls run per command flush before the rest wait for the next flush (guards call loops). */
const MAX_SCRIPT_CALLS_PER_FLUSH = 512
const MAX_PENDING_SCRIPT_CALLS = 10_000
interface PendingDebugInvocation { entityUuid: string; scriptUuid: string; functionName: string; contact?: ScriptContact; event?: ScriptEvent; logicAsset?: string | null; callbackKind?: string; resume?: { afterEvent: number; depth: number } }
/** 26.44: a debug run's stop, as returned by the Rust script runtime (lines of the compiled bundle). */
interface ScriptDebugPauseRecord { event: number; line: number; column: number; depth: number; locals: Array<{ name: string; value: unknown; constant: boolean }>; stack: Array<{ function: string; line: number }> }
type ScriptDebugResume = { afterEvent: number; depth: number; mode: DebugStepMode }
interface PendingGraphExecution {
  entityUuid: string
  scriptUuid: string
  sourcePath: string
  functionName: string
  commands: ScriptCommand[]
  nextIndex: number
}

export interface RuntimeDiagnostics {
  scripts: number
  scriptErrors: number
  lifecycleCalls: number
  activeTimers: number
  sceneSwitches: number
  timings: { inputMs: number; physicsMs: number; scriptsMs: number; animationMs: number; audioMs: number; assetsMs: number }
}

const EMPTY_INPUT: InputSnapshot = {
  down: {}, pressed: {}, released: {}, performed: {}, cancelled: {}, phases: {}, durations: {}, tapCounts: {}, consumed: {}, axes: {}, vectors: {}, mousePosition: [0, 0], mouseWorldPosition: [0, 0], viewBounds: [0, 0, 0, 0], viewportSize: [0, 0], wheel: [0, 0], pointerDelta: [0, 0], touches: 0, devices: [], contexts: ['Gameplay'], maps: ['Default'], scheme: 'Any'
}

export const DEFAULT_SCRIPT_SOURCE = `@export(type="float", min=0, max=100, step=0.1, group="Movement", tooltip="Horizontal acceleration in newtons") let move_speed = 5.0;
@export(type="float", min=0, max=1000, step=0.1, group="Movement", tooltip="Instant vertical impulse in N·s") let jump_force = 10.0;

fn awake() {
    print(\`Awake: ${'${entity_name()}'}\`);
}

fn start() {
}

fn fixed_update(dt) {
    let horizontal = input_axis("Horizontal");
    if horizontal != 0.0 {
        apply_force(horizontal * move_speed, 0.0);
    }
    if input_pressed("Jump") {
        apply_impulse(0.0, jump_force);
    }
}

fn update(dt) {
}

fn late_update(dt) {
}

fn on_collision_enter(other, point_x, point_y, normal_x, normal_y, relative_x, relative_y) {
}
`

export interface GameplayInputReceiptObservation extends InputReceiptObservation { readonly worldEpoch: number }
export interface GameplayInputFrameObservation extends InputSampleObservation {
  readonly worldEpoch: number
  readonly frameSequence: number
  readonly phases: readonly ('frame' | 'fixed')[]
  readonly fixedConsumptionCount: number
}
export interface GameplayInputObservationCallbacks {
  receipt(receipt: GameplayInputReceiptObservation): void
  reset?(worldEpoch: number, inputEpoch: number, reason: InputObservationResetReason): void
  consumed?(frame: GameplayInputFrameObservation): void
  nowMs?(): number
}
interface GameplayInputObservationState {
  callbacks: GameplayInputObservationCallbacks
  inputDispose: (() => void) | null
  frameSequence: number
}

export class GameplayRuntime {
  private readonly scriptHotReloadOwner: ScriptHotReloadOwner
  get scriptHotReload(): ScriptHotReloadOwner {
    if(this.scriptHotReloadOwner.world!==this.worldHost.state.world)throw new Error('HOT_RELOAD_WORLD_OWNER_CHANGED: Stop and recreate the Core before replacing its World.')
    return this.scriptHotReloadOwner
  }

  private readonly scriptDebugOwner: ScriptDebugOwner
  get scriptDebugger(): ScriptDebugOwner {
    if(this.scriptDebugOwner.world!==this.worldHost.state.world)throw new Error('SCRIPT_DEBUG_WORLD_OWNER_CHANGED: Stop and recreate the Core before replacing its World.')
    return this.scriptDebugOwner
  }

  private readonly graphDebugOwner: GraphDebugOwner
  get graphDebug(): GraphDebugOwner {
    if(this.graphDebugOwner.world!==this.worldHost.state.world)throw new Error('GRAPH_DEBUG_WORLD_CHANGED: Stop and recreate the Core before replacing its World.')
    return this.graphDebugOwner
  }

  get tileMapOwner(){return this.worldGameplay.tileMapOwner}

  private readonly replayOwner: ReplayOwner
  get replay(): ReplayOwner {
    if (this.replayOwner.world !== this.worldHost.state.world) throw new Error('REPLAY_WORLD_CHANGED: Stop and recreate the Core before replacing its World.')
    return this.replayOwner
  }
  private readonly particleOwner:RuntimeParticleOwner
  get particles():RuntimeParticleOwner{if(this.particleOwner.world!==this.worldHost.state.world)throw new Error('PARTICLE_WORLD_CHANGED: Stop and recreate the Core before replacing its World.');return this.particleOwner}

  private readonly presentationOwner:RuntimePresentationOwner
  get presentation():RuntimePresentationOwner {if(this.presentationOwner.world!==this.worldHost.state.world)throw new Error('PRESENTATION_WORLD_CHANGED: Stop and recreate the Core before replacing its World.');return this.presentationOwner}

  private get gameplayComponents(): GameplayComponentsOwner { return this.worldGameplay.componentsOwner }

  private streamHooksCleanup: (() => void) | null = null

  private readonly audioOwner: RuntimeAudioOwner
  get audio(): RuntimeAudioOwner {
    if(this.audioOwner.world!==this.worldHost.state.world)throw new Error('AUDIO_WORLD_CHANGED: Stop and recreate the Core before replacing its World.')
    return this.audioOwner
  }

  private readonly animationTimelineOwner: AnimationTimelineOwner
  private saveOwner: RuntimeSaveOwner | null = null
  /** Bind lazily to preserve early Editor module construction; this instance owns the resulting service. */
  private get saves(): RuntimeSaveOwner {
    if (!this.saveOwner) {
      const owner = this.worldHost.createSaveOwner()
      if (!owner || ['useSaveProject', 'saveSnapshot', 'setSaveValue', 'deleteSaveValue', 'clearSaveValues', 'loadSaveSlot', 'commitSaveSlot'].some(key => typeof owner[key as keyof RuntimeSaveOwner] !== 'function')) throw new Error('GAMEPLAY_SAVE_OWNER_REQUIRED: Supply the save Owner and platform services for this game.')
      this.saveOwner = owner
    }
    return this.saveOwner
  }

  /** The exact presentation/execution Owner of this Runtime; never the legacy singleton. */
  get animationTimeline(): AnimationTimelineOwner {
    if(this.animationTimelineOwner.world!==this.worldHost.state.world)throw new Error('ANIMATION_TIMELINE_WORLD_CHANGED: Stop and recreate the Core before replacing its World.')
    return this.animationTimelineOwner
  }

  private readonly productionNetworkOwner:ProductionNetworkOwner
  /** The same network session and multiplayer replay used by this Core and its Player inspector. */
  get productionNetwork():ProductionNetworkOwner {
    if(this.productionNetworkOwner.world!==this.worldHost.state.world)throw new Error('PRODUCTION_NETWORK_WORLD_OWNER_CHANGED: Stop and recreate the Core before replacing its World.')
    return this.productionNetworkOwner
  }

  private readonly worldGameplayOwner: WorldGameplayOwner

  private get worldGameplay(): WorldGameplayOwner {
    if (this.worldGameplayOwner.world !== this.worldHost.state.world) throw new Error('GAMEPLAY_WORLD_OWNER_CHANGED: Stop and recreate the Core before replacing its World.')
    return this.worldGameplayOwner
  }

  private readonly gameFlowOwner: GameFlowOwner

  /** Gameplay state belongs to this World; replace the Core before replacing its World. */
  private get gameFlow(): GameFlowOwner {
    if (this.gameFlowOwner.world !== this.worldHost.state.world) throw new Error('GAME_FLOW_WORLD_OWNER_CHANGED: Stop and recreate the Core before replacing its World.')
    return this.gameFlowOwner
  }

  constructor(private readonly scriptServices: GameplayScriptServices, private readonly worldHost: GameplayWorldHost, private readonly scriptDebugCounterOwner: ScriptDebugCounterOwner | null = null, gameFlowOwner?: GameFlowOwner) {
    if (!scriptServices || ['resolveAsset', 'resolveModuleAsset', 'readSource', 'revision', 'listIdentities', 'compileVisual'].some(key => typeof scriptServices[key as keyof GameplayScriptServices] !== 'function')) throw new Error('SCRIPT_SERVICES_REQUIRED: Supply a complete script catalog for this Gameplay owner.')
    if (!worldHost || !worldHost.state || !worldHost.state.world || ['readEntityAuthoringData', 'deleteEntity', 'prepareRuntimeSceneTransition', 'log', 'requestQuit', 'createWorldGameplayOwner', 'createGraphDebugOwner', 'createScriptDebugOwner', 'createScriptHotReloadOwner', 'createAnimationTimelineOwner', 'createSaveOwner', 'createAudioOwner', 'createPresentationOwner', 'createParticleOwner', 'createReplayOwner', 'createProductionNetworkOwner', 'readEnabledPackageIds'].some(key => typeof worldHost[key as keyof GameplayWorldHost] !== 'function')) throw new Error('GAMEPLAY_WORLD_HOST_REQUIRED: Supply the live World Owner and its host services.')
    if (!worldHost.plugins || ['start', 'update', 'stop'].some(key => typeof worldHost.plugins[key as keyof typeof worldHost.plugins] !== 'function')) throw new Error('GAMEPLAY_PLUGIN_OWNER_REQUIRED: Supply the real plugin owner for this World host.')
    // Validate and bind without starting any lifecycle; retain the supplied live root/getter.
    this.worldHost = Object.freeze({
      get state() { return worldHost.state },
      get activeSceneUuid() { return worldHost.activeSceneUuid },
      readEntityAuthoringData: worldHost.readEntityAuthoringData.bind(worldHost),
      deleteEntity: worldHost.deleteEntity.bind(worldHost),
      prepareRuntimeSceneTransition: worldHost.prepareRuntimeSceneTransition.bind(worldHost),
      log: worldHost.log.bind(worldHost),
      requestQuit: worldHost.requestQuit.bind(worldHost),
      createWorldGameplayOwner: worldHost.createWorldGameplayOwner.bind(worldHost),
      createGraphDebugOwner: worldHost.createGraphDebugOwner.bind(worldHost),
      createScriptDebugOwner: worldHost.createScriptDebugOwner.bind(worldHost),
      createScriptHotReloadOwner: worldHost.createScriptHotReloadOwner.bind(worldHost),
      createAnimationTimelineOwner: worldHost.createAnimationTimelineOwner.bind(worldHost),
      createAudioOwner: worldHost.createAudioOwner.bind(worldHost),
      createPresentationOwner: worldHost.createPresentationOwner.bind(worldHost),
      createParticleOwner: worldHost.createParticleOwner.bind(worldHost),
      createReplayOwner: worldHost.createReplayOwner.bind(worldHost),
      createProductionNetworkOwner:worldHost.createProductionNetworkOwner.bind(worldHost),
      createSaveOwner: worldHost.createSaveOwner.bind(worldHost),
      readEnabledPackageIds: worldHost.readEnabledPackageIds.bind(worldHost),
      plugins: Object.freeze({
        start: worldHost.plugins.start.bind(worldHost.plugins),
        update: worldHost.plugins.update.bind(worldHost.plugins),
        stop: worldHost.plugins.stop.bind(worldHost.plugins)
      })
    })
    if (gameFlowOwner && gameFlowOwner.world !== this.worldHost.state.world) throw new Error('GAME_FLOW_WORLD_OWNER_MISMATCH: Supply the GameFlow Owner of this World.')
    const flowHost = this.worldHost
    this.gameFlowOwner = gameFlowOwner ?? new GameFlowOwner({
      world: flowHost.state.world,
      get settings() { return flowHost.state.globalSettings },
      get activeSceneUuid() { return flowHost.activeSceneUuid }
    })
    const graphDebugOwner = this.worldHost.createGraphDebugOwner(scriptServices)
    if (!(graphDebugOwner instanceof GraphDebugOwner) || graphDebugOwner.world !== this.worldHost.state.world || graphDebugOwner.catalogIdentity !== scriptServices) throw new Error('GRAPH_DEBUG_WORLD_CATALOG_OWNER_MISMATCH: Supply the graph Owner bound to this actual World and script services.')
    this.graphDebugOwner = graphDebugOwner
    const worldGameplayOwner = this.worldHost.createWorldGameplayOwner(graphDebugOwner)
    if (!(worldGameplayOwner instanceof WorldGameplayOwner) || worldGameplayOwner.world !== this.worldHost.state.world) throw new Error('GAMEPLAY_WORLD_OWNER_MISMATCH: Supply the WorldGameplay Owner of this World.')
    if (worldGameplayOwner.graphDebugOwner !== graphDebugOwner) throw new Error('WORLD_GAMEPLAY_GRAPH_DEBUG_OWNER_MISMATCH: Core and AI must share this same graph Owner.')
    this.worldGameplayOwner = worldGameplayOwner
    const particleOwner=this.worldHost.createParticleOwner()
    if(!(particleOwner instanceof RuntimeParticleOwner)||particleOwner.world!==this.worldHost.state.world)throw new Error('PARTICLE_OWNER_MISMATCH: Supply this World particle composition.')
    this.particleOwner=particleOwner
    const presentationOwner=this.worldHost.createPresentationOwner()
    if(!(presentationOwner instanceof RuntimePresentationOwner)||presentationOwner.world!==this.worldHost.state.world)throw new Error('PRESENTATION_WORLD_OWNER_MISMATCH')
    this.presentationOwner=presentationOwner
    const replayOwner = this.worldHost.createReplayOwner()
    if (!(replayOwner instanceof ReplayOwner) || replayOwner.world !== this.worldHost.state.world) throw new Error('REPLAY_WORLD_OWNER_MISMATCH: Supply this World replay Owner.')
    this.replayOwner = replayOwner
    const productionNetworkOwner=this.worldHost.createProductionNetworkOwner()
    if(!(productionNetworkOwner instanceof ProductionNetworkOwner)||productionNetworkOwner.world!==this.worldHost.state.world)throw new Error('PRODUCTION_NETWORK_WORLD_OWNER_MISMATCH: Supply this World network Owner.')
    this.productionNetworkOwner=productionNetworkOwner
    // Retain this host's callback identities while its resources/revision remain live.
    this.scriptServices = Object.freeze({
      resolveAsset: scriptServices.resolveAsset.bind(scriptServices),
      resolveModuleAsset: scriptServices.resolveModuleAsset.bind(scriptServices),
      readSource: scriptServices.readSource.bind(scriptServices),
      revision: scriptServices.revision.bind(scriptServices),
      listIdentities: scriptServices.listIdentities.bind(scriptServices),
      compileVisual: scriptServices.compileVisual.bind(scriptServices),
      writeSource: scriptServices.writeSource?.bind(scriptServices),
      recordBreakpointHit: scriptServices.recordBreakpointHit?.bind(scriptServices)
    })
    const audioOwner=this.worldHost.createAudioOwner(this.scriptServices)
    if(!(audioOwner instanceof RuntimeAudioOwner)||audioOwner.world!==this.worldHost.state.world||audioOwner.resources!==this.scriptServices)throw new Error('AUDIO_OWNER_MISMATCH: Supply this World and Core catalog composition.')
    this.audioOwner=audioOwner
    // 26.46: rhythm charts run on this Core's audio clock, timed input and catalog.
    this.rhythm=new RuntimeRhythmOwner({
      entities: () => this.worldHost.state.world.entities,
      resolveAsset: reference => { const record = reference ? this.scriptServices.resolveAsset(this.resolveMediaReference(reference)) : null; return record ? { uuid: record.uuid, assetType: record.assetType } : null },
      readText: reference => reference ? this.scriptServices.readSource(this.resolveMediaReference(reference)) : null,
      revision: () => this.scriptServices.revision(),
      audio: () => { try { return this.audio.rhythmPort() } catch { return null } },
      openTimedInput: () => this.input.openTimedInput(),
      takeTimedInput: () => this.input.takeTimedInput(),
      clientToWorld: (clientX, clientY) => this.clientToWorld(clientX, clientY),
      nowMs: () => performance.now(),
      emit: (signal, payload, target) => { if (this.active) this.emitSignal(signal, payload, target, 'rhythm') },
      log: (message, level) => this.worldHost.log(message, 'Runtime', level),
      calibrationMs: () => storedRhythmCalibration(),
      reservedKeys: () => reservedActionKeys(this.worldHost.state.inputMap),
      visualOffsetMs: () => storedRhythmVisualOffset(),
      // 26.47 prefab notes: spawned like runtime prefabs; removed with the play session (or a restart).
      spawnPrefab: (reference, position) => this.active ? this.worldGameplay.dynamicObjectsOwner.spawnRuntimePrefab(this.resolveMediaReference(reference), { position, rotation: 0, scale: { x: 1, y: 1 } }) : null,
      despawn: entity => { if (this.active) this.queueEntityRemoval(entity, false) },
      setPost: (name, value) => { if (isScriptPostValue(name)) setScriptPostValue(name, value, 0) }
    })
    this.video=new RuntimeVideoOwner(
      reference => { const record = this.scriptServices.resolveAsset(this.resolveMediaReference(reference)) as (ScriptResourceView & { source?: string }) | null; return record ? { source: record.source ?? '', assetType: record.assetType, path: record.path } : null },
      (asset, reason, source) => { if (this.active) this.emitSignal('video.finished', { asset, reason }, '', source || 'video') },
      (message, level) => this.worldHost.log(message, 'Script', level)
    )
    const animationTimelineOwner=this.worldHost.createAnimationTimelineOwner(this.scriptServices,audioOwner)
    if(!(animationTimelineOwner instanceof AnimationTimelineOwner)||animationTimelineOwner.world!==this.worldHost.state.world||animationTimelineOwner.ports.resources!==this.scriptServices)throw new Error('ANIMATION_TIMELINE_OWNER_MISMATCH: Supply this World and Core catalog composition.')
    this.animationTimelineOwner=animationTimelineOwner
    const scriptDebugOwner=this.worldHost.createScriptDebugOwner(scriptServices)
    if(!(scriptDebugOwner instanceof ScriptDebugOwner)||scriptDebugOwner.world!==this.worldHost.state.world||scriptDebugOwner.catalogIdentity!==scriptServices)throw new Error('SCRIPT_DEBUG_WORLD_CATALOG_OWNER_MISMATCH: Supply the actual fixed World/catalog debugger.')
    this.scriptDebugOwner=scriptDebugOwner
    const scriptHotReloadOwner=this.worldHost.createScriptHotReloadOwner(scriptServices)
    if(!(scriptHotReloadOwner instanceof ScriptHotReloadOwner)||scriptHotReloadOwner.world!==this.worldHost.state.world||scriptHotReloadOwner.catalogIdentity!==scriptServices)throw new Error('HOT_RELOAD_WORLD_CATALOG_OWNER_MISMATCH: Supply the actual fixed World/catalog transaction owner.')
    this.scriptHotReloadOwner=scriptHotReloadOwner
  }

  readonly input = new InputManager()
  // 26.45: a script asked to rebind an action; the next key or button pressed completes it.
  private pendingRebind: { action: string; index: number; entityUuid: string } | null = null
  private inputRemapSink: GameplayInputRemapSink | null = null
  private inputPrompts: Record<string, string> = {}
  // 26.45: the screen flash in progress (screen_flash), faded out on game time.
  private screenFlash: { r: number; g: number; b: number; seconds: number; remaining: number } | null = null
  private inputPromptsKey = ''
  readonly time = new RuntimeTime()
  private readonly mediaClock=new MediaClock()
  readonly diagnostics: RuntimeDiagnostics = { scripts: 0, scriptErrors: 0, lifecycleCalls: 0, activeTimers: 0, sceneSwitches: 0, timings: { inputMs: 0, physicsMs: 0, scriptsMs: 0, animationMs: 0, audioMs: 0, assetsMs: 0 } }
  private scriptRuntime: WasmScriptRuntime | null = null
  private active = false
  private awakened = new Set<string>()
  private started = new Set<string>()
  private destroying = new Set<string>()
  private inputSnapshot: InputSnapshot = EMPTY_INPUT
  private fixedPressed: Record<string, boolean> = {}
  private fixedReleased: Record<string, boolean> = {}
  private fixedEdges: InputActionEdge[] = []
  readonly inputQueueDiagnostics = { capacity: INPUT_EDGE_CAPACITY * 128, overflows: 0, dropped: 0 }
  private pendingDestroy = new Map<number, number>()
  private pendingPrefabs: Array<{ sourceUuid: string; sourceGeneration: number; allowRetiredSource: boolean; reference: string; position: { x: number; y: number } }> = []
  // 26.44: tweens started by scripts and blocks (run on the fixed step after the animators).
  private readonly tweens = new TweenOwner()
  // 26.44: ring buffer of body states per fixed step for scrubbing and continuing while paused.
  private readonly physicsRecorder = new PhysicsRecorder()
  // 26.45: the game state of the recording's keyframes, by ring slot (see rewindKeyframeStore).
  private readonly rewindKeyframes = new Map<number, GameplayRewindState>()
  private pendingDynamicCommands: Array<{ sourceUuid: string; sourceGeneration: number; allowRetiredSource: boolean; command: Exclude<ScriptCommand, GraphTraceCommand> }> = []
  private callbackWorld: Entity[] | null = null
  private authoredEntities = new Map<string, { origin: 'scene' | 'runtime-spawned'; data: Record<string, unknown> }>()
  private compiledExports = new Map<string, ExportedProperty[]>()
  private pendingHandleResolutions = new Map<string, PendingEntityResolution>()
  /** 26.43 cross-script calls (call_on/call_global/call_group/after), run at the next command flush. */
  private pendingCalls: PendingScriptCall[] = []
  private readonly laterCalls = new Map<string, { function: string; args: unknown[]; source: string }>()
  private callLaterSerial = 0
  private readonly reportedCallIssues = new Set<string>()
  private globalScriptHosts: GlobalScriptHost[] = []
  /** 26.43 play_video(): full-screen video over the game view; ends with the "video.finished" signal. */
  readonly video: RuntimeVideoOwner
  /** 26.46 rhythm charts (RhythmChart2D). */
  readonly rhythm: RuntimeRhythmOwner

  /** 26.47: the solver checksum is only computed when something reads it (a replay records or plays back, or
   * a network session compares states); every other fixed step skips the hashing. */
  private fixedStepChecksum(): string {
    return this.replay.state.mode !== 'idle' || this.productionNetwork.networkingActive ? this.worldHost.state.world.stateChecksum() : ''
  }
  private lastViewport: DOMRect | undefined
  private mediaPathIndex: { revision: number; byPath: Map<string, string> } | null = null
  private invocationSerial = 0
  private sessionGeneration = 0
  private playSessionIdentity = 0
  private inputSuspended = false
  private hostSuspended = false
  private inputObservation: GameplayInputObservationState | null = null
  private consumedFrameInput: GameplayInputFrameObservation | null = null
  readonly inputObservationDiagnostics = { callbackErrors: 0, lastFailure: null as string | null }
  private pendingDespawn = new Map<number, number>()
  private pendingScene: { type: 'load'; identifier: string } | { type: 'reload' } | null = null
  private quitRequested = false
  private compiledSources = new Map<string, string>()
  private compiledDocuments = new Map<string, string>()
  private compiledModuleDocuments = new Map<string, Map<string, string>>()
  private pendingRollbackHistory = new Map<string, string | null>()
  private behaviorProperties = new Map<string, Record<string, ScriptPropertyValue>>()
  private initializedScriptInstances = new Set<string>()
  private scriptWorldSource: readonly Entity[] | null = null
  private scriptWorldRevision = 0
  private scriptWorldEntities = new Map<string, Entity>()
  private scriptWorldChildren = new Map<string, Entity[]>()
  private scriptWorldSnapshots = new Map<string, RuntimeEntitySnapshot>()
  readonly scriptContextDiagnostics = { publications: 0, entityRecords: 0, deltas: 0, deltaRecords: 0, callbackBytes: 0, worldBytes: 0, prepareMs: 0, publishMs: 0, callbackMs: 0 }
  private declaredFunctions = new Map<string, { source: string; names: Set<string>; contract: ScriptContractReport }>()
  private contractValidations = new Map<string, { signature: string; error: string | null }>()
  private pendingReloads = new Map<string, string>()
  private signalQueue = new SignalQueue()
  /** 输入消费台账：登记序号、消费 tick 与首次受影响 packet（§26.4 要求的身份绑定）。 */
  private inputConsumption = new InputConsumptionLedger()
  /** 固定步序号。time.value.frame 是**渲染帧**计数器（一次帧内多次补算共用同一值），
   * 因此不能冒充"消费 tick"，这里单独维护真实固定步编号。 */
  private fixedStepSequence = 0
  private pendingDebugInvocation: PendingDebugInvocation | null = null
  private pendingGraphExecution: PendingGraphExecution | null = null
  private networkUnsubscribe: (() => void) | null = null
  private scriptDebugCounterSession: ScriptDebugCounterSession | null = null
  private scriptDebugCounterEpoch = -1
  readonly scriptDebugCounterDiagnostics = { hits: 0, unavailable: 0, failures: 0, lastReason: null as string | null }

  get scriptDebugCapabilities() {
    const reason = this.scriptDebugCounterDiagnostics.lastReason ?? (!this.scriptDebugCounterOwner && !this.scriptServices.recordBreakpointHit ? 'debug-counter-owner-missing' : null)
    const capability = reason ? 'unavailable' as const : 'available' as const
    return Object.freeze({ callbackBreakpoints: capability, hitConditions: capability, logpoints: capability, reason })
  }

  private releaseScriptDebugCounterSession(): void {
    const session = this.scriptDebugCounterSession
    this.scriptDebugCounterSession = null; this.scriptDebugCounterEpoch = -1
    try { session?.dispose() } catch (error) { this.scriptDebugCounterDiagnostics.failures++; this.scriptDebugCounterDiagnostics.lastReason = `debug-counter-dispose-failed: ${this.errorMessage(error)}`.slice(0, 240) }
  }

  private recordScriptDebugHit(scriptUuid: string, source: string, index: number, breakpoint: ScriptBreakpoint, rich: boolean): number | null {
    try {
      let hitCount: number
      if (this.scriptDebugCounterOwner) {
        if (!this.scriptDebugCounterSession || this.scriptDebugCounterEpoch !== this.playSessionIdentity) {
          this.releaseScriptDebugCounterSession()
          this.scriptDebugCounterSession = this.scriptDebugCounterOwner.openSession(this.playSessionIdentity)
          this.scriptDebugCounterEpoch = this.playSessionIdentity
        }
        const prepared = this.scriptDebugCounterSession.prepareHit(scriptUuid, source, index, breakpoint)
        if (prepared.status === 'unavailable') { this.scriptDebugCounterDiagnostics.unavailable++; this.scriptDebugCounterDiagnostics.lastReason = prepared.reason; return null }
        const consumed = this.scriptDebugCounterSession.consumeHit(prepared.token)
        if (consumed.status === 'unavailable') { this.scriptDebugCounterDiagnostics.unavailable++; this.scriptDebugCounterDiagnostics.lastReason = consumed.reason; return null }
        hitCount = consumed.hitCount
      } else if (this.scriptServices.recordBreakpointHit) {
        // Editor's rich point count remains its metadata write. Legacy line-only counts stay invocation-local.
        hitCount = rich ? this.scriptServices.recordBreakpointHit(scriptUuid, index, breakpoint) : Math.min(1_000_000_000, breakpoint.hitCount + 1)
      } else {
        this.scriptDebugCounterDiagnostics.unavailable++; this.scriptDebugCounterDiagnostics.lastReason = 'debug-counter-owner-missing'; return null
      }
      if (!Number.isSafeInteger(hitCount) || hitCount < 1 || hitCount > 1_000_000_000) throw new Error('debug-counter-invalid-hit-count')
      this.scriptDebugCounterDiagnostics.hits++; this.scriptDebugCounterDiagnostics.lastReason = null
      return hitCount
    } catch (error) {
      this.scriptDebugCounterDiagnostics.failures++; this.scriptDebugCounterDiagnostics.lastReason = `debug-counter-owner-failed: ${this.errorMessage(error)}`.slice(0, 240)
      return null
    }
  }

  /* 返回 this.active 的当前值。 */ get isActive(): boolean { return this.active }
  /** Stable through scene changes; increments only when a new Play session begins. */
  /* 返回 this.playSessionIdentity 的当前值。 */ get sessionIdentity(): number { return this.playSessionIdentity }

  /** Current completed Runtime frame only; a read never consumes input or advances time. */
  get lastFrameConsumedInput(): GameplayInputFrameObservation | null {
    const frame = this.consumedFrameInput, owner = this.inputObservation
    return frame && owner && this.active && !this.hostSuspended && this.worldHost.state.playMode === 'playing' && frame.worldEpoch === this.playSessionIdentity && frame.frameSequence === owner.frameSequence
      && frame.inputEpoch === this.input.observationEpoch && frame.sampleSequence === this.input.lastConsumedInputObservation?.sampleSequence
      ? frame : null
  }

  setInputObservationCallbacks(callbacks: GameplayInputObservationCallbacks): () => void {
    const owner: GameplayInputObservationState = { callbacks, inputDispose: null, frameSequence: 0 }
    this.inputObservation = owner; this.consumedFrameInput = null
    owner.inputDispose = this.input.setObservationCallbacks({
      nowMs: callbacks.nowMs,
      receipt: receipt => {
        if (this.inputObservation !== owner || !this.active || this.hostSuspended || this.worldHost.state.playMode !== 'playing' || this.replay.state.mode === 'playback') return
        // 登记身份而不测量延迟：延迟由 observability 的既有机制负责。
        this.inputConsumption.track(receipt.inputEpoch, receipt.sequence)
        try { callbacks.receipt(Object.freeze({ ...receipt, worldEpoch: this.playSessionIdentity })) }
        catch (error) { this.failInputObservation(owner, 'receipt', error) }
      },
      reset: (inputEpoch, reason) => {
        if (this.inputObservation !== owner) return
        this.consumedFrameInput = null
        try { callbacks.reset?.(this.playSessionIdentity, inputEpoch, reason) }
        catch (error) { this.failInputObservation(owner, 'reset', error) }
      }
    })
    // The initial reset callback may fail or replace its own registration.
    if (this.inputObservation !== owner) owner.inputDispose()
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      if (this.inputObservation !== owner) return
      owner.inputDispose?.()
      if (this.inputObservation === owner) { this.inputObservation = null; this.consumedFrameInput = null }
    }
  }

  private failInputObservation(owner: GameplayInputObservationState, phase: string, error: unknown): void {
    this.inputObservationDiagnostics.callbackErrors++
    this.inputObservationDiagnostics.lastFailure = `${phase}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 240)
    if (this.inputObservation !== owner) return
    this.inputObservation = null; this.consumedFrameInput = null
    owner.inputDispose?.()
  }

  private beginInputObservationFrame(): GameplayInputObservationState | null {
    this.consumedFrameInput = null
    const owner = this.inputObservation
    if (owner) owner.frameSequence++
    return owner
  }

  private completeInputObservationFrame(owner: GameplayInputObservationState | null, sample: InputSampleObservation | null, fixedConsumptionCount: number, replaying: boolean): void {
    if (!owner || this.inputObservation !== owner || !sample || replaying || !this.active || this.hostSuspended
      || sample.inputEpoch !== this.input.observationEpoch || sample !== this.input.lastConsumedInputObservation) return
    const phases = Object.freeze<('frame' | 'fixed')[]>(fixedConsumptionCount ? ['frame', 'fixed'] : ['frame'])
    const frame: GameplayInputFrameObservation = Object.freeze({ ...sample, worldEpoch: this.playSessionIdentity, frameSequence: owner.frameSequence, phases, fixedConsumptionCount })
    this.consumedFrameInput = frame
    try { owner.callbacks.consumed?.(frame) } catch (error) { this.failInputObservation(owner, 'consumed', error) }
  }

  /** Host visibility is injected; Runtime never reads document.hidden. */
  setHostSuspended(suspended: boolean): void {
    if (this.hostSuspended === suspended) return
    this.hostSuspended = suspended
    this.suspendInputForHost(suspended ? 'hidden' : 'resume')
    if (suspended && this.active) this.audio.update(this.worldHost.state.world.entities, this.worldHost.state.audioSettings, false, { seconds: this.mediaClock.seconds, playing: false, scale: this.time.value.scale })
  }

  suspendInputForHost(reason: 'hidden' | 'blur' | 'pause' | 'resume' = 'hidden'): void {
    this.consumedFrameInput = null
    this.input.releaseAllInputs(reason); this.fixedPressed = {}; this.fixedReleased = {}; this.fixedEdges = []
    this.inputSuspended = true
  }

  /** 结构说明（自动提取）：beginSession；无显式参数；直接调用 authoredEntities.clear、compiledExports.clear、captureAuthoredEntity、input.start、time.reset 等；写入 active、scriptDebugState.exceptionPolicy、fixedPressed、fixedReleased 等；包含循环处理。 */ beginSession(): void {
    if (this.active) return
    void this.gameFlow
    void this.worldGameplay
    void this.animationTimeline
    void this.presentation
    void this.audio
    void this.replay
    void this.productionNetwork
    void this.graphDebug
    if (this.playSessionIdentity >= 0xffff_ffff) throw new Error('Script world epoch exhausted; restart the Runtime before creating a new world.')
    this.playSessionIdentity++
    this.releaseScriptDebugCounterSession()
    this.input.resetObservation('session')
    this.inputSuspended = false
    this.scriptWorldRevision = 0
    this.invalidateScriptWorld()
    for (const key of Object.keys(this.scriptContextDiagnostics) as (keyof typeof this.scriptContextDiagnostics)[]) this.scriptContextDiagnostics[key] = 0
    this.authoredEntities.clear(); this.compiledExports.clear()
    for (const entity of this.worldHost.state.world.entities) this.captureAuthoredEntity(entity, 'scene')
    this.physicsRecorder.reset()
    this.pendingRebind = null; this.input.cancelBindingCapture(); this.inputPromptsKey = ''
    this.active = true
    const sessionGeneration = ++this.sessionGeneration
    this.animationTimeline.markMembershipDirty()
    this.input.start()
    this.time.reset()
    this.mediaClock.seek(0)
    this.worldGameplay.tileMapOwner.setTileAnimationTime(0); this.presentation.setRuntimeCaptionTime(null); this.presentation.setRuntimeCaptionTime(0)
    this.audio.stopAll();this.audio.begin(this.worldHost.state.audioSettings)
    this.audio.setTransportTime({seconds:0,playing:true,scale:this.worldHost.state.globalSettings.timeScale})
    this.rhythm.begin()
    this.globalScriptHosts = createGlobalScriptHosts(this.worldHost.state.world, scriptProjectSettings.globalScripts, reference => this.scriptServices.resolveAsset(this.resolveMediaReference(reference))?.uuid ?? null, (message, level) => this.worldHost.log(message, 'Script', level))
    for (const entity of this.worldHost.state.world.entities) this.worldGameplay.entityLifetimes.begin(entity)
    this.worldGameplay.objectPoolOwner.setPoolRuntimeHooks({ clock: /* 返回 this.time.value.elapsed 的当前值。 */ () => this.time.value.elapsed, beforeRelease: /** 结构说明（自动提取）：匿名回调；输入 entities；直接调用 destroying.add、runDestructionCallbacks、clearEntityRuntimeState、destroying.delete；包含循环处理。 */ entities => {
      this.animationTimeline.markMembershipDirty()
      for (const entity of entities) this.destroying.add(entity.uuid)
      for (const entity of entities) { this.runDestructionCallbacks(entity); this.clearEntityRuntimeState(entity) }
      for (const entity of entities) this.destroying.delete(entity.uuid)
    } })
    this.streamHooksCleanup?.(); this.streamHooksCleanup = this.worldGameplay.streamLifecycle.setStreamRuntimeHooks({ beforeDeactivate: /** 结构说明（自动提取）：匿名回调；输入 entities、world；直接调用 destroying.add、runDestructionCallbacks、clearEntityRuntimeState、destroying.delete；包含循环处理。 */ (entities, world) => {
      this.animationTimeline.markMembershipDirty()
      for (const entity of entities) this.destroying.add(entity.uuid)
      for (const entity of entities) { this.runDestructionCallbacks(entity, world); this.clearEntityRuntimeState(entity) }
      for (const entity of entities) this.destroying.delete(entity.uuid)
    }, afterActivate: /** 结构说明（自动提取）：匿名回调；输入 _entities、fresh；直接调用 initializeGameplayEntities、ensureLifecycle。 */ (_entities, fresh) => { this.animationTimeline.markMembershipDirty();this.gameplayComponents.initializeGameplayEntities(fresh); this.ensureLifecycle() } }, this.worldHost.state.world.entities)
    this.replay.resetDeterministicSeed()
    this.gameFlow.resetGameFlow()
    this.gameplayComponents.beginGameplayComponents(this.worldHost.state.world.entities)
    this.awakened.clear()
    this.started.clear()
    this.compiledSources.clear()
    this.compiledDocuments.clear(); this.compiledModuleDocuments.clear(); this.pendingRollbackHistory.clear()
    this.declaredFunctions.clear()
    this.behaviorProperties.clear()
    this.initializedScriptInstances.clear()
    this.invalidateScriptWorld(); this.scriptWorldEntities.clear(); this.scriptWorldChildren.clear(); this.scriptWorldSnapshots.clear()
    this.scriptDebugger.beginDebugSession()
    this.scriptDebugger.bindDebugHost({ continue: /** 远程继续转交真实宿主。 */ () => this.debugContinue(), step: /** 远程步进转交真实命令/回调边界。 */ mode => this.debugStep(mode), cancelTask: /** 返回真实计时任务的取消结果。 */ id => this.cancelDebugTask(id) })
    this.graphDebug.beginGraphDebugSession()
    this.scriptDebugger.state.exceptionPolicy = scriptProjectSettings.exceptionPolicy
    this.fixedPressed = {}
    this.fixedReleased = {}
    this.fixedEdges = []
    this.ensureScriptRuntime()
    ;(this.scriptRuntime as unknown as { clear_instances(epoch: number): void } | null)?.clear_instances(this.playSessionIdentity)
    this.compileAttachedScripts()
    this.animationTimeline.animation.onEvent = /** 结构说明（自动提取）：匿名回调；输入 entity、event；直接调用 JSON.parse、emitSignal；写入 payload。 */ (entity, event) => {
      let payload: unknown = event.payload
      try { payload = event.payload ? JSON.parse(event.payload) : null } catch { /* Plain text payload. */ }
      this.emitSignal(event.signal, payload, entity.uuid, `animation:${entity.uuid}`)
    }
    // 26.44: Animator state changes as signals (scripts: on_signal("animator.state_entered", ...)).
    this.animationTimeline.animation.onStateChange = (entity, layer, previous, next) => {
      if (previous) this.emitSignal('animator.state_exited', { state: previous.name, id: previous.id, layer, next: next.name }, entity.uuid, `animation:${entity.uuid}`)
      this.emitSignal('animator.state_entered', { state: next.name, id: next.id, layer, previous: previous?.name ?? '' }, entity.uuid, `animation:${entity.uuid}`)
    }
    this.animationTimeline.animation.onCommand = /** 结构说明（自动提取）：匿名回调；输入 entity、track、command；直接调用 this.worldHost.state.world.entities.find、JSON.parse、runEntityFunction、command.value.slice、target.getComponent 等；写入 payload、audio.audioClip、animator.currentState、player.timelineAsset 等。 */ (entity, track, command) => {
      const target = track.targetEntityUuid ? this.worldHost.state.world.entities.find(/* 比较 candidate.uuid 与 track.targetEntityUuid，返回严格相等的判断结果。 */ candidate => candidate.uuid === track.targetEntityUuid) ?? entity : entity
      let payload: unknown = command.payload
      try { payload = command.payload ? JSON.parse(command.payload) : null } catch { /* Plain text payload. */ }
      if (track.kind === 'Method') { this.invalidateScriptWorld(); this.runEntityFunction(target, command.value.slice(0, 80)) }
      else if (track.kind === 'Audio') { const audio = target.getComponent<AudioSource>('AudioSource'); if (audio && command.value) audio.audioClip = command.value; this.audio.play(target, this.worldHost.state.world.entities) }
      else if (track.kind === 'NestedAnimation') { if (!this.animationTimeline.animation.playClipOnce(target.uuid, command.value)) { const animator = target.getComponent<Animator>('Animator'); if (animator) animator.currentState = command.value.slice(0, 80) } }
      else if (track.kind === 'Timeline') { const player = target.getComponent<TimelinePlayer>('TimelinePlayer'); if (player) { if (command.value) player.timelineAsset = command.value; player.currentTime = 0; player.playing = true } }
      else this.emitSignal(track.kind === 'VisualGraph' ? `visual.${command.value}` : command.value || 'animation.command', payload, target.uuid, `animation:${entity.uuid}`)
    }
    this.animationTimeline.timeline.onEvent = /** 结构说明（自动提取）：匿名回调；输入 entity、clip、type；直接调用 entity.getComponent、clip.value.slice、JSON.parse、clip.value.trim、slice 等；写入 animator.currentState、payload。 */ (entity, clip, type) => {
      if (type === 'Animation') {
        const animator = entity.getComponent<Animator>('Animator')
        if (animator && typeof clip.value === 'string') animator.currentState = clip.value.slice(0, 80)
        return
      }
      let payload: unknown = clip.payload
      try { payload = clip.payload ? JSON.parse(clip.payload) : null } catch { /* Plain text payload. */ }
      const name = typeof clip.value === 'string' && clip.value.trim() ? clip.value.trim().slice(0, 80) : 'timeline.event'
      this.emitSignal(type === 'ScriptCall' ? `timeline.${name}` : name, payload, entity.uuid, `timeline:${entity.uuid}`)
      if (type === 'ScriptCall') { this.invalidateScriptWorld(); this.runEntityFunction(entity, name) }
    }
    this.emitSignal('scene.started', { scene: this.worldHost.activeSceneUuid }, '', 'runtime')
    this.saves.useSaveProject()
    void this.worldHost.plugins.start()
    void this.worldGameplay.beginWorldGameplay(/* 调用 this.emitSignal(name, payload, target, source) 并返回调用结果。 */ (name, payload, target, source) => this.emitSignal(name, payload, target, source), /* 先计算 this.active；仅当其为真值时求右侧 this.sessionGeneration === sessionGeneration，返回短路求值结果。 */ () => this.active && this.sessionGeneration === sessionGeneration)
    this.productionNetwork.beginProductionRuntime()
    this.networkUnsubscribe?.()
    const rpcCleanup = this.productionNetwork.onProductionRpc(/* 调用 this.emitSignal(`network.${name}`, { payload, sender: context.sender, tick: context.tick }, '', context.sender) 并返回调用结果。 */ (name, payload, context) => this.emitSignal(`network.${name}`, { payload, sender: context.sender, tick: context.tick }, '', context.sender))
    const sceneCleanup = this.productionNetwork.onProductionSceneHandoff(/** 结构说明（自动提取）：onProductionSceneHandoff 回调；输入 sceneUuid、spawnTag、peerId；直接调用 emitSignal；写入 pendingScene。 */ (sceneUuid, spawnTag, peerId) => { this.pendingScene = { type: 'load', identifier: sceneUuid }; this.emitSignal('network.scene_handoff', { scene: sceneUuid, spawnTag, peer: peerId }, '', peerId) })
    const remoteInputCleanup = this.productionNetwork.onProductionRemoteInput(/** 结构说明（自动提取）：onProductionRemoteInput 回调；输入 frame；直接调用 emitSignal；包含循环处理。 */ frame => {
      for (const entityUuid of frame.targetEntityUuids) this.emitSignal('network.input', { input: frame.input, sender: frame.peerId, tick: frame.tick, entity: entityUuid }, entityUuid, frame.peerId)
    })
    this.networkUnsubscribe = /** 结构说明（自动提取）：匿名回调；无显式参数；直接调用 rpcCleanup、sceneCleanup、remoteInputCleanup。 */ () => { rpcCleanup(); sceneCleanup(); remoteInputCleanup() }
    this.ensureLifecycle()
    this.flushStructuralCommands()
    this.worldHost.log('Gameplay runtime started', 'Runtime')
  }

  /** 结构说明（自动提取）：frame；输入 frameDelta、viewport；直接调用 synchronizePerformanceWorld、flushHotReloads、performance.now、Object.assign、this.worldHost.state.world.update 等；写入 inputSnapshot、scriptsMs、quitRequested、editorState.statusText。 */ frame(frameDelta: number, viewport?: DOMRect): void {
    // A playing frame reads and writes the plain world; the host refreshes its observers at its own rate.
    const world = this.worldHost.state.world
    if (this.worldHost.state.playMode === 'playing' && typeof world.withPlainAccess === 'function') { world.withPlainAccess(() => this.runFrame(frameDelta, viewport)); return }
    this.runFrame(frameDelta, viewport)
  }

  private runFrame(frameDelta: number, viewport?: DOMRect): void {
    if (viewport) this.lastViewport = viewport
    // 26.44: a scrubbed physics view is only shown while paused; running restores the live poses.
    if (this.physicsRecorder.scrubbing && this.worldHost.state.playMode === 'playing') this.physicsRecorder.endScrub(this.worldHost.state.world.entities)
    void this.gameFlow
    void this.worldGameplay
    void this.animationTimeline
    void this.presentation
    void this.audio
    void this.replay
    void this.productionNetwork
    void this.graphDebug
    const observedOwner = this.beginInputObservationFrame()
    if (this.hostSuspended) return
    synchronizePerformanceWorld(this.worldHost.state.world.entities)
    if (this.active) this.flushHotReloads()
    if (this.video.playing) { this.video.setViewport(viewport); this.video.setPaused(this.worldHost.state.playMode !== 'playing') }
    if (this.worldHost.state.playMode !== 'playing') {
      if (this.active && !this.inputSuspended) {
        this.suspendInputForHost('pause')
      }
      const physicsStarted = performance.now()
      Object.assign(this.worldHost.state.engineDiagnostics, this.worldHost.state.world.update(frameDelta, false, this.worldHost.state.globalSettings))
      const physicsMs = performance.now() - physicsStarted
      const audioStarted = performance.now()
      this.audio.update(this.worldHost.state.world.entities, this.worldHost.state.audioSettings, false,{seconds:this.mediaClock.seconds,playing:false,scale:this.time.value.scale})
      const audioMs = performance.now() - audioStarted
      this.particles.update(frameDelta, false)
      this.worldHost.plugins.update(frameDelta)
      this.rhythm.update(false)
      Object.assign(this.diagnostics.timings, { inputMs: 0, physicsMs, scriptsMs: 0, animationMs: 0, audioMs, assetsMs: 0 })
      return
    }
    if (!this.active) this.beginSession()
    if (this.inputSuspended) { this.input.releaseAllInputs('resume'); this.inputSuspended = false }
    this.flushHotReloads()
    this.dispatchSignals()
    this.ensureLifecycle()
    const inputStarted = performance.now()
    this.lastInputSampleAt = inputStarted
    const frameInput = this.decorateViewportInput(this.input.sample(this.worldHost.state.inputMap, viewport), viewport)
    if (this.pendingRebind) this.finishInputRebind()
    this.refreshInputPrompts()
    const observedSample = observedOwner ? this.input.lastConsumedInputObservation : null
    let observedFixedCount = 0
    const observedReplay = observedOwner ? this.replay.state.mode === 'playback' : false
    const inputMs = performance.now() - inputStarted
    this.inputSnapshot = frameInput
    this.dispatchInputCallbacks(frameInput)
    this.latchFixedInput(frameInput)
    const fixedTimers = this.worldHost.state.globalSettings.timerClock === 'fixed'
    const expired = this.time.beginFrame(frameDelta, this.worldHost.state.globalSettings.tickRate, this.worldHost.state.globalSettings.timeScale, !fixedTimers)
    let scriptsMs = 0
    const timerScriptsStarted = performance.now()
    this.dispatchTimerExpirations(expired)
    scriptsMs += performance.now() - timerScriptsStarted

    let firstFixedStep = true
    let fixedScriptsMs = 0, stepEventsDispatched = 0
    const physicsStarted = performance.now()
    Object.assign(this.worldHost.state.engineDiagnostics, this.worldHost.state.world.update(
      frameDelta,
      true,
      this.worldHost.state.globalSettings,
      /** 结构说明（自动提取）：this.worldHost.state.world.update 回调；输入 fixedDelta；直接调用 performance.now、replayFixedInput、runPhase、flushEntityCommands、updateGameplayComponents 等；写入 inputSnapshot、fixedPressed、fixedReleased、firstFixedStep 等。 */ fixedDelta => {
        const fixedScriptsStarted = performance.now()
        this.fixedStepSequence += 1
        const fixedInput = firstFixedStep
          ? { ...frameInput, pressed: { ...this.fixedPressed }, released: { ...this.fixedReleased }, edges: this.fixedEdges }
          : { ...frameInput, pressed: {}, released: {}, performed: {}, cancelled: {}, edges: [] }
        this.inputSnapshot = this.replay.replayFixedInput(fixedInput)
        if (firstFixedStep) {
          if (latencyProbe.enabled) latencyProbe.fixedStepConsumed(this.fixedStepSequence, this.lastInputSampleAt)
          if (observedSample && this.inputSnapshot === fixedInput) {
            observedFixedCount = 1
            // 消费该帧输入的正是这个固定步；用真实固定步编号记录消费 tick。
            for (const receipt of observedSample.receipts) this.inputConsumption.markConsumed(receipt.inputEpoch, receipt.sequence, this.fixedStepSequence)
          }
          this.fixedPressed = {}
          this.fixedReleased = {}
          this.fixedEdges = []
        }
        firstFixedStep = false
        this.time.value.fixedDelta = fixedDelta
        // Fixed timer clock: timers that expire in this step fire before its fixed_update.
        if (fixedTimers) this.dispatchTimerExpirations(this.time.advanceFixed(fixedDelta))
        this.runPhase('fixed_update')
        this.flushEntityCommands()
        this.gameplayComponents.updateGameplayComponents(this.worldHost.state.world.entities, this.inputSnapshot, fixedDelta, /* 调用 this.emitSignal(name, payload, target, source) 并返回调用结果。 */ (name, payload, target, source) => this.emitSignal(name, payload, target, source), /** 结构说明（自动提取）：updateGameplayComponents 回调；输入 prefab、owner；直接调用 worldTransform、spawnRuntimePrefab。 */ (prefab, owner) => {
          const transform = worldTransform(owner, this.worldHost.state.world.entities)
          return this.worldGameplay.dynamicObjectsOwner.spawnRuntimePrefab(prefab, { position: transform.position, rotation: transform.rotation, scale: { x: 1, y: 1 } })
        }, /* 调用 this.queueEntityRemoval(target, despawn) 并返回调用结果。 */ (target, despawn) => this.queueEntityRemoval(target, despawn), this.gameplayWorldOptions())
        applyJointServos(this.worldHost.state.world.entities)
        this.worldGameplay.beforeWorldPhysicsStep(fixedDelta, this.time.value.elapsed, this.time.value.frame, /* 调用 this.emitSignal(name, payload, target, source) 并返回调用结果。 */ (name, payload, target, source) => this.emitSignal(name, payload, target, source), /** 将 { type: 'load', identifier: scene } 赋给 this.pendingScene，不显式返回值。 */ scene => { this.pendingScene = { type: 'load', identifier: scene } })
        this.mediaClock.advance(fixedDelta)
        this.worldGameplay.tileMapOwner.setTileAnimationTime(this.mediaClock.seconds); this.presentation.setRuntimeCaptionTime(this.mediaClock.seconds)
        this.audio.setTransportTime({seconds:this.mediaClock.seconds,playing:true,scale:this.time.value.scale})
        this.animationTimeline.animation.update(this.worldHost.state.world.entities, fixedDelta)
        this.updateTweens(fixedDelta)
        this.animationTimeline.timeline.update(this.worldHost.state.world.entities, fixedDelta)
        fixedScriptsMs += performance.now() - fixedScriptsStarted
      },
      /** 结构说明（自动提取）：this.worldHost.state.world.update 回调；无显式参数；直接调用 this.worldHost.state.world.stateChecksum、completeReplayFixedStep、updateProductionRuntime。 */ (_fixedDelta, stepEvents) => {
        const checksum = this.fixedStepChecksum(); this.replay.completeReplayFixedStep(checksum); this.productionNetwork.updateProductionRuntime(this.worldHost.state.world.entities, this.time.value.fixedDelta, this.inputSnapshot, checksum)
        if (this.physicsRecorder.enabled) this.physicsRecorder.record(this.fixedStepSequence, this.fixedStepSequence * this.time.value.fixedDelta, this.worldHost.state.world.entities)
        // 26.43 (eventDispatch 'step'): collision and trigger callbacks run after the step that produced
        // them, before the next step's fixed_update, so a callback's commands apply to the next tick.
        if (stepEvents) {
          stepEventsDispatched += stepEvents.length
          if (stepEvents.length) { const started = performance.now(); this.dispatchPhysicsEvents(stepEvents); fixedScriptsMs += performance.now() - started }
        }
      }
    ))
    const physicsAndFixedScriptsMs = performance.now() - physicsStarted
    scriptsMs += fixedScriptsMs
    this.inputSnapshot = frameInput
    const scriptsStarted = performance.now()
    // Frame dispatch (default): all of the frame's events now. Step dispatch: the events not handed out
    // during the steps, i.e. the last step's (still before the next step's fixed_update).
    const frameEvents = this.worldHost.state.globalSettings.eventDispatch === 'step' ? this.worldHost.state.world.events.slice(stepEventsDispatched) : this.worldHost.state.world.events
    if (frameEvents.length || this.worldHost.state.globalSettings.eventDispatch !== 'step') this.dispatchPhysicsEvents(frameEvents)
    this.runPhase('update')
    this.flushEntityCommands()
    this.runPhase('late_update')
    this.updateScreenEffects(this.time.value.delta)
    scriptsMs += performance.now() - scriptsStarted
    const animationStarted = performance.now()
    this.particles.update(this.time.value.delta, true)
    this.worldHost.plugins.update(this.time.value.delta)
    const animationMs = performance.now() - animationStarted
    const audioStarted = performance.now()
    this.audio.update(this.worldHost.state.world.entities, this.worldHost.state.audioSettings, true,{seconds:this.mediaClock.seconds,playing:true,scale:this.time.value.scale})
    this.rhythm.update(true)
    const audioMs = performance.now() - audioStarted
    this.flushStructuralCommands()
    this.completeInputObservationFrame(observedOwner, observedSample, observedFixedCount, observedReplay)
    Object.assign(this.diagnostics.timings, {
      inputMs, physicsMs: Math.max(0, physicsAndFixedScriptsMs - fixedScriptsMs), scriptsMs, animationMs, audioMs, assetsMs: 0
    })
    if (this.quitRequested) {
      this.quitRequested = false
      this.stopSession()
      this.worldHost.requestQuit()
    }
  }

  /** 结构说明（自动提取）：stepOnce；输入 viewport；直接调用 beginSession、flushHotReloads、synchronizePerformanceWorld、dispatchSignals、ensureLifecycle 等；写入 inputSnapshot、fixedPressed、fixedReleased。 */ stepOnce(viewport?: DOMRect): void {
    void this.gameFlow
    void this.worldGameplay
    void this.animationTimeline
    void this.presentation
    void this.audio
    void this.replay
    void this.productionNetwork
    void this.graphDebug
    const observedOwner = this.beginInputObservationFrame()
    if (this.hostSuspended) return
    if (!this.active) this.beginSession()
    // 26.44: stepping from a scrubbed physics view steps from the live state.
    if (this.physicsRecorder.scrubbing) this.physicsRecorder.endScrub(this.worldHost.state.world.entities)
    this.flushHotReloads()
    synchronizePerformanceWorld(this.worldHost.state.world.entities)
    this.dispatchSignals()
    this.ensureLifecycle()
    const observedReplay = observedOwner ? this.replay.state.mode === 'playback' : false
    const sampledInput = this.decorateViewportInput(this.input.sample(this.worldHost.state.inputMap, viewport), viewport)
    this.inputSnapshot = this.replay.replayFixedInput(sampledInput)
    const observedSample = observedOwner && this.worldHost.state.playMode === 'playing' ? this.input.lastConsumedInputObservation : null
    const observedFixedCount = observedSample && this.inputSnapshot === sampledInput ? 1 : 0
    this.dispatchInputCallbacks(this.inputSnapshot)
    this.latchFixedInput(this.inputSnapshot)
    this.inputSnapshot = {
      ...this.inputSnapshot,
      pressed: { ...this.fixedPressed },
      released: { ...this.fixedReleased },
      edges: this.fixedEdges
    }
    this.fixedPressed = {}
    this.fixedReleased = {}
    this.fixedEdges = []
    const fixedTimers = this.worldHost.state.globalSettings.timerClock === 'fixed'
    this.dispatchTimerExpirations(this.time.beginFrame(this.time.value.fixedDelta, this.worldHost.state.globalSettings.tickRate, this.worldHost.state.globalSettings.timeScale, !fixedTimers))
    if (fixedTimers) this.dispatchTimerExpirations(this.time.advanceFixed(this.time.value.fixedDelta))
    this.runPhase('fixed_update')
    this.flushEntityCommands()
    this.gameplayComponents.updateGameplayComponents(this.worldHost.state.world.entities, this.inputSnapshot, this.time.value.fixedDelta, /* 调用 this.emitSignal(name, payload, target, source) 并返回调用结果。 */ (name, payload, target, source) => this.emitSignal(name, payload, target, source), /** 结构说明（自动提取）：updateGameplayComponents 回调；输入 prefab、owner；直接调用 worldTransform、spawnRuntimePrefab。 */ (prefab, owner) => {
      const transform = worldTransform(owner, this.worldHost.state.world.entities)
      return this.worldGameplay.dynamicObjectsOwner.spawnRuntimePrefab(prefab, { position: transform.position, rotation: transform.rotation, scale: { x: 1, y: 1 } })
    }, /* 调用 this.queueEntityRemoval(target, despawn) 并返回调用结果。 */ (target, despawn) => this.queueEntityRemoval(target, despawn), this.gameplayWorldOptions())
    applyJointServos(this.worldHost.state.world.entities)
    this.worldGameplay.beforeWorldPhysicsStep(this.time.value.fixedDelta, this.time.value.elapsed, this.time.value.frame, /* 调用 this.emitSignal(name, payload, target, source) 并返回调用结果。 */ (name, payload, target, source) => this.emitSignal(name, payload, target, source), /** 将 { type: 'load', identifier: scene } 赋给 this.pendingScene，不显式返回值。 */ scene => { this.pendingScene = { type: 'load', identifier: scene } })
    Object.assign(this.worldHost.state.engineDiagnostics, this.worldHost.state.world.singleStep(this.worldHost.state.globalSettings))
    this.fixedStepSequence += 1
    if (this.physicsRecorder.enabled) this.physicsRecorder.record(this.fixedStepSequence, this.fixedStepSequence * this.time.value.fixedDelta, this.worldHost.state.world.entities)
    const checksum = this.fixedStepChecksum()
    this.replay.completeReplayFixedStep(checksum)
    this.productionNetwork.updateProductionRuntime(this.worldHost.state.world.entities, this.time.value.fixedDelta, this.inputSnapshot, checksum)
    this.dispatchPhysicsEvents(this.worldHost.state.world.events)
    this.runPhase('update')
    this.runPhase('late_update')
    this.mediaClock.advance(this.time.value.fixedDelta)
    this.worldGameplay.tileMapOwner.setTileAnimationTime(this.mediaClock.seconds); this.presentation.setRuntimeCaptionTime(this.mediaClock.seconds)
    this.audio.setTransportTime({seconds:this.mediaClock.seconds,playing:false,scale:this.time.value.scale})
    this.animationTimeline.animation.update(this.worldHost.state.world.entities, this.time.value.fixedDelta)
    this.updateTweens(this.time.value.fixedDelta)
    this.animationTimeline.timeline.update(this.worldHost.state.world.entities, this.time.value.fixedDelta)
    this.particles.update(this.time.value.fixedDelta, true)
    this.worldHost.plugins.update(this.time.value.fixedDelta)
    this.audio.update(this.worldHost.state.world.entities, this.worldHost.state.audioSettings, false,{seconds:this.mediaClock.seconds,playing:false,scale:this.time.value.scale})
    this.flushStructuralCommands()
    this.completeInputObservationFrame(observedOwner, observedSample, observedFixedCount, observedReplay)
  }

  /** 结构说明（自动提取）：stopSession；输入 log；直接调用 setStreamRuntimeHooks、destroying.add、runDestructionCallbacks、retireEntityLifetime、pendingDestroy.clear 等；写入 pendingPrefabs、this.animationTimeline.animation.onEvent、this.animationTimeline.animation.onCommand、this.animationTimeline.timeline.onEvent 等；包含循环处理。 */ stopSession(log = true): void {
    this.consumedFrameInput = null
    if (!this.active) { this.releaseScriptDebugCounterSession(); return }
    void this.gameFlow
    void this.worldGameplay
    void this.animationTimeline
    void this.presentation
    void this.audio
    void this.replay
    void this.productionNetwork
    void this.graphDebug
    this.streamHooksCleanup?.(); this.streamHooksCleanup = null
    this.sessionGeneration++
    this.invalidateScriptWorld()
    this.scriptWorldEntities.clear(); this.scriptWorldChildren.clear(); this.scriptWorldSnapshots.clear()
    const ending = [...this.worldHost.state.world.entities]
    for (const entity of ending) this.destroying.add(entity.uuid)
    for (const entity of ending) this.runDestructionCallbacks(entity)
    for (const entity of ending) this.worldGameplay.entityLifetimes.retire(entity)
    this.pendingCalls = []; this.laterCalls.clear(); this.reportedCallIssues.clear(); this.video.dispose()
    removeGlobalScriptHosts(this.worldHost.state.world, this.globalScriptHosts); this.globalScriptHosts = []
    this.releaseScriptDebugCounterSession()
    this.pendingDestroy.clear()
    this.pendingDespawn.clear()
    this.pendingPrefabs = []
    this.animationTimeline.markMembershipDirty()
    this.animationTimeline.animation.reset()
    this.animationTimeline.animation.onEvent = null
    this.animationTimeline.animation.onStateChange = null
    this.tweens.reset()
    this.physicsRecorder.reset()
    this.pendingRebind = null; this.input.cancelBindingCapture()
    this.animationTimeline.animation.onCommand = null
    this.animationTimeline.timeline.reset()
    this.animationTimeline.timeline.onEvent = null
    this.particles.reset()
    try { this.worldGameplay.resetWorldGameplay() } finally { this.worldGameplayOwner.componentsOwner.resetRuntimeCaches() }
    this.gameFlow.resetGameFlow()
    this.productionNetwork.stopProductionRuntime()
    this.networkUnsubscribe?.(); this.networkUnsubscribe = null
    this.worldHost.plugins.stop()
    this.rhythm.stop()
    clearScriptPostValues()
    void this.audio.dispose()
    this.pendingScene = null
    this.active = false
    this.input.stop()
    this.time.reset()
    this.mediaClock.seek(0)
    this.worldGameplay.tileMapOwner.setTileAnimationTime(null); this.presentation.setRuntimeCaptionTime(null)
    this.awakened.clear()
    this.started.clear()
    this.destroying.clear()
    this.fixedPressed = {}
    this.fixedReleased = {}
    this.fixedEdges = []
    this.pendingScene = null
    this.pendingDestroy.clear()
    this.pendingPrefabs = []
    this.pendingDynamicCommands = []
    this.pendingHandleResolutions.clear()
    this.signalQueue.clear()
    this.inputConsumption.clear()
    this.fixedStepSequence = 0
    this.pendingReloads.clear()
    this.worldGameplayOwner.objectPoolOwner.setPoolRuntimeHooks()
    this.contractValidations.clear()
    this.behaviorProperties.clear()
    this.initializedScriptInstances.clear()
    this.invalidateScriptWorld(); this.scriptWorldEntities.clear(); this.scriptWorldChildren.clear(); this.scriptWorldSnapshots.clear()
    this.compiledSources.clear()
    this.authoredEntities.clear(); this.compiledExports.clear()
    this.compiledDocuments.clear(); this.compiledModuleDocuments.clear(); this.pendingRollbackHistory.clear()
    this.declaredFunctions.clear()
    this.pendingDebugInvocation = null
    this.pendingGraphExecution = null
    this.scriptRuntime?.free(); this.scriptRuntime = null
    this.scriptHotReloadOwner.clearHotReloadSession()
    this.scriptDebugOwner.bindDebugHost(null)
    this.scriptDebugOwner.clearScriptDebugger()
    this.graphDebugOwner.clearGraphPause()
    if (log) this.worldHost.log('Gameplay runtime stopped', 'Runtime')
  }

  /** 26.46 explode(x, y, radius, impulse): a velocity change on every dynamic body around the point, away from it,
   * falling off linearly to zero at the radius (measured to the body's edge, so large bodies are not missed);
   * the calling object itself is left out. Returns the number of bodies pushed. */
  explode(source: Entity | null, x: number, y: number, radius: number, impulse: number): number {
    const entities = this.worldHost.state.world.entities, origin = { x: finiteNumber(x, 0), y: finiteNumber(y, 0) }, reach = Math.max(0, finiteNumber(radius, 0)), strength = finiteNumber(impulse, 0)
    if (!(reach > 0) || strength === 0) return 0
    let pushed = 0
    for (const body of entities) {
      if (body === source || !body.enabled || !body.hasComponent('RigidBody2D') || body.isStatic || body.isKinematic || !(body.mass > 0)) continue
      const position = worldTransform(body, entities).position, collider = body.getCollider(true)
      const round = collider?.kind === 'EllipseCollider2D'
      const size = !collider ? .25 : round ? Math.max(collider.radiusX, collider.radiusY) : Math.hypot(collider.size.x, collider.size.y) / 2
      const dx = position.x - origin.x, dy = position.y - origin.y, distance = Math.hypot(dx, dy)
      const edge = Math.max(0, distance - size)
      if (edge >= reach) continue
      const falloff = 1 - edge / reach, nx = distance > 1e-9 ? dx / distance : 0, ny = distance > 1e-9 ? dy / distance : 1
      body.velocity = { x: body.velocity.x + nx * strength * falloff / body.mass, y: body.velocity.y + ny * strength * falloff / body.mass }
      pushed++
    }
    return pushed
  }

  /** 26.46: a client (CSS pixel) point in world space through the active game camera, as the frame's input sees it. */
  clientToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
    const viewport = this.lastViewport
    if (!viewport) return null
    const width = Math.max(1, viewport.width), height = Math.max(1, viewport.height)
    const active = activeGameCamera(this.worldHost.state.world.entities, width, height)
    const view = active?.view ?? { scale: this.worldHost.state.camera.scale, offset: this.worldHost.state.camera.offset }
    return gameScreenToWorld({ x: clientX - viewport.left, y: clientY - viewport.top }, view, width, height)
  }

  /** 结构说明（自动提取）：decorateViewportInput；输入 snapshot、viewport；直接调用 Math.max、activeGameCamera、gameScreenToWorld、visibleWorldBounds；写入 snapshot.mouseWorldPosition、snapshot.viewBounds、snapshot.viewportSize；返回路径包含 snapshot。 */ private decorateViewportInput(snapshot: InputSnapshot, viewport?: DOMRect): InputSnapshot {
    const width = Math.max(1, viewport?.width ?? 1), height = Math.max(1, viewport?.height ?? 1)
    const active = activeGameCamera(this.worldHost.state.world.entities, width, height)
    const view = active?.view ?? { scale: this.worldHost.state.camera.scale, offset: this.worldHost.state.camera.offset }
    const world = gameScreenToWorld({ x: snapshot.mousePosition[0], y: snapshot.mousePosition[1] }, view, width, height)
    const bounds = visibleWorldBounds(view, width, height)
    snapshot.mouseWorldPosition = [world.x, world.y]
    snapshot.viewBounds = [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY]
    snapshot.viewportSize = [width, height]
    return snapshot
  }

  /** 结构说明（自动提取）：synchronizeExports；输入 entity；直接调用 resolveAsset、readTextAsset、resolveScriptBundle、Error、errorMessage 等；写入 source、component.lastError、component.propertyMetadata、next[…] 等；返回路径包含 component.lastError；包含循环处理；包含显式抛错路径。 */ synchronizeExports(entity: Entity): string | null {
    const component = entity.script2D
    const asset = this.scriptServices.resolveAsset(component?.scriptAsset)
    const storedSource = this.scriptServices.readSource(component?.scriptAsset)
    if (!component || !asset || !storedSource || (asset.assetType !== 'script' && asset.assetType !== 'visualScript')) return 'Select a valid Rhai or visual graph asset'
    let source: string
    try { const bundled = this.resolveScriptBundle(asset.uuid); if (bundled === null) throw new Error('Script module could not be resolved'); source = bundled } catch (error) { component.lastError = this.errorMessage(error); return component.lastError }
    this.ensureScriptRuntime()
    if (!this.scriptRuntime) return 'Script runtime is still loading'
    try {
      const exports = JSON.parse(this.scriptRuntime.validate(source)) as ExportedProperty[]
      const next: Record<string, ScriptPropertyValue> = {}
      component.propertyMetadata = Object.fromEntries(exports.map(/* 返回按声明顺序构造的数组 [exported.name, { ...exported, defaultValue: exported.defaultValue ?? exported.value }]。 */ exported => [exported.name, { ...exported, defaultValue: exported.defaultValue ?? exported.value }]))
      for (const exported of exports) next[exported.name] = this.exportValue(exported, component.properties[exported.name])
      component.properties = next
      component.lastError = null
      return null
    } catch (error) {
      component.lastError = this.errorMessage(error)
      return component.lastError
    }
  }

  /** 结构说明（自动提取）：validateSource；输入 source；直接调用 ensureScriptRuntime、JSON.parse、scriptRuntime.validate、errorMessage。 */ validateSource(source: string): { error: string | null; exports: ExportedProperty[] } {
    this.ensureScriptRuntime()
    if (!this.scriptRuntime) return { error: 'Script runtime is still loading', exports: [] }
    try {
      return { error: null, exports: JSON.parse(this.scriptRuntime.validate(source)) as ExportedProperty[] }
    } catch (error) {
      return { error: this.errorMessage(error), exports: [] }
    }
  }

  /** Read the exact draft/module bundle for editor analysis without invoking the VM. */
  /** 结构说明（自动提取）：resolveModuleSource；输入 scriptUuid、source、overrides；直接调用 Map、next.set、resolveScriptBundle、errorMessage。 */ resolveModuleSource(scriptUuid: string, source: string, overrides = new Map<string, string>()): { source: string | null; error: string | null } {
    try {
      const next = new Map(overrides)
      next.set(scriptUuid, source)
      const bundled = this.resolveScriptBundle(scriptUuid, next)
      return { source: bundled, error: bundled === null ? 'Script module could not be resolved' : null }
    } catch (error) { return { source: null, error: this.errorMessage(error) } }
  }

  /** 结构说明（自动提取）：validateModuleSource；输入 scriptUuid、source、overrides；直接调用 Map、next.set、resolveScriptBundle、validateSource、errorMessage。 */ validateModuleSource(scriptUuid: string, source: string, overrides = new Map<string, string>()): { error: string | null; exports: ExportedProperty[] } {
    try {
      const next = new Map(overrides)
      next.set(scriptUuid, source)
      const bundled = this.resolveScriptBundle(scriptUuid, next)
      if (!bundled) return { error: 'Script module could not be resolved', exports: [] }
      return this.validateSource(bundled)
    } catch (error) {
      return { error: this.errorMessage(error), exports: [] }
    }
  }

  /** 结构说明（自动提取）：queueHotReload；输入 scriptUuid、source；直接调用 pendingReloads.delete、pendingRollbackHistory.delete、validateModuleSource、pendingReloads.set；写入 scriptDebugState.hotReload。 */ queueHotReload(scriptUuid: string, source: string): void {
    // A newer request supersedes even a previously valid queued draft.
    this.pendingReloads.delete(scriptUuid)
    this.pendingRollbackHistory.delete(scriptUuid)
    if (!scriptProjectSettings.hotReloadEnabled) {
      this.scriptDebugger.state.hotReload = { status: 'disabled', scriptUuid, message: 'Project hot reload is disabled', frame: this.time.value.frame }
      return
    }
    const validation = this.validateModuleSource(scriptUuid, source)
    if (validation.error) {
      this.scriptDebugger.state.hotReload = { status: 'rejected', scriptUuid, message: `Candidate rejected before apply: ${validation.error}`, frame: this.time.value.frame }
      return
    }
    this.pendingRollbackHistory.delete(scriptUuid)
    this.pendingReloads.set(scriptUuid, source)
    this.scriptDebugger.state.hotReload = { status: 'pending', scriptUuid, message: 'Analyzed candidate queued for a transactional frame-boundary swap', frame: this.time.value.frame }
  }

  /** 结构说明（自动提取）：queueGraphHotReload；输入 scriptUuid、candidateSource、previousSource；直接调用 pendingReloads.delete、pendingRollbackHistory.delete、planGraphHotReload、graphStateValues、graphPlan.reasons.join 等；写入 scriptDebugState.hotReload；包含显式抛错路径。 */ queueGraphHotReload(scriptUuid: string, candidateSource: string, previousSource: string): void {
    // A newer request supersedes even a previously valid queued draft.
    this.pendingReloads.delete(scriptUuid)
    this.pendingRollbackHistory.delete(scriptUuid)
    if (!scriptProjectSettings.hotReloadEnabled) {
      this.scriptDebugger.state.hotReload = { status: 'disabled', scriptUuid, message: 'Project hot reload is disabled', frame: this.time.value.frame }
      return
    }
    try {
      const graphPlan = planGraphHotReload(previousSource, candidateSource, this.graphDebug.graphStateValues())
      if (!graphPlan.compatible) {
        const message = `Visual graph saved; runtime restart required: ${graphPlan.reasons.join(' ')}`
        this.scriptDebugger.state.hotReload = { status: 'rejected', scriptUuid, message, frame: this.time.value.frame }
        this.worldHost.log(message, 'Script', 'warning', scriptUuid)
        return
      }
      const validation = this.validateModuleSource(scriptUuid, candidateSource)
      if (validation.error) throw new Error(validation.error)
      this.pendingRollbackHistory.delete(scriptUuid)
      this.pendingReloads.set(scriptUuid, candidateSource)
      this.scriptDebugger.state.hotReload = { status: 'pending', scriptUuid, message: `Visual graph queued with ${Object.keys(graphPlan.preserved).length} compatible state values preserved`, frame: this.time.value.frame }
    } catch (error) {
      this.scriptDebugger.state.hotReload = { status: 'rejected', scriptUuid, message: `Visual graph hot reload rejected: ${this.errorMessage(error)}`, frame: this.time.value.frame }
    }
  }

  /** 结构说明（自动提取）：rollbackHotReload；输入 scriptUuid；直接调用 peekHotReloadRollback、resolveAsset、compiledDocuments.get、validateModuleSource、updateTextAsset 等；写入 scriptDebugState.hotReload。 */ rollbackHotReload(scriptUuid: string): boolean {
    const rollback = this.scriptHotReload.peekHotReloadRollback(scriptUuid)
    if (!rollback || !scriptProjectSettings.hotReloadEnabled || this.scriptServices.resolveAsset(scriptUuid)?.script?.reloadPolicy === 'disabled') return false
    if (rollback.source === this.compiledDocuments.get(scriptUuid)) {
      this.scriptDebugger.state.hotReload = { status: 'rejected', scriptUuid, message: 'This root document did not change in that generation. Roll back the changed imported module to restore its dependent scripts together.', frame: this.time.value.frame }
      return false
    }
    const validation = this.validateModuleSource(scriptUuid, rollback.source)
    if (validation.error || !(this.scriptServices.writeSource?.(scriptUuid, rollback.source) ?? false)) return false
    this.pendingRollbackHistory.set(scriptUuid, rollback.historyId)
    this.pendingReloads.set(scriptUuid, rollback.source)
    this.scriptDebugger.state.hotReload = { status: 'pending', scriptUuid, message: 'Rollback source queued for transactional apply', frame: this.time.value.frame }
    return true
  }

  /** 结构说明（自动提取）：emitSignal；输入 name、payload、target、source、deliveredCallbacks；直接调用 slice、name.trim、pendingSignals.push、serializable、target.trim 等。 */ emitSignal(name: string, payload: unknown = null, target = '', source = 'editor', deliveredCallbacks: string[] = []): void {
    const clean = name.trim().slice(0, 128)
    if (!clean) return
    const before = this.signalQueue.stats()
    this.signalQueue.enqueue({ name: clean, payload: this.serializable(payload), target: target.trim().slice(0, 128), source: source.trim().slice(0, 128), deliveredCallbacks: [...deliveredCallbacks] })
    const after = this.signalQueue.stats()
    // 丢弃必须是可观测事实：报出本次与累计数量，而不是只留一条无从核对的 warning。
    if (after.dropped > before.dropped) this.worldHost.log(`Signal queue limit reached; ${after.dropped - before.dropped} oldest event(s) dropped, cumulative ${after.dropped}.`, 'Script', 'warning')
  }

  /** 信号队列的可观测状态：发送/派发/丢弃计数与序号区间。§5.3 不允许静默丢弃，故对外暴露。 */
  signalQueueStats(): SignalQueueStats { return this.signalQueue.stats() }

  /** 输入消费台账的可观测状态；延迟仍由 observability 提供，两者互不重复。 */
  inputConsumptionStats(): InputConsumptionStats { return this.inputConsumption.stats() }

  /** 由宿主在**提交**渲染包时调用，把已消费但未关联的输入绑定到该包。
   * 只有第一次绑定生效，因此同一输入不会被后续提交冒充为"已响应"（§26.4）。 */
  bindConsumedInputToPacket(packet: number): number {
    let bound = 0
    for (const record of this.inputConsumption.pending()) {
      if (this.inputConsumption.markFirstAffectedPacket(record.inputEpoch, record.sequence, packet)) bound += 1
    }
    return bound
  }

  /** 26.45: the camera a script's camera commands act on: its own, else the first active camera. */
  private scriptCamera(entity: Entity): Camera2D | null {
    const own = entity.getComponent<Camera2D>('Camera2D')
    if (own?.enabled && !own.removed) return own
    const cameras = this.worldHost.state.world.entities.flatMap(candidate => { const camera = candidate.getComponent<Camera2D>('Camera2D'); return candidate.enabled && camera?.enabled && !camera.removed && camera.active ? [{ entity: candidate, camera }] : [] })
    cameras.sort((first, second) => first.camera.priority - second.camera.priority || first.camera.stackOrder - second.camera.stackOrder || first.entity.id - second.entity.id)
    return cameras[0]?.camera ?? null
  }

  /** 26.45: camera trauma recovers and the screen flash fades on game time. */
  private updateScreenEffects(delta: number): void {
    const step = Math.max(0, finiteNumber(delta, 0))
    if (step <= 0) return
    for (const entity of this.worldHost.state.world.entities) {
      const camera = entity.getComponent<Camera2D>('Camera2D')
      if (camera && camera.trauma > 0) camera.trauma = Math.max(0, camera.trauma - Math.max(0, finiteNumber(camera.shake?.recovery, 1.5)) * step)
    }
    if (this.screenFlash) { this.screenFlash.remaining -= step; if (this.screenFlash.remaining <= 0) this.screenFlash = null }
  }

  /** 26.45: the flash to draw over the game now (renderScreenFlash), or null. */
  screenFlashOverlay(): { r: number; g: number; b: number; alpha: number } | null {
    const flash = this.screenFlash
    return flash ? { r: flash.r, g: flash.g, b: flash.b, alpha: Math.max(0, flash.remaining / flash.seconds) * .85 } : null
  }

  /** 26.45: where run-time rebinding goes. The Player stores the player's bindings; without a sink
   * (the editor) the live input map is changed for this session. */
  setInputRemapSink(sink: GameplayInputRemapSink | null): void { this.inputRemapSink = sink }

  /** 26.45: completes a script's `input_rebind` once a key or button was pressed (Escape cancels). */
  private finishInputRebind(): void {
    const pending = this.pendingRebind, captured = this.input.takeBindingCapture()
    if (!pending || !captured) return
    this.pendingRebind = null
    if (captured === 'cancelled') { this.emitSignal('input.rebind_cancelled', { action: pending.action, index: pending.index }, pending.entityUuid, 'input'); return }
    const changed = this.inputRemapSink ? this.inputRemapSink.remap(pending.action, pending.index, captured) : rebindInputAction(this.worldHost.state.inputMap, pending.action, pending.index, captured)
    this.inputPromptsKey = ''
    this.refreshInputPrompts()
    if (!changed) { this.emitSignal('input.rebind_cancelled', { action: pending.action, index: pending.index }, pending.entityUuid, 'input'); return }
    this.emitSignal('input.rebound', { action: pending.action, index: pending.index, device: captured.device, code: captured.code, prompt: this.inputPrompts[pending.action] ?? '' }, pending.entityUuid, 'input')
  }

  /** 26.45: the prompt symbol of every action for the device in use (scripts read `input_prompt`). */
  private refreshInputPrompts(): void {
    const actions = this.worldHost.state.inputMap
    const first = actions.length ? inputPromptForAction(actions[0].name, actions) : null
    const key = `${actions.length}:${first?.modality ?? ''}:${actions.map(action => action.bindings.map(binding => `${binding.device}/${binding.code}`).join(',')).join(';')}`
    if (key === this.inputPromptsKey) return
    this.inputPromptsKey = key
    this.inputPrompts = Object.fromEntries(actions.slice(0, 256).map(action => [action.name, inputPromptForAction(action.name, actions).symbol]))
  }

  /** 26.44: physics recording for the debugger (see PhysicsRecorder). 26.45: with complete keyframes. */
  setPhysicsRecording(enabled: boolean): void {
    this.physicsRecorder.keyframes ??= this.rewindKeyframeStore()
    this.physicsRecorder.enabled = enabled
    if (!enabled) { if (this.physicsRecorder.scrubbing) this.physicsRecorder.endScrub(this.worldHost.state.world.entities); this.physicsRecorder.reset() }
  }
  /** 26.45: how the last continue from the recording went (exact keyframe or poses only). */
  physicsRecordingLastContinue(): { exact: boolean; step: number } | null { return this.physicsRecorder.lastContinue }
  /** 26.45: the nearest complete keyframe at or before a recorded frame (-1: none). */
  physicsRecordingKeyframe(index: number): number { return this.physicsRecorder.keyframeAtOrBefore(index) }

  /** 26.45: complete keyframes for the physics recording: the solver snapshot and the script
   * instances' scopes (both kept in WASM by slot) plus the game state kept here: script variables,
   * timers, tweens, animator and timeline playheads and the step counter. */
  private rewindKeyframeStore(): PhysicsRecorderKeyframes {
    type InstanceSnapshots = { save_instances?(slot: number): number; restore_instances?(slot: number): number; drop_instances?(slot: number): boolean; clear_instance_snapshots?(): void }
    const scripts = () => this.scriptRuntime as unknown as InstanceSnapshots | null
    return {
      save: slot => {
        const world = this.worldHost.state.world
        const bytes = world.saveRuntimeSnapshot(slot)
        if (bytes <= 0) return 0
        scripts()?.save_instances?.(slot)
        const state = this.captureRewindState(world.runtimeLayoutKey())
        this.rewindKeyframes.set(slot, state)
        return bytes + state.bytes
      },
      restore: slot => {
        const world = this.worldHost.state.world, state = this.rewindKeyframes.get(slot)
        // Bodies or joints added or removed since: the snapshot no longer fits the scene.
        if (!state || state.layout !== world.runtimeLayoutKey() || !world.restoreRuntimeSnapshot(slot)) return false
        const instances = scripts()?.restore_instances?.(slot) ?? -1
        if (instances < 0) this.worldHost.log('Rewind: script variables kept their current values (the scripts were reloaded since)', 'Runtime', 'warning')
        this.restoreRewindState(state)
        return true
      },
      drop: slot => { this.worldHost.state.world.dropRuntimeSnapshot(slot); scripts()?.drop_instances?.(slot); this.rewindKeyframes.delete(slot) },
      clear: () => { this.worldHost.state.world.clearRuntimeSnapshots(); scripts()?.clear_instance_snapshots?.(); this.rewindKeyframes.clear() }
    }
  }

  private captureRewindState(layout: string): GameplayRewindState {
    const components = captureComponentFields(this.worldHost.state.world.entities)
    const animation = this.animationTimeline.animation.captureRewind(), timeline = this.animationTimeline.timeline.captureRewind()
    return {
      layout, step: this.fixedStepSequence, components,
      behaviors: cloneRuntimeState(this.behaviorProperties), initialized: new Set(this.initializedScriptInstances),
      time: this.time.captureRewind(), media: cloneRuntimeState(this.mediaClock), tweens: this.tweens.captureRewind(), animation, timeline,
      bytes: 4096 + components.length * 384 + this.behaviorProperties.size * 256
    }
  }

  private restoreRewindState(state: GameplayRewindState): void {
    restoreComponentFields(this.worldHost.state.world.entities, state.components)
    this.behaviorProperties = cloneRuntimeState(state.behaviors)
    this.initializedScriptInstances = new Set(state.initialized)
    this.time.restoreRewind(state.time)
    Object.assign(this.mediaClock, cloneRuntimeState(state.media))
    this.tweens.restoreRewind(state.tweens)
    this.animationTimeline.animation.restoreRewind(state.animation)
    this.animationTimeline.timeline.restoreRewind(state.timeline)
    this.fixedStepSequence = state.step
  }
  physicsRecordingStatus(): PhysicsRecorderStatus { return this.physicsRecorder.status() }
  physicsRecordingFrame(index: number): { step: number; time: number; count: number; keyframe: boolean } | null { return this.physicsRecorder.frameInfo(index) }
  /** Shows the bodies at a recorded frame; only while paused. */
  scrubPhysics(index: number): boolean { return this.worldHost.state.playMode === 'paused' && this.physicsRecorder.scrubTo(index, this.worldHost.state.world.entities) }
  endPhysicsScrub(): void { this.physicsRecorder.endScrub(this.worldHost.state.world.entities) }
  /** Rewinds the bodies to the scrubbed frame (poses and velocities) and keeps the game paused there. */
  continuePhysicsFromScrub(): number {
    const world = this.worldHost.state.world
    const rewound = this.physicsRecorder.continueFromScrub({ entities: world.entities, teleport: (entity, position, angle) => world.teleport(entity, position, angle) })
    if (rewound) {
      this.invalidateScriptWorld()
      const exact = this.physicsRecorder.lastContinue?.exact
      this.worldHost.log(exact ? `Rewound to recorded step ${this.physicsRecorder.lastContinue?.step}: physics, script variables, timers and animations` : `Physics rewound ${rewound} bodies to the recorded step (poses only)`, 'Runtime', 'info')
    }
    return rewound
  }

  /** 结构说明（自动提取）：debugContinue；无显式参数；直接调用 clearScriptDebugger、requestDebugStep、requestGraphStep、this.worldHost.state.world.entities.find、processScriptCommands 等；写入 pendingGraphExecution、this.worldHost.state.playMode、pendingDebugInvocation。 */ debugContinue(): void {
    if (this.pendingGraphExecution) {
      const pending = this.pendingGraphExecution
      this.pendingGraphExecution = null
      this.scriptDebugger.clearScriptDebugger()
      this.scriptDebugger.requestDebugStep('continue')
      this.graphDebug.requestGraphStep('continue')
      const entity = this.worldHost.state.world.entities.find(/* 比较 candidate.uuid 与 pending.entityUuid，返回严格相等的判断结果。 */ candidate => candidate.uuid === pending.entityUuid)
      if (entity) this.processScriptCommands(entity, pending.scriptUuid, pending.sourcePath, pending.functionName, pending.commands, pending.nextIndex)
      if (!this.pendingGraphExecution && this.worldHost.state.playMode === 'paused') this.worldHost.state.playMode = 'playing'
      return
    }
    const pending = this.pendingDebugInvocation
    this.pendingDebugInvocation = null
    this.scriptDebugger.clearScriptDebugger()
    this.scriptDebugger.requestDebugStep('continue')
    if (pending) {
      const entity = this.worldHost.state.world.entities.find(/* 比较 candidate.uuid 与 pending.entityUuid，返回严格相等的判断结果。 */ candidate => candidate.uuid === pending.entityUuid)
      // 26.44: a line stop re-runs the callback and continues after the stop (it may stop again).
      if (entity) { this.invalidateScriptWorld(); this.runEntityFunction(entity, pending.functionName, pending.contact, pending.event, true, pending.logicAsset, false, pending.callbackKind, pending.resume ? { ...pending.resume, mode: 'continue' } : undefined) }
    }
    if (this.worldHost.state.playMode === 'paused' && !this.pendingDebugInvocation) this.worldHost.state.playMode = 'playing'
  }

  /** 结构说明（自动提取）：debugStep；输入 mode；直接调用 clearScriptDebugger、requestDebugStep、requestGraphStep、this.worldHost.state.world.entities.find、processScriptCommands 等；写入 pendingGraphExecution、this.worldHost.state.playMode、this.graphDebug.state.paused、this.graphDebug.state.reason 等。 */ debugStep(mode: Exclude<DebugStepMode, 'continue'> = 'over'): void {
    if (this.pendingGraphExecution) {
      const pending = this.pendingGraphExecution
      this.pendingGraphExecution = null
      this.scriptDebugger.clearScriptDebugger()
      this.scriptDebugger.requestDebugStep(mode)
      this.graphDebug.requestGraphStep(mode)
      const entity = this.worldHost.state.world.entities.find(/* 比较 candidate.uuid 与 pending.entityUuid，返回严格相等的判断结果。 */ candidate => candidate.uuid === pending.entityUuid)
      if (entity) this.processScriptCommands(entity, pending.scriptUuid, pending.sourcePath, pending.functionName, pending.commands, pending.nextIndex)
      this.worldHost.state.playMode = 'paused'
      if (!this.pendingGraphExecution) {
        this.graphDebug.state.paused = true
        this.graphDebug.state.reason = `Step ${mode} completed at the visual callback boundary`
        this.scriptDebugger.state.paused = true
        this.scriptDebugger.state.reason = this.graphDebug.state.reason
      }
      return
    }
    const pending = this.pendingDebugInvocation
    this.pendingDebugInvocation = null
    this.scriptDebugger.clearScriptDebugger()
    this.scriptDebugger.requestDebugStep(mode)
    if (pending) {
      const entity = this.worldHost.state.world.entities.find(/* 比较 candidate.uuid 与 pending.entityUuid，返回严格相等的判断结果。 */ candidate => candidate.uuid === pending.entityUuid)
      if (entity) { this.invalidateScriptWorld(); this.runEntityFunction(entity, pending.functionName, pending.contact, pending.event, true, pending.logicAsset, false, pending.callbackKind, pending.resume ? { ...pending.resume, mode } : undefined) }
      // 26.44: the step stopped at the next line of the same callback.
      if (this.pendingDebugInvocation) return
    }
    this.worldHost.state.playMode = 'paused'
    this.scriptDebugger.state.paused = true
    this.scriptDebugger.state.reason = `Step ${mode} completed at a safe callback boundary`
  }

  /** 结构说明（自动提取）：debugRestart；无显式参数；直接调用 stopSession、beginSession；写入 this.worldHost.state.playMode、scriptDebugState.paused、scriptDebugState.reason。 */ debugRestart(): void {
    this.stopSession(false)
    this.beginSession()
    this.worldHost.state.playMode = 'paused'
    this.scriptDebugger.state.paused = true
    this.scriptDebugger.state.reason = 'Runtime restarted; continue to enter the next callback'
  }

  /** 结构说明（自动提取）：cancelDebugTask；输入 taskId；直接调用 scriptDebugState.tasks.find、includes、time.cancelTask、updateDebugTask、this.worldHost.log。 */ cancelDebugTask(taskId: string): boolean {
    const task = this.scriptDebugger.state.tasks.find(/* 比较 item.id 与 taskId，返回严格相等的判断结果。 */ item => item.id === taskId)
    if (!task || !['queued', 'running', 'waiting'].includes(task.state)) return false
    this.time.cancelTask(task.entityUuid, task.name)
    this.scriptDebugger.updateDebugTask({ ...task, state: 'cancelled', detail: `Cancelled from Script Studio at frame ${this.time.value.frame}` })
    this.worldHost.log(`Cancelled script task ${task.name}`, 'Script', 'info', task.entityUuid)
    return true
  }

  /** 结构说明（自动提取）：runScriptTests；输入 scriptUuid、options；直接调用 resetScriptCoverage、this.worldHost.state.world.entities.flatMap、values、Map、references.flatMap 等；写入 source；返回路径包含 results；包含循环处理。 */ runScriptTests(scriptUuid?: string, options: { tags?: string[]; includeSkipped?: boolean; testNames?: string[] } = {}): ScriptTestResult[] {
    if (scriptProjectSettings.testing.coverageEnabled) resetScriptCoverage()
    const references = scriptUuid ? [scriptUuid] : this.worldHost.state.world.entities.flatMap(/** 结构说明（自动提取）：this.worldHost.state.world.entities.flatMap 回调；输入 entity；直接调用 map、resolveEventHandlers；返回表达式求值结果。 */ entity => [entity.script2D?.scriptAsset, ...this.resolveEventHandlers(entity.script2D?.eventSheetAsset).map(/* 返回 handler.logicAsset 的当前值。 */ handler => handler.logicAsset)])
    const assets = [...new Map(references.flatMap(/** 结构说明（自动提取）：references.flatMap 回调；输入 reference；直接调用 resolveAsset。 */ reference => { const asset = this.scriptServices.resolveAsset(reference); return asset && (asset.assetType === 'script' || asset.assetType === 'visualScript') ? [[asset.uuid, asset] as const] : [] })).values()]
    const results: ScriptTestResult[] = []
    for (const asset of assets) {
      let source: string | null = null
      try { source = this.resolveScriptBundle(asset.uuid) } catch (error) { results.push({ script: asset.name, test: 'module resolution', passed: false, skipped: false, durationMs: 0, seed: 1, caseName: '', tags: [], message: this.errorMessage(error) }); continue }
      if (!source) continue
      const analysis = analyzeScript(source), selectedNames = new Set(options.testNames ?? [])
      const tests = analysis.tests.filter(/** 结构说明（自动提取）：analysis.tests.filter 回调；输入 test；直接调用 options.tags.every、selectedNames.has；返回表达式求值结果。 */ test => (!options.tags?.length || options.tags.every(/* 调用 test.tags.includes(tag) 并返回调用结果。 */ tag => test.tags.includes(tag))) && (!options.testNames || selectedNames.has(test.name)))
      results.push(...executeScriptTestSuite({
        scriptUuid: asset.uuid, scriptName: asset.name, source, functions: new Set(Object.keys(analysis.functions)), tests, includeSkipped: options.includeSkipped,
        createVm: /** 结构说明（自动提取）：匿名回调；无显式参数；直接调用 WasmScriptRuntime；返回表达式求值结果。 */ () => new WasmScriptRuntime(), parseExecution: parseScriptExecution,
        onExecution: /** 结构说明（自动提取）：匿名回调；输入 functionName；直接调用 recordScriptCoverage。 */ functionName => { if (scriptProjectSettings.testing.coverageEnabled) recordScriptCoverage(asset.uuid, source!, functionName) },
        context: {
          apiVersion: asset.script?.apiVersion ?? scriptProjectSettings.apiVersion, entity: 'test-entity', entityName: 'Script test', components: [], entities: {},
          time: { delta: 0, fixedDelta: 1 / 60, elapsed: 0, scale: 1, frame: 0 }, randomSeed: scriptProjectSettings.deterministicTestSeed, input: EMPTY_INPUT,
          properties: {}, save: {}, transform: { position: [0, 0], rotation: 0, scale: [1, 1] }, rigidBody: null
        }
      }))
    }
    if (!results.length && scriptProjectSettings.testing.failOnEmpty) results.push({ script: 'Selected scripts', test: 'discovery', passed: false, skipped: false, durationMs: 0, seed: 1, caseName: '', tags: [], message: 'No tests matched the selected scripts, tags and names.' })
    this.scriptDebugger.state.testResults.splice(0, this.scriptDebugger.state.testResults.length, ...results)
    this.worldHost.log(`Script tests: ${results.filter(/* 先计算 result.passed；仅当其为真值时求右侧 !result.skipped，返回短路求值结果。 */ result => result.passed && !result.skipped).length}/${results.filter(/* 返回 result.skipped 的逻辑取反结果。 */ result => !result.skipped).length} passed, ${results.filter(/* 返回 result.skipped 的当前值。 */ result => result.skipped).length} skipped`, 'Script', results.every(/* 返回 result.passed 的当前值。 */ result => result.passed) ? 'info' : 'error')
    return results
  }

  /** 结构说明（自动提取）：invokeUiCallback；输入 entity、functionName；直接调用 functionName.trim、entityLifetimeActive、isRemovalPending、dispatchTimelineUiAction、this.worldHost.log 等。 */ invokeUiCallback(entity: Entity, functionName: string): void {
    const requested = functionName.trim()
    if (!this.active || !entity.enabled || !this.worldGameplay.entityLifetimes.active(entity) || this.isRemovalPending(entity)) return
    const timelineAction = dispatchTimelineUiAction(entity, requested, this.worldHost.state.world.entities, this.animationTimeline)
    if (timelineAction.handled) { if (timelineAction.issue) this.worldHost.log(timelineAction.issue, 'Script', 'warning', entity.uuid); return }
    const callback = requested.slice(0, 80)
    if (!callback || !this.canRun(entity)) return
    const primary = this.scriptServices.resolveAsset(entity.script2D?.scriptAsset)?.uuid
    const sheetOwnsCallback = this.resolveEventHandlers(entity.script2D?.eventSheetAsset).some(/** 结构说明（自动提取）：some 回调；输入 handler；直接调用 resolveAsset；返回表达式求值结果。 */ handler => handler.kind === 'ui' && (!handler.selector || handler.selector === callback) && handler.callback === callback && this.scriptServices.resolveAsset(handler.logicAsset)?.uuid === primary)
    const direct = callback !== 'on_signal' && !sheetOwnsCallback
    const delivered = direct && primary ? [JSON.stringify([primary, callback])] : []
    this.emitSignal(`ui.${callback}`, { entity: entity.uuid }, entity.uuid, entity.uuid, delivered)
    // Event Sheets receive the complete event once at the signal boundary.
    // Keep legacy named button callbacks immediate and record their provenance
    // so a matching signal connection cannot invoke them a second time.
    if (direct) { this.invalidateScriptWorld(); this.runEntityFunction(entity, callback) }
    this.flushEntityCommands()
    this.flushStructuralCommands()
  }

  /** 结构说明（自动提取）：ensureScriptRuntime；无显式参数；直接调用 WasmScriptRuntime；写入 scriptRuntime。 */ private ensureScriptRuntime(): void {
    if (!this.scriptRuntime && !this.worldHost.state.world.wasmError) {
      try { this.scriptRuntime = new WasmScriptRuntime() } catch { /* WASM is not initialized yet. */ }
    }
  }

  private lastInputSampleAt = 0
  private invalidateScriptWorld(): void { this.scriptWorldSource = null }

  // Breakpoint lookup reads the static analysis of the authored document; parse it once per source text.
  private readonly debugAnalysisCache = new Map<string, { language: ReturnType<typeof analyzeScript>; rich: ReturnType<typeof analyzeScript26> }>()
  private debugAnalysis(source: string) {
    let cached = this.debugAnalysisCache.get(source)
    if (!cached) {
      cached = { language: analyzeScript(source), rich: analyzeScript26(source) }
      if (this.debugAnalysisCache.size >= 64) this.debugAnalysisCache.clear()
      this.debugAnalysisCache.set(source, cached)
    }
    return cached
  }

  private nextScriptWorldRevision(): number {
    if (this.scriptWorldRevision >= 0xffff_ffff) throw new Error('Script query revision exhausted; restart the Runtime world.')
    return this.scriptWorldRevision + 1
  }

  /** Publish one read-only query projection at each explicit phase/structural safe point. */
  private ensureScriptWorld(entities: readonly Entity[]): number {
    if (this.scriptWorldSource === entities) return this.scriptWorldRevision
    const started = performance.now(), active = entities.filter(entity => this.worldGameplay.entityLifetimes.active(entity))
    if (active.length > 100_000) throw new Error('Script query world exceeds the 100,000 entity capacity.')
    const snapshots = this.worldGameplay.dynamicObjectsOwner.runtimeSceneEntitySnapshots(entities)
    const snapshot = { protocolVersion: 1, entityGenerations: Object.fromEntries(active.map(entity => [entity.uuid, this.worldGameplay.entityLifetimes.generation(entity)])), entities: Object.fromEntries(active.map(entity => [entity.name, entity.uuid])), sceneEntities: snapshots }
    const json = JSON.stringify(snapshot), revision = this.nextScriptWorldRevision(), bytes = new TextEncoder().encode(json).byteLength
    if (bytes > MAX_SCRIPT_BRIDGE_BYTES) throw new Error('Script query world exceeds the 16 MB bridge limit.')
    this.scriptContextDiagnostics.prepareMs += performance.now() - started
    const publish = performance.now()
    this.scriptRuntime!.publish_world_context_json(this.playSessionIdentity, revision, json)
    this.scriptContextDiagnostics.publishMs += performance.now() - publish
    this.scriptWorldRevision = revision; this.scriptWorldSource = entities
    this.scriptWorldEntities = new Map(active.map(entity => [entity.uuid, entity]))
    this.scriptWorldSnapshots = new Map(snapshots.map(entity => [entity.uuid, entity]))
    this.scriptWorldChildren.clear()
    for (const entity of active) if (entity.parentUuid) { const children = this.scriptWorldChildren.get(entity.parentUuid) ?? []; children.push(entity); this.scriptWorldChildren.set(entity.parentUuid, children) }
    this.scriptContextDiagnostics.publications++; this.scriptContextDiagnostics.entityRecords += snapshots.length; this.scriptContextDiagnostics.worldBytes += bytes
    return revision
  }

  /** Owner writes commit first; affected descendants are then published before the next callback. */
  private publishScriptTransformWrite(entity: Entity): void {
    const entities = this.callbackWorld ?? this.worldHost.state.world.entities
    if (!this.scriptRuntime || this.scriptWorldSource !== entities || !this.scriptWorldEntities.has(entity.uuid)) { this.invalidateScriptWorld(); return }
    const changes: RuntimeEntitySnapshot[] = [], pending = [entity], visited = new Set<string>()
    for (let index = 0; index < pending.length; index++) {
      const current = pending[index]
      if (visited.has(current.uuid)) continue
      visited.add(current.uuid)
      const previous = this.scriptWorldSnapshots.get(current.uuid)
      if (!previous || previous.generation !== this.worldGameplay.entityLifetimes.inspect(current)) { this.invalidateScriptWorld(); return }
      const position = worldTransform(current, entities).position
      if (position.x !== previous.position[0] || position.y !== previous.position[1]) changes.push({ ...previous, position: [position.x, position.y] })
      pending.push(...(this.scriptWorldChildren.get(current.uuid) ?? []))
    }
    if (!changes.length) return
    const revision = this.nextScriptWorldRevision(), json = JSON.stringify(changes), started = performance.now()
    this.scriptRuntime.apply_world_delta_json(this.playSessionIdentity, this.scriptWorldRevision, revision, json)
    this.scriptWorldRevision = revision
    for (const value of changes) this.scriptWorldSnapshots.set(value.uuid, value)
    this.scriptContextDiagnostics.deltas++; this.scriptContextDiagnostics.deltaRecords += changes.length; this.scriptContextDiagnostics.worldBytes += new TextEncoder().encode(json).byteLength; this.scriptContextDiagnostics.publishMs += performance.now() - started
  }

  /** 结构说明（自动提取）：ensureLifecycle；无显式参数；直接调用 captureAuthoredEntity、this.worldHost.state.world.entities.filter、awakened.has、awakened.add、runEntityFunction 等；写入 diagnostics.scripts；包含循环处理。 */ private ensureLifecycle(): void {
    this.invalidateScriptWorld()
    for (const entity of this.worldHost.state.world.entities) this.captureAuthoredEntity(entity, 'runtime-spawned')
    const scripted = this.worldHost.state.world.entities.filter(/* 调用 this.canRun(entity) 并返回调用结果。 */ entity => this.canRun(entity))
    this.diagnostics.scripts = scripted.length
    // 生命周期顺序必须由树结构决定，而不是由 entities 数组的存储顺序决定（§5.1）。
    // awake 近似"进入树"：父级先于子级。start 近似"就绪"：子级先于父级，因此用其逆序。
    const parentFirst = hierarchyOrder(scripted)
    for (const entity of parentFirst) {
      if (!this.awakened.has(entity.uuid)) {
        this.awakened.add(entity.uuid)
        this.runEntityFunction(entity, 'awake')
        this.runEventSheetHandlers(entity, 'awake', '', 'awake')
      }
    }
    for (const entity of [...parentFirst].reverse()) {
      if (!this.started.has(entity.uuid)) {
        this.started.add(entity.uuid)
        this.runEntityFunction(entity, 'start')
        this.runEventSheetHandlers(entity, 'start', '', 'start')
      }
    }
  }

  /** 结构说明（自动提取）：dispatchInputCallbacks；输入 snapshot；直接调用 emitSignal、this.worldHost.state.world.entities.filter、runEntityFunction、runEventSheetHandlers；包含循环处理。 */ private dispatchInputCallbacks(snapshot: InputSnapshot): void {
    this.invalidateScriptWorld()
    for (const action of this.worldHost.state.inputMap) {
      const phase = snapshot.performed[action.name] ? 'performed' : snapshot.cancelled[action.name] ? 'cancelled' : ''
      if (!phase) continue
      const occurrences = action.interaction === 'press' && phase === 'performed' ? Math.max(1, (snapshot.edges ?? []).filter(edge => edge.action === action.name && edge.down).length) : 1
      for (let index = 0; index < occurrences; index++) {
        this.emitSignal(`input.${action.name}.${phase}`, { action: action.name, phase, axis: snapshot.axes[action.name] ?? 0, vector: snapshot.vectors[action.name] ?? [0, 0], duration: snapshot.durations[action.name] ?? 0 }, '', 'input')
        if (action.callback) for (const entity of this.worldHost.state.world.entities.filter(candidate => this.canRun(candidate))) this.runEntityFunction(entity, action.callback)
      }
    }
    const orderedEdges = (snapshot.edges ?? []).filter(edge => this.worldHost.state.inputMap.some(action => action.name === edge.action && action.interaction === 'press'))
    const edgedActions = new Set(orderedEdges.map(edge => edge.action))
    for (const entity of this.worldHost.state.world.entities.filter(candidate => this.canRun(candidate))) {
      for (const edge of orderedEdges) this.runEventSheetHandlers(entity, edge.down ? 'input-pressed' : 'input-released', edge.action)
      for (const action of this.worldHost.state.inputMap) if (!edgedActions.has(action.name)) {
        if (snapshot.pressed[action.name]) this.runEventSheetHandlers(entity, 'input-pressed', action.name)
        if (snapshot.released[action.name]) this.runEventSheetHandlers(entity, 'input-released', action.name)
      }
    }
  }

  /** 结构说明（自动提取）：runPhase；输入 functionName；直接调用 runEntityFunction、runEventSheetHandlers；包含循环处理。 */ private runPhase(functionName: LifecycleFunction): void {
    this.invalidateScriptWorld()
    for (const entity of [...this.worldHost.state.world.entities]) {
      if (this.scriptDebugger.state.paused) break
      this.runEntityFunction(entity, functionName)
      if (functionName === 'update') this.runEventSheetHandlers(entity, 'update', '', 'update')
      else if (functionName === 'fixed_update') this.runEventSheetHandlers(entity, 'fixed-update', '', 'fixed_update')
    }
  }

  /** 结构说明（自动提取）：runEventSheetHandlers；输入 entity、kind、selector、canonicalCallback、contact、event、alreadyDispatched；直接调用 resolveAsset、Set、JSON.stringify、canRun、resolveEventHandlers 等；返回路径包含 dispatched；包含循环处理。 */ private runEventSheetHandlers(entity: Entity, kind: ObjectEventKind, selector = '', canonicalCallback = '', contact?: ScriptContact, event?: ScriptEvent, alreadyDispatched: readonly string[] = []): Set<string> {
    const reference = entity.script2D?.eventSheetAsset
    const primary = this.scriptServices.resolveAsset(entity.script2D?.scriptAsset)?.uuid
    const dispatched = new Set<string>([...alreadyDispatched, ...(canonicalCallback && primary ? [JSON.stringify([primary, canonicalCallback])] : [])])
    if (!reference || !this.canRun(entity)) return dispatched
    for (const handler of this.resolveEventHandlers(reference)) {
      if (handler.kind !== kind || (handler.selector && handler.selector !== selector)) continue
      const key = JSON.stringify([this.scriptServices.resolveAsset(handler.logicAsset)?.uuid ?? handler.sourceSheetAsset, handler.callback])
      if (dispatched.has(key)) continue
      dispatched.add(key)
      this.runEntityFunction(entity, handler.callback, contact, event, kind === 'destroy', handler.logicAsset, kind === 'destroy', eventCallbackFamily(kind))
    }
    return dispatched
  }

  /** 结构说明（自动提取）：runDestructionCallbacks；输入 entity、world；直接调用 runEntityFunction、runEventSheetHandlers；写入 callbackWorld。 */ private runDestructionCallbacks(entity: Entity, world?: Entity[]): void {
    const previous = this.callbackWorld
    if (world) this.callbackWorld = world
    this.invalidateScriptWorld()
    try { this.runEntityFunction(entity, 'on_destroy', undefined, undefined, true, undefined, true); this.runEventSheetHandlers(entity, 'destroy', '', 'on_destroy') }
    finally { this.callbackWorld = previous; this.invalidateScriptWorld() }
  }

  /** 结构说明（自动提取）：captureAuthoredEntity；输入 entity、origin；直接调用 authoredEntities.has、authoredEntities.set、this.worldHost.readEntityAuthoringData。 */ private captureAuthoredEntity(entity: Entity, origin: 'scene' | 'runtime-spawned'): void {
    if (!this.authoredEntities.has(entity.uuid)) this.authoredEntities.set(entity.uuid, { origin, data: this.worldHost.readEntityAuthoringData(entity) })
  }

  /** 结构说明（自动提取）：inspectObjectRuntime；输入 entityUuid；直接调用 this.worldHost.state.world.entities.find、authoredEntities.get、resolveAsset、Set、filter 等；包含循环处理。 */ inspectObjectRuntime(entityUuid: string) {
    const entity = this.worldHost.state.world.entities.find(/* 比较 candidate.uuid 与 entityUuid，返回严格相等的判断结果。 */ candidate => candidate.uuid === entityUuid), authored = this.authoredEntities.get(entityUuid)
    const primary = this.scriptServices.resolveAsset(entity?.script2D?.scriptAsset)?.uuid
    const behaviorIds = new Set([primary, ...(entity ? this.resolveEventHandlers(entity.script2D?.eventSheetAsset).map(/* 返回 this.scriptServices.resolveAsset(handler.logicAsset)?.uuid 的当前值。 */ handler => this.scriptServices.resolveAsset(handler.logicAsset)?.uuid) : [])].filter(/* 返回 !uuid 的逻辑取反结果。 */ (uuid): uuid is string => !!uuid))
    const storedScript = (authored?.data.components as Array<{ kind: string; data: { properties?: Record<string, ScriptPropertyValue> } }> | undefined)?.find(/* 比较 component.kind 与 'Script2D'，返回严格相等的判断结果。 */ component => component.kind === 'Script2D')
    const behaviors = [...behaviorIds].map(/** 结构说明（自动提取）：map 回调；输入 scriptUuid；直接调用 resolveAsset、Object.fromEntries、map、compiledExports.get、behaviorProperties.get；返回表达式求值结果。 */ scriptUuid => ({ scriptUuid, sourcePath: this.scriptServices.resolveAsset(scriptUuid)?.path ?? '', primary: scriptUuid === primary,
      authoredProperties: { ...Object.fromEntries((this.compiledExports.get(scriptUuid) ?? []).map(/* 返回按声明顺序构造的数组 [item.name, item.defaultValue ?? item.value]。 */ item => [item.name, item.defaultValue ?? item.value])), ...(scriptUuid === primary ? storedScript?.data.properties ?? {} : {}) },
      properties: scriptUuid === primary ? entity?.script2D?.properties ?? {} : this.behaviorProperties.get(`${entityUuid}:${scriptUuid}`) ?? {}
    }))
    const subscriptions: Array<{ sourceSheetAsset: string | null; scriptUuid: string; signal: string; callback: string; source: string; target: string }> = []
    if (this.active && entity && this.canRun(entity)) {
      const seen = new Set<string>()
      for (const handler of this.resolveEventHandlers(entity.script2D?.eventSheetAsset)) {
        if (!['signal', 'ui', 'animation', 'network'].includes(handler.kind)) continue
        const scriptUuid = this.scriptServices.resolveAsset(handler.logicAsset)?.uuid
        if (!scriptUuid || !this.declaredFunctions.get(scriptUuid)?.names.has(handler.callback)) continue
        const signal = handler.kind === 'signal' ? handler.selector : `${handler.kind}.${handler.selector}`
        const key = JSON.stringify([scriptUuid, signal, handler.callback, '', entityUuid]); if (seen.has(key)) continue; seen.add(key)
        subscriptions.push({ sourceSheetAsset: handler.sourceSheetAsset, scriptUuid, signal, callback: handler.callback, source: '', target: entityUuid })
      }
      for (const connection of this.scriptServices.resolveAsset(entity.script2D?.scriptAsset)?.script?.signalConnections ?? []) {
        if (!connection.enabled || !primary || !this.declaredFunctions.get(primary)?.names.has(connection.callback) || (connection.target && connection.target !== entityUuid)) continue
        const key = JSON.stringify([primary, connection.signal, connection.callback, connection.source || '', entityUuid]); if (seen.has(key)) continue; seen.add(key)
        subscriptions.push({ sourceSheetAsset: null, scriptUuid: primary, signal: connection.signal, callback: connection.callback, source: connection.source || '', target: entityUuid })
      }
    }
    return JSON.parse(JSON.stringify({ active: this.active, entityUuid, generation: entity && this.active ? this.worldGameplay.entityLifetimes.inspect(entity) : null, authoredOrigin: authored?.origin ?? null, authoredEntity: authored?.data ?? null, behaviors, subscriptions, timers: this.time.inspect(entityUuid) })) as {
      active: boolean; entityUuid: string; generation: number | null; authoredOrigin: 'scene' | 'runtime-spawned' | null; authoredEntity: Record<string, unknown> | null;
      behaviors: Array<{ scriptUuid: string; sourcePath: string; primary: boolean; authoredProperties: Record<string, ScriptPropertyValue>; properties: Record<string, ScriptPropertyValue> }>;
      subscriptions: typeof subscriptions; timers: ReturnType<RuntimeTime['inspect']>
    }
  }

  /** 结构说明（自动提取）：runEntityFunction；输入 entity、functionName、contact、event、bypassBreakpoint、logicAsset、duringDestruction、callbackKind；直接调用 canRun、isRemovalPending、destroying.has、resolveAsset、compiledSources.get 等；写入 source、declared、contractValidation、breakpoint.hitCount 等；包含循环处理。 */ private runEntityFunction(entity: Entity, functionName: LifecycleFunction | string, contact?: ScriptContact, event?: ScriptEvent, bypassBreakpoint = false, logicAsset?: string | null, duringDestruction = false, callbackKind?: string, debugResume?: ScriptDebugResume): void {
    const component = entity.script2D
    if (!this.canRun(entity) || !component) return
    if (!duringDestruction && functionName !== 'on_destroy' && (this.isRemovalPending(entity) || this.destroying.has(entity.uuid))) return
    const reference = logicAsset === undefined ? component.scriptAsset : logicAsset
    const asset = this.scriptServices.resolveAsset(reference)
    let source: string | null = null
    try { source = (this.active && asset ? this.compiledSources.get(asset.uuid) : null) ?? this.resolveScriptBundle(asset?.uuid ?? '') } catch (error) { this.reportScriptError(entity, this.errorMessage(error)); return }
    if (!asset || (asset.assetType !== 'script' && asset.assetType !== 'visualScript') || !source) {
      this.reportScriptError(entity, `Missing script or visual graph asset: ${reference ?? 'none'}`)
      return
    }
    let declared = this.declaredFunctions.get(asset.uuid)
    if (!declared || declared.source !== source) {
      declared = { source, names: new Set(Object.keys(analyzeScript(source).functions)), contract: parseScriptContract(source) }
      this.declaredFunctions.set(asset.uuid, declared)
    }
    // A timer-only script must not cross the WASM boundary for three absent
    // per-frame callbacks. Besides avoiding wasted work, this keeps Play
    // responsive on projects with many narrowly scoped scripts.
    const instanceGeneration = this.worldGameplay.entityLifetimes.generation(entity)
    const instanceKey = `${entity.uuid}:${instanceGeneration}:${asset.uuid}`
    const hasCallback = declared.names.has(functionName)
    if (!hasCallback && this.initializedScriptInstances.has(instanceKey)) return
    const enabledPackages = this.worldHost.readEnabledPackageIds()
    const contractSignature = `${JSON.stringify(declared.contract.contract)}:${declared.contract.apiUsage.map(/* 返回 value.name 的当前值。 */ value => value.name).join(',')}:${entity.components.map(/* 返回 value.kind 的当前值。 */ value => value.kind).sort().join(',')}:${this.worldHost.state.inputMap.map(/* 返回 value.name 的当前值。 */ value => value.name).sort().join(',')}:${this.scriptServices.revision()}:${enabledPackages.sort().join(',')}`
    const contractKey = `${entity.uuid}:${asset.uuid}`
    let contractValidation = this.contractValidations.get(contractKey)
    if (!contractValidation || contractValidation.signature !== contractSignature) {
      const availableAssets = this.scriptServices.listIdentities().flatMap(/* 返回按声明顺序构造的数组 [item.uuid, item.path]。 */ item => [item.uuid, item.path])
      const report = validateScriptContract(source, { components: entity.components.map(/* 返回 value.kind 的当前值。 */ value => value.kind), inputActions: this.worldHost.state.inputMap.map(/* 返回 value.name 的当前值。 */ value => value.name), assets: availableAssets, packages: enabledPackages })
      contractValidation = { signature: contractSignature, error: report.diagnostics.filter(/* 比较 item.severity 与 'error'，返回严格相等的判断结果。 */ item => item.severity === 'error').map(/** 按模板 `${item.code} line ${item.line}: ${item.message}` 生成并返回字符串。 */ item => `${item.code} line ${item.line}: ${item.message}`).join(' ') || null }
      this.contractValidations.set(contractKey, contractValidation)
    }
    if (contractValidation.error) { this.reportScriptError(entity, contractValidation.error); return }
    this.ensureScriptRuntime()
    if (!this.scriptRuntime) return
    const executionWorld = this.callbackWorld ?? this.worldHost.state.world.entities
    const runtimeTransform = worldTransform(entity, executionWorld)
    const primaryBehavior = this.scriptServices.resolveAsset(component.scriptAsset)?.uuid === asset.uuid
    const behaviorKey = `${entity.uuid}:${asset.uuid}`
    const context = {
      apiVersion: asset.script?.apiVersion ?? scriptProjectSettings.apiVersion,
      entity: entity.uuid,
      invocationId: ++this.invocationSerial,
      callbackKind: callbackKind ?? functionName,
      entityName: entity.name,
      components: entity.components.map(/* 返回 value.kind 的当前值。 */ value => value.kind),
      time: { ...this.time.value },
      randomSeed: Math.floor(this.replay.deterministicRandom() * 0x1_0000_0000),
      input: { ...this.inputSnapshot, prompts: this.inputPrompts },
      contact,
      event,
      properties: primaryBehavior ? component.properties : (this.behaviorProperties.get(behaviorKey) ?? {}),
      save: this.saves.saveSnapshot(),
      transform: {
        position: [runtimeTransform.position.x, runtimeTransform.position.y],
        rotation: runtimeTransform.rotation,
        scale: [runtimeTransform.scale.x, runtimeTransform.scale.y]
      },
      rigidBody: entity.hasComponent('RigidBody2D') ? {
        velocity: (/** 结构说明（自动提取）：匿名回调；无显式参数；直接调用 entity.getComponent。 */ () => { const character = entity.getComponent<CharacterBody2D>('CharacterBody2D'); return character ? [character.motionVelocity.x, character.motionVelocity.y] : [entity.velocity.x, entity.velocity.y] })(),
        angularVelocity: entity.angularVelocity,
        mass: entity.mass,
        bodyType: entity.isStatic ? 'Static' : entity.isKinematic ? 'Kinematic' : 'Dynamic'
      } : null,
      character: (/** 结构说明（自动提取）：匿名回调；无显式参数；直接调用 entity.getComponent、canUseCoyoteTime。 */ () => {
        const character = entity.getComponent<CharacterBody2D>('CharacterBody2D')
        return character ? {
          onFloor: character.onFloor, onWall: character.onWall, onCeiling: character.onCeiling,
          canCoyoteJump: this.worldGameplay.canUseCoyoteTime(entity), floorNormal: [character.floorNormal.x, character.floorNormal.y],
          wallNormal: [character.wallNormal.x, character.wallNormal.y], platformVelocity: [character.platformVelocity.x, character.platformVelocity.y],
          floorOneWay: character.floorOneWay
        } : null
      })(),
      animator: this.animationTimeline.animation.animatorSnapshot(entity),
      gameFlow: this.gameFlow.gameFlowSnapshot(),
      networking: this.productionNetwork.productionNetworkContext(),
      rhythm: { ...this.rhythm.snapshot(entity.getComponent('RhythmChart2D') ? entity.uuid : '', entity.uuid), calibrationMs: storedRhythmCalibration() }
    }
    // 26.44: Rhai scripts stop at lines (VM stack and locals) by re-running the callback up to the stop.
    const vmDebug = asset.assetType === 'script' && typeof (this.scriptRuntime as unknown as { execute_instance_debug_json?: unknown }).execute_instance_debug_json === 'function'
    let debugProbe: { breakLines: number[]; afterEvent: number; mode: DebugStepMode; depth: number } | null = null
    let debugPlan: { lines: ScriptBundleLines; details: ScriptBreakpoint[]; breakLine: (point: ScriptBreakpoint) => number; document: string } | null = null
    if (vmDebug && hasCallback && scriptProjectSettings.debuggerEnabled && this.scriptDebugger.state.enabled && (debugResume || !bypassBreakpoint && !this.scriptDebugger.state.paused)) {
      const debugSource = this.compiledDocuments.get(asset.uuid) ?? this.scriptServices.readSource(asset.uuid) ?? source
      const legacy = (asset.script?.breakpoints ?? []).map((line, index): ScriptBreakpoint => ({ id: `line-${line}-${index}`, line, functionName: '', condition: '', hitCondition: 0, logMessage: '', enabled: true, hitCount: 0 }))
      const details = (asset.script?.breakpointDetails?.length ? asset.script.breakpointDetails : legacy).filter(point => point.enabled)
      // 26.45: breakpoints on blocks of a Blocks script stop at the line the block compiles to.
      for (const point of blockBreakpointLines(debugSource)) details.push({ id: `block-${point.blockId}`, line: point.line, functionName: '', condition: '', hitCondition: 0, logMessage: '', enabled: true, hitCount: 0 })
      if (details.length || debugResume) {
        const { language, rich } = this.debugAnalysis(debugSource)
        // A function breakpoint stops at the first statement of that function; a line breakpoint at its line.
        const breakLine = (point: ScriptBreakpoint): number => {
          const fn = point.functionName ? language.functions[point.functionName] : undefined
          if (!fn) return point.line
          for (let line = fn.line; line <= fn.endLine; line++) if (statementAtLine(rich, line, point.functionName)) return line
          return fn.line
        }
        const lines = scriptBundleLines(source, asset.path)
        debugPlan = { lines, details, breakLine, document: debugSource }
        debugProbe = { breakLines: [...new Set(details.map(point => lines.toCompiled(breakLine(point))))], afterEvent: debugResume?.afterEvent ?? 0, mode: debugResume?.mode ?? 'continue', depth: debugResume?.depth ?? 0 }
      }
    } else if (hasCallback && !bypassBreakpoint && scriptProjectSettings.debuggerEnabled && this.scriptDebugger.state.enabled && !this.scriptDebugger.state.paused) {
      // 断点属于作者文档；模块打包可能插入前缀，不能使用生成源码的行号。
      const debugSource = this.compiledDocuments.get(asset.uuid) ?? this.scriptServices.readSource(asset.uuid) ?? source
      const { language, rich } = this.debugAnalysis(debugSource), fn = language.functions[functionName]
      const legacy = (asset.script?.breakpoints ?? []).map(/** 构造并返回记录 { id: `line-${line}-${index}`, line, functionName: '', condition: '', hitCondition: 0, logMessage: '', enabled: true, hitCount: 0 }，字段按当前实参及捕获状态求值。 */ (line, index): ScriptBreakpoint => ({ id: `line-${line}-${index}`, line, functionName: '', condition: '', hitCondition: 0, logMessage: '', enabled: true, hitCount: 0 }))
      const details = asset.script?.breakpointDetails?.length ? asset.script.breakpointDetails : legacy
      const breakpoint = details.find(/** 结构说明（自动提取）：details.find 回调；输入 point；直接调用 Boolean、statementAtLine；返回表达式求值结果。 */ point => point.enabled && fn && point.line >= fn.line && point.line <= fn.endLine && Boolean(statementAtLine(rich, point.line, functionName)) && (!point.functionName || point.functionName === functionName))
      if (breakpoint) {
        const hitCount = this.recordScriptDebugHit(asset.uuid, debugSource, details.indexOf(breakpoint), breakpoint, !!asset.script?.breakpointDetails?.length)
        let condition = hitCount !== null
        try { if (hitCount !== null && breakpoint.condition.trim()) condition = Boolean(evaluateDebugExpression(breakpoint.condition, context)) } catch (error) {
          this.worldHost.log(`Breakpoint condition error at ${asset.path}:${breakpoint.line}: ${this.errorMessage(error)}`, 'Script', 'error', asset.uuid); condition = false
        }
        if (hitCount !== null && breakpoint.hitCondition > 0 && hitCount < breakpoint.hitCondition) condition = false
        if (condition && breakpoint.logMessage.trim()) {
          this.worldHost.log(this.formatLogpoint(breakpoint.logMessage, context), 'Script', 'debug', asset.uuid)
          condition = false
        }
        if (condition) {
        this.pendingDebugInvocation = { entityUuid: entity.uuid, scriptUuid: asset.uuid, functionName, contact, event, logicAsset, callbackKind }
        this.worldHost.state.playMode = 'paused'
        this.scriptDebugger.pauseScriptDebugger({ entityUuid: entity.uuid, entityName: entity.name, scriptUuid: asset.uuid, sourcePath: asset.path, sourceRevision: debugSourceRevision(debugSource), functionName, line: breakpoint.line, depth: 0 }, context, `Callback-entry breakpoint requested at ${asset.path}:${breakpoint.line} · hit ${hitCount}; VM statements have not been suspended`)
        this.worldHost.log(`Paused at ${asset.path}:${breakpoint.line}`, 'Script', 'debug', asset.uuid)
        return
        }
      }
    }
    const started = performance.now()
    try {
      this.ensureCompiled(asset.uuid, source)
      const revision = this.ensureScriptWorld(executionWorld), callbackJson = JSON.stringify(context), callbackStarted = performance.now()
      let execution: ScriptExecution
      if (debugProbe && debugPlan) {
        const debugRuntime = this.scriptRuntime as unknown as { execute_instance_debug_json(id: string, fn: string, epoch: number, revision: number, generation: number, context: string, probe: string): string }
        let probe = debugProbe, completed: ScriptExecution | null = null
        for (let attempt = 0; attempt < 1_000; attempt++) {
          const raw = debugRuntime.execute_instance_debug_json(asset.uuid, functionName, this.playSessionIdentity, revision, instanceGeneration, callbackJson, JSON.stringify(probe))
          const pause = (JSON.parse(raw) as { pause?: ScriptDebugPauseRecord }).pause
          if (!pause) { completed = parseScriptExecution(raw, declared.contract.contract.budgets); break }
          const at = debugPlan.lines.locate(pause.line)
          const locals: Record<string, unknown> = Object.fromEntries(pause.locals.map(local => [local.name, local.value]))
          // A breakpoint's condition, hit count and log message decide whether this stop is kept.
          const point = at.root ? debugPlan.details.find(candidate => debugPlan!.breakLine(candidate) === at.line) : undefined
          if (point && probe.mode !== 'into') {
            const index = debugPlan.details.indexOf(point)
            // Block breakpoints (26.45) live in the Blocks document, not in the asset's breakpoint list.
            const allDetails = !point.id.startsWith('block-') && asset.script?.breakpointDetails?.length ? asset.script.breakpointDetails : null
            const hitCount = this.recordScriptDebugHit(asset.uuid, debugPlan.document, allDetails ? allDetails.indexOf(point) : index, point, !!allDetails)
            let stop = hitCount !== null
            const scope = { ...context, ...locals }
            try { if (stop && point.condition.trim()) stop = Boolean(evaluateDebugExpression(point.condition, scope)) } catch (error) {
              this.worldHost.log(`Breakpoint condition error at ${asset.path}:${point.line}: ${this.errorMessage(error)}`, 'Script', 'error', asset.uuid); stop = false
            }
            if (stop && hitCount !== null && point.hitCondition > 0 && hitCount < point.hitCondition) stop = false
            if (stop && point.logMessage.trim()) { this.worldHost.log(this.formatLogpoint(point.logMessage, scope), 'Script', 'debug', asset.uuid); stop = false }
            const stepStop = probe.mode === 'over' ? pause.depth <= probe.depth : probe.mode === 'out' ? pause.depth < probe.depth : false
            if (!stop && !stepStop) { probe = { ...probe, afterEvent: pause.event }; continue }
          }
          this.pendingDebugInvocation = { entityUuid: entity.uuid, scriptUuid: asset.uuid, functionName, contact, event, logicAsset, callbackKind, resume: { afterEvent: pause.event, depth: pause.depth } }
          this.worldHost.state.playMode = 'paused'
          const frames: DebugFrame[] = []
          let line = pause.line
          const stack = pause.stack.length ? pause.stack : [{ function: functionName, line: 0 }]
          for (let index = stack.length - 1; index >= 0; index--) {
            const where = debugPlan.lines.locate(line)
            const module = where.root ? null : this.scriptServices.resolveModuleAsset(where.path)
            frames.push({ entityUuid: entity.uuid, entityName: entity.name, scriptUuid: module?.uuid ?? asset.uuid, sourcePath: where.path, sourceRevision: debugSourceRevision(where.root ? debugPlan.document : this.scriptServices.readSource(module?.uuid ?? '') ?? ''), functionName: stack[index].function, line: where.line, depth: index })
            line = stack[index].line
          }
          const reason = probe.mode === 'continue' ? `Breakpoint at ${frames[0].sourcePath}:${frames[0].line}` : `Step ${probe.mode} stopped at ${frames[0].sourcePath}:${frames[0].line}`
          this.scriptDebugger.pauseScriptDebugger(frames[0], locals, `${reason} · the callback re-runs to this line; nothing of the stopped run was applied`, frames)
          this.worldHost.log(`Paused at ${frames[0].sourcePath}:${frames[0].line}`, 'Script', 'debug', asset.uuid)
          return
        }
        if (!completed) throw new Error('Script debugger: too many breakpoint hits in one callback (1000).')
        execution = completed
      } else execution = parseScriptExecution(this.scriptRuntime.execute_instance_context_json(asset.uuid, hasCallback ? functionName : '', this.playSessionIdentity, revision, instanceGeneration, callbackJson), declared.contract.contract.budgets)
      this.scriptContextDiagnostics.callbackBytes += new TextEncoder().encode(callbackJson).byteLength
      this.scriptContextDiagnostics.callbackMs += performance.now() - callbackStarted
      this.initializedScriptInstances.add(instanceKey)
      if (hasCallback && scriptProjectSettings.testing.coverageEnabled) recordScriptCoverage(asset.uuid, source, functionName)
      if (primaryBehavior) component.properties = execution.properties
      else this.behaviorProperties.set(behaviorKey, execution.properties)
      component.lastError = null
      if (hasCallback) this.diagnostics.lifecycleCalls++
      for (const log of execution.logs) this.worldHost.log(`${entity.name}: ${log.message}`, 'Script', log.level === 'error' ? 'error' : log.level === 'warning' ? 'warning' : 'info')
      this.processScriptCommands(entity, asset.uuid, asset.path, functionName, execution.commands, 0, !duringDestruction)
    } catch (error) {
      const message = this.errorMessage(error)
      this.reportScriptError(entity, message)
      if (asset.assetType === 'visualScript') this.graphDebug.recordGraphError(this.graphDebug.state.activeGraphUuid || asset.uuid, this.graphDebug.state.activeNodeUuid, message)
      if (!duringDestruction && scriptProjectSettings.debuggerEnabled && scriptProjectSettings.breakOnRuntimeError && scriptProjectSettings.exceptionPolicy !== 'never') {
        this.worldHost.state.playMode = 'paused'
        this.scriptDebugger.pauseScriptDebugger({ entityUuid: entity.uuid, entityName: entity.name, scriptUuid: asset.uuid, sourcePath: asset.path, sourceRevision: debugSourceRevision(this.compiledDocuments.get(asset.uuid) ?? source), functionName, line: analyzeScript(this.compiledDocuments.get(asset.uuid) ?? source).functions[functionName]?.line ?? 1, depth: 0 }, context, `Runtime error: ${this.errorMessage(error)}`)
      }
    } finally {
      if (shouldRecordScriptFunction()) recordScriptFunction(asset.uuid, asset.name, functionName, performance.now() - started, source.length * 2 + JSON.stringify(context.properties).length)
    }
  }

  /** 结构说明（自动提取）：processScriptCommands；输入 entity、scriptUuid、sourcePath、functionName、commands、startIndex、allowPause；直接调用 Math.max、applyCommand、recordGraphTrace、this.worldHost.log、clearGraphPause 等；写入 pendingGraphExecution、this.worldHost.state.playMode；包含循环处理。 */ private processScriptCommands(entity: Entity, scriptUuid: string, sourcePath: string, functionName: string, commands: ScriptCommand[], startIndex = 0, allowPause = true): boolean {
    for (let index = Math.max(0, startIndex); index < commands.length; index++) {
      const command = commands[index]
      if (command.type !== 'graphTrace') {
        this.applyCommand(entity, command)
        continue
      }
      const decision = this.graphDebug.recordGraphTrace(command)
      if (decision.logMessage) this.worldHost.log(`${entity.name}: ${decision.logMessage}`, 'Script', 'debug', scriptUuid)
      if (decision.pause && (!allowPause || !scriptProjectSettings.debuggerEnabled || !this.scriptDebugger.state.enabled)) { this.graphDebug.clearGraphPause(); continue }
      if (!decision.pause) continue
      this.pendingGraphExecution = { entityUuid: entity.uuid, scriptUuid, sourcePath, functionName, commands, nextIndex: index + 1 }
      this.worldHost.state.playMode = 'paused'
      this.scriptDebugger.pauseScriptDebugger({ entityUuid: entity.uuid, entityName: entity.name, scriptUuid, sourcePath, sourceRevision: debugSourceRevision(this.compiledSources.get(scriptUuid) ?? ''), functionName, line: 1, depth: command.depth }, command.values && typeof command.values === 'object' ? command.values as Record<string, unknown> : {}, decision.reason)
      this.worldHost.log(`Paused at visual node ${command.nodeUuid}`, 'Script', 'debug', scriptUuid)
      return false
    }
    return true
  }

  /** 结构说明（自动提取）：applyCommand；输入 entity、command；直接调用 entity.hasComponent、finite、worldTransform、this.worldHost.state.world.teleport、setWorldTransform 等；写入 entity.velocity.x、entity.velocity.y、entity.velocity、entity.angularVelocity 等。 */ private applyCommand(entity: Entity, command: Exclude<ScriptCommand, GraphTraceCommand>): void {
    const finite = /* 调用 finiteNumber(value, 0) 并返回调用结果。 */ (value: number) => finiteNumber(value, 0)
    if (command.type === 'applyForce' && entity.hasComponent('RigidBody2D') && entity.mass > 0 && !entity.isStatic && !entity.isKinematic) {
      entity.velocity.x += finite(command.x) / entity.mass * this.time.value.fixedDelta
      entity.velocity.y += finite(command.y) / entity.mass * this.time.value.fixedDelta
    } else if (command.type === 'applyImpulse' && entity.hasComponent('RigidBody2D') && entity.mass > 0 && !entity.isStatic && !entity.isKinematic) {
      entity.velocity.x += finite(command.x) / entity.mass
      entity.velocity.y += finite(command.y) / entity.mass
    } else if (command.type === 'setVelocity' && entity.hasComponent('RigidBody2D')) {
      entity.velocity = { x: finite(command.x), y: finite(command.y) }
    } else if (command.type === 'setPosition') {
      const transform = worldTransform(entity, this.worldHost.state.world.entities)
      this.worldHost.state.world.teleport(entity, { x: finite(command.x), y: finite(command.y) }, transform.rotation)
    } else if (command.type === 'setRotation') {
      const transform = worldTransform(entity, this.worldHost.state.world.entities)
      this.worldHost.state.world.teleport(entity, transform.position, finite(command.radians))
    } else if (command.type === 'setScale') {
      const transform = worldTransform(entity, this.worldHost.state.world.entities)
      setWorldTransform(entity, { ...transform, scale: { x: finite(command.x), y: finite(command.y) } }, this.worldHost.state.world.entities)
    } else if (command.type === 'setAngularVelocity' && entity.hasComponent('RigidBody2D')) {
      entity.angularVelocity = finite(command.radiansPerSecond)
    } else if (command.type === 'moveCharacter') {
      this.worldGameplay.queueCharacterMotion(entity, { x: finite(command.x), y: finite(command.y) })
    } else if (command.type === 'animatorSetBool') {
      const animator = entity.getComponent<Animator>('Animator'); if (animator) this.animationTimeline.animation.setAnimatorParameter(animator, command.name, command.value)
    } else if (command.type === 'animatorSetFloat') {
      const animator = entity.getComponent<Animator>('Animator'); if (animator) this.animationTimeline.animation.setAnimatorParameter(animator, command.name, finite(command.value))
    } else if (command.type === 'animatorSetInteger') {
      const animator = entity.getComponent<Animator>('Animator'); if (animator) this.animationTimeline.animation.setAnimatorParameter(animator, command.name, Math.round(finite(command.value)))
    } else if (command.type === 'animatorTrigger') {
      const animator = entity.getComponent<Animator>('Animator'); if (animator) this.animationTimeline.animation.setAnimatorParameter(animator, command.name, true)
    } else if (command.type === 'animatorCrossfade') {
      this.animationTimeline.animation.crossfade(entity, command.state, finite(command.seconds))
    } else if (command.type === 'characterDropThrough') {
      this.worldHost.state.world.dropThroughOneWay(entity, finite(command.seconds))
    } else if (command.type === 'targetJointMove') {
      // 26.45: a script-driven target joint; the first move adds one (starting at the new point).
      let target = entity.getComponent<TargetJoint2D>('TargetJoint2D')
      if (!target) { const created = new TargetJoint2D(); created.startAtBody = false; target = entity.addComponent(created) }
      target.enabled = true
      target.target = { x: finite(command.x), y: finite(command.y) }
    } else if (command.type === 'targetJointRelease') {
      const target = entity.getComponent<TargetJoint2D>('TargetJoint2D'); if (target) target.enabled = false
    } else if (command.type === 'inputRebind') {
      this.pendingRebind = { action: String(command.action ?? '').trim().slice(0, 120), index: Math.max(0, Math.min(31, Math.round(finite(command.index)))), entityUuid: entity.uuid }
      this.input.beginBindingCapture()
    } else if (command.type === 'inputBindingsReset') {
      if (this.inputRemapSink) this.inputRemapSink.reset()
      else this.worldHost.log('input_bindings_reset: the editor keeps the project bindings (the Player resets the player\'s own)', 'Script', 'info', entity.uuid)
    } else if (command.type === 'cameraShake' || command.type === 'cameraZoom' || command.type === 'cameraFollow') {
      const camera = this.scriptCamera(entity)
      if (!camera) { this.worldHost.log(`${command.type === 'cameraShake' ? 'camera_shake' : command.type === 'cameraZoom' ? 'camera_zoom' : 'camera_follow'}: there is no active camera`, 'Script', 'warning', entity.uuid); return }
      if (command.type === 'cameraShake') {
        // Reduced motion (accessibility) keeps a quarter of the shake.
        const scale = this.presentation.state.accessibility.reducedMotion ? .25 : 1
        camera.trauma = Math.min(1, Math.max(0, finite(camera.trauma ?? 0) + Math.max(0, finite(command.amount)) * scale))
      } else if (command.type === 'cameraZoom') camera.zoom = Math.min(100, Math.max(.01, finite(command.zoom) || 1))
      else camera.followTargetUuid = command.target && this.worldHost.state.world.entities.some(candidate => candidate.uuid === command.target) ? command.target : null
    } else if (command.type === 'screenFlash') {
      const seconds = Math.min(10, Math.max(0, finite(command.seconds)))
      if (seconds > 0 && !this.presentation.state.accessibility.reducedMotion) this.screenFlash = { r: finite(command.r), g: finite(command.g), b: finite(command.b), seconds, remaining: seconds }
    } else if (command.type === 'setSurfaceSpeed') {
      const collider = entity.getCollider(); if (collider) collider.surfaceSpeed = finite(command.speed)
    } else if ((command.type === 'tween' || command.type === 'tweenStop') && command.target) {
      this.pendingDynamicCommands.push({ ...this.commandSource(entity), command })
    } else if (command.type === 'tween') {
      this.startTween(entity, command)
    } else if (command.type === 'tweenStop') {
      this.tweens.stop(entity, command.property)
    } else if (command.type === 'animatorPlay') {
      const animator = entity.getComponent<Animator>('Animator'); if (animator) animator.currentState = command.state.trim().slice(0, 80)
    } else if (command.type === 'audioPlay') this.audio.play(entity, this.worldHost.state.world.entities)
    else if (command.type === 'audioPause') this.audio.pause(entity)
    else if (command.type === 'audioStop') this.audio.stop(entity)
    else if (command.type === 'destroy') this.queueEntityRemoval(entity, false)
    else if (command.type === 'despawn') this.queueEntityRemoval(entity, true)
    else if (command.type === 'instantiate') {
      const transform = worldTransform(entity, this.worldHost.state.world.entities)
      this.pendingPrefabs.push({ ...this.commandSource(entity), reference: command.prefab, position: { ...transform.position } })
    } else if (command.type === 'spawnAt' || command.type === 'targetSetPosition' || command.type === 'targetSetRotation' || command.type === 'targetSetScale' || command.type === 'targetSetEnabled' || command.type === 'targetSetComponentEnabled' || command.type === 'targetSetUiText' || command.type === 'targetSetUiValue' || command.type === 'targetAddTag' || command.type === 'targetRemoveTag' || command.type === 'targetAddGroup' || command.type === 'targetRemoveGroup' || command.type === 'targetDestroy') this.pendingDynamicCommands.push({ ...this.commandSource(entity), command })
    else if (command.type === 'loadScene') this.pendingScene = { type: 'load', identifier: command.scene }
    else if (command.type === 'reloadScene') this.pendingScene = { type: 'reload' }
    else if (command.type === 'quit') this.quitRequested = true
    else if (command.type === 'gamePause') this.gameFlow.setGamePaused(command.paused)
    else if (command.type === 'checkpointSet') { if (!this.gameFlow.setRuntimeCheckpoint(command.name)) this.worldHost.log('Checkpoint requires a non-empty name', 'Runtime', 'error') }
    else if (command.type === 'checkpointRestore') { if (!this.gameFlow.restoreRuntimeCheckpoint(command.name)) this.worldHost.log(`Checkpoint restore failed: ${command.name}`, 'Runtime', 'error') }
    else if (command.type === 'scoreSet') this.gameFlow.setRuntimeScore(command.value)
    else if (command.type === 'scoreAdd') this.gameFlow.addRuntimeScore(command.value)
    else if (command.type === 'sessionSet') { if (!this.gameFlow.setSessionValue(command.key, command.value)) this.worldHost.log(`Session value rejected: ${command.key}`, 'Runtime', 'error') }
    else if (command.type === 'inputContextPush') { if (!this.input.pushContext(command.name, command.priority, command.consume)) this.worldHost.log(`Input context rejected: ${command.name}`, 'Input', 'error') }
    else if (command.type === 'inputContextPop') { if (!this.input.popContext(command.name)) this.worldHost.log(`Input context is not active: ${command.name}`, 'Input', 'warning') }
    else if (command.type === 'inputMapEnable') { if (!this.input.enableMap(command.name)) this.worldHost.log(`Input map rejected: ${command.name}`, 'Input', 'error') }
    else if (command.type === 'inputMapDisable') { if (!this.input.disableMap(command.name)) this.worldHost.log(`Input map cannot be disabled: ${command.name}`, 'Input', 'warning') }
    else if (command.type === 'inputSchemeSet') { if (!this.input.setScheme(command.name)) this.worldHost.log('Input scheme requires a name', 'Input', 'error') }
    else if (command.type === 'startTimer') { if (!this.time.start(entity.uuid, command.name, command.seconds, command.repeat)) this.worldHost.log(`${entity.name}: timer rejected by name, duration or queue limit`, 'Script', 'error') }
    else if (command.type === 'pauseTimer') this.time.pause(entity.uuid, command.name)
    else if (command.type === 'resumeTimer') this.time.resume(entity.uuid, command.name)
    else if (command.type === 'cancelTimer') this.time.cancel(entity.uuid, command.name)
    else if (command.type === 'startTask') { const accepted = this.time.startTask(entity.uuid, command.name, command.seconds); this.scriptDebugger.updateDebugTask({ id: `${entity.uuid}:${command.name}`, name: command.name, state: accepted ? 'waiting' : 'failed', entityUuid: entity.uuid, detail: accepted ? `Waiting ${command.seconds.toFixed(3)} s` : 'Task rejected by name, duration or queue limit' }) }
    else if (command.type === 'cancelTask') { this.time.cancelTask(entity.uuid, command.name); this.scriptDebugger.updateDebugTask({ id: `${entity.uuid}:${command.name}`, name: command.name, state: 'cancelled', entityUuid: entity.uuid, detail: 'Cancelled by script' }) }
    else if (command.type === 'emitSignal') this.emitSignal(command.name, command.payload, command.target, entity.uuid)
    else if (command.type === 'callFunction') this.queueScriptCall(entity, { kind: 'entity', handle: { id: command.target, generation: command.generation } }, command.function, command.args)
    else if (command.type === 'callGlobal') this.queueScriptCall(entity, { kind: 'global', name: command.name }, command.function, command.args)
    else if (command.type === 'callGroup') this.queueScriptCall(entity, { kind: 'group', group: command.group }, command.function, command.args)
    else if (command.type === 'callLater') {
      const name = `call:${command.function}#${++this.callLaterSerial}`
      if (this.time.startTask(entity.uuid, name, command.seconds)) this.laterCalls.set(`${entity.uuid}\u0000${name}`, { function: command.function, args: Array.isArray(command.args) ? command.args : [], source: entity.uuid })
      else this.worldHost.log(`${entity.name}: after(${command.seconds}, "${command.function}") rejected by the timer queue limit`, 'Script', 'error')
    }
    else if (command.type === 'playSound') { if (!this.audio.playScriptSound(this.resolveMediaReference(command.asset), { bus: command.bus, volume: command.volume, pitch: command.pitch, loop: command.looped, tag: command.tag })) this.reportCallIssue(`sound:${command.asset}`, `${entity.name}: play_sound could not play “${command.asset}” (missing audio asset, voice limit or no audio output)`) }
    else if (command.type === 'stopSounds') this.audio.stopScriptSounds(command.tag, command.fade)
    else if (command.type === 'playMusic') { if (!this.audio.playMusic(this.resolveMediaReference(command.asset), { fade: command.fade, volume: command.volume })) this.reportCallIssue(`music:${command.asset}`, `${entity.name}: play_music could not play “${command.asset}” (missing audio asset or no audio output)`) }
    else if (command.type === 'stopMusic') this.audio.stopMusic(command.fade)
    else if (command.type === 'setBusVolume') { if (!this.audio.setBusVolume(command.bus, command.volume)) this.reportCallIssue(`bus:${command.bus}`, `${entity.name}: set_bus_volume: unknown mixer bus “${command.bus}”`) }
    else if (command.type === 'playVideo') this.video.play(command.asset, { skippable: command.skippable, volume: command.volume, loop: command.looped }, entity.uuid)
    else if (command.type === 'stopVideo') this.video.stop()
    else if (command.type === 'postSet' || command.type === 'postPulse') {
      if (!isScriptPostValue(command.name)) this.reportCallIssue(`post:${command.name}`, `${entity.name}: post_${command.type === 'postSet' ? 'set' : 'pulse'}: unknown value “${command.name}” (use exposure, contrast, saturation, vignette, bloom or blur)`)
      else if (command.type === 'postSet') setScriptPostValue(command.name, command.value, command.seconds)
      else pulseScriptPostValue(command.name, command.amount, command.seconds)
    }
    else if (command.type === 'postReset') clearScriptPostValues()
    else if (command.type === 'jointServo') {
      const joints = [...entity.componentMap.values()].filter(component => component.kind === 'RevoluteJoint2D' || component.kind === 'PrismaticJoint2D') as Joint2D[]
      if (!joints.length) this.reportCallIssue(`servo:${entity.uuid}`, `${entity.name}: joint_servo needs a revolute or prismatic joint on this object`)
      for (const joint of joints) { joint.servoEnabled = command.enabled; if (command.enabled) joint.servoTarget = finiteNumber(command.target, 0); else { joint.motorSpeed = 0; joint.motorEnabled = false } }
    }
    else if (command.type === 'explode') this.explode(entity, command.x, command.y, command.radius, command.impulse)
    else if (command.type === 'rhythm') {
      if (command.action === 'calibration') storeRhythmCalibration(command.value)
      else if (command.action === 'visual') this.rhythm.command('', 'visual', command.value)
      else if (!['play', 'pause', 'resume', 'stop', 'restart', 'seek', 'offset', 'autoplay', 'speed'].includes(command.action) || !this.rhythm.command(entity.getComponent('RhythmChart2D') ? entity.uuid : '', command.action as RhythmCommandAction, command.value)) {
        if (command.action !== 'pause' && command.action !== 'resume') this.reportCallIssue(`rhythm:${command.action}`, `${entity.name}: rhythm_${command.action} has no RhythmChart2D to act on (add one to the scene)`)
      }
    }
    else if (command.type === 'rhythmJudge') {
      // 26.47: a judgement for a note that is no longer waiting (judged already, or passed) is ignored quietly:
      // scripts often judge on a touch and again on a timer.
      this.rhythm.judge(entity.getComponent('RhythmChart2D') ? entity.uuid : entity.uuid, Math.round(finiteNumber(command.note, -1)), command.judgement, finiteNumber(command.offsetMs, 10_000))
    }
    else if (command.type === 'saveSet') this.saves.setSaveValue(command.key, command.value)
    else if (command.type === 'saveDelete') this.saves.deleteSaveValue(command.key)
    else if (command.type === 'saveClear') this.saves.clearSaveValues()
    else if (command.type === 'saveLoad') this.saves.loadSaveSlot(command.slot)
    else if (command.type === 'saveCommit' && !this.saves.commitSaveSlot(command.slot)) this.worldHost.log('Save commit failed', 'Save', 'error')
    else if (command.type === 'uiSetText') {
      const text = entity.getComponent<UIText>('Text') ?? entity.getComponent<TextRenderer2D>('TextRenderer2D')
      if (text) text.text = command.text
      else this.worldHost.log(`${entity.name}: ui_set_text requires Text or TextRenderer2D`, 'Script', 'error', entity.script2D?.scriptAsset ?? undefined)
    } else if (command.type === 'uiSetValue') {
      const slider = entity.getComponent<Slider>('Slider'), progress = entity.getComponent<ProgressBar>('ProgressBar'), checkbox = entity.getComponent<Checkbox>('Checkbox')
      if (slider) slider.value = Math.min(slider.max, Math.max(slider.min, finite(command.value)))
      else if (progress) progress.value = Math.min(progress.max, Math.max(progress.min, finite(command.value)))
      else if (checkbox) checkbox.checked = finite(command.value) >= .5
      else this.worldHost.log(`${entity.name}: ui_set_value requires Slider, ProgressBar, or Checkbox`, 'Script', 'error', entity.script2D?.scriptAsset ?? undefined)
    } else if (command.type === 'navigationSetTarget') {
      const agent = entity.getComponent<NavigationAgent2D>('NavigationAgent2D')
      if (agent) { agent.targetPosition = { x: finite(command.x), y: finite(command.y) }; agent.targetEntityUuid = null; agent.pathStatus = 'Idle'; agent.path = []; agent.pathIndex = 0 }
      else this.worldHost.log(`${entity.name}: navigation_set_target requires NavigationAgent2D`, 'Script', 'error', entity.script2D?.scriptAsset ?? undefined)
    } else if (command.type === 'networkRpc' && !this.productionNetwork.callProductionRpc(command.name, command.payload)) this.worldHost.log(`${entity.name}: network_rpc rejected by permission, connection, authority, schema, or rate policy`, 'Runtime', 'error', entity.script2D?.scriptAsset ?? undefined)
    normalizeEntity(entity)
    if (command.type === 'setPosition' || command.type === 'setRotation' || command.type === 'setScale') this.publishScriptTransformWrite(entity)
    if (command.type === 'checkpointRestore') this.invalidateScriptWorld()
  }

  /** 结构说明（自动提取）：flushDynamicCommands；无显式参数；直接调用 pendingDynamicCommands.splice、commandSourceActive、spawnRuntimePrefab、this.worldHost.log、next 等；写入 spawned、mutation；包含循环处理。 */ private flushDynamicCommands(): void {
    let spawned = false
    const batch = this.pendingDynamicCommands.splice(0, MAX_SCRIPT_BRIDGE_COMMANDS)
    for (const entry of batch) {
      if (!this.commandSourceActive(entry)) continue
      const { sourceUuid, command } = entry
      if (command.type === 'spawnAt') {
        const root = this.worldGameplay.dynamicObjectsOwner.spawnRuntimePrefab(command.prefab, { position: { x: command.x, y: command.y }, rotation: command.rotation, scale: { x: command.scaleX, y: command.scaleY } }, false)
        if (!root) { this.worldHost.log(`Spawn failed for ${command.prefab} (requested by ${sourceUuid})`, 'Runtime', 'error'); continue }
        spawned = true
        if (this.pendingHandleResolutions.size >= 10_000) { const oldest = this.pendingHandleResolutions.keys().next().value; if (oldest) this.pendingHandleResolutions.delete(oldest) }
        this.pendingHandleResolutions.set(command.pendingId, { uuid: root.uuid, generation: this.worldGameplay.entityLifetimes.generation(root) })
        this.emitSignal('entity.spawned', { entity: root.uuid, pending: command.pendingId }, root.uuid, sourceUuid)
        continue
      }
      if (!('target' in command) || !('generation' in command)) continue
      const handle: RuntimeEntityHandle = { id: command.target, generation: command.generation }
      const target = this.worldGameplay.dynamicObjectsOwner.resolveRuntimeHandle(handle, this.pendingHandleResolutions); if (!target) continue
      if (this.isRemovalPending(target)) continue
      let mutation: TargetMutation | null = null
      if (command.type === 'targetSetPosition') mutation = { type: 'position', x: command.x, y: command.y }
      else if (command.type === 'targetSetRotation') mutation = { type: 'rotation', radians: command.radians }
      else if (command.type === 'targetSetScale') mutation = { type: 'scale', x: command.x, y: command.y }
      else if (command.type === 'targetSetEnabled') mutation = { type: 'enabled', enabled: command.enabled }
      else if (command.type === 'targetSetComponentEnabled') mutation = { type: 'componentEnabled', component: command.component, enabled: command.enabled }
      else if (command.type === 'targetSetUiText') mutation = { type: 'uiText', text: command.text }
      else if (command.type === 'targetSetUiValue') mutation = { type: 'uiValue', value: command.value }
      else if (command.type === 'targetAddTag' || command.type === 'targetRemoveTag') mutation = { type: command.type === 'targetAddTag' ? 'addTag' : 'removeTag', value: command.tag }
      else if (command.type === 'targetAddGroup' || command.type === 'targetRemoveGroup') mutation = { type: command.type === 'targetAddGroup' ? 'addGroup' : 'removeGroup', value: command.group }
      else if (command.type === 'targetDestroy') { this.queueEntityRemoval(target, false); continue }
      else if (command.type === 'tween') { this.startTween(target, command); continue }
      else if (command.type === 'tweenStop') { this.tweens.stop(target, command.property); continue }
      if (mutation) this.worldGameplay.dynamicObjectsOwner.applyTargetMutation(target, mutation)
    }
    if (spawned) {this.worldHost.state.world.invalidateRuntime();this.animationTimeline.markMembershipDirty()}
    const living = new Set(this.worldHost.state.world.entities.map(/* 返回 entity.uuid 的当前值。 */ entity => entity.uuid))
    for (const [pending, resolved] of this.pendingHandleResolutions) if (!living.has(resolved.uuid)) this.pendingHandleResolutions.delete(pending)
  }

  /** 构造并返回记录 { sourceUuid: entity.uuid, sourceGeneration: entityLifetimeGeneration(entity), allowRetiredSource: this.destroying.has(entity.uuid) }，字段按当前实参及捕获状态求值。 */ private commandSource(entity: Entity) { return { sourceUuid: entity.uuid, sourceGeneration: this.worldGameplay.entityLifetimes.generation(entity), allowRetiredSource: this.destroying.has(entity.uuid) } }
  /** 结构说明（自动提取）：commandSourceActive；输入 source；直接调用 this.worldHost.state.world.entities.some。 */ private commandSourceActive(source: { sourceUuid: string; sourceGeneration: number; allowRetiredSource: boolean }): boolean {
    return source.allowRetiredSource || this.worldHost.state.world.entities.some(/* 先计算 entity.uuid === source.sourceUuid；仅当其为真值时求右侧 inspectEntityLifetimeGeneration(entity) === source.sourceGeneration，返回短路求值结果。 */ entity => entity.uuid === source.sourceUuid && this.worldGameplay.entityLifetimes.inspect(entity) === source.sourceGeneration)
  }
  /** 26.44: starts a script tween on `entity`; an unknown property is reported once in the console. */ private startTween(entity: Entity, command: Extract<ScriptCommand, { type: 'tween' }>): void {
    const started = this.tweens.start(entity, { property: command.property, to: command.to, seconds: command.seconds, easing: command.easing, delay: command.delay, loops: command.loops, yoyo: command.yoyo, relative: command.relative, signal: command.signal })
    if (!started) this.worldHost.log(`tween: "${command.property}" cannot be animated on ${entity.name} (use x, y, rotation, rotation_degrees, scale_x, scale_y, scale or opacity)`, 'Script', 'warning')
  }

  /** 26.44: advances tweens on game time; finished tweens emit "tween.finished" and their own signal. */ private updateTweens(delta: number): void {
    if (!this.tweens.size) return
    const living = new Map(this.worldHost.state.world.entities.map(entity => [entity.uuid, entity]))
    this.tweens.update(delta, entity => { const current = living.get(entity.uuid); return current && !this.isRemovalPending(current) ? current : null }, (entity, property, signal) => {
      this.emitSignal('tween.finished', { property }, entity.uuid, `tween:${entity.uuid}`)
      if (signal) this.emitSignal(signal, { property }, entity.uuid, `tween:${entity.uuid}`)
    })
  }

  /** 26.44: world gravity and the drop-through command for the gameplay components (Platform Controller 2D). */ private gameplayWorldOptions(): GameplayWorldOptions {
    const world = this.worldHost.state.world
    return { gravity: finiteNumber(this.worldHost.state.globalSettings.gravity, 9.80665), dropThrough: (entity, seconds) => world.dropThroughOneWay(entity, seconds) }
  }

  /** 执行时调用 (despawn ? this.pendingDespawn : this.pendingDestroy).set(entity.id, entityLifetimeGeneration(entity))；不显式返回调用结果。 */ private queueEntityRemoval(entity: Entity, despawn: boolean): void { (despawn ? this.pendingDespawn : this.pendingDestroy).set(entity.id, this.worldGameplay.entityLifetimes.generation(entity)) }
  /** 结构说明（自动提取）：isRemovalPending；输入 entity；直接调用 inspectEntityLifetimeGeneration、pendingDestroy.get、pendingDespawn.get。 */ private isRemovalPending(entity: Entity): boolean { const generation = this.worldGameplay.entityLifetimes.inspect(entity); return generation !== null && (this.pendingDestroy.get(entity.id) === generation || this.pendingDespawn.get(entity.id) === generation) }

  /** Scripts name media and global scripts by path ("Assets/Audio/hit.wav", "Audio/hit.wav") or by
   * uuid/asset:// URI. Identity lookup keeps uuid semantics, so paths are mapped to uuids here. */
  private resolveMediaReference(reference: string): string {
    const revision = this.scriptServices.revision()
    if (!this.mediaPathIndex || this.mediaPathIndex.revision !== revision) {
      const byPath = new Map<string, string>()
      for (const item of this.scriptServices.listIdentities()) byPath.set(item.path.replace(/\\/g, '/').toLowerCase(), item.uuid)
      this.mediaPathIndex = { revision, byPath }
    }
    const path = reference.trim().replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
    return this.mediaPathIndex.byPath.get(path) ?? this.mediaPathIndex.byPath.get(`assets/${path}`) ?? reference
  }

  /** 26.43: queue call_on/call_global/call_group/after for the next command flush (a safe boundary). */
  private queueScriptCall(source: Entity, target: ScriptCallTarget, functionName: string, args: unknown): void {
    if (this.pendingCalls.length >= MAX_PENDING_SCRIPT_CALLS) { this.reportCallIssue('queue-full', `Script call queue is full (${MAX_PENDING_SCRIPT_CALLS}); ${source.name}.${functionName} was dropped.`); return }
    this.pendingCalls.push({ source: source.uuid, target, function: functionName, args: Array.isArray(args) ? args : [] })
  }

  /** Reports a script call problem once per session and kind, so a per-frame call cannot flood the console. */
  private reportCallIssue(key: string, message: string, level: 'warning' | 'error' = 'warning'): void {
    if (this.reportedCallIssues.has(key)) return
    if (this.reportedCallIssues.size < 512) this.reportedCallIssues.add(key)
    this.worldHost.log(message, 'Script', level)
  }

  private resolveCallTargets(call: PendingScriptCall): Entity[] {
    const entities = this.worldHost.state.world.entities
    if (call.target.kind === 'entity') {
      const target = this.worldGameplay.dynamicObjectsOwner.resolveRuntimeHandle(call.target.handle, this.pendingHandleResolutions)
      return target ? [target] : []
    }
    if (call.target.kind === 'global') {
      const name = call.target.name, host = this.globalScriptHosts.find(candidate => candidate.name === name)
      const entity = host ? entities.find(candidate => candidate.uuid === host.uuid) : undefined
      if (!entity) this.reportCallIssue(`global:${name}`, `call_global: no global script named “${name}” is running (Project Settings › Scripting › Global scripts).`, 'error')
      return entity ? [entity] : []
    }
    const group = call.target.group
    return entities.filter(entity => entity.groups.includes(group))
  }

  /** Runs queued calls in order; calls made by a called function join the same queue. */
  private drainScriptCalls(): void {
    let budget = MAX_SCRIPT_CALLS_PER_FLUSH, index = 0
    while (index < this.pendingCalls.length && budget > 0) {
      if (this.pendingDebugInvocation || this.pendingGraphExecution || this.scriptDebugger.state.paused) break
      const call = this.pendingCalls[index++]
      budget--
      for (const target of this.resolveCallTargets(call)) {
        if (!target.script2D) { if (call.target.kind !== 'group') this.reportCallIssue(`noscript:${target.uuid}`, `call_on: ${target.name} has no script, so ${call.function}() was not called.`); continue }
        this.invalidateScriptWorld()
        this.runEntityFunction(target, call.function, undefined, { name: call.function, source: call.source, payload: call.args }, false, undefined, false, 'call')
        const asset = this.scriptServices.resolveAsset(target.script2D.scriptAsset)
        const declared = asset ? this.declaredFunctions.get(asset.uuid) : undefined
        if (declared && !declared.names.has(call.function)) this.reportCallIssue(`missing:${asset!.uuid}:${call.function}`, `call: ${asset!.path} has no function ${call.function}() (called on ${target.name}).`)
      }
      if (this.pendingDynamicCommands.length) this.flushDynamicCommands()
    }
    this.pendingCalls.splice(0, index)
    if (this.pendingCalls.length && budget === 0) this.reportCallIssue('call-budget', `More than ${MAX_SCRIPT_CALLS_PER_FLUSH} script calls in one phase (a call loop?); the rest run at the next phase.`)
  }

  /** 结构说明（自动提取）：flushEntityCommands；无显式参数；直接调用 flushDynamicCommands、slice、pendingDespawn.delete、this.worldHost.state.world.entities.find、inspectEntityLifetimeGeneration 等；包含循环处理。 */ private flushEntityCommands(): void {
    this.invalidateScriptWorld()
    this.flushDynamicCommands()
    if (this.pendingCalls.length) this.drainScriptCalls()
    for (const [id, generation] of [...this.pendingDespawn].slice(0, MAX_SCRIPT_BRIDGE_COMMANDS)) {
      this.pendingDespawn.delete(id)
      const entity = this.worldHost.state.world.entities.find(/* 比较 candidate.id 与 id，返回严格相等的判断结果。 */ candidate => candidate.id === id)
      if (entity && this.worldGameplay.entityLifetimes.inspect(entity) === generation && !this.worldGameplay.objectPoolOwner.releasePooled(entity)) this.queueEntityRemoval(entity, false)
    }
    const pending = [...this.pendingDestroy].slice(0, MAX_SCRIPT_BRIDGE_COMMANDS)
    for (const [id, generation] of pending) {
      this.pendingDestroy.delete(id)
      const entity = this.worldHost.state.world.entities.find(/* 比较 candidate.id 与 id，返回严格相等的判断结果。 */ candidate => candidate.id === id)
      if (!entity || this.worldGameplay.entityLifetimes.inspect(entity) !== generation || this.destroying.has(entity.uuid)) continue
      const doomed = subtreeEntities([id], this.worldHost.state.world.entities)
      for (const candidate of doomed) this.destroying.add(candidate.uuid)
      for (const candidate of doomed) {
        this.runDestructionCallbacks(candidate)
        this.clearEntityRuntimeState(candidate)
        this.worldGameplay.entityLifetimes.retire(candidate)
      }
      this.worldHost.deleteEntity(id)
      this.animationTimeline.markMembershipDirty()
      for (const candidate of doomed) this.destroying.delete(candidate.uuid)
    }
    for (const request of this.pendingPrefabs.splice(0, MAX_SCRIPT_BRIDGE_COMMANDS)) if (this.commandSourceActive(request)) {
      const acquired=this.worldGameplay.objectPoolOwner.acquirePooled(request.reference, request.position)
      if(acquired)this.animationTimeline.markMembershipDirty()
      if (!acquired) {
        if (this.worldGameplay.objectPoolOwner.hasObjectPool(request.reference)) this.worldHost.log(`Object pool capacity unavailable for ${request.reference}; spawn was refused.`, 'Runtime', 'warning')
        else {const created=this.worldGameplay.prefabInstantiator.instantiatePrefab(request.reference, request.position, false);if(created.length)this.animationTimeline.markMembershipDirty()}
      }
    }
    this.ensureLifecycle()
  }

  /** 结构说明（自动提取）：flushStructuralCommands；无显式参数；直接调用 flushEntityCommands、prepareRuntimeSceneTransition、this.worldHost.log、errorMessage、transaction.commit 等；写入 pendingScene、transaction、pendingPrefabs、pendingDynamicCommands 等；包含循环处理。 */ private flushStructuralCommands(): void {
    this.flushEntityCommands()
    const scene = this.pendingScene
    this.pendingScene = null
    if (!scene) return
    const before = [...this.worldHost.state.world.entities]
    let transaction: PreparedRuntimeSceneTransition
    try { transaction = this.worldHost.prepareRuntimeSceneTransition(scene.type === 'load' ? scene.identifier : undefined) }
    catch (error) { this.worldHost.log(`Runtime scene preparation failed: ${this.errorMessage(error)}`, 'Runtime', 'error'); return }
    if (!transaction.commit()) { this.worldHost.log(`Runtime scene transition failed: ${transaction.error ?? 'Commit rejected'}`, 'Runtime', 'error'); return }
    this.animationTimeline.markMembershipDirty()
    this.worldGameplay.finishWorldSceneTransition()
    const retained = new Set(transaction.preservedEntityUuids), unloading = before.filter(/* 返回 retained.has(entity.uuid) 的逻辑取反结果。 */ entity => !retained.has(entity.uuid))
    this.pendingDestroy.clear()
    this.pendingDespawn.clear()
    this.pendingPrefabs = []
    this.pendingDynamicCommands = []
    // Accepted transitions run outgoing callbacks against their original context;
    // a failed installation never destroys instances or consumes their timers.
    this.callbackWorld = before
    try { this.emitSignal('scene.unloading', { type: scene.type }, '', 'runtime'); this.dispatchSignals() }
    finally { this.callbackWorld = null }
    for (const entity of unloading) this.destroying.add(entity.uuid)
    for (const entity of unloading) { this.runDestructionCallbacks(entity, before); this.clearEntityRuntimeState(entity); this.worldGameplay.entityLifetimes.retire(entity) }
    for (const entity of unloading) this.destroying.delete(entity.uuid)
    const living = new Set(this.worldHost.state.world.entities.map(/* 返回 entity.uuid 的当前值。 */ entity => entity.uuid))
    for (const [pending, resolved] of this.pendingHandleResolutions) if (!living.has(resolved.uuid)) this.pendingHandleResolutions.delete(pending)
    for (const uuid of [...this.awakened]) if (!living.has(uuid)) this.awakened.delete(uuid)
    for (const uuid of [...this.started]) if (!living.has(uuid)) this.started.delete(uuid)
    this.gameplayComponents.beginGameplayComponents(this.worldHost.state.world.entities)
    const sessionGeneration = ++this.sessionGeneration
    void this.worldGameplay.beginWorldGameplay(/* 调用 this.emitSignal(name, payload, target, source) 并返回调用结果。 */ (name, payload, target, source) => this.emitSignal(name, payload, target, source), /* 先计算 this.active；仅当其为真值时求右侧 this.sessionGeneration === sessionGeneration，返回短路求值结果。 */ () => this.active && this.sessionGeneration === sessionGeneration)
    this.diagnostics.sceneSwitches++
    this.ensureLifecycle()
    this.emitSignal('scene.loaded', { type: scene.type }, '', 'runtime')
    this.worldHost.log(`Runtime scene ${scene.type === 'reload' ? 'reloaded' : 'loaded'}`, 'Runtime')
  }

  /** 结构说明（自动提取）：dispatchPhysicsEvents；输入 events；直接调用 processGameplayContacts、this.worldHost.state.world.entities.find、worldTransform、runEntityFunction、runEventSheetHandlers 等；包含循环处理。 */ private dispatchPhysicsEvents(events: RuntimePhysicsEvent[]): void {
    this.invalidateScriptWorld()
    this.gameplayComponents.processGameplayContacts(events, this.worldHost.state.world.entities, /* 调用 this.emitSignal(name, payload, target, source) 并返回调用结果。 */ (name, payload, target, source) => this.emitSignal(name, payload, target, source), /* 调用 this.queueEntityRemoval(target, despawn) 并返回调用结果。 */ (target, despawn) => this.queueEntityRemoval(target, despawn), value => this.gameFlow.addRuntimeScore(value))
    // 26.45: a joint that broke tells the objects it joined (signal `joint.broken`).
    for (const event of events) {
      if (event.type !== 'jointBroken' || !event.connectionUuid) continue
      const entities = this.worldHost.state.world.entities
      const owner = entities.find(entity => [...entity.componentMap.values()].some(component => component.uuid === event.connectionUuid))
      const component = owner ? [...owner.componentMap.values()].find(candidate => candidate.uuid === event.connectionUuid) as unknown as { kind: string; targetEntityUuid?: string | null } | undefined : undefined
      const connection = owner ? null : this.worldHost.state.world.connections.find(candidate => candidate.uuid === event.connectionUuid)
      const joined = owner ? [owner.uuid, component?.targetEntityUuid ?? ''] : (connection?.anchors ?? []).map(anchor => entities.find(entity => entity.id === anchor.entityId)?.uuid ?? '')
      const payload = { joint: event.connectionUuid, kind: component?.kind ?? connection?.componentType ?? 'Connection' }
      for (const uuid of [...new Set(joined)].filter(Boolean)) this.emitSignal('joint.broken', payload, uuid, 'physics')
    }
    for (const event of events) {
      if (!event.firstEntityUuid || !event.secondEntityUuid) continue
      const first = this.worldHost.state.world.entities.find(/* 比较 entity.uuid 与 event.firstEntityUuid，返回严格相等的判断结果。 */ entity => entity.uuid === event.firstEntityUuid)
      const second = this.worldHost.state.world.entities.find(/* 比较 entity.uuid 与 event.secondEntityUuid，返回严格相等的判断结果。 */ entity => entity.uuid === event.secondEntityUuid)
      if (!first || !second) continue
      const functionName = event.type === 'collisionStarted' ? 'on_collision_enter'
        : event.type === 'collisionStayed' ? 'on_collision_stay'
          : event.type === 'collisionEnded' ? 'on_collision_exit'
            : event.type === 'triggerEntered' ? 'on_trigger_enter'
              : event.type === 'triggerStayed' ? 'on_trigger_stay'
                : event.type === 'triggerExited' ? 'on_trigger_exit' : null
      if (!functionName) continue
      const point = event.point ?? [
        (worldTransform(first, this.worldHost.state.world.entities).position.x + worldTransform(second, this.worldHost.state.world.entities).position.x) * .5,
        (worldTransform(first, this.worldHost.state.world.entities).position.y + worldTransform(second, this.worldHost.state.world.entities).position.y) * .5
      ]
      const normal = event.normal ?? [0, 0]
      const relative = event.relativeVelocity ?? [0, 0]
      this.runEntityFunction(first, functionName, { otherEntity: second.uuid, point, normal, relativeVelocity: relative })
      const sheetKind = event.type === 'collisionStarted' ? 'collision-enter' : event.type === 'collisionStayed' ? 'collision-stay' : event.type === 'collisionEnded' ? 'collision-exit' : event.type === 'triggerEntered' ? 'trigger-enter' : event.type === 'triggerStayed' ? 'trigger-stay' : 'trigger-exit'
      this.runEventSheetHandlers(first, sheetKind, '', functionName, { otherEntity: second.uuid, point, normal, relativeVelocity: relative })
      this.runEntityFunction(second, functionName, {
        otherEntity: first.uuid,
        point,
        normal: [-normal[0], -normal[1]],
        relativeVelocity: [-relative[0], -relative[1]]
      })
      this.runEventSheetHandlers(second, sheetKind, '', functionName, { otherEntity: first.uuid, point, normal: [-normal[0], -normal[1]], relativeVelocity: [-relative[0], -relative[1]] })
      const signal = functionName.replace(/^on_/, 'physics.')
      this.emitSignal(signal, { other: second.uuid, point, normal, relativeVelocity: relative }, first.uuid, second.uuid)
      this.emitSignal(signal, { other: first.uuid, point, normal: [-normal[0], -normal[1]], relativeVelocity: [-relative[0], -relative[1]] }, second.uuid, first.uuid)
    }
    this.flushEntityCommands()
  }

  /** 结构说明（自动提取）：canRun；输入 entity；直接调用 entityLifetimeActive。 */ private canRun(entity: Entity): boolean {
    const script = entity.script2D
    return entity.enabled && this.worldGameplay.entityLifetimes.active(entity) && !!script && script.enabled && !script.removed
  }

  /** 结构说明（自动提取）：clearEntityRuntimeState；输入 entity；直接调用 retireWorldGameplayEntity、time.removeEntity、awakened.delete、started.delete、behaviorProperties.keys 等；写入 pendingSignals、pendingDebugInvocation、pendingGraphExecution；包含循环处理。 */ private clearEntityRuntimeState(entity: Entity): void {
    ;(this.scriptRuntime as unknown as { remove_entity_instances(epoch: number, entity: string): boolean } | null)?.remove_entity_instances(this.playSessionIdentity, entity.uuid)
    for (const key of this.initializedScriptInstances) if (key.startsWith(`${entity.uuid}:`)) this.initializedScriptInstances.delete(key)
    try { this.worldGameplay.retireWorldGameplayEntity(entity.uuid) } finally { this.worldGameplayOwner.componentsOwner.retireEntity(entity.uuid) }
    this.time.removeEntity(entity.uuid); this.awakened.delete(entity.uuid); this.started.delete(entity.uuid)
    for (const key of this.laterCalls.keys()) if (key.startsWith(`${entity.uuid}\u0000`)) this.laterCalls.delete(key)
    for (const key of this.behaviorProperties.keys()) if (key.startsWith(`${entity.uuid}:`)) this.behaviorProperties.delete(key)
    for (const key of this.contractValidations.keys()) if (key.startsWith(`${entity.uuid}:`)) this.contractValidations.delete(key)
    this.signalQueue.dropTarget(entity.uuid)
    if (this.pendingDebugInvocation?.entityUuid === entity.uuid) this.pendingDebugInvocation = null
    if (this.pendingGraphExecution?.entityUuid === entity.uuid) this.pendingGraphExecution = null
  }

  /** 结构说明（自动提取）：latchFixedInput；输入 snapshot；直接调用 Object.entries；写入 fixedPressed[…]、fixedReleased[…]；包含循环处理。 */ private latchFixedInput(snapshot: InputSnapshot): void {
    const edges = snapshot.edges ?? []
    if (this.fixedEdges.length + edges.length > this.inputQueueDiagnostics.capacity) {
      this.inputQueueDiagnostics.overflows++
      this.inputQueueDiagnostics.dropped += this.fixedEdges.length + edges.length
      this.fixedEdges = []; this.fixedPressed = {}
      for (const [name, down] of Object.entries(snapshot.down)) if (down) this.fixedReleased[name] = true
      this.input.releaseAllInputs()
      this.worldHost.log('Input edge queue overflowed; held state was released and resynchronized.', 'Input', 'error')
      return
    }
    this.fixedEdges.push(...edges)
    for (const [name, active] of Object.entries(snapshot.pressed)) if (active) this.fixedPressed[name] = true
    for (const [name, active] of Object.entries(snapshot.released)) if (active) this.fixedReleased[name] = true
  }

  /** 结构说明（自动提取）：reportScriptError；输入 entity、message；直接调用 this.worldHost.log；写入 component.lastError。 */ private reportScriptError(entity: Entity, message: string): void {
    const component = entity.script2D
    if (!component) return
    if (component.lastError !== message) this.worldHost.log(`${entity.name}: ${message}`, 'Script', 'error', component.scriptAsset ?? undefined)
    component.lastError = message
    this.diagnostics.scriptErrors++
  }

  /** 结构说明（自动提取）：errorMessage；输入 error；直接调用 replace、String；返回路径包含 error.message。 */ private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    return String(error).replace(/^JsValue\((.*)\)$/s, '$1')
  }

  /** 结构说明（自动提取）：compileAttachedScripts；无显式参数；直接调用 Set、map、resolveEventHandlers、resolveAsset、resolveScriptBundle 等；包含循环处理。 */ private compileAttachedScripts(): void {
    for (const entity of this.worldHost.state.world.entities) {
      const references = new Set([entity.script2D?.scriptAsset, ...this.resolveEventHandlers(entity.script2D?.eventSheetAsset).map(/* 返回 handler.logicAsset 的当前值。 */ handler => handler.logicAsset)])
      for (const reference of references) {
      const uuid = this.scriptServices.resolveAsset(reference)?.uuid
      if (!uuid) continue
      try {
        const source = this.resolveScriptBundle(uuid)
        if (source) this.ensureCompiled(uuid, source)
      } catch (error) {
        this.reportScriptError(entity, this.errorMessage(error))
      }
      }
    }
  }

  /** 结构说明（自动提取）：ensureCompiled；输入 scriptUuid、source、candidateDocument；直接调用 compiledSources.get、registerCompiledGraph、Error、Map、resolveScriptBundle 等；返回路径包含 exports；包含循环处理；包含显式抛错路径。 */ private ensureCompiled(scriptUuid: string, source: string, candidateDocument?: string): ExportedProperty[] {
    const registerCompiledGraph = /** 结构说明（自动提取）：registerCompiledGraph；无显式参数；直接调用 resolveAsset、compiledDocuments.get、registerGraphDebugDocument。 */ (): void => { const asset = this.scriptServices.resolveAsset(scriptUuid); if (asset?.assetType === 'visualScript') { const document = this.compiledDocuments.get(scriptUuid); if (document !== undefined) this.graphDebug.registerGraphDebugDocument(document) } }
    if (this.compiledSources.get(scriptUuid) === source) { registerCompiledGraph(); return [] }
    if (!this.scriptRuntime) throw new Error('Script runtime is unavailable')
    const documents = new Map<string, string>()
    if (this.resolveScriptBundle(scriptUuid, candidateDocument === undefined ? new Map() : new Map([[scriptUuid, candidateDocument]]), documents) !== source) throw Error('Script module source changed before compilation; retry the candidate.')
    const contract = parseScriptContract(source)
    if (!contract.valid) throw new Error(contract.diagnostics.filter(/* 比较 item.severity 与 'error'，返回严格相等的判断结果。 */ item => item.severity === 'error').map(/** 按模板 `${item.code} line ${item.line}: ${item.message}` 生成并返回字符串。 */ item => `${item.code} line ${item.line}: ${item.message}`).join(' '))
    const runtime = this.scriptRuntime as unknown as { compile_cached(id: string, source: string): string }
    const exports = JSON.parse(runtime.compile_cached(scriptUuid, source)) as ExportedProperty[]
    this.compiledExports.set(scriptUuid, exports)
    this.compiledSources.set(scriptUuid, source)
    this.compiledModuleDocuments.set(scriptUuid, documents)
    const document = candidateDocument ?? this.scriptServices.readSource(scriptUuid)
    if (document !== null && document !== undefined) this.compiledDocuments.set(scriptUuid, document)
    this.declaredFunctions.set(scriptUuid, { source, names: new Set(Object.keys(analyzeScript(source).functions)), contract })
    for (const key of this.contractValidations.keys()) if (key.endsWith(`:${scriptUuid}`)) this.contractValidations.delete(key)
    registerCompiledGraph()
    return exports
  }

  /** 结构说明（自动提取）：flushHotReloads；无显式参数；直接调用 Map、pendingReloads.clear、pendingRollbackHistory.clear、next、queued.keys 等；写入 scriptDebugState.hotReload、candidateRuntime、candidate.exports、replacedRuntime 等；包含循环处理；包含显式抛错路径。 */ private flushHotReloads(): void {
    const queued = new Map(this.pendingReloads); this.pendingReloads.clear()
    const rollbackHistory = new Map(this.pendingRollbackHistory); this.pendingRollbackHistory.clear()
    if (!queued.size) return
    const requestedUuid = queued.keys().next().value!
    if (!scriptProjectSettings.hotReloadEnabled) {
      this.scriptDebugger.state.hotReload = { status: 'disabled', scriptUuid: requestedUuid, message: 'Project hot reload was disabled before the queued frame-boundary apply.', frame: this.time.value.frame }
      return
    }
    const plans: HotReloadPlan[] = []
    let candidateRuntime: WasmScriptRuntime | null = null
    let replacedRuntime: WasmScriptRuntime | null = null
    let committed = false
    try {
      const affected = new Set(queued.keys())
      for (const [root, documents] of this.compiledModuleDocuments) if ([...queued.keys()].some(/* 调用 documents.has(uuid) 并返回调用结果。 */ uuid => documents.has(uuid))) affected.add(root)
      const priorDocuments = new Map<string, string>()
      for (const documents of this.compiledModuleDocuments.values()) for (const [uuid, raw] of documents) if (!priorDocuments.has(uuid)) priorDocuments.set(uuid, raw)
      const candidates = new Map<string, { source: string; previousSource: string; previousDocument: string; documents: Map<string, string>; contract: ScriptContractReport; names: Set<string>; recreate: boolean; exports: ExportedProperty[] }>()
      for (const uuid of affected) {
        const asset = this.scriptServices.resolveAsset(uuid)
        if (!asset) throw Error(`Reload asset is missing: ${uuid}`)
        if (asset.script?.reloadPolicy === 'disabled') throw Error(`${asset.name} opted out of hot reload; the entire dependent transaction was retained.`)
        const overrides = new Map(this.compiledModuleDocuments.get(uuid) ?? priorDocuments)
        for (const [changed, raw] of queued) overrides.set(changed, raw)
        const documents = new Map<string, string>(), source = this.resolveScriptBundle(uuid, overrides, documents)
        if (!source) throw Error(`Reload module cannot be resolved: ${asset.name}`)
        const contract = parseScriptContract(source)
        if (!contract.valid) throw Error(contract.diagnostics.filter(/* 比较 item.severity 与 'error'，返回严格相等的判断结果。 */ item => item.severity === 'error').map(/* 返回 item.message 的当前值。 */ item => item.message).join(' '))
        const previousSource = this.compiledSources.get(uuid) ?? this.resolveScriptBundle(uuid, priorDocuments) ?? source
        candidates.set(uuid, { source, previousSource, previousDocument: this.compiledDocuments.get(uuid) ?? priorDocuments.get(uuid) ?? this.scriptServices.readSource(uuid) ?? previousSource, documents, contract, names: new Set(Object.keys(analyzeScript(source).functions)), recreate: asset.script?.reloadPolicy === 'recreate', exports: [] })
      }
      // Candidate cache shares immutable old programs; changed ASTs are isolated until commit.
      const nextSources = new Map(this.compiledSources)
      for (const [uuid, candidate] of candidates) nextSources.set(uuid, candidate.source)
      candidateRuntime = this.scriptRuntime?.fork() ?? new WasmScriptRuntime()
      const compileSources = this.scriptRuntime ? new Map([...candidates].map(/* 返回按声明顺序构造的数组 [uuid, candidate.source]。 */ ([uuid, candidate]) => [uuid, candidate.source])) : nextSources
      for (const [uuid, source] of compileSources) {
        const exports = JSON.parse(candidateRuntime.compile_cached(uuid, source)) as ExportedProperty[]
        const candidate = candidates.get(uuid)
        if (candidate) candidate.exports = exports
      }
      for (const [uuid, candidate] of candidates) {
        const previous = this.validateSource(candidate.previousSource)
        if (previous.error) throw Error(previous.error)
        const plan = this.scriptHotReload.prepareHotReload(uuid, candidate.previousSource, candidate.source, previous.exports, candidate.exports, this.scriptServices.resolveAsset(uuid)?.script?.reloadPolicy ?? 'preserve')
        plans.push(plan)
        if (plan.classification === 'rejected' || plan.classification === 'restart-required') throw Error(`${plan.classification === 'restart-required' ? 'Restart required: ' : ''}${plan.reasons.join(' ')}`)
      }
      // Prepare all primary and inherited state transfers before publishing the candidate VM.
      const transfers = [...candidates].flatMap(/** 结构说明（自动提取）：flatMap 回调；输入 [uuid, candidate]；直接调用 this.worldHost.state.world.entities.flatMap；返回表达式求值结果。 */ ([uuid, candidate]) => this.worldHost.state.world.entities.flatMap(/** 结构说明（自动提取）：this.worldHost.state.world.entities.flatMap 回调；输入 entity；直接调用 resolveAsset、behaviorProperties.has、behaviorProperties.get、Object.fromEntries、candidate.exports.map。 */ entity => {
          const component = entity.script2D
          if (!component) return []
          const primary = this.scriptServices.resolveAsset(component.scriptAsset)?.uuid === uuid, key = `${entity.uuid}:${uuid}`
          if (!primary && !this.behaviorProperties.has(key)) return []
          const previous = primary ? component.properties : this.behaviorProperties.get(key)!
          const properties = Object.fromEntries(candidate.exports.map(/* 返回按声明顺序构造的数组 [exported.name, this.exportValue(exported, candidate.recreate ? undefined : previous[exported.name])]。 */ exported => [exported.name, this.exportValue(exported, candidate.recreate ? undefined : previous[exported.name])]))
          const metadata = Object.fromEntries(candidate.exports.map(/* 返回按声明顺序构造的数组 [exported.name, { ...exported, defaultValue: exported.defaultValue ?? exported.value }]。 */ exported => [exported.name, { ...exported, defaultValue: exported.defaultValue ?? exported.value }]))
          return [{ entity, component, primary, key, properties, metadata, recreate: candidate.recreate }]
      }))
      replacedRuntime = this.scriptRuntime
      if (replacedRuntime) (candidateRuntime as unknown as { take_instances_from(source: WasmScriptRuntime): number }).take_instances_from(replacedRuntime)
      for (const [uuid, candidate] of candidates) {
        // Changed revisions initialize a new private scope while preserving the existing export migration.
        if (candidate.recreate || candidate.source !== candidate.previousSource) {
          ;(candidateRuntime as unknown as { reset_script_instances(script: string): void }).reset_script_instances(uuid)
          for (const key of this.initializedScriptInstances) if (key.endsWith(`:${uuid}`)) this.initializedScriptInstances.delete(key)
        }
      }
      this.scriptRuntime = candidateRuntime; candidateRuntime = null; this.compiledSources = nextSources; committed = true
      for (const [uuid, candidate] of candidates) {
        this.compiledExports.set(uuid, candidate.exports)
        this.compiledModuleDocuments.set(uuid, candidate.documents)
        this.compiledDocuments.set(uuid, candidate.documents.get(uuid)!)
        this.declaredFunctions.set(uuid, { source: candidate.source, names: candidate.names, contract: candidate.contract })
        for (const key of this.contractValidations.keys()) if (key.endsWith(`:${uuid}`)) this.contractValidations.delete(key)
        if (this.pendingDebugInvocation?.scriptUuid === uuid) this.pendingDebugInvocation = null
        if (this.pendingGraphExecution?.scriptUuid === uuid) this.pendingGraphExecution = null
      }
      for (const transfer of transfers) {
        if (transfer.primary) { transfer.component.propertyMetadata = transfer.metadata; transfer.component.properties = transfer.properties }
        else this.behaviorProperties.set(transfer.key, transfer.properties)
        if (transfer.recreate) { this.awakened.delete(transfer.entity.uuid); this.started.delete(transfer.entity.uuid) }
      }
      for (const plan of plans) this.scriptHotReload.commitHotReload(plan, candidates.get(plan.scriptUuid)!.previousDocument)
      for (const historyId of rollbackHistory.values()) this.scriptHotReload.completeHotReloadRollback(historyId)
      for (const [uuid, candidate] of candidates) if (this.scriptServices.resolveAsset(uuid)?.assetType === 'visualScript') this.graphDebug.registerGraphDebugDocument(candidate.documents.get(uuid)!)
      const message = `Applied one VM transaction for ${candidates.size} affected scripts with compatible state retained.`
      this.scriptDebugger.state.hotReload = { status: 'applied', scriptUuid: requestedUuid, message, frame: this.time.value.frame }
      this.worldHost.log(message, 'Script', 'debug', requestedUuid)
    } catch (error) {
      const message = committed ? `Hot reload committed, but post-commit bookkeeping failed: ${this.errorMessage(error)}` : `Hot reload rejected; previous valid programs retained: ${this.errorMessage(error)}`
      if (!committed) for (const plan of plans) this.scriptHotReload.rejectHotReload(plan, message)
      this.scriptDebugger.state.hotReload = { status: committed ? 'applied' : 'rejected', scriptUuid: requestedUuid, message, frame: this.time.value.frame }
      this.worldHost.log(message, 'Script', 'error', requestedUuid)
    } finally {
      try { candidateRuntime?.free() } catch (error) { this.worldHost.log(`Rejected script VM cleanup failed: ${this.errorMessage(error)}`, 'Script', 'error') }
      try { replacedRuntime?.free() } catch (error) { this.worldHost.log(`Replaced script VM cleanup failed: ${this.errorMessage(error)}`, 'Script', 'error') }
    }
  }

  /** 结构说明（自动提取）：dispatchSignals；无显式参数；直接调用 pendingSignals.splice、signalWorld.filter、runEntityFunction、signal.name.startsWith、runEventSheetHandlers 等；写入 scriptDebugState.lastSignal；包含循环处理。 */ private dispatchSignals(): void {
    this.invalidateScriptWorld()
    const batch = this.signalQueue.drain()
    for (const signal of batch) {
      this.scriptDebugger.state.lastSignal = { name: signal.name, source: signal.source, target: signal.target }
      const signalWorld = this.callbackWorld ?? this.worldHost.state.world.entities
      const recipients = signal.target ? signalWorld.filter(/* 比较 entity.uuid 与 signal.target，返回严格相等的判断结果。 */ entity => entity.uuid === signal.target) : signalWorld
      for (const entity of recipients) {
        this.runEntityFunction(entity, 'on_signal', undefined, signal)
        const eventKind: ObjectEventKind = signal.name.startsWith('ui.') ? 'ui' : signal.name.startsWith('animation.') ? 'animation' : signal.name.startsWith('network.') ? 'network' : 'signal'
        const dispatched = this.runEventSheetHandlers(entity, eventKind, signal.name.replace(/^(?:ui|animation|network)\./, ''), 'on_signal', undefined, signal, signal.deliveredCallbacks)
        const asset = this.scriptServices.resolveAsset(entity.script2D?.scriptAsset ?? '')
        for (const connection of asset?.script?.signalConnections ?? []) {
          if (!connection.enabled || connection.signal !== signal.name) continue
          if (connection.source && connection.source !== signal.source) continue
          if (connection.target && connection.target !== entity.uuid) continue
          const key = JSON.stringify([asset!.uuid, connection.callback])
          if (!dispatched.has(key)) { dispatched.add(key); this.runEntityFunction(entity, connection.callback, undefined, signal) }
        }
      }
    }
  }

  /** 结构说明（自动提取）：dispatchTimerExpirations；输入 expired；直接调用 time.consumeExpiration、this.worldHost.state.world.entities.find、runEntityFunction、runEventSheetHandlers、updateDebugTask；包含循环处理。 */ private dispatchTimerExpirations(expired: readonly TimerExpiration[]): void {
    this.invalidateScriptWorld()
    for (const timer of expired) {
      if (!this.time.consumeExpiration(timer)) continue
      const entity = this.worldHost.state.world.entities.find(/* 比较 candidate.uuid 与 timer.entityUuid，返回严格相等的判断结果。 */ candidate => candidate.uuid === timer.entityUuid)
      const later = timer.kind === 'task' ? this.laterCalls.get(`${timer.entityUuid}\u0000${timer.name}`) : undefined
      if (later) {
        this.laterCalls.delete(`${timer.entityUuid}\u0000${timer.name}`)
        if (entity) this.queueScriptCall(entity, { kind: 'entity', handle: { id: entity.uuid, generation: this.worldGameplay.entityLifetimes.generation(entity) } }, later.function, later.args)
        continue
      }
      if (entity && timer.kind === 'timer') { this.runEntityFunction(entity, 'on_timer', undefined, { name: timer.name, source: entity.uuid, payload: null }); this.runEventSheetHandlers(entity, 'timer', timer.name, 'on_timer', undefined, { name: timer.name, source: entity.uuid, payload: null }) }
      else if (entity) { this.scriptDebugger.updateDebugTask({ id: `${entity.uuid}:${timer.name}`, name: timer.name, state: 'completed', entityUuid: entity.uuid, detail: `Completed at frame ${this.time.value.frame}` }); this.runEntityFunction(entity, 'on_task', undefined, { name: timer.name, source: entity.uuid, payload: null }); this.runEventSheetHandlers(entity, 'task', timer.name, 'on_task', undefined, { name: timer.name, source: entity.uuid, payload: null }) }
    }
  }

  /** 结构说明（自动提取）：resolveScriptBundle；输入 scriptUuid、overrides、documents；直接调用 resolveProjectScriptBundle。 */ private resolveScriptBundle(scriptUuid: string, overrides = new Map<string, string>(), documents?: Map<string, string>): string | null {
    return resolveProjectScriptBundle(scriptUuid, {
      resolveAsset: reference => this.scriptServices.resolveModuleAsset(reference),
      readSource: uuid => { const raw = overrides.get(uuid) ?? this.scriptServices.readSource(uuid); if (raw !== null) documents?.set(uuid, raw); return raw },
      compileVisual: source => this.scriptServices.compileVisual(source)
    })
  }

  private resolveEventHandlers(reference: string | null | undefined) {
    return resolveEventHandlers(reference, this.scriptServices)
  }

  /** 结构说明（自动提取）：serializable；输入 value；直接调用 JSON.parse、JSON.stringify。 */ private serializable(value: unknown): unknown {
    try { return JSON.parse(JSON.stringify(value)) } catch { return null }
  }

  /** 结构说明（自动提取）：exportValue；输入 exported、previous；直接调用 Array.isArray、clone、Number.isFinite、Number、Math.min 等。 */ private exportValue(exported: ExportedProperty, previous: unknown): ScriptPropertyValue {
    const fallback = exported.defaultValue ?? exported.value
    const clone = /** 结构说明（自动提取）：clone；输入 value；直接调用 JSON.parse、JSON.stringify；返回表达式求值结果。 */ (value: ScriptPropertyValue): ScriptPropertyValue => JSON.parse(JSON.stringify(value)) as ScriptPropertyValue
    if (previous === undefined || previous === null && fallback !== null || typeof previous !== typeof fallback || Array.isArray(previous) !== Array.isArray(fallback)) return clone(fallback)
    if (typeof previous === 'number') {
      if (!Number.isFinite(previous)) return Number(fallback)
      return Math.min(exported.maximum ?? Number.MAX_VALUE, Math.max(exported.minimum ?? -Number.MAX_VALUE, previous))
    }
    if (typeof previous === 'string' && exported.enumValues?.length && !exported.enumValues.includes(previous)) return String(fallback)
    try { return clone(previous as ScriptPropertyValue) } catch { return clone(fallback) }
  }

  /** 结构说明（自动提取）：formatLogpoint；输入 template、context；直接调用 replace、template.slice。 */ private formatLogpoint(template: string, context: Record<string, unknown>): string {
    return template.slice(0, 1_024).replace(/\{([A-Za-z_][A-Za-z0-9_.]*)\}/g, /** 结构说明（自动提取）：replace 回调；输入 _match、path；直接调用 evaluateDebugExpression、JSON.stringify。 */ (_match, path: string) => {
      try { const value = evaluateDebugExpression(path, context); return typeof value === 'string' ? value : JSON.stringify(value) } catch { return `<${path}: unavailable>` }
    })
  }
}

