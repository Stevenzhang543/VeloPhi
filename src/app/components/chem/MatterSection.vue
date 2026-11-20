<script setup lang="ts">
/**
 * 元素与物质 — the library's section for elements and substances (26.64, D240, D271): the encyclopedia (periodic
 * table, element pages, substance pages, search) as it also opens over the bench of the chemistry panel; both show
 * the same place (src/chem/ency/route.ts).
 */
import { computed } from 'vue'
import { tl } from '../../../i18n'
import { state } from '../../store'
import { usePageActive } from '../../live'
import Encyclopedia from './ency/Encyclopedia.vue'

const page = usePageActive()
const active = computed(() => page.value && state.librarySection === 'matter')
</script>

<template>
  <section class="matter pane" data-ui="library-matter-body" :aria-label="tl('元素与物质')">
    <Encyclopedia :active="active" />
  </section>
</template>

<style scoped>
.matter { height: 100%; overflow: hidden; }
</style>
