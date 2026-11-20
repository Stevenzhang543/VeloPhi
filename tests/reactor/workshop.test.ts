/**
 * The reactor workshop's state and actions (26.64, D277; src/nuclear/reactor/workshop.ts) on the core the application
 * ships: the numbers it holds are the core's own (compared with direct calls), editing and running behave as the
 * page needs, the recorded series stay bounded, and each of the six tasks is solvable through the public controls —
 * not passed at the start, passed after an operator did what the task asks (the verdict is the core's).
 */
import { describe, expect, it } from 'vitest'
import { reactorAdvance, reactorBalance, reactorCriticality, reactorPresets } from '../../src/engine/nuclear'
import type { ReactorTask } from '../../src/engine/nuclear'
import type { Workshop } from '../../src/nuclear/reactor/workshop'
import { HISTORY_KEYS, HISTORY_LIMIT, cellKey, clone, createWorkshop, rodOrder } from '../../src/nuclear/reactor/workshop'
import { REFUEL_ENRICHMENT, TASKS, checkText, taskGoal, taskTitle } from '../../src/nuclear/reactor/tasks'
import { locale } from '../../src/i18n/locale'

const CJK = /[一-鿿]/

/**
 * An operator at the rods, using only what the page offers (rod target, rod speed, the readouts): every `dt` seconds
 * the rod target moves by a share of what the reactivity is away from the wanted one. `worth` is the reactivity per unit of
 * insertion near the working point and `limit` the largest move of one order; far below critical the rods travel fast,
 * near critical slowly — a rod that moves too fast shortens the period and trips the protection, as in the model.
 * Stops when `done` says so.
 */
async function operate(ws: Workshop, opts: { want: (n: number) => number; worth: number; limit: number; slow: number; fast: number; dt: number; steps: number; done: () => Promise<boolean> | boolean }): Promise<boolean> {
  const s = ws.s
  for (let i = 0; i < opts.steps; i++) {
    if (!s.run || s.run.ended || s.run.trip) return false
    const rho = s.last.rho ?? -1
    const rods = s.run.rods[0]
    const gap = rho - opts.want(s.run.n)
    s.rodSpeed = rho < -0.02 ? opts.fast : opts.slow
    const limit = rho < -0.02 ? 0.05 : opts.limit
    const move = Math.max(-limit, Math.min(limit, 0.4 * gap / opts.worth))
    // the next order is given when the rods have arrived
    if (Math.abs(rods - (s.run.targets[0] ?? rods)) < 1e-6) { s.rodTarget = Math.max(0, Math.min(1, rods + move)); ws.control({ rods: s.rodTarget }) }
    await ws.step(opts.dt, 2)
    if (process.env.OPLOG && i % 20 === 0) console.log(i, s.run.t.toFixed(0), 'rods', s.run.rods[0].toFixed(4), 'tg', s.run.targets[0].toFixed(4), 'rho', (s.last.rho ?? 0).toExponential(2), 'n', s.run.n.toExponential(2), 'per', (s.last.period ?? 0).toExponential(1))
    if (await opts.done()) return true
  }
  return false
}

