#!/usr/bin/env node
/**
 * Token lint of design system v4 (26.64, D252–D258; docs/design/DESIGN_SYSTEM.md).
 *
 * 1. Components write no colour and no radius themselves. Every `.vue` and `.css` file under src/app (tokens.css
 *    excepted — it is where the values live) is scanned for
 *      hex     a hexadecimal colour (#rgb, #rgba, #rrggbb, #rrggbbaa)
 *      rgb     a colour function with literal numbers (rgb(), rgba(), hsl(), hsla())
 *      radius  a border radius given in px (`border-radius: 9px`; 0 and tokens are fine)
 *    Files that are not migrated yet are registered in scripts/token-lint.exceptions.json with the number of
 *    occurrences they may have per kind — a ratchet: the lint fails when a file has more than its registered number,
 *    or when a file that is not registered has any. A file below its number passes and is reported, so the register
 *    can be tightened (`--update` rewrites it to the current counts; use it when literals were removed, and at the
 *    hand-over of a work package for files that were deliberately left for a later one).
 * 2. The tokens of src/app/tokens.css and the token list of the design file are the same list: the table between
 *    `<!-- tokens:start -->` and `<!-- tokens:end -->` is generated from tokens.css (`--write-table`), and the lint
 *    fails when it is stale.
 * 3. Every token defined in tokens.css is used somewhere in src (a token nobody uses is a decision nobody made).
 *
 *   node scripts/token-lint.mjs                 lint; exit 0 when clean; prints the number of registered exceptions
 *   node scripts/token-lint.mjs --list          also print every occurrence found (file:line kind text)
 *   node scripts/token-lint.mjs --update        rewrite the register to the current counts
 *   node scripts/token-lint.mjs --write-table   regenerate the token list of the design file
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const APP = join(repo, 'src', 'app')
const TOKENS = join(APP, 'tokens.css')
const DESIGN = join(repo, 'docs', 'design', 'DESIGN_SYSTEM.md')
const REGISTER = join(here, 'token-lint.exceptions.json')

function walk(dir, test, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, test, out)
    else if (test(name)) out.push(p)
  }
  return out
}
const rel = p => relative(repo, p).split('\\').join('/')

const HEX = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g
const RGB = /\b(?:rgba?|hsla?)\(\s*[\d.]/g
const RADIUS = /border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius\s*:\s*([^;}"]+)/g

/** Occurrences of literal colours and radii in one file: [{ line, kind, text }]. */
export function scanFile(path) {
  const found = []
  const lines = readFileSync(path, 'utf8').split('\n')
  lines.forEach((text, i) => {
    // a comment line is prose, not style
    const code = text.replace(/\/\*.*?\*\//g, '').replace(/^\s*(\/\/|\*|\/\*).*$/, '')
    for (const m of code.matchAll(HEX)) found.push({ line: i + 1, kind: 'hex', text: m[0] })
    for (const m of code.matchAll(RGB)) found.push({ line: i + 1, kind: 'rgb', text: code.slice(m.index, code.indexOf(')', m.index) + 1) })
    for (const m of code.matchAll(RADIUS)) if (/(?<![\w.-])\d*\.?\d+px/.test(m[1].replace(/var\([^)]*\)/g, '').replace(/calc\([^)]*\)/g, ''))) found.push({ line: i + 1, kind: 'radius', text: m[0].trim() })
  })
  return found
}

/** Counts per kind for every scanned file that has any literal. */
export function scanApp() {
  const files = walk(APP, n => /\.(vue|css)$/.test(n)).filter(p => p !== TOKENS)
  const byFile = {}
  for (const p of files) {
    const found = scanFile(p)
    if (found.length) byFile[rel(p)] = found
  }
  return { scanned: files.length, byFile }
}

const count = found => { const c = { hex: 0, rgb: 0, radius: 0 }; for (const f of found) c[f.kind]++; return c }

// ---- tokens.css ↔ design file ----

/** The custom properties of tokens.css by mode: { name: { light, dark, … } } in the order of first definition. */
export function readTokens(css = readFileSync(TOKENS, 'utf8')) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@font-face\s*\{[^}]*\}/g, '')
  const modes = [
    ['light', /^:root$/], ['sysfont', /^:root\.sysfont$/], ['dark', /^:root\[data-theme="dark"\]$/],
    ['clear', /^:root\.glass-clear$/], ['clear-dark', /^:root\.glass-clear\[data-theme="dark"\]$/], ['solid', /^:root\.glass-solid$/],
    ['compact', /^:root\.density-compact$/], ['projector', /^:root\.projector$/], ['zh', /^:root:lang\(zh\)$/],
    ['strong', /^:root\.projector, :root\.contrast-more$/], ['strong-dark', /^:root\.projector\[data-theme="dark"\], :root\.contrast-more\[data-theme="dark"\]$/]
  ]
  const tokens = new Map()
  const unknown = []
  // @supports blocks are fallbacks of values defined above; they are not part of the list
  const flat = src.replace(/@supports[^{]*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g, '')
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, ' ')
    const mode = modes.find(([, re]) => re.test(selector))?.[0]
    if (!mode) { unknown.push(selector); continue }
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (!tokens.has(d[1])) tokens.set(d[1], {})
      tokens.get(d[1])[mode] = d[2].trim().replace(/\s+/g, ' ')
    }
  }
  return { tokens, unknown }
}

