<script setup lang="ts">
/**
 * Settings page: every application preference, grouped in sections with their own "restore defaults".
 * Changes apply immediately and are saved locally. Values that are physical quantities are entered in display
 * units like everywhere else (the stored settings stay SI).
 */
import { tl, paren } from '../../i18n'
import { computed, provide, ref, watch } from 'vue'
import { applyLookAhead, applyMemoryBudget, state } from '../store'
import type { DisplayToggle } from '../settings'
import { applyUnitPreset, effectiveEffects, fmtQ, resetSettings, settings, sysEnv, texQ, unitLabel } from '../settings'
import { clearTrialLog, exportTrialLog, logEvent, trialLogSize } from '../trialLog'
import { showToast } from '../store'
import type { SettingsSection, ThemeMode, EffectQuality } from '../settings'
import { KINDS, PRESETS, presetChoice } from '../../units/units'
import type { UnitKind } from '../../units/units'
import { SHORTCUTS } from '../shortcuts'
import NumField from './NumField.vue'
import Icon from './Icon.vue'
import Tex from './Tex.vue'
import AboutContent from './AboutContent.vue'
import { PAGE_ACTIVE } from '../live'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
provide(PAGE_ACTIVE, computed(() => props.active))

type SectionId = SettingsSection | 'keys' | 'about'
const SECTIONS: Array<{ id: SectionId; label: string; icon: string; desc: string }> = [
  { id: 'general', label: tl('通用'), icon: 'settings', desc: tl('外观、界面缩放、自动重算与新场景的默认值。') },
  { id: 'units', label: tl('单位与数值'), icon: 'ruler', desc: tl('所有面板、曲线、公式代入、导出都按这里的单位显示；内部计算始终使用国际单位。') },
  { id: 'display', label: tl('显示'), icon: 'display', desc: tl('画布上默认叠加的内容，以及适合教室投影的投影仪模式。') },
  { id: 'effects', label: tl('视觉效果'), icon: 'sparkle', desc: tl('玻璃质感、动态背景、运动模糊、粒子与拖尾。配置较低的电脑或投影时可降低或关闭。') },
  { id: 'editor', label: tl('编辑'), icon: 'pen', desc: tl('在画布上放置和拖动物体时的吸附。') },
  { id: 'sim', label: tl('仿真'), icon: 'cpu', desc: tl('计算方式与时间上限。结果与计算方式无关，同一场景逐位一致。') },
  { id: 'export', label: tl('导出'), icon: 'export', desc: tl('视频、图片与 CSV 数据的默认格式。') },
  { id: 'keys', label: tl('快捷键'), icon: 'keyboard', desc: tl('全部键盘与鼠标操作。') },
  { id: 'privacy', label: tl('隐私与试用'), icon: 'shield', desc: tl('本地操作日志（试用期间可选）。') },
  { id: 'about', label: tl('关于'), icon: 'info', desc: '' }
]
const current = ref<SectionId>('general')
const section = computed(() => SECTIONS.find(s => s.id === current.value)!)
const resettable = computed(() => current.value !== 'keys' && current.value !== 'about')
function reset() { if (resettable.value) resetSettings(current.value as SettingsSection) }

// ---- General ----
const THEMES: Array<{ id: ThemeMode; label: string; icon: string }> = [
  { id: 'system', label: tl('跟随系统'), icon: 'display' }, { id: 'light', label: tl('浅色'), icon: 'sun' }, { id: 'dark', label: tl('深色'), icon: 'moon' }
]
const G_PRESETS = [{ v: 9.8, label: '9.8' }, { v: 9.80665, label: tl('9.80665（标准）') }, { v: 10, label: '10' }, { v: 1.62, label: tl('1.62（月面）') }]

