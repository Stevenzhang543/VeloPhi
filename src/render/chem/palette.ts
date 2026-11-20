/**
 * Colours of the bench drawing (26.64, D253, D258). The drawing reads the design tokens of the page (tokens.css) so
 * it follows the theme, the projector and the contrast mode like every other surface; the few colours that are the
 * drawing's own — the neutral tint of clear water, the glass body, flame and steel — are defined here per theme.
 * Colours of substances are not here: they come from the catalogue (solids) and, later, from the core (solutions).
 */
export interface ChemPalette {
  dark: boolean
  /** The interface's font stack, for text on the canvas. */
  font: string
  bg: string
  pane: string
  /** Lines of glassware and text. */
  ink: string
  ink2: string
  ink3: string
  tick: string
  tickMinor: string
  accent: string
  accentSoft: string
  panel: string
  danger: string
  warning: string
  /** Glass: body between the two wall lines, the one highlight. */
  glassBody: string
  glassLight: string
  /** Clear liquid: the neutral water tint and its surface line. */
  water: string
  waterLine: string
  /** A stream of clear liquid falling through the air (denser than a layer seen through glass). */
  stream: string
  /** A solid the catalogue gives no colour for. */
  solid: string
  metal: string
  steel: string
  bench: string
  /** The front edge of the bench top. */
  benchEdge: string
  flameOuter: string
  flameInner: string
  flameBlue: string
  steam: string
  bubble: string
  rubber: string
  /** Litmus paper below, inside and above its range. */
  litmusRed: string
  litmusBlue: string
  litmusBetween: string
  /** Categorical colours of the particle schematic (Okabe–Ito, as in the charts). */
  series: string[]
  /** Flames of the catalogue's colour keys (`pale`, `paleBlue`, `blue`, `yellow`, `white`, `lilac`). */
  flameKeys: Record<string, string>
  /** Phenomena (D297 item 2): smoke and fog of a colourless product, a glow, a dazzling light, sparks, a flash and its edge, a silver mirror, char. */
  smoke: string
  fog: string
  glow: string
  light: string
  spark: string
  flash: string
  flashEdge: string
  mirrorDark: string
  mirrorLight: string
  char: string
  /** Fixtures (D297 items 4–5): the boards of a rack, the spirit in a lamp, its wick, a hot plate that is on, an ice bath. */
  rack: string
  spirit: string
  wick: string
  plateHot: string
  ice: string
  /** The paper label of a reagent bottle and its print. */
  label: string
  labelInk: string
}

