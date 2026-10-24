<!-- 虚拟输入覆盖层：处理触摸和键盘按钮或摇杆输入，合并动作并负责释放。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, watch } from 'vue'
import { gameplayRuntime } from '../editor/gameplayRuntime'
import { automaticVirtualControls, deviceInputSettings, deviceRuntimeState, performHaptic, refreshDeviceCapabilities, type VirtualControlSettings } from '../runtime/deviceInput'
import { physicsState } from '../store/physics'
import { createVirtualControlsInputOwner, type VirtualControlsRuntime } from '../runtime/virtualControlsInputOwner'
import type { InputAction } from '../runtime/input'

const props = defineProps<{ runtime?: VirtualControlsRuntime; world?: object; inputActions?: readonly InputAction[] }>()

type VectorValue = { x: number; y: number }
const controlValues = reactive<Record<string, VectorValue>>({})
const pointerOwners = new Map<string, number>()
/* 26.43: the project's controls when it defines them; otherwise, on a touch screen, controls generated
 * from the input map (deviceInput.automaticVirtualControls), so web games are playable on iPad. */
const configured = computed(() => deviceInputSettings.virtualControlsEnabled && deviceInputSettings.virtualControls.length > 0)
const effectiveControls = computed<VirtualControlSettings[]>(() => configured.value ? deviceInputSettings.virtualControls : deviceInputSettings.automaticVirtualControls && deviceRuntimeState.capabilities.touch ? automaticVirtualControls(props.inputActions ?? physicsState.inputMap) : [])
const visible = computed(/** 检查虚拟输入开关、控件数量与当前设备显示策略。 */ () => effectiveControls.value.length > 0 && (!configured.value || deviceInputSettings.showVirtualControls === 'always' || deviceRuntimeState.capabilities.touch))
const actionKinds = computed(/** 将输入映射转换为动作名称到类型的查找表。 */ () => new Map((props.inputActions ?? physicsState.inputMap).map(/** 提取动作名称和类型作为映射条目。 */ action => [action.name, action.kind])))

