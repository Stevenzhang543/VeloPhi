/**
 * Formula and event detail views (formula/detailTypes.ts) as standalone images (SVG and PNG), the same way as the
 * formula cards (export/formulaImage.ts): the view is laid out as self-contained HTML with KaTeX off-screen, the
 * font faces it uses are embedded, the markup goes into an SVG <foreignObject>, and the SVG is rasterised.
 *
 * `detailHtml` and `detailCss` are pure (Node, tests, courseware and report pages that attach derivations).
 */
import { tl } from '../i18n'
import katex from 'katex'
import type { DetailBlock, DetailView, Tone } from '../formula/detailTypes'
import { chainLatex, splitMath } from '../formula/detailTypes'
import { ENGINE_VERSION } from '../core/scene/types'
import type { ImageBackground } from './still'
import type { FaceRule, FontUsage } from './formulaImage'
import { cardColors, documentFaces, selectFaces, splitFamilies, svgToPng } from './formulaImage'
import { bytesToBase64 } from './zip'

/** Options of the detail images. */
export interface DetailImageOptions {
  theme: 'light' | 'dark'
  background: ImageBackground
  /** CSS width (px); grows (up to 1100) when an equation is wider. Default 640. */
  width?: number
  /** PNG pixel ratio. Default 2. */
  scale?: number
  /** Optional footer line (e.g. the scene name). */
  caption?: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function tex(src: string, display: boolean): string {
  try {
    return katex.renderToString(src, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'html' })
  } catch {
    return esc(src)
  }
}

/** Stylesheet of a detail image (class prefix `vdet`, so it cannot clash with the app styles). */
export function detailCss(o: Pick<DetailImageOptions, 'theme' | 'background'>, width: number): string {
  const c = cardColors(o.theme, o.background)
  const soft = c.dark ? 'rgba(235,235,245,0.06)' : 'rgba(60,60,67,0.05)'
  return [
    `.vdet{box-sizing:border-box;width:${width}px;padding:18px 22px 14px;border-radius:14px;border:1px solid ${c.border};background:${c.background};color:${c.text};font-family:"Noto Sans SC Variable","Segoe UI","Microsoft YaHei UI","PingFang SC",sans-serif;font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased}`,
    '.vdet-title{font-size:18px;font-weight:650}',
    `.vdet-sub{font-size:12px;color:${c.text2};margin-top:2px}`,
    '.vdet-badges{margin-top:6px}',
    `.vdet-badge{display:inline-block;padding:0 9px;margin-right:6px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid ${c.neutral};color:${c.neutral}}`,
    `.vdet-badge.ok{color:${c.ok};border-color:${c.ok}}.vdet-badge.warn{color:${c.warn};border-color:${c.warn}}.vdet-badge.bad{color:${c.bad};border-color:${c.bad}}.vdet-badge.info{color:${c.text2};border-color:${c.border}}`,
    '.vdet-head-eq{text-align:center;font-size:17px;margin:8px 0 2px}',
    `.vdet-sec{border-top:1px solid ${c.border};margin-top:10px;padding-top:8px}`,
    '.vdet-sec h3{font-size:15px;font-weight:650;margin:0 0 6px}',
    `.vdet h4{font-size:13px;font-weight:650;color:${c.text2};margin:8px 0 3px}`,
    '.vdet p{margin:3px 0}',
    `.vdet p.small{font-size:12px;color:${c.text2}}`,
    `.vdet .tone-ok{color:${c.ok}}.vdet .tone-warn{color:${c.warn}}.vdet .tone-bad{color:${c.bad}}.vdet .tone-neutral{color:${c.neutral}}`,
    '.vdet .katex-display{margin:4px 0}',
    `.vdet-chain{background:${soft};border-radius:10px;padding:2px 12px;margin:4px 0 8px}`,
    '.vdet-chain .katex-display,.vdet-chain .katex-display>.katex{text-align:left}',
    `.vdet-calc{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;align-items:center;background:${soft};border-radius:10px;padding:8px 12px;margin:4px 0 8px}`,
    '.vdet-calc .eq:nth-of-type(n+2){padding-left:1.2em}.vdet-calc .note{font-size:0.86em;opacity:0.78}',
    `.vdet-basis{display:inline-block;font-size:11px;color:${c.text2};border:1px solid ${c.border};border-radius:999px;padding:0 8px}`,
    `.vdet-step{display:flex;gap:8px;background:${soft};border-radius:10px;padding:5px 10px;margin:4px 0}`,
    `.vdet-step .n{flex:0 0 auto;width:18px;height:18px;border-radius:50%;border:1px solid ${c.border};font-size:11px;font-weight:700;text-align:center;line-height:18px;margin-top:3px}`,
    '.vdet-step .b{flex:1;min-width:0}',
    '.vdet table{border-collapse:collapse;width:100%;font-size:12.5px;margin:3px 0 6px}',
    `.vdet th{text-align:left;color:${c.text2};font-weight:600;font-size:11.5px;padding:2px 6px;border-bottom:1px solid ${c.border}}`,
    `.vdet td{padding:2px 6px;border-top:1px solid ${c.border}}`,
    '.vdet td.mono{font-family:"JetBrains Mono Variable",Consolas,monospace;font-variant-numeric:tabular-nums;white-space:nowrap}',
    `.vdet-cond{background:${soft};border-radius:10px;padding:4px 10px;margin:4px 0;border-left:3px solid ${c.neutral}}`,
    `.vdet-cond.ok{border-left-color:${c.ok}}.vdet-cond.approx{border-left-color:${c.warn}}.vdet-cond.fail{border-left-color:${c.bad}}`,
    `.vdet-cond .r{font-size:11px;color:${c.text2};margin-left:6px}`,
    `.vdet-foot{margin-top:10px;font-size:10.5px;color:${c.text2}}`
  ].join('\n')
}

