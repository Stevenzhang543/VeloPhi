# Nova_A production 2D physics

The current v4.5 contract, profiles, structured query APIs, Rope2D behavior, and numerical qualification are documented in PHYSICS_2D_4_5.md. This file retains the original stable 3.4 contract for compatibility context.

Nova_A uses a retained Rust `f64` physics world at a fixed project tick rate. Rendering may interpolate between completed physics states; interpolation never changes the authoritative simulation. One world unit is one metre by default.

## Units

| Quantity | Unit |
| --- | --- |
| distance, collider size, offset | metre (`m`) |
| time and fixed step | second (`s`) |
| linear velocity | `m/s` |
| linear acceleration and gravity | `m/s²` |
| mass | kilogram (`kg`) |
| 2D density | `kg/m²` |
| force | newton (`N`) |
| impulse | `N·s` |
| torque | `N·m` |
| angular velocity / motor speed | `rad/s` |

Non-finite values are rejected or normalized at the project boundary. Mass, density, inertia, dimensions, fixed rate, and safe margins must be positive. Restitution is clamped to 0–1; friction is non-negative and may be greater than one.

## Bodies and transform ownership

- **Static** bodies never integrate motion and are intended for level geometry.
- **Kinematic / Animation-owned** bodies accept authored transforms or velocity and transfer motion to dynamic bodies without receiving force response.
- **CharacterBody2D** uses `Physics2D.moveAndSlide` and reports floor, wall, ceiling, normals, inherited platform velocity, slope, step, snap, and safe-margin results.
- **Dynamic / Physics-owned** rigid bodies own `Transform2D` while Play is active. Apply force or impulse for continuous motion. Use `Physics2D.teleport(entity, position, angle)` for discontinuous placement; teleport wakes the body.
- **Area2D / sensor** bodies generate enter, stay, and exit events without contact impulses.

Direct script position and rotation writes on physics-owned bodies are routed through teleport. Animation-owned bodies remain kinematic, so animation and physics never write the same dynamic transform.

## Shapes

Box, circle/non-uniform ellipse, convex three/four-point polygon, capsule, and finite segment participate in simulation. Capsules use a deterministic 12-point convex approximation. A segment has explicit thickness so it can form stable manifolds. Chain and concave polygon data can be authored and queried, but the dynamic solver deliberately excludes them until deterministic decomposition is part of the stable ABI; the Inspector displays this status instead of silently substituting a different shape.

Collider offset and rotation are shape-local. The component identity is stable across save/load. A body can compose additional collider components through entity composition; each simulated stable collider has an independent shape-local transform.

## Materials

`.nova-material` assets store density, static and dynamic friction, restitution, restitution threshold, and pair-combine modes. Pair mode priority is **Maximum > Multiply > Minimum > Average**. Average computes `(a+b)/2`, Minimum/Maximum choose the bound, and Multiply computes `a*b`. The chosen friction result limits tangent impulse; restitution is applied only when approach speed exceeds the larger restitution threshold.

## Layers and one-way collision

Projects contain 32 stable collision bits plus user-facing unique names, descriptions, and colors. Renaming a layer never changes its bit. The compact pair editor modifies both sides of a pair; Advanced exposes the complete matrix. An object's local mask is intersected with the project matrix. Disabled bodies and query-only shapes do not enter the simulation or event stream.

One-way colliders use a normalized local normal. Contacts approaching the pass-through side are discarded; contacts from the blocking side are solved normally.

## Queries and events

`Physics2D` exposes `raycast`, `raycastAll`, `shapeCast`, `overlapPoint`, `overlapCircle`, `overlapBox`, `contacts`, `teleport`, `moveAndSlide`, and `characterState`. Query masks use physics layers. Results are sorted by distance and stable handle, then duplicate entity hits are collapsed.

Collision and trigger events provide enter/start, stay, and exit/end phases. Events are sorted by the stable body-handle pair and phase before they reach scripts or telemetry. Sensors map to `on_trigger_enter`, `on_trigger_stay`, and `on_trigger_exit`; solid contacts map to the collision lifecycle and retain contact data.

## Joints, ropes, and strings

Distance, revolute, prismatic, weld, spring, rope, and motor joints are authorable in the component Inspector. Limits, motor speed/torque, break force/torque, anchors, tension, strain, and break state are visible in diagnostics. Physical connection strings exclude their two owner bodies from node collision, collide with other same-layer bodies, transmit forces through anchors, and preserve both simulated fragments after a break.

### Servos and explosions (26.46)

A Revolute or Prismatic joint with **Servo** on drives its motor towards a target before every fixed step: motor speed = servo gain × error (rad/s per radian, or units/s per unit), clamped to the servo's maximum speed; the joint's maximum motor force or torque still limits how hard it pushes. The error is measured exactly like the joint limits — the connected (target) body relative to the body that holds the joint, revolute angles wrapped to (−180°, 180°] so the servo turns the short way, prismatic distances between the two anchors along the axis (which turns with the owner). Put the joint on the base (pivot, rail) and connect the moving part for the usual sense. Scripts: `joint_servo(target)` (degrees or units) and `joint_servo_off()` (servo and motor off). A servo without a connected body does nothing, because the solver builds no joint.

`explode(x, y, radius, impulse)` adds an impulse away from the point to every enabled dynamic body whose nearest edge (ellipse radius, or half the collider's diagonal) lies within the radius, scaled linearly from full strength at the point to zero at the radius; static, kinematic and massless bodies and the calling object are skipped.

## Quality, debugging, and performance

Discrete collision is the default. Continuous mode uses adaptive substeps for fast/small bodies and costs more CPU; enable it only where tunnelling risk requires it. Sleeping bodies wake on forces, impulses, transforms, and teleports. Project Settings > Physics shows the fixed step, catch-up cap, interpolation, units, layer pairs, material assets, support matrix, and conformance cases.

Debug can draw colliders, AABBs, contacts, normals, sleeping state, joints, rope nodes, character classification, and named-layer colors. Profiler records physics time, runtime bodies, contacts, sleeping bodies, CCD bodies, constraints, fixed steps, dropped time, and configuration rebuilds. Replay captures fixed input and compares state checksums for same-build determinism.

## Validation and known boundaries

The shipped conformance and reference suite covers static/kinematic/dynamic/sensor bodies, supported shapes, query types, one-way platforms, collision and trigger lifecycle, slopes/steps/snap/moving platforms/ceilings, joints, CCD, sleep/wake, scale, layer migration, and deterministic event ordering. The exact support and outstanding qualification boundaries are recorded in `release-audits/v3.5.0-known-issues.json`; no S0 or S1 issue may remain open for release.
