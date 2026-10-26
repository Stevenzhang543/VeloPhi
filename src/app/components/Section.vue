<script setup lang="ts">
/**
 * Collapsible section (manual 26.52, D56): a header with a fold arrow, title, optional count, badge and actions,
 * and a body that folds with a height animation (grid rows 0fr ↔ 1fr; instant under reduced motion). The open
 * state is kept per `id` (`panel.group`) in the settings, so it survives restarts; only states that differ from
 * the section's default are stored.
 */
import { computed, ref, useId, watch } from 'vue'
import { calmMotion, settings } from '../settings'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{
  /** Stable key, e.g. 'inspect.material'. */
  id: string
  title: string
  count?: number | string | null
  /** Open by default (until the user folds it). */
  open?: boolean
  /** Prominent header (body text size and colour), e.g. the situations of the formula panel. */
  strong?: boolean
}>(), { count: null, open: true, strong: false })

const isOpen = computed({
  get: () => settings.ui.sections[props.id] ?? props.open,
  set: (v: boolean) => {
    if (v === props.open) delete settings.ui.sections[props.id]
    else settings.ui.sections[props.id] = v
  }
})
const bodyId = useId()
// Content may overflow (focus rings, popovers) only once the body has finished opening
const settled = ref(isOpen.value)
// (Without animations there is no transitionend: settle at once)
watch(isOpen, v => { settled.value = v && calmMotion() })
function onEnd(e: TransitionEvent) { if (e.target === e.currentTarget && isOpen.value) settled.value = true }
</script>

<template>
  <section class="sec" :class="{ open: isOpen, settled, strong }">
    <div class="sec-head">
      <button type="button" class="sec-toggle" :aria-expanded="isOpen" :aria-controls="bodyId" @click="isOpen = !isOpen">
        <Icon name="chevron" :size="12" class="sec-chev" />
        <span class="sec-title">{{ title }}</span>
        <span v-if="count !== null && count !== ''" class="sec-count">{{ count }}</span>
        <slot name="badge" />
      </button>
      <div v-if="$slots.actions" class="sec-actions"><slot name="actions" /></div>
    </div>
    <div :id="bodyId" class="sec-body" :inert="!isOpen" @transitionend="onEnd">
      <div class="sec-inner"><slot /></div>
    </div>
  </section>
</template>

<style scoped>
.sec { margin: 0; }
.sec-head { display: flex; align-items: center; gap: 4px; margin: 8px 0 2px; min-height: 24px; }
.sec-toggle {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; border: 0; background: transparent; padding: 3px 2px;
  border-radius: 6px; cursor: pointer; color: var(--text-3); font-size: var(--type-small); font-weight: 600; text-align: left;
  transition: color var(--dur-2) var(--ease-out), background var(--dur-2) var(--ease-out);
}
.sec-toggle:hover { color: var(--text-2); background: var(--hover); }
.strong .sec-toggle { color: var(--text); font-size: var(--type-body); }
.sec-toggle:active { transform: scale(0.99); }
.sec-chev { flex: 0 0 auto; transform: rotate(-90deg); transition: transform var(--dur-3) var(--ease-out); opacity: 0.8; }
.open .sec-chev { transform: none; }
.sec-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sec-count { font-weight: 500; color: var(--text-3); font-variant-numeric: tabular-nums; }
.sec-actions { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.sec-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--dur-3) var(--ease-out); }
.open .sec-body { grid-template-rows: 1fr; }
.sec-inner { min-height: 0; overflow: hidden; }
.settled .sec-inner { overflow: visible; }
.sec:not(.open) .sec-inner { visibility: hidden; transition: visibility 0s linear var(--dur-3); }
</style>
