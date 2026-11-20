/**
 * Template first (26.64, D284): before a scene is built freely, the problem is matched against the templates and the
 * five closest go to the model with their parameter tables — a problem that is one of them with other numbers is
 * answered with "template + parameters" and never becomes a sketch.
 *
 * The match is the catalogue search of the Copilot (copilot/tools.ts `searchCatalog`: shared two-character pieces of
 * the folded texts) over the catalogue of import/catalog.ts, with one change: that search scores by the share of the
 * QUERY's pieces found in an entry, which is right for a few search words and drops below its threshold for a whole
 * problem text. Here the score is the share of the ENTRY's pieces found in the problem — the entry being the template's
 * name, group and description together with the stems of the built-in problems that use it (they read like problems).
 */
import { TEMPLATES } from '../../templates'
import { BUILTIN_PROBLEMS } from '../../teaching/problemBank'
import { structureText, templateStructure } from '../import/catalog'

export interface TemplateCandidate {
  id: string; name: string; description: string; structure: string; score: number
  params: Array<{ key: string; label: string; unit: string; value: number; min?: number; max?: number }>
}

const fold = (s: string) => s.toLowerCase().replace(/\{[a-z0-9]+\}/gi, '').replace(/[\s\d.,;:，。；：、（）()=‐‑‒–—−+\-*/°²³]+/g, '')
function grams(s: string): Set<string> { const g = new Set<string>(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g }

let index: Array<{ id: string; head: Set<string>; stems: Array<Set<string>> }> | null = null
function build() {
  index = TEMPLATES.map(t => ({
    id: t.id,
    head: grams(fold(`${t.name}${t.group}${t.description}`)),
    stems: BUILTIN_PROBLEMS.filter(p => p.template === t.id).flatMap(p => [p.stem.zh, p.stem.en, p.stem.de]).map(x => grams(fold(x)))
  }))
}

/** The `n` templates closest to a problem text, best first (ties in catalogue order). */
export function rankTemplates(problem: string, n = 5): TemplateCandidate[] {
  if (!index) build()
  const q = grams(fold(problem))
  if (!q.size) return []
  const share = (g: Set<string>) => { if (!g.size) return 0; let k = 0; for (const x of g) if (q.has(x)) k++; return k / g.size }
  const scored = index!.map((e, order) => ({ id: e.id, order, score: Math.max(share(e.head), ...e.stems.map(share)) }))
  scored.sort((a, b) => b.score - a.score || a.order - b.order)
  return scored.slice(0, n).filter(x => x.score > 0).map(x => {
    const t = TEMPLATES.find(y => y.id === x.id)!
    const st = templateStructure(t.id)
    return { id: t.id, name: t.name, description: t.description, structure: st ? structureText(st) : '', score: x.score, params: t.params.map(p => ({ key: p.key, label: p.label, unit: p.unit, value: p.value, min: p.min, max: p.max })) }
  })
}
