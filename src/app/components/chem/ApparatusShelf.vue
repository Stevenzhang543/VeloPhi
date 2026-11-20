<script setup lang="ts">
/**
 * The apparatus shelf (26.64, D269): the kinds the core can do something with, by group. A vessel is put on the
 * bench (its other sizes are the small buttons of its row); an instrument or a tool goes onto the selected vessel, or
 * is carried to the vessel tapped next. With a mouse, a row can be dragged to its place. Kinds that wait for the core
 * (`available: false` in apparatus.json) are not listed.
 */
import { computed, ref } from 'vue'
import { tl } from '../../../i18n'
import { APPARATUS_GROUPS, groupName, kindName, shelfKinds } from '../../../chem/apparatus'
import type { ApparatusKind } from '../../../chem/apparatus'
import { qty } from '../../../chem/format'
import Icon from '../Icon.vue'
import { watchDrag } from './benchUi'

const props = withDefaults(defineProps<{ group?: string }>(), { group: '' })
const emit = defineEmits<{ (e: 'pick', kind: string, capacity?: number): void; (e: 'drag'): void; (e: 'update:group', g: string): void }>()

const groups = computed(() => APPARATUS_GROUPS.filter(g => shelfKinds(g.id).length))
const own = ref(groups.value[0]?.id ?? '')
const shown = computed(() => (groups.value.some(g => g.id === props.group) ? props.group : own.value))
const rows = computed<ApparatusKind[]>(() => shelfKinds(shown.value))
function setGroup(g: string) { own.value = g; emit('update:group', g) }
const role = (k: ApparatusKind) => (k.vessel ? '' : k.instrument ? tl('仪表') : k.role === 'support' ? tl('支架') : tl('工具'))
const others = (k: ApparatusKind) => (k.vessel && k.vessel.capacities.length > 1 ? k.vessel.capacities : [])
</script>

<template>
  <div class="ashelf" data-ui="chem-apparatus-shelf">
    <div class="groups" role="tablist" :aria-label="tl('仪器分组')">
      <button v-for="g in groups" :key="g.id" type="button" class="chip" role="tab" :class="{ on: shown === g.id }" :aria-selected="shown === g.id" :data-group="g.id" @click="setGroup(g.id)">{{ groupName(g) }}</button>
    </div>
    <ul class="rows">
      <li v-for="k in rows" :key="k.id" class="row1">
        <button type="button" class="rowb" :data-kind="k.id" @pointerdown="watchDrag($event, 'apparatus', k.id, () => emit('drag'))" @click="emit('pick', k.id)">
          <Icon :name="k.icon" :size="18" /><span class="name">{{ kindName(k) }}</span>
          <span v-if="k.vessel && !others(k).length" class="cap num">{{ qty(k.vessel.default, 'mL', 0) }}</span>
          <span v-else-if="!k.vessel" class="cap">{{ role(k) }}</span>
        </button>
        <span v-if="others(k).length" class="sizes" role="group" :aria-label="tl('容量')">
          <button v-for="c in others(k)" :key="c" type="button" class="size num" :class="{ def: c === k.vessel!.default }" :title="qty(c, 'mL', 0)" @click="emit('pick', k.id, c)">{{ c }}</button>
          <span class="unit">mL</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ashelf { display: flex; flex-direction: column; gap: var(--space-2); min-height: 0; }
.groups { display: flex; flex-wrap: wrap; gap: 4px; }
.rows { list-style: none; margin: 0; padding: 0; overflow: auto; max-height: min(52vh, 420px); display: grid; grid-template-columns: 1fr; }
.row1 { display: flex; align-items: center; gap: 4px; border-radius: var(--radius-row); }
.rowb { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: var(--space-2); min-height: var(--menu-row); padding: 0 8px; border: 0; border-radius: var(--radius-row); background: transparent; cursor: pointer; text-align: left; font-size: var(--type-body); }
.rowb:hover { background: var(--accent-soft); color: var(--accent-strong); }
.rowb :deep(.icon) { color: var(--text-2); }
.rowb:hover .cap, .rowb:hover :deep(.icon) { color: inherit; }
.name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cap { flex: 0 0 auto; color: var(--text-3); font-size: var(--type-small); }
.sizes { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 2px; padding-right: 6px; }
.size { min-width: 34px; height: var(--control-sm); padding: 0 6px; border: 0; border-radius: var(--radius-row); background: var(--fill); color: var(--text-2); font: inherit; font-size: var(--type-small); cursor: pointer; }
.size:hover { background: var(--accent-soft); color: var(--accent); }
.size.def { color: var(--text); font-weight: var(--weight-strong); }
.unit { color: var(--text-3); font-size: var(--type-tiny); margin-left: 2px; }
@media (pointer: coarse) { .rowb { min-height: var(--touch-min); } .size { min-width: var(--touch-min); height: var(--touch-min); } }
</style>
