/** 26.43 积木脚本：面向初学者的结构化积木（事件帽 + 语句堆叠），编译为普通 Rhai 脚本。
 *
 * A block script is an ordinary .rhai script asset whose first line carries the block document:
 *   // @nova-blocks 1 {"format":"nova-blocks",...}
 * followed by the Rhai code compiled from it. The runtime, export and packaging see a normal
 * script; the Blocks editor reads the document back. Blocks are stacked in event handlers (no free
 * canvas, no wires): an event ("When the game starts", "Every frame", "When Jump is pressed", ...)
 * holds a list of statements, and "if", "repeat" and "wait" hold nested lists. Inputs are plain
 * fields: numbers, text with {variable} placeholders, dropdowns for actions, assets and variables.
 * Runtime only depends on nothing here; the editor imports this module. */

export const BLOCK_SCRIPT_HEADER = '// @nova-blocks 1 '
export const BLOCK_SCRIPT_FORMAT = 'nova-blocks'

export type BlockCategory = 'events' | 'motion' | 'looks' | 'sound' | 'control' | 'variables' | 'game' | 'messages'
export type BlockFieldKind = 'number' | 'text' | 'name' | 'action' | 'audio' | 'video' | 'prefab' | 'scene' | 'variable' | 'bus' | 'bool' | 'op' | 'object' | 'function' | 'params' | 'code' | 'state' | 'easing'
/** 26.44: the easings offered in the Blocks (any tween easing works in scripts). */
export const BLOCK_EASINGS = ['linear', 'sine_in_out', 'quad_in', 'quad_out', 'back_out', 'bounce_out', 'elastic_out'] as const
export type BlockFieldValue = string | boolean
export interface BlockFieldSpec { key: string; kind: BlockFieldKind; default: BlockFieldValue }

export interface BlockCondition { id: string; type: string; negate: boolean; fields: Record<string, BlockFieldValue> }
export interface BlockNode {
  id: string
  type: string
  fields: Record<string, BlockFieldValue>
  /** if / repeat / wait / forever bodies. */
  children?: BlockNode[]
  /** if: the else body. */
  otherwise?: BlockNode[]
  /** if: conditions joined by `mode`. */
  conditions?: BlockCondition[]
  mode?: 'all' | 'any'
  disabled?: boolean
  /** 26.45: the debugger stops before this block runs. */
  breakpoint?: boolean
}
export interface BlockHandler { id: string; event: string; fields: Record<string, BlockFieldValue>; blocks: BlockNode[]; collapsed?: boolean; disabled?: boolean }
export interface BlockVariable { name: string; initial: string }
export interface BlockScriptDocument { format: typeof BLOCK_SCRIPT_FORMAT; version: 1; variables: BlockVariable[]; handlers: BlockHandler[] }
export type BlockProblemCode = 'unknownVariable' | 'textPlaceholder' | 'needsContact' | 'needsFrame' | 'chooseSound' | 'chooseVideo' | 'choosePrefab' | 'chooseScene' | 'chooseObject' | 'chooseVariable' | 'chooseFunction' | 'functionName' | 'functionTwice' | 'badParameter' | 'afterWait'
/** `message` is English; editors translate `code` with `params` (see blockScriptCopy problems). */
export interface BlockDiagnostic { severity: 'error' | 'warning'; blockId: string; code: BlockProblemCode; params?: Record<string, string>; message: string }
export const BLOCK_PROBLEM_MESSAGES: Record<BlockProblemCode, string> = {
  unknownVariable: 'unknown variable “{name}”', textPlaceholder: '{{name}} is not a variable here, so it is shown as text', needsContact: 'this only works inside a “touches” or “enters” event',
  needsFrame: 'this block needs an “every frame”, “every physics step” or key event', chooseSound: 'choose a sound', chooseVideo: 'choose a video', choosePrefab: 'choose a prefab', chooseScene: 'choose a scene',
  chooseObject: 'choose an object', chooseVariable: 'choose a variable', chooseFunction: 'choose a function name', functionName: 'choose a function name (letters, digits and _; not an event name)',
  functionTwice: 'function “{name}” is defined twice', badParameter: '“{name}” is not a valid parameter name', afterWait: 'after “wait”, this block can no longer use the event’s data'
}
export function formatBlockProblem(template: string, params: Record<string, string> = {}): string { return template.replace(/\{([a-z]+)\}/g, (match, key: string) => params[key] ?? match) }
function problem(state: { diagnostics: BlockDiagnostic[] }, severity: 'error' | 'warning', blockId: string, code: BlockProblemCode, params?: Record<string, string>): void {
  state.diagnostics.push({ severity, blockId, code, params, message: formatBlockProblem(BLOCK_PROBLEM_MESSAGES[code], params) })
}

/** What a handler body may use: `dt` (frame time), `other` (the touching object), `payload`. */
interface HandlerScope { dt: boolean; other: boolean; payload: boolean }

export interface BlockEventSpec { type: string; fields: BlockFieldSpec[]; scope: HandlerScope; target: 'start' | 'update' | 'fixed_update' | 'on_collision_enter' | 'on_trigger_enter' | 'on_trigger_exit' | 'on_signal' | 'on_timer' | 'on_destroy' | 'function' }
export interface BlockStatementSpec { type: string; category: BlockCategory; fields: BlockFieldSpec[]; container?: 'body' | 'if'; needs?: (keyof HandlerScope)[] }
export interface BlockConditionSpec { type: string; fields: BlockFieldSpec[]; needs?: (keyof HandlerScope)[] }

const field = (key: string, kind: BlockFieldKind, value: BlockFieldValue = ''): BlockFieldSpec => ({ key, kind, default: value })
const FRAME: HandlerScope = { dt: true, other: false, payload: false }
const PLAIN: HandlerScope = { dt: false, other: false, payload: false }
const CONTACT: HandlerScope = { dt: false, other: true, payload: false }

