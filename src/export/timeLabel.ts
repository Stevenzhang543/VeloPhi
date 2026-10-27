/**
 * Time label of exported frames and reports (26.55, D97: split from video.ts so the interface does not load the video
 * encoder just to print a time).
 */
import type { UnitChoice } from '../units/units'
import { displayLabel, toDisplay } from '../units/units'
import { shownTime } from '../units/clock'

/** Time label such as "t = 1.250 s" in the display time unit (recording clock as shown, see units/clock). */
export function timeLabel(t: number, units: UnitChoice): string {
  const label = displayLabel('s', units)
  const v = toDisplay(shownTime(t), 's', units)
  return `t = ${v.toFixed(label === 'ms' ? 0 : 3)} ${label}`
}
