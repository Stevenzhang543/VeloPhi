/** 运行控制命令的接线：把 store 与运行时适配成 RunCommandPorts。
 * UI 只调用这里的函数，不得再自行拼接播放/单步/停止的顺序（§22.2）。 */
import { addEditorLog, editorState } from '../store/editor'
import { physicsState as state, stopPlayMode, toggleSimulation } from '../store/physics'
import { gameplayRuntime } from './gameplayRuntime'
import { t } from '../i18n'
import { executePause, executePlay, executeStep, executeStop, type PlayMode, type RunCommandPorts } from './runCommandSequence'

/** 允许宿主注入真正的物理就绪检查；默认视为已就绪。 */
// 默认就绪检查：等待 WASM 就绪且无错误。三处调用点据此行为一致，不再各自判断。
let ensurePhysicsHook: () => Promise<boolean> = /* 等待运行时并检查错误。 */ async () => {
  await state.world.wasmReady
  return !state.world.wasmError
}

/** 注入物理就绪检查，供需要等待 WASM 与资源的入口使用。 */
export function setEnsurePhysicsHook(hook: () => Promise<boolean>): void {
  ensurePhysicsHook = hook
}

/** 构造端口：`preflight` 由调用方提供，因为预检依赖各自的 UI 上下文。 */
function ports(preflight: () => boolean): RunCommandPorts {
  return {
    ensurePhysics: /* 调用注入的就绪检查。 */ () => ensurePhysicsHook(),
    preflight,
    setPlaying: /* 委托 store 切换播放状态。 */ playing => toggleSimulation(playing),
    beginSession: /* 启动游戏会话。 */ () => gameplayRuntime.beginSession(),
    stepOnce: /* 执行一个固定步。 */ () => gameplayRuntime.stepOnce(),
    stopSession: /* 结束游戏会话。 */ () => gameplayRuntime.stopSession(),
    stopPlayMode: /* 退出播放模式。 */ () => stopPlayMode(),
    playMode: /* 读取当前播放模式。 */ () => state.playMode as PlayMode,
    text: /* 读取本地化文案。 */ key => t(key),
    report: /* 更新状态栏。 */ status => { editorState.statusText = status },
    log: /* 追加编辑器日志。 */ message => addEditorLog(message, 'Physics'),
  }
}

/** 播放命令：必须通过就绪与预检。 */
export function playSimulation(preflight: () => boolean = /* 默认无预检失败。 */ () => true): Promise<boolean> {
  return executePlay(ports(preflight))
}

/** 暂停命令。 */
export function pauseSimulation(): boolean {
  return executePause(ports(/* 暂停不做预检。 */ () => true))
}

/** 单步命令。 */
export function stepSimulation(preflight: () => boolean = /* 默认无预检失败。 */ () => true): Promise<boolean> {
  return executeStep(ports(preflight))
}

/** 停止命令。 */
export function stopSimulation(): boolean {
  return executeStop(ports(/* 停止不做预检。 */ () => true))
}
