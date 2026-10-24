# Nova Rhai API v2

Nova_A 4.6 introduces API v2 while retaining API v1 through a per-script compatibility adapter. New scripts use v2; imported v1 assets keep their selected version until migrated.

## Contract

- The manifest is versioned and records module, callable, signature, result convention, lifetime, thread rule, determinism, permissions, deprecation, documentation, and an executable example.
- Handles are typed, versioned copied values. Validate them at callback boundaries; invalid handles are explicit values rather than host exceptions.
- Host mutations are queued and applied at safe engine boundaries. Runtime failures become bounded diagnostics.
- Filesystem, network, process, DOM, unrestricted eval, and unrestricted editor-time execution are absent from the stable sandbox.
- API v1 is selectable per asset. Deprecated calls produce migration diagnostics and remain available through 4.x; removal is scheduled no earlier than API v3.

## Thread, lifetime, and determinism

Fixed-step mutations run only from fixed-step ownership. Callback values expire at the callback boundary; scene handles must be revalidated after structural changes. Seeded random APIs reproduce with the captured seed. Pointer and device values are host-dependent inputs and are recorded for replay.

## Error and result conventions

Queries return values or explicit invalid handles/results. Queued commands never expose raw host exceptions. Compile, semantic, permission, runtime, and compatibility diagnostics use stable NOVA-* codes.

## Hot reload

The complete module graph is analyzed and compiled before apply. Export layout changes are classified as compatible, recreate-instances, restart-required, or rejected. Swaps occur transactionally at a frame boundary, retain a rollback source, and never silently replace a valid program with an incompatible candidate.

## Tests and coverage

Use `// @test tags=unit timeout=1000 seed=42 cases=a|b` before `fn test_*`. The headless runner supports filters, tags, deterministic seeds, cancellation, explicit infrastructure-only retries, sharding, JSON, JUnit XML, LCOV/JSON coverage, and stable exit codes.

## lifecycle

- `fn awake()` — Runs once when this instance enters play.

  Example: `fn awake() { log_info("ready"); }`
- `fn start()` — Runs after every active instance has awakened.

  Example: `fn start() { signal_emit("ready", entity()); }`
- `fn fixed_update(dt)` — Runs once per fixed physics tick.

  Example: `fn fixed_update(dt) { apply_force(2.0 * dt, 0.0); }`
- `fn update(dt)` — Runs once per rendered gameplay frame.

  Example: `fn update(dt) { ui_set_value(time_elapsed()); }`
- `fn late_update(dt)` — Runs after update in the same frame.

  Example: `fn late_update(dt) { log_debug(\`frame ${time_frame()}\`); }`
- `fn on_destroy()` — Runs before the owning entity is removed.

  Example: `fn on_destroy() { task_cancel("load"); }`
- `fn on_timer(name)` — Receives an expired named timer.

  Example: `fn on_timer(name) { signal_emit(name, true); }`

## tasks

- `fn on_task(name)` — Receives completion of a deferred task.

  Example: `fn on_task(name) { log_info(name); }`
- `timer_start(name, seconds, repeat)` — Starts a validated entity-owned timer.

  Example: `timer_start("pulse", 0.5, true);`
- `timer_pause(name)` — Pauses a timer.

  Example: `timer_pause("pulse");`
- `timer_resume(name)` — Resumes a timer.

  Example: `timer_resume("pulse");`
- `timer_cancel(name)` — Cancels a timer.

  Example: `timer_cancel("pulse");`
- `task_wait(name, seconds)` — Schedules a cancellable deferred task.

  Example: `task_wait("load", 0.25);`
- `task_cancel(name)` — Cancels an entity-owned task.

  Example: `task_cancel("load");`
- `after(seconds, function, args)` — Calls one of this script's functions after a game-time delay.

  Example: `after(0.5, "explode");`

## signals

- `fn on_signal(name, payload, source)` — Receives a queued signal at a safe boundary.

  Example: `fn on_signal(name, payload, source) { log_debug(name); }`
- `signal_emit(name, payload)` — Queues a serializable broadcast signal.

  Example: `signal_emit("player.ready", #{ lives: 3 });`
- `signal_emit_to(entity_id, name, payload)` — Queues a serializable targeted signal.

  Example: `signal_emit_to(entity(), "heal", 10);`
- `call_on(entity, function, args)` — Calls a function of another object's script after this callback phase; args is an optional array.

  Example: `call_on(other, "take_damage", [10]);`
- `call_global(name, function, args)` — Calls a function of a project global script (Project Settings › Scripting › Global scripts).

  Example: `call_global("Game", "add_coins", [1]);`
