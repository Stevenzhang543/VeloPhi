/** 组件面板数据：维护组件分类、收藏、最近使用项及用户保存的组件预设。 */
import { reactive } from 'vue'
import type { ComponentKind } from '../world/components'
import { componentDescriptor } from '../world/componentRegistry'

export type ComponentPaletteCategory = 'Rhythm' | 'Core' | '2D' | 'Physics' | 'Gameplay' | 'UI' | 'Audio' | 'Camera' | 'Navigation' | 'Script' | 'Packages' | 'World'
export interface ComponentPaletteMetadata { category: ComponentPaletteCategory; compatibility: 'Stable' | 'Experimental' | 'Package' | 'Deprecated'; required: ComponentKind[]; summary: string }

/** 26.47 (rhythm engine): the Add Component list shows these groups first; the classic groups follow under
 * "More", and deprecated components (planned for removal) only when searched for or with "Show all". */
export const RHYTHM_FIRST_CATEGORIES: readonly ComponentPaletteCategory[] = ['Rhythm', 'Core', '2D', 'Audio', 'UI', 'Camera', 'Script']
export const CLASSIC_CATEGORIES: readonly ComponentPaletteCategory[] = ['Gameplay', 'Physics', 'World', 'Packages', 'Navigation']
/** Planned for removal in the rhythm-engine roadmap (26.48: world streaming; 26.49: navigation and behaviour trees). */
export const DEPRECATED_COMPONENTS: ReadonlySet<ComponentKind> = new Set<ComponentKind>(['WorldChunk2D', 'Portal2D', 'NavigationRegion2D', 'NavigationObstacle2D', 'NavigationAgent2D', 'BehaviorTree2D'])
const rhythm = new Set<ComponentKind>(['RhythmChart2D'])
const world = new Set<ComponentKind>(['TileMap2D', 'WorldChunk2D', 'Portal2D'])
export interface ComponentPreset { id: string; name: string; kind: ComponentKind; values: Record<string, unknown>; createdAt: string }

const physics = new Set<ComponentKind>(['RigidBody2D', 'BoxCollider2D', 'EllipseCollider2D', 'PolygonCollider2D', 'FixedJoint2D', 'WeldJoint2D', 'DistanceJoint2D', 'RopeJoint2D', 'RevoluteJoint2D', 'MotorJoint2D', 'PrismaticJoint2D', 'SpringJoint2D', 'WheelJoint2D', 'TargetJoint2D', 'Rope2D', 'Area2D'])
const ui = new Set<ComponentKind>(['Canvas', 'RectTransform', 'Panel', 'Image', 'Text', 'Button', 'Slider', 'ProgressBar', 'Checkbox', 'TextInput'])
const audio = new Set<ComponentKind>(['AudioSource', 'AudioListener'])
const navigation = new Set<ComponentKind>(['NavigationRegion2D', 'NavigationObstacle2D', 'NavigationAgent2D'])
const packages = new Set<ComponentKind>(['BehaviorTree2D', 'StateMachine2D'])
const gameplay = new Set<ComponentKind>(['CharacterBody2D', 'GridMover2D', 'PlatformController2D', 'TopDownController2D', 'Health2D', 'DamageHitbox2D', 'Collectible2D', 'Projectile2D', 'Spawner2D', 'Cooldown2D', 'Lifetime2D', 'MouseFollower2D', 'CameraFollow2D', 'ObjectPool2D'])

/** 按组件种类生成分类、兼容标记、依赖及注册摘要，供组件选择器显示。 */ export function componentPaletteMetadata(kind: ComponentKind): ComponentPaletteMetadata {
  const category: ComponentPaletteCategory = kind === 'Transform2D' ? 'Core' : kind === 'Camera2D' ? 'Camera' : kind === 'Script2D' ? 'Script' : rhythm.has(kind) ? 'Rhythm' : physics.has(kind) ? 'Physics' : gameplay.has(kind) ? 'Gameplay' : ui.has(kind) ? 'UI' : audio.has(kind) ? 'Audio' : navigation.has(kind) ? 'Navigation' : packages.has(kind) ? 'Packages' : world.has(kind) ? 'World' : '2D'
  const required: ComponentKind[] = kind.endsWith('Joint2D') || kind === 'CharacterBody2D' ? ['RigidBody2D'] : kind === 'AreaEffector2D' ? ['Area2D'] : kind !== 'RectTransform' && ui.has(kind) && kind !== 'Canvas' ? ['RectTransform'] : []
  return { category, compatibility: DEPRECATED_COMPONENTS.has(kind) ? 'Deprecated' : packages.has(kind) ? 'Package' : 'Stable', required, summary: componentDescriptor(kind)?.summary ?? `${kind} component.` }
}

