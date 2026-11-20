/**
 * Appearance driver: resolves the theme, applies the interface scale, and turns the appearance settings into
 * classes on <html> that tokens.css and styles.css key on (design system v4, docs/design/DESIGN_SYSTEM.md):
 *   data-theme="light|dark"   effective theme (also mirrored in state.theme for the renderer)
 *   glass-clear | glass-tinted | glass-solid
 *                             the material of floating controls in effect (D255, material.ts): the user's tier,
 *                             lowered by projection, reduced transparency, more contrast, effects off, and by the
 *                             automatic step when playback cannot keep its frame time
 *   fx-glass                  the tier is not solid (kept for components that still key on the 26.59 name)
 *   contrast-more             the system asks for more contrast: stronger lines and secondary text
 *   fx-calm                   reduced motion honoured: no transitions or animations, decorations stand still
 *   fx-off                    effects quality 'off' (canvas effects)
 *   projector                 larger type, higher contrast, solid materials
 *   density-compact, palette-cvd
 * The moving gradient background of 26.52–26.63 and the pointer highlight on glass are gone (D253, D257): the page
 * ground is flat paper, and the only decoration is physics computed by the engine.
 */
import { compatFlags } from './compat'
import { setColourVision } from '../render/renderer'
import { setSeriesColourVision } from '../render/seriesColours'
import { watch, watchEffect } from 'vue'
import { tl } from '../i18n'
import { showToast, state } from './store'
import { calmMotion, effectiveTheme, settings, sysEnv } from './settings'
import type { GlassTier } from './settings'
import { effectiveTier, material, watchFrames } from './material'
import { phone } from './layout'

const html = () => document.documentElement

function toggle(cls: string, on: boolean) { html().classList.toggle(cls, on) }

/**
 * The Android diagnosis switch "noglass" (26.59 fix 3, compat.ts); 26.60 r2: also the Android app's safe mode after
 * repeated restarts (window.__velophiSafe, MainActivity).
 */
function compatNoGlass(): boolean { return compatFlags().includes('noglass') || safeMode() }

/** The Android app opened in safe mode (repeated restarts of its WebView, 26.60 r2). */
export function safeMode(): boolean { return typeof window !== 'undefined' && (window as unknown as { __velophiSafe?: boolean }).__velophiSafe === true }

/** Names of the three tiers as the settings page and the notice show them. */
export function tierLabel(t: GlassTier): string { return t === 'clear' ? tl('通透') : t === 'tinted' ? tl('着色') : tl('实色') }

/** How long the status bar keeps the notice of an automatic step (ms). */
const NOTICE_MS = 12000
let noticeTimer: ReturnType<typeof setTimeout> | null = null

/** An automatic step happened: say so once — in the status bar, or as a message where there is no status bar. */
function announceStep(tier: GlassTier) {
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { material.notice = null }, NOTICE_MS)
  if (phone.value || (state.page !== 'studio' && state.page !== 'monitor')) showToast(tl('播放时帧时间偏长，玻璃已降为“{0}”', [tierLabel(tier)]))
}

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
    const tier = effectiveTier(compatNoGlass())
    toggle('glass-clear', tier === 'clear')
    toggle('glass-tinted', tier === 'tinted')
    toggle('glass-solid', tier === 'solid')
    toggle('fx-glass', tier !== 'solid')
    toggle('contrast-more', sysEnv.moreContrast && !settings.projector)
    toggle('fx-calm', calmMotion())
    toggle('fx-off', settings.effects.quality === 'off' || safeMode())
    toggle('projector', settings.projector)
    toggle('density-compact', settings.density === 'compact' && !settings.projector)
    // 26.58 (D139): colour-vision-friendly palettes of the canvas and the charts
    const cvd = settings.palette === 'cvd'
    setColourVision(cvd)
    setSeriesColourVision(cvd)
    toggle('palette-cvd', cvd)
  })
  // D255: while a simulation plays, the frame time decides whether glass can stay
  watch(() => [state.playing, effectiveTier(compatNoGlass())] as const, ([playing]) => watchFrames(playing, announceStep), { immediate: true })
}
