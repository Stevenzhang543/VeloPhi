<script setup lang="ts">
/**
 * Property inspector of the selected body, pulley or connector. Every number is entered and shown in the
 * display units of the settings (the scene stays SI). Forces can be constant or given as expressions F(t, state)
 * (validated live); pulleys can be fixed in the world or carried by a body (movable pulley).
 */
import { tl } from '../../i18n'
import { vSlideIndicator } from '../slideIndicator'
import { computed, ref, watch } from 'vue'
import { state, edit } from '../store'
import NumField from './NumField.vue'
import Icon from './Icon.vue'
import Section from './Section.vue'
import type { BodyDef, CentralDef, ConnectorDef, ForceDef, PulleyDef, Scene, SliderDef } from '../../core/scene/types'
import { shapeInertia } from '../../engine/calc'
import { checkForceExpr } from '../../engine/calc'
import { FORCE_EXPR_HELP } from '../../core/scene/forceHelp'
import { canonicalQuantityId } from '../../engine/observe'
import { deleteObject, duplicateBody } from '../editing'
import { explodeCompound } from '../editor/shapeOps'
import { fmtQ } from '../settings'

const body = computed<BodyDef | null>(() => (state.selection?.kind === 'body' ? state.scene.bodies.find(b => b.id === state.selection!.id) ?? null : null))
const pulley = computed<PulleyDef | null>(() => (state.selection?.kind === 'pulley' ? state.scene.pulleys.find(b => b.id === state.selection!.id) ?? null : null))
const conn = computed<ConnectorDef | null>(() => (state.selection?.kind === 'connector' ? state.scene.connectors.find(b => b.id === state.selection!.id) ?? null : null))
const force = computed<ForceDef | null>(() => (conn.value?.type === 'force' ? conn.value : null))
/** The scene has an electric or magnetic field or the Coulomb force (26.54): the charge section opens. */
const hasFields = computed(() => { const st = state.scene.settings; return !!(st.electric || st.magnetic || st.coulomb || st.regions?.some(r => r.kind === 'field')) })

/** Edit the selected object through the undo history. */
function setBody(fn: (b: BodyDef, s: Scene) => void) {
  const id = body.value?.id
  if (!id) return
  edit(s => { const b = s.bodies.find(x => x.id === id); if (b) fn(b, s) })
}
function setConn(fn: (c: ConnectorDef, s: Scene) => void) {
  const id = conn.value?.id
  if (!id) return
  edit(s => { const c = s.connectors.find(x => x.id === id); if (c) fn(c, s) })
}
function setForce(fn: (c: ForceDef) => void) { setConn(c => { if (c.type === 'force') fn(c) }) }
function setSlider(fn: (c: SliderDef) => void) { setConn(c => { if (c.type === 'slider') fn(c) }) }
function setCentral(fn: (c: CentralDef) => void) { setConn(c => { if (c.type === 'central') fn(c) }) }

// ---- 26.52: end stops, torque limit, central fields ----
const slider = computed<SliderDef | null>(() => (conn.value?.type === 'slider' ? conn.value : null))
const central = computed<CentralDef | null>(() => (conn.value?.type === 'central' ? conn.value : null))
function toggleLimits(on: boolean) { setSlider(c => { if (on) c.limits = { min: -0.5, max: 0.5, restitution: 0 }; else delete c.limits }) }
function toggleLimitSide(side: 'min' | 'max', on: boolean) {
  setSlider(c => {
    if (!c.limits) return
    if (!on) { c.limits[side] = null; if (c.limits.min === null && c.limits.max === null) delete c.limits; return }
    const other = side === 'min' ? c.limits.max : c.limits.min
    c.limits[side] = side === 'min' ? (other !== null ? other - 0.5 : -0.5) : (other !== null ? other + 0.5 : 0.5)
  })
}
function setLimit(side: 'min' | 'max', v: number) {
  setSlider(c => {
    if (!c.limits) return
    const other = side === 'min' ? c.limits.max : c.limits.min
    // Keep min < max: an invalid value is clamped just short of the other stop
    if (other !== null && (side === 'min' ? v >= other : v <= other)) v = side === 'min' ? other - 1e-3 : other + 1e-3
    c.limits[side] = v
  })
}
/** Presets of the exponent n of a central field. */
const CENTRAL_PRESETS: Array<{ n: number; label: string }> = [
  { n: 1, label: tl('弹性中心力 F = k·r（n = 1）') },
  { n: -2, label: tl('平方反比 F = k/r²（n = −2）') },
  { n: -1, label: tl('F = k/r（n = −1）') },
  { n: 0, label: tl('大小恒定 F = k（n = 0）') }
]
const centralPreset = computed(() => (central.value && CENTRAL_PRESETS.some(p => p.n === central.value!.n) ? String(central.value.n) : 'custom'))
function toggleTarget(id: string, on: boolean) {
  setCentral(c => {
    const all = state.scene.bodies.filter(b => b.kind !== 'static' && b.id !== c.a.body).map(b => b.id)
    const list = new Set(c.targets ?? all)
    if (on) list.add(id); else list.delete(id)
    c.targets = all.every(x => list.has(x)) ? null : all.filter(x => list.has(x))
  })
}
const centralTargets = computed(() => (central.value ? state.scene.bodies.filter(b => b.kind !== 'static' && b.id !== central.value!.a.body) : []))

// ---- 26.52: compound bodies, rolling resistance ----
function explode() {
  const id = body.value?.id
  if (!id) return
  let first: string | null = null
  edit(s => { first = explodeCompound(s, id) })
  if (first) state.selection = { kind: 'body', id: first }
}
/** Rolling resistance of a contact pair as used (override, else the larger body value). */
function pairRolling(p: { a: string; b: string; rolling?: number }): number {
  if (p.rolling !== undefined) return p.rolling
  const A = state.scene.bodies.find(b => b.id === p.a), B = state.scene.bodies.find(b => b.id === p.b)
  return Math.max(A?.material.rolling ?? 0, B?.material.rolling ?? 0)
}
function setPairRolling(i: number, v: number) {
  const target = pairs.value[i]
  edit(s => { const p = s.contactPairs.find(x => x.a === target.a && x.b === target.b); if (p) p.rolling = v })
}
function setPulley(fn: (p: PulleyDef, s: Scene) => void) {
  const id = pulley.value?.id
  if (!id) return
  edit(s => { const p = s.pulleys.find(x => x.id === id); if (p) fn(p, s) })
}

