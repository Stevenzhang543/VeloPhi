/** 游戏输入系统：维护键盘、指针和动作映射，提供当前帧及边沿输入查询。 */
import { latencyProbe } from './latencyProbe'
import { applyGamepadAxisCalibration, sensorValue, TouchPointerDeduplicator } from './deviceInput'
import { inputPromptForAction, inputPromptState, setInputModality } from './inputModality'

export { inputPromptForAction, inputPromptState, setInputModality }

export type InputActionKind = 'button' | 'axis' | 'vector2'
export type InputDevice = 'keyboard' | 'physical-key' | 'mouse-button' | 'mouse-wheel' | 'mouse-motion' | 'gamepad-button' | 'gamepad-axis' | 'touch' | 'gesture' | 'sensor' | 'pen-button' | 'pen-pressure' | 'pen-tilt' | 'pen-twist'
export type InputDeviceKind = 'keyboard' | 'mouse' | 'gamepad' | 'touch' | 'sensor' | 'pen'
export type InputModifier = 'Control' | 'Shift' | 'Alt' | 'Meta'
export type InputResponseCurve = 'linear' | 'square' | 'cubic' | 'exponential'
export type InputInteraction = 'press' | 'hold' | 'tap' | 'multiTap'
export type InputPhase = 'idle' | 'started' | 'performed' | 'cancelled'

export interface InputBinding {
  device: InputDevice
  code: string
  scale: number
  x: number
  y: number
  gamepad: number
  deviceId: string
  deadzone: number
  threshold: number
  invert: boolean
  responseCurve: InputResponseCurve
  modifiers: InputModifier[]
  chord: string[]
}

export interface InputAction {
  name: string
  kind: InputActionKind
  bindings: InputBinding[]
  enabled: boolean
  context: string
  map: string
  schemes: string[]
  interaction: InputInteraction
  holdSeconds: number
  tapSeconds: number
  multiTapCount: number
  consume: boolean
  priority: number
  callback: string
}

export interface InputSnapshot {
  down: Record<string, boolean>
  pressed: Record<string, boolean>
  released: Record<string, boolean>
  performed: Record<string, boolean>
  cancelled: Record<string, boolean>
  phases: Record<string, InputPhase>
  durations: Record<string, number>
  tapCounts: Record<string, number>
  consumed: Record<string, boolean>
  axes: Record<string, number>
  vectors: Record<string, [number, number]>
  mousePosition: [number, number]
  mouseWorldPosition: [number, number]
  viewBounds: [number, number, number, number]
  viewportSize: [number, number]
  wheel: [number, number]
  pointerDelta: [number, number]
  touches: number
  devices: InputDeviceIdentity[]
  contexts: string[]
  maps: string[]
  scheme: string
  /** Ordered digital action transitions; legacy booleans aggregate this sample. */
  edges?: InputActionEdge[]
}

export interface InputActionEdge { action: string; down: boolean; sequence: number; timeMs: number }
export const INPUT_EDGE_CAPACITY = 256
/** 26.46 rhythm input: one press, release or move with the browser's event time (performance.now()
 * timebase), so judgement does not depend on when the frame ran. Pointers cover mouse, touch and pen. */
export interface TimedInputEvent {
  kind: 'press' | 'release' | 'move'
  device: 'key' | 'pointer'
  /** KeyboardEvent.code for keys, the pointer type for pointers. */
  code: string
  /** Pointer id (keys use -1 - index of the code, stable while the key is held). */
  id: number
  clientX: number
  clientY: number
  /** Milliseconds in the performance.now() timebase. */
  timeMs: number
}
export const TIMED_INPUT_CAPACITY = 1024
/** Event time in the performance.now() timebase; a missing or implausible timeStamp falls back to now. */
export function eventTimeMs(timeStamp: number, now: number): number {
  return Number.isFinite(timeStamp) && timeStamp > 0 && timeStamp <= now + 1 && now - timeStamp < 1000 ? timeStamp : now
}
type DigitalInputEdge = { device: 'key' | 'mouse' | 'release'; code: string; key: string; button: number; down: boolean; modifiers: InputModifier[]; sequence: number; timeMs: number }

export type InputObservationResetReason = 'observer-attached' | 'observer-disposed' | 'release' | 'blur' | 'hidden' | 'focus' | 'overflow' | 'stop' | 'session' | 'pause' | 'resume' | 'replay'
/** Receipt time is host monotonic milliseconds, never DOM event.timeStamp or replay time. */
export interface InputReceiptObservation {
  readonly inputEpoch: number
  readonly sequence: number
  readonly receivedAtMs: number
  readonly device: 'keyboard' | 'mouse-button'
}
export interface InputSampleObservation {
  readonly inputEpoch: number
  readonly sampleSequence: number
  readonly receipts: readonly InputReceiptObservation[]
  readonly latestReceipt: InputReceiptObservation
}
/** Profiling opt-in only. An injected clock must share the submission clock's normalized origin. */
export interface InputObservationCallbacks {
  receipt(receipt: InputReceiptObservation): void
  reset?(inputEpoch: number, reason: InputObservationResetReason): void
  nowMs?(): number
}
interface InputObservationState {
  callbacks: InputObservationCallbacks
  epoch: number
  sampleSequence: number
  lastClockAtMs: number
  receipts: Map<number, InputReceiptObservation>
  consumed: InputSampleObservation | null
}

export interface InputDeviceIdentity { id: string; kind: InputDeviceKind; index: number; connected: boolean; mapping: string }
export interface InputConflict { signature: string; action: string; bindingIndex: number; conflictsWithAction: string; conflictsWithBindingIndex: number }
export interface InputRecordingFrame { time: number; snapshot: InputSnapshot }
export interface InputRecording { version: 1; duration: number; frames: InputRecordingFrame[] }

export interface PenInputState {
  pointerId: number
  x: number
  y: number
  pressure: number
  tiltX: number
  tiltY: number
  twist: number
  buttons: number
  eraser: boolean
}

export const INPUT_DEVICES: readonly InputDevice[] = ['keyboard', 'physical-key', 'mouse-button', 'mouse-wheel', 'mouse-motion', 'gamepad-button', 'gamepad-axis', 'touch', 'gesture', 'sensor', 'pen-button', 'pen-pressure', 'pen-tilt', 'pen-twist']
const INPUT_DEVICE_KINDS: readonly InputDeviceKind[] = ['keyboard', 'mouse', 'gamepad', 'touch', 'sensor', 'pen']
const defaultDeadzone = /* 根据 device === 'pen-pressure' || device === 'pen-tilt' || device === 'pen-twist' 的真假，分别返回 0 或 .18。 */ (device: InputDevice): number => device === 'pen-pressure' || device === 'pen-tilt' || device === 'pen-twist' ? 0 : .18

/** 结构说明（自动提取）：createInputBinding；输入 device、code；直接调用 normalizePenBindingCode、defaultDeadzone。 */ export function createInputBinding(device: InputDevice = 'keyboard', code = 'Space'): InputBinding {
  return { device, code: normalizePenBindingCode(device, code), scale: 1, x: 1, y: 0, gamepad: 0, deviceId: '', deadzone: defaultDeadzone(device), threshold: .0001, invert: false, responseCurve: 'linear', modifiers: [], chord: [] }
}

/** 结构说明（自动提取）：defaultInputMap；无显式参数；直接调用 createInputAction、createInputBinding。 */ export function defaultInputMap(): InputAction[] {
  return [
    createInputAction('MoveLeft', 'button', [createInputBinding('keyboard', 'KeyA'), createInputBinding('keyboard', 'ArrowLeft')]),
    createInputAction('MoveRight', 'button', [createInputBinding('keyboard', 'KeyD'), createInputBinding('keyboard', 'ArrowRight')]),
    createInputAction('Jump', 'button', [createInputBinding('keyboard', 'Space'), createInputBinding('gamepad-button', '0')]),
    {
      ...createInputAction('Horizontal', 'axis', [
        { ...createInputBinding('keyboard', 'KeyA'), scale: -1 },
        { ...createInputBinding('keyboard', 'ArrowLeft'), scale: -1 },
        createInputBinding('keyboard', 'KeyD'),
        createInputBinding('keyboard', 'ArrowRight'),
        createInputBinding('gamepad-axis', '0')
      ])
    },
    {
      ...createInputAction('Move', 'vector2', [
        { ...createInputBinding('keyboard', 'KeyA'), x: -1 },
        { ...createInputBinding('keyboard', 'KeyD'), x: 1 },
        { ...createInputBinding('keyboard', 'KeyW'), x: 0, y: 1 },
        { ...createInputBinding('keyboard', 'KeyS'), x: 0, y: -1 },
        { ...createInputBinding('gamepad-axis', '0'), x: 1, y: 0 },
        { ...createInputBinding('gamepad-axis', '1'), x: 0, y: -1 }
      ])
    }
  ]
}

/** 结构说明（自动提取）：createInputAction；输入 name、kind、bindings。 */ export function createInputAction(name: string, kind: InputActionKind = 'button', bindings: InputBinding[] = [createInputBinding()]): InputAction {
  return { name, kind, bindings, enabled: true, context: 'Gameplay', map: 'Default', schemes: [], interaction: 'press', holdSeconds: .35, tapSeconds: .25, multiTapCount: 2, consume: false, priority: 0, callback: '' }
}

/* 根据 typeof value === 'number' && Number.isFinite(value) 的真假，分别返回 value 或 fallback。 */ function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/* 根据 typeof value === 'string' && value.trim() 的真假，分别返回 value.trim().slice(0, maximum) 或 fallback。 */ function cleanText(value: unknown, fallback: string, maximum = 160): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : fallback
}

/** 结构说明（自动提取）：normalizePenBindingCode；输入 device、source；直接调用 slice、toLowerCase、source.trim、test、source.slice。 */ export function normalizePenBindingCode(device: InputDevice, source: unknown): string {
  const code = typeof source === 'string' ? source.trim().toLowerCase().slice(0, 80) : ''
  if (device === 'pen-button') return code === 'tip' || code === 'barrel' || code === 'eraser' || /^button-(?:[0-9]|[12][0-9]|3[01])$/.test(code) ? code : 'tip'
  if (device === 'pen-pressure') return 'pressure'
  if (device === 'pen-tilt') return code === 'y' || code === 'tilt-y' ? 'y' : 'x'
  if (device === 'pen-twist') return 'twist'
  return typeof source === 'string' ? source.slice(0, 80) : ''
}

