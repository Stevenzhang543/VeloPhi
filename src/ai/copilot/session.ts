/**
 * The Copilot conversation (26.59, D167–D170; split in 26.59 fix 3, D198; one Copilot again in 26.60, D204).
 *  - A whole problem (text or photo) is answered as a teacher would: 答案, 过程, 解释 — no scene is built. Under the
 *    answer the user chooses whether to generate the simulation: "生成仿真场景" runs the scene builder (builder.ts: a
 *    JSON-only request, checked, repaired at most twice, loaded as a problem), and the engine's answers can then be
 *    compared with the explanation ("对照讲解").
 *  - Requests to build or change a set-up go through the build_scene tool (the same builder); questions about the app,
 *    the scene and the results are answered with the reading, display and playback tools. Tool calls run in the app
 *    (asking first when the setting or the tool says so), at most 10 rounds per question; each change keeps a snapshot
 *    so "撤销" in the chat restores the scene and the panels as they were before it.
 */
import { truncated, withTranscript } from '../aiText'
import { reactive } from 'vue'
import { tl } from '../../i18n'
import { chat, aiCanThink } from '../client'
import type { ChatMessage, AiErrorCode } from '../types'
import { AiError } from '../types'
import { ToolError } from './tools'
import type { Tool } from './tools'
import { stateNote } from './prompt'
import { copilotSystem, compareAsk } from './copilotPrompt'
import { simResultsText } from './simPrompt'
import { applyAiScene, copilotToolDefs, copilotToolByName, simHooks, buildHooks, LONG_RESULTS } from './simTools'
import type { SceneCard } from './simTools'
import { buildScene } from './builder'
import { compactSceneDoc } from './simScene'
import { transcribeImage, importProblem } from '../import/pipeline'
import { outcomeText, waitForAnswers } from '../import/answers'
import type { ImportOutcome } from '../import/pipeline'
import { settings } from '../../app/settings'
import { state, loadScene, documentScene } from '../../app/store'
import { serializeScene, parseScene } from '../../core/scene/io'
import { ask } from '../../platform/ask'
import { setTask, taskUi } from '../../app/task/taskState'
import type { TaskSpec } from '../../task/types'
import type { ProblemSession } from '../../app/store'
import { logEvent } from '../../app/trialLog'

export interface Action { id: number; tool: string; label: string; ok: boolean; error?: string; undo?: number; undone?: boolean }
/**
 * One item of the conversation. 'import' (26.59 fix, D182) is a problem read with the template reader: its
 * progress, then what was loaded or why not (with the AI's raw answer).
 */
export interface Bubble {
  id: number
  role: 'user' | 'assistant' | 'error' | 'import'
  text: string
  image?: string
  actions: Action[]
  code?: AiErrorCode
  /** The model's thinking for this answer ("深度思考"), shown folded. */
  reasoning?: string
  /** 'import': the outcome when done, and what was read (for "重试"). */
  outcome?: ImportOutcome | null
  source?: { text: string; image?: string }
  /** The scene this answer built (26.59 fix 3; 26.60: the builder's result). */
  scene?: SceneCard
  /** The problem this answer is about (photo transcribed). */
  problem?: string
  /**
   * 26.60 (D204): the choice offered under the answer to a problem — generate the simulation scene ('open'), being
   * built ('building'), built ('done'), declined ('no') or failed ('failed', with the reasons).
   */
  offer?: { state: 'open' | 'building' | 'done' | 'no' | 'failed'; errors?: string[] }
  /** Assumptions the builder made (sizes the problem did not give). */
  assumptions?: string[]
}

interface Snapshot { scene: string; name: string | null; page: typeof state.page; rightTab: typeof state.rightTab; bottomTab: typeof state.bottomTab; problem: ProblemSession | null; task: TaskSpec | null }

const MAX_ROUNDS = 10
const MAX_RESULT = 6000
const MAX_LONG_RESULT = 24000
let ids = 0

