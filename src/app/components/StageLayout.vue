<script setup lang="ts">
/**
 * The skeleton of an experiment panel (26.64, D242): **a stage, one bar, one drawer**. 运动, 物理实验 and 化学实验 use
 * the same skeleton, so whoever has learnt one panel knows the other two.
 *
 *   ┌────────────────────────────────────────────┬───────────────┐
 *   │                                            │ tabs          │
 *   │ [catalogue ▾] [bar …]      [run] [AI] [⋯]  │               │
 *   │                                            │  inspector    │
 *   │                  stage                     │  (drawer)     │
 *   │                                            │               │
 *   └────────────────────────────────────────────┴───────────────┘
 *
 * - **Stage** (default slot): the canvas or the experiment itself; it takes everything the other two leave.
 * - **Bar**: one floating bar over the stage with the panel's most used operations — at most 7 controls in all
 *   (D243; a development build warns when there are more). Its first button opens the catalogue; its right end is
 *   fixed: run / time (slot `run`), AI, more (slot `more`).
 * - **Drawer**: one inspector with tabs, at the right; a bottom sheet on phones. Closed, it leaves the stage alone.
 * - The **catalogue** (templates, the list of experiments, the reagent shelf) is not a permanent column: it is a
 *   popover opened from the bar's first button, and it closes when something has been chosen.
 *
 * Props
 *   panel            'motion' | 'physics' | 'chem' — the identity colour of empty-state art (26.65, D290: the 2 px accent
 *                    line along the stage's top edge is gone — it read as one more bar; the rail's item carries the colour)
 *   catalogue        { label, icon? } of the bar's first button; omit it for a panel without a catalogue
 *   catalogueOpen    v-model:catalogue-open — the popover
 *   tabs             [{ id, label, icon? }] of the inspector; an empty list means no inspector and no switch for it
 *   tab              v-model:tab — the tab shown
 *   inspector        v-model:inspector — the drawer is open
 *   ai               show the AI button (default false); the click is the event `ai`
 *   loading          the stage is not ready: a loading trace is shown over it (and `aria-busy` is set)
 * Slots
 *   default                  the stage
 *   catalogue="{ close }"    the catalogue's content; call `close()` after a choice
 *   bar                      the panel's own controls, after the catalogue button (keep the total at 7 or fewer)
 *   run                      the run / time control (first of the fixed right end)
 *   more="{ close }"         items of the 更多 menu (`role="menuitem"`; a click on one closes the menu)
 *   inspector="{ tab }"      the content of the tab shown
 * Events
 *   ai                       the AI button was pressed
 *
 * Materials (D255): the bar floats over the stage and is glass; the popovers that open from it are solid (glass never
 * contains glass); the inspector is content and solid. Keys: Escape closes the popover or menu that is open and gives
 * the focus back to its button; ← → move between the inspector's tabs.
 */
import { computed, onBeforeUnmount, onMounted, onUpdated, ref } from 'vue'
import { tl } from '../../i18n'
import { phone } from '../layout'
import type { PanelTone } from '../panels'
import Icon from './Icon.vue'
import ScopeTrace from './decor/ScopeTrace.vue'

export interface StageTab { id: string; label: string; icon?: string }

const props = withDefaults(defineProps<{
  panel: Extract<PanelTone, 'motion' | 'physics' | 'chem'>
  catalogue?: { label: string; icon?: string } | null
  catalogueOpen?: boolean
  tabs?: StageTab[]
  tab?: string
  inspector?: boolean
  ai?: boolean
  loading?: boolean
}>(), { catalogue: null, catalogueOpen: false, tabs: () => [], tab: '', inspector: false, ai: false, loading: false })

const emit = defineEmits<{
  (e: 'update:catalogueOpen', v: boolean): void
  (e: 'update:tab', v: string): void
  (e: 'update:inspector', v: boolean): void
  (e: 'ai'): void
}>()

const root = ref<HTMLElement | null>(null)
const bar = ref<HTMLElement | null>(null)
const more = ref(false)
const shownTab = computed(() => (props.tabs.some(t => t.id === props.tab) ? props.tab : props.tabs[0]?.id ?? ''))
const hasInspector = computed(() => props.tabs.length > 0)

