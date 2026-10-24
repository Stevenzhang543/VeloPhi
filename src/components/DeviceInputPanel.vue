<!-- 设备输入面板：配置虚拟控件、设备能力和传感器输入。 -->
<script setup lang="ts">
import NumericExpressionInput from './NumericExpressionInput.vue'
import { computed, onActivated, onDeactivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { preferencesState } from '../store/preferences'
import { physicsState, pushHistory } from '../store/physics'
import { createInputBinding, normalizeInputMap, type InputDevice } from '../runtime/input'
import { gameplayRuntime } from '../editor/gameplayRuntime'
import { UI_DEVICE_PRESETS } from '../runtime/uiProduction'
import {
  applyOrientationPolicy, createVirtualControl, detachDeviceSensors, deviceInputSettings, deviceRuntimeState, deviceSensorState,
  performHaptic, refreshDeviceCapabilities, requestDeviceSensorPermission, type GamepadAxisCalibration, type VirtualControlKind, type VirtualControlSettings
} from '../runtime/deviceInput'

type Tab = 'preview' | 'virtual' | 'gamepad' | 'sensors'
const activeTab = ref<Tab>('preview'), presetIndex = ref(4), rotated = ref(false), connectedGamepads = ref<Gamepad[]>([])
const captureAction = ref(physicsState.inputMap[0]?.name ?? ''), captureStatus = ref(''), captureDeadline = ref(0)
type CaptureMode = 'logical-keyboard' | 'physical-keyboard' | 'gamepad'
const captureMode = ref<CaptureMode>('logical-keyboard')
let refreshTimer = 0, refreshFrame = 0, captureFrame = 0, gamepadSignature = ''
const words = {
  en: { title:'Devices & mobile input', subtitle:'Preview, remap, and test the exact runtime controls.', preview:'Preview', virtual:'Virtual controls', gamepad:'Gamepad', sensors:'Sensors', rotate:'Rotate', safe:'Safe area', dpi:'Reference DPI', enableVirtual:'Enable virtual controls', automaticVirtual:'Automatic touch controls', automaticVirtualHelp:'On touch screens, controls made from the input map when this project defines none (movement stick or arrows, up to three buttons).', visibility:'Visibility', touchOnly:'Touch devices', always:'Always preview', addControl:'Add control', noControls:'No virtual controls yet.', label:'Label', accessibleLabel:'Accessible name', action:'Action', kind:'Control', anchor:'Anchor', size:'Size', opacity:'Opacity', haptic:'Haptic', offsetXY:'Offset X / Y', remove:'Remove', connected:'Connected controllers', none:'No controller detected.', remap:'Capture binding', chooseAction:'Action to remap', inputSource:'Input source', logicalKeyboard:'Logical key (layout aware)', physicalKeyboard:'Physical key position', waiting:'Press the selected key or gamepad control…', calibration:'Axis calibration', addCalibration:'Add axis calibration', axis:'Axis', deviceId:'Device ID', minimum:'Minimum', center:'Center', maximum:'Maximum', deadzone:'Dead zone', invert:'Invert', penBindings:'Pen bindings', penTip:'Tip', penBarrel:'Barrel button', penEraser:'Eraser', penPressure:'Pressure', penTiltX:'Tilt X', penTiltY:'Tilt Y', penTwist:'Twist', orientation:'Orientation', auto:'Automatic', portrait:'Portrait', landscape:'Landscape', applyOrientation:'Apply orientation', enableSensors:'Enable motion sensors', sensorFrequency:'Sampling frequency (Hz)', requestPermission:'Request sensor permission', permission:'Permission', liveValues:'Live values', orientationValues:'Orientation β/γ/α', acceleration:'Acceleration', rotation:'Rotation rate', testHaptic:'Test haptic', saveHint:'Changes are stored with the project.', button:'Button', stick:'Stick', dpad:'D-pad', bottomLeft:'Bottom left', bottomRight:'Bottom right', topLeft:'Top left', topRight:'Top right', captured:'Binding captured', timeout:'Capture timed out', capability:'Host capability' },
  de: { title:'Geräte & mobile Eingabe', subtitle:'Laufzeitsteuerung exakt ansehen, neu belegen und testen.', preview:'Vorschau', virtual:'Virtuelle Steuerung', gamepad:'Gamepad', sensors:'Sensoren', rotate:'Drehen', safe:'Sicherer Bereich', dpi:'Referenz-DPI', enableVirtual:'Virtuelle Steuerung aktivieren', automaticVirtual:'Automatische Touch-Steuerung', automaticVirtualHelp:'Auf Touchscreens Steuerung aus der Eingabebelegung, wenn das Projekt keine eigene definiert (Bewegungsstick oder Pfeile, bis zu drei Tasten).', visibility:'Sichtbarkeit', touchOnly:'Touch-Geräte', always:'Immer anzeigen', addControl:'Steuerung hinzufügen', noControls:'Noch keine virtuelle Steuerung.', label:'Beschriftung', accessibleLabel:'Barrierefreier Name', action:'Aktion', kind:'Steuerung', anchor:'Anker', size:'Größe', opacity:'Deckkraft', haptic:'Haptik', offsetXY:'Versatz X / Y', remove:'Entfernen', connected:'Verbundene Controller', none:'Kein Controller erkannt.', remap:'Belegung erfassen', chooseAction:'Neu zu belegende Aktion', inputSource:'Eingabequelle', logicalKeyboard:'Logische Taste (Layout)', physicalKeyboard:'Physische Tastenposition', waiting:'Ausgewählte Taste oder Gamepad-Steuerung drücken…', calibration:'Achsenkalibrierung', addCalibration:'Achsenkalibrierung hinzufügen', axis:'Achse', deviceId:'Geräte-ID', minimum:'Minimum', center:'Mitte', maximum:'Maximum', deadzone:'Totzone', invert:'Umkehren', penBindings:'Stiftbelegungen', penTip:'Stiftspitze', penBarrel:'Seitentaste', penEraser:'Radierer', penPressure:'Druck', penTiltX:'Neigung X', penTiltY:'Neigung Y', penTwist:'Drehung', orientation:'Ausrichtung', auto:'Automatisch', portrait:'Hochformat', landscape:'Querformat', applyOrientation:'Ausrichtung anwenden', enableSensors:'Bewegungssensoren aktivieren', sensorFrequency:'Abtastrate (Hz)', requestPermission:'Sensorberechtigung anfragen', permission:'Berechtigung', liveValues:'Live-Werte', orientationValues:'Ausrichtung β/γ/α', acceleration:'Beschleunigung', rotation:'Drehrate', testHaptic:'Haptik testen', saveHint:'Änderungen werden im Projekt gespeichert.', button:'Taste', stick:'Stick', dpad:'Steuerkreuz', bottomLeft:'Unten links', bottomRight:'Unten rechts', topLeft:'Oben links', topRight:'Oben rechts', captured:'Belegung erfasst', timeout:'Erfassung abgelaufen', capability:'Host-Fähigkeit' },
  zh: { title:'设备与移动输入', subtitle:'预览、重新绑定并测试实际运行时控制。', preview:'设备预览', virtual:'虚拟控制', gamepad:'手柄', sensors:'传感器', rotate:'旋转', safe:'安全区域', dpi:'参考 DPI', enableVirtual:'启用虚拟控制', automaticVirtual:'自动触控控件', automaticVirtualHelp:'在触控屏上，若项目未定义虚拟控制，则按输入映射自动生成（移动摇杆或方向键，最多三个按钮）。', visibility:'显示条件', touchOnly:'仅触控设备', always:'始终预览', addControl:'添加控制', noControls:'尚无虚拟控制。', label:'标签', accessibleLabel:'无障碍名称', action:'动作', kind:'控件', anchor:'锚点', size:'大小', opacity:'不透明度', haptic:'触觉反馈', offsetXY:'X / Y 偏移', remove:'移除', connected:'已连接控制器', none:'未检测到控制器。', remap:'捕获绑定', chooseAction:'要重新绑定的动作', inputSource:'输入来源', logicalKeyboard:'逻辑按键（跟随布局）', physicalKeyboard:'物理按键位置', waiting:'请按下所选键盘或手柄控件…', calibration:'摇杆轴校准', addCalibration:'添加轴校准', axis:'轴', deviceId:'设备 ID', minimum:'最小值', center:'中心', maximum:'最大值', deadzone:'死区', invert:'反转', penBindings:'触控笔绑定', penTip:'笔尖', penBarrel:'侧键', penEraser:'橡皮擦', penPressure:'压力', penTiltX:'X 倾斜', penTiltY:'Y 倾斜', penTwist:'旋转', orientation:'方向', auto:'自动', portrait:'竖屏', landscape:'横屏', applyOrientation:'应用方向', enableSensors:'启用运动传感器', sensorFrequency:'采样频率（Hz）', requestPermission:'请求传感器权限', permission:'权限', liveValues:'实时数值', orientationValues:'方向 β/γ/α', acceleration:'加速度', rotation:'旋转速率', testHaptic:'测试触觉反馈', saveHint:'更改会随项目保存。', button:'按钮', stick:'摇杆', dpad:'方向键', bottomLeft:'左下', bottomRight:'右下', topLeft:'左上', topRight:'右上', captured:'已捕获绑定', timeout:'捕获已超时', capability:'主机能力' }
} as const
/* 返回 (words[preferencesState.locale] ?? words.en)[key] 的当前值。 */ function l(key: keyof typeof words.en): string { return (words[preferencesState.locale] ?? words.en)[key] }

const tabs = computed(/** 按当前语言生成预览、虚拟控件、手柄和传感器标签。 */ () => [{ id:'preview' as const,label:l('preview') },{ id:'virtual' as const,label:l('virtual') },{ id:'gamepad' as const,label:l('gamepad') },{ id:'sensors' as const,label:l('sensors') }])
const preset = computed(/* 当 UI_DEVICE_PRESETS[presetIndex.value] 为 null 或 undefined 时返回 UI_DEVICE_PRESETS[4]，否则保留左侧值。 */ () => UI_DEVICE_PRESETS[presetIndex.value] ?? UI_DEVICE_PRESETS[4])
const previewWidth = computed(/* 根据 rotated.value 的真假，分别返回 preset.value.height 或 preset.value.width。 */ () => rotated.value ? preset.value.height : preset.value.width)
const previewHeight = computed(/* 根据 rotated.value 的真假，分别返回 preset.value.width 或 preset.value.height。 */ () => rotated.value ? preset.value.width : preset.value.height)
const previewSafe = computed(/** 旋转预览时将安全区四边对应旋转，否则保留原预设。 */ () => rotated.value ? { left:preset.value.safeArea.top, top:preset.value.safeArea.right, right:preset.value.safeArea.bottom, bottom:preset.value.safeArea.left } : preset.value.safeArea)
const previewStyle = computed(/** 根据预览宽高生成比例和横竖屏显示宽度样式。 */ () => ({ aspectRatio:`${previewWidth.value}/${previewHeight.value}`, width: previewWidth.value > previewHeight.value ? 'min(100%,560px)' : 'min(62%,300px)' }))
const controlKinds: VirtualControlKind[] = ['button','stick','dpad']
const anchors = ['bottom-left','bottom-right','top-left','top-right'] as const
/** 将四角锚点映射为本地化名称。 */ function anchorLabel(anchor: typeof anchors[number]): string { return l(({ 'bottom-left':'bottomLeft', 'bottom-right':'bottomRight', 'top-left':'topLeft', 'top-right':'topRight' } as const)[anchor]) }
const calibrationDefaults = /** 构造通用设备轴零号的默认校准参数。 */ (): GamepadAxisCalibration => ({ deviceId:'*', axis:0, minimum:-1, center:0, maximum:1, deadzone:.12, invert:false })

/** 用传入标签记录设备输入配置历史。 */ function commit(label = 'Edit device input'): void { pushHistory(label) }
/** 优先选择向量动作创建摇杆，否则创建按钮，启用虚拟输入并记录历史。 */ function addControl(): void { const action = physicsState.inputMap.find(/* 比较 item.kind 与 'vector2'，返回严格相等的判断结果。 */ item => item.kind === 'vector2')?.name ?? physicsState.inputMap[0]?.name ?? 'Move'; deviceInputSettings.virtualControls.push(createVirtualControl(action, physicsState.inputMap.find(/* 比较 item.name 与 action，返回严格相等的判断结果。 */ item => item.name === action)?.kind === 'vector2' ? 'stick' : 'button', deviceInputSettings.virtualControls.length)); deviceInputSettings.virtualControlsEnabled = true; commit('Add virtual control') }
/** 移除控件前释放其关联虚拟动作，再记录历史。 */ function removeControl(index: number): void { const control = deviceInputSettings.virtualControls[index]; if (control) gameplayRuntime.input.releaseVirtualAction(control.action); deviceInputSettings.virtualControls.splice(index,1); commit('Remove virtual control') }
/** 清理无障碍标签并限制长度，空值回退控件标签或动作名称后记录历史。 */ function commitControl(control:VirtualControlSettings): void { control.accessibleLabel=control.accessibleLabel.trim().slice(0,160)||control.label.trim().slice(0,80)||control.action; commit() }
/** 未达到一百二十八项上限时添加默认手柄校准。 */ function addCalibration(): void { if (deviceInputSettings.gamepadCalibrations.length >= 128) return; deviceInputSettings.gamepadCalibrations.push(calibrationDefaults()); commit('Add gamepad calibration') }
/** 删除指定手柄校准项并记录历史。 */ function removeCalibration(index:number): void { deviceInputSettings.gamepadCalibrations.splice(index,1); commit('Remove gamepad calibration') }
/** 安全查询已连接手柄，最多返回十六项，接口缺失或异常返回空列表。 */ function availableGamepads(): Gamepad[] { try { return typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(/* 调用 Boolean(item && item.connected !== false) 并返回调用结果。 */ (item):item is Gamepad => Boolean(item && item.connected !== false)).slice(0,16) : [] } catch { return [] } }
/** 刷新设备能力，只有强制刷新或设备签名变化时更新响应式手柄列表。 */ function refreshDevices(force=false): void {
  refreshDeviceCapabilities()
  const next = availableGamepads(), signature = next.map(/** 组合手柄索引、标识、映射和连接状态生成变化签名。 */ pad=>`${pad.index}:${pad.id}:${pad.mapping}:${pad.connected}`).join('|')
  if (force || signature !== gamepadSignature) { gamepadSignature = signature; connectedGamepads.value = next }
}
/** 合并多次刷新请求为一个动画帧。 */ function scheduleDeviceRefresh(): void { if (refreshFrame) return; refreshFrame=requestAnimationFrame(/** 清除待执行帧标记并刷新设备信息。 */ ()=>{ refreshFrame=0; refreshDevices() }) }
const onGamepadChange = /* 调用 scheduleDeviceRefresh() 并返回调用结果。 */ (): void => scheduleDeviceRefresh()
const onViewportChange = /* 调用 scheduleDeviceRefresh() 并返回调用结果。 */ (): void => scheduleDeviceRefresh()
const onPanelVisibility = /** 页面可见时请求刷新，隐藏时停止捕获但保留状态提示。 */ (): void => { if (!document.hidden) scheduleDeviceRefresh(); else stopCapture(false) }
/** 将捕获设备与代码写入当前动作，按模式替换或追加绑定，归一化输入映射并记录历史后结束捕获。 */ function bindingCaptured(device:InputDevice, code:string, appendDistinct=false): void {
  const action = physicsState.inputMap.find(/* 比较 item.name 与 captureAction.value，返回严格相等的判断结果。 */ item => item.name === captureAction.value)
  if (!action) return stopCapture()
  const index = action.bindings.findIndex(/* 先计算 binding.device === device；仅当其为真值时求右侧 (!appendDistinct || binding.code === code)，返回短路求值结果。 */ binding => binding.device === device && (!appendDistinct || binding.code === code))
  const binding = createInputBinding(device, code)
  if (index >= 0) action.bindings.splice(index,1,binding); else action.bindings.push(binding)
  const normalized = normalizeInputMap(physicsState.inputMap); physicsState.inputMap.splice(0,physicsState.inputMap.length,...normalized)
  pushHistory('Remap input action'); captureStatus.value = `${l('captured')}: ${device} ${code}`; stopCapture(false)
}
/** Escape 取消捕获；键盘模式分别记录逻辑键名或物理键码，手柄模式忽略普通键。 */ function captureKey(event:KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); stopCapture(); return }
  if (captureMode.value === 'gamepad') return
  event.preventDefault()
  if (captureMode.value === 'logical-keyboard') bindingCaptured('keyboard', event.key)
  else if (captureMode.value === 'physical-keyboard') bindingCaptured('physical-key', event.code)
}
/** 在截止期限内逐帧查找超过阈值的手柄按钮或轴，捕获后结束，超时显示提示。 */ function pollGamepad(): void {
  if (!captureDeadline.value || captureMode.value !== 'gamepad') return
  if (performance.now() >= captureDeadline.value) { captureStatus.value = l('timeout'); stopCapture(false); return }
  for (const pad of availableGamepads()) {
    const button = pad.buttons.findIndex(/* 先计算 value.pressed；仅当其为假值时求右侧 value.value > .65，返回短路求值结果。 */ value => value.pressed || value.value > .65); if (button >= 0) { bindingCaptured('gamepad-button', String(button)); return }
    const axis = pad.axes.findIndex(/* 比较 Math.abs(value) 与 .7，返回大于的判断结果。 */ value => Math.abs(value) > .7); if (axis >= 0) { bindingCaptured('gamepad-axis', String(axis)); return }
  }
  captureFrame = requestAnimationFrame(pollGamepad)
}
/** 停止旧捕获，设十秒期限并监听按键，手柄模式同时启动轮询。 */ function beginCapture(): void { stopCapture(); captureStatus.value = l('waiting'); captureDeadline.value = performance.now()+10_000; window.addEventListener('keydown',captureKey,true); if(captureMode.value==='gamepad')captureFrame=requestAnimationFrame(pollGamepad) }
/** 移除捕获监听及待执行帧，重置期限并按参数决定是否清除提示。 */ function stopCapture(clear=true): void { window.removeEventListener('keydown',captureKey,true); if(captureFrame)cancelAnimationFrame(captureFrame); captureFrame=0; captureDeadline.value=0; if(clear)captureStatus.value='' }
/** 捕获笔设备绑定，保留不同代码的已有同类绑定。 */ function bindPen(device:'pen-button'|'pen-pressure'|'pen-tilt'|'pen-twist',code:string): void { bindingCaptured(device,code,true) }
/** 请求设备传感器权限。 */ async function sensorPermission(): Promise<void> { await requestDeviceSensorPermission() }
/** 尝试应用当前方向策略。 */ async function orient(): Promise<void> { await applyOrientationPolicy() }
/** 关闭运动传感器时解除监听，并记录配置历史。 */ function sensorsChanged(): void { if(!deviceInputSettings.motionSensorsEnabled)detachDeviceSensors(); commit() }