export const copilot = reactive({
  bubbles: [] as Bubble[],
  history: [] as ChatMessage[],
  /** Whether the history was written with thinking on (DeepSeek wants the thinking of every turn back then). */
  historyThinking: false,
  busy: false,
  /** Short status of the work in progress ("正在：载入模板…"). */
  status: '',
  snapshots: [] as Snapshot[]
})

let controller: AbortController | null = null
export function stopCopilot() { controller?.abort() }

/** Start a new conversation. */
export function clearCopilot() {
  stopCopilot()
  copilot.bubbles = []
  copilot.history = []
  copilot.historyThinking = false
  copilot.snapshots = []
  copilot.status = ''
}

/** Whether the next question is asked with thinking ("深度思考" on and possible on this connection). */
export function copilotThinks(): boolean { return settings.ai.thinking && aiCanThink() }

function snapshot(): number {
  copilot.snapshots.push({
    scene: serializeScene(documentScene()), name: state.fileName, page: state.page, rightTab: state.rightTab, bottomTab: state.bottomTab,
    problem: state.problem ? JSON.parse(JSON.stringify(state.problem)) : null, task: taskUi.task ? JSON.parse(JSON.stringify(taskUi.task)) : null
  })
  if (copilot.snapshots.length > 30) copilot.snapshots.shift()
  return copilot.snapshots.length - 1
}

/** Undo one of Copilot's changes: the scene and the panels as they were before it. */
export function undoAction(a: Action) {
  if (a.undo === undefined || a.undone) return
  const s = copilot.snapshots[a.undo]
  if (!s) return
  loadScene(parseScene(s.scene).scene, s.name)
  state.page = s.page
  state.rightTab = s.rightTab
  state.bottomTab = s.bottomTab
  if (s.problem) state.problem = s.problem
  setTask(s.task)
  // Later changes were made on top of this one: they are undone with it
  for (const b of copilot.bubbles) for (const x of b.actions) if (x.undo !== undefined && x.undo >= a.undo) x.undone = true
  copilot.snapshots.length = a.undo
  logEvent('copilot.undo', { tool: a.tool })
}

function compact(v: unknown, max = MAX_RESULT): string {
  const s = JSON.stringify(v ?? null)
  return s.length > max ? truncated(s.slice(0, max)) : s
}

/**
 * Options of a question: `context` is sent with it but not shown, `display` is shown instead of the text, `problem`
 * marks it as a problem (offer the simulation), `noOffer` leaves the offer out (a comparison with the simulation).
 */
export interface SendOptions { context?: string; display?: string; problem?: boolean; noOffer?: boolean }

