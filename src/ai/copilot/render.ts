/**
 * Copilot answers as HTML (26.59): the text is escaped first, then a small Markdown subset — paragraphs, line
 * breaks, lists, tables (26.59 fix), **bold**, `code` — and $…$ / $$…$$ formulas rendered by KaTeX. Nothing of the
 * answer can inject markup: only KaTeX output and the few tags made here reach the page.
 */
import katex from 'katex'
import { escapeHtml } from '../../core/text'

const esc = escapeHtml

function math(tex: string, display: boolean): string {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'html', trust: false }) } catch { return `<code>${esc(tex)}</code>` }
}

function inline(s: string): string {
  // Split off math first (its content must not be escaped twice or styled)
  const parts: string[] = []
  const re = /\$\$([^$]+)\$\$|\$([^$\n]+)\$|\\\((.+?)\\\)/g
  let last = 0, m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    parts.push(styled(s.slice(last, m.index)))
    parts.push(math(m[1] ?? m[2] ?? m[3] ?? '', !!m[1]))
    last = m.index + m[0].length
  }
  parts.push(styled(s.slice(last)))
  return parts.join('')
}

function styled(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
}

/** Markdown tables (26.59 fix: Copilot lists forces and readings as tables): a header row, a |---| row, body rows. */
const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
const isRule = (l: string) => /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*(:?-{2,}:?\s*)?\|?\s*$/.test(l)
const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
function table(rows: string[]): string {
  const head = cells(rows[0]).map(c => `<th>${inline(c)}</th>`).join('')
  const body = rows.slice(2).map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
  return `<div class="tbl"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}

const ITEM = /^\s*([-*•]|\d+[.)])\s+/
function block(lines: string[]): string {
  if (!lines.length) return ''
  if (/^#{1,4}\s/.test(lines[0])) return `<p><b>${inline(lines[0].replace(/^#{1,4}\s/, ''))}</b></p>${block(lines.slice(1))}`
  // 26.60: lists and text in one block — a line that is not an item (a display formula, a wrapped line) continues
  // the item above it; text before the first item is a paragraph
  const out: string[] = []
  let para: string[] = []
  let items: string[][] = []
  let ordered = false
  const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = [] }
  const flushList = () => {
    if (!items.length) return
    const li = items.map(it => `<li>${it.map(inline).join('<br>')}</li>`).join('')
    out.push(ordered ? `<ol>${li}</ol>` : `<ul>${li}</ul>`)
    items = []
  }
  for (const l of lines) {
    if (ITEM.test(l)) {
      const o = /^\s*\d/.test(l)
      if (items.length && o !== ordered) flushList()
      flushPara()
      ordered = o
      items.push([l.replace(ITEM, '')])
    } else if (items.length) items[items.length - 1].push(l.trim())
    else para.push(l)
  }
  flushPara()
  flushList()
  return out.join('')
}

export function renderAnswer(text: string): string {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/)
  return blocks.map(b => {
    const lines = b.split('\n')
    // Tables inside a block: the lines before and after them stay text
    const out: string[] = []
    let text: string[] = []
    for (let i = 0; i < lines.length; i++) {
      if (isRow(lines[i]) && i + 1 < lines.length && isRule(lines[i + 1])) {
        let j = i + 2
        while (j < lines.length && isRow(lines[j])) j++
        out.push(block(text))
        text = []
        out.push(table(lines.slice(i, j)))
        i = j - 1
      } else text.push(lines[i])
    }
    out.push(block(text))
    return out.join('')
  }).join('')
}
