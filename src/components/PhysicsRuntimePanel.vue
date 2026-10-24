<!-- 物理运行设置：编辑求解器和运行参数，并展示物理相关诊断。 -->
<template>
  <aside :style="{'--telemetry-row-height':rowHeight+'px'}" :class="['physics-runtime-panel', { collapsed: monitor.collapsed }]" :aria-label="t('physicsMonitor')">
    <header>
      <div class="heading">
        <span class="live-dot" aria-hidden="true"></span>
        <div><strong>{{ t('physicsMonitor') }}</strong><small>{{ status }}</small></div>
      </div>
      <UiButton :icon="monitor.collapsed ? 'back' : 'forward'" :label="t(monitor.collapsed ? 'expandPanel' : 'collapsePanel')" @click="monitor.collapsed = !monitor.collapsed" />
    </header>

    <template v-if="!monitor.collapsed">
      <nav class="tabs" role="tablist">
        <button :class="{ active: monitor.activeTab === 'bodies' }" role="tab" :aria-selected="monitor.activeTab === 'bodies'" @click.stop="monitor.activeTab = 'bodies'">
          {{ t('physicalProperties') }} <span>{{ monitor.bodies.length }}</span>
        </button>
        <button :class="{ active: monitor.activeTab === 'collisions' }" role="tab" :aria-selected="monitor.activeTab === 'collisions'" @click.stop="monitor.activeTab = 'collisions'">
          {{ t('collisionTimeline') }} <span>{{ monitor.collisions.length }}</span>
        </button>
        <button :class="{ active: monitor.activeTab === 'constraints' }" role="tab" :aria-selected="monitor.activeTab === 'constraints'" @click.stop="monitor.activeTab = 'constraints'">
          {{ t('constraints') }} <span>{{ monitor.constraints.length }}</span>
        </button>
        <button :class="{ active: monitor.activeTab === 'captures' }" role="tab" :aria-selected="monitor.activeTab === 'captures'" @click.stop="monitor.activeTab = 'captures'">
          {{ t('captures') }} <span>{{ monitor.captures.length }}</span>
        </button>
      </nav>
      <!-- 26.44: physics recording; scrub and continue while paused. -->
      <section class="physics-recording" :aria-label="t('physicsRecording')" :title="t('physicsRecordingHint')">
        <div class="recording-head"><span class="recording-dot" :class="{ live: physicsState.playMode === 'playing' }" aria-hidden="true"></span><strong>{{ t('physicsRecording') }}</strong><small>{{ recordingLabel }}</small></div>
        <div v-if="physicsState.playMode === 'paused' && recording.frames > 1" class="recording-scrub">
          <UiButton icon="back" :label="t('previousStep')" :disabled="scrubPosition <= 0" @click="scrubTo(scrubPosition - 1)" />
          <input type="range" min="0" :max="recording.frames - 1" step="1" :value="scrubPosition" :aria-label="t('recordedStep')" :aria-valuetext="recordingLabel" @input="scrubTo(Number(($event.target as HTMLInputElement).value))">
          <UiButton icon="forward" :label="t('nextStep')" :disabled="scrubPosition >= recording.frames - 1" @click="scrubTo(scrubPosition + 1)" />
        </div>
        <div v-if="recording.scrubIndex >= 0" class="recording-actions">
          <button type="button" @click="backToLive">{{ t('backToLive') }}</button>
          <button v-if="!scrubbedKeyframe && nearestKeyframe >= 0" type="button" :title="t('nearestKeyframe')" @click="scrubTo(nearestKeyframe)">◆ {{ t('nearestKeyframe') }}</button>
          <button type="button" class="primary" :disabled="recording.scrubIndex >= recording.frames - 1" :title="scrubbedKeyframe ? t('keyframeStep') : t('posesOnlyStep')" @click="continueHere">{{ t('continueFromHere') }}</button>
        </div>
        <small v-if="rewindMessage" class="recording-note" role="status">{{ rewindMessage }}</small>
      </section>
      <div v-if="monitor.warnings.length" class="runtime-warnings" role="status">
        <strong>{{ t('physicsWarnings') }}</strong><span v-for="warning in monitor.warnings" :key="warning">{{ warning }}</span>
      </div>
      <div class="runtime-tools">
        <input v-model="monitor.query" type="search" :placeholder="t('filterRuntimeData')">
        <UiButton :icon="monitor.frozen ? 'play' : 'pause'" :class="{ active: monitor.frozen }" :label="t(monitor.frozen ? 'resumeTelemetry' : 'freezeTelemetry')" @click="monitor.frozen = !monitor.frozen" />
        <button v-if="monitor.activeTab === 'collisions'" :disabled="!monitor.collisions.length" @click="clearCollisionTimeline">{{ t('clear') }}</button>
        <button v-else-if="monitor.activeTab === 'captures'" @click="capturePhysicsSnapshot()">{{ t('takeCapture') }}</button>
      </div>

      <section v-if="monitor.activeTab === 'bodies'" class="telemetry-browser" role="tabpanel">
        <div class="table-controls">
          <label>{{ t('sortBy') }} <select v-model="monitor.sortKey"><option value="name">{{ t('name') }}</option><option value="speed">{{ t('speed') }}</option><option value="acceleration">{{ t('acceleration') }}</option><option value="force">{{ t('force') }}</option><option value="energy">{{ t('kineticEnergy') }}</option><option value="contacts">{{ t('contacts') }}</option></select></label>
          <UiButton :icon="monitor.sortDirection === 'ascending' ? 'up' : 'down'" :label="t('sortDirection')" @click="monitor.sortDirection = monitor.sortDirection === 'ascending' ? 'descending' : 'ascending'" />
        </div>
        <div class="virtual-list" @scroll="bodyScroll = ($event.target as HTMLElement).scrollTop">
          <div :style="{ height: `${bodyTop}px` }"></div>
          <button v-for="body in visibleBodies" :key="body.uuid" :class="{ active: selectedBody?.uuid === body.uuid, pinned: monitor.pinnedUuids.includes(body.uuid) }" @click="selectedBodyUuid = body.uuid"><span><strong>{{ body.name }}</strong><small>{{ body.role }} · L{{ body.layer }}</small></span><code>{{ numberText(bodyMetric(body), bodyMetricUnit) }}</code></button>
          <div :style="{ height: `${bodyBottom}px` }"></div>
        </div>
        <article v-if="selectedBody" class="telemetry-card telemetry-detail">
          <div class="card-title"><strong>{{ selectedBody.name }}</strong><span>{{ selectedBody.role }} · L{{ selectedBody.layer }}</span><button class="pin-button" :class="{ active: monitor.pinnedUuids.includes(selectedBody.uuid) }" @click="togglePhysicsPin(selectedBody.uuid)">{{ t(monitor.pinnedUuids.includes(selectedBody.uuid) ? 'unpin' : 'pin') }}</button></div>
          <svg class="sparkline" viewBox="0 0 240 42" role="img" :aria-label="t('speedHistory')"><polyline :points="sparklinePoints(selectedBody.speedHistory)" /></svg>
          <div class="metric-grid">
            <Metric :label="t('position')" :value="vectorText(selectedBody.position.x, selectedBody.position.y, 'm')" /><Metric :label="t('direction')" :value="numberText(selectedBody.directionDegrees, '°')" /><Metric :label="t('speed')" :value="numberText(selectedBody.speed, 'm/s')" /><Metric :label="t('delta')" :value="numberText(selectedBody.deltaSpeed, 'm/s')" /><Metric :label="t('velocity')" :value="vectorText(selectedBody.velocity.x, selectedBody.velocity.y, 'm/s')" /><Metric :label="t('acceleration')" :value="vectorText(selectedBody.acceleration.x, selectedBody.acceleration.y, 'm/s²')" /><Metric :label="t('force')" :value="vectorText(selectedBody.force.x, selectedBody.force.y, 'N')" /><Metric :label="t('angularVelocity')" :value="numberText(selectedBody.angularVelocity, 'rad/s')" /><Metric :label="t('kineticEnergy')" :value="numberText(selectedBody.kineticEnergy, 'J')" /><Metric :label="t('contacts')" :value="String(selectedBody.contactCount)" /><Metric :label="t('state')" :value="t(selectedBody.sleeping ? 'sleeping' : 'awake')" />
          </div>
        </article>
        <p v-if="!bodies.length" class="empty">{{ t('noPhysicalObjects') }}</p>
      </section>

      <section v-else-if="monitor.activeTab === 'collisions'" class="telemetry-browser timeline" role="tabpanel">
        <div class="virtual-list" @scroll="collisionScroll = ($event.target as HTMLElement).scrollTop">
          <div :style="{ height: `${collisionTop}px` }"></div>
          <button v-for="collision in visibleCollisions" :key="collision.id" :class="{ active: selectedCollision?.id === collision.id }" @click="selectedCollisionId = collision.id"><span><strong>{{ collision.firstName }} ↔ {{ collision.secondName }}</strong><small>{{ typeLabel(collision.type) }} · {{ timeText(collision.recordedAt) }}</small></span><code>{{ numberText(collision.forceMagnitude, 'N') }}</code></button>
          <div :style="{ height: `${collisionBottom}px` }"></div>
        </div>
        <article v-if="selectedCollision" class="event-body telemetry-detail"><div class="card-title"><strong>{{ selectedCollision.firstName }} ↔ {{ selectedCollision.secondName }}</strong><span>{{ typeLabel(selectedCollision.type) }} · {{ timeText(selectedCollision.recordedAt) }}</span></div>
            <div class="metric-grid compact">
              <Metric :label="t('impactForce')" :value="numberText(selectedCollision.forceMagnitude, 'N')" /><Metric :label="t('impulse')" :value="numberText(selectedCollision.impulseMagnitude, 'N·s')" /><Metric :label="t('directionChange')" :value="numberText(selectedCollision.directionChangeDegrees, '°')" /><Metric :label="t('collisionPoint')" :value="vectorText(selectedCollision.point[0], selectedCollision.point[1], 'm')" /><Metric :label="t('normalForce')" :value="numberText(selectedCollision.normalForce, 'N')" /><Metric :label="t('frictionForce')" :value="numberText(selectedCollision.tangentForce, 'N')" /><Metric :label="t('incomingVelocity')" :value="vectorText(selectedCollision.incomingRelativeVelocity[0], selectedCollision.incomingRelativeVelocity[1], 'm/s')" /><Metric :label="t('resultingVelocity')" :value="vectorText(selectedCollision.resultingRelativeVelocity[0], selectedCollision.resultingRelativeVelocity[1], 'm/s')" />
            </div>
        </article>
        <p v-if="!collisions.length" class="empty">{{ t('noCollisionsRecorded') }}</p>
      </section>

      <section v-else-if="monitor.activeTab === 'constraints'" class="telemetry-browser" role="tabpanel">
        <div class="constraint-list">
          <button v-for="constraint in constraints" :key="constraint.uuid" :class="{ active: selectedConstraint?.uuid === constraint.uuid }" @click="selectedConstraintUuid = constraint.uuid"><span><strong>{{ constraint.name }}</strong><small>{{ constraint.firstName }} ↔ {{ constraint.secondName }}</small></span><code>{{ numberText(constraint.tension, 'N') }}</code></button>
        </div>
        <article v-if="selectedConstraint" class="telemetry-card telemetry-detail">
          <div class="card-title"><strong>{{ selectedConstraint.name }}</strong><span>{{ selectedConstraint.kind }}</span></div>
          <div class="metric-grid"><Metric :label="t('tension')" :value="numberText(selectedConstraint.tension, 'N')"/><Metric :label="t('strain')" :value="numberText(selectedConstraint.strain, '%')"/><Metric :label="t('ropeSegments')" :value="String(selectedConstraint.segmentCount)"/><Metric :label="t('state')" :value="selectedConstraint.breakState"/><Metric :label="t('collision')" :value="selectedConstraint.collisionEnabled ? t('enabled') : t('disabled')"/><Metric :label="t('collideConnected')" :value="selectedConstraint.collideConnected ? t('enabled') : t('disabled')"/></div>
        </article>
        <p v-if="!constraints.length" class="empty">{{ t('noConstraints') }}</p>
      </section>

      <section v-else class="telemetry-browser" role="tabpanel">
        <div class="capture-actions"><button :disabled="monitor.captures.length < 2" @click="compareLatest">{{ t('compareSnapshots') }}</button></div>
        <div class="capture-list"><article v-for="capture in captures" :key="capture.id"><button @click="selectedCaptureId = capture.id"><strong>{{ capture.name }}</strong><small>{{ capture.createdAt }} · {{ capture.step }} {{ t('steps') }}</small></button><UiButton icon="download" :label="t('exportCapture')" @click="exportCapture(capture)" /></article></div>
        <article v-if="snapshotComparison.length" class="comparison-table"><strong>{{ t('snapshotDelta') }}</strong><div v-for="row in snapshotComparison.slice(0, 100)" :key="row.uuid"><span>{{ row.name }}</span><code>Δv {{ numberText(row.speedDelta) }} · ΔE {{ numberText(row.energyDelta) }}</code></div></article>
        <p v-if="!captures.length" class="empty">{{ t('noCaptures') }}</p>
      </section>
    </template>
  </aside>
