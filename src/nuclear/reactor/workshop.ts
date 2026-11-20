/**
 * The reactor workshop's state and actions (26.64, D277): the layout being built (a reactor document of the core), its
 * multiplication factor and flux maps (`reactorCriticality`), the running reactor (`reactorAdvance`: point kinetics
 * with thermal feedback, xenon and samarium, protection), the recorded series, the reactivity budget
 * (`reactorBalance`) and the guided tasks (`reactorTaskCheck`). This module decides nothing physical: it edits the
 * document, hands it to the core and keeps what comes back. No DOM; the page and the tests use the same object.
 *
 * A teaching model (D278) — see engine/CHEM.md, "Reactor operations", and the notice on the page.
 */
import { markRaw, reactive } from 'vue'
import type { CoreDiagnostic, Criticality, ReactorBalance, ReactorControls, ReactorDoc, ReactorMaterialInfo, ReactorMaterials, ReactorPresetId, ReactorRun, ReactorState, ReactorTask, TaskResult } from '../../engine/nuclear'
import { reactorAdvance, reactorBalance, reactorCriticality, reactorMaterials, reactorPresets, reactorTaskCheck } from '../../engine/nuclear'
import { nuclearErrorText } from '../diagText'
import type { TaskDef } from './tasks'
import { TASKS } from './tasks'

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
export const cellKey = (x: number, y: number): string => `${x},${y}`

/** Series recorded from `reactorAdvance`, one value per sample. */
export const HISTORY_KEYS = ['n', 'rho', 'rhoStatic', 'rhoFeedback', 'period', 'fuelT', 'fuelPeakT', 'coolantT', 'moderatorT', 'xenon', 'samarium', 'iodine', 'decayHeat', 'thermal_W', 'electric_W', 'rods', 'flow'] as const
export type HistoryKey = typeof HISTORY_KEYS[number]
export type History = { t: number[] } & Record<HistoryKey, number[]>
export const HISTORY_LIMIT = 2400

/** The record is plain data (not reactive: thousands of numbers); `historyVersion` counts its changes. */
function emptyHistory(): History {
  const h = { t: [] } as unknown as History
  for (const k of HISTORY_KEYS) h[k] = []
  return markRaw(h)
}

export interface RunEvent { t: number; kind: 'trip' | 'coreDamage' | 'validity'; reason?: string; value: number; limit: number }

export interface WorkshopState {
  ready: boolean
  busy: boolean
  error: string
  /** Said once after an action (the layout changed under a running reactor …); the page shows and clears it. */
  notice: '' | 'runReset'
  presetId: ReactorPresetId | 'custom'
  doc: ReactorDoc | null
  materials: ReactorMaterialInfo[]
  library: Pick<ReactorMaterials, 'kinetics' | 'limits' | 'teaching' | 'sources'> | null
  crit: Criticality | null
  /** The running reactor; null while building. */
  run: ReactorState | null
  running: boolean
  /** Simulated seconds per second of the clock. */
  speed: number
  rodTarget: number
  rodSpeed: number
  /** The loop as the page shows it: the state's, with the controls already asked for. */
  loop: { pump: number; exchanger: boolean; turbine: boolean }
  history: History
  historyVersion: number
  events: RunEvent[]
  diagnostics: CoreDiagnostic[]
  /** Latest values of the run (the last sample of the last step). */
  last: Partial<Record<HistoryKey, number>>
  detectors: Array<{ cell: string; flux: number }>
  balance: ReactorBalance | null
  task: { id: ReactorTask | null; start: ReactorDoc | null; result: TaskResult | null }
}

export interface Workshop {
  s: WorkshopState
  init(preset?: ReactorPresetId): Promise<void>
  loadPreset(id: ReactorPresetId): Promise<void>
  solve(): Promise<void>
  paint(x: number, y: number, material: string): Promise<void>
  toggleRod(x: number, y: number, material: string): Promise<void>
  toggleDetector(x: number, y: number): Promise<void>
  setRodInsertion(key: string | null, insertion: number): Promise<void>
  setEnrichment(value: number, key?: string | null): Promise<void>
  setProtection(p: NonNullable<ReactorDoc['protection']>): void
  start(mode: 'cold' | 'power'): Promise<void>
  stop(): Promise<void>
  step(dt: number, samples?: number): Promise<ReactorRun | null>
  control(c: ReactorControls): void
  scram(): Promise<void>
  resetTrip(): Promise<void>
  refreshMaps(): Promise<void>
  computeBalance(): Promise<void>
  startTask(id: ReactorTask): Promise<void>
  leaveTask(): void
  checkTask(): Promise<TaskResult | null>
  presetIds(): ReactorPresetId[]
}

