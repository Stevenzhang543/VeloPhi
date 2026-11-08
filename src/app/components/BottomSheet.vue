<script setup lang="ts">
/**
 * Bottom sheet of the phone layout (26.60, D206): stops at a third, two thirds or the full height; drag the handle (or
 * the title row) to change it, drag down past the lowest stop to close. The content scrolls inside.
 */
import { computed, ref } from 'vue'
import { tl } from '../../i18n'
import { SHEET_STOPS, shell } from '../layout'
import Icon from './Icon.vue'

const props = defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
const STOPS = SHEET_STOPS
const drag = ref<{ y0: number; h0: number; h: number } | null>(null)
const sheet = ref<HTMLElement | null>(null)
/** Room the sheet may use (between the top bar and the tab bar). */
const room = () => Math.max(200, (sheet.value?.parentElement?.clientHeight ?? window.innerHeight))
const height = computed(() => (drag.value ? `${drag.value.h}px` : `${STOPS[shell.sheetSize] * 100}%`))

function down(e: PointerEvent) {
  const el = sheet.value
  if (!el) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  drag.value = { y0: e.clientY, h0: el.getBoundingClientRect().height, h: el.getBoundingClientRect().height }
}
function move(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  d.h = Math.max(60, Math.min(room(), d.h0 - (e.clientY - d.y0)))
}
function up() {
  const d = drag.value
  if (!d) return
  drag.value = null
  const f = d.h / room()
  if (f < STOPS[1] * 0.6) { emit('close'); return }
  let best: 1 | 2 | 3 = 1
  for (const k of [1, 2, 3] as const) if (Math.abs(STOPS[k] - f) < Math.abs(STOPS[best] - f)) best = k
  shell.sheetSize = best
}
function cycle() { shell.sheetSize = shell.sheetSize === 3 ? 1 : ((shell.sheetSize + 1) as 2 | 3) }
void props
</script>

<template>
  <section ref="sheet" class="sheet" :class="{ dragging: !!drag }" :style="{ height }" role="dialog" :aria-label="title">
    <div class="grab" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
      <span class="handle" aria-hidden="true" />
      <div class="srow">
        <b>{{ title }}</b>
        <span class="spacer" />
        <slot name="actions" />
        <button type="button" class="btn icon ghost" :title="shell.sheetSize === 3 ? tl('缩小') : tl('放大')" :aria-label="shell.sheetSize === 3 ? tl('缩小') : tl('放大')" @pointerdown.stop @click="cycle"><Icon :name="shell.sheetSize === 3 ? 'expandDown' : 'expandUp'" :size="16" /></button>
        <button type="button" class="btn icon ghost" :title="tl('关闭')" :aria-label="tl('关闭')" @pointerdown.stop @click="emit('close')"><Icon name="close" :size="16" /></button>
      </div>
    </div>
    <div class="sbody"><slot /></div>
  </section>
</template>

<style scoped>
.sheet { position: absolute; left: 0; right: 0; bottom: 0; z-index: 30; display: flex; flex-direction: column; min-height: 0; background: var(--pane); border-radius: 18px 18px 0 0; box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.22), 0 0 0 0.5px var(--separator); animation: sheet-in 220ms var(--ease-out); transition: height 200ms var(--ease-out); }
.sheet.dragging { transition: none; }
@keyframes sheet-in { from { transform: translateY(40%); opacity: 0.4; } to { transform: none; opacity: 1; } }
.grab { flex: 0 0 auto; touch-action: none; cursor: grab; padding: 6px 8px 2px 14px; }
.handle { display: block; width: 40px; height: 5px; border-radius: 3px; background: var(--fill-strong); margin: 0 auto 4px; }
.srow { display: flex; align-items: center; gap: 4px; min-height: 40px; }
.srow b { font-size: var(--type-body); }
.srow .btn { min-width: 40px; min-height: 40px; }
.sbody { flex: 1; min-height: 0; overflow: auto; position: relative; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
@media (prefers-reduced-motion: reduce) { .sheet { animation: none; transition: none; } }
</style>
