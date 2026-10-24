<!-- 图生产工具：管理接口、迁移、差异与关联脚本；用户操作失败在本面板日志中保留。 -->
<template>
  <section class="production-panel">
    <UiTabs class="production-tabs" :aria-label="t('graphProductionTools')" :items="tabs.map(item => ({ id: item.id, label: t(item.label) }))" :model-value="tab" @update:model-value="tab = $event as typeof tab" />

    <div v-if="tab === 'structure'" class="production-content">
      <header><strong>{{ t('routines') }}</strong><span>{{ graph.routines.length }}</span></header>
      <div class="action-grid three"><UiButton @click="addRoutine('function')" icon="add">{{ t('graphFunction') }}</UiButton><UiButton @click="addRoutine('macro')" icon="add">{{ t('graphMacro') }}</UiButton><UiButton @click="addRoutine('subgraph')" icon="add">{{ t('graphSubgraph') }}</UiButton></div>
      <article v-for="routine in graph.routines" :key="routine.uuid" class="production-card" :class="{ active: scopeUuid === routine.uuid }">
        <div class="card-title"><button class="name" @click="emit('scope', routine.uuid)">{{ routine.name }}</button><small>{{ routine.kind }}</small><UiButton class="danger" :title="t('remove')" @click="removeRoutine(routine)" icon="remove" :label="t('remove')" variant="danger" /></div>
        <textarea :aria-label="t('description') + ' · ' + routine.name" v-model="routine.description" :placeholder="t('description')" maxlength="512" rows="2" @change="changed"></textarea>
        <div class="checks"><label><input v-model="routine.pure" type="checkbox" @change="signaturesChanged">{{ t('pureFunction') }}</label><label><input v-model="routine.inline" type="checkbox" @change="changed">{{ t('inlineMacro') }}</label></div>
        <select :aria-label="t('implements') + ' · ' + routine.name" v-model="routine.interfaceUuid" @change="changed"><option :value="null">{{ t('noInterface') }}</option><option v-for="contract in graph.interfaces" :key="contract.uuid" :value="contract.uuid">{{ t('implements') }} {{ contract.name }}</option></select>
        <template v-if="scopeUuid === routine.uuid">
          <div class="subhead"><strong>{{ t('parametersAndLocals') }}</strong></div>
          <div class="action-grid three"><UiButton @click="addParameter(routine,'input')" icon="add">{{ t('input') }}</UiButton><UiButton @click="addParameter(routine,'output')" icon="add">{{ t('output') }}</UiButton><UiButton @click="addLocal(routine)" icon="add">{{ t('localVariable') }}</UiButton></div>
          <div v-for="parameter in [...routine.inputs,...routine.outputs]" :key="parameter.uuid" class="symbol-row"><EditorIcon :name="routine.inputs.includes(parameter) ? 'forward' : 'back'" /><input :aria-label="t('parameter') + ' · ' + t('name')" v-model="parameter.name" maxlength="80" @change="signaturesChanged"><select :aria-label="panelControlLabel('type', parameter.name)" v-model="parameter.valueType" @change="parameterTypeChanged(parameter)"><option v-for="type in valueTypes" :key="type">{{ type }}</option></select><UiButton :aria-label="t('remove') + ' · ' + parameter.name" class="danger" @click="removeParameter(routine,parameter.uuid)" icon="remove" :label="t('remove')" variant="danger" /></div>
          <div v-for="local in routine.locals" :key="local.uuid" class="symbol-row"><EditorIcon name="design" /><input :aria-label="t('localVariable') + ' · ' + t('name')" v-model="local.name" maxlength="80" @change="changed"><select :aria-label="panelControlLabel('type', local.name)" v-model="local.valueType" @change="localTypeChanged(local)"><option v-for="type in valueTypes" :key="type">{{ type }}</option></select><UiButton :aria-label="t('remove') + ' · ' + local.name" class="danger" @click="removeLocal(routine,local.uuid)" icon="remove" :label="t('remove')" variant="danger" /></div>
        </template>
      </article>
      <p v-if="!graph.routines.length" class="hint">{{ t('noGraphRoutines') }}</p>

      <header><strong>{{ t('customEvents') }}</strong><UiButton :aria-label="t('addEvent')" @click="addEvent" icon="add" :label="t('add')" /></header>
      <article v-for="event in graph.customEvents" :key="event.uuid" class="production-card"><div class="symbol-row"><EditorIcon name="events" /><input :aria-label="t('eventName')" v-model="event.name" maxlength="80" @change="signaturesChanged"><small>{{ event.parameters.length }} {{ t('parameters') }}</small><UiButton :aria-label="t('add') + ' · ' + event.name" @click="addEventParameter(event)" icon="add" :label="t('add')" /><UiButton :aria-label="t('remove') + ' · ' + event.name" class="danger" @click="removeEvent(event.uuid)" icon="remove" :label="t('remove')" variant="danger" /></div><div v-for="parameter in event.parameters" :key="parameter.uuid" class="symbol-row"><EditorIcon name="forward" /><input :aria-label="t('parameter') + ' · ' + t('name')" v-model="parameter.name" maxlength="80" @change="signaturesChanged"><select :aria-label="panelControlLabel('type', parameter.name)" v-model="parameter.valueType" @change="parameterTypeChanged(parameter)"><option v-for="type in valueTypes" :key="type">{{ type }}</option></select><UiButton :aria-label="t('remove') + ' · ' + parameter.name" class="danger" @click="removeEventParameter(event,parameter.uuid)" icon="remove" :label="t('remove')" variant="danger" /></div></article>

      <header><strong>{{ t('graphInterfaces') }}</strong><UiButton :aria-label="t('add') + ' · ' + t('graphInterfaces')" @click="addInterface" icon="add" :label="t('add')" /></header>
      <article v-for="contract in graph.interfaces" :key="contract.uuid" class="production-card"><div class="symbol-row"><EditorIcon name="graph" /><input :aria-label="t('graphInterfaces') + ' · ' + t('name')" v-model="contract.name" maxlength="80" @change="changed"><small>{{ contract.methods.length }} {{ t('methods') }}</small><UiButton :aria-label="t('add') + ' · ' + t('methods')" @click="addInterfaceMethod(contract)" icon="add" :label="t('add')" /><UiButton class="danger" :title="t('remove')" @click="removeInterface(contract.uuid)" icon="remove" :label="t('remove')" variant="danger" /></div><div v-for="method in contract.methods" :key="method.uuid" class="interface-method"><div class="symbol-row"><EditorIcon name="code" /><input :aria-label="t('methods') + ' · ' + t('name')" v-model="method.name" maxlength="80" @change="changed"><UiButton @click="addInterfaceParameter(method,'input')" icon="add">{{ t('input') }}</UiButton><UiButton @click="addInterfaceParameter(method,'output')" icon="add">{{ t('output') }}</UiButton><UiButton class="danger" :title="t('remove')" @click="removeInterfaceMethod(contract,method.uuid)" icon="remove" :label="t('remove')" variant="danger" /></div><div v-for="parameter in [...method.inputs,...method.outputs]" :key="parameter.uuid" class="symbol-row interface-parameter"><EditorIcon :name="method.inputs.includes(parameter) ? 'forward' : 'back'" /><input :aria-label="t('parameter') + ' · ' + t('name')" v-model="parameter.name" maxlength="80" @change="changed"><select :aria-label="panelControlLabel('type', parameter.name)" v-model="parameter.valueType" @change="parameterTypeChanged(parameter)"><option v-for="type in valueTypes" :key="type">{{ type }}</option></select><UiButton class="danger" :title="t('remove')" @click="removeInterfaceParameter(method,parameter.uuid)" icon="remove" :label="t('remove')" variant="danger" /></div></div></article>

      <header><strong>{{ t('graphLibraries') }}</strong><span>{{ graph.libraries.length }}</span></header>
      <select :aria-label="t('selectPackageLibrary')" v-model="libraryCandidate"><option value="">{{ t('selectPackageLibrary') }}</option><option v-for="item in availableLibraries" :key="item.manifest.id" :value="item.manifest.id">{{ item.manifest.name }} · {{ item.manifest.visualNodes.length }} {{ t('nodes') }}</option></select>
      <UiButton :disabled="!libraryCandidate" @click="addLibrary" icon="add">{{ t('addLibrary') }}</UiButton>
      <div v-for="library in graph.libraries" :key="library.uuid" class="symbol-row"><input :aria-label="t('enabled') + ' · ' + library.packageId" v-model="library.enabled" type="checkbox" @change="changed"><span class="grow">{{ library.packageId }}</span><small>{{ library.version }}</small><UiButton :aria-label="t('remove') + ' · ' + library.packageId" class="danger" @click="removeLibrary(library.uuid)" icon="remove" :label="t('remove')" variant="danger" /></div>
    </div>

    <div v-else-if="tab === 'debug'" class="production-content">
      <header><strong>{{ t('visualDebugger') }}</strong><span :class="graphDebugState.paused ? 'paused' : 'live'">{{ graphDebugState.paused ? t('paused') : t('live') }}</span></header>
      <p class="debug-reason">{{ graphDebugState.reason || t('visualDebuggerIdle') }}</p>
      <div class="action-grid four"><UiButton @click="gameplayRuntime.debugContinue" icon="play">{{ t('continue') }}</UiButton><UiButton @click="gameplayRuntime.debugStep('into')" icon="step-into">{{ t('stepInto') }}</UiButton><UiButton @click="gameplayRuntime.debugStep('over')" icon="step-over">{{ t('stepOver') }}</UiButton><UiButton @click="gameplayRuntime.debugStep('out')" icon="step-out">{{ t('stepOut') }}</UiButton></div>
      <div class="metric-grid"><span><strong>{{ coverage.covered }}/{{ coverage.total }}</strong>{{ t('coverage') }} {{ Math.round(coverage.rate * 100) }}%</span><span><strong>{{ graphTrace.length }}</strong>{{ t('traceEvents') }}</span><span><strong>{{ graphErrors.length }}</strong>{{ t('nodeErrors') }}</span></div>
      <header><strong>{{ t('watches') }}</strong><UiButton :aria-label="t('add') + ' · ' + t('watches')" @click="addWatch" icon="add" :label="t('add')" /></header>
      <div v-for="(watch,index) in graph.debug.watches" :key="`${watch}:${index}`" class="watch-row"><input :aria-label="t('watches') + ' · ' + index + 1" :value="watch" @change="updateWatch(index,$event)"><code>{{ graphDebugState.watches[index]?.error || graphDebugState.watches[index]?.value || '—' }}</code><UiButton :aria-label="t('remove') + ' · ' + index + 1" class="danger" @click="graph.debug.watches.splice(index,1);changed()" icon="remove" :label="t('remove')" variant="danger" /></div>
      <header><strong>{{ t('breakpoints') }}</strong><span>{{ graph.debug.breakpoints.length }}</span></header>
      <article v-for="point in graph.debug.breakpoints" :key="point.nodeUuid" class="breakpoint-card"><div><input :aria-label="t('enabled') + ' · ' + nodeName(point.nodeUuid)" v-model="point.enabled" type="checkbox" @change="changed"><button @click="focusNode(point.nodeUuid)">{{ nodeName(point.nodeUuid) }}</button><small>#{{ graphDebugState.breakpointHits[point.nodeUuid] || 0 }}</small></div><input :aria-label="t('breakpointCondition')" v-model="point.condition" :placeholder="t('breakpointCondition')" maxlength="512" @change="changed"><input :aria-label="t('hitCondition')" v-model.number="point.hitCondition" type="number" min="0" :placeholder="t('hitCondition')" @change="changed"><input :aria-label="t('logpointMessage')" v-model="point.logMessage" :placeholder="t('logpointMessage')" maxlength="1024" @change="changed"></article>
      <header><strong>{{ t('callStack') }}</strong><span>{{ graphDebugState.callStack.length }}</span></header>
      <button v-for="frame in graphDebugState.callStack" :key="`${frame.scopeUuid}:${frame.nodeUuid}:${frame.depth}`" class="trace-row" @click="focusNode(frame.nodeUuid)"><span>#{{ frame.depth }}</span><strong>{{ nodeName(frame.nodeUuid) }}</strong><small>{{ scopeName(frame.scopeUuid) }}</small></button>
      <header><strong>{{ t('nodeTimings') }}</strong><span>µs</span></header>
      <button v-for="timing in graphTimings" :key="timing.nodeUuid" class="trace-row" @click="focusNode(timing.nodeUuid)"><strong>{{ nodeName(timing.nodeUuid) }}</strong><small>{{ timing.calls }}× · {{ Math.round(timing.lastMicros) }} / max {{ Math.round(timing.maximumMicros) }}</small></button>
      <header><strong>{{ t('nodeErrors') }}</strong><span>{{ graphErrors.length }}</span></header>
      <button v-for="error in graphErrors" :key="`${error.nodeUuid}:${error.message}`" class="error-row" @click="focusNode(error.nodeUuid)"><strong>{{ nodeName(error.nodeUuid) }}</strong><small>{{ error.message }}</small></button>
    </div>

    <div v-else-if="tab === 'refactor'" class="production-content">
      <header><strong>{{ t('graphRefactoring') }}</strong><span>{{ graph.migrations.length }} {{ t('migrations') }}</span></header>
      <select :aria-label="t('selectSymbol')" v-model="symbolUuid"><option value="">{{ t('selectSymbol') }}</option><option v-for="symbol in symbols" :key="symbol.uuid" :value="symbol.uuid">{{ symbol.kind }} · {{ symbol.name }}</option></select>
      <div class="inline-action"><input :aria-label="t('newName')" v-model="renameValue" :placeholder="t('newName')" maxlength="80"><button :disabled="!symbolUuid || !renameValue.trim()" @click="renameSymbol">{{ t('rename') }}</button></div>
      <div class="reference-list"><button v-for="reference in references" :key="`${reference.scopeUuid}:${reference.nodeUuid}`" @click="emit('scope', reference.scopeUuid === graph.uuid ? 'main' : reference.scopeUuid)"><strong>{{ reference.kind }}</strong><small>{{ reference.label }}</small></button><p v-if="symbolUuid && !references.length" class="hint">{{ t('noReferences') }}</p></div>
      <header><strong>{{ t('extractFunction') }}</strong><span>{{ selectedNodeUuids.length }} {{ t('selected') }}</span></header>
      <div class="inline-action"><input :aria-label="t('extractFunction') + ' · ' + t('name')" v-model="extractName" maxlength="80"><button :disabled="scopeUuid !== 'main' || !selectedNodeUuids.length" @click="extractFunction">{{ t('extract') }}</button></div>
      <header><strong>{{ t('replaceNode') }}</strong><span>{{ selectedNodeUuids.length === 1 ? nodeName(selectedNodeUuids[0]) : '—' }}</span></header>
      <div class="inline-action"><input :aria-label="t('replaceNode')" v-model="replacementType" placeholder="api.log_info" maxlength="160"><button :disabled="selectedNodeUuids.length !== 1 || !replacementType" @click="replaceNode">{{ t('replace') }}</button></div>
      <button @click="migrateDeprecated">{{ t('migrateDeprecatedNodes') }}</button>
      <ol class="migration-list"><li v-for="migration in graph.migrations.slice().reverse().slice(0,20)" :key="migration.uuid"><strong>{{ migration.kind }}</strong> {{ migration.from }} → {{ migration.to }}</li></ol>
    </div>

    <div v-else-if="tab === 'merge'" class="production-content">
      <header><strong>{{ t('semanticGraphDiff') }}</strong><span>{{ diff.length }}</span></header>
      <button @click="captureBase">{{ t('captureMergeBase') }}</button>
      <textarea :aria-label="t('mergeBaseJson')" v-model="baseSource" :placeholder="t('mergeBaseJson')" rows="5"></textarea>
      <textarea :aria-label="t('incomingGraphJson')" v-model="theirsSource" :placeholder="t('incomingGraphJson')" rows="5"></textarea>
      <div class="action-grid"><button :disabled="!baseSource" @click="refreshDiff">{{ t('compare') }}</button><button :disabled="!baseSource || !theirsSource" @click="performMerge">{{ t('merge') }}</button></div>
      <p v-if="mergeError" class="merge-error">{{ mergeError }}</p>
      <button v-for="change in diff.slice(0,100)" :key="`${change.identity}:${change.path}`" class="trace-row"><strong>{{ change.kind }}</strong><small>{{ change.path }}</small></button>
      <article v-for="conflict in mergeResult?.conflicts" :key="conflict.id" class="conflict-card"><strong>{{ conflict.path }}</strong><small>{{ t('mergeConflict') }}</small><div><button :class="{ active: conflict.resolution === 'ours' }" @click="resolveConflict(conflict.id,'ours')">{{ t('keepOurs') }}</button><button :class="{ active: conflict.resolution === 'theirs' }" @click="resolveConflict(conflict.id,'theirs')">{{ t('keepTheirs') }}</button></div></article>
