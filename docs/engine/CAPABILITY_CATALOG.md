# Nova_A current capability catalog — 26.35.0

Source declares 402 editor operations, 61 registered kinds (including the Rope2D scene connection), 169 Rhai API entries and 208 graph definitions. Primitive contracts describe 59 component kinds. Transform2D and scene connections have separate persistence owners.

Generated declarations describe intended functionality and ownership. They are not passing tests, full semantic review or proof that every edit reaches runtime/export. Executed evidence and limits are in FEATURE_MATRIX.md and TEST_MATRIX.md.

## Components and serialized primitive fields

| Kind | Family | Behavior | Primitive fields |
|---|---|---|---|
| Transform2D | Core | Local position, rotation, scale, and hierarchy parent. |  |
| Camera2D | Rendering | Orthographic game camera and viewport. | enabled, active, orthographicSize, nearSortingLayer, farSortingLayer, pixelPerfect, zoom, previewInEditor, followTargetUuid, priority, stackOrder, cullingMask, clearColor, renderTexture |
| SpriteRenderer2D | Rendering | Draws an imported sprite asset. | enabled, spriteAsset, opacity, flipX, flipY, sortingLayer, orderInLayer, material, filterMode, normalMapAsset, lightMask |
| ShapeRenderer2D | Rendering | Draws rectangles, ellipses, and polygons. | enabled, shape, radiusX, radiusY, opacity, strokeOpacity, strokeWidth, material, filterMode, textureAsset, texture, sortingLayer, orderInLayer |
| TextRenderer2D | Rendering | Draws world-space text. | enabled, text, fontAsset, fontFamily, fontSize, fontWeight, lineHeight, align, opacity, maxWidth, sortingLayer, orderInLayer, material |
| RigidBody2D | Physics | Dynamic, kinematic, or static body state. | enabled, bodyType, massMode, density, mass, autoInertia, inertia, gravityScale, localGravity, angularVelocity, linearDamping, angularDamping, torque, continuousCollision, sleepingAllowed, freezeRotation, transformOwnership |
| BoxCollider2D | Physics | Rectangular collision geometry. | enabled, rotation, radiusX, radiusY, shapeModel, sensor, physicsLayer, collisionMask, oneWay, materialAsset |
| EllipseCollider2D | Physics | Elliptical collision geometry. | enabled, rotation, radiusX, radiusY, shapeModel, sensor, physicsLayer, collisionMask, oneWay, materialAsset |
| PolygonCollider2D | Physics | Convex polygon collision geometry. | enabled, rotation, radiusX, radiusY, shapeModel, sensor, physicsLayer, collisionMask, oneWay, materialAsset |
| FixedJoint2D | Physics | Locks two bodies together. | enabled, targetEntityUuid, collideConnected, distance, stiffness, damping, limitsEnabled, lowerLimit, upperLimit, motorEnabled, motorSpeed, maxMotorForce, breakForce, breakTorque, referenceAngle, initialized |
| WeldJoint2D | Physics | Preserves the relative position and angle of two bodies. | enabled, targetEntityUuid, collideConnected, distance, stiffness, damping, limitsEnabled, lowerLimit, upperLimit, motorEnabled, motorSpeed, maxMotorForce, breakForce, breakTorque, referenceAngle, initialized |
| DistanceJoint2D | Physics | Maintains a configured distance. | enabled, targetEntityUuid, collideConnected, distance, stiffness, damping, limitsEnabled, lowerLimit, upperLimit, motorEnabled, motorSpeed, maxMotorForce, breakForce, breakTorque, referenceAngle, initialized |
| RopeJoint2D | Physics | Limits the maximum separation between two bodies. | enabled, targetEntityUuid, collideConnected, distance, stiffness, damping, limitsEnabled, lowerLimit, upperLimit, motorEnabled, motorSpeed, maxMotorForce, breakForce, breakTorque, referenceAngle, initialized |
| RevoluteJoint2D | Physics | Allows rotation around an anchor. | enabled, targetEntityUuid, collideConnected, distance, stiffness, damping, limitsEnabled, lowerLimit, upperLimit, motorEnabled, motorSpeed, maxMotorForce, breakForce, breakTorque, referenceAngle, initialized |
| MotorJoint2D | Physics | Drives relative rotation using the joint motor settings. | enabled, targetEntityUuid, collideConnected, distance, stiffness, damping, limitsEnabled, lowerLimit, upperLimit, motorEnabled, motorSpeed, maxMotorForce, breakForce, breakTorque, referenceAngle, initialized |
| PrismaticJoint2D | Physics | Allows motion along one axis. | enabled, targetEntityUuid, collideConnected, distance, stiffness, damping, limitsEnabled, lowerLimit, upperLimit, motorEnabled, motorSpeed, maxMotorForce, breakForce, breakTorque, referenceAngle, initialized |
| SpringJoint2D | Physics | Applies damped spring forces. | enabled, targetEntityUuid, collideConnected, distance, stiffness, damping, limitsEnabled, lowerLimit, upperLimit, motorEnabled, motorSpeed, maxMotorForce, breakForce, breakTorque, referenceAngle, initialized |
| Rope2D | Physics | Segmented stretchable, bendable, breakable connection. |  |
| Script2D | Gameplay | Runs sandboxed Rhai or visual-graph lifecycle logic. | enabled, scriptAsset, eventSheetAsset, objectBlueprintAsset |
| Animator | Gameplay | Animation state machine and parameters. | enabled, controllerAsset, speed, autoplay |
| Skeleton2D | Gameplay | 2D bone rig, skin, pose, IK, and constraint playback. | enabled, rigAsset, skinAsset, previewEnabled |
| TimelinePlayer | Gameplay | Nested animation, audio, camera blends, subtitles, events, branching, skip, and resume. | enabled, timelineAsset, autoplay, loop, speed, currentTime, playing, skipped |
| AudioSource | Audio | Plays a clip through an audio bus. | enabled, audioClip, volume, pitch, loop, autoplay, spatialBlend, minDistance, maxDistance, bus, attenuationCurve, voicePriority, polyphony, randomPitch, randomVolume, virtualizeWhenLimited, streamOverride, startOffsetSeconds, fadeInSeconds, fadeOutSeconds, dopplerScale, playlistMode, playlistIndex |
| AudioListener | Audio | Receives spatial game audio. | enabled, active |
| ParticleEmitter2D | Rendering | Emits lifetime-controlled 2D particles. | enabled, particleSystemAsset, simulationBackend, textureAsset, emissionRate, burst, lifetime, rotationMin, rotationMax, angularVelocityMin, angularVelocityMax, startScale, endScale, startOpacity, endOpacity, maxParticles, autoplay, looping, worldSpace, sortingLayer, orderInLayer, material, blendMode, emissionShape, shapeRadius, subEmitterUuid, subEmitterCount, previewInEditor, collisionMode, collisionRestitution, collisionLayerMask, eventSignal, trailEnabled, trailLength, trailWidth |
| Light2D | Rendering | Point, spot, directional, or area lighting with masks and shadows. | enabled, lightType, intensity, range, innerAngle, outerAngle, layerMask, castsShadows, shadowSoftness |
| ShadowCaster2D | Rendering | Makes entity geometry occlude compatible 2D lights. | enabled, layerMask, selfShadows, opacity |
| Canvas | UI | Root screen-space UI surface. | enabled, scaleWithScreen, sortingOrder, safeArea, dpiScale, localePreview, themeAsset, themeVariant |
| RectTransform | UI | Anchored screen-space layout rectangle. | enabled, layoutMode, anchorPreset, horizontalPolicy, verticalPolicy, aspectRatio, aspectConstraint, mirrorInRtl, zOrder, componentSource, componentVariant, focusable, tabIndex, focusUp, focusDown, focusLeft, focusRight, accessibilityRole, accessibilityLabel, accessibilityDescription, accessibilityState, accessibilityValue, accessibilityLive, accessibilityHidden, readingOrder, skipNavigation, remapAction, remapBindingIndex |
| Panel | UI | Colored UI container. | enabled, opacity, cornerRadius, layout, gap, columns, wrap, align, justify, clipChildren, maskChildren, scrollHorizontal, scrollVertical, showScrollbars, scrollSpeed, behavior, visible, closeOnOutside, draggable, dropGroup, tooltipText, tooltipDelay, styleClass |
| Image | UI | Screen-space image. | enabled, spriteAsset, opacity, preserveAspect |
| Text | UI | Screen-space label. | enabled, text, fontAsset, fontFamily, fontSize, fontWeight, align, opacity, localizationKey, wrap, overflow, inputPromptAction, captionCategory |
| Button | UI | Clickable UI control. | enabled, interactable, onPressed, onHoverEnter, onHoverExit, pressAudio, hoverAudio, focusAudio, styleClass |
| Slider | UI | Interactive bounded numeric control. | enabled, min, max, value, wholeNumbers, interactable, styleClass |
| ProgressBar | UI | Read-only normalized progress display. | enabled, min, max, value, styleClass |
| Checkbox | UI | Boolean UI control. | enabled, checked, interactable, label, localizationKey, styleClass |
| TextInput | UI | Native text-entry control with IME support. | enabled, value, placeholder, maxLength, interactable, password, styleClass |
| TileMap2D | World | Chunked tile layers with collision, navigation, and occluder baking. | enabled, tileSetAsset, width, height, chunkSize, opacity, sortingLayer, orderInLayer, material, filterMode, physicsLayer, collisionMask, activeLayer, streamingEnabled, streamingRadius, bakeCollision, bakeNavigation, bakeOccluders, revision |
| CharacterBody2D | Gameplay | Exact-unit slope, step, platform, and coyote-time character motion. | enabled, maxSlopeAngle, stepHeight, floorSnap, safeMargin, maxSlides, coyoteTime, applyPlatformVelocity, collisionMask |
| Area2D | Physics | Bounded overlap region for gameplay effectors and signals. | enabled, shape, radius, collisionMask, monitorable |
| AreaEffector2D | Gameplay | Gravity, wind, drag, buoyancy, damage, and signal effects. | enabled, priority |
| NavigationRegion2D | World | Polygon/grid navigation with hierarchy, links, cost areas, and cancellable baking. | enabled, cellSize, navigationMode, algorithm, allowDiagonal, dynamic, rebakeInterval, navigationLayer, navigationMask, traversalCost, source, sourceEntityUuid, agentRadius, clusterSize, bakedRevision |
| NavigationObstacle2D | World | Static or dynamic navigation and avoidance obstacle. | enabled, shape, radius, dynamic, navigationLayer |
| NavigationAgent2D | Gameplay | Bounded A*, hierarchical/flow-field, smoothing, and spatial-avoidance path follower. | enabled, targetEntityUuid, speed, acceleration, radius, stoppingDistance, avoidance, avoidanceRadius, pathSmoothing, repathInterval, navigationLayer, navigationMask, avoidancePriority, maximumAvoidanceNeighbors |
| BehaviorTree2D | Gameplay | Behavior trees with blackboards, perception, utility scoring, and visual diagnostics. | enabled, treeAsset, tickRate |
| StateMachine2D | Gameplay | Optional hierarchical gameplay state-machine runner. | enabled, machineAsset |
| GridMover2D | Gameplay | Moves an entity by exact grid cells from a named Vector2 action. | enabled, action, repeatDelay, allowDiagonal, localSpace |
| PlatformController2D | Gameplay | Deterministic side-view acceleration, jump, air-control, and fall limits. | enabled, moveAction, jumpAction, speed, acceleration, airControl, jumpImpulse, maximumFallSpeed |
| TopDownController2D | Gameplay | Accelerated top-down movement driven by a named Vector2 action. | enabled, moveAction, speed, acceleration, rotateToMovement |
| Health2D | Gameplay | Bounded health, invulnerability, damage, death, and lifecycle signals. | enabled, maximum, current, invulnerabilitySeconds, destroyOnZero, damagedSignal, diedSignal |
| DamageHitbox2D | Gameplay | Contact damage, target filtering, knockback, and hit cooldown. | enabled, damage, knockback, targetTag, hitCooldown, destroyOnHit, hitSignal |
| Collectible2D | Gameplay | Collector-tag filtering, score reward, signal, and safe despawn. | enabled, collectorTag, score, destroyOnCollect, collectedSignal |
| Projectile2D | Gameplay | Direction, speed, owner filtering, damage, impact, and lifetime behavior. | enabled, speed, damage, ownerUuid, destroyOnImpact, lifetime |
| Spawner2D | Gameplay | Bounded interval/burst prefab spawning with pooling support. | enabled, prefabAsset, interval, initialDelay, burst, maximumAlive, autoStart, inheritRotation |
| Cooldown2D | Gameplay | Reusable deterministic cooldown state and ready signal. | enabled, duration, autoStart, readySignal |
| Lifetime2D | Gameplay | Returns an object to its pool or destroys it after a bounded lifetime. | enabled, seconds, useDespawn |
| MouseFollower2D | Gameplay | Moves a kinematic body toward the active Game-view pointer in exact world units. | enabled, maximumSpeed |
| CameraFollow2D | Gameplay | Target/tag camera following with offset, dead zone, and smoothing. | enabled, targetUuid, targetTag, smoothing, followX, followY |
| WorldChunk2D | World | Dependency-aware world cells with state handoff, preload/cache policy, origin shift, and memory budgets. | enabled, loadDistance, unloadDistance, preloadPriority, memoryEstimateMb, sceneUuid, initiallyLoaded, ownership, prefetchDistance, cachePolicy, saveStateKey |
| Portal2D | World | Scene portal with preload and destination metadata. | enabled, targetSceneUuid, targetPortal, triggerRadius, preload |
| ObjectPool2D | Gameplay | Bounded prefab pool with spawn and despawn lifecycle events. | enabled, prefabAsset, prewarm, capacity, autoExpand, resetContract, maximumLifetime, createdCount, reusedCount, leakedCount |