</template>

<script setup lang="ts">
import UiButton from '../ui/components/UiButton.vue'
import { preferencesState } from '../store/preferences'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { gameplayRuntime as runtime } from '../editor/gameplayRuntime'
import { t } from '../i18n'
import { physicsState } from '../store/physics'
import { capturePhysicsSnapshot, clearCollisionTimeline, comparePhysicsSnapshots, physicsCaptureJson, physicsMonitorState as monitor, togglePhysicsPin, type PhysicsBodyTelemetry, type PhysicsMonitorCapture } from '../runtime/physicsMonitor'

const Metric = defineComponent({
  props: { label: { type: String, required: true }, value: { type: String, required: true } },
  setup: /** 为指标组件返回渲染函数，将标签和值显示在固定结构中。 */ props => /* 调用 h('div', { class: 'metric' }, [h('span', props.label), h('strong', { title: props.value }, props.value)]) 并返回调用结果。 */ () => h('div', { class: 'metric' }, [h('span', props.label), h('strong', { title: props.value }, props.value)])
})

/* 26.44: the recording runs while this panel is open. */
const recording = ref(runtime.physicsRecordingStatus())
const refreshRecording = () => { recording.value = runtime.physicsRecordingStatus() }
onMounted(() => { runtime.setPhysicsRecording(true); refreshRecording() })
onBeforeUnmount(() => runtime.setPhysicsRecording(false))
watch(() => [physicsState.engineDiagnostics.totalPhysicsSteps, physicsState.playMode], refreshRecording)
const scrubPosition = computed(() => recording.value.scrubIndex >= 0 ? recording.value.scrubIndex : recording.value.frames - 1)
const recordingLabel = computed(() => {
  const status = recording.value
  if (!status.frames) return t('recordingEmpty')
  const seconds = status.lastTime - status.firstTime
  if (status.scrubIndex < 0) return `${seconds.toFixed(1)} s · ${status.frames} ${t('steps')} · ${status.bodies}`
  const frame = runtime.physicsRecordingFrame(status.scrubIndex)
  return frame ? `${(frame.time - status.lastTime).toFixed(2)} s · ${t('recordedStep')} ${frame.step} · ${frame.keyframe ? `◆ ${t('keyframeStep')}` : t('posesOnlyStep')}` : ''
})
// 26.45: keyframes restore everything; other steps rewind the bodies only.
const scrubbedKeyframe = computed(() => recording.value.scrubIndex >= 0 && runtime.physicsRecordingFrame(recording.value.scrubIndex)?.keyframe === true)
const nearestKeyframe = computed(() => recording.value.scrubIndex >= 0 ? runtime.physicsRecordingKeyframe(recording.value.scrubIndex) : -1)
function scrubTo(index: number) { if (runtime.scrubPhysics(index)) refreshRecording() }
function backToLive() { runtime.endPhysicsScrub(); refreshRecording() }
const rewindMessage = ref('')
function continueHere() {
  runtime.continuePhysicsFromScrub()
  const result = runtime.physicsRecordingLastContinue()
  rewindMessage.value = result ? `${t(result.exact ? 'rewindExact' : 'rewindPoses')} · ${t('recordedStep')} ${result.step}` : ''
  refreshRecording()
}
watch(() => physicsState.playMode, mode => { if (mode === 'playing') rewindMessage.value = '' })
const query = computed(/* 调用 monitor.query.trim().toLocaleLowerCase() 并返回调用结果。 */ () => monitor.query.trim().toLocaleLowerCase())
const bodies = computed(/** 按查询文本过滤物体，再按所选指标与方向排序，同值时按名称排序。 */ () => {
  const filtered = query.value ? monitor.bodies.filter(/* 调用 `${body.name} ${body.role} ${body.bodyType} ${body.layer}`.toLocaleLowerCase().includes(query.value) 并返回调用结果。 */ body => `${body.name} ${body.role} ${body.bodyType} ${body.layer}`.toLocaleLowerCase().includes(query.value)) : [...monitor.bodies]
  const direction = monitor.sortDirection === 'ascending' ? 1 : -1
  return filtered.sort(/* 计算表达式 direction * (bodyMetricRaw(a) - bodyMetricRaw(b) || a.name.localeCompare(b.name)) 并返回结果，沿用操作数的原有类型规则。 */ (a, b) => direction * (bodyMetricRaw(a) - bodyMetricRaw(b) || a.name.localeCompare(b.name)))
})
const collisions = computed(/** 搜索碰撞名称和类型，空查询直接使用全部碰撞。 */ () => query.value ? monitor.collisions.filter(/* 调用 `${event.firstName} ${event.secondName} ${event.type}`.toLocaleLowerCase().includes(query.value) 并返回调用结果。 */ event => `${event.firstName} ${event.secondName} ${event.type}`.toLocaleLowerCase().includes(query.value)) : monitor.collisions)
const constraints = computed(/** 搜索约束名称、种类和端点名称，空查询使用全部约束。 */ () => query.value ? monitor.constraints.filter(/* 调用 `${item.name} ${item.kind} ${item.firstName} ${item.secondName}`.toLocaleLowerCase().includes(query.value) 并返回调用结果。 */ item => `${item.name} ${item.kind} ${item.firstName} ${item.secondName}`.toLocaleLowerCase().includes(query.value)) : monitor.constraints)
const captures = computed(/* 根据 query.value 的真假，分别返回 monitor.captures.filter(item => item.name.toLocaleLowerCase().includes(query.value)) 或 monitor.captures。 */ () => query.value ? monitor.captures.filter(/* 调用 item.name.toLocaleLowerCase().includes(query.value) 并返回调用结果。 */ item => item.name.toLocaleLowerCase().includes(query.value)) : monitor.captures)
const bodyScroll = ref(0), collisionScroll = ref(0), selectedBodyUuid = ref(''), selectedCollisionId = ref<number | null>(null), selectedConstraintUuid = ref(''), selectedCaptureId = ref('')
const snapshotComparison = ref<ReturnType<typeof comparePhysicsSnapshots>>([])
const rowHeight = computed(()=>48 * preferencesState.uiScale), visibleRows = 7
const bodyStart = computed(/* 调用 Math.max(0, Math.floor(bodyScroll.value / rowHeight.value) - 2) 并返回调用结果。 */ () => Math.max(0, Math.floor(bodyScroll.value / rowHeight.value) - 2)), collisionStart = computed(/* 调用 Math.max(0, Math.floor(collisionScroll.value / rowHeight.value) - 2) 并返回调用结果。 */ () => Math.max(0, Math.floor(collisionScroll.value / rowHeight.value) - 2))
const visibleBodies = computed(/* 调用 bodies.value.slice(bodyStart.value, bodyStart.value + visibleRows + 4) 并返回调用结果。 */ () => bodies.value.slice(bodyStart.value, bodyStart.value + visibleRows + 4)), visibleCollisions = computed(/* 调用 collisions.value.slice(collisionStart.value, collisionStart.value + visibleRows + 4) 并返回调用结果。 */ () => collisions.value.slice(collisionStart.value, collisionStart.value + visibleRows + 4))
const bodyTop = computed(/* 计算表达式 bodyStart.value * rowHeight 并返回结果，沿用操作数的原有类型规则。 */ () => bodyStart.value * rowHeight.value), bodyBottom = computed(/* 调用 Math.max(0, (bodies.value.length - bodyStart.value - visibleBodies.value.length) * rowHeight.value) 并返回调用结果。 */ () => Math.max(0, (bodies.value.length - bodyStart.value - visibleBodies.value.length) * rowHeight.value))
const collisionTop = computed(/* 计算表达式 collisionStart.value * rowHeight 并返回结果，沿用操作数的原有类型规则。 */ () => collisionStart.value * rowHeight.value), collisionBottom = computed(/* 调用 Math.max(0, (collisions.value.length - collisionStart.value - visibleCollisions.value.length) * rowHeight.value) 并返回调用结果。 */ () => Math.max(0, (collisions.value.length - collisionStart.value - visibleCollisions.value.length) * rowHeight.value))
const selectedBody = computed(/** 取得所选物体，缺失回退首项或空值。 */ () => bodies.value.find(/* 比较 body.uuid 与 selectedBodyUuid.value，返回严格相等的判断结果。 */ body => body.uuid === selectedBodyUuid.value) ?? bodies.value[0] ?? null)
const selectedCollision = computed(/** 取得所选碰撞，缺失回退首项或空值。 */ () => collisions.value.find(/* 比较 collision.id 与 selectedCollisionId.value，返回严格相等的判断结果。 */ collision => collision.id === selectedCollisionId.value) ?? collisions.value[0] ?? null)
const selectedConstraint = computed(/** 取得所选约束，缺失回退首项或空值。 */ () => constraints.value.find(/* 比较 constraint.uuid 与 selectedConstraintUuid.value，返回严格相等的判断结果。 */ constraint => constraint.uuid === selectedConstraintUuid.value) ?? constraints.value[0] ?? null)
const status = computed(/** 组合暂停或实时状态及累计物理步数。 */ () => `${t(physicsState.playMode === 'paused' ? 'runtimePaused' : 'live')} · ${physicsState.engineDiagnostics.totalPhysicsSteps} ${t('steps')}`)
const bodyMetricUnit = computed(/* 返回 ({ name: '', speed: 'm/s', acceleration: 'm/s²', force: 'N', energy: 'J', contacts: '' })[monitor.sortKey] 的当前值。 */ () => ({ name: '', speed: 'm/s', acceleration: 'm/s²', force: 'N', energy: 'J', contacts: '' })[monitor.sortKey])

