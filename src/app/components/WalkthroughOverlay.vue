<script setup lang="ts">
/**
 * The walkthrough over the real interface (26.64, D249, D251; it replaces the welcome dialog and the six-slide tour of
 * 26.58–26.63). The control of the current step is ringed; the rest of the window is dimmed **but still works** — the
 * dimming and the ring take no pointer events — and a note beside the ring says what to do. The walk moves on when the
 * user has done it (onboarding/engine.ts); the note has no "next" button except on the steps that are a choice
 * (segment 0) or a look (the list of changes).
 *
 * The note: the segment, the step's number, about how long the segment takes (on its first step), the instruction,
 * 跳过此步, 跳过此段 (the manual's 跳过这一步 within the four characters of D243) and 稍后继续 (the cross). At the end of a segment it names the next one.
 *
 * Reduced motion (`fx-calm`, or the system setting): the ring and the note jump to their place and the ring does not
 * pulse. Phones: the note is a sheet at the bottom, or at the top when the ring is in the lower half.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { tl } from '../../i18n'
import { settings } from '../settings'
import type { ThemeMode } from '../settings'
import { phone } from '../layout'
import { TIERS, restoreTier } from '../material'
import { tierLabel } from '../appearance'
import { shown } from '../onboarding/dom'
import { applyRole, closeWalk, continueWalk, nextStep, pageName, ringSelector, skipSegment, skipStep, stepText, upNext, walk, walkTitle } from '../onboarding/engine'
import { SEGMENTS } from '../onboarding/state'
import type { Role } from '../onboarding/state'
import { segmentList } from '../onboarding/steps'
import Icon from './Icon.vue'

interface Box { x: number; y: number; w: number; h: number }
const box = ref<Box | null>(null)
const view = ref({ w: 0, h: 0 })
const note = ref<HTMLElement | null>(null)
const noteSize = ref({ w: 340, h: 150 })
const PAD = 5

let raf = 0, last = 0
function measure(t: number) {
  raf = requestAnimationFrame(measure)
  if (t - last < 90) return
  last = t
  view.value = { w: window.innerWidth, h: window.innerHeight }
  const el = walk.id && !walk.busy ? shown(ringSelector()) : null
  if (!el) { if (box.value) box.value = null } else {
    const r = el.getBoundingClientRect()
    const b = { x: Math.max(0, r.left - PAD), y: Math.max(0, r.top - PAD), w: Math.min(view.value.w, r.right + PAD) - Math.max(0, r.left - PAD), h: Math.min(view.value.h, r.bottom + PAD) - Math.max(0, r.top - PAD) }
    const o = box.value
    if (!o || Math.abs(o.x - b.x) + Math.abs(o.y - b.y) + Math.abs(o.w - b.w) + Math.abs(o.h - b.h) > 1) box.value = b
  }
  const n = note.value
  if (n && (Math.abs(n.offsetWidth - noteSize.value.w) > 1 || Math.abs(n.offsetHeight - noteSize.value.h) > 1)) noteSize.value = { w: n.offsetWidth, h: n.offsetHeight }
}
onMounted(() => { raf = requestAnimationFrame(measure) })
onBeforeUnmount(() => cancelAnimationFrame(raf))

const form = computed(() => (walk.phase === 'step' ? walk.step?.form ?? null : null))
/** The ring is drawn for a deed or a look, not for a choice and not at the end of a segment. */
const ring = computed(() => (walk.phase !== 'done' && !form.value ? box.value : null))
const px = (n: number) => `${Math.round(n)}px`
/** The four dimmed bands around the ring (none without a ring: the whole window stays as it is). */
const bands = computed(() => {
  const b = ring.value
  if (!b) return []
  const { w, h } = view.value
  return [
    { left: '0', top: '0', width: px(w), height: px(b.y) },
    { left: '0', top: px(b.y + b.h), width: px(w), height: px(Math.max(0, h - b.y - b.h)) },
    { left: '0', top: px(b.y), width: px(b.x), height: px(b.h) },
    { left: px(b.x + b.w), top: px(b.y), width: px(Math.max(0, w - b.x - b.w)), height: px(b.h) }
  ]
})

