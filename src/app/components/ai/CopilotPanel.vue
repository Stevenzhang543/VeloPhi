<script setup lang="ts">
/**
 * The Copilot panel (26.60, D204–D206): the AI tab of the sidebar, or the AI sheet on a phone. One conversation (the
 * "解题讲解" / "仿真搭建" pages of 26.59 fix 3 are merged): a problem (text or photo) is answered with 答案 · 过程 ·
 * 解释, and under the answer the user chooses whether to generate the simulation — the scene builder writes the VeloΦ
 * scene file (JSON), the app checks and loads it, the engine computes, and a card shows the answers with the file (copy,
 * save as .velophi.json, load again) and "对照讲解". Requests to build or change a set-up, and questions about the app,
 * go through the tools. Photos can be pasted or dropped; "深度思考" lets a thinking model (DeepSeek) think first.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { state, showToast } from '../../store'
import { settings } from '../../settings'
import { copilot, sendToCopilot, stopCopilot, clearCopilot, undoAction, SNAPSHOT_LIMIT, recognizeInCopilot, copilotThinks, STARTERS, reloadScene, buildFromAnswer, declineOffer, compareWithSim } from '../../../ai/copilot/session'
import type { Action, Bubble, Reading, SceneCard } from '../../../ai/copilot/session'
import { compareAnswers } from '../../../ai/copilot/verify'
import type { AnswerCheck } from '../../../ai/copilot/verify'
import { problemAnswers } from '../../../ai/import/answers'
import type { AnswerLine } from '../../../ai/import/answers'
import { saveFile, sceneFilter } from '../../../platform/files'
import { safeName } from '../../../export/safeName'
import { renderAnswer } from '../../../ai/copilot/render'
import { aiReady, aiVision, aiLabel, aiCanThink, aiStatus } from '../../../ai/client'
import { aiImport, cancelImport } from '../../../ai/import/pipeline'
import { imageFrom, imageToDataUrl } from '../../../ai/image'
import { phone, setCopilotOpen, showSideTab } from '../../layout'
import ImportCard from './ImportCard.vue'
import Icon from '../Icon.vue'

const input = ref('')
const image = ref<string | null>(null)
const list = ref<HTMLElement | null>(null)
const box = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
// 26.63 (D232): text handed over from another page (the home page's paste box) lands in the input, ready to send
watch(() => state.copilotDraft, d => { if (d) { input.value = d; state.copilotDraft = ''; void nextTick(() => box.value?.focus()) } }, { immediate: true })
const ready = computed(() => aiReady())
const canThink = computed(() => aiCanThink())

function goSetup() { state.page = 'settings'; state.settingsSection = 'ai'; if (phone.value) setCopilotOpen(false) }

async function send(text = input.value) {
  if (!ready.value.ok) { goSetup(); return }
  const t = text.trim()
  if (!t && !image.value) return
  const img = image.value ?? undefined
  input.value = ''
  image.value = null
  await sendToCopilot(t, img)
}
/** Answers of a scene card: live while its problem is open (they may still be computing), else as they were. */
function cardAnswers(c: SceneCard): AnswerLine[] | null {
  if (c.problemId && state.problem?.problem.id === c.problemId) return problemAnswers(c.problemId) ?? c.answers
  return c.answers
}
/**
 * 26.61 (C): the state of a card's numbers — computed by the app, never by the model: 计算中 (the run has not reached
 * the answers), 引擎读数 (from the run of this card's problem, open now), 之前的运行 (the problem was closed; the values
 * are those read then), 无法核验 (no value could be read), 学习模式 (hidden until revealed).
 */
