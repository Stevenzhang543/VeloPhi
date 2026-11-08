/**
 * Almost-JSON from language models (26.61): one tolerant parser instead of a strict parse plus a few text repairs.
 * It reads a superset of JSON and reports every repair it made, so a scene that loads is never silently different
 * from what the model meant without a note, and a file that cannot be read comes back with the line, column and
 * the text around the problem.
 *
 * Accepted besides JSON: comments (// /* *\/ #), single, curly and full-width quotes, raw line breaks and invalid
 * escapes in strings (LaTeX such as \frac, \theta, \times kept literally), unquoted keys and word values, full-width
 * punctuation (：，｛｝［］), trailing and missing commas, Python and JavaScript literals (True, None, undefined),
 * numbers with + or a bare decimal point, arithmetic (2*0.5, Math.PI/6, sqrt(3)/2, 30*π/180), numbers with a unit
 * (25 cm, 30°, 2 kg → SI), NaN and Infinity (→ null), text after the value, and a cut-off end (open strings,
 * arrays and objects are closed; `truncated` is set).
 */

export interface LooseOk { ok: true; value: unknown; repairs: string[]; truncated: boolean; end: number }
export interface LooseError { ok: false; error: string; line: number; column: number; context: string; at: number }
export type LooseResult = LooseOk | LooseError

type O = Record<string, unknown>

const WS = /[\s 　﻿]/
const FULL: Record<string, string> = { '：': ':', '，': ',', '｛': '{', '｝': '}', '［': '[', '］': ']', '、': ',' }
const OPEN_Q: Record<string, string> = { '"': '"', "'": "'", '“': '”', '‘': '’', '＂': '＂', '「': '」', '”': '”' }
/** LaTeX commands whose first letter is also a JSON escape (\f \b \n \r \t): kept literally. */
const LATEX = /^(frac|theta|tau|times|text|tan|tanh|to|top|tilde|beta|bar|bm|bf|binom|big|nu|nabla|neq|ne|not|newline|rho|right|rightarrow|rm|forall|footnote)/
const WORD = /[A-Za-z_$À-ɏͰ-Ͽ一-鿿぀-ヿ]/
const WORD_REST = /[A-Za-z0-9_$.\-À-ɏͰ-Ͽ一-鿿぀-ヿ]/

/** Units a bare number may carry: factor to SI (angles to radians). */
const UNIT_SI: Array<[RegExp, number, string]> = [
  [/^(°|deg\b|度)/, Math.PI / 180, '°'],
  [/^(rad\b)/, 1, 'rad'],
  [/^(cm\b|厘米)/, 0.01, 'cm'],
  [/^(mm\b|毫米)/, 0.001, 'mm'],
  [/^(km\b)/, 1000, 'km'],
  [/^(ms\b|毫秒)/, 0.001, 'ms'],
  [/^(kg\b|千克)/, 1, 'kg'],
  [/^(g\b|克)/, 0.001, 'g'],
  [/^(m\/s²|m\/s\^2|m\/s2\b|m\/s\b|m\b|米)/, 1, 'm'],
  [/^(s\b|秒)/, 1, 's'],
  [/^(N\/m\b|N\b|J\b|W\b|V\b|A\b|Ω|F\b|Hz\b|C\b|T\b)/, 1, '']
]

const FUNCS: Record<string, (x: number) => number> = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs, asin: Math.asin, acos: Math.acos, atan: Math.atan, exp: Math.exp, ln: Math.log, log: Math.log, deg: x => x * Math.PI / 180, rad: x => x }
const CONSTS: Record<string, number> = { pi: Math.PI, PI: Math.PI, 'π': Math.PI, 'Math.PI': Math.PI, 'Math.E': Math.E }

class Stop extends Error { constructor(public at: number, msg: string) { super(msg) } }

