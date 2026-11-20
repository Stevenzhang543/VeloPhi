/**
 * Colours of the 3D viewer (26.64, D271): element colours and the viewer's own inks for the light and the dark ground.
 *
 * The element colours follow the convention every chemist reads (Corey–Pauling–Koltun as extended by Jmol: hydrogen
 * white, carbon dark, oxygen red, nitrogen blue, sulfur yellow, halogens green to brown …) and are then adjusted to the
 * ground: on the light canvas carbon is a dark graphite and the pale colours (hydrogen, fluorine, sulfur) are deepened;
 * on the dark canvas carbon is a mid grey and the deep colours (nitrogen, bromine, iodine) are raised. What no fill
 * can do — white hydrogen on white, graphite on graphite — the rim does: every ball and stick ends in a contour
 * (`outline`), dark on the light ground and light on the dark one, so a shape is readable whatever its fill.
 * tests/chem/mol3d.test.ts holds the contrast numbers.
 */

/** Red, green, blue in 0 … 1 (sRGB). */
export type RGB = [number, number, number]
export type MolTheme = 'light' | 'dark'

export function hex(s: string): RGB {
  const h = s.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6), 16)
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
}

export function toCss(c: RGB, alpha = 1): string {
  const [r, g, b] = c.map(x => Math.round(Math.min(1, Math.max(0, x)) * 255))
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`
}

/** A CSS colour as written in the design tokens (`#rgb`, `#rrggbb`, `rgb()`/`rgba()`); null when it is neither. */
export function parseCss(s: string): RGB | null {
  const t = s.trim()
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(t)) return hex(t)
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(t)
  return m ? [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255] : null
}

export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** Relative luminance (WCAG 2). */
export function luminance(c: RGB): number {
  const f = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}

/** Contrast ratio of two colours (WCAG 2), 1 … 21. */
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a), lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Element colours: [on the light ground, on the dark ground]. */
const ELEMENTS: Record<string, [string, string]> = {
  H: ['#f1f3f6', '#ffffff'], He: ['#8fd3dc', '#c9f3f8'],
  Li: ['#a66ae0', '#c79bf5'], Be: ['#8fb300', '#c2e83a'], B: ['#d98a72', '#ffb8a3'], C: ['#474e5b', '#98a1b0'], N: ['#2f5fe3', '#6f95ff'], O: ['#e0322b', '#ff5a4d'], F: ['#4faa2c', '#93e06a'], Ne: ['#6bbfd0', '#b3e9f5'],
  Na: ['#8d5fd3', '#b995f2'], Mg: ['#3f9a1f', '#86dd5c'], Al: ['#a08f93', '#cdbfc2'], Si: ['#b0906a', '#e6c8a0'], P: ['#e07a10', '#ff9d3a'], S: ['#d6a800', '#ffd83a'], Cl: ['#24a03c', '#4bd765'], Ar: ['#4fa9c2', '#93dcf0'],
  K: ['#7a4bc4', '#a985ea'], Ca: ['#3d8f2f', '#77cf62'], Sc: ['#8f9aa3', '#d5dde3'], Ti: ['#8c97a1', '#c3ccd4'], V: ['#878d9b', '#b4bac8'], Cr: ['#6c85b8', '#9db3e0'], Mn: ['#8a63b8', '#b693e0'], Fe: ['#cf6a30', '#f08a52'],
  Co: ['#d9607a', '#f58fa5'], Ni: ['#3faa50', '#6fd67e'], Cu: ['#b8733a', '#e39a5c'], Zn: ['#6f77b5', '#9ea6e0'], Ga: ['#b07d7d', '#dba8a8'], Ge: ['#5f8a8a', '#8fbcbc'], As: ['#a868c9', '#cf96ea'], Se: ['#d68f00', '#ffb62e'],
  Br: ['#9c3324', '#d2644f'], Kr: ['#3f9bb8', '#7fd0ea'], Rb: ['#6a3fb0', '#9a75dd'], Sr: ['#2f9a24', '#63cf58'], Y: ['#5fb5b5', '#9fe6e6'], Zr: ['#5fa9a9', '#9adada'], Nb: ['#4f9fa8', '#86cfd8'], Mo: ['#3f9494', '#74c4c4'],
  Ag: ['#8e98a3', '#cbd3db'], Cd: ['#c9a04f', '#f2cc82'], Sn: ['#55747a', '#8faab0'], Sb: ['#8a5aa8', '#b98bd6'], Te: ['#b87300', '#e69a2e'], I: ['#7a1f8f', '#b860cf'], Xe: ['#2f8a9f', '#6cc3d8'],
  Cs: ['#57209a', '#8c5ccf'], Ba: ['#1f8a1f', '#55c255'], La: ['#4f9fd6', '#86c7f5'], W: ['#2f7fc0', '#6aaee6'], Pt: ['#8a8fa0', '#c3c8d6'], Au: ['#c79a00', '#f2c832'], Hg: ['#8a8aa8', '#b8b8d0'], Pb: ['#525a63', '#8b949e'],
  Bi: ['#8f4fa8', '#be82d6'], Po: ['#9c5c1a', '#c98a4a'], U: ['#1f7fc7', '#5aaef0']
}
/** Elements without an entry: by block (alkali and alkaline-earth metals violet and green, d block steel, f block teal). */
const BY_BLOCK: Record<string, [string, string]> = { s: ['#7d55c7', '#ab89ea'], p: ['#9a7f66', '#c9b09a'], d: ['#7f8c9c', '#b3bfcc'], f: ['#2f9a8f', '#6ccfc4'] }
const D_BLOCK = new Set('Sc Ti V Cr Mn Fe Co Ni Cu Zn Y Zr Nb Mo Tc Ru Rh Pd Ag Cd Hf Ta W Re Os Ir Pt Au Hg Rf Db Sg Bh Hs Mt Ds Rg Cn'.split(' '))
const S_BLOCK = new Set('H He Li Be Na Mg K Ca Rb Sr Cs Ba Fr Ra'.split(' '))
const F_BLOCK = new Set('La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr'.split(' '))