const closeCatalogue = () => emit('update:catalogueOpen', false)
function toggleCatalogue() { more.value = false; emit('update:catalogueOpen', !props.catalogueOpen) }
function toggleMore() { closeCatalogue(); more.value = !more.value }
function pickedMore(e: MouseEvent) { if ((e.target as Element).closest('[role="menuitem"]')) more.value = false }

function outside(e: PointerEvent) {
  const t = e.target as Element
  if (props.catalogueOpen && !t.closest('.cat-anchor')) closeCatalogue()
  if (more.value && !t.closest('.more-anchor')) more.value = false
}
function keys(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (props.catalogueOpen) { closeCatalogue(); root.value?.querySelector<HTMLElement>('[data-ui=stage-catalogue]')?.focus(); e.stopPropagation() }
  else if (more.value) { more.value = false; root.value?.querySelector<HTMLElement>('[data-ui=stage-more]')?.focus(); e.stopPropagation() }
}
function tabKeys(e: KeyboardEvent) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  const i = props.tabs.findIndex(t => t.id === shownTab.value)
  const next = props.tabs[(i + (e.key === 'ArrowRight' ? 1 : props.tabs.length - 1)) % props.tabs.length]
  if (!next) return
  e.preventDefault()
  emit('update:tab', next.id)
  requestAnimationFrame(() => root.value?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus())
}

/** D243: a bar holds at most seven controls. Development builds say so when a panel goes over. */
function checkBudget() {
  if (!import.meta.env.DEV || !bar.value) return
  const n = bar.value.querySelectorAll(':scope > .lead > *, :scope > .tail > *').length
  if (n > 7) console.warn(`[StageLayout] the bar of "${props.panel}" holds ${n} controls; the budget is 7 (D243) — move the rest into the "more" menu`)
}
onMounted(() => { window.addEventListener('pointerdown', outside); checkBudget() })
onUpdated(checkBudget)
onBeforeUnmount(() => window.removeEventListener('pointerdown', outside))
</script>

<template>
  <div ref="root" class="stage-layout" :class="[`panel-${props.panel}`, { phone, open: props.inspector && hasInspector }]" @keydown="keys">
    <section class="stage" :aria-busy="props.loading">
      <slot />
      <div v-if="props.loading" class="veil"><ScopeTrace /></div>
      <div ref="bar" class="sbar glass-float" role="toolbar" :aria-label="tl('操作条')">
        <div class="lead">
          <div v-if="props.catalogue" class="cat-anchor">
            <button type="button" class="btn ghost" data-ui="stage-catalogue" :class="{ active: props.catalogueOpen }" aria-haspopup="dialog" :aria-expanded="props.catalogueOpen" @click="toggleCatalogue"><Icon :name="props.catalogue.icon ?? 'template'" /><span class="lbl">{{ props.catalogue.label }}</span><Icon name="chevron" :size="11" /></button>
            <div v-if="props.catalogueOpen" class="popover glass-float enter" role="dialog" :aria-label="props.catalogue.label"><slot name="catalogue" :close="closeCatalogue" /></div>
          </div>
          <slot name="bar" />
        </div>
        <span class="gap" />
        <div class="tail">
          <slot name="run" />
          <button v-if="props.ai" type="button" class="btn ghost ai" data-ui="stage-ai" @click="emit('ai')"><Icon name="chat" /><span class="lbl">AI</span></button>
          <div v-if="$slots.more" class="more-anchor">
            <button type="button" class="btn icon ghost" data-ui="stage-more" :class="{ active: more }" aria-haspopup="menu" :aria-expanded="more" :title="tl('更多')" :aria-label="tl('更多')" @click="toggleMore"><Icon name="more" /></button>
            <div v-if="more" class="menu right" role="menu" @click="pickedMore"><slot name="more" :close="() => { more = false }" /></div>
          </div>
          <button v-if="hasInspector" type="button" class="btn icon ghost" data-ui="stage-inspector" :class="{ active: props.inspector }" :aria-pressed="props.inspector" :title="tl('检查器')" :aria-label="tl('检查器')" @click="emit('update:inspector', !props.inspector)"><Icon name="sidebar" /></button>
        </div>
      </div>
    </section>
    <aside v-if="hasInspector && props.inspector" class="drawer pane" :aria-label="tl('检查器')">
      <div class="dhead">
        <div class="tabs" role="tablist" @keydown="tabKeys">
          <button v-for="t in props.tabs" :key="t.id" type="button" role="tab" :data-tab="t.id" :class="{ on: shownTab === t.id }" :aria-selected="shownTab === t.id" :tabindex="shownTab === t.id ? 0 : -1" @click="emit('update:tab', t.id)"><Icon v-if="t.icon" :name="t.icon" :size="14" />{{ t.label }}</button>
        </div>
        <button v-if="phone" type="button" class="btn icon ghost" :aria-label="tl('关闭')" @click="emit('update:inspector', false)"><Icon name="close" /></button>
      </div>
      <div class="dbody" role="tabpanel"><slot name="inspector" :tab="shownTab" /></div>
    </aside>
  </div>
