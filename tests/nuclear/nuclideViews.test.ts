/**
 * The view-models of the nuclide pages (26.64, D276): every nuclide of the table yields a page without a missing
 * value in three languages; the colour classes of the chart; the search; the addresses; the decay-chain view of
 * U-238, Th-232, Mo-99 and Cs-137, whose numbers are the core's own (the view formats, it does not calculate); and
 * the wording of every diagnostic code the nuclear and reactor operations of the core can return.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { nuclideChain, nuclideDecay } from '../../src/engine/nuclear'
import type { CoreDiagnostic } from '../../src/engine/nuclear'
import { loadNuclideTable } from '../../src/nuclear/table'
import { nuclideLine, nuclidePage } from '../../src/nuclear/page'
import { SCHEMES, cellAt, centreOn, chartPixels, classify, colourClasses, drawChart, fitView, indexAt, zoomAt } from '../../src/nuclear/chart'
import type { ElementName } from '../../src/nuclear/search'
import { resolveNuclide, searchNuclides } from '../../src/nuclear/search'
import { nuclideHash, parseNuclideHash } from '../../src/nuclear/link'
import { chainLayout, decayRows, decayView, sampleTime, sampleTimes } from '../../src/nuclear/chain'
import { NUCLEAR_CODES, diagnosticLines, diagnosticText, nuclearErrorText } from '../../src/nuclear/diagText'
import { halfLifeText, modeText, nuclideLabel, sig, withUnit } from '../../src/nuclear/format'
import { loadElementData } from '../../src/chem/data'
import { locale } from '../../src/i18n/locale'
import { missing } from '../../src/i18n'

const CJK = /[一-鿿]/
const BROKEN = /NaN|undefined|null|Infinity|\[object/
const LANGS = ['zh', 'en', 'de'] as const
/** Every string of a value, at any depth. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach(x => strings(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach(x => strings(x, out))
  return out
}
async function names(): Promise<ElementName[]> {
  return (await loadElementData()).elements.map(e => ({ z: e.z, symbol: e.symbol, zh: e.name.zh, en: e.name.en, de: e.name.de }))
}

describe('nuclide pages', () => {
  it('every nuclide of the table yields a page without a missing value, in three languages', async () => {
    const t = await loadNuclideTable()
    const el = await names()
    expect(t.records.length).toBe(4171)
    expect(t.ground.length).toBe(3558)
    missing.clear()
    try {
      for (const lang of LANGS) {
        locale.lang = lang
        for (const r of t.records) {
          const page = nuclidePage(r, t, el.find(e => e.z === r.Z) ?? null, lang)
          const all = [...strings(page), nuclideLine(r)]
          const bad = all.find(s => BROKEN.test(s) || s === '' || (lang !== 'zh' && CJK.test(s)))
          expect(bad, `${r.id} (${lang})`).toBeUndefined()
          expect(page.rows.length).toBeGreaterThanOrEqual(5)
          expect(page.branches.length).toBe(r.branches.length)
          // a daughter that is a link is a nuclide of the table
          for (const b of page.branches) if (b.to) expect(t.byId.has(b.to), `${r.id} → ${b.to}`).toBe(true)
        }
      }
    } finally { locale.lang = 'zh' }
    expect([...missing]).toEqual([])
  })

  it('shows the numbers of the record, not numbers of its own', async () => {
    const t = await loadNuclideTable()
    const u = t.byId.get('U-235')!
    const page = nuclidePage(u, t, { z: 92, symbol: 'U', zh: '铀', en: 'Uranium', de: 'Uran' }, 'zh')
    expect(page.label).toBe('²³⁵U')
    expect(page.name).toBe('铀-235')
    expect(page.life).toBe(halfLifeText(u.halfLife))
    expect(page.rows.find(r => r.key === 'bindingPerNucleon')!.value).toContain('7590.92')
    expect(page.rows.find(r => r.key === 'abundance')!.value).toBe(withUnit(sig(u.abundance, 5), '%'))
    expect(page.branches[0]).toMatchObject({ mode: 'α', to: 'Th-231', target: '²³¹Th' })
    expect(page.branches.find(b => b.mode === 'SF')!.to).toBeNull()
    expect(page.chain).toBe(true)
    const tc = nuclidePage(t.byId.get('Tc-99m')!, t)
    expect(tc.label).toBe('⁹⁹ᵐTc')
    expect(tc.isomers.map(i => i.id)).toEqual(['Tc-99', 'Tc-99m'])
    expect(tc.isomers.find(i => i.current)!.id).toBe('Tc-99m')
    const fe = nuclidePage(t.byId.get('Fe-56')!, t)
    expect(fe.stable).toBe(true)
    expect(fe.chain).toBe(false)
    expect(fe.branches).toEqual([])
    expect(modeText('B-n')).toBe('β⁻n')
    expect(modeText('14C')).toBe('¹⁴C')
  })
})

describe('chart of nuclides', () => {
  it('puts every ground state in a colour class of each scheme', async () => {
    const t = await loadNuclideTable()
    for (const scheme of SCHEMES) {
      const classes = colourClasses(scheme)
      const cls = classify(t, scheme)
      const count = new Array(classes.length).fill(0)
      for (const i of t.ground) { expect(cls[i]).toBeLessThan(classes.length); count[cls[i]]++ }
      expect(count.reduce((a, b) => a + b, 0)).toBe(3558)
      const px = chartPixels(t, cls, classes, false)
      expect([px.width, px.height]).toEqual([t.nMax + 1, t.zMax + 1])
      let painted = 0
      for (let i = 3; i < px.data.length; i += 4) if (px.data[i] === 255) painted++
      expect(painted).toBe(3558)
      const u = t.byId.get('U-235')!
      expect(indexAt(px, u.N, u.Z)).toBeGreaterThanOrEqual(0)
      expect(indexAt(px, 0, 100)).toBe(-1)
      const of = (id: string) => { const r = t.byId.get(id)!; return classes[cls[indexAt(px, r.N, r.Z)]].key }
      if (scheme === 'mode') {
        // one of the 254 stable entries of the table is an isomer (the chart shows ground states)
        expect(count[0]).toBe(t.records.filter(r => r.stable && r.state === 0).length)
        expect(count[0]).toBe(253)
        expect([of('U-235'), of('Co-60'), of('F-18'), of('Fe-56'), of('Cf-254')]).toEqual(['alpha', 'beta-', 'beta+', 'stable', 'fission'])
      } else if (scheme === 'halfLife') {
        expect(of('Fe-56')).toBe('stable')
        // U-238 (4.5 Ga) in the last class, Co-60 (5.27 a) in '1 a – 10³ a'
        expect(of('U-238')).toBe('c10')
        expect(of('Co-60')).toBe('c7')
      } else {
        // the most tightly bound nuclei are around iron and nickel; the deuteron is weakly bound
        expect(of('Ni-62')).toBe('c10')
        expect(of('Fe-56')).toBe('c10')
        expect(of('H-2')).toBe('c0')
        expect(of('U-235')).toBe('c5')
      }
    }
  })

  it('pans, zooms about a point and finds the cell under the pointer', async () => {
    const t = await loadNuclideTable()
    const v = fitView(t, 1200, 700)
    expect(v.scale * (t.nMax + 1)).toBeLessThanOrEqual(1200)
    expect(v.scale * (t.zMax + 1)).toBeLessThanOrEqual(700)
    const z = zoomAt(v, 3, 400, 300)
    expect(cellAt(z, 400, 300)).toEqual(cellAt(v, 400, 300))
    expect(zoomAt(v, 1e9, 0, 0).scale).toBe(72)
    const c = centreOn(143, 92, 1200, 700, 30)
    expect(cellAt(c, 600, 350)).toEqual({ N: 143, Z: 92 })
  })

  it('draws a frame with one image and the labels of the visible cells only', async () => {
    const t = await loadNuclideTable()
    const classes = colourClasses('mode'), cls = classify(t, 'mode')
    const pixels = chartPixels(t, cls, classes, false)
    const calls: Record<string, number> = {}
    const ctx = new Proxy({}, { get: (_o, k: string) => (...a: unknown[]) => { calls[k] = (calls[k] ?? 0) + 1; return a }, set: () => true }) as unknown as CanvasRenderingContext2D
    const frame = (view: ReturnType<typeof fitView>) => drawChart(ctx, { table: t, pixels, cls, classes, dark: false, image: {} as CanvasImageSource, view, width: 1200, height: 700, paint: { bg: '#fff', line: '#888', text: '#444', accent: '#00f', font: 'sans-serif' }, selected: { N: 143, Z: 92 }, hover: null })
    expect(frame(fitView(t, 1200, 700))).toBe(0)
    expect(calls.drawImage).toBe(1)
    const labelled = frame(centreOn(143, 92, 1200, 700, 40))
    // 1200 × 700 at 40 px a cell: at most 31 × 19 cells, and only those that hold a nuclide
    expect(labelled).toBeGreaterThan(50)
    expect(labelled).toBeLessThanOrEqual(31 * 19)
    // the time of the frame's own logic (everything but the rasteriser), far inside the 4 ms budget
    const t0 = performance.now()
    for (let i = 0; i < 200; i++) frame(centreOn(100 + (i % 40), 60 + (i % 20), 1200, 700, 26))
    const ms = (performance.now() - t0) / 200
    console.log(`chart frame logic at 26 px a cell: ${ms.toFixed(3)} ms`)
    expect(ms).toBeLessThan(4)
  })
})

describe('finding a nuclide', () => {
  it('understands symbols, mass numbers first or last, isomers and element names in three languages', async () => {
    const t = await loadNuclideTable()
    const el = await names()
    const first = (q: string) => searchNuclides(q, t, el)[0]?.id
    for (const q of ['U-235', 'u235', '235U', '235-u', 'U 235', '铀235', '铀-235', '铀 235', 'Uran 235', 'Uran-235', 'uranium-235', 'Uranium 235', 'Ｕ－２３５']) expect(first(q), q).toBe('U-235')
    for (const q of ['Tc-99m', '99mTc', 'tc99m', '锝99m', 'Technetium-99m']) expect(first(q), q).toBe('Tc-99m')
    expect(first('Tc-99')).toBe('Tc-99')
    expect(first('碳14')).toBe('C-14')
    expect(first('Kohlenstoff 14')).toBe('C-14')
    expect(first('n1')).toBe('n-1')
    expect(first('N14')).toBe('N-14')
    // an element alone: its isotopes, the natural ones first; a mass number alone: its isobars
    expect(searchNuclides('铀', t, el).slice(0, 3).map(r => r.id).sort()).toEqual(['U-234', 'U-235', 'U-238'])
    expect(searchNuclides('Zinn', t, el, 40).filter(r => r.stable).length).toBe(10)
    expect(searchNuclides('137', t, el).map(r => r.id)).toContain('Cs-137')
    expect(searchNuclides('ura', t, el)[0].symbol).toBe('U')
    expect(searchNuclides('Xx-999', t, el)).toEqual([])
    expect(searchNuclides('   ', t, el)).toEqual([])
    // without the element names the symbols still work
    expect(searchNuclides('U-235', t, [])[0].id).toBe('U-235')
  })

  it('reads and writes the addresses #n=…', async () => {
    const t = await loadNuclideTable()
    expect(parseNuclideHash('#n=U-235')).toEqual({ nuclide: 'U-235', chain: false })
    expect(parseNuclideHash('#n=U-238;chain')).toEqual({ nuclide: 'U-238', chain: true })
    expect(parseNuclideHash('#n=92-235')).toEqual({ nuclide: '92-235', chain: false })
    expect(parseNuclideHash('#n')).toEqual({ nuclide: null, chain: false })
    for (const h of ['', '#s=abc', '#b=1', '#n=<script>', '#n=U-235;x', '#n=%E0%A4%A', '#nuclide']) expect(parseNuclideHash(h), h).toBeNull()
    expect(nuclideHash({ nuclide: 'Tc-99m', chain: false })).toBe('#n=Tc-99m')
    expect(nuclideHash({ nuclide: 'U-238', chain: true })).toBe('#n=U-238;chain')
    expect(nuclideHash({ nuclide: null, chain: false })).toBe('#n')
    expect(resolveNuclide('92-235', t)!.id).toBe('U-235')
    expect(resolveNuclide('43-99m', t)!.id).toBe('Tc-99m')
    expect(resolveNuclide('u235', t)!.id).toBe('U-235')
    expect(resolveNuclide('Tc-99m', t)!.id).toBe('Tc-99m')
    expect(resolveNuclide('Xx-1', t)).toBeNull()
    expect(resolveNuclide('200-1', t)).toBeNull()
  })
})

describe('decay-chain view', () => {
  const CASES: Array<[string, number, string[]]> = [['U-238', 21, ['Pb-206']], ['Th-232', 12, ['Pb-208']], ['Mo-99', 4, ['Ru-99']], ['Cs-137', 3, ['Ba-137']]]
  for (const [parent, members, ends] of CASES) {
    it(`${parent}: the network on the N–Z plane and the amounts in time are the core's`, async () => {
      const t = await loadNuclideTable()
      const chain = await nuclideChain(parent)
      const layout = chainLayout(chain, t)
      expect(layout.members).toBe(members)
      expect(layout.nodes.length).toBe(chain.nuclides.length)
      expect(layout.edges.length).toBe(chain.edges.length)
      for (const end of ends) expect(layout.stableEnds).toContain(nuclideLabel(end))
      expect(layout.nodes.filter(n => n.parent).map(n => n.id)).toEqual([parent])
      // every box inside the picture, no two in the same place
      const places = new Set(layout.nodes.map(n => `${n.col},${n.row}`))
      expect(places.size).toBe(layout.nodes.length)
      for (const n of layout.nodes) { expect(n.col).toBeGreaterThanOrEqual(0); expect(n.col + 1).toBeLessThanOrEqual(layout.cols + 0.5); expect(n.row).toBeGreaterThanOrEqual(0); expect(n.row).toBeLessThanOrEqual(layout.rows) }
      // an α decay goes two columns to the left and two rows down, a β⁻ decay one to the left and one up
      for (const e of chain.edges) {
        const a = layout.nodes[e.from], b = layout.nodes[e.to]
        if (a.state || b.state) continue
        if (e.mode === 'A') expect([b.N - a.N, b.Z - a.Z]).toEqual([-2, -2])
        if (e.mode === 'B-') expect([b.N - a.N, b.Z - a.Z]).toEqual([-1, 1])
      }
      // each nuclide that decays has a main branch
      for (const n of layout.nodes) { const out = layout.edges.filter(e => e.from === n.index); if (out.length) expect(out.filter(e => e.main).length, n.id).toBeGreaterThanOrEqual(1) }
      expect(strings(layout).find(s => BROKEN.test(s))).toBeUndefined()

      const half = chain.nuclides[0].halfLife!
      const times = sampleTimes(5 * half, 121, true)
      expect(times[times.length - 1]).toBe(5 * half)
      const r = await nuclideDecay({ [parent]: 1 }, { times }, { unit: 'mol' })
      for (const quantity of ['A', 'N'] as const) for (const logValue of [true, false]) {
        const view = decayView(r, { quantity, logTime: true, logValue, dark: false })
        expect(view.curves.length).toBeGreaterThanOrEqual(2)
        expect(view.curves.length).toBeLessThanOrEqual(8)
        expect(view.curves[0].id).toBe(parent)
        expect(view.method).not.toMatch(BROKEN)
        const n = r.t.length
        for (const c of view.curves) {
          const i = r.nuclides.indexOf(c.id)
          expect(c.x.length).toBe(n); expect(c.y.length).toBe(n)
          // a drawn value is the core's value (or its logarithm), a gap where the core's value is zero or negligible
          for (const k of [0, 30, 60, 120]) {
            const v = (quantity === 'A' ? r.A : r.N)[i * n + k]
            if (!logValue) expect(c.y[k]).toBe(v)
            else if (Number.isFinite(c.y[k])) expect(c.y[k]).toBe(Math.log10(v))
          }
        }
        const rows = decayRows(r, n - 1, view)
        expect(rows.length).toBe(r.nuclides.length)
        expect(rows[0].N).toBe(sig(r.N[n - 1], 4))
        expect(rows[0].A).toBe(withUnit(sig(r.A[n - 1], 4), 'Bq'))
        expect(strings(rows).find(s => BROKEN.test(s))).toBeUndefined()
        expect(sampleTime(r, n - 1)).toBe(halfLifeText(r.t[n - 1], 3))
      }
      // after five half-lives 1/32 of the parent is left: the core's number, shown as it is
      expect(r.N[r.t.length - 1] * 32 / r.total).toBeCloseTo(1, 9)
    })
  }

  it('shows the diagnostics of the core with the result', async () => {
    const r = await nuclideDecay({ 'U-238': 1 }, { grid: { tEnd: 1e17, samples: 50 } }, { unit: 'mol' })
    expect(r.diagnostics.some(d => d.code === 'nuclide.isomerFeeding')).toBe(true)
    try {
      for (const lang of LANGS) {
        locale.lang = lang
        const lines = diagnosticLines(r.diagnostics)
        const pa = lines.find(l => l.code === 'nuclide.isomerFeeding' && l.text.includes('²³⁴ᵐPa'))!
        expect(pa.severity).toBe('approx')
        expect(pa.text).toContain('²³⁴Th')
        expect(pa.text).toContain('β⁻')
        if (lang !== 'zh') expect(CJK.test(pa.text)).toBe(false)
        // each line once
        expect(new Set(lines.map(l => l.text)).size).toBe(lines.length)
      }
    } finally { locale.lang = 'zh' }
    const mo = await nuclideDecay({ 'Mo-99': 1e6 }, { grid: { tEnd: 1186776, samples: 200 } }, { unit: 'Bq' })
    expect(diagnosticLines(mo.diagnostics).map(l => l.code)).toEqual(['nuclide.matrixSolution'])
    // Mo-99 feeds Tc-99m with 87.78 % (the feeding fraction of the table): no isomer diagnostic
    expect(mo.diagnostics.some(d => d.code === 'nuclide.isomerFeeding')).toBe(false)
  })
})

describe('diagnostics and errors of the nuclear and reactor operations', () => {
  const rust = (dir: string) => readdirSync(dir).filter(f => f.endsWith('.rs')).map(f => readFileSync(join(dir, f), 'utf8')).join('\n')
  const source = rust('engine/velophi-chem/src/nuclear') + rust('engine/velophi-chem/src/reactor')

  it('has a text in three languages for every code the core can return, and the codes are listed in engine/MESSAGES.md', () => {
    const codes = [...new Set([...source.matchAll(/diagnostic\(\s*"((?:nuclide|reactor)\.[A-Za-z]+)"/g)].map(m => m[1]))].sort()
    expect(codes).toEqual([...NUCLEAR_CODES].sort())
    const doc = readFileSync('engine/MESSAGES.md', 'utf8')
    const params: Record<string, unknown> = { nuclide: 'Th-234', mode: 'B-', isomer: 'Pa-234m', assumed: 'Pa-234', sum: 0.97, values: 12, of: 400, residual: 1e-6, k: 0.99721, t: 812.5, rho: 0.00684, limit: 0.00684, shim: 0.0028, solves: 6, reason: 'period', value: 7.01, fuelT: 3150 }
    try {
      for (const lang of LANGS) {
        locale.lang = lang
        for (const code of NUCLEAR_CODES) {
          const text = diagnosticText({ code, severity: 'info', params } as CoreDiagnostic)
          expect(text.length, code).toBeGreaterThan(8)
          expect(text.includes(code), code).toBe(false)
          expect(BROKEN.test(text), `${code}: ${text}`).toBe(false)
          expect(/\{\w+\}/.test(text), `${code}: ${text}`).toBe(false)
          if (lang !== 'zh') expect(CJK.test(text), `${lang} ${code}: ${text}`).toBe(false)
          expect(doc.includes('`' + code + '`'), `engine/MESSAGES.md lists ${code}`).toBe(true)
        }
        // the four reasons of a trip are worded, each differently (no key such as `fuelTemperature` is shown)
        const trips = ['power', 'period', 'fuelTemperature', 'manual'].map(reason => diagnosticText({ code: 'reactor.trip', severity: 'info', params: { ...params, reason } }))
        expect(new Set(trips).size).toBe(4)
        expect(trips.some(x => x.includes('fuelTemperature'))).toBe(false)
      }
    } finally { locale.lang = 'zh' }
    expect(diagnosticText({ code: 'nuclide.somethingNew', severity: 'info' })).toBe('nuclide.somethingNew')
  })

  it('names the part that failed for every error prefix of the core, in three languages', async () => {
    const prefixes = [...new Set([...source.matchAll(/format!\("([a-z ]+): \{\}", what\.into\(\)\)/g)].map(m => m[1]))].sort()
    expect(prefixes).toEqual(['decay network', 'nuclide', 'nuclide data', 'reactor', 'reactor data', 'reactor task'])
    // every error of these operations is err.internal with such a prefix
    expect([...source.matchAll(/Message::new\("([^"]+)"\)/g)].every(m => m[1] === 'err.internal')).toBe(true)
    let caught: unknown = null
    try { await nuclideChain('Xx-999') } catch (e) { caught = e }
    expect(caught).not.toBeNull()
    try {
      for (const lang of LANGS) {
        locale.lang = lang
        const text = nuclearErrorText(caught)
        expect(text).toContain("'Xx-999' is not in the table")
        expect(text.startsWith('nuclide:')).toBe(false)
        if (lang !== 'zh') expect(CJK.test(text)).toBe(false)
        for (const p of prefixes) { const s = nuclearErrorText(new Error(`${p}: detail`)); expect(s.endsWith('detail')).toBe(true); expect(s.includes(`${p}:`)).toBe(false); if (lang !== 'zh') expect(CJK.test(s)).toBe(false) }
      }
    } finally { locale.lang = 'zh' }
  })
})
