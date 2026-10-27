/**
 * Interface languages (manual 26.50, D27): every Chinese text of the source has an English and a German entry,
 * every hand-written entry is used, placeholders match, translations contain no Chinese, and the core messages
 * render in all three languages.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-expect-error — plain ES module of the build scripts
import { extractKeys } from '../scripts/i18n-keys.mjs'
import { TEXT_PARTS, buildTables } from '../src/i18n/tables'
import { coreKeys, renderMessage } from '../src/i18n/coreText'
import { msg } from '../src/i18n/message'
import { locale } from '../src/i18n/locale'
import { tl, trDeep } from '../src/i18n'

const { keys, problems } = extractKeys() as { keys: Map<string, { files: Set<string> }>; problems: string[] }
const tables = buildTables()
const CJK = /[一-鿿]/
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')
/** Entries whose translation is the same text in every language (language names). */
const SAME = new Set(['简体中文'])

describe('interface texts', () => {
  it('has no untranslatable source text (unwrapped template text, static Chinese attributes)', () => {
    expect(problems).toEqual([])
  })

  it('translates every Chinese text into English and German', () => {
    const missing: string[] = []
    for (const k of keys.keys()) for (const lang of ['en', 'de'] as const) if (!(k in tables[lang])) missing.push(`${lang}: ${k} (${[...keys.get(k)!.files].join(', ')})`)
    expect(missing).toEqual([])
    expect(keys.size).toBeGreaterThan(1500)
  })

  it('uses every hand-written entry and defines each once', () => {
    const seen = new Map<string, string>()
    const unused: string[] = []
    for (const [part, table] of Object.entries(TEXT_PARTS)) {
      for (const zh of Object.keys(table)) {
        if (seen.has(zh)) unused.push(`duplicate in ${part} and ${seen.get(zh)}: ${zh}`)
        seen.set(zh, part)
        if (!keys.has(zh)) unused.push(`${part}: ${zh}`)
      }
    }
    expect(unused).toEqual([])
  })

  it('keeps the placeholders and writes no Chinese in the translations', () => {
    const bad: string[] = []
    for (const lang of ['en', 'de'] as const) {
      for (const [zh, tr] of Object.entries(tables[lang])) {
        if (placeholders(zh) !== placeholders(tr)) bad.push(`${lang} placeholders: ${zh} → ${tr}`)
        if (CJK.test(tr) && !SAME.has(zh)) bad.push(`${lang} Chinese: ${zh} → ${tr}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('switches language at run time, including module-level tables', () => {
    const table = trDeep({ a: '保存', list: [{ label: '撤销' }] })
    try {
      locale.lang = 'en'
      expect(tl('保存')).toBe('Save')
      expect(table.a).toBe('Save')
      expect(table.list[0].label).toBe('Undo')
      expect(tl('{0} 帧/秒', [60])).toBe('60 fps')
      locale.lang = 'de'
      expect(tl('保存')).toBe('Speichern')
      expect(table.list[0].label).toBe('Rückgängig')
      locale.lang = 'zh'
      expect(table.a).toBe('保存')
    } finally {
      locale.lang = 'zh'
    }
  })
})

describe('core messages', () => {
  it('render in three languages', () => {
    for (const key of coreKeys()) {
      const m = msg(key, { t: 1.5, count: 3, window: 0.05, mm: 2, pairs: ['a|b'], violation: 1e-9, body: 'b', force: 'F', fx: 1, fy: 2, limit: 100, seconds: 60, message: 'x', detail: 'y', reason: msg('reason.moreauSelected') })
      const texts = (['zh', 'en', 'de'] as const).map(l => renderMessage(m, l))
      for (const s of texts) expect(s.length, key).toBeGreaterThan(1)
      expect(CJK.test(texts[1]) || CJK.test(texts[2]), key).toBe(false)
    }
  })

  it('render every key of engine/MESSAGES.md (scene errors included) without falling back to the key', () => {
    const doc = readFileSync('engine/MESSAGES.md', 'utf8')
    const all = [...doc.matchAll(/^\| `([a-zA-Z]+\.[a-zA-Z]+)` \|/gm)].map(m => m[1])
    expect(all.length).toBeGreaterThan(70)
    const params = { connector: 'F', component: 'x', body: 'b', pulley: 'p', id: 'b1', path: 'bodies', version: 9, max: 1e5, detail: 'y', option: 'o', reason: msg('expr.argumentNotDimensionless', { function: 'sin', dim: 's' }), t: 1, count: 2, window: 0.05, mm: 1, pairs: ['a|b'], violation: 1e-9, force: 'F', fx: 1, fy: 2, limit: 1, seconds: 1, message: 'x', name: 'n', pos: 1, src: 's', ch: 'c', arity: 1, dim: 'm', a: 'm', b: 's', what: '+' }
    const bad: string[] = []
    for (const key of all) {
      for (const lang of ['zh', 'en', 'de'] as const) {
        const s = renderMessage(msg(key, params), lang)
        if (s.startsWith(key) || (lang !== 'zh' && CJK.test(s))) bad.push(`${lang} ${key}: ${s}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('cover every run message key of the engines', () => {
    const runKeys = ['warn.initialOverlapRemoved', 'warn.initialDeepOverlap', 'warn.reducedAccuracy', 'reason.moreauSelected', 'reason.eventsAtInstant', 'reason.eventStorm', 'warn.ambiguousMode', 'warn.multiImpactFriction', 'warn.multiImpactPlastic', 'warn.polygonCentred', 'warn.muSBelowMuK', 'err.forceNotFinite', 'err.stepTooSmall', 'err.switchChatter', 'err.eventChatter', 'err.stepLimit', 'err.chunkStepLimit', 'err.budget', 'err.cancelled', 'err.internal']
    expect(runKeys.filter(k => !coreKeys().includes(k))).toEqual([])
  })
})