</template>

<style scoped>
.stage-layout { position: relative; display: flex; gap: var(--space-2); min-width: 0; min-height: 0; height: 100%; padding: var(--space-2); }
.stage { position: relative; flex: 1; min-width: 0; min-height: 0; border-radius: var(--radius-panel); background: var(--canvas-bg); box-shadow: var(--elev-1); overflow: hidden; display: flex; flex-direction: column; }
.veil { position: absolute; inset: 0; z-index: 4; display: grid; place-items: center; background: var(--canvas-bg); }
.sbar { position: absolute; left: var(--space-2); right: var(--space-2); top: var(--space-2); z-index: 5; display: flex; align-items: center; gap: var(--space-1); min-height: calc(var(--control-h) + 8px); padding: 4px 6px; border-radius: var(--radius-bar); box-shadow: var(--elev-2); }
.lead, .tail { display: flex; align-items: center; gap: 2px; min-width: 0; }
.tail { flex: 0 0 auto; }
.gap { flex: 1 1 var(--space-2); }
.cat-anchor, .more-anchor { position: relative; flex: 0 0 auto; }
.popover { position: absolute; left: 0; top: calc(100% + 8px); z-index: 20; width: min(560px, calc(100vw - 48px)); max-height: min(70vh, 560px); overflow: auto; padding: var(--space-3); border-radius: var(--radius-float); }
.menu { top: calc(100% + 8px); left: 0; }
.menu.right { left: auto; right: 0; }
.ai { font-weight: var(--weight-title); color: var(--accent); gap: 4px; }
.drawer { flex: 0 0 var(--drawer-w); width: var(--drawer-w); max-width: 46%; transition: opacity var(--dur-enter) var(--ease-out), transform var(--dur-enter) var(--ease-out); }
@starting-style { .drawer { opacity: 0; transform: translateX(12px); } }
.dhead { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-2) var(--space-1); }
.dhead .tabs { flex: 1; min-width: 0; }
.dbody { flex: 1; min-height: 0; overflow: auto; padding: var(--space-1) var(--space-3) var(--space-3); }
@media (max-width: 1080px) { .lead .lbl, .ai .lbl { display: none; } }

/* Phones: the stage is the page; the inspector rises from the bottom */
.stage-layout.phone { padding: 0; gap: 0; }
.phone .stage { border-radius: 0; box-shadow: none; }
.phone .drawer { position: absolute; left: 0; right: 0; bottom: 0; z-index: 30; width: auto; max-width: none; flex: none; height: 56%; border-radius: var(--radius-float) var(--radius-float) 0 0; box-shadow: var(--elev-3); }
@starting-style { .phone .drawer { opacity: 0; transform: translateY(24px); } }
.phone .popover { position: fixed; left: var(--space-2); right: var(--space-2); width: auto; top: calc(var(--bar-h) + var(--control-h) + 24px); }
</style>
