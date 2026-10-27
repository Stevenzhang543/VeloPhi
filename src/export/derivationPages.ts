/**
 * Derivation pages of the exports (manual 26.50, D28): for the formula cards shown at the key moments (each
 * formula once) the detail view — derivation, step-by-step solution with the scene's values, conditions and the
 * comparison with the simulation — and for the key moments that are events the event detail, rendered as images
 * (formula/detail.ts, formula/eventDetail.ts, export/detailImage.ts). Courseware writes them as PNG files and
 * slides; the lab report embeds them.
 */
import type { Recording } from '../engine/recording'
import type { Situation } from '../formula/recognize'
import type { UnitChoice } from '../units/units'
import type { Lang } from '../i18n/tri'
import { buildFormulaDetail } from '../formula/detail'
import { buildEventDetail, eventDataOf } from '../formula/eventDetail'
import type { ImageBackground } from './still'
import { shownCards } from './formulaImage'
import type { LevelFilter } from './formulaImage'
import { cardsForMoment } from './moments'
import type { KeyMoment } from './moments'
import { detailImage } from './detailImage'

/** One rendered detail page. */
export interface DerivationPage {
  kind: 'formula' | 'event'
  title: string
  png: Uint8Array | null
  svg: string
  /** CSS size and pixel ratio of the PNG. */
  width: number
  height: number
  scale: number
}

/** Options of the pages. */
export interface DerivationPageOptions {
  digits: number
  units: UnitChoice
  lang: Lang
  theme: 'light' | 'dark'
  background: ImageBackground
  /** Footer line of every page (e.g. the scene name). */
  caption?: string
  /** Most formula pages (default 40). */
  maxFormulas?: number
  /** Knowledge-level filter (D44); null or absent: all formulas. */
  level?: LevelFilter
}

/** The formula cards of the key moments, each formula of each situation once, with the moment's time. */
export function derivationTargets(rec: Recording, sits: Situation[], moments: KeyMoment[], digits: number, units: UnitChoice, level: LevelFilter = null): Array<{ situation: Situation; formulaId: string; title: string; t: number }> {
  const seen = new Set<string>()
  const out: Array<{ situation: Situation; formulaId: string; title: string; t: number }> = []
  for (const m of moments) {
    for (const c of shownCards(cardsForMoment(rec, sits, m.t, digits, units), level)) {
      const key = `${c.situation.key}|${c.formula.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ situation: c.situation, formulaId: c.formula.id, title: c.formula.title, t: m.t })
    }
  }
  return out
}

/**
 * Render the pages. `check` is called between pages (throws to cancel); `step` reports progress (0–1).
 */
export async function derivationPages(rec: Recording, sits: Situation[], moments: KeyMoment[], o: DerivationPageOptions, check: () => void = () => {}, step: (p: number) => void = () => {}): Promise<DerivationPage[]> {
  const targets = derivationTargets(rec, sits, moments, o.digits, o.units, o.level ?? null).slice(0, o.maxFormulas ?? 40)
  const events = moments.filter(m => m.eventIndex !== undefined && rec.events[m.eventIndex]?.changes.length)
  const total = targets.length + events.length
  const pages: DerivationPage[] = []
  const img = { theme: o.theme, background: o.background, width: 760, scale: 2, caption: o.caption }
  let k = 0
  for (const t of targets) {
    check()
    step(k++ / Math.max(1, total))
    const view = buildFormulaDetail(rec, t.situation, t.formulaId, t.t, o.lang, { digits: o.digits, units: o.units })
    const r = await detailImage(view, img, { png: true })
    pages.push({ kind: 'formula', title: t.title, png: r.png, svg: r.svg, width: r.width, height: r.height, scale: r.scale })
  }
  for (const m of events) {
    check()
    step(k++ / Math.max(1, total))
    const view = buildEventDetail(eventDataOf(rec, m.eventIndex!), m.eventIndex!, o.lang, { digits: o.digits, units: o.units })
    const r = await detailImage(view, img, { png: true })
    pages.push({ kind: 'event', title: m.label, png: r.png, svg: r.svg, width: r.width, height: r.height, scale: r.scale })
  }
  step(1)
  return pages
}
