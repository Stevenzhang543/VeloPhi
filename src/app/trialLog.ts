/**
 * Trial log (decision D16): an opt-in, local-only record of what a trial participant did (which dialogs were
 * used, which exports ran, how long a sweep took …) so that the trial sessions can be analysed afterwards.
 *
 *   - Off by default (`settings.trialLog`); nothing is recorded while it is off.
 *   - Stored only in this browser profile / desktop app (localStorage ring buffer of at most 5000 entries).
 *   - Never uploaded: the participant exports the JSON file by hand (`exportTrialLog`) and gives it to us.
 *   - No personal information: event kinds and detail keys are short ASCII identifiers; detail values are
 *     numbers, booleans or ASCII identifiers (template ids, quantity ids, option names). Free text — scene
 *     names, file names or paths, typed notes, anything with spaces, slashes or non-ASCII characters — is
 *     dropped before it is stored.
 */
import { tl } from '../i18n'
import { settings } from './settings'
import { saveFile } from '../platform/files'
import { ENGINE_VERSION } from '../core/scene/types'

/** A detail value: number, boolean or identifier. */
export type TrialValue = string | number | boolean

/** One log entry. */
export interface TrialEntry {
  /** Milliseconds since 1970 (local clock). */
  t: number
  /** Event kind, e.g. 'sim.run'. */
  kind: string
  detail?: Record<string, TrialValue>
}

/** Storage key of the log in localStorage. */
export const TRIAL_LOG_KEY = 'verity.trialLog.v1'
/** Most entries kept; the oldest are dropped first. */
export const TRIAL_LOG_CAP = 5000

const KIND_RE = /^[a-z][a-z0-9_.-]{0,47}$/i
const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/i
const VALUE_RE = /^[A-Za-z0-9_.:|+-]{0,64}$/
/** Keys that could carry personal or free-form content, whatever their value looks like. */
const BLOCKED_KEYS = /name|path|file|dir|user|mail|title|text|note|comment|desc|label|url|host/i

let buffer: TrialEntry[] | null = null
let session: string | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let unloadHooked = false

function store(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

function isEntry(e: unknown): e is TrialEntry {
  return !!e && typeof e === 'object' && typeof (e as TrialEntry).t === 'number' && typeof (e as TrialEntry).kind === 'string'
}

function load(): TrialEntry[] {
  if (buffer) return buffer
  let list: TrialEntry[] = []
  try {
    const raw = store()?.getItem(TRIAL_LOG_KEY)
    if (raw) { const parsed = JSON.parse(raw) as unknown; if (Array.isArray(parsed)) list = parsed.filter(isEntry) }
    } catch { /* A damaged log starts over */ }
  buffer = list.slice(-TRIAL_LOG_CAP)
  return buffer
}

/** Keep only identifier-like keys and values (see the file header). */
export function sanitizeDetail(detail: Record<string, unknown> | undefined): Record<string, TrialValue> | undefined {
  if (!detail) return undefined
  const out: Record<string, TrialValue> = {}
  let n = 0
  for (const [k, v] of Object.entries(detail)) {
    if (n >= 16 || !KEY_RE.test(k) || BLOCKED_KEYS.test(k)) continue
    if (typeof v === 'number') { if (Number.isFinite(v)) { out[k] = Number(v.toPrecision(8)); n++ } }
    else if (typeof v === 'boolean') { out[k] = v; n++ }
    else if (typeof v === 'string' && VALUE_RE.test(v)) { out[k] = v; n++ }
  }
  return n ? out : undefined
}

/** Write the buffer to storage now. */
export function flushTrialLog() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  if (!buffer) return
    try { store()?.setItem(TRIAL_LOG_KEY, JSON.stringify(buffer)) } catch { /* Storage full or unavailable: keep in memory */ }
}

function scheduleFlush() {
  if (!unloadHooked && typeof window !== 'undefined') {
    unloadHooked = true
    window.addEventListener('pagehide', flushTrialLog)
  }
  if (!flushTimer) flushTimer = setTimeout(flushTrialLog, 1000)
}

/** Record one action (no-op unless the trial log is switched on). */
export function logEvent(kind: string, detail?: Record<string, unknown>): void {
  if (!settings.trialLog || !KIND_RE.test(kind)) return
  const list = load()
  const now = Date.now()
  if (!session) {
    // Random id that only groups the entries of one app session; it identifies nobody
    session = Math.random().toString(36).slice(2, 10)
    list.push({ t: now, kind: 'session.start', detail: { session, engine: ENGINE_VERSION } })
  }
  const d = sanitizeDetail(detail)
  list.push(d ? { t: now, kind, detail: d } : { t: now, kind })
  if (list.length > TRIAL_LOG_CAP) list.splice(0, list.length - TRIAL_LOG_CAP)
  scheduleFlush()
}

/** A copy of the stored entries (oldest first). */
export function trialLogEntries(): TrialEntry[] {
  return load().map(e => ({ ...e, detail: e.detail ? { ...e.detail } : undefined }))
}

/** Number of stored entries. */
export function trialLogSize(): number { return load().length }

/** Delete every stored entry. */
export function clearTrialLog() {
  buffer = []
  session = null
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
    try { store()?.removeItem(TRIAL_LOG_KEY) } catch { /* Ignore */ }
}

/** The export document. */
export function trialLogJson(): string {
  flushTrialLog()
  return JSON.stringify({
    format: 'verity-trial-log', version: 1, engine: ENGINE_VERSION, exportedAt: new Date().toISOString(),
    note: tl('本地操作日志：不含姓名、文件名或场景内容，仅在本机保存，由试用者手动导出。'),
    entries: load()
  }, null, 1) + '\n'
}

/** Save the log as JSON through the platform file dialog / download. Returns the saved name or null. */
export async function exportTrialLog(): Promise<string | null> {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  return saveFile(trialLogJson(), `verity-trial-log-${stamp}.json`, [{ name: 'JSON', extensions: ['json'] }])
}
