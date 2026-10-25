<script setup lang="ts">
/**
 * Formula and event detail panel (manual 26.50, D28). Opened by `openFormulaDetail` / `openEventDetail`
 * (app/details.ts) from the formula cards, the event list, the timeline markers and the canvas event labels.
 * Docked on the right (drag the left edge to resize) or full-screen reading mode. The content comes from the pure
 * builders (formula/detail.ts, formula/eventDetail.ts) in the content language `locale.lang`, with the display units
 * and digits of the settings; the panel can copy the LaTeX and export the content as a PNG image. Esc closes it.
 *
 * Panel chrome strings are Chinese for now and collected in `UI` (the i18n pass extracts them).
 */
import { tl } from '../../i18n'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { detail, closeDetail, openFormulaDetail } from '../details'
import { state, seekAfter, seekTime, showToast } from '../store'
import { settings } from '../settings'
import { locale } from '../../i18n/locale'
import { buildFormulaDetail, findSituation } from '../../formula/detail'
import { buildEventDetail } from '../../formula/eventDetail'
import type { DetailView } from '../../formula/detailTypes'
import { detailLatex } from '../../formula/detailTypes'
import { detailImage } from '../../export/detailImage'
import { saveFile } from '../../platform/files'
import Tex from './Tex.vue'
import Icon from './Icon.vue'
import DetailBody from './detail/DetailBody.vue'

/** Panel chrome strings. */
const UI = {
  formula: tl('公式详情'),
  event: tl('事件详情'),
  close: tl('关闭（Esc）'),
  reading: tl('阅读模式'),
  dock: tl('停靠到右侧'),
  copy: tl('复制 LaTeX'),
  copied: tl('已复制 LaTeX'),
  copyFailed: tl('无法写入剪贴板'),
  exportPng: tl('导出图片'),
  exporting: tl('正在导出…'),
  exported: tl('已导出'),
  exportFailed: tl('导出失败：'),
  seekFormula: tl('跳到此时刻'),
  seekEvent: tl('跳到事件后'),
  follow: tl('取当前时刻'),
  followTitle: tl('用播放头所在时刻重新代入'),
  resize: tl('拖动调整宽度'),
  sections: tl('目录'),
  noRecording: tl('运行仿真后才能查看详情。'),
  noSituation: tl('当前记录中找不到这张公式卡片对应的情形（场景或时刻已改变）。'),
  failed: tl('详情生成失败：'),
  imageName: tl('详情')
}

/** Docked width (px), kept for the session. */
const width = ref(480)
const reading = ref(false)
const busy = ref(false)
const scroller = ref<HTMLElement | null>(null)

const target = computed(() => detail.target)
const rec = computed(() => (state.stale ? null : state.recording))

const built = computed<{ view: DetailView | null; message: string }>(() => {
  const t = target.value
  const r = rec.value
  if (!t) return { view: null, message: '' }
  if (!r) return { view: null, message: UI.noRecording }
  const opts = { digits: state.digits, units: settings.units }
  try {
    if (t.kind === 'formula') {
      const sit = findSituation(state.situations, t.formulaId, t.situationId, t.time)
      if (!sit) return { view: null, message: UI.noSituation }
      return { view: buildFormulaDetail(r, sit, t.formulaId, t.time, locale.lang, opts), message: '' }
    }
    return { view: buildEventDetail(r, t.eventIndex, locale.lang, opts), message: '' }
  } catch (e) {
    return { view: null, message: UI.failed + (e as Error).message }
  }
})
const view = computed(() => built.value.view)

// A new run invalidates event indices; formula details are rebuilt from the new situations
watch(() => state.runId, () => { if (detail.target?.kind === 'event') closeDetail() })
// A new target starts at the top
watch(target, () => nextTick(() => scroller.value?.scrollTo({ top: 0 })))

