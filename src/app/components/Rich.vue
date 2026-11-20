<script setup lang="ts">
/**
 * An interface text with real subscripts (26.65, D294): `v_y`, `U_AB`, `s_min` in a text are drawn as v<sub>y</sub>
 * and so on (`i18n/sub.ts`). Use it wherever a text may contain such a symbol: `<Rich :text="tl('初速度 v_y')" />`.
 */
import { computed } from 'vue'
import { subParts } from '../../i18n/sub'

const props = defineProps<{ text: string }>()
const parts = computed(() => subParts(props.text))
</script>

<template>
  <template v-for="(p, i) in parts" :key="i"><sub v-if="p.sub" class="rich-sub">{{ p.t }}</sub><template v-else>{{ p.t }}</template></template>
</template>