const OWN_LIGHT = {
  glassBody: 'rgba(96, 124, 158, 0.13)', glassLight: 'rgba(255, 255, 255, 0.85)', water: 'rgba(96, 146, 196, 0.2)', waterLine: 'rgba(52, 96, 148, 0.62)', stream: 'rgba(96, 146, 196, 0.45)',
  solid: '#c9ccd2', metal: '#8d949e', steel: '#5d6672', bench: 'rgba(27, 38, 59, 0.05)', benchEdge: 'rgba(27, 38, 59, 0.06)', flameOuter: 'rgba(232, 138, 30, 0.78)', flameInner: 'rgba(250, 212, 96, 0.9)', flameBlue: 'rgba(58, 116, 222, 0.8)',
  steam: 'rgba(96, 110, 130, 0.3)', bubble: 'rgba(52, 96, 148, 0.7)', rubber: '#8a5a44', litmusRed: '#c8463c', litmusBlue: '#3f62c4', litmusBetween: '#8a6ea8',
  series: ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00', '#7a5cc2', '#595959'],
  flameKeys: { pale: 'rgba(196, 206, 228, 0.7)', paleBlue: 'rgba(120, 160, 230, 0.6)', blue: 'rgba(58, 116, 222, 0.8)', yellow: 'rgba(240, 168, 40, 0.85)', white: 'rgba(255, 250, 236, 0.95)', lilac: 'rgba(176, 120, 210, 0.75)' },
  smoke: 'rgba(132, 138, 150, 0.9)', fog: 'rgba(160, 170, 184, 0.8)', glow: 'rgba(240, 96, 32, 1)', light: 'rgba(255, 252, 230, 1)', spark: 'rgba(255, 176, 40, 1)', flash: 'rgba(255, 236, 170, 1)', flashEdge: 'rgba(232, 138, 30, 0.9)',
  mirrorDark: 'rgba(120, 128, 140, 0.95)', mirrorLight: 'rgba(240, 244, 250, 0.95)', char: '#1d1b1a',
  rack: '#d9c7a8', spirit: 'rgba(150, 190, 225, 0.28)', wick: '#f1ece0', plateHot: '#c8503a', ice: 'rgba(170, 205, 235, 0.32)', label: '#fbfaf6', labelInk: '#2a2f38'
}
const OWN_DARK = {
  glassBody: 'rgba(160, 190, 226, 0.12)', glassLight: 'rgba(255, 255, 255, 0.3)', water: 'rgba(120, 170, 224, 0.2)', waterLine: 'rgba(150, 196, 244, 0.7)', stream: 'rgba(120, 170, 224, 0.42)',
  solid: '#8f96a3', metal: '#aab2be', steel: '#98a2b0', bench: 'rgba(214, 224, 245, 0.06)', benchEdge: 'rgba(214, 224, 245, 0.07)', flameOuter: 'rgba(244, 158, 60, 0.85)', flameInner: 'rgba(255, 226, 130, 0.92)', flameBlue: 'rgba(110, 160, 255, 0.85)',
  steam: 'rgba(200, 210, 226, 0.26)', bubble: 'rgba(170, 206, 246, 0.8)', rubber: '#b07a60', litmusRed: '#ef7d72', litmusBlue: '#7f9cf5', litmusBetween: '#b79ad6',
  series: ['#56b4e9', '#f0934a', '#3cc9a0', '#e39ac4', '#8fd0f5', '#f2c14e', '#a99cf0', '#b9c1ce'],
  flameKeys: { pale: 'rgba(210, 220, 240, 0.6)', paleBlue: 'rgba(140, 180, 255, 0.6)', blue: 'rgba(110, 160, 255, 0.85)', yellow: 'rgba(250, 186, 70, 0.88)', white: 'rgba(255, 252, 240, 0.95)', lilac: 'rgba(200, 150, 235, 0.75)' },
  smoke: 'rgba(214, 220, 230, 0.85)', fog: 'rgba(200, 210, 224, 0.7)', glow: 'rgba(255, 120, 50, 1)', light: 'rgba(255, 252, 235, 1)', spark: 'rgba(255, 190, 70, 1)', flash: 'rgba(255, 240, 190, 1)', flashEdge: 'rgba(244, 158, 60, 0.9)',
  mirrorDark: 'rgba(150, 158, 170, 0.95)', mirrorLight: 'rgba(245, 248, 252, 0.95)', char: '#0f0e0d',
  rack: '#6e604d', spirit: 'rgba(130, 175, 225, 0.25)', wick: '#cfc8b8', plateHot: '#e0624a', ice: 'rgba(150, 190, 230, 0.28)', label: '#e9e6dd', labelInk: '#22262d'
}

/** Fallbacks for a canvas outside the page (tests, exports): the light theme's token values. */
const TOKENS_LIGHT: Record<string, string> = { '--canvas-bg': '#fbfcfd', '--pane': '#fcfdfe', '--text': '#161b24', '--text-2': '#465061', '--text-3': '#5f6979', '--tick': 'rgba(27, 38, 59, 0.34)', '--tick-minor': 'rgba(27, 38, 59, 0.18)', '--accent': '#2450d6', '--accent-soft': 'rgba(36, 80, 214, 0.11)', '--panel-chem': '#0a8468', '--danger': '#c4261a', '--warning': '#8f5600' }

let cache: { key: string; palette: ChemPalette } | null = null

/** The palette for the page as it is now (cached until the theme or a mode class changes). */
export function chemPalette(): ChemPalette {
  const root = typeof document !== 'undefined' ? document.documentElement : null
  const key = root ? `${root.dataset.theme ?? ''}|${root.className}` : 'none'
  if (cache && cache.key === key) return cache.palette
  const cs = root ? getComputedStyle(root) : null
  const t = (name: string) => cs?.getPropertyValue(name).trim() || TOKENS_LIGHT[name]
  const dark = root?.dataset.theme === 'dark'
  const palette: ChemPalette = {
    dark, font: (typeof document !== 'undefined' && document.body ? getComputedStyle(document.body).fontFamily : '') || 'sans-serif', bg: t('--canvas-bg'), pane: t('--pane'), ink: t('--text'), ink2: t('--text-2'), ink3: t('--text-3'), tick: t('--tick'), tickMinor: t('--tick-minor'),
    accent: t('--accent'), accentSoft: t('--accent-soft'), panel: t('--panel-chem'), danger: t('--danger'), warning: t('--warning'),
    ...(dark ? OWN_DARK : OWN_LIGHT)
  }
  cache = { key, palette }
  return palette
}

/** `rgb(r, g, b)` / `rgba(…)` from a catalogue colour (sRGB 0–255). */
export function rgb(c: readonly [number, number, number], alpha = 1): string {
  return alpha >= 1 ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`
}
