/**
 * The repair protocol (26.64, D282). A sketch with findings is not written again: the model gets the fragments the
 * diagnostics are about and answers with a patch — a list of "set this path to this value". A patch may only touch what
 * a diagnostic names (its `path`, anything below it, and the paths in its `allow`); every other entry is rejected and
 * said so, so a repair cannot quietly change the rest of the sketch. `[+]` adds an item to a list, the value null takes
 * one out. The patched sketch goes through the whole ladder again.
 */
import type { Diagnostic, SceneSketch } from './schema'
import { patchValue } from './schema'
import { extractJsonObject, parseLoose } from '../looseJson'

export interface PatchEntry { op: string; path: string; value: unknown }

type Token = { key: string } | { index: number } | { append: true }

/** `connectors[0].path[2]` as tokens; null when the text is not a path. */
export function parsePath(path: string): Token[] | null {
  const out: Token[] = []
  const re = /\s*(?:\.?([A-Za-z_][A-Za-z0-9_]*)|\[(\d+|\+)\])/y
  let i = 0
  const t = path.trim()
  if (!t) return []
  while (i < t.length) {
    re.lastIndex = i
    const m = re.exec(t)
    if (!m) return null
    out.push(m[1] !== undefined ? { key: m[1] } : m[2] === '+' ? { append: true } : { index: Number(m[2]) })
    i = re.lastIndex
  }
  return out
}

const same = (a: Token, b: Token) => ('key' in a && 'key' in b && a.key === b.key) || ('index' in a && 'index' in b && a.index === b.index) || ('append' in a && 'append' in b)

/** The paths the diagnostics of a round name: what a patch may set. */
export function allowedPaths(diagnostics: Diagnostic[]): string[] {
  return [...new Set(diagnostics.flatMap(d => [d.path, ...(d.allow ?? [])]))]
}

/**
 * Whether a patch may set `path`: it is a named path or lies below one; a named list (or `list[+]`) also allows adding
 * to it. The empty path (a finding about the whole scene) allows everything.
 */
export function pathAllowed(path: string, allowed: string[]): boolean {
  const p = parsePath(path)
  if (!p || !p.length) return false
  for (const a of allowed) {
    const q = parsePath(a)
    if (!q) continue
    if (!q.length) return true
    // adding to a list: named as the list itself or as list[+]
    const list = q.length >= 1 && 'append' in q[q.length - 1] ? q.slice(0, -1) : null
    if (list && p.length >= list.length + 1 && list.every((t, i) => same(t, p[i])) && 'append' in p[list.length]) return true
    if (p.length >= q.length && q.every((t, i) => same(t, p[i]))) return true
  }
  return false
}

/** A patch from a model's answer: the call's arguments, `{patch: [...]}` or the bare list, as text or object. */
export function readPatch(raw: unknown): { entries: PatchEntry[]; error?: string } {
  let v = raw
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t) return { entries: [], error: 'an empty answer' }
    const list = t.startsWith('[') ? parseLoose(t) : null
    if (list?.ok && Array.isArray(list.value)) v = list.value
    else { const r = extractJsonObject(t, o => (Array.isArray(o.patch) ? 10 : 0) + (typeof o.path === 'string' ? 3 : 0)); if (!r || r.truncated) return { entries: [], error: 'no complete JSON object in the answer' }; v = r.value }
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) { const o = v as Record<string, unknown>; v = Array.isArray(o.patch) ? o.patch : typeof o.path === 'string' ? [o] : o.patch }
  if (!Array.isArray(v)) return { entries: [], error: 'the patch must be a list of {"op":"set","path":…,"value":…}' }
  const entries: PatchEntry[] = []
  for (const e of v.slice(0, 40)) {
    if (!e || typeof e !== 'object' || typeof (e as PatchEntry).path !== 'string') return { entries: [], error: 'every entry needs a path' }
    const x = e as PatchEntry
    entries.push({ op: typeof x.op === 'string' ? x.op : 'set', path: x.path, value: patchValue(x.value) })
  }
  return { entries }
}

export interface PatchOutcome { sketch: SceneSketch; applied: string[]; rejected: string[] }

/**
 * Apply a patch to a copy of the sketch. Entries are checked against what the diagnostics allow; indices refer to the
 * sketch as it was (items are taken out after everything else was set).
 */