<!-- 合并冲突检查回调在存在未解决项时禁用应用按钮。 -->      <button v-if="mergeResult" :disabled="mergeResult.conflicts.some(item=>item.resolution==='unresolved')" class="primary" @click="applyMerge">{{ t('applyResolvedMerge') }}</button>
    </div>

    <div v-else class="production-content code-view">
      <header><strong>{{ t('generatedRhai') }}</strong><span>{{ linkedSource.split('\n').length }} {{ t('lines') }}</span></header>
      <p class="hint">{{ t('oneWayCodeGenerationNotice') }}</p>
      <div class="conversion-coverage"><strong>{{ Math.round(conversionCoverage.percent * 100) }}%</strong><span>{{ t('structuralConversionCoverage') }}</span><small>{{ conversionCoverage.native }} {{ t('nativeBlocks') }} · {{ conversionCoverage.escaped }} {{ t('executeRhaiBlocks') }}</small></div>
      <p class="hint">{{ t('executeRhaiSafetyHint') }}</p>
      <article v-for="item in conversionCoverage.escapeBlocks" :key="item.nodeUuid" class="escape-block"><strong>{{ item.title }}</strong><small>{{ item.kind }} · {{ item.scopeUuid.slice(0,8) }}</small><code>{{ item.source || t('moduleScope') }}</code></article>