/** The note beside the ring: below, above, right or left of it — wherever it fits — else in the corner. */
const place = computed(() => {
  const b = ring.value
  const { w, h } = view.value
  const n = noteSize.value
  const gap = 12, m = 12
  if (phone.value) return b && b.y + b.h / 2 > h / 2 ? { cls: 'top', style: {} } : { cls: 'bottom', style: {} }
  if (!b) return { cls: 'center', style: { left: px(Math.max(m, (w - n.w) / 2)), top: px(Math.max(m, (h - n.h) / 2)) } }
  // a whole stage is ringed: the note sits inside it, in its lower right corner, and covers no bar
  if (b.w * b.h > 0.3 * w * h) return { cls: '', style: { left: px(b.x + b.w - n.w - 2 * m), top: px(b.y + b.h - n.h - 2 * m) } }
  const cx = Math.min(w - n.w - m, Math.max(m, b.x + b.w / 2 - n.w / 2))
  // beside a tall target (an inspector column) the note keeps to the bottom, clear of the middle of the stage
  const cy = Math.min(h - n.h - m, Math.max(m, b.h > 2 * n.h ? b.y + b.h - n.h - m : b.y + b.h / 2 - n.h / 2))
  // a control at the window's left edge (the rail): beside it, so the note does not cover the rail's other entries
  const top = Math.min(h - n.h - m, Math.max(m, b.y))
  if (b.h <= 2 * n.h && b.x < 24 && b.x + b.w + gap + n.w + m <= w) return { cls: '', style: { left: px(b.x + b.w + gap), top: px(top) } }
  if (b.y + b.h + gap + n.h + m <= h) return { cls: '', style: { left: px(cx), top: px(b.y + b.h + gap) } }
  if (b.y - gap - n.h >= m) return { cls: '', style: { left: px(cx), top: px(b.y - gap - n.h) } }
  if (b.x + b.w + gap + n.w + m <= w) return { cls: '', style: { left: px(b.x + b.w + gap), top: px(cy) } }
  if (b.x - gap - n.w >= m) return { cls: '', style: { left: px(b.x - gap - n.w), top: px(cy) } }
  // the ring fills the window (a whole page): the note sits in its lower right corner
  return { cls: '', style: { left: px(w - n.w - 2 * m), top: px(h - n.h - 2 * m - 40) } }
})

const text = computed(() => (walk.elsewhere && walk.step?.page ? tl('先到“{0}”面板。', [pageName(walk.step.page)]) : stepText()))
const next = computed(() => { const id = walk.phase === 'done' ? upNext() : null; return id ? segmentList().find(s => s.id === id) ?? null : null })
const isSegment = computed(() => !!walk.id && (SEGMENTS as readonly string[]).includes(walk.id))
const lastOfSegment = computed(() => walk.index + 1 >= walk.total)

// ---- segment 0: the choices ----
const LANGS: Array<{ id: 'auto' | 'zh' | 'en' | 'de'; label: string }> = [{ id: 'auto', label: tl('跟随系统') }, { id: 'zh', label: tl('\u7b80\u4f53\u4e2d\u6587') }, { id: 'en', label: 'English' }, { id: 'de', label: 'Deutsch' }]
const THEMES: Array<{ id: ThemeMode; label: string }> = [{ id: 'system', label: tl('跟随系统') }, { id: 'light', label: tl('浅色') }, { id: 'dark', label: tl('深色') }]
const SIZES = [{ v: 0.9, label: '90%' }, { v: 1, label: '100%' }, { v: 1.15, label: '115%' }, { v: 1.3, label: '130%' }]
const ROLES: Array<{ id: Role; label: string; line: string; icon: string }> = [
  { id: 'learn', label: tl('学'), line: tl('从首页开始，公式卡片从简'), icon: 'book' },
  { id: 'teach', label: tl('教'), line: tl('“更多”先显示教学工具'), icon: 'graduation' },
  { id: 'research', label: tl('做研究'), line: tl('直接进“运动”，公式卡片从详'), icon: 'converge' }
]
function pickRole(r: Role) { applyRole(r); nextStep() }
function pickTier(t: typeof TIERS[number]) { settings.effects.tier = t; restoreTier() }
</script>