export const BLOCK_EVENTS: readonly BlockEventSpec[] = [
  { type: 'start', fields: [], scope: PLAIN, target: 'start' },
  { type: 'update', fields: [], scope: FRAME, target: 'update' },
  { type: 'physics', fields: [], scope: FRAME, target: 'fixed_update' },
  { type: 'pressed', fields: [field('action', 'action', 'Jump')], scope: FRAME, target: 'update' },
  { type: 'released', fields: [field('action', 'action', 'Jump')], scope: FRAME, target: 'update' },
  { type: 'held', fields: [field('action', 'action', 'Jump')], scope: FRAME, target: 'update' },
  { type: 'touch', fields: [field('tag', 'name', '')], scope: CONTACT, target: 'on_collision_enter' },
  { type: 'enter', fields: [field('tag', 'name', '')], scope: CONTACT, target: 'on_trigger_enter' },
  { type: 'leave', fields: [field('tag', 'name', '')], scope: CONTACT, target: 'on_trigger_exit' },
  { type: 'signal', fields: [field('name', 'name', 'player.won')], scope: { dt: false, other: false, payload: true }, target: 'on_signal' },
  { type: 'timer', fields: [field('name', 'name', 'tick')], scope: PLAIN, target: 'on_timer' },
  { type: 'destroyed', fields: [], scope: PLAIN, target: 'on_destroy' },
  { type: 'function', fields: [field('name', 'function', 'my_function'), field('params', 'params', '')], scope: PLAIN, target: 'function' }
]

export const BLOCK_STATEMENTS: readonly BlockStatementSpec[] = [
  // Motion
  { type: 'platformer', category: 'motion', fields: [field('speed', 'number', '8'), field('jump', 'number', '12.5'), field('gravity', 'number', '30'), field('move', 'action', 'Horizontal'), field('jumpAction', 'action', 'Jump')], needs: ['dt'] },
  { type: 'topdown', category: 'motion', fields: [field('speed', 'number', '5'), field('move', 'action', 'Move')], needs: ['dt'] },
  { type: 'setVelocity', category: 'motion', fields: [field('x', 'number', '0'), field('y', 'number', '0')] },
  { type: 'changeVelocity', category: 'motion', fields: [field('x', 'number', '0'), field('y', 'number', '5')] },
  { type: 'impulse', category: 'motion', fields: [field('x', 'number', '0'), field('y', 'number', '5')] },
  { type: 'goTo', category: 'motion', fields: [field('x', 'number', '0'), field('y', 'number', '0')] },
  { type: 'moveBy', category: 'motion', fields: [field('x', 'number', '1'), field('y', 'number', '0')] },
  { type: 'turnBy', category: 'motion', fields: [field('degrees', 'number', '15')] },
  { type: 'pointAt', category: 'motion', fields: [field('degrees', 'number', '0')] },
  { type: 'setSize', category: 'motion', fields: [field('x', 'number', '1'), field('y', 'number', '1')] },
  // 26.44: smooth motion (tweens) and one-way platforms.
  { type: 'glideTo', category: 'motion', fields: [field('x', 'number', '0'), field('y', 'number', '0'), field('seconds', 'number', '1'), field('easing', 'easing', 'sine_in_out')] },
  { type: 'glideBy', category: 'motion', fields: [field('x', 'number', '2'), field('y', 'number', '0'), field('seconds', 'number', '1'), field('easing', 'easing', 'sine_in_out')] },
  { type: 'spinBy', category: 'motion', fields: [field('degrees', 'number', '360'), field('seconds', 'number', '1'), field('easing', 'easing', 'linear')] },
  { type: 'dropThrough', category: 'motion', fields: [] },
  { type: 'jointServo', category: 'motion', fields: [field('target', 'number', '45')] },
  // Looks
  { type: 'playAnimation', category: 'looks', fields: [field('state', 'state', 'Run')] },
  { type: 'blendAnimation', category: 'looks', fields: [field('state', 'state', 'Run'), field('seconds', 'number', '0.2')] },
  { type: 'fadeTo', category: 'looks', fields: [field('opacity', 'number', '0'), field('seconds', 'number', '0.5')] },
  { type: 'growTo', category: 'looks', fields: [field('scale', 'number', '1.5'), field('seconds', 'number', '0.3'), field('easing', 'easing', 'back_out')] },
  { type: 'postPulse', category: 'looks', fields: [field('effect', 'name', 'bloom'), field('amount', 'number', '0.6'), field('seconds', 'number', '0.25')] },
  { type: 'setText', category: 'looks', fields: [field('text', 'text', 'Score: {score}')] },
  { type: 'setTextOn', category: 'looks', fields: [field('object', 'object', 'ScoreLabel'), field('text', 'text', 'Score: {score}')] },
  { type: 'show', category: 'looks', fields: [field('object', 'object', '')] },
  { type: 'hide', category: 'looks', fields: [field('object', 'object', '')] },
  // Sound
  { type: 'playSound', category: 'sound', fields: [field('asset', 'audio', ''), field('volume', 'number', '1')] },
  { type: 'playMusic', category: 'sound', fields: [field('asset', 'audio', ''), field('fade', 'number', '1')] },
  { type: 'stopMusic', category: 'sound', fields: [field('fade', 'number', '1')] },
  { type: 'busVolume', category: 'sound', fields: [field('bus', 'bus', 'Music'), field('volume', 'number', '0.5')] },
  { type: 'playVideo', category: 'sound', fields: [field('asset', 'video', ''), field('skippable', 'bool', true)] },
  // 26.46 rhythm charts (the chart on this object, else the first in the scene).
  { type: 'rhythmPlay', category: 'sound', fields: [] },
  { type: 'rhythmPause', category: 'sound', fields: [] },
  { type: 'rhythmResume', category: 'sound', fields: [] },
  { type: 'rhythmRestart', category: 'sound', fields: [] },
  { type: 'rhythmAutoplay', category: 'sound', fields: [field('enabled', 'bool', true)] },
  { type: 'rhythmSpeed', category: 'sound', fields: [field('speed', 'number', '8')] },
  // 26.47: on a prefab note's object (a note type with a prefab): judge the note it shows.
  { type: 'rhythmJudgeMyNote', category: 'sound', fields: [field('judgement', 'name', 'perfect')] },
  // Control
  { type: 'if', category: 'control', fields: [], container: 'if' },
  { type: 'repeat', category: 'control', fields: [field('times', 'number', '3')], container: 'body' },
  { type: 'wait', category: 'control', fields: [field('seconds', 'number', '1')], container: 'body' },
  { type: 'startTimer', category: 'control', fields: [field('name', 'name', 'tick'), field('seconds', 'number', '1'), field('repeat', 'bool', false)] },
  { type: 'stop', category: 'control', fields: [] },
  // Variables
  { type: 'setVariable', category: 'variables', fields: [field('variable', 'variable', ''), field('value', 'number', '0')] },
  { type: 'changeVariable', category: 'variables', fields: [field('variable', 'variable', ''), field('value', 'number', '1')] },
  { type: 'addScore', category: 'variables', fields: [field('value', 'number', '1')] },
  { type: 'saveValue', category: 'variables', fields: [field('key', 'name', 'best'), field('value', 'number', '0')] },
  { type: 'log', category: 'variables', fields: [field('text', 'text', 'Hello')] },
  // Game
  { type: 'spawnHere', category: 'game', fields: [field('prefab', 'prefab', '')] },
  { type: 'spawnAt', category: 'game', fields: [field('prefab', 'prefab', ''), field('x', 'number', '0'), field('y', 'number', '0')] },
  { type: 'explodeHere', category: 'game', fields: [field('radius', 'number', '4'), field('impulse', 'number', '30')] },
  { type: 'destroySelf', category: 'game', fields: [] },
  { type: 'destroyOther', category: 'game', fields: [], needs: ['other'] },
  { type: 'loadScene', category: 'game', fields: [field('scene', 'scene', '')] },
  { type: 'reloadScene', category: 'game', fields: [] },
  { type: 'pauseGame', category: 'game', fields: [field('paused', 'bool', true)] },
  { type: 'checkpoint', category: 'game', fields: [field('name', 'name', 'checkpoint')] },
  { type: 'restoreCheckpoint', category: 'game', fields: [field('name', 'name', 'checkpoint')] },
  // Messages
  { type: 'emitSignal', category: 'messages', fields: [field('name', 'name', 'player.won')] },
  { type: 'callGlobal', category: 'messages', fields: [field('global', 'name', 'Game'), field('function', 'function', 'add_coins'), field('args', 'code', '')] },
  { type: 'callGroup', category: 'messages', fields: [field('group', 'name', 'enemies'), field('function', 'function', 'alert'), field('args', 'code', '')] },
  { type: 'callOther', category: 'messages', fields: [field('function', 'function', 'hit'), field('args', 'code', '')], needs: ['other'] },
  { type: 'run', category: 'messages', fields: [field('function', 'function', 'my_function'), field('args', 'code', '')] }
]

