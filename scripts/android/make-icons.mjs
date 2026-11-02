// Android launcher icons from assets/icon.svg (26.59, D176): legacy square and round icons per density and an
// adaptive icon (full-bleed gradient background + the Φ glyph inside the safe zone). Output in
// src-tauri/icons/android/res, copied over the generated Android project by scripts/android/build-apk.ps1.
// Needs Playwright's Chromium (development machines only); the PNGs are kept in the repository.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright')
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const svg = readFileSync(join(root, 'assets', 'icon.svg'), 'utf8')
const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)[0]
const glyph = svg.slice(svg.indexOf('<ellipse')).replace('</svg>', '')
const out = join(root, 'src-tauri', 'icons', 'android', 'res')
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

const full = svg
const round = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}<clipPath id="c"><circle cx="512" cy="512" r="472"/></clipPath><g clip-path="url(#c)"><rect x="40" y="40" width="944" height="944" fill="url(#bg)"/><rect x="40" y="40" width="944" height="944" fill="url(#hi)"/><g transform="translate(512 512) scale(0.86) translate(-512 -525)">${glyph}</g></g></svg>`
const background = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#hi)"/></svg>`
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}<g transform="translate(512 512) scale(0.64) translate(-512 -525)">${glyph}</g></svg>`

const browser = await chromium.launch()
const page = await browser.newPage()
async function render(src, size, file) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  writeFileSync(file, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }))
}
for (const [d, k] of Object.entries(DENSITIES)) {
  const dir = join(out, `mipmap-${d}`)
  mkdirSync(dir, { recursive: true })
  await render(full, Math.round(48 * k), join(dir, 'ic_launcher.png'))
  await render(round, Math.round(48 * k), join(dir, 'ic_launcher_round.png'))
  await render(foreground, Math.round(108 * k), join(dir, 'ic_launcher_foreground.png'))
  await render(background, Math.round(108 * k), join(dir, 'ic_launcher_background.png'))
}
await browser.close()
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`
mkdirSync(join(out, 'mipmap-anydpi-v26'), { recursive: true })
writeFileSync(join(out, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptive)
writeFileSync(join(out, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptive)
console.log('android icons written to', out)
