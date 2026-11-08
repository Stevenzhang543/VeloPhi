/**
 * 26.61 R1: undo of Copilot changes over a long conversation. Each change is bound to its own snapshot by id; after
 * more than SNAPSHOT_LIMIT changes the oldest report "expired" instead of restoring another snapshot (26.60 kept list
 * positions, so after the 31st change "undo" of change 1 restored the state before change 3). Undo restores the
 * document state (file name, path, unsaved mark, editor history) and asks before discarding later edits by hand.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { Scene } from '../../src/core/scene/types'
import { buildTemplate } from '../../src/templates'

const state = {
  dirty: false, page: 'studio', rightTab: 'formula', bottomTab: 'chart', problem: null as unknown, scene: buildTemplate('incline') as Scene, fileName: 'a.velophi.json' as string | null,
  filePath: 'C:/x/a.velophi.json' as string | null, past: [] as string[], future: [] as string[], branch: null, selection: null as unknown,
  recording: null, situations: [], run: { tComputed: 0, unbounded: true, paused: false }, computing: false, playing: false, time: 0, speed: 1,
  showModels: false, modelId: null, modelPreset: null, settingsSection: null, showTemplates: false, showProblems: false, chart: [] as string[]
}
const loadScene = vi.fn((s: Scene, name: string | null, path: string | null = null) => { state.scene = s; state.problem = null; state.fileName = name; state.filePath = path; state.dirty = false; state.past = []; state.future = []; state.selection = null })
const edit = vi.fn((m: (s: Scene) => void) => { m(state.scene) })
vi.mock('../../src/app/store', () => ({ state, loadScene, edit, play: vi.fn(), pause: vi.fn(), rewind: vi.fn(), seekTime: vi.fn(), showToast: vi.fn(), documentScene: () => state.scene, markStale: vi.fn(), runSimulation: vi.fn() }))
vi.mock('../../src/app/trialLog', () => ({ logEvent() {} }))
const askAnswers: boolean[] = []
const askSeen: string[] = []
vi.mock('../../src/platform/ask', () => ({ ask: vi.fn(async (q: string) => { askSeen.push(q); return askAnswers.shift() ?? true }) }))
vi.mock('../../src/app/task/taskState', () => ({ taskUi: { task: null, state: 'draft' }, setTask: vi.fn(), currentResults: () => [], solveCurrent: vi.fn(), readText: vi.fn() }))

const { copilot, sendToCopilot, undoAction, clearCopilot, SNAPSHOT_LIMIT } = await import('../../src/ai/copilot/session')
const { setTransport } = await import('../../src/platform/net')
const { settings } = await import('../../src/app/settings')
const { setKey } = await import('../../src/ai/keys')
const { resetCaps } = await import('../../src/ai/client')

const ok = (message: unknown) => ({ status: 200, contentType: 'application/json', retryAfter: null, body: JSON.stringify({ choices: [{ message, finish_reason: 'stop' }], usage: { total_tokens: 50 } }) })
const theta = () => (state.scene.extra as { template: { values: { theta: number } } }).template.values.theta

/** One Copilot change: load the incline template with angle `deg`. */
async function change(deg: number) {
  const replies = [
    () => ok({ role: 'assistant', content: null, tool_calls: [{ id: `c${deg}`, type: 'function', function: { name: 'load_template', arguments: JSON.stringify({ id: 'incline', params: { theta: deg } }) } }] }),
    () => ok({ role: 'assistant', content: `已改为 ${deg}°。` })
  ]
  setTransport(async () => replies.shift()!())
  await sendToCopilot(`把斜面倾角改成 ${deg} 度`)
  const b = copilot.bubbles[copilot.bubbles.length - 1]
  expect(b.actions[0]?.ok).toBe(true)
  return b.actions[0]
}

beforeEach(() => {
  settings.ai.connection = 'openai'
  settings.ai.openai = { baseUrl: 'https://ai.test/v1', model: 'm', vision: true }
  settings.ai.copilotMode = 'act'
  setKey('openai', 'sk-test')
  resetCaps()
  clearCopilot()
  state.scene = buildTemplate('incline')
  state.fileName = 'a.velophi.json'; state.filePath = 'C:/x/a.velophi.json'; state.dirty = false; state.past = []
  askAnswers.length = 0; askSeen.length = 0
})
afterEach(() => setTransport(null))

