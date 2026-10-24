/** 稳定创作者平台资料：组织兼容边界、功能状态和创作验证信息。 */
import { CREATOR_LEARNING_GUIDES, type LearningGuide } from './creatorLearning'
import { PLATFORM_GAP_REGISTER, PLATFORM_GAP_SUMMARY } from './platformGapRegister'
import { NOVA_FEATURE_FREEZE, NOVA_STABLE_CONTRACTS } from './stableContracts'
import { NOVA_ENGINE_VERSION, NOVA_RELEASE_NAME } from '../projects/projectFormat'

export type ReadinessStatus = 'covered' | 'not-applicable' | 'external'
export type ReadinessDimension = 'binding' | 'validation' | 'undo' | 'persistence' | 'runtimeExport' | 'documentation' | 'tests'
export type EvidenceAuthority = 'implementation' | 'validation' | 'transaction' | 'serialization' | 'runtime-export' | 'documentation' | 'automated-test' | 'scope-contract' | 'external-evidence'

export interface ReadinessEvidence {
  status: ReadinessStatus
  route: string
  detail: string
  authority: EvidenceAuthority
  source: string
  gapId?: string
}

export interface CreatorFeatureReadiness {
  id: string
  feature: string
  panel: string
  workspace: string
  taskProject: boolean
  policy: string
  dimensions: Record<ReadinessDimension, ReadinessEvidence>
}

export interface CreatorReadinessPolicy {
  catalogPrefix: string
  owner: string
  dimensions: Record<ReadinessDimension, ReadinessEvidence>
}

const RELEASE = NOVA_RELEASE_NAME
const MACHINE_VERSION = NOVA_ENGINE_VERSION
const SCOPE_DOCUMENT = 'docs/STABLE_CONTRACTS.md'

/* 调用 Object.freeze({ status, authority, source, route, detail, ...(gapId ? { gapId } : {}) }) 并返回调用结果。 */ function evidence(status: ReadinessStatus, authority: EvidenceAuthority, source: string, route: string, detail: string, gapId?: string): ReadinessEvidence {
  return Object.freeze({ status, authority, source, route, detail, ...(gapId ? { gapId } : {}) })
}

/* 调用 evidence('covered', authority, source, route, detail) 并返回调用结果。 */ function local(authority: Exclude<EvidenceAuthority, 'scope-contract' | 'external-evidence'>, source: string, route: string, detail: string): ReadinessEvidence {
  return evidence('covered', authority, source, route, detail)
}

/* 调用 evidence('not-applicable', 'scope-contract', SCOPE_DOCUMENT, 'scope:26.10/{id}', detail) 并返回调用结果。 */ function excluded(detail: string): ReadinessEvidence {
  return evidence('not-applicable', 'scope-contract', SCOPE_DOCUMENT, 'scope:26.10/{id}', detail)
}

/** 结构说明（自动提取）：documentation；无显式参数；直接调用 local。 */ function documentation(): ReadinessEvidence {
  return local('documentation', 'manual/MANUAL.en.md', 'manual:EN/DE/ZH#{id}', 'The operation has a stable manual anchor in each bundled locale; manual parity and link audits are separate release gates.')
}

interface AuthoredPolicyOptions {
  prefix: string
  owner: string
  binding: string
  validation: string
  persistence: string
  runtime: string
  tests: string
  family: string
  undo?: string
}

/** 结构说明（自动提取）：authoredPolicy；输入 options；直接调用 Object.freeze、local、documentation。 */ function authoredPolicy(options: AuthoredPolicyOptions): CreatorReadinessPolicy {
  return Object.freeze({
    catalogPrefix: options.prefix,
    owner: options.owner,
    dimensions: Object.freeze({
      binding: local('implementation', options.binding, `control:${options.prefix}/{id}`, `The ${options.owner} implementation owns the control-to-command route for this exact catalog operation.`),
      validation: local('validation', options.validation, `validation:${options.prefix}/{id}`, 'The owning subsystem validates selection, value, permission and finite-state preconditions before mutation.'),
      undo: local('transaction', options.undo ?? 'src/runtime/projectMutationRouter.ts', `transaction:${options.prefix}/{id}`, 'The authored mutation enters the project transaction route and retains Undo/Redo or a named subsystem rollback boundary.'),
      persistence: local('serialization', options.persistence, `serialization:${options.prefix}/{id}`, 'The authored result has a named canonical owner and participates in save, reload and compatibility checks.'),
      runtimeExport: local('runtime-export', options.runtime, `runtime-export:${options.prefix}/{id}`, 'The authored result reaches the shared preview/player/build path and is subject to deterministic export qualification.'),
      documentation: documentation(),
      tests: local('automated-test', options.tests, `qualification:${RELEASE}/${options.family}/{id}`, `The operation is assigned to the ${options.family} executable evidence family; a release report, rather than this mapping, records pass or failure.`)
    })
  })
}