export function createWorkshop(): Workshop {
  const s = reactive<WorkshopState>({
    ready: false, busy: false, error: '', notice: '', presetId: 'research', doc: null, materials: [], library: null, crit: null,
    run: null, running: false, speed: 1, rodTarget: 1, rodSpeed: 0.002, loop: { pump: 1, exchanger: true, turbine: false }, history: emptyHistory(), historyVersion: 0, events: [], diagnostics: [], last: {}, detectors: [],
    balance: null, task: { id: null, start: null, result: null }
  }) as WorkshopState
  let presets: Array<{ id: ReactorPresetId; doc: ReactorDoc }> = []
  /** Controls to send with the next step. */
  let pending: ReactorControls = {}
  let solveToken = 0

  const fail = (e: unknown) => { s.error = nuclearErrorText(e) }
  async function guard<T>(f: () => Promise<T>): Promise<T | null> {
    try { const v = await f(); s.error = ''; return v } catch (e) { fail(e); return null }
  }

  function clearRun() {
    s.run = null; s.running = false; s.history = emptyHistory(); s.historyVersion++; s.events = []; s.diagnostics = []; s.last = {}; s.detectors = []; s.balance = null
    pending = {}
  }

  async function solve() {
    const doc = s.doc
    if (!doc) return
    const mine = ++solveToken
    const r = await guard(() => reactorCriticality(doc, s.run ? { state: s.run } : {}))
    if (mine !== solveToken) return
    s.crit = r ? markRaw(r) : null
    if (r && !s.run) s.diagnostics = r.diagnostics
  }

  /** The layout changed: a running reactor belongs to the old one. */
  async function edited() {
    if (s.run) { clearRun(); s.notice = 'runReset' }
    s.presetId = s.task.id ? s.presetId : 'custom'
    s.task.result = null
    s.balance = null
    await solve()
  }

  function setDoc(doc: ReactorDoc, id: ReactorPresetId | 'custom') {
    clearRun()
    s.doc = doc
    s.presetId = id
    s.loop = { pump: doc.loop?.pump ?? 1, exchanger: doc.loop?.exchanger ?? true, turbine: doc.loop?.turbine ?? false }
    const rods = Object.values(doc.rods ?? {})
    s.rodTarget = rods.length ? rods[0].insertion : 1
  }

  async function loadPreset(id: ReactorPresetId) {
    const p = presets.find(x => x.id === id)
    if (!p) return
    s.task = { id: null, start: null, result: null }
    setDoc(clone(p.doc), id)
    await solve()
  }

  function record(r: ReactorRun) {
    const h = s.history
    for (let i = 0; i < r.t.length; i++) {
      h.t.push(r.t[i])
      for (const k of HISTORY_KEYS) h[k].push(r.series[k][i])
    }
    if (h.t.length > HISTORY_LIMIT) {
      // thin the older half: every second sample goes
      const half = h.t.length >> 1
      const keep = (a: number[]) => a.filter((_, i) => i >= half || i % 2 === 0)
      h.t = keep(h.t)
      for (const k of HISTORY_KEYS) h[k] = keep(h[k])
    }
    s.historyVersion++
    if (r.t.length) { const i = r.t.length - 1; const last: Partial<Record<HistoryKey, number>> = {}; for (const k of HISTORY_KEYS) last[k] = r.series[k][i]; s.last = last }
    for (const e of r.events) s.events.push(e)
    s.detectors = r.detectors
    s.diagnostics = r.diagnostics
  }

  function adopt(r: ReactorRun) {
    s.run = r.state
    s.loop = { ...r.state.loop }
    if (r.state.ended) s.running = false
  }

  const api: Workshop = {
    s,
    presetIds: () => presets.map(p => p.id),
    async init(preset = 'research') {
      const ok = await guard(async () => {
        presets = await reactorPresets()
        const m = await reactorMaterials()
        s.materials = m.materials
        s.library = { kinetics: m.kinetics, limits: m.limits, teaching: m.teaching, sources: m.sources }
      })
      if (ok === null && s.error) return
      await loadPreset(preset)
      s.ready = true
    },
    loadPreset,
    solve,
    async paint(x, y, material) {
      const d = s.doc
      if (!d || x < 0 || y < 0 || x >= d.grid.nx || y >= d.grid.ny) return
      const i = y * d.grid.nx + x
      if (d.cells[i] === material) return
      d.cells[i] = material
      if (d.enrich && material !== 'fuel_leu') delete d.enrich[cellKey(x, y)]
      await edited()
    },
    async toggleRod(x, y, material) {
      const d = s.doc
      if (!d) return
      const key = cellKey(x, y)
      d.rods ??= {}
      if (d.rods[key] && d.rods[key].material === material) delete d.rods[key]
      else d.rods[key] = { material, insertion: d.rods[key]?.insertion ?? 1 }
      await edited()
    },
    async toggleDetector(x, y) {
      const d = s.doc
      if (!d) return
      const key = cellKey(x, y)
      const list = d.detectors ?? []
      d.detectors = list.includes(key) ? list.filter(k => k !== key) : [...list, key]
      await solve()
    },
    async setRodInsertion(key, insertion) {
      const d = s.doc
      if (!d?.rods) return
      const v = Math.min(1, Math.max(0, insertion))
      if (key === null) { for (const r of Object.values(d.rods)) r.insertion = v; s.rodTarget = v } else if (d.rods[key]) d.rods[key].insertion = v
      s.task.result = null
      s.balance = null
      await solve()
    },
    async setEnrichment(value, key = null) {
      const d = s.doc
      if (!d) return
      const fuel = s.materials.find(m => m.id === 'fuel_leu')?.fuel
      const v = Math.min(fuel?.max ?? 5, Math.max(fuel?.min ?? 0.72, value))
      if (key === null) d.enrichment = v
      else { d.enrich ??= {}; d.enrich[key] = v }
      await edited()
    },
    setProtection(p) { if (s.doc) s.doc.protection = { ...s.doc.protection, ...p } },
    async start(mode) {
      const doc = s.doc
      if (!doc) return
      s.busy = true
      const r = await guard(() => reactorAdvance(doc, { dt: 0, init: mode === 'power' ? { power: 1, search: true } : {} }))
      s.busy = false
      if (!r) return
      clearRun()
      adopt(r)
      s.diagnostics = r.diagnostics
      s.rodTarget = r.state.targets.length ? r.state.targets[0] : 1
      s.last = { n: r.state.n, fuelT: r.state.fuelT, coolantT: r.state.coolantT, moderatorT: r.state.moderatorT, xenon: r.state.xenon, samarium: r.state.samarium, iodine: r.state.iodine }
      await solve()
    },
    async stop() {
      clearRun()
      await solve()
    },
    control(c) {
      pending = { ...pending, ...c }
      if (c.pump !== undefined) s.loop.pump = c.pump
      if (c.exchanger !== undefined) s.loop.exchanger = c.exchanger
      if (c.turbine !== undefined) s.loop.turbine = c.turbine
    },
    async step(dt, samples = 4) {
      const doc = s.doc
      if (!doc || !s.run || s.run.ended) return null
      const controls: ReactorControls = { rodSpeed: s.rodSpeed, ...pending }
      pending = {}
      const state = s.run
      const r = await guard(() => reactorAdvance(doc, { state, dt, samples, controls, maxSolves: 6 }))
      if (!r) { s.running = false; return null }
      adopt(r)
      record(r)
      return r
    },
    async scram() { api.control({ scram: true }); await api.step(0.5, 1) },
    async resetTrip() { api.control({ resetTrip: true }); await api.step(0.01, 1); if (s.run) s.rodTarget = s.run.targets[0] ?? s.rodTarget },
    async refreshMaps() { await solve() },
    async computeBalance() {
      const doc = s.doc
      if (!doc) return
      const b = await guard(() => reactorBalance(doc, s.run ?? undefined))
      s.balance = b ? markRaw(b) : null
    },
    async startTask(id) {
      const def = TASKS.find(t => t.id === id) as TaskDef
      const p = presets.find(x => x.id === def.preset)
      if (!p) return
      const doc = clone(p.doc)
      def.prepare?.(doc)
      setDoc(doc, def.preset)
      s.task = { id, start: def.needsStart ? clone(doc) : null, result: null }
      if (def.setup === 'build') await solve()
      else await api.start(def.setup)
    },
    leaveTask() { s.task = { id: null, start: null, result: null } },
    async checkTask() {
      const doc = s.doc
      const id = s.task.id
      if (!doc || !id) return null
      const def = TASKS.find(t => t.id === id) as TaskDef
      const more: Record<string, unknown> = { ...def.params }
      if (s.run && def.setup !== 'build') more.state = s.run
      if (s.task.start) more.start = s.task.start
      if (id === 'power') {
        // the tail of the record that covers the hold time (three times over)
        const h = s.history
        const from = (h.t[h.t.length - 1] ?? 0) - 3 * (def.params.hold_s ?? 60)
        const first = Math.max(0, h.t.findIndex(t => t >= from))
        more.series = { t: h.t.slice(first), n: h.n.slice(first) }
      }
      const r = await guard(() => reactorTaskCheck(id, doc, more))
      s.task.result = r
      return r
    }
  }
  return api
}

let shared: Workshop | null = null
/** The workshop of the page: one for the session, so a layout and a run survive the page being mounted again. */
export function sharedWorkshop(): Workshop {
  shared ??= createWorkshop()
  return shared
}

/** Index of a rod of the document in the order of the state's `rods` (the order of the cells). */
export function rodOrder(doc: ReactorDoc): string[] {
  const nx = doc.grid.nx
  return Object.keys(doc.rods ?? {}).sort((a, b) => { const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number); return ay * nx + ax - (by * nx + bx) })
}
