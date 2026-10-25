/**
 * Extract the interface texts (manual 26.50, D27): every Chinese string literal of the source — the arguments of
 * `tl(…)` and the module-level tables read through `trDeep` — with its locations. Inline trilingual content
 * (`{ zh, en, de }` objects, `T(…)`, `tri(…)`, `st(…)` calls, the derivations folder) and the i18n tables are
 * skipped. Template literals with Chinese text that are not wrapped in `tl` are reported as problems.
 *
 *   node scripts/i18n-keys.mjs                 summary
 *   node scripts/i18n-keys.mjs --missing en    keys without an English entry (JSON), likewise de
 *
 * Used by tests/i18n.test.ts.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const require = createRequire(import.meta.url)
const ts = require(join(repo, 'node_modules/typescript'))
const sfc = require(join(repo, 'node_modules/@vue/compiler-sfc'))

const CJK = /[\u4e00-\u9fff]/
const SKIP_CALLEES = new Set(['T', 'tri', 'st', 'pick', 'msg'])

function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkFiles(p, out)
    else if (/\.(ts|vue)$/.test(name)) out.push(p)
  }
  return out
}

/** Keys and problems of one piece of TS/JS code. */
function scanCode(code, file, keys, problems) {
  const sf = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const inSkippedCall = n => {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isCallExpression(p) && SKIP_CALLEES.has(p.expression.getText(sf))) return true
      if (ts.isPropertyAssignment(p) && ['zh', 'en', 'de'].includes(p.name.getText(sf)) && p.initializer && n.pos >= p.initializer.pos) return true
    }
    return false
  }
  const visit = n => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && CJK.test(n.text)) {
      if (!inSkippedCall(n) && !ts.isLiteralTypeNode(n.parent) && !(ts.isImportDeclaration(n.parent))) add(keys, n.text, file)
      return
    }
    if (ts.isTemplateExpression(n)) {
      const parts = [n.head.text, ...n.templateSpans.map(s => s.literal.text)]
      if (parts.some(p => CJK.test(p)) && !inSkippedCall(n)) problems.push(`${file}: template literal with Chinese text not wrapped in tl(): ${n.getText(sf).slice(0, 80)}`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}

function add(keys, text, file) {
  const e = keys.get(text)
  if (e) e.files.add(file)
  else keys.set(text, { files: new Set([file]) })
}

/** All keys: Map<text, { files }>, and problems. */
export function extractKeys() {
  const keys = new Map()
  const problems = []
  for (const p of walkFiles(join(repo, 'src'))) {
    const file = relative(repo, p).split('\\').join('/')
    if (file.startsWith('src/i18n/') || file.startsWith('src/formula/derivations/')) continue
    const src = readFileSync(p, 'utf8')
    if (!CJK.test(src)) continue
    if (file.endsWith('.vue')) {
      const { descriptor } = sfc.parse(src)
      for (const s of [descriptor.script, descriptor.scriptSetup]) if (s) scanCode(s.content, file, keys, problems)
      if (descriptor.template) {
        const walk = node => {
          if (node.type === 1) {
            for (const pr of node.props) {
              if (pr.type === 6 && pr.value && CJK.test(pr.value.content)) problems.push(`${file}: static attribute with Chinese text: ${pr.name}="${pr.value.content.slice(0, 40)}"`)
              else if (pr.type === 7 && pr.exp && CJK.test(pr.exp.content)) scanCode(`(${pr.exp.content})`, file, keys, problems)
            }
          }
          if (node.type === 2 && CJK.test(node.content)) problems.push(`${file}: template text not wrapped in tl(): ${node.content.trim().slice(0, 60)}`)
          if (node.type === 5 && CJK.test(node.content.content)) scanCode(`(${node.content.content})`, file, keys, problems)
          for (const c of node.children ?? []) walk(c)
          for (const b of node.branches ?? []) walk(b)
        }
        walk(descriptor.template.ast)
      }
    } else scanCode(src, file, keys, problems)
  }
  return { keys, problems }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { keys, problems } = extractKeys()
  const i = process.argv.indexOf('--missing')
  if (i >= 0) {
    const lang = process.argv[i + 1]
    const table = (await import(pathToFileURL(join(repo, `.cache/i18n-${lang}.mjs`)).href).catch(() => ({ T: {} }))).T
    const miss = [...keys.keys()].filter(k => !(k in table))
    console.log(JSON.stringify(miss, null, 1))
  } else {
    console.log(`${keys.size} keys, ${problems.length} problems`)
    for (const p of problems) console.log('  ' + p)
  }
}