/* 根据 Math.abs(value) < 5e-10 的真假，分别返回 0 或 value。 */ function clean(value: number): number { return Math.abs(value) < 5e-10 ? 0 : value }
/* 调用 `${clean(value).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${unit}`.trim() 并返回调用结果。 */ function numberText(value: number, unit = ''): string { return `${clean(value).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${unit}`.trim() }
/* 调用 `(${numberText(x)}, ${numberText(y)}) ${unit}`.trim() 并返回调用结果。 */ function vectorText(x: number, y: number, unit = ''): string { return `(${numberText(x)}, ${numberText(y)}) ${unit}`.trim() }
/** 将毫秒转换为保留三位小数的秒文本。 */ function timeText(value: number): string { return `${(value / 1000).toFixed(3)}s` }
/* 调用 t(type as Parameters<typeof t>[0]) 并返回调用结果。 */ function typeLabel(type: string): string { return t(type as Parameters<typeof t>[0]) }
/** 按当前排序键提取物理指标，名称排序对应数值零。 */ function bodyMetricRaw(body: PhysicsBodyTelemetry): number { return ({ name: 0, speed: body.speed, acceleration: body.accelerationMagnitude, force: body.forceMagnitude, energy: body.kineticEnergy, contacts: body.contactCount })[monitor.sortKey] }
/* 根据 monitor.sortKey === 'name' 的真假，分别返回 body.speed 或 bodyMetricRaw(body)。 */ function bodyMetric(body: PhysicsBodyTelemetry): number { return monitor.sortKey === 'name' ? body.speed : bodyMetricRaw(body) }
/** 将历史值按最大值归一化为固定画布内的折线坐标。 */ function sparklinePoints(history: number[]): string {
  if (!history.length) return ''
  const maximum = Math.max(1e-9, ...history), width = 240, height = 42
  return history.map(/** 按样本位置和归一化幅度计算单个折线坐标。 */ (value, index) => `${history.length === 1 ? width : index * width / (history.length - 1)},${height - value / maximum * (height - 4) - 2}`).join(' ')
}
/** 下载 JSON 文本并释放临时对象地址。 */ function downloadText(name: string, source: string): void {
  const url = URL.createObjectURL(new Blob([source], { type: 'application/json' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url)
}
/** 净化捕获名称为文件名并导出物理捕获 JSON。 */ function exportCapture(capture: PhysicsMonitorCapture): void { downloadText(`${capture.name.replace(/[^a-z0-9_-]+/gi, '-') || 'physics-capture'}.nova-physics.json`, physicsCaptureJson(capture)) }
/** 至少有两次捕获时比较最新两份物理快照，并选中最新捕获。 */ function compareLatest(): void {
  if (monitor.captures.length < 2) return
  const last = monitor.captures[monitor.captures.length - 1]!, previous = monitor.captures[monitor.captures.length - 2]!
  snapshotComparison.value = comparePhysicsSnapshots(previous, last)
  selectedCaptureId.value = last.id
}
</script>

<style scoped>
.physics-recording{display:grid;gap:var(--space-1);padding:var(--space-2) var(--space-3);border-bottom:var(--ui-border-width) solid var(--border-separator)}
.recording-head{display:flex;align-items:baseline;gap:var(--space-2);min-width:0}
.recording-head small{min-width:0;margin-inline-start:auto;overflow:hidden;color:var(--text-muted);font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap}
.recording-dot{width:8px;height:8px;flex:none;align-self:center;border-radius:50%;background:var(--text-tertiary)}
.recording-dot.live{background:var(--danger,#e5484d)}
.recording-scrub{display:flex;align-items:center;gap:var(--space-1)}
.recording-scrub input{flex:1;min-width:0}
.recording-actions{display:flex;justify-content:flex-end;gap:var(--space-1)}
.recording-actions button{min-height:var(--ui-control-height);padding:0 var(--space-3);border:0;border-radius:var(--radius-control);background:var(--surface-3);color:var(--text-primary);cursor:pointer}
.recording-actions button.primary{background:var(--accent-fill);color:var(--accent-contrast)}
.recording-actions button:disabled{opacity:.5;cursor:default}
.recording-note{color:var(--text-secondary);font-size:var(--type-caption)}
.recording-actions{flex-wrap:wrap}
.physics-runtime-panel{position:relative;z-index:190;width:min(44ch,35vw);min-width:0;display:flex;flex:none;flex-direction:column;overflow:hidden;border-left:1px solid var(--border-subtle);background:var(--surface-1)}.physics-runtime-panel.collapsed{width:calc(var(--ui-control-height) + 2 * var(--ui-space-xs))}header{display:flex;align-items:center;justify-content:space-between;gap:var(--ui-control-gap);padding:var(--ui-space-xs) var(--ui-space-sm);border-bottom:1px solid var(--border-subtle)}.heading{min-width:0;display:flex;align-items:center;gap:var(--ui-space-xs)}.heading>div{display:grid;min-width:0}.heading small{color:var(--text-muted);font-size:var(--type-caption)}.heading strong,.heading small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.live-dot{width:var(--ui-space-xs);height:var(--ui-space-xs);border-radius:50%;background:var(--success);flex:none}.collapsed .heading{display:none}.tabs{display:flex;overflow-x:auto;flex:none;border-bottom:1px solid var(--border-subtle)}.tabs button{flex:none;border-color:transparent;border-radius:0;background:transparent;white-space:nowrap}.tabs span{font-size:var(--type-caption);color:var(--text-muted)}.runtime-tools{display:flex;gap:var(--ui-space-xs);padding:var(--ui-space-xs);flex-wrap:wrap;border-bottom:1px solid var(--border-subtle)}.runtime-tools input{flex:1;min-width:10ch}.runtime-warnings{max-height:20vh;display:grid;gap:var(--ui-space-xs);overflow:auto;padding:var(--ui-space-sm);border-bottom:1px solid var(--warning);font-size:var(--type-caption)}.runtime-warnings strong{color:var(--warning)}.table-controls{display:flex;gap:var(--ui-control-gap);justify-content:space-between;align-items:center}.table-controls label{display:flex;align-items:center;gap:var(--ui-control-gap);min-width:0}.table-controls select{min-width:0}.pin-button{margin-left:auto}.telemetry-browser{min-height:0;flex:1;display:flex;flex-direction:column;gap:var(--ui-space-sm);padding:var(--ui-space-sm);overflow:auto}.virtual-list{height:calc(4 * var(--telemetry-row-height));flex:none;overflow:auto;border-block:1px solid var(--border-subtle)}.virtual-list button{width:100%;height:var(--telemetry-row-height);display:flex;align-items:center;justify-content:space-between;gap:var(--ui-space-xs);padding:var(--ui-space-xs);border:0;border-bottom:1px solid var(--border-subtle);border-radius:0;background:transparent;text-align:left;box-sizing:border-box}.virtual-list button.active{background:var(--selection-bg)}.virtual-list button>span{min-width:0;display:grid}.virtual-list strong,.virtual-list small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.virtual-list small{color:var(--text-muted);font-size:var(--type-caption)}.virtual-list code{color:var(--accent);font-size:var(--type-caption);flex:none}.virtual-list button.pinned{border-left:2px solid var(--accent)}.telemetry-detail{min-height:0}.sparkline{width:100%;height:42px;margin-top:var(--ui-space-sm);border-block:1px solid var(--border-subtle);background:var(--bg-canvas)}.sparkline polyline{fill:none;stroke:var(--accent);stroke-width:1.7;vector-effect:non-scaling-stroke}.constraint-list,.capture-list{min-height:0;overflow:auto;border-block:1px solid var(--border-subtle)}.constraint-list>button{width:100%;min-height:var(--telemetry-row-height);padding:var(--ui-space-xs);display:flex;justify-content:space-between;align-items:center;gap:var(--ui-space-xs);border:0;border-bottom:1px solid var(--border-subtle);border-radius:0;background:transparent;text-align:left}.constraint-list span{min-width:0;display:grid}.constraint-list small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)}.capture-actions{display:flex;justify-content:flex-end}.capture-list article{display:grid;grid-template-columns:minmax(0,1fr) var(--ui-control-height);align-items:center;border-bottom:1px solid var(--border-subtle)}.capture-list button:first-child{display:grid;gap:var(--ui-space-xs);min-width:0;text-align:left;padding:var(--ui-space-xs);background:transparent;border-color:transparent}.capture-list small{color:var(--text-muted);overflow-wrap:anywhere}.comparison-table{min-height:0;overflow:auto}.comparison-table>div{display:flex;justify-content:space-between;gap:var(--ui-space-sm);padding-block:var(--ui-space-xs);border-bottom:1px solid var(--border-subtle)}.comparison-table span{overflow-wrap:anywhere}.comparison-table code{white-space:nowrap}.telemetry-card,.event-body{min-width:0;padding-block:var(--ui-space-sm);border-bottom:1px solid var(--border-subtle)}.card-title{display:flex;align-items:center;gap:var(--ui-space-xs);flex-wrap:wrap}.card-title>span{font-size:var(--type-caption);color:var(--text-muted)}.metric-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-space-sm);margin-top:var(--ui-space-sm)}.metric{display:grid;min-width:0;gap:var(--ui-space-xs)}.metric :deep(span){color:var(--text-muted);font-size:var(--type-caption)}.metric :deep(strong){font-family:var(--font-mono);font-size:var(--type-caption);font-weight:500;overflow-wrap:anywhere}.timeline-event{display:grid;grid-template-columns:var(--ui-space-sm) minmax(0,1fr);gap:var(--ui-space-xs)}.event-rail{border-left:1px solid var(--border-subtle);margin-left:var(--ui-space-xs)}.empty{padding:var(--ui-space-xl);color:var(--text-muted);text-align:center}@media(max-width:1250px){.physics-runtime-panel{position:absolute;right:0;top:0;bottom:0;width:min(44ch,calc(100vw - 2 * var(--ui-control-height)))}}@media(max-width:520px){.metric-grid{grid-template-columns:minmax(0,1fr)}}
</style>
