<script setup lang="ts">
/**
 * A table of properties (26.64, D271): label, value with its unit, an optional remark. A value the data do not have
 * is shown as “无数据” — never left blank, never filled in (D273).
 */
import { tl } from '../../../../i18n'
import type { PropRow } from '../../../../chem/ency/model'

const props = defineProps<{ rows: PropRow[] }>()
</script>

<template>
  <dl class="props">
    <div v-for="r in props.rows" :key="r.id" class="row" :data-prop="r.id">
      <dt>{{ r.label }}</dt>
      <dd>
        <span v-if="r.value !== null" class="num">{{ r.value }}</span>
        <span v-else class="nodata">{{ tl('无数据') }}</span>
        <small v-if="r.note && r.value !== null">{{ r.note }}</small>
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.props { margin: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
.row { display: grid; grid-template-columns: minmax(96px, 38%) minmax(0, 1fr); gap: var(--space-3); padding: 6px 0; border-top: 1px solid var(--separator); }
.row:first-child { border-top: 0; }
dt { color: var(--text-2); font-size: var(--type-small); line-height: var(--line-body); }
dd { margin: 0; min-width: 0; overflow-wrap: break-word; line-height: var(--line-body); }
dd small { display: block; color: var(--text-3); font-size: var(--type-tiny); }
.nodata { color: var(--text-3); }
</style>
