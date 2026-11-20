<script setup lang="ts">
/**
 * The page of one nuclide (26.64, D276), in the side panel of the chart: half-life, decay modes as published, the
 * branches with daughters and Q values the core computed, masses, isomers. Daughters and isomers are links.
 */
import { colonSep, tl } from '../../../i18n'
import type { NuclidePage } from '../../../nuclear/page'

defineProps<{ page: NuclidePage }>()
const emit = defineEmits<{ (e: 'open', id: string): void; (e: 'chain', id: string): void }>()
</script>

<template>
  <article class="npage" data-ui="nuclide-page" :data-nuclide="page.id">
    <header class="nhead">
      <div class="nsym num">{{ page.label }}</div>
      <div class="nmeta">
        <div class="nname">{{ page.name }}</div>
        <div class="small sub num">Z = {{ page.Z }} · N = {{ page.N }} · A = {{ page.A }}</div>
      </div>
      <span class="badge" :class="page.stable ? 'ok' : 'info'" data-ui="nuclide-life">{{ page.life }}</span>
    </header>

    <dl class="lab-kv nrows">
      <template v-for="r in page.rows" :key="r.key">
        <dt>{{ r.label }}</dt>
        <dd :data-row="r.key"><b class="num">{{ r.value }}</b><span v-if="r.note" class="tiny sub"> {{ r.note }}</span></dd>
      </template>
    </dl>

    <section v-if="page.branches.length" class="lab-block">
      <div class="lab-btitle">{{ tl('衰变分支') }}</div>
      <table class="ntable small" data-ui="nuclide-branches">
        <thead><tr><th>{{ tl('衰变方式') }}</th><th>{{ tl('子核') }}</th><th class="r">{{ tl('份额') }}</th><th class="r">Q</th></tr></thead>
        <tbody>
          <tr v-for="(b, i) in page.branches" :key="i">
            <td>{{ b.mode }}</td>
            <td><button v-if="b.to" class="nlink" @click="emit('open', b.to)">{{ b.target }}</button><span v-else class="sub">{{ b.target }}</span></td>
            <td class="r num">{{ b.fraction }}</td>
            <td class="r num">{{ b.q }}</td>
          </tr>
        </tbody>
      </table>
      <p v-for="b in page.branches.filter(x => x.note)" :key="b.mode + b.target" class="tiny sub note">{{ b.mode }} → {{ b.target }}{{ colonSep() }}{{ b.note }}</p>
      <button v-if="page.chain" class="btn tonal small chain-btn" data-ui="nuclide-open-chain" @click="emit('chain', page.id)">{{ tl('衰变链') }}</button>
    </section>

    <section v-if="page.decays.length" class="lab-block">
      <div class="lab-btitle">{{ tl('发表的衰变方式') }}</div>
      <div class="nmodes small"><span v-for="(d, i) in page.decays" :key="i" class="num">{{ d.mode }} {{ d.intensity }}</span></div>
    </section>

    <section v-if="page.isomers.length" class="lab-block">
      <div class="lab-btitle">{{ tl('同质异能态') }}</div>
      <table class="ntable small" data-ui="nuclide-isomers">
        <tbody>
          <tr v-for="s in page.isomers" :key="s.id" :class="{ on: s.current }">
            <td><button class="nlink" :disabled="s.current" @click="emit('open', s.id)">{{ s.label }}</button></td>
            <td class="r num">{{ s.life }}</td>
            <td class="r num">{{ s.massExcess }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <p v-for="n in page.notes" :key="n" class="tiny sub note">{{ n }}</p>
  </article>
</template>

<style scoped>
.nhead { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2); }
.nsym { font-size: var(--type-page); font-weight: var(--weight-title); line-height: var(--line-tight); }
.nmeta { flex: 1; min-width: 0; }
.nname { font-weight: var(--weight-strong); }
.sub { color: var(--text-2); }
.nrows dt { color: var(--text-2); }
.nrows dd { margin: 0; text-align: right; }
.nrows dd b { font-weight: var(--weight-strong); }
.ntable { width: 100%; border-collapse: collapse; }
.ntable th { text-align: left; font-weight: var(--weight-medium); color: var(--text-2); padding: 2px var(--space-1); border-bottom: 1px solid var(--separator); }
.ntable td { padding: 3px var(--space-1); border-bottom: 1px solid var(--separator); vertical-align: baseline; }
.ntable .r { text-align: right; white-space: nowrap; }
.ntable tr.on td { background: var(--accent-soft); }
.nlink { border: 0; background: none; padding: 0; font: inherit; color: var(--accent); cursor: pointer; min-height: var(--hit-min); }
.nlink:hover:not(:disabled) { text-decoration: underline; }
.nlink:disabled { color: var(--text); cursor: default; font-weight: var(--weight-strong); }
.nmodes { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); }
.note { margin: var(--space-1) 0 0; line-height: var(--line-body); }
.chain-btn { margin-top: var(--space-2); }
</style>
