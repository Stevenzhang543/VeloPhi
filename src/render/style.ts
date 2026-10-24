/**
 * Per-draw render context shared by the canvas modules: font and line scale (projector mode) and the unit
 * choice used for every number printed on the canvas. Drawing is synchronous, so the entry points
 * (`drawScene`, `renderFrame`) set it once at the start of a frame and the helpers read it.
 *
 * Pure module (no Vue, no DOM state): the exporters use it as well.
 */
import type { UnitChoice } from '../units/units'
import { defaultChoice, displayLabel, formatQuantity, toDisplay } from '../units/units'

/** Font and line-width multipliers. */
export interface RenderStyle { font: number; line: number }

/** Normal type and strokes. */
export const DEFAULT_STYLE: RenderStyle = { font: 1, line: 1 }
/** Projector mode: larger type and thicker strokes so a projected image stays readable from the back row. */
export const PROJECTOR_STYLE: RenderStyle = { font: 1.4, line: 1.75 }

/** UI font stack of the canvas. */
export const FONT = '"Segoe UI Variable Text","Segoe UI","Noto Sans SC Variable","Microsoft YaHei UI",system-ui,sans-serif'
/** Monospace font stack of the canvas (numbers). */
export const MONO = '"JetBrains Mono Variable","Cascadia Code",Consolas,monospace'

const SI = defaultChoice()
let style: RenderStyle = DEFAULT_STYLE
let units: UnitChoice = SI

/** Set the style and unit choice for the frame being drawn. */
export function beginRender(s: RenderStyle | null | undefined, u: UnitChoice | null | undefined) {
  style = s ?? DEFAULT_STYLE
  units = u ?? SI
}

/** Current style (read by helpers that need both factors). */
export function currentStyle(): RenderStyle { return style }

/** Font size in CSS pixels after the style factor. */
export function fpx(size: number): number { return Math.round(size * style.font * 10) / 10 }

/** Canvas font string: `font(12)` or `font(11, MONO)`. */
export function font(size: number, family: string = FONT, weight = ''): string {
  return `${weight ? weight + ' ' : ''}${fpx(size)}px ${family}`
}

/** Line width after the style factor. */
export function lw(width: number): number { return width * style.line }

/** An SI value formatted in the current unit choice, e.g. "12.5 cm". */
export function q(v: number, siUnit: string, digits: number): string { return formatQuantity(v, siUnit, units, digits) }

/** An SI value converted to the display unit (for axis ticks). */
export function disp(v: number, siUnit: string): number { return toDisplay(v, siUnit, units) }

/** Display unit label of an SI unit. */
export function unit(siUnit: string): string { return displayLabel(siUnit, units) }

/** Short tick text without float noise ("0.3", "150", "2.5e-4"). */
export function tickText(v: number): string {
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e-3 && a < 1e6) return String(Number(v.toPrecision(8)))
  return v.toExponential(2).replace(/\.?0+e/, 'e')
}
