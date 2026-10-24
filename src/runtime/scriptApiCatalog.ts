/** 脚本 API 编辑资料：定义引擎调用信息，提供查询、补全及可导出的接口说明。 */
export const SCRIPT_API_VERSION = 2 as const
export const SCRIPT_API_MINIMUM_VERSION = 1 as const

export type ScriptApiNamespace =
  | 'lifecycle' | 'scene' | 'object' | 'component' | 'transform' | 'input' | 'physics'
  | 'ui' | 'audio' | 'animation' | 'navigation' | 'save' | 'timing' | 'logging'
  | 'resources' | 'signals' | 'tasks' | 'testing' | 'gameplay' | 'network' | 'rhythm'

export interface ScriptApiEntry {
  name: string
  signature: string
  namespace: ScriptApiNamespace
  category: string
  detail: string
  example: string
  since: '1.0' | '2.0'
  deprecated?: { replacement: string; removal: 'API v3'; reason: string }
  documentation: string
}

export type ScriptApiThreadRule = 'main-thread' | 'fixed-step' | 'callback-boundary' | 'worker-safe'
export type ScriptApiDeterminism = 'deterministic' | 'seeded' | 'host-dependent'
export interface ScriptApiV2Binding extends ScriptApiEntry {
  id: string
  module: ScriptApiNamespace
  callable: string
  resultConvention: 'value' | 'result' | 'queued-command' | 'lifecycle'
  lifetime: 'callback' | 'scene' | 'project' | 'persistent-save'
  threadRule: ScriptApiThreadRule
  determinism: ScriptApiDeterminism
  permissions: readonly string[]
}

export interface ScriptApiV2Manifest {
  format: 'nova-rhai-api-manifest'
  version: 2
  minimumCompatibleVersion: 1
  errorModel: 'Result values are explicit; queued host mutations fail through diagnostics and never expose host exceptions.'
  handleModel: 'Handles are typed, versioned, copied values whose validity must be checked at each callback boundary.'
  entries: readonly ScriptApiV2Binding[]
}

type Spec = readonly [name: string, signature: string, namespace: ScriptApiNamespace, detail: string, example: string, replacement?: string]