/** 结构说明（自动提取）：normalizeInputDeviceIdentity；输入 source、fallbackIndex；直接调用 INPUT_DEVICE_KINDS.includes、Math.min、Math.max、Math.round、finite 等。 */ export function normalizeInputDeviceIdentity(source: unknown, fallbackIndex = 0): InputDeviceIdentity {
  const item = source && typeof source === 'object' ? source as Partial<InputDeviceIdentity> : {}
  const kind = INPUT_DEVICE_KINDS.includes(item.kind as InputDeviceKind) ? item.kind as InputDeviceKind : 'keyboard'
  const index = Math.min(63, Math.max(0, Math.round(finite(item.index, fallbackIndex))))
  return {
    id: cleanText(item.id, `${kind}:${index}`),
    kind,
    index,
    connected: item.connected !== false,
    mapping: cleanText(item.mapping, kind === 'pen' ? 'pointer' : kind === 'touch' ? 'direct' : kind === 'mouse' ? 'pointer' : 'standard', 80)
  }
}

/** 结构说明（自动提取）：normalizeInputDeviceIdentities；输入 source；直接调用 Array.isArray、Set、flatMap、source.slice。 */ export function normalizeInputDeviceIdentities(source: unknown): InputDeviceIdentity[] {
  if (!Array.isArray(source)) return []
  const seen = new Set<string>()
  return source.slice(0, 64).flatMap(/** 结构说明（自动提取）：flatMap 回调；输入 value、index；直接调用 normalizeInputDeviceIdentity、seen.has、seen.add。 */ (value, index) => {
    const identity = normalizeInputDeviceIdentity(value, index), key = `${identity.kind}:${identity.index}:${identity.id}`
    if (seen.has(key)) return []
    seen.add(key)
    return [identity]
  })
}

/** 结构说明（自动提取）：normalizeInputMap；输入 source；直接调用 Array.isArray、defaultInputMap、Set、slice、item.name.trim 等；包含循环处理。 */ export function normalizeInputMap(source: unknown): InputAction[] {
  if (!Array.isArray(source)) return defaultInputMap()
  const names = new Set<string>()
  const actions: InputAction[] = []
  for (const raw of source) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Partial<InputAction>
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 80) : ''
    if (!name || names.has(name)) continue
    names.add(name)
    const kind: InputActionKind = item.kind === 'axis' || item.kind === 'vector2' ? item.kind : 'button'
    const bindings = Array.isArray(item.bindings) ? item.bindings.flatMap(/** 结构说明（自动提取）：item.bindings.flatMap 回调；输入 rawBinding；直接调用 INPUT_DEVICES.includes、normalizePenBindingCode、Math.min、Math.max、finite 等。 */ rawBinding => {
      if (!rawBinding || typeof rawBinding !== 'object') return []
      const binding = rawBinding as Partial<InputBinding>
      const device = INPUT_DEVICES.includes(binding.device as InputDevice) ? binding.device as InputDevice : 'keyboard'
      const responseCurves: InputResponseCurve[] = ['linear', 'square', 'cubic', 'exponential']
      const allowedModifiers: InputModifier[] = ['Control', 'Shift', 'Alt', 'Meta']
      return [{
        device,
        code: normalizePenBindingCode(device, typeof binding.code === 'string' ? binding.code : device === 'keyboard' ? 'Space' : '0'),
        scale: Math.min(100, Math.max(-100, finite(binding.scale, 1))),
        x: Math.min(100, Math.max(-100, finite(binding.x, 1))),
        y: Math.min(100, Math.max(-100, finite(binding.y, 0))),
        gamepad: Math.min(15, Math.max(0, Math.round(finite(binding.gamepad, 0)))),
        deviceId: typeof binding.deviceId === 'string' ? binding.deviceId.trim().slice(0, 160) : '',
        deadzone: Math.min(.99, Math.max(0, finite(binding.deadzone, defaultDeadzone(device)))),
        threshold: Math.min(1, Math.max(0, finite(binding.threshold, .0001))),
        invert: binding.invert === true,
        responseCurve: responseCurves.includes(binding.responseCurve as InputResponseCurve) ? binding.responseCurve as InputResponseCurve : 'linear',
        modifiers: Array.isArray(binding.modifiers) ? [...new Set(binding.modifiers.filter(/* 调用 allowedModifiers.includes(value as InputModifier) 并返回调用结果。 */ (value): value is InputModifier => allowedModifiers.includes(value as InputModifier)))].slice(0, 4) : [],
        chord: Array.isArray(binding.chord) ? [...new Set(binding.chord.filter(/* 比较 typeof value 与 'string'，返回严格相等的判断结果。 */ value => typeof value === 'string').map(/* 调用 value.slice(0, 80) 并返回调用结果。 */ value => value.slice(0, 80)).filter(Boolean))].slice(0, 8) : []
      }]
    }) : []
    const interactions: InputInteraction[] = ['press', 'hold', 'tap', 'multiTap']
    actions.push({
      name, kind, bindings: bindings.slice(0, 32), enabled: item.enabled !== false,
      context: typeof item.context === 'string' ? item.context.trim().slice(0, 80) || 'Gameplay' : 'Gameplay',
      map: typeof item.map === 'string' ? item.map.trim().slice(0, 80) || 'Default' : 'Default',
      schemes: Array.isArray(item.schemes) ? [...new Set(item.schemes.filter(/* 比较 typeof value 与 'string'，返回严格相等的判断结果。 */ value => typeof value === 'string').map(/* 调用 value.trim().slice(0, 80) 并返回调用结果。 */ value => value.trim().slice(0, 80)).filter(Boolean))].slice(0, 16) : [],
      interaction: interactions.includes(item.interaction as InputInteraction) ? item.interaction as InputInteraction : 'press',
      holdSeconds: Math.min(60, Math.max(.001, finite(item.holdSeconds, .35))),
      tapSeconds: Math.min(10, Math.max(.001, finite(item.tapSeconds, .25))),
      multiTapCount: Math.min(16, Math.max(2, Math.round(finite(item.multiTapCount, 2)))),
      consume: item.consume === true,
      priority: Math.min(10_000, Math.max(-10_000, Math.round(finite(item.priority, 0)))),
      callback: typeof item.callback === 'string' ? item.callback.trim().slice(0, 80) : ''
    })
  }
  return actions.length ? actions.slice(0, 128) : defaultInputMap()
}

/** Replaces one project input binding without changing the action's axis/vector semantics. */
/** 结构说明（自动提取）：rebindInputAction；输入 actions、actionName、bindingIndex、value；直接调用 actions.find、Number.isInteger、INPUT_DEVICES.includes、action.bindings.push、createInputBinding 等；写入 action.bindings[…]；包含循环处理。 */ export function rebindInputAction(actions: InputAction[], actionName: string, bindingIndex: number, value: Pick<InputBinding, 'device' | 'code'>): boolean {
  const action = actions.find(/* 比较 candidate.name 与 actionName，返回严格相等的判断结果。 */ candidate => candidate.name === actionName)
  if (!action || !Number.isInteger(bindingIndex) || bindingIndex < 0 || bindingIndex > 31 || !value || !INPUT_DEVICES.includes(value.device)) return false
  while (action.bindings.length <= bindingIndex) action.bindings.push(createInputBinding(value.device, value.code))
  const previous = action.bindings[bindingIndex]
  action.bindings[bindingIndex] = { ...previous, device: value.device, code: normalizePenBindingCode(value.device, value.code) }
  return true
}

/** 结构说明（自动提取）：bindingSignature；输入 binding；直接调用 join、sort。 */ function bindingSignature(binding: InputBinding): string {
  return [binding.device, binding.deviceId || binding.gamepad, binding.code, [...binding.modifiers].sort().join('+'), [...binding.chord].sort().join('+')].join(':')
}