// ---- Units ----
const presetLabel = computed(() => {
  const match = PRESETS.find(p => KINDS.every(k => presetChoice(p.id)[k.kind] === settings.units[k.kind]))
  return match?.id ?? 'custom'
})
function setKind(kind: UnitKind, id: string) {
  settings.units[kind] = id
  settings.unitPreset = presetLabel.value
}
const PREVIEW: Array<{ label: string; v: number; unit: string }> = [
  { label: tl('位移'), v: 1.25, unit: 'm' }, { label: tl('质量'), v: 0.25, unit: 'kg' }, { label: tl('时间'), v: 0.75, unit: 's' },
  { label: tl('速度'), v: 3.6, unit: 'm/s' }, { label: tl('加速度'), v: 9.8, unit: 'm/s²' }, { label: tl('力'), v: 2.45, unit: 'N' },
  { label: tl('能量'), v: 0.30625, unit: 'J' }, { label: tl('动量'), v: 0.9, unit: 'kg·m/s' }, { label: tl('角度'), v: Math.PI / 6, unit: 'rad' },
  { label: tl('角速度'), v: 2 * Math.PI, unit: 'rad/s' }, { label: tl('劲度系数'), v: 50, unit: 'N/m' }, { label: tl('转动惯量'), v: 0.0125, unit: 'kg·m²' }
]
const previewTex = computed(() => `a = g\\sin\\theta = ${texQ(9.8, 'm/s²')} \\times \\sin ${texQ(Math.PI / 6, 'rad')} = ${texQ(4.9, 'm/s²')}`)

// ---- Display ----
const OVERLAYS: Array<{ key: DisplayToggle; label: string; hint: string }> = [
  { key: 'velocity', label: tl('速度矢量'), hint: tl('运动物体质心处的速度箭头') },
  { key: 'acceleration', label: tl('加速度矢量'), hint: '' },
  { key: 'forces', label: tl('受力'), hint: tl('运行后显示所选物体的受力') },
  { key: 'forcesAll', label: tl('所有物体的受力'), hint: tl('同时显示每个物体的受力（需打开“受力”）') },
  { key: 'trajectory', label: tl('轨迹'), hint: tl('质心轨迹') },
  { key: 'labels', label: tl('关键时刻'), hint: tl('在画面上标注碰撞、共速等时刻') },
  { key: 'strobe', label: tl('频闪照片'), hint: tl('按固定时间间隔叠加物体此前的位置（导出图片与视频时一并绘出）') },
  { key: 'grid', label: tl('网格与比例尺'), hint: '' },
  { key: 'axes', label: tl('坐标轴'), hint: '' },
  { key: 'names', label: tl('物体名称'), hint: '' }
]

// ---- Effects ----
const QUALITIES: Array<{ id: EffectQuality; label: string }> = [{ id: 'off', label: tl('关闭') }, { id: 'standard', label: tl('标准') }, { id: 'high', label: tl('高') }]
const fxOff = computed(() => settings.effects.quality === 'off')
const eff = computed(() => effectiveEffects())
const shutterDeg = computed(() => Math.round(settings.effects.shutter * 360))

// ---- Editor and export ----
const ANGLE_SNAPS = [0, 5, 10, 15, 30, 45]
const FPS = [24, 25, 30, 50, 60]
const SCALES = [1, 1.5, 2]
const BITRATES = [{ v: 0, label: tl('自动') }, { v: 4e6, label: '4 Mbps' }, { v: 8e6, label: '8 Mbps' }, { v: 16e6, label: '16 Mbps' }, { v: 32e6, label: '32 Mbps' }]
const csvClash = computed(() => settings.export.csvSeparator === ',' && settings.export.csvDecimal === ',')

// ---- Trial log ----
const logCount = ref(0)
const refreshCount = () => { try { logCount.value = trialLogSize() } catch { logCount.value = 0 } }
watch(current, s => {
  if (s === 'privacy') refreshCount()
  logEvent('settings.section', { section: s })
})
const busy = ref(false)
async function exportLog() {
  if (busy.value) return
  busy.value = true
  try {
    const name = await exportTrialLog()
    if (name) showToast(tl('已导出 {0}', [name]))
  } catch (e) {
    showToast(tl('导出失败：{0}', [(e as Error).message]), true)
  } finally { busy.value = false }
}
function clearLog() {
  if (!confirm(tl('清除本机保存的全部操作日志？此操作不能撤销。'))) return
  clearTrialLog()
  refreshCount()
  showToast(tl('操作日志已清除'))
}
function resetAll() { if (confirm(tl('将所有设置恢复为默认值？场景文件不受影响。'))) resetSettings() }
</script>