- `call_group(group, function, args)` — Calls a function on every object in a group.

  Example: `call_group("enemies", "alert", [position_x()]);`

## physics

- `fn on_collision_enter(other, px, py, nx, ny, rvx, rvy)` — Receives the first solid contact tick.

  Example: `fn on_collision_enter(other, px, py, nx, ny, rvx, rvy) { log_info(other); }`
- `fn on_collision_stay(other, px, py, nx, ny, rvx, rvy)` — Receives each continuing solid contact tick.

  Example: `fn on_collision_stay(other, px, py, nx, ny, rvx, rvy) { }`
- `fn on_collision_exit(other, px, py, nx, ny, rvx, rvy)` — Receives the end of a solid contact.

  Example: `fn on_collision_exit(other, px, py, nx, ny, rvx, rvy) { }`
- `fn on_trigger_enter(other, px, py, nx, ny, rvx, rvy)` — Receives the first sensor overlap tick.

  Example: `fn on_trigger_enter(other, px, py, nx, ny, rvx, rvy) { signal_emit("entered", other); }`
- `fn on_trigger_stay(other, px, py, nx, ny, rvx, rvy)` — Receives each continuing sensor overlap tick.

  Example: `fn on_trigger_stay(other, px, py, nx, ny, rvx, rvy) { }`
- `fn on_trigger_exit(other, px, py, nx, ny, rvx, rvy)` — Receives the end of a sensor overlap.

  Example: `fn on_trigger_exit(other, px, py, nx, ny, rvx, rvy) { }`
- `rigid_body() -> RigidBodySnapshot` — Reads body velocity, angular velocity, mass and type.

  Example: `let body = rigid_body();`
- `apply_force(x, y)` — Applies force in newtons during a fixed step.

  Example: `apply_force(12.0, 0.0);`
- `apply_impulse(x, y)` — Applies instantaneous impulse in N·s.

  Example: `apply_impulse(0.0, 8.0);`
- `set_velocity(x, y)` — Sets linear velocity in world units per second.

  Example: `set_velocity(3.0, rigid_body().velocity_y);`
- `set_angular_velocity(radians_per_second)` — Sets angular velocity.

  Example: `set_angular_velocity(0.5);`
- `character_is_on_floor() -> bool` — Reads authoritative floor state.

  Example: `if character_is_on_floor() { }`
- `character_is_on_wall() -> bool` — Reads authoritative wall state.

  Example: `if character_is_on_wall() { }`
- `character_is_on_ceiling() -> bool` — Reads authoritative ceiling state.

  Example: `if character_is_on_ceiling() { }`
- `can_coyote_jump() -> bool` — Reports floor contact or an active coyote window.

  Example: `if can_coyote_jump() { }`
- `character_can_coyote_jump() -> bool` — Legacy coyote-window name. **Deprecated:** use `can_coyote_jump`; removal API v3.

  Example: `if character_can_coyote_jump() { }`
- `character_floor_normal() -> Vec2` — Returns the current floor normal.

  Example: `let normal = character_floor_normal();`
- `character_platform_velocity() -> Vec2` — Returns supporting-platform velocity.

  Example: `let platform = character_platform_velocity();`
- `move_character(x, y)` — Queues CharacterBody2D displacement for the next fixed step.

  Example: `move_character(2.0 * dt, 0.0);`
- `character_floor_is_one_way() -> bool` — True when the character stands on a one-way platform.

  Example: `if character_floor_is_one_way() && input_pressed("Down") { character_drop_through(); }`
- `target_joint_move(x, y)` — Pulls this body toward a world point with its Target Joint (one is added when missing): drag, carry or hold it.

  Example: `target_joint_move(mouse_world_x(), mouse_world_y());`
- `target_joint_release()` — Lets go of the body: its Target Joint stops pulling.

  Example: `target_joint_release();`
- `set_surface_speed(speed)` — Makes this body a conveyor: its faces carry what rests on them at `speed` m/s (clockwise around the body for positive speeds).

  Example: `set_surface_speed(2.5);`
- `character_drop_through([seconds])` — Lets the character fall through one-way platforms (0.25 s by default; it keeps passing while it still overlaps one).

  Example: `character_drop_through();`
- `joint_servo(target)` — Drives the revolute (degrees) or prismatic (units) joint on this object to a target with its motor; measured like the joint limits (the connected body relative to this one).

  Example: `joint_servo(45.0);`
- `joint_servo_off()` — Stops the servo and switches its motor off; the joint moves freely again.

  Example: `joint_servo_off();`