export const BLOCK_CONDITIONS: readonly BlockConditionSpec[] = [
  { type: 'held', fields: [field('action', 'action', 'Jump')] },
  { type: 'pressed', fields: [field('action', 'action', 'Jump')] },
  { type: 'onFloor', fields: [] },
  { type: 'onWall', fields: [] },
  { type: 'onOneWay', fields: [] },
  { type: 'animationIs', fields: [field('state', 'state', 'Run')] },
  { type: 'compare', fields: [field('a', 'number', '0'), field('op', 'op', '>'), field('b', 'number', '0')] },
  { type: 'otherHasTag', fields: [field('tag', 'name', 'coin')], needs: ['other'] },
  { type: 'chance', fields: [field('percent', 'number', '50')] },
  { type: 'rhythmState', fields: [field('state', 'name', 'finished')] },
  { type: 'rhythmCombo', fields: [field('op', 'op', '>='), field('value', 'number', '50')] },
  { type: 'expression', fields: [field('code', 'code', 'true')] }
]

export const BLOCK_CATEGORY_COLORS: Record<BlockCategory, { fill: string; ink: string }> = {
  events: { fill: '#e8a400', ink: '#2b1d00' },
  motion: { fill: '#3d7fe0', ink: '#ffffff' },
  looks: { fill: '#8a5ce6', ink: '#ffffff' },
  sound: { fill: '#c050c0', ink: '#ffffff' },
  control: { fill: '#e48a0c', ink: '#2b1700' },
  variables: { fill: '#e0661a', ink: '#ffffff' },
  game: { fill: '#3e9f4a', ink: '#ffffff' },
  messages: { fill: '#2f97b8', ink: '#ffffff' }
}

const eventSpec = (type: string) => BLOCK_EVENTS.find(spec => spec.type === type)
export const statementSpec = (type: string) => BLOCK_STATEMENTS.find(spec => spec.type === type)
export const conditionSpec = (type: string) => BLOCK_CONDITIONS.find(spec => spec.type === type)
export const handlerEventSpec = eventSpec

let serial = 0
export function blockId(prefix = 'b'): string {
  serial = (serial + 1) % 1_000_000
  const random = typeof crypto !== 'undefined' && 'getRandomValues' in crypto ? crypto.getRandomValues(new Uint32Array(1))[0].toString(36) : Math.floor(Math.random() * 1e9).toString(36)
  return `${prefix}${Date.now().toString(36)}${serial.toString(36)}${random}`
}
const defaults = (specs: readonly BlockFieldSpec[]) => Object.fromEntries(specs.map(spec => [spec.key, spec.default]))
export function createHandler(event: string): BlockHandler { return { id: blockId('h'), event, fields: defaults(eventSpec(event)?.fields ?? []), blocks: [] } }
export function createCondition(type: string): BlockCondition { return { id: blockId('c'), type, negate: false, fields: defaults(conditionSpec(type)?.fields ?? []) } }
export function createBlock(type: string): BlockNode {
  const spec = statementSpec(type)
  const node: BlockNode = { id: blockId(), type, fields: defaults(spec?.fields ?? []) }
  if (spec?.container) node.children = []
  if (spec?.container === 'if') { node.otherwise = []; node.conditions = [createCondition('held')]; node.mode = 'all' }
  return node
}
export function createBlockScript(): BlockScriptDocument {
  const start = createHandler('start')
  return { format: BLOCK_SCRIPT_FORMAT, version: 1, variables: [{ name: 'score', initial: '0' }], handlers: [start] }
}
/** A deep copy with fresh ids (duplicate). */
export function cloneBlock(node: BlockNode): BlockNode {
  return { ...structuredCloneSafe(node), id: blockId(), children: node.children?.map(cloneBlock), otherwise: node.otherwise?.map(cloneBlock), conditions: node.conditions?.map(condition => ({ ...structuredCloneSafe(condition), id: blockId('c') })) }
}
function structuredCloneSafe<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
const RESERVED = new Set(['let', 'const', 'fn', 'if', 'else', 'while', 'loop', 'for', 'in', 'do', 'until', 'return', 'break', 'continue', 'true', 'false', 'this', 'switch', 'throw', 'try', 'catch', 'import', 'export', 'as', 'global', 'private', 'is', 'Fn', 'call', 'curry', 'type_of', 'print', 'debug', 'eval', 'dt', 'other', 'payload', 'source'])
export function validIdentifier(name: string): boolean { return IDENTIFIER.test(name) && !RESERVED.has(name) && !name.startsWith('__') }

