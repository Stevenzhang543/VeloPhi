/**
 * The scene of a branch (manual 26.51, D52) from a recording of the TypeScript reference engine, as 26.52 computed it:
 * the reference of `src/core/scene/branch.ts` (which reads the same state through the Rust session) for the parity
 * scripts and tests/branch.test.ts.
 */
import type { Recording } from '../solver/simulation'
import { frameImpactLoss, frameState, ledgerAt } from '../solver/simulation'
import { AUX_FIXED } from '../solver/dynamics'
import type { Scene } from '../../../../src/core/scene/types'
import { cloneScene } from '../../../../src/core/scene/io'
import { startTimeOf } from '../../../../src/core/scene/branch'

/**
 * The scene of a branch from frame k of a recording. Frame 0 and the last frame of a run that has ended cannot
 * start a branch (null).
 */
export function refBranchScene(rec: Recording, k: number): Scene | null {
  if (!(k > 0 && k < rec.frameCount)) return null
  if (rec.stopReason !== undefined && k >= rec.frameCount - 1) return null
  const parent = rec.scene
  const st = parent.settings
  const tLocal = k * rec.dt
  if (st.duration !== null && tLocal >= st.duration - 0.5 * rec.dt) return null
  const scene = cloneScene(parent)
  delete scene.branches
  const sys = rec.system, model = sys.model, n = sys.n
  const X = frameState(rec, k)
  for (const b of model.dynamic) {
    const def = scene.bodies.find(d => d.id === b.id)
    if (!def) continue
    const i = b.index
    def.position = { x: X[3 * i], y: X[3 * i + 1] }
    def.angle = X[3 * i + 2]
    def.velocity = { x: X[3 * n + 3 * i], y: X[3 * n + 3 * i + 1] }
    def.angularVelocity = b.invInertia > 0 ? X[3 * n + 3 * i + 2] : def.angularVelocity
  }
  // Lengths given as "initial" are the parent's, not the distances at the branch point
  for (const c of scene.connectors) {
    if (c.type === 'rope' && c.length === null) c.length = model.ropes.find(r => r.id === c.id)?.length ?? null
    if (c.type === 'rod' && c.length === null) c.length = model.rods.find(r => r.id === c.id)?.length ?? null
    if (c.type === 'spring' && c.restLength === null) c.restLength = model.springs.find(s => s.id === c.id)?.restLength ?? null
  }
  const l = ledgerAt(rec, X, frameImpactLoss(rec, k))
  const pairs: Record<string, [number, number]> = {}
  for (const p of sys.pairs) {
    const base = sys.auxBase + AUX_FIXED + 2 * p.index
    if (X[base] !== 0 || X[base + 1] !== 0) pairs[p.key] = [X[base], X[base + 1]]
  }
  scene.settings.startTime = startTimeOf(parent) + tLocal
  scene.settings.startLedger = { frictionHeat: l.frictionHeat, appliedWork: l.appliedWork, damping: l.damping, beltWork: l.beltWork, impactLoss: l.impactLoss, ...(Object.keys(pairs).length ? { pairs } : {}) }
  if (st.duration !== null) scene.settings.duration = st.duration - tLocal
  scene.settings.legacyDuration = Math.max(st.legacyDuration - tLocal, rec.dt)
  return scene
}

