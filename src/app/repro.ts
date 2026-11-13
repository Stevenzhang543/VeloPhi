/**
 * Reproduction package (26.61, phase A): what an engineer needs to run a reported problem again — version, platform
 * class, backend, solver and settings, the run (fingerprint, time window, the moment and event side shown), the error
 * codes, and the last allowlisted log events. Built locally and shown before it is saved; nothing is sent.
 *
 * Allowlist, not a blocklist: only the fields named here leave the app. Never included: the scene's `extra` and
 * annotations, problem pictures and texts, chat text, file names and paths, keys, tokens and request headers. The
 * scene itself is included only when the user ticks it (geometry and parameters, names replaced by ids).
 */
import { state } from './store'
import { aiLog } from '../ai/client'
import { settings } from './settings'
import { trialLogEntries } from './trialLog'
import { serializeScene } from '../core/scene/io'
import { ENGINE_VERSION } from '../core/scene/types'
import { msgText } from '../i18n/locale'
import type { Message } from '../i18n/message'

export const REPRO_FORMAT = 'velophi-repro'

/** Log detail fields that may leave the app (numbers, booleans and short codes). */
const LOG_FIELDS = new Set(['ms', 'completed', 'frames', 'reduced', 'ok', 'tool', 'tries', 'refused', 'n', 'route', 'chars', 'actions', 'id', 'kind', 'code'])
/** Log kinds that may leave the app. */
const LOG_KINDS = /^(sim\.|copilot\.(tool|undo|build|answer|recognize)|lesson\.|app\.|recover)/

/** A short, stable hash of a text (FNV-1a 32 bit, hex) — identifies an input without carrying it. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

/** The platform as a class (no full user agent: it can identify a person's device). */
export function platformClass(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  const os = /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) ? 'windows' : /Mac OS X|Macintosh/i.test(ua) ? 'macos' : /Linux/i.test(ua) ? 'linux' : /iPhone|iPad/i.test(ua) ? 'ios' : 'other'
  const web = /Edg\//.test(ua) ? 'edge' : /Chrome\/(\d+)/.exec(ua) ? `chromium-${/Chrome\/(\d+)/.exec(ua)![1]}` : /Firefox\/(\d+)/.exec(ua) ? `firefox-${/Firefox\/(\d+)/.exec(ua)![1]}` : /Safari/.test(ua) ? 'webkit' : 'unknown'
  return `${os}/${web}`
}

/** The scene for the package: geometry and parameters only (no extra, notes, annotations; names → ids). */
export function sanitizedScene(): unknown {
  const doc = JSON.parse(serializeScene(state.scene)) as Record<string, unknown>
  delete doc.extra
  delete doc.annotations
  delete doc.description
  doc.name = 'scene'
  for (const k of ['bodies', 'connectors', 'pulleys']) {
    const list = doc[k]
    if (Array.isArray(list)) for (const o of list as Array<Record<string, unknown>>) if (o && typeof o === 'object') o.name = o.id
  }
  if (Array.isArray(doc.branches)) doc.branches = (doc.branches as unknown[]).length
  return doc
}

const errText = (e: Message | string | null) => (e === null ? null : typeof e === 'string' ? e.slice(0, 200) : `${e.key}: ${msgText(e).slice(0, 200)}`)

/** Build the package; `withScene`: include the sanitized scene. */
export function reproPackage(opts: { withScene?: boolean; steps?: string; expected?: string; actual?: string } = {}) {
  const rec = state.recording
  const sceneText = serializeScene(state.scene)
  const shownEvent = rec ? rec.events.filter(e => e.t <= state.time + 1e-12).at(-1) ?? null : null
  const logs = trialLogEntries().filter(e => LOG_KINDS.test(e.kind)).slice(-60).map(e => ({
    t: e.t, kind: e.kind,
    detail: e.detail ? Object.fromEntries(Object.entries(e.detail).filter(([k, v]) => LOG_FIELDS.has(k) && (typeof v !== 'string' || v.length <= 40))) : undefined
  }))
  return {
    format: REPRO_FORMAT, version: 1, engine: ENGINE_VERSION, at: new Date().toISOString(),
    platform: platformClass(), language: settings.language,
    backend: { engine: state.run.engine, reason: state.run.engineReason, worker: settings.sim.worker, memoryMB: settings.sim.memoryMB, lookAhead: settings.sim.lookAheadSeconds },
    scene: { hash: shortHash(sceneText), bodies: state.scene.bodies.length, connectors: state.scene.connectors.length, integrator: state.scene.settings.integrator ?? 'auto', duration: state.scene.settings.duration ?? null, stale: state.stale, file: opts.withScene ? sanitizedScene() : undefined },
    run: rec ? {
      id: state.runId, computing: state.computing, completed: rec.completed, stopReason: rec.stopReason ?? null, frames: rec.frameCount, dt: rec.dt, tComputed: state.run.tComputed,
      hash: rec.hash || null, fingerprint: state.run.fingerprint ?? null, reducedFrom: rec.reducedFrom ?? null, warnings: rec.warnings.map(w => (typeof w === 'string' ? w : w.key)).slice(0, 12), events: rec.events.length
    } : null,
    shown: { time: state.time, frame: state.frame, lastEvent: shownEvent ? { t: shownEvent.t, triggers: shownEvent.triggers } : null, page: state.page, rightTab: state.rightTab },
    error: errText(state.simError),
    report: { steps: (opts.steps ?? '').slice(0, 2000), expected: (opts.expected ?? '').slice(0, 500), actual: (opts.actual ?? '').slice(0, 500) },
    // 26.63 (D238): the last AI requests by id — when, what for, how they ended; never their content
    ai: aiLog.entries.slice(0, 8).map(e => ({ at: e.at, id: e.id ?? null, attempt: e.attempt ?? 1, purpose: e.purpose, status: e.status.slice(0, 40), ms: e.ms })),
    log: logs
  }
}
