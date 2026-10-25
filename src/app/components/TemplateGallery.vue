<script setup lang="ts">
/**
 * Classic model templates. Parameters are entered in the display units of the settings (templates take SI,
 * angles in degrees); g starts at the default gravity of the settings.
 */
import { tl } from '../../i18n'
import { computed, ref, watch } from 'vue'
import { state, loadScene } from '../store'
import { TEMPLATES } from '../../templates'
import type { TemplateInfo, TemplateParam } from '../../templates'
import { settings } from '../settings'
import { logEvent } from '../trialLog'
import { ask } from '../../platform/ask'
import NumField from './NumField.vue'
import Icon from './Icon.vue'

const DEG = Math.PI / 180

const chosen = ref<TemplateInfo>(TEMPLATES[0])
const values = ref<Record<string, number>>({})
function choose(t: TemplateInfo) {
  chosen.value = t
  values.value = Object.fromEntries(t.params.map(p => [p.key, p.key === 'g' && p.unit === 'm/s²' ? settings.defaultGravity : p.value]))
}
choose(TEMPLATES[0])
/** Groups in teaching order with their icons (groups not listed here follow in the order the templates define them). */
const GROUPS: Array<[string, string]> = [
  ['直线运动', 'block'], ['力与平衡', 'force'], ['斜面与摩擦', 'incline'], ['传送带', 'conveyor'], ['抛体', 'ball'], ['圆周运动', 'disc'],
  ['万有引力', 'orbit'], ['碰撞', 'ball'], ['动量守恒', 'layers'], ['振动', 'spring'], ['连接体', 'pulley'], ['刚体转动', 'gear'],
  ['空气阻力', 'wind'], ['变力', 'force']
]
// Keyed by the translated name (the template groups are read in the interface language)
const GROUP_ORDER = GROUPS.map(([g]) => tl(g))
const GROUP_ICON: Record<string, string> = Object.fromEntries(GROUPS.map(([g, icon]) => [tl(g), icon]))
const query = ref('')
const groups = computed(() => {
  const q = query.value.trim()
  const m = new Map<string, TemplateInfo[]>()
  for (const g of GROUP_ORDER) m.set(g, [])
  for (const t of TEMPLATES) {
    if (q && !`${t.name}${t.description}${t.group}`.includes(q)) continue
    const l = m.get(t.group) ?? []
    l.push(t); m.set(t.group, l)
  }
  return [...m.entries()].filter(([, l]) => l.length > 0)
})
// A search that hides the chosen template chooses the first match, so the details always belong to a listed one
watch(groups, gs => {
  const shown = gs.flatMap(([, l]) => l)
  if (shown.length && !shown.some(t => t.id === chosen.value.id)) choose(shown[0])
})
const preview = computed(() => { try { return chosen.value.build(values.value).description } catch (e) { return (e as Error).message } })

/** Template angles are in degrees; the field works in rad (so it follows the angle unit setting). */
const isAngle = (p: TemplateParam) => p.unit === '°'
const fieldValue = (p: TemplateParam) => (isAngle(p) ? values.value[p.key] * DEG : values.value[p.key])
const fieldUnit = (p: TemplateParam) => (isAngle(p) ? 'rad' : p.unit)
const fieldBound = (p: TemplateParam, v: number | undefined) => (v === undefined ? undefined : isAngle(p) ? v * DEG : v)
function setField(p: TemplateParam, v: number) { values.value[p.key] = isAngle(p) ? Number((v / DEG).toPrecision(14)) : v }

async function create() {
  if (state.dirty && !(await ask(tl('当前场景有未保存的修改，确定要用模板替换吗？')))) return
  const scene = chosen.value.build(values.value)
  scene.extra = { ...(scene.extra ?? {}), template: { id: chosen.value.id, values: { ...values.value } } }
  loadScene(scene, null)
  logEvent('template.open', { template: chosen.value.id })
  state.showTemplates = false
  state.rightTab = 'formula'
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="state.showTemplates = false">
    <div class="dialog">
      <div class="dialog-header"><Icon name="template" :size="18" />{{ tl('经典模型模板') }}<span class="spacer" /><button class="btn icon ghost" @click="state.showTemplates = false"><Icon name="close" /></button></div>
      <div class="dialog-body gallery">
        <nav>
          <input v-model="query" class="field search" :placeholder="tl('搜索模板…')" :aria-label="tl('搜索模板')" />
          <div v-if="!groups.length" class="tiny muted none">{{ tl('没有匹配的模板。') }}</div>
          <template v-for="[g, list] in groups" :key="g">
            <div class="tiny muted gname"><Icon :name="GROUP_ICON[g] ?? 'template'" :size="13" />{{ g }}<span class="count">{{ list.length }}</span></div>
            <button v-for="t in list" :key="t.id" class="titem" :class="{ on: chosen.id === t.id }" @click="choose(t)">
              <span>{{ t.name }}</span><span class="tiny muted">{{ t.description }}</span>
            </button>
          </template>
        </nav>
        <section>
          <h3>{{ chosen.name }}</h3>
          <p class="small muted">{{ preview }}</p>
          <div class="group">
            <div v-for="p in chosen.params" :key="p.key" class="row">
              <label>{{ p.label }}</label>
              <NumField class="grow" :model-value="fieldValue(p)" :unit="fieldUnit(p)" :min="fieldBound(p, p.min)" :max="fieldBound(p, p.max)" :step="isAngle(p) ? undefined : p.step" @update:model-value="v => setField(p, v)" />
            </div>
          </div>
          <p class="tiny muted">{{ tl('创建后所有物体、连接件和参数都可以继续编辑。数值按“设置 › 单位与数值”显示，场景内部一律使用国际单位。g 的初值取自“设置 › 通用 › 新场景的重力加速度”。') }}</p>
        </section>
      </div>
      <div class="dialog-footer">
        <button class="btn" @click="state.showTemplates = false">{{ tl('取消') }}</button>
        <button class="btn primary" @click="create">{{ tl('创建场景') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gallery { display: grid; grid-template-columns: 260px 1fr; gap: 16px; min-height: 420px; }
nav { overflow: auto; max-height: 60vh; padding-right: 4px; }
.gname { margin: 12px 4px 4px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.gname .count { margin-left: auto; font-weight: 500; font-family: var(--font-mono); }
.search { width: 100%; margin: 0 0 4px; position: sticky; top: 0; z-index: 1; }
.none { padding: 12px 6px; }
.titem { display: flex; flex-direction: column; align-items: flex-start; width: 100%; border: 0; background: transparent; border-radius: 8px; padding: 6px 8px; cursor: pointer; text-align: left; gap: 1px; }
.titem:hover { background: var(--hover); }
.titem.on { background: var(--accent-soft); }
.titem.on > span:first-child { color: var(--accent); font-weight: 600; }
h3 { margin: 4px 0 4px; font-size: calc(17px * var(--zoom)); }
.row > label { width: 150px; }
</style>