// ---------------------------------------------------------------------------------------------
// Persistence

/** True when the script source was written by the Blocks editor. */
export function isBlockScriptSource(source: string | null | undefined): boolean { return typeof source === 'string' && source.startsWith(BLOCK_SCRIPT_HEADER) }

/** Reads the block document from a script source; null for ordinary scripts or a damaged header. */
export function parseBlockScriptSource(source: string | null | undefined): BlockScriptDocument | null {
  if (!isBlockScriptSource(source)) return null
  const end = source!.indexOf('\n')
  try { return normalizeBlockScript(JSON.parse(source!.slice(BLOCK_SCRIPT_HEADER.length, end < 0 ? undefined : end))) } catch { return null }
}

/** The code part (everything after the header line). */
export function blockScriptCode(source: string): string { const end = source.indexOf('\n'); return end < 0 ? '' : source.slice(end + 1) }

const MAX_BLOCKS = 4_000
export function normalizeBlockScript(value: unknown): BlockScriptDocument {
  const item = value && typeof value === 'object' ? value as Partial<BlockScriptDocument> : {}
  let count = 0
  const fieldsOf = (raw: unknown, specs: readonly BlockFieldSpec[]) => {
    const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    return Object.fromEntries(specs.map(spec => {
      const current = source[spec.key]
      const value = spec.kind === 'bool' ? (typeof current === 'boolean' ? current : spec.default) : typeof current === 'string' || typeof current === 'number' ? String(current).slice(0, 2_000) : spec.default
      return [spec.key, value]
    }))
  }
  const conditions = (raw: unknown): BlockCondition[] => (Array.isArray(raw) ? raw : []).slice(0, 16).flatMap(entry => {
    const condition = entry && typeof entry === 'object' ? entry as Partial<BlockCondition> : {}
    const spec = conditionSpec(String(condition.type))
    return spec ? [{ id: typeof condition.id === 'string' ? condition.id : blockId('c'), type: spec.type, negate: condition.negate === true, fields: fieldsOf(condition.fields, spec.fields) }] : []
  })
  const blocks = (raw: unknown, depth: number): BlockNode[] => (Array.isArray(raw) ? raw : []).flatMap(entry => {
    if (++count > MAX_BLOCKS || depth > 24) return []
    const node = entry && typeof entry === 'object' ? entry as Partial<BlockNode> : {}
    const spec = statementSpec(String(node.type))
    if (!spec) return []
    const result: BlockNode = { id: typeof node.id === 'string' ? node.id : blockId(), type: spec.type, fields: fieldsOf(node.fields, spec.fields) }
    if (node.disabled === true) result.disabled = true
    if (node.breakpoint === true) result.breakpoint = true
    if (spec.container) result.children = blocks(node.children, depth + 1)
    if (spec.container === 'if') { result.otherwise = blocks(node.otherwise, depth + 1); result.conditions = conditions(node.conditions); result.mode = node.mode === 'any' ? 'any' : 'all' }
    return [result]
  })
  const handlers = (Array.isArray(item.handlers) ? item.handlers : []).slice(0, 256).flatMap(entry => {
    const handler = entry && typeof entry === 'object' ? entry as Partial<BlockHandler> : {}
    const spec = eventSpec(String(handler.event))
    if (!spec) return []
    const result: BlockHandler = { id: typeof handler.id === 'string' ? handler.id : blockId('h'), event: spec.type, fields: fieldsOf(handler.fields, spec.fields), blocks: blocks(handler.blocks, 0) }
    if (handler.collapsed === true) result.collapsed = true
    if (handler.disabled === true) result.disabled = true
    return [result]
  })
  const names = new Set<string>()
  const variables = (Array.isArray(item.variables) ? item.variables : []).slice(0, 128).flatMap(entry => {
    const variable = entry && typeof entry === 'object' ? entry as Partial<BlockVariable> : {}
    const name = typeof variable.name === 'string' ? variable.name.trim() : ''
    if (!validIdentifier(name) || names.has(name)) return []
    names.add(name)
    return [{ name, initial: typeof variable.initial === 'string' ? variable.initial.slice(0, 500) : String(variable.initial ?? '0') }]
  })
  return { format: BLOCK_SCRIPT_FORMAT, version: 1, variables, handlers }
}

/** Header line + generated code: the complete .rhai source written to the asset. */
export function blockScriptSource(document: BlockScriptDocument): { source: string; diagnostics: BlockDiagnostic[] } {
  const compiled = compileBlockScript(document)
  return { source: `${BLOCK_SCRIPT_HEADER}${JSON.stringify(normalizeBlockScript(document))}\n${compiled.code}`, diagnostics: compiled.diagnostics }
}

// ---------------------------------------------------------------------------------------------
// Compiler

/** A Rhai string literal (escapes quotes, backslashes and control characters). */
export function rhaiString(value: string): string {
  let result = '"'
  for (const character of value) {
    const code = character.codePointAt(0)!
    if (character === '"') result += '\\"'
    else if (character === '\\') result += '\\\\'
    else if (character === '\n') result += '\\n'
    else if (character === '\r') result += '\\r'
    else if (character === '\t') result += '\\t'
    else if (code < 0x20 || code === 0x7f) result += `\\u${code.toString(16).padStart(4, '0')}`
    else result += character
  }
  return `${result}"`
}

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/
/** A float literal Rhai accepts ("3" -> "3.0", "-.5" -> "-0.5"). */
export function floatLiteral(text: string): string {
  const value = Number(text)
  if (!Number.isFinite(value)) return '0.0'
  const plain = String(value)
  return /[.eE]/.test(plain) ? (plain.includes('e') && !plain.includes('.') ? plain.replace('e', '.0e') : plain) : `${plain}.0`
}