/** Ask the Copilot; adds the answer to the conversation. */
export async function sendToCopilot(text: string, image?: string, opts: SendOptions = {}): Promise<void> {
  const t = text.trim()
  if ((!t && !image) || copilot.busy) return
  controller = new AbortController()
  const signal = controller.signal
  copilot.busy = true
  copilot.status = tl('思考中')
  copilot.bubbles.push({ id: ++ids, role: 'user', text: opts.display ?? t, image, actions: [] })
  const answer: Bubble = reactive({ id: ++ids, role: 'assistant', text: '', actions: [] }) as Bubble
  copilot.bubbles.push(answer)
  // 26.59 (D179): a photo is read as text first (the same transcription as problem reading), so every model and
  // every later turn can use it; the picture itself is only shown in the chat
  let said = t
  const userMsg: ChatMessage = { role: 'user', content: t }
  // Thinking switched since the last question: the earlier turns go without their tool calls (DeepSeek checks that
  // every assistant turn of a thinking conversation carries its thinking)
  const think = copilotThinks()
  if (think !== copilot.historyThinking) {
    copilot.history = copilot.history.filter(m => (m.role === 'user' || (m.role === 'assistant' && !m.tool_calls?.length)) && typeof m.content === 'string').map(m => ({ role: m.role, content: m.content }))
    copilot.historyThinking = think
  }
  const context = opts.context ?? ''
  try {
    if (image) {
      copilot.status = tl('识别图片中的题目')
      const r = await transcribeImage(image, t, signal)
      said = withTranscript(t || tl('请看这道题。'), r.transcript)
    }
    const problem = !!(opts.problem || image || looksLikeProblem(t))
    if (problem) answer.problem = said
    await chatTurn(answer, userMsg, said + stateNote() + context, think, signal)
    if (!answer.text) answer.text = answer.scene ? '' : answer.actions.length ? tl('已完成。') : '…'
    // 26.60 (D204): under the answer to a problem the user chooses whether to generate the simulation
    if (problem && !answer.scene && !opts.noOffer) answer.offer = { state: 'open' }
  } catch (e) {
    const err = e instanceof AiError ? e : null
    // A scene that was built stays in the conversation (with its card) even when the answer after it failed
    if (!answer.scene && !answer.actions.length) copilot.bubbles.splice(copilot.bubbles.indexOf(answer), 1)
    if (err?.code !== 'aborted') copilot.bubbles.push({ id: ++ids, role: 'error', text: err ? err.message : String((e as Error).message), actions: [], code: err?.code })
    // The unanswered user turn stays in the history only as text, so the next question is well-formed
    trimToText()
  } finally {
    // Older turns keep only their text (no repeated state blocks or images); hand-over results stay with them
    userMsg.content = said + context
    simHooks.applied = null
    buildHooks.run = null
    copilot.busy = false
    copilot.status = ''
    controller = null
    // Keep the history bounded: the last 24 messages, cut at a user turn
    if (copilot.history.length > 24) {
      let i = copilot.history.length - 24
      while (i < copilot.history.length && copilot.history[i].role !== 'user') i++
      copilot.history = copilot.history.slice(i)
    }
  }
}

/** One question: the tool loop (build_scene runs the scene builder, its card goes on this answer). */
async function chatTurn(answer: Bubble, userMsg: ChatMessage, content: string, think: boolean, signal: AbortSignal) {
  userMsg.content = content
  copilot.history.push(userMsg)
  simHooks.applied = card => { answer.scene = { ...card } }
  buildHooks.run = async a => {
    const r = await buildScene({ request: a.request, current: a.modify ? compactSceneDoc(documentScene()) : undefined }, { signal, title: a.title, onStatus: st => { copilot.status = st } })
    if (r.ok) { answer.assumptions = r.assumptions; return { ...r.result, assumptions: r.assumptions.length ? r.assumptions : undefined } }
    if (r.refused) return { ok: false, summary: r.refused, errors: [r.refused] }
    return { ok: false, summary: tl('场景文件有 {0} 处问题', [r.errors.length]), errors: r.errors }
  }
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await chat({ messages: [{ role: 'system', content: copilotSystem() }, ...copilot.history], tools: copilotToolDefs(), tool_choice: 'auto', temperature: 0.3, max_tokens: think ? 16000 : 8000, reasoning: think ? 'on' : 'off', purpose: 'copilot' }, { signal })
    const msg = res.message
    if (!think) delete msg.reasoning_content
    if (msg.reasoning_content) answer.reasoning = (answer.reasoning ? `${answer.reasoning}\n\n` : '') + msg.reasoning_content
    copilot.history.push(msg)
    const calls = msg.tool_calls ?? []
    const said = typeof msg.content === 'string' ? msg.content.trim() : ''
    if (!calls.length) {
      answer.text = said + (res.truncated ? `\n\n${tl('（回答太长，后面被截断了。）')}` : '')
      break
    }
    if (said) answer.text = said
    for (const call of calls) {
      const tool = copilotToolByName(call.function.name)
      const result = await runTool(answer, tool, call.function.name, call.function.arguments)
      copilot.history.push({ role: 'tool', tool_call_id: call.id, content: compact(result, LONG_RESULTS.has(call.function.name) ? MAX_LONG_RESULT : MAX_RESULT) })
      logEvent('copilot.tool', { tool: call.function.name, ok: !(result as { error?: unknown })?.error })
    }
    if (signal.aborted) break
    if (round === MAX_ROUNDS - 1) answer.text = (answer.text ? `${answer.text}\n\n` : '') + tl('（操作步骤较多，已暂停；可以继续告诉我下一步。）')
  }
  logEvent('copilot.answer', { chars: answer.text.length, actions: answer.actions.length })
}

