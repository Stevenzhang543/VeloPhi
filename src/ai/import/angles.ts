/**
 * Angles that agree with the trigonometric values a problem states (26.59 fix). Textbook problems often fix
 * "sin37° = 0.6, cos37° = 0.8": the engine with exactly 37° then gives 3.014 s where the expected answer is 3 s.
 * When the problem states such a value, an angle of the reading that equals the named angle (or its complement)
 * becomes the consistent one (37° → 36.87°, 53° → 53.13°), and the reading says so in its assumptions. Applied to
 * the AI's answer before the checks, whether or not the AI followed the same rule in its prompt.
 */
import { tl } from '../../i18n'
import { templateById } from '../../templates'

const DEG_UNIT = /^(°|º|˚|deg|degree|degrees|度)$/i

/** Stated angle (degrees) → the angle consistent with the stated value, for every "sin/cos/tan θ° = v" in the text. */
export function statedAngles(text: string): Map<number, number> {
  const out = new Map<number, number>()
  const re = /(sin|cos|tan)\s*(\d{1,2}(?:\.\d+)?)\s*[°º˚]\s*[=＝≈]\s*(\d+(?:\.\d+)?)(?:\s*[/／]\s*(\d+(?:\.\d+)?))?/gi
  for (const m of text.matchAll(re)) {
    const fn = m[1].toLowerCase()
    const deg = Number(m[2])
    const v = m[4] ? Number(m[3]) / Number(m[4]) : Number(m[3])
    const rad = fn === 'sin' ? (v <= 1 ? Math.asin(v) : NaN) : fn === 'cos' ? (v <= 1 ? Math.acos(v) : NaN) : Math.atan(v)
    const c = (rad * 180) / Math.PI
    // Only a rounding of the textbook kind: the stated angle is within half a degree of the consistent one
    if (!Number.isFinite(c) || Math.abs(c - deg) < 1e-6 || Math.abs(c - deg) >= 0.5) continue
    const round = (x: number) => Number(x.toFixed(4))
    if (!out.has(deg)) out.set(deg, round(c))
    if (!out.has(90 - deg)) out.set(round(90 - deg), round(90 - c))
  }
  return out
}

type Quantity = { value?: unknown; unit?: unknown }
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Replace the stated angles in a build answer (template parameters, model inputs, task givens, generated scene
 * surfaces) by the consistent ones. Changes `raw` in place; returns one note per replaced angle.
 */
export function alignAngles(raw: unknown, text: string): string[] {
  const map = statedAngles(text)
  if (!map.size || !isObj(raw)) return []
  const done = new Map<number, number>()
  const swap = (v: number): number | undefined => {
    const c = map.get(v)
    if (c !== undefined) done.set(v, c)
    return c
  }
  const fix = (q: unknown, degrees: boolean) => {
    if (!isObj(q)) return
    const o = q as Quantity
    const unit = typeof o.unit === 'string' ? o.unit.trim() : ''
    if (!(DEG_UNIT.test(unit) || (!unit && degrees))) return
    const c = swap(Number(o.value))
    if (c !== undefined) o.value = c
  }
  const tpl = isObj(raw.template) ? raw.template : null
  if (tpl && isObj(tpl.params)) {
    const info = typeof tpl.id === 'string' ? templateById(tpl.id) : undefined
    for (const [k, q] of Object.entries(tpl.params)) fix(q, info?.params.find(p => p.key === k)?.unit === '°')
  }
  const model = isObj(raw.model) ? raw.model : null
  if (model && isObj(model.inputs)) for (const q of Object.values(model.inputs)) fix(q, false)
  const task = isObj(raw.task) ? raw.task : null
  if (task && Array.isArray(task.givens)) for (const g of task.givens) fix(g, false)
  const eqs = isObj(raw.equations) ? raw.equations : null
  if (eqs && Array.isArray(eqs.knowns)) for (const k of eqs.knowns) fix(k, false)
  const scene = isObj(raw.scene) ? raw.scene : null
  if (scene && Array.isArray(scene.surfaces)) {
    for (const s of scene.surfaces) {
      if (!isObj(s) || typeof s.angleDeg !== 'number') continue
      const c = swap(s.angleDeg)
      if (c !== undefined) s.angleDeg = c
    }
  }
  return [...done].map(([deg, c]) => tl('按题目给出的三角函数值，{0}° 取为 {1}°（与之一致），结果与按近似值计算的答案相同', [deg, c]))
}
