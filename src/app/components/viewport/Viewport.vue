<script setup lang="ts">
/**
 * Scene viewport. Two variants share the drawing code:
 *   studio   the editor: tools, drag-to-create, selection handles, grid snapping, measuring and annotation
 *            tools, context menu and editing shortcuts;
 *   monitor  the playback view of the render & monitor page: no editing tools (a click still selects what to
 *            watch), effects on, a larger time display.
 * During playback the recording is drawn at the continuous `state.time` through `renderFrame` (interpolated
 * states, motion blur, particles, trails); in edit mode the scene's initial state is drawn.
 *
 * A viewport never draws while its page is hidden (pages stay mounted; `usePageActive()` says whether ours is
 * shown, and a zero-size host also counts as hidden) and resizes and redraws as soon as it is shown again. It
 * does not even read its size while hidden (that would force layout of a content-visibility: hidden subtree).
 * Draw requests are coalesced into one per animation frame and a pending request is never cancelled.
 *
 * 26.64 (D289): this component only composes the modules of this folder (see state.ts for the list) and holds the
 * template; what it watches decides when the canvas is drawn again.
 */
import { tl } from '../../../i18n'
import { msgText } from '../../../i18n/locale'
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { state, problemLocked } from '../../store'
import { settings } from '../../settings'
import { TEXT_SIZE } from '../../../render/annotations'
import { editor, clearDrafts } from '../../editor/editorState'
import ContextMenu from '../ContextMenu.vue'
import Icon from '../Icon.vue'
import AnnotationTextInput from '../AnnotationTextInput.vue'
import { createViewport } from './state'
import { useDraw } from './draw'
import { useCamera, useStatusZoom } from './camera'
import { useSnap } from './snap'
import { useOverlays } from './overlays'
import { useMenu } from './menu'
import { useTools } from './tools'
import { useInput } from './input'
import { useHud, useLiveText } from './hud'

const props = withDefaults(defineProps<{ variant?: 'studio' | 'monitor' }>(), { variant: 'studio' })

const vp = createViewport(() => props.variant)
const { studio, pageActive, host, canvas, cam, hover, hotHandle, snapMark, snapGuides, cursor, editing } = vp
/** 26.60 (D205): the studio shows the time in its floating timeline (the canvas does not repeat it). */
const floatingTime = true

const painter = useDraw(vp, () => overlays.build())
const { requestDraw, visible } = painter
const camera = useCamera(vp, painter)
const { resize, fitView, maybeRefit } = camera
const snap = useSnap(vp)
const overlays = useOverlays(vp, painter, snap)
const { openMenu, menuItems, runMenu, textInputPos, commitText, cancelText } = useMenu(vp, camera)
const tools = useTools(vp, painter, camera, snap, overlays, openMenu)
const { draftBar, cancelDraft } = tools
const { onMouseDown, onMove, onUp, onLeave, onDblClick, onTouchStart, onTouchMove, onTouchEnd, onCanvasFocus, kbdFocus, attach, detach } = useInput(vp, painter, tools, openMenu)
const onWheel = camera.wheelZoom

let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(resize)
  if (host.value) ro.observe(host.value)
  resize()
  attach()
})
onBeforeUnmount(() => {
  ro?.disconnect()
  painter.stop() // Unmounting: nothing left to draw
  detach()
})

