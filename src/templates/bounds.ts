/**
 * 26.65 (M1, D300): where a template's run ends. Templates run unbounded (D26); a body that runs off the end of the
 * last surface it moves on (a slope without a floor, a finite floor, a belt) would then fall for ever — the time axis
 * keeps growing, the readouts reach hundreds of m/s and the run never comes to rest. These templates stop a short time
 * after the first separation instead (`settings.stopAt`, shown as “stop condition reached”): long enough that the
 * textbook part of the motion is over and that the bounded run of `legacyDuration` is not cut (its recording and
 * fingerprint stay those of the earlier releases), short enough that the body is still near the scene.
 */
import type { Scene, StopKind } from '../core/scene/types'

/** End the run `after` seconds after the first change of kind `on` (default: a contact opens). */
export function stopAfter(s: Scene, after: number, on: StopKind = 'separate') {
  s.settings.stopAt = { on, after }
}