describe('reactor workshop: state', () => {
  it('holds the numbers of the core for the layout, and solves again after every edit', async () => {
    const ws = createWorkshop()
    await ws.init('research')
    const s = ws.s
    expect(s.ready).toBe(true)
    expect(s.error).toBe('')
    expect(ws.presetIds()).toEqual(['pwrLattice', 'graphitePile', 'heavyWater', 'research'])
    expect(s.materials.length).toBe(12)
    const preset = (await reactorPresets())[3].doc
    const direct = await reactorCriticality(preset)
    expect(s.crit!.keff).toBe(direct.keff)
    expect(s.crit!.flux2.length).toBe(direct.nx * direct.ny)
    expect(s.presetId).toBe('research')

    // all rods out: supercritical; one rod alone moved: between the two
    await ws.setRodInsertion(null, 0)
    const out = s.crit!.keff
    expect(out).toBeGreaterThan(1.002)
    const key = rodOrder(s.doc!)[0]
    await ws.setRodInsertion(key, 1)
    expect(s.crit!.keff).toBeLessThan(out)
    expect(s.crit!.keff).toBeGreaterThan(direct.keff)
    expect(s.doc!.rods![key].insertion).toBe(1)
    await ws.setRodInsertion(null, 2)
    expect(s.rodTarget).toBe(1)
    expect(s.crit!.keff).toBe(direct.keff)

    // painting a fuel cell with graphite lowers k; the layout is now a custom one
    const nx = s.doc!.grid.nx
    const fuelAt = s.doc!.cells.findIndex((c, i) => c === 'fuel_leu' && Math.abs(i % nx - 18) < 2 && Math.abs(Math.floor(i / nx) - 18) < 2)
    await ws.paint(fuelAt % nx, Math.floor(fuelAt / nx), 'graphite')
    expect(s.presetId).toBe('custom')
    expect(s.crit!.keff).toBeLessThan(direct.keff)
    expect(s.crit!.keff).toBe((await reactorCriticality(clone(s.doc!))).keff)
    await ws.paint(-1, 0, 'water')
    await ws.paint(fuelAt % nx, Math.floor(fuelAt / nx), 'fuel_leu')
    expect(s.crit!.keff).toBe(direct.keff)

    // enrichment stays within what the material table offers (at most 5 %)
    await ws.setEnrichment(20)
    expect(s.doc!.enrichment).toBe(5)
    await ws.setEnrichment(0.1)
    expect(s.doc!.enrichment).toBe(0.72)
    await ws.setEnrichment(5)
    await ws.setEnrichment(3, cellKey(fuelAt % nx, Math.floor(fuelAt / nx)))
    expect(s.crit!.keff).toBeLessThan(direct.keff)

    // rods and detectors
    const rods = Object.keys(s.doc!.rods!).length
    await ws.toggleRod(2, 2, 'agincd')
    expect(Object.keys(s.doc!.rods!).length).toBe(rods + 1)
    await ws.toggleRod(2, 2, 'agincd')
    expect(Object.keys(s.doc!.rods!).length).toBe(rods)
    await ws.toggleDetector(5, 5)
    expect(s.crit!.detectors.map(d => d.cell)).toContain('5,5')
    await ws.toggleDetector(5, 5)
    expect(s.doc!.detectors).not.toContain('5,5')

    // a layout the core refuses is reported, not thrown
    for (let i = 0; i < s.doc!.cells.length; i++) if (s.doc!.cells[i] === 'fuel_leu') s.doc!.cells[i] = 'water'
    await ws.solve()
    expect(s.crit).toBeNull()
    expect(s.error).toContain('no cell contains fuel')
    await ws.loadPreset('research')
    expect(s.error).toBe('')
    expect(s.crit!.keff).toBe(direct.keff)
  })

  it('runs: records what the core returned, scrams, resets, and ends the run when the layout changes', async () => {
    const ws = createWorkshop()
    await ws.init('research')
    const s = ws.s
    await ws.start('power')
    expect(s.run).not.toBeNull()
    expect(Math.abs(s.run!.n - 1)).toBeLessThan(1e-9)
    // the maps now belong to the running state
    expect(Math.abs(s.crit!.keff - 1)).toBeLessThan(1e-4)
    const direct = await reactorAdvance(clone(s.doc!), { state: clone(s.run!), dt: 30, samples: 6, controls: { rodSpeed: s.rodSpeed }, maxSolves: 6 })
    const r = (await ws.step(30, 6))!
    expect(r.state.hash).toBe(direct.state.hash)
    expect(s.history.t).toEqual(Array.from(direct.t))
    for (const k of HISTORY_KEYS) expect(s.history[k], k).toEqual(Array.from(direct.series[k]))
    expect(s.last.n).toBe(direct.series.n[5])
    expect(s.loop).toEqual(direct.state.loop)

    // the budget adds up to the reactivity of the state (the core's own identity)
    await ws.computeBalance()
    const b = await reactorBalance(clone(s.doc!), clone(s.run!))
    expect(s.balance!.entries).toEqual(b.entries)
    expect(Math.abs(s.balance!.entries.reduce((a, e) => a + e.rho, 0) - s.balance!.rho)).toBeLessThan(1e-12)

    await ws.scram()
    expect(s.run!.scram).toBe(true)
    expect(s.run!.trip!.reason).toBe('manual')
    expect(s.events.map(e => e.kind)).toEqual(['trip'])
    await ws.step(60, 4)
    expect(s.run!.n).toBeLessThan(0.1)
    expect(s.run!.rods.every(x => x === 1)).toBe(true)
    await ws.resetTrip()
    expect(s.run!.trip).toBeNull()
    expect(s.run!.scram).toBe(false)

    // a long run keeps a bounded record
    for (let i = 0; i < 70; i++) await ws.step(600, 40)
    expect(s.history.t.length).toBeLessThanOrEqual(HISTORY_LIMIT)
    expect(s.history.t.length).toBeGreaterThan(HISTORY_LIMIT / 2)
    for (const k of HISTORY_KEYS) expect(s.history[k].length).toBe(s.history.t.length)
    for (let i = 1; i < s.history.t.length; i++) expect(s.history.t[i]).toBeGreaterThan(s.history.t[i - 1])

    // changing the layout ends the run and says so once
    await ws.paint(0, 0, 'graphite')
    expect(s.run).toBeNull()
    expect(s.notice).toBe('runReset')
    expect(s.history.t).toEqual([])
    await ws.stop()
    expect(s.run).toBeNull()
  })

  it('stops where the model stops: before prompt critical, with the reason of the core', async () => {
    const ws = createWorkshop()
    await ws.init('research')
    const s = ws.s
    ws.setProtection({ enabled: false })
    await ws.start('cold')
    s.rodSpeed = 0.05
    ws.control({ rods: 0 })
    for (let i = 0; i < 40 && !s.run!.ended; i++) await ws.step(20, 4)
    expect(s.run!.ended!.reason).toBe('validity')
    expect(s.events.some(e => e.kind === 'validity')).toBe(true)
    expect(s.diagnostics.some(d => d.code === 'reactor.promptCritical' && d.severity === 'unmodelled')).toBe(true)
    expect(s.history.rho.every(r => r < s.run!.ended!.limit)).toBe(true)
    // nothing is computed beyond
    const t = s.run!.t
    expect(await ws.step(10)).toBeNull()
    expect(s.run!.t).toBe(t)
  })
})

