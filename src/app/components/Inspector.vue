<script setup lang="ts">
import { computed } from 'vue'
import { state, edit } from '../store'
import NumField from './NumField.vue'
import Icon from './Icon.vue'
import type { BodyDef, ConnectorDef, PulleyDef, Scene } from '../../core/scene/types'
import { shapeInertia } from '../../core/solver/model'
import { deleteObject, duplicateBody } from '../editing'

const DEG = 180 / Math.PI

const body = computed<BodyDef | null>(() => (state.selection?.kind === 'body' ? state.scene.bodies.find(b => b.id === state.selection!.id) ?? null : null))
const pulley = computed<PulleyDef | null>(() => (state.selection?.kind === 'pulley' ? state.scene.pulleys.find(b => b.id === state.selection!.id) ?? null : null))
const conn = computed<ConnectorDef | null>(() => (state.selection?.kind === 'connector' ? state.scene.connectors.find(b => b.id === state.selection!.id) ?? null : null))

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
function setPulley(fn: (p: PulleyDef) => void) {
  const id = pulley.value?.id
  if (!id) return
  edit(s => { const p = s.pulleys.find(x => x.id === id); if (p) fn(p) })
}

const bodyName = (id: string | null) => (id ? state.scene.bodies.find(b => b.id === id)?.name ?? id : '固定点（世界）')

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
  if (state.scene.watch.includes(q)) return
  edit(s => s.watch.push(q))
}
</script>