- `explode(x, y, radius, impulse)` — Pushes every dynamic body near a point away from it, fading to nothing at the radius.

  Example: `explode(position_x(), position_y(), 4.0, 30.0);`

## object

- `entity_handle() -> Handle<Entity>` — Returns this entity as a stable versioned handle.

  Example: `let self = entity_handle();`
- `find_entity_handle(name) -> Handle<Entity>` — Finds an entity or returns an invalid handle with an error.

  Example: `let enemy = find_entity_handle("Enemy");`
- `entity() -> string` — Returns the current entity UUID.

  Example: `let id = entity();`
- `entity_name() -> string` — Returns the current entity display name.

  Example: `log_info(entity_name());`
- `find_entity(name) -> string` — Compatibility UUID lookup. **Deprecated:** use `find_entity_handle`; removal API v3.

  Example: `let id = find_entity("Camera");`
- `query_tag(tag, limit) -> Array<Handle<Entity>>` — Returns at most 256 stable entity handles with a tag.

  Example: `let enemies = query_tag("enemy", 32);`
- `query_group(group, limit) -> Array<Handle<Entity>>` — Returns at most 256 stable entity handles in a group.

  Example: `let actors = query_group("actors", 64);`
- `query_component(kind, limit) -> Array<Handle<Entity>>` — Returns at most 256 entity handles owning a component kind.

  Example: `let cameras = query_component("Camera2D", 8);`
- `query_radius(x, y, radius, limit) -> Array<Handle<Entity>>` — Returns bounded handles inside a finite world-space radius.

  Example: `let nearby = query_radius(0.0, 0.0, 8.0, 32);`
- `entity_name_on(handle) -> string` — Reads the query-snapshot name for an entity handle.

  Example: `let name = entity_name_on(handle);`
- `entity_enabled_on(handle) -> bool` — Reads the query-snapshot enabled state for an entity handle.

  Example: `if entity_enabled_on(handle) { }`
- `entity_position_x_on(handle) -> float` — Reads query-snapshot world X for an entity handle.

  Example: `let x = entity_position_x_on(handle);`
- `entity_position_y_on(handle) -> float` — Reads query-snapshot world Y for an entity handle.

  Example: `let y = entity_position_y_on(handle);`
- `entity_set_position(handle, x, y)` — Queues a finite world position for a validated entity handle.

  Example: `entity_set_position(target, 4.0, 2.0);`
- `entity_set_rotation(handle, radians)` — Queues a world rotation for a validated entity handle.

  Example: `entity_set_rotation(target, 1.57);`
- `entity_set_scale(handle, x, y)` — Queues a non-zero world scale for a validated entity handle.

  Example: `entity_set_scale(target, 2.0, 2.0);`
- `entity_set_enabled(handle, enabled)` — Enables or disables a validated entity.

  Example: `entity_set_enabled(target, false);`
- `entity_add_tag(handle, tag)` — Adds one bounded tag to a validated entity.

  Example: `entity_add_tag(target, "enemy");`
- `entity_remove_tag(handle, tag)` — Removes one tag from a validated entity.

  Example: `entity_remove_tag(target, "enemy");`
- `entity_add_group(handle, group)` — Adds a validated entity to a bounded group.

  Example: `entity_add_group(target, "actors");`
- `entity_remove_group(handle, group)` — Removes a validated entity from a group.

  Example: `entity_remove_group(target, "actors");`
- `entity_destroy(handle)` — Safely destroys the validated target at the structural boundary.

  Example: `entity_destroy(target);`
- `entity_handle_of(id) -> Handle<Entity>` — Returns a handle for an entity id (for example other in a collision) at its current generation.

  Example: `entity_destroy(entity_handle_of(other));`
- `entity_has_tag(entity, tag) -> bool` — True when the entity (id or handle, e.g. other in a collision) has the tag.

  Example: `if entity_has_tag(other, "coin") { score_add(1.0); }`
- `entity_in_group(entity, group) -> bool` — True when the entity (id or handle) is in the group.

  Example: `if entity_in_group(other, "enemies") { }`

## component

- `component_handle(kind) -> Handle<Component>` — Returns a stable component handle or explicit invalid handle.

  Example: `let body = component_handle("RigidBody2D");`
- `has_component(kind) -> bool` — Reports whether this entity owns an enabled component.

  Example: `if has_component("Animator") { animator_play("Idle"); }`
- `get_component(kind) -> string` — Legacy component URI lookup. **Deprecated:** use `component_handle`; removal API v3.

  Example: `let body = get_component("RigidBody2D");`
- `component_set_enabled_on(handle, component, enabled)` — Enables or disables an existing target component.

  Example: `component_set_enabled_on(target, "DamageHitbox2D", false);`

