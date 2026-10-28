/**
 * Teaching activities (26.56, D102): the registry and lookups. See types.ts for the record, defs.ts for the content
 * and grade.ts for expected answers (from the Rust core) and grading.
 */
import { ACTIVITY_DEFS } from './defs'
import type { ActivitySpec } from './types'

export type { ActivitySpec, Question, Dimension } from './types'
export { DIMENSIONS } from './types'

export const ACTIVITIES: ActivitySpec[] = ACTIVITY_DEFS

const BY_ID = new Map(ACTIVITIES.map(a => [a.id, a]))
export function activityById(id: string): ActivitySpec | undefined { return BY_ID.get(id) }

/** Activities that exercise a model family. */
export function activitiesOfModel(model: string): ActivitySpec[] { return ACTIVITIES.filter(a => a.models.includes(model)) }

/** Activities that a template or lab opens (for the learning path). */
export function activitiesOfTarget(kind: 'template' | 'lab', id: string, preset?: string): ActivitySpec[] {
  return ACTIVITIES.filter(a => (kind === 'template' ? a.open?.template === id : a.open?.lab === id && (!preset || !a.open.preset || a.open.preset === preset)))
}