/** 结构说明（自动提取）：looksLikePhysicalKeyCode；输入 code；直接调用 test。 */ function looksLikePhysicalKeyCode(code: string): boolean {
  return /^(?:Key[A-Z]|Digit[0-9]|Numpad[A-Za-z0-9]+|Arrow(?:Up|Down|Left|Right)|F(?:[1-9]|1[0-9]|2[0-4])|(?:Shift|Control|Alt|Meta)(?:Left|Right)|Space|Enter|Escape|Tab|Backspace|Delete|Insert|Home|End|Page(?:Up|Down)|CapsLock|ContextMenu|Bracket(?:Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote|Minus|Equal)$/.test(code)
}

/* 根据 code.length === 1 的真假，分别返回 code.toLocaleLowerCase() 或 code。 */ function logicalKey(code: string): string { return code.length === 1 ? code.toLocaleLowerCase() : code }

/** 结构说明（自动提取）：pointerButtonMask；输入 button。 */ function pointerButtonMask(button: number): number {
  if (button === 0) return 1
  if (button === 1) return 4
  if (button === 2) return 2
  if (button === 3) return 8
  if (button === 4) return 16
  if (button === 5) return 32
  return button >= 0 && button < 31 ? 1 << button : 0
}

/** Finds deterministic duplicate physical bindings without treating two bindings inside one action as a conflict. */
/** 结构说明（自动提取）：detectInputConflicts；输入 actions；直接调用 Map、normalizeInputMap、action.bindings.entries、bindingSignature、seen.get 等；包含循环处理。 */ export function detectInputConflicts(actions: InputAction[]): InputConflict[] {
  const seen = new Map<string, { action: string; bindingIndex: number }>()
  const conflicts: InputConflict[] = []
  for (const action of normalizeInputMap(actions)) for (const [bindingIndex, binding] of action.bindings.entries()) {
    const signature = bindingSignature(binding), previous = seen.get(signature)
    if (previous && previous.action !== action.name) conflicts.push({ signature, action: action.name, bindingIndex, conflictsWithAction: previous.action, conflictsWithBindingIndex: previous.bindingIndex })
    else if (!previous) seen.set(signature, { action: action.name, bindingIndex })
  }
  return conflicts.sort(/* 先计算 first.signature.localeCompare(second.signature)；仅当其为假值时求右侧 first.action.localeCompare(second.action)，返回短路求值结果。 */ (first, second) => first.signature.localeCompare(second.signature) || first.action.localeCompare(second.action))
}

/** 结构说明（自动提取）：cloneSnapshot；输入 snapshot；直接调用 Object.fromEntries、map、Object.entries、snapshot.devices.map。 */ function cloneSnapshot(snapshot: InputSnapshot): InputSnapshot {
  return {
    down: { ...snapshot.down }, pressed: { ...snapshot.pressed }, released: { ...snapshot.released }, performed: { ...snapshot.performed }, cancelled: { ...snapshot.cancelled }, phases: { ...snapshot.phases }, durations: { ...snapshot.durations }, tapCounts: { ...snapshot.tapCounts }, consumed: { ...snapshot.consumed }, axes: { ...snapshot.axes }, edges: (Array.isArray(snapshot.edges) ? snapshot.edges : []).slice(0, INPUT_EDGE_CAPACITY * 128).filter(edge => edge && typeof edge.action === 'string' && typeof edge.down === 'boolean' && Number.isSafeInteger(edge.sequence) && edge.sequence >= 0 && Number.isFinite(edge.timeMs)).map(edge => ({ action: edge.action.slice(0, 160), down: edge.down, sequence: edge.sequence, timeMs: Math.max(0, edge.timeMs) })),
    vectors: Object.fromEntries(Object.entries(snapshot.vectors).map(/* 返回按声明顺序构造的数组 [key, [...value] as [number, number]]。 */ ([key, value]) => [key, [...value] as [number, number]])),
    mousePosition: [...snapshot.mousePosition], mouseWorldPosition: [...snapshot.mouseWorldPosition], viewBounds: [...snapshot.viewBounds], viewportSize: [...snapshot.viewportSize], wheel: [...snapshot.wheel], pointerDelta: [...snapshot.pointerDelta], touches: snapshot.touches,
    devices: snapshot.devices.map(/** 构造并返回记录 { ...device }，字段按当前实参及捕获状态求值。 */ device => ({ ...device })), contexts: [...snapshot.contexts], maps: [...snapshot.maps], scheme: snapshot.scheme
  }
}

/** 结构说明（自动提取）：emptySnapshot；无显式参数。 */ function emptySnapshot(): InputSnapshot {
  return { down: {}, pressed: {}, released: {}, performed: {}, cancelled: {}, phases: {}, durations: {}, tapCounts: {}, consumed: {}, axes: {}, vectors: {}, mousePosition: [0, 0], mouseWorldPosition: [0, 0], viewBounds: [0, 0, 0, 0], viewportSize: [0, 0], wheel: [0, 0], pointerDelta: [0, 0], touches: 0, devices: [], contexts: ['Gameplay'], maps: ['Default'], scheme: 'Any' }
}

export class InputManager {
  private keyboard = new Set<string>()
  private logicalKeys = new Set<string>()
  private modifiers = new Set<InputModifier>()
  private mouseButtons = new Set<number>()
  private sampledKeyboard = new Set<string>()
  private sampledLogicalKeys = new Set<string>()
  private sampledModifiers = new Set<InputModifier>()
  private sampledMouseButtons = new Set<number>()
  private digitalEdges: DigitalInputEdge[] = []
  private edgeOverflowed = false
  readonly edgeDiagnostics = { capacity: INPUT_EDGE_CAPACITY, queued: 0, sequence: 0, overflows: 0, dropped: 0, resynchronizations: 0 }
  private observation: InputObservationState | null = null
  private nextObservationEpoch = 0
  readonly observationDiagnostics = { invalidClock: 0, callbackErrors: 0, lastFailure: null as string | null }
  private touches = new Map<number, { x: number; y: number; previousX: number; previousY: number; startX: number; startY: number; startedAt: number }>()
  private pens = new Map<number, PenInputState>()
  private lastPenPointerId: number | null = null
  private gestures = new Map<string, number>()
  private pairGesture: { distance: number; angle: number; centerX: number; centerY: number } | null = null
  private lastTouchTapAt = -Infinity
  private pointerDeduplicator = new TouchPointerDeduplicator()
  private virtualActions = new Map<string, number | [number, number]>()
  private previousDown = new Map<string, boolean>()
  private interactionState = new Map<string, { startedAt: number; lastTapAt: number; taps: number; performed: boolean }>()
  private contexts: Array<{ name: string; priority: number; consume: boolean }> = [{ name: 'Gameplay', priority: 0, consume: false }]
  private maps = new Set(['Default'])
  private scheme = 'Any'
  private wheelX = 0
  private wheelY = 0
  private clientX = 0
  private clientY = 0
  private movementX = 0
  private movementY = 0
  private attached = false
  private current = emptySnapshot()
  private devices = new Map<string, InputDeviceIdentity>()
  private sampledGamepads: Gamepad[] = []
  private lastGamepadInventoryAt = -Infinity
  private gamepadInventorySignature = ''
  private deviceListeners = new Set<(device: InputDeviceIdentity, event: 'connected' | 'disconnected') => void>()
  private recording: { startedAt: number; frames: InputRecordingFrame[] } | null = null
  private replay: { recording: InputRecording; startedAt: number; index: number; loop: boolean } | null = null
  // 26.45: rebinding capture: the next key, mouse button or gamepad button pressed (Escape cancels).
  private capture: { result: Pick<InputBinding, 'device' | 'code'> | 'cancelled' | null; heldButtons: Set<string> | null } | null = null
  // 26.46: timed press/release/move events for rhythm judgement, only collected while a reader is open.
  private timedReaders = 0
  private timedEvents: TimedInputEvent[] = []
  private timedPointers = new Set<number>()
  private timedKeyIds = new Map<string, number>()
  readonly timedDiagnostics = { dropped: 0, collected: 0 }

  /** Starts collecting timed input; call the returned function to stop (readers are counted). */
  openTimedInput(): () => void {
    this.timedReaders++
    let open = true
    return () => { if (!open) return; open = false; this.timedReaders = Math.max(0, this.timedReaders - 1); if (!this.timedReaders) { this.timedEvents = []; this.timedPointers.clear() } }
  }
  /** Timed events since the last call, oldest first. */
  takeTimedInput(): TimedInputEvent[] { const events = this.timedEvents; this.timedEvents = []; return events }
  get collectingTimedInput(): boolean { return this.timedReaders > 0 }
  private pushTimed(event: TimedInputEvent): void {
    if (!this.timedReaders) return
    if (this.timedEvents.length >= TIMED_INPUT_CAPACITY) { this.timedEvents.shift(); this.timedDiagnostics.dropped++ }
    this.timedEvents.push(event); this.timedDiagnostics.collected++
  }
  private timedKeyId(code: string): number { let id = this.timedKeyIds.get(code); if (id === undefined) { id = -1 - this.timedKeyIds.size; this.timedKeyIds.set(code, id) } return id }
  private timedKey(event: KeyboardEvent, down: boolean): void {
    if (!this.timedReaders || event.repeat || event.isComposing || this.isTypingTarget(event.target)) return
    const now = performance.now()
    this.pushTimed({ kind: down ? 'press' : 'release', device: 'key', code: event.code || event.key, id: this.timedKeyId(event.code || event.key), clientX: this.clientX, clientY: this.clientY, timeMs: eventTimeMs(event.timeStamp, now) })
  }
  /** Pointers count on the game surface only, so editor panels and native controls never judge notes. */
  private timedPointer(event: PointerEvent, kind: TimedInputEvent['kind']): void {
    if (!this.timedReaders) return
    if (kind === 'press') {
      if (typeof Element !== 'undefined' && event.target instanceof Element && !event.target.closest('[data-game-input-surface]')) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      this.timedPointers.add(event.pointerId)
    } else if (!this.timedPointers.has(event.pointerId)) return
    if (kind === 'release') this.timedPointers.delete(event.pointerId)
    const now = performance.now()
    // Coalesced moves keep fast flicks accurate when the browser batches pointer events per frame.
    const samples = kind === 'move' && typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
    for (const sample of samples.length ? samples : [event]) this.pushTimed({ kind, device: 'pointer', code: event.pointerType || 'mouse', id: event.pointerId, clientX: sample.clientX, clientY: sample.clientY, timeMs: eventTimeMs(sample.timeStamp, now) })
  }

  /** 26.45: starts listening for the next key, mouse button or gamepad button (for rebinding). */
  beginBindingCapture(): void { this.capture = { result: null, heldButtons: null } }
  cancelBindingCapture(): void { this.capture = null }
  get capturingBinding(): boolean { return this.capture !== null }
  /** The captured binding ('cancelled' after Escape), once; null while still listening. */
  takeBindingCapture(): Pick<InputBinding, 'device' | 'code'> | 'cancelled' | null {
    const result = this.capture?.result ?? null
    if (result) this.capture = null
    return result
  }
  private captureGamepadButtons(): void {
    const capture = this.capture
    if (!capture || capture.result) return
    const held = new Set<string>()
    for (const gamepad of this.readGamepads()) gamepad.buttons.forEach((button, index) => { if (button.pressed || button.value >= .5) held.add(String(index)) })
    // Buttons already held when listening started do not count until released and pressed again.
    if (capture.heldButtons) for (const code of held) if (!capture.heldButtons.has(code)) { capture.result = { device: 'gamepad-button', code }; return }
    capture.heldButtons = held
  }

  readonly onKeyDown = /** 结构说明（自动提取）：匿名回调；输入 event；直接调用 isTypingTarget、keyboard.add、logicalKeys.add、logicalKey、updateModifiers 等。 */ (event: KeyboardEvent) => {
    if (this.capture && !this.capture.result && !event.repeat && !event.isComposing && !this.isTypingTarget(event.target)) {
      this.capture.result = event.code === 'Escape' ? 'cancelled' : { device: 'keyboard', code: event.code || event.key }
    }
    if (!event.defaultPrevented && event.keyCode !== 229) this.timedKey(event, true)
    if (!event.defaultPrevented && !event.isComposing && event.keyCode !== 229 && !this.isTypingTarget(event.target) && !this.edgeOverflowed) {
      const changed = !this.keyboard.has(event.code)
      this.keyboard.add(event.code); this.logicalKeys.add(logicalKey(event.key)); this.updateModifiers(event)
      if (changed && !event.repeat) { if (latencyProbe.enabled) latencyProbe.inputReceived('key', event.code, true, event.timeStamp); this.recordDigitalEdge('key', event.code, logicalKey(event.key), 0, true) }
      if (!event.repeat) setInputModality('keyboard')
    }
  }
  readonly onKeyUp = (event: KeyboardEvent) => { this.timedKey(event, false); const changed = this.keyboard.delete(event.code); this.logicalKeys.delete(logicalKey(event.key)); this.updateModifiers(event); if (changed && latencyProbe.enabled) latencyProbe.inputReceived('key', event.code, false, event.timeStamp); if (changed) this.recordDigitalEdge('key', event.code, logicalKey(event.key), 0, false, !this.observation || !event.defaultPrevented && !event.isComposing && event.keyCode !== 229 && !this.isTypingTarget(event.target)) }
  readonly onMouseDown = (event: MouseEvent) => { if (this.capture && !this.capture.result && this.acceptMouse(event)) this.capture.result = { device: 'mouse-button', code: String(event.button) }; if (this.acceptMouse(event) && !this.edgeOverflowed) { const changed = !this.mouseButtons.has(event.button); this.mouseButtons.add(event.button); if (changed && latencyProbe.enabled) latencyProbe.inputReceived('mouse-button', String(event.button), true, event.timeStamp); if (changed) this.recordDigitalEdge('mouse', '', '', event.button, true, !this.observation || !event.defaultPrevented && !this.isTypingTarget(event.target)); setInputModality('mouse') } }
  readonly onMouseUp = (event: MouseEvent) => { if (this.acceptMouse(event) && this.mouseButtons.delete(event.button)) this.recordDigitalEdge('mouse', '', '', event.button, false, !this.observation || !event.defaultPrevented && !this.isTypingTarget(event.target)) }
  readonly onMouseMove = /** 结构说明（自动提取）：匿名回调；输入 event；直接调用 acceptMouse、Math.abs、setInputModality；写入 clientX、clientY、movementX、movementY。 */ (event: MouseEvent) => { if (!this.acceptMouse(event)) return; this.clientX = event.clientX; this.clientY = event.clientY; this.movementX += event.movementX; this.movementY += event.movementY; if (Math.abs(event.movementX) + Math.abs(event.movementY) >= 1) setInputModality('mouse') }
  /** Only unhandled game-surface wheel input belongs to gameplay; editor and native controls keep scrolling. */
  readonly onWheel = (event: WheelEvent) => {
    if (event.defaultPrevented || this.isTypingTarget(event.target)) return
    if (typeof Element !== 'undefined' && event.target instanceof Element && !event.target.closest('[data-game-input-surface]')) return
    this.wheelX += event.deltaX; this.wheelY += event.deltaY
    if (Math.abs(event.deltaX) + Math.abs(event.deltaY) >= .5) setInputModality('mouse')
  }
  readonly onFocusIn = (event: FocusEvent) => { if (this.isTypingTarget(event.target)) this.releaseAllInputs('focus') }
  readonly onBlur = /* 调用 this.releaseTransientInput() 并返回调用结果。 */ () => this.releaseTransientInput('blur')
  readonly onPageHide = /* 调用 this.releaseTransientInput() 并返回调用结果。 */ () => this.releaseTransientInput('hidden')
  readonly onVisibilityChange = /** 结构说明（自动提取）：匿名回调；无显式参数；直接调用 releaseTransientInput。 */ () => { if (typeof document !== 'undefined' && document.hidden) this.releaseTransientInput('hidden') }
  readonly onTouchStart = /** 结构说明（自动提取）：匿名回调；输入 event；直接调用 performance.now、mouseButtons.clear、Array.from、pointerDeduplicator.recordTouch、touches.set 等；写入 clientX、clientY；包含循环处理。 */ (event: TouchEvent) => {
    const now = performance.now()
    this.mouseButtons.clear()
    for (const touch of Array.from(event.changedTouches)) { this.pointerDeduplicator.recordTouch(now, touch.clientX, touch.clientY); this.touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY, previousX: touch.clientX, previousY: touch.clientY, startX: touch.clientX, startY: touch.clientY, startedAt: now }); this.clientX = touch.clientX; this.clientY = touch.clientY }
    if (event.changedTouches.length) setInputModality('touch')
    this.resetPairGesture()
  }
  readonly onTouchMove = /** 结构说明（自动提取）：匿名回调；输入 event；直接调用 performance.now、Array.from、touches.get、pointerDeduplicator.recordTouch、gestures.set 等；写入 state.previousX、state.previousY、state.x、state.y 等；包含循环处理。 */ (event: TouchEvent) => {
    const now = performance.now()
    let moved = false
    for (const touch of Array.from(event.changedTouches)) { const state = this.touches.get(touch.identifier); this.pointerDeduplicator.recordTouch(now, touch.clientX, touch.clientY); if (state) { state.previousX = state.x; state.previousY = state.y; state.x = touch.clientX; state.y = touch.clientY; const dx = state.x - state.previousX, dy = state.y - state.previousY; this.gestures.set('pan-x', Math.max(-1, Math.min(1, dx / 48))); this.gestures.set('pan-y', Math.max(-1, Math.min(1, dy / 48))); moved ||= Math.abs(dx) + Math.abs(dy) >= 1; this.clientX = touch.clientX; this.clientY = touch.clientY } }
    if (moved) setInputModality('touch')
    const pair = [...this.touches.values()]
    if (pair.length >= 2) {
      const distance = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y), angle = Math.atan2(pair[1].y - pair[0].y, pair[1].x - pair[0].x), centerX = (pair[0].x + pair[1].x) / 2, centerY = (pair[0].y + pair[1].y) / 2
      this.pairGesture ??= { distance, angle, centerX, centerY }
      this.gestures.set('pinch', this.pairGesture.distance > 1e-6 ? Math.max(-1, Math.min(1, distance / this.pairGesture.distance - 1)) : 0)
      let delta = angle - this.pairGesture.angle; while (delta > Math.PI) delta -= Math.PI * 2; while (delta < -Math.PI) delta += Math.PI * 2
      this.gestures.set('rotate', Math.max(-1, Math.min(1, delta / Math.PI)))
      this.gestures.set('two-finger-pan-x', Math.max(-1, Math.min(1, (centerX - this.pairGesture.centerX) / 96))); this.gestures.set('two-finger-pan-y', Math.max(-1, Math.min(1, (centerY - this.pairGesture.centerY) / 96)))
    }
  }
  readonly onTouchEnd = /** 结构说明（自动提取）：匿名回调；输入 event；直接调用 performance.now、Array.from、pointerDeduplicator.recordTouch、touches.get、Math.hypot 等；写入 lastTouchTapAt；包含循环处理。 */ (event: TouchEvent) => {
    const now = performance.now()
    for (const touch of Array.from(event.changedTouches)) { this.pointerDeduplicator.recordTouch(now, touch.clientX, touch.clientY); const state = this.touches.get(touch.identifier); if (!state) continue; const dx = touch.clientX - state.startX, dy = touch.clientY - state.startY, elapsed = now - state.startedAt, distance = Math.hypot(dx, dy); if (elapsed <= 350 && distance < 18) { this.gestures.set('tap', 1); if (now - this.lastTouchTapAt <= 450) this.gestures.set('double-tap', 1); this.lastTouchTapAt = now } else if (elapsed >= 500 && distance < 18) this.gestures.set('long-press', 1); else { this.gestures.set('swipe-x', Math.max(-1, Math.min(1, dx / 120))); this.gestures.set('swipe-y', Math.max(-1, Math.min(1, dy / 120))) }; this.touches.delete(touch.identifier) }
    this.resetPairGesture()
  }
  readonly onTouchCancel = /** 结构说明（自动提取）：匿名回调；输入 event；直接调用 performance.now、Array.from、pointerDeduplicator.recordTouch、touches.delete、gestures.clear 等；包含循环处理。 */ (event: TouchEvent) => {
    const now = performance.now()
    for (const touch of Array.from(event.changedTouches)) { this.pointerDeduplicator.recordTouch(now, touch.clientX, touch.clientY); this.touches.delete(touch.identifier) }
    this.gestures.clear()
    this.resetPairGesture()
  }
  readonly onPointerDown = /** 结构说明（自动提取）：匿名回调；输入 event；直接调用 updatePen、setInputModality。 */ (event: PointerEvent) => {
    this.timedPointer(event, 'press')
    if (event.pointerType !== 'pen') return
    this.updatePen(event)
    setInputModality('pen')
  }
  readonly onPointerMove = /** 结构说明（自动提取）：匿名回调；输入 event；直接调用 pens.get、Math.abs、updatePen、setInputModality。 */ (event: PointerEvent) => {
    this.timedPointer(event, 'move')
    if (event.pointerType !== 'pen') return
    const previous = this.pens.get(event.pointerId), moved = !previous || Math.abs(event.clientX - previous.x) + Math.abs(event.clientY - previous.y) >= 1 || Math.abs(event.pressure - previous.pressure) >= .01 || Math.abs(event.tiltX - previous.tiltX) + Math.abs(event.tiltY - previous.tiltY) >= 1 || event.twist !== previous.twist
    this.updatePen(event)
    if (moved) setInputModality('pen')
  }
  readonly onPointerUp = /** 结构说明（自动提取）：匿名回调；输入 event；直接调用 releasePen。 */ (event: PointerEvent) => { this.timedPointer(event, 'release'); if (event.pointerType === 'pen') this.releasePen(event.pointerId, event.clientX, event.clientY) }
  readonly onPointerCancel = /** 结构说明（自动提取）：匿名回调；输入 event；直接调用 releasePen。 */ (event: PointerEvent) => { this.timedPointer(event, 'release'); if (event.pointerType === 'pen') this.releasePen(event.pointerId, event.clientX, event.clientY) }
  readonly onGamepadConnected = /* 调用 this.updateGamepad(event.gamepad, true) 并返回调用结果。 */ (event: GamepadEvent) => this.updateGamepad(event.gamepad, true)
  readonly onGamepadDisconnected = /* 调用 this.updateGamepad(event.gamepad, false) 并返回调用结果。 */ (event: GamepadEvent) => this.updateGamepad(event.gamepad, false)

  /** 结构说明（自动提取）：start；无显式参数；直接调用 window.addEventListener、document.addEventListener、devices.set；写入 attached。 */ start(): void {
    if (this.attached) return
    this.attached = true
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('focusin', this.onFocusIn)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('wheel', this.onWheel, { passive: true })
    window.addEventListener('touchstart', this.onTouchStart, { passive: true })
    window.addEventListener('touchmove', this.onTouchMove, { passive: true })
    window.addEventListener('touchend', this.onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', this.onTouchCancel, { passive: true })
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true })
    window.addEventListener('pointermove', this.onPointerMove, { passive: true })
    window.addEventListener('pointerup', this.onPointerUp, { passive: true })
    window.addEventListener('pointercancel', this.onPointerCancel, { passive: true })
    window.addEventListener('lostpointercapture', this.onPointerCancel, { passive: true })
    window.addEventListener('gamepadconnected', this.onGamepadConnected)
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('pagehide', this.onPageHide)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.devices.set('keyboard:0', { id: 'keyboard:0', kind: 'keyboard', index: 0, connected: true, mapping: 'standard' })
    this.devices.set('mouse:0', { id: 'mouse:0', kind: 'mouse', index: 0, connected: true, mapping: 'pointer' })
  }

  /** 结构说明（自动提取）：stop；无显式参数；直接调用 window.removeEventListener、document.removeEventListener、releaseAllInputs、devices.clear、previousDown.clear 等；写入 attached、sampledGamepads、lastGamepadInventoryAt、gamepadInventorySignature 等。 */ stop(): void {
    if (this.attached) {
      this.attached = false
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('focusin', this.onFocusIn)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('touchstart', this.onTouchStart)
    window.removeEventListener('touchmove', this.onTouchMove)
    window.removeEventListener('touchend', this.onTouchEnd)
    window.removeEventListener('touchcancel', this.onTouchCancel)
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerCancel)
    window.removeEventListener('lostpointercapture', this.onPointerCancel)
    window.removeEventListener('gamepadconnected', this.onGamepadConnected)
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('pagehide', this.onPageHide)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    }
    this.releaseAllInputs('stop')
    this.digitalEdges = []; this.edgeDiagnostics.queued = 0; this.edgeOverflowed = false
    this.sampledKeyboard.clear(); this.sampledLogicalKeys.clear(); this.sampledModifiers.clear(); this.sampledMouseButtons.clear()
    this.devices.clear()
    this.sampledGamepads = []
    this.lastGamepadInventoryAt = -Infinity
    this.gamepadInventorySignature = ''
    this.previousDown.clear()
    this.interactionState.clear()
    this.contexts = [{ name: 'Gameplay', priority: 0, consume: false }]
    this.maps = new Set(['Default'])
    this.scheme = 'Any'
    this.current = emptySnapshot()
    this.recording = null
    this.replay = null
    this.capture = null
  }

  /** 结构说明（自动提取）：sample；输入 actions、viewport；直接调用 sampleReplay、actions.some、some、devices.values、readGamepads 等；写入 current、sampledGamepads、snapshot.mousePosition、snapshot.wheel 等；返回路径包含 replayed、snapshot；包含循环处理。 */ sample(actions: InputAction[], viewport?: DOMRect): InputSnapshot {
    if (this.observation) { this.observation.consumed = null; this.observation.sampleSequence++ }
    const replayed = this.sampleReplay()
    if (replayed) { this.observation?.receipts.clear(); this.current = replayed; return replayed }
    if (this.capture) this.captureGamepadButtons()
    const samplesGamepad = actions.some(/* 调用 action.bindings.some(binding => binding.device === 'gamepad-button' || binding.device === 'gamepad-axis') 并返回调用结果。 */ action => action.bindings.some(/* 先计算 binding.device === 'gamepad-button'；仅当其为假值时求右侧 binding.device === 'gamepad-axis'，返回短路求值结果。 */ binding => binding.device === 'gamepad-button' || binding.device === 'gamepad-axis')) || [...this.devices.values()].some(/* 先计算 device.kind === 'gamepad'；仅当其为真值时求右侧 device.connected，返回短路求值结果。 */ device => device.kind === 'gamepad' && device.connected)
    this.sampledGamepads = samplesGamepad ? this.readGamepads() : []
    if (samplesGamepad) { this.synchronizeGamepadInventory(this.sampledGamepads); this.detectMeaningfulGamepadActivity(this.sampledGamepads) }
    const snapshot = emptySnapshot()
    snapshot.mousePosition = viewport
      ? [this.clientX - viewport.left, this.clientY - viewport.top]
      : [this.clientX, this.clientY]
    snapshot.wheel = [this.wheelX, this.wheelY]
    snapshot.pointerDelta = [this.movementX, this.movementY]
    snapshot.touches = this.touches.size
    snapshot.devices = this.deviceSnapshot()
    snapshot.contexts = this.contexts.map(/* 返回 context.name 的当前值。 */ context => context.name)
    snapshot.maps = [...this.maps].sort()
    snapshot.scheme = this.scheme
    const activeContexts = new Map(this.contexts.map(/* 返回按声明顺序构造的数组 [context.name, context]。 */ context => [context.name, context]))
    const consumedBindings = new Set<string>()
    const ordered = normalizeInputMap(actions).filter(/** 结构说明（自动提取）：filter 回调；输入 action；直接调用 maps.has、activeContexts.has、action.schemes.includes；返回表达式求值结果。 */ action => action.enabled && this.maps.has(action.map) && activeContexts.has(action.context) && (!action.schemes.length || this.scheme === 'Any' || action.schemes.includes(this.scheme))).sort(/** 结构说明（自动提取）：sort 回调；输入 first、second；直接调用 activeContexts.get、first.name.localeCompare。 */ (first, second) => {
      const contextDelta = (activeContexts.get(second.context)?.priority ?? 0) - (activeContexts.get(first.context)?.priority ?? 0)
      return contextDelta || second.priority - first.priority || first.name.localeCompare(second.name)
    })
    const now = performance.now() / 1_000
    const transitions = this.consumeDigitalEdges(ordered, activeContexts)
    snapshot.edges = [...transitions].flatMap(([action, edges]) => edges.map(edge => ({ action, ...edge }))).sort((a, b) => a.sequence - b.sequence)
    const nowMs = now * 1_000
    for (const touch of this.touches.values()) if (nowMs - touch.startedAt >= 500 && Math.hypot(touch.x - touch.startX, touch.y - touch.startY) < 18) this.gestures.set('long-press', 1)
    for (const action of ordered) {
      const values = action.bindings.map(/* 根据 consumedBindings.has(bindingSignature(binding)) 的真假，分别返回 0 或 this.bindingValue(binding)。 */ binding => consumedBindings.has(bindingSignature(binding)) ? 0 : this.bindingValue(binding))
      if (action.kind === 'vector2') {
        let x = 0, y = 0
        for (const [index, binding] of action.bindings.entries()) {
          const value = values[index]
          x += value * binding.x
          y += value * binding.y
        }
        const length = Math.hypot(x, y)
        if (length > 1) { x /= length; y /= length }
        const virtual = this.virtualActions.get(action.name)
        if (Array.isArray(virtual)) { x += virtual[0]; y += virtual[1]; const combined = Math.hypot(x, y); if (combined > 1) { x /= combined; y /= combined } }
        snapshot.vectors[action.name] = [x, y]
        snapshot.axes[action.name] = Math.hypot(x, y)
      } else {
        const virtual = this.virtualActions.get(action.name), virtualValue = typeof virtual === 'number' ? virtual : 0
        const value = Math.min(1, Math.max(-1, action.bindings.reduce(/* 计算表达式 total + values[index] * binding.scale 并返回结果，沿用操作数的原有类型规则。 */ (total, binding, index) => total + values[index] * binding.scale, 0) + virtualValue))
        snapshot.axes[action.name] = value
      }
      const threshold = Math.min(...action.bindings.map(/* 返回 binding.threshold 的当前值。 */ binding => binding.threshold), .0001)
      const down = Math.abs(snapshot.axes[action.name] ?? 0) > threshold
      let previous = this.previousDown.get(action.name) ?? false
      const state = this.interactionState.get(action.name) ?? { startedAt: now, lastTapAt: -Infinity, taps: 0, performed: false }
      let phase: InputPhase = down ? 'started' : 'idle', performed = false, cancelled = false, pressed = false, released = false
      const changes = [...(transitions.get(action.name) ?? []), { down, timeMs: now * 1_000, sequence: this.edgeDiagnostics.sequence }]
      for (const change of changes) {
        const at = change.timeMs / 1_000, held = change.down
        let justPerformed = false
        if (held && !previous) { state.startedAt = at; state.performed = false; phase = 'started'; pressed = true }
        if (!held && previous) released = true
        if (action.interaction === 'press') justPerformed = held && !previous
        else if (action.interaction === 'hold') {
          justPerformed = (held || previous) && !state.performed && Math.max(0, at - state.startedAt) >= action.holdSeconds
          cancelled ||= !held && previous && !state.performed && !justPerformed
        } else if (!held && previous) {
          const validTap = at - state.startedAt <= action.tapSeconds
          if (action.interaction === 'tap') { justPerformed = validTap; cancelled ||= !validTap }
          else if (validTap) { state.taps = at - state.lastTapAt <= action.tapSeconds * 2 ? state.taps + 1 : 1; state.lastTapAt = at; if (state.taps >= action.multiTapCount) { justPerformed = true; state.taps = 0 } }
          else { state.taps = 0; cancelled = true }
        }
        performed ||= justPerformed
        if (justPerformed) state.performed = true
        previous = held
      }
      const duration = down ? Math.max(0, now - state.startedAt) : 0
      if (performed) phase = 'performed'
      else if (cancelled) phase = 'cancelled'
      snapshot.down[action.name] = down
      snapshot.pressed[action.name] = action.interaction === 'press' ? pressed : performed
      snapshot.released[action.name] = released
      snapshot.performed[action.name] = performed
      snapshot.cancelled[action.name] = cancelled
      snapshot.phases[action.name] = phase
      snapshot.durations[action.name] = duration
      snapshot.tapCounts[action.name] = state.taps
      const contextConsumes = activeContexts.get(action.context)?.consume === true
      const consumed = (action.consume || contextConsumes) && (down || performed)
      snapshot.consumed[action.name] = consumed
      if (consumed) action.bindings.forEach(/** 结构说明（自动提取）：action.bindings.forEach 回调；输入 binding、index；直接调用 consumedBindings.add、bindingSignature。 */ (binding, index) => { if (values[index] !== 0) consumedBindings.add(bindingSignature(binding)) })
      this.previousDown.set(action.name, down)
      this.interactionState.set(action.name, state)
    }
    this.wheelX = 0
    this.wheelY = 0
    this.movementX = 0
    this.movementY = 0
    this.gestures.clear()
    this.sampledKeyboard = new Set(this.keyboard); this.sampledLogicalKeys = new Set(this.logicalKeys)
    this.sampledModifiers = new Set(this.modifiers); this.sampledMouseButtons = new Set(this.mouseButtons)
    this.edgeOverflowed = false
    this.current = snapshot
    if (this.recording) this.recording.frames.push({ time: Math.max(0, performance.now() - this.recording.startedAt) / 1000, snapshot: cloneSnapshot(snapshot) })
    return snapshot
  }

  /* 返回 this.current 的当前值。 */ snapshot(): InputSnapshot { return this.current }

  get observationEpoch(): number | null { return this.observation?.epoch ?? null }
  /** Read-only, current sample only. Reading does not drain actions or fixed-step input. */
  get lastConsumedInputObservation(): InputSampleObservation | null { return this.observation?.consumed ?? null }

  setObservationCallbacks(callbacks: InputObservationCallbacks): () => void {
    const state: InputObservationState = { callbacks, epoch: ++this.nextObservationEpoch, sampleSequence: 0, lastClockAtMs: -Infinity, receipts: new Map(), consumed: null }
    this.observation = state
    this.notifyObservationReset(state, 'observer-attached')
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      if (this.observation !== state) return
      this.observation = null; state.receipts.clear(); state.consumed = null
      state.epoch = ++this.nextObservationEpoch
      this.notifyObservationReset(state, 'observer-disposed')
    }
  }

  /** Observation invalidation never changes held state, mappings, or simulation input. */
  resetObservation(reason: InputObservationResetReason = 'release'): void {
    const state = this.observation; if (!state) return
    state.epoch = ++this.nextObservationEpoch; state.receipts.clear(); state.consumed = null
    this.notifyObservationReset(state, reason)
  }

  private notifyObservationReset(state: InputObservationState, reason: InputObservationResetReason): void {
    try { state.callbacks.reset?.(state.epoch, reason) } catch (error) { this.failObservation(state, 'reset', error) }
  }

  private failObservation(state: InputObservationState, phase: string, error: unknown): void {
    this.observationDiagnostics.callbackErrors++
    this.observationDiagnostics.lastFailure = `${phase}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 240)
    if (this.observation === state) { this.observation = null; this.nextObservationEpoch++; state.receipts.clear(); state.consumed = null }
  }

  /** 结构说明（自动提取）：setVirtualAction；输入 actionName、value；直接调用 slice、actionName.trim、Array.isArray、virtualActions.set、Math.min 等。 */ setVirtualAction(actionName: string, value: number | [number, number]): boolean {
    const name = actionName.trim().slice(0, 80); if (!name) return false
    if (Array.isArray(value)) this.virtualActions.set(name, [Math.min(1, Math.max(-1, finite(value[0], 0))), Math.min(1, Math.max(-1, finite(value[1], 0)))])
    else this.virtualActions.set(name, Math.min(1, Math.max(-1, finite(value, 0))))
    return true
  }
  /** 执行时调用 this.virtualActions.delete(actionName.trim())；不显式返回调用结果。 */ releaseVirtualAction(actionName: string): void { this.virtualActions.delete(actionName.trim()) }
  /** 执行时调用 this.virtualActions.clear()；不显式返回调用结果。 */ releaseAllVirtualActions(): void { this.virtualActions.clear() }

  /** 结构说明（自动提取）：pushContext；输入 name、priority、consume；直接调用 slice、name.trim、contexts.find、Math.min、Math.max 等；写入 existing.priority、existing.consume。 */ pushContext(name: string, priority = 0, consume = false): boolean { const clean = name.trim().slice(0, 80); if (!clean) return false; const existing = this.contexts.find(/* 比较 context.name 与 clean，返回严格相等的判断结果。 */ context => context.name === clean); if (existing) { existing.priority = Math.min(10_000, Math.max(-10_000, Math.round(finite(priority, 0)))); existing.consume = consume; return true }; if (this.contexts.length >= 32) return false; this.contexts.push({ name: clean, priority: Math.min(10_000, Math.max(-10_000, Math.round(finite(priority, 0)))), consume }); return true }
  /** 结构说明（自动提取）：popContext；输入 name；直接调用 contexts.findIndex、contexts.splice。 */ popContext(name: string): boolean { const index = this.contexts.findIndex(/* 比较 context.name 与 name.trim()，返回严格相等的判断结果。 */ context => context.name === name.trim()); if (index < 0 || (this.contexts.length === 1 && this.contexts[index].name === 'Gameplay')) return false; this.contexts.splice(index, 1); return true }
  /** 结构说明（自动提取）：enableMap；输入 name；直接调用 slice、name.trim、maps.has、maps.add。 */ enableMap(name: string): boolean { const clean = name.trim().slice(0, 80); if (!clean || this.maps.size >= 32 && !this.maps.has(clean)) return false; this.maps.add(clean); return true }
  /** 结构说明（自动提取）：disableMap；输入 name；直接调用 name.trim、maps.delete。 */ disableMap(name: string): boolean { const clean = name.trim(); if (!clean || clean === 'Default') return false; return this.maps.delete(clean) }
  /** 结构说明（自动提取）：setScheme；输入 name；直接调用 slice、name.trim；写入 scheme。 */ setScheme(name: string): boolean { const clean = name.trim().slice(0, 80); if (!clean) return false; this.scheme = clean; return true }

  /** 结构说明（自动提取）：connectedDevices；无显式参数；直接调用 Date.now、performance.now、readGamepads、synchronizeGamepadInventory、deviceSnapshot；写入 sampledGamepads。 */ connectedDevices(): InputDeviceIdentity[] {
    const now = typeof performance === 'undefined' ? Date.now() : performance.now()
    if (now - this.lastGamepadInventoryAt >= 1_000) {
      this.sampledGamepads = this.readGamepads()
      this.synchronizeGamepadInventory(this.sampledGamepads)
    }
    return this.deviceSnapshot()
  }

  /** 结构说明（自动提取）：onDeviceChange；输入 listener；直接调用 deviceListeners.add。 */ onDeviceChange(listener: (device: InputDeviceIdentity, event: 'connected' | 'disconnected') => void): () => void { this.deviceListeners.add(listener); return /* 调用 this.deviceListeners.delete(listener) 并返回调用结果。 */ () => this.deviceListeners.delete(listener) }

  /** 结构说明（自动提取）：beginRecording；无显式参数；直接调用 performance.now；写入 recording、replay。 */ beginRecording(): void { this.recording = { startedAt: performance.now(), frames: [] }; this.replay = null }
  /** 结构说明（自动提取）：endRecording；无显式参数；直接调用 frames.map；写入 recording。 */ endRecording(): InputRecording { const frames = this.recording?.frames ?? []; this.recording = null; return { version: 1, duration: frames[frames.length - 1]?.time ?? 0, frames: frames.map(/** 构造并返回记录 { time: frame.time, snapshot: cloneSnapshot(frame.snapshot) }，字段按当前实参及捕获状态求值。 */ frame => ({ time: frame.time, snapshot: cloneSnapshot(frame.snapshot) })) } }
  /** 结构说明（自动提取）：playRecording；输入 recording、loop；直接调用 normalizeInputRecording、performance.now；写入 recording、replay。 */ playRecording(recording: InputRecording, loop = false): boolean { const normalized = normalizeInputRecording(recording); if (!normalized.frames.length) return false; this.resetObservation('replay'); this.recording = null; this.replay = { recording: normalized, startedAt: performance.now(), index: 0, loop }; return true }
  /** 将 null 赋给 this.replay，不显式返回值。 */ stopReplay(): void { this.replay = null; this.resetObservation('replay') }

  /** Releases held transient state without erasing action history, so the next sample reports releases/cancellation. */
  /** 结构说明（自动提取）：releaseAllInputs；无显式参数；直接调用 keyboard.clear、logicalKeys.clear、modifiers.clear、mouseButtons.clear、touches.clear 等；写入 lastPenPointerId、pairGesture、lastTouchTapAt、wheelX 等。 */ releaseAllInputs(reason: InputObservationResetReason = 'release'): void {
    this.resetObservation(reason)
    // Input collected while host simulation is suspended must not become a
    // down/up pulse on resume. Keep sampled history so held actions still release.
    if (reason === 'hidden' || reason === 'pause' || reason === 'resume' || reason === 'stop') { this.digitalEdges = []; this.edgeDiagnostics.queued = 0; this.edgeOverflowed = false }
    this.recordDigitalEdge('release', '', '', 0, false)
    if (this.timedReaders) {
      // Held keys and pointers end here (blur, hidden tab, typing focus), so a hold note is not stuck down.
      const now = performance.now()
      for (const code of this.keyboard) this.pushTimed({ kind: 'release', device: 'key', code, id: this.timedKeyId(code), clientX: this.clientX, clientY: this.clientY, timeMs: now })
      for (const id of this.timedPointers) this.pushTimed({ kind: 'release', device: 'pointer', code: 'pointer', id, clientX: this.clientX, clientY: this.clientY, timeMs: now })
      this.timedPointers.clear()
    }
    this.clearHeldInputs()
  }

  private clearHeldInputs(): void {
    this.keyboard.clear()
    this.logicalKeys.clear()
    this.modifiers.clear()
    this.mouseButtons.clear()
    this.touches.clear()
    this.pens.clear()
    this.lastPenPointerId = null
    this.gestures.clear()
    this.virtualActions.clear()
    this.pairGesture = null
    this.lastTouchTapAt = -Infinity
    this.wheelX = 0
    this.wheelY = 0
    this.movementX = 0
    this.movementY = 0
    this.pointerDeduplicator.clear()
  }

  private recordDigitalEdge(device: DigitalInputEdge['device'], code: string, key: string, button: number, down: boolean, observable = true): void {
    if (this.edgeOverflowed) return
    const sequence = ++this.edgeDiagnostics.sequence, timeMs = performance.now()
    if (this.digitalEdges.length >= INPUT_EDGE_CAPACITY) {
      this.edgeDiagnostics.overflows++; this.edgeDiagnostics.dropped += this.digitalEdges.length + 1
      this.edgeDiagnostics.resynchronizations++; this.edgeOverflowed = true
      this.resetObservation('overflow')
      this.digitalEdges = [{ device: 'release', code: '', key: '', button: 0, down: false, modifiers: [], sequence, timeMs }]
      this.clearHeldInputs()
    } else {
      this.digitalEdges.push({ device, code: code.slice(0, 64), key: key.slice(0, 64), button, down, modifiers: [...this.modifiers], sequence, timeMs })
      const state = this.observation
      if (state && observable && device !== 'release' && !this.replay) {
        let receivedAtMs = Number.NaN
        try { receivedAtMs = state.callbacks.nowMs ? state.callbacks.nowMs() : performance.now() } catch (error) { this.failObservation(state, 'clock', error) }
        if (this.observation !== state) { /* Faulty/replaced observers never interfere with edge delivery. */ }
        else if (!Number.isFinite(receivedAtMs) || receivedAtMs < 0 || receivedAtMs < state.lastClockAtMs) this.observationDiagnostics.invalidClock++
        else {
          state.lastClockAtMs = receivedAtMs
          const receipt: InputReceiptObservation = Object.freeze({ inputEpoch: state.epoch, sequence, receivedAtMs, device: device === 'key' ? 'keyboard' : 'mouse-button' })
          state.receipts.set(sequence, receipt)
          try { state.callbacks.receipt(receipt) } catch (error) { this.failObservation(state, 'receipt', error) }
        }
      }
    }
    this.edgeDiagnostics.queued = this.digitalEdges.length
  }

  /** Replay only bounded digital edges, using the same binding and consumption rules as held sampling. */
  private consumeDigitalEdges(actions: InputAction[], contexts: Map<string, { consume: boolean }>): Map<string, Array<Omit<InputActionEdge, 'action'>>> {
    const result = new Map<string, Array<Omit<InputActionEdge, 'action'>>>()
    const batch = this.digitalEdges.splice(0); this.edgeDiagnostics.queued = 0
    if (!batch.length) return result
    const live = { keyboard: this.keyboard, logical: this.logicalKeys, modifiers: this.modifiers, mouse: this.mouseButtons }
    this.keyboard = new Set(this.sampledKeyboard); this.logicalKeys = new Set(this.sampledLogicalKeys)
    this.modifiers = new Set(this.sampledModifiers); this.mouseButtons = new Set(this.sampledMouseButtons)
    const previous = new Map(actions.map(action => [action.name, this.previousDown.get(action.name) ?? false]))
    const observation = this.observation
    const observed = observation ? new Map<number, InputReceiptObservation>() : null
    try {
      for (const edge of batch) {
        const receipt = observation?.receipts.get(edge.sequence)
        // Comparing the same action before/after this raw edge excludes newly polled
        // gamepad/virtual state that merely coincides with an unrelated keyboard event.
        const before = receipt ? this.observationDigitalDown(actions, contexts) : null
        if (edge.device === 'release') { this.keyboard.clear(); this.logicalKeys.clear(); this.modifiers.clear(); this.mouseButtons.clear() }
        else if (edge.device === 'key') { if (edge.down) { this.keyboard.add(edge.code); this.logicalKeys.add(edge.key) } else { this.keyboard.delete(edge.code); this.logicalKeys.delete(edge.key) }; this.modifiers = new Set(edge.modifiers) }
        else if (edge.down) this.mouseButtons.add(edge.button)
        else this.mouseButtons.delete(edge.button)
        const consumed = new Set<string>()
        for (const action of actions) {
          if (!action.bindings.some(binding => ['keyboard', 'physical-key', 'mouse-button'].includes(binding.device))) continue
          const values = action.bindings.map(binding => consumed.has(bindingSignature(binding)) ? 0 : this.bindingValue(binding))
          const down = this.digitalActionDown(action, values)
          if (down !== previous.get(action.name)) {
            const changes = result.get(action.name) ?? []; changes.push({ down, sequence: edge.sequence, timeMs: edge.timeMs }); result.set(action.name, changes); previous.set(action.name, down)
            if (receipt && before?.get(action.name) !== down && receipt.inputEpoch === observation!.epoch) observed!.set(receipt.sequence, receipt)
          }
          if ((action.consume || contexts.get(action.context)?.consume) && down) action.bindings.forEach((binding, index) => { if (values[index]) consumed.add(bindingSignature(binding)) })
        }
      }
    } finally { this.keyboard = live.keyboard; this.logicalKeys = live.logical; this.modifiers = live.modifiers; this.mouseButtons = live.mouse }
    if (observation && this.observation === observation) {
      observation.receipts.clear()
      if (observed!.size) {
        const receipts = Object.freeze([...observed!.values()].sort((a, b) => a.sequence - b.sequence))
        observation.consumed = Object.freeze({ inputEpoch: observation.epoch, sampleSequence: observation.sampleSequence, receipts, latestReceipt: receipts[receipts.length - 1] })
      }
    }
    return result
  }

  private digitalActionDown(action: InputAction, values: number[]): boolean {
    let amount = 0
    const virtual = this.virtualActions.get(action.name)
    if (action.kind === 'vector2') { let x = 0, y = 0; action.bindings.forEach((binding, index) => { x += values[index] * binding.x; y += values[index] * binding.y }); const length = Math.hypot(x, y); if (length > 1) { x /= length; y /= length }; if (Array.isArray(virtual)) { x += virtual[0]; y += virtual[1] }; amount = Math.min(1, Math.hypot(x, y)) }
    else amount = action.bindings.reduce((total, binding, index) => total + values[index] * binding.scale, 0) + (typeof virtual === 'number' ? virtual : 0)
    return Math.abs(amount) > Math.min(...action.bindings.map(binding => binding.threshold), .0001)
  }

  private observationDigitalDown(actions: InputAction[], contexts: Map<string, { consume: boolean }>): Map<string, boolean> {
    const result = new Map<string, boolean>(), consumed = new Set<string>()
    for (const action of actions) {
      if (!action.bindings.some(binding => ['keyboard', 'physical-key', 'mouse-button'].includes(binding.device))) continue
      const values = action.bindings.map(binding => consumed.has(bindingSignature(binding)) ? 0 : this.bindingValue(binding))
      const down = this.digitalActionDown(action, values); result.set(action.name, down)
      if ((action.consume || contexts.get(action.context)?.consume) && down) action.bindings.forEach((binding, index) => { if (values[index]) consumed.add(bindingSignature(binding)) })
    }
    return result
  }

  /** 结构说明（自动提取）：bindingValue；输入 binding；直接调用 binding.modifiers.every、binding.chord.every、logicalKeys.has、logicalKey、looksLikePhysicalKeyCode 等；写入 value。 */ private bindingValue(binding: InputBinding): number {
    if (!binding.modifiers.every(/* 调用 this.modifiers.has(modifier) 并返回调用结果。 */ modifier => this.modifiers.has(modifier)) || !binding.chord.every(/* 先计算 this.keyboard.has(code)；仅当其为假值时求右侧 this.logicalKeys.has(logicalKey(code))，返回短路求值结果。 */ code => this.keyboard.has(code) || this.logicalKeys.has(logicalKey(code)))) return 0
    let value = 0
    if (binding.device === 'keyboard') value = this.logicalKeys.has(logicalKey(binding.code)) || (looksLikePhysicalKeyCode(binding.code) && this.keyboard.has(binding.code)) ? 1 : 0
    else if (binding.device === 'physical-key') value = this.keyboard.has(binding.code) ? 1 : 0
    else if (binding.device === 'mouse-button') value = this.mouseButtons.has(Number.parseInt(binding.code, 10) || 0) ? 1 : 0
    else if (binding.device === 'mouse-wheel') {
      const wheel = binding.code.toLowerCase() === 'x' ? this.wheelX : this.wheelY
      value = wheel === 0 ? 0 : Math.sign(wheel)
    }
    else if (binding.device === 'mouse-motion') value = binding.code.toLowerCase() === 'y' ? this.movementY : this.movementX
    else if (binding.device === 'touch') { const touch = [...this.touches.values()][0]; value = binding.code === 'count' ? this.touches.size : binding.code === 'pressed' ? Number(this.touches.size > 0) : binding.code.endsWith('-y') ? touch?.y ?? 0 : touch?.x ?? 0 }
    else if (binding.device === 'gesture') value = this.gestures.get(binding.code) ?? 0
    else if (binding.device === 'sensor') value = sensorValue(binding.code)
    else if (binding.device.startsWith('pen')) value = this.penBindingValue(binding)
    else {
      const candidates = this.sampledGamepads
      const gamepad = binding.deviceId ? candidates.find(/* 比较 item.id 与 binding.deviceId，返回严格相等的判断结果。 */ item => item.id === binding.deviceId) : candidates.find(/* 比较 item.index 与 binding.gamepad，返回严格相等的判断结果。 */ item => item.index === binding.gamepad)
      if (!gamepad) return 0
      if (binding.device === 'gamepad-button') value = gamepad.buttons[Number.parseInt(binding.code, 10) || 0]?.value ?? 0
      else { const axis = Number.parseInt(binding.code, 10) || 0; value = applyGamepadAxisCalibration(gamepad.axes[axis] ?? 0, gamepad.id, axis) }
    }
    const sign = binding.invert ? -1 : 1, magnitude = Math.abs(value)
    if (magnitude <= binding.deadzone || magnitude < binding.threshold) return 0
    const normalized = Math.min(1, Math.max(0, (magnitude - binding.deadzone) / Math.max(1e-9, 1 - binding.deadzone)))
    const curved = binding.responseCurve === 'square' ? normalized ** 2 : binding.responseCurve === 'cubic' ? normalized ** 3 : binding.responseCurve === 'exponential' ? (Math.exp(normalized) - 1) / (Math.E - 1) : normalized
    return Math.sign(value) * sign * curved
  }

  /** 结构说明（自动提取）：updateModifiers；输入 event；直接调用 modifiers.clear、modifiers.add。 */ private updateModifiers(event: KeyboardEvent): void { this.modifiers.clear(); if (event.ctrlKey) this.modifiers.add('Control'); if (event.shiftKey) this.modifiers.add('Shift'); if (event.altKey) this.modifiers.add('Alt'); if (event.metaKey) this.modifiers.add('Meta') }
  /** 执行时调用 this.releaseAllInputs()；不显式返回调用结果。 */ private releaseTransientInput(reason: InputObservationResetReason): void { this.releaseAllInputs(reason) }
  /** 结构说明（自动提取）：updatePen；输入 event；直接调用 pens.get、finite、Math.max、Math.round、Math.min 等；写入 movementX、movementY、clientX、clientY 等。 */ private updatePen(event: PointerEvent): void {
    const previous = this.pens.get(event.pointerId)
    if (previous) { this.movementX += event.clientX - previous.x; this.movementY += event.clientY - previous.y }
    this.clientX = finite(event.clientX, this.clientX)
    this.clientY = finite(event.clientY, this.clientY)
    const buttons = Math.max(0, Math.round(finite(event.buttons, 0))), button = Math.round(finite(event.button, -1))
    const state: PenInputState = {
      pointerId: Math.max(0, Math.round(finite(event.pointerId, 0))), x: this.clientX, y: this.clientY,
      pressure: Math.min(1, Math.max(0, finite(event.pressure, buttons ? .5 : 0))),
      tiltX: Math.min(90, Math.max(-90, finite(event.tiltX, 0))), tiltY: Math.min(90, Math.max(-90, finite(event.tiltY, 0))),
      twist: Math.min(359, Math.max(0, finite(event.twist, 0))), buttons,
      eraser: button === 5 || (buttons & 32) !== 0
    }
    this.pens.set(state.pointerId, state)
    this.lastPenPointerId = state.pointerId
    this.pointerDeduplicator.recordPointer(performance.now(), state.x, state.y)
    this.devices.set('pen:0', normalizeInputDeviceIdentity({ id: 'pen:0', kind: 'pen', index: 0, connected: true, mapping: 'pointer' }))
  }
  /** 结构说明（自动提取）：releasePen；输入 pointerId、x、y；直接调用 pointerDeduplicator.recordPointer、performance.now、finite、pens.delete、next 等；写入 lastPenPointerId。 */ private releasePen(pointerId: number, x: number, y: number): void {
    this.pointerDeduplicator.recordPointer(performance.now(), finite(x, this.clientX), finite(y, this.clientY))
    this.pens.delete(pointerId)
    if (this.lastPenPointerId === pointerId) this.lastPenPointerId = this.pens.keys().next().value ?? null
  }
  /** 结构说明（自动提取）：penBindingValue；输入 binding；直接调用 pens.get、Number.parseInt、binding.code.replace、Number.isInteger、pointerButtonMask；返回路径包含 state.pressure。 */ private penBindingValue(binding: InputBinding): number {
    const state = this.lastPenPointerId === null ? undefined : this.pens.get(this.lastPenPointerId)
    if (!state) return 0
    if (binding.device === 'pen-pressure') return state.pressure
    if (binding.device === 'pen-tilt') return (binding.code === 'y' ? state.tiltY : state.tiltX) / 90
    if (binding.device === 'pen-twist') return state.twist / 359
    if (binding.code === 'tip') return (state.buttons & 1) !== 0 && !state.eraser ? 1 : 0
    if (binding.code === 'barrel') return (state.buttons & 2) !== 0 ? 1 : 0
    if (binding.code === 'eraser') return state.eraser ? 1 : 0
    const button = Number.parseInt(binding.code.replace(/^button-/, ''), 10)
    return Number.isInteger(button) && (state.buttons & pointerButtonMask(button)) !== 0 ? 1 : 0
  }
  /** 结构说明（自动提取）：readGamepads；无显式参数；直接调用 slice、filter、Array.from、navigator.getGamepads。 */ private readGamepads(): Gamepad[] {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return []
    try { return Array.from(navigator.getGamepads()).filter(/* 调用 Boolean(item && item.connected !== false) 并返回调用结果。 */ (item): item is Gamepad => Boolean(item && item.connected !== false)).slice(0, 16) }
    catch { return [] }
  }
  /** 结构说明（自动提取）：synchronizeGamepadInventory；输入 gamepads；直接调用 Date.now、performance.now、join、sort、gamepads.map 等；写入 lastGamepadInventoryAt、gamepadInventorySignature；包含循环处理。 */ private synchronizeGamepadInventory(gamepads: readonly Gamepad[]): void {
    this.lastGamepadInventoryAt = typeof performance === 'undefined' ? Date.now() : performance.now()
    const signature = gamepads.map(/** 按模板 `${gamepad.index}:${gamepad.id}:${gamepad.mapping}:${gamepad.connected}` 生成并返回字符串。 */ gamepad => `${gamepad.index}:${gamepad.id}:${gamepad.mapping}:${gamepad.connected}`).sort().join('|')
    if (signature === this.gamepadInventorySignature) return
    this.gamepadInventorySignature = signature
    const connected = new Set(gamepads.map(/** 按模板 `gamepad:${gamepad.index}` 生成并返回字符串。 */ gamepad => `gamepad:${gamepad.index}`))
    for (const gamepad of gamepads) {
      const key = `gamepad:${gamepad.index}`, previous = this.devices.get(key)
      const device = normalizeInputDeviceIdentity({ id: gamepad.id || key, kind: 'gamepad', index: gamepad.index, connected: true, mapping: gamepad.mapping || 'unknown' })
      this.devices.set(key, device)
      if (!previous?.connected) for (const listener of this.deviceListeners) listener({ ...device }, 'connected')
    }
    for (const [key, previous] of this.devices) if (previous.kind === 'gamepad' && previous.connected && !connected.has(key)) {
      const device = { ...previous, connected: false }
      this.devices.set(key, device)
      for (const listener of this.deviceListeners) listener({ ...device }, 'disconnected')
    }
  }
  /** 结构说明（自动提取）：detectMeaningfulGamepadActivity；输入 gamepads；直接调用 gamepads.find、setInputModality。 */ private detectMeaningfulGamepadActivity(gamepads: readonly Gamepad[]): void {
    const active = gamepads.find(/** 结构说明（自动提取）：gamepads.find 回调；输入 gamepad；直接调用 gamepad.buttons.some、gamepad.axes.some；返回表达式求值结果。 */ gamepad => gamepad.buttons.some(/* 先计算 button.pressed；仅当其为假值时求右侧 button.value >= .5，返回短路求值结果。 */ button => button.pressed || button.value >= .5) || gamepad.axes.some(/* 比较 Math.abs(applyGamepadAxisCalibration(axis, gamepad.id, index)) 与 .35，返回大于或等于的判断结果。 */ (axis, index) => Math.abs(applyGamepadAxisCalibration(axis, gamepad.id, index)) >= .35))
    if (active) setInputModality('gamepad', active.id)
  }
  /** 结构说明（自动提取）：deviceSnapshot；无显式参数；直接调用 devices.set、normalizeInputDeviceIdentity、map、sort、filter 等。 */ private deviceSnapshot(): InputDeviceIdentity[] {
    if (this.touches.size) this.devices.set('touch:0', normalizeInputDeviceIdentity({ id: 'touch:0', kind: 'touch', index: 0, connected: true, mapping: 'direct' }))
    return [...this.devices.values()].filter(/* 返回 device.connected 的当前值。 */ device => device.connected).sort(/* 先计算 a.kind.localeCompare(b.kind)；仅当其为假值时求右侧 a.index - b.index，返回短路求值结果。 */ (a, b) => a.kind.localeCompare(b.kind) || a.index - b.index).map(/* 调用 normalizeInputDeviceIdentity(device, index) 并返回调用结果。 */ (device, index) => normalizeInputDeviceIdentity(device, index))
  }
  /** 结构说明（自动提取）：updateGamepad；输入 gamepad、connected；直接调用 normalizeInputDeviceIdentity、devices.set、listener；写入 lastGamepadInventoryAt、gamepadInventorySignature；包含循环处理。 */ private updateGamepad(gamepad: Gamepad, connected: boolean): void {
    const device = normalizeInputDeviceIdentity({ id: gamepad.id || `gamepad:${gamepad.index}`, kind: 'gamepad', index: gamepad.index, connected, mapping: gamepad.mapping || 'unknown' })
    this.devices.set(`gamepad:${gamepad.index}`, device)
    this.lastGamepadInventoryAt = -Infinity
    this.gamepadInventorySignature = ''
    for (const listener of this.deviceListeners) listener({ ...device }, connected ? 'connected' : 'disconnected')
  }
  /** 结构说明（自动提取）：acceptMouse；输入 event；直接调用 pointerDeduplicator.acceptMouse、performance.now。 */ private acceptMouse(event: MouseEvent): boolean { const capabilities = (event as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities; return this.pointerDeduplicator.acceptMouse(performance.now(), event.clientX, event.clientY, capabilities?.firesTouchEvents === true) }
  /** 结构说明（自动提取）：resetPairGesture；无显式参数；直接调用 touches.values、Math.hypot、Math.atan2；写入 pairGesture。 */ private resetPairGesture(): void { const pair = [...this.touches.values()]; if (pair.length < 2) { this.pairGesture = null; return }; this.pairGesture = { distance: Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y), angle: Math.atan2(pair[1].y - pair[0].y, pair[1].x - pair[0].x), centerX: (pair[0].x + pair[1].x) / 2, centerY: (pair[0].y + pair[1].y) / 2 } }
  /** 结构说明（自动提取）：sampleReplay；无显式参数；直接调用 performance.now、cloneSnapshot；写入 replay、replay.startedAt、replay.index、elapsed；包含循环处理。 */ private sampleReplay(): InputSnapshot | null {
    const replay = this.replay; if (!replay) return null
    let elapsed = (performance.now() - replay.startedAt) / 1000
    if (elapsed > replay.recording.duration) { if (!replay.loop) { const last = replay.recording.frames[replay.recording.frames.length - 1]; this.replay = null; return last ? cloneSnapshot(last.snapshot) : null }; replay.startedAt = performance.now(); replay.index = 0; elapsed = 0 }
    while (replay.index + 1 < replay.recording.frames.length && replay.recording.frames[replay.index + 1].time <= elapsed) replay.index++
    return cloneSnapshot(replay.recording.frames[replay.index].snapshot)
  }

  /** 结构说明（自动提取）：isTypingTarget；输入 target；直接调用 Boolean、target.closest。 */ private isTypingTarget(target: EventTarget | null): boolean {
    return typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest('input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [role="button"], [role="tab"], [role="menuitem"], [role="textbox"], [role="slider"], [role="checkbox"]')))
  }
}

/** 结构说明（自动提取）：normalizeInputRecording；输入 source；直接调用 sort、flatMap、slice、Array.isArray、Math.max 等。 */ export function normalizeInputRecording(source: unknown): InputRecording {
  const item = source && typeof source === 'object' ? source as Partial<InputRecording> : {}
  const frames = (Array.isArray(item.frames) ? item.frames : []).slice(0, 100_000).flatMap(/** 结构说明（自动提取）：flatMap 回调；输入 frame；直接调用 emptySnapshot、Math.max、finite、cloneSnapshot、Array.isArray 等。 */ frame => {
    if (!frame || typeof frame !== 'object' || !frame.snapshot || typeof frame.snapshot !== 'object') return []
    const empty = emptySnapshot(), snapshot = frame.snapshot as Partial<InputSnapshot>
    return [{ time: Math.max(0, finite(frame.time, 0)), snapshot: cloneSnapshot({ ...empty, ...snapshot, mousePosition: Array.isArray(snapshot.mousePosition) ? [finite(snapshot.mousePosition[0], 0), finite(snapshot.mousePosition[1], 0)] : empty.mousePosition, mouseWorldPosition: Array.isArray(snapshot.mouseWorldPosition) ? [finite(snapshot.mouseWorldPosition[0], 0), finite(snapshot.mouseWorldPosition[1], 0)] : empty.mouseWorldPosition, viewBounds: Array.isArray(snapshot.viewBounds) && snapshot.viewBounds.length >= 4 ? [finite(snapshot.viewBounds[0], 0), finite(snapshot.viewBounds[1], 0), finite(snapshot.viewBounds[2], 0), finite(snapshot.viewBounds[3], 0)] : empty.viewBounds, viewportSize: Array.isArray(snapshot.viewportSize) ? [Math.max(0, finite(snapshot.viewportSize[0], 0)), Math.max(0, finite(snapshot.viewportSize[1], 0))] : empty.viewportSize, wheel: Array.isArray(snapshot.wheel) ? [finite(snapshot.wheel[0], 0), finite(snapshot.wheel[1], 0)] : empty.wheel, pointerDelta: Array.isArray(snapshot.pointerDelta) ? [finite(snapshot.pointerDelta[0], 0), finite(snapshot.pointerDelta[1], 0)] : empty.pointerDelta, touches: Math.max(0, Math.round(finite(snapshot.touches, 0))), devices: normalizeInputDeviceIdentities(snapshot.devices) }) }]
  }).sort(/* 计算表达式 a.time - b.time 并返回结果，沿用操作数的原有类型规则。 */ (a, b) => a.time - b.time)
  const last = frames[frames.length - 1]
  return { version: 1, duration: Math.max(finite(item.duration, last?.time ?? 0), last?.time ?? 0), frames }
}