/** Display name of each connector type (forces: constant or variable, decided in the template). */
const CONN_TYPES: Record<string, string> = { rope: tl('轻绳（只能拉）'), rod: tl('轻杆（可拉可压）'), spring: tl('轻弹簧'), hinge: tl('光滑铰链'), damper: tl('阻尼器（只有阻尼）'), weld: tl('焊接（连成一体）'), slider: tl('滑轨（移动副）'), motor: tl('马达（驱动转轴）'), gear: tl('齿轮 / 皮带'), central: tl('有心力（力场）') }

const bodyName = (id: string | null) => (id ? state.scene.bodies.find(b => b.id === id)?.name ?? id : tl('固定点（世界）'))

const gScene = computed(() => Math.hypot(state.scene.settings.gravity.x, state.scene.settings.gravity.y))
const autoInertia = computed(() => (body.value && body.value.kind !== 'static' ? shapeInertia(body.value.shape, body.value.mass) : 0))
const speed = computed(() => (body.value ? Math.hypot(body.value.velocity.x, body.value.velocity.y) : 0))
const direction = computed(() => (body.value ? Math.atan2(body.value.velocity.y, body.value.velocity.x) : 0))

/** Terminal speed of a fall under the scene's gravity with the body's drag. */
const terminalText = computed(() => {
  const d = body.value?.drag
  if (!d || !body.value) return ''
  const mg = body.value.mass * gScene.value
  const b = d.linear, c = d.quadratic
  if (mg <= 0 || (b <= 0 && c <= 0)) return tl('阻力系数为 0 时没有阻力。')
  const vt = c > 0 ? (-b + Math.sqrt(b * b + 4 * c * mg)) / (2 * c) : mg / b
  return tl('竖直下落的终端速度 v_t = {0}（由 mg = bv + cv² 求得）；耗散的能量计入“阻尼耗散”。', [fmtQ(vt, 'm/s')])
})

function setSpeed(v: number) { const d = direction.value; setBody(b => { b.velocity = { x: v * Math.cos(d), y: v * Math.sin(d) } }) }
function setDirection(d: number) { const v = speed.value; setBody(b => { b.velocity = { x: v * Math.cos(d), y: v * Math.sin(d) } }) }

function changeKind(kind: BodyDef['kind']) {
  setBody(b => {
    b.kind = kind
    if (kind === 'static') { b.velocity = { x: 0, y: 0 }; b.angularVelocity = 0 }
    if (kind !== 'static' && !(b.mass > 0)) b.mass = 1
    if (kind === 'particle') b.angularVelocity = 0
  })
}
function changeShape(type: 'circle' | 'box') {
  setBody(b => {
    if (type === 'circle' && b.shape.type !== 'circle') b.shape = { type: 'circle', radius: 0.1 }
    if (type === 'box' && b.shape.type !== 'box') b.shape = { type: 'box', width: 0.3, height: 0.2 }
  })
}

const pairs = computed(() => (body.value ? state.scene.contactPairs.filter(p => p.a === body.value!.id || p.b === body.value!.id) : []))
const otherBodies = computed(() => (body.value ? state.scene.bodies.filter(b => b.id !== body.value!.id && !pairs.value.some(p => p.a === b.id || p.b === b.id)) : []))
function addPair(other: string) {
  const id = body.value?.id
  if (!id || !other) return
  const a = state.scene.bodies.find(b => b.id === id)!, o = state.scene.bodies.find(b => b.id === other)!
  edit(s => s.contactPairs.push({ a: id, b: other, muS: Math.min(a.material.muS, o.material.muS), muK: Math.min(a.material.muK, o.material.muK), restitution: Math.min(a.material.restitution, o.material.restitution) }))
}
function setPair(i: number, key: 'muS' | 'muK' | 'restitution', v: number) {
  const target = pairs.value[i]
  edit(s => { const p = s.contactPairs.find(x => x.a === target.a && x.b === target.b); if (p) p[key] = v })
}
function removePair(i: number) {
  const target = pairs.value[i]
  edit(s => { s.contactPairs = s.contactPairs.filter(x => !(x.a === target.a && x.b === target.b)) })
}

function remove() {
  const sel = state.selection
  edit(s => deleteObject(s, sel))
  state.selection = null
}
function duplicate() {
  let id: string | null = null
  edit(s => { id = duplicateBody(s, body.value!.id) })
  if (id) state.selection = { kind: 'body', id }
}

function watchAdd(q: string) {
  if (state.scene.watch.some(w => canonicalQuantityId(w) === q)) return
  edit(s => s.watch.push(q))
}

// ---- Variable forces ----
const exprDraft = ref({ x: '', y: '' })
watch(() => [force.value?.id, force.value?.expr?.x, force.value?.expr?.y], () => {
  exprDraft.value = { x: force.value?.expr?.x ?? '', y: force.value?.expr?.y ?? '' }
}, { immediate: true })
const exprCheck = computed(() => ({ x: checkForceExpr(exprDraft.value.x), y: checkForceExpr(exprDraft.value.y) }))
/** Plain number text for an SI value (constant → expression keeps the force). */
const numText = (v: number) => String(Number(v.toPrecision(12)))

function setForceMode(mode: 'const' | 'expr') {
  setForce(c => {
    if (mode === 'expr' && !c.expr) c.expr = { x: numText(c.force.x), y: numText(c.force.y) }
    if (mode === 'const') c.expr = null
  })
}
function commitExpr(axis: 'x' | 'y') {
  const src = exprDraft.value[axis].trim()
  if (!checkForceExpr(src).ok) return
  setForce(c => { if (c.expr) c.expr[axis] = src })
}
function useExample(ex: string) {
  exprDraft.value.x = ex
  commitExpr('x')
}
const showHelp = ref(false)