interface EditorPolicyOptions {
  prefix: string
  owner: string
  binding: string
  validation: string
  persistence?: string
  tests: string
  family: string
  mutatesWorkspace?: boolean
}

/** 结构说明（自动提取）：editorPolicy；输入 options；直接调用 Object.freeze、local、excluded、documentation。 */ function editorPolicy(options: EditorPolicyOptions): CreatorReadinessPolicy {
  const mutatesWorkspace = options.mutatesWorkspace ?? true
  return Object.freeze({
    catalogPrefix: options.prefix,
    owner: options.owner,
    dimensions: Object.freeze({
      binding: local('implementation', options.binding, `control:${options.prefix}/{id}`, `The ${options.owner} implementation owns the exact editor command route.`),
      validation: local('validation', options.validation, `validation:${options.prefix}/{id}`, 'The editor command checks its active document, selection, mode and availability before changing state.'),
      undo: mutatesWorkspace
        ? local('transaction', 'src/store/editor.ts', `workspace-transaction:${options.prefix}/{id}`, 'Workspace-only changes use reversible editor state, layout history or an explicit reset path.')
        : excluded('This operation observes or navigates editor state and does not mutate authored project data.'),
      persistence: options.persistence
        ? local('serialization', options.persistence, `workspace-persistence:${options.prefix}/{id}`, 'The editor-only value has an explicit workspace or preference owner and is excluded from game data.')
        : excluded('Ephemeral editor observation is intentionally not serialized into project or player data.'),
      runtimeExport: excluded('Editor navigation, diagnostics or recovery UI is intentionally excluded from exported players.'),
      documentation: documentation(),
      tests: local('automated-test', options.tests, `qualification:${RELEASE}/${options.family}/{id}`, `The operation is assigned to the ${options.family} editor evidence family; the release report records its outcome.`)
    })
  })
}

/** 结构说明（自动提取）：projectManagerPolicy；无显式参数；直接调用 Object.freeze、local、excluded、documentation。 */ function projectManagerPolicy(): CreatorReadinessPolicy {
  return Object.freeze({
    catalogPrefix: 'project-manager', owner: 'Project Manager',
    dimensions: Object.freeze({
      binding: local('implementation', 'src/components/ProjectManager.vue', 'control:project-manager/{id}', 'Project Manager owns create, open, import, template and migration entry points.'),
      validation: local('validation', 'src/runtime/projectUpgrade.ts', 'validation:project-manager/{id}', 'Input is parsed without execution and checked for supported format, schema, paths, package requirements and deterministic migration before session replacement.'),
      undo: local('transaction', 'src/runtime/recovery.ts', 'recovery:project-manager/{id}', 'Project creation/import/migration preserves the source, preview and named rollback or cancellation boundary.'),
      persistence: local('serialization', 'src/projects/projectManager.ts', 'project-registry:project-manager/{id}', 'Project identity, recent entries and canonical imported project data have explicit persistence owners.'),
      runtimeExport: excluded('Launcher operations prepare projects but are not included as player behavior.'),
      documentation: documentation(),
      tests: local('automated-test', 'crates/nova_format/src/lib.rs', `qualification:${RELEASE}/migration-history/{id}`, 'Historical, malformed, future and current project inputs are assigned to the migration/history family.')
    })
  })
}

/** 结构说明（自动提取）：taskPolicy；输入 prefix、fixture；直接调用 authoredPolicy。 */ function taskPolicy(prefix: string, fixture: string): CreatorReadinessPolicy {
  return authoredPolicy({
    prefix, owner: 'Guided Project', binding: 'src/runtime/creatorLearning.ts', validation: 'src/runtime/productionValidation.ts',
    persistence: `${fixture}/project.nova`, runtime: 'src/runtime/productionRuntime.ts', tests: `${fixture}/test-controls.json`, family: `guided-project/${prefix}`
  })
}