/** Run one tool call (asking first when needed); a result {ok: false} counts as a failed change. */
async function runTool(answer: Bubble, tool: Tool | undefined, name: string, argText: string | undefined): Promise<unknown> {
  const action: Action = { id: ++ids, tool: name, label: name, ok: false }
  let result: unknown
  try {
    if (!tool) throw new ToolError(`unknown tool ${name}`)
    let args: Record<string, unknown> = {}
    try { args = argText ? (JSON.parse(argText) as Record<string, unknown>) : {} } catch { throw new ToolError('arguments are not valid JSON') }
    action.label = tool.label(args)
    copilot.status = action.label
    tool.check?.(args)
    const needsAsk = tool.level === 'confirm' || (tool.level === 'change' && settings.ai.copilotMode === 'ask')
    if (needsAsk && !(await ask(tl('Copilot 想要：{0}。允许吗？', [action.label])))) throw new ToolError('the user declined this action')
    if (tool.level !== 'read') action.undo = snapshot()
    result = await tool.run(args)
    const failed = !!result && typeof result === 'object' && (result as { ok?: unknown }).ok === false
    if (failed) {
      action.error = String((result as { summary?: unknown }).summary ?? tl('未完成'))
      if (action.undo !== undefined) copilot.snapshots.length = action.undo
      action.undo = undefined
    } else action.ok = true
    if (tool.level !== 'read') answer.actions.push(action)
  } catch (e) {
    action.error = e instanceof Error ? e.message : String(e)
    if (action.undo !== undefined) copilot.snapshots.length = action.undo
    action.undo = undefined
    result = { error: action.error }
    if (tool && tool.level !== 'read') answer.actions.push(action)
  }
  return result
}

/** Load a built scene again (its card's "重新载入"), as the same problem when it had questions. */
export async function reloadScene(card: SceneCard): Promise<boolean> {
  if (copilot.busy) return false
  const r = await applyAiScene(JSON.parse(card.json) as unknown, card.targets.map(q => ({ prompt: q.prompt, target: q.target, unit: q.unit })), { title: card.name, stem: card.stem })
  if (r.ok) Object.assign(card, { problemId: r.card.problemId, answers: r.card.answers, hidden: r.card.hidden })
  return r.ok
}

/** The engine's answers of a built scene as context for the Copilot's explanation. */
export function simResultsNote(card: SceneCard): string { return simResultsText(card.name, card.answers, card.hidden) }

const brief = (s: string) => { const one = s.replace(/\s+/g, ' ').trim(); return one.length > 90 ? `${one.slice(0, 88)}…` : one }

/**
 * "生成仿真场景" under the answer to a problem (26.60, D204): the builder writes the scene from the problem (with the
 * explanation, so it reads the problem the same way), the app loads it as a problem and the engine computes; the
 * card and the answers appear in the conversation, which also learns them (so "为什么不一样？" can follow).
 */
