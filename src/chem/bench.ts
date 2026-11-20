/**
 * The chemistry bench as the page's document (26.64, D268). The log of actions is the only truth: every gesture of
 * the interface becomes one action, the session held by the Rust core executes it, and what is drawn is read back
 * from the core. This module owns that session and mirrors its state for Vue (shallow references to plain data):
 *
 * - `apply(action)` — one action; on failure nothing happened and the core's message is shown, never half an action.
 * - undo / redo through the core's snapshots; positions and attached parts are drawing fields kept by `layout`.
 * - the clock: while running, time passes in FIXED steps of 0.5 s of bench time (speed ×1, ×10, ×60 means more steps
 *   per frame inside a time budget), so the log stays one `wait` entry with a count; it idles when nothing can change
 *   and stops while the page is hidden. "到反应结束" runs until the bench is quiet, with a cap.
 * - files (`.velophi-bench.json`), share links (`#b=…`, packed like scene links), the working bench kept in the
 *   browser's storage.
 *
 * Nothing chemical is computed here. The only arithmetic is bookkeeping for the drawing: how much gas the last steps
 * released per second (for the bubbles), and whether a liquid still fits the glass.
 */
import { computed, markRaw, ref, shallowRef } from 'vue'
import { Bench, emptyBench } from '../engine/chem'
import type { Amount, BenchAction, BenchDoc, BenchEvent, BenchFixture, BenchObject, BenchState, CircuitState, CollectMode, Diagnostic, VesselReading, VesselState } from '../engine/chem'
import { MessageError } from '../i18n/message'
import { msgText } from '../i18n/locale'
import { tl } from '../i18n'
import { STOPPER_HOLDS_KPA, kindName, kindOf, shapeOf, vesselObject } from './apparatus'
import { openTextFile, saveFile } from '../platform/files'
import { fmtVolume } from './format'
import { createEffects } from './effects'
import { createSeries } from './series'
import type { EffectState } from './effects'
import { reagentOf } from './catalog'
import { RIG, actingOn, bottleFor, dropSpot, fixtureBox, gripOf, halfOf, heatedBy, heightOf, isBath, isBurner, isFixtureKind, newFixture, rigWants } from './rig'
import type { Fixture, RigVessel, Spot, TubeEnd } from './rig'

/** Bench time per step, s: fixed, so equal steps merge into one entry of the log. */
export const STEP = 0.5
export type Speed = 1 | 10 | 60
/** Steps without anything happening before the clock idles (10 s of bench time). */
const QUIET_STEPS = 20
/** "到反应结束" gives up after this much bench time, s. */
export const END_CAP = 7200
const AUTOSAVE_KEY = 'velophi.bench.v1'
export const BENCH_SHARE_PREFIX = '#b='
export const BENCH_EXT = 'velophi-bench.json'
/** Gas amounts below this are not worth a note (mol). */
const NOTE_MIN = 1e-6

/** Drawing fields the bench keeps on an object of the core (not chemistry, not in the log). */
export interface Extras {
  x: number
  y: number
  /** The letter of the vessel's name: "锥形瓶 A". */
  label: string
  /** Kinds of the instruments and tools attached. */
  parts: string[]
  /** A burette or separating funnel clamped over this vessel delivers into it. */
  above: string | null
  /** An electrode waiting for its partner (its material). */
  electrode: string | null
  /** 26.65 (D297): the fixture it stands on or is held by (a tripod, a rack, a clamp …), and how. */
  on: string | null
  at: Spot['what'] | null
}

/** Something that happened, for the brief note near a vessel and the inspector's lines. */
export interface Phenomenon {
  key: string
  vessel: string
  code: string
  /** Species id (precipitate, gas …) or reaction id. */
  subject: string
  /** Amount so far, mol (extent of a reaction). */
  n: number
  teaching: boolean
  effects: string[]
  /** Wall-clock time (ms) until which its note is shown; 0: not shown. */
  until: number
  /** Wall-clock time of the last event of this kind. */
  last: number
}

/** What the last steps of the clock did to a vessel, per second of bench time (for the drawing only). */
export interface Activity { gas: number; boil: number; inflow: number }

export interface BenchOptions {
  /** Where the working bench is kept between visits (null: nowhere). */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  /** Show a message (the page hands in the application's toast). */
  notify?: (text: string, error?: boolean, action?: { label: string; run: () => void }) => void
  now?: () => number
}

const DRAW_DEFAULT: Extras = { x: 0, y: 0, label: '', parts: [], above: null, electrode: null, on: null, at: null }
const CORE_FIELDS = new Set(['id', 'kind', 'capacity_mL', 'heat_J_K', 'loss_W_K', 'closed', 'collect', 'brim_mL', 'burst_kPa', 'heatable', 'shock_K'])

/** The drawing fields of an object. */
export function extrasOf(o: BenchObject | undefined): Extras {
  if (!o) return { ...DRAW_DEFAULT, parts: [] }
  return {
    x: typeof o.x === 'number' ? o.x : 0,
    y: typeof o.y === 'number' ? o.y : 0,
    label: typeof o.label === 'string' ? o.label : '',
    parts: Array.isArray(o.parts) ? (o.parts as unknown[]).filter((p): p is string => typeof p === 'string') : [],
    above: typeof o.above === 'string' ? o.above : null,
    electrode: typeof o.electrode === 'string' ? o.electrode : null,
    on: typeof o.on === 'string' ? o.on : null,
    at: typeof o.at === 'string' ? (o.at as Spot['what']) : null
  }
}

/** Is this text a bench document? Throws a readable error when it is not. */
export function parseBenchDoc(text: string): BenchDoc {
  let doc: unknown
  try { doc = JSON.parse(text) } catch { throw new Error(tl('不是实验台文件')) }
  const d = doc as Partial<BenchDoc> | null
  if (!d || d.format !== 'velophi-bench' || !Array.isArray(d.log)) throw new Error(tl('不是实验台文件'))
  if (d.version !== 1) throw new Error(tl('实验台文件的版本 {0} 比本程序新', [String(d.version)]))
  return { format: 'velophi-bench', version: 1, engine: d.engine, settings: d.settings, objects: Array.isArray(d.objects) ? d.objects : [], custom: d.custom ?? undefined, log: d.log }
}

/** True when nothing on the bench can change by waiting: no heater, no current, every vessel at its surroundings. */
export function atRest(s: BenchState): boolean {
  for (const v of s.vessels) {
    if (v.heater > 0) return false
    const target = v.bath ?? s.ambient.T
    if (Math.abs(v.T - target) > 0.02) return false
  }
  for (const c of s.circuits ?? []) if (c.on && c.connected && Math.abs(c.I) > 1e-9) return false
  return true
}