/**
 * Exact catalog-prefix policies. A guide that matches zero or more than one policy
 * throws during module initialization; there is deliberately no catch-all route.
 */
export const CREATOR_READINESS_POLICIES: readonly CreatorReadinessPolicy[] = Object.freeze([
  projectManagerPolicy(),
  editorPolicy({ prefix: 'workspaces', owner: 'Workspace Manager', binding: 'src/components/WorkspaceManager.vue', validation: 'src/store/editor.ts', persistence: 'src/store/preferences.ts', tests: 'scripts/verify-2640-editor-workflow.mjs', family: 'workspace-navigation' }),
  authoredPolicy({ prefix: 'hierarchy', owner: 'Hierarchy', binding: 'src/components/SceneSideBar.vue', validation: 'src/projects/projectData.ts', persistence: 'src/projects/projectData.ts', runtime: 'src/runtime/productionRuntime.ts', tests: 'scripts/verify-2640-editor-workflow.mjs', family: 'hierarchy-scene' }),
  authoredPolicy({ prefix: 'viewport', owner: 'Scene View', binding: 'src/components/WorldCanvas.vue', validation: 'src/store/editor.ts', persistence: 'src/projects/projectData.ts', runtime: 'src/runtime/productionRuntime.ts', tests: 'scripts/verify-2640-editor-workflow.mjs', family: 'viewport-tools' }),
  authoredPolicy({ prefix: 'inspector', owner: 'Inspector', binding: 'src/components/ConfigPanel.vue', validation: 'src/runtime/productionValidation.ts', persistence: 'src/projects/projectData.ts', runtime: 'src/runtime/productionRuntime.ts', tests: 'scripts/verify-2641-editor-ui.mjs', family: 'component-runtime' }),
  authoredPolicy({ prefix: 'assets', owner: 'Asset workspace', binding: 'src/components/ContentAssetInspector.vue', validation: 'src/runtime/resources.ts', persistence: 'src/projects/projectArchive.ts', runtime: 'src/runtime/gameExporter.ts', tests: 'scripts/verify-v26.15-library-metadata.mjs', family: 'content-import' }),
  authoredPolicy({ prefix: 'physics', owner: 'Physics Settings and Monitor', binding: 'src/components/PhysicsSettingsPanel.vue', validation: 'src/runtime/physicsProduction.ts', persistence: 'src/projects/projectData.ts', runtime: 'src/runtime/GameplayRuntimeCore.ts', tests: 'crates/nova_physics/src/tests.rs', family: 'physics-determinism' }),
  authoredPolicy({ prefix: 'script', owner: 'Script Studio', binding: 'src/components/ScriptStudio.vue', validation: 'src/runtime/scriptContracts.ts', persistence: 'src/projects/projectData.ts', runtime: 'src/runtime/GameplayRuntimeCore.ts', tests: 'scripts/verify-2643-scripting.mjs', family: 'rhai-runtime' }),
  authoredPolicy({ prefix: 'event-sheet', owner: 'Event Sheet', binding: 'src/components/EventSheetEditor.vue', validation: 'src/runtime/eventSheets.ts', persistence: 'src/runtime/eventSheets.ts', runtime: 'src/runtime/GameplayRuntimeCore.ts', tests: 'scripts/verify-2643-blocks.mjs', family: 'event-scheduling' }),
  authoredPolicy({ prefix: 'visual-graph', owner: 'Visual Graph Editor', binding: 'src/components/VisualGraphEditor.vue', validation: 'src/visual/graphProduction.ts', persistence: 'src/visual/graphTypes.ts', runtime: 'src/visual/graphCompiler.ts', tests: 'scripts/verify-2643-blocks.mjs', family: 'graph-code-parity' }),
  authoredPolicy({ prefix: 'animation', owner: 'Animation workspace', binding: 'src/components/AnimationPanel.vue', validation: 'src/runtime/animationProduction.ts', persistence: 'src/runtime/animation.ts', runtime: 'src/runtime/animationProduction.ts', tests: 'scripts/verify-2644-animation.mjs', family: 'animation-determinism' }),
  authoredPolicy({ prefix: 'interface', owner: 'Interface workspace', binding: 'src/runtime/uiProduction.ts', validation: 'src/runtime/uiAccessibility.ts', persistence: 'src/projects/projectData.ts', runtime: 'src/runtime/gameUi.ts', tests: 'scripts/verify-2643-editor-shell.mjs', family: 'ui-accessibility' }),
  authoredPolicy({ prefix: 'audio', owner: 'Audio Studio', binding: 'src/components/AudioSystemPanel.vue', validation: 'src/runtime/audio.ts', persistence: 'src/projects/projectData.ts', runtime: 'src/runtime/audio.ts', tests: 'scripts/verify-2643-scripting.mjs', family: 'audio-runtime' }),
  authoredPolicy({ prefix: 'world', owner: 'World Studio', binding: 'src/components/WorldToolsPanel.vue', validation: 'src/runtime/worldGameplay.ts', persistence: 'src/runtime/worldStreaming.ts', runtime: 'src/runtime/tileSceneRuntime.ts', tests: 'scripts/verify-2642-levels.mjs', family: 'world-navigation-streaming' }),
  authoredPolicy({ prefix: 'rendering', owner: 'Rendering Studio', binding: 'src/components/RenderingPanel.vue', validation: 'src/runtime/productionValidation.ts', persistence: 'src/projects/projectData.ts', runtime: 'src/runtime/productionRuntime.ts', tests: 'scripts/verify-2642-lighting-render.mjs', family: 'renderer-determinism' }),
  editorPolicy({ prefix: 'debug', owner: 'Debug workspace', binding: 'src/components/ProfilerPanel.vue', validation: 'src/runtime/profiler.ts', tests: 'scripts/verify-2644-debugger.mjs', family: 'debug-performance', mutatesWorkspace: false }),
  authoredPolicy({ prefix: 'manage', owner: 'Settings and Project Health', binding: 'src/components/ManageWorkspace.vue', validation: 'src/runtime/projectIntegrity.ts', persistence: 'src/projects/projectData.ts', runtime: 'src/runtime/gameExporter.ts', tests: 'scripts/verify-2640-editor-workflow.mjs', family: 'project-health-settings' }),
  authoredPolicy({ prefix: 'ecosystem', owner: 'Ecosystem Studio', binding: 'src/components/EcosystemStudioPanel.vue', validation: 'src/runtime/packages.ts', persistence: 'src/runtime/packages.ts', runtime: 'src/runtime/plugins.ts', tests: 'scripts/verify-v26.11-templates.mjs', family: 'package-plugin-security' }),
  editorPolicy({ prefix: 'automation', owner: 'Automation Studio', binding: 'src/components/AutomationStudio.vue', validation: 'src/runtime/editorAutomation.ts', persistence: 'src/projects/projectData.ts', tests: 'scripts/verify-2643-event-timing.mjs', family: 'automation-sandbox' }),
  authoredPolicy({ prefix: 'network', owner: 'Network Studio', binding: 'src/components/NetworkStudioPanel.vue', validation: 'src/runtime/networkProduction.ts', persistence: 'src/runtime/networking.ts', runtime: 'src/runtime/networkProtocol.ts', tests: 'crates/nova_headless/src/main.rs', family: 'network-determinism' }),
  authoredPolicy({ prefix: 'build', owner: 'Build Settings', binding: 'src/components/BuildSettingsPanel.vue', validation: 'src/runtime/buildSettings.ts', persistence: 'src/runtime/buildSettings.ts', runtime: 'src/runtime/gameExporter.ts', tests: 'scripts/verify-2643-exported-web.mjs', family: 'export-release', undo: 'src/runtime/projectTransactions.ts' }),
  editorPolicy({ prefix: 'recovery-team', owner: 'Recovery and Team Workflow', binding: 'src/components/RecoveryCenter.vue', validation: 'src/runtime/projectIntegrity.ts', persistence: 'src/runtime/recovery.ts', tests: 'crates/nova_format/src/lib.rs', family: 'recovery-semantic-merge' }),
  taskPolicy('task-snake', 'reference-projects/projects/creator-v60-snake'),
  taskPolicy('task-platformer', 'reference-projects/projects/creator-v60-platformer'),
  taskPolicy('task-top-down', 'reference-projects/projects/creator-v60-top-down'),
  taskPolicy('task-physics-puzzle', 'reference-projects/projects/creator-v60-physics-puzzle'),
  taskPolicy('task-menu', 'reference-projects/projects/creator-v60-localized-menu'),
  taskPolicy('task-cutscene', 'reference-projects/projects/creator-v60-animation-cutscene'),
  taskPolicy('task-tilemap', 'reference-projects/projects/creator-v60-tilemap-world'),
  taskPolicy('task-save', 'reference-projects/projects/creator-v60-save-checkpoint'),
  taskPolicy('task-network', 'reference-projects/projects/creator-v60-network-sample'),
  taskPolicy('task-web', 'reference-projects/projects/creator-v60-web-deployment'),
  taskPolicy('task-windows', 'reference-projects/projects/creator-v60-windows-portable'),
  taskPolicy('task-package', 'reference-projects/projects/creator-v60-package-plugin'),
  taskPolicy('task-object-family', 'reference-projects/projects/creator-v2614-enemy-family')
])