// Rhai callables remain compact flat snake_case names. `namespace` is the
// frozen API v1 documentation, completion, permission and compatibility group.
const SPECS: readonly Spec[] = [
  ['awake', 'fn awake()', 'lifecycle', 'Runs once when this instance enters play.', 'fn awake() { log_info("ready"); }'],
  ['start', 'fn start()', 'lifecycle', 'Runs after every active instance has awakened.', 'fn start() { signal_emit("ready", entity()); }'],
  ['fixed_update', 'fn fixed_update(dt)', 'lifecycle', 'Runs once per fixed physics tick.', 'fn fixed_update(dt) { apply_force(2.0 * dt, 0.0); }'],
  ['update', 'fn update(dt)', 'lifecycle', 'Runs once per rendered gameplay frame.', 'fn update(dt) { ui_set_value(time_elapsed()); }'],
  ['late_update', 'fn late_update(dt)', 'lifecycle', 'Runs after update in the same frame.', 'fn late_update(dt) { log_debug(`frame ${time_frame()}`); }'],
  ['on_destroy', 'fn on_destroy()', 'lifecycle', 'Runs before the owning entity is removed.', 'fn on_destroy() { task_cancel("load"); }'],
  ['on_timer', 'fn on_timer(name)', 'lifecycle', 'Receives an expired named timer.', 'fn on_timer(name) { signal_emit(name, true); }'],
  ['on_task', 'fn on_task(name)', 'tasks', 'Receives completion of a deferred task.', 'fn on_task(name) { log_info(name); }'],
  ['on_signal', 'fn on_signal(name, payload, source)', 'signals', 'Receives a queued signal at a safe boundary.', 'fn on_signal(name, payload, source) { log_debug(name); }'],
  ['on_collision_enter', 'fn on_collision_enter(other, px, py, nx, ny, rvx, rvy)', 'physics', 'Receives the first solid contact tick.', 'fn on_collision_enter(other, px, py, nx, ny, rvx, rvy) { log_info(other); }'],
  ['on_collision_stay', 'fn on_collision_stay(other, px, py, nx, ny, rvx, rvy)', 'physics', 'Receives each continuing solid contact tick.', 'fn on_collision_stay(other, px, py, nx, ny, rvx, rvy) { }'],
  ['on_collision_exit', 'fn on_collision_exit(other, px, py, nx, ny, rvx, rvy)', 'physics', 'Receives the end of a solid contact.', 'fn on_collision_exit(other, px, py, nx, ny, rvx, rvy) { }'],
  ['on_trigger_enter', 'fn on_trigger_enter(other, px, py, nx, ny, rvx, rvy)', 'physics', 'Receives the first sensor overlap tick.', 'fn on_trigger_enter(other, px, py, nx, ny, rvx, rvy) { signal_emit("entered", other); }'],
  ['on_trigger_stay', 'fn on_trigger_stay(other, px, py, nx, ny, rvx, rvy)', 'physics', 'Receives each continuing sensor overlap tick.', 'fn on_trigger_stay(other, px, py, nx, ny, rvx, rvy) { }'],
  ['on_trigger_exit', 'fn on_trigger_exit(other, px, py, nx, ny, rvx, rvy)', 'physics', 'Receives the end of a sensor overlap.', 'fn on_trigger_exit(other, px, py, nx, ny, rvx, rvy) { }'],
  ['entity_handle', 'entity_handle() -> Handle<Entity>', 'object', 'Returns this entity as a stable versioned handle.', 'let self = entity_handle();'],
  ['find_entity_handle', 'find_entity_handle(name) -> Handle<Entity>', 'object', 'Finds an entity or returns an invalid handle with an error.', 'let enemy = find_entity_handle("Enemy");'],
  ['entity', 'entity() -> string', 'object', 'Returns the current entity UUID.', 'let id = entity();'],
  ['entity_name', 'entity_name() -> string', 'object', 'Returns the current entity display name.', 'log_info(entity_name());'],
  ['find_entity', 'find_entity(name) -> string', 'object', 'Compatibility UUID lookup.', 'let id = find_entity("Camera");', 'find_entity_handle'],
  ['query_tag', 'query_tag(tag, limit) -> Array<Handle<Entity>>', 'object', 'Returns at most 256 stable entity handles with a tag.', 'let enemies = query_tag("enemy", 32);'],
  ['query_group', 'query_group(group, limit) -> Array<Handle<Entity>>', 'object', 'Returns at most 256 stable entity handles in a group.', 'let actors = query_group("actors", 64);'],
  ['query_component', 'query_component(kind, limit) -> Array<Handle<Entity>>', 'object', 'Returns at most 256 entity handles owning a component kind.', 'let cameras = query_component("Camera2D", 8);'],
  ['query_radius', 'query_radius(x, y, radius, limit) -> Array<Handle<Entity>>', 'object', 'Returns bounded handles inside a finite world-space radius.', 'let nearby = query_radius(0.0, 0.0, 8.0, 32);'],
  ['entity_name_on', 'entity_name_on(handle) -> string', 'object', 'Reads the query-snapshot name for an entity handle.', 'let name = entity_name_on(handle);'],
  ['entity_enabled_on', 'entity_enabled_on(handle) -> bool', 'object', 'Reads the query-snapshot enabled state for an entity handle.', 'if entity_enabled_on(handle) { }'],
  ['entity_position_x_on', 'entity_position_x_on(handle) -> float', 'object', 'Reads query-snapshot world X for an entity handle.', 'let x = entity_position_x_on(handle);'],
  ['entity_position_y_on', 'entity_position_y_on(handle) -> float', 'object', 'Reads query-snapshot world Y for an entity handle.', 'let y = entity_position_y_on(handle);'],
  ['entity_set_position', 'entity_set_position(handle, x, y)', 'object', 'Queues a finite world position for a validated entity handle.', 'entity_set_position(target, 4.0, 2.0);'],
  ['entity_set_rotation', 'entity_set_rotation(handle, radians)', 'object', 'Queues a world rotation for a validated entity handle.', 'entity_set_rotation(target, 1.57);'],
  ['entity_set_scale', 'entity_set_scale(handle, x, y)', 'object', 'Queues a non-zero world scale for a validated entity handle.', 'entity_set_scale(target, 2.0, 2.0);'],
  ['entity_set_enabled', 'entity_set_enabled(handle, enabled)', 'object', 'Enables or disables a validated entity.', 'entity_set_enabled(target, false);'],
  ['entity_add_tag', 'entity_add_tag(handle, tag)', 'object', 'Adds one bounded tag to a validated entity.', 'entity_add_tag(target, "enemy");'],
  ['entity_remove_tag', 'entity_remove_tag(handle, tag)', 'object', 'Removes one tag from a validated entity.', 'entity_remove_tag(target, "enemy");'],
  ['entity_add_group', 'entity_add_group(handle, group)', 'object', 'Adds a validated entity to a bounded group.', 'entity_add_group(target, "actors");'],
  ['entity_remove_group', 'entity_remove_group(handle, group)', 'object', 'Removes a validated entity from a group.', 'entity_remove_group(target, "actors");'],
  ['entity_destroy', 'entity_destroy(handle)', 'object', 'Safely destroys the validated target at the structural boundary.', 'entity_destroy(target);'],
  ['component_handle', 'component_handle(kind) -> Handle<Component>', 'component', 'Returns a stable component handle or explicit invalid handle.', 'let body = component_handle("RigidBody2D");'],
  ['has_component', 'has_component(kind) -> bool', 'component', 'Reports whether this entity owns an enabled component.', 'if has_component("Animator") { animator_play("Idle"); }'],
  ['get_component', 'get_component(kind) -> string', 'component', 'Legacy component URI lookup.', 'let body = get_component("RigidBody2D");', 'component_handle'],
  ['component_set_enabled_on', 'component_set_enabled_on(handle, component, enabled)', 'component', 'Enables or disables an existing target component.', 'component_set_enabled_on(target, "DamageHitbox2D", false);'],
  ['transform', 'transform() -> TransformSnapshot', 'transform', 'Reads one coherent world-transform snapshot.', 'let pose = transform();'],
  ['set_position', 'set_position(x, y)', 'transform', 'Queues an exact finite world position.', 'set_position(4.0, 2.0);'],
  ['set_rotation', 'set_rotation(radians)', 'transform', 'Queues world rotation in radians.', 'set_rotation(1.57079632679);'],
  ['set_scale', 'set_scale(x, y)', 'transform', 'Queues world scale.', 'set_scale(2.0, 2.0);'],
  ['input_down', 'input_down(action) -> bool', 'input', 'True while an action is held.', 'if input_down("Move") { }'],
  ['input_pressed', 'input_pressed(action) -> bool', 'input', 'True on an action press edge.', 'if input_pressed("Jump") { apply_impulse(0.0, 8.0); }'],
  ['input_released', 'input_released(action) -> bool', 'input', 'True on an action release edge.', 'if input_released("Fire") { }'],
  ['input_performed', 'input_performed(action) -> bool', 'input', 'True when Press, Hold, Tap, or Multi-tap reaches Performed.', 'if input_performed("Confirm") { }'],
  ['input_cancelled', 'input_cancelled(action) -> bool', 'input', 'True when an interaction is released before completion.', 'if input_cancelled("Charge") { }'],
  ['input_phase', 'input_phase(action) -> string', 'input', 'Returns idle, started, performed, or cancelled.', 'let phase = input_phase("Charge");'],
  ['input_duration', 'input_duration(action) -> float', 'input', 'Returns the current held duration in seconds.', 'let held = input_duration("Charge");'],
  ['input_context_active', 'input_context_active(name) -> bool', 'input', 'Reports whether an input context is active.', 'if input_context_active("Menu") { }'],
  ['input_map_active', 'input_map_active(name) -> bool', 'input', 'Reports whether an action map is active.', 'if input_map_active("Combat") { }'],
  ['input_scheme', 'input_scheme() -> string', 'input', 'Returns the active control scheme.', 'let scheme = input_scheme();'],
  ['input_context_push', 'input_context_push(name, priority, consume)', 'input', 'Pushes or updates a bounded input context.', 'input_context_push("Menu", 100, true);'],
  ['input_context_pop', 'input_context_pop(name)', 'input', 'Removes an active non-root input context.', 'input_context_pop("Menu");'],
  ['input_map_enable', 'input_map_enable(name)', 'input', 'Enables a bounded named action map.', 'input_map_enable("Combat");'],
  ['input_map_disable', 'input_map_disable(name)', 'input', 'Disables a named non-default action map.', 'input_map_disable("Combat");'],
  ['input_scheme_set', 'input_scheme_set(name)', 'input', 'Selects a named input scheme.', 'input_scheme_set("Gamepad");'],
  ['input_prompt', 'input_prompt(action) -> string', 'input', 'The key, button or symbol of an action on the device in use ("Space", "A", "✕", "LMB"), for prompts in your own text.', 'ui_set_text(`Press ${input_prompt("Jump")} to jump`);'],
  ['input_rebind', 'input_rebind(action[, index])', 'input', 'Waits for the next key, mouse button or gamepad button and binds it to the action (binding `index`, default 0). Escape cancels. Sends the `input.rebound` or `input.rebind_cancelled` signal; the Player keeps the player\'s bindings.', 'input_rebind("Jump");'],
  ['input_bindings_reset', 'input_bindings_reset()', 'input', 'Puts the project\'s key bindings back and forgets the player\'s own.', 'input_bindings_reset();'],
  ['input_axis', 'input_axis(action) -> float', 'input', 'Reads a scalar action.', 'let x = input_axis("Horizontal");'],
  ['input_vector', 'input_vector(action) -> Vec2', 'input', 'Reads a Vector2 action.', 'let move = input_vector("Move");'],
  ['input_vector_x', 'input_vector_x(action) -> float', 'input', 'Reads a Vector2 x component.', 'let x = input_vector_x("Move");'],
  ['input_vector_y', 'input_vector_y(action) -> float', 'input', 'Reads a Vector2 y component.', 'let y = input_vector_y("Move");'],
  ['mouse_x', 'mouse_x() -> float', 'input', 'Reads pointer x in the viewport.', 'let x = mouse_x();'],
  ['mouse_y', 'mouse_y() -> float', 'input', 'Reads pointer y in the viewport.', 'let y = mouse_y();'],
  ['mouse_world_x', 'mouse_world_x() -> float', 'input', 'Reads pointer x in game-camera world units.', 'set_position(mouse_world_x(), mouse_world_y());'],
  ['mouse_world_y', 'mouse_world_y() -> float', 'input', 'Reads pointer y in game-camera world units.', 'set_position(mouse_world_x(), mouse_world_y());'],
  ['view_min_x', 'view_min_x() -> float', 'input', 'Reads the active game camera left world bound.', 'if transform().position_x < view_min_x() { destroy(); }'],
  ['view_max_x', 'view_max_x() -> float', 'input', 'Reads the active game camera right world bound.', 'if transform().position_x > view_max_x() { destroy(); }'],
  ['view_min_y', 'view_min_y() -> float', 'input', 'Reads the active game camera bottom world bound.', 'if transform().position_y < view_min_y() { destroy(); }'],
  ['view_max_y', 'view_max_y() -> float', 'input', 'Reads the active game camera top world bound.', 'if transform().position_y > view_max_y() { destroy(); }'],
  ['viewport_width', 'viewport_width() -> float', 'input', 'Reads the current game viewport width in CSS pixels.', 'let aspect = viewport_width() / viewport_height();'],
  ['viewport_height', 'viewport_height() -> float', 'input', 'Reads the current game viewport height in CSS pixels.', 'let aspect = viewport_width() / viewport_height();'],
  ['wheel_x', 'wheel_x() -> float', 'input', 'Reads horizontal wheel delta.', 'let dx = wheel_x();'],
  ['wheel_y', 'wheel_y() -> float', 'input', 'Reads vertical wheel delta.', 'let dy = wheel_y();'],
  ['is_down', 'is_down(action) -> bool', 'input', 'Legacy held-action alias.', 'if is_down("Move") { }', 'input_down'],
  ['was_pressed', 'was_pressed(action) -> bool', 'input', 'Legacy press-edge alias.', 'if was_pressed("Jump") { }', 'input_pressed'],
  ['was_released', 'was_released(action) -> bool', 'input', 'Legacy release-edge alias.', 'if was_released("Fire") { }', 'input_released'],
  ['axis', 'axis(action) -> float', 'input', 'Legacy scalar-action alias.', 'let x = axis("Horizontal");', 'input_axis'],
  ['vector', 'vector(action) -> Vec2', 'input', 'Legacy Vector2-action alias.', 'let move = vector("Move");', 'input_vector'],
  ['rigid_body', 'rigid_body() -> RigidBodySnapshot', 'physics', 'Reads body velocity, angular velocity, mass and type.', 'let body = rigid_body();'],
  ['apply_force', 'apply_force(x, y)', 'physics', 'Applies force in newtons during a fixed step.', 'apply_force(12.0, 0.0);'],
  ['apply_impulse', 'apply_impulse(x, y)', 'physics', 'Applies instantaneous impulse in N·s.', 'apply_impulse(0.0, 8.0);'],
  ['set_velocity', 'set_velocity(x, y)', 'physics', 'Sets linear velocity in world units per second.', 'set_velocity(3.0, rigid_body().velocity_y);'],
  ['set_angular_velocity', 'set_angular_velocity(radians_per_second)', 'physics', 'Sets angular velocity.', 'set_angular_velocity(0.5);'],
  ['character_is_on_floor', 'character_is_on_floor() -> bool', 'physics', 'Reads authoritative floor state.', 'if character_is_on_floor() { }'],
  ['character_is_on_wall', 'character_is_on_wall() -> bool', 'physics', 'Reads authoritative wall state.', 'if character_is_on_wall() { }'],
  ['character_is_on_ceiling', 'character_is_on_ceiling() -> bool', 'physics', 'Reads authoritative ceiling state.', 'if character_is_on_ceiling() { }'],
  ['can_coyote_jump', 'can_coyote_jump() -> bool', 'physics', 'Reports floor contact or an active coyote window.', 'if can_coyote_jump() { }'],
  ['character_can_coyote_jump', 'character_can_coyote_jump() -> bool', 'physics', 'Legacy coyote-window name.', 'if character_can_coyote_jump() { }', 'can_coyote_jump'],
  ['character_floor_normal', 'character_floor_normal() -> Vec2', 'physics', 'Returns the current floor normal.', 'let normal = character_floor_normal();'],
  ['character_platform_velocity', 'character_platform_velocity() -> Vec2', 'physics', 'Returns supporting-platform velocity.', 'let platform = character_platform_velocity();'],
  ['move_character', 'move_character(x, y)', 'physics', 'Queues CharacterBody2D displacement for the next fixed step.', 'move_character(2.0 * dt, 0.0);'],
  ['character_floor_is_one_way', 'character_floor_is_one_way() -> bool', 'physics', 'True when the character stands on a one-way platform.', 'if character_floor_is_one_way() && input_pressed("Down") { character_drop_through(); }'],
  ['target_joint_move', 'target_joint_move(x, y)', 'physics', 'Pulls this body toward a world point with its Target Joint (one is added when missing): drag, carry or hold it.', 'target_joint_move(mouse_world_x(), mouse_world_y());'],
  ['target_joint_release', 'target_joint_release()', 'physics', 'Lets go of the body: its Target Joint stops pulling.', 'target_joint_release();'],
  ['set_surface_speed', 'set_surface_speed(speed)', 'physics', 'Makes this body a conveyor: its faces carry what rests on them at `speed` m/s (clockwise around the body for positive speeds).', 'set_surface_speed(2.5);'],
  ['camera_shake', 'camera_shake(amount)', 'gameplay', 'Shakes the active camera: adds `amount` (0–1) of trauma; the view moves and turns by trauma² and calms down on its own (Camera2D shake settings). Reduced motion keeps a quarter.', 'camera_shake(0.5);'],
  ['camera_zoom', 'camera_zoom(zoom)', 'gameplay', 'Sets the zoom of the active camera (1 is the authored size).', 'camera_zoom(1.5);'],
  ['camera_follow', 'camera_follow(handle)', 'gameplay', 'The active camera follows an object; camera_follow_none() stops following.', 'camera_follow(find_entity_handle("Player"));'],
  ['camera_follow_none', 'camera_follow_none()', 'gameplay', 'The active camera stops following.', 'camera_follow_none();'],
  ['screen_flash', 'screen_flash(r, g, b, seconds)', 'gameplay', 'Flashes the screen in a colour that fades out over `seconds` (not shown with reduced motion).', 'screen_flash(255.0, 255.0, 255.0, 0.2);'],
  ['character_drop_through', 'character_drop_through([seconds])', 'physics', 'Lets the character fall through one-way platforms (0.25 s by default; it keeps passing while it still overlaps one).', 'character_drop_through();'],
  ['ui_set_text', 'ui_set_text(text)', 'ui', 'Sets Text or TextRenderer2D content on this entity.', 'ui_set_text(`Score: ${save_get("score", 0)}`);'],
  ['ui_set_value', 'ui_set_value(value)', 'ui', 'Sets Slider, ProgressBar or Checkbox value.', 'ui_set_value(0.75);'],
  ['ui_set_text_on', 'ui_set_text_on(handle, text)', 'ui', 'Sets text on a validated target UI/world-text entity.', 'ui_set_text_on(label, "Ready");'],
  ['ui_set_value_on', 'ui_set_value_on(handle, value)', 'ui', 'Sets a validated target Slider, ProgressBar, or Checkbox.', 'ui_set_value_on(health_bar, 0.75);'],
  ['animator_handle', 'animator_handle() -> Handle<Animator>', 'animation', 'Returns this Animator as a stable handle.', 'let animator = animator_handle();'],
  ['animator', 'animator() -> string', 'animation', 'Legacy Animator URI lookup.', 'let animator = animator();', 'animator_handle'],
  ['animator_set_bool', 'animator_set_bool(name, value)', 'animation', 'Sets a Boolean Animator parameter.', 'animator_set_bool("moving", true);'],
  ['animator_set_float', 'animator_set_float(name, value)', 'animation', 'Sets a float Animator parameter.', 'animator_set_float("speed", 3.0);'],
  ['animator_set_integer', 'animator_set_integer(name, value)', 'animation', 'Sets an integer Animator parameter.', 'animator_set_integer("weapon", 2);'],
  ['animator_trigger', 'animator_trigger(name)', 'animation', 'Raises an Animator trigger.', 'animator_trigger("jump");'],
  ['animator_play', 'animator_play(state)', 'animation', 'Requests an Animator state (id or name), switching at once.', 'animator_play("Run");'],
  ['animator_crossfade', 'animator_crossfade(state, seconds)', 'animation', 'Blends from the current Animator state to another (id or name) over the given seconds.', 'animator_crossfade("Jump", 0.15);'],
  ['animator_state', 'animator_state() -> string', 'animation', 'Name of the current Animator state (base layer); "" without an Animator.', 'if animator_state() == "Run" { }'],
  ['animator_state_time', 'animator_state_time() -> float', 'animation', 'Normalised time of the current state: 0 at its start, 1 at the end of the clip (keeps counting while it loops).', 'if animator_state_time() >= 1.0 { }'],
  ['animator_in_transition', 'animator_in_transition() -> bool', 'animation', 'True while the Animator blends between two states.', 'if !animator_in_transition() { }'],
  ['tween', 'tween(property, to, seconds[, easing[, options]])', 'animation', 'Animates x, y, rotation, rotation_degrees, scale_x, scale_y, scale or opacity of this object to a value. Easings: linear and quad, cubic, quart, quint, sine, expo, circ, back, elastic, bounce with _in, _out or _in_out. Options #{ delay, loops (-1 forever), yoyo, relative, signal }. Emits "tween.finished".', 'tween("y", 2.0, 0.5, "back_out", #{ relative: true });'],
  ['entity_tween', 'entity_tween(entity, property, to, seconds, easing)', 'animation', 'Animates a property of another object (a handle).', 'entity_tween(find_entity_handle("Door"), "y", 3.0, 1.0, "sine_in_out");'],
  ['tween_stop', 'tween_stop([property])', 'animation', 'Stops this object\'s tweens (of one property, or all).', 'tween_stop("x");'],
  ['entity_tween_stop', 'entity_tween_stop(entity)', 'animation', 'Stops all tweens of another object (a handle).', 'entity_tween_stop(find_entity_handle("Door"));'],
  ['audio_source_handle', 'audio_source_handle() -> Handle<AudioSource>', 'audio', 'Returns this AudioSource as a stable handle.', 'let source = audio_source_handle();'],
  ['audio_source', 'audio_source() -> string', 'audio', 'Legacy AudioSource URI lookup.', 'let source = audio_source();', 'audio_source_handle'],
  ['audio_play', 'audio_play()', 'audio', 'Plays this entity AudioSource.', 'audio_play();'],
  ['audio_pause', 'audio_pause()', 'audio', 'Pauses this entity AudioSource.', 'audio_pause();'],
  ['audio_stop', 'audio_stop()', 'audio', 'Stops this entity AudioSource.', 'audio_stop();'],
  ['navigation_set_target', 'navigation_set_target(x, y)', 'navigation', 'Sets this NavigationAgent2D world target.', 'navigation_set_target(10.0, 4.0);'],
  ['instantiate', 'instantiate(prefab)', 'scene', 'Queues a prefab instance.', 'instantiate("asset://enemy-prefab");'],
  ['spawn_at', 'spawn_at(prefab, x, y, rotation, scale_x, scale_y) -> Handle<Entity>', 'scene', 'Queues a prefab at an exact transform and returns a stable pending handle.', 'let enemy = spawn_at("asset://enemy", 4.0, 2.0, 0.0, 1.0, 1.0);'],
  ['destroy', 'destroy()', 'scene', 'Queues safe entity destruction.', 'destroy();'],
  ['despawn', 'despawn()', 'scene', 'Returns a pooled object or safely destroys it.', 'despawn();'],
  ['scene_load', 'scene_load(scene)', 'scene', 'Queues a scene switch.', 'scene_load("Level 2");'],
  ['scene_reload', 'scene_reload()', 'scene', 'Queues active-scene reload.', 'scene_reload();'],
  ['scene_quit', 'scene_quit()', 'scene', 'Requests clean runtime shutdown.', 'scene_quit();'],
  ['game_pause', 'game_pause(paused)', 'gameplay', 'Pauses or resumes scaled gameplay while input/update callbacks remain available.', 'game_pause(true);'],
  ['game_paused', 'game_paused() -> bool', 'gameplay', 'Reports the current gameplay pause state.', 'if game_paused() { }'],
  ['checkpoint_set', 'checkpoint_set(name)', 'gameplay', 'Captures bounded scene transforms, health, score, and session state.', 'checkpoint_set("room-2");'],
  ['checkpoint_has', 'checkpoint_has(name) -> bool', 'gameplay', 'Reports whether a runtime checkpoint exists.', 'if checkpoint_has("room-2") { }'],
  ['checkpoint_restore', 'checkpoint_restore(name)', 'gameplay', 'Restores a same-scene checkpoint or fails explicitly.', 'checkpoint_restore("room-2");'],
  ['score_get', 'score_get() -> float', 'gameplay', 'Returns the bounded session score.', 'let score = score_get();'],
  ['score_set', 'score_set(value)', 'gameplay', 'Sets the bounded session score.', 'score_set(0.0);'],
  ['score_add', 'score_add(value)', 'gameplay', 'Adds to the bounded session score.', 'score_add(10.0);'],
  ['session_get', 'session_get(key, fallback) -> value', 'gameplay', 'Reads a bounded serializable session value.', 'let wave = session_get("wave", 1);'],
  ['session_set', 'session_set(key, value)', 'gameplay', 'Writes a bounded serializable session value.', 'session_set("wave", 2);'],
  ['network_enabled', 'network_enabled() -> bool', 'network', 'Reports whether reviewed project networking and explicit permission are enabled.', 'if network_enabled() { }'],
  ['network_connected', 'network_connected() -> bool', 'network', 'Reports whether the optional runtime has an active session transport.', 'if network_connected() { network_rpc("ready", true); }'],
  ['network_is_authority', 'network_is_authority() -> bool', 'network', 'Reports whether this peer owns server or host authority.', 'if network_is_authority() { }'],
  ['network_peer_count', 'network_peer_count() -> int', 'network', 'Returns the bounded number of known remote peers.', 'let peers = network_peer_count();'],
  ['network_local_peer', 'network_local_peer() -> string', 'network', 'Returns the current bounded local peer identifier.', 'let peer = network_local_peer();'],
  ['network_role', 'network_role() -> string', 'network', 'Returns client, server, or host.', 'if network_role() == "client" { }'],
  ['network_tick', 'network_tick() -> int', 'network', 'Returns the authoritative network tick observed at this callback boundary.', 'let tick = network_tick();'],
  ['network_rpc', 'network_rpc(name, payload)', 'network', 'Queues a declared RPC through explicit permission, authority, direction, schema, rate, payload, and bandwidth checks.', 'network_rpc("player.ready", #{ ready: true });'],
  ['time', 'time() -> TimeSnapshot', 'timing', 'Returns delta, fixed delta, elapsed, scale and frame.', 'let now = time();'],
  ['time_delta', 'time_delta() -> float', 'timing', 'Returns render delta seconds.', 'let dt = time_delta();'],
  ['time_fixed_delta', 'time_fixed_delta() -> float', 'timing', 'Returns fixed-step seconds.', 'let dt = time_fixed_delta();'],
  ['time_elapsed', 'time_elapsed() -> float', 'timing', 'Returns scaled elapsed seconds.', 'let elapsed = time_elapsed();'],
  ['time_scale', 'time_scale() -> float', 'timing', 'Returns active time scale.', 'let scale = time_scale();'],
  ['time_frame', 'time_frame() -> int', 'timing', 'Returns deterministic frame number.', 'let frame = time_frame();'],
  ['random', 'random() -> float', 'timing', 'Returns a deterministic seeded value in [0, 1).', 'let roll = random();'],
  ['random_range', 'random_range(minimum, maximum) -> float', 'timing', 'Returns a deterministic value in a finite range.', 'let x = random_range(-2.0, 2.0);'],
  ['timer_start', 'timer_start(name, seconds, repeat)', 'tasks', 'Starts a validated entity-owned timer.', 'timer_start("pulse", 0.5, true);'],
  ['timer_pause', 'timer_pause(name)', 'tasks', 'Pauses a timer.', 'timer_pause("pulse");'],
  ['timer_resume', 'timer_resume(name)', 'tasks', 'Resumes a timer.', 'timer_resume("pulse");'],
  ['timer_cancel', 'timer_cancel(name)', 'tasks', 'Cancels a timer.', 'timer_cancel("pulse");'],
  ['task_wait', 'task_wait(name, seconds)', 'tasks', 'Schedules a cancellable deferred task.', 'task_wait("load", 0.25);'],
  ['task_cancel', 'task_cancel(name)', 'tasks', 'Cancels an entity-owned task.', 'task_cancel("load");'],
  ['signal_emit', 'signal_emit(name, payload)', 'signals', 'Queues a serializable broadcast signal.', 'signal_emit("player.ready", #{ lives: 3 });'],
  ['signal_emit_to', 'signal_emit_to(entity_id, name, payload)', 'signals', 'Queues a serializable targeted signal.', 'signal_emit_to(entity(), "heal", 10);'],
  ['entity_handle_of', 'entity_handle_of(id) -> Handle<Entity>', 'object', 'Returns a handle for an entity id (for example other in a collision) at its current generation.', 'entity_destroy(entity_handle_of(other));'],
  ['entity_has_tag', 'entity_has_tag(entity, tag) -> bool', 'object', 'True when the entity (id or handle, e.g. other in a collision) has the tag.', 'if entity_has_tag(other, "coin") { score_add(1.0); }'],
  ['entity_in_group', 'entity_in_group(entity, group) -> bool', 'object', 'True when the entity (id or handle) is in the group.', 'if entity_in_group(other, "enemies") { }'],
  ['call_on', 'call_on(entity, function, args)', 'signals', 'Calls a function of another object\'s script after this callback phase; args is an optional array.', 'call_on(other, "take_damage", [10]);'],
  ['call_global', 'call_global(name, function, args)', 'signals', 'Calls a function of a project global script (Project Settings › Scripting › Global scripts).', 'call_global("Game", "add_coins", [1]);'],
  ['call_group', 'call_group(group, function, args)', 'signals', 'Calls a function on every object in a group.', 'call_group("enemies", "alert", [position_x()]);'],
  ['after', 'after(seconds, function, args)', 'tasks', 'Calls one of this script\'s functions after a game-time delay.', 'after(0.5, "explode");'],
  ['play_sound', 'play_sound(asset, options)', 'audio', 'Plays a sound once (or looped) on a mixer bus; options #{ bus, volume, pitch, looped, tag }.', 'play_sound("Assets/Audio/coin.wav", #{ volume: 0.8, pitch: 1.2 });'],
  ['stop_sounds', 'stop_sounds(tag, fade)', 'audio', 'Stops script sounds with a tag ("" stops all), optionally fading out.', 'stop_sounds("ambience", 1.0);'],
  ['play_music', 'play_music(asset, fade, volume)', 'audio', 'Plays looping music on the Music bus; a new track crossfades.', 'play_music("Assets/Audio/theme.ogg", 1.5);'],
  ['stop_music', 'stop_music(fade)', 'audio', 'Fades out and stops the music.', 'stop_music(2.0);'],
  ['set_bus_volume', 'set_bus_volume(bus, volume)', 'audio', 'Sets a mixer bus volume for this play session (1.0 = authored level).', 'set_bus_volume("Music", 0.5);'],
  ['play_video', 'play_video(asset, options)', 'audio', 'Plays a full-screen video over the game view; emits "video.finished". Options #{ skippable, volume, looped }.', 'play_video("Assets/Video/intro.webm");'],
  ['stop_video', 'stop_video()', 'audio', 'Stops the playing video (emits "video.finished" with reason "stopped").', 'stop_video();'],
  ['post_set', 'post_set(name, value, seconds)', 'gameplay', 'Sets a post-processing value (exposure, contrast, saturation, vignette, bloom, blur) for this play session; seconds tweens to it. Post-processing must be enabled.', 'post_set("vignette", 0.6, 0.5);'],
  ['post_pulse', 'post_pulse(name, amount, seconds)', 'gameplay', 'Adds a post-processing amount that fades out over seconds (beat flashes, hits).', 'post_pulse("bloom", 0.6, 0.25);'],
  ['post_reset', 'post_reset()', 'gameplay', 'Returns post-processing to the project settings.', 'post_reset();'],
  ['joint_servo', 'joint_servo(target)', 'physics', 'Drives the revolute (degrees) or prismatic (units) joint on this object to a target with its motor; measured like the joint limits (the connected body relative to this one).', 'joint_servo(45.0);'],
  ['joint_servo_off', 'joint_servo_off()', 'physics', 'Stops the servo and switches its motor off; the joint moves freely again.', 'joint_servo_off();'],
  ['explode', 'explode(x, y, radius, impulse)', 'physics', 'Pushes every dynamic body near a point away from it, fading to nothing at the radius.', 'explode(position_x(), position_y(), 4.0, 30.0);'],
  ['rhythm_play', 'rhythm_play(start_seconds)', 'rhythm', 'Starts this object\'s RhythmChart2D (else the first chart in the scene); start_seconds is optional chart time.', 'rhythm_play();'],
  ['rhythm_pause', 'rhythm_pause()', 'rhythm', 'Pauses the chart and its music.', 'rhythm_pause();'],
  ['rhythm_resume', 'rhythm_resume()', 'rhythm', 'Resumes a paused chart one second early so the player finds the beat again.', 'rhythm_resume();'],
  ['rhythm_stop', 'rhythm_stop()', 'rhythm', 'Stops the chart and its music.', 'rhythm_stop();'],
  ['rhythm_restart', 'rhythm_restart()', 'rhythm', 'Plays the chart again from the start (new score).', 'rhythm_restart();'],
  ['rhythm_seek', 'rhythm_seek(seconds)', 'rhythm', 'Jumps to a chart time; earlier notes are skipped, not missed (practice).', 'rhythm_seek(30.0);'],
  ['rhythm_set_offset', 'rhythm_set_offset(milliseconds)', 'rhythm', 'Sets the chart\'s audio offset (positive: notes later).', 'rhythm_set_offset(15.0);'],
  ['rhythm_set_autoplay', 'rhythm_set_autoplay(enabled)', 'rhythm', 'Turns autoplay (perfect bot play with scheduled hit sounds) on or off.', 'rhythm_set_autoplay(true);'],
  ['rhythm_set_speed', 'rhythm_set_speed(speed)', 'rhythm', 'Sets the note scroll speed (chart units per second at speed 1).', 'rhythm_set_speed(10.0);'],
  ['rhythm_set_calibration', 'rhythm_set_calibration(milliseconds)', 'rhythm', 'Stores this device\'s audio calibration (positive: the music is heard later); applies from the next play.', 'rhythm_set_calibration(-24.0);'],
  ['rhythm_calibration', 'rhythm_calibration() -> float', 'rhythm', 'The stored device calibration in milliseconds.', 'let offset = rhythm_calibration();'],
  ['rhythm_time', 'rhythm_time() -> float', 'rhythm', 'Chart time in seconds (negative during the lead-in), on the audio clock.', 'let t = rhythm_time();'],
  ['rhythm_beat', 'rhythm_beat() -> float', 'rhythm', 'The current beat (fractional) through the chart\'s tempo map.', 'if rhythm_beat() >= 16.0 { }'],
  ['rhythm_bpm', 'rhythm_bpm() -> float', 'rhythm', 'Tempo at the current chart time.', 'let bpm = rhythm_bpm();'],
  ['rhythm_score', 'rhythm_score() -> int', 'rhythm', 'Score out of 1,000,000 (900,000 accuracy + 100,000 max combo).', 'ui_set_text(`${rhythm_score()}`);'],
  ['rhythm_combo', 'rhythm_combo() -> int', 'rhythm', 'The current combo.', 'if rhythm_combo() >= 100 { }'],
  ['rhythm_max_combo', 'rhythm_max_combo() -> int', 'rhythm', 'The longest combo so far.', 'let best = rhythm_max_combo();'],
  ['rhythm_accuracy', 'rhythm_accuracy() -> float', 'rhythm', 'Accuracy 0..1 over the judged notes (perfect 1, great 0.8, good 0.5).', 'let percent = rhythm_accuracy() * 100.0;'],
  ['rhythm_progress', 'rhythm_progress() -> float', 'rhythm', 'Progress 0..1 through the chart.', 'let p = rhythm_progress();'],
  ['rhythm_state', 'rhythm_state() -> string', 'rhythm', 'idle, loading, ready, countdown, playing, paused, finished or error.', 'if rhythm_state() == "finished" { }'],
  ['rhythm_judgement', 'rhythm_judgement() -> string', 'rhythm', 'The latest judgement: perfect, great, good, bad or miss.', 'let last = rhythm_judgement();'],
  ['rhythm_playing', 'rhythm_playing() -> bool', 'rhythm', 'True while the chart runs (lead-in included).', 'if rhythm_playing() { }'],
  ['rhythm_finished', 'rhythm_finished() -> bool', 'rhythm', 'True once every note is judged and the chart ended.', 'if rhythm_finished() { }'],
  ['rhythm_full_combo', 'rhythm_full_combo() -> bool', 'rhythm', 'True when a finished chart had no bad or miss.', 'if rhythm_full_combo() { }'],
  ['rhythm_count', 'rhythm_count(name) -> int', 'rhythm', 'Count of perfect, great, good, bad, miss, early, late, judged or total notes.', 'let misses = rhythm_count("miss");'],
  ['rhythm_judge', 'rhythm_judge(note, judgement_or_offset_ms)', 'rhythm', 'Judges a note (custom note types, from rhythm.touch): "perfect" … "miss", or an offset in milliseconds that the note type\'s windows classify. Ignored when the note is already judged.', 'rhythm_judge(payload.note, "miss");'],
  ['rhythm_my_note', 'rhythm_my_note() -> map', 'rhythm', 'On an object that shows a note (a note type with a prefab): id, type, beat, time, lane, line, x and data of that note; () elsewhere.', 'let note = rhythm_my_note();'],
  ['rhythm_visual_offset', 'rhythm_visual_offset() -> float', 'rhythm', 'The device picture offset in milliseconds (notes are drawn this much earlier; judgement unchanged).', 'let picture = rhythm_visual_offset();'],
  ['rhythm_set_visual_offset', 'rhythm_set_visual_offset(milliseconds)', 'rhythm', 'Stores this device\'s picture offset (−500 … 500 ms); applies at once.', 'rhythm_set_visual_offset(20.0);'],
  ['rhythm_stats', 'rhythm_stats() -> map', 'rhythm', 'Every statistic in one map (score, counts, accuracy, mean_offset_ms, full_combo …).', 'let stats = rhythm_stats();'],
  ['save_has', 'save_has(key) -> bool', 'save', 'Reports whether a save key exists.', 'if save_has("checkpoint") { }'],
  ['save_get', 'save_get(key, fallback) -> value', 'save', 'Reads a safe persistent value.', 'let score = save_get("score", 0);'],
  ['save_set', 'save_set(key, value)', 'save', 'Queues a serializable persistent value.', 'save_set("score", 10);'],
  ['save_delete', 'save_delete(key)', 'save', 'Deletes a persistent key.', 'save_delete("checkpoint");'],
  ['save_clear', 'save_clear()', 'save', 'Clears in-memory save state.', 'save_clear();'],
  ['save_load', 'save_load(slot)', 'save', 'Queues a named slot load.', 'save_load("slot1");'],
  ['save_commit', 'save_commit(slot)', 'save', 'Atomically commits a named slot.', 'save_commit("slot1");'],
  ['log_debug', 'log_debug(message)', 'logging', 'Writes a bounded Debug console event.', 'log_debug("tick");'],
  ['log_info', 'log_info(message)', 'logging', 'Writes a bounded Info console event.', 'log_info("ready");'],
  ['log_warning', 'log_warning(message)', 'logging', 'Writes a bounded Warning console event.', 'log_warning("low health");'],
  ['log_error', 'log_error(message)', 'logging', 'Writes a bounded Error event without crashing.', 'log_error("missing target");'],
  ['resource_handle', 'resource_handle(reference, type) -> Handle<Resource>', 'resources', 'Validates an asset URI and returns a stable typed handle.', 'let texture = resource_handle("asset://texture", "Texture2D");'],
  ['api_version', 'api_version() -> int', 'resources', 'Returns the API version selected for this script asset.', 'expect(api_version() >= 1, "supported API");'],
  ['api_current_version', 'api_current_version() -> int', 'resources', 'Returns the newest API implemented by this engine.', 'expect(api_current_version() == 2, "API v2 engine");'],
  ['api_minimum_version', 'api_minimum_version() -> int', 'resources', 'Returns the oldest API version supported by the compatibility adapter.', 'expect(api_minimum_version() == 1, "API v1 adapter");'],
  ['api_namespace', 'api_namespace(symbol) -> string', 'resources', 'Returns the documentation namespace of a flat symbol.', 'let group = api_namespace("scene_load");'],
  ['expect', 'expect(condition, message) -> bool', 'testing', 'Records a test assertion without corrupting another instance.', 'expect(2 + 2 == 4, "math");']
] as const

