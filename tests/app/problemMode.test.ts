/**
 * Problem mode (26.52, D40): opening a problem replaces the scene and starts a session at t = 0, revealing plays the
 * run, trying again clears the answers, another set of numbers rebuilds the built-in problem with new parameters,
 * a problem written for the current scene starts in teacher mode, and problem files open through the scene command.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Scene } from '../../src/core/scene/types'

const state = { dirty: false, page: 'settings', rightTab: 'inspect', bottomTab: 'events', showProblems: true, problem: null as unknown, scene: null as unknown as Scene }
const loadScene = vi.fn((s: Scene) => { state.scene = s; state.problem = null })
const rewind = vi.fn(), play = vi.fn(), showToast = vi.fn()
vi.mock('../../src/app/store', () => ({ state, loadScene, rewind, play, showToast }))
vi.mock('../../src/app/trialLog', () => ({ logEvent() {} }))
const saved: string[] = []
vi.mock('../../src/platform/files', () => ({ openTextFile: vi.fn(), saveFile: vi.fn(async (text: string) => { saved.push(text); return 'p.json' }) }))
vi.mock('../../src/platform/ask', () => ({ ask: vi.fn(async () => true) }))

const pm = await import('../../src/app/problemMode')
const { BUILTIN_PROBLEMS } = await import('../../src/teaching/problemBank')
const { parseProblem } = await import('../../src/teaching/problems')

type Session = { problem: { builtin?: string; scene: Scene; questions: unknown[] }; answers: Record<string, number | null>; revealed: boolean; editing: boolean }
const session = () => state.problem as Session

afterEach(() => { vi.clearAllMocks() })

describe('problem mode', () => {
  it('opens a built-in problem, reveals and tries again', async () => {
    expect(await pm.openBuiltin(BUILTIN_PROBLEMS[2])).toBe(true)
    expect(loadScene).toHaveBeenCalledTimes(1)
    expect(session().problem.builtin).toBe(BUILTIN_PROBLEMS[2].id)
    expect(state.rightTab).toBe('problem')
    expect(state.page).toBe('studio')
    expect(state.showProblems).toBe(false)
    expect(rewind).toHaveBeenCalled()
    session().answers.a = 3.2
    pm.reveal()
    expect(session().revealed).toBe(true)
    expect(play).toHaveBeenCalled()
    pm.retry()
    expect(session().revealed).toBe(false)
    expect(session().answers).toEqual({})
  })

  it('another set of numbers rebuilds the scene with parameters in range', async () => {
    await pm.openBuiltin(BUILTIN_PROBLEMS[0])
    const spec = BUILTIN_PROBLEMS[0]
    for (let i = 0; i < 5; i++) {
      await pm.anotherSet()
      const values = (state.scene.extra as { template: { values: Record<string, number> } }).template.values
      for (const [k, [lo, hi]] of Object.entries(spec.vary)) { expect(values[k]).toBeGreaterThanOrEqual(lo); expect(values[k]).toBeLessThanOrEqual(hi) }
      expect(session().problem.builtin).toBe(spec.id)
    }
  })

  it('writes a problem for the current scene in teacher mode and exports it', async () => {
    await pm.openBuiltin(BUILTIN_PROBLEMS[1])
    pm.exitProblem()
    expect(state.problem).toBeNull()
    pm.newProblemFromScene()
    expect(session().editing).toBe(true)
    expect(session().problem.questions).toHaveLength(0)
    await pm.exportProblem()
    expect(saved).toHaveLength(0)
    expect(showToast).toHaveBeenCalled()
    session().problem.questions.push({ id: 'q1', type: 'numeric', prompt: 'v?', target: { kind: 'end', id: 'block.vx' } })
    await pm.exportProblem()
    expect(saved).toHaveLength(1)
    const back = parseProblem(saved[0]).problem
    expect(back.questions).toHaveLength(1)
    await pm.openProblemText(saved[0], 'p.json')
    expect(session().editing).toBe(false)
    expect(session().problem.questions).toHaveLength(1)
  })
})
