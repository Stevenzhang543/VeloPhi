/**
 * Where the encyclopedia is (26.64, D271): the periodic table, the page of an element or the page of a substance —
 * one small reactive state shared by the chemistry panel (where the encyclopedia covers the bench while it is open),
 * the library's section 元素与物质, the global search and the address.
 *
 * Address: `#e=<symbol>` is an element page (`#e=Cu`), `#m=<id>` a substance page (`#m=ethanol`; `#s=` is taken by the scene links, the id written with
 * encodeURIComponent), `#e` alone the periodic table. A link opens the page it names (App.vue shows the chemistry
 * panel, as for the bench links `#b=`); while the encyclopedia is shown the address follows it, and it is cleaned
 * when the encyclopedia is left.
 *
 * Hooks for the neighbouring work packages — both are plain function slots, so nothing here imports their code:
 *  - `nuclide:<Z>-<A>` — the nuclide page of an isotope (D276, the chart of nuclides). `setNuclideOpener` registers
 *    the function that shows it; until one is registered `canOpenNuclide()` is false and the isotope table shows
 *    its rows without links.
 *  - the reactor workshop under 物理实验 › 原子与核 (D277), reached from the page of uranium. `setReactorOpener`
 *    registers the function that opens it; until then `openReactor()` shows the physics panel.
 *
 * No chemistry data are imported here: the module is part of the start-up bundle (the search and App.vue use it).
 */
import { reactive } from 'vue'

export type EncyView = { kind: 'table' } | { kind: 'element'; symbol: string } | { kind: 'substance'; id: string }

export const ency = reactive<{
  /** The encyclopedia covers the bench of the chemistry panel. */
  open: boolean
  view: EncyView
  /** Views left behind (for "back"). */
  trail: EncyView[]
  /** A reagent to put on the bench (the chemistry page acts on it and counts `n` up). */
  bench: { n: number; reagent: string | null }
}>({ open: false, view: { kind: 'table' }, trail: [], bench: { n: 0, reagent: null } })

const same = (a: EncyView, b: EncyView) => a.kind === b.kind && (a as { symbol?: string }).symbol === (b as { symbol?: string }).symbol && (a as { id?: string }).id === (b as { id?: string }).id

/** Show a view; the one shown before is remembered for "back". */
export function showEncy(view: EncyView) {
  if (same(view, ency.view)) return
  ency.trail.push(ency.view)
  if (ency.trail.length > 40) ency.trail.shift()
  ency.view = view
}
export const openTable = () => showEncy({ kind: 'table' })
export const openElement = (symbol: string) => showEncy({ kind: 'element', symbol })
export const openSubstance = (id: string) => showEncy({ kind: 'substance', id })

/** Back to the view shown before; the periodic table when there is none. */
export function encyBack() {
  const prev = ency.trail.pop()
  ency.view = prev ?? { kind: 'table' }
}

/** The view an address fragment names; null when it is not one of the encyclopedia. */
export function parseEncyHash(hash: string): EncyView | null {
  const m = /^#([em])(?:=(.*))?$/.exec(hash)
  if (!m) return null
  let value = ''
  try { value = decodeURIComponent(m[2] ?? '') } catch { return null }
  if (m[1] === 'e') return value ? (/^[A-Z][a-z]?$/.test(value) ? { kind: 'element', symbol: value } : null) : { kind: 'table' }
  return value ? { kind: 'substance', id: value } : null
}

/** The address fragment of a view. */
export function encyHash(view: EncyView): string {
  return view.kind === 'element' ? `#e=${view.symbol}` : view.kind === 'substance' ? `#m=${encodeURIComponent(view.id)}` : '#e'
}

/** Open the view an address fragment names in the chemistry panel; false when the fragment is not one of ours. */
export function openEncyFromHash(hash: string): boolean {
  const view = parseEncyHash(hash)
  if (!view) return false
  ency.view = view
  ency.open = true
  return true
}

/** Write the view into the address (no history entry), or clean the address when the encyclopedia is left. */
export function syncEncyHash(view: EncyView | null) {
  if (typeof location === 'undefined' || typeof history === 'undefined') return
  const ours = parseEncyHash(location.hash) !== null
  try {
    if (view) { if (location.hash !== encyHash(view) && (ours || !location.hash)) history.replaceState(null, '', location.pathname + location.search + encyHash(view)) }
    else if (ours) history.replaceState(null, '', location.pathname + location.search)
  } catch { /* the address only */ }
}

/** Ask the bench of the chemistry panel to take a reagent (the encyclopedia closes, the amount dialog opens). */
export function putOnBench(reagent: string) { ency.bench.reagent = reagent; ency.bench.n++ }

// ---- Hook: the nuclide page (D276) ----

let nuclideOpener: ((z: number, a: number) => void) | null = null
const hooks = reactive({ nuclide: false, reactor: false })

/** Register the function that shows the nuclide page of an isotope (the chart of nuclides). */
export function setNuclideOpener(open: ((z: number, a: number) => void) | null) { nuclideOpener = open; hooks.nuclide = !!open }
export function canOpenNuclide(): boolean { return hooks.nuclide }
/** Follow a route `nuclide:<Z>-<A>`; false when no nuclide page is registered or the route is not one. */
export function openNuclideRoute(route: string): boolean {
  const m = /^nuclide:(\d+)-(\d+)$/.exec(route)
  if (!m || !nuclideOpener) return false
  nuclideOpener(Number(m[1]), Number(m[2]))
  return true
}

// ---- Hook: the reactor workshop (D277) ----

let reactorOpener: (() => void) | null = null
/** Register the function that opens the reactor workshop (物理实验 › 原子与核). */
export function setReactorOpener(open: (() => void) | null) { reactorOpener = open; hooks.reactor = !!open }
export function hasReactorWorkshop(): boolean { return hooks.reactor }
/** Open the reactor workshop; false when it is not registered (the caller then shows the physics panel). */
export function openReactor(): boolean {
  if (!reactorOpener) return false
  reactorOpener()
  return true
}