## Editor operations and integration owners

| Operation | Workspace / panel | Behavior | Binding | Validation | Undo | Persistence | Runtime/export |
|---|---|---|---|---|---|---|---|
| project-manager-create-project | Launcher / Project Manager | Create project | src/components/ProjectManager.vue | src/runtime/projectUpgrade.ts | src/runtime/recovery.ts | src/projects/projectManager.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| project-manager-open-project | Launcher / Project Manager | Open project | src/components/ProjectManager.vue | src/runtime/projectUpgrade.ts | src/runtime/recovery.ts | src/projects/projectManager.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| project-manager-add-existing-project | Launcher / Project Manager | Add existing project | src/components/ProjectManager.vue | src/runtime/projectUpgrade.ts | src/runtime/recovery.ts | src/projects/projectManager.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| project-manager-import-archive | Launcher / Project Manager | Import archive | src/components/ProjectManager.vue | src/runtime/projectUpgrade.ts | src/runtime/recovery.ts | src/projects/projectManager.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| project-manager-migration-preflight | Launcher / Project Manager | Migration preflight | src/components/ProjectManager.vue | src/runtime/projectUpgrade.ts | src/runtime/recovery.ts | src/projects/projectManager.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| project-manager-rollback-download | Launcher / Project Manager | Rollback download | src/components/ProjectManager.vue | src/runtime/projectUpgrade.ts | src/runtime/recovery.ts | src/projects/projectManager.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| project-manager-recent-projects | Launcher / Project Manager | Recent projects | src/components/ProjectManager.vue | src/runtime/projectUpgrade.ts | src/runtime/recovery.ts | src/projects/projectManager.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| project-manager-20-template-library | Launcher / Project Manager | Template library | src/components/ProjectManager.vue | src/runtime/projectUpgrade.ts | src/runtime/recovery.ts | src/projects/projectManager.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| project-manager-template-search | Launcher / Project Manager | Template search | src/components/ProjectManager.vue | src/runtime/projectUpgrade.ts | src/runtime/recovery.ts | src/projects/projectManager.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| project-manager-template-difficulty-filter | Launcher / Project Manager | Template difficulty filter | src/components/ProjectManager.vue | src/runtime/projectUpgrade.ts | src/runtime/recovery.ts | src/projects/projectManager.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| project-manager-template-category-browser | Launcher / Project Manager | Template category browser | src/components/ProjectManager.vue | src/runtime/projectUpgrade.ts | src/runtime/recovery.ts | src/projects/projectManager.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| project-manager-template-setup-time-and-capability-preview | Launcher / Project Manager | Template setup-time and capability preview | src/components/ProjectManager.vue | src/runtime/projectUpgrade.ts | src/runtime/recovery.ts | src/projects/projectManager.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| workspaces-design-workspace | All / Workspace Bar | Design workspace | src/components/WorkspaceManager.vue | src/store/editor.ts | src/store/editor.ts | src/store/preferences.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| workspaces-script-workspace | All / Workspace Bar | Script workspace | src/components/WorkspaceManager.vue | src/store/editor.ts | src/store/editor.ts | src/store/preferences.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| workspaces-animation-workspace | All / Workspace Bar | Animation workspace | src/components/WorkspaceManager.vue | src/store/editor.ts | src/store/editor.ts | src/store/preferences.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| workspaces-interface-workspace | All / Workspace Bar | Interface workspace | src/components/WorkspaceManager.vue | src/store/editor.ts | src/store/editor.ts | src/store/preferences.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| workspaces-debug-workspace | All / Workspace Bar | Debug workspace | src/components/WorkspaceManager.vue | src/store/editor.ts | src/store/editor.ts | src/store/preferences.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| workspaces-manage-workspace | All / Workspace Bar | Manage workspace | src/components/WorkspaceManager.vue | src/store/editor.ts | src/store/editor.ts | src/store/preferences.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| workspaces-dock-and-float-panels | All / Workspace Bar | Dock and float panels | src/components/WorkspaceManager.vue | src/store/editor.ts | src/store/editor.ts | src/store/preferences.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| workspaces-saved-layouts | All / Workspace Bar | Saved layouts | src/components/WorkspaceManager.vue | src/store/editor.ts | src/store/editor.ts | src/store/preferences.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| workspaces-focus-mode | All / Workspace Bar | Focus mode | src/components/WorkspaceManager.vue | src/store/editor.ts | src/store/editor.ts | src/store/preferences.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| workspaces-navigation-history | All / Workspace Bar | Navigation history | src/components/WorkspaceManager.vue | src/store/editor.ts | src/store/editor.ts | src/store/preferences.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| workspaces-command-palette | All / Workspace Bar | Command Palette | src/components/WorkspaceManager.vue | src/store/editor.ts | src/store/editor.ts | src/store/preferences.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| workspaces-shortcut-editor | All / Workspace Bar | Shortcut Editor | src/components/WorkspaceManager.vue | src/store/editor.ts | src/store/editor.ts | src/store/preferences.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| hierarchy-search-and-filters | Design / Hierarchy | Search and filters | src/components/SceneSideBar.vue | src/projects/projectData.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| hierarchy-virtualized-10-000-object-list | Design / Hierarchy | Virtualized 10,000-object list | src/components/SceneSideBar.vue | src/projects/projectData.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| hierarchy-multi-selection | Design / Hierarchy | Multi-selection | src/components/SceneSideBar.vue | src/projects/projectData.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| hierarchy-rename | Design / Hierarchy | Rename | src/components/SceneSideBar.vue | src/projects/projectData.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| hierarchy-duplicate | Design / Hierarchy | Duplicate | src/components/SceneSideBar.vue | src/projects/projectData.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| hierarchy-group | Design / Hierarchy | Group | src/components/SceneSideBar.vue | src/projects/projectData.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| hierarchy-reparent | Design / Hierarchy | Reparent | src/components/SceneSideBar.vue | src/projects/projectData.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| hierarchy-reorder | Design / Hierarchy | Reorder | src/components/SceneSideBar.vue | src/projects/projectData.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| hierarchy-lock | Design / Hierarchy | Lock | src/components/SceneSideBar.vue | src/projects/projectData.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| hierarchy-hide | Design / Hierarchy | Hide | src/components/SceneSideBar.vue | src/projects/projectData.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| hierarchy-isolate | Design / Hierarchy | Isolate | src/components/SceneSideBar.vue | src/projects/projectData.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| hierarchy-breadcrumbs | Design / Hierarchy | Breadcrumbs | src/components/SceneSideBar.vue | src/projects/projectData.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| hierarchy-scene-tabs | Design / Hierarchy | Scene tabs | src/components/SceneSideBar.vue | src/projects/projectData.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| hierarchy-additive-and-overlay-loading | Design / Hierarchy | Additive and overlay loading | src/components/SceneSideBar.vue | src/projects/projectData.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-select | Design / Scene View | Select | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-move | Design / Scene View | Move | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-rotate | Design / Scene View | Rotate | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-scale | Design / Scene View | Scale | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-pivot | Design / Scene View | Pivot | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-rectangle-tool | Design / Scene View | Rectangle tool | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-polygon-tool | Design / Scene View | Polygon tool | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-path-tool | Design / Scene View | Path tool | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-collider-tool | Design / Scene View | Collider tool | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-ruler | Design / Scene View | Ruler | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-grid-snapping | Design / Scene View | Grid snapping | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-pixel-snapping | Design / Scene View | Pixel snapping | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-vertex-snapping | Design / Scene View | Vertex snapping | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-edge-snapping | Design / Scene View | Edge snapping | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-center-snapping | Design / Scene View | Center snapping | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-angle-snapping | Design / Scene View | Angle snapping | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-guides-and-rulers | Design / Scene View | Guides and rulers | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-alignment-and-distribution | Design / Scene View | Alignment and distribution | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-mirror | Design / Scene View | Mirror | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| viewport-camera-framing | Design / Scene View | Camera framing | src/components/WorldCanvas.vue | src/store/editor.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-transform2d | Design / Inspector | Transform2D | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-renderer-components | Design / Inspector | Renderer components | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-physics-components | Design / Inspector | Physics components | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-gameplay-components | Design / Inspector | Gameplay components | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-ui-components | Design / Inspector | UI components | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-audio-components | Design / Inspector | Audio components | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-script2d | Design / Inspector | Script2D | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-multi-edit-mixed-values | Design / Inspector | Multi-edit mixed values | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-property-expressions | Design / Inspector | Property expressions | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-property-search | Design / Inspector | Property search | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-changed-only-filter | Design / Inspector | Changed-only filter | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-pinned-properties | Design / Inspector | Pinned properties | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-reset-and-copy-paste | Design / Inspector | Reset and copy/paste | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-keyframe-property | Design / Inspector | Keyframe property | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-component-validation | Design / Inspector | Component validation | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| inspector-prefab-overrides | Design / Inspector | Prefab overrides | src/components/ConfigPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| assets-import-assets | Design / Assets | Import assets | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-create-scripts-and-graphs | Design / Assets | Create scripts and graphs | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-folders | Design / Assets | Folders | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-grid-and-list-views | Design / Assets | Grid and list views | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-search-tags-and-favorites | Design / Assets | Search, tags and favorites | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-collections-and-saved-filters | Design / Assets | Collections and saved filters | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-source-provenance | Design / Assets | Source provenance | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-import-presets | Design / Assets | Import presets | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-platform-overrides | Design / Assets | Platform overrides | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-reimport-and-compare | Design / Assets | Reimport and compare | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-reference-repair | Design / Assets | Reference repair | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-unused-asset-report | Design / Assets | Unused-asset report | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-sprite-slicing | Design / Assets | Sprite slicing | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-deterministic-atlases | Design / Assets | Deterministic atlases | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-aseprite-metadata-import-and-reimport | Design / Assets | Aseprite metadata import and reimport | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-texturepacker-and-common-atlas-import | Design / Assets | TexturePacker and common atlas import | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-tiled-tmx-json-and-tsx-import | Design / Assets | Tiled TMX, JSON and TSX import | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-stable-pivots-colliders-and-animation-tags | Design / Assets | Stable pivots, colliders and animation tags | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-contextual-asset-tabs | Design / Assets | Contextual asset tabs | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-shared-resource-assets | Design / Assets | Shared Resource assets | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-local-resource-overrides | Design / Assets | Local Resource overrides | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-named-resource-variants | Design / Assets | Named Resource variants | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-material-resources | Design / Assets | Material Resources | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-animation-library-resources | Design / Assets | Animation Library Resources | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-input-map-resources | Design / Assets | Input Map Resources | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-physics-material-resources | Design / Assets | Physics Material Resources | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-theme-resources | Design / Assets | Theme Resources | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-data-table-resources | Design / Assets | Data Table Resources | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-audio-import | Design / Assets | Audio import | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-font-shaping-settings | Design / Assets | Font shaping settings | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-localization-import-validation | Design / Assets | Localization import validation | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-nine-patch-production-profile | Design / Assets | Nine-patch production profile | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-vector-and-sdf-production-profile | Design / Assets | Vector and SDF production profile | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-two-way-dependency-graph | Design / Assets | Two-way dependency graph | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-cycle-and-missing-reference-visualization | Design / Assets | Cycle and missing-reference visualization | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-deterministic-non-image-thumbnails | Design / Assets | Deterministic non-image thumbnails | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-offline-trusted-content-discovery | Design / Assets | Offline trusted content discovery | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-50-000-asset-virtual-window | Design / Assets | 50,000-asset virtual window | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| assets-project-trash | Design / Assets | Project trash | src/components/ContentAssetInspector.vue | src/runtime/resources.ts | src/runtime/projectMutationRouter.ts | src/projects/projectArchive.ts | src/runtime/gameExporter.ts |
| physics-rigid-bodies | Design / Debug / Physics Settings and Monitor | Rigid bodies | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-character-bodies | Design / Debug / Physics Settings and Monitor | Character bodies | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-colliders | Design / Debug / Physics Settings and Monitor | Colliders | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-sensors-and-area2d | Design / Debug / Physics Settings and Monitor | Sensors and Area2D | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-collision-layers-and-masks | Design / Debug / Physics Settings and Monitor | Collision layers and masks | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-mass-density-and-inertia | Design / Debug / Physics Settings and Monitor | Mass, density and inertia | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-forces-and-impulses | Design / Debug / Physics Settings and Monitor | Forces and impulses | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-friction-and-restitution | Design / Debug / Physics Settings and Monitor | Friction and restitution | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-damping-and-sleep | Design / Debug / Physics Settings and Monitor | Damping and sleep | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-continuous-collision | Design / Debug / Physics Settings and Monitor | Continuous collision | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-one-way-platforms | Design / Debug / Physics Settings and Monitor | One-way platforms | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-physics-queries | Design / Debug / Physics Settings and Monitor | Physics queries | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-distance-joint | Design / Debug / Physics Settings and Monitor | Distance joint | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-revolute-joint | Design / Debug / Physics Settings and Monitor | Revolute joint | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-prismatic-joint | Design / Debug / Physics Settings and Monitor | Prismatic joint | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-weld-joint | Design / Debug / Physics Settings and Monitor | Weld joint | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-spring-joint | Design / Debug / Physics Settings and Monitor | Spring joint | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-rope2d | Design / Debug / Physics Settings and Monitor | Rope2D | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-compound-bind-and-separate | Design / Debug / Physics Settings and Monitor | Compound bind and separate | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-collision-timeline | Design / Debug / Physics Settings and Monitor | Collision timeline | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| physics-deterministic-replay | Design / Debug / Physics Settings and Monitor | Deterministic replay | src/components/PhysicsSettingsPanel.vue | src/runtime/physicsProduction.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/physics2d.ts |
| script-rhai-editor | Script / Script Studio | Rhai editor | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-diagnostics-and-code-actions | Script / Script Studio | Diagnostics and code actions | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-completion-and-api-browser | Script / Script Studio | Completion and API browser | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-definition-and-references | Script / Script Studio | Definition and references | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-rename-and-formatting | Script / Script Studio | Rename and formatting | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-lifecycle-callbacks | Script / Script Studio | Lifecycle callbacks | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-exported-inspector-properties | Script / Script Studio | Exported Inspector properties | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-modules | Script / Script Studio | Modules | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-behavior-contracts | Script / Script Studio | Behavior contracts | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-per-callback-command-and-log-budgets | Script / Script Studio | Per-callback command and log budgets | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-transactional-hot-reload | Script / Script Studio | Transactional hot reload | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-breakpoints-and-logpoints | Script / Script Studio | Breakpoints and logpoints | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-step-and-watches | Script / Script Studio | Step and watches | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-tasks-and-signals | Script / Script Studio | Tasks and signals | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-project-tests | Script / Script Studio | Project tests | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-coverage | Script / Script Studio | Coverage | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-headless-ci | Script / Script Studio | Headless CI | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| script-external-editor-protocol | Script / Script Studio | External editor protocol | src/components/ScriptStudio.vue | src/runtime/scriptContracts.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/editor/gameplayRuntime.ts |
| event-sheet-per-object-event-sheet | Script / Event Sheet and Object Blueprint | Per-object Event Sheet | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-awake-start-update-and-fixed-update-events | Script / Event Sheet and Object Blueprint | Awake, Start, Update and Fixed Update events | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-input-and-timer-events | Script / Event Sheet and Object Blueprint | Input and timer events | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-signal-collision-and-trigger-events | Script / Event Sheet and Object Blueprint | Signal, collision and trigger events | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-ui-animation-and-network-events | Script / Event Sheet and Object Blueprint | UI, animation and network events | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-visible-rhai-or-visual-graph-action-asset | Script / Event Sheet and Object Blueprint | Visible Rhai or Visual Graph action asset | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-event-search-and-callback-completion | Script / Event Sheet and Object Blueprint | Event search and callback completion | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-event-sheet-inheritance-and-overrides | Script / Event Sheet and Object Blueprint | Event Sheet inheritance and overrides | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-deterministic-event-priority-and-seed | Script / Event Sheet and Object Blueprint | Deterministic event priority and seed | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-disabled-object-event-exclusion | Script / Event Sheet and Object Blueprint | Disabled-object event exclusion | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-duplicate-callback-validation | Script / Event Sheet and Object Blueprint | Duplicate callback validation | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-10-000-event-bounded-scheduler | Script / Event Sheet and Object Blueprint | 10,000-event bounded scheduler | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-reusable-object-blueprint | Script / Event Sheet and Object Blueprint | Reusable Object Blueprint | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-object-blueprint-inheritance | Script / Event Sheet and Object Blueprint | Object Blueprint inheritance | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-composition-conflict-validation | Script / Event Sheet and Object Blueprint | Composition conflict validation | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| event-sheet-shape-or-sprite-to-object-to-event-to-scene-workflow | Script / Event Sheet and Object Blueprint | Shape or Sprite to Object to Event to Scene workflow | src/components/EventSheetEditor.vue | src/runtime/eventSheets.ts | src/runtime/projectMutationRouter.ts | src/runtime/eventSheets.ts | src/editor/gameplayRuntime.ts |
| visual-graph-scratch-style-block-mode | Script / Visual Graph Editor | Scratch-style block mode | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-motion-looks-sound-events-control-sensing-operators-variables-my-blocks-and-extensions-categories | Script / Visual Graph Editor | Motion, Looks, Sound, Events, Control, Sensing, Operators, Variables, My Blocks and Extensions categories | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-advanced-typed-node-mode | Script / Visual Graph Editor | Advanced typed node mode | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-automatic-rhai-to-block-synchronization | Script / Visual Graph Editor | Automatic Rhai-to-block synchronization | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-automatic-block-to-rhai-generation | Script / Visual Graph Editor | Automatic block-to-Rhai generation | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-code-blocks-for-unsupported-rhai-syntax | Script / Visual Graph Editor | Code blocks for unsupported Rhai syntax | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-typed-pins-and-wires | Script / Visual Graph Editor | Typed pins and wires | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-drag-or-click-pin-connection | Script / Visual Graph Editor | Drag or click pin connection | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-focal-wheel-zoom-and-zoom-slider | Script / Visual Graph Editor | Focal wheel zoom and zoom slider | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-frame-all-and-reset-zoom | Script / Visual Graph Editor | Frame all and reset zoom | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-double-click-node-insertion | Script / Visual Graph Editor | Double-click node insertion | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-indexed-automatic-block-layout | Script / Visual Graph Editor | Indexed automatic block layout | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-animation-frame-batched-graph-gestures | Script / Visual Graph Editor | Animation-frame batched graph gestures | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-large-graph-culling-and-low-detail-rendering | Script / Visual Graph Editor | Large-graph culling and low-detail rendering | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-branches-and-bounded-loops | Script / Visual Graph Editor | Branches and bounded loops | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-functions-and-macros | Script / Visual Graph Editor | Functions and macros | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-subgraphs-and-interfaces | Script / Visual Graph Editor | Subgraphs and interfaces | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-graph-libraries | Script / Visual Graph Editor | Graph libraries | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-variables-and-exposed-properties | Script / Visual Graph Editor | Variables and exposed properties | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-breakpoints-and-active-wires | Script / Visual Graph Editor | Breakpoints and active wires | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-watches-and-call-stack | Script / Visual Graph Editor | Watches and call stack | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-per-node-timings-and-coverage | Script / Visual Graph Editor | Per-node timings and coverage | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-refactor-and-find-references | Script / Visual Graph Editor | Refactor and find references | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-semantic-diff-and-merge | Script / Visual Graph Editor | Semantic diff and merge | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-hot-reload | Script / Visual Graph Editor | Hot reload | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-package-graph-nodes | Script / Visual Graph Editor | Package graph nodes | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| visual-graph-10-000-node-bounded-document | Script / Visual Graph Editor | 10,000-node bounded document | src/components/VisualGraphEditor.vue | src/visual/graphProduction.ts | src/runtime/projectMutationRouter.ts | src/visual/graphTypes.ts | src/visual/graphCompiler.ts |
| animation-property-clips | Animation / Animation and Timeline | Property clips | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-sprite-frames | Animation / Animation and Timeline | Sprite frames | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-events-and-method-tracks | Animation / Animation and Timeline | Events and method tracks | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-audio-and-nested-clips | Animation / Animation and Timeline | Audio and nested clips | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-state-machines | Animation / Animation and Timeline | State machines | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-parameters-and-transitions | Animation / Animation and Timeline | Parameters and transitions | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-blend-trees | Animation / Animation and Timeline | Blend trees | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-layers-and-masks | Animation / Animation and Timeline | Layers and masks | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-2d-rigs-and-skinning | Animation / Animation and Timeline | 2D rigs and skinning | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-skin-weight-heat-view | Animation / Animation and Timeline | Skin-weight heat view | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-bounded-automatic-skin-weights | Animation / Animation and Timeline | Bounded automatic skin weights | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-rig-constraints | Animation / Animation and Timeline | Rig constraints | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-onion-skin-preview | Animation / Animation and Timeline | Onion-skin preview | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-animation-curves | Animation / Animation and Timeline | Animation curves | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-retarget-preview | Animation / Animation and Timeline | Retarget preview | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-root-motion-preview | Animation / Animation and Timeline | Root-motion preview | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-retarget-aliases | Animation / Animation and Timeline | Retarget aliases | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-runtime-recording | Animation / Animation and Timeline | Runtime recording | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-timeline-cameras | Animation / Animation and Timeline | Timeline cameras | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-subtitles | Animation / Animation and Timeline | Subtitles | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-branches-and-markers | Animation / Animation and Timeline | Branches and markers | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-cinematic-skip-and-resume | Animation / Animation and Timeline | Cinematic skip and resume | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-fixed-time-cinematic-capture-plan | Animation / Animation and Timeline | Fixed-time cinematic capture plan | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| animation-frame-to-audio-sample-synchronization | Animation / Animation and Timeline | Frame-to-audio sample synchronization | src/components/AnimationPanel.vue | src/runtime/animationProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/animation.ts | src/runtime/animationProduction.ts |
| interface-canvas-and-recttransform | Interface / Interface Studio | Canvas and RectTransform | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-panels-images-and-text | Interface / Interface Studio | Panels, images and text | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-buttons-and-inputs | Interface / Interface Studio | Buttons and inputs | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-checkbox-slider-and-progress | Interface / Interface Studio | Checkbox, slider and progress | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-anchors-and-constraints | Interface / Interface Studio | Anchors and constraints | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-layout-containers | Interface / Interface Studio | Layout containers | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-clipping-and-scrolling | Interface / Interface Studio | Clipping and scrolling | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-themes-and-variants | Interface / Interface Studio | Themes and variants | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-reusable-ui-components | Interface / Interface Studio | Reusable UI components | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-localization-tables | Interface / Interface Studio | Localization tables | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-fallback-and-pseudolocales | Interface / Interface Studio | Fallback and pseudolocales | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-rtl-and-bidirectional-text | Interface / Interface Studio | RTL and bidirectional text | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-number-date-currency-formatting | Interface / Interface Studio | Number/date/currency formatting | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-focus-navigation | Interface / Interface Studio | Focus navigation | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-screen-reader-metadata | Interface / Interface Studio | Screen-reader metadata | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-contrast-and-target-size-audit | Interface / Interface Studio | Contrast and target-size audit | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-reduced-motion | Interface / Interface Studio | Reduced motion | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| interface-input-prompts-and-captions | Interface / Interface Studio | Input prompts and captions | src/runtime/uiProduction.ts | src/runtime/uiAccessibility.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameUi.ts |
| audio-audio-clips-and-sources | Animation / Debug / Audio Studio | Audio clips and sources | src/components/AudioSystemPanel.vue | src/runtime/audio.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/audio.ts |
| audio-waveform-regions | Animation / Debug / Audio Studio | Waveform regions | src/components/AudioSystemPanel.vue | src/runtime/audio.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/audio.ts |
| audio-loop-and-seek | Animation / Debug / Audio Studio | Loop and seek | src/components/AudioSystemPanel.vue | src/runtime/audio.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/audio.ts |
| audio-bus-routing | Animation / Debug / Audio Studio | Bus routing | src/components/AudioSystemPanel.vue | src/runtime/audio.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/audio.ts |
| audio-mixer-effects-and-limiter | Animation / Debug / Audio Studio | Mixer effects and limiter | src/components/AudioSystemPanel.vue | src/runtime/audio.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/audio.ts |
| audio-sends-and-snapshots | Animation / Debug / Audio Studio | Sends and snapshots | src/components/AudioSystemPanel.vue | src/runtime/audio.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/audio.ts |
| audio-automation-and-fades | Animation / Debug / Audio Studio | Automation and fades | src/components/AudioSystemPanel.vue | src/runtime/audio.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/audio.ts |
| audio-spatial-audio | Animation / Debug / Audio Studio | Spatial audio | src/components/AudioSystemPanel.vue | src/runtime/audio.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/audio.ts |
| audio-playlists | Animation / Debug / Audio Studio | Playlists | src/components/AudioSystemPanel.vue | src/runtime/audio.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/audio.ts |
| audio-preload-and-streaming | Animation / Debug / Audio Studio | Preload and streaming | src/components/AudioSystemPanel.vue | src/runtime/audio.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/audio.ts |
| audio-voice-budgets | Animation / Debug / Audio Studio | Voice budgets | src/components/AudioSystemPanel.vue | src/runtime/audio.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/audio.ts |
| audio-device-recovery | Animation / Debug / Audio Studio | Device recovery | src/components/AudioSystemPanel.vue | src/runtime/audio.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/audio.ts |
| audio-sample-accurate-cinematic-frame-boundaries | Animation / Debug / Audio Studio | Sample-accurate cinematic frame boundaries | src/components/AudioSystemPanel.vue | src/runtime/audio.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/audio.ts |
| audio-production-media-build-validation | Animation / Debug / Audio Studio | Production-media build validation | src/components/AudioSystemPanel.vue | src/runtime/audio.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/audio.ts |
| world-tile-palettes-and-paint-tools | Design / TileMap and World Studio | Tile palettes and paint tools | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-terrain-rules | Design / TileMap and World Studio | Terrain rules | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-animated-tiles | Design / TileMap and World Studio | Animated tiles | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-tile-collision-and-occlusion | Design / TileMap and World Studio | Tile collision and occlusion | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-navigation-regions | Design / TileMap and World Studio | Navigation regions | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-navigation-agents-and-obstacles | Design / TileMap and World Studio | Navigation agents and obstacles | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-links-and-cost-areas | Design / TileMap and World Studio | Links and cost areas | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-path-following | Design / TileMap and World Studio | Path following | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-behavior-trees | Design / TileMap and World Studio | Behavior trees | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-state-machines | Design / TileMap and World Studio | State machines | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-perception-and-utility-ai | Design / TileMap and World Studio | Perception and utility AI | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-world-chunks | Design / TileMap and World Studio | World chunks | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-streaming-dependencies | Design / TileMap and World Studio | Streaming dependencies | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-origin-shifting | Design / TileMap and World Studio | Origin shifting | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-object-pooling | Design / TileMap and World Studio | Object pooling | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| world-background-baking | Design / TileMap and World Studio | Background baking | src/components/WorldToolsPanel.vue | src/runtime/worldGameplay.ts | src/runtime/projectMutationRouter.ts | src/runtime/worldStreaming.ts | src/runtime/tileSceneRuntime.ts |
| rendering-canvas2d-and-webgl2-selection | Manage / Rendering Studio | Canvas2D and WebGL2 selection | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-material-graph | Manage / Rendering Studio | Material graph | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-layered-2d-effects | Manage / Rendering Studio | Layered 2D effects | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-lights-and-shadows | Manage / Rendering Studio | Lights and shadows | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-render-graph-and-textures | Manage / Rendering Studio | Render graph and textures | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-post-process-presets | Manage / Rendering Studio | Post-process presets | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-camera-volumes | Manage / Rendering Studio | Camera volumes | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-particles-and-trails | Manage / Rendering Studio | Particles and trails | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-shader-validation-and-fallback | Manage / Rendering Studio | Shader validation and fallback | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-color-space | Manage / Rendering Studio | Color space | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-batching-and-instancing | Manage / Rendering Studio | Batching and instancing | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-culling | Manage / Rendering Studio | Culling | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-overdraw-diagnostics | Manage / Rendering Studio | Overdraw diagnostics | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-atlas-recommendations | Manage / Rendering Studio | Atlas recommendations | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-quality-profiles | Manage / Rendering Studio | Quality profiles | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-pixel-perfect-and-high-dpi-rendering | Manage / Rendering Studio | Pixel-perfect and high-DPI rendering | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-budgeted-texture-residency-and-idle-eviction | Manage / Rendering Studio | Budgeted texture residency and idle eviction | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-unified-production-media-checklist | Manage / Rendering Studio | Unified production-media checklist | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-deterministic-numbered-frame-capture | Manage / Rendering Studio | Deterministic numbered frame capture | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| rendering-balanced-and-low-end-semantic-parity | Manage / Rendering Studio | Balanced and low-end semantic parity | src/components/RenderingPanel.vue | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/productionRuntime.ts |
| debug-play-pause-and-step | Debug / Debug, Console and Profiler | Play, pause and step | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| debug-runtime-inspector | Debug / Debug, Console and Profiler | Runtime Inspector | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| debug-console-filters | Debug / Debug, Console and Profiler | Console filters | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| debug-fault-center | Debug / Debug, Console and Profiler | Fault Center | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| debug-crash-reporter | Debug / Debug, Console and Profiler | Crash reporter | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| debug-safe-mode | Debug / Debug, Console and Profiler | Safe Mode | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| debug-cpu-and-frame-profiler | Debug / Debug, Console and Profiler | CPU and frame profiler | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| debug-render-physics-audio-and-script-timing | Debug / Debug, Console and Profiler | Render, physics, audio and script timing | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| debug-memory-and-lifetime-tracking | Debug / Debug, Console and Profiler | Memory and lifetime tracking | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| debug-trace-captures | Debug / Debug, Console and Profiler | Trace captures | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| debug-performance-comparisons | Debug / Debug, Console and Profiler | Performance comparisons | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| debug-project-tests | Debug / Debug, Console and Profiler | Project tests | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| debug-replay-and-checksums | Debug / Debug, Console and Profiler | Replay and checksums | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| debug-screenshot-and-headless-assertions | Debug / Debug, Console and Profiler | Screenshot and headless assertions | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| debug-physics-monitor | Debug / Debug, Console and Profiler | Physics Monitor | src/components/ProfilerPanel.vue | src/runtime/profiler.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| manage-theme-and-language | Manage / Settings and Project Health | Theme and language | src/components/ManageWorkspace.vue | src/runtime/projectIntegrity.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameExporter.ts |
| manage-ui-scale-and-density | Manage / Settings and Project Health | UI scale and density | src/components/ManageWorkspace.vue | src/runtime/projectIntegrity.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameExporter.ts |
| manage-high-contrast-and-reduced-motion | Manage / Settings and Project Health | High contrast and reduced motion | src/components/ManageWorkspace.vue | src/runtime/projectIntegrity.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameExporter.ts |
| manage-autosave-and-confirmation-policy | Manage / Settings and Project Health | Autosave and confirmation policy | src/components/ManageWorkspace.vue | src/runtime/projectIntegrity.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameExporter.ts |
| manage-input-map | Manage / Settings and Project Health | Input Map | src/components/ManageWorkspace.vue | src/runtime/projectIntegrity.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameExporter.ts |
| manage-physics-settings | Manage / Settings and Project Health | Physics settings | src/components/ManageWorkspace.vue | src/runtime/projectIntegrity.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameExporter.ts |
| manage-audio-settings | Manage / Settings and Project Health | Audio settings | src/components/ManageWorkspace.vue | src/runtime/projectIntegrity.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameExporter.ts |
| manage-collision-matrix | Manage / Settings and Project Health | Collision matrix | src/components/ManageWorkspace.vue | src/runtime/projectIntegrity.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameExporter.ts |
| manage-project-validation | Manage / Settings and Project Health | Project validation | src/components/ManageWorkspace.vue | src/runtime/projectIntegrity.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameExporter.ts |
| manage-deterministic-repair | Manage / Settings and Project Health | Deterministic repair | src/components/ManageWorkspace.vue | src/runtime/projectIntegrity.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameExporter.ts |
| manage-recovery-browser | Manage / Settings and Project Health | Recovery browser | src/components/ManageWorkspace.vue | src/runtime/projectIntegrity.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameExporter.ts |
| manage-migration-status | Manage / Settings and Project Health | Migration status | src/components/ManageWorkspace.vue | src/runtime/projectIntegrity.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameExporter.ts |
| manage-low-end-performance-profile | Manage / Settings and Project Health | Low-end performance profile | src/components/ManageWorkspace.vue | src/runtime/projectIntegrity.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameExporter.ts |
| manage-studio-status | Manage / Settings and Project Health | Studio Status | src/components/ManageWorkspace.vue | src/runtime/projectIntegrity.ts | src/runtime/projectMutationRouter.ts | src/projects/projectData.ts | src/runtime/gameExporter.ts |
| ecosystem-registry-and-lockfile | Manage / Debug / Packages and Ecosystem Studio | Registry and lockfile | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-dependency-resolution | Manage / Debug / Packages and Ecosystem Studio | Dependency resolution | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-hashes-and-signatures | Manage / Debug / Packages and Ecosystem Studio | Hashes and signatures | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-granular-plugin-permission-review | Manage / Debug / Packages and Ecosystem Studio | Granular plugin permission review | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-validate-plugins-without-executing | Manage / Debug / Packages and Ecosystem Studio | Validate plugins without executing | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-contextual-command-menu-panel-inspector-gizmo-importer-and-build-contributions | Manage / Debug / Packages and Ecosystem Studio | Contextual command, menu, panel, Inspector, gizmo, importer and build contributions | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-clean-plugin-load-unload-and-reload | Manage / Debug / Packages and Ecosystem Studio | Clean plugin load, unload and reload | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-quarantine-and-rollback | Manage / Debug / Packages and Ecosystem Studio | Quarantine and rollback | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-offline-mirror | Manage / Debug / Packages and Ecosystem Studio | Offline mirror | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-native-extension-abi | Manage / Debug / Packages and Ecosystem Studio | Native Extension ABI | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-package-wizard | Manage / Debug / Packages and Ecosystem Studio | Package wizard | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-ed25519-signing-request | Manage / Debug / Packages and Ecosystem Studio | Ed25519 signing request | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-certification-scanner | Manage / Debug / Packages and Ecosystem Studio | Certification scanner | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-offline-registry-tooling | Manage / Debug / Packages and Ecosystem Studio | Offline registry tooling | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-export-templates | Manage / Debug / Packages and Ecosystem Studio | Export templates | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-ci-matrix | Manage / Debug / Packages and Ecosystem Studio | CI matrix | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-content-cache | Manage / Debug / Packages and Ecosystem Studio | Content cache | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-delta-builds | Manage / Debug / Packages and Ecosystem Studio | Delta builds | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| ecosystem-deployment-connectors | Manage / Debug / Packages and Ecosystem Studio | Deployment connectors | src/components/EcosystemStudioPanel.vue | src/runtime/packages.ts | src/runtime/projectMutationRouter.ts | src/runtime/packages.ts | src/runtime/plugins.ts |
| automation-rhai-editor-automation | Manage / Automation Studio | Rhai editor automation | src/components/AutomationStudio.vue | src/runtime/editorAutomation.ts | src/store/editor.ts | src/projects/projectData.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| automation-read-only-scene-and-selection-queries | Manage / Automation Studio | Read-only scene and selection queries | src/components/AutomationStudio.vue | src/runtime/editorAutomation.ts | src/store/editor.ts | src/projects/projectData.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| automation-permission-preview | Manage / Automation Studio | Permission preview | src/components/AutomationStudio.vue | src/runtime/editorAutomation.ts | src/store/editor.ts | src/projects/projectData.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| automation-dry-run-transaction-diff | Manage / Automation Studio | Dry-run transaction diff | src/components/AutomationStudio.vue | src/runtime/editorAutomation.ts | src/store/editor.ts | src/projects/projectData.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| automation-select-and-batch-edit-objects | Manage / Automation Studio | Select and batch-edit objects | src/components/AutomationStudio.vue | src/runtime/editorAutomation.ts | src/store/editor.ts | src/projects/projectData.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| automation-create-bounded-scene-objects-and-text-assets | Manage / Automation Studio | Create bounded scene objects and text assets | src/components/AutomationStudio.vue | src/runtime/editorAutomation.ts | src/store/editor.ts | src/projects/projectData.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| automation-run-and-cancel | Manage / Automation Studio | Run and cancel | src/components/AutomationStudio.vue | src/runtime/editorAutomation.ts | src/store/editor.ts | src/projects/projectData.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| automation-single-step-undo-and-rollback | Manage / Automation Studio | Single-step undo and rollback | src/components/AutomationStudio.vue | src/runtime/editorAutomation.ts | src/store/editor.ts | src/projects/projectData.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| automation-execution-trace | Manage / Automation Studio | Execution trace | src/components/AutomationStudio.vue | src/runtime/editorAutomation.ts | src/store/editor.ts | src/projects/projectData.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| automation-automation-templates-and-package-origin | Manage / Automation Studio | Automation templates and package origin | src/components/AutomationStudio.vue | src/runtime/editorAutomation.ts | src/store/editor.ts | src/projects/projectData.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| network-explicit-network-permission | Debug / Network Studio | Explicit network permission | src/components/NetworkStudioPanel.vue | src/runtime/networkProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/networking.ts | src/runtime/networkProtocol.ts |
| network-local-lobby | Debug / Network Studio | Local lobby | src/components/NetworkStudioPanel.vue | src/runtime/networkProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/networking.ts | src/runtime/networkProtocol.ts |
| network-direct-connect | Debug / Network Studio | Direct connect | src/components/NetworkStudioPanel.vue | src/runtime/networkProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/networking.ts | src/runtime/networkProtocol.ts |
| network-reliable-and-unreliable-channels | Debug / Network Studio | Reliable and unreliable channels | src/components/NetworkStudioPanel.vue | src/runtime/networkProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/networking.ts | src/runtime/networkProtocol.ts |
| network-rpc-contracts | Debug / Network Studio | RPC contracts | src/components/NetworkStudioPanel.vue | src/runtime/networkProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/networking.ts | src/runtime/networkProtocol.ts |
| network-authority-and-replication | Debug / Network Studio | Authority and replication | src/components/NetworkStudioPanel.vue | src/runtime/networkProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/networking.ts | src/runtime/networkProtocol.ts |
| network-interpolation-and-prediction | Debug / Network Studio | Interpolation and prediction | src/components/NetworkStudioPanel.vue | src/runtime/networkProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/networking.ts | src/runtime/networkProtocol.ts |
| network-reconciliation-and-rollback | Debug / Network Studio | Reconciliation and rollback | src/components/NetworkStudioPanel.vue | src/runtime/networkProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/networking.ts | src/runtime/networkProtocol.ts |
| network-late-join | Debug / Network Studio | Late join | src/components/NetworkStudioPanel.vue | src/runtime/networkProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/networking.ts | src/runtime/networkProtocol.ts |
| network-latency-loss-simulation | Debug / Network Studio | Latency/loss simulation | src/components/NetworkStudioPanel.vue | src/runtime/networkProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/networking.ts | src/runtime/networkProtocol.ts |
| network-multiplayer-replay | Debug / Network Studio | Multiplayer replay | src/components/NetworkStudioPanel.vue | src/runtime/networkProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/networking.ts | src/runtime/networkProtocol.ts |
| network-multiplayer-save | Debug / Network Studio | Multiplayer save | src/components/NetworkStudioPanel.vue | src/runtime/networkProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/networking.ts | src/runtime/networkProtocol.ts |
| network-packet-diagnostics | Debug / Network Studio | Packet diagnostics | src/components/NetworkStudioPanel.vue | src/runtime/networkProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/networking.ts | src/runtime/networkProtocol.ts |
| network-headless-authority | Debug / Network Studio | Headless authority | src/components/NetworkStudioPanel.vue | src/runtime/networkProduction.ts | src/runtime/projectMutationRouter.ts | src/runtime/networking.ts | src/runtime/networkProtocol.ts |
| build-target-and-architecture | Manage / Build Settings | Target and architecture | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-portable-application | Manage / Build Settings | Portable application | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-player-plus-data-pack | Manage / Build Settings | Player plus data pack | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-web-folder | Manage / Build Settings | Web folder | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-startup-scene | Manage / Build Settings | Startup scene | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-deterministic-build | Manage / Build Settings | Deterministic build | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-content-stripping | Manage / Build Settings | Content stripping | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-build-profiles | Manage / Build Settings | Build profiles | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-provenance-and-sbom | Manage / Build Settings | Provenance and SBOM | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-patch-manifest | Manage / Build Settings | Patch manifest | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-symbols | Manage / Build Settings | Symbols | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-web-headers | Manage / Build Settings | Web headers | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-export-templates | Manage / Build Settings | Export templates | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-build-and-run | Manage / Build Settings | Build and Run | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-size-report | Manage / Build Settings | Size report | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-deployment-plan | Manage / Build Settings | Deployment plan | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-signing-warning | Manage / Build Settings | Signing warning | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| build-release-package | Manage / Build Settings | Release package | src/components/BuildSettingsPanel.vue | src/runtime/buildSettings.ts | src/runtime/projectTransactions.ts | src/runtime/buildSettings.ts | src/runtime/gameExporter.ts |
| recovery-team-atomic-saves-and-journals | Manage / Recovery and Team Workflow | Atomic saves and journals | src/components/RecoveryCenter.vue | src/runtime/projectIntegrity.ts | src/store/editor.ts | src/runtime/recovery.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| recovery-team-autosaves | Manage / Recovery and Team Workflow | Autosaves | src/components/RecoveryCenter.vue | src/runtime/projectIntegrity.ts | src/store/editor.ts | src/runtime/recovery.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| recovery-team-manual-checkpoints | Manage / Recovery and Team Workflow | Manual checkpoints | src/components/RecoveryCenter.vue | src/runtime/projectIntegrity.ts | src/store/editor.ts | src/runtime/recovery.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| recovery-team-recovery-preview | Manage / Recovery and Team Workflow | Recovery preview | src/components/RecoveryCenter.vue | src/runtime/projectIntegrity.ts | src/store/editor.ts | src/runtime/recovery.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| recovery-team-external-change-conflict-handling | Manage / Recovery and Team Workflow | External-change conflict handling | src/components/RecoveryCenter.vue | src/runtime/projectIntegrity.ts | src/store/editor.ts | src/runtime/recovery.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| recovery-team-project-trash | Manage / Recovery and Team Workflow | Project trash | src/components/RecoveryCenter.vue | src/runtime/projectIntegrity.ts | src/store/editor.ts | src/runtime/recovery.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| recovery-team-semantic-diff | Manage / Recovery and Team Workflow | Semantic diff | src/components/RecoveryCenter.vue | src/runtime/projectIntegrity.ts | src/store/editor.ts | src/runtime/recovery.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| recovery-team-git-helpers | Manage / Recovery and Team Workflow | Git helpers | src/components/RecoveryCenter.vue | src/runtime/projectIntegrity.ts | src/store/editor.ts | src/runtime/recovery.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| recovery-team-ownership-and-codeowners | Manage / Recovery and Team Workflow | Ownership and CODEOWNERS | src/components/RecoveryCenter.vue | src/runtime/projectIntegrity.ts | src/store/editor.ts | src/runtime/recovery.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| recovery-team-tasks-and-notes | Manage / Recovery and Team Workflow | Tasks and notes | src/components/RecoveryCenter.vue | src/runtime/projectIntegrity.ts | src/store/editor.ts | src/runtime/recovery.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| recovery-team-shared-presets | Manage / Recovery and Team Workflow | Shared presets | src/components/RecoveryCenter.vue | src/runtime/projectIntegrity.ts | src/store/editor.ts | src/runtime/recovery.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| recovery-team-binary-locks | Manage / Recovery and Team Workflow | Binary locks | src/components/RecoveryCenter.vue | src/runtime/projectIntegrity.ts | src/store/editor.ts | src/runtime/recovery.ts | docs/STABLE_CREATOR_PLATFORM_26_10.md |
| task-snake-complete-snake-game | Design / Script / Build / Guided Project | Complete Snake game | src/runtime/creatorLearning.ts | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | reference-projects/projects/creator-v60-snake/project.nova | src/runtime/productionRuntime.ts |
| task-platformer-complete-platformer | Design / Script / Debug / Guided Project | Complete platformer | src/runtime/creatorLearning.ts | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | reference-projects/projects/creator-v60-platformer/project.nova | src/runtime/productionRuntime.ts |
| task-top-down-complete-top-down-game | Design / Script / Debug / Guided Project | Complete top-down game | src/runtime/creatorLearning.ts | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | reference-projects/projects/creator-v60-top-down/project.nova | src/runtime/productionRuntime.ts |
| task-physics-puzzle-physics-puzzle-with-rope-and-joints | Design / Debug / Guided Project | Physics puzzle with rope and joints | src/runtime/creatorLearning.ts | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | reference-projects/projects/creator-v60-physics-puzzle/project.nova | src/runtime/productionRuntime.ts |
| task-menu-localized-responsive-menu | Interface / Guided Project | Localized responsive menu | src/runtime/creatorLearning.ts | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | reference-projects/projects/creator-v60-localized-menu/project.nova | src/runtime/productionRuntime.ts |
| task-cutscene-animation-and-cutscene | Animation / Guided Project | Animation and cutscene | src/runtime/creatorLearning.ts | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | reference-projects/projects/creator-v60-animation-cutscene/project.nova | src/runtime/productionRuntime.ts |
| task-tilemap-tilemap-streamed-world | Design / Guided Project | TileMap streamed world | src/runtime/creatorLearning.ts | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | reference-projects/projects/creator-v60-tilemap-world/project.nova | src/runtime/productionRuntime.ts |
| task-save-save-and-checkpoint-workflow | Script / Manage / Guided Project | Save and checkpoint workflow | src/runtime/creatorLearning.ts | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | reference-projects/projects/creator-v60-save-checkpoint/project.nova | src/runtime/productionRuntime.ts |
| task-package-package-and-plugin-workflow | Manage / Debug / Guided Project | Package and plugin workflow | src/runtime/creatorLearning.ts | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | reference-projects/projects/creator-v60-package-plugin/project.nova | src/runtime/productionRuntime.ts |
| task-network-local-network-sample | Debug / Guided Project | Local network sample | src/runtime/creatorLearning.ts | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | reference-projects/projects/creator-v60-network-sample/project.nova | src/runtime/productionRuntime.ts |
| task-windows-windows-portable-export | Manage / Guided Project | Windows portable export | src/runtime/creatorLearning.ts | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | reference-projects/projects/creator-v60-windows-portable/project.nova | src/runtime/productionRuntime.ts |
| task-web-web-deployment | Manage / Guided Project | Web deployment | src/runtime/creatorLearning.ts | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | reference-projects/projects/creator-v60-web-deployment/project.nova | src/runtime/productionRuntime.ts |
| task-object-family-reusable-enemy-family | Design / Script / Debug / Event Sheet and Object Blueprint | Reusable enemy family | src/runtime/creatorLearning.ts | src/runtime/productionValidation.ts | src/runtime/projectMutationRouter.ts | reference-projects/projects/creator-v2614-enemy-family/project.nova | src/runtime/productionRuntime.ts |