interface CompileState {
  diagnostics: BlockDiagnostic[]
  variables: Set<string>
  extraFunctions: string[]
  waitSerial: number
  usesPlatformer: boolean
  usesTextHelper: boolean
}

const indent = (lines: string[], depth = 1) => lines.map(line => line ? `${'  '.repeat(depth)}${line}` : line)

function numberExpression(raw: BlockFieldValue, state: CompileState, blockId: string, scope: HandlerScope): string {
  const text = String(raw ?? '').trim()
  if (!text) return '0.0'
  if (NUMBER.test(text)) return floatLiteral(text)
  if (IDENTIFIER.test(text)) {
    if (state.variables.has(text)) return text
    if ((text === 'dt' && scope.dt) || (text === 'payload' && scope.payload)) return text
    problem(state, 'error', blockId, 'unknownVariable', { name: text })
    return '0.0'
  }
  return `(${text})`
}

/** Text with {name} placeholders: variables (and dt/other/payload where available) are inserted. */
function textExpression(raw: BlockFieldValue, state: CompileState, blockId: string, scope: HandlerScope): string {
  const text = String(raw ?? '')
  const parts: string[] = []
  let last = 0
  for (const match of text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
    const name = match[1]
    const known = state.variables.has(name) || (name === 'other' && scope.other) || (name === 'payload' && scope.payload) || (name === 'dt' && scope.dt)
    if (!known) { problem(state, 'warning', blockId, 'textPlaceholder', { name }); continue }
    if (match.index! > last) parts.push(rhaiString(text.slice(last, match.index)))
    parts.push(`__blk_text(${name})`)
    state.usesTextHelper = true
    last = match.index! + match[0].length
  }
  if (last < text.length || !parts.length) parts.push(rhaiString(text.slice(last)))
  return parts.join(' + ')
}

const stringField = (raw: BlockFieldValue) => rhaiString(String(raw ?? '').trim())
function argumentsExpression(raw: BlockFieldValue): string { const text = String(raw ?? '').trim(); return text ? `[${text}]` : '[]' }

/** 26.44: an easing name for a tween call (unknown names fall back to linear). */
function easingField(value: BlockFieldValue | undefined): string {
  const name = String(value ?? '').trim()
  return rhaiString((BLOCK_EASINGS as readonly string[]).includes(name) ? name : 'linear')
}

function conditionExpression(condition: BlockCondition, state: CompileState, scope: HandlerScope, ownerId: string): string {
  const spec = conditionSpec(condition.type)
  const f = condition.fields
  let expression = 'false'
  if (spec?.needs?.includes('other') && !scope.other) problem(state, 'error', ownerId, 'needsContact')
  switch (condition.type) {
    case 'held': expression = `input_down(${stringField(f.action)})`; break
    case 'pressed': expression = `input_pressed(${stringField(f.action)})`; break
    case 'onFloor': expression = 'character_is_on_floor()'; break
    case 'onWall': expression = 'character_is_on_wall()'; break
    case 'onOneWay': expression = 'character_floor_is_one_way()'; break
    case 'animationIs': expression = `animator_state() == ${stringField(f.state)}`; break
    case 'compare': {
      const op = ['==', '!=', '<', '>', '<=', '>='].includes(String(f.op)) ? String(f.op) : '>'
      expression = `${numberExpression(f.a, state, ownerId, scope)} ${op} ${numberExpression(f.b, state, ownerId, scope)}`
      break
    }
    case 'otherHasTag': expression = scope.other ? `entity_has_tag(other, ${stringField(f.tag)})` : 'false'; break
    case 'chance': expression = `random() < ${numberExpression(f.percent, state, ownerId, scope)} / 100.0`; break
    case 'rhythmState': expression = `rhythm_state() == ${stringField(f.state)}`; break
    case 'rhythmCombo': expression = `rhythm_combo() ${['<', '<=', '==', '!=', '>=', '>'].includes(String(f.op)) ? String(f.op) : '>='} ${numberExpression(f.value, state, ownerId, scope)}`; break
    case 'expression': expression = String(f.code ?? '').trim() || 'false'; break
  }
  return condition.negate ? `!(${expression})` : `(${expression})`
}

// 26.45: the first line a block compiles to carries this marker until the code is assembled; the
// markers become the block → line map (for block breakpoints) and are removed from the code.
const BLOCK_LINE_MARK = ' //@@block:'
const BLOCK_LINE_PATTERN = / \/\/@@block:([A-Za-z0-9_-]+)$/

function compileBlocks(blocks: readonly BlockNode[], state: CompileState, scope: HandlerScope): string[] {
  const lines: string[] = []
  for (const node of blocks) {
    if (node.disabled) continue
    const spec = statementSpec(node.type)
    if (!spec) continue
    const firstLine = lines.length
    compileBlock(node, spec, lines, state, scope)
    if (lines.length > firstLine && /^[A-Za-z0-9_-]+$/.test(node.id)) lines[firstLine] += `${BLOCK_LINE_MARK}${node.id}`
  }
  return lines
}

