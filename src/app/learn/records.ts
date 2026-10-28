/**
 * The learner's records in the interface (26.56, D103): a reactive copy of teaching/records.ts, saved on change in
 * this browser only. Visits come from opening steps; practice and mastery evidence come from finished activities.
 * On first use the 26.55 list `ui.learnDone` (steps that were opened) becomes visits — never practice or mastery.
 */
import { reactive, watch } from 'vue'
import { settings } from '../settings'
import { emptyRecords, loadRecords, saveRecords, markVisited, unmarkVisited, addAttempt, activityProgress, stepProgress, exportRecords, clearRecords } from '../../teaching/records'
import type { AttemptRecord, KeyStore, LearningRecords } from '../../teaching/records'

const store: KeyStore | null = typeof localStorage !== 'undefined' ? localStorage : null

/** The records (empty until `initRecords`, which runs after the settings are loaded). */
export const records = reactive<LearningRecords>(emptyRecords())
let ready = false

/** Read the stored records (main.ts calls it right after loadSettings; any use before that reads them too). */
export function initRecords() {
  if (ready) return
  Object.assign(records, loadRecords(store, settings.ui.learnDone))
  ready = true
  // keep the one-time migration of the 26.55 list
  if (records.migratedFrom) saveRecords(store, records)
}

let timer: ReturnType<typeof setTimeout> | null = null
watch(records, () => {
  if (!ready) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => saveRecords(store, records), 200)
}, { deep: true })

export function visit(key: string) { initRecords(); markVisited(records, key) }
export function unvisit(key: string) { initRecords(); unmarkVisited(records, key) }
export function isVisited(key: string): boolean { initRecords(); return key in records.visited }
export function recordAttempt(a: AttemptRecord) { initRecords(); addAttempt(records, a) }
export function progressOfActivity(id: string) { initRecords(); return activityProgress(records, id) }
export function progressOfStep(key: string, activities: string[]) { initRecords(); return stepProgress(records, key, activities) }
export function exportJson(): string { initRecords(); return exportRecords(records, { app: 'VeloPhi' }) }

/** Clear everything (the learner asked for it). */
export function clearAll() {
  initRecords()
  const c = clearRecords(store)
  records.visited = c.visited
  records.attempts = c.attempts
  records.migratedFrom = c.migratedFrom
  // the 26.55 list is not read again; keep it empty so an older version shows no progress either
  settings.ui.learnDone = []
}
