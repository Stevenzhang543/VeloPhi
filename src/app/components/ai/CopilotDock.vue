<script setup lang="ts">
/**
 * The Copilot dock (26.59 fix, D183): a column at the right edge of the window, next to the pages (it no longer
 * floats over the right panel). Drag its left edge to change the width; collapse it to a thin strip (or, with the
 * setting off, hide it until Ctrl+I). On narrow windows it slides over the page; on phones it fills the screen.
 *
 * Two Copilots (26.59 fix 3, D198), switched at the top, each with its own conversation: "解题" explains how to
 * solve a problem (a teacher; no tools), "仿真" builds the problem in the engine — it writes a VeloΦ scene file
 * (JSON), the app checks and loads it and the engine computes the answers, shown on a card with the file (copy,
 * save as .velophi.json, load again) — and operates the app. One click hands a problem to the other Copilot.
 * Photos can be pasted or dropped into either; "深度思考" lets a thinking model (DeepSeek) think first.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { state, showToast } from '../../store'
import { settings } from '../../settings'
import { copilot, sendToCopilot, stopCopilot, clearCopilot, undoAction, recognizeInCopilot, copilotThinks, STARTERS, setCopilotMode, restoreCopilotMode, buildInSim, explainInSolve, reloadScene } from '../../../ai/copilot/session'
import type { Bubble, CopilotMode, SceneCard } from '../../../ai/copilot/session'
import { problemAnswers } from '../../../ai/import/answers'
import type { AnswerLine } from '../../../ai/import/answers'
import { saveFile, sceneFilter } from '../../../platform/files'
import { safeName } from '../../../export/safeName'
import { renderAnswer } from '../../../ai/copilot/render'
import { aiReady, aiVision, aiLabel, aiCanThink } from '../../../ai/client'
import { aiImport, cancelImport } from '../../../ai/import/pipeline'
import { imageFrom, imageToDataUrl } from '../../../ai/image'
import { narrow, phone, setCopilotOpen } from '../../layout'
import { MOD } from '../../shortcuts'
import ImportCard from './ImportCard.vue'
import Icon from '../Icon.vue'

const input = ref('')
const image = ref<string | null>(null)
const list = ref<HTMLElement | null>(null)
const box = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const ready = computed(() => aiReady())
const canThink = computed(() => aiCanThink())
const open = computed(() => state.showCopilot)
const overlay = computed(() => narrow.value || phone.value)

function setOpen(v: boolean) {
  setCopilotOpen(v)
  if (v) void nextTick(() => box.value?.focus())
}
function goSetup() { state.page = 'settings'; state.settingsSection = 'ai'; if (overlay.value) setOpen(false) }

async function send(text = input.value) {
  if (!ready.value.ok) { goSetup(); return }
  const t = text.trim()
  if (!t && !image.value) return
  const img = image.value ?? undefined
  input.value = ''
  image.value = null
  await sendToCopilot(t, img)
}
const MODES: Array<{ id: CopilotMode; label: string; icon: string; hint: string }> = [
  { id: 'solve', label: '解题讲解', icon: 'graduation', hint: '讲解题目：过程分析、规律选择、列式求解、易错点' },
  { id: 'sim', label: '仿真搭建', icon: 'play', hint: '用引擎搭建题目：AI 写出场景文件（JSON），自动载入并计算' }
]
function pickMode(m: CopilotMode) { setCopilotMode(m); void nextTick(() => box.value?.focus()) }
function onModeKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault()
  pickMode(copilot.mode === 'solve' ? 'sim' : 'solve')
  void nextTick(() => (document.querySelector(`[data-ui="copilot-mode-${copilot.mode}"]`) as HTMLElement | null)?.focus())
}
/** Answers of a scene card: live while its problem is open (they may still be computing), else as they were. */
function cardAnswers(c: SceneCard): AnswerLine[] | null {
  if (c.problemId && state.problem?.problem.id === c.problemId) return problemAnswers(c.problemId) ?? c.answers
  return c.answers
}
function cardHidden(c: SceneCard): boolean { return c.hidden && !(c.problemId && state.problem?.problem.id === c.problemId && state.problem.revealed) }
async function saveJson(c: SceneCard) {
  try { if (await saveFile(c.json, `${safeName(c.name)}.velophi.json`, sceneFilter())) showToast(tl('已保存')) } catch (e) { showToast((e as Error).message, true) }
}
async function reload(c: SceneCard) { if (await reloadScene(c)) showToast(tl('已重新载入')) }
/** The failed scene builds of an answer (the template reader is offered then). */
const buildFailed = (b: Bubble) => !b.scene && b.actions.some(a => a.tool === 'apply_scene' && !a.ok)
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