/** The token list of the design file, generated from tokens.css. */
export function tokenTable() {
  const { tokens } = readTokens()
  const esc = v => (v === undefined ? '' : `\`${v.replace(/\|/g, '\\|')}\``)
  const rows = ['| 令牌 | 浅色（默认） | 深色 | 其他模式 |', '| --- | --- | --- | --- |']
  for (const [name, v] of tokens) {
    const other = Object.entries(v).filter(([k]) => k !== 'light' && k !== 'dark').map(([k, x]) => `${k}: \`${x.replace(/\|/g, '\\|')}\``).join('；')
    rows.push(`| \`${name}\` | ${esc(v.light)} | ${esc(v.dark)} | ${other} |`)
  }
  return rows.join('\n')
}

const START = '<!-- tokens:start -->', END = '<!-- tokens:end -->'
function designTable() {
  if (!existsSync(DESIGN)) return null
  const doc = readFileSync(DESIGN, 'utf8')
  const a = doc.indexOf(START), b = doc.indexOf(END)
  return a < 0 || b < a ? null : doc.slice(a + START.length, b).trim()
}

/** Tokens nobody reads: not referenced as var(--x) anywhere in src (tokens.css itself included, for aliases). */
function unusedTokens(tokens) {
  const text = walk(join(repo, 'src'), n => /\.(vue|css|ts)$/.test(n)).map(p => readFileSync(p, 'utf8')).join('\n')
  // tokens read from script (getPropertyValue('--x')) count as used
  return [...tokens.keys()].filter(t => !new RegExp(`var\\(${t}[,)\\s]|['"\`]${t}['"\`]`).test(text) && t !== '--ui-scale' && t !== '--proj-scale')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = new Set(process.argv.slice(2))
  if (args.has('--write-table')) {
    const doc = readFileSync(DESIGN, 'utf8')
    const a = doc.indexOf(START), b = doc.indexOf(END)
    if (a < 0 || b < a) { console.error(`token-lint: ${rel(DESIGN)} has no ${START} … ${END} section`); process.exit(1) }
    writeFileSync(DESIGN, `${doc.slice(0, a + START.length)}\n${tokenTable()}\n${doc.slice(b)}`)
    console.log(`token list → ${rel(DESIGN)} (${readTokens().tokens.size} tokens)`)
    process.exit(0)
  }
  const { scanned, byFile } = scanApp()
  if (args.has('--update')) {
    const reg = { note: 'Registered exceptions of scripts/token-lint.mjs: the most literal colours (hex, rgb) and px radii each file may still contain. Lower a number when literals are removed; never raise one without a reason written in docs/design/DESIGN_SYSTEM.md §11.', files: {} }
    for (const f of Object.keys(byFile).sort()) reg.files[f] = count(byFile[f])
    writeFileSync(REGISTER, JSON.stringify(reg, null, 1) + '\n')
    console.log(`register → ${rel(REGISTER)} (${Object.keys(reg.files).length} files)`)
  }
  const register = existsSync(REGISTER) ? JSON.parse(readFileSync(REGISTER, 'utf8')).files ?? {} : {}
  const problems = []
  let registered = 0, files = 0, slack = 0
  for (const [f, allowed] of Object.entries(register)) {
    const n = (allowed.hex ?? 0) + (allowed.rgb ?? 0) + (allowed.radius ?? 0)
    if (!n) continue
    registered += n; files++
    if (!existsSync(join(repo, f))) { problems.push(`${f}: registered but the file is gone — remove it from the register (--update)`); continue }
    const now = count(byFile[f] ?? [])
    for (const k of ['hex', 'rgb', 'radius']) if (now[k] < (allowed[k] ?? 0)) slack += (allowed[k] ?? 0) - now[k]
  }
  for (const [f, found] of Object.entries(byFile)) {
    const now = count(found), allowed = register[f] ?? {}
    for (const k of ['hex', 'rgb', 'radius']) {
      if (now[k] > (allowed[k] ?? 0)) {
        const lines = found.filter(x => x.kind === k).map(x => `${x.line}: ${x.text}`).slice(0, 6).join('; ')
        problems.push(`${f}: ${now[k]} ${k} literal(s), ${allowed[k] ?? 0} registered — use a token (${lines})`)
      }
    }
    if (args.has('--list')) for (const x of found) console.log(`${f}:${x.line} ${x.kind} ${x.text}`)
  }
  const { tokens, unknown } = readTokens()
  for (const s of unknown) problems.push(`tokens.css: selector "${s}" is not a mode the lint knows — add it to readTokens()`)
  const table = designTable()
  if (table === null) problems.push(`${rel(DESIGN)}: the token list (${START} … ${END}) is missing — node scripts/token-lint.mjs --write-table`)
  else if (table !== tokenTable()) problems.push(`${rel(DESIGN)}: the token list is not the one of tokens.css — node scripts/token-lint.mjs --write-table`)
  for (const t of unusedTokens(tokens)) problems.push(`tokens.css: ${t} is defined but never used`)

  for (const p of problems) console.error(`token-lint: ${p}`)
  console.log(`token-lint: ${scanned} files under src/app scanned, ${tokens.size} tokens; ${registered} registered exceptions in ${files} files${slack ? ` (${slack} of them already gone: tighten with --update)` : ''}; ${problems.length} problem(s)`)
  process.exit(problems.length ? 1 : 0)
}
