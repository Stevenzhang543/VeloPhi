# Messages of the core (keys)

The physics core writes no natural language (manual 26.50, D27). Warnings and errors are `{ key, params }`, built
the same way by the TypeScript engine (`msg()` in `src/i18n/message.ts`) and the Rust engine (`Message` in
`velophi-core/src/message.rs`); the parity harness compares them in full (key and every parameter, numbers by their
bits). The interface renders them in the current language: run messages with `src/i18n/coreText.ts`
(`renderMessage`, `msgText`). Numbers are SI; formatting is the interface's business.

## Run messages (recordings, both engines)

| Key | Parameters | 26.49 text (zh) |
| --- | --- | --- |
| `warn.initialOverlapRemoved` | mm | 初始重叠 … mm 已移除（物体被推到刚好接触） |
| `warn.initialDeepOverlap` | pairs[] | 初始时 … 深度重叠（超过 5 cm）…请调整位置 |
| `warn.reducedAccuracy` | t, reason (message) | 自 t = … s 起改用 Moreau–Jean 时间步进（reason）：精度降级… |
| `reason.moreauSelected` | — | 已选择 Moreau–Jean 时间步进 |
| `reason.eventsAtInstant` | t, count | t = … s 处同一时刻发生 … 次状态切换 |
| `reason.eventStorm` | count, window | 碰撞与接触切换过于密集（… 次 / … s） |
| `warn.ambiguousMode` | violation | t 时刻接触状态无完全一致解（违背量 …），已取最接近的一种 |
| `warn.multiImpactFriction` | — | 多个接触点同时碰撞时没有找到满足库仑摩擦且不增能的冲量组合（26.51，D37）… |
| `warn.multiImpactPlastic` | — | 多个接触点同时碰撞时，按牛顿恢复定律逐点反弹会使动能增加，这类碰撞已按完全非弹性（e = 0）处理（26.51） |
| `warn.polygonCentred` | body | (26.49: English text) polygon points are taken relative to its centre of mass |
| `warn.muSBelowMuK` | body | (26.49: English text) μs < μk |
| `err.forceNotFinite` | force, t, fx, fy | …：变力表达式在 t = … s 时没有有限值…，仿真停止 |
| `err.stepTooSmall` | t | 步长过小（t = … s），仿真停止 |
| `err.stateNotFinite` | t | t = … s 时运动状态不再是有限值（物体被加速到无穷远…），仿真停止 (new in 26.52) |
| `err.switchChatter` | force, t | …：变力表达式在 t = … s 附近反复切换…，仿真停止 |
| `err.eventChatter` | t, count | t = … s 处事件抖振（同一时刻 … 次状态切换），仿真停止 |
| `err.stepLimit` | — | 步数超过上限，仿真停止 |
| `err.chunkStepLimit` | t, limit | t = … s 附近 1 个计算块内积分步数超过 …，仿真停止 (new in 26.50) |
| `err.budget` | seconds, t | 计算时间超过 … s，已计算到 t = … s |
| `err.cancelled` | — | 已取消 |
| `err.internal` | message | 求解器内部错误：… |

## Scene loading (Rust `scene.rs`)

The interface validates scenes with the TypeScript loader (`src/core/scene/io.ts`) before a run starts, so these
reach the user only if the two loaders ever disagree; they are rendered as key and parameters.

| Key | Parameters |
| --- | --- |
| `scene.invalidJson` | detail |
| `scene.notScene` | — |
| `scene.wrongFormat` | — |
| `scene.newerVersion` | version |
| `scene.cannotMigrate` | version |
| `scene.notList` | path |
| `scene.duplicateBodyId` | id |
| `scene.massNotPositive` | body |
| `scene.sizeNotPositive` | body |
| `scene.radiusNotPositive` | body |
| `scene.polygonTooFew` | body |
| `scene.materialRange` | body |
| `scene.stiffnessNotPositive` | connector |
| `scene.connectorBodyMissing` | connector, body |
| `scene.pulleyBodyMissing` | pulley, body |
| `scene.ropePulleyMissing` | connector, pulley |
| `scene.ropeSamePulleyTwice` | connector |
| `scene.ropeEndOnPulleyBody` | connector, … |
| `scene.variableForceNeedsBody` | connector |
| `scene.forceExprInvalid` | connector, component, reason (expr.* message) |
| `scene.durationRange` | max |
| `scene.legacyDurationRange` | max |
| `scene.stopAtUnknown` | — |
| `scene.stopAtDelayRange` | max |
| `scene.outputStepRange` | — |
| `scene.tolerancesNotPositive` | — |
| `scene.cubicNotFinite` | connector (26.51) |
| `scene.damperNegative` | connector (26.51) |
| `scene.sliderAxisZero` | connector (26.51) |
| `scene.gearInvalid` | connector (26.51) |
| `scene.gravitationNotPositive` | — (26.51) |
| `scene.dragNegative` | body (26.51) |
| `scene.rollingRange` | body (26.52; a pair: "a–b") |
| `scene.softStepRange` | — (26.58: `settings.softStep` substeps 1–16, stepHz 30–2000) |
| `scene.motorMaxTorque` | connector (26.52) |
| `scene.sliderLimits` | connector (26.52) |
| `scene.sliderLimitRestitution` | connector (26.52) |
| `scene.centralInvalid` | connector (26.52) |
| `scene.centralTargetMissing` | connector, body (26.52) |
| `scene.polygonNotSimple` | body (26.52: self-intersecting or zero-area polygon) |
| `scene.compoundEmpty` | body (26.52) |
| `scene.compoundPartInvalid` | body (26.52) |