// ---- Movable pulleys ----
/** Bodies that can carry a movable pulley: dynamic bodies only (on a static body the pulley would simply be fixed). */
const carriers = computed(() => state.scene.bodies.filter(b => b.kind === 'particle' || b.kind === 'rigid'))
/** A carrier that is no longer dynamic (made static after attaching): still listed so the select shows it. */
const staleCarrier = computed(() => {
  const id = pulley.value?.body
  const b = id ? state.scene.bodies.find(x => x.id === id) : null
  return b && !carriers.value.includes(b) ? b : null
})
/** Move the axle between world and body coordinates without moving it in the scene. */
function setPulleyBody(bodyId: string) {
  setPulley((p, s) => {
    const next = bodyId || null
    const prev = p.body ?? null
    if (next === prev) return
    let wx = p.position.x, wy = p.position.y
    const old = prev ? s.bodies.find(b => b.id === prev) : null
    if (old) {
      const c = Math.cos(old.angle), sn = Math.sin(old.angle)
      wx = old.position.x + c * p.position.x - sn * p.position.y
      wy = old.position.y + sn * p.position.x + c * p.position.y
    }
    const nb = next ? s.bodies.find(b => b.id === next) : null
    if (nb) {
      const dx = wx - nb.position.x, dy = wy - nb.position.y
      const c = Math.cos(nb.angle), sn = Math.sin(nb.angle)
      p.position = { x: c * dx + sn * dy, y: -sn * dx + c * dy }
      p.body = nb.id
    } else {
      p.position = { x: wx, y: wy }
      p.body = null
    }
  })
}
</script>

