/**
 * Branches (manual 26.51, D34 and D52): "continue from this moment with changes". A branch is a complete scene
 * whose initial conditions are the recorded state at a frame — positions, angles and velocities of the moving
 * bodies, the lengths of ropes, rods and springs as they were resolved, the energy ledger (`startLedger`) and
 * the time (`startTime`, seen by variable forces; the interface adds it to the branch's own clock). It is
 * computed on its own from that moment, so it reruns from the file with the same fingerprint; the parent's
 * recording is kept as it was. Branches are listed on the main scene (`scene.branches`), parents first.
 */
import type { Recording } from '../solver/simulation'
import { frameImpactLoss, frameState, ledgerAt } from '../solver/simulation'
import { AUX_FIXED } from '../solver/dynamics'
import type { BranchDef, Scene } from './types'
import { cloneScene } from './io'

/** Start time of a scene (0 unless it is a branch). */
export function startTimeOf(scene: Scene): number {
  return scene.settings.startTime ?? 0
}

/**
 * The scene of a branch from frame k of a recording. Frame 0 and the last frame of a run that has ended cannot
 * start a branch (null).
 */
export function branchScene(rec: Recording, k: number): Scene | null {
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

/** A fresh branch id (b1, b2, …). */
export function nextBranchId(list: BranchDef[]): string {
  let i = 1
  while (list.some(b => b.id === `b${i}`)) i++
  return `b${i}`
}

/** The chain of branch ids from the main scene (null) to `id`, main first. */
export function branchPath(list: BranchDef[], id: string | null): Array<string | null> {
  const out: Array<string | null> = []
  let cur: string | null = id
  while (cur !== null) {
    out.unshift(cur)
    cur = list.find(b => b.id === cur)?.parent ?? null
  }
  out.unshift(null)
  return out
}

/** Remove a branch and every branch that descends from it. */
export function withoutBranch(list: BranchDef[], id: string): BranchDef[] {
  const gone = new Set([id])
  for (const b of list) if (b.parent !== null && gone.has(b.parent)) gone.add(b.id)
  return list.filter(b => !gone.has(b.id))
}
