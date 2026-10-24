/**
 * Appearance driver: resolves the theme, applies the interface scale, and turns the effect settings into
 * classes on <html> that styles.css keys on:
 *   data-theme="light|dark"   effective theme (also mirrored in state.theme for the renderer)
 *   fx-glass                  translucent panes with a pointer-following highlight
 *   fx-high                   high quality: real backdrop blur and saturation behind the panes
 *   fx-ambient                soft animated background behind the panes
 *   fx-smooth                 high quality: the background moves continuously (standard: a few steps a second)
 *   fx-calm                   reduced motion honoured: no transitions or animations
 *   fx-still                  background frozen (reduced motion, hidden document, playback at standard quality)
 *   fx-off                    effects quality 'off'
 *   projector                 larger type, higher contrast, no translucency
 * The pointer highlight writes --hx/--hy (pane-local px) on the pane under the pointer, once per animation frame;
 * the highlight itself only moves by transform (no repaint).
 */
import { watchEffect } from 'vue'
import { state } from './store'
import { calmMotion, effectiveEffects, effectiveTheme, settings, sysEnv } from './settings'

const html = () => document.documentElement

function toggle(cls: string, on: boolean) { html().classList.toggle(cls, on) }

let highlightOn = false
let pending: PointerEvent | null = null
let raf = 0
let lit: HTMLElement | null = null

function unlight() {
  if (!lit) return
  lit.style.removeProperty('--hl')
  lit = null
}

function frame() {
  raf = 0
  const e = pending
  pending = null
  if (!e || !highlightOn) return
  const target = e.target instanceof Element ? (e.target.closest('.pane, .glass') as HTMLElement | null) : null
  if (target !== lit) unlight()
  if (!target) return
  const r = target.getBoundingClientRect()
  target.style.setProperty('--hx', `${Math.round(e.clientX - r.left)}px`)
  target.style.setProperty('--hy', `${Math.round(e.clientY - r.top)}px`)
  if (lit !== target) { target.style.setProperty('--hl', '1'); lit = target }
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerType === 'touch') return
  pending = e
  if (!raf) raf = requestAnimationFrame(frame)
}

function onPointerLeave() { unlight() }

/** Start the appearance driver (once, before mounting). */
export function initAppearance() {
  watchEffect(() => {
    const theme = effectiveTheme()
    state.theme = theme
    html().dataset.theme = theme
    html().style.colorScheme = theme
  })
  watchEffect(() => {
    html().style.setProperty('--ui-scale', String(settings.uiScale))
  })
  watchEffect(() => {
    const fx = effectiveEffects()
    // The background also rests during playback at standard quality: the canvas gets the whole frame budget
    const still = calmMotion() || sysEnv.hidden || (state.playing && settings.effects.quality !== 'high')
    toggle('fx-glass', fx.glass)
    toggle('fx-ambient', fx.ambient)
    toggle('fx-high', settings.effects.quality === 'high')
    toggle('fx-smooth', fx.ambient && settings.effects.quality === 'high')
    toggle('fx-still', still)
    toggle('fx-calm', calmMotion())
    toggle('fx-off', settings.effects.quality === 'off')
    toggle('projector', settings.projector)
    const want = fx.glass && !calmMotion() && !sysEnv.hidden
    if (want !== highlightOn) {
      highlightOn = want
      if (want) {
        window.addEventListener('pointermove', onPointerMove, { passive: true })
        document.addEventListener('pointerleave', onPointerLeave)
      } else {
        window.removeEventListener('pointermove', onPointerMove)
        document.removeEventListener('pointerleave', onPointerLeave)
        unlight()
      }
    }
  })
}