/* 调用 Object.freeze({ ...template, route: template.route.split('{id}').join(guide.id) }) 并返回调用结果。 */ function materialize(template: ReadinessEvidence, guide: LearningGuide): ReadinessEvidence {
  return Object.freeze({ ...template, route: template.route.split('{id}').join(guide.id) })
}

export const CREATOR_READINESS_DIMENSIONS: readonly ReadinessDimension[] = Object.freeze(['binding', 'validation', 'undo', 'persistence', 'runtimeExport', 'documentation', 'tests'])

/** 结构说明（自动提取）：readinessFor；输入 guide；直接调用 CREATOR_READINESS_POLICIES.filter、Error、Object.fromEntries、CREATOR_READINESS_DIMENSIONS.map、Object.freeze 等；包含显式抛错路径。 */ function readinessFor(guide: LearningGuide): CreatorFeatureReadiness {
  const matches = CREATOR_READINESS_POLICIES.filter(/* 先计算 guide.id === policy.catalogPrefix；仅当其为假值时求右侧 guide.id.startsWith(`${policy.catalogPrefix}-`)，返回短路求值结果。 */ policy => guide.id === policy.catalogPrefix || guide.id.startsWith(`${policy.catalogPrefix}-`))
  if (matches.length !== 1) throw new Error(`Readiness policy invariant failed for ${guide.id}: expected one exact prefix policy, found ${matches.length}.`)
  const policy = matches[0]
  const dimensions = Object.fromEntries(CREATOR_READINESS_DIMENSIONS.map(/* 返回按声明顺序构造的数组 [dimension, materialize(policy.dimensions[dimension], guide)]。 */ dimension => [dimension, materialize(policy.dimensions[dimension], guide)])) as Record<ReadinessDimension, ReadinessEvidence>
  return Object.freeze({ id: guide.id, feature: guide.feature, panel: guide.panel, workspace: guide.workspace, taskProject: Boolean(guide.taskProject), policy: policy.catalogPrefix, dimensions: Object.freeze(dimensions) })
}