<!-- 关联脚本映射回调提取资源名称用于连接状态显示。 -->      <p v-if="linkedScripts.length" class="link-status"><EditorIcon name="link" /> {{ linkedScripts.map(asset => asset.name).join(', ') }}</p>
      <button :disabled="!linkedSource" @click="generateRhaiAsset">{{ t('generateNewRhaiAsset') }}</button>
      <pre>{{ linkedSource }}</pre>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import UiButton from '../ui/components/UiButton.vue'
import UiTabs from '../ui/components/UiTabs.vue'
import EditorIcon from './EditorIcon.vue'
import { assetState } from '../assets/AssetDatabase'
import { t } from '../i18n'
import { panelControlLabel } from '../editor/panelControlCopy'
import { gameplayRuntime } from '../editor/gameplayRuntime'
import { packageState } from '../runtime/packages'
import { requestConfirmation } from '../store/dialog'
import { addEditorLog } from '../store/editor'
import { pushHistory } from '../store/physics'
import { graphCoverage, graphDebugState } from '../visual/graphDebugger'
import { createLinkedRhaiSource, ensureLinkedScriptForGraph, graphConversionCoverage, linkedScriptGraphUuid } from '../visual/graphCodeSync'
import { addRoutineParameter, applyGraphConflict, createGraphCustomEvent, createGraphInterface, createGraphRoutine, extractGraphFunction, findGraphReferences, mergeGraphs, migrateDeprecatedGraphNodes, renameGraphSymbol, replaceGraphNodeType, semanticGraphDiff, synchronizeGraphSignatures, type GraphMergeResult, type GraphSemanticChange } from '../visual/graphProduction'
import { defaultGraphValue, graphUuid, parseGraphDocument, serializeGraphDocument, type GraphCustomEvent, type GraphInterface, type GraphInterfaceMethod, type GraphParameter, type GraphRoutine, type GraphRoutineKind, type GraphValueType, type GraphVariable, type NovaGraphDocument } from '../visual/graphTypes'

