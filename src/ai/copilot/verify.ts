/**
 * Deterministic checks of the Copilot (26.61, C). The model's explanation is a draft; whether its numbers agree with
 * the engine is decided here, by code: values are read from the explanation with their units, converted to SI,
 * matched to the engine's answers by dimension (in order), and compared with |claimed − engine| ≤ atol + rtol·|engine|.
 * The model may explain a difference; it cannot change the verdict.
 *
 * Also `sceneDiff`: what a Copilot change did to the scene (object, field, old → new), shown with its undo button.
 */
import type { AnswerLine } from '../import/answers'

/** Relative tolerance of a comparison (textbook answers are rounded, and often use g = 10 m/s²). */
export const CHECK_RTOL = 0.03

/** One question of the comparison. */
export interface AnswerCheck {
  prompt: string
  engine: number | null
  unit: string
  claimed: number | null
  /** The text the claimed value was read from. */
  claimedText?: string
  verdict: 'match' | 'mismatch' | 'unverifiable'
  /** |claimed − engine| / |engine| (null when not compared). */
  rel: number | null
}

/** Units the explanation may write, as factor to SI and the SI unit. */
const UNITS: Array<[RegExp, number, string]> = [
  [/^(m\/s²|m\/s\^2|m·s⁻²|m\s*s-2|米每二次方秒)/, 1, 'm/s²'],
  [/^(km\/h|千米每小时|公里每小时)/, 1 / 3.6, 'm/s'],
  [/^(cm\/s)/, 0.01, 'm/s'],
  [/^(m\/s|m·s⁻¹|米每秒|米\/秒)/, 1, 'm/s'],
  [/^(rad\/s|弧度每秒)/, 1, 'rad/s'],
  [/^(N·m|N\s*m|牛·米)/, 1, 'N·m'],
  [/^(kN)/, 1000, 'N'],
  [/^(mN)/, 1e-3, 'N'],
  [/^(N|牛顿|牛)(?![a-zA-Z])/, 1, 'N'],
  [/^(kJ)/, 1000, 'J'],
  [/^(J|焦耳|焦)(?![a-zA-Z])/, 1, 'J'],
  [/^(kW)/, 1000, 'W'],
  [/^(W|瓦特|瓦)(?![a-zA-Z])/, 1, 'W'],
  [/^(kg·m\/s|kg\s*m\/s|N·s)/, 1, 'kg·m/s'],
  [/^(kg|千克|公斤)/, 1, 'kg'],
  [/^(g|克)(?![a-zA-Z·/])/, 1e-3, 'kg'],
  [/^(km|千米|公里)/, 1000, 'm'],
  [/^(cm|厘米)/, 0.01, 'm'],
  [/^(mm|毫米)/, 0.001, 'm'],
  [/^(ms|毫秒)/, 0.001, 's'],
  [/^(m|米)(?![a-zA-Z/])/, 1, 'm'],
  [/^(s|秒)(?![a-zA-Z])/, 1, 's'],
  [/^(°|度)/, Math.PI / 180, 'rad'],
  [/^(rad|弧度)/, 1, 'rad'],
  [/^(μF|uF)/, 1e-6, 'F'],
  [/^(F)(?![a-zA-Z])/, 1, 'F'],
  [/^(V|伏特|伏)(?![a-zA-Z])/, 1, 'V'],
  [/^(mA)/, 1e-3, 'A'],
  [/^(A|安培|安)(?![a-zA-Z])/, 1, 'A'],
  [/^(kΩ)/, 1000, 'Ω'],
  [/^(Ω|欧姆|欧)/, 1, 'Ω'],
  [/^(Hz|赫兹)/, 1, 'Hz']
]

/** SI unit families that compare with each other (the engine writes some quantities differently). */
const FAMILY: Record<string, string> = { 'm/s²': 'm/s²', 'm/s': 'm/s', 'm': 'm', 's': 's', 'N': 'N', 'J': 'J', 'W': 'W', 'kg': 'kg', 'kg·m/s': 'kg·m/s', 'N·s': 'kg·m/s', 'rad': 'rad', 'rad/s': 'rad/s', 'N·m': 'N·m', 'F': 'F', 'V': 'V', 'A': 'A', 'Ω': 'Ω', 'Hz': 'Hz', '1/s': 'Hz' }
const family = (u: string) => FAMILY[u.replace(/\s/g, '').replace('m/s^2', 'm/s²')] ?? u