function compileBlock(node: BlockNode, spec: BlockStatementSpec, lines: string[], state: CompileState, scope: HandlerScope): void {
  {
    for (const required of spec.fields) if (['audio', 'video', 'prefab', 'scene'].includes(required.kind) && !String(node.fields[required.key] ?? '').trim()) problem(state, 'error', node.id, required.kind === 'audio' ? 'chooseSound' : required.kind === 'video' ? 'chooseVideo' : required.kind === 'prefab' ? 'choosePrefab' : 'chooseScene')
    if (node.type === 'setTextOn' && !String(node.fields.object ?? '').trim()) problem(state, 'error', node.id, 'chooseObject')
    for (const need of spec.needs ?? []) if (!scope[need]) problem(state, 'error', node.id, need === 'dt' ? 'needsFrame' : 'needsContact')
    const f = node.fields
    const num = (key: string) => numberExpression(f[key], state, node.id, scope)
    switch (node.type) {
      case 'platformer': {
        state.usesPlatformer = true
        const move = stringField(f.move), jump = stringField(f.jumpAction)
        lines.push('{',
          ...indent([
            `let __move = input_axis(${move});`,
            `let __vy = rigid_body().velocity_y - ${num('gravity')} * dt;`,
            `if input_pressed(${jump}) { __blk_buffer = 0.12; }`,
            'if __blk_lock > 0.0 { __blk_lock -= dt; }',
            `if __blk_buffer > 0.0 && __blk_lock <= 0.0 && can_coyote_jump() { __vy = ${num('jump')}; __blk_buffer = 0.0; __blk_lock = 0.2; }`,
            'if __blk_buffer > 0.0 { __blk_buffer -= dt; }',
            `if input_released(${jump}) && __vy > 0.0 { __vy *= 0.45; }`,
            'if __vy < -24.0 { __vy = -24.0; }',
            `move_character(__move * ${num('speed')} * dt, __vy * dt);`
          ]), '}')
        break
      }
      case 'topdown': {
        const move = stringField(f.move), speed = num('speed')
        lines.push('{', ...indent([
          `let __mx = input_vector_x(${move}) * ${speed};`,
          `let __my = input_vector_y(${move}) * ${speed};`,
          'if has_component("CharacterBody2D") { move_character(__mx * dt, __my * dt); } else { set_velocity(__mx, __my); }'
        ]), '}')
        break
      }
      case 'setVelocity': lines.push(`set_velocity(${num('x')}, ${num('y')});`); break
      case 'changeVelocity': lines.push(`set_velocity(rigid_body().velocity_x + ${num('x')}, rigid_body().velocity_y + ${num('y')});`); break
      case 'impulse': lines.push(`apply_impulse(${num('x')}, ${num('y')});`); break
      case 'goTo': lines.push(`set_position(${num('x')}, ${num('y')});`); break
      case 'moveBy': lines.push(`set_position(transform().position_x + ${num('x')}, transform().position_y + ${num('y')});`); break
      case 'turnBy': lines.push(`set_rotation(transform().rotation + ${num('degrees')} * 0.017453292519943295);`); break
      case 'pointAt': lines.push(`set_rotation(${num('degrees')} * 0.017453292519943295);`); break
      case 'setSize': lines.push(`set_scale(${num('x')}, ${num('y')});`); break
      case 'playAnimation': lines.push(`animator_play(${stringField(f.state)});`); break
      case 'blendAnimation': lines.push(`animator_crossfade(${stringField(f.state)}, ${num('seconds')});`); break
      case 'fadeTo': lines.push(`tween("opacity", ${num('opacity')}, ${num('seconds')}, "linear");`); break
      case 'growTo': lines.push(`tween("scale", ${num('scale')}, ${num('seconds')}, ${easingField(f.easing)});`); break
      case 'glideTo': lines.push(`tween("x", ${num('x')}, ${num('seconds')}, ${easingField(f.easing)});`, `tween("y", ${num('y')}, ${num('seconds')}, ${easingField(f.easing)});`); break
      case 'glideBy': lines.push(`tween("x", ${num('x')}, ${num('seconds')}, ${easingField(f.easing)}, #{ relative: true });`, `tween("y", ${num('y')}, ${num('seconds')}, ${easingField(f.easing)}, #{ relative: true });`); break
      case 'spinBy': lines.push(`tween("rotation_degrees", ${num('degrees')}, ${num('seconds')}, ${easingField(f.easing)}, #{ relative: true });`); break
      case 'dropThrough': lines.push('character_drop_through();'); break
      case 'jointServo': lines.push(`joint_servo(${num('target')});`); break
      case 'postPulse': lines.push(`post_pulse(${stringField(f.effect)}, ${num('amount')}, ${num('seconds')});`); break
      case 'explodeHere': lines.push(`explode(transform().position_x, transform().position_y, ${num('radius')}, ${num('impulse')});`); break
      case 'setText': lines.push(`ui_set_text(${textExpression(f.text, state, node.id, scope)});`); break
      case 'setTextOn': lines.push(`ui_set_text_on(find_entity_handle(${stringField(f.object)}), ${textExpression(f.text, state, node.id, scope)});`); break
      case 'show': case 'hide': {
        const target = String(f.object ?? '').trim()
        lines.push(`entity_set_enabled(${target ? `find_entity_handle(${rhaiString(target)})` : 'entity_handle()'}, ${node.type === 'show'});`)
        break
      }
      case 'playSound': lines.push(`play_sound(${stringField(f.asset)}, #{ volume: ${num('volume')} });`); break
      case 'playMusic': lines.push(`play_music(${stringField(f.asset)}, ${num('fade')});`); break
      case 'stopMusic': lines.push(`stop_music(${num('fade')});`); break
      case 'busVolume': lines.push(`set_bus_volume(${stringField(f.bus)}, ${num('volume')});`); break
      case 'playVideo': lines.push(`play_video(${stringField(f.asset)}, #{ skippable: ${f.skippable === true} });`); break
      case 'rhythmPlay': lines.push('rhythm_play();'); break
      case 'rhythmPause': lines.push('rhythm_pause();'); break
      case 'rhythmResume': lines.push('rhythm_resume();'); break
      case 'rhythmRestart': lines.push('rhythm_restart();'); break
      case 'rhythmAutoplay': lines.push(`rhythm_set_autoplay(${f.enabled === true});`); break
      case 'rhythmSpeed': lines.push(`rhythm_set_speed(${num('speed')});`); break
      case 'rhythmJudgeMyNote': lines.push(`{ let my_note = rhythm_my_note(); if my_note != () { rhythm_judge(my_note.id, ${stringField(f.judgement)}); } }`); break
      case 'if': {
        const conditions = (node.conditions ?? []).map(condition => conditionExpression(condition, state, scope, node.id))
        const test = conditions.length ? conditions.join(node.mode === 'any' ? ' || ' : ' && ') : 'false'
        lines.push(`if ${test} {`, ...indent(compileBlocks(node.children ?? [], state, scope)))
        if (node.otherwise?.some(child => !child.disabled)) lines.push('} else {', ...indent(compileBlocks(node.otherwise, state, scope)))
        lines.push('}')
        break
      }
      case 'repeat': {
        const raw = String(f.times ?? '').trim()
        const count = NUMBER.test(raw) ? String(Math.max(0, Math.min(10_000, Math.round(Number(raw))))) : `(${num('times')}).to_int()`
        lines.push(`for __i in 0..${count} {`, ...indent(compileBlocks(node.children ?? [], state, scope)), '}')
        break
      }
      case 'wait': {
        // The waiting part becomes its own function, called later by the runtime timer.
        const name = `__blk_wait_${++state.waitSerial}`
        if (scope.dt || scope.other || scope.payload) for (const child of node.children ?? []) if (statementSpec(child.type)?.needs?.length) problem(state, 'warning', child.id, 'afterWait')
        const body = compileBlocks(node.children ?? [], state, PLAIN)
        state.extraFunctions.push(`fn ${name}() {`, ...indent(body), '}')
        lines.push(`after(${num('seconds')}, ${rhaiString(name)});`)
        break
      }
      case 'startTimer': lines.push(`timer_start(${stringField(f.name)}, ${num('seconds')}, ${f.repeat === true});`); break
      case 'stop': lines.push('return;'); break
      case 'setVariable': case 'changeVariable': {
        const variable = String(f.variable ?? '')
        if (!state.variables.has(variable)) { if (variable) problem(state, 'error', node.id, 'unknownVariable', { name: variable }); else problem(state, 'error', node.id, 'chooseVariable'); break }
        const initial = String(f.value ?? '').trim()
        const value = initial === 'true' || initial === 'false' ? initial : /^".*"$/s.test(initial) ? rhaiString(initial.slice(1, -1)) : num('value')
        lines.push(node.type === 'setVariable' ? `${variable} = ${value};` : `${variable} += ${value};`)
        break
      }
      case 'addScore': lines.push(`score_add(${num('value')});`); break
      case 'saveValue': lines.push(`save_set(${stringField(f.key)}, ${num('value')});`); break
      case 'log': lines.push(`log_info(${textExpression(f.text, state, node.id, scope)});`); break
      case 'spawnHere': lines.push(`instantiate(${stringField(f.prefab)});`); break
      case 'spawnAt': lines.push(`spawn_at(${stringField(f.prefab)}, ${num('x')}, ${num('y')}, 0.0, 1.0, 1.0);`); break
      case 'destroySelf': lines.push('destroy();'); break
      case 'destroyOther': if (scope.other) lines.push('entity_destroy(entity_handle_of(other));'); break
      case 'loadScene': lines.push(`scene_load(${stringField(f.scene)});`); break
      case 'reloadScene': lines.push('scene_reload();'); break
      case 'pauseGame': lines.push(`game_pause(${f.paused === true});`); break
      case 'checkpoint': lines.push(`checkpoint_set(${stringField(f.name)});`); break
      case 'restoreCheckpoint': lines.push(`checkpoint_restore(${stringField(f.name)});`); break
      case 'emitSignal': lines.push(`signal_emit(${stringField(f.name)}, ());`); break
      case 'callGlobal': lines.push(`call_global(${stringField(f.global)}, ${stringField(f.function)}, ${argumentsExpression(f.args)});`); break
      case 'callGroup': lines.push(`call_group(${stringField(f.group)}, ${stringField(f.function)}, ${argumentsExpression(f.args)});`); break
      case 'callOther': if (scope.other) lines.push(`call_on(other, ${stringField(f.function)}, ${argumentsExpression(f.args)});`); break
      case 'run': {
        const name = String(f.function ?? '').trim()
        if (!validIdentifier(name)) { problem(state, 'error', node.id, 'chooseFunction'); break }
        lines.push(`call_on(entity_handle(), ${rhaiString(name)}, ${argumentsExpression(f.args)});`)
        break
      }
    }
  }
}