const props = defineProps<{ graph: NovaGraphDocument; scopeUuid: string; selectedNodeUuids: string[]; compiledSource: string }>()
const emit = defineEmits<{ dirty: []; scope: [uuid: string]; replaceGraph: [graph: NovaGraphDocument] }>()
const tabs = [{id:'structure',label:'graphStructure'},{id:'debug',label:'debug'},{id:'refactor',label:'refactor'},{id:'merge',label:'diffAndMerge'},{id:'code',label:'generatedRhai'}] as const
const tab = ref<(typeof tabs)[number]['id']>('structure'), libraryCandidate = ref(''), symbolUuid = ref(''), renameValue = ref(''), extractName = ref('extracted_function'), replacementType = ref(''), baseSource = ref(''), theirsSource = ref(''), mergeError = ref(''), diff = ref<GraphSemanticChange[]>([]), mergeResult = shallowRef<GraphMergeResult | null>(null)
const valueTypes: GraphValueType[] = ['Boolean','Number','String','Vec2','Entity','Resource','Data']
const availableLibraries = computed(/** 筛选当前图尚未引用的可用项目节点库。 */ () => packageState.installed.filter(/** 只接受启用且属于项目、包含节点并且尚未引用的库。 */ item => item.enabled && item.project && item.manifest.visualNodes.length && !props.graph.libraries.some(/* 比较 library.packageId 与 item.manifest.id，返回严格相等的判断结果。 */ library => library.packageId === item.manifest.id)))
const allNodes = computed(/** 汇总主图和例程节点，供名称、计时和调试查询。 */ () => [props.graph.nodes,...props.graph.routines.map(/* 返回 item.nodes 的当前值。 */ item=>item.nodes)].flat())
const graphTrace = computed(/** 只显示当前图的执行轨迹。 */ () => graphDebugState.trace.filter(/* 比较 item.graphUuid 与 props.graph.uuid，返回严格相等的判断结果。 */ item => item.graphUuid === props.graph.uuid))
const graphErrors = computed(/** 只显示当前图的运行错误。 */ () => graphDebugState.errors.filter(/* 比较 item.graphUuid 与 props.graph.uuid，返回严格相等的判断结果。 */ item => item.graphUuid === props.graph.uuid))
const linkedSource = computed(/** 生成当前草稿图对应的 Rhai 源码预览。 */ () => createLinkedRhaiSource(props.graph))
const linkedScripts = computed(/** 跟踪资源代次，查找准确关联到当前图的脚本。 */ () => {
  void assetState.generation
  return assetState.records.filter(/** 筛选准确关联当前图的脚本资源。 */ asset => asset.assetType === 'script' && linkedScriptGraphUuid(asset.uuid) === props.graph.uuid)
})
const graphTimings = computed(/** 筛选当前图节点的运行计时并按总耗时降序。 */ () => Object.values(graphDebugState.timings).filter(/** 只保留属于当前图节点的计时记录。 */ item => allNodes.value.some(/* 比较 node.uuid 与 item.nodeUuid，返回严格相等的判断结果。 */ node=>node.uuid===item.nodeUuid)).sort(/** 按累计微秒数降序排列。 */ (a,b)=>b.totalMicros-a.totalMicros))
const coverage = computed(/** 计算实际图运行覆盖率。 */ () => graphCoverage(props.graph))
const conversionCoverage = computed(/** 区分结构化节点与显式源码保留节点。 */ () => graphConversionCoverage(props.graph))
const symbols = computed(/** 组合变量、例程、局部变量、事件和接口用于重构选择。 */ () => [
  ...props.graph.variables.map(/** 构造变量的重构选择项。 */ item=>({uuid:item.uuid,name:item.name,kind:'variable'})),
  ...props.graph.routines.map(/** 构造例程的重构选择项。 */ item=>({uuid:item.uuid,name:item.name,kind:item.kind})),
  ...props.graph.routines.flatMap(/** 汇总各例程的局部变量选择项。 */ routine=>routine.locals.map(/** 用例程限定名称区分同名局部变量。 */ item=>({uuid:item.uuid,name:`${routine.name}.${item.name}`,kind:'local'}))),
  ...props.graph.customEvents.map(/** 构造事件的重构选择项。 */ item=>({uuid:item.uuid,name:item.name,kind:'event'})),
  ...props.graph.interfaces.map(/** 构造接口的重构选择项。 */ item=>({uuid:item.uuid,name:item.name,kind:'interface'}))
])
const references = computed(/** 按选中符号查找引用，未选择时返回空列表。 */ () => symbolUuid.value ? findGraphReferences(props.graph,symbolUuid.value) : [])

