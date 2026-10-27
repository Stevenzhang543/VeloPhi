/**
 * Branches (manual 26.51, D52): a branch from frame k continues the parent (without changes it follows the
 * parent's motion and ledger), keeps variable forces on the absolute clock, reruns from the saved file with the
 * same fingerprint, and changing μ at the branch point changes only what follows.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import { simulate, frameState, frameLedger } from '../src/engine/recording'
import { branchPath, branchScene, nextBranchId, startTimeOf, withoutBranch } from '../src/core/scene/branch'
import { parseScene, serializeScene } from '../src/core/scene/io'
import { addBody, addConnector, addGround, emptyScene, anchor } from '../src/core/scene/build'
import type { ForceDef } from '../src/core/scene/types'
import { referenceTemplates } from '../src/templates'
import { simulate as refSimulate } from './reference/core/solver/simulation'
import { refBranchScene } from './reference/core/scene/branch'

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b))

describe('branch scene from the core', () => {
  it('equals the branch scene of the TypeScript reference (26.52) for every template', () => {
    const text = (x: unknown) => JSON.stringify(x, (_k, v) => (Object.is(v, -0) ? '-0' : v))
    for (const t of referenceTemplates()) {
      const scene = buildTemplate(t.id, {})
      const rec = simulate(scene), ref = refSimulate(buildTemplate(t.id, {}))
      for (const k of [1, Math.floor(rec.frameCount / 3), rec.frameCount - 2]) expect(text(branchScene(rec, k)), `${t.id} frame ${k}`).toBe(text(refBranchScene(ref, k)))
    }
  })
})

describe('branch from a frame', () => {
  it('without changes follows the parent (motion and energy ledger)', () => {
    for (const id of ['incline', 'pendulum', 'spring', 'atwood', 'board-block', 'collision-1d']) {
      const scene = buildTemplate(id, {})
      const rec = simulate(scene)
      const k = Math.floor(rec.frameCount / 3)
      const b = branchScene(rec, k)!
      expect(b.settings.startTime).toBeCloseTo(k * rec.dt, 12)
      const br = simulate(b)
      expect(br.error, id).toBeNull()
      expect(br.frameCount).toBe(rec.frameCount - k)
      const n = rec.system.n
      for (const j of [0, Math.floor(br.frameCount / 2), br.frameCount - 1]) {
        const A = frameState(rec, k + j), B = frameState(br, j)
        for (let c = 0; c < 6 * n; c++) expect(close(A[c], B[c], 1e-6), `${id} frame ${j} component ${c}: ${A[c]} vs ${B[c]}`).toBe(true)
        const la = frameLedger(rec, k + j), lb = frameLedger(br, j)
        expect(close(la.balance, lb.balance, 1e-6), `${id} ledger`).toBe(true)
        expect(close(la.frictionHeat, lb.frictionHeat, 1e-6), `${id} heat`).toBe(true)
      }
    }
  })

  it('keeps variable forces on the absolute clock', () => {
    const s = emptyScene('force')
    s.settings.gravity = { x: 0, y: 0 }
    s.settings.duration = 2
    addGround(s, { top: -5 })
    const b = addBody(s, { id: 'b', name: 'b', shape: { type: 'circle', radius: 0.1 }, position: { x: 0, y: 0 }, mass: 1 })
    addConnector<ForceDef>(s, { name: 'F', type: 'force', a: anchor(b, { x: 0, y: 0 }), force: { x: 0, y: 0 }, expr: { x: 'if(t < 1, 1, -1)', y: '0' } })
    const rec = simulate(s)
    const k = Math.round(0.5 / rec.dt)
    const br = simulate(branchScene(rec, k)!)
    const n = br.system.n
    // v = t for t < 1, then 2 − t: at t = 1.5 (local 1.0) v = 0.5
    const j = Math.round(1.0 / br.dt)
    expect(Math.abs(frameState(br, j)[3 * n] - 0.5)).toBeLessThan(1e-9)
    expect(Math.abs(frameState(rec, k + j)[3 * n] - 0.5)).toBeLessThan(1e-9)
  })

  it('changing μ at the branch point changes only what follows', () => {
    const scene = buildTemplate('incline', {})
    const rec = simulate(scene)
    const k = Math.floor(rec.frameCount / 4)
    const b = branchScene(rec, k)!
    for (const body of b.bodies) body.material = { ...body.material, muS: 0.05, muK: 0.05 }
    b.contactPairs = b.contactPairs.map(p => ({ ...p, muS: 0.05, muK: 0.05 }))
    const br = simulate(b)
    const n = rec.system.n
    const A = frameState(rec, k), B = frameState(br, 0)
    for (let c = 0; c < 6 * n; c++) expect(B[c]).toBe(A[c])
    const end = br.frameCount - 1
    expect(frameState(br, end)[3 * n]).not.toBeCloseTo(frameState(rec, k + end)[3 * n], 3)
  })

  it('reruns from the saved file with the same fingerprint', () => {
    const main = buildTemplate('board-block', {})
    const rec = simulate(main)
    const k = Math.floor(rec.frameCount / 2)
    const b = branchScene(rec, k)!
    b.bodies[b.bodies.length - 1].mass *= 2
    const first = simulate(b)
    main.branches = [{ id: nextBranchId([]), name: '质量加倍', parent: null, t: startTimeOf(b), scene: b }]
    const text = serializeScene(main)
    const back = parseScene(text).scene
    expect(serializeScene(back)).toBe(text)
    expect(back.branches![0].scene.settings.startLedger).toEqual(b.settings.startLedger)
    expect(simulate(back.branches![0].scene).hash).toBe(first.hash)
    // The main scene is unaffected by its branches
    expect(simulate(back).hash).toBe(rec.hash)
  })

  it('refuses the first and the last frame', () => {
    const rec = simulate(buildTemplate('spring', {}))
    expect(branchScene(rec, 0)).toBeNull()
    expect(branchScene(rec, rec.frameCount - 1)).toBeNull()
  })
})

describe('branch trees', () => {
  const list = [
    { id: 'b1', name: '', parent: null, t: 1, scene: emptyScene() },
    { id: 'b2', name: '', parent: 'b1', t: 2, scene: emptyScene() },
    { id: 'b3', name: '', parent: null, t: 1.5, scene: emptyScene() }
  ]
  it('paths, removal and ids', () => {
    expect(branchPath(list, 'b2')).toEqual([null, 'b1', 'b2'])
    expect(branchPath(list, null)).toEqual([null])
    expect(withoutBranch(list, 'b1').map(b => b.id)).toEqual(['b3'])
    expect(nextBranchId(list)).toBe('b4')
  })
  it('the file checks parents', () => {
    const s = emptyScene()
    s.branches = [{ id: 'b1', name: '', parent: 'b9', t: 1, scene: emptyScene() }]
    expect(() => parseScene(serializeScene(s))).toThrow()
  })
})
