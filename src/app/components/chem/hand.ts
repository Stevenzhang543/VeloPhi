/**
 * Tools held in the hand (26.65, D297 item 7): the dropper, the spatula, the tweezers, the glass rod. A tool is taken
 * from the apparatus shelf and follows the pointer over the bench; it is loaded at a source and emptied at a vessel,
 * and each emptying is ONE action of the log — drops of a liquid (`add` of a bottle's reagent, `pour` in drops from a
 * vessel), a spoonful of a powder or a piece of a coarse solid (`add` in grams, the dose the user set; shown before it is
 * put in). The glass rod stirs: a drawing only, labelled as such — stirring does not change a dissolution rate in the
 * model (not modelled). Tap, then tap, works on a phone; Enter does it on the selected vessel or bottle.
 */
import { reactive } from 'vue'
import { useBench } from '../../../chem/bench'
import { reagentName, reagentOf, speciesColour } from '../../../chem/catalog'
import { kindName, kindOf } from '../../../chem/apparatus'
import { qty } from '../../../chem/format'
import { tl } from '../../../i18n'
import { showToast } from '../../store'
import { handHooks, ruleNote } from './benchUi'

export type HandTool = 'dropper' | 'spatula' | 'tweezers' | 'glassRod' | 'glowingSplint'

/** What the tool holds: a liquid drawn from a bottle or a vessel, or a dose of a solid from a wide bottle. */
export interface Load { from: 'bottle' | 'vessel'; id: string; reagent?: string; colour?: [number, number, number] | null; solid?: [number, number, number] | null }

export const hand = reactive({
  tool: null as HandTool | null,
  load: null as Load | null,
  /** Where the tool is (bench cm), and whether the pointer is over the bench. */
  x: 0, y: 0, over: false,
  /** Grams a spoonful or a piece is (the user's setting). */
  dose: 0.5,
  /** Vessels being stirred: until when (ms). */
  stirs: {} as Record<string, number>,
  /** The glowing splint just put in: does it flare up (by the rule), until when (ms). */
  splint: null as { relit: boolean; until: number } | null
})

/**
 * The rule of the glowing splint (D297 item 11): it flares up in a gas with about 35 % oxygen or more — a classroom rule
 * of thumb, said as a rule; the oxygen share it is applied to is the core's (the gas held by the vessel, or the gas
 * leaving it now).
 */
export const RELIGHT_O2 = 0.35

export const isHandTool = (kind: string): kind is HandTool => kindOf(kind)?.tool?.action === 'hand'

/** The coarse forms a pair of tweezers picks up; everything else is a powder for the spatula. */
const PIECES = new Set(['granule', 'pellet', 'chip', 'lump', 'ribbon', 'wire', 'foil', 'sheet', 'rod'])

export function takeTool(tool: HandTool) {
  hand.tool = tool
  hand.load = null
  const a = kindOf(tool)?.tool?.amount
  if ((tool === 'spatula' || tool === 'tweezers') && a?.unit === 'g' && !(hand.dose > 0)) hand.dose = a.value
}
export function putToolDown() { hand.tool = null; hand.load = null; hand.over = false }
handHooks.take = kind => { if (isHandTool(kind)) takeTool(kind) }

/** What the tool is doing, in words (the hint over the bench). */
export function handText(): string {
  const b = useBench()
  const t = hand.tool
  if (!t) return ''
  const name = kindName(kindOf(t))
  const what = hand.load ? (hand.load.from === 'bottle' ? reagentName(reagentOf(hand.load.reagent ?? ''), hand.load.reagent) : b.vesselName(hand.load.id)) : ''
  if (t === 'glassRod') return tl('{0}：点选容器搅拌', [name])
  if (t === 'glowingSplint') return tl('{0}：点选容器，伸到瓶口', [name])
  if (t === 'dropper') return hand.load ? tl('{0}（{1}）：在容器口上方按住滴加', [name, what]) : tl('{0}：点选试剂瓶或容器吸取', [name])
  return hand.load ? tl('{0}：点选容器，加入 {1}', [name, qty(hand.dose, 'g', hand.dose < 1 ? 2 : 1)]) : t === 'spatula' ? tl('{0}：点选盛粉末的广口瓶', [name]) : tl('{0}：点选盛块状固体的广口瓶', [name])
}

