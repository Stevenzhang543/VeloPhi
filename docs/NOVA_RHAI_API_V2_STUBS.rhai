// Nova_A Rhai API v2 编辑器提示资料：由接口清单生成，仅用于说明，不执行或打包进游戏。
// Nova_A Rhai API v2 generated editor stubs.
// Metadata only: this file is not executed or bundled into a game.
// API 2; generated from src/editor/scriptApi.ts.

// 接口 awake；模块 lifecycle；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=lifecycle lifetime=callback thread=callback-boundary determinism=deterministic
// fn awake()
// Runs once when this instance enters play.
// 接口 start；模块 lifecycle；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=lifecycle lifetime=callback thread=callback-boundary determinism=deterministic
// fn start()
// Runs after every active instance has awakened.
// 接口 fixed_update；模块 lifecycle；生命周期 callback；线程约束 fixed-step；确定性 deterministic。
// @nova-api module=lifecycle lifetime=callback thread=fixed-step determinism=deterministic
// fn fixed_update(dt)
// Runs once per fixed physics tick.
// 接口 update；模块 lifecycle；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=lifecycle lifetime=callback thread=callback-boundary determinism=deterministic
// fn update(dt)
// Runs once per rendered gameplay frame.
// 接口 late_update；模块 lifecycle；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=lifecycle lifetime=callback thread=callback-boundary determinism=deterministic
// fn late_update(dt)
// Runs after update in the same frame.
// 接口 on_destroy；模块 lifecycle；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=lifecycle lifetime=callback thread=callback-boundary determinism=deterministic
// fn on_destroy()
// Runs before the owning entity is removed.
// 接口 on_timer；模块 lifecycle；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=lifecycle lifetime=callback thread=callback-boundary determinism=deterministic
// fn on_timer(name)
// Receives an expired named timer.
// 接口 on_task；模块 tasks；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=tasks lifetime=callback thread=callback-boundary determinism=deterministic
// fn on_task(name)
// Receives completion of a deferred task.
// 接口 on_signal；模块 signals；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=signals lifetime=callback thread=callback-boundary determinism=deterministic
// fn on_signal(name, payload, source)
// Receives a queued signal at a safe boundary.
// 接口 on_collision_enter；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// fn on_collision_enter(other, px, py, nx, ny, rvx, rvy)
// Receives the first solid contact tick.
// 接口 on_collision_stay；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// fn on_collision_stay(other, px, py, nx, ny, rvx, rvy)
// Receives each continuing solid contact tick.
// 接口 on_collision_exit；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// fn on_collision_exit(other, px, py, nx, ny, rvx, rvy)
// Receives the end of a solid contact.
// 接口 on_trigger_enter；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// fn on_trigger_enter(other, px, py, nx, ny, rvx, rvy)
// Receives the first sensor overlap tick.
// 接口 on_trigger_stay；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// fn on_trigger_stay(other, px, py, nx, ny, rvx, rvy)
// Receives each continuing sensor overlap tick.
// 接口 on_trigger_exit；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// fn on_trigger_exit(other, px, py, nx, ny, rvx, rvy)
// Receives the end of a sensor overlap.
// 接口 entity_handle；模块 object；生命周期 scene；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=scene thread=callback-boundary determinism=deterministic
// entity_handle() -> Handle<Entity>
// Returns this entity as a stable versioned handle.
// 接口 find_entity_handle；模块 object；生命周期 scene；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=scene thread=callback-boundary determinism=deterministic
// find_entity_handle(name) -> Handle<Entity>
// Finds an entity or returns an invalid handle with an error.
// 接口 entity；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity() -> string
// Returns the current entity UUID.
// 接口 entity_name；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_name() -> string
// Returns the current entity display name.
// 接口 find_entity；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// find_entity(name) -> string
// Compatibility UUID lookup.
// DEPRECATED: use find_entity_handle; removal API v3.
// 接口 query_tag；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// query_tag(tag, limit) -> Array<Handle<Entity>>
// Returns at most 256 stable entity handles with a tag.
// 接口 query_group；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// query_group(group, limit) -> Array<Handle<Entity>>
// Returns at most 256 stable entity handles in a group.
// 接口 query_component；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// query_component(kind, limit) -> Array<Handle<Entity>>
// Returns at most 256 entity handles owning a component kind.
// 接口 query_radius；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// query_radius(x, y, radius, limit) -> Array<Handle<Entity>>
// Returns bounded handles inside a finite world-space radius.
// 接口 entity_name_on；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_name_on(handle) -> string
// Reads the query-snapshot name for an entity handle.
// 接口 entity_enabled_on；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_enabled_on(handle) -> bool
// Reads the query-snapshot enabled state for an entity handle.
// 接口 entity_position_x_on；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_position_x_on(handle) -> float
// Reads query-snapshot world X for an entity handle.
// 接口 entity_position_y_on；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_position_y_on(handle) -> float
// Reads query-snapshot world Y for an entity handle.
// 接口 entity_set_position；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_set_position(handle, x, y)
// Queues a finite world position for a validated entity handle.
// 接口 entity_set_rotation；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_set_rotation(handle, radians)
// Queues a world rotation for a validated entity handle.
// 接口 entity_set_scale；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_set_scale(handle, x, y)
// Queues a non-zero world scale for a validated entity handle.
// 接口 entity_set_enabled；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_set_enabled(handle, enabled)
// Enables or disables a validated entity.
// 接口 entity_add_tag；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_add_tag(handle, tag)
// Adds one bounded tag to a validated entity.
// 接口 entity_remove_tag；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_remove_tag(handle, tag)
// Removes one tag from a validated entity.
// 接口 entity_add_group；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_add_group(handle, group)
// Adds a validated entity to a bounded group.
// 接口 entity_remove_group；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_remove_group(handle, group)
// Removes a validated entity from a group.
// 接口 entity_destroy；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_destroy(handle)
// Safely destroys the validated target at the structural boundary.
// 接口 component_handle；模块 component；生命周期 scene；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=component lifetime=scene thread=callback-boundary determinism=deterministic
// component_handle(kind) -> Handle<Component>
// Returns a stable component handle or explicit invalid handle.
// 接口 has_component；模块 component；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=component lifetime=callback thread=callback-boundary determinism=deterministic
// has_component(kind) -> bool
// Reports whether this entity owns an enabled component.
// 接口 get_component；模块 component；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=component lifetime=callback thread=callback-boundary determinism=deterministic
// get_component(kind) -> string
// Legacy component URI lookup.
// DEPRECATED: use component_handle; removal API v3.
// 接口 component_set_enabled_on；模块 component；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=component lifetime=callback thread=callback-boundary determinism=deterministic
// component_set_enabled_on(handle, component, enabled)
// Enables or disables an existing target component.
// 接口 transform；模块 transform；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=transform lifetime=callback thread=callback-boundary determinism=deterministic
// transform() -> TransformSnapshot
// Reads one coherent world-transform snapshot.
// 接口 set_position；模块 transform；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=transform lifetime=callback thread=callback-boundary determinism=deterministic
// set_position(x, y)
// Queues an exact finite world position.
// 接口 set_rotation；模块 transform；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=transform lifetime=callback thread=callback-boundary determinism=deterministic
// set_rotation(radians)
// Queues world rotation in radians.
// 接口 set_scale；模块 transform；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=transform lifetime=callback thread=callback-boundary determinism=deterministic
// set_scale(x, y)
// Queues world scale.
// 接口 input_down；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_down(action) -> bool
// True while an action is held.
// 接口 input_pressed；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_pressed(action) -> bool
// True on an action press edge.
// 接口 input_released；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_released(action) -> bool
// True on an action release edge.
// 接口 input_performed；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_performed(action) -> bool
// True when Press, Hold, Tap, or Multi-tap reaches Performed.
// 接口 input_cancelled；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_cancelled(action) -> bool
// True when an interaction is released before completion.
// 接口 input_phase；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_phase(action) -> string
// Returns idle, started, performed, or cancelled.
// 接口 input_duration；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_duration(action) -> float
// Returns the current held duration in seconds.
// 接口 input_context_active；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_context_active(name) -> bool
// Reports whether an input context is active.
// 接口 input_map_active；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_map_active(name) -> bool
// Reports whether an action map is active.
// 接口 input_scheme；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_scheme() -> string
// Returns the active control scheme.
// 接口 input_context_push；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_context_push(name, priority, consume)
// Pushes or updates a bounded input context.
// 接口 input_context_pop；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_context_pop(name)
// Removes an active non-root input context.
// 接口 input_map_enable；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_map_enable(name)
// Enables a bounded named action map.
// 接口 input_map_disable；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_map_disable(name)
// Disables a named non-default action map.
// 接口 input_scheme_set；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_scheme_set(name)
// Selects a named input scheme.
// 接口 input_prompt；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_prompt(action) -> string
// The key, button or symbol of an action on the device in use ("Space", "A", "✕", "LMB"), for prompts in your own text.
// 接口 input_rebind；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_rebind(action[, index])
// Waits for the next key, mouse button or gamepad button and binds it to the action (binding `index`, default 0). Escape cancels. Sends the `input.rebound` or `input.rebind_cancelled` signal; the Player keeps the player's bindings.
// 接口 input_bindings_reset；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_bindings_reset()
// Puts the project's key bindings back and forgets the player's own.
// 接口 input_axis；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_axis(action) -> float
// Reads a scalar action.
// 接口 input_vector；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_vector(action) -> Vec2
// Reads a Vector2 action.
// 接口 input_vector_x；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_vector_x(action) -> float
// Reads a Vector2 x component.
// 接口 input_vector_y；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// input_vector_y(action) -> float
// Reads a Vector2 y component.
// 接口 mouse_x；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=host-dependent
// mouse_x() -> float
// Reads pointer x in the viewport.
// 接口 mouse_y；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=host-dependent
// mouse_y() -> float
// Reads pointer y in the viewport.
// 接口 mouse_world_x；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// mouse_world_x() -> float
// Reads pointer x in game-camera world units.
// 接口 mouse_world_y；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// mouse_world_y() -> float
// Reads pointer y in game-camera world units.
// 接口 view_min_x；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// view_min_x() -> float
// Reads the active game camera left world bound.
// 接口 view_max_x；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// view_max_x() -> float
// Reads the active game camera right world bound.
// 接口 view_min_y；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// view_min_y() -> float
// Reads the active game camera bottom world bound.
// 接口 view_max_y；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// view_max_y() -> float
// Reads the active game camera top world bound.
// 接口 viewport_width；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// viewport_width() -> float
// Reads the current game viewport width in CSS pixels.
// 接口 viewport_height；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// viewport_height() -> float
// Reads the current game viewport height in CSS pixels.
// 接口 wheel_x；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=host-dependent
// wheel_x() -> float
// Reads horizontal wheel delta.
// 接口 wheel_y；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=host-dependent
// wheel_y() -> float
// Reads vertical wheel delta.
// 接口 is_down；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// is_down(action) -> bool
// Legacy held-action alias.
// DEPRECATED: use input_down; removal API v3.
// 接口 was_pressed；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// was_pressed(action) -> bool
// Legacy press-edge alias.
// DEPRECATED: use input_pressed; removal API v3.
// 接口 was_released；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// was_released(action) -> bool
// Legacy release-edge alias.
// DEPRECATED: use input_released; removal API v3.
// 接口 axis；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// axis(action) -> float
// Legacy scalar-action alias.
// DEPRECATED: use input_axis; removal API v3.
// 接口 vector；模块 input；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=input lifetime=callback thread=callback-boundary determinism=deterministic
// vector(action) -> Vec2
// Legacy Vector2-action alias.
// DEPRECATED: use input_vector; removal API v3.
// 接口 rigid_body；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// rigid_body() -> RigidBodySnapshot
// Reads body velocity, angular velocity, mass and type.
// 接口 apply_force；模块 physics；生命周期 callback；线程约束 fixed-step；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=fixed-step determinism=deterministic
// apply_force(x, y)
// Applies force in newtons during a fixed step.
// 接口 apply_impulse；模块 physics；生命周期 callback；线程约束 fixed-step；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=fixed-step determinism=deterministic
// apply_impulse(x, y)
// Applies instantaneous impulse in N·s.
// 接口 set_velocity；模块 physics；生命周期 callback；线程约束 fixed-step；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=fixed-step determinism=deterministic
// set_velocity(x, y)
// Sets linear velocity in world units per second.
// 接口 set_angular_velocity；模块 physics；生命周期 callback；线程约束 fixed-step；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=fixed-step determinism=deterministic
// set_angular_velocity(radians_per_second)
// Sets angular velocity.
// 接口 character_is_on_floor；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// character_is_on_floor() -> bool
// Reads authoritative floor state.
// 接口 character_is_on_wall；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// character_is_on_wall() -> bool
// Reads authoritative wall state.
// 接口 character_is_on_ceiling；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// character_is_on_ceiling() -> bool
// Reads authoritative ceiling state.
// 接口 can_coyote_jump；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// can_coyote_jump() -> bool
// Reports floor contact or an active coyote window.
// 接口 character_can_coyote_jump；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// character_can_coyote_jump() -> bool
// Legacy coyote-window name.
// DEPRECATED: use can_coyote_jump; removal API v3.
// 接口 character_floor_normal；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// character_floor_normal() -> Vec2
// Returns the current floor normal.
// 接口 character_platform_velocity；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// character_platform_velocity() -> Vec2
// Returns supporting-platform velocity.
// 接口 move_character；模块 physics；生命周期 callback；线程约束 fixed-step；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=fixed-step determinism=deterministic
// move_character(x, y)
// Queues CharacterBody2D displacement for the next fixed step.
// 接口 character_floor_is_one_way；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// character_floor_is_one_way() -> bool
// True when the character stands on a one-way platform.
// 接口 target_joint_move；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// target_joint_move(x, y)
// Pulls this body toward a world point with its Target Joint (one is added when missing): drag, carry or hold it.
// 接口 target_joint_release；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// target_joint_release()
// Lets go of the body: its Target Joint stops pulling.
// 接口 set_surface_speed；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// set_surface_speed(speed)
// Makes this body a conveyor: its faces carry what rests on them at `speed` m/s (clockwise around the body for positive speeds).
// 接口 camera_shake；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// camera_shake(amount)
// Shakes the active camera: adds `amount` (0–1) of trauma; the view moves and turns by trauma² and calms down on its own (Camera2D shake settings). Reduced motion keeps a quarter.
// 接口 camera_zoom；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// camera_zoom(zoom)
// Sets the zoom of the active camera (1 is the authored size).
// 接口 camera_follow；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// camera_follow(handle)
// The active camera follows an object; camera_follow_none() stops following.
// 接口 camera_follow_none；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// camera_follow_none()
// The active camera stops following.
// 接口 screen_flash；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// screen_flash(r, g, b, seconds)
// Flashes the screen in a colour that fades out over `seconds` (not shown with reduced motion).
// 接口 character_drop_through；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// character_drop_through([seconds])
// Lets the character fall through one-way platforms (0.25 s by default; it keeps passing while it still overlaps one).
// 接口 ui_set_text；模块 ui；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=ui lifetime=callback thread=callback-boundary determinism=deterministic
// ui_set_text(text)
// Sets Text or TextRenderer2D content on this entity.
// 接口 ui_set_value；模块 ui；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=ui lifetime=callback thread=callback-boundary determinism=deterministic
// ui_set_value(value)
// Sets Slider, ProgressBar or Checkbox value.
// 接口 ui_set_text_on；模块 ui；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=ui lifetime=callback thread=callback-boundary determinism=deterministic
// ui_set_text_on(handle, text)
// Sets text on a validated target UI/world-text entity.
// 接口 ui_set_value_on；模块 ui；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=ui lifetime=callback thread=callback-boundary determinism=deterministic
// ui_set_value_on(handle, value)
// Sets a validated target Slider, ProgressBar, or Checkbox.
// 接口 animator_handle；模块 animation；生命周期 scene；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=scene thread=callback-boundary determinism=deterministic
// animator_handle() -> Handle<Animator>
// Returns this Animator as a stable handle.
// 接口 animator；模块 animation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=callback thread=callback-boundary determinism=deterministic
// animator() -> string
// Legacy Animator URI lookup.
// DEPRECATED: use animator_handle; removal API v3.
// 接口 animator_set_bool；模块 animation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=callback thread=callback-boundary determinism=deterministic
// animator_set_bool(name, value)
// Sets a Boolean Animator parameter.
// 接口 animator_set_float；模块 animation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=callback thread=callback-boundary determinism=deterministic
// animator_set_float(name, value)
// Sets a float Animator parameter.
// 接口 animator_set_integer；模块 animation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=callback thread=callback-boundary determinism=deterministic
// animator_set_integer(name, value)
// Sets an integer Animator parameter.
// 接口 animator_trigger；模块 animation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=callback thread=callback-boundary determinism=deterministic
// animator_trigger(name)
// Raises an Animator trigger.
// 接口 animator_play；模块 animation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=callback thread=callback-boundary determinism=deterministic
// animator_play(state)
// Requests an Animator state (id or name), switching at once.
// 接口 animator_crossfade；模块 animation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=callback thread=callback-boundary determinism=deterministic
// animator_crossfade(state, seconds)
// Blends from the current Animator state to another (id or name) over the given seconds.
// 接口 animator_state；模块 animation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=callback thread=callback-boundary determinism=deterministic
// animator_state() -> string
// Name of the current Animator state (base layer); "" without an Animator.
// 接口 animator_state_time；模块 animation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=callback thread=callback-boundary determinism=deterministic
// animator_state_time() -> float
// Normalised time of the current state: 0 at its start, 1 at the end of the clip (keeps counting while it loops).
// 接口 animator_in_transition；模块 animation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=callback thread=callback-boundary determinism=deterministic
// animator_in_transition() -> bool
// True while the Animator blends between two states.
// 接口 tween；模块 animation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=callback thread=callback-boundary determinism=deterministic
// tween(property, to, seconds[, easing[, options]])
// Animates x, y, rotation, rotation_degrees, scale_x, scale_y, scale or opacity of this object to a value. Easings: linear and quad, cubic, quart, quint, sine, expo, circ, back, elastic, bounce with _in, _out or _in_out. Options #{ delay, loops (-1 forever), yoyo, relative, signal }. Emits "tween.finished".
// 接口 entity_tween；模块 animation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=callback thread=callback-boundary determinism=deterministic
// entity_tween(entity, property, to, seconds, easing)
// Animates a property of another object (a handle).
// 接口 tween_stop；模块 animation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=callback thread=callback-boundary determinism=deterministic
// tween_stop([property])
// Stops this object's tweens (of one property, or all).
// 接口 entity_tween_stop；模块 animation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=animation lifetime=callback thread=callback-boundary determinism=deterministic
// entity_tween_stop(entity)
// Stops all tweens of another object (a handle).
// 接口 audio_source_handle；模块 audio；生命周期 scene；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=audio lifetime=scene thread=callback-boundary determinism=deterministic
// audio_source_handle() -> Handle<AudioSource>
// Returns this AudioSource as a stable handle.
// 接口 audio_source；模块 audio；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=audio lifetime=callback thread=callback-boundary determinism=deterministic
// audio_source() -> string
// Legacy AudioSource URI lookup.
// DEPRECATED: use audio_source_handle; removal API v3.
// 接口 audio_play；模块 audio；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=audio lifetime=callback thread=callback-boundary determinism=deterministic
// audio_play()
// Plays this entity AudioSource.
// 接口 audio_pause；模块 audio；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=audio lifetime=callback thread=callback-boundary determinism=deterministic
// audio_pause()
// Pauses this entity AudioSource.
// 接口 audio_stop；模块 audio；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=audio lifetime=callback thread=callback-boundary determinism=deterministic
// audio_stop()
// Stops this entity AudioSource.
// 接口 navigation_set_target；模块 navigation；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=navigation lifetime=callback thread=callback-boundary determinism=deterministic
// navigation_set_target(x, y)
// Sets this NavigationAgent2D world target.
// 接口 instantiate；模块 scene；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=scene lifetime=callback thread=callback-boundary determinism=deterministic
// instantiate(prefab)
// Queues a prefab instance.
// 接口 spawn_at；模块 scene；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=scene lifetime=callback thread=callback-boundary determinism=deterministic
// spawn_at(prefab, x, y, rotation, scale_x, scale_y) -> Handle<Entity>
// Queues a prefab at an exact transform and returns a stable pending handle.
// 接口 destroy；模块 scene；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=scene lifetime=callback thread=callback-boundary determinism=deterministic
// destroy()
// Queues safe entity destruction.
// 接口 despawn；模块 scene；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=scene lifetime=callback thread=callback-boundary determinism=deterministic
// despawn()
// Returns a pooled object or safely destroys it.
// 接口 scene_load；模块 scene；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=scene lifetime=callback thread=callback-boundary determinism=deterministic
// scene_load(scene)
// Queues a scene switch.
// 接口 scene_reload；模块 scene；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=scene lifetime=callback thread=callback-boundary determinism=deterministic
// scene_reload()
// Queues active-scene reload.
// 接口 scene_quit；模块 scene；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=scene lifetime=callback thread=callback-boundary determinism=deterministic
// scene_quit()
// Requests clean runtime shutdown.
// 接口 game_pause；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// game_pause(paused)
// Pauses or resumes scaled gameplay while input/update callbacks remain available.
// 接口 game_paused；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// game_paused() -> bool
// Reports the current gameplay pause state.
// 接口 checkpoint_set；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// checkpoint_set(name)
// Captures bounded scene transforms, health, score, and session state.
// 接口 checkpoint_has；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// checkpoint_has(name) -> bool
// Reports whether a runtime checkpoint exists.
// 接口 checkpoint_restore；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// checkpoint_restore(name)
// Restores a same-scene checkpoint or fails explicitly.
// 接口 score_get；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// score_get() -> float
// Returns the bounded session score.
// 接口 score_set；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// score_set(value)
// Sets the bounded session score.
// 接口 score_add；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// score_add(value)
// Adds to the bounded session score.
// 接口 session_get；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// session_get(key, fallback) -> value
// Reads a bounded serializable session value.
// 接口 session_set；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// session_set(key, value)
// Writes a bounded serializable session value.
// 接口 network_enabled；模块 network；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=network lifetime=callback thread=callback-boundary determinism=deterministic
// network_enabled() -> bool
// Reports whether reviewed project networking and explicit permission are enabled.
// 接口 network_connected；模块 network；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=network lifetime=callback thread=callback-boundary determinism=deterministic
// network_connected() -> bool
// Reports whether the optional runtime has an active session transport.
// 接口 network_is_authority；模块 network；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=network lifetime=callback thread=callback-boundary determinism=deterministic
// network_is_authority() -> bool
// Reports whether this peer owns server or host authority.
// 接口 network_peer_count；模块 network；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=network lifetime=callback thread=callback-boundary determinism=deterministic
// network_peer_count() -> int
// Returns the bounded number of known remote peers.
// 接口 network_local_peer；模块 network；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=network lifetime=callback thread=callback-boundary determinism=deterministic
// network_local_peer() -> string
// Returns the current bounded local peer identifier.
// 接口 network_role；模块 network；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=network lifetime=callback thread=callback-boundary determinism=deterministic
// network_role() -> string
// Returns client, server, or host.
// 接口 network_tick；模块 network；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=network lifetime=callback thread=callback-boundary determinism=deterministic
// network_tick() -> int
// Returns the authoritative network tick observed at this callback boundary.
// 接口 network_rpc；模块 network；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=network lifetime=callback thread=callback-boundary determinism=deterministic
// network_rpc(name, payload)
// Queues a declared RPC through explicit permission, authority, direction, schema, rate, payload, and bandwidth checks.
// 接口 time；模块 timing；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=timing lifetime=callback thread=callback-boundary determinism=deterministic
// time() -> TimeSnapshot
// Returns delta, fixed delta, elapsed, scale and frame.
// 接口 time_delta；模块 timing；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=timing lifetime=callback thread=callback-boundary determinism=deterministic
// time_delta() -> float
// Returns render delta seconds.
// 接口 time_fixed_delta；模块 timing；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=timing lifetime=callback thread=callback-boundary determinism=deterministic
// time_fixed_delta() -> float
// Returns fixed-step seconds.
// 接口 time_elapsed；模块 timing；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=timing lifetime=callback thread=callback-boundary determinism=deterministic
// time_elapsed() -> float
// Returns scaled elapsed seconds.
// 接口 time_scale；模块 timing；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=timing lifetime=callback thread=callback-boundary determinism=deterministic
// time_scale() -> float
// Returns active time scale.
// 接口 time_frame；模块 timing；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=timing lifetime=callback thread=callback-boundary determinism=deterministic
// time_frame() -> int
// Returns deterministic frame number.
// 接口 random；模块 timing；生命周期 callback；线程约束 callback-boundary；确定性 seeded。
// @nova-api module=timing lifetime=callback thread=callback-boundary determinism=seeded
// random() -> float
// Returns a deterministic seeded value in [0, 1).
// 接口 random_range；模块 timing；生命周期 callback；线程约束 callback-boundary；确定性 seeded。
// @nova-api module=timing lifetime=callback thread=callback-boundary determinism=seeded
// random_range(minimum, maximum) -> float
// Returns a deterministic value in a finite range.
// 接口 timer_start；模块 tasks；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=tasks lifetime=callback thread=callback-boundary determinism=deterministic
// timer_start(name, seconds, repeat)
// Starts a validated entity-owned timer.
// 接口 timer_pause；模块 tasks；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=tasks lifetime=callback thread=callback-boundary determinism=deterministic
// timer_pause(name)
// Pauses a timer.
// 接口 timer_resume；模块 tasks；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=tasks lifetime=callback thread=callback-boundary determinism=deterministic
// timer_resume(name)
// Resumes a timer.
// 接口 timer_cancel；模块 tasks；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=tasks lifetime=callback thread=callback-boundary determinism=deterministic
// timer_cancel(name)
// Cancels a timer.
// 接口 task_wait；模块 tasks；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=tasks lifetime=callback thread=callback-boundary determinism=deterministic
// task_wait(name, seconds)
// Schedules a cancellable deferred task.
// 接口 task_cancel；模块 tasks；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=tasks lifetime=callback thread=callback-boundary determinism=deterministic
// task_cancel(name)
// Cancels an entity-owned task.
// 接口 signal_emit；模块 signals；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=signals lifetime=callback thread=callback-boundary determinism=deterministic
// signal_emit(name, payload)
// Queues a serializable broadcast signal.
// 接口 signal_emit_to；模块 signals；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=signals lifetime=callback thread=callback-boundary determinism=deterministic
// signal_emit_to(entity_id, name, payload)
// Queues a serializable targeted signal.
// 接口 entity_handle_of；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_handle_of(id) -> Handle<Entity>
// Returns a handle for an entity id (for example other in a collision) at its current generation.
// 接口 entity_has_tag；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_has_tag(entity, tag) -> bool
// True when the entity (id or handle, e.g. other in a collision) has the tag.
// 接口 entity_in_group；模块 object；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=object lifetime=callback thread=callback-boundary determinism=deterministic
// entity_in_group(entity, group) -> bool
// True when the entity (id or handle) is in the group.
// 接口 call_on；模块 signals；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=signals lifetime=callback thread=callback-boundary determinism=deterministic
// call_on(entity, function, args)
// Calls a function of another object's script after this callback phase; args is an optional array.
// 接口 call_global；模块 signals；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=signals lifetime=callback thread=callback-boundary determinism=deterministic
// call_global(name, function, args)
// Calls a function of a project global script (Project Settings › Scripting › Global scripts).
// 接口 call_group；模块 signals；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=signals lifetime=callback thread=callback-boundary determinism=deterministic
// call_group(group, function, args)
// Calls a function on every object in a group.
// 接口 after；模块 tasks；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=tasks lifetime=callback thread=callback-boundary determinism=deterministic
// after(seconds, function, args)
// Calls one of this script's functions after a game-time delay.
// 接口 play_sound；模块 audio；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=audio lifetime=callback thread=callback-boundary determinism=deterministic
// play_sound(asset, options)
// Plays a sound once (or looped) on a mixer bus; options #{ bus, volume, pitch, looped, tag }.
// 接口 stop_sounds；模块 audio；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=audio lifetime=callback thread=callback-boundary determinism=deterministic
// stop_sounds(tag, fade)
// Stops script sounds with a tag ("" stops all), optionally fading out.
// 接口 play_music；模块 audio；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=audio lifetime=callback thread=callback-boundary determinism=deterministic
// play_music(asset, fade, volume)
// Plays looping music on the Music bus; a new track crossfades.
// 接口 stop_music；模块 audio；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=audio lifetime=callback thread=callback-boundary determinism=deterministic
// stop_music(fade)
// Fades out and stops the music.
// 接口 set_bus_volume；模块 audio；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=audio lifetime=callback thread=callback-boundary determinism=deterministic
// set_bus_volume(bus, volume)
// Sets a mixer bus volume for this play session (1.0 = authored level).
// 接口 play_video；模块 audio；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=audio lifetime=callback thread=callback-boundary determinism=deterministic
// play_video(asset, options)
// Plays a full-screen video over the game view; emits "video.finished". Options #{ skippable, volume, looped }.
// 接口 stop_video；模块 audio；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=audio lifetime=callback thread=callback-boundary determinism=deterministic
// stop_video()
// Stops the playing video (emits "video.finished" with reason "stopped").
// 接口 post_set；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// post_set(name, value, seconds)
// Sets a post-processing value (exposure, contrast, saturation, vignette, bloom, blur) for this play session; seconds tweens to it. Post-processing must be enabled.
// 接口 post_pulse；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// post_pulse(name, amount, seconds)
// Adds a post-processing amount that fades out over seconds (beat flashes, hits).
// 接口 post_reset；模块 gameplay；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=gameplay lifetime=callback thread=callback-boundary determinism=deterministic
// post_reset()
// Returns post-processing to the project settings.
// 接口 joint_servo；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// joint_servo(target)
// Drives the revolute (degrees) or prismatic (units) joint on this object to a target with its motor; measured like the joint limits (the connected body relative to this one).
// 接口 joint_servo_off；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// joint_servo_off()
// Stops the servo and switches its motor off; the joint moves freely again.
// 接口 explode；模块 physics；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=physics lifetime=callback thread=callback-boundary determinism=deterministic
// explode(x, y, radius, impulse)
// Pushes every dynamic body near a point away from it, fading to nothing at the radius.
// 接口 rhythm_play；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=deterministic
// rhythm_play(start_seconds)
// Starts this object's RhythmChart2D (else the first chart in the scene); start_seconds is optional chart time.
// 接口 rhythm_pause；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=deterministic
// rhythm_pause()
// Pauses the chart and its music.
// 接口 rhythm_resume；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=deterministic
// rhythm_resume()
// Resumes a paused chart one second early so the player finds the beat again.
// 接口 rhythm_stop；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=deterministic
// rhythm_stop()
// Stops the chart and its music.
// 接口 rhythm_restart；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=deterministic
// rhythm_restart()
// Plays the chart again from the start (new score).
// 接口 rhythm_seek；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=deterministic
// rhythm_seek(seconds)
// Jumps to a chart time; earlier notes are skipped, not missed (practice).
// 接口 rhythm_set_offset；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=deterministic
// rhythm_set_offset(milliseconds)
// Sets the chart's audio offset (positive: notes later).
// 接口 rhythm_set_autoplay；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=deterministic
// rhythm_set_autoplay(enabled)
// Turns autoplay (perfect bot play with scheduled hit sounds) on or off.
// 接口 rhythm_set_speed；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=deterministic
// rhythm_set_speed(speed)
// Sets the note scroll speed (chart units per second at speed 1).
// 接口 rhythm_set_calibration；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=deterministic
// rhythm_set_calibration(milliseconds)
// Stores this device's audio calibration (positive: the music is heard later); applies from the next play.
// 接口 rhythm_calibration；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_calibration() -> float
// The stored device calibration in milliseconds.
// 接口 rhythm_time；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_time() -> float
// Chart time in seconds (negative during the lead-in), on the audio clock.
// 接口 rhythm_beat；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_beat() -> float
// The current beat (fractional) through the chart's tempo map.
// 接口 rhythm_bpm；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_bpm() -> float
// Tempo at the current chart time.
// 接口 rhythm_score；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_score() -> int
// Score out of 1,000,000 (900,000 accuracy + 100,000 max combo).
// 接口 rhythm_combo；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_combo() -> int
// The current combo.
// 接口 rhythm_max_combo；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_max_combo() -> int
// The longest combo so far.
// 接口 rhythm_accuracy；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_accuracy() -> float
// Accuracy 0..1 over the judged notes (perfect 1, great 0.8, good 0.5).
// 接口 rhythm_progress；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_progress() -> float
// Progress 0..1 through the chart.
// 接口 rhythm_state；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_state() -> string
// idle, loading, ready, countdown, playing, paused, finished or error.
// 接口 rhythm_judgement；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_judgement() -> string
// The latest judgement: perfect, great, good, bad or miss.
// 接口 rhythm_playing；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_playing() -> bool
// True while the chart runs (lead-in included).
// 接口 rhythm_finished；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_finished() -> bool
// True once every note is judged and the chart ended.
// 接口 rhythm_full_combo；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_full_combo() -> bool
// True when a finished chart had no bad or miss.
// 接口 rhythm_count；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_count(name) -> int
// Count of perfect, great, good, bad, miss, early, late, judged or total notes.
// 接口 rhythm_judge；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=deterministic
// rhythm_judge(note, judgement_or_offset_ms)
// Judges a note (custom note types, from rhythm.touch): "perfect" … "miss", or an offset in milliseconds that the note type's windows classify. Ignored when the note is already judged.
// 接口 rhythm_my_note；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_my_note() -> map
// On an object that shows a note (a note type with a prefab): id, type, beat, time, lane, line, x and data of that note; () elsewhere.
// 接口 rhythm_visual_offset；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_visual_offset() -> float
// The device picture offset in milliseconds (notes are drawn this much earlier; judgement unchanged).
// 接口 rhythm_set_visual_offset；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=deterministic
// rhythm_set_visual_offset(milliseconds)
// Stores this device's picture offset (−500 … 500 ms); applies at once.
// 接口 rhythm_stats；模块 rhythm；生命周期 callback；线程约束 callback-boundary；确定性 host-dependent。
// @nova-api module=rhythm lifetime=callback thread=callback-boundary determinism=host-dependent
// rhythm_stats() -> map
// Every statistic in one map (score, counts, accuracy, mean_offset_ms, full_combo …).
// 接口 save_has；模块 save；生命周期 persistent-save；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=save lifetime=persistent-save thread=callback-boundary determinism=deterministic
// save_has(key) -> bool
// Reports whether a save key exists.
// 接口 save_get；模块 save；生命周期 persistent-save；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=save lifetime=persistent-save thread=callback-boundary determinism=deterministic
// save_get(key, fallback) -> value
// Reads a safe persistent value.
// 接口 save_set；模块 save；生命周期 persistent-save；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=save lifetime=persistent-save thread=callback-boundary determinism=deterministic
// save_set(key, value)
// Queues a serializable persistent value.
// 接口 save_delete；模块 save；生命周期 persistent-save；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=save lifetime=persistent-save thread=callback-boundary determinism=deterministic
// save_delete(key)
// Deletes a persistent key.
// 接口 save_clear；模块 save；生命周期 persistent-save；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=save lifetime=persistent-save thread=callback-boundary determinism=deterministic
// save_clear()
// Clears in-memory save state.
// 接口 save_load；模块 save；生命周期 persistent-save；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=save lifetime=persistent-save thread=callback-boundary determinism=deterministic
// save_load(slot)
// Queues a named slot load.
// 接口 save_commit；模块 save；生命周期 persistent-save；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=save lifetime=persistent-save thread=callback-boundary determinism=deterministic
// save_commit(slot)
// Atomically commits a named slot.
// 接口 log_debug；模块 logging；生命周期 callback；线程约束 worker-safe；确定性 deterministic。
// @nova-api module=logging lifetime=callback thread=worker-safe determinism=deterministic
// log_debug(message)
// Writes a bounded Debug console event.
// 接口 log_info；模块 logging；生命周期 callback；线程约束 worker-safe；确定性 deterministic。
// @nova-api module=logging lifetime=callback thread=worker-safe determinism=deterministic
// log_info(message)
// Writes a bounded Info console event.
// 接口 log_warning；模块 logging；生命周期 callback；线程约束 worker-safe；确定性 deterministic。
// @nova-api module=logging lifetime=callback thread=worker-safe determinism=deterministic
// log_warning(message)
// Writes a bounded Warning console event.
// 接口 log_error；模块 logging；生命周期 callback；线程约束 worker-safe；确定性 deterministic。
// @nova-api module=logging lifetime=callback thread=worker-safe determinism=deterministic
// log_error(message)
// Writes a bounded Error event without crashing.
// 接口 resource_handle；模块 resources；生命周期 project；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=resources lifetime=project thread=callback-boundary determinism=deterministic
// resource_handle(reference, type) -> Handle<Resource>
// Validates an asset URI and returns a stable typed handle.
// 接口 api_version；模块 resources；生命周期 project；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=resources lifetime=project thread=callback-boundary determinism=deterministic
// api_version() -> int
// Returns the API version selected for this script asset.
// 接口 api_current_version；模块 resources；生命周期 project；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=resources lifetime=project thread=callback-boundary determinism=deterministic
// api_current_version() -> int
// Returns the newest API implemented by this engine.
// 接口 api_minimum_version；模块 resources；生命周期 project；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=resources lifetime=project thread=callback-boundary determinism=deterministic
// api_minimum_version() -> int
// Returns the oldest API version supported by the compatibility adapter.
// 接口 api_namespace；模块 resources；生命周期 project；线程约束 callback-boundary；确定性 deterministic。
// @nova-api module=resources lifetime=project thread=callback-boundary determinism=deterministic
// api_namespace(symbol) -> string
// Returns the documentation namespace of a flat symbol.
// 接口 expect；模块 testing；生命周期 callback；线程约束 worker-safe；确定性 deterministic。
// @nova-api module=testing lifetime=callback thread=worker-safe determinism=deterministic
// expect(condition, message) -> bool
// Records a test assertion without corrupting another instance.
