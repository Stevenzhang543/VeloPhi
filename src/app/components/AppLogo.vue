<script lang="ts">
/**
 * The VeloΦ mark (manual 26.52, D55): the letter Φ as two motions — an orbit (the ellipse) and a free fall along
 * the stroke, strobed at equal time steps (spacing 1:3:5, the newest position highlighted). Same drawing as
 * assets/icon-small.svg; the desktop icon is assets/icon.svg.
 */
let seq = 0
</script>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 22 })
const id = `vlogo-${++seq}`
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <linearGradient :id="id" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#6366f1" /><stop offset="0.55" stop-color="#3730a3" /><stop offset="1" stop-color="#0f0c33" /></linearGradient>
    </defs>
    <rect x="1" y="1" width="30" height="30" rx="7" :fill="`url(#${id})`" />
    <ellipse cx="16" cy="16.25" rx="9.38" ry="6.56" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="1.4" />
    <line x1="16" y1="5" x2="16" y2="27.5" stroke="#fff" stroke-opacity="0.6" stroke-width="1.4" stroke-linecap="round" />
    <circle cx="16" cy="9.75" r="1.6" fill="#fff" fill-opacity="0.7" />
    <circle cx="16" cy="15.69" r="2" fill="#fff" fill-opacity="0.9" />
    <circle cx="16" cy="24" r="3" fill="#fbbf24" />
  </svg>
</template>