## Rhai APIs

| Signature | Behavior |
|---|---|
| fn awake() | Runs once when this instance enters play. |
| fn start() | Runs after every active instance has awakened. |
| fn fixed_update(dt) | Runs once per fixed physics tick. |
| fn update(dt) | Runs once per rendered gameplay frame. |
| fn late_update(dt) | Runs after update in the same frame. |
| fn on_destroy() | Runs before the owning entity is removed. |
| fn on_timer(name) | Receives an expired named timer. |
| fn on_task(name) | Receives completion of a deferred task. |
| fn on_signal(name, payload, source) | Receives a queued signal at a safe boundary. |
| fn on_collision_enter(other, px, py, nx, ny, rvx, rvy) | Receives the first solid contact tick. |
| fn on_collision_stay(other, px, py, nx, ny, rvx, rvy) | Receives each continuing solid contact tick. |
| fn on_collision_exit(other, px, py, nx, ny, rvx, rvy) | Receives the end of a solid contact. |
| fn on_trigger_enter(other, px, py, nx, ny, rvx, rvy) | Receives the first sensor overlap tick. |
| fn on_trigger_stay(other, px, py, nx, ny, rvx, rvy) | Receives each continuing sensor overlap tick. |
| fn on_trigger_exit(other, px, py, nx, ny, rvx, rvy) | Receives the end of a sensor overlap. |
| entity_handle() -> Handle<Entity> | Returns this entity as a stable versioned handle. |
| find_entity_handle(name) -> Handle<Entity> | Finds an entity or returns an invalid handle with an error. |
| entity() -> string | Returns the current entity UUID. |
| entity_name() -> string | Returns the current entity display name. |
| find_entity(name) -> string | Compatibility UUID lookup. |
| query_tag(tag, limit) -> Array<Handle<Entity>> | Returns at most 256 stable entity handles with a tag. |
| query_group(group, limit) -> Array<Handle<Entity>> | Returns at most 256 stable entity handles in a group. |
| query_component(kind, limit) -> Array<Handle<Entity>> | Returns at most 256 entity handles owning a component kind. |
| query_radius(x, y, radius, limit) -> Array<Handle<Entity>> | Returns bounded handles inside a finite world-space radius. |
| entity_name_on(handle) -> string | Reads the query-snapshot name for an entity handle. |
| entity_enabled_on(handle) -> bool | Reads the query-snapshot enabled state for an entity handle. |
| entity_position_x_on(handle) -> float | Reads query-snapshot world X for an entity handle. |
| entity_position_y_on(handle) -> float | Reads query-snapshot world Y for an entity handle. |
| entity_set_position(handle, x, y) | Queues a finite world position for a validated entity handle. |
| entity_set_rotation(handle, radians) | Queues a world rotation for a validated entity handle. |
| entity_set_scale(handle, x, y) | Queues a non-zero world scale for a validated entity handle. |
| entity_set_enabled(handle, enabled) | Enables or disables a validated entity. |
| entity_add_tag(handle, tag) | Adds one bounded tag to a validated entity. |
| entity_remove_tag(handle, tag) | Removes one tag from a validated entity. |
| entity_add_group(handle, group) | Adds a validated entity to a bounded group. |
| entity_remove_group(handle, group) | Removes a validated entity from a group. |
| entity_destroy(handle) | Safely destroys the validated target at the structural boundary. |
| component_handle(kind) -> Handle<Component> | Returns a stable component handle or explicit invalid handle. |
| has_component(kind) -> bool | Reports whether this entity owns an enabled component. |
| get_component(kind) -> string | Legacy component URI lookup. |
| component_set_enabled_on(handle, component, enabled) | Enables or disables an existing target component. |
| transform() -> TransformSnapshot | Reads one coherent world-transform snapshot. |
| set_position(x, y) | Queues an exact finite world position. |
| set_rotation(radians) | Queues world rotation in radians. |
| set_scale(x, y) | Queues world scale. |
| input_down(action) -> bool | True while an action is held. |
| input_pressed(action) -> bool | True on an action press edge. |
| input_released(action) -> bool | True on an action release edge. |
| input_performed(action) -> bool | True when Press, Hold, Tap, or Multi-tap reaches Performed. |
| input_cancelled(action) -> bool | True when an interaction is released before completion. |
| input_phase(action) -> string | Returns idle, started, performed, or cancelled. |
| input_duration(action) -> float | Returns the current held duration in seconds. |
| input_context_active(name) -> bool | Reports whether an input context is active. |
| input_map_active(name) -> bool | Reports whether an action map is active. |
| input_scheme() -> string | Returns the active control scheme. |
| input_context_push(name, priority, consume) | Pushes or updates a bounded input context. |
| input_context_pop(name) | Removes an active non-root input context. |
| input_map_enable(name) | Enables a bounded named action map. |
| input_map_disable(name) | Disables a named non-default action map. |
| input_scheme_set(name) | Selects a named input scheme. |
| input_axis(action) -> float | Reads a scalar action. |
| input_vector(action) -> Vec2 | Reads a Vector2 action. |
| input_vector_x(action) -> float | Reads a Vector2 x component. |
| input_vector_y(action) -> float | Reads a Vector2 y component. |
| mouse_x() -> float | Reads pointer x in the viewport. |
| mouse_y() -> float | Reads pointer y in the viewport. |
| mouse_world_x() -> float | Reads pointer x in game-camera world units. |
| mouse_world_y() -> float | Reads pointer y in game-camera world units. |
| view_min_x() -> float | Reads the active game camera left world bound. |
| view_max_x() -> float | Reads the active game camera right world bound. |
| view_min_y() -> float | Reads the active game camera bottom world bound. |
| view_max_y() -> float | Reads the active game camera top world bound. |
| viewport_width() -> float | Reads the current game viewport width in CSS pixels. |
| viewport_height() -> float | Reads the current game viewport height in CSS pixels. |
| wheel_x() -> float | Reads horizontal wheel delta. |
| wheel_y() -> float | Reads vertical wheel delta. |
| is_down(action) -> bool | Legacy held-action alias. |
| was_pressed(action) -> bool | Legacy press-edge alias. |
| was_released(action) -> bool | Legacy release-edge alias. |
| axis(action) -> float | Legacy scalar-action alias. |
| vector(action) -> Vec2 | Legacy Vector2-action alias. |
| rigid_body() -> RigidBodySnapshot | Reads body velocity, angular velocity, mass and type. |
| apply_force(x, y) | Applies force in newtons during a fixed step. |
| apply_impulse(x, y) | Applies instantaneous impulse in N·s. |
| set_velocity(x, y) | Sets linear velocity in world units per second. |
| set_angular_velocity(radians_per_second) | Sets angular velocity. |
| character_is_on_floor() -> bool | Reads authoritative floor state. |
| character_is_on_wall() -> bool | Reads authoritative wall state. |
| character_is_on_ceiling() -> bool | Reads authoritative ceiling state. |
| can_coyote_jump() -> bool | Reports floor contact or an active coyote window. |
| character_can_coyote_jump() -> bool | Legacy coyote-window name. |
| character_floor_normal() -> Vec2 | Returns the current floor normal. |
| character_platform_velocity() -> Vec2 | Returns supporting-platform velocity. |
| move_character(x, y) | Queues CharacterBody2D displacement for the next fixed step. |
| ui_set_text(text) | Sets Text or TextRenderer2D content on this entity. |
| ui_set_value(value) | Sets Slider, ProgressBar or Checkbox value. |
| ui_set_text_on(handle, text) | Sets text on a validated target UI/world-text entity. |
| ui_set_value_on(handle, value) | Sets a validated target Slider, ProgressBar, or Checkbox. |
| animator_handle() -> Handle<Animator> | Returns this Animator as a stable handle. |
| animator() -> string | Legacy Animator URI lookup. |
| animator_set_bool(name, value) | Sets a Boolean Animator parameter. |
| animator_set_float(name, value) | Sets a float Animator parameter. |
| animator_set_integer(name, value) | Sets an integer Animator parameter. |
| animator_trigger(name) | Raises an Animator trigger. |
| animator_play(state) | Requests an Animator state. |
| audio_source_handle() -> Handle<AudioSource> | Returns this AudioSource as a stable handle. |
| audio_source() -> string | Legacy AudioSource URI lookup. |
| audio_play() | Plays this entity AudioSource. |
| audio_pause() | Pauses this entity AudioSource. |
| audio_stop() | Stops this entity AudioSource. |
| navigation_set_target(x, y) | Sets this NavigationAgent2D world target. |
| instantiate(prefab) | Queues a prefab instance. |
| spawn_at(prefab, x, y, rotation, scale_x, scale_y) -> Handle<Entity> | Queues a prefab at an exact transform and returns a stable pending handle. |
| destroy() | Queues safe entity destruction. |
| despawn() | Returns a pooled object or safely destroys it. |
| scene_load(scene) | Queues a scene switch. |
| scene_reload() | Queues active-scene reload. |
| scene_quit() | Requests clean runtime shutdown. |
| game_pause(paused) | Pauses or resumes scaled gameplay while input/update callbacks remain available. |
| game_paused() -> bool | Reports the current gameplay pause state. |
| checkpoint_set(name) | Captures bounded scene transforms, health, score, and session state. |
| checkpoint_has(name) -> bool | Reports whether a runtime checkpoint exists. |
| checkpoint_restore(name) | Restores a same-scene checkpoint or fails explicitly. |
| score_get() -> float | Returns the bounded session score. |
| score_set(value) | Sets the bounded session score. |
| score_add(value) | Adds to the bounded session score. |
| session_get(key, fallback) -> value | Reads a bounded serializable session value. |
| session_set(key, value) | Writes a bounded serializable session value. |
| network_enabled() -> bool | Reports whether reviewed project networking and explicit permission are enabled. |
| network_connected() -> bool | Reports whether the optional runtime has an active session transport. |
| network_is_authority() -> bool | Reports whether this peer owns server or host authority. |
| network_peer_count() -> int | Returns the bounded number of known remote peers. |
| network_local_peer() -> string | Returns the current bounded local peer identifier. |
| network_role() -> string | Returns client, server, or host. |
| network_tick() -> int | Returns the authoritative network tick observed at this callback boundary. |
| network_rpc(name, payload) | Queues a declared RPC through explicit permission, authority, direction, schema, rate, payload, and bandwidth checks. |
| time() -> TimeSnapshot | Returns delta, fixed delta, elapsed, scale and frame. |
| time_delta() -> float | Returns render delta seconds. |
| time_fixed_delta() -> float | Returns fixed-step seconds. |
| time_elapsed() -> float | Returns scaled elapsed seconds. |
| time_scale() -> float | Returns active time scale. |
| time_frame() -> int | Returns deterministic frame number. |
| random() -> float | Returns a deterministic seeded value in [0, 1). |
| random_range(minimum, maximum) -> float | Returns a deterministic value in a finite range. |
| timer_start(name, seconds, repeat) | Starts a validated entity-owned timer. |
| timer_pause(name) | Pauses a timer. |
| timer_resume(name) | Resumes a timer. |
| timer_cancel(name) | Cancels a timer. |
| task_wait(name, seconds) | Schedules a cancellable deferred task. |
| task_cancel(name) | Cancels an entity-owned task. |
| signal_emit(name, payload) | Queues a serializable broadcast signal. |
| signal_emit_to(entity_id, name, payload) | Queues a serializable targeted signal. |
| save_has(key) -> bool | Reports whether a save key exists. |
| save_get(key, fallback) -> value | Reads a safe persistent value. |
| save_set(key, value) | Queues a serializable persistent value. |
| save_delete(key) | Deletes a persistent key. |
| save_clear() | Clears in-memory save state. |
| save_load(slot) | Queues a named slot load. |
| save_commit(slot) | Atomically commits a named slot. |
| log_debug(message) | Writes a bounded Debug console event. |
| log_info(message) | Writes a bounded Info console event. |
| log_warning(message) | Writes a bounded Warning console event. |
| log_error(message) | Writes a bounded Error event without crashing. |
| resource_handle(reference, type) -> Handle<Resource> | Validates an asset URI and returns a stable typed handle. |
| api_version() -> int | Returns the API version selected for this script asset. |
| api_current_version() -> int | Returns the newest API implemented by this engine. |
| api_minimum_version() -> int | Returns the oldest API version supported by the compatibility adapter. |
| api_namespace(symbol) -> string | Returns the documentation namespace of a flat symbol. |
| expect(condition, message) -> bool | Records a test assertion without corrupting another instance. |

