/**
 * Version strings (26.51 hand check: the desktop window still said 26.50 and the web page 26.49). The page title,
 * the desktop window title and every manifest carry the engine version.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ENGINE_VERSION } from '../src/core/scene/types'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const short = ENGINE_VERSION.split('.').slice(0, 2).join('.')

describe('version strings', () => {
  it('titles show the release', () => {
    expect(read('index.html')).toContain(`<title>Verity ${short}</title>`)
    const conf = JSON.parse(read('src-tauri/tauri.conf.json'))
    expect(conf.version).toBe(ENGINE_VERSION)
    for (const w of conf.app.windows) expect(w.title).toBe(`Verity ${short}`)
  })

  it('manifests carry the engine version', () => {
    expect(JSON.parse(read('package.json')).version).toBe(ENGINE_VERSION)
    expect(read('src-tauri/Cargo.toml')).toMatch(new RegExp(`^version = "${ENGINE_VERSION.replace(/\./g, '\\.')}"`, 'm'))
    expect(read('engine/Cargo.toml')).toMatch(new RegExp(`^version = "${ENGINE_VERSION.replace(/\./g, '\\.')}"`, 'm'))
  })
})