/** 向父图编辑器报告草稿已修改，保存与历史由父级统一处理。 */
function changed(){emit('dirty')}
/** 同步函数、事件及接口端口签名，再标记草稿已修改。 */
function signaturesChanged(){synchronizeGraphSignatures(props.graph);changed()}
/** 创建指定类型的例程并切换到新作用域。 */
function addRoutine(kind:GraphRoutineKind){const routine=createGraphRoutine(kind,`${kind}_${props.graph.routines.length+1}`);props.graph.routines.push(routine);emit('scope',routine.uuid);changed()}
/** 确认后删除例程及所有调用节点和关联边，返回主图。 */
async function removeRoutine(routine:GraphRoutine){if(!await requestConfirmation({title:t('removeRoutine'),message:t('removeRoutineConfirm',{name:routine.name}),confirmLabel:t('remove'),cancelLabel:t('cancel'),destructive:true}))return;props.graph.routines=props.graph.routines.filter(/* 比较 item.uuid 与 routine.uuid，返回严格不等的判断结果。 */ item=>item.uuid!==routine.uuid);for(const scope of [props.graph,...props.graph.routines]){const removed=new Set(scope.nodes.filter(/* 比较 node.type 与 `routine.call.${routine.uuid}`，返回严格相等的判断结果。 */ node=>node.type===`routine.call.${routine.uuid}`).map(/* 返回 node.uuid 的当前值。 */ node=>node.uuid));scope.nodes=scope.nodes.filter(/* 返回 removed.has(node.uuid) 的逻辑取反结果。 */ node=>!removed.has(node.uuid));scope.edges=scope.edges.filter(/** 保留两端均未被删除的边。 */ edge=>!removed.has(edge.from.nodeUuid)&&!removed.has(edge.to.nodeUuid))}emit('scope','main');changed()}
/** 为例程添加数字参数，并同步所有调用端口。 */
function addParameter(routine:GraphRoutine,direction:'input'|'output'){addRoutineParameter(routine,direction,`${direction}_${routine[direction==='input'?'inputs':'outputs'].length+1}`,'Number');signaturesChanged()}
/** 按身份删除输入或输出参数，并同步签名。 */
function removeParameter(routine:GraphRoutine,uuid:string){routine.inputs=routine.inputs.filter(/* 比较 item.uuid 与 uuid，返回严格不等的判断结果。 */ item=>item.uuid!==uuid);routine.outputs=routine.outputs.filter(/* 比较 item.uuid 与 uuid，返回严格不等的判断结果。 */ item=>item.uuid!==uuid);signaturesChanged()}
/** 按新类型重置参数默认值并同步相关端口。 */
function parameterTypeChanged(parameter:GraphParameter){parameter.defaultValue=defaultGraphValue(parameter.valueType);signaturesChanged()}
/** 创建未暴露且不序列化的数字局部变量。 */
function addLocal(routine:GraphRoutine){routine.locals.push({uuid:graphUuid(),name:`local_${routine.locals.length+1}`,valueType:'Number',defaultValue:0,exposed:false,serialized:false,group:'Locals',tooltip:'',minimum:null,maximum:null,step:.01,resourceType:null});signaturesChanged()}
/** 删除局部变量、对应读写节点及悬空边。 */
function removeLocal(routine:GraphRoutine,uuid:string){routine.locals=routine.locals.filter(/* 比较 item.uuid 与 uuid，返回严格不等的判断结果。 */ item=>item.uuid!==uuid);const removed=new Set(routine.nodes.filter(/* 比较 node.config.localUuid 与 uuid，返回严格相等的判断结果。 */ node=>node.config.localUuid===uuid).map(/* 返回 node.uuid 的当前值。 */ node=>node.uuid));routine.nodes=routine.nodes.filter(/* 返回 removed.has(node.uuid) 的逻辑取反结果。 */ node=>!removed.has(node.uuid));routine.edges=routine.edges.filter(/** 移除局部变量节点后清除悬空边。 */ edge=>!removed.has(edge.from.nodeUuid)&&!removed.has(edge.to.nodeUuid));changed()}
/** 更新局部变量默认值与引用节点的数据端口类型。 */
function localTypeChanged(local:GraphVariable){local.defaultValue=defaultGraphValue(local.valueType);for(const routine of props.graph.routines)for(const node of routine.nodes.filter(/* 比较 item.config.localUuid 与 local.uuid，返回严格相等的判断结果。 */ item=>item.config.localUuid===local.uuid))for(const pin of node.pins.filter(/* 比较 item.kind 与 'data'，返回严格相等的判断结果。 */ item=>item.kind==='data')){pin.valueType=local.valueType;pin.defaultValue=local.defaultValue}changed()}
/** 添加自定义事件并同步事件节点签名。 */
function addEvent(){props.graph.customEvents.push(createGraphCustomEvent(`custom_event_${props.graph.customEvents.length+1}`));signaturesChanged()}
/** 为自定义事件添加动态数据参数。 */
function addEventParameter(event:GraphCustomEvent){event.parameters.push({uuid:graphUuid(),name:`value_${event.parameters.length+1}`,valueType:'Data',defaultValue:null,tooltip:''});signaturesChanged()}
/** 删除指定事件参数并同步签名。 */
function removeEventParameter(event:GraphCustomEvent,uuid:string){event.parameters=event.parameters.filter(/* 比较 item.uuid 与 uuid，返回严格不等的判断结果。 */ item=>item.uuid!==uuid);signaturesChanged()}
/** 移除事件及引用它的节点和关联边。 */
function removeEvent(uuid:string){props.graph.customEvents=props.graph.customEvents.filter(/* 比较 item.uuid 与 uuid，返回严格不等的判断结果。 */ item=>item.uuid!==uuid);for(const scope of [props.graph,...props.graph.routines]){const removed=new Set(scope.nodes.filter(/** 查找对应自定义事件的节点。 */ node=>node.type.endsWith(uuid)).map(/* 返回 node.uuid 的当前值。 */ node=>node.uuid));scope.nodes=scope.nodes.filter(/* 返回 removed.has(node.uuid) 的逻辑取反结果。 */ node=>!removed.has(node.uuid));scope.edges=scope.edges.filter(/** 移除事件节点后清除悬空边。 */ edge=>!removed.has(edge.from.nodeUuid)&&!removed.has(edge.to.nodeUuid))}changed()}
/** 创建空接口契约并标记草稿。 */
function addInterface(){props.graph.interfaces.push(createGraphInterface(`interface_${props.graph.interfaces.length+1}`));changed()}
/** 为接口创建无参数方法声明。 */
function addInterfaceMethod(contract:GraphInterface){contract.methods.push({uuid:graphUuid(),name:`method_${contract.methods.length+1}`,inputs:[],outputs:[]});changed()}
/** 给接口方法添加指定方向的数据参数。 */
function addInterfaceParameter(method:GraphInterfaceMethod,direction:'input'|'output'){const target=method[direction==='input'?'inputs':'outputs'];target.push({uuid:graphUuid(),name:`${direction}_${target.length+1}`,valueType:'Data',defaultValue:null,tooltip:''});changed()}
/** 按身份删除接口方法。 */
function removeInterfaceMethod(contract:GraphInterface,uuid:string){contract.methods=contract.methods.filter(/* 比较 item.uuid 与 uuid，返回严格不等的判断结果。 */ item=>item.uuid!==uuid);changed()}
/** 从方法输入和输出中移除指定参数。 */
function removeInterfaceParameter(method:GraphInterfaceMethod,uuid:string){method.inputs=method.inputs.filter(/* 比较 item.uuid 与 uuid，返回严格不等的判断结果。 */ item=>item.uuid!==uuid);method.outputs=method.outputs.filter(/* 比较 item.uuid 与 uuid，返回严格不等的判断结果。 */ item=>item.uuid!==uuid);changed()}
/** 删除接口并清除例程对该接口的绑定。 */
function removeInterface(uuid:string){props.graph.interfaces=props.graph.interfaces.filter(/* 比较 item.uuid 与 uuid，返回严格不等的判断结果。 */ item=>item.uuid!==uuid);for(const routine of props.graph.routines)if(routine.interfaceUuid===uuid)routine.interfaceUuid=null;changed()}
/** 将已启用且包含可视节点的项目包添加为图依赖。 */
function addLibrary(){const item=availableLibraries.value.find(/* 比较 candidate.manifest.id 与 libraryCandidate.value，返回严格相等的判断结果。 */ candidate=>candidate.manifest.id===libraryCandidate.value);if(!item)return;props.graph.libraries.push({uuid:graphUuid(),packageId:item.manifest.id,libraryId:'visual-nodes',version:item.manifest.version,enabled:true});libraryCandidate.value='';changed()}
/** 移除指定图依赖库引用。 */
function removeLibrary(uuid:string){props.graph.libraries=props.graph.libraries.filter(/* 比较 item.uuid 与 uuid，返回严格不等的判断结果。 */ item=>item.uuid!==uuid);changed()}
/** 在 128 项上限内添加默认监视表达式。 */
function addWatch(){if(props.graph.debug.watches.length>=128)return;props.graph.debug.watches.push('time.frame');changed()}
/** 保存监视表达式并限制其长度为 512 字符。 */
function updateWatch(index:number,event:Event){props.graph.debug.watches[index]=(event.target as HTMLInputElement).value.slice(0,512);changed()}
/** 取得节点显示名称，缺失时使用身份前缀。 */
function nodeName(uuid:string){return allNodes.value.find(/* 比较 item.uuid 与 uuid，返回严格相等的判断结果。 */ item=>item.uuid===uuid)?.title??uuid.slice(0,8)}
/** 取得主图或例程名称，缺失时使用身份前缀。 */
function scopeName(uuid:string){return uuid===props.graph.uuid?t('mainGraph'):props.graph.routines.find(/* 比较 item.uuid 与 uuid，返回严格相等的判断结果。 */ item=>item.uuid===uuid)?.name??uuid.slice(0,8)}
/** 查找节点所属例程并请求切换作用域。 */
function focusNode(uuid:string){const routine=props.graph.routines.find(/** 查找包含指定节点的例程。 */ item=>item.nodes.some(/* 比较 node.uuid 与 uuid，返回严格相等的判断结果。 */ node=>node.uuid===uuid));emit('scope',routine?.uuid??'main')}
/** 重命名图符号并同步签名，错误只在本地日志显示。 */
function renameSymbol(){try{renameGraphSymbol(props.graph,symbolUuid.value,renameValue.value);synchronizeGraphSignatures(props.graph);renameValue.value='';changed()}catch(error){addEditorLog(error instanceof Error?error.message:String(error),'Script','error')}}
/** 将选中节点提取为函数并切换到新函数。 */
function extractFunction(){try{const routine=extractGraphFunction(props.graph,new Set(props.selectedNodeUuids),extractName.value);emit('scope',routine.uuid);changed()}catch(error){addEditorLog(error instanceof Error?error.message:String(error),'Script','error')}}
/** 替换选中节点类型，错误保留在局部日志。 */
function replaceNode(){try{replaceGraphNodeType(props.graph,props.selectedNodeUuids[0],replacementType.value);changed()}catch(error){addEditorLog(error instanceof Error?error.message:String(error),'Script','error')}}
/** 迁移弃用节点并报告数量，实际变化时才标脏。 */
function migrateDeprecated(){const count=migrateDeprecatedGraphNodes(props.graph);addEditorLog(t('nodesMigrated',{count}),'Script');if(count)changed()}
/** 保存当前图为合并基线并清空旧差异和错误。 */
function captureBase(){baseSource.value=serializeGraphDocument(props.graph);diff.value=[];mergeResult.value=null;mergeError.value=''}
/** 计算基线与当前图的语义差异，保留解析错误说明。 */
function refreshDiff(){try{diff.value=semanticGraphDiff(parseGraphDocument(baseSource.value),props.graph);mergeError.value=''}catch(error){mergeError.value=error instanceof Error?error.message:String(error)}}
/** 执行基线、当前图和传入图的三方合并预览。 */
function performMerge(){try{mergeResult.value=mergeGraphs(baseSource.value,serializeGraphDocument(props.graph),theirsSource.value);diff.value=mergeResult.value.changes;mergeError.value=''}catch(error){mergeResult.value=null;mergeError.value=error instanceof Error?error.message:String(error)}}
/** 按用户选择解决指定合并冲突。 */
function resolveConflict(id:string,resolution:'ours'|'theirs'){if(mergeResult.value)mergeResult.value=applyGraphConflict(mergeResult.value,id,resolution)}
/** 仅在全部冲突已解决时请求父级应用合并图。 */
function applyMerge(){if(!mergeResult.value||mergeResult.value.conflicts.some(/* 比较 item.resolution 与 'unresolved'，返回严格相等的判断结果。 */ item=>item.resolution==='unresolved'))return;emit('replaceGraph',mergeResult.value.graph);mergeResult.value=null}
/** 生成关联脚本；同步失败时记录局部错误，不写入成功历史或触发全局崩溃界面。 */
function generateRhaiAsset(){
  try {
  if(!linkedSource.value)return
  const result=ensureLinkedScriptForGraph(props.graph)
  if(!result)return
  const asset=assetState.records.find(/** 查找已验证提交的伙伴，用于成功提示。 */ item=>item.uuid===result.scriptUuid)
  if(!asset)return
  pushHistory(result.created?'Create linked Rhai for visual graph':'Synchronize linked Rhai from visual graph')
  addEditorLog(t('generatedRhaiAsset',{name:asset.name}),'Script','info',asset.uuid)
  } catch(error) { addEditorLog(error instanceof Error?error.message:String(error),'Script','error') }
}
</script>