watch(activeTab,/** 进入手柄标签时安排一次设备刷新。 */ tab=>{ if(panelActive&&tab==='gamepad')scheduleDeviceRefresh() })
let panelActive = false
function activatePanel() {
  if (panelActive) return
  panelActive = true
  refreshDevices(true)
  window.addEventListener('gamepadconnected',onGamepadChange)
  window.addEventListener('gamepaddisconnected',onGamepadChange)
  window.addEventListener('resize',onViewportChange,{passive:true})
  window.addEventListener('orientationchange',onViewportChange,{passive:true})
  document.addEventListener('visibilitychange',onPanelVisibility)
  refreshTimer=window.setInterval(/** 仅在手柄标签且页面可见时执行周期设备刷新。 */ ()=>{ if(activeTab.value==='gamepad'&&!document.hidden)refreshDevices() },5_000)
 }
function deactivatePanel() {
  panelActive = false
  window.clearInterval(refreshTimer)
  if(refreshFrame)cancelAnimationFrame(refreshFrame); refreshFrame=0; refreshTimer=0
  window.removeEventListener('gamepadconnected',onGamepadChange)
  window.removeEventListener('gamepaddisconnected',onGamepadChange)
  window.removeEventListener('resize',onViewportChange)
  window.removeEventListener('orientationchange',onViewportChange)
  document.removeEventListener('visibilitychange',onPanelVisibility)
  stopCapture(); gameplayRuntime.input.releaseAllVirtualActions()
}
onMounted(activatePanel)
onActivated(activatePanel)
onDeactivated(deactivatePanel)
onBeforeUnmount(deactivatePanel)
</script>

