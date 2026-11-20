#!/usr/bin/env node
/**
 * Contrast of the design system's colours (26.64, D253; docs/design/DESIGN_SYSTEM.md §2.6).
 *
 * The design file registers every pair "text token on ground token" the interface uses, between the markers
 * `<!-- contrast:start -->` and `<!-- contrast:end -->`:
 *
 *   | `--text-2` | `--fill/--pane` | body | where it is used |
 *
 * `A/B` is the translucent colour A composited over B. The threshold is `body` (at least 4.5 : 1, WCAG 2.x AA for
 * text) or `large` (at least 3 : 1: large text, icons and indicators). A row marked `tier` is computed for each of the
 * three materials (clear, tinted, solid). The values are read from src/app/tokens.css, never copied: this script
 * resolves `var()` and computes every pair in four modes — light, dark, projection light, projection dark (the
 * "more contrast" mode shares the values of projection).
 *
 *   node scripts/contrast-check.mjs            check; exit 1 when a pair is under its threshold
 *   node scripts/contrast-check.mjs --table    also print every ratio
 *   node scripts/contrast-check.mjs --json     the ratios as JSON (for the design file or a report)
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readTokens } from './token-lint.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DESIGN = join(repo, 'docs', 'design', 'DESIGN_SYSTEM.md')

/** The modes and the layers of tokens.css each one stacks (later layers override earlier ones). */
export const MODES = {
  light: ['light'],
  dark: ['light', 'dark'],
  'projection light': ['light', 'projector', 'strong'],
  'projection dark': ['light', 'dark', 'projector', 'strong', 'strong-dark']
}
const TIERS = { tinted: [], clear: ['clear'], solid: ['solid'] }

/** Token values of a mode (and a material tier): name → raw CSS value. */
export function valuesOf(tokens, mode, tier = 'tinted') {
  const dark = MODES[mode].includes('dark')
  const layers = [...MODES[mode], ...TIERS[tier], ...(tier === 'clear' && dark ? ['clear-dark'] : [])]
  const out = new Map()
  for (const [name, v] of tokens) for (const l of layers) if (v[l] !== undefined) out.set(name, v[l])
  return out
}

/** Parse a CSS colour to [r, g, b, a] (0–255, 0–1); null when the value is not a colour this script reads. */
export function parseColour(text) {
  const s = text.trim().toLowerCase()
  if (s === 'transparent') return [0, 0, 0, 0]
  let m = /^#([0-9a-f]{3,8})$/.exec(s)
  if (m) {
    const h = m[1]
    if (h.length === 3 || h.length === 4) return [...h].slice(0, 3).map(c => parseInt(c + c, 16)).concat(h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1)
    if (h.length === 6 || h.length === 8) return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1)
    return null
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])]
  return null
}

/** Resolve a token (following var() references) to a colour. */
export function resolveColour(values, token, seen = new Set()) {
  if (seen.has(token)) throw new Error(`${token}: circular reference`)
  seen.add(token)
  const raw = values.get(token)
  if (raw === undefined) throw new Error(`${token}: not defined in tokens.css`)
  const ref = /^var\((--[\w-]+)\)$/.exec(raw.trim())
  if (ref) return resolveColour(values, ref[1], seen)
  const c = parseColour(raw)
  if (!c) throw new Error(`${token}: "${raw}" is not a colour`)
  return c
}

/** `top` over the opaque `under`. */
export const over = (top, under) => { const a = top[3]; return [0, 1, 2].map(i => top[i] * a + under[i] * (1 - a)).concat(1) }

