/**
 * Requests to the chemistry bench from outside its page (26.64, D243: everything in a second layer is also a command
 * of the global search). The search lives in the start-up bundle and the bench does not, so a command is a small
 * note left here — the page reads it when it is shown (it mounts on its first visit) and acts on it.
 */
import { reactive } from 'vue'

export type ChemCommand = { type: 'new' } | { type: 'shelf' } | { type: 'guide' } | { type: 'apparatus'; group: string }

export const chemCommand = reactive<{ n: number; last: ChemCommand | null }>({ n: 0, last: null })

/** Ask the bench to do something (the caller also shows the page). */
export function askBench(c: ChemCommand) { chemCommand.last = c; chemCommand.n++ }

/** The groups of the apparatus shelf with their names (kept here so the search needs no chemistry module). */
export const APPARATUS_COMMANDS: Array<{ group: string; zh: string; en: string; de: string }> = [
  { group: 'container', zh: '容器', en: 'Containers', de: 'Gefäße' },
  { group: 'transfer', zh: '转移与分离', en: 'Transfer', de: 'Umfüllen' },
  { group: 'heating', zh: '加热与冷却', en: 'Heating', de: 'Heizen' },
  { group: 'measuring', zh: '测量', en: 'Measuring', de: 'Messen' },
  { group: 'electro', zh: '电化学', en: 'Electrochemistry', de: 'Elektrochemie' },
  { group: 'test', zh: '检验', en: 'Tests', de: 'Nachweise' }
]
