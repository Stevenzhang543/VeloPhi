/**
 * What the studio's status bar shows about the canvas (26.63, D233): the pointer's position, the zoom, and the hint of
 * the tool in use. The studio viewport writes it; kept apart from the editor state, which the canvas watches deeply
 * (a pointer move must not ask for a redraw through that watch).
 */
import { reactive } from 'vue'

export const viewStatus = reactive({
  /** Pointer position on the canvas (world, m); null: outside. */
  cursor: null as { x: number; y: number } | null,
  /** Pixels per metre of the studio view. */
  ppm: 0,
  /** Hint of the current tool or selection (empty: none). */
  hint: '',
  /** Asked zoom steps (the viewport applies and clears them): > 0 in, < 0 out. */
  zoom: 0,
  /** Counter: zoom to 100 px/m around the view centre. */
  reset: 0
})

/** Zoom the studio view one step in (+1) or out (−1) around its centre. */
export function zoomStudio(step: 1 | -1) { viewStatus.zoom += step }