/** Parse one value from `src` starting at `from` (text after it is allowed and noted). */
export function parseLoose(src: string, from = 0): LooseResult {
  const repairs: string[] = []
  let i = from
  let truncated = false
  const note = (s: string) => { if (repairs.length < 40 && !repairs.includes(s)) repairs.push(s) }
  const eof = () => i >= src.length
  const ch = () => { const c = src[i]; return c !== undefined && FULL[c] ? FULL[c] : c }

  function skip() {
    for (;;) {
      while (!eof() && WS.test(src[i])) i++
      if (src[i] === '/' && src[i + 1] === '/') { while (!eof() && src[i] !== '\n') i++; note('comments removed'); continue }
      if (src[i] === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; note('comments removed'); continue }
      if (src[i] === '#' && (i === 0 || /[\s,{[]/.test(src[i - 1]))) { while (!eof() && src[i] !== '\n') i++; note('comments removed'); continue }
      if (src[i] !== undefined && FULL[src[i]]) note('full-width punctuation read as JSON punctuation')
      return
    }
  }

  function string(): string {
    const q = src[i]
    const close = OPEN_Q[q]
    if (q !== '"') note(q === "'" ? 'single quotes read as double quotes' : 'curly or full-width quotes read as JSON quotes')
    i++
    let out = ''
    for (;;) {
      if (eof()) { truncated = true; note('cut-off string closed'); return out }
      const c = src[i]
      if (c === close || (q === '”' && c === '"') || (close === '”' && c === '"' && q !== '"')) { i++; return out }
      if (c === '\\') {
        const n = src[i + 1]
        if (n === undefined) { i++; continue }
        if ('fbnrt'.includes(n) && LATEX.test(src.slice(i + 1, i + 12))) { out += '\\'; i++; note('LaTeX in strings kept literally'); continue }
        const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', "'": "'" }
        if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) { out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)); i += 6; continue }
        if (map[n] !== undefined) { out += map[n]; i += 2; continue }
        out += '\\'; i++; note('invalid escapes kept literally')
        continue
      }
      if (c === '\n' || c === '\r' || c === '\t') {
        // A raw line break: the string goes on (models write long texts), unless the next line starts a new key
        if (c !== '\t' && q === '"' && /^\s*"[^"\n]{1,40}"\s*[:：]/.test(src.slice(i + 1, i + 50))) { note('unclosed string closed at the end of its line'); return out }
        out += c === '\t' ? '\t' : '\n'; i++; note('raw line breaks in strings escaped'); continue
      }
      out += c; i++
    }
  }

  // ---- numbers and arithmetic ----
  function expr(): number { let v = term(); for (;;) { skipInline(); const c = src[i]; if (c === '+' || c === '-' || c === '−') { i++; v = c === '+' ? v + term() : v - term() } else return v } }
  function term(): number { let v = power(); for (;;) { skipInline(); const c = src[i]; if (c === '*' || c === '×' || c === '·' || (c === '/' && src[i + 1] !== '/' && src[i + 1] !== '*')) { i++; const r = power(); v = c === '/' ? v / r : v * r } else return v } }
  function power(): number { const b = unary(); skipInline(); if (src[i] === '^' || (src[i] === '*' && src[i + 1] === '*')) { i += src[i] === '^' ? 1 : 2; return b ** power() } return b }
  function unary(): number { skipInline(); const c = src[i]; if (c === '-' || c === '−') { i++; return -unary() } if (c === '+') { i++; return unary() } return atom() }
  function skipInline() { while (!eof() && (src[i] === ' ' || src[i] === '\t')) i++ }
  function atom(): number {
    skipInline()
    if (src[i] === '(') { i++; const v = expr(); skipInline(); if (src[i] === ')') i++; return v }
    const num = /^(0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/.exec(src.slice(i, i + 40))
    if (num) {
      i += num[0].length
      let v = num[0].startsWith('0x') || num[0].startsWith('0X') ? parseInt(num[0], 16) : Number(num[0])
      // A unit right after the number (25 cm, 30°): SI
      const rest = src.slice(i, i + 8).replace(/^ /, '')
      const u = UNIT_SI.find(([re]) => re.test(rest))
      if (u && !/^[ ]?[A-Za-z]\w*\s*[:：(]/.test(src.slice(i, i + 20))) {
        const m = rest.match(u[0])![0]
        i += m.length + (src[i] === ' ' ? 1 : 0)
        if (u[1] !== 1) { v *= u[1]; note(`numbers with units converted to SI (${u[2]})`) } else note('units after numbers removed (SI assumed)')
      }
      return v
    }
    const w = /^(Math\.PI|Math\.E|Math\.\w+|π|[A-Za-z]+)/.exec(src.slice(i, i + 20))
    if (w) {
      const name = w[0]
      if (CONSTS[name] !== undefined) { i += name.length; note('arithmetic evaluated'); return CONSTS[name] }
      const f = FUNCS[name.replace(/^Math\./, '')]
      if (f) { i += name.length; skipInline(); if (src[i] === '(') { i++; const v = expr(); skipInline(); if (src[i] === ')') i++; note('arithmetic evaluated'); return f(v) } }
      if (name === 'Infinity' || name === 'NaN') { i += name.length; return name === 'NaN' ? NaN : Infinity }
    }
    throw new Stop(i, 'a number was expected')
  }

  function numberValue(): number | null {
    const start = i
    const v = expr()
    const text = src.slice(start, i).trim()
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(text)) {
      if (/^[-+]?\d+\.$|^[-+]?\.\d|^\+/.test(text)) note('numbers written as +n, .n or n. read')
      else if (/[*/^()πa-zA-Z]|\d\s*[-+]\s*\d/.test(text)) note('arithmetic evaluated')
    }
    if (!Number.isFinite(v)) { note('NaN and Infinity replaced by null'); return null }
    return v
  }

  function word(): string {
    let w = ''
    while (!eof() && (w ? WORD_REST : WORD).test(src[i])) w += src[i++]
    return w
  }

  function value(depth: number): unknown {
    if (depth > 200) throw new Stop(i, 'nesting too deep')
    skip()
    if (eof()) { truncated = true; return null }
    const c = ch()
    if (c === '{') return object(depth)
    if (c === '[') return array(depth)
    if (OPEN_Q[src[i]]) return string()
    const head = src.slice(i, i + 10)
    if (/[-+.\d(−]/.test(c) || head.startsWith('Math.') || c === 'π' || /^(sqrt|sin|cos|tan|deg|abs|exp|ln|log)\s*\(/.test(head) || /^(pi|PI)(?![A-Za-z0-9_])/.test(head)) {
      if (/^(Infinity|NaN)/.test(src.slice(i))) { i += src.startsWith('NaN', i) ? 3 : 8; note('NaN and Infinity replaced by null'); return null }
      return numberValue()
    }
    const at = i
    const w = word()
    if (!w) throw new Stop(at, `unexpected character "${src[at]}"`)
    switch (w) {
      case 'true': case 'True': case 'TRUE': if (w !== 'true') note('Python/JavaScript literals read'); return true
      case 'false': case 'False': case 'FALSE': if (w !== 'false') note('Python/JavaScript literals read'); return false
      case 'null': return null
      case 'None': case 'undefined': case 'nil': case 'NULL': note('Python/JavaScript literals read'); return null
      case 'NaN': case 'Infinity': note('NaN and Infinity replaced by null'); return null
    }
    // A bare word as a value (kind: rigid)
    let rest = ''
    while (!eof() && !/[,}\]\n\r:：，｝］]/.test(src[i])) rest += src[i++]
    note('unquoted word values read as strings')
    return (w + rest).trim()
  }

  function key(): string | null {
    skip()
    if (eof()) { truncated = true; return null }
    if (OPEN_Q[src[i]]) return string()
    const at = i
    let w = ''
    while (!eof() && !/[:：\s,{}[\]"]/.test(src[i])) w += src[i++]
    if (!w) throw new Stop(at, `a key was expected, found "${src[at]}"`)
    note('unquoted keys read')
    return w
  }

  function object(depth: number): O {
    i++
    const out: O = {}
    for (;;) {
      skip()
      if (eof()) { truncated = true; note('cut-off end closed'); return out }
      let c = ch()
      if (c === '}') { i++; return out }
      if (c === ',') { i++; note('extra commas removed'); continue }
      if (c === ']') { i++; note('mismatched bracket ] read as }'); return out }
      const k = key()
      if (k === null) { note('cut-off end closed'); return out }
      skip()
      if (eof()) { truncated = true; note('cut-off end closed'); return out }
      c = ch()
      if (c === ':' || c === '=') { i++; if (c === '=') note('= read as :') } else note('missing colons inserted')
      skip()
      if (eof()) { truncated = true; note('cut-off end closed'); return out }
      const before = i
      const v = value(depth + 1)
      if (truncated && i >= src.length && (v === null || before === i)) { note('cut-off end closed'); return out }
      out[k] = v
      skip()
      if (eof()) { truncated = true; note('cut-off end closed'); return out }
      c = ch()
      if (c === ',') { i++; continue }
      if (c === '}') { i++; return out }
      if (c === ']') { i++; note('mismatched bracket ] read as }'); return out }
      note('missing commas inserted')
    }
  }

  function array(depth: number): unknown[] {
    i++
    const out: unknown[] = []
    for (;;) {
      skip()
      if (eof()) { truncated = true; note('cut-off end closed'); return out }
      let c = ch()
      if (c === ']') { i++; return out }
      if (c === ',') { i++; note('extra commas removed'); continue }
      if (c === '}') { i++; note('mismatched bracket } read as ]'); return out }
      const before = i
      const v = value(depth + 1)
      if (truncated && i >= src.length && before === i) return out
      out.push(v)
      skip()
      if (eof()) { truncated = true; note('cut-off end closed'); return out }
      c = ch()
      if (c === ',') { i++; continue }
      if (c === ']') { i++; return out }
      if (c === '}') { i++; note('mismatched bracket } read as ]'); return out }
      note('missing commas inserted')
    }
  }

  try {
    const v = value(0)
    const end = i
    skip()
    if (!eof()) note('text after the JSON value ignored')
    return { ok: true, value: v, repairs, truncated, end }
  } catch (e) {
    const at = e instanceof Stop ? e.at : i
    const before = src.slice(0, at)
    const line = before.split('\n').length
    const column = at - before.lastIndexOf('\n')
    const context = `${src.slice(Math.max(0, at - 30), at)}⟨here⟩${src.slice(at, at + 20)}`.replace(/\s+/g, ' ')
    return { ok: false, error: (e as Error).message, line, column, context, at }
  }
}

/** A number written as text ("2 kg", "30°", "pi/6", "1.5e3"), in SI; null when it is not one. */
export function numberFromText(s: string): number | null {
  const t = s.trim()
  if (!t || t.length > 40 || !/^[-+−.(\dπ]|^(pi|sqrt|Math\.|deg)/.test(t)) return null
  const r = parseLoose(t)
  if (!r.ok || typeof r.value !== 'number' || r.repairs.includes('text after the JSON value ignored')) return null
  return r.value
}

const isObj = (v: unknown): v is O => !!v && typeof v === 'object' && !Array.isArray(v)

/** What extractJsonObject found. */
export interface Extracted { value: O; repairs: string[]; truncated: boolean }

/**
 * The JSON object of a model's answer: thinking blocks removed, then the whole text, each fenced block and each
 * object in the prose are read with the tolerant parser; the best candidate wins (`score`, then complete over cut
 * off, then size). An array of objects gives its first object. Null when the answer holds no object at all.
 * `failure` receives the parse error of the most promising text when nothing could be read.
 */
export function extractJsonObject(text: string, score: (o: O) => number = () => 0, failure?: (e: LooseError) => void): Extracted | null {
  if (!text) return null
  const t = text.replace(/^﻿/, '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim()
  if (!t) return null
  const cands: Array<Extracted & { size: number }> = []
  let firstError: LooseError | null = null
  const consider = (src: string, from: number) => {
    const r = parseLoose(src, from)
    if (!r.ok) { firstError ??= r; return r }
    let v = r.value
    if (Array.isArray(v)) { const o = v.find(isObj); if (!o) return r; v = o; r.repairs.push('the first object of a list used') }
    if (isObj(v) && Object.keys(v).length) cands.push({ value: v, repairs: r.repairs, truncated: r.truncated, size: r.end - from })
    return r
  }
  // Fenced blocks first (a model often explains around them), then the text itself, then objects in the prose
  const fences = [...t.matchAll(/```[a-zA-Z0-9_-]*[ \t]*\n?([\s\S]*?)(```|$)/g)]
  for (const m of fences) { const inner = m[1].trim(); if (inner) { const s = inner.search(/[{[]/); if (s >= 0) consider(inner, s) } }
  const first = t.search(/[{[]/)
  if (first >= 0) {
    let at = first
    for (let n = 0; n < 40 && at >= 0 && at < t.length; n++) {
      const r = consider(t, at)
      const next = r.ok ? Math.max(r.end, at + 1) : at + 1
      at = t.slice(next).search(/\{/)
      if (at >= 0) at += next
    }
  }
  if (!cands.length) { if (firstError) failure?.(firstError); return null }
  cands.sort((a, b) => score(b.value) - score(a.value) || Number(a.truncated) - Number(b.truncated) || b.size - a.size)
  const best = cands[0]
  return { value: best.value, repairs: best.repairs, truncated: best.truncated }
}