// Shown again: take the current size (it may have changed while hidden) and draw the current state
watch(pageActive, on => { if (on) { resize(); requestDraw() } })
watch(() => state.recording, () => { painter.resetEffects() })
watch(() => state.cameraRequest, () => fitView())
watch(() => [state.recording, state.stale], () => {
  if (state.fitPending && state.recording && !state.stale && visible()) {
    state.fitPending = false
    fitView()
    // 26.55: an unbounded run that has not yet reached the scene's former duration is fitted again when it has
    // (unless the view is moved or zoomed by hand in the meantime)
    const rec = state.recording
    vp.refitAt = rec.unbounded && (rec.frameCount - 1) * rec.dt < (state.scene.settings.legacyDuration ?? 0) ? state.scene.settings.legacyDuration : 0
  }
})
watch(() => [state.run.tComputed, state.recording, state.time], maybeRefit)
// 26.55 (D97): plain values are compared shallowly (a deep watch walked the whole list on every frame); the objects
// that change in place (display switches, selection, formula highlight) are watched deeply on their own
watch(() => [state.frame, state.time, state.recording, state.stale, state.playing, state.speed, state.theme, state.digits, state.pendingConnector, state.tool, hover.value, hotHandle.value, problemLocked(), state.rightTab], requestDraw)
watch(() => [state.selection, state.display, state.formulaHighlight], requestDraw, { deep: true })
watch(() => state.scene, requestDraw, { deep: true })
watch(settings, requestDraw, { deep: true })
watch(editor, requestDraw, { deep: true })
watch(() => state.selection, s => { if (s) { editor.annotationId = null; editor.regionId = null } })
watch(() => state.tool, () => { clearDrafts(); snapMark.value = null; snapGuides.value = [] })

defineExpose({ canvas, cam, fitView })

useStatusZoom(vp, camera)

const liveText = useLiveText()
const { timeText, toolHint, selectionHint, hintOnCanvas, flash } = useHud(vp, painter)
</script>

<template>
  <div ref="host" class="viewport" :class="[`v-${props.variant}`]">
    <canvas ref="canvas" :class="{ 'kbd-focus': kbdFocus }" :style="{ cursor }" tabindex="0" role="img" :aria-label="tl('场景画布：{0}', [state.scene.name])" @wheel="onWheel" @mousedown="onMouseDown" @mousemove="onMove" @mouseup="onUp" @mouseleave="onLeave" @dblclick="onDblClick" @contextmenu.prevent @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd" @touchcancel="onTouchEnd" @focus="onCanvasFocus" @blur="kbdFocus = false" />
    <div class="sr-only" aria-live="polite">{{ liveText }}</div>
    <div class="overlay top-left">
      <span v-if="timeText && studio && !floatingTime" class="time mono">{{ timeText }}</span>
      <span v-if="editing" class="badge warn">{{ studio ? tl('编辑中') : tl('未运行') }}{{ state.recording ? tl(' · 结果已过期') : '' }}</span>
      <span v-if="state.computing && !state.run.paused" class="badge info">{{ tl('计算中…') }}</span>
      <span v-if="state.simError" class="badge bad" :title="msgText(state.simError)">{{ msgText(state.simError) }}</span>
    </div>
    <div v-if="!studio && timeText" class="overlay hud mono">{{ timeText }}<span v-if="state.speed !== 1" class="speed">{{ state.speed }}×</span></div>
    <div v-if="((toolHint || selectionHint) && hintOnCanvas) || editor.notice" class="overlay hint-col">
      <div v-if="(toolHint || selectionHint) && hintOnCanvas" class="hint small">{{ toolHint || selectionHint }}</div>
      <div v-if="editor.notice" class="hint small notice">{{ editor.notice }}</div>
    </div>
    <div v-if="studio && draftBar" class="draft-bar" role="toolbar" :aria-label="draftBar.label">
      <span class="count">{{ draftBar.label }}</span>
      <button v-if="draftBar.undo" type="button" class="btn small" @click="draftBar.undo">{{ tl('撤回一点') }}</button>
      <button type="button" class="btn small" @click="cancelDraft">{{ tl('取消') }}</button>
      <button type="button" class="btn primary small" data-ui="draft-finish" :disabled="!draftBar.ready" @click="draftBar.finish">{{ draftBar.action }}</button>
    </div>
    <div v-if="flash" :key="flash.n" class="flash" aria-hidden="true"><Icon :name="flash.icon" :size="34" /></div>
    <div class="overlay bottom-right">
      <button class="btn icon ghost small" data-ui="fit-view" :title="`${tl('适合视图')} (0)`" :aria-label="tl('适合视图')" @click="fitView(true)"><Icon name="fit" :size="16" /></button>
    </div>
    <AnnotationTextInput v-if="studio && editor.textInput && textInputPos" :key="`${editor.textInput.editId ?? 'new'}:${editor.textInput.at.x},${editor.textInput.at.y}`"
      :x="textInputPos.x" :y="textInputPos.y" :text="editor.textInput.text" :size="TEXT_SIZE * (settings.projector ? 1.4 : 1)" @commit="commitText" @cancel="cancelText" />
    <ContextMenu v-if="studio && editor.menu && visible()" :x="editor.menu.x" :y="editor.menu.y" :items="menuItems" @pick="runMenu" @close="editor.menu = null" />
  </div>
