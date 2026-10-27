/**
 * Narrow windows (26.55, D96 “窄屏布局”): below 1100 px the tool palette is an icon rail and the right panel slides
 * over the canvas when asked for; below 760 px (phones, split screens) the panels stack. Kept reactive from the
 * window's media queries.
 */
import { computed, ref } from 'vue'
import { settings } from './settings'

const mq = (q: string) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null)
const narrowQ = mq('(max-width: 1100px)')
const phoneQ = mq('(max-width: 760px)')

/** The window is narrow (tool rail, right panel as a drawer). */
export const narrow = ref(!!narrowQ?.matches)
/** The window is phone-sized (stacked panels). */
export const phone = ref(!!phoneQ?.matches)
narrowQ?.addEventListener?.('change', e => { narrow.value = e.matches })
phoneQ?.addEventListener?.('change', e => { phone.value = e.matches })

/** The tool palette is shown as an icon rail (chosen in the palette, or forced by a narrow window). */
export const railOn = computed(() => settings.ui.toolRail || narrow.value)
/** The right panel drawer of a narrow window is open. */
export const drawerOpen = ref(false)