/** A value written in the text: number (decimal, ×10^n, e-notation, √, fraction) and unit. */
interface Claim { value: number; unit: string; text: string; at: number }

const NUM = /(?<![\w.])([-−–]?\s*(?:\d+(?:\.\d+)?(?:\s*[×x*]\s*10\s*\^?\s*[-−⁻]?\s*[\d⁰¹²³⁴⁵⁶⁷⁸⁹]+|[eE][-+]?\d+)?))\s*/g
const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' }

function numberOf(t: string): number {
  const s = t.replace(/[−–]/g, '-').replace(/\s+/g, '').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, c => SUP[c])
  const m = /^(-?\d+(?:\.\d+)?)(?:[×x*]10\^?(-?\d+)|[eE]([-+]?\d+))?$/.exec(s)
  if (!m) return NaN
  return Number(m[1]) * 10 ** Number(m[2] ?? m[3] ?? 0)
}

/** Values with units in a text (numbers without a known unit are left out: they are givens or step numbers). */
export function claimsOf(text: string): Claim[] {
  const out: Claim[] = []
  const t = text.replace(/\$|\\,|\\;|\\text\{([^}]*)\}|\\mathrm\{([^}]*)\}/g, (_, a: string, b: string) => a ?? b ?? ' ').replace(/\\cdot/g, '·').replace(/\\times/g, '×').replace(/\^\{([^}]*)\}/g, '^$1')
  NUM.lastIndex = 0
  for (let m = NUM.exec(t); m; m = NUM.exec(t)) {
    const rest = t.slice(m.index + m[0].length, m.index + m[0].length + 14)
    const u = UNITS.find(([re]) => re.test(rest))
    if (!u) continue
    const v = numberOf(m[1])
    if (!Number.isFinite(v)) continue
    out.push({ value: v * u[1], unit: u[2], text: `${m[1].trim()} ${rest.match(u[0])![0]}`, at: m.index })
  }
  return out
}