<style scoped>
.production-panel { container: production-panel / inline-size; min-width: 0; flex: 0 0 auto; border-bottom: var(--ui-border-width) solid var(--border-subtle); }
.production-tabs { position: sticky; top: 0; z-index: 3; background: var(--surface-1); border-bottom: var(--ui-border-width) solid var(--border-subtle); }
.production-content { min-width: 0; padding: var(--space-2); display: grid; gap: var(--space-2); }
.production-content > header, .subhead { min-height: var(--ui-standard-height); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-control-gap); border-bottom: var(--ui-border-width) solid var(--border-subtle); }
.production-content > header span, small { color: var(--text-muted); font-size: var(--type-caption); }
.action-grid { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.production-card,.breakpoint-card,.conflict-card { min-width: 0; display: grid; gap: var(--space-1); padding-block: var(--space-2); border-bottom: var(--ui-border-width) solid var(--border-subtle); }.production-card.active { border-inline-start: var(--space-0) solid var(--accent); padding-inline-start: var(--space-2); }
.card-title,.checks,.breakpoint-card > div,.conflict-card > div { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); min-width: 0; }.card-title .name { flex: 1 1 12ch; text-align: start; min-width: 0; overflow-wrap: anywhere; }.checks label { display: flex; align-items: center; gap: var(--ui-control-gap); font-size: var(--type-body); line-height: var(--line-body); }
.symbol-row { min-width: 0; min-height: var(--ui-standard-height); display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); }.symbol-row input:not([type=checkbox]) { flex: 1 1 14ch; }.symbol-row select { width: auto; }.symbol-row small { overflow-wrap: anywhere; }.grow { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.interface-method { min-width: 0; display: grid; gap: var(--space-1); padding-inline-start: var(--space-2); border-inline-start: var(--ui-border-width) solid var(--border-subtle); }.interface-parameter { padding-inline-start: var(--space-2); }
.hint,.debug-reason,.link-status { margin: 0; color: var(--text-muted); font-size: var(--type-caption); line-height: var(--line-body); overflow-wrap: anywhere; }.paused,.merge-error,.danger,.error-row { color: var(--danger); }.live { color: var(--success); }
.metric-grid { display: flex; flex-wrap: wrap; gap: var(--space-2); }.metric-grid span { display: grid; gap: var(--space-1); flex: 1 1 10ch; min-width: 0; color: var(--text-muted); font-size: var(--type-caption); }.metric-grid strong { color: var(--text-primary); }
.watch-row { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr) var(--ui-control-height); align-items: center; gap: var(--space-1); }.watch-row code { min-width: 0; overflow-wrap: anywhere; font-size: var(--type-caption); }.breakpoint-card > div button { flex: 1; text-align: start; }
.trace-row,.error-row,.reference-list button { width: 100%; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); text-align: start; }.trace-row small,.error-row small,.reference-list small { overflow-wrap: anywhere; }.inline-action { display: flex; flex-wrap: wrap; gap: var(--space-1); }.inline-action input { flex: 1 1 14ch; }
.reference-list,.migration-list { max-height: calc(6 * var(--ui-tree-row-height)); overflow: auto; }.migration-list { margin: 0; padding-inline-start: var(--space-4); color: var(--text-muted); font-size: var(--type-caption); }
.code-view pre { max-height: calc(18 * var(--ui-control-height)); margin: 0; padding: var(--space-2); overflow: auto; background: var(--bg-canvas); font-size: var(--type-caption); white-space: pre-wrap; overflow-wrap: anywhere; }
.conversion-coverage { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: baseline; padding-block: var(--space-2); border-bottom: var(--ui-border-width) solid var(--border-subtle); }.conversion-coverage strong { color: var(--accent); }.escape-block { display: grid; gap: var(--space-1); padding-inline-start: var(--space-2); border-inline-start: var(--space-0) solid var(--warning); }.escape-block code { white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--type-caption); }.link-status { display: flex; align-items: center; gap: var(--space-1); }
@container production-panel (max-width: 300px) { .watch-row { grid-template-columns: minmax(0,1fr) var(--ui-control-height); }.watch-row code { grid-column: 1 / -1; grid-row: 2; } }
</style>
