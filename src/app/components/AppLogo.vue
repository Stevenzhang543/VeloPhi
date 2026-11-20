<script lang="ts">
/**
 * The VeloΦ mark (manual 26.52, D55): the letter Φ as two motions — an orbit (the ellipse) and a free fall along
 * the stroke, strobed at equal time steps (spacing 1:3:5, the newest position highlighted). Same drawing as
 * assets/icon-small.svg; the desktop icon is assets/icon.svg.
 *
 * 26.65 (D296): flat — one graphite ground, no gradient (the 26.52 ground was Tailwind's indigo-500 → indigo-800,
 * the most common colour of generated interfaces), the strobe in plain white and the newest position in amber.
 */
</script>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 22 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
    <rect x="1" y="1" width="30" height="30" rx="7" fill="#1c2230" />
    <ellipse cx="16" cy="16.25" rx="9.38" ry="6.56" fill="none" stroke="#fff" stroke-opacity="0.72" stroke-width="1.4" />
    <line x1="16" y1="5" x2="16" y2="27.5" stroke="#fff" stroke-opacity="0.72" stroke-width="1.4" stroke-linecap="round" />
    <circle cx="16" cy="9.75" r="1.6" fill="#fff" fill-opacity="0.6" />
    <circle cx="16" cy="15.69" r="2" fill="#fff" fill-opacity="0.85" />
    <circle cx="16" cy="24" r="3" fill="#f2a900" />
  </svg>
</template>