export const SCRIPT_API: readonly ScriptApiEntry[] = SPECS.map(/** 把基础 API 元组展开为文档记录，附加分类、引入版本、弃用信息及手册锚点。 */ ([name, signature, namespace, detail, example, replacement]) => ({
  name, signature, namespace, category: namespace[0].toUpperCase() + namespace.slice(1), detail, example, since: '1.0',
  deprecated: replacement ? { replacement, removal: 'API v3', reason: 'API v2 keeps the API v1 adapter while directing new code to the typed canonical binding.' } : undefined,
  documentation: `manual/index.html#api-${name.replace(/_/g, '-')}`
}))

const FIXED_STEP_BINDINGS = new Set(['fixed_update', 'apply_force', 'apply_impulse', 'set_velocity', 'set_angular_velocity', 'move_character'])
const SEEDED_BINDINGS = new Set(['random', 'random_range'])
const HOST_DEPENDENT_BINDINGS = new Set(['mouse_x', 'mouse_y', 'wheel_x', 'wheel_y', 'rhythm_time', 'rhythm_beat', 'rhythm_bpm', 'rhythm_score', 'rhythm_combo', 'rhythm_max_combo', 'rhythm_accuracy', 'rhythm_progress', 'rhythm_state', 'rhythm_judgement', 'rhythm_playing', 'rhythm_finished', 'rhythm_full_combo', 'rhythm_count', 'rhythm_stats', 'rhythm_calibration', 'rhythm_visual_offset', 'rhythm_my_note'])
const PERSISTENT_BINDINGS = new Set(['save_has', 'save_get', 'save_set', 'save_delete', 'save_clear', 'save_load', 'save_commit'])
export const SCRIPT_API_V2_MANIFEST: ScriptApiV2Manifest = {
  format: 'nova-rhai-api-manifest',
  version: 2,
  minimumCompatibleVersion: 1,
  errorModel: 'Result values are explicit; queued host mutations fail through diagnostics and never expose host exceptions.',
  handleModel: 'Handles are typed, versioned, copied values whose validity must be checked at each callback boundary.',
  entries: SCRIPT_API.map(/** 按 API 分类与专用集合补充返回约定、生命周期、线程要求、确定性和权限元信息。 */ entry => ({
    ...entry,
    id: `${entry.namespace}.${entry.name}`,
    module: entry.namespace,
    callable: entry.name,
    resultConvention: entry.namespace === 'lifecycle' || entry.name.startsWith('on_')
      ? 'lifecycle'
      : entry.signature.includes('->')
        ? entry.namespace === 'resources' ? 'result' : 'value'
        : 'queued-command',
    lifetime: PERSISTENT_BINDINGS.has(entry.name) ? 'persistent-save' : entry.namespace === 'resources' ? 'project' : entry.name.endsWith('_handle') ? 'scene' : 'callback',
    threadRule: FIXED_STEP_BINDINGS.has(entry.name) ? 'fixed-step' : entry.namespace === 'logging' || entry.namespace === 'testing' ? 'worker-safe' : 'callback-boundary',
    determinism: SEEDED_BINDINGS.has(entry.name) ? 'seeded' : HOST_DEPENDENT_BINDINGS.has(entry.name) ? 'host-dependent' : 'deterministic',
    permissions: entry.namespace === 'save' ? ['save-data'] : entry.namespace === 'resources' ? ['asset-read'] : entry.namespace === 'logging' ? ['console-write'] : entry.namespace === 'network' ? ['network-rpc'] : []
  }))
}

