<script setup lang="ts">
/**
 * 电子排布图 — the occupied subshells of an atom as rows of boxes, one box per orbital, filled by the rule of Hund
 * (26.64, D271). The subshells and their electrons come from the element record; the page says so when the
 * configuration is a prediction.
 */
import { tl } from '../../../../i18n'
import type { ConfigLevel } from '../../../../chem/ency/model'

const props = defineProps<{ levels: ConfigLevel[] }>()
const ARROWS = ['', '↑', '↑↓']
</script>

<template>
  <ol class="config" data-ui="ency-config" :aria-label="tl('电子排布图')">
    <li v-for="l in props.levels" :key="l.label" class="level" :aria-label="tl('{0} 亚层：{1} 个电子', [l.label, l.electrons])">
      <span class="boxes" aria-hidden="true"><i v-for="(b, i) in l.boxes" :key="i" class="box">{{ ARROWS[b] }}</i></span>
      <span class="name num" aria-hidden="true">{{ l.label }}<sup>{{ l.electrons }}</sup></span>
    </li>
  </ol>
</template>

<style scoped>
.config { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-4); align-items: flex-end; }
.level { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.boxes { display: inline-flex; gap: 2px; }
.box { display: grid; place-items: center; width: 22px; height: 26px; border: 1px solid var(--tick); border-radius: var(--radius-row); font-style: normal; font-size: var(--type-small); line-height: 1; color: var(--text); letter-spacing: -0.12em; }
.name { font-size: var(--type-small); color: var(--text-2); }
.name sup { font-size: 0.75em; }
</style>