<template>
  <section class="device-studio">
    <UiPanelHeader :title="l('title')" :description="l('subtitle')"><template #actions><span>{{ deviceRuntimeState.capabilities.orientation }} · {{ deviceRuntimeState.capabilities.devicePixelRatio.toFixed(2) }}×</span></template></UiPanelHeader>
    <UiTabs :aria-label="l('title')" :model-value="activeTab" :items="tabs" @update:model-value="activeTab = tabs.find(item => item.id === $event)?.id ?? activeTab" />
    <div v-if="activeTab==='preview'" class="page preview-page">
      <div class="toolbar"><select v-model.number="presetIndex" :aria-label="l('preview')"><option v-for="(item,index) in UI_DEVICE_PRESETS" :key="item.id" :value="index">{{ item.label }} · {{ item.width }}×{{ item.height }}</option></select><UiButton icon="reset" @click="rotated=!rotated">{{ l('rotate') }}</UiButton></div>
      <div class="device-frame" :class="{portrait:previewHeight>previewWidth}" :style="previewStyle">
        <div class="device-camera" aria-hidden="true"></div><div class="safe-frame" :style="{left:`${previewSafe.left/previewWidth*100}%`,right:`${previewSafe.right/previewWidth*100}%`,top:`${previewSafe.top/previewHeight*100}%`,bottom:`${previewSafe.bottom/previewHeight*100}%`}"><span>{{ l('safe') }}</span><i></i></div>
        <div class="target-sample">44 × 44</div>
      </div>
      <dl><div><dt>{{ l('dpi') }}</dt><dd>{{ preset.dpi }}×</dd></div><div><dt>{{ l('orientation') }}</dt><dd>{{ previewWidth>previewHeight?l('landscape'):l('portrait') }}</dd></div><div><dt>{{ l('safe') }}</dt><dd>{{ previewSafe.left }}/{{ previewSafe.top }}/{{ previewSafe.right }}/{{ previewSafe.bottom }}</dd></div></dl>
    </div>
    <div v-else-if="activeTab==='virtual'" class="page">
      <div class="setting-line"><span>{{ l('enableVirtual') }}</span><input v-model="deviceInputSettings.virtualControlsEnabled" type="checkbox" @change="commit()"></div>
      <div class="setting-line"><span>{{ l('automaticVirtual') }}<small class="setting-help">{{ l('automaticVirtualHelp') }}</small></span><input v-model="deviceInputSettings.automaticVirtualControls" type="checkbox" @change="commit()"></div>
      <div class="setting-line"><span>{{ l('visibility') }}</span><select v-model="deviceInputSettings.showVirtualControls" @change="commit()"><option value="touch-only">{{ l('touchOnly') }}</option><option value="always">{{ l('always') }}</option></select></div>
      <article v-for="(control,index) in deviceInputSettings.virtualControls" :key="control.id" class="control-card" @change="commitControl(control)">
        <header><strong>{{ control.label || control.action }}</strong><UiButton icon="clear" class="danger" @click="removeControl(index)">{{ l('remove') }}</UiButton></header>
        <div class="fields"><UiPropertyRow stacked :label="(l('label'))"><input v-model.trim="control.label" maxlength="80"></UiPropertyRow><UiPropertyRow stacked :label="(l('accessibleLabel'))"><input v-model.trim="control.accessibleLabel" maxlength="160" :placeholder="control.label||control.action"></UiPropertyRow><UiPropertyRow stacked :label="(l('action'))"><select v-model="control.action"><option v-for="action in physicsState.inputMap" :key="action.name">{{ action.name }}</option></select></UiPropertyRow><UiPropertyRow stacked :label="(l('kind'))"><select v-model="control.kind"><option v-for="kind in controlKinds" :key="kind" :value="kind">{{ l(kind) }}</option></select></UiPropertyRow><UiPropertyRow stacked :label="(l('anchor'))"><select v-model="control.anchor"><option v-for="anchor in anchors" :key="anchor" :value="anchor">{{ anchorLabel(anchor) }}</option></select></UiPropertyRow><UiPropertyRow stacked :label="(l('size'))"><NumericExpressionInput v-model="control.size" :minimum="40" :maximum="320" :resource-key="'device:virtual:' + control.id + ':control.size'" /></UiPropertyRow><UiPropertyRow stacked :label="(l('opacity'))"><NumericExpressionInput v-model="control.opacity" :minimum=".2" :maximum="1" :step=".05" :resource-key="'device:virtual:' + control.id + ':control.opacity'" /></UiPropertyRow><UiPropertyRow stacked :label="(l('haptic'))"><NumericExpressionInput v-model="control.hapticMs" :minimum="0" :maximum="100" :resource-key="'device:virtual:' + control.id + ':control.hapticMs'" /></UiPropertyRow><UiPropertyRow stacked :label="(l('offsetXY'))"><div class="pair"><NumericExpressionInput v-model="control.offsetX" :minimum="0" :maximum="2000" :resource-key="'device:virtual:' + control.id + ':control.offsetX'" /><NumericExpressionInput v-model="control.offsetY" :minimum="0" :maximum="2000" :resource-key="'device:virtual:' + control.id + ':control.offsetY'" /></div></UiPropertyRow></div>
      </article>
      <p v-if="!deviceInputSettings.virtualControls.length">{{ l('noControls') }}</p><UiButton icon="add" class="primary" @click="addControl">{{ l('addControl') }}</UiButton>
    </div>
    <div v-else-if="activeTab==='gamepad'" class="page">
      <h3>{{ l('connected') }}</h3><ul class="devices"><li v-for="pad in connectedGamepads" :key="pad.index"><strong>{{ pad.id }}</strong><span>#{{ pad.index }} · {{ pad.mapping || 'raw' }}</span></li></ul><p v-if="!connectedGamepads.length">{{ l('none') }}</p>
      <div class="capture"><UiPropertyRow stacked :label="(l('chooseAction'))"><select v-model="captureAction"><option v-for="action in physicsState.inputMap" :key="action.name">{{ action.name }}</option></select></UiPropertyRow><UiPropertyRow stacked :label="(l('inputSource'))"><select v-model="captureMode"><option value="logical-keyboard">{{ l('logicalKeyboard') }}</option><option value="physical-keyboard">{{ l('physicalKeyboard') }}</option><option value="gamepad">{{ l('gamepad') }}</option></select></UiPropertyRow><UiButton icon="pivot" :disabled="!captureAction" @click="beginCapture">{{ l('remap') }}</UiButton><output aria-live="polite">{{ captureStatus }}</output></div>
      <h3>{{ l('penBindings') }}</h3><div class="pen-bindings" role="group" :aria-label="l('penBindings')"><button :disabled="!captureAction" @click="bindPen('pen-button','tip')">{{ l('penTip') }}</button><button :disabled="!captureAction" @click="bindPen('pen-button','barrel')">{{ l('penBarrel') }}</button><button :disabled="!captureAction" @click="bindPen('pen-button','eraser')">{{ l('penEraser') }}</button><button :disabled="!captureAction" @click="bindPen('pen-pressure','pressure')">{{ l('penPressure') }}</button><button :disabled="!captureAction" @click="bindPen('pen-tilt','x')">{{ l('penTiltX') }}</button><button :disabled="!captureAction" @click="bindPen('pen-tilt','y')">{{ l('penTiltY') }}</button><button :disabled="!captureAction" @click="bindPen('pen-twist','twist')">{{ l('penTwist') }}</button></div>
      <h3>{{ l('calibration') }}</h3><article v-for="(item,index) in deviceInputSettings.gamepadCalibrations" :key="`${item.deviceId}:${item.axis}:${index}`" class="calibration" @change="commit()"><UiPropertyRow stacked :label="(l('deviceId'))"><input v-model.trim="item.deviceId"></UiPropertyRow><UiPropertyRow stacked :label="(l('axis'))"><NumericExpressionInput v-model="item.axis" :minimum="0" :maximum="63" :resource-key="'device:calibration:' + index + ':item.axis'" /></UiPropertyRow><UiPropertyRow stacked :label="(l('minimum'))"><NumericExpressionInput v-model="item.minimum" :minimum="-1" :maximum="1" :step=".01" :resource-key="'device:calibration:' + index + ':item.minimum'" /></UiPropertyRow><UiPropertyRow stacked :label="(l('center'))"><NumericExpressionInput v-model="item.center" :minimum="-1" :maximum="1" :step=".01" :resource-key="'device:calibration:' + index + ':item.center'" /></UiPropertyRow><UiPropertyRow stacked :label="(l('maximum'))"><NumericExpressionInput v-model="item.maximum" :minimum="-1" :maximum="1" :step=".01" :resource-key="'device:calibration:' + index + ':item.maximum'" /></UiPropertyRow><UiPropertyRow stacked :label="(l('deadzone'))"><NumericExpressionInput v-model="item.deadzone" :minimum="0" :maximum=".95" :step=".01" :resource-key="'device:calibration:' + index + ':item.deadzone'" /></UiPropertyRow><UiPropertyRow stacked :label="(l('invert'))" class="check"><input v-model="item.invert" type="checkbox"></UiPropertyRow><UiButton icon="clear" class="danger" @click="removeCalibration(index)" :label="l('remove')" /></article><UiButton icon="add" @click="addCalibration">{{ l('addCalibration') }}</UiButton>
    </div>
    <div v-else class="page">
      <div class="setting-line"><span>{{ l('orientation') }}</span><select v-model="deviceInputSettings.orientation" @change="commit()"><option value="auto">{{ l('auto') }}</option><option value="portrait">{{ l('portrait') }}</option><option value="landscape">{{ l('landscape') }}</option></select><button @click="orient">{{ l('applyOrientation') }}</button></div>
      <div class="setting-line"><span>{{ l('enableSensors') }}</span><input v-model="deviceInputSettings.motionSensorsEnabled" type="checkbox" @change="sensorsChanged"><button :disabled="!deviceInputSettings.motionSensorsEnabled" @click="sensorPermission">{{ l('requestPermission') }}</button></div>
      <UiPropertyRow stacked :label="(l('sensorFrequency'))" class="frequency"><NumericExpressionInput v-model="deviceInputSettings.sensorFrequency" :minimum="1" :maximum="120" :step="1" @change="commit()" :resource-key="'device:deviceInputSettings.sensorFrequency'" /></UiPropertyRow>