## transform

- `transform() -> TransformSnapshot` — Reads one coherent world-transform snapshot.

  Example: `let pose = transform();`
- `set_position(x, y)` — Queues an exact finite world position.

  Example: `set_position(4.0, 2.0);`
- `set_rotation(radians)` — Queues world rotation in radians.

  Example: `set_rotation(1.57079632679);`
- `set_scale(x, y)` — Queues world scale.

  Example: `set_scale(2.0, 2.0);`

## input

- `input_down(action) -> bool` — True while an action is held.

  Example: `if input_down("Move") { }`
- `input_pressed(action) -> bool` — True on an action press edge.

  Example: `if input_pressed("Jump") { apply_impulse(0.0, 8.0); }`
- `input_released(action) -> bool` — True on an action release edge.

  Example: `if input_released("Fire") { }`
- `input_performed(action) -> bool` — True when Press, Hold, Tap, or Multi-tap reaches Performed.

  Example: `if input_performed("Confirm") { }`
- `input_cancelled(action) -> bool` — True when an interaction is released before completion.

  Example: `if input_cancelled("Charge") { }`
- `input_phase(action) -> string` — Returns idle, started, performed, or cancelled.

  Example: `let phase = input_phase("Charge");`
- `input_duration(action) -> float` — Returns the current held duration in seconds.

  Example: `let held = input_duration("Charge");`
- `input_context_active(name) -> bool` — Reports whether an input context is active.

  Example: `if input_context_active("Menu") { }`
- `input_map_active(name) -> bool` — Reports whether an action map is active.

  Example: `if input_map_active("Combat") { }`
- `input_scheme() -> string` — Returns the active control scheme.

  Example: `let scheme = input_scheme();`
- `input_context_push(name, priority, consume)` — Pushes or updates a bounded input context.

  Example: `input_context_push("Menu", 100, true);`
- `input_context_pop(name)` — Removes an active non-root input context.

  Example: `input_context_pop("Menu");`
- `input_map_enable(name)` — Enables a bounded named action map.

  Example: `input_map_enable("Combat");`
- `input_map_disable(name)` — Disables a named non-default action map.

  Example: `input_map_disable("Combat");`
- `input_scheme_set(name)` — Selects a named input scheme.

  Example: `input_scheme_set("Gamepad");`
- `input_prompt(action) -> string` — The key, button or symbol of an action on the device in use ("Space", "A", "✕", "LMB"), for prompts in your own text.

  Example: `ui_set_text(\`Press ${input_prompt("Jump")} to jump\`);`
- `input_rebind(action[, index])` — Waits for the next key, mouse button or gamepad button and binds it to the action (binding `index`, default 0). Escape cancels. Sends the `input.rebound` or `input.rebind_cancelled` signal; the Player keeps the player's bindings.

  Example: `input_rebind("Jump");`
- `input_bindings_reset()` — Puts the project's key bindings back and forgets the player's own.

  Example: `input_bindings_reset();`
- `input_axis(action) -> float` — Reads a scalar action.

  Example: `let x = input_axis("Horizontal");`
- `input_vector(action) -> Vec2` — Reads a Vector2 action.

  Example: `let move = input_vector("Move");`
- `input_vector_x(action) -> float` — Reads a Vector2 x component.

  Example: `let x = input_vector_x("Move");`
- `input_vector_y(action) -> float` — Reads a Vector2 y component.

  Example: `let y = input_vector_y("Move");`
- `mouse_x() -> float` — Reads pointer x in the viewport.

  Example: `let x = mouse_x();`
- `mouse_y() -> float` — Reads pointer y in the viewport.

  Example: `let y = mouse_y();`
- `mouse_world_x() -> float` — Reads pointer x in game-camera world units.

  Example: `set_position(mouse_world_x(), mouse_world_y());`
- `mouse_world_y() -> float` — Reads pointer y in game-camera world units.

  Example: `set_position(mouse_world_x(), mouse_world_y());`
- `view_min_x() -> float` — Reads the active game camera left world bound.

  Example: `if transform().position_x < view_min_x() { destroy(); }`
- `view_max_x() -> float` — Reads the active game camera right world bound.

  Example: `if transform().position_x > view_max_x() { destroy(); }`
- `view_min_y() -> float` — Reads the active game camera bottom world bound.

  Example: `if transform().position_y < view_min_y() { destroy(); }`
- `view_max_y() -> float` — Reads the active game camera top world bound.

  Example: `if transform().position_y > view_max_y() { destroy(); }`
- `viewport_width() -> float` — Reads the current game viewport width in CSS pixels.

  Example: `let aspect = viewport_width() / viewport_height();`