<template>
  <div class="settings-page">
    <nav class="pane snav" :aria-label="tl('设置分区')">
      <div class="pane-header">{{ tl('设置') }}</div>
      <div class="nav-list">
        <button v-for="s in SECTIONS" :key="s.id" class="nav-item" :class="{ on: current === s.id }" :aria-current="current === s.id ? 'page' : undefined" @click="current = s.id">
          <span class="nav-icon"><Icon :name="s.icon" :size="15" /></span>{{ s.label }}
        </button>
      </div>
      <div class="nav-foot tiny muted">{{ tl('设置保存在本机，不随场景文件保存。') }}<button class="link" @click="resetAll">{{ tl('全部恢复默认') }}</button></div>
    </nav>

    <section class="pane scontent">
      <div class="content">
        <header class="shead">
          <div>
            <h2>{{ section.label }}</h2>
            <p v-if="section.desc" class="small muted">{{ section.desc }}</p>
          </div>
          <button v-if="resettable" class="btn ghost small" :title="tl('只恢复本页的设置')" @click="reset">{{ tl('恢复默认') }}</button>
        </header>

        <!-- ---- General ---- -->
        <template v-if="current === 'general'">
          <div class="sgroup">
            <div class="srow"><div class="sl"><b>{{ tl('语言') }} · Language · Sprache</b><span>{{ tl('界面、公式说明、事件与导出内容的语言；场景文件与语言无关。') }}</span></div>
              <div class="sc"><select v-model="settings.language" :aria-label="tl('语言')"><option value="auto">{{ tl('跟随系统') }}</option><option value="zh">{{ tl('简体中文') }}</option><option value="en">English</option><option value="de">Deutsch</option></select></div>
            </div>
            <div class="srow"><div class="sl"><b>{{ tl('外观') }}</b><span>{{ tl('浅色适合投影；“跟随系统”会随系统的深浅色实时切换。') }}</span></div>
              <div class="segmented"><button v-for="t in THEMES" :key="t.id" :class="{ on: settings.themeMode === t.id }" @click="settings.themeMode = t.id"><Icon :name="t.icon" :size="14" />{{ t.label }}</button></div>
            </div>
            <div class="srow"><div class="sl"><b>{{ tl('界面缩放') }}</b><span>{{ tl('文字与控件的大小（不影响画布的物理比例）。') }}</span></div>
              <div class="sc range"><input v-model.number="settings.uiScale" type="range" min="0.85" max="1.4" step="0.05" :aria-label="tl('界面缩放')" /><span class="mono val">{{ Math.round(settings.uiScale * 100) }}%</span></div>
            </div>
            <div class="srow"><div class="sl"><b>{{ tl('自动重算') }}</b><span>{{ tl('修改场景后自动重新计算。') }}</span></div><input v-model="settings.autoRun" type="checkbox" class="switch" /></div>
          </div>
          <div class="sgroup">
            <div class="srow"><div class="sl"><b>{{ tl('新场景的重力加速度 g') }}</b><span>{{ tl('用于新建场景和模板的初值；已有场景保留各自的 g（在“场景”页修改）。') }}</span></div>
              <div class="sc"><NumField :model-value="settings.defaultGravity" unit="m/s²" :min="0" :max="1000" width="150px" @update:model-value="v => (settings.defaultGravity = v)" /></div>
            </div>
            <div class="srow chips"><span class="tiny muted">{{ tl('常用：') }}</span><button v-for="g in G_PRESETS" :key="g.v" class="btn small" :class="{ active: settings.defaultGravity === g.v }" @click="settings.defaultGravity = g.v">{{ g.label }} m/s²</button></div>
          </div>
        </template>

        <!-- ---- Units and numbers ---- -->
        <template v-else-if="current === 'units'">
          <div class="sgroup">
            <div class="srow"><div class="sl"><b>{{ tl('预设') }}</b><span>{{ tl('选择预设后仍可逐项调整。') }}</span></div>
              <select class="field" :value="presetLabel" @change="applyUnitPreset(($event.target as HTMLSelectElement).value)">
                <option v-for="p in PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
                <option v-if="presetLabel === 'custom'" value="custom" disabled>{{ tl('自定义') }}</option>
              </select>
            </div>
            <div class="kinds">
              <label v-for="k in KINDS" :key="k.kind" class="kind">
                <span class="small">{{ k.label }}</span>
                <select class="field" :value="settings.units[k.kind]" :disabled="k.options.length < 2" @change="setKind(k.kind, ($event.target as HTMLSelectElement).value)">
                  <option v-for="o in k.options" :key="o.id" :value="o.id">{{ o.label }}</option>
                </select>
              </label>
            </div>
          </div>
          <div class="sgroup">
            <div class="srow"><div class="sl"><b>{{ tl('有效数字') }}</b><span>{{ tl('读数、公式代入与曲线图例的位数（3–12）。') }}</span></div>
              <div class="sc range"><input v-model.number="state.digits" type="range" min="3" max="12" step="1" :aria-label="tl('有效数字')" /><span class="mono val">{{ tl('{0} 位', [state.digits]) }}</span></div>
            </div>
          </div>
          <div class="sgroup preview">
            <div class="tiny muted ptitle">{{ tl('实时预览（国际单位 → 当前显示）') }}</div>
            <div class="pgrid">
              <div v-for="p in PREVIEW" :key="p.label" class="pitem"><span class="tiny muted">{{ p.label }}</span><span class="mono small">{{ fmtQ(p.v, p.unit, state.digits) }}</span></div>
            </div>
            <div class="pformula"><Tex :tex="previewTex" display /></div>
          </div>
        </template>

        <!-- ---- Display ---- -->
        <template v-else-if="current === 'display'">
          <div class="sgroup">
            <div class="tiny muted ptitle">{{ tl('默认叠加（顶栏的“显示”也会修改这些选项）') }}</div>
            <div v-for="o in OVERLAYS" :key="o.key" class="srow"><div class="sl"><b>{{ o.label }}</b><span v-if="o.hint">{{ o.hint }}</span></div><input v-model="settings.display[o.key]" type="checkbox" class="switch" :disabled="o.key === 'forcesAll' && !settings.display.forces" /></div>
          </div>
          <div class="sgroup">
            <div class="tiny muted ptitle">{{ tl('频闪照片') }}</div>
            <div class="srow"><div class="sl"><b>{{ tl('闪光间隔 τ') }}</b><span>{{ tl('相邻两张像的时间间隔。') }}</span></div>
              <div class="sc"><NumField :model-value="settings.display.strobeInterval" :label="unitLabel('s')" :min="0.005" :max="10" :step="0.05" width="130px" @update:model-value="v => (settings.display.strobeInterval = v)" /></div>
            </div>
            <div class="srow"><div class="sl"><b>{{ tl('张数 N') }}</b><span>{{ tl('当前时刻之前显示的像的数目（最多 60）。') }}</span></div>
              <div class="sc"><NumField :model-value="settings.display.strobeCount" :label="tl('张')" :min="1" :max="60" :step="1" width="130px" @update:model-value="v => (settings.display.strobeCount = Math.round(v))" /></div>
            </div>
            <div class="srow"><div class="sl"><b>{{ tl('不透明度') }}</b><span>{{ tl('最近一张像的不透明度，越早的像越淡。') }}</span></div>
              <div class="sc"><input v-model.number="settings.display.strobeOpacity" type="range" min="0.1" max="1" step="0.05" /></div>
            </div>
            <div class="srow"><div class="sl"><b>{{ tl('标注时刻') }}</b><span>{{ tl('在每张像旁写出它的时刻。') }}</span></div><input v-model="settings.display.strobeLabels" type="checkbox" class="switch" /></div>
          </div>
          <div class="sgroup">
            <div class="srow"><div class="sl"><b>{{ tl('投影仪模式') }}</b><span>{{ tl('更大的字号、更粗的线条与更高的对比度，关闭半透明效果，适合教室投影。') }}</span></div><input v-model="settings.projector" type="checkbox" class="switch" /></div>
          </div>
        </template>

        <!-- ---- Visual effects ---- -->
        <template v-else-if="current === 'effects'">
          <div class="sgroup">
            <div class="srow"><div class="sl"><b>{{ tl('效果质量') }}</b><span>{{ tl('“关闭”停用下面全部效果；“高”使背景连续流动、模糊更细腻。') }}</span></div>
              <div class="segmented"><button v-for="q in QUALITIES" :key="q.id" :class="{ on: settings.effects.quality === q.id }" @click="settings.effects.quality = q.id">{{ q.label }}</button></div>
            </div>
          </div>
          <div class="sgroup" :class="{ dim: fxOff }">
            <div class="srow"><div class="sl"><b>{{ tl('玻璃质感') }}</b><span>{{ tl('半透明面板（背景模糊与饱和），指针经过时有柔和高光。') }}</span></div><input v-model="settings.effects.glass" type="checkbox" class="switch" :disabled="fxOff" /></div>
            <div class="srow"><div class="sl"><b>{{ tl('动态背景') }}</b><span>{{ tl('面板后柔和流动的色彩；窗口不可见时自动暂停。') }}</span></div><input v-model="settings.effects.ambient" type="checkbox" class="switch" :disabled="fxOff" /></div>
          </div>
          <div class="sgroup" :class="{ dim: fxOff }">
            <div class="srow"><div class="sl"><b>{{ tl('运动模糊') }}</b><span>{{ tl('由求解器的精确中间状态合成，播放与导出视频时生效。') }}</span></div><input v-model="settings.effects.motionBlur" type="checkbox" class="switch" :disabled="fxOff" /></div>
            <div class="srow"><div class="sl"><b>{{ tl('快门角') }}</b><span>{{ tl('模糊的长度：180° 相当于电影的常规快门。') }}</span></div>
              <div class="sc range"><input v-model.number="settings.effects.shutter" type="range" min="0.1" max="1" step="0.05" :disabled="fxOff || !settings.effects.motionBlur" :aria-label="tl('快门')" /><span class="mono val">{{ shutterDeg }}°</span></div>
            </div>
            <div class="srow"><div class="sl"><b>{{ tl('粒子') }}</b><span>{{ tl('碰撞火花与滑动扬尘（只是装饰，不影响计算）。') }}</span></div><input v-model="settings.effects.particles" type="checkbox" class="switch" :disabled="fxOff" /></div>
            <div class="srow"><div class="sl"><b>{{ tl('拖尾') }}</b><span>{{ tl('运动物体身后渐隐的残影（与轨迹线独立）。') }}</span></div><input v-model="settings.effects.trails" type="checkbox" class="switch" :disabled="fxOff" /></div>
            <div class="srow"><div class="sl"><b>{{ tl('拖尾长度') }}</b><span>{{ tl('以仿真时间计。') }}</span></div>
              <div class="sc"><NumField :model-value="settings.effects.trailSeconds" unit="s" :min="0.1" :max="10" width="130px" :disabled="fxOff || !settings.effects.trails" @update:model-value="v => (settings.effects.trailSeconds = v)" /></div>
            </div>
          </div>
          <div class="sgroup">
            <div class="srow"><div class="sl"><b>{{ tl('遵循系统的“减少动态效果”') }}</b><span>{{ tl('系统当前{0}此选项。开启时停止动画、运动模糊与粒子。', [sysEnv.reducedMotion ? tl('已开启') : tl('未开启')]) }}</span></div><input v-model="settings.effects.respectReducedMotion" type="checkbox" class="switch" /></div>
          </div>
          <div class="effective tiny muted">
            {{ tl('当前生效：') }}
            <span :class="{ on: eff.glass }">{{ tl('玻璃') }}</span><span :class="{ on: eff.ambient }">{{ tl('动态背景') }}</span><span :class="{ on: eff.motionBlur }">{{ tl('运动模糊') }}</span><span :class="{ on: eff.particles }">{{ tl('粒子') }}</span><span :class="{ on: eff.trails }">{{ tl('拖尾') }}</span>
            <template v-if="settings.projector">{{ tl('（投影仪模式下不使用半透明效果）') }}</template>
          </div>
        </template>

        <!-- ---- Editor ---- -->
        <template v-else-if="current === 'editor'">
          <div class="sgroup">
            <div class="srow"><div class="sl"><b>{{ tl('网格吸附') }}</b><span>{{ tl('放置、拖动和改变尺寸时对齐网格；按住 Alt 临时关闭。') }}</span></div><input v-model="settings.editor.snap" type="checkbox" class="switch" /></div>
            <div class="srow"><div class="sl"><b>{{ tl('吸附步长') }}</b><span>{{ tl('0 表示自动（随缩放使用画面上的细网格间距）。') }}</span></div>
              <div class="sc"><NumField :model-value="settings.editor.snapStep" unit="m" :min="0" :max="100" width="150px" :disabled="!settings.editor.snap" @update:model-value="v => (settings.editor.snapStep = v)" /></div>
            </div>
            <div class="srow"><div class="sl"><b>{{ tl('角度吸附') }}</b><span>{{ tl('旋转手柄的角度步长。') }}</span></div>
              <select v-model.number="settings.editor.angleSnap" class="field">
                <option v-for="a in ANGLE_SNAPS" :key="a" :value="a">{{ a === 0 ? tl('关闭') : `${a}°` }}</option>
              </select>
            </div>
          </div>
        </template>

        <!-- ---- Simulation ---- -->
        <template v-else-if="current === 'sim'">
          <div class="sgroup">
            <div class="srow"><div class="sl"><b>{{ tl('计算引擎') }}</b><span>{{ tl('Rust 引擎编译为 WebAssembly，速度约为 TypeScript 引擎的 3–4 倍；两者结果逐位相同。Rust 引擎无法加载时自动改用 TypeScript 引擎。') }}</span></div>
              <div class="sc"><select v-model="settings.sim.engine"><option value="auto">{{ `Rust${paren('WebAssembly')}` }}</option><option value="ts">TypeScript</option></select></div>
            </div>
            <div class="srow"><div class="sl"><b>{{ tl('在后台线程计算') }}</b><span>{{ tl('使用 Web Worker，长时间计算时界面不卡顿；结果与前台计算逐位相同。') }}</span></div><input v-model="settings.sim.worker" type="checkbox" class="switch" /></div>
            <div class="srow"><div class="sl"><b>{{ tl('边算边播') }}</b><span>{{ tl('已算出的部分立即显示并可以播放；公式对照随运动阶段的完成逐步出现。') }}</span></div><input v-model="settings.sim.progressive" type="checkbox" class="switch" /></div>
            <div class="srow"><div class="sl"><b>{{ tl('单次计算时间上限') }}</b><span>{{ tl('有限时长的场景超过后停止，已算出的部分保留（可缩短仿真时长或放宽容差）。不限时长的场景没有此上限。') }}</span></div>
              <div class="sc"><NumField :model-value="settings.sim.budgetSeconds" :label="tl('秒')" :min="1" :max="600" :step="5" width="130px" @update:model-value="v => (settings.sim.budgetSeconds = Math.round(v))" /></div>
            </div>
          </div>
          <div class="sgroup">
            <div class="srow"><div class="sl"><b>{{ tl('不限时长：前瞻时间') }}</b><span>{{ tl('计算领先播放位置的仿真时间（至少为播放速度的 3 倍秒数）；领先足够后暂停，播放前进时继续。') }}</span></div>
              <div class="sc"><NumField :model-value="settings.sim.lookAheadSeconds" :label="tl('秒')" :min="2" :max="600" :step="5" width="130px" @update:model-value="v => { settings.sim.lookAheadSeconds = v; applyLookAhead() }" /></div>
            </div>
            <div class="srow"><div class="sl"><b>{{ tl('不限时长：记录内存上限') }}</b><span>{{ tl('超出后较早的帧从内存中释放，只保留检查点；再次查看时从检查点逐位相同地重算。') }}</span></div>
              <div class="sc"><NumField :model-value="settings.sim.memoryMB" label="MB" :min="16" :max="8192" :step="64" width="130px" @update:model-value="v => { settings.sim.memoryMB = Math.round(v); applyMemoryBudget() }" /></div>
            </div>
          </div>
        </template>

        <!-- ---- Export ---- -->
        <template v-else-if="current === 'export'">
          <div class="sgroup">
            <div class="srow"><div class="sl"><b>{{ tl('视频帧率') }}</b></div><select v-model.number="settings.export.fps" class="field"><option v-for="f in FPS" :key="f" :value="f">{{ tl('{0} 帧/秒', [f]) }}</option></select></div>
            <div class="srow"><div class="sl"><b>{{ tl('分辨率') }}</b><span>{{ tl('相对画布的像素倍数。') }}</span></div><select v-model.number="settings.export.scale" class="field"><option v-for="s in SCALES" :key="s" :value="s">{{ s }}×</option></select></div>
            <div class="srow"><div class="sl"><b>{{ tl('视频码率') }}</b></div><select v-model.number="settings.export.bitrate" class="field"><option v-for="b in BITRATES" :key="b.v" :value="b.v">{{ b.label }}</option></select></div>
            <div class="srow"><div class="sl"><b>{{ tl('截图背景') }}</b></div>
              <select v-model="settings.export.imageBackground" class="field"><option value="theme">{{ tl('跟随主题') }}</option><option value="white">{{ tl('白色') }}</option><option value="transparent">{{ tl('透明') }}</option></select>
            </div>
          </div>
          <div class="sgroup">
            <div class="srow"><div class="sl"><b>{{ tl('CSV 分隔符') }}</b><span>{{ tl('Excel 在使用逗号作小数点的地区需要分号。') }}</span></div>
              <select v-model="settings.export.csvSeparator" class="field"><option value=",">{{ tl('逗号 ,') }}</option><option value=";">{{ tl('分号 ;') }}</option><option :value="'\t'">{{ tl('制表符') }}</option></select>
            </div>
            <div class="srow"><div class="sl"><b>{{ tl('CSV 小数点') }}</b><span v-if="csvClash" class="warn-text">{{ tl('小数点与分隔符都是逗号时，导出时分隔符自动改为分号。') }}</span></div>
              <select v-model="settings.export.csvDecimal" class="field"><option value=".">{{ tl('点 .') }}</option><option value=",">{{ tl('逗号 ,') }}</option></select>
            </div>
            <div class="tiny muted ptitle">{{ tl('CSV 可选国际单位（双精度原值）或当前显示单位（{0}、{1}、{2} …），每列标题都注明单位。', [unitLabel('m'), unitLabel('m/s'), unitLabel('s')]) }}</div>
          </div>
        </template>

        <!-- ---- Shortcuts ---- -->
        <template v-else-if="current === 'keys'">
          <div v-for="g in SHORTCUTS" :key="g.title" class="sgroup">
            <div class="tiny muted ptitle">{{ g.title }}</div>
            <div v-for="s in g.items" :key="s.text" class="srow key">
              <span class="small">{{ s.text }}</span>
              <span class="combos"><template v-for="(combo, ci) in s.keys" :key="ci"><span v-if="ci" class="muted or">{{ tl('或') }}</span><template v-for="(k, ki) in combo" :key="k"><span v-if="ki" class="plus">+</span><kbd>{{ k }}</kbd></template></template></span>
            </div>
          </div>
        </template>

        <!-- ---- Privacy and trial ---- -->
        <template v-else-if="current === 'privacy'">
          <div class="sgroup">
            <div class="srow"><div class="sl"><b>{{ tl('记录本地操作日志') }}</b><span>{{ tl('试用期间帮助我们发现问题。默认关闭。') }}</span></div><input v-model="settings.trialLog" type="checkbox" class="switch" /></div>
            <div class="privacy small">
              <p><Icon name="shield" :size="14" />{{ tl('日志只保存在这台电脑上，') }}<b>{{ tl('从不上传') }}</b>{{ tl('，也不含姓名、文件内容等个人信息；只记录操作的类型与时间（例如“运行仿真”“打开模板”）。') }}</p>
              <p>{{ tl('需要反馈时，由你自己导出日志文件发给我们；随时可以清除。') }}</p>
            </div>
            <div class="srow">
              <span class="small muted">{{ tl('已记录 {0} 条', [logCount]) }}</span>
              <span class="spacer" />
              <button class="btn" :disabled="!logCount || busy" @click="exportLog"><Icon name="download" :size="14" />{{ tl('导出日志…') }}</button>
              <button class="btn danger" :disabled="!logCount" @click="clearLog"><Icon name="trash" :size="14" />{{ tl('清除日志') }}</button>
            </div>
          </div>
        </template>

        <!-- ---- About ---- -->
        <template v-else>
          <div class="sgroup"><AboutContent :shortcuts="false" /></div>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings-page { display: grid; grid-template-columns: calc(220px * var(--zoom)) minmax(0, 1fr); gap: 8px; height: 100%; min-height: 0; }
