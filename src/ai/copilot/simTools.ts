/**
 * Scene files of the Copilot (26.59 fix 3, D198; 26.60, D204): `applyAiScene` checks, places and loads a scene file the
 * builder wrote (simScene.ts; with questions it opens as a problem and the engine's answers come back), shown as a scene
 * card. The Copilot's tools: `build_scene` (runs the builder, builder.ts), `get_scene_json`, and the reading, display
 * and playback tools of tools.ts.
 */
import { tl } from '../../i18n'
import { state, loadScene, documentScene } from '../../app/store'
import { settings } from '../../app/settings'
import { openProblem, reveal } from '../../app/problemMode'
import { serializeScene } from '../../core/scene/io'
import type { Problem } from '../../teaching/problems'
import { waitForProblemAnswers } from '../import/answers'
import type { AnswerLine } from '../import/answers'
import { TOOLS, ToolError, confirmReplace } from './tools'
import { aiLabel } from '../client'
import type { Tool } from './tools'
import type { CheckedQuestion } from '../import/contract'
import { compactSceneDoc, prepareAiScene } from './simScene'
import type { JsonSchema, ToolDef } from '../types'

/** What one scene build shows in the conversation (the scene card). */
export interface SceneCard {
  ok: boolean
  name: string
  /** The scene file as saved (.velophi.json text); '' when it could not be loaded. */
  json: string
  bodies: number
  connectors: number
  questions: string[]
  /** The engine's answers (null: still computing, or no questions). */
  answers: AnswerLine[] | null
  /** Learning mode: the answers are folded until the student reveals them. */
  hidden: boolean
  notes: string[]
  warnings: string[]
  errors: string[]
  problemId?: string
  /** The problem statement and the checked questions (to load the scene again as the same problem). */
  stem: string
  targets: CheckedQuestion[]
}

/**
 * Hooks of the conversation: `applied` receives each successful build (the session shows it as a card);
 * `waitMs` is how long apply_scene waits for the engine's answers.
 */
export const simHooks: { applied: ((card: SceneCard) => void) | null; waitMs: number } = { applied: null, waitMs: 15000 }

const shortTitle = (s: string) => (s.length > 40 ? `${s.slice(0, 38)}…` : s)

/**
 * Check, place and load a scene file the AI wrote. With questions it opens as a problem (the engine computes the
 * answers, which are awaited); without, it replaces the scene in the studio.
 */
export async function applyAiScene(raw: unknown, questions: unknown, meta: { title?: string; stem?: string } = {}): Promise<{ ok: true; card: SceneCard; result: Record<string, unknown> } | { ok: false; errors: string[]; notes: string[] }> {
  const prep = prepareAiScene(raw, questions)
  if (!prep.ok) return { ok: false, errors: prep.errors.slice(0, 14), notes: prep.notes.slice(0, 8) }
  await confirmReplace()
  const scene = prep.scene
  const title = shortTitle((meta.title || prep.title || scene.name || tl('AI 场景')).trim())
  if (!scene.name || scene.name === 'AI 场景') scene.name = title
  scene.extra = { ...(scene.extra ?? {}), ai: { route: 'copilot-sim', summary: title, connection: aiLabel(), at: new Date().toISOString() } }
  let problemId: string | undefined
  if (prep.questions.length) {
    const problem: Problem = {
      id: `ai-${Date.now().toString(36)}`, title, chapter: '', stem: (meta.stem || prep.stem || title).trim(), scene,
      questions: prep.questions.map((q, i) => ({ id: `q${i + 1}`, type: 'numeric' as const, prompt: q.prompt, target: q.target }))
    }
    if (!(await openProblem(problem, { confirm: false }))) throw new ToolError('the scene was not opened')
    if (settings.ai.revealAnswers && !settings.ai.learningMode) reveal()
    problemId = problem.id
  } else {
    loadScene(scene, null)
    state.page = 'studio'
  }
  const answers = problemId ? await waitForProblemAnswers(problemId, simHooks.waitMs) : null
  const hidden = settings.ai.learningMode && !!problemId && !state.problem?.revealed
  const card: SceneCard = {
    ok: true, name: title, json: serializeScene(scene), bodies: scene.bodies.length, connectors: scene.connectors.length,
    questions: prep.questions.map(q => q.prompt), answers, hidden, notes: prep.notes, warnings: prep.warnings, errors: [], problemId,
    stem: (meta.stem || prep.stem || '').trim(), targets: prep.questions
  }
  simHooks.applied?.(card)
  const result: Record<string, unknown> = {
    ok: true, loaded: title,
    bodies: scene.bodies.map(b => ({ id: b.id, name: b.name, kind: b.kind, position: [round(b.position.x), round(b.position.y)] })),
    connectors: scene.connectors.map(c => ({ id: c.id, type: c.type })),
    notes: prep.notes.length ? prep.notes : undefined,
    warnings: prep.warnings.length ? prep.warnings : undefined
  }
  if (problemId) {
    result.answers = hidden ? 'learning mode: the answers stay hidden until the student has answered and revealed them'
      : answers ? answers.map(a => ({ question: a.prompt, value: a.text, note: a.note })) : 'still computing; call read_results shortly'
  }
  return { ok: true, card, result }
}

