/**
 * State of the lab (26.54, D76): the apparatus and parameters of every experiment, kept in the browser's storage
 * ('velophi.lab.v1') so an experiment opens as it was left, plus export and import as a `velophi-lab` JSON file
 * (version 1; 2 for circuits with the element kinds of 26.55). The physics of every experiment is computed by the Rust core (engine/labs.ts); this module only
 * keeps what the user set up.
 */
import { reactive, watch } from 'vue'

const KEY = 'velophi.lab.v1'
/** File format of an exported experiment. */
export const LAB_FORMAT = 'velophi-lab'
/**
 * Newest file version this build reads. 26.55 writes version 2 only for a circuit with element kinds 26.54 does not
 * know (inductors, AC sources, diodes, motors …), so 26.54 refuses such a file with its "newer version" message
 * instead of failing on the unknown kind; every other experiment is still written as version 1.
 */
export const LAB_VERSION = 2
/** Circuit element kinds of 26.54 (lab file version 1). */
const CIRCUIT_KINDS_V1 = new Set(['wire', 'battery', 'resistor', 'lamp', 'switch', 'rheostat', 'ammeter', 'voltmeter', 'capacitor'])
/** File version needed for the state of experiment `id`. */
export function labVersionOf(id: string, s: Json | undefined): number {
  const els = s?.elements
  if (id === 'circuit' && Array.isArray(els) && els.some(e => !CIRCUIT_KINDS_V1.has(String((e as Json | null)?.kind)))) return 2
  return 1
}

type Json = Record<string, unknown>
const store = reactive<Record<string, Json>>({})
const defaultsOf = new Map<string, () => Json>()

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    const doc = JSON.parse(raw) as Record<string, unknown>
    for (const [k, v] of Object.entries(doc)) if (v && typeof v === 'object' && !Array.isArray(v)) store[k] = v as Json
  } catch { /* The lab state is optional */ }
}
load()

let timer: ReturnType<typeof setTimeout> | null = null
watch(store, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* Ignore */ } }, 250)
}, { deep: true })

/** Fill the keys a stored state lacks (older versions) with the defaults, recursively for plain objects. */
function complete(target: Json, def: Json) {
  for (const [k, v] of Object.entries(def)) {
    if (!(k in target) || typeof target[k] !== typeof v || Array.isArray(target[k]) !== Array.isArray(v)) target[k] = v
    else if (v && typeof v === 'object' && !Array.isArray(v)) complete(target[k] as Json, v as Json)
  }
}

/** The reactive, persisted state of experiment `id` (created from `defaults` the first time). */
export function labState<T extends object>(id: string, defaults: () => T): T {
  defaultsOf.set(id, defaults as () => Json)
  if (!store[id]) store[id] = defaults() as Json
  else complete(store[id], defaults() as Json)
  return store[id] as T
}

/** Back to the defaults of an experiment. */
export function resetLab(id: string) {
  const d = defaultsOf.get(id)
  if (!d) return
  const fresh = d()
  const s = store[id]
  for (const k of Object.keys(s)) delete s[k]
  Object.assign(s, fresh)
}

/** The experiment as `velophi-lab` JSON text. */
export function exportLab(id: string): string {
  return JSON.stringify({ format: LAB_FORMAT, version: labVersionOf(id, store[id]), lab: id, state: store[id] ?? {} }, null, 2) + '\n'
}

/** Restore an experiment from `velophi-lab` text; returns its id. Throws with a user-facing message. */
export function importLab(text: string, known: (id: string) => boolean, message: (key: 'json' | 'format' | 'version' | 'lab') => string): string {
  let doc: Record<string, unknown>
  try { doc = JSON.parse(text) as Record<string, unknown> } catch { throw new Error(message('json')) }
  if (!doc || doc.format !== LAB_FORMAT) throw new Error(message('format'))
  if (typeof doc.version !== 'number' || doc.version > LAB_VERSION) throw new Error(message('version'))
  const id = String(doc.lab ?? '')
  if (!known(id) || !doc.state || typeof doc.state !== 'object') throw new Error(message('lab'))
  const s = store[id] ?? (store[id] = {})
  for (const k of Object.keys(s)) delete s[k]
  Object.assign(s, doc.state as Json)
  const d = defaultsOf.get(id)
  if (d) complete(s, d())
  return id
}

/**
 * A request to show an experiment with one of its presets (26.55: the learning path and the global search open the
 * circuit lab at a preset). The experiment reacts to `seq`.
 */
export const labRequest = reactive<{ lab: string; preset: string | null; seq: number }>({ lab: '', preset: null, seq: 0 })
