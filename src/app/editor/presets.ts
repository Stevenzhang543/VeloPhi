/**
 * Ready-made parts of the palette (26.59 fix 3, D194): arc tracks (quarter arc, semicircular groove, vertical loop,
 * hump and dip bridges, a movable groove, since 26.60 r2 a slide with an arc and a flat part), a hoop, a long board, a
 * cart, steps and a pendulum — each placed with one click so that it rests on the surface under the pointer — and the
 * material presets of the inspector.
 */
import type { BodyDef, Material, RopeDef, Scene, ShapePart, SpringDef } from '../../core/scene/types'
import { addBody, addConnector } from '../../core/scene/build'
import { arcCentroid, arcDeg } from '../../core/scene/arc'
import { compoundMass } from '../../engine/calc'
import type { Tool } from '../store'
import { tl } from '../../i18n'

type Pt = { x: number; y: number }
/** The surface under the click (foot point and angle), or null. */
export type Snap = { foot: Pt; n: Pt; angle: number } | null

/** Tools that place a preset part. */
export const PRESET_TOOLS = ['add-arc-quarter', 'add-arc-half', 'add-arc-loop', 'add-arc-hump', 'add-arc-dip', 'add-arc-groove', 'add-arc-slide', 'add-hoop', 'add-board', 'add-cart', 'add-steps', 'add-pendulum', 'add-launcher'] as const
export type PresetTool = typeof PRESET_TOOLS[number]
export const isPresetTool = (t: Tool | string): t is PresetTool => (PRESET_TOOLS as readonly string[]).includes(t)

/** Smooth track material (the textbook's 光滑): no friction, no bounce. */
const SMOOTH: Material = { muS: 0, muK: 0, restitution: 0 }
const TRACK: Material = { muS: 0, muK: 0, restitution: 0 }

/** A free name "base1", "base2" … */
function nameFor(scene: Scene, base: string): string {
  const used = new Set(scene.bodies.map(b => b.name))
  let k = 1
  while (used.has(`${base}${k}`)) k++
  return `${base}${k}`
}

/** A static arc whose circle's centre is at `c`. */
function staticArc(scene: Scene, name: string, c: Pt, radius: number, thickness: number, startDeg: number, sweepDeg: number): BodyDef {
  return addBody(scene, { name, kind: 'static', role: 'ground', shape: arcDeg(radius, thickness, startDeg, sweepDeg), position: { ...c }, material: TRACK, color: '#64748b' })
}

/**
 * Place a preset part at `p` (`snap`: the surface under it). The click point is where the part's lowest inner
 * surface (tracks) or its bottom (bodies) goes. Returns the id of the main new body.
 */