/** Text with its inline formulas ($…$) rendered. */
function rich(text: string): string {
  return splitMath(text).map(p => (p.math ? tex(p.s, false) : esc(p.s))).join('')
}

const TONE: Record<Tone, string> = { ok: 'ok', warn: 'warn', bad: 'bad', info: 'info', neutral: '' }
const MARK = { ok: '✓', approx: '≈', fail: '✗' } as const

function blockHtml(b: DetailBlock): string {
  switch (b.kind) {
    case 'text': return `<p class="${[b.small ? 'small' : '', b.tone ? `tone-${b.tone}` : ''].join(' ').trim()}">${rich(b.text)}</p>`
    case 'subhead': return `<h4>${rich(b.text)}</h4>`
    case 'equation': return `<div>${tex(b.tex, true)}${b.text ? `<p>${rich(b.text)}</p>` : ''}${b.basis ? `<span class="vdet-basis">${esc(b.basis)}</span>` : ''}</div>`
    case 'steps': return b.steps.map((s, i) => `<div class="vdet-step"><span class="n">${i + 1}</span><div class="b"><p>${rich(s.text)}</p>${tex(s.tex, true)}${s.basis ? `<span class="vdet-basis">${esc(s.basis)}</span>` : ''}</div></div>`).join('')
    case 'chain': return `<div class="vdet-chain">${tex(chainLatex(b.lhs, b.rhs), true)}</div>`
    case 'calc': return `<div class="vdet-calc">${b.lines.map((l, i) => `<div class="eq">${tex(i === 0 ? `${b.lhs} = ${l.tex}` : `= ${l.tex}`, false)}</div><div class="note">${l.note ? rich(l.note) : ''}</div>`).join('')}</div>`
    case 'table': {
      const al = (i: number) => (b.align?.[i] && b.align[i] !== 'left' ? ` style="text-align:${b.align[i]}"` : '')
      const head = b.head ? `<thead><tr>${b.head.map((h, i) => `<th${al(i)}>${rich(h)}</th>`).join('')}</tr></thead>` : ''
      const rows = b.rows.map(r => `<tr>${r.map((cell, i) => `<td class="${[cell.mono ? 'mono' : '', cell.tone ? `tone-${cell.tone}` : ''].join(' ').trim()}"${al(i)}>${cell.text ? rich(cell.text) : ''}${cell.tex ? ` ${tex(cell.tex, false)}` : ''}</td>`).join('')}</tr>`).join('')
      return `<table>${head}<tbody>${rows}</tbody></table>`
    }
    case 'conditions': return b.items.map(c => `<div class="vdet-cond ${c.status}"><b>${MARK[c.status]} ${esc(c.label)}</b><span class="r">${esc(c.role)}</span>${c.detail ? `<p class="small">${rich(c.detail)}</p>` : ''}</div>`).join('')
  }
}

/** Markup of a detail view (HTML; serialised to XHTML before it goes into an SVG). */
export function detailHtml(view: DetailView, o: Pick<DetailImageOptions, 'caption'> = {}): string {
  return [
    '<div class="vdet">',
    `<div class="vdet-title">${esc(view.title)}</div>`,
    view.subtitle ? `<div class="vdet-sub">${esc(view.subtitle)}</div>` : '',
    view.badges.length ? `<div class="vdet-badges">${view.badges.map(b => `<span class="vdet-badge ${TONE[b.tone]}">${esc(b.text)}</span>`).join('')}</div>` : '',
    view.headline ? `<div class="vdet-head-eq">${tex(view.headline, true)}</div>` : '',
    ...view.sections.map(s => `<div class="vdet-sec"><h3>${esc(s.title)}</h3>${s.blocks.map(blockHtml).join('')}</div>`),
    `<div class="vdet-foot">VeloPhi ${ENGINE_VERSION}${o.caption ? ` · ${esc(o.caption)}` : ''}</div>`,
    '</div>'
  ].join('')
}