const STORAGE_KEY = 'nova-a-component-palette-v1'
/** 读取组件收藏、最近使用及预设，筛除结构错误并限制数量，存储异常时返回空偏好。 */ function load() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { favorites?: unknown; recent?: unknown; presets?: unknown }
    const clean = /** 保留输入数组中的字符串并限制为二十项，非数组返回空列表。 */ (source: unknown) => Array.isArray(source) ? source.filter(/* 比较 typeof item 与 'string'，返回严格相等的判断结果。 */ (item): item is ComponentKind => typeof item === 'string').slice(0, 20) : []
    const presets = Array.isArray(value.presets) ? value.presets.flatMap(/** 校验单个预设结构，复制值对象并规范化名称和创建时间，非法记录不保留。 */ (raw): ComponentPreset[] => {
      if (!raw || typeof raw !== 'object') return []
      const preset = raw as Partial<ComponentPreset>
      if (typeof preset.id !== 'string' || typeof preset.name !== 'string' || typeof preset.kind !== 'string' || !preset.values || typeof preset.values !== 'object') return []
      return [{ id: preset.id, name: preset.name.slice(0, 80), kind: preset.kind as ComponentKind, values: JSON.parse(JSON.stringify(preset.values)) as Record<string, unknown>, createdAt: typeof preset.createdAt === 'string' ? preset.createdAt : new Date(0).toISOString() }]
    }).slice(0, 64) : []
    return { favorites: clean(value.favorites), recent: clean(value.recent), presets }
  } catch { return { favorites: [] as ComponentKind[], recent: [] as ComponentKind[], presets: [] as ComponentPreset[] } }
}
export const componentPaletteState = reactive(load())
/** 保存组件面板偏好，存储失败时保留当前内存状态。 */ function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(componentPaletteState)) } catch { /* optional user preference */ } }
/** 切换组件收藏状态，新收藏置顶并限制最多二十项，然后持久化。 */ export function toggleComponentFavorite(kind: ComponentKind) { const index = componentPaletteState.favorites.indexOf(kind); if (index >= 0) componentPaletteState.favorites.splice(index, 1); else componentPaletteState.favorites.unshift(kind); componentPaletteState.favorites.splice(20); persist() }
/** 将组件移至最近使用列表首位，去除旧位置并限制十二项后保存。 */ export function markComponentRecent(kind: ComponentKind) { const index = componentPaletteState.recent.indexOf(kind); if (index >= 0) componentPaletteState.recent.splice(index, 1); componentPaletteState.recent.unshift(kind); componentPaletteState.recent.splice(12); persist() }
/** 深复制组件值创建具唯一标识和时间的预设，限制名称与预设数量并持久化。 */ export function saveComponentPreset(kind: ComponentKind, name: string, values: Record<string, unknown>): ComponentPreset {
  const preset: ComponentPreset = { id: crypto.randomUUID(), name: name.trim().slice(0, 80) || `${kind} preset`, kind, values: JSON.parse(JSON.stringify(values)) as Record<string, unknown>, createdAt: new Date().toISOString() }
  componentPaletteState.presets.unshift(preset); componentPaletteState.presets.splice(64); persist(); return preset
}
/** 返回与指定组件种类匹配的已保存预设。 */ export function componentPresets(kind: ComponentKind): ComponentPreset[] { return componentPaletteState.presets.filter(/* 比较 preset.kind 与 kind，返回严格相等的判断结果。 */ preset => preset.kind === kind) }
/** 按标识删除存在的预设并保存，未找到时返回 false。 */ export function removeComponentPreset(id: string): boolean { const index = componentPaletteState.presets.findIndex(/* 比较 preset.id 与 id，返回严格相等的判断结果。 */ preset => preset.id === id); if (index < 0) return false; componentPaletteState.presets.splice(index, 1); persist(); return true }