/** The part of an explanation that states the answers ("答案" … up to "过程"), else the whole text. */
function answerPart(text: string): string {
  const a = /(^|\n)\s*(#+\s*)?(\*\*)?\s*(答案|结论|Answer|Antwort)/i.exec(text)
  if (!a) return text
  const rest = text.slice(a.index)
  const b = /\n\s*(#+\s*)?(\*\*)?\s*(过程|解析|解答过程|步骤|Solution|Working|Lösung|Rechnung)/i.exec(rest.slice(4))
  return b ? rest.slice(0, b.index + 4) : rest
}

/**
 * Compare the numbers of an explanation with the engine's answers. Each engine answer takes the first unused claim of
 * the same unit family (from the answer part first, then the whole text); 'unverifiable' when there is none or the
 * engine has no value.
 */
export function compareAnswers(explanation: string, answers: AnswerLine[], rtol = CHECK_RTOL): AnswerCheck[] {
  const main = claimsOf(answerPart(explanation))
  const all = claimsOf(explanation)
  const used = new Set<Claim>()
  return answers.map(a => {
    const fam = family(a.unit)
    const pick = (list: Claim[]) => list.find(c => !used.has(c) && family(c.unit) === fam)
    // A claim of the same value is preferred over the first one of the family (an answer part may list several)
    const close = (list: Claim[]) => a.value === null ? undefined : list.find(c => !used.has(c) && family(c.unit) === fam && within(c.value, a.value!, rtol))
    const c = close(main) ?? pick(main) ?? close(all) ?? pick(all)
    if (a.value === null || !Number.isFinite(a.value) || !c) return { prompt: a.prompt, engine: a.value, unit: a.unit, claimed: c?.value ?? null, claimedText: c?.text, verdict: 'unverifiable', rel: null }
    used.add(c)
    const rel = Math.abs(a.value) > 0 ? Math.abs(c.value - a.value) / Math.abs(a.value) : null
    return { prompt: a.prompt, engine: a.value, unit: a.unit, claimed: c.value, claimedText: c.text, verdict: within(c.value, a.value, rtol) ? 'match' : 'mismatch', rel }
  })
}

/** |x − ref| ≤ atol + rtol·|ref| (angles and near-zero values compare absolutely). */
export function within(x: number, ref: number, rtol = CHECK_RTOL, atol = 1e-6 + 1e-3 * Math.min(1, Math.abs(ref))): boolean {
  return Math.abs(x - ref) <= atol + rtol * Math.abs(ref) || (Math.abs(ref) < 1e-6 && Math.abs(x) < 1e-3)
}

// ---- What a change did ----

type O = Record<string, unknown>
const isObj = (v: unknown): v is O => !!v && typeof v === 'object' && !Array.isArray(v)

/** Leaves of a JSON value as path → printable value (numbers rounded). */
function leaves(v: unknown, path: string, out: Map<string, string>, depth = 0) {
  if (depth > 6) return
  if (Array.isArray(v)) {
    if (v.length <= 8 && v.every(x => typeof x === 'number')) { out.set(path, `[${v.map(x => fmt(x as number)).join(', ')}]`); return }
    v.forEach((x, i) => leaves(x, `${path}[${i}]`, out, depth + 1))
    return
  }
  if (isObj(v)) { for (const [k, x] of Object.entries(v)) leaves(x, path ? `${path}.${k}` : k, out, depth + 1); return }
  out.set(path, typeof v === 'number' ? fmt(v) : JSON.stringify(v))
}
const fmt = (x: number) => (Number.isFinite(x) ? String(Number(x.toPrecision(6))) : String(x))

/** Items of a list keyed by id (bodies, connectors, pulleys). */
function byId(list: unknown): Map<string, O> {
  const m = new Map<string, O>()
  if (Array.isArray(list)) for (const x of list) if (isObj(x) && typeof x.id === 'string') m.set(x.id, x)
  return m
}

/** What changed between two scene files (at most `max` lines); a replaced scene is summarised in one line. */
export function sceneDiff(before: string, after: string, max = 12): { lines: string[]; replaced: boolean; more: number } {
  let a: O, b: O
  try { a = JSON.parse(before) as O; b = JSON.parse(after) as O } catch { return { lines: [], replaced: false, more: 0 } }
  const ba = byId(a.bodies), bb = byId(b.bodies)
  const kept = [...ba.keys()].filter(k => bb.has(k)).length
  if (kept === 0 || kept < Math.max(ba.size, bb.size) / 2) {
    return { lines: [`${String(a.name ?? '')} (${ba.size}) → ${String(b.name ?? '')} (${bb.size})`], replaced: true, more: 0 }
  }
  const lines: string[] = []
  const cmp = (label: string, x: unknown, y: unknown) => {
    const lx = new Map<string, string>(), ly = new Map<string, string>()
    leaves(x, '', lx); leaves(y, '', ly)
    for (const k of new Set([...lx.keys(), ...ly.keys()])) {
      if (k === 'color' || k.startsWith('extra') || k === 'name' && label === '') continue
      const p = lx.get(k), q = ly.get(k)
      if (p !== q) lines.push(`${label}${label && k ? '.' : ''}${k}: ${p ?? '—'} → ${q ?? '—'}`)
    }
  }
  for (const [id, x] of ba) { const y = bb.get(id); if (y) cmp(id, x, y); else lines.push(`− ${id}`) }
  for (const id of bb.keys()) if (!ba.has(id)) lines.push(`+ ${id}`)
  const ca = byId(a.connectors), cb = byId(b.connectors)
  for (const [id, x] of ca) { const y = cb.get(id); if (y) cmp(id, x, y); else lines.push(`− ${id}`) }
  for (const id of cb.keys()) if (!ca.has(id)) lines.push(`+ ${id}`)
  cmp('settings', a.settings, b.settings)
  return { lines: lines.slice(0, max), replaced: false, more: Math.max(0, lines.length - max) }
}
