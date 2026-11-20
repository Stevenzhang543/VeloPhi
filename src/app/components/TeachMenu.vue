<script setup lang="ts">
/**
 * The "教学" menu of an experiment panel (26.64, D240). The classroom is a way of using the app, not a place in it:
 * its page became a section of the library, and what a teacher needs while standing in front of an experiment — the
 * class tally and the projection switch — is in this menu on the bar of every experiment panel (运动, 物理实验, 化学实验).
 *
 * Use:
 *   <TeachMenu />                                   the button and the three common items
 *   <TeachMenu><button role="menuitem" …>…</button></TeachMenu>
 *                                                   the panel's own teaching tools first (default slot), then the
 *                                                   common items; a click on any `role="menuitem"` closes the menu
 * Props:
 *   align        'right' (default) or 'left': the edge of the button the menu lines up with
 *   label        false: icon only at every width (default: the label gives way under 1360 px like the bar's others)
 *   inline       true: only the common items, as rows for a menu that is already open (运动 keeps them in the 教学
 *                group of its 更多 panel, D245); no button, no menu of its own
 *   tallyAction  what "班级统计" does on this panel. The tally card counts votes for the scene of the 运动 panel and
 *                plays it at "lock and run"; the default therefore shows that panel and opens the card. A panel with
 *                its own run can pass its own handler.
 * The button carries `data-ui="teach"`, the tally item `data-ui="tally"` (the names of 26.63: scripts and Copilot's
 * pointer rely on them).
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { tl } from '../../i18n'
import { state } from '../store'
import { settings } from '../settings'
import { tally } from '../tally'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{ align?: 'left' | 'right'; label?: boolean; tallyAction?: () => void; inline?: boolean }>(), { align: 'right', label: true, tallyAction: undefined, inline: false })

const open = ref(false)
const root = ref<HTMLElement | null>(null)
function outside(e: PointerEvent) { if (open.value && !root.value?.contains(e.target as Node)) open.value = false }
function esc(e: KeyboardEvent) { if (e.key === 'Escape' && open.value) { open.value = false; root.value?.querySelector<HTMLElement>('[data-ui=teach]')?.focus() } }
onMounted(() => { window.addEventListener('pointerdown', outside); window.addEventListener('keydown', esc) })
onBeforeUnmount(() => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', esc) })

/** Any plain menu item closes the menu (the projection switch stays open: it is a setting being tried). */
function picked(e: MouseEvent) { if ((e.target as Element).closest('[role="menuitem"]')) open.value = false }

function openTally() {
  if (props.tallyAction) { props.tallyAction(); return }
  state.page = 'studio'
  tally.open = true
}
function classroom() { state.librarySection = 'classroom'; state.page = 'library' }
</script>

<template>
  <div v-if="props.inline" class="menu-col">
    <button type="button" role="menuitem" data-ui="tally" @click="openTally"><Icon name="tally" />{{ tl('先猜后看：班级预测统计…') }}</button>
    <label class="menu-check" role="menuitemcheckbox" :aria-checked="settings.projector"><input v-model="settings.projector" type="checkbox" class="switch" data-ui="projector" /><span>{{ tl('课堂投影') }}</span></label>
    <button type="button" role="menuitem" data-ui="teach-classroom" @click="classroom"><Icon name="classroom" />{{ tl('资源库的课堂分区') }}</button>
  </div>
  <div v-else ref="root" class="teach-anchor">
    <button type="button" class="btn ghost teach" data-ui="teach" :class="{ active: open }" aria-haspopup="menu" :aria-expanded="open" :title="tl('教学：班级统计、课堂投影')" @click="open = !open"><Icon name="graduation" /><span v-if="props.label" class="lbl">{{ tl('教学') }}</span></button>
    <div v-if="open" class="menu" :class="props.align" role="menu" @click="picked">
      <slot />
      <div v-if="$slots.default" class="sep" />
      <button type="button" role="menuitem" data-ui="tally" @click="openTally"><Icon name="tally" />{{ tl('先猜后看：班级预测统计…') }}</button>
      <label class="menu-check" role="menuitemcheckbox" :aria-checked="settings.projector"><input v-model="settings.projector" type="checkbox" class="switch" data-ui="projector" /><span>{{ tl('课堂投影') }}</span></label>
      <div class="sep" />
      <button type="button" role="menuitem" data-ui="teach-classroom" @click="classroom"><Icon name="classroom" />{{ tl('资源库的课堂分区') }}</button>
    </div>
  </div>
</template>

<style scoped>
.teach-anchor { position: relative; flex: 0 0 auto; }
.teach { gap: 5px; padding: 0 9px; }
.menu { top: calc(100% + 6px); left: 0; }
.menu.right { left: auto; right: 0; }
.menu-check { justify-content: flex-start; }
.menu-col { display: flex; flex-direction: column; gap: 1px; }
.menu-col > label { display: flex; align-items: center; gap: 8px; min-height: var(--menu-row); padding: 0 10px; border-radius: var(--radius-control); cursor: pointer; font-size: var(--type-body); }
.menu-check:hover { background: var(--hover) !important; color: inherit !important; }
@media (max-width: 1360px) { .lbl { display: none; } }
</style>