export function applyPatch(sketch: SceneSketch, entries: PatchEntry[], diagnostics: Diagnostic[]): PatchOutcome {
  const next = JSON.parse(JSON.stringify(sketch)) as Record<string, unknown>
  const allowed = allowedPaths(diagnostics)
  const applied: string[] = [], rejected: string[] = []
  const removals: Array<{ list: unknown[]; index: number }> = []
  const appends = new Map<unknown[], unknown[]>()
  for (const e of entries) {
    const no = (why: string) => rejected.push(`${e.path}: ${why}`)
    if (e.op !== 'set') { no(`op "${e.op}" is not "set"`); continue }
    const p = parsePath(e.path)
    if (!p || !p.length) { no('not a path'); continue }
    if (!pathAllowed(e.path, allowed)) { no('no diagnostic names this path'); continue }
    // walk to the parent of the last token
    let at: unknown = next
    let bad = ''
    for (let i = 0; i < p.length - 1 && !bad; i++) {
      const t = p[i]
      if ('key' in t) { if (at && typeof at === 'object' && !Array.isArray(at) && t.key in (at as object)) at = (at as Record<string, unknown>)[t.key]; else bad = `no field "${t.key}"` }
      else if ('index' in t) { if (Array.isArray(at) && t.index < at.length) at = at[t.index]; else bad = `no item [${t.index}]` }
      else bad = '[+] can only end a path'
    }
    if (bad) { no(bad); continue }
    const last = p[p.length - 1]
    if ('key' in last) {
      if (!at || typeof at !== 'object' || Array.isArray(at) || !(last.key in (at as object))) { no(`no field "${last.key}"`); continue }
      if (e.value === null) { no('a field cannot be removed (use "" or [])'); continue }
      ;(at as Record<string, unknown>)[last.key] = e.value
    } else if ('index' in last) {
      if (!Array.isArray(at)) { no('not a list'); continue }
      if (last.index > at.length) { no(`the list has ${at.length} items`); continue }
      if (e.value === null) { if (last.index < at.length) removals.push({ list: at, index: last.index }); else { no(`no item [${last.index}]`); continue } }
      else if (last.index === at.length) appends.set(at, [...(appends.get(at) ?? []), e.value])
      else at[last.index] = e.value
    } else {
      if (!Array.isArray(at)) { no('not a list'); continue }
      if (e.value === null) { no('nothing to add'); continue }
      appends.set(at, [...(appends.get(at) ?? []), e.value])
    }
    applied.push(e.path)
  }
  // items out (from the back, so indices hold), then the new ones in
  const byList = new Map<unknown[], number[]>()
  for (const r of removals) byList.set(r.list, [...(byList.get(r.list) ?? []), r.index])
  for (const [list, idx] of byList) for (const i of [...new Set(idx)].sort((a, b) => b - a)) list.splice(i, 1)
  for (const [list, items] of appends) list.push(...items)
  return { sketch: next as unknown as SceneSketch, applied, rejected }
}

/**
 * The parts of a sketch a repair round needs to see: the items its diagnostics point at, the value rows of the objects
 * involved, and the list of ids — not the whole sketch, and never the earlier conversation.
 */
export function fragmentsFor(sketch: SceneSketch, diagnostics: Diagnostic[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const root = sketch as unknown as Record<string, unknown>
  const ids = new Set<string>()
  let wantsValues = false
  for (const path of allowedPaths(diagnostics)) {
    const p = parsePath(path)
    if (!p || !p.length || !('key' in p[0])) continue
    const key = p[0].key
    const v = root[key]
    if (!Array.isArray(v)) { if (key in root) out[key] = v; continue }
    if (key === 'values') wantsValues = true
    const i = p[1] && 'index' in p[1] ? p[1].index : -1
    if (i >= 0 && i < v.length) {
      out[`${key}[${i}]`] = v[i]
      const o = v[i] as Record<string, unknown>
      for (const k of ['id', 'of', 'ref', 'ref2']) if (typeof o?.[k] === 'string' && o[k]) for (const part of String(o[k]).split('|')) ids.add(part.trim())
    } else if (key !== 'values' && v.length <= 6) v.forEach((x, k) => { out[`${key}[${k}]`] = x })
  }
  // the rows of the objects in question (a missing or wrong value is seen next to its neighbours)
  sketch.values.forEach((r, i) => { if (r.of.split('|').some(x => ids.has(x.trim())) && !(`values[${i}]` in out) && Object.keys(out).length < 40) out[`values[${i}]`] = r })
  if (wantsValues) out['values.length'] = sketch.values.length
  out.ids = { surfaces: sketch.surfaces.map(x => x.id), bodies: sketch.bodies.map(x => x.id), pulleys: sketch.pulleys.map(x => x.id), connectors: sketch.connectors.map(x => x.id) }
  return out
}