/** The colour of an element on the ground of a theme. */
export function elementColour(symbol: string, theme: MolTheme): RGB {
  const k = theme === 'dark' ? 1 : 0
  const e = ELEMENTS[symbol]
  if (e) return hex(e[k])
  const block = D_BLOCK.has(symbol) ? 'd' : F_BLOCK.has(symbol) ? 'f' : S_BLOCK.has(symbol) ? 's' : 'p'
  return hex(BY_BLOCK[block][k])
}

/** Every element the table names (tests). */
export const NAMED_ELEMENTS: readonly string[] = Object.keys(ELEMENTS)

/** Black or white, whichever reads better on a fill (labels on atoms). */
export function inkOn(fill: RGB): RGB {
  const dark: RGB = [0.07, 0.09, 0.13]
  return contrast(dark, fill) >= contrast([1, 1, 1], fill) ? dark : [1, 1, 1]
}

/** The viewer's inks. */
export interface MolPalette {
  theme: MolTheme
  bg: RGB
  /** Contour of balls and sticks, and how strongly it replaces the fill at the rim (0 … 1). */
  outline: RGB
  outlineStrength: number
  /** Sticks of the ball-and-stick picture. */
  bond: RGB
  text: RGB
  textMuted: RGB
  /** Selection rings and measurement lines. */
  accent: RGB
  /** ψ > 0 and ψ < 0. */
  positive: RGB
  negative: RGB
  /** The electron-poor and the electron-rich end of a polar bond (blue and red, as on potential maps). */
  deltaPlus: RGB
  deltaMinus: RGB
  lonePair: RGB
  dipole: RGB
  /** Cell edges: the block and the cells inside it. */
  cell: RGB
  cellInner: RGB
  polyhedron: RGB
  polyhedronEdge: RGB
}

const LIGHT: MolPalette = {
  theme: 'light', bg: hex('#fbfcfd'), outline: hex('#1d2430'), outlineStrength: 0.82, bond: hex('#aab1bd'), text: hex('#161b24'), textMuted: hex('#465061'), accent: hex('#2450d6'),
  positive: hex('#d9482b'), negative: hex('#2a66d9'), deltaPlus: hex('#2a66d9'), deltaMinus: hex('#d9342b'), lonePair: hex('#8f7ae6'), dipole: hex('#b0367c'), cell: hex('#566073'), cellInner: hex('#a9b1bf'), polyhedron: hex('#0a8468'), polyhedronEdge: hex('#06644f')
}
const DARK: MolPalette = {
  theme: 'dark', bg: hex('#141920'), outline: hex('#e9eef7'), outlineStrength: 0.5, bond: hex('#727c8c'), text: hex('#eceff4'), textMuted: hex('#b9c1ce'), accent: hex('#8aa7ff'),
  positive: hex('#ff8a66'), negative: hex('#6fa3ff'), deltaPlus: hex('#6fa3ff'), deltaMinus: hex('#ff6a5c'), lonePair: hex('#b6a6ff'), dipole: hex('#f08cc0'), cell: hex('#aab4c5'), cellInner: hex('#4d5868'), polyhedron: hex('#4cc7a4'), polyhedronEdge: hex('#8fe3cb')
}

/**
 * The palette of a theme; `tokens` replaces the ground, the text and the accent by the application's design tokens
 * (read from the viewer's element), so the canvas sits in the page without a seam.
 */
export function molPalette(theme: MolTheme, tokens: Partial<Pick<MolPalette, 'bg' | 'text' | 'textMuted' | 'accent'>> = {}): MolPalette {
  const base = theme === 'dark' ? DARK : LIGHT
  const out = { ...base }
  for (const k of ['bg', 'text', 'textMuted', 'accent'] as const) if (tokens[k]) out[k] = tokens[k] as RGB
  return out
}
