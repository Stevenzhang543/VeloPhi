<script setup lang="ts">
/**
 * Property inspector of the selected body, pulley or connector. Every number is entered and shown in the
 * display units of the settings (the scene stays SI). Forces can be constant or given as expressions F(t, state)
 * (validated live); pulleys can be fixed in the world or carried by a body (movable pulley).
 */
import { tl } from '../../i18n'
import { computed, ref, watch } from 'vue'
import { state, edit } from '../store'
import NumField from './NumField.vue'
import Icon from './Icon.vue'
import type { BodyDef, ConnectorDef, ForceDef, PulleyDef, Scene } from '../../core/scene/types'
import { shapeInertia } from '../../core/solver/model'
import { checkForceExpr, FORCE_EXPR_HELP } from '../../core/solver/forceExpr'
import { canonicalQuantityId } from '../../core/observe/quantities'
import { deleteObject, duplicateBody } from '../editing'
import { fmtQ } from '../settings'

const body = computed<BodyDef | null>(() => (state.selection?.kind === 'body' ? state.scene.bodies.find(b => b.id === state.selection!.id) ?? null : null))
const pulley = computed<PulleyDef | null>(() => (state.selection?.kind === 'pulley' ? state.scene.pulleys.find(b => b.id === state.selection!.id) ?? null : null))
const conn = computed<ConnectorDef | null>(() => (state.selection?.kind === 'connector' ? state.scene.connectors.find(b => b.id === state.selection!.id) ?? null : null))
const force = computed<ForceDef | null>(() => (conn.value?.type === 'force' ? conn.value : null))

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
function setPulley(fn: (p: PulleyDef, s: Scene) => void) {
  const id = pulley.value?.id
  if (!id) return
  edit(s => { const p = s.pulleys.find(x => x.id === id); if (p) fn(p, s) })
}

const bodyName = (id: string | null) => (id ? state.scene.bodies.find(b => b.id === id)?.name ?? id : tl('固定点（世界）'))

const gScene = computed(() => Math.hypot(state.scene.settings.gravity.x, state.scene.settings.gravity.y))
const autoInertia = computed(() => (body.value && body.value.kind !== 'static' ? shapeInertia(body.value.shape, body.value.mass) : 0))
const speed = computed(() => (body.value ? Math.hypot(body.value.velocity.x, body.value.velocity.y) : 0))
const direction = computed(() => (body.value ? Math.atan2(body.value.velocity.y, body.value.velocity.x) : 0))

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
          <select class="field grow" :value="body.shape.type" :disabled="body.shape.type === 'polygon'" @change="changeShape(($event.target as HTMLSelectElement).value as 'circle' | 'box')">
            <option value="circle">{{ tl('圆') }}</option>
            <option value="box">{{ tl('矩形') }}</option>
            <option v-if="body.shape.type === 'polygon'" value="polygon">{{ tl('多边形') }}</option>
          </select>
        </div>
        <div v-if="body.shape.type === 'circle'" class="row"><label>{{ tl('半径 r') }}</label><NumField class="grow" :model-value="body.shape.radius" unit="m" :min="1e-4" @update:model-value="v => setBody(b => { if (b.shape.type === 'circle') b.shape.radius = v })" /></div>
        <template v-if="body.shape.type === 'box'">
          <div class="row"><label>{{ tl('宽 w') }}</label><NumField class="grow" :model-value="body.shape.width" unit="m" :min="1e-4" @update:model-value="v => setBody(b => { if (b.shape.type === 'box') b.shape.width = v })" /></div>
          <div class="row"><label>{{ tl('高 h') }}</label><NumField class="grow" :model-value="body.shape.height" unit="m" :min="1e-4" @update:model-value="v => setBody(b => { if (b.shape.type === 'box') b.shape.height = v })" /></div>
        </template>
        <div v-if="body.shape.type === 'polygon'" class="row"><label>{{ tl('顶点') }}</label><span class="grow small"><b>{{ body.shape.points.length }}</b> {{ tl('个') }}<span class="muted">{{ tl('（选中后在画布上拖动顶点修改；Alt + 点击顶点删除）') }}</span></span></div>
      </div>

      <div class="group-title">{{ tl('位置与初始运动') }}</div>
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

      <template v-if="body.kind !== 'static'">
        <div class="group-title">{{ tl('质量与转动') }}</div>
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
      </template>

      <div class="group-title">{{ tl('材料') }}</div>
      <div class="group">
        <div class="row"><label>{{ tl('静摩擦因数 μs') }}</label><NumField class="grow" :model-value="body.material.muS" :min="0" :step="0.05" @update:model-value="v => setBody(b => { b.material.muS = v })" /></div>
        <div class="row"><label>{{ tl('动摩擦因数 μk') }}</label><NumField class="grow" :model-value="body.material.muK" :min="0" :step="0.05" @update:model-value="v => setBody(b => { b.material.muK = v })" /></div>
        <div class="row"><label>{{ tl('恢复系数 e') }}</label><NumField class="grow" :model-value="body.material.restitution" :min="0" :max="1" :step="0.05" @update:model-value="v => setBody(b => { b.material.restitution = v })" /></div>
        <div v-if="body.kind === 'static'" class="row"><label>{{ tl('传送带速度 u') }}</label><NumField class="grow" :model-value="body.beltSpeed" unit="m/s" @update:model-value="v => setBody(b => { b.beltSpeed = v })" /></div>
        <div class="tiny muted note">{{ tl('两物体接触时取两者中较小的值；需要单独指定时在下方“接触对”中设置。') }}<template v-if="body.kind === 'static'">{{ tl('传送带：u > 0 时表面顺时针运行（上表面向右）。') }}</template></div>
      </div>

      <div class="group-title">{{ tl('接触对（覆盖材料）') }}</div>
      <div class="group">
        <div v-for="(p, i) in pairs" :key="p.a + p.b" class="pair">
          <div class="small">{{ bodyName(p.a === body.id ? p.b : p.a) }}</div>
          <div class="pair-fields">
            <NumField :model-value="p.muS" :min="0" label="μs" @update:model-value="v => setPair(i, 'muS', v)" />
            <NumField :model-value="p.muK" :min="0" label="μk" @update:model-value="v => setPair(i, 'muK', v)" />
            <NumField :model-value="p.restitution" :min="0" :max="1" label="e" @update:model-value="v => setPair(i, 'restitution', v)" />
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
        <div class="row"><label>{{ tl('类型') }}</label><span class="grow">{{ { rope: tl('轻绳（只能拉）'), rod: tl('轻杆（可拉可压）'), spring: tl('轻弹簧'), hinge: tl('光滑铰链'), force: force?.expr ? tl('变力') : tl('恒力') }[conn.type] }}</span></div>
        <div class="row"><label>{{ conn.type === 'force' ? tl('作用于') : tl('端点 A') }}</label><span class="grow small">{{ bodyName(conn.a.body) }}</span></div>
        <div v-if="conn.type !== 'force'" class="row"><label>{{ tl('端点 B') }}</label><span class="grow small">{{ bodyName(conn.b.body) }}</span></div>
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
      </div>
      <div v-if="force" class="group">
        <div class="row"><label>{{ tl('力的形式') }}</label>
          <div class="segmented grow">
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
.pair-fields { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 4px; margin-top: 4px; }
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