/** Valid Rhai literal for a variable's initial value: number, true/false, or text. */
function initialValue(raw: string): string {
  const text = raw.trim()
  if (!text) return '0.0'
  if (NUMBER.test(text)) return floatLiteral(text)
  if (text === 'true' || text === 'false') return text
  return rhaiString(text.replace(/^"(.*)"$/s, '$1'))
}

/** Compiles the document to Rhai. Handlers of the same callback merge in document order. */
export function compileBlockScript(input: BlockScriptDocument): { code: string; diagnostics: BlockDiagnostic[]; blockLines: Map<string, number> } {
  const document = normalizeBlockScript(input)
  const state: CompileState = { diagnostics: [], variables: new Set(document.variables.map(variable => variable.name)), extraFunctions: [], waitSerial: 0, usesPlatformer: false, usesTextHelper: false }
  const callbacks = new Map<string, { signature: string; body: string[] }>()
  const functions: string[] = []
  const functionNames = new Set<string>()
  const append = (key: string, signature: string, body: string[]) => { const entry = callbacks.get(key) ?? { signature, body: [] }; entry.body.push(...body); callbacks.set(key, entry) }
  for (const handler of document.handlers) {
    if (handler.disabled) continue
    const spec = eventSpec(handler.event)!
    const f = handler.fields
    const body = spec.target === 'function' ? [] : compileBlocks(handler.blocks, state, spec.scope)
    const tagged = (tag: BlockFieldValue, lines: string[]) => String(tag ?? '').trim() ? [`if entity_has_tag(other, ${stringField(tag)}) {`, ...indent(lines), '}'] : lines
    switch (spec.target) {
      case 'start': append('start', 'fn start()', body); break
      case 'update': {
        const guard = handler.event === 'pressed' ? `input_pressed(${stringField(f.action)})` : handler.event === 'released' ? `input_released(${stringField(f.action)})` : handler.event === 'held' ? `input_down(${stringField(f.action)})` : ''
        append('update', 'fn update(dt)', guard ? [`if ${guard} {`, ...indent(body), '}'] : body)
        break
      }
      case 'fixed_update': append('fixed_update', 'fn fixed_update(dt)', body); break
      case 'on_collision_enter': append('on_collision_enter', 'fn on_collision_enter(other, px, py, nx, ny, rvx, rvy)', tagged(f.tag, body)); break
      case 'on_trigger_enter': append('on_trigger_enter', 'fn on_trigger_enter(other, px, py, nx, ny, rvx, rvy)', tagged(f.tag, body)); break
      case 'on_trigger_exit': append('on_trigger_exit', 'fn on_trigger_exit(other, px, py, nx, ny, rvx, rvy)', tagged(f.tag, body)); break
      case 'on_signal': append('on_signal', 'fn on_signal(signal, payload, source)', [`if signal == ${stringField(f.name)} {`, ...indent(body), '}']); break
      case 'on_timer': append('on_timer', 'fn on_timer(timer)', [`if timer == ${stringField(f.name)} {`, ...indent(body), '}']); break
      case 'on_destroy': append('on_destroy', 'fn on_destroy()', body); break
      case 'function': {
        const name = String(f.name ?? '').trim()
        const params = String(f.params ?? '').split(',').map(value => value.trim()).filter(Boolean)
        if (!validIdentifier(name) || ['start', 'update', 'fixed_update', 'late_update', 'awake'].includes(name) || name.startsWith('on_')) { problem(state, 'error', handler.id, 'functionName'); break }
        if (functionNames.has(name)) { problem(state, 'error', handler.id, 'functionTwice', { name }); break }
        const invalid = params.find(param => !validIdentifier(param))
        if (invalid) { problem(state, 'error', handler.id, 'badParameter', { name: invalid }); break }
        functionNames.add(name)
        // Parameters are readable as {name} in text fields and as values in number fields.
        const scoped = new Set(state.variables); for (const param of params) state.variables.add(param)
        const functionBody = compileBlocks(handler.blocks, state, spec.scope)
        state.variables = scoped
        functions.push(`fn ${name}(${params.join(', ')}) {`, ...indent(functionBody), '}')
        break
      }
    }
  }
  const lines: string[] = ['// Generated by Nova_A Blocks. Edit it in Script > Blocks: code edits are replaced when the blocks are saved.']
  for (const variable of document.variables) lines.push(`@export let ${variable.name} = ${initialValue(variable.initial)};`)
  if (state.usesPlatformer) lines.push('let __blk_buffer = 0.0;', 'let __blk_lock = 0.0;')
  for (const { signature, body } of callbacks.values()) lines.push(`${signature} {`, ...indent(body), '}')
  lines.push(...functions, ...state.extraFunctions)
  if (state.usesTextHelper) lines.push('fn __blk_text(value) {', '  if type_of(value) == "f64" && value == value.floor() && value.abs() < 1.0e15 { value.to_int().to_string() } else { value.to_string() }', '}')
  // Code lines are 1-based; in the stored source they follow the header line.
  const blockLines = new Map<string, number>()
  lines.forEach((line, index) => {
    const parts = line.split('\n')
    const last = parts[parts.length - 1], match = BLOCK_LINE_PATTERN.exec(last)
    if (!match) return
    parts[parts.length - 1] = last.slice(0, match.index)
    lines[index] = parts.join('\n')
    const offset = lines.slice(0, index).reduce((count, text) => count + text.split('\n').length, 0)
    blockLines.set(match[1], offset + parts.length)
  })
  return { code: `${lines.join('\n')}\n`, diagnostics: state.diagnostics, blockLines }
}

