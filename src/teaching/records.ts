/**
 * Learning records (26.56, D103): what a learner has visited, practised and shown evidence of, kept apart. Opening a
 * page only records a visit; practice is a finished activity attempt; mastery evidence follows the visible rule of
 * activities/grade.ts (`isMastery`). The records stay on this device (localStorage key `velophi.learning.v1`), can
 * be exported as JSON and cleared by the learner. The 26.55 setting `ui.learnDone` meant "opened" and migrates to
 * visits only — it never creates practice or mastery.
 */
import type { Dimension } from './activities/types'

export const RECORDS_KEY = 'velophi.learning.v1'
export const RECORDS_REV = 1

export interface ItemRecord {
  /** The answer at the first check: the evidence. */
  answer: unknown
  verdicts: Partial<Record<Dimension, 'correct' | 'wrong'>>
  expected: unknown
  hints: number
  /** Corrected and checked again after the feedback (practice: recorded, never counted). */
  revised?: { answer: unknown; verdicts: Partial<Record<Dimension, 'correct' | 'wrong'>> }
}

export interface AttemptRecord {
  id: string
  activity: string
  started: string
  finished: string | null
  constantsSet: string
  inputs: Record<string, number>
  transferInputs: Record<string, number>
  diagnostic: Record<string, ItemRecord>
  prediction: { choice: string | null; reason: string | null; text: string; correct: boolean | null; reasonCorrect: boolean | null } | null
  experiment: { vary: string; values: number[]; controlled: boolean } | null
  revision: { text: string; changed: boolean } | null
  items: Record<string, ItemRecord>
  transfer: Record<string, ItemRecord>
  dims: Record<Dimension, { correct: number; total: number }>
  mastery: boolean
}

export interface LearningRecords {
  rev: number
  /** Step key → time of the last visit (null: migrated from 26.55 without a time). */
  visited: Record<string, string | null>
  attempts: AttemptRecord[]
  /** Where old progress came from (`ui.learnDone`), once. */
  migratedFrom?: string
}

export interface KeyStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export function emptyRecords(): LearningRecords { return { rev: RECORDS_REV, visited: {}, attempts: [] } }

/** Read the records; the first time, the 26.55 list of opened steps becomes visits. */
export function loadRecords(store: KeyStore | null, legacyOpened: string[] = []): LearningRecords {
  let rec = emptyRecords()
  try {
    const raw = store?.getItem(RECORDS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<LearningRecords>
      rec = {
        rev: RECORDS_REV,
        visited: p.visited && typeof p.visited === 'object' ? Object.fromEntries(Object.entries(p.visited).filter(([k, v]) => typeof k === 'string' && (v === null || typeof v === 'string'))) : {},
        attempts: Array.isArray(p.attempts) ? p.attempts.filter(a => a && typeof a.activity === 'string') : [],
        ...(p.migratedFrom ? { migratedFrom: p.migratedFrom } : {})
      }
    }
  } catch { /* unreadable records start empty */ }
  if (!rec.migratedFrom && legacyOpened.length) {
    for (const k of legacyOpened) if (typeof k === 'string' && !(k in rec.visited)) rec.visited[k] = null
    rec.migratedFrom = 'ui.learnDone (26.55: opened steps; migrated as visits only)'
  }
  return rec
}

export function saveRecords(store: KeyStore | null, rec: LearningRecords) {
  try { store?.setItem(RECORDS_KEY, JSON.stringify(rec)) } catch { /* storage full or blocked */ }
}

export function markVisited(rec: LearningRecords, key: string, at: string = new Date().toISOString()) { rec.visited[key] = at }

export function unmarkVisited(rec: LearningRecords, key: string) { delete rec.visited[key] }

export function addAttempt(rec: LearningRecords, a: AttemptRecord) {
  rec.attempts = [...rec.attempts.filter(x => x.id !== a.id), a].slice(-500)
}

/** Progress of one activity. */
export function activityProgress(rec: LearningRecords, activity: string): { practised: boolean; mastery: boolean; attempts: number; last: AttemptRecord | null } {
  const list = rec.attempts.filter(a => a.activity === activity && a.finished)
  return { practised: list.length > 0, mastery: list.some(a => a.mastery), attempts: list.length, last: list.at(-1) ?? null }
}

/** Progress of a step: visited from the visits; practised and mastery from the activities linked to it. */
export function stepProgress(rec: LearningRecords, key: string, activities: string[]): { visited: boolean; practised: boolean; mastery: boolean } {
  const per = activities.map(a => activityProgress(rec, a))
  return { visited: key in rec.visited, practised: per.some(p => p.practised), mastery: per.length > 0 && per.some(p => p.mastery) }
}

/** The records as a JSON document for the learner (export). */
export function exportRecords(rec: LearningRecords, meta: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: 'velophi-learning-records', version: RECORDS_REV, exported: new Date().toISOString(), ...meta, rule: MASTERY_RULE.en, records: rec }, null, 1)
}

export function clearRecords(store: KeyStore | null): LearningRecords {
  try { store?.removeItem(RECORDS_KEY) } catch { /* ignore */ }
  // a cleared store must not migrate the old list again
  return { ...emptyRecords(), migratedFrom: 'cleared' }
}

/** The mastery rule in words (shown in the learning path and with every result). */
export const MASTERY_RULE = {
  zh: '掌握证据：一次完整作答中，核心题与迁移题在概念、单位、方向、建模、计算、解释各评分维度全部正确（以每题第一次核对为准）；提示次数照记，不扣分。打开页面只记为“已访问”，完成活动记为“已练习”。',
  en: 'Mastery evidence: in one complete attempt every graded dimension (concept, unit, direction, modelling, calculation, explanation) of the core and transfer questions is correct at its first check; hints are recorded, not deducted. Opening a page counts as a visit; finishing an activity counts as practice.',
  de: 'Nachweis der Beherrschung: In einem vollständigen Durchgang sind alle bewerteten Dimensionen (Konzept, Einheit, Richtung, Modellierung, Rechnung, Erklärung) der Kern- und Transferfragen bei der ersten Prüfung richtig; Hinweise werden gezählt, nicht abgezogen. Das Öffnen einer Seite zählt als Besuch, ein abgeschlossenes Lernangebot als Übung.'
}
