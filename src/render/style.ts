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

/**
 * 26.65 (D294): the canvas uses the interface's own fonts (it used Segoe UI, and JetBrains Mono for numbers, so the
 * labels on the canvas and the shell around it were two different typefaces). Source Sans 3 has tabular figures by
 * default, so numbers that change from frame to frame keep their width; `MONO` is therefore the same stack and stays
 * only as a name for "a number". The Chinese interface uses the Latin face that leaves the full-width punctuation to
 * Noto Sans SC (tokens.css, "VP Latin Z").
 */
const STACK_TAIL = '"Noto Sans SC Variable","Microsoft YaHei UI","Noto Sans CJK SC","Source Han Sans SC",system-ui,sans-serif'
let systemFonts = false
/** UI font stack of the canvas. */
export let FONT = `"Source Sans 3 Variable",${STACK_TAIL}`
/** Font stack of numbers on the canvas (the same face: its figures are tabular). */
export let MONO = FONT

/** The canvas follows the interface language (only the Latin face differs). */
export function setCanvasLanguage(chinese: boolean) {
  if (systemFonts) return
  FONT = `${chinese ? '"VP Latin Z"' : '"Source Sans 3 Variable"'},${STACK_TAIL}`
  MONO = FONT
}

/** 26.60 r2: draw with the system's fonts (Android; platform/device.ts) instead of the bundled ones. */
export function useSystemFonts() {
  systemFonts = true
  FONT = 'system-ui,Roboto,"Noto Sans CJK SC",sans-serif'
  MONO = FONT
}

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
