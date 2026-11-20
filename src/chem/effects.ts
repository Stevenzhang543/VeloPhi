/**
 * The effects of reactions as the drawing shows them (26.65, D297 item 2). The core's `reaction` event names the
 * declared reaction and its `effects` (catalog.json, `reactions[].effects`); its `gas` event names a gas that left an
 * open vessel. This module keeps, per vessel, which effects are going on and how strongly — from the amount turned over
 * — for the canvas to draw (src/render/chem/phenomena.ts). It decides nothing about chemistry: no event, no effect.
 *
 * - While time runs, events arrive every frame and keep an effect alive; it fades out a moment after the last one.
 * - An action (ignition, an addition) gives an impulse: a pop or an explosion plays once, a flame burns a little while.
 * - A silver mirror and a deposit stay as long as the core holds the solid that forms them in that vessel.
 * - A coloured gas leaving an open vessel takes the core's colour of that gas (`chemColour` of the pure gas at the
 *   room's 1 atm, 0.041 mol/L, through 6 cm — the look of a jar of it; cached per gas). A gas whose display spectrum
 *   leaves it almost white there is not drawn (chlorine: the catalogue's spectrum of Cl₂(g) absorbs below 400 nm only).
 */
import { chemColour } from '../engine/chem'
import type { BenchEvent, VesselState } from '../engine/chem'
import { reactionOf, speciesColour } from './catalog'

/** Effects that are sounds or temperatures only, or drawn elsewhere (bubbles). */
const NOT_DRAWN = new Set(['bubbles', 'heat', 'hiss', 'crackle'])
/** How long an impulse lasts, s (an effect in a stream lasts while events come, plus FADE). */
const IMPULSE: Record<string, number> = { pop: 0.7, explosion: 1.1, light: 1.6, flame: 2.5, smoke: 3.5, fog: 3.5, glow: 2.5, spark: 1.6, molten: 1.6, melt: 3, dart: 3, char: 6, gas: 2.5 }
const FADE = 0.9
/** Effects that stay while their product is in the vessel. */
const LASTING = new Set(['mirror', 'deposit'])

export interface EffectState {
  key: string
  strength: number
  /** Wall-clock seconds: when it began and until when it lasts. */
  since: number
  until: number
  reaction: string
  /** CSS colour: the product's (smoke, deposit) or the gas's. */
  colour?: string
  /** The catalogue's flame colour key. */
  flame?: string
  /** The solid that forms (a mirror, a deposit) and the solid that reacts (a piece darting on water). */
  product?: string
  reactant?: string
}

/** 0 … 1 from an amount turned over (mol): 10⁻⁷ mol is faint, 10⁻² mol and more is full. */
export function strengthOf(n: number): number {
  if (!(n > 0)) return 0
  return Math.max(0.2, Math.min(1, 0.3 + 0.14 * Math.log10(n / 1e-7)))
}

const css = (c: readonly number[], a = 1) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`
const gasColours = new Map<string, string | null>()
/** The core's colour of a gas (null when it is colourless). */
export function gasColour(id: string): string | null {
  if (gasColours.has(id)) return gasColours.get(id)!
  let out: string | null = null
  try {
    const c = chemColour({ [id]: 0.041 }, 6).rgb
    // a gas the eye sees: one channel at least 6 % below white
    if (c && Math.min(c[0], c[1], c[2]) < 240) out = css(c)
  } catch { out = null }
  gasColours.set(id, out)
  return out
}

/** The solids a reaction makes and uses (ids with `(s)`). */
function solidsOf(eq: Record<string, number>): { made: string | null; used: string | null } {
  let made: string | null = null, used: string | null = null
  for (const [id, nu] of Object.entries(eq)) {
    if (!/\(s\)$/.test(id)) continue
    if (nu > 0 && !made) made = id
    if (nu < 0 && !used) used = id
  }
  return { made, used }
}

export function createEffects() {
  const byVessel = new Map<string, EffectState[]>()

  function put(vessel: string, e: EffectState) {
    const list = byVessel.get(vessel) ?? []
    const i = list.findIndex(x => x.key === e.key)
    const was = i < 0 ? null : list[i]
    // an effect that is still going on goes on: it keeps its start, and its strength follows the latest amount smoothly
    const next = was && was.until > e.since ? { ...e, since: was.since, until: Math.max(was.until, e.until), strength: was.strength * 0.5 + e.strength * 0.5 } : e
    if (i < 0) list.push(next)
    else list[i] = next
    byVessel.set(vessel, list)
  }

  /** Take the effects out of a batch of events: `streaming` while the clock runs, `now` in seconds. */
  function note(events: BenchEvent[], streaming: boolean, now: number) {
    for (const ev of events) {
      if (ev.code === 'reaction') {
        const extent = Number(ev.params.extent)
        if (!(extent > 0)) continue
        const keys = Array.isArray(ev.params.effects) ? (ev.params.effects as string[]) : []
        const id = String(ev.params.id ?? '')
        const r = reactionOf(id)
        const { made, used } = solidsOf(r?.eq ?? {})
        const madeColour = made ? speciesColour(made) : null
        for (const key of keys) {
          if (NOT_DRAWN.has(key)) continue
          const life = LASTING.has(key) ? Infinity : streaming ? FADE : (IMPULSE[key] ?? 2)
          // a product's colour shows in its smoke when it is not white (white smoke is drawn in the bench's grey)
          const colour = key === 'deposit' && madeColour ? css(madeColour) : (key === 'smoke' || key === 'fog') && madeColour && Math.min(...madeColour) < 200 ? css(madeColour, 0.9) : undefined
          put(ev.vessel, { key, strength: strengthOf(extent), since: now, until: now + life, reaction: id, colour, flame: r?.flameColour, product: made ?? undefined, reactant: used ?? undefined })
        }
      } else if (ev.code === 'stopper.blown' || ev.code === 'overflow' || ev.code === 'vessel.cracked') {
        // the consequences of a mistake (D297 item 9): a stopper flying off, liquid running over, glass cracking
        const key = ev.code === 'stopper.blown' ? 'blown' : ev.code === 'overflow' ? 'spill' : 'crack'
        put(ev.vessel, { key, strength: 1, since: now, until: now + 1.4, reaction: ev.code })
      } else if (ev.code === 'gas') {
        const id = String(ev.params.species ?? '')
        const colour = id && id !== 'H2O(g)' ? gasColour(id) : null
        if (colour) put(ev.vessel, { key: 'gas', strength: strengthOf(Number(ev.params.n)), since: now, until: now + (streaming ? 1.4 : IMPULSE.gas), reaction: id, colour })
      }
    }
  }

  /** The effects of a vessel now; lasting ones only while the core still holds their product there. */
  function of(vessel: VesselState, now: number): EffectState[] {
    const list = byVessel.get(vessel.id)
    if (!list) return []
    const live = list.filter(e => (LASTING.has(e.key) ? !e.product || vessel.solids.some(s => s.id === e.product && s.n > 0) : e.until > now))
    if (live.length !== list.length) { if (live.length) byVessel.set(vessel.id, live); else byVessel.delete(vessel.id) }
    return live
  }

  /** True while something is going on (the canvas keeps drawing). */
  function busy(now: number): boolean {
    for (const list of byVessel.values()) for (const e of list) if (!LASTING.has(e.key) && e.until > now) return true
    return false
  }

  function clear() { byVessel.clear() }

  return { note, of, busy, clear }
}

export type Effects = ReturnType<typeof createEffects>
