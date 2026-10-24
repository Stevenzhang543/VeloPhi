<script setup lang="ts">
/** Line icons (24 × 24 grid, stroke = currentColor). Drawn for Verity; no third-party icon set. */
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 16 })
const P: Record<string, string> = {
  play: 'M7 5l12 7-12 7z',
  pause: 'M8 5v14M16 5v14',
  stepf: 'M6 5l9 7-9 7zM18 5v14',
  stepb: 'M18 5l-9 7 9 7zM6 5v14',
  start: 'M18 5l-9 7 9 7zM6 5v14',
  end: 'M6 5l9 7-9 7zM18 5v14',
  chart: 'M4 19h16M6 16l4-6 4 3 5-8',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  open: 'M3 7h6l2 2h10v10H3zM3 7V5h6',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  run: 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4',
  export: 'M12 3v12M7 8l5-5 5 5M5 15v5h14v-5',
  template: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  select: 'M6 3l12 9-6 1 3 7-2 1-3-7-4 4z',
  pan: 'M12 3v18M3 12h18M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2M3 12l2-2M3 12l2 2M21 12l-2-2M21 12l-2 2',
  ball: 'M12 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0',
  block: 'M5 8h14v10H5z',
  disc: 'M12 12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M12 12l5-3',
  ground: 'M3 14h18M5 14l-2 4M9 14l-2 4M13 14l-2 4M17 14l-2 4M21 14l-2 4',
  incline: 'M3 19h18L3 7z',
  wall: 'M8 3h8v18H8zM8 8h8M8 13h8M8 18h8',
  conveyor: 'M4 10h16a3 3 0 010 6H4a3 3 0 010-6zM8 13h8M14 11l2 2-2 2',
  pulley: 'M12 10m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 3v3M8 10v10M16 10v6',
  rope: 'M4 20c4-4 4-12 8-12s4 8 8 4',
  rod: 'M5 19L19 5M5 19m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M19 5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  spring: 'M3 12h3l2-4 3 8 3-8 3 8 2-4h3',
  hinge: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 12l7 6M6 5h12',
  force: 'M4 12h14M14 7l5 5-5 5',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  info: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 11v6M12 7v.5',
  sun: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  moon: 'M20 15A8 8 0 019 4a8 8 0 1011 11z',
  loop: 'M17 2l3 3-3 3M4 11V9a4 4 0 014-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 01-4 4H4',
  flag: 'M5 21V4h11l-2 4 2 4H5'
}
const filled = new Set(['play'])
</script>

<template>
  <svg :width="props.size" :height="props.size" viewBox="0 0 24 24" aria-hidden="true" class="icon">
    <path :d="P[props.name] ?? P.info" :fill="filled.has(props.name) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

<style scoped>
.icon { flex: 0 0 auto; display: block; }
</style>