<template>
  <div class="inspector">
    <div v-if="!state.selection" class="empty">
      {{ tl('在画布上选择一个物体或连接件以编辑其参数。') }}<br />{{ tl('未选择时可在“场景”页修改重力、时间步长与精度。') }}
    </div>

    <!-- ---- Body ---- -->
    <template v-if="body">
      <div class="group">
        <div class="row"><label>{{ tl('名称') }}</label><input class="field grow" :value="body.name" @change="setBody(b => { b.name = ($event.target as HTMLInputElement).value || b.name })" /></div>
        <div class="row"><label>{{ tl('类型') }}</label>
          <select class="field grow" :value="body.kind" @change="changeKind(($event.target as HTMLSelectElement).value as BodyDef['kind'])">
            <option value="particle">{{ tl('质点（只平动）') }}</option>
            <option value="rigid">{{ tl('刚体（可转动）') }}</option>
            <option value="static">{{ tl('固定物体') }}</option>
          </select>
        </div>
        <div class="row"><label>{{ tl('形状') }}</label>
          <select class="field grow" :value="body.shape.type" :disabled="body.shape.type === 'polygon' || body.shape.type === 'compound'" @change="changeShape(($event.target as HTMLSelectElement).value as 'circle' | 'box')">
            <option value="circle">{{ tl('圆') }}</option>
            <option value="box">{{ tl('矩形') }}</option>
            <option v-if="body.shape.type === 'polygon'" value="polygon">{{ tl('多边形') }}</option>
            <option v-if="body.shape.type === 'compound'" value="compound">{{ tl('复合体') }}</option>
          </select>
        </div>
        <template v-if="body.shape.type === 'compound'">
          <div class="row"><label>{{ tl('组成部分') }}</label><span class="grow small"><b>{{ body.shape.parts.length }}</b> {{ tl('个') }}<span class="muted">{{ tl('（圆 {0}、矩形 {1}、多边形 {2}）', [body.shape.parts.filter(p => p.shape.type === 'circle').length, body.shape.parts.filter(p => p.shape.type === 'box').length, body.shape.parts.filter(p => p.shape.type === 'polygon').length]) }}</span></span></div>
          <div class="tiny muted note">{{ tl('复合体是一个刚体：各部分密度相同，质量按面积分配，质心与转动惯量由各部分合成（平行轴定理）；部分之间不碰撞。') }}</div>
          <div class="row"><span class="grow" /><button class="btn small" @click="explode"><Icon name="compound" :size="14" />{{ tl('拆分为独立物体') }}</button></div>
        </template>
        <div v-if="body.shape.type === 'circle'" class="row"><label>{{ tl('半径 r') }}</label><NumField class="grow" :model-value="body.shape.radius" unit="m" :min="1e-4" @update:model-value="v => setBody(b => { if (b.shape.type === 'circle') b.shape.radius = v })" /></div>
        <template v-if="body.shape.type === 'box'">
          <div class="row"><label>{{ tl('宽 w') }}</label><NumField class="grow" :model-value="body.shape.width" unit="m" :min="1e-4" @update:model-value="v => setBody(b => { if (b.shape.type === 'box') b.shape.width = v })" /></div>
          <div class="row"><label>{{ tl('高 h') }}</label><NumField class="grow" :model-value="body.shape.height" unit="m" :min="1e-4" @update:model-value="v => setBody(b => { if (b.shape.type === 'box') b.shape.height = v })" /></div>
        </template>
        <div v-if="body.shape.type === 'polygon'" class="row"><label>{{ tl('顶点') }}</label><span class="grow small"><b>{{ body.shape.points.length }}</b> {{ tl('个') }}<span class="muted">{{ tl('（选中后在画布上拖动顶点修改；Alt + 点击顶点删除）') }}</span></span></div>
      </div>

      <Section id="inspect.motion" :title="tl('位置与初始运动')">
        <div class="group">
          <div class="row"><label>{{ body.kind === 'static' ? tl('原点 x') : tl('质心 x') }}</label><NumField class="grow" :model-value="body.position.x" unit="m" @update:model-value="v => setBody(b => { b.position.x = v })" /></div>
          <div class="row"><label>{{ body.kind === 'static' ? tl('原点 y') : tl('质心 y') }}</label><NumField class="grow" :model-value="body.position.y" unit="m" @update:model-value="v => setBody(b => { b.position.y = v })" /></div>
          <div class="row"><label>{{ tl('角度 θ') }}</label><NumField class="grow" :model-value="body.angle" unit="rad" @update:model-value="v => setBody(b => { b.angle = v })" /></div>
          <template v-if="body.kind !== 'static'">
            <div class="row"><label>{{ tl('初速度 vₓ') }}</label><NumField class="grow" :model-value="body.velocity.x" unit="m/s" @update:model-value="v => setBody(b => { b.velocity.x = v })" /></div>
            <div class="row"><label>{{ tl('初速度 v_y') }}</label><NumField class="grow" :model-value="body.velocity.y" unit="m/s" @update:model-value="v => setBody(b => { b.velocity.y = v })" /></div>
            <div class="row"><label>{{ tl('速率 / 方向') }}</label>
              <NumField class="grow" :model-value="speed" unit="m/s" :min="0" @update:model-value="setSpeed" />
              <NumField class="grow" :model-value="direction" unit="rad" @update:model-value="setDirection" />
            </div>
            <div v-if="body.kind === 'rigid' && !body.fixedRotation" class="row"><label>{{ tl('初角速度 ω') }}</label><NumField class="grow" :model-value="body.angularVelocity" unit="rad/s" @update:model-value="v => setBody(b => { b.angularVelocity = v })" /></div>
          </template>
        </div>
      </Section>

      <template v-if="body.kind !== 'static'">
        <Section id="inspect.mass" :title="tl('质量与转动')">
          <div class="group">
            <div class="row"><label>{{ tl('质量 m') }}</label><NumField class="grow" :model-value="body.mass" unit="kg" :min="1e-9" @update:model-value="v => setBody(b => { b.mass = v })" /><span class="weight mono tiny" :title="tl('重力 G = mg（g 取场景设置）')">G = {{ fmtQ(body.mass * gScene, 'N') }}</span></div>
            <template v-if="body.kind === 'rigid'">
              <div class="row"><label>{{ tl('转动惯量') }}</label>
                <select class="field grow" :value="body.inertia === null ? 'auto' : 'custom'" @change="setBody(b => { b.inertia = ($event.target as HTMLSelectElement).value === 'auto' ? null : autoInertia })">
                  <option value="auto">{{ tl('按匀质形状计算') }}</option>
                  <option value="custom">{{ tl('自定义') }}</option>
                </select>
              </div>
              <div class="row"><label>{{ tl('I（对质心）') }}</label>
                <NumField v-if="body.inertia !== null" class="grow" :model-value="body.inertia" unit="kg·m²" :min="1e-12" @update:model-value="v => setBody(b => { b.inertia = v })" />
                <span v-else class="grow mono small">{{ fmtQ(autoInertia, 'kg·m²', 6) }}</span>
              </div>
              <div class="row"><label>{{ tl('禁止转动') }}</label><label class="check grow"><input type="checkbox" :checked="body.fixedRotation" @change="setBody(b => { b.fixedRotation = ($event.target as HTMLInputElement).checked })" />{{ tl('只平动（如方块在面上滑动）') }}</label></div>
            </template>
          </div>
        </Section>
        <Section id="inspect.drag" :title="tl('空气阻力')" :open="false">
          <div class="group">
            <div class="row"><label>{{ tl('考虑阻力') }}</label><label class="check grow"><input type="checkbox" :checked="!!body.drag" @change="setBody(b => { if (($event.target as HTMLInputElement).checked) b.drag = { linear: 0.1, quadratic: 0 }; else delete b.drag })" />{{ tl('F = −(b + c|v|)v，作用在质心') }}</label></div>
            <template v-if="body.drag">
              <div class="row"><label>{{ tl('线性系数 b') }}</label><NumField class="grow" :model-value="body.drag.linear" unit="N·s/m" :min="0" @update:model-value="v => setBody(b => { if (b.drag) b.drag.linear = v })" /></div>
              <div class="row"><label>{{ tl('平方系数 c') }}</label><NumField class="grow" :model-value="body.drag.quadratic" unit="N·s²/m²" :min="0" @update:model-value="v => setBody(b => { if (b.drag) b.drag.quadratic = v })" /></div>
              <div class="tiny muted note">{{ terminalText }}</div>
            </template>
          </div>
        </Section>
      </template>

      <template v-if="body.kind === 'static' && state.scene.settings.gravitation">
        <Section id="inspect.gravMass" :title="tl('引力质量')">
          <div class="group">
            <div class="row"><label>{{ tl('质量 M') }}</label><NumField class="grow" :model-value="body.mass" unit="kg" :min="0" @update:model-value="v => setBody(b => { b.mass = v })" /></div>
            <div class="tiny muted note">{{ tl('固定物体不动，但以这个质量吸引其他物体（如恒星、行星）。') }}</div>
          </div>
        </Section>
      </template>

      <!-- 26.54 (D78): electric charge; folded unless the body is charged or the scene has fields -->
      <Section id="inspect.charge" :title="tl('电荷')" :open="!!body.charge || hasFields" :count="body.charge ? fmtQ(body.charge, 'C') : null">
        <div class="group">
          <div class="row"><label>{{ tl('电荷量 q') }}</label><NumField class="grow" :model-value="body.charge ?? 0" unit="C" @update:model-value="v => setBody(b => { if (v !== 0) b.charge = v; else delete b.charge })" /></div>
          <div class="tiny muted note">{{ body.kind === 'static' ? tl('固定物体的电荷是不动的点电荷，对其他带电体有库仑力（需在“场景”中打开库仑力）。') : tl('电荷集中在质心。电场力 qE、洛伦兹力 qv×B 与库仑力在“场景”页设置。') }}</div>
        </div>
      </Section>

      <Section id="inspect.material" :title="tl('材料')">
        <div class="group">
          <div class="row"><label>{{ tl('静摩擦因数 μs') }}</label><NumField class="grow" :model-value="body.material.muS" :min="0" :step="0.05" @update:model-value="v => setBody(b => { b.material.muS = v })" /></div>
          <div class="row"><label>{{ tl('动摩擦因数 μk') }}</label><NumField class="grow" :model-value="body.material.muK" :min="0" :step="0.05" @update:model-value="v => setBody(b => { b.material.muK = v })" /></div>
          <div class="row"><label>{{ tl('恢复系数 e') }}</label><NumField class="grow" :model-value="body.material.restitution" :min="0" :max="1" :step="0.05" @update:model-value="v => setBody(b => { b.material.restitution = v })" /></div>
          <div class="row" :title="tl('滚动阻力系数：滚动时受阻力偶 M = C_rr·N·r（r 为滚动物体的半径）；接触时取两物体中较大的值')"><label>{{ tl('滚动阻力 C_rr') }}</label><NumField class="grow" :model-value="body.material.rolling ?? 0" :min="0" :max="1" :step="0.005" @update:model-value="v => setBody(b => { if (v > 0) b.material.rolling = v; else delete b.material.rolling })" /></div>
          <div v-if="body.kind === 'static'" class="row"><label>{{ tl('传送带速度 u') }}</label><NumField class="grow" :model-value="body.beltSpeed" unit="m/s" @update:model-value="v => setBody(b => { b.beltSpeed = v })" /></div>
          <div class="tiny muted note">{{ tl('两物体接触时摩擦因数与恢复系数取两者中较小的值，滚动阻力取较大的值；需要单独指定时在下方“接触对”中设置。') }}<template v-if="body.kind === 'static'">{{ tl('传送带：u > 0 时表面顺时针运行（上表面向右）。') }}</template></div>
        </div>
      </Section>

      <Section id="inspect.pairs" :title="tl('接触对（覆盖材料）')" :open="false">
        <div class="group">
          <div v-for="(p, i) in pairs" :key="p.a + p.b" class="pair">
            <div class="small">{{ bodyName(p.a === body.id ? p.b : p.a) }}</div>
            <div class="pair-fields">
              <NumField :model-value="p.muS" :min="0" label="μs" @update:model-value="v => setPair(i, 'muS', v)" />
              <NumField :model-value="p.muK" :min="0" label="μk" @update:model-value="v => setPair(i, 'muK', v)" />
              <NumField :model-value="p.restitution" :min="0" :max="1" label="e" @update:model-value="v => setPair(i, 'restitution', v)" />
              <NumField :model-value="pairRolling(p)" :min="0" :max="1" label="Cᵣᵣ" @update:model-value="v => setPairRolling(i, v)" />
              <button class="btn icon ghost danger" :title="tl('移除')" @click="removePair(i)"><Icon name="close" /></button>
            </div>
          </div>
          <div class="row">
            <select class="field grow" value="" @change="addPair(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
              <option value="" disabled>{{ tl('为与某物体的接触单独设置…') }}</option>
              <option v-for="o in otherBodies" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
          </div>
        </div>
      </Section>

      <div class="group">
        <div class="row"><label>{{ tl('颜色') }}</label><input type="color" :value="body.color" @change="setBody(b => { b.color = ($event.target as HTMLInputElement).value })" /></div>
      </div>
      <div v-if="body.kind !== 'static'" class="quick">
        <span class="small muted">{{ tl('加入监视：') }}</span>
        <button class="btn small" @click="watchAdd(`${body.id}.x`)">x</button>
        <button class="btn small" @click="watchAdd(`${body.id}.v`)">|v|</button>
        <button class="btn small" @click="watchAdd(`${body.id}.vx`)">vₓ</button>
        <button class="btn small" @click="watchAdd(`${body.id}.a`)">|a|</button>
        <button class="btn small" @click="watchAdd(`${body.id}.ek`)">Eₖ</button>
      </div>
      <div class="actions">
        <button class="btn" @click="duplicate"><Icon name="copy" :size="14" />{{ tl('复制一份') }}</button>
        <button class="btn danger" @click="remove"><Icon name="trash" :size="14" />{{ tl('删除') }}</button>
      </div>
    </template>

    <!-- ---- Pulley ---- -->
    <template v-if="pulley">
      <div class="group">
        <div class="row"><label>{{ tl('名称') }}</label><input class="field grow" :value="pulley.name" @change="setPulley(p => { p.name = ($event.target as HTMLInputElement).value || p.name })" /></div>
        <div class="row"><label>{{ tl('装在物体上') }}</label>
          <select class="field grow" :value="pulley.body ?? ''" @change="setPulleyBody(($event.target as HTMLSelectElement).value)">
            <option value="">{{ tl('不（定滑轮，轴固定）') }}</option>
            <option v-for="b in carriers" :key="b.id" :value="b.id">{{ tl('{0}（动滑轮）', [b.name]) }}</option>
            <option v-if="staleCarrier" :value="staleCarrier.id" disabled>{{ tl('{0}（固定物体，相当于定滑轮）', [staleCarrier.name]) }}</option>
          </select>
        </div>
        <div class="row"><label>{{ pulley.body ? tl('轴心 x（物体坐标）') : tl('轴心 x') }}</label><NumField class="grow" :model-value="pulley.position.x" unit="m" @update:model-value="v => setPulley(p => { p.position.x = v })" /></div>
        <div class="row"><label>{{ pulley.body ? tl('轴心 y（物体坐标）') : tl('轴心 y') }}</label><NumField class="grow" :model-value="pulley.position.y" unit="m" @update:model-value="v => setPulley(p => { p.position.y = v })" /></div>
        <div class="row"><label>{{ tl('半径') }}</label><NumField class="grow" :model-value="pulley.radius" unit="m" :min="0" @update:model-value="v => setPulley(p => { p.radius = v })" /></div>
        <div v-if="pulley.body" class="tiny muted note">{{ tl('动滑轮：轮轴随 {0} 运动，坐标相对该物体的质心（随物体转动）。轮本身无质量，需要质量时设置在所在物体上；绳在轮上不打滑也不受摩擦。', [bodyName(pulley.body)]) }}</div>
        <div v-else class="tiny muted note">{{ tl('定滑轮：轻质、光滑、轴固定；绳在轮上不打滑也不受摩擦。') }}</div>
      </div>
      <div class="actions"><button class="btn danger" @click="remove"><Icon name="trash" :size="14" />{{ tl('删除') }}</button></div>
    </template>

    <!-- ---- Connector ---- -->
    <template v-if="conn">
      <div class="group">
        <div class="row"><label>{{ tl('名称') }}</label><input class="field grow" :value="conn.name" @change="setConn(c => { c.name = ($event.target as HTMLInputElement).value || c.name })" /></div>
        <div class="row"><label>{{ tl('类型') }}</label><span class="grow">{{ CONN_TYPES[conn.type] ?? (force?.expr ? tl('变力') : tl('恒力')) }}</span></div>
        <div class="row"><label>{{ conn.type === 'force' ? tl('作用于') : conn.type === 'central' ? tl('中心') : tl('端点 A') }}</label><span class="grow small">{{ conn.type === 'central' && !conn.a.body ? tl('空间中的固定点') : bodyName(conn.a.body) }}</span></div>
        <div v-if="conn.type !== 'force' && conn.type !== 'central'" class="row"><label>{{ tl('端点 B') }}</label><span class="grow small">{{ bodyName(conn.b.body) }}</span></div>
      </div>
      <div v-if="conn.type === 'rope' || conn.type === 'rod'" class="group">
        <div class="row"><label>{{ tl('长度') }}</label>
          <select class="field grow" :value="conn.length === null ? 'auto' : 'custom'" @change="setConn(c => { if (c.type === 'rope' || c.type === 'rod') c.length = ($event.target as HTMLSelectElement).value === 'auto' ? null : 1 })">
            <option value="auto">{{ tl('取初始长度（张紧）') }}</option>
            <option value="custom">{{ tl('指定长度') }}</option>
          </select>
        </div>
        <div v-if="conn.length !== null" class="row"><label>L</label><NumField class="grow" :model-value="conn.length" unit="m" :min="1e-6" @update:model-value="v => setConn(c => { if (c.type === 'rope' || c.type === 'rod') c.length = v })" /></div>
        <template v-if="conn.type === 'rope'">
          <div v-for="(p, i) in conn.pulleys" :key="p.pulley + i" class="row">
            <label>{{ tl('滑轮 {0}', [i + 1]) }}</label>
            <span class="grow small">{{ state.scene.pulleys.find(q => q.id === p.pulley)?.name }}</span>
            <select class="field" :value="p.wrap" @change="setConn(c => { if (c.type === 'rope') c.pulleys[i].wrap = ($event.target as HTMLSelectElement).value as 'cw' | 'ccw' })">
              <option value="cw">{{ tl('顺时针绕过') }}</option>
              <option value="ccw">{{ tl('逆时针绕过') }}</option>
            </select>
          </div>
        </template>
      </div>
      <div v-if="conn.type === 'spring'" class="group">
        <div class="row"><label>{{ tl('劲度系数 k') }}</label><NumField class="grow" :model-value="conn.stiffness" unit="N/m" :min="1e-9" @update:model-value="v => setConn(c => { if (c.type === 'spring') c.stiffness = v })" /></div>
        <div class="row"><label>{{ tl('原长') }}</label>
          <select class="field grow" :value="conn.restLength === null ? 'auto' : 'custom'" @change="setConn(c => { if (c.type === 'spring') c.restLength = ($event.target as HTMLSelectElement).value === 'auto' ? null : 0.5 })">
            <option value="auto">{{ tl('取初始长度（无形变）') }}</option>
            <option value="custom">{{ tl('指定原长') }}</option>
          </select>
        </div>
        <div v-if="conn.restLength !== null" class="row"><label>L₀</label><NumField class="grow" :model-value="conn.restLength" unit="m" :min="0" @update:model-value="v => setConn(c => { if (c.type === 'spring') c.restLength = v })" /></div>
        <div class="row"><label>{{ tl('阻尼 c') }}</label><NumField class="grow" :model-value="conn.damping" unit="N·s/m" :min="0" @update:model-value="v => setConn(c => { if (c.type === 'spring') c.damping = v })" /></div>
        <div class="row"><label>{{ tl('非线性 k₃') }}</label><NumField class="grow" :model-value="conn.cubic ?? 0" unit="N/m³" @update:model-value="v => setConn(c => { if (c.type === 'spring') { if (v === 0) delete c.cubic; else c.cubic = v } })" /></div>
        <div class="tiny muted note">{{ tl('弹力 F = −kx − k₃x³ − cv（x 为形变量，v 为伸长速度）；k₃ = 0 时就是胡克弹簧。弹性势能 ½kx² + ¼k₃x⁴。') }}</div>
      </div>
      <div v-if="conn.type === 'damper'" class="group">
        <div class="row"><label>{{ tl('阻尼系数 c') }}</label><NumField class="grow" :model-value="conn.damping" unit="N·s/m" :min="0" @update:model-value="v => setConn(c => { if (c.type === 'damper') c.damping = v })" /></div>
        <div class="tiny muted note">{{ tl('阻尼器只产生与两端相对速度成正比的阻力 F = −cv，没有弹力；消耗的能量计入能量账本的“阻尼耗散”。') }}</div>
      </div>
      <div v-if="conn.type === 'weld'" class="group">
        <div class="tiny muted note">{{ tl('焊接点两侧的物体保持开始时的相对位置和相对角度，像一个刚体一样运动；连到世界时物体被固定。') }}</div>
      </div>
      <div v-if="conn.type === 'slider'" class="group">
        <div class="row"><label>{{ tl('滑动方向') }}</label><NumField class="grow" :model-value="Math.atan2(conn.axis.y, conn.axis.x)" unit="rad" @update:model-value="v => setConn(c => { if (c.type === 'slider') c.axis = { x: Number(Math.cos(v).toPrecision(12)), y: Number(Math.sin(v).toPrecision(12)) } })" /></div>
        <div class="row"><label>{{ tl('允许转动') }}</label><label class="check grow"><input type="checkbox" :checked="!!conn.free" @change="setConn(c => { if (c.type === 'slider') { if (($event.target as HTMLInputElement).checked) c.free = true; else delete c.free } })" />{{ tl('B 可以绕滑块转动') }}</label></div>
        <div class="tiny muted note">{{ tl('B 端只能沿过 A 端的直线移动；方向角相对 A 物体（连到世界时相对水平向右）测量。') }}</div>
        <div class="row"><label>{{ tl('限位') }}</label><label class="check grow"><input type="checkbox" :checked="!!slider?.limits" @change="toggleLimits(($event.target as HTMLInputElement).checked)" />{{ tl('B 沿滑轨的位移 s 有上下限') }}</label></div>
        <template v-if="slider?.limits">
          <div class="row"><label>{{ tl('下限 s_min') }}</label>
            <input type="checkbox" class="side-check" :checked="slider.limits.min !== null" :title="tl('有下限')" @change="toggleLimitSide('min', ($event.target as HTMLInputElement).checked)" />
            <NumField v-if="slider.limits.min !== null" class="grow" :model-value="slider.limits.min" unit="m" @update:model-value="v => setLimit('min', v)" />
            <span v-else class="grow small muted">{{ tl('不限') }}</span>
          </div>
          <div class="row"><label>{{ tl('上限 s_max') }}</label>
            <input type="checkbox" class="side-check" :checked="slider.limits.max !== null" :title="tl('有上限')" @change="toggleLimitSide('max', ($event.target as HTMLInputElement).checked)" />
            <NumField v-if="slider.limits.max !== null" class="grow" :model-value="slider.limits.max" unit="m" @update:model-value="v => setLimit('max', v)" />
            <span v-else class="grow small muted">{{ tl('不限') }}</span>
          </div>
          <div class="row"><label>{{ tl('限位恢复系数') }}</label><NumField class="grow" :model-value="slider.limits.restitution" :min="0" :max="1" :step="0.05" @update:model-value="v => setSlider(c => { if (c.limits) c.limits.restitution = v })" /></div>
          <div class="tiny muted note">{{ tl('s 从 A 端量到 B 端、沿滑动方向为正。到达限位时若还有速度就发生碰撞（反弹速度为碰前的 e 倍，e = 0 时停在限位上）；压在限位上时限位给 B 向内的支持力。') }}</div>
        </template>
      </div>
      <div v-if="conn.type === 'motor'" class="group">
        <div class="row"><label>{{ tl('驱动方式') }}</label>
          <div v-slide-indicator class="segmented grow">
            <button :class="{ on: conn.mode === 'speed' }" @click="setConn(c => { if (c.type === 'motor') c.mode = 'speed' })">{{ tl('恒定转速') }}</button>
            <button :class="{ on: conn.mode === 'torque' }" @click="setConn(c => { if (c.type === 'motor') c.mode = 'torque' })">{{ tl('恒定力矩') }}</button>
          </div>
        </div>
        <div v-if="conn.mode === 'speed'" class="row"><label>{{ tl('转速 ω') }}</label><NumField class="grow" :model-value="conn.speed" unit="rad/s" @update:model-value="v => setConn(c => { if (c.type === 'motor') c.speed = v })" /></div>
        <template v-if="conn.mode === 'speed'">
          <div class="row"><label>{{ tl('力矩上限') }}</label><label class="check grow"><input type="checkbox" :checked="conn.maxTorque !== undefined && conn.maxTorque !== null" @change="setConn(c => { if (c.type === 'motor') { if (($event.target as HTMLInputElement).checked) c.maxTorque = 1; else delete c.maxTorque } })" />{{ tl('超过时打滑') }}</label></div>
          <div v-if="conn.maxTorque !== undefined && conn.maxTorque !== null" class="row"><label>τ_max</label><NumField class="grow" :model-value="conn.maxTorque" unit="N·m" :min="1e-9" @update:model-value="v => setConn(c => { if (c.type === 'motor') c.maxTorque = v })" /></div>
        </template>
        <div v-else class="row"><label>{{ tl('力矩 M') }}</label><NumField class="grow" :model-value="conn.torque" unit="N·m" @update:model-value="v => setConn(c => { if (c.type === 'motor') c.torque = v })" /></div>
        <div class="tiny muted note">{{ conn.mode === 'speed' ? ((conn.maxTorque ?? null) !== null ? tl('B 相对 A 以恒定角速度转动（逆时针为正）。所需力矩不超过上限时保持转速；超过时“打滑”，以最大力矩驱动，直到转速重新回到设定值。马达做的功计入能量账本。') : tl('B 相对 A 以恒定角速度转动（逆时针为正）；开始时转速立即达到设定值。马达做的功计入能量账本。')) : tl('马达对 B 施加恒定力矩，对 A 施加等大反向的力矩（逆时针为正）；做的功计入能量账本。') }}</div>
      </div>
      <div v-if="conn.type === 'gear'" class="group">
        <div class="row"><label>{{ tl('传动比 r') }}</label><NumField class="grow" :model-value="conn.ratio" @update:model-value="v => { if (v !== 0) setConn(c => { if (c.type === 'gear') c.ratio = v }) }" /></div>
        <div class="tiny muted note">{{ tl('约束 ω_A + r·ω_B = 0。外啮合齿轮取 r = r_B / r_A（转向相反）；开口皮带取 r = −r_B / r_A（转向相同）。') }}</div>
      </div>
      <div v-if="central" class="group">
        <div class="row"><label>{{ tl('规律') }}</label>
          <select class="field grow" :value="centralPreset" @change="setCentral(c => { const v = ($event.target as HTMLSelectElement).value; if (v !== 'custom') c.n = Number(v) })">
            <option v-for="p in CENTRAL_PRESETS" :key="p.n" :value="String(p.n)">{{ p.label }}</option>
            <option value="custom">{{ tl('自定义指数 n') }}</option>
          </select>
        </div>
        <div class="row"><label>{{ tl('强度 k') }}</label><NumField class="grow" :model-value="central.k" :unit="central.n === 0 ? 'N' : ''" @update:model-value="v => setCentral(c => { c.k = v })" /></div>
        <div class="row"><label>{{ tl('指数 n') }}</label><NumField class="grow" :model-value="central.n" :min="-4" :max="4" :step="1" @update:model-value="v => setCentral(c => { c.n = v })" /></div>
        <div class="row"><label>{{ tl('作用对象') }}</label><label class="check grow"><input type="checkbox" :checked="central.targets === null" @change="setCentral(c => { c.targets = ($event.target as HTMLInputElement).checked ? null : [] })" />{{ tl('全部运动物体') }}</label></div>
        <div v-if="central.targets !== null" class="targets">
          <label v-for="b in centralTargets" :key="b.id" class="check small"><input type="checkbox" :checked="central.targets.includes(b.id)" @change="toggleTarget(b.id, ($event.target as HTMLInputElement).checked)" />{{ b.name }}</label>
          <span v-if="!centralTargets.length" class="small muted">{{ tl('场景中还没有运动物体') }}</span>
        </div>
        <div class="tiny muted note">{{ tl('力沿中心与质心的连线，大小 F = k·rⁿ：k > 0 指向中心（引力），k < 0 背离中心（斥力）。物体与中心的距离小于物体自身大小时，力线性减小到 0。势能 k·rⁿ⁺¹/(n+1)（n = −1 时 k·ln r）计入机械能。') }}</div>
      </div>
      <div v-if="force" class="group">
        <div class="row"><label>{{ tl('力的形式') }}</label>
          <div v-slide-indicator class="segmented grow">
            <button :class="{ on: !force.expr }" @click="setForceMode('const')">{{ tl('恒力') }}</button>
            <button :class="{ on: !!force.expr }" @click="setForceMode('expr')">{{ tl('表达式 F(t, 状态)') }}</button>
          </div>
        </div>
        <template v-if="!force.expr">
          <div class="row"><label>Fₓ</label><NumField class="grow" :model-value="force.force.x" unit="N" @update:model-value="v => setForce(c => { c.force.x = v })" /></div>
          <div class="row"><label>F_y</label><NumField class="grow" :model-value="force.force.y" unit="N" @update:model-value="v => setForce(c => { c.force.y = v })" /></div>
          <div class="tiny muted note">{{ tl('恒力：大小和方向（世界坐标）不变，作用点随物体运动。') }}</div>
        </template>
        <template v-else>
          <div v-for="axis in (['x', 'y'] as const)" :key="axis" class="expr-row">
            <div class="row">
              <label>{{ axis === 'x' ? 'Fₓ =' : 'F_y =' }}</label>
              <input v-model="exprDraft[axis]" class="field grow mono" :class="{ invalid: !exprCheck[axis].ok }" spellcheck="false" autocomplete="off" :aria-invalid="!exprCheck[axis].ok"
                @change="commitExpr(axis)" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="exprDraft[axis] = force.expr?.[axis] ?? ''" />
              <span class="tiny muted si">N</span>
            </div>
            <div v-if="!exprCheck[axis].ok" class="expr-msg small">{{ exprCheck[axis].message }}</div>
          </div>
          <div class="tiny muted note">{{ tl('表达式始终按国际单位制求值：t 以 s、x 以 m、v 以 m/s 计，结果为 N，与显示单位无关。修改后按 Enter 或离开输入框生效。') }}</div>
          <button class="btn ghost small help-toggle" :aria-expanded="showHelp" @click="showHelp = !showHelp"><Icon name="info" :size="14" />{{ showHelp ? tl('收起') : tl('可用变量、函数与示例') }}</button>
          <div v-if="showHelp" class="expr-help small">
            <div class="help-title">{{ tl('变量（国际单位）') }}</div>
            <div v-for="v in FORCE_EXPR_HELP.variableInfo" :key="v.name" class="help-row"><code>{{ v.name }}</code><span>{{ v.label }}</span><span class="muted mono">{{ v.unit }}</span></div>
            <div class="help-row"><code>{{ FORCE_EXPR_HELP.constants.join('  ') }}</code><span>{{ tl('常数') }}</span><span /></div>
            <div class="help-title">{{ tl('函数') }}</div>
            <div v-for="f in FORCE_EXPR_HELP.functionInfo" :key="f.name" class="help-row fn"><code>{{ f.name }}</code><span>{{ f.label }}</span></div>
            <div class="help-title">{{ tl('示例（点击填入 Fₓ）') }}</div>
            <div class="examples"><button v-for="ex in FORCE_EXPR_HELP.examples" :key="ex" class="btn small mono" @click="useExample(ex)">{{ ex }}</button></div>
            <ul class="notes tiny muted"><li v-for="n in FORCE_EXPR_HELP.notes" :key="n">{{ n }}</li></ul>
          </div>
        </template>
      </div>
      <div class="actions"><button class="btn danger" @click="remove"><Icon name="trash" :size="14" />{{ tl('删除') }}</button></div>
    </template>
  </div>