const round = (v: number) => Number(v.toPrecision(6))

const S = (description: string, extra: Partial<JsonSchema> = {}): JsonSchema => ({ type: 'string', description, ...extra })
const obj = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })

/** Hooks of a build_scene call: the session runs the builder (with its abort signal and status line). */
export const buildHooks: { run: ((a: { request: string; modify: boolean; title?: string }) => Promise<Record<string, unknown>>) | null } = { run: null }

/** The tools only the Copilot of 26.60 has: build a scene with the builder, read the current scene file (D204). */
export const SCENE_TOOLS: Tool[] = [
  {
    name: 'build_scene', level: 'change', label: a => tl('搭建并载入：{0}', [String(a.title || tl('场景'))]),
    description: 'Build a scene in the app from a description: a separate scene builder writes the VeloΦ scene file, the app checks and loads it (replacing the current scene; with questions it opens as a problem) and the engine computes. Returns ok:true with the bodies and the engine\'s answers, or ok:false with what went wrong. Use it when the user asks to build, simulate or change a set-up — not for a problem the user only wants solved.',
    parameters: obj({
      request: S('what to build: the situation, every given value with its unit, and what to observe or find'),
      modify: { type: 'boolean', description: 'true: change the current scene (its file is given to the builder) instead of building a new one' },
      title: S('short title')
    }, ['request']),
    run: async a => {
      if (!buildHooks.run) throw new ToolError('the scene builder is not available')
      return buildHooks.run({ request: String(a.request ?? ''), modify: a.modify === true, title: typeof a.title === 'string' ? a.title : undefined })
    }
  },
  {
    name: 'get_scene_json', level: 'read', label: () => tl('读取当前场景文件'),
    description: 'The current scene as a scene file (defaults left out, numbers rounded): bodies, ids, sizes and settings.',
    parameters: obj({}),
    run: () => ({ scene: compactSceneDoc(documentScene()) })
  }
]

/** General Copilot tools (reading, display, playback, catalogue, small edits). */
const SHARED = ['get_app_state', 'get_scene_summary', 'read_results', 'read_quantity', 'list_quantities', 'read_forces', 'search_catalog', 'list_examples', 'open_example', 'open_my_problem', 'load_template', 'set_parameters', 'add_force', 'playback', 'show', 'show_curves', 'set_display', 'select_body', 'reveal_answers', 'open_lab', 'open_model', 'point_to']

/** The Copilot's tools. */
export function copilotTools(): Tool[] {
  return [...SCENE_TOOLS, ...SHARED.map(n => TOOLS.find(t => t.name === n)).filter((t): t is Tool => !!t)]
}

export function copilotToolDefs(): ToolDef[] {
  return copilotTools().map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
}

export function copilotToolByName(name: string): Tool | undefined { return copilotTools().find(t => t.name === name) }

/** Results longer than the usual limit (scene files). */
export const LONG_RESULTS = new Set(['get_scene_json'])