- `viewport_height() -> float` — Reads the current game viewport height in CSS pixels.

  Example: `let aspect = viewport_width() / viewport_height();`
- `wheel_x() -> float` — Reads horizontal wheel delta.

  Example: `let dx = wheel_x();`
- `wheel_y() -> float` — Reads vertical wheel delta.

  Example: `let dy = wheel_y();`
- `is_down(action) -> bool` — Legacy held-action alias. **Deprecated:** use `input_down`; removal API v3.

  Example: `if is_down("Move") { }`
- `was_pressed(action) -> bool` — Legacy press-edge alias. **Deprecated:** use `input_pressed`; removal API v3.

  Example: `if was_pressed("Jump") { }`
- `was_released(action) -> bool` — Legacy release-edge alias. **Deprecated:** use `input_released`; removal API v3.

  Example: `if was_released("Fire") { }`
- `axis(action) -> float` — Legacy scalar-action alias. **Deprecated:** use `input_axis`; removal API v3.

  Example: `let x = axis("Horizontal");`
- `vector(action) -> Vec2` — Legacy Vector2-action alias. **Deprecated:** use `input_vector`; removal API v3.

  Example: `let move = vector("Move");`

## gameplay

- `camera_shake(amount)` — Shakes the active camera: adds `amount` (0–1) of trauma; the view moves and turns by trauma² and calms down on its own (Camera2D shake settings). Reduced motion keeps a quarter.

  Example: `camera_shake(0.5);`
- `camera_zoom(zoom)` — Sets the zoom of the active camera (1 is the authored size).

  Example: `camera_zoom(1.5);`
- `camera_follow(handle)` — The active camera follows an object; camera_follow_none() stops following.

  Example: `camera_follow(find_entity_handle("Player"));`
- `camera_follow_none()` — The active camera stops following.

  Example: `camera_follow_none();`
- `screen_flash(r, g, b, seconds)` — Flashes the screen in a colour that fades out over `seconds` (not shown with reduced motion).

  Example: `screen_flash(255.0, 255.0, 255.0, 0.2);`
- `game_pause(paused)` — Pauses or resumes scaled gameplay while input/update callbacks remain available.

  Example: `game_pause(true);`
- `game_paused() -> bool` — Reports the current gameplay pause state.

  Example: `if game_paused() { }`
- `checkpoint_set(name)` — Captures bounded scene transforms, health, score, and session state.

  Example: `checkpoint_set("room-2");`
- `checkpoint_has(name) -> bool` — Reports whether a runtime checkpoint exists.

  Example: `if checkpoint_has("room-2") { }`
- `checkpoint_restore(name)` — Restores a same-scene checkpoint or fails explicitly.

  Example: `checkpoint_restore("room-2");`
- `score_get() -> float` — Returns the bounded session score.

  Example: `let score = score_get();`
- `score_set(value)` — Sets the bounded session score.

  Example: `score_set(0.0);`
- `score_add(value)` — Adds to the bounded session score.

  Example: `score_add(10.0);`
- `session_get(key, fallback) -> value` — Reads a bounded serializable session value.

  Example: `let wave = session_get("wave", 1);`
- `session_set(key, value)` — Writes a bounded serializable session value.

  Example: `session_set("wave", 2);`
- `post_set(name, value, seconds)` — Sets a post-processing value (exposure, contrast, saturation, vignette, bloom, blur) for this play session; seconds tweens to it. Post-processing must be enabled.

  Example: `post_set("vignette", 0.6, 0.5);`
- `post_pulse(name, amount, seconds)` — Adds a post-processing amount that fades out over seconds (beat flashes, hits).

  Example: `post_pulse("bloom", 0.6, 0.25);`
- `post_reset()` — Returns post-processing to the project settings.

  Example: `post_reset();`

## ui

- `ui_set_text(text)` — Sets Text or TextRenderer2D content on this entity.

  Example: `ui_set_text(\`Score: ${save_get("score", 0)}\`);`
- `ui_set_value(value)` — Sets Slider, ProgressBar or Checkbox value.

  Example: `ui_set_value(0.75);`
- `ui_set_text_on(handle, text)` — Sets text on a validated target UI/world-text entity.

  Example: `ui_set_text_on(label, "Ready");`
- `ui_set_value_on(handle, value)` — Sets a validated target Slider, ProgressBar, or Checkbox.

  Example: `ui_set_value_on(health_bar, 0.75);`

## animation

- `animator_handle() -> Handle<Animator>` — Returns this Animator as a stable handle.

  Example: `let animator = animator_handle();`
