#!/usr/bin/env node
/**
 * Copy lint (26.64, D247; the numbers are those of D243): the interface texts of `src/app` in the three languages.
 *
 *   labels    the text of a button (`.btn`, a segmented control's or a tab strip's button, `role="tab"`): at most
 *             4 Chinese characters, 14 English, 18 German. A trailing "…" does not count; a text with a parameter
 *             (`{0}`) is not a fixed label and is skipped.
 *   tooltips  `:title="tl('…')"`: one phrase of at most 14 Chinese characters; a shortcut in brackets
 *             ("（{0}+Z）") does not count.
 *   words     no 强大 / 轻松 / 一键 (and their English and German counterparts) in any interface text.
 *
 * The three words are an error everywhere. Lengths are an error in the files of the first level — the bars the budget
 * of D243 is about (FIRST_LEVEL below) — and for every other file the overruns that existed when this script was
 * written are registered in scripts/copy-lint.baseline.json, per file and kind: the count may only go down (tighten
 * with --update), a new overrun fails. `--list` prints every registered overrun so they can be worked off one by one.
 *
 *   node scripts/copy-lint.mjs            check (exit 1 on a problem)
 *   node scripts/copy-lint.mjs --list     also print the registered overruns
 *   node scripts/copy-lint.mjs --update   write the register from the current source (never raises a count without --grow)
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const require = createRequire(import.meta.url)
const ts = require(join(repo, 'node_modules/typescript'))
const sfc = require(join(repo, 'node_modules/@vue/compiler-sfc'))
const args = new Set(process.argv.slice(2))

export const LIMITS = { label: { zh: 4, en: 14, de: 18 }, tooltip: { zh: 14 } }
/** 场强大小 ("the magnitude of the field strength") is not 强大. */
const ZH_BANNED = [['强大', /强大(?!小)/], ['轻松', /轻松/], ['一键', /一键/]]
const BANNED = { en: ['powerful', 'effortless', 'one-click', 'one click'], de: ['leistungsstark', 'mühelos', 'ein-klick', 'kinderleicht'] }
/** The bars of the first level (D243): no overrun is tolerated here. */
const FIRST_LEVEL = ['src/app/components/TopBar.vue', 'src/app/components/StageLayout.vue', 'src/app/components/TeachMenu.vue', 'src/app/components/NavRail.vue', 'src/app/components/HomePage.vue', 'src/app/components/WalkthroughOverlay.vue', 'src/app/components/GuideDialog.vue']
const BASELINE = join(here, 'copy-lint.baseline.json')

function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkFiles(p, out)
    else if (/\.vue$/.test(name)) out.push(p)
  }
  return out
}

/** The English and German tables: every `'中文': ['English', 'Deutsch']` entry of src/i18n/texts/*.ts. */
function loadTables() {
  const en = new Map(), de = new Map()
  const dir = join(repo, 'src/i18n/texts')
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.ts')) continue
    const js = ts.transpileModule(readFileSync(join(dir, name), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    const mod = { exports: {} }
    try { new Function('module', 'exports', 'require', js)(mod, mod.exports, () => ({})) } catch { continue }
    for (const table of Object.values(mod.exports)) {
      if (!table || typeof table !== 'object') continue
      for (const [zh, pair] of Object.entries(table)) if (Array.isArray(pair) && pair.length === 2) { en.set(zh, pair[0]); de.set(zh, pair[1]) }
    }
  }
  return { en, de }
}

const len = s => [...s].length
const core = s => s.replace(/…$|\.\.\.$| …$/u, '')
const tlTexts = src => [...src.matchAll(/\btl\(\s*'((?:\\.|[^'])*)'\s*\)/g)].map(m => m[1].replace(/\\'/g, "'"))

/** Labels and tooltips of one component file. */
function scan(file) {
  const src = readFileSync(join(repo, file), 'utf8')
  const ast = sfc.parse(src).descriptor.template?.ast
  const labels = [], tooltips = [], all = tlTexts(src)
  if (!ast) return { labels, tooltips, all }
  const cls = n => n.props?.find(p => p.type === 6 && p.name === 'class')?.value?.content ?? ''
  const role = n => n.props?.find(p => p.type === 6 && p.name === 'role')?.value?.content ?? ''
  const isButton = (n, parent) => n.tag === 'button' && (/\bbtn\b/.test(cls(n)) || role(n) === 'tab' || /\b(segmented|tabs)\b/.test(cls(parent ?? {})) || role(parent ?? {}) === 'tablist')
  const walk = (n, parent) => {
    if (n.type === 1) {
      const title = n.props?.find(p => p.type === 7 && p.name === 'bind' && p.arg?.content === 'title')?.exp?.content ?? ''
      for (const t of tlTexts(title)) tooltips.push(t)
      if (isButton(n, parent)) {
        // the button's own text: interpolations that are its direct children, or inside a plain <span>
        for (const c of n.children ?? []) {
          const texts = c.type === 5 ? tlTexts(c.loc.source) : c.type === 1 && c.tag === 'span' ? (c.children ?? []).filter(x => x.type === 5).flatMap(x => tlTexts(x.loc.source)) : []
          for (const t of texts) if (!/\{\d\}/.test(t)) labels.push(t)
        }
      }
    }
    for (const c of n.children ?? []) walk(c, n)
    for (const b of n.branches ?? []) walk(b, parent)
  }
  walk(ast, null)
  return { labels, tooltips, all }
}