function cardStatus(c: SceneCard): { key: 'computing' | 'engine' | 'earlier' | 'unverifiable' | 'hidden' | 'none'; text: string } {
  if (!c.problemId || !c.questions.length) return { key: 'none', text: '' }
  if (cardHidden(c)) return { key: 'hidden', text: tl('学习模式：作答后揭晓') }
  const open = state.problem?.problem.id === c.problemId
  const a = cardAnswers(c)
  if (open && !a) return { key: 'computing', text: tl('计算中') }
  if (!a) return { key: 'unverifiable', text: tl('无法核验：没有取得引擎读数') }
  if (a.every(x => x.value === null)) return { key: 'unverifiable', text: tl('无法核验：读数不可用') }
  return open ? { key: 'engine', text: tl('引擎读数 · 运行 #{0}', [state.runId]) } : { key: 'earlier', text: tl('引擎读数（之前的运行；题目已关闭）') }
}
/** The explanation's numbers against the engine's (verify.ts); only once the answers are shown. */
function cardChecks(b: Bubble): AnswerCheck[] {
  if (!b.scene || !b.explanation || cardHidden(b.scene)) return []
  const a = cardAnswers(b.scene)
  return a ? compareAnswers(b.explanation, a) : []
}
const CHECK_TEXT: Record<AnswerCheck['verdict'], string> = { match: '一致', mismatch: '条件不匹配', unverifiable: '无法核验' }
/** A reading taken by the Copilot is stale once the scene was changed or computed again. */
const readingStale = (r: Reading) => state.stale || state.runId !== r.run
function cardHidden(c: SceneCard): boolean { return c.hidden && !(c.problemId && state.problem?.problem.id === c.problemId && state.problem.revealed) }
async function saveJson(c: SceneCard) {
  try { if (await saveFile(c.json, `${safeName(c.name)}.velophi.json`, sceneFilter())) showToast(tl('已保存')) } catch (e) { showToast((e as Error).message, true) }
}
async function reload(c: SceneCard) { if (await reloadScene(c)) showToast(tl('已重新载入')) }
/** The template reader (26.59 fix, D182) — offered when building the scene failed. */
async function recognize(hint?: string, again?: { text: string; image?: string }) {
  if (!ready.value.ok) { goSetup(); return }
  const t = again ? again.text : input.value.trim()
  const img = again ? again.image : image.value ?? undefined
  if (!t && !img) { box.value?.focus(); showToast(tl('请先输入或粘贴一道题')); return }
  if (!again) { input.value = ''; image.value = null }
  await recognizeInCopilot(t, img, hint)
}
/** Read again from the corrected transcript of a photo (the photo is dropped: the text now says it all). */
function reread(source: { text: string } | undefined, transcript: string) {
  const typed = source?.text.trim() ?? ''
  void recognize(undefined, { text: typed ? `${typed}\n\n${transcript}` : transcript })
}
function stop() { if (aiImport.busy) cancelImport(); stopCopilot() }
/** Show the built scene: the canvas (phones close the sheet) or the problem tab. */
function viewScene() { if (phone.value) setCopilotOpen(false); else if (state.problem) showSideTab('problem') }

function onKey(e: KeyboardEvent) {
  // stopPropagation: Ctrl+Enter is also "重新计算" for the window
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); void send(); return }
  if (e.key === 'Escape') { e.stopPropagation(); if (copilot.busy) stop(); else (e.target as HTMLElement).blur() }
}
async function onPaste(e: ClipboardEvent) {
  const f = imageFrom(e.clipboardData?.items)
  if (!f) return
  e.preventDefault()
  await takeImage(f)
}
async function onDrop(e: DragEvent) {
  const f = imageFrom(e.dataTransfer?.files)
  if (!f) return
  e.preventDefault()
  await takeImage(f)
}
async function takeImage(f: File) {
  if (!aiVision()) { showToast(tl('当前 AI 模型不支持图片，请输入文字题目（或在设置中换用支持图片的模型）'), true); return }
  try { image.value = await imageToDataUrl(f) } catch { showToast(tl('无法读取这张图片'), true) }
}
async function onFile(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) await takeImage(f); (e.target as HTMLInputElement).value = '' }
async function copy(text: string) { try { await navigator.clipboard.writeText(text); showToast(tl('已复制')) } catch { /* unavailable */ } }

