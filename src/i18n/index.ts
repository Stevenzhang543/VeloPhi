/**
 * Interface languages (manual 26.50, D27): 简体中文 (source), English, Deutsch.
 *
 * Texts are written in Chinese in the source and translated through tables keyed by the Chinese text
 * (`tables.ts`, `texts/*.ts`; gettext style): `tl('仿真时长')` returns the text in the current language, `tl('共 {0} 帧',
 * [n])` fills positional or named `{…}` parameters after translation. A test (tests/i18n.test.ts) extracts every
 * Chinese literal of the source and requires an English and a German entry for it, and no unused entries.
 * Language-neutral core messages (warnings and errors) are rendered by `msgText` (coreText.ts); long teaching
 * content (derivations, event explanations) is written inline in three languages (`Tri`, `pick`).
 *
 * Physics symbols, LaTeX and unit symbols are not translated. The language is an application setting, never part
 * of a scene file; switching it re-renders the interface without recomputing anything.
 */
import { locale } from './locale'
import type { Lang } from './tri'
import { buildTables } from './tables'

export { locale, pick, msgText } from './locale'
export type { Lang, Tri } from './tri'

const TABLES: Record<Exclude<Lang, 'zh'>, Record<string, string>> = buildTables()

/** Translations missing at run time (diagnostics; the tests keep this empty). */
export const missing = new Set<string>()

/** Fill `{0}`, `{1}` … (array) or `{name}` (object) placeholders. */
function fill(text: string, params?: ReadonlyArray<unknown> | Record<string, unknown>): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = Array.isArray(params) ? params[Number(k)] : (params as Record<string, unknown>)[k]
    return v === undefined ? m : String(v)
  })
}

/** The text in the current language (the Chinese source text when no translation exists). */
export function tl(zh: string, params?: ReadonlyArray<unknown> | Record<string, unknown>): string {
  return tIn(locale.lang, zh, params)
}

/** The text in a given language (exports with their own language). */
export function tIn(lang: Lang, zh: string, params?: ReadonlyArray<unknown> | Record<string, unknown>): string {
  if (lang === 'zh') return fill(zh, params)
  const tr = TABLES[lang][zh]
  if (tr === undefined) { missing.add(zh); return fill(zh, params) }
  return fill(tr, params)
}

/** Translation tables (tests). */
export function tables(): Record<Exclude<Lang, 'zh'>, Record<string, string>> { return TABLES }

/** Language of the system (browser or WebView), mapped to a supported one; Chinese for anything else Chinese. */
export function systemLang(): Lang {
  const list = typeof navigator !== 'undefined' ? [...(navigator.languages ?? []), navigator.language] : []
  for (const l of list) {
    const code = (l ?? '').toLowerCase()
    if (code.startsWith('zh')) return 'zh'
    if (code.startsWith('de')) return 'de'
    if (code.startsWith('en')) return 'en'
  }
  return 'zh'
}

/** Apply a language preference ('auto' follows the system). */
export function setLanguage(pref: 'auto' | Lang) {
  const lang = pref === 'auto' ? systemLang() : pref
  locale.lang = lang
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang
}

/** BCP 47 tag of the current language (dates, sorting). */
export function localeTag(): string {
  return locale.lang === 'zh' ? 'zh-CN' : locale.lang === 'de' ? 'de-DE' : 'en-GB'
}

const deepCache = new WeakMap<object, object>()
const CJK = /[一-鿿]/

/**
 * A view of module-level data (tables of labels, the formula library, template metadata) whose Chinese strings are
 * translated when read, at any depth. The tables stay plain data in the source; nested views are cached, so object
 * identity is stable. Not for data that is posted to a worker or cloned (proxies cannot be cloned).
 */
export function trDeep<T extends object>(data: T): T {
  const cached = deepCache.get(data)
  if (cached) return cached as T
  const view = new Proxy(data, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver)
      if (typeof v === 'string') return CJK.test(v) ? tl(v) : v
      if (v && typeof v === 'object') return trDeep(v as object)
      return v
    }
  })
  deepCache.set(data, view)
  return view
}

/** List separator of the current language ('、' in Chinese, ', ' otherwise). */
export function listSep(): string { return locale.lang === 'zh' ? '、' : ', ' }
/** Clause separator ('；' / '; '). */
export function semiSep(): string { return locale.lang === 'zh' ? '；' : '; ' }
/** Comma ('，' / ', '). */
export function commaSep(): string { return locale.lang === 'zh' ? '，' : ', ' }
/** A parenthetical remark: '（x）' in Chinese, ' (x)' otherwise. */
export function paren(x: string): string { return locale.lang === 'zh' ? `（${x}）` : ` (${x})` }
/** Colon ('：' / ': '). */
export function colonSep(): string { return locale.lang === 'zh' ? '：' : ': ' }
/** Remove a leading "label: " (either colon) from a text, e.g. a notice whose label is shown as a badge. */
export function stripLabel(text: string): string { return text.replace(/^[^:：]{1,40}[:：]\s*/, '') }
