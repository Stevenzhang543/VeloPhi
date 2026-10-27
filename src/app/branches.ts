/**
 * Branches in the application (manual 26.51, D52): "branch from this moment" at the frame shown, switching
 * between the main scene and its branches, removing branches, and the recording of a branch's parent for the
 * overlay in the charts. The document (main scene + branches) is kept in the store: `state.scene` is the scene on
 * screen and, while a branch is shown, `state.mainScene` holds the main scene with every branch as last saved
 * there (documentScene() merges the one being edited back in).
 */
import { tl } from '../i18n'
import { markRaw } from 'vue'
import type { BranchDef, Scene } from '../core/scene/types'
import { cloneScene, serializeScene } from '../core/scene/io'
import { branchScene, nextBranchId, startTimeOf, withoutBranch } from '../core/scene/branch'
import type { Recording } from '../engine/recording'
import { simulate } from '../engine/recording'
import { documentScene, markStale, runSimulation, showToast, state } from './store'
import { fmtTime } from './settings'
import { logEvent } from './trialLog'

/** The branches of the document, parents first. */
export function branchList(): BranchDef[] {
  return (state.mainScene ?? state.scene).branches ?? []
}

/** Whether "branch from this moment" is possible now (a recording of the scene on screen, an inner frame). */
export function canBranch(): boolean {
  const rec = state.recording
  if (!rec || state.stale || state.frame <= 0 || state.frame >= rec.frameCount) return false
  return !(rec.stopReason !== undefined && state.frame >= rec.frameCount - 1)
}

/** Show the scene of a branch (null: the main scene); edits of the scene on screen are kept in the document. */
export function showBranch(id: string | null) {
  if (id === state.branch) return
  const doc = documentScene()
  const target = id === null ? doc : doc.branches?.find(b => b.id === id)?.scene
  if (!target) return
  state.mainScene = id === null ? null : cloneScene(doc)
  state.scene = id === null ? cloneScene(doc) : cloneScene(target)
  state.branch = id
  state.past = []
  state.future = []
  state.selection = null
  state.chart = state.chart.filter(c => !c.startsWith('custom.') || (state.scene.customQuantities ?? []).some(q => `custom.${q.id}` === c))
  markStale()
  runSimulation()
  logEvent('branch.show', { branch: id ?? 'main' })
}

/** Start a branch at the frame shown and show it; its parent is the scene on screen. */
export function branchHere(): boolean {
  const rec = state.recording
  if (!rec || !canBranch()) return false
  const scene = branchScene(rec, state.frame)
  if (!scene) return false
  const doc = documentScene()
  const list = doc.branches ?? []
  const id = nextBranchId(list)
  const t = startTimeOf(scene)
  const def: BranchDef = { id, name: tl('分支 {0}（t = {1}）', [list.length + 1, fmtTime(state.frame * rec.dt, rec.dt)]), parent: state.branch, t, scene }
  const main = cloneScene(doc)
  main.branches = [...list, def]
  // Show the new branch: the document is the main scene with its branches
  state.mainScene = main
  state.scene = cloneScene(scene)
  state.branch = id
  state.past = []
  state.future = []
  state.dirty = true
  markStale()
  runSimulation()
  showToast(tl('已从 t = {0} 建立分支：修改物体或参数后从此刻继续计算，原记录保留', [fmtTime(state.frame * rec.dt, rec.dt)]))
  logEvent('branch.create', { branch: id, t })
  return true
}

/** Remove a branch and its descendants; when the branch shown goes, the main scene is shown. */
export function deleteBranch(id: string) {
  const doc = documentScene()
  const rest = withoutBranch(doc.branches ?? [], id)
  const gone = !rest.some(b => b.id === state.branch)
  const main = cloneScene(doc)
  if (rest.length) main.branches = rest; else delete main.branches
  if (state.branch !== null && gone) {
    state.mainScene = null
    state.scene = main
    state.branch = null
    state.past = []
    state.future = []
    markStale()
    runSimulation()
  } else if (state.branch === null) {
    if (rest.length) state.scene.branches = rest; else delete state.scene.branches
  } else {
    state.mainScene = main
  }
  state.dirty = true
  logEvent('branch.delete', { branch: id })
}

/** Rename a branch. */
export function renameBranch(id: string, name: string) {
  const host = state.mainScene ?? state.scene
  const b = host.branches?.find(x => x.id === id)
  if (!b || !name.trim()) return
  b.name = name.trim()
  state.dirty = true
}

/** Depth of a branch in the tree (1: child of the main scene). */
export function branchDepth(id: string): number {
  let d = 0
  let cur: string | null = id
  const list = branchList()
  while (cur !== null) { d++; cur = list.find(b => b.id === cur)?.parent ?? null }
  return d
}

// ---- Parent recording for the overlay ----
const parentCache = new Map<string, Recording>()

/**
 * Recording of the parent of the branch shown (computed once in the core on this thread, up to the end of the
 * branch), or null on the main scene or when it cannot be computed.
 */
export function parentRecording(): Recording | null {
  if (state.branch === null || !state.mainScene) return null
  const def = state.mainScene.branches?.find(b => b.id === state.branch)
  if (!def) return null
  const parent: Scene | undefined = def.parent === null ? state.mainScene : state.mainScene.branches?.find(b => b.id === def.parent)?.scene
  if (!parent) return null
  // Up to the end of the branch; an unbounded branch: what it has computed, in 5 s steps (few recomputations)
  const st = state.scene.settings
  const shown = st.duration ?? Math.ceil(Math.max(st.legacyDuration, state.recording ? state.recording.frameCount * state.recording.dt : 0) / 5) * 5
  const end = def.t + shown - startTimeOf(parent)
  const key = `${serializeScene(parent)}|${end}`
  const hit = parentCache.get(key)
  if (hit) return hit
  try {
    const rec = markRaw(simulate(parent, { duration: Math.max(end, parent.settings.outputStep), maxSteps: 2_000_000 }))
    if (parentCache.size > 4) {
      const oldKey = parentCache.keys().next().value!
      parentCache.get(oldKey)?.session.free()
      parentCache.delete(oldKey)
    }
    parentCache.set(key, rec)
    return rec
  } catch {
    return null
  }
}
