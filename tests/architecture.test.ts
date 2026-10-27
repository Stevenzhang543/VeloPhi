/**
 * Layering (26.53, D65/D69): the application code is the interface; every computation on the physical model, the
 * state or the recording is in the Rust core. `src/` must not import the TypeScript reference (tests/reference),
 * must not contain the former solver and numeric modules, and must not define their characteristic functions. The
 * web build is checked the same way by scripts/check-dist.mjs (run by the release script right after `vite build`).
 */
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
// @ts-expect-error — plain ES module of the build scripts
import { REFERENCE_MARKERS, checkDist } from '../scripts/check-dist.mjs'

const root = join(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|vue|mjs|js)$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(join(root, 'src')).map(p => ({ file: relative(root, p).split('\\').join('/'), src: readFileSync(p, 'utf8') }))

describe('front end and core are separated', () => {
  it('src never imports the TypeScript reference or the test helpers', () => {
    const bad: string[] = []
    for (const { file, src } of files) {
      for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
        if (/(^|\/)tests\/|\/reference\//.test(m[1])) bad.push(`${file}: ${m[1]}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('the former solver and numeric modules are gone from src', () => {
    for (const dir of ['src/core/solver', 'src/core/observe', 'src/core/record', 'src/analysis/recognition.ts', 'src/worker/wasmJob.ts', 'src/engine/wasm.ts']) expect(existsSync(join(root, dir)), dir).toBe(false)
    for (const f of ['situations', 'situations2651', 'measure', 'quadrature', 'elliptic']) expect(existsSync(join(root, 'src/formula', `${f}.ts`)), f).toBe(false)
  })

  it('src defines none of the reference functions', () => {
    const bad: string[] = []
    for (const { file, src } of files) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      for (const marker of REFERENCE_MARKERS as string[]) if (code.includes(marker)) bad.push(`${file}: ${marker}`)
    }
    expect(bad).toEqual([])
  })

  it('the web build check knows the reference markers', () => {
    // The web build itself is checked by scripts/check-dist.mjs right after `vite build` in scripts/release.cmd (a
    // dist/ folder left from an older version would fail here)
    const dir = mkdtempSync(join(tmpdir(), 'velophi-dist-'))
    writeFileSync(join(dir, 'clean.js'), 'export const a = 1')
    expect(checkDist(dir)).toEqual([])
    writeFileSync(join(dir, 'ref.js'), 'run({ solutionCache: true })')
    expect(checkDist(dir)).toEqual(['ref.js: solutionCache'])
  })
})