describe('Copilot undo identity (26.61 R1)', () => {
  it('32 changes: the two oldest expire, a kept change restores its own state and undoes the later ones', async () => {
    expect(SNAPSHOT_LIMIT).toBe(30)
    const acts = []
    // Angles 11°, 12°, … 42°: before change k (1-based) the angle was 10 + k − 1 (30° before the first)
    for (let k = 1; k <= 32; k++) acts.push(await change(10 + k))
    expect(theta()).toBe(42)
    expect(copilot.snapshots).toHaveLength(30)
    expect(acts[0].expired).toBe(true)
    expect(acts[1].expired).toBe(true)
    expect(acts[2].expired).toBeFalsy()
    // Undo of an expired change restores nothing (26.60 restored the state before change 3 here)
    expect(await undoAction(acts[0])).toBe('expired')
    expect(theta()).toBe(42)
    // Change 10 (11° … : it set 20°, before it 19°)
    expect(await undoAction(acts[9])).toBe('done')
    expect(theta()).toBe(19)
    for (let k = 9; k < 32; k++) expect(acts[k].undone).toBe(true)
    for (let k = 2; k < 9; k++) expect(acts[k].undone).toBeFalsy()
    // An earlier kept change still restores its own state
    expect(await undoAction(acts[3])).toBe('done')
    expect(theta()).toBe(13)
    expect(await undoAction(acts[2])).toBe('done')
    expect(theta()).toBe(12)
    expect(copilot.snapshots).toHaveLength(0)
    expect(await undoAction(acts[2])).toBe('none')
  })

  it('the boundary: change 30 keeps all, change 31 expires only the first', async () => {
    const acts = []
    for (let k = 1; k <= 30; k++) acts.push(await change(10 + k))
    expect(acts.some(a => a.expired)).toBe(false)
    acts.push(await change(41))
    expect(acts[0].expired).toBe(true)
    expect(acts.slice(1).some(a => a.expired)).toBe(false)
    expect(await undoAction(acts[1])).toBe('done')
    expect(theta()).toBe(11)
  })

  it('restores the file name, path, unsaved mark and the editor history of the document', async () => {
    state.dirty = true
    state.past = ['p1', 'p2']
    const a = await change(35)
    expect(state.fileName).toBeNull()
    expect(state.dirty).toBe(false)
    expect(await undoAction(a)).toBe('done')
    expect(state.fileName).toBe('a.velophi.json')
    expect(state.filePath).toBe('C:/x/a.velophi.json')
    expect(state.dirty).toBe(true)
    expect(state.past).toEqual(['p1', 'p2'])
    expect(theta()).toBe(30)
  })

  it('asks before discarding edits made by hand after the change; declining keeps everything', async () => {
    const a = await change(35)
    const b = await change(36)
    state.scene.bodies[0].name = 'by hand'
    askAnswers.push(false)
    expect(await undoAction(a)).toBe('cancelled')
    expect(askSeen[0]).toContain('1')
    expect(state.scene.bodies[0].name).toBe('by hand')
    expect(a.undone).toBeFalsy()
    expect(b.undone).toBeFalsy()
    askAnswers.push(true)
    expect(await undoAction(b)).toBe('done')
    expect(theta()).toBe(35)
    // No later edits now: no question
    const n = askSeen.length
    expect(await undoAction(a)).toBe('done')
    expect(askSeen.length).toBe(n)
    expect(theta()).toBe(30)
  })

  it('a failed or declined change keeps no snapshot', async () => {
    settings.ai.copilotMode = 'ask'
    askAnswers.push(false)
    const replies = [
      () => ok({ role: 'assistant', content: null, tool_calls: [{ id: 'x', type: 'function', function: { name: 'load_template', arguments: JSON.stringify({ id: 'incline', params: { theta: 50 } }) } }] }),
      () => ok({ role: 'assistant', content: '好的。' })
    ]
    setTransport(async () => replies.shift()!())
    await sendToCopilot('把斜面倾角改成 50 度')
    expect(copilot.snapshots).toHaveLength(0)
    expect(theta()).toBe(30)
  })
})