// The welcome page's "粘贴一道题" and the task panel open the Copilot with the box focused
function focusBox() { setCopilotOpen(true); void nextTick(() => box.value?.focus()) }
onMounted(() => { window.addEventListener('velophi:focus-import', focusBox); if (!phone.value) void nextTick(() => box.value?.focus()) })
onBeforeUnmount(() => window.removeEventListener('velophi:focus-import', focusBox))
watch(() => [copilot.bubbles.length, copilot.status, aiImport.stage], () => nextTick(() => { list.value?.scrollTo({ top: list.value.scrollHeight, behavior: 'smooth' }) }))
/** "撤销" on a change (26.61, R1): an expired or failed undo says so instead of restoring another state. */
async function onUndo(a: Action) {
  const r = await undoAction(a)
  if (r === 'done') showToast(tl('已撤销 Copilot 的改动'))
  else if (r === 'expired') showToast(tl('这一步已超出保留期，不能撤销'), true)
  else if (r === 'failed') showToast(tl('撤销失败：快照无法读取'), true)
}
/** A built scene that failed (the template reader is offered then). */
const buildFailed = (b: Bubble) => b.offer?.state === 'failed'
</script>

<template>
  <section class="copilot" :class="{ phone }" role="complementary" :aria-label="'Copilot'" @dragover.prevent @drop="onDrop">
    <header class="head">
      <Icon name="chat" :size="15" />
      <b>Copilot</b>
      <span class="conn" :title="aiLabel()">{{ aiLabel() }}</span>
      <span class="spacer" />
      <button type="button" class="btn icon ghost" :title="tl('新对话')" :aria-label="tl('新对话')" :disabled="!copilot.bubbles.length || copilot.busy" @click="clearCopilot"><Icon name="plus" :size="14" /></button>
      <button type="button" class="btn icon ghost" :title="tl('AI 设置')" :aria-label="tl('AI 设置')" @click="goSetup"><Icon name="settings" :size="14" /></button>
    </header>

    <div ref="list" class="body" aria-live="polite">
      <div v-if="!copilot.bubbles.length" class="empty">
        <p>{{ tl('把题目发给我（文字或图片）：我先给出答案、过程和解释；你可以再选择“生成仿真场景”，由引擎把题目搭出来并验证答案。也可以让我搭建或修改场景、显示受力、播放、画曲线，或者问概念。') }}</p>
        <p v-if="settings.ai.learningMode" class="mode">{{ tl('学习模式已开启：我先给提示，你作答后再对照答案。') }}</p>
        <div class="starters"><button v-for="s in STARTERS" :key="s" type="button" class="btn small" @click="send(tl(s))">{{ tl(s) }}</button></div>
      </div>
      <template v-for="b in copilot.bubbles" :key="b.id">
        <div v-if="b.role === 'user'" class="msg user"><img v-if="b.image" :src="b.image" :alt="tl('题目图片')"><span>{{ b.text }}</span></div>
        <ImportCard v-else-if="b.role === 'import'" :outcome="b.outcome" :source="b.source" @retry="h => recognize(h, b.source)" @reread="t => reread(b.source, t)" />
        <div v-else-if="b.role === 'assistant'" class="msg bot">
          <details v-if="b.reasoning" class="thinking"><summary>{{ tl('思考过程（{0} 字）', [b.reasoning.length]) }}</summary><p>{{ b.reasoning }}</p></details>
          <ul v-if="b.actions.length" class="acts">
            <li v-for="a in b.actions" :key="a.id" :class="{ fail: !a.ok, undone: a.undone }">
              <Icon :name="a.ok ? 'check2' : 'cross'" :size="12" /><span>{{ a.label }}</span>
              <span v-if="a.error" class="err">{{ a.error }}</span>
              <button v-if="a.ok && a.undo !== undefined && !a.undone && !a.expired" type="button" class="btn small ghost" data-ui="copilot-undo" :disabled="copilot.busy" @click="onUndo(a)">{{ tl('撤销') }}</button>
              <span v-if="a.undone" class="muted">{{ tl('已撤销') }}</span>
              <span v-else-if="a.expired" class="muted" :title="tl('只保留最近 {0} 次改动的快照', [SNAPSHOT_LIMIT])">{{ tl('已超出保留期，不能撤销') }}</span>
              <details v-if="a.ok && a.diff" class="diff" data-ui="copilot-diff">
                <summary>{{ a.diff.replaced ? tl('替换了整个场景') : tl('改动 {0} 处', [a.diff.lines.length + a.diff.more]) }}</summary>
                <ul><li v-for="(l, i) in a.diff.lines" :key="i"><code>{{ l }}</code></li><li v-if="a.diff.more" class="muted">{{ tl('另有 {0} 处', [a.diff.more]) }}</li></ul>
              </details>
            </li>
          </ul>
          <ul v-if="b.readings?.length" class="reads">
            <li v-for="r in b.readings" :key="r.id" :class="{ stale: readingStale(r) }" :title="r.scene">
              <span class="tag" :class="readingStale(r) ? 'st-unverifiable' : 'st-engine'">{{ readingStale(r) ? tl('已过期') : tl('引擎读数') }}</span>
              <span>{{ r.label }} · {{ tl('运行 #{0}', [r.run]) }}<template v-if="!r.complete"> · {{ tl('计算中') }}</template></span>
            </li>
          </ul>
          <div v-if="b.scene" class="scene-card">
            <div class="sc-head"><Icon name="studio" :size="13" /><b>{{ tl('已搭建并载入：{0}', [b.scene.name]) }}</b></div>
            <p class="sc-meta">{{ tl('{0} 个物体 · {1} 个连接件', [b.scene.bodies, b.scene.connectors]) }}<span v-if="cardStatus(b.scene).key !== 'none'" class="tag" :class="`st-${cardStatus(b.scene).key}`" data-ui="copilot-status">{{ cardStatus(b.scene).text }}</span></p>
            <ol v-if="b.scene.questions.length" class="sc-ans">
              <li v-for="(q, i) in b.scene.questions" :key="i">
                <span>{{ q }}</span>
                <b v-if="cardHidden(b.scene)">{{ tl('（作答后揭晓）') }}</b>
                <b v-else>{{ cardAnswers(b.scene)?.[i]?.text ?? tl('计算中…') }}</b>
                <small v-if="!cardHidden(b.scene) && cardAnswers(b.scene)?.[i]?.note" class="muted">{{ cardAnswers(b.scene)?.[i]?.note }}</small>
              </li>
            </ol>
            <ul v-if="cardChecks(b).length" class="checks" data-ui="copilot-checks">
              <li v-for="(c, i) in cardChecks(b)" :key="i" :class="`ck-${c.verdict}`">
                <span class="tag" :class="c.verdict === 'match' ? 'st-engine' : c.verdict === 'mismatch' ? 'st-mismatch' : 'st-unverifiable'">{{ tl(CHECK_TEXT[c.verdict]) }}</span>
                <span>{{ tl('讲解 {0} · 引擎 {1}', [c.claimedText ?? '—', cardAnswers(b.scene!)?.[i]?.text ?? '—']) }}<template v-if="c.rel !== null && c.verdict === 'mismatch'"> · {{ tl('相差 {0}%', [(c.rel * 100).toFixed(1)]) }}</template></span>
              </li>
            </ul>
            <details v-if="b.assumptions?.length" class="sc-notes">
              <summary>{{ tl('构建时的假设（{0}）', [b.assumptions.length]) }}</summary>
              <ul><li v-for="(n, i) in b.assumptions" :key="i">{{ n }}</li></ul>
            </details>
            <details v-if="b.scene.notes.length || b.scene.warnings.length" class="sc-notes">
              <summary>{{ tl('App 的调整与提示（{0}）', [b.scene.notes.length + b.scene.warnings.length]) }}</summary>
              <ul><li v-for="(n, i) in [...b.scene.notes, ...b.scene.warnings]" :key="i">{{ n }}</li></ul>
            </details>
            <details class="sc-json">
              <summary>{{ tl('场景文件（JSON）') }}</summary>
              <pre tabindex="0">{{ b.scene.json }}</pre>
            </details>
            <div class="sc-btns">
              <button type="button" class="btn small ghost" @click="viewScene"><Icon name="eye" :size="12" />{{ tl('查看') }}</button>
              <button type="button" class="btn small ghost" @click="copy(b.scene.json)"><Icon name="copy" :size="12" />{{ tl('复制 JSON') }}</button>
              <button type="button" class="btn small ghost" @click="saveJson(b.scene)"><Icon name="save" :size="12" />{{ tl('保存 .json') }}</button>
              <button type="button" class="btn small ghost" :disabled="copilot.busy" @click="reload(b.scene)"><Icon name="undo" :size="12" />{{ tl('重新载入') }}</button>
            </div>
            <button v-if="b.problem && b.scene.questions.length && !copilot.busy" type="button" class="btn small compare" @click="compareWithSim(b.problem, b.scene)"><Icon name="graduation" :size="12" />{{ tl('对照讲解与仿真结果') }}</button>
          </div>
          <p v-if="b.problem && b.text && !b.scene" class="draft" data-ui="copilot-draft"><span class="tag st-draft">{{ tl('讲解草稿') }}</span>{{ tl('数值由 AI 推算，未经引擎核验；生成仿真场景后由 App 对照。') }}</p>
          <div v-if="b.text" class="text" v-html="renderAnswer(b.text)" />
          <button v-if="b.text" type="button" class="copy" :title="tl('复制')" :aria-label="tl('复制')" @click="copy(b.text)"><Icon name="copy" :size="12" /></button>
          <!-- 26.60 (D204): the user chooses whether to build the problem in the engine -->
          <div v-if="b.offer && (b.offer.state === 'open' || b.offer.state === 'failed') && !copilot.busy" class="offer">
            <p class="offer-q">{{ b.offer.state === 'failed' ? tl('没能搭出这道题。可以再试一次，或改用模板读题。') : tl('要把这道题生成仿真场景（JSON）并导入，让引擎计算、验证答案吗？') }}</p>
            <div class="offer-btns">
              <button type="button" class="btn small primary" data-ui="copilot-build" @click="buildFromAnswer(b)"><Icon name="play" :size="12" />{{ b.offer.state === 'failed' ? tl('再试一次') : tl('生成仿真场景') }}</button>
              <button v-if="buildFailed(b)" type="button" class="btn small ghost" :title="tl('改用模板匹配的读题流程（识别题目）')" @click="recognize(undefined, { text: b.problem! })"><Icon name="wand" :size="12" />{{ tl('改用模板读题') }}</button>
              <button v-else type="button" class="btn small ghost" @click="declineOffer(b)">{{ tl('不用了') }}</button>
            </div>
          </div>
        </div>
        <div v-else class="msg error" role="alert">
          <span>{{ b.text }}</span>
          <button v-if="b.code === 'not_configured' || b.code === 'unauthorized' || b.code === 'quota'" type="button" class="btn small" @click="goSetup">{{ tl('打开设置') }}</button>
        </div>
      </template>
      <div v-if="copilot.busy && !aiImport.busy" class="status" role="status"><span class="dot" />{{ copilot.status }}…</div>
      <!-- 26.63 (D238): between a failed request and its retry -->
      <div v-if="aiStatus.waiting" class="status waiting" role="status" data-ui="copilot-waiting"><span class="dot" />{{ tl('{0}，{1} 秒后第 {2} 次重试…', [aiStatus.waiting.reason, aiStatus.waiting.seconds, aiStatus.waiting.retry]) }}</div>
    </div>

    <footer class="foot">
      <p v-if="!ready.ok" class="need">{{ ready.reason }} <button type="button" class="btn small primary" @click="goSetup">{{ ready.action === 'signin' ? tl('登录') : tl('填写 key') }}</button></p>
      <div v-if="image" class="thumb"><img :src="image" :alt="tl('题目图片')"><button type="button" class="btn small ghost" @click="image = null">{{ tl('移除图片') }}</button></div>
      <textarea
        ref="box" v-model="input" :rows="phone ? 2 : 3" class="field" data-ui="copilot-input"
        :placeholder="tl('发一道题或一个问题（可粘贴图片）；也可以让我搭建场景、显示受力、播放（Enter 发送 · Shift+Enter 换行）')"
        :aria-label="tl('给 Copilot 的消息或题目')" @keydown="onKey" @paste="onPaste"
      />
      <div class="tools">
        <button v-if="aiVision()" type="button" class="btn icon ghost" :title="tl('附上题目图片（也可以直接粘贴或拖入）')" :aria-label="tl('附上题目图片')" @click="fileInput?.click()"><Icon name="image" :size="15" /></button>
        <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile">
        <button v-if="canThink" type="button" class="chip-toggle" :class="{ on: settings.ai.thinking }" :aria-pressed="settings.ai.thinking" :title="tl('深度思考：先思考再回答（更慢，用量更多）')" @click="settings.ai.thinking = !settings.ai.thinking"><Icon name="sparkle" :size="13" />{{ tl('深度思考') }}</button>
        <span class="spacer" />
        <button data-ui="copilot-stop" v-if="copilot.busy" type="button" class="btn small" @click="stop">{{ tl('停止') }}</button>
        <button v-else type="button" class="btn primary" data-ui="copilot-send" :disabled="!input.trim() && !image" :title="tl('发送（Enter）')" @click="send()"><Icon name="send" :size="14" />{{ tl('发送') }}</button>
      </div>
      <p v-if="copilotThinks()" class="tiny muted">{{ tl('深度思考已开启：回答更慢，用量更多。') }}</p>
    </footer>
  </section>
