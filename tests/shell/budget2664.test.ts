/**
 * 26.64 (D243, "第一层预算"): the first level of every page is counted from the components' own templates.
 *
 *   bar          at most 7 controls. The three experiment panels are counted the way their skeleton lays them out
 *                (StageLayout.vue): the catalogue button, every top-level element the page puts into the `bar` and
 *                `run` slots, AI, 更多, the inspector switch. The context bar (TopBar.vue: 运动, the phone bar, the
 *                other pages) is counted by its `data-bar-item` marks — and no control of it may be outside a mark,
 *                so the marks cannot under-count. A mark with `data-bar-group` is one control of several parts
 *                (撤销 / 重做, 搭建 / 仿真 / 分析, 运行 with its solver badge).
 *   tool strip   six tools and 全部工具 (D245).
 *   labels       the texts of the bars' buttons and tabs: at most 4 Chinese characters, 14 English, 18 German.
 *   tooltips     of the bars' controls: one phrase, at most 14 Chinese characters before the shortcut.
 *   internal ids none (`E08 · L1`) outside a second-level layer of the physics page.
 *   primary      at most one solid accent button on a bar.
 *
 * What a script cannot count (an open inspector beside an open catalogue, the one tag of a list row) is looked at in
 * the screenshots of scripts/shell-states.mjs.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { STRIP } from '../../src/app/tools'
import { STUDIO_MODES } from '../../src/app/layout'
import { tIn } from '../../src/i18n'

const sfc = createRequire(import.meta.url)('@vue/compiler-sfc') as typeof import('@vue/compiler-sfc')

interface Prop { type: number; name: string; value?: { content: string }; arg?: { content: string }; exp?: { content: string }; rawName?: string }
interface Node { type: number; tag?: string; props?: Prop[]; children?: Node[]; branches?: Node[]; loc?: { source: string } }

const C = 'src/app/components/'
function template(file: string): Node {
  const ast = sfc.parse(readFileSync(file, 'utf8')).descriptor.template?.ast
  if (!ast) throw new Error(`${file} has no template`)
  return ast as unknown as Node
}
const kids = (n: Node): Node[] => [...(n.children ?? []), ...(n.branches ?? [])]
const attr = (n: Node, name: string) => n.props?.find(p => p.type === 6 && p.name === name)?.value?.content
const has = (n: Node, name: string) => !!n.props?.some(p => (p.type === 6 && p.name === name) || (p.type === 7 && p.name === 'bind' && p.arg?.content === name))
const slotName = (n: Node) => n.props?.find(p => p.type === 7 && p.name === 'slot')?.arg?.content
function find(n: Node, pred: (x: Node) => boolean, out: Node[] = []): Node[] {
  if (n.type === 1 && pred(n)) out.push(n)
  for (const c of kids(n)) find(c, pred, out)
  return out
}
/** Elements (and components) that are direct children of a node, looking through `<template>`, v-if and v-for wrappers. */
function elements(n: Node): Node[] {
  const out: Node[] = []
  for (const c of kids(n)) {
    if (c.type === 1 && c.tag !== 'template') out.push(c)
    else if (c.type === 1 || c.type === 9 || c.type === 10 || c.type === 11) out.push(...elements(c))
  }
  return out
}
/** A second-level layer: a menu, a popover, a dialog. */
const isLayer = (n: Node) => ['menu', 'dialog', 'listbox'].includes(attr(n, 'role') ?? '') || (attr(n, 'class') ?? '').split(/\s+/).some(c => ['menu', 'popover', 'apop', 'flyout'].includes(c))
const CONTROLS = new Set(['button', 'input', 'select', 'a', 'textarea', 'TeachMenu', 'SolverBadge'])
/** Controls of the first level under a node: not inside a layer. */
function firstLevel(n: Node, out: Node[] = []): Node[] {
  for (const c of kids(n)) {
    if (c.type === 1 && isLayer(c)) continue
    if (c.type === 1 && CONTROLS.has(c.tag ?? '')) out.push(c)
    // what a page puts into the teaching menu's slot are items of that menu
    if (c.tag !== 'TeachMenu') firstLevel(c, out)
  }
  return out
}
/** Every `tl('…')` text of a node's own source, outside its layers. */
function texts(n: Node, what: 'label' | 'title'): string[] {
  const out: string[] = []
  const visit = (x: Node) => {
    if (x.type === 1 && (isLayer(x) || x.tag === 'TeachMenu')) return
    if (x.type === 1 && what === 'title') {
      const t = x.props?.find(p => p.type === 7 && p.name === 'bind' && p.arg?.content === 'title')?.exp?.content ?? ''
      for (const m of t.matchAll(/\btl\('((?:\\.|[^'])*)'/g)) out.push(m[1])
    }
    if (what === 'label' && (x.type === 5 || x.type === 2)) for (const m of (x.loc?.source ?? '').matchAll(/\btl\('((?:\\.|[^'])*)'/g)) out.push(m[1])
    for (const c of kids(x)) visit(c)
  }
  visit(n)
  return out
}

