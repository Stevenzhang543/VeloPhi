/**
 * Subscripts in interface texts (26.65, D294). The texts write a subscript the way a physicist types one — `v_y`,
 * `U_AB`, `s_min`, `C_rr`, `x_{12}` — and this module turns that into a real subscript: segments for HTML (`Rich.vue`
 * renders them with `<sub>`), a canvas drawing that lowers and shrinks the subscript, and a plain-text form with the
 * Unicode subscript letters where they all exist (for `<option>` and `title`, which cannot hold markup).
 *
 * What counts as a subscript: one or two letters, an underscore, then one to three letters or digits (or anything in
 * braces up to six characters), not inside a longer word. So `DATA_SOURCES.md` and `THIRD_PARTY` are left alone.
 */

const PATTERN = /(?<![A-Za-z0-9])([A-Za-zα-ωΑ-Ωφ]{1,2})_(?:\{([^}]{1,6})\}|([A-Za-z0-9]{1,3}))(?![A-Za-z0-9_])/g

export interface SubPart { t: string; sub?: boolean }

/** The text split into ordinary runs and subscripts. */
export function subParts(s: string): SubPart[] {
  const out: SubPart[] = []
  let last = 0
  PATTERN.lastIndex = 0
  for (const m of s.matchAll(PATTERN)) {
    const at = m.index ?? 0
    if (at > last) out.push({ t: s.slice(last, at) })
    out.push({ t: m[1] })
    out.push({ t: m[2] ?? m[3], sub: true })
    last = at + m[0].length
  }
  if (last < s.length) out.push({ t: s.slice(last) })
  return out.length ? out : [{ t: s }]
}

/** Whether the text has a subscript written with an underscore. */
export const hasSub = (s: string): boolean => new RegExp(PATTERN.source).test(s)

const UNI: Record<string, string> = {
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
  β: 'ᵦ', γ: 'ᵧ', ρ: 'ᵨ', φ: 'ᵩ', χ: 'ᵪ', '+': '₊', '-': '₋', '−': '₋',
}

/**
 * Plain text: Unicode subscript characters where every character of the subscript has one (`s_min` → `sₘᵢₙ`); a
 * subscript that cannot be written so (`v_y`, `U_AB`) keeps the letters and loses the underscore only when it is a
 * single capital pair (`U_AB` → `UAB` would mislead, so it stays `U_AB`).
 */
export function subPlain(s: string): string {
  return subParts(s).map(p => {
    if (!p.sub) return p.t
    const chars = [...p.t]
    return chars.every(c => UNI[c]) ? chars.map(c => UNI[c]).join('') : `_${p.t}`
  }).join('').replace(/([A-Za-zα-ωΑ-Ωφ]{1,2})__/g, '$1_')
}

/** Draw a text with subscripts on a canvas at (x, y) (left, alphabetic baseline); returns the width. */
export function fillRich(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, draw = true): number {
  const parts = subParts(s)
  if (parts.length === 1) { if (draw) ctx.fillText(s, x, y); return ctx.measureText(s).width }
  const font = ctx.font
  const size = parseFloat(/([\d.]+)px/.exec(font)?.[1] ?? '12')
  const small = font.replace(/[\d.]+px/, `${(size * 0.72).toFixed(1)}px`)
  let at = x
  for (const p of parts) {
    ctx.font = p.sub ? small : font
    if (draw) ctx.fillText(p.t, at, p.sub ? y + size * 0.22 : y)
    at += ctx.measureText(p.t).width
  }
  ctx.font = font
  return at - x
}

/** Width of a text with subscripts on a canvas. */
export const measureRich = (ctx: CanvasRenderingContext2D, s: string): number => fillRich(ctx, s, 0, 0, false)
