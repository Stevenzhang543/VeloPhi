<script setup lang="ts">
/**
 * Bars of the formula timeline (26.53, D71) for the visible span of the track. A component of its own (26.55,
 * D97) so the bars are re-rendered only when they or the span change, not with the playhead on every frame.
 */
import { tl } from '../../i18n'
import { fmtNum, unitLabel } from '../settings'
import type { TimelineBar } from '../../formula/panel'
import { CATEGORIES } from '../../formula/panel'
import { shownTime } from '../../units/clock'

const props = defineProps<{ bars: TimelineBar[]; t0: number; span: number }>()
const emit = defineEmits<{ bar: [b: TimelineBar]; zoom: [b: TimelineBar] }>()

const CAT_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]))
function barStyle(b: TimelineBar) {
  const left = ((b.t0 - props.t0) / props.span) * 100
  const width = ((b.t1 - b.t0) / props.span) * 100
  return { left: `${left}%`, width: b.instant ? undefined : `max(3px, ${width}%)`, top: `${b.lane * 11 + 2}px` }
}
const VERDICT_TEXT: Record<TimelineBar['verdict'], string> = { match: '全部一致', deviate: '有偏差', approx: '有近似', none: '无可比较的公式' }
function barTitle(b: TimelineBar) {
  const s = b.entry.situation
  const when = b.instant ? `t = ${fmtNum(shownTime(b.t0), 's', 6)} ${unitLabel('s')}` : `${fmtNum(shownTime(b.t0), 's', 5)}–${fmtNum(shownTime(b.t1), 's', 5)} ${unitLabel('s')}`
  return tl('{0}（{1}）{2}：{3} 条公式，{4}{5}。点击跳转，双击放大', [s.title, tl(CAT_LABEL[b.category]), when, b.formulas, tl(VERDICT_TEXT[b.verdict]), b.pinned ? tl('，{0} 条收藏', [b.pinned]) : ''])
}
</script>

<template>
  <button
    v-for="b in bars" :key="b.entry.situation.key" role="listitem" class="fbar" :class="[`v-${b.verdict}`, `c-${b.category}`, { instant: b.instant }]" :style="barStyle(b)"
    :title="barTitle(b)" @click="emit('bar', b)" @dblclick.prevent="emit('zoom', b)"
  ><span v-if="b.pinned" class="pin">★</span></button>
</template>

<style scoped>
.fbar { position: absolute; height: 9px; border: 0; padding: 0; border-radius: 3px; cursor: pointer; background: var(--cat, var(--fill-strong)); box-shadow: inset 0 -3px 0 var(--ver, transparent); min-width: 3px; }
.fbar:hover { filter: brightness(1.15); z-index: 1; outline: 1.5px solid var(--accent); }
.fbar.instant { width: 4px; margin-left: -2px; border-radius: 2px; }
.fbar .pin { position: absolute; right: 1px; top: -4px; font-size: 9px; line-height: 1; color: var(--warning); pointer-events: none; }
.fbar.v-match { --ver: var(--success); }
.fbar.v-deviate { --ver: var(--danger); }
.fbar.v-approx { --ver: var(--warning); }
.fbar.c-kinematics { --cat: color-mix(in srgb, #5b8def 38%, transparent); }
.fbar.c-dynamics { --cat: color-mix(in srgb, #8e6cd8 38%, transparent); }
.fbar.c-energy { --cat: color-mix(in srgb, #e0913a 40%, transparent); }
.fbar.c-momentum { --cat: color-mix(in srgb, #2fa59a 40%, transparent); }
.fbar.c-rotation { --cat: color-mix(in srgb, #d2649a 38%, transparent); }
.fbar.c-collision { --cat: color-mix(in srgb, #7c8597 45%, transparent); }
.fbar.c-fields { --cat: color-mix(in srgb, #4aa3c7 40%, transparent); }
.fbar.instant.c-collision, .fbar.instant { --cat: color-mix(in srgb, #7c8597 75%, transparent); }
.fbar.v-none { background: transparent; box-shadow: inset 0 0 0 1px var(--fill-strong); }
</style>
