/**
 * Tools of the simulation Copilot (26.59 fix 3, D198): `apply_scene` loads a scene file the AI wrote (checked and
 * placed by simScene.ts; with questions it opens as a problem and the engine's answers come back), `get_scene_json`
 * and `get_template_scene` give the AI a file to start from, and the reading, display and playback tools of the
 * general Copilot operate the app. The whole-problem reader (`import_problem`) and the small scene description
 * (`build_scene`) are not offered here: the scene file replaces them.
 */
import { tl } from '../../i18n'
import { state, loadScene, documentScene } from '../../app/store'
import { settings } from '../../app/settings'
import { openProblem, reveal } from '../../app/problemMode'
import { serializeScene } from '../../core/scene/io'
import { templateById, buildTemplate } from '../../templates'
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

/** The tools only the simulation Copilot has. */
export const SIM_ONLY: Tool[] = [
  {
    name: 'apply_scene', level: 'change', label: a => tl('搭建并载入：{0}', [String(a.title || (a.scene as { name?: string } | undefined)?.name || tl('场景'))]),
    description: 'Load a complete VeloΦ scene file (format "velophi-scene", the JSON described in the system prompt) into the app, replacing the current scene. With questions, it opens as a problem and returns the answers the engine computed. Returns ok:false with errors to fix when the file has problems — fix them and call again with the whole file.',
    parameters: obj({
      scene: { type: 'object', description: 'the complete scene file {format, name, settings, bodies, pulleys, connectors, watch}' },
      questions: { type: 'array', description: 'one per thing the problem asks: {prompt, target, unit}', items: { type: 'object' } },
      title: S('short title of the problem or scene'),
      stem: S('the problem statement (shown in the problem panel)')
    }, ['scene']),
    run: async a => {
      const r = await applyAiScene(a.scene, a.questions, { title: typeof a.title === 'string' ? a.title : undefined, stem: typeof a.stem === 'string' ? a.stem : undefined })
      if (!r.ok) return { ok: false, errors: r.errors, notes: r.notes.length ? r.notes : undefined, summary: tl('场景文件有 {0} 处问题', [r.errors.length]) }
      return r.result
    }
  },
  {
    name: 'get_scene_json', level: 'read', label: () => tl('读取当前场景文件'),
    description: 'The current scene as a scene file (defaults left out, numbers rounded). Edit it and pass the whole file to apply_scene to change the scene.',
    parameters: obj({}),
    run: () => ({ scene: compactSceneDoc(documentScene()) })
  },
  {
    name: 'get_template_scene', level: 'read', label: a => tl('读取模板 {0}', [templateById(String(a.id))?.name ?? String(a.id)]),
    description: 'The scene file of a simulation template (ids from search_catalog kind template), optionally with parameter values (the template\'s keys and display units). A starting point to edit and pass to apply_scene.',
    parameters: obj({ id: S('template id'), params: { type: 'object', description: 'parameter values by key', additionalProperties: { type: 'number' } } }, ['id']),
    run: a => {
      const t = templateById(String(a.id))
      if (!t) throw new ToolError(`no template ${a.id}; use search_catalog with kind template`)
      const params: Record<string, number> = {}
      if (a.params && typeof a.params === 'object') for (const [k, v] of Object.entries(a.params as Record<string, unknown>)) {
        if (!t.params.some(p => p.key === k)) throw new ToolError(`template ${t.id} has no parameter ${k} (${t.params.map(p => `${p.key} [${p.unit}]`).join(', ')})`)
        const n = Number(v)
        if (!Number.isFinite(n)) throw new ToolError(`params.${k} must be a number`)
        params[k] = n
      }
      return { template: t.name, parameters: t.params.map(p => ({ key: p.key, label: p.label, unit: p.unit, value: params[p.key] ?? p.value })), scene: compactSceneDoc(buildTemplate(t.id, params)) }
    }
  }
]

/** General Copilot tools the simulation Copilot also has (reading, display, playback, catalogue, small edits). */
const SHARED = ['get_app_state', 'get_scene_summary', 'read_results', 'read_quantity', 'list_quantities', 'read_forces', 'search_catalog', 'list_examples', 'open_example', 'open_my_problem', 'load_template', 'set_parameters', 'add_force', 'playback', 'show', 'show_curves', 'set_display', 'select_body', 'reveal_answers', 'open_lab', 'open_model', 'point_to']

/** The simulation Copilot's tools. */
export function simTools(): Tool[] {
  return [...SIM_ONLY, ...SHARED.map(n => TOOLS.find(t => t.name === n)).filter((t): t is Tool => !!t)]
}

export function simToolDefs(): ToolDef[] {
  return simTools().map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
}

export function simToolByName(name: string): Tool | undefined { return simTools().find(t => t.name === name) }

/** Results longer than the usual limit (scene files). */
export const LONG_RESULTS = new Set(['get_scene_json', 'get_template_scene'])
