/**
 * Running models from the interface (26.56, D104, D105): the evaluation with its failure state (a message instead of
 * a number), the run manifest (core, physics version of the backend, constant set, data sets, SHA-256 of the
 * inputs) and the export document. Nothing here computes physics; the core does.
 */
import { evalModel, invertModel, manifest } from '../../engine/models'
import type { Manifest, ModelResult, SolveResult } from '../../engine/models'
import { msgText } from '../../i18n'
import { MessageError } from '../../i18n/message'

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string }

function failure(e: unknown): { ok: false; error: string } {
  if (e instanceof MessageError) return { ok: false, error: msgText(e.msg) }
  return { ok: false, error: String((e as Error)?.message ?? e) }
}

export function tryEval(model: string, inputs: Record<string, number | null>, constantsSet: string): Outcome<ModelResult> {
  try { return { ok: true, value: evalModel(model, inputs, { constantsSet }) } } catch (e) { return failure(e) }
}

export function trySolve(model: string, inputs: Record<string, number | null>, unknown: string, target: string, value: number, lo: number, hi: number, constantsSet: string, log: boolean): Outcome<SolveResult> {
  try { return { ok: true, value: invertModel(model, inputs, unknown, target, value, lo, hi, { constantsSet, log }) } } catch (e) { return failure(e) }
}

/** The run manifest of a calculation (ENG13): the inputs are hashed in their canonical JSON form. */
export function runManifest(backend: string, payload: unknown, constantsSet: string): Manifest | null {
  try { return manifest(backend, canonical(payload), constantsSet) } catch { return null }
}

/** JSON with sorted keys (stable for hashing). */
export function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`
  if (x && typeof x === 'object') return `{${Object.keys(x as object).sort().map(k => `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(x ?? null)
}

/** An export document: what was asked, what came back and how to reproduce it. */
export function exportDocument(kind: string, payload: Record<string, unknown>, result: unknown, backend: string, constantsSet: string): string {
  return JSON.stringify({ format: `velophi-${kind}`, version: 1, created: new Date().toISOString(), manifest: runManifest(backend, payload, constantsSet), request: payload, result }, null, 1)
}