const BUDGET = 7

describe('the bar of an experiment panel (26.64, D243: at most 7 controls)', () => {
  const stage = template(`${C}StageLayout.vue`)
  it('the skeleton has the four fixed controls the count assumes', () => {
    for (const ui of ['stage-catalogue', 'stage-ai', 'stage-more', 'stage-inspector']) expect(find(stage, n => attr(n, 'data-ui') === ui).length, ui).toBe(1)
  })

  for (const [name, file] of [['化学实验', `${C}chem/ChemPage.vue`], ['物理实验', `${C}lab/LabPage.vue`]] as const) {
    it(`${name}: catalogue + bar + run + AI + 更多 + inspector ≤ ${BUDGET}`, () => {
      const page = template(file)
      const layout = find(page, n => n.tag === 'StageLayout')
      expect(layout.length).toBe(1)
      const slots = kids(layout[0]).filter(n => n.type === 1 && n.tag === 'template')
      const slot = (id: string) => slots.find(s => slotName(s) === id)
      const parts = {
        catalogue: has(layout[0], 'catalogue') ? 1 : 0,
        bar: slot('bar') ? elements(slot('bar')!).length : 0,
        run: slot('run') ? elements(slot('run')!).length : 0,
        ai: has(layout[0], 'ai') ? 1 : 0,
        more: slot('more') ? 1 : 0,
        inspector: has(layout[0], 'tabs') ? 1 : 0
      }
      const total = Object.values(parts).reduce((a, b) => a + b, 0)
      expect(total, JSON.stringify(parts)).toBeLessThanOrEqual(BUDGET)
      expect(total).toBeGreaterThanOrEqual(4)
      // one of them opens the second level
      expect(parts.more).toBe(1)
    })
  }
})

describe('the context bar (26.64, D243, D245)', () => {
  const bar = find(template(`${C}TopBar.vue`), n => n.tag === 'header')[0]
  const items = find(bar, n => has(n, 'data-bar-item'))
  const of = (kind: string) => items.filter(n => (attr(n, 'data-bar-item') ?? '').split(' ').includes(kind))

  // 26.65 (D291): the three layout presets are gone and the sidebar's views (属性 · 分析 · AI) are one group on the bar
  it('运动: 文件 · 撤销/重做 · 模板 ‖ 运行 · 侧栏的视图 · 更多 — six, in this order', () => {
    const studio = of('studio')
    expect(studio.length).toBeLessThanOrEqual(BUDGET)
    expect(studio.length).toBe(6)
    const ids = studio.map(n => attr(n, 'data-ui') ?? find(n, x => !!attr(x, 'data-ui') && !isLayerInside(n, x))[0]?.props?.find(p => p.name === 'data-ui')?.value?.content ?? attr(n, 'class'))
    expect(ids).toEqual(['file', 'undo', 'templates', 'run', 'views', 'studio-more'])
  })
  /** `x` is inside a layer of `root`. */
  function isLayerInside(root: Node, x: Node): boolean {
    const walk = (n: Node, layered: boolean): boolean | null => {
      if (n === x) return layered
      for (const c of kids(n)) { const r = walk(c, layered || (c.type === 1 && isLayer(c))); if (r !== null) return r }
      return null
    }
    return walk(root, false) === true
  }

  it('the other pages and the phone bar are within the budget too', () => {
    expect(of('page').length).toBeLessThanOrEqual(BUDGET)
    // 26.65 (D290): only the monitor has a bar of its own besides the studio (its run button); the experiment panels
    // have none on the desktop — their name is the rail's selected item, their search is the rail's
    expect(of('page').length).toBeGreaterThanOrEqual(1)
    expect(of('phone').length).toBeLessThanOrEqual(BUDGET)
    expect(of('phone').length).toBeGreaterThanOrEqual(3)
  })

  it('no control of the bar is outside a counted item, and only a group holds more than one', () => {
    const inside = new Set(items.flatMap(i => firstLevel(i).concat(CONTROLS.has(i.tag ?? '') ? [i] : [])))
    const stray = firstLevel(bar).filter(n => !inside.has(n)).map(n => n.loc?.source.slice(0, 80))
    expect(stray).toEqual([])
    for (const i of items) {
      const n = firstLevel(i).length + (CONTROLS.has(i.tag ?? '') ? 1 : 0)
      if (!has(i, 'data-bar-group')) expect(n, i.loc?.source.slice(0, 80)).toBe(1)
    }
  })

  it('what 26.63 kept on the bar is one level down, in 更多, under the four names', () => {
    const more = of('studio').find(n => find(n, x => attr(x, 'data-ui') === 'studio-more').length)!
    const layer = find(more, isLayer)[0]
    expect(find(layer, n => attr(n, 'role') === 'tab').map(n => attr(n, 'data-ui'))).toEqual(['problems', 'view', 'teach', 'compute'])
    for (const ui of ['problems-open', 'sidebar', 'theme', 'sweep', 'convergence']) expect(find(layer, n => attr(n, 'data-ui') === ui).length, ui).toBe(1)
    expect(find(layer, n => n.tag === 'TeachMenu' && has(n, 'inline')).length).toBe(1)
    // and none of them is still on the first level
    for (const ui of ['problems', 'view', 'compute', 'sidebar', 'sweep']) expect(firstLevel(bar).some(n => attr(n, 'data-ui') === ui), ui).toBe(false)
  })

  it('one primary button at most', () => {
    expect(firstLevel(bar).filter(n => /\bprimary\b/.test(attr(n, 'class') ?? '')).length).toBeLessThanOrEqual(1)
  })
})