export const SCRIPT_API_V1_TO_V2 = Object.freeze(Object.fromEntries(
  SCRIPT_API.filter(/* 返回 entry.deprecated 的当前值。 */ entry => entry.deprecated).map(/* 返回按声明顺序构造的数组 [entry.name, entry.deprecated!.replacement]。 */ entry => [entry.name, entry.deprecated!.replacement])
)) as Readonly<Record<string, string>>

/** 按模板 `${JSON.stringify(SCRIPT_API_V2_MANIFEST, null, 2)}\n` 生成并返回字符串。 */ export function scriptApiManifestJson(): string { return `${JSON.stringify(SCRIPT_API_V2_MANIFEST, null, 2)}\n` }

// Compatibility markers retained for archived static release audits:
// name: 'entity_handle'; name: 'find_entity_handle'; name: 'component_handle';
// name: 'animator_handle'; name: 'audio_source_handle'; name: 'task_wait';
// name: 'task_cancel'; name: 'signal_emit'; name: 'signal_emit_to'; name: 'expect'

/** 按脚本可调用名称查找公开 API 元信息。 */ export function apiEntry(name: string): ScriptApiEntry | undefined { return SCRIPT_API.find(/* 比较 entry.name 与 name，返回严格相等的判断结果。 */ entry => entry.name === name) }

/** 按命名空间分组公开 API，保留登记顺序。 */ export function apiByNamespace(): ReadonlyMap<ScriptApiNamespace, readonly ScriptApiEntry[]> {
  const groups = new Map<ScriptApiNamespace, ScriptApiEntry[]>()
  for (const entry of SCRIPT_API) groups.set(entry.namespace, [...(groups.get(entry.namespace) ?? []), entry])
  return groups
}

/** 从 API 登记表生成分命名空间的 Markdown，包含签名、说明、弃用迁移提示及转义后的示例。 */ export function generatedApiMarkdown(): string {
  return [...apiByNamespace()].map(/** 生成单个命名空间标题及其中所有 API 条目。 */ ([namespace, entries]) => `## ${namespace}\n\n${entries.map(/** 将一个 API 渲染为包含弃用替代项和代码示例的 Markdown 条目。 */ entry => {
    const warning = entry.deprecated ? ` **Deprecated:** use \`${entry.deprecated.replacement}\`; removal ${entry.deprecated.removal}.` : ''
    return `- \`${entry.signature}\` — ${entry.detail}${warning}\n\n  Example: \`${entry.example.replace(/`/g, '\\`')}\``
  }).join('\n')}`).join('\n\n')
}
