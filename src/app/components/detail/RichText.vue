<script setup lang="ts">
/** Text with inline formulas between dollar signs (formula/detailTypes.ts splitMath), formulas rendered by KaTeX. */
import { computed } from 'vue'
import { splitMath } from '../../../formula/detailTypes'
import Tex from '../Tex.vue'

const props = defineProps<{ text: string }>()
const parts = computed(() => splitMath(props.text))
</script>

<template><template v-for="(p, i) in parts" :key="i"><Tex v-if="p.math" :tex="p.s" /><template v-else>{{ p.s }}</template></template></template>
