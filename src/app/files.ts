/** Document commands: new, open, save, save as. */
import { tl, semiSep } from '../i18n'
import { state, loadScene, showToast, serializeCurrent } from './store'
import { settings } from './settings'
import { emptyScene, addGround } from '../core/scene/build'
import { parseScene, SceneFileError } from '../core/scene/io'
import { openTextFile, saveFile, sceneFilter, isDesktop } from '../platform/files'

/** Start a new scene with a ground (asks first when there are unsaved changes). */
export function newScene() {
  if (state.dirty && !confirm(tl('当前场景有未保存的修改，确定新建吗？'))) return
  const s = emptyScene(tl('新场景'))
  addGround(s, { name: tl('地面'), top: 0, left: -6, right: 6, material: { muS: 1, muK: 1, restitution: 1 } })
  s.view = { center: { x: 0, y: 1.2 }, pixelsPerMeter: 110 }
  // The g of new scenes comes from the settings (each scene keeps its own g afterwards)
  s.settings.gravity = { x: 0, y: -settings.defaultGravity }
  loadScene(s, null)
  state.rightTab = 'inspect'
}

/** Open a scene file (asks first when there are unsaved changes). */
export async function openScene() {
  if (state.dirty && !confirm(tl('当前场景有未保存的修改，确定打开其他文件吗？'))) return
  try {
    const f = await openTextFile(sceneFilter())
    if (!f) return
    const { scene, warnings } = parseScene(f.text)
    loadScene(scene, f.name, f.path)
    if (warnings.length) showToast(warnings.join(semiSep()))
    else showToast(tl('已打开 {0}', [f.name]))
  } catch (e) {
    showToast(e instanceof SceneFileError ? tl('无法打开：{0}', [e.message]) : tl('打开失败：{0}', [(e as Error).message]), true)
  }
}

/** Save the scene; `asNew` always asks for a location (otherwise the desktop app reuses the current path). */
export async function saveScene(asNew = false) {
  try {
    const text = serializeCurrent()
    const base = (state.scene.name || tl('场景')).replace(/[\\/:*?"<>|]/g, '_')
    const path = await saveFile(text, state.fileName ?? `${base}.verity.json`, sceneFilter(), !asNew && isDesktop ? state.filePath : null)
    if (!path) return
    state.filePath = isDesktop ? path : null
    state.fileName = path.split(/[\\/]/).pop() ?? path
    state.dirty = false
    showToast(tl('已保存 {0}', [state.fileName]))
  } catch (e) {
    showToast(tl('保存失败：{0}', [(e as Error).message]), true)
  }
}
