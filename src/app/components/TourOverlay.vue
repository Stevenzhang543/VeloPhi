<script setup lang="ts">
/**
 * The 60-second tour (26.58, D138): five steps, each lighting up one part of the studio with a short note — tools,
 * canvas, timeline, analysis panel, run button. The interface itself shows how to start (PhET's implicit
 * scaffolding: little text, then hands on). ←/→ or the buttons move, Escape ends it.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tl } from '../../i18n'
import { state } from '../store'

interface Step { sel: string; title: string; text: string }
const STEPS = computed<Step[]>(() => [
  { sel: '.page-studio .left', title: tl('1 / 5 · 工具'), text: tl('选一个工具，在画布上单击放置物体（物块、小球、斜面、绳、弹簧……），拖拽可拉出大小。') },
  { sel: '.page-studio .view', title: tl('2 / 5 · 画布'), text: tl('拖动物体改位置，滚轮缩放，右键平移。运行后画面上的箭头、轨迹与读数都来自求解器。') },
  { sel: '.page-studio .pane.bottom', title: tl('3 / 5 · 时间轴与曲线'), text: tl('空格播放 / 暂停，拖动时间轴到任意时刻；菱形是碰撞、开始滑动等事件，点一下看详情。下面是曲线。') },
  { sel: '.page-studio .pane.right', title: tl('4 / 5 · 分析'), text: tl('“公式”把适用的公式代入数值并与仿真并排比较；“监视”读出任意物体此刻的物理量；“任务”可以粘贴一道题。') },
  { sel: '.topbar .run', title: tl('5 / 5 · 运行'), text: tl('修改后自动重新计算；旁边的标记说明这次用的是精确求解器还是实时多体求解器。') }
])
const step = computed(() => (state.tourStep !== null ? STEPS.value[state.tourStep] : null))
const rect = ref<{ x: number; y: number; w: number; h: number } | null>(null)

function measure() {
  if (!step.value) { rect.value = null; return }
  const el = document.querySelector(step.value.sel) as HTMLElement | null
  if (!el) { rect.value = null; return }
  const r = el.getBoundingClientRect()
  rect.value = { x: r.left, y: r.top, w: r.width, h: r.height }
}
watch(() => state.tourStep, () => nextTick(measure), { immediate: true })
const end = () => { state.tourStep = null }
const next = () => { if (state.tourStep === null) return; if (state.tourStep + 1 >= STEPS.value.length) end(); else state.tourStep++ }
const prev = () => { if (state.tourStep !== null && state.tourStep > 0) state.tourStep-- }
function onKey(e: KeyboardEvent) {
  if (state.tourStep === null) return
  // 26.58 (D146): the keys that drive the tour are not also playback shortcuts (→ stepped a frame behind the tour)
  const own = () => { e.preventDefault(); e.stopImmediatePropagation() }
  if (e.key === 'Escape') { own(); end() } else if (e.key === 'ArrowRight' || e.key === 'Enter') { own(); next() } else if (e.key === 'ArrowLeft') { own(); prev() }
}
onMounted(() => { window.addEventListener('keydown', onKey, true); window.addEventListener('resize', measure) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', measure) })

/** Note box beside the lit area: below it when there is room, else above, else inside. */
const noteStyle = computed(() => {
  const r = rect.value
  const vw = window.innerWidth, vh = window.innerHeight
  if (!r) return { left: `${vw / 2 - 170}px`, top: `${vh / 2 - 60}px` }
  const w = 340
  const left = Math.max(12, Math.min(vw - w - 12, r.x + r.w / 2 - w / 2))
  if (r.y + r.h + 150 < vh) return { left: `${left}px`, top: `${r.y + r.h + 12}px` }
  if (r.y > 160) return { left: `${left}px`, top: `${r.y - 140}px` }
  return { left: `${left}px`, top: `${r.y + 16}px` }
})
</script>

<template>
  <div v-if="step" class="tour" role="dialog" aria-modal="true" :aria-label="tl('导览')">
    <div class="hole" :style="rect ? { left: `${rect.x - 4}px`, top: `${rect.y - 4}px`, width: `${rect.w + 8}px`, height: `${rect.h + 8}px` } : { display: 'none' }" />
    <div class="note" :style="noteStyle">
      <b>{{ step.title }}</b>
      <p>{{ step.text }}</p>
      <div class="btns">
        <button class="btn small ghost" @click="end">{{ tl('结束导览') }}</button>
        <span class="spacer" />
        <button class="btn small" :disabled="state.tourStep === 0" @click="prev">{{ tl('上一步') }}</button>
        <button class="btn small primary" autofocus @click="next">{{ state.tourStep! + 1 >= STEPS.length ? tl('完成') : tl('下一步') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tour { position: fixed; inset: 0; z-index: 900; }
.hole { position: fixed; border-radius: 10px; box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55); outline: 2px solid var(--accent); transition: left var(--dur-enter) var(--ease-out), top var(--dur-enter) var(--ease-out), width var(--dur-enter) var(--ease-out), height var(--dur-enter) var(--ease-out); pointer-events: none; }
.note { position: fixed; width: 340px; background: var(--pane, var(--panel)); color: var(--text); border-radius: 12px; box-shadow: var(--shadow); padding: 12px 14px; line-height: 1.55; }
.note b { display: block; margin-bottom: 4px; }
.note p { margin: 0 0 10px; color: var(--text-2); }
.btns { display: flex; gap: 6px; align-items: center; }
.spacer { flex: 1; }
@media (prefers-reduced-motion: reduce) { .hole { transition: none; } }
</style>
