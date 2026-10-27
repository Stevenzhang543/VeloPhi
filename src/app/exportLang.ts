/**
 * Exports in their own language (26.51, carry-over of 26.50): reports, courseware, videos and CSV headers are made
 * in the language chosen under Settings › Export (or in the export dialog), independently of the interface. While
 * an export is made, texts and number formats follow that language; the interface keeps its own.
 */
import type { Lang } from '../i18n'
import { exportOverride, locale } from '../i18n'
import { numberStyle } from '../units/units'
import { decimalFor, settings } from './settings'
import type { Recording } from '../engine/recording'
import type { Situation } from '../formula/recognize'
import { recognize } from '../formula/recognize'

/** The language of exports now (the interface language for 'ui'). */
export function exportLanguage(): Lang {
  const l = settings.export.language
  return l === 'ui' ? locale.lang : l
}

/** Run an export in the export language (texts, list separators and decimal separator). */
export async function inExportLanguage<T>(fn: () => Promise<T>): Promise<T> {
  const lang = exportLanguage()
  if (lang === locale.lang) return fn()
  const prev = exportOverride.lang, prevDecimal = numberStyle.decimal
  exportOverride.lang = lang
  numberStyle.decimal = decimalFor(lang)
  try {
    return await fn()
  } finally {
    exportOverride.lang = prev
    numberStyle.decimal = prevDecimal
  }
}

/**
 * Situations for an export (26.51 hand check): their titles are written when they are recognised, so for an export
 * language other than the interface's they are recognised again. Call inside `inExportLanguage`.
 */
export function exportSituations(rec: Recording, current: Situation[]): Situation[] {
  return exportLanguage() === locale.lang ? current : recognize(rec)
}

