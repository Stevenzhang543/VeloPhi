/**
 * Formula and event detail panel state (manual 26.50, D28).
 *
 * Placeholder interface: the detail-panel work package implements the panel; other components only call
 * `openFormulaDetail` / `openEventDetail`.
 */
import { reactive } from 'vue'

/** What the detail panel shows. */
export type DetailTarget =
  | { kind: 'formula'; formulaId: string; situationId: string | null; time: number }
  | { kind: 'event'; eventIndex: number }

export const detail = reactive<{ target: DetailTarget | null }>({ target: null })

/** Open the detail view of a formula card (formula id, recognized situation id, simulated time of the card). */
export function openFormulaDetail(formulaId: string, situationId: string | null, time: number) {
  detail.target = { kind: 'formula', formulaId, situationId, time }
}

/** Open the detail view of a recorded event (index into `Recording.events`). */
export function openEventDetail(eventIndex: number) {
  detail.target = { kind: 'event', eventIndex }
}

export function closeDetail() {
  detail.target = null
}