export function placePreset(scene: Scene, tool: PresetTool, p: Pt, snap: Snap): string | null {
  const base = snap ? snap.foot : p
  switch (tool) {
    case 'add-arc-quarter': {
      // Quarter arc from the left rim down to the bottom, tangent to the floor at the click point
      const R = 1
      return staticArc(scene, nameFor(scene, tl('四分之一圆弧轨道')), { x: base.x, y: base.y + R }, R, 0.1, 180, 90).id
    }
    case 'add-arc-half': {
      const R = 1
      return staticArc(scene, nameFor(scene, tl('半圆槽')), { x: base.x, y: base.y + R }, R, 0.1, 180, 180).id
    }
    case 'add-arc-loop': {
      // A full ring: a ball inside it can run round the vertical loop
      const R = 1
      return staticArc(scene, nameFor(scene, tl('竖直圆轨道')), { x: base.x, y: base.y + R }, R, 0.1, 0, 360).id
    }
    case 'add-arc-hump': {
      // Arched bridge: outer radius 2 m over 120°, its ends at the click height
      const Ro = 2, t = 0.1
      return staticArc(scene, nameFor(scene, tl('拱形桥')), { x: base.x, y: base.y - Ro * Math.sin(Math.PI / 6) }, Ro - t, t, 30, 120).id
    }
    case 'add-arc-dip': {
      // Dipped bridge: inner radius 2 m over 120°, its lowest point at the click point
      const R = 2
      return staticArc(scene, nameFor(scene, tl('凹形桥')), { x: base.x, y: base.y + R }, R, 0.1, 210, 120).id
    }
    case 'add-arc-groove': {
      // Movable smooth semicircular groove (mass 2 kg) standing on the surface; it slides but does not tip over
      const R = 0.5, t = 0.1
      const shape = arcDeg(R, t, 180, 180)
      const { c } = arcCentroid(shape)
      // Body origin = centre of mass; the circle's centre lies −c from it; the lowest outer point rests on the surface
      const centre = { x: base.x, y: base.y + R + t }
      return addBody(scene, {
        name: nameFor(scene, tl('圆弧槽')), role: 'block', shape: { ...shape, center: { x: -c.x, y: -c.y } },
        position: { x: centre.x + c.x, y: centre.y + c.y }, mass: 2, fixedRotation: true, material: SMOOTH, color: '#0ea5e9'
      }).id
    }
    case 'add-arc-slide': {
      // 26.60 r2 (D207): a smooth slide (3 kg) standing on the surface — a quarter arc (inner radius 0.5 m) whose lower
      // end is tangent to a flat part 0.6 m long; one rigid body that slides but does not tip over
      const R = 0.5, t = 0.1, L = 0.6
      const centre = { x: base.x, y: base.y + R + t }
      const parts: ShapePart[] = [
        { shape: arcDeg(R, t, 180, 90), position: { x: 0, y: 0 }, angle: 0 },
        { shape: { type: 'box', width: L, height: t }, position: { x: L / 2, y: -R - t / 2 }, angle: 0 }
      ]
      // Parts about the centre of mass (computed by the core), the body origin there
      const { centroid: g } = compoundMass({ type: 'compound', parts }, 1)
      const shifted = parts.map(q => ({ ...q, position: { x: q.position.x - g.x, y: q.position.y - g.y } }))
      return addBody(scene, {
        name: nameFor(scene, tl('圆弧滑块')), role: 'block', shape: { type: 'compound', parts: shifted },
        position: { x: centre.x + g.x, y: centre.y + g.y }, mass: 3, fixedRotation: true, material: SMOOTH, color: '#0ea5e9'
      }).id
    }
    case 'add-hoop': {
      // Thin hoop (I ≈ mr²) that rolls
      const Ri = 0.18, t = 0.02
      return addBody(scene, {
        name: nameFor(scene, tl('圆环')), role: 'wheel', shape: arcDeg(Ri, t, 0, 360), position: { x: base.x, y: base.y + Ri + t },
        mass: 1, material: { muS: 0.5, muK: 0.4, restitution: 0 }, color: '#f59e0b'
      }).id
    }
    case 'add-board': {
      // Long board for board–block problems
      const w = 1.6, h = 0.06
      return addBody(scene, { name: nameFor(scene, tl('长木板')), role: 'block', shape: { type: 'box', width: w, height: h }, position: { x: base.x, y: base.y + h / 2 }, mass: 2, material: { muS: 0.3, muK: 0.2, restitution: 0 }, color: '#b45309' }).id
    }
    case 'add-cart': {
      // Cart: a body with two wheels as one rigid compound (it glides: no friction under the wheels)
      const w = 0.5, h = 0.14, r = 0.06
      const parts = [
        { shape: { type: 'box' as const, width: w, height: h }, position: { x: 0, y: r + h / 2 }, angle: 0 },
        { shape: { type: 'circle' as const, radius: r }, position: { x: -w / 2 + r + 0.02, y: r }, angle: 0 },
        { shape: { type: 'circle' as const, radius: r }, position: { x: w / 2 - r - 0.02, y: r }, angle: 0 }
      ]
      // The compound is placed about its centre of mass (computed by the core); its bottom at the surface
      const area = w * h + 2 * Math.PI * r * r
      const cy = (w * h * (r + h / 2) + 2 * Math.PI * r * r * r) / area
      const shifted = parts.map(q => ({ ...q, position: { x: q.position.x, y: q.position.y - cy } }))
      return addBody(scene, { name: nameFor(scene, tl('小车')), role: 'block', shape: { type: 'compound', parts: shifted }, position: { x: base.x, y: base.y + cy }, mass: 1, material: SMOOTH, color: '#2563eb' }).id
    }
    case 'add-steps': {
      // Three steps 0.3 m high and 0.4 m deep, rising to the right from the click point
      const hs = 0.3, d = 0.4, n = 3
      const pts: Pt[] = [{ x: 0, y: 0 }, { x: n * d, y: 0 }]
      for (let k = n; k >= 1; k--) { pts.push({ x: k * d, y: k * hs }); pts.push({ x: (k - 1) * d, y: k * hs }) }
      return addBody(scene, { name: nameFor(scene, tl('台阶')), kind: 'static', role: 'ground', shape: { type: 'polygon', points: pts }, position: { x: base.x, y: base.y }, material: { muS: 0.5, muK: 0.4, restitution: 0.3 }, color: '#94a3b8' }).id
    }
    case 'add-pendulum': {
      // Simple pendulum: a 0.2 kg bob on a 1 m string from the click point, released at 30°
      const L = 1, th = Math.PI / 6
      const bob = addBody(scene, { name: nameFor(scene, tl('摆球')), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.05 }, position: { x: p.x + L * Math.sin(th), y: p.y - L * Math.cos(th) }, mass: 0.2, material: { muS: 0, muK: 0, restitution: 0 }, color: '#e11d48' })
      addConnector<RopeDef>(scene, { type: 'rope', name: tl('摆线'), a: { body: null, local: { x: p.x, y: p.y } }, b: { body: bob.id, local: { x: 0, y: 0 } }, pulleys: [], length: null })
      return bob.id
    }
    case 'add-launcher': {
      // 26.60 r2 (D208): a wall, a spring that is not fastened to the block (k = 200 N/m, rest length 0.4 m) and a block
      // (1 kg) pressing it 0.1 m, on the surface under the click; all smooth — released, the block leaves the spring
      const h = 0.2, wallH = 0.5, wallW = 0.1, L0 = 0.4, x = 0.1
      addBody(scene, { name: nameFor(scene, tl('墙')), kind: 'static', role: 'wall', shape: { type: 'box', width: wallW, height: wallH }, position: { x: base.x - wallW / 2, y: base.y + wallH / 2 }, material: SMOOTH, color: '#64748b' })
      const block = addBody(scene, { name: nameFor(scene, tl('物块')), role: 'block', shape: { type: 'box', width: h, height: h }, position: { x: base.x + L0 - x + h / 2, y: base.y + h / 2 }, mass: 1, fixedRotation: true, material: SMOOTH, color: '#3b82f6' })
      addConnector<SpringDef>(scene, { type: 'spring', name: tl('弹簧'), a: { body: null, local: { x: base.x, y: base.y + h / 2 } }, b: { body: block.id, local: { x: -h / 2, y: 0 } }, stiffness: 200, restLength: L0, damping: 0, pushOnly: true })
      return block.id
    }
  }
  return null
}