<template>
  <div v-if="walk.id" class="walk" :class="{ phone }" data-ui="walk" :data-walk="walk.id" :data-step="walk.step?.id ?? ''" :data-phase="walk.phase" :data-index="walk.index">
    <i v-for="(b, i) in bands" :key="i" class="dim" :style="b" aria-hidden="true" />
    <i v-if="ring" class="ring" :class="{ ok: walk.phase === 'ok' }" :style="{ left: px(ring.x), top: px(ring.y), width: px(ring.w), height: px(ring.h) }" aria-hidden="true" data-ui="walk-ring" />
    <section ref="note" class="note" :class="[place.cls, { setup: !!form }]" :style="place.style" role="region" :aria-label="tl('入门')" data-ui="walk-note">
      <header class="head">
        <b class="seg">{{ walkTitle() }}</b>
        <span v-if="walk.phase !== 'done' && !walk.single" class="count num" data-ui="walk-count">{{ walk.index + 1 }}/{{ walk.total }}</span>
        <span v-if="walk.phase !== 'done' && walk.index === 0 && isSegment" class="mins">{{ tl('约 {0} 分钟', [walk.minutes]) }}</span>
        <span class="spacer" />
        <button type="button" class="btn icon ghost small" data-ui="walk-close" :title="walk.phase === 'done' || walk.single ? tl('关闭') : tl('稍后继续')" :aria-label="walk.phase === 'done' || walk.single ? tl('关闭') : tl('稍后继续')" @click="closeWalk"><Icon name="close" :size="15" /></button>
      </header>

      <template v-if="walk.phase === 'done'">
        <p class="text" aria-live="polite" data-ui="walk-text"><Icon name="check" :size="16" class="tick" />{{ next ? tl('这一段走完了。下一段：{0}，约 {1} 分钟。', [next.title, next.minutes]) : tl('五段都走完了。“帮助 › 入门”可以重走任意一段。') }}</p>
        <footer class="foot">
          <span class="spacer" />
          <button v-if="next" type="button" class="btn small" data-ui="walk-stop" @click="closeWalk">{{ tl('到此为止') }}</button>
          <button v-if="next" type="button" class="btn small tonal" data-ui="walk-continue" @click="continueWalk">{{ tl('继续') }}</button>
          <button v-else type="button" class="btn small tonal" data-ui="walk-finish" @click="closeWalk">{{ tl('完成') }}</button>
        </footer>
      </template>
      <template v-else>
        <p class="text" aria-live="polite" data-ui="walk-text"><Icon v-if="walk.phase === 'ok'" name="check" :size="16" class="tick" />{{ walk.busy ? tl('正在准备…') : text }}</p>

        <div v-if="form === 'language'" class="choice segmented" role="radiogroup" :aria-label="tl('语言')">
          <button v-for="l in LANGS" :key="l.id" type="button" role="radio" :aria-checked="settings.language === l.id" :class="{ on: settings.language === l.id }" :data-ui="`walk-lang-${l.id}`" @click="settings.language = l.id">{{ l.label }}</button>
        </div>
        <template v-else-if="form === 'appearance'">
          <div class="choice segmented" role="radiogroup" :aria-label="tl('外观')">
            <button v-for="t in THEMES" :key="t.id" type="button" role="radio" :aria-checked="settings.themeMode === t.id" :class="{ on: settings.themeMode === t.id }" :data-ui="`walk-theme-${t.id}`" @click="settings.themeMode = t.id">{{ t.label }}</button>
          </div>
          <div class="choice segmented" role="radiogroup" :aria-label="tl('浮层材质')">
            <button v-for="t in TIERS" :key="t" type="button" role="radio" :aria-checked="settings.effects.tier === t" :class="{ on: settings.effects.tier === t }" :data-ui="`walk-tier-${t}`" @click="pickTier(t)">{{ tierLabel(t) }}</button>
          </div>
        </template>
        <div v-else-if="form === 'size'" class="choice segmented" role="radiogroup" :aria-label="tl('界面大小')">
          <button v-for="s in SIZES" :key="s.v" type="button" role="radio" class="num" :aria-checked="settings.uiScale === s.v" :class="{ on: settings.uiScale === s.v }" :data-ui="`walk-size-${Math.round(s.v * 100)}`" @click="settings.uiScale = s.v">{{ s.label }}</button>
        </div>
        <div v-else-if="form === 'role'" class="roles">
          <button v-for="r in ROLES" :key="r.id" type="button" class="role" :class="{ on: settings.ui.role === r.id }" :data-ui="`walk-role-${r.id}`" @click="pickRole(r.id)"><Icon :name="r.icon" :size="20" /><b>{{ r.label }}</b><span>{{ r.line }}</span></button>
        </div>

        <footer class="foot">
          <button v-if="!walk.single && !(form === 'role')" type="button" class="btn small ghost" data-ui="walk-skip" :disabled="walk.busy || walk.phase === 'ok'" @click="skipStep">{{ tl('跳过此步') }}</button>
          <button v-if="isSegment && !walk.single" type="button" class="btn small ghost" data-ui="walk-skip-segment" :disabled="walk.busy" @click="skipSegment">{{ tl('跳过此段') }}</button>
          <span class="spacer" />
          <button v-if="walk.single" type="button" class="btn small tonal" data-ui="walk-next" @click="closeWalk">{{ tl('知道了') }}</button>
          <button v-else-if="(form && form !== 'role') || walk.step?.look" type="button" class="btn small tonal" data-ui="walk-next" @click="nextStep">{{ walk.step?.look && lastOfSegment ? tl('完成') : tl('下一步') }}</button>
        </footer>
      </template>
    </section>
  </div>
