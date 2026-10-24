/** 组件登记表：描述组件类别与能力，并按组件种类查询定义。 */
import type { ComponentKind } from './components'

export const STABLE_COMPONENT_API_VERSION = '2.0'

export interface ComponentDescriptor {
  kind: ComponentKind
  category: 'Core' | 'Rendering' | 'Physics' | 'Gameplay' | 'Audio' | 'UI' | 'World'
  unique: boolean
  summary: string
}

export const STABLE_COMPONENTS: readonly ComponentDescriptor[] = [
  { kind: 'Transform2D', category: 'Core', unique: true, summary: 'Local position, rotation, scale, and hierarchy parent.' },
  { kind: 'Camera2D', category: 'Rendering', unique: true, summary: 'Orthographic game camera and viewport.' },
  { kind: 'SpriteRenderer2D', category: 'Rendering', unique: true, summary: 'Draws an imported sprite asset.' },
  { kind: 'ShapeRenderer2D', category: 'Rendering', unique: true, summary: 'Draws rectangles, ellipses, and polygons.' },
  { kind: 'TextRenderer2D', category: 'Rendering', unique: true, summary: 'Draws world-space text.' },
  { kind: 'RigidBody2D', category: 'Physics', unique: true, summary: 'Dynamic, kinematic, or static body state.' },
  { kind: 'BoxCollider2D', category: 'Physics', unique: true, summary: 'Rectangular collision geometry.' },
  { kind: 'EllipseCollider2D', category: 'Physics', unique: true, summary: 'Elliptical collision geometry.' },
  { kind: 'PolygonCollider2D', category: 'Physics', unique: true, summary: 'Convex polygon collision geometry.' },
  { kind: 'FixedJoint2D', category: 'Physics', unique: false, summary: 'Locks two bodies together.' },
  { kind: 'WeldJoint2D', category: 'Physics', unique: false, summary: 'Preserves the relative position and angle of two bodies.' },
  { kind: 'DistanceJoint2D', category: 'Physics', unique: false, summary: 'Maintains a configured distance.' },
  { kind: 'RopeJoint2D', category: 'Physics', unique: false, summary: 'Limits the maximum separation between two bodies.' },
  { kind: 'RevoluteJoint2D', category: 'Physics', unique: false, summary: 'Allows rotation around an anchor.' },
  { kind: 'MotorJoint2D', category: 'Physics', unique: false, summary: 'Drives relative rotation using the joint motor settings.' },
  { kind: 'PrismaticJoint2D', category: 'Physics', unique: false, summary: 'Allows motion along one axis.' },
  { kind: 'SpringJoint2D', category: 'Physics', unique: false, summary: 'Applies damped spring forces.' },
  { kind: 'WheelJoint2D', category: 'Physics', unique: false, summary: 'On a wheel, connected to the chassis: a suspension spring along an axis and a drive motor.' },
  { kind: 'TargetJoint2D', category: 'Physics', unique: true, summary: 'Pulls the body toward a world point with a soft spring (drag, carry, hold).' },
  { kind: 'Rope2D', category: 'Physics', unique: false, summary: 'Segmented stretchable, bendable, breakable connection.' },
  { kind: 'Script2D', category: 'Gameplay', unique: true, summary: 'Runs sandboxed Rhai or visual-graph lifecycle logic.' },
  { kind: 'Animator', category: 'Gameplay', unique: true, summary: 'Animation state machine and parameters.' },
  { kind: 'Skeleton2D', category: 'Gameplay', unique: true, summary: '2D bone rig, skin, pose, IK, and constraint playback.' },
  { kind: 'TimelinePlayer', category: 'Gameplay', unique: true, summary: 'Nested animation, audio, camera blends, subtitles, events, branching, skip, and resume.' },
  { kind: 'AudioSource', category: 'Audio', unique: true, summary: 'Plays a clip through an audio bus.' },
  { kind: 'RhythmChart2D', category: 'Audio', unique: true, summary: 'Plays a rhythm chart in sync with its song: lanes or moving judgement lines, timed judgement, combo and score.' },
  { kind: 'AudioListener', category: 'Audio', unique: true, summary: 'Receives spatial game audio.' },
  { kind: 'ParticleEmitter2D', category: 'Rendering', unique: true, summary: 'Emits lifetime-controlled 2D particles.' },
  { kind: 'Light2D', category: 'Rendering', unique: true, summary: 'Point, spot, directional, or area lighting with masks and shadows.' },
  { kind: 'ShadowCaster2D', category: 'Rendering', unique: true, summary: 'Makes entity geometry occlude compatible 2D lights.' },
  { kind: 'Canvas', category: 'UI', unique: true, summary: 'Root screen-space UI surface.' },
  { kind: 'RectTransform', category: 'UI', unique: true, summary: 'Anchored screen-space layout rectangle.' },
  { kind: 'Panel', category: 'UI', unique: true, summary: 'Colored UI container.' },
  { kind: 'Image', category: 'UI', unique: true, summary: 'Screen-space image.' },
  { kind: 'Text', category: 'UI', unique: true, summary: 'Screen-space label.' },
  { kind: 'Button', category: 'UI', unique: true, summary: 'Clickable UI control.' },
  { kind: 'Slider', category: 'UI', unique: true, summary: 'Interactive bounded numeric control.' },
  { kind: 'ProgressBar', category: 'UI', unique: true, summary: 'Read-only normalized progress display.' },
  { kind: 'Checkbox', category: 'UI', unique: true, summary: 'Boolean UI control.' },
  { kind: 'TextInput', category: 'UI', unique: true, summary: 'Native text-entry control with IME support.' },
  { kind: 'TileMap2D', category: 'World', unique: true, summary: 'Chunked tile layers with collision, navigation, and occluder baking.' },
  { kind: 'CharacterBody2D', category: 'Gameplay', unique: true, summary: 'Exact-unit slope, step, platform, and coyote-time character motion.' },
  { kind: 'Area2D', category: 'Physics', unique: true, summary: 'Bounded overlap region for gameplay effectors and signals.' },
  { kind: 'AreaEffector2D', category: 'Gameplay', unique: true, summary: 'Gravity, wind, drag, buoyancy, damage, and signal effects.' },
  { kind: 'NavigationRegion2D', category: 'World', unique: true, summary: 'Polygon/grid navigation with hierarchy, links, cost areas, and cancellable baking.' },
  { kind: 'NavigationObstacle2D', category: 'World', unique: true, summary: 'Static or dynamic navigation and avoidance obstacle.' },
  { kind: 'NavigationAgent2D', category: 'Gameplay', unique: true, summary: 'Bounded A*, hierarchical/flow-field, smoothing, and spatial-avoidance path follower.' },
  { kind: 'BehaviorTree2D', category: 'Gameplay', unique: true, summary: 'Behavior trees with blackboards, perception, utility scoring, and visual diagnostics.' },
  { kind: 'StateMachine2D', category: 'Gameplay', unique: true, summary: 'Optional hierarchical gameplay state-machine runner.' },
  { kind: 'GridMover2D', category: 'Gameplay', unique: true, summary: 'Moves an entity by exact grid cells from a named Vector2 action.' },
  { kind: 'PlatformController2D', category: 'Gameplay', unique: true, summary: 'Deterministic side-view acceleration, jump, air-control, and fall limits.' },
  { kind: 'TopDownController2D', category: 'Gameplay', unique: true, summary: 'Accelerated top-down movement driven by a named Vector2 action.' },
  { kind: 'Health2D', category: 'Gameplay', unique: true, summary: 'Bounded health, invulnerability, damage, death, and lifecycle signals.' },
  { kind: 'DamageHitbox2D', category: 'Gameplay', unique: true, summary: 'Contact damage, target filtering, knockback, and hit cooldown.' },
  { kind: 'Collectible2D', category: 'Gameplay', unique: true, summary: 'Collector-tag filtering, score reward, signal, and safe despawn.' },
  { kind: 'Projectile2D', category: 'Gameplay', unique: true, summary: 'Direction, speed, owner filtering, damage, impact, and lifetime behavior.' },
  { kind: 'Spawner2D', category: 'Gameplay', unique: true, summary: 'Bounded interval/burst prefab spawning with pooling support.' },
  { kind: 'Cooldown2D', category: 'Gameplay', unique: true, summary: 'Reusable deterministic cooldown state and ready signal.' },
  { kind: 'Lifetime2D', category: 'Gameplay', unique: true, summary: 'Returns an object to its pool or destroys it after a bounded lifetime.' },
  { kind: 'MouseFollower2D', category: 'Gameplay', unique: true, summary: 'Moves a kinematic body toward the active Game-view pointer in exact world units.' },
  { kind: 'CameraFollow2D', category: 'Gameplay', unique: true, summary: 'Target/tag camera following with offset, dead zone, and smoothing.' },
  { kind: 'WorldChunk2D', category: 'World', unique: true, summary: 'Dependency-aware world cells with state handoff, preload/cache policy, origin shift, and memory budgets.' },
  { kind: 'Portal2D', category: 'World', unique: true, summary: 'Scene portal with preload and destination metadata.' },
  { kind: 'ObjectPool2D', category: 'Gameplay', unique: true, summary: 'Bounded prefab pool with spawn and despawn lifecycle events.' }
] as const

export const STABLE_COMPONENT_KINDS = STABLE_COMPONENTS.map(/* 返回 component.kind 的当前值。 */ component => component.kind) as readonly ComponentKind[]

/** 按组件种类返回稳定登记描述；未登记的种类保持 undefined。 */ export function componentDescriptor(kind: ComponentKind): ComponentDescriptor | undefined {
  return STABLE_COMPONENTS.find(/* 比较 component.kind 与 kind，返回严格相等的判断结果。 */ component => component.kind === kind)
}