export const CREATOR_PLATFORM_READINESS: readonly CreatorFeatureReadiness[] = Object.freeze(CREATOR_LEARNING_GUIDES.map(readinessFor))

export const CREATOR_PLATFORM_SUMMARY = Object.freeze({
  release: RELEASE,
  machineVersion: MACHINE_VERSION,
  features: CREATOR_PLATFORM_READINESS.length,
  policies: CREATOR_READINESS_POLICIES.length,
  dimensions: CREATOR_READINESS_DIMENSIONS.length,
  covered: CREATOR_PLATFORM_READINESS.reduce(/** 结构说明（自动提取）：CREATOR_PLATFORM_READINESS.reduce 回调；输入 count、item；直接调用 CREATOR_READINESS_DIMENSIONS.filter；返回表达式求值结果。 */ (count, item) => count + CREATOR_READINESS_DIMENSIONS.filter(/* 比较 item.dimensions[dimension].status 与 'covered'，返回严格相等的判断结果。 */ dimension => item.dimensions[dimension].status === 'covered').length, 0),
  notApplicable: CREATOR_PLATFORM_READINESS.reduce(/** 结构说明（自动提取）：CREATOR_PLATFORM_READINESS.reduce 回调；输入 count、item；直接调用 CREATOR_READINESS_DIMENSIONS.filter；返回表达式求值结果。 */ (count, item) => count + CREATOR_READINESS_DIMENSIONS.filter(/* 比较 item.dimensions[dimension].status 与 'not-applicable'，返回严格相等的判断结果。 */ dimension => item.dimensions[dimension].status === 'not-applicable').length, 0),
  external: CREATOR_PLATFORM_READINESS.reduce(/** 结构说明（自动提取）：CREATOR_PLATFORM_READINESS.reduce 回调；输入 count、item；直接调用 CREATOR_READINESS_DIMENSIONS.filter；返回表达式求值结果。 */ (count, item) => count + CREATOR_READINESS_DIMENSIONS.filter(/* 比较 item.dimensions[dimension].status 与 'external'，返回严格相等的判断结果。 */ dimension => item.dimensions[dimension].status === 'external').length, 0),
  uncovered: CREATOR_PLATFORM_READINESS.reduce(/** 结构说明（自动提取）：CREATOR_PLATFORM_READINESS.reduce 回调；输入 count、item；直接调用 CREATOR_READINESS_DIMENSIONS.filter；返回表达式求值结果。 */ (count, item) => count + CREATOR_READINESS_DIMENSIONS.filter(/* 返回 item.dimensions[dimension] 的逻辑取反结果。 */ dimension => !item.dimensions[dimension]).length, 0),
  openBlockingGaps: PLATFORM_GAP_SUMMARY.openBlocking,
  deferredExternalGaps: PLATFORM_GAP_SUMMARY.deferredExternal
})

