/**
 * Structured content of a formula or event detail view (manual 26.50, D28). The builders (formula/detail.ts,
 * formula/eventDetail.ts) produce it in one language; the detail panel renders it, and exports (images,
 * courseware, reports) can render the same data. Plain data: texts are final strings, formulas are KaTeX sources.
 */

/** Colour role of a badge, a table cell or a note. */
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral'

/** A table cell: text and/or KaTeX (shown after the text), optionally monospaced or coloured. */
export interface DetailCell {
  text?: string
  tex?: string
  mono?: boolean
  tone?: Tone
}

/** One step of a derivation or explanation: the equation, what it does, and the law it relies on. */
export interface DetailStep {
  tex: string
  text: string
  basis?: string
}

/** A block of a section. */
export type DetailBlock =
  /** A paragraph; `small` for secondary remarks. */
  | { kind: 'text'; text: string; tone?: Tone; small?: boolean }
  /** A heading inside a section (e.g. the title of a shared step list). */
  | { kind: 'subhead'; text: string }
  /** One display equation with an optional lead-in text and basis. */
  | { kind: 'equation'; tex: string; text?: string; basis?: string }
  /** Numbered steps. */
  | { kind: 'steps'; steps: DetailStep[] }
  /** A chain of equalities lhs = rhs₀ = rhs₁ = … (rendered aligned). */
  | { kind: 'chain'; lhs: string; rhs: string[] }
  /** A table; `head` is optional. */
  | { kind: 'table'; head?: string[]; rows: DetailCell[][]; align?: Array<'left' | 'right' | 'center'> }
  /** Applicability conditions with their status. */
  | { kind: 'conditions'; items: DetailCondition[] }

/** One condition: status, label, why (situation detail), and its role (required / grades the approximation). */
export interface DetailCondition {
  status: 'ok' | 'approx' | 'fail'
  label: string
  detail: string
  role: string
}

/** A titled section; `id` is stable across languages (derivation, solution, conditions, compare, trigger, …). */
export interface DetailSection {
  id: string
  title: string
  blocks: DetailBlock[]
}

/** A complete detail view. */
export interface DetailView {
  kind: 'formula' | 'event'
  title: string
  /** Situation and time (formula), or bodies and time (event). */
  subtitle: string
  /** The main formula or equation (KaTeX), shown under the title. */
  headline: string | null
  badges: Array<{ text: string; tone: Tone }>
  sections: DetailSection[]
}

/** The equation blocks of a view as LaTeX source (copy to clipboard), with the section titles as comments. */
export function detailLatex(view: DetailView): string {
  const out: string[] = [`% ${view.title} — ${view.subtitle}`]
  if (view.headline) out.push(view.headline)
  for (const s of view.sections) {
    const parts: string[] = []
    for (const b of s.blocks) {
      if (b.kind === 'equation') parts.push(b.tex)
      else if (b.kind === 'steps') for (const st of b.steps) parts.push(st.tex)
      else if (b.kind === 'chain') parts.push(chainLatex(b.lhs, b.rhs))
    }
    if (parts.length) out.push('', `% ${s.title}`, ...parts)
  }
  return out.join('\n')
}

/** A chain of equalities as one aligned block. */
export function chainLatex(lhs: string, rhs: string[]): string {
  if (!rhs.length) return lhs
  return `\\begin{aligned} ${lhs} &= ${rhs.join(' \\\\ &= ')} \\end{aligned}`
}

/**
 * Texts may contain inline formulas between dollar signs ("the normal impulse $J_n$ …"). Split a text into plain and
 * formula parts (an unmatched dollar sign stays plain text).
 */
export function splitMath(text: string): Array<{ math: boolean; s: string }> {
  const out: Array<{ math: boolean; s: string }> = []
  const re = /\$([^$]+)\$/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ math: false, s: text.slice(last, m.index) })
    out.push({ math: true, s: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ math: false, s: text.slice(last) })
  return out
}