</template>

<style scoped>
/* Above the pages and their menus, below nothing the user needs: the layer itself takes no pointer events */
.walk { position: fixed; inset: 0; z-index: 9300; pointer-events: none; }
.dim { position: fixed; background: var(--scrim); opacity: 0.55; transition: left var(--dur-enter) var(--ease-out), top var(--dur-enter) var(--ease-out), width var(--dur-enter) var(--ease-out), height var(--dur-enter) var(--ease-out); }
.ring { position: fixed; border-radius: var(--radius-panel); box-shadow: 0 0 0 2px var(--accent), 0 0 0 6px var(--ring); transition: left var(--dur-enter) var(--ease-out), top var(--dur-enter) var(--ease-out), width var(--dur-enter) var(--ease-out), height var(--dur-enter) var(--ease-out), box-shadow var(--dur-fast) ease; animation: walk-pulse 1.8s var(--ease-out) infinite; }
.ring.ok { box-shadow: 0 0 0 2px var(--success), 0 0 0 6px var(--success-soft); animation: none; }
@keyframes walk-pulse { 0%, 100% { box-shadow: 0 0 0 2px var(--accent), 0 0 0 4px var(--ring); } 50% { box-shadow: 0 0 0 2px var(--accent), 0 0 0 9px var(--ring); } }
.note { position: fixed; pointer-events: auto; width: min(calc(340px * var(--zoom)), calc(100vw - 24px)); padding: var(--space-3) var(--space-3) var(--space-2); border-radius: var(--radius-float); background: var(--pane); color: var(--text); box-shadow: var(--elev-3); display: flex; flex-direction: column; gap: var(--space-2); transition: left var(--dur-enter) var(--ease-out), top var(--dur-enter) var(--ease-out); }
.note.setup { width: min(calc(420px * var(--zoom)), calc(100vw - 24px)); }
.head { display: flex; align-items: center; gap: var(--space-2); min-height: var(--control-sm); }
.seg { font-size: var(--type-subtitle); font-weight: var(--weight-title); line-height: var(--line-tight); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.count, .mins { font-size: var(--type-small); color: var(--text-2); white-space: nowrap; }
.spacer { flex: 1; }
.text { margin: 0; font-size: var(--type-body); line-height: var(--line-body); color: var(--text); overflow-wrap: break-word; }
.tick { color: var(--success); vertical-align: -3px; margin-right: var(--space-1); }
.foot { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-1); margin: 0 calc(-1 * var(--space-1)); }
.choice { display: flex; align-self: flex-start; max-width: 100%; }
.choice button { flex: 1 1 auto; min-width: 0; }
.roles { display: grid; gap: var(--space-1); }
.role { display: grid; grid-template-columns: 24px auto minmax(0, 1fr); align-items: center; gap: var(--space-2); min-height: var(--control-lg); padding: var(--space-1) var(--space-3); border: 0; border-radius: var(--radius-control); background: var(--fill); color: var(--text); font: inherit; text-align: left; cursor: pointer; transition: background var(--dur-fast) ease; }
.role:hover { background: var(--fill-strong); }
.role.on { background: var(--accent-soft); color: var(--accent); }
.role b { font-weight: var(--weight-strong); white-space: nowrap; }
.role span { font-size: var(--type-small); color: var(--text-2); min-width: 0; }
/* Phones: the note is a sheet across the bottom, or across the top when the ring is low */
.phone .note { left: var(--space-2); right: var(--space-2); width: auto; transition: none; }
.phone .note.bottom { bottom: calc(var(--space-2) + env(safe-area-inset-bottom, 0px)); }
.phone .note.top { top: calc(var(--space-2) + env(safe-area-inset-top, 0px)); }
.phone .foot .btn { min-height: var(--control-lg); }
@media (prefers-reduced-motion: reduce) { .ring { animation: none; } .ring, .dim, .note { transition: none; } }
</style>
