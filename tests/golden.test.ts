/**
 * Golden recordings: the 26.48 templates (and a few hand-built scenes) must keep their exact recording
 * fingerprints. New solver features (expression forces, movable pulleys, friction in impacts, worker
 * transport, performance work) must not change any scene that does not use them — in particular every
 * impact between frictionless surfaces (μ = 0) is computed bit-identically to 26.48.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import { simulate } from '../src/core/solver/simulation'
import { addBody, addConnector, addGround, anchor, emptyScene } from '../src/core/scene/build'
import type { Scene, SpringDef } from '../src/core/scene/types'

/** SHA-256 of the recordings produced by Verity 26.48 (templates at their default parameters). */
const TEMPLATE_HASHES: Record<string, string> = {
  incline: 'b1aa4574b18a84008550c157cf87f39b3ab8ec94ce10a47057487dbbedbe1ee0',
  'board-block': 'bb1283491e1cb3e5cbd463c2d839f0cdee83def25231b27c43a11edd10c9d2d5',
  conveyor: '43f23fd1ce579a149cb7990e3debd424c88fe656d8f845cea96dc3d5bf2fc244',
  'conveyor-incline': '12605018319f2f72e5478520370e895d1d3121bd6381f3ff0bf98e51ab54bb0d',
  'collision-1d': '92d856ad1175ec741615d8f852ad0f8a1ad08eae9b2f3561106260710411533c',
  'collision-2d': '1b6a817dcf68c6f9900acba7a62aae61b73fd1e36012e336d44b8a4f99792a72',
  projectile: '2a5d8318cf57377d772530c7e76a0e80c5661469449c35c363b5b936435e38a5',
  pendulum: '179d76df2dc854e6afa2f88590a0b24b7f0d5d6961e0de9b6a8b12763522c161',
  spring: 'fa440b6de37d737eda12ffbbd9c85c30076960a65dd24c004b53a7c084bc65f4',
  'hinged-rod': '62d49e470f4c2fd2a316a8639174f52ab17bdb8b43f8ef8e869290787fcab6cc',
  rolling: '66dbf7b0345065a9cc180602be4f0f44dcfaa5ddd6362e367ba2f1929c2e2da3',
  'ball-rod': '99b59dab2e58994d0ad3f47aa79bfe0790139107c3f69c2da9d376340882c2a0',
  atwood: 'c80279a5336ec92e6a32e3bd3f7728fc1361958998c8b8716ac9d19e28d98dd2',
  'table-pulley': 'e241acf043adb1844e5b0742910dda2fb571b4e8d8a82148b6225556bd06cb9a'
}

/**
 * Hand-built 26.48 scenes: a resting stack, a bouncing ball (μ = 0), a block falling off a table edge, two
 * blocks on a spring.
 */
function handBuilt(): Record<string, { scene: Scene; hash: string }> {
  const out: Record<string, { scene: Scene; hash: string }> = {}
  {
    const s = emptyScene('stack')
    s.settings.gravity = { x: 0, y: -9.8 }
    addGround(s, { top: 0, material: { muS: 0.5, muK: 0.4 } })
    for (let i = 0; i < 4; i++) addBody(s, { name: `b${i}`, shape: { type: 'box', width: 0.4, height: 0.2 }, position: { x: 0, y: 0.1 + 0.2 * i }, mass: 1, material: { muS: 0.5, muK: 0.4 } })
    s.settings.duration = 2
    out.stack = { scene: s, hash: 'a6166126217a71a732c4ced8af1e3b7d58ba283e00a60eb0570ebf1f382d9152' }
  }
  {
    const s = emptyScene('bounce')
    s.settings.gravity = { x: 0, y: -9.8 }
    addGround(s, { top: 0, material: { restitution: 1 } })
    addBody(s, { name: 'ball', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: 0, y: 1 }, mass: 0.2, material: { restitution: 0.8 } })
    s.settings.duration = 12
    out.bounce = { scene: s, hash: '37a3457ffc375e0e6b9ccce5b661cb50353a3a9083f86b760b94a72502a5a8ee' }
  }
  {
    const s = emptyScene('edge')
    s.settings.gravity = { x: 0, y: -9.8 }
    addGround(s, { top: 0, left: -3, right: 3 })
    addBody(s, { name: 'table', kind: 'static', shape: { type: 'box', width: 1, height: 0.8 }, position: { x: -0.5, y: 0.4 }, material: { muS: 0.2, muK: 0.2 } })
    addBody(s, { name: 'block', shape: { type: 'box', width: 0.2, height: 0.1 }, position: { x: -0.5, y: 0.85 }, velocity: { x: 2, y: 0 }, mass: 1, material: { muS: 0.2, muK: 0.2 } })
    s.settings.duration = 1.5
    out.edge = { scene: s, hash: '596b7fb6f7ff400cc4d9434725915158e5c46fab834fd193ef557f18bbbd1fcb' }
  }
  {
    const s = emptyScene('spring2')
    s.settings.gravity = { x: 0, y: -9.8 }
    addGround(s, { top: 0, material: { muS: 0.3, muK: 0.2 } })
    const a = addBody(s, { name: 'a', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 0.1 }, mass: 1, velocity: { x: -1, y: 0 }, material: { muS: 0.3, muK: 0.2 } })
    const b = addBody(s, { name: 'b', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0.7, y: 0.1 }, mass: 2, velocity: { x: 1, y: 0 }, material: { muS: 0.3, muK: 0.2 } })
    addConnector<SpringDef>(s, { name: 'k', type: 'spring', a: anchor(a, { x: 0.1, y: 0 }), b: anchor(b, { x: -0.1, y: 0 }), stiffness: 40, restLength: null, damping: 0 })
    s.settings.duration = 4
    out.spring2 = { scene: s, hash: '80348bded52c5e5b3642766932cfe2d8d4c7fac3d8ee98fb43778f27c3e1df3e' }
  }
  return out
}

describe('26.48 recordings are reproduced bit-identically', () => {
  for (const [id, hash] of Object.entries(TEMPLATE_HASHES)) {
    it(`template ${id}`, () => {
      expect(simulate(buildTemplate(id, { g: 9.8 })).hash).toBe(hash)
    })
  }
  for (const [id, c] of Object.entries(handBuilt())) {
    it(`scene ${id}`, () => {
      expect(simulate(c.scene).hash).toBe(c.hash)
    })
  }
})