describe('reactor workshop: the six tasks', () => {
  it('have a title, a goal and worded checks in three languages', async () => {
    expect(TASKS.map(t => t.id)).toEqual(['critical', 'power', 'xenonRestart', 'lossOfCooling', 'minimalChange', 'refuel'])
    const ids = ['reactivity', 'notTripped', 'held', 'recorded', 'now', 'shutDown', 'xenonAbove', 'running', 'coolingLost', 'noScram', 'powerFell', 'fuelWhole', 'startSubcritical', 'critical', 'changes', 'onlyFuel', 'peak']
    try {
      for (const lang of ['zh', 'en', 'de'] as const) {
        locale.lang = lang
        for (const t of TASKS) {
          for (const text of [taskTitle(t.id), taskGoal(t.id)]) { expect(text.length).toBeGreaterThan(1); if (lang !== 'zh') expect(CJK.test(text), text).toBe(false) }
          for (const id of ids) for (const [value, limit] of [[0.5, 1], [NaN, NaN]]) {
            const text = checkText(t.id, { id, ok: false, value, limit })
            expect(/NaN|undefined|\{\d\}/.test(text), `${id}: ${text}`).toBe(false)
            expect(text.startsWith(id + ':'), id).toBe(false)
            if (lang !== 'zh') expect(CJK.test(text), text).toBe(false)
          }
        }
      }
    } finally { locale.lang = 'zh' }
  })

  /** Start a task; it must not be passed yet. */
  async function begin(id: ReactorTask): Promise<Workshop> {
    const ws = createWorkshop()
    await ws.init('research')
    await ws.startTask(id)
    expect(ws.s.error).toBe('')
    expect(ws.s.task.id).toBe(id)
    const r = await ws.checkTask()
    expect(r!.passed, `${id} is not passed at the start`).toBe(false)
    expect(r!.checks.length).toBeGreaterThanOrEqual(2)
    return ws
  }

  it('1 · reach criticality: slow withdrawal from the cold core', async () => {
    const ws = await begin('critical')
    const s = ws.s
    expect(s.presetId).toBe('research')
    expect(s.run!.n).toBeLessThan(1e-6)
    const ok = await operate(ws, { want: () => 0, worth: 0.2, limit: 0.002, slow: 0.002, fast: 0.02, dt: 20, steps: 400, done: async () => (await ws.checkTask())!.passed })
    expect(ok).toBe(true)
    expect(s.run!.trip).toBeNull()
    expect(Math.abs(s.task.result!.checks.find(c => c.id === 'reactivity')!.value)).toBeLessThan(0.00076)
  })

  it('2 · raise the power to the rated value and hold it for a minute', async () => {
    const ws = await begin('power')
    const s = ws.s
    // a positive period on the way up, then hold: the wanted reactivity falls to zero as the power nears 1
    const want = (n: number) => Math.max(-0.0008, Math.min(0.0012, 0.004 * (1 - n)))
    let held = 0
    const ok = await operate(ws, { want, worth: 0.2, limit: 0.002, slow: 0.002, fast: 0.02, dt: 5, steps: 4000, done: async () => { if (Math.abs(s.run!.n - 1) < 0.015) held++; else held = 0; return held >= 16 && (await ws.checkTask())!.passed } })
    expect(s.run!.trip).toBeNull()
    expect(ok).toBe(true)
    expect(s.task.result!.checks.map(c => c.ok)).toEqual([true, true, true, true])
  })

  it('3 · restart in the iodine pit', async () => {
    const ws = await begin('xenonRestart')
    const s = ws.s
    expect(s.presetId).toBe('pwrLattice')
    expect(Math.abs(s.run!.n - 1)).toBeLessThan(1e-6)
    await ws.scram()
    for (let i = 0; i < 4; i++) await ws.step(1800, 4)
    expect(s.run!.xenon).toBeGreaterThan(s.run!.stats.xenonAtScram as number)
    await ws.resetTrip()
    expect(s.run!.scram).toBe(false)
    // the rods of this lattice are worth much: near critical they move very slowly
    const ok = await operate(ws, { want: n => (n < 0.03 ? 0.0006 : 0.0002), worth: 0.8, limit: 0.0004, slow: 0.0001, fast: 0.02, dt: 20, steps: 4000, done: async () => s.run!.n >= 0.05 && (await ws.checkTask())!.passed })
    expect(s.run!.trip).toBeNull()
    expect(ok).toBe(true)
    expect(s.run!.n).toBeGreaterThanOrEqual(0.05)
  })

  it('4 · loss of cooling without a scram: the feedback limits the power', async () => {
    const ws = await begin('lossOfCooling')
    const s = ws.s
    expect(s.presetId).toBe('heavyWater')
    expect(s.doc!.protection!.enabled).toBe(false)
    ws.control({ pump: 0 })
    expect(s.loop.pump).toBe(0)
    for (let i = 0; i < 40 && s.run!.t < 400; i++) await ws.step(30, 3)
    const r = (await ws.checkTask())!
    expect(r.checks.map(c => [c.id, c.ok])).toEqual([['coolingLost', true], ['noScram', true], ['powerFell', true], ['fuelWhole', true]])
    expect(r.passed).toBe(true)
    expect(s.run!.scram).toBe(false)
    expect(s.run!.ended).toBeNull()
  })

  it('5 · the smallest change: one rod withdrawn makes the layout critical', async () => {
    const ws = await begin('minimalChange')
    const s = ws.s
    expect(s.run).toBeNull()
    expect(s.crit!.keff).toBeLessThan(1)
    // two changes are one too many
    const [a, b] = rodOrder(s.doc!)
    await ws.setRodInsertion(null, 0)
    let r = (await ws.checkTask())!
    expect(r.checks.find(c => c.id === 'critical')!.ok).toBe(true)
    expect(r.checks.find(c => c.id === 'changes')!.ok).toBe(false)
    await ws.setRodInsertion(b, 1)
    r = (await ws.checkTask())!
    expect(r.passed).toBe(true)
    expect(s.doc!.rods![a].insertion).toBe(0)
  })

  it('6 · refuelling: eight fresh cells in the middle, none at the edge', async () => {
    const ws = await begin('refuel')
    const s = ws.s
    expect(s.doc!.enrichment).toBe(REFUEL_ENRICHMENT)
    expect(s.crit!.keff).toBeLessThan(1)
    expect(s.crit!.keff).toBeGreaterThan(0.99)
    const nx = s.doc!.grid.nx
    const fuel = s.doc!.cells.map((c, i) => [c, i] as const).filter(([c]) => c === 'fuel_leu').map(([, i]) => [i % nx, Math.floor(i / nx)] as const)
    const byCentre = [...fuel].sort((p, q) => (p[0] - 17.5) ** 2 + (p[1] - 17.5) ** 2 - ((q[0] - 17.5) ** 2 + (q[1] - 17.5) ** 2))
    // eight cells at the edge of the core do not do it
    for (const [x, y] of byCentre.slice(-8)) await ws.setEnrichment(5, cellKey(x, y))
    expect((await ws.checkTask())!.passed).toBe(false)
    await ws.startTask('refuel')
    for (const [x, y] of byCentre.slice(0, 8)) await ws.setEnrichment(5, cellKey(x, y))
    const r = (await ws.checkTask())!
    expect(r.checks.map(c => [c.id, c.ok])).toEqual([['startSubcritical', true], ['critical', true], ['onlyFuel', true], ['changes', true], ['peak', true]])
    expect(r.passed).toBe(true)
    // a ninth cell is one too many
    await ws.setEnrichment(5, cellKey(byCentre[8][0], byCentre[8][1]))
    expect((await ws.checkTask())!.checks.find(c => c.id === 'changes')!.ok).toBe(false)
  })
})
