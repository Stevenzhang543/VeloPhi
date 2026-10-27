/**
 * Exports in their own language and the decimal comma (26.51, carry-over of 26.50): an export made in German uses
 * German texts and (with "comma in the German interface") decimal commas, the interface keeps its own language and
 * number format afterwards, and input fields accept both separators.
 */
import { describe, expect, it } from 'vitest'
import { locale, tl, listSep } from '../src/i18n'
import { formatSig, latexNumber, numberStyle } from '../src/units/units'
import { decimalFor, settings } from '../src/app/settings'
import { exportLanguage, exportSituations, inExportLanguage } from '../src/app/exportLang'
import { buildTemplate } from '../src/templates'
import { simulate } from '../src/engine/recording'
import { recognize } from '../src/formula/recognize'
import { keyMoments, relabelMoments } from '../src/export/moments'

describe('export language', () => {
  it('makes the export in its language and restores the interface', async () => {
    locale.lang = 'zh'
    settings.decimalSeparator = 'auto'
    settings.export.language = 'de'
    expect(exportLanguage()).toBe('de')
    const inside = await inExportLanguage(async () => [tl('导出语言'), listSep(), formatSig(1.5, 3), latexNumber(2.25, 3)])
    expect(inside).toEqual(['Exportsprache', ', ', '1,5', '2{,}25'])
    expect(tl('导出语言')).toBe('导出语言')
    expect(formatSig(1.5, 3)).toBe('1.5')
    settings.export.language = 'ui'
    expect(exportLanguage()).toBe('zh')
  })

  it('restores after a failing export', async () => {
    settings.export.language = 'en'
    await expect(inExportLanguage(async () => { throw new Error('x') })).rejects.toThrow('x')
    expect(tl('导出语言')).toBe('导出语言')
    settings.export.language = 'ui'
  })
})

describe('labels made before the export (26.51 hand check)', () => {
  it('key moments and situation titles are written again in the export language', async () => {
    locale.lang = 'zh'
    const rec = simulate(buildTemplate('atwood', {}))
    const sits = recognize(rec)
    const ms = keyMoments(rec, { events: true, segments: true, ends: true, user: [0.3] })
    expect(ms[0].label).toBe('初始时刻')
    settings.export.language = 'en'
    const [labels, titles, same] = await inExportLanguage(async () => [
      relabelMoments(rec, ms).map(m => m.label), exportSituations(rec, sits).map(s => s.title), relabelMoments(rec, ms).map(m => m.t)
    ] as const)
    expect(labels[0]).toBe('Start')
    expect(labels.some(l => l === 'Chosen time' || /[a-z]/i.test(l))).toBe(true)
    for (const l of labels) expect(/[\u4e00-\u9fff]/.test(l), l).toBe(false)
    expect(same).toEqual(ms.map(m => m.t))
    for (const t of titles) expect(/[\u4e00-\u9fff]/.test(t.replace(/物块\d|定滑轮|轻绳/g, '')), t).toBe(false)
    // The interface keeps its own labels
    expect(ms[0].label).toBe('初始时刻')
    settings.export.language = 'ui'
    expect(exportSituations(rec, sits)).toBe(sits)
  })
})

describe('decimal separator', () => {
  it('point, comma in German, or always comma', () => {
    settings.decimalSeparator = 'point'
    expect(decimalFor('de')).toBe('.')
    settings.decimalSeparator = 'auto'
    expect(decimalFor('de')).toBe(',')
    expect(decimalFor('en')).toBe('.')
    settings.decimalSeparator = 'comma'
    expect(decimalFor('zh')).toBe(',')
    numberStyle.decimal = ','
    expect(formatSig(-0.0123, 3)).toBe('-0,0123')
    expect(formatSig(1234567, 3)).toBe('1,23e+6')
    numberStyle.decimal = '.'
    settings.decimalSeparator = 'point'
  })
})
