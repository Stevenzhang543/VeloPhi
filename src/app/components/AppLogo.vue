<script lang="ts">
/**
 * The Verity mark (manual 26.51, D48): a projectile path with strobe positions at equal time steps (equal
 * horizontal spacing on the parabola y = 9.6 + (x − 14.4)²/8), the newest one highlighted. Same drawing as
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
    <path d="M5 20.65Q15 -2.86 25 23.65" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1.3" stroke-linecap="round" />
    <circle cx="9" cy="13.25" r="2.4" fill="#fff" fill-opacity="0.55" />
    <circle cx="16" cy="9.92" r="2.8" fill="#fff" fill-opacity="0.85" />
    <circle cx="23" cy="18.84" r="3.8" fill="#fbbf24" />
  </svg>
</template>
