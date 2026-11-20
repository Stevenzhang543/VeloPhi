/**
 * Can the fonts of this device draw a character? (26.64, D271.) The Chinese names of fourteen of the elements 104–118
 * (𬬻, 𬭊 … 鿫) lie in blocks of Unicode that the bundled Noto Sans SC subset does not cover — the package ships 101
 * slices, none of which contains them, and the repository has no other open font that does — so whether they appear
 * depends on the system's fonts. The check draws the character and a code point that no font has (U+FFFF) with the
 * interface's font stack and compares the pixels: the same picture means the "missing glyph" box.
 *
 * Limit: a browser that draws a different box for every missing character (Firefox prints the code point into it)
 * is taken to have the glyph. The element page therefore always spells such a name out as well (model.ts,
 * `nameGloss`); this check only decides what a small cell of the table or a search result shows.
 */
const cache = new Map<string, boolean>()

function picture(ctx: CanvasRenderingContext2D, ch: string): string {
  ctx.clearRect(0, 0, 32, 32)
  ctx.fillText(ch, 16, 16)
  const d = ctx.getImageData(0, 0, 32, 32).data
  let s = ''
  for (let i = 3; i < d.length; i += 4) s += d[i] > 64 ? '1' : '0'
  return s
}

export function glyphSupported(ch: string): boolean {
  const known = cache.get(ch)
  if (known !== undefined) return known
  if (typeof document === 'undefined') return true
  let ok = true
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 32; canvas.height = 32
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      ctx.font = `20px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const a = picture(ctx, ch)
      ok = a.includes('1') && a !== picture(ctx, '￿') && a !== picture(ctx, '\u{10ffff}')
    }
  } catch { ok = true }
  cache.set(ch, ok)
  return ok
}

/** Every character of a text can be drawn. */
export function textSupported(text: string): boolean { return [...text].every(c => c.charCodeAt(0) < 0x2e80 || glyphSupported(c)) }