/** 根据自定义、关闭或自动模式返回安全区边距。 */ function safeInsets() {
  return deviceInputSettings.safeAreaMode === 'custom' ? deviceInputSettings.customSafeArea : deviceInputSettings.safeAreaMode === 'off' ? { left: 0, top: 0, right: 0, bottom: 0 } : deviceRuntimeState.capabilities.safeArea
}
/** 根据尺寸、透明度、锚点和安全区生成控件定位样式。 */ function controlStyle(control: VirtualControlSettings): Record<string, string> {
  const safe = safeInsets(), style: Record<string, string> = { width: `${control.size}px`, height: `${control.size}px`, opacity: String(control.opacity) }
  if (control.anchor.endsWith('left')) style.left = `${safe.left + control.offsetX}px`
  else style.right = `${safe.right + control.offsetX}px`
  if (control.anchor.startsWith('top')) style.top = `${safe.top + control.offsetY}px`
  else style.bottom = `${safe.bottom + control.offsetY}px`
  return style
}
/** 读取控件当前向量，未记录时返回零向量。 */ function current(control: VirtualControlSettings): VectorValue { return controlValues[control.id] ?? { x: 0, y: 0 } }
/** Recompute through the captured input Owner of the selected Runtime. */ function recomputeAction(action: string): void { inputOwner.recomputeAction(action) }
/** 记录控件值并重新计算关联动作。 */ function setValue(control: VirtualControlSettings, value: VectorValue): void {
  controlValues[control.id] = value
  recomputeAction(control.action)
}
/** 按钮返回配置值；摇杆从指针位置计算方向及死区缩放值并反转纵轴。 */ function pointerValue(control: VirtualControlSettings, event: PointerEvent): VectorValue {
  if (control.kind === 'button') return { x: control.value, y: 0 }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const radius = Math.max(1, Math.min(rect.width, rect.height) / 2)
  let x = (event.clientX - (rect.left + rect.width / 2)) / radius
  let y = (event.clientY - (rect.top + rect.height / 2)) / radius
  const magnitude = Math.hypot(x, y)
  if (magnitude > 1) { x /= magnitude; y /= magnitude }
  if (magnitude < control.deadzone) return { x: 0, y: 0 }
  const scaled = Math.min(1, (magnitude - control.deadzone) / Math.max(1e-6, 1 - control.deadzone))
  return { x: x / Math.max(magnitude, 1e-6) * scaled, y: -y / Math.max(magnitude, 1e-6) * scaled }
}
/** 未占用控件捕获指针、设置初始输入并触发触觉反馈。 */ function begin(control: VirtualControlSettings, event: PointerEvent): void {
  if (pointerOwners.has(control.id)) return
  event.preventDefault()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  pointerOwners.set(control.id, event.pointerId)
  setValue(control, pointerValue(control, event))
  performHaptic(control.hapticMs)
}
/** 仅更新所属指针操纵的非按钮控件。 */ function move(control: VirtualControlSettings, event: PointerEvent): void {
  if (pointerOwners.get(control.id) !== event.pointerId || control.kind === 'button') return
  event.preventDefault(); setValue(control, pointerValue(control, event))
}
/** 所属指针结束或主动释放时清除占用并将输入归零。 */ function end(control: VirtualControlSettings, event?: PointerEvent): void {
  if (event && pointerOwners.get(control.id) !== event.pointerId) return
  pointerOwners.delete(control.id); setValue(control, { x: 0, y: 0 })
}
/** 把空格、回车或方向键映射为控件输入，并按规则触发触觉反馈。 */ function keyboard(control: VirtualControlSettings, event: KeyboardEvent, down: boolean): void {
  const key = event.key
  if (control.kind === 'button' && (key === ' ' || key === 'Enter')) { event.preventDefault(); setValue(control, down ? { x: control.value, y: 0 } : { x: 0, y: 0 }); if (down && !event.repeat) performHaptic(control.hapticMs); return }
  if (control.kind !== 'button' && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)) {
    event.preventDefault()
    const value = down ? { x: key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0, y: key === 'ArrowDown' ? -1 : key === 'ArrowUp' ? 1 : 0 } : { x: 0, y: 0 }
    setValue(control, value)
  }
}
/** Reset visuals and release only virtual actions set by this captured input Owner. */ function releaseAll(): void {
  for (const id of Object.keys(controlValues)) delete controlValues[id]
  pointerOwners.clear()
  inputOwner.releaseAll()
}
function bindInputOwner() {
  const runtime = props.runtime ?? gameplayRuntime
  return createVirtualControlsInputOwner(runtime, props.world ?? runtime.presentation.world, {
    controls: () => effectiveControls.value,
    current: control => controlValues[control.id] ?? { x: 0, y: 0 },
    actionKinds: () => actionKinds.value
  })
}
let inputOwner = bindInputOwner()
// A component's two props update together; bind only after the complete tuple is available.
watch(() => [props.runtime, props.world], () => { releaseAll(); inputOwner.dispose(); inputOwner = bindInputOwner() }, { flush: 'pre' })
watch(() => JSON.stringify(effectiveControls.value.map(control => [control.id, control.action])), releaseAll, { flush: 'sync' })
function releaseHidden(): void { if (document.hidden) releaseAll() }
/** 刷新设备能力与安全区信息。 */ function refresh(): void { refreshDeviceCapabilities() }

onMounted(/** 挂载时刷新能力并监听尺寸及方向变化。 */ () => { refresh(); window.addEventListener('resize', refresh, { passive: true }); window.addEventListener('orientationchange', refresh, { passive: true }); window.addEventListener('blur', releaseAll); window.addEventListener('pagehide', releaseAll); document.addEventListener('visibilitychange', releaseHidden) })
onBeforeUnmount(/** 卸载时释放输入并移除设备变化监听。 */ () => { releaseAll(); inputOwner.dispose(); window.removeEventListener('resize', refresh); window.removeEventListener('orientationchange', refresh); window.removeEventListener('blur', releaseAll); window.removeEventListener('pagehide', releaseAll); document.removeEventListener('visibilitychange', releaseHidden) })
</script>