- `animator() -> string` — Legacy Animator URI lookup. **Deprecated:** use `animator_handle`; removal API v3.

  Example: `let animator = animator();`
- `animator_set_bool(name, value)` — Sets a Boolean Animator parameter.

  Example: `animator_set_bool("moving", true);`
- `animator_set_float(name, value)` — Sets a float Animator parameter.

  Example: `animator_set_float("speed", 3.0);`
- `animator_set_integer(name, value)` — Sets an integer Animator parameter.

  Example: `animator_set_integer("weapon", 2);`
- `animator_trigger(name)` — Raises an Animator trigger.

  Example: `animator_trigger("jump");`
- `animator_play(state)` — Requests an Animator state (id or name), switching at once.

  Example: `animator_play("Run");`
- `animator_crossfade(state, seconds)` — Blends from the current Animator state to another (id or name) over the given seconds.

  Example: `animator_crossfade("Jump", 0.15);`
- `animator_state() -> string` — Name of the current Animator state (base layer); "" without an Animator.

  Example: `if animator_state() == "Run" { }`
- `animator_state_time() -> float` — Normalised time of the current state: 0 at its start, 1 at the end of the clip (keeps counting while it loops).

  Example: `if animator_state_time() >= 1.0 { }`
- `animator_in_transition() -> bool` — True while the Animator blends between two states.

  Example: `if !animator_in_transition() { }`
- `tween(property, to, seconds[, easing[, options]])` — Animates x, y, rotation, rotation_degrees, scale_x, scale_y, scale or opacity of this object to a value. Easings: linear and quad, cubic, quart, quint, sine, expo, circ, back, elastic, bounce with _in, _out or _in_out. Options #{ delay, loops (-1 forever), yoyo, relative, signal }. Emits "tween.finished".

  Example: `tween("y", 2.0, 0.5, "back_out", #{ relative: true });`
- `entity_tween(entity, property, to, seconds, easing)` — Animates a property of another object (a handle).

  Example: `entity_tween(find_entity_handle("Door"), "y", 3.0, 1.0, "sine_in_out");`
- `tween_stop([property])` — Stops this object's tweens (of one property, or all).

  Example: `tween_stop("x");`
- `entity_tween_stop(entity)` — Stops all tweens of another object (a handle).

  Example: `entity_tween_stop(find_entity_handle("Door"));`

## audio

- `audio_source_handle() -> Handle<AudioSource>` — Returns this AudioSource as a stable handle.

  Example: `let source = audio_source_handle();`
- `audio_source() -> string` — Legacy AudioSource URI lookup. **Deprecated:** use `audio_source_handle`; removal API v3.

  Example: `let source = audio_source();`
- `audio_play()` — Plays this entity AudioSource.

  Example: `audio_play();`
- `audio_pause()` — Pauses this entity AudioSource.

  Example: `audio_pause();`
- `audio_stop()` — Stops this entity AudioSource.

  Example: `audio_stop();`
- `play_sound(asset, options)` — Plays a sound once (or looped) on a mixer bus; options #{ bus, volume, pitch, looped, tag }.

  Example: `play_sound("Assets/Audio/coin.wav", #{ volume: 0.8, pitch: 1.2 });`
- `stop_sounds(tag, fade)` — Stops script sounds with a tag ("" stops all), optionally fading out.

  Example: `stop_sounds("ambience", 1.0);`
- `play_music(asset, fade, volume)` — Plays looping music on the Music bus; a new track crossfades.

  Example: `play_music("Assets/Audio/theme.ogg", 1.5);`
- `stop_music(fade)` — Fades out and stops the music.

  Example: `stop_music(2.0);`
- `set_bus_volume(bus, volume)` — Sets a mixer bus volume for this play session (1.0 = authored level).

  Example: `set_bus_volume("Music", 0.5);`
- `play_video(asset, options)` — Plays a full-screen video over the game view; emits "video.finished". Options #{ skippable, volume, looped }.

  Example: `play_video("Assets/Video/intro.webm");`
- `stop_video()` — Stops the playing video (emits "video.finished" with reason "stopped").

  Example: `stop_video();`

## navigation

- `navigation_set_target(x, y)` — Sets this NavigationAgent2D world target.

  Example: `navigation_set_target(10.0, 4.0);`

## scene

- `instantiate(prefab)` — Queues a prefab instance.

  Example: `instantiate("asset://enemy-prefab");`
- `spawn_at(prefab, x, y, rotation, scale_x, scale_y) -> Handle<Entity>` — Queues a prefab at an exact transform and returns a stable pending handle.

  Example: `let enemy = spawn_at("asset://enemy", 4.0, 2.0, 0.0, 1.0, 1.0);`