<template>
  <div class="inspector">
    <div v-if="!state.selection" class="empty">
      在画布上选择一个物体或连接件以编辑其参数。<br />未选择时可在“设置”页修改重力、时间步长与精度。
    </div>

    <!-- ------------------------------------------------------------------ body -->
    <template v-if="body">
      <div class="group">
        <div class="row"><label>名称</label><input class="field grow" :value="body.name" @change="setBody(b => { b.name = ($event.target as HTMLInputElement).value || b.name })" /></div>
        <div class="row"><label>类型</label>
          <select class="field grow" :value="body.kind" @change="changeKind(($event.target as HTMLSelectElement).value as BodyDef['kind'])">
            <option value="particle">质点（只平动）</option>
            <option value="rigid">刚体（可转动）</option>
            <option value="static">固定物体</option>
          </select>
        </div>
        <div class="row"><label>形状</label>
          <select class="field grow" :value="body.shape.type" :disabled="body.shape.type === 'polygon'" @change="changeShape(($event.target as HTMLSelectElement).value as 'circle' | 'box')">
            <option value="circle">圆</option>
            <option value="box">矩形</option>
            <option v-if="body.shape.type === 'polygon'" value="polygon">多边形</option>
          </select>
        </div>
        <div v-if="body.shape.type === 'circle'" class="row"><label>半径 r</label><NumField class="grow" :model-value="body.shape.radius" unit="m" :min="1e-4" @update:model-value="v => setBody(b => { if (b.shape.type === 'circle') b.shape.radius = v })" /></div>
        <template v-if="body.shape.type === 'box'">
          <div class="row"><label>宽 w</label><NumField class="grow" :model-value="body.shape.width" unit="m" :min="1e-4" @update:model-value="v => setBody(b => { if (b.shape.type === 'box') b.shape.width = v })" /></div>
          <div class="row"><label>高 h</label><NumField class="grow" :model-value="body.shape.height" unit="m" :min="1e-4" @update:model-value="v => setBody(b => { if (b.shape.type === 'box') b.shape.height = v })" /></div>
        </template>
        <div v-if="body.shape.type === 'polygon'" class="row"><label>顶点</label><span class="grow small muted">{{ body.shape.points.length }} 个（模板生成）</span></div>
      </div>

      <div class="group-title">位置与初始运动</div>
      <div class="group">
        <div class="row"><label>{{ body.kind === 'static' ? '原点 x' : '质心 x' }}</label><NumField class="grow" :model-value="body.position.x" unit="m" @update:model-value="v => setBody(b => { b.position.x = v })" /></div>
        <div class="row"><label>{{ body.kind === 'static' ? '原点 y' : '质心 y' }}</label><NumField class="grow" :model-value="body.position.y" unit="m" @update:model-value="v => setBody(b => { b.position.y = v })" /></div>
        <div class="row"><label>角度 θ</label><NumField class="grow" :model-value="body.angle" unit="°" :scale="DEG" @update:model-value="v => setBody(b => { b.angle = v })" /></div>
        <template v-if="body.kind !== 'static'">
          <div class="row"><label>初速度 vₓ</label><NumField class="grow" :model-value="body.velocity.x" unit="m/s" @update:model-value="v => setBody(b => { b.velocity.x = v })" /></div>
          <div class="row"><label>初速度 v_y</label><NumField class="grow" :model-value="body.velocity.y" unit="m/s" @update:model-value="v => setBody(b => { b.velocity.y = v })" /></div>
          <div class="row"><label>速率 / 方向</label>
            <NumField class="grow" :model-value="speed" unit="m/s" :min="0" @update:model-value="setSpeed" />
            <NumField class="grow" :model-value="direction" unit="°" :scale="DEG" @update:model-value="setDirection" />
          </div>
          <div v-if="body.kind === 'rigid' && !body.fixedRotation" class="row"><label>初角速度 ω</label><NumField class="grow" :model-value="body.angularVelocity" unit="rad/s" @update:model-value="v => setBody(b => { b.angularVelocity = v })" /></div>
        </template>
      </div>

      <template v-if="body.kind !== 'static'">
        <div class="group-title">质量与转动</div>
        <div class="group">
          <div class="row"><label>质量 m</label><NumField class="grow" :model-value="body.mass" unit="kg" :min="1e-9" @update:model-value="v => setBody(b => { b.mass = v })" /></div>
          <template v-if="body.kind === 'rigid'">
            <div class="row"><label>转动惯量</label>
              <select class="field grow" :value="body.inertia === null ? 'auto' : 'custom'" @change="setBody(b => { b.inertia = ($event.target as HTMLSelectElement).value === 'auto' ? null : autoInertia })">
                <option value="auto">按匀质形状计算</option>
                <option value="custom">自定义</option>
              </select>
            </div>
            <div class="row"><label>I（对质心）</label>
              <NumField v-if="body.inertia !== null" class="grow" :model-value="body.inertia" unit="kg·m²" :min="1e-12" @update:model-value="v => setBody(b => { b.inertia = v })" />
              <span v-else class="grow mono small">{{ autoInertia.toPrecision(6) }} kg·m²</span>
            </div>
            <div class="row"><label>禁止转动</label><label class="check grow"><input type="checkbox" :checked="body.fixedRotation" @change="setBody(b => { b.fixedRotation = ($event.target as HTMLInputElement).checked })" />只平动（如方块在面上滑动）</label></div>
          </template>
        </div>
      </template>

      <div class="group-title">材料</div>
      <div class="group">
        <div class="row"><label>静摩擦因数 μs</label><NumField class="grow" :model-value="body.material.muS" :min="0" :step="0.05" @update:model-value="v => setBody(b => { b.material.muS = v })" /></div>
        <div class="row"><label>动摩擦因数 μk</label><NumField class="grow" :model-value="body.material.muK" :min="0" :step="0.05" @update:model-value="v => setBody(b => { b.material.muK = v })" /></div>
        <div class="row"><label>恢复系数 e</label><NumField class="grow" :model-value="body.material.restitution" :min="0" :max="1" :step="0.05" @update:model-value="v => setBody(b => { b.material.restitution = v })" /></div>
        <div v-if="body.kind === 'static'" class="row"><label>传送带速度 u</label><NumField class="grow" :model-value="body.beltSpeed" unit="m/s" @update:model-value="v => setBody(b => { b.beltSpeed = v })" /></div>
        <div class="tiny muted note">两物体接触时取两者中较小的值；需要单独指定时在下方“接触对”中设置。<template v-if="body.kind === 'static'">传送带：u &gt; 0 时表面顺时针运行（上表面向右）。</template></div>
      </div>

      <div class="group-title">接触对（覆盖材料）</div>
      <div class="group">
        <div v-for="(p, i) in pairs" :key="p.a + p.b" class="pair">
          <div class="small">{{ bodyName(p.a === body.id ? p.b : p.a) }}</div>
          <div class="pair-fields">
            <NumField :model-value="p.muS" :min="0" unit="μs" @update:model-value="v => setPair(i, 'muS', v)" />
            <NumField :model-value="p.muK" :min="0" unit="μk" @update:model-value="v => setPair(i, 'muK', v)" />
            <NumField :model-value="p.restitution" :min="0" :max="1" unit="e" @update:model-value="v => setPair(i, 'restitution', v)" />
            <button class="btn icon ghost danger" title="移除" @click="removePair(i)"><Icon name="close" /></button>
          </div>
        </div>
        <div class="row">
          <select class="field grow" value="" @change="addPair(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
            <option value="" disabled>为与某物体的接触单独设置…</option>
            <option v-for="o in otherBodies" :key="o.id" :value="o.id">{{ o.name }}</option>
          </select>
        </div>
      </div>

      <div class="group">
        <div class="row"><label>颜色</label><input type="color" :value="body.color" @change="setBody(b => { b.color = ($event.target as HTMLInputElement).value })" /></div>
      </div>
      <div v-if="body.kind !== 'static'" class="quick">
        <span class="small muted">加入监视：</span>
        <button class="btn small" @click="watchAdd(`${body.id}.x`)">x</button>
        <button class="btn small" @click="watchAdd(`${body.id}.v`)">|v|</button>
        <button class="btn small" @click="watchAdd(`${body.id}.vx`)">vₓ</button>
        <button class="btn small" @click="watchAdd(`${body.id}.a`)">|a|</button>
        <button class="btn small" @click="watchAdd(`${body.id}.ek`)">Eₖ</button>
      </div>
      <div class="actions">
        <button class="btn" @click="duplicate">复制</button>
        <button class="btn danger" @click="remove">删除</button>
      </div>
    </template>

    <!-- ------------------------------------------------------------------ pulley -->
    <template v-if="pulley">
      <div class="group">
        <div class="row"><label>名称</label><input class="field grow" :value="pulley.name" @change="setPulley(p => { p.name = ($event.target as HTMLInputElement).value || p.name })" /></div>
        <div class="row"><label>轴心 x</label><NumField class="grow" :model-value="pulley.position.x" unit="m" @update:model-value="v => setPulley(p => { p.position.x = v })" /></div>
        <div class="row"><label>轴心 y</label><NumField class="grow" :model-value="pulley.position.y" unit="m" @update:model-value="v => setPulley(p => { p.position.y = v })" /></div>
        <div class="row"><label>半径</label><NumField class="grow" :model-value="pulley.radius" unit="m" :min="0" @update:model-value="v => setPulley(p => { p.radius = v })" /></div>
        <div class="tiny muted note">定滑轮：轻质、光滑、轴固定；绳在轮上不打滑也不受摩擦。</div>
      </div>
      <div class="actions"><button class="btn danger" @click="remove">删除</button></div>
    </template>

    <!-- ------------------------------------------------------------------ connector -->
    <template v-if="conn">
      <div class="group">
        <div class="row"><label>名称</label><input class="field grow" :value="conn.name" @change="setConn(c => { c.name = ($event.target as HTMLInputElement).value || c.name })" /></div>
        <div class="row"><label>类型</label><span class="grow">{{ { rope: '轻绳（只能拉）', rod: '轻杆（可拉可压）', spring: '轻弹簧', hinge: '光滑铰链', force: '恒力' }[conn.type] }}</span></div>
        <div class="row"><label>{{ conn.type === 'force' ? '作用于' : '端点 A' }}</label><span class="grow small">{{ bodyName(conn.a.body) }}</span></div>
        <div v-if="conn.type !== 'force'" class="row"><label>端点 B</label><span class="grow small">{{ bodyName(conn.b.body) }}</span></div>
      </div>
      <div v-if="conn.type === 'rope' || conn.type === 'rod'" class="group">
        <div class="row"><label>长度</label>
          <select class="field grow" :value="conn.length === null ? 'auto' : 'custom'" @change="setConn(c => { if (c.type === 'rope' || c.type === 'rod') c.length = ($event.target as HTMLSelectElement).value === 'auto' ? null : 1 })">
            <option value="auto">取初始长度（张紧）</option>
            <option value="custom">指定长度</option>
          </select>
        </div>
        <div v-if="conn.length !== null" class="row"><label>L</label><NumField class="grow" :model-value="conn.length" unit="m" :min="1e-6" @update:model-value="v => setConn(c => { if (c.type === 'rope' || c.type === 'rod') c.length = v })" /></div>
        <template v-if="conn.type === 'rope'">
          <div v-for="(p, i) in conn.pulleys" :key="p.pulley + i" class="row">
            <label>滑轮 {{ i + 1 }}</label>
            <span class="grow small">{{ state.scene.pulleys.find(q => q.id === p.pulley)?.name }}</span>
            <select class="field" :value="p.wrap" @change="setConn(c => { if (c.type === 'rope') c.pulleys[i].wrap = ($event.target as HTMLSelectElement).value as 'cw' | 'ccw' })">
              <option value="cw">顺时针绕过</option>
              <option value="ccw">逆时针绕过</option>
            </select>
          </div>
        </template>
      </div>
      <div v-if="conn.type === 'spring'" class="group">
        <div class="row"><label>劲度系数 k</label><NumField class="grow" :model-value="conn.stiffness" unit="N/m" :min="1e-9" @update:model-value="v => setConn(c => { if (c.type === 'spring') c.stiffness = v })" /></div>
        <div class="row"><label>原长</label>
          <select class="field grow" :value="conn.restLength === null ? 'auto' : 'custom'" @change="setConn(c => { if (c.type === 'spring') c.restLength = ($event.target as HTMLSelectElement).value === 'auto' ? null : 0.5 })">
            <option value="auto">取初始长度（无形变）</option>
            <option value="custom">指定原长</option>
          </select>
        </div>
        <div v-if="conn.restLength !== null" class="row"><label>L₀</label><NumField class="grow" :model-value="conn.restLength" unit="m" :min="0" @update:model-value="v => setConn(c => { if (c.type === 'spring') c.restLength = v })" /></div>
        <div class="row"><label>阻尼 c</label><NumField class="grow" :model-value="conn.damping" unit="N·s/m" :min="0" @update:model-value="v => setConn(c => { if (c.type === 'spring') c.damping = v })" /></div>
      </div>
      <div v-if="conn.type === 'force'" class="group">
        <div class="row"><label>Fₓ</label><NumField class="grow" :model-value="conn.force.x" unit="N" @update:model-value="v => setConn(c => { if (c.type === 'force') c.force.x = v })" /></div>
        <div class="row"><label>F_y</label><NumField class="grow" :model-value="conn.force.y" unit="N" @update:model-value="v => setConn(c => { if (c.type === 'force') c.force.y = v })" /></div>
        <div class="tiny muted note">恒力：大小和方向（世界坐标）不变，作用点随物体运动。</div>
      </div>
      <div class="actions"><button class="btn danger" @click="remove">删除</button></div>
    </template>
  </div>
</template>

<style scoped>
.inspector { padding-top: 4px; }
.note { padding: 6px 2px 4px; line-height: 1.45; }
.pair { padding: 6px 0; border-bottom: 1px solid var(--separator); }
.pair-fields { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 4px; margin-top: 4px; }
.quick { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin: 4px 0 10px; }
.quick .btn { height: 24px; padding: 0 8px; }
.actions { display: flex; gap: 8px; justify-content: flex-end; }
input[type="color"] { width: 40px; height: 24px; border: 0; background: none; padding: 0; }
</style>