<template>
  <div v-if="visible" class="virtual-controls" :style="{ '--safe-left': `${safeInsets().left}px`, '--safe-top': `${safeInsets().top}px`, '--safe-right': `${safeInsets().right}px`, '--safe-bottom': `${safeInsets().bottom}px` }" aria-label="Virtual controls">
    <div class="safe-area-outline" aria-hidden="true"></div>
    <button
      v-for="control in effectiveControls"
      :key="control.id"
      class="virtual-control"
      :class="[`kind-${control.kind}`, { active: Math.abs(current(control).x) > .001 || Math.abs(current(control).y) > .001 }]"
      :style="controlStyle(control)"
      :aria-label="control.accessibleLabel"
      :aria-keyshortcuts="control.kind === 'button' ? 'Enter Space' : 'ArrowUp ArrowDown ArrowLeft ArrowRight'"
      :aria-valuetext="control.kind === 'button' ? (current(control).x ? 'pressed' : 'released') : `x ${current(control).x.toFixed(2)}, y ${current(control).y.toFixed(2)}`"
      @pointerdown="begin(control, $event)"
      @pointermove="move(control, $event)"
      @pointerup="end(control, $event)"
      @pointercancel="end(control, $event)"
      @lostpointercapture="end(control)"
      @keydown="keyboard(control, $event, true)"
      @keyup="keyboard(control, $event, false)"
    >
      <span v-if="control.kind === 'button'" class="button-label">{{ control.label }}</span>
      <template v-else>
        <span class="direction-marker up">▲</span><span class="direction-marker right">▶</span><span class="direction-marker down">▼</span><span class="direction-marker left">◀</span>
        <i class="control-knob" :style="{ transform: `translate(calc(-50% + ${current(control).x * control.size * .28}px), calc(-50% - ${current(control).y * control.size * .28}px))` }"></i>
      </template>
    </button>
  </div>
</template>

<style scoped>
.virtual-controls{position:absolute;inset:0;z-index:6;pointer-events:none;touch-action:none;user-select:none;-webkit-user-select:none}.safe-area-outline{position:absolute;top:var(--safe-top);right:var(--safe-right);bottom:var(--safe-bottom);left:var(--safe-left);border:1px dashed rgba(126,183,255,.22);border-radius:12px;pointer-events:none}.virtual-control{position:absolute;display:grid;place-items:center;padding:0;overflow:hidden;border:1px solid rgba(203,225,255,.54);border-radius:50%;color:#f8fbff;background:radial-gradient(circle at 35% 28%,rgba(131,187,255,.46),rgba(31,72,124,.58));box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 8px 24px rgba(0,0,0,.25);backdrop-filter:blur(8px);pointer-events:auto;touch-action:none;transition:transform 120ms ease,filter 120ms ease,border-color 120ms ease}.virtual-control:focus-visible{outline:3px solid #fff;outline-offset:3px}.virtual-control.active{transform:scale(.96);filter:brightness(1.12);border-color:#fff}.kind-dpad{border-radius:28%}.button-label{max-width:82%;overflow:hidden;font:700 clamp(11px,2.2vw,15px)/1.15 var(--font-ui);text-overflow:ellipsis;text-shadow:0 1px 4px rgba(0,0,0,.45)}.control-knob{position:absolute;top:50%;left:50%;width:42%;height:42%;border:1px solid rgba(255,255,255,.68);border-radius:50%;background:rgba(238,247,255,.64);box-shadow:0 3px 10px rgba(0,0,0,.3);transition:transform 45ms linear}.direction-marker{position:absolute;color:rgba(255,255,255,.66);font-size:11px}.direction-marker.up{top:9%}.direction-marker.right{right:9%}.direction-marker.down{bottom:9%}.direction-marker.left{left:9%}@media (prefers-reduced-motion:reduce){.virtual-control,.control-knob{transition:none}}
</style>