export const CREATOR_CONTRACT_REVIEW = Object.freeze({
  release: RELEASE,
  machineVersion: MACHINE_VERSION,
  reviewedContracts: NOVA_STABLE_CONTRACTS.length,
  currentContractsFrozen: NOVA_STABLE_CONTRACTS.every(/* 返回 contract.frozen 的当前值。 */ contract => contract.frozen),
  schemaChangeApproved: false,
  breakingChangesApproved: 0,
  nextContractDecision: 'deferred' as const,
  decision: 'Retain Project Format 2/schema 29, Rhai API 2, Visual Graph 1, Plugin API 2, Package Manifest 1, Build CLI 1 and Workspace document 3. No demonstrated migration or ecosystem evidence justifies a breaking contract in 26.10.',
  earliestNextReview: NOVA_FEATURE_FREEZE.earliestApproval,
  gapRegister: 'src/runtime/platformGapRegister.ts',
  openBlockingGaps: PLATFORM_GAP_SUMMARY.openBlocking,
  reasons: Object.freeze([
    'The reviewed 26.10 capability set fits the seven existing contracts additively.',
    'Historical migration and compatibility paths remain required and no authored data may be removed for a calendar version.',
    'Independent ecosystem, matching-host and clean-machine evidence remains explicitly deferred-external.',
    'Any future contract requires a demonstrated need, preview, complete backup, deterministic migration, semantic diff, validation, rollback and golden fixtures.'
  ])
})

export const CREATOR_SUPPORT_MATRIX = Object.freeze([
  Object.freeze({ target: 'Windows editor/player', status: 'tier-1-local', evidence: 'Local native editor, portable game, MSI/setup build routes and launch smoke; signing and independent clean-machine lifecycle remain deferred-external.' }),
  Object.freeze({ target: 'Web player', status: 'tier-1-local', evidence: 'Production Web/WASM build and hosted-player archive; HTTP(S) is required. Firefox/WebKit independent evidence remains deferred-external.' }),
  Object.freeze({ target: 'Linux editor/player/server', status: 'matching-host-external', evidence: 'Source and pipeline definitions exist; matching-host graphics/audio/input/package/lifecycle evidence is required.' }),
  Object.freeze({ target: 'macOS editor/player', status: 'matching-host-external', evidence: 'Xcode, hardware, signing, notarization and lifecycle evidence is required.' }),
  Object.freeze({ target: 'Android player', status: 'optional-gated', evidence: 'Optional experimental path; JDK/SDK/NDK/template, signing, clean-device, hardware and store gates remain explicit.' }),
  Object.freeze({ target: 'iOS / consoles', status: 'deferred-or-excluded', evidence: 'iOS needs a matching-host program; proprietary console SDKs and agreements are not bundled.' }),
  Object.freeze({ target: '3D / XR / ray tracing', status: 'out-of-scope', evidence: 'Nova_A 26.10 remains a focused local-first 2D engine.' })
])

export const CREATOR_PLATFORM_GAPS = PLATFORM_GAP_REGISTER
export const CREATOR_PLATFORM_GAP_SUMMARY = PLATFORM_GAP_SUMMARY