</template>

<style scoped>
.viewport { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: var(--radius-pane); background: var(--canvas-bg); box-shadow: var(--shadow); }
canvas { display: block; touch-action: none; }
/* 26.60: no ring after a click (pressing Enter to finish a tool used to outline the whole canvas); only when reached with Tab */
canvas:focus, canvas:focus-visible { outline: none; }
canvas.kbd-focus:focus { outline: 2px solid var(--accent); outline-offset: -2px; }
/* Finishing a multi-click tool without a keyboard (26.60): picks, finish and cancel */
.draft-bar { position: absolute; left: 50%; bottom: calc(var(--float-bottom, 0px) + 14px); transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 14px; background: var(--pane); border-radius: 999px; box-shadow: var(--shadow); z-index: 4; white-space: nowrap; }
.draft-bar .count { color: var(--text-2); font-size: var(--type-small); }
.overlay { position: absolute; display: flex; gap: 6px; align-items: center; pointer-events: none; }
.overlay > * { pointer-events: auto; }
.top-left { top: 10px; left: 12px; }
.bottom-right { bottom: 8px; right: 8px; }
/* 26.60 (D205): the studio's timeline floats at the bottom — the fit button goes to the top right */
.v-studio .bottom-right { bottom: auto; top: 8px; }
/* 26.65 (D5): the fit button floats over the drawing (field lines, the grid): a solid backing, so nothing runs through it */
.bottom-right .btn { background: var(--pane); box-shadow: var(--elev-1); }
.bottom-right .btn:hover { background: var(--group); }
.hint-col { top: 10px; left: 50%; transform: translateX(-50%); flex-direction: column; max-width: 70%; }
.overlay.hint-col > * { pointer-events: none; user-select: none; }
.hint { background: var(--pane); padding: 4px 10px; border-radius: 999px; box-shadow: var(--shadow); color: var(--text-2); text-align: center; }
.hint.notice { color: var(--accent); }
.overlay .time, .overlay.hud { pointer-events: none; }
.flash { position: absolute; left: 50%; top: 46%; width: 84px; height: 84px; margin: -42px 0 0 -42px; border-radius: 50%; display: grid; place-items: center; background: rgba(20, 22, 26, 0.55); color: #fff; pointer-events: none; z-index: 5; animation: flash 540ms var(--ease-out) forwards; }
@keyframes flash { 0% { opacity: 0; transform: scale(0.7); } 22% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.22); } }
.time { font-size: 15px; font-weight: 600; background: var(--pane); padding: 2px 10px; border-radius: 8px; box-shadow: var(--shadow); }
.hud { top: 14px; right: 16px; font-size: 30px; font-weight: var(--weight-strong); letter-spacing: 0.01em; background: var(--pane); padding: 4px 16px; border-radius: 12px; box-shadow: var(--shadow); font-variant-numeric: tabular-nums; }
.hud .speed { font-size: 16px; font-weight: 600; color: var(--text-2); margin-left: 10px; }
</style>