describe('the tool strip (26.64, D245: six tools and 全部工具)', () => {
  it('select, pan, ball, block, incline, spring', () => {
    expect(STRIP.map(t => t.tool)).toEqual(['select', 'pan', 'add-ball', 'add-block', 'add-incline', 'connect-spring'])
  })
  it('the strip itself holds the tools, the tool in use and 全部工具 — nothing else', () => {
    const strip = find(template(`${C}ToolStrip.vue`), n => attr(n, 'data-ui') === 'tools')[0]
    const buttons = firstLevel(strip)
    // the v-for over the six, the tool picked from the palette, the palette
    expect(buttons.length).toBe(3)
    expect(attr(buttons[2], 'data-ui')).toBe('palette')
    // what left the strip is in the flyout, each with a text
    const flyout = find(template(`${C}ToolStrip.vue`), n => attr(n, 'role') === 'dialog')[0]
    expect(find(flyout, n => attr(n, 'data-ui') === 'objects').length).toBe(1)
    expect(find(flyout, n => attr(n, 'class') === 'row').every(r => /\btl\(/.test(r.loc?.source ?? ''))).toBe(true)
    expect(find(flyout, n => attr(n, 'class') === 'row').length).toBe(4)
  })
})

describe('texts of the first level (26.64, D243, D247)', () => {
  const FILES = [`${C}TopBar.vue`, `${C}StageLayout.vue`, `${C}TeachMenu.vue`, `${C}chem/ChemPage.vue`, `${C}lab/LabPage.vue`]
  const bars = FILES.map(f => {
    const t = template(f)
    // the bar of the file: the header, the toolbar, or the slots a page fills
    const roots = f.endsWith('TopBar.vue') ? find(t, n => n.tag === 'header') : f.endsWith('StageLayout.vue') ? find(t, n => attr(n, 'role') === 'toolbar')
      : f.endsWith('TeachMenu.vue') ? find(t, n => attr(n, 'data-ui') === 'teach') : find(t, n => n.tag === 'template' && ['bar', 'run'].includes(slotName(n) ?? ''))
    return { file: f, roots }
  })
  const len = (s: string) => [...s].length

  it('button and tab labels: 4 Chinese characters, 14 English, 18 German', () => {
    const over: string[] = []
    for (const b of bars) for (const r of b.roots) for (const zh of texts(r, 'label')) {
      // a search field's placeholder text is not a label of a button
      if (zh.includes('搜索')) continue
      const en = tIn('en', zh), de = tIn('de', zh)
      if (len(zh) > 4 || len(en) > 14 || len(de) > 18) over.push(`${b.file}: ${zh} / ${en} / ${de}`)
    }
    expect(over).toEqual([])
  })

  it('tooltips: one phrase of at most 14 Chinese characters (a shortcut in brackets does not count)', () => {
    const over: string[] = []
    for (const b of bars) for (const r of b.roots) for (const zh of texts(r, 'title')) {
      const phrase = zh.replace(/（[^（）]*\{0\}[^（）]*）/g, '')
      if (len(phrase) > 14) over.push(`${b.file}: ${zh}`)
    }
    expect(over).toEqual([])
  })

  it('the three modes of 运动 (their texts are data, not template text): labels and tips within the limits', () => {
    for (const m of STUDIO_MODES) {
      expect(len(m.label), m.label).toBeLessThanOrEqual(4)
      expect(len(tIn('en', m.label)), tIn('en', m.label)).toBeLessThanOrEqual(14)
      expect(len(tIn('de', m.label)), tIn('de', m.label)).toBeLessThanOrEqual(18)
      expect(len(m.tip), m.tip).toBeLessThanOrEqual(14)
    }
  })

  it('no internal ids on the first level of the physics page', () => {
    const page = template(`${C}lab/LabPage.vue`)
    const firstLevelSource = (n: Node): string => kids(n).map(c => (c.type === 1 && (isLayer(c) || c.tag === 'template' && ['catalogue', 'more'].includes(slotName(c) ?? '')) ? '' : c.type === 1 ? firstLevelSource(c) + ' ' + (c.props ?? []).map(p => p.exp?.content ?? '').join(' ') : c.loc?.source ?? '')).join(' ')
    const src = firstLevelSource(page)
    // a model id or a maturity level printed as text (`{{ m.id }} · L{{ m.level }}`)
    expect(/\{\{\s*m\.id\s*\}\}|L\{\{\s*m\.level/.test(src)).toBe(false)
  })
})