export async function buildFromAnswer(b: Bubble): Promise<void> {
  if (copilot.busy || !b.problem || (b.offer && b.offer.state !== 'open' && b.offer.state !== 'failed')) return
  controller = new AbortController()
  const signal = controller.signal
  copilot.busy = true
  b.offer = { state: 'building' }
  copilot.bubbles.push({ id: ++ids, role: 'user', text: `${tl('生成仿真场景并导入')}\n${brief(b.problem)}`, actions: [] })
  const item: Bubble = reactive({ id: ++ids, role: 'assistant', text: '', actions: [], problem: b.problem }) as Bubble
  copilot.bubbles.push(item)
  simHooks.applied = card => { item.scene = { ...card } }
  const action: Action = { id: ++ids, tool: 'build_scene', label: tl('搭建并载入：{0}', [tl('场景')]), ok: false }
  try {
    if (settings.ai.copilotMode === 'ask' && !(await ask(tl('Copilot 想要：{0}。允许吗？', [tl('生成仿真场景并导入')])))) throw new ToolError('the user declined this action')
    action.undo = snapshot()
    const r = await buildScene({ problem: b.problem, solution: b.text }, { signal, onStatus: st => { copilot.status = st } })
    if (r.ok) {
      action.ok = true
      action.label = tl('搭建并载入：{0}', [r.card.name])
      item.actions.push(action)
      item.assumptions = r.assumptions
      item.text = r.tries > 1 ? tl('已搭建（构建器修正了 {0} 次）。', [r.tries - 1]) : ''
      b.offer = { state: 'done' }
      copilot.history.push(
        { role: 'user', content: `${tl('（我选择了生成仿真场景）')}\n${b.problem}` },
        { role: 'assistant', content: `${tl('已搭建并载入场景“{0}”。', [r.card.name])}${simResultsText(r.card.name, r.card.answers, r.card.hidden)}` }
      )
    } else {
      if (action.undo !== undefined) copilot.snapshots.length = action.undo
      action.undo = undefined
      copilot.bubbles.splice(copilot.bubbles.indexOf(item), 1)
      const why = r.refused ? [r.refused] : r.errors
      b.offer = { state: 'failed', errors: why.slice(0, 6) }
      copilot.bubbles.push({ id: ++ids, role: 'error', text: r.refused ? tl('构建器认为引擎不能模拟这道题：{0}', [r.refused]) : tl('场景搭建失败（试了 {0} 次）：{1}', [r.tries, why.slice(0, 3).join('；')]), actions: [] })
    }
  } catch (e) {
    const err = e instanceof AiError ? e : null
    copilot.bubbles.splice(copilot.bubbles.indexOf(item), 1)
    b.offer = { state: 'open' }
    if (err?.code !== 'aborted') copilot.bubbles.push({ id: ++ids, role: 'error', text: err ? err.message : String((e as Error).message), actions: [], code: err?.code })
  } finally {
    simHooks.applied = null
    copilot.busy = false
    copilot.status = ''
    controller = null
  }
}

/** "不用了": the offer under an answer is dismissed. */
export function declineOffer(b: Bubble) { if (b.offer?.state === 'open') b.offer = { state: 'no' } }

/** "对照讲解": the Copilot compares its explanation with the engine's answers of the built scene. */
export async function compareWithSim(problem: string, card: SceneCard) {
  if (copilot.busy || !problem.trim()) return
  await sendToCopilot(compareAsk(problem), undefined, { context: simResultsNote(card), display: `${tl('对照讲解与仿真结果')}\n${brief(problem)}`, noOffer: true })
}

/**
 * The template reader in the Copilot box (26.59 fix, D182; in the simulation Copilot since fix 3 the fallback when
 * a scene file cannot be built): the problem goes through the reading pipeline (the same as the task panel), shown
 * as one item of the conversation; on success the conversation learns what was loaded, so "答案是多少？" or "为什么"
 * can follow.
 */