## Force expressions (Rust `expr.rs`)

Nested in `scene.forceExprInvalid`. The editor checks expressions with the TypeScript parser (`forceExpr.ts`), whose texts are translated with the interface tables.

| Key | Parameters |
| --- | --- |
| `expr.empty` | — |
| `expr.emptyComponent` | — |
| `expr.incomplete` | src |
| `expr.unknownVariable` | name |
| `expr.unknownFunction` | name |
| `expr.functionNotAllowed` | name |
| `expr.functionNeedsParens` | name |
| `expr.arity` | name, arity, count |
| `expr.comparisonOnlyInIf` | — |
| `expr.ifNeedsComparison` | — |
| `expr.dimMismatch` | what, a, b |
| `expr.dimensionedPower` | dim |
| `expr.argumentNotDimensionless` | function, dim |
| `expr.notForce` | dim |

## Model registry (Rust `modelcalc.rs`, 26.56)

| key | params |
| --- | --- |
| `model.unknown` | model |
| `model.unknownInput` | model, input |
| `model.unknownName` | name |
| `model.dimensionedExponent` | — |
| `model.dimensionedPower` | — |
| `model.argumentNotDimensionless` | function, dim |
| `model.dimMismatch` | what, a, b |

## ABI

| Key | Parameters |
| --- | --- |
| `abi.noScene` | — |
| `abi.badOption` | option |
| `engine.wasmUnavailable` (interface) | detail |

## Chemistry (Rust `velophi-chem`, 26.64)

Errors of the chemistry operations and of a bench session. What a model cannot compute is not an error but a
diagnostic `{ code, severity, params }` in the result (`CHEM.md`); the interface renders those from their codes.

| Key | Parameters |
| --- | --- |
| `chem.noData` | — |
| `chem.badData` | what |
| `chem.unknownSpecies` | id |
| `chem.unknownReagent` | id |
| `chem.unknownVessel` | id |
| `chem.badAmount` | what |
| `chem.notSolved` | vessel, reason (`notConverged`, `noWater`, `negativeTotal`, `singular`) |
| `chem.unknownAction` | act |
| `chem.vesselFull` | id, capacity, volume (mL) |
| `chem.nothingToUndo` | — |
| `chem.cracked` | id — the vessel cracked (26.65): it takes nothing any more |

## Nuclides and reactor (Rust `velophi-chem/src/nuclear`, `reactor`, 26.64)

The nuclear and reactor operations (`CHEM.md`, "Nuclear operations" and "Reactor operations") report what the model
did or could not do as diagnostics `{ code, severity, params }` in the result. They are not keys of the message
renderer (`src/i18n/coreText.ts`): the interface words them from their codes in `src/nuclear/diagText.ts`
(`diagnosticText`, texts in `src/i18n/texts/v2664nuc.ts`); `tests/nuclear/nuclideViews.test.ts` compares this list
with the codes in the Rust source and requires a text in three languages for each.

| Code (severity) | Parameters | Returned by |
| --- | --- | --- |
| `nuclide.isomerFeeding` (approx) | nuclide, mode, isomer, assumed | `nuclideChain`, `nuclideDecay` |
| `nuclide.branchSum` (approx) | nuclide, sum | `nuclideChain`, `nuclideDecay` |
| `nuclide.branchUnknown` (unmodelled) | nuclide | `nuclideChain`, `nuclideDecay` |
| `nuclide.halfLifeUnknown` (unmodelled) | nuclide | `nuclideChain`, `nuclideDecay` |
| `nuclide.matrixSolution` (info) | values, of | `nuclideDecay` |
| `reactor.teachingModel` (info) | — | every reactor operation |
| `reactor.notConverged` (approx) | k, residual (`reactorCriticality`) | `reactorCriticality`, `reactorAdvance` |
| `reactor.promptCritical` (unmodelled) | t (s), rho, limit (0.9 β) | `reactorKinetics`, `reactorAdvance` |
| `reactor.shimPositive` (approx) | shim, k | `reactorAdvance` (`init.power`) |
| `reactor.solveBudget` (info) | t (s), solves | `reactorAdvance` |
| `reactor.trip` (info) | reason (`power`, `period`, `fuelTemperature`, `manual`), t (s), value, limit | `reactorAdvance` |
| `reactor.coreDamage` (error) | t (s), fuelT (K), limit (K) | `reactorAdvance` |

Errors of these operations are currently all `err.internal` with an English `message` that starts with the part that
failed — `nuclide data: `, `nuclide: `, `decay network: `, `reactor data: `, `reactor: `, `reactor task: ` — followed by
the detail (`'Xx-1' is not in the table`). The interface names the part in the user's language and shows the detail as
given (`nuclearErrorText`). Keys of their own (`nuclide.unknown`, `reactor.badLayout` …) would let the detail be
translated too; that is a change of the core.
