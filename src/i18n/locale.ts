/**
 * Current UI language (manual 26.50, D27). Placeholder until the i18n work package adds the message tables
 * and `t()`; components that show inline trilingual content already read the language from here.
 */
import { reactive } from 'vue'
import type { Lang, Tri } from './tri'
import { fillParams, triText } from './tri'
import type { Message } from './message'
import { renderMessage } from './coreText'

export const locale = reactive<{ lang: Lang }>({ lang: 'zh' })

/** Inline trilingual text in the current language, with optional `{name}` parameters. */
export function pick(t: Tri, params?: Record<string, string | number>): string {
  return fillParams(triText(t, locale.lang), params)
}

/** Text of a core message (or a plain string, shown as is) in the current language; '' for null. */
export function msgText(m: Message | string | null | undefined): string {
  if (m === null || m === undefined) return ''
  return typeof m === 'string' ? m : renderMessage(m, locale.lang)
}
