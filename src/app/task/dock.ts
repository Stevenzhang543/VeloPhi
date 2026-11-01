/**
 * Pinned result cards (26.57, D123; manual §7.4 basic layer): a result can be pinned to the top of the task panel or
 * to the canvas, by menu (keyboard and touch) or by dragging its header onto the pin area (with a snap distance and
 * hysteresis). Pins are layout, not physics: they live in this browser and never change the scene. Undo takes back
 * the last pin change; “恢复默认” clears them all.
 */
import { reactive } from 'vue'

export type DockZone = 'top' | 'canvas'
const KEY = 'velophi.dock.v1'
export const docks = reactive<Record<string, DockZone>>({})
const history: Array<Record<string, DockZone>> = []

try { const raw = localStorage.getItem(KEY); if (raw) Object.assign(docks, JSON.parse(raw)) } catch { /* layout only */ }
function save() { try { localStorage.setItem(KEY, JSON.stringify(docks)) } catch { /* layout only */ } }
function remember() { history.push({ ...docks }); if (history.length > 50) history.shift() }

export function docked(id: string): DockZone | null { return docks[id] ?? null }
export function dock(id: string, zone: DockZone) { remember(); docks[id] = zone; save() }
export function undock(id: string) { remember(); delete docks[id]; save() }
export function undoDock(): boolean {
  const prev = history.pop()
  if (!prev) return false
  for (const k of Object.keys(docks)) delete docks[k]
  Object.assign(docks, prev)
  save()
  return true
}
export function resetDocks() { remember(); for (const k of Object.keys(docks)) delete docks[k]; save() }

/**
 * Snap with hysteresis: the drop zone captures a dragged card when the pointer comes within `enter` px of it and
 * releases it only beyond `exit` px (no flicker at the edge).
 */
export function snapState(distance: number, captured: boolean, enter = 16, exit = 28): boolean {
  return captured ? distance <= exit : distance <= enter
}
