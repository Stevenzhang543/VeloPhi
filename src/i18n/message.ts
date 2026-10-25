/**
 * Language-neutral messages (manual 26.50, D27): the physics core and the Rust engine never write natural
 * language into a recording; warnings and errors are a key with named parameters, translated by the interface
 * (`msgText`). The keys are the ones of `engine/MESSAGES.md`, shared by both engines.
 */

/** A parameter: a number in SI units, a name, a list of names, or a nested message (e.g. a reason). */
export type MsgParam = number | string | string[] | Message

/** A warning or error of the core. */
export interface Message {
  key: string
  params: Record<string, MsgParam>
}

/** Build a message. */
export function msg(key: string, params: Record<string, MsgParam> = {}): Message {
  return { key, params }
}

/** Is `v` a message object? */
export function isMessage(v: unknown): v is Message {
  return typeof v === 'object' && v !== null && typeof (v as Message).key === 'string' && typeof (v as Message).params === 'object'
}

/** Same key and parameters (warnings are recorded once). */
export function sameMessage(a: Message, b: Message): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * A message from JSON (the Rust engine): non-finite numbers arrive as the strings "Infinity", "-Infinity" and
 * "NaN"; nested messages are revived.
 */
export function reviveMessage(v: unknown): Message {
  if (!isMessage(v)) return msg('err.internal', { message: String(v) })
  const params: Record<string, MsgParam> = {}
  for (const [k, p] of Object.entries(v.params)) {
    if (p === 'Infinity') params[k] = Infinity
    else if (p === '-Infinity') params[k] = -Infinity
    else if (p === 'NaN') params[k] = NaN
    else if (isMessage(p)) params[k] = reviveMessage(p)
    else params[k] = p as MsgParam
  }
  return { key: v.key, params }
}

/** An error carrying a message (thrown by the core, e.g. a variable force without a finite value). */
export class MessageError extends Error {
  readonly msg: Message
  constructor(m: Message) {
    super(m.key)
    this.msg = m
  }
}