</template>

<style scoped>
.inspector { padding-top: 4px; }
.note { padding: 6px 2px 4px; line-height: 1.45; }
.weight { flex: 0 0 auto; color: var(--text-2); background: var(--fill); border-radius: 6px; padding: 2px 6px; white-space: nowrap; }
.pair { padding: 6px 0; border-bottom: 1px solid var(--separator); }
.pair-fields { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr auto; gap: 4px; margin-top: 4px; }
.side-check { flex: 0 0 auto; margin: 0 2px 0 0; }
.targets { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 2px 0 6px; }
.quick { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin: 4px 0 10px; }
.quick .btn { height: 24px; padding: 0 8px; }
.actions { display: flex; gap: 8px; justify-content: flex-end; }
input[type="color"] { width: 40px; height: 24px; border: 0; background: none; padding: 0; }
.segmented.grow { display: flex; }
.segmented.grow button { flex: 1; justify-content: center; }
.expr-row + .expr-row { border-top: 1px solid var(--separator); }
.expr-row .row > label { width: 48px; font-family: var(--font-mono); }
.si { width: 14px; text-align: center; }
.expr-msg { color: var(--danger); background: var(--danger-soft); border-radius: 6px; padding: 4px 8px; margin: 0 0 6px; line-height: 1.4; }
.help-toggle { margin: 2px 0 4px; }
.expr-help { background: var(--fill); border-radius: 8px; padding: 6px 10px 8px; margin-bottom: 4px; }
.help-title { font-weight: 600; color: var(--text-2); margin: 6px 0 2px; font-size: var(--type-tiny); }
.help-row { display: grid; grid-template-columns: 64px 1fr auto; gap: 8px; padding: 1px 0; align-items: baseline; }
.help-row.fn { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); }
code { font-family: var(--font-mono); font-size: var(--type-tiny); color: var(--accent); }
.examples { display: flex; flex-wrap: wrap; gap: 4px; }
.examples .btn { height: 22px; font-size: var(--type-tiny); }
.notes { margin: 6px 0 0; padding-left: 16px; line-height: 1.45; }
</style>
