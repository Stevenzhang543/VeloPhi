/**
 * Android launcher icons from the flat mark (26.65, D296): the legacy square and round icons and the two layers of the
 * adaptive icon, for the five densities, into src-tauri/icons/android/res (scripts/android/build-apk.ps1 copies them
 * into the generated Android project). Drawn with Chromium (Playwright): `NODE_PATH=.cache/tools/node_modules node
 * scripts/android-icons.mjs`.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
const { chromium } = createRequire(import.meta.url)('playwright')

const OUT = join('src-tauri', 'icons', 'android', 'res')
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const GROUND = '#1c2230'
const BOB = '#f2a900'

/** The strobe and the orbit in a 32 × 32 box (the same drawing as assets/icon-small.svg, without its ground). */
const glyph = `
  <ellipse cx="16" cy="16.25" rx="9.38" ry="6.56" fill="none" stroke="#fff" stroke-opacity="0.72" stroke-width="1.4" />
  <line x1="16" y1="5" x2="16" y2="27.5" stroke="#fff" stroke-opacity="0.72" stroke-width="1.4" stroke-linecap="round" />
  <circle cx="16" cy="9.75" r="1.6" fill="#fff" fill-opacity="0.6" /><circle cx="16" cy="15.69" r="2" fill="#fff" fill-opacity="0.85" />
  <circle cx="16" cy="24" r="3" fill="${BOB}" />`

const svg = {
  // legacy launcher: the rounded square
  square: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="7" fill="${GROUND}" />${glyph}</svg>`,
  round: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="${GROUND}" /><g transform="translate(16 16) scale(0.86) translate(-16 -16)">${glyph}</g></svg>`,
  // adaptive layers (108 dp; the glyph inside the 66 dp safe zone)
  background: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" fill="${GROUND}" /></svg>`,
  foreground: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><g transform="translate(21 21) scale(2.0625)">${glyph}</g></svg>`,
}

const browser = await chromium.launch()
const page = await browser.newPage()
async function render(markup, size, file) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  await page.screenshot({ path: file, omitBackground: true })
}
for (const [d, k] of Object.entries(DENSITIES)) {
  const dir = join(OUT, `mipmap-${d}`)
  await render(svg.square, Math.round(48 * k), join(dir, 'ic_launcher.png'))
  await render(svg.round, Math.round(48 * k), join(dir, 'ic_launcher_round.png'))
  await render(svg.background, Math.round(108 * k), join(dir, 'ic_launcher_background.png'))
  await render(svg.foreground, Math.round(108 * k), join(dir, 'ic_launcher_foreground.png'))
}
await browser.close()
console.log('android icons written to', OUT)