/** Relative luminance (WCAG 2.x) of an opaque sRGB colour. */
export function luminance([r, g, b]) {
  const f = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
/** Contrast ratio of two opaque colours. */
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** The ground of a pair: `--a/--b/--c` is a over b over c; the last must be opaque. */
function ground(values, expr) {
  const parts = expr.split('/').map(p => p.trim())
  let c = resolveColour(values, parts[parts.length - 1])
  if (c[3] < 1) throw new Error(`${expr}: the bottom ground ${parts[parts.length - 1]} is not opaque`)
  for (let i = parts.length - 2; i >= 0; i--) c = over(resolveColour(values, parts[i]), c)
  return c
}

/** The pairs registered in the design file. */
export function registeredPairs(doc = readFileSync(DESIGN, 'utf8')) {
  const a = doc.indexOf('<!-- contrast:start -->'), b = doc.indexOf('<!-- contrast:end -->')
  if (a < 0 || b < a) throw new Error('docs/design/DESIGN_SYSTEM.md has no contrast register (<!-- contrast:start --> … <!-- contrast:end -->)')
  const pairs = []
  for (const line of doc.slice(a, b).split('\n')) {
    const m = /^\|\s*`(--[\w-]+)`\s*\|\s*`([^`]+)`\s*\|\s*(body|large)( tier)?\s*\|\s*(.*?)\s*\|\s*$/.exec(line)
    if (m) pairs.push({ text: m[1], ground: m[2], kind: m[3], tier: !!m[4], use: m[5] })
  }
  return pairs
}

export const THRESHOLD = { body: 4.5, large: 3, faint: 1.5 }

/**
 * 26.65 (D7): the lines of the canvas that are tokens (`--canvas-…`), on the canvas ground in every mode. The design
 * file registers the interface texts; these are lines of the drawing, so they are listed here. `faint` (1.5 : 1) is
 * for a background symbol that must stay visible without competing with the motion (the lines of a uniform field).
 */
export const CANVAS_PAIRS = [
  { text: '--canvas-field-line', ground: '--canvas-bg', kind: 'large', tier: false, use: 'canvas: field lines of the charges' },
  { text: '--canvas-equipotential', ground: '--canvas-bg', kind: 'large', tier: false, use: 'canvas: equipotential lines' },
  { text: '--canvas-trajectory-ink', ground: '--canvas-bg', kind: 'large', tier: false, use: 'canvas: ink a faint trajectory is mixed towards' },
  { text: '--canvas-field-faint', ground: '--canvas-bg', kind: 'faint', tier: false, use: 'canvas: lines of a uniform field' }
]

/** Every registered pair in every mode (and tier): [{ text, ground, kind, mode, tier, ratio, ok }]. */
export function checkAll() {
  const { tokens } = readTokens()
  const out = []
  for (const p of [...registeredPairs(), ...CANVAS_PAIRS]) {
    for (const mode of Object.keys(MODES)) {
      for (const tier of p.tier ? Object.keys(TIERS) : ['tinted']) {
        // projection and "more contrast" resolve to the solid material: a glass pair has no other tier there
        if (p.tier && mode.startsWith('projection') && tier !== 'solid') continue
        const values = valuesOf(tokens, mode, tier)
        const g = ground(values, p.ground)
        const t = over(resolveColour(values, p.text), g)
        const ratio = contrast(t, g)
        out.push({ ...p, mode, tier: p.tier ? tier : null, ratio, ok: ratio >= THRESHOLD[p.kind] })
      }
    }
  }
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = new Set(process.argv.slice(2))
  let results
  try { results = checkAll() } catch (e) { console.error(`contrast-check: ${e.message}`); process.exit(1) }
  if (args.has('--json')) { console.log(JSON.stringify(results, null, 1)); process.exit(results.every(r => r.ok) ? 0 : 1) }
  const bad = results.filter(r => !r.ok)
  const show = args.has('--table') ? results : bad
  for (const r of show) console.log(`${r.ok ? '  ok ' : ' FAIL'} ${r.ratio.toFixed(2).padStart(5)} : 1  (≥ ${THRESHOLD[r.kind]})  ${r.text} on ${r.ground}  [${r.mode}${r.tier ? `, ${r.tier}` : ''}]`)
  const pairs = new Set(results.map(r => `${r.text}|${r.ground}`)).size
  const worst = results.reduce((w, r) => (r.ratio / THRESHOLD[r.kind] < w.ratio / THRESHOLD[w.kind] ? r : w), results[0])
  console.log(`contrast-check: ${pairs} registered pairs, ${results.length} combinations (4 modes, 3 tiers for glass); ${bad.length} under threshold; tightest: ${worst.text} on ${worst.ground} ${worst.ratio.toFixed(2)} : 1 [${worst.mode}${worst.tier ? `, ${worst.tier}` : ''}]`)
  process.exit(bad.length ? 1 : 0)
}
