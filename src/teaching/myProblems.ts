/**
 * "My problems" (26.59, D166): problems saved on this computer — AI-read problems and the teacher's own — with the
 * categories of the problem library (chapter, model types, level, school stage). Stored as problem files
 * (velophi-problem format) in local storage; exportable like any problem.
 */
import { reactive } from 'vue'
import type { Problem } from './problems'
import { parseProblem, serializeProblem } from './problems'

const KEY = 'velophi.myProblems.v1'
const MAX = 200

export interface MyProblemMeta { id: string; title: string; chapter: string; types: string[]; level: string; stage: string; savedAt: string; route?: string }
interface Stored { meta: MyProblemMeta; text: string }

export const myProblems = reactive<{ list: MyProblemMeta[] }>({ list: [] })
let store: Stored[] = []

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* storage full or unavailable */ }
  myProblems.list = store.map(s => s.meta)
}

export function loadMyProblems() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Stored[]
    store = Array.isArray(raw) ? raw.filter(s => s && s.meta && typeof s.text === 'string') : []
  } catch { store = [] }
  myProblems.list = store.map(s => s.meta)
}

/** Save (or replace) a problem with its categories. */
export function saveMyProblem(p: Problem, cat: { types?: string[]; level?: string; stage?: string; route?: string } = {}): MyProblemMeta {
  const meta: MyProblemMeta = {
    id: p.id, title: typeof p.title === 'string' ? p.title : p.title.zh, chapter: String(p.chapter ?? ''),
    types: cat.types ?? [], level: cat.level ?? '', stage: cat.stage ?? '', savedAt: new Date().toISOString(), route: cat.route
  }
  store = [{ meta, text: serializeProblem(p) }, ...store.filter(s => s.meta.id !== p.id)].slice(0, MAX)
  persist()
  return meta
}

export function getMyProblem(id: string): Problem | null {
  const s = store.find(x => x.meta.id === id)
  if (!s) return null
  try { return parseProblem(s.text).problem } catch { return null }
}

export function deleteMyProblem(id: string) {
  store = store.filter(s => s.meta.id !== id)
  persist()
}
