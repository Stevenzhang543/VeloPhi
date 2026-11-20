/**
 * Requests to the 物理实验 page from outside it (26.64, D243: everything in a second layer is also a command of the
 * global search). The page mounts on its first visit; a command is a note left here that the page reads when it is
 * shown — the same arrangement as the chemistry bench (components/chem/commands.ts).
 */
import { reactive } from 'vue'
import type { InjectionKey } from 'vue'

export type LabCommand = 'catalogue' | 'about' | 'export' | 'import' | 'reset'

export const labCommand = reactive<{ n: number; last: LabCommand | null }>({ n: 0, last: null })

/** Ask the lab page to do something (the caller also shows the page). */
export function askLab(c: LabCommand) { labCommand.last = c; labCommand.n++ }

/** The tabs of the lab inspector (D244): 读数 · 器材 · 显示. */
export type LabTab = 'readings' | 'gear' | 'display'
/**
 * The lab page provides its inspector to the experiment shown: an experiment may show a tab when the user's own
 * action calls for it (the circuit shows 器材 when an element is selected).
 */
export const LAB_INSPECTOR: InjectionKey<{ show: (t: LabTab) => void }> = Symbol('velophi.labInspector')
