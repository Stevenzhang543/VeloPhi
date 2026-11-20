/**
 * What the chemistry bench's interface is in the middle of (26.64, D268): something being carried to a vessel — by
 * dragging, or tapped first and put down by a second tap (the only way on a phone) —, the amount dialog, the actions
 * menu of a vessel. Shared by the page, the canvas, the shelf and the dialog. None of this is part of the document.
 */
import { reactive } from 'vue'
import type { Amount } from '../../../engine/chem'
import { chemFlame, chemSpecies } from '../../../engine/chem'
import { useBench } from '../../../chem/bench'
import { fits, kindName, kindOf } from '../../../chem/apparatus'
import { knownMaterials, reagentName, reagentOf, substanceOf } from '../../../chem/catalog'
import { isFixtureKind } from '../../../chem/rig'
import { tl } from '../../../i18n'
import { showToast } from '../../store'

/** Something on its way to a vessel. */
export interface Carry {
  type: 'reagent' | 'apparatus' | 'pour' | 'connect'
  /** Reagent id or apparatus kind; for `pour` and `connect` the vessel it comes from. */
  id: string
  /** A fixed amount (a pipette), for `pour`. */
  amount?: Amount
  /** Being dragged: the pointer's place in the window. Otherwise it waits for a tap on its target. */
  dragging: boolean
  x: number
  y: number
}

export type DialogSpec =
  | { mode: 'add'; to: string; reagent: string }
  | { mode: 'pour'; from: string; to: string }

/** A short list to choose from, beside a vessel (electrode material, source voltage, load). */
export interface Chooser { vessel: string; kind: 'electrode' | 'source' | 'load'; part: string; options: Array<{ label: string; value: string | number }> }

export const benchUi = reactive({
  carry: null as Carry | null,
  dialog: null as DialogSpec | null,
  /** The actions menu is open for this vessel. */
  menu: null as string | null,
  chooser: null as Chooser | null,
  /** The last transfer, for the stream the canvas draws: counts up with every one. */
  transfer: { n: 0, to: '', from: '' as string | null, drops: false },
  /** Flame tests being shown: per vessel the colour of the flame ('' when the sample does not colour it) and the elements that do. */
  flames: {} as Record<string, { colour: string; elements: string[]; until: number }>,
  /** 26.65 (D297 item 9): a rule of the bench just broken (the alcohol lamp's) — said, labelled as a rule, never done by the model. */
  rule: null as { text: string; until: number } | null
})

/** How a tool for the hand is taken up when it is dropped on the bench from the shelf (set by hand.ts). */
export const handHooks = { take: null as ((kind: string) => void) | null }

/** Say a rule of the bench for a few seconds (the text begins with “规则：”). */
export function ruleNote(text: string) {
  benchUi.rule = { text, until: Date.now() + 5000 }
}

/** The elements in a vessel (those of every species present in more than a trace). */
function elementsIn(vessel: string): string[] {
  const r = useBench().read(vessel)
  if (!r) return []
  const ids = [...(r.species ?? []).filter(x => x.n > 1e-9).map(x => x.id), ...r.solids.map(x => x.id), ...r.liquids.map(x => x.id), ...r.solutes.map(x => x.id)]
  const out = new Set<string>()
  for (const id of ids) {
    let comp = substanceOf(id)?.comp
    if (!comp) { try { comp = chemSpecies({ ids: [id] }).species[0]?.comp } catch { comp = undefined } }
    for (const el of Object.keys(comp ?? {})) out.add(el)
  }
  return [...out]
}

/**
 * A flame test of what is in a vessel: the core gives the colour of a flame holding the elements of the sample
 * (cobalt glass, when it is on the vessel, takes out the elements whose lines it absorbs). Shown for a few seconds;
 * nothing on the bench changes.
 */
export function flameTest(vessel: string) {
  const b = useBench()
  const blocked = new Set(b.extras(vessel).parts.flatMap(p => kindOf(p)?.tool?.blocks ?? []))
  const elements = elementsIn(vessel).filter(e => !blocked.has(e))
  let colour = '', seen: string[] = []
  try {
    const f = chemFlame(elements)
    if (f.rgb) { colour = `rgb(${f.rgb[0]}, ${f.rgb[1]}, ${f.rgb[2]})`; seen = [...new Set(f.lines.map(l => l.element))] }
  } catch (e) { showToast(tl('操作未执行：{0}', [(e as Error).message]), true); return }
  benchUi.flames = { ...benchUi.flames, [vessel]: { colour, elements: seen, until: Date.now() + 5000 } }
  setTimeout(() => { const now = Date.now(); benchUi.flames = Object.fromEntries(Object.entries(benchUi.flames).filter(([, x]) => x.until > now)) }, 5100)
}

/** What is being carried, in words (the hint over the bench). */
export function carryText(c: Carry): string {
  const b = useBench()
  if (c.type === 'reagent') return tl('点选容器：加入{0}', [reagentName(reagentOf(c.id), c.id)])
  if (c.type === 'apparatus') return kindOf(c.id)?.vessel || isFixtureKind(c.id) ? tl('点选位置：放置{0}', [kindName(kindOf(c.id))]) : tl('点选容器：装上{0}', [kindName(kindOf(c.id))])
  if (c.type === 'connect') return tl('点选容器：导管从{0}通到哪里', [b.vesselName(c.id)])
  return tl('点选容器：从{0}倒入', [b.vesselName(c.id)])
}

/** Note a transfer for the canvas (the stream or the drops). */
export function noteTransfer(to: string, from: string | null, drops = false) {
  benchUi.transfer = { n: benchUi.transfer.n + 1, to, from, drops }
}