export function createBench(options: BenchOptions = {}) {
  const storage = options.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : options.storage
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
  let notify = options.notify ?? (() => {})

  let session: Bench | null = null
  /** The room as the document started with it (`document()` reports the room as it is now). */
  let startSettings: BenchDoc['settings'] | undefined
  let custom: unknown
  /** The drawing fields as the user left them: put back after undo and redo, which restore the core's snapshot. */
  const mirror = new Map<string, Extras>()

  const ready = ref(false)
  const failure = ref('')
  const state = shallowRef<BenchState | null>(null)
  const objects = shallowRef<BenchObject[]>([])
  const log = shallowRef<BenchAction[]>([])
  const selected = ref<string | null>(null)
  const reading = shallowRef<VesselReading | null>(null)
  /** Counts every change of the state: the canvas redraws when it moves. */
  const revision = ref(0)
  const running = ref(false)
  const speed = ref<Speed>(1)
  /** The clock is on but nothing can change: no steps are taken. */
  const idle = ref(false)
  /** "到反应结束" is at work. */
  const finishing = ref(false)
  const dirty = ref(false)
  const fileName = ref<string | null>(null)
  const phenomena = shallowRef<Phenomenon[]>([])
  /** The core's diagnostics per vessel (the “未建模” and “近似” marks). */
  const diagnostics = shallowRef(new Map<string, Diagnostic[]>())
  /** Per vessel: gas released, water boiled off and gas received per second of bench time in the last frame. */
  const activity = markRaw(new Map<string, Activity>())
  /** The effects of reactions going on, for the drawing (26.65, D297 item 2). */
  const effects = markRaw(createEffects())
  /** The core's numbers over time, per vessel, for the live curves (26.65, D297 item 10). */
  const series = markRaw(createSeries())
  /** 26.65 (D297): the things on the bench that are not vessels (the core keeps them as given), and the one selected. */
  const fixtures = shallowRef<Fixture[]>([])
  const selectedFixture = ref<string | null>(null)
  /**
   * Gestures whose geometry decided chemistry (a lamp put under a flask): the actions they gave are one step of undo
   * together with the drawing they changed, so undo puts the lamp back where it was. `start … end` are lengths of the
   * log; `items` the drawing of what changed, before and after.
   */
  interface Group { start: number; end: number; items: Array<{ id: string; fixture: boolean; before: unknown; after: unknown }> }
  let geomPast: Group[] = []
  let geomFuture: Group[] = []
  /** A gesture is being turned into actions: `apply` leaves the drawing to it. */
  let inGesture = false

  const vessels = computed<VesselState[]>(() => state.value?.vessels ?? [])
  const circuits = computed<CircuitState[]>(() => state.value?.circuits ?? [])
  const canUndo = computed(() => !!state.value?.canUndo)
  /** Redo is offered by the core after an action this module took back (a liquid that did not fit): hide it. */
  const redoBlocked = ref(false)
  const canRedo = computed(() => !!state.value?.canRedo && !redoBlocked.value)
  const empty = computed(() => vessels.value.length === 0)
  const time = computed(() => state.value?.time ?? 0)

  const objectOf = (id: string) => objects.value.find(o => o.id === id)
  const vesselOf = (id: string | null) => (id ? vessels.value.find(v => v.id === id) : undefined)
  const extras = (id: string) => extrasOf(objectOf(id))
  const circuitOf = (vessel: string) => circuits.value.find(c => c.a.vessel === vessel || c.b.vessel === vessel)

  function fail(e: unknown, what?: string) {
    const text = e instanceof MessageError ? msgText(e.msg) : (e as Error)?.message ?? String(e)
    notify(what ? tl('{0}：{1}', [what, text]) : tl('操作未执行：{0}', [text]), true)
  }

  // ---- reading the core back ----

  function sync(st?: BenchState, full = true) {
    if (!session) return
    const s = st ?? session.state()
    state.value = markRaw(s)
    series.cut(s.time, s.log)
    series.sample(s.time, s.log, s.vessels)
    if (full) {
      const all = session.layoutAll([])
      objects.value = markRaw(all.objects)
      fixtures.value = markRaw((all.fixtures ?? []) as Fixture[])
      if (selectedFixture.value && !fixtures.value.some(f => f.id === selectedFixture.value)) selectedFixture.value = null
      log.value = markRaw(session.document().log)
      for (const o of objects.value) mirror.set(o.id, extrasOf(o))
      readDiagnostics(s)
    }
    if (selected.value && !s.vessels.some(v => v.id === selected.value)) selected.value = null
    readSelected()
    revision.value++
  }

  function readDiagnostics(s: BenchState) {
    const m = new Map<string, Diagnostic[]>()
    for (const v of s.vessels) { try { const d = session!.read(v.id).diagnostics; if (d.length) m.set(v.id, d) } catch { /* the vessel left */ } }
    diagnostics.value = markRaw(m)
  }

  function readSelected() {
    if (!session || !selected.value) { reading.value = null; return }
    try { reading.value = markRaw(session.read(selected.value)) } catch { reading.value = null }
  }

  function select(id: string | null) {
    selected.value = id && vessels.value.some(v => v.id === id) ? id : null
    if (selected.value) selectedFixture.value = null
    readSelected()
    revision.value++
  }

  /** A vessel in full (the inspector and the test hook); null when it is not on the bench. */
  function read(id: string): VesselReading | null {
    if (!session) return null
    try { return session.read(id) } catch { return null }
  }

  // ---- the document ----

  /**
   * The document as a file or a link holds it. The core's `document()` lists the objects on the bench *and* keeps
   * their `place` entries in the log, and gives the room as it is now; a session is created from the objects that
   * were there before the log began, the room it began with, and the log — with today's drawing fields written into
   * the `place` entries, so a vessel comes back where it stands.
   */
  function portableDoc(): BenchDoc {
    if (!session) return emptyBench()
    const doc = session.document()
    const current = new Map(doc.objects.map(o => [o.id, o]))
    const placed = new Set<string>()
    const entries = doc.log.map(e => {
      if (e.act !== 'place') return e
      placed.add(e.object.id)
      const nowObj = current.get(e.object.id)
      if (!nowObj) return e
      const drawing = Object.fromEntries(Object.entries(nowObj).filter(([k]) => !CORE_FIELDS.has(k)))
      return { act: 'place' as const, object: { ...e.object, ...drawing } }
    })
    const out: BenchDoc = { format: 'velophi-bench', version: 1, engine: doc.engine, objects: doc.objects.filter(o => !placed.has(o.id)), log: entries }
    if (startSettings) out.settings = startSettings
    if (custom !== undefined && custom !== null) out.custom = custom
    if (fixtures.value.length) out.fixtures = fixtures.value
    return out
  }

  /** Replace the bench by a document. Throws (and keeps the bench as it was) when the core cannot replay it. */
  function open(doc: BenchDoc, name: string | null = null) {
    const next = Bench.create(doc)
    session?.free()
    session = next
    startSettings = doc.settings ? { ...doc.settings } : undefined
    custom = doc.custom
    mirror.clear()
    phenomena.value = []
    activity.clear()
    effects.clear()
    series.clear()
    redoBlocked.value = false
    running.value = false; idle.value = false; finishing.value = false
    owed = 0; quiet = 0
    selected.value = null
    selectedFixture.value = null
    geomPast = []; geomFuture = []
    fileName.value = name
    dirty.value = false
    sync()
    // a bench of 26.64 drew its supports and burners itself: they become things on the bench (drawing only)
    migrate()
    followCore()
  }

  function reset() { open(emptyBench()); clearAutosave() }

  function dispose() { stopLoop(); flushAutosave(); session?.free(); session = null; state.value = null; ready.value = false }

  // ---- actions ----

  /** The most a vessel can hold before it runs over, mL: to its brim. */
  function limitOf(v: VesselState): number {
    // the object's brim (the core lets what is above it run over) or the profile's
    const brim = objectOf(v.id)?.brim_mL
    if (typeof brim === 'number') return Math.max(v.capacity_mL, brim) + 1e-6
    try { return Math.max(v.capacity_mL, shapeOf(v.kind, v.capacity_mL).brim_mL) } catch { return v.capacity_mL }
  }

  /**
   * One action. Returns the events, or null when it did not happen: the core refused it (its message is shown), or
   * the liquid would not fit the vessel (the action is taken back at once).
   */
  function apply(action: BenchAction, quietly = false): BenchEvent[] | null {
    if (!session) return null
    let out: { events: BenchEvent[]; state: BenchState }
    try { out = session.apply(action) } catch (e) { if (!quietly) fail(e); return null }
    const target = action.act === 'add' ? action.to : action.act === 'pour' || action.act === 'filter' ? action.to : null
    const v = target ? out.state.vessels.find(x => x.id === target) : undefined
    if (v && v.volume_mL > limitOf(v) * (1 + 1e-9)) {
      session.undo()
      redoBlocked.value = true
      sync()
      if (!quietly) notify(tl('操作未执行：{0}装不下，最多 {1}', [vesselName(v.id), fmtVolume(limitOf(v), 0)]), true)
      return null
    }
    redoBlocked.value = false
    geomFuture = []
    record(out.events, false)
    sync(out.state)
    if (!inGesture) followCore()
    touched()
    return out.events
  }

  function touched() {
    dirty.value = true
    quiet = 0
    idle.value = false
    scheduleAutosave()
    if (running.value) startLoop()
  }

  function restoreLayout() {
    if (!session) return
    const ids = new Set(session.layout([]).map(o => o.id))
    const put = [...mirror].filter(([id]) => ids.has(id)).map(([id, e]) => ({ id, kind: '', ...e }))
    if (put.length) session.layout(put)
  }

  const logLength = () => (session ? session.document().log.length : 0)

  function undo() {
    if (!session || !state.value?.canUndo) return
    const n = logLength()
    const g = geomPast[geomPast.length - 1]
    const group = g && g.end === n ? g : null
    const steps = group ? Math.max(1, group.end - group.start) : 1
    for (let i = 0; i < steps; i++) { try { session.undo() } catch (e) { if (i === 0) { fail(e); return } break } }
    redoBlocked.value = false
    restoreLayout()
    if (group) { geomPast.pop(); geomFuture.push(group); putDrawing(group, 'before') }
    phenomena.value = []
    effects.clear()
    sync()
    followCore()
    touched()
  }

  function redo() {
    if (!session || !state.value?.canRedo || redoBlocked.value) return
    const n = logLength()
    const g = geomFuture[geomFuture.length - 1]
    const group = g && g.start === n ? g : null
    const steps = group ? Math.max(1, group.end - group.start) : 1
    for (let i = 0; i < steps; i++) { try { session.redo() } catch (e) { if (i === 0) { fail(e); return } break } }
    restoreLayout()
    if (group) { geomFuture.pop(); geomPast.push(group); putDrawing(group, 'after') }
    phenomena.value = []
    effects.clear()
    sync()
    followCore()
    touched()
  }

  /** Change drawing fields of an object (position, attached parts): not chemistry, not in the log. */
  function setExtras(id: string, patch: Partial<Extras>) {
    if (!session || !objectOf(id)) return
    objects.value = markRaw(session.layout([{ id, kind: '', ...patch }]))
    mirror.set(id, extrasOf(objectOf(id)))
    dirty.value = true
    scheduleAutosave()
    revision.value++
  }

  // ---- the rig: fixtures, and geometry that decides chemistry (26.65, D297 items 3–5) ----

  const fixtureOf = (id: string | null) => (id ? fixtures.value.find(f => f.id === id) : undefined)

  /** Replace the list of fixtures (drawing only: the core keeps it as given). */
  function setFixtures(list: Fixture[]) {
    if (!session) return
    fixtures.value = markRaw((session.layoutAll([], list as BenchFixture[]).fixtures ?? []) as Fixture[])
    if (selectedFixture.value && !fixtures.value.some(f => f.id === selectedFixture.value)) selectedFixture.value = null
    dirty.value = true
    scheduleAutosave()
    revision.value++
  }

  function nextFixtureId(list: Fixture[] = fixtures.value): string {
    let n = 0
    for (const f of list) { const m = /^f(\d+)$/.exec(f.id); if (m) n = Math.max(n, Number(m[1])) }
    return `f${n + 1}`
  }

  /** The vessels as the rig sees them: where each stands and on what. */
  function rigVessels(): RigVessel[] {
    return vessels.value.map(v => { const e = extras(v.id); return { id: v.id, kind: v.kind, capacity_mL: v.capacity_mL, x: e.x, y: e.y, on: e.on, at: e.at } })
  }

  // drawing snapshots of the things a gesture touches, for its step of undo
  const drawingOf = () => ({ fixtures: new Map(fixtures.value.map(f => [f.id, JSON.stringify(f)])), extras: new Map(objects.value.map(o => [o.id, JSON.stringify(extrasOf(o))])) })
  function changes(a: ReturnType<typeof drawingOf>, b: ReturnType<typeof drawingOf>): Group['items'] {
    const out: Group['items'] = []
    for (const id of new Set([...a.fixtures.keys(), ...b.fixtures.keys()])) if (a.fixtures.get(id) !== b.fixtures.get(id)) out.push({ id, fixture: true, before: a.fixtures.has(id) ? JSON.parse(a.fixtures.get(id)!) : null, after: b.fixtures.has(id) ? JSON.parse(b.fixtures.get(id)!) : null })
    for (const id of b.extras.keys()) if (a.extras.has(id) && a.extras.get(id) !== b.extras.get(id)) out.push({ id, fixture: false, before: JSON.parse(a.extras.get(id)!), after: JSON.parse(b.extras.get(id)!) })
    return out
  }
  /** Put the drawing of a group's things back as it was before it, or as it was after it. */
  function putDrawing(g: Group, side: 'before' | 'after') {
    let list = fixtures.value.slice()
    for (const it of g.items) {
      const v = it[side] as Fixture | Extras | null
      if (it.fixture) { list = list.filter(f => f.id !== it.id); if (v) list.push(v as Fixture) }
      else if (v && objectOf(it.id)) setExtras(it.id, v as Extras)
    }
    list.sort((p, q) => Number(p.id.slice(1)) - Number(q.id.slice(1)))
    setFixtures(list)
  }

  /** The actions the geometry asks for: a burner under a vessel heats it, a bath holds its vessel at its temperature. */
  function rigActions(before?: ReturnType<typeof drawingOf>): BenchAction[] {
    const wants = rigWants(fixtures.value, rigVessels())
    const out: BenchAction[] = []
    for (const v of vessels.value) {
      const w = wants.get(v.id)
      if (!w) continue
      // on its mouth in a pneumatic trough: over water (D297 item 8); taken out of the trough: no longer
      if (w.water && v.collect !== 'water') out.push({ act: 'collector', vessel: v.id, mode: 'water' })
      else if (!w.water && v.collect === 'water' && before && (JSON.parse(before.extras.get(v.id) ?? '{}') as Partial<Extras>).at === 'trough') out.push({ act: 'collector', vessel: v.id, mode: 'none' })
      // a broken vessel is heated no more; one that may not be heated is — and cracks (the core's consequence, D297 item 9)
      if (Math.abs(v.heater - w.heater) > 1e-9 && !v.cracked) out.push({ act: 'heat', vessel: v.id, power: w.heater })
      const want = w.bath, now = v.bath
      if ((want === null) !== (now === null) || (want !== null && now !== null && Math.abs(want - now) > 1e-6)) out.push({ act: 'bath', vessel: v.id, T: want })
    }
    return out
  }

  /** The fixtures that set a vessel up for a heat source or a bath, and where the vessel then is. */
  function rigFor(v: { id: string; kind: string; capacity_mL: number }, e: Extras, kind: string, list: Fixture[]): { add: Fixture[]; move: Partial<Extras> } {
    const add: Fixture[] = []
    const make = (k: string, x: number) => { const f = newFixture(k, nextFixtureId([...list, ...add]), x); add.push(f); return f }
    const tube = halfOf(v.kind, v.capacity_mL) <= 1.3
    // a stand goes on the side with room: its rod and base are not put through what stands beside the vessel
    const busy = (x0: number, x1: number) => list.filter(f => { const b = fixtureBox(f); return b.x1 > x0 && b.x0 < x1 }).length + objects.value.filter(o => { if (o.id === v.id) return false; const ex = extrasOf(o); return Math.abs(ex.x - (x0 + x1) / 2) < (x1 - x0) / 2 + 1 }).length
    const standSide = (reach: number): 1 | -1 => (busy(e.x - reach - RIG.stand.baseL - 1, e.x - 1.5) <= busy(e.x + 1.5, e.x + reach + RIG.stand.baseL + 1) ? 1 : -1)
    const standAt = (st: Fixture, reach: number) => { const side = standSide(reach); st.side = side; st.x = Math.round((e.x - side * reach) * 10) / 10 }
    if (isBurner(kind)) {
      const g = kind === 'blastBurner' ? RIG.blastBurner : RIG.alcoholBurner
      const bottom = Math.round((g.h + g.flame * 0.62) * 10) / 10
      if (tube || kind === 'blastBurner') {
        // a stand holds the tube (or, over a blast burner, its ring carries the vessel) above the flame
        const stand = make('stand', e.x - RIG.stand.reach)
        make(kind, e.x)
        if (tube) { standAt(stand, RIG.stand.reach); stand.clamp = Math.round((bottom + gripOf(v.kind, v.capacity_mL)) * 10) / 10; return { add, move: { x: e.x, y: bottom, on: stand.id, at: 'clamp' } } }
        stand.clamp = null; stand.ring = Math.round((bottom - 0.15) * 100) / 100
        standAt(stand, RIG.stand.ringReach)
        return { add, move: { x: e.x, y: bottom, on: stand.id, at: 'ring' } }
      }
      const tripod = make('tripod', e.x)
      make(kind, e.x)
      return { add, move: { y: RIG.tripod.h, on: tripod.id, at: 'gauze' } }
    }
    if (kind === 'tripod') { const t = make('tripod', e.x); return { add, move: { y: RIG.tripod.h, on: t.id, at: 'gauze' } } }
    if (kind === 'pneumaticTrough') { const t = make('pneumaticTrough', Math.round((e.x - RIG.trough.half * 0.35) * 10) / 10); return { add, move: { x: e.x, y: RIG.trough.shelf, on: t.id, at: 'trough' } } }
    if (kind === 'stand') {
      // held where it stands, by the neck
      const st = make('stand', e.x - RIG.stand.reach)
      standAt(st, RIG.stand.reach)
      st.clamp = Math.round((e.y + gripOf(v.kind, v.capacity_mL)) * 10) / 10
      return { add, move: { x: e.x, on: st.id, at: 'clamp' } }
    }
    if (kind === 'testTubeRack' && tube) { const r = make('testTubeRack', e.x + 1.5 * RIG.rack.pitch); return { add, move: { x: e.x, y: RIG.rack.floor, on: r.id, at: 'slot' } } }
    if (kind === 'hotPlate') { const p = make('hotPlate', e.x); return { add, move: { y: RIG.hotPlate.h, on: p.id, at: 'plate' } } }
    if (isBath(kind)) { const b = make(kind, e.x); return { add, move: { x: e.x, y: RIG.bath.floor, on: b.id, at: 'bath' } } }
    return { add, move: {} }
  }

  /**
   * Make the drawing say what the core holds (after an action that did not come from the geometry: a menu, a guided
   * step, Copilot, undo): a vessel the core heats has a lit burner under it (one is brought when there is none), a
   * vessel it does not heat has none lit under it; a vessel the core holds in a bath stands in one at that temperature.
   */
  function followCore() {
    if (!session) return
    let list = fixtures.value.map(f => ({ ...f }))
    const moves = new Map<string, Partial<Extras>>()
    let changed = false
    const vs = rigVessels()
    const wants = rigWants(list, vs)
    for (const v of vessels.value) {
      const w = wants.get(v.id)!
      const e = extras(v.id)
      if (v.heater > 0 && w.heater === 0) {
        const rv = vs.find(x => x.id === v.id)!
        const near = list.find(f => isBurner(f.kind) && heatedBy({ ...f, lit: true }, vs)?.id === v.id) ?? list.find(f => f.kind === 'hotPlate' && e.on === f.id)
        if (near) { if (isBurner(near.kind)) { near.lit = true; near.cap = false } else near.on = true; near.power = v.heater }
        else {
          const r = rigFor(rv, e, v.heater > 450 ? 'blastBurner' : 'alcoholBurner', list)
          for (const f of r.add) if (isBurner(f.kind)) { f.lit = true; f.cap = false; f.power = v.heater }
          list = [...list, ...r.add]
          moves.set(v.id, { ...moves.get(v.id), ...r.move })
        }
        changed = true
      } else if (v.heater > 0 && w.by && Math.abs(w.heater - v.heater) > 1e-9) {
        const f = list.find(x => x.id === w.by)!
        f.power = v.heater
        changed = true
      } else if (!(v.heater > 0) && w.heater > 0 && w.by && !v.cracked) {
        const f = list.find(x => x.id === w.by)!
        if (isBurner(f.kind)) f.lit = false; else f.on = false
        changed = true
      }
      if (v.bath !== null && w.bath === null) {
        // into an empty bath of its kind on the bench, or one brought for it
        const kind = v.bath < 280 ? 'iceBath' : 'waterBath'
        const free = list.filter(f => f.kind === kind && !vs.some(x => x.on === f.id)).sort((p, q) => Math.abs(p.x - e.x) - Math.abs(q.x - e.x))[0]
        if (free) { free.T = v.bath; moves.set(v.id, { ...moves.get(v.id), x: free.x, y: free.y + RIG.bath.floor, on: free.id, at: 'bath' }) }
        else {
          const r = rigFor(vs.find(x => x.id === v.id)!, e, kind, list)
          for (const f of r.add) f.T = v.bath
          list = [...list, ...r.add]
          moves.set(v.id, { ...moves.get(v.id), ...r.move })
        }
        changed = true
      } else if (v.bath !== null && w.bath !== null && Math.abs(v.bath - w.bath) > 1e-6) {
        const f = list.find(x => x.id === e.on)
        if (f) { f.T = v.bath; changed = true }
      } else if (v.bath === null && w.bath !== null) {
        const f = list.find(x => x.id === e.on)
        moves.set(v.id, { x: f ? Math.round((f.x + RIG.bath.half + halfOf(v.kind, v.capacity_mL) + 1) * 10) / 10 : e.x, y: 0, on: null, at: null })
        changed = true
      }
    }
    if (followPlumbing(list, moves)) changed = true
    if (!changed) return
    for (const [id, m] of moves) setExtras(id, m)
    setFixtures(list)
  }

  /** The parts of 26.64 that are things of their own now (a burner, a hot plate, a bath on a vessel's list of parts). */
  const LEGACY = new Set(['alcoholBurner', 'blastBurner', 'hotPlate', 'waterBath', 'iceBath'])
  function migrate() {
    if (!session) return
    let list = fixtures.value.slice()
    let changed = false
    for (const o of objects.value) {
      const e = extrasOf(o)
      const old = e.parts.filter(p => LEGACY.has(p))
      if (!old.length) continue
      const v = vesselOf(o.id)
      let move: Partial<Extras> = { parts: e.parts.filter(p => !LEGACY.has(p)) }
      for (const kind of old) {
        if (!v) break
        // a bath the vessel is not in yet stands beside it, ready (the step that puts it in is the student's)
        if (isBath(kind) && v.bath === null) { list = [...list, newFixture(kind, nextFixtureId(list), Math.round((e.x + halfOf(v.kind, v.capacity_mL) + RIG.bath.half + 1.5) * 10) / 10)]; continue }
        const r = rigFor(v, { ...e, ...move } as Extras, kind, list)
        list = [...list, ...r.add]
        move = { ...move, ...r.move }
      }
      setExtras(o.id, move)
      changed = true
    }
    if (changed) setFixtures(list)
  }

  /**
   * A gesture: `change` moves things (drawing only), then what the geometry now means becomes actions of the log —
   * one step of undo with the drawing it changed. A move that means nothing for the chemistry is not a step of undo
   * (as in 26.64: positions are not chemistry).
   */
  function gesture(change: () => void, extra?: () => BenchAction[]): BenchEvent[] {
    if (!session) return []
    const before = drawingOf()
    const n0 = logLength()
    const events: BenchEvent[] = []
    inGesture = true
    try {
      change()
      for (const a of extra?.() ?? []) { const ev = apply(a); if (ev) events.push(...ev) }
      for (const a of rigActions(before)) { const ev = apply(a); if (ev) events.push(...ev) }
    } finally { inGesture = false }
    followCore()
    const n1 = logLength()
    if (n1 > n0) { geomPast.push({ start: n0, end: n1, items: changes(before, drawingOf()) }); geomFuture = [] }
    revision.value++
    return events
  }

  /** Put a vessel down at (x, its bottom): it comes to rest on the support under it, in a clamp it is brought to, or on the bench. */
  function moveVessel(id: string, x: number, bottom: number): Spot | null {
    const v = vesselOf(id)
    if (!v) return null
    const spot = dropSpot(fixtures.value, rigVessels(), v, x, bottom)
    gesture(() => setExtras(id, { x: spot.x, y: spot.y, on: spot.on, at: spot.on ? spot.what : null, above: null }))
    return spot
  }

  /** Where a vessel carried to (x, bottom) would come to rest (for the highlight while it is carried). */
  function spotFor(id: string, x: number, bottom: number): Spot | null {
    const v = vesselOf(id)
    return v ? dropSpot(fixtures.value, rigVessels(), v, x, bottom) : null
  }

  /** The x a fixture put down near another snaps to: a burner under a tripod, a ring or a clamped vessel; a tripod over a burner. */
  function snapFixture(kind: string, x: number, self?: string): number {
    const near = (x2: number, d: number) => Math.abs(x2 - x) <= d
    if (isBurner(kind)) {
      for (const f of fixtures.value) if (f.id !== self && f.kind === 'tripod' && near(f.x, 3.5)) return f.x
      for (const v of rigVessels()) if (v.y > 2 && near(v.x, 3)) return v.x
    }
    if (kind === 'tripod') for (const f of fixtures.value) if (f.id !== self && isBurner(f.kind) && near(f.x, 3.5)) return f.x
    return Math.round(x * 10) / 10
  }

  /** Move a fixture along the bench; what it holds goes with it. */
  function moveFixture(id: string, x: number) {
    const f = fixtureOf(id)
    if (!f) return
    const to = snapFixture(f.kind, x, id)
    const dx = to - f.x
    gesture(() => {
      for (const v of rigVessels()) if (v.on === id) setExtras(v.id, { x: Math.round((v.x + dx) * 100) / 100 })
      setFixtures(fixtures.value.map(g => (g.id === id ? { ...g, x: to } : g)))
    })
  }

  /** Put a fixture on the bench (at a place, or beside what stands there); returns its id. */
  function addFixture(kind: string, at?: { x: number }): string | null {
    if (!isFixtureKind(kind) || !session) return null
    if (kind === 'tube') return addTube(null)
    const id = nextFixtureId()
    const box = fixtureBox(newFixture(kind, id, 0))
    const x = at ? snapFixture(kind, at.x) : freeSpot(box.x1 - box.x0).x
    gesture(() => setFixtures([...fixtures.value, newFixture(kind, id, x)]))
    selectFixture(id)
    return id
  }

  /** Change settings of a fixture (the power of a burner, a bath's temperature, the height of a clamp …). */
  function setFixture(id: string, patch: Partial<Fixture>) {
    const f = fixtureOf(id)
    if (!f) return
    gesture(() => {
      // a clamp or a ring that moves carries what it holds
      if (f.kind === 'stand') {
        for (const v of rigVessels()) {
          if (v.on !== id) continue
          if (v.at === 'clamp' && typeof patch.clamp === 'number' && typeof f.clamp === 'number') setExtras(v.id, { y: Math.round((v.y + patch.clamp - f.clamp) * 100) / 100 })
          if (v.at === 'ring' && typeof patch.ring === 'number' && typeof f.ring === 'number') setExtras(v.id, { y: Math.round((v.y + patch.ring - f.ring) * 100) / 100 })
        }
      }
      setFixtures(fixtures.value.map(g => (g.id === id ? { ...g, ...patch } : g)))
    })
  }

  /**
   * What a tap on a fixture does: an alcohol lamp's cap comes off, the lamp is lit, the cap goes back on (a lamp is put
   * out with its cap, never blown out); a blast burner and a hot plate are switched on and off.
   */
  function tapFixture(id: string) {
    const f = fixtureOf(id)
    if (!f) return
    if (f.kind === 'alcoholBurner') setFixture(id, f.lit ? { lit: false, cap: true } : f.cap ? { cap: false } : { lit: true })
    else if (f.kind === 'blastBurner') setFixture(id, { lit: !f.lit })
    else if (f.kind === 'hotPlate') setFixture(id, { on: !f.on })
    else if (f.kind === 'reagentBottle') setFixture(id, { open: !f.open })
  }

  /**
   * Put a labelled bottle of a reagent of the shelf on the bench (D297 item 6): a stock bottle, drawing only — what is
   * taken from it is an `add` of that reagent. Returns its id; null for a gas (it comes in no bottle).
   */
  function placeBottle(reagent: string, at?: { x: number }): string | null {
    const style = bottleFor(reagentOf(reagent))
    if (!style || !session) return null
    const id = nextFixtureId()
    const f: Fixture = { ...newFixture('reagentBottle', id, 0), reagent, style, open: false }
    const box = fixtureBox(f)
    f.x = at ? Math.round(at.x * 10) / 10 : freeSpot(box.x1 - box.x0).x
    gesture(() => setFixtures([...fixtures.value, f]))
    selectFixture(id)
    return id
  }

  /** Take a fixture off the bench; what stood on it comes down to the bench. */
  function removeFixture(id: string) {
    if (!fixtureOf(id)) return
    gesture(() => {
      for (const v of rigVessels()) if (v.on === id) setExtras(v.id, { y: 0, on: null, at: null })
      setFixtures(fixtures.value.filter(f => f.id !== id))
    })
  }

  function selectFixture(id: string | null) {
    selectedFixture.value = id && fixtures.value.some(f => f.id === id) ? id : null
    if (selectedFixture.value) { selected.value = null; readSelected() }
    revision.value++
  }


  // ---- delivery tubes and the trough (26.65, D297 item 8) ----

  /** The tube whose end `a` is in a vessel's stopper. */
  const tubeFrom = (vessel: string) => fixtures.value.find(f => f.kind === 'tube' && f.a?.vessel === vessel && f.a.at === 'stopper')

  /** Vessels that have a tube through their stopper (the stopper is drawn even while the tube's free end vents it). */
  function tubed(): Set<string> {
    const out = new Set<string>()
    for (const f of fixtures.value) if (f.kind === 'tube' && f.a?.vessel && f.a.at === 'stopper') out.add(f.a.vessel)
    return out
  }

  /** How an end of a tube put down at (x, y) comes to rest: in a vessel (what it is in it), or free. */
  function tubeSpot(which: 'a' | 'b', x: number, y: number, self: string, other: TubeEnd | undefined): TubeEnd {
    const free: TubeEnd = { x: Math.round(x * 10) / 10, y: Math.round(Math.max(0.5, y) * 10) / 10, vessel: null, at: null }
    let best: TubeEnd | null = null, dist = Infinity
    for (const v of vessels.value) {
      if (other?.vessel === v.id) continue
      const e = extras(v.id)
      const k = kindOf(v.kind)?.vessel
      if (!k) continue
      const h = heightOf(v.kind, v.capacity_mL)
      const half = halfOf(v.kind, v.capacity_mL)
      // a jar on its mouth in a trough: its mouth is at the bottom, under water
      if (which === 'b' && e.at === 'trough') {
        const d = Math.abs(x - e.x) + Math.abs(y - (e.y + 0.4)) * 0.5
        if (Math.abs(x - e.x) <= half + 3 && y <= e.y + h * 0.5 && d < dist) { dist = d; best = { x: e.x, y: e.y, vessel: v.id, at: 'under' } }
        continue
      }
      const mouth = e.y + h
      if (Math.abs(x - e.x) > Math.max(1.6, half + 1.5) || y < mouth - 2.5 || y > mouth + 8) continue
      const d = Math.abs(x - e.x) + Math.abs(y - mouth) * 0.4
      if (d >= dist) continue
      if (which === 'a') { if (k.stopper && !k.draw.lid && !k.tap) { dist = d; best = { x: e.x, y: mouth, vessel: v.id, at: 'stopper' } } continue }
      if (k.draw.lid || k.tap) continue
      dist = d
      best = { x: e.x, y: mouth, vessel: v.id, at: v.volume_mL > 0.5 && !k.collect ? 'liquid' : 'mouth' }
    }
    void self
    return best ?? free
  }

  /** The actions a tube's ends mean: through the source's stopper to where the other end is (or venting from a free end). */
  function tubeActions(t: Fixture, was: Fixture | undefined): BenchAction[] {
    const out: BenchAction[] = []
    const S = t.a?.at === 'stopper' && t.a.vessel ? vesselOf(t.a.vessel) : undefined
    const oldS = was?.a?.at === 'stopper' && was.a.vessel ? vesselOf(was.a.vessel) : undefined
    // the end taken out of a vessel's stopper: that vessel's tube leads nowhere now
    if (oldS && oldS.id !== S?.id && oldS.outlet) out.push({ act: 'disconnect', from: oldS.id })
    if (!S) return out
    const T = t.b?.vessel ? vesselOf(t.b.vessel) : undefined
    if (T) {
      if (!S.closed) out.push({ act: 'stopper', vessel: S.id, on: true })
      if (S.outlet !== T.id) out.push({ act: 'connect', from: S.id, to: T.id })
      // down to the bottom of an empty upright jar: upward displacement of air
      if (t.b?.at === 'mouth' && kindOf(T.kind)?.vessel?.collect && T.collect === 'none') out.push({ act: 'collector', vessel: T.id, mode: 'up' })
    } else {
      // a free end: the gas leaves through it into the room — the source is open to the room through its tube
      if (S.outlet) out.push({ act: 'disconnect', from: S.id })
      if (S.closed) out.push({ act: 'stopper', vessel: S.id, on: false })
    }
    return out
  }

  /** Put a tube on the bench: from the selected vessel's stopper (its other end free beside it), or lying free. */
  function addTube(from?: string | null): string | null {
    if (!session) return null
    const id = nextFixtureId()
    const v = from ? vesselOf(from) : undefined
    let t: Fixture
    if (v && kindOf(v.kind)?.vessel?.stopper) {
      const e = extras(v.id), top = e.y + heightOf(v.kind, v.capacity_mL)
      t = { id, kind: 'tube', x: e.x, y: top, a: { x: e.x, y: top, vessel: v.id, at: 'stopper' }, b: { x: Math.round((e.x + 8) * 10) / 10, y: Math.round((top + 2) * 10) / 10, vessel: null, at: null } }
      // through the stopper: the vessel is closed (the free end is put somewhere next)
      gesture(() => { setFixtures([...fixtures.value, t]); if (!extras(v.id).parts.includes('stopper')) setExtras(v.id, { parts: [...extras(v.id).parts, 'stopper'] }) }, () => (v.closed ? [] : [{ act: 'stopper', vessel: v.id, on: true }]))
    } else {
      const x = freeSpot(12).x
      t = { id, kind: 'tube', x, y: 0.5, a: { x: x - 5, y: 0.6, vessel: null, at: null }, b: { x: x + 5, y: 0.6, vessel: null, at: null } }
      gesture(() => setFixtures([...fixtures.value, t]))
    }
    selectFixture(id)
    return id
  }

  /** Put an end of a tube down at (x, y): in a stopper, under a jar in the trough, into a vessel, or free. */
  function moveTubeEnd(id: string, which: 'a' | 'b', x: number, y: number): TubeEnd | null {
    const t = fixtureOf(id)
    if (!t || t.kind !== 'tube') return null
    const end = tubeSpot(which, x, y, id, which === 'a' ? t.b : t.a)
    const next: Fixture = { ...t, [which]: end }
    if (which === 'a' && end.vessel && !extras(end.vessel).parts.includes('stopper') && kindOf(vesselOf(end.vessel)?.kind ?? '')?.vessel?.stopper) {
      gesture(() => { setFixtures(fixtures.value.map(f => (f.id === id ? next : f))); setExtras(end.vessel!, { parts: [...extras(end.vessel!).parts, 'stopper'] }) }, () => tubeActions(next, t))
    } else gesture(() => setFixtures(fixtures.value.map(f => (f.id === id ? next : f))), () => tubeActions(next, t))
    return end
  }

  /**
   * The drawing of tubes and troughs follows the core: a vessel the core delivers to another has a tube from its
   * stopper to it; a tube whose vessels the core no longer joins hangs free; a jar the core holds over water stands on
   * its mouth in a trough, one it does not leaves the trough.
   */
  function followPlumbing(list: Fixture[], moves: Map<string, Partial<Extras>>): boolean {
    let changed = false
    for (const v of vessels.value) {
      const e = { ...extras(v.id), ...moves.get(v.id) }
      if (v.outlet) {
        const T = vesselOf(v.outlet)
        if (!T) continue
        const te = { ...extras(T.id), ...moves.get(T.id) }
        const at: TubeEnd['at'] = T.collect === 'water' ? 'under' : T.volume_mL > 0.5 && !kindOf(T.kind)?.vessel?.collect ? 'liquid' : 'mouth'
        const b: TubeEnd = { x: te.x, y: te.y + heightOf(T.kind, T.capacity_mL), vessel: T.id, at }
        const t = list.find(f => f.kind === 'tube' && f.a?.vessel === v.id && f.a.at === 'stopper')
        if (t) { if (t.b?.vessel !== T.id || t.b.at !== at) { t.b = b; changed = true } }
        else {
          const top = e.y + heightOf(v.kind, v.capacity_mL)
          list.push({ id: nextFixtureId(list), kind: 'tube', x: e.x, y: top, a: { x: e.x, y: top, vessel: v.id, at: 'stopper' }, b })
          changed = true
        }
      } else {
        const t = list.find(f => f.kind === 'tube' && f.a?.vessel === v.id && f.a.at === 'stopper' && f.b?.vessel)
        if (t && t.b && vesselOf(t.b.vessel ?? '')) {
          const be = extras(t.b.vessel!)
          t.b = { x: Math.round((be.x + 4) * 10) / 10, y: Math.round((be.y + 4) * 10) / 10, vessel: null, at: null }
          changed = true
        }
      }
      // a jar over water stands on its mouth in a trough
      if (v.collect === 'water' && e.at !== 'trough') {
        let tr = list.find(f => f.kind === 'pneumaticTrough' && !vessels.value.some(x => x.id !== v.id && (moves.get(x.id)?.on ?? extras(x.id).on) === f.id))
        if (!tr) { tr = { ...newFixture('pneumaticTrough', nextFixtureId(list), Math.round((e.x - RIG.trough.half * 0.35) * 10) / 10) }; list.push(tr) }
        moves.set(v.id, { ...moves.get(v.id), x: Math.round((tr.x + RIG.trough.half * 0.35) * 10) / 10, y: tr.y + RIG.trough.shelf, on: tr.id, at: 'trough' })
        changed = true
      } else if (v.collect !== 'water' && e.at === 'trough') {
        const tr = list.find(f => f.id === e.on)
        moves.set(v.id, { ...moves.get(v.id), x: tr ? Math.round((tr.x + RIG.trough.half + halfOf(v.kind, v.capacity_mL) + 1.5) * 10) / 10 : e.x, y: 0, on: null, at: null })
        changed = true
      }
    }
    return changed
  }

  /** The instruments and tools on a vessel, and the kinds of the fixtures that act on it (a burner under it, its bath). */
  function partsOf(id: string): string[] {
    return [...extras(id).parts, ...actingOn(fixtures.value, rigVessels(), id)]
  }

  /** The fixture of a kind that heats a vessel or holds it in a bath. */
  function rigOf(vessel: string, kind: string): Fixture | undefined {
    const vs = rigVessels()
    const v = vs.find(x => x.id === vessel)
    if (!v) return undefined
    return fixtures.value.find(f => f.kind === kind && (isBurner(kind) ? heatedBy({ ...f, lit: true }, vs)?.id === vessel : v.on === f.id))
  }
  /** Can this fixture kind be set up for this vessel (a rack takes test tubes only)? */
  function rigFits(vessel: string, kind: string): boolean {
    const v = vesselOf(vessel)
    if (!v) return false
    if (kind === 'testTubeRack') return halfOf(v.kind, v.capacity_mL) <= 1.3
    if (kind === 'pneumaticTrough') return !!kindOf(v.kind)?.vessel?.collect || v.kind === 'testTube'
    if (kind === 'tube') return !!kindOf(v.kind)?.vessel?.stopper
    return isFixtureKind(kind)
  }

  /** Set a vessel up with a heat source or a bath of a kind (the tap path of the shelf, a guided step): returns true. */
  function rigUnder(vessel: string, kind: string): boolean {
    const v = vesselOf(vessel)
    if (!v) return false
    if (kind === 'tube') return !!addTube(vessel)
    if (rigOf(vessel, kind)) return true
    gesture(() => {
      const r = rigFor(v, extras(vessel), kind, fixtures.value)
      setExtras(vessel, r.move)
      setFixtures([...fixtures.value, ...r.add])
    })
    return true
  }

  /** Names: "锥形瓶 A". */
  function vesselName(id: string): string {
    const o = objectOf(id) ?? placedObject(id)
    if (!o) return id
    return `${kindName(kindOf(o.kind), o.kind)} ${extrasOf(o).label}`.trim()
  }
  /** An object that left the bench is still named in the record: its `place` entry has it. */
  function placedObject(id: string): BenchObject | undefined {
    for (const e of log.value) if (e.act === 'place' && e.object.id === id) return e.object
    return undefined
  }

  function nextId(): string {
    let n = 0
    for (const e of log.value) if (e.act === 'place') { const m = /^v(\d+)$/.exec(e.object.id); if (m) n = Math.max(n, Number(m[1])) }
    for (const o of objects.value) { const m = /^v(\d+)$/.exec(o.id); if (m) n = Math.max(n, Number(m[1])) }
    return `v${n + 1}`
  }
  function nextLabel(): string {
    const used = new Set(objects.value.map(o => extrasOf(o).label))
    for (let i = 0; i < 26 * 9; i++) {
      const l = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26) + 1) : '')
      if (!used.has(l)) return l
    }
    return ''
  }

  /** A free place on the bench for something `width` cm wide (to the right of what stands there). */
  function freeSpot(width: number): { x: number; y: number } {
    let right = -Infinity
    for (const o of objects.value) {
      const e = extrasOf(o)
      if (e.above || e.on) continue
      let w = 8
      try { w = shapeOf(o.kind, o.capacity_mL).rMax * 2 } catch { /* default */ }
      right = Math.max(right, e.x + w / 2)
    }
    for (const f of fixtures.value) right = Math.max(right, fixtureBox(f).x1)
    return { x: right === -Infinity ? 0 : Math.round((right + 4 + width / 2) * 10) / 10, y: 0 }
  }

  /** Put a vessel on the bench; returns its id, or null when the core refused. */
  function place(kind: string, at?: { x: number; y: number }, capacity_mL?: number): string | null {
    const k = kindOf(kind)
    if (!k?.vessel || !k.available) return null
    const id = nextId()
    const shape = shapeOf(kind, capacity_mL)
    const free = at ?? freeSpot(shape.rMax * 2)
    // put down where it was carried to: on the support under that point, or on the bench (26.65, D297 item 3)
    const cap = capacity_mL ?? k.vessel.default
    const spot = at ? dropSpot(fixtures.value, rigVessels(), { id, kind, capacity_mL: cap }, at.x, at.y) : { x: free.x, y: 0, on: null, what: 'bench' as const }
    const object: BenchObject = { ...vesselObject(kind, id, capacity_mL), x: Math.round(spot.x * 100) / 100, y: spot.y, label: nextLabel(), parts: [], above: null, electrode: null, on: spot.on, at: spot.on ? spot.what : null }
    // a stopper pushed in by hand holds so much overpressure, then it is blown out (D297 item 9)
    if (k.vessel.stopper && !object.closed) object.burst_kPa = STOPPER_HOLDS_KPA
    let ok = false
    gesture(() => { ok = !!apply({ act: 'place', object }) })
    if (!ok) return null
    select(id)
    return id
  }

  /** Take a vessel off the bench (with what is wired or piped to it); undo brings it back. */
  function removeVessel(id: string): boolean {
    if (!vesselOf(id)) return false
    for (const c of circuits.value) if (c.a.vessel === id || c.b.vessel === id) apply({ act: 'circuitRemove', id: c.id }, true)
    for (const v of vessels.value) if (v.outlet === id) apply({ act: 'disconnect', from: v.id }, true)
    for (const o of objects.value) if (extrasOf(o).above === id) setExtras(o.id, { above: null })
    return !!apply({ act: 'remove', id })
  }

  const add = (to: string, reagent: string, amount: Amount) => apply({ act: 'add', to, reagent, amount })
  const pour = (from: string, to: string, amount?: Amount) => apply(amount ? { act: 'pour', from, to, amount } : { act: 'pour', from, to })
  const filter = (from: string, to: string) => apply({ act: 'filter', from, to })
  const emptyVessel = (vessel: string) => apply({ act: 'empty', vessel })
  const setCollector = (vessel: string, mode: CollectMode) => apply({ act: 'collector', vessel, mode })
  const connect = (from: string, to: string) => apply({ act: 'connect', from, to })
  const disconnect = (from: string) => apply({ act: 'disconnect', from })

  /** Attach an instrument or a tool to a vessel (a drawing field; what the tool does is a separate action). */
  function attach(vessel: string, part: string): boolean {
    const k = kindOf(part)
    const v = vesselOf(vessel)
    if (!k || !v || (!k.instrument && !k.tool)) return false
    // a burner, a hot plate, a bath is a thing of its own (26.65): it is set up under the vessel
    if (LEGACY.has(part)) return rigUnder(vessel, part)
    const e = extras(vessel)
    if (e.parts.includes(part)) return true
    // one heat source, one bath at a time
    const rival = (p: string) => { const t = kindOf(p)?.tool, mine = k.tool; return !!t && !!mine && t.action === mine.action && (mine.action === 'heat' || mine.action === 'bath') }
    for (const p of e.parts.filter(rival)) detach(vessel, p)
    setExtras(vessel, { parts: [...extras(vessel).parts, part] })
    return true
  }

  /** Take a part off a vessel; what it was doing stops (the burner goes out, the bath is removed …). */
  function detach(vessel: string, part: string) {
    // a burner, a hot plate, a bath: the thing itself is taken away (what it did stops)
    if (LEGACY.has(part)) { const f = rigOf(vessel, part); if (f) removeFixture(f.id); return }
    const e = extras(vessel)
    if (!e.parts.includes(part)) return
    const t = kindOf(part)?.tool
    const v = vesselOf(vessel)
    if (t && v) {
      if (t.action === 'heat' && v.heater > 0) apply({ act: 'heat', vessel, power: 0 })
      if (t.action === 'bath' && v.bath !== null) apply({ act: 'bath', vessel, T: null })
      if (t.action === 'stopper' && v.closed) apply({ act: 'stopper', vessel, on: false })
      if (t.action === 'connect' && v.outlet) apply({ act: 'disconnect', from: vessel })
    }
    setExtras(vessel, { parts: extras(vessel).parts.filter(p => p !== part) })
  }

  /** What tapping a tool on its vessel does: the burner lights or goes out, the stopper goes in or comes out … */
  function useTool(vessel: string, part: string): boolean {
    const t = kindOf(part)?.tool
    const v = vesselOf(vessel)
    if (!t || !v) return false
    switch (t.action) {
      case 'heat': return !!apply({ act: 'heat', vessel, power: v.heater > 0 ? 0 : t.power_W ?? 0 })
      case 'bath': return !!apply({ act: 'bath', vessel, T: v.bath !== null ? null : t.T_K ?? null })
      case 'stopper': return !!apply({ act: 'stopper', vessel, on: !v.closed })
      case 'ignite': return !!apply({ act: 'ignite', vessel, on: !v.ignited })
      default: return false
    }
  }

  // ---- electrodes and circuits ----

  /**
   * Put an electrode into a vessel. The core wires two electrodes at once, so the first one waits (a drawing field)
   * and the second closes the circuit with it; returns the circuit's id, or '' while the electrode waits.
   */
  function addElectrode(vessel: string, material: string): string | null {
    if (!vesselOf(vessel)) return null
    const waiting = objects.value.find(o => extrasOf(o).electrode)
    if (!waiting) { setExtras(vessel, { electrode: material }); return '' }
    let n = 1
    while (circuits.value.some(c => c.id === `c${n}`) || log.value.some(e => e.act === 'circuit' && e.id === `c${n}`)) n++
    const first = extrasOf(waiting).electrode as string
    if (!apply({ act: 'circuit', id: `c${n}`, a: { vessel: waiting.id, electrode: first }, b: { vessel, electrode: material }, load: 10 })) return null
    setExtras(waiting.id, { electrode: null })
    return `c${n}`
  }
  const setCircuit = (id: string, patch: { load?: number; source?: number; bridge?: boolean; on?: boolean }) => apply({ act: 'circuitSet', id, ...patch })
  const removeCircuit = (id: string) => apply({ act: 'circuitRemove', id })

  // ---- what happened ----

  /** A stopper blown out (the core's event) is off the vessel: it is no longer a part of it, its tube hangs free. */
  function afterConsequences(events: BenchEvent[]) {
    const blown = events.filter(e => e.code === 'stopper.blown').map(e => e.vessel)
    if (!blown.length || !session) return
    let list = fixtures.value
    for (const id of blown) {
      const e = extras(id)
      if (e.parts.includes('stopper')) setExtras(id, { parts: e.parts.filter(p => p !== 'stopper' && p !== 'tube') })
      list = list.map(f => (f.kind === 'tube' && f.a?.vessel === id ? { ...f, a: { x: Math.round((e.x + 2.5) * 10) / 10, y: Math.round((e.y + heightOf(vesselOf(id)?.kind ?? '', vesselOf(id)?.capacity_mL) + 4) * 10) / 10, vessel: null, at: null } } : f))
    }
    setFixtures(list)
  }

  function record(events: BenchEvent[], streaming: boolean) {
    if (!events.length) return
    const t = now()
    effects.note(events, streaming, t / 1000)
    afterConsequences(events)
    const list = phenomena.value.slice()
    for (const e of events) {
      // a declared reaction that did not advance in this step is not something that happened
      if (e.code === 'reaction' && !(Number(e.params.extent) > 0)) continue
      const subject = String(e.params.species ?? e.params.id ?? e.params.reason ?? '')
      const key = `${e.vessel}|${e.code}|${subject}`
      const n = typeof e.params.n === 'number' ? e.params.n : typeof e.params.extent === 'number' ? e.params.extent : typeof e.params.water === 'number' ? e.params.water : typeof e.params.volume_mL === 'number' ? e.params.volume_mL : 0
      let p = list.find(x => x.key === key)
      const fresh = !p || t - p.last > 5000
      if (!p) { p = { key, vessel: e.vessel, code: e.code, subject, n: 0, teaching: e.params.teaching === true, effects: Array.isArray(e.params.effects) ? (e.params.effects as string[]) : [], until: 0, last: 0 }; list.push(p) }
      else { p = { ...p }; list[list.findIndex(x => x.key === key)] = p }
      p.n += n
      p.last = t
      const amountMatters = e.code === 'gas' || e.code === 'collect.dissolved' || e.code === 'dissolved'
      const visible = !(amountMatters && (p.n < NOTE_MIN || subject === 'H2O(g)')) && !(streaming && e.code === 'reaction' && !fresh)
      // a stream of gas keeps its note (the amount counts up); anything else shows once per streak
      if (visible && (fresh || !streaming || p.until === 0)) p.until = t + 4200
      else if (visible && e.code === 'gas' && p.until > 0) p.until = Math.max(p.until, t + 2500)
    }
    phenomena.value = list
  }

  /** The notes to draw now (those whose time has not run out). */
  function notesNow(): Phenomenon[] {
    const t = now()
    return phenomena.value.filter(p => p.until > t)
  }

  // ---- the clock ----

  let owed = 0
  let quiet = 0
  let raf = 0
  let lastWall = 0
  let visible = true
  let lastRead = 0
  let lastLog = 0

  /**
   * One frame of the clock: `dtReal` seconds of wall time passed. Takes as many fixed steps as the speed asks for
   * and the time budget allows; returns how many. Idles (returns 0, `idle` true) when nothing can change.
   */
  function frame(dtReal: number, budgetMs = 6): number {
    if (!session || !running.value) return 0
    if (idle.value) return 0
    owed = Math.min(owed + dtReal * speed.value, 2 * speed.value)
    const t0 = now()
    let steps = 0
    let last: BenchState | null = null
    const before = state.value
    const sums = new Map<string, Activity>()
    const all: BenchEvent[] = []
    while (owed >= STEP) {
      let out: { events: BenchEvent[]; state: BenchState }
      try { out = session.advance(STEP) } catch (e) { running.value = false; fail(e, tl('时间停止')); break }
      owed -= STEP
      steps++
      last = out.state
      for (const e of out.events) {
        all.push(e)
        const a = sums.get(e.vessel) ?? { gas: 0, boil: 0, inflow: 0 }
        if (e.code === 'gas' && e.params.species !== 'H2O(g)') a.gas += Number(e.params.n) || 0
        else if (e.code === 'reaction' && Array.isArray(e.params.effects) && (e.params.effects as string[]).includes('bubbles')) a.gas = Math.max(a.gas, Number(e.params.extent) || 0)
        else if (e.code === 'boiling') a.boil += Number(e.params.water) || 0
        sums.set(e.vessel, a)
      }
      quiet = out.events.length === 0 && atRest(out.state) ? quiet + 1 : 0
      if (quiet >= QUIET_STEPS) { idle.value = true; owed = 0; break }
      if (now() - t0 > budgetMs) { owed = Math.min(owed, STEP); break }
    }
    if (last) {
      const seconds = steps * STEP
      activity.clear()
      for (const [id, a] of sums) activity.set(id, { gas: a.gas / seconds, boil: a.boil / seconds, inflow: 0 })
      // a vessel that receives gas through a tube: its gas volume grew
      for (const v of last.vessels) {
        const was = before?.vessels.find(x => x.id === v.id)
        if (was && v.gas_mL > was.gas_mL + 1e-9) { const a = activity.get(v.id) ?? { gas: 0, boil: 0, inflow: 0 }; a.inflow = (v.gas_mL - was.gas_mL) / seconds; activity.set(v.id, a) }
      }
      record(all, true)
      const t = now()
      // the record and the selected vessel's species are read a few times a second, not every frame
      const full = t - lastLog > 500
      if (full) lastLog = t
      state.value = markRaw(last)
      series.sample(last.time, last.log, last.vessels)
      if (full && session) { log.value = markRaw(session.document().log); readDiagnostics(last) }
      if (t - lastRead > 200) { lastRead = t; readSelected() }
      revision.value++
      dirty.value = true
      scheduleAutosave()
    }
    if (idle.value) { activity.clear(); if (session) log.value = markRaw(session.document().log); readSelected(); revision.value++ }
    return steps
  }

  function loop(t: number) {
    raf = 0
    if (!running.value || !visible || finishing.value) { lastWall = 0; return }
    const dt = lastWall ? Math.min(0.25, (t - lastWall) / 1000) : 0
    lastWall = t
    frame(dt)
    if (running.value && !idle.value) raf = requestAnimationFrame(loop)
    else lastWall = 0
  }
  function startLoop() { if (!raf && typeof requestAnimationFrame !== 'undefined' && running.value && visible && !idle.value) raf = requestAnimationFrame(loop) }
  function stopLoop() { if (raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf); raf = 0; lastWall = 0 }

  function start() { if (!session) return; running.value = true; idle.value = false; quiet = 0; owed = 0; startLoop() }
  function pause() { running.value = false; finishing.value = false; stopLoop(); activity.clear(); if (session) sync() }
  function toggle() { if (running.value) pause(); else start() }
  function setSpeed(s: Speed) { speed.value = s }
  /** The page is shown or hidden (another panel, a hidden browser tab): a hidden bench does not tick. */
  function setVisible(on: boolean) { visible = on; if (on) startLoop(); else { stopLoop(); flushAutosave() } }

  /**
   * "到反应结束": step until the bench is quiet, in slices that leave the interface alive, at most END_CAP seconds of
   * bench time. Resolves with the bench time that passed, and whether the bench came to rest.
   */
  async function runToEnd(sliceMs = 12): Promise<{ seconds: number; settled: boolean }> {
    if (!session || finishing.value) return { seconds: 0, settled: false }
    stopLoop()
    finishing.value = true
    const wasRunning = running.value
    let passed = 0, still = 0
    let settled = false
    try {
      while (finishing.value && passed < END_CAP) {
        const t0 = now()
        let last: BenchState | null = null
        const all: BenchEvent[] = []
        while (now() - t0 < sliceMs && passed < END_CAP) {
          const out = session.advance(STEP)
          passed += STEP
          last = out.state
          all.push(...out.events)
          still = out.events.length === 0 && atRest(out.state) ? still + 1 : 0
          if (still >= QUIET_STEPS) { settled = true; break }
        }
        if (last) { record(all, true); state.value = markRaw(last); series.sample(last.time, last.log, last.vessels); revision.value++ }
        if (settled) break
        await new Promise<void>(r => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)))
      }
    } catch (e) { fail(e, tl('时间停止')) }
    const cancelled = !finishing.value
    finishing.value = false
    activity.clear()
    sync()
    if (passed > 0) touched()
    if (settled) idle.value = running.value
    else if (!cancelled && passed >= END_CAP) notify(tl('{0} 内没有结束', [`${END_CAP / 60} min`]))
    if (wasRunning) startLoop()
    return { seconds: passed, settled }
  }

  // ---- storage ----

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleAutosave() {
    if (!storage || saveTimer) return
    saveTimer = setTimeout(() => { saveTimer = null; writeAutosave() }, 900)
  }
  function writeAutosave() {
    if (!storage || !session) return
    try {
      const doc = portableDoc()
      if (!doc.log.length && !doc.objects.length) storage.removeItem(AUTOSAVE_KEY)
      else storage.setItem(AUTOSAVE_KEY, JSON.stringify({ name: fileName.value, doc }))
    } catch { /* storage full or unavailable: the bench goes on without */ }
  }
  function flushAutosave() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; writeAutosave() } }
  function clearAutosave() { try { storage?.removeItem(AUTOSAVE_KEY) } catch { /* nothing kept */ } }
  /** The working bench of the last visit, or null. */
  function readAutosave(): { name: string | null; doc: BenchDoc } | null {
    try {
      const raw = storage?.getItem(AUTOSAVE_KEY)
      if (!raw) return null
      const saved = JSON.parse(raw) as { name?: string | null; doc?: unknown }
      return { name: saved.name ?? null, doc: parseBenchDoc(JSON.stringify(saved.doc)) }
    } catch { return null }
  }

  // ---- files and links ----

  const filters = () => [{ name: tl('VeloPhi 实验台'), extensions: ['json'] }]

  /** Save the bench as a file; returns its name, or null when cancelled. */
  async function saveToFile(): Promise<string | null> {
    if (!session) return null
    const suggested = fileName.value ?? `bench.${BENCH_EXT}`
    const saved = await saveFile(JSON.stringify(portableDoc(), null, 1), suggested, filters())
    if (saved) { fileName.value = saved.split(/[\\/]/).pop() ?? saved; dirty.value = false; scheduleAutosave() }
    return saved
  }

  /** Open a bench file text; false (with a message) when it is none or does not replay. */
  function openText(text: string, name: string | null): boolean {
    try { open(parseBenchDoc(text), name) } catch (e) { fail(e, tl('无法打开实验台')); return false }
    scheduleAutosave()
    return true
  }

  /** Let the user pick a bench file and open it. */
  async function openFromFile(): Promise<boolean> {
    const f = await openTextFile(filters())
    return f ? openText(f.text, f.name) : false
  }

  /** The bench as an address: the document travels in the link, nothing is uploaded (the mechanism of scene links). */
  async function shareLink(): Promise<string> {
    const { encodeShare, shareBase } = await import('../app/share')
    return `${shareBase()}${BENCH_SHARE_PREFIX}${await encodeShare(JSON.stringify(portableDoc()))}`
  }

  /** Open a bench link (or its data part); false when the text is none or cannot be read. */
  async function openShared(input: string): Promise<boolean> {
    const at = input.indexOf(BENCH_SHARE_PREFIX)
    if (at < 0) return false
    const { decodeShare } = await import('../app/share')
    let text: string
    try { const s = await decodeShare(input.slice(at + BENCH_SHARE_PREFIX.length).split('&')[0]); if (!s) throw new Error('empty'); text = s.text } catch { notify(tl('这个实验台链接不完整或已损坏'), true); return false }
    return openText(text, null)
  }

  /**
   * Start the bench once the chemistry data are in the core: the working bench of the last visit when it replays,
   * else an empty one. `load` hands the data to the core (the page passes `loadCatalogue`).
   */
  async function init(load: () => Promise<unknown>): Promise<void> {
    if (ready.value) return
    failure.value = ''
    try {
      await load()
      const saved = readAutosave()
      if (saved) { try { open(saved.doc, saved.name); dirty.value = true } catch { open(emptyBench()) } }
      else open(emptyBench())
      ready.value = true
    } catch (e) {
      failure.value = e instanceof MessageError ? msgText(e.msg) : (e as Error)?.message ?? String(e)
      throw e
    }
  }

  return {
    // state
    ready, failure, state, objects, log, selected, reading, revision, running, speed, idle, finishing, dirty, fileName, phenomena, diagnostics, activity,
    vessels, circuits, canUndo, canRedo, empty, time,
    // reading
    objectOf, vesselOf, extras, circuitOf, read, select, vesselName, notesNow, limitOf,
    /** The effects going on in a vessel now (D297 item 2), and whether any is. */
    effectsOf: (v: VesselState): EffectState[] => effects.of(v, now() / 1000),
    effectsBusy: () => effects.busy(now() / 1000),
    series,
    hash: () => session?.hash() ?? '',
    // document
    init, open, reset, dispose, portableDoc, readAutosave, flushAutosave, saveToFile, openFromFile, openText, shareLink, openShared, setNotify: (f: BenchOptions['notify']) => { notify = f ?? (() => {}) },
    markSaved: (name: string | null) => { fileName.value = name; dirty.value = false },
    // actions
    apply, undo, redo, setExtras, place, removeVessel, add, pour, filter, emptyVessel, setCollector, connect, disconnect, attach, detach, useTool,
    // the rig (26.65, D297 items 3–5)
    fixtures, selectedFixture, fixtureOf, moveVessel, spotFor, moveFixture, addFixture, setFixture, tapFixture, removeFixture, selectFixture, partsOf, rigOf, rigUnder, rigFits, rigVessels, gesture, placeBottle, addTube, moveTubeEnd, tubed, tubeFrom,
    addElectrode, setCircuit, removeCircuit, freeSpot,
    // clock
    frame, start, pause, toggle, setSpeed, setVisible, runToEnd
  }
}

export type BenchStore = ReturnType<typeof createBench>

let shared: BenchStore | null = null
/** The bench of the 化学实验 page (one per application). */
export function useBench(): BenchStore { return (shared ??= createBench()) }
