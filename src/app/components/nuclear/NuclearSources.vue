<script setup lang="ts">
/**
 * Where the nuclide data come from (26.64, D276): NUBASE2020 and AME2020, CC BY 3.0. The licence asks for the authors,
 * the title, the journal citation and the DOI wherever the data are shown, and for a note of what was changed — the
 * citations are the ones the core returns with the table (`nuclideSetData`), shown here on the nuclide pages.
 */
import { tl } from '../../../i18n'

defineProps<{ citations: string[]; licence: string; counts?: { nuclides: number; ground: number; isomers: number; stable: number } | null }>()
</script>

<template>
  <details class="nsrc" data-ui="nuclide-sources">
    <summary class="small">{{ tl('数据来源与许可') }}</summary>
    <p class="tiny">{{ tl('核素数据取自 NUBASE2020 与 AME2020 两个评价，按知识共享署名 3.0 许可（CC BY 3.0）使用：') }}</p>
    <ol class="tiny cites">
      <li v-for="c in citations" :key="c">{{ c }}</li>
    </ol>
    <p class="tiny">{{ tl('改动说明：从原表中选取了基态与主要的同质异能态，半衰期换算为秒，衰变强度换算为份额；子核、分支比、Q 值与结合能由本应用的计算核心从这些数据算出。') }}</p>
    <p v-if="counts" class="tiny">{{ tl('表内共 {0} 个核素：{1} 个基态、{2} 个同质异能态，其中 {3} 个稳定。', [counts.nuclides, counts.ground, counts.isomers, counts.stable]) }}</p>
    <p class="tiny licence">{{ licence }}</p>
  </details>
</template>

<style scoped>
.nsrc { border-top: 1px solid var(--separator); padding-top: var(--space-2); margin-top: var(--space-3); color: var(--text-2); }
.nsrc summary { cursor: pointer; color: var(--text); font-weight: var(--weight-medium); }
.nsrc p { margin: var(--space-2) 0 0; line-height: var(--line-body); }
.cites { margin: var(--space-1) 0 0; padding-left: var(--space-5); line-height: var(--line-body); }
.cites li { margin-bottom: var(--space-1); overflow-wrap: break-word; }
.licence { overflow-wrap: break-word; }
</style>