- `destroy()` — Queues safe entity destruction.

  Example: `destroy();`
- `despawn()` — Returns a pooled object or safely destroys it.

  Example: `despawn();`
- `scene_load(scene)` — Queues a scene switch.

  Example: `scene_load("Level 2");`
- `scene_reload()` — Queues active-scene reload.

  Example: `scene_reload();`
- `scene_quit()` — Requests clean runtime shutdown.

  Example: `scene_quit();`

## network

- `network_enabled() -> bool` — Reports whether reviewed project networking and explicit permission are enabled.

  Example: `if network_enabled() { }`
- `network_connected() -> bool` — Reports whether the optional runtime has an active session transport.

  Example: `if network_connected() { network_rpc("ready", true); }`
- `network_is_authority() -> bool` — Reports whether this peer owns server or host authority.

  Example: `if network_is_authority() { }`
- `network_peer_count() -> int` — Returns the bounded number of known remote peers.

  Example: `let peers = network_peer_count();`
- `network_local_peer() -> string` — Returns the current bounded local peer identifier.

  Example: `let peer = network_local_peer();`
- `network_role() -> string` — Returns client, server, or host.

  Example: `if network_role() == "client" { }`
- `network_tick() -> int` — Returns the authoritative network tick observed at this callback boundary.

  Example: `let tick = network_tick();`
- `network_rpc(name, payload)` — Queues a declared RPC through explicit permission, authority, direction, schema, rate, payload, and bandwidth checks.

  Example: `network_rpc("player.ready", #{ ready: true });`

## timing

- `time() -> TimeSnapshot` — Returns delta, fixed delta, elapsed, scale and frame.

  Example: `let now = time();`
- `time_delta() -> float` — Returns render delta seconds.

  Example: `let dt = time_delta();`
- `time_fixed_delta() -> float` — Returns fixed-step seconds.

  Example: `let dt = time_fixed_delta();`
- `time_elapsed() -> float` — Returns scaled elapsed seconds.

  Example: `let elapsed = time_elapsed();`
- `time_scale() -> float` — Returns active time scale.

  Example: `let scale = time_scale();`
- `time_frame() -> int` — Returns deterministic frame number.

  Example: `let frame = time_frame();`
- `random() -> float` — Returns a deterministic seeded value in [0, 1).

  Example: `let roll = random();`
- `random_range(minimum, maximum) -> float` — Returns a deterministic value in a finite range.

  Example: `let x = random_range(-2.0, 2.0);`

## rhythm

- `rhythm_play(start_seconds)` — Starts this object's RhythmChart2D (else the first chart in the scene); start_seconds is optional chart time.

  Example: `rhythm_play();`
- `rhythm_pause()` — Pauses the chart and its music.

  Example: `rhythm_pause();`
- `rhythm_resume()` — Resumes a paused chart one second early so the player finds the beat again.

  Example: `rhythm_resume();`
- `rhythm_stop()` — Stops the chart and its music.

  Example: `rhythm_stop();`
- `rhythm_restart()` — Plays the chart again from the start (new score).

  Example: `rhythm_restart();`
- `rhythm_seek(seconds)` — Jumps to a chart time; earlier notes are skipped, not missed (practice).

  Example: `rhythm_seek(30.0);`
- `rhythm_set_offset(milliseconds)` — Sets the chart's audio offset (positive: notes later).

  Example: `rhythm_set_offset(15.0);`
- `rhythm_set_autoplay(enabled)` — Turns autoplay (perfect bot play with scheduled hit sounds) on or off.

  Example: `rhythm_set_autoplay(true);`
- `rhythm_set_speed(speed)` — Sets the note scroll speed (chart units per second at speed 1).

  Example: `rhythm_set_speed(10.0);`
- `rhythm_set_calibration(milliseconds)` — Stores this device's audio calibration (positive: the music is heard later); applies from the next play.

  Example: `rhythm_set_calibration(-24.0);`
- `rhythm_calibration() -> float` — The stored device calibration in milliseconds.

  Example: `let offset = rhythm_calibration();`
- `rhythm_time() -> float` — Chart time in seconds (negative during the lead-in), on the audio clock.

  Example: `let t = rhythm_time();`
- `rhythm_beat() -> float` — The current beat (fractional) through the chart's tempo map.

  Example: `if rhythm_beat() >= 16.0 { }`
- `rhythm_bpm() -> float` — Tempo at the current chart time.

  Example: `let bpm = rhythm_bpm();`