function onKey(e: KeyboardEvent) {
  // stopPropagation: Ctrl+Enter is also "重新计算" for the window
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); void send(); return }
  if (e.key === 'Escape') { e.stopPropagation(); if (copilot.busy) stop(); else if (overlay.value) setOpen(false); else (e.target as HTMLElement).blur() }
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

// Width: drag the left edge (280–640 px, remembered)
function dragWidth(e: PointerEvent) {
  const start = { x: e.clientX, w: settings.ai.dockWidth }
  const move = (ev: PointerEvent) => { settings.ai.dockWidth = Math.round(Math.max(280, Math.min(640, start.w - (ev.clientX - start.x)))) }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
function nudgeWidth(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') settings.ai.dockWidth = Math.min(640, settings.ai.dockWidth + 20)
  else if (e.key === 'ArrowRight') settings.ai.dockWidth = Math.max(280, settings.ai.dockWidth - 20)
}

// The welcome page's "粘贴一道题" and the task panel open the simulation Copilot with the box focused
function focusBox() { if (!copilot.busy) setCopilotMode('sim'); setOpen(true) }
onMounted(() => { restoreCopilotMode(); window.addEventListener('velophi:focus-import', focusBox); if (open.value) void nextTick(() => box.value?.focus()) })
onBeforeUnmount(() => window.removeEventListener('velophi:focus-import', focusBox))
watch(() => [copilot.bubbles.length, copilot.status, aiImport.stage], () => nextTick(() => { list.value?.scrollTo({ top: list.value.scrollHeight, behavior: 'smooth' }) }))
</script>

<template>
  <!-- Collapsed: a thin strip with the way back in (wide windows, setting on) -->
  <aside v-if="!open && !overlay && settings.ai.importBar" class="strip" :aria-label="'Copilot'">
    <button type="button" class="btn icon ghost" data-ui="copilot-open" :title="tl('打开 Copilot（{0}+I）', [MOD])" :aria-label="tl('打开 Copilot')" @click="setOpen(true)"><Icon name="chat" :size="17" /></button>
    <button type="button" class="btn icon ghost" :title="tl('解题：讲解题目的思路与过程')" :aria-label="tl('解题讲解')" @click="pickMode('solve'); setOpen(true)"><Icon name="graduation" :size="16" /></button>
    <button type="button" class="btn icon ghost" :title="tl('仿真：用引擎搭建题目')" :aria-label="tl('仿真搭建')" @click="pickMode('sim'); setOpen(true)"><Icon name="play" :size="16" /></button>
    <span class="strip-label" aria-hidden="true">Copilot</span>
  </aside>

  <aside v-else-if="open" class="dock" :class="{ overlay, phone }" :style="overlay ? undefined : { width: `${settings.ai.dockWidth}px` }" role="complementary" :aria-label="'Copilot'" @dragover.prevent @drop="onDrop">
    <div v-if="!overlay" class="resize" role="separator" aria-orientation="vertical" :aria-label="tl('拖动调整 Copilot 宽度')" tabindex="0" @pointerdown.prevent="dragWidth" @keydown="nudgeWidth" />
    <header class="head">
      <Icon name="chat" :size="16" />
      <b>Copilot</b>
      <span class="conn" :title="aiLabel()">{{ aiLabel() }}</span>
      <span class="spacer" />
      <button type="button" class="btn icon ghost" :title="tl('新对话')" :aria-label="tl('新对话')" :disabled="!copilot.bubbles.length || copilot.busy" @click="clearCopilot"><Icon name="plus" :size="14" /></button>
      <button type="button" class="btn icon ghost" :title="tl('AI 设置')" :aria-label="tl('AI 设置')" @click="goSetup"><Icon name="settings" :size="14" /></button>
      <button type="button" class="btn icon ghost" :title="overlay ? tl('关闭（Esc）') : tl('收起（{0}+I）', [MOD])" :aria-label="tl('收起')" @click="setOpen(false)"><Icon :name="overlay ? 'close' : 'sidebar'" :size="14" /></button>
    </header>
    <div class="modes" role="tablist" :aria-label="tl('Copilot 模式')" @keydown="onModeKey">
      <button
        v-for="m in MODES" :key="m.id" type="button" role="tab" class="mode-tab" :class="{ on: copilot.mode === m.id }" :data-ui="`copilot-mode-${m.id}`"
        :aria-selected="copilot.mode === m.id" :tabindex="copilot.mode === m.id ? 0 : -1" :disabled="copilot.busy && copilot.mode !== m.id" :title="tl(m.hint)" @click="pickMode(m.id)"
      ><Icon :name="m.icon" :size="13" />{{ tl(m.label) }}</button>
    </div>

    <div ref="list" class="body" aria-live="polite">
      <div v-if="!copilot.bubbles.length" class="empty">
        <p v-if="copilot.mode === 'solve'">{{ tl('把题目发给我（文字或图片）：我会分析物理过程、讲清规律的选择，一步步列式求解，并指出易错点。也可以问概念。想看真实的运动过程，点“在仿真中搭建”。') }}</p>
        <p v-else>{{ tl('把题目发给我（文字或图片）：我会读题，写出 VeloΦ 场景文件（JSON）把它搭出来并自动载入，答案由引擎计算。也可以让我修改场景、显示受力、播放、画曲线。') }}</p>
        <p v-if="settings.ai.learningMode" class="mode">{{ tl('学习模式已开启：我先给提示，你作答后再对照答案。') }}</p>
        <div class="starters"><button v-for="s in STARTERS[copilot.mode]" :key="s" type="button" class="btn small" @click="send(tl(s))">{{ tl(s) }}</button></div>
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
              <button v-if="a.ok && a.undo !== undefined && !a.undone" type="button" class="btn small ghost" @click="undoAction(a)">{{ tl('撤销') }}</button>
              <span v-if="a.undone" class="muted">{{ tl('已撤销') }}</span>
            </li>
          </ul>
          <div v-if="b.scene" class="scene-card">
            <div class="sc-head"><Icon name="studio" :size="13" /><b>{{ tl('已搭建并载入：{0}', [b.scene.name]) }}</b></div>
            <p class="sc-meta">{{ tl('{0} 个物体 · {1} 个连接件', [b.scene.bodies, b.scene.connectors]) }}</p>
            <ol v-if="b.scene.questions.length" class="sc-ans">
              <li v-for="(q, i) in b.scene.questions" :key="i">
                <span>{{ q }}</span>
                <b v-if="cardHidden(b.scene)">{{ tl('（作答后揭晓）') }}</b>
                <b v-else>{{ cardAnswers(b.scene)?.[i]?.text ?? tl('计算中…') }}</b>
                <small v-if="!cardHidden(b.scene) && cardAnswers(b.scene)?.[i]?.note" class="muted">{{ cardAnswers(b.scene)?.[i]?.note }}</small>
              </li>
            </ol>
            <details v-if="b.scene.notes.length || b.scene.warnings.length" class="sc-notes">
              <summary>{{ tl('App 的调整与提示（{0}）', [b.scene.notes.length + b.scene.warnings.length]) }}</summary>
              <ul><li v-for="(n, i) in [...b.scene.notes, ...b.scene.warnings]" :key="i">{{ n }}</li></ul>
            </details>
            <details class="sc-json">
              <summary>{{ tl('场景文件（JSON）') }}</summary>
              <pre tabindex="0">{{ b.scene.json }}</pre>
            </details>
            <div class="sc-btns">
              <button type="button" class="btn small ghost" @click="copy(b.scene.json)"><Icon name="copy" :size="12" />{{ tl('复制 JSON') }}</button>
              <button type="button" class="btn small ghost" @click="saveJson(b.scene)"><Icon name="save" :size="12" />{{ tl('保存 .json') }}</button>
              <button type="button" class="btn small ghost" :disabled="copilot.busy" @click="reload(b.scene)"><Icon name="undo" :size="12" />{{ tl('重新载入') }}</button>
            </div>
          </div>
          <div v-if="b.text" class="text" v-html="renderAnswer(b.text)" />
          <button v-if="b.text" type="button" class="copy" :title="tl('复制')" :aria-label="tl('复制')" @click="copy(b.text)"><Icon name="copy" :size="12" /></button>
          <div v-if="b.problem && !copilot.busy" class="handoff">
            <button v-if="copilot.mode === 'solve'" type="button" class="btn small" @click="buildInSim(b.problem)"><Icon name="play" :size="12" />{{ tl('在仿真中搭建这道题') }}</button>
            <template v-else>
              <button type="button" class="btn small" @click="explainInSolve(b.problem, b.scene)"><Icon name="graduation" :size="12" />{{ b.scene ? tl('讲解这道题（附仿真结果）') : tl('讲解这道题') }}</button>
              <button v-if="buildFailed(b)" type="button" class="btn small ghost" :title="tl('改用模板匹配的读题流程（识别题目）')" @click="recognize(undefined, { text: b.problem })"><Icon name="wand" :size="12" />{{ tl('改用模板读题') }}</button>
            </template>
          </div>
        </div>
        <div v-else class="msg error" role="alert">
          <span>{{ b.text }}</span>
          <button v-if="b.code === 'not_configured' || b.code === 'unauthorized' || b.code === 'quota'" type="button" class="btn small" @click="goSetup">{{ tl('打开设置') }}</button>
        </div>
      </template>
      <div v-if="copilot.busy && !aiImport.busy" class="status" role="status"><span class="dot" />{{ copilot.status }}…</div>
    </div>

    <footer class="foot">
      <p v-if="!ready.ok" class="need">{{ ready.reason }} <button type="button" class="btn small primary" @click="goSetup">{{ ready.action === 'signin' ? tl('登录') : tl('填写 key') }}</button></p>
      <div v-if="image" class="thumb"><img :src="image" :alt="tl('题目图片')"><button type="button" class="btn small ghost" @click="image = null">{{ tl('移除图片') }}</button></div>
      <textarea
        ref="box" v-model="input" rows="3" class="field" data-ui="copilot-input"
        :placeholder="copilot.mode === 'solve' ? tl('发一道题或一个问题（可粘贴图片），我来讲解思路与解法（Enter 发送 · Shift+Enter 换行）') : tl('发一道题（可粘贴图片），我用引擎把它搭出来并计算；也可以让我改场景、显示受力、播放（Enter 发送 · Shift+Enter 换行）')"
        :aria-label="tl('给 Copilot 的消息或题目')" @keydown="onKey" @paste="onPaste"
      />
      <div class="tools">
        <button v-if="aiVision()" type="button" class="btn icon ghost" :title="tl('附上题目图片（也可以直接粘贴或拖入）')" :aria-label="tl('附上题目图片')" @click="fileInput?.click()"><Icon name="image" :size="15" /></button>
        <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile">
        <button v-if="canThink" type="button" class="chip-toggle" :class="{ on: settings.ai.thinking }" :aria-pressed="settings.ai.thinking" :title="tl('深度思考：先思考再回答（更慢，用量更多）')" @click="settings.ai.thinking = !settings.ai.thinking"><Icon name="sparkle" :size="13" />{{ tl('深度思考') }}</button>
        <span class="spacer" />
        <template v-if="copilot.busy">
          <button type="button" class="btn small" @click="stop">{{ tl('停止') }}</button>
        </template>
        <template v-else>
          <button type="button" class="btn primary" data-ui="copilot-send" :disabled="!input.trim() && !image" :title="tl('发送（Enter）')" @click="send()"><Icon :name="copilot.mode === 'sim' ? 'play' : 'send'" :size="14" />{{ copilot.mode === 'sim' ? tl('搭建') : tl('发送') }}</button>
        </template>
      </div>
      <p v-if="copilotThinks()" class="tiny muted">{{ tl('深度思考已开启：回答更慢，用量更多。') }}</p>
    </footer>
  </aside>
</template>

<style scoped>
.strip { flex: 0 0 auto; width: 44px; margin-left: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 0; border-radius: var(--radius-panel, 16px); background: var(--pane); border: 1px solid var(--separator); }
.strip-label { writing-mode: vertical-rl; font-size: var(--type-tiny); color: var(--text-3); letter-spacing: 0.08em; margin-top: 6px; }
.dock { position: relative; flex: 0 0 auto; margin-left: 8px; min-width: 280px; max-width: 640px; border-radius: var(--radius-panel, 16px); background: var(--pane); border: 1px solid var(--separator); display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; grid-template-columns: minmax(0, 1fr); overflow: hidden; }
.dock.overlay { position: fixed; z-index: 60; right: 8px; top: calc(var(--control-h) + 22px); bottom: 8px; width: min(420px, calc(100vw - 16px)); margin: 0; box-shadow: var(--shadow-float, 0 18px 48px rgba(0, 0, 0, 0.28)); animation: enter var(--dur-panel, 280ms) var(--ease-out); }
.dock.phone { left: 4px; right: 4px; top: 4px; bottom: 4px; width: auto; }
@keyframes enter { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
.resize { position: absolute; left: 0; top: 0; bottom: 0; width: 8px; cursor: col-resize; z-index: 2; }
.resize:hover, .resize:focus-visible { background: color-mix(in srgb, var(--accent) 25%, transparent); outline: none; }
.head { display: flex; align-items: center; gap: 6px; padding: 8px 8px 6px 14px; border-bottom: 1px solid var(--separator); }
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
.modes { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin: 8px 10px 0; padding: 2px; border-radius: 10px; background: var(--fill); }
.mode-tab { display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 28px; border: 0; border-radius: 8px; background: none; color: var(--text-2); font: inherit; font-size: var(--type-small); cursor: pointer; }
.mode-tab:hover:not(:disabled) { color: var(--text); }
.mode-tab.on { background: var(--pane); color: var(--text); font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
.mode-tab:disabled { opacity: 0.5; cursor: default; }
.mode-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
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
.sc-btns .btn, .handoff .btn { display: inline-flex; align-items: center; gap: 4px; }
.handoff { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.tiny { margin: 0; font-size: var(--type-tiny); }
.muted { color: var(--text-3); }
@media (prefers-reduced-motion: reduce) { .dock.overlay { animation: none; } .dot { animation: none; } }
</style>
