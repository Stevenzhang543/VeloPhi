/**
 * 26.61: the scene builder with the answers models actually give — almost-JSON is read (and the card says what was
 * repaired), an answer cut off by the token limit is continued instead of rejected, and a text that cannot be read
 * goes back to the model with the line and column of the problem.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { Scene } from '../../src/core/scene/types'
import { buildTemplate } from '../../src/templates'

const state = {
  dirty: false, page: 'studio', rightTab: 'formula', bottomTab: 'chart', problem: null as unknown, scene: buildTemplate('incline') as Scene, fileName: null,
  recording: null as unknown, situations: [], run: { tComputed: 0, unbounded: true, paused: false }, computing: false, playing: false, time: 0, speed: 1, selection: null,
  showModels: false, modelId: null, modelPreset: null, settingsSection: null, showTemplates: false, showProblems: false, chart: [] as string[]
}
const loadScene = vi.fn((s: Scene) => { state.scene = s; state.problem = null })
vi.mock('../../src/app/store', () => ({ state, loadScene, edit: vi.fn(), play: vi.fn(), pause: vi.fn(), rewind: vi.fn(), seekTime: vi.fn(), showToast: vi.fn(), documentScene: () => state.scene }))
vi.mock('../../src/app/trialLog', () => ({ logEvent() {} }))
vi.mock('../../src/platform/ask', () => ({ ask: vi.fn(async () => true) }))
vi.mock('../../src/app/task/taskState', () => ({ taskUi: { task: null, state: 'draft' }, setTask: vi.fn(), currentResults: () => [], solveCurrent: vi.fn(), readText: vi.fn() }))
vi.mock('../../src/app/problemMode', () => ({ openProblem: vi.fn(async (p: { scene: Scene }) => { state.scene = p.scene; return true }), reveal: vi.fn(), openBuiltin: vi.fn(async () => true) }))

const { buildScene } = await import('../../src/ai/copilot/builder')
const { simHooks } = await import('../../src/ai/copilot/simTools')
const { setTransport } = await import('../../src/platform/net')
const { settings } = await import('../../src/app/settings')
const { setKey } = await import('../../src/ai/keys')
const { resetCaps } = await import('../../src/ai/client')

type Body = { messages: Array<{ role: string; content: unknown }> }
const reply = (content: string, finish = 'stop') => ({ status: 200, contentType: 'application/json', retryAfter: null, body: JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: finish }], usage: { total_tokens: 50 } }) })
function scripted(replies: Array<() => ReturnType<typeof reply>>) {
  const seen: Body[] = []
  setTransport(async req => { seen.push(JSON.parse(req.body ?? '{}') as Body); const r = replies.shift(); if (!r) throw new Error('no reply'); return r() })
  return seen
}

/** A block sliding down a fixed incline (the builder's style of file, written as a model would). */
const SCENE = `{
  "scene": {
    "format": "velophi-scene", "name": "斜面滑块",
    "settings": { "gravity": { "x": 0, "y": -9.8 } },
    "bodies": [
      { "id": "slope", "kind": "static", "role": "incline", "shape": { "type": "polygon", "points": [[0, 0], [2, 0], [0, 1.1547]] }, "position": { "x": 0, "y": 0 } },
      { "id": "block", "kind": "rigid", "role": "block", "mass": 2, "shape": { "type": "box", "width": 0.2, "height": 0.1 }, "rest": true, "position": { "x": 0.4, "y": 1.0 }, "angle": -0.5236 }
    ]
  },
  "questions": [{ "prompt": "1 s 末的速度", "target": { "kind": "quantity", "id": "block.v", "t": 1 }, "unit": "m/s" }]
}`

beforeEach(() => {
  settings.ai.connection = 'openai'
  settings.ai.openai = { baseUrl: 'https://ai.test/v1', model: 'm', vision: true }
  settings.ai.copilotMode = 'act'
  settings.ai.thinking = false
  setKey('openai', 'sk-test')
  resetCaps()
  simHooks.waitMs = 0
})
afterEach(() => setTransport(null))

describe('builder answers (26.61)', () => {
  it('almost-JSON loads, and the card says what was repaired', async () => {
    const sloppy = SCENE.replace(/"format": "velophi-scene", /, "format: 'velophi-scene', ").replace('"mass": 2', '"mass": "2 kg"').replace('"angle": -0.5236', '"angle": -Math.PI/6').replace(/\}\n\s*\]/, '},\n    ]')
    scripted([() => reply(`好的，场景如下：\n\`\`\`json\n${sloppy}\n\`\`\``)])
    const r = await buildScene({ problem: '斜面上的物块' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tries).toBe(1)
    expect(r.card.notes.join('\n')).toMatch(/JSON 已自动修复/)
    expect(r.card.notes.join('\n')).toMatch(/mass: "2 kg" read as 2/)
  })

  it('an answer cut off by the token limit is continued', async () => {
    const cut = SCENE.indexOf('"block"')
    // The client first asks again with more room (JSON mode), then the builder continues the cut-off answer
    const seen = scripted([() => reply(SCENE.slice(0, cut), 'length'), () => reply(SCENE.slice(0, cut), 'length'), () => reply(SCENE.slice(cut))])
    const r = await buildScene({ problem: '斜面上的物块' })
    expect(r.ok).toBe(true)
    expect(seen).toHaveLength(3)
    expect(String(seen[2].messages[seen[2].messages.length - 1].content)).toMatch(/截断/)
  })

  it('a model that starts again in its continuation: the new complete answer is used', async () => {
    scripted([() => reply(SCENE.slice(0, 200), 'length'), () => reply(SCENE.slice(0, 200), 'length'), () => reply(SCENE)])
    const r = await buildScene({ problem: '斜面上的物块' })
    expect(r.ok).toBe(true)
  })

  it('an unreadable answer goes back with the line and column', async () => {
    const seen = scripted([() => reply('{"scene": {"bodies": [ :: ]}}'), () => reply(SCENE)])
    const r = await buildScene({ problem: '斜面上的物块' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.tries).toBe(2)
    expect(String(seen[1].messages[seen[1].messages.length - 1].content)).toMatch(/line 1, column/)
  })
})