- `rhythm_score() -> int` — Score out of 1,000,000 (900,000 accuracy + 100,000 max combo).

  Example: `ui_set_text(\`${rhythm_score()}\`);`
- `rhythm_combo() -> int` — The current combo.

  Example: `if rhythm_combo() >= 100 { }`
- `rhythm_max_combo() -> int` — The longest combo so far.

  Example: `let best = rhythm_max_combo();`
- `rhythm_accuracy() -> float` — Accuracy 0..1 over the judged notes (perfect 1, great 0.8, good 0.5).

  Example: `let percent = rhythm_accuracy() * 100.0;`
- `rhythm_progress() -> float` — Progress 0..1 through the chart.

  Example: `let p = rhythm_progress();`
- `rhythm_state() -> string` — idle, loading, ready, countdown, playing, paused, finished or error.

  Example: `if rhythm_state() == "finished" { }`
- `rhythm_judgement() -> string` — The latest judgement: perfect, great, good, bad or miss.

  Example: `let last = rhythm_judgement();`
- `rhythm_playing() -> bool` — True while the chart runs (lead-in included).

  Example: `if rhythm_playing() { }`
- `rhythm_finished() -> bool` — True once every note is judged and the chart ended.

  Example: `if rhythm_finished() { }`
- `rhythm_full_combo() -> bool` — True when a finished chart had no bad or miss.

  Example: `if rhythm_full_combo() { }`
- `rhythm_count(name) -> int` — Count of perfect, great, good, bad, miss, early, late, judged or total notes.

  Example: `let misses = rhythm_count("miss");`
- `rhythm_judge(note, judgement_or_offset_ms)` — Judges a note (custom note types, from rhythm.touch): "perfect" … "miss", or an offset in milliseconds that the note type's windows classify. Ignored when the note is already judged.

  Example: `rhythm_judge(payload.note, "miss");`
- `rhythm_my_note() -> map` — On an object that shows a note (a note type with a prefab): id, type, beat, time, lane, line, x and data of that note; () elsewhere.

  Example: `let note = rhythm_my_note();`
- `rhythm_visual_offset() -> float` — The device picture offset in milliseconds (notes are drawn this much earlier; judgement unchanged).

  Example: `let picture = rhythm_visual_offset();`
- `rhythm_set_visual_offset(milliseconds)` — Stores this device's picture offset (−500 … 500 ms); applies at once.

  Example: `rhythm_set_visual_offset(20.0);`
- `rhythm_stats() -> map` — Every statistic in one map (score, counts, accuracy, mean_offset_ms, full_combo …).

  Example: `let stats = rhythm_stats();`

## save

- `save_has(key) -> bool` — Reports whether a save key exists.

  Example: `if save_has("checkpoint") { }`
- `save_get(key, fallback) -> value` — Reads a safe persistent value.

  Example: `let score = save_get("score", 0);`
- `save_set(key, value)` — Queues a serializable persistent value.

  Example: `save_set("score", 10);`
- `save_delete(key)` — Deletes a persistent key.

  Example: `save_delete("checkpoint");`
- `save_clear()` — Clears in-memory save state.

  Example: `save_clear();`
- `save_load(slot)` — Queues a named slot load.

  Example: `save_load("slot1");`
- `save_commit(slot)` — Atomically commits a named slot.

  Example: `save_commit("slot1");`

## logging

- `log_debug(message)` — Writes a bounded Debug console event.

  Example: `log_debug("tick");`
- `log_info(message)` — Writes a bounded Info console event.

  Example: `log_info("ready");`
- `log_warning(message)` — Writes a bounded Warning console event.

  Example: `log_warning("low health");`
- `log_error(message)` — Writes a bounded Error event without crashing.

  Example: `log_error("missing target");`

## resources

- `resource_handle(reference, type) -> Handle<Resource>` — Validates an asset URI and returns a stable typed handle.

  Example: `let texture = resource_handle("asset://texture", "Texture2D");`
- `api_version() -> int` — Returns the API version selected for this script asset.

  Example: `expect(api_version() >= 1, "supported API");`
- `api_current_version() -> int` — Returns the newest API implemented by this engine.

  Example: `expect(api_current_version() == 2, "API v2 engine");`
- `api_minimum_version() -> int` — Returns the oldest API version supported by the compatibility adapter.

  Example: `expect(api_minimum_version() == 1, "API v1 adapter");`
- `api_namespace(symbol) -> string` — Returns the documentation namespace of a flat symbol.

  Example: `let group = api_namespace("scene_load");`

## testing

- `expect(condition, message) -> bool` — Records a test assertion without corrupting another instance.

  Example: `expect(2 + 2 == 4, "math");`