/** Put a part (an instrument or a tool) on a vessel; some parts ask one more thing first, or act at once. */
export function putPart(vessel: string, part: string) {
  const b = useBench()
  const k = kindOf(part)
  const v = b.vesselOf(vessel)
  if (!k || !v) return
  // a support, a burner, a hot plate, a bath is a thing of its own (26.65): it is set up under, round or beside the vessel
  // a tube goes through the vessel's stopper; where its other end goes is the next tap (or its end is dragged there)
  if (part === 'tube') {
    if (!b.rigFits(vessel, 'tube')) { showToast(tl('{0}不能用在{1}上', [kindName(k), b.vesselName(vessel)]), true); return }
    b.addTube(vessel)
    benchUi.carry = { type: 'connect', id: vessel, dragging: false, x: 0, y: 0 }
    return
  }
  if (isFixtureKind(part) && (!k.tool || fits(k, v.kind))) {
    if (b.rigFits(vessel, part)) b.rigUnder(vessel, part)
    else showToast(tl('{0}不能用在{1}上', [kindName(k), b.vesselName(vessel)]), true)
    return
  }
  if (!fits(k, v.kind)) { showToast(tl('{0}不能用在{1}上', [kindName(k), b.vesselName(vessel)]), true); return }
  const t = k.tool
  if (t?.action === 'electrode') {
    const materials = knownMaterials(t.materials ?? [])
    if (!materials.length) { showToast(tl('目录里没有可用的电极材料'), true); return }
    benchUi.chooser = { vessel, kind: 'electrode', part, options: materials.map(m => ({ label: m, value: m })) }
    return
  }
  if (t?.on === 'circuit' || k.instrument?.needs === 'circuit') {
    const c = b.circuitOf(vessel)
    if (!c) { showToast(tl('先在容器里放两个电极'), true); return }
    if (t?.action === 'bridge') { b.setCircuit(c.id, { bridge: true }); return }
    if (t?.action === 'source') { benchUi.chooser = { vessel, kind: 'source', part, options: (t.volts ?? []).map(x => ({ label: `${x} V`, value: x })) }; return }
    if (t?.action === 'load') { benchUi.chooser = { vessel, kind: 'load', part, options: (t.ohms ?? []).map(x => ({ label: `${x} Ω`, value: x })) }; return }
  }
  if (k.instrument?.needs === 'collect' && v.collect === 'none' && !v.closed) { showToast(tl('量气注射器接在集气的容器上'), true); return }
  b.attach(vessel, part)
  // a stopper goes in as it is put on; a tube asks where it leads
  if (t?.action === 'stopper' && !v.closed) b.useTool(vessel, part)
  if (t?.action === 'connect') benchUi.carry = { type: 'connect', id: vessel, dragging: false, x: 0, y: 0 }
  if (t?.action === 'pour') benchUi.carry = { type: 'pour', id: vessel, amount: t.amount, dragging: false, x: 0, y: 0 }
}

/** Finish what is being carried on a vessel (or, for a vessel kind, at a place on the bench). */
export function dropOn(vessel: string | null, at?: { x: number; y: number }) {
  const b = useBench()
  const c = benchUi.carry
  if (!c) return
  benchUi.carry = null
  if (c.type === 'apparatus') {
    if (kindOf(c.id)?.vessel) { b.place(c.id, at); return }
    if (kindOf(c.id)?.tool?.action === 'hand') { handHooks.take?.(c.id); return }
    if (vessel) putPart(vessel, c.id)
    else if (isFixtureKind(c.id)) b.addFixture(c.id, at)
    return
  }
  // a reagent let go on the bench itself comes down in its bottle (26.65, D297 item 6)
  if (!vessel) { if (c.type === 'reagent' && at) b.placeBottle(c.id, at); return }
  if (c.type === 'reagent') { b.select(vessel); benchUi.dialog = { mode: 'add', to: vessel, reagent: c.id }; return }
  if (vessel === c.id) return
  if (c.type === 'connect') { b.connect(c.id, vessel); return }
  if (c.amount && c.amount.unit !== 'drop') { if (b.pour(c.id, vessel, c.amount)) noteTransfer(vessel, c.id); return }
  benchUi.dialog = { mode: 'pour', from: c.id, to: vessel }
}

/** What the canvas offers to a drag that started elsewhere (set by the page once the canvas is mounted). */
export const canvasApi: { hit: ((x: number, y: number) => { vessel: string | null; at: { x: number; y: number }; inside: boolean }) | null; hover: ((id: string | null) => void) | null } = { hit: null, hover: null }

/**
 * Follow a pointer that went down on a shelf row: once it has moved a little the thing is carried under the pointer
 * (mouse and pen; a finger scrolls the list, and taps instead), and where it is let go it is put down. `started`
 * runs when the carrying begins (the shelf closes itself there).
 */
export function watchDrag(e: PointerEvent, type: 'reagent' | 'apparatus', id: string, started: () => void) {
  if (e.pointerType === 'touch' || e.button !== 0) return
  const x0 = e.clientX, y0 = e.clientY
  let on = false
  const move = (m: PointerEvent) => {
    if (!on && Math.hypot(m.clientX - x0, m.clientY - y0) > 6) { on = true; benchUi.carry = { type, id, dragging: true, x: m.clientX, y: m.clientY }; started() }
    if (!on || !benchUi.carry) return
    benchUi.carry.x = m.clientX; benchUi.carry.y = m.clientY
    canvasApi.hover?.(canvasApi.hit?.(m.clientX, m.clientY).vessel ?? null)
  }
  const up = (u: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    if (!on) return
    canvasApi.hover?.(null)
    const h = u.type === 'pointerup' ? canvasApi.hit?.(u.clientX, u.clientY) : null
    if (h?.inside) dropOn(h.vessel, h.at)
    else benchUi.carry = null
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}
