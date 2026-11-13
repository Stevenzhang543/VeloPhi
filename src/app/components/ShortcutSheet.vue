<script setup lang="ts">
/**
 * Shortcut sheet (26.63, D233): every keyboard and mouse shortcut on one page, opened with "?" from anywhere outside a
 * text field, searchable. The list is the one of the settings page (app/shortcuts.ts).
 */
import { computed, ref } from 'vue'
import { tl } from '../../i18n'
import { vDialog } from '../focusTrap'
import { SHORTCUTS } from '../shortcuts'
import { shell } from '../layout'
import Icon from './Icon.vue'

const q = ref('')
const close = () => { shell.shortcuts = false }
const groups = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return SHORTCUTS.map(g => ({ title: g.title, items: g.items.filter(i => !needle || i.text.toLowerCase().includes(needle) || i.keys.some(k => k.join('+').toLowerCase().includes(needle))) })).filter(g => g.items.length)
})
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div v-dialog="close" class="dialog sheet" role="dialog" :aria-label="tl('快捷键一览')">
      <div class="dialog-header"><Icon name="keyboard" :size="18" />{{ tl('快捷键一览') }}<span class="spacer" />
        <input v-model="q" class="field find" type="search" :placeholder="tl('搜索按键或操作…')" :aria-label="tl('搜索快捷键')" />
        <button class="btn icon ghost" :title="tl('关闭')" :aria-label="tl('关闭')" @click="close"><Icon name="close" /></button>
      </div>
      <div class="dialog-body cols">
        <section v-for="g in groups" :key="g.title" class="grp">
          <h4>{{ g.title }}</h4>
          <div v-for="(i, k) in g.items" :key="k" class="line">
            <span class="what">{{ i.text }}</span>
            <span class="keys"><template v-for="(alt, a) in i.keys" :key="a"><span v-if="a" class="or">/</span><kbd v-for="key in alt" :key="key">{{ key }}</kbd></template></span>
          </div>
        </section>
        <div v-if="!groups.length" class="empty">{{ tl('没有匹配的快捷键') }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheet { width: min(980px, calc(100vw - 32px)); }
.find { width: 220px; margin-right: 4px; }
.cols { columns: 3 260px; column-gap: 28px; padding-bottom: 20px; }
.grp { break-inside: avoid; margin-bottom: 14px; }
h4 { margin: 6px 0 4px; font-size: var(--type-small); color: var(--text-3); font-weight: 650; }
.line { display: flex; align-items: baseline; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--separator); font-size: var(--type-small); }
.what { flex: 1; min-width: 0; }
.keys { flex: 0 0 auto; text-align: right; }
.or { color: var(--text-3); margin: 0 3px; }
@media (max-width: 760px) { .find { width: 120px; } }
</style>
