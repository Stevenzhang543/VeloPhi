/**
 * Colours of chart series and their line styles (26.58, D139). The arrays are changed in place by
 * `setSeriesColourVision`, so every chart picks up the colour-vision-friendly palette (Okabe–Ito) without being
 * passed a setting; with it, series also differ by dash pattern, not only by colour.
 */
const STANDARD_LIGHT = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563']
const STANDARD_DARK = ['#60a5fa', '#f87171', '#4ade80', '#fbbf24', '#a78bfa', '#22d3ee', '#f472b6', '#9ca3af']
/** Okabe & Ito's palette, distinguishable with the common forms of colour-vision deficiency. */
const CVD_LIGHT = ['#0072B2', '#D55E00', '#009E73', '#B88A00', '#CC79A7', '#2C9AD6', '#1f1f1f', '#8a8a8a']
const CVD_DARK = ['#56B4E9', '#F08A4B', '#2FCB9B', '#F0C33C', '#E39BC5', '#9FD3F5', '#f0f0f0', '#b0b0b0']

export const SERIES_LIGHT: string[] = [...STANDARD_LIGHT]
export const SERIES_DARK: string[] = [...STANDARD_DARK]
/** Dash patterns (px) by series index; empty: solid. Used with the colour-vision palette. */
export const SERIES_DASH: number[][] = [[], [7, 3], [2, 3], [9, 3, 2, 3], [1, 3], [12, 4], [5, 2, 1, 2], [3, 6]]
export let seriesDashes = false

export function setSeriesColourVision(on: boolean) {
  SERIES_LIGHT.splice(0, SERIES_LIGHT.length, ...(on ? CVD_LIGHT : STANDARD_LIGHT))
  SERIES_DARK.splice(0, SERIES_DARK.length, ...(on ? CVD_DARK : STANDARD_DARK))
  seriesDashes = on
}