function jump(id: string) {
  scroller.value?.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function seek() {
  const t = target.value
  const r = rec.value
  if (!t || !r) return
  if (t.kind === 'formula') seekTime(t.time)
  else { const ev = r.events[t.eventIndex]; if (ev) seekAfter(ev.t) }
}

/** Re-target the formula detail at the playhead (the situation of the formula active then, if any). */
function follow() {
  const t = target.value
  const r = rec.value
  if (!t || t.kind !== 'formula' || !r) return
  const now = state.panelFrame * r.dt
  const sit = findSituation(state.situations, t.formulaId, null, now)
  openFormulaDetail(t.formulaId, sit?.key ?? t.situationId, now)
}

async function copyLatex() {
  if (!view.value) return
  try {
    await navigator.clipboard.writeText(detailLatex(view.value))
    showToast(UI.copied)
  } catch {
    showToast(UI.copyFailed, true)
  }
}

async function exportPng() {
  const v = view.value
  if (!v || busy.value) return
  busy.value = true
  try {
    const bg = settings.export.imageBackground
    const img = await detailImage(v, { theme: state.theme, background: bg, caption: state.scene.name }, { png: true })
    const safe = v.title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || UI.imageName
    const saved = await saveFile(img.png!, `${UI.imageName}-${safe}.png`, [{ name: 'PNG', extensions: ['png'] }])
    if (saved) showToast(`${UI.exported} ${saved}`)
  } catch (e) {
    showToast(UI.exportFailed + (e as Error).message, true)
  } finally {
    busy.value = false
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !detail.target) return
  // A dialog above the panel gets the key first
  if (document.querySelector('.dialog-backdrop')) return
  if (reading.value) reading.value = false
  else closeDetail()
}

function dragEdge(e: MouseEvent) {
  const x0 = e.clientX, w0 = width.value
  const move = (ev: MouseEvent) => { width.value = Math.round(Math.max(360, Math.min(window.innerWidth - 240, 1100, w0 - (ev.clientX - x0)))) }
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const TONE_CLASS: Record<string, string> = { ok: 'ok', warn: 'warn', bad: 'bad', info: 'info', neutral: '' }
</script>

<template>
  <div v-if="target && state.page !== 'settings'" class="detail-layer" :class="{ reading }" @click.self="reading && (reading = false)">
    <aside class="pane detail" role="dialog" :aria-label="target.kind === 'formula' ? UI.formula : UI.event" :style="reading ? undefined : { width: `${width}px` }">
      <div v-if="!reading" class="edge" :title="UI.resize" @mousedown.prevent="dragEdge" />
      <header class="dhead">
        <div class="tools">
          <span class="kind tiny">{{ target.kind === 'formula' ? UI.formula : UI.event }}</span>
          <button class="btn ghost small" :disabled="!view" @click="seek">{{ target.kind === 'formula' ? UI.seekFormula : UI.seekEvent }}</button>
          <button v-if="target.kind === 'formula'" class="btn ghost small" :disabled="!view" :title="UI.followTitle" @click="follow">{{ UI.follow }}</button>
          <span class="spacer" />
          <button class="btn icon ghost" :disabled="!view" :title="UI.copy" @click="copyLatex"><Icon name="copy" /></button>
          <button class="btn icon ghost" :disabled="!view || busy" :title="busy ? UI.exporting : UI.exportPng" @click="exportPng"><Icon name="download" /></button>
          <button class="btn icon ghost" :class="{ active: reading }" :title="reading ? UI.dock : UI.reading" @click="reading = !reading"><Icon name="display" /></button>
          <button class="btn icon ghost" :title="UI.close" @click="closeDetail"><Icon name="close" /></button>
        </div>
        <template v-if="view">
          <h2 class="title">{{ view.title }}</h2>
          <div class="subline">
            <span class="subtitle small muted">{{ view.subtitle }}</span>
            <span v-for="(b, i) in view.badges" :key="i" class="badge" :class="TONE_CLASS[b.tone]">{{ b.text }}</span>
          </div>
          <div v-if="view.headline" class="headline"><Tex :tex="view.headline" display /></div>
          <nav class="toc" :aria-label="UI.sections">
            <button v-for="s in view.sections" :key="s.id" class="chip" @click="jump(s.id)">{{ s.title }}</button>
          </nav>
        </template>
      </header>
      <div ref="scroller" class="dscroll">
        <div v-if="!view" class="empty">{{ built.message }}</div>
        <DetailBody v-else :view="view" :large="reading" />
      </div>
    </aside>
  </div>
</template>

<style scoped>
.detail-layer { position: absolute; top: 0; right: 0; bottom: 0; z-index: 60; display: flex; justify-content: flex-end; pointer-events: none; }
.detail-layer.reading { left: 0; justify-content: center; background: rgba(0, 0, 0, 0.18); pointer-events: auto; animation: fade-in 140ms ease; }
:root.fx-glass .detail-layer.reading { -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.detail { pointer-events: auto; position: relative; height: 100%; max-width: calc(100vw - 32px); box-shadow: var(--shadow-pop), inset 0 0 0 0.5px var(--glass-rim); animation: slide-in 180ms var(--ease-out); }
.reading .detail { width: min(920px, calc(100vw - 48px)); height: calc(100% - 16px); margin-top: 8px; animation: pop-in 160ms var(--ease-out); }
.detail { background: var(--pane); }
/* An overlay above other panes: the opaque pop-up glass of menus and dialogs, not the translucent pane glass */
:root.fx-glass .detail { background: color-mix(in srgb, var(--pane) 90%, transparent); -webkit-backdrop-filter: blur(28px) saturate(1.9); backdrop-filter: blur(28px) saturate(1.9); }
.edge { position: absolute; left: 0; top: 0; bottom: 0; width: 6px; cursor: col-resize; z-index: 2; }
.dhead { padding: 8px 14px 6px; border-bottom: 1px solid var(--separator); flex: 0 0 auto; min-width: 0; }
.kind { color: var(--accent); font-weight: 650; letter-spacing: 0.02em; margin-right: 4px; white-space: nowrap; }
.tools { display: flex; align-items: center; gap: 2px; margin: 0 -6px 2px 0; flex-wrap: wrap; }
.title { font-size: calc(17px * var(--zoom)); font-weight: 650; margin: 2px 0 0; line-height: 1.3; overflow-wrap: anywhere; }
.subline { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin-top: 3px; }
.subtitle { overflow-wrap: anywhere; margin-right: 2px; }
.subline .badge { height: auto; min-height: 20px; white-space: normal; }
.headline { margin: 4px 0 0; overflow-x: auto; overflow-y: hidden; }
.headline :deep(.katex-display) { margin: 4px 0; }
.toc { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.chip { border: 0; background: var(--fill); color: var(--text-2); border-radius: var(--radius-pill); padding: 2px 10px; font-size: var(--type-tiny); cursor: pointer; white-space: nowrap; }
.chip:hover { background: var(--fill-strong); color: var(--text); }
.dscroll { flex: 1; min-height: 0; overflow: auto; padding: 10px 14px 18px; }
.reading .dhead, .reading .dscroll { padding-left: 28px; padding-right: 28px; }
.reading .title { font-size: calc(22px * var(--zoom)); }
@keyframes slide-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
</style>
