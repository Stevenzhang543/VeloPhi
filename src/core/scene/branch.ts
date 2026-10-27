/**
 * Branches (manual 26.51, D34 and D52): "continue from this moment with changes". A branch is a complete scene
 * whose initial conditions are the recorded state at a frame — positions, angles and velocities of the moving
 * bodies, the lengths of ropes, rods and springs as they were resolved, the energy ledger (`startLedger`) and
 * the time (`startTime`, seen by variable forces; the interface adds it to the branch's own clock). It is
 * computed on its own from that moment, so it reruns from the file with the same fingerprint; the parent's
 * recording is kept as it was. Branches are listed on the main scene (`scene.branches`), parents first.
 */
import type { Recording } from '../../engine/recording'
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
  // The state, resolved lengths and ledger at frame k, read in the core
  const st0 = rec.session.call<{
    bodies: Array<{ id: string; x: number; y: number; angle: number; vx: number; vy: number; omega: number | null }>
    ropes: Array<[string, number]>; rods: Array<[string, number]>; springs: Array<[string, number]>
    ledger: { frictionHeat: number; appliedWork: number; damping: number; beltWork: number; impactLoss: number; fieldWork?: number; buoyancyWork?: number; jouleHeat?: number; liquidHeat?: number }
    /** Per contact pair with sliding: [key, distance, heat], in the order of the system's pairs. */
    pairs: Array<[string, number, number]>
  }>({ op: 'branchState', frame: k })
  for (const b of st0.bodies) {
    const def = scene.bodies.find(d => d.id === b.id)
    if (!def) continue
    def.position = { x: b.x, y: b.y }
    def.angle = b.angle
    def.velocity = { x: b.vx, y: b.vy }
    def.angularVelocity = b.omega ?? def.angularVelocity
  }
  // Lengths given as "initial" are the parent's, not the distances at the branch point
  const len = (list: Array<[string, number]>, id: string) => list.find(x => x[0] === id)?.[1] ?? null
  for (const c of scene.connectors) {
    if (c.type === 'rope' && c.length === null) c.length = len(st0.ropes, c.id)
    if (c.type === 'rod' && c.length === null) c.length = len(st0.rods, c.id)
    if (c.type === 'spring' && c.restLength === null) c.restLength = len(st0.springs, c.id)
  }
  const l = st0.ledger
  const pairs: Record<string, [number, number]> = {}
  for (const [key, d, q] of st0.pairs) pairs[key] = [d, q]
  scene.settings.startTime = startTimeOf(parent) + tLocal
  const extra = l.fieldWork !== undefined ? { fieldWork: l.fieldWork, buoyancyWork: l.buoyancyWork ?? 0, jouleHeat: l.jouleHeat ?? 0, liquidHeat: l.liquidHeat ?? 0 } : {}
  scene.settings.startLedger = { frictionHeat: l.frictionHeat, appliedWork: l.appliedWork, damping: l.damping, beltWork: l.beltWork, impactLoss: l.impactLoss, ...extra, ...(Object.keys(pairs).length ? { pairs } : {}) }
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
