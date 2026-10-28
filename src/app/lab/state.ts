/**
 * State of the lab (26.54, D76): the apparatus and parameters of every experiment, kept in the browser's storage
 * ('velophi.lab.v1') so an experiment opens as it was left, plus export and import as a `velophi-lab` JSON file
 * (version 1; 2 for circuits with the element kinds of 26.55). The physics of every experiment is computed by the Rust core (engine/labs.ts); this module only
 * keeps what the user set up.
 */
import { reactive, watch } from 'vue'
import { runManifest } from '../models/run'

const KEY = 'velophi.lab.v1'
/** File format of an exported experiment. */
export const LAB_FORMAT = 'velophi-lab'
/**
 * Newest file version this build reads. 26.55 writes version 2 only for a circuit with element kinds 26.54 does not
 * know (inductors, AC sources, diodes, motors …), so 26.54 refuses such a file with its "newer version" message
 * instead of failing on the unknown kind; every other experiment is still written as version 1.
 */
export const LAB_VERSION = 3
/**
 * 26.56 (D100): experiments whose results depend on physical constants keep a `constantsSet`. New experiments use
 * CODATA 2022; states saved or exported before 26.56 have none and keep CODATA 2018 (their old results). A file that
 * names CODATA 2022 is version 3, which 26.55 refuses with its "newer version" message.
 */
export const CONSTANT_LABS = new Set(['compton', 'magnet', 'nuclear', 'capacitor'])
function keepOldConstants(id: string, s: Json) { if (CONSTANT_LABS.has(id) && !('constantsSet' in s)) s.constantsSet = 'CODATA2018' }
/** Circuit element kinds of 26.54 (lab file version 1). */
const CIRCUIT_KINDS_V1 = new Set(['wire', 'battery', 'resistor', 'lamp', 'switch', 'rheostat', 'ammeter', 'voltmeter', 'capacitor'])
/** File version needed for the state of experiment `id`. */
export function labVersionOf(id: string, s: Json | undefined): number {
  const els = s?.elements
  if (id === 'circuit' && Array.isArray(els) && els.some(e => !CIRCUIT_KINDS_V1.has(String((e as Json | null)?.kind)))) return 2
  if (CONSTANT_LABS.has(id) && s?.constantsSet === 'CODATA2022') return 3
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
  else { keepOldConstants(id, store[id]); complete(store[id], defaults() as Json) }
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
  const s = store[id] ?? {}
  return JSON.stringify({ format: LAB_FORMAT, version: labVersionOf(id, store[id]), lab: id, manifest: labManifest(id, s), state: s }, null, 2) + '\n'
}

/** Backend of the core that computes each experiment (the names of the run manifest, engine/CALC.md). */
const LAB_BACKEND: Record<string, string> = {
  electric: 'field', field: 'field', capacitor: 'field', circuit: 'circuit', magnet: 'magnet', optics: 'optics', lens: 'optics', rays: 'optics',
  'wave-optics': 'waveoptics', waves: 'waves', atomic: 'atom', hydrogen: 'atom', photo: 'atom', compton: 'nuclear', nuclear: 'nuclear',
  decay: 'decay', heat: 'heat', heating: 'heat', mixing: 'heat', gas: 'gas', relativity: 'relativity', quantum: 'quantum'
}

/**
 * Run manifest of an exported experiment (26.56, ENG13, D104): core and physics versions of its backend, SHA-256 of
 * the state, and the constant set — only for the experiments that take one (CONSTANT_LABS); the others use the
 * constants built into their backend, which the manifest says instead of naming a set.
 */
function labManifest(id: string, s: Json): Record<string, unknown> | null {
  const m = runManifest(LAB_BACKEND[id] ?? id, s, String(s.constantsSet ?? 'CODATA2018'))
  if (!m) return null
  if (CONSTANT_LABS.has(id)) return { ...m }
  const { constantsSet: _set, constantsSource: _source, ...rest } = m
  return { ...rest, constants: 'built into the backend (engine/CALC.md)' }
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
  keepOldConstants(id, s)
  const d = defaultsOf.get(id)
  if (d) complete(s, d())
  return id
}

/**
 * A request to show an experiment with one of its presets (26.55: the learning path and the global search open the
 * circuit lab at a preset). The experiment reacts to `seq`.
 */
export const labRequest = reactive<{ lab: string; preset: string | null; seq: number }>({ lab: '', preset: null, seq: 0 })
