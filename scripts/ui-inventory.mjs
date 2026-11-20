#!/usr/bin/env node
/**
 * Feature inventory of the interface (26.64, D246): every control that carries a `data-ui`, every menu item and every
 * command of the global search, read from the source. The snapshot of 26.63 (tests/fixtures/inventory-26.63.json) was
 * taken before the 26.64 shell work began; tests/shell/inventory2664.test.ts requires each of its entries to exist in
 * the current source or to have a destination in src/app/inventoryMap.ts.
 *
 *   node scripts/ui-inventory.mjs                     summary of the current source
 *   node scripts/ui-inventory.mjs --snapshot <file>   write the inventory as JSON
 *
 * Entries:
 *   dataUi     `{ id, file }` — a static `data-ui="x"`, or `{ expr, file }` for a bound one (`:data-ui="…"`)
 *   menuItems  `{ label, file }` — the Chinese source text of each `role="menuitem"` control
 *   commands   `{ cat, title }` — the commands the global search adds one by one (`add('page', …, tl('…'))`)
 *   sources    the collections the global search lists entry by entry (templates, labs, formulas …)
 *   tools      the tool ids of the studio palette
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const require = createRequire(import.meta.url)
const sfc = require(join(repo, 'node_modules/@vue/compiler-sfc'))

function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkFiles(p, out)
    else if (/\.(ts|vue)$/.test(name)) out.push(p)
  }
  return out
}

/** First `tl('…')` text of an expression or a subtree of template nodes. */
function firstText(src) {
  const m = /\btl\(\s*(['"`])((?:\\.|(?!\1).)*)\1/.exec(src)
  return m ? m[2] : null
}

function nodeSource(node) {
  return node.loc?.source ?? ''
}

/** The inventory of the source tree at `root` (the repository by default). */
export function collectInventory(root = repo) {
  const dataUi = [], menuItems = [], commands = [], sources = [], tools = []
  for (const p of walkFiles(join(root, 'src'))) {
    const file = relative(root, p).split('\\').join('/')
    const src = readFileSync(p, 'utf8')
    if (file.endsWith('.vue')) {
      const { descriptor } = sfc.parse(src)
      if (descriptor.template?.ast) {
        const walk = node => {
          if (node.type === 1) {
            for (const pr of node.props) {
              if (pr.type === 6 && pr.name === 'data-ui' && pr.value) dataUi.push({ id: pr.value.content, file })
              else if (pr.type === 7 && pr.name === 'bind' && pr.arg?.content === 'data-ui' && pr.exp) dataUi.push({ expr: pr.exp.content, file })
            }
            const role = node.props.find(pr => pr.type === 6 && pr.name === 'role')
            if (role?.value?.content === 'menuitem' || role?.value?.content === 'menuitemradio' || role?.value?.content === 'menuitemcheckbox') {
              const label = firstText(nodeSource(node))
              if (label) menuItems.push({ label, file })
            }
          }
          for (const c of node.children ?? []) walk(c)
          for (const b of node.branches ?? []) walk(b)
        }
        walk(descriptor.template.ast)
      }
      if (file.endsWith('CommandPalette.vue')) {
        const code = (descriptor.scriptSetup ?? descriptor.script)?.content ?? ''
        for (const line of code.split('\n')) {
          const one = /^\s*add\('([a-z]+)',\s*'[^']*',\s*tl\('((?:\\.|[^'])*)'/.exec(line)
          if (one) { commands.push({ cat: one[1], title: one[2] }); continue }
          const many = /^\s*for \(const (?:\w+|\[[^\]]+\]) of ([A-Za-z_.()]+)\)(?: for \(const \w+ of [\w.]+\))? add\('([a-z]+)'/.exec(line)
          if (many) sources.push({ cat: many[2], from: many[1] })
        }
      }
    } else if (file === 'src/app/tools.ts') {
      for (const m of src.matchAll(/\btool: '([a-z-]+)'/g)) tools.push(m[1])
    }
  }
  const key = e => JSON.stringify(e)
  const uniq = list => [...new Map(list.map(e => [key(e), e])).values()].sort((a, b) => key(a).localeCompare(key(b)))
  return { dataUi: uniq(dataUi), menuItems: uniq(menuItems), commands: uniq(commands), sources: uniq(sources), tools: [...new Set(tools)].sort() }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inv = collectInventory()
  const i = process.argv.indexOf('--snapshot')
  if (i >= 0) {
    const out = resolve(process.argv[i + 1])
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify({ taken: process.argv[i + 2] ?? null, ...inv }, null, 1) + '\n')
    console.log(`inventory → ${relative(repo, out)}`)
  }
  console.log(`${inv.dataUi.length} data-ui, ${inv.menuItems.length} menu items, ${inv.commands.length} commands, ${inv.sources.length} listed collections, ${inv.tools.length} tools`)
}
