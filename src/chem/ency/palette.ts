/**
 * Colours of the periodic table (26.64, D271). A cell is never painted in a full colour: the colour of its class is
 * mixed into the pane (`TINT` per cent, in sRGB — the same arithmetic as CSS `color-mix(in srgb, …)`), so the text
 * of the cell stays `--text` in both themes; tests/chem/ency.test.ts checks the contrast of every tint against the
 * tokens of src/app/tokens.css. The hues are those of the Okabe–Ito set (the charts of src/render use the same
 * family), extended by three for the ten categories; a category is also always named in the legend and on the page,
 * never told by colour alone.
 */
import type { ElementCategory, StandardState } from '../data'

export const CATEGORY_COLOUR: Record<ElementCategory, string> = {
  'alkali-metal': '#d55e00',
  'alkaline-earth': '#e69f00',
  'transition-metal': '#56b4e9',
  'post-transition-metal': '#009e73',
  metalloid: '#8c8c2a',
  'reactive-nonmetal': '#0072b2',
  halogen: '#cc79a7',
  'noble-gas': '#7b61c9',
  lanthanide: '#2aa5a5',
  actinide: '#a05a2c'
}

export const STATE_COLOUR: Record<StandardState, string> = { solid: '#7a8799', liquid: '#0072b2', gas: '#d55e00' }

/** Share of the class colour in a cell (per cent). */
export const TINT = 26
/** A sequential scale mixes the accent into the pane: from `RAMP[0]` per cent (lowest value) to `RAMP[1]`. */
export const RAMP: [number, number] = [5, 46]

/** The background of a cell of a class colour. */
export function tint(colour: string, share = TINT): string { return `color-mix(in srgb, ${colour} ${share}%, var(--pane))` }

/** The background of a cell on a sequential scale; `t` in 0 … 1. */
export function ramp(t: number): string {
  const s = RAMP[0] + (RAMP[1] - RAMP[0]) * Math.min(1, Math.max(0, t))
  return `color-mix(in srgb, var(--accent) ${s.toFixed(1)}%, var(--pane))`
}

// ---- The same arithmetic in numbers (tests) ----

export type Rgb3 = [number, number, number]

export function parseHex(hex: string): Rgb3 {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** `color-mix(in srgb, a share%, b)`. */
export function mixSrgb(a: Rgb3, b: Rgb3, share: number): Rgb3 {
  const p = share / 100
  return [0, 1, 2].map(i => a[i] * p + b[i] * (1 - p)) as Rgb3
}

function luminance(c: Rgb3): number {
  const f = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}

/** WCAG contrast ratio of two colours. */
export function contrastRatio(a: Rgb3, b: Rgb3): number {
  const la = luminance(a), lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** The ground of an emission-spectrum strip: the dark of a spectroscope, the same in both themes. */
export const STRIP_GROUND = '#0b0d12'
/** The scale under the strip, on that ground. */
export const STRIP_INK = '#aeb6c4'