/** Material presets of the inspector (typical textbook values; the pair uses the smaller coefficients). */
export const MATERIALS: Array<{ id: string; label: string; m: Material }> = [
  { id: 'smooth', label: '光滑（无摩擦）', m: { muS: 0, muK: 0, restitution: 0 } },
  { id: 'elastic', label: '光滑完全弹性', m: { muS: 0, muK: 0, restitution: 1 } },
  { id: 'wood', label: '木头', m: { muS: 0.5, muK: 0.3, restitution: 0.4 } },
  { id: 'steel', label: '钢', m: { muS: 0.74, muK: 0.57, restitution: 0.6 } },
  { id: 'rubber', label: '橡胶', m: { muS: 1, muK: 0.8, restitution: 0.8 } },
  { id: 'ice', label: '冰', m: { muS: 0.1, muK: 0.03, restitution: 0.1 } },
  { id: 'glass', label: '玻璃', m: { muS: 0.9, muK: 0.4, restitution: 0.7 } },
  { id: 'teflon', label: '聚四氟乙烯', m: { muS: 0.04, muK: 0.04, restitution: 0.3 } },
  { id: 'concrete', label: '水泥地面', m: { muS: 0.8, muK: 0.6, restitution: 0.3 } },
  { id: 'clay', label: '橡皮泥（完全非弹性）', m: { muS: 0.6, muK: 0.5, restitution: 0 } },
  { id: 'superball', label: '弹力球', m: { muS: 0.6, muK: 0.5, restitution: 0.95 } }
]

/** The preset a material matches, if any. */
export function materialPreset(m: Material): string {
  const hit = MATERIALS.find(x => x.m.muS === m.muS && x.m.muK === m.muK && x.m.restitution === m.restitution)
  return hit ? hit.id : ''
}
