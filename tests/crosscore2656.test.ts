/**
 * Native and WebAssembly paths of the 26.56 calculations (model registry, constant sets, particle checker, labs with
 * constant sets, the convergence study): every result bit is hashed, the digest written to
 * `.cache/crosscore-<core>.json`. The Node-API module (the container) and the WebAssembly module (the release build
 * on Windows, VELOPHI_CORE=wasm) must give the same digest — compare the two files. The numbers are written as the
 * hexadecimal bits of the doubles, so the comparison is exact.
 */
import { it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { core } from '../src/engine/core'
import { constantSet, evalModel, invertModel, manifest } from '../src/engine/models'
import { compton, magnetMap, particleProcess, plateCapacitor, quantumSetup, reaction } from '../src/engine/labs'
import { gridStudy } from '../src/teaching/convergence'

const fixture = JSON.parse(readFileSync('tests/fixtures/oracles2656.json', 'utf8')) as { cases: Array<{ model: string; inputs: Record<string, number>; constantsSet: string }> }
const buf = new DataView(new ArrayBuffer(8))
/** JSON with every number replaced by the hexadecimal bits of its double. */
function bits(x: unknown): unknown {
  if (typeof x === 'number') { buf.setFloat64(0, x); return buf.getBigUint64(0).toString(16) }
  if (Array.isArray(x) || ArrayBuffer.isView(x)) return Array.from(x as ArrayLike<unknown>).map(bits)
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, bits((x as Record<string, unknown>)[k])]))
  return x
}

it('digest of the 26.56 calculations on this core', () => {
  const parts: unknown[] = []
  for (const c of fixture.cases) parts.push(evalModel(c.model, c.inputs, { constantsSet: c.constantsSet, trace: true }))
  parts.push(invertModel('M04', { v0: 20, g: 9.8, h0: 0 }, 'theta', 'Rsame', 30, 0, Math.PI / 2))
  for (const s of ['CODATA2018', 'CODATA2022']) {
    parts.push(constantSet(s), compton(71.1, Math.PI / 3, s), plateCapacitor({ S: 0.02, d: 2e-3, er: 3, mode: 'battery', U: 100, constantsSet: s }))
    parts.push(magnetMap({ wires: [{ x: 0, y: 0, I: 10, r: 0.002 }] }, { region: { x0: -0.1, y0: -0.1, x1: 0.1, y1: 0.1 }, grid: 16, lines: 4, arrows: 8, probes: [{ x: 0.05, y: 0.01 }], constantsSet: s }))
    parts.push(reaction([{ kind: 'nuclide', Z: 1, A: 2 }, { kind: 'nuclide', Z: 1, A: 3 }], [{ kind: 'nuclide', Z: 2, A: 4 }, { kind: 'n' }], s))
  }
  parts.push(particleProcess(['n'], ['p', 'e-', 'anti_nu_e']), particleProcess(['p', 'p'], ['p', 'p', 'pi0']), particleProcess(['mu-'], ['e-', 'gamma']))
  parts.push(quantumSetup({ potential: { kind: 'box', c: 0, w: 1 }, n: 255, states: 3 }).energies)
  parts.push(gridStudy(undefined, [64, 128]))
  const m = manifest('models', 'x', 'CODATA2022')
  parts.push({ ...m, core: '—' })
  const text = JSON.stringify(bits(parts))
  const digest = createHash('sha256').update(text).digest('hex')
  const kind = core().kind
  mkdirSync('.cache', { recursive: true })
  writeFileSync(`.cache/crosscore-${kind}.json`, JSON.stringify({ core: kind, cases: fixture.cases.length, parts: parts.length, digest }, null, 1) + '\n')
  expect(digest).toMatch(/^[0-9a-f]{64}$/)
})
