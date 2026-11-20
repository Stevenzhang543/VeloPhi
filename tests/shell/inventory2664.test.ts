/**
 * 26.64 (D246, "功能一个不少"): nothing the 26.63 interface offered is lost. The snapshot
 * tests/fixtures/inventory-26.63.json lists every control with a `data-ui`, every menu item and every command of the
 * global search of 26.63 (scripts/ui-inventory.mjs reads them from the source). Every entry must either still be in
 * the current source — the same id, label or title in the same component file (a file moved to another folder is
 * still the same component) — or have a row in src/app/inventoryMap.ts that
 * says where it went; that destination must exist in the current source, and the feature must be reachable from the
 * global search (the row's `command` is a command there). Collections the search lists entry by entry (templates,
 * labs, formulas …) and the tools of the palette must all still be there.
 *
 * A failure names the entry: either restore it, or add its row to the map (and a command to CommandPalette.vue).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-expect-error — plain ES module of the build scripts
import { collectInventory } from '../../scripts/ui-inventory.mjs'
import { INVENTORY_MOVES, IS_SEARCH } from '../../src/app/inventoryMap'
import type { InventoryMove } from '../../src/app/inventoryMap'

interface DataUi { id?: string; expr?: string; file: string }
interface MenuItem { label: string; file: string }
interface Command { cat: string; title: string }
interface Inventory { dataUi: DataUi[]; menuItems: MenuItem[]; commands: Command[]; sources: Array<{ cat: string; from: string }>; tools: string[] }

const old = JSON.parse(readFileSync('tests/fixtures/inventory-26.63.json', 'utf8')) as Inventory & { taken: string }
const now = collectInventory() as Inventory

const uiKey = (e: DataUi) => e.id ?? e.expr ?? ''
/** The same component, wherever its file is kept: a component moved to another folder has not moved for the user. */
const sameFile = (a: string, b: string) => a === b || a.split('/').pop() === b.split('/').pop()
const hasUi = (key: string, file?: string) => now.dataUi.some(e => uiKey(e) === key && (!file || sameFile(e.file, file)))
const hasMenu = (label: string, file?: string) => now.menuItems.some(e => e.label === label && (!file || sameFile(e.file, file)))
const hasCommand = (title: string) => now.commands.some(c => c.title === title)

/** The row of the map for an entry, if any. */
function moveOf(kind: InventoryMove['kind'], from: string, file?: string): InventoryMove | undefined {
  return INVENTORY_MOVES.find(m => m.kind === kind && m.from === from && (!m.fromFile || !file || m.fromFile === file))
}
/** What is wrong with a row's destination ('' when it is fine). */
function destinationProblem(m: InventoryMove): string {
  const t = m.to
  const targets = [t.dataUi !== undefined, t.menuItem !== undefined, t.command !== undefined].filter(Boolean).length
  if (targets !== 1) return 'the row names no destination, or more than one'
  if (t.dataUi !== undefined && !hasUi(t.dataUi, t.file)) return `data-ui "${t.dataUi}" is not in ${t.file ?? 'the source'}`
  if (t.menuItem !== undefined && !hasMenu(t.menuItem, t.file)) return `menu item "${t.menuItem}" is not in ${t.file ?? 'the source'}`
  if (t.command !== undefined && !hasCommand(t.command)) return `command "${t.command}" is not in the global search`
  if (m.command !== IS_SEARCH && !hasCommand(m.command)) return `the global search has no command "${m.command}"`
  return ''
}

describe('feature inventory (26.64, D246)', () => {
  it('the snapshot is the one of 26.63 and is not empty', () => {
    expect(old.taken).toBe('26.63.0')
    expect(old.dataUi.length).toBeGreaterThan(70)
    expect(old.menuItems.length).toBeGreaterThan(25)
    expect(old.commands.length).toBeGreaterThan(15)
    expect(old.tools.length).toBeGreaterThan(40)
  })

  it('every control with a data-ui is where it was, or the map says where it went', () => {
    const lost: string[] = []
    for (const e of old.dataUi) {
      if (hasUi(uiKey(e), e.file)) continue
      const m = moveOf('dataUi', uiKey(e), e.file)
      if (!m) { lost.push(`${uiKey(e)} (${e.file}): gone, and src/app/inventoryMap.ts has no row for it`); continue }
      const bad = destinationProblem(m)
      if (bad) lost.push(`${uiKey(e)} (${e.file}): ${bad}`)
    }
    expect(lost).toEqual([])
  })

  it('every menu item is where it was, or the map says where it went', () => {
    const lost: string[] = []
    for (const e of old.menuItems) {
      if (hasMenu(e.label, e.file)) continue
      const m = moveOf('menuItem', e.label, e.file)
      if (!m) { lost.push(`${e.label} (${e.file}): gone, and src/app/inventoryMap.ts has no row for it`); continue }
      const bad = destinationProblem(m)
      if (bad) lost.push(`${e.label} (${e.file}): ${bad}`)
    }
    expect(lost).toEqual([])
  })

  it('every command of the global search is still there, or the map names its successor', () => {
    const lost: string[] = []
    for (const c of old.commands) {
      if (hasCommand(c.title)) continue
      const m = moveOf('command', c.title)
      if (!m) { lost.push(`${c.title}: gone, and src/app/inventoryMap.ts has no row for it`); continue }
      const bad = destinationProblem(m)
      if (bad) lost.push(`${c.title}: ${bad}`)
    }
    expect(lost).toEqual([])
  })

  it('the search still lists every collection, and the palette every tool', () => {
    const sources = (inv: Inventory) => inv.sources.map(s => `${s.cat}:${s.from}`)
    expect(sources(old).filter(s => !sources(now).includes(s))).toEqual([])
    expect(old.tools.filter(t => !now.tools.includes(t))).toEqual([])
  })

  it('every row of the map is about an entry of the snapshot, points at something that exists, and is searchable', () => {
    const bad: string[] = []
    for (const m of INVENTORY_MOVES) {
      const known = m.kind === 'dataUi' ? old.dataUi.some(e => uiKey(e) === m.from && (!m.fromFile || e.file === m.fromFile))
        : m.kind === 'menuItem' ? old.menuItems.some(e => e.label === m.from && (!m.fromFile || e.file === m.fromFile))
          : old.commands.some(c => c.title === m.from)
      if (!known) bad.push(`${m.kind} "${m.from}": not an entry of the 26.63 snapshot`)
      const p = destinationProblem(m)
      if (p) bad.push(`${m.kind} "${m.from}": ${p}`)
      if (!m.note.trim()) bad.push(`${m.kind} "${m.from}": no note`)
    }
    expect(bad).toEqual([])
  })

  it('what the new shell added is searchable too (D243: the global search finds everything)', () => {
    // the five panels, the home page, the classroom section, elements and substances, open from a link, projection
    for (const title of ['运动', '物理实验', '化学实验', '资源库', '渲染与监视', '首页', '设置', '课堂', '元素与物质', '从链接打开', '课堂投影', '新建场景', '打开文件…', '模板库', '题目库', '参数扫描']) expect(hasCommand(title), title).toBe(true)
    for (const ui of ['page-home', 'home-continue', 'home-open', 'home-tour', 'open-link', 'teach', 'tally', 'projector', 'classroom-tally', 'stage-catalogue', 'stage-more', 'chem-page', 'tier-notice']) expect(hasUi(ui), ui).toBe(true)
  })
})
