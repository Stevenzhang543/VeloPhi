/**
 * The bench as the page's document (26.64, D268; src/chem/bench.ts): a document goes round (file, link, storage) and
 * replays to the same fingerprint; an action the core refuses leaves the bench as it was; undo and redo return to the
 * same fingerprints; the clock takes fixed steps, idles when nothing can change and wakes on an action; the working
 * bench survives a new start. The core is the WebAssembly build with the small catalogue of the bench tests.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setChemData } from '../../src/engine/chem'
import { BENCH_SHARE_PREFIX, STEP, atRest, createBench, extrasOf, parseBenchDoc } from '../../src/chem/bench'
import { setCatalogue } from '../../src/chem/catalog'
import type { Catalogue } from '../../src/chem/catalog'
import { decodeShare } from '../../src/app/share'

const root = join(__dirname, '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))

beforeAll(() => {
  const cat = json('tests/fixtures/chem/catalog-mini.json')
  setChemData(json('src/chem/data/aqueous.json'), cat)
  setCatalogue(cat as Catalogue)
})

function memory(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: k => { data.delete(k) } }
}

async function fresh(storage: ReturnType<typeof memory> | null = null) {
  const messages: Array<{ text: string; error: boolean }> = []
  const b = createBench({ storage, notify: (text, error) => messages.push({ text, error: !!error }) })
  await b.init(async () => {})
  return { b, messages }
}

describe('bench document', () => {
  it('goes round as a file and replays to the same fingerprint, with the vessels where they stood', async () => {
    const { b } = await fresh()
    const flask = b.place('erlenmeyer')!
    const bur = b.place('buretteBase')!
    expect(b.add(flask, 'HCl_0.1M', { value: 20, unit: 'mL' })).not.toBeNull()
    expect(b.add(bur, 'NaOH_0.1M', { value: 50, unit: 'mL' })).not.toBeNull()
    // the room changes in the middle of the log: a replay must start from the room the bench began with
    expect(b.apply({ act: 'ambient', T: 303.15 })).not.toBeNull()
    expect(b.pour(bur, flask, { value: 12.35, unit: 'mL' })).not.toBeNull()
    b.setExtras(flask, { x: 12.5, y: 0 })
    b.setExtras(bur, { above: flask })
    expect(b.attach(flask, 'phMeter')).toBe(true)
    b.start(); b.frame(2); b.pause()
    const hash = b.hash()
    const text = JSON.stringify(b.portableDoc())
    const doc = parseBenchDoc(text)
    // objects placed by the log are not listed a second time
    expect(doc.objects).toEqual([])
    expect(doc.log.filter(e => e.act === 'place').length).toBe(2)
    const { b: c } = await fresh()
    c.open(doc, 'x.velophi-bench.json')
    expect(c.hash()).toBe(hash)
    expect(c.extras(flask)).toMatchObject({ x: 12.5, y: 0, label: 'A', parts: ['phMeter'] })
    expect(c.extras(bur)).toMatchObject({ above: flask, label: 'B' })
    expect(c.vesselName(flask)).toBe('锥形瓶 A')
    expect(c.read(flask)!.pH).toBe(b.read(flask)!.pH)
    expect(c.dirty.value).toBe(false)
    expect(c.fileName.value).toBe('x.velophi-bench.json')
    // and once more: what the copy writes is what it read
    expect(JSON.stringify(c.portableDoc())).toBe(text)
    b.dispose(); c.dispose()
  })

  it('travels in a link packed like a scene link', async () => {
    const { b } = await fresh()
    const beaker = b.place('beaker')!
    b.add(beaker, 'NaCl_0.1M', { value: 30, unit: 'mL' })
    b.add(beaker, 'AgNO3_0.1M', { value: 5, unit: 'mL' })
    const link = await b.shareLink()
    expect(link).toContain(BENCH_SHARE_PREFIX)
    const data = link.slice(link.indexOf(BENCH_SHARE_PREFIX) + BENCH_SHARE_PREFIX.length)
    expect((await decodeShare(data))!.text).toBe(JSON.stringify(b.portableDoc()))
    const { b: c } = await fresh()
    expect(await c.openShared(link)).toBe(true)
    expect(c.hash()).toBe(b.hash())
    expect(c.vessels.value[0].solids.map(s => s.id)).toEqual(['Cerargyrite'])
    // a scene link or plain text is not a bench link
    expect(await c.openShared('https://example.org/#s=z1.abc')).toBe(false)
    b.dispose(); c.dispose()
  })

  it('refuses what is no bench document, with a reason, and keeps the bench', async () => {
    const { b, messages } = await fresh()
    b.place('beaker')
    const hash = b.hash()
    expect(b.openText('{"format":"velophi-scene"}', null)).toBe(false)
    expect(b.openText('not json', null)).toBe(false)
    // a log the core cannot replay: the document is not loaded at all
    expect(b.openText(JSON.stringify({ format: 'velophi-bench', version: 1, objects: [], log: [{ act: 'add', to: 'nowhere', reagent: 'water', amount: { value: 1, unit: 'mL' } }] }), null)).toBe(false)
    expect(messages.filter(m => m.error).length).toBe(3)
    expect(b.hash()).toBe(hash)
    expect(b.vessels.value.length).toBe(1)
    b.dispose()
  })
})

describe('bench actions', () => {
  it('a refused action did not happen: the state, the log and the fingerprint are unchanged, and a message says why', async () => {
    const { b, messages } = await fresh()
    const beaker = b.place('beaker', undefined, 100)!
    b.add(beaker, 'water', { value: 50, unit: 'mL' })
    const hash = b.hash(), entries = b.log.value.length
    expect(b.add(beaker, 'no_such_reagent', { value: 1, unit: 'mL' })).toBeNull()
    expect(b.add('nowhere', 'water', { value: 1, unit: 'mL' })).toBeNull()
    expect(b.add(beaker, 'water', { value: 1, unit: 'mol' })).toBeNull()
    expect(messages.length).toBe(3)
    expect(messages.every(m => m.error && m.text.startsWith('操作未执行'))).toBe(true)
    expect(messages[0].text).toContain('no_such_reagent')
    expect(b.hash()).toBe(hash)
    expect(b.log.value.length).toBe(entries)
    // 26.65 (D297 item 9): more than the open beaker holds runs over onto the bench — the core's overflow, one entry
    const brim = b.objectOf(beaker)!.brim_mL as number
    const out = b.add(beaker, 'water', { value: 500, unit: 'mL' })!
    expect(out.find(e => e.code === 'overflow')!.params.volume_mL).toBeCloseTo(550 - brim, 6)
    expect(b.vesselOf(beaker)!.volume_mL).toBeCloseTo(brim, 6)
    expect(b.vesselOf(beaker)!.spilled_mL).toBeCloseTo(550 - brim, 6)
    expect(b.log.value.length).toBe(entries + 1)
    b.undo()
    expect(b.hash()).toBe(hash)
    // a stoppered flask cannot run over: more than it holds is taken back at once, and not offered for redo
    const flask = b.place('erlenmeyer', undefined, 100)!
    b.apply({ act: 'stopper', vessel: flask, on: true })
    const h2 = b.hash()
    expect(b.add(flask, 'water', { value: 500, unit: 'mL' })).toBeNull()
    expect(messages[messages.length - 1].text).toContain('装不下')
    expect(b.hash()).toBe(h2)
    expect(b.canRedo.value).toBe(false)
    b.redo()
    expect(b.hash()).toBe(h2)
    b.dispose()
  })

  it('undoes and redoes through the core, keeping where things stand', async () => {
    const { b } = await fresh()
    const flask = b.place('erlenmeyer')!
    b.add(flask, 'HCl_0.1M', { value: 20, unit: 'mL' })
    const h1 = b.hash()
    b.add(flask, 'NaOH_0.1M', { value: 20, unit: 'mL' })
    const h2 = b.hash()
    expect(b.read(flask)!.pH).toBeCloseTo(7.0, 1)
    b.setExtras(flask, { x: 33 })
    b.undo()
    expect(b.hash()).toBe(h1)
    // the position is not chemistry: undo does not move the flask back
    expect(b.extras(flask).x).toBe(33)
    b.redo()
    expect(b.hash()).toBe(h2)
    expect(b.extras(flask).x).toBe(33)
    // delete with undo
    expect(b.removeVessel(flask)).toBe(true)
    expect(b.empty.value).toBe(true)
    b.undo()
    expect(b.hash()).toBe(h2)
    expect(b.vesselName(flask)).toBe('锥形瓶 A')
    b.dispose()
  })

  it('tools act through the log, and stop when they are taken off', async () => {
    const { b } = await fresh()
    const beaker = b.place('beaker')!
    b.add(beaker, 'water', { value: 100, unit: 'mL' })
    // 26.65 (D297): a burner is a thing of its own — a tripod and a lamp are set up under the beaker, unlit
    expect(b.attach(beaker, 'alcoholBurner')).toBe(true)
    expect(b.fixtures.value.map(f => f.kind)).toEqual(['tripod', 'alcoholBurner'])
    expect(b.vesselOf(beaker)!.heater).toBe(0)
    expect(b.useTool(beaker, 'alcoholBurner')).toBe(true)
    expect(b.vesselOf(beaker)!.heater).toBe(150)
    // the drawing follows the core: the lamp burns, its cap is off
    expect(b.fixtures.value.find(f => f.kind === 'alcoholBurner')).toMatchObject({ lit: true, cap: false })
    expect(b.partsOf(beaker)).toEqual(['alcoholBurner'])
    // one heat source at a time: on the hot plate the beaker is out of the flame, which heats nothing any more
    b.attach(beaker, 'hotPlate')
    expect(b.partsOf(beaker)).toEqual(['hotPlate'])
    expect(b.vesselOf(beaker)!.heater).toBe(0)
    // standing in the ice bath is the action
    b.attach(beaker, 'iceBath')
    expect(b.vesselOf(beaker)!.bath).toBe(273.15)
    b.detach(beaker, 'iceBath')
    expect(b.vesselOf(beaker)!.bath).toBeNull()
    const last = b.log.value[b.log.value.length - 1]
    expect(last).toEqual({ act: 'bath', vessel: beaker, T: null })
    b.dispose()
  })

  it('wires two electrodes into a circuit of the core and reads it', async () => {
    const { b } = await fresh()
    const cell = b.place('beaker')!
    b.add(cell, 'HCl_1M', { value: 100, unit: 'mL' })
    expect(b.addElectrode(cell, 'Zn(s)')).toBe('')
    expect(b.extras(cell).electrode).toBe('Zn(s)')
    expect(b.circuits.value.length).toBe(0)
    expect(b.addElectrode(cell, 'Cu(s)')).toBe('c1')
    expect(b.extras(cell).electrode).toBeNull()
    const c = b.circuitOf(cell)!
    expect(c).toMatchObject({ id: 'c1', on: true, connected: true, anode: 'a', load: 10 })
    expect(c.a.material).toBe('Zn(s)')
    expect(c.emf).toBeGreaterThan(0)
    expect(atRest(b.state.value!)).toBe(false)
    b.setCircuit('c1', { on: false })
    expect(b.circuitOf(cell)!.I).toBe(0)
    expect(atRest(b.state.value!)).toBe(true)
    // the vessel leaves with its circuit; undo brings the vessel back
    expect(b.removeVessel(cell)).toBe(true)
    expect(b.circuits.value.length).toBe(0)
    b.dispose()
  })
})

describe('bench clock', () => {
  it('takes fixed steps that merge into one entry of the log, and idles when nothing can change', async () => {
    const { b } = await fresh()
    const beaker = b.place('beaker')!
    b.add(beaker, 'water', { value: 100, unit: 'mL' })
    expect(b.frame(1)).toBe(0) // not running
    b.start()
    let steps = 0
    for (let i = 0; i < 60 && !b.idle.value; i++) steps += b.frame(1 / 60 * 30, 1000)
    expect(b.idle.value).toBe(true)
    // nothing happens in water at room temperature: the clock stops after 20 quiet steps (10 s of bench time)
    expect(steps).toBe(20)
    expect(b.time.value).toBeCloseTo(steps * STEP, 9)
    expect(b.log.value[b.log.value.length - 1]).toEqual({ act: 'wait', seconds: STEP, times: steps })
    expect(b.frame(10, 1000)).toBe(0)
    expect(b.time.value).toBeCloseTo(steps * STEP, 9)
    // an action wakes it: a burner means the bench changes for as long as it burns
    b.attach(beaker, 'alcoholBurner'); b.useTool(beaker, 'alcoholBurner')
    expect(b.idle.value).toBe(false)
    let more = 0
    for (let i = 0; i < 40; i++) more += b.frame(0.5, 1000)
    expect(more).toBeGreaterThanOrEqual(40)
    expect(b.idle.value).toBe(false)
    expect(b.vesselOf(beaker)!.T).toBeGreaterThan(298.2)
    b.pause()
    expect(b.frame(1)).toBe(0)
    b.dispose()
  })

  it('speeds up by taking more steps, inside a time budget', async () => {
    const { b } = await fresh()
    const tube = b.place('testTube')!
    b.add(tube, 'HCl_1M', { value: 10, unit: 'mL' })
    b.add(tube, 'Zn_granule', { value: 1, unit: 'g' })
    b.start()
    expect(b.frame(1, 1000)).toBe(2)
    b.setSpeed(60)
    expect(b.frame(1, 1000)).toBe(120)
    // zinc in acid keeps the clock going, and the drawing knows how much gas a second
    expect(b.idle.value).toBe(false)
    for (let i = 0; i < 5; i++) b.frame(1, 1000)
    expect(b.activity.get(tube)!.gas).toBeGreaterThan(1e-7)
    // a budget of zero milliseconds still makes progress, one step a frame
    expect(b.frame(1, 0)).toBe(1)
    expect(b.phenomena.value.some(p => p.vessel === tube && p.code === 'gas' && p.subject === 'H2(g)' && p.n > 0)).toBe(true)
    b.dispose()
  })

  it('runs to the end of a reaction and says whether the bench came to rest', async () => {
    const { b } = await fresh()
    const beaker = b.place('beaker')!
    b.add(beaker, 'HCl_0.1M', { value: 50, unit: 'mL' })
    b.add(beaker, 'CaCO3_powder', { value: 0.1, unit: 'g' })
    const r = await b.runToEnd(50)
    expect(r.settled).toBe(true)
    expect(r.seconds).toBeGreaterThanOrEqual(10)
    expect(atRest(b.state.value!)).toBe(true)
    expect(b.finishing.value).toBe(false)
    const waits = b.log.value.filter(e => e.act === 'wait')
    expect(waits.length).toBe(1)
    b.dispose()
  })
})

describe('working bench in the storage', () => {
  it('is written after a change and comes back at the next start', async () => {
    const storage = memory()
    const { b } = await fresh(storage)
    const flask = b.place('erlenmeyer')!
    b.add(flask, 'HAc_0.1M', { value: 25, unit: 'mL' })
    b.setExtras(flask, { x: 7 })
    b.flushAutosave()
    expect(storage.data.size).toBe(1)
    const hash = b.hash()
    b.dispose()
    const { b: c } = await fresh(storage)
    expect(c.hash()).toBe(hash)
    expect(extrasOf(c.objectOf(flask)).x).toBe(7)
    // a new bench clears it; a damaged entry gives an empty bench instead of an error
    c.reset()
    expect(storage.data.size).toBe(0)
    c.dispose()
    storage.setItem('velophi.bench.v1', '{"doc":{"format":"velophi-bench","version":1,"objects":[],"log":[{"act":"remove","id":"ghost"}]}}')
    const { b: d } = await fresh(storage)
    expect(d.empty.value).toBe(true)
    d.dispose()
  })
})
