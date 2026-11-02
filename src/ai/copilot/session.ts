/**
 * A Copilot conversation (26.59, D167–D170): the messages shown, the history sent to the AI, and the tool loop —
 * the AI's tool calls run in the app (asking first when the setting or the tool says so), their results go back to
 * the AI, at most 8 rounds per question. Each change keeps a snapshot so "撤销" in the chat restores the scene and
 * the panels as they were before it.
 */
import { truncated, withTranscript } from '../aiText'
import { reactive } from 'vue'
import { tl } from '../../i18n'
import { chat, aiCanThink } from '../client'
import type { ChatMessage, AiErrorCode } from '../types'
import { AiError } from '../types'
import { toolByName, toolDefs, ToolError } from './tools'
import { copilotSystem, stateNote } from './prompt'
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
 * One item of the conversation. 'import' (26.59 fix, D182) is a problem read with "识别题目" in the Copilot box:
 * its progress, then what was loaded or why not (with the AI's raw answer).
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
}

interface Snapshot { scene: string; name: string | null; page: typeof state.page; rightTab: typeof state.rightTab; bottomTab: typeof state.bottomTab; problem: ProblemSession | null; task: TaskSpec | null }

const MAX_ROUNDS = 8
const MAX_RESULT = 6000
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

function compact(v: unknown): string {
  const s = JSON.stringify(v ?? null)
  return s.length > MAX_RESULT ? truncated(s.slice(0, MAX_RESULT)) : s
}

/** Ask Copilot; runs the tool loop and adds the answer to the conversation. */
export async function sendToCopilot(text: string, image?: string): Promise<void> {
  const t = text.trim()
  if ((!t && !image) || copilot.busy) return
  controller = new AbortController()
  const signal = controller.signal
  copilot.busy = true
  copilot.status = tl('思考中')
  copilot.bubbles.push({ id: ++ids, role: 'user', text: t, image, actions: [] })
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
  try {
    if (image) {
      copilot.status = tl('识别图片中的题目')
      const r = await transcribeImage(image, t, signal)
      said = withTranscript(t || tl('请看这道题。'), r.transcript)
    }
    userMsg.content = said + stateNote()
    copilot.history.push(userMsg)
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await chat({ messages: [{ role: 'system', content: copilotSystem() }, ...copilot.history], tools: toolDefs(), tool_choice: 'auto', temperature: 0.2, max_tokens: think ? 16000 : 4000, reasoning: think ? 'on' : 'off', purpose: 'copilot' }, { signal })
      const msg = res.message
      if (!think) delete msg.reasoning_content
      if (msg.reasoning_content) answer.reasoning = (answer.reasoning ? `${answer.reasoning}\n\n` : '') + msg.reasoning_content
      copilot.history.push(msg)
      const calls = msg.tool_calls ?? []
      if (typeof msg.content === 'string' && msg.content.trim() && !calls.length) answer.text = msg.content.trim() + (res.truncated ? `\n\n${tl('（回答太长，后面被截断了。）')}` : '')
      if (!calls.length) break
      if (typeof msg.content === 'string' && msg.content.trim()) answer.text = msg.content.trim()
      for (const call of calls) {
        const tool = toolByName(call.function.name)
        let result: unknown
        const action: Action = { id: ++ids, tool: call.function.name, label: call.function.name, ok: false }
        try {
          if (!tool) throw new ToolError(`unknown tool ${call.function.name}`)
          let args: Record<string, unknown> = {}
          try { args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {} } catch { throw new ToolError('arguments are not valid JSON') }
          action.label = tool.label(args)
          copilot.status = action.label
          tool.check?.(args)
          const needsAsk = tool.level === 'confirm' || (tool.level === 'change' && settings.ai.copilotMode === 'ask')
          if (needsAsk && !(await ask(tl('Copilot 想要：{0}。允许吗？', [action.label])))) throw new ToolError('the user declined this action')
          if (tool.level !== 'read') action.undo = snapshot()
          result = await tool.run(args)
          action.ok = true
          if (tool.level !== 'read') answer.actions.push(action)
        } catch (e) {
          action.error = e instanceof Error ? e.message : String(e)
          if (action.undo !== undefined) copilot.snapshots.length = action.undo
          action.undo = undefined
          result = { error: action.error }
          if (tool && tool.level !== 'read') answer.actions.push(action)
        }
        copilot.history.push({ role: 'tool', tool_call_id: call.id, content: compact(result) })
        logEvent('copilot.tool', { tool: call.function.name, ok: action.ok })
      }
      if (signal.aborted) break
      if (round === MAX_ROUNDS - 1) answer.text = (answer.text ? `${answer.text}\n\n` : '') + tl('（操作步骤较多，已暂停；可以继续告诉我下一步。）')
    }
    if (!answer.text) answer.text = answer.actions.length ? tl('已完成。') : '…'
  } catch (e) {
    const err = e instanceof AiError ? e : null
    copilot.bubbles.splice(copilot.bubbles.indexOf(answer), 1)
    if (err?.code !== 'aborted') copilot.bubbles.push({ id: ++ids, role: 'error', text: err ? err.message : String((e as Error).message), actions: [], code: err?.code })
    // The unanswered user turn stays in the history only as text, so the next question is well-formed
    trimToText()
  } finally {
    // Older turns keep only their text (no repeated state blocks or images)
    userMsg.content = said
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

/**
 * "识别题目" in the Copilot box (26.59 fix, D182): the problem goes through the reading pipeline (the same as the
 * task panel and Copilot's own import_problem), shown as one item of the conversation; on success the conversation
 * learns what was loaded, so "答案是多少？" or "为什么" can follow.
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
 * Whether a message is a whole problem to read rather than something to chat about (26.59 fix, D190): it is long
 * enough, gives values or a figure, and asks for something ("求…", "多大", "多少"…). A question about the app or the
 * current scene ("为什么…", "怎么…", "帮我…", "这个场景…") stays a chat message.
 */
export function looksLikeProblem(text: string): boolean {
  const t = text.trim()
  if (t.length < 24) return false
  const asks = /求[:：（(]?|求出|多大|多少|多长|多远|多高|多快|几秒|为多少|是多少|试求|计算|判断|what is|find|calculate|determine|how (much|far|long|fast|many|high)|wie (groß|viel|weit|lange|schnell|hoch)|berechne|bestimme/i.test(t)
  const values = /\d/.test(t) || /如图|下图|图中|shown|figure|Abbildung/i.test(t)
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

/** A worked prompt to start with (chips under an empty conversation). */
export const STARTERS = [
  '帮我打开一道板块模型的例题',
  '显示物块受到的支持力和摩擦力',
  '怎么把物块的质量改成 3 kg？',
  '这个场景里物块在 1 s 时的速度是多少？',
  '用 x‑t / v‑t / a‑t 曲线解释一下这个运动',
  '帮我搭一个两个物块用绳跨过定滑轮相连的场景'
]
