<!-- 仿真操作栏：管理物理加载、场景预检和播放会话。 -->
<template>
  <div class="actionbar" role="toolbar" :aria-label="t('play')" :data-play-mode="state.playMode">
    <UiButton class="play-button" :class="{ active: state.playMode === 'playing' }" :aria-label="t('play')" :aria-pressed="state.playMode === 'playing'" :label="t('play')" @click="playSimulation" icon="play" />
    <UiButton :class="{ active: state.playMode === 'paused' }" :disabled="state.playMode === 'editing'" :label="t('pause')" :aria-label="t('pause')" :aria-pressed="state.playMode === 'paused'" @click="pauseSimulation" icon="pause" />
    <UiButton class="step-button" :label="t('step')" :aria-label="t('step')" @click="stepSimulation" icon="step" />
    <UiButton :disabled="state.playMode === 'editing'" :aria-label="t('stop')" :label="t('stop')" @click="restoreSimulation" icon="stop" />
    <span class="mode-label" role="status"><i aria-hidden="true"></i>{{ t(state.playMode === 'playing' ? 'playMode' : state.playMode === 'paused' ? 'runtimePaused' : 'editingMode') }}</span>
  </div>
</template>

<script setup lang="ts">
import { t } from '../i18n'
import UiButton from '../ui/components/UiButton.vue'
import { addEditorLog, editorState } from '../store/editor'
import { physicsState as state } from '../store/physics'
import { simulationPreflight as inspectSimulationPreflight } from '../runtime/simulationAuthoring26'
import { playSimulation as runPlay, pauseSimulation as runPause, stepSimulation as runStep, stopSimulation as runStop, setEnsurePhysicsHook } from '../editor/runCommands'

/** 等待物理 WASM 初始化并显示状态；失败时报告原因并阻止启动。 */ async function ensurePhysics(): Promise<boolean> {
  editorState.statusText = t('physicsLoading')
  await state.world.wasmReady
  if (!state.world.wasmError) return true
  editorState.statusText = t('physicsUnavailable', { message: state.world.wasmError.message })
  return false
}

/** 检查仿真就绪情况，阻断问题禁止启动，需复核问题写入日志。 */ function simulationPreflight(): boolean {
  const { blocked, reviews } = inspectSimulationPreflight(state.world.entities, state.world.connections, state.globalSettings)
  if (blocked.length) {
    const summary = `${t('simulationReadiness')}: ${t('blocked')} (${blocked.length}) · ${blocked.map(/* 返回 issue.code 的当前值。 */ issue => issue.code).join(', ')}`
    editorState.statusText = summary
    addEditorLog(summary, 'Physics')
    return false
  }
  if (reviews.length) addEditorLog(`${t('simulationReadiness')}: ${t('mediaStatus_review')} (${reviews.length}) · ${reviews.map(/* 返回 issue.code 的当前值。 */ issue => issue.code).join(', ')}`, 'Physics')
  return true
}

// 播放/暂停/单步/停止的顺序由 editor/runCommands 唯一定义；此处只提供本界面的就绪与预检钩子，
// 不再自行拼接顺序（§22.2：一个命令一个处理器）。
/** 加载与预检通过后启动仿真和游戏会话。 */
async function playSimulation() {
  setEnsurePhysicsHook(ensurePhysics)
  const started = await runPlay(simulationPreflight)
  // 26.46: the Play button kept keyboard focus, and game input ignores keys aimed at a focused button, so
  // the first key presses after Play (lane keys, Jump …) were lost until the view was clicked.
  if (started && document.activeElement instanceof HTMLElement && document.activeElement.closest('.actionbar')) {
    const surface = document.querySelector<HTMLElement>('[data-game-input-surface]')
    if (surface) surface.focus({ preventScroll: true }); else document.activeElement.blur()
  }
}

/** 暂停仿真并记录状态。 */
function pauseSimulation() { runPause() }

/** 通过预检后执行一次游戏单步。 */
async function stepSimulation() { setEnsurePhysicsHook(ensurePhysics); await runStep(simulationPreflight) }

/** 停止会话并退出播放模式。 */
function restoreSimulation() { runStop() }
</script>

<style scoped>
.actionbar{
  flex:0 0 auto;min-width:max-content;display:flex;align-items:center;gap:1px;padding:2px;
  border-radius:calc(var(--radius-control) + 2px);background:var(--surface-inset);box-shadow:inset 0 0 0 var(--ui-border-width) var(--border-separator);
  transition:background-color var(--motion-standard) var(--ease-standard),box-shadow var(--motion-standard) var(--ease-standard);
}
.actionbar .ui-button{width:calc(var(--ui-control-height) - 2px);height:calc(var(--ui-control-height) - 4px);min-height:0;min-width:0;color:var(--text-secondary)}
.actionbar .ui-button:hover:not(:disabled){color:var(--text-primary)}
.actionbar .play-button{color:var(--success)}
/* 26.43 G1: Run is the one tinted primary action of the title bar; pause, step and stop stay plain. */
.actionbar[data-play-mode='editing'] .play-button,.actionbar[data-play-mode='paused'] .play-button{background:color-mix(in srgb,var(--success) 17%,transparent)}
.actionbar[data-play-mode='editing'] .play-button:hover:not(:disabled),.actionbar[data-play-mode='paused'] .play-button:hover:not(:disabled){background:color-mix(in srgb,var(--success) 28%,transparent);color:var(--success)}
.actionbar .ui-button.active{background:var(--surface-raised);color:var(--text-primary);box-shadow:var(--shadow-xs)}
.actionbar[data-play-mode='playing']{background:color-mix(in srgb,var(--success) 14%,var(--surface-inset));box-shadow:inset 0 0 0 var(--ui-border-width) color-mix(in srgb,var(--success) 40%,transparent)}
.actionbar[data-play-mode='playing'] .play-button{background:var(--success);color:#0c1a12}
.actionbar[data-play-mode='paused']{background:color-mix(in srgb,var(--warning) 14%,var(--surface-inset));box-shadow:inset 0 0 0 var(--ui-border-width) color-mix(in srgb,var(--warning) 40%,transparent)}
.mode-label{display:inline-flex;align-items:center;gap:var(--space-1);max-width:12ch;padding-inline:var(--space-2) var(--space-2);color:var(--text-muted);font-size:var(--type-caption);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mode-label i{inline-size:6px;block-size:6px;border-radius:50%;background:var(--text-tertiary);flex:none}
.actionbar[data-play-mode='playing'] .mode-label{color:var(--success)}
.actionbar[data-play-mode='playing'] .mode-label i{background:var(--success)}
.actionbar[data-play-mode='paused'] .mode-label{color:var(--warning)}
.actionbar[data-play-mode='paused'] .mode-label i{background:var(--warning)}
@media(max-width:1100px){.mode-label{position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%)}}
</style>
