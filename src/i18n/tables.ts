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

/** The hand-written parts (tests check them for unused and duplicate entries). */
export const TEXT_PARTS: Record<string, Record<string, readonly [string, string]>> = {
  app: TEXTS_APP, settings: TEXTS_SETTINGS, dialogs: TEXTS_DIALOGS, physics: TEXTS_PHYSICS, formula: TEXTS_FORMULA, templates: TEXTS_TEMPLATES, v2652: TEXTS_2652, v2653: TEXTS_2653, v2654: TEXTS_2654, v2655: TEXTS_2655, v2656: TEXTS_2656
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