<!-- 传感器数值格式化回调分别将方向和旋转显示为一位小数、加速度显示为两位小数。 -->      <dl><div><dt>{{ l('permission') }}</dt><dd>{{ deviceSensorState.permission }}</dd></div><div><dt>{{ l('capability') }}</dt><dd>{{ deviceRuntimeState.capabilities.motionSensors?'✓':'—' }}</dd></div><div><dt>{{ l('orientationValues') }}</dt><dd>{{ deviceSensorState.orientation.map(v=>v.toFixed(1)).join(' / ') }}</dd></div><div><dt>{{ l('acceleration') }}</dt><dd>{{ deviceSensorState.acceleration.map(v=>v.toFixed(2)).join(' / ') }}</dd></div><div><dt>{{ l('rotation') }}</dt><dd>{{ deviceSensorState.rotationRate.map(v=>v.toFixed(1)).join(' / ') }}</dd></div></dl>
      <UiButton icon="audio" @click="performHaptic(18)">{{ l('testHaptic') }}</UiButton><p class="hint">{{ l('saveHint') }}</p><p v-if="deviceRuntimeState.lastError" class="error" role="alert">{{ deviceRuntimeState.lastError }}</p>
    </div>
  </section>
</template>

<style scoped>
.device-studio{grid-column:1/-1;min-width:0;overflow:hidden;border:1px solid var(--border-subtle);background:var(--surface-1)}.device-studio>header{min-height:58px;padding:var(--space-2) var(--space-3);display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);border-bottom:1px solid var(--border-subtle)}.device-studio>header div{min-width:0}.device-studio>header p{margin:var(--space-0) 0 0;color:var(--text-muted)}.device-studio>header>span{color:var(--accent);white-space:nowrap}.device-studio>nav{padding:var(--space-1);display:flex;gap:var(--space-1);overflow-x:auto;border-bottom:1px solid var(--border-subtle);background:var(--surface-2)}.page{padding:var(--space-3);display:grid;gap:var(--space-2)}.toolbar,.setting-line,.capture{display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap}.setting-line>span{min-width:170px;flex:1}.preview-page{justify-items:center}.toolbar{width:100%;justify-content:center}.device-frame{position:relative;max-height:390px;overflow:hidden;border:8px solid var(--surface-3);transition:none}.device-camera{position:absolute;z-index:2;top:7px;left:50%;width:min(26%,100px);height:8px;transform:translateX(-50%);background:rgba(0,0,0,.62)}.safe-frame{position:absolute;border:1px dashed #74b4ff}.safe-frame span{position:absolute;top:4px;left:6px;color:#9ac8ff}.safe-frame i{position:absolute;inset:50% auto auto 50%;width:44px;height:44px;transform:translate(-50%,-50%);border:1px solid rgba(255,255,255,.6)}.target-sample{position:absolute;right:10px;bottom:10px;width:44px;height:44px;display:grid;place-items:center;color:#fff;background:#397dd3}.page dl{width:100%;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:var(--space-1)}.page dl div{padding:var(--space-2);border:1px solid var(--border-subtle);background:var(--surface-2)}.page dt{color:var(--text-muted)}.page dd{margin:var(--space-0) 0 0;overflow-wrap:anywhere}.control-card{padding:var(--space-2);border:1px solid var(--border-subtle);background:var(--surface-2)}.control-card>header{display:flex;align-items:center;justify-content:space-between;gap:var(--ui-control-gap);margin-block-end:var(--ui-heading-content-gap)}.fields,.calibration{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--ui-field-width)),1fr));gap:var(--ui-field-gap) var(--ui-control-gap)}.pair{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-1)}.devices{margin:0;padding:0;display:grid;gap:var(--space-1);list-style:none}.devices li{padding:var(--space-2) var(--space-2);display:flex;justify-content:space-between;gap:var(--space-2);background:var(--surface-2)}.devices strong{max-width:72%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.devices span{color:var(--text-muted)}.capture{padding:var(--space-2);border:1px solid var(--border-subtle)}.capture output{width:100%;color:var(--accent)}.calibration{padding:var(--space-2);border:1px solid var(--border-subtle)}.calibration .check{justify-content:flex-end;align-items:center}.hint{color:var(--text-muted)}.error{color:var(--danger)}h3{margin:var(--space-1) 0 0}@media(max-width:680px){.page{padding:var(--space-2)}.setting-line>span{min-width:100%;}.device-studio>header>span{display:none}}@media(prefers-reduced-motion:reduce){.device-frame{transition:none}}
.frequency{width:min(var(--ui-field-width),100%);min-width:0;display:flex;flex-direction:column;gap:var(--ui-label-control-gap);color:var(--text-secondary)}.pen-bindings{display:grid;grid-template-columns:repeat(auto-fit,minmax(116px,1fr));gap:var(--space-1)}@media(max-width:680px){.fields,.calibration{grid-template-columns:1fr}}
.setting-help{display:block;color:var(--text-muted);font-size:var(--type-caption);max-width:46ch}
</style>
