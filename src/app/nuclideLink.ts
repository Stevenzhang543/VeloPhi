/**
 * Entries to the nuclide pages and the reactor workshop from elsewhere (26.64, D276, D277). Both live in the physics
 * panel under 原子与核; this module is the small surface other work packages call:
 *
 *   openNuclide(z, a)          the page of the nuclide with Z = z and mass number a on the chart of nuclides
 *   openNuclideId('Tc-99m')    the same by the id of the nuclide table; `chain: true` shows its decay chain
 *   openNuclideChart()         the chart alone
 *   openReactorWorkshop()      the reactor workshop
 *
 * `installNuclearLinks()` (App.vue, once) registers the first and the last with the hooks of the encyclopedia
 * (`nuclide:<Z>-<A>` on the isotope table of an element page, the workshop on the page of uranium) and opens what
 * the address names: `#n=U-235`, `#n=U-238;chain`, `#n` (src/nuclear/link.ts). No data are loaded here — the module
 * is part of the start-up bundle; the chart loads the nuclide table when it is shown.
 */
import { reactive } from 'vue'
import { state } from './store'
import { settings } from './settings'
import { setNuclideOpener, setReactorOpener } from '../chem/ency/route'
import type { NuclideTarget } from '../nuclear/link'
import { nuclideHash, parseNuclideHash } from '../nuclear/link'

export const NUCLIDES_LAB = 'nuclides'
export const REACTOR_LAB = 'reactor'

/**
 * What the chart of nuclides is asked to show; it acts when `seq` changes and notes the request it served in `done`
 * (the page is mounted again when the language changes, and must not serve an old request twice).
 */
export const nuclideRequest = reactive<{ nuclide: string | null; chain: boolean; seq: number; done: number }>({ nuclide: null, chain: false, seq: 0, done: 0 })

function show(target: NuclideTarget) {
  nuclideRequest.nuclide = target.nuclide
  nuclideRequest.chain = target.chain
  nuclideRequest.seq++
  settings.ui.lab = NUCLIDES_LAB
  state.page = 'lab'
}

export function openNuclide(z: number, a: number, isomer: '' | 'm' | 'n' = '') { show({ nuclide: `${z}-${a}${isomer}`, chain: false }) }
export function openNuclideId(id: string, opts: { chain?: boolean } = {}) { show({ nuclide: id, chain: !!opts.chain }) }
export function openNuclideChart() { show({ nuclide: null, chain: false }) }
export function openReactorWorkshop() { settings.ui.lab = REACTOR_LAB; state.page = 'lab' }

/** Open what an address fragment names; false when it is not a nuclide address. */
export function openNuclideFromHash(hash: string): boolean {
  const target = parseNuclideHash(hash)
  if (!target) return false
  show(target)
  return true
}

/** Write the nuclide shown into the address (no history entry); `null` cleans a nuclide address. */
export function syncNuclideHash(target: NuclideTarget | null) {
  if (typeof location === 'undefined' || typeof history === 'undefined') return
  const ours = parseNuclideHash(location.hash) !== null
  try {
    if (target) { if (location.hash !== nuclideHash(target) && (ours || !location.hash)) history.replaceState(null, '', location.pathname + location.search + nuclideHash(target)) }
    else if (ours) history.replaceState(null, '', location.pathname + location.search)
  } catch { /* the address only */ }
}

let installed = false
export function installNuclearLinks() {
  if (installed) return
  installed = true
  setNuclideOpener((z, a) => openNuclide(z, a))
  setReactorOpener(() => openReactorWorkshop())
  if (typeof location === 'undefined') return
  openNuclideFromHash(location.hash)
  if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { openNuclideFromHash(location.hash) })
}
