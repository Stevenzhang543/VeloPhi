/**
 * Version strings (26.51 hand check: the desktop window still said 26.50 and the web page 26.49). The page title,
 * the desktop window title and every manifest carry the engine version. Also the page shell the desktop CSP depends on.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ENGINE_VERSION } from '../src/core/scene/types'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const short = ENGINE_VERSION.split('.').slice(0, 2).join('.')

describe('version strings', () => {
  it('titles show the release', () => {
    expect(read('index.html')).toContain(`<title>VeloΦ ${short}</title>`)
    const conf = JSON.parse(read('src-tauri/tauri.conf.json'))
    expect(conf.version).toBe(ENGINE_VERSION)
    for (const w of conf.app.windows) expect(w.title).toBe(`VeloΦ ${short}`)
  })

  it('manifests carry the engine version', () => {
    expect(JSON.parse(read('package.json')).version).toBe(ENGINE_VERSION)
    expect(read('src-tauri/Cargo.toml')).toMatch(new RegExp(`^version = "${ENGINE_VERSION.replace(/\./g, '\\.')}"`, 'm'))
    expect(read('engine/Cargo.toml')).toMatch(new RegExp(`^version = "${ENGINE_VERSION.replace(/\./g, '\\.')}"`, 'm'))
  })

  it('index.html has no inline <style> or <script> (26.52 hand check)', () => {
    // An inline block makes Tauri add its hash to the CSP, which switches 'unsafe-inline' off: every inline style
    // attribute is then blocked in the desktop app, and KaTeX formulas lose their layout and colours
    const html = read('index.html')
    expect(html).not.toMatch(/<style[\s>]/i)
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i)
    const security = JSON.parse(read('src-tauri/tauri.conf.json')).app.security
    expect(security.csp as string).toMatch(/style-src [^;]*'unsafe-inline'/)
    // Tauri must not add nonces or hashes to style-src either (they too would switch 'unsafe-inline' off)
    expect(security.dangerousDisableAssetCspModification).toEqual(['style-src'])
  })
})