.snav { min-height: 0; }
.nav-list { display: flex; flex-direction: column; gap: 1px; padding: 2px 8px; overflow: auto; flex: 1; }
.nav-item { display: flex; align-items: center; gap: 10px; height: calc(32px * var(--zoom)); padding: 0 8px; border: 0; border-radius: 8px; background: transparent; cursor: pointer; text-align: left; font-size: var(--type-body); color: var(--text); transition: background 120ms ease; }
.nav-item:hover { background: var(--hover); }
.nav-item.on { background: var(--accent); color: var(--on-accent); }
.nav-icon { width: 24px; height: 24px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; background: var(--fill); color: var(--text-2); }
.nav-item.on .nav-icon { background: rgba(255, 255, 255, 0.22); color: inherit; }
.nav-foot { padding: 10px 14px 12px; line-height: 1.5; }
.link { border: 0; background: none; color: var(--accent); cursor: pointer; padding: 0; margin-left: 4px; font-size: inherit; }
.scontent { min-height: 0; }
.content { overflow: auto; flex: 1; padding: 18px 28px 28px; }
.content > * { max-width: 780px; margin-left: auto; margin-right: auto; }
.shead { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
h2 { margin: 0; font-size: var(--type-display); letter-spacing: -0.01em; }
.shead p { margin: 4px 0 0; line-height: 1.5; max-width: 600px; }
.sgroup { background: var(--group); border-radius: 12px; padding: 4px 14px; margin-bottom: 14px; }
.sgroup.dim { opacity: 0.55; }
.srow { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: calc(44px * var(--zoom)); padding: 6px 0; }
.srow + .srow { border-top: 1px solid var(--separator); }
.sl { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sl b { font-weight: 550; font-size: var(--type-body); }
.sl span { font-size: var(--type-tiny); color: var(--text-3); line-height: 1.4; }
.sc { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
.sc.range input { width: 180px; }
.val { min-width: 48px; text-align: right; font-size: var(--type-small); }
.srow.chips { justify-content: flex-start; gap: 6px; flex-wrap: wrap; min-height: 36px; }
select.field { min-width: 160px; }
.kinds { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 6px 16px; padding: 8px 0 10px; border-top: 1px solid var(--separator); }
.kind { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.kind select { min-width: 110px; }
.ptitle { padding: 8px 0 4px; }
.pgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px 16px; }
.pitem { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; border-bottom: 1px solid var(--separator); }
.pformula { padding: 8px 0 4px; }
.effective { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.effective span { padding: 1px 8px; border-radius: 999px; background: var(--fill); text-decoration: line-through; }
.effective span.on { background: var(--success-soft); color: var(--success); text-decoration: none; }
.warn-text { color: var(--warning) !important; }
.srow.key { min-height: 36px; }
.combos { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 2px; justify-content: flex-end; }
.plus { color: var(--text-3); font-size: var(--type-tiny); }
.or { margin: 0 6px; font-size: var(--type-tiny); }
.privacy { padding: 4px 0; line-height: 1.55; }
.privacy p { margin: 6px 0; display: block; }
.privacy :deep(.icon) { display: inline-block; vertical-align: -2px; margin-right: 6px; color: var(--success); }
</style>
