/**
 * Editor UI state that is not part of the document and not in the shared store: the selected annotation,
 * drafts of multi-click tools (polygon, protractor), the inline text input and the context menu (the internal
 * clipboard lives in commands.ts). Kept in its own module so the studio viewport, the context menu and the tool
 * palette share it.
 */
import { reactive } from 'vue'
import type { Pt } from './geometry'

/** What a context menu was opened on. */
export type MenuTarget =
  | { kind: 'body' | 'pulley' | 'connector' | 'annotation'; id: string }
  | { kind: 'empty' }

/** Editor UI state (see the module header). */
export interface EditorUiState {
  /** Selected annotation (bodies, connectors and pulleys use `state.selection`; the two are exclusive). */
  annotationId: string | null
  /** Selected field region or liquid (26.55; edited in the scene tab; exclusive with the other selections). */
  regionId: string | null
  /** Vertices placed so far with the polygon tool (world, m). */
  polyDraft: Pt[]
  /** Points placed so far with the protractor: vertex, then the first arm. */
  angleDraft: Pt[]
  /** Bodies picked so far with the combine tool (26.52). */
  combineDraft: string[]
  /** Inline text input of the text tool (world anchor) or of an existing text annotation. */
  textInput: null | { at: Pt; text: string; editId: string | null }
  /** Open context menu: client position, world point and what was clicked. */
  menu: null | { x: number; y: number; world: Pt; target: MenuTarget }
  /** Short transient message under the tool hint (e.g. vertices dropped to keep a polygon convex). */
  notice: string
  /** Set when the view was panned with Space held, so releasing Space doesn't also toggle playback. */
  spacePanned: boolean
}

/** The shared editor UI state. */
export const editor = reactive<EditorUiState>({
  annotationId: null,
  regionId: null,
  polyDraft: [],
  angleDraft: [],
  combineDraft: [],
  textInput: null,
  menu: null,
  notice: '',
  spacePanned: false
})

let noticeTimer: ReturnType<typeof setTimeout> | null = null
/** Show a transient notice in the viewport hint area. */
export function notify(text: string, ms = 3200) {
  editor.notice = text
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { editor.notice = '' }, ms)
}

/** Drop the drafts of the multi-click tools. */
export function clearDrafts() {
  editor.polyDraft = []
  editor.angleDraft = []
  editor.combineDraft = []
}
