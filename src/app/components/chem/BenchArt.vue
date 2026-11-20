<script setup lang="ts">
/**
 * The drawing of the empty bench (26.64, D257, D258): a still line drawing made by the bench's own glass renderer —
 * a conical flask under a burette and a beaker — in the panel's identity colour. It is a picture, not a simulation:
 * nothing in it moves and it costs one draw. (The manual sketches a slowly turning wireframe molecule here; the 3D
 * viewer is a WebGL component of its own and too heavy for a decoration, so the bench shows its own glassware.)
 */
import { onMounted, ref, watch } from 'vue'
import { state as app } from '../../store'
import { settings } from '../../settings'
import { kindOf, shapeOf } from '../../../chem/apparatus'
import { chemPalette } from '../../../render/chem/palette'
import { drawGlass, drawGraduations } from '../../../render/chem/glass'
import type { Frame } from '../../../render/chem/glass'
import { drawLiquid } from '../../../render/chem/liquid'

const canvas = ref<HTMLCanvasElement | null>(null)
const W = 220, H = 150

function draw() {
  const c = canvas.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  c.width = W * dpr; c.height = H * dpr
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  const base = chemPalette()
  // the panel's colour for the lines, quiet versions of it for body and liquid
  const P = { ...base, ink2: base.panel, tick: base.panel, glassBody: 'transparent', glassLight: 'transparent', waterLine: base.panel, water: base.accentSoft }
  const ppc = 7.2
  const put = (kind: string, cap: number, cx: number, baseY: number, mL: number, grads = false) => {
    const shape = shapeOf(kind, cap), f: Frame = { cx, base: baseY, ppc }
    drawLiquid(ctx, P, shape, f, mL)
    drawGlass(ctx, P, shape, kindOf(kind)!.vessel, f, { line: 0.9 })
    if (grads) drawGraduations(ctx, P, kind, shape, f, P.font, 0.8)
  }
  const y = H - 8
  put('erlenmeyer', 250, 82, y - 2, 90)
  put('buretteBase', 50, 82, y - 124, 34)
  put('beaker', 250, 162, y - 2, 120, true)
  ctx.strokeStyle = base.tick
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(20, y + 0.5); ctx.lineTo(W - 20, y + 0.5); ctx.stroke()
}
onMounted(draw)
watch(() => [app.theme, settings.projector], () => requestAnimationFrame(draw))
</script>

<template>
  <canvas ref="canvas" class="art" :style="{ width: `${W}px`, height: `${H}px` }" aria-hidden="true" />
</template>

<style scoped>
.art { display: block; }
</style>
