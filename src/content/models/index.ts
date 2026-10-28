/**
 * The model registry (26.56, D98, D106): all model families in id order, the JSON handed to the Rust core, and
 * lookups. See types.ts for the record and docs/coverage/ for the coverage matrix generated from it.
 */
import type { ModelLinks, ModelSpec } from './types'
import { MODELS_G } from './g'
import { MODELS_M1 } from './m1'
import { MODELS_M2 } from './m2'
import { MODELS_E } from './e'
import { MODELS_B } from './b'
import { MODELS_T } from './t'
import { MODELS_Q } from './q'
import { MODELS_N } from './n'
import { MODELS_F } from './f'
import { MODELS_W } from './w'
import { MODELS_O } from './o'
import { MODELS_R } from './r'
import { MODELS_X } from './x'
import { LAB_MODELS, PROBLEM_MODELS, TEMPLATE_MODELS } from './links'

/** Every model family, in the order of the blueprint (doc 02: G M F W T E B O Q N R X). */
export const MODELS: ModelSpec[] = [...MODELS_G, ...MODELS_M1, ...MODELS_M2, ...MODELS_F, ...MODELS_W, ...MODELS_T, ...MODELS_E, ...MODELS_B, ...MODELS_O, ...MODELS_Q, ...MODELS_N, ...MODELS_R, ...MODELS_X]

const BY_ID = new Map(MODELS.map(m => [m.id, m]))

/** A model by id. */
export function modelById(id: string): ModelSpec | undefined { return BY_ID.get(id) }

/** The calculation fields of the registry for the core (`setModels`). */
export function registryJson(models: ModelSpec[] = MODELS) {
  return models.map(m => ({
    id: m.id,
    inputs: m.inputs.map(i => ({ id: i.id, unit: i.unit, ...(i.min !== undefined ? { min: i.min } : {}), ...(i.max !== undefined ? { max: i.max } : {}), ...(i.open ? { open: true } : {}) })),
    lets: (m.lets ?? []).map(l => ({ id: l.id, expr: l.expr, unit: l.unit })),
    conditions: (m.conditions ?? []).map(c => ({ id: c.id, expr: c.expr, ...(c.approx ? { approx: c.approx } : {}) })),
    outputs: m.outputs.map(o => ({
      id: o.id, unit: o.unit,
      ...(o.expr ? { expr: o.expr } : {}),
      ...(o.requires ? { requires: o.requires } : {}),
      ...(o.when ? { when: o.when } : {}),
      ...(o.branch ? { branch: o.branch.en } : {}),
      ...(o.solve ? { solve: o.solve } : {})
    }))
  }))
}

const union = (a: string[] | undefined, b: string[]) => [...new Set([...(a ?? []), ...b])]
const inverse = (table: Array<[string, string[]]>, id: string) => table.filter(([, ms]) => ms.includes(id)).map(([x]) => x)

/** Links of a model: its own plus the templates, labs and problems that the content table maps to it (links.ts). */
export function linksOf(m: ModelSpec): ModelLinks {
  return {
    ...m.links,
    templates: union(m.links.templates, inverse(TEMPLATE_MODELS, m.id)),
    labs: union(m.links.labs, inverse(LAB_MODELS, m.id)),
    problems: union(m.links.problems, inverse(PROBLEM_MODELS, m.id))
  }
}

/** Example inputs of a model (SI). */
export function exampleInputs(m: ModelSpec): Record<string, number> {
  return Object.fromEntries(m.inputs.map(i => [i.id, i.value]))
}
