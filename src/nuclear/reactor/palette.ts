/**
 * Colours of the reactor workshop's map (26.64, D277): one per material (the two fuels warm, the moderators blue to
 * grey, the absorbers dark) and the ramp of the flux and power maps. Drawing colours of a canvas, like the chart
 * colours of src/render — not interface tokens.
 */
export const MATERIAL_COLOURS: Record<string, { light: string; dark: string }> = {
  fuel_nat: { light: '#c99a1e', dark: '#e0b84a' },
  fuel_leu: { light: '#d55e00', dark: '#e8743b' },
  water: { light: '#7cc4ee', dark: '#3f8fc0' },
  heavy_water: { light: '#2f7fc1', dark: '#2a66a3' },
  graphite: { light: '#6b7482', dark: '#59616e' },
  steel: { light: '#a3abb8', dark: '#8891a0' },
  zircaloy: { light: '#c7cdd6', dark: '#a9b1bd' },
  b4c: { light: '#1b212c', dark: '#e9edf3' },
  agincd: { light: '#7a55a8', dark: '#b79ae0' },
  coolant: { light: '#b3e0f7', dark: '#2f6f96' },
  void: { light: '#f1f3f6', dark: '#222833' },
  source: { light: '#cc79a7', dark: '#dd95bd' }
}
const FALLBACK = { light: '#c3c9d3', dark: '#414a59' }
export const materialColour = (id: string, dark: boolean): string => (MATERIAL_COLOURS[id] ?? FALLBACK)[dark ? 'dark' : 'light']

/** Viridis in 32 steps, low to high. */
export const FLUX_RAMP = ['#440154', '#470d60', '#48186a', '#482374', '#472d7b', '#453781', '#424086', '#3e4989', '#3a528b', '#365c8d', '#32648e', '#2e6d8e', '#2b758e', '#287d8e', '#25858e', '#228d8d', '#1f958b', '#1f9e89', '#21a685', '#27ad81', '#31b57b', '#3fbc73', '#4fc46a', '#60ca60', '#73d056', '#86d549', '#9bd93c', '#b0dd2f', '#c5e021', '#dae319', '#eee51c', '#fde725']
