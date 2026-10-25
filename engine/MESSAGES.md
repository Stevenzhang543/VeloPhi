# Messages of the core (keys)

The physics core writes no natural language (manual 26.50, D27). Warnings and errors are `{ key, params }`, built
the same way by the TypeScript engine (`msg()` in `src/i18n/message.ts`) and the Rust engine (`Message` in
`verity-core/src/message.rs`); the parity harness compares them in full (key and every parameter, numbers by their
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
| `warn.multiImpactFriction` | — | 多个接触点同时碰撞时，碰撞冲量未计摩擦… |
| `warn.polygonCentred` | body | (26.49: English text) polygon points are taken relative to its centre of mass |
| `warn.muSBelowMuK` | body | (26.49: English text) μs < μk |
| `err.forceNotFinite` | force, t, fx, fy | …：变力表达式在 t = … s 时没有有限值…，仿真停止 |
| `err.stepTooSmall` | t | 步长过小（t = … s），仿真停止 |
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

## ABI

| Key | Parameters |
| --- | --- |
| `abi.noScene` | — |
| `abi.badOption` | option |
| `engine.wasmUnavailable` (interface) | detail |