</template>

<style scoped>
.copilot { height: 100%; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; grid-template-columns: minmax(0, 1fr); }
.head { display: flex; align-items: center; gap: 6px; padding: 4px 6px 6px 12px; border-bottom: 1px solid var(--separator); }
.conn { font-size: var(--type-tiny); color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.spacer { flex: 1; }
.body { overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.empty { color: var(--text-2); font-size: var(--type-small); display: grid; gap: 8px; }
.empty p { margin: 0; }
.mode { color: var(--accent); }
.empty { min-width: 0; }
.starters { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.starters .btn { white-space: normal; text-align: left; height: auto; min-height: 28px; padding-top: 4px; padding-bottom: 4px; line-height: 1.35; max-width: 100%; }
.msg { max-width: 94%; border-radius: 14px; padding: 8px 11px; line-height: 1.55; font-size: var(--type-body); position: relative; }
.msg.user { align-self: flex-end; background: var(--accent); color: var(--on-accent); white-space: pre-wrap; display: grid; gap: 6px; }
.msg.user img { max-width: 220px; border-radius: 8px; }
.msg.bot { align-self: flex-start; background: var(--fill); color: var(--text); padding-right: 26px; }
.msg.error { align-self: stretch; background: var(--danger-soft); color: var(--danger); display: grid; gap: 6px; font-size: var(--type-small); }
.thinking { margin: 0 0 6px; font-size: var(--type-small); color: var(--text-3); }
.thinking summary { cursor: pointer; }
.thinking p { margin: 4px 0 0; white-space: pre-wrap; max-height: 220px; overflow: auto; }
.text :deep(p) { margin: 0 0 6px; }
.text :deep(p:last-child) { margin-bottom: 0; }
.text :deep(ul), .text :deep(ol) { margin: 0 0 6px; padding-left: 20px; }
.text :deep(.tbl) { overflow-x: auto; margin: 2px 0 6px; }
/* 26.60: a long display formula scrolls sideways inside the bubble instead of being cut off */
.text :deep(.katex-display) { overflow-x: auto; overflow-y: hidden; margin: 4px 0; padding: 2px 0; }
.text :deep(table) { border-collapse: collapse; font-size: var(--type-small); }
.text :deep(th), .text :deep(td) { border: 1px solid var(--separator); padding: 3px 8px; text-align: left; white-space: nowrap; }
.text :deep(th) { background: var(--pane); font-weight: 600; }
.text :deep(code) { font-family: var(--font-mono); font-size: 0.92em; background: var(--pane); padding: 0 4px; border-radius: 4px; }
.copy { position: absolute; top: 6px; right: 6px; border: 0; background: none; color: var(--text-3); cursor: pointer; padding: 4px; border-radius: 6px; min-width: 24px; min-height: 24px; }
.copy:hover { background: var(--hover); color: var(--text); }
.acts { list-style: none; margin: 0 0 6px; padding: 0; display: grid; gap: 3px; font-size: var(--type-small); }
.acts li { display: flex; align-items: center; gap: 6px; color: var(--success); flex-wrap: wrap; }
.acts li span { color: var(--text-2); }
.acts li.fail { color: var(--danger); }
.acts li.undone span:first-of-type { text-decoration: line-through; }
.tag { display: inline-block; margin: 0 6px 0 0; padding: 0 6px; border-radius: 8px; font-size: var(--type-tiny); line-height: 17px; border: 1px solid var(--separator); white-space: nowrap; }
.sc-meta .tag { margin-left: 8px; }
.st-engine { color: var(--success, #15803d); border-color: currentColor; }
.st-computing, .st-hidden, .st-draft { color: var(--text-2); }
.st-earlier { color: var(--text-2); border-style: dashed; }
.st-mismatch { color: var(--warning, #b45309); border-color: currentColor; }
.st-unverifiable { color: var(--danger, #b91c1c); border-color: currentColor; }
.reads, .checks { list-style: none; margin: 4px 0; padding: 0; font-size: 12px; }
.reads li, .checks li { margin: 2px 0; }
.reads li.stale span:last-child { color: var(--text-2); text-decoration: line-through; }
.draft { margin: 0 0 4px; font-size: 12px; color: var(--text-2); }
.diff { margin: 2px 0 0 18px; font-size: 12px; }
.diff ul { margin: 2px 0; padding-left: 14px; }
.diff code { font-size: 11px; word-break: break-all; }
.acts .err { color: var(--danger) !important; font-size: var(--type-tiny); }
.acts .muted { color: var(--text-3); }
.status { display: flex; align-items: center; gap: 8px; color: var(--text-2); font-size: var(--type-small); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.3; } }
.foot { border-top: 1px solid var(--separator); padding: 8px 10px 10px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
.need { margin: 0; font-size: var(--type-small); color: var(--text-2); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.thumb { display: flex; align-items: center; gap: 8px; }
.thumb img { max-height: 56px; border-radius: 6px; border: 1px solid var(--separator); }
.field { width: 100%; resize: vertical; min-height: 64px; max-height: 40vh; font: inherit; font-size: var(--type-body); padding: 6px 8px; line-height: 1.45; border-radius: var(--radius-row, 8px); }
.tools { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.chip-toggle { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--separator); background: none; color: var(--text-2); font: inherit; font-size: var(--type-small); cursor: pointer; }
.chip-toggle:hover { background: var(--hover); }
.chip-toggle.on { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
.scene-card { margin: 0 0 8px; padding: 8px 10px; border-radius: 10px; background: var(--pane); border: 1px solid var(--separator); display: grid; gap: 4px; font-size: var(--type-small); }
.sc-head { display: flex; align-items: center; gap: 6px; color: var(--success); }
.sc-head b { color: var(--text); font-weight: 600; overflow-wrap: anywhere; }
.sc-meta { margin: 0; color: var(--text-3); }
.sc-ans { margin: 2px 0; padding-left: 20px; display: grid; gap: 2px; }
.sc-ans li span::after { content: ' = '; color: var(--text-3); }
.sc-ans small { display: block; }
.sc-notes, .sc-json { color: var(--text-2); }
.sc-notes summary, .sc-json summary { cursor: pointer; }
.sc-notes ul { margin: 4px 0 0; padding-left: 18px; }
.sc-json pre { margin: 4px 0 0; max-height: 260px; overflow: auto; padding: 6px 8px; border-radius: 6px; background: var(--fill); font-family: var(--font-mono); font-size: 11px; line-height: 1.4; white-space: pre; }
.sc-btns { display: flex; flex-wrap: wrap; gap: 4px; }
.sc-btns .btn { display: inline-flex; align-items: center; gap: 4px; }
.offer { margin-top: 10px; padding: 8px 10px; border-radius: 10px; background: var(--pane); border: 1px dashed color-mix(in srgb, var(--accent) 45%, transparent); display: grid; gap: 6px; }
.offer-q { margin: 0; font-size: var(--type-small); color: var(--text-2); }
.offer-btns { display: flex; flex-wrap: wrap; gap: 6px; }
.offer-btns .btn, .compare { display: inline-flex; align-items: center; gap: 4px; }
.compare { justify-self: start; margin-top: 2px; }
/* Phones: larger touch targets and a box that does not take half the sheet */
.copilot.phone .btn.small { min-height: 36px; }
.copilot.phone .head > b, .copilot.phone .head > .icon { display: none; }
.copilot.phone .field { min-height: 48px; }
.tiny { margin: 0; font-size: var(--type-tiny); }
.muted { color: var(--text-3); }
@media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
</style>
