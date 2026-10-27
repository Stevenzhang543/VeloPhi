/** Colour of visible light of wavelength λ (nm) for drawing (approximation of the CIE curve; grey outside 380–780 nm). */
export function wavelengthColor(nm: number, alpha = 1): string {
  let r = 0, g = 0, b = 0
  if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1 }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1 }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20 }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1 }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65 }
  else if (nm <= 780) r = 1
  else return `rgba(140,140,150,${alpha})`
  if (nm < 380) return `rgba(140,140,150,${alpha})`
  // intensity falls off at the ends of the visible range
  const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1
  const c = (v: number) => Math.round(255 * Math.pow(v * f, 0.8))
  return `rgba(${c(r)},${c(g)},${c(b)},${alpha})`
}