## Graph definitions

| Type | Family | Behavior |
|---|---|---|
| api.animator | Animation | Legacy Animator URI lookup. |
| api.animator_handle | Animation | Returns this Animator as a stable handle. |
| api.animator_play | Animation | Requests an Animator state. |
| api.animator_set_bool | Animation | Sets a Boolean Animator parameter. |
| api.animator_set_float | Animation | Sets a float Animator parameter. |
| api.animator_set_integer | Animation | Sets an integer Animator parameter. |
| api.animator_trigger | Animation | Raises an Animator trigger. |
| api.audio_pause | Audio | Pauses this entity AudioSource. |
| api.audio_play | Audio | Plays this entity AudioSource. |
| api.audio_source | Audio | Legacy AudioSource URI lookup. |
| api.audio_source_handle | Audio | Returns this AudioSource as a stable handle. |
| api.audio_stop | Audio | Stops this entity AudioSource. |
| code.module | Code | Explicit escape block: runs sandboxed top-level Rhai declarations that cannot map to typed blocks yet. |
| code.statement | Code | Explicit escape block: runs one validated sandboxed Rhai statement inside an execution path. |
| logic.and | Comparison | And Boolean values. |
| compare.equal | Comparison | Equal comparison. |
| compare.greater | Comparison | Greater comparison. |
| compare.greater_equal | Comparison | Greater Equal comparison. |
| compare.less | Comparison | Less comparison. |
| compare.less_equal | Comparison | Less Equal comparison. |
| logic.not | Comparison | Inverts a Boolean. |
| compare.not_equal | Comparison | Not Equal comparison. |
| logic.or | Comparison | Or Boolean values. |
| convert.boolean_to_number | Conversion | Explicit safe Boolean to Number conversion. |
| convert.boolean_to_string | Conversion | Explicit safe Boolean to String conversion. |
| convert.number_to_string | Conversion | Explicit safe Number to String conversion. |
| convert.string_to_number | Conversion | Explicit safe String to Number conversion. |
| api.expect | Debug | Records a test assertion without corrupting another instance. |
| api.log_debug | Debug | Writes a bounded Debug console event. |
| api.log_error | Debug | Writes a bounded Error event without crashing. |
| api.log_info | Debug | Writes a bounded Info console event. |
| api.log_warning | Debug | Writes a bounded Warning console event. |
| event.awake | Events | Runs once when this instance enters play. |
| event.fixed_update | Events | Runs once per fixed physics tick. |
| event.late_update | Events | Runs after update in the same frame. |
| event.on_destroy | Events | Runs before the owning entity is removed. |
| event.on_timer | Events | Receives an expired named timer. |
| event.start | Events | Runs after every active instance has awakened. |
| event.update | Events | Runs once per rendered gameplay frame. |
| flow.repeat | Flow | Repeats a body at most 1,024 times. |
| flow.branch | Flow | Routes execution according to a Boolean condition. |
| reroute.execution | Flow | Keeps an execution wire readable. |
| reroute.data | Flow | Keeps a data wire readable without changing its value. |
| flow.sequence | Flow | Runs two execution paths in deterministic order. |
| api.api_current_version | Gameplay | Returns the newest API implemented by this engine. |
| api.api_minimum_version | Gameplay | Returns the oldest API version supported by the compatibility adapter. |
| api.api_namespace | Gameplay | Returns the documentation namespace of a flat symbol. |
| api.api_version | Gameplay | Returns the API version selected for this script asset. |
| api.checkpoint_has | Gameplay | Reports whether a runtime checkpoint exists. |
| api.checkpoint_restore | Gameplay | Restores a same-scene checkpoint or fails explicitly. |
| api.checkpoint_set | Gameplay | Captures bounded scene transforms, health, score, and session state. |
| api.component_handle | Gameplay | Returns a stable component handle or explicit invalid handle. |
| api.component_set_enabled_on | Gameplay | Enables or disables an existing target component. |
| api.entity | Gameplay | Returns the current entity UUID. |
| api.entity_add_group | Gameplay | Adds a validated entity to a bounded group. |
| api.entity_add_tag | Gameplay | Adds one bounded tag to a validated entity. |
| api.entity_destroy | Gameplay | Safely destroys the validated target at the structural boundary. |
| api.entity_enabled_on | Gameplay | Reads the query-snapshot enabled state for an entity handle. |
| api.entity_handle | Gameplay | Returns this entity as a stable versioned handle. |
| api.entity_name | Gameplay | Returns the current entity display name. |
| api.entity_name_on | Gameplay | Reads the query-snapshot name for an entity handle. |
| api.entity_position_x_on | Gameplay | Reads query-snapshot world X for an entity handle. |
| api.entity_position_y_on | Gameplay | Reads query-snapshot world Y for an entity handle. |
| api.entity_remove_group | Gameplay | Removes a validated entity from a group. |
| api.entity_remove_tag | Gameplay | Removes one tag from a validated entity. |
| api.entity_set_enabled | Gameplay | Enables or disables a validated entity. |
| api.entity_set_position | Gameplay | Queues a finite world position for a validated entity handle. |
| api.entity_set_rotation | Gameplay | Queues a world rotation for a validated entity handle. |
| api.entity_set_scale | Gameplay | Queues a non-zero world scale for a validated entity handle. |
| api.find_entity | Gameplay | Compatibility UUID lookup. |
| api.find_entity_handle | Gameplay | Finds an entity or returns an invalid handle with an error. |
| api.game_pause | Gameplay | Pauses or resumes scaled gameplay while input/update callbacks remain available. |
| api.game_paused | Gameplay | Reports the current gameplay pause state. |
| api.get_component | Gameplay | Legacy component URI lookup. |
| api.has_component | Gameplay | Reports whether this entity owns an enabled component. |
| api.query_component | Gameplay | Returns at most 256 entity handles owning a component kind. |
| api.query_group | Gameplay | Returns at most 256 stable entity handles in a group. |
| api.query_radius | Gameplay | Returns bounded handles inside a finite world-space radius. |
| api.query_tag | Gameplay | Returns at most 256 stable entity handles with a tag. |
| api.resource_handle | Gameplay | Validates an asset URI and returns a stable typed handle. |
| api.score_add | Gameplay | Adds to the bounded session score. |
| api.score_get | Gameplay | Returns the bounded session score. |
| api.score_set | Gameplay | Sets the bounded session score. |
| api.session_get | Gameplay | Reads a bounded serializable session value. |
| api.session_set | Gameplay | Writes a bounded serializable session value. |
| api.axis | Input | Legacy scalar-action alias. |
| api.input_axis | Input | Reads a scalar action. |
| api.input_cancelled | Input | True when an interaction is released before completion. |
| api.input_context_active | Input | Reports whether an input context is active. |
| api.input_context_pop | Input | Removes an active non-root input context. |
| api.input_context_push | Input | Pushes or updates a bounded input context. |
| api.input_down | Input | True while an action is held. |
| api.input_duration | Input | Returns the current held duration in seconds. |
| api.input_map_active | Input | Reports whether an action map is active. |
| api.input_map_disable | Input | Disables a named non-default action map. |
| api.input_map_enable | Input | Enables a bounded named action map. |
| api.input_performed | Input | True when Press, Hold, Tap, or Multi-tap reaches Performed. |
| api.input_phase | Input | Returns idle, started, performed, or cancelled. |
| api.input_pressed | Input | True on an action press edge. |
| api.input_released | Input | True on an action release edge. |
| api.input_scheme | Input | Returns the active control scheme. |
| api.input_scheme_set | Input | Selects a named input scheme. |
| api.input_vector | Input | Reads a Vector2 action. |
| api.input_vector_x | Input | Reads a Vector2 x component. |
| api.input_vector_y | Input | Reads a Vector2 y component. |
| api.is_down | Input | Legacy held-action alias. |
| api.mouse_world_x | Input | Reads pointer x in game-camera world units. |
| api.mouse_world_y | Input | Reads pointer y in game-camera world units. |
| api.mouse_x | Input | Reads pointer x in the viewport. |
| api.mouse_y | Input | Reads pointer y in the viewport. |
| api.vector | Input | Legacy Vector2-action alias. |
| api.view_max_x | Input | Reads the active game camera right world bound. |
| api.view_max_y | Input | Reads the active game camera top world bound. |
| api.view_min_x | Input | Reads the active game camera left world bound. |
| api.view_min_y | Input | Reads the active game camera bottom world bound. |
| api.viewport_height | Input | Reads the current game viewport height in CSS pixels. |
| api.viewport_width | Input | Reads the current game viewport width in CSS pixels. |
| api.was_pressed | Input | Legacy press-edge alias. |
| api.was_released | Input | Legacy release-edge alias. |
| api.wheel_x | Input | Reads horizontal wheel delta. |
| api.wheel_y | Input | Reads vertical wheel delta. |
| math.add | Math | Add two finite numbers. |
| math.divide | Math | Divide two finite numbers. |
| math.maximum | Math | Maximum two finite numbers. |
| math.minimum | Math | Minimum two finite numbers. |
| math.modulo | Math | Modulo two finite numbers. |
| math.multiply | Math | Multiply two finite numbers. |
| math.subtract | Math | Subtract two finite numbers. |
| api.navigation_set_target | Navigation | Sets this NavigationAgent2D world target. |
| api.network_connected | Network | Reports whether the optional runtime has an active session transport. |
| api.network_enabled | Network | Reports whether reviewed project networking and explicit permission are enabled. |
| api.network_is_authority | Network | Reports whether this peer owns server or host authority. |
| api.network_local_peer | Network | Returns the current bounded local peer identifier. |
| api.network_peer_count | Network | Returns the bounded number of known remote peers. |
| api.network_role | Network | Returns client, server, or host. |
| api.network_rpc | Network | Queues a declared RPC through explicit permission, authority, direction, schema, rate, payload, and bandwidth checks. |
| api.network_tick | Network | Returns the authoritative network tick observed at this callback boundary. |
| code.expression | Operators | Explicit escape block: evaluates sandboxed Rhai as a value when no typed block can preserve it. |
| api.apply_force | Physics | Applies force in newtons during a fixed step. |
| api.apply_impulse | Physics | Applies instantaneous impulse in N·s. |
| api.can_coyote_jump | Physics | Reports floor contact or an active coyote window. |
| api.character_can_coyote_jump | Physics | Legacy coyote-window name. |
| api.character_floor_normal | Physics | Returns the current floor normal. |
| api.character_is_on_ceiling | Physics | Reads authoritative ceiling state. |
| api.character_is_on_floor | Physics | Reads authoritative floor state. |
| api.character_is_on_wall | Physics | Reads authoritative wall state. |
| api.character_platform_velocity | Physics | Returns supporting-platform velocity. |
| event.on_collision_enter | Physics | Receives the first solid contact tick. |
| event.on_collision_exit | Physics | Receives the end of a solid contact. |
| event.on_collision_stay | Physics | Receives each continuing solid contact tick. |
| event.on_trigger_enter | Physics | Receives the first sensor overlap tick. |
| event.on_trigger_exit | Physics | Receives the end of a sensor overlap. |
| event.on_trigger_stay | Physics | Receives each continuing sensor overlap tick. |
| api.move_character | Physics | Queues CharacterBody2D displacement for the next fixed step. |
| api.rigid_body | Physics | Reads body velocity, angular velocity, mass and type. |
| api.set_angular_velocity | Physics | Sets angular velocity. |
| api.set_velocity | Physics | Sets linear velocity in world units per second. |
| api.save_clear | Save | Clears in-memory save state. |
| api.save_commit | Save | Atomically commits a named slot. |
| api.save_delete | Save | Deletes a persistent key. |
| api.save_get | Save | Reads a safe persistent value. |
| api.save_has | Save | Reports whether a save key exists. |
| api.save_load | Save | Queues a named slot load. |
| api.save_set | Save | Queues a serializable persistent value. |
| api.despawn | Scene | Returns a pooled object or safely destroys it. |
| api.destroy | Scene | Queues safe entity destruction. |
| api.instantiate | Scene | Queues a prefab instance. |
| api.scene_load | Scene | Queues a scene switch. |
| api.scene_quit | Scene | Requests clean runtime shutdown. |
| api.scene_reload | Scene | Queues active-scene reload. |
| api.spawn_at | Scene | Queues a prefab at an exact transform and returns a stable pending handle. |
| event.on_signal | Signals | Receives a queued signal at a safe boundary. |
| api.signal_emit | Signals | Queues a serializable broadcast signal. |
| api.signal_emit_to | Signals | Queues a serializable targeted signal. |
| event.on_task | Tasks | Receives completion of a deferred task. |
| api.task_cancel | Tasks | Cancels an entity-owned task. |
| api.task_wait | Tasks | Schedules a cancellable deferred task. |
| api.timer_cancel | Tasks | Cancels a timer. |
| api.timer_pause | Tasks | Pauses a timer. |
| api.timer_resume | Tasks | Resumes a timer. |
| api.timer_start | Tasks | Starts a validated entity-owned timer. |
| api.random | Timing | Returns a deterministic seeded value in [0, 1). |
| api.random_range | Timing | Returns a deterministic value in a finite range. |
| api.time | Timing | Returns delta, fixed delta, elapsed, scale and frame. |
| api.time_delta | Timing | Returns render delta seconds. |
| api.time_elapsed | Timing | Returns scaled elapsed seconds. |
| api.time_fixed_delta | Timing | Returns fixed-step seconds. |
| api.time_frame | Timing | Returns deterministic frame number. |
| api.time_scale | Timing | Returns active time scale. |
| api.set_position | Transform | Queues an exact finite world position. |
| api.set_rotation | Transform | Queues world rotation in radians. |
| api.set_scale | Transform | Queues world scale. |
| api.transform | Transform | Reads one coherent world-transform snapshot. |
| api.ui_set_text | Ui | Sets Text or TextRenderer2D content on this entity. |
| api.ui_set_text_on | Ui | Sets text on a validated target UI/world-text entity. |
| api.ui_set_value | Ui | Sets Slider, ProgressBar or Checkbox value. |
| api.ui_set_value_on | Ui | Sets a validated target Slider, ProgressBar, or Checkbox. |
| literal.boolean | Values | A constant Boolean value. |
| value.break_vec2 | Values | Reads the X and Y values of a Vec2. |
| literal.data | Values | A constant Data value. |
| literal.entity | Values | A constant Entity value. |
| value.make_vec2 | Values | Creates a two-dimensional value. |
| literal.number | Values | A constant Number value. |
| literal.resource | Values | A constant Resource value. |
| literal.string | Values | A constant String value. |
| literal.vec2 | Values | A constant Vec2 value. |
| variable.get | Variables | Reads a graph variable. |
| variable.set | Variables | Writes a graph variable. |