/**
 * A tap with the tool on a vessel or a bottle (or the keyboard's Enter on the selected one). Returns true when an
 * action of the log was performed.
 */
export function handTap(target: { vessel?: string | null; fixture?: string | null }): boolean {
  const b = useBench()
  const t = hand.tool
  if (!t) return false
  const f = target.fixture ? b.fixtureOf(target.fixture) : undefined
  const v = target.vessel ? b.vesselOf(target.vessel) : undefined
  if (t === 'glowingSplint') {
    if (!v) return false
    // the gas at the mouth: what the vessel holds, else what is leaving it now, else the room's air
    const r = b.read(v.id)
    const moving = (b.activity.get(v.id)?.gas ?? 0) > 0
    const list = r?.gas.length ? r.gas : moving ? r?.released ?? [] : []
    const total = list.reduce((s, g) => s + g.n, 0)
    const o2 = list.filter(g => g.id === 'O2(g)').reduce((s, g) => s + g.n, 0)
    const share = total > 0 ? o2 / total : 0.2095
    hand.splint = { relit: share >= RELIGHT_O2, until: Date.now() + 3500 }
    const pct = `${Math.round(share * 100)} %`
    ruleNote(share >= RELIGHT_O2 ? tl('规则：氧气约占 {0}，带火星的木条复燃', [pct]) : tl('规则：氧气约占 {0}，木条没有复燃', [pct]))
    return false
  }
  if (t === 'glassRod') {
    if (!v || !(v.volume_mL > 0)) return false
    hand.stirs = { ...hand.stirs, [v.id]: Date.now() + 3500 }
    showToast(tl('玻璃棒搅拌：画面示意，模型里搅拌不改变溶解速率'))
    return false
  }
  if (t === 'dropper') {
    // a bottle of a liquid or a vessel with liquid loads the dropper; with a load, a vessel gets a drop
    if (f?.kind === 'reagentBottle') {
      const r = reagentOf(f.reagent ?? '')
      if (r?.kind === 'solid') { showToast(tl('胶头滴管只吸取液体'), true); return false }
      if (f.style !== 'dropper' && !f.open) { ruleNote(tl('规则：先取下瓶塞，倒放在桌面上')); return false }
      hand.load = { from: 'bottle', id: f.id, reagent: f.reagent }
      return false
    }
    if (!v) return false
    if (!hand.load) {
      if (!(v.volume_mL > 0.05)) { showToast(tl('胶头滴管只吸取液体'), true); return false }
      hand.load = { from: 'vessel', id: v.id, colour: v.colour ?? null }
      return false
    }
    if (hand.load.from === 'vessel' && hand.load.id === v.id) return false
    return dropInto(v.id, 1)
  }
  // spatula, tweezers: a dose from a wide bottle into a vessel
  if (f?.kind === 'reagentBottle') {
    const r = reagentOf(f.reagent ?? '')
    if (r?.kind !== 'solid') { showToast(tl('{0}只取固体', [kindName(kindOf(t))]), true); return false }
    const piece = PIECES.has(r.form ?? '')
    if (t === 'spatula' && piece) { showToast(tl('块状固体用镊子夹取'), true); return false }
    if (t === 'tweezers' && !piece) { showToast(tl('粉末用药匙取用'), true); return false }
    if (!f.open) { ruleNote(tl('规则：先取下瓶塞，倒放在桌面上')); return false }
    const id = Object.keys(r.recipe?.species ?? {})[0]
    hand.load = { from: 'bottle', id: f.id, reagent: f.reagent, solid: id ? speciesColour(id) : null }
    return false
  }
  if (!v || !hand.load?.reagent) return false
  const ok = !!b.add(v.id, hand.load.reagent, { value: Math.round(hand.dose * 1000) / 1000, unit: 'g' })
  if (ok) hand.load = null
  return ok
}

/** `n` drops from the loaded dropper into a vessel: one action. */
export function dropInto(vessel: string, n: number): boolean {
  const b = useBench()
  const l = hand.load
  if (!l || !(n >= 1)) return false
  if (l.from === 'bottle') return !!b.add(vessel, l.reagent ?? '', { value: n, unit: 'drop' })
  if (l.id === vessel) return false
  return !!b.pour(l.id, vessel, { value: n, unit: 'drop' })
}

/** Is a vessel being stirred now? */
export function stirring(vessel: string): boolean { return (hand.stirs[vessel] ?? 0) > Date.now() }
