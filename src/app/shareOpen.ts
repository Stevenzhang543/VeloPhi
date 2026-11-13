/**
 * Opening and making share links in the app (26.63, D236; the format is in share.ts).
 */
import { tl } from '../i18n'
import { parseScene } from '../core/scene/io'
import { ask } from '../platform/ask'
import { state, loadScene, showToast, serializeCurrent } from './store'
import { setStudioMode } from './layout'
import type { StudioMode } from './layout'
import { buildShareLink, decodeShare, SHARE_PREFIX } from './share'
import { logEvent } from './trialLog'

/** True when the text looks like a share link. */
export function isShareLink(text: string): boolean { return text.includes(SHARE_PREFIX) || /^\s*[zu]1\.[A-Za-z0-9_-]{20,}/.test(text) }

/**
 * Open a share link (or its data). `confirm`: ask before replacing unsaved changes. Returns false when the text is no
 * link or cannot be read (a message says why).
 */
export async function openShared(input: string, confirm = true): Promise<boolean> {
  let shared
  try { shared = await decodeShare(input) } catch { showToast(tl('这个分享链接不完整或已损坏（可能在转发时被截断），请让对方改发场景文件'), true); return false }
  if (!shared) return false
  let parsed
  try { parsed = parseScene(shared.text) } catch (e) { showToast(tl('分享链接里的场景无法打开：{0}', [(e as Error).message]), true); return false }
  if (confirm && state.dirty && !(await ask(tl('当前场景有未保存的修改，确定打开分享的场景吗？')))) return false
  loadScene(parsed.scene, null)
  state.page = 'studio'
  if (shared.mode === 'build' || shared.mode === 'simulate' || shared.mode === 'analyze') setStudioMode(shared.mode as StudioMode)
  if (shared.play) state.pendingPlay = true
  logEvent('share.open', { bodies: parsed.scene.bodies.length })
  showToast(tl('已打开分享的场景“{0}”', [parsed.scene.name]))
  return true
}

/** The share link of the scene on screen. */
export function currentShareLink(o: { mode?: string | null; play?: boolean } = {}): Promise<string> { return buildShareLink(serializeCurrent(), o) }

/** At start: a share link in the address opens its scene (and leaves the address clean, so a reload keeps later edits). */
export async function openShareFromAddress(): Promise<boolean> {
  if (typeof location === 'undefined' || !location.hash.startsWith(SHARE_PREFIX)) return false
  const ok = await openShared(location.hash, false)
  try { history.replaceState(null, '', location.pathname + location.search) } catch { /* address only */ }
  return ok
}
