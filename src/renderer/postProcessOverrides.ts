/** 26.46 script-driven post-processing: Rhai scripts set (with an optional tween) or pulse the numeric post
 * values of the running game — a bloom flash on every beat, a vignette while paused. They are applied on top of
 * the project's preset and volumes each frame and cleared when Play stops. Post-processing must be enabled in
 * the project's rendering settings for the values to show (WebGL2). */
import type { PostProcessValues } from './renderSettingsSchema'

export type ScriptPostValue = 'exposure' | 'contrast' | 'saturation' | 'vignette' | 'bloom' | 'blur'
export const SCRIPT_POST_VALUES: readonly ScriptPostValue[] = ['exposure', 'contrast', 'saturation', 'vignette', 'bloom', 'blur']
const RANGES: Record<ScriptPostValue, [number, number]> = { exposure: [-8, 8], contrast: [0, 4], saturation: [0, 4], vignette: [0, 1], bloom: [0, 2], blur: [0, 32] }

interface Override { from: number | null; to: number; start: number; duration: number }
interface Pulse { amount: number; start: number; duration: number }
const overrides = new Map<ScriptPostValue, Override>()
const pulses = new Map<ScriptPostValue, Pulse[]>()
/** The value each overridden name showed last frame, so a new tween starts where the old one is. */
const shown = new Map<ScriptPostValue, number>()

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000
export function isScriptPostValue(name: string): name is ScriptPostValue { return (SCRIPT_POST_VALUES as readonly string[]).includes(name) }
const clampValue = (name: ScriptPostValue, value: number) => Math.min(RANGES[name][1], Math.max(RANGES[name][0], value))

/** Sets a value, reached linearly over `seconds` from the value shown now. Calling it again with the same
 * value and time (a script that sets it every frame) keeps the running tween instead of restarting it. */
export function setScriptPostValue(name: ScriptPostValue, value: number, seconds = 0, at = now()): void {
  if (!Number.isFinite(value)) return
  const to = clampValue(name, value), duration = Math.max(0, Math.min(60, Number.isFinite(seconds) ? seconds : 0))
  const current = overrides.get(name)
  if (current && current.to === to && current.duration === duration) return
  overrides.set(name, { from: shown.get(name) ?? null, to, start: at, duration })
}
/** Adds `amount` that decays to nothing over `seconds` (stacking pulses add up). */
export function pulseScriptPostValue(name: ScriptPostValue, amount: number, seconds: number, at = now()): void {
  if (!Number.isFinite(amount) || !(seconds > 0)) return
  const list = pulses.get(name) ?? []
  list.push({ amount, start: at, duration: Math.min(30, seconds) })
  if (list.length > 32) list.shift()
  pulses.set(name, list)
}
export function clearScriptPostValues(): void { overrides.clear(); pulses.clear(); shown.clear() }
export function scriptPostActive(): boolean { return overrides.size > 0 || pulses.size > 0 }

/** The authored values with the script's overrides and pulses applied (a new object; `values` is not changed). */
export function applyScriptPostValues(values: PostProcessValues, at = now()): PostProcessValues {
  if (!scriptPostActive()) return values
  const result = { ...values }
  for (const [name, override] of overrides) {
    if (override.from === null) override.from = values[name]
    const t = override.duration > 0 ? Math.min(1, Math.max(0, (at - override.start) / override.duration)) : 1
    result[name] = t >= 1 ? override.to : override.from + (override.to - override.from) * t
    shown.set(name, result[name])
  }
  for (const [name, list] of pulses) {
    let extra = 0
    for (const pulse of list) { const t = (at - pulse.start) / pulse.duration; if (t >= 0 && t < 1) extra += pulse.amount * (1 - t) * (1 - t) }
    const alive = list.filter(pulse => at - pulse.start < pulse.duration)
    if (alive.length) pulses.set(name, alive); else pulses.delete(name)
    result[name] = clampValue(name, result[name] + extra)
  }
  return result
}
