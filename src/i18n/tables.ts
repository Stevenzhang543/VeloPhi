/**
 * Translation tables of the interface (manual 26.50, D27), keyed by the Chinese source text: the hand-written
 * parts in `texts/` (one entry `'中文': ['English', 'Deutsch']`), plus the formula card texts taken from the
 * derivations (each derivation carries its formula's title, note, method and causes in three languages).
 */
import type { Lang } from './tri'
import { allDerivations } from '../formula/derivations'
import { TEXTS_APP } from './texts/app'
import { TEXTS_SETTINGS } from './texts/settings'
import { TEXTS_DIALOGS } from './texts/dialogs'
import { TEXTS_PHYSICS } from './texts/physics'
import { TEXTS_FORMULA } from './texts/formula'
import { TEXTS_TEMPLATES } from './texts/templates'
import { TEXTS_2652 } from './texts/v2652'
import { TEXTS_2653 } from './texts/v2653'
import { TEXTS_2654 } from './texts/v2654'
import { TEXTS_2655 } from './texts/v2655'
import { TEXTS_2656 } from './texts/v2656'
import { TEXTS_2657 } from './texts/v2657'
import { TEXTS_2658 } from './texts/v2658'
import { TEXTS_2659 } from './texts/v2659'
import { TEXTS_2660 } from './texts/v2660'
import { TEXTS_2661 } from './texts/v2661'
import { TEXTS_2662 } from './texts/v2662'
import { TEXTS_2663 } from './texts/v2663'
import { TEXTS_2664 } from './texts/v2664'
import { TEXTS_2664_LAB } from './texts/v2664lab'
import { TEXTS_2664_LABSHELL } from './texts/v2664labshell'
import { TEXTS_2664_ONBOARD } from './texts/v2664onboard'
import { TEXTS_2664_WALK } from './texts/v2664walk'
import { TEXTS_2665 } from './texts/v2665'
import { TEXTS_2664_CHEM } from './texts/v2664chem'
import { TEXTS_2664_ENCY } from './texts/v2664ency'
import { TEXTS_2664_ENCY2 } from './texts/v2664ency2'
import { TEXTS_2664_REACTOR } from './texts/v2664reactor'
import { TEXTS_2664_NUC } from './texts/v2664nuc'
import { TEXTS_2664_AI } from './texts/v2664ai'
import { TEXTS_2664_EXP } from './texts/v2664exp'
import { TEXTS_2665_CHEM } from './texts/v2665chem'
import { TEXTS_2665_LINUX } from './texts/v2665linux'
import { TEXTS_2665_PHYS } from './texts/v2665phys'
import { TEXTS_2665_CANVAS } from './texts/v2665canvas'

/** The hand-written parts (tests check them for unused and duplicate entries). */
export const TEXT_PARTS: Record<string, Record<string, readonly [string, string]>> = {
  app: TEXTS_APP, settings: TEXTS_SETTINGS, dialogs: TEXTS_DIALOGS, physics: TEXTS_PHYSICS, formula: TEXTS_FORMULA, templates: TEXTS_TEMPLATES, v2652: TEXTS_2652, v2653: TEXTS_2653, v2654: TEXTS_2654, v2655: TEXTS_2655, v2656: TEXTS_2656, v2657: TEXTS_2657, v2658: TEXTS_2658, v2659: TEXTS_2659, v2660: TEXTS_2660, v2661: TEXTS_2661, v2662: TEXTS_2662, v2663: TEXTS_2663, v2664: TEXTS_2664, v2664lab: TEXTS_2664_LAB, v2664labshell: TEXTS_2664_LABSHELL, v2664onboard: TEXTS_2664_ONBOARD, v2664walk: TEXTS_2664_WALK, v2664chem: TEXTS_2664_CHEM, v2664ency: TEXTS_2664_ENCY, v2664ency2: TEXTS_2664_ENCY2, v2664reactor: TEXTS_2664_REACTOR, v2664nuc: TEXTS_2664_NUC, v2664ai: TEXTS_2664_AI, v2664exp: TEXTS_2664_EXP, v2665: TEXTS_2665, v2665chem: TEXTS_2665_CHEM, v2665linux: TEXTS_2665_LINUX, v2665phys: TEXTS_2665_PHYS, v2665canvas: TEXTS_2665_CANVAS
}

/** English and German tables. */
export function buildTables(): Record<Exclude<Lang, 'zh'>, Record<string, string>> {
  const en: Record<string, string> = {}, de: Record<string, string> = {}
  for (const d of allDerivations()) {
    const put = (t: { zh: string; en: string; de: string } | undefined) => { if (t) { en[t.zh] = t.en; de[t.zh] = t.de } }
    put(d.title); put(d.note); put(d.method)
    for (const c of d.causes ?? []) put(c)
  }
  for (const part of Object.values(TEXT_PARTS)) {
    for (const [zh, [e, g]] of Object.entries(part)) { en[zh] = e; de[zh] = g }
  }
  return { en, de }
}