export async function recognizeInCopilot(text: string, image?: string, hint?: string): Promise<ImportOutcome | null> {
  const t = text.trim()
  if ((!t && !image) || copilot.busy) return null
  copilot.busy = true
  copilot.status = tl('读题')
  copilot.bubbles.push({ id: ++ids, role: 'user', text: t || tl('（题目图片）'), image, actions: [] })
  const item: Bubble = reactive({ id: ++ids, role: 'import', text: t, actions: [], outcome: null, source: { text: t, image } }) as Bubble
  copilot.bubbles.push(item)
  try {
    const o = await importProblem(t, { image, hint })
    item.outcome = o
    if (o.ok) {
      // The conversation learns what was built, the answers the app computed and the solution path (D190), so
      // "为什么" or "换成 45° 呢" can follow; a simulated problem is waited for (it computes in the background)
      copilot.status = tl('引擎计算中…')
      const answers = await waitForAnswers(o)
      copilot.history.push(
        { role: 'user', content: `${tl('（我用“识别题目”导入了这道题）')}\n${o.stem}` },
        { role: 'assistant', content: outcomeText(o, answers) }
      )
    }
    logEvent('copilot.recognize', { ok: o.ok, route: o.ok ? o.first.route : o.code ?? '' })
    return o
  } finally {
    copilot.busy = false
    copilot.status = ''
  }
}

/**
 * Whether a message is a whole problem rather than something to chat about (26.59 fix, D190): it is long enough,
 * gives values or a figure, and asks for something ("求…", "多大", "多少"…). A question about the app or the
 * current scene ("为什么…", "怎么…", "帮我…", "这个场景…") stays a chat message.
 */
export function looksLikeProblem(text: string): boolean {
  const t = text.trim()
  if (t.length < 24) return false
  // 26.59 fix 3 (D196): also fill-in blanks, multiple choice and "则 … 为" questions
  const asks = /求[:：（(]?|求出|多大|多少|多长|多远|多高|多快|几秒|为多少|是多少|试求|计算|判断|问[:：]|能否|是否|之比|比值|最大|最小|范围|则.{0,30}(为|是|等于)|下列.{0,20}(正确|错误|说法)|[（(]\s*[）)]|_{2,}|＿{2,}|what is|which of|find|calculate|determine|show that|how (much|far|long|fast|many|high)|wie (groß|viel|weit|lange|schnell|hoch)|berechne|bestimme|welche/i.test(t)
  // Numbers, a figure, or letters for the givens ("质量为 m", "高 h 处")
  const values = /\d/.test(t) || /如图|下图|图中|shown|figure|Abbildung/i.test(t) || /(为|是|=|高|长|半径|速度|质量)\s*[a-zA-Zα-ωθμ][₀-₉0-9]?(?![a-zA-Z])/.test(t)
  const chat = /^(为什么|为啥|怎么|怎样|如何|能不能|能否|可以|可不可以|帮我|请帮|解释|教我|讲讲|说说|这个|这里|这道|刚才|上面|当前|why|how do|can you|please explain|explain|warum|wie kann)/i.test(t) || /当前场景|这个场景|画面上|模板|界面|按钮|设置/.test(t)
  return asks && values && !(chat && t.length < 120)
}

/** Drop a trailing assistant tool call without results (an interrupted turn). */
function trimToText() {
  while (copilot.history.length) {
    const last = copilot.history[copilot.history.length - 1]
    if (last.role === 'user') break
    if (last.role === 'assistant' && !last.tool_calls?.length) break
    copilot.history.pop()
  }
}

/** Worked prompts to start with (chips under an empty conversation). */
export const STARTERS: string[] = [
  '质量 2 kg 的物块从倾角 30° 的斜面顶端由静止下滑，μ = 0.2，求 1 s 末的速度。',
  '为什么竖直圆轨道最高点的速度不能为零？',
  '搭一个竖直圆轨道：小球从 h = 2.5R 的光滑斜轨上滑下，看它能否通过最高点',
  '显示物块受到的支持力和摩擦力',
  '用 x‑t / v‑t / a‑t 曲线解释一下这个运动'
]

/** Type used by the panel for the scene card. */
export type { SceneCard }