export function lint() {
  const { en, de } = loadTables()
  const findings = [] // { file, kind: 'label' | 'tooltip' | 'word', text, detail }
  for (const p of walkFiles(join(repo, 'src/app'))) {
    const file = relative(repo, p).split('\\').join('/')
    const { labels, tooltips, all } = scan(file)
    for (const zh of new Set(labels)) {
      const e = en.get(zh) ?? '', d = de.get(zh) ?? ''
      const over = []
      if (len(core(zh)) > LIMITS.label.zh) over.push(`zh ${len(core(zh))}`)
      if (len(core(e)) > LIMITS.label.en) over.push(`en ${len(core(e))} "${e}"`)
      if (len(core(d)) > LIMITS.label.de) over.push(`de ${len(core(d))} "${d}"`)
      if (over.length) findings.push({ file, kind: 'label', text: zh, detail: over.join(', ') })
    }
    for (const zh of new Set(tooltips)) {
      const phrase = zh.replace(/（[^（）]*\{\d\}[^（）]*）/g, '')
      if (len(phrase) > LIMITS.tooltip.zh) findings.push({ file, kind: 'tooltip', text: zh, detail: `zh ${len(phrase)}` })
    }
    for (const zh of new Set(all)) {
      const hits = [...ZH_BANNED.filter(([, re]) => re.test(zh)).map(([w]) => `zh ${w}`), ...BANNED.en.filter(w => (en.get(zh) ?? '').toLowerCase().includes(w)).map(w => `en ${w}`), ...BANNED.de.filter(w => (de.get(zh) ?? '').toLowerCase().includes(w)).map(w => `de ${w}`)]
      if (hits.length) findings.push({ file, kind: 'word', text: zh, detail: hits.join(', ') })
    }
  }
  return findings
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('copy-lint.mjs')) {
  const findings = lint()
  const count = {}
  for (const f of findings) if (f.kind !== 'word') { count[f.file] ??= { label: 0, tooltip: 0 }; count[f.file][f.kind]++ }
  const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { files: {} }
  if (args.has('--update')) {
    const files = {}
    for (const [file, c] of Object.entries(count)) {
      if (FIRST_LEVEL.includes(file)) continue
      const old = base.files[file]
      const next = { label: old && !args.has('--grow') ? Math.min(old.label, c.label) : c.label, tooltip: old && !args.has('--grow') ? Math.min(old.tooltip, c.tooltip) : c.tooltip }
      if (next.label || next.tooltip) files[file] = next
    }
    writeFileSync(BASELINE, JSON.stringify({ note: 'Overruns of the label and tooltip lengths of D243 outside the first-level bars, per file; counts only go down (scripts/copy-lint.mjs).', files: Object.fromEntries(Object.entries(files).sort()) }, null, 1) + '\n')
    console.log(`register → scripts/copy-lint.baseline.json (${Object.keys(files).length} files)`)
  }
  const reg = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).files : {}
  const problems = []
  for (const f of findings.filter(x => x.kind === 'word')) problems.push(`${f.file}: banned word in "${f.text}" (${f.detail})`)
  for (const [file, c] of Object.entries(count)) {
    const allowed = FIRST_LEVEL.includes(file) ? { label: 0, tooltip: 0 } : reg[file] ?? { label: 0, tooltip: 0 }
    for (const kind of ['label', 'tooltip']) {
      if (c[kind] > allowed[kind]) {
        problems.push(`${file}: ${c[kind]} ${kind}(s) over the limit, ${allowed[kind]} registered:`)
        for (const f of findings.filter(x => x.file === file && x.kind === kind)) problems.push(`    "${f.text}" — ${f.detail}`)
      }
    }
  }
  let slack = 0
  for (const [file, a] of Object.entries(reg)) for (const kind of ['label', 'tooltip']) if ((count[file]?.[kind] ?? 0) < a[kind]) slack++
  if (args.has('--list')) for (const f of findings.filter(x => x.kind !== 'word')) console.log(`${f.file}: ${f.kind} "${f.text}" — ${f.detail}`)
  for (const p of problems) console.log(`copy-lint: ${p}`)
  const total = findings.filter(x => x.kind !== 'word').length
  console.log(`copy-lint: ${Object.keys(count).length ? total : 0} registered overrun(s) in ${Object.keys(reg).length} file(s)${slack ? ` (${slack} can be tightened with --update)` : ''}; first level: 0 allowed; ${problems.length ? problems.filter(p => !p.startsWith('    ')).length : 0} problem(s)`)
  process.exit(problems.length ? 1 : 0)
}