// ---- Browser side ----

/** Text runs of an element with their computed fonts. */
function fontUsages(root: Element): FontUsage[] {
  const groups = new Map<string, FontUsage>()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue ?? ''
    if (!text.trim() || !n.parentElement) continue
    const cs = getComputedStyle(n.parentElement)
    const weight = Number(cs.fontWeight) || 400
    const key = `${cs.fontFamily}|${weight}|${cs.fontStyle}`
    let g = groups.get(key)
    if (!g) { g = { families: splitFamilies(cs.fontFamily), weight, style: cs.fontStyle, chars: new Set() }; groups.set(key, g) }
    for (const ch of text) g.chars.add(ch.codePointAt(0)!)
  }
  return [...groups.values()]
}

const fontCache = new Map<string, Promise<string>>()

function fontDataUrl(f: FaceRule): Promise<string> {
  let p = fontCache.get(f.url)
  if (!p) {
    const mime = f.format.startsWith('woff2') || f.url.endsWith('.woff2') ? 'font/woff2' : f.format.startsWith('woff') || f.url.endsWith('.woff') ? 'font/woff' : 'font/ttf'
    p = fetch(f.url).then(async r => {
      if (!r.ok) throw new Error(tl('字体加载失败：{0}', [r.status]))
      return `data:${mime};base64,${bytesToBase64(new Uint8Array(await r.arrayBuffer()))}`
    })
    fontCache.set(f.url, p)
    p.catch(() => fontCache.delete(f.url))
  }
  return p
}

let katexCss: string | null = null
/** KaTeX style rules of the document (without @font-face rules, which are embedded selectively). */
function documentKatexCss(): string {
  if (katexCss !== null) return katexCss
  const parts: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRule[] = []
    try { rules = Array.from(sheet.cssRules) } catch { continue }
    for (const rule of rules) if (!(rule instanceof CSSFontFaceRule) && rule.cssText.includes('.katex')) parts.push(rule.cssText)
  }
  katexCss = parts.join('\n')
  return katexCss
}

const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()))

/** SVG (all fonts embedded) and PNG of a detail view, with its CSS size and the PNG pixel ratio. */
export async function detailImage(view: DetailView, o: DetailImageOptions, opts: { png?: boolean } = {}): Promise<{ svg: string; png: Uint8Array | null; width: number; height: number; scale: number }> {
  const scale = o.scale ?? 2
  let width = o.width ?? 640
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-30000px;top:0;pointer-events:none;contain:layout style'
  const style = document.createElement('style')
  const box = document.createElement('div')
  host.append(style, box)
  document.body.appendChild(host)
  try {
    style.textContent = detailCss(o, width)
    box.innerHTML = detailHtml(view, o)
    const el = box.firstElementChild as HTMLElement
    await document.fonts.ready
    await nextFrame()
    // A wide equation or table widens the image instead of being clipped
    const need = Math.max(0, ...Array.from(el.querySelectorAll<HTMLElement>('.katex-display, table')).map(e => e.scrollWidth - e.clientWidth))
    if (need > 0) {
      width = Math.min(1100, Math.ceil(width + need + 8))
      style.textContent = detailCss(o, width)
      await nextFrame()
    }
    const rect = el.getBoundingClientRect()
    const w = Math.ceil(rect.width), h = Math.ceil(rect.height)
    const faces = selectFaces(documentFaces(), fontUsages(el))
    const rules = await Promise.all(faces.map(async f => `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weightText};font-display:block;src:url(${await fontDataUrl(f)})${f.format ? ` format("${f.format}")` : ''};${f.rangeText ? `unicode-range:${f.rangeText};` : ''}}`))
    const css = `${rules.join('\n')}\n${documentKatexCss()}\n${detailCss(o, width)}`
    const xhtml = new XMLSerializer().serializeToString(el)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
      + `<style><![CDATA[\n${css.replace(/]]>/g, ']]]]><![CDATA[>')}\n]]></style>`
      + `<foreignObject x="0" y="0" width="${w}" height="${h}">${xhtml}</foreignObject></svg>`
    return { svg, width: w, height: h, scale, png: opts.png === false ? null : await svgToPng(svg, w, h, scale) }
  } finally {
    host.remove()
  }
}