/** 26.45: line (in the stored source, after the header line) where each block starts. */
const blockLineCache = new Map<string, Map<string, number>>()
export function blockSourceLines(source: string): Map<string, number> {
  const cached = blockLineCache.get(source)
  if (cached) return cached
  const document = parseBlockScriptSource(source)
  const lines = new Map<string, number>()
  if (document) for (const [id, line] of compileBlockScript(document).blockLines) lines.set(id, line + 1)
  if (blockLineCache.size > 32) blockLineCache.clear()
  blockLineCache.set(source, lines)
  return lines
}

/** 26.45: the blocks of a Blocks script that have a breakpoint, with their source lines. */
export function blockBreakpointLines(source: string): Array<{ blockId: string; line: number }> {
  const document = parseBlockScriptSource(source)
  if (!document) return []
  const lines = blockSourceLines(source), result: Array<{ blockId: string; line: number }> = []
  for (const list of blockLists(document).values()) for (const node of list) {
    const line = node.breakpoint && !node.disabled ? lines.get(node.id) : undefined
    if (line) result.push({ blockId: node.id, line })
  }
  return result
}

// ---------------------------------------------------------------------------------------------
// Tree edits (pure helpers used by the editor)

export type BlockList = BlockNode[]
/** Every list in the document with an id: handler bodies, children and else bodies. */
export function blockLists(document: BlockScriptDocument): Map<string, BlockList> {
  const lists = new Map<string, BlockList>()
  const visit = (list: BlockList, key: string) => {
    lists.set(key, list)
    for (const node of list) {
      if (node.children) visit(node.children, `${node.id}:children`)
      if (node.otherwise) visit(node.otherwise, `${node.id}:otherwise`)
    }
  }
  for (const handler of document.handlers) visit(handler.blocks, `${handler.id}:blocks`)
  return lists
}
/** Finds the list holding a block and its index. */
export function locateBlock(document: BlockScriptDocument, id: string): { list: BlockList; index: number; key: string } | null {
  for (const [key, list] of blockLists(document)) { const index = list.findIndex(node => node.id === id); if (index >= 0) return { list, index, key } }
  return null
}
/** True when `ancestorId` contains `id` (a block cannot move into itself). */
export function blockContains(node: BlockNode, id: string): boolean {
  return [...(node.children ?? []), ...(node.otherwise ?? [])].some(child => child.id === id || blockContains(child, id))
}
/** Keys of every list nested inside a block (its bodies and theirs). */
function nestedListKeys(node: BlockNode, keys = new Set<string>()): Set<string> {
  if (node.children) { keys.add(`${node.id}:children`); for (const child of node.children) nestedListKeys(child, keys) }
  if (node.otherwise) { keys.add(`${node.id}:otherwise`); for (const child of node.otherwise) nestedListKeys(child, keys) }
  return keys
}
/** Moves a block to a list position; refuses moves into its own body. */
export function moveBlock(document: BlockScriptDocument, id: string, targetKey: string, targetIndex: number): boolean {
  const from = locateBlock(document, id)
  const target = blockLists(document).get(targetKey)
  if (!from || !target) return false
  const node = from.list[from.index]
  if (nestedListKeys(node).has(targetKey)) return false
  from.list.splice(from.index, 1)
  const index = Math.max(0, Math.min(target.length, from.list === target && from.index < targetIndex ? targetIndex - 1 : targetIndex))
  target.splice(index, 0, node)
  return true
}
export function countBlocks(document: BlockScriptDocument): number { let total = 0; for (const list of blockLists(document).values()) total += list.length; return total }
