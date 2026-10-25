/**
 * Trilingual text written inline (manual 26.50, D27/D28). Used for long teaching content (derivations,
 * event explanations) that lives next to its data instead of in the message tables. Plain data, no
 * dependencies, so the formula layer can use it without Vue.
 */

/** UI and content languages. */
export type Lang = 'zh' | 'en' | 'de'

/** All supported languages, in menu order. */
export const LANGS: readonly Lang[] = ['zh', 'en', 'de']

/** One text in all three languages. */
export interface Tri { zh: string; en: string; de: string }

/** The text of `t` in `lang`. */
export function triText(t: Tri, lang: Lang): string {
  return t[lang]
}

/** Replace `{name}` placeholders in a text by the given values (missing names stay as written). */
export function fillParams(text: string, params: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m))
}
